var storage;

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
	if (message.action == "accessGrantedInProgress") {
		//showLoading();
	} else if (message.action == "accessGranted") {
		hideLoading();
		$("#permissionDialog")[0].close();
		showMessage(getMessage("accessGranted"));
		sendResponse();
	}
});

$(document).ready(function() {

    (async () => {
	
        await polymerPromise;
        $("body").addClass("page-loading-animation");

        storage = await getStorage();
            
        if (storage.get("donationClicked")) {
            $("[mustDonate]").each(function(i, element) {
                $(this).removeAttr("mustDonate");
            });
        }

        // must init options BEFORE polymer because paper-radio-group would keep it's ripple on if i tried selecting it after it was loaded
        initOptions(storage);
        
        $("#logo").dblclick(function() {
            if (storage.get("donationClicked")) {
                storage.remove("donationClicked");
            } else {
                storage.enable("donationClicked");
            }
            location.reload(true);
        });
        
        $("#buttonIcons paper-radio-button").change(function(event) {
            if (storage.get("donationClicked")) {
                setButtonIcon(this.name);
            }
        });
        
        if (storage.get("desktopNotifications") == "none") {
            $(".notificationSubOptions").hide();
        }

        $("#desktopNotifications").on("paper-radio-group-changed", function() {
            if (this.selected == "none") {
                $(".notificationSubOptions").slideUp();
            } else {
                $(".notificationSubOptions").slideDown();
                
                // must init the first time so that subsequent changes are caught
                getStartPageToken({storage:storage}).then(() => {
                    initNotificationTimers();
                });
            }
        });
        
        $("#pollingInterval paper-item").click(function() {
            setTimeout(() => {
                initNotificationTimers();
            }, 1);
        });
        
        $("#restrictToMyDrive").change(function() {
            setTimeout(function() {
                restartWatch();
            }, 1);
        });
        
        if (!storage.get("notificationSound")) {
            $("#playSound").css("opacity", 0);
        }
        
        $("#notificationSound paper-item").click(function() {
            var soundName = $(this).attr("value");
            playNotificationSound(soundName);
            $("#playSound").css("opacity", 1);
        });
        
        $("#playSound").click(function() {
            playNotificationSound(storage.get("notificationSound"));
        });
        
        $("#testNotification").click(function() {
            //chrome.extension.getBackgroundPage().checkForModifiedFiles(true, true);
            var files = storage.get("files");
            if (files && files.length) {
                let testFile = files.last();
                if (testFile.kind == DRIVE_KIND) {
                    testFile = files.first();
                }
                showNotification(storage, "created", testFile);
            } else {
                openGenericDialog({title:"No files!", content:"Open the popup window with the button and select a folder with files first, then return here."});
            }
        });

        $("#resetMutedFiles").click(function() {
            storage.remove("mutedFiles");
            showMessage(getMessage("done"));
            location.reload();
        });
        
        var mutedFiles = storage.get("mutedFiles");
        if (mutedFiles) {
            console.log("muted files", mutedFiles)
            mutedFiles.forEach(function(mutedFile) {
                var $a = $("<li/>");
                $a
                    .text(mutedFile.name)
                ;
                $("#mutedFiles").append($a);
            });
        }

        $("#revokePermissions").click(function() {
            getStorage().then(async thisStorage => {
                storage = thisStorage;
                
                ensureWatchStopped().catch(error => {
                    // nothing
                })

                chrome.alarms.clear("gcmWatch", wasCleared => {
                    console.log("stop gcm alarm: " + wasCleared);
                });
                
                storage.get("tokenResponses").forEach(tokenResponse => {
                    console.log("removeCachedAuthToken");
                    if (chrome.identity) {
                        chrome.identity.removeCachedAuthToken({token:tokenResponse.access_token});
                    }

                    storage.remove("tokenResponses").then(() => {
                        fetchWrapper("https://jasonsavard.com/revokeOauthAccess?token=" + tokenResponse.access_token).then(() => {
                            showMessage(getMessage("done"));
                        }).catch(error => {
                            console.error(error);
                            niceAlert("Could not revoke access, revoke it manually more info: https://support.google.com/accounts/answer/3466521");
                        });

                        storage.remove("quickAccessFiles");
                        storage.remove("about");
                    }).catch(error => {
                        console.error(error);
                        showError(error);
                    });
                });
            });
        });

        $("#resetFollowedFolders").click(function() {
            storage.remove("foldersToFollow");
            storage.remove("foldersToUnfollow");
            showMessage(getMessage("done"));
        });

        $("#title").click(function() {
            processChanges(storage);
        })
        
        $("#maxItemsToDisplay").change(function() {
            fetchFiles();
        });
        
        $("#showImagesInNotifications").change(function() {
            var checkbox = this;
            if (checkbox.checked) {
                chrome.permissions.request({origins: ["*://*.googleusercontent.com/*"]}, function(granted) {
                    if (granted) {
                        // do nothing
                        return true;
                    } else {
                        checkbox.checked = false;
                        storage.disable("showImagesInNotifications");
                        return false;
                    }
                });
            }
        });
        
        const REVISIONS_ORIGINS = ["https://docs.google.com/"];
        
        if (chrome.permissions) {
            chrome.permissions.contains({origins:REVISIONS_ORIGINS}, granted => {
                $("#showRevisions").get(0).checked = granted;
            });
        }

        $("#showRevisions").click(function() {
            if (this.checked) {
                chrome.permissions.request({origins:REVISIONS_ORIGINS}, function(granted) {
                    $("#showRevisions").get(0).checked = granted;
                });
            } else {
                chrome.permissions.remove({origins:REVISIONS_ORIGINS}, function(removed) {
                    $("#showRevisions").get(0).checked = !removed;
                });
            }
        });
        
        $("#version").text("v." + chrome.runtime.getManifest().version);
        $("#version").click(function() {
            if (chrome.runtime.requestUpdateCheck) {
                chrome.runtime.requestUpdateCheck(function(status, details) {
                    console.log("updatechec:", details)
                    if (status == "no_update") {
                        openGenericDialog({title:"No update!", otherLabel: "More info"}).then(function(response) {
                            if (response == "other") {
                                location.href = "https://jasonsavard.com/wiki/Extension_Updates";
                            }
                        })
                    } else if (status == "throttled") {
                        openGenericDialog({title:"Throttled, try again later!"});
                    } else {
                        openGenericDialog({title:"Response: " + status + " new version " + details.version});
                    }
                });
            } else {
                location.href = "https://jasonsavard.com/wiki/Extension_Updates";
            }
        });
        
        if (!storage.get("tokenResponses")) {
            await openPermissionsDialog();
            hideLoading();
            showMessage(getMessage("accessGranted"));
        }
    })();
});