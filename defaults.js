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
