const BROWSER_ACTION_OPEN_DRIVE = "browserActionOpenDrive";

chrome.runtime.onConnect.addListener(function(port) {
	port.onMessage.addListener(function(message) {
		console.log("message", message);
		if (message.action == "performCommand") {
			performCommand(message.params).then(response => {
				port.postMessage(response);
			}).catch(error => {
				error.textMessage = error.message;
				port.postMessage({error:JSON.stringify(error)});
			});
		}
	});
});

var DELAY_BETWEEN_API_CALLS_IN_SECONDS = seconds(1);
var checkForModifiedFilesTimer;

if (chrome.gcm) {
	chrome.gcm.onMessage.addListener(message => {
		console.log("on gcmmessage", new Date(), message);
		if (message.from == GCM_SENDER_ID) {
			if (message.data.change) {
				clearTimeout(checkForModifiedFilesTimer);
				checkForModifiedFilesTimer = setTimeout(() => {
					checkForModifiedFiles(true);
				}, DELAY_BETWEEN_API_CALLS_IN_SECONDS);
			}
		} else {
			console.warn("Unknown sender: " + message.from);
		}
	});
}

async function performCommand(params) {
    return fetchFiles(params);
}

chrome.alarms.onAlarm.addListener(function(alarm) {
	console.log("onAlarm: " + alarm.name + " " + new Date());
	if (alarm.name == "checkForModifiedFiles") {
		checkForModifiedFiles();
	} else if (alarm.name == "gcmWatch") {
		gcmWatch();
	}
});

async function resetModifiedFiles() {
	const storage = await getStorage();
    // save opened time
    if (storage.lastChangeFetchTime) {
        storage.set("lastNotificationsViewedTime", storage.lastChangeFetchTime);
    }
    
    chrome.browserAction.setBadgeText({text:""});
    chrome.browserAction.setTitle({title:""})
}

async function onButtonClicked(notificationId, buttonIndex) {
	const storage = await getStorage();
    if (notificationId == NotificationIds.EXTENSION_UPDATE) {
        if (buttonIndex == -1 || buttonIndex == 0) {
            const contributePage = encodeURIComponent(chrome.runtime.getURL("contribute.html"));
            createTab(`https://jasonsavard.com/wiki/Checker_Plus_for_Google_Drive_changelog?cUrl=${contributePage}`);
            chrome.notifications.clear(notificationId, function() {});
            sendGA("extensionUpdateNotification", "clicked button - see updates");
        } else if (buttonIndex == 1) {
            storage.enable("disabledExtensionUpdateNotifications");
            chrome.notifications.clear(notificationId);
            sendGA("extensionUpdateNotification", "clicked button - do not show future notifications");
        }
    } else if (notificationId == NotificationIds.ERROR) {
        createTab("https://jasonsavard.com/forum/categories/checker-plus-for-google-drive-feedback?ref=errorNotification");
        chrome.notifications.clear(notificationId, function() {});
        sendGA("errorNotification", "clicked button on notification");
    } else {	
        var file = JSON.parse(notificationId);

        if (buttonIndex == -1) {
            chrome.tabs.create({url:file.webViewLink});
        } else {
            if (file.notificationButtons[buttonIndex].title == NotificationButtons.SEE_REVISIONS) {
                var revisionWindow = openWindowInCenter("revisions.html", "revisions", "", 700, 600);
                revisionWindow.onload = function () {
                    revisionWindow.postMessage({file:file}, location.href);
                }
            } else if (file.notificationButtons[buttonIndex].title == NotificationButtons.MUTE) {
                muteFile(file, storage);
            } else if (file.notificationButtons[buttonIndex].title == NotificationButtons.DISMISS_ALL) {
                chrome.notifications.getAll(function(notifications) {
                    console.log(notifications);
                    for (openNotificationId in notifications) {
                        chrome.notifications.clear(openNotificationId);
                    }
                });
            }
        }
        chrome.notifications.clear(notificationId, () => {});
        resetModifiedFiles();
    }
}

chrome.notifications.onClicked.addListener(notificationId => {
	onButtonClicked(notificationId, -1);
});

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
	onButtonClicked(notificationId, buttonIndex);
});

if (chrome.runtime.onMessageExternal) {
	chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
        (async function() {
            try {
                if (sender.id == ExtensionId.LocalScreenshot || sender.id == ExtensionId.Screenshot) {
                    if (message.action == "enableShareableLink") {
                        const data = await enableShareableLink(message.fileId);
                        sendResponse({
                            data: data
                        });
                    } else if (message.action == "upload") {
                        const storage = await getStorage();
                        const screenshotFolderId = storage.get("screenshotFolderId");
                        if (screenshotFolderId) {
                            message.parentId = screenshotFolderId;
                        }
                        
                        try {
                            const response = await uploadFile(message);
                            if (response.error) {
                                throw response.error;
                            } else {
                                // legacy map v3 fields to v2 used still used in screenshot extension (didn't feel like updating screenshot extension)
                                sendResponse({
                                    data: {
                                        id: response.id,
                                        title: response.name,
                                        alternateLink: response.webViewLink
                                    }
                                });
                            }
                        } catch (error) {
                            if (error.code == 403) {
                                throw Error("You need more permissions to upload files.");
                            } else {
                                throw error;
                            }
                        }
                    } else if (message.action == "version") {
                        sendResponse(chrome.runtime.getManifest().version);
                    }
                } else {
                    throw "not allowed: " + sender.id;
                }
            } catch (error) {
                console.error(error);
                sendResponse({
                    error: error.message ? error.message : error
                });
            }
        })();
        // return true will wait for sendResponse
		return true;
	});
}

