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

  var dummyInitSegments;
  var dummySegments;

  var playhead;
  var playheadTime;
  var playing;

  var initSegments;
  var segments;
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

  // Dummy sizes for media segments.
  var segmentSizes = {'audio': 1000, 'video': 10000, 'text': 500};

  var onCanSwitch;
  var onBufferNewPeriod;
  var onError;
  var onInitialStreamsSetup;
  var onStartupComplete;
  var streamingEngine;

  function runTest() {
    function onTick(currentTime) {
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
    // All media segments are 10 seconds long.
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
    dummyInitSegments = {
      audio: [new ArrayBuffer(0), new ArrayBuffer(0)],
      video: [new ArrayBuffer(0), new ArrayBuffer(0)],
      text: []
    };

    // Create dummy media segments. The first two ArrayBuffers in each row are
    // for the first Period, and the last two, for the second Period.
    dummySegments = {
      audio: [new ArrayBuffer(0), new ArrayBuffer(0),
              new ArrayBuffer(0), new ArrayBuffer(0)],
      video: [new ArrayBuffer(0), new ArrayBuffer(0),
              new ArrayBuffer(0), new ArrayBuffer(0)],
      text: [new ArrayBuffer(0), new ArrayBuffer(0),
             new ArrayBuffer(0), new ArrayBuffer(0)]
    };

    // Setup Playhead.
    playhead = createMockPlayhead();
    playheadTime = 0;
    playing = false;

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

    mediaSourceEngine = createMockMediaSourceEngine();

    // Setup NetworkingEngine.
    // TODO: De-duplicate by implementing a generic fake?
    netEngine = createMockNetworkingEngine();
    netEngine.request.and.callFake(function(requestType, request) {
      if (requestType !=
          shaka.net.NetworkingEngine.RequestType.SEGMENT) {
        throw new Error('unexpected request type');
      }

      // Return the correct ArrayBuffer given the URIs. We don't check if the
      // request is fully correct here; we do that later during validation.
      var data;

      if (request.uris[0] == '1_audio_init') data = dummyInitSegments.audio[0];
      if (request.uris[0] == '1_video_init') data = dummyInitSegments.video[0];

      if (request.uris[0] == '1_audio_1') data = dummySegments.audio[0];
      if (request.uris[0] == '1_audio_2') data = dummySegments.audio[1];
      if (request.uris[0] == '1_video_1') data = dummySegments.video[0];
      if (request.uris[0] == '1_video_2') data = dummySegments.video[1];
      if (request.uris[0] == '1_text_1') data = dummySegments.text[0];
      if (request.uris[0] == '1_text_2') data = dummySegments.text[1];

      if (request.uris[0] == '2_audio_init') data = dummyInitSegments.audio[1];
      if (request.uris[0] == '2_video_init') data = dummyInitSegments.video[1];

      if (request.uris[0] == '2_audio_1') data = dummySegments.audio[2];
      if (request.uris[0] == '2_audio_2') data = dummySegments.audio[3];
      if (request.uris[0] == '2_video_1') data = dummySegments.video[2];
      if (request.uris[0] == '2_video_2') data = dummySegments.video[3];
      if (request.uris[0] == '2_text_1') data = dummySegments.text[2];
      if (request.uris[0] == '2_text_2') data = dummySegments.text[3];

      if (!data) throw new Error('unexpected URI: ' + request.uris[0]);

      return Promise.resolve({data: data, headers: {}});
    });

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

    // Setup Streams.

    // Functions for findSegmentPosition() and getSegmentReference().
    var find = function(t) {
      // Note: |t| is relative to a Period's start time.
      return Math.floor(t / 10) + 1;
    };
    var get = constructUri;

    audioStream1 = createMockAudioStream(0);
    videoStream1 = createMockVideoStream(1);
    textStream1 = createMockTextStream(2);

    alternateVideoStream1 = createMockVideoStream(3);

    // Setup first Period.
    audioStream1.createSegmentIndex.and.returnValue(Promise.resolve());
    videoStream1.createSegmentIndex.and.returnValue(Promise.resolve());
    textStream1.createSegmentIndex.and.returnValue(Promise.resolve());
    alternateVideoStream1.createSegmentIndex.and.returnValue(Promise.resolve());

    audioStream1.findSegmentPosition.and.callFake(find);
    videoStream1.findSegmentPosition.and.callFake(find);
    textStream1.findSegmentPosition.and.callFake(find);
    alternateVideoStream1.findSegmentPosition.and.returnValue(null);

    audioStream1.getSegmentReference.and.callFake(get.bind(null, 1, 'audio'));
    videoStream1.getSegmentReference.and.callFake(get.bind(null, 1, 'video'));
    textStream1.getSegmentReference.and.callFake(get.bind(null, 1, 'text'));
    alternateVideoStream1.getSegmentReference.and.returnValue(null);

    audioStream1.initSegmentReference =
        new shaka.media.InitSegmentReference(['1_audio_init'], 0, null);
    videoStream1.initSegmentReference =
        new shaka.media.InitSegmentReference(['1_video_init'], 0, null);

    // Setup second Period.
    audioStream2 = createMockAudioStream(4);
    videoStream2 = createMockVideoStream(5);
    textStream2 = createMockTextStream(6);

    audioStream2.createSegmentIndex.and.returnValue(Promise.resolve());
    videoStream2.createSegmentIndex.and.returnValue(Promise.resolve());
    textStream2.createSegmentIndex.and.returnValue(Promise.resolve());

    audioStream2.findSegmentPosition.and.callFake(find);
    videoStream2.findSegmentPosition.and.callFake(find);
    textStream2.findSegmentPosition.and.callFake(find);

    audioStream2.getSegmentReference.and.callFake(get.bind(null, 2, 'audio'));
    videoStream2.getSegmentReference.and.callFake(get.bind(null, 2, 'video'));
    textStream2.getSegmentReference.and.callFake(get.bind(null, 2, 'text'));

    audioStream2.initSegmentReference =
        new shaka.media.InitSegmentReference(['2_audio_init'], 0, null);
    videoStream2.initSegmentReference =
        new shaka.media.InitSegmentReference(['2_video_init'], 0, null);

    // Create Manifest.
    manifest = {
      presentationTimeline:
          /** @type {!shaka.media.PresentationTimeline} */ (timeline),
      minBufferTime: 5,
      periods: /** @type {!Array.<shakaExtern.StreamSet>} */ ([
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
      ])
    };

    // Setup real StreamingEngine.
    onCanSwitch = jasmine.createSpy('onCanSwitch');
    onBufferNewPeriod = jasmine.createSpy('onBufferNewPeriod');
    onError = jasmine.createSpy('onError');
    onInitialStreamsSetup = jasmine.createSpy('onInitialStreamsSetup');
    onStartupComplete = jasmine.createSpy('onStartupComplete');

    var config = {
      rebufferingGoal: 2,
      bufferingGoal: 5,
      retryParameters: shaka.net.NetworkingEngine.defaultRetryParameters()
    };
    streamingEngine = new shaka.media.StreamingEngine(
        config, playhead, mediaSourceEngine, netEngine, manifest,
        onCanSwitch, onBufferNewPeriod, onError,
        onInitialStreamsSetup, onStartupComplete);
  });  // beforeEach()

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
    playhead.getTime.and.returnValue(0);
    setupFakeMediaSourceEngine(0 /* expectedTimestampOffset */);

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
      // be 3 calls to setBuffering(true).
      expect(playhead.setBuffering).toHaveBeenCalledWith(true);
      expect(playhead.setBuffering).not.toHaveBeenCalledWith(false);
      expect(playhead.setBuffering.calls.count()).toBe(3);
      playhead.setBuffering.calls.reset();

      playing = true;
      playhead.getTime.and.callFake(function() {
        return playheadTime;
      });
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
    /**
     * Sets up a fake Playhead.getTime() method.
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

    beforeEach(function() {
      onStartupComplete.and.callFake(setupFakeGetTime.bind(null, 0));
    });

    it('into buffered regions', function(done) {
      playhead.getTime.and.returnValue(0);
      setupFakeMediaSourceEngine(0 /* expectedTimestampOffset */);

      onBufferNewPeriod.and.callFake(function(period) {
        expect(period).toBe(manifest.periods[1]);

        // Seek backwards to a buffered region in the first Period. Note that
        // since the buffering goal is 5 seconds and each segment is 10 seconds
        // long, the last segment in the first Period will be appended when the
        // playhead is at the 16 second mark.
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
          // Seek backwards to a buffered region in the first Period. Note that
          // since the buffering goal is 5 seconds and each segment is 10
          // seconds long, the last segment in the second Period will be
          // appended when the playhead is at the 26 second mark.
          expect(playhead.getTime()).toBe(26);
          playheadTime -= 15;
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

          // Verify buffers.
          expect(initSegments.audio).toEqual([true, false]);
          expect(initSegments.video).toEqual([true, false]);
          expect(segments.audio).toEqual([false, true, false, false]);
          expect(segments.video).toEqual([false, true, false, false]);
          expect(segments.text).toEqual([false, true, false, false]);

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
        // seconds long, the last segment in the second Period will be appended
        // when the playhead is at the 26 second mark.
        expect(playhead.getTime()).toBe(26);
        playheadTime -= 10;
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

            // Verify buffers.
            expect(initSegments.audio).toEqual([true, false]);
            expect(initSegments.video).toEqual([true, false]);
            expect(segments.audio).toEqual([false, true, false, false]);
            expect(segments.video).toEqual([false, true, false, false]);
            expect(segments.text).toEqual([false, true, false, false]);

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

        streamingEngine.destroy().then(done);
      });
    });
  });

  describe('handles errors', function() {
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

  /**
   * Verifies calls to NetworkingEngine.request().
   * @param {number} period The Period number (one-based).
   */
  function verifyNetworkingEngineRequestCalls(period) {
    var get = constructUri;

    expect(netEngine.request).toHaveBeenCalledWith(
        shaka.net.NetworkingEngine.RequestType.SEGMENT,
        jasmine.objectContaining({
          uris: [period + '_audio_init'],
          method: 'GET',
          headers: {}
        }));

    expect(netEngine.request).toHaveBeenCalledWith(
        shaka.net.NetworkingEngine.RequestType.SEGMENT,
        jasmine.objectContaining({
          uris: [period + '_video_init'],
          method: 'GET',
          headers: {}
        }));

    expect(netEngine.request).toHaveBeenCalledWith(
        shaka.net.NetworkingEngine.RequestType.SEGMENT,
        jasmine.objectContaining({
          uris: [period + '_audio_1'],
          method: 'GET',
          headers: {'Range': 'bytes=0-' + segmentSizes.audio}
        }));

    expect(netEngine.request).toHaveBeenCalledWith(
        shaka.net.NetworkingEngine.RequestType.SEGMENT,
        jasmine.objectContaining({
          uris: [period + '_video_1'],
          method: 'GET',
          headers: {'Range': 'bytes=0-' + segmentSizes.video}
        }));

    expect(netEngine.request).toHaveBeenCalledWith(
        shaka.net.NetworkingEngine.RequestType.SEGMENT,
        jasmine.objectContaining({
          uris: [period + '_text_1'],
          method: 'GET',
          headers: {'Range': 'bytes=0-' + segmentSizes.text}
        }));

    expect(netEngine.request).toHaveBeenCalledWith(
        shaka.net.NetworkingEngine.RequestType.SEGMENT,
        jasmine.objectContaining({
          uris: [period + '_audio_2'],
          method: 'GET',
          headers: {'Range': 'bytes=0-' + segmentSizes.audio}
        }));

    expect(netEngine.request).toHaveBeenCalledWith(
        shaka.net.NetworkingEngine.RequestType.SEGMENT,
        jasmine.objectContaining({
          uris: [period + '_video_2'],
          method: 'GET',
          headers: {'Range': 'bytes=0-' + segmentSizes.video}
        }));

    expect(netEngine.request).toHaveBeenCalledWith(
        shaka.net.NetworkingEngine.RequestType.SEGMENT,
        jasmine.objectContaining({
          uris: [period + '_text_2'],
          method: 'GET',
          headers: {'Range': 'bytes=0-' + segmentSizes.text}
        }));

    netEngine.request.calls.reset();
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
   */
  function setupFakeMediaSourceEngine(expectedTimestampOffset) {
    mediaSourceEngine.bufferStart.and.callFake(fakeBufferStart);
    mediaSourceEngine.bufferEnd.and.callFake(fakeBufferEnd);
    mediaSourceEngine.bufferedAheadOf.and.callFake(fakeBufferedAheadOf);
    mediaSourceEngine.appendBuffer.and.callFake(fakeAppendBuffer);
    mediaSourceEngine.setTimestampOffset.and.callFake(
        fakeSetTimestampOffset.bind(null, expectedTimestampOffset));
    mediaSourceEngine.remove.and.callFake(fakeRemove);
    mediaSourceEngine.clear.and.callFake(function(type) {
      return fakeRemove(type, 0, 40);
    });
    mediaSourceEngine.setDuration.and.returnValue(Promise.resolve());
  }

  function fakeBufferStart(type, time) {
    if (segments[type] === undefined) throw new Error('unexpected type');
    var first = segments[type].indexOf(true);
    return first >= 0 ? first * 10 : null;
  }

  function fakeBufferEnd(type, time) {
    if (segments[type] === undefined) throw new Error('unexpected type');
    var last = segments[type].lastIndexOf(true);
    return last >= 0 ? (last + 1) * 10 : null;
  }

  function fakeBufferedAheadOf(type, time) {
    if (segments[type] === undefined) throw new Error('unexpected type');
    var start = Math.floor(time / 10);
    if (!segments[type][start]) return 0;  // Unbuffered.
    var last = segments[type].indexOf(false, start);  // Find first gap.
    if (last < 0) last = segments[type].length - 1;
    var endTime = last * 10;
    shaka.asserts.assert(endTime >= time, 'unexpected end');
    return endTime - time;
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
    if (segments[type] === undefined)
      throw new Error('unexpected type');
    if (offset != expectedTimestampOffset)
      throw new Error('unexpected timestamp offset');
    return Promise.resolve();
  }

  function fakeRemove(type, start, end) {
    if (segments[type] === undefined) throw new Error('unexpected type');
    if (start != 0) throw new Error('unexpected start');
    if (end < 40) throw new Error('unexpected end');

    for (var i = 0; i < segments[type].length; ++i) {
      segments[type][i] = false;
    }

    return Promise.resolve();
  }

  /**
   * Constructs a media segment URI.
   * @param {number} period The Period number (one-based).
   * @param {string} contentType The content type.
   * @param {number} position The segment's position (one-based).
   */
  function constructUri(period, contentType, position) {
    var size = segmentSizes[contentType];
    if (position == 1 || position == 2) {
      return new shaka.media.SegmentReference(
          position, (position - 1) * 10, position * 10,
          ['' + period + '_' + contentType + '_' + position],
          0, size);
    } else {
      return null;
    }
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
      setTimestampOffset: jasmine.createSpy('setTimestampOffset')
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

