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

describe('StreamingEngine', function() {
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
  let initSegmentRanges = {};
  initSegmentRanges[ContentType.AUDIO] = [100, 1000];
  initSegmentRanges[ContentType.VIDEO] = [200, 2000];

  /** @type {!Object.<shaka.util.ManifestParserUtils.ContentType, number>} */
  let segmentSizes = {};
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
  let alternateVideoStream1;

  let audioStream2;
  let videoStream2;
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
  function runTest(callback) {
    function onTick(currentTime) {
      if (callback) callback();
      if (playing) {
        presentationTimeInSeconds++;
      }
    }
    // No test should require more than 60 seconds of simulated time.
    Util.fakeEventLoop(60, onTick);
  }

  beforeAll(function() {
    jasmine.clock().install();
    jasmine.clock().mockDate();
    // This mock is required for fakeEventLoop.
    PromiseMock.install();
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
    let initSegmentSizeAudio = initSegmentRanges[ContentType.AUDIO][1] -
        initSegmentRanges[ContentType.AUDIO][0] + 1;
    let initSegmentSizeVideo = initSegmentRanges[ContentType.VIDEO][1] -
        initSegmentRanges[ContentType.VIDEO][0] + 1;

    function makeBuffer(size) { return new ArrayBuffer(size); }
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
    let initSegmentSizeAudio = initSegmentRanges[ContentType.AUDIO][1] -
        initSegmentRanges[ContentType.AUDIO][0] + 1;
    let initSegmentSizeVideo = initSegmentRanges[ContentType.VIDEO][1] -
        initSegmentRanges[ContentType.VIDEO][0] + 1;

    function makeBuffer(size) { return new ArrayBuffer(size); }
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

    let segmentsInFirstPeriod = 12;
    for (let i = 0; i < segmentsInFirstPeriod; ++i) {
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

    let segmentsInSecondPeriod = 2;
    for (let i = 0; i < segmentsInSecondPeriod; ++i) {
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

    timeline = shaka.test.StreamingEngineUtil.createFakePresentationTimeline(
        100 /* segmentAvailabilityStart */,
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
        function(type, periodNumber) {
          expect((periodNumber == 1) || (periodNumber == 2));
          return segmentData[type].initSegments[periodNumber - 1];
        },
        // Media segment generator:
        function(type, periodNumber, position) {
          expect(position).toBeGreaterThan(0);
          expect((periodNumber == 1 && position <= segmentsInFirstPeriod) ||
                 (periodNumber == 2 && position <= segmentsInSecondPeriod));
          let i = (segmentsInFirstPeriod * (periodNumber - 1)) + (position - 1);
          return segmentData[type].segments[i];
        });
  }

  function setupManifest(
      firstPeriodStartTime, secondPeriodStartTime, presentationDuration) {
    let segmentDurations = {
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
        segmentDurations);

    manifest.presentationTimeline =
        /** @type {!shaka.media.PresentationTimeline} */ (timeline);
    manifest.minBufferTime = 2;

    // Create InitSegmentReferences.
    manifest.periods[0].variants[0].audio.initSegmentReference =
        new shaka.media.InitSegmentReference(
            function() { return ['1_audio_init']; },
            initSegmentRanges[ContentType.AUDIO][0],
            initSegmentRanges[ContentType.AUDIO][1]);
    manifest.periods[0].variants[0].video.initSegmentReference =
        new shaka.media.InitSegmentReference(
            function() { return ['1_video_init']; },
            initSegmentRanges[ContentType.VIDEO][0],
            initSegmentRanges[ContentType.VIDEO][1]);
    if (manifest.periods[0].variants[0].video.trickModeVideo) {
      manifest.periods[0].variants[0].video.trickModeVideo
          .initSegmentReference = new shaka.media.InitSegmentReference(
              function() { return ['1_trickvideo_init']; },
              initSegmentRanges[ContentType.VIDEO][0],
              initSegmentRanges[ContentType.VIDEO][1]);
    }
    manifest.periods[1].variants[0].audio.initSegmentReference =
        new shaka.media.InitSegmentReference(
            function() { return ['2_audio_init']; },
            initSegmentRanges[ContentType.AUDIO][0],
            initSegmentRanges[ContentType.AUDIO][1]);
    manifest.periods[1].variants[0].video.initSegmentReference =
        new shaka.media.InitSegmentReference(
            function() { return ['2_video_init']; },
            initSegmentRanges[ContentType.VIDEO][0],
            initSegmentRanges[ContentType.VIDEO][1]);
    if (manifest.periods[1].variants[0].video.trickModeVideo) {
      manifest.periods[1].variants[0].video.trickModeVideo
          .initSegmentReference = new shaka.media.InitSegmentReference(
              function() { return ['2_trickvideo_init']; },
              initSegmentRanges[ContentType.VIDEO][0],
              initSegmentRanges[ContentType.VIDEO][1]);
    }

    audioStream1 = manifest.periods[0].variants[0].audio;
    videoStream1 = manifest.periods[0].variants[0].video;
    variant1 = manifest.periods[0].variants[0];
    textStream1 = manifest.periods[0].textStreams[0];

    // This Stream is only used to verify that StreamingEngine can setup
    // Streams correctly. It does not have init or media segments.
    alternateVideoStream1 =
        shaka.test.StreamingEngineUtil.createMockVideoStream(8);
    alternateVideoStream1.createSegmentIndex.and.returnValue(Promise.resolve());
    alternateVideoStream1.findSegmentPosition.and.returnValue(null);
    alternateVideoStream1.getSegmentReference.and.returnValue(null);
    let variant = {
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
    manifest.periods[0].variants.push(variant);

    audioStream2 = manifest.periods[1].variants[0].audio;
    videoStream2 = manifest.periods[1].variants[0].video;
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

  afterEach(function(done) {
    streamingEngine.destroy().catch(fail).then(done);
    PromiseMock.flush();
  });

  afterAll(function() {
    PromiseMock.uninstall();
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
  it('initializes and plays VOD', function() {
    setupVod();
    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    createStreamingEngine();

    onStartupComplete.and.callFake(function() {
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

    onChooseStreams.and.callFake(function(period) {
      expect(period).toBe(manifest.periods[0]);

      onCanSwitch.and.callFake(function() {
        expect(alternateVideoStream1.createSegmentIndex).toHaveBeenCalled();
        expect(mediaSourceEngine.reinitText).not.toHaveBeenCalled();
        mediaSourceEngine.reinitText.calls.reset();
        onCanSwitch.and.throwError(new Error());
      });

      // For second Period.
      onChooseStreams.and.callFake(function(period) {
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

        onCanSwitch.and.callFake(function() {
          expect(audioStream2.createSegmentIndex).toHaveBeenCalled();
          expect(videoStream2.createSegmentIndex).toHaveBeenCalled();
          expect(textStream2.createSegmentIndex).toHaveBeenCalled();
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

    onInitialStreamsSetup.and.callFake(function() {
      const expectedObject = new Map();
      expectedObject.set(ContentType.AUDIO, audioStream1);
      expectedObject.set(ContentType.VIDEO, videoStream1);
      expectedObject.set(ContentType.TEXT, textStream1);
      expect(mediaSourceEngine.init)
          .toHaveBeenCalledWith(expectedObject, false);
      expect(mediaSourceEngine.init.calls.count()).toBe(1);
      mediaSourceEngine.init.calls.reset();

      expect(mediaSourceEngine.setDuration).toHaveBeenCalledWith(40);
      expect(mediaSourceEngine.setDuration.calls.count()).toBe(1);
      mediaSourceEngine.setDuration.calls.reset();

      expect(audioStream1.createSegmentIndex).toHaveBeenCalled();
      expect(videoStream1.createSegmentIndex).toHaveBeenCalled();
      expect(textStream1.createSegmentIndex).toHaveBeenCalled();

      expect(alternateVideoStream1.createSegmentIndex).not.toHaveBeenCalled();
    });

    // Here we go!
    streamingEngine.start();

    runTest();
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

  describe('loadNewTextStream', function() {
    it('clears MediaSourceEngine', function() {
      setupVod();
      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      createStreamingEngine();
      onStartupComplete.and.callFake(function() { setupFakeGetTime(0); });
      onChooseStreams.and.callFake(onChooseStreamsWithUnloadedText);

      streamingEngine.start();

      runTest(function() {
        if (presentationTimeInSeconds == 20) {
          mediaSourceEngine.clear.calls.reset();
          mediaSourceEngine.init.calls.reset();
          streamingEngine.loadNewTextStream(textStream2);
          PromiseMock.flush();
          expect(mediaSourceEngine.clear).toHaveBeenCalledWith('text');

          const expectedObject = new Map();
          expectedObject.set(ContentType.TEXT, jasmine.any(Object));
          expect(mediaSourceEngine.init).toHaveBeenCalledWith(
              expectedObject, false);
        }
      });
    });
  });

  describe('unloadTextStream', function() {
    it('doesn\'t send requests for text after calling unload', function() {
      setupVod();
      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      createStreamingEngine();
      onStartupComplete.and.callFake(function() { setupFakeGetTime(0); });
      onChooseStreams.and.callFake(onChooseStreamsWithUnloadedText);

      streamingEngine.start();
      const segmentType = shaka.net.NetworkingEngine.RequestType.SEGMENT;

      // Verify that after unloading text stream, no network request for text
      // is sent.
      runTest(function() {
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

  it('initializes and plays live', function() {
    setupLive();
    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    createStreamingEngine();

    presentationTimeInSeconds = 100;

    onStartupComplete.and.callFake(function() {
      setupFakeGetTime(100);
    });

    onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));

    // Here we go!
    streamingEngine.start();

    runTest(slideSegmentAvailabilityWindow);
    expect(mediaSourceEngine.endOfStream).toHaveBeenCalled();

    // Verify buffers.
    expect(mediaSourceEngine.initSegments).toEqual({
      audio: [false, true],
      video: [false, true],
      text: [],
    });

    // Since we started playback from segment 11, segments 10 through 14
    // should be buffered.
    for (let i = 0; i <= 8; ++i) {
      expect(mediaSourceEngine.segments[ContentType.AUDIO][i]).toBeFalsy();
      expect(mediaSourceEngine.segments[ContentType.VIDEO][i]).toBeFalsy();
      expect(mediaSourceEngine.segments[ContentType.TEXT][i]).toBeFalsy();
    }

    for (let i = 9; i <= 13; ++i) {
      expect(mediaSourceEngine.segments[ContentType.AUDIO][i]).toBeTruthy();
      expect(mediaSourceEngine.segments[ContentType.VIDEO][i]).toBeTruthy();
      expect(mediaSourceEngine.segments[ContentType.TEXT][i]).toBeTruthy();
    }
  });

  // Start the playhead in the first Period but pass start() Streams from the
  // second Period.
  it('plays from 1st Period when passed Streams from 2nd', function() {
    setupVod();
    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    createStreamingEngine();

    onStartupComplete.and.callFake(function() {
      setupFakeGetTime(0);
    });

    onChooseStreams.and.callFake(function(period) {
      expect(period).toBe(manifest.periods[0]);

      // Start with Streams from the second Period even though the playhead is
      // in the first Period. onChooseStreams() should be called again for the
      // first Period and then eventually for the second Period.

      onChooseStreams.and.callFake(function(period) {
        expect(period).toBe(manifest.periods[0]);

        onChooseStreams.and.callFake(function(period) {
          expect(period).toBe(manifest.periods[1]);

          return defaultOnChooseStreams(period);
        });

        return defaultOnChooseStreams(period);
      });

      return {variant: variant2, text: textStream2};
    });

    streamingEngine.start();

    runTest();
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
  it('plays from 2nd Period when passed Streams from 1st', function() {
    setupVod();
    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    createStreamingEngine();

    presentationTimeInSeconds = 20;
    onStartupComplete.and.callFake(function() {
      setupFakeGetTime(20);
    });

    onChooseStreams.and.callFake(function(period) {
      expect(period).toBe(manifest.periods[1]);

      // Start with Streams from the first Period even though the playhead is
      // in the second Period. onChooseStreams() should be called again for the
      // second Period.

      onChooseStreams.and.callFake(function(period) {
        expect(period).toBe(manifest.periods[1]);

        onChooseStreams.and.throwError(new Error());

        return defaultOnChooseStreams(period);
      });

      return {variant: variant1, text: textStream1};
    });

    streamingEngine.start();

    runTest();
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

  it('plays when a small gap is present at the beginning', function() {
    let drift = 0.050;  // 50 ms

    setupVod();
    mediaSourceEngine =
        new shaka.test.FakeMediaSourceEngine(segmentData, drift);
    createStreamingEngine();

    // Here we go!
    onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));
    streamingEngine.start();

    runTest();
    expect(onStartupComplete).toHaveBeenCalled();
  });

  it('plays when 1st Period doesn\'t have text streams', function() {
    setupVod();
    manifest.periods[0].textStreams = [];

    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    createStreamingEngine();

    onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 0));
    onChooseStreams.and.callFake(function(period) {
      let chosen = defaultOnChooseStreams(period);
      if (period == manifest.periods[0]) {
        chosen.text = null;
      }
      return chosen;
    });

    // Here we go!
    streamingEngine.start();
    runTest();

    expect(mediaSourceEngine.segments).toEqual({
      audio: [true, true, true, true],
      video: [true, true, true, true],
      text: [false, false, true, true],
    });
  });

  it('doesn\'t get stuck when 2nd Period isn\'t available yet', function() {
    // See: https://github.com/google/shaka-player/pull/839
    setupVod();
    manifest.periods[0].textStreams = [];

    // For the first update, indicate the segment isn't available.  This should
    // not cause us to fallback to the Playhead time to determine which segment
    // to start streaming.
    let oldGet = textStream2.getSegmentReference;
    textStream2.getSegmentReference = function(idx) {
      if (idx == 1) {
        textStream2.getSegmentReference = oldGet;
        return null;
      }
      return oldGet(idx);
    };

    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    createStreamingEngine();

    onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 0));
    onChooseStreams.and.callFake(function(period) {
      let chosen = defaultOnChooseStreams(period);
      if (period == manifest.periods[0]) {
        chosen.text = null;
      }
      return chosen;
    });

    // Here we go!
    streamingEngine.start();
    runTest();

    expect(mediaSourceEngine.segments).toEqual({
      audio: [true, true, true, true],
      video: [true, true, true, true],
      text: [false, false, true, true],
    });
  });

  it('only reinitializes text when switching streams', function() {
    // See: https://github.com/google/shaka-player/issues/910
    setupVod();
    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    createStreamingEngine();

    onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 0));
    onChooseStreams.and.callFake(defaultOnChooseStreams);

    // When we can switch in the second Period, switch to the playing stream.
    onCanSwitch.and.callFake(function() {
      onCanSwitch.and.callFake(function() {
        expect(streamingEngine.getBufferingText()).toBe(textStream2);

        mediaSourceEngine.reinitText.calls.reset();
        streamingEngine.switchTextStream(textStream2);
      });
    });

    // Here we go!
    streamingEngine.start();
    runTest();

    expect(mediaSourceEngine.reinitText).not.toHaveBeenCalled();
  });

  it('plays when 2nd Period doesn\'t have text streams', function() {
    setupVod();
    manifest.periods[1].textStreams = [];

    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    createStreamingEngine();

    onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 0));
    onChooseStreams.and.callFake(function(period) {
      let chosen = defaultOnChooseStreams(period);
      if (period == manifest.periods[1]) {
        chosen.text = null;
      }
      return chosen;
    });

    // Here we go!
    streamingEngine.start();
    runTest();

    expect(mediaSourceEngine.segments).toEqual({
      audio: [true, true, true, true],
      video: [true, true, true, true],
      text: [true, true, false, false],
    });
  });

  it('updates the timeline duration to match media duration', function() {
    setupVod();
    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    createStreamingEngine();

    onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 0));
    onChooseStreams.and.callFake(defaultOnChooseStreams);

    mediaSourceEngine.endOfStream.and.callFake(function() {
      expect(mediaSourceEngine.setDuration).toHaveBeenCalledWith(40);
      expect(mediaSourceEngine.setDuration).toHaveBeenCalledTimes(1);
      mediaSourceEngine.setDuration.calls.reset();
      // Simulate the media ending BEFORE the expected (manifest) duration.
      mediaSourceEngine.getDuration.and.returnValue(35);
      return Promise.resolve();
    });

    // Here we go!
    streamingEngine.start();

    runTest();
    expect(mediaSourceEngine.endOfStream).toHaveBeenCalled();
    expect(timeline.setDuration).toHaveBeenCalledWith(35);
  });

  // https://github.com/google/shaka-player/issues/979
  it('does not expand the timeline duration', function() {
    setupVod();
    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    createStreamingEngine();

    onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 0));
    onChooseStreams.and.callFake(defaultOnChooseStreams);

    mediaSourceEngine.endOfStream.and.callFake(function() {
      expect(mediaSourceEngine.setDuration).toHaveBeenCalledWith(40);
      expect(mediaSourceEngine.setDuration).toHaveBeenCalledTimes(1);
      mediaSourceEngine.setDuration.calls.reset();
      // Simulate the media ending AFTER the expected (manifest) duration.
      mediaSourceEngine.getDuration.and.returnValue(41);
      return Promise.resolve();
    });

    // Here we go!
    streamingEngine.start();

    runTest();
    expect(mediaSourceEngine.endOfStream).toHaveBeenCalled();
    expect(timeline.setDuration).not.toHaveBeenCalled();
  });

  // https://github.com/google/shaka-player/issues/1967
  it('does not change duration when 0', () => {
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

    runTest();
    expect(mediaSourceEngine.endOfStream).toHaveBeenCalled();
    expect(timeline.setDuration).not.toHaveBeenCalled();
  });

  it('applies fudge factor for appendWindowStart', function() {
    setupVod();
    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    createStreamingEngine();

    onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 0));
    onChooseStreams.and.callFake(defaultOnChooseStreams);

    // Here we go!
    streamingEngine.start();
    runTest();

    // The second Period starts at 20, so we should set the appendWindowStart to
    // 20, but reduced by a small fudge factor.
    let lt20 = {
      asymmetricMatch: function(val) {
        return val >= 19.9 && val < 20;
      },
    };
    expect(mediaSourceEngine.setStreamProperties)
        .toHaveBeenCalledWith('video', 20, lt20, 40);
  });

  it('does not buffer one media type ahead of another', function() {
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
      ['audio', 'video', 'text'].forEach((t) => {
        const buffered = mediaSourceEngine.bufferedAheadOfImpl(t, 0);
        minBuffered = Math.min(minBuffered, buffered);
        maxBuffered = Math.max(maxBuffered, buffered);
      });

      // Sanity check.
      expect(maxBuffered).not.toBeLessThan(minBuffered);
      // Proof that we didn't get too far ahead (10s == 1 segment).
      expect(maxBuffered - minBuffered).not.toBeGreaterThan(10);

      return p;
    });

    // Here we go!
    onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 0));
    onChooseStreams.and.callFake(defaultOnChooseStreams);
    streamingEngine.start();

    runTest();
    // Make sure appendBuffer was called, so that we know that we executed the
    // checks in our fake above.
    expect(mediaSourceEngine.appendBuffer).toHaveBeenCalled();
  });

  describe('switchVariant/switchTextStream', function() {
    let initialVariant;
    let sameAudioVariant;
    let sameVideoVariant;
    let initialTextStream;

    beforeEach(function() {
      // Set up a manifest with multiple variants and a text stream.
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addVariant(0)
            .addAudio(10).useSegmentTemplate('audio-10-%d.mp4', 10)
            .addVideo(11).useSegmentTemplate('video-11-%d.mp4', 10)
          .addVariant(1)
            .addExistingStream(10)  // audio
            .addVideo(12).useSegmentTemplate('video-12-%d.mp4', 10)
          .addVariant(2)
            .addAudio(13).useSegmentTemplate('audio-13-%d.mp4', 10)
            .addExistingStream(12)  // video
          .addTextStream(20).useSegmentTemplate('text-20-%d.mp4', 10)
        .build();

      initialVariant = manifest.periods[0].variants[0];
      sameAudioVariant = manifest.periods[0].variants[1];
      sameVideoVariant = manifest.periods[0].variants[2];
      initialTextStream = manifest.periods[0].textStreams[0];

      // For these tests, we don't care about specific data appended.
      // Just return any old ArrayBuffer for any requested segment.
      netEngine = {
        request: function(requestType, request) {
          let buffer = new ArrayBuffer(0);
          let response = {uri: request.uris[0], data: buffer, headers: {}};
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

      let bufferEnd = {audio: 0, video: 0, text: 0};
      mediaSourceEngine.appendBuffer.and.callFake(
          function(type, data, start, end) {
            bufferEnd[type] = end;
            return Promise.resolve();
          });
      mediaSourceEngine.bufferEnd.and.callFake(function(type) {
        return bufferEnd[type];
      });
      mediaSourceEngine.bufferedAheadOf.and.callFake(function(type, start) {
        return Math.max(0, bufferEnd[type] - start);
      });
      mediaSourceEngine.isBuffered.and.callFake(function(type, time) {
        return time >= 0 && time < bufferEnd[type];
      });

      playing = false;
      presentationTimeInSeconds = 0;
      createStreamingEngine();

      onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 0));
      onChooseStreams.and.callFake(function() {
        return {variant: initialVariant, text: initialTextStream};
      });
    });

    it('will not clear buffers if streams have not changed', function() {
      onCanSwitch.and.callFake(function() {
        mediaSourceEngine.clear.calls.reset();
        streamingEngine.switchVariant(
            sameAudioVariant, /* clearBuffer */ true, /* safeMargin */ 0);
        Util.fakeEventLoop(1);
        expect(mediaSourceEngine.clear).not.toHaveBeenCalledWith('audio');
        expect(mediaSourceEngine.clear).toHaveBeenCalledWith('video');
        expect(mediaSourceEngine.clear).not.toHaveBeenCalledWith('text');

        mediaSourceEngine.clear.calls.reset();
        streamingEngine.switchVariant(
            sameVideoVariant, /* clearBuffer */ true, /* safeMargin */ 0);
        Util.fakeEventLoop(1);
        expect(mediaSourceEngine.clear).toHaveBeenCalledWith('audio');
        expect(mediaSourceEngine.clear).not.toHaveBeenCalledWith('video');
        expect(mediaSourceEngine.clear).not.toHaveBeenCalledWith('text');

        mediaSourceEngine.clear.calls.reset();
        streamingEngine.switchTextStream(initialTextStream);
        Util.fakeEventLoop(1);
        expect(mediaSourceEngine.clear).not.toHaveBeenCalled();
      });

      streamingEngine.start().catch(fail);

      Util.fakeEventLoop(1);

      expect(onCanSwitch).toHaveBeenCalled();
    });
  });

  describe('handles seeks (VOD)', function() {
    /** @type {!jasmine.Spy} */
    let onTick;

    beforeEach(function() {
      setupVod();
      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      createStreamingEngine();

      onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 0));

      onTick = jasmine.createSpy('onTick');
      onTick.and.stub();
    });

    it('into buffered regions', function() {
      onChooseStreams.and.callFake(function(period) {
        expect(period).toBe(manifest.periods[0]);

        onChooseStreams.and.callFake(function(period) {
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

      runTest();
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

    it('into partially buffered regions in the same period', function() {
      // When seeking into a region within the same period, or changing
      // resolution, and after the seek some states are buffered and some
      // are unbuffered, StreamingEngine should only clear the unbuffered
      // states.
      onChooseStreams.and.callFake(function(period) {
        expect(period).toBe(manifest.periods[0]);

        onChooseStreams.and.callFake(function(period) {
          expect(period).toBe(manifest.periods[1]);

          mediaSourceEngine.endOfStream.and.callFake(function() {
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

      onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 0));

      // Here we go!
      streamingEngine.start();
      runTest();

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


    it('into buffered regions across Periods', function() {
      onChooseStreams.and.callFake(function(period) {
        expect(period).toBe(manifest.periods[0]);

        onChooseStreams.and.callFake(function(period) {
          expect(period).toBe(manifest.periods[1]);

          onChooseStreams.and.throwError(new Error());

          // Switch to the second Period.
          return defaultOnChooseStreams(period);
        });

        mediaSourceEngine.endOfStream.and.callFake(function() {
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

      runTest();
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

    it('into unbuffered regions', function() {
      onChooseStreams.and.callFake(function(period) {
        expect(period).toBe(manifest.periods[0]);

        onChooseStreams.and.throwError(new Error());

        // Init the first Period.
        return defaultOnChooseStreams(period);
      });

      onStartupComplete.and.callFake(function() {
        setupFakeGetTime(0);

        // Seek forward to an unbuffered region in the first Period.
        expect(presentationTimeInSeconds).toBe(0);
        presentationTimeInSeconds += 15;
        streamingEngine.seeked();

        onTick.and.callFake(function() {
          // Verify that all buffers have been cleared.
          expect(mediaSourceEngine.clear)
                .toHaveBeenCalledWith(ContentType.AUDIO);
          expect(mediaSourceEngine.clear)
                .toHaveBeenCalledWith(ContentType.VIDEO);
          expect(mediaSourceEngine.clear)
                .toHaveBeenCalledWith(ContentType.TEXT);
          onTick.and.stub();
        });

        onChooseStreams.and.callFake(function(period) {
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

      runTest(Util.spyFunc(onTick));
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

    it('into unbuffered regions across Periods', function() {
      // Start from the second Period.
      presentationTimeInSeconds = 20;

      onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 20));

      onChooseStreams.and.callFake(function(period) {
        expect(period).toBe(manifest.periods[1]);

        onChooseStreams.and.throwError(new Error());

        // Init the second Period.
        return defaultOnChooseStreams(period);
      });

      mediaSourceEngine.endOfStream.and.callFake(function() {
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

        onTick.and.callFake(function() {
          // Verify that all buffers have been cleared.
          expect(mediaSourceEngine.clear)
                .toHaveBeenCalledWith(ContentType.AUDIO);
          expect(mediaSourceEngine.clear)
                .toHaveBeenCalledWith(ContentType.VIDEO);
          expect(mediaSourceEngine.clear)
                .toHaveBeenCalledWith(ContentType.TEXT);
          onTick.and.stub();
        });

        onChooseStreams.and.callFake(function(period) {
          expect(period).toBe(manifest.periods[0]);

          onChooseStreams.and.callFake(function(period) {
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

      runTest(Util.spyFunc(onTick));
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

    it('into unbuffered regions when nothing is buffered', function() {
      onChooseStreams.and.callFake(function(period) {
        expect(period).toBe(manifest.periods[0]);

        onChooseStreams.and.throwError(new Error());

        // Init the first Period.
        return defaultOnChooseStreams(period);
      });

      onInitialStreamsSetup.and.callFake(function() {
        // Seek forward to an unbuffered region in the first Period.
        expect(presentationTimeInSeconds).toBe(0);
        presentationTimeInSeconds = 15;
        streamingEngine.seeked();

        onTick.and.callFake(function() {
          // Nothing should have been cleared.
          expect(mediaSourceEngine.clear).not.toHaveBeenCalled();
          onTick.and.stub();
        });

        onChooseStreams.and.callFake(function(period) {
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
      onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 15));

      // Here we go!
      streamingEngine.start();

      runTest(Util.spyFunc(onTick));
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
    it('back into unbuffered regions without seeked() ', function() {
      // Start from the second segment in the second Period.
      presentationTimeInSeconds = 30;

      onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 20));

      onChooseStreams.and.callFake(function(period) {
        expect(period).toBe(manifest.periods[1]);

        // Init the second Period.
        return defaultOnChooseStreams(period);
      });

      mediaSourceEngine.endOfStream.and.callFake(function() {
        // Seek backwards to an unbuffered region in the second Period. Do not
        // call seeked().
        expect(presentationTimeInSeconds).toBe(26);
        presentationTimeInSeconds -= 10;
        return Promise.resolve();
      });

      // Here we go!
      streamingEngine.start();

      runTest();
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
    it('forward into unbuffered regions without seeked()', function() {
      onChooseStreams.and.callFake(function(period) {
        expect(period).toBe(manifest.periods[0]);

        // Init the first Period.
        return defaultOnChooseStreams(period);
      });

      onStartupComplete.and.callFake(function() {
        setupFakeGetTime(0);

        // Seek forward to an unbuffered region in the first Period. Do not
        // call seeked().
        presentationTimeInSeconds += 15;

        onChooseStreams.and.callFake(function(period) {
          expect(period).toBe(manifest.periods[1]);

          // Switch to the second Period.
          return defaultOnChooseStreams(period);
        });
      });

      // Here we go!
      streamingEngine.start();

      runTest();
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

    it('into partially buffered regions across periods', function() {
      // Seeking into a region where some buffers (text) are buffered and some
      // are not should work despite the media states requiring different
      // periods.
      onChooseStreams.and.callFake(function(period) {
        expect(period).toBe(manifest.periods[0]);

        onChooseStreams.and.callFake(function(period) {
          expect(period).toBe(manifest.periods[1]);

          // Should get another call for the unbuffered Period transition.
          onChooseStreams.and.callFake(defaultOnChooseStreams);

          mediaSourceEngine.endOfStream.and.callFake(function() {
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

      onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 0));

      // Here we go!
      streamingEngine.start();
      runTest();

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

  describe('handles seeks (live)', function() {
    beforeEach(function() {
      setupLive();
      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData, 0);
      createStreamingEngine();

      onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 100));
    });

    it('outside segment availability window', function() {
      timeline.segmentAvailabilityStart = 90;
      timeline.segmentAvailabilityEnd = 110;

      presentationTimeInSeconds = 90;

      onChooseStreams.and.callFake(function(period) {
        expect(period).toBe(manifest.periods[0]);

        onChooseStreams.and.throwError(new Error());

        // Init the first Period.
        return defaultOnChooseStreams(period);
      });

      onStartupComplete.and.callFake(function() {
        setupFakeGetTime(90);

        // Seek forward to an unbuffered and unavailable region in the second
        // Period; set playing to false since the playhead can't move at the
        // seek target.
        expect(timeline.getSegmentAvailabilityStart()).toBe(90);
        expect(timeline.getSegmentAvailabilityEnd()).toBe(110);
        presentationTimeInSeconds += 35;
        playing = false;
        streamingEngine.seeked();

        onChooseStreams.and.callFake(function(period) {
          expect(period).toBe(manifest.periods[1]);

          onChooseStreams.and.throwError(new Error());

          // Switch to the second Period.
          return defaultOnChooseStreams(period);
        });

        // Eventually StreamingEngine should request the first segment (since
        // it needs the second segment) of the second Period when it becomes
        // available.
        let originalAppendBuffer =
            shaka.test.FakeMediaSourceEngine.prototype.appendBufferImpl;
        mediaSourceEngine.appendBuffer.and.callFake(
            function(type, data, startTime, endTime) {
              expect(presentationTimeInSeconds).toBe(125);
              expect(timeline.getSegmentAvailabilityStart()).toBe(100);
              expect(timeline.getSegmentAvailabilityEnd()).toBe(120);
              playing = true;
              let p = originalAppendBuffer.call(
                  mediaSourceEngine, type, data, startTime, endTime);
              mediaSourceEngine.appendBuffer.and.callFake(originalAppendBuffer);
              return p;
            });
      });

      // Here we go!
      streamingEngine.start();

      runTest(slideSegmentAvailabilityWindow);
      // Verify buffers.
      expect(mediaSourceEngine.initSegments).toEqual({
        audio: [false, true],
        video: [false, true],
        text: [],
      });

      // Since we performed an unbuffered seek into the second Period, the
      // first 12 segments should not be buffered.
      for (let i = 0; i <= 11; ++i) {
        expect(mediaSourceEngine.segments[ContentType.AUDIO][i]).toBeFalsy();
        expect(mediaSourceEngine.segments[ContentType.VIDEO][i]).toBeFalsy();
        expect(mediaSourceEngine.segments[ContentType.TEXT][i]).toBeFalsy();
      }

      for (let i = 12; i <= 13; ++i) {
        expect(mediaSourceEngine.segments[ContentType.AUDIO][i]).toBeTruthy();
        expect(mediaSourceEngine.segments[ContentType.VIDEO][i]).toBeTruthy();
        expect(mediaSourceEngine.segments[ContentType.TEXT][i]).toBeTruthy();
      }
    });
  });

  describe('handles errors', function() {
    beforeEach(function() {
      setupVod();
      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      createStreamingEngine();
    });

    it('from initial Stream setup', function() {
      videoStream1.createSegmentIndex.and.returnValue(
          Promise.reject('FAKE_ERROR'));

      let onInitError = jasmine.createSpy('onInitError');
      onInitError.and.callFake(function(error) {
        expect(onInitialStreamsSetup).not.toHaveBeenCalled();
        expect(onStartupComplete).not.toHaveBeenCalled();
        expect(error).toBe('FAKE_ERROR');
      });

      // Here we go!
      onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));
      streamingEngine.start().then(fail).catch(Util.spyFunc(onInitError));

      runTest();
      expect(onInitError).toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    });

    it('from post startup Stream setup', function() {
      alternateVideoStream1.createSegmentIndex.and.returnValue(
          Promise.reject('FAKE_ERROR'));

      onError.and.callFake(function(error) {
        expect(onInitialStreamsSetup).toHaveBeenCalled();
        expect(onStartupComplete).toHaveBeenCalled();
        expect(error).toBe('FAKE_ERROR');
      });

      // Here we go!
      onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));
      streamingEngine.start().catch(fail);
      runTest();
      expect(onError).toHaveBeenCalled();
    });

    it('from failed init segment append during startup', function() {
      let expectedError = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.MEDIA_SOURCE_OPERATION_FAILED);

      onError.and.callFake(function(error) {
        expect(onInitialStreamsSetup).toHaveBeenCalled();
        expect(onStartupComplete).not.toHaveBeenCalled();
        Util.expectToEqualError(error, expectedError);
      });

      onChooseStreams.and.callFake(function(period) {
        expect(period).toBe(manifest.periods[0]);

        let streamsByType = defaultOnChooseStreams(period);

        let originalAppendBuffer =
            shaka.test.FakeMediaSourceEngine.prototype.appendBufferImpl;
        mediaSourceEngine.appendBuffer.and.callFake(
            function(type, data, startTime, endTime) {
              // Reject the first video init segment.
              if (data == segmentData[ContentType.VIDEO].initSegments[0]) {
                return Promise.reject(expectedError);
              } else {
                return originalAppendBuffer.call(
                    mediaSourceEngine, type, data, startTime, endTime);
              }
            });

        return streamsByType;
      });

      // Here we go!
      streamingEngine.start().catch(fail);
      runTest();
      expect(onError).toHaveBeenCalled();
    });

    it('from failed media segment append during startup', function() {
      let expectedError = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.MEDIA_SOURCE_OPERATION_FAILED);

      onError.and.callFake(function(error) {
        expect(onInitialStreamsSetup).toHaveBeenCalled();
        expect(onStartupComplete).not.toHaveBeenCalled();
        Util.expectToEqualError(error, expectedError);
      });

      onChooseStreams.and.callFake(function(period) {
        expect(period).toBe(manifest.periods[0]);

        let streamsByType = defaultOnChooseStreams(period);

        let originalAppendBuffer =
            shaka.test.FakeMediaSourceEngine.prototype.appendBufferImpl;
        mediaSourceEngine.appendBuffer.and.callFake(
            function(type, data, startTime, endTime) {
              // Reject the first audio segment.
              if (data == segmentData[ContentType.AUDIO].segments[0]) {
                return Promise.reject(expectedError);
              } else {
                return originalAppendBuffer.call(
                    mediaSourceEngine, type, data, startTime, endTime);
              }
            });

        return streamsByType;
      });

      // Here we go!
      streamingEngine.start().catch(fail);
      runTest();
      expect(onError).toHaveBeenCalled();
    });

    it('from failed clear in switchVariant', () => {
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
      runTest();
      expect(onError).toHaveBeenCalledWith(Util.jasmineError(expectedError));
    });
  });

  describe('handles network errors', function() {
    it('ignores text stream failures if configured to', function() {
      setupVod();
      let textUri = '1_text_1';
      let originalNetEngine = netEngine;
      netEngine = {
        request: jasmine.createSpy('request'),
      };
      netEngine.request.and.callFake(function(requestType, request) {
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

      onStartupComplete.and.callFake(function() {
        setupFakeGetTime(0);
      });

      // Here we go!
      onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));
      streamingEngine.start();

      runTest();
      expect(onError.calls.count()).toBe(0);
      expect(mediaSourceEngine.endOfStream).toHaveBeenCalled();
    });

    it('retries if configured to', function() {
      setupLive();

      // Wrap the NetworkingEngine to cause errors.
      let targetUri = '1_audio_init';
      failFirstRequestForTarget(netEngine, targetUri,
                                shaka.util.Error.Code.BAD_HTTP_STATUS);

      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);

      const config = shaka.util.PlayerConfiguration.createDefault().streaming;
      config.failureCallback = () => streamingEngine.retry();
      createStreamingEngine(config);

      presentationTimeInSeconds = 100;
      onStartupComplete.and.callFake(function() {
        setupFakeGetTime(100);
      });

      onError.and.callFake(function(error) {
        expect(error.severity).toBe(shaka.util.Error.Severity.CRITICAL);
        expect(error.category).toBe(shaka.util.Error.Category.NETWORK);
        expect(error.code).toBe(shaka.util.Error.Code.BAD_HTTP_STATUS);
      });

      // Here we go!
      onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));
      streamingEngine.start();

      runTest();
      expect(onError.calls.count()).toBe(1);
      expect(netEngine.attempts).toBeGreaterThan(1);
      expect(mediaSourceEngine.endOfStream).toHaveBeenCalledTimes(1);
    });

    it('does not retry if configured not to', function() {
      setupLive();

      // Wrap the NetworkingEngine to cause errors.
      let targetUri = '1_audio_init';
      failFirstRequestForTarget(netEngine, targetUri,
                                shaka.util.Error.Code.BAD_HTTP_STATUS);

      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);

      const config = shaka.util.PlayerConfiguration.createDefault().streaming;
      config.failureCallback = () => {};
      createStreamingEngine(config);

      presentationTimeInSeconds = 100;
      onStartupComplete.and.callFake(function() {
        setupFakeGetTime(100);
      });

      onError.and.callFake(function(error) {
        expect(error.severity).toBe(shaka.util.Error.Severity.CRITICAL);
        expect(error.category).toBe(shaka.util.Error.Category.NETWORK);
        expect(error.code).toBe(shaka.util.Error.Code.BAD_HTTP_STATUS);
      });

      // Here we go!
      onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));
      streamingEngine.start();

      runTest();
      expect(onError.calls.count()).toBe(1);
      expect(netEngine.attempts).toBe(1);
      expect(mediaSourceEngine.endOfStream).toHaveBeenCalledTimes(0);
    });

    it('does not invoke the callback if the error is handled', function() {
      setupLive();

      // Wrap the NetworkingEngine to cause errors.
      let targetUri = '1_audio_init';
      failFirstRequestForTarget(netEngine, targetUri,
                                shaka.util.Error.Code.BAD_HTTP_STATUS);

      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);

      // Configure with a failure callback
      const failureCallback = jasmine.createSpy('failureCallback');
      const config = shaka.util.PlayerConfiguration.createDefault().streaming;
      config.failureCallback = shaka.test.Util.spyFunc(failureCallback);
      createStreamingEngine(config);

      presentationTimeInSeconds = 100;
      onStartupComplete.and.callFake(function() {
        setupFakeGetTime(100);
      });

      onError.and.callFake(function(error) {
        error.handled = true;
      });

      // Here we go!
      onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));
      streamingEngine.start();

      runTest();
      expect(onError.calls.count()).toBe(1);
      expect(failureCallback).not.toHaveBeenCalled();
    });

    it('waits to invoke the failure callback', function() {
      setupLive();

      // Wrap the NetworkingEngine to cause errors.
      let targetUri = '1_audio_init';
      failFirstRequestForTarget(netEngine, targetUri,
                                shaka.util.Error.Code.BAD_HTTP_STATUS);

      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);

      // Configure with a failure callback that records the callback time.
      let callbackTime = null;
      let failureCallback = jasmine.createSpy('failureCallback');
      failureCallback.and.callFake(function() { callbackTime = Date.now(); });

      const config = shaka.util.PlayerConfiguration.createDefault().streaming;
      config.failureCallback = shaka.test.Util.spyFunc(failureCallback);
      config.retryParameters.maxAttempts = 2;
      config.retryParameters.baseDelay = 10000;
      config.retryParameters.fuzzFactor = 0;
      createStreamingEngine(config);

      presentationTimeInSeconds = 100;
      onStartupComplete.and.callFake(function() {
        setupFakeGetTime(100);
      });
      onError.and.stub();

      // Here we go!
      onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));
      streamingEngine.start();

      let startTime = Date.now();
      runTest();
      expect(failureCallback).toHaveBeenCalled();
      expect(callbackTime - startTime).toEqual(10000);  // baseDelay == 10000
    });
  });

  describe('retry()', function() {
    it('resumes streaming after failure', function() {
      setupVod();

      // Wrap the NetworkingEngine to cause errors.
      let targetUri = '1_audio_init';
      let originalNetEngineRequest = netEngine.request;
      failFirstRequestForTarget(netEngine, targetUri,
                                shaka.util.Error.Code.BAD_HTTP_STATUS);

      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      createStreamingEngine();

      onStartupComplete.and.callFake(function() {
        setupFakeGetTime(0);
      });

      onError.and.callFake(function(error) {
        // Restore the original fake request function.
        netEngine.request = originalNetEngineRequest;
        netEngine.request.calls.reset();

        // Retry streaming.
        expect(streamingEngine.retry()).toBe(true);
      });

      // Here we go!
      onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));
      streamingEngine.start();

      runTest();
      // We definitely called onError().
      expect(onError.calls.count()).toBe(1);
      // We reset the request calls in onError() just before retry(), so this
      // count reflects new calls since retry().
      expect(netEngine.request.calls.count()).toBeGreaterThan(0);
      // The retry worked, so we should have reached the end of the stream.
      expect(mediaSourceEngine.endOfStream).toHaveBeenCalledTimes(1);
    });

    it('does not resume streaming after quota error', function() {
      setupVod();

      let appendBufferSpy = jasmine.createSpy('appendBuffer');
      // Throw QuotaExceededError on every segment to quickly trigger the quota
      // error.
      appendBufferSpy.and.callFake(function(type, data, startTime, endTime) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MEDIA,
            shaka.util.Error.Code.QUOTA_EXCEEDED_ERROR,
            type);
      });

      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      mediaSourceEngine.appendBuffer = appendBufferSpy;
      createStreamingEngine();

      onStartupComplete.and.callFake(function() {
        setupFakeGetTime(0);
      });

      onError.and.callFake(function(error) {
        expect(error.code).toBe(shaka.util.Error.Code.QUOTA_EXCEEDED_ERROR);

        // Retry streaming, which should fail and return false.
        netEngine.request.calls.reset();
        expect(streamingEngine.retry()).toBe(false);
      });

      // Here we go!
      onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));
      streamingEngine.start();

      runTest();

      // We definitely called onError().
      expect(onError.calls.count()).toBe(1);

      // We reset the request calls in onError() just before retry(), so this
      // count reflects new calls since retry().
      expect(netEngine.request.calls.count()).toBe(0);
      expect(mediaSourceEngine.endOfStream).not.toHaveBeenCalled();
    });

    it('does not resume streaming after destruction', function() {
      setupVod();

      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      createStreamingEngine();

      onStartupComplete.and.callFake(function() {
        setupFakeGetTime(0);
      });

      onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));
      streamingEngine.start();

      // Here we go!
      let count = 0;
      runTest(function() {
        if (++count == 3) {
          streamingEngine.destroy();
          PromiseMock.flush();

          // Retry streaming, which should fail and return false.
          netEngine.request.calls.reset();
          expect(streamingEngine.retry()).toBe(false);
        }
      });

      // We reset the request calls in onError() just before retry(), so this
      // count reflects new calls since retry().
      expect(netEngine.request.calls.count()).toBe(0);
      expect(mediaSourceEngine.endOfStream).not.toHaveBeenCalled();
    });
  });

  describe('eviction', function() {
    let config;

    beforeEach(function() {
      setupVod();

      manifest.minBufferTime = 1;

      config = shaka.util.PlayerConfiguration.createDefault().streaming;
      config.rebufferingGoal = 1;
      config.bufferingGoal = 1;
      config.bufferBehind = 10;
    });

    it('evicts media to meet the max buffer tail limit', function() {
      // Create StreamingEngine.
      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      createStreamingEngine(config);

      onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 0));

      let originalRemove =
          shaka.test.FakeMediaSourceEngine.prototype.removeImpl
              .bind(mediaSourceEngine);

      mediaSourceEngine.remove.and.callFake(function(type, start, end) {
        expect(presentationTimeInSeconds).toBe(20);
        expect(start).toBe(0);
        expect(end).toBe(10);

        if (mediaSourceEngine.remove.calls.count() == 3) {
          mediaSourceEngine.remove.and.callFake(function(type, start, end) {
            expect(presentationTimeInSeconds).toBe(30);
            expect(start).toBe(10);
            expect(end).toBe(20);
            return originalRemove(type, start, end);
          });
        }

        return originalRemove(type, start, end);
      });

      // Here we go!
      onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));
      streamingEngine.start();

      // Since StreamingEngine is free to peform audio, video, and text updates
      // in any order, there are many valid ways in which StreamingEngine can
      // evict segments. So, instead of verifying the exact, final buffer
      // configuration, ensure the byte limit is never exceeded and at least
      // one segment of each type is buffered at the end of the test.
      runTest();
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

    it('doesn\'t evict too much when bufferBehind is very low', function() {
      // Set the bufferBehind to a value significantly below the segment size.
      config.bufferBehind = 0.1;

      // Create StreamingEngine.
      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      createStreamingEngine(config);
      onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 0));
      onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));
      streamingEngine.start();

      runTest(() => {
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

  describe('QuotaExceededError', function() {
    it('does not fail immediately', function() {
      setupVod();

      manifest.minBufferTime = 1;

      // Create StreamingEngine.
      const config = shaka.util.PlayerConfiguration.createDefault().streaming;
      config.rebufferingGoal = 1;
      config.bufferingGoal = 1;
      config.bufferBehind = 10;

      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      createStreamingEngine(config);

      onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 0));

      let originalAppendBuffer =
          shaka.test.FakeMediaSourceEngine.prototype.appendBufferImpl;
      let appendBufferSpy = jasmine.createSpy('appendBuffer');
      mediaSourceEngine.appendBuffer = appendBufferSpy;

      // Throw two QuotaExceededErrors at different times.
      let numErrorsThrown = 0;
      appendBufferSpy.and.callFake(
          function(type, data, startTime, endTime) {
            let throwError = (numErrorsThrown == 0 && startTime == 10) ||
                             (numErrorsThrown == 1 && startTime == 20);
            if (throwError) {
              numErrorsThrown++;
              throw new shaka.util.Error(
                  shaka.util.Error.Severity.CRITICAL,
                  shaka.util.Error.Category.MEDIA,
                  shaka.util.Error.Code.QUOTA_EXCEEDED_ERROR,
                  type);
            } else {
              let p = originalAppendBuffer.call(
                  mediaSourceEngine, type, data, startTime, endTime);
              return p;
            }
          });

      // Here we go!
      onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));
      streamingEngine.start();

      runTest();
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

    it('fails after multiple QuotaExceededError', function() {
      setupVod();

      manifest.minBufferTime = 1;

      // Create StreamingEngine.
      const config = shaka.util.PlayerConfiguration.createDefault().streaming;
      config.rebufferingGoal = 1;
      config.bufferingGoal = 1;

      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      createStreamingEngine(config);

      onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 0));

      let originalAppendBuffer =
          shaka.test.FakeMediaSourceEngine.prototype.appendBufferImpl;
      let appendBufferSpy = jasmine.createSpy('appendBuffer');
      mediaSourceEngine.appendBuffer = appendBufferSpy;

      // Throw QuotaExceededError multiple times after at least one segment of
      // each type has been appended.
      appendBufferSpy.and.callFake(
          function(type, data, startTime, endTime) {
            if (startTime >= 10) {
              throw new shaka.util.Error(
                  shaka.util.Error.Severity.CRITICAL,
                  shaka.util.Error.Category.MEDIA,
                  shaka.util.Error.Code.QUOTA_EXCEEDED_ERROR,
                  type);
            } else {
              let p = originalAppendBuffer.call(
                  mediaSourceEngine, type, data, startTime, endTime);
              return p;
            }
          });

      onError.and.callFake(function(error) {
        expect(error.code).toBe(shaka.util.Error.Code.QUOTA_EXCEEDED_ERROR);
        expect(error.data[0] == ContentType.AUDIO ||
               error.data[0] == ContentType.VIDEO ||
               error.data[0] == ContentType.TEXT).toBe(true);
      });

      // Here we go!
      onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));
      streamingEngine.start();

      // Stop the playhead after 10 seconds since will not append any
      // segments after this time.
      let stopPlayhead = () => { playing = presentationTimeInSeconds < 10; };

      runTest(stopPlayhead);
      expect(onError).toHaveBeenCalled();
      expect(mediaSourceEngine.endOfStream).not.toHaveBeenCalled();
    });
  });

  describe('VOD drift', function() {
    beforeEach(function() {
      setupVod();
    });

    /**
     * @param {number} drift
     */
    function testPositiveDrift(drift) {
      mediaSourceEngine =
          new shaka.test.FakeMediaSourceEngine(segmentData, drift);
      createStreamingEngine();

      onStartupComplete.and.callFake(setupFakeGetTime.bind(null, drift));

      // Here we go!
      onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));
      streamingEngine.start();

      runTest();
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
    function testNegativeDrift(drift) {
      mediaSourceEngine =
          new shaka.test.FakeMediaSourceEngine(segmentData, drift);
      createStreamingEngine();

      onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 0));

      // Here we go!
      onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));
      streamingEngine.start();

      runTest();
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

    it('is handled for small + values', testPositiveDrift.bind(null, 3));
    it('is handled for large + values', testPositiveDrift.bind(null, 12));
    it('is handled for small - values', testNegativeDrift.bind(null, -3));
  });

  describe('live drift', function() {
    beforeEach(function() {
      setupLive();
    });

    /**
     * @param {number} drift
     */
    function testNegativeDrift(drift) {
      mediaSourceEngine =
          new shaka.test.FakeMediaSourceEngine(segmentData, drift);
      createStreamingEngine();

      presentationTimeInSeconds = 100;

      onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 100));

      // Here we go!
      onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));
      streamingEngine.start();

      runTest(slideSegmentAvailabilityWindow);
      expect(mediaSourceEngine.endOfStream).toHaveBeenCalled();

      // Verify buffers.
      expect(mediaSourceEngine.initSegments).toEqual({
        audio: [false, true],
        video: [false, true],
        text: [],
      });

      for (let i = 0; i <= 8; ++i) {
        expect(mediaSourceEngine.segments['audio'][i]).toBeFalsy();
        expect(mediaSourceEngine.segments['video'][i]).toBeFalsy();
        expect(mediaSourceEngine.segments['text'][i]).toBeFalsy();
      }

      for (let i = 9; i <= 13; ++i) {
        expect(mediaSourceEngine.segments['audio'][i]).toBeTruthy();
        expect(mediaSourceEngine.segments['video'][i]).toBeTruthy();
        expect(mediaSourceEngine.segments['text'][i]).toBeTruthy();
      }
    }

    it('is handled for large - values', testNegativeDrift.bind(null, -12));
  });

  describe('setTrickPlay', function() {
    it('uses trick mode track when requested', function() {
      setupVod(/* trickMode */ true);
      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);

      const config = shaka.util.PlayerConfiguration.createDefault().streaming;
      // Only buffer ahead 1 second to make it easier to set segment
      // expectations based on playheadTime.
      config.rebufferingGoal = 1;
      config.bufferingGoal = 1;
      createStreamingEngine(config);

      onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 0));

      // Here we go!
      onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));
      streamingEngine.start();

      runTest(function() {
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

  describe('embedded emsg boxes', function() {
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

    beforeEach(function() {
      setupVod();
      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      createStreamingEngine();

      onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 0));
      onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));
    });

    it('raises an event for registered embedded emsg boxes', function() {
      segmentData[ContentType.VIDEO].segments[0] = emsgSegment.buffer;
      videoStream1.emsgSchemeIdUris = [emsgObj.schemeIdUri];

      // Here we go!
      streamingEngine.start();
      runTest();

      expect(onEvent).toHaveBeenCalledTimes(1);

      let event = onEvent.calls.argsFor(0)[0];
      expect(event.detail).toEqual(emsgObj);
    });

    it('raises multiple events', function() {
      const dummyBox =
          shaka.util.Uint8ArrayUtils.fromHex('0000000c6672656501020304');
      segmentData[ContentType.VIDEO].segments[0] =
          shaka.util.Uint8ArrayUtils.concat(emsgSegment, dummyBox, emsgSegment)
              .buffer;
      videoStream1.emsgSchemeIdUris = [emsgObj.schemeIdUri];

      // Here we go!
      streamingEngine.start();
      runTest();

      expect(onEvent).toHaveBeenCalledTimes(2);
    });

    it('won\'t raise an event without stream field set', function() {
      segmentData[ContentType.VIDEO].segments[0] = emsgSegment.buffer;

      // Here we go!
      streamingEngine.start();
      runTest();

      expect(onEvent).not.toHaveBeenCalled();
    });

    it('won\'t raise an event when no emsg boxes present', function() {
      videoStream1.emsgSchemeIdUris = [emsgObj.schemeIdUri];

      // Here we go!
      streamingEngine.start();
      runTest();

      expect(onEvent).not.toHaveBeenCalled();
    });

    it('won\'t raise an event for an unregistered emsg box', function() {
      segmentData[ContentType.VIDEO].segments[0] = emsgSegment.buffer;

      // Here we go!
      streamingEngine.start();
      runTest();

      expect(onEvent).not.toHaveBeenCalled();
    });

    it('triggers manifest updates', function() {
      // This is an 'emsg' box that contains a scheme of
      // urn:mpeg:dash:event:2012 to indicate a manifest update.
      segmentData[ContentType.VIDEO].segments[0] =
          Uint8ArrayUtils
              .fromHex(
                  '0000003a656d73670000000075726e3a' +
                  '6d7065673a646173683a6576656e743a' +
                  '32303132000000000031000000080000' +
                  '00ff0000000c74657374')
              .buffer;
      videoStream1.emsgSchemeIdUris = ['urn:mpeg:dash:event:2012'];

      // Here we go!
      streamingEngine.start();
      runTest();

      expect(onEvent).not.toHaveBeenCalled();
      expect(onManifestUpdate).toHaveBeenCalled();
    });
  });

  describe('network downgrading', function() {
    /** @type {shaka.extern.Variant} */
    let newVariant;
    /** @type {!Array.<string>} */
    let requestUris;
    /** @type {shaka.util.PublicPromise} */
    let delayedRequest;
    /** @type {shaka.net.NetworkingEngine.PendingRequest} */
    let lastResponse;
    /** @type {boolean} */
    let shouldDelayRequests;

    beforeEach(function() {
      manifest = new shaka.test.ManifestGenerator()
        .setPresentationDuration(60)
        .addPeriod(0)
          .addVariant(0)
            .bandwidth(500)
            .addVideo(10).useSegmentTemplate('video-10-%d.mp4',
                                             /* segmentDuration= */ 10,
                                             /* segmentSize= */ 50)
          .addVariant(1)
            .bandwidth(100)
            .addVideo(11).useSegmentTemplate('video-11-%d.mp4',
                                             /* segmentDuration= */ 10,
                                             /* segmentSize= */ 10)
        .build();

      const initialVariant = manifest.periods[0].variants[0];
      newVariant = manifest.periods[0].variants[1];
      requestUris = [];
      delayedRequest = null;
      lastResponse = null;
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

          delayedRequest = new shaka.util.PublicPromise();
          let p = shouldDelayRequests ? delayedRequest : Promise.resolve();
          p = p.then(() => {
            // Only add if the segment was appended; if it was aborted this
            // won't be called.
            requestUris.push(request.uris[0]);
            return response;
          });
          const abort = () => {
            delayedRequest.reject(new shaka.util.Error(
                shaka.util.Error.Severity.CRITICAL,
                shaka.util.Error.Category.PLAYER,
                shaka.util.Error.Code.OPERATION_ABORTED));
            return Promise.resolve();
          };
          const ret =
              new shaka.net.NetworkingEngine.PendingRequest(p, abort, bytes);

          spyOn(ret, 'abort').and.callThrough();
          lastResponse = ret;
          return ret;
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

      onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 0));
      onChooseStreams.and.callFake(() => ({variant: initialVariant}));
    });

    it('aborts pending requests', () => {
      streamingEngine.start().catch(fail);
      Util.fakeEventLoop(1);

      // Finish the first request.
      delayedRequest.resolve();
      Util.fakeEventLoop(1);
      // We should have buffered the first segment and finished startup.
      expect(onCanSwitch).toHaveBeenCalled();
      expect(Util.invokeSpy(mediaSourceEngine.bufferEnd, 'video')).toBe(10);

      // This should abort the pending request for the second segment.
      const oldResponse = lastResponse;
      streamingEngine.switchVariant(
          newVariant, /* clear_buffer= */ false, /* safe_margin= */ 0);
      Util.fakeEventLoop(1);
      expect(oldResponse.abort).toHaveBeenCalled();

      // Finish the second request for the new stream.
      delayedRequest.resolve();
      Util.fakeEventLoop(1);
      expect(Util.invokeSpy(mediaSourceEngine.bufferEnd, 'video')).toBe(20);
      expect(requestUris).toEqual(['video-10-0.mp4', 'video-11-1.mp4']);
    });

    it('still aborts if previous segment size unknown', () => {
      // This should use the "bytes remaining" from the request instead of the
      // previous stream's size.
      const oldGet = manifest.periods[0].variants[0].video.getSegmentReference;
      manifest.periods[0].variants[0].video.getSegmentReference = (idx) => {
        const seg = oldGet(idx);
        if (seg) {
          // With endByte being null, we won't know the segment size.
          return new shaka.media.SegmentReference(
              seg.position, seg.startTime, seg.endTime, seg.getUris,
              /* startByte= */ 0, /* endByte= */ null);
        } else {
          return seg;
        }
      };

      prepareForAbort();
      streamingEngine.switchVariant(
          newVariant, /* clear_buffer= */ false, /* safe_margin= */ 0);

      bufferAndCheck(/* didAbort= */ true);
    });

    it('doesn\'t abort if close to finished', () => {
      prepareForAbort();
      setBytesRemaining(3);
      streamingEngine.switchVariant(
          newVariant, /* clear_buffer= */ false, /* safe_margin= */ 0);

      bufferAndCheck(/* didAbort= */ false);
    });

    it('doesn\'t abort if init segment is too large', () => {
      newVariant.video.initSegmentReference =
          new shaka.media.InitSegmentReference(() => ['init-11.mp4'], 0, 500);

      prepareForAbort();
      streamingEngine.switchVariant(
          newVariant, /* clear_buffer= */ false, /* safe_margin= */ 0);

      bufferAndCheck(/* didAbort= */ false, /* hasInit= */ true);
    });

    it('still aborts with small init segment', () => {
      newVariant.video.initSegmentReference =
          new shaka.media.InitSegmentReference(() => ['init-11.mp4'], 0, 5);

      prepareForAbort();
      streamingEngine.switchVariant(
          newVariant, /* clear_buffer= */ false, /* safe_margin= */ 0);

      bufferAndCheck(/* didAbort= */ true, /* hasInit= */ true);
    });

    it('aborts if we can finish the new one on time', () => {
      // Very large init segment
      newVariant.video.initSegmentReference =
          new shaka.media.InitSegmentReference(() => ['init-11.mp4'], 0, 5e6);

      prepareForAbort();

      setBytesRemaining(3);  // not much left
      getBandwidthEstimate.and.returnValue(1e9);  // insanely fast

      streamingEngine.switchVariant(
          newVariant, /* clear_buffer= */ false, /* safe_margin= */ 0);

      bufferAndCheck(/* didAbort= */ true, /* hasInit= */ true);
    });

    it('still aborts if new segment size unknown', () => {
      const videoStream = manifest.periods[0].variants[1].video;
      videoStream.bandwidth = 10;
      const oldGet = videoStream.getSegmentReference;
      videoStream.getSegmentReference = (idx) => {
        // eslint-disable-next-line no-restricted-syntax
        const seg = oldGet.call(videoStream, idx);
        if (seg) {
          // With endByte being null, we won't know the segment size.
          // Segment size has to be calculated with times and bandwidth.
          return new shaka.media.SegmentReference(
              seg.position, seg.startTime, seg.endTime, seg.getUris,
              /* startByte= */ 0, /* endByte= */ null);
        } else {
          return seg;
        }
      };

      prepareForAbort();

      streamingEngine.switchVariant(
          newVariant, /* clear_buffer= */ false, /* safe_margin= */ 0);

      bufferAndCheck(/* didAbort= */ true);
    });

    /**
     * Creates and starts the StreamingEngine instance.  After this returns,
     * it should be waiting for the second segment request to complete.
     */
    function prepareForAbort() {
      streamingEngine.start().catch(fail);
      Util.fakeEventLoop(1);

      // Finish the first segment request.
      delayedRequest.resolve();
      Util.fakeEventLoop(1);
      expect(Util.invokeSpy(mediaSourceEngine.bufferEnd, 'video')).toBe(10);

      expect(onCanSwitch).toHaveBeenCalled();
    }

    /**
     * Buffers to the buffering goal and checks the correct segment requests
     * were made.
     * @param {boolean} didAbort
     * @param {boolean=} hasInit
     */
    function bufferAndCheck(didAbort, hasInit) {
      shouldDelayRequests = false;
      delayedRequest.resolve();
      Util.fakeEventLoop(3);

      expect(Util.invokeSpy(mediaSourceEngine.bufferEnd, 'video')).toBe(30);
      const expected = ['video-10-0.mp4'];
      if (!didAbort) { expected.push('video-10-1.mp4'); }
      if (hasInit) { expected.push('init-11.mp4'); }
      if (didAbort) { expected.push('video-11-1.mp4'); }
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
      lastResponse.bytesRemaining_.setBytes(bytes);
    }
  });

  describe('embedded text tracks', () => {
    beforeEach(() => {
      // Set up a manifest with multiple Periods and text streams.
      manifest = new shaka.test.ManifestGenerator()
          .addPeriod(0)
            .addVariant(0)
              .addVideo(110).useSegmentTemplate('video-110-%d.mp4', 10)
            .addTextStream(120)
              .useSegmentTemplate('video-120-%d.mp4', 10)
            .addTextStream(121)
              .mime(shaka.util.MimeUtils.CLOSED_CAPTION_MIMETYPE)
          .addPeriod(10)
            .addVariant(1)
              .addVideo(210).useSegmentTemplate('video-210-%d.mp4', 10)
            .addTextStream(220)
              .useSegmentTemplate('text-220-%d.mp4', 10)
            .addTextStream(221)
              .mime(shaka.util.MimeUtils.CLOSED_CAPTION_MIMETYPE)
          .build();

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
      it('initializes new embedded captions', () => {
        onChooseStreams.and.callFake((period) => {
          if (period == manifest.periods[0]) {
            return {variant: period.variants[0]};
          } else {
            return {variant: period.variants[0], text: period.textStreams[1]};
          }
        });
        runEmbeddedCaptionTest();
      });

      it('initializes embedded captions from external text', () => {
        onChooseStreams.and.callFake((period) => {
          if (period == manifest.periods[0]) {
            return {variant: period.variants[0], text: period.textStreams[0]};
          } else {
            return {variant: period.variants[0], text: period.textStreams[1]};
          }
        });
        runEmbeddedCaptionTest();
      });

      it('switches to external text after embedded captions', () => {
        onChooseStreams.and.callFake((period) => {
          if (period == manifest.periods[0]) {
            return {variant: period.variants[0], text: period.textStreams[1]};
          } else {
            return {variant: period.variants[0], text: period.textStreams[0]};
          }
        });
        runEmbeddedCaptionTest();
      });

      it('doesn\'t re-initialize', () => {
        onChooseStreams.and.callFake((period) => {
          return {variant: period.variants[0], text: period.textStreams[1]};
        });
        runEmbeddedCaptionTest();
      });

      function runEmbeddedCaptionTest() {
        streamingEngine.start().catch(fail);
        Util.fakeEventLoop(10);

        // We have buffered through the Period transition.
        expect(onChooseStreams).toHaveBeenCalledTimes(2);
        expect(Util.invokeSpy(mediaSourceEngine.bufferEnd, 'video'))
            .toBeGreaterThan(12);

        expect(mediaSourceEngine.setSelectedClosedCaptionId)
            .toHaveBeenCalledTimes(1);
      }
    });
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

  describe('destroy', () => {
    it('aborts pending network operations', () => {
      setupVod();
      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);

      // Track the incoming request and whether it was aborted.
      let isRequested = false;
      let isAborted = false;

      netEngine.request.and.callFake((requestType, request) => {
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
      onStartupComplete.and.callFake(() => setupFakeGetTime(0));
      onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));
      streamingEngine.start();
      playing = true;

      // Simulate time passing.
      Util.fakeEventLoop(1);

      // By now the request should have fired.
      expect(isRequested).toBe(true);

      // Destroy StreamingEngine.
      streamingEngine.destroy();
      PromiseMock.flush();

      // The request should have been aborted.
      expect(isAborted).toBe(true);
    });
  });

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
    let originalNetEngineRequest = netEngine.request.bind(netEngine);

    netEngine.attempts = 0;
    netEngine.request = jasmine.createSpy('request').and.callFake(
        function(requestType, request) {
          if (request.uris[0] == targetUri) {
            if (++netEngine.attempts == 1) {
              let data = [targetUri];

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
});
