/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @summary
 * This simulates the interface between ShakaDemoMain and the various tabs.
 * Note that that interface is NOT defined by an extern, as it is not part of
 * Shaka Player proper.
 */
shaka.test.FakeDemoMain = class {
  constructor() {
    // Using the player's constructor argument to attach a video element seems
    // to cause flaky timeouts on teardown.  If a video element is needed in
    // the future, please explicitly call attach(video) and await the result
    // during the test setup.
    /** @type {!shaka.Player} */
    this.player = new shaka.Player();

    this.config_ = this.player.getConfiguration();
    // Default UI config values mirrored from shaka.ui.Overlay.defaultConfig_().
    /** @type {!shaka.extern.UIConfiguration} */
    this.uiConfig_ = {
      controlPanelElements: [],
      topControlPanelElements: [],
      bigButtons: [],
      overflowMenuButtons: [],
      contextMenuElements: [],
      statisticsList: [],
      adStatisticsList: [],
      playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
      fastForwardRates: [2, 4, 8, 1],
      rewindRates: [-1, -2, -4, -8],
      addSeekBar: true,
      customContextMenu: true,
      castReceiverAppId: '',
      castAndroidReceiverCompatible: false,
      clearBufferOnQualityChange: true,
      showUnbufferedStart: false,
      seekBarColors: {
        base: 'rgba(255, 255, 255, 0.3)',
        buffered: 'rgba(255, 255, 255, 0.54)',
        played: 'rgb(255, 255, 255)',
        adBreaks: 'rgb(255, 204, 0)',
        chapters: 'rgba(255, 0, 0, 0.8)',
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
      fullScreenElement: null,
      showAudioChannelCountVariants: true,
      seekOnTaps: false,
      tapSeekDistance: 10,
      refreshTickInSeconds: 0.125,
      displayInVrMode: false,
      defaultVrProjectionMode: 'equirectangular',
      preferVideoFullScreenInVisionOS: true,
      showAudioCodec: true,
      showVideoCodec: true,
      castSenderUrl: 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js',
      enableKeyboardPlaybackControlsInWindow: false,
      alwaysShowVolumeBar: false,
      shortcuts: {
        small_rewind: 'ArrowLeft',
        small_fast_forward: 'ArrowRight',
        large_rewind: 'PageDown',
        large_fast_forward: 'PageUp',
        home: 'Home',
        end: 'End',
        captions: 'c',
        fullscreen: 'f',
        mute: 'm',
        picture_in_picture: 'p',
        increase_video_speed: '>',
        decrease_video_speed: '<',
        play: 'k',
        take_screenshot: 'u',
        last_frame: ',',
        next_frame: '.',
      },
      menuOpenUntilUserClosesIt: true,
      allowTogglePresentationTime: true,
      showRemainingTimeInPresentationTime: false,
      enableVrDeviceMotion: true,
      showUIAlways: false,
      showUIAlwaysOnAudioOnly: true,
      preferIntlDisplayNames: true,
      mediaSession: {
        enabled: true,
        handleMetadata: true,
        handleActions: true,
        handlePosition: true,
        supportedActions: [],
      },
      captionsStyles: true,
      captionsFontScaleFactors: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
      documentPictureInPicture: {
        enabled: true,
        preferInitialWindowPlacement: false,
        disallowReturnToOpener: false,
      },
      showUIOnPaused: true,
    };
    this.selectedAsset = null;

    /** @type {!jasmine.Spy} */
    this.getCurrentConfigValue = jasmine.createSpy('getCurrentConfigValue');
    this.getCurrentConfigValue.and.callFake((valueName) => {
      return this.getValueFromGivenConfig_(valueName, this.config_);
    });

    /** @type {!jasmine.Spy} */
    this.getCurrentUIConfigValue = jasmine.createSpy('getCurrentUIConfigValue');
    this.getCurrentUIConfigValue.and.callFake((valueName) => {
      return this.getValueFromGivenConfig_(valueName, this.uiConfig_);
    });

    /** @type {!jasmine.Spy} */
    this.configureUI = jasmine.createSpy('configureUI');

    /** @type {!jasmine.Spy} */
    this.getUIConfiguration = jasmine.createSpy('getUIConfiguration');
    this.getUIConfiguration.and.callFake(() => this.uiConfig_);

    /** @type {!jasmine.Spy} */
    this.remakeHash = jasmine.createSpy('remakeHash');

    /** @type {!jasmine.Spy} */
    this.getUILocale = jasmine.createSpy('getUILocale');
    this.getUILocale.and.returnValue('en-us');

    /** @type {!jasmine.Spy} */
    this.getNativeControlsEnabled =
        jasmine.createSpy('getNativeControlsEnabled');
    this.getNativeControlsEnabled.and.returnValue(false);

    /** @type {!jasmine.Spy} */
    this.setNativeControlsEnabled =
        jasmine.createSpy('setNativeControlsEnabled');

    /** @type {!jasmine.Spy} */
    this.getTrickPlayControlsEnabled =
        jasmine.createSpy('getTrickPlayControlsEnabled');
    this.getTrickPlayControlsEnabled.and.returnValue(false);

    /** @type {!jasmine.Spy} */
    this.setTrickPlayControlsEnabled =
        jasmine.createSpy('setTrickPlayControlsEnabled');

    /** @type {!jasmine.Spy} */
    this.getCustomContextMenuEnabled =
        jasmine.createSpy('getCustomContextMenuEnabled');
    this.getCustomContextMenuEnabled.and.returnValue(false);

    /** @type {!jasmine.Spy} */
    this.setCustomContextMenuEnabled =
        jasmine.createSpy('setCustomContextMenuEnabled');

    /** @type {!jasmine.Spy} */
    this.getConfiguration = jasmine.createSpy('getConfiguration');
    this.getConfiguration.and.returnValue(this.config_);

    /** @type {!jasmine.Spy} */
    this.resetConfiguration = jasmine.createSpy('resetConfiguration');

    /** @type {!jasmine.Spy} */
    this.configure = jasmine.createSpy('configure');

    /** @type {!jasmine.Spy} */
    this.getIsDrawerOpen = jasmine.createSpy('getIsDrawerOpen');
    this.getIsDrawerOpen.and.returnValue(true);

    /** @type {!jasmine.Spy} */
    this.addNavButton = jasmine.createSpy('addNavButton').and.callFake(() => {
      const container =
      /** @type {!HTMLDivElement} */ (document.createElement('div'));
      const button =
      /** @type {!HTMLButtonElement} */ (document.createElement('button'));
      return {container: container, button: button};
    });

    /** @type {!jasmine.Spy} */
    this.getHamburgerMenu = jasmine.createSpy('getHamburgerMenu');
    this.getHamburgerMenu.and.callFake(() => {
      return /** @type {!HTMLDivElement} */ (document.createElement('div'));
    });

    /** @type {!jasmine.Spy} */
    this.getLocalizedString = jasmine.createSpy('getLocalizedString');
    this.getLocalizedString.and.callFake((name) => name);

    /** @type {!jasmine.Spy} */
    this.loadAsset = jasmine.createSpy('loadAsset');
    this.loadAsset.and.returnValue(Promise.resolve());

    /** @type {!jasmine.Spy} */
    this.setupOfflineSupport = jasmine.createSpy('setupOfflineSupport');

    /** @type {!jasmine.Spy} */
    this.getAssetUnsupportedReason =
        jasmine.createSpy('getAssetUnsupportedReason');
    this.getAssetUnsupportedReason.and.returnValue(null);

    /** @private {string} */
    this.watermarkText_ = '';

    /** @type {!jasmine.Spy} */
    this.getWatermarkText = jasmine.createSpy('getWatermarkText');
    this.getWatermarkText.and.callFake(() => this.watermarkText_);

    /** @type {!jasmine.Spy} */
    this.setWatermarkText = jasmine.createSpy('setWatermarkText');
    this.setWatermarkText.and.callFake((text) => {
      this.watermarkText_ = text;
    });
  }

  /** Creates and assigns the mock demo main (and all of the real tab). */
  static setup() {
    shakaDemoMain = new shaka.test.FakeDemoMain();
    const event = document.createEvent('event');
    event.initEvent('shaka-main-loaded', false, false);
    document.dispatchEvent(event);
  }

  /** Disposes of the mock demo main (and all of the real tabs). */
  async cleanup() {
    const event = document.createEvent('event');
    event.initEvent('shaka-main-cleanup', false, false);
    document.dispatchEvent(event);
    await this.player.destroy();
    shakaDemoMain = null;
  }

  /**
   * @param {string} valueName
   * @param {!Object} configObject
   * @return {*}
   * @private
   */
  getValueFromGivenConfig_(valueName, configObject) {
    let objOn = configObject;
    let valueNameOn = valueName;
    while (valueNameOn) {
      // Split using a regex that only matches the first period.
      const split = valueNameOn.split(/\.(.+)/);
      if (split.length == 3) {
        valueNameOn = split[1];
        objOn = objOn[split[0]];
      } else {
        return objOn[split[0]];
      }
    }
    return undefined;
  }
};


// The various tabs communicate with ShakaDemoMain through a global variable,
// called shakaDemoMain.
let shakaDemoMain;
