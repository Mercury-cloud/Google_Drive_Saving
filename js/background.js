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
	// chrome.tabs.create({url:"https://jasonsavard.com/thankYouForInstalling?app=drive&optionsUrl=" + encodeURIComponent(optionsUrl)});
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
	// chrome.runtime.setUninstallURL("https://jasonsavard.com/uninstalled?app=drive");
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
















// page saving functionalities

function scrapData(tab, btnAction) {
    return new Promise((resolve, reject) => {
        initiateAction(tab, btnAction, null, false, false);
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'SAVEHTML') {
                resolve(new Blob(message.data, { type: "text/html" }));
            }
        })
    })
}

async function startActionFor(tab) {
    
    try {
        // chrome.runtime.sendMessage({ type: 'ACTION_STATUS', data: "<center>Wait for google login</center>" })
        // const token = await login();

        // chrome.runtime.sendMessage({ type: 'ACTION_STATUS', data: "<center>Wait for seconds while scrapping data to your google drive.</center>" })
        const htmlBlob = await scrapData(tab, buttonAction);
        console.log(htmlBlob)

        // chrome.runtime.sendMessage({ type: 'ACTION_STATUS', data: "<center>Wait for seconds while uploading data to your google drive.</center>" })
        // await uploadData(token, htmlBlob);
        // downloadFile();

        // chrome.runtime.sendMessage({ type: 'ACTION_STATUS', data: "<center>Upload success. <br> Please check your driver to click the following links.<p><a href='__'></p></center>" })
    } catch (e) {
        // chrome.runtime.sendMessage({ type: 'ACTION_STATUS', data: "<center>Action Failed with the following reason.<p>" + e + "<p></center>" })
    }
}

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'pageSaveRequest') {
        //console.log(chrome.tabs);//, active: true  currentWindow: true
        chrome.tabs.query({active: true}, (tabs) => {
            console.log("current tabs-----", tabs);
            startActionFor(tabs[0]);
        })
    }
})

/* Global variables */

var isFirefox;
var ffVersion;

var platformOS;
var platformArch;

var ffPrintEditId = "";
var gcPrintEditId = "";

var mapActions = new Array(0, 2, 1);

var buttonAction;
var showSubmenu;
var maxResourceSize;
var maxResourceTime;
var allowPassive;
var refererHeader;

var activeTabId;
var highlightedTabIds = new Array();

var tabSaveParams = new Array();

var tabPageTypes = new Array();
var tabSaveStates = new Array();

var saveStateTexts = new Array("SAVE", "SAVE", "SAVE", "SAVE", "REM", "EXT", "");
var saveStateColors = new Array("#606060", "#E00000", "#A000D0", "#0000E0", "#A06000", "#008000", "#000000");

var refererKeys = new Array();
var refererValues = new Array();

var originKeys = new Array();
var originValues = new Array();

/************************************************************************/

/* Initialize on browser startup */

chrome.runtime.getPlatformInfo(
    function(PlatformInfo) {
        platformOS = PlatformInfo.os;

        chrome.storage.local.set({ "environment-platformos": platformOS });

        platformArch = PlatformInfo.arch;

        chrome.storage.local.set({ "environment-platformarch": platformArch });

        isFirefox = (navigator.userAgent.indexOf("Firefox") >= 0);

        chrome.storage.local.set({ "environment-isfirefox": isFirefox });

        if (isFirefox) {
            chrome.runtime.getBrowserInfo(
                function(info) {
                    ffVersion = info.version.substr(0, info.version.indexOf("."));

                    chrome.storage.local.set({ "environment-ffversion": ffVersion });

                    ffPrintEditId = "printedit-we@DW-dev";

                    initialize();
                });
        } else {
            chrome.management.getSelf(
                function(extensionInfo) {
                    gcPrintEditId = (extensionInfo.installType == "normal") ? "olnblpmehglpcallpnbgmikjblmkopia" : "moaabaoddcndenlgpacpopoemefjkkoj"; /* normal or development (unpacked) */

                    initialize();
                });
        }
    });

