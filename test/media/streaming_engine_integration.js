/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('StreamingEngine', () => {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  const Util = shaka.test.Util;

  let metadata;
  let generators;

  /** @type {!shaka.util.EventManager} */
  let eventManager;
  /** @type {shaka.test.Waiter} */
  let waiter;

  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {{start: number, end: number}} */
  let segmentAvailability;
  /** @type {!shaka.test.FakePresentationTimeline} */
  let timeline;

  /** @type {!shaka.media.Playhead} */
  let playhead;
  /** @type {shaka.extern.StreamingConfiguration} */
  let config;

  /** @type {!shaka.test.FakeNetworkingEngine} */
  let netEngine;
  /** @type {!shaka.media.MediaSourceEngine} */
  let mediaSourceEngine;
  /** @type {!shaka.media.StreamingEngine} */
  let streamingEngine;

  /** @type {shaka.extern.Variant} */
  let variant;

  /** @type {shaka.extern.Manifest} */
  let manifest;

  /** @type {!jasmine.Spy} */
  let onError;
  /** @type {!jasmine.Spy} */
  let onEvent;

  beforeAll(() => {
    video = shaka.test.UiUtils.createVideoElement();
    document.body.appendChild(video);

    metadata = shaka.test.TestScheme.DATA['sintel'];
    generators = {};
  });

  beforeEach(() => {
    config = shaka.util.PlayerConfiguration.createDefault().streaming;

    // Disable stall detection, which can interfere with playback tests.
    config.stallEnabled = false;

    onError = jasmine.createSpy('onError');
    onError.and.callFake(fail);
    onEvent = jasmine.createSpy('onEvent');

    eventManager = new shaka.util.EventManager();
    waiter = new shaka.test.Waiter(eventManager);

    mediaSourceEngine = new shaka.media.MediaSourceEngine(
        video,
        new shaka.test.FakeTextDisplayer());
    const mediaSourceConfig =
        shaka.util.PlayerConfiguration.createDefault().mediaSource;
    mediaSourceEngine.configure(mediaSourceConfig);
    waiter.setMediaSourceEngine(mediaSourceEngine);
  });

  afterEach(async () => {
    eventManager.release();

    await streamingEngine.destroy();
    await mediaSourceEngine.destroy();

    playhead.release();
  });

  afterAll(() => {
    document.body.removeChild(video);
  });

  async function setupVod() {
    await createVodStreamGenerator(metadata.audio, ContentType.AUDIO);
    await createVodStreamGenerator(metadata.video, ContentType.VIDEO);

    segmentAvailability = {
      start: 0,
      end: 40,
    };

    timeline = shaka.test.StreamingEngineUtil.createFakePresentationTimeline(
        segmentAvailability,
        /* presentationDuration= */ 40,
        /* maxSegmentDuration= */ metadata.video.segmentDuration,
        /* isLive= */ false);

    setupNetworkingEngine(
        /* presentationDuration= */ 40,
        {
          audio: metadata.audio.segmentDuration,
          video: metadata.video.segmentDuration,
        });

    setupManifest(
        /* firstPeriodStartTime= */ 0,
        /* secondPeriodStartTime= */ 20,
        /* presentationDuration= */ 40);

    setupPlayhead();

    createStreamingEngine();
  }

  async function setupLive() {
    await createLiveStreamGenerator(
        metadata.audio,
        ContentType.AUDIO,
        /* timeShiftBufferDepth= */ 20);

    await createLiveStreamGenerator(
        metadata.video,
        ContentType.VIDEO,
        /* timeShiftBufferDepth= */ 20);

    // The generator's AST is set to 295 seconds in the past, so the live-edge
    // is at 295 - 10 seconds.
    // -10 to account for maxSegmentDuration.
    segmentAvailability = {
      start: 275 - 10,
      end: 295 - 10,
    };

    timeline = shaka.test.StreamingEngineUtil.createFakePresentationTimeline(
        segmentAvailability,
        /* presentationDuration= */ Infinity,
        /* maxSegmentDuration= */ metadata.video.segmentDuration,
        /* isLive= */ true);

    setupNetworkingEngine(
        /* presentationDuration= */ Infinity,
        {
          audio: metadata.audio.segmentDuration,
          video: metadata.video.segmentDuration,
        });

    setupManifest(
        /* firstPeriodStartTime= */ 0,
        /* secondPeriodStartTime= */ 300,
        /* presentationDuration= */ Infinity);
    setupPlayhead();

    // Retry on failure for live streams.
    config.failureCallback = () => streamingEngine.retry(0.1);

    // Ignore 404 errors in live stream tests.
    onError.and.callFake((error) => {
      if (error.code == shaka.util.Error.Code.BAD_HTTP_STATUS &&
          error.data[1] == 404) {
        // 404 error
      } else {
        fail(error);
      }
    });

    createStreamingEngine();
  }

  function createVodStreamGenerator(metadata, type) {
    const generator = new shaka.test.Mp4VodStreamGenerator(
        metadata.initSegmentUri,
        metadata.mdhdOffset,
        metadata.segmentUri,
        metadata.tfdtOffset,
        metadata.segmentDuration);
    generators[type] = generator;
    return generator.init();
  }

  function createLiveStreamGenerator(metadata, type, timeShiftBufferDepth) {
    // Set the generator's AST to 295 seconds in the past so the
    // StreamingEngine begins streaming close to the end of the first Period.
    const now = Date.now() / 1000;
    const generator = new shaka.test.Mp4LiveStreamGenerator(
        metadata.initSegmentUri,
        metadata.mdhdOffset,
        metadata.segmentUri,
        metadata.tfdtOffset,
        metadata.segmentDuration,
        /* broadcastStartTime= */ now - 295,
        /* availabilityStartTime= */ now - 295,
        timeShiftBufferDepth);
    generators[type] = generator;
    return generator.init();
  }

  function setupNetworkingEngine(presentationDuration, segmentDurations) {
    // Create the fake NetworkingEngine. Note: the StreamingEngine should never
    // request a segment that does not exist.
    netEngine = shaka.test.StreamingEngineUtil.createFakeNetworkingEngine(
        // Init segment generator:
        (type, periodNumber) => {
          const wallClockTime = Date.now() / 1000;
          const segment = generators[type].getInitSegment(wallClockTime);
          expect(segment).not.toBeNull();
          return segment;
        },
        // Media segment generator:
        (type, periodNumber, position) => {
          const wallClockTime = Date.now() / 1000;
          const segment = generators[type].getSegment(position, wallClockTime);
          return segment;
        },
        /* delays= */{audio: 0, video: 0, text: 0});
  }

  function setupPlayhead() {
    const onSeek = () => {
      streamingEngine.seeked();
    };
    playhead = new shaka.media.MediaSourcePlayhead(
        /** @type {!HTMLVideoElement} */(video),
        manifest,
        config,
        /* startTime= */ null,
        onSeek,
        shaka.test.Util.spyFunc(onEvent));
  }

  function setupManifest(
      firstPeriodStartTime, secondPeriodStartTime, presentationDuration) {
    manifest = shaka.test.StreamingEngineUtil.createManifest(
        /** @type {!shaka.media.PresentationTimeline} */(timeline),
        [firstPeriodStartTime, secondPeriodStartTime], presentationDuration,
        /* segmentDurations= */ {
          audio: metadata.audio.segmentDuration,
          video: metadata.video.segmentDuration,
        },
        /* initSegmentRanges= */ {
          audio: [0, null],
          video: [0, null],
        });

    variant = manifest.variants[0];
  }

  function createStreamingEngine() {
    const playerInterface = {
      getPresentationTime: () => playhead.getTime(),
      getBandwidthEstimate: () => 1e6,
      mediaSourceEngine: mediaSourceEngine,
      netEngine: /** @type {!shaka.net.NetworkingEngine} */(netEngine),
      onError: Util.spyFunc(onError),
      onEvent: Util.spyFunc(onEvent),
      onManifestUpdate: () => {},
      onSegmentAppended: () => playhead.notifyOfBufferingChange(),
      onInitSegmentAppended: () => {},
      beforeAppendSegment: () => Promise.resolve(),
      onMetadata: () => {},
      disableStream: (stream, time) => false,
    };
    streamingEngine = new shaka.media.StreamingEngine(
        /** @type {shaka.extern.Manifest} */(manifest), playerInterface);
    streamingEngine.configure(config);
  }

  describe('VOD', () => {
    beforeEach(async () => {
      await setupVod();
    });

    it('plays', async () => {
      // Let's go!
      streamingEngine.switchVariant(variant);
      await streamingEngine.start();
      await video.play();
      // The overall test timeout is 120 seconds, and the content is 40
      // seconds.  It should be possible to complete this test in 100 seconds,
      // and if not, we want the error thrown to be within the overall test's
      // timeout window.  Note that we have seen some devices fail to play at
      // full speed for reasons beyond our control, so we plan for >= 0.5x.
      await waiter.timeoutAfter(100).waitForEnd(video);
    });

    it('plays at high playback rates', async () => {
      // Experimentally, we find that playback rates above 2x in this test seem
      // to cause decoder failures on Tizen 3.  This is out of our control, and
      // seems to be a Tizen bug, so this test is skipped on Tizen completely.
      if (shaka.util.Platform.isTizen()) {
        pending('High playbackRate tests cause decoder errors on Tizen 3.');
      }

      // Let's go!
      streamingEngine.switchVariant(variant);
      await streamingEngine.start();
      await video.play();

      // Wait for playback to begin before increasing the playback rate.  This
      // improves test reliability on slow platforms like Chromecast.
      await waiter.timeoutAfter(10).waitForMovement(video);
      video.playbackRate = 10;

      await waiter.timeoutAfter(30).waitForEnd(video);
    });

    it('can handle buffered seeks', async () => {
      // Let's go!
      streamingEngine.switchVariant(variant);
      await streamingEngine.start();
      await video.play();

      // After 35 seconds seek back 10 seconds into the first Period.
      await waiter.timeoutAfter(80).waitUntilPlayheadReaches(video, 35);
      video.currentTime = 25;
      await waiter.timeoutAfter(80).waitForEnd(video);
    });

    it('can handle unbuffered seeks', async () => {
      // Let's go!
      streamingEngine.switchVariant(variant);
      await streamingEngine.start();
      await video.play();
      await waiter.timeoutAfter(60).waitUntilPlayheadReaches(video, 20);
      video.currentTime = 40;
      await waiter.timeoutAfter(60).waitForEnd(video);
    });
  });

  describe('Live', () => {
    /** @type {number} */
    let slideSegmentAvailabilityWindow;

    beforeEach(async () => {
      await setupLive();
      slideSegmentAvailabilityWindow = window.setInterval(() => {
        segmentAvailability.start++;
        segmentAvailability.end++;
      }, 1000);
    });

    afterEach(() => {
      window.clearInterval(slideSegmentAvailabilityWindow);
    });

    it('plays through Period transition', async () => {
      // Let's go!
      streamingEngine.switchVariant(variant);
      await streamingEngine.start();

      await video.play();
      await waiter.timeoutAfter(60).waitUntilPlayheadReaches(video, 305);

      const segmentType = shaka.net.NetworkingEngine.RequestType.SEGMENT;
      const segmentContext = {
        type: shaka.net.NetworkingEngine.AdvancedRequestType.MEDIA_SEGMENT,
      };
      // firstSegmentNumber =
      //   [(segmentAvailabilityEnd - rebufferingGoal) / segmentDuration] + 1
      netEngine.expectRequest('0_video_29', segmentType, segmentContext);
      netEngine.expectRequest('0_audio_29', segmentType, segmentContext);
    });

    it('can handle seeks ahead of availability window', async () => {
      // Let's go!
      streamingEngine.switchVariant(variant);
      await streamingEngine.start();

      await waiter.timeoutAfter(5).waitForEvent(video, 'loadeddata');

      // Seek outside the availability window right away. The playhead
      // should adjust the video's current time.
      video.currentTime = segmentAvailability.end + 120;
      await video.play();

      // Wait until the repositioning is complete so we don't
      // immediately hit this case.
      await shaka.test.Util.delay(/* seconds= */ 1);
      await waiter.timeoutAfter(60).waitUntilPlayheadReaches(video, 305);
    });

    it('can handle seeks behind availability window', async () => {
      let seekCount = 0;
      eventManager.listen(video, 'seeking', () => {
        seekCount++;
      });

      // Let's go!
      streamingEngine.switchVariant(variant);
      await streamingEngine.start();

      await waiter.timeoutAfter(5).waitForEvent(video, 'loadeddata');

      // Seek outside the availability window right away. The playhead
      // should adjust the video's current time.
      video.currentTime = segmentAvailability.start - 120;
      expect(video.currentTime).toBeGreaterThan(0);

      await video.play();
      await waiter.timeoutAfter(60).waitUntilPlayheadReaches(video, 305);

      // We are playing close to the beginning of the availability window.
      // We should be playing smoothly and not seeking repeatedly as we fall
      // outside the window.
      //
      // Expected seeks:
      //   1. seek to live stream start time during startup
      //   2. explicit seek in the test to get outside the window
      //   3. Playhead seeks to force us back inside the window
      //   4. (maybe) seek if there is a gap at the period boundary
      //   5. (maybe) seek to flush a pipeline stall
      //   6. (maybe) on slower platforms (e.g. GitHub actions)
      expect(seekCount).toBeGreaterThan(2);
      expect(seekCount).toBeLessThan(7);
    });
  });

  // This tests gaps created by missing segments.
  // TODO: Consider also adding tests for missing frames.
  describe('gap jumping', () => {
    it('jumps small gaps at the beginning', async () => {
      await setupGappyContent(/* gapAtStart= */ 1, /* dropSegment= */ false);

      // Let's go!
      streamingEngine.switchVariant(variant);
      await streamingEngine.start();
      await video.play();

      await waiter.timeoutAfter(5).waitUntilPlayheadReaches(video, 0.01);
      expect(video.buffered.length).toBeGreaterThan(0);
      expect(video.buffered.start(0)).toBeCloseTo(1);

      await waiter.timeoutAfter(20).waitUntilPlayheadReaches(video, 5);
    });

    it('jumps large gaps at the beginning', async () => {
      await setupGappyContent(/* gapAtStart= */ 5, /* dropSegment= */ false);

      // Let's go!
      streamingEngine.switchVariant(variant);
      await streamingEngine.start();
      await video.play();

      await waiter.timeoutAfter(5).waitUntilPlayheadReaches(video, 0.01);
      expect(video.buffered.length).toBeGreaterThan(0);
      expect(video.buffered.start(0)).toBeCloseTo(5);

      await waiter.timeoutAfter(20).waitUntilPlayheadReaches(video, 8);
    });

    it('jumps small gaps in the middle', async () => {
      await setupGappyContent(/* gapAtStart= */ 0, /* dropSegment= */ true);

      // Let's go!
      streamingEngine.switchVariant(variant);
      await streamingEngine.start();

      await waiter.timeoutAfter(5).waitForEvent(video, 'loadeddata');

      video.currentTime = 8;
      await video.play();

      await waiter.timeoutAfter(60).waitUntilPlayheadReaches(video, 23);
      // Should be close enough to still have the gap buffered.
      expect(video.buffered.length).toBe(2);
    });

    it('jumps large gaps in the middle', async () => {
      await setupGappyContent(/* gapAtStart= */ 0, /* dropSegment= */ true);

      // Let's go!
      streamingEngine.switchVariant(variant);
      await streamingEngine.start();

      await waiter.timeoutAfter(5).waitForEvent(video, 'loadeddata');

      video.currentTime = 8;
      await video.play();

      await waiter.timeoutAfter(60).waitUntilPlayheadReaches(video, 23);
      // Should be close enough to still have the gap buffered.
      expect(video.buffered.length).toBe(2);
    });

    /**
     * @param {number} gapAtStart The gap to introduce before start, in seconds.
     * @param {boolean} dropSegment Whether to drop a segment in the middle.
     * @return {!Promise}
     */
    async function setupGappyContent(gapAtStart, dropSegment) {
      // This uses "normal" stream generators and networking engine.  The only
      // difference is the segments are removed from the manifest.  The segments
      // should not be downloaded.
      await createVodStreamGenerator(metadata.audio, ContentType.AUDIO);
      await createVodStreamGenerator(metadata.video, ContentType.VIDEO);

      segmentAvailability = {
        start: 0,
        end: 30,
      };

      timeline =
          shaka.test.StreamingEngineUtil.createFakePresentationTimeline(
              segmentAvailability,
              /* presentationDuration= */ 30,
              /* maxSegmentDuration= */ metadata.video.segmentDuration,
              /* isLive= */ false);

      setupNetworkingEngine(
          /* presentationDuration= */ 30,
          {
            audio: metadata.audio.segmentDuration,
            video: metadata.video.segmentDuration,
          });

      manifest = setupGappyManifest(gapAtStart, dropSegment);
      variant = manifest.variants[0];

      setupPlayhead();
      createStreamingEngine();
    }

    /**
     * TODO: Consolidate with StreamingEngineUtil.createManifest?
     * @param {number} gapAtStart
     * @param {boolean} dropSegment
     * @return {shaka.extern.Manifest}
     */
    function setupGappyManifest(gapAtStart, dropSegment) {
      /**
       * @param {string} type
       * @param {shaka.media.InitSegmentReference} initSegmentReference
       * @return {!shaka.media.SegmentIndex}
       */
      function createIndex(type, initSegmentReference) {
        const d = metadata[type].segmentDuration;
        const refs = [];
        let i = 0;
        let time = gapAtStart;
        while (time < 30) {
          let end = time + d;
          // Make segment 0 longer to make the manifest continuous, despite the
          // dropped segment.
          if (i == 0 && dropSegment) {
            end += d;
          }

          let cur = i;
          const getUris = () => {
            // The times in the media are based on the URL; so to drop a
            // segment, we change the URL.
            if (cur >= 1 && dropSegment) {
              cur++;
            }
            return ['0_' + type + '_' + cur];
          };
          refs.push(new shaka.media.SegmentReference(
              /* startTime= */ time,
              /* endTime= */ end,
              getUris,
              /* startByte= */ 0,
              /* endByte= */ null,
              initSegmentReference,
              /* timestampOffset= */ gapAtStart,
              /* appendWindowStart= */ 0,
              /* appendWindowEnd= */ Infinity));

          i++;
          time = end;
        }
        return new shaka.media.SegmentIndex(refs);
      }

      function createInit(type) {
        const getUris = () => {
          return ['0_' + type + '_init'];
        };
        return new shaka.media.InitSegmentReference(getUris, 0, null);
      }

      const videoInit = createInit('video');
      const videoIndex = createIndex('video', videoInit);
      const audioInit = createInit('audio');
      const audioIndex = createIndex('audio', audioInit);

      return {
        presentationTimeline: timeline,
        offlineSessionIds: [],
        minBufferTime: 2,
        textStreams: [],
        imageStreams: [],
        sequenceMode: false,
        ignoreManifestTimestampsInSegmentsMode: false,
        type: 'UNKNOWN',
        serviceDescription: null,
        variants: [{
          id: 1,
          video: {
            id: 2,
            createSegmentIndex: () => Promise.resolve(),
            segmentIndex: videoIndex,
            mimeType: 'video/mp4',
            codecs: 'avc1.42c01e',
            bandwidth: 5000000,
            width: 600,
            height: 400,
            type: shaka.util.ManifestParserUtils.ContentType.VIDEO,
            drmInfos: [],
          },
          audio: {
            id: 3,
            createSegmentIndex: () => Promise.resolve(),
            segmentIndex: audioIndex,
            mimeType: 'audio/mp4',
            codecs: 'mp4a.40.2',
            bandwidth: 192000,
            type: shaka.util.ManifestParserUtils.ContentType.AUDIO,
            drmInfos: [],
          },
        }],
      };
    }
  });
});
