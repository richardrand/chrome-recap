/* 
 *  This file is part of RECAP for Chrome.
 * 
 *  Copyright 2009-2010 Harlan Yu, Timothy B. Lee, Stephen Schultze, Dhruv Kapadia.
 *  Copyright 2013 Richard Rand
 *  Website: http://www.recapthelaw.org
 *  E-mail: info@recapthelaw.org
 *
 *  RECAP for Chrome is free software: you can redistribute it and/or 
 *  modify it under the terms of the GNU General Public License as 
 *  published by the Free Software Foundation, either version 3 of the 
 *  License, or (at your option) any later version.
 *
 *  RECAP for Chrome is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of 
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU 
 *  General Public License for more details.
 * 
 *  You should have received a copy of the GNU General Public License 
 *  along with the RECAP for Chrome. If not, see: 
 *  http://www.gnu.org/licenses/
 */

var recap = {
    perlPathMatch: function(path) {
		var pageName = null;
		try {
		    pageName = path.match(/(\w+)\.pl/i)[0];
		} catch(e) {}

		return pageName;
    },
    tryPerlHTMLmeta: function() {
		var downloadablePages = ["HistDocQry.pl", "DktRpt.pl"];
		    
		var referrer = document.referrer;
		try {
			var refhost = referrer.match(/^https?:\/\/([^\/]*)/)[1],
				refpath = referrer.replace(/^https?:\/\/[^\/]*/, '');
		} catch(e) {
		    return false;
		}

		var pageName = this.perlPathMatch(document.URL.replace(/^https?:\/\/[^\/]*/, ''));
		var refPageName = this.perlPathMatch(refpath);
		
		// HTML page is only interesting if 
		//    (1) it is on our list, and
		//    (2) the page name is the same as the referrer's page name.
		//   i.e. we want to upload the docket results HTML page
		//         and not the docket search form page.
		// SS: I think we could do #2 more intelligently by looking at POST vars
		// HY:  We would need to monitor outbound requests
		if (pageName && refPageName &&
		    pageName == refPageName &&
		    downloadablePages.indexOf(pageName) >= 0) {

		    var casenum = null;
		    try {
				casenum = refpath.match(/\?(\d+)$/i)[1];
		    } catch (e) {}
		    
		    var name = pageName.replace(".pl", ".html");
		    
		    var court = this.getCourtFromHost(refhost);
		    
		    return {mimetype: "text/html; charset=UTF-8",
		    	court: court,
			    name: name, casenum: casenum };
		}
		
		return false;
    },

	// Returns true if path matches "/doc1/<docnum>"
	isDocPath: function(path) {
	    try {
			var docMatch = path.match(/^\/doc1\/(\d+)$/i);
			return docMatch ? true : false;
	    } catch(e) {
			return false;
	    }	
	},

    // If this is an interesting doc1 HTML page, return the page's metadata.  
    //   Otherwise, return false.
    tryDocHTMLmeta: function() {
    	var path = document.URL.replace(/^https?:\/\/[^\/]*/, '');
		if (this.isDocPath(path)) {
		    var referrer = document.referrer;
		    try {
				var refhost = referrer.match(/^https?:\/\/([^\/]*)/)[1],
					refpath = referrer.replace(/^https?:\/\/[^\/]*/, '');   
		    } catch(e) {
				return false;
		    }

		    // doc1 pages whose referrer is also a doc1 shouldn't be uploaded.
		    //   This happens in at least two cases: 
		    //     (1) when 'View Document' is clicked to get a PDF, and 
		    //     (2) when clicking on a subdocument from a disambiguation 
		    //          page-- in this case, the page will be a solo receipt 
		    //          page anyway, so just ignore it.
		    // SS: This does not deal with the most common case: doc1/ page 
		    //     which is linked to from the docket page (non multidoc)
		    //     in this case, we are triggering an upload and getting an
		    //     error from Django (500) because index_soup isn't defined:
		    //           links = index_soup.findAll('a')
		    
		    if (this.isDocPath(refpath)) {
				return false;
		    }

		    var court = this.getCourtFromHost(document.URL.match(/^https?:\/\/([^\/]*)/)[1]);

		    return {mimetype: "text/html; charset=UTF-8", court: court,
			    name: path };
		}
		
		return false;
    },

    getCourtFromHost: function(hostname) {
	    var court = null;
	    try {
		   court = hostname.match(/([^\.]*)\.uscourts.gov/i)[1];
	    } catch(e) {}

	    return court;
	},

	// Wrap both types of interesting HTML metadata generation.
    tryHTMLmeta: function() {
		var meta = this.tryPerlHTMLmeta();
		if (meta) {
		    return meta;
		}
		
		meta = this.tryDocHTMLmeta();
		if (meta) {
		    return meta;
		}

		return false;
    },
	findDoc1Form: function() {
		if(this.isSingleDocPage()) {
			try {
				// check if we are on a doc1 page where the url is found in a button, rather than a link
				var form = document.body.getElementsByTagName("form")[0];
				var docURL = form.getAttribute("action");
				var onsubmit = form.getAttribute("onsubmit");

			} catch(e) {
				return false;
			}


			if(docURL && onsubmit && onsubmit.indexOf("goDLS") >= 0) {
				return form;
			}
		}
		return false

	},
	isSingleDocPage: function() {
		if(this.hasDocPath(document.URL)) {
			var input_buttons = document.getElementsByTagName("input");
			if(input_buttons.length < 3) return true;
		}
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
	}
};

