/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

shaka.test.StreamingEngineUtil = class {
  /**
   * Creates a FakeNetworkingEngine.
   *
   * For each request, the FakeNetworkingEngine parses the request's URI and
   * invokes one of the provided callbacks to obtain a response.
   *
   * A request's URI must follow either the init segment URI pattern:
   * PERIOD_TYPE_init, e.g., "1_audio_init" or "2_video_init"; or the media
   * segment URI pattern: PERIOD_TYPE_POSITION, e.g., "1_text_2" or "2_video_5".
   *
   * @param {function(string, number): BufferSource} getInitSegment Init segment
   *   generator: takes a content type and a Period number; returns an init
   *   segment.
   * @param {function(string, number, number): ?BufferSource} getSegment Media
   *   segment generator: takes a content type, a Period number, and a segment
   *   position; returns a media segment.
   * @param {{audio: number, video: number, text: number}} delays Artificial
   *   delays per content type, in seconds.
   * @return {!shaka.test.FakeNetworkingEngine}
   */
  static createFakeNetworkingEngine(getInitSegment, getSegment, delays) {
    const netEngine = new shaka.test.FakeNetworkingEngine();

    netEngine.request.and.callFake((requestType, request, context) => {
      expect(requestType).toBeTruthy();
      expect(request.uris.length).toBe(1);

      const parts = request.uris[0].split('_');
      expect(parts.length).toBeGreaterThanOrEqual(3);

      const periodIndex = Number(parts[0]);
      expect(periodIndex).not.toBeNaN();
      expect(periodIndex).toBeGreaterThan(-1);
      expect(Math.floor(periodIndex)).toBe(periodIndex);

      const contentType = parts[1];

      let buffer;
      const chunkedData = new Uint8Array([
        0x00, 0x00, 0x00, 0x0C, // size
        0x6d, 0x64, 0x61, 0x74, // type: mdat
        0x00, 0x11, 0x22, 0x33, // payload
      ]);

      if (parts[2] == 'init') {
        buffer = getInitSegment(contentType, periodIndex);
      } else {
        const position = Number(parts[2]);
        expect(position).not.toBeNaN();
        expect(position).toBeGreaterThan(-1);
        expect(Math.floor(position)).toBe(position);
        buffer = getSegment(contentType, periodIndex, position);

        // Mock that each segment request gets the response of a ReadableStream
        // with two chunks of data, each contains one MDAT box.
        // The streamDataCallback function gets called twice.
        if (request.streamDataCallback) {
          request.streamDataCallback(chunkedData);
          request.streamDataCallback(chunkedData);
        }

        if (buffer == null) {
          return shaka.util.AbortableOperation.failed(new shaka.util.Error(
              shaka.util.Error.Severity.CRITICAL,
              shaka.util.Error.Category.NETWORK,
              shaka.util.Error.Code.BAD_HTTP_STATUS,
              '', 404));
        }
      }

      const response = {uri: request.uris[0], data: buffer, headers: {}};
      const p = new Promise((resolve) => {
        setTimeout(() => {
          resolve(response);
        }, delays[contentType] * 1000);
      });
      return shaka.util.AbortableOperation.notAbortable(p);
    });

    return netEngine;
  }

  /**
   * Creates a fake PresentationTimeline.
   *
   * The FakePresentationTimeline has two special properties:
   * |segmentAvailabilityStart| and |segmentAvailabilityEnd|, which set the
   * return value of getSegmentAvailabilityStart() and
   * getSegmentAvailabilityEnd() respectively.
   *
   * @param {{start: number, end: number}} segmentAvailability The segment
   *   availability window, which the caller can adjust by reference during a
   *   test.
   * @param {number} presentationDuration
   * @param {number} maxSegmentDuration
   * @param {boolean} isLive
   * @return {!shaka.test.FakePresentationTimeline} A PresentationTimeline
   *   look-alike.
   */
  static createFakePresentationTimeline(
      segmentAvailability, presentationDuration, maxSegmentDuration, isLive) {
    const timeline = new shaka.test.FakePresentationTimeline();

    timeline.getDuration.and.returnValue(presentationDuration);
    timeline.getMaxSegmentDuration.and.returnValue(maxSegmentDuration);
    timeline.isLive.and.returnValue(isLive);
    timeline.isInProgress.and.returnValue(false);

    timeline.getSeekRangeStart.and.callFake(
        () => segmentAvailability.start);

    timeline.getSeekRangeEnd.and.callFake(
        () => segmentAvailability.end);

    timeline.getSegmentAvailabilityStart.and.callFake(
        () => segmentAvailability.start);

    timeline.getSegmentAvailabilityEnd.and.callFake(
        () => segmentAvailability.end);

    return timeline;
  }

  /**
   * Creates a fake Manifest simulating one or more DASH periods, containing
   * one variant and optionally one text stream.  The streams we create are
   * based on the keys in segmentDurations.
   *
   * Audio, Video, and Text Stream MIME types are set to
   * "audio/mp4; codecs=mp4a.40.2", "video/mp4; codecs=avc1.42c01e",
   * and "text/vtt" respectively.
   *
   * Each media segment's URI follows the media segment URI pattern:
   * PERIOD_TYPE_POSITION, e.g., "1_text_2" or "2_video_5".
   *
   * @param {!shaka.media.PresentationTimeline} presentationTimeline
   * @param {!Array.<number>} periodStartTimes The start time of each Period.
   * @param {number} presentationDuration
   * @param {!Object.<string, number>} segmentDurations The duration of each
   *   type of segment.
   * @param {!Object.<string, !Array.<number>>} initSegmentRanges The byte
   *   ranges for each type of init segment.
   * @param {!Object.<string,number>=} timestampOffsets The timestamp offset
   *  for each type of segment
   * @param {shaka.extern.aes128Key=} aes128Key The AES-128 key to provide
   *  to streams, if desired.
   * @return {shaka.extern.Manifest}
   */
  static createManifest(
      presentationTimeline, periodStartTimes, presentationDuration,
      segmentDurations, initSegmentRanges, timestampOffsets, aes128Key) {
    const Util = shaka.test.Util;

    /**
     * @param {string} type
     * @param {number} time
     * @return {?number} A segment position.
     */
    const find = (type, time) => {
      if (time >= presentationDuration || time < 0) {
        return null;
      }

      // Note that we don't just directly compute the segment position because
      // a period start time could be in the middle of the previous period's
      // last segment.
      let position = 0;
      let i;
      for (i = 0; i < periodStartTimes.length; ++i) {
        const startTime = periodStartTimes[i];
        const nextStartTime = i < periodStartTimes.length - 1 ?
            periodStartTimes[i + 1] :
            presentationDuration;
        if (nextStartTime > time) {
          // This is the period in which we would find the requested time.
          break;
        }

        // This is an earlier period.  Count up the number of segments in it.
        const periodDuration = nextStartTime - startTime;
        const numSegments = Math.ceil(periodDuration / segmentDurations[type]);
        position += numSegments;
      }

      goog.asserts.assert(i < periodStartTimes.length, 'Ran out of periods!');
      const periodStartTime = periodStartTimes[i];
      const periodTime = time - periodStartTime;
      position += Math.floor(periodTime / segmentDurations[type]);

      return position;
    };

    /**
     * @param {string} type
     * @param {number} position
     * @return {shaka.media.SegmentReference} A SegmentReference.
     */
    const get = (type, position) => {
      // Note that we don't just directly compute the segment position because
      // a period start time could be in the middle of the previous period's
      // last segment.
      let periodFirstPosition = 0;
      let i;
      for (i = 0; i < periodStartTimes.length; ++i) {
        const startTime = periodStartTimes[i];
        const nextStartTime = i < periodStartTimes.length - 1 ?
            periodStartTimes[i + 1] :
            presentationDuration;

        // Count up the number of segments in this period.
        const periodDuration = nextStartTime - startTime;
        const numSegments = Math.ceil(periodDuration / segmentDurations[type]);

        const nextPeriodFirstPosition = periodFirstPosition + numSegments;

        if (nextPeriodFirstPosition > position) {
          // This is the period in which we would find the requested position.
          break;
        }

        periodFirstPosition = nextPeriodFirstPosition;
      }
      if (i == periodStartTimes.length) {
        return null;
      }

      const periodIndex = i;  // 0-based
      const positionWithinPeriod = position - periodFirstPosition;

      const initSegmentUri = periodIndex + '_' + type + '_init';

      // The type can be 'text', 'audio', 'video', or 'trickvideo',
      // but we pull video init segment metadata from the 'video' part of the
      // structure for trick-mode videos.  Here we normalize the type so that
      // 'trickvideo' becomes 'video' when we access the init segment range.
      const normalizedType = type == 'trickvideo' ? 'video' : type;
      const initRange = initSegmentRanges[normalizedType];

      let initSegmentReference = null;
      if (initRange) {
        initSegmentReference = new shaka.media.InitSegmentReference(
            () => [initSegmentUri], initRange[0], initRange[1]);
      }

      const d = segmentDurations[type];
      const getUris = () => [periodIndex + '_' + type + '_' + position];
      const periodStart = periodStartTimes[periodIndex];
      const timestampOffset = (timestampOffsets && timestampOffsets[type]) || 0;
      const appendWindowStart = periodStartTimes[periodIndex];
      const appendWindowEnd = periodIndex == periodStartTimes.length - 1?
          presentationDuration : periodStartTimes[periodIndex + 1];

      const ref = new shaka.media.SegmentReference(
          /* startTime= */ periodStart + positionWithinPeriod * d,
          /* endTime= */ periodStart + (positionWithinPeriod + 1) * d,
          getUris,
          /* startByte= */ 0,
          /* endByte= */ null,
          initSegmentReference,
          timestampOffset,
          appendWindowStart,
          appendWindowEnd);
      const ContentType = shaka.util.ManifestParserUtils.ContentType;
      if (aes128Key &&
          (type == ContentType.AUDIO || type == ContentType.VIDEO)) {
        ref.aes128Key = aes128Key;
      }
      return ref;
    };

    /** @type {shaka.extern.Manifest} */
    const manifest = {
      presentationTimeline,
      minBufferTime: 2,
      offlineSessionIds: [],
      variants: [],
      textStreams: [],
      imageStreams: [],
      sequenceMode: false,
      ignoreManifestTimestampsInSegmentsMode: false,
      type: 'UNKNOWN',
      serviceDescription: null,
    };

    /** @type {shaka.extern.Variant} */
    const variant = {
      video: null,
      audio: null,
      allowedByApplication: true,
      allowedByKeySystem: true,
      bandwidth: 0,
      id: 0,
      language: 'und',
      disabledUntilTime: 0,
      primary: false,
      decodingInfos: [],
    };

    if ('video' in segmentDurations) {
      variant.video = /** @type {shaka.extern.Stream} */(
        shaka.test.StreamingEngineUtil.createMockStream('video', 0));
    }

    if ('audio' in segmentDurations) {
      variant.audio = /** @type {shaka.extern.Stream} */(
        shaka.test.StreamingEngineUtil.createMockStream('audio', 1));
    }

    /** @type {?shaka.extern.Stream} */
    let textStream = null;

    if ('text' in segmentDurations) {
      textStream = /** @type {shaka.extern.Stream} */(
        shaka.test.StreamingEngineUtil.createMockStream('text', 2));
    }

    /** @type {?shaka.extern.Stream} */
    let trickModeVideo = null;

    if ('trickvideo' in segmentDurations) {
      trickModeVideo = /** @type {shaka.extern.Stream} */(
        shaka.test.StreamingEngineUtil.createMockStream('video', 3));
    }

    // Populate the Manifest.
    for (const type in segmentDurations) {
      const ContentType = shaka.util.ManifestParserUtils.ContentType;
      let stream;
      if (type == ContentType.TEXT) {
        stream = textStream;
      } else if (type == ContentType.AUDIO) {
        stream = variant.audio;
      } else if (type == 'trickvideo') {
        stream = trickModeVideo;
      } else {
        stream = variant.video;
      }

      const segmentIndex = new shaka.test.FakeSegmentIndex();
      segmentIndex.find.and.callFake((time) => find(type, time));
      segmentIndex.get.and.callFake((pos) => get(type, pos));

      const createSegmentIndexSpy = Util.funcSpy(stream.createSegmentIndex);
      createSegmentIndexSpy.and.callFake(() => {
        stream.segmentIndex = segmentIndex;
        return Promise.resolve();
      });
    }

    if (trickModeVideo) {
      variant.video.trickModeVideo = trickModeVideo;
    }
    if (textStream) {
      manifest.textStreams = [textStream];
    }
    manifest.variants = [variant];

    return manifest;
  }

  /**
   * Creates a mock Stream of the given type.
   *
   * @param {string} type
   * @param {number} id
   * @return {shaka.extern.Stream}
   */
  static createMockStream(type, id) {
    return {
      audio: shaka.test.StreamingEngineUtil.createMockAudioStream,
      video: shaka.test.StreamingEngineUtil.createMockVideoStream,
      trickvideo: shaka.test.StreamingEngineUtil.createMockVideoStream,
      text: shaka.test.StreamingEngineUtil.createMockTextStream,
    }[type](id);
  }

  /**
   * Creates a mock audio Stream.
   *
   * @param {number} id
   * @return {shaka.extern.Stream}
   */
  static createMockAudioStream(id) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const Util = shaka.test.Util;

    return {
      id: id,
      originalId: id.toString(),
      groupId: null,
      createSegmentIndex: Util.spyFunc(jasmine.createSpy('createSegmentIndex')),
      segmentIndex: null,
      mimeType: 'audio/mp4',
      codecs: 'mp4a.40.2',
      bandwidth: 192000,
      type: ContentType.AUDIO,
      label: '',
      language: 'und',
      originalLanguage: null,
      drmInfos: [],
      encrypted: false,
      keyIds: new Set(),
      audioSamplingRate: 44100,
      channelsCount: 2,
      closedCaptions: null,
      emsgSchemeIdUris: null,
      primary: false,
      roles: [],
      forced: false,
      spatialAudio: false,
      accessibilityPurpose: null,
      external: false,
      fastSwitching: false,
    };
  }

  /**
   * Creates a mock video Stream.
   *
   * @param {number} id
   * @param {string=} mimeType
   * @return {shaka.extern.Stream}
   */
  static createMockVideoStream(id, mimeType='video/mp4') {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const Util = shaka.test.Util;

    return {
      id: id,
      originalId: id.toString(),
      groupId: null,
      createSegmentIndex: Util.spyFunc(jasmine.createSpy('createSegmentIndex')),
      segmentIndex: null,
      mimeType: mimeType,
      codecs: 'avc1.42c01e',
      bandwidth: 5000000,
      width: 600,
      height: 400,
      type: ContentType.VIDEO,
      label: '',
      language: 'und',
      originalLanguage: null,
      drmInfos: [],
      encrypted: false,
      keyIds: new Set(),
      audioSamplingRate: null,
      channelsCount: null,
      closedCaptions: null,
      emsgSchemeIdUris: null,
      primary: false,
      roles: [],
      forced: false,
      spatialAudio: false,
      accessibilityPurpose: null,
      external: false,
      fastSwitching: false,
    };
  }

  /**
   * Creates a mock text Stream.
   *
   * @param {number} id
   * @return {shaka.extern.Stream}
   */
  static createMockTextStream(id) {
    const ManifestParserUtils = shaka.util.ManifestParserUtils;
    const Util = shaka.test.Util;

    return {
      id: id,
      originalId: id.toString(),
      groupId: null,
      createSegmentIndex: Util.spyFunc(jasmine.createSpy('createSegmentIndex')),
      segmentIndex: null,
      mimeType: 'text/vtt',
      codecs: '',
      kind: ManifestParserUtils.TextStreamKind.SUBTITLE,
      type: ManifestParserUtils.ContentType.TEXT,
      label: '',
      language: 'und',
      originalLanguage: null,
      drmInfos: [],
      encrypted: false,
      keyIds: new Set(),
      audioSamplingRate: null,
      channelsCount: null,
      closedCaptions: null,
      emsgSchemeIdUris: null,
      primary: false,
      roles: [],
      forced: false,
      spatialAudio: false,
      accessibilityPurpose: null,
      external: false,
      fastSwitching: false,
    };
  }
};
