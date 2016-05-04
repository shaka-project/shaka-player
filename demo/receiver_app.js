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
  this.pauseIcon_ = null;

  /** @private {Element} */
  this.controlsElement_ = null;

  /** @private {ShakaControls} */
  this.controlsUi_ = null;

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
  shaka.polyfill.installAll();

  this.video_ =
      /** @type {!HTMLMediaElement} */(document.getElementById('video'));
  this.player_ = new shaka.Player(this.video_);

  this.controlsUi_ = new ShakaControls();
  this.controlsUi_.initMinimal(this.video_, this.player_);

  this.controlsElement_ = document.getElementById('controls');
  this.pauseIcon_ = document.getElementById('pauseIcon');
  this.idle_ = document.getElementById('idle');

  this.video_.addEventListener(
      'play', this.onPlayStateChange_.bind(this));
  this.video_.addEventListener(
      'pause', this.onPlayStateChange_.bind(this));
  this.video_.addEventListener(
      'seeking', this.onPlayStateChange_.bind(this));
  this.video_.addEventListener(
      'emptied', this.onPlayStateChange_.bind(this));

  this.video_.addEventListener(
      'canplay', this.checkIdle_.bind(this));
  this.video_.addEventListener(
      'emptied', this.checkIdle_.bind(this));
  this.video_.addEventListener(
      'ended', this.checkIdle_.bind(this));

  this.receiver_ = new shaka.cast.CastReceiver(
      this.video_, this.player_, this.appDataCallback_.bind(this));
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

  var asset = /** @type {shakaAssets.AssetInfo} */(appData['asset']);
  // Patch in non-transferable callbacks for YT DRM:
  if (appData['isYtDrm']) {
    asset.drmCallback = shakaAssets.YouTubeCallback;
    asset.licenseProcessor = shakaAssets.YouTubePostProcessor;
  }
  ShakaDemoUtils.setupAssetMetadata(asset, this.player_);
};


/** @private */
ShakaReceiver.prototype.checkIdle_ = function() {
  var connected = this.receiver_.isConnected();
  var loaded = this.video_.readyState > 0;
  var ended = this.video_.ended;

  var idle = !loaded || (!connected && ended);

  console.debug('status changed',
                'connected=', connected,
                'loaded=', loaded,
                'ended=', ended,
                'idle=', idle);

  // If something is loaded, but we've just gone idle, unload the content, show
  // the idle card, and set a timer to close the app.
  if (idle && loaded) {
    this.player_.unload();
    this.idle_.style.display = 'block';
    this.startIdleTimer_();
  }

  // If we are no longer idle, hide the idle card, and make sure we cancel any
  // timers that would close the app.
  if (!idle) {
    this.idle_.style.display = 'none';
    this.cancelIdleTimer_();
  }
};


/** @private */
ShakaReceiver.prototype.startIdleTimer_ = function() {
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

  if (this.video_.paused) {
    this.pauseIcon_.textContent = 'pause';
  } else {
    this.pauseIcon_.textContent = 'play_arrow';
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


if (document.readyState == 'loading' ||
    document.readyState == 'interactive') {
  window.addEventListener('load', receiverAppInit);
} else {
  receiverAppInit();
}
