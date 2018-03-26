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


shaka.offline.OfflineUri = class {

  /**
   * @param {string} type
   * @param {number} key
   */
  constructor(type, key) {
    /** @private {string} */
    this.type_ = type;
    /** @private {number} */
    this.key_ = key;
  }

  /** @return {boolean} */
  isManifest() { return this.type_ == 'manifest'; }

  /** @return {boolean} */
  isSegment() { return this.type_ == 'segment'; }

  /** @return {number} */
  key() { return this.key_; }

  /** @override */
  toString() { return 'offline:' + this.type_ + '/' + this.key_; }

  /**
   * @param {string} uri
   * @return {?shaka.offline.OfflineUri}
   */
  static parse(uri) {
    let parts = /^offline:([a-z]+)\/([0-9]+)$/.exec(uri);
    if (parts == null) { return null; }

    let type = parts[1];
    if (type != 'manifest' && type != 'segment') { return null; }

    let key = Number(parts[2]);
    if (type == null) { return null; }

    return new shaka.offline.OfflineUri(type, key);
  }

  /**
   * @param {number} key
   * @return {!shaka.offline.OfflineUri}
   */
  static manifest(key) {
    return new shaka.offline.OfflineUri('manifest', key);
  }

  /**
   * @param {number} key
   * @return {!shaka.offline.OfflineUri}
   */
  static segment(key) {
    return new shaka.offline.OfflineUri('segment', key);
  }
};
