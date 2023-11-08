/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.ContentSteeringManager');

goog.require('goog.Uri');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.Error');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.OperationManager');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.Timer');


/**
 * Create a Content Steering manager.
 *
 * @implements {shaka.util.IDestroyable}
 */
shaka.util.ContentSteeringManager = class {
  /**
   * @param {shaka.extern.ManifestParser.PlayerInterface} playerInterface
   */
  constructor(playerInterface) {
    /** @private {?shaka.extern.ManifestConfiguration} */
    this.config_ = null;

    /** @private {?shaka.extern.ManifestParser.PlayerInterface} */
    this.playerInterface_ = playerInterface;

    /** @private {!shaka.util.OperationManager} */
    this.operationManager_ = new shaka.util.OperationManager();

    /** @private {!Array.<string>} */
    this.baseUris_ = [];

    /** @private {?string} */
    this.defaultPathwayId_ = null;

    /** @private {!Array.<string>} */
    this.pathwayPriority_ = [];

    /** @private {?string} */
    this.lastPathwayUsed_ = null;

    /** @private {!Array.<shaka.util.ContentSteeringManager.PathawayClone>} */
    this.pathwayClones_ = [];

    /**
     * Default to 5 minutes. Value in seconds.
     *
     * @private {number}
     */
    this.lastTTL_ = 300;

    /** @private {!Map.<string, !Map.<string, string>>} */
    this.locations_ = new Map();

    /** @private {!Map.<string, number>} */
    this.bannedLocations_ = new Map();

    /** @private {?shaka.util.Timer} */
    this.updateTimer_ = null;

    /** @private {string} */
    this.manifestType_ = shaka.media.ManifestParser.UNKNOWN;
  }

  /**
   * @param {shaka.extern.ManifestConfiguration} config
   */
  configure(config) {
    this.config_ = config;
  }


  /** @override */
  destroy() {
    this.config_ = null;
    this.playerInterface_ = null;
    this.baseUris_ = [];
    this.defaultPathwayId_ = null;
    this.pathwayPriority_ = [];
    this.pathwayClones_ = [];
    this.locations_.clear();

    if (this.updateTimer_ != null) {
      this.updateTimer_.stop();
      this.updateTimer_ = null;
    }

    return this.operationManager_.destroy();
  }

  /**
   * @param {string} manifestType
   */
  setManifestType(manifestType) {
    this.manifestType_ = manifestType;
  }

  /**
   * @param {!Array.<string>} baseUris
   */
  setBaseUris(baseUris) {
    this.baseUris_ = baseUris;
  }

  /**
   * @param {?string} defaultPathwayId
   */
  setDefaultPathwayId(defaultPathwayId) {
    this.defaultPathwayId_ = defaultPathwayId;
  }

  /**
   * Request the Content Steering info.
   *
   * @param {string} uri
   * @return {!Promise}
   */
  async requestInfo(uri) {
    const uris = shaka.util.ManifestParserUtils.resolveUris(
        this.baseUris_, [this.addQueryParams_(uri)]);
    const type = shaka.net.NetworkingEngine.RequestType.CONTENT_STEERING;
    const request = shaka.net.NetworkingEngine.makeRequest(
        uris, this.config_.retryParameters);

    const op = this.playerInterface_.networkingEngine.request(type, request);
    this.operationManager_.manage(op);
    try {
      const response = await op.promise;
      const str = shaka.util.StringUtils.fromUTF8(response.data);
      const steeringManifest =
          /** @type {shaka.util.ContentSteeringManager.SteeringManifest} */
          (JSON.parse(str));
      if (steeringManifest.VERSION == 1) {
        this.processManifest_(steeringManifest, response.uri);
      }
    } catch (e) {
      if (e && e.code == shaka.util.Error.Code.OPERATION_ABORTED) {
        return;
      }
      if (this.updateTimer_ != null) {
        this.updateTimer_.stop();
        this.updateTimer_ = null;
      }
      this.updateTimer_ = new shaka.util.Timer(() => {
        this.requestInfo(uri);
      });
      this.updateTimer_.tickAfter(this.lastTTL_);
    }
  }

  /** @private */
  addQueryParams_(uri) {
    if (!this.pathwayPriority_.length) {
      return uri;
    }
    const finalUri = new goog.Uri(uri);
    const currentPathwayID = this.lastPathwayUsed_ || this.pathwayPriority_[0];
    const currentBandwidth =
        Math.round(this.playerInterface_.getBandwidthEstimate());
    const queryData = finalUri.getQueryData();
    if (this.manifestType_ == shaka.media.ManifestParser.DASH) {
      queryData.add('_DASH_pathway', currentPathwayID);
      queryData.add('_DASH_throughput', String(currentBandwidth));
    } else if (this.manifestType_ == shaka.media.ManifestParser.HLS) {
      queryData.add('_HLS_pathway', currentPathwayID);
      queryData.add('_HLS_throughput', String(currentBandwidth));
    }
    if (queryData.getCount()) {
      finalUri.setQueryData(queryData);
    }
    return finalUri.toString();
  }

  /**
   * @param {shaka.util.ContentSteeringManager.SteeringManifest} manifest
   * @param {string} finalManifestUri
   * @private
   */
  processManifest_(manifest, finalManifestUri) {
    if (this.updateTimer_ != null) {
      this.updateTimer_.stop();
      this.updateTimer_ = null;
    }
    const uri = manifest['RELOAD-URI'] || finalManifestUri;
    this.updateTimer_ = new shaka.util.Timer(() => {
      this.requestInfo(uri);
    });
    if (manifest.TTL) {
      this.lastTTL_ = 1;
    }
    this.updateTimer_.tickAfter(this.lastTTL_);
    this.pathwayPriority_ = manifest['PATHWAY-PRIORITY'] || [];
    this.pathwayClones_ = manifest['PATHWAY-CLONES'] || [];
  }

  /**
   * Clear the previous locations added.
   */
  clearPreviousLocations() {
    this.locations_.clear();
  }

  /**
   * @param {string} streamId
   * @param {string} pathwayId
   * @param {string} uri
   */
  addLocation(streamId, pathwayId, uri) {
    let streamLocations = this.locations_.get(streamId);
    if (!streamLocations) {
      streamLocations = new Map();
    }
    streamLocations.set(pathwayId, uri);
    this.locations_.set(streamId, streamLocations);
  }

  /**
   * @param {string} uri
   */
  banLocation(uri) {
    const bannedUntil = Date.now() + 60000;
    this.bannedLocations_.set(uri, bannedUntil);
  }

  /**
   * Get the base locations ordered according the priority.
   *
   * @param {string} streamId
   * @return {!Array.<string>}
   */
  getLocations(streamId) {
    const streamLocations = this.locations_.get(streamId) || new Map();
    /** @type {!Array.<!{pathwayId: string, location: string}>} */
    let locationsPathwayIdMap = [];
    for (const pathwayId of this.pathwayPriority_) {
      const location = streamLocations.get(pathwayId);
      if (location) {
        locationsPathwayIdMap.push({pathwayId, location});
      } else {
        const clone = this.pathwayClones_.find((c) => c.ID == pathwayId);
        if (clone) {
          const cloneLocation = streamLocations.get(clone['BASE-ID']);
          if (cloneLocation) {
            if (clone['URI-REPLACEMENT'].HOST) {
              const uri = new goog.Uri(cloneLocation);
              uri.setDomain(clone['URI-REPLACEMENT'].HOST);
              locationsPathwayIdMap.push({
                pathwayId: pathwayId,
                location: uri.toString(),
              });
            } else {
              locationsPathwayIdMap.push({
                pathwayId: pathwayId,
                location: cloneLocation,
              });
            }
          }
        }
      }
    }

    const now = Date.now();
    for (const uri of this.bannedLocations_.keys()) {
      const bannedUntil = this.bannedLocations_.get(uri);
      if (now > bannedUntil) {
        this.bannedLocations_.delete(uri);
      }
    }
    locationsPathwayIdMap = locationsPathwayIdMap.filter((l) => {
      for (const uri of this.bannedLocations_.keys()) {
        if (uri.includes(l.location)) {
          return false;
        }
      }
      return true;
    });

    if (locationsPathwayIdMap.length) {
      this.lastPathwayUsed_ = locationsPathwayIdMap[0].pathwayId;
    }

    const locations = locationsPathwayIdMap.map((l) => l.location);

    if (!locations.length && this.defaultPathwayId_) {
      for (const pathwayId of this.defaultPathwayId_.split(',')) {
        const location = streamLocations.get(pathwayId);
        if (location) {
          this.lastPathwayUsed_ = this.defaultPathwayId_;
          locations.push(location);
        }
      }
    }
    if (!locations.length) {
      for (const location of streamLocations.values()) {
        locations.push(location);
      }
    }
    return shaka.util.ManifestParserUtils.resolveUris(
        this.baseUris_, locations);
  }
};


