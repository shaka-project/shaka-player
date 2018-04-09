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

goog.provide('shaka.offline.StoredContentUtils');

goog.require('goog.asserts');
goog.require('shaka.media.PresentationTimeline');
goog.require('shaka.offline.ManifestConverter');
goog.require('shaka.offline.OfflineUri');
goog.require('shaka.util.StreamUtils');


/**
 * A utility class used to create |shakaExtern.StoredContent| from different
 * types of input.
 */
shaka.offline.StoredContentUtils = class {
  /**
   * @param {string} originalUri
   * @param {shakaExtern.Manifest} manifest
   * @param {number} size
   * @param {!Object} metadata
   * @return {shakaExtern.StoredContent}
   */
  static fromManifest(originalUri, manifest, size, metadata) {
    goog.asserts.assert(
        manifest.periods.length,
        'Cannot create stored content from manifest with no periods.');

    /** @type {number} */
    let expiration = manifest.expiration == undefined ?
                     Infinity :
                     manifest.expiration;

    /** @type {number} */
    let duration = manifest.presentationTimeline.getDuration();

    /** @type {shakaExtern.Period} */
    let firstPeriod = manifest.periods[0];

    /** @type {!Array.<shakaExtern.Track>} */
    let tracks = shaka.util.StreamUtils.getTracks(firstPeriod);

    /** @type {shakaExtern.StoredContent} */
    let content = {
      offlineUri: null,
      originalManifestUri: originalUri,
      duration: duration,
      size: size,
      expiration: expiration,
      tracks: tracks,
      appMetadata: metadata
    };

    return content;
  }


  /**
   * @param {!shaka.offline.OfflineUri} offlineUri
   * @param {shakaExtern.ManifestDB} manifestDB
   * @return {shakaExtern.StoredContent}
   */
  static fromManifestDB(offlineUri, manifestDB) {
    goog.asserts.assert(
        manifestDB.periods.length,
        'Cannot create stored content from manifestDB with no periods.');

    let converter = new shaka.offline.ManifestConverter(
        offlineUri.mechanism(), offlineUri.cell());

    /** @type {shakaExtern.PeriodDB} */
    let firstPeriodDB = manifestDB.periods[0];
    /** @type {!shaka.media.PresentationTimeline} */
    let timeline = new shaka.media.PresentationTimeline(null, 0);


    /** @type {shakaExtern.Period} */
    let firstPeriod = converter.fromPeriodDB(firstPeriodDB, timeline);

    /** @type {!Object} */
    let metadata = manifestDB.appMetadata || {};

    /** @type {!Array.<shakaExtern.Track>} */
    let tracks = shaka.util.StreamUtils.getTracks(firstPeriod);

    /** @type {shakaExtern.StoredContent} */
    let content = {
      offlineUri: offlineUri.toString(),
      originalManifestUri: manifestDB.originalManifestUri,
      duration: manifestDB.duration,
      size: manifestDB.size,
      expiration: manifestDB.expiration,
      tracks: tracks,
      appMetadata: metadata
    };

    return content;
  }
};
