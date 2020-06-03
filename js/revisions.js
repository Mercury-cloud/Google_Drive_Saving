function receiveMessage(e) {
	console.log("receivemessage", e);
	if (event.origin.includes(chrome.runtime.id)) {
		var file = e.data.file;
	
		$(document).ready(function() {
			
			$("title").text(file.name + " - revisions");
			
			$("#fileTitle")
				.text(file.name)
				.click(function() {
					chrome.tabs.create({url:file.webViewLink});
					window.close();
					return false;
				})
			;
			
			compareRevisions(file, true).then(function(response) {
				var diffNode = buildView(response.lastRevision, response.currentRevision, 1);
				var $diffNode = $(diffNode);
				$diffNode.find("td").each(function() {
					
					// replace * with bullets
					$(this).text( $(this).text().replace(/^\*/, "•") );
				});
				
				$("#diffArea")
					.empty()
					.append(diffNode)
				;
				
				// scroll to first change
				var $firstChange = $(".insert, .delete").first();
				if ($firstChange.length) {
					$firstChange[0].scrollIntoView();
				}
				// then scroll back just a bit higher to see previous lines (to give user context)
				$("body").scrollTop( $("body").scrollTop()- 20 );
				
				$("#loading").hide();
			});
		});
	}
}

window.addEventListener("message", receiveMessage, false);