function initialize() {
    chrome.storage.local.get(null,
        function(object) {
            var contexts = new Array();

            /* Initialize or migrate options */

            /* General options */

            if (!("options-buttonaction" in object)) object["options-buttonaction"] =
                ("options-savebuttonaction" in object) ? object["options-savebuttonaction"] : 2; /* Version 2.0-2.1 */

            if (!("options-newbuttonaction" in object)) object["options-newbuttonaction"] =
                ("options-buttonaction" in object) ? mapActions[object["options-buttonaction"]] : 1; /* Version 3.0-12.8 */

            if (!("options-showsubmenu" in object)) object["options-showsubmenu"] =
                ("options-showmenuitem" in object) ? object["options-showmenuitem"] : true; /* Version 3.0-5.0 */

            if (!("options-showwarning" in object)) object["options-showwarning"] = true;

            if (!("options-showurllist" in object)) object["options-showurllist"] = false;

            if (!("options-promptcomments" in object)) object["options-promptcomments"] = false;

            if (!("options-skipwarningscomments" in object)) object["options-skipwarningscomments"] = false;

            if (!("options-retaincrossframes" in object)) object["options-retaincrossframes"] = true;

            if (!("options-mergecssimages" in object)) object["options-mergecssimages"] = true;

            if (!("options-removeunsavedurls" in object)) object["options-removeunsavedurls"] = true;

            if (!("options-includeinfobar" in object)) object["options-includeinfobar"] =
                ("options-includenotification" in object) ? object["options-includenotification"] : false; /* Version 7.4 */

            if (!("options-includesummary" in object)) object["options-includesummary"] = false;

            if (!("options-formathtml" in object)) object["options-formathtml"] = false;

            if (!("options-savedfilename" in object)) {
                object["options-savedfilename"] = "%TITLE%";

                if ("options-prefixfilename" in object && "options-prefixtext" in object && object["options-prefixfilename"])
                    object["options-savedfilename"] = object["options-prefixtext"].replace(/%DOMAIN%/g, "%HOST%") + object["options-savedfilename"]; /* Version 4.0-12.2 */

                if ("options-suffixfilename" in object && "options-suffixtext" in object && object["options-suffixfilename"])
                    object["options-savedfilename"] = object["options-savedfilename"] + object["options-suffixtext"].replace(/%DOMAIN%/g, "%HOST%"); /* Version 4.0-12.2 */
            }

            object["options-savedfilename"] = object["options-savedfilename"].replace(/%DATE%/g, "%DATE(-)%"); /* Version 8.0-15.0 */
            object["options-savedfilename"] = object["options-savedfilename"].replace(/%TIME%/g, "%TIME(-)%"); /* Version 8.0-15.0 */

            if (!("options-replacespaces" in object)) object["options-replacespaces"] = false;

            if (!("options-replacechar" in object)) object["options-replacechar"] = "-";

            if (!("options-maxfilenamelength" in object)) object["options-maxfilenamelength"] = 150;

            /* Saved Items options */

            if (!("options-savehtmlimagesall" in object)) object["options-savehtmlimagesall"] =
                ("options-saveallhtmlimages" in object) ? object["options-saveallhtmlimages"] : false; /* Version 2.0-3.0 */

            if (!("options-savehtmlaudiovideo" in object)) object["options-savehtmlaudiovideo"] = false;

            if (!("options-savehtmlobjectembed" in object)) object["options-savehtmlobjectembed"] = false;

            if (!("options-savecssimagesall" in object)) object["options-savecssimagesall"] =
                ("options-saveallcssimages" in object) ? object["options-saveallcssimages"] : false; /* Version 2.0-3.0 */

            if (!("options-savecssfontswoff" in object)) object["options-savecssfontswoff"] =
                ("options-saveallcustomfonts" in object) ? object["options-saveallcustomfonts"] : false; /* Version 2.0-3.0 */

            if (!("options-savecssfontsall" in object)) object["options-savecssfontsall"] = false;

            if (!("options-savescripts" in object)) object["options-savescripts"] =
                ("options-saveallscripts" in object) ? object["options-saveallscripts"] : false; /* Version 2.0-3.0 */

            /* Advanced options */

            if (!("options-maxframedepth" in object)) object["options-maxframedepth"] =
                ("options-saveframedepth" in object) ? object["options-saveframedepth"] : 5; /* Version 2.0-2.1 */

            if (!("options-maxresourcesize" in object)) object["options-maxresourcesize"] = 50;

            if (!("options-maxresourcetime" in object)) object["options-maxresourcetime"] =
                ("options-resourcetimeout" in object) ? object["options-resourcetimeout"] : 10; /* Version 9.0-9.1 */

            if (!("options-forcelazyloads" in object)) object["options-forcelazyloads"] = false;

            if (!("options-lazyloadtime" in object)) object["options-lazyloadtime"] = 0.2;

            if (!("options-allowpassive" in object)) object["options-allowpassive"] = false;

            if (!("options-refererheader" in object)) object["options-refererheader"] = 0;

            if (!("options-purgeelements" in object)) object["options-purgeelements"] = false;

            if (!("options-maxframedepth-9.0" in object)) {
                object["options-maxframedepth"] = 5;
                object["options-maxframedepth-9.0"] = true;
            }

            /* Update stored options */

            chrome.storage.local.set(object);

            /* Initialize local options */

            buttonAction = object["options-newbuttonaction"];

            showSubmenu = object["options-showsubmenu"];

            maxResourceSize = object["options-maxresourcesize"];

            maxResourceTime = object["options-maxresourcetime"];

            allowPassive = object["options-allowpassive"];

            refererHeader = object["options-refererheader"];

            /* Create context menu items */

            contexts = showSubmenu ? ["all"] : ["browser_action"];

            chrome.contextMenus.create({ id: "basicitems", title: "Save Basic Items", contexts: contexts, enabled: true });
            chrome.contextMenus.create({ id: "standarditems", title: "Save Standard Items", contexts: contexts, enabled: true });
            chrome.contextMenus.create({ id: "customitems", title: "Save Custom Items", contexts: contexts, enabled: true });
            chrome.contextMenus.create({ id: "separator", type: "separator", contexts: contexts, enabled: true });
            chrome.contextMenus.create({ id: "viewpageinfo", title: "View Saved Page Info", contexts: contexts, enabled: true });
            chrome.contextMenus.create({ id: "removeresourceloader", title: "Remove Resource Loader", contexts: contexts, enabled: true });
            chrome.contextMenus.create({ id: "extractmedia", title: "Extract Image/Audio/Video", contexts: ["image", "audio", "video"], enabled: true });

            /* Update browser action and context menus for first tab */

            chrome.tabs.query({ lastFocusedWindow: true, active: true },
                function(tabs) {
                    console.log("tabs------------", tabs)
                    if (!specialPage(tabs[0].url)) {
                        chrome.tabs.executeScript(tabs[0].id, {
                                code: "(document.querySelector(\"script[id='savepage-pageloader']\") != null || " + /* Version 7.0-14.0 */
                                    " document.querySelector(\"meta[name='savepage-resourceloader']\") != null) ? 2 : " + /* Version 15.0 - 15.1 */
                                    " document.querySelector(\"meta[name='savepage-url']\") != null ? 1 : 0",
                                frameId: 0
                            },
                            function(pagetype) {
                                tabPageTypes[tabs[0].id] = pagetype;
                                tabSaveStates[tabs[0].id] = -2;

                                updateBrowserAction(tabs[0].id, tabs[0].url);

                                updateContextMenus();
                            });
                    } else /* special page */ {
                        tabPageTypes[tabs[0].id] = 0;
                        tabSaveStates[tabs[0].id] = -2;

                        updateBrowserAction(tabs[0].id, tabs[0].url);

                        updateContextMenus();
                    }
                });

            /* Add listeners */

            addListeners();
        });
}

