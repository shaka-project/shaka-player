/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.TrackAliasRegistry');

goog.require('shaka.log');

goog.requireType('shaka.msf.Utils');


/**
 * Registry for track aliases that maps between namespace+trackName and
 * trackAlias and stores callbacks for incoming objects.
 */
shaka.msf.TrackAliasRegistry = class {
  constructor() {
    /** @private {Map<string, shaka.msf.Utils.TrackInfo>} */
    this.trackNameToInfo_ = new Map();

    /** @private {Map<string, shaka.msf.Utils.TrackInfo>} */
    this.trackAliasToInfo_ = new Map();
  }

  /**
   * Generate a key for namespace+trackName
   *
   * @param {Array<string>} namespace
   * @param {string} trackName
   * @return {string}
   * @private
   */
  getNamespaceTrackKey_(namespace, trackName) {
    return `${namespace.join('/')}:${trackName}`;
  }

  /**
   * Register a track with a specific alias (the server assigns the alias)
   * @param {Array<string>} namespace
   * @param {string} trackName
   * @param {bigint} requestId
   * @param {bigint} trackAlias
   */
  registerTrackWithAlias(namespace, trackName, requestId, trackAlias) {
    const key = this.getNamespaceTrackKey_(namespace, trackName);

    // Check if the track is already registered
    if (this.trackNameToInfo_.has(key)) {
      shaka.log.warning( `Track ${namespace}:${trackName} already registered,
          updating with new alias ${trackAlias}`);
    }

    /** @type {shaka.msf.Utils.TrackInfo} */
    const info = {
      namespace,
      trackName,
      trackAlias,
      requestId,
      callbacks: [],
      closed: false,
    };

    // Store in both maps
    this.trackNameToInfo_.set(key, info);
    this.trackAliasToInfo_.set(trackAlias.toString(), info);

    shaka.log.debug(`Registered track ${namespace}:${trackName} with
        server-assigned alias ${trackAlias} and request ID ${requestId}`);
  }

  /**
   * Get track info from namespace+trackName
   *
   * @param {Array<string>} namespace
   * @param {string} trackName
   * @return {shaka.msf.Utils.TrackInfo}
   */
  getTrackInfoFromName(namespace, trackName) {
    const key = this.getNamespaceTrackKey_(namespace, trackName);
    return this.trackNameToInfo_.get(key);
  }

  /**
   * Get track info from trackAlias
   *
   * @param {bigint} trackAlias
   * @return {shaka.msf.Utils.TrackInfo}
   */
  getTrackInfoFromAlias(trackAlias) {
    return this.trackAliasToInfo_.get(trackAlias.toString());
  }

  /**
   * Register a callback for a track
   *
   * @param {bigint} trackAlias
   * @param {shaka.msf.Utils.ObjectCallback} callback
   */
  registerCallback(trackAlias, callback) {
    const info = this.trackAliasToInfo_.get(trackAlias.toString());

    if (!info) {
      shaka.log.warning(`Attempted to register callback for unknown track
          alias ${trackAlias}`);
      return;
    }

    info.callbacks.push(callback);
    shaka.log.debug(`Registered callback for track
        ${info.namespace}:${info.trackName} (alias: ${trackAlias}),
        total callbacks: ${info.callbacks.length}`);
  }

  /**
   * Unregister a specific callback for a track
   *
   * @param {bigint} trackAlias
   * @param {shaka.msf.Utils.ObjectCallback} callback
   */
  unregisterCallback(trackAlias, callback) {
    const info = this.trackAliasToInfo_.get(trackAlias.toString());

    if (!info) {
      shaka.log.warning(`Attempted to unregister callback for unknown track
          alias ${trackAlias}`);
      return;
    }

    const index = info.callbacks.indexOf(callback);
    if (index !== -1) {
      info.callbacks.splice(index, 1);
      shaka.log.debug(`Unregistered callback for track
          ${info.namespace}:${info.trackName} (alias: ${trackAlias}),
          remaining callbacks: ${info.callbacks.length}`);
    }
  }

  /**
   * Unregister all callbacks for a track
   *
   * @param {bigint} trackAlias
   */
  unregisterAllCallbacks(trackAlias) {
    const info = this.trackAliasToInfo_.get(trackAlias.toString());

    if (!info) {
      shaka.log.warning(`Attempted to unregister callback for unknown track
          alias ${trackAlias}`);
      return;
    }

    const callbackCount = info.callbacks.length;
    info.callbacks = [];
    shaka.log.debug(`Unregistered all ${callbackCount} callbacks for track
        ${info.namespace}:${info.trackName} (alias: ${trackAlias})`);
  }

  /**
   * Get all callbacks for a track
   *
   * @param {bigint} trackAlias
   * @return {!Array<shaka.msf.Utils.ObjectCallback>}
   */
  getCallbacks(trackAlias) {
    const info = this.trackAliasToInfo_.get(trackAlias.toString());
    return info ? [...info.callbacks] : [];
  }

  /**
   * Get track info from requestId
   *
   * @param {bigint} requestId
   * @return {?shaka.msf.Utils.TrackInfo}
   */
  getTrackInfoFromRequestId(requestId) {
    for (const info of this.trackAliasToInfo_.values()) {
      if (info.requestId === requestId) {
        return info;
      }
    }
    return null;
  }

  /**
   * Clear all registered tracks and callbacks
   */
  clear() {
    this.trackNameToInfo_.clear();
    this.trackAliasToInfo_.clear();
    shaka.log.debug('Cleared all track registrations');
  }
};
