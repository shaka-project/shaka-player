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


goog.require('goog.asserts');


/**
 * A Chromecast receiver demo app.
 * @constructor
 * @suppress {missingProvide}
 */
function ShakaReceiver() {
  /** @private {HTMLMediaElement} */
  this.video_ = null;

  /** @private {shaka.Player} */
  this.player_ = null;

  /** @private {shaka.cast.CastReceiver} */
  this.receiver_ = null;

  /** @private {Element} */
  this.controlsElement_ = null;

  /** @private {?number} */
  this.controlsTimerId_ = null;

  /** @private {Element} */
  this.idle_ = null;

  /** @private {?number} */
  this.idleTimerId_ = null;

  /**
   * In seconds.
   * @const
   * @private {number}
   */
  this.idleTimeout_ = 300;
}


/**
 * Initialize the application.
 */
ShakaReceiver.prototype.init = function() {
  // TODO: Check if this is needed after fixing IE
  shaka.polyfill.installAll();

  /** @type {HTMLMediaElement} */
  let video = /** @type {HTMLMediaElement} */
      (document.getElementById('video'));
  goog.asserts.assert(video, 'Video element should be available!');
  this.video_ = video;

  /** @type {!shaka.ui.Overlay} */
  let ui = this.video_['ui'];
  goog.asserts.assert(ui, 'UI should be available!');

  // Make sure we don't show extra UI elements we don't need on the TV.
  ui.configure({
    controlPanelElements: [
      'play_pause',
      'time_and_duration',
      'spacer',
    ],
  });

  // We use the UI library on both sender and receiver, to get a consistent UI
  // in both contexts.  The controls, therefore, have both a proxy player
  // (getPlayer) and a local player (getLocalPlayer).  The proxy player is
  // what the sender uses to send commands to the receiver when it's casting.
  // Since this _is_ the receiver, we use the local player (local to this
  // environment on the receiver).  This local player (local to the receiver)
  // will be remotely controlled by the proxy on the sender side.
  this.player_ = ui.getControls().getLocalPlayer();
  goog.asserts.assert(this.player_, 'Player should be available!');

  this.controlsElement_ = document.querySelector('.shaka-controls-container');

  this.idle_ = document.getElementById('idle');

  this.video_.addEventListener(
      'play', this.onPlayStateChange_.bind(this));
  this.video_.addEventListener(
      'pause', this.onPlayStateChange_.bind(this));
  this.video_.addEventListener(
      'seeking', this.onPlayStateChange_.bind(this));
  this.video_.addEventListener(
      'emptied', this.onPlayStateChange_.bind(this));

  this.receiver_ = new shaka.cast.CastReceiver(
      this.video_, /** @type {!shaka.Player} */ (this.player_),
      this.appDataCallback_.bind(this));
  this.receiver_.addEventListener(
      'caststatuschanged', this.checkIdle_.bind(this));

  this.startIdleTimer_();
};


/**
 * @param {Object} appData
 * @private
 */
ShakaReceiver.prototype.appDataCallback_ = function(appData) {
  // appData is null if we start the app without any media loaded.
  if (!appData) return;

  const asset = ShakaDemoAssetInfo.fromJSON(appData['asset']);
  asset.applyFilters(this.player_.getNetworkingEngine());
  const config = asset.getConfiguration();
  this.player_.configure(config);
};


/** @private */
ShakaReceiver.prototype.checkIdle_ = function() {
  console.debug('status changed',
                'idle=', this.receiver_.isIdle());

  // If the app is idle, show the idle card and set a timer to close the app.
  // Otherwise, hide the idle card and cancel the timer.
  if (this.receiver_.isIdle()) {
    this.idle_.style.display = 'block';
    this.startIdleTimer_();
  } else {
    this.idle_.style.display = 'none';
    this.cancelIdleTimer_();

    // Set a special poster for audio-only assets.
    if (this.video_.readyState != 0 && this.player_.isAudioOnly()) {
      this.video_.poster =
          'https://shaka-player-demo.appspot.com/assets/audioOnly.gif';
    } else {
      // The cast receiver never shows the poster for assets with video streams.
      this.video_.removeAttribute('poster');
    }
  }
};


/** @private */
ShakaReceiver.prototype.startIdleTimer_ = function() {
  this.cancelIdleTimer_();

  this.idleTimerId_ = window.setTimeout(
      window.close.bind(window), this.idleTimeout_ * 1000.0);
};


/** @private */
ShakaReceiver.prototype.cancelIdleTimer_ = function() {
  if (this.idleTimerId_ != null) {
    window.clearTimeout(this.idleTimerId_);
    this.idleTimerId_ = null;
  }
};


/** @private */
ShakaReceiver.prototype.onPlayStateChange_ = function() {
  if (this.controlsTimerId_ != null) {
    window.clearTimeout(this.controlsTimerId_);
  }

  if (this.video_.paused && this.video_.readyState > 0) {
    // Show controls.
    this.controlsElement_.style.opacity = 1;
  } else {
    // Show controls for 3 seconds.
    this.controlsElement_.style.opacity = 1;
    this.controlsTimerId_ = window.setTimeout(function() {
      this.controlsElement_.style.opacity = 0;
    }.bind(this), 3000);
  }
};


/**
 * Initialize the receiver app by instantiating ShakaReceiver.
 */
function receiverAppInit() {
  window.receiver = new ShakaReceiver();
  window.receiver.init();
}


document.addEventListener('shaka-ui-loaded', receiverAppInit);
