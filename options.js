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

// Saves options to localStorage.
function save_options() {
  for(var key in prefs) {
    if(typeof prefs[key] == "boolean")
      localStorage[key] = document.getElementById(key).checked;
    else if(typeof prefs[key] == "number")
      localStorage[key] = document.getElementById(key).value;
  }

  var pretty_filenames_choices = document.getElementsByName('pretty_filenames_choice');
  for (var i = 0; i < pretty_filenames_choices.length; i++)
    if (pretty_filenames_choices[i].checked)
      localStorage["pretty_filenames_choice"] = pretty_filenames_choices[i].value;
      
  var recap_server = document.getElementsByName('recap_server');
  for (var i = 0; i < recap_server.length; i++)
    if (recap_server[i].checked)
      localStorage["recap_server"] = recap_server[i].value;

  // Update status to let user know options were saved.
  var status = document.getElementById("status");
  status.innerHTML = "Options Saved.";
  setTimeout(function() {
    status.innerHTML = "";
  }, 750);
}

// Restores checkbox state to saved value from localStorage.
function restore_options() {
  for(var key in prefs) {
    if(typeof prefs[key] == "boolean")
      document.getElementById(key).checked = (localStorage[key] == "true");
    else if(typeof prefs[key] == "number")
      document.getElementById(key).value = localStorage[key]; 
  }

  var pretty_filenames_choices = document.getElementsByName('pretty_filenames_choice');
  for (var i = 0; i < pretty_filenames_choices.length; i++)
    if (localStorage["pretty_filenames_choice"] == pretty_filenames_choices[i].value)
      pretty_filenames_choices[i].checked = true;
      
  var recap_server = document.getElementsByName('recap_server');
  for (var i = 0; i < recap_server.length; i++)
    if (localStorage["recap_server"] == recap_server[i].value)
      recap_server[i].checked = true;
}

// Restores checkbox state to defauLts. Does not save to localStorage
function restore_defaults() {
  for(var key in prefs) {
    if(typeof prefs[key] == "boolean")
      document.getElementById(key).checked = prefs[key];
    else if(typeof prefs[key] == "number")
      document.getElementById(key).value = prefs[key];
  }

  var pretty_filenames_choices = document.getElementsByName('pretty_filenames_choice');
  for (var i = 0; i < pretty_filenames_choices.length; i++)
    if (prefs["pretty_filenames_choice"] == pretty_filenames_choices[i].value)
      pretty_filenames_choices[i].checked = true;
      
  var recap_server = document.getElementsByName('recap_server');
  for (var i = 0; i < recap_server.length; i++)
    if (prefs["recap_server"] == recap_server[i].value)
      recap_server[i].checked = true;
}
document.addEventListener('DOMContentLoaded', restore_options);
document.getElementById('save').addEventListener('click', save_options);
document.getElementById('defaults').addEventListener('click', restore_defaults);
//TODO - disable radios when pretty_filenames is unchecked 
//document.getElementById('pretty_filenames').addEventListener('click', ...);
