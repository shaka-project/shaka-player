/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Code to show and hide classes in the docs based on their
 * access: private, public, or exported.
 *
 * Written and maintained by Shaka Player team.
 */

function onShowChange() {
  const value = document.getElementById('show').value;
  localStorage.setItem('show', value);

  const setVisibilityByAccess = (access, visible) => {
    const selector = '.access-' + access;
    const list = document.querySelectorAll(selector);
    // querySelectorAll returns an array-like object, not an array.
    for (const element of Array.from(list)) {
      if (visible) {
        element.classList.add('show');
      } else {
        element.classList.remove('show');
      }
    }
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
  const storedSetting = localStorage.getItem('show');
  document.getElementById('show').value = storedSetting;

  if (!document.getElementById('show').value) {
    // fix nonsense, missing, or corrupted values.
    document.getElementById('show').value = 'exported';
  }

  // enact the setting we loaded.
  onShowChange();
}
