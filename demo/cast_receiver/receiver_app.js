/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.require('goog.asserts');
goog.require('ShakaDemoAssetInfo');


/**
 * A Chromecast receiver demo app.
 * @suppress {missingProvide}
 */
class ShakaReceiverApp {
  constructor() {
    /** @private {HTMLVideoElement} */
    this.video_ = null;

    /** @private {shaka.Player} */
    this.player_ = null;

    /** @private {shaka.cast.CastReceiver} */
    this.receiver_ = null;

    /** @private {Element} */
    this.welcomeCard_ = null;

    /** @private {?number} */
    this.idleTimerId_ = null;
  }

  /**
   * Initialize the application.
   */
  init() {
    const video = document.getElementById('video');
    goog.asserts.assert(
        video instanceof HTMLVideoElement, 'Wrong element type!');
    this.video_ = video;

    const ui = this.video_['ui'];
    goog.asserts.assert(
        ui instanceof shaka.ui.Overlay, 'UI not present or wrong type!');

    // We use the UI library on both sender and receiver, to get a consistent UI
    // in both contexts.  The controls, therefore, have both a proxy player
    // (getPlayer) and a local player (getLocalPlayer).  The proxy player is
    // what the sender uses to send commands to the receiver when it's casting.
    // Since this _is_ the receiver, we use the local player (local to this
    // environment on the receiver).  This local player (local to the receiver)
    // will be remotely controlled by the proxy on the sender side.
    this.player_ = ui.getControls().getLocalPlayer();
    goog.asserts.assert(this.player_, 'Player should be available!');

    this.welcomeCard_ = document.getElementById('welcome');

    this.receiver_ = new shaka.cast.CastReceiver(
        this.video_, this.player_,
        (appData) => this.appDataCallback_(appData));
    this.receiver_.addEventListener(
        'caststatuschanged', () => this.checkIdle_());

    // Delete the poster when loading new content or unloading the current one.
    this.player_.addEventListener('loading', () => {
      this.video_.removeAttribute('poster');
    });
    this.player_.addEventListener('unloading', () => {
      this.video_.removeAttribute('poster');
    });

    // Setup content image and title
    this.player_.addEventListener('metadata', (event) => {
      const payload = event['payload'];
      if (!payload) {
        return;
      }
      let title;
      if (payload['key'] == 'TIT2' && payload['data']) {
        title = payload['data'];
      }
      let imageUrl;
      if (payload['key'] == 'APIC' && payload['mimeType'] == '-->') {
        imageUrl = payload['data'];
      }
      if (title) {
        this.receiver_.setContentTitle(title);
      }
      if (imageUrl) {
        this.receiver_.setContentImage(imageUrl);
      }
    });
    this.player_.addEventListener('sessiondata', (event) => {
      const id = event['id'];
      switch (id) {
        case 'com.apple.hls.title': {
          const title = event['value'];
          if (title) {
            this.receiver_.setContentTitle(title);
          }
          break;
        }
        case 'com.apple.hls.poster': {
          let imageUrl = event['value'];
          if (imageUrl) {
            imageUrl = imageUrl.replace('{w}', '512')
                .replace('{h}', '512')
                .replace('{f}', 'jpeg');
            this.receiver_.setContentImage(imageUrl);
          }
          break;
        }
      }
    });

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

    this.receiver_.clearContentMetadata();
    this.receiver_.setContentTitle(asset.name);
    if (asset.iconUri) {
      this.receiver_.setContentImage(asset.iconUri);
    }
  }

  /** @private */
  checkIdle_() {
    console.debug('status changed', 'idle=', this.receiver_.isIdle());

    // If the app is idle, show the idle card and set a timer to close the app.
    // Otherwise, hide the idle card and cancel the timer.
    if (this.receiver_.isIdle()) {
      this.welcomeCard_.style.display = 'block';
      this.startIdleTimer_();
    } else {
      this.welcomeCard_.style.display = 'none';
      this.cancelIdleTimer_();

      // Set a special poster for audio-only assets.
      if (!this.video_.poster && this.video_.readyState != 0 &&
          this.player_.isAudioOnly()) {
        this.video_.poster =
            'https://shaka-player-demo.appspot.com/assets/audioOnly.gif';
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
}  // class ShakaReceiverApp

/**
 * @const {number}
 * @private
 */
ShakaReceiverApp.IDLE_TIMEOUT_MINUTES_ = 5;

document.addEventListener('shaka-ui-loaded', () => {
  // Instantiate ShakaReceiverApp.
  const receiver = new ShakaReceiverApp();
  // Attach it to window so that it can be seen in a debugger.
  window['receiver'] = receiver;
  // Initialize the app.
  receiver.init();
});
