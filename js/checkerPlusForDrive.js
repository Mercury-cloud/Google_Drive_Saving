var ITEM_ID = "drive";
var ROOT_QUERY = " 'root' in parents ";
var MIME_TYPE_FOLDER = "application/vnd.google-apps.folder";
var OLD_DATE_STR = "1955-10-20T18:00:00.000Z";
var DRIVE_DOMAIN = "https://drive.google.com/";
const DRIVE_KIND = "drive#drive";

var TEST_REDUCED_DONATION = false;

var NotificationIds = {};
NotificationIds.EXTENSION_UPDATE = "EXTENSION_UPDATE";
NotificationIds.MESSAGE = "MESSAGE";
NotificationIds.ERROR = "ERROR";

var NotificationButtons = {};
NotificationButtons.SEE_REVISIONS = getMessage("seeRevisions");
NotificationButtons.MUTE = getMessage("mute");
NotificationButtons.DISMISS_ALL = getMessage("dismissAll");

var SORT_BY_NAME = "folder,name";
var SORT_BY_NAME_DESC = "folder desc,name desc";
var SORT_BY_MODIFIED_TIME = "modifiedTime";
var SORT_BY_MODIFIED_TIME_DESC = "modifiedTime desc";

var GCM_SENDER_ID = "305496705996";

var ExtensionId = {};
if (DetectClient.isFirefox()) {
    ExtensionId.Screenshot = "{2b5916ef-4e9b-433c-b744-37b23c511516}";
} else if (DetectClient.isEdge()) {
	ExtensionId.LocalScreenshot = "ajdcpfdbildfaahcgabgjhojmbalcnff";
	ExtensionId.Screenshot = "dnjgbabpedipbaghlhmcacpoehgpfoei";
} else {
	ExtensionId.LocalScreenshot = "ajdcpfdbildfaahcgabgjhojmbalcnff";
	ExtensionId.Screenshot = "mdddabjhelpilpnpgondfmehhcplpiin";
}

const Scopes = {
    DRIVE_READWRITE:        "https://www.googleapis.com/auth/drive",
    DRIVE_READONLY:         "https://www.googleapis.com/auth/drive.readonly",
    DRIVE_PHOTOS_READONLY:  "https://www.googleapis.com/auth/drive.photos.readonly"
}

function requestPermission(params) {
	return new Promise((resolve, reject) => {
		params = initUndefinedObject(params);

        if (window.showLoading) {
            showLoading();
        }

		initOAuth(params).then(oAuthForDevices => {
			if (params.useGoogleAccountsSignIn) {
				chrome.windows.getCurrent(windowResponse => {
					// temp
					console.log("windowResponse", windowResponse);
					localStorage._currentWindowId = windowResponse.id;

					oAuthForDevices.openPermissionWindow(params).then(permissionWindow => {
						localStorage._permissionWindowId = permissionWindow.id;
					});
				});
			} else {
                // Chrome sign-in
                params.refetch = true;
				oAuthForDevices.getAccessToken(params).then(() => {
					resolve();
				}).catch(error => {
                    if (window.hideLoading) {
                        hideLoading();
                    }
					reject(error);
				});
			}
		});
	}).then(() => {
		return getStorage().then(thisStorage => {
			storage = thisStorage;
			if (params.googlePhotos) {
				storage.enable("googlePhotosPermissionGranted");
			}

			if (params.lastCommand) {
				// save it to reload photos after granting
				storage.set("lastCommand", params.lastCommand);
			}
			
			return postPermissionsGranted();
		});
	});
}

function postPermissionsGranted(oAuthForDevices) {
	return fetchFiles({ oAuthForDevices: oAuthForDevices }).then(response => {
		// must get storage again because the "about" object is filled in the fetchFiles
		return getStorage().then(storage => {
			Controller();
			Controller.verifyPayment(ITEM_ID, getEmailFromStorage(storage)).then(response => {
				if (response.unlocked) {
					Controller.processFeatures();
				}
			});
		})
	});
}

function openPermissionsDialog(params) {
	return new Promise((resolve, reject) => {
		params = initUndefinedObject(params);
		getStorage().then(storage => {
			var $dialog = initTemplate("permissionDialogTemplate");

			if (supportsChromeSignIn()) {
                if (params.secondAttempt) {
                    $dialog.find("#tryGoogleAccountsSignInMessage").unhide();
                    $dialog.find(".chromeSignIn").removeClass("colored");
                    $dialog.find(".googleAccountsSignIn")
                        .addClass("colored")
                        //.attr("raised", true)
                    ;
                } else {
                    $dialog.find("#tryGoogleAccountsSignInMessage").hidden();
                    $dialog.find(".chromeSignIn").addClass("colored");
                    $dialog.find(".googleAccountsSignIn")
                        .removeClass("colored")
                        //.removeAttr("raised")
                    ;
                }
			} else {
                $dialog.find(".chromeSignIn").remove();
				$dialog.find("[msg='or']").remove();
				$dialog.find(".googleAccountsSignIn").addClass("colored");
            }

			if (params.googlePhotos) {
				$dialog.find("#googlePhotosHeader").unhide();
				$dialog.find(".cancel").unhide();
			} else {
				$dialog.find("#googlePhotosHeader").hidden();
				$dialog.find(".cancel").hidden();
			}
			$dialog.find(".chromeSignIn").off().click(() => {
				hideError();
				requestPermission(params).then(() => {
					resolve();
				}).catch(error => {
					params.secondAttempt = true;
					openPermissionsDialog(params);
				});
			});
			$dialog.find(".googleAccountsSignIn")
				.off().click(() => {
					hideError();
					showLoading();
					$dialog[0].close();
					requestPermission({ useGoogleAccountsSignIn: true }).then(() => {
						resolve();
					}).catch(error => {
						params.secondAttempt = true;
						openPermissionsDialog(params);
					});
				})
			;
			$dialog.find(".moreInfo").off().click(() => {
				openUrl("https://jasonsavard.com/wiki/Granting_access?ref=driveChecker");
			});

			openDialog($dialog);
		});
	});
}

