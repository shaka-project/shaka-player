/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * @fileoverview
 */

goog.provide('ShakaDemoAssetInfo');


/**
 * An object that contains information about an asset.
 */
const ShakaDemoAssetInfo = class {
  /**
   * @param {string} name
   * @param {string} iconUri
   * @param {string} manifestUri
   * @param {shakaAssets.Source} source
   */
  constructor(name, iconUri, manifestUri, source) {
    // Required members.
    /** @type {string} */
    this.name = name;
    /** @type {string} */
    this.shortName = '';
    /** @type {string} */
    this.iconUri = iconUri;
    /** @type {string} */
    this.manifestUri = manifestUri;
    /** @type {!shakaAssets.Source} */
    this.source = source;

    // Optional members.
    /** @type {boolean} */
    this.focus = false;
    /** @type {boolean} */
    this.disabled = false;
    /** @type {!Array<!shaka.extern.ExtraText>} */
    this.extraText = [];
    /** @type {!Array<string>} */
    this.extraThumbnail = [];
    /** @type {!Array<!shakaAssets.ExtraChapter>} */
    this.extraChapter = [];
    /** @type {?string} */
    this.certificateUri = null;
    /** @type {?string} */
    this.description = null;
    /** @type {boolean} */
    this.isFeatured = false;
    /** @type {!Array<!shakaAssets.KeySystem>} */
    this.drm = [shakaAssets.KeySystem.CLEAR];
    /** @type {!Array<!shakaAssets.Feature>} */
    this.features = [shakaAssets.Feature.VOD];
    /** @type {!Map<string, string>} */
    this.licenseServers = new Map();
    /** @type {!Map<string, string>} */
    this.offlineLicenseServers = new Map();
    /** @type {!Map<string, string>} */
    this.licenseRequestHeaders = new Map();
    /** @type {?shaka.extern.RequestFilter} */
    this.requestFilter = null;
    /** @type {?shaka.extern.ResponseFilter} */
    this.responseFilter = null;
    /** @type {!Map<string, string>} */
    this.clearKeys = new Map(); // TODO: Setter method?
    /** @type {?Object} */
    this.extraConfig = null;
    /** @type {?Object} */
    this.extraUiConfig = null;
    /** @type {?string} */
    this.adTagUri = null;
    /** @type {?string} */
    this.imaVideoId = null;
    /** @type {?string} */
    this.imaAssetKey = null;
    /** @type {?string} */
    this.imaContentSrcId = null;
    /** @type {?string} */
    this.imaManifestType = null;
    /** @type {?string} */
    this.mediaTailorUrl = null;
    /** @type {?Object} */
    this.mediaTailorAdsParams = null;
    /** @type {boolean} */
    this.useIMA = true;
    /** @type {?string} */
    this.mimeType = null;


    // Preload values.
    /** @type {?shaka.media.PreloadManager} */
    this.preloadManager;
    this.preloaded = false;
    this.preloadFailed = false;


    // Offline storage values.
    /** @type {?function()} */
    this.storeCallback;
    /** @type {?function()} */
    this.unstoreCallback;
    /** @type {?shaka.extern.StoredContent} */
    this.storedContent;
    /** @type {number} */
    this.storedProgress = 1;
  }

  /**
   * @param {string} description
   * @return {!ShakaDemoAssetInfo}
   */
  addDescription(description) {
    this.description = description;
    return this;
  }

  /**
   * @param {string} certificateUri
   * @return {!ShakaDemoAssetInfo}
   */
  addCertificateUri(certificateUri) {
    this.certificateUri = certificateUri;
    return this;
  }

  /**
   * A sort comparator for comparing two messages, ignoring case.
   * @param {string} a
   * @param {string} b
   * @return {number}
   * @private
   */
  static caseLessAlphaComparator_(a, b) {
    if (a.toLowerCase() < b.toLowerCase()) {
      return -1;
    }
    if (a.toLowerCase() > b.toLowerCase()) {
      return 1;
    }
    return 0;
  }

  /**
   * @param {shakaAssets.Feature} feature
   * @return {!ShakaDemoAssetInfo}
   */
  addFeature(feature) {
    const Feature = shakaAssets.Feature;
    if (feature == Feature.LIVE) {
      // Unmark this feature as being VOD.
      this.features = this.features.filter((feature) => feature != Feature.VOD);
    }
    this.features.push(feature);
    // Sort the features list, so that features are in a predictable order.
    this.features.sort(ShakaDemoAssetInfo.caseLessAlphaComparator_);
    return this;
  }

  /**
   * @param {shakaAssets.Feature} feature
   * @return {!ShakaDemoAssetInfo}
   */
  removeFeature(feature) {
    this.features = this.features.filter((f) => f != feature);
    // Sort the features list, so that features are in a predictable order.
    this.features.sort(ShakaDemoAssetInfo.caseLessAlphaComparator_);
    return this;
  }

  /**
   * @private
   */
  checkAdFeature_() {
    let isAd = false;
    if (this.adTagUri || (this.imaVideoId && this.imaContentSrcId) ||
      this.imaAssetKey || this.mediaTailorUrl) {
      isAd = true;
    }
    if (isAd) {
      if (!this.features.includes(shakaAssets.Feature.ADS)) {
        this.addFeature(shakaAssets.Feature.ADS);
      }
    } else {
      if (this.features.includes(shakaAssets.Feature.ADS)) {
        this.removeFeature(shakaAssets.Feature.ADS);
      }
    }
  }

  /**
   * @param {shakaAssets.KeySystem} keySystem
   * @return {!ShakaDemoAssetInfo}
   */
  addKeySystem(keySystem) {
    if (this.isClear()) {
      // Once an asset has an actual key system, it's no longer a CLEAR asset.
      this.drm = [];
    }
    this.drm.push(keySystem);
    // Sort the drm list, so that key systems are in a predictable order.
    this.drm.sort(ShakaDemoAssetInfo.caseLessAlphaComparator_);
    return this;
  }

  /** @return {boolean} */
  isClear() {
    return this.drm.length == 1 && this.drm[0] == shakaAssets.KeySystem.CLEAR;
  }

  /** @return {boolean} */
  isAes128() {
    return this.drm.length == 1 && this.drm[0] == shakaAssets.KeySystem.AES128;
  }

  /**
   * @param {!Object} extraConfig
   * @return {!ShakaDemoAssetInfo}
   */
  setExtraConfig(extraConfig) {
    this.extraConfig = extraConfig;
    return this;
  }

  /**
   * @param {!Object} extraUiConfig
   * @return {!ShakaDemoAssetInfo}
   */
  setExtraUiConfig(extraUiConfig) {
    this.extraUiConfig = extraUiConfig;
    return this;
  }

  /**
   * @param {string} mimeType
   * @return {!ShakaDemoAssetInfo}
   */
  setMimeType(mimeType) {
    this.mimeType = mimeType;
    return this;
  }

  /**
   * @param {!shaka.extern.RequestFilter} requestFilter
   * @return {!ShakaDemoAssetInfo}
   */
  setRequestFilter(requestFilter) {
    this.requestFilter = requestFilter;
    return this;
  }

  /**
   * @param {!shaka.extern.ResponseFilter} responseFilter
   * @return {!ShakaDemoAssetInfo}
   */
  setResponseFilter(responseFilter) {
    this.responseFilter = responseFilter;
    return this;
  }

  /**
   * @param {string} keySystem
   * @param {string} licenseServer
   * @return {!ShakaDemoAssetInfo}
   */
  addLicenseServer(keySystem, licenseServer) {
    this.licenseServers.set(keySystem, licenseServer);
    return this;
  }

  /**
   * @return {!Map<string, string>}
   */
  getLicenseServers() {
    return this.licenseServers;
  }

  /**
   * @param {string} keySystem
   * @param {string} licenseServer
   * @return {!ShakaDemoAssetInfo}
   */
  addOfflineLicenseServer(keySystem, licenseServer) {
    this.offlineLicenseServers.set(keySystem, licenseServer);
    return this;
  }

  /**
   * @param {string} uri
   * @return {!ShakaDemoAssetInfo}
   */
  setAdTagUri(uri) {
    this.adTagUri = uri.trim();
    this.checkAdFeature_();
    return this;
  }

  /**
   * @param {string} id
   * @return {!ShakaDemoAssetInfo}
   */
  setIMAContentSourceId(id) {
    this.imaContentSrcId = id.trim();
    this.checkAdFeature_();

    return this;
  }

  /**
   * @param {string} id
   * @return {!ShakaDemoAssetInfo}
   */
  setIMAVideoId(id) {
    this.imaVideoId = id.trim();
    this.checkAdFeature_();

    return this;
  }

  /**
   * @param {string} key
   * @return {!ShakaDemoAssetInfo}
   */
  setIMAAssetKey(key) {
    this.imaAssetKey = key.trim();
    this.checkAdFeature_();

    return this;
  }

  /**
   * @param {string} type
   * @return {!ShakaDemoAssetInfo}
   */
  setIMAManifestType(type) {
    this.imaManifestType = type.trim();
    this.checkAdFeature_();

    return this;
  }

  /**
   * @param {string} url
   * @param {?Object=} adsParams
   * @return {!ShakaDemoAssetInfo}
   */
  setMediaTailor(url, adsParams=null) {
    this.mediaTailorUrl = url.trim();
    this.mediaTailorAdsParams = adsParams;
    this.checkAdFeature_();

    return this;
  }

  /**
   * @return {boolean}
   */
  hasAds() {
    return this.features.includes(shakaAssets.Feature.ADS);
  }

  /**
   * @param {string} headerName
   * @param {string} headerValue
   * @return {!ShakaDemoAssetInfo}
   */
  addLicenseRequestHeader(headerName, headerValue) {
    this.licenseRequestHeaders.set(headerName, headerValue);
    return this;
  }

  /**
   * @param {shaka.extern.ExtraText} extraText
   * @return {!ShakaDemoAssetInfo}
   */
  addExtraText(extraText) {
    this.extraText.push(extraText);
    return this;
  }

  /**
   * @param {string} textUri
   * @return {!ShakaDemoAssetInfo}
   */
  removeExtraText(textUri) {
    this.extraText = this.extraText.filter((extraText) => {
      return extraText.uri != textUri;
    });
    return this;
  }

  /**
   * @param {string} uri
   * @return {!ShakaDemoAssetInfo}
   */
  addExtraThumbnail(uri) {
    this.extraThumbnail.push(uri);
    return this;
  }

  /**
   * @param {shakaAssets.ExtraChapter} extraChapter
   * @return {!ShakaDemoAssetInfo}
   */
  addExtraChapter(extraChapter) {
    this.extraChapter.push(extraChapter);
    return this;
  }

  /**
   * @param {string} chapterUri
   * @return {!ShakaDemoAssetInfo}
   */
  removeExtraChapter(chapterUri) {
    this.extraChapter = this.extraChapter.filter((extraChapter) => {
      return extraChapter.uri != chapterUri;
    });
    return this;
  }

  /**
   * If this is called, the asset will be focused on by the integration tests.
   * @return {!ShakaDemoAssetInfo}
   */
  markAsFocused() {
    this.focus = true;
    return this;
  }

  /**
   * If this is called, the asset will appear on the main page of the demo.
   * Also, this allows you to provide a shorter name to be used in the feature
   * card.
   * @param {string=} shortName
   * @return {!ShakaDemoAssetInfo}
   */
  markAsFeatured(shortName) {
    this.isFeatured = true;
    this.shortName = shortName || this.shortName;
    return this;
  }

  /**
   * If this is called, the asset is disabled in tests and in the demo app.
   * @return {!ShakaDemoAssetInfo}
   */
  markAsDisabled() {
    this.disabled = true;
    return this;
  }

  /**
   * @return {!Object}
   * @override
   * @suppress {checkTypes}
   * Suppress checkTypes warnings, so that we can access properties of this
   * object as though it were a struct.
   */
  toJSON() {
    // Construct a generic object with the values of this object, but with the
    // proper formatting.
    const raw = {};
    for (const key in this) {
      if (key.startsWith('preload') || key.startsWith('store') ||
          key.endsWith('Callback')) {
        // These values shouldn't be saved, as they are dynamic.
        continue;
      }
      const value = this[key];
      if (value instanceof Map) {
        // The built-in JSON functions cannot convert Maps; this converts Maps
        // to objects.
        const replacement = {};
        replacement['__type__'] = 'map';
        for (const entry of value.entries()) {
          replacement[entry[0]] = entry[1];
        }
        raw[key] = replacement;
      } else {
        raw[key] = value;
      }
    }
    return raw;
  }

  /**
   * @return {!string}
   */
  toBase64() {
    return window.btoa(JSON.stringify(this.toJSON()));
  }

  /**
   * Applies appropriate request or response filters to the player.
   * @param {shaka.net.NetworkingEngine} networkingEngine
   */
  applyFilters(networkingEngine) {
    networkingEngine.clearAllRequestFilters();
    networkingEngine.clearAllResponseFilters();

    if (this.licenseRequestHeaders.size) {
      /** @type {!shaka.extern.RequestFilter} */
      const filter = (requestType, request, context) => {
        return this.addLicenseRequestHeaders_(this.licenseRequestHeaders,
            requestType,
            request);
      };
      networkingEngine.registerRequestFilter(filter);
    }

    if (this.requestFilter) {
      networkingEngine.registerRequestFilter(this.requestFilter);
    }
    if (this.responseFilter) {
      networkingEngine.registerResponseFilter(this.responseFilter);
    }
  }

  /**
   * Gets the configuration object for the asset.
   *
   * @param {boolean=} forStorage
   * @return {!shaka.extern.PlayerConfiguration}
   */
  getConfiguration(forStorage = false) {
    const config = /** @type {shaka.extern.PlayerConfiguration} */(
      {drm: {advanced: {}}, manifest: {dash: {}, hls: {}}, streaming: {}});

    if (this.extraConfig) {
      for (const key in this.extraConfig) {
        config[key] = this.extraConfig[key];
      }
    }

    let licenseServers = this.licenseServers;
    // PR license servers may require a different URL for offline.
    if (forStorage && this.offlineLicenseServers.size) {
      licenseServers = this.offlineLicenseServers;
    }

    if (licenseServers.size) {
      config.drm.servers = config.drm.servers || {};
      licenseServers.forEach((value, key) => {
        config.drm.servers[key] = value;
      });
    }

    if (this.clearKeys.size) {
      config.drm.clearKeys = config.drm.clearKeys || {};
      this.clearKeys.forEach((value, key) => {
        config.drm.clearKeys[key] = value;
      });
    }

    if (this.features.includes(shakaAssets.Feature.LOW_LATENCY)) {
      config.streaming.lowLatencyMode = true;
    }

    // Windows Edge only support persistent licenses with
    // `com.microsoft.playready.recommendation` keySystem.
    if (forStorage &&
        navigator.userAgent.match(/Edge?\//) &&
        navigator.platform &&
        navigator.platform.toLowerCase().includes('win32')) {
      config.drm.keySystemsMapping = {
        'com.microsoft.playready': 'com.microsoft.playready.recommendation',
      };
    }

    return config;
  }

  /**
   * @param {!Map<string, string>} headers
   * @param {shaka.net.NetworkingEngine.RequestType} requestType
   * @param {shaka.extern.Request} request
   * @private
   */
  addLicenseRequestHeaders_(headers, requestType, request) {
    if (requestType != shaka.net.NetworkingEngine.RequestType.LICENSE) {
      return;
    }

    // Add these to the existing headers.  Do not clobber them!
    // For PlayReady, there will already be headers in the request.
    headers.forEach((value, key) => {
      request.headers[key] = value;
    });
  }

  /** @return {boolean} */
  isStored() {
    return this.storedContent != null;
  }

  /** @return {!ShakaDemoAssetInfo} */
  static makeBlankAsset() {
    return new ShakaDemoAssetInfo(
        /* name= */ '',
        /* iconUri= */ '',
        /* manifestUri= */ '',
        /* source= */ shakaAssets.Source.CUSTOM);
  }

  /**
   * @param {!Object} raw
   * @return {!ShakaDemoAssetInfo}
   */
  static fromJSON(raw) {
    // This handles the special case for Maps in toJSON.
    const parsed = {};
    for (const key in raw) {
      const value = raw[key];
      if (value && typeof value == 'object' && value['__type__'] == 'map') {
        const replacement = new Map();
        for (const key in value) {
          if (key != '__type__') {
            replacement.set(key, value[key]);
          }
        }
        parsed[key] = replacement;
      } else {
        parsed[key] = value;
      }
    }
    const asset = ShakaDemoAssetInfo.makeBlankAsset();
    Object.assign(asset, parsed);
    return asset;
  }

  /**
   * @param {!string} raw
   * @return {?ShakaDemoAssetInfo}
   */
  static fromBase64(raw) {
    const data = window.atob(raw);
    try {
      const dataAsJson = /** @type {!Object} */(JSON.parse(data));
      return ShakaDemoAssetInfo.fromJSON(dataAsJson);
    } catch (e) {}
    return null;
  }
};
