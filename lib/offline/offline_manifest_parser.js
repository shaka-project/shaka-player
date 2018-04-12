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

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.offline.ManifestConverter');
goog.require('shaka.offline.OfflineUri');
goog.require('shaka.offline.StorageMuxer');
goog.require('shaka.util.Error');
goog.require('shaka.util.IDestroyable');



/**
 * Creates a new offline manifest parser.
 * @struct
 * @constructor
 * @implements {shakaExtern.ManifestParser}
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
    function(uriString, playerInterface) {
  let uri = shaka.offline.OfflineUri.parse(uriString);
  this.uri_ = uri;

  if (uri == null || !uri.isManifest()) {
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.NETWORK,
        shaka.util.Error.Code.MALFORMED_OFFLINE_URI,
        uri));
  }

  let muxer = new shaka.offline.StorageMuxer();
  return shaka.util.IDestroyable.with([muxer], async () => {
    await muxer.init();

    let cell = await muxer.getCell(uri.mechanism(), uri.cell());

    let manifests = await cell.getManifests([uri.key()]);
    let manifest = manifests[0];

    let converter = new shaka.offline.ManifestConverter(
      uri.mechanism(), uri.cell());

    return converter.fromManifestDB(manifest);
  });
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
  let uri = this.uri_;

  goog.asserts.assert(
      uri, 'Should not get update event before start has been called');

  let muxer = new shaka.offline.StorageMuxer();
  return shaka.util.IDestroyable.with([muxer], async () => {
    await muxer.init();

    let cell = await muxer.getCell(uri.mechanism(), uri.cell());

    let manifests = await cell.getManifests([uri.key()]);
    let manifest = manifests[0];

    let foundSession = manifest.sessionIds.indexOf(sessionId) >= 0;
    let newExpiration = manifest.expiration == undefined ||
                        manifest.expiration > expiration;

    if (foundSession && newExpiration) {
      shaka.log.debug('Updating expiration for stored content');
      await cell.updateManifestExpiration(uri.key(), expiration);
    }
  }).catch((e) => {
    // Ignore errors with update.
    shaka.log.error('There was an error updating', uri, e);
  });
};


shaka.media.ManifestParser.registerParserByMime(
    'application/x-offline-manifest', shaka.offline.OfflineManifestParser);
