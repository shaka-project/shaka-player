/** @license
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
  /** @type {!HTMLVideoElement} */
  let video;
  let timeline;

  /** @type {!shaka.media.Playhead} */
  let playhead;
  /** @type {shaka.extern.StreamingConfiguration} */
  let config;

  let netEngine;
  /** @type {!shaka.media.MediaSourceEngine} */
  let mediaSourceEngine;
  /** @type {!shaka.media.StreamingEngine} */
  let streamingEngine;


  /** @type {shaka.extern.Variant} */
  let variant1;
  /** @type {shaka.extern.Variant} */
  let variant2;

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
  let onInitialStreamsSetup;
  /** @type {!jasmine.Spy} */
  let onStartupComplete;

  beforeAll(() => {
    video = shaka.util.Dom.createVideoElement();
    document.body.appendChild(video);

    metadata = shaka.test.TestScheme.DATA['sintel'];
    generators = {};
  });

  beforeEach(() => {
    config = shaka.util.PlayerConfiguration.createDefault().streaming;

    onChooseStreams = jasmine.createSpy('onChooseStreams');
    onCanSwitch = jasmine.createSpy('onCanSwitch');
    onInitialStreamsSetup = jasmine.createSpy('onInitialStreamsSetup');
    onStartupComplete = jasmine.createSpy('onStartupComplete');
    onError = jasmine.createSpy('onError');
    onError.and.callFake(fail);
    onEvent = jasmine.createSpy('onEvent');

    eventManager = new shaka.util.EventManager();
    mediaSourceEngine = new shaka.media.MediaSourceEngine(
        video,
        new shaka.test.FakeClosedCaptionParser(),
        new shaka.test.FakeTextDisplayer());
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

    timeline = shaka.test.StreamingEngineUtil.createFakePresentationTimeline(
        0 /* segmentAvailabilityStart */,
        60 /* segmentAvailabilityEnd */,
        60 /* presentationDuration */,
        metadata.video.segmentDuration /* maxSegmentDuration */,
        false /* isLive */);

    setupNetworkingEngine(
        0 /* firstPeriodStartTime */,
        30 /* secondPeriodStartTime */,
        60 /* presentationDuration */,
        {audio: metadata.audio.segmentDuration,
          video: metadata.video.segmentDuration});

    setupManifest(
        0 /* firstPeriodStartTime */,
        30 /* secondPeriodStartTime */,
        60 /* presentationDuration */);

    setupPlayhead();

    createStreamingEngine();
  }

  async function setupLive() {
    await createLiveStreamGenerator(
        metadata.audio,
        ContentType.AUDIO,
        20 /* timeShiftBufferDepth */);

    await createLiveStreamGenerator(
        metadata.video,
        ContentType.VIDEO,
        20 /* timeShiftBufferDepth */);

    // The generator's AST is set to 295 seconds in the past, so the live-edge
    // is at 295 - 10 seconds.
    // -10 to account for maxSegmentDuration.
    timeline = shaka.test.StreamingEngineUtil.createFakePresentationTimeline(
        275 - 10 /* segmentAvailabilityStart */,
        295 - 10 /* segmentAvailabilityEnd */,
        Infinity /* presentationDuration */,
        metadata.video.segmentDuration /* maxSegmentDuration */,
        true /* isLive */);

    setupNetworkingEngine(
        0 /* firstPeriodStartTime */,
        300 /* secondPeriodStartTime */,
        Infinity /* presentationDuration */,
        {audio: metadata.audio.segmentDuration,
          video: metadata.video.segmentDuration});

    setupManifest(
        0 /* firstPeriodStartTime */,
        300 /* secondPeriodStartTime */,
        Infinity /* presentationDuration */);
    setupPlayhead();

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
        now - 295 /* broadcastStartTime */,
        now - 295 /* availabilityStartTime */,
        timeShiftBufferDepth);
    generators[type] = generator;
    return generator.init();
  }

  function setupNetworkingEngine(firstPeriodStartTime, secondPeriodStartTime,
      presentationDuration, segmentDurations) {
    const periodStartTimes = [firstPeriodStartTime, secondPeriodStartTime];

    const boundsCheckPosition = (time, number, pos) => {
      return shaka.test.StreamingEngineUtil.boundsCheckPosition(
          periodStartTimes, presentationDuration, segmentDurations, time,
          number, pos);
    };

    const getNumSegments = (type, number) => {
      return shaka.test.StreamingEngineUtil.getNumSegments(
          periodStartTimes, presentationDuration, segmentDurations, type,
          number);
    };

    // Create the fake NetworkingEngine. Note: the StreamingEngine should never
    // request a segment that does not exist.
    netEngine = shaka.test.StreamingEngineUtil.createFakeNetworkingEngine(
        // Init segment generator:
        (type, periodNumber) => {
          expect(periodNumber).toBeLessThan(periodStartTimes.length + 1);
          const wallClockTime = Date.now() / 1000;
          const segment = generators[type].getInitSegment(wallClockTime);
          expect(segment).not.toBeNull();
          return segment;
        },
        // Media segment generator:
        (type, periodNumber, position) => {
          expect(boundsCheckPosition(type, periodNumber, position))
              .not.toBeNull();

          // Compute the total number of segments in all Periods before the
          // |periodNumber|'th one.
          let numPriorSegments = 0;
          for (let n = 1; n < periodNumber; ++n) {
            numPriorSegments += getNumSegments(type, n);
          }

          const wallClockTime = Date.now() / 1000;

          const segment = generators[type].getSegment(
              position, numPriorSegments, wallClockTime);
          expect(segment).not.toBeNull();
          return segment;
        });
  }

  function setupPlayhead() {
    const onSeek = () => {
      streamingEngine.seeked();
    };
    playhead = new shaka.media.MediaSourcePlayhead(
        /** @type {!HTMLVideoElement} */(video),
        manifest,
        config,
        null /* startTime */,
        onSeek,
        shaka.test.Util.spyFunc(onEvent));
  }

  function setupManifest(
      firstPeriodStartTime, secondPeriodStartTime, presentationDuration) {
    manifest = shaka.test.StreamingEngineUtil.createManifest(
        [firstPeriodStartTime, secondPeriodStartTime], presentationDuration,
        /* segmentDurations */ {
          audio: metadata.audio.segmentDuration,
          video: metadata.video.segmentDuration,
        },
        /* initSegmentRanges */ {
          audio: [0, null],
          video: [0, null],
        });

    manifest.presentationTimeline =
      /** @type {!shaka.media.PresentationTimeline} */ (timeline);
    manifest.minBufferTime = 2;

    variant1 = manifest.periods[0].variants[0];
    variant2 = manifest.periods[1].variants[0];
  }

  function createStreamingEngine() {
    const playerInterface = {
      getPresentationTime: () => playhead.getTime(),
      getBandwidthEstimate: () => 1e6,
      mediaSourceEngine: mediaSourceEngine,
      netEngine: /** @type {!shaka.net.NetworkingEngine} */(netEngine),
      onChooseStreams: Util.spyFunc(onChooseStreams),
      onCanSwitch: Util.spyFunc(onCanSwitch),
      onError: Util.spyFunc(onError),
      onEvent: Util.spyFunc(onEvent),
      onManifestUpdate: () => {},
      onSegmentAppended: () => playhead.notifyOfBufferingChange(),
      onInitialStreamsSetup: Util.spyFunc(onInitialStreamsSetup),
      onStartupComplete: Util.spyFunc(onStartupComplete),
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
      onStartupComplete.and.callFake(() => {
        video.play();
      });

      // Let's go!
      onChooseStreams.and.callFake(defaultOnChooseStreams);
      await streamingEngine.start();
      await reachesTheEnd();
    });

    it('plays at high playback rates', async () => {
      let startupComplete = false;

      onStartupComplete.and.callFake(() => {
        startupComplete = true;
        video.play();
        video.playbackRate = 10;
      });

      // Let's go!
      onChooseStreams.and.callFake(defaultOnChooseStreams);
      await streamingEngine.start();
      await reachesTheEnd();
      expect(startupComplete).toBe(true);
    });

    it('can handle buffered seeks', async () => {
      onStartupComplete.and.callFake(() => {
        video.play();
      });

      // Let's go!
      onChooseStreams.and.callFake(defaultOnChooseStreams);
      await streamingEngine.start();

      // After 35 seconds seek back 10 seconds into the first Period.
      await passesTime(35);
      video.currentTime = 25;
      await reachesTheEnd();
    });

    it('can handle unbuffered seeks', async () => {
      onStartupComplete.and.callFake(() => {
        video.play();
      });

      // Let's go!
      onChooseStreams.and.callFake(defaultOnChooseStreams);
      await streamingEngine.start();
      await passesTime(20);
      video.currentTime = 40;
      await reachesTheEnd();
    });
  });

  describe('Live', () => {
    let slideSegmentAvailabilityWindow;

    beforeEach(async () => {
      await setupLive();
      slideSegmentAvailabilityWindow = window.setInterval(() => {
        timeline.segmentAvailabilityStart++;
        timeline.segmentAvailabilityEnd++;
      }, 1000);
    });

    afterEach(() => {
      window.clearInterval(slideSegmentAvailabilityWindow);
    });

    it('plays through Period transition', async () => {
      onStartupComplete.and.callFake(() => {
        // firstSegmentNumber =
        //   [(segmentAvailabilityEnd - rebufferingGoal) / segmentDuration] + 1
        // Then -1 to account for drift safe buffering.
        const segmentType = shaka.net.NetworkingEngine.RequestType.SEGMENT;
        netEngine.expectRequest('1_video_28', segmentType);
        netEngine.expectRequest('1_audio_28', segmentType);
        video.play();
      });

      // Let's go!
      onChooseStreams.and.callFake(defaultOnChooseStreams);
      await streamingEngine.start();
      await passesTime(305);
    });

    it('can handle seeks ahead of availability window', async () => {
      const startUpCompleted = new Promise((resolve) => {
        onStartupComplete.and.callFake(() => {
          video.play();
          resolve();
        });
      });

      // Let's go!
      onChooseStreams.and.callFake(defaultOnChooseStreams);
      await streamingEngine.start();

      await startUpCompleted;
      // Seek outside the availability window right away. The playhead
      // should adjust the video's current time.
      video.currentTime = timeline.segmentAvailabilityEnd + 120;

      // Wait until the repositioning is complete so we don't
      // immediately hit this case.
      await shaka.test.Util.delay(/* seconds= */ 1);
      await passesTime(305);
    });

    it('can handle seeks behind availability window', async () => {
      onStartupComplete.and.callFake(() => {
        video.play();

        // Use setTimeout to ensure the playhead has performed it's initial
        // seeking.
        setTimeout(() => {
          // Seek outside the availability window right away. The playhead
          // should adjust the video's current time.
          video.currentTime = timeline.segmentAvailabilityStart - 120;
          expect(video.currentTime).toBeGreaterThan(0);
        }, 50);
      });

      let seekCount = 0;
      eventManager.listen(video, 'seeking', () => {
        seekCount++;
      });

      // Let's go!
      onChooseStreams.and.callFake(defaultOnChooseStreams);
      await streamingEngine.start();
      await passesTime(305);

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
      expect(seekCount).toBeGreaterThan(2);
      expect(seekCount).toBeLessThan(6);
    });
  });

  // This tests gaps created by missing segments.
  // TODO: Consider also adding tests for missing frames.
  describe('gap jumping', () => {
    it('jumps small gaps at the beginning', async () => {
      config.smallGapLimit = 5;
      await setupGappyContent(/* gapAtStart */ 1, /* dropSegment */ false);
      onStartupComplete.and.callFake(() => {
        expect(video.buffered.length).toBeGreaterThan(0);
        expect(video.buffered.start(0)).toBeCloseTo(1);

        video.play();
      });

      // Let's go!
      onChooseStreams.and.callFake(defaultOnChooseStreams);
      await streamingEngine.start();
      await passesTime(5);
    });

    it('jumps large gaps at the beginning', async () => {
      config.smallGapLimit = 1;
      config.jumpLargeGaps = true;
      await setupGappyContent(/* gapAtStart */ 5, /* dropSegment */ false);
      onStartupComplete.and.callFake(() => {
        expect(video.buffered.length).toBeGreaterThan(0);
        expect(video.buffered.start(0)).toBeCloseTo(5);

        video.play();
      });

      // Let's go!
      onChooseStreams.and.callFake(defaultOnChooseStreams);
      await streamingEngine.start();
      await passesTime(8);
    });

    it('jumps small gaps in the middle', async () => {
      config.smallGapLimit = 20;
      await setupGappyContent(/* gapAtStart */ 0, /* dropSegment */ true);
      onStartupComplete.and.callFake(() => {
        video.currentTime = 8;
        video.play();
      });

      // Let's go!
      onChooseStreams.and.callFake(defaultOnChooseStreams);
      await streamingEngine.start();
      await passesTime(23);
      // Should be close enough to still have the gap buffered.
      expect(video.buffered.length).toBe(2);
      expect(onEvent).not.toHaveBeenCalled();
    });

    it('jumps large gaps in the middle', async () => {
      config.jumpLargeGaps = true;
      await setupGappyContent(/* gapAtStart */ 0, /* dropSegment */ true);
      onStartupComplete.and.callFake(() => {
        video.currentTime = 8;
        video.play();
      });

      // Let's go!
      onChooseStreams.and.callFake(defaultOnChooseStreams);
      await streamingEngine.start();
      await passesTime(23);
      // Should be close enough to still have the gap buffered.
      expect(video.buffered.length).toBe(2);
      expect(onEvent).toHaveBeenCalled();
    });

    it('won\'t jump large gaps with preventDefault()', async () => {
      config.jumpLargeGaps = true;
      await setupGappyContent(/* gapAtStart */ 0, /* dropSegment */ true);
      onStartupComplete.and.callFake(() => {
        video.currentTime = 8;
        video.play();
      });

      onEvent.and.callFake((event) => {
        event.preventDefault();
      });

      // Let's go!
      onChooseStreams.and.callFake(defaultOnChooseStreams);
      await streamingEngine.start();

      await shaka.test.Util.delay(5);
      // IE/Edge somehow plays inside the gap.  Just make sure we
      // don't jump the gap.
      expect(video.currentTime).toBeLessThan(20);
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

      timeline =
          shaka.test.StreamingEngineUtil.createFakePresentationTimeline(
              0 /* segmentAvailabilityStart */,
              30 /* segmentAvailabilityEnd */,
              30 /* presentationDuration */,
              metadata.video.segmentDuration /* maxSegmentDuration */,
              false /* isLive */);

      setupNetworkingEngine(
          0 /* firstPeriodStartTime */,
          30 /* secondPeriodStartTime */,
          30 /* presentationDuration */,
          {
            audio: metadata.audio.segmentDuration,
            video: metadata.video.segmentDuration,
          });

      manifest = setupGappyManifest(gapAtStart, dropSegment);
      variant1 = manifest.periods[0].variants[0];

      setupPlayhead();
      createStreamingEngine();
    }

    /**
     * TODO: Consolidate with StreamingEngineUtils.createManifest?
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
        let i = 1;
        let time = gapAtStart;
        while (time < 30) {
          let end = time + d;
          // Make segment 1 longer to make the manifest continuous, despite the
          // dropped segment.
          if (i == 1 && dropSegment) {
            end += d;
          }

          let cur = i;
          const getUris = () => {
            // The times in the media are based on the URL; so to drop a
            // segment, we change the URL.
            if (cur >= 2 && dropSegment) {
              cur++;
            }
            return ['1_' + type + '_' + cur];
          };
          refs.push(new shaka.media.SegmentReference(
              /* position */ i,
              /* startTime */ time,
              /* endTime */ end,
              getUris,
              /* startByte */ 0,
              /* endByte */ null,
              initSegmentReference,
              // Normally PTO adjusts the segment time backwards; so to make the
              // segment appear in the future, use a negative.
              /* presentationTimeOffset */ -gapAtStart));

          i++;
          time = end;
        }
        return new shaka.media.SegmentIndex(refs);
      }

      function createInit(type) {
        const getUris = () => {
          return ['1_' + type + '_init'];
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
        periods: [{
          startTime: 0,
          textStreams: [],
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
            },
            audio: {
              id: 3,
              createSegmentIndex: () => Promise.resolve(),
              segmentIndex: audioIndex,
              mimeType: 'audio/mp4',
              codecs: 'mp4a.40.2',
              bandwidth: 192000,
              type: shaka.util.ManifestParserUtils.ContentType.AUDIO,
            },
          }],
        }],
      };
    }
  });

  /**
   * Choose streams for the given period.
   *
   * @param {shaka.extern.Period} period
   * @return {!Object.<string, !shaka.extern.Stream>}
   */
  function defaultOnChooseStreams(period) {
    if (period == manifest.periods[0]) {
      return {variant: variant1, text: null};
    } else if (period == manifest.periods[1]) {
      return {variant: variant2, text: null};
    } else {
      throw new Error();
    }
  }

  /**
   * @param {number} seconds
   * @return {!Promise}
   */
  function passesTime(seconds) {
    return new Promise((resolve) => {
      eventManager.listen(video, 'timeupdate', () => {
        if (video.currentTime >= seconds) {
          resolve();
        }
      });
    });
  }

  /**
   * @return {!Promise}
   */
  function reachesTheEnd() {
    // Safari has a bug where it sometimes doesn't fire the 'ended' event,
    // so use 'timeupdate' instead.
    return new Promise((resolve) => {
      eventManager.listen(video, 'timeupdate', () => {
        if (video.ended) {
          resolve();
        }
      });
    });
  }
});
