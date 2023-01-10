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
      updateDuration: () => {},
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
   * @param {Array=} initialReferences
   * @return {!Promise.<shaka.extern.Manifest>}
   */
  async function testInitialManifest(
      master, initialMedia, initialReferences=null) {
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
        .setResponseValue('test:/partial.mp4', segmentData)
        .setResponseValue('test:/partial2.mp4', segmentData)
        .setResponseValue('test:/selfInit.mp4', selfInitializingSegmentData);

    const manifest = await parser.start('test:/master', playerInterface);

    if (initialReferences) {
      await Promise.all(manifest.variants.map(async (variant) => {
        await variant.video.createSegmentIndex();

        // The compiler doesn't count null checks done outside this callback,
        // so we need an assertion here.
        goog.asserts.assert(initialReferences != null, 'references non-null');
        ManifestParser.verifySegmentIndex(variant.video, initialReferences);

        if (variant.audio) {
          await variant.audio.createSegmentIndex();
          ManifestParser.verifySegmentIndex(variant.audio, initialReferences);
        }
      }));
    }

    return manifest;
  }

  /**
   * @param {shaka.extern.Manifest} manifest
   * @param {string} updatedMedia
   * @param {Array=} updatedReferences
   */
  async function testUpdate(manifest, updatedMedia, updatedReferences=null) {
    // Replace the entries with the updated values.
    fakeNetEngine
        .setResponseText('test:/video', updatedMedia)
        .setResponseText('test:/redirected/video', updatedMedia)
        .setResponseText('test:/video2', updatedMedia)
        .setResponseText('test:/audio', updatedMedia);

    await delayForUpdatePeriod();

    if (updatedReferences) {
      for (const variant of manifest.variants) {
        ManifestParser.verifySegmentIndex(variant.video, updatedReferences);
        if (variant.audio) {
          ManifestParser.verifySegmentIndex(variant.audio, updatedReferences);
        }
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
      const manifest = await testInitialManifest(
          master, media + '#EXT-X-ENDLIST');
      expect(manifest.presentationTimeline.isLive()).toBe(false);
      expect(manifest.presentationTimeline.isInProgress()).toBe(false);
    });

    describe('update', () => {
      it('adds new segments when they appear', async () => {
        const ref1 = makeReference(
            'test:/main.mp4', 0, 2, /* syncTime= */ null);
        const ref2 = makeReference(
            'test:/main2.mp4', 2, 4, /* syncTime= */ null);

        const manifest = await testInitialManifest(master, media, [ref1]);
        await testUpdate(manifest, mediaWithAdditionalSegment, [ref1, ref2]);
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

        const manifest = await testInitialManifest(
            masterWithTwoVariants, media, [ref1]);
        await testUpdate(manifest, mediaWithAdditionalSegment, [ref1, ref2]);
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

        const manifest = await testInitialManifest(
            masterWithAudio, media, [ref1]);
        await testUpdate(manifest, mediaWithAdditionalSegment, [ref1, ref2]);
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

        const manifest = await testInitialManifest(master, media, [ref1]);
        await testUpdate(manifest, updatedMedia1, [ref1, ref2]);
        await testUpdate(manifest, updatedMedia2, [ref1, ref2, ref3]);
      });

      it('converts presentation to VOD when it is finished', async () => {
        const manifest = await testInitialManifest(master, media);
        expect(manifest.presentationTimeline.isLive()).toBe(true);

        await testUpdate(
            manifest, mediaWithAdditionalSegment + '#EXT-X-ENDLIST\n');
        expect(manifest.presentationTimeline.isLive()).toBe(false);
      });

      it('starts presentation as VOD when ENDLIST is present', async () => {
        const manifest = await testInitialManifest(
            master, media + '#EXT-X-ENDLIST');
        expect(manifest.presentationTimeline.isLive()).toBe(false);
      });

      it('does not throw when interrupted by stop', async () => {
        const manifest = await testInitialManifest(master, media);
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

      it('calls notifySegments on each update', async () => {
        const manifest = await testInitialManifest(master, media);
        const notifySegmentsSpy = spyOn(
            manifest.presentationTimeline, 'notifySegments').and.callThrough();

        // Trigger an update.
        await delayForUpdatePeriod();

        expect(notifySegmentsSpy).toHaveBeenCalled();
        notifySegmentsSpy.calls.reset();

        // Trigger another update.
        await delayForUpdatePeriod();

        expect(notifySegmentsSpy).toHaveBeenCalled();
      });

      it('converts to VOD only after all playlists end', async () => {
        const master = [
          '#EXTM3U\n',
          '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",LANGUAGE="eng",',
          'URI="audio"\n',
          '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1",AUDIO="aud1",',
          'RESOLUTION=960x540,FRAME-RATE=60\n',
          'video\n',
        ].join('');

        const mediaWithEndList = media + '#EXT-X-ENDLIST';

        const manifest = await testInitialManifest(master, media);
        expect(manifest.presentationTimeline.isLive()).toBe(true);

        // Update video only.
        fakeNetEngine.setResponseText('test:/video', mediaWithEndList);
        await delayForUpdatePeriod();

        // Audio hasn't "ended" yet, so we're still live.
        expect(manifest.presentationTimeline.isLive()).toBe(true);

        // Update audio.
        fakeNetEngine.setResponseText('test:/audio', mediaWithEndList);
        await delayForUpdatePeriod();

        // Now both have "ended", so we're no longer live.
        expect(manifest.presentationTimeline.isLive()).toBe(false);
      });

      it('stops updating after all playlists end', async () => {
        const manifest = await testInitialManifest(master, media);
        expect(manifest.presentationTimeline.isLive()).toBe(true);

        fakeNetEngine.request.calls.reset();
        await testUpdate(
            manifest, mediaWithAdditionalSegment + '#EXT-X-ENDLIST\n');

        // We saw one request for the video playlist, which signalled "ENDLIST".
        fakeNetEngine.expectRequest(
            'test:/video',
            shaka.net.NetworkingEngine.RequestType.MANIFEST);
        expect(manifest.presentationTimeline.isLive()).toBe(false);

        fakeNetEngine.request.calls.reset();
        await delayForUpdatePeriod();

        // No new updates were requested.
        expect(fakeNetEngine.request).not.toHaveBeenCalled();
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
      const manifest = await testInitialManifest(
          master, media + '#EXT-X-ENDLIST');
      expect(manifest.presentationTimeline.isLive()).toBe(false);
    });

    it('does not fail on a missing sequence number', async () => {
      await testInitialManifest(master, mediaWithoutSequenceNumber);
    });

    it('sets presentation delay as configured', async () => {
      config.defaultPresentationDelay = 10;
      parser.configure(config);

      const manifest = await testInitialManifest(master, media);
      expect(manifest.presentationTimeline.getDelay()).toBe(
          config.defaultPresentationDelay);
    });

    it('sets 3 times target duration as presentation delay if not configured',
        async () => {
          const manifest = await testInitialManifest(master, media);
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

      playerInterface.isLowLatencyMode = () => true;

      const manifest = await testInitialManifest(master, mediaWithLowLatency);
      // Presentation delay should be the value of 'PART-HOLD-BACK' if not
      // configured.
      expect(manifest.presentationTimeline.getDelay()).toBe(1.8);
    });

    describe('availabilityWindowOverride', () => {
      async function testWindowOverride(expectedWindow) {
        const manifest = await testInitialManifest(
            master, mediaWithManySegments);
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

    it('sets discontinuity sequence numbers', async () => {
      const ref1 = makeReference(
          'test:/main.mp4', 0, 2, /* syncTime= */ null,
          /* baseUri= */ '', /* startByte= */ 0, /* endByte= */ null,
          /* timestampOffset= */ 0);
      ref1.discontinuitySequence = 30;

      const ref2 = makeReference(
          'test:/main2.mp4', 2, 4, /* syncTime= */ null,
          /* baseUri= */ '', /* startByte= */ 0, /* endByte= */ null,
          /* timestampOffset= */ 0);
      ref2.discontinuitySequence = 31;

      const manifest = await testInitialManifest(
          master, mediaWithDiscontinuity, [ref1, ref2]);

      await testUpdate(
          manifest, mediaWithUpdatedDiscontinuitySegment, [ref2]);
    });

    // Test for https://github.com/shaka-project/shaka-player/issues/4223
    it('parses streams with partial and preload hinted segments', async () => {
      playerInterface.isLowLatencyMode = () => true;
      const mediaWithPartialSegments = [
        '#EXTM3U\n',
        '#EXT-X-TARGETDURATION:5\n',
        '#EXT-X-PART-INF:PART-TARGET=1.5\n',
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

      const partialRef = makeReference(
          'test:/partial.mp4', 0, 2, /* syncTime= */ null,
          /* baseUri= */ '', /* startByte= */ 0, /* endByte= */ 199);

      const partialRef2 = makeReference(
          'test:/partial2.mp4', 2, 4, /* syncTime= */ null,
          /* baseUri= */ '', /* startByte= */ 200, /* endByte= */ 429);

      const ref = makeReference(
          'test:/main.mp4', 0, 4, /* syncTime= */ null,
          /* baseUri= */ '', /* startByte= */ 0, /* endByte= */ 429,
          /* timestampOffset= */ 0, [partialRef, partialRef2]);

      const partialRef3 = makeReference(
          'test:/partial.mp4', 4, 6, /* syncTime= */ null,
          /* baseUri= */ '', /* startByte= */ 0, /* endByte= */ 209);

      const preloadRef = makeReference(
          'test:/partial.mp4', 6, 7.5, /* syncTime= */ null,
          /* baseUri= */ '', /* startByte= */ 210, /* endByte= */ null);

      // ref2 is not fully published yet, so it doesn't have a segment uri.
      const ref2 = makeReference(
          '', 4, 7.5, /* syncTime= */ null,
          /* baseUri= */ '', /* startByte= */ 0, /* endByte= */ null,
          /* timestampOffset= */ 0, [partialRef3, preloadRef]);

      await testInitialManifest(master, mediaWithPartialSegments, [ref, ref2]);
    });

    // Test for https://github.com/shaka-project/shaka-player/issues/4223
    it('ignores preload hinted segments without target duration', async () => {
      playerInterface.isLowLatencyMode = () => true;

      // Missing PART-TARGET, so preload hints are skipped.
      const mediaWithPartialSegments = [
        '#EXTM3U\n',
        '#EXT-X-TARGETDURATION:5\n',
        '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
        '#EXT-X-MEDIA-SEQUENCE:0\n',
        '#EXTINF:4,\n',
        // ref1
        'main.mp4\n',
        // ref2 includes partialRef, but not preloadRef
        // partialRef
        '#EXT-X-PART:DURATION=2,URI="partial.mp4",BYTERANGE=210@0\n',
        // preloadRef
        '#EXT-X-PRELOAD-HINT:TYPE=PART,URI="partial.mp4",BYTERANGE-START=210\n',
      ].join('');

      const ref = makeReference(
          'test:/main.mp4', 0, 4, /* syncTime= */ null,
          /* baseUri= */ '', /* startByte= */ 0, /* endByte= */ null,
          /* timestampOffset= */ 0, []);

      const partialRef = makeReference(
          'test:/partial.mp4', 4, 6, /* syncTime= */ null,
          /* baseUri= */ '', /* startByte= */ 0, /* endByte= */ 209);

      // ref2 is not fully published yet, so it doesn't have a segment uri.
      const ref2 = makeReference(
          '', 4, 6, /* syncTime= */ null,
          /* baseUri= */ '', /* startByte= */ 0, /* endByte= */ 209,
          /* timestampOffset= */ 0, [partialRef]);

      await testInitialManifest(master, mediaWithPartialSegments, [ref, ref2]);
    });

    // Test for https://github.com/shaka-project/shaka-player/issues/4185
    it('does not fail on preload hints with LL mode off', async () => {
      // LL mode must be off for this test!
      playerInterface.isLowLatencyMode = () => false;

      const mediaWithPartialSegments = [
        '#EXTM3U\n',
        '#EXT-X-TARGETDURATION:5\n',
        '#EXT-X-PART-INF:PART-TARGET=1.5\n',
        '#EXTINF:4,\n',
        'main.mp4\n',
        '#EXT-X-PART:DURATION=2,URI="partial.mp4",BYTERANGE=210@0\n',
        '#EXT-X-PRELOAD-HINT:TYPE=PART,URI="partial.mp4",BYTERANGE-START=210\n',
      ].join('');

      // If this throws, the test fails.  Otherwise, it passes.
      await testInitialManifest(master, mediaWithPartialSegments);
    });

    describe('update', () => {
      it('adds new segments when they appear', async () => {
        const ref1 = makeReference(
            'test:/main.mp4', 0, 2, /* syncTime= */ null);
        const ref2 = makeReference(
            'test:/main2.mp4', 2, 4, /* syncTime= */ null);

        const manifest = await testInitialManifest(master, media, [ref1]);
        await testUpdate(manifest, mediaWithAdditionalSegment, [ref1, ref2]);
      });

      it('evicts removed segments', async () => {
        const ref1 = makeReference(
            'test:/main.mp4', 0, 2, /* syncTime= */ null);
        const ref2 = makeReference(
            'test:/main2.mp4', 2, 4, /* syncTime= */ null);

        const manifest = await testInitialManifest(
            master, mediaWithAdditionalSegment, [ref1, ref2]);
        await testUpdate(manifest, mediaWithRemovedSegment, [ref2]);
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

        const manifest = await testInitialManifest(master, media, [oldRef1]);
        await testUpdate(
            manifest, mediaWithAdditionalSegment, [newRef1, newRef2]);
      });

      it('parses start time from mp4 segments', async () => {
        const ref = makeReference(
            'test:/main.mp4', 0, 2, /* syncTime= */ null);
        // In live content, we do not set timestampOffset.
        ref.timestampOffset = 0;

        await testInitialManifest(master, media, [ref]);
      });

      it('gets start time on update without segment request', async () => {
        const ref1 = makeReference(
            'test:/main.mp4', 0, 2, /* syncTime= */ null);

        const ref2 = makeReference(
            'test:/main2.mp4', 2, 4, /* syncTime= */ null);

        const manifest = await testInitialManifest(
            master, mediaWithAdditionalSegment, [ref1, ref2]);

        fakeNetEngine.request.calls.reset();
        await testUpdate(manifest, mediaWithRemovedSegment, [ref2]);

        // Only one request was made, and it was for the playlist.
        // No segment requests were needed to get the start time.
        expect(fakeNetEngine.request).toHaveBeenCalledTimes(1);
        fakeNetEngine.expectRequest(
            'test:/video',
            shaka.net.NetworkingEngine.RequestType.MANIFEST);
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

        fakeNetEngine.setResponseText(
            'test:/video?_HLS_skip=YES', mediaWithSkippedSegments);

        playerInterface.isLowLatencyMode = () => true;

        await testInitialManifest(master, mediaWithDeltaUpdates);

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

        const manifest = await testInitialManifest(
            master, mediaWithAdditionalSegment, [ref1, ref2]);

        // With 'SKIPPED-SEGMENTS', ref1 is skipped from the playlist,
        // and ref1 should be in the SegmentReferences list.
        // ref3 should be appended to the SegmentReferences list.
        await testUpdate(
            manifest, mediaWithSkippedSegments, [ref1, ref2, ref3]);
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

        const manifest = await testInitialManifest(
            master, mediaWithDiscontinuity2, [ref1, ref2, ref3]);

        // With 'SKIPPED-SEGMENTS', ref1, ref2 are skipped from the playlist,
        // and ref1,ref2 should be in the SegmentReferences list.
        // ref3,ref4 should be appended to the SegmentReferences list.
        await testUpdate(
            manifest, mediaWithSkippedSegments2, [ref1, ref2, ref3, ref4]);
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
