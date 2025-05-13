/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shakaDemo.Main');

goog.require('ShakaDemoAssetInfo');
goog.require('goog.asserts');
goog.require('shakaDemo.CloseButton');
goog.require('shakaDemo.Utils');
goog.require('shakaDemo.Visualizer');
goog.require('shakaDemo.VisualizerButton');

/**
 * Shaka Player demo, main section.
 * This controls the header and the footer, and contains all methods that should
 * be shared by multiple page layouts (loading assets, setting/checking
 * configuration, etc).
 */
shakaDemo.Main = class {
  /** */
  constructor() {
    /** @private {HTMLVideoElement} */
    this.video_ = null;

    /** @private {HTMLElement} */
    this.container_ = null;

    /** @private {shaka.Player} */
    this.player_ = null;

    /** @type {?ShakaDemoAssetInfo} */
    this.selectedAsset = null;

    /** @type {shaka.ui.Localization} */
    this.localization_ = null;

    /**
     * The configuration asked for by the user. I.e., not from the asset.
     * @private {shaka.extern.PlayerConfiguration}
     */
    this.desiredConfig_;

    /** @private {shaka.extern.PlayerConfiguration} */
    this.defaultConfig_;

    /** @private {boolean} */
    this.fullyLoaded_ = false;

    /** @private {?shaka.ui.Controls} */
    this.controls_ = null;

    /** @private {?Array<shaka.extern.StoredContent>} */
    this.initialStoredList_;

    /** @private {boolean} */
    this.trickPlayControlsEnabled_ = false;

    /** @private {boolean} */
    this.customContextMenu_ = false;

    /** @private {string} */
    this.watermarkText_ = '';

    /** @private {boolean} */
    this.nativeControlsEnabled_ = false;

    /** @private {shaka.extern.SupportType} */
    this.support_;

    /** @private {string} */
    this.uiLocale_ = '';

    /** @private {boolean} */
    this.noInput_ = false;

    /** @private {!HTMLAnchorElement} */
    this.errorDisplayLink_ = /** @type {!HTMLAnchorElement} */(
      document.getElementById('error-display-link'));

    /** @private {?number} */
    this.currentErrorSeverity_ = null;

    // Override the icon for the MDL library's menu button.
    // eslint-disable-next-line no-restricted-syntax
    MaterialLayout.prototype.Constant_.MENU_ICON = 'settings';

    /** @private {?shakaDemo.Visualizer} */
    this.visualizer_ = null;
  }

  /**
   * This function contains the steps of initialization that should be followed
   * whether or not the demo successfully set up.
   * @private
   */
  initCommon_() {
    // Display uncaught exceptions.  Note that this doesn't seem to work in IE.
    // See shakaDemo.Main.initWrapper for a failsafe that works for init-time
    // errors on IE.
    window.addEventListener('error', (event) => {
      const errorEvent = /** @type {!ErrorEvent} */(event);

      // Exception to the exceptions we catch: ChromeVox (screen reader) always
      // throws an error as of Chrome 73.  Screen these out since they are
      // unrelated to our application and we can't control them.
      if (errorEvent.message.includes('cvox.Api')) {
        return;
      }

      this.onError_(/** @type {!shaka.util.Error} */ (errorEvent.error));
    });

    // Display unhandled rejections.
    window.addEventListener('unhandledrejection', (event) => {
      const rejectionEvent = /** @type {!PromiseRejectionEvent} */(event);
      const message =
          `Unhandled rejection in promise: ${rejectionEvent.reason}`;
      console.error('unhandledrejection', rejectionEvent.reason,
          rejectionEvent.promise);
      this.handleError_(shaka.util.Error.Severity.CRITICAL, message, '');
    });

    // Set up event listeners.
    document.getElementById('error-display-close-button').addEventListener(
        'click', (event) => this.closeError_());

    // Set up version strings in the appropriate divs.
    this.setUpVersionStrings_();
  }

  /**
   * Set up the application with errors to show that load failed.
   * This does not dispatch the shaka-main-loaded event, so it will not cause
   * the nav bar buttons to be set up.
   * @param {!shaka.ui.Overlay.FailReasonCode} reasonCode
   */
  initFailed(reasonCode) {
    this.initCommon_();

    // Set up version links, so the user can switch to compiled mode if
    // necessary.
    this.makeVersionLinks_();

    const errorCloseButton =
        document.getElementById('error-display-close-button');
    errorCloseButton.style.display = 'none';

    // Update the componentHandler, to account for any new MDL elements added.
    componentHandler.upgradeDom();

    // Disable elements that should not be used.
    const elementsToDisable = [];
    const disableClass = 'should-disable-on-fail';
    for (const element of document.getElementsByClassName(disableClass)) {
      elementsToDisable.push(element);
    }
    // The hamburger menu close button is added programmatically by MDL, and
    // thus isn't given our 'disableonfail' class.
    for (const element of document.getElementsByClassName(
        'mdl-layout__drawer-button')) {
      elementsToDisable.push(element);
    }
    for (const element of elementsToDisable) {
      element.tabIndex = -1;
      element.classList.add('disabled-by-fail');
    }

    // Process a synthetic error about lack of browser support.
    const severity = shaka.util.Error.Severity.CRITICAL;
    let href = '';
    let message = '';
    switch (reasonCode) {
      case shaka.ui.Overlay.FailReasonCode.NO_BROWSER_SUPPORT:
        message = 'Your browser is not supported!';
        href = 'https://github.com/shaka-project/shaka-player#' +
                'platform-and-browser-support-matrix';
        break;
      case shaka.ui.Overlay.FailReasonCode.PLAYER_FAILED_TO_LOAD:
        message = 'Shaka Player failed to load! If you are using an adblocker' +
            ', try switching to compiled mode at the bottom of the page.';
        break;
    }
    this.handleError_(severity, message, href);
  }

  /**
   * Initialize the application.
   */
  async init() {
    this.initCommon_();

    this.support_ = await shaka.Player.probeSupport();

    this.video_ =
      /** @type {!HTMLVideoElement} */ (document.getElementById('video'));
    this.video_.poster = shakaDemo.Main.mainPoster_;

    this.container_ = /** @type {!HTMLElement} */(
      document.getElementsByClassName('video-container')[0]);

    if (navigator.serviceWorker) {
      console.debug('Registering service worker.');
      // NOTE: This can sometimes hang on iOS 12, so let's not wait for it to
      // complete before setting up the app.  We don't even use the Promise
      // result or react to the registration failure except to log it.
      navigator.serviceWorker.register('service_worker.js');
    }

    // Optionally enter noinput mode. This has to happen before setting up the
    // player.
    this.noInput_ = this.getParams_().has('noinput');
    this.setupPlayer_();
    window.addEventListener('hashchange', () => this.hashChanged_());

    await this.setupStorage_();

    this.setupBugButton_();

    if (this.noInput_) {
      // Set the page to noInput mode, disabling the header and footer.
      const hideClass = 'should-hide-in-no-input-mode';
      for (const element of document.getElementsByClassName(hideClass)) {
        this.hideElement_(element);
      }
      const showClass = 'should-show-in-no-input-mode';
      for (const element of document.getElementsByClassName(showClass)) {
        this.showElement_(element);
      }
      // Also fullscreen the container.
      this.container_.classList.add('no-input-sized');
      document.getElementById('video-bar').classList.add('no-input-sized');
    } else {
      goog.asserts.assert(this.player_, 'Player should exist by now.');

      // Make the visualizer element.
      const vCanvas = /** @type {!HTMLCanvasElement} */ (
        document.getElementById('visualizer-canvas'));
      const vDiv = /** @type {!HTMLElement} */ (
        document.getElementById('visualizer-div'));
      const vControlsDiv = /** @type {!HTMLElement} */ (
        document.getElementById('visualizer-controls-div'));
      const vScreenshotDiv = /** @type {!HTMLElement} */ (
        document.getElementById('visualizer-screenshot-div'));
      /** @private {?shakaDemo.Visualizer} */
      this.visualizer_ = new shakaDemo.Visualizer(
          vCanvas, vDiv, vScreenshotDiv, vControlsDiv, this.video_,
          this.player_);
    }

    this.readHash_();

    // The main page is loaded. Dispatch an event, so the various
    // configurations will load themselves.
    this.dispatchEventWithName_('shaka-main-loaded');

    // Wait for one interruptor cycle, so that the tabs have time to load.
    // This ensures that, for example, if there is an asset playing at page
    // load time, the video will scroll into view second, and the page won't
    // scroll away from the video.
    await Promise.resolve();

    // Update the componentHandler, to account for any new MDL elements added.
    componentHandler.upgradeDom();

    const asset = this.getLastAssetFromHash_();

    this.fullyLoaded_ = true;
    this.remakeHash();

    if (asset && !this.selectedAsset) {
      // If an asset has begun loading in the meantime (for example, due to
      // re-joining an existing cast session), don't play this.
      this.loadAsset(asset);
    }
  }

  /**
   * @param {string} url
   * @return {!Promise<string>}
   * @private
   */
  async loadText_(url) {
    const netEngine = new shaka.net.NetworkingEngine();
    const retryParams = shaka.net.NetworkingEngine.defaultRetryParameters();
    const request = shaka.net.NetworkingEngine.makeRequest([url], retryParams);
    const requestType = shaka.net.NetworkingEngine.RequestType.APP;
    const operation = netEngine.request(requestType, request);
    const response = await operation.promise;
    const text = shaka.util.StringUtils.fromUTF8(response.data);
    await netEngine.destroy();
    return text;
  }

  /** @private */
  async reportBug_() {
    // Fetch the special bug template.
    let text = await this.loadText_('autoTemplate.txt');

    // Fill in what parts of the template we can.
    const fillInTemplate = (replaceString, value) => {
      text = text.replace(replaceString, value);
    };
    fillInTemplate('RE:player', shaka.Player.version);
    if (this.selectedAsset) {
      const uriLines = [];
      const addLine = (key, value) => {
        uriLines.push(key + '= `' + value + '`');
      };
      addLine('uri', this.selectedAsset.manifestUri);
      if (this.selectedAsset.adTagUri) {
        addLine('ad tag uri', this.selectedAsset.adTagUri);
      }
      if (this.selectedAsset.licenseServers.size) {
        const uri = this.selectedAsset.licenseServers.values().next().value;
        addLine('license server', uri);
        for (const drmSystem of this.selectedAsset.licenseServers.keys()) {
          if (!shakaDemo.Main.commonDrmSystems.includes(drmSystem)) {
            addLine('drm system', drmSystem);
            break;
          }
        }
      }
      if (this.selectedAsset.certificateUri) {
        addLine('certificate', this.selectedAsset.certificateUri);
      }
      fillInTemplate('RE:uris', uriLines.join('\n'));
    } else {
      fillInTemplate('RE:uris', 'No asset');
    }
    fillInTemplate('RE:browser', navigator.userAgent);
    if (this.selectedAsset &&
        this.selectedAsset.source == shakaAssets.Source.CUSTOM) {
      // This is a custom asset, so add a comment warning about custom assets.
      const warning = await this.loadText_('customWarning.txt');
      fillInTemplate('RE:customwarning', warning);
    } else {
      // No need for any warnings. So remove it (and the newline after it).
      fillInTemplate('RE:customwarning\n', '');
    }

    const urlTerms = [];
    urlTerms.push('labels=type%3A+bug');
    urlTerms.push('body=' + encodeURIComponent(text));
    const url = 'https://github.com/shaka-project/shaka-player/issues/new?' +
        urlTerms.join('&');

    // Navigate to the github issue opening interface, with the
    // partially-filled template as a preset body, opening in another tab.
    window.open(url, '_blank');
  }

  /** @private */
  setupBugButton_() {
    const bugButton = document.getElementById('bug-button');
    bugButton.addEventListener('click', () => this.reportBug_());

    // The button should be disabled when offline, as we can't report bugs in
    // that state.
    if (!navigator.onLine) {
      bugButton.setAttribute('disabled', '');
    }
    window.addEventListener('online', () => {
      bugButton.removeAttribute('disabled');
    });
    window.addEventListener('offline', () => {
      bugButton.setAttribute('disabled', '');
    });
  }

  /** @private */
  configureUI_() {
    const video = /** @type {!HTMLVideoElement} */ (this.video_);
    const ui = video['ui'];

    const uiConfig = ui.getConfiguration();
    uiConfig.customContextMenu = this.customContextMenu_;
    // Remove any trick play configurations from a previous config.
    uiConfig.addSeekBar = true;
    uiConfig.controlPanelElements =
        uiConfig.controlPanelElements.filter((element) => {
          return element != 'rewind' && element != 'fast_forward';
        });
    if (this.trickPlayControlsEnabled_) {
      // Replace the position the play_pause button was at with a full suite of
      // trick play controls, including rewind and fast-forward.
      const index = uiConfig.controlPanelElements.indexOf('play_pause');
      uiConfig.controlPanelElements.splice(
          index, 1, 'rewind', 'play_pause', 'fast_forward');
    }
    if (!uiConfig.controlPanelElements.includes('close')) {
      uiConfig.controlPanelElements.push('close');
    }
    if (!uiConfig.overflowMenuButtons.includes('visualizer')) {
      uiConfig.overflowMenuButtons.push('visualizer');
    }
    ui.configure(uiConfig);
    if (this.watermarkText_) {
      ui.setTextWatermark(this.watermarkText_);
    } else {
      ui.removeWatermark();
    }
  }

  /** @private */
  setupPlayer_() {
    const video = /** @type {!HTMLVideoElement} */ (this.video_);
    const ui = video['ui'];
    this.player_ = ui.getControls().getPlayer();

    if (!this.noInput_) {
      // Don't add the close button if in noInput mode; it doesn't make much
      // sense to stop playing a video if you can't start playing other videos.

      // Register custom controls to the UI.
      const closeFactory = new shakaDemo.CloseButton.Factory();
      shaka.ui.Controls.registerElement('close', closeFactory);
      const visualizerFactory = new shakaDemo.VisualizerButton.Factory();
      shaka.ui.OverflowMenu.registerElement('visualizer', visualizerFactory);

      // Configure UI.
      this.configureUI_();
    }

    // Add application-level default configs here.  These are not the library
    // defaults, but they are the application defaults.  This will affect the
    // default values assigned to UI config elements as well as the decision
    // about what values to place in the URL hash.
    this.player_.configure(
        'manifest.dash.clockSyncUri', 'https://time.akamai.com/?ms&iso');

    // Get default config.
    this.defaultConfig_ = this.player_.getConfiguration();
    this.desiredConfig_ = this.player_.getConfiguration();
    const languages = navigator.languages || ['en-us'];
    this.configure('preferredAudioLanguage', languages[0]);
    this.configure('preferredTextLanguage', languages[0]);
    this.uiLocale_ = languages[0];
    // TODO(#1591): Support multiple language preferences

    const onErrorEvent = (event) => this.onErrorEvent_(event);
    this.player_.addEventListener('error', onErrorEvent);

    // Listen to events on controls.
    this.controls_ = ui.getControls();
    this.controls_.addEventListener('error', onErrorEvent);
    this.controls_.addEventListener('caststatuschanged', (event) => {
      this.onCastStatusChange_(event['newStatus']);
    });

    this.localization_ = this.controls_.getLocalization();

    const drawerCloseButton = document.getElementById('drawer-close-button');
    drawerCloseButton.addEventListener('click', () => {
      const layout = document.getElementById('main-layout');
      layout.MaterialLayout.toggleDrawer();
      this.dispatchEventWithName_('shaka-main-drawer-state-change');
      this.hideElement_(drawerCloseButton);
    });
    // Dispatch drawer state change events when the drawer button or obfuscator
    // are pressed also.
    const drawerButton = document.querySelector('.mdl-layout__drawer-button');
    goog.asserts.assert(drawerButton, 'There should be a drawer button.');
    const openDrawer = () => {
      this.dispatchEventWithName_('shaka-main-drawer-state-change');
      this.showElement_(drawerCloseButton);
    };
    // Listen to both the "click" and "keydown" events on the drawer button,
    // since the element is actually a div rather than a button, which means
    // that it doesn't fire "click" events when activated by keyboard input.
    drawerButton.addEventListener('click', openDrawer);
    drawerButton.addEventListener('keydown', (event) => {
      const key = (/** @type {!KeyboardEvent} */ (event)).key;
      // Ignore "keydown" input for keys that won't trigger the button (i.e.
      // anything besides spacebar or enter).
      if (key == ' ' || key == 'Spacebar' || key == 'Enter') {
        openDrawer();
      }
    });
    const obfuscator = document.querySelector('.mdl-layout__obfuscator');
    goog.asserts.assert(obfuscator, 'There should be an obfuscator.');
    obfuscator.addEventListener('click', () => {
      this.dispatchEventWithName_('shaka-main-drawer-state-change');
      this.hideElement_(drawerCloseButton);
    });
    this.hideElement_(drawerCloseButton);
  }

  /** @return {boolean} */
  getIsDrawerOpen() {
    const drawer = document.querySelector('.mdl-layout__drawer');
    goog.asserts.assert(drawer, 'There should be a drawer.');
    return drawer.classList.contains('is-visible');
  }

  /**
   * Gets a unique storage identifier for an asset.
   * @param {!ShakaDemoAssetInfo} asset
   * @return {string}
   * @private
   */
  getIdentifierFromAsset_(asset) {
    // Custom assets can't have special characters like [ or ] in their name,
    // and none of the default assets will have that in their name, so we can
    // be sure that no asset will have [CUSTOM] in its name.
    return asset.name +
           (asset.source == shakaAssets.Source.CUSTOM ? ' [CUSTOM]' : '');
  }

  /**
   * Creates a storage instance.
   * If and only if storage is not available, this will return null.
   * These storage instances are meant to be used once and then destroyed, using
   * the |Storage.destroy| method.
   * @return {?shaka.offline.Storage}
   * @private
   */
  makeStorageInstance_() {
    if (!shaka.offline.Storage.support()) {
      return null;
    }

    const storage = new shaka.offline.Storage();

    // Configure the storage instance.
    /**
     * @param {string} identifier
     * @return {?ShakaDemoAssetInfo}
     */
    const getAssetWithIdentifier = (identifier) => {
      for (const asset of shakaAssets.testAssets) {
        if (this.getIdentifierFromAsset_(asset) == identifier) {
          return asset;
        }
      }
      if (shakaDemoCustom) {
        for (const asset of shakaDemoCustom.assets()) {
          if (this.getIdentifierFromAsset_(asset) == identifier) {
            return asset;
          }
        }
      }
      return null;
    };
    /**
     * @param {shaka.extern.StoredContent} content
     * @param {number} progress
     */
    const progressCallback = (content, progress) => {
      const identifier = content.appMetadata['identifier'];
      const asset = getAssetWithIdentifier(identifier);
      if (asset) {
        asset.storedProgress = progress;
        this.dispatchEventWithName_('shaka-main-offline-progress');
      }
    };
    storage.configure(this.desiredConfig_);
    storage.configure('offline.progressCallback', progressCallback);

    return storage;
  }

  /**
   * Attaches callbacks to an asset so that it can be downloaded online.
   * This method does not verify whether storage is or is not possible.
   * Also, if an asset has an associated offline version, load it with that
   * info.
   * @param {!ShakaDemoAssetInfo} asset
   */
  setupOfflineSupport(asset) {
    if (!this.initialStoredList_) {
      // Storage failed to set up, so nothing happened.
      return;
    }

    // If the list of stored content does not contain this asset, then make sure
    // that the asset's |storedContent| value is null. Custom assets that were
    // once stored might have that object serialized with their other data.
    asset.storedContent = null;
    for (const storedContent of this.initialStoredList_) {
      const identifier = storedContent.appMetadata['identifier'];
      if (this.getIdentifierFromAsset_(asset) == identifier) {
        asset.storedContent = storedContent;
      }
    }

    asset.storeCallback = async () => {
      const storage = this.makeStorageInstance_();
      if (!storage) {
        return;
      }
      try {
        await this.drmConfiguration_(asset, storage);
        const metadata = {
          'identifier': this.getIdentifierFromAsset_(asset),
          'downloaded': new Date(),
        };
        asset.storedProgress = 0;
        this.dispatchEventWithName_('shaka-main-offline-progress');
        const start = Date.now();
        const stored = await storage.store(asset.manifestUri, metadata,
            asset.mimeType || null, asset.extraThumbnail,
            asset.extraText).promise;
        const end = Date.now();
        console.log('Download time:', end - start);
        asset.storedContent = stored;
      } catch (error) {
        this.onError_(/** @type {!shaka.util.Error} */ (error));
        asset.storedContent = null;
      }
      storage.destroy();
      asset.storedProgress = 1;
      this.dispatchEventWithName_('shaka-main-offline-progress');
    };

    asset.unstoreCallback = async () => {
      if (asset == this.selectedAsset) {
        this.unload();
      }
      if (asset.storedContent && asset.storedContent.offlineUri) {
        const storage = this.makeStorageInstance_();
        if (!storage) {
          return;
        }
        try {
          asset.storedProgress = 0;
          this.dispatchEventWithName_('shaka-main-offline-progress');
          await storage.remove(asset.storedContent.offlineUri);
          asset.storedContent = null;
        } catch (error) {
          this.onError_(/** @type {!shaka.util.Error} */ (error));
          // Presumably, if deleting the asset fails, it still exists?
        }
        storage.destroy();
        asset.storedProgress = 1;
        this.dispatchEventWithName_('shaka-main-offline-progress');
      }
    };
  }

  /**
   * @return {!Promise}
   * @private
   */
  async setupStorage_() {
    // Load stored asset infos.
    const storage = this.makeStorageInstance_();
    if (!storage) {
      return;
    }
    try {
      this.initialStoredList_ = await storage.list();
    } catch (error) {
      // If this operation errors, it means that storage (while supported) is
      // being held up by some kind of error.
      // Log that error, and then pretend that storage is unsupported.
      console.error(error);
      this.initialStoredList_ = null;
    } finally {
      storage.destroy();
    }

    // Setup asset callbacks for storage, for the test assets.
    for (const asset of shakaAssets.testAssets) {
      if (this.getAssetUnsupportedReason(asset, /* needOffline= */ true)) {
        // Don't bother setting up the callbacks.
        continue;
      }

      this.setupOfflineSupport(asset);
    }
  }

  /** @private */
  hashChanged_() {
    this.readHash_();
    this.dispatchEventWithName_('shaka-main-config-change');
  }

  /**
   * Get why the asset is unplayable, if it is unplayable.
   *
   * @param {!ShakaDemoAssetInfo} asset
   * @param {boolean} needOffline True if offline support is required.
   * @return {?string} unsupportedReason
   *   Null if asset is supported.
   */
  getAssetUnsupportedReason(asset, needOffline) {
    if (needOffline &&
        (!shaka.offline.Storage.support() || !this.initialStoredList_)) {
      return 'Your browser does not support offline storage.';
    }

    if (asset.source == shakaAssets.Source.CUSTOM) {
      // We can't be sure if custom assets are supported or not. Just assume
      // they are.
      return null;
    }

    // Is the asset disabled?
    if (asset.disabled) {
      return 'This asset is disabled.';
    }

    if (needOffline && !asset.features.includes(shakaAssets.Feature.OFFLINE)) {
      return 'This asset cannot be downloaded.';
    }

    if (!asset.isClear() && !asset.isAes128()) {
      const hasSupportedDRM = asset.drm.some((drm) => {
        for (const identifier of shakaAssets.identifiersForKeySystem(drm)) {
          if (this.support_.drm[identifier]) {
            return true;
          }
        }
        return false;
      });
      if (!hasSupportedDRM) {
        return 'Your browser does not support the required key systems.';
      }
      if (needOffline) {
        const hasSupportedOfflineDRM = asset.drm.some((drm) => {
          for (const identifier of shakaAssets.identifiersForKeySystem(drm)) {
            // Special case when using clear keys.
            if (identifier == 'org.w3.clearkey') {
              const licenseServers = asset.getLicenseServers();
              if (!licenseServers.has(identifier)) {
                return this.support_.drm[identifier];
              }
            } else if (this.support_.drm[identifier]) {
              return this.support_.drm[identifier].persistentState;
            }
          }
          return false;
        });
        if (!hasSupportedOfflineDRM) {
          return 'Your browser does not support offline licenses for the ' +
              'required key systems.';
        }
      }
    }

    // Does the browser support the asset's manifest type?
    if (asset.features.includes(shakaAssets.Feature.DASH) &&
        !this.support_.manifest['application/dash+xml']) {
      return 'Your browser does not support MPEG-DASH manifests.';
    }
    if (asset.features.includes(shakaAssets.Feature.HLS) &&
        !this.support_.manifest['application/x-mpegurl']) {
      return 'Your browser does not support HLS manifests.';
    }
    if (asset.features.includes(shakaAssets.Feature.MSS) &&
        !this.support_.manifest['application/vnd.ms-sstr+xml']) {
      return 'Your browser does not support MSS manifests.';
    }

    // Does the asset contain a playable mime type?
    const mimeTypes = [];
    if (asset.features.includes(shakaAssets.Feature.WEBM)) {
      mimeTypes.push('video/webm');
    }
    if (asset.features.includes(shakaAssets.Feature.MP4)) {
      mimeTypes.push('video/mp4');
    }
    if (asset.features.includes(shakaAssets.Feature.MP2TS)) {
      mimeTypes.push('video/mp2t');
    }
    if (asset.features.includes(shakaAssets.Feature.CONTAINERLESS)) {
      mimeTypes.push('audio/aac');
    }
    if (asset.features.includes(shakaAssets.Feature.DOLBY_VISION_P5)) {
      mimeTypes.push('video/mp4; codecs="dvh1.05.01"');
    }
    if (asset.features.includes(shakaAssets.Feature.DOLBY_VISION_3D)) {
      mimeTypes.push('video/mp4; codecs="dvh1.20.01"');
    }
    if (asset.features.includes(shakaAssets.Feature.AV1)) {
      mimeTypes.push('video/mp4; codecs="av01.0.01M.08"');
    }
    let hasSupportedMimeType = mimeTypes.some((type) => {
      return this.support_.media[type];
    });
    if (!hasSupportedMimeType &&
        !(window.ManagedMediaSource || window.MediaSource) &&
        !!navigator.vendor && navigator.vendor.includes('Apple')) {
      if (mimeTypes.includes('video/mp4')) {
        hasSupportedMimeType = true;
      }
      if (mimeTypes.includes('video/mp2t')) {
        hasSupportedMimeType = true;
      }
    }
    if (!hasSupportedMimeType) {
      return 'Your browser does not support the required video format.';
    }

    return null;
  }

  /**
   * Enable or disable the UI's trick play controls.
   *
   * @param {boolean} enabled
   */
  setTrickPlayControlsEnabled(enabled) {
    this.trickPlayControlsEnabled_ = enabled;
    // Configure the UI, to add or remove the controls.
    this.configureUI_();
    this.remakeHash();
  }

  /**
   * Get if the trick play controls are enabled.
   *
   * @return {boolean} enabled
   */
  getTrickPlayControlsEnabled() {
    return this.trickPlayControlsEnabled_;
  }

  /**
   * Enable or disable the UI's custom context menu.
   *
   * @param {boolean} enabled
   */
  setCustomContextMenuEnabled(enabled) {
    this.customContextMenu_ = enabled;
    // Configure the UI, to add or remove the controls.
    this.configureUI_();
    this.remakeHash();
  }

  /**
   * Get if the UI's custom context menu is enabled.
   *
   * @return {boolean} enabled
   */
  getCustomContextMenuEnabled() {
    return this.customContextMenu_;
  }

  /**
   * Set the text for watermark.
   *
   * @param {string} text
   */
  setWatermarkText(text) {
    this.watermarkText_ = text;
    // Configure the UI, to add or remove the controls.
    this.configureUI_();
    this.remakeHash();
  }

  /**
   * Get the current text for watermark.
   *
   * @return {string}
   */
  getWatermarkText() {
    return this.watermarkText_;
  }

  /**
   * Enable or disable the native controls.
   * Goes into effect during the next load.
   *
   * @param {boolean} enabled
   */
  setNativeControlsEnabled(enabled) {
    this.nativeControlsEnabled_ = enabled;
    this.remakeHash();
  }

  /**
   * Get if the native controls are enabled.
   *
   * @return {boolean} enabled
   */
  getNativeControlsEnabled() {
    return this.nativeControlsEnabled_;
  }

  /** @param {string} locale */
  setUILocale(locale) {
    this.uiLocale_ = locale;

    // Fall back to browser languages after the demo page setting.
    const preferredLocales = [locale].concat(navigator.languages);

    this.localization_.changeLocale(preferredLocales);
  }

  /** @return {string} */
  getUILocale() {
    return this.uiLocale_;
  }

  /**
   * @return {?ShakaDemoAssetInfo}
   * @private
   */
  getLastAssetFromHash_() {
    const params = this.getParams_();

    const manifest = params.get('asset');
    const assetBase64 = params.get('assetBase64');
    if (manifest) {
      const adTagUri = params.get('adTagUri');
      // See if it's a default asset.
      for (const asset of shakaAssets.testAssets) {
        if (asset.manifestUri == manifest && asset.adTagUri == adTagUri) {
          return asset;
        }
      }

      // See if it's a custom asset saved here.
      for (const asset of shakaDemoCustom.assets()) {
        if (asset.manifestUri == manifest) {
          return asset;
        }
      }

      // Construct a new asset.
      const asset = new ShakaDemoAssetInfo(
          /* name= */ 'loaded asset',
          /* iconUri= */ '',
          /* manifestUri= */ manifest,
          /* source= */ shakaAssets.Source.CUSTOM);
      if (params.has('license')) {
        let drmSystems = shakaDemo.Main.commonDrmSystems;
        if (params.has('drmSystem')) {
          drmSystems = [params.get('drmSystem')];
        }
        for (const drmSystem of drmSystems) {
          asset.addLicenseServer(drmSystem, params.get('license'));
        }
      }
      if (params.has('certificate')) {
        asset.addCertificateUri(params.get('certificate'));
      }
      return asset;
    } else if (assetBase64) {
      // See if it's a default asset.
      for (const asset of shakaAssets.testAssets) {
        if (asset.toBase64() == assetBase64) {
          return asset;
        }
      }

      // See if it's a custom asset saved here.
      for (const asset of shakaDemoCustom.assets()) {
        if (asset.toBase64() == assetBase64) {
          return asset;
        }
      }

      return ShakaDemoAssetInfo.fromBase64(assetBase64);
    }
    return null;
  }

  /** @private */
  readHash_() {
    const params = this.getParams_();

    if (this.player_) {
      const readParam = (hashName, configName) => {
        if (params.has(hashName)) {
          const existing = this.getCurrentConfigValue(configName);

          // Translate the param string into a non-string value if appropriate.
          // Determine what type the parsed value should be based on the current
          // value.
          let value = params.get(hashName);
          if (typeof existing == 'boolean') {
            value = value == 'true';
          } else if (typeof existing == 'number') {
            value = parseFloat(value);
          }

          this.configure(configName, value);
        }
      };
      const config = this.player_.getConfiguration();
      shakaDemo.Utils.runThroughHashParams(readParam, config);
      const advanced = this.getCurrentConfigValue('drm.advanced');
      if (advanced) {
        for (const drmSystem of shakaDemo.Main.commonDrmSystems) {
          if (!advanced[drmSystem]) {
            advanced[drmSystem] = shakaDemo.Main.defaultAdvancedDrmConfig();
          }
          if (params.has('videoRobustness')) {
            advanced[drmSystem].videoRobustness =
                params.get('videoRobustness').split(',');
          }
          if (params.has('audioRobustness')) {
            advanced[drmSystem].audioRobustness =
                params.get('audioRobustness').split(',');
          }
        }

        if (params.has('audioRobustness') || params.has('videoRobustness')) {
          this.configure('drm.advanced', advanced);
        }
      }
    }
    if (params.has('lang')) {
      // Load the legacy 'lang' hash value.
      const lang = params.get('lang');
      this.configure('preferredAudioLanguage', lang);
      this.configure('preferredTextLanguage', lang);
      this.setUILocale(lang);
    }
    if (params.has('uilang')) {
      this.setUILocale(params.get('uilang'));
      // TODO(#1591): Support multiple language preferences
    }
    if (params.has('noadaptation')) {
      this.configure('abr.enabled', false);
    }

    if (params.has('preferredVideoCodecs')) {
      this.configure('preferredVideoCodecs',
          params.get('preferredVideoCodecs').split(','));
    }

    if (params.has('preferredAudioCodecs')) {
      this.configure('preferredAudioCodecs',
          params.get('preferredAudioCodecs').split(','));
    }

    if (params.has('preferredTextFormats')) {
      this.configure('preferredTextFormats',
          params.get('preferredTextFormats').split(','));
    }

    // Add compiled/uncompiled links.
    this.makeVersionLinks_();

    // Disable custom controls.
    this.nativeControlsEnabled_ = params.has('nativecontrols');

    // Enable trick play.
    if (params.has('trickplay')) {
      this.trickPlayControlsEnabled_ = true;
      this.configureUI_();
    }

    if (params.has('customContextMenu')) {
      this.customContextMenu_ = true;
      this.configureUI_();
    }

    if (params.has('watermarkText')) {
      this.setWatermarkText(params.get('watermarkText'));
    }

    if (params.has('visualizer')) {
      this.setIsVisualizerActive(true);
    } else {
      this.setIsVisualizerActive(false);
    }

    // Check if uncompiled mode is supported.
    if (!shakaDemo.Utils.browserSupportsUncompiledMode()) {
      const uncompiledLink = document.getElementById('uncompiled-link');
      goog.asserts.assert(
          uncompiledLink instanceof HTMLAnchorElement, 'Wrong element type!');
      uncompiledLink.setAttribute('disabled', '');
      uncompiledLink.removeAttribute('href');
      uncompiledLink.title = 'requires a newer browser';
    }

    if (shaka.log) {
      if (params.has('vv')) {
        shaka.log.setLevel(shaka.log.Level.V2);
      } else if (params.has('v')) {
        shaka.log.setLevel(shaka.log.Level.V1);
      } else if (params.has('debug')) {
        shaka.log.setLevel(shaka.log.Level.DEBUG);
      } else if (params.has('info')) {
        shaka.log.setLevel(shaka.log.Level.INFO);
      }
    }
  }

  /** @private */
  makeVersionLinks_() {
    const params = this.getParams_();
    let buildType = 'uncompiled';
    if (params.has('build')) {
      buildType = params.get('build');
    } else if (params.has('compiled')) {
      buildType = 'compiled';
    }
    for (const type of ['compiled', 'debug_compiled', 'uncompiled']) {
      const elem = document.getElementById(type.split('_').join('-') + '-link');
      goog.asserts.assert(
          elem instanceof HTMLAnchorElement, 'Wrong element type!');
      if (buildType == type) {
        elem.setAttribute('disabled', '');
        elem.removeAttribute('href');
        elem.title = 'currently selected';
      } else {
        elem.removeAttribute('disabled');
        elem.addEventListener('click', () => {
          const rawParams = location.hash.substr(1).split(';');
          const newParams = rawParams.filter((param) => {
            // Remove current build type param(s).
            return param != 'compiled' && param.split('=')[0] != 'build';
          });
          newParams.push('build=' + type);
          this.setNewHashSilent_(newParams.join(';'));
          location.reload();
          return false;
        });
      }
    }
  }

  /**
   * @return {!Map<string, string>} params
   * @private
   */
  getParams_() {
    // Read URL parameters.
    let fields = location.search.substr(1);
    fields = fields ? fields.split(';') : [];
    let fragments = location.hash.substr(1);
    fragments = fragments ? fragments.split(';') : [];

    // Because they are being concatenated in this order, if both an
    // URL fragment and an URL parameter of the same type are present
    // the URL fragment takes precedence.
    /** @type {!Array<string>} */
    const combined = fields.concat(fragments);
    const params = new Map();
    for (const line of combined) {
      const kv = line.split('=');
      params.set(kv[0], kv.slice(1).join('='));
    }
    return params;
  }

  /**
   * Recovers the value from the given config field, from an arbitrary config
   * object.
   * This uses the same syntax as setting a single configuration field.
   * @param {string} valueName
   * @param {?shaka.extern.PlayerConfiguration} configObject
   * @return {*}
   * @private
   */
  getValueFromGivenConfig_(valueName, configObject) {
    let objOn = configObject;
    let valueNameOn = valueName;
    try {
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
    } catch (e) {
      // Ignore errors
    }
    return undefined;
  }

  /**
   * Recovers the value from the given config field.
   * This uses the same syntax as setting a single configuration field.
   * @example getCurrentConfigValue('abr.bandwidthDowngradeTarget')
   * @param {string} valueName
   * @return {*}
   */
  getCurrentConfigValue(valueName) {
    const config = this.desiredConfig_;
    return this.getValueFromGivenConfig_(valueName, config);
  }

  /**
   * @param {string} valueName
   */
  resetConfiguration(valueName) {
    this.configure(valueName, undefined);
  }

  /**
   * @param {string|!Object} config
   * @param {*=} value
   */
  configure(config, value) {
    if (arguments.length == 2 && typeof(config) == 'string') {
      config = shaka.util.ConfigUtils.convertToConfigObject(config, value);
    }
    const asObj = /** @type {!Object} */ (config);
    shaka.util.PlayerConfiguration.mergeConfigObjects(
        this.desiredConfig_, asObj, this.defaultConfig_);
    this.player_.configure(config, value);
  }

  /** @return {!shaka.extern.PlayerConfiguration} */
  getConfiguration() {
    return this.desiredConfig_;
  }

  /**
   * @param {string} uri
   * @param {!shaka.net.NetworkingEngine} netEngine
   * @return {!Promise<!ArrayBuffer>}
   * @private
   */
  async requestCertificate_(uri, netEngine) {
    const requestType = shaka.net.NetworkingEngine.RequestType.APP;
    const request = /** @type {shaka.extern.Request} */ ({uris: [uri]});
    const response = await netEngine.request(requestType, request).promise;
    return response.data;
  }

  /** @return {boolean} */
  getIsVisualizerActive() {
    if (this.visualizer_) {
      return this.visualizer_.active;
    }
    return false;
  }

  /** @param {boolean} active */
  setIsVisualizerActive(active) {
    if (this.visualizer_) {
      const wasActive = this.visualizer_.active;
      this.visualizer_.active = active;
      if (wasActive != active) {
        if (active) {
          this.visualizer_.start();
        } else {
          this.visualizer_.stop();
        }
      }
    }
  }

  /** Unload the currently-playing asset. */
  unload() {
    if (this.visualizer_) {
      this.visualizer_.stop();
    }
    this.selectedAsset = null;
    const videoBar = document.getElementById('video-bar');
    this.hideElement_(videoBar);
    this.video_.poster = shakaDemo.Main.mainPoster_;

    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
    if (this.video_.webkitDisplayingFullscreen) {
      this.video_.webkitExitFullscreen();
    }
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture();
    }
    if (window.documentPictureInPicture &&
        window.documentPictureInPicture.window) {
      window.documentPictureInPicture.window.close();
    }
    this.player_.unload();

    // The currently-selected asset changed, so update asset cards.
    this.dispatchEventWithName_('shaka-main-selected-asset-changed');

    // Unset media session title, but only if the browser supports that API.
    if (navigator.mediaSession) {
      navigator.mediaSession.metadata = null;
    }

    // Remake hash, to change the current asset.
    this.remakeHash();
  }

  /**
   * @param {ShakaDemoAssetInfo} asset
   * @param {shaka.offline.Storage=} storage
   * @return {!Promise}
   * @private
   */
  async drmConfiguration_(asset, storage) {
    const netEngine = storage ?
                      storage.getNetworkingEngine() :
                      this.player_.getNetworkingEngine();
    goog.asserts.assert(netEngine, 'There should be a net engine.');
    asset.applyFilters(netEngine);

    if (storage) {
      const assetConfig = asset.getConfiguration(/* forStorage= */ true);
      storage.configure(assetConfig);
    } else {
      const assetConfig = asset.getConfiguration();
      // Remove all not-player-applied configurations, by resetting the
      // configuration then re-applying the desired configuration.
      this.player_.resetConfiguration();
      this.readHash_();
      this.player_.configure(assetConfig);
    }

    const config = storage ?
                   storage.getConfiguration() :
                   this.player_.getConfiguration();

    // Change the config's serverCertificate fields based on
    // asset.certificateUri.
    if (asset.certificateUri) {
      // Fetch the certificate, and apply it to the configuration.
      const certificate = await this.requestCertificate_(
          asset.certificateUri, netEngine);
      const certArray = shaka.util.BufferUtils.toUint8(certificate);
      for (const drmSystem of asset.licenseServers.keys()) {
        config.drm.advanced[drmSystem] = config.drm.advanced[drmSystem] || {};
        config.drm.advanced[drmSystem].serverCertificate = certArray;
      }
    } else {
      // Remove any server certificates.
      for (const drmSystem of asset.licenseServers.keys()) {
        if (config.drm.advanced[drmSystem]) {
          delete config.drm.advanced[drmSystem].serverCertificate;
        }
      }
    }

    if (storage) {
      storage.configure(config);
    } else {
      this.player_.configure('drm.advanced', config.drm.advanced);
    }
    this.remakeHash();
  }

  /**
   * Performs all visual operations that should be performed when a new asset
   * begins playing. The video bar is un-hidden, the screen is scrolled, and so
   * on.
   *
   * @private
   */
  showPlayer_() {
    const videoBar = document.getElementById('video-bar');
    this.showElement_(videoBar);
    this.closeError_();
    this.video_.poster = shakaDemo.Main.mainPoster_;

    // Scroll to the top of the page, so that if the page is scrolled down,
    // the user won't need to manually scroll up to see the video.
    videoBar.scrollIntoView({behavior: 'smooth', block: 'start'});
  }

  /**
   * @param {ShakaDemoAssetInfo} asset
   */
  async preloadAsset(asset) {
    await this.drmConfiguration_(asset);
    const manifestUri = await this.getManifestUri_(asset);
    asset.preloadManager = await this.player_.preload(manifestUri);
  }

  /**
   * @param {ShakaDemoAssetInfo} asset
   * @return {!Promise<string>}
   * @private
   */
  async getManifestUri_(asset) {
    let manifestUri = asset.manifestUri;
    // If we have an offline copy, use that.  If the offlineUri field is null,
    // we are still downloading it.
    if (asset.storedContent && asset.storedContent.offlineUri) {
      manifestUri = asset.storedContent.offlineUri;
    }
    // If it's a server side dai asset, request ad-containing manifest
    // from the ad manager.
    if (asset.imaAssetKey || (asset.imaContentSrcId && asset.imaVideoId)) {
      manifestUri = await this.getManifestUriFromAdManager_(asset);
    }
    // If it's a MediaTailor asset, request ad-containing manifest
    // from the ad manager.
    if (asset.mediaTailorUrl) {
      manifestUri = await this.getManifestUriFromMediaTailorAdManager_(asset);
    }
    return manifestUri;
  }

  /**
   * @param {ShakaDemoAssetInfo} asset
   */
  async loadAsset(asset) {
    try {
      this.selectedAsset = asset;
      this.showPlayer_();

      // The currently-selected asset changed, so update asset cards.
      this.dispatchEventWithName_('shaka-main-selected-asset-changed');

      // Enable the correct set of controls before loading.
      // The video container influences the TextDisplayer used.
      if (this.nativeControlsEnabled_) {
        this.controls_.setEnabledShakaControls(false);
        this.controls_.setEnabledNativeControls(true);
        // This will force the player to use NativeTextDisplayer.
        this.player_.setVideoContainer(null);
      } else {
        this.controls_.setEnabledShakaControls(true);
        this.controls_.setEnabledNativeControls(false);
        // This will force the player to use UITextDisplayer.
        this.player_.setVideoContainer(this.container_);
      }

      await this.drmConfiguration_(asset);
      this.controls_.getCastProxy().setAppData({'asset': asset});
      const ui = this.video_['ui'];
      if (asset.extraUiConfig) {
        ui.configure(asset.extraUiConfig);
      } else {
        const uiConfig = {
          displayInVrMode: false,
        };
        ui.configure(uiConfig);
      }

      if (asset.hasAds()) {
        // The player internally, if another stream is loaded, calls
        // adManager.onAssetUnload and this would prevent the initial preloading
        // of the ad, so we unload the player first to prevent the player
        // from being unloaded the new ad.
        const loadMode = this.player_.getLoadMode();
        if (loadMode == shaka.Player.LoadMode.MEDIA_SOURCE ||
            loadMode == shaka.Player.LoadMode.SRC_EQUALS) {
          await this.player_.unload();
        }
      }

      // If the asset has an ad tag attached to it, load the ads
      const adManager = this.player_.getAdManager();
      if (adManager && asset.adTagUri) {
        const adTagUri = asset.adTagUri + Date.now();
        if (asset.useIMA) {
          try {
            // If IMA is blocked by an AdBlocker, init() will throw.
            // If that happens, just proceed to load.
            goog.asserts.assert(
                this.video_ != null, 'this.video should exist!');
            adManager.initClientSide(
                this.controls_.getClientSideAdContainer(), this.video_,
                /** adsRenderingSettings= */ null);
            const adRequest = new google.ima.AdsRequest();
            adRequest.adTagUrl = adTagUri;
            adManager.requestClientSideAds(adRequest);
          } catch (error) {
            console.log(error);
            console.warn('Ads code has been prevented from running. ' +
              'Proceeding without ads.');
          }
        } else {
          try {
            await adManager.addAdUrlInterstitial(adTagUri);
          } catch (error) {
            console.log(error);
          }
        }
      }

      // Finally, the asset can be loaded.
      if (asset.preloadManager) {
        const preloadManager = asset.preloadManager;
        asset.preloadManager = null;
        await this.player_.load(preloadManager);
      } else {
        const manifestUri = await this.getManifestUri_(asset);
        let mimeType = undefined;
        if (asset.mimeType &&
            manifestUri && !manifestUri.startsWith('offline:')) {
          mimeType = asset.mimeType;
        }
        await this.player_.load(
            manifestUri,
            /* startTime= */ null,
            mimeType);
      }

      if (this.player_.isAudioOnly() &&
          this.video_.poster == shakaDemo.Main.mainPoster_) {
        this.video_.poster = shakaDemo.Main.audioOnlyPoster_;
      }

      if (!(asset.storedContent && asset.storedContent.offlineUri)) {
        for (const extraText of asset.extraText) {
          if (extraText.mime) {
            this.player_.addTextTrackAsync(extraText.uri, extraText.language,
                extraText.kind, extraText.mime, extraText.codecs);
          } else {
            this.player_.addTextTrackAsync(extraText.uri, extraText.language,
                extraText.kind);
          }
        }
        for (const extraThumbnail of asset.extraThumbnail) {
          this.player_.addThumbnailsTrack(extraThumbnail);
        }
      }

      for (const extraChapter of asset.extraChapter) {
        if (extraChapter.mime) {
          this.player_.addChaptersTrack(
              extraChapter.uri, extraChapter.language, extraChapter.mime);
        } else {
          this.player_.addChaptersTrack(
              extraChapter.uri, extraChapter.language);
        }
      }

      // Set media session title, but only if the browser supports that API.
      if (navigator.mediaSession) {
        const icon = asset.iconUri || shakaDemo.Main.logo_;
        const metadata = {
          title: asset.name,
          artwork: [{src: icon}],
          artist: asset.source,
        };
        navigator.mediaSession.metadata = new MediaMetadata(metadata);
      }

      if (this.visualizer_ && this.visualizer_.active) {
        this.visualizer_.start();
      }
    } catch (reason) {
      const error = /** @type {!shaka.util.Error} */ (reason);
      if (error.code == shaka.util.Error.Code.LOAD_INTERRUPTED) {
        // Don't use shaka.log, which is not present in compiled builds.
        console.debug('load() interrupted');
      } else {
        this.onError_(error);
      }
    }

    // Remake hash, to change the current asset.
    this.remakeHash();
  }

  /** Remakes the location's hash. */
  remakeHash() {
    if (!this.fullyLoaded_) {
      // Don't remake the hash until the demo page is fully loaded.
      return;
    }

    const params = [];

    if (this.player_) {
      const setParam = (hashName, configName) => {
        const currentValue = this.getCurrentConfigValue(configName);
        const defaultConfig = this.defaultConfig_;
        const defaultValue =
            this.getValueFromGivenConfig_(configName, defaultConfig);
        // NaN != NaN, so there has to be a special check for it to prevent
        // false positives.
        const bothAreNaN = isNaN(currentValue) && isNaN(defaultValue);
        // Strings count as NaN too, so check for them specifically.
        const bothAreStrings = (typeof currentValue) == 'string' &&
            (typeof defaultValue) == 'string';
        if (currentValue != defaultValue && (!bothAreNaN || bothAreStrings)) {
          // Don't bother saving in the hash unless it's a non-default value.
          params.push(hashName + '=' + currentValue);
        }
      };
      const config = this.player_.getConfiguration();
      shakaDemo.Utils.runThroughHashParams(setParam, config);
      const advanced = this.getCurrentConfigValue('drm.advanced');
      if (advanced) {
        for (const drmSystem of shakaDemo.Main.commonDrmSystems) {
          const advancedFor = advanced[drmSystem];
          if (advancedFor) {
            if (advancedFor.videoRobustness &&
              advancedFor.videoRobustness.length) {
              params.push('videoRobustness=' +
                  advancedFor.videoRobustness.join());
            }
            if (advancedFor.audioRobustness &&
              advancedFor.audioRobustness.length) {
              params.push('audioRobustness=' +
                  advancedFor.audioRobustness.join());
            }
            break;
          }
        }
      }
    }
    if (!this.getCurrentConfigValue('abr.enabled')) {
      params.push('noadaptation');
    }
    params.push('uilang=' + this.getUILocale());

    const preferredArray = [
      'preferredVideoCodecs',
      'preferredAudioCodecs',
      'preferredTextFormats',
    ];

    for (const key of preferredArray) {
      const array = /** @type {!Array<string>} */(
        this.getCurrentConfigValue(key));
      if (array.length) {
        params.push(key + '=' + array.join(','));
      }
    }

    if (this.selectedAsset) {
      params.push('assetBase64=' + this.selectedAsset.toBase64());
    }

    const navButtons = document.getElementById('nav-button-container');
    for (const button of navButtons.childNodes) {
      if (button.nodeType == Node.ELEMENT_NODE) {
        goog.asserts.assert( button instanceof HTMLElement, 'Wrong node type!');
        if (button.classList.contains('mdl-button--accent')) {
          params.push('panel=' + button.getAttribute('tab-identifier'));
          const hashValues = button.getAttribute('tab-hash');
          if (hashValues) {
            params.push('panelData=' + hashValues);
          }
          break;
        }
      }
    }

    for (const type of ['compiled', 'debug_compiled', 'uncompiled']) {
      const elem = document.getElementById(type.split('_').join('-') + '-link');
      if (elem.hasAttribute('disabled')) {
        params.push('build=' + type);
      }
    }

    if (this.noInput_) {
      params.push('noinput');
    }

    if (this.nativeControlsEnabled_) {
      params.push('nativecontrols');
    }

    if (this.trickPlayControlsEnabled_) {
      params.push('trickplay');
    }

    if (this.customContextMenu_) {
      params.push('customContextMenu');
    }

    if (this.watermarkText_) {
      params.push('watermarkText=' + this.watermarkText_);
    }

    if (this.getIsVisualizerActive()) {
      params.push('visualizer');
    }

    // MAX_LOG_LEVEL is the default starting log level. Only save the log level
    // if it's different from this default.
    if (shaka.log && shaka.log.currentLevel != shaka.log.MAX_LOG_LEVEL) {
      switch (shaka.log.currentLevel) {
        case shaka.log.Level.INFO:
          params.push('info');
          break;
        case shaka.log.Level.DEBUG:
          params.push('debug');
          break;
        case shaka.log.Level.V2:
          params.push('vv');
          break;
        case shaka.log.Level.V1:
          params.push('v');
          break;
      }
    }

    this.setNewHashSilent_(params.join(';'));
  }

  /**
   * Sets the hash to a given value WITHOUT triggering a |hashchange| event.
   * @param {string} hash
   * @private
   */
  setNewHashSilent_(hash) {
    const state = null;
    const title = ''; // Unused; just needed to make Closure happy.
    const newURL = document.location.pathname + '#' + hash;
    // Calling history.replaceState can change the URL or hash of the page
    // without actually triggering any changes; it won't make the page navigate,
    // or trigger a |hashchange| event.
    history.replaceState(state, title, newURL);
  }

  /**
   * Gets the hamburger menu's content div, so that the caller to add elements
   * to it.
   * There is no guarantee that the caller is the only entity that has added
   * contents to the hamburger menu.
   * @return {!HTMLDivElement} The container for the hamburger menu.
   */
  getHamburgerMenu() {
    const menu = document.getElementById('hamburger-menu-contents');
    return /** @type {!HTMLDivElement} */ (menu);
  }

  /**
   * @param {Element} element
   * @private
   */
  hideElement_(element) {
    element.classList.add('hidden');
  }

  /**
   * @param {Element} element
   * @private
   */
  showElement_(element) {
    element.classList.remove('hidden');
  }

  /**
   * @param {ShakaDemoAssetInfo} asset
   * @return {!Promise<string>}
   * @private
   */
  async getManifestUriFromAdManager_(asset) {
    const adManager = this.player_.getAdManager();
    const container = this.controls_.getServerSideAdContainer();
    try {
      // If IMA is blocked by an AdBlocker, init() will throw.
      // If that happens, return our backup uri.
      goog.asserts.assert(this.video_ != null, 'Video should not be null!');
      adManager.initServerSide(container, this.video_);
      let request;
      if (asset.imaAssetKey != null) {
        // LIVE stream
        request = new google.ima.dai.api.LiveStreamRequest();
        request.assetKey = asset.imaAssetKey;
      } else {
        goog.asserts.assert(asset.imaContentSrcId != null &&
            asset.imaVideoId != null, 'Asset should have ima ids!');
        // VOD
        request = new google.ima.dai.api.VODStreamRequest();
        request.contentSourceId = asset.imaContentSrcId;
        request.videoId = asset.imaVideoId;
      }
      switch (asset.imaManifestType) {
        case 'DASH':
        case 'dash':
        case 'MPD':
        case 'mpd':
          request.format = google.ima.dai.api.StreamRequest.StreamFormat.DASH;
          break;
        case 'HLS':
        case 'hls':
        case 'M3U8':
        case 'm3u8':
          request.format = google.ima.dai.api.StreamRequest.StreamFormat.HLS;
          break;
      }

      const uri = await adManager.requestServerSideStream(
          request, /* backupUri= */ asset.manifestUri);
      return uri;
    } catch (error) {
      console.log(error);
      console.warn('Ads code has been prevented from running ' +
          'or returned an error. Proceeding without ads.');

      return asset.manifestUri;
    }
  }

  /**
   * @param {ShakaDemoAssetInfo} asset
   * @return {!Promise<string>}
   * @private
   */
  async getManifestUriFromMediaTailorAdManager_(asset) {
    const adManager = this.player_.getAdManager();
    const container = this.controls_.getServerSideAdContainer();
    try {
      goog.asserts.assert(this.video_ != null, 'Video should not be null!');
      goog.asserts.assert(asset.mediaTailorUrl != null,
          'Media Tailor info not be null!');
      const netEngine = this.player_.getNetworkingEngine();
      goog.asserts.assert(netEngine, 'There should be a net engine.');
      adManager.initMediaTailor(container, netEngine, this.video_);
      const uri = await adManager.requestMediaTailorStream(
          asset.mediaTailorUrl, asset.mediaTailorAdsParams,
          /* backupUri= */ asset.manifestUri);
      return uri;
    } catch (error) {
      console.log(error);
      console.warn('Ads code has been prevented from running ' +
          'or returned an error. Proceeding without ads.');

      return asset.manifestUri;
    }
  }

  /**
   * Sets up a nav button, and an associated tab.
   * This method is meant to be called by the various tabs, as part of their
   * setup process.
   * @param {string} containerName Used to determine the id of the button this
   *   is looking for.  Also used as the className of the container, for CSS.
   * @return {{
   *   container: !HTMLDivElement,
   *   button: !HTMLButtonElement,
   * }} The container for the tab, and the button element that activates it.
   */
  addNavButton(containerName) {
    const navButtons = document.getElementById('nav-button-container');
    const contents = document.getElementById('contents');
    const button = document.getElementById('nav-button-' + containerName);

    // TODO: Switch to using MDL tabs.

    // Determine if the element is selected.
    const params = this.getParams_();
    let selected =
        params.get('panel') == encodeURI(button.getAttribute('tab-identifier'));
    if (selected) {
      // Re-apply any saved data from hash.
      const hashValues = params.get('panelData');
      if (hashValues) {
        button.setAttribute('tab-hash', hashValues);
      }
    } else if (!params.has('panel')) {
      // Check if it's selected by default.
      selected = button.getAttribute('defaultselected') != null;
    }

    // Create the div for this nav button's container within the contents.
    const container = document.createElement('div');
    this.hideElement_(container);
    contents.appendChild(container);

    // Add a click listener to display this container, and hide the others.
    const switchPage = () => {
      // This element should be the selected one.
      for (const child of navButtons.childNodes) {
        if (child.nodeType == Node.ELEMENT_NODE) {
          goog.asserts.assert(child instanceof Element, 'Wrong node type!');
          child.classList.remove('mdl-button--accent');
        }
      }
      for (const child of contents.childNodes) {
        if (child.nodeType == Node.ELEMENT_NODE) {
          goog.asserts.assert(child instanceof Element, 'Wrong node type!');
          this.hideElement_(child);
        }
      }
      button.classList.add('mdl-button--accent');
      this.showElement_(container);
      this.remakeHash();

      // Dispatch an event so that a page can load any deferred content.
      this.dispatchEventWithName_('shaka-main-page-changed');

      // Scroll so that the top of the tab is in view.
      container.scrollIntoView({behavior: 'smooth', block: 'start'});
    };

    button.addEventListener('click', switchPage);
    if (selected) {
      // Defer this call to switchPage until the container is fully set up.
      Promise.resolve().then(switchPage);
    }

    return {
      container: /** @type {!HTMLDivElement} */ (container),
      button: /** @type {!HTMLButtonElement} */ (button),
    };
  }

  /**
   * Dispatches a custom event to document.
   * @param {string} name
   * @private
   */
  dispatchEventWithName_(name) {
    const event =
      /** @type {!CustomEvent} */(document.createEvent('CustomEvent'));
    event.initCustomEvent(name,
        /* canBubble= */ false,
        /* cancelable= */ false,
        /* detail= */ null);
    document.dispatchEvent(event);
  }

  /**
   * Sets the "version-string" divs to a version string.
   * For example, "v2.5.4-main (uncompiled)".
   * @private
   */
  setUpVersionStrings_() {
    const version = shaka.Player.version;
    let split = version.split('-');
    const inParen = [];

    // Separate out some special terms into parentheses after the rest of the
    // version, to make them stand out visually.
    for (const whitelisted of ['debug', 'uncompiled']) {
      if (split.includes(whitelisted)) {
        inParen.push(whitelisted);
        split = split.filter((term) => term != whitelisted);
      }
    }

    // Put the version into the version string div.
    const versionStringDivs = document.getElementsByClassName('version-string');
    for (const div of versionStringDivs) {
      div.textContent = split.join('-');
      if (inParen.length > 0) {
        div.textContent += ' (' + inParen.join(', ') + ')';
      }
    }
  }

  /**
   * Closes the error bar.
   * @private
   */
  closeError_() {
    document.getElementById('error-display').classList.add('hidden');
    this.errorDisplayLink_.href = '';
    this.errorDisplayLink_.textContent = '';
    this.currentErrorSeverity_ = null;
  }

  /**
   * @param {!Event} event
   * @private
   */
  onErrorEvent_(event) {
    // TODO: generate externs automatically from @event types
    // This event should be shaka.Player.ErrorEvent
    this.onError_(event['detail']);
  }

  /**
   * @param {!shaka.util.Error} error
   * @private
   */
  onError_(error) {
    let severity = error.severity;
    if (severity == null || error.severity == undefined) {
      // It's not a shaka.util.Error. Treat it as very severe, since those
      // should not be happening.
      severity = shaka.util.Error.Severity.CRITICAL;
    }

    const message = error.message || ('Error code ' + error.code);

    let href = '';
    if (error.code) {
      href = '../docs/api/shaka.util.Error.html#value:' + error.code;
    }

    console.error(error);
    this.handleError_(severity, message, href);
  }

  /**
   * @param {!shaka.util.Error.Severity} severity
   * @param {string} message
   * @param {string} href
   * @private
   */
  handleError_(severity, message, href) {
    // Always show the new error if:
    //   1. there is no error showing currently
    //   2. the new error is more severe than the old one
    if (this.currentErrorSeverity_ == null ||
        severity > this.currentErrorSeverity_) {
      this.errorDisplayLink_.href = href;
      // IE8 and other very old browsers don't have textContent.
      if (this.errorDisplayLink_.textContent === undefined) {
        this.errorDisplayLink_.innerText = message;
      } else {
        this.errorDisplayLink_.textContent = message;
      }
      this.currentErrorSeverity_ = severity;
      if (this.errorDisplayLink_.href) {
        this.errorDisplayLink_.classList.remove('input-disabled');
      } else {
        this.errorDisplayLink_.classList.add('input-disabled');
      }
      document.getElementById('error-display').classList.remove('hidden');
    }
  }

  /**
   * @param {boolean} connected
   * @private
   */
  onCastStatusChange_(connected) {
    if (connected && !this.selectedAsset) {
      // You joined an existing session.
      // The exact asset playing is unknown. Just have a selectedAsset, to show
      // that this is playing something.
      this.selectedAsset = ShakaDemoAssetInfo.makeBlankAsset();
      this.showPlayer_();
    }
  }

  /** @return {!shaka.extern.AdvancedDrmConfiguration} */
  static defaultAdvancedDrmConfig() {
    return {
      distinctiveIdentifierRequired: false,
      persistentStateRequired: false,
      videoRobustness: [],
      audioRobustness: [],
      sessionType: '',
      serverCertificate: new Uint8Array(0),
      serverCertificateUri: '',
      individualizationServer: '',
      headers: {},
    };
  }
};


