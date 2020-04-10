/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.test.StreamingEngineUtil');

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
   * @param {function(string, number, number): BufferSource} getSegment Media
   *   segment generator: takes a content type, a Period number, and a segment
   *   position; returns a media segment.
   * @return {!Object} A NetworkingEngine look-alike.
   */
  static createFakeNetworkingEngine(getInitSegment, getSegment) {
    const netEngine = {
      request: jasmine.createSpy('request'),
      delays: {  // Artificial delays per content type, in seconds.
        audio: 0,
        video: 0,
        text: 0,
      },
    };

    netEngine.request.and.callFake((requestType, request) => {
      expect(requestType).toBeTruthy();
      expect(request.uris.length).toBe(1);

      const parts = request.uris[0].split('_');
      expect(parts.length).toBe(3);

      const periodIndex = Number(parts[0]);
      expect(periodIndex).not.toBeNaN();
      expect(periodIndex).toBeGreaterThan(-1);
      expect(Math.floor(periodIndex)).toBe(periodIndex);

      const contentType = parts[1];

      let buffer;
      if (parts[2] == 'init') {
        buffer = getInitSegment(contentType, periodIndex);
      } else {
        const position = Number(parts[2]);
        expect(position).not.toBeNaN();
        expect(position).toBeGreaterThan(-1);
        expect(Math.floor(position)).toBe(position);
        buffer = getSegment(contentType, periodIndex, position);
      }

      const response = {uri: request.uris[0], data: buffer, headers: {}};
      const p = new Promise((resolve) => {
        setTimeout(() => {
          resolve(response);
        }, netEngine.delays[contentType] * 1000);
      });
      return shaka.util.AbortableOperation.notAbortable(p);
    });

    netEngine.expectRequest = (uri, type) => {
      shaka.test.FakeNetworkingEngine.expectRequest(
          netEngine.request, uri, type);
    };

    netEngine.expectNoRequest = (uri, type) => {
      shaka.test.FakeNetworkingEngine.expectNoRequest(
          netEngine.request, uri, type);
    };

    netEngine.expectRangeRequest = (uri, startByte, endByte) => {
      shaka.test.FakeNetworkingEngine.expectRangeRequest(
          netEngine.request, uri, startByte, endByte);
    };

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
   * @param {number} segmentAvailabilityStart The initial value of
   *   |segmentAvailabilityStart|.
   * @param {number} segmentAvailabilityEnd The initial value of
   *   |segmentAvailabilityEnd|.
   * @param {number} presentationDuration
   * @param {number} maxSegmentDuration
   * @param {boolean} isLive
   * @return {!Object} A PresentationTimeline look-alike.
   *
   */
  static createFakePresentationTimeline(
      segmentAvailabilityStart, segmentAvailabilityEnd, presentationDuration,
      maxSegmentDuration, isLive) {
    const timeline = {
      getDuration: jasmine.createSpy('getDuration'),
      setDuration: jasmine.createSpy('setDuration'),
      getMaxSegmentDuration: jasmine.createSpy('getMaxSegmentDuration'),
      isLive: jasmine.createSpy('isLive'),
      getEarliestStart: jasmine.createSpy('getEarliestStart'),
      getSegmentAvailabilityStart:
          jasmine.createSpy('getSegmentAvailabilityStart'),
      getSegmentAvailabilityEnd:
          jasmine.createSpy('getSegmentAvailabilityEnd'),
      getSafeSeekRangeStart: jasmine.createSpy('getSafeSeekRangeStart'),
      getSeekRangeStart: jasmine.createSpy('getSeekRangeStart'),
      getSeekRangeEnd: jasmine.createSpy('getSeekRangeEnd'),
      segmentAvailabilityStart: segmentAvailabilityStart,
      segmentAvailabilityEnd: segmentAvailabilityEnd,
    };

    timeline.getDuration.and.returnValue(presentationDuration);

    timeline.getMaxSegmentDuration.and.returnValue(maxSegmentDuration);

    timeline.isLive.and.callFake(() => {
      return isLive;
    });

    timeline.getEarliestStart.and.callFake(() => {
      return timeline.segmentAvailabilityStart;
    });

    timeline.getSegmentAvailabilityStart.and.callFake(() => {
      return timeline.segmentAvailabilityStart;
    });

    timeline.getSegmentAvailabilityEnd.and.callFake(() => {
      return timeline.segmentAvailabilityEnd;
    });

    timeline.getSafeSeekRangeStart.and.callFake((delay) => {
      return shaka.test.Util.invokeSpy(timeline.getSegmentAvailabilityStart) +
          delay;
    });

    timeline.getSeekRangeStart.and.callFake(() => {
      return shaka.test.Util.invokeSpy(timeline.getSegmentAvailabilityStart);
    });

    timeline.getSeekRangeEnd.and.callFake(() => {
      return shaka.test.Util.invokeSpy(timeline.getSegmentAvailabilityEnd);
    });

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
   * @return {shaka.extern.Manifest}
   */
  static createManifest(
      presentationTimeline, periodStartTimes, presentationDuration,
      segmentDurations, initSegmentRanges) {
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
      const appendWindowStart = periodStartTimes[periodIndex];
      const appendWindowEnd = periodIndex == periodStartTimes.length - 1?
          presentationDuration : periodStartTimes[periodIndex + 1];

      return new shaka.media.SegmentReference(
          /* startTime= */ periodStart + positionWithinPeriod * d,
          /* endTime= */ periodStart + (positionWithinPeriod + 1) * d,
          getUris,
          /* startByte= */ 0,
          /* endByte= */ null,
          initSegmentReference,
          /* timestampOffset= */ 0,
          appendWindowStart,
          appendWindowEnd);
    };

    /** @type {shaka.extern.Manifest} */
    const manifest = {
      presentationTimeline,
      minBufferTime: 2,
      offlineSessionIds: [],
      variants: [],
      textStreams: [],
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
      primary: false,
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

      const createSegmentIndexSpy = jasmine.createSpy('createSegmentIndex');
      createSegmentIndexSpy.and.callFake(() => {
        stream.segmentIndex = segmentIndex;
        return Promise.resolve();
      });

      stream.createSegmentIndex =
          shaka.test.Util.spyFunc(createSegmentIndexSpy);
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
   * @return {!Object}
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
   * @return {!Object}
   */
  static createMockAudioStream(id) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    return {
      id: id,
      createSegmentIndex: jasmine.createSpy('createSegmentIndex'),
      segmentIndex: null,
      mimeType: 'audio/mp4',
      codecs: 'mp4a.40.2',
      bandwidth: 192000,
      type: ContentType.AUDIO,
      drmInfos: [],
    };
  }

  /**
   * Creates a mock video Stream.
   *
   * @param {number} id
   * @return {!Object}
   */
  static createMockVideoStream(id) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    return {
      id: id,
      createSegmentIndex: jasmine.createSpy('createSegmentIndex'),
      segmentIndex: null,
      mimeType: 'video/mp4',
      codecs: 'avc1.42c01e',
      bandwidth: 5000000,
      width: 600,
      height: 400,
      type: ContentType.VIDEO,
      drmInfos: [],
    };
  }

  /**
   * Creates a mock text Stream.
   *
   * @param {number} id
   * @return {!Object}
   */
  static createMockTextStream(id) {
    const ManifestParserUtils = shaka.util.ManifestParserUtils;
    return {
      id: id,
      createSegmentIndex: jasmine.createSpy('createSegmentIndex'),
      segmentIndex: null,
      mimeType: 'text/vtt',
      kind: ManifestParserUtils.TextStreamKind.SUBTITLE,
      type: ManifestParserUtils.ContentType.TEXT,
      drmInfos: [],
    };
  }
};
