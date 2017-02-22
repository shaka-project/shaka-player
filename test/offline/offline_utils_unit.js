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

describe('OfflineUtils', function() {
  var OfflineUtils;
  var drmInfos;
  var timeline;

  beforeAll(function() {
    OfflineUtils = shaka.offline.OfflineUtils;
  });

  beforeEach(function() {
    drmInfos = [{
      keySystem: 'com.example.drm',
      licenseServerUri: 'https://example.com/drm',
      distinctiveIdentifierRequired: false,
      persistentStateRequired: true,
      audioRobustness: 'weak',
      videoRobustness: 'awesome',
      serverCertificate: null,
      initData: [{initData: new Uint8Array([1]), initDataType: 'foo'}],
      keyIds: ['key1', 'key2']
    }];
    timeline = new shaka.media.PresentationTimeline(null, 0);
  });

  describe('reconstructPeriod', function() {
    it('will reconstruct Periods correctly', function() {
      /** @type {shakaExtern.PeriodDB} */
      var periodDb = {
        startTime: 60,
        streams: [createVideoStreamDb(1), createAudioStreamDb(2)]
      };

      var period = OfflineUtils.reconstructPeriod(periodDb, drmInfos, timeline);
      expect(period).toBeTruthy();
      expect(period.startTime).toBe(periodDb.startTime);
      expect(period.textStreams).toEqual([]);
      expect(period.variants.length).toBe(1);

      var variant = period.variants[0];
      expect(variant.id).toEqual(jasmine.any(Number));
      expect(variant.language).toBe(periodDb.streams[1].language);
      expect(variant.primary).toBe(false);
      expect(variant.bandwidth).toEqual(jasmine.any(Number));
      expect(variant.drmInfos).toBe(drmInfos);
      expect(variant.allowedByApplication).toBe(true);
      expect(variant.allowedByKeySystem).toBe(true);

      verifyStream(variant.video, periodDb.streams[0]);
      verifyStream(variant.audio, periodDb.streams[1]);
    });

    it('supports video-only content', function() {
      /** @type {shakaExtern.PeriodDB} */
      var periodDb = {
        startTime: 60,
        streams: [createVideoStreamDb(1), createVideoStreamDb(2)]
      };

      var period = OfflineUtils.reconstructPeriod(periodDb, drmInfos, timeline);
      expect(period).toBeTruthy();
      expect(period.variants.length).toBe(2);
      expect(period.variants[0].audio).toBe(null);
      expect(period.variants[0].video).toBeTruthy();
    });

    it('supports audio-only content', function() {
      /** @type {shakaExtern.PeriodDB} */
      var periodDb = {
        startTime: 60,
        streams: [createAudioStreamDb(1), createAudioStreamDb(2)]
      };

      var period = OfflineUtils.reconstructPeriod(periodDb, drmInfos, timeline);
      expect(period).toBeTruthy();
      expect(period.variants.length).toBe(2);
      expect(period.variants[0].audio).toBeTruthy();
      expect(period.variants[0].video).toBe(null);
    });

    it('supports text streams', function() {
      /** @type {shakaExtern.PeriodDB} */
      var periodDb = {
        startTime: 60,
        streams: [
          createVideoStreamDb(1),
          createTextStreamDb(2)
        ]
      };

      var period = OfflineUtils.reconstructPeriod(periodDb, drmInfos, timeline);
      expect(period).toBeTruthy();
      expect(period.variants.length).toBe(1);
      expect(period.textStreams.length).toBe(1);

      verifyStream(period.textStreams[0], periodDb.streams[1]);
    });

    it('combines Variants according to variantIds field', function() {
      /** @type {shakaExtern.PeriodDB} */
      var periodDb = {
        startTime: 60,
        streams: [
          createVideoStreamDb(1, [10]),
          createVideoStreamDb(2, [11]),
          createVideoStreamDb(3, [12, 13]),
          createAudioStreamDb(4, [12]),
          createAudioStreamDb(5, [10, 13, 14])
        ]
      };

      var period = OfflineUtils.reconstructPeriod(periodDb, drmInfos, timeline);
      expect(period).toBeTruthy();
      expect(period.variants.length).toBe(3);

      verifyContainsVariantWithStreamIds(period, 1, 5);  // Variant 10
      verifyContainsVariantWithStreamIds(period, 3, 4);  // Variant 12
      verifyContainsVariantWithStreamIds(period, 3, 5);  // Variant 13
    });


    /**
     * @param {number} id
     * @param {!Array.<number>=} opt_variantIds
     * @return {shakaExtern.StreamDB}
     */
    function createVideoStreamDb(id, opt_variantIds) {
      var ContentType = shaka.util.ManifestParserUtils.ContentType;
      return {
        id: id,
        primary: false,
        presentationTimeOffset: 25,
        contentType: ContentType.VIDEO,
        mimeType: 'video/mp4',
        codecs: 'avc1.42c01e',
        frameRate: 22,
        kind: undefined,
        language: '',
        width: 250,
        height: 100,
        initSegmentUri: null,
        encrypted: true,
        keyId: 'key1',
        segments: [
          {startTime: 0, endTime: 10, uri: 'offline:1/1/1'},
          {startTime: 10, endTime: 20, uri: 'offline:1/1/2'},
          {startTime: 20, endTime: 25, uri: 'offline:1/1/3'}
        ],
        variantIds: opt_variantIds || [5]
      };
    }

    /**
     * @param {number} id
     * @param {!Array.<number>=} opt_variantIds
     * @return {shakaExtern.StreamDB}
     */
    function createAudioStreamDb(id, opt_variantIds) {
      var ContentType = shaka.util.ManifestParserUtils.ContentType;
      return {
        id: id,
        primary: false,
        presentationTimeOffset: 10,
        contentType: ContentType.AUDIO,
        mimeType: 'audio/mp4',
        codecs: 'mp4a.40.2',
        frameRate: undefined,
        kind: undefined,
        language: 'en',
        width: null,
        height: null,
        initSegmentUri: 'offline:1/' + id + '/0',
        encrypted: false,
        keyId: null,
        segments: [
          {startTime: 0, endTime: 10, uri: 'offline:1/' + id + '/1'},
          {startTime: 10, endTime: 20, uri: 'offline:1/' + id + '/2'},
          {startTime: 20, endTime: 25, uri: 'offline:1/' + id + '/3'}
        ],
        variantIds: opt_variantIds || [5]
      };
    }

    /**
     * @param {number} id
     * @return {shakaExtern.StreamDB}
     */
    function createTextStreamDb(id) {
      var ContentType = shaka.util.ManifestParserUtils.ContentType;
      return {
        id: id,
        primary: false,
        presentationTimeOffset: 10,
        contentType: ContentType.TEXT,
        mimeType: 'text/vtt',
        codecs: '',
        frameRate: undefined,
        kind: undefined,
        language: 'en',
        width: null,
        height: null,
        initSegmentUri: 'offline:1/' + id + '/0',
        encrypted: false,
        keyId: null,
        segments: [
          {startTime: 0, endTime: 10, uri: 'offline:1/' + id + '/1'},
          {startTime: 10, endTime: 20, uri: 'offline:1/' + id + '/2'},
          {startTime: 20, endTime: 25, uri: 'offline:1/' + id + '/3'}
        ],
        variantIds: [5]
      };
    }

    /**
     * @param {shakaExtern.Stream} stream
     * @param {shakaExtern.StreamDB} streamDb
     */
    function verifyStream(stream, streamDb) {
      if (!streamDb) {
        expect(stream).toBeFalsy();
        return;
      }

      var expectedStream = {
        id: jasmine.any(Number),
        createSegmentIndex: jasmine.any(Function),
        findSegmentPosition: jasmine.any(Function),
        getSegmentReference: jasmine.any(Function),
        initSegmentReference: streamDb.initSegmentUri ?
            jasmine.any(shaka.media.InitSegmentReference) :
            null,
        presentationTimeOffset: streamDb.presentationTimeOffset,
        mimeType: streamDb.mimeType,
        codecs: streamDb.codecs,
        frameRate: streamDb.frameRate,
        width: streamDb.width || undefined,
        height: streamDb.height || undefined,
        kind: streamDb.kind,
        encrypted: streamDb.encrypted,
        keyId: streamDb.keyId,
        language: streamDb.language,
        type: streamDb.contentType,
        primary: streamDb.primary,
        trickModeVideo: null,
        containsEmsgBoxes: false
      };
      expect(stream).toEqual(expectedStream);

      // Assume that we don't have to call createSegmentIndex.
      for (var i = 0; i < streamDb.segments.length; i++) {
        var segmentDb = streamDb.segments[i];
        expect(stream.findSegmentPosition(segmentDb.startTime)).toBe(i);
        expect(stream.findSegmentPosition(segmentDb.endTime - 0.1)).toBe(i);

        var segment = stream.getSegmentReference(i);
        expect(segment).toBeTruthy();
        expect(segment.position).toBe(i);
        expect(segment.startTime).toBe(segmentDb.startTime);
        expect(segment.endTime).toBe(segmentDb.endTime);
        expect(segment.startByte).toBe(0);
        expect(segment.endByte).toBe(null);
        expect(segment.getUris()).toEqual([segmentDb.uri]);
      }
    }

    /**
     * @param {shakaExtern.Period} period
     * @param {number} videoId
     * @param {number} audioId
     */
    function verifyContainsVariantWithStreamIds(period, videoId, audioId) {
      var found = period.variants.some(function(variant) {
        var audioIdMatches = variant.audio && variant.audio.id === audioId;
        var videoIdMatches = variant.video && variant.video.id === videoId;
        return audioIdMatches && videoIdMatches;
      });
      expect(found).toBe(true);
    }
  });
});
