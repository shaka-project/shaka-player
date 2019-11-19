/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.test.StreamingEngineUtil');

goog.require('shaka.util.Iterables');


shaka.test.StreamingEngineUtil = class {
  /**
   * Creates a FakeNetworkingEngine.
   *
   * For each request, the FakeNetworkingEngine parses the request's URI and
   * invokes one of the provided callbacks to obtain a response.
   *
   * A request's URI must follow either the init segment URI pattern:
   * PERIOD_TYPE_init, e.g., "1_audio_init" or "2_video_init"; or the media
   * segment URI pattern: PERIOD_TYPE_POSITION, e.g., "1_text_2" or "2_video_1".
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

      const periodNumber = Number(parts[0]);
      expect(periodNumber).not.toBeNaN();
      expect(periodNumber).toBeGreaterThan(0);
      expect(Math.floor(periodNumber)).toBe(periodNumber);

      const contentType = parts[1];

      let buffer;
      if (parts[2] == 'init') {
        buffer = getInitSegment(contentType, periodNumber);
      } else {
        const position = Number(parts[2]);
        expect(position).not.toBeNaN();
        expect(position).toBeGreaterThan(0);
        expect(Math.floor(position)).toBe(position);
        buffer = getSegment(contentType, periodNumber, position);
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
   * Creates a fake Manifest.
   *
   * Each Period within the fake Manifest has one Variant and one
   * text stream.
   *
   * Audio, Video, and Text Stream MIME types are set to
   * "audio/mp4; codecs=mp4a.40.2", "video/mp4; codecs=avc1.42c01e",
   * and "text/vtt" respectively.
   *
   * Each media segment's URI follows the media segment URI pattern:
   * PERIOD_TYPE_POSITION, e.g., "1_text_2" or "2_video_1".
   *
   * @param {!Array.<number>} periodStartTimes The start time of each Period.
   * @param {number} presentationDuration
   * @param {!Object.<string, number>} segmentDurations The duration of each
   *   type of segment.
   * @param {!Object.<string, !Array.<number>>} initSegmentRanges The byte
   *   ranges for each type of init segment.
   * @return {shaka.extern.Manifest}
   */
  static createManifest(
      periodStartTimes, presentationDuration, segmentDurations,
      initSegmentRanges) {
    const boundsCheckPosition = (time, period, pos) =>
      shaka.test.StreamingEngineUtil.boundsCheckPosition(
          periodStartTimes, presentationDuration, segmentDurations, time,
          period, pos);

    /**
     * @param {string} type
     * @param {number} periodNumber
     * @param {number} time
     * @return {?number} A segment position.
     */
    const find = (type, periodNumber, time) => {
      // Note: |time| is relative to a Period's start time.
      const position = Math.floor(time / segmentDurations[type]) + 1;
      return boundsCheckPosition(type, periodNumber, position);
    };

    /**
     * @param {string} type
     * @param {number} periodNumber
     * @param {number} position
     * @return {shaka.media.SegmentReference} A SegmentReference.
     */
    const get = (type, periodNumber, position) => {
      if (boundsCheckPosition(type, periodNumber, position) == null) {
        return null;
      }

      const initSegmentUri = periodNumber + '_' + type + '_init';

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
      const getUris = () => [periodNumber + '_' + type + '_' + position];
      return new shaka.media.SegmentReference(
          position, (position - 1) * d, position * d, getUris,
          /* startByte */ 0, /* endByte */ null,
          initSegmentReference, /* presentationTimeOffset */ 0);
    };

    const manifest = {
      presentationTimeline: undefined,  // Should be set externally.
      minBufferTime: undefined,  // Should be set externally.
      periods: [],
    };

    // Populate the Manifest.
    let id = 0;
    const enumerate = (it) => shaka.util.Iterables.enumerate(it);
    for (const {i, item: startTime} of enumerate(periodStartTimes)) {
      const period = {
        startTime,
        variants: [],
        textStreams: [],
      };

      const variant = {};
      let trickModeVideo;

      for (const type in segmentDurations) {
        const stream =
            shaka.test.StreamingEngineUtil.createMockStream(type, id++);

        const segmentIndex = new shaka.test.FakeSegmentIndex();
        segmentIndex.find.and.callFake(
            (time) => find(type, i + 1, time));
        segmentIndex.get.and.callFake((pos) => get(type, i + 1, pos));

        stream.createSegmentIndex.and.callFake(() => {
          stream.segmentIndex = segmentIndex;
          return Promise.resolve();
        });

        const ContentType = shaka.util.ManifestParserUtils.ContentType;
        if (type == ContentType.TEXT) {
          period.textStreams.push(stream);
        } else if (type == ContentType.AUDIO) {
          variant.audio = stream;
        } else if (type == 'trickvideo') {
          trickModeVideo = stream;
        } else {
          variant.video = stream;
        }
      }

      variant.video.trickModeVideo = trickModeVideo;
      period.variants.push(variant);
      manifest.periods.push(period);
    }

    return /** @type {shaka.extern.Manifest} */ (manifest);
  }

  /**
   * Returns |position| if |type|, |periodNumber|, and |position| correspond
   * to a valid segment, as dictated by the provided metadata:
   * |periodStartTimes|, |presentationDuration|, and |segmentDurations|.
   *
   * @param {!Array.<number>} periodStartTimes
   * @param {number} presentationDuration
   * @param {!Object.<string, number>} segmentDurations
   * @param {string} type
   * @param {number} periodNumber
   * @param {number} position
   * @return {?number}
   */
  static boundsCheckPosition(
      periodStartTimes, presentationDuration, segmentDurations,
      type, periodNumber, position) {
    const numSegments = shaka.test.StreamingEngineUtil.getNumSegments(
        periodStartTimes, presentationDuration, segmentDurations,
        type, periodNumber);
    return position >= 1 && position <= numSegments ? position : null;
  }

  /**
   * @param {!Array.<number>} periodStartTimes
   * @param {number} presentationDuration
   * @param {!Object.<string, number>} segmentDurations
   * @param {string} type
   * @param {number} periodNumber
   * @return {number}
   */
  static getNumSegments(
      periodStartTimes, presentationDuration, segmentDurations,
      type, periodNumber) {
    const periodIndex = periodNumber - 1;
    const nextStartTime = periodIndex < periodStartTimes.length - 1 ?
                        periodStartTimes[periodIndex + 1] :
                        presentationDuration;
    const periodDuration = nextStartTime - periodStartTimes[periodIndex];
    return Math.ceil(periodDuration / segmentDurations[type]);
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
    };
  }
};
