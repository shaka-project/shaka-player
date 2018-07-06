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

goog.provide('shaka.offline.OfflineUri');


/**
 * The OfflineUri class contains all the components that make up the offline
 * uri. The components are:
 *    TYPE: Used to know what type of data the uri points to. It can either
 *          be "manifest" or "segment".
 *    MECHANISM: The name of the mechanism that manages the storage cell that
 *               holds the data.
 *    CELL: The name of the cell that holds the data.
 *    KEY: The key that the data is stored under in the cell.
 */
shaka.offline.OfflineUri = class {
  /**
   * @param {string} type
   * @param {string} mechanism
   * @param {string} cell
   * @param {number} key
   */
  constructor(type, mechanism, cell, key) {
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
     * @private {string}
     * @const
     */
    this.asString_ = [
      'offline:', type, '/', mechanism, '/', cell, '/', key,
    ].join('');
  }

  /** @return {boolean} */
  isManifest() { return this.type_ == 'manifest'; }

  /** @return {boolean} */
  isSegment() { return this.type_ == 'segment'; }

  /** @return {string} */
  mechanism() { return this.mechanism_; }

  /** @return {string} */
  cell() { return this.cell_; }

  /** @return {number} */
  key() { return this.key_; }

  /** @override */
  toString() { return this.asString_; }

  /**
   * @param {string} uri
   * @return {?shaka.offline.OfflineUri}
   */
  static parse(uri) {
    let parts = /^offline:([a-z]+)\/([^/]+)\/([^/]+)\/([0-9]+)$/.exec(uri);
    if (parts == null) { return null; }

    let type = parts[1];
    if (type != 'manifest' && type != 'segment') { return null; }

    let mechanism = parts[2];
    if (!mechanism) { return null; }

    let cell = parts[3];
    if (!cell) { return null; }

    let key = Number(parts[4]);
    if (type == null) { return null; }

    return new shaka.offline.OfflineUri(type, mechanism, cell, key);
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
};
