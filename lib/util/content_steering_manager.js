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

    /**
     * Default to 5 minutes. Value in seconds.
     *
     * @private {number}
     */
    this.lastTTL_ = 300;

    /** @private {!Map.<string, string>} */
    this.locations_ = new Map();

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
   * @param {boolean=} addQueryParams
   */
  async requestInfo(uri, addQueryParams = false) {
    let finalUri = uri;
    if (addQueryParams) {
      finalUri = this.addQueryParams_(uri);
    }
    const uris = shaka.util.ManifestParserUtils.resolveUris(
        this.baseUris_, [finalUri]);
    const type = shaka.net.NetworkingEngine.RequestType.CONTENT_STEERING;
    const request = shaka.net.NetworkingEngine.makeRequest(
        uris, this.config_.retryParameters);

    const op = this.playerInterface_.networkingEngine.request(
        type, request);
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
        this.requestInfo(uri, this.pathwayPriority_.length > 0);
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
    const currentPathwayID = this.pathwayPriority_[0];
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
      this.requestInfo(uri, /* addQueryParams= */ true);
    });
    if (manifest.TTL) {
      this.lastTTL_ = manifest.TTL;
    }
    this.updateTimer_.tickAfter(this.lastTTL_);
    this.pathwayPriority_ = manifest['PATHWAY-PRIORITY'] || [];
  }

  /**
   * @param {string} pathwayId
   * @param {string} uri
   */
  addLocation(pathwayId, uri) {
    this.locations_.set(pathwayId, uri);
  }

  /**
   * Get the base locations ordered according the priority.
   *
   * @return {!Array.<string>}
   */
  getLocations() {
    const locations = [];
    for (const pathwayId of this.pathwayPriority_) {
      const location = this.locations_.get(pathwayId);
      if (location) {
        locations.push(location);
      }
    }

    if (!locations.length && this.defaultPathwayId_) {
      for (const pathwayId of this.defaultPathwayId_.split(',')) {
        const location = this.locations_.get(pathwayId);
        if (location) {
          locations.push(location);
        }
      }
    }
    if (!locations.length) {
      for (const location of this.locations_.values()) {
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
 *   PATHWAY-PRIORITY: !Array.<string>
 * }}
 *
 * @description
 * Contains information about the Steering Manifest
 *
 * @property {string} VERSION
 * @property {number} TTL
 * @property {string RELOAD-URI
 * @property {PATHWAY-PRIORITY} PATHWAY-PRIORITY
 */
shaka.util.ContentSteeringManager.SteeringManifest;
