function onShowChange() {
  var value = document.getElementById('show').value;
  localStorage.setItem('show', value);


  var setVisibilityByAccess = function(access, visible) {
    var selector = '.access-' + access;
    var list = document.querySelectorAll(selector);
    // querySelectorAll returns an array-like object, not an array.
    Array.prototype.forEach.call(list, function(element) {
      if (visible) {
        element.classList.add('show');
      } else {
        element.classList.remove('show');
      }
    });
  };

  if (value == 'exported') {
    setVisibilityByAccess('public', false);
    setVisibilityByAccess('private', false);
  } else if (value == 'public') {
    setVisibilityByAccess('public', true);
    setVisibilityByAccess('private', false);
  } else {
    setVisibilityByAccess('public', true);
    setVisibilityByAccess('private', true);
  }
}

function initShowWidget() {
  // get the previous setting from storage and populate the form.
  var storedSetting = localStorage.getItem('show');
  document.getElementById('show').value = storedSetting;

  if (!document.getElementById('show').value) {
    // fix nonsense, missing, or corrupted values.
    document.getElementById('show').value = 'exported';
  }

  // enact the setting we loaded.
  onShowChange();
}
