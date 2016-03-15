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
  var originalTimeout;

  var metadata = {
    video: {
      initSegmentUri: 'test/assets/sintel-video-init.mp4',
      mvhdOffset: 0x24,
      segmentUri: 'test/assets/sintel-video-segment.mp4',
      tfdtOffset: 0x34,
      segmentDuration: 12,
      presentationTimeOffset: 0,
      mimeType: 'video/mp4; codecs="avc1.42c01e"',
      generator: null,
      segmentSize: null
    },
    audio: {
      initSegmentUri: 'test/assets/sintel-audio-init.mp4',
      mvhdOffset: 0x20,
      segmentUri: 'test/assets/sintel-audio-segment.mp4',
      tfdtOffset: 0x38,
      segmentDuration: 10.005333,
      presentationTimeOffset: 0,
      mimeType: 'audio/mp4; codecs="mp4a.40.2"',
      generator: null,
      segmentSize: null
    }
  };

  var presentationDuration = 60;
  var minBufferTime = 2;

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

  function createStreamGenerator(type, metadata) {
    var generator = new shaka.test.DashVodStreamGenerator(
        metadata.initSegmentUri, metadata.mvhdOffset,
        metadata.segmentUri, metadata.tfdtOffset, metadata.segmentDuration,
        metadata.presentationTimeOffset, presentationDuration);
    metadata.generator = generator;
    return generator.init();
  }

  beforeAll(function(done) {
    originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 90000;  // ms

    video = /** @type {HTMLVideoElement} */ (document.createElement('video'));
    video.width = '600';
    video.height = '400';
    video.muted = true;
    document.body.appendChild(video);

    Promise.all([
      createStreamGenerator('video', metadata.video),
      createStreamGenerator('audio', metadata.audio)
    ]).then(function() {
      metadata.video.segmentSize =
          metadata.video.generator.getSegment(1, 0).byteLength;
      metadata.audio.segmentSize =
          metadata.audio.generator.getSegment(1, 0).byteLength;
    }).catch(fail).then(done);
  });

  beforeEach(function(done) {
    eventManager = new shaka.util.EventManager();
    setupMediaSource().then(setupTest).catch(fail).then(done);
  });

  function setupMediaSource() {
    // Setup MediaSource and MediaSourceEngine.
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

  function setupTest() {
    // Setup PresentationTimeline.
    timeline = createMockPresentationTimeline();

    timeline.getDuration.and.returnValue(presentationDuration);
    timeline.getSegmentAvailabilityStart.and.returnValue(0);
    timeline.getSegmentAvailabilityEnd.and.returnValue(presentationDuration);

    // These methods should not be invoked.
    timeline.setDuration.and.throwError(
        new Error('unexpected call to setDuration()'));
    timeline.getSegmentAvailabilityDuration.and.returnValue(null);

    // Setup Playhead.
    onBuffering = jasmine.createSpy('onBuffering');
    var onSeek = function() { streamingEngine.seeked(); };
    playhead = new shaka.media.Playhead(
        /** @type {!HTMLVideoElement} */(video),
        timeline, minBufferTime, 0, onBuffering, onSeek);

    setupNetworkingEngine();
    setupManifest();
    createStreamingEngine();
  }

  function setupNetworkingEngine() {
    var responseMap = {
      '1_audio_init': metadata.audio.generator.getInitSegment(0),
      '1_video_init': metadata.video.generator.getInitSegment(0),

      '1_audio_1': metadata.audio.generator.getSegment(1, 0),
      '1_audio_2': metadata.audio.generator.getSegment(2, 0),
      '1_audio_3': metadata.audio.generator.getSegment(3, 0),

      '1_video_1': metadata.video.generator.getSegment(1, 0),
      '1_video_2': metadata.video.generator.getSegment(2, 0),
      '1_video_3': metadata.video.generator.getSegment(3, 0),

      '2_audio_init': metadata.audio.generator.getInitSegment(0),
      '2_video_init': metadata.video.generator.getInitSegment(0),

      '2_audio_1': metadata.audio.generator.getSegment(1, 0),
      '2_audio_2': metadata.audio.generator.getSegment(2, 0),
      '2_audio_3': metadata.audio.generator.getSegment(3, 0),

      '2_video_1': metadata.video.generator.getSegment(1, 0),
      '2_video_2': metadata.video.generator.getSegment(2, 0),
      '2_video_3': metadata.video.generator.getSegment(3, 0)
    };
    netEngine = new shaka.test.FakeNetworkingEngine(responseMap);
  }

  function setupManifest() {
    // Functions for findSegmentPosition() and getSegmentReference().
    var find = function(contentType, t) {
      // Note: |t| is relative to a Period's start time.
      return Math.floor(t / metadata[contentType].segmentDuration) + 1;
    };
    var get = makeSegmentReference;

    audioStream1 = createMockAudioStream(0);
    videoStream1 = createMockVideoStream(1);

    // Setup first Period.
    audioStream1.createSegmentIndex.and.returnValue(Promise.resolve());
    videoStream1.createSegmentIndex.and.returnValue(Promise.resolve());

    audioStream1.findSegmentPosition.and.callFake(find.bind(null, 'audio'));
    videoStream1.findSegmentPosition.and.callFake(find.bind(null, 'video'));

    audioStream1.getSegmentReference.and.callFake(get.bind(null, 1, 'audio'));
    videoStream1.getSegmentReference.and.callFake(get.bind(null, 1, 'video'));

    audioStream1.initSegmentReference =
        new shaka.media.InitSegmentReference(['1_audio_init'], 0, null);
    videoStream1.initSegmentReference =
        new shaka.media.InitSegmentReference(['1_video_init'], 0, null);

    // Setup second Period.
    audioStream2 = createMockAudioStream(4);
    videoStream2 = createMockVideoStream(5);

    audioStream2.createSegmentIndex.and.returnValue(Promise.resolve());
    videoStream2.createSegmentIndex.and.returnValue(Promise.resolve());

    audioStream2.findSegmentPosition.and.callFake(find.bind(null, 'audio'));
    videoStream2.findSegmentPosition.and.callFake(find.bind(null, 'video'));

    audioStream2.getSegmentReference.and.callFake(get.bind(null, 2, 'audio'));
    videoStream2.getSegmentReference.and.callFake(get.bind(null, 2, 'video'));

    audioStream2.initSegmentReference =
        new shaka.media.InitSegmentReference(['2_audio_init'], 0, null);
    videoStream2.initSegmentReference =
        new shaka.media.InitSegmentReference(['2_video_init'], 0, null);

    // Create Manifest.
    manifest = {
      presentationTimeline:
          /** @type {!shaka.media.PresentationTimeline} */ (timeline),
      minBufferTime: minBufferTime,
      periods: [
        {
          startTime: 0,
          streamSets: [
            {type: 'audio', streams: [audioStream1]},
            {type: 'video', streams: [videoStream1]}
          ]
        },
        {
          startTime: 30,
          streamSets: [
            {type: 'audio', streams: [audioStream2]},
            {type: 'video', streams: [videoStream2]}
          ]
        }
      ]
    };
  }  // setupManifest()

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
      byteLimit: 2 * 1000 * 1000  // 2MB
    };
    streamingEngine = new shaka.media.StreamingEngine(
        playhead, mediaSourceEngine, netEngine, manifest,
        onChooseStreams, onCanSwitch, onError,
        onInitialStreamsSetup, onStartupComplete);
    streamingEngine.configure(config);
  }

  afterEach(function(done) {
    // Note: each test is responsible for destroying the StreamingEngine
    // instance.
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
    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
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
    onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));
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
    onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));
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
    onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));
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
    onChooseStreams.and.callFake(defaultOnChooseStreams.bind(null));
    streamingEngine.init();
  });

  /**
   * Initializes or switches to the given period.
   *
   * @param {shakaExtern.Period} period
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

  /**
   * Constructs a SegmentReference with a test URI.
   * @param {number} period The Period number (one-based).
   * @param {string} contentType The content type.
   * @param {number} position The segment's position (one-based).
   */
  function makeSegmentReference(period, contentType, position) {
    if (position > 3) return null;
    var duration = metadata[contentType].segmentDuration;
    var size = metadata[contentType].segmentSize;
    return new shaka.media.SegmentReference(
        position, (position - 1) * duration, position * duration,
        ['' + period + '_' + contentType + '_' + position],
        0, size);
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
      codecs: 'mp4a.40.2',
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
      codecs: 'avc1.42c01e',
      bandwidth: 5000000,
      width: 600,
      height: 400
    };
  }
});

