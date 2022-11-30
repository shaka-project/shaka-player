/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// These definitions will override the defaults when the Closure base library
// is loaded.  This is necessary to get Closure to load dependencies by
// creating DOM elements in JavaScript, rather than the legacy default of using
// document.write().  This is more compatible with a wider variety of setups,
// and allows us to enable Karma options {useIframe: false, runInParent: true}
// to test in a single frame.
window.CLOSURE_UNCOMPILED_DEFINES = {
  'goog.ENABLE_CHROME_APP_SAFE_SCRIPT_LOADING': true,
};
