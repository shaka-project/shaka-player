/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.offline.OfflineUri');

goog.require('goog.asserts');


/**
 * The OfflineUri class contains all the components that make up the offline
 * uri. The components are:
 *    TYPE: Used to know what type of data the uri points to. It can either
 *          be "manifest", "segment" or "pending".
 *    MECHANISM: The name of the mechanism that manages the storage cell that
 *               holds the data.
 *    CELL: The name of the cell that holds the data.
 *    KEY: The key that the data is stored under in the cell.
 *
 * A "pending" uri points to a segment of content that is still being
 * downloaded, which has no key yet.  Its KEY is the key of the manifest, and
 * it has these additional components:
 *    STREAM: The id of the stream the segment belongs to.
 *    POSITION: The position of the segment in the stream.
 *    INIT: If present, the uri points to the init segment of that segment.
 */
shaka.offline.OfflineUri = class {
  /**
   * @param {string} type
   * @param {string} mechanism
   * @param {string} cell
   * @param {number} key
   * @param {?shaka.offline.OfflineUri.PendingSegment=} pendingSegment
   *   Required for "pending" uris.
   */
  constructor(type, mechanism, cell, key, pendingSegment = null) {
    /**
     * @private {string}
     * @const
     */
    this.type_ = type;
    /**
     * @private {string}
     * @const
     */
    this.mechanism_ = mechanism;
    /**
     * @private {string}
     * @const
     */
    this.cell_ = cell;
    /**
     * @private {number}
     * @const
     */
    this.key_ = key;
    /**
     * @private {?shaka.offline.OfflineUri.PendingSegment}
     * @const
     */
    this.pendingSegment_ = pendingSegment;

    const parts = ['offline:', type, '/', mechanism, '/', cell, '/', key];
    if (pendingSegment) {
      parts.push('/', pendingSegment.streamId, '/', pendingSegment.position);
      if (pendingSegment.isInit) {
        parts.push('/init');
      }
    }
    /**
     * @private {string}
     * @const
     */
    this.asString_ = parts.join('');
  }

  /** @return {boolean} */
  isManifest() { return this.type_ == 'manifest'; }

  /** @return {boolean} */
  isSegment() { return this.type_ == 'segment'; }

  /** @return {boolean} */
  isPendingSegment() { return this.type_ == 'pending'; }

  /** @return {string} */
  mechanism() { return this.mechanism_; }

  /** @return {string} */
  cell() { return this.cell_; }

  /** @return {number} */
  key() { return this.key_; }

  /** @return {?shaka.offline.OfflineUri.PendingSegment} */
  pendingSegment() { return this.pendingSegment_; }

  /** @override */
  toString() { return this.asString_; }

  /**
   * @param {string} uri
   * @return {?shaka.offline.OfflineUri}
   */
  static parse(uri) {
    const parts = new RegExp(
        '^offline:([a-z]+)/([^/]+)/([^/]+)/([0-9]+)' +
        '(?:/([0-9]+)/([0-9]+)(/init)?)?$').exec(uri);
    if (parts == null) {
      return null;
    }

    const type = parts[1];
    if (type != 'manifest' && type != 'segment' && type != 'pending') {
      return null;
    }

    // Only pending uris have the additional components.
    const isPending = type == 'pending';
    if (isPending != (parts[5] != undefined)) {
      return null;
    }

    const mechanism = parts[2];
    if (!mechanism) {
      return null;
    }

    const cell = parts[3];
    if (!cell) {
      return null;
    }

    const key = Number(parts[4]);
    if (type == null) {
      return null;
    }

    /** @type {?shaka.offline.OfflineUri.PendingSegment} */
    const pendingSegment = isPending ? {
      streamId: Number(parts[5]),
      position: Number(parts[6]),
      isInit: parts[7] != undefined,
    } : null;

    return new shaka.offline.OfflineUri(
        type, mechanism, cell, key, pendingSegment);
  }

  /**
   * @param {string} mechanism
   * @param {string} cell
   * @param {number} key
   * @return {!shaka.offline.OfflineUri}
   */
  static manifest(mechanism, cell, key) {
    return new shaka.offline.OfflineUri('manifest', mechanism, cell, key);
  }

  /**
   * @param {string} mechanism
   * @param {string} cell
   * @param {number} key
   * @return {!shaka.offline.OfflineUri}
   */
  static segment(mechanism, cell, key) {
    return new shaka.offline.OfflineUri('segment', mechanism, cell, key);
  }

  /**
   * @param {string} mechanism
   * @param {string} cell
   * @param {number} manifestKey
   * @param {shaka.offline.OfflineUri.PendingSegment} pendingSegment
   * @return {!shaka.offline.OfflineUri}
   */
  static pendingSegment(mechanism, cell, manifestKey, pendingSegment) {
    return new shaka.offline.OfflineUri(
        'pending', mechanism, cell, manifestKey, pendingSegment);
  }

  /**
   * @return {!shaka.offline.OfflineUri}  The uri of the manifest a pending
   *   segment belongs to.
   */
  manifestOfPendingSegment() {
    goog.asserts.assert(this.isPendingSegment(), 'Not a pending segment uri');
    return shaka.offline.OfflineUri.manifest(
        this.mechanism_, this.cell_, this.key_);
  }
};


/**
 * @typedef {{
 *   streamId: number,
 *   position: number,
 *   isInit: boolean
 * }}
 *
 * @description
 * Locates a segment of stored content that has not been stored yet.
 *
 * @property {number} streamId
 *   The id of the stream the segment belongs to.
 * @property {number} position
 *   The position of the segment in the segments of the stream.
 * @property {boolean} isInit
 *   If true, this refers to the init segment of that segment instead.
 */
shaka.offline.OfflineUri.PendingSegment;