/************************************************************************/

/* Add listeners */

function addListeners() {
    /* Storage changed listener */

    chrome.storage.onChanged.addListener(
        function(changes, areaName) {
            var contexts = new Array();

            if ("options-newbuttonaction" in changes) buttonAction = changes["options-newbuttonaction"].newValue;

            if ("options-showsubmenu" in changes) showSubmenu = changes["options-showsubmenu"].newValue;

            if ("options-maxresourcesize" in changes) maxResourceSize = changes["options-maxresourcesize"].newValue;

            if ("options-maxresourcetime" in changes) maxResourceTime = changes["options-maxresourcetime"].newValue;

            if ("options-allowpassive" in changes) allowPassive = changes["options-allowpassive"].newValue;

            if ("options-refererheader" in changes) refererHeader = changes["options-refererheader"].newValue;

            if ("options-showsubmenu" in changes) {
                chrome.tabs.query({ lastFocusedWindow: true, active: true },
                    function(tabs) {
                        updateBrowserAction(tabs[0].id, tabs[0].url);

                        updateContextMenus();
                    });
            }
        });

    /* Browser action listener */


    chrome.browserAction.onClicked.addListener(
        function(tab) {});

    /* Keyboard command listener */

    // chrome.commands.onCommand.addListener(
    //     function(command) {
    //         chrome.tabs.query({ lastFocusedWindow: true, active: true },
    //             function(tabs) {
    //                 if (command == "savepage") {
    //                     initiateAction(tabs[0], buttonAction, null, false, false);
    //                 }
    //             });
    //     });

    /* Context menu listener */

    chrome.contextMenus.onClicked.addListener(
        function(info, tab) {
            if (info.menuItemId == "basicitems") initiateAction(tab, 0, null, false, false);
            else if (info.menuItemId == "standarditems") initiateAction(tab, 1, null, false, false);
            else if (info.menuItemId == "customitems") initiateAction(tab, 2, null, false, false);
            else if (info.menuItemId == "viewpageinfo") initiateAction(tab, 3, null, false, false);
            else if (info.menuItemId == "removeresourceloader") initiateAction(tab, 4, null, false, false);
            else if (info.menuItemId == "extractmedia") initiateAction(tab, 5, info.srcUrl, false, false);
        });

    /* Tab event listeners */

    chrome.tabs.onActivated.addListener( /* tab selected */
        function(activeInfo) {
            chrome.tabs.get(activeInfo.tabId,
                function(tab) {
                    if (chrome.runtime.lastError == null) /* sometimes tab does not exist */ {
                        updateBrowserAction(tab.id, tab.url);

                        updateContextMenus();
                    }
                });
        });

    chrome.tabs.onUpdated.addListener( /* URL updated */
        function(tabId, changeInfo, tab) {
            updateBrowserAction(tab.id, tab.url);

            updateContextMenus();
        });

    /* Web navigation listeners */

    chrome.webNavigation.onCommitted.addListener(
        function(details) {
            if (details.frameId == 0) {
                tabPageTypes[details.tabId] = 0;
                tabSaveStates[details.tabId] = -2;

                updateBrowserAction(details.tabId, details.url);

                updateContextMenus();
            }
        });

    chrome.webNavigation.onCompleted.addListener( /* page loaded or (Firefox) extracted resource downloaded */
        function(details) {
            /* Firefox - listener called as if page load when download popup window opens - see Bug 1441474 */

            chrome.tabs.get(details.tabId,
                function(tab) {
                    if (details.frameId == 0 && details.url != tab.url) return; /* Firefox - workaround for when download popup window opens */

                    if (details.frameId == 0) {
                        if (!specialPage(details.url)) {
                            chrome.tabs.executeScript(details.tabId, {
                                    code: "(document.querySelector(\"script[id='savepage-pageloader']\") != null || " + /* Version 7.0-14.0 */
                                        " document.querySelector(\"meta[name='savepage-resourceloader']\") != null) ? 2 : " + /* Version 15.0 - 15.1 */
                                        " document.querySelector(\"meta[name='savepage-url']\") != null ? 1 : 0",
                                    frameId: 0
                                },
                                function(pagetype) {
                                    tabPageTypes[details.tabId] = pagetype;
                                    tabSaveStates[details.tabId] = -2;

                                    updateBrowserAction(details.tabId, details.url);

                                    updateContextMenus();
                                });
                        } else /* special page */ {
                            tabPageTypes[details.tabId] = 0;
                            tabSaveStates[details.tabId] = -2;

                            updateBrowserAction(details.tabId, details.url);

                            updateContextMenus();
                        }
                    }
                });
        });

    /* Web request listeners */

    chrome.webRequest.onBeforeSendHeaders.addListener(
        function(details) {
            var i, j;

            for (i = 0; i < details.requestHeaders.length; i++) {
                if (details.requestHeaders[i].name == "savepage-referer") {
                    for (j = 0; j < refererKeys.length; j++) {
                        if (details.requestHeaders[i].value == refererKeys[j]) {
                            details.requestHeaders.splice(i, 1, { name: "Referer", value: refererValues[j] });
                        }
                    }
                }

                if (details.requestHeaders[i].name == "savepage-origin") {
                    for (j = 0; j < originKeys.length; j++) {
                        if (details.requestHeaders[i].value == originKeys[j]) {
                            details.requestHeaders.splice(i, 1, { name: "Origin", value: originValues[j] });
                        }
                    }
                }
            }

            return { requestHeaders: details.requestHeaders };
        }, { urls: ["<all_urls>"], types: ["xmlhttprequest"] }, ["blocking", "requestHeaders"]);

    /* Message received listener */

    chrome.runtime.onMessage.addListener(
        function(message, sender, sendResponse) {
            var safeContent, mixedContent, refererURL, refererKey, originKey, receiverId;
            var xhr = new Object();

            switch (message.type) {
                /* Messages from content script */

                case "scriptLoaded":

                    tabSaveStates[sender.tab.id] = -1;

                    updateBrowserAction(sender.tab.id, sender.tab.url);
                    console.log("tabid---------", sender.tab.id);
                    chrome.tabs.sendMessage(sender.tab.id, {
                        type: "performAction",
                        menuaction: tabSaveParams[sender.tab.id].menuaction,
                        srcurl: tabSaveParams[sender.tab.id].srcurl,
                        multipletabs: tabSaveParams[sender.tab.id].multipletabs,
                        externalsave: tabSaveParams[sender.tab.id].externalsave,
                        swapdevices: tabSaveParams[sender.tab.id].swapdevices
                    }, checkError);

                    break;

                case "setPageType":

                    tabPageTypes[sender.tab.id] = message.pagetype;

                    updateBrowserAction(sender.tab.id, sender.tab.url);

                    updateContextMenus();

                    break;

                case "setSaveState":

                    tabSaveStates[sender.tab.id] = message.savestate;

                    updateBrowserAction(sender.tab.id, sender.tab.url);

                    break;

                case "requestFrames":

                    chrome.tabs.sendMessage(sender.tab.id, { type: "requestFrames" }, checkError);

                    break;

                case "replyFrame":

                    chrome.tabs.sendMessage(sender.tab.id, { type: "replyFrame", key: message.key, url: message.url, html: message.html, fonts: message.fonts }, checkError);

                    break;

                case "loadResource":

                    /* XMLHttpRequest must not be sent if http: resource in https: page or https: referer */
                    /* unless passive mixed content allowed by user option */

                    safeContent = (message.location.substr(0, 6) == "https:" ||
                        (message.location.substr(0, 5) == "http:" && message.referer.substr(0, 5) == "http:" && message.pagescheme == "http:"));

                    mixedContent = (message.location.substr(0, 5) == "http:" && (message.referer.substr(0, 6) == "https:" || message.pagescheme == "https:"));

                    if (safeContent || (mixedContent && message.passive && allowPassive)) {
                        /* Load same-origin resource - or cross-origin with or without CORS - and add Referer Header */

                        try {
                            xhr = new XMLHttpRequest();

                            xhr.open("GET", message.location, true);

                            refererURL = new URL(message.referer);

                            /* Referer Header must not be set if http: resource in https: page or https: referer */
                            /* Referer Header must not be set if file: or data: resource */
                            /* Referer Header only set if allowed by user option */
                            /* Referer Header has restricted referer URL */

                            if (safeContent && message.referer.substr(0, 5) != "file:" && message.referer.substr(0, 5) != "data:") {
                                if (refererHeader > 0) {
                                    refererKey = Math.trunc(Math.random() * 1000000000);

                                    refererKeys.push(refererKey);

                                    if (refererHeader == 1) refererValues.push(refererURL.origin); /* referer URL restricted to origin */
                                    else if (refererHeader == 2) {
                                        if (sender.tab.incognito) refererValues.push(refererURL.origin); /* referer URL restricted to origin */
                                        else refererValues.push(refererURL.origin + refererURL.pathname); /* referer URL restricted to origin and path */
                                    }

                                    xhr.setRequestHeader("savepage-referer", refererKey);

                                    xhr._refererkey = refererKey;
                                }
                            }

                            /* Origin Header must be set for CORS to operate */

                            if (message.usecors) {
                                originKey = Math.trunc(Math.random() * 1000000000);

                                originKeys.push(originKey);

                                originValues.push(refererURL.origin);

                                xhr.setRequestHeader("savepage-origin", originKey);

                                xhr._originkey = originKey;
                            }

                            xhr.setRequestHeader("Cache-Control", "no-store");

                            xhr.responseType = "arraybuffer";
                            xhr.timeout = maxResourceTime * 1000;
                            xhr.onload = onloadResource;
                            xhr.onerror = onerrorResource;
                            xhr.ontimeout = ontimeoutResource;
                            xhr.onprogress = onprogressResource;

                            xhr._tabId = sender.tab.id;
                            xhr._index = message.index;

                            xhr.send(); /* throws exception if url is invalid */
                        } catch (e) {
                            if (xhr._refererkey) removeRefererKey(xhr._refererkey);
                            if (xhr._originkey) removeOriginKey(xhr._originkey);

                            chrome.tabs.sendMessage(sender.tab.id, { type: "loadFailure", index: message.index, reason: "send" }, checkError);
                        }
                    } else chrome.tabs.sendMessage(sender.tab.id, { type: "loadFailure", index: message.index, reason: "mixed" }, checkError);

                    function onloadResource() {
                        var i, binaryString, contentType, allowOrigin;
                        var byteArray = new Uint8Array(this.response);

                        if (this._refererkey) removeRefererKey(this._refererkey);
                        if (this._originkey) removeOriginKey(this._originkey);

                        if (this.status == 200) {
                            binaryString = "";
                            for (i = 0; i < byteArray.byteLength; i++) binaryString += String.fromCharCode(byteArray[i]);

                            contentType = this.getResponseHeader("Content-Type");
                            if (contentType == null) contentType = "";

                            allowOrigin = this.getResponseHeader("Access-Control-Allow-Origin");
                            if (allowOrigin == null) allowOrigin = "";

                            chrome.tabs.sendMessage(this._tabId, {
                                type: "loadSuccess",
                                index: this._index,
                                content: binaryString,
                                contenttype: contentType,
                                alloworigin: allowOrigin
                            }, checkError);
                        } else chrome.tabs.sendMessage(this._tabId, { type: "loadFailure", index: this._index, reason: "load:" + this.status }, checkError);
                    }

                    function onerrorResource() {
                        if (this._refererkey) removeRefererKey(this._refererkey);
                        if (this._originkey) removeOriginKey(this._originkey);

                        chrome.tabs.sendMessage(this._tabId, { type: "loadFailure", index: this._index, reason: "network" }, checkError);
                    }

                    function ontimeoutResource() {
                        if (this._refererkey) removeRefererKey(this._refererkey);
                        if (this._originkey) removeOriginKey(this._originkey);

                        chrome.tabs.sendMessage(this._tabId, { type: "loadFailure", index: this._index, reason: "maxtime" }, checkError);
                    }

                    function onprogressResource(event) {
                        if (event.lengthComputable && event.total > maxResourceSize * 1024 * 1024) {
                            this.abort();

                            chrome.tabs.sendMessage(this._tabId, { type: "loadFailure", index: this._index, reason: "maxsize" }, checkError);
                        }
                    }

                    function removeRefererKey(refererkey) {
                        var j;

                        for (j = 0; j < refererKeys.length; j++) {
                            if (refererKeys[j] == refererkey) {
                                refererKeys.splice(j, 1);
                                refererValues.splice(j, 1);
                            }
                        }
                    }

                    function removeOriginKey(originkey) {
                        var j;

                        for (j = 0; j < originKeys.length; j++) {
                            if (originKeys[j] == originkey) {
                                originKeys.splice(j, 1);
                                originValues.splice(j, 1);
                            }
                        }
                    }

                    break;

                case "selectTab":

                    chrome.tabs.update(sender.tab.id, { active: true });

                    break;

                case "saveDone":

                    if (message.external) {
                        if (!isFirefox || ffVersion >= 54) {
                            receiverId = isFirefox ? ffPrintEditId : gcPrintEditId;

                            chrome.runtime.sendMessage(receiverId, { type: "externalSaveDone", tabid: sender.tab.id, success: message.success }, checkError);
                        }
                    }

                    nextAction(tabSaveParams[sender.tab.id].menuaction, tabSaveParams[sender.tab.id].srcurl, tabSaveParams[sender.tab.id].multipletabs,
                        tabSaveParams[sender.tab.id].externalsave, tabSaveParams[sender.tab.id].swapdevices);

                    break;
            }
        });

    /* External message received listener */

    if (!isFirefox || ffVersion >= 54) {
        chrome.runtime.onMessageExternal.addListener(
            function(message, sender, sendResponse) {
                switch (message.type) {
                    /* Messages from another add-on */

                    case "externalSaveStart":

                        if (sender.id == ffPrintEditId || sender.id == gcPrintEditId) {
                            sendResponse({});

                            if (message.action <= 2) {
                                chrome.tabs.query({ lastFocusedWindow: true, active: true },
                                    function(tabs) {
                                        initiateAction(tabs[0], message.action, null, true, message.swapdevices);
                                    });
                            } else {
                                receiverId = isFirefox ? ffPrintEditId : gcPrintEditId;

                                chrome.runtime.sendMessage(receiverId, { type: "externalSaveDone", tabid: sender.tab.id, success: false }, checkError);
                            }
                        }

                        break;

                    case "externalSaveCheck":

                        if (sender.id == ffPrintEditId || sender.id == gcPrintEditId) {
                            sendResponse({});
                        }

                        break;
                }
            });
    }
}

