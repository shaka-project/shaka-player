/*! @license
 * Shaka Player
 * Copyright 2024 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Use indexOf() here, normally banned in favor of includes(), for
// compatibility with the oldest devices and runtimes.
// eslint-disable-next-line no-restricted-syntax
if (navigator.userAgent.indexOf('CrKey') != -1) {
  // Running in any frame of a Chromecast device.
  // Load and activate the Cast SDK.
  console.log('Loading Cast SDK');

  const script =
  /** @type {HTMLScriptElement} **/(document.createElement('script'));

  script.src = 'https://www.gstatic.com/cast/sdk/libs/caf_receiver/v3/cast_receiver_framework.js';

  // Use an anonymous function here, normally banned in favor of arrow
  // functions, for compatibility with the oldest devices and runtimes.
  // eslint-disable-next-line no-restricted-syntax
  script.onload = function() {
    cast.framework.CastReceiverContext.getInstance().start({
      // What to show as the status of the app to senders
      statusText: 'Shaka Player Testing',
      // Don't shut down for a lack of sender input
      disableIdleTimeout: true,
      // Don't load player libraries, since we are loading Shaka here directly
      skipPlayersLoad: true,
    });

    console.log('Cast SDK loaded');
  };

  // Use an anonymous function here, normally banned in favor of arrow
  // functions, for compatibility with the oldest devices and runtimes.
  // eslint-disable-next-line no-restricted-syntax
  script.onerror = function(error) {
    window.dump('Unable to load Cast SDK: ' + error);
  };

  document.head.appendChild(script);
}
