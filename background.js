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

