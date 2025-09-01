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
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.device.IDevice');
goog.require('shaka.log');
goog.require('shaka.polyfill');
goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Watermark');
goog.require('shaka.util.ConfigUtils');
goog.require('shaka.util.Dom');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.IDestroyable');

/**
 * @implements {shaka.util.IDestroyable}
 * @export
 */
shaka.ui.Overlay = class {
  /**
   * @param {!shaka.Player} player
   * @param {!HTMLElement} videoContainer
   * @param {!HTMLMediaElement} video
   * @param {?HTMLCanvasElement=} vrCanvas
   */
  constructor(player, videoContainer, video, vrCanvas = null) {
    /** @private {shaka.Player} */
    this.player_ = player;

    /** @private {HTMLElement} */
    this.videoContainer_ = videoContainer;

    /** @private {!shaka.extern.UIConfiguration} */
    this.config_ = this.defaultConfig_();

    // Get and configure cast app id.
    let castAppId = '';

    // Get and configure cast Android Receiver Compatibility
    let castAndroidReceiverCompatible = false;

    // Cast receiver id can be specified on either container or video.
    // It should not be provided on both. If it was, we will use the last
    // one we saw.
    if (videoContainer['dataset'] &&
        videoContainer['dataset']['shakaPlayerCastReceiverId']) {
      const dataSet = videoContainer['dataset'];
      castAppId = dataSet['shakaPlayerCastReceiverId'];
      castAndroidReceiverCompatible =
          dataSet['shakaPlayerCastAndroidReceiverCompatible'] === 'true';
    } else if (video['dataset'] &&
               video['dataset']['shakaPlayerCastReceiverId']) {
      const dataSet = video['dataset'];
      castAppId = dataSet['shakaPlayerCastReceiverId'];
      castAndroidReceiverCompatible =
          dataSet['shakaPlayerCastAndroidReceiverCompatible'] === 'true';
    }

    if (castAppId.length) {
      this.config_.castReceiverAppId = castAppId;
      this.config_.castAndroidReceiverCompatible =
          castAndroidReceiverCompatible;
    }

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
        player, videoContainer, video, vrCanvas, this.config_);

    // If the browser's native controls are disabled, use UI TextDisplayer.
    if (!video.controls) {
      player.setVideoContainer(videoContainer);
    }

    videoContainer['ui'] = this;
    video['ui'] = this;
    /** @private {shaka.ui.Watermark} */
    this.watermark_ = null;
  }


  /**
   * @param {boolean=} forceDisconnect If true, force the receiver app to shut
   *   down by disconnecting.  Does nothing if not connected.
   * @override
   * @export
   */
  async destroy(forceDisconnect = false) {
    if (this.controls_) {
      await this.controls_.destroy(forceDisconnect);
    }
    this.controls_ = null;

    if (this.player_) {
      await this.player_.destroy();
    }
    this.player_ = null;
    this.watermark_ = null;
  }


  /**
   * Detects if this is a mobile platform, in case you want to choose a
   * different UI configuration on mobile devices.
   *
   * @return {boolean}
   * @export
   */
  isMobile() {
    const device = shaka.device.DeviceFactory.getDevice();
    return device.getDeviceType() == shaka.device.IDevice.DeviceType.MOBILE;
  }


  /**
   * Detects if this is a smart tv platform, in case you want to choose a
   * different UI configuration on smart tv devices.
   *
   * @return {boolean}
   * @export
   */
  isSmartTV() {
    const device = shaka.device.DeviceFactory.getDevice();
    return device.getDeviceType() == shaka.device.IDevice.DeviceType.TV;
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

    const newConfig = /** @type {!shaka.extern.UIConfiguration} */(
      Object.assign({}, this.config_));
    shaka.util.ConfigUtils.mergeConfigObjects(
        newConfig, config, this.defaultConfig_(),
        /* overrides= */ {}, /* path= */ '');

    goog.asserts.assert(this.player_ != null, 'Should have a player!');

    const diff = shaka.util.ConfigUtils.getDifferenceFromConfigObjects(
        newConfig, this.config_);
    if (!Object.keys(diff).length) {
      // No changes
      return;
    }

    this.config_ = newConfig;

    this.controls_.configure(this.config_);

    this.controls_.dispatchEvent(new shaka.util.FakeEvent('uiupdated'));

    this.setupCastSenderUrl_();
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
   * @param {string} text
   * @param {?shaka.ui.Watermark.Options=} options
   * @export
   */
  setTextWatermark(text, options) {
    if (text && !this.watermark_ && this.videoContainer_ && this.controls_) {
      this.watermark_ = new shaka.ui.Watermark(
          this.videoContainer_, this.controls_);
    }
    if (this.watermark_) {
      this.watermark_.setTextWatermark(text, options);
    }
  }

  /**
   * @export
   */
  removeWatermark() {
    if (this.watermark_) {
      this.watermark_.removeWatermark();
    }
  }


  /**
   * @return {!shaka.extern.UIConfiguration}
   * @private
   */
  defaultConfig_() {
    const controlPanelElements = [
      'play_pause',
      'skip_previous',
      'skip_next',
      'mute',
      'volume',
      'time_and_duration',
      'spacer',
      'overflow_menu',
    ];

    if (window.chrome) {
      controlPanelElements.push('cast');
    }
    // eslint-disable-next-line no-restricted-syntax
    if ('remote' in HTMLMediaElement.prototype) {
      controlPanelElements.push('remote');
    } else if (window.WebKitPlaybackTargetAvailabilityEvent) {
      controlPanelElements.push('airplay');
    }
    controlPanelElements.push('fullscreen');

    const config = {
      controlPanelElements,
      overflowMenuButtons: [
        'captions',
        'quality',
        'language',
        'chapter',
        'picture_in_picture',
        'playback_rate',
        'recenter_vr',
        'toggle_stereoscopic',
      ],
      statisticsList: [
        'width',
        'height',
        'currentCodecs',
        'corruptedFrames',
        'decodedFrames',
        'droppedFrames',
        'drmTimeSeconds',
        'licenseTime',
        'liveLatency',
        'loadLatency',
        'bufferingTime',
        'manifestTimeSeconds',
        'estimatedBandwidth',
        'streamBandwidth',
        'maxSegmentDuration',
        'pauseTime',
        'playTime',
        'completionPercent',
        'manifestSizeBytes',
        'bytesDownloaded',
        'nonFatalErrorCount',
        'manifestPeriodCount',
        'manifestGapCount',
      ],
      adStatisticsList: [
        'loadTimes',
        'averageLoadTime',
        'started',
        'overlayAds',
        'playedCompletely',
        'skipped',
        'errors',
      ],
      contextMenuElements: [
        'loop',
        'picture_in_picture',
        'save_video_frame',
        'statistics',
        'ad_statistics',
      ],
      playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
      fastForwardRates: [2, 4, 8, 1],
      rewindRates: [-1, -2, -4, -8],
      addSeekBar: true,
      addBigPlayButton: false,
      customContextMenu: false,
      castReceiverAppId: '',
      castAndroidReceiverCompatible: false,
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
      qualityMarks: {
        '720': '',
        '1080': 'HD',
        '1440': '2K',
        '2160': '4K',
        '4320': '8K',
      },
      trackLabelFormat: shaka.ui.Overlay.TrackLabelFormat.LANGUAGE,
      textTrackLabelFormat: shaka.ui.Overlay.TrackLabelFormat.LANGUAGE,
      fadeDelay: 0,
      closeMenusDelay: 2,
      doubleClickForFullscreen: true,
      singleClickForPlayAndPause: true,
      enableKeyboardPlaybackControls: true,
      enableFullscreenOnRotation: false,
      forceLandscapeOnFullscreen: false,
      enableTooltips: true,
      keyboardSeekDistance: 5,
      keyboardLargeSeekDistance: 60,
      fullScreenElement: this.videoContainer_,
      preferDocumentPictureInPicture: true,
      showAudioChannelCountVariants: true,
      seekOnTaps: false,
      tapSeekDistance: 10,
      refreshTickInSeconds: 0.125,
      displayInVrMode: false,
      defaultVrProjectionMode: 'equirectangular',
      setupMediaSession: true,
      preferVideoFullScreenInVisionOS: true,
      showAudioCodec: true,
      showVideoCodec: true,
      castSenderUrl: 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js',
      enableKeyboardPlaybackControlsInWindow: false,
      alwaysShowVolumeBar: false,
    };

    // On mobile, by default, hide the volume slide and the small play/pause
    // button and show the big play/pause button in the center.
    // This is in line with default styles in Chrome.
    if (this.isMobile()) {
      config.addBigPlayButton = true;
      config.singleClickForPlayAndPause = false;
      config.seekOnTaps = true;
      config.enableTooltips = false;
      config.doubleClickForFullscreen = false;
      const device = shaka.device.DeviceFactory.getDevice();
      config.enableFullscreenOnRotation = device.getBrowserEngine() !==
          shaka.device.IDevice.BrowserEngine.WEBKIT;
      config.forceLandscapeOnFullscreen = true;
      const filterElements = [
        'play_pause',
        'skip_previous',
        'skip_next',
        'volume',
      ];
      config.controlPanelElements = config.controlPanelElements.filter(
          (name) => !filterElements.includes(name));
      config.overflowMenuButtons = config.overflowMenuButtons.filter(
          (name) => !filterElements.includes(name));
      config.contextMenuElements = config.contextMenuElements.filter(
          (name) => !filterElements.includes(name));
    } else if (this.isSmartTV()) {
      config.addBigPlayButton = true;
      config.singleClickForPlayAndPause = false;
      config.enableTooltips = false;
      config.doubleClickForFullscreen = false;
      const filterElements = [
        'play_pause',
        'cast',
        'remote',
        'airplay',
        'volume',
        'save_video_frame',
      ];
      config.controlPanelElements = config.controlPanelElements.filter(
          (name) => !filterElements.includes(name));
      config.overflowMenuButtons = config.overflowMenuButtons.filter(
          (name) => !filterElements.includes(name));
      config.contextMenuElements = config.contextMenuElements.filter(
          (name) => !filterElements.includes(name));
    }

    return config;
  }

  /**
   * @private
   */
  setupCastSenderUrl_() {
    const castSenderUrl = this.config_.castSenderUrl;
    if (!castSenderUrl || !this.config_.castReceiverAppId ||
        !window.chrome || chrome.cast || this.isSmartTV()) {
      return;
    }
    let alreadyLoaded = false;
    for (const element of document.getElementsByTagName('script')) {
      const script = /** @type {HTMLScriptElement} **/(element);
      if (script.src === castSenderUrl) {
        alreadyLoaded = true;
        break;
      }
    }
    if (!alreadyLoaded) {
      const script =
        /** @type {HTMLScriptElement} **/(document.createElement('script'));
      script.src = castSenderUrl;
      script.defer = true;
      document.head.appendChild(script);
    }
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

    // Look for elements marked 'data-shaka-player-canvas'
    // on the page. These will be used to create our default
    // UI.
    const canvases = document.querySelectorAll(
        '[data-shaka-player-canvas]');

    // Look for elements marked 'data-shaka-player-vr-canvas'
    // on the page. These will be used to create our default
    // UI.
    const vrCanvases = document.querySelectorAll(
        '[data-shaka-player-vr-canvas]');

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
        const {lcevcCanvas, vrCanvas} =
            shaka.ui.Overlay.findOrMakeSpecialCanvases_(
                container, canvases, vrCanvases);
        shaka.ui.Overlay.setupUIandAutoLoad_(
            container, video, lcevcCanvas, vrCanvas);
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
        const {lcevcCanvas, vrCanvas} =
            shaka.ui.Overlay.findOrMakeSpecialCanvases_(
                container, canvases, vrCanvases);
        try {
          // eslint-disable-next-line no-await-in-loop
          await shaka.ui.Overlay.setupUIandAutoLoad_(
              container, currentVideo, lcevcCanvas, vrCanvas);
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
   * @param {!Element} lcevcCanvas
   * @param {?Element} vrCanvas
   * @private
   */
  static async setupUIandAutoLoad_(container, video, lcevcCanvas, vrCanvas) {
    // Create the UI
    const player = new shaka.Player();
    const ui = new shaka.ui.Overlay(player,
        shaka.util.Dom.asHTMLElement(container),
        shaka.util.Dom.asHTMLMediaElement(video),
        vrCanvas ? shaka.util.Dom.asHTMLCanvasElement(vrCanvas) : null);

    // Attach Canvas used for LCEVC Decoding
    player.attachCanvas(/** @type {HTMLCanvasElement} */(lcevcCanvas));

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
    const urls = [];
    const src = video.getAttribute('src');
    if (src) {
      urls.push(src);
      video.removeAttribute('src');
    }

    for (const source of video.getElementsByTagName('source')) {
      urls.push(/** @type {!HTMLSourceElement} */ (source).src);
      video.removeChild(source);
    }

    await player.attach(shaka.util.Dom.asHTMLMediaElement(video));

    for (const url of urls) {
      try { // eslint-disable-next-line no-await-in-loop
        await ui.getControls().getPlayer().load(url);
        break;
      } catch (e) {
        shaka.log.error('Error auto-loading asset', e);
      }
    }
  }


  /**
   * @param {!Element} container
   * @param {!NodeList<!Element>} canvases
   * @param {!NodeList<!Element>} vrCanvases
   * @return {{lcevcCanvas: !Element, vrCanvas: ?Element}}
   * @private
   */
  static findOrMakeSpecialCanvases_(container, canvases, vrCanvases) {
    let lcevcCanvas = null;
    for (const canvas of canvases) {
      goog.asserts.assert(canvas.tagName.toLowerCase() == 'canvas',
          'Should be a canvas element!');
      if (canvas.parentElement == container) {
        lcevcCanvas = canvas;
        break;
      }
    }
    if (!lcevcCanvas) {
      lcevcCanvas = document.createElement('canvas');
      lcevcCanvas.classList.add('shaka-canvas-container');
      container.appendChild(lcevcCanvas);
    }
    let vrCanvas = null;
    for (const canvas of vrCanvases) {
      goog.asserts.assert(canvas.tagName.toLowerCase() == 'canvas',
          'Should be a canvas element!');
      if (canvas.parentElement == container) {
        vrCanvas = canvas;
        break;
      }
    }
    return {
      lcevcCanvas,
      vrCanvas,
    };
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