async function initOAuth(params = {}) {
    if (!params.oAuthForDevices) { // already declared so just return it
        const storage = await getStorage();
        tokenResponses = storage.get("tokenResponses");
        
        const oauthForDevicesParams = {
            scope: Scopes.DRIVE_READONLY,
            securityTokenKey: "_driveSecurityToken",
            API: {
                client_id: "305496705996-d5vo7f6j3rtiordbjpnonitms0qckp25.apps.googleusercontent.com",
                client_secret: "vRcO_K3vUUhyp8MwxSvE0TiT",
                auth_uri: "https://accounts.google.com/o/oauth2/v2/auth",
                token_uri: "https://www.googleapis.com/oauth2/v4/token",
                redirect_uri: "https://jasonsavard.com/oauth2callback"
            },
            OLD_API: {
                client_id: "305496705996.apps.googleusercontent.com",
                client_secret: "NX0fDwV8VGDoWIBRx-jZcg59"
            },
        };
        if (params.googlePhotos || storage.get("googlePhotosPermissionGranted")) {
            oauthForDevicesParams.scope += " " + Scopes.DRIVE_PHOTOS_READONLY;
        }
        oauthForDevicesParams.BASE_URI = "https://www.googleapis.com/drive/v3/";
        oauthForDevicesParams.UPLOAD_URI = "https://www.googleapis.com/upload/drive/v3/files";
        
        params.oAuthForDevices = new OAuthForDevices(oauthForDevicesParams, tokenResponses);
        params.oAuthForDevices.setOnTokenChange((oauthForDevicesParams, allTokens) => {
            getStorage().then(storage => {
                console.log("setOnTokenChange", oauthForDevicesParams);
                if (oauthForDevicesParams.tokenResponse) {
                    storage.set("tokenResponses", allTokens);
                }
            });
        });
    }
    return params.oAuthForDevices;
}

async function getStorage(storageArea) {
	const storageDefaults = {
        buttonIcon: "default",
        desktopNotifications: "none",
        closeNotificationAfter: 7,
        lastChangeFetchTime: new Date(1),
        lastNotificationsViewedTime: new Date(1),
        maxItemsToDisplay: 100,
        pollingInterval: 5,
        restrictToMyDrive: true,
        foldersToFollow: [],
        foldersToUnfollow: [],
        mutedFiles: [],
        allFilesModified: [],
        showAnonymousModifications: true
    };
	
	const storage = new ChromeStorage({defaults:storageDefaults, storageArea:storageArea});
    await storage.load();
    // load return items but we want to return storage object
    return storage;
}

async function driveAPISend(params) {
	
	if (!params.userEmail) {
		params.userEmail = "default";
	}
    
	if (!params.contentType) {
		params.contentType = "application/json; charset=utf-8";
	}
    
    const oAuthForDevices = await initOAuth({ oAuthForDevices: params.oAuthForDevices ? params.oAuthForDevices : window.oAuthForDevices });
    try {
        return await oAuthForDevices.send(params);
    } catch (error) {
        if (error.code == 403) {
            if (window.fromToolbar) {
                await niceAlert(getMessage("permissionIsRequired"));
            }
            const tokenResponse = oAuthForDevices.findTokenResponse({ userEmail: params.userEmail });
            requestPermission({
                useGoogleAccountsSignIn: !tokenResponse.chromeProfile,
                scopes: Scopes.DRIVE_READWRITE
            }).then(() => {
                afterAcccessGranted();
            });
        }
        throw error;
    }
}

async function getAbout(params) {
    const storage = await getStorage();
    if (params.force || !storage.get("about")) {
        const data = await driveAPISend({url:"about?fields=user"});
        await storage.set("about", data);
        console.log("about", data);
    }
}

async function refreshFiles() {
    const storage = await getStorage();
    return fetchFiles({
        lastCommand: storage.get("lastCommand"),
        q: storage.get("q"),
        orderBy: storage.get("orderBy")
    });
}

