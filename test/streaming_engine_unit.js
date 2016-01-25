/**
 * @license
 * Copyright 2015 Google Inc.
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
  var originalSetTimeout;
  var Util;

  var playhead;
  var playheadTime;
  var playing;

  var dummyInitSegments;
  var dummySegments;

  // Dummy sizes for segments.
  var initSegmentRanges = {'audio': [100, 1000], 'video': [200, 2000]};
  var segmentSizes = {'audio': 1000, 'video': 10000, 'text': 500};

  var initSegments;
  var segments;
  var segmentDurations;
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

  /** @type {shakaExtern.Manifest} */
  var manifest;

  var onCanSwitch;
  var onBufferNewPeriod;
  var onError;
  var onInitialStreamsSetup;
  var onStartupComplete;
  var streamingEngine;

  /**
   * Runs the fake event loop.
   * @param {function()=} opt_callback An optional callback that is executed
   *     each time the clock ticks.
   */
  function runTest(opt_callback) {
    function onTick(currentTime) {
      if (opt_callback) opt_callback();
      if (playing) {
        playheadTime++;
      }
    }
    // No test should require more than 60 seconds of simulated time.
    return Util.fakeEventLoop(60, originalSetTimeout, onTick);
  }

  beforeAll(function() {
    originalSetTimeout = window.setTimeout;
    Util = shaka.test.Util;
  });

  beforeEach(function() {
    jasmine.clock().install();

    // In these tests we fake a presentation that has 2 twenty second
    // Periods, where each Period has 1 StreamSet. The first Period
    // has 1 audio Stream, 2 video Streams, and 1 text Stream; and the second
    // Period has 1 Stream of each type.
    //
    // There are 4 initialization segments: 1 audio and 1 video for the
    // first Period, and 1 audio and 1 video for the second Period.
    //
    // There are 12 media segments: 2 audio, 2 video, and 2 text for the
    // first Period, and 2 audio, 2 video, and 2 text for the second Period.
    // All media segments are (by default) 10 seconds long.
    //
    // We only use the second video Stream in the first Period to verify that
    // the StreamingEngine can setup Streams correctly. It does not have init
    // or media segments.
    //
    // Furthermore, the init segment URIs follow the pattern PERIOD_TYPE_init,
    // e.g., "1_audio_init" or "2_video_init", and the media segment URIs
    // follow the pattern PERIOD_TYPE_POSITION, e.g., "1_text_2" or
    // "2_video_1". The first segment in each Period has position 1, the second
    // segment, position 2.

    // Create dummy init segments.
    var initSegmentSizeAudio =
        initSegmentRanges.audio[1] - initSegmentRanges.audio[0] + 1;
    var initSegmentSizeVideo =
        initSegmentRanges.video[1] - initSegmentRanges.video[0] + 1;
    dummyInitSegments = {
      audio: [new ArrayBuffer(initSegmentSizeAudio),
              new ArrayBuffer(initSegmentSizeAudio)],
      video: [new ArrayBuffer(initSegmentSizeVideo),
              new ArrayBuffer(initSegmentSizeVideo)],
      text: []
    };

    // Create dummy media segments. The first two ArrayBuffers in each row are
    // for the first Period, and the last two, for the second Period.
    dummySegments = {
      audio: [makeBuffer(segmentSizes.audio), makeBuffer(segmentSizes.audio),
              makeBuffer(segmentSizes.audio), makeBuffer(segmentSizes.audio)],
      video: [makeBuffer(segmentSizes.video), makeBuffer(segmentSizes.video),
              makeBuffer(segmentSizes.video), makeBuffer(segmentSizes.video)],
      text: [makeBuffer(segmentSizes.text), makeBuffer(segmentSizes.text),
             makeBuffer(segmentSizes.text), makeBuffer(segmentSizes.text)]
    };

    // Setup MediaSourceEngine.
    // This table keeps tracks of which init segments have been appended.
    initSegments = {
      'audio': [false, false],
      'video': [false, false],
      'text': []
    };

    // This table keeps tracks of which init segments have been appended.
    segments = {
      'audio': [false, false, false, false],
      'video': [false, false, false, false],
      'text': [false, false, false, false]
    };

    segmentDurations = {'audio': 10, 'video': 10, 'text': 10};

    mediaSourceEngine = createMockMediaSourceEngine();

    // Setup Playhead.
    playhead = createMockPlayhead();
    playheadTime = 0;
    playing = false;

    // Setup PresentationTimeline.
    timeline = createMockPresentationTimeline();

    timeline.getDuration.and.returnValue(40);
    timeline.getSegmentAvailabilityStart.and.returnValue(0);
    timeline.getSegmentAvailabilityEnd.and.returnValue(40);

    // These methods should not be invoked.
    timeline.setDuration.and.throwError(
        new Error('unexpected call to setDuration()'));
    timeline.getSegmentAvailabilityDuration.and.throwError(
        new Error('unexpected call to getSegmentAvailabilityDuration()'));
  });  // beforeEach()

  function setupNetworkingEngine() {
    var responseMap = {
      '1_audio_init': dummyInitSegments.audio[0],
      '1_video_init': dummyInitSegments.video[0],

      '1_audio_1': dummySegments.audio[0],
      '1_audio_2': dummySegments.audio[1],
      '1_video_1': dummySegments.video[0],
      '1_video_2': dummySegments.video[1],
      '1_text_1': dummySegments.text[0],
      '1_text_2': dummySegments.text[1],

      '2_audio_init': dummyInitSegments.audio[1],
      '2_video_init': dummyInitSegments.video[1],

      '2_audio_1': dummySegments.audio[2],
      '2_audio_2': dummySegments.audio[3],
      '2_video_1': dummySegments.video[2],
      '2_video_2': dummySegments.video[3],
      '2_text_1': dummySegments.text[2],
      '2_text_2': dummySegments.text[3]
    };
    netEngine = new shaka.test.FakeNetworkingEngine(responseMap);
  }

  function setupManifest() {
    // Functions for findSegmentPosition() and getSegmentReference().
    var find = function(type, t) {
      // Note: |t| is relative to a Period's start time.
      return t >= 0 ? Math.floor(t / segmentDurations[type]) + 1 : null;
    };
    var get = makeSegmentReference;

    audioStream1 = createMockAudioStream(0);
    videoStream1 = createMockVideoStream(1);
    textStream1 = createMockTextStream(2);

    alternateVideoStream1 = createMockVideoStream(3);

    // Setup first Period.
    audioStream1.createSegmentIndex.and.returnValue(Promise.resolve());
    videoStream1.createSegmentIndex.and.returnValue(Promise.resolve());
    textStream1.createSegmentIndex.and.returnValue(Promise.resolve());
    alternateVideoStream1.createSegmentIndex.and.returnValue(Promise.resolve());

    audioStream1.findSegmentPosition.and.callFake(find.bind(null, 'audio'));
    videoStream1.findSegmentPosition.and.callFake(find.bind(null, 'video'));
    textStream1.findSegmentPosition.and.callFake(find.bind(null, 'text'));
    alternateVideoStream1.findSegmentPosition.and.returnValue(null);

    audioStream1.getSegmentReference.and.callFake(get.bind(null, 1, 'audio'));
    videoStream1.getSegmentReference.and.callFake(get.bind(null, 1, 'video'));
    textStream1.getSegmentReference.and.callFake(get.bind(null, 1, 'text'));
    alternateVideoStream1.getSegmentReference.and.returnValue(null);

    audioStream1.initSegmentReference = new shaka.media.InitSegmentReference(
        ['1_audio_init'],
        initSegmentRanges.audio[0],
        initSegmentRanges.audio[1]);
    videoStream1.initSegmentReference = new shaka.media.InitSegmentReference(
        ['1_video_init'],
        initSegmentRanges.video[0],
        initSegmentRanges.video[1]);

    // Setup second Period.
    audioStream2 = createMockAudioStream(4);
    videoStream2 = createMockVideoStream(5);
    textStream2 = createMockTextStream(6);

    audioStream2.createSegmentIndex.and.returnValue(Promise.resolve());
    videoStream2.createSegmentIndex.and.returnValue(Promise.resolve());
    textStream2.createSegmentIndex.and.returnValue(Promise.resolve());

    audioStream2.findSegmentPosition.and.callFake(find.bind(null, 'audio'));
    videoStream2.findSegmentPosition.and.callFake(find.bind(null, 'video'));
    textStream2.findSegmentPosition.and.callFake(find.bind(null, 'text'));

    audioStream2.getSegmentReference.and.callFake(get.bind(null, 2, 'audio'));
    videoStream2.getSegmentReference.and.callFake(get.bind(null, 2, 'video'));
    textStream2.getSegmentReference.and.callFake(get.bind(null, 2, 'text'));

    audioStream2.initSegmentReference = new shaka.media.InitSegmentReference(
        ['2_audio_init'],
        initSegmentRanges.audio[0],
        initSegmentRanges.audio[1]);
    videoStream2.initSegmentReference = new shaka.media.InitSegmentReference(
        ['2_video_init'],
        initSegmentRanges.video[0],
        initSegmentRanges.video[1]);

    // Create Manifest.
    manifest = {
      presentationTimeline:
          /** @type {!shaka.media.PresentationTimeline} */ (timeline),
      minBufferTime: 5,
      periods: [
        {
          startTime: 0,
          streamSets: [
            {type: 'audio', streams: [audioStream1]},
            {type: 'video', streams: [videoStream1, alternateVideoStream1]},
            {type: 'text', streams: [textStream1]}
          ]
        },
        {
          startTime: 20,
          streamSets: [
            {type: 'audio', streams: [audioStream2]},
            {type: 'video', streams: [videoStream2]},
            {type: 'text', streams: [textStream2]}
          ]
        }
      ]
    };
  }  // setupManifest()

  /**
   * Creates a StreamingEngine instance.
   * @param {shakaExtern.StreamingConfiguration=} opt_config Optional
   *     configuration object which overrides the default one.
   */
  function createStreamingEngine(opt_config) {
    onCanSwitch = jasmine.createSpy('onCanSwitch');
    onBufferNewPeriod = jasmine.createSpy('onBufferNewPeriod');
    onError = jasmine.createSpy('onError');
    onInitialStreamsSetup = jasmine.createSpy('onInitialStreamsSetup');
    onStartupComplete = jasmine.createSpy('onStartupComplete');

    var config;
    if (opt_config) {
      config = opt_config;
    } else {
      config = {
        rebufferingGoal: 2,
        bufferingGoal: 5,
        retryParameters: shaka.net.NetworkingEngine.defaultRetryParameters(),
        byteLimit: Number.POSITIVE_INFINITY
      };
    }

    streamingEngine = new shaka.media.StreamingEngine(
        playhead, mediaSourceEngine, netEngine, manifest,
        onCanSwitch, onBufferNewPeriod, onError,
        onInitialStreamsSetup, onStartupComplete);
    streamingEngine.configure(config);
  }

  afterEach(function() {
    jasmine.clock().uninstall();
  });

  // This test initializes the StreamingEngine (SE) and allows it to play
  // through both Periods.
  //
  // After calling init() the following should occur:
  //   1. SE should setup each of the initial Streams and then call
  //      onInitialStreamsSetup().
  //   2. SE should start appending segments from the initial Streams and in
  //      parallel setup all remaining Streams within the Manifest.
  //      - SE should call onStartupComplete() after it has buffered at least 1
  //        segment from each of the initial Streams.
  //      - SE should call onCanSwitch() twice, once for each Period setup.
  //   3. SE should call onBufferNewPeriod() after it has appended both segments
  //      from the first Period.
  //   4. We must then switch to the Streams in the second Period by calling
  //      switch().
  //   5. SE should call MediaSourceEngine.endOfStream() after it has appended
  //      both segments from the second Period. At this point the playhead
  //      will not be at the end of the presentation, but the test will be
  //      effectively over since SE will have nothing else to do.
  it('initializes and plays', function(done) {
    setupNetworkingEngine();
    setupManifest();
    createStreamingEngine();

    playhead.getTime.and.returnValue(0);
    setupFakeMediaSourceEngine(0 /* expectedTimestampOffset */);

    onError.and.callFake(fail);

    onInitialStreamsSetup.and.callFake(function() {
      expect(mediaSourceEngine.init).toHaveBeenCalledWith(
          {
            'audio': 'audio/mp4; codecs="aac"',
            'video': 'video/mp4; codecs="avc"',
            'text': 'text/vtt'
          });
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

    onStartupComplete.and.callFake(function() {
      // Verify buffers.
      expect(initSegments.audio).toEqual([true, false]);
      expect(initSegments.video).toEqual([true, false]);
      expect(segments.audio).toEqual([true, false, false, false]);
      expect(segments.video).toEqual([true, false, false, false]);
      expect(segments.text).toEqual([true, false, false, false]);

      // During startup each Stream will require buffering, so there should
      // be at least 3 calls to setBuffering(true).
      expect(playhead.setBuffering).toHaveBeenCalledWith(true);
      expect(playhead.setBuffering).not.toHaveBeenCalledWith(false);
      expect(playhead.setBuffering.calls.count()).toBeGreaterThan(2);
      playhead.setBuffering.calls.reset();

      setupFakeGetTime(0);
    });

    onCanSwitch.and.callFake(function(period) {
      if (period == manifest.periods[0]) {
        expect(alternateVideoStream1.createSegmentIndex).toHaveBeenCalled();
      } else if (period == manifest.periods[1]) {
        expect(audioStream2.createSegmentIndex).toHaveBeenCalled();
        expect(videoStream2.createSegmentIndex).toHaveBeenCalled();
        expect(textStream2.createSegmentIndex).toHaveBeenCalled();
      } else {
        throw new Error('unexpected period');
      }
    });

    onBufferNewPeriod.and.callFake(function(period) {
      expect(period).toBe(manifest.periods[1]);

      // If we need to buffer the second Period then we must have reached our
      // buffering goal.
      expect(playhead.setBuffering).toHaveBeenCalledWith(false);
      playhead.setBuffering.calls.reset();

      // Verify buffers.
      expect(initSegments.audio).toEqual([true, false]);
      expect(initSegments.video).toEqual([true, false]);
      expect(segments.audio).toEqual([true, true, false, false]);
      expect(segments.video).toEqual([true, true, false, false]);
      expect(segments.text).toEqual([true, true, false, false]);

      verifyNetworkingEngineRequestCalls(1);

      // Switch to the second Period.
      setupFakeMediaSourceEngine(20 /* expectedTimestampOffset */);

      streamingEngine.switch('audio', audioStream2);
      streamingEngine.switch('video', videoStream2);
      streamingEngine.switch('text', textStream2);
    });

    // Here we go!
    var streamsByType = {
      'audio': audioStream1, 'video': videoStream1, 'text': textStream1
    };
    streamingEngine.init(streamsByType);

    runTest().then(function() {
      expect(mediaSourceEngine.endOfStream).toHaveBeenCalled();

      // Verify buffers.
      expect(initSegments.audio).toEqual([false, true]);
      expect(initSegments.video).toEqual([false, true]);
      expect(segments.audio).toEqual([true, true, true, true]);
      expect(segments.video).toEqual([true, true, true, true]);
      expect(segments.text).toEqual([true, true, true, true]);

      verifyNetworkingEngineRequestCalls(2);

      return streamingEngine.destroy();
    }).catch(fail).then(done);
  });

  describe('handles seeks', function() {
    beforeEach(function() {
      setupNetworkingEngine();
      setupManifest();
      createStreamingEngine();

      onError.and.callFake(fail);
      onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 0));
    });

    it('into buffered regions', function(done) {
      playhead.getTime.and.returnValue(0);
      setupFakeMediaSourceEngine(0 /* expectedTimestampOffset */);

      onBufferNewPeriod.and.callFake(function(period) {
        expect(period).toBe(manifest.periods[1]);

        // Seek backwards to a buffered region in the first Period. Note that
        // since the buffering goal is 5 seconds and each segment is 10
        // seconds long, the last segment in the first Period should be
        // appended when the playhead is at the 16 second mark.
        expect(playhead.getTime()).toBe(16);
        playheadTime -= 5;
        streamingEngine.seeked();

        // Don't switch to the second Period, just allow the fake event loop to
        // finish.
        onBufferNewPeriod.and.callFake(function() {});
        onBufferNewPeriod.calls.reset();
        netEngine.request.calls.reset();
        mediaSourceEngine.appendBuffer.calls.reset();
      });

      // Here we go!
      var streamsByType = {
        'audio': audioStream1, 'video': videoStream1, 'text': textStream1
      };
      streamingEngine.init(streamsByType);

      runTest().then(function() {
        expect(onBufferNewPeriod).not.toHaveBeenCalled();
        expect(mediaSourceEngine.appendBuffer).not.toHaveBeenCalled();
        expect(mediaSourceEngine.remove).not.toHaveBeenCalled();
        expect(mediaSourceEngine.clear).not.toHaveBeenCalled();
        expect(netEngine.request).not.toHaveBeenCalled();

        // Verify buffers.
        expect(initSegments.audio).toEqual([true, false]);
        expect(initSegments.video).toEqual([true, false]);
        expect(segments.audio).toEqual([true, true, false, false]);
        expect(segments.video).toEqual([true, true, false, false]);
        expect(segments.text).toEqual([true, true, false, false]);

        return streamingEngine.destroy();
      }).catch(fail).then(done);
    });

    it('into buffered regions across Periods', function(done) {
      playhead.getTime.and.returnValue(0);
      setupFakeMediaSourceEngine(0 /* expectedTimestampOffset */);

      onBufferNewPeriod.and.callFake(function(period) {
        expect(period).toBe(manifest.periods[1]);

        // Switch to the second Period.
        setupFakeMediaSourceEngine(20 /* expectedTimestampOffset */);

        streamingEngine.switch('audio', audioStream2);
        streamingEngine.switch('video', videoStream2);
        streamingEngine.switch('text', textStream2);

        mediaSourceEngine.endOfStream.and.callFake(function() {
          // Seek backwards to a buffered region in the first Period. Note
          // that since the buffering goal is 5 seconds and each segment is
          // 10 seconds long, endOfStream() should be called at the 36 second
          // mark.
          expect(playhead.getTime()).toBe(36);
          playheadTime -= 20;
          streamingEngine.seeked();

          // Allow the fake event loop to finish. Note that onBufferNewPeriod()
          // should not be called again since we've already buffered the second
          // Period.
          onBufferNewPeriod.and.callFake(function() {});
          onBufferNewPeriod.calls.reset();
          mediaSourceEngine.endOfStream.and.callFake(function() {});
          mediaSourceEngine.endOfStream.calls.reset();
        });
      });

      // Here we go!
      var streamsByType = {
        'audio': audioStream1, 'video': videoStream1, 'text': textStream1
      };
      streamingEngine.init(streamsByType);

      runTest().then(function() {
        // Already buffered to the end of the presentation so neither of these
        // should have been called again.
        expect(onBufferNewPeriod).not.toHaveBeenCalled();
        expect(mediaSourceEngine.endOfStream).not.toHaveBeenCalled();
        expect(mediaSourceEngine.remove).not.toHaveBeenCalled();
        expect(mediaSourceEngine.clear).not.toHaveBeenCalled();

        // Verify buffers.
        expect(initSegments.audio).toEqual([false, true]);
        expect(initSegments.video).toEqual([false, true]);
        expect(segments.audio).toEqual([true, true, true, true]);
        expect(segments.video).toEqual([true, true, true, true]);
        expect(segments.text).toEqual([true, true, true, true]);

        return streamingEngine.destroy();
      }).catch(fail).then(done);
    });

    it('into unbuffered regions', function(done) {
      playhead.getTime.and.returnValue(0);
      setupFakeMediaSourceEngine(0 /* expectedTimestampOffset */);

      onStartupComplete.and.callFake(function() {
        setupFakeGetTime(0);

        // Seek forward to an unbuffered region in the first Period.
        expect(playhead.getTime()).toBe(0);
        playheadTime += 15;
        streamingEngine.seeked();

        onBufferNewPeriod.and.callFake(function(period) {
          expect(period).toBe(manifest.periods[1]);

          // Verify that all buffers have been cleared.
          expect(mediaSourceEngine.clear).toHaveBeenCalledWith('audio');
          expect(mediaSourceEngine.clear).toHaveBeenCalledWith('video');
          expect(mediaSourceEngine.clear).toHaveBeenCalledWith('text');

          // Don't switch to the second Period, just allow the fake event loop
          // to finish.
          onBufferNewPeriod.and.callFake(function(period) {});
          onBufferNewPeriod.calls.reset();
          mediaSourceEngine.appendBuffer.calls.reset();
          mediaSourceEngine.clear.calls.reset();
        });
      });

      // Here we go!
      var streamsByType = {
        'audio': audioStream1, 'video': videoStream1, 'text': textStream1
      };
      streamingEngine.init(streamsByType);

      runTest().then(function() {
        expect(mediaSourceEngine.appendBuffer).not.toHaveBeenCalled();
        expect(mediaSourceEngine.remove).not.toHaveBeenCalled();
        expect(mediaSourceEngine.clear).not.toHaveBeenCalled();

        // Verify buffers.
        expect(initSegments.audio).toEqual([true, false]);
        expect(initSegments.video).toEqual([true, false]);
        expect(segments.audio).toEqual([false, true, false, false]);
        expect(segments.video).toEqual([false, true, false, false]);
        expect(segments.text).toEqual([false, true, false, false]);

        return streamingEngine.destroy();
      }).catch(fail).then(done);
    });

    it('into unbuffered regions across Periods', function(done) {
      // Start from the second Period.
      playhead.getTime.and.returnValue(20);
      setupFakeMediaSourceEngine(20 /* expectedTimestampOffset */);

      onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 20));

      // onBufferNewPeriod() should not be called since the second Period
      // is the last one; instead, endOfStream() should be called.
      mediaSourceEngine.endOfStream.and.callFake(function() {
        // Verify buffers.
        expect(initSegments.audio).toEqual([false, true]);
        expect(initSegments.video).toEqual([false, true]);
        expect(segments.audio).toEqual([false, false, true, true]);
        expect(segments.video).toEqual([false, false, true, true]);
        expect(segments.text).toEqual([false, false, true, true]);

        // Seek backwards to an unbuffered region in the first Period. Note
        // that since the buffering goal is 5 seconds and each segment is 10
        // seconds long, endOfStream() should be called at the 36 second mark.
        expect(playhead.getTime()).toBe(36);
        playheadTime -= 20;
        streamingEngine.seeked();

        onBufferNewPeriod.and.callFake(function(period) {
          expect(period).toBe(manifest.periods[0]);

          // Verify that all buffers have been cleared.
          expect(mediaSourceEngine.clear).toHaveBeenCalledWith('audio');
          expect(mediaSourceEngine.clear).toHaveBeenCalledWith('video');
          expect(mediaSourceEngine.clear).toHaveBeenCalledWith('text');
          mediaSourceEngine.clear.calls.reset();

          // Switch to the first Period.
          setupFakeMediaSourceEngine(0 /* expectedTimestampOffset */);

          streamingEngine.switch('audio', audioStream1);
          streamingEngine.switch('video', videoStream1);
          streamingEngine.switch('text', textStream1);

          onBufferNewPeriod.and.callFake(function(period) {
            expect(period).toBe(manifest.periods[1]);

            // Don't switch to the second Period, just allow the fake event
            // loop to finish.
            onBufferNewPeriod.and.callFake(function(period) {});
            mediaSourceEngine.appendBuffer.calls.reset();
            mediaSourceEngine.clear.calls.reset();
          });
        });
      });

      // Here we go!
      var streamsByType = {
        'audio': audioStream2, 'video': videoStream2, 'text': textStream2
      };
      streamingEngine.init(streamsByType);

      runTest().then(function() {
        expect(mediaSourceEngine.appendBuffer).not.toHaveBeenCalled();
        expect(mediaSourceEngine.remove).not.toHaveBeenCalled();
        expect(mediaSourceEngine.clear).not.toHaveBeenCalled();

        // Verify buffers.
        expect(initSegments.audio).toEqual([true, false]);
        expect(initSegments.video).toEqual([true, false]);
        expect(segments.audio).toEqual([false, true, false, false]);
        expect(segments.video).toEqual([false, true, false, false]);
        expect(segments.text).toEqual([false, true, false, false]);

        return streamingEngine.destroy();
      }).catch(fail).then(done);
    });

    it('into unbuffered regions when nothing is buffered', function(done) {
      playhead.getTime.and.returnValue(0);
      setupFakeMediaSourceEngine(0 /* expectedTimestampOffset */);

      onInitialStreamsSetup.and.callFake(function() {
        // Seek forward to an unbuffered region in the first Period.
        expect(playhead.getTime()).toBe(0);
        playhead.getTime.and.returnValue(15);
        streamingEngine.seeked();

        onBufferNewPeriod.and.callFake(function(period) {
          expect(period).toBe(manifest.periods[1]);

          expect(mediaSourceEngine.clear).not.toHaveBeenCalled();

          // Don't switch to the second Period, just allow the fake event loop
          // to finish.
          onBufferNewPeriod.and.callFake(function(period) {});
          onBufferNewPeriod.calls.reset();
          mediaSourceEngine.appendBuffer.calls.reset();
          mediaSourceEngine.clear.calls.reset();
        });
      });

      // This happens after onInitialStreamsSetup(), so pass 15 so the playhead
      // resumes from 15.
      onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 15));

      // Here we go!
      var streamsByType = {
        'audio': audioStream1, 'video': videoStream1, 'text': textStream1
      };
      streamingEngine.init(streamsByType);

      runTest().then(function() {
        expect(mediaSourceEngine.appendBuffer).not.toHaveBeenCalled();
        expect(mediaSourceEngine.remove).not.toHaveBeenCalled();
        expect(mediaSourceEngine.clear).not.toHaveBeenCalled();

        // Verify buffers.
        expect(initSegments.audio).toEqual([true, false]);
        expect(initSegments.video).toEqual([true, false]);
        expect(segments.audio).toEqual([false, true, false, false]);
        expect(segments.video).toEqual([false, true, false, false]);
        expect(segments.text).toEqual([false, true, false, false]);

        return streamingEngine.destroy();
      }).catch(fail).then(done);
    });

    // If we seek back into an unbuffered region but do not called seeked(),
    // StreamingEngine should wait for seeked() to be called.
    it('back into unbuffered regions without seeked() ', function(done) {
      // Start from the second segment in the second Period.
      playhead.getTime.and.returnValue(30);
      setupFakeMediaSourceEngine(20 /* expectedTimestampOffset */);

      onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 20));

      // onBufferNewPeriod() should not be called since the second Period
      // is the last one; instead, endOfStream() should be called.
      mediaSourceEngine.endOfStream.and.callFake(function() {
        // Seek backwards to an unbuffered region in the second Period. Do not
        // call seeked().
        expect(playhead.getTime()).toBe(36);
        playheadTime -= 10;
      });

      // Here we go!
      var streamsByType = {
        'audio': audioStream2, 'video': videoStream2, 'text': textStream2
      };
      streamingEngine.init(streamsByType);

      runTest().then(function() {
        // Verify buffers. Segment 3 should not be buffered since we never
        // called seeked().
        expect(initSegments.audio).toEqual([false, true]);
        expect(initSegments.video).toEqual([false, true]);
        expect(segments.audio).toEqual([false, false, false, true]);
        expect(segments.video).toEqual([false, false, false, true]);
        expect(segments.text).toEqual([false, false, false, true]);

        return streamingEngine.destroy();
      }).catch(fail).then(done);
    });

    // If we seek forward into an unbuffered region but do not called seeked(),
    // StreamingEngine should continue buffering. This test also exercises the
    // case where the playhead moves past the end of the buffer, which may
    // occur on some browsers depending on the playback rate.
    it('forward into unbuffered regions without seeked()', function(done) {
      playhead.getTime.and.returnValue(0);
      setupFakeMediaSourceEngine(0 /* expectedTimestampOffset */);

      onStartupComplete.and.callFake(function() {
        setupFakeGetTime(0);

        // Seek forward to an unbuffered region in the first Period. Do not
        // call seeked().
        playheadTime += 15;

        onBufferNewPeriod.and.callFake(function(period) {
          expect(period).toBe(manifest.periods[1]);
          setupFakeMediaSourceEngine(20 /* expectedTimestampOffset */);
          streamingEngine.switch('audio', audioStream2);
          streamingEngine.switch('video', videoStream2);
          streamingEngine.switch('text', textStream2);
        });
      });

      // Here we go!
      var streamsByType = {
        'audio': audioStream1, 'video': videoStream1, 'text': textStream1
      };
      streamingEngine.init(streamsByType);

      runTest().then(function() {
        // Verify buffers.
        expect(initSegments.audio).toEqual([false, true]);
        expect(initSegments.video).toEqual([false, true]);
        expect(segments.audio).toEqual([true, true, true, true]);
        expect(segments.video).toEqual([true, true, true, true]);
        expect(segments.text).toEqual([true, true, true, true]);

        return streamingEngine.destroy();
      }).catch(fail).then(done);
    });
  });

  describe('handles errors', function() {
    beforeEach(function() {
      setupNetworkingEngine();
      setupManifest();
      createStreamingEngine();
    });

    it('from initial Stream setup', function(done) {
      playhead.getTime.and.returnValue(0);
      setupFakeMediaSourceEngine(0 /* expectedTimestampOffset */);

      videoStream1.createSegmentIndex.and.returnValue(
          Promise.reject('FAKE_ERROR'));

      onError.and.callFake(function(error) {
        expect(onInitialStreamsSetup).not.toHaveBeenCalled();
        expect(onStartupComplete).not.toHaveBeenCalled();
        expect(error).toBe('FAKE_ERROR');
        streamingEngine.destroy().catch(fail).then(done);
      });

      // Here we go!
      var streamsByType = {
        'audio': audioStream1, 'video': videoStream1, 'text': textStream1
      };
      streamingEngine.init(streamsByType);

      runTest();
    });

    it('from post startup Stream setup', function(done) {
      playhead.getTime.and.returnValue(0);
      setupFakeMediaSourceEngine(0 /* expectedTimestampOffset */);

      alternateVideoStream1.createSegmentIndex.and.returnValue(
          Promise.reject('FAKE_ERROR'));

      onError.and.callFake(function(error) {
        expect(onInitialStreamsSetup).toHaveBeenCalled();
        expect(onStartupComplete).toHaveBeenCalled();
        expect(error).toBe('FAKE_ERROR');
        streamingEngine.destroy().catch(fail).then(done);
      });

      // Here we go!
      var streamsByType = {
        'audio': audioStream1, 'video': videoStream1, 'text': textStream1
      };
      streamingEngine.init(streamsByType);

      runTest();
    });

    it('from failed init segment append during startup', function(done) {
      playhead.getTime.and.returnValue(0);
      setupFakeMediaSourceEngine(0 /* expectedTimestampOffset */);

      mediaSourceEngine.appendBuffer.and.callFake(function(type, data) {
        // Reject the first video init segment.
        if (data == dummyInitSegments.video[0]) {
          return Promise.reject('FAKE_ERROR');
        } else {
          return fakeAppendBuffer(type, data);
        }
      });

      onError.and.callFake(function(error) {
        expect(onInitialStreamsSetup).toHaveBeenCalled();
        expect(onStartupComplete).not.toHaveBeenCalled();
        expect(error).toBe('FAKE_ERROR');
        streamingEngine.destroy().catch(fail).then(done);
      });

      // Here we go!
      var streamsByType = {
        'audio': audioStream1, 'video': videoStream1, 'text': textStream1
      };
      streamingEngine.init(streamsByType);

      runTest();
    });

    it('from failed media segment append during startup', function(done) {
      playhead.getTime.and.returnValue(0);
      setupFakeMediaSourceEngine(0 /* expectedTimestampOffset */);

      mediaSourceEngine.appendBuffer.and.callFake(function(type, data) {
        // Reject the first audio segment.
        if (data == dummySegments.audio[0]) {
          return Promise.reject('FAKE_ERROR');
        } else {
          return fakeAppendBuffer(type, data);
        }
      });

      onError.and.callFake(function(error) {
        expect(onInitialStreamsSetup).toHaveBeenCalled();
        expect(onStartupComplete).not.toHaveBeenCalled();
        expect(error).toBe('FAKE_ERROR');
        streamingEngine.destroy().catch(fail).then(done);
      });

      // Here we go!
      var streamsByType = {
        'audio': audioStream1, 'video': videoStream1, 'text': textStream1
      };
      streamingEngine.init(streamsByType);

      runTest();
    });
  });

  describe('eviction', function() {
    function checkByteLimitOnTick(byteLimit) {
      var bufferSize = Object.keys(segments).reduce(function(total, type) {
        return total + segments[type].reduce(function(subTotal, inserted) {
          return subTotal + (inserted ? segmentSizes[type] : 0);
        }, 0);
      }, 0);
      expect(bufferSize).toBeLessThan(byteLimit + 1);
    }

    it('removes segments when the byte limit is reached', function(done) {
      var byteLimit =
          segmentSizes.audio + (2 * segmentSizes.video) + segmentSizes.text;
      var config = {
        rebufferingGoal: 1,
        bufferingGoal: 1,
        retryParameters: shaka.net.NetworkingEngine.defaultRetryParameters(),
        byteLimit: byteLimit
      };

      setupNetworkingEngine();
      setupManifest();
      createStreamingEngine(config);

      playhead.getTime.and.returnValue(0);
      setupFakeMediaSourceEngine(0 /* expectedTimestampOffset */);

      onError.and.callFake(fail);
      onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 0));

      onBufferNewPeriod.and.callFake(function(period) {
        expect(period).toBe(manifest.periods[1]);

        // Switch to the second Period.
        setupFakeMediaSourceEngine(20 /* expectedTimestampOffset */);

        streamingEngine.switch('audio', audioStream2);
        streamingEngine.switch('video', videoStream2);
        streamingEngine.switch('text', textStream2);
      });

      // Here we go!
      var streamsByType = {
        'audio': audioStream1, 'video': videoStream1, 'text': textStream1
      };
      streamingEngine.init(streamsByType);

      // Since StreamingEngine is free to peform audio, video, and text updates
      // in any order, there are many valid ways in which StreamingEngine can
      // evict segments. So, instead of verifying the exact, final buffer
      // configuration, ensure the byte limit is never exceeded and at least
      // one segment of each type is buffered at the end of the test.
      runTest(checkByteLimitOnTick.bind(null, byteLimit)).then(function() {
        expect(mediaSourceEngine.endOfStream).toHaveBeenCalled();

        expect(mediaSourceEngine.remove).toHaveBeenCalledWith('audio', 0, 10);
        expect(mediaSourceEngine.remove).toHaveBeenCalledWith('audio', 10, 20);

        expect(mediaSourceEngine.remove).toHaveBeenCalledWith('video', 0, 10);
        expect(mediaSourceEngine.remove).toHaveBeenCalledWith('video', 10, 20);

        expect(mediaSourceEngine.remove).toHaveBeenCalledWith('text', 0, 10);
        expect(mediaSourceEngine.remove).toHaveBeenCalledWith('text', 10, 20);

        expect(initSegments.audio).toEqual([false, true]);
        expect(initSegments.video).toEqual([false, true]);

        expect(segments.audio[0]).toBeFalsy();
        expect(segments.video[0]).toBeFalsy();
        expect(segments.text[0]).toBeFalsy();

        expect(segments.audio[1]).toBeFalsy();
        expect(segments.video[1]).toBeFalsy();
        expect(segments.text[1]).toBeFalsy();

        expect(segments.audio[3]).toBeTruthy();
        expect(segments.video[3]).toBeTruthy();
        expect(segments.text[3]).toBeTruthy();

        return streamingEngine.destroy();
      }).catch(fail).then(done);
    });

    it('never removes a single segment', function(done) {
      // Use just 1 text segment per Period.
      dummySegments['text'] = [makeBuffer(segmentSizes.text),
                               makeBuffer(segmentSizes.text)];
      segments['text'] = [false, false];
      segmentDurations['text'] = 20;

      // Setup NetworkingEngine.
      var responseMap = {
        '1_audio_init': dummyInitSegments.audio[0],
        '1_video_init': dummyInitSegments.video[0],

        '1_audio_1': dummySegments.audio[0],
        '1_audio_2': dummySegments.audio[1],
        '1_video_1': dummySegments.video[0],
        '1_video_2': dummySegments.video[1],
        '1_text_1': dummySegments.text[0],

        '2_audio_init': dummyInitSegments.audio[1],
        '2_video_init': dummyInitSegments.video[1],

        '2_audio_1': dummySegments.audio[2],
        '2_audio_2': dummySegments.audio[3],
        '2_video_1': dummySegments.video[2],
        '2_video_2': dummySegments.video[3],
        '2_text_1': dummySegments.text[1]
      };
      netEngine = new shaka.test.FakeNetworkingEngine(responseMap);

      setupManifest();

      var byteLimit =
          segmentSizes.audio + (2 * segmentSizes.video) + segmentSizes.text;
      var config = {
        rebufferingGoal: 1,
        bufferingGoal: 1,
        retryParameters: shaka.net.NetworkingEngine.defaultRetryParameters(),
        byteLimit: byteLimit
      };
      createStreamingEngine(config);

      playhead.getTime.and.returnValue(0);
      setupFakeMediaSourceEngine(0 /* expectedTimestampOffset */);

      onError.and.callFake(fail);
      onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 0));

      onBufferNewPeriod.and.callFake(function(period) {
        expect(period).toBe(manifest.periods[1]);

        expect(mediaSourceEngine.remove).not.toHaveBeenCalledWith(
            'text', 0, 20);
        expect(segments.text[0]).toBeTruthy();

        // Switch to the second Period.
        setupFakeMediaSourceEngine(20 /* expectedTimestampOffset */);

        streamingEngine.switch('audio', audioStream2);
        streamingEngine.switch('video', videoStream2);
        streamingEngine.switch('text', textStream2);
      });

      // Here we go!
      var streamsByType = {
        'audio': audioStream1, 'video': videoStream1, 'text': textStream1
      };
      streamingEngine.init(streamsByType);

      runTest(checkByteLimitOnTick.bind(null, byteLimit)).then(function() {
        expect(mediaSourceEngine.remove).not.toHaveBeenCalledWith(
            'text', 20, 40);

        expect(initSegments.audio).toEqual([false, true]);
        expect(initSegments.video).toEqual([false, true]);

        expect(segments.audio[0]).toBeFalsy();
        expect(segments.video[0]).toBeFalsy();
        expect(segments.audio[1]).toBeFalsy();
        expect(segments.video[1]).toBeFalsy();
        expect(segments.audio[3]).toBeTruthy();
        expect(segments.video[3]).toBeTruthy();

        expect(segments.text[0]).toBeFalsy();
        expect(segments.text[1]).toBeTruthy();

        return streamingEngine.destroy();
      }).catch(fail).then(done);
    });

    it('raises an error when eviction is impossible', function(done) {
      var byteLimit = segmentSizes.audio + segmentSizes.video;
      var config = {
        rebufferingGoal: 1,
        bufferingGoal: 1,
        retryParameters: shaka.net.NetworkingEngine.defaultRetryParameters(),
        byteLimit: byteLimit
      };

      setupNetworkingEngine();
      setupManifest();
      createStreamingEngine(config);

      playhead.getTime.and.returnValue(0);
      setupFakeMediaSourceEngine(0 /* expectedTimestampOffset */);

      onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 0));

      onError.and.callFake(function(error) {
        expect(error.category).toBe(shaka.util.Error.Category.MEDIA);
        expect(error.code).toBe(
            shaka.util.Error.Code.STREAMING_CANNOT_SATISFY_BYTE_LIMIT);
      });

      // Here we go!
      var streamsByType = {
        'audio': audioStream1, 'video': videoStream1, 'text': textStream1
      };
      streamingEngine.init(streamsByType);

      runTest(checkByteLimitOnTick.bind(null, byteLimit)).then(function() {
        expect(onBufferNewPeriod).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalled();

        expect(initSegments.audio).toEqual([true, false]);
        expect(initSegments.video).toEqual([true, false]);

        return streamingEngine.destroy();
      }).catch(fail).then(done);
    });
  });

  // TODO: Add tests for eviction with drift.
  describe('drift', function() {
    beforeEach(function() {
      setupNetworkingEngine();
      setupManifest();
      createStreamingEngine();
    });

    function testPositiveDrift(drift, done) {
      setupFakeMediaSourceEngine(0 /* expectedTimestampOffset */, drift);
      playhead.getTime.and.returnValue(0);

      onError.and.callFake(function(error) {
        expect(error.category).toBe(shaka.util.Error.Category.MEDIA);
        expect(error.code).toBe(
            shaka.util.Error.Code.STREAMING_SEGMENT_DOES_NOT_EXIST);

        var reportedContentType = error.data[0];
        var reportedPeriodIndex = error.data[1];
        var reportedTimestampNeeded = error.data[2];

        // Expect six STREAMING_SEGMENT_DOES_NOT_EXIST errors as the playhead
        // will be outside the drifted segment availability window at the
        // beginning of each Period for each content type.
        if (onError.calls.count() <= 3) {
          expect(reportedTimestampNeeded).toBe(0);

          if (onError.calls.count() < 3) {
            // Simulate stuck playhead.
            playing = false;
          } else {
            // Jump the gap: StreamingEngine should recover.
            expect(onStartupComplete).not.toHaveBeenCalled();
            setupFakeGetTime(drift);
            streamingEngine.seeked();
          }
        } else {
          expect(reportedTimestampNeeded).toBe(20);

          if (onError.calls.count() < 6) {
            // Simulate stuck playhead.
            playing = false;
          } else {
            // Jump the gap: StreamingEngine should recover.
            playing = true;
            playheadTime = 20 + drift;
            streamingEngine.seeked();
          }
        }
      });

      onBufferNewPeriod.and.callFake(function(period) {
        expect(period).toBe(manifest.periods[1]);
        setupFakeMediaSourceEngine(20 /* expectedTimestampOffset */, drift);
        streamingEngine.switch('audio', audioStream2);
        streamingEngine.switch('video', videoStream2);
        streamingEngine.switch('text', textStream2);
      });

      // Here we go!
      var streamsByType = {
        'audio': audioStream1, 'video': videoStream1, 'text': textStream1
      };
      streamingEngine.init(streamsByType);

      runTest().then(function() {
        expect(onError.calls.count()).toBe(6);

        expect(mediaSourceEngine.endOfStream).toHaveBeenCalled();

        // Verify buffers.
        expect(initSegments.audio).toEqual([false, true]);
        expect(initSegments.video).toEqual([false, true]);
        expect(segments.audio).toEqual([false, false, true, true]);
        expect(segments.video).toEqual([false, false, true, true]);
        expect(segments.text).toEqual([false, false, true, true]);

        return streamingEngine.destroy();
      }).catch(fail).then(done);
    }

    // TODO: Add tests for live presentations with large negative drift.
    function testNegativeDrift(drift, done) {
      setupFakeMediaSourceEngine(0 /* expectedTimestampOffset */, drift);
      playhead.getTime.and.returnValue(0);

      onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 0));

      onBufferNewPeriod.and.callFake(function(period) {
        expect(period).toBe(manifest.periods[1]);
        setupFakeMediaSourceEngine(20 /* expectedTimestampOffset */, drift);
        streamingEngine.switch('audio', audioStream2);
        streamingEngine.switch('video', videoStream2);
        streamingEngine.switch('text', textStream2);
      });

      // Here we go!
      var streamsByType = {
        'audio': audioStream1, 'video': videoStream1, 'text': textStream1
      };
      streamingEngine.init(streamsByType);

      runTest().then(function() {
        expect(onError).not.toHaveBeenCalled();
        expect(mediaSourceEngine.endOfStream).toHaveBeenCalled();

        // Verify buffers.
        expect(initSegments.audio).toEqual([false, true]);
        expect(initSegments.video).toEqual([false, true]);
        expect(segments.audio).toEqual([true, true, true, true]);
        expect(segments.video).toEqual([true, true, true, true]);
        expect(segments.text).toEqual([true, true, true, true]);

        return streamingEngine.destroy();
      }).catch(fail).then(done);
    }

    it('is handled for small + values', testPositiveDrift.bind(null, 3));
    it('is handled for large + values', testPositiveDrift.bind(null, 12));
    it('is handled for small - values', testNegativeDrift.bind(null, -3));
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

    netEngine.expectSegmentRequest(period + '_audio_1');
    netEngine.expectSegmentRequest(period + '_video_1');
    netEngine.expectSegmentRequest(period + '_text_1');

    netEngine.expectSegmentRequest(period + '_audio_2');
    netEngine.expectSegmentRequest(period + '_video_2');
    netEngine.expectSegmentRequest(period + '_text_2');

    netEngine.request.calls.reset();
  }

  /**
   * Makes the mock Playhead object behave as a fake Playhead object which
   * begins playback at the given time.
   *
   * @param {number} startTime the playhead's starting time with respect to
   *     the presentation timeline.
   */
  function setupFakeGetTime(startTime) {
    playheadTime = startTime;
    playing = true;
    playhead.getTime.and.callFake(function() {
      return playheadTime;
    });
  }

  /**
   * Makes the mock MediaSourceEngine object behave as a fake MediaSourceEngine
   * object that keeps track of the segments that have been appended.
   *
   * Note that appending an init segment clears any init segments already
   * appended for that content type.
   *
   * The fake ensures that setTimestampOffset() is only called with the given
   * expected timestamp offset value.
   *
   * @param {number} expectedTimestampOffset
   * @param {number=} opt_drift
   */
  function setupFakeMediaSourceEngine(expectedTimestampOffset, opt_drift) {
    var drift = opt_drift || 0;

    mediaSourceEngine.bufferStart.and.callFake(
        fakeBufferStart.bind(null, drift));
    mediaSourceEngine.bufferEnd.and.callFake(
        fakeBufferEnd.bind(null, drift));
    mediaSourceEngine.bufferedAheadOf.and.callFake(
        fakeBufferedAheadOf.bind(null, drift));

    mediaSourceEngine.appendBuffer.and.callFake(fakeAppendBuffer);

    mediaSourceEngine.setTimestampOffset.and.callFake(
        fakeSetTimestampOffset.bind(null, expectedTimestampOffset));

    mediaSourceEngine.remove.and.callFake(fakeRemove.bind(null, drift));
    mediaSourceEngine.clear.and.callFake(function(type) {
      return fakeRemove(drift, type, drift, 40 + drift);
    });

    mediaSourceEngine.setDuration.and.returnValue(Promise.resolve());
    mediaSourceEngine.setAppendWindowEnd.and.returnValue(Promise.resolve());
  }

  function fakeBufferStart(drift, type) {
    if (segments[type] === undefined) throw new Error('unexpected type');
    var first = segments[type].indexOf(true);
    return first >= 0 ? first * segmentDurations[type] + drift : null;
  }

  function fakeBufferEnd(drift, type) {
    if (segments[type] === undefined) throw new Error('unexpected type');
    var last = segments[type].lastIndexOf(true);
    return last >= 0 ? (last + 1) * segmentDurations[type] + drift : null;
  }

  function fakeBufferedAheadOf(drift, type, startTime) {
    if (segments[type] === undefined) throw new Error('unexpected type');

    // Note: startTime may equal the presentation's duration, so |first|
    // may equal segments[type].length
    var first = Math.floor((startTime - drift) / segmentDurations[type]);
    if (!segments[type][first])
      return 0;  // Unbuffered.

    // Find the first gap.
    var last = segments[type].indexOf(false, first);
    if (last < 0)
      last = segments[type].length;

    var endTime = last * segmentDurations[type] + drift;
    return endTime - startTime;
  }

  function fakeAppendBuffer(type, data) {
    if (segments[type] === undefined) throw new Error('unexpected type');

    // Set init segment.
    var i = dummyInitSegments[type].indexOf(data);
    if (i >= 0) {
      for (var j = 0; j < initSegments[type].length; ++j) {
        initSegments[type][j] = false;
      }
      initSegments[type][i] = true;
      return Promise.resolve();
    }

    // Set media segment.
    i = dummySegments[type].indexOf(data);
    if (i < 0) throw new Error('unexpected data');

    segments[type][i] = true;
    return Promise.resolve();
  }

  function fakeSetTimestampOffset(expectedTimestampOffset, type, offset) {
    if (segments[type] === undefined) throw new Error('unexpected type');

    if (offset != expectedTimestampOffset)
      throw new Error('unexpected timestamp offset');

    return Promise.resolve();
  }

  function fakeRemove(drift, type, start, end) {
    if (segments[type] === undefined) throw new Error('unexpected type');

    var first = Math.floor((start - drift) / segmentDurations[type]);
    if (first < 0 || first >= segments[type].length)
      throw new Error('unexpected start');

    // Note: |end| is exclusive, so subtract a very small amount from it to get
    // the correct index.
    var last = Math.ceil((end - drift - 0.000001) / segmentDurations[type]);
    if (last < 0)
      throw new Error('unexpected end');

    if (first >= last)
      throw new Error('unexpected start and end');

    for (var i = first; i < last; ++i) {
      segments[type][i] = false;
    }

    return Promise.resolve();
  }

  /**
   * Constructs a SegmentReference with a test URI.
   * @param {number} period The Period number (one-based).
   * @param {string} contentType The content type.
   * @param {number} position The segment's position (one-based).
   */
  function makeSegmentReference(period, contentType, position) {
    if (position > 2) return null;
    var size = segmentSizes[contentType];
    var duration = segmentDurations[contentType];
    return new shaka.media.SegmentReference(
        position, (position - 1) * duration, position * duration,
        ['' + period + '_' + contentType + '_' + position],
        0, null);
  }

  function makeBuffer(size) {
    return new ArrayBuffer(size);
  }

  function createMockPlayhead() {
    return {
      destroy: jasmine.createSpy('destroy'),
      getTime: jasmine.createSpy('getTime'),
      setBuffering: jasmine.createSpy('setBuffering')
    };
  }

  function createMockMediaSourceEngine() {
    return {
      destroy: jasmine.createSpy('support'),
      init: jasmine.createSpy('init'),
      bufferStart: jasmine.createSpy('bufferStart'),
      bufferEnd: jasmine.createSpy('bufferEnd'),
      bufferedAheadOf: jasmine.createSpy('bufferedAheadOf'),
      appendBuffer: jasmine.createSpy('appendBuffer'),
      remove: jasmine.createSpy('remove'),
      clear: jasmine.createSpy('clear'),
      endOfStream: jasmine.createSpy('endOfStream'),
      setDuration: jasmine.createSpy('setDuration'),
      setTimestampOffset: jasmine.createSpy('setTimestampOffset'),
      setAppendWindowEnd: jasmine.createSpy('setAppendWindowEnd')
    };
  }

  function createMockNetworkingEngine() {
    return {
      destroy: jasmine.createSpy('destroy'),
      request: jasmine.createSpy('request')
    };
  }

  function createMockPresentationTimeline() {
    return {
      getDuration: jasmine.createSpy('getDuration'),
      setDuration: jasmine.createSpy('setDuration'),
      getSegmentAvailabilityDuration:
          jasmine.createSpy('getSegmentAvailabilityDuration'),
      getSegmentAvailabilityStart:
          jasmine.createSpy('getSegmentAvailabilityStart'),
      getSegmentAvailabilityEnd:
          jasmine.createSpy('getSegmentAvailabilityEnd')
    };
  }

  function createMockAudioStream(id) {
    return {
      id: id,
      createSegmentIndex: jasmine.createSpy('createSegmentIndex'),
      findSegmentPosition: jasmine.createSpy('findSegmentPosition'),
      getSegmentReference: jasmine.createSpy('getSegmentReference'),
      initSegmentReference: null,
      presentationTimeOffset: 0,
      mimeType: 'audio/mp4',
      codecs: 'aac',
      bandwidth: 192000
    };
  }

  function createMockVideoStream(id) {
    return {
      id: id,
      createSegmentIndex: jasmine.createSpy('createSegmentIndex'),
      findSegmentPosition: jasmine.createSpy('findSegmentPosition'),
      getSegmentReference: jasmine.createSpy('getSegmentReference'),
      initSegmentReference: null,
      presentationTimeOffset: 0,
      mimeType: 'video/mp4',
      codecs: 'avc',
      bandwidth: 5000000,
      width: 1280,
      height: 720
    };
  }

  function createMockTextStream(id) {
    return {
      id: id,
      createSegmentIndex: jasmine.createSpy('createSegmentIndex'),
      findSegmentPosition: jasmine.createSpy('findSegmentPosition'),
      getSegmentReference: jasmine.createSpy('getSegmentReference'),
      initSegmentReference: null,
      presentationTimeOffset: 0,
      mimeType: 'text/vtt',
      kind: 'subtitles'
    };
  }
});