/**
 * @typedef {{
 *   VERSION: number,
 *   TTL: number,
 *   RELOAD-URI: string,
 *   PATHWAY-PRIORITY: !Array.<string>,
 *   PATHWAY-CLONES: !Array.<shaka.util.ContentSteeringManager.PathawayClone>
 * }}
 *
 * @description
 * Contains information about the Steering Manifest
 *
 * @property {string} VERSION
 * @property {number} TTL
 * @property {string RELOAD-URI
 * @property {!Array.<string>} PATHWAY-PRIORITY
 * @property {!Array.<
 *            shaka.util.ContentSteeringManager.PathawayClone>} PATHWAY-CLONES
 */
shaka.util.ContentSteeringManager.SteeringManifest;


/**
 * @typedef {{
 *   BASE-ID: string,
 *   ID: string,
 *   URI-REPLACEMENT: !Array.<shaka.util.ContentSteeringManager.UriReplacement>
 * }}
 *
 * @property {string} BASE-ID
 * @property {string} ID
 * @property {!Array.<
 *            shaka.util.ContentSteeringManager.UriReplacement>} URI-REPLACEMENT
 */
shaka.util.ContentSteeringManager.PathawayClone;


/**
 * @typedef {{
 *   HOST: string
 * }}
 *
 * @property {string} HOST
 */
shaka.util.ContentSteeringManager.UriReplacement;
