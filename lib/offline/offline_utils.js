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

goog.provide('shaka.offline.OfflineUtils');

goog.require('goog.asserts');


/** @const {!Object.<string, string>} */
shaka.offline.OfflineUtils.DB_SCHEME = {'manifest': 'key', 'segment': 'key'};


/**
 * Converts the given database manifest to a storedContent structure.
 *
 * @param {shakaExtern.ManifestDB} manifest
 * @return {shakaExtern.StoredContent}
 */
shaka.offline.OfflineUtils.getStoredContent = function(manifest) {
  goog.asserts.assert(manifest.periods.length > 0,
                      'Must be at least one Period.');
  return {
    offlineUri: 'offline:' + manifest.key,
    originalManifestUri: manifest.originalManifestUri,
    duration: manifest.duration,
    size: manifest.size,
    tracks: manifest.periods[0].streams.map(function(stream) {
      return {
        id: stream.id,
        active: false,
        type: stream.contentType,
        bandwidth: 0,
        language: stream.language,
        kind: stream.kind || null,
        width: stream.width,
        height: stream.height,
        frameRate: stream.frameRate,
        codecs: stream.codecs
      };
    }),
    appMetadata: manifest.appMetadata
  };
};