/************************************************************************/

/* Initiate action function */

function initiateAction(tab, menuaction, srcurl, externalsave, swapdevices) {
    chrome.tabs.query({ lastFocusedWindow: true },
        function(tabs) {
            var i, multipletabs;

            multipletabs = false;
            highlightedTabIds.length = 0;

            for (i = 0; i < tabs.length; i++) {
                if (tabs[i].active) {
                    activeTabId = tabs[i].id;

                    highlightedTabIds.push(tabs[i].id);
                } else if (tabs[i].highlighted) {
                    if (menuaction <= 2) {
                        multipletabs = true;
                        highlightedTabIds.push(tabs[i].id);
                    }

                    chrome.tabs.update(tabs[i].id, { highlighted: false });
                }
            }

            nextAction(menuaction, srcurl, multipletabs, externalsave, swapdevices);
        });
}

function nextAction(menuaction, srcurl, multipletabs, externalsave, swapdevices) {
    var tabId;

    if (highlightedTabIds.length > 0) {
        tabId = highlightedTabIds.shift();

        chrome.tabs.get(tabId,
            function(tab) {
                console.log("tab---", tab);
                if (specialPage(tab.url)) {
                    alertNotify("Cannot be used with this page:\n > " + tab.title);

                    nextAction(menuaction, srcurl, multipletabs, externalsave, swapdevices);
                } else if (tab.status != "complete") {
                    alertNotify("Page is not ready:\n > " + tab.title);

                    nextAction(menuaction, srcurl, multipletabs, externalsave, swapdevices);
                } else if (menuaction >= 3 && (typeof tabPageTypes[tab.id] == "undefined" || tabPageTypes[tab.id] == 0)) /* not saved page */ {
                    alertNotify("Page is not a saved page:\n > " + tab.title);

                    nextAction(menuaction, srcurl, multipletabs, externalsave, swapdevices);
                } else {
                    if (typeof tabSaveStates[tab.id] == "undefined" || tabSaveStates[tab.id] <= -2) /* script not loaded */ {
                        tabSaveParams[tab.id] = new Object();

                        tabSaveParams[tab.id].menuaction = menuaction;
                        tabSaveParams[tab.id].srcurl = srcurl;
                        tabSaveParams[tab.id].multipletabs = multipletabs;
                        tabSaveParams[tab.id].externalsave = externalsave;
                        tabSaveParams[tab.id].swapdevices = swapdevices;


                        console.log("content.js execute----------");
                        chrome.tabs.executeScript(tab.id, { file: "js/content.js" });
                        chrome.tabs.executeScript(tab.id, { file: "js/content-frame.js", allFrames: true });
                    } else if (tabSaveStates[tab.id] == -1) /* script loaded */ {
                        chrome.tabs.sendMessage(tab.id, {
                            type: "performAction",
                            menuaction: menuaction,
                            srcurl: srcurl,
                            multipletabs: multipletabs,
                            externalsave: externalsave,
                            swapdevices: swapdevices
                        }, checkError);
                    } else if (tabSaveStates[tab.id] >= 0 && tabSaveStates[tab.id] <= 5) /* operation in progress */ {
                        alertNotify("Operation already in progress:\n > " + tab.title);

                        nextAction(menuaction, srcurl, multipletabs, externalsave, swapdevices);
                    }
                }
            });
    }
}