chrome.notifications.onClosed.addListener(function(notificationId, byUser) {
	if (notificationId == NotificationIds.EXTENSION_UPDATE) {
		if (byUser) {
			sendGA("extensionUpdateNotification", "closed notification");
		}
	} else {
		if (byUser) {
			resetModifiedFiles();
		}
	}
});

function initInstallData(storage) {
	// Note: Install dates only as old as implementation of this today, Dec. 21st 2012
	storage.setDate("installDate");
	storage.set("installVersion", chrome.runtime.getManifest().version);
	sendGA("installed", chrome.runtime.getManifest().version);
}

function openInstallPage() {
	var optionsUrl = chrome.runtime.getURL("options.html?action=install");
	chrome.tabs.create({url:"https://jasonsavard.com/thankYouForInstalling?app=drive&optionsUrl=" + encodeURIComponent(optionsUrl)});
}

if (chrome.runtime.onInstalled) {
	chrome.runtime.onInstalled.addListener(async details => {
        console.info("onInstalled", details);
        
        chrome.contextMenus.create({id: BROWSER_ACTION_OPEN_DRIVE, title: getMessage("openDrive"), contexts: ["browser_action"]}, function() {
            if (chrome.runtime.lastError) {
                console.warn(chrome.runtime.lastError.message);
            }
        });
		
		const storage = await getStorage();
        // leave this outside of install and update because in a background "event" page we need the alarms to be created
        if (storage.get("desktopNotifications") != "none") {
            initNotificationTimers();
        }
        
        if (details.reason == "install" && !storage.get("installDate")) {
            initInstallData(storage);
            
            if (chrome.storage.managed) {
                chrome.storage.managed.get(items => {
                    var doNotOpenWebsite;
                    if (chrome.runtime.lastError) {
                        console.error("managed error: " + chrome.runtime.lastError.message);
                    } else {
                        console.log("items", items);
                        if (items.DoNotOpenWebsiteOnInstall) {
                            doNotOpenWebsite = true;
                        }
                    }
                    if (!doNotOpenWebsite) {
                        openInstallPage();
                    }
                });
            } else {
                openInstallPage();
            }
        } else if (details.reason == "update") {
            var previousVersionObj = parseVersionString(details.previousVersion)
            var currentVersionObj = parseVersionString(chrome.runtime.getManifest().version);
            if (!storage.get("disabledExtensionUpdateNotifications") && (previousVersionObj.major != currentVersionObj.major || previousVersionObj.minor != currentVersionObj.minor)) {
                var options = {
                        type: "basic",
                        title: getMessage("extensionUpdated"),
                        message: "Checker Plus for Google Drive " + chrome.runtime.getManifest().version,
                        iconUrl: "images/icon128.png",
                        buttons: [{title: getMessage("seeUpdates")}]
                }

                if (DetectClient.isFirefox()) {
                    options.priority = 2;
                } else {
                    if (!DetectClient.isMac()) { // patch for macOS Catalina not working with requireinteraction
                        options.requireInteraction = true;
                    }
                }

                chrome.notifications.create(NotificationIds.EXTENSION_UPDATE, options, function(notificationId) {
                    if (chrome.runtime.lastError) {
                        console.error(chrome.runtime.lastError.message);
                    } else {
                        // nothing
                    }
                });
            }
            
            sendGA("options", storage.get("desktopNotifications"));
        }

        init();
	});
} else {
	getStorage().then(storage => {
		if (!storage.get("installDate")) {
			initInstallData(storage);
			openInstallPage();
		}
		
		if (storage.get("desktopNotifications") != "none") {
			initNotificationTimers();
		}
	});
}

if (chrome.runtime.onStartup) {
    chrome.runtime.onStartup.addListener(() => {
        init();
    })
}

if (chrome.runtime.setUninstallURL) {
	chrome.runtime.setUninstallURL("https://jasonsavard.com/uninstalled?app=drive");
}

if (chrome.contextMenus) {
    chrome.contextMenus.onClicked.addListener(function(info, tab) {
        if (info.menuItemId == BROWSER_ACTION_OPEN_DRIVE) {
            chrome.tabs.create({url:"https://drive.google.com"});
        }
    });
}

async function init() {
    storage = await getStorage();
    if (chrome.browserAction.setBadgeTextColor) {
        chrome.browserAction.setBadgeTextColor({color:"white"});
    }
    setButtonIcon(storage.get("buttonIcon"));
}