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

DocLinkProcessor = {
    // Takes a URL and the name of a court, downloads the URL to retrieve 
    // the docid as well, and pipes the metadata to the RECAP server. Also
    // updates the local metacache.
    processDocLink: function(court, url, URIpath, metacache) {
        var vars = this.getQueryVariables(URIpath.split("?")[1]);

        var that = this;
        var getDocID = new XMLHttpRequest;
        getDocID.open("GET", url);
        getDocID.onreadystatechange = function() {
            if(getDocID.readyState == 4 && getDocID.status == 200)
                that.postMetadata("docid=" + getDocID.responseText.match(/\d*$/) + 
                                  "&casenum=" + vars["caseid"] + 
                                  "&de_seq_num=" + vars["de_seq_num"] + 
                                  "&dm_id=" + vars["dm_id"] + 
                                  "&docnum=" + vars["doc_num"] + 
                                  "&court=" + court + 
                                  "&add_case_info=true",
                                  metacache);
        };
        getDocID.send();
    },

    // Called from processDocLink
    getQueryVariables: function(querytext) {
        var hash = {}, vars = querytext.split("K");

        for (var i=0; i < vars.length; i++) {
            var pair = vars[i].split("V");
            hash[pair[0]] = pair[1];
        }

        return hash;
    },

    // Posts metadata gleaned from the url and response url to the RECAP server, then updates metacache.
    // Called from processDocLink
    postMetadata: function(metadata, metacache) {
        var req = new XMLHttpRequest;
        req.open("POST", ADDDOCMETA_URL, true)
        req.onreadystatechange = function() {
            if (req.readyState == 4 && req.status == 200) {
                try {
                    var jsonin = JSON.parse(req.responseText);
                } catch (e) {
                    log("JSON decoding failed. (req.responseText: " + req.responseText + ")");
                    return;
                }

                updateMetaCache(metacache, jsonin.documents);

                log(jsonin.message);
            }       
        };  

        req.send(metadata);
    }
};

