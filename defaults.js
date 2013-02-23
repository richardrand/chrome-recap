var prefs = {"display_notifications": true,
         "pretty_filenames": true,
         "auto_check_pdf_headers": true,
         "temp_disable": false,
         "pretty_filenames_choice": "pretty_filenames_IAFilename",
     	 "cache_time_ms": 86400000};
for(var key in prefs) {
	if(typeof localStorage[key] == "undefined")
		localStorage[key] = prefs[key];
}