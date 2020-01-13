/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.require('goog.asserts');


/**
 * A Chromecast receiver demo app.
 * @suppress {missingProvide}
 */
class ShakaReceiverApp {
  constructor() {
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
    this.idleCard_ = null;

    /** @private {?number} */
    this.idleTimerId_ = null;
  }

  /**
   * Initialize the application.
   */
  init() {
    /** @type {HTMLMediaElement} */
    const video = /** @type {HTMLMediaElement} */
        (document.getElementById('video'));
    goog.asserts.assert(video, 'Video element should be available!');
    this.video_ = video;

    /** @type {!shaka.ui.Overlay} */
    const ui = this.video_['ui'];
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

    this.idleCard_ = document.getElementById('idle');

    this.video_.addEventListener(
        'play', () => this.onPlayStateChange_());
    this.video_.addEventListener(
        'pause', () => this.onPlayStateChange_());
    this.video_.addEventListener(
        'seeking', () => this.onPlayStateChange_());
    this.video_.addEventListener(
        'emptied', () => this.onPlayStateChange_());

    this.receiver_ = new shaka.cast.CastReceiver(
        this.video_, this.player_,
        (appData) => this.appDataCallback_(appData));
    this.receiver_.addEventListener(
        'caststatuschanged', () => this.checkIdle_());

    this.startIdleTimer_();
  }

  /**
   * @param {Object} appData
   * @private
   */
  appDataCallback_(appData) {
    // appData is null if we start the app without any media loaded.
    if (!appData) {
      return;
    }

    const asset = ShakaDemoAssetInfo.fromJSON(appData['asset']);
    asset.applyFilters(this.player_.getNetworkingEngine());
    const config = asset.getConfiguration();
    this.player_.configure(config);
  }

  /** @private */
  checkIdle_() {
    console.debug('status changed', 'idle=', this.receiver_.isIdle());

    // If the app is idle, show the idle card and set a timer to close the app.
    // Otherwise, hide the idle card and cancel the timer.
    if (this.receiver_.isIdle()) {
      this.idleCard_.style.display = 'block';
      this.startIdleTimer_();
    } else {
      this.idleCard_.style.display = 'none';
      this.cancelIdleTimer_();

      // Set a special poster for audio-only assets.
      if (this.video_.readyState != 0 && this.player_.isAudioOnly()) {
        this.video_.poster =
            'https://shaka-player-demo.appspot.com/assets/audioOnly.gif';
      } else {
        // The cast receiver never shows the poster for assets with video
        // streams.
        this.video_.removeAttribute('poster');
      }
    }
  }

  /** @private */
  startIdleTimer_() {
    this.cancelIdleTimer_();

    this.idleTimerId_ = window.setTimeout(() => {
      window.close();
    }, ShakaReceiverApp.IDLE_TIMEOUT_MINUTES_ * 60 * 1000);
  }

  /** @private */
  cancelIdleTimer_() {
    if (this.idleTimerId_ != null) {
      window.clearTimeout(this.idleTimerId_);
      this.idleTimerId_ = null;
    }
  }

  /** @private */
  onPlayStateChange_() {
    if (this.controlsTimerId_ != null) {
      window.clearTimeout(this.controlsTimerId_);
      this.controlsTimerId_ = null;
    }

    if (this.video_.paused && this.video_.readyState > 0) {
      // Show controls.
      this.controlsElement_.style.opacity = 1;
    } else {
      // Show controls for 3 seconds.
      this.controlsElement_.style.opacity = 1;
      this.controlsTimerId_ = window.setTimeout(() => {
        this.controlsElement_.style.opacity = 0;
      }, ShakaReceiverApp.CONTROLS_TIMEOUT_SECONDS_ * 1000);
    }
  }
}  // class ShakaRecevierApp

/**
 * @const {number}
 * @private
 */
ShakaReceiverApp.IDLE_TIMEOUT_MINUTES_ = 5;

/**
 * @const {number}
 * @private
 */
ShakaReceiverApp.CONTROLS_TIMEOUT_SECONDS_ = 3;

document.addEventListener('shaka-ui-loaded', () => {
  // Initialize the receiver app by instantiating ShakaReceiverApp.
  window.receiver = new ShakaReceiverApp();
  window.receiver.init();
});
