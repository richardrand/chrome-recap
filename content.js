chrome.extension.sendMessage("getState", function(state) {
	recap.run(state);
});

var display_notifications = true;

var recap = {
	initImages: function() {
		var retdict = {};

		var srcs = new Array("recap-icon.png", "close-x-button.png", "recap-logo.png");

		for(var i in srcs) {
			var src = srcs[i];
			var embeddedImageSrc = chrome.extension.getURL(RECAP_SKIN_PATH + src);
			retdict[src] = embeddedImageSrc;
		}

		return retdict;
	},

	run: function(state) {
		this.images = this.initImages();

		var URIhost = location.host;
		var URIpath = location.href.replace(/^https?:\/\/[^\/]*/, '');
		try {
			var refpath = document.referrer.replace(/^https?:\/\/[^\/]*/, '');
		} catch(e) {
			//referringURI may not exist in all cases
			refpath = "";
		}

		var temp_disabled = state.temp_disable;
		display_notifications = state.display_notifications;
		debugging = state.debugging;
		this.active = state.active;
		this.ECFLoggedIn = state.ECFLoggedIn;

		if(isPACERHost(URIhost) || isUnsupportedPACERHost(URIhost)) {
			if(temp_disabled == true && (
			(!this.active && state.havePACERCookie) || (!this.ECFLoggedIn && state.hasECFCookie))) {
				showAlert(ICON_DISABLED_32, "RECAP deactivated.", "Your settings forced RECAP to stay deactivated.");
			} else if(isUnsupportedPACERHost(URIhost)) {
				showAlert(ICON_EXCLAMATION_32, "RECAP not supported.", "RECAP does not work on Appellate Courts");
			} else if(state.havePACERCookie && state.hasECFCookie && (!this.active || !this.ECFLoggedIn)) {
				// Just logged into ECF *AND* PACER
				showAlert(ICON_EXCLAMATION_32, "RECAP enabled.", "Logged into PACER and ECF. But RECAP will activate on PACER pages only.");
				this.active = true;
				this.ECFLoggedIn = true;
			} else if(state.havePACERCookie && !this.active) {
				// Just logged into PACER
				showAlert(ICON_LOGGED_IN_32, "RECAP activated.", "You are logged into PACER.");
				this.active = true;
			} else if(state.hasECFCookie && !this.ECFLoggedIn) {
				// Just logged into ECF
				showAlert(ICON_LOGGED_OUT_32, "RECAP not activated.", "RECAP is not enabled when you are only logged into ECF.");
				this.ECFLoggedIn = true;
			} else if(!state.havePACERCookie && this.active) {
				// Just logged out of PACER
				showAlert(ICON_LOGGED_OUT_32, "RECAP deactivated.", "You are logged out of PACER.");
				this.active = false;
			} else if(!state.hasECFCookie && this.ECFLoggedIn) {
				// Just logged out of ECF, don't show any notification
				this.ECFLoggedIn = false;
			}

			chrome.extension.sendMessage({setState: {active: this.active, ECFLoggedIn: this.ECFLoggedIn}});
		}

		this.updateAllWindowIcons();

		// Ensure that the page warrants modification
		if(temp_disabled || !isPACERHost(URIhost) || !state.havePACERCookie || !this.isModifiable(URIpath)) {

			return;
		}

		var court = getCourtFromHost(URIhost);

		var casenum = null;

		// Don't add js libs they have already been loaded
		var loaded = document.getElementsByClassName("recapjs");
		if(!loaded.length) {
			// Write the necessary js libraries into the document
			this.loadjs(document, state.auto_check_pdf_headers);
		}

		if(isDocPath(URIpath) && this.isSingleDocPage(document)) {

			var docmeta = this.getDocumentMetacache(URIpath);
			if(docmeta) {
				if(docmeta["filename"]) {

					var form = this.findDoc1Form(document);
					if(!form) {
						return;
					}

					//skip the ajax call and go straight to handleresponse
					var docURL = form.getAttribute("action");
					var elements = {};
					elements[docURL] = [form];

					var responseMeta = {};
					responseMeta[docURL] = docmeta;

					this.handleResponse(responseMeta, document, elements);

				}
				// return if there's a metacache entry, but not available
				return;
			}
		}

		var preDocketPage = this.isPreDocketReportPage(URIpath)
		if(preDocketPage) {
			//Get the casenum from the current page URI
			try {
				casenum = URIpath.match(/\?(\d+)$/i)[1];
			} catch(e) {
				log('could not find casenum! Query case failed')

			}
		}


		if(!preDocketPage && court && document) {
			this.docCheckAndModify(document, court);
		} else if(preDocketPage && casenum && court && document) {
			this.caseCheckAndModify(document, court, casenum);
		}

	},

	//Check our server to see if a docket page exists,
	//   and modify the page with link to docket page
	caseCheckAndModify: function(document, court, casenum) {
		if(casenum == undefined) {
			return
		}
		//Casenum is defined, so this is a pre-docket show page
		//We will ask recap for a link to the docket page, if it exists
		var jsonout = {
			court: court,
			casenum: casenum
		};

		// Serialize the JSON object to a string
		var jsonouts = JSON.stringify(jsonout);

		// Send the AJAX POST request
		var req = new XMLHttpRequest();

		var params = "json=" + jsonouts;

		req.open("POST", QUERY_CASES_URL, true);

		var that = this;
		req.onreadystatechange = function() {
			if(req.readyState == 4 && req.status == 200) {
				that.handleCaseResponse(req, document);
			}
		};

		req.send(params);


	},


	// Check our server for cached copies of documents linked on the page,
	//   and modify the page with links to documents on our server
	docCheckAndModify: function(document, court) {

		// Construct the JSON object parameter
		var jsonout = {
			court: court,
			urls: []
		};

		try {
			var body = document.getElementsByTagName("body")[0];
		} catch(e) {
			return;
		}

		var links = body.getElementsByTagName("a");
		// Save pointers to the HTML elements for each "a" tag, keyed by URL
		var elements = {};

		for(var i = 0; i < links.length; i++) {
			var link = links[i];

			var docURL = this.getDocURL(link.href);

			if(docURL) {
				jsonout.urls.push(escape(docURL));
				try {
					elements[docURL].push(link);
				} catch(e) {
					elements[docURL] = [link];
				}

			}
		}

		// if no linked docs, don't bother sending docCheck
		if(jsonout.urls.length == 0) {

			var form = this.findDoc1Form(body);

			if(form) {
				var docURL = form.getAttribute("action");
				jsonout.urls.push(escape(docURL));
				try {
					elements[docURL].push(form);
				} catch(e) {
					elements[docURL] = [form];
				}
			} else {
				return;
			}
		}

		// Serialize the JSON object to a string
		var jsonouts = JSON.stringify(jsonout);

		// Send the AJAX POST request
		var req = new XMLHttpRequest;

		var params = "json=" + jsonouts;

		req.open("POST", QUERY_URL, true);

		var that = this;
		req.onreadystatechange = function() {
			if(req.readyState == 4 && req.status == 200) {

				var jsonin = JSON.parse(req.responseText);
				that.handleResponse(jsonin, document, elements);
			}
		};

		req.send(params);

	},

	// Handle the AJAX response
	handleResponse: function(jsonin, document, elements) {

		// a unique number for each dialog div
		var count = 0;

		for(var docURL in jsonin) {
			count++;

			var filename = jsonin[docURL]["filename"];
			var timestamp = jsonin[docURL]["timestamp"];
			var urlElements = elements[docURL];

			// If a document has subdocuments, we will create a slightly different modal box
			try {
				var subDocuments = jsonin[docURL]["subDocuments"];
			} catch(e) {
				var subDocuments = false;
			}


			if(!subDocuments) {
				// Create a dialogDiv for each RECAP document on the server
				this.makeDialogDiv(document, filename, timestamp, count);
			} else {
				this.makeDialogDiv(document, filename, timestamp, count, subDocuments);
			}


			//log("  File found: " + filename + " " + docURL);
			for(var i = 0; i < urlElements.length; i++) {
				element = urlElements[i];

				// Ensure that the element isn't already modified
				if(element.nextSibling) {
					nextElement = element.nextSibling;
					nextClass = nextElement.className;
					if(nextClass == "recapIcon" || nextClass == "recapTextLinkBox") continue;
				}

				// Insert our link to the right of the PACER link
				var iconLink = document.createElement("a");
				iconLink.setAttribute("class", "recapIcon");
				iconLink.setAttribute("href", filename);
				iconLink.setAttribute("onClick", "return false;");

				var iconImage = this.addImage(document, iconLink, "recap-icon.png");
				iconImage.setAttribute("class", "recapIconImage");
				iconImage.setAttribute("alt", "[RECAP]");
				iconImage.setAttribute("onClick", "addModal(" + count + ")");
				iconImage.setAttribute("title", "Available for free from RECAP.");

				//when the element is a form, this is a doc 1 page, so we'll add some more text than we would
				// on a docket page
				if(element.nodeName == "FORM") {

					var textLink = document.createElement("a");
					textLink.setAttribute("href", filename);
					textLink.setAttribute("onClick", "addModal(" + count + "); return false;");
					textLink.innerHTML = " Click here to download this document for free from the RECAP archive";

					var textlink_div = document.createElement("div");
					textlink_div.setAttribute("class", "recapTextLinkBox");
					textlink_div.appendChild(iconLink);
					textlink_div.appendChild(textLink);
					element.parentNode.insertBefore(textlink_div, element.nextSibling);

				} else {
					element.parentNode.insertBefore(iconLink, element.nextSibling);
				}
			}
		}
	},

	handleCaseResponse: function(req, document) {
		var jsonin = JSON.parse(req.responseText);

		var docket_url = null;
		try {
			docket_url = jsonin['docket_url'];
		} catch(e) {
			return;
		}
		try {
			timestamp = jsonin['timestamp']
		} catch(e) {
			// continue on failure, timestamp is not crucial
		}

		if(docket_url != null) {


			var iconLink = document.createElement("a");
			iconLink.setAttribute("class", "recapIcon");
			iconLink.setAttribute("href", docket_url);
			iconLink.setAttribute("onClick", "return false;");

			var iconImage = this.addImage(document, iconLink, "recap-icon.png");
			iconImage.setAttribute("class", "recapIconImage");
			iconImage.setAttribute("alt", "[RECAP]");
			iconImage.setAttribute("onClick", "addModal(" + 1 + ");");
			iconImage.setAttribute("title", "Docket available for free via RECAP.");


			this.makeCaseDialogDiv(document, docket_url, timestamp);

			var textLink = document.createElement("a");
			textLink.setAttribute("href", docket_url);
			textLink.setAttribute("onClick", "addModal(" + 1 + "); return false;");
			textLink.innerHTML = " Click here to download this docket for free from the RECAP archive <br> <span class='recapSmaller'> (archived dockets may be out of date)</span>";

			var textlink_div = document.createElement("div");
			textlink_div.setAttribute("class", "recapTextLinkBox");
			textlink_div.appendChild(iconLink);
			textlink_div.appendChild(textLink);


			var reset_button = document.getElementsByName('reset')[0];
			reset_button.parentNode.parentNode.appendChild(textlink_div);

			return;

		}


	},

	isPreDocketReportPage: function(current_path) {
		var current_page_name = null;
		try {
			current_page_name = current_path.match(/(\w+)\.pl/i)[0];
		} catch(e) {
			return false;
		}

		var modifiablePages = ["DktRpt.pl", "HistDocQry.pl"];

		var args = null;
		try {
			args = current_path.match(/\?\d*$/i)[0];
		} catch(e) {}

		just_digits = (args && args.length > 0) ? true : false;


		// This may screw up when back/forward? 
		if(modifiablePages.indexOf(current_page_name) >= 0 && args && just_digits) {
			return true;
		}

		return false;
	},

	makeBasicDialogDiv: function(document, count) {
		var outerdiv = document.createElement("div");
		outerdiv.setAttribute("id", "recapdialog" + count);
		outerdiv.setAttribute("class", "jqmWindow recapOuterDiv");

		// add X to close the dialog
		var closeLink = document.createElement("a");
		closeLink.setAttribute("href", "#");
		closeLink.setAttribute("class", "jqmClose");
		var closeIcon = this.addImage(document, closeLink, "close-x-button.png");
		closeIcon.setAttribute("alt", "[Close]");
		closeIcon.setAttribute("class", "recapCloseButton");
		closeLink.appendChild(closeIcon);
		outerdiv.appendChild(closeLink);

		return outerdiv;
	},

	// Make a dialog div and append it to the bottom of the document body
	makeDialogDiv: function(document, filename, timestamp, count, subDocuments) {

		if(subDocuments == undefined) {
			subDocuments = false;
		}
		var outerdiv = this.makeBasicDialogDiv(document, count)

		var innerdiv = document.createElement("div");
		innerdiv.setAttribute("class", "recapInnerDiv");

		this.addP(document, innerdiv);
		this.addImage(document, innerdiv, "recap-logo.png");
		this.addBr(document, innerdiv);
		this.addText(document, innerdiv, "This document is available for free!");
		this.addP(document, innerdiv);
		this.addTextLink(document, innerdiv, "RECAP", "http://www.recapthelaw.org", "_blank");
		this.addText(document, innerdiv, " cached this document on " + timestamp + ".");
		this.addP(document, innerdiv);
		this.addBr(document, innerdiv);
		var a = this.addTextLink(document, innerdiv, "Download", filename, null);
		a.setAttribute("class", "recapDownloadButton");

		//If there are subDocuments, we want to display them here
		if(subDocuments) {
			var subDocDiv = document.createElement("div");
			subDocDiv.setAttribute("class", "recapInnerSubDocDiv");

			this.addP(document, innerdiv);
			this.addText(document, innerdiv, " RECAP also has some sub documents associated with this document!");

			this.addBr(document, innerdiv);
			for(var subDocNum in subDocuments) {
				sub_filename = subDocuments[subDocNum]["filename"]
				sub_timestamp = subDocuments[subDocNum]["timestamp"]
				this.addText(document, subDocDiv, "RECAP cached subdocument #" + subDocNum + " on " + sub_timestamp + " ")
				var a = this.addTextLink(document, subDocDiv, "Download", sub_filename, null);
				a.setAttribute("class", "recapDownloadButton");
				this.addBr(document, subDocDiv);
			}
		}

		this.addP(document, innerdiv);
		if(subDocuments) {
			innerdiv.appendChild(subDocDiv);
		}

		this.addDisclaimerDiv(document, innerdiv);
		outerdiv.appendChild(innerdiv);
		document.documentElement.appendChild(outerdiv);
	},
	makeCaseDialogDiv: function(document, docket_url, timestamp) {

		var outerdiv = this.makeBasicDialogDiv(document, 1)

		var innerdiv = document.createElement("div");
		innerdiv.setAttribute("class", "recapInnerDiv");

		this.addP(document, innerdiv);
		this.addImage(document, innerdiv, "recap-logo.png");
		this.addBr(document, innerdiv);
		this.addText(document, innerdiv, "This Docket is available for free!");
		this.addP(document, innerdiv);
		this.addTextLink(document, innerdiv, "RECAP", "http://www.recapthelaw.org", "_blank");
		this.addText(document, innerdiv, " cached this docket on " + timestamp + ".");
		this.addP(document, innerdiv);
		this.addBr(document, innerdiv);

		var a = this.addTextLink(document, innerdiv, "View", docket_url, null);
		a.setAttribute("class", "recapDownloadButton");
		a.setAttribute("target", "_blank");

		this.addP(document, innerdiv);
		this.addBr(document, innerdiv);

		this.addDisclaimerDiv(document, innerdiv);
		outerdiv.appendChild(innerdiv);
		document.documentElement.appendChild(outerdiv);
	},

	addText: function(document, div, text) {
		var textNode = document.createTextNode(text);
		div.appendChild(textNode);
		return textNode;
	},

	addP: function(document, div) {
		var p = document.createElement("p");
		div.appendChild(p);
		return p;
	},

	addBr: function(document, div) {
		var br = document.createElement("br");
		div.appendChild(br);
		return br;
	},

	addTextLink: function(document, div, text, href, target) {
		var a = document.createElement("a");
		a.href = href;
		if(target) {
			a.target = target;
		}
		this.addText(document, a, text);
		div.appendChild(a);
		return a;
	},

	addImage: function(document, div, src) {
		var img = document.createElement("img");

		img.setAttribute("src", this.images[src]);
		div.appendChild(img);
		return img;
	},
	addDisclaimerDiv: function(document, div) {

		var disclaimerDiv = document.createElement("div");
		disclaimerDiv.setAttribute("class", "recapDisclaimer");
		this.addText(document, disclaimerDiv, "RECAP is not affiliated with the US Courts. The documents it makes available are voluntarily uploaded by PACER users.  RECAP cannot guarantee the authenticity of documents because the courts themselves have not implemented a document signing and authentication system.");

		div.appendChild(disclaimerDiv);
		return disclaimerDiv;
	},


	// Get the document URL path (e.g. '/doc1/1234567890')
	getDocURL: function(url) {
		var docURL = null;
		try {
			docURL = url.match(/\/doc1\/(\d*)/i)[0];
		} catch(e) {}
		if(docURL) {
			return docURL;
		}

		try {
			docURL = url.match(/\/cgi-bin\/show_doc.*/i)[0];
		} catch(e) {}
		if(docURL) {
			return docURL;
		}

		return null;

	},
	findDoc1Form: function(body) {
		try {
			// check if we are on a doc1 page where the url is found in a button, rather than a link
			var form = body.getElementsByTagName("form")[0];
			var docURL = form.getAttribute("action");
			var onsubmit = form.getAttribute("onsubmit");

		} catch(e) {
			return false;
		}


		if(docURL && onsubmit && onsubmit.indexOf("goDLS") >= 0) {
			return form;
		}
		return false

	},
	isSingleDocPage: function(document) {
		var input_buttons = document.getElementsByTagName("input");

		if(input_buttons.length < 3) return true;
		return false;
	},

	// Returns true if path matches ".../doc1/<docnum>"
	hasDocPath: function(path) {

		try {
			var docMatch = path.match(/\/doc1\/(\d+)/i);
			return docMatch ? true : false;
		} catch(e) {
			return false;
		}
	},

	// Check if the page worth modifying with our links
	isModifiable: function(path) {
		var modifiablePages = ["DktRpt.pl", "HistDocQry.pl"];

		// Parse out the Perl script name from the path
		var pageName = "";
		try {
			pageName = path.match(/(\w*)\.pl/i)[0];
		} catch(e) {}

		return(modifiablePages.indexOf(pageName) >= 0 || isDocPath(path)) ? true : false;
	},

	getDocumentMetacache: function(URIpath) {
		var docid = docidFromUrlName(URIpath);
		// Check metacache for available document and see if we can save a call to the server
		var docmeta;
		try {
			docmeta = this.metacache.documents[docid];
		} catch(e) {
			return false;
		}

		if(docmeta) return docmeta;
		return false;
	},


	loadjs: function(document, auto_check_pdf_headers) {
		this.jscssLoadURL(document, RECAP_PATH + "injected/jquery-1.3.2.js", "js");
		this.jscssLoadURL(document, RECAP_PATH + "injected/jqModal.js", "js");
		this.jscssLoadURL(document, RECAP_PATH + "injected/recapModal.js", "js");

		if(auto_check_pdf_headers == true) {
			this.jscssLoadURL(document, RECAP_PATH + "injected/recapPDFHeaders.js", "js");
		}

		this.jscssLoadURL(document, RECAP_SKIN_PATH + "jqModal.css", "css");
		this.jscssLoadURL(document, RECAP_SKIN_PATH + "recap.css", "css");
	},

	jscssLoadURL: function(document, URL, filetype) {
		URL = chrome.extension.getURL(URL);

		if(filetype == "js") { //if filename is a external JavaScript file
			var element = document.createElement("script");
			element.setAttribute("type", "text/javascript");
			element.setAttribute("class", "recapjs");
			element.setAttribute("src", URL);
		} else if(filetype == "css") { //if filename is an external CSS file
			var element = document.createElement("link");
			element.setAttribute("type", "text/css");
			element.setAttribute("rel", "stylesheet");
			element.setAttribute("href", URL);
		}

		if(typeof element != "undefined") {
			document.getElementsByTagName("head")[0].appendChild(element);
		}
	},

	updateAllWindowIcons: function() {

		/*var winEnum = this.winMediator.getEnumerator("navigator:browser");

		while(winEnum.hasMoreElements()) {
			var window = winEnum.getNext();

			try {
				window.updateStatusIcon();
			} catch(e) {}


		}*/
	}
}