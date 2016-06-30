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

goog.require('shaka.media.InitSegmentReference');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.media.PresentationTimeline');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.offline.DBEngine');
goog.require('shaka.offline.OfflineUtils');
goog.require('shaka.util.Error');



/**
 * Creates a new offline manifest parser.
 * @struct
 * @constructor
 * @implements {shakaExtern.ManifestParser}
 */
shaka.offline.OfflineManifestParser = function() {
};


/** @override */
shaka.offline.OfflineManifestParser.prototype.configure = function(config) {
  // No-op
};


/** @override */
shaka.offline.OfflineManifestParser.prototype.start =
    function(uri, networkingEngine, filterPeriod, onError) {
  var parts = /^offline:([0-9]+)$/.exec(uri);
  if (!parts) {
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Category.NETWORK,
        shaka.util.Error.Code.MALFORMED_OFFLINE_URI, uri));
  }
  var manifestId = Number(parts[1]);
  var dbEngine = new shaka.offline.DBEngine();

  return dbEngine.init(shaka.offline.OfflineUtils.DB_SCHEME)
      .then(function() { return dbEngine.get('manifest', manifestId); })
      .then(function(manifest) {
        if (!manifest) {
          throw new shaka.util.Error(
              shaka.util.Error.Category.STORAGE,
              shaka.util.Error.Code.REQUESTED_ITEM_NOT_FOUND, manifestId);
        }

        var OfflineManifestParser = shaka.offline.OfflineManifestParser;
        return OfflineManifestParser.reconstructManifest(manifest);
      })
      .then(
          function(ret) {
            return dbEngine.destroy().then(function() { return ret; });
          },
          function(err) {
            return dbEngine.destroy().then(function() { throw err; });
          });
};


/** @override */
shaka.offline.OfflineManifestParser.prototype.stop = function() {
  return Promise.resolve();
};


/**
 * Reconstructs a manifest object from the given database manifest.
 *
 * @param {shakaExtern.ManifestDB} manifest
 * @return {shakaExtern.Manifest}
 */
shaka.offline.OfflineManifestParser.reconstructManifest = function(
    manifest) {
  var timeline = new shaka.media.PresentationTimeline(null, 0);
  timeline.setDuration(manifest.duration);
  var drmInfos = manifest.drmInfo ? [manifest.drmInfo] : [];
  return {
    presentationTimeline: timeline,
    minBufferTime: 10,
    offlineSessionIds: manifest.sessionIds,
    periods: manifest.periods.map(function(period) {
      return {
        startTime: period.startTime,
        streamSets: period.streams.map(function(streamDb) {
          var refs = streamDb.segments.map(function(segment, i) {
            var getUris = function() { return [segment.uri]; };
            return new shaka.media.SegmentReference(
                i, segment.startTime, segment.endTime, getUris, 0, null);
          });
          timeline.notifySegments(period.startTime, refs);
          var segmentIndex = new shaka.media.SegmentIndex(refs);

          var initRef = streamDb.initSegmentUri ?
              new shaka.media.InitSegmentReference(
                  function() { return [streamDb.initSegmentUri]; }, 0, null) :
              null;
          var stream = {
            id: streamDb.id,
            createSegmentIndex: Promise.resolve.bind(Promise),
            findSegmentPosition: segmentIndex.find.bind(segmentIndex),
            getSegmentReference: segmentIndex.get.bind(segmentIndex),
            initSegmentReference: initRef,
            presentationTimeOffset: streamDb.presentationTimeOffset,
            mimeType: streamDb.mimeType,
            codecs: streamDb.codecs,
            bandwidth: 0,
            width: streamDb.width || undefined,
            height: streamDb.height || undefined,
            kind: streamDb.kind,
            encrypted: streamDb.encrypted,
            keyId: streamDb.keyId,
            allowedByApplication: true,
            allowedByKeySystem: true
          };
          var streamSet = {
            language: streamDb.language,
            type: streamDb.contentType,
            primary: streamDb.primary,
            drmInfos: drmInfos,
            streams: [stream]
          };
          return streamSet;
        })
      };
    })
  };
};


shaka.media.ManifestParser.registerParserByMime(
    'application/x-offline-manifest', shaka.offline.OfflineManifestParser);
