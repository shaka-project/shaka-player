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


goog.provide('shakaDemo.Main');


/**
 * Shaka Player demo, main section.
 * This controls the header and the footer, and contains all methods that should
 * be shared by multiple page layouts (loading assets, setting/checking
 * configuration, etc).
 */
shakaDemo.Main = class {
  constructor() {
    /** @private {HTMLMediaElement} */
    this.video_ = null;

    /** @private {HTMLElement} */
    this.container_ = null;

    /** @private {shaka.Player} */
    this.player_ = null;

    /** @type {?ShakaDemoAssetInfo} */
    this.selectedAsset = null;

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

    /** @private {?Array.<shaka.extern.StoredContent>} */
    this.initialStoredList_;

    /** @private {boolean} */
    this.nativeControlsEnabled_ = false;

    /** @private {shaka.extern.SupportType} */
    this.support_;

    /** @private {string} */
    this.uiLocale_ = '';

    /** @private {boolean} */
    this.noInput_ = false;
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
      // Exception to the exceptions we catch: ChromeVox (screenreader) always
      // throws an error as of Chrome 73.  Screen these out since they are
      // unrelated to our application and we can't control them.
      if (event.message.includes('cvox.Api')) {
        return;
      }

      this.onError_(/** @type {!shaka.util.Error} */ (event.error));
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
   */
  initFailed() {
    this.initCommon_();

    // Process a synthetic error about lack of browser support.
    const severity = shaka.util.Error.Severity.CRITICAL;
    const message = 'Your browser is not supported!';
    const href = 'https://github.com/google/shaka-player#' +
                 'platform-and-browser-support-matrix';
    this.handleError_(severity, message, href);

    // Update the componentHandler, to account for any new MDL elements added.
    componentHandler.upgradeDom();

    // Disable elements that should not be used.
    const elementsToDisable = [];
    const disableClass = 'should-disable-on-fail';
    for (const element of document.getElementsByClassName(disableClass)) {
      elementsToDisable.push(element);
    }
    // The hamburger menu close button is added programmatically by MDL, and
    // thus isn't given our 'disableonfail' clas.
    elementsToDisable.push(document.getElementsByClassName(
        'mdl-layout__drawer-button'));
    for (const element of elementsToDisable) {
      element.tabIndex = -1;
      element.classList.add('disabled-by-fail');
    }
  }

  /**
   * Initialize the application.
   */
  async init() {
    this.initCommon_();

    this.support_ = await shaka.Player.probeSupport();

    this.video_ =
        /** @type {!HTMLVideoElement} */(document.getElementById('video'));
    this.video_.poster = shakaDemo.Main.mainPoster_;

    this.container_ = /** @type {!HTMLElement} */(
      document.getElementsByClassName('video-container')[0]);

    if (navigator.serviceWorker) {
      console.debug('Registering service worker.');
      try {
        const registration =
            await navigator.serviceWorker.register('service_worker.js');
        console.debug('Service worker registered!', registration.scope);
      } catch (error) {
        console.error('Service worker registration failed!', error);
      }
    }

    // Optionally enter noinput mode. This has to happen before setting up the
    // player.
    this.noInput_ = 'noinput' in this.getParams_();
    this.setupPlayer_();
    this.readHash_();
    window.addEventListener('hashchange', () => this.hashChanged_());

    await this.setupStorage_();

    this.setupBugButton_();

    if (this.noInput_) {
      // Set the page to noInput mode, disabling the header and footer.
      const hideClass = 'should-hide-in-no-input-mode';
      for (const element of document.getElementsByClassName(hideClass)) {
        this.hideNode_(element);
      }
      const showClass = 'should-show-in-no-input-mode';
      for (const element of document.getElementsByClassName(showClass)) {
        this.showNode_(element);
      }
      // Also fullscreen the container.
      this.container_.classList.add('no-input-sized');
      document.getElementById('video-bar').classList.add('no-input-sized');
    }

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
   * @return {!Promise.<string>}
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
    fillInTemplate('RE:link', window.location.href);
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

    // Navigate to the github issue opening interface, with the
    // partially-filled template as a preset body.
    let url = 'https://github.com/google/shaka-player/issues/new?';
    url += 'body=' + encodeURIComponent(text);
    // Open in another tab.
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

      // Configure UI.
      const uiConfig = ui.getConfiguration();
      uiConfig.controlPanelElements.push('close');
      ui.configure(uiConfig);
    }

    // Add application-level default configs here.  These are not the library
    // defaults, but they are the application defaults.  This will affect the
    // default values assigned to UI config elements as well as the decision
    // about what values to place in the URL hash.
    this.player_.configure(
        'manifest.dash.clockSyncUri',
        'https://shaka-player-demo.appspot.com/time.txt');

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

    // Set up localization lazy-loading.
    const localization = this.controls_.getLocalization();
    const UNKNOWN_LOCALES = shaka.ui.Localization.UNKNOWN_LOCALES;
    localization.addEventListener(UNKNOWN_LOCALES, (event) => {
      for (let locale of event['locales']) {
        this.loadUILocale_(locale);
      }
    });
    this.loadUILocale_(this.uiLocale_);

    const drawerCloseButton = document.getElementById('drawer-close-button');
    drawerCloseButton.addEventListener('click', () => {
      const layout = document.getElementById('main-layout');
      layout.MaterialLayout.toggleDrawer();
      this.dispatchEventWithName_('shaka-main-drawer-state-change');
      this.hideNode_(drawerCloseButton);
    });
    // Dispatch drawer state change events when the drawer button or obfuscator
    // are pressed also.
    const drawerButton = document.querySelector('.mdl-layout__drawer-button');
    goog.asserts.assert(drawerButton, 'There should be a drawer button.');
    drawerButton.addEventListener('click', () => {
      this.dispatchEventWithName_('shaka-main-drawer-state-change');
      this.showNode_(drawerCloseButton);
    });
    const obfuscator = document.querySelector('.mdl-layout__obfuscator');
    goog.asserts.assert(obfuscator, 'There should be an obfuscator.');
    obfuscator.addEventListener('click', () => {
      this.dispatchEventWithName_('shaka-main-drawer-state-change');
      this.hideNode_(drawerCloseButton);
    });
    this.hideNode_(drawerCloseButton);
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

    // Set the progress callback;
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
        const stored = await storage.store(asset.manifestUri, metadata);
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
   * @return {?string} unsupportedReason Null if asset is supported.
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

    if (!asset.isClear()) {
      const hasSupportedDRM = asset.drm.some((drm) => {
        return this.support_.drm[drm];
      });
      if (!hasSupportedDRM) {
        return 'Your browser does not support the required key systems.';
      }
      if (needOffline) {
        const hasSupportedOfflineDRM = asset.drm.some((drm) => {
          return this.support_.drm[drm] &&
                 this.support_.drm[drm].persistentState;
        });
        if (!hasSupportedOfflineDRM) {
          return 'Your browser does not support offline licenses for the ' +
                 'required key systems.';
        }
      }
    }

    // Does the browser support the asset's manifest type?
    if (asset.features.includes(shakaAssets.Feature.DASH) &&
        !this.support_.manifest['mpd']) {
      return 'Your browser does not support MPEG-DASH manifests.';
    }
    if (asset.features.includes(shakaAssets.Feature.HLS) &&
        !this.support_.manifest['m3u8']) {
      return 'Your browser does not support HLS manifests.';
    }

    // Does the asset contain a playable mime type?
    let mimeTypes = [];
    if (asset.features.includes(shakaAssets.Feature.WEBM)) {
      mimeTypes.push('video/webm');
    }
    if (asset.features.includes(shakaAssets.Feature.MP4)) {
      mimeTypes.push('video/mp4');
    }
    if (asset.features.includes(shakaAssets.Feature.MP2TS)) {
      mimeTypes.push('video/mp2t');
    }
    const hasSupportedMimeType = mimeTypes.some((type) => {
      return this.support_.media[type];
    });
    if (!hasSupportedMimeType) {
      return 'Your browser does not support the required video format.';
    }

    return null;
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

  /**
   * @param {string} locale
   * @return {!Promise}
   * @private
   */
  async loadUILocale_(locale) {
    if (!locale) {
      return;
    }
    const url = '../ui/locales/' + locale + '.json';
    const response = await fetch(url);
    if (!response.ok) {
      console.warn('Unable to load locale', locale);
      return;
    }

    const obj = await response.json();
    const map = new Map();
    for (let key in obj) {
      map.set(key, obj[key]);
    }

    const localization = this.controls_.getLocalization();
    localization.insert(locale, map);
  }

  /** @param {string} locale */
  setUILocale(locale) {
    this.uiLocale_ = locale;

    // Fall back to browser languages after the demo page setting.
    const preferredLocales = [locale].concat(navigator.languages);

    this.controls_.getLocalization().changeLocale(preferredLocales);
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

    const manifest = params['asset'];
    if (manifest) {
      // See if it's a default asset.
      for (const asset of shakaAssets.testAssets) {
        if (asset.manifestUri == manifest) {
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
        /* source= */ shakaAssets.Source.UNKNOWN);
      if ('license' in params) {
        let drmSystems = shakaDemo.Main.commonDrmSystems;
        if ('drmSystem' in params) {
          drmSystems = [params['drmSystem']];
        }
        for (const drmSystem of drmSystems) {
          asset.addLicenseServer(drmSystem, params['license']);
        }
      }
      if ('certificate' in params) {
        asset.addCertificateUri(params['certificate']);
      }
      return asset;
    }
    return null;
  }

  /** @private */
  readHash_() {
    const params = this.getParams_();

    if (this.player_) {
      const readParam = (hashName, configName) => {
        if (hashName in params) {
          const existing = this.getCurrentConfigValue(configName);

          // Translate the param string into a non-string value if appropriate.
          // Determine what type the parsed value should be based on the current
          // value.
          let value = params[hashName];
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
    }
    if ('lang' in params) {
      // Load the legacy 'lang' hash value.
      const lang = params['lang'];
      this.configure('preferredAudioLanguage', lang);
      this.configure('preferredTextLanguage', lang);
      this.setUILocale(lang);
    }
    if ('uilang' in params) {
      this.setUILocale(params['uilang']);
      // TODO(#1591): Support multiple language preferences
    }
    if ('noadaptation' in params) {
      this.configure('abr.enabled', false);
    }
    if ('jumpLargeGaps' in params) {
      this.configure('streaming.jumpLargeGaps', true);
    }

    // Add compiled/uncompiled links.
    let buildType = 'uncompiled';
    if ('build' in params) {
      buildType = params['build'];
    } else if ('compiled' in params) {
      buildType = 'compiled';
    }
    for (const type of ['compiled', 'debug_compiled', 'uncompiled']) {
      const elem = document.getElementById(type.split('_').join('-') + '-link');
      if (buildType == type) {
        elem.setAttribute('disabled', '');
        elem.removeAttribute('href');
        elem.title = 'currently selected';
      } else {
        elem.removeAttribute('disabled');
        elem.addEventListener('click', () => {
          const rawParams = location.hash.substr(1).split(';');
          const newParams = rawParams.filter(function(param) {
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

    // Disable custom controls.
    this.nativeControlsEnabled_ = 'nativecontrols' in params;

    // Check if uncompiled mode is supported.
    if (!shakaDemo.Utils.browserSupportsUncompiledMode()) {
      const uncompiledLink = document.getElementById('uncompiled-link');
      uncompiledLink.setAttribute('disabled', '');
      uncompiledLink.removeAttribute('href');
      uncompiledLink.title = 'requires a newer browser';
    }

    if (shaka.log) {
      if ('vv' in params) {
        shaka.log.setLevel(shaka.log.Level.V2);
      } else if ('v' in params) {
        shaka.log.setLevel(shaka.log.Level.V1);
      } else if ('debug' in params) {
        shaka.log.setLevel(shaka.log.Level.DEBUG);
      } else if ('info' in params) {
        shaka.log.setLevel(shaka.log.Level.INFO);
      }
    }
  }

  /**
   * @return {!Object.<string, string>} params
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
    // the URL fragment takes precendence.
    /** @type {!Array.<string>} */
    const combined = fields.concat(fragments);
    const params = {};
    for (let i = 0; i < combined.length; ++i) {
      const kv = combined[i].split('=');
      params[kv[0]] = kv.slice(1).join('=');
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
   * @return {!Promise.<ArrayBuffer>}
   * @private
   */
  async requestCertificate_(uri, netEngine) {
    const requestType = shaka.net.NetworkingEngine.RequestType.APP;
    const request = /** @type {shaka.extern.Request} */ ({uris: [uri]});
    const response = await netEngine.request(requestType, request).promise;
    return response.data;
  }

  /** Unload the currently-playing asset. */
  unload() {
    this.selectedAsset = null;
    const videoBar = document.getElementById('video-bar');
    this.hideNode_(videoBar);
    this.video_.poster = shakaDemo.Main.mainPoster_;

    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture();
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

    const assetConfig = asset.getConfiguration();
    if (storage) {
      storage.configure(assetConfig);
    } else {
      // Remove all not-player-applied configurations, by resetting the
      // configuration then re-applying the desired configuration.
      this.player_.resetConfiguration();
      this.player_.configure(this.desiredConfig_);
      this.player_.configure(assetConfig);
      // This uses Player.configure so as to not change |this.desiredConfig_|.
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
      const certArray = new Uint8Array(certificate);
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
    this.showNode_(videoBar);
    this.closeError_();
    this.video_.poster = shakaDemo.Main.mainPoster_;

    // Scroll to the top of the page, so that if the page is scrolled down,
    // the user won't need to manually scroll up to see the video.
    videoBar.scrollIntoView({behavior: 'smooth', block: 'start'});
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

      await this.drmConfiguration_(asset);
      this.controls_.getCastProxy().setAppData({'asset': asset});

      // Enable the correct set of controls before loading.
      if (this.nativeControlsEnabled_) {
        this.controls_.setEnabledShakaControls(false);
        this.controls_.setEnabledNativeControls(true);
      } else {
        this.controls_.setEnabledShakaControls(true);
        this.controls_.setEnabledNativeControls(false);
      }
      // Also set text displayer, as appropriate.
      // Make an alias for "this" so that it can be captured inside the
      // non-arrow function below.
      const self = this;
      const textDisplayer = function() {
        if (self.nativeControlsEnabled_) {
          return new shaka.text.SimpleTextDisplayer(self.video_);
        } else {
          return new shaka.ui.TextDisplayer(self.video_, self.container_);
        }
      };
      this.player_.configure('textDisplayFactory', textDisplayer);

      // Finally, the asset can be loaded.
      const manifestUri = (asset.storedContent ?
                           asset.storedContent.offlineUri :
                           null) || asset.manifestUri;
      await this.player_.load(manifestUri);
      if (this.player_.isAudioOnly()) {
        this.video_.poster = shakaDemo.Main.audioOnlyPoster_;
      }

      // Set media session title, but only if the browser supports that API.
      if (navigator.mediaSession) {
        const metadata = {
          title: asset.name,
          artwork: [{src: asset.iconUri}],
        };
        if (asset.source != shakaAssets.Source.UNKNOWN) {
          metadata.artist = asset.source;
        }
        navigator.mediaSession.metadata = new MediaMetadata(metadata);
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
        if (currentValue != defaultValue && !bothAreNaN) {
          // Don't bother saving in the hash unless it's a non-default value.
          params.push(hashName + '=' + currentValue);
        }
      };
      const config = this.player_.getConfiguration();
      shakaDemo.Utils.runThroughHashParams(setParam, config);
    }
    if (!this.getCurrentConfigValue('abr.enabled')) {
      params.push('noadaptation');
    }
    if (this.getCurrentConfigValue('streaming.jumpLargeGaps')) {
      params.push('jumpLargeGaps');
    }
    params.push('uilang=' + this.getUILocale());

    if (this.selectedAsset) {
      const isDefault = shakaAssets.testAssets.includes(this.selectedAsset);
      params.push('asset=' + this.selectedAsset.manifestUri);
      if (!isDefault && this.selectedAsset.licenseServers.size) {
        const uri = this.selectedAsset.licenseServers.values().next().value;
        params.push('license=' + uri);
        for (const drmSystem of this.selectedAsset.licenseServers.keys()) {
          if (!shakaDemo.Main.commonDrmSystems.includes(drmSystem)) {
            params.push('drmSystem=' + drmSystem);
            break;
          }
        }
      }
      if (!isDefault && this.selectedAsset.certificateUri) {
        params.push('certificate=' + this.selectedAsset.certificateUri);
      }
    }

    const navButtons = document.getElementById('nav-button-container');
    for (let button of navButtons.childNodes) {
      if (button.nodeType == Node.ELEMENT_NODE &&
          button.classList.contains('mdl-button--accent')) {
        params.push('panel=' + button.textContent);
        break;
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

    // MAX_LOG_LEVEL is the default starting log level. Only save the log level
    // if it's different from this default.
    if (shaka.log && shaka.log.currentLevel != shaka.log.MAX_LOG_LEVEL) {
      switch (shaka.log.currentLevel) {
        case shaka.log.Level.INFO: params.push('info'); break;
        case shaka.log.Level.DEBUG: params.push('debug'); break;
        case shaka.log.Level.V2: params.push('vv'); break;
        case shaka.log.Level.V1: params.push('v'); break;
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
   * @param {Node} node
   * @private
   */
  hideNode_(node) {
    node.classList.add('hidden');
  }

  /**
   * @param {Node} node
   * @private
   */
  showNode_(node) {
    node.classList.remove('hidden');
  }

  /**
   * Sets up a nav button, and an associated tab.
   * This method is meant to be called by the various tabs, as part of their
   * setup process.
   * @param {string} containerName Used to determine the id of the button this
   *   is looking for.  Also used as the className of the container, for CSS.
   * @return {!HTMLDivElement} The container for the tab.
   */
  addNavButton(containerName) {
    const navButtons = document.getElementById('nav-button-container');
    const contents = document.getElementById('contents');
    const button = document.getElementById('nav-button-' + containerName);

    // TODO: Switch to using MDL tabs.

    // Determine if the element is selected.
    const params = this.getParams_();
    let selected = params['panel'] == encodeURI(button.textContent);
    if (!selected && !params['panel']) {
      // Check if it's selected by default.
      selected = button.getAttribute('defaultselected') != null;
    }

    // Create the div for this nav button's container within the contents.
    const container = document.createElement('div');
    this.hideNode_(container);
    contents.appendChild(container);

    // Add a click listener to display this container, and hide the others.
    const switchPage = () => {
      // This element should be the selected one.
      for (let child of navButtons.childNodes) {
        if (child.nodeType == Node.ELEMENT_NODE) {
          child.classList.remove('mdl-button--accent');
        }
      }
      for (let child of contents.childNodes) {
        if (child.nodeType == Node.ELEMENT_NODE) {
          this.hideNode_(child);
        }
      }
      button.classList.add('mdl-button--accent');
      this.showNode_(container);
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

    return /** @type {!HTMLDivElement} */ (container);
  }

  /**
   * Dispatches a custom event to document.
   * @param {string} name
   * @private
   */
  dispatchEventWithName_(name) {
    const event = document.createEvent('CustomEvent');
    event.initCustomEvent(name,
                          /* canBubble = */ false,
                          /* cancelable = */ false,
                          /* detail = */ null);
    document.dispatchEvent(event);
  }

  /**
   * Sets the "version-string" divs to a version string.
   * For example, "v2.5.4-master (uncompiled)".
   * @private
   */
  setUpVersionStrings_() {
    const version = shaka.Player.version;
    let split = version.split('-');
    let inParen = [];

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
    const link = document.getElementById('error-display-link');
    link.href = '';
    link.textContent = '';
    link.severity = null;
  }

  /**
   * @param {!Event} event
   * @private
   */
  onErrorEvent_(event) {
    this.onError_(event.detail);
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
    const link = document.getElementById('error-display-link');

    // Always show the new error if:
    //   1. there is no error showing currently
    //   2. the new error is more severe than the old one
    if (link.severity == null || severity > link.severity) {
      link.href = href;
      // IE8 and other very old browsers don't have textContent.
      if (link.textContent === undefined) {
        link.innerText = message;
      } else {
        link.textContent = message;
      }
      link.severity = severity;
      if (link.href) {
        link.classList.remove('input-disabled');
      } else {
        link.classList.add('input-disabled');
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
};


/** @type {!Array.<string>} */
shakaDemo.Main.commonDrmSystems = [
  'com.widevine.alpha',
  'com.microsoft.playready',
  'com.apple.fps.1_0',
  'com.adobe.primetime',
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
  shakaDemo.Main.initWrapper(() => shakaDemoMain.initFailed());
});
