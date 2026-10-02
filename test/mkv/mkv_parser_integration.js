/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('MkvParser integration', () => {
  const Util = shaka.test.Util;
  const base = shaka.test.Matroska.getAssetUri('');
  const videoTypes = {
    avc: 'video/mp4; codecs="avc1.4d400a"',
    hevc: 'video/mp4; codecs="hvc1.1.6.L30.90"',
    av1: 'video/mp4; codecs="av01.0.00M.08"',
    vp9: 'video/mp4; codecs="vp09.00.10.08"',
    vp8: 'video/webm; codecs="vp8"',
  };
  const audioTypes = {
    aac: 'audio/mp4; codecs="mp4a.40.2"',
    ac3: 'audio/mp4; codecs="ac-3"',
    eac3: 'audio/mp4; codecs="ec-3"',
    opus: 'audio/mp4; codecs="opus"',
    mp3: 'audio/mp4; codecs="mp3"',
    flac: 'audio/mp4; codecs="flac"',
    vorbis: 'audio/webm; codecs="vorbis"',
  };
  const combinations = [
    ['avc', 'aac', 'srt'],
    ['hevc', 'eac3', 'ass'],
    ['av1', 'opus', 'srt'],
    ['vp9', 'flac', 'ass'],
    ['vp8', 'vorbis', 'srt'],
    ['avc', 'ac3', 'ass'],
    ['avc', 'mp3', 'srt'],
    // Exercise separate SourceBuffers with different output containers.
    ['vp8', 'aac', 'ass'],
    ['avc', 'vorbis', 'srt'],
    ['avc', 'aac', 'ascii'],
    ['avc', 'aac', 'ssa'],
  ];

  let compiledShaka;
  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {shaka.Player} */
  let player;
  /** @type {!shaka.util.EventManager} */
  let eventManager;
  /** @type {!shaka.test.Waiter} */
  let waiter;
  /** @type {!shaka.test.FakeTextDisplayer} */
  let textDisplayer;

  beforeAll(async () => {
    video = shaka.test.UiUtils.createVideoElement();
    document.body.appendChild(video);
    compiledShaka =
        await shaka.test.Loader.loadShaka(getClientArg('uncompiled'));
  });

  beforeEach(async () => {
    player = new compiledShaka.Player();
    textDisplayer = new shaka.test.FakeTextDisplayer();
    player.configure({
      textDisplayFactory: () => textDisplayer,
      streaming: {stallEnabled: false, alwaysStreamText: true},
    });
    await player.attach(video);
    eventManager = new shaka.util.EventManager();
    waiter = new shaka.test.Waiter(eventManager);
    waiter.setPlayer(player);
    const onError = jasmine.createSpy('onError');
    onError.and.callFake((event) => fail(event.detail));
    eventManager.listen(player, 'error', Util.spyFunc(onError));
  });

  afterEach(async () => {
    eventManager.release();
    await player.destroy();
  });

  afterAll(() => document.body.removeChild(video));

  /** @param {string} type */
  async function requireSupport(type) {
    if (type == audioTypes.mp3) {
      if (!await Util.isTypeSupported('audio/mp4; codecs="mp3"') &&
          !await Util.isTypeSupported('audio/mpeg')) {
        pending('Codec MP3 is not supported by the platform.');
      }
      return;
    }
    if (!await Util.isTypeSupported(type,
        /* width= */ 160, /* height= */ 128)) {
      pending('Unsupported codec: ' + type);
    }
  }

  /**
   * Plays through multiple clusters, not just through loadedmetadata.
   * @return {!Promise}
   */
  async function play() {
    expect(player.isLive()).toBe(false);
    expect(video.duration).toBeGreaterThanOrEqual(4);
    expect(video.duration).toBeLessThan(4.5);
    await video.play();
    await waiter.waitForMovementOrFailOnTimeout(video, 10);
    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 3.6, 15);
  }

  for (const [codec, type] of Object.entries(videoTypes)) {
    it('plays video-only ' + codec, async () => {
      await requireSupport(type);
      await player.load(base + codec + '.mkv');
      expect(player.getVideoTracks().length).toBe(1);
      expect(player.getAudioTracks().length).toBe(0);
      expect(player.getTextTracks().length).toBe(0);
      await play();
      expect(video.videoWidth).toBe(160);
      expect(video.videoHeight).toBe(128);
    });
  }

  for (const [codec, type] of Object.entries(audioTypes)) {
    it('plays audio-only ' + codec, async () => {
      await requireSupport(type);
      await player.load(base + codec + '.mkv');
      expect(player.getAudioTracks().length).toBe(1);
      expect(player.getVideoTracks().length).toBe(0);
      expect(player.getTextTracks().length).toBe(0);
      await play();
    });
  }

  for (const [videoCodec, audioCodec, textCodec] of combinations) {
    const name = [videoCodec, audioCodec, textCodec].join('-');
    it('plays ' + name + ' with captions and chapters', async () => {
      await requireSupport(videoTypes[videoCodec]);
      await requireSupport(audioTypes[audioCodec]);
      await player.load(base + name + '.mkv');
      expect(player.getVideoTracks().length).toBe(1);
      expect(player.getAudioTracks().length).toBe(1);
      const tracks = player.getTextTracks();
      expect(tracks.length).toBe(1);
      expect(tracks[0].language).toBe('en');
      player.selectTextTrack(tracks[0]);
      await play();
      expect(video.videoWidth).toBe(160);
      expect(video.videoHeight).toBe(128);

      const cues = textDisplayer.appendSpy.calls.allArgs()
          .flatMap((args) => args[0]);
      for (const [payload, start, end] of [
        ['First caption', 0.5, 1.5],
        ['Second caption', 2, 3.5],
      ]) {
        const cue = cues.find((c) => text(c) == payload);
        expect(cue).withContext(String(payload)).toBeDefined();
        if (cue) {
          // Audio encoder delay can shift the muxed file slightly.
          expect(Math.abs(cue.startTime - Number(start))).toBeLessThan(0.2);
          expect(Math.abs(cue.endTime - Number(end))).toBeLessThan(0.2);
        }
      }
      const chapterTracks = player.getChaptersTracks();
      expect(chapterTracks.length).toBe(1);
      const chapters = await player.getChaptersAsync(
          chapterTracks[0].language);
      expect(chapters.map((c) => c.title)).toEqual(['Opening', 'Ending']);
      expect(chapters.map((c) => c.startTime)).toEqual([0, 2]);
      expect(chapters.map((c) => c.endTime)).toEqual([2, 4]);
    });
  }

  /**
   * ASS can represent a caption with nested styled cues.
   * @param {!shaka.text.Cue} cue
   * @return {string}
   */
  function text(cue) {
    return cue.payload + cue.nestedCues.map(text).join('');
  }

  /**
   * @param {number} time
   * @param {number} goal
   * @return {!Promise}
   */
  async function seekAndPlay(time, goal) {
    // At the accelerated playback rate, these short assets may have ended
    // before the previous wait completes.  Seeking does not resume playback.
    video.pause();
    const seeked = waiter.timeoutAfter(10).failOnTimeout(true)
        .waitForEvent(video, 'seeked');
    video.currentTime = time;
    await seeked;
    await video.play();
    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, goal, 10);
    // The waiter also resolves on ended; verify playback reached the goal.
    expect(video.currentTime).toBeGreaterThanOrEqual(goal);
  }

  for (const audio of ['aac', 'mp3']) {
    it('seeks across clusters with ' + audio + ' and resumes playback',
        async () => {
          await requireSupport(videoTypes.avc);
          await requireSupport(audioTypes[audio]);
          await player.load(base + 'avc-' + audio + '-srt.mkv');
          await video.play();
          await waiter.waitForMovementOrFailOnTimeout(video, 10);
          await seekAndPlay(2.5, 3.5);
          await seekAndPlay(0.5, 1.5);
        });
  }
});
