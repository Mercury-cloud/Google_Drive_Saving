var storage;
var parentId = getUrlValue(location.href, "parentId");

function uploadFiles(files) {
	$("#uploadIcon").css("opacity", 0);
	$("#mainSpinner").show();
	
	var filePromises = [];
	$.each(files, function(index, file) {
		
		var $div = $("<div class='file layout horizontal center'><paper-button class='fileName'></paper-button> <paper-spinner active class='fileStatus'></paper-spinner><paper-icon-button icon='search' class='locate' hidden></paper-icon-button></div>");
		$div.find(".fileName").text(file.name);
		$("#files").append($div);
		
		var filePromise = uploadInputFile(file);
		filePromise.then(function(response) {
			$div.find(".fileStatus").attr("hidden", "");
			$div.find(".fileName").click(function() {
				openDriveUrl(response.webViewLink, parseInt(localStorage._currentWindowId));
				chrome.windows.remove(parseInt(localStorage._uploadWindowId));
			});
			$div.find(".locate").removeAttr("hidden");
			$div.find(".locate").click(function() {
				locateFile(response.id, parseInt(localStorage._currentWindowId));
				chrome.windows.remove(parseInt(localStorage._uploadWindowId));
			});
		}).catch(function(error) {
			$div.find(".fileStatus").text(error);
			$div.css("color", "red");
		});
		
		filePromises.push(filePromise);
	})
	
	Promise.all(filePromises).then(function(arrayOfResults) {
		console.log("arrayOfResults", arrayOfResults);
		return fetchFiles();
	}).catch(function(error) {
		showError("Error: " + error);
	}).then(function() {
		$("#mainSpinner").hide();
		$("#uploadIcon").css("opacity", 1);
	});
}

$(document).ready(function() {
	getStorage().then(thisStorage => {
		storage = thisStorage;
		
		$("#uploadIcon").click(function() {
			$("#inputFile").click();
		});
		
		$("body")
			.on("dragover", function(e) {
				e.stopPropagation();
				e.preventDefault();
				
				e.originalEvent.dataTransfer.dropEffect = "copy";
				$("body").css("background", "orange");
			})
			.on("dragleave", function(e) {
				e.stopPropagation();
				e.preventDefault();
				$("body").css("background", "none");
			})
			.on("drop", function(e) {
				e.stopPropagation();
				e.preventDefault();
			
				$("body").css("background", "none");

				var dt = e.originalEvent.dataTransfer;
				var files = dt.files;
			
				uploadFiles(files);		
			})
		;
		
		$("#inputFile").change(function(e) {
			console.log("cahnge", e);
			var files = this.files;
			
			uploadFiles(files);
		});		
	});
});

function uploadInputFile(file) {
	return new Promise(function(resolve, reject) {
		var fileReader = new FileReader();
		
		fileReader.onload = function() {
			console.log("name: ", file.name);
			console.log("name: ", file.type);
			var uploadFileParams = {};
			uploadFileParams.name = file.name;
			uploadFileParams.type = file.type;
			uploadFileParams.data = this.result.split(",")[1];
			uploadFileParams.parentId = parentId;
			
			uploadFile(uploadFileParams).then(function(response) {
				if (response.error) {
					reject(response.error);
				} else {
					resolve(response);
				}
			}).catch(function(error) {
				reject(error);
			});
			
		}
		
		fileReader.onabort = fileReader.onerror = function(e) {
			console.error("fileerror: ", e);
			var errorMsg;
			if (e.currentTarget.error.name == "NotFoundError") {
				errorMsg = "Temporary error, please try again.";
			} else {
				errorMsg = e.currentTarget.error.message + " Try again.";
			}
			reject(errorMsg);
		}

		fileReader.readAsDataURL(file);		
	});
}