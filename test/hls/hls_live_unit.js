/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('HlsParser live', () => {
  const ManifestParser = shaka.test.ManifestParser;

  const master = [
    '#EXTM3U\n',
    '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1",',
    'RESOLUTION=960x540,FRAME-RATE=60\n',
    'video\n',
  ].join('');

  /** @type {!shaka.test.FakeNetworkingEngine} */
  let fakeNetEngine;
  /** @type {!shaka.hls.HlsParser} */
  let parser;
  /** @type {shaka.extern.ManifestParser.PlayerInterface} */
  let playerInterface;
  /** @type {shaka.extern.ManifestConfiguration} */
  let config;
  /** @type {!Uint8Array} */
  let initSegmentData;
  /** @type {!Uint8Array} */
  let segmentData;
  /** @type {!Uint8Array} */
  let selfInitializingSegmentData;

  beforeEach(() => {
    // TODO: use StreamGenerator?
    initSegmentData = new Uint8Array([
      0x00, 0x00, 0x00, 0x30, // size (48)
      0x6D, 0x6F, 0x6F, 0x76, // type (moov)
      0x00, 0x00, 0x00, 0x28, // trak size (40)
      0x74, 0x72, 0x61, 0x6B, // type (trak)
      0x00, 0x00, 0x00, 0x20, // mdia size (32)
      0x6D, 0x64, 0x69, 0x61, // type (mdia)

      0x00, 0x00, 0x00, 0x18, // mdhd size (24)
      0x6D, 0x64, 0x68, 0x64, // type (mdhd)
      0x00, 0x00, 0x00, 0x00, // version and flags

      0x00, 0x00, 0x00, 0x00, // creation time (0)
      0x00, 0x00, 0x00, 0x00, // modification time (0)
      0x00, 0x00, 0x03, 0xe8, // timescale (1000)
    ]);
    segmentData = new Uint8Array([
      0x00, 0x00, 0x00, 0x24, // size (36)
      0x6D, 0x6F, 0x6F, 0x66, // type (moof)
      0x00, 0x00, 0x00, 0x1C, // traf size (28)
      0x74, 0x72, 0x61, 0x66, // type (traf)
      0x00, 0x00, 0x00, 0x14, // tfdt size (20)
      0x74, 0x66, 0x64, 0x74, // type (tfdt)
      0x01, 0x00, 0x00, 0x00, // version and flags
      0x00, 0x00, 0x00, 0x00, // baseMediaDecodeTime first 4 bytes
      0x00, 0x00, 0x07, 0xd0,  // baseMediaDecodeTime last 4 bytes (2000)
    ]);

    selfInitializingSegmentData =
        shaka.util.Uint8ArrayUtils.concat(initSegmentData, segmentData);

    fakeNetEngine = new shaka.test.FakeNetworkingEngine();

    config = shaka.util.PlayerConfiguration.createDefault().manifest;
    playerInterface = {
      modifyManifestRequest: (request, manifestInfo) => {},
      modifySegmentRequest: (request, segmentInfo) => {},
      filter: () => Promise.resolve(),
      makeTextStreamsForClosedCaptions: (manifest) => {},
      networkingEngine: fakeNetEngine,
      onError: fail,
      onEvent: fail,
      onTimelineRegionAdded: fail,
      isLowLatencyMode: () => false,
      isAutoLowLatencyMode: () => false,
      enableLowLatencyMode: () => {},
    };

    parser = new shaka.hls.HlsParser();
    parser.configure(config);
  });

  afterEach(() => {
    // HLS parser stop is synchronous.
    parser.stop();
  });

  /**
   * Trigger a manifest update.
   * @suppress {accessControls}
   */
  async function delayForUpdatePeriod() {
    parser.updatePlaylistTimer_.tickNow();
    await shaka.test.Util.shortDelay();  // Allow update to finish.
  }

  /**
   * @param {string} master
   * @param {string} initialMedia
   * @param {!Array} initialReferences
   * @param {string} updatedMedia
   * @param {!Array} updatedReferences
   */
  async function testUpdate(
      master, initialMedia, initialReferences, updatedMedia,
      updatedReferences) {
    fakeNetEngine
        .setResponseText('test:/master', master)
        .setResponseText('test:/video', initialMedia)
        .setResponseText('test:/redirected/video', initialMedia)
        .setResponseText('test:/video2', initialMedia)
        .setResponseText('test:/audio', initialMedia)
        .setResponseValue('test:/init.mp4', initSegmentData)
        .setResponseValue('test:/main.mp4', segmentData)
        .setResponseValue('test:/main2.mp4', segmentData)
        .setResponseValue('test:/main3.mp4', segmentData)
        .setResponseValue('test:/main4.mp4', segmentData)
        .setResponseValue('test:/selfInit.mp4', selfInitializingSegmentData);

    const manifest = await parser.start('test:/master', playerInterface);

    await Promise.all(manifest.variants.map(async (variant) => {
      await variant.video.createSegmentIndex();
      ManifestParser.verifySegmentIndex(variant.video, initialReferences);
      if (variant.audio) {
        await variant.audio.createSegmentIndex();
        ManifestParser.verifySegmentIndex(variant.audio, initialReferences);
      }
    }));

    // Replace the entries with the updated values.
    fakeNetEngine
        .setResponseText('test:/video', updatedMedia)
        .setResponseText('test:/redirected/video', updatedMedia)
        .setResponseText('test:/video2', updatedMedia)
        .setResponseText('test:/audio', updatedMedia)
        .setResponseText('test:/video?_HLS_skip=YES', updatedMedia);

    await delayForUpdatePeriod();
    for (const variant of manifest.variants) {
      ManifestParser.verifySegmentIndex(variant.video, updatedReferences);
      if (variant.audio) {
        ManifestParser.verifySegmentIndex(variant.audio, updatedReferences);
      }
    }
  }

  describe('playlist type EVENT', () => {
    const media = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:EVENT\n',
      '#EXT-X-TARGETDURATION:5\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:2,\n',
      'main.mp4\n',
    ].join('');

    const mediaWithAdditionalSegment = [
      '#EXTM3U\n',
      '#EXT-X-PLAYLIST-TYPE:EVENT\n',
      '#EXT-X-TARGETDURATION:5\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:2,\n',
      'main.mp4\n',
      '#EXTINF:2,\n',
      'main2.mp4\n',
    ].join('');

    it('treats already ended presentation like VOD', async () => {
      fakeNetEngine
          .setResponseText('test:/master', master)
          .setResponseText('test:/video', media + '#EXT-X-ENDLIST')
          .setResponseValue('test:/init.mp4', initSegmentData)
          .setResponseValue('test:/main.mp4', segmentData);

      const manifest = await parser.start('test:/master', playerInterface);
      expect(manifest.presentationTimeline.isLive()).toBe(false);
      expect(manifest.presentationTimeline.isInProgress()).toBe(false);
    });

    describe('update', () => {
      it('adds new segments when they appear', async () => {
        const ref1 = makeReference(
            'test:/main.mp4', 0, 2, /* syncTime= */ null);
        const ref2 = makeReference(
            'test:/main2.mp4', 2, 4, /* syncTime= */ null);

        await testUpdate(
            master, media, [ref1], mediaWithAdditionalSegment, [ref1, ref2]);
      });

      it('updates all variants', async () => {
        const secondVariant = [
          '#EXT-X-STREAM-INF:BANDWIDTH=300,CODECS="avc1",',
          'RESOLUTION=1200x940,FRAME-RATE=60\n',
          'video2',
        ].join('');

        const masterWithTwoVariants = master + secondVariant;
        const ref1 = makeReference(
            'test:/main.mp4', 0, 2, /* syncTime= */ null);
        const ref2 = makeReference(
            'test:/main2.mp4', 2, 4, /* syncTime= */ null);

        await testUpdate(
            masterWithTwoVariants, media, [ref1], mediaWithAdditionalSegment,
            [ref1, ref2]);
      });

      it('updates all streams', async () => {
        const masterlist = [
          '#EXTM3U\n',
          '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1",AUDIO="aud1",',
          'RESOLUTION=960x540,FRAME-RATE=60\n',
          'video\n',
        ].join('');
        const audio = [
          '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="eng",',
          'URI="audio"\n',
        ].join('');

        const masterWithAudio = masterlist + audio;
        const ref1 = makeReference(
            'test:/main.mp4', 0, 2, /* syncTime= */ null);
        const ref2 = makeReference(
            'test:/main2.mp4', 2, 4, /* syncTime= */ null);

        await testUpdate(
            masterWithAudio, media, [ref1], mediaWithAdditionalSegment,
            [ref1, ref2]);
      });

      it('handles multiple updates', async () => {
        const newSegment1 = [
          '#EXTINF:2,\n',
          'main2.mp4\n',
        ].join('');

        const newSegment2 = [
          '#EXTINF:2,\n',
          'main3.mp4\n',
        ].join('');

        const updatedMedia1 = media + newSegment1;
        const updatedMedia2 = updatedMedia1 + newSegment2;
        const ref1 = makeReference(
            'test:/main.mp4', 0, 2, /* syncTime= */ null);
        const ref2 = makeReference(
            'test:/main2.mp4', 2, 4, /* syncTime= */ null);
        const ref3 = makeReference(
            'test:/main3.mp4', 4, 6, /* syncTime= */ null);

        fakeNetEngine
            .setResponseText('test:/master', master)
            .setResponseText('test:/video', media)
            .setResponseValue('test:/init.mp4', initSegmentData)
            .setResponseValue('test:/main.mp4', segmentData);

        const manifest = await parser.start('test:/master', playerInterface);

        const video = manifest.variants[0].video;
        await video.createSegmentIndex();
        ManifestParser.verifySegmentIndex(video, [ref1]);

        fakeNetEngine
            .setResponseText('test:/master', master)
            .setResponseText('test:/video', updatedMedia1);

        await delayForUpdatePeriod();
        ManifestParser.verifySegmentIndex(video, [ref1, ref2]);

        fakeNetEngine
            .setResponseText('test:/master', master)
            .setResponseText('test:/video', updatedMedia2);

        await delayForUpdatePeriod();
        ManifestParser.verifySegmentIndex(video, [ref1, ref2, ref3]);
      });

      it('converts presentation to VOD when it is finished', async () => {
        fakeNetEngine
            .setResponseText('test:/master', master)
            .setResponseText('test:/video', media)
            .setResponseValue('test:/init.mp4', initSegmentData)
            .setResponseValue('test:/main.mp4', segmentData);

        const manifest = await parser.start('test:/master', playerInterface);

        expect(manifest.presentationTimeline.isLive()).toBe(true);
        fakeNetEngine
            .setResponseText('test:/master', master)
            .setResponseText('test:/video',
                mediaWithAdditionalSegment + '#EXT-X-ENDLIST\n');

        await delayForUpdatePeriod();
        expect(manifest.presentationTimeline.isLive()).toBe(false);
      });

      it('starts presentation as VOD when ENDLIST is present', async () => {
        fakeNetEngine
            .setResponseText('test:/master', master)
            .setResponseText('test:/video', media + '#EXT-X-ENDLIST')
            .setResponseValue('test:/init.mp4', initSegmentData)
            .setResponseValue('test:/main.mp4', segmentData);

        const manifest = await parser.start('test:/master', playerInterface);
        expect(manifest.presentationTimeline.isLive()).toBe(false);
      });

      it('does not throw when interrupted by stop', async () => {
        fakeNetEngine
            .setResponseText('test:/master', master)
            .setResponseText('test:/video', media)
            .setResponseValue('test:/init.mp4', initSegmentData)
            .setResponseValue('test:/main.mp4', segmentData);

        const manifest = await parser.start('test:/master', playerInterface);

        expect(manifest.presentationTimeline.isLive()).toBe(true);

        // Block the next request so that update() is still happening when we
        // call stop().
        /** @type {!shaka.util.PublicPromise} */
        const delay = fakeNetEngine.delayNextRequest();
        // Trigger an update.
        await delayForUpdatePeriod();
        // Stop the parser mid-update, but don't wait for stop to complete.
        const stopPromise = parser.stop();
        // Unblock the request.
        delay.resolve();
        // Allow update to finish.
        await shaka.test.Util.shortDelay();
        // Wait for stop to complete.
        await stopPromise;
      });
    });  // describe('update')
  });  // describe('playlist type EVENT')

  describe('playlist type LIVE', () => {
    const media = [
      '#EXTM3U\n',
      '#EXT-X-TARGETDURATION:5\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXT-X-MEDIA-SEQUENCE:0\n',
      '#EXTINF:2,\n',
      'main.mp4\n',
    ].join('');

    const mediaWithoutSequenceNumber = [
      '#EXTM3U\n',
      '#EXT-X-TARGETDURATION:5\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXTINF:2,\n',
      'main.mp4\n',
    ].join('');

    const mediaWithAdditionalSegment = [
      '#EXTM3U\n',
      '#EXT-X-TARGETDURATION:5\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXT-X-MEDIA-SEQUENCE:0\n',
      '#EXTINF:2,\n',
      'main.mp4\n',
      '#EXTINF:2,\n',
      'main2.mp4\n',
    ].join('');

    const mediaWithRemovedSegment = [
      '#EXTM3U\n',
      '#EXT-X-TARGETDURATION:5\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXT-X-MEDIA-SEQUENCE:1\n',
      '#EXTINF:2,\n',
      'main2.mp4\n',
    ].join('');

    let mediaWithManySegments = [
      '#EXTM3U\n',
      '#EXT-X-TARGETDURATION:5\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXT-X-MEDIA-SEQUENCE:0\n',
    ].join('');

    for (let i = 0; i < 1000; i++) {
      mediaWithManySegments += '#EXTINF:2,\n';
      mediaWithManySegments += 'main.mp4\n';
    }

    const mediaWithDiscontinuity = [
      '#EXTM3U\n',
      '#EXT-X-TARGETDURATION:5\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXT-X-MEDIA-SEQUENCE:0\n',
      '#EXT-X-DISCONTINUITY-SEQUENCE:30\n',
      '#EXTINF:2,\n',
      'main.mp4\n',
      '#EXT-X-DISCONTINUITY\n',
      '#EXTINF:2,\n',
      'main2.mp4\n',
    ].join('');

    const mediaWithUpdatedDiscontinuitySegment = [
      '#EXTM3U\n',
      '#EXT-X-TARGETDURATION:5\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXT-X-MEDIA-SEQUENCE:1\n',
      '#EXT-X-DISCONTINUITY-SEQUENCE:31\n',
      '#EXTINF:2,\n',
      'main2.mp4\n',
    ].join('');

    it('starts presentation as VOD when ENDLIST is present', async () => {
      fakeNetEngine
          .setResponseText('test:/master', master)
          .setResponseText('test:/video', media + '#EXT-X-ENDLIST')
          .setResponseValue('test:/init.mp4', initSegmentData)
          .setResponseValue('test:/main.mp4', segmentData);

      const manifest = await parser.start('test:/master', playerInterface);
      expect(manifest.presentationTimeline.isLive()).toBe(false);
    });

    it('does not fail on a missing sequence number', async () => {
      fakeNetEngine
          .setResponseText('test:/master', master)
          .setResponseText('test:/video', mediaWithoutSequenceNumber)
          .setResponseValue('test:/init.mp4', initSegmentData)
          .setResponseValue('test:/main.mp4', segmentData);

      await parser.start('test:/master', playerInterface);
    });

    it('sets presentation delay as configured', async () => {
      fakeNetEngine
          .setResponseText('test:/master', master)
          .setResponseText('test:/video', media)
          .setResponseValue('test:/init.mp4', initSegmentData)
          .setResponseValue('test:/main.mp4', segmentData);
      config.defaultPresentationDelay = 10;
      parser.configure(config);
      const manifest = await parser.start('test:/master', playerInterface);
      expect(manifest.presentationTimeline.getDelay()).toBe(
          config.defaultPresentationDelay);
    });

    it('sets 3 times target duration as presentation delay if not configured',
        async () => {
          fakeNetEngine
              .setResponseText('test:/master', master)
              .setResponseText('test:/video', media)
              .setResponseValue('test:/init.mp4', initSegmentData)
              .setResponseValue('test:/main.mp4', segmentData);
          const manifest = await parser.start('test:/master', playerInterface);
          expect(manifest.presentationTimeline.getDelay()).toBe(15);
        });

    it('sets presentation delay for low latency mode', async () => {
      const mediaWithLowLatency = [
        '#EXTM3U\n',
        '#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=1.8\n',
        '#EXT-X-TARGETDURATION:5\n',
        '#EXT-X-PART-INF:PART-TARGET=0.5\n',
        '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
        '#EXT-X-MEDIA-SEQUENCE:0\n',
        '#EXTINF:2,\n',
        'main.mp4\n',
      ].join('');

      fakeNetEngine
          .setResponseText('test:/master', master)
          .setResponseText('test:/video', mediaWithLowLatency)
          .setResponseValue('test:/init.mp4', initSegmentData)
          .setResponseValue('test:/main.mp4', segmentData);

      playerInterface.isLowLatencyMode = () => true;

      const manifest = await parser.start('test:/master', playerInterface);
      // Presentation delay should be the value of 'PART-HOLD-BACK' if not
      // configured.
      expect(manifest.presentationTimeline.getDelay()).toBe(1.8);
    });

    describe('availabilityWindowOverride', () => {
      async function testWindowOverride(expectedWindow) {
        fakeNetEngine
            .setResponseText('test:/master', master)
            .setResponseText('test:/video', mediaWithManySegments)
            .setResponseValue('test:/init.mp4', initSegmentData)
            .setResponseValue('test:/main.mp4', segmentData);

        const manifest = await parser.start('test:/master', playerInterface);
        expect(manifest).toBeTruthy();
        const timeline = manifest.presentationTimeline;
        expect(timeline).toBeTruthy();

        const start = timeline.getSegmentAvailabilityStart();
        const end = timeline.getSegmentAvailabilityEnd();
        expect(end - start).toBeCloseTo(expectedWindow, 1);
      }

      it('does not affect seek range if unset', async () => {
        // 15 seconds is three segment durations.
        await testWindowOverride(15);
      });

      it('overrides default seek range if set', async () => {
        config.availabilityWindowOverride = 240;
        parser.configure(config);
        await testWindowOverride(240);
      });
    });

    it('sets timestamp offset for segments with discontinuity', async () => {
      fakeNetEngine
          .setResponseText('test:/master', master)
          .setResponseText('test:/video', mediaWithDiscontinuity)
          .setResponseValue('test:/init.mp4', initSegmentData)
          .setResponseValue('test:/main.mp4', segmentData)
          .setResponseValue('test:/main2.mp4', segmentData);

      const ref1 = makeReference(
          'test:/main.mp4', 0, 2, /* syncTime= */ null,
          /* baseUri= */ '', /* startByte= */ 0, /* endByte= */ null,
          /* timestampOffset= */ 0);

      // Expect the timestamp offset to be set for the segment after the
      // EXT-X-DISCONTINUITY tag.
      const ref2 = makeReference(
          'test:/main2.mp4', 2, 4, /* syncTime= */ null,
          /* baseUri= */ '', /* startByte= */ 0, /* endByte= */ null,
          /* timestampOffset= */ 0);

      const manifest = await parser.start('test:/master', playerInterface);
      const video = manifest.variants[0].video;
      await video.createSegmentIndex();
      ManifestParser.verifySegmentIndex(video, [ref1, ref2]);
    });

    it('parses streams with partial and preload hinted segments', async () => {
      playerInterface.isLowLatencyMode = () => true;
      const mediaWithPartialSegments = [
        '#EXTM3U\n',
        '#EXT-X-TARGETDURATION:5\n',
        '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
        '#EXT-X-MEDIA-SEQUENCE:0\n',
        // ref includes partialRef, partialRef2
        // partialRef
        '#EXT-X-PART:DURATION=2,URI="partial.mp4",BYTERANGE=200@0\n',
        // partialRef2
        '#EXT-X-PART:DURATION=2,URI="partial2.mp4",BYTERANGE=230@200\n',
        '#EXTINF:4,\n',
        'main.mp4\n',
        // ref2 includes partialRef3, preloadRef
        // partialRef3
        '#EXT-X-PART:DURATION=2,URI="partial.mp4",BYTERANGE=210@0\n',
        // preloadRef
        '#EXT-X-PRELOAD-HINT:TYPE=PART,URI="partial.mp4",BYTERANGE-START=210\n',
      ].join('');

      fakeNetEngine
          .setResponseText('test:/master', master)
          .setResponseText('test:/video', mediaWithPartialSegments)
          .setResponseValue('test:/init.mp4', initSegmentData)
          .setResponseValue('test:/main.mp4', segmentData)
          .setResponseValue('test:/partial.mp4', segmentData)
          .setResponseValue('test:/partial2.mp4', segmentData);

      const partialRef = makeReference(
          'test:/partial.mp4', 0, 2, /* syncTime= */ null,
          /* baseUri= */ '', /* startByte= */ 0, /* endByte= */ 199);

      const partialRef2 = makeReference(
          'test:/partial2.mp4', 2, 4, /* syncTime= */ null,
          /* baseUri= */ '', /* startByte= */ 200, /* endByte= */ 429);

      const partialRef3 = makeReference(
          'test:/partial.mp4', 4, 6, /* syncTime= */ null,
          /* baseUri= */ '', /* startByte= */ 0, /* endByte= */ 209);

      // A preload hinted partial segment doesn't have duration information,
      // so its startTime and endTime are the same.
      const preloadRef = makeReference(
          'test:/partial.mp4', 6, 6, /* syncTime= */ null,
          /* baseUri= */ '', /* startByte= */ 210, /* endByte= */ null);

      const ref = makeReference(
          'test:/main.mp4', 0, 4, /* syncTime= */ null,
          /* baseUri= */ '', /* startByte= */ 0, /* endByte= */ 429,
          /* timestampOffset= */ 0, [partialRef, partialRef2]);

      // ref2 is not fully published yet, so it doesn't have a segment uri.
      const ref2 = makeReference(
          '', 4, 6, /* syncTime= */ null,
          /* baseUri= */ '', /* startByte= */ 0, /* endByte= */ null,
          /* timestampOffset= */ 0, [partialRef3, preloadRef]);

      const manifest = await parser.start('test:/master', playerInterface);
      const video = manifest.variants[0].video;
      await video.createSegmentIndex();
      ManifestParser.verifySegmentIndex(video, [ref, ref2]);
    });

    describe('update', () => {
      it('adds new segments when they appear', async () => {
        const ref1 = makeReference(
            'test:/main.mp4', 0, 2, /* syncTime= */ null);
        const ref2 = makeReference(
            'test:/main2.mp4', 2, 4, /* syncTime= */ null);

        await testUpdate(
            master, media, [ref1], mediaWithAdditionalSegment, [ref1, ref2]);
      });

      it('evicts removed segments', async () => {
        const ref1 = makeReference(
            'test:/main.mp4', 0, 2, /* syncTime= */ null);
        const ref2 = makeReference(
            'test:/main2.mp4', 2, 4, /* syncTime= */ null);

        await testUpdate(
            master, mediaWithAdditionalSegment, [ref1, ref2],
            mediaWithRemovedSegment, [ref2]);
      });

      it('handles updates with redirects', async () => {
        const oldRef1 = makeReference(
            'test:/main.mp4', 0, 2, /* syncTime= */ null);

        const newRef1 = makeReference(
            'test:/redirected/main.mp4', 0, 2, /* syncTime= */ null);
        const newRef2 = makeReference(
            'test:/redirected/main2.mp4', 2, 4, /* syncTime= */ null);

        let playlistFetchCount = 0;

        fakeNetEngine.setResponseFilter((type, response) => {
          // Simulate a redirect on the updated playlist by changing the
          // response URI on the second playlist fetch.
          if (response.uri == 'test:/video') {
            playlistFetchCount++;
            if (playlistFetchCount == 2) {
              response.uri = 'test:/redirected/video';
            }
          }
        });

        await testUpdate(
            master, media, [oldRef1], mediaWithAdditionalSegment,
            [newRef1, newRef2]);
      });

      it('parses start time from mp4 segments', async () => {
        fakeNetEngine
            .setResponseText('test:/master', master)
            .setResponseText('test:/video', media)
            .setResponseValue('test:/init.mp4', initSegmentData)
            .setResponseValue('test:/main.mp4', segmentData);

        const expectedRef = makeReference(
            'test:/main.mp4', 0, 2, /* syncTime= */ null);
        // In live content, we do not set timestampOffset.
        expectedRef.timestampOffset = 0;

        const manifest = await parser.start('test:/master', playerInterface);
        const video = manifest.variants[0].video;
        await video.createSegmentIndex();
        ManifestParser.verifySegmentIndex(video, [expectedRef]);
      });

      it('gets start time on update without segment request', async () => {
        fakeNetEngine
            .setResponseText('test:/master', master)
            .setResponseText('test:/video', mediaWithAdditionalSegment)
            .setResponseValue('test:/init.mp4', initSegmentData)
            .setResponseValue('test:/main.mp4', segmentData);

        const ref1 = makeReference(
            'test:/main.mp4', 0, 2, /* syncTime= */ null);

        const ref2 = makeReference(
            'test:/main2.mp4', 2, 4, /* syncTime= */ null);

        const manifest = await parser.start('test:/master', playerInterface);
        const video = manifest.variants[0].video;
        await video.createSegmentIndex();
        ManifestParser.verifySegmentIndex(video, [ref1, ref2]);

        fakeNetEngine
            .setResponseText('test:/master', master)
            .setResponseText('test:/video', mediaWithRemovedSegment)
            .setResponseValue('test:/init.mp4', initSegmentData)
            .setResponseValue('test:/main.mp4', segmentData)
            .setResponseValue('test:/main2.mp4', segmentData);

        fakeNetEngine.request.calls.reset();
        await delayForUpdatePeriod();

        ManifestParser.verifySegmentIndex(video, [ref2]);

        // Only one request was made, and it was for the playlist.
        // No segment requests were needed to get the start time.
        expect(fakeNetEngine.request).toHaveBeenCalledTimes(1);
        fakeNetEngine.expectRequest(
            'test:/video',
            shaka.net.NetworkingEngine.RequestType.MANIFEST);
      });

      it('reuses cached timestamp offset for segments with discontinuity',
          async () => {
            fakeNetEngine
                .setResponseText('test:/master', master)
                .setResponseText('test:/video', mediaWithDiscontinuity)
                .setResponseValue('test:/init.mp4', initSegmentData)
                .setResponseValue('test:/main.mp4', segmentData)
                .setResponseValue('test:/main2.mp4', segmentData);

            const ref1 = makeReference(
                'test:/main.mp4', 0, 2, /* syncTime= */ null);

            const ref2 = makeReference(
                'test:/main2.mp4', 2, 4, /* syncTime= */ null);

            const manifest =
                await parser.start('test:/master', playerInterface);

            const video = manifest.variants[0].video;
            await video.createSegmentIndex();
            ManifestParser.verifySegmentIndex(video, [ref1, ref2]);

            fakeNetEngine
                .setResponseText('test:/master', master)
                .setResponseText('test:/video',
                    mediaWithUpdatedDiscontinuitySegment)
                .setResponseValue('test:/init.mp4', initSegmentData)
                .setResponseValue('test:/main2.mp4', segmentData);

            fakeNetEngine.request.calls.reset();
            await delayForUpdatePeriod();

            ManifestParser.verifySegmentIndex(video, [ref2]);

            // Only one request should be made, and it's for the playlist.
            // Expect to use the cached timestamp offset for the main2.mp4
            // segment, without fetching the start time again.
            expect(fakeNetEngine.request).toHaveBeenCalledTimes(1);
            fakeNetEngine.expectRequest(
                'test:/video',
                shaka.net.NetworkingEngine.RequestType.MANIFEST);
            fakeNetEngine.expectNoRequest(
                'test:/main.mp4',
                shaka.net.NetworkingEngine.RequestType.SEGMENT);
          });

      it('request playlist delta updates to skip segments', async () => {
        const mediaWithDeltaUpdates = [
          '#EXTM3U\n',
          '#EXT-X-PLAYLIST-TYPE:LIVE\n',
          '#EXT-X-TARGETDURATION:5\n',
          '#EXT-X-MEDIA-SEQUENCE:0\n',
          '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
          '#EXT-X-SERVER-CONTROL:CAN-SKIP-UNTIL=60.0\n',
          '#EXTINF:2,\n',
          'main.mp4\n',
          '#EXTINF:2,\n',
          'main2.mp4\n',
        ].join('');

        const mediaWithSkippedSegments = [
          '#EXTM3U\n',
          '#EXT-X-TARGETDURATION:5\n',
          '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
          '#EXT-X-MEDIA-SEQUENCE:0\n',
          '#EXT-X-SERVER-CONTROL:CAN-SKIP-UNTIL=60.0\n',
          '#EXT-X-SKIP:SKIPPED-SEGMENTS=1\n',
          '#EXTINF:2,\n',
          'main2.mp4\n',
          '#EXTINF:2,\n',
          'main3.mp4\n',
        ].join('');

        fakeNetEngine
            .setResponseText('test:/master', master)
            .setResponseText('test:/video', mediaWithDeltaUpdates)
            .setResponseText('test:/video?_HLS_skip=YES',
                mediaWithSkippedSegments)
            .setResponseValue('test:/init.mp4', initSegmentData)
            .setResponseValue('test:/main.mp4', segmentData)
            .setResponseValue('test:/main2.mp4', segmentData)
            .setResponseValue('test:/main3.mp4', segmentData);

        playerInterface.isLowLatencyMode = () => true;
        await parser.start('test:/master', playerInterface);
        // Replace the entries with the updated values.

        fakeNetEngine.request.calls.reset();
        await delayForUpdatePeriod();

        fakeNetEngine.expectRequest(
            'test:/video?_HLS_skip=YES',
            shaka.net.NetworkingEngine.RequestType.MANIFEST);
      });


      it('skips older segments', async () => {
        const mediaWithSkippedSegments = [
          '#EXTM3U\n',
          '#EXT-X-TARGETDURATION:5\n',
          '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
          '#EXT-X-MEDIA-SEQUENCE:0\n',
          '#EXT-X-SKIP:SKIPPED-SEGMENTS=1\n',
          '#EXTINF:2,\n',
          'main2.mp4\n',
          '#EXTINF:2,\n',
          'main3.mp4\n',
        ].join('');

        playerInterface.isLowLatencyMode = () => true;
        const ref1 = makeReference(
            'test:/main.mp4', 0, 2, /* syncTime= */ null);
        const ref2 = makeReference(
            'test:/main2.mp4', 2, 4, /* syncTime= */ null);
        const ref3 = makeReference(
            'test:/main3.mp4', 4, 6, /* syncTime= */ null);
        // With 'SKIPPED-SEGMENTS', ref1 is skipped from the playlist,
        // and ref1 should be in the SegmentReferences list.
        // ref3 should be appended to the SegmentReferences list.
        await testUpdate(
            master, mediaWithAdditionalSegment, [ref1, ref2],
            mediaWithSkippedSegments, [ref1, ref2, ref3]);
      });

      it('skips older segments with discontinuity', async () => {
        const mediaWithDiscontinuity2 = [
          '#EXTM3U\n',
          '#EXT-X-PLAYLIST-TYPE:LIVE\n',
          '#EXT-X-TARGETDURATION:5\n',
          '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
          '#EXT-X-DISCONTINUITY-SEQUENCE:30\n',
          '#EXTINF:2,\n',
          'main.mp4\n',
          '#EXT-X-DISCONTINUITY\n',
          '#EXTINF:2,\n',
          'main2.mp4\n',
          '#EXTINF:2,\n',
          'main3.mp4\n',
        ].join('');

        const mediaWithSkippedSegments2 = [
          '#EXTM3U\n',
          '#EXT-X-TARGETDURATION:5\n',
          '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
          '#EXT-X-MEDIA-SEQUENCE:0\n',
          '#EXT-X-DISCONTINUITY-SEQUENCE:30\n',
          '#EXT-X-SKIP:SKIPPED-SEGMENTS=2\n',
          '#EXTINF:2,\n',
          'main3.mp4\n',
          '#EXTINF:2,\n',
          'main4.mp4\n',
        ].join('');

        playerInterface.isLowLatencyMode = () => true;

        const ref1 = makeReference(
            'test:/main.mp4', 0, 2, /* syncTime= */ null,
            /* baseUri= */ '', /* startByte= */ 0, /* endByte= */ null,
            /* timestampOffset= */ 0);

        // Expect the timestamp offset to be set for the segment after the
        // EXT-X-DISCONTINUITY tag.
        const ref2 = makeReference(
            'test:/main2.mp4', 2, 4, /* syncTime= */ null,
            /* baseUri= */ '', /* startByte= */ 0, /* endByte= */ null,
            /* timestampOffset= */ 0);

        // Expect the timestamp offset to be set for the segment, with the
        // EXT-X-DISCONTINUITY tag skipped in the playlist.
        const ref3 = makeReference(
            'test:/main3.mp4', 4, 6, /* syncTime= */ null,
            /* baseUri= */ '', /* startByte= */ 0, /* endByte= */ null,
            /* timestampOffset= */ 0);

        const ref4 = makeReference(
            'test:/main4.mp4', 6, 8, /* syncTime= */ null,
            /* baseUri= */ '', /* startByte= */ 0, /* endByte= */ null,
            /* timestampOffset= */ 0);

        // With 'SKIPPED-SEGMENTS', ref1, ref2 are skipped from the playlist,
        // and ref1,ref2 should be in the SegmentReferences list.
        // ref3,ref4 should be appended to the SegmentReferences list.
        await testUpdate(
            master, mediaWithDiscontinuity2, [ref1, ref2, ref3],
            mediaWithSkippedSegments2, [ref1, ref2, ref3, ref4]);
      });
    });  // describe('update')
  });  // describe('playlist type LIVE')

  /**
   * @param {string} uri A relative URI to http://example.com
   * @param {number} start
   * @param {number} end
   * @param {?number} syncTime
   * @param {string=} baseUri
   * @param {number=} startByte
   * @param {?number=} endByte
   * @param {number=} timestampOffset
   * @param {!Array.<!shaka.media.SegmentReference>=} partialReferences
   * @param {?string=} tilesLayout
   * @return {!shaka.media.SegmentReference}
   */
  function makeReference(uri, start, end, syncTime, baseUri, startByte, endByte,
      timestampOffset, partialReferences, tilesLayout) {
    return ManifestParser.makeReference(uri, start, end, baseUri, startByte,
        endByte, timestampOffset, partialReferences, tilesLayout, syncTime);
  }
});  // describe('HlsParser live')
