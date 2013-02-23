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
}
document.addEventListener('DOMContentLoaded', restore_options);
document.getElementById('save').addEventListener('click', save_options);
document.getElementById('defaults').addEventListener('click', restore_defaults);
//TODO - disable radios when pretty_filenames is unchecked 
//document.getElementById('pretty_filenames').addEventListener('click', ...);