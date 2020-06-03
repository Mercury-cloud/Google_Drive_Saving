function closeWindow() {
	var windowId = localStorage["_permissionWindowId"];
	if (windowId) {
		localStorage.removeItem("_permissionWindowId");
		chrome.windows.remove(parseInt(windowId));
	}
	$("body").removeClass("page-loading-animation").append("You can close this window!");
	window.close();
}

function isPopupOrOptionsOpen() {
	return chrome.extension.getViews().some(thisWindow => {
        if (thisWindow.location.href.includes("popup.html")
            || thisWindow.location.href.includes("options.html")) {
			return true;
		}
	});
}

function showError(error) {
	$("body").removeClass("page-loading-animation");
	$("body").text(error);
}

$(document).ready(() => {

    (async () => {

        var code = getUrlValue(location.href, "code", true);
        if (code) {
            const securityToken = getUrlValue(location.href, "security_token");
            let scopes = getUrlValue(location.href, "scopes", true);
            if (scopes) {
                // patch for Google server response using +
                scopes = scopes.replaceAll("+", " ");
            }

            const accessTokenParams = {
                code:   code,
                scopes: scopes
            }

            try {
                const oAuthForDevices = await initOAuth();
                if (securityToken == oAuthForDevices.getSecurityToken()) {
                    const oauthUserResponse = await oAuthForDevices.getAccessToken(accessTokenParams);
                    console.log("after user response: ", oauthUserResponse);
    
                    const response = await postPermissionsGranted(oAuthForDevices);
                    await new Promise((resolve, reject) => {
                        if (isPopupOrOptionsOpen()) {
                            chrome.runtime.sendMessage({action:"accessGranted"}, function() {
                                closeWindow();
                                resolve();
                            });
                        } else {
                            location.href = chrome.runtime.getURL("popup.html");
                            resolve();
                        }
                    });
                } else {
                    throw "security_token not matched!";
                }
            } catch (error) {
                showError(error);
            }
        } else {
            const url = "https://jasonsavard.com/wiki/Granting_access?ref=permissionDenied&ext=drive";
            
            if (isPopupOrOptionsOpen()) {
                await openUrl(url);
            } else {
                await openUrl(url, parseInt(localStorage._currentWindowId));
                closeWindow();
            }
        }
    })(); // end async
});