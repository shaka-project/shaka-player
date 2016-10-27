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
  var metadata = {
    video: {
      initSegmentUri: '/base/test/test/assets/sintel-video-init.mp4',
      mvhdOffset: 0x24,
      segmentUri: '/base/test/test/assets/sintel-video-segment.mp4',
      tfdtOffset: 0x38,
      segmentDuration: 10,
      presentationTimeOffset: 0,
      mimeType: 'video/mp4; codecs="avc1.42c01e"',
      generator: null
    },
    audio: {
      initSegmentUri: '/base/test/test/assets/sintel-audio-init.mp4',
      mvhdOffset: 0x20,
      segmentUri: '/base/test/test/assets/sintel-audio-segment.mp4',
      tfdtOffset: 0x3c,
      segmentDuration: 10,
      presentationTimeOffset: 0,
      mimeType: 'audio/mp4; codecs="mp4a.40.2"',
      generator: null
    }
  };

  var eventManager;
  var video;
  var timeline;

  var playhead;
  var onBuffering;

  var mediaSource;
  var mediaSourceEngine;

  var netEngine;

  var audioStream1;
  var videoStream1;
  var audioStream2;
  var videoStream2;

  var manifest;

  var onChooseStreams;
  var onCanSwitch;
  var onError;
  var onInitialStreamsSetup;
  var onStartupComplete;
  var streamingEngine;

  beforeAll(function() {
    video = /** @type {HTMLVideoElement} */ (document.createElement('video'));
    video.width = 600;
    video.height = 400;
    video.muted = true;
    document.body.appendChild(video);
  });

  beforeEach(function(done) {
    eventManager = new shaka.util.EventManager();
    setupMediaSource().catch(fail).then(done);
  });

  // Setup MediaSource and MediaSourceEngine.
  function setupMediaSource() {
    mediaSource = new MediaSource();
    video.src = window.URL.createObjectURL(mediaSource);

    var p = new shaka.util.PublicPromise();
    var onMediaSourceOpen = function() {
      eventManager.unlisten(mediaSource, 'sourceopen');
      mediaSource.duration = 0;
      mediaSourceEngine = new shaka.media.MediaSourceEngine(
          video, mediaSource, null);
      p.resolve();
    };
    eventManager.listen(mediaSource, 'sourceopen', onMediaSourceOpen);

    return p;
  }

  function setupVod() {
    return Promise.all([
      createVodStreamGenerator(
          metadata.audio,
          60 /* presentationDuration */),
      createVodStreamGenerator(
          metadata.video,
          60 /* presentationDuration */)
    ]).then(function() {
      timeline = shaka.test.StreamingEngineUtil.createFakePresentationTimeline(
          0 /* segmentAvailabilityStart */,
          60 /* segmentAvailabilityEnd */,
          60 /* presentationDuration */);
      setupPlayhead();

      setupNetworkingEngine(
          0 /* firstPeriodStartTime */,
          30 /* secondPeriodStartTime */,
          60 /* presentationDuration */,
          { audio: metadata.audio.segmentDuration,
            video: metadata.video.segmentDuration });

      setupManifest(
          0 /* firstPeriodStartTime */,
          30 /* secondPeriodStartTime */,
          60 /* presentationDuration */);

      createStreamingEngine();
    });
  }

  function setupLive() {
    return Promise.all([
      createLiveStreamGenerator(
          metadata.audio,
          20 /* timeShiftBufferDepth */),
      createLiveStreamGenerator(
          metadata.video,
          20 /* timeShiftBufferDepth */)
    ]).then(function() {
      // The generator's AST is set to 295 seconds in the past, so the live-edge
      // is at 295 - 10 seconds.
      // -10 to account for maxSegmentDuration.
      timeline = shaka.test.StreamingEngineUtil.createFakePresentationTimeline(
          275 - 10 /* segmentAvailabilityStart */,
          295 - 10 /* segmentAvailabilityEnd */,
          Infinity /* presentationDuration */);
      setupPlayhead();

      setupNetworkingEngine(
          0 /* firstPeriodStartTime */,
          300 /* secondPeriodStartTime */,
          Infinity /* presentationDuration */,
          { audio: metadata.audio.segmentDuration,
            video: metadata.video.segmentDuration });

      setupManifest(
          0 /* firstPeriodStartTime */,
          300 /* secondPeriodStartTime */,
          Infinity /* presentationDuration */);

      createStreamingEngine();
    });
  }

  function createVodStreamGenerator(metadata, presentationDuration) {
    var generator = new shaka.test.DashVodStreamGenerator(
        metadata.initSegmentUri,
        metadata.mvhdOffset,
        metadata.segmentUri,
        metadata.tfdtOffset,
        metadata.segmentDuration,
        metadata.presentationTimeOffset,
        presentationDuration);
    metadata.generator = generator;
    return generator.init();
  }

  function createLiveStreamGenerator(metadata, timeShiftBufferDepth) {
    // Set the generator's AST to 295 seconds in the past so the
    // StreamingEngine begins streaming close to the end of the first Period.
    var now = Date.now() / 1000;
    var generator = new shaka.test.DashLiveStreamGenerator(
        metadata.initSegmentUri,
        metadata.mvhdOffset,
        metadata.segmentUri,
        metadata.tfdtOffset,
        metadata.segmentDuration,
        metadata.presentationTimeOffset,
        now - 295 /* broadcastStartTime */,
        now - 295 /* availabilityStartTime */,
        timeShiftBufferDepth);
    metadata.generator = generator;
    return generator.init();
  }

  function setupNetworkingEngine(firstPeriodStartTime, secondPeriodStartTime,
                                 presentationDuration, segmentDurations) {
    var periodStartTimes = [firstPeriodStartTime, secondPeriodStartTime];

    var boundsCheckPosition =
        shaka.test.StreamingEngineUtil.boundsCheckPosition.bind(
            null, periodStartTimes, presentationDuration, segmentDurations);

    var getNumSegments =
        shaka.test.StreamingEngineUtil.getNumSegments.bind(
            null, periodStartTimes, presentationDuration, segmentDurations);

    // Create the fake NetworkingEngine. Note: the StreamingEngine should never
    // request a segment that does not exist.
    netEngine = shaka.test.StreamingEngineUtil.createFakeNetworkingEngine(
        // Init segment generator:
        function(type, periodNumber) {
          expect(periodNumber).toBeLessThan(periodStartTimes.length + 1);
          var wallClockTime = Date.now() / 1000;
          var segment = metadata[type].generator.getInitSegment(wallClockTime);
          expect(segment).not.toBeNull();
          return segment;
        },
        // Media segment generator:
        function(type, periodNumber, position) {
          expect(boundsCheckPosition(type, periodNumber, position))
              .not.toBeNull();

          // Compute the total number of segments in all Periods before the
          // |periodNumber|'th one.
          var numPriorSegments = 0;
          for (var n = 1; n < periodNumber; ++n)
            numPriorSegments += getNumSegments(type, n);

          var wallClockTime = Date.now() / 1000;

          var segment = metadata[type].generator.getSegment(
              position, numPriorSegments, wallClockTime);
          expect(segment).not.toBeNull();
          return segment;
        });
  }

  function setupPlayhead() {
    onBuffering = jasmine.createSpy('onBuffering');
    var onSeek = function() { streamingEngine.seeked(); };
    playhead = new shaka.media.Playhead(
        /** @type {!HTMLVideoElement} */(video),
        /** @type {!shaka.media.PresentationTimeline} */(timeline),
        2 /* rebufferingGoal */,
        null /* startTime */,
        onBuffering,
        onSeek);
  }

  function setupManifest(
      firstPeriodStartTime, secondPeriodStartTime, presentationDuration) {
    manifest = shaka.test.StreamingEngineUtil.createManifest(
        [firstPeriodStartTime, secondPeriodStartTime], presentationDuration,
        { audio: metadata.audio.segmentDuration,
          video: metadata.video.segmentDuration });

    manifest.presentationTimeline = timeline;
    manifest.minBufferTime = 2;

    // Create InitSegmentReferences.
    function makeUris(uri) { return function() { return [uri]; }; }
    manifest.periods[0].streamSetsByType.audio.streams[0].initSegmentReference =
        new shaka.media.InitSegmentReference(makeUris('1_audio_init'), 0, null);
    manifest.periods[0].streamSetsByType.video.streams[0].initSegmentReference =
        new shaka.media.InitSegmentReference(makeUris('1_video_init'), 0, null);
    manifest.periods[1].streamSetsByType.audio.streams[0].initSegmentReference =
        new shaka.media.InitSegmentReference(makeUris('2_audio_init'), 0, null);
    manifest.periods[1].streamSetsByType.video.streams[0].initSegmentReference =
        new shaka.media.InitSegmentReference(makeUris('2_video_init'), 0, null);

    audioStream1 = manifest.periods[0].streamSets[0].streams[0];
    videoStream1 = manifest.periods[0].streamSets[1].streams[0];
    audioStream2 = manifest.periods[1].streamSets[0].streams[0];
    videoStream2 = manifest.periods[1].streamSets[1].streams[0];
  }

  function createStreamingEngine() {
    onChooseStreams = jasmine.createSpy('onChooseStreams');
    onCanSwitch = jasmine.createSpy('onCanSwitch');
    onInitialStreamsSetup = jasmine.createSpy('onInitialStreamsSetup');
    onStartupComplete = jasmine.createSpy('onStartupComplete');
    onError = jasmine.createSpy('onError');
    onError.and.callFake(fail);

    var config = {
      rebufferingGoal: 2,
      bufferingGoal: 5,
      retryParameters: shaka.net.NetworkingEngine.defaultRetryParameters(),
      bufferBehind: 15,
      ignoreTextStreamFailures: false,
      useRelativeCueTimestamps: false
    };
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
    streamingEngine.destroy().then(function() {
      video.src = '';
      return Promise.all([
        mediaSourceEngine.destroy(),
        playhead.destroy(),
        eventManager.destroy()
      ]);
    }).catch(fail).then(done);
  });

  afterAll(function() {
    document.body.removeChild(video);
  });

  describe('VOD', function() {
    beforeEach(function(done) {
      setupVod().catch(fail).then(done);
    });

    it('plays', function(done) {
      onStartupComplete.and.callFake(function() {
        video.play();
      });

      var onEnded = function() {
        // Some browsers may not end at exactly 60 seconds.
        expect(Math.round(video.currentTime)).toBe(60);
        done();
      };
      eventManager.listen(video, 'ended', onEnded);

      // Let's go!
      onChooseStreams.and.callFake(defaultOnChooseStreams);
      streamingEngine.init();
    });

    it('plays at high playback rates', function(done) {
      var startupComplete = false;

      onStartupComplete.and.callFake(function() {
        startupComplete = true;
        video.play();
      });

      onBuffering.and.callFake(function(buffering) {
        if (!buffering) {
          expect(startupComplete).toBeTruthy();
          video.playbackRate = 10;
        }
      });

      var onEnded = function() {
        // Some browsers may not end at exactly 60 seconds.
        expect(Math.round(video.currentTime)).toBe(60);
        done();
      };
      eventManager.listen(video, 'ended', onEnded);

      // Let's go!
      onChooseStreams.and.callFake(defaultOnChooseStreams);
      streamingEngine.init();
    });

    it('can handle buffered seeks', function(done) {
      onStartupComplete.and.callFake(function() {
        video.play();
      });

      // After 35 seconds seek back 10 seconds into the first Period.
      var onTimeUpdate = function() {
        if (video.currentTime >= 35) {
          eventManager.unlisten(video, 'timeupdate');
          video.currentTime = 25;
        }
      };
      eventManager.listen(video, 'timeupdate', onTimeUpdate);

      var onEnded = function() {
        // Some browsers may not end at exactly 60 seconds.
        expect(Math.round(video.currentTime)).toBe(60);
        done();
      };
      eventManager.listen(video, 'ended', onEnded);

      // Let's go!
      onChooseStreams.and.callFake(defaultOnChooseStreams);
      streamingEngine.init();
    });

    it('can handle unbuffered seeks', function(done) {
      onStartupComplete.and.callFake(function() {
        video.play();
      });

      // After 20 seconds seek 10 seconds into the second Period.
      var onTimeUpdate = function() {
        if (video.currentTime >= 20) {
          eventManager.unlisten(video, 'timeupdate');
          video.currentTime = 40;
        }
      };
      eventManager.listen(video, 'timeupdate', onTimeUpdate);

      var onEnded = function() {
        // Some browsers may not end at exactly 60 seconds.
        expect(Math.round(video.currentTime)).toBe(60);
        done();
      };
      eventManager.listen(video, 'ended', onEnded);

      // Let's go!
      onChooseStreams.and.callFake(defaultOnChooseStreams);
      streamingEngine.init();
    });
  });

  describe('Live', function() {
    var slideSegmentAvailabilityWindow;

    beforeEach(function(done) {
      setupLive().then(function() {
        slideSegmentAvailabilityWindow = window.setInterval(function() {
          timeline.segmentAvailabilityStart++;
          timeline.segmentAvailabilityEnd++;
        }, 1000);
      }).catch(fail).then(done);
    });

    afterEach(function() {
      window.clearInterval(slideSegmentAvailabilityWindow);
    });

    it('plays through Period transition', function(done) {
      onStartupComplete.and.callFake(function() {
        // firstSegmentNumber =
        //   [(segmentAvailabilityEnd - rebufferingGoal) / segmentDuration] + 1
        // Then -1 to account for drift safe buffering.
        var segmentType = shaka.net.NetworkingEngine.RequestType.SEGMENT;
        netEngine.expectRequest('1_video_28', segmentType);
        netEngine.expectRequest('1_audio_28', segmentType);
        video.play();
      });

      var onTimeUpdate = function() {
        if (video.currentTime >= 305) {
          // We've played through the Period transition!
          eventManager.unlisten(video, 'timeupdate');
          done();
        }
      };
      eventManager.listen(video, 'timeupdate', onTimeUpdate);

      // Let's go!
      onChooseStreams.and.callFake(defaultOnChooseStreams);
      streamingEngine.init();
    });

    it('can handle seeks ahead of availability window', function(done) {
      onStartupComplete.and.callFake(function() {
        video.play();

        // Use setTimeout to ensure the playhead has performed it's initial
        // seeking.
        setTimeout(function() {
          // Seek outside the availability window right away. The playhead
          // should adjust the video's current time.
          video.currentTime = timeline.segmentAvailabilityEnd + 120;
        }, 50);
      });

      var onTimeUpdate = function() {
        if (video.currentTime >= 305) {
          // We've played through the Period transition!
          eventManager.unlisten(video, 'timeupdate');
          done();
        }
      };
      eventManager.listen(video, 'timeupdate', onTimeUpdate);

      // Let's go!
      onChooseStreams.and.callFake(defaultOnChooseStreams);
      streamingEngine.init();
    });

    it('can handle seeks behind availability window', function(done) {
      onStartupComplete.and.callFake(function() {
        video.play();

        // Use setTimeout to ensure the playhead has performed it's initial
        // seeking.
        setTimeout(function() {
          // Seek outside the availability window right away. The playhead
          // should adjust the video's current time.
          video.currentTime = timeline.segmentAvailabilityStart - 120;
          expect(video.currentTime).toBeGreaterThan(0);
        }, 50);
      });

      var onTimeUpdate = function() {
        if (video.currentTime >= 305) {
          // We've played through the Period transition!
          eventManager.unlisten(video, 'timeupdate');
          done();
        }
      };
      eventManager.listen(video, 'timeupdate', onTimeUpdate);

      // Let's go!
      onChooseStreams.and.callFake(defaultOnChooseStreams);
      streamingEngine.init();
    });
  });

  /**
   * Choose streams for the given period.
   *
   * @param {shakaExtern.Period} period
   * @return {!Object.<string, !shakaExtern.Stream>}
   */
  function defaultOnChooseStreams(period) {
    if (period == manifest.periods[0]) {
      return {'audio': audioStream1, 'video': videoStream1};
    } else if (period == manifest.periods[1]) {
      return {'audio': audioStream2, 'video': videoStream2};
    } else {
      throw new Error();
    }
  }
});