async function fetchFiles(params = {}) {
    console.log("fetch files", params);
    const oAuthForDevices = await initOAuth(params);
    await getAbout(params);
    const storage = await getStorage();
    var apiParams;
    if (params.lastCommand) {
        // if lastCommand passed assume we use only params passed
        apiParams = params;
    } else {
        // else default to last passed variables (ie refresh)
        apiParams = {};
        apiParams.q = storage.get("q");
        apiParams.orderBy = storage.get("orderBy");
        apiParams.lastFile = storage.get("lastFile");
        apiParams.spaces = storage.get("spaces");
    }

    if (apiParams.lastCommand == "openFolder" && apiParams.lastFile) {
        if (typeof apiParams.lastFile !== 'object') {
            apiParams.lastFile = JSON.parse(apiParams.lastFile);
        }
        apiParams.q = " '" + apiParams.lastFile.id + "' in parents ";
    } else if (apiParams.lastCommand == "myDrive") {
        apiParams.q = ROOT_QUERY;
    } else if (apiParams.lastCommand == "sharedWithMe") {
        apiParams.q = " sharedWithMe ";
    } else if (apiParams.lastCommand == "googlePhotos") {
        apiParams.q = ""; // must be set to "" so that the defaults take over inside the fetchFiles()
    } else if (apiParams.lastCommand == "recent") {
        var viewedByMeTime = new Date().subtractDays(60).toJSON();
        apiParams.q = " createdTime > '" + viewedByMeTime + "' or modifiedTime > '" + viewedByMeTime + "' or viewedByMeTime > '" + viewedByMeTime + "' ";
        apiParams.orderBy = "recency desc";
    } else if (apiParams.lastCommand == "starred") {
        apiParams.q = " starred = true ";
        apiParams.orderBy = null;
    }
    
    if (!apiParams.q && !apiParams.spaces && !apiParams.orderBy) {
        if (apiParams.lastCommand != "teamDrives") {
            apiParams.q = ROOT_QUERY;
        }
        apiParams.orderBy = SORT_BY_NAME;

        // legacy remove hidden
        if (apiParams.q) {
            apiParams.q = apiParams.q.replace("and hidden = false", "");
        }
    }
    
    var url;
    let data = {};
    if (apiParams.q) {
        data.q = apiParams.q + " and trashed = false ";
    }
    if (apiParams.orderBy) {
        data.orderBy = apiParams.orderBy;
    }
    data.includeTeamDriveItems = true;
    data.supportsTeamDrives = true;

    if (apiParams.lastCommand == "teamDrives") {
        url = "drives";
        data.fields = "*";
        data.pageSize = 100;
    } else {
        url = "files?";
        if (apiParams.spaces) {
            url += "spaces=" + apiParams.spaces;
        }
        data.fields = "files"; //files/name
        data.pageSize = storage.get("maxItemsToDisplay");
    }
    
    data = await driveAPISend({url:url, data:data});
    // sync the modified files with those that are found in the recent file fetch
    var allFilesModified = storage.get("allFilesModified");
    var files;
    if (apiParams.lastCommand == "teamDrives") {
        files = data.drives;
    } else {
        files = data.files;
    }
    
    if (allFilesModified.length) {
        allFilesModified.forEach((fileModified, fileModifiedIndex) => {
            files.some(file => {
                if (fileModified.id == file.id) {
                    allFilesModified[fileModifiedIndex] = file;
                    return true;
                }
            });
        });
        
        storage.set("allFilesModified", allFilesModified);
    }
    
    storage.set("files", files);
    
    return {files:files};
}

// max 500 characters for notification id so transfer minimal details into id
function generateNotificationIdFromFile(file) {
	let notificationIdObj = {
		id: file.id,
		name: file.name,
		mimeType: file.mimeType,
		webViewLink: file.webViewLink,
		notificationButtons: file.notificationButtons
	}
	return JSON.stringify(notificationIdObj);
}

function getIconInfoFromFile(file) {
	return new Promise((resolve, reject) => {
		// Must use these local files for noficiation (or it might not appear because of chrome notificastion download image errors)
		
		var lastPeriod;
		var fileType;
		if (file.mimeType) {
			lastPeriod = file.mimeType.lastIndexOf(".");
			fileType = file.mimeType.substring(lastPeriod + 1);
		}
		
		if (file.mimeType == MIME_TYPE_FOLDER || file.kind == DRIVE_KIND) {
			fileType = "folder";
		} else if (file.mimeType == "application/vnd.google-apps.document") {
			fileType = "document";
		} else if (file.mimeType == "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || fileType == "application/msword") {
			fileType = "word";
		} else if (file.mimeType == "application/vnd.google-apps.spreadsheet") {
			fileType = "spreadsheet";
		} else if (file.mimeType == "application/vnd.google-apps.presentation") {
			fileType = "presentation";
		} else if (file.mimeType == "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
			fileType = "powerpoint";
		} else if (file.mimeType == "application/vnd.google-apps.map") {
			fileType = "map";
		} else if (fileType && fileType.startsWith("audio/")) {
			fileType = "audio";
		} else if (fileType && fileType.startsWith("video/")) {
			fileType = "video";
		} else if (fileType == "application/zip" || fileType == "application/octet-stream") {
			fileType = "archive";
		} else if (fileType == "application/pdf") {
			fileType = "pdf";
		} else if (fileType && fileType.startsWith("image/")) {
			fileType = "image";
		} else {
			fileType = "generic";
		}
		
		var iconSrc = "/images/driveIcons/" + fileType + "_x128.png";

		var img = new Image();
		img.onload = function() {
			var canvas = document.createElement("canvas");
			canvas.width = canvas.height = 80;
			
			var context = canvas.getContext("2d");
			context.drawImage(this, 24, 16, 32, 32);
			resolve({iconSrc:canvas.toDataURL(), fileType:fileType});
		}
		img.onerror = function(e) {
			console.error("error loading image", e);
			resolve({iconSrc:iconSrc, fileType:fileType});
		}
		img.src = iconSrc;
	});
}

function isModifiedAndUnviewedByMe(storage, file) {
	if (storage.get("showOwnModifications")) {
		// some documents like "One Global Democracy" (anonymous) did not have a lastModifyingUser
		if (!storage.get("showAnonymousModifications") && !file.lastModifyingUser) {
			return false;
		} else {
			return true;
		}
	} else {
		if (storage.get("showAnonymousModifications") && !file.lastModifyingUser) {
			return true;
		} else {
			let passedNotLastModifiedByMeTest = file.lastModifyingUser && !file.lastModifyingUser.me;
			return passedNotLastModifiedByMeTest && (file.modifiedByMeTime != file.modifiedTime) && (!file.viewedByMeTime || new Date(file.modifiedTime).getTime() > new Date(file.viewedByMeTime).getTime())
		}
	}
}

function getImageDataURL(url, success, error) {
    var data, canvas, ctx;
    var img = new Image();
    img.onload = function(){
        // Create the canvas element.
        canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        // Get '2d' context and draw the image.
        ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        // Get canvas data URL
        try{
            data = canvas.toDataURL();
            success({image:img, data:data});
        }catch(e){
        	console.error(e);
        }
    }
    // Load image URL.
    try{
        img.src = url;
    }catch(e){
        console.error(e);
    }
}

