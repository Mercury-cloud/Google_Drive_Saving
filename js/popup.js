var storage;
var rotationInterval;
var inWidget = location.href.includes("source=widget");
var displayedFiles;
var breadcrumbs = [];
var lastFilesModified = [];
var MY_DRIVE_ROOT = { name: getMessage("myDrive"), isMyDriveRoot: true };
var TEAM_DRIVES_ROOT = { name: getMessage("teamDrives"), isTeamDrivesRoot: true };
var SHARED_WITH_ME_ROOT = { name: getMessage("sharedWithMe"), isSharedWithMeRoot: true };
var fromToolbar = true;

async function afterAcccessGranted() {
	storage = await getStorage();
    console.log("afterAcccessGranted");
    displayQuickAccess();
    
    if (storage.get("lastCommand") == "googlePhotos") {
        $("#googlePhotos").click();
    } else {
        displayFiles(storage.get("files"), {action:storage.get("leftNavItemActive")});
        hideLoading();
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async function() {
        storage = await getStorage();
        if (message.action == "accessGranted") {
            afterAcccessGranted();
            sendResponse();
        }
    }());
	// return true to indicate you wish to send a response asynchronously (this will keep the message channel open to the other end until sendResponse is called)
	return true;
});

function showLoading(noFading) {
	$("#loading-spinner").removeAttr("hidden");
	if (!noFading) {
		$("#files").css("opacity", 0.5);
	}
}

function hideLoading() {
	$("#loading-spinner").attr("hidden", "");
	$("#files").css("opacity", 1);
}

function removeFile(files, file, action, $item) {
	files.splice(file.indexInArray, 1);
	
	if (action != "search") {
		storage.set("files", files);
	}
	
	if (storage.get("leftNavItemActive") == "notifications") {
		var allFilesModified = storage.get("allFilesModified");
		if (allFilesModified.length) {
			allFilesModified.forEach(function(fileModified, fileModifiedIndex) {
				if (fileModified.id == file.id) {
					allFilesModified.splice(fileModifiedIndex, 1);
					return true;
				}
			});
			storage.set("allFilesModified", allFilesModified);
		}
	}
	
	$item.slideUp();
}

async function openFolder(file) {
    await performCommand({
        lastCommand: "openFolder",
        lastFile: file,
        orderBy: SORT_BY_NAME
    });
    hideQuickAccess();
}

function showFileContextMenu(file, $fileDiv, rightAlign) {
	// To prevent the default context menu I use the code at the top of this page ... document.addEventListener("contextmenu")
	var $contextMenu = initTemplate("fileContextMenuTemplate");

	$("#copyFileLink").off().on("click", function() {
		var file = $("#fileContextMenu").data("file");
		$("#hiddenText")
			.val(file.webViewLink)
			.focus()
			.select()
		;
		document.execCommand('Copy');
		showMessage(getMessage("copied"));
		$("#fileContextMenu").hide();
	});

	$("#getShareableLink").off().on("click", function() {
		var file = $("#fileContextMenu").data("file");
		
		showLoading();
		enableShareableLink(file.id).then(data => {
			$("#hiddenText")
				.val(file.webViewLink)
				.focus()
				.select()
			;
			document.execCommand('Copy');
			showMessage(getMessage("copied"));
		}).catch(error => {
			showError(error);
		}).then(() => {
			$("#fileContextMenu").hide();
			hideLoading();
		});
	});

	if (/recent|starred|sharedWithMe|notifications/.test(storage.get("leftNavItemActive"))) {
		$("#locate").unhide();
	} else {
		$("#locate").attr("hidden", true);
	}

	$("#locate").off().on("click", function() {
		var file = $("#fileContextMenu").data("file");
		locateFile(file.id);
	});	
	
	$("#rename").off().on("click", () => {
		var file = $("#fileContextMenu").data("file");
		
		var $dialog = initTemplate("renameDialogTemplate");
		$dialog.find("#renameInput")
			.off()
			.keydown(function(e) {
				if (e.key == 'Enter' && !e.originalEvent.isComposing) {
					$dialog.find("[dialog-confirm]").click();
				}
			})
		;
		
		$dialog.find("#renameInput")[0].value = file.name;
		
		openDialog($dialog).then(response => {
			if (response == "ok") {
				showLoading();
				
				driveAPISend({
                    type: "patch",
                    url: "files/" + file.id + "?supportsTeamDrives=true",
                    data: {
                        name: $("#renameInput")[0].value
                    }
                }).then(data => {
					file.name = $("#renameInput")[0].value;
					$fileDiv.find(".fileName").text(file.name);
					
					// update file in cache
					displayedFiles[file.indexInArray] = file;
					storage.set("files", displayedFiles);
					
					showMessage(getMessage("fileRenamed"));
				}).catch(error => {
					showError(error);
				}).then(() => {
					hideLoading();
				});
			}
		});

		setTimeout(function() {
			// polymer way to highlight text
			$dialog.find("#renameInput")[0].inputElement.inputElement.select();
		}, 150);
	});

	if (file.mimeType == MIME_TYPE_FOLDER) {
		$("#screenshotFolderSep").unhide();
		$("#screenshotFolder").unhide();
	} else {
		$("#screenshotFolderSep").attr("hidden", true);
		$("#screenshotFolder").attr("hidden", true);
	}

	$("#screenshotFolder").off().on("click", function () {
		var file = $("#fileContextMenu").data("file");
		storage.set("screenshotFolderId", file.id);
		showMessage(getMessage("done"));
	});

	if (file.spaces && file.spaces.includes("photos")) {
		$("#delete").attr("hidden", true);
	} else {
		$("#delete").unhide();
	}
	
	$("#delete").off().on("click", function() {
		var file = $("#fileContextMenu").data("file");
		
		if (file.ownedByMe || file.teamDriveId) {
			var $item = $("#fileContextMenu").data("item");
			showLoading();
			driveAPISend({
                type: "patch",
                url: "files/" + file.id + "?supportsTeamDrives=true",
                data: {
                    trashed: true
                }
            }).then(data => {
				removeFile(displayedFiles, file, "delete", $item);
				showMessage(getMessage("removed"));
			}).catch(error => {
				showError(error);
			}).then(() => {
				hideLoading();
			});
			$("#fileContextMenu").hide();			
		} else {
			showError("Since you don't own this file, this extension cannot remove this file, use the website instead.", {
				onClick: function() {
					locateFile(file.id);
				},
				text: getMessage("openDrive")
			});
		}
	});
	
	$("#markAsViewed").off().on("click", async () => {
		var file = $("#fileContextMenu").data("file");
		var $item = $("#fileContextMenu").data("item");
		var data = {viewedByMeTime:new Date().toJSON()};

		showLoading();

		//driveAPISend({type:"patch", url: "files/" + file.id + "?fields=viewedByMeTime", data:data}).then(data => {
			$item.removeClass("unviewed");
			
			// must perform this before fetchFiles because fetchFiles might async update of allFilesModified and override the change below
			file.viewedByMeTime = new Date();
			// sync the modified files with those that are found in the recent file fetch
			
			var allFilesModified = storage.get("allFilesModified");
			if (allFilesModified.length) {
				allFilesModified.forEach(function(fileModified, fileModifiedIndex) {
					if (fileModified.id == file.id) {
						allFilesModified[fileModifiedIndex] = file;
						return true;
					}
				});
				storage.set("allFilesModified", allFilesModified);
			}
			
			// update files
			await fetchFiles();
		//}).catch(error => {
			//showError(error);
		//}).then(() => {
			hideLoading();
		//});
		$("#fileContextMenu").hide();
	});

	if ($fileDiv.hasClass("unviewed")) {
		$("#markAsViewed").show();
	} else {
		$("#markAsViewed").hide();
	}
	
	if (storage.get("desktopNotifications") == "none") {
		$("#mute").hide();
		$("#unmute").hide();
	} else {
		if (isFileMuted(storage, file)) {
			$("#mute").hide();
			$("#unmute").show();
		} else {
			$("#mute").show();
			$("#unmute").hide();
		}
		
		$("#mute").off().on("click", function() {
			muteFile(file, storage);
			showMessage(getMessage("fileMuted"));
		});

		$("#unmute").off().on("click", function() {
			unmuteFile(file, storage);
			showMessage(getMessage("fileUnmuted"));
		});
	}

	if (file.starred) {
		$("#addStar").attr("hidden", "");
		$("#removeStar").removeAttr("hidden");
	} else {
		$("#addStar").removeAttr("hidden");
		$("#removeStar").attr("hidden", "");
	}
	
	$("#addStar").off().on("click", function() {
		var file = $("#fileContextMenu").data("file");
		var $item = $("#fileContextMenu").data("item");
		showLoading();

		driveAPISend({
            type: "patch",
            url: "files/" + file.id + "?supportsTeamDrives=true",
            data: {
                starred: true
            }
        }).then(data => {
			file.starred = true;
			showMessage(getMessage("starAdded"));
			// update files
			return fetchFiles();
		}).catch(error => {
			showError(error);
		}).then(() => {
			hideLoading();
			displayQuickAccess(true);
		});
	});

	$("#removeStar").off().on("click", function() {
		var file = $("#fileContextMenu").data("file");
		var $item = $("#fileContextMenu").data("item");
		showLoading();

		driveAPISend({
            type: "patch",
            url: "files/" + file.id + "?supportsTeamDrives=true",
            data: {
                starred: false
            }
        }).then(data => {
			file.starred = false;
			showMessage(getMessage("starRemoved"));
			
			if (storage.get("leftNavItemActive") == "starred") {
				$item.slideUp();
			}
			
			// update files
			return fetchFiles();
		}).catch(error => {
			showError(error);
		}).then(() => {
			hideLoading();
			displayQuickAccess(true);
		});
	});
	
	$contextMenu
		.data("file", file)
		.data("item", $fileDiv)
		.show()
	;
	
	var y = window.mousePosition.y;
	var BUFFER = 20;
	
	if ($contextMenu.height() + y > $(window).height()) {
		y = $(window).height() - $contextMenu.height() - BUFFER;
	}

	var css;
	if (rightAlign) {
		css = {left:window.mousePosition.x - $contextMenu.width(), top:y}
	} else {
		css = {left:window.mousePosition.x, top:y}
	}
	$contextMenu.css(css);

}

function setIconLink($icon, file) {
	$icon
		.addClass("driveIcon")
	;
	if (file.backgroundImageLink) {
		$icon.attr("src", file.backgroundImageLink.replace(/\=w.*/, "\=w16\-h16\-fcrop64\=1\,3e9a00005b67ffff"));
	} else {
		$icon.attr("src", file.iconLink);
	}
}

function addFile(files, index, $filesDiv, params) {
	var file = files[index];
	if (!params.quickAccess && storage.get("leftNavItemActive") == "googlePhotos") {
		var $photoDiv = $("<div class='googlePhotoWrapper'><iron-image class='googlePhoto' sizing='cover'></iron-image></div>");
		if (file.thumbnailLink) {
			$photoDiv.find(".googlePhoto").attr("src", file.thumbnailLink.replace(/\=s\d+/, "\=s" + "200"));
		}
		$photoDiv.click(function (e) {
			var url = file.webViewLink;
			openDriveUrl(url);
		});
		$filesDiv.append($photoDiv);
	} else {
		file.indexInArray = index;
		//console.log("file: ", file);

		//var fileInfo = getIconInfoFromFile(file);

		const modifiedTime = new Date(file.modifiedTime);
		var dateStr;
		if (modifiedTime.isToday()) {
			dateStr = modifiedTime.toLocaleTimeString();
		} else if (modifiedTime.isCurrentYear()) {
            dateStr = modifiedTime.toLocaleDateString("default", {
                month: "short",
                day: "numeric"
            });
		} else {
			dateStr = modifiedTime.toLocaleDateString("default", {
                month: "short",
                day: "numeric",
                year: "numeric"
            });
		}

		$.each(files, function (index, folder) {
			if (folder && file.parents && file.parents.length && folder.id == file.parents[0]) {
				file.folderName = folder.name;
				return false;
			}
		});

		var folderName = "";
		if (file.folderName) {
			folderName = file.folderName;
		}

		var $fileDiv;
		var itemIconAndName = "<iron-icon class='icon'></iron-icon> <span class='fileName'></span>";
		var itemDetails = "<span class='owner'></span> <span class='lastModifiedTimeAndUser'><span class='date'></span> <span class='lastModifiedUser'></span></span> <paper-icon-button class='more' icon='more-vert'></paper-icon-button> <paper-icon-button class='notification' icon='social:notifications'></paper-icon-button> <paper-icon-button class='markNotificationAsViewed' icon='done'></paper-icon-button>";
		if (params.quickAccess) {
			$fileDiv = $("<paper-button class='item' raised>" + itemIconAndName + "</paper-button>");
		} else {
			$fileDiv = $("<div class='item' draggable='true'>" + itemIconAndName + " " + itemDetails + "</div>");
		}


		$fileDiv.find(".notification").attr("title", getMessage("notifications"));
		$fileDiv.find(".markNotificationAsViewed")
			.attr("title", getMessage("markNotificationAsViewed"))
			.click(function () {
				var allFilesModified = storage.get("allFilesModified");
				if (allFilesModified.length) {
					allFilesModified.forEach(function (fileModified, fileModifiedIndex) {
						if (fileModified.id == file.id) {
							allFilesModified.splice(fileModifiedIndex, 1);
							return true;
						}
					});
					storage.set("allFilesModified", allFilesModified);
				}
				$fileDiv.slideUp("fast");
			})
			;

		var $icon = $fileDiv.find(".icon");
		if (file.mimeType == MIME_TYPE_FOLDER) {
			if (file.shared) {
				$icon.attr("icon", "folder-shared");
			} else {
				$icon.attr("icon", "folder");
			}

			if (file.folderColorRgb) {
				$icon.css("fill", file.folderColorRgb);
			}
		} else {
            if (file.thumbnailLink
                && (file.mimeType.includes("image/")
                || file.mimeType.includes("video/"))) {
				$icon
					.addClass("thumbnail")
					.attr("src", file.thumbnailLink.replace(/\=s\d+/, "\=s" + "60")) // change =s220 > =60
					;

				setTimeout(() => {
					getShadowRoot($icon).find("img").on("error", error => {
						// remove class for alignment issues because error image is 16x16
						$icon.removeClass("thumbnail");
						setIconLink($icon, file);
					});
				}, 1);
			} else {
				setIconLink($icon, file);
			}
		}

		//console.log(file)

		var $fileName = $fileDiv.find(".fileName");
		$fileName.text(file.name);
		if (file.name.length > 30 || params.quickAccess) {
			$fileName.attr("title", file.name);
		}

		/*
		if (storage.showImagesInPopup && file.thumbnailLink && (file.mimeType.indexOf("image/") != -1 || file.mimeType.indexOf("video/") != -1 || file.mimeType == "application/vnd.google-apps.presentation" || file.mimeType == "application/vnd.google-apps.map" || file.mimeType.indexOf("spreadsheet") != -1 || file.mimeType.indexOf("pdf") != -1)) {
			$fileDiv.find(".titleToolTip img").attr("src", file.thumbnailLink);
		} else {
			$fileDiv.find(".titleToolTip").attr("hidden", "");
		}
		*/

		if (file.owners && file.owners.length >= 1) {
			var ownerStr;
			if (file.owners.first().me) {
				ownerStr = getMessage("me");
			} else {
				ownerStr = file.owners.first().displayName;
			}

			if (storage.get("leftNavItemActive") == "sharedWithMe") {
				if (file.owners.first().photoLink) {
					$fileDiv.find(".owner").append($("<img>", { src: file.owners.first().photoLink }), ownerStr);
				} else {
					$fileDiv.find(".owner").append($("<img>", { src: "images/empty.png" }), ownerStr);
				}
			} else {
				$fileDiv.find(".owner").text(ownerStr);
			}

		}

		if (storage.get("desktopNotifications") == "optIn" || storage.get("desktopNotifications") == "optOut") {
			if (hasNotification(file, storage, breadcrumbs)) {
				$fileDiv.addClass("hasNotification");
			}
		}

		if (file.lastModifyingUser) {
			var lastModifiedUser;
			if (file.lastModifyingUser.me) {
				lastModifiedUser = getMessage("me");
			} else {
				lastModifiedUser = file.lastModifyingUser.displayName;
			}
			$fileDiv.find(".lastModifiedUser")
				.text(lastModifiedUser)
				.attr("title", getMessage("lastModifiedBy") + " " + lastModifiedUser)
			;
		}

		if (file.modifiedTime) { // storage.get("leftNavItemActive") == "teamDrives"
			$fileDiv.find(".date")
				.text(dateStr)
				.attr("title", new Date(file.modifiedTime).toLocaleStringJ())
			;
		}

		$fileDiv.find(".more").click({ file: file }, function (e) {
			showFileContextMenu(file, $fileDiv, true);
			return false;
		});

		if (params.action == "recent" && file.mimeType == MIME_TYPE_FOLDER) {
			$fileDiv.css("display", "none");
		}

		$fileDiv.addClass(file.mimeType);

		if (params.lastNotificationsViewedTime && new Date(file.modifiedTime).getTime() > new Date(params.lastNotificationsViewedTime).getTime()) {
			$fileDiv.addClass("unviewed");
		}

		$fileDiv.data("file", file);
		let $clickablePart;
		if (params.quickAccess) {
			$clickablePart = $fileDiv;
		} else {
			$clickablePart = $fileDiv.find(".icon, .fileName");
		}
		$clickablePart.click({ file: file }, async function (e) {
			if (e.data.file.mimeType == MIME_TYPE_FOLDER || e.data.file.kind == DRIVE_KIND) {
				// must adjust breadcrumbs array before calling openFolder/displayFiles
				showLoading();
                if (lastAction == "search") {
                    let rootFolder;
                    if (storage.get("leftNavItemActive") == "sharedWithMe") {
                        rootFolder = SHARED_WITH_ME_ROOT;
                    } else if (storage.get("leftNavItemActive") == "teamDrives") {
                        rootFolder = TEAM_DRIVES_ROOT;
                    } else {
                        rootFolder = MY_DRIVE_ROOT;
                    }
                    breadcrumbs = [rootFolder];
					const parents = await getAllParents(e.data.file, true);
					console.log("parents---", parents)
                    if (parents.length) {
						breadcrumbs = breadcrumbs.concat(parents);
						console.log("breadcrumbs111---", breadcrumbs)
						
                    } else {
						if(breadcrumbs[breadcrumbs.length-1] != e.data.file) {
							breadcrumbs.push(e.data.file);
						}
						console.log("breadcrumbs222---", breadcrumbs)
                    }
                } else {
					if(breadcrumbs[breadcrumbs.length-1] != e.data.file) {
						breadcrumbs.push(e.data.file);
					}
					console.log("breadcrumbs333---", breadcrumbs)
				}
				

                await openFolder(e.data.file);
                generateBreadcrumbs();
			} else {
				e.data.file.viewedByMeTime = new Date();

				if (storage.get("leftNavItemActive") == "recent" || storage.get("leftNavItemActive") == "starred") {
					var fileToMovePosition = files.splice(e.data.file.indexInArray, 1);
					files.splice(0, 0, fileToMovePosition[0]);
					storage.set("files", files);
				}

				// make sure to also update viewedByMeTime in modifiedfiles
				if (storage.get("allFilesModified")) {
					storage.set("allFilesModified", storage.get("allFilesModified"));
				}
				console.log("clicked file-----------", e.data.file)
				var url = e.data.file.webViewLink;
				if (isCtrlPressed(e)) {
					chrome.tabs.create({ url: appendParams(url), active: false });
				} else {
					//openDriveUrl(url);
					getContentFromGoogleDriveUrl(e.data.file.webContentLink);
				}
			}
		});

		$fileDiv.on("mousedown", function (event) {
			if (event.which == 3) {
				showFileContextMenu(file, $fileDiv);
				return false;
			}
		});

		$filesDiv.append($fileDiv);
	}

	if (index + 1 >= storage.get("maxItemsToDisplay")) {
		$filesDiv.append($("<div style='padding:10px;color:gray'><span id='maxFilesReachedNote'>max files...</span> Increase the <a target='_blank' href='/options.html'>limit</a> or <a id='maxOpenDrive' href='#'>Open Drive</a></div>"));
		$filesDiv.find("#maxFilesReachedNote").text("Max files reached (" + storage.get("maxItemsToDisplay") + ")");
		$filesDiv.find("#maxOpenDrive").click(function () {
			$("#maximize").click();
		});
	}
}

function getContentFromGoogleDriveUrl(url){
	console.log("get html string from:", url);
	const req = new XMLHttpRequest();
	req.addEventListener("load", function(){
		const win = window.open('', '_blank');
		win.document.write(this.responseText);
	});
	req.open("GET", url);
	req.send();
}

function displayFiles(files, params) {
	return new Promise((resolve, reject) => {
		params = initUndefinedObject(params);
		window.lastAction = params.action;

		showLoading();
		
		setTimeout(function() {
			
			displayedFiles = files;
			
			var $filesDiv = $("#files");
			$filesDiv
				.empty()
				.scrollTop(0)
			;
			if (files && files.length) {

				var index = 0;
				for (var index=0; index<files.length && index<20; index++) {
					addFile(files, index, $filesDiv, params); // index, files[index]
				}

				$filesDiv.on("scroll", function(e) {
					if (e.target.scrollTop > e.target.scrollHeight - e.target.clientHeight - 50) {
						$filesDiv.off("scroll");
						showLoading(true);
						setTimeout(function() {
							getStorage().then(thisStorage => {
								storage = thisStorage;
								let theseFiles = storage.get("files");
								for (; index < theseFiles.length; index++) {
									addFile(theseFiles, index, $filesDiv, params);
								}
								hideLoading();
							});
						}, 1);
					}
				});
			} else {
				var $noFiles = $("<div id='noFiles'/>");
				$noFiles.text(getMessage("noFiles"));
				
				if (storage.get("leftNavItemActive") != "notifications") {
					var $reloadFilesNode = $("<paper-button raised style='background-color:#eee;;margin-left:15px;vertical-align:middle'><iron-icon icon='refresh'></iron-icon><span id='refreshText'/></paper-button>");
					$reloadFilesNode.find("#refreshText").text(getMessage("refresh"));
					$reloadFilesNode.click(function() {
						$("#refresh").click();
					});
					$noFiles.append($reloadFilesNode);
				}
				
				$filesDiv.append($noFiles);
			}
			
			$("#filesSortingHeader").toggleClass("simulateScrollbar", $filesDiv.hasVerticalScrollbar());
			
			hideLoading();
			resolve();
		}, 1);
	});
}

function displaySavedPages() {
	
}

async function searchFiles(searchStr) {
    generateBreadcrumbs("search");
    
    showLoading();
    try {
        const data = await driveAPISend({
            url: "files",
            data: {
                pageSize: storage.get("maxItemsToDisplay"),
                q: " trashed = false and fullText contains '" + searchStr.replace(/'/g, '"') + "'",
                fields: "files",
                includeTeamDriveItems: true,
                supportsTeamDrives: true
            }
        });
        console.log("result", data);
        var files = data.files;
        files.sort(function(a, b) {
            if (!a.viewedByMeTime) {
                a.viewedByMeTime = OLD_DATE_STR;
            }
            if (!b.viewedByMeTime) {
                b.viewedByMeTime = OLD_DATE_STR;
            }
            if (a.viewedByMeTime < b.viewedByMeTime) {
                return +1;
            } else {
                return -1;
            }
        });
        return files;
    } finally {
        hideLoading();
    }
}

function performCommand(params) {
	return new Promise((resolve, reject) => {
		showLoading();
		
		storage.set("lastCommand", params.lastCommand);
		
		if (params.lastFile) {
			storage.set("lastFile", params.lastFile);
		}
		if (params.q) {
			storage.set("q", params.q);
		}
		if (params.orderBy) {
			storage.set("orderBy", params.orderBy);
		}
		
		port = chrome.runtime.connect();
		port.postMessage({action:"performCommand", params:params});
		port.onMessage.addListener(message => {
			hideLoading();
			console.log("response", message);
			if (message.error) {
				message.error = JSON.parse(message.error);
				// recreate error object here, FYI using .textMessage instead of error object's usual .message because it was disapparing in transit
				var errorObj = new Error(message.error.textMessage);
				copyObj(message.error, errorObj);
                console.log("errorobj", errorObj);
				if (message.error.textMessage == "invalid_grant" || errorObj.code == 401 || errorObj.code == 403) {
					// legacy because originally i only gave file permissions not photo permissions

					var requestPermissionsParams = {};
					var googlePhotosError = errorObj.code == 403 && lastCommand == "googlePhotos";
					if (googlePhotosError) {
						requestPermissionsParams.googlePhotos = true;
					} else {
						console.log("errorobj", errorObj);
						showError(errorObj);
					}
					requestPermissionsParams.lastCommand = params.lastCommand;
					openPermissionsDialog(requestPermissionsParams).then(() => {
						afterAcccessGranted();
					});
				} else if (errorObj.code == 500) {
					showError(errorObj);
				} else if (errorObj.code == 0) {
					showError("Might be offline try again later.");
				} else {
					console.log("message error", errorObj);
					showError(errorObj, {
						onClick: function() {
							openPermissionsDialog().then(() => {
								afterAcccessGranted();
							});
						},
						text: getMessage("grantAccess")
					});
				}
				reject(errorObj);
			} else {
				resolve(message);
			}
		});
	}).then(message => {
		return displayFiles(message.files, {action:params.lastCommand});
	});
}

function generateBreadcrumbs(action) {
	
	function setStaticBreadcrumbTitle(title) {
		var $breadcrumb = $("<span class='breadcrumb'></span>");
		$breadcrumb
			.text(title)
			.addClass("active")
		;
		$("#breadcrumbWrapper").empty().append($breadcrumb).show();
	}
	
	var leftNavItem = storage.get("leftNavItemActive");

	var rootFolder;
	
	if (action == "search") {
		setStaticBreadcrumbTitle("Search");
		return;
	} else if (leftNavItem == "myDrive") {
		rootFolder = MY_DRIVE_ROOT;
		$("#breadcrumbWrapper").show();
	} else if (leftNavItem == "teamDrives") {
		rootFolder = TEAM_DRIVES_ROOT;
		$("#breadcrumbWrapper").show();
	} else if (leftNavItem == "sharedWithMe") {
		rootFolder = SHARED_WITH_ME_ROOT;
		$("#breadcrumbWrapper").show();
	} else if (leftNavItem == "googlePhotos") {
		setStaticBreadcrumbTitle(getMessage("googlePhotos"));
		return;
	} else if (leftNavItem == "recent") {
		setStaticBreadcrumbTitle(getMessage("recent"));
		return;
	} else if (leftNavItem == "starred") {
		setStaticBreadcrumbTitle(getMessage("starred"));
		return;
	} else if (leftNavItem == "notifications") {
		setStaticBreadcrumbTitle(getMessage("notifications"));
		return;
	}
	
	if (breadcrumbs.length == 0) {
		if (storage.get("breadcrumbs")) {
			breadcrumbs = storage.get("breadcrumbs");
		} else {
			breadcrumbs.push(rootFolder);
		}
	}
	
	$("#breadcrumbWrapper").empty();
	breadcrumbs.forEach(function(breadcrumb, index) {
		var $sep = $("<svg x='0px' y='0px' width='20px' height='10px' viewBox='0 0 20 20' focusable='false'><polygon fill='#000000' points='14,10 8,16 6.5,14.5 11,10 6.5,5.5 8,4 '></polygon></svg>");
		var $breadcrumb = $("<span class='breadcrumb'></span>");
		$breadcrumb.data("folder", breadcrumb);
		$breadcrumb.data("index", index);
		
		$breadcrumb.click(function() {
			var folder = $(this).data("folder");
			var breadcrumbIndex = $(this).data("index");
			if (folder.isMyDriveRoot) {
				$("#myDrive").click();
			} else if (folder.isTeamDrivesRoot) {
				$("#teamDrives").click();
			} else if (folder.isSharedWithMeRoot) {
				$("#sharedWithMe").click();
			} else {
				// must adjust breadcrumbs array before openFolder/displayFiles
				breadcrumbs = breadcrumbs.slice(0, breadcrumbIndex+1);
				openFolder(folder).then(() => {
					generateBreadcrumbs();
				});
			}
		});
		$breadcrumb.text(breadcrumb.name);
		
		if (index != 0) {
			$("#breadcrumbWrapper").append( $sep );
		}
		
		// bold last item
		if (index == breadcrumbs.length-1) {
			$breadcrumb.addClass("active");
		}
		
		$("#breadcrumbWrapper").append( $breadcrumb );
	});

	storage.set("breadcrumbs", breadcrumbs);
}

async function displayQuickAccess(refresh) {
	// init quick access, testing params viewedByMeTime desc
    var files = storage.get("quickAccessFiles");
    if (refresh || !files) {
        const data = await driveAPISend({
            url: "files",
            data: {
                q: "starred = true and trashed = false",
                orderBy: "recency desc",
                fields: "files",
                pageSize: 50,
                includeTeamDriveItems: true,
                supportsTeamDrives: true
            }
        });
        console.log("quickaccess", data);
        files = data.files;
        storage.set("quickAccessFiles", files);
    }

    var $quickAccess = $("#quickAccess");
    let quickAccessDiv = $quickAccess[0];

    if (files.length) {
        $quickAccess.empty();
        files.forEach((file, index) => {
            addFile(files, index, $quickAccess, { quickAccess: true });
        });
        $quickAccess.append($("<div style='padding-right:1px'>"));

        $("#quickAccessWrapper").unhide();

        let QUICK_ACCESS_BUFFER = 100;

        console.log(quickAccessDiv.scrollWidth + " _ " + $quickAccess.width());
        if (quickAccessDiv.scrollWidth <= $quickAccess.width()) {
            $("#quickAccessNext").hide();
        }

        $("#quickAccessPrev").off().click(function () {
            $quickAccess.animate({
                scrollLeft: quickAccessDiv.scrollLeft - $quickAccess.width() + QUICK_ACCESS_BUFFER
            }, 500, () => {
                if (quickAccessDiv.scrollLeft <= 0) {
                    $("#quickAccessPrev").attr("disabled", true);
                }
                if (quickAccessDiv.scrollLeft < quickAccessDiv.scrollWidth) {
                    $("#quickAccessNext").attr("disabled", false);
                }
            });
        });

        $("#quickAccessNext").off().click(function () {
            $quickAccess.animate({
                scrollLeft: quickAccessDiv.scrollLeft + $quickAccess.width() - QUICK_ACCESS_BUFFER
            }, 500, () => {
                $("#quickAccessPrev")
                    .unhide()
                    .attr("disabled", false)
                    ;
                if (quickAccessDiv.scrollLeft >= quickAccessDiv.scrollWidth - $quickAccess.width() - QUICK_ACCESS_BUFFER) {
                    $("#quickAccessNext").attr("disabled", true);
                }
            });
        });
    } else {
        hideQuickAccess();
    }
}

function hideQuickAccess() {
	console.log("hideQuickAccess")
	$("#quickAccessWrapper").hide();
	setFilesHeight(true);
}

function displayNotifications() {
	lastFilesModified.sort(function(a, b) {
		if (!a.modifiedTime) {
			a.modifiedTime = OLD_DATE_STR;
		}
		if (!b.modifiedTime) {
			b.modifiedTime = OLD_DATE_STR;
		}
		if (a.modifiedTime < b.modifiedTime) {
			return +1;
		} else {
			return -1;
		}
	});
	
	displayFiles(lastFilesModified, {lastNotificationsViewedTime:storage.get("lastNotificationsViewedTime")});
	
	// save opened time
	storage.set("lastNotificationsViewedTime", storage.get("lastChangeFetchTime"));
	
	chrome.browserAction.setBadgeText({text:""});
	chrome.browserAction.setTitle({title:""});
}

function generateParentId() {
	var currentFolder = getCurrentFolder(storage);
	
	var parentFolderId;
	if (currentFolder) {
		parentFolderId = currentFolder.id;
	} else {
		parentFolderId = "root";
	}
	
	return parentFolderId;
}

function initNotificationsMenu(unreadCount) {
	if (unreadCount) {
		$("#notificationsText").text( getMessage("notifications") + " (" + unreadCount + ")" );
		$("#notifications").addClass("unread");
	} else {
		$("#notificationsText").text( getMessage("notifications") );
		$("#notifications").removeClass("unread");
	}
}

function setFilesHeight(whileBrowsing) {
	console.log("height: " + $("body").height() + " " + $("#files").position().top)

	let BUFFER = whileBrowsing ? 0 : 17; // seems this buffer depends on a timing issue with rendering
	var filesHeight = $("body").height() - $("#files").offset().top - BUFFER - 5;

	getZoomFactor().then(zoomFactor => {
		var newHeight = (filesHeight / zoomFactor);
		if (zoomFactor >= 1.25) {
			newHeight -= 20;
		}
		$("#files").css({ height: newHeight + "px", "max-height": newHeight + "px" }); // , "max-height":filesHeight + "px"
	});
}

$(document).ready(function() {

    (async () => {
    
        await polymerPromise;

		document.addEventListener("contextmenu", function(e) {
			console.log("contextmenu", e.target);
			if ($(e.target).closest("#fileContextMenu").length) {
				e.preventDefault();
			}
		});
		
		// time need for widget to get true height
		await pageVisible;
        setFilesHeight();
		
		/*
		// Mac issue: window would load very small when user loaded first time from standby etc. 
		setTimeout(function() {
			if (document.body.clientWidth < 100) {
				console.log("mac issue detected, resizing window manually");
				$("body").css({width:"800px", height:"600px"});
			}
		}, 1000);
		*/

		if (inWidget) {
			$("html").addClass("widget");
		}		
		
		$("#refresh").click(function() {
			getStorage().then(thisStorage => {
				storage = thisStorage;

				displayQuickAccess(true);

				var params = {};
				params.lastCommand = storage.get("lastCommand");
				if (params.lastCommand == "openFolder") {
					params.lastFile = storage.get("lastFile");
				}
				params.q = storage.get("q");
				params.orderBy = storage.get("orderBy");
				
				performCommand(params);
			});
		});

		$("#markAllNotificationsAsViewed").click(function() {
			storage.remove("allFilesModified");
			$("#files .item").slideUp("fast");
			initNotificationsMenu(0);
			$(this).css("opacity", "0");
		});
		
		$("#menu, #closeDrawer").click(function() {
			$("#drawerPanel")[0].toggle();
		});

		$("#title, #mainTitle").click(function() {
			openDriveUrl(DRIVE_DOMAIN);
			return false;
		})
		
		$("#back").click(function() {
			$("html").removeClass("searchInputVisible");
		});

		$("#searchButton").click(function() {
			$("html").addClass("searchInputVisible");
			$("#searchInput").focus();
		});
		
		$("#searchInput").blur(function() {
			$("html").removeClass("searchInputVisible");
		});
		
		$("#searchInput").keydown(function(e) {
			if (e.key == 'Enter' && !e.originalEvent.isComposing) {
				var $selectedItem = $(".item.selected");
				if ($selectedItem.length) {
					$selectedItem.find(".fileName").click();
				} else {
					searchFiles($(this).val()).then(files => {
						displayFiles(files, {action:"search"});
					}).catch(error => {
						showError(error);
					});
				}
			} else if (e.key == "Escape") {
				$("html").removeClass("searchInputVisible");
			}
		});

		$("#newFolder").click(function() {
			
			var $dialog = initTemplate("newFolderDialogTemplate");
			$dialog.find("#newFolderInput")
				.off()
				.keydown(function(e) {
					if (e.key == 'Enter' && !e.originalEvent.isComposing) {
						//updateAlias($dialog.find("#newAlias")[0].value);
						$dialog.find("[dialog-confirm]").click();
						//$dialog[0].close();
					}
				})
			;
			
			$dialog.find("#newFolderInput")[0].value = "";
			
			openDialog($dialog).then(function(response) {
				if (response == "ok") {
					showLoading();
					
					var data = {
						name: $("#newFolderInput")[0].value,
						parents: [generateParentId()],
						mimeType: MIME_TYPE_FOLDER
					}
					
					driveAPISend({type:"POST", url: "files", data:data}).then(data => {
						$("#refresh").click();
					}).catch(error => {
						showError(error);
					});
				}
			});

		});

		$("#newFile").click(function() {
			var width = 500;
			var height = 300;
			
			// enlarge if using zoom
			width *= window.devicePixelRatio;
			height *= window.devicePixelRatio;
			
			var left = (screen.width/2)-(width/2);
			var top = (screen.height/2)-(height/2);
			
			chrome.windows.getCurrent(windowResponse => {
				// temp
				console.log("windowResponse", windowResponse);
				localStorage._currentWindowId = windowResponse.id;
				chrome.windows.create({url: chrome.runtime.getURL("uploadFile.html?parentId=" + encodeURIComponent(generateParentId())), width:Math.round(width), height:Math.round(height), left:Math.round(left), top:Math.round(top), type:"popup", state:"normal"}, function(windowResponse) {
					// patch for Firefox which could not use window.close inside upload file
					localStorage._uploadWindowId = windowResponse.id;
					//window.close();
				});
			});
		});

		$("#savePage").click(function() {
			chrome.runtime.sendMessage({ type: "pageSaveRequest" , parentId: encodeURIComponent(generateParentId())});
			showLoading();
		});

		// $("#newDoc").click(function() {
		// 	openDriveUrl("https://docs.google.com/document/create");
		// });

		// $("#newSheet").click(function() {
		// 	openDriveUrl("https://docs.google.com/spreadsheets/create");
		// });

		// $("#newSlide").click(function() {
		// 	openDriveUrl("https://docs.google.com/presentation/create");
		// });
		
		function processNavItem(leftNavItemNode, params) {
			var $leftNavItemActive = $(leftNavItemNode);
			
			storage.set("leftNavItemActive", $leftNavItemActive.attr("id"));
			
			var resetBreadcrumbs = params.lastCommand == "myDrive" || params.lastCommand == "teamDrives" || params.lastCommand == "sharedWithMe";
			if (resetBreadcrumbs) {
				breadcrumbs = [];
			}
			performCommand(params).then(() => {
				hideQuickAccess();
				
				if (resetBreadcrumbs) {
					storage.remove("breadcrumbs");
				}
				selectedActiveNav($leftNavItemActive);
			});
		}

		function selectedActiveNav($leftNavItemActive) {
			$("html").attr("leftNavItem", storage.get("leftNavItemActive"));
			$("#leftNav paper-item").removeClass("active");
			$leftNavItemActive.addClass("active");
			
			generateBreadcrumbs();
			
			sendGA("leftNavItem", $leftNavItemActive.attr("id"));
		}

		// left nav items
		$("#myDrive").click(function() {
			var params = {};
			params.lastCommand = "myDrive";
			params.orderBy = SORT_BY_NAME;
			processNavItem(this, params);
		});


		$("#teamDrives").click(function () {
			var params = {};
			params.lastCommand = "teamDrives";
			processNavItem(this, params);
		});

		$("#sharedWithMe").click(function() {
			var params = {};
			params.lastCommand = "sharedWithMe";
			params.orderBy = "sharedWithMeTime desc";
			processNavItem(this, params);
		});

		$("#googlePhotos").click(function() {
			var params = {};
			params.lastCommand = "googlePhotos";
			params.spaces = "photos";
			params.orderBy = "createdTime desc";
			processNavItem(this, params);
		});

		$("#recent").click(function() {
			var params = {};
			params.lastCommand = "recent";
			processNavItem(this, params);
		});

		$("#starred").click(function() {
			var params = {};
			params.lastCommand = "starred";
			processNavItem(this, params);
		});

		$("#notifications").click(function() {
			var $leftNavItemActive = $(this);
			storage.set("leftNavItemActive", $leftNavItemActive.attr("id"));
			
			selectedActiveNav($leftNavItemActive);
			
			displayNotifications();
		});
		
		$("#maximize").click(function() {
			var lastCommand = storage.get("lastCommand");
			
			if (lastCommand == "myDrive") {
				openDriveUrl(DRIVE_DOMAIN + "drive/my-drive")
			} else if (lastCommand == "teamDrives") {
				openDriveUrl(DRIVE_DOMAIN + "drive/team-drives")
			} else if (lastCommand == "sharedWithMe") {
				openDriveUrl(DRIVE_DOMAIN + "drive/shared-with-me")
			} else if (lastCommand == "starred") {
				openDriveUrl(DRIVE_DOMAIN + "drive/starred")
			} else if (lastCommand == "recent") {
				openDriveUrl(DRIVE_DOMAIN + "drive/recent")
			} else if (lastCommand == "openFolder") {
				var url;
				if (storage.get("lastFile")) {
					try {
						url = storage.get("lastFile").webViewLink;
					} catch (e) {
						console.error("could not parse lastFile: " + e);
					}
				}
				
				if (!url) {
					url = DRIVE_DOMAIN;
				}
				openDriveUrl(url);
			} else {
				openDriveUrl(DRIVE_DOMAIN)
			}
			window.close();
		});

		$("#optionsMenuButton").click(() => {
			let $optionsMenu = initTemplate("optionsMenuTemplate");

			$optionsMenu.find(".options").off().on("click", () => {
				openUrl("options.html?ref=DriveCheckerOptionsMenu");
			});
			
			$optionsMenu.find(".changelog").off().on("click", () => {
				openUrl("https://jasonsavard.com/wiki/Checker_Plus_for_Google_Drive_changelog?ref=DriveCheckerOptionsMenu");
			});

			$optionsMenu.find(".contribute").off().on("click", () => {
				openUrl("contribute.html?ref=DriveOptions");
			});

			$optionsMenu.find(".discoverMyApps").off().on("click", () => {
				openUrl("https://jasonsavard.com?ref=DriveCheckerOptionsMenu");
			});

			$optionsMenu.find(".aboutMe").off().on("click", () => {
				openUrl("https://jasonsavard.com/about?ref=DriveCheckerOptionsMenu");
			});

			$optionsMenu.find(".help").off().on("click", () => {
				openUrl("https://jasonsavard.com/forum/categories/checker-plus-for-google-drive-feedback");
			});

		});
		
		$(".close").click(function() {
			window.close();
		});
		
		function canBeSorted() {
			return !storage.get("leftNavItemActive") || storage.get("leftNavItemActive") == "myDrive";
		}
		
		// sorting header
		var $filesSortingHeader = $("#filesSortingHeader");
		$filesSortingHeader.find(".fileName")
			.text(getMessage("name"))
			.off()
			.on("click", function() {
				if (canBeSorted()) {
					var orderBy = storage.get("orderBy");
					if (orderBy == SORT_BY_NAME_DESC || orderBy == SORT_BY_MODIFIED_TIME || orderBy == SORT_BY_MODIFIED_TIME_DESC) {
						orderBy = SORT_BY_NAME;
					} else {
						orderBy = SORT_BY_NAME_DESC;
					}
					storage.set("orderBy", orderBy);
					$("#refresh").click();
				}
			})
		;
		$filesSortingHeader.find(".owner").text(getMessage("owner"));
		$filesSortingHeader.find(".date")
			.text(getMessage("lastModified"))
			.off()
			.on("click", function() {
				if (canBeSorted()) {
					var orderBy = storage.get("orderBy");
					if (orderBy == SORT_BY_MODIFIED_TIME || orderBy == SORT_BY_NAME || orderBy == SORT_BY_NAME_DESC) {
						orderBy = SORT_BY_MODIFIED_TIME_DESC;
					} else {
						orderBy = SORT_BY_MODIFIED_TIME;
					}
					storage.set("orderBy", orderBy);
					$("#refresh").click();
				}
			})
		;
		
		var DROPPABLE_ITEM = ".item[class*='folder']";
		var draggedItem; 
		
		$("#files")
			.on("dragstart", ".item", function(e) {
				console.log("dragstart", e);
				draggedItem = e;
				//$(this).addClass("dragging");
			})
			.on("dragenter", DROPPABLE_ITEM, function(e) {
				$(this).addClass("dragging");
			})
			.on("dragleave", DROPPABLE_ITEM, function(e) {
				$(this).removeClass("dragging");
			})
			.on("dragover", DROPPABLE_ITEM, function(e) {
				// we need to prevent the browser's default behavior, which is to navigate to that link
				if (e.preventDefault) {
					e.preventDefault(); // Necessary. Allows us to drop.
				}
				e.originalEvent.dataTransfer.dropEffect = 'move';
				return false;
			})
			.on("drop", DROPPABLE_ITEM, function(e) {
				console.log("drop", draggedItem, e);
				var $draggedItem = $(draggedItem.currentTarget);
				var draggedFile = $draggedItem.data("file");
				var targetFolder = $(e.currentTarget).data("file");
				console.log("source/target", draggedFile, targetFolder);
				
				$(this).removeClass("dragging");
				
				if (e.stopPropagation) {
					e.stopPropagation(); // stops the browser from redirecting.
				}
				
				// make sure source and destination are not same folder
				if (draggedFile.id != targetFolder.id) {
					showLoading();
					
					driveAPISend({
                        type: "patch",
                        url: "files/" + draggedFile.id + "?removeParents=" + draggedFile.parents.first() + "&addParents=" + targetFolder.id
                    }).then(data => {
						removeFile(displayedFiles, draggedFile, "moved", $draggedItem);
					}).catch(error => {
						showError(error);
					}).then(() => {
						hideLoading();
					});
				}
				
				return false;
			})
			.on("dragend", DROPPABLE_ITEM, function(e) {
				console.log("dragend", e);
				$(this).removeClass("dragging");
				return false;
			})
		;
		
		$("body").on("click", ".notification", function() {
			var $item = $(this).closest(".item");
			var file = $item.data("file");

			var foldersToFollow = storage.get("foldersToFollow");
			var foldersToUnfollow = storage.get("foldersToUnfollow");

			if (file.mimeType == MIME_TYPE_FOLDER || file.kind == DRIVE_KIND) {
				// first time we try following so let's enable the notifications
				if (storage.get("desktopNotifications") == "none") {
					storage.set("desktopNotifications", "optIn");
					
					// must init the first time so that subsequent changes are caught
					getStartPageToken({storage:storage}).then(() => {
						initNotificationTimers();
					});
				}
				
				if (hasNotification(file, storage, breadcrumbs)) {
					// remove notification
					if (storage.get("desktopNotifications") == "optIn" || storage.get("desktopNotifications") == "optOut") {
						removeFileFromArray(file, foldersToFollow);
						foldersToUnfollow.push(file);
						$item.removeClass("hasNotification");
					}
					showMessage( getMessage("notificationsRemovedForX", file.name) );
				} else {
					// add notification
					if (storage.get("desktopNotifications") == "optIn" || storage.get("desktopNotifications") == "optOut") {
						removeFileFromArray(file, foldersToUnfollow);
						foldersToFollow.push(file);
						$item.addClass("hasNotification");
					}
					showMessage( getMessage("notificationsAddForX", file.name) );
				}
				
				storage.set("foldersToFollow", foldersToFollow);
				storage.set("foldersToUnfollow", foldersToUnfollow);				
			} else {
				if (hasNotification(file, storage, breadcrumbs)) {
					muteFile(file, storage);
					$item.removeClass("hasNotification");
					showMessage( getMessage("notificationsRemovedForX", file.name) );
				} else if (isFileMuted(storage, file)) {
					unmuteFile(file, storage);
					$item.addClass("hasNotification");
					showMessage( getMessage("notificationsAddForX", file.name) );
				} else {
					var $dialog = initTemplate("genericDialogTemplate");
					$dialog.find("h2").text("Notifications");
					$($dialog.find("paper-dialog-scrollable")[0].scrollTarget).text("To get notifications for files use the notification icon on their parent folder.");
					openDialog("genericDialogTemplate").then(response => {
						// do nothing
					});
				}
			}
		}).click(function() {
			$("#fileContextMenu").hide();
		}).keydown(function(e) {
			if (!isFocusOnInputElement()) {
				$("#searchButton").click();
			}
		}).mousemove(function(e) {
			window.mousePosition = {x:e.pageX, y:e.pageY};
		});
		
		storage = await getStorage();
        var MAX_MODIFIED_FILES = storage.get("maxItemsToDisplay"); // v2 used to be 20 but user complain so now made it maxitemstodisplay v1 used to be 50 but I noticed popup was a bit slow to load with too many modified files being displayed
        var allFilesModified = storage.get("allFilesModified");
        
        storage.set("allFilesModified", allFilesModified.slice(0, MAX_MODIFIED_FILES));

        if (allFilesModified.length) {
            var latestModifiedFilesCount = 0;
            
            lastFilesModified = allFilesModified;
            lastFilesModified.forEach(fileModified => {
                if (new Date(fileModified.modifiedTime).isAfter(new Date(storage.get("lastNotificationsViewedTime")))) {
                    latestModifiedFilesCount++;
                }
            });

            initNotificationsMenu(latestModifiedFilesCount);
        } else {
            initNotificationsMenu(0);
        }
        
        if (isEligibleForReducedDonation(storage)) {
            $("#newsNotificationReducedDonationMessage").show();
            $("#newsNotification")
                .removeAttr("hidden")
                .click(function() {
                    openUrl("contribute.html?ref=reducedDonationFromPopup");
                })
            ;
        }
        
        if (storage.get("tokenResponses")) {
            displayQuickAccess();

            if (storage.get("leftNavItemActive") == "notifications") {
                displayNotifications();
            } else {
                displayFiles(storage.get("files"), {action:storage.get("leftNavItemActive")});
            }
            
            // team drive
            if (storage.get("hasTeamDrives")) {
                $("#teamDrives").unhide();
            } else {
                driveAPISend({
                    url: "drives",
                    data: {
                        "pageSize": 1
                    }
                }).then(data => {
                    if (data && data.drives.length) {
                        storage.enable("hasTeamDrives");
                        $("#teamDrives").unhide();
                    }
                }).catch(error => {
                    if (error.code == 400 || error.code == 401) {
                        showError("You need to re-grant access, it was probably revoked");
                        openPermissionsDialog().then(() => {
                            afterAcccessGranted();
                        });
                    } else {
                        showError(error);
                    }
                });
            }
        } else {
            openPermissionsDialog().then(() => {
                afterAcccessGranted();
            });
        }

        // patch
        if (!DetectClient.isWindows()) {
            // apparently just have to change the height for it to resize correctly
            setTimeout(function() {
                $("body").height( $("body").height() + 1);
            }, 100)
        }

        if (!storage.get("leftNavItemActive")) {
            // default probably just installed
            storage.set("leftNavItemActive", "myDrive");
        }
        
        selectedActiveNav($("#" + storage.get("leftNavItemActive")));
    })();
});