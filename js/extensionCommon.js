var inPopup;
if (location.href.includes("popup.html")) {
	inPopup = true;
}

var pageLoadingAnimationTimer;

$("document").ready(function() {
	
	pageLoadingAnimationTimer = setTimeout(function() {
		$("body").addClass("page-loading-animation");
	}, 10);
	
})

function loadPolymer(href) {
	return new Promise(function(resolve, reject) {
		if (href) {
			$("document").ready(function() {
				console.time(href);
				var link = document.createElement('script');
				link.type = 'module';
				link.src = href;
				//link.async = 'true'
				link.onload = function(e) {
					console.timeEnd(href);
					// patch: import polyfil causes icons (ie. #menu) to be exposed in DOM and they get selected instead!
					//if (DetectClient.isFirefox()) {
						$("body").after($("iron-iconset-svg"));
					//}
					resolve();
				};
				link.onerror = function(e) {
					console.error("jerror loading polymer: ", e);
					reject(e);
				};
				document.head.appendChild(link);
			});
		} else {
			resolve();
		}
	});
}

var polymerFile;
var polymerFile2;
if (inPopup) {
	polymerFile = "/vulcanized-polymer.js";
	polymerFile2 = "/vulcanized-polymer2.js";
} else {
	polymerFile = "/vulcanized-polymer-all.js";
}

var pageVisible = new Promise((resolve, reject) => {
	if (document.hidden) {
		document.addEventListener("visibilitychange", () => {
			if (document.visibilityState == "visible") {
				resolve();
			}
		});
	} else {
		// required for options page to show loading flash screen
		setTimeout(function() {
			resolve();
		}, 1);
	}
});

var polymerPromise = (async function() {
	// timeout 1s leaves enough time for popup window to open completely (instead of delay)
	await pageVisible;
	await loadPolymer(polymerFile);
    clearTimeout(pageLoadingAnimationTimer);
    $("[post-effects]").attr("effects", $("[post-effects]").attr("post-effects"));
    $("body").removeClass("page-loading-animation");
    // firefox patch: polymer removes this autmoatically in Chrome, but not in Firefox when using polyfills
    $("body").removeAttr("unresolved");
    $("body").attr("resolved", "");
})();
	
var polymerPromise2 = (async function() {
    await polymerPromise;
    await sleep(DetectClient.isChrome() ? 200 : 300);
    await loadPolymer(polymerFile2);
    $("body").removeAttr("unresolved2");
    $("body").attr("resolved2", "");
    $("body").removeClass("page-loading-animation");
})();

function initTemplate(idOrObject) {
	var $template;
	var isId;
	var $innerNode;
	
	if (typeof idOrObject === "string") {
		$template = $("#" + idOrObject);
		isId = true;

	} else {
		$template = idOrObject;
	}
	
	if ($template.length) {
		console.log("import template")
		var template = $template[0];
		
		var newNode = document.importNode(template.content, true);
		$template.replaceWith(newNode);
		
		if (isId) {
			$innerNode = $("#" + idOrObject.replace("Template", ""));
		}

		if ($innerNode && $innerNode.length) {
			initMessages("#" + idOrObject.replace("Template", "") + " *");
		} else {
			initMessages($template);
		}
	}

	if (isId) {
	// cannot use the $template handle above, must refetch new node because it seems the polymer methods are not attached when reusing $template object above
		$template = $("#" + idOrObject.replace("Template", ""));
	}
	
	if (!$template.length) {
		//alert("Could not find template: " + id.replace("Template", ""));
	}
	
	return $template;
}

function openDialog(idOrObject, params) {
	return new Promise(function(resolve, reject) {
		setTimeout(function() {
			params = initUndefinedObject(params);
		
			// required timeout to finish rendering the dialog node from initTemplate
			setTimeout(function() {
				polymerPromise2.then(function() {
					var $dialog;
					if (typeof idOrObject == "string") {
						if (idOrObject.includes("Template")) {
							$dialog = initTemplate(idOrObject);
						} else {
							$dialog = $("#" + idOrObject);
						}
					} else {
						$dialog = idOrObject;
					}
			
					$dialog.find("[dialog-other]").one("click", function() {
						resolve("other");
					});
		
					$dialog.find("[dialog-dismiss], .cancelDialog").one("click touchend", function() {
						resolve("cancel");
					});
		
					$dialog.find("[dialog-confirm], .okDialog").one("click touchend", function() {
						resolve("ok");
					});
		
					$dialog[0].open();
				});
			}, 1);
			
		}, 100);
	});
}