function buildView(baseContent, newContent, viewType) {
    var base = difflib.stringAsLines(baseContent);
    var newtxt = difflib.stringAsLines(newContent);

    // create a SequenceMatcher instance that diffs the two sets of lines
    var sm = new difflib.SequenceMatcher(base, newtxt);

    // get the opcodes from the SequenceMatcher instance
    // opcodes is a list of 3-tuples describing what changes should be made to the base text
    // in order to yield the new text
    var opcodes = sm.get_opcodes();
    
    var diffNode = diffview.buildView({
        baseTextLines: base,
        newTextLines: newtxt,
        opcodes: opcodes,
        // set the display titles for each resource
        baseTextName: "Last",
        newTextName: "Current",
        contextSize: null,
        viewType: viewType
    });
    
    return diffNode;
}

function compareContent(last, current) {
	// get the baseText and newText values from the two textboxes, and split them into lines
    //var base = difflib.stringAsLines("aa\nabc\ndef\nghi");
    //var newtxt = difflib.stringAsLines("abc\ndeef\nghi\nanother one baby");
	
	var diffNode = buildView(last, current, 0);
    
    //console.log("diffNode: " + (typeof diffNode));
    
    //var $diffview = $(diffNode);
    //let diffview = (new DOMParser()).parseFromString(diffNode, "text/html");
    
    var items = [];
    
    diffNode.querySelectorAll("tr").forEach(tr => {
        console.log("tr", tr);
        var TDs = tr.querySelectorAll("td");
        if (TDs.length) {
            var firstTD = TDs[0]; // first
            var lastTD = TDs[TDs.length-1]; // last
            
            var item;
            if (lastTD.getAttribute("class") == "replace") {
                if (firstTD.getAttribute("class") == "empty") {
                    item = {title: lastTD.textContent, message: ""};
                } else {
                    item = {title: lastTD.textContent, message: " (changed)"};
                }
            } else if (lastTD.getAttribute("class") == "insert") {
                item = {title: lastTD.textContent, message: ""};
            } else if (firstTD.getAttribute("class") == "delete") {
                item = {title: firstTD.textContent, message: " (removed)"};
            }
            
            console.log("item", item);
            
            if (item) {
                item.title = item.title.replace(/\* /, "");
                if (item.title) {
                    items.push(item);
                }
            }
        }
    });
    
    return items;
}

async function compareRevisions(file, bypassCapabilitiesCheck) {
    if (bypassCapabilitiesCheck || (file.capabilities && file.capabilities.canReadRevisions)) {
        const data = await driveAPISend({url:"files/" + file.id + "/revisions", data:{fields:"revisions(id)", pageSize:500}});
        console.log("result: ", data);
        // patch: seems in v3 we couldn't fetch a file's content for previous revisions (only the current) so i'm using old v2 export links to get previous revision content
        // https://docs.google.com/feeds/download/documents/export/Export?id=1cZrbfPHhfgJdhj4i_rXTOriGNsMcffdTGMr0aguJ3q4&revision=100&exportFormat=txt
        // need atleast 2 revisions to compare
        // make sure we retrieved all revisions so that nextPageToken is not present
        if (!data.nextPageToken && data.revisions.length >= 2) {
            
            /*
            // https://www.googleapis.com/drive/v3/files/fileId/revisions/revisionId
            driveAPISend({url:"files/" + file.id + "/revisions/" + data.revisions[data.revisions.length-1].id + "?alt=media"}).then(response => {
                console.log("get revision: ", response);
            });
            */
            
            return {
                currentRevision: await fetchText("https://docs.google.com/feeds/download/documents/export/Export?id=" + file.id + "&revision=" + data.revisions[data.revisions.length-1].id + "&exportFormat=txt"),
                lastRevision: await fetchText("https://docs.google.com/feeds/download/documents/export/Export?id=" + file.id + "&revision=" + data.revisions[data.revisions.length-2].id + "&exportFormat=txt"),
                revisions: data
            };
        }
    }
}

function ensureFilesRefreshed(filesModifiedFlag) {
	if (filesModifiedFlag) {
		return refreshFiles();
	} else {
		return Promise.resolve();
	}
}