/** @type {!Array<string>} */
shakaDemo.Main.commonDrmSystems = [
  'com.widevine.alpha',
  'com.microsoft.playready',
  'com.apple.fps',
  'org.w3.clearkey',
];


const shakaDemoMain = new shakaDemo.Main();


/**
 * @private
 * @const {string}
 */
shakaDemo.Main.mainPoster_ =
    'https://shaka-player-demo.appspot.com/assets/poster.jpg';


/**
 * @private
 * @const {string}
 */
shakaDemo.Main.audioOnlyPoster_ =
    'https://shaka-player-demo.appspot.com/assets/audioOnly.gif';


/**
 * @private
 * @const {string}
 */
shakaDemo.Main.logo_ =
    'https://shaka-player-demo.appspot.com/demo/shaka_logo_trans.png';


// If setup fails and the global error handler does, too, (as happened on IE
// right before the launch of this demo), at least log that error to the console
// for debugging.  Wrap init functions in an async function with a try/catch to
// make sure no error goes unseen when debugging.
/**
 * @param {function()} initFn
 * @return {!Promise}
 * @suppress {accessControls}
 */
shakaDemo.Main.initWrapper = async (initFn) => {
  try {
    await initFn();
  } catch (error) {
    shakaDemoMain.onError_(error);
    console.error(error);
  }
};
document.addEventListener('shaka-ui-loaded', () => {
  shakaDemo.Main.initWrapper(() => shakaDemoMain.init());
});
document.addEventListener('shaka-ui-load-failed', (event) => {
  shakaDemo.Main.initWrapper(() => {
    const reasonCode = /** @type {!shaka.ui.Overlay.FailReasonCode} */ (
      event['detail']['reasonCode']);
    shakaDemoMain.initFailed(reasonCode);
  });
});

