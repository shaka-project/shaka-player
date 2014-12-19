function toggle() {
  var optionValue = document.getElementById('show').value;
  localStorage.setItem('show', optionValue);

  var levels = {
    'exported': 0,
    'public': 1,
    'private': 2
  };
  var showLevel = levels[optionValue];

  var settings = {
    '.show0': true,
    '.show1': (showLevel >= 1),
    '.show2': (showLevel >= 2)
  };

  for (var selector in settings) {
    var reveal = settings[selector];
    var list = document.querySelectorAll(selector);
    list = Array.prototype.slice.call(list, 0);
    list.forEach(function(e) {
      if (reveal) {
        e.classList.add('reveal');
      } else {
        e.classList.remove('reveal');
      }
    });
  }
}

function initToggle() {
  // get the previous setting from storage and populate the form.
  var optionValue = localStorage.getItem('show');
  document.getElementById('show').value = optionValue;

  if (!document.getElementById('show').value) {
    // fix nonsense, missing, or corrupted values.
    document.getElementById('show').value = 'exported';
  }

  // enforce the setting.
  toggle();
}
