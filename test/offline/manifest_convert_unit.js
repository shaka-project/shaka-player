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

describe('ManifestConverter', function() {
  describe('createVariants', function() {
    const audioType = 'audio';
    const videoType = 'video';

    it('will create variants with variant ids', function() {
      /** @type {!Array.<shaka.extern.StreamDB>} */
      let audios = [
        createStreamDB(0, audioType, [0]),
        createStreamDB(1, audioType, [1]),
      ];
      /** @type {!Array.<shaka.extern.StreamDB>} */
      let videos = [
        createStreamDB(2, videoType, [0]),
        createStreamDB(3, videoType, [1]),
      ];

      /** @type {!Map.<number, shaka.extern.Variant>} */
      const variants = createConverter().createVariants(audios, videos);
      expect(variants.size).toBe(2);

      expect(variants.has(0)).toBeTruthy();
      expect(variants.get(0).audio.id).toBe(0);
      expect(variants.get(0).video.id).toBe(2);

      expect(variants.has(1)).toBeTruthy();
      expect(variants.get(1).audio.id).toBe(1);
      expect(variants.get(1).video.id).toBe(3);
    });

    it('will create variants when there is only audio', function() {
      /** @type {!Array.<shaka.extern.StreamDB>} */
      let audios = [
        createStreamDB(0, audioType, [0]),
        createStreamDB(1, audioType, [1]),
      ];
      /** @type {!Array.<shaka.extern.StreamDB>} */
      let videos = [];

      /** @type {!Map.<number, shaka.extern.Variant>} */
      const variants = createConverter().createVariants(audios, videos);
      expect(variants.size).toBe(2);
    });

    it('will create variants when there is only video', function() {
      /** @type {!Array.<shaka.extern.StreamDB>} */
      let audios = [];
      /** @type {!Array.<shaka.extern.StreamDB>} */
      let videos = [
        createStreamDB(2, videoType, [0]),
        createStreamDB(3, videoType, [1]),
      ];

      /** @type {!Map.<number, shaka.extern.Variant>} */
      const variants = createConverter().createVariants(audios, videos);
      expect(variants.size).toBe(2);
    });
  }); // describe('createVariants')

  describe('fromPeriodDB', function() {
    it('will reconstruct Periods correctly', function() {
      /** @type {shaka.extern.PeriodDB} */
      let periodDb = {
        startTime: 60,
        streams: [createVideoStreamDB(1, [0]), createAudioStreamDB(2, [0])],
      };

      let timeline = createTimeline();

      let period = createConverter().fromPeriodDB(periodDb, timeline);
      expect(period).toBeTruthy();
      expect(period.startTime).toBe(periodDb.startTime);
      expect(period.textStreams).toEqual([]);
      expect(period.variants.length).toBe(1);

      let variant = period.variants[0];
      expect(variant.id).toEqual(jasmine.any(Number));
      expect(variant.language).toBe(periodDb.streams[1].language);
      expect(variant.primary).toBe(false);
      expect(variant.bandwidth).toEqual(jasmine.any(Number));
      expect(variant.allowedByApplication).toBe(true);
      expect(variant.allowedByKeySystem).toBe(true);

      verifyStream(variant.video, periodDb.streams[0]);
      verifyStream(variant.audio, periodDb.streams[1]);
    });

    it('supports video-only content', function() {
      /** @type {shaka.extern.PeriodDB} */
      let periodDb = {
        startTime: 60,
        streams: [createVideoStreamDB(1, [0]), createVideoStreamDB(2, [1])],
      };

      let timeline = createTimeline();

      let period = createConverter().fromPeriodDB(periodDb, timeline);
      expect(period).toBeTruthy();
      expect(period.variants.length).toBe(2);
      expect(period.variants[0].audio).toBe(null);
      expect(period.variants[0].video).toBeTruthy();
    });

    it('supports audio-only content', function() {
      /** @type {shaka.extern.PeriodDB} */
      let periodDb = {
        startTime: 60,
        streams: [createAudioStreamDB(1, [0]), createAudioStreamDB(2, [1])],
      };

      let timeline = createTimeline();

      let period = createConverter().fromPeriodDB(periodDb, timeline);
      expect(period).toBeTruthy();
      expect(period.variants.length).toBe(2);
      expect(period.variants[0].audio).toBeTruthy();
      expect(period.variants[0].video).toBe(null);
    });

    it('supports text streams', function() {
      /** @type {shaka.extern.PeriodDB} */
      let periodDb = {
        startTime: 60,
        streams: [
          createVideoStreamDB(1, [0]),
          createTextStreamDB(2),
        ],
      };

      let timeline = createTimeline();

      let period = createConverter().fromPeriodDB(periodDb, timeline);
      expect(period).toBeTruthy();
      expect(period.variants.length).toBe(1);
      expect(period.textStreams.length).toBe(1);

      verifyStream(period.textStreams[0], periodDb.streams[1]);
    });

    it('combines Variants according to variantIds field', function() {
      const audio1 = 0;
      const audio2 = 1;
      const video1 = 2;
      const video2 = 3;

      const variant1 = 0;
      const variant2 = 1;
      const variant3 = 2;

      /** @type {shaka.extern.PeriodDB} */
      let periodDb = {
        startTime: 60,
        streams: [
          // Audio
          createAudioStreamDB(audio1, [variant2]),
          createAudioStreamDB(audio2, [variant1, variant3]),

          // Video
          createVideoStreamDB(video1, [variant1]),
          createVideoStreamDB(video2, [variant2, variant3]),
        ],
      };

      let timeline = createTimeline();

      /** @type {shaka.extern.Period} */
      let period = createConverter().fromPeriodDB(periodDb, timeline);

      expect(period).toBeTruthy();
      expect(period.variants.length).toBe(3);

      // Variant 1
      expect(findVariant(period.variants, audio2, video1)).toBeTruthy();
      // Variant 2
      expect(findVariant(period.variants, audio1, video2)).toBeTruthy();
      // Variant 3
      expect(findVariant(period.variants, audio2, video2)).toBeTruthy();
    });
  }); // describe('fromPeriodDB')

  /** @return {!shaka.offline.ManifestConverter} */
  function createConverter() {
    return new shaka.offline.ManifestConverter('mechanism', 'cell');
  }

  /** @return {!shaka.media.PresentationTimeline} */
  function createTimeline() {
    return new shaka.media.PresentationTimeline(null, 0);
  }

  /**
   * @param {number} id
   * @param {string} type
   * @param {!Array.<number>} variants
   * @return {shaka.extern.StreamDB}
   */
  function createStreamDB(id, type, variants) {
    /** @type {shaka.extern.StreamDB} */
    let streamDB = {
      id: id,
      originalId: id.toString(),
      primary: false,
      presentationTimeOffset: 0,
      contentType: type,
      mimeType: '',
      codecs: '',
      language: '',
      label: null,
      width: null,
      height: null,
      initSegmentKey: null,
      encrypted: false,
      keyId: null,
      segments: [],
      variantIds: variants,
    };

    return streamDB;
  }

  /**
   * @param {number} startTime
   * @param {number} endTime
   * @param {number} dataKey
   * @return {shaka.extern.SegmentDB}
   */
  function createSegmentDB(startTime, endTime, dataKey) {
    /** @type {shaka.extern.SegmentDB} */
    let segment = {
      startTime: startTime,
      endTime: endTime,
      dataKey: dataKey,
    };

    return segment;
  }

  /**
   * @param {number} id
   * @param {!Array.<number>} variantIds
   * @return {shaka.extern.StreamDB}
   */
  function createVideoStreamDB(id, variantIds) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    return {
      id: id,
      originalId: id.toString(),
      primary: false,
      presentationTimeOffset: 25,
      contentType: ContentType.VIDEO,
      mimeType: 'video/mp4',
      codecs: 'avc1.42c01e',
      frameRate: 22,
      kind: undefined,
      language: '',
      label: null,
      width: 250,
      height: 100,
      initSegmentKey: null,
      encrypted: true,
      keyId: 'key1',
      segments: [
        createSegmentDB(
            /* start time */ 0,
            /* end time */ 10,
            /* data key */ 1),
        createSegmentDB(
            /* start time */ 10,
            /* end time */ 20,
            /* data key */ 2),
        createSegmentDB(
            /* start time */ 20,
            /* end time */ 25,
            /* data key */ 3),
      ],
      variantIds: variantIds,
    };
  }

  /**
   * @param {number} id
   * @param {!Array.<number>} variantIds
   * @return {shaka.extern.StreamDB}
   */
  function createAudioStreamDB(id, variantIds) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    return {
      id: id,
      originalId: id.toString(),
      primary: false,
      presentationTimeOffset: 10,
      contentType: ContentType.AUDIO,
      mimeType: 'audio/mp4',
      codecs: 'mp4a.40.2',
      frameRate: undefined,
      kind: undefined,
      language: 'en',
      label: null,
      width: null,
      height: null,
      initSegmentKey: 0,
      encrypted: false,
      keyId: null,
      segments: [
        createSegmentDB(
            /* start time */ 0,
            /* end time */ 10,
            /* data key */ 1),
        createSegmentDB(
            /* start time */ 10,
            /* end time */ 20,
            /* data key */ 2),
        createSegmentDB(
            /* start time */ 20,
            /* end time */ 25,
            /* data key */ 3),
      ],
      variantIds: variantIds,
    };
  }

  /**
   * @param {number} id
   * @return {shaka.extern.StreamDB}
   */
  function createTextStreamDB(id) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    return {
      id: id,
      originalId: id.toString(),
      primary: false,
      presentationTimeOffset: 10,
      contentType: ContentType.TEXT,
      mimeType: 'text/vtt',
      codecs: '',
      frameRate: undefined,
      kind: undefined,
      language: 'en',
      label: null,
      width: null,
      height: null,
      initSegmentKey: 0,
      encrypted: false,
      keyId: null,
      segments: [
        createSegmentDB(
            /* start time */ 0,
            /* end time */ 10,
            /* data key */ 1),
        createSegmentDB(
            /* start time */ 10,
            /* end time */ 20,
            /* data key */ 2),
        createSegmentDB(
            /* start time */ 20,
            /* end time */ 25,
            /* data key */ 3),
      ],
      variantIds: [5],
    };
  }

  /**
   * @param {?shaka.extern.Stream} stream
   * @param {?shaka.extern.StreamDB} streamDb
   */
  function verifyStream(stream, streamDb) {
    if (!streamDb) {
      expect(stream).toBeFalsy();
      return;
    }

    let expectedStream = {
      id: jasmine.any(Number),
      originalId: jasmine.any(String),
      createSegmentIndex: jasmine.any(Function),
      findSegmentPosition: jasmine.any(Function),
      getSegmentReference: jasmine.any(Function),
      initSegmentReference: streamDb.initSegmentKey != null ?
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
      label: streamDb.label,
      type: streamDb.contentType,
      primary: streamDb.primary,
      trickModeVideo: null,
      emsgSchemeIdUris: null,
      roles: [],
      channelsCount: null,
      closedCaptions: null,
    };

    expect(stream).toEqual(expectedStream);

    // Assume that we don't have to call createSegmentIndex.

    streamDb.segments.forEach(function(segmentDb, i) {
      let uri = shaka.offline.OfflineUri.segment(
          'mechanism', 'cell', segmentDb.dataKey);

      expect(stream.findSegmentPosition(segmentDb.startTime)).toBe(i);
      expect(stream.findSegmentPosition(segmentDb.endTime - 0.1)).toBe(i);

      /** @type {shaka.media.SegmentReference} */
      let segment = stream.getSegmentReference(i);
      expect(segment).toBeTruthy();
      expect(segment.position).toBe(i);
      expect(segment.startTime).toBe(segmentDb.startTime);
      expect(segment.endTime).toBe(segmentDb.endTime);
      expect(segment.startByte).toBe(0);
      expect(segment.endByte).toBe(null);
      expect(segment.getUris()).toEqual([uri.toString()]);
    });
  }

  /**
   * @param {!Array.<shaka.extern.Variant>} variants
   * @param {?number} audioId
   * @param {?number} videoId
   * @return {?shaka.extern.Variant}
   */
  function findVariant(variants, audioId, videoId) {
    /** @type {?shaka.extern.Variant} */
    let found = null;

    variants.forEach(function(variant) {
      /** @type {?shaka.extern.Stream} */
      let audio = variant.audio;
      /** @type {?shaka.extern.Stream} */
      let video = variant.video;

      /** @type {boolean } */
      let audioMatch = audio ? audioId == audio.id : audioId == null;
      /** @type {boolean } */
      let videoMatch = video ? videoId == video.id : videoId == null;

      if (audioMatch && videoMatch) {
        found = variant;
      }
    });

    return found;
  }
});
