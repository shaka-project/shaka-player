/** @license
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
  let netEngine;
  let timeline;

  let audioStream1;
  let videoStream1;
  let variant1;
  let textStream1;
  let alternateVariant1;
  let alternateVideoStream1;

  let variant2;
  let textStream2;

  /** @type {shaka.extern.Manifest} */
  let manifest;

  /** @type {!jasmine.Spy} */
  let onChooseStreams;
  /** @type {!jasmine.Spy} */
  let onCanSwitch;
  /** @type {!jasmine.Spy} */
  let onError;
  /** @type {!jasmine.Spy} */
  let onEvent;
  /** @type {!jasmine.Spy} */
  let onManifestUpdate;
  /** @type {!jasmine.Spy} */
  let onInitialStreamsSetup;
  /** @type {!jasmine.Spy} */
  let onStartupComplete;
  /** @type {!jasmine.Spy} */
  let onSegmentAppended;
  /** @type {!jasmine.Spy} */
  let getBandwidthEstimate;
  /** @type {!shaka.media.StreamingEngine} */
  let streamingEngine;

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
    jasmine.clock().install();
    jasmine.clock().mockDate();
  });

  /** @param {boolean=} trickMode */
  function setupVod(trickMode) {
    // For VOD, we fake a presentation that has 2 Periods of equal duration
    // (20 seconds), where each Period has 1 Variant and 1 text stream.
    //
    // There are 4 initialization segments: 1 audio and 1 video for the
    // first Period, and 1 audio and 1 video for the second Period.
    //
    // There are 12 media segments: 2 audio, 2 video, and 2 text for the
    // first Period, and 2 audio, 2 video, and 2 text for the second Period.
    // All media segments are (by default) 10 seconds long.

    // Create SegmentData map for FakeMediaSourceEngine.
    const initSegmentSizeAudio = initSegmentRanges[ContentType.AUDIO][1] -
        initSegmentRanges[ContentType.AUDIO][0] + 1;
    const initSegmentSizeVideo = initSegmentRanges[ContentType.VIDEO][1] -
        initSegmentRanges[ContentType.VIDEO][0] + 1;

    const makeBuffer = (size) => new ArrayBuffer(size);
    segmentData = {
      audio: {
        initSegments: [
          makeBuffer(initSegmentSizeAudio), makeBuffer(initSegmentSizeAudio),
        ],
        segments: [
          makeBuffer(segmentSizes[ContentType.AUDIO]),
          makeBuffer(segmentSizes[ContentType.AUDIO]),
          makeBuffer(segmentSizes[ContentType.AUDIO]),
          makeBuffer(segmentSizes[ContentType.AUDIO]),
        ],
        segmentStartTimes: [0, 10, 0, 10],
        segmentPeriodTimes: [0, 0, 20, 20],
        segmentDuration: 10,
      },
      video: {
        initSegments: [
          makeBuffer(initSegmentSizeVideo), makeBuffer(initSegmentSizeVideo),
        ],
        segments: [
          makeBuffer(segmentSizes[ContentType.VIDEO]),
          makeBuffer(segmentSizes[ContentType.VIDEO]),
          makeBuffer(segmentSizes[ContentType.VIDEO]),
          makeBuffer(segmentSizes[ContentType.VIDEO]),
        ],
        segmentStartTimes: [0, 10, 0, 10],
        segmentPeriodTimes: [0, 0, 20, 20],
        segmentDuration: 10,
      },
      text: {
        initSegments: [],
        segments: [
          makeBuffer(segmentSizes[ContentType.TEXT]),
          makeBuffer(segmentSizes[ContentType.TEXT]),
          makeBuffer(segmentSizes[ContentType.TEXT]),
          makeBuffer(segmentSizes[ContentType.TEXT]),
        ],
        segmentStartTimes: [0, 10, 0, 10],
        segmentPeriodTimes: [0, 0, 20, 20],
        segmentDuration: 10,
      },
    };
    if (trickMode) {
      segmentData.trickvideo = {
        initSegments: [
          makeBuffer(initSegmentSizeVideo), makeBuffer(initSegmentSizeVideo),
        ],
        segments: [
          makeBuffer(segmentSizes[ContentType.VIDEO]),
          makeBuffer(segmentSizes[ContentType.VIDEO]),
          makeBuffer(segmentSizes[ContentType.VIDEO]),
          makeBuffer(segmentSizes[ContentType.VIDEO]),
        ],
        segmentStartTimes: [0, 10, 0, 10],
        segmentPeriodTimes: [0, 0, 20, 20],
        segmentDuration: 10,
      };
    }

    presentationTimeInSeconds = 0;
    playing = false;

    setupNetworkingEngine(
        2 /* segmentsInFirstPeriod */,
        2 /* segmentsInSecondPeriod */);

    timeline = shaka.test.StreamingEngineUtil.createFakePresentationTimeline(
        0 /* segmentAvailabilityStart */,
        40 /* segmentAvailabilityEnd */,
        40 /* presentationDuration */,
        10 /* maxSegmentDuration */,
        false /* isLive */);

    setupManifest(
        0 /* firstPeriodStartTime */,
        20 /* secondPeriodStartTime */,
        40 /* presentationDuration */);
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
        segmentPeriodTimes: [],
        segmentDuration: 10,
      },
      video: {
        initSegments:
            [makeBuffer(initSegmentSizeVideo),
              makeBuffer(initSegmentSizeVideo)],
        segments: [],
        segmentStartTimes: [],
        segmentPeriodTimes: [],
        segmentDuration: 10,
      },
      text: {
        initSegments: [],
        segments: [],
        segmentStartTimes: [],
        segmentPeriodTimes: [],
        segmentDuration: 10,
      },
    };

    const segmentsInFirstPeriod = 12;
    for (const i of shaka.util.Iterables.range(segmentsInFirstPeriod)) {
      segmentData[ContentType.AUDIO].segments.push(
          makeBuffer(segmentSizes[ContentType.AUDIO]));
      segmentData[ContentType.VIDEO].segments.push(
          makeBuffer(segmentSizes[ContentType.VIDEO]));
      segmentData[ContentType.TEXT].segments.push(
          makeBuffer(segmentSizes[ContentType.TEXT]));

      segmentData[ContentType.AUDIO].segmentStartTimes.push(i * 10);
      segmentData[ContentType.VIDEO].segmentStartTimes.push(i * 10);
      segmentData[ContentType.TEXT].segmentStartTimes.push(i * 10);

      segmentData[ContentType.AUDIO].segmentPeriodTimes.push(0);
      segmentData[ContentType.VIDEO].segmentPeriodTimes.push(0);
      segmentData[ContentType.TEXT].segmentPeriodTimes.push(0);
    }

    const segmentsInSecondPeriod = 2;
    for (const i of shaka.util.Iterables.range(segmentsInSecondPeriod)) {
      segmentData[ContentType.AUDIO].segments.push(
          makeBuffer(segmentSizes[ContentType.AUDIO]));
      segmentData[ContentType.VIDEO].segments.push(
          makeBuffer(segmentSizes[ContentType.VIDEO]));
      segmentData[ContentType.TEXT].segments.push(
          makeBuffer(segmentSizes[ContentType.TEXT]));

      segmentData[ContentType.AUDIO].segmentStartTimes.push(i * 10);
      segmentData[ContentType.VIDEO].segmentStartTimes.push(i * 10);
      segmentData[ContentType.TEXT].segmentStartTimes.push(i * 10);

      segmentData[ContentType.AUDIO].segmentPeriodTimes.push(
          segmentsInFirstPeriod * 10);
      segmentData[ContentType.VIDEO].segmentPeriodTimes.push(
          segmentsInFirstPeriod * 10);
      segmentData[ContentType.TEXT].segmentPeriodTimes.push(
          segmentsInFirstPeriod * 10);
    }

    presentationTimeInSeconds = 110;
    playing = false;

    setupNetworkingEngine(
        12 /* segmentsInFirstPeriod */,
        2 /* segmentsInSecondPeriod */);

    // NOTE: Many tests here start playback at 100, so the availability start is
    // 90.  This allows the async index creation processes to complete before
    // the window moves, which gives us the startup conditions the tests expect.
    // Keep in mind that the fake event loop in the tests ticks in whole
    // seconds, so real async processes may take a surprising amount of fake
    // time to complete.  To test actual boundary conditions, you can change
    // timeline.segmentAvailabilityStart in the test setup.
    timeline = shaka.test.StreamingEngineUtil.createFakePresentationTimeline(
        90 /* segmentAvailabilityStart */,
        140 /* segmentAvailabilityEnd */,
        140 /* presentationDuration */,
        10 /* maxSegmentDuration */,
        true /* isLive */);

    setupManifest(
        0 /* firstPeriodStartTime */,
        120 /* secondPeriodStartTime */,
        140 /* presentationDuration */);
  }

  function setupNetworkingEngine(
      segmentsInFirstPeriod, segmentsInSecondPeriod) {
    // Create the fake NetworkingEngine. Note: the StreamingEngine should never
    // request a segment that does not exist.
    netEngine = shaka.test.StreamingEngineUtil.createFakeNetworkingEngine(
        // Init segment generator:
        (type, periodNumber) => {
          expect((periodNumber == 1) || (periodNumber == 2));
          return segmentData[type].initSegments[periodNumber - 1];
        },
        // Media segment generator:
        (type, periodNumber, position) => {
          expect(position).toBeGreaterThan(0);
          expect((periodNumber == 1 && position <= segmentsInFirstPeriod) ||
                 (periodNumber == 2 && position <= segmentsInSecondPeriod));
          const i =
              (segmentsInFirstPeriod * (periodNumber - 1)) + (position - 1);
          return segmentData[type].segments[i];
        });
  }

  function setupManifest(
      firstPeriodStartTime, secondPeriodStartTime, presentationDuration) {
    const segmentDurations = {
      audio: segmentData[ContentType.AUDIO].segmentDuration,
      video: segmentData[ContentType.VIDEO].segmentDuration,
      text: segmentData[ContentType.TEXT].segmentDuration,
    };
    if (segmentData['trickvideo']) {
      segmentDurations['trickvideo'] =
          segmentData['trickvideo'].segmentDuration;
    }
    manifest = shaka.test.StreamingEngineUtil.createManifest(
        [firstPeriodStartTime, secondPeriodStartTime], presentationDuration,
        segmentDurations, initSegmentRanges);

    manifest.presentationTimeline =
      /** @type {!shaka.media.PresentationTimeline} */ (timeline);
    manifest.minBufferTime = 2;

    audioStream1 = manifest.periods[0].variants[0].audio;
    videoStream1 = manifest.periods[0].variants[0].video;
    variant1 = manifest.periods[0].variants[0];
    textStream1 = manifest.periods[0].textStreams[0];

    // This Stream is only used to verify that StreamingEngine can setup
    // Streams correctly.
    alternateVideoStream1 =
        shaka.test.StreamingEngineUtil.createMockVideoStream(8);
    alternateVariant1 = {
      audio: null,
      video: /** @type {shaka.extern.Stream} */ (alternateVideoStream1),
      id: 0,
      language: 'und',
      primary: false,
      bandwidth: 0,
      drmInfos: [],
      allowedByApplication: true,
      allowedByKeySystem: true,
    };
    manifest.periods[0].variants.push(alternateVariant1);

    variant2 = manifest.periods[1].variants[0];
    textStream2 = manifest.periods[1].textStreams[0];
  }

  /**
   * Creates the StreamingEngine.
   **
   * @param {shaka.extern.StreamingConfiguration=} config Optional
   *   configuration object which overrides the default one.
   */
  function createStreamingEngine(config) {
    onChooseStreams = jasmine.createSpy('onChooseStreams');
    onCanSwitch = jasmine.createSpy('onCanSwitch');
    onInitialStreamsSetup = jasmine.createSpy('onInitialStreamsSetup');
    onStartupComplete = jasmine.createSpy('onStartupComplete');
    onError = jasmine.createSpy('onError');
    onError.and.callFake(fail);
    onEvent = jasmine.createSpy('onEvent');
    onManifestUpdate = jasmine.createSpy('onManifestUpdate');
    onSegmentAppended = jasmine.createSpy('onSegmentAppended');
    getBandwidthEstimate = jasmine.createSpy('getBandwidthEstimate');
    getBandwidthEstimate.and.returnValue(1e3);

    if (!config) {
      config = shaka.util.PlayerConfiguration.createDefault().streaming;
      config.rebufferingGoal = 2;
      config.bufferingGoal = 5;
      config.bufferBehind = Infinity;
    }

    goog.asserts.assert(
        presentationTimeInSeconds != undefined,
        'All tests should have defined an initial presentation time by now!');
    const playerInterface = {
      getPresentationTime: () => presentationTimeInSeconds,
      getBandwidthEstimate: Util.spyFunc(getBandwidthEstimate),
      mediaSourceEngine: mediaSourceEngine,
      netEngine: /** @type {!shaka.net.NetworkingEngine} */(netEngine),
      onChooseStreams: Util.spyFunc(onChooseStreams),
      onCanSwitch: Util.spyFunc(onCanSwitch),
      onError: Util.spyFunc(onError),
      onEvent: Util.spyFunc(onEvent),
      onManifestUpdate: Util.spyFunc(onManifestUpdate),
      onSegmentAppended: Util.spyFunc(onSegmentAppended),
      onInitialStreamsSetup: Util.spyFunc(onInitialStreamsSetup),
      onStartupComplete: Util.spyFunc(onStartupComplete),
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
  // After calling start() the following should occur:
  //   1. SE should immediately call onChooseStreams() with the first Period.
  //   2. SE should setup each of the initial Streams and then call
  //      onInitialStreamsSetup().
  //   3. SE should start appending the initial Streams' segments and in
  //      parallel setup the remaining Streams within the Manifest.
  //      - SE should call onStartupComplete() after it has buffered at least 1
  //        segment of each type of content.
  //      - SE should call onCanSwitch() with the first Period after it has
  //        setup the remaining Streams within the first Period.
  //   4. SE should call onChooseStreams() with the second Period after it has
  //      both segments within the first Period.
  //      - We must return the Streams within the second Period.
  //   5. SE should call onCanSwitch() with the second Period shortly after
  //      step 4.
  //   6. SE should call MediaSourceEngine.endOfStream() after it has appended
  //      both segments within the second Period. At this point the playhead
  //      should not be at the end of the presentation, but the test will be
  //      effectively over since SE will have nothing else to do.
  it('initializes and plays VOD', async () => {
    setupVod();
    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    createStreamingEngine();

    onStartupComplete.and.callFake(() => {
      // Verify buffers.
      expect(mediaSourceEngine.initSegments).toEqual({
        audio: [true, false],
        video: [true, false],
        text: [],
      });
      expect(mediaSourceEngine.segments).toEqual({
        audio: [true, false, false, false],
        video: [true, false, false, false],
        text: [true, false, false, false],
      });

      setupFakeGetTime(0);
    });

    expect(mediaSourceEngine.reinitText).not.toHaveBeenCalled();

    onChooseStreams.and.callFake((period) => {
      expect(period).toBe(manifest.periods[0]);

      onCanSwitch.and.callFake(() => {
        expect(mediaSourceEngine.reinitText).not.toHaveBeenCalled();
        mediaSourceEngine.reinitText.calls.reset();
        onCanSwitch.and.throwError(new Error());
      });

      // For second Period.
      onChooseStreams.and.callFake((period) => {
        expect(period).toBe(manifest.periods[1]);

        // Verify buffers.
        expect(mediaSourceEngine.initSegments).toEqual({
          audio: [true, false],
          video: [true, false],
          text: [],
        });
        expect(mediaSourceEngine.segments).toEqual({
          audio: [true, true, false, false],
          video: [true, true, false, false],
          text: [true, true, false, false],
        });

        verifyNetworkingEngineRequestCalls(1);

        onCanSwitch.and.callFake(() => {
          expect(mediaSourceEngine.reinitText).toHaveBeenCalled();
          mediaSourceEngine.reinitText.calls.reset();
          onCanSwitch.and.throwError(new Error());
        });

        // Switch to the second Period.
        return defaultOnChooseStreams(period);
      });

      // Init the first Period.
      return defaultOnChooseStreams(period);
    });

    onInitialStreamsSetup.and.callFake(() => {
      const expectedObject = new Map();
      expectedObject.set(ContentType.AUDIO, audioStream1);
      expectedObject.set(ContentType.VIDEO, videoStream1);
      expectedObject.set(ContentType.TEXT, textStream1);
      expect(mediaSourceEngine.init)
          .toHaveBeenCalledWith(expectedObject, false);
      expect(mediaSourceEngine.init).toHaveBeenCalledTimes(1);
      mediaSourceEngine.init.calls.reset();

      expect(mediaSourceEngine.setDuration).toHaveBeenCalledTimes(1);
      expect(mediaSourceEngine.setDuration).toHaveBeenCalledWith(40);
      mediaSourceEngine.setDuration.calls.reset();
    });

    // Here we go!
    streamingEngine.start();

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

    verifyNetworkingEngineRequestCalls(2);
  });

  describe('loadNewTextStream', () => {
    it('clears MediaSourceEngine', async () => {
      setupVod();
      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      createStreamingEngine();
      onStartupComplete.and.callFake(() => {
        setupFakeGetTime(0);
      });
      onChooseStreams.and.callFake(onChooseStreamsWithUnloadedText);

      streamingEngine.start();

      await runTest(async () => {
        if (presentationTimeInSeconds == 20) {
          mediaSourceEngine.clear.calls.reset();
          mediaSourceEngine.init.calls.reset();
          await streamingEngine.loadNewTextStream(textStream2);
          expect(mediaSourceEngine.clear).toHaveBeenCalledWith('text');

          const expectedObject = new Map();
          expectedObject.set(ContentType.TEXT, jasmine.any(Object));
          expect(mediaSourceEngine.init).toHaveBeenCalledWith(
              expectedObject, false);
        }
      });
    });
  });

  describe('unloadTextStream', () => {
    it('doesn\'t send requests for text after calling unload', async () => {
      setupVod();
      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      createStreamingEngine();
      onStartupComplete.and.callFake(() => {
        setupFakeGetTime(0);
      });
      onChooseStreams.and.callFake(onChooseStreamsWithUnloadedText);

      streamingEngine.start();
      const segmentType = shaka.net.NetworkingEngine.RequestType.SEGMENT;

      // Verify that after unloading text stream, no network request for text
      // is sent.
      await runTest(() => {
        if (presentationTimeInSeconds == 1) {
          netEngine.expectRequest('1_text_1', segmentType);
          netEngine.request.calls.reset();
          streamingEngine.unloadTextStream();
        } else if (presentationTimeInSeconds == 35) {
          netEngine.expectNoRequest('1_text_1', segmentType);
          netEngine.expectNoRequest('1_text_2', segmentType);
          netEngine.expectNoRequest('2_text_1', segmentType);
          netEngine.expectNoRequest('2_text_2', segmentType);
        }
      });
    });
  });

  it('initializes and plays live', async () => {
    setupLive();
    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    createStreamingEngine();

    presentationTimeInSeconds = 100;

    onStartupComplete.and.callFake(() => {
      setupFakeGetTime(100);
    });

    onChooseStreams.and.callFake((p) => defaultOnChooseStreams(p));

    // Here we go!
    streamingEngine.start();

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
    for (const i of shaka.util.Iterables.range(14)) {
      expect(segments[ContentType.AUDIO][i]).withContext(i).toBe(i >= 9);
      expect(segments[ContentType.VIDEO][i]).withContext(i).toBe(i >= 9);
      expect(segments[ContentType.TEXT][i]).withContext(i).toBe(i >= 9);
    }
  });

  // Start the playhead in the first Period but pass start() Streams from the
  // second Period.
  it('plays from 1st Period when passed Streams from 2nd', async () => {
    setupVod();
    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    createStreamingEngine();

    onStartupComplete.and.callFake(() => {
      setupFakeGetTime(0);
    });

    onChooseStreams.and.callFake((period) => {
      expect(period).toBe(manifest.periods[0]);

      // Start with Streams from the second Period even though the playhead is
      // in the first Period. onChooseStreams() should be called again for the
      // first Period and then eventually for the second Period.

      onChooseStreams.and.callFake((period) => {
        expect(period).toBe(manifest.periods[0]);

        onChooseStreams.and.callFake((period) => {
          expect(period).toBe(manifest.periods[1]);

          return defaultOnChooseStreams(period);
        });

        return defaultOnChooseStreams(period);
      });

      return {variant: variant2, text: textStream2};
    });

    streamingEngine.start();

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

  // Start the playhead in the second Period but pass start() Streams from the
  // first Period.
  it('plays from 2nd Period when passed Streams from 1st', async () => {
    setupVod();
    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    createStreamingEngine();

    presentationTimeInSeconds = 20;
    onStartupComplete.and.callFake(() => {
      setupFakeGetTime(20);
    });

    onChooseStreams.and.callFake((period) => {
      expect(period).toBe(manifest.periods[1]);

      // Start with Streams from the first Period even though the playhead is
      // in the second Period. onChooseStreams() should be called again for the
      // second Period.

      onChooseStreams.and.callFake((period) => {
        expect(period).toBe(manifest.periods[1]);

        onChooseStreams.and.throwError(new Error());

        return defaultOnChooseStreams(period);
      });

      return {variant: variant1, text: textStream1};
    });

    streamingEngine.start();

    await runTest();
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

  it('plays when a small gap is present at the beginning', async () => {
    const drift = 0.050;  // 50 ms

    setupVod();
    mediaSourceEngine =
        new shaka.test.FakeMediaSourceEngine(segmentData, drift);
    createStreamingEngine();

    // Here we go!
    onChooseStreams.and.callFake((p) => defaultOnChooseStreams(p));
    streamingEngine.start();

    await runTest();
    expect(onStartupComplete).toHaveBeenCalled();
  });

  it('plays when 1st Period doesn\'t have text streams', async () => {
    setupVod();
    manifest.periods[0].textStreams = [];

    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    createStreamingEngine();

    onStartupComplete.and.callFake(() => setupFakeGetTime(0));
    onChooseStreams.and.callFake((period) => {
      const chosen = defaultOnChooseStreams(period);
      if (period == manifest.periods[0]) {
        chosen.text = null;
      }
      return chosen;
    });

    // Here we go!
    streamingEngine.start();
    await runTest();

    expect(mediaSourceEngine.segments).toEqual({
      audio: [true, true, true, true],
      video: [true, true, true, true],
      text: [false, false, true, true],
    });
  });

  it('doesn\'t get stuck when 2nd Period isn\'t available yet', async () => {
    // See: https://github.com/google/shaka-player/pull/839
    setupVod();
    manifest.periods[0].textStreams = [];

    // For the first update, indicate the segment isn't available.  This should
    // not cause us to fallback to the Playhead time to determine which segment
    // to start streaming.
    await textStream2.createSegmentIndex();
    const oldGet = textStream2.segmentIndex.get;
    textStream2.segmentIndex.get = (idx) => {
      if (idx == 1) {
        textStream2.segmentIndex.get = oldGet;
        return null;
      }
      return oldGet(idx);
    };

    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    createStreamingEngine();

    onStartupComplete.and.callFake(() => setupFakeGetTime(0));
    onChooseStreams.and.callFake((period) => {
      const chosen = defaultOnChooseStreams(period);
      if (period == manifest.periods[0]) {
        chosen.text = null;
      }
      return chosen;
    });

    // Here we go!
    streamingEngine.start();
    await runTest();

    expect(mediaSourceEngine.segments).toEqual({
      audio: [true, true, true, true],
      video: [true, true, true, true],
      text: [false, false, true, true],
    });
  });

  it('only reinitializes text when switching streams', async () => {
    // See: https://github.com/google/shaka-player/issues/910
    setupVod();
    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    createStreamingEngine();

    onStartupComplete.and.callFake(() => setupFakeGetTime(0));
    onChooseStreams.and.callFake(defaultOnChooseStreams);

    // When we can switch in the second Period, switch to the playing stream.
    onCanSwitch.and.callFake(() => {
      onCanSwitch.and.callFake(() => {
        expect(streamingEngine.getBufferingText()).toBe(textStream2);

        mediaSourceEngine.reinitText.calls.reset();
        streamingEngine.switchTextStream(textStream2);
      });
    });

    // Here we go!
    streamingEngine.start();
    await runTest();

    expect(mediaSourceEngine.reinitText).not.toHaveBeenCalled();
  });

  it('plays when 2nd Period doesn\'t have text streams', async () => {
    setupVod();
    manifest.periods[1].textStreams = [];

    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    createStreamingEngine();

    onStartupComplete.and.callFake(() => setupFakeGetTime(0));
    onChooseStreams.and.callFake((period) => {
      const chosen = defaultOnChooseStreams(period);
      if (period == manifest.periods[1]) {
        chosen.text = null;
      }
      return chosen;
    });

    // Here we go!
    streamingEngine.start();
    await runTest();

    expect(mediaSourceEngine.segments).toEqual({
      audio: [true, true, true, true],
      video: [true, true, true, true],
      text: [true, true, false, false],
    });
  });

  it('updates the timeline duration to match media duration', async () => {
    setupVod();
    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    createStreamingEngine();

    onStartupComplete.and.callFake(() => setupFakeGetTime(0));
    onChooseStreams.and.callFake(defaultOnChooseStreams);

    mediaSourceEngine.endOfStream.and.callFake(() => {
      expect(mediaSourceEngine.setDuration).toHaveBeenCalledWith(40);
      expect(mediaSourceEngine.setDuration).toHaveBeenCalledTimes(1);
      mediaSourceEngine.setDuration.calls.reset();
      // Simulate the media ending BEFORE the expected (manifest) duration.
      mediaSourceEngine.getDuration.and.returnValue(35);
      return Promise.resolve();
    });

    // Here we go!
    streamingEngine.start();

    await runTest();
    expect(mediaSourceEngine.endOfStream).toHaveBeenCalled();
    expect(timeline.setDuration).toHaveBeenCalledWith(35);
  });

  // https://github.com/google/shaka-player/issues/979
  it('does not expand the timeline duration', async () => {
    setupVod();
    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    createStreamingEngine();

    onStartupComplete.and.callFake(() => setupFakeGetTime(0));
    onChooseStreams.and.callFake(defaultOnChooseStreams);

    mediaSourceEngine.endOfStream.and.callFake(() => {
      expect(mediaSourceEngine.setDuration).toHaveBeenCalledWith(40);
      expect(mediaSourceEngine.setDuration).toHaveBeenCalledTimes(1);
      mediaSourceEngine.setDuration.calls.reset();
      // Simulate the media ending AFTER the expected (manifest) duration.
      mediaSourceEngine.getDuration.and.returnValue(41);
      return Promise.resolve();
    });

    // Here we go!
    streamingEngine.start();

    await runTest();
    expect(mediaSourceEngine.endOfStream).toHaveBeenCalled();
    expect(timeline.setDuration).not.toHaveBeenCalled();
  });

  // https://github.com/google/shaka-player/issues/1967
  it('does not change duration when 0', async () => {
    setupVod();
    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    createStreamingEngine();

    onStartupComplete.and.callFake(() => setupFakeGetTime(0));
    onChooseStreams.and.callFake(defaultOnChooseStreams);

    // The duration can spuriously be set to 0, so we should ignore this and not
    // update the duration.
    mediaSourceEngine.getDuration.and.returnValue(0);

    // Here we go!
    streamingEngine.start();

    await runTest();
    expect(mediaSourceEngine.endOfStream).toHaveBeenCalled();
    expect(timeline.setDuration).not.toHaveBeenCalled();
  });

  it('applies fudge factor for appendWindowStart', async () => {
    setupVod();
    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    createStreamingEngine();

    onStartupComplete.and.callFake(() => setupFakeGetTime(0));
    onChooseStreams.and.callFake(defaultOnChooseStreams);

    // Here we go!
    streamingEngine.start();
    await runTest();

    // The second Period starts at 20, so we should set the appendWindowStart to
    // 20, but reduced by a small fudge factor.
    const lt20 = {
      asymmetricMatch: (val) => val >= 19.9 && val < 20,
    };
    expect(mediaSourceEngine.setStreamProperties)
        .toHaveBeenCalledWith('video', 20, lt20, 40);
  });

  it('does not buffer one media type ahead of another', async () => {
    setupVod();
    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);

    const config = shaka.util.PlayerConfiguration.createDefault().streaming;
    config.bufferingGoal = 60;
    config.failureCallback = () => streamingEngine.retry();
    createStreamingEngine(config);

    // Make requests for different types take different amounts of time.
    // This would let some media types buffer faster than others if unchecked.
    netEngine.delays.text = 0.1;
    netEngine.delays.audio = 1.0;
    netEngine.delays.video = 10.0;

    mediaSourceEngine.appendBuffer.and.callFake((type, data, start, end) => {
      // Call to the underlying implementation.
      const p = mediaSourceEngine.appendBufferImpl(type, data, start, end);

      // Validate that no one media type got ahead of any other.
      let minBuffered = Infinity;
      let maxBuffered = 0;
      for (const t of ['audio', 'video', 'text']) {
        const buffered = mediaSourceEngine.bufferedAheadOfImpl(t, 0);
        minBuffered = Math.min(minBuffered, buffered);
        maxBuffered = Math.max(maxBuffered, buffered);
      }

      // Sanity check.
      expect(maxBuffered).not.toBeLessThan(minBuffered);
      // Proof that we didn't get too far ahead (10s == 1 segment).
      expect(maxBuffered - minBuffered).not.toBeGreaterThan(10);

      return p;
    });

    // Here we go!
    onStartupComplete.and.callFake(() => setupFakeGetTime(0));
    onChooseStreams.and.callFake(defaultOnChooseStreams);
    streamingEngine.start();

    await runTest();
    // Make sure appendBuffer was called, so that we know that we executed the
    // checks in our fake above.
    expect(mediaSourceEngine.appendBuffer).toHaveBeenCalled();
  });

  describe('switchVariant/switchTextStream', () => {
    let initialVariant;
    let sameAudioVariant;
    let sameVideoVariant;
    let initialTextStream;

    beforeEach(() => {
      // Set up a manifest with multiple variants and a text stream.
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.addAudio(10, (stream) => {
              stream.useSegmentTemplate('audio-10-%d.mp4', 10);
            });
            variant.addVideo(11, (stream) => {
              stream.useSegmentTemplate('video-11-%d.mp4', 10);
            });
          });
          period.addVariant(1, (variant) => {
            variant.addExistingStream(10);  // audio
            variant.addVideo(12, (stream) => {
              stream.useSegmentTemplate('video-12-%d.mp4', 10);
            });
          });
          period.addVariant(2, (variant) => {
            variant.addAudio(13, (stream) => {
              stream.useSegmentTemplate('audio-13-%d.mp4', 10);
            });
            variant.addExistingStream(12);  // video
          });
          period.addTextStream(20, (stream) => {
            stream.useSegmentTemplate('text-20-%d.mp4', 10);
          });
        });
      });

      initialVariant = manifest.periods[0].variants[0];
      sameAudioVariant = manifest.periods[0].variants[1];
      sameVideoVariant = manifest.periods[0].variants[2];
      initialTextStream = manifest.periods[0].textStreams[0];

      // For these tests, we don't care about specific data appended.
      // Just return any old ArrayBuffer for any requested segment.
      netEngine = {
        request: (requestType, request) => {
          const buffer = new ArrayBuffer(0);
          const response = {uri: request.uris[0], data: buffer, headers: {}};
          return shaka.util.AbortableOperation.completed(response);
        },
      };

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
          (type, data, start, end) => {
            bufferEnd[type] = end;
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

      onStartupComplete.and.callFake(() => setupFakeGetTime(0));
      onChooseStreams.and.callFake(() => {
        return {variant: initialVariant, text: initialTextStream};
      });
    });

    it('will not clear buffers if streams have not changed', async () => {
      onCanSwitch.and.callFake(async () => {
        mediaSourceEngine.clear.calls.reset();
        streamingEngine.switchVariant(
            sameAudioVariant, /* clearBuffer */ true, /* safeMargin */ 0);
        await Util.fakeEventLoop(1);
        expect(mediaSourceEngine.clear).not.toHaveBeenCalledWith('audio');
        expect(mediaSourceEngine.clear).toHaveBeenCalledWith('video');
        expect(mediaSourceEngine.clear).not.toHaveBeenCalledWith('text');

        mediaSourceEngine.clear.calls.reset();
        streamingEngine.switchVariant(
            sameVideoVariant, /* clearBuffer */ true, /* safeMargin */ 0);
        await Util.fakeEventLoop(1);
        expect(mediaSourceEngine.clear).toHaveBeenCalledWith('audio');
        expect(mediaSourceEngine.clear).not.toHaveBeenCalledWith('video');
        expect(mediaSourceEngine.clear).not.toHaveBeenCalledWith('text');

        mediaSourceEngine.clear.calls.reset();
        streamingEngine.switchTextStream(initialTextStream);
        await Util.fakeEventLoop(1);
        expect(mediaSourceEngine.clear).not.toHaveBeenCalled();
      });

      streamingEngine.start().catch(fail);

      await Util.fakeEventLoop(10);

      expect(onCanSwitch).toHaveBeenCalled();
    });
  });

  describe('handles seeks (VOD)', () => {
    /** @type {!jasmine.Spy} */
    let onTick;

    beforeEach(() => {
      setupVod();
      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      createStreamingEngine();

      onStartupComplete.and.callFake(() => setupFakeGetTime(0));

      onTick = jasmine.createSpy('onTick');
      onTick.and.stub();
    });

    it('into buffered regions', async () => {
      onChooseStreams.and.callFake((period) => {
        expect(period).toBe(manifest.periods[0]);

        onChooseStreams.and.callFake((period) => {
          expect(period).toBe(manifest.periods[1]);

          // Seek backwards to a buffered region in the first Period. Note that
          // since the buffering goal is 5 seconds and each segment is 10
          // seconds long, the second segment of this Period will be required at
          // 6 seconds.  Then it will load the next Period, but not require the
          // new segments.
          expect(presentationTimeInSeconds).toBe(6);
          presentationTimeInSeconds -= 5;
          streamingEngine.seeked();

          // Although we're seeking backwards we still have to return some
          // Streams from the second Period here.
          return defaultOnChooseStreams(period);
        });

        // Init the first Period.
        return defaultOnChooseStreams(period);
      });

      // Here we go!
      streamingEngine.start();

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

    it('into partially buffered regions in the same period', async () => {
      // When seeking into a region within the same period, or changing
      // resolution, and after the seek some states are buffered and some
      // are unbuffered, StreamingEngine should only clear the unbuffered
      // states.
      onChooseStreams.and.callFake((period) => {
        expect(period).toBe(manifest.periods[0]);

        onChooseStreams.and.callFake((period) => {
          expect(period).toBe(manifest.periods[1]);

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
            expect(presentationTimeInSeconds).toBe(26);
            presentationTimeInSeconds -= 5;
            streamingEngine.seeked();


            mediaSourceEngine.endOfStream.and.returnValue(Promise.resolve());
            return Promise.resolve();
          });

          return defaultOnChooseStreams(period);
        });

        return defaultOnChooseStreams(period);
      });

      onStartupComplete.and.callFake(() => setupFakeGetTime(0));

      // Here we go!
      streamingEngine.start();
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
      onChooseStreams.and.callFake((period) => {
        expect(period).toBe(manifest.periods[0]);

        onChooseStreams.and.callFake((period) => {
          expect(period).toBe(manifest.periods[1]);

          onChooseStreams.and.throwError(new Error());

          // Switch to the second Period.
          return defaultOnChooseStreams(period);
        });

        mediaSourceEngine.endOfStream.and.callFake(() => {
          // Seek backwards to a buffered region in the first Period. Note
          // that since the buffering goal is 5 seconds and each segment is
          // 10 seconds long, the last segment should be required at 26 seconds.
          // Then endOfStream() should be called.
          expect(presentationTimeInSeconds).toBe(26);
          presentationTimeInSeconds -= 20;
          streamingEngine.seeked();

          // Verify that buffers are not cleared.
          expect(mediaSourceEngine.clear).not.toHaveBeenCalled();

          return Promise.resolve();
        });

        // Init the first Period.
        return defaultOnChooseStreams(period);
      });

      // Here we go!
      streamingEngine.start();

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
      onChooseStreams.and.callFake((period) => {
        expect(period).toBe(manifest.periods[0]);

        onChooseStreams.and.throwError(new Error());

        // Init the first Period.
        return defaultOnChooseStreams(period);
      });

      onStartupComplete.and.callFake(() => {
        setupFakeGetTime(0);

        // Seek forward to an unbuffered region in the first Period.
        expect(presentationTimeInSeconds).toBe(0);
        presentationTimeInSeconds += 15;
        streamingEngine.seeked();

        onChooseStreams.and.callFake((period) => {
          // Verify that all buffers have been cleared.
          expect(mediaSourceEngine.clear)
              .toHaveBeenCalledWith(ContentType.AUDIO);
          expect(mediaSourceEngine.clear)
              .toHaveBeenCalledWith(ContentType.VIDEO);
          expect(mediaSourceEngine.clear)
              .toHaveBeenCalledWith(ContentType.TEXT);

          expect(period).toBe(manifest.periods[1]);

          // Verify buffers.
          expect(mediaSourceEngine.initSegments).toEqual({
            audio: [true, false],
            video: [true, false],
            text: [],
          });
          expect(mediaSourceEngine.segments).toEqual({
            audio: [true, true, false, false],
            video: [true, true, false, false],
            text: [true, true, false, false],
          });

          onChooseStreams.and.throwError(new Error());

          // Switch to the second Period.
          return defaultOnChooseStreams(period);
        });
      });

      // Here we go!
      streamingEngine.start();

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

    it('into unbuffered regions across Periods', async () => {
      // Start from the second Period.
      presentationTimeInSeconds = 20;

      onStartupComplete.and.callFake(() => setupFakeGetTime(20));

      onChooseStreams.and.callFake((period) => {
        expect(period).toBe(manifest.periods[1]);

        onChooseStreams.and.throwError(new Error());

        // Init the second Period.
        return defaultOnChooseStreams(period);
      });

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

        // Seek backwards to an unbuffered region in the first Period. Note
        // that since the buffering goal is 5 seconds and each segment is 10
        // seconds long, the last segment should be required at 26 seconds.
        // Then endOfStream() should be called.
        expect(presentationTimeInSeconds).toBe(26);
        presentationTimeInSeconds -= 20;
        streamingEngine.seeked();

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

        onChooseStreams.and.callFake((period) => {
          expect(period).toBe(manifest.periods[0]);

          onChooseStreams.and.callFake((period) => {
            expect(period).toBe(manifest.periods[1]);

            // Verify buffers.
            expect(mediaSourceEngine.initSegments).toEqual({
              audio: [true, false],
              video: [true, false],
              text: [],
            });
            expect(mediaSourceEngine.segments).toEqual({
              audio: [true, true, false, false],
              video: [true, true, false, false],
              text: [true, true, false, false],
            });

            onChooseStreams.and.throwError(new Error());

            // Switch to the second Period.
            return defaultOnChooseStreams(period);
          });

          mediaSourceEngine.endOfStream.and.returnValue(Promise.resolve());

          // Switch to the first Period.
          return defaultOnChooseStreams(period);
        });
        return Promise.resolve();
      });

      // Here we go!
      streamingEngine.start();

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
      onChooseStreams.and.callFake((period) => {
        expect(period).toBe(manifest.periods[0]);

        onChooseStreams.and.throwError(new Error());

        // Init the first Period.
        return defaultOnChooseStreams(period);
      });

      onInitialStreamsSetup.and.callFake(() => {
        // Seek forward to an unbuffered region in the first Period.
        expect(presentationTimeInSeconds).toBe(0);
        presentationTimeInSeconds = 15;
        streamingEngine.seeked();

        onTick.and.callFake(() => {
          // Nothing should have been cleared.
          expect(mediaSourceEngine.clear).not.toHaveBeenCalled();
          onTick.and.stub();
        });

        onChooseStreams.and.callFake((period) => {
          expect(period).toBe(manifest.periods[1]);

          // Verify buffers.
          expect(mediaSourceEngine.initSegments).toEqual({
            audio: [true, false],
            video: [true, false],
            text: [],
          });
          expect(mediaSourceEngine.segments).toEqual({
            audio: [true, true, false, false],
            video: [true, true, false, false],
            text: [true, true, false, false],
          });

          onChooseStreams.and.throwError(new Error());

          // Switch to the second Period.
          return defaultOnChooseStreams(period);
        });
      });

      // This happens after onInitialStreamsSetup(), so pass 15 so the playhead
      // resumes from 15.
      onStartupComplete.and.callFake(() => setupFakeGetTime(15));

      // Here we go!
      streamingEngine.start();

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

    // If we seek back into an unbuffered region but do not called seeked(),
    // StreamingEngine should wait for seeked() to be called.
    it('back into unbuffered regions without seeked()', async () => {
      // Start from the second segment in the second Period.
      presentationTimeInSeconds = 30;

      onStartupComplete.and.callFake(() => setupFakeGetTime(20));

      onChooseStreams.and.callFake((period) => {
        expect(period).toBe(manifest.periods[1]);

        // Init the second Period.
        return defaultOnChooseStreams(period);
      });

      mediaSourceEngine.endOfStream.and.callFake(() => {
        // Seek backwards to an unbuffered region in the second Period. Do not
        // call seeked().
        expect(presentationTimeInSeconds).toBe(26);
        presentationTimeInSeconds -= 10;
        return Promise.resolve();
      });

      // Here we go!
      streamingEngine.start();

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
      onChooseStreams.and.callFake((period) => {
        expect(period).toBe(manifest.periods[0]);

        // Init the first Period.
        return defaultOnChooseStreams(period);
      });

      onStartupComplete.and.callFake(() => {
        setupFakeGetTime(0);

        // Seek forward to an unbuffered region in the first Period. Do not
        // call seeked().
        presentationTimeInSeconds += 15;

        onChooseStreams.and.callFake((period) => {
          expect(period).toBe(manifest.periods[1]);

          // Switch to the second Period.
          return defaultOnChooseStreams(period);
        });
      });

      // Here we go!
      streamingEngine.start();

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

    it('into partially buffered regions across periods', async () => {
      // Seeking into a region where some buffers (text) are buffered and some
      // are not should work despite the media states requiring different
      // periods.
      onChooseStreams.and.callFake((period) => {
        expect(period).toBe(manifest.periods[0]);

        onChooseStreams.and.callFake((period) => {
          expect(period).toBe(manifest.periods[1]);

          // Should get another call for the unbuffered Period transition.
          onChooseStreams.and.callFake(defaultOnChooseStreams);

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
            mediaSourceEngine.segments[ContentType.AUDIO] =
                [false, false, true, true];
            mediaSourceEngine.segments[ContentType.VIDEO] =
                [false, false, true, true];

            // Seek back into the first Period.
            expect(presentationTimeInSeconds).toBe(26);
            presentationTimeInSeconds -= 20;
            streamingEngine.seeked();

            // When seeking across periods, if at least one stream is
            // unbuffered, we clear all the buffers.
            expect(mediaSourceEngine.clear).toHaveBeenCalledWith('audio');
            expect(mediaSourceEngine.clear).toHaveBeenCalledWith('video');
            expect(mediaSourceEngine.clear).toHaveBeenCalledWith('text');

            mediaSourceEngine.endOfStream.and.returnValue(Promise.resolve());
            return Promise.resolve();
          });

          return defaultOnChooseStreams(period);
        });

        return defaultOnChooseStreams(period);
      });

      onStartupComplete.and.callFake(() => setupFakeGetTime(0));

      // Here we go!
      streamingEngine.start();
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
  });

  describe('handles seeks (live)', () => {
    beforeEach(() => {
      setupLive();
      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData, 0);
      createStreamingEngine();

      onStartupComplete.and.callFake(() => setupFakeGetTime(100));
    });

    it('outside segment availability window', async () => {
      timeline.segmentAvailabilityStart = 90;
      timeline.segmentAvailabilityEnd = 110;

      presentationTimeInSeconds = 90;

      onChooseStreams.and.callFake((period) => {
        expect(period).toBe(manifest.periods[0]);

        onChooseStreams.and.throwError(new Error());

        // Init the first Period.
        return defaultOnChooseStreams(period);
      });

      onStartupComplete.and.callFake(() => {
        // Seek forward to an unbuffered and unavailable region in the second
        // Period; set playing to false since the playhead can't move at the
        // seek target.
        expect(timeline.getSegmentAvailabilityEnd()).toBeLessThan(125);
        presentationTimeInSeconds = 125;
        playing = false;
        streamingEngine.seeked();

        onChooseStreams.and.callFake((period) => {
          expect(period).toBe(manifest.periods[1]);

          onChooseStreams.and.throwError(new Error());

          // Switch to the second Period.
          return defaultOnChooseStreams(period);
        });

        // Eventually StreamingEngine should request the first segment (since
        // it needs the second segment) of the second Period when it becomes
        // available.
        const originalAppendBuffer =
            // eslint-disable-next-line no-restricted-syntax
            shaka.test.FakeMediaSourceEngine.prototype.appendBufferImpl;
        mediaSourceEngine.appendBuffer.and.callFake(
            (type, data, startTime, endTime) => {
              expect(presentationTimeInSeconds).toBe(125);
              if (startTime >= 100) {
                // Ignore a possible call for the first Period.
                expect(timeline.getSegmentAvailabilityStart()).toBe(100);
                expect(timeline.getSegmentAvailabilityEnd()).toBe(120);
                playing = true;
                mediaSourceEngine.appendBuffer.and.callFake(
                    originalAppendBuffer);
              }

              // eslint-disable-next-line no-restricted-syntax
              return originalAppendBuffer.call(
                  mediaSourceEngine, type, data, startTime, endTime);
            });
      });

      // Here we go!
      streamingEngine.start();

      await runTest(slideSegmentAvailabilityWindow);
      // Verify buffers.
      expect(mediaSourceEngine.initSegments).toEqual({
        audio: [false, true],
        video: [false, true],
        text: [],
      });

      // Since we performed an unbuffered seek into the second Period, the
      // first 12 segments should not be buffered.
      for (const i of shaka.util.Iterables.range(14)) {
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
      // Don't use returnValue with Promise.reject, or it may be detected as an
      // unhandled Promise rejection.
      videoStream1.createSegmentIndex.and.callFake(
          () => Promise.reject('FAKE_ERROR'));

      onError.and.callFake((error) => {
        expect(error).toBe('FAKE_ERROR');
      });

      onChooseStreams.and.callFake((p) => defaultOnChooseStreams(p));

      // Here we go!
      streamingEngine.start();
      await runTest();

      expect(videoStream1.createSegmentIndex).toHaveBeenCalled();
      expect(onError).toHaveBeenCalled();
    });

    it('from Stream setup on switch', async () => {
      const expectedError = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.HTTP_ERROR);

      // Don't use returnValue with Promise.reject, or it may be detected as an
      // unhandled Promise rejection.
      alternateVideoStream1.createSegmentIndex.and.callFake(
          () => Promise.reject(expectedError));

      onError.and.callFake((error) => {
        expect(onInitialStreamsSetup).toHaveBeenCalled();
        expect(onStartupComplete).toHaveBeenCalled();
        expect(error).toBe(expectedError);
      });

      onChooseStreams.and.callFake((p) => defaultOnChooseStreams(p));
      onCanSwitch.and.callFake(() => {
        streamingEngine.switchVariant(
            alternateVariant1, /* clear_buffer= */ true, /* safe_margin= */ 0);
      });

      // Here we go!
      streamingEngine.start().catch(fail);
      await runTest();

      expect(videoStream1.createSegmentIndex).toHaveBeenCalled();
      expect(onCanSwitch).toHaveBeenCalled();
      expect(alternateVideoStream1.createSegmentIndex).toHaveBeenCalled();
      expect(onError).toHaveBeenCalled();
    });

    it('from failed init segment append during startup', async () => {
      const expectedError = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.MEDIA_SOURCE_OPERATION_FAILED);

      onError.and.callFake((error) => {
        expect(onInitialStreamsSetup).toHaveBeenCalled();
        expect(onStartupComplete).not.toHaveBeenCalled();
        Util.expectToEqualError(error, expectedError);
      });

      onChooseStreams.and.callFake((period) => {
        expect(period).toBe(manifest.periods[0]);

        const streamsByType = defaultOnChooseStreams(period);

        const originalAppendBuffer =
            // eslint-disable-next-line no-restricted-syntax
            shaka.test.FakeMediaSourceEngine.prototype.appendBufferImpl;
        mediaSourceEngine.appendBuffer.and.callFake(
            (type, data, startTime, endTime) => {
              // Reject the first video init segment.
              if (data == segmentData[ContentType.VIDEO].initSegments[0]) {
                return Promise.reject(expectedError);
              } else {
                // eslint-disable-next-line no-restricted-syntax
                return originalAppendBuffer.call(
                    mediaSourceEngine, type, data, startTime, endTime);
              }
            });

        return streamsByType;
      });

      // Here we go!
      streamingEngine.start().catch(fail);
      await runTest();
      expect(onError).toHaveBeenCalled();
    });

    it('from failed media segment append during startup', async () => {
      const expectedError = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.MEDIA_SOURCE_OPERATION_FAILED);

      onError.and.callFake((error) => {
        expect(onInitialStreamsSetup).toHaveBeenCalled();
        expect(onStartupComplete).not.toHaveBeenCalled();
        Util.expectToEqualError(error, expectedError);
      });

      onChooseStreams.and.callFake((period) => {
        expect(period).toBe(manifest.periods[0]);

        const streamsByType = defaultOnChooseStreams(period);

        const originalAppendBuffer =
            // eslint-disable-next-line no-restricted-syntax
            shaka.test.FakeMediaSourceEngine.prototype.appendBufferImpl;
        mediaSourceEngine.appendBuffer.and.callFake(
            (type, data, startTime, endTime) => {
              // Reject the first audio segment.
              if (data == segmentData[ContentType.AUDIO].segments[0]) {
                return Promise.reject(expectedError);
              } else {
                // eslint-disable-next-line no-restricted-syntax
                return originalAppendBuffer.call(
                    mediaSourceEngine, type, data, startTime, endTime);
              }
            });

        return streamsByType;
      });

      // Here we go!
      streamingEngine.start().catch(fail);
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
      onChooseStreams.and.callFake((period) => defaultOnChooseStreams(period));
      onStartupComplete.and.callFake(() => {
        streamingEngine.switchVariant(
            variant2, /* clear_buffer= */ true, /* safe_margin= */ 0);
      });

      // Here we go!
      streamingEngine.start().catch(fail);
      await runTest();
      expect(onError).toHaveBeenCalledWith(Util.jasmineError(expectedError));
    });
  });

  describe('handles network errors', () => {
    it('ignores text stream failures if configured to', async () => {
      setupVod();
      const textUri = '1_text_1';
      const originalNetEngine = netEngine;
      netEngine = {
        request: jasmine.createSpy('request'),
      };
      netEngine.request.and.callFake((requestType, request) => {
        if (request.uris[0] == textUri) {
          return shaka.util.AbortableOperation.failed(new shaka.util.Error(
              shaka.util.Error.Severity.CRITICAL,
              shaka.util.Error.Category.NETWORK,
              shaka.util.Error.Code.BAD_HTTP_STATUS, textUri, 404));
        }
        return originalNetEngine.request(requestType, request);
      });
      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      const config = shaka.util.PlayerConfiguration.createDefault().streaming;
      config.ignoreTextStreamFailures = true;
      createStreamingEngine(config);

      onStartupComplete.and.callFake(() => {
        setupFakeGetTime(0);
      });

      // Here we go!
      onChooseStreams.and.callFake((p) => defaultOnChooseStreams(p));
      streamingEngine.start();

      await runTest();
      expect(onError).not.toHaveBeenCalled();
      expect(mediaSourceEngine.endOfStream).toHaveBeenCalled();
    });

    it('retries if configured to', async () => {
      setupLive();

      // Wrap the NetworkingEngine to cause errors.
      const targetUri = '1_audio_init';
      failFirstRequestForTarget(netEngine, targetUri,
          shaka.util.Error.Code.BAD_HTTP_STATUS);

      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);

      const config = shaka.util.PlayerConfiguration.createDefault().streaming;
      config.failureCallback = () => streamingEngine.retry();
      createStreamingEngine(config);

      presentationTimeInSeconds = 100;
      onStartupComplete.and.callFake(() => {
        setupFakeGetTime(100);
      });

      onError.and.callFake((error) => {
        expect(error.severity).toBe(shaka.util.Error.Severity.CRITICAL);
        expect(error.category).toBe(shaka.util.Error.Category.NETWORK);
        expect(error.code).toBe(shaka.util.Error.Code.BAD_HTTP_STATUS);
      });

      // Here we go!
      onChooseStreams.and.callFake((p) => defaultOnChooseStreams(p));
      streamingEngine.start();

      await runTest();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(netEngine.attempts).toBeGreaterThan(1);
      expect(mediaSourceEngine.endOfStream).toHaveBeenCalledTimes(1);
    });

    it('does not retry if configured not to', async () => {
      setupLive();

      // Wrap the NetworkingEngine to cause errors.
      const targetUri = '1_audio_init';
      failFirstRequestForTarget(netEngine, targetUri,
          shaka.util.Error.Code.BAD_HTTP_STATUS);

      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);

      const config = shaka.util.PlayerConfiguration.createDefault().streaming;
      config.failureCallback = () => {};
      createStreamingEngine(config);

      presentationTimeInSeconds = 100;
      onStartupComplete.and.callFake(() => {
        setupFakeGetTime(100);
      });

      onError.and.callFake((error) => {
        expect(error.severity).toBe(shaka.util.Error.Severity.CRITICAL);
        expect(error.category).toBe(shaka.util.Error.Category.NETWORK);
        expect(error.code).toBe(shaka.util.Error.Code.BAD_HTTP_STATUS);
      });

      // Here we go!
      onChooseStreams.and.callFake((p) => defaultOnChooseStreams(p));
      streamingEngine.start();

      await runTest();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(netEngine.attempts).toBe(1);
      expect(mediaSourceEngine.endOfStream).not.toHaveBeenCalled();
    });

    it('does not invoke the callback if the error is handled', async () => {
      setupLive();

      // Wrap the NetworkingEngine to cause errors.
      const targetUri = '1_audio_init';
      failFirstRequestForTarget(netEngine, targetUri,
          shaka.util.Error.Code.BAD_HTTP_STATUS);

      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);

      // Configure with a failure callback
      const failureCallback = jasmine.createSpy('failureCallback');
      const config = shaka.util.PlayerConfiguration.createDefault().streaming;
      config.failureCallback = shaka.test.Util.spyFunc(failureCallback);
      createStreamingEngine(config);

      presentationTimeInSeconds = 100;
      onStartupComplete.and.callFake(() => {
        setupFakeGetTime(100);
      });

      onError.and.callFake((error) => {
        error.handled = true;
      });

      // Here we go!
      onChooseStreams.and.callFake((p) => defaultOnChooseStreams(p));
      streamingEngine.start();

      await runTest();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(failureCallback).not.toHaveBeenCalled();
    });

    it('waits to invoke the failure callback', async () => {
      setupLive();

      // Wrap the NetworkingEngine to cause errors.
      const targetUri = '1_audio_init';
      failFirstRequestForTarget(netEngine, targetUri,
          shaka.util.Error.Code.BAD_HTTP_STATUS);

      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);

      // Configure with a failure callback that records the callback time.
      /** @type {?number} */
      let callbackTime = null;
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
      onStartupComplete.and.callFake(() => {
        setupFakeGetTime(100);
      });
      onError.and.stub();

      // Here we go!
      onChooseStreams.and.callFake((p) => defaultOnChooseStreams(p));
      streamingEngine.start();

      const startTime = Date.now();
      await runTest();
      expect(failureCallback).toHaveBeenCalled();
      // baseDelay == 10000, maybe be longer due to delays in the event loop.
      expect(callbackTime - startTime).toBeGreaterThanOrEqual(10000);
    });
  });

  describe('retry()', () => {
    it('resumes streaming after failure', async () => {
      setupVod();

      // Wrap the NetworkingEngine to cause errors.
      const targetUri = '1_audio_init';
      const originalNetEngineRequest = netEngine.request;
      failFirstRequestForTarget(netEngine, targetUri,
          shaka.util.Error.Code.BAD_HTTP_STATUS);

      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      createStreamingEngine();

      onStartupComplete.and.callFake(() => {
        setupFakeGetTime(0);
      });

      onError.and.callFake((error) => {
        // Restore the original fake request function.
        netEngine.request = originalNetEngineRequest;
        netEngine.request.calls.reset();

        // Retry streaming.
        expect(streamingEngine.retry()).toBe(true);
      });

      // Here we go!
      onChooseStreams.and.callFake((p) => defaultOnChooseStreams(p));
      streamingEngine.start();

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

      onStartupComplete.and.callFake(() => {
        setupFakeGetTime(0);

        // Now that setup is complete, throw QuotaExceededError on every segment
        // to quickly trigger the quota error.
        const appendBufferSpy = jasmine.createSpy('appendBuffer');
        appendBufferSpy.and.callFake((type, data, startTime, endTime) => {
          throw new shaka.util.Error(
              shaka.util.Error.Severity.CRITICAL,
              shaka.util.Error.Category.MEDIA,
              shaka.util.Error.Code.QUOTA_EXCEEDED_ERROR,
              type);
        });
        mediaSourceEngine.appendBuffer = appendBufferSpy;
      });

      onError.and.callFake((error) => {
        expect(error.code).toBe(shaka.util.Error.Code.QUOTA_EXCEEDED_ERROR);

        // Retry streaming, which should fail and return false.
        netEngine.request.calls.reset();
        expect(streamingEngine.retry()).toBe(false);
      });

      // Here we go!
      onChooseStreams.and.callFake((p) => defaultOnChooseStreams(p));
      streamingEngine.start();

      await runTest();

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

      onStartupComplete.and.callFake(() => {
        setupFakeGetTime(0);
      });

      onChooseStreams.and.callFake((p) => defaultOnChooseStreams(p));
      streamingEngine.start();

      // Here we go!
      let count = 0;
      await runTest(() => {
        if (++count == 3) {
          streamingEngine.destroy();

          // Retry streaming, which should fail and return false.
          netEngine.request.calls.reset();
          expect(streamingEngine.retry()).toBe(false);
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

      onStartupComplete.and.callFake(() => setupFakeGetTime(0));

      const originalRemove =
          // eslint-disable-next-line no-restricted-syntax
          shaka.test.FakeMediaSourceEngine.prototype.removeImpl
              .bind(mediaSourceEngine);

      mediaSourceEngine.remove.and.callFake((type, start, end) => {
        expect(presentationTimeInSeconds).toBe(20);
        expect(start).toBe(0);
        expect(end).toBe(10);

        if (mediaSourceEngine.remove.calls.count() == 3) {
          mediaSourceEngine.remove.and.callFake((type, start, end) => {
            expect(presentationTimeInSeconds).toBe(30);
            expect(start).toBe(10);
            expect(end).toBe(20);
            return originalRemove(type, start, end);
          });
        }

        return originalRemove(type, start, end);
      });

      // Here we go!
      onChooseStreams.and.callFake((p) => defaultOnChooseStreams(p));
      streamingEngine.start();

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
      onStartupComplete.and.callFake(() => setupFakeGetTime(0));
      onChooseStreams.and.callFake((p) => defaultOnChooseStreams(p));
      streamingEngine.start();

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

      onStartupComplete.and.callFake(() => setupFakeGetTime(0));

      const originalAppendBuffer =
          // eslint-disable-next-line no-restricted-syntax
          shaka.test.FakeMediaSourceEngine.prototype.appendBufferImpl;
      const appendBufferSpy = jasmine.createSpy('appendBuffer');
      mediaSourceEngine.appendBuffer = appendBufferSpy;

      // Throw two QuotaExceededErrors at different times.
      let numErrorsThrown = 0;
      appendBufferSpy.and.callFake(
          (type, data, startTime, endTime) => {
            const throwError = (numErrorsThrown == 0 && startTime == 10) ||
                             (numErrorsThrown == 1 && startTime == 20);
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
                  mediaSourceEngine, type, data, startTime, endTime);
              return p;
            }
          });

      // Here we go!
      onChooseStreams.and.callFake((p) => defaultOnChooseStreams(p));
      streamingEngine.start();

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

      onStartupComplete.and.callFake(() => setupFakeGetTime(0));

      const originalAppendBuffer =
          // eslint-disable-next-line no-restricted-syntax
          shaka.test.FakeMediaSourceEngine.prototype.appendBufferImpl;
      const appendBufferSpy = jasmine.createSpy('appendBuffer');
      mediaSourceEngine.appendBuffer = appendBufferSpy;

      // Throw QuotaExceededError multiple times after at least one segment of
      // each type has been appended.
      appendBufferSpy.and.callFake(
          (type, data, startTime, endTime) => {
            if (startTime >= 10) {
              throw new shaka.util.Error(
                  shaka.util.Error.Severity.CRITICAL,
                  shaka.util.Error.Category.MEDIA,
                  shaka.util.Error.Code.QUOTA_EXCEEDED_ERROR,
                  type);
            } else {
              // eslint-disable-next-line no-restricted-syntax
              const p = originalAppendBuffer.call(
                  mediaSourceEngine, type, data, startTime, endTime);
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
      onChooseStreams.and.callFake((p) => defaultOnChooseStreams(p));
      streamingEngine.start();

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

      onStartupComplete.and.callFake(() => setupFakeGetTime(drift));

      // Here we go!
      onChooseStreams.and.callFake((p) => defaultOnChooseStreams(p));
      streamingEngine.start();

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

      onStartupComplete.and.callFake(() => setupFakeGetTime(0));

      // Here we go!
      onChooseStreams.and.callFake((p) => defaultOnChooseStreams(p));
      streamingEngine.start();

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

      onStartupComplete.and.callFake(() => setupFakeGetTime(100));

      // Here we go!
      onChooseStreams.and.callFake((p) => defaultOnChooseStreams(p));
      streamingEngine.start();

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
      for (const i of shaka.util.Iterables.range(14)) {
        expect(segments[ContentType.AUDIO][i]).withContext(i).toBe(i >= 9);
        expect(segments[ContentType.VIDEO][i]).withContext(i).toBe(i >= 9);
        expect(segments[ContentType.TEXT][i]).withContext(i).toBe(i >= 9);
      }
    }

    it('is handled for large - values', () => testNegativeDrift(-12));
  });

  describe('setTrickPlay', () => {
    it('uses trick mode track when requested', async () => {
      setupVod(/* trickMode */ true);
      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);

      const config = shaka.util.PlayerConfiguration.createDefault().streaming;
      // Only buffer ahead 1 second to make it easier to set segment
      // expectations based on playheadTime.
      config.rebufferingGoal = 1;
      config.bufferingGoal = 1;
      createStreamingEngine(config);

      onStartupComplete.and.callFake(() => setupFakeGetTime(0));

      // Here we go!
      onChooseStreams.and.callFake((p) => defaultOnChooseStreams(p));
      streamingEngine.start();

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
            video: [false, false, true, true],  // starts buffering one seg back
            trickvideo: [false, false, false, false],  // cleared
            text: [true, true, true, true],
          });
        }
      });
      expect(mediaSourceEngine.endOfStream).toHaveBeenCalled();
    });
  });

  describe('embedded emsg boxes', () => {
    const emsgSegment = Uint8ArrayUtils.fromHex(
        '0000003b656d736700000000666f6f3a6261723a637573746f6d646174617363' +
        '68656d6500310000000001000000080000ffff0000000174657374');
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

    beforeEach(() => {
      setupVod();
      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      createStreamingEngine();

      onStartupComplete.and.callFake(() => setupFakeGetTime(0));
      onChooseStreams.and.callFake((p) => defaultOnChooseStreams(p));
    });

    it('raises an event for registered embedded emsg boxes', async () => {
      segmentData[ContentType.VIDEO].segments[0] = emsgSegment;
      videoStream1.emsgSchemeIdUris = [emsgObj.schemeIdUri];

      // Here we go!
      streamingEngine.start();
      await runTest();

      expect(onEvent).toHaveBeenCalledTimes(1);

      const event = onEvent.calls.argsFor(0)[0];
      expect(event.detail).toEqual(emsgObj);
    });

    it('raises multiple events', async () => {
      const dummyBox =
          shaka.util.Uint8ArrayUtils.fromHex('0000000c6672656501020304');
      segmentData[ContentType.VIDEO].segments[0] =
          shaka.util.Uint8ArrayUtils.concat(emsgSegment, dummyBox, emsgSegment);
      videoStream1.emsgSchemeIdUris = [emsgObj.schemeIdUri];

      // Here we go!
      streamingEngine.start();
      await runTest();

      expect(onEvent).toHaveBeenCalledTimes(2);
    });

    it('won\'t raise an event without stream field set', async () => {
      segmentData[ContentType.VIDEO].segments[0] = emsgSegment;

      // Here we go!
      streamingEngine.start();
      await runTest();

      expect(onEvent).not.toHaveBeenCalled();
    });

    it('won\'t raise an event when no emsg boxes present', async () => {
      videoStream1.emsgSchemeIdUris = [emsgObj.schemeIdUri];

      // Here we go!
      streamingEngine.start();
      await runTest();

      expect(onEvent).not.toHaveBeenCalled();
    });

    it('won\'t raise an event for an unregistered emsg box', async () => {
      segmentData[ContentType.VIDEO].segments[0] = emsgSegment;

      // Here we go!
      streamingEngine.start();
      await runTest();

      expect(onEvent).not.toHaveBeenCalled();
    });

    it('triggers manifest updates', async () => {
      // This is an 'emsg' box that contains a scheme of
      // urn:mpeg:dash:event:2012 to indicate a manifest update.
      segmentData[ContentType.VIDEO].segments[0] =
          Uint8ArrayUtils
              .fromHex(
                  '0000003a656d73670000000075726e3a' +
                  '6d7065673a646173683a6576656e743a' +
                  '32303132000000000031000000080000' +
                  '00ff0000000c74657374');
      videoStream1.emsgSchemeIdUris = ['urn:mpeg:dash:event:2012'];

      // Here we go!
      streamingEngine.start();
      await runTest();

      expect(onEvent).not.toHaveBeenCalled();
      expect(onManifestUpdate).toHaveBeenCalled();
    });
  });

  describe('network downgrading', () => {
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
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.bandwidth = 500;
            variant.addVideo(10, (stream) => {
              stream.useSegmentTemplate(
                  'video-10-%d.mp4', /* segmentDuration= */ 10,
                  /* segmentSize= */ 50);
            });
          });
          period.addVariant(1, (variant) => {
            variant.bandwidth = 100;
            variant.addVideo(11, (stream) => {
              stream.useSegmentTemplate(
                  'video-11-%d.mp4', /* segmentDuration= */ 10,
                  /* segmentSize= */ 10);
            });
          });
        });
      });

      const initialVariant = manifest.periods[0].variants[0];
      newVariant = manifest.periods[0].variants[1];
      requestUris = [];
      delayedRequests = [];
      lastPendingRequest = null;
      shouldDelayRequests = true;
      playing = false;
      presentationTimeInSeconds = 0;

      // For these tests, we don't care about specific data appended.
      // Just return any old ArrayBuffer for any requested segment.
      netEngine = {
        request: (requestType, request) => {
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
        },
      };

      // For these tests, we also don't need FakeMediaSourceEngine to verify
      // its input data.
      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine({});
      mediaSourceEngine.bufferStart.and.returnValue(0);
      mediaSourceEngine.clear.and.returnValue(Promise.resolve());
      mediaSourceEngine.remove.and.returnValue(Promise.resolve());
      mediaSourceEngine.setStreamProperties.and.returnValue(Promise.resolve());

      // Naive buffered range tracking that only tracks the buffer end.
      const bufferEnd = {audio: 0, video: 0, text: 0};
      mediaSourceEngine.appendBuffer.and.callFake((type, data, start, end) => {
        bufferEnd[type] = end;
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

      onStartupComplete.and.callFake(() => setupFakeGetTime(0));
      onChooseStreams.and.callFake(() => ({variant: initialVariant}));
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
      const videoStream = manifest.periods[0].variants[0].video;
      await videoStream.createSegmentIndex();
      const segmentIndex = videoStream.segmentIndex;
      const oldGet = segmentIndex.get;
      videoStream.segmentIndex.get = (idx) => {
        // eslint-disable-next-line no-restricted-syntax
        const seg = oldGet.call(segmentIndex, idx);
        if (seg) {
          // With endByte being null, we won't know the segment size.
          return new shaka.media.SegmentReference(
              seg.position, seg.startTime, seg.endTime, seg.getUris,
              /* startByte= */ 0, /* endByte= */ null,
              /* initSegmentReference */ null, /* presentationTimeOffset */ 0);
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
      streamingEngine.switchVariant(
          newVariant, /* clear_buffer= */ false, /* safe_margin= */ 0);

      await bufferAndCheck(/* didAbort= */ true);

      expect(secondRequest.abort).toHaveBeenCalled();
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
      streamingEngine.start().catch(fail);
      await Util.fakeEventLoop(1);

      // Finish the first segment request.
      shaka.log.v1('continuing initial request');
      flushDelayedRequests();
      await Util.fakeEventLoop(10);

      // We should have buffered the first segment and finished startup.
      expect(onCanSwitch).toHaveBeenCalled();
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
    beforeEach(() => {
      // Set up a manifest with multiple Periods and text streams.
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.addVideo(110, (stream) => {
              stream.useSegmentTemplate('video-110-%d.mp4', 10);
            });
          });
          period.addTextStream(120, (stream) => {
            stream.useSegmentTemplate('video-120-%d.mp4', 10);
          });
          period.addTextStream(121, (stream) => {
            stream.mimeType = shaka.util.MimeUtils.CLOSED_CAPTION_MIMETYPE;
          });
        });
        manifest.addPeriod(10, (period) => {
          period.addVariant(1, (variant) => {
            variant.addVideo(210, (stream) => {
              stream.useSegmentTemplate('video-210-%d.mp4', 10);
            });
          });
          period.addTextStream(220, (stream) => {
            stream.useSegmentTemplate('text-220-%d.mp4', 10);
          });
          period.addTextStream(221, (stream) => {
            stream.mimeType = shaka.util.MimeUtils.CLOSED_CAPTION_MIMETYPE;
          });
        });
      });

      // For these tests, we don't care about specific data appended.
      // Just return any old ArrayBuffer for any requested segment.
      netEngine = {
        request: (requestType, request) => {
          const buffer = new ArrayBuffer(0);
          const response = {uri: request.uris[0], data: buffer, headers: {}};
          return shaka.util.AbortableOperation.completed(response);
        },
      };

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
          (type, data, start, end) => {
            bufferEnd[type] = end;
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

      onStartupComplete.and.callFake(() => setupFakeGetTime(0));
    });

    describe('period transition', () => {
      it('initializes new embedded captions', async () => {
        onChooseStreams.and.callFake((period) => {
          if (period == manifest.periods[0]) {
            return {variant: period.variants[0]};
          } else {
            return {variant: period.variants[0], text: period.textStreams[1]};
          }
        });
        await runEmbeddedCaptionTest();
      });

      it('initializes embedded captions from external text', async () => {
        onChooseStreams.and.callFake((period) => {
          if (period == manifest.periods[0]) {
            return {variant: period.variants[0], text: period.textStreams[0]};
          } else {
            return {variant: period.variants[0], text: period.textStreams[1]};
          }
        });
        await runEmbeddedCaptionTest();
      });

      it('switches to external text after embedded captions', async () => {
        onChooseStreams.and.callFake((period) => {
          if (period == manifest.periods[0]) {
            return {variant: period.variants[0], text: period.textStreams[1]};
          } else {
            return {variant: period.variants[0], text: period.textStreams[0]};
          }
        });
        await runEmbeddedCaptionTest();
      });

      it('doesn\'t re-initialize', async () => {
        onChooseStreams.and.callFake((period) => {
          return {variant: period.variants[0], text: period.textStreams[1]};
        });
        await runEmbeddedCaptionTest();
      });

      async function runEmbeddedCaptionTest() {
        streamingEngine.start().catch(fail);
        await Util.fakeEventLoop(10);

        // We have buffered through the Period transition.
        expect(onChooseStreams).toHaveBeenCalledTimes(2);
        expect(Util.invokeSpy(mediaSourceEngine.bufferEnd, 'video'))
            .toBeGreaterThan(12);

        expect(mediaSourceEngine.setSelectedClosedCaptionId)
            .toHaveBeenCalledTimes(1);
      }
    });
  });

  it('calls createSegmentIndex on demand', async () => {
    setupVod();
    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    createStreamingEngine();

    onStartupComplete.and.callFake(() => setupFakeGetTime(0));
    onChooseStreams.and.callFake((period) => defaultOnChooseStreams(period));

    // None of the first period streams have been set up yet because we haven't
    // started yet.
    expect(audioStream1.createSegmentIndex).not.toHaveBeenCalled();
    expect(videoStream1.createSegmentIndex).not.toHaveBeenCalled();
    expect(alternateVideoStream1.createSegmentIndex).not.toHaveBeenCalled();

    // None of the second period streams have been set up yet, either.
    expect(variant2.video.createSegmentIndex).not.toHaveBeenCalled();
    expect(variant2.audio.createSegmentIndex).not.toHaveBeenCalled();

    onInitialStreamsSetup.and.callFake(() => {
      // Once we're streaming, the first period audio & video streams have been
      // set up.
      expect(audioStream1.createSegmentIndex).toHaveBeenCalled();
      expect(videoStream1.createSegmentIndex).toHaveBeenCalled();

      // But not this alternate video stream from the first period.
      expect(alternateVideoStream1.createSegmentIndex).not.toHaveBeenCalled();

      // And not the streams from the second period.
      expect(variant2.video.createSegmentIndex).not.toHaveBeenCalled();
      expect(variant2.audio.createSegmentIndex).not.toHaveBeenCalled();
    });

    // Here we go!
    streamingEngine.start();

    await runTest();

    // Because we never switched to this stream, it was never set up at any time
    // during this simulated playback.
    expect(alternateVideoStream1.createSegmentIndex).not.toHaveBeenCalled();
  });

  /**
   * Verifies calls to NetworkingEngine.request(). Expects every segment
   * in the given Period to have been requested.
   *
   * @param {number} period The Period number (one-based).
   */
  function verifyNetworkingEngineRequestCalls(period) {
    netEngine.expectRangeRequest(
        period + '_audio_init',
        initSegmentRanges[ContentType.AUDIO][0],
        initSegmentRanges[ContentType.AUDIO][1]);

    netEngine.expectRangeRequest(
        period + '_video_init',
        initSegmentRanges[ContentType.VIDEO][0],
        initSegmentRanges[ContentType.VIDEO][1]);

    const segmentType = shaka.net.NetworkingEngine.RequestType.SEGMENT;
    netEngine.expectRequest(period + '_audio_1', segmentType);
    netEngine.expectRequest(period + '_video_1', segmentType);
    netEngine.expectRequest(period + '_text_1', segmentType);

    netEngine.expectRequest(period + '_audio_2', segmentType);
    netEngine.expectRequest(period + '_video_2', segmentType);
    netEngine.expectRequest(period + '_text_2', segmentType);

    netEngine.request.calls.reset();
  }

  /**
   * Choose streams for the given period.
   *
   * @param {shaka.extern.Period} period
   * @return {!Object.<string, !shaka.extern.Stream>}
   */
  function defaultOnChooseStreams(period) {
    if (period == manifest.periods[0]) {
      return {variant: variant1, text: textStream1};
    } else if (period == manifest.periods[1]) {
      return {variant: variant2, text: textStream2};
    } else {
      throw new Error();
    }
  }

  /**
   * Choose streams for the given period, used for testing unload text stream.
   * The text stream of the second period is not choosen.
   *
   * @param {shaka.extern.Period} period
   * @return {!Object.<string, !shaka.extern.Stream>}
   */
  function onChooseStreamsWithUnloadedText(period) {
    if (period == manifest.periods[0]) {
      return {variant: variant1, text: textStream1};
    } else if (period == manifest.periods[1]) {
      expect(streamingEngine.unloadTextStream).toHaveBeenCalled();
      return {variant: variant2};
    } else {
      throw new Error();
    }
  }

  /**
   * Makes the mock Playhead object behave as a fake Playhead object which
   * begins playback at the given time.
   *
   * @param {number} startTime the playhead's starting time with respect to
   *   the presentation timeline.
   */
  function setupFakeGetTime(startTime) {
    presentationTimeInSeconds = startTime;
    playing = true;
  }

  /**
   * Slides the segment availability window forward by 1 second.
   */
  function slideSegmentAvailabilityWindow() {
    timeline.segmentAvailabilityStart++;
    timeline.segmentAvailabilityEnd++;
  }

  /**
   * @param {!Object} netEngine A NetworkingEngine look-alike from
   *   shaka.test.StreamingEngineUtil.createFakeNetworkingEngine()
   * @param {string} targetUri
   * @param {shaka.util.Error.Code} errorCode
   */
  function failFirstRequestForTarget(netEngine, targetUri, errorCode) {
    // eslint-disable-next-line no-restricted-syntax
    const originalNetEngineRequest = netEngine.request.bind(netEngine);

    netEngine.attempts = 0;
    netEngine.request = jasmine.createSpy('request').and.callFake(
        (requestType, request) => {
          if (request.uris[0] == targetUri) {
            if (++netEngine.attempts == 1) {
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
});