function showLoading() {
	$("#spinner").unhide();
}

function hideLoading() {
	$("#spinner").hidden();
}

function showMessage(msg) {
	showToast({toastId:"message", text:msg, duration:3});
}

async function showError(msg, actionParams) {
	await showToast({toastId:"error", text:msg, duration:10, actionParams:actionParams});
}

async function showToast(params) {
    var $toast = $("#" + params.toastId);
    await polymerPromise2;
	
    $toast[0].hide();
    $toast
        .attr("duration", params.duration ?  seconds(params.duration) : seconds(60))
        .attr("text", params.text)
        .get(0).show() // polymer call
    ;
    
    $toast.find(".closeToast").click(function() {
        $toast[0].hide();
    })

    if (!params.keepToastLinks) {
        var $toastLink = $toast.find(".toastLink");
        if (params.actionParams) {
            $toastLink
                .removeAttr("hidden")
                .off()
                .on("click", function() {
                    params.actionParams.onClick();
                })
            ;
            if (params.actionParams.text) {
                $toastLink[0].textContent = params.actionParams.text;
            }
        } else {
            $toastLink.attr("hidden", "");
        }
    }
}

function hideSaving() {
	$("#processing")[0].hide();
}

function hideError() {
	$("#error")[0].hide();
}

function dismissToast($dismiss) {
	$dismiss.closest("paper-toast")[0].hide();
}

function openGenericDialog(params) {
	return new Promise(function(resolve, reject) {
		var TITLE_SELECTOR = "h2";
		var CONTENT_SELECTOR = ".dialogDescription";
		
		polymerPromise2.then(function() {
	
			function setButtonLabel(buttonSelector, text) {
				var button = $dialog.find(buttonSelector)[0];
				if (button) {
					button.textContent = text;
				}
			}
			
			var $dialog = initTemplate("genericDialogTemplate");
			if (!params.title) {
				params.title = "";
			}
			$dialog.find(TITLE_SELECTOR).html(params.title);
	
			if (!params.content) {
				params.content = "";
			}
			
			if (typeof params.content == 'jquery') {
				$dialog.find(CONTENT_SELECTOR).append(params.content);
			} else {
				$dialog.find(CONTENT_SELECTOR).html(params.content);
			}
			
	
			if (!params.okLabel) {
				params.okLabel = getMessage("ok");
			}
			setButtonLabel(".okDialog", params.okLabel)
			
			if (params.showCancel) {
				$dialog.find(".cancelDialog").removeAttr("hidden");
			} else {
				$dialog.find(".cancelDialog").attr("hidden", true);
			}
			
			if (params.otherLabel) {
				$dialog.find(".otherDialog").removeAttr("hidden");
				setButtonLabel(".otherDialog", params.otherLabel)
			} else {
				$dialog.find(".otherDialog").attr("hidden", "");
			}
	
			openDialog($dialog).then(function(response) {
				resolve(response);
			});		
		});
	});
}

function niceAlert(message) {
	return openGenericDialog({content:message});
}

function isFocusOnInputElement() {
	return document.activeElement.nodeName == "SELECT" || document.activeElement.nodeName == "TEXTAREA" || document.activeElement.nodeName == "INPUT" || document.activeElement.nodeName == "OVERLAY-HOST" || document.activeElement.nodeName == "PAPER-BUTTON" || document.activeElement.nodeName == "PAPER-INPUT" || document.activeElement.nodeName == "PAPER-DROPDOWN-MENU" || document.activeElement.nodeName == "PAPER-ITEM" || document.activeElement.nodeName == "PAPER-TEXTAREA" || document.activeElement.nodeName == "EVENT-REMINDERS" || document.activeElement.nodeName == "IRON-AUTOGROW-TEXTAREA";
}

function getShadowRoot(selector) {
	let $node = $(selector);
	if ($node.length) {
		return $($node[0].shadowRoot);
	}
}