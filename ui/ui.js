/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.Overlay');
goog.provide('shaka.ui.Overlay.FailReasonCode');
goog.provide('shaka.ui.Overlay.TrackLabelFormat');

goog.require('goog.asserts');
goog.require('shaka.Player');
goog.require('shaka.log');
goog.require('shaka.polyfill');
goog.require('shaka.ui.Controls');
goog.require('shaka.util.ConfigUtils');
goog.require('shaka.util.Dom');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.Platform');

/**
 * @implements {shaka.util.IDestroyable}
 * @export
 */
shaka.ui.Overlay = class {
  /**
   * @param {!shaka.Player} player
   * @param {!HTMLElement} videoContainer
   * @param {!HTMLMediaElement} video
   */
  constructor(player, videoContainer, video) {
    /** @private {shaka.Player} */
    this.player_ = player;

    /** @private {!shaka.extern.UIConfiguration} */
    this.config_ = this.defaultConfig_();

    // Make sure this container is discoverable and that the UI can be reached
    // through it.
    videoContainer['dataset']['shakaPlayerContainer'] = '';
    videoContainer['ui'] = this;

    // Tag the container for mobile platforms, to allow different styles.
    if (this.isMobile()) {
      videoContainer.classList.add('shaka-mobile');
    }

    /** @private {shaka.ui.Controls} */
    this.controls_ = new shaka.ui.Controls(
        player, videoContainer, video, this.config_);

    // Run the initial setup so that no configure() call is required for default
    // settings.
    this.configure({});

    // If the browser's native controls are disabled, use UI TextDisplayer.
    if (!video.controls) {
      player.setVideoContainer(videoContainer);
    }

    videoContainer['ui'] = this;
    video['ui'] = this;
  }


  /**
   * @override
   * @export
   */
  async destroy() {
    if (this.controls_) {
      await this.controls_.destroy();
    }
    this.controls_ = null;

    if (this.player_) {
      await this.player_.destroy();
    }
    this.player_ = null;
  }


  /**
   * Detects if this is a mobile platform, in case you want to choose a
   * different UI configuration on mobile devices.
   *
   * @return {boolean}
   * @export
   */
  isMobile() {
    return shaka.util.Platform.isMobile();
  }


  /**
   * @return {!shaka.extern.UIConfiguration}
   * @export
   */
  getConfiguration() {
    const ret = this.defaultConfig_();
    shaka.util.ConfigUtils.mergeConfigObjects(
        ret, this.config_, this.defaultConfig_(),
        /* overrides= */ {}, /* path= */ '');
    return ret;
  }


  /**
   * @param {string|!Object} config This should either be a field name or an
   *   object following the form of {@link shaka.extern.UIConfiguration}, where
   *   you may omit any field you do not wish to change.
   * @param {*=} value This should be provided if the previous parameter
   *   was a string field name.
   * @export
   */
  configure(config, value) {
    goog.asserts.assert(typeof(config) == 'object' || arguments.length == 2,
        'String configs should have values!');

    // ('fieldName', value) format
    if (arguments.length == 2 && typeof(config) == 'string') {
      config = shaka.util.ConfigUtils.convertToConfigObject(config, value);
    }

    goog.asserts.assert(typeof(config) == 'object', 'Should be an object!');

    shaka.util.ConfigUtils.mergeConfigObjects(
        this.config_, config, this.defaultConfig_(),
        /* overrides= */ {}, /* path= */ '');

    // If a cast receiver app id has been given, add a cast button to the UI
    if (this.config_.castReceiverAppId &&
        !this.config_.overflowMenuButtons.includes('cast')) {
      this.config_.overflowMenuButtons.push('cast');
    }

    goog.asserts.assert(this.player_ != null, 'Should have a player!');

    this.controls_.configure(this.config_);

    this.controls_.dispatchEvent(new shaka.util.FakeEvent('uiupdated'));
  }


  /**
   * @return {shaka.ui.Controls}
   * @export
   */
  getControls() {
    return this.controls_;
  }


  /**
   * Enable or disable the custom controls.
   *
   * @param {boolean} enabled
   * @export
   */
  setEnabled(enabled) {
    this.controls_.setEnabledShakaControls(enabled);
  }


  /**
   * @return {!shaka.extern.UIConfiguration}
   * @private
   */
  defaultConfig_() {
    const config = {
      controlPanelElements: [
        'play_pause',
        'time_and_duration',
        'spacer',
        'mute',
        'volume',
        'fullscreen',
        'overflow_menu',
      ],
      overflowMenuButtons: [
        'captions',
        'quality',
        'language',
        'picture_in_picture',
        'cast',
        'playback_rate',
      ],
      addSeekBar: true,
      addBigPlayButton: false,
      castReceiverAppId: '',
      clearBufferOnQualityChange: true,
      showUnbufferedStart: false,
      seekBarColors: {
        base: 'rgba(255, 255, 255, 0.3)',
        buffered: 'rgba(255, 255, 255, 0.54)',
        played: 'rgb(255, 255, 255)',
        adBreaks: 'rgb(255, 204, 0)',
      },
      volumeBarColors: {
        base: 'rgba(255, 255, 255, 0.54)',
        level: 'rgb(255, 255, 255)',
      },
      trackLabelFormat: shaka.ui.Overlay.TrackLabelFormat.LANGUAGE,
      fadeDelay: 0,
      doubleClickForFullscreen: true,
      enableKeyboardPlaybackControls: true,
      enableFullscreenOnRotation: true,
      forceLandscapeOnFullscreen: true,
    };

    // Check AirPlay support
    if (window.WebKitPlaybackTargetAvailabilityEvent) {
      config.overflowMenuButtons.push('airplay');
    }

    // On mobile, by default, hide the volume slide and the small play/pause
    // button and show the big play/pause button in the center.
    // This is in line with default styles in Chrome.
    if (this.isMobile()) {
      config.addBigPlayButton = true;
      config.controlPanelElements = config.controlPanelElements.filter(
          (name) => name != 'play_pause' && name != 'volume');
    }

    return config;
  }

  /**
   * @private
   */
  static async scanPageForShakaElements_() {
    // Install built-in polyfills to patch browser incompatibilities.
    shaka.polyfill.installAll();
    // Check to see if the browser supports the basic APIs Shaka needs.
    if (!shaka.Player.isBrowserSupported()) {
      shaka.log.error('Shaka Player does not support this browser. ' +
          'Please see https://tinyurl.com/y7s4j9tr for the list of ' +
          'supported browsers.');

      // After scanning the page for elements, fire a special "loaded" event for
      // when the load fails. This will allow the page to react to the failure.
      shaka.ui.Overlay.dispatchLoadedEvent_('shaka-ui-load-failed',
          shaka.ui.Overlay.FailReasonCode.NO_BROWSER_SUPPORT);
      return;
    }

    // Look for elements marked 'data-shaka-player-container'
    // on the page. These will be used to create our default
    // UI.
    const containers = document.querySelectorAll(
        '[data-shaka-player-container]');

    // Look for elements marked 'data-shaka-player'. They will
    // either be used in our default UI or with native browser
    // controls.
    const videos = document.querySelectorAll(
        '[data-shaka-player]');

    if (!videos.length && !containers.length) {
      // No elements have been tagged with shaka attributes.
    } else if (videos.length && !containers.length) {
      // Just the video elements were provided.
      for (const video of videos) {
        // If the app has already manually created a UI for this element,
        // don't create another one.
        if (video['ui']) {
          continue;
        }
        goog.asserts.assert(video.tagName.toLowerCase() == 'video',
            'Should be a video element!');

        const container = document.createElement('div');
        const videoParent = video.parentElement;
        videoParent.replaceChild(container, video);
        container.appendChild(video);

        shaka.ui.Overlay.setupUIandAutoLoad_(container, video);
      }
    } else {
      for (const container of containers) {
        // If the app has already manually created a UI for this element,
        // don't create another one.
        if (container['ui']) {
          continue;
        }
        goog.asserts.assert(container.tagName.toLowerCase() == 'div',
            'Container should be a div!');

        let currentVideo = null;
        for (const video of videos) {
          goog.asserts.assert(video.tagName.toLowerCase() == 'video',
              'Should be a video element!');
          if (video.parentElement == container) {
            currentVideo = video;
            break;
          }
        }

        if (!currentVideo) {
          currentVideo = document.createElement('video');
          currentVideo.setAttribute('playsinline', '');
          container.appendChild(currentVideo);
        }

        try {
          // eslint-disable-next-line no-await-in-loop
          await shaka.ui.Overlay.setupUIandAutoLoad_(container, currentVideo);
        } catch (e) {
          // This can fail if, for example, not every player file has loaded.
          // Ad-block is a likely cause for this sort of failure.
          shaka.log.error('Error setting up Shaka Player', e);
          shaka.ui.Overlay.dispatchLoadedEvent_('shaka-ui-load-failed',
              shaka.ui.Overlay.FailReasonCode.PLAYER_FAILED_TO_LOAD);
          return;
        }
      }
    }

    // After scanning the page for elements, fire the "loaded" event.  This will
    // let apps know they can use the UI library programmatically now, even if
    // they didn't have any Shaka-related elements declared in their HTML.
    shaka.ui.Overlay.dispatchLoadedEvent_('shaka-ui-loaded');
  }


  /**
   * @param {string} eventName
   * @param {shaka.ui.Overlay.FailReasonCode=} reasonCode
   * @private
   */
  static dispatchLoadedEvent_(eventName, reasonCode) {
    let detail = null;
    if (reasonCode != undefined) {
      detail = {
        'reasonCode': reasonCode,
      };
    }
    const uiLoadedEvent = new CustomEvent(eventName, {detail});
    document.dispatchEvent(uiLoadedEvent);
  }


  /**
   * @param {!Element} container
   * @param {!Element} video
   * @private
   */
  static async setupUIandAutoLoad_(container, video) {
    // Create the UI
    const player = new shaka.Player(
        shaka.util.Dom.asHTMLMediaElement(video));
    const ui = new shaka.ui.Overlay(player,
        shaka.util.Dom.asHTMLElement(container),
        shaka.util.Dom.asHTMLMediaElement(video));

    // Get and configure cast app id.
    let castAppId = '';

    // Cast receiver id can be specified on either container or video.
    // It should not be provided on both. If it was, we will use the last
    // one we saw.
    if (container['dataset'] &&
        container['dataset']['shakaPlayerCastReceiverId']) {
      castAppId = container['dataset']['shakaPlayerCastReceiverId'];
    } else if (video['dataset'] &&
               video['dataset']['shakaPlayerCastReceiverId']) {
      castAppId = video['dataset']['shakaPlayerCastReceiverId'];
    }

    if (castAppId.length) {
      ui.configure({castReceiverAppId: castAppId});
    }

    if (shaka.util.Dom.asHTMLMediaElement(video).controls) {
      ui.getControls().setEnabledNativeControls(true);
    }

    // Get the source and load it
    // Source can be specified either on the video element:
    //  <video src='foo.m2u8'></video>
    // or as a separate element inside the video element:
    //  <video>
    //    <source src='foo.m2u8'/>
    //  </video>
    // It should not be specified on both.
    const src = video.getAttribute('src');
    if (src) {
      const sourceElem = document.createElement('source');
      sourceElem.setAttribute('src', src);
      video.appendChild(sourceElem);
      video.removeAttribute('src');
    }

    for (const elem of video.querySelectorAll('source')) {
      try { // eslint-disable-next-line no-await-in-loop
        await ui.getControls().getPlayer().load(elem.getAttribute('src'));
        break;
      } catch (e) {
        shaka.log.error('Error auto-loading asset', e);
      }
    }
  }
};