function showNotification(storage, action, file, changedItems) {
	getIconInfoFromFile(file).then(fileInfo => {
		var dateStr = "";
		if (file.modifiedTime) {
			var modifiedTime = new Date(file.modifiedTime);
			if (modifiedTime.isToday()) {
				dateStr = getMessage("at") + " " + modifiedTime.toLocaleTimeString();
			} else if (modifiedTime.isYesterday()) {
				dateStr = getMessage("yesterdayAt") + " " + modifiedTime.toLocaleTimeString();
			} else {
				dateStr = modifiedTime.toLocaleString("default", {
                    weekday: "short"
                });
			}
		}
		
		var options = {};
		options.message = "";

		var fileStatus;
		if (action == "created") {
			fileStatus = getMessage("created");
			if (storage.get("showImagesInNotifications") && file.thumbnailLink && file.thumbnailLink.includes("googleusercontent")) {
				options.type = "image";
				// original url: https://lh4.googleusercontent.com/kOMbSKyzVPUZGNl9l--xqGUPMBhTXLb3LpBh15_bjiE08pUMeybaB6LBJkKs3VzK54FJ1g=s220
				// change the s=220 to s=340
				options.imageUrl = file.thumbnailLink.replace(/\=s\d+/, "\=s" + "340");
			} else {
				options.type = "basic";
			}
		} else {
            fileStatus = getMessage("modified");
            
            console.log("changedItems", changedItems);
			
			if (changedItems && changedItems.length) {
				options.type = "list";
				options.message = getMessage("Xchanges", changedItems.length + "");
				options.items = changedItems;
			} else {
				options.type = "basic";
			}
		}
		
		options.title = file.name;

		let displayName;
		if (file.lastModifyingUser) {
			if (file.lastModifyingUser.me) {
				displayName = getMessage("me");
			} else {
				displayName = file.lastModifyingUser.displayName;
			}
		} else {
			displayName = getMessage("anonymous");
		}

		if (DetectClient.isChrome()) {
			options.contextMessage = fileStatus.capitalize() + " " + getMessage("by") + " " + displayName + " " + dateStr;
		} else {
			if (options.message) {
				options.message += "\n";
			} else {
				options.message = "";
			}
			options.message += fileStatus.capitalize() + " " + getMessage("by") + " " + displayName + " " + dateStr;
		}
		
		options.iconUrl = fileInfo.iconSrc;

		// below is old code
		// iconSrc is originally https://ssl.gstatic.com/docs/doclist/images/icon_11_document_list.png
		// but we are converting it to https://ssl.gstatic.com/docs/doclist/images/icon_11_document_xl128.png
		//options.iconUrl = fileInfo.iconSrc.replace("_list", "_xl128"); // do this to pull large icon 128px

		if (DetectClient.isChrome()) {
			options.buttons = [];
			if (changedItems && changedItems.length) {
				options.buttons.push({title:NotificationButtons.SEE_REVISIONS, iconUrl: "images/magnifyingGlass.svg"});
			}
			options.buttons.push({title:NotificationButtons.MUTE, iconUrl: "images/noSign.svg"});
		}
		
		if (storage.get("closeNotificationAfter") == 25) {
			options.priority = 1;
		} else if (storage.get("closeNotificationAfter") == 7) {
			options.priority = 0;
		} else {
			if (DetectClient.isChrome() && !DetectClient.isMac()) {
				options.requireInteraction = true;
			}
		}
		
		// add this "extra" attribute to the file so that it gets stored later so we can reference the buttons for this notification
		file.notificationButtons = options.buttons;
		
		if (DetectClient.isWindows()) {
			options.appIconMaskUrl = "images/notificationMiniIcon.png";
		}
		
		console.log("options: ", options);
		
		chrome.notifications.getAll(function(notifications) {
			var notifAlreadyOpened = false;
			var notificationId = generateNotificationIdFromFile(file);
			console.log(notifications);
			var otherNotifications = 0;
			for (openNotificationId in notifications) {
				otherNotifications++;
				var notificationFile = JSON.parse(openNotificationId);
				if (notificationFile.id == file.id) {
					notifAlreadyOpened = true;
					chrome.notifications.update(notificationId, options, function(wasUpdated) {
						if (chrome.runtime.lastError) {
							console.error(chrome.runtime.lastError.message, options);
						}
						console.log("updated: " + wasUpdated);
					});
				}
			}
			if (!notifAlreadyOpened) {
				
				if (otherNotifications >= 1 && options.buttons && options.buttons.length <= 1) {
					// add button
					options.buttons.push({title:NotificationButtons.DISMISS_ALL, iconUrl: "images/dismissAll.svg"});
					// update notification id
					file.notificationButtons = options.buttons;
					notificationId = generateNotificationIdFromFile(file);
				}
				
				chrome.notifications.create(notificationId, options, function(notificationId) {
					if (chrome.runtime.lastError) {
						console.error(chrome.runtime.lastError.message);
					} else {
						// nothing
					}
					console.log("created");
				});															
			}
		});		
	});
}

function muteFile(file, storage) {
	var mutedFiles = storage.get("mutedFiles");
	mutedFiles.push(file);
	storage.set("mutedFiles", mutedFiles);
}

function unmuteFile(file, storage) {
	var mutedFiles = storage.get("mutedFiles");
	mutedFiles.some((mutedFile, index) => {
		if (mutedFile.id == file.id) {
			mutedFiles.splice(index, 1);
			return true;
		}
	});
	
	storage.set("mutedFiles", mutedFiles);
}

function isFileMuted(storage, fileOrFileId) {
	var fileId = fileOrFileId.id ? fileOrFileId.id : fileOrFileId;
	
	var mutedFiles = storage.get("mutedFiles");
	var foundMutedFile = mutedFiles.some(mutedFile => {
		if (fileId == mutedFile.id) {
			return true;
		}
	});
	
	return foundMutedFile;
}

function wasRecentlyNotified(storage, file) {
	var MINUTES_BETWEEN_NOTIFICATIONS = 30;
	var foundFlag = false;
	
	var allFilesModified = storage.get("allFilesModified");
	allFilesModified.some(allFileModified => {
		if (allFileModified.id == file.id) {
			if (new Date(allFileModified.modifiedTime).diffInMinutes() >= -MINUTES_BETWEEN_NOTIFICATIONS) {
				foundFlag = true;
			}
			return true;
		}
	});
	return foundFlag;
}

