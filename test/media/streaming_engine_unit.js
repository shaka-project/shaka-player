/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('StreamingEngine', () => {
  const Util = shaka.test.Util;
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  const Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;

  // Dummy byte ranges and sizes for initialization and media segments.
  // Create empty object first and initialize the fields through
  // [] to allow field names to be expressions.
  /**
   * @type {!Object.<shaka.util.ManifestParserUtils.ContentType,
   *                 !Array.<number>>}
   */
  const initSegmentRanges = {};
  initSegmentRanges[ContentType.AUDIO] = [100, 1000];
  initSegmentRanges[ContentType.VIDEO] = [200, 2000];

  /** @type {!Object.<shaka.util.ManifestParserUtils.ContentType, number>} */
  const segmentSizes = {};
  segmentSizes[ContentType.AUDIO] = 1000;
  segmentSizes[ContentType.VIDEO] = 10000;
  segmentSizes[ContentType.TEXT] = 500;

  /** @type {!Object.<string, shaka.test.FakeMediaSourceEngine.SegmentData>} */
  let segmentData;
  /** @type {number} */
  let presentationTimeInSeconds;
  /** @type {boolean} */
  let playing;

  /** @type {!shaka.test.FakeMediaSourceEngine} */
  let mediaSourceEngine;
  /** @type {{audio: number, video: number, text: number}} */
  let netEngineDelays;
  /** @type {!shaka.test.FakeNetworkingEngine} */
  let netEngine;
  /** @type {{start: number, end: number}} */
  let segmentAvailability;
  /** @type {!shaka.test.FakePresentationTimeline} */
  let timeline;

  /** @type {?shaka.extern.Stream} */
  let audioStream;
  /** @type {?shaka.extern.Stream} */
  let videoStream;
  /** @type {shaka.extern.Variant} */
  let variant;
  /** @type {shaka.extern.Stream} */
  let textStream;
  /** @type {shaka.extern.Variant} */
  let alternateVariant;
  /** @type {shaka.extern.Stream} */
  let alternateVideoStream;

  /** @type {shaka.extern.Manifest} */
  let manifest;

  /** @type {!jasmine.Spy} */
  let onError;
  /** @type {!jasmine.Spy} */
  let onEvent;
  /** @type {!jasmine.Spy} */
  let onManifestUpdate;
  /** @type {!jasmine.Spy} */
  let onSegmentAppended;
  /** @type {!jasmine.Spy} */
  let getBandwidthEstimate;
  /** @type {!shaka.media.StreamingEngine} */
  let streamingEngine;
  /** @type {!jasmine.Spy} */
  let beforeAppendSegment;
  /** @type {!jasmine.Spy} */
  let onMetadata;
  /** @type {!jasmine.Spy} */
  let disableStream;

  /** @type {function(function(), number)} */
  let realSetTimeout;

  /**
   * Runs the fake event loop.
   * @param {function()=} callback An optional callback that is executed
   *   each time the clock ticks.
   */
  async function runTest(callback) {
    async function onTick(currentTime) {
      if (callback) {
        await callback();
      }
      if (playing) {
        presentationTimeInSeconds++;
      }
    }
    // No test should require more than 60 seconds of simulated time.
    await Util.fakeEventLoop(60, onTick);
  }

  beforeAll(() => {
    realSetTimeout = window.setTimeout;
    jasmine.clock().install();
    jasmine.clock().mockDate();
  });

  /**
   * @param {boolean=} trickMode
   * @param {number=} mediaOffset The offset from 0 for the segment start times
   * @param {shaka.extern.aes128Key=} aes128Key The AES-128 key to put in
   *   the manifest, if one should exist
   */
  function setupVod(trickMode, mediaOffset, aes128Key) {
    // For VOD, we fake a presentation that has 2 Periods of equal duration
    // (20 seconds), where each Period has 1 Variant and 1 text stream.
    //
    // There are 4 initialization segments: 1 audio and 1 video for the
    // first Period, and 1 audio and 1 video for the second Period.
    //
    // There are 12 media segments: 2 audio, 2 video, and 2 text for the
    // first Period, and 2 audio, 2 video, and 2 text for the second Period.
    // All media segments are (by default) 10 seconds long.

    const offset = mediaOffset || 0;
    // timestampOffset is -ve since it is added to bring the timeline to 0.
    // -0 and 0 are not same so explicitly set to 0.
    const timestampOffset = offset === 0 ? 0 : -offset;

    // Create SegmentData map for FakeMediaSourceEngine.
    const initSegmentSizeAudio = initSegmentRanges[ContentType.AUDIO][1] -
        initSegmentRanges[ContentType.AUDIO][0] + 1;
    const initSegmentSizeVideo = initSegmentRanges[ContentType.VIDEO][1] -
        initSegmentRanges[ContentType.VIDEO][0] + 1;

    const makeBuffer = (size) => new ArrayBuffer(size);
    segmentData = {
      audio: {
        initSegments: [
          makeBuffer(initSegmentSizeAudio),
          makeBuffer(initSegmentSizeAudio),
        ],
        segments: [
          makeBuffer(segmentSizes[ContentType.AUDIO]),
          makeBuffer(segmentSizes[ContentType.AUDIO]),
          makeBuffer(segmentSizes[ContentType.AUDIO]),
          makeBuffer(segmentSizes[ContentType.AUDIO]),
        ],
        segmentStartTimes: [offset, offset+10, offset+20, offset+30],
        segmentDuration: 10,
        timestampOffset: timestampOffset,
      },
      video: {
        initSegments: [
          makeBuffer(initSegmentSizeVideo),
          makeBuffer(initSegmentSizeVideo),
        ],
        segments: [
          makeBuffer(segmentSizes[ContentType.VIDEO]),
          makeBuffer(segmentSizes[ContentType.VIDEO]),
          makeBuffer(segmentSizes[ContentType.VIDEO]),
          makeBuffer(segmentSizes[ContentType.VIDEO]),
        ],
        segmentStartTimes: [offset, offset+10, offset+20, offset+30],
        segmentDuration: 10,
        timestampOffset: timestampOffset,
      },
      text: {
        initSegments: [],
        segments: [
          makeBuffer(segmentSizes[ContentType.TEXT]),
          makeBuffer(segmentSizes[ContentType.TEXT]),
          makeBuffer(segmentSizes[ContentType.TEXT]),
          makeBuffer(segmentSizes[ContentType.TEXT]),
        ],
        segmentStartTimes: [offset, offset+10, offset+20, offset+30],
        segmentDuration: 10,
        timestampOffset: timestampOffset,
      },
    };
    if (trickMode) {
      segmentData.trickvideo = {
        initSegments: [
          makeBuffer(initSegmentSizeVideo),
          makeBuffer(initSegmentSizeVideo),
        ],
        segments: [
          makeBuffer(segmentSizes[ContentType.VIDEO]),
          makeBuffer(segmentSizes[ContentType.VIDEO]),
          makeBuffer(segmentSizes[ContentType.VIDEO]),
          makeBuffer(segmentSizes[ContentType.VIDEO]),
        ],
        segmentStartTimes: [offset, offset+10, offset+20, offset+30],
        segmentDuration: 10,
        timestampOffset: timestampOffset,
      };
    }

    presentationTimeInSeconds = 0;
    playing = false;

    setupNetworkingEngine(
        /* segmentsInFirstPeriod= */ 2,
        /* segmentsInSecondPeriod= */ 2);

    segmentAvailability = {
      start: 0,
      end: 40,
    };

    timeline = shaka.test.StreamingEngineUtil.createFakePresentationTimeline(
        segmentAvailability,
        /* presentationDuration= */ 40,
        /* maxSegmentDuration= */ 10,
        /* isLive= */ false);

    setupManifest(
        /* firstPeriodStartTime= */ 0,
        /* secondPeriodStartTime= */ 20,
        /* presentationDuration= */ 40,
        aes128Key);
  }

  function setupLive() {
    // For live, we fake a presentation that has 2 Periods of different
    // durations (120 seconds and 20 seconds respectively), where each Period
    // has 1 Variant and 1 text stream.
    //
    // There are 4 initialization segments: 1 audio and 1 video for the
    // first Period, and 1 audio and 1 video for the second Period.
    //
    // There are 14 media segments: 12 audio, 12 video, and 12 text for the
    // first Period, and 2 audio, 2 video, and 2 text for the second Period.
    // All media segments are (by default) 10 seconds long.
    //
    // The segment availability window starts at t=100 (segment 11) and extends
    // to t=120 (segment 13).

    // Create SegmentData map for FakeMediaSourceEngine.
    const initSegmentSizeAudio = initSegmentRanges[ContentType.AUDIO][1] -
        initSegmentRanges[ContentType.AUDIO][0] + 1;
    const initSegmentSizeVideo = initSegmentRanges[ContentType.VIDEO][1] -
        initSegmentRanges[ContentType.VIDEO][0] + 1;

    const makeBuffer = (size) => new ArrayBuffer(size);
    segmentData = {
      audio: {
        initSegments:
            [makeBuffer(initSegmentSizeAudio),
              makeBuffer(initSegmentSizeAudio)],
        segments: [],
        segmentStartTimes: [],
        segmentDuration: 10,
      },
      video: {
        initSegments:
            [makeBuffer(initSegmentSizeVideo),
              makeBuffer(initSegmentSizeVideo)],
        segments: [],
        segmentStartTimes: [],
        segmentDuration: 10,
      },
      text: {
        initSegments: [],
        segments: [],
        segmentStartTimes: [],
        segmentDuration: 10,
      },
    };

    const segmentsInFirstPeriod = 12;
    for (let i = 0; i < segmentsInFirstPeriod; i++) {
      segmentData[ContentType.AUDIO].segments.push(
          makeBuffer(segmentSizes[ContentType.AUDIO]));
      segmentData[ContentType.VIDEO].segments.push(
          makeBuffer(segmentSizes[ContentType.VIDEO]));
      segmentData[ContentType.TEXT].segments.push(
          makeBuffer(segmentSizes[ContentType.TEXT]));

      segmentData[ContentType.AUDIO].segmentStartTimes.push(i * 10);
      segmentData[ContentType.VIDEO].segmentStartTimes.push(i * 10);
      segmentData[ContentType.TEXT].segmentStartTimes.push(i * 10);
    }

    const segmentsInSecondPeriod = 2;
    for (let i = 0; i < segmentsInSecondPeriod; i++) {
      segmentData[ContentType.AUDIO].segments.push(
          makeBuffer(segmentSizes[ContentType.AUDIO]));
      segmentData[ContentType.VIDEO].segments.push(
          makeBuffer(segmentSizes[ContentType.VIDEO]));
      segmentData[ContentType.TEXT].segments.push(
          makeBuffer(segmentSizes[ContentType.TEXT]));

      segmentData[ContentType.AUDIO].segmentStartTimes.push(
          (segmentsInFirstPeriod + i) * 10);
      segmentData[ContentType.VIDEO].segmentStartTimes.push(
          (segmentsInFirstPeriod + i) * 10);
      segmentData[ContentType.TEXT].segmentStartTimes.push(
          (segmentsInFirstPeriod + i) * 10);
    }

    presentationTimeInSeconds = 110;
    playing = false;

    setupNetworkingEngine(
        /* segmentsInFirstPeriod= */ 12,
        /* segmentsInSecondPeriod= */ 2);

    // NOTE: Many tests here start playback at 100, so the availability start is
    // 90.  This allows the async index creation processes to complete before
    // the window moves, which gives us the startup conditions the tests expect.
    // Keep in mind that the fake event loop in the tests ticks in whole
    // seconds, so real async processes may take a surprising amount of fake
    // time to complete.  To test actual boundary conditions, you can change
    // segmentAvailability.start in the test setup.
    segmentAvailability = {
      start: 90,
      end: 140,
    };

    timeline = shaka.test.StreamingEngineUtil.createFakePresentationTimeline(
        segmentAvailability,
        /* presentationDuration= */ 140,
        /* maxSegmentDuration= */ 10,
        /* isLive= */ true);

    setupManifest(
        /* firstPeriodStartTime= */ 0,
        /* secondPeriodStartTime= */ 120,
        /* presentationDuration= */ 140);
  }

  function setupNetworkingEngine(
      segmentsInFirstPeriod, segmentsInSecondPeriod) {
    // Create the fake NetworkingEngine. Note: the StreamingEngine should never
    // request a segment that does not exist.
    netEngineDelays = {
      audio: 0,
      video: 0,
      text: 0,
    };
    netEngine = shaka.test.StreamingEngineUtil.createFakeNetworkingEngine(
        // Init segment generator:
        (type, periodIndex) => {
          expect((periodIndex == 0) || (periodIndex == 1));
          return segmentData[type].initSegments[periodIndex];
        },
        // Media segment generator:
        (type, periodIndex, position) => {
          expect(position).toBeGreaterThan(-1);
          expect((periodIndex == 0 && position <= segmentsInFirstPeriod) ||
                 (periodIndex == 1 && position <= segmentsInSecondPeriod));
          const segment = segmentData[type].segments[position];

          const startTime = segmentData[type].segmentStartTimes[position];
          const endTime = startTime + segmentData[type].segmentDuration;
          if (endTime < segmentAvailability.start ||
              startTime > segmentAvailability.end) {
            // Return null if the segment is out of the segment availability
            // window.
            return null;
          }
          return segment;
        },
        /* delays= */ netEngineDelays);
  }

  /**
   * @param {number} firstPeriodStartTime
   * @param {number} secondPeriodStartTime
   * @param {number} presentationDuration
   * @param {shaka.extern.aes128Key=} aes128Key
   */
  function setupManifest(
      firstPeriodStartTime, secondPeriodStartTime, presentationDuration,
      aes128Key) {
    const segmentDurations = {
      audio: segmentData[ContentType.AUDIO].segmentDuration,
      video: segmentData[ContentType.VIDEO].segmentDuration,
      text: segmentData[ContentType.TEXT].segmentDuration,
    };

    const timestampOffsets = {
      audio: segmentData[ContentType.AUDIO].timestampOffset,
      video: segmentData[ContentType.VIDEO].timestampOffset,
      text: segmentData[ContentType.TEXT].timestampOffset,
    };

    if (segmentData['trickvideo']) {
      segmentDurations['trickvideo'] =
          segmentData['trickvideo'].segmentDuration;
      timestampOffsets['trickvideo'] =
          segmentData['trickvideo'].timestampOffset;
    }
    manifest = shaka.test.StreamingEngineUtil.createManifest(
        /** @type {!shaka.media.PresentationTimeline} */(timeline),
        [firstPeriodStartTime, secondPeriodStartTime],
        presentationDuration, segmentDurations, initSegmentRanges,
        timestampOffsets, aes128Key);

    audioStream = manifest.variants[0].audio;
    videoStream = manifest.variants[0].video;
    variant = manifest.variants[0];
    textStream = manifest.textStreams[0];

    // This Stream is only used to verify that StreamingEngine can setup
    // Streams correctly.
    alternateVideoStream =
        shaka.test.StreamingEngineUtil.createMockVideoStream(8);
    alternateVariant = {
      audio: audioStream,
      video: /** @type {shaka.extern.Stream} */ (alternateVideoStream),
      id: 0,
      language: 'und',
      disabledUntilTime: 0,
      primary: false,
      bandwidth: 0,
      allowedByApplication: true,
      allowedByKeySystem: true,
      decodingInfos: [],
    };
    manifest.variants.push(alternateVariant);
  }

  /**
   * Creates the StreamingEngine.
   **
   * @param {shaka.extern.StreamingConfiguration=} config Optional
   *   configuration object which overrides the default one.
   */
  function createStreamingEngine(config) {
    onError = jasmine.createSpy('onError');
    onError.and.callFake(fail);
    onEvent = jasmine.createSpy('onEvent');
    onManifestUpdate = jasmine.createSpy('onManifestUpdate');
    onSegmentAppended = jasmine.createSpy('onSegmentAppended');
    beforeAppendSegment = jasmine.createSpy('beforeAppendSegment');
    onMetadata = jasmine.createSpy('onMetadata');
    getBandwidthEstimate = jasmine.createSpy('getBandwidthEstimate');
    getBandwidthEstimate.and.returnValue(1e3);
    disableStream = jasmine.createSpy('disableStream');
    disableStream.and.callFake(() => false);

    beforeAppendSegment.and.callFake((segment) => {
      return Promise.resolve();
    });

    if (!config) {
      config = shaka.util.PlayerConfiguration.createDefault().streaming;
      config.rebufferingGoal = 2;
      config.bufferingGoal = 5;
      config.bufferBehind = Infinity;
      config.maxDisabledTime = 0; // Do not disable stream by default
    }

    goog.asserts.assert(
        presentationTimeInSeconds != undefined,
        'All tests should have defined an initial presentation time by now!');
    const playerInterface = {
      getPresentationTime: () => presentationTimeInSeconds,
      getBandwidthEstimate: Util.spyFunc(getBandwidthEstimate),
      mediaSourceEngine: mediaSourceEngine,
      netEngine: /** @type {!shaka.net.NetworkingEngine} */(netEngine),
      onError: Util.spyFunc(onError),
      onEvent: Util.spyFunc(onEvent),
      onManifestUpdate: Util.spyFunc(onManifestUpdate),
      onSegmentAppended: Util.spyFunc(onSegmentAppended),
      onInitSegmentAppended: () => {},
      beforeAppendSegment: Util.spyFunc(beforeAppendSegment),
      onMetadata: Util.spyFunc(onMetadata),
      disableStream: Util.spyFunc(disableStream),
    };
    streamingEngine = new shaka.media.StreamingEngine(
        /** @type {shaka.extern.Manifest} */(manifest), playerInterface);
    streamingEngine.configure(config);
  }

  afterEach(() => {
    streamingEngine.destroy().catch(fail);
  });

  afterAll(() => {
    jasmine.clock().uninstall();
  });

  // This test initializes the StreamingEngine (SE) and allows it to play
  // through both Periods.
  //
  // After construction of StreamingEngine, the following should occur:
  //   1. The owner should immediately call switchVariant() with the initial
  //      variant.
  //   2. The owner should call start().
  //   3. SE should setup each of the initial Streams.
  //   4. SE should start appending the initial Streams' segments.
  //   5. SE should call MediaSourceEngine.endOfStream() after it has appended
  //      both segments from the second Period. At this point, the playhead
  //      should not be at the end of the presentation, but the test will be
  //      effectively over since SE will have nothing else to do.
  it('initializes and plays VOD', async () => {
    setupVod();
    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    createStreamingEngine();

    // Here we go!
    streamingEngine.switchVariant(variant);
    streamingEngine.switchTextStream(textStream);
    await streamingEngine.start();
    playing = true;

    // Verify buffers.
    expect(mediaSourceEngine.initSegments).toEqual({
      audio: [false, false],
      video: [false, false],
      text: [],
    });
    expect(mediaSourceEngine.segments).toEqual({
      audio: [false, false, false, false],
      video: [false, false, false, false],
      text: [false, false, false, false],
    });

    const expectedMseInit = new Map();
    expectedMseInit.set(ContentType.AUDIO, audioStream);
    expectedMseInit.set(ContentType.VIDEO, videoStream);
    expectedMseInit.set(ContentType.TEXT, textStream);

    expect(mediaSourceEngine.init).toHaveBeenCalledWith(expectedMseInit,
        /** sequenceMode= */ false, /** manifestType= */ 'UNKNOWN',
        /** ignoreManifestTimestampsInSegmentsMode= */ false);
    expect(mediaSourceEngine.init).toHaveBeenCalledTimes(1);

    expect(mediaSourceEngine.setDuration).toHaveBeenCalledTimes(1);
    expect(mediaSourceEngine.setDuration).toHaveBeenCalledWith(40);

    await runTest();

    expect(mediaSourceEngine.endOfStream).toHaveBeenCalled();

    // Verify buffers.
    expect(mediaSourceEngine.initSegments).toEqual({
      audio: [false, true],
      video: [false, true],
      text: [],
    });
    expect(mediaSourceEngine.segments).toEqual({
      audio: [true, true, true, true],
      video: [true, true, true, true],
      text: [true, true, true, true],
    });

    netEngine.expectRangeRequest(
        '0_audio_init',
        initSegmentRanges[ContentType.AUDIO][0],
        initSegmentRanges[ContentType.AUDIO][1],
        /* isInit= */ true);

    netEngine.expectRangeRequest(
        '0_video_init',
        initSegmentRanges[ContentType.VIDEO][0],
        initSegmentRanges[ContentType.VIDEO][1],
        /* isInit= */ true);

    netEngine.expectRangeRequest(
        '1_audio_init',
        initSegmentRanges[ContentType.AUDIO][0],
        initSegmentRanges[ContentType.AUDIO][1],
        /* isInit= */ true);

    netEngine.expectRangeRequest(
        '1_video_init',
        initSegmentRanges[ContentType.VIDEO][0],
        initSegmentRanges[ContentType.VIDEO][1],
        /* isInit= */ true);

    const segmentType = shaka.net.NetworkingEngine.RequestType.SEGMENT;
    const segmentContext = {
      type: shaka.net.NetworkingEngine.AdvancedRequestType.MEDIA_SEGMENT,
    };

    netEngine.expectRequest('0_audio_0', segmentType, segmentContext);
    netEngine.expectRequest('0_video_0', segmentType, segmentContext);
    netEngine.expectRequest('0_text_0', segmentType, segmentContext);

    netEngine.expectRequest('0_audio_1', segmentType, segmentContext);
    netEngine.expectRequest('0_video_1', segmentType, segmentContext);
    netEngine.expectRequest('0_text_1', segmentType, segmentContext);

    netEngine.expectRequest('1_audio_2', segmentType, segmentContext);
    netEngine.expectRequest('1_video_2', segmentType, segmentContext);
    netEngine.expectRequest('1_text_2', segmentType, segmentContext);

    netEngine.expectRequest('1_audio_3', segmentType, segmentContext);
    netEngine.expectRequest('1_video_3', segmentType, segmentContext);
    netEngine.expectRequest('1_text_3', segmentType, segmentContext);
  });

  describe('unloadTextStream', () => {
    it('doesn\'t send requests for text after calling unload', async () => {
      setupVod();
      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      createStreamingEngine();

      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;

      // Verify that after unloading text stream, no network request for text
      // is sent.
      await runTest(() => {
        const segmentType = shaka.net.NetworkingEngine.RequestType.SEGMENT;
        const segmentContext = {
          type: shaka.net.NetworkingEngine.AdvancedRequestType.MEDIA_SEGMENT,
        };

        if (presentationTimeInSeconds == 1) {
          netEngine.expectRequest('0_text_0', segmentType, segmentContext);
          netEngine.request.calls.reset();
          streamingEngine.unloadTextStream();
        } else if (presentationTimeInSeconds == 35) {
          netEngine.expectNoRequest('0_text_0', segmentType, segmentContext);
          netEngine.expectNoRequest('0_text_1', segmentType, segmentContext);
          netEngine.expectNoRequest('1_text_2', segmentType, segmentContext);
          netEngine.expectNoRequest('1_text_3', segmentType, segmentContext);
        }
      });
    });

    it('sets the current text stream to null', async () => {
      createStreamingEngine();

      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      expect(streamingEngine.getCurrentTextStream()).not.toBe(null);

      await streamingEngine.start();
      playing = true;

      streamingEngine.unloadTextStream();
      expect(streamingEngine.getCurrentTextStream()).toBe(null);
    });
  });

  it('initializes and plays live', async () => {
    setupLive();
    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    createStreamingEngine();

    // Here we go!
    presentationTimeInSeconds = 100;
    streamingEngine.switchVariant(variant);
    streamingEngine.switchTextStream(textStream);
    await streamingEngine.start();
    playing = true;

    await runTest(slideSegmentAvailabilityWindow);
    expect(mediaSourceEngine.endOfStream).toHaveBeenCalled();

    // Verify buffers.
    expect(mediaSourceEngine.initSegments).toEqual({
      audio: [false, true],
      video: [false, true],
      text: [],
    });

    // Since we started playback from segment 11, segments 10 through 14
    // should be buffered.  Those segment numbers are 1-based, and this array
    // is 0-based, so we expect i >= 9 to be downloaded.
    const segments = mediaSourceEngine.segments;
    for (let i = 0; i < 14; i++) {
      expect(segments[ContentType.AUDIO][i]).withContext(i).toBe(i >= 9);
      expect(segments[ContentType.VIDEO][i]).withContext(i).toBe(i >= 9);
      expect(segments[ContentType.TEXT][i]).withContext(i).toBe(i >= 9);
    }
  });

  it('appends the ReadableStream data with low latency mode', async () => {
    // Use the VOD manifests to test the streamDataCallback function in the low
    // latency mode.
    setupVod();

    const config = shaka.util.PlayerConfiguration.createDefault().streaming;
    config.lowLatencyMode = true;
    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    mediaSourceEngine.appendBuffer.and.stub();
    createStreamingEngine(config);

    // Here we go!
    streamingEngine.switchVariant(variant);
    streamingEngine.switchTextStream(textStream);
    await streamingEngine.start();
    playing = true;

    await runTest();

    // In the mocks in StreamingEngineUtil, each segment gets fetched as two
    // chunks of data, and each chunk contains one MDAT box.
    // The streamDataCallback function will be triggered twice for each
    // audio/video MP4 segment.
    // appendBuffer should be called once for each init segment of the
    // audio / video segment, and twice for each segment.
    // 4 init segments + 8 audio/video segments * 2 + 4 text segments = 24.
    if (window.ReadableStream) {
      expect(mediaSourceEngine.appendBuffer).toHaveBeenCalledTimes(24);
    } else {
      // If ReadableStream is not supported by the browser, fall back to regular
      // streaming.
      // 4 init segments + 8 audio/video segments + 4 text segments = 16.
      expect(mediaSourceEngine.appendBuffer).toHaveBeenCalledTimes(16);
    }
  });

  it('plays when a small gap is present at the beginning', async () => {
    const drift = 0.050;  // 50 ms

    setupVod();
    mediaSourceEngine =
        new shaka.test.FakeMediaSourceEngine(segmentData, drift);
    createStreamingEngine();

    // Here we go!
    streamingEngine.switchVariant(variant);
    streamingEngine.switchTextStream(textStream);
    await streamingEngine.start();
    playing = true;

    await runTest();
  });

  it('plays with no chosen text streams', async () => {
    setupVod();
    manifest.textStreams = [];

    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    createStreamingEngine();

    // Here we go!
    streamingEngine.switchVariant(variant);
    // Don't call switchTextStream.
    await streamingEngine.start();
    playing = true;
    await runTest();

    expect(mediaSourceEngine.segments).toEqual({
      audio: [true, true, true, true],
      video: [true, true, true, true],
      text: [false, false, false, false],
    });
  });

  it('updates the timeline duration to match media duration', async () => {
    setupVod();
    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    createStreamingEngine();

    mediaSourceEngine.endOfStream.and.callFake(() => {
      expect(mediaSourceEngine.setDuration).toHaveBeenCalledWith(40);
      expect(mediaSourceEngine.setDuration).toHaveBeenCalledTimes(1);
      mediaSourceEngine.setDuration.calls.reset();
      // Simulate the media ending BEFORE the expected (manifest) duration.
      mediaSourceEngine.getDuration.and.returnValue(35);
      return Promise.resolve();
    });

    // Here we go!
    streamingEngine.switchVariant(variant);
    streamingEngine.switchTextStream(textStream);
    await streamingEngine.start();
    playing = true;

    await runTest();
    expect(mediaSourceEngine.endOfStream).toHaveBeenCalled();
    expect(timeline.setDuration).toHaveBeenCalledWith(35);
  });

  // https://github.com/shaka-project/shaka-player/issues/979
  it('does not expand the timeline duration', async () => {
    setupVod();
    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    createStreamingEngine();

    mediaSourceEngine.endOfStream.and.callFake(() => {
      expect(mediaSourceEngine.setDuration).toHaveBeenCalledWith(40);
      expect(mediaSourceEngine.setDuration).toHaveBeenCalledTimes(1);
      mediaSourceEngine.setDuration.calls.reset();
      // Simulate the media ending AFTER the expected (manifest) duration.
      mediaSourceEngine.getDuration.and.returnValue(41);
      return Promise.resolve();
    });

    // Here we go!
    streamingEngine.switchVariant(variant);
    streamingEngine.switchTextStream(textStream);
    await streamingEngine.start();
    playing = true;

    await runTest();
    expect(mediaSourceEngine.endOfStream).toHaveBeenCalled();
    expect(timeline.setDuration).not.toHaveBeenCalled();
  });

  // https://github.com/shaka-project/shaka-player/issues/1967
  it('does not change duration when 0', async () => {
    setupVod();
    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    createStreamingEngine();

    // The duration can spuriously be set to 0, so we should ignore this and not
    // update the duration.
    mediaSourceEngine.getDuration.and.returnValue(0);

    // Here we go!
    streamingEngine.switchVariant(variant);
    streamingEngine.switchTextStream(textStream);
    await streamingEngine.start();
    playing = true;

    await runTest();
    expect(mediaSourceEngine.endOfStream).toHaveBeenCalled();
    expect(timeline.setDuration).not.toHaveBeenCalled();
  });

  it('applies fudge factors for append window', async () => {
    setupVod();
    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    createStreamingEngine();

    // Here we go!
    streamingEngine.switchVariant(variant);
    streamingEngine.switchTextStream(textStream);
    await streamingEngine.start();
    playing = true;
    await runTest();

    // The second Period starts at 20, so we should set the appendWindowStart to
    // 20, but reduced by a small fudge factor.
    const lt20 = {
      asymmetricMatch: (val) => val >= 19.9 && val < 20,
    };
    const gt40 = {
      asymmetricMatch: (val) => val > 40 && val <= 40.1,
    };
    const streamsByType = new Map();
    streamsByType.set(ContentType.AUDIO, audioStream);
    streamsByType.set(ContentType.VIDEO, videoStream);

    expect(mediaSourceEngine.setStreamProperties)
        .toHaveBeenCalledWith('video', 0, lt20, gt40, false,
            videoStream, streamsByType);
  });

  // Regression test for https://github.com/shaka-project/shaka-player/issues/3717
  it('applies fudge factors for the duration', async () => {
    setupVod();

    // In #3717, the duration was just barely large enough to encompass an
    // additional segment, but that segment didn't exist, so playback never
    // completed.  Here, we set the duration to just beyond the 3rd segment, and
    // we make the 4th segment fail when requested.
    const duration = 30.000000005;
    timeline.getDuration.and.returnValue(duration);

    const targetUri = '1_video_3';  // The URI of the 4th video segment.
    failRequestsForTarget(netEngine, targetUri);

    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    createStreamingEngine();

    // Here we go!
    streamingEngine.switchVariant(variant);
    streamingEngine.switchTextStream(textStream);
    await streamingEngine.start();
    playing = true;
    await runTest();

    // The end of the stream should have been reached, and the 4th segment from
    // each type should never have been requested.
    expect(mediaSourceEngine.endOfStream).toHaveBeenCalled();

    const segmentType = shaka.net.NetworkingEngine.RequestType.SEGMENT;
    const segmentContext = {
      type: shaka.net.NetworkingEngine.AdvancedRequestType.MEDIA_SEGMENT,
    };
    netEngine.expectRequest('0_audio_0', segmentType, segmentContext);
    netEngine.expectRequest('0_video_0', segmentType, segmentContext);
    netEngine.expectRequest('0_text_0', segmentType, segmentContext);

    netEngine.expectRequest('0_audio_1', segmentType, segmentContext);
    netEngine.expectRequest('0_video_1', segmentType, segmentContext);
    netEngine.expectRequest('0_text_1', segmentType, segmentContext);

    netEngine.expectRequest('1_audio_2', segmentType, segmentContext);
    netEngine.expectRequest('1_video_2', segmentType, segmentContext);
    netEngine.expectRequest('1_text_2', segmentType, segmentContext);

    netEngine.expectNoRequest('1_audio_3', segmentType, segmentContext);
    netEngine.expectNoRequest('1_video_3', segmentType, segmentContext);
    netEngine.expectNoRequest('1_text_3', segmentType, segmentContext);
  });

  it('does not buffer one media type ahead of another', async () => {
    setupVod();
    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);

    const config = shaka.util.PlayerConfiguration.createDefault().streaming;
    config.bufferingGoal = 60;
    config.failureCallback = () => streamingEngine.retry(0.1);
    createStreamingEngine(config);

    // Make requests for different types take different amounts of time.
    // This would let some media types buffer faster than others if unchecked.
    netEngineDelays.text = 0.1;
    netEngineDelays.audio = 1.0;
    netEngineDelays.video = 5.0; // Need init segment and media segment

    mediaSourceEngine.appendBuffer.and.callFake((type, data, reference) => {
      // Call to the underlying implementation.
      const p = mediaSourceEngine.appendBufferImpl(type, data, reference);

      // Validate that no one media type got ahead of any other.
      let minBuffered = Infinity;
      let maxBuffered = 0;
      for (const t of ['audio', 'video', 'text']) {
        const buffered = mediaSourceEngine.bufferedAheadOfImpl(t, 0);
        minBuffered = Math.min(minBuffered, buffered);
        maxBuffered = Math.max(maxBuffered, buffered);
      }

      // Simulated playback doesn't start until some of each is buffered.  This
      // realism is important to the test passing.
      if (minBuffered > 0) {
        playing = true;
      }

      // Sanity check.
      expect(maxBuffered).not.toBeLessThan(minBuffered);
      // Proof that we didn't get too far ahead (10s == 1 segment).
      expect(maxBuffered - minBuffered).not.toBeGreaterThan(10);

      return p;
    });

    // Here we go!
    streamingEngine.switchVariant(variant);
    streamingEngine.switchTextStream(textStream);
    await streamingEngine.start();
    // Simulated playback is started in the appendBuffer fake when some of each
    // type is buffered.  This realism is important to the test passing.
    playing = false;

    await runTest();
    // Make sure appendBuffer was called, so that we know that we executed the
    // checks in our fake above.
    expect(mediaSourceEngine.appendBuffer).toHaveBeenCalled();
  });

  // https://github.com/shaka-project/shaka-player/issues/2957
  it('plays with fewer text segments', async () => {
    setupVod();

    // Only use one segment for text, which will buffer less than the others.
    segmentData['text'].segments.splice(1, 3);
    await textStream.createSegmentIndex();
    const oldGet = /** @type {?} */ (textStream.segmentIndex.get);
    textStream.segmentIndex.get = (idx) => {
      return idx > 0 ? null : oldGet(idx);
    };

    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    createStreamingEngine();

    // Here we go!
    streamingEngine.switchVariant(variant);
    streamingEngine.switchTextStream(textStream);
    await streamingEngine.start();
    playing = true;

    await runTest();

    expect(mediaSourceEngine.segments).toEqual({
      audio: [true, true, true, true],
      video: [true, true, true, true],
      text: [true],
    });
  });

  describe('switchVariant/switchTextStream', () => {
    let initialVariant;
    let sameAudioVariant;
    let sameVideoVariant;
    let differentVariant;
    let initialTextStream;
    let newTextStream;

    beforeEach(() => {
      // Set up a manifest with multiple variants and a text stream.
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.presentationTimeline.setDuration(60);
        manifest.addVariant(0, (variant) => {
          variant.addAudio(10, (stream) => {
            stream.useSegmentTemplate('audio-10-%d.mp4', 10);
          });
          variant.addVideo(11, (stream) => {
            stream.useSegmentTemplate('video-11-%d.mp4', 10);
          });
        });
        manifest.addVariant(1, (variant) => {
          variant.addExistingStream(10);  // audio
          variant.addVideo(12, (stream) => {
            stream.useSegmentTemplate('video-12-%d.mp4', 10);
          });
        });
        manifest.addVariant(2, (variant) => {
          variant.addAudio(13, (stream) => {
            stream.useSegmentTemplate('audio-13-%d.mp4', 10);
          });
          variant.addExistingStream(12);  // video
        });
        manifest.addVariant(3, (variant) => {
          variant.addVideo(14, (stream) => {
            stream.useSegmentTemplate('video-14-%d.mp4', 10);
          });
          variant.addAudio(15, (stream) => {
            stream.useSegmentTemplate('audio-15-%d.mp4', 10);
          });
        });
        manifest.addTextStream(20, (stream) => {
          stream.setInitSegmentReference(['text-20-init'], 0, null);
          stream.useSegmentTemplate('text-20-%d.mp4', 10);
        });
        manifest.addTextStream(21, (stream) => {
          stream.setInitSegmentReference(['text-21-init'], 0, null);
          stream.useSegmentTemplate('text-21-%d.mp4', 10);
        });
      });

      initialVariant = manifest.variants[0];
      sameAudioVariant = manifest.variants[1];
      sameVideoVariant = manifest.variants[2];
      differentVariant = manifest.variants[3];
      initialTextStream = manifest.textStreams[0];
      newTextStream = manifest.textStreams[1];

      // For these tests, we don't care about specific data appended.
      // Just return any old ArrayBuffer for any requested segment.
      netEngine = new shaka.test.FakeNetworkingEngine();
      netEngine.setDefaultValue(new ArrayBuffer(0));

      // For these tests, we also don't need FakeMediaSourceEngine to verify
      // its input data.
      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine({});
      mediaSourceEngine.clear.and.returnValue(Promise.resolve());
      mediaSourceEngine.bufferedAheadOf.and.returnValue(0);
      mediaSourceEngine.bufferStart.and.returnValue(0);
      mediaSourceEngine.setStreamProperties.and.returnValue(Promise.resolve());
      mediaSourceEngine.remove.and.returnValue(Promise.resolve());

      const bufferEnd = {audio: 0, video: 0, text: 0};
      mediaSourceEngine.appendBuffer.and.callFake(
          (type, data, reference) => {
            bufferEnd[type] = reference && reference.endTime;
            return Promise.resolve();
          });
      mediaSourceEngine.bufferEnd.and.callFake((type) => {
        return bufferEnd[type];
      });
      mediaSourceEngine.bufferedAheadOf.and.callFake((type, start) => {
        return Math.max(0, bufferEnd[type] - start);
      });
      mediaSourceEngine.isBuffered.and.callFake((type, time) => {
        return time >= 0 && time < bufferEnd[type];
      });

      playing = false;
      presentationTimeInSeconds = 0;
      createStreamingEngine();

      streamingEngine.switchVariant(initialVariant);
      streamingEngine.switchTextStream(initialTextStream);
    });

    it('will not clear buffers if streams have not changed', async () => {
      streamingEngine.start().catch(fail);
      playing = true;

      await Util.fakeEventLoop(1);

      mediaSourceEngine.clear.calls.reset();
      streamingEngine.switchVariant(sameAudioVariant, /* clearBuffer= */ true);
      await Util.fakeEventLoop(1);
      expect(mediaSourceEngine.clear).not.toHaveBeenCalledWith('audio');
      expect(mediaSourceEngine.clear).toHaveBeenCalledWith('video');
      expect(mediaSourceEngine.clear).not.toHaveBeenCalledWith('text');

      mediaSourceEngine.clear.calls.reset();
      streamingEngine.switchVariant(sameVideoVariant, /* clearBuffer= */ true);
      await Util.fakeEventLoop(1);
      expect(mediaSourceEngine.clear).toHaveBeenCalledWith('audio');
      expect(mediaSourceEngine.clear).not.toHaveBeenCalledWith('video');
      expect(mediaSourceEngine.clear).not.toHaveBeenCalledWith('text');

      mediaSourceEngine.clear.calls.reset();
      streamingEngine.switchTextStream(initialTextStream);
      await Util.fakeEventLoop(1);
      expect(mediaSourceEngine.clear).not.toHaveBeenCalled();
    });

    it('will not reset caption parser when text streams change', async () => {
      await streamingEngine.start();
      playing = true;

      mediaSourceEngine.clear.calls.reset();
      streamingEngine.switchTextStream(newTextStream);
      await Util.fakeEventLoop(1);
      expect(mediaSourceEngine.clear).toHaveBeenCalled();
      expect(mediaSourceEngine.resetCaptionParser).not.toHaveBeenCalled();
    });

    // See https://github.com/shaka-project/shaka-player/issues/2956
    it('works with fast variant switches during update', async () => {
      // Delay the appendBuffer call until later so we are waiting for this to
      // finish when we switch.
      const p = new shaka.util.PublicPromise();
      const old = mediaSourceEngine.appendBuffer;
      // Replace the whole spy since we want to call the original.
      mediaSourceEngine.appendBuffer =
          jasmine.createSpy('appendBuffer')
              .and.callFake(async (type, data, reference) => {
                await p;
                return Util.invokeSpy(old, type, data, reference);
              });

      await streamingEngine.start();
      playing = true;

      await Util.fakeEventLoop(1);
      streamingEngine.switchVariant(differentVariant, /* clearBuffer= */ true);
      streamingEngine.switchVariant(initialVariant, /* clearBuffer= */ true);
      p.resolve();

      await Util.fakeEventLoop(5);

      expect(Util.invokeSpy(mediaSourceEngine.bufferEnd, 'video')).toBe(10);
    });

    it('works with fast text stream switches during update', async () => {
      // Delay the appendBuffer call until later so we are waiting for this to
      // finish when we switch.
      const p = new shaka.util.PublicPromise();

      const old = mediaSourceEngine.appendBuffer;
      // Replace the whole spy since we want to call the original.
      mediaSourceEngine.appendBuffer =
          jasmine.createSpy('appendBuffer')
              .and.callFake(async (type, data, reference) => {
                await p;
                return Util.invokeSpy(old, type, data, reference);
              });

      await streamingEngine.start();
      playing = true;

      await Util.fakeEventLoop(3);
      netEngine.request.calls.reset();

      streamingEngine.switchTextStream(newTextStream);
      streamingEngine.switchTextStream(initialTextStream);
      p.resolve();

      await Util.fakeEventLoop(5);

      const segmentType = shaka.net.NetworkingEngine.RequestType.SEGMENT;
      const segmentContext = {
        type: shaka.net.NetworkingEngine.AdvancedRequestType.INIT_SEGMENT,
      };

      // Quickly switching back to text1, and text init segment should be
      // fetched again.
      netEngine.expectRequest('text-20-init', segmentType, segmentContext);
      netEngine.expectNoRequest('text-21-init', segmentType, segmentContext);
      // TODO: huh?
    });
  });

  describe('handles seeks (VOD)', () => {
    /** @type {!jasmine.Spy} */
    let onTick;

    beforeEach(() => {
      setupVod();
      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      createStreamingEngine();

      onTick = jasmine.createSpy('onTick');
      onTick.and.stub();
    });

    it('into buffered regions', async () => {
      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;

      let seekComplete = false;
      await runTest(() => {
        if (presentationTimeInSeconds == 6 && !seekComplete) {
          // Seek backwards to a buffered region in the first Period.
          presentationTimeInSeconds -= 5;
          streamingEngine.seeked();
          seekComplete = true;
        }
      });

      // Verify buffers.
      expect(mediaSourceEngine.initSegments).toEqual({
        audio: [false, true],
        video: [false, true],
        text: [],
      });
      expect(mediaSourceEngine.segments).toEqual({
        audio: [true, true, true, true],
        video: [true, true, true, true],
        text: [true, true, true, true],
      });
    });

    it('into partially buffered regions in the same period', async () => {
      // When seeking into a region within the same period, or changing
      // resolution, and after the seek some states are buffered and some
      // are unbuffered, StreamingEngine should only clear the unbuffered
      // states.

      mediaSourceEngine.endOfStream.and.callFake(() => {
        // Should have the first Period entirely buffered.
        expect(mediaSourceEngine.initSegments).toEqual({
          audio: [false, true],
          video: [false, true],
          text: [],
        });
        expect(mediaSourceEngine.segments).toEqual({
          audio: [true, true, true, true],
          video: [true, true, true, true],
          text: [true, true, true, true],
        });

        // Fake the audio buffer being removed.
        mediaSourceEngine.segments[ContentType.AUDIO] =
            [true, true, false, false];

        // Seek back into the second Period.
        presentationTimeInSeconds -= 5;
        expect(presentationTimeInSeconds).toBeGreaterThan(19);
        streamingEngine.seeked();

        mediaSourceEngine.endOfStream.and.returnValue(Promise.resolve());
        return Promise.resolve();
      });

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;
      await runTest();

      // When seeking within the same period, clear the buffer of the
      // unbuffered streams.
      expect(mediaSourceEngine.clear).toHaveBeenCalledWith('audio');
      expect(mediaSourceEngine.clear).not.toHaveBeenCalledWith('video');
      expect(mediaSourceEngine.clear).not.toHaveBeenCalledWith('text');

      // Verify buffers.
      expect(mediaSourceEngine.initSegments).toEqual({
        audio: [false, true],
        video: [false, true],
        text: [],
      });
      expect(mediaSourceEngine.segments).toEqual({
        audio: [false, false, true, true],
        video: [true, true, true, true],
        text: [true, true, true, true],
      });
    });

    it('into buffered regions across Periods', async () => {
      mediaSourceEngine.endOfStream.and.callFake(() => {
        // Seek backwards to a buffered region in the first Period.
        presentationTimeInSeconds -= 20;
        expect(presentationTimeInSeconds).toBeLessThan(20);
        streamingEngine.seeked();

        // Verify that buffers are not cleared.
        expect(mediaSourceEngine.clear).not.toHaveBeenCalled();

        return Promise.resolve();
      });

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;

      await runTest();
      // Verify buffers.
      expect(mediaSourceEngine.initSegments).toEqual({
        audio: [false, true],
        video: [false, true],
        text: [],
      });
      expect(mediaSourceEngine.segments).toEqual({
        audio: [true, true, true, true],
        video: [true, true, true, true],
        text: [true, true, true, true],
      });
    });

    it('into unbuffered regions', async () => {
      onTick.and.callFake(() => {
        if (presentationTimeInSeconds == 6) {
          // Note that since the buffering goal is 5 seconds and each segment is
          // 10 seconds long, the second segment of this Period will be required
          // at 6 seconds.

          // Verify that all buffers have been cleared.
          expect(mediaSourceEngine.clear)
              .toHaveBeenCalledWith(ContentType.AUDIO);
          expect(mediaSourceEngine.clear)
              .toHaveBeenCalledWith(ContentType.VIDEO);
          expect(mediaSourceEngine.clear)
              .toHaveBeenCalledWith(ContentType.TEXT);

          // Verify buffers.  The first segment is present because we start
          // off-by-one after a seek.
          expect(mediaSourceEngine.initSegments).toEqual({
            audio: [true, false],
            video: [true, false],
            text: [],
          });
          expect(mediaSourceEngine.segments).toEqual({
            audio: [false, true, false, false],
            video: [false, true, false, false],
            text: [false, true, false, false],
          });
        }
      });

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;

      // Seek forward to an unbuffered region in the first Period.
      expect(presentationTimeInSeconds).toBe(0);
      presentationTimeInSeconds += 15;
      streamingEngine.seeked();

      await runTest(Util.spyFunc(onTick));

      // Verify buffers.
      expect(mediaSourceEngine.initSegments).toEqual({
        audio: [false, true],
        video: [false, true],
        text: [],
      });
      expect(mediaSourceEngine.segments).toEqual({
        audio: [false, true, true, true],
        video: [false, true, true, true],
        text: [false, true, true, true],
      });
    });

    it('into unbuffered regions across Periods', async () => {
      // Start from the second Period.
      presentationTimeInSeconds = 25;

      mediaSourceEngine.endOfStream.and.callFake(() => {
        // Verify buffers.
        expect(mediaSourceEngine.initSegments).toEqual({
          audio: [false, true],
          video: [false, true],
          text: [],
        });
        expect(mediaSourceEngine.segments).toEqual({
          audio: [false, false, true, true],
          video: [false, false, true, true],
          text: [false, false, true, true],
        });

        // Seek backwards to an unbuffered region in the first Period.
        presentationTimeInSeconds -= 20;
        expect(presentationTimeInSeconds).toBeLessThan(20);
        streamingEngine.seeked();

        expect(mediaSourceEngine.resetCaptionParser).toHaveBeenCalled();

        onTick.and.callFake(() => {
          // Verify that all buffers have been cleared.
          expect(mediaSourceEngine.clear)
              .toHaveBeenCalledWith(ContentType.AUDIO);
          expect(mediaSourceEngine.clear)
              .toHaveBeenCalledWith(ContentType.VIDEO);
          expect(mediaSourceEngine.clear)
              .toHaveBeenCalledWith(ContentType.TEXT);
          onTick.and.stub();
        });

        mediaSourceEngine.endOfStream.and.returnValue(Promise.resolve());
        return Promise.resolve();
      });

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;

      await runTest(Util.spyFunc(onTick));
      // Verify buffers.
      expect(mediaSourceEngine.initSegments).toEqual({
        audio: [false, true],
        video: [false, true],
        text: [],
      });
      expect(mediaSourceEngine.segments).toEqual({
        audio: [true, true, true, true],
        video: [true, true, true, true],
        text: [true, true, true, true],
      });
    });

    it('into unbuffered regions when nothing is buffered', async () => {
      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;

      // Nothing is buffered yet.
      expect(mediaSourceEngine.segments).toEqual({
        audio: [false, false, false, false],
        video: [false, false, false, false],
        text: [false, false, false, false],
      });

      // Seek forward to an unbuffered region in the first Period.
      presentationTimeInSeconds = 15;
      streamingEngine.seeked();

      onTick.and.callFake(() => {
        // Nothing should have been cleared.
        expect(mediaSourceEngine.clear).not.toHaveBeenCalled();
        onTick.and.stub();
      });

      await runTest(Util.spyFunc(onTick));

      // Verify buffers.
      expect(mediaSourceEngine.initSegments).toEqual({
        audio: [false, true],
        video: [false, true],
        text: [],
      });
      expect(mediaSourceEngine.segments).toEqual({
        audio: [false, true, true, true],
        video: [false, true, true, true],
        text: [false, true, true, true],
      });
    });

    it('into unbuffered regions when nothing is buffered ' +
      'and mediaState is performing an update', async () => {
      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      // ensure init source buffer promise does not resolve before seeked()
      // so mediaState remains in "performingUpdate" state
      const initSourceBufferPromise = new shaka.util.PublicPromise();
      mediaSourceEngine.setStreamProperties.and
          .returnValue(initSourceBufferPromise);
      await streamingEngine.start();
      playing = true;

      // tick to trigger mediaState updates
      jasmine.clock().tick(1);
      // give a chance for fetchAndAppend_ to be invoked
      // by async onUpdate_ callback
      await Util.shortDelay(realSetTimeout);

      // Nothing is buffered yet.
      expect(mediaSourceEngine.segments).toEqual({
        audio: [false, false, false, false],
        video: [false, false, false, false],
        text: [false, false, false, false],
      });

      // Seek forward to an unbuffered region in the first Period.
      presentationTimeInSeconds = 15;
      streamingEngine.seeked();

      // resolve initSourceBufferPromise after seeked(), waitingToClearBuffer
      // should have been set, so this will now trigger the actual flush of
      // the buffer
      initSourceBufferPromise.resolve();
      mediaSourceEngine.setStreamProperties.and
          .returnValue(Promise.resolve());

      // allow mediaState update to resolve
      await Util.shortDelay(realSetTimeout);

      onTick.and.callFake(() => {
        expect(mediaSourceEngine.clear).toHaveBeenCalled();
        onTick.and.stub();
      });

      await runTest(Util.spyFunc(onTick));

      // Verify buffers.
      expect(mediaSourceEngine.initSegments).toEqual({
        audio: [false, true],
        video: [false, true],
        text: [],
      });
      expect(mediaSourceEngine.segments).toEqual({
        audio: [false, true, true, true],
        video: [false, true, true, true],
        text: [false, true, true, true],
      });
    });

    it('into unbuffered regions near segment start', async () => {
      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;

      // Seek forward to an unbuffered region in the first Period.
      presentationTimeInSeconds = 11;
      streamingEngine.seeked();

      onTick.and.callFake(() => {
        // Nothing should have been cleared.
        expect(mediaSourceEngine.clear).not.toHaveBeenCalled();
        onTick.and.stub();
      });

      await runTest(Util.spyFunc(onTick));

      // Verify buffers.
      expect(mediaSourceEngine.initSegments).toEqual({
        audio: [false, true],
        video: [false, true],
        text: [],
      });
      // Should buffer previous segment despite being inside segment 2.
      expect(mediaSourceEngine.segments).toEqual({
        audio: [true, true, true, true],
        video: [true, true, true, true],
        text: [true, true, true, true],
      });
    });

    // If we seek back into an unbuffered region but do not called seeked(),
    // StreamingEngine should wait for seeked() to be called.
    it('back into unbuffered regions without seeked()', async () => {
      // Start from the second segment in the second Period.
      presentationTimeInSeconds = 30;

      mediaSourceEngine.endOfStream.and.callFake(() => {
        // Seek backwards to an unbuffered region in the second Period. Do not
        // call seeked().
        presentationTimeInSeconds = 20;
        return Promise.resolve();
      });

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;

      await runTest();
      // Verify buffers. Segment 3 should not be buffered since we never
      // called seeked().
      expect(mediaSourceEngine.initSegments).toEqual({
        audio: [false, true],
        video: [false, true],
        text: [],
      });
      expect(mediaSourceEngine.segments).toEqual({
        audio: [false, false, true, true],
        video: [false, false, true, true],
        text: [false, false, true, true],
      });
    });

    // If we seek forward into an unbuffered region but do not called seeked(),
    // StreamingEngine should continue buffering. This test also exercises the
    // case where the playhead moves past the end of the buffer, which may
    // occur on some browsers depending on the playback rate.
    it('forward into unbuffered regions without seeked()', async () => {
      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;

      let seekStarted = false;
      await runTest(() => {
        if (!seekStarted) {
          // Seek forward to an unbuffered region in the first Period. Do not
          // call seeked().
          presentationTimeInSeconds += 15;
          seekStarted = true;
        }
      });

      // Verify buffers.
      expect(mediaSourceEngine.initSegments).toEqual({
        audio: [false, true],
        video: [false, true],
        text: [],
      });
      expect(mediaSourceEngine.segments).toEqual({
        audio: [true, true, true, true],
        video: [true, true, true, true],
        text: [true, true, true, true],
      });
    });

    it('into partially buffered regions across periods', async () => {
      // Seeking into a region where some buffers (text) are buffered and some
      // are not should work.

      mediaSourceEngine.endOfStream.and.callFake(() => {
        // Should have the first Period entirely buffered.
        expect(mediaSourceEngine.initSegments).toEqual({
          audio: [false, true],
          video: [false, true],
          text: [],
        });
        expect(mediaSourceEngine.segments).toEqual({
          audio: [true, true, true, true],
          video: [true, true, true, true],
          text: [true, true, true, true],
        });

        // Fake the audio/video buffers being removed.
        // Now only text is buffered from the first period.
        mediaSourceEngine.segments[ContentType.AUDIO] =
            [false, false, true, true];
        mediaSourceEngine.segments[ContentType.VIDEO] =
            [false, false, true, true];

        // Seek back into the first Period.
        presentationTimeInSeconds -= 20;
        expect(presentationTimeInSeconds).toBeLessThan(29);
        streamingEngine.seeked();

        // Only the unbuffered streams were cleared.
        expect(mediaSourceEngine.clear).toHaveBeenCalledWith('audio');
        expect(mediaSourceEngine.clear).toHaveBeenCalledWith('video');
        expect(mediaSourceEngine.clear).not.toHaveBeenCalledWith('text');

        mediaSourceEngine.endOfStream.and.returnValue(Promise.resolve());
        return Promise.resolve();
      });

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;
      await runTest();

      // Verify buffers.
      expect(mediaSourceEngine.initSegments).toEqual({
        audio: [false, true],
        video: [false, true],
        text: [],
      });
      expect(mediaSourceEngine.segments).toEqual({
        audio: [true, true, true, true],
        video: [true, true, true, true],
        text: [true, true, true, true],
      });
    });

    // https://github.com/shaka-project/shaka-player/issues/2670
    it('rapid unbuffered seeks', async () => {
      // This test simulates rapid dragging of the seek bar, as in #2670.
      // In that issue, we would buffer the wrong segments due to a race
      // condition.

      // Part of the trigger of this issue is to have our seeks interrupt a
      // pending segment request.  So we will delay segment requests to make
      // that feasible in this test.
      // eslint-disable-next-line no-restricted-syntax
      const originalNetEngineRequest = netEngine.request.bind(netEngine);

      // Set to true when we have seeked all the way back to 0.
      let reachedStart = false;
      let requestInProgress = false;

      netEngine.request =
          jasmine.createSpy('request').and.callFake((requestType, request) => {
            if (reachedStart) {
              // Let the first round of requests pass quickly.
              return originalNetEngineRequest(requestType, request);
            }

            // Make this request take 3 simulated seconds.
            const delay = Util.fakeEventLoop(3);
            const op = shaka.util.AbortableOperation.notAbortable(delay);
            requestInProgress = true;
            return op.chain(() => {
              requestInProgress = false;
              return originalNetEngineRequest(requestType, request);
            });
          });

      onTick.and.callFake(() => {
        if (reachedStart) {
          // Our rapid seeking stops once we hit the start of the content.
          return;
        }

        if (!requestInProgress) {
          // Wait for a request to be in progress.
        } else {
          // Pause when we seek.
          playing = false;
          presentationTimeInSeconds = 0;
          streamingEngine.seeked();
          reachedStart = true;
        }
      });

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;

      expect(presentationTimeInSeconds).toBe(0);
      // Seek forward to the second-to-last segment.
      presentationTimeInSeconds = 25;
      streamingEngine.seeked();

      await runTest(Util.spyFunc(onTick));

      // Verify buffers.  When the bug is triggered, only segments 2 and 3 get
      // buffered.  When things are working correctly, we should start buffering
      // again from 0 after the seek.  Since bufferingGoal is only 5, segment 0
      // is the only one that should be buffered now.
      expect(mediaSourceEngine.segments).toEqual({
        audio: [true, false, false, false],
        video: [true, false, false, false],
        text: [true, false, false, false],
      });
    });
  });

  describe('handles seeks (live)', () => {
    beforeEach(() => {
      setupLive();
      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData, 0);

      // Retry on failure for live streams.
      const config = shaka.util.PlayerConfiguration.createDefault().streaming;
      config.failureCallback = () => streamingEngine.retry(0.1);

      createStreamingEngine(config);
      presentationTimeInSeconds = 100;

      // Ignore 404 errors in live stream tests.
      onError.and.callFake((error) => {
        if (error.code == shaka.util.Error.Code.BAD_HTTP_STATUS &&
            error.data[1] == 404) {
          // 404 error
        } else {
          fail(error);
        }
      });
    });

    it('outside segment availability window', async () => {
      segmentAvailability.start = 90;
      segmentAvailability.end = 110;

      presentationTimeInSeconds = 90;

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;

      // Seek forward to an unbuffered and unavailable region in the second
      // Period; set playing to false since the playhead can't move at the
      // seek target.
      expect(Util.invokeSpy(timeline.getSegmentAvailabilityEnd))
          .toBeLessThan(125);
      presentationTimeInSeconds = 125;
      playing = false;
      streamingEngine.seeked();

      // Eventually StreamingEngine should request the first segment (since
      // it needs the second segment) of the second Period when it becomes
      // available.
      const originalAppendBuffer =
          // eslint-disable-next-line no-restricted-syntax
          shaka.test.FakeMediaSourceEngine.prototype.appendBufferImpl;
      mediaSourceEngine.appendBuffer.and.callFake((type, data, reference) => {
        expect(presentationTimeInSeconds).toBe(125);
        // Ignore a possible call for the first Period.
        if (reference && reference.startTime >= 100) {
          expect(Util.invokeSpy(timeline.getSegmentAvailabilityStart))
              .not.toBeLessThan(100);
          expect(Util.invokeSpy(timeline.getSegmentAvailabilityEnd))
              .not.toBeLessThan(120);
          playing = true;
          mediaSourceEngine.appendBuffer.and.callFake(originalAppendBuffer);
        }

        // eslint-disable-next-line no-restricted-syntax
        return originalAppendBuffer.call(
            mediaSourceEngine, type, data, reference);
      });

      await runTest(slideSegmentAvailabilityWindow);
      // Verify buffers.
      expect(mediaSourceEngine.initSegments).toEqual({
        audio: [false, true],
        video: [false, true],
        text: [],
      });

      // Since we performed an unbuffered seek into the second Period, the
      // first 12 segments should not be buffered.
      for (let i = 0; i < 14; i++) {
        expect(mediaSourceEngine.segments[ContentType.AUDIO][i]).toBe(i >= 12);
        expect(mediaSourceEngine.segments[ContentType.VIDEO][i]).toBe(i >= 12);
        expect(mediaSourceEngine.segments[ContentType.TEXT][i]).toBe(i >= 12);
      }
    });
  });

  describe('handles errors', () => {
    beforeEach(() => {
      setupVod();
      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      createStreamingEngine();
    });

    it('from Stream setup', async () => {
      const createSegmentIndexSpy = Util.funcSpy(
          videoStream.createSegmentIndex);

      // Don't use returnValue with Promise.reject, or it may be detected as an
      // unhandled Promise rejection.
      createSegmentIndexSpy.and.callFake(() => Promise.reject('FAKE_ERROR'));

      onError.and.callFake((error) => {
        expect(error).toBe('FAKE_ERROR');
      });

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;
      await runTest();

      expect(videoStream.createSegmentIndex).toHaveBeenCalled();
      expect(onError).toHaveBeenCalled();
    });

    it('from Stream setup on switch', async () => {
      const expectedError = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.HTTP_ERROR);

      const createSegmentIndexSpy = Util.funcSpy(
          alternateVideoStream.createSegmentIndex);

      // Don't use returnValue with Promise.reject, or it may be detected as an
      // unhandled Promise rejection.
      createSegmentIndexSpy.and.callFake(() => Promise.reject(expectedError));

      onError.and.callFake((error) => {
        expect(error).toBe(expectedError);
      });

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;

      streamingEngine.switchVariant(
          alternateVariant, /* clear_buffer= */ true, /* safe_margin= */ 0);

      await runTest();

      expect(alternateVideoStream.createSegmentIndex).toHaveBeenCalled();
      expect(onError).toHaveBeenCalled();
    });

    it('from failed init segment append during startup', async () => {
      const expectedError = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.MEDIA_SOURCE_OPERATION_FAILED);

      onError.and.callFake((error) => {
        Util.expectToEqualError(error, expectedError);
      });

      const originalAppendBuffer =
          // eslint-disable-next-line no-restricted-syntax
          shaka.test.FakeMediaSourceEngine.prototype.appendBufferImpl;
      mediaSourceEngine.appendBuffer.and.callFake(
          (type, data, reference) => {
            // Reject the first video init segment.
            if (data == segmentData[ContentType.VIDEO].initSegments[0]) {
              return Promise.reject(expectedError);
            } else {
              // eslint-disable-next-line no-restricted-syntax
              return originalAppendBuffer.call(
                  mediaSourceEngine, type, data, reference);
            }
          });

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;
      await runTest();
      expect(onError).toHaveBeenCalled();
    });

    it('from failed media segment append during startup', async () => {
      const expectedError = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.MEDIA_SOURCE_OPERATION_FAILED);

      onError.and.callFake((error) => {
        Util.expectToEqualError(error, expectedError);
      });

      const originalAppendBuffer =
          // eslint-disable-next-line no-restricted-syntax
          shaka.test.FakeMediaSourceEngine.prototype.appendBufferImpl;
      mediaSourceEngine.appendBuffer.and.callFake(
          (type, data, reference) => {
            // Reject the first audio segment.
            if (data == segmentData[ContentType.AUDIO].segments[0]) {
              return Promise.reject(expectedError);
            } else {
              // eslint-disable-next-line no-restricted-syntax
              return originalAppendBuffer.call(
                  mediaSourceEngine, type, data, reference);
            }
          });

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;
      await runTest();
      expect(onError).toHaveBeenCalled();
    });

    it('from failed clear in switchVariant', async () => {
      const expectedError = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.MEDIA_SOURCE_OPERATION_FAILED);
      mediaSourceEngine.clear.and.returnValue(Promise.reject(expectedError));

      onError.and.stub();

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;

      streamingEngine.switchVariant(
          alternateVariant, /* clear_buffer= */ true, /* safe_margin= */ 0);

      await runTest();
      expect(onError).toHaveBeenCalledWith(Util.jasmineError(expectedError));
    });
  });

  describe('handles network errors', () => {
    it('ignores text stream failures if configured to', async () => {
      setupVod();
      const textUri = '0_text_0';
      // eslint-disable-next-line no-restricted-syntax
      const originalNetEngineRequest = netEngine.request.bind(netEngine);
      netEngine.request = jasmine.createSpy('request').and.callFake(
          (requestType, request) => {
            if (request.uris[0] == textUri) {
              return shaka.util.AbortableOperation.failed(new shaka.util.Error(
                  shaka.util.Error.Severity.CRITICAL,
                  shaka.util.Error.Category.NETWORK,
                  shaka.util.Error.Code.BAD_HTTP_STATUS, textUri, 404));
            }
            return originalNetEngineRequest(requestType, request);
          });
      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      const config = shaka.util.PlayerConfiguration.createDefault().streaming;
      config.ignoreTextStreamFailures = true;
      createStreamingEngine(config);

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;

      await runTest();
      expect(onError).not.toHaveBeenCalled();
      expect(mediaSourceEngine.endOfStream).toHaveBeenCalled();
    });

    it('retries if configured to', async () => {
      setupLive();

      // Wrap the NetworkingEngine to cause errors.
      const targetUri = '0_audio_init';
      failFirstRequestForTarget(netEngine, targetUri,
          shaka.util.Error.Code.BAD_HTTP_STATUS);

      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);

      const config = shaka.util.PlayerConfiguration.createDefault().streaming;
      config.failureCallback = () => streamingEngine.retry(0.1);
      createStreamingEngine(config);

      presentationTimeInSeconds = 100;

      onError.and.callFake((error) => {
        expect(error.severity).toBe(shaka.util.Error.Severity.CRITICAL);
        expect(error.category).toBe(shaka.util.Error.Category.NETWORK);
        expect(error.code).toBe(shaka.util.Error.Code.BAD_HTTP_STATUS);
      });

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;

      await runTest();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(mediaSourceEngine.endOfStream).toHaveBeenCalledTimes(1);

      const targetCalls = netEngine.request.calls.all().filter((data) => {
        const request = data.args[1];
        return request.uris[0] == targetUri;
      });
      expect(targetCalls.length).toBeGreaterThan(1);
    });

    it('does not retry if configured not to', async () => {
      setupLive();

      // Wrap the NetworkingEngine to cause errors.
      const targetUri = '0_audio_init';
      failFirstRequestForTarget(netEngine, targetUri,
          shaka.util.Error.Code.BAD_HTTP_STATUS);

      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);

      const config = shaka.util.PlayerConfiguration.createDefault().streaming;
      config.failureCallback = () => {};
      createStreamingEngine(config);

      presentationTimeInSeconds = 100;

      onError.and.callFake((error) => {
        expect(error.severity).toBe(shaka.util.Error.Severity.CRITICAL);
        expect(error.category).toBe(shaka.util.Error.Category.NETWORK);
        expect(error.code).toBe(shaka.util.Error.Code.BAD_HTTP_STATUS);
      });

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;

      await runTest();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(mediaSourceEngine.endOfStream).not.toHaveBeenCalled();

      const targetCalls = netEngine.request.calls.all().filter((data) => {
        const request = data.args[1];
        return request.uris[0] == targetUri;
      });
      expect(targetCalls.length).toBe(1);
    });

    it('does not invoke the callback if the error is handled', async () => {
      setupLive();

      // Wrap the NetworkingEngine to cause errors.
      const targetUri = '0_audio_init';
      failFirstRequestForTarget(netEngine, targetUri,
          shaka.util.Error.Code.BAD_HTTP_STATUS);

      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);

      // Configure with a failure callback
      const failureCallback = jasmine.createSpy('failureCallback');
      const config = shaka.util.PlayerConfiguration.createDefault().streaming;
      config.failureCallback = shaka.test.Util.spyFunc(failureCallback);
      createStreamingEngine(config);

      presentationTimeInSeconds = 100;

      onError.and.callFake((error) => {
        error.handled = true;
      });

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;

      await runTest();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(failureCallback).not.toHaveBeenCalled();
    });

    it('waits to invoke the failure callback', async () => {
      setupLive();

      // Wrap the NetworkingEngine to cause errors.
      const targetUri = '0_audio_init';
      failFirstRequestForTarget(netEngine, targetUri,
          shaka.util.Error.Code.BAD_HTTP_STATUS);

      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);

      // Configure with a failure callback that records the callback time.
      /** @type {number} */
      let callbackTime = 0;
      const failureCallback = jasmine.createSpy('failureCallback');
      failureCallback.and.callFake(() => {
        callbackTime = Date.now();
      });

      const config = shaka.util.PlayerConfiguration.createDefault().streaming;
      config.failureCallback = shaka.test.Util.spyFunc(failureCallback);
      config.retryParameters.maxAttempts = 2;
      config.retryParameters.baseDelay = 10000;
      config.retryParameters.fuzzFactor = 0;
      createStreamingEngine(config);

      presentationTimeInSeconds = 100;
      onError.and.stub();

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;

      const startTime = Date.now();
      await runTest();
      expect(failureCallback).toHaveBeenCalled();
      // baseDelay == 10000, maybe be longer due to delays in the event loop.
      expect(callbackTime - startTime).toBeGreaterThanOrEqual(10000);
    });

    it('temporarily disables stream if configured to do so', async () => {
      setupVod();

      const targetUri = '0_video_0';

      failRequestsForTarget(netEngine, targetUri);

      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      const config = shaka.util.PlayerConfiguration.createDefault().streaming;
      config.maxDisabledTime = 2;
      createStreamingEngine(config);

      spyOn(streamingEngine, 'makeAbortDecision_').and.callFake(() => {
        return Promise.resolve();
      });

      onError.and.callFake((error) => {
        expect(error.severity).toBe(shaka.util.Error.Severity.RECOVERABLE);
        expect(error.category).toBe(shaka.util.Error.Category.NETWORK);
        expect(error.code).toBe(shaka.util.Error.Code.BAD_HTTP_STATUS);
      });

      disableStream.and.callFake((stream, time) => {
        expect(stream).toBe(variant.video);
        expect(time).toBeGreaterThan(0);

        createAlternateSegmentIndex(stream, alternateVideoStream);

        streamingEngine.switchVariant(
            alternateVariant, /* clearBuffer= */ true,
            /* safeMargin= */ 0, /* force= */ true);
        return true;
      });

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;

      await runTest();
      expect(disableStream).toHaveBeenCalledTimes(1);
    });

    it('does not temporarily disables stream if not configured to',
        async () => {
          setupVod();

          const targetUri = '0_audio_init';
          failRequestsForTarget(
              netEngine, targetUri, shaka.util.Error.Code.HTTP_ERROR);

          mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
          const config =
              shaka.util.PlayerConfiguration.createDefault().streaming;
          config.maxDisabledTime = 0; // Do not disable streams.
          createStreamingEngine(config);

          onError.and.callFake((error) => {
            expect(error.code).toBe(shaka.util.Error.Code.HTTP_ERROR);
          });

          // Here we go!
          streamingEngine.switchVariant(variant);
          streamingEngine.switchTextStream(textStream);
          await streamingEngine.start();
          playing = true;

          await runTest();
          expect(disableStream).not.toHaveBeenCalled();
        });

    it('always tries to recover shaka.util.Error.Code.SEGMENT_MISSING',
        async () => {
          setupVod();

          const targetUri = '0_video_0';
          failRequestsForTarget(
              netEngine, targetUri, shaka.util.Error.Code.SEGMENT_MISSING);

          mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
          const config =
              shaka.util.PlayerConfiguration.createDefault().streaming;
          config.maxDisabledTime = 0; // Do not disable streams.
          createStreamingEngine(config);

          spyOn(streamingEngine, 'makeAbortDecision_').and.callFake(() => {
            return Promise.resolve();
          });

          onError.and.callFake((error) => {
            expect(error.severity).toBe(shaka.util.Error.Severity.RECOVERABLE);
            expect(error.category).toBe(shaka.util.Error.Category.NETWORK);
            expect(error.code).toBe(shaka.util.Error.Code.SEGMENT_MISSING);
          });

          disableStream.and.callFake((stream, time) => {
            expect(stream).toBe(variant.video);
            expect(time).toBeGreaterThan(0);

            createAlternateSegmentIndex(stream, alternateVideoStream);

            streamingEngine.switchVariant(
                alternateVariant, /* clearBuffer= */ true,
                /* safeMargin= */ 0, /* force= */ true);
            return true;
          });

          // Here we go!
          streamingEngine.switchVariant(variant);
          streamingEngine.switchTextStream(textStream);
          await streamingEngine.start();
          playing = true;

          await runTest();
          expect(disableStream).toHaveBeenCalledTimes(1);
        });

    it('throws recoverable error if try to disable stream succeeded',
        async () => {
          setupVod();

          const targetUri = '0_video_init';
          failRequestsForTarget(
              netEngine, targetUri, shaka.util.Error.Code.BAD_HTTP_STATUS);

          mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
          const config =
              shaka.util.PlayerConfiguration.createDefault().streaming;
          config.maxDisabledTime = 2;
          createStreamingEngine(config);

          disableStream.and.callFake(() => true);

          onError.and.callFake((error) => {
            expect(error).toEqual(jasmine.objectContaining({
              code: shaka.util.Error.Code.BAD_HTTP_STATUS,
              category: shaka.util.Error.Category.NETWORK,
              severity: shaka.util.Error.Severity.RECOVERABLE,
              handled: true,
            }));
          });

          // Here we go!
          streamingEngine.switchVariant(variant);
          streamingEngine.switchTextStream(textStream);
          await streamingEngine.start();
          playing = true;

          await runTest();
          expect(disableStream).toHaveBeenCalled();
          expect(onError).toHaveBeenCalled();
        });

    it('throws critical error if try to disable stream failed', async () => {
      setupVod();

      const targetUri = '0_video_init';
      failRequestsForTarget(
          netEngine, targetUri, shaka.util.Error.Code.BAD_HTTP_STATUS);

      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      const config = shaka.util.PlayerConfiguration.createDefault().streaming;
      config.maxDisabledTime = 2;
      createStreamingEngine(config);

      disableStream.and.callFake(() => false);

      onError.and.callFake((error) => {
        expect(error).toEqual(jasmine.objectContaining({
          code: shaka.util.Error.Code.BAD_HTTP_STATUS,
          category: shaka.util.Error.Category.NETWORK,
          severity: shaka.util.Error.Severity.CRITICAL,
          handled: false,
        }));
      });

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;

      await runTest();

      expect(disableStream).toHaveBeenCalled();
      expect(onError).toHaveBeenCalled();
    });
  });

  describe('retry()', () => {
    it('resumes streaming after failure', async () => {
      setupVod();

      // Wrap the NetworkingEngine to cause errors.
      const targetUri = '0_audio_init';
      const originalNetEngineRequest = netEngine.request;
      failFirstRequestForTarget(netEngine, targetUri,
          shaka.util.Error.Code.BAD_HTTP_STATUS);

      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      createStreamingEngine();

      onError.and.callFake((error) => {
        // Restore the original fake request function.
        netEngine.request = originalNetEngineRequest;
        netEngine.request.calls.reset();

        // Retry streaming.
        expect(streamingEngine.retry(0.1)).toBe(true);
      });

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;

      await runTest();
      // We definitely called onError().
      expect(onError).toHaveBeenCalledTimes(1);
      // We reset the request calls in onError() just before retry(), so this
      // count reflects new calls since retry().
      expect(netEngine.request).toHaveBeenCalled();
      // The retry worked, so we should have reached the end of the stream.
      expect(mediaSourceEngine.endOfStream).toHaveBeenCalledTimes(1);
    });

    it('does not resume streaming after quota error', async () => {
      setupVod();

      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      createStreamingEngine();

      onError.and.callFake((error) => {
        expect(error.code).toBe(shaka.util.Error.Code.QUOTA_EXCEEDED_ERROR);

        // Retry streaming, which should fail and return false.
        netEngine.request.calls.reset();
        expect(streamingEngine.retry(0.1)).toBe(false);
      });

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;

      await runTest(() => {
        if (presentationTimeInSeconds == 2) {
          // Now that we're streaming, throw QuotaExceededError on every segment
          // to quickly trigger the quota error.
          const appendBufferSpy = jasmine.createSpy('appendBuffer');
          appendBufferSpy.and.callFake((type, data, reference) => {
            throw new shaka.util.Error(
                shaka.util.Error.Severity.CRITICAL,
                shaka.util.Error.Category.MEDIA,
                shaka.util.Error.Code.QUOTA_EXCEEDED_ERROR,
                type);
          });
          mediaSourceEngine.appendBuffer = appendBufferSpy;
        }
      });

      // We definitely called onError().
      expect(onError).toHaveBeenCalledTimes(1);

      // We reset the request calls in onError() just before retry(), so this
      // count reflects new calls since retry().
      expect(netEngine.request).not.toHaveBeenCalled();
      expect(mediaSourceEngine.endOfStream).not.toHaveBeenCalled();
    });

    it('does not resume streaming after destruction', async () => {
      setupVod();

      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      createStreamingEngine();

      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;

      // Here we go!
      await runTest(() => {
        if (presentationTimeInSeconds == 3) {
          streamingEngine.destroy();

          // Retry streaming, which should fail and return false.
          netEngine.request.calls.reset();
          expect(streamingEngine.retry(0.1)).toBe(false);
        }
      });

      // We reset the request calls in onError() just before retry(), so this
      // count reflects new calls since retry().
      expect(netEngine.request).not.toHaveBeenCalled();
      expect(mediaSourceEngine.endOfStream).not.toHaveBeenCalled();
    });
  });

  describe('eviction', () => {
    let config;

    beforeEach(() => {
      setupVod();

      manifest.minBufferTime = 1;

      config = shaka.util.PlayerConfiguration.createDefault().streaming;
      config.rebufferingGoal = 1;
      config.bufferingGoal = 1;
      config.bufferBehind = 10;
    });

    it('evicts media to meet the max buffer tail limit', async () => {
      // Create StreamingEngine.
      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      createStreamingEngine(config);

      const originalRemove =
          // eslint-disable-next-line no-restricted-syntax
          shaka.test.FakeMediaSourceEngine.prototype.removeImpl
              .bind(mediaSourceEngine);

      mediaSourceEngine.remove.and.callFake((type, start, end) => {
        expect(presentationTimeInSeconds).toBeGreaterThanOrEqual(20);
        expect(start).toBe(0);
        expect(end).toBe(10);

        if (mediaSourceEngine.remove.calls.count() == 3) {
          mediaSourceEngine.remove.and.callFake((type, start, end) => {
            expect(presentationTimeInSeconds).toBeGreaterThanOrEqual(30);
            expect(start).toBe(10);
            expect(end).toBe(20);
            return originalRemove(type, start, end);
          });
        }

        return originalRemove(type, start, end);
      });

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;

      // Since StreamingEngine is free to peform audio, video, and text updates
      // in any order, there are many valid ways in which StreamingEngine can
      // evict segments. So, instead of verifying the exact, final buffer
      // configuration, ensure the byte limit is never exceeded and at least
      // one segment of each type is buffered at the end of the test.
      await runTest();
      expect(mediaSourceEngine.endOfStream).toHaveBeenCalled();

      expect(mediaSourceEngine.remove)
          .toHaveBeenCalledWith(ContentType.AUDIO, 0, 10);
      expect(mediaSourceEngine.remove)
          .toHaveBeenCalledWith(ContentType.AUDIO, 10, 20);

      expect(mediaSourceEngine.remove)
          .toHaveBeenCalledWith(ContentType.VIDEO, 0, 10);
      expect(mediaSourceEngine.remove)
          .toHaveBeenCalledWith(ContentType.VIDEO, 10, 20);

      expect(mediaSourceEngine.remove)
          .toHaveBeenCalledWith(ContentType.TEXT, 0, 10);
      expect(mediaSourceEngine.remove)
          .toHaveBeenCalledWith(ContentType.TEXT, 10, 20);

      // Verify buffers.
      expect(mediaSourceEngine.initSegments).toEqual({
        audio: [false, true],
        video: [false, true],
        text: [],
      });
      expect(mediaSourceEngine.segments).toEqual({
        audio: [false, false, true, true],
        video: [false, false, true, true],
        text: [false, false, true, true],
      });
    });

    it('doesn\'t evict too much when bufferBehind is very low', async () => {
      // Set the bufferBehind to a value significantly below the segment size.
      config.bufferBehind = 0.1;

      // Create StreamingEngine.
      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      createStreamingEngine(config);
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;

      await runTest(() => {
        if (presentationTimeInSeconds == 8) {
          // Run the test until a bit before the end of the first segment.
          playing = false;
        } else if (presentationTimeInSeconds == 6) {
          // Soon before stopping the test, set the buffering goal up way
          // higher to trigger more segment fetching, to (potentially) trigger
          // an eviction.
          config.bufferingGoal = 5;
          streamingEngine.configure(config);
        }
      });

      // It should not have removed any segments.
      expect(mediaSourceEngine.remove).not.toHaveBeenCalled();
    });
  });

  describe('QuotaExceededError', () => {
    it('does not fail immediately', async () => {
      setupVod();

      manifest.minBufferTime = 1;

      // Create StreamingEngine.
      const config = shaka.util.PlayerConfiguration.createDefault().streaming;
      config.rebufferingGoal = 1;
      config.bufferingGoal = 1;
      config.bufferBehind = 10;

      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      createStreamingEngine(config);

      const originalAppendBuffer =
          // eslint-disable-next-line no-restricted-syntax
          shaka.test.FakeMediaSourceEngine.prototype.appendBufferImpl;
      const appendBufferSpy = jasmine.createSpy('appendBuffer');
      mediaSourceEngine.appendBuffer = appendBufferSpy;

      // Throw two QuotaExceededErrors at different times.
      let numErrorsThrown = 0;
      appendBufferSpy.and.callFake(
          (type, data, reference) => {
            const throwError = reference &&
                ((numErrorsThrown == 0 && reference.startTime == 10) ||
                 (numErrorsThrown == 1 && reference.startTime == 20));
            if (throwError) {
              numErrorsThrown++;
              throw new shaka.util.Error(
                  shaka.util.Error.Severity.CRITICAL,
                  shaka.util.Error.Category.MEDIA,
                  shaka.util.Error.Code.QUOTA_EXCEEDED_ERROR,
                  type);
            } else {
              // eslint-disable-next-line no-restricted-syntax
              const p = originalAppendBuffer.call(
                  mediaSourceEngine, type, data, reference);
              return p;
            }
          });

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;

      await runTest();
      expect(mediaSourceEngine.endOfStream).toHaveBeenCalled();

      // Verify buffers.
      expect(mediaSourceEngine.initSegments).toEqual({
        audio: [false, true],
        video: [false, true],
        text: [],
      });
      expect(mediaSourceEngine.segments).toEqual({
        audio: [false, false, true, true],
        video: [false, false, true, true],
        text: [false, false, true, true],
      });
    });

    it('fails after multiple QuotaExceededError', async () => {
      setupVod();

      manifest.minBufferTime = 1;

      // Create StreamingEngine.
      const config = shaka.util.PlayerConfiguration.createDefault().streaming;
      config.rebufferingGoal = 1;
      config.bufferingGoal = 1;

      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      createStreamingEngine(config);

      const originalAppendBuffer =
          // eslint-disable-next-line no-restricted-syntax
          shaka.test.FakeMediaSourceEngine.prototype.appendBufferImpl;
      const appendBufferSpy = jasmine.createSpy('appendBuffer');
      mediaSourceEngine.appendBuffer = appendBufferSpy;

      // Throw QuotaExceededError multiple times after at least one segment of
      // each type has been appended.
      appendBufferSpy.and.callFake(
          (type, data, reference) => {
            if (reference && reference.startTime >= 10) {
              throw new shaka.util.Error(
                  shaka.util.Error.Severity.CRITICAL,
                  shaka.util.Error.Category.MEDIA,
                  shaka.util.Error.Code.QUOTA_EXCEEDED_ERROR,
                  type);
            } else {
              // eslint-disable-next-line no-restricted-syntax
              const p = originalAppendBuffer.call(
                  mediaSourceEngine, type, data, reference);
              return p;
            }
          });

      onError.and.callFake((error) => {
        expect(error.code).toBe(shaka.util.Error.Code.QUOTA_EXCEEDED_ERROR);
        expect(error.data[0] == ContentType.AUDIO ||
               error.data[0] == ContentType.VIDEO ||
               error.data[0] == ContentType.TEXT).toBe(true);
      });

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;

      // Stop the playhead after 10 seconds since will not append any
      // segments after this time.
      const stopPlayhead = () => {
        playing = presentationTimeInSeconds < 10;
      };

      await runTest(stopPlayhead);
      expect(onError).toHaveBeenCalled();
      expect(mediaSourceEngine.endOfStream).not.toHaveBeenCalled();
    });
  });

  describe('VOD drift', () => {
    beforeEach(() => {
      setupVod();
    });

    /**
     * @param {number} drift
     */
    async function testPositiveDrift(drift) {
      mediaSourceEngine =
          new shaka.test.FakeMediaSourceEngine(segmentData, drift);
      createStreamingEngine();

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;

      await runTest();
      expect(mediaSourceEngine.endOfStream).toHaveBeenCalled();

      // Verify buffers.
      expect(mediaSourceEngine.initSegments).toEqual({
        audio: [false, true],
        video: [false, true],
        text: [],
      });
      expect(mediaSourceEngine.segments).toEqual({
        audio: [true, true, true, true],
        video: [true, true, true, true],
        text: [true, true, true, true],
      });
    }

    /**
     * @param {number} drift
     */
    async function testNegativeDrift(drift) {
      mediaSourceEngine =
          new shaka.test.FakeMediaSourceEngine(segmentData, drift);
      createStreamingEngine();

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;

      await runTest();
      expect(mediaSourceEngine.endOfStream).toHaveBeenCalled();

      // Verify buffers.
      expect(mediaSourceEngine.initSegments).toEqual({
        audio: [false, true],
        video: [false, true],
        text: [],
      });
      expect(mediaSourceEngine.segments).toEqual({
        audio: [true, true, true, true],
        video: [true, true, true, true],
        text: [true, true, true, true],
      });
    }

    it('is handled for small + values', () => testPositiveDrift(3));
    it('is handled for large + values', () => testPositiveDrift(12));
    it('is handled for small - values', () => testNegativeDrift(-3));
  });

  describe('live drift', () => {
    beforeEach(() => {
      setupLive();
    });

    /**
     * @param {number} drift
     */
    async function testNegativeDrift(drift) {
      mediaSourceEngine =
          new shaka.test.FakeMediaSourceEngine(segmentData, drift);
      createStreamingEngine();

      presentationTimeInSeconds = 100;

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;

      await runTest(slideSegmentAvailabilityWindow);
      expect(mediaSourceEngine.endOfStream).toHaveBeenCalled();

      // Verify buffers.
      expect(mediaSourceEngine.initSegments).toEqual({
        audio: [false, true],
        video: [false, true],
        text: [],
      });

      // Since we started playback from segment 11, segments 10 through 14
      // should be buffered.  Those segment numbers are 1-based, and this array
      // is 0-based, so we expect i >= 9 to be downloaded.
      const segments = mediaSourceEngine.segments;
      for (let i = 0; i < 14; i++) {
        expect(segments[ContentType.AUDIO][i]).withContext(i).toBe(i >= 9);
        expect(segments[ContentType.VIDEO][i]).withContext(i).toBe(i >= 9);
        expect(segments[ContentType.TEXT][i]).withContext(i).toBe(i >= 9);
      }
    }

    it('is handled for large - values', () => testNegativeDrift(-12));
  });

  describe('setTrickPlay', () => {
    it('uses trick mode track when requested', async () => {
      setupVod(/* trickMode= */ true);
      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);

      const config = shaka.util.PlayerConfiguration.createDefault().streaming;
      // Only buffer ahead 1 second to make it easier to set segment
      // expectations based on playheadTime.
      config.rebufferingGoal = 1;
      config.bufferingGoal = 1;
      createStreamingEngine(config);

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;

      await runTest(() => {
        if (presentationTimeInSeconds == 1) {
          expect(mediaSourceEngine.initSegments).toEqual({
            audio: [true, false],
            video: [true, false],
            trickvideo: [false, false],
            text: [],
          });
          expect(mediaSourceEngine.segments).toEqual({
            audio: [true, false, false, false],
            video: [true, false, false, false],
            trickvideo: [false, false, false, false],
            text: [true, false, false, false],
          });

          // Engage trick play.
          streamingEngine.setTrickPlay(true);
        } else if (presentationTimeInSeconds == 11) {
          // We're in the second segment, in trick play mode.
          expect(mediaSourceEngine.initSegments).toEqual({
            audio: [true, false],
            video: [true, false],
            trickvideo: [true, false],
            text: [],
          });
          expect(mediaSourceEngine.segments).toEqual({
            audio: [true, true, false, false],
            video: [true, false, false, false],
            trickvideo: [false, true, false, false],
            text: [true, true, false, false],
          });
        } else if (presentationTimeInSeconds == 21) {
          // We've started the second period, still in trick play mode.
          expect(mediaSourceEngine.initSegments).toEqual({
            audio: [false, true],
            video: [true, false],  // no init segment fetched for normal video
            trickvideo: [false, true],
            text: [],
          });
          expect(mediaSourceEngine.segments).toEqual({
            audio: [true, true, true, false],
            video: [true, false, false, false],
            trickvideo: [false, true, true, false],
            text: [true, true, true, false],
          });
        } else if (presentationTimeInSeconds == 31) {
          // We've started the final segment, still in trick play mode.
          expect(mediaSourceEngine.initSegments).toEqual({
            audio: [false, true],
            video: [true, false],  // no init segment appended for normal video
            trickvideo: [false, true],
            text: [],
          });
          expect(mediaSourceEngine.segments).toEqual({
            audio: [true, true, true, true],
            video: [true, false, false, false],
            trickvideo: [false, true, true, true],
            text: [true, true, true, true],
          });

          // Disengage trick play mode, which will clear the video buffer.
          streamingEngine.setTrickPlay(false);
        } else if (presentationTimeInSeconds == 39) {
          // We're 1 second from the end of the stream now.
          expect(mediaSourceEngine.initSegments).toEqual({
            audio: [false, true],
            video: [false, true],  // init segment appended for normal video now
            trickvideo: [false, true],
            text: [],
          });
          expect(mediaSourceEngine.segments).toEqual({
            audio: [true, true, true, true],
            video: [false, false, false, true],
            trickvideo: [false, false, false, false],  // cleared
            text: [true, true, true, true],
          });
        }
      });
      expect(mediaSourceEngine.endOfStream).toHaveBeenCalled();
    });
  });

  describe('embedded emsg boxes', () => {
    // V0 box format
    const emsgSegmentV0 = Uint8ArrayUtils.fromHex(
        '0000003b656d736700000000666f6f3a6261723a637573746f6d646174617363' +
        '68656d6500310000000001000000080000ffff0000000174657374');

    // V1 box format
    const emsgSegmentV1 = Uint8ArrayUtils.fromHex(
        '0000003f656d7367010000000000000100000000000000080000ffff00000001' +
        '666f6f3a6261723a637573746f6d64617461736368656d6500310074657374');

    // V1 box format, non-zero start time
    const emsgSegmentV1NonZeroStart = Uint8ArrayUtils.fromHex(
        '0000003f656d7367010000000000000100000000000000120000ffff00000001' +
        '666f6f3a6261723a637573746f6d64617461736368656d6500310074657374');

    const dummyBox = Uint8ArrayUtils.fromHex('0000000c6672656501020304');

    const emsgSegmentV0Twice =
        Uint8ArrayUtils.concat(emsgSegmentV0, dummyBox, emsgSegmentV0);

    // This is an 'emsg' box that contains a scheme of
    // urn:mpeg:dash:event:2012 to indicate a manifest update.
    const emsgSegmentV0ReloadManifest = Uint8ArrayUtils.fromHex(
        '0000003a656d73670000000075726e3a6d7065673a646173683a6576656e743a' +
        '3230313200000000003100000008000000ff0000000c74657374');

    const reloadManifestSchemeUri = 'urn:mpeg:dash:event:2012';

    // This is an 'emsg' box that contains a scheme of
    // https://aomedia.org/emsg/ID to indicate a ID3 metadata.
    const emsgSegmentV0ID3 = Uint8ArrayUtils.fromHex((
      // 105 bytes  emsg box     v0, flags 0
      '00 00 00 69  65 6d 73 67  00 00 00 00' +

      // scheme id uri (13 bytes) 'https://aomedia.org/emsg/ID3'
      '68 74 74 70  73 3a 2f 2f   61 6f 6d 65  64 69 61 2e' +
      '6f 72 67 2f  65 6d 73 67   2f 49 44 33  00' +

      // value (1 byte) ''
      '00' +

      // timescale (4 bytes) 49
      '00 00 00 31' +

      // presentation time delta (4 bytes) 8
      '00 00 00 08' +

      // event duration (4 bytes) 255
      '00 00 00 ff' +

      // id (4 bytes) 51
      '00 00 00 33' +

      // message data (47 bytes)
      '49 44 33 03  00 40 00 00   00 1b 00 00  00 06 00 00' +
      '00 00 00 02  54 58 58 58   00 00 00 07  e0 00 03 00' +
      '53 68 61 6b  61 33 44 49   03 00 40 00  00 00 1b'
    ).replace(/\s/g, ''));

    const id3SchemeUri = 'https://aomedia.org/emsg/ID3';

    const emsgObj = {
      startTime: 8,
      endTime: 0xffff + 8,
      schemeIdUri: 'foo:bar:customdatascheme',
      value: '1',
      timescale: 1,
      presentationTimeDelta: 8,
      eventDuration: 0xffff,
      id: 1,
      messageData: new Uint8Array([0x74, 0x65, 0x73, 0x74]),
    };

    const emsgObjWithOffset = {
      startTime: -2,
      endTime: 0xffff - 2,
      schemeIdUri: 'foo:bar:customdatascheme',
      value: '1',
      timescale: 1,
      presentationTimeDelta: -2,
      eventDuration: 0xffff,
      id: 1,
      messageData: new Uint8Array([0x74, 0x65, 0x73, 0x74]),
    };

    beforeEach(() => {
      // setup an offset for the timestamps.
      setupVod(false, 10);
      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      createStreamingEngine();
    });

    function setSegment0(emsgBox) {
      segmentData[ContentType.VIDEO].segments[0] = emsgBox;
    }

    it('raises an event for registered embedded emsg boxes', async () => {
      setSegment0(emsgSegmentV0);
      videoStream.emsgSchemeIdUris = [emsgObj.schemeIdUri];

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;
      await runTest();

      expect(onEvent).toHaveBeenCalledTimes(1);

      const event = onEvent.calls.argsFor(0)[0];
      expect(event.detail).toEqual(emsgObj);
    });

    it('raises an event for registered embedded v1 emsg boxes', async () => {
      setSegment0(emsgSegmentV1);
      videoStream.emsgSchemeIdUris = [emsgObjWithOffset.schemeIdUri];

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;
      await runTest();

      expect(onEvent).toHaveBeenCalledTimes(1);

      const event = onEvent.calls.argsFor(0)[0];
      expect(event.detail).toEqual(emsgObjWithOffset);
    });

    it('raises multiple events', async () => {
      setSegment0(emsgSegmentV0Twice);
      videoStream.emsgSchemeIdUris = [emsgObj.schemeIdUri];

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;
      await runTest();

      expect(onEvent).toHaveBeenCalledTimes(2);
    });

    it('won\'t raise an event for an unregistered emsg box', async () => {
      setSegment0(emsgSegmentV0);

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;
      await runTest();

      expect(onEvent).not.toHaveBeenCalled();
    });

    it('won\'t raise an event when no emsg boxes present', async () => {
      videoStream.emsgSchemeIdUris = [emsgObj.schemeIdUri];

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;
      await runTest();

      expect(onEvent).not.toHaveBeenCalled();
    });

    it('triggers manifest updates', async () => {
      setSegment0(emsgSegmentV0ReloadManifest);
      videoStream.emsgSchemeIdUris = [reloadManifestSchemeUri];

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;
      await runTest();

      expect(onEvent).not.toHaveBeenCalled();
      expect(onManifestUpdate).toHaveBeenCalled();
    });

    it('triggers both emsg event and metadata event for ID3', async () => {
      setSegment0(emsgSegmentV0ID3);
      videoStream.emsgSchemeIdUris = [id3SchemeUri];

      onEvent.and.callFake((emsgEvent) => {
        expect(emsgEvent.type).toBe('emsg');
      });

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;
      await runTest();

      expect(onEvent).toHaveBeenCalled();
      expect(onMetadata).toHaveBeenCalled();
    });

    it('only triggers emsg event for ID3 if event canceled', async () => {
      setSegment0(emsgSegmentV0ID3);
      videoStream.emsgSchemeIdUris = [id3SchemeUri];

      onEvent.and.callFake((emsgEvent) => {
        expect(emsgEvent.type).toBe('emsg');
        emsgEvent.preventDefault();
      });

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;
      await runTest();

      expect(onEvent).toHaveBeenCalled();
      expect(onMetadata).not.toHaveBeenCalled();
    });

    it('event start matches presentation time', async () => {
      // This box has a non-zero event time, which doesn't matter.
      setSegment0(emsgSegmentV1NonZeroStart);
      videoStream.emsgSchemeIdUris = [emsgObj.schemeIdUri];

      // Here we go!
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;
      await runTest();

      expect(onEvent).toHaveBeenCalledTimes(1);

      const event = onEvent.calls.argsFor(0)[0];
      expect(event.detail).toEqual(emsgObj);
    });
  });

  describe('embedded prft boxes', () => {
    const prftSegment = Uint8ArrayUtils.fromHex(
        '00000020707266740100000000000001E683B62E8E63CC580000001B319D5767');
    const mdhdSegment = Uint8ArrayUtils.fromHex(
        '000000446D6F6F760000003C7472616B000000346D6469610000002C6D646864'+
        '0100000000000000DF22526500000000DF22526500989680FFFFFFFFFFFFFFFF'+
        '15C70000');

    const prftEventObj = {
      wallClockTime: 1658402734556,
      startDate: new Date(1658391054904.7898),
    };

    beforeEach(() => {
      setupVod();
      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      const config = shaka.util.PlayerConfiguration.createDefault().streaming;
      config.parsePrftBox = true;
      createStreamingEngine(config);
    });

    it('raises an event for registered prft v1', async () => {
      segmentData[ContentType.VIDEO].segments[0] = prftSegment;
      segmentData[ContentType.VIDEO].initSegments[0] = mdhdSegment;

      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;
      await runTest();
      expect(onEvent).toHaveBeenCalled();

      const event = onEvent.calls.argsFor(0)[0];
      expect(event.detail.wallClockTime).toBe(prftEventObj.wallClockTime);
      expect(event.detail.programStartDate.getUTCMilliseconds()).toBe(
          prftEventObj.startDate.getUTCMilliseconds());
      expect(event.detail.programStartDate.toUTCString()).toBe(
          prftEventObj.startDate.toUTCString());
    });

    it('raises an event for registered prft v0', async () => {
      const prftSegment = Uint8ArrayUtils.fromHex(
          '0000001C707266740000000000000001E683B62E8E63CC5819999999');
      const expectedStartDate = new Date(1658402691606.3271);
      segmentData[ContentType.VIDEO].segments[0] = prftSegment;
      segmentData[ContentType.VIDEO].initSegments[0] = mdhdSegment;

      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;
      await runTest();
      expect(onEvent).toHaveBeenCalled();

      const event = onEvent.calls.argsFor(0)[0];
      expect(event.detail.wallClockTime).toBe(prftEventObj.wallClockTime);
      expect(event.detail.programStartDate.getUTCMilliseconds()).toBe(
          expectedStartDate.getUTCMilliseconds());
      expect(event.detail.programStartDate.toUTCString()).toBe(
          expectedStartDate.toUTCString());
    });

    it('raises an event once only', async () => {
      segmentData[ContentType.VIDEO].segments[0] =
          shaka.util.Uint8ArrayUtils.concat(prftSegment, prftSegment);
      segmentData[ContentType.VIDEO].segments[1] = prftSegment;
      segmentData[ContentType.VIDEO].initSegments[0] = mdhdSegment;

      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      playing = true;
      await runTest();
      expect(onEvent).toHaveBeenCalledTimes(1);
    });
  });

  describe('network downgrading', () => {
    /** @type {shaka.extern.Variant} */
    let initialVariant;
    /** @type {shaka.extern.Variant} */
    let newVariant;
    /** @type {!Array.<string>} */
    let requestUris;
    /** @type {!Array.<shaka.util.PublicPromise>} */
    let delayedRequests;
    /** @type {shaka.net.NetworkingEngine.PendingRequest} */
    let lastPendingRequest;
    /** @type {boolean} */
    let shouldDelayRequests;

    beforeEach(() => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.presentationTimeline.setDuration(60);
        manifest.addVariant(0, (variant) => {
          variant.bandwidth = 500;
          variant.addVideo(10, (stream) => {
            stream.useSegmentTemplate(
                'video-10-%d.mp4', /* segmentDuration= */ 10,
                /* segmentSize= */ 50);
          });
        });
        manifest.addVariant(1, (variant) => {
          variant.bandwidth = 100;
          variant.addVideo(11, (stream) => {
            stream.useSegmentTemplate(
                'video-11-%d.mp4', /* segmentDuration= */ 10,
                /* segmentSize= */ 10);
          });
        });
      });

      initialVariant = manifest.variants[0];
      newVariant = manifest.variants[1];
      requestUris = [];
      delayedRequests = [];
      lastPendingRequest = null;
      shouldDelayRequests = true;
      playing = false;
      presentationTimeInSeconds = 0;

      // For these tests, we don't care about specific data appended.
      // Just return any old ArrayBuffer for any requested segment.
      netEngine = new shaka.test.FakeNetworkingEngine();
      netEngine.request.and.callFake((requestType, request, context) => {
        const buffer = new ArrayBuffer(0);
        const response = {uri: request.uris[0], data: buffer, headers: {}};
        const bytes = new shaka.net.NetworkingEngine.NumBytesRemainingClass();
        bytes.setBytes(200);

        const delay = new shaka.util.PublicPromise();
        delayedRequests.push(delay);

        const run = async () => {
          shaka.log.v1('new request', request.uris[0]);
          if (shouldDelayRequests) {
            shaka.log.v1('delaying request', request.uris[0]);
            await delay;
          }
          // Only add if the segment was appended; if it was aborted this
          // won't be called.
          shaka.log.v1('completing request', request.uris[0]);
          requestUris.push(request.uris[0]);
          return response;
        };

        const abort = () => {
          shaka.log.v1('aborting request', request.uris[0]);
          delay.reject(new shaka.util.Error(
              shaka.util.Error.Severity.CRITICAL,
              shaka.util.Error.Category.PLAYER,
              shaka.util.Error.Code.OPERATION_ABORTED));
          return Promise.resolve();
        };

        lastPendingRequest = new shaka.net.NetworkingEngine.PendingRequest(
            run(), abort, bytes);
        spyOn(lastPendingRequest, 'abort').and.callThrough();
        return lastPendingRequest;
      });

      // For these tests, we also don't need FakeMediaSourceEngine to verify
      // its input data.
      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine({});
      mediaSourceEngine.bufferStart.and.returnValue(0);
      mediaSourceEngine.clear.and.returnValue(Promise.resolve());
      mediaSourceEngine.remove.and.returnValue(Promise.resolve());
      mediaSourceEngine.setStreamProperties.and.returnValue(Promise.resolve());

      // Naive buffered range tracking that only tracks the buffer end.
      const bufferEnd = {audio: 0, video: 0, text: 0};
      mediaSourceEngine.appendBuffer.and.callFake((type, data, reference) => {
        bufferEnd[type] = reference && reference.endTime;
        return Promise.resolve();
      });
      mediaSourceEngine.bufferEnd.and.callFake((type) => bufferEnd[type]);
      mediaSourceEngine.bufferedAheadOf.and.callFake(
          (type, start) => Math.max(0, bufferEnd[type] - start));
      mediaSourceEngine.isBuffered.and.callFake(
          (type, time) => time >= 0 && time < bufferEnd[type]);

      const config = shaka.util.PlayerConfiguration.createDefault().streaming;
      config.bufferingGoal = 30;
      config.retryParameters.maxAttempts = 1;
      createStreamingEngine(config);

      getBandwidthEstimate.and.returnValue(1);  // very slow by default
    });

    it('aborts pending requests', async () => {
      await prepareForAbort();

      /** @type {shaka.net.NetworkingEngine.PendingRequest} */
      const secondRequest = lastPendingRequest;

      // This should abort the pending request for the second segment.
      streamingEngine.switchVariant(
          newVariant, /* clear_buffer= */ false, /* safe_margin= */ 0);

      await bufferAndCheck(/* didAbort= */ true);

      expect(secondRequest.abort).toHaveBeenCalled();
    });

    it('still aborts if previous segment size unknown', async () => {
      // This should use the "bytes remaining" from the request instead of the
      // previous stream's size.
      const videoStream = manifest.variants[0].video;
      await videoStream.createSegmentIndex();
      const segmentIndex = videoStream.segmentIndex;
      const oldGet = segmentIndex.get;
      videoStream.segmentIndex.get = (idx) => {
        // eslint-disable-next-line no-restricted-syntax
        const seg = oldGet.call(segmentIndex, idx);
        if (seg) {
          // With endByte being null, we won't know the segment size.
          return new shaka.media.SegmentReference(
              seg.startTime, seg.endTime, seg.getUrisInner,
              /* startByte= */ 0, /* endByte= */ null,
              /* initSegmentReference= */ null, /* timestampOffset= */ 0,
              /* appendWindowStart= */ 0, /* appendWindowEnd= */ Infinity);
        } else {
          return seg;
        }
      };

      await prepareForAbort();
      streamingEngine.switchVariant(
          newVariant, /* clear_buffer= */ false, /* safe_margin= */ 0);

      await bufferAndCheck(/* didAbort= */ true);
    });

    it('doesn\'t abort if close to finished', async () => {
      await prepareForAbort();
      setBytesRemaining(3);
      streamingEngine.switchVariant(
          newVariant, /* clear_buffer= */ false, /* safe_margin= */ 0);

      await bufferAndCheck(/* didAbort= */ false);
    });

    it('doesn\'t abort if init segment is too large', async () => {
      const initSegmentReference =
          new shaka.media.InitSegmentReference(() => ['init-11.mp4'], 0, 500);
      await newVariant.video.createSegmentIndex();
      overrideInitSegment(newVariant.video, initSegmentReference);

      await prepareForAbort();
      streamingEngine.switchVariant(
          newVariant, /* clear_buffer= */ false, /* safe_margin= */ 0);

      await bufferAndCheck(/* didAbort= */ false, /* hasInit= */ true);
    });

    it('still aborts with small init segment', async () => {
      const initSegmentReference =
          new shaka.media.InitSegmentReference(() => ['init-11.mp4'], 0, 5);
      await newVariant.video.createSegmentIndex();
      overrideInitSegment(newVariant.video, initSegmentReference);

      await prepareForAbort();
      streamingEngine.switchVariant(
          newVariant, /* clear_buffer= */ false, /* safe_margin= */ 0);

      await bufferAndCheck(/* didAbort= */ true, /* hasInit= */ true);
    });

    it('aborts if we can finish the new one on time', async () => {
      // Very large init segment
      const initSegmentReference =
          new shaka.media.InitSegmentReference(() => ['init-11.mp4'], 0, 5e6);
      await newVariant.video.createSegmentIndex();
      overrideInitSegment(newVariant.video, initSegmentReference);

      await prepareForAbort();

      setBytesRemaining(3);  // not much left
      getBandwidthEstimate.and.returnValue(1e9);  // insanely fast

      streamingEngine.switchVariant(
          newVariant, /* clear_buffer= */ false, /* safe_margin= */ 0);

      await bufferAndCheck(/* didAbort= */ true, /* hasInit= */ true);
    });

    it('aborts pending requests after fetching new segment index', async () => {
      await prepareForAbort();

      /** @type {shaka.net.NetworkingEngine.PendingRequest} */
      const secondRequest = lastPendingRequest;

      // Simulate a segment index which is not yet available.  This is
      // necessary because the fake content used in this test is in the style
      // of a segment template, where the index is already known.
      const segmentIndex = newVariant.video.segmentIndex;
      expect(segmentIndex).not.toBe(null);
      newVariant.video.segmentIndex = null;
      newVariant.video.createSegmentIndex = () => {
        newVariant.video.segmentIndex = segmentIndex;
        return Promise.resolve();
      };

      // This should abort the pending request for the second segment.
      streamingEngine.switchVariant(newVariant);

      await bufferAndCheck(/* didAbort= */ true);

      expect(secondRequest.abort).toHaveBeenCalled();
    });

    it('still aborts if new segment size unknown', async () => {
      const videoStream = manifest.variants[1].video;
      videoStream.bandwidth = 10;
      await videoStream.createSegmentIndex();
      const segmentIndex = videoStream.segmentIndex;
      const oldGet = segmentIndex.get;
      videoStream.segmentIndex.get = (idx) => {
        // eslint-disable-next-line no-restricted-syntax
        const seg = oldGet.call(segmentIndex, idx);
        if (seg) {
          // With endByte being null, we won't know the segment size.
          // Segment size has to be calculated with times and bandwidth.
          return new shaka.media.SegmentReference(
              seg.startTime, seg.endTime, seg.getUrisInner,
              /* startByte= */ 0, /* endByte= */ null,
              /* initSegmentReference= */ null, /* timestampOffset= */ 0,
              /* appendWindowStart= */ 0, /* appendWindowEnd= */ Infinity);
        } else {
          return seg;
        }
      };

      await prepareForAbort();
      streamingEngine.switchVariant(
          newVariant, /* clear_buffer= */ false, /* safe_margin= */ 0);

      await bufferAndCheck(/* didAbort= */ true);
    });

    function flushDelayedRequests() {
      for (const delay of delayedRequests) {
        delay.resolve();
      }
      delayedRequests = [];
    }

    /**
     * Creates and starts the StreamingEngine instance.  After this returns,
     * it should be waiting for the second segment request to complete.
     */
    async function prepareForAbort() {
      streamingEngine.switchVariant(initialVariant);
      streamingEngine.start().catch(fail);
      playing = true;
      await Util.fakeEventLoop(1);

      // Finish the first segment request.
      shaka.log.v1('continuing initial request');
      flushDelayedRequests();
      await Util.fakeEventLoop(10);

      // We should have buffered the first segment.
      expect(Util.invokeSpy(mediaSourceEngine.bufferEnd, 'video')).toBe(10);

      // Confirm that the first segment is buffered.
      expect(requestUris).toEqual(['video-10-0.mp4']);
    }

    /**
     * Buffers to the buffering goal and checks the correct segment requests
     * were made.
     * @param {boolean} didAbort
     * @param {boolean=} hasInit
     */
    async function bufferAndCheck(didAbort, hasInit) {
      // Wait long enough for the abort() call take place.
      await Util.fakeEventLoop(1);

      shaka.log.v1('continuing delayed request, unblocking future requests');
      shouldDelayRequests = false;
      flushDelayedRequests();
      await Util.fakeEventLoop(3);

      expect(Util.invokeSpy(mediaSourceEngine.bufferEnd, 'video')).toBe(30);
      const expected = ['video-10-0.mp4'];
      if (!didAbort) {
        expected.push('video-10-1.mp4');
      }
      if (hasInit) {
        expected.push('init-11.mp4');
      }
      if (didAbort) {
        expected.push('video-11-1.mp4');
      }
      expected.push('video-11-2.mp4');
      expect(requestUris).toEqual(expected);
    }

    /**
     * Sets the number of bytes remaining on the pending network request.
     *
     * @param {number} bytes
     * @suppress {accessControls}
     */
    function setBytesRemaining(bytes) {
      lastPendingRequest.bytesRemaining_.setBytes(bytes);
    }
  });

  describe('embedded text tracks', () => {
    /** @type {!jasmine.Spy} */
    let onTick;

    /** @type {shaka.extern.Stream} */
    let externalTextStream;

    /** @type {shaka.extern.Stream} */
    let embeddedTextStream;

    beforeEach(() => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.presentationTimeline.setDuration(60);
        manifest.addVariant(0, (variant) => {
          variant.addVideo(1, (stream) => {
            stream.useSegmentTemplate('video-110-%d.mp4', 10);
          });
        });
        manifest.addTextStream(2, (stream) => {
          stream.useSegmentTemplate('video-120-%d.mp4', 10);
        });
        manifest.addTextStream(3, (stream) => {
          stream.mimeType = shaka.util.MimeUtils.CEA608_CLOSED_CAPTION_MIMETYPE;
        });
      });

      // Capture the stream objects from the generated manifest by ID.
      externalTextStream = manifest.textStreams.filter((s) => s.id == 2)[0];
      goog.asserts.assert(
          externalTextStream, 'Should have found external text!');
      embeddedTextStream = manifest.textStreams.filter((s) => s.id == 3)[0];
      goog.asserts.assert(
          embeddedTextStream, 'Should have found embedded text!');

      // For these tests, we don't care about specific data appended.
      // Just return any old ArrayBuffer for any requested segment.
      netEngine.request.and.callFake((requestType, request, context) => {
        const buffer = new ArrayBuffer(0);
        /** @type {shaka.extern.Response} */
        const response = {
          uri: request.uris[0],
          originalUri: request.uris[0],
          data: buffer,
          headers: {},
        };
        return shaka.util.AbortableOperation.completed(response);
      });

      // For these tests, we also don't need FakeMediaSourceEngine to verify
      // its input data.
      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine({});
      mediaSourceEngine.clear.and.returnValue(Promise.resolve());
      mediaSourceEngine.bufferedAheadOf.and.returnValue(0);
      mediaSourceEngine.bufferStart.and.returnValue(0);
      mediaSourceEngine.setStreamProperties.and.returnValue(Promise.resolve());
      mediaSourceEngine.remove.and.returnValue(Promise.resolve());
      mediaSourceEngine.setSelectedClosedCaptionId =
        /** @type {?} */ (jasmine.createSpy('setSelectedClosedCaptionId'));

      const bufferEnd = {audio: 0, video: 0, text: 0};
      mediaSourceEngine.appendBuffer.and.callFake(
          (type, data, reference) => {
            bufferEnd[type] = reference && reference.endTime;
            return Promise.resolve();
          });
      mediaSourceEngine.bufferEnd.and.callFake((type) => {
        return bufferEnd[type];
      });
      mediaSourceEngine.bufferedAheadOf.and.callFake((type, start) => {
        return Math.max(0, bufferEnd[type] - start);
      });
      mediaSourceEngine.isBuffered.and.callFake((type, time) => {
        return time >= 0 && time < bufferEnd[type];
      });

      const config = shaka.util.PlayerConfiguration.createDefault().streaming;
      config.rebufferingGoal = 20;
      config.bufferingGoal = 20;
      config.alwaysStreamText = true;
      config.ignoreTextStreamFailures = true;

      playing = false;
      presentationTimeInSeconds = 0;
      createStreamingEngine(config);

      // Each test will switch text streams to simulate various activities, but
      // all will use this variant.
      streamingEngine.switchVariant(manifest.variants[0]);

      onTick = jasmine.createSpy('onTick');
    });

    it('initializes embedded captions after nothing', async () => {
      // Start without text.
      streamingEngine.start().catch(fail);
      playing = true;

      onTick.and.callFake(() => {
        // Switch to embedded text.
        streamingEngine.switchTextStream(embeddedTextStream);

        onTick.and.stub();
      });

      await Util.fakeEventLoop(10, (time) => Util.invokeSpy(onTick));

      // We have buffered through the Period transition.
      expect(Util.invokeSpy(mediaSourceEngine.bufferEnd, 'video'))
          .toBeGreaterThan(12);

      expect(mediaSourceEngine.setSelectedClosedCaptionId)
          .toHaveBeenCalledTimes(1);
    });

    it('initializes embedded captions after external text', async () => {
      // Start with external text.
      streamingEngine.switchTextStream(externalTextStream);
      streamingEngine.start().catch(fail);
      playing = true;

      onTick.and.callFake(() => {
        // Switch to embedded text.
        streamingEngine.switchTextStream(embeddedTextStream);

        onTick.and.stub();
      });

      await Util.fakeEventLoop(10, (time) => Util.invokeSpy(onTick));

      // We have buffered through the Period transition.
      expect(Util.invokeSpy(mediaSourceEngine.bufferEnd, 'video'))
          .toBeGreaterThan(12);

      expect(mediaSourceEngine.setSelectedClosedCaptionId)
          .toHaveBeenCalledTimes(1);
    });

    it('switches to external text after embedded captions', async () => {
      // Start with embedded text.
      streamingEngine.switchTextStream(embeddedTextStream);
      streamingEngine.start().catch(fail);
      playing = true;

      onTick.and.callFake(() => {
        // Switch to external text.
        streamingEngine.switchTextStream(externalTextStream);

        onTick.and.stub();
      });

      await Util.fakeEventLoop(10, (time) => Util.invokeSpy(onTick));

      // We have buffered through the Period transition.
      expect(Util.invokeSpy(mediaSourceEngine.bufferEnd, 'video'))
          .toBeGreaterThan(12);

      expect(mediaSourceEngine.setSelectedClosedCaptionId)
          .toHaveBeenCalledTimes(1);
    });

    it('plays embedded text throughout', async () => {
      // Start with embedded text.
      streamingEngine.switchTextStream(embeddedTextStream);
      streamingEngine.start().catch(fail);
      playing = true;

      await Util.fakeEventLoop(10, (time) => Util.invokeSpy(onTick));

      // We have buffered through the Period transition.
      expect(Util.invokeSpy(mediaSourceEngine.bufferEnd, 'video'))
          .toBeGreaterThan(12);

      expect(mediaSourceEngine.setSelectedClosedCaptionId)
          .toHaveBeenCalledTimes(1);
    });
  });

  it('calls createSegmentIndex on demand', async () => {
    setupVod();
    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    createStreamingEngine();

    // None of the streams have been set up yet because we haven't started yet.
    expect(audioStream.createSegmentIndex).not.toHaveBeenCalled();
    expect(videoStream.createSegmentIndex).not.toHaveBeenCalled();
    expect(alternateVideoStream.createSegmentIndex).not.toHaveBeenCalled();

    // Here we go!
    streamingEngine.switchVariant(variant);
    streamingEngine.switchTextStream(textStream);
    await streamingEngine.start();
    playing = true;

    await runTest(() => {
      if (presentationTimeInSeconds == 1) {
        // Once we're streaming, the audio & video streams have been set up.
        expect(audioStream.createSegmentIndex).toHaveBeenCalled();
        expect(videoStream.createSegmentIndex).toHaveBeenCalled();

        // But not this alternate video stream.
        expect(alternateVideoStream.createSegmentIndex).not.toHaveBeenCalled();
      }
    });

    // Because we never switched to this stream, it was never set up at any time
    // during this simulated playback.
    expect(alternateVideoStream.createSegmentIndex).not.toHaveBeenCalled();
  });

  describe('AES-128', () => {
    let key;
    /** @type {!shaka.extern.aes128Key} */
    let aes128Key;

    beforeEach(async () => {
      // Get a key.
      const keyData = new ArrayBuffer(16);
      const keyDataView = new DataView(keyData);
      keyDataView.setInt16(0, 31710); // 0111 1011 1101 1110
      key = await window.crypto.subtle.importKey(
          'raw', keyData, 'AES-CBC', true, ['decrypt']);

      // Set up a manifest with AES-128 key info.
      // We don't actually provide the imported key OR the key fetching function
      // here, though, so that the individual tests can choose what the starting
      // state of the aes128Key object is.
      aes128Key = {method: 'AES-128', firstMediaSequenceNumber: 0};

      setupVod(false, 0, aes128Key);
      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      presentationTimeInSeconds = 0;
      createStreamingEngine();
      streamingEngine.switchVariant(variant);
    });

    afterEach(async () => {
      await streamingEngine.destroy();
    });

    async function runTest() {
      spyOn(window.crypto.subtle, 'decrypt').and.callThrough();

      await streamingEngine.start();
      playing = true;
      await Util.fakeEventLoop(10);

      expect(mediaSourceEngine.appendBuffer).toHaveBeenCalledTimes(2);
      expect(window.crypto.subtle.decrypt).toHaveBeenCalledTimes(2);
      expect(window.crypto.subtle.decrypt).toHaveBeenCalledWith(
          {name: 'AES-CBC', iv: jasmine.any(Object)}, key, jasmine.any(Object));
    }

    it('decrypts segments', async () => {
      aes128Key.cryptoKey = key;
      await runTest();
    });

    it('downloads key if not pre-filled', async () => {
      aes128Key.fetchKey = () => {
        aes128Key.cryptoKey = key;
        aes128Key.fetchKey = undefined;
        return Promise.resolve();
      };

      await runTest();

      // The key should have been fetched.
      expect(aes128Key.cryptoKey).not.toBeUndefined();
      expect(aes128Key.fetchKey).toBeUndefined();
    });
  });

  describe('destroy', () => {
    it('aborts pending network operations', async () => {
      setupVod();
      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);

      // Track the incoming request and whether it was aborted.
      let isRequested = false;
      let isAborted = false;

      netEngine.request.and.callFake((requestType, request, context) => {
        isRequested = true;

        const abortOp = () => {
          isAborted = true;
          return Promise.resolve();
        };

        // This will never complete, but can be aborted.
        const hungPromise = new Promise(() => {});
        return new shaka.util.AbortableOperation(hungPromise, abortOp);
      });

      // General setup.
      createStreamingEngine();
      streamingEngine.switchVariant(variant);
      await streamingEngine.start();
      playing = true;

      // Simulate time passing.
      await Util.fakeEventLoop(1);

      // By now the request should have fired.
      expect(isRequested).toBe(true);

      // Destroy StreamingEngine.
      await streamingEngine.destroy();

      // The request should have been aborted.
      expect(isAborted).toBe(true);
    });
  });

  describe('beforeAppendSegment', () => {
    it('is called before appending media segment', async () => {
      setupVod();
      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      createStreamingEngine();
      beforeAppendSegment.and.callFake((segment) => {
        return shaka.test.Util.shortDelay();
      });
      streamingEngine.switchVariant(variant);
      streamingEngine.switchTextStream(textStream);
      await streamingEngine.start();
      // Simulate time passing.
      playing = true;
      await Util.fakeEventLoop(10);
      expect(beforeAppendSegment).toHaveBeenCalledWith(
          ContentType.AUDIO, segmentData[ContentType.AUDIO].initSegments[0]);
      expect(beforeAppendSegment).toHaveBeenCalledWith(
          ContentType.AUDIO, segmentData[ContentType.AUDIO].segments[0]);
    });
  });

  describe('prefetch segments', () => {
    const segmentType = shaka.net.NetworkingEngine.RequestType.SEGMENT;

    let OriginalSegmentPrefetch;

    beforeEach(() => {
      OriginalSegmentPrefetch = shaka.media.SegmentPrefetch;
      // eslint-disable-next-line no-restricted-syntax
      shaka.media.SegmentPrefetch = function(config, stream) {
        const fake = new shaka.test.FakeSegmentPrefetch(stream, segmentData);
        return /** @type {?} */(fake);
      };

      setupVod();
      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      createStreamingEngine();
      const config = shaka.util.PlayerConfiguration.createDefault().streaming;
      config.segmentPrefetchLimit = 3;
      streamingEngine.configure(config);
    });

    afterEach(() => {
      shaka.media.SegmentPrefetch = OriginalSegmentPrefetch;
    });

    it('should use prefetched segment without fetching again', async () => {
      streamingEngine.switchVariant(variant);
      await streamingEngine.start();
      playing = true;
      expectNoBuffer();

      await runTest();

      expectHasBuffer();
      expectSegmentRequest(false);
    });

    it('should re-use prefetch segment when force clear buffer', async () => {
      streamingEngine.switchVariant(variant);
      await streamingEngine.start();

      playing = true;
      expectNoBuffer();
      await runTest();
      expectHasBuffer();
      expectSegmentRequest(false);

      streamingEngine.switchVariant(variant, true, 0, true);
      presentationTimeInSeconds = 0;
      await runTest();
      expectHasBuffer();
      expectSegmentRequest(false);
    });

    it('should disable prefetch if reset config in middle', async () => {
      streamingEngine.switchVariant(variant);
      await streamingEngine.start();

      playing = true;
      expectNoBuffer();
      await runTest();
      expectHasBuffer();
      expectSegmentRequest(false);

      const config = shaka.util.PlayerConfiguration.createDefault().streaming;
      config.segmentPrefetchLimit = 0;
      streamingEngine.configure(config);
      streamingEngine.switchVariant(variant, true, 0, true);
      presentationTimeInSeconds = 0;
      await runTest();
      expectHasBuffer();
      expectSegmentRequest(true);
    });

    it('should disable prefetch when reset config at begining', async () => {
      const config = shaka.util.PlayerConfiguration.createDefault().streaming;
      config.segmentPrefetchLimit = 0;
      streamingEngine.configure(config);
      streamingEngine.switchVariant(variant);
      await streamingEngine.start();
      playing = true;
      expectNoBuffer();
      await runTest();
      expectHasBuffer();
      expectSegmentRequest(true);
    });

    /**
     * Expect no buffer has been added to MSE.
     */
    function expectNoBuffer() {
      expect(mediaSourceEngine.initSegments).toEqual({
        audio: [false, false],
        video: [false, false],
        text: [],
      });
      expect(mediaSourceEngine.segments).toEqual({
        audio: [false, false, false, false],
        video: [false, false, false, false],
        text: [false, false, false, false],
      });
    }

    /**
     * Expect buffers have been added to MSE.
     */
    function expectHasBuffer() {
      expect(mediaSourceEngine.initSegments).toEqual({
        audio: [false, true],
        video: [false, true],
        text: [],
      });
      expect(mediaSourceEngine.segments).toEqual({
        audio: [true, true, true, true],
        video: [true, true, true, true],
        text: [false, false, false, false],
      });
    }

    /**
     * @param {?boolean} hasRequest
     */
    function expectSegmentRequest(hasRequest) {
      const requests = [
        '0_audio_0', '0_video_0', '0_audio_1',
        '0_video_1', '1_audio_2', '1_video_2',
        '1_audio_3', '1_video_3',
      ];

      const context = {
        type: shaka.net.NetworkingEngine.AdvancedRequestType.MEDIA_SEGMENT,
      };

      for (const request of requests) {
        if (hasRequest) {
          netEngine.expectRequest(request, segmentType, context);
        } else {
          netEngine.expectNoRequest(request, segmentType, context);
        }
      }
    }
  });

  /**
   * Slides the segment availability window forward by 1 second.
   */
  function slideSegmentAvailabilityWindow() {
    segmentAvailability.start++;
    segmentAvailability.end++;
  }

  /**
   * @param {!shaka.test.FakeNetworkingEngine} netEngine A NetworkingEngine
   *   look-alike.
   * @param {string} targetUri
   * @param {shaka.util.Error.Code=} errorCode
   */
  function failRequestsForTarget(
      netEngine, targetUri, errorCode=shaka.util.Error.Code.BAD_HTTP_STATUS) {
    // eslint-disable-next-line no-restricted-syntax
    const originalNetEngineRequest = netEngine.request.bind(netEngine);

    netEngine.request = jasmine.createSpy('request').and.callFake(
        (requestType, request) => {
          if (request.uris[0] == targetUri) {
            const data = [targetUri];

            if (errorCode == shaka.util.Error.Code.BAD_HTTP_STATUS ||
                errorCode == shaka.util.Error.Code.SEGMENT_MISSING) {
              data.push(404);
              data.push('');
            }

            // The compiler still sees the error code parameter as potentially
            // undefined, even though we gave it a default value.
            goog.asserts.assert(errorCode != undefined, 'Undefined error code');

            return shaka.util.AbortableOperation.failed(new shaka.util.Error(
                shaka.util.Error.Severity.CRITICAL,
                shaka.util.Error.Category.NETWORK,
                errorCode, data));
          }
          return originalNetEngineRequest(requestType, request);
        });
  }

  /**
   * @param {!shaka.test.FakeNetworkingEngine} netEngine A NetworkingEngine
   *   look-alike.
   * @param {string} targetUri
   * @param {shaka.util.Error.Code} errorCode
   */
  function failFirstRequestForTarget(netEngine, targetUri, errorCode) {
    // eslint-disable-next-line no-restricted-syntax
    const originalNetEngineRequest = netEngine.request.bind(netEngine);

    let attempts = 0;
    netEngine.request = jasmine.createSpy('request').and.callFake(
        (requestType, request) => {
          if (request.uris[0] == targetUri) {
            if (++attempts == 1) {
              const data = [targetUri];

              if (errorCode == shaka.util.Error.Code.BAD_HTTP_STATUS) {
                data.push(404);
                data.push('');
              }

              return shaka.util.AbortableOperation.failed(new shaka.util.Error(
                  shaka.util.Error.Severity.CRITICAL,
                  shaka.util.Error.Category.NETWORK,
                  errorCode, data));
            }
          }
          return originalNetEngineRequest(requestType, request);
        });
  }

  /**
   * Override the init segment on all segment references for this Stream.
   *
   * @param {?shaka.extern.Stream} stream
   * @param {shaka.media.InitSegmentReference} initSegmentReference
   */
  function overrideInitSegment(stream, initSegmentReference) {
    if (!stream) {
      return;
    }

    const originalGet = stream.segmentIndex.get;
    stream.segmentIndex.get = (position) => {
      // eslint-disable-next-line no-restricted-syntax
      const segmentReference = originalGet.call(stream.segmentIndex, position);
      if (segmentReference) {
        segmentReference.initSegmentReference = initSegmentReference;
      }
      return segmentReference;
    };
  }

  /**
   * Create a valid segment index for |alternateStream| based on |baseStream|
   * segment index.
   *
   * @param {shaka.extern.Stream} baseStream
   * @param {shaka.extern.Stream} alternateStream
   */
  function createAlternateSegmentIndex(baseStream, alternateStream) {
    const createSegmentIndexSpy =
        Util.funcSpy(alternateStream.createSegmentIndex);
    const altSegmentIndex = new shaka.test.FakeSegmentIndex();

    altSegmentIndex.find.and.callFake(
        (time) => baseStream.segmentIndex.find(time));

    altSegmentIndex.get.and.callFake((pos) => {
      const ref = baseStream.segmentIndex.get(pos);

      if (ref) {
        const altInitUri = ref.initSegmentReference.getUris()[0] + '_alt';
        const altSegmentUri = ref.getUris()[0] + '_alt';

        ref.initSegmentReference.getUris = () => [altInitUri];
        ref.getUris = () => [altSegmentUri];
        return ref;
      }

      return null;
    });

    createSegmentIndexSpy.and.callFake(() => {
      alternateStream.segmentIndex = altSegmentIndex;
      return Promise.resolve();
    });
  }
});