//var SERVER_URL = "http://localhost/recap/"; //http://dev.recapextension.org/recap/";
//var UPLOAD_URL = SERVER_URL + "upload/";

(function() {
	var metadata = recap.tryHTMLmeta();
	if(metadata) {
		var boundary = "-------recap-multipart-boundary-" + (new Date().getTime());
		var msg =
		 '--' + boundary + '\r\n' + 
		 'Content-Disposition: form-data; name="data"; filename="'+ metadata.name.replace(/"/g,'%22') +'"\r\n' + 
		 'Content-Type: text/html; charset=UTF-8\r\n\r\n\r\n' + 
		 document.documentElement.outerHTML + '\r\n';

		for(var key in metadata) {
			if(key == "name") continue;

			msg += '--' + boundary + '\r\n' +
			'Content-Disposition: form-data; name="' + key + '"\r\n\r\n' + 
			metadata[key] + '\r\n';
		}

		msg +=	'--' + boundary + '--';

		var xhr = new XMLHttpRequest();
		xhr.open("POST", UPLOAD_URL);
		xhr.setRequestHeader("Content-type", "multipart/form-data; boundary=" + boundary);
		xhr.setRequestHeader("Content-size", msg.length);
		xhr.onreadystatechange = function() {
			if(xhr.readyState == 4 && xhr.status == 200)
				console.log(xhr.responseText);
		};
		xhr.send(msg);
	}

	var downloadVarNames = ["de_caseid","de_seqno","got_receipt","pdf_header","pdf_toggle_possible","magic_num","hdr"];
	var form = recap.findDoc1Form();
	if(form) {
		var downloadVars = form.getAttribute('onsubmit').match(/^goDLS\('([^']*)','([^']*)','([^']*)','([^']*)','([^']*)','([^']*)','([^']*)','([^']*)'\);return\(false\);/);
		if(downloadVars.length == downloadVarNames.length + 2) {
			function downPDF(viewIt) {
				downloadVars.shift(); 
				var downloadPDF = new XMLHttpRequest(), 
					downloadPDF_formData = new FormData();
				downloadPDF.open("POST", downloadVars.shift());

				for(var i = 0; i < downloadVars.length; i++)
					if(downloadVars[i].length > 0)
						downloadPDF_formData.append(downloadVarNames[i], downloadVars[i]);

				downloadPDF.responseType = "blob";
				//uploadPDF.setRequestHeader("Content-type", "multipart/form-data; boundary=" + boundary);
				downloadPDF.onload = function() {
					var uploadPDF = new XMLHttpRequest(), uploadPDF_formData = new FormData();
					uploadPDF.open("POST", UPLOAD_URL);
					uploadPDF_formData.append("data", downloadPDF.response, document.URL.match(/\/([^\/]*)$/)[1] + ".pdf");
					uploadPDF_formData.append("mimetype", "application/pdf");
					uploadPDF_formData.append("url", document.URL.replace(/^https?:\/\/[^\/]*/, ''));
					uploadPDF_formData.append("court", getCourtFromHost(document.URL.match(/^https?:\/\/([^\/]*)/)[1]));
					uploadPDF.onload = function() {
						showAlert(ICON_LOGGED_IN_32, 
							"Recap File Upload", 
							"PDF uploaded to the public archive.");
						if(viewIt)
							window.location = window.URL.createObjectURL(downloadPDF.response);	
					};
					uploadPDF.send(uploadPDF_formData);

					if(!viewIt) {
						var a = document.createElement('a');
						a.href = window.URL.createObjectURL(downloadPDF.response);
						a.download = document.URL.match(/\/([^\/]*)$/)[1] + ".pdf";
						fireEvent(a, "click");
					}
				};
				downloadPDF.send(downloadPDF_formData);
			
				return false;
			}

			form.onsubmit = function() {return downPDF(true);};

			var downloadBtn = document.createElement('input');
			downloadBtn.type = "button";
			downloadBtn.value = "Download Document";
			downloadBtn.addEventListener("click",function() {return downPDF(false);}, false);
			form.appendChild(downloadBtn);
		}
	}
})();

// this function fires the anchor link click event.
function fireEvent(obj, evt){
	var fireOnThis = obj;
	if (document.createEvent) {
		var evObj = document.createEvent('MouseEvents');
		evObj.initEvent(evt, true, false);
		fireOnThis.dispatchEvent(evObj);
	} else if (document.createEventObject) {
		fireOnThis.fireEvent('on' + evt);
	}
}
