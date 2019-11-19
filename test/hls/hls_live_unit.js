/** @license
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
  /** @type {!Uint8Array} */
  let tsSegmentData;
  /** @type {!Uint8Array} */
  let pastRolloverSegmentData;
  /** @type {number} */
  let rolloverOffset;
  /** @type {number} */
  let segmentDataStartTime;

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
    tsSegmentData = new Uint8Array([
      0x47, // TS sync byte (fixed value)
      0x41, 0x01, // not corrupt, payload follows, packet ID 257
      0x10, // not scrambled, no adaptation field, payload only, seq #0
      0x00, 0x00, 0x01, // PES start code (fixed value)
      0xe0, // stream ID (video stream 0)
      0x00, 0x00, // PES packet length (doesn't matter)
      0x80, // marker bits (fixed value), not scrambled, not priority
      0x80, // PTS only, no DTS, other flags 0 (don't matter)
      0x05, // remaining PES header length == 5 (one timestamp)
      0x21, 0x00, 0x0b, 0x7e, 0x41, // PTS = 180000, encoded into 5 bytes
    ]);
    // 180000 divided by TS timescale (90000) = segment starts at 2s.
    segmentDataStartTime = 2;

    pastRolloverSegmentData = new Uint8Array([
      0x00, 0x00, 0x00, 0x24, // size (36)
      0x6D, 0x6F, 0x6F, 0x66, // type (moof)
      0x00, 0x00, 0x00, 0x1C, // traf size (28)
      0x74, 0x72, 0x61, 0x66, // type (traf)
      0x00, 0x00, 0x00, 0x14, // tfdt size (20)
      0x74, 0x66, 0x64, 0x74, // type (tfdt)
      0x01, 0x00, 0x00, 0x00, // version and flags
      0x00, 0x00, 0x00, 0x00, // baseMediaDecodeTime first 4 bytes
      0x0b, 0x60, 0xbc, 0x28,  // baseMediaDecodeTime last 4 bytes (190889000)
    ]);

    // The timestamp above would roll over twice, so this rollover offset should
    // be applied.
    rolloverOffset = (0x200000000 * 2) / 90000;

    selfInitializingSegmentData =
        shaka.util.Uint8ArrayUtils.concat(initSegmentData, segmentData);

    fakeNetEngine = new shaka.test.FakeNetworkingEngine();

    config = shaka.util.PlayerConfiguration.createDefault().manifest;
    playerInterface = {
      filterNewPeriod: () => {},
      filterAllPeriods: () => {},
      networkingEngine: fakeNetEngine,
      onError: fail,
      onEvent: fail,
      onTimelineRegionAdded: fail,
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
        .setResponseValue('test:/selfInit.mp4', selfInitializingSegmentData);

    const manifest = await parser.start('test:/master', playerInterface);

    /** @type {!Array.<shaka.extern.Variant>} */
    const variants = manifest.periods[0].variants;
    await Promise.all(variants.map(async (variant) => {
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
        .setResponseText('test:/audio', updatedMedia);

    await delayForUpdatePeriod();
    for (const variant of variants) {
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
        const ref1 = ManifestParser.makeReference('test:/main.mp4',
            0, 2, 4);
        const ref2 = ManifestParser.makeReference('test:/main2.mp4',
            1, 4, 6);

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
        const ref1 = ManifestParser.makeReference('test:/main.mp4',
            0, 2, 4);
        const ref2 = ManifestParser.makeReference('test:/main2.mp4',
            1, 4, 6);

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
        const ref1 = ManifestParser.makeReference('test:/main.mp4',
            0, 2, 4);
        const ref2 = ManifestParser.makeReference('test:/main2.mp4',
            1, 4, 6);

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
        const ref1 = ManifestParser.makeReference('test:/main.mp4',
            0, 2, 4);
        const ref2 = ManifestParser.makeReference('test:/main2.mp4',
            1, 4, 6);
        const ref3 = ManifestParser.makeReference('test:/main3.mp4',
            2, 6, 8);

        fakeNetEngine
            .setResponseText('test:/master', master)
            .setResponseText('test:/video', media)
            .setResponseValue('test:/init.mp4', initSegmentData)
            .setResponseValue('test:/main.mp4', segmentData);

        const manifest = await parser.start('test:/master', playerInterface);

        const video = manifest.periods[0].variants[0].video;
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

    const mediaWithByteRange = [
      '#EXTM3U\n',
      '#EXT-X-TARGETDURATION:5\n',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="616@0"\n',
      '#EXT-X-MEDIA-SEQUENCE:0\n',
      '#EXT-X-BYTERANGE:121090@616\n',
      '#EXTINF:2,\n',
      'main.mp4\n',
    ].join('');

    const expectedStartByte = 616;
    const expectedEndByte = 121705;

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
    for (const _ of shaka.util.Iterables.range(1000)) {
      shaka.util.Functional.ignored(_);
      mediaWithManySegments += '#EXTINF:2,\n';
      mediaWithManySegments += 'main.mp4\n';
    }

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
        expect(end - start).toBeCloseTo(expectedWindow, 2);
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

    it('offsets VTT text with rolled over TS timestamps', async () => {
      const masterWithVtt = [
        '#EXTM3U\n',
        '#EXT-X-MEDIA:TYPE=SUBTITLES,LANGUAGE="fra",URI="text",',
        'GROUP-ID="sub1"\n',
        '#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1",',
        'RESOLUTION=960x540,FRAME-RATE=60,SUBTITLES="sub1"\n',
        'video\n',
      ].join('');

      const textPlaylist = [
        '#EXTM3U\n',
        '#EXT-X-TARGETDURATION:5\n',
        '#EXT-X-MEDIA-SEQUENCE:0\n',
        '#EXTINF:2,\n',
        'main.vtt\n',
      ].join('');

      const vtt = [
        'WEBVTT\n',
        '\n',
        '00:00.000 --> 00:01.000\n',
        'Hello, world!\n',
      ].join('');

      fakeNetEngine
          .setResponseText('test:/master', masterWithVtt)
          .setResponseText('test:/video', media)
          .setResponseText('test:/text', textPlaylist)
          .setResponseValue('test:/init.mp4', initSegmentData)
          .setResponseValue('test:/main.mp4', pastRolloverSegmentData)
          .setResponseText('test:/main.vtt', vtt);

      const manifest = await parser.start('test:/master', playerInterface);
      const textStream = manifest.periods[0].textStreams[0];
      await textStream.createSegmentIndex();
      let ref = textStream.segmentIndex.get(0);
      expect(ref).not.toBe(null);
      expect(ref.startTime).not.toBeLessThan(rolloverOffset);

      const videoStream = manifest.periods[0].variants[0].video;
      await videoStream.createSegmentIndex();
      ref = videoStream.segmentIndex.get(0);
      expect(ref).not.toBe(null);
      expect(ref.startTime).not.toBeLessThan(rolloverOffset);
    });

    describe('update', () => {
      it('adds new segments when they appear', async () => {
        const ref1 = ManifestParser.makeReference('test:/main.mp4',
            0, 2, 4);
        const ref2 = ManifestParser.makeReference('test:/main2.mp4',
            1, 4, 6);

        await testUpdate(
            master, media, [ref1], mediaWithAdditionalSegment, [ref1, ref2]);
      });

      it('evicts removed segments', async () => {
        const ref1 = ManifestParser.makeReference('test:/main.mp4',
            0, 2, 4);
        const ref2 = ManifestParser.makeReference('test:/main2.mp4',
            1, 4, 6);

        await testUpdate(
            master, mediaWithAdditionalSegment, [ref1, ref2],
            mediaWithRemovedSegment, [ref2]);
      });

      it('handles updates with redirects', async () => {
        const oldRef1 = ManifestParser.makeReference('test:/main.mp4',
            0, 2, 4);

        const newRef1 =
            ManifestParser.makeReference('test:/redirected/main.mp4', 0, 2, 4);
        const newRef2 =
            ManifestParser.makeReference('test:/redirected/main2.mp4', 1, 4, 6);

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

        const expectedRef = ManifestParser.makeReference(
            'test:/main.mp4', 0, segmentDataStartTime,
            segmentDataStartTime + 2);

        const manifest = await parser.start('test:/master', playerInterface);
        const video = manifest.periods[0].variants[0].video;
        await video.createSegmentIndex();
        ManifestParser.verifySegmentIndex(video, [expectedRef]);

        // In live content, we do not set presentationTimeOffset.
        const ref = video.segmentIndex.get(0);
        expect(ref.presentationTimeOffset).toBe(0);
      });

      it('gets start time on update without segment request', async () => {
        fakeNetEngine
            .setResponseText('test:/master', master)
            .setResponseText('test:/video', mediaWithAdditionalSegment)
            .setResponseValue('test:/init.mp4', initSegmentData)
            .setResponseValue('test:/main.mp4', segmentData);

        const ref1 = ManifestParser.makeReference(
            'test:/main.mp4', 0, segmentDataStartTime,
            segmentDataStartTime + 2);

        const ref2 = ManifestParser.makeReference(
            'test:/main2.mp4', 1, segmentDataStartTime + 2,
            segmentDataStartTime + 4);

        const manifest = await parser.start('test:/master', playerInterface);
        const video = manifest.periods[0].variants[0].video;
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

      it('parses start time from ts segments', async () => {
        const tsMediaPlaylist =
            mediaWithRemovedSegment.replace(/\.mp4/g, '.ts');

        fakeNetEngine
            .setResponseText('test:/master', master)
            .setResponseText('test:/video', tsMediaPlaylist)
            .setResponseValue('test:/main2.ts', tsSegmentData);

        const expectedRef = ManifestParser.makeReference(
            'test:/main2.ts', 1, segmentDataStartTime,
            segmentDataStartTime + 2);

        const manifest = await parser.start('test:/master', playerInterface);
        const video = manifest.periods[0].variants[0].video;
        await video.createSegmentIndex();
        ManifestParser.verifySegmentIndex(video, [expectedRef]);

        // In live content, we do not set presentationTimeOffset.
        const ref = video.segmentIndex.get(1);
        expect(ref.presentationTimeOffset).toBe(0);
      });

      it('gets start time of segments with byte range', async () => {
        // Nit: this value is an implementation detail of the fix for #1106
        const partialEndByte = expectedStartByte + 2048 - 1;

        fakeNetEngine
            .setResponseText('test:/master', master)
            .setResponseText('test:/video', mediaWithByteRange)
            .setResponseValue('test:/init.mp4', initSegmentData)
            .setResponseValue('test:/main.mp4', segmentData);

        const expectedRef = ManifestParser.makeReference(
            'test:/main.mp4' /* uri */,
            0 /* position */,
            segmentDataStartTime /* start */,
            segmentDataStartTime + 2 /* end */,
            '' /* baseUri */,
            expectedStartByte,
            expectedEndByte);  // Complete segment reference

        const manifest = await parser.start('test:/master', playerInterface);
        const video = manifest.periods[0].variants[0].video;
        await video.createSegmentIndex();
        ManifestParser.verifySegmentIndex(video, [expectedRef]);

        // There should have been a range request for this segment to get the
        // start time.
        fakeNetEngine.expectRangeRequest(
            'test:/main.mp4',
            expectedStartByte,
            partialEndByte);  // Partial segment request
      });
    });  // describe('update')
  });  // describe('playlist type LIVE')
});  // describe('HlsParser live')