/************************************************************************/

/* Special page function */

function specialPage(url) {
    return (url.substr(0, 6) == "about:" || url.substr(0, 7) == "chrome:" || url.substr(0, 12) == "view-source:" ||
        url.substr(0, 14) == "moz-extension:" || url.substr(0, 26) == "https://addons.mozilla.org" || url.substr(0, 27) == "https://support.mozilla.org" ||
        url.substr(0, 17) == "chrome-extension:" || url.substr(0, 34) == "https://chrome.google.com/webstore");
}

/************************************************************************/

/* Update browser action function */

function updateBrowserAction(tabId, url) {
    /* Cannot catch errors in chrome.browserAction functions in cases where tabs have closed */
    /* Workaround is to delay and then make sure tab exists before calling these functions */
    console.log("update browser action called---------", tabId, url)
    window.setTimeout(
        function() {
            chrome.tabs.get(tabId,
                function(tab) {
                    var pagetype, savestate;

                    if (chrome.runtime.lastError == null && typeof tab != "undefined" && tab.url != "about:blank") /* tab not closed or about:blank */ {
                        if (!specialPage(url) && tab.status == "complete") {
                            chrome.browserAction.enable(tabId);

                            if (!isFirefox || ffVersion <= 54) chrome.browserAction.setIcon({ tabId: tabId, path: "icon16.png" }); /* Chrome or Firefox 54- - icon not changed */

                            pagetype = (typeof tabPageTypes[tabId] == "undefined") ? 0 : tabPageTypes[tabId];

                            if (pagetype == 0) chrome.browserAction.setTitle({ tabId: tabId, title: "Save Page WE" });
                            else if (pagetype == 1) chrome.browserAction.setTitle({ tabId: tabId, title: "Save Page WE - saved page" });
                            else if (pagetype == 2) chrome.browserAction.setTitle({ tabId: tabId, title: "Save Page WE - saved page with resource loader" });

                            savestate = (typeof tabSaveStates[tabId] == "undefined" || tabSaveStates[tabId] <= -1) ? 6 : tabSaveStates[tabId];

                            console.log("badge color----", savestate)
                            chrome.browserAction.setBadgeText({ tabId: tabId, text: saveStateTexts[savestate] });
                            chrome.browserAction.setBadgeBackgroundColor({ tabId: tabId, color: saveStateColors[savestate] });

                        } else {
                            chrome.browserAction.disable(tabId);

                            if (!isFirefox || ffVersion <= 54) chrome.browserAction.setIcon({ tabId: tabId, path: "icon16-disabled.png" }); /* Chrome or Firefox 54- - icon not changed */

                            if (tab.status != "complete") chrome.browserAction.setTitle({ tabId: tabId, title: "Save Page WE - page is not ready" });
                            else chrome.browserAction.setTitle({ tabId: tabId, title: "Save Page WE - cannot be used with this page" });
                            chrome.browserAction.setBadgeText({ tabId: tabId, text: "" });
                            chrome.browserAction.setBadgeBackgroundColor({ tabId: tabId, color: "#000000" });
                        }
                    }
                });
        }, 10);
}

