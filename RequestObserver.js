/* 
 *  This file is part of the RECAP Firefox Extension.
 *
 *  Copyright 2009 Harlan Yu, Timothy B. Lee, Stephen Schultze.
 *  Website: http://www.recapthelaw.org
 *  E-mail: info@recapthelaw.org
 *
 *  The RECAP Firefox Extension is free software: you can redistribute it 
 *  and/or modify it under the terms of the GNU General Public License as
 *  published by the Free Software Foundation, either version 3 of the 
 *  License, or (at your option) any later version.
 *
 *  The RECAP Firefox Extension is distributed in the hope that it will be
 *  useful, but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with the RECAP Firefox Extension.  If not, see 
 *  <http://www.gnu.org/licenses/>.
 *
 */

// A bit of polyfill.
function Channel(details, requestObserver) {
	this.responseHeaders = details.responseHeaders;
	this.dirty = false;
	this.referrer = requestObserver.referrers[details.requestId];
	this.URI = details.url;
}

Channel.prototype = {
	getResponseHeadersIfChanged: function() {
		if(this.dirty) return {responseHeaders: this.responseHeaders};
	},
	getResponseHeader: function(name) {
		for (var i = 0; i < this.responseHeaders.length; i++)
			if (this.responseHeaders[i].name == name)
				return this.responseHeaders[i].value;
		throw new Error("No " + name + " header found.");
	},
	setResponseHeader: function(name, value) {
		this.dirty = true;
		for (var i = 0; i < this.responseHeaders.length; i++) {
			if (this.responseHeaders[i].name == name) {
				this.responseHeaders[i].value = value;
				return;
			}
		}
		this.responseHeaders.push({name: name, value: value});
	}
};

/** RequestObserver:
 *    Receives notifications for all WebRequests onCompleted and onHeadersReceived.
 *    Upon notification, if this is a PACER document:
 *      - onHeadersReceived:
 *	      - Modifies the HTTP response headers to be cache-friendly
 *	      - If necessary, modifies the default filename to be save-friendly
 *      - onCompleted:
 *        - If "uploadworthy", _downloads the file from cache_ and then uploads the file to a server
 *			 or that may be accomplished with a content script 
 *
 */

function RequestObserver(metacache) {
    // cache of document and case metadata from Recap namespace
    this.metacache = metacache;
    this.referrers = {};		//only way to get a request's referrer in chrome is to store it :(
    
    var that = this, urlFilter = {urls: ["http://*.uscourts.gov/*", "https://*.uscourts.gov/*"]};

    chrome.webRequest.onBeforeSendHeaders.addListener(
    	function(request) {
    		that.onBeforeSendHeaders(request); //return value doesn't matter here (blocking is only used to guarantee this finishes before other events that use referrer)
    	},
    	urlFilter,
    	['blocking', 'requestHeaders']);

    chrome.webRequest.onHeadersReceived.addListener(
    	function(response) {
    		return that.filterEvent(that.onHeadersReceived, response);
    	},
    	urlFilter,
    	['blocking', 'responseHeaders']);

    chrome.webRequest.onCompleted.addListener(
    	function(response) {
	    	that.filterEvent(that.onCompleted, response); //return value doesn't matter here (no 'blocking')
	    },
	    urlFilter,
	    ['responseHeaders']);

    chrome.webRequest.onErrorOccurred.addListener(
    	function(response) {
    		delete that.referrers[response.requestId]; //don't waste memory on failed requests
    	},
    	urlFilter);
}