/**
 * Describes what information should show up in labels for selecting audio
 * variants and text tracks.
 *
 * @enum {number}
 * @export
 */
shaka.ui.Overlay.TrackLabelFormat = {
  'LANGUAGE': 0,
  'ROLE': 1,
  'LANGUAGE_ROLE': 2,
  'LABEL': 3,
};

/*
 * "shaka.ui.TrackLabelFormat" is deprecated and will be removed in v4.
 *
 * @deprecated
 * @enum {number}
 */
shaka.ui.TrackLabelFormat = shaka.ui.Overlay.TrackLabelFormat;

/**
 * Describes the possible reasons that the UI might fail to load.
 *
 * @enum {number}
 * @export
 */
shaka.ui.Overlay.FailReasonCode = {
  'NO_BROWSER_SUPPORT': 0,
  'PLAYER_FAILED_TO_LOAD': 1,
};


/**
 * "shaka.ui.FailReasonCode" is deprecated and will be removed in v4.
 *
 * @deprecated
 * @enum {number}
 */
shaka.ui.FailReasonCode = shaka.ui.Overlay.FailReasonCode;


if (document.readyState == 'complete') {
  // Don't fire this event synchronously.  In a compiled bundle, the "shaka"
  // namespace might not be exported to the window until after this point.
  (async () => {
    await Promise.resolve();
    shaka.ui.Overlay.scanPageForShakaElements_();
  })();
} else {
  window.addEventListener('load', shaka.ui.Overlay.scanPageForShakaElements_);
}