async function showPossibleNotifications(storage, force2, data, lastChangeFetchTime, oAuthForDevices) {
	console.log("showPossibleNotifications", data);
    var filesModified = [];
    var changeResponsePromises = [];
    
    await asyncForEach(data.changes, change => {
        // make sure it has been atleast modified once by me (because it is blank when a document is first shared)

        var file = change.file;
        if (file) { //  && file.modifiedByMeTime
            console.log("File:", file.name);
            //console.log("modified atleast once by me")
            
            // make sure it has not been modified by me
            if (force2 || isModifiedAndUnviewedByMe(storage, file)) {
                console.log("modified by someone")
                var createdTime = new Date(file.createdTime);
                var modifiedTime = new Date(file.modifiedTime);
                console.log("modified: " + modifiedTime)
                console.log("last fet: " + lastChangeFetchTime)
                if (force2 || modifiedTime.isAfter(lastChangeFetchTime)) {
                    
                    var getAllParentsPromise = getAllParents(file);
                    changeResponsePromises.push(getAllParentsPromise);
                    
                    getAllParentsPromise.then(parents => {
                        
                        console.log("parents:", parents);

                        if (force2 || hasNotification(file, storage, parents)) {
                            console.log("hasNotification");
                            
                            if (!force2 && (storage.get("silentNotifications") || wasRecentlyNotified(storage, file))) {
                                console.log("silent notifications dont show desktop notifs");
                            } else {
                                if (createdTime.isAfter(lastChangeFetchTime)) {
                                    // created
                                    playNotificationSound(storage.get("notificationSound"));
                                    showNotification(storage, "created", file);
                                } else {
                                    if (isFileMuted(storage, file)) {
                                        console.info("File was muted so no notification!");
                                    } else {
                                        // updated
                                        compareRevisions(file)
                                            .catch(error => {
                                                console.error("error in compare revisions:", error);
                                            }).then(response => {
                                                // continue anyways to show update notification
                                                var changedItems;
                                                if (response && response.currentRevision) {
                                                    console.log("response.currentRevision");				
                                                    changedItems = compareContent(response.lastRevision, response.currentRevision);
                                                } else {
                                                    changedItems = null;
                                                }
                                                playNotificationSound(storage.get("notificationSound"));
                                                showNotification(storage, "updated", file, changedItems);
                                            })
                                        ;
                                    }
                                }
                            }
                            filesModified.push(file);
                        } else {
                            console.info("no notification");
                        }
                        
                    });
                    
                }
            }
        } else {
            console.log("modified by me??: ", file);
        }
    });
    
    await Promise.all(changeResponsePromises);
    return filesModified;
}

async function ensureStartPageToken(params) {
    return params.storage.get("startPageToken") || getStartPageToken(params);
}

async function ensureWatchStopped() {
    const storage = await getStorage();
    const watchResponse = storage.get("watchResponse"); 
    if (watchResponse) {
        try {
            const data = await driveAPISend({
                type: "post",
                url: "channels/stop",
                data: {
                    id: watchResponse.id,
                    resourceId: watchResponse.resourceId
                }
            });
            console.log("stop response", data);
            storage.remove("watchResponse");
        } catch (error) {
            if (error.code == "404") { // the "watch" might have already been stopped so continue
                console.log("Might have already been stopped");
                storage.remove("watchResponse");
            } else {
                throw error;
            }
        }
    }
}

function isWatchExpired(storage) {
	if (!storage.get("watchResponse") || new Date(parseInt(storage.get("watchResponse").expiration)).isBefore()) {
		return true;
	}
}

async function restartWatch() {
	await ensureWatchStopped();
    initNotificationTimers();
}

async function gcmWatch() {
    if (chrome.gcm) {
        console.log("gcmWatch");

        const storage = await getStorage();

        if (isWatchExpired(storage)) {
            console.log("watch expired");
            const oAuthForDevices = await initOAuth();
            const startPageToken = await ensureStartPageToken({storage:storage, oAuthForDevices:oAuthForDevices});

            const url = "changes/watch?pageToken=" + startPageToken + "&restrictToMyDrive=" + storage.get("restrictToMyDrive") + "&includeTeamDriveItems=true&supportsTeamDrives=true";
            const data = {
                id: getUUID(),
                type: "web_hook",
                address: "https://drive-extension.appspot.com/notifications",
                token: "registrationId=" + await ensureGCMRegistration(storage)
            };

            try {
                const watchResponse = await driveAPISend({type:"post", url:url, data:data});
                console.log("watch success", watchResponse);
                storage.set("watchResponse", watchResponse);
            } catch (error) {
                if (error.code != 400) { // only if supported
                    console.error("Retrying gcmWatch soon, error: ", error);
                    chrome.alarms.create("gcmWatch", {delayInMinutes:5});
                }
                throw error;
            }
        }
        startWatchAlarm(storage);
    } else {
        throw "GCM not supported";
    }
}

function startWatchAlarm(storage) {
	var DELAY_BETWEEN_STOP_AND_START = seconds(5);
	var nextGcmWatchTime = parseInt(storage.get("watchResponse").expiration)+DELAY_BETWEEN_STOP_AND_START;
	console.log("nextGcmWatchTime", new Date(nextGcmWatchTime));
	chrome.alarms.create("gcmWatch", {when:nextGcmWatchTime});
}

function getPollingInterval(storage) {
	var periodInMinutes;
	if (storage.get("pollingInterval") == "realtime") {
		periodInMinutes = 60;
	} else {
		periodInMinutes = parseInt(storage.get("pollingInterval"));
	}
	return periodInMinutes;
}

async function initNotificationTimers() {
	const storage = await getStorage();
    // create/recreate this alarm on install AND update
    // note: calling it again simply cancels the first one
    
    chrome.alarms.create("checkForModifiedFiles", {periodInMinutes:getPollingInterval(storage)});
    checkForModifiedFiles();

    if (storage.get("pollingInterval") == "realtime") {
        gcmWatch();
    } else {
        ensureWatchStopped();
        chrome.alarms.clear("gcmWatch", wasCleared => {
            console.log("stop gcm alarm: " + wasCleared);
        });
    }
}

function checkForModifiedFiles(force, force2) {
	console.log("called checkForModifiedFiles");
	
	getStorage().then(storage => {
		if (storage.get("desktopNotifications") != "none") {
			if (force || new Date(storage.get("lastChangeFetchTime")).diffInMinutes() <= -getPollingInterval(storage)) {
				chrome.idle.queryState(60 * 5, state => { // only poll if not idling for 5 minutes of more
					if (state == "active") {
						processChanges(storage, force2);
					}
				});
			}
		}		
	});
	
}

