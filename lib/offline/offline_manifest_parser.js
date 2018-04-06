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

goog.provide('shaka.offline.OfflineManifestParser');

goog.require('shaka.log');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.offline.ManifestConverter');
goog.require('shaka.offline.OfflineUri');
goog.require('shaka.offline.StorageEngineFactory');
goog.require('shaka.util.Error');



/**
 * Creates a new offline manifest parser.
 * @struct
 * @constructor
 * @implements {shaka.extern.ManifestParser}
 */
shaka.offline.OfflineManifestParser = function() {
  /** @private {shaka.offline.OfflineUri} */
  this.uri_ = null;
};


/** @override */
shaka.offline.OfflineManifestParser.prototype.configure = function(config) {
  // No-op
};


/** @override */
shaka.offline.OfflineManifestParser.prototype.start =
    function(uri, playerInterface) {
  this.uri_ = shaka.offline.OfflineUri.parse(uri);
  if (this.uri_ == null || !this.uri_.isManifest()) {
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.NETWORK,
        shaka.util.Error.Code.MALFORMED_OFFLINE_URI,
        uri));
  }

  let converter = new shaka.offline.ManifestConverter(
      this.uri_.mechanism(), this.uri_.cell());

  /** @type {shaka.offline.IStorageEngine} */
  let storageEngine;

  return shaka.offline.StorageEngineFactory.createStorageEngine()
      .then((se) => {
        storageEngine = se;
        return storageEngine.getManifest(this.uri_.key());
      })
      .then((manifest) => {
        if (!manifest) {
          throw new shaka.util.Error(
              shaka.util.Error.Severity.CRITICAL,
              shaka.util.Error.Category.STORAGE,
              shaka.util.Error.Code.REQUESTED_ITEM_NOT_FOUND,
              this.uri_.key());
        }

        return converter.fromManifestDB(manifest);
      })
      .then(
          (ret) => storageEngine.destroy().then(() => ret),
          (err) => storageEngine.destroy().then(() => { throw err; }));
};


/** @override */
shaka.offline.OfflineManifestParser.prototype.stop = function() {
  return Promise.resolve();
};


/** @override */
shaka.offline.OfflineManifestParser.prototype.update = function() {
  // No-op
};


/** @override */
shaka.offline.OfflineManifestParser.prototype.onExpirationUpdated = function(
    sessionId, expiration) {
  /** @type {shaka.offline.IStorageEngine} */
  let storageEngine;

  shaka.offline.StorageEngineFactory.createStorageEngine()
      .then((se) => {
        storageEngine = se;
        return storageEngine.getManifest(this.uri_.key());
      })
      .then((manifest) => {
        if (!manifest) {
          // The manifest was deleted, so ignore the update.
          return;
        }
        if (manifest.sessionIds.indexOf(sessionId) < 0) {
          shaka.log.debug('Ignoring updated expiration for unknown session');
          return;
        }

        if (manifest.expiration == undefined ||
            manifest.expiration > expiration) {
          shaka.log.debug('Updating expiration for stored content');
          manifest.expiration = expiration;
          return storageEngine.updateManifest(this.uri_.key(), manifest);
        }
      })
      .catch((error) => {
        shaka.log.error('Error updating offline manifest expiration', error);
      })
      .then(() => storageEngine.destroy());
};


shaka.media.ManifestParser.registerParserByMime(
    'application/x-offline-manifest', shaka.offline.OfflineManifestParser);
