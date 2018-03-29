/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview Code to show and hide classes in the docs based on their
 * access: private, public, or exported.
 *
 * Written and maintained by Shaka Player team.
 */

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
