/* 
 *  This file is part of RECAP for Chrome.
 * 
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

var active = false,
	ECFLoggedIn = false;

var metacache = {"documents": {},"cases": {}};

// Checks whether we have a PACER cookie
function check_havePACERCookie(callback) {
    chrome.cookies.getAll({domain: "uscourts.gov"}, function(cookies) {
    	var foundPacerUser = false;
    	
	    for(i = 0; i < cookies.length; i++) {
			var cookie = cookies[i];
			if (cookie.name.match("PacerUser")||cookie.name.match("PacerSession")) {
			    if(cookie.value.indexOf("unvalidated") >= 0) {
					havePACERCookieSync = false;
				    if(typeof callback != "undefined")
				    	callback(false);
				    return;
			    } else {
			        foundPacerUser = true;
			    }
			}
	    }

		havePACERCookieSync = foundPacerUser;
	    if(typeof callback != "undefined")
			callback(foundPacerUser);
    });
}


var havePACERCookieSync = false; //can't use asynchronous method of checking cookie in blocking webrequest events
chrome.cookies.onChanged.addListener(function(changeInfo) {
	if(/\.uscourts\.gov$/.test(changeInfo.cookie.domain))
		check_havePACERCookie();
});
check_havePACERCookie();

function check_hasECFCookie(callback) {
    chrome.cookies.getAll({domain: "uscourts.gov", name: "KEY"}, function(cookies) {
    	callback(cookies.length > 0);
    });
}

Recap = {};
Recap.gRequestObserver = new RequestObserver(metacache);

chrome.extension.onMessage.addListener(function(msg, sender, sendResponse) {
	if(msg === "getState") {
		var state = {temp_disable: localStorage['temp_disable'] == "true",
					 auto_check_pdf_headers: localStorage['auto_check_pdf_headers'] == "true",
					 display_notifications: localStorage['display_notifications'] == "true",
					 debugging: localStorage['display_notifications'] == "true",
					 active: active,
					 ECFLoggedIn: ECFLoggedIn};
		check_hasECFCookie(function(hasCookie) {
			state.hasECFCookie = hasCookie;
			check_havePACERCookie(function(haveCookie) {
				state.havePACERCookie = haveCookie;
				sendResponse(state);
			});
		});
	} else if(msg.hasOwnProperty('setState')) {
		if(msg.setState.hasOwnProperty('active'))
			active = msg.setState.active;
		if(msg.setState.hasOwnProperty('ECFLoggedIn'))
			ECFLoggedIn = msg.setState.ECFLoggedIn;
	} else if(msg.hasOwnProperty('showAlert')) {
		if(localStorage["display_notifications"] == "true")
			webkitNotifications.createNotification(msg.showAlert.icon, msg.showAlert.headline, msg.showAlert.message).show();
	}

	return true;
});