RequestObserver.prototype = {
	filterEvent: function(eventHandler, response) {
		var URIhost = response.url.match(/^https?:\/\/([^\/]*)/)[1],
			URIpath = response.url.replace(/^https?:\/\/[^\/]*/, '');

		// Ignore non-PACER domains, or if no PACER cookie and ignore any requests that result in errors
		if (localStorage['temp_disable'] == "false" && isPACERHost(URIhost) && havePACERCookieSync && parseInt(response.statusLine.split(' ')[1], 10) == 200)
			return eventHandler.call(this, response.requestId, new Channel(response, this), URIhost, URIpath);
		//var channel = {responseHeaders: {}};
        //for (i = 0; i < details.responseHeaders.length; i++)
        //    channel.responseHeaders[details.responseHeaders[i].name] = details.responseHeaders[i].value;
	},

	onBeforeSendHeaders: function(request) {
		var URIhost = request.url.match(/^https?:\/\/([^\/]*)/)[1],
			URIpath = request.url.replace(/^https?:\/\/[^\/]*/, '');

		if(localStorage['temp_disable'] == "false" && isPACERHost(URIhost) && havePACERCookieSync)
			for(var i = 0; i < request.requestHeaders.length; i++)
				if(request.requestHeaders[i].name == 'Referer') {
					this.referrers[request.requestId] = request.requestHeaders[i].value;
					break;
				}
	},

    // Logs interesting HTTP response headers to the Error Console
	//    logHeaders: function(url, channel) {
	// var headers = ["Age", "Cache-Control", "ETag", "Pragma", 
	// 	       "Vary", "Last-Modified", "Expires", "Date", 
	// 	       "Content-Disposition", "Content-Type"];

	// var output = "Headers for " + channel.URI.asciiSpec + "\n  ";
	// for (var i = 0; i < headers.length; i++) {
	//     var hvalue = "";
	//     try {
	// 	hvalue = channel.getResponseHeader(headers[i]);
	//     } catch(e) {
	// 	hvalue = "<<none>>";
	//     }
	    
	//     output += "'" + headers[i] + "': " + "'" + hvalue + "'; ";
	// }

	//    },

    // Set the HTTP response headers to be cache-friendly
    setCacheFriendlyHeaders: function(channel) {
		var pragmaVal = this.getPragmaValue(channel);
        
        var cache_time_ms = parseInt(localStorage["cache_time_ms"], 10);

        var expireTime = (new Date()).getTime() + cache_time_ms;
        var expiresVal = (new Date(expireTime)).toUTCString();
	
		//var expiresVal = (new Date(oneday)).toUTCString();
		var dateVal = (new Date()).toUTCString();
		
		channel.setResponseHeader("Age", "");
		channel.setResponseHeader("Cache-Control", "");
		channel.setResponseHeader("ETag", "");
		channel.setResponseHeader("Pragma", pragmaVal);
		channel.setResponseHeader("Vary", "");
		channel.setResponseHeader("Last-Modified", "");
		channel.setResponseHeader("Expires", expiresVal);
		channel.setResponseHeader("Date", dateVal);

		var mimetype = this.getMimetype(channel);	

		// If the file is a PDF, change the filename
		if (isPDF(mimetype)) {
		    this.tryPDFmeta(channel, mimetype, true); //just want the side effect
		}
    },
    
    coerceDocid: function(docid) { //not sure about this. it seems to be called sometimes when the filename is the wrong format...
    	return docid.substr(0,3) + "0" + docid.substr(4);
    },

    // Removes 'no-cache' from the Pragma response header if it exists
    getPragmaValue: function(channel) {
		try {
		    var hpragma = channel.getResponseHeader("Pragma");
		} catch(e) {
		    return "";
		}
		
		return hpragma.replace(/no-cache/g, "");
    },

    // Sets a better filename in the Content-Disposition header
    setContentDispositionHeader: function(channel, filename, court) {
		if (localStorage["pretty_filenames"] == "false")
		    return;

		var filename_style_choice = localStorage["pretty_filenames_choice"];
	    
		filename = this.coerceDocid(filename);
		
		// try to build a pretty filename - SS: need to add a pref for this
		var prettyFilename;
		var filenameSplit = filename.split(".");
		var docid = filenameSplit[0];

		try {
		    var docnum;
		    var subdocnum;
		    var casenum;
		    
		    casenum = this.metacache.documents[docid]["casenum"];
		    officialcasenum = this.metacache.cases[casenum]["officialcasenum"];
		    officialcasenum = officialcasenum.replace(/:/g, "-");
		    docnum = this.metacache.documents[docid]["docnum"];
				
		    // might fail if this wasn't in the db, so do essential
		    // stuff before this
		    subdocnum = this.metacache.documents[docid]["subdocnum"];
				
		    // TK - waiting on server to have this data
		    //lastdate = this.metacache.documents[docid]["lastdate"];
		    //docname = this.metacache.documents[docid]["docname"];
		    //case_name = this.metacache.cases[casenum]["case_name"];
		} catch (e) {
		}
		
		if ((typeof casenum != 'undefined') && 
		    (typeof officialcasenum != 'undefined')) {

		    prettyFilename = PACER_TO_WEST_COURT[court];
		    if (officialcasenum)
				prettyFilename = prettyFilename + "_" + officialcasenum;

		    //prettyFilename = prettyFilename + "_" + docid;
		    if (typeof docnum != 'undefined')
				prettyFilename = prettyFilename + "_" + docnum;
		    if ((typeof subdocnum != 'undefined') && 
				subdocnum && subdocnum != 0)
					prettyFilename = prettyFilename + "_" + subdocnum;
		    
		    prettyFilename = prettyFilename + ".pdf";
		}
		
		if ((typeof casenum != 'undefined') && 
			casenum !='' && (typeof court != 'undefined') && 
			(typeof docnum != 'undefined') && (typeof subdocnum != 'undefined'))
				var IAFilename = "gov.uscourts." + court + "." + casenum + "." + docnum + "." + subdocnum + ".pdf";

		if (filename_style_choice == "pretty_filenames_IAFilename"){
			if (IAFilename)
			    filename = IAFilename;
			else
			    //filename = PACER_TO_WEST_COURT[court] + "-" + filename;
			    filename = court + "-" + filename;
		} else {  // PrettyFilename
			if(prettyFilename)
				filename = prettyFilename;
			else
			    filename = PACER_TO_WEST_COURT[court] + "-" + filename;
		}

		if (filename != null && court != null)
		    // question: what happens here if user wanted embedded view (not download)?
		    channel.setResponseHeader("Content-Disposition", "attachment; filename=\"" + filename + "\"");
    },

    // If this is a simple PDF (rather than a merged multidoc),
    //   return the metadata from the referrer URI.  Otherwise, return false.
    //  Side-effect: sets the Content-disposition header if changeName is set.
    tryPDFmeta: function(channel, mimetype, changeName) {
		try {
		    var refhost = channel.referrer.asciiHost;
		    var refpath = channel.referrer.path;	   
		} catch(e) {
		    return false;
		}

		var court = getCourtFromHost(refhost);
		
		if (isDocPath(refpath)) {

		    // A simple PDF: filename is the docid, e.g. last part of refpath
		    var pathSplit = refpath.split("/");
		    var filename = pathSplit.pop() + this.fileSuffixFromMime(mimetype);

		    // Set Content-Disposition header to be save-friendly
		    if(changeName)
		    	this.setContentDispositionHeader(channel, filename, court);

		    return {mimetype: mimetype, court: court, 
			    name: filename, url: refpath };

		} else if (this.perlPathMatch(refpath) == "show_multidocs.pl") {
		    // don't know how best to handle with multidocs yet.
		    //  for now we'll just use "[de_seq_num]-merged"
		    //   NOT uploading these pdfs (return false)

		    var de_seq_num = null;

		    try {
			de_seq_num = refpath.match(/arr_de_seq_nums=(\d+)/i)[1];
		    } catch(e) {}

		    if (de_seq_num) {

			var filename = de_seq_num + "-merged"
			                + this.fileSuffixFromMime(mimetype);

			// Set Content-Disposition header to be save-friendly
			if(changeName)
				this.setContentDispositionHeader(channel, filename, court);
			
		    }
		}

		return false;
    },

    // If this is an interesting HTML page generated by a PACER Perl script,
    //   return the page's metadata.  Otherwise, return false.
    tryPerlHTMLmeta: function(channel, path, mimetype) {
		var downloadablePages = ["HistDocQry.pl", "DktRpt.pl"];
		    
		var referrer = channel.referrer;
		try {
			var refhost = referrer.match(/^https?:\/\/([^\/]*)/)[1],
				refpath = referrer.replace(/^https?:\/\/[^\/]*/, '');
		} catch(e) {
		    return false;
		}

		var pageName = this.perlPathMatch(path);
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
		    
		    var court = getCourtFromHost(refhost);
		    
		    return {mimetype: mimetype, court: court,
			    name: name, casenum: casenum };
		}
		
		return false;
    },

    // If this is an interesting doc1 HTML page, return the page's metadata.  
    //   Otherwise, return false.
    tryDocHTMLmeta: function(channel, path, mimetype) {
		if (isDocPath(path)) {

		    var referrer = channel.referrer;
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
		    
		    if (isDocPath(refpath)) {
				return false;
		    }

		    var court = getCourtFromHost(channel.URI.match(/^https?:\/\/([^\/]*)/)[1]);

		    return {mimetype: mimetype, court: court,
			    name: path };
		}
		
		return false;
    },

    // Wrap both types of interesting HTML metadata generation.
    tryHTMLmeta: function(channel, path, mimetype) {
		var meta = this.tryPerlHTMLmeta(channel, path, mimetype);
		if (meta) {
		    return meta;
		}
		
		meta = this.tryDocHTMLmeta(channel, path, mimetype);
		if (meta) {
		    return meta;
		}

		return false;
    },

    
    fileSuffixFromMime: function(mimetype) {
		if (mimetype == "application/pdf") {
		    return ".pdf";
		} else {
		    return null;
		}
    },

    // Returns the specified Content-type from the HTTP response header
    getMimetype: function(channel) {
        try {
	    	return channel.getResponseHeader("Content-Type");
		} catch(e) {
		    return null;
		}
    },

    // Returns true if we should ignore this page from all RECAP modification
    ignorePage: function(path) {
		var ignorePages = ["login.pl", "iquery.pl", "BillingRpt.pl"];
		
		var sometimesFormPages = ["HistDocQry.pl", "DktRpt.pl"];
		
		var pageName = this.perlPathMatch(path);
		
		// don't cache pages which are sometimes forms, if they are forms
		if (sometimesFormPages.indexOf(pageName) >= 0 && this.perlArgsJustDigits(path)) {
			return true;
		}

		return (pageName && ignorePages.indexOf(pageName) >= 0) ? true : false;
    },

    // Find the name of the PACER perl script in the path
    perlPathMatch: function(path) {
		var pageName = null;
		try {
		    pageName = path.match(/(\w+)\.pl/i)[0];
		} catch(e) {}

		return pageName;
    },
    
    // are the arguments digits only?  If so, this is a form.
    perlArgsJustDigits: function(path) {
		var args = null;
		try {
		    args = path.match(/\?\d*$/i)[0];
		} catch(e) {}
		
		if (args && args.length > 0) {
			//log("digits only");
		}

		return (args && args.length > 0) ? true : false;
    },
    

    // Intercept the channel, and upload the data with metadata
    uploadChannelData: function(subject, metadata) {
		var dlistener = new DownloadListener(metadata,this.metacache);
		subject.QueryInterface(Ci.nsITraceableChannel);
		dlistener.originalListener = subject.setNewListener(dlistener);
    },

    //Called on every HTTP response, after headers are received, to change the filename to a human readable name.
    onHeadersReceived: function(requestId, channel, URIhost, URIpath) {
		// ignore some PACER pages
		if(this.ignorePage(URIpath))
		    return;

    	this.setCacheFriendlyHeaders(channel);

        return channel.getResponseHeadersIfChanged();
    },

    // Called on every HTTP response, after download is complete
    onCompleted: function(requestId, channel, URIhost, URIpath) {
    	delete this.referrers[requestId];

		// catch and handle DocLink requests made from bankruptcy pages
		if (URIpath.match(/document_link/))
			return DocLinkProcessor.processDocLink(getCourtFromHost(URIhost), channel.URI, URIpath, this.metacache);

		// ignore some PACER pages
		if (this.ignorePage(URIpath))
			return;

		var mimetype = this.getMimetype(channel);	

		// Upload content to the server if the file is a PDF
		if (isPDF(mimetype)) {
			var PDFmeta = this.tryPDFmeta(channel, mimetype, false);
			if (PDFmeta) this.uploadChannelData(subject, PDFmeta);
		}

		// This is now done in the content script uploadHTML.js
		/*else if (isHTML(mimetype)) {
		    // Upload content to the server if the file is interesting HTML
		    var HTMLmeta = this.tryHTMLmeta(channel, URIpath, mimetype);
		    if (HTMLmeta) this.uploadChannelData(subject, HTMLmeta);
		}*/
	}
};