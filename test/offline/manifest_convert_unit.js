/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('ManifestConverter', () => {
  describe('createVariants', () => {
    const audioType = 'audio';
    const videoType = 'video';

    it('will create variants with variant ids', () => {
      /** @type {!Array.<shaka.extern.StreamDB>} */
      const audios = [
        createStreamDB(0, audioType, [0]),
        createStreamDB(1, audioType, [1]),
      ];
      /** @type {!Array.<shaka.extern.StreamDB>} */
      const videos = [
        createStreamDB(2, videoType, [0]),
        createStreamDB(3, videoType, [1]),
      ];

      const timeline = createTimeline();

      /** @type {!Map.<number, shaka.extern.Variant>} */
      const variants = createConverter().createVariants(
          audios, videos, timeline);
      expect(variants.size).toBe(2);

      expect(variants.has(0)).toBeTruthy();
      expect(variants.get(0).audio.id).toBe(0);
      expect(variants.get(0).video.id).toBe(2);

      expect(variants.has(1)).toBeTruthy();
      expect(variants.get(1).audio.id).toBe(1);
      expect(variants.get(1).video.id).toBe(3);
    });

    it('will create variants when there is only audio', () => {
      /** @type {!Array.<shaka.extern.StreamDB>} */
      const audios = [
        createStreamDB(0, audioType, [0]),
        createStreamDB(1, audioType, [1]),
      ];
      /** @type {!Array.<shaka.extern.StreamDB>} */
      const videos = [];

      const timeline = createTimeline();

      /** @type {!Map.<number, shaka.extern.Variant>} */
      const variants = createConverter().createVariants(
          audios, videos, timeline);
      expect(variants.size).toBe(2);
    });

    it('will create variants when there is only video', () => {
      /** @type {!Array.<shaka.extern.StreamDB>} */
      const audios = [];
      /** @type {!Array.<shaka.extern.StreamDB>} */
      const videos = [
        createStreamDB(2, videoType, [0]),
        createStreamDB(3, videoType, [1]),
      ];

      const timeline = createTimeline();

      /** @type {!Map.<number, shaka.extern.Variant>} */
      const variants = createConverter().createVariants(
          audios, videos, timeline);
      expect(variants.size).toBe(2);
    });
  }); // describe('createVariants')

  describe('fromManifestDB', () => {
    it('will reconstruct Manifest correctly', () => {
      /** @type {shaka.extern.ManifestDB} */
      const manifestDb = {
        originalManifestUri: 'http://example.com/foo',
        duration: 60,
        size: 1234,
        expiration: Infinity,
        streams: [
          createVideoStreamDB(1, [0]),
          createAudioStreamDB(2, [0]),
        ],
        sessionIds: [1, 2, 3, 4],
        drmInfo: {
          keySystem: 'com.foo.bar',
          licenseServerUri: 'http://example.com/drm',
          distinctiveIdentifierRequired: true,
          persistentStateRequired: true,
          audioRobustness: 'very',
          videoRobustness: 'kinda_sorta',
          serverCertificate: new Uint8Array([1, 2, 3]),
          serverCertificateUri: '',
          sessionType: '',
          initData: [{
            initData: new Uint8Array([4, 5, 6]),
            initDataType: 'cenc',
            keyId: 'abc',
          }],
          keyIds: new Set([
            'abc',
            'def',
          ]),
        },
        appMetadata: null,
        creationTime: 0,
        sequenceMode: false,
      };

      const manifest = createConverter().fromManifestDB(manifestDb);
      expect(manifest.presentationTimeline.getDuration())
          .toBe(manifestDb.duration);
      expect(manifest.textStreams).toEqual([]);
      expect(manifest.offlineSessionIds).toEqual(manifestDb.sessionIds);
      expect(manifest.variants.length).toBe(1);

      const variant = manifest.variants[0];
      expect(variant.id).toEqual(jasmine.any(Number));
      expect(variant.language).toBe(manifestDb.streams[1].language);
      expect(variant.primary).toBe(false);
      expect(variant.bandwidth).toEqual(jasmine.any(Number));
      expect(variant.allowedByApplication).toBe(true);
      expect(variant.allowedByKeySystem).toBe(true);

      verifyStream(variant.video, manifestDb.streams[0], manifestDb.drmInfo);
      verifyStream(variant.audio, manifestDb.streams[1], manifestDb.drmInfo);
    });

    it('supports video-only content', () => {
      /** @type {shaka.extern.ManifestDB} */
      const manifestDb = {
        originalManifestUri: 'http://example.com/foo',
        duration: 60,
        size: 1234,
        expiration: Infinity,
        sessionIds: [],
        drmInfo: null,
        appMetadata: null,
        creationTime: 0,
        streams: [
          createVideoStreamDB(1, [0]),
          createVideoStreamDB(2, [1]),
        ],
        sequenceMode: false,
      };

      const manifest = createConverter().fromManifestDB(manifestDb);
      expect(manifest.variants.length).toBe(2);

      expect(manifest.variants[0].audio).toBe(null);
      expect(manifest.variants[0].video).toBeTruthy();

      expect(manifest.variants[1].audio).toBe(null);
      expect(manifest.variants[1].video).toBeTruthy();
    });

    it('supports audio-only content', () => {
      /** @type {shaka.extern.ManifestDB} */
      const manifestDb = {
        originalManifestUri: 'http://example.com/foo',
        duration: 60,
        size: 1234,
        expiration: Infinity,
        sessionIds: [],
        drmInfo: null,
        appMetadata: null,
        creationTime: 0,
        streams: [
          createAudioStreamDB(1, [0]),
          createAudioStreamDB(2, [1]),
        ],
        sequenceMode: false,
      };

      const manifest = createConverter().fromManifestDB(manifestDb);
      expect(manifest.variants.length).toBe(2);

      expect(manifest.variants[0].audio).toBeTruthy();
      expect(manifest.variants[0].video).toBe(null);

      expect(manifest.variants[1].audio).toBeTruthy();
      expect(manifest.variants[1].video).toBe(null);
    });

    it('supports containerless content', () => {
      /** @type {shaka.extern.ManifestDB} */
      const manifestDb = {
        originalManifestUri: 'http://example.com/foo',
        duration: 60,
        size: 1234,
        expiration: Infinity,
        sessionIds: [],
        drmInfo: null,
        appMetadata: null,
        creationTime: 0,
        streams: [
          createVideoStreamDB(1, [0]),
          createAudioStreamDB(2, [0]),
        ],
        sequenceMode: true,
      };

      const manifest = createConverter().fromManifestDB(manifestDb);
      expect(manifest.sequenceMode).toBe(true);
      expect(manifest.variants.length).toBe(1);
    });

    it('supports text streams', () => {
      /** @type {shaka.extern.ManifestDB} */
      const manifestDb = {
        originalManifestUri: 'http://example.com/foo',
        duration: 60,
        size: 1234,
        expiration: Infinity,
        sessionIds: [],
        drmInfo: null,
        appMetadata: null,
        creationTime: 0,
        streams: [
          createVideoStreamDB(1, [0]),
          createTextStreamDB(2),
        ],
        sequenceMode: false,
      };

      const manifest = createConverter().fromManifestDB(manifestDb);
      expect(manifest.variants.length).toBe(1);
      expect(manifest.textStreams.length).toBe(1);

      verifyStream(manifest.textStreams[0], manifestDb.streams[1]);
    });

    it('combines Variants according to variantIds field', () => {
      const audio1 = 0;
      const audio2 = 1;
      const video1 = 2;
      const video2 = 3;

      const variant1 = 0;
      const variant2 = 1;
      const variant3 = 2;

      /** @type {shaka.extern.ManifestDB} */
      const manifestDb = {
        originalManifestUri: 'http://example.com/foo',
        duration: 60,
        size: 1234,
        expiration: Infinity,
        sessionIds: [],
        drmInfo: null,
        appMetadata: null,
        creationTime: 0,
        streams: [
          // Audio
          createAudioStreamDB(audio1, [variant2]),
          createAudioStreamDB(audio2, [variant1, variant3]),

          // Video
          createVideoStreamDB(video1, [variant1]),
          createVideoStreamDB(video2, [variant2, variant3]),
        ],
        sequenceMode: false,
      };

      const manifest = createConverter().fromManifestDB(manifestDb);
      expect(manifest.variants.length).toBe(3);

      // Variant 1
      expect(findVariant(manifest.variants, audio2, video1)).toBeTruthy();
      // Variant 2
      expect(findVariant(manifest.variants, audio1, video2)).toBeTruthy();
      // Variant 3
      expect(findVariant(manifest.variants, audio2, video2)).toBeTruthy();
    });
  }); // describe('fromManifestDB')

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
   * @param {!Array.<number>} variantIds
   * @return {shaka.extern.StreamDB}
   */
  function createStreamDB(id, type, variantIds) {
    /** @type {shaka.extern.StreamDB} */
    const streamDB = {
      id,
      originalId: id.toString(),
      groupId: null,
      primary: false,
      type,
      mimeType: '',
      codecs: '',
      language: '',
      originalLanguage: null,
      label: null,
      width: null,
      height: null,
      encrypted: false,
      keyIds: new Set(),
      segments: [],
      variantIds,
      roles: [],
      forced: false,
      channelsCount: null,
      audioSamplingRate: null,
      spatialAudio: false,
      closedCaptions: null,
      external: false,
      fastSwitching: false,
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
    const segment = {
      startTime,
      endTime,
      dataKey,
      initSegmentKey: null,
      appendWindowStart: 0,
      appendWindowEnd: Infinity,
      timestampOffset: 0,
      tilesLayout: '',
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
      id,
      originalId: id.toString(),
      groupId: null,
      primary: false,
      type: ContentType.VIDEO,
      mimeType: 'video/mp4',
      codecs: 'avc1.42c01e',
      frameRate: 22,
      pixelAspectRatio: '59:54',
      hdr: undefined,
      videoLayout: undefined,
      kind: undefined,
      language: '',
      originalLanguage: null,
      label: null,
      width: 250,
      height: 100,
      encrypted: true,
      keyIds: new Set(['key1']),
      segments: [
        createSegmentDB(
            /* startTime= */ 0,
            /* endTime= */ 10,
            /* dataKey= */ 1),
        createSegmentDB(
            /* startTime= */ 10,
            /* endTime= */ 20,
            /* dataKey= */ 2),
        createSegmentDB(
            /* startTime= */ 20,
            /* endTime= */ 25,
            /* dataKey= */ 3),
      ],
      variantIds,
      roles: [],
      forced: false,
      channelsCount: null,
      audioSamplingRate: null,
      spatialAudio: false,
      closedCaptions: null,
      tilesLayout: undefined,
      accessibilityPurpose: null,
      external: false,
      fastSwitching: false,
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
      id,
      originalId: id.toString(),
      groupId: null,
      primary: false,
      type: ContentType.AUDIO,
      mimeType: 'audio/mp4',
      codecs: 'mp4a.40.2',
      frameRate: undefined,
      pixelAspectRatio: undefined,
      hdr: undefined,
      videoLayout: undefined,
      kind: undefined,
      language: 'en',
      originalLanguage: 'en',
      label: null,
      width: null,
      height: null,
      encrypted: false,
      keyIds: new Set(),
      segments: [
        createSegmentDB(
            /* startTime= */ 0,
            /* endTime= */ 10,
            /* dataKey= */ 1),
        createSegmentDB(
            /* startTime= */ 10,
            /* endTime= */ 20,
            /* dataKey= */ 2),
        createSegmentDB(
            /* startTime= */ 20,
            /* endTime= */ 25,
            /* dataKey= */ 3),
      ],
      variantIds,
      roles: [],
      forced: false,
      channelsCount: null,
      audioSamplingRate: null,
      spatialAudio: false,
      closedCaptions: null,
      tilesLayout: undefined,
      accessibilityPurpose: null,
      external: false,
      fastSwitching: false,
    };
  }

  /**
   * @param {number} id
   * @return {shaka.extern.StreamDB}
   */
  function createTextStreamDB(id) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    return {
      id,
      originalId: id.toString(),
      groupId: null,
      primary: false,
      type: ContentType.TEXT,
      mimeType: 'text/vtt',
      codecs: '',
      frameRate: undefined,
      pixelAspectRatio: undefined,
      hdr: undefined,
      videoLayout: undefined,
      kind: undefined,
      language: 'en',
      originalLanguage: 'en',
      label: null,
      width: null,
      height: null,
      encrypted: false,
      keyIds: new Set(),
      segments: [
        createSegmentDB(
            /* startTime= */ 0,
            /* endTime= */ 10,
            /* dataKey= */ 1),
        createSegmentDB(
            /* startTime= */ 10,
            /* endTime= */ 20,
            /* dataKey= */ 2),
        createSegmentDB(
            /* startTime= */ 20,
            /* endTime= */ 25,
            /* dataKey= */ 3),
      ],
      variantIds: [],
      roles: [],
      forced: false,
      channelsCount: null,
      audioSamplingRate: null,
      spatialAudio: false,
      closedCaptions: null,
      tilesLayout: undefined,
      accessibilityPurpose: null,
      external: false,
      fastSwitching: false,
    };
  }

  /**
   * @param {?shaka.extern.Stream} stream
   * @param {?shaka.extern.StreamDB} streamDb
   * @param {(?shaka.extern.DrmInfo)=} drmInfo
   */
  function verifyStream(stream, streamDb, drmInfo = null) {
    if (!streamDb) {
      expect(stream).toBeFalsy();
      return;
    }

    const expectedDrmInfos = streamDb.encrypted ? [drmInfo] : [];

    const expectedStream = {
      id: jasmine.any(Number),
      originalId: jasmine.any(String),
      groupId: streamDb.groupId,
      createSegmentIndex: jasmine.any(Function),
      segmentIndex: jasmine.any(shaka.media.SegmentIndex),
      mimeType: streamDb.mimeType,
      codecs: streamDb.codecs,
      frameRate: streamDb.frameRate,
      pixelAspectRatio: streamDb.pixelAspectRatio,
      hdr: streamDb.hdr,
      videoLayout: streamDb.videoLayout,
      width: streamDb.width || undefined,
      height: streamDb.height || undefined,
      kind: streamDb.kind,
      drmInfos: expectedDrmInfos,
      encrypted: streamDb.encrypted,
      keyIds: streamDb.keyIds,
      language: streamDb.language,
      originalLanguage: streamDb.originalLanguage,
      label: streamDb.label,
      type: streamDb.type,
      primary: streamDb.primary,
      trickModeVideo: null,
      emsgSchemeIdUris: null,
      roles: streamDb.roles,
      forced: streamDb.forced,
      channelsCount: streamDb.channelsCount,
      audioSamplingRate: streamDb.audioSamplingRate,
      spatialAudio: streamDb.spatialAudio,
      closedCaptions: streamDb.closedCaptions,
      tilesLayout: streamDb.tilesLayout,
      accessibilityPurpose: null,
      external: streamDb.external,
      fastSwitching: streamDb.fastSwitching,
    };

    expect(stream).toEqual(expectedStream);

    // Assume that we don't have to call createSegmentIndex.

    streamDb.segments.forEach((segmentDb, i) => {
      const uri = shaka.offline.OfflineUri.segment(
          'mechanism', 'cell', segmentDb.dataKey);

      const initSegmentReference = segmentDb.initSegmentKey != null ?
          jasmine.any(shaka.media.InitSegmentReference) :
          null;

      /** @type {shaka.media.SegmentReference} */
      const segment =
          stream.segmentIndex
              .getIteratorForTime(segmentDb.startTime).next().value;

      /** @type {shaka.media.SegmentReference} */
      const sameSegment =
          stream.segmentIndex
              .getIteratorForTime(segmentDb.endTime - 0.1).next().value;

      expect(segment).toBe(sameSegment);
      expect(segment.startTime).toBe(segmentDb.startTime);
      expect(segment.endTime).toBe(segmentDb.endTime);
      expect(segment.startByte).toBe(0);
      expect(segment.endByte).toBe(null);
      expect(segment.getUris()).toEqual([uri.toString()]);
      expect(segment.initSegmentReference).toEqual(initSegmentReference);
      expect(segment.timestampOffset).toBe(segmentDb.timestampOffset);
    });
  }

  /**
   * @param {!Array.<shaka.extern.Variant>} variants
   * @param {?number} audioId
   * @param {?number} videoId
   * @return {?shaka.extern.Variant}
   */
  function findVariant(variants, audioId, videoId) {
    for (const variant of variants) {
      /** @type {?shaka.extern.Stream} */
      const audio = variant.audio;
      /** @type {?shaka.extern.Stream} */
      const video = variant.video;

      /** @type {boolean } */
      const audioMatch = audio ? audioId == audio.id : audioId == null;
      /** @type {boolean } */
      const videoMatch = video ? videoId == video.id : videoId == null;

      if (audioMatch && videoMatch) {
        return variant;
      }
    }

    return null;
  }
});