async function processChanges(storage, force2) {
	console.log("process changes");
	
	var lastChangeFetchTime = new Date(storage.get("lastChangeFetchTime"));
    
    const oAuthForDevices = await initOAuth();
    const startPageToken = await ensureStartPageToken({storage:storage, oAuthForDevices:oAuthForDevices});
    // set restrictToMyDrive = true (default false) because I was getting notifications for files which I opened from an email etc. but had not been explicitly shared with me (for ref. these files did contain the attributes .sharedWithMeTime and .sharingUser)
    const data = await driveAPISend({
        url: "changes?includeTeamDriveItems=true&supportsTeamDrives=true",
        data: {
            pageToken: startPageToken,
            restrictToMyDrive: storage.get("restrictToMyDrive"),
            fields: "newStartPageToken,nextPageToken,changes"
        },
        oAuthForDevices: oAuthForDevices
    });
    // logging
    var filesModifiedFlag = false;
    data.changes.forEach(change => {
        console.log("change", change);
        var file = change.file;
        if (file && file.modifiedTime) {
            var modifiedTime = new Date(file.modifiedTime);					
            if (modifiedTime.isAfter(lastChangeFetchTime)) {
                filesModifiedFlag = true;
                return false;
            }
        }
    });
    
    await ensureFilesRefreshed(filesModifiedFlag);
        
    try {
        const filesModified = await showPossibleNotifications(storage, force2, data, lastChangeFetchTime, oAuthForDevices);
        console.log("done - showPossibleNotifications: ", filesModified);
        if (filesModified.length) {

            var allFilesModified = storage.get("allFilesModified");

            // merge these modified files with all previous
            filesModified.forEach(fileModified => {
                var alreadyAdded = false;
                
                allFilesModified.some(function(allFileModified, allFilesIndex) {
                    if (allFileModified.id == fileModified.id) {
                        // update info
                        allFilesModified[allFilesIndex] = fileModified;
                        // already modified previous so don't re-add it
                        alreadyAdded = true;
                        return true;
                    }
                });
                
                if (!alreadyAdded) {
                    allFilesModified.unshift(fileModified);
                }
            });

            
            var latestModifiedFilesCount = 0;
            var filesModifiedStr = "";
            
            allFilesModified.forEach(fileModified => {
                //console.log("file modified date: " + new Date(fileModified.modifiedTime));
                //console.log("lastnotifview date: " + new Date(storage.get("lastNotificationsViewedTime")));
                if (!isFileMuted(storage, fileModified) && new Date(fileModified.modifiedTime).isAfter(new Date(storage.get("lastNotificationsViewedTime")))) {
                    latestModifiedFilesCount++;
                    filesModifiedStr = "\n" + fileModified.name;
                }
            });
            
            storage.set("allFilesModified", allFilesModified);
            if (latestModifiedFilesCount >= 1) {
                chrome.browserAction.setBadgeText({text:latestModifiedFilesCount + ""});
                chrome.browserAction.setTitle({title:"File(s) modified..." + filesModifiedStr})
            }
        }
        
        // The starting page token for future changes. This will be present only if the end of the current changes list has been reached.
        if (data.newStartPageToken) {
            console.log("new startPageToken: " + data.newStartPageToken)
            
            // comment for testing
            storage.set("startPageToken", data.newStartPageToken);
        } else {
            // means we have more pages, but i'm not interesting in going through more than 100 so let's just reset startpagetoken then and fetch new getStartPageToken
            storage.remove("startPageToken");
        }

        storage.setDate("lastChangeFetchTime");

        console.log(data);
    } catch (error) {
        console.error("showPossibleNotifications error: ", error);
    }
}

function getCurrentFolder(storage) {
	if (!storage) {
		storage = window.storage;
	}
	if (storage.get("lastCommand") == "myDrive") {
		return;
	} else if (storage.get("lastCommand") == "openFolder") {
		if (storage.get("lastFile")) {
			try {
				return storage.get("lastFile");
			} catch (e) {
				console.error(e);
			}
		}
	}
}

function appendParams(url, storage) {
	var currentFolder = getCurrentFolder(storage);
	
	if (currentFolder) {
		url = setUrlParam(url, "folder", currentFolder.id);
	}
	
	var email = getEmailFromStorage(storage);
	if (email) {
		url = setUrlParam(url, "authuser", encodeURIComponent(email));
	}
	
	return url;
}

function openUrl(url, windowId) {
	if (window.inWidget) {
		top.location.href = url;
	} else {
		if (windowId != null) {
			chrome.tabs.create({url:url, windowId:windowId});
		} else {
			chrome.tabs.create({url:url});
		}
		window.close();
	}
}

function openDriveUrl(url, windowId) {
	url = appendParams(url, window.storage);
	openUrl(url, windowId);
}

function hasNotification(file, storage, parents) {
	if (isFileMuted(storage, file)) {
		return false;
	}
	
	if (storage.get("desktopNotifications") == "optIn") {
		if (isUnfollowed(file, storage)) {
			return false;
		} else if (isFollowed(file, storage)) {
			return true;
		}
	} else if (storage.get("desktopNotifications") == "optOut") {
		if (isUnfollowed(file, storage)) {
			return false;
		}
	}
	
	for (var a=parents.length-1; a>=0; a--) {
		if (storage.get("desktopNotifications") == "optIn") {
			if (isUnfollowed(parents[a], storage)) {
				return false;
			} else if (isFollowed(parents[a], storage)) {
				return true;
			}
		} else if (storage.get("desktopNotifications") == "optOut") {
			if (isUnfollowed(parents[a], storage)) {
				return false;
			}
		}
	}
		
	if (storage.get("desktopNotifications") == "optIn") {
		return false;
	} else if (storage.get("desktopNotifications") == "optOut") {
		// got here at the end, so default is to follow
		return true;
	} else {
		return false;
	}
}

