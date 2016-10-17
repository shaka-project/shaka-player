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
  var Util;

  var segmentData;

  // Dummy byte ranges and sizes for initialization and media segments.
  var initSegmentRanges = {'audio': [100, 1000], 'video': [200, 2000]};
  var segmentSizes = {'audio': 1000, 'video': 10000, 'text': 500};

  var playhead;
  var playheadTime;
  var playing;

  var mediaSourceEngine;
  var netEngine;
  var timeline;

  var audioStream1;
  var videoStream1;
  var textStream1;
  var alternateVideoStream1;

  var audioStream2;
  var videoStream2;
  var textStream2;

  var manifest;

  var onChooseStreams;
  var onCanSwitch;
  var onError;
  var onInitialStreamsSetup;
  var onStartupComplete;
  var streamingEngine;

  /**
   * Runs the fake event loop.
   * @param {function()=} opt_callback An optional callback that is executed
   *   each time the clock ticks.
   */
  function runTest(opt_callback) {
    function onTick(currentTime) {
      if (opt_callback) opt_callback();
      if (playing) {
        playheadTime++;
      }
    }
    // No test should require more than 60 seconds of simulated time.
    Util.fakeEventLoop(60, onTick);
  }

  beforeAll(function() {
    Util = shaka.test.Util;
    jasmine.clock().install();
    // This polyfill is required for fakeEventLoop.
    shaka.polyfill.Promise.install(/* force */ true);
  });

  function setupVod() {
    // For VOD, we fake a presentation that has 2 Periods of equal duration
    // (20 seconds), where each Period has 1 StreamSet. The first Period
    // has 1 audio Stream, 2 video Streams, and 1 text Stream; and the second
    // Period has 1 Stream of each type.
    //
    // There are 4 initialization segments: 1 audio and 1 video for the
    // first Period, and 1 audio and 1 video for the second Period.
    //
    // There are 12 media segments: 2 audio, 2 video, and 2 text for the
    // first Period, and 2 audio, 2 video, and 2 text for the second Period.
    // All media segments are (by default) 10 seconds long.

    // Create SegmentData map for FakeMediaSourceEngine.
    var initSegmentSizeAudio =
        initSegmentRanges.audio[1] - initSegmentRanges.audio[0] + 1;
    var initSegmentSizeVideo =
        initSegmentRanges.video[1] - initSegmentRanges.video[0] + 1;

    function makeBuffer(size) { return new ArrayBuffer(size); }
    segmentData = {
      audio: {
        initSegments:
            [makeBuffer(initSegmentSizeAudio),
             makeBuffer(initSegmentSizeAudio)],
        segments:
            [makeBuffer(segmentSizes.audio), makeBuffer(segmentSizes.audio),
             makeBuffer(segmentSizes.audio), makeBuffer(segmentSizes.audio)],
        segmentStartTimes: [0, 10, 0, 10],
        segmentPeriodTimes: [0, 0, 20, 20],
        segmentDuration: 10
      },
      video: {
        initSegments:
            [makeBuffer(initSegmentSizeVideo),
             makeBuffer(initSegmentSizeVideo)],
        segments:
            [makeBuffer(segmentSizes.video), makeBuffer(segmentSizes.video),
             makeBuffer(segmentSizes.video), makeBuffer(segmentSizes.video)],
        segmentStartTimes: [0, 10, 0, 10],
        segmentPeriodTimes: [0, 0, 20, 20],
        segmentDuration: 10
      },
      text: {
        initSegments: [],
        segments:
            [makeBuffer(segmentSizes.text), makeBuffer(segmentSizes.text),
             makeBuffer(segmentSizes.text), makeBuffer(segmentSizes.text)],
        segmentStartTimes: [0, 10, 0, 10],
        segmentPeriodTimes: [0, 0, 20, 20],
        segmentDuration: 10
      }
    };

    playhead = createMockPlayhead();
    playheadTime = 0;
    playing = false;

    setupNetworkingEngine(
        2 /* segmentsInFirstPeriod */,
        2 /* segmentsInSecondPeriod */);

    timeline = shaka.test.StreamingEngineUtil.createFakePresentationTimeline(
        0 /* segmentAvailabilityStart */,
        40 /* segmentAvailabilityEnd */,
        40 /* presentationDuration */);

    setupManifest(
        0 /* firstPeriodStartTime */,
        20 /* secondPeriodStartTime */,
        40 /* presentationDuration */);
  }

  function setupLive() {
    // For live, we fake a presentation that has 2 Periods of different
    // durations (120 seconds and 20 seconds respectively), where each Period
    // has 1 StreamSet. The first Period has 1 audio Stream, 2 video Streams,
    // and 1 text Stream; and the second Period has 1 Stream of each type.
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
    var initSegmentSizeAudio =
        initSegmentRanges.audio[1] - initSegmentRanges.audio[0] + 1;
    var initSegmentSizeVideo =
        initSegmentRanges.video[1] - initSegmentRanges.video[0] + 1;

    function makeBuffer(size) { return new ArrayBuffer(size); }
    segmentData = {
      audio: {
        initSegments:
            [makeBuffer(initSegmentSizeAudio),
             makeBuffer(initSegmentSizeAudio)],
        segments: [],
        segmentStartTimes: [],
        segmentPeriodTimes: [],
        segmentDuration: 10
      },
      video: {
        initSegments:
            [makeBuffer(initSegmentSizeVideo),
             makeBuffer(initSegmentSizeVideo)],
        segments: [],
        segmentStartTimes: [],
        segmentPeriodTimes: [],
        segmentDuration: 10
      },
      text: {
        initSegments: [],
        segments: [],
        segmentStartTimes: [],
        segmentPeriodTimes: [],
        segmentDuration: 10
      }
    };

    var segmentsInFirstPeriod = 12;
    for (var i = 0; i < segmentsInFirstPeriod; ++i) {
      segmentData.audio.segments.push(makeBuffer(segmentSizes.audio));
      segmentData.video.segments.push(makeBuffer(segmentSizes.video));
      segmentData.text.segments.push(makeBuffer(segmentSizes.text));

      segmentData.audio.segmentStartTimes.push(i * 10);
      segmentData.video.segmentStartTimes.push(i * 10);
      segmentData.text.segmentStartTimes.push(i * 10);

      segmentData.audio.segmentPeriodTimes.push(0);
      segmentData.video.segmentPeriodTimes.push(0);
      segmentData.text.segmentPeriodTimes.push(0);
    }

    var segmentsInSecondPeriod = 2;
    for (var i = 0; i < segmentsInSecondPeriod; ++i) {
      segmentData.audio.segments.push(makeBuffer(segmentSizes.audio));
      segmentData.video.segments.push(makeBuffer(segmentSizes.video));
      segmentData.text.segments.push(makeBuffer(segmentSizes.text));

      segmentData.audio.segmentStartTimes.push(i * 10);
      segmentData.video.segmentStartTimes.push(i * 10);
      segmentData.text.segmentStartTimes.push(i * 10);

      segmentData.audio.segmentPeriodTimes.push(segmentsInFirstPeriod * 10);
      segmentData.video.segmentPeriodTimes.push(segmentsInFirstPeriod * 10);
      segmentData.text.segmentPeriodTimes.push(segmentsInFirstPeriod * 10);
    }

    playhead = createMockPlayhead();
    playheadTime = 110;
    playing = false;

    setupNetworkingEngine(
        12 /* segmentsInFirstPeriod */,
        2 /* segmentsInSecondPeriod */);

    timeline = shaka.test.StreamingEngineUtil.createFakePresentationTimeline(
        100 /* segmentAvailabilityStart */,
        120 /* segmentAvailabilityEnd */,
        140 /* presentationDuration */);

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
          var i = (segmentsInFirstPeriod * (periodNumber - 1)) + (position - 1);
          return segmentData[type].segments[i];
        });
  }

  function setupManifest(
      firstPeriodStartTime, secondPeriodStartTime, presentationDuration) {
    manifest = shaka.test.StreamingEngineUtil.createManifest(
        [firstPeriodStartTime, secondPeriodStartTime], presentationDuration,
        { audio: segmentData.audio.segmentDuration,
          video: segmentData.video.segmentDuration,
          text: segmentData.text.segmentDuration});

    manifest.presentationTimeline = timeline;
    manifest.minBufferTime = 2;

    // Create InitSegmentReferences.
    manifest.periods[0].streamSetsByType.audio.streams[0].initSegmentReference =
        new shaka.media.InitSegmentReference(
            function() { return ['1_audio_init']; },
            initSegmentRanges.audio[0],
            initSegmentRanges.audio[1]);
    manifest.periods[0].streamSetsByType.video.streams[0].initSegmentReference =
        new shaka.media.InitSegmentReference(
            function() { return ['1_video_init']; },
            initSegmentRanges.video[0],
            initSegmentRanges.video[1]);
    manifest.periods[1].streamSetsByType.audio.streams[0].initSegmentReference =
        new shaka.media.InitSegmentReference(
            function() { return ['2_audio_init']; },
            initSegmentRanges.audio[0],
            initSegmentRanges.audio[1]);
    manifest.periods[1].streamSetsByType.video.streams[0].initSegmentReference =
        new shaka.media.InitSegmentReference(
            function() { return ['2_video_init']; },
            initSegmentRanges.video[0],
            initSegmentRanges.video[1]);

    audioStream1 = manifest.periods[0].streamSets[0].streams[0];
    videoStream1 = manifest.periods[0].streamSets[1].streams[0];
    textStream1 = manifest.periods[0].streamSets[2].streams[0];

    // This Stream is only used to verify that StreamingEngine can setup
    // Streams correctly. It does not have init or media segments.
    alternateVideoStream1 =
        shaka.test.StreamingEngineUtil.createMockVideoStream(6);
    alternateVideoStream1.createSegmentIndex.and.returnValue(Promise.resolve());
    alternateVideoStream1.findSegmentPosition.and.returnValue(null);
    alternateVideoStream1.getSegmentReference.and.returnValue(null);
    manifest.periods[0].streamSets[1].streams.push(alternateVideoStream1);

    audioStream2 = manifest.periods[1].streamSets[0].streams[0];
    videoStream2 = manifest.periods[1].streamSets[1].streams[0];
    textStream2 = manifest.periods[1].streamSets[2].streams[0];
  }

  /**
   * Creates the StreamingEngine.
   **
   * @param {shakaExtern.StreamingConfiguration=} opt_config Optional
   *   configuration object which overrides the default one.
   */
  function createStreamingEngine(opt_config) {
    onChooseStreams = jasmine.createSpy('onChooseStreams');
    onCanSwitch = jasmine.createSpy('onCanSwitch');
    onInitialStreamsSetup = jasmine.createSpy('onInitialStreamsSetup');
    onStartupComplete = jasmine.createSpy('onStartupComplete');
    onError = jasmine.createSpy('onError');
    onError.and.callFake(fail);

    var config;
    if (opt_config) {
      config = opt_config;
    } else {
      config = {
        rebufferingGoal: 2,
        bufferingGoal: 5,
        retryParameters: shaka.net.NetworkingEngine.defaultRetryParameters(),
        bufferBehind: Infinity,
        ignoreTextStreamFailures: false,
        useRelativeCueTimestamps: false
      };
    }

    streamingEngine = new shaka.media.StreamingEngine(
        playhead,
        mediaSourceEngine,
        /** @type {!shaka.net.NetworkingEngine} */(netEngine),
        /** @type {shakaExtern.Manifest} */(manifest),
        onChooseStreams, onCanSwitch, onError,
        onInitialStreamsSetup, onStartupComplete);
    streamingEngine.configure(config);
  }

  afterEach(function(done) {
    streamingEngine.destroy().catch(fail).then(done);
    shaka.polyfill.Promise.flush();
  });

  afterAll(function() {
    shaka.polyfill.Promise.uninstall();
    jasmine.clock().uninstall();
  });

  // This test initializes the StreamingEngine (SE) and allows it to play
  // through both Periods.
  //
  // After calling init() the following should occur:
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

    playhead.getTime.and.returnValue(0);

    onStartupComplete.and.callFake(function() {
      // Verify buffers.
      expect(mediaSourceEngine.initSegments).toEqual({
        audio: [true, false],
        video: [true, false],
        text: []
      });
      expect(mediaSourceEngine.segments).toEqual({
        audio: [true, false, false, false],
        video: [true, false, false, false],
        text: [true, false, false, false]
      });

      setupFakeGetTime(0);
    });

    onChooseStreams.and.callFake(function(period) {
      expect(period).toBe(manifest.periods[0]);

      onCanSwitch.and.callFake(function() {
        expect(alternateVideoStream1.createSegmentIndex).toHaveBeenCalled();
        onCanSwitch.and.throwError(new Error());
      });

      // For second Period.
      onChooseStreams.and.callFake(function(period) {
        expect(period).toBe(manifest.periods[1]);

        // Verify buffers.
        expect(mediaSourceEngine.initSegments).toEqual({
          audio: [true, false],
          video: [true, false],
          text: []
        });
        expect(mediaSourceEngine.segments).toEqual({
          audio: [true, true, false, false],
          video: [true, true, false, false],
          text: [true, true, false, false]
        });

        verifyNetworkingEngineRequestCalls(1);

        onCanSwitch.and.callFake(function() {
          expect(audioStream2.createSegmentIndex).toHaveBeenCalled();
          expect(videoStream2.createSegmentIndex).toHaveBeenCalled();
          expect(textStream2.createSegmentIndex).toHaveBeenCalled();
          onCanSwitch.and.throwError(new Error());
        });

        // Switch to the second Period.
        return defaultOnChooseStreams(period);
      });

      // Init the first Period.
      return defaultOnChooseStreams(period);
    });

    onInitialStreamsSetup.and.callFake(function() {
      expect(mediaSourceEngine.init).toHaveBeenCalledWith(
          {
            'audio': 'audio/mp4; codecs="mp4a.40.2"',
            'video': 'video/mp4; codecs="avc1.42c01e"',
            'text': 'text/vtt'
          }, false);
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
    streamingEngine.init();

    runTest();
    expect(mediaSourceEngine.endOfStream).toHaveBeenCalled();

    // Verify buffers.
    expect(mediaSourceEngine.initSegments).toEqual({
      audio: [false, true],
      video: [false, true],
      text: []
    });
    expect(mediaSourceEngine.segments).toEqual({
      audio: [true, true, true, true],
      video: [true, true, true, true],
      text: [true, true, true, true]
    });

    verifyNetworkingEngineRequestCalls(2);
  });

  it('initializes and plays live', function() {
    setupLive();
    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    createStreamingEngine();

    playhead.getTime.and.returnValue(100);

    onStartupComplete.and.callFake(function() {
      setupFakeGetTime(100);
    });

    onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));

    // Here we go!
    streamingEngine.init();

    runTest(slideSegmentAvailabilityWindow);
    expect(mediaSourceEngine.endOfStream).toHaveBeenCalled();

    // Verify buffers.
    expect(mediaSourceEngine.initSegments).toEqual({
      audio: [false, true],
      video: [false, true],
      text: []
    });

    // Since we started playback from segment 11, segments 10 through 14
    // should be buffered.
    for (var i = 0; i <= 8; ++i) {
      expect(mediaSourceEngine.segments.audio[i]).toBeFalsy();
      expect(mediaSourceEngine.segments.video[i]).toBeFalsy();
      expect(mediaSourceEngine.segments.text[i]).toBeFalsy();
    }

    for (var i = 9; i <= 13; ++i) {
      expect(mediaSourceEngine.segments.audio[i]).toBeTruthy();
      expect(mediaSourceEngine.segments.video[i]).toBeTruthy();
      expect(mediaSourceEngine.segments.text[i]).toBeTruthy();
    }
  });

  // Start the playhead in the first Period but pass init() Streams from the
  // second Period.
  it('plays from 1st Period when passed Streams from 2nd', function() {
    setupVod();
    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    createStreamingEngine();

    playhead.getTime.and.returnValue(0);
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

      return {
        'audio': audioStream2, 'video': videoStream2, 'text': textStream2
      };
    });

    streamingEngine.init();

    runTest();
    // Verify buffers.
    expect(mediaSourceEngine.initSegments).toEqual({
      audio: [false, true],
      video: [false, true],
      text: []
    });
    expect(mediaSourceEngine.segments).toEqual({
      audio: [true, true, true, true],
      video: [true, true, true, true],
      text: [true, true, true, true]
    });
  });

  // Start the playhead in the second Period but pass init() Streams from the
  // first Period.
  it('plays from 2nd Period when passed Streams from 1st', function() {
    setupVod();
    mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
    createStreamingEngine();

    playhead.getTime.and.returnValue(20);
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

      return {
        'audio': audioStream1, 'video': videoStream1, 'text': textStream1
      };
    });

    streamingEngine.init();

    runTest();
    // Verify buffers.
    expect(mediaSourceEngine.initSegments).toEqual({
      audio: [false, true],
      video: [false, true],
      text: []
    });
    expect(mediaSourceEngine.segments).toEqual({
      audio: [false, false, true, true],
      video: [false, false, true, true],
      text: [false, false, true, true]
    });
  });

  it('plays when a small gap is present at the beginning', function() {
    var drift = 0.050;  // 50 ms

    setupVod();
    mediaSourceEngine =
        new shaka.test.FakeMediaSourceEngine(segmentData, drift);
    createStreamingEngine();

    playhead.getTime.and.returnValue(0);

    // Here we go!
    onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));
    streamingEngine.init();

    runTest();
    expect(onStartupComplete).toHaveBeenCalled();
  });

  describe('handles seeks (VOD)', function() {
    beforeEach(function() {
      setupVod();
      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      createStreamingEngine();

      onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 0));
    });

    it('into buffered regions', function() {
      playhead.getTime.and.returnValue(0);

      onChooseStreams.and.callFake(function(period) {
        expect(period).toBe(manifest.periods[0]);

        onChooseStreams.and.callFake(function(period) {
          expect(period).toBe(manifest.periods[1]);

          // Seek backwards to a buffered region in the first Period. Note that
          // since the buffering goal is 5 seconds and each segment is 10
          // seconds long, the first segment of the second Period should be
          // required when the playhead is at the 16 second mark.
          expect(playhead.getTime()).toBe(16);
          playheadTime -= 5;
          streamingEngine.seeked();

          onChooseStreams.and.callFake(function(period) {
            expect(period).toBe(manifest.periods[1]);
            expect(playhead.getTime()).toBe(16);

            // Verify buffers.
            expect(mediaSourceEngine.initSegments).toEqual({
              audio: [true, false],
              video: [true, false],
              text: []
            });
            expect(mediaSourceEngine.segments).toEqual({
              audio: [true, true, false, false],
              video: [true, true, false, false],
              text: [true, true, false, false]
            });

            onChooseStreams.and.throwError(new Error());

            // Switch to the second Period.
            return defaultOnChooseStreams(period);
          });

          // Although we're seeking backwards we still have to return some
          // Streams from the second Period here.
          return defaultOnChooseStreams(period);
        });

        // Init the first Period.
        return defaultOnChooseStreams(period);
      });

      // Here we go!
      streamingEngine.init();

      runTest();
      // Verify buffers.
      expect(mediaSourceEngine.initSegments).toEqual({
        audio: [false, true],
        video: [false, true],
        text: []
      });
      expect(mediaSourceEngine.segments).toEqual({
        audio: [true, true, true, true],
        video: [true, true, true, true],
        text: [true, true, true, true]
      });
    });

    it('into buffered regions across Periods', function() {
      playhead.getTime.and.returnValue(0);

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
          // 10 seconds long, endOfStream() should be called at the 36 second
          // mark.
          expect(playhead.getTime()).toBe(36);
          playheadTime -= 20;
          streamingEngine.seeked();
        });

        // Init the first Period.
        return defaultOnChooseStreams(period);
      });

      // Here we go!
      streamingEngine.init();

      runTest();
      // Verify buffers.
      expect(mediaSourceEngine.initSegments).toEqual({
        audio: [false, true],
        video: [false, true],
        text: []
      });
      expect(mediaSourceEngine.segments).toEqual({
        audio: [true, true, true, true],
        video: [true, true, true, true],
        text: [true, true, true, true]
      });
    });

    it('into unbuffered regions', function() {
      playhead.getTime.and.returnValue(0);

      onChooseStreams.and.callFake(function(period) {
        expect(period).toBe(manifest.periods[0]);

        onChooseStreams.and.throwError(new Error());

        // Init the first Period.
        return defaultOnChooseStreams(period);
      });

      onStartupComplete.and.callFake(function() {
        setupFakeGetTime(0);

        // Seek forward to an unbuffered region in the first Period.
        expect(playhead.getTime()).toBe(0);
        playheadTime += 15;
        streamingEngine.seeked();

        onChooseStreams.and.callFake(function(period) {
          expect(period).toBe(manifest.periods[1]);

          // Verify that all buffers have been cleared.
          expect(mediaSourceEngine.clear).toHaveBeenCalledWith('audio');
          expect(mediaSourceEngine.clear).toHaveBeenCalledWith('video');
          expect(mediaSourceEngine.clear).toHaveBeenCalledWith('text');

          // Verify buffers.
          expect(mediaSourceEngine.initSegments).toEqual({
            audio: [true, false],
            video: [true, false],
            text: []
          });
          expect(mediaSourceEngine.segments).toEqual({
            audio: [true, true, false, false],
            video: [true, true, false, false],
            text: [true, true, false, false]
          });

          onChooseStreams.and.throwError(new Error());

          // Switch to the second Period.
          return defaultOnChooseStreams(period);
        });
      });

      // Here we go!
      streamingEngine.init();

      runTest();
      // Verify buffers.
      expect(mediaSourceEngine.initSegments).toEqual({
        audio: [false, true],
        video: [false, true],
        text: []
      });
      expect(mediaSourceEngine.segments).toEqual({
        audio: [true, true, true, true],
        video: [true, true, true, true],
        text: [true, true, true, true]
      });
    });

    it('into unbuffered regions across Periods', function() {
      // Start from the second Period.
      playhead.getTime.and.returnValue(20);

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
          text: []
        });
        expect(mediaSourceEngine.segments).toEqual({
          audio: [false, false, true, true],
          video: [false, false, true, true],
          text: [false, false, true, true]
        });

        // Seek backwards to an unbuffered region in the first Period. Note
        // that since the buffering goal is 5 seconds and each segment is 10
        // seconds long, endOfStream() should be called at the 36 second mark.
        expect(playhead.getTime()).toBe(36);
        playheadTime -= 20;
        streamingEngine.seeked();

        onChooseStreams.and.callFake(function(period) {
          expect(period).toBe(manifest.periods[0]);

          // Verify that all buffers have been cleared.
          expect(mediaSourceEngine.clear).toHaveBeenCalledWith('audio');
          expect(mediaSourceEngine.clear).toHaveBeenCalledWith('video');
          expect(mediaSourceEngine.clear).toHaveBeenCalledWith('text');

          onChooseStreams.and.callFake(function(period) {
            expect(period).toBe(manifest.periods[1]);

            // Verify buffers.
            expect(mediaSourceEngine.initSegments).toEqual({
              audio: [true, false],
              video: [true, false],
              text: []
            });
            expect(mediaSourceEngine.segments).toEqual({
              audio: [true, true, false, false],
              video: [true, true, false, false],
              text: [true, true, false, false]
            });

            onChooseStreams.and.throwError(new Error());

            // Switch to the second Period.
            return defaultOnChooseStreams(period);
          });

          mediaSourceEngine.endOfStream.and.stub();

          // Switch to the first Period.
          return defaultOnChooseStreams(period);
        });
      });

      // Here we go!
      streamingEngine.init();

      runTest();
      // Verify buffers.
      expect(mediaSourceEngine.initSegments).toEqual({
        audio: [false, true],
        video: [false, true],
        text: []
      });
      expect(mediaSourceEngine.segments).toEqual({
        audio: [true, true, true, true],
        video: [true, true, true, true],
        text: [true, true, true, true]
      });
    });

    it('into unbuffered regions when nothing is buffered', function() {
      playhead.getTime.and.returnValue(0);

      onChooseStreams.and.callFake(function(period) {
        expect(period).toBe(manifest.periods[0]);

        onChooseStreams.and.throwError(new Error());

        // Init the first Period.
        return defaultOnChooseStreams(period);
      });

      onInitialStreamsSetup.and.callFake(function() {
        // Seek forward to an unbuffered region in the first Period.
        expect(playhead.getTime()).toBe(0);
        playhead.getTime.and.returnValue(15);
        streamingEngine.seeked();

        onChooseStreams.and.callFake(function(period) {
          expect(period).toBe(manifest.periods[1]);

          expect(mediaSourceEngine.clear).not.toHaveBeenCalled();

          // Verify buffers.
          expect(mediaSourceEngine.initSegments).toEqual({
            audio: [true, false],
            video: [true, false],
            text: []
          });
          expect(mediaSourceEngine.segments).toEqual({
            audio: [true, true, false, false],
            video: [true, true, false, false],
            text: [true, true, false, false]
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
      streamingEngine.init();

      runTest();
      // Verify buffers.
      expect(mediaSourceEngine.initSegments).toEqual({
        audio: [false, true],
        video: [false, true],
        text: []
      });
      expect(mediaSourceEngine.segments).toEqual({
        audio: [true, true, true, true],
        video: [true, true, true, true],
        text: [true, true, true, true]
      });
    });

    // If we seek back into an unbuffered region but do not called seeked(),
    // StreamingEngine should wait for seeked() to be called.
    it('back into unbuffered regions without seeked() ', function() {
      // Start from the second segment in the second Period.
      playhead.getTime.and.returnValue(30);

      onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 20));

      onChooseStreams.and.callFake(function(period) {
        expect(period).toBe(manifest.periods[1]);

        // Init the second Period.
        return defaultOnChooseStreams(period);
      });

      mediaSourceEngine.endOfStream.and.callFake(function() {
        // Seek backwards to an unbuffered region in the second Period. Do not
        // call seeked().
        expect(playhead.getTime()).toBe(36);
        playheadTime -= 10;
      });

      // Here we go!
      streamingEngine.init();

      runTest();
      // Verify buffers. Segment 3 should not be buffered since we never
      // called seeked().
      expect(mediaSourceEngine.initSegments).toEqual({
        audio: [false, true],
        video: [false, true],
        text: []
      });
      expect(mediaSourceEngine.segments).toEqual({
        audio: [false, false, true, true],
        video: [false, false, true, true],
        text: [false, false, true, true]
      });
    });

    // If we seek forward into an unbuffered region but do not called seeked(),
    // StreamingEngine should continue buffering. This test also exercises the
    // case where the playhead moves past the end of the buffer, which may
    // occur on some browsers depending on the playback rate.
    it('forward into unbuffered regions without seeked()', function() {
      playhead.getTime.and.returnValue(0);

      onChooseStreams.and.callFake(function(period) {
        expect(period).toBe(manifest.periods[0]);

        // Init the first Period.
        return defaultOnChooseStreams(period);
      });

      onStartupComplete.and.callFake(function() {
        setupFakeGetTime(0);

        // Seek forward to an unbuffered region in the first Period. Do not
        // call seeked().
        playheadTime += 15;

        onChooseStreams.and.callFake(function(period) {
          expect(period).toBe(manifest.periods[1]);

          // Switch to the second Period.
          return defaultOnChooseStreams(period);
        });
      });

      // Here we go!
      streamingEngine.init();

      runTest();
      // Verify buffers.
      expect(mediaSourceEngine.initSegments).toEqual({
        audio: [false, true],
        video: [false, true],
        text: []
      });
      expect(mediaSourceEngine.segments).toEqual({
        audio: [true, true, true, true],
        video: [true, true, true, true],
        text: [true, true, true, true]
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

      playhead.getTime.and.returnValue(90);

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
        expect(playhead.getTime()).toBe(90);
        expect(timeline.getSegmentAvailabilityStart()).toBe(90);
        expect(timeline.getSegmentAvailabilityEnd()).toBe(110);
        playheadTime += 35;
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
        var originalAppendBuffer =
            shaka.test.FakeMediaSourceEngine.prototype.appendBuffer;
        mediaSourceEngine.appendBuffer.and.callFake(
            function(type, data, startTime, endTime) {
              expect(playhead.getTime()).toBe(125);
              expect(timeline.getSegmentAvailabilityStart()).toBe(100);
              expect(timeline.getSegmentAvailabilityEnd()).toBe(120);
              playing = true;
              var p = originalAppendBuffer.call(
                  mediaSourceEngine, type, data, startTime, endTime);
              mediaSourceEngine.appendBuffer.and.callFake(originalAppendBuffer);
              return p;
            });
      });

      // Here we go!
      streamingEngine.init();

      runTest(slideSegmentAvailabilityWindow);
      // Verify buffers.
      expect(mediaSourceEngine.initSegments).toEqual({
        audio: [false, true],
        video: [false, true],
        text: []
      });

      // Since we performed an unbuffered seek into the second Period, the
      // first 12 segments should not be buffered.
      for (var i = 0; i <= 11; ++i) {
        expect(mediaSourceEngine.segments.audio[i]).toBeFalsy();
        expect(mediaSourceEngine.segments.video[i]).toBeFalsy();
        expect(mediaSourceEngine.segments.text[i]).toBeFalsy();
      }

      for (var i = 12; i <= 13; ++i) {
        expect(mediaSourceEngine.segments.audio[i]).toBeTruthy();
        expect(mediaSourceEngine.segments.video[i]).toBeTruthy();
        expect(mediaSourceEngine.segments.text[i]).toBeTruthy();
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
      playhead.getTime.and.returnValue(0);

      videoStream1.createSegmentIndex.and.returnValue(
          Promise.reject('FAKE_ERROR'));

      var onInitError = jasmine.createSpy('onInitError');
      onInitError.and.callFake(function(error) {
        expect(onInitialStreamsSetup).not.toHaveBeenCalled();
        expect(onStartupComplete).not.toHaveBeenCalled();
        expect(error).toBe('FAKE_ERROR');
      });

      // Here we go!
      onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));
      streamingEngine.init().then(fail).catch(onInitError);

      runTest();
      expect(onInitError).toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    });

    it('from post startup Stream setup', function() {
      playhead.getTime.and.returnValue(0);

      alternateVideoStream1.createSegmentIndex.and.returnValue(
          Promise.reject('FAKE_ERROR'));

      onError.and.callFake(function(error) {
        expect(onInitialStreamsSetup).toHaveBeenCalled();
        expect(onStartupComplete).toHaveBeenCalled();
        expect(error).toBe('FAKE_ERROR');
      });

      // Here we go!
      onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));
      streamingEngine.init().catch(fail);
      runTest();
      expect(onError).toHaveBeenCalled();
    });

    it('from failed init segment append during startup', function() {
      playhead.getTime.and.returnValue(0);

      onError.and.callFake(function(error) {
        expect(onInitialStreamsSetup).toHaveBeenCalled();
        expect(onStartupComplete).not.toHaveBeenCalled();
        expect(error).toBe('FAKE_ERROR');
      });

      onChooseStreams.and.callFake(function(period) {
        expect(period).toBe(manifest.periods[0]);

        var streamsByType = defaultOnChooseStreams(period);

        var originalAppendBuffer =
            shaka.test.FakeMediaSourceEngine.prototype.appendBuffer;
        mediaSourceEngine.appendBuffer.and.callFake(
            function(type, data, startTime, endTime) {
              // Reject the first video init segment.
              if (data == segmentData.video.initSegments[0]) {
                return Promise.reject('FAKE_ERROR');
              } else {
                return originalAppendBuffer.call(
                    mediaSourceEngine, type, data, startTime, endTime);
              }
            });

        return streamsByType;
      });

      // Here we go!
      streamingEngine.init().catch(fail);
      runTest();
      expect(onError).toHaveBeenCalled();
    });

    it('from failed media segment append during startup', function() {
      playhead.getTime.and.returnValue(0);

      onError.and.callFake(function(error) {
        expect(onInitialStreamsSetup).toHaveBeenCalled();
        expect(onStartupComplete).not.toHaveBeenCalled();
        expect(error).toBe('FAKE_ERROR');
      });

      onChooseStreams.and.callFake(function(period) {
        expect(period).toBe(manifest.periods[0]);

        var streamsByType = defaultOnChooseStreams(period);

        var originalAppendBuffer =
            shaka.test.FakeMediaSourceEngine.prototype.appendBuffer;
        mediaSourceEngine.appendBuffer.and.callFake(
            function(type, data, startTime, endTime) {
              // Reject the first audio segment.
              if (data == segmentData.audio.segments[0]) {
                return Promise.reject('FAKE_ERROR');
              } else {
                return originalAppendBuffer.call(
                    mediaSourceEngine, type, data, startTime, endTime);
              }
            });

        return streamsByType;
      });

      // Here we go!
      streamingEngine.init().catch(fail);
      runTest();
      expect(onError).toHaveBeenCalled();
    });
  });

  describe('handles network errors', function() {
    function testRecoverableError(targetUri, code) {
      setupVod();

      // Wrap the NetworkingEngine to perform errors.
      var originalNetEngine = netEngine;
      netEngine = {
        request: jasmine.createSpy('request')
      };
      var attempts = 0;
      netEngine.request.and.callFake(function(requestType, request) {
        if (request.uris[0] == targetUri) {
          ++attempts;
          if (attempts == 1) {
            var data = [targetUri];

            if (code == shaka.util.Error.Code.BAD_HTTP_STATUS) {
              data.push(404);
              data.push('');
            }

            return Promise.reject(new shaka.util.Error(
                shaka.util.Error.Category.NETWORK, code, data));
          }
        }
        return originalNetEngine.request(requestType, request);
      });

      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      createStreamingEngine();

      playhead.getTime.and.returnValue(0);
      onStartupComplete.and.callFake(function() {
        setupFakeGetTime(0);
      });

      onError.and.callFake(function(error) {
        expect(error.category).toBe(shaka.util.Error.Category.NETWORK);
        expect(error.code).toBe(code);
      });

      // Here we go!
      onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));
      streamingEngine.init();

      runTest();
      expect(onError.calls.count()).toBe(1);
      expect(attempts).toBe(2);
      expect(mediaSourceEngine.endOfStream).toHaveBeenCalled();
    }

    it('from missing init, first Period',
        testRecoverableError.bind(
            null, '1_audio_init', shaka.util.Error.Code.BAD_HTTP_STATUS));
    it('from missing init, second Period',
       testRecoverableError.bind(
            null, '2_video_init', shaka.util.Error.Code.BAD_HTTP_STATUS));
    it('from missing media, first Period',
       testRecoverableError.bind(
            null, '1_video_1', shaka.util.Error.Code.BAD_HTTP_STATUS));
    it('from missing media, second Period',
       testRecoverableError.bind(
            null, '2_audio_2', shaka.util.Error.Code.BAD_HTTP_STATUS));

    it('from missing init, first Period',
        testRecoverableError.bind(
            null, '1_video_init', shaka.util.Error.Code.HTTP_ERROR));
    it('from missing init, second Period',
       testRecoverableError.bind(
            null, '2_audio_init', shaka.util.Error.Code.HTTP_ERROR));
    it('from missing media, first Period',
       testRecoverableError.bind(
            null, '1_audio_1', shaka.util.Error.Code.HTTP_ERROR));
    it('from missing media, second Period',
       testRecoverableError.bind(
            null, '2_video_2', shaka.util.Error.Code.HTTP_ERROR));

    it('from missing init, first Period',
        testRecoverableError.bind(
            null, '1_audio_init', shaka.util.Error.Code.TIMEOUT));
    it('from missing init, second Period',
       testRecoverableError.bind(
            null, '2_video_init', shaka.util.Error.Code.TIMEOUT));
    it('from missing media, first Period',
       testRecoverableError.bind(
            null, '1_video_2', shaka.util.Error.Code.TIMEOUT));
    it('from missing media, second Period',
       testRecoverableError.bind(
            null, '2_audio_1', shaka.util.Error.Code.TIMEOUT));

    function testNonRecoverableError(targetUri, code) {
      setupVod();

      // Wrap the NetworkingEngine to perform 404 Not Found errors.
      var originalNetEngine = netEngine;
      netEngine = {
        request: jasmine.createSpy('request')
      };
      netEngine.request.and.callFake(function(requestType, request) {
        if (request.uris[0] == targetUri) {
          return Promise.reject(new shaka.util.Error(
              shaka.util.Error.Category.NETWORK, code, [targetUri]));
        }
        return originalNetEngine.request(requestType, request);
      });

      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      createStreamingEngine();

      playhead.getTime.and.returnValue(0);
      onStartupComplete.and.callFake(function() {
        setupFakeGetTime(0);
      });

      onError.and.callFake(function(error) {
        expect(error.category).toBe(shaka.util.Error.Category.NETWORK);
        expect(error.code).toBe(code);
      });

      // Here we go!
      onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));
      streamingEngine.init();

      runTest();
      expect(onError.calls.count()).toBe(1);
      expect(mediaSourceEngine.endOfStream).not.toHaveBeenCalled();
    }

    it('from unsupported scheme, init',
        testNonRecoverableError.bind(
            null, '1_audio_init', shaka.util.Error.Code.UNSUPPORTED_SCHEME));

    it('from unsupported scheme, media',
        testNonRecoverableError.bind(
            null, '1_video_2', shaka.util.Error.Code.UNSUPPORTED_SCHEME));

    it('from malformed data URI, init',
        testNonRecoverableError.bind(
            null, '1_video_init', shaka.util.Error.Code.MALFORMED_DATA_URI));

    it('from malformed data URI, media',
        testNonRecoverableError.bind(
            null, '1_audio_2', shaka.util.Error.Code.MALFORMED_DATA_URI));

    it('from unknown data URI encoding, init',
        testNonRecoverableError.bind(
            null,
            '1_video_init',
            shaka.util.Error.Code.UNKNOWN_DATA_URI_ENCODING));

    it('from unknown data URI encoding, media',
        testNonRecoverableError.bind(
            null,
            '1_audio_2',
            shaka.util.Error.Code.UNKNOWN_DATA_URI_ENCODING));

    it('ignores text stream failures if configured to', function() {
      setupVod();
      var textUri = '1_text_1';
      var originalNetEngine = netEngine;
      netEngine = {
        request: jasmine.createSpy('request')
      };
      netEngine.request.and.callFake(function(requestType, request) {
        if (request.uris[0] == textUri) {
          return Promise.reject(new shaka.util.Error(
              shaka.util.Error.Category.NETWORK,
              shaka.util.Error.Code.BAD_HTTP_STATUS, textUri, 404));
        }
        return originalNetEngine.request(requestType, request);
      });
      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      createStreamingEngine();

      playhead.getTime.and.returnValue(0);
      onStartupComplete.and.callFake(function() {
        setupFakeGetTime(0);
      });

      // Here we go!
      onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));
      streamingEngine.init();
      streamingEngine.configure({ignoreTextStreamFailures: true});

      runTest();
      expect(onError.calls.count()).toBe(0);
      expect(mediaSourceEngine.endOfStream).toHaveBeenCalled();
    });
  });

  describe('eviction', function() {
    it('evicts media to meet the max buffer tail limit', function() {
      setupVod();

      manifest.minBufferTime = 1;

      // Create StreamingEngine.
      var config = {
        rebufferingGoal: 1,
        bufferingGoal: 1,
        retryParameters: shaka.net.NetworkingEngine.defaultRetryParameters(),
        bufferBehind: 10,
        ignoreTextStreamFailures: false,
        useRelativeCueTimestamps: false
      };

      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      createStreamingEngine(config);

      playhead.getTime.and.returnValue(0);

      onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 0));

      var originalRemove = shaka.test.FakeMediaSourceEngine.prototype.remove;
      // NOTE: Closure cannot type check spy's correctly. Here we have to
      // explicitly re-create remove()'s spy.
      var removeSpy = jasmine.createSpy('remove');
      mediaSourceEngine.remove = removeSpy;

      removeSpy.and.callFake(function(type, start, end) {
        expect(playheadTime).toBe(20);
        expect(start).toBe(0);
        expect(end).toBe(10);

        if (removeSpy.calls.count() == 3) {
          removeSpy.and.callFake(function(type, start, end) {
            expect(playheadTime).toBe(30);
            expect(start).toBe(10);
            expect(end).toBe(20);
            return originalRemove.call(this, type, start, end);
          });
        }

        return originalRemove.call(this, type, start, end);
      });

      // Here we go!
      onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));
      streamingEngine.init();

      // Since StreamingEngine is free to peform audio, video, and text updates
      // in any order, there are many valid ways in which StreamingEngine can
      // evict segments. So, instead of verifying the exact, final buffer
      // configuration, ensure the byte limit is never exceeded and at least
      // one segment of each type is buffered at the end of the test.
      runTest();
      expect(mediaSourceEngine.endOfStream).toHaveBeenCalled();

      expect(mediaSourceEngine.remove).toHaveBeenCalledWith('audio', 0, 10);
      expect(mediaSourceEngine.remove).toHaveBeenCalledWith('audio', 10, 20);

      expect(mediaSourceEngine.remove).toHaveBeenCalledWith('video', 0, 10);
      expect(mediaSourceEngine.remove).toHaveBeenCalledWith('video', 10, 20);

      expect(mediaSourceEngine.remove).toHaveBeenCalledWith('text', 0, 10);
      expect(mediaSourceEngine.remove).toHaveBeenCalledWith('text', 10, 20);

      // Verify buffers.
      expect(mediaSourceEngine.initSegments).toEqual({
        audio: [false, true],
        video: [false, true],
        text: []
      });
      expect(mediaSourceEngine.segments).toEqual({
        audio: [false, false, true, true],
        video: [false, false, true, true],
        text: [false, false, true, true]
      });
    });
  });

  describe('QuotaExceededError', function() {
    it('does not fail immediately', function() {
      setupVod();

      manifest.minBufferTime = 1;

      // Create StreamingEngine.
      var config = {
        rebufferingGoal: 1,
        bufferingGoal: 1,
        retryParameters: shaka.net.NetworkingEngine.defaultRetryParameters(),
        bufferBehind: 10,
        ignoreTextStreamFailures: false,
        useRelativeCueTimestamps: false
      };

      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      createStreamingEngine(config);

      playhead.getTime.and.returnValue(0);

      onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 0));

      var originalAppendBuffer =
          shaka.test.FakeMediaSourceEngine.prototype.appendBuffer;
      var appendBufferSpy = jasmine.createSpy('appendBuffer');
      mediaSourceEngine.appendBuffer = appendBufferSpy;

      // Throw two QuotaExceededErrors at different times.
      var numErrorsThrown = 0;
      appendBufferSpy.and.callFake(
          function(type, data, startTime, endTime) {
            var throwError = (numErrorsThrown == 0 && startTime == 10) ||
                             (numErrorsThrown == 1 && startTime == 20);
            if (throwError) {
              numErrorsThrown++;
              throw new shaka.util.Error(
                  shaka.util.Error.Category.MEDIA,
                  shaka.util.Error.Code.QUOTA_EXCEEDED_ERROR,
                  type);
            } else {
              var p = originalAppendBuffer.call(
                  mediaSourceEngine, type, data, startTime, endTime);
              return p;
            }
          });

      // Here we go!
      onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));
      streamingEngine.init();

      runTest();
      expect(mediaSourceEngine.endOfStream).toHaveBeenCalled();

      // Verify buffers.
      expect(mediaSourceEngine.initSegments).toEqual({
        audio: [false, true],
        video: [false, true],
        text: []
      });
      expect(mediaSourceEngine.segments).toEqual({
        audio: [false, false, true, true],
        video: [false, false, true, true],
        text: [false, false, true, true]
      });
    });

    it('fails after multiple QuotaExceededError', function() {
      setupVod();

      manifest.minBufferTime = 1;

      // Create StreamingEngine.
      var config = {
        rebufferingGoal: 1,
        bufferingGoal: 1,
        retryParameters: shaka.net.NetworkingEngine.defaultRetryParameters(),
        bufferBehind: 10,
        ignoreTextStreamFailures: false,
        useRelativeCueTimestamps: false
      };

      mediaSourceEngine = new shaka.test.FakeMediaSourceEngine(segmentData);
      createStreamingEngine(config);

      playhead.getTime.and.returnValue(0);

      onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 0));

      var originalAppendBuffer =
          shaka.test.FakeMediaSourceEngine.prototype.appendBuffer;
      var appendBufferSpy = jasmine.createSpy('appendBuffer');
      mediaSourceEngine.appendBuffer = appendBufferSpy;

      // Throw QuotaExceededError multiple times after at least one segment of
      // each type has been appended.
      appendBufferSpy.and.callFake(
          function(type, data, startTime, endTime) {
            if (startTime >= 10) {
              throw new shaka.util.Error(
                  shaka.util.Error.Category.MEDIA,
                  shaka.util.Error.Code.QUOTA_EXCEEDED_ERROR,
                  type);
            } else {
              var p = originalAppendBuffer.call(
                  mediaSourceEngine, type, data, startTime, endTime);
              return p;
            }
          });

      onError.and.callFake(function(error) {
        expect(error.code).toBe(shaka.util.Error.Code.QUOTA_EXCEEDED_ERROR);
        expect(error.data[0] == 'audio' ||
               error.data[0] == 'video' ||
               error.data[0] == 'text').toBe(true);
      });

      // Here we go!
      onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));
      streamingEngine.init();

      // Stop the playhead after 10 seconds since will not append any
      // segments after this time.
      var stopPlayhead = function() { playing = playheadTime < 10; };

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

      playhead.getTime.and.returnValue(0);

      onStartupComplete.and.callFake(setupFakeGetTime.bind(null, drift));

      // Here we go!
      onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));
      streamingEngine.init();

      runTest();
      expect(mediaSourceEngine.endOfStream).toHaveBeenCalled();

      // Verify buffers.
      expect(mediaSourceEngine.initSegments).toEqual({
        audio: [false, true],
        video: [false, true],
        text: []
      });
      expect(mediaSourceEngine.segments).toEqual({
        audio: [true, true, true, true],
        video: [true, true, true, true],
        text: [true, true, true, true]
      });
    }

    /**
     * @param {number} drift
     */
    function testNegativeDrift(drift) {
      mediaSourceEngine =
          new shaka.test.FakeMediaSourceEngine(segmentData, drift);
      createStreamingEngine();

      playhead.getTime.and.returnValue(0);

      onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 0));

      // Here we go!
      onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));
      streamingEngine.init();

      runTest();
      expect(mediaSourceEngine.endOfStream).toHaveBeenCalled();

      // Verify buffers.
      expect(mediaSourceEngine.initSegments).toEqual({
        audio: [false, true],
        video: [false, true],
        text: []
      });
      expect(mediaSourceEngine.segments).toEqual({
        audio: [true, true, true, true],
        video: [true, true, true, true],
        text: [true, true, true, true]
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

      playhead.getTime.and.returnValue(100);

      onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 100));

      // Here we go!
      onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));
      streamingEngine.init();

      runTest(slideSegmentAvailabilityWindow);
      expect(mediaSourceEngine.endOfStream).toHaveBeenCalled();

      // Verify buffers.
      expect(mediaSourceEngine.initSegments).toEqual({
        audio: [false, true],
        video: [false, true],
        text: []
      });

      for (var i = 0; i <= 8; ++i) {
        expect(mediaSourceEngine.segments.audio[i]).toBeFalsy();
        expect(mediaSourceEngine.segments.video[i]).toBeFalsy();
        expect(mediaSourceEngine.segments.text[i]).toBeFalsy();
      }

      for (var i = 9; i <= 13; ++i) {
        expect(mediaSourceEngine.segments.audio[i]).toBeTruthy();
        expect(mediaSourceEngine.segments.video[i]).toBeTruthy();
        expect(mediaSourceEngine.segments.text[i]).toBeTruthy();
      }
    }

    it('is handled for large - values', testNegativeDrift.bind(null, -12));
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
        initSegmentRanges.audio[0],
        initSegmentRanges.audio[1]);

    netEngine.expectRangeRequest(
        period + '_video_init',
        initSegmentRanges.video[0],
        initSegmentRanges.video[1]);

    var segmentType = shaka.net.NetworkingEngine.RequestType.SEGMENT;
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
   * @param {shakaExtern.Period} period
   * @return {!Object.<string, !shakaExtern.Stream>}
   */
  function defaultOnChooseStreams(period) {
    if (period == manifest.periods[0]) {
      return {
        'audio': audioStream1, 'video': videoStream1, 'text': textStream1
      };
    } else if (period == manifest.periods[1]) {
      return {
        'audio': audioStream2, 'video': videoStream2, 'text': textStream2
      };
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
    playheadTime = startTime;
    playing = true;

    playhead.getTime.and.callFake(function() {
      return playheadTime;
    });
  }

  /**
   * Slides the segment availability window forward by 1 second.
   */
  var slideSegmentAvailabilityWindow = function() {
    timeline.segmentAvailabilityStart++;
    timeline.segmentAvailabilityEnd++;
  };

  function createMockPlayhead() {
    return {
      destroy: jasmine.createSpy('destroy'),
      setRebufferingGoal: jasmine.createSpy('setRebufferingGoal'),
      getTime: jasmine.createSpy('getTime'),
      setBuffering: jasmine.createSpy('setBuffering')
    };
  }
});