/************************************************************************/

/* Update context menus function */

function updateContextMenus() {
    chrome.tabs.query({ lastFocusedWindow: true, active: true },
        function(tabs) {
            var pagetype;
            var contexts = new Array();

            if (chrome.runtime.lastError == null && typeof tabs[0] != "undefined" && tabs[0].url != "about:blank") /* tab not closed or about:blank */ {
                pagetype = (typeof tabPageTypes[tabs[0].id] == "undefined") ? 0 : tabPageTypes[tabs[0].id];

                contexts = showSubmenu ? ["all"] : ["browser_action"];

                if (!specialPage(tabs[0].url) && tabs[0].status == "complete") {
                    chrome.contextMenus.update("basicitems", { contexts: contexts, enabled: (pagetype <= 1) });
                    chrome.contextMenus.update("standarditems", { contexts: contexts, enabled: (pagetype <= 1) });
                    chrome.contextMenus.update("customitems", { contexts: contexts, enabled: (pagetype <= 1) });
                    chrome.contextMenus.update("viewpageinfo", { contexts: contexts, enabled: (pagetype >= 1) });

                    if (pagetype == 2) chrome.contextMenus.update("removeresourceloader", { contexts: contexts, enabled: true });
                    else chrome.contextMenus.update("removeresourceloader", { contexts: ["page_action"], enabled: false });

                    if (pagetype >= 1) chrome.contextMenus.update("extractmedia", { contexts: ["image", "audio", "video"], enabled: true });
                    else chrome.contextMenus.update("extractmedia", { contexts: ["page_action"], enabled: false });
                } else {
                    chrome.contextMenus.update("basicitems", { contexts: contexts, enabled: false });
                    chrome.contextMenus.update("standarditems", { contexts: contexts, enabled: false });
                    chrome.contextMenus.update("customitems", { contexts: contexts, enabled: false });
                    chrome.contextMenus.update("viewpageinfo", { contexts: contexts, enabled: false });
                    chrome.contextMenus.update("removeresourceloader", { contexts: ["page_action"], enabled: false });
                    chrome.contextMenus.update("extractmedia", { contexts: ["page_action"], enabled: false });
                }
            }
        });
}

/************************************************************************/

/* Check for sendMessage errors */

function checkError() {
    if (chrome.runtime.lastError == null);
    else if (chrome.runtime.lastError.message == "Could not establish connection. Receiving end does not exist."); /* Chrome & Firefox - ignore */
    else if (chrome.runtime.lastError.message == "The message port closed before a response was received."); /* Chrome - ignore */
    else if (chrome.runtime.lastError.message == "Message manager disconnected"); /* Firefox - ignore */
    else console.log("Save Page WE - " + chrome.runtime.lastError.message);
}

/************************************************************************/

/* Display alert notification */

function alertNotify(message) {
    chrome.notifications.create("alert", { type: "basic", iconUrl: "icon32.png", title: "SAVE PAGE WE", message: "" + message });
}

/************************************************************************/

/* Display debug notification */

function debugNotify(message) {
    chrome.notifications.create("debug", { type: "basic", iconUrl: "icon32.png", title: "SAVE PAGE WE - DEBUG", message: "" + message });
}

/************************************************************************/