function isFollowed(fileOrFileId, storage) {
	var fileId = fileOrFileId.id ? fileOrFileId.id : fileOrFileId;
	
	return storage.get("foldersToFollow").some(folderToFollow => {
		if (fileId == folderToFollow.id) {
			return true;
		}
	});
}

function isUnfollowed(fileOrFileId, storage) {
	var fileId = fileOrFileId.id ? fileOrFileId.id : fileOrFileId;
	
	return storage.get("foldersToUnfollow").some(folderToUnfollow => {
		if (fileId == folderToUnfollow.id) {
			return true;
		}
	});
}

function removeFileFromArray(file, ary) {
	ary.some(function(item, index) {
		if (item.id == file.id) {
			ary.splice(index, 1);
			return true;
		}
	});
}

async function getAllParents(fileOrFileId, setFileObjects, parents = []) {
    if (fileOrFileId && !fileOrFileId.isRoot) {
        var fileId = fileOrFileId.id ? fileOrFileId.id : fileOrFileId;
        let url = "files/" + fileId;
        url += "?supportsTeamDrives=true&fields=id,name,parents";
        const data = await driveAPISend({url:url});
        if (data && data.parents && data.parents.length) {
            var parentFolder = data.parents[0];
            // changes array
            if (setFileObjects) {
                parents.splice(0, 0, data);
            } else {
                parents.splice(0, 0, parentFolder);
            }
            parents = await getAllParents(parentFolder, setFileObjects, parents);
        }
    }
    return parents;
}

function setButtonIcon(iconName) {
	chrome.browserAction.setIcon({ path: {
			"19": "images/buttonIcons/" + iconName + ".png",
			"38": "images/buttonIcons/" + iconName + "_38.png"
		}
	});
}

function getEmailFromStorage(storage) {
	var email;
	try {
		email = storage.get("about").user.emailAddress;
	} catch (e) {
		console.error("could not find email: " + e);
	}
	return email;
}

function playNotificationSound(soundName) {
	if (soundName) {
		var sound = new Audio();
		sound.src = "sounds/" + soundName;
		sound.play();
	}
}

function daysElapsedSinceFirstInstalled(storage) {
	var installDateStr = storage.get("installDate");
	var installDate;
	
	if (installDateStr) {
		installDate = new Date(installDateStr);
	} else {
		installDate = new Date();
	}
	return Math.abs(Math.round(installDate.diffInDays()));
}

var IGNORE_DATES = false;

function isEligibleForReducedDonation(storage) {
	if (TEST_REDUCED_DONATION || IGNORE_DATES || (!storage.get("donationClicked") && daysElapsedSinceFirstInstalled(storage) >= 14)) {
		return true;
	}
}

async function uploadFile(params) { // name, type, data
    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";
    
    var contentType = params.type || 'application/octet-stream';
    var metadata = {
        'name': params.name,
        'mimeType': contentType
    };
    if (params.parentId) {
        metadata.parents = [params.parentId];
    }

    var multipartRequestBody =
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: ' + contentType + '\r\n' +
        'Content-Transfer-Encoding: base64\r\n' +
        '\r\n' +
        params.data +
        close_delim;

    const data = await driveAPISend({
        upload: true,
        type: "post",
        contentType: 'multipart/mixed; boundary="' + boundary + '"',
        url: "?uploadType=multipart&fields=id,name,webViewLink",
        data: multipartRequestBody
    });
    console.log("response", data);
    return data;
}

async function getStartPageToken(params) {
    var storage = params.storage;
    
    const data = await driveAPISend({
        url: "changes/startPageToken?supportsTeamDrives=true",
        oAuthForDevices: params.oAuthForDevices
    });

    const startPageToken = data.startPageToken;
    storage.set("startPageToken", startPageToken);
    return startPageToken;
}

function showMessageNotification(title, message, error) {
   var options = {
        type: "basic",
        title: title,
        message: message,
        iconUrl: "images/icon128.png",
        priority: 1
   }
   
   var notificationId;
   if (error) {
	   notificationId = NotificationIds.ERROR;
	   if (DetectClient.isChrome()) {
		   options.contextMessage = "Error: " + error;
	   } else {
		   options.message += " Error: " + error;
	   }
	   if (DetectClient.isChrome()) {
		   options.buttons = [{title:"If this is frequent then click here to report it", iconUrl:"images/open.svg"}];
	   }
   } else {
	   notificationId = NotificationIds.MESSAGE;
   }
   
   new Promise((resolve, reject) => {
	   chrome.notifications.create(notificationId, options, function (notificationId) {
		   if (chrome.runtime.lastError) {
			   console.error("create error: " + chrome.runtime.lastError.message);
			   if (chrome.runtime.lastError.message.includes("Unable to download all specified images")) {
				   options.type = "basic";
				   delete options.imageUrl;
				   chrome.notifications.create(notificationId, options, function (notificationId) {
					   if (chrome.runtime.lastError) {
					   		console.error("create error2: " + chrome.runtime.lastError.message);
							reject(chrome.runtime.lastError.message);
					   } else {
					   		resolve(notificationId);
					   }
				   });
			   }
		   } else {
			   resolve(notificationId);
		   }
	   })
   }).then(notificationId => {
	   setTimeout(function () {
		   chrome.notifications.clear(notificationId);
	   }, error ? seconds(15) : seconds(5));
   });
}

function showCouldNotCompleteActionNotification(error) {
	showMessageNotification("Error with last action.", "Try again or sign out and in.", error);
}

function enableShareableLink(fileId) {
	return driveAPISend({
        type: "POST",
        url: "files/" + fileId + "/permissions",
        data: {
            role: "reader",
            type: "anyone"
        }
    });
}

function locateFile(fileId, windowId) {
	openDriveUrl(DRIVE_DOMAIN + "drive/blank?action=locate&id=" + fileId, windowId);
}