/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('NativeChaptersManager', () => {
  const NativeChaptersManager = shaka.text.NativeChaptersManager;

  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {!shaka.util.FakeEventTarget} */
  let player;
  /** @type {!Map<string, !Array<shaka.extern.Chapter>>} */
  let chaptersByLanguage;
  /** @type {shaka.text.NativeChaptersManager} */
  let manager;

  /**
   * @param {string} id
   * @param {number} startTime
   * @param {number} endTime
   * @param {string} title
   * @return {shaka.extern.Chapter}
   */
  function makeChapter(id, startTime, endTime, title) {
    return {id, startTime, endTime, title, images: []};
  }

  function createManager() {
    manager = new NativeChaptersManager(video, player, {
      getChapterLanguages: () => Array.from(chaptersByLanguage.keys()),
      getChapters: (language) =>
        Promise.resolve(chaptersByLanguage.get(language) || []),
    });
  }

  /** @return {!Array<!HTMLTrackElement>} */
  function getTrackNodes() {
    return Array.from(video.querySelectorAll('track'));
  }

  /**
   * @param {HTMLTrackElement|undefined} trackNode
   * @return {!Array<{id: string, startTime: number, endTime: number,
   *     text: string}>}
   */
  function getCues(trackNode) {
    return Array.from(trackNode.track.cues || []).map((cue) => {
      const vttCue = /** @type {!VTTCue} */ (cue);
      return {
        id: vttCue.id,
        startTime: vttCue.startTime,
        endTime: vttCue.endTime,
        text: vttCue.text,
      };
    });
  }

  /**
   * Lets the pending updates (and MutationObserver callbacks) run, and waits
   * for the managed tracks to load, since their cues are added after that.
   * @return {!Promise}
   */
  async function flush() {
    await shaka.test.Util.shortDelay();
    const deadline = Date.now() + 2000;
    while (getTrackNodes().some((t) => t.readyState < 2) &&
        Date.now() < deadline) {
      // eslint-disable-next-line no-await-in-loop
      await shaka.test.Util.shortDelay();
    }
  }

  beforeEach(() => {
    video = /** @type {!HTMLVideoElement} */ (
      document.createElement('video'));
    document.body.appendChild(video);
    player = new shaka.util.FakeEventTarget();
    chaptersByLanguage = new Map([
      ['en', [
        makeChapter('1', 0, 10, 'Intro'),
        makeChapter('2', 10, 20, 'Middle'),
      ]],
    ]);
    manager = null;
  });

  afterEach(() => {
    if (manager) {
      manager.release();
    }
    video.remove();
    player.release();
  });

  it('does not create tracks without native controls', async () => {
    createManager();
    await flush();
    expect(getTrackNodes().length).toBe(0);
  });

  it('creates a chapters track per language with controls', async () => {
    chaptersByLanguage.set('es', [makeChapter('a', 0, 20, 'Todo')]);
    video.controls = true;
    createManager();
    await flush();

    const trackNodes = getTrackNodes();
    expect(trackNodes.length).toBe(2);
    for (const trackNode of trackNodes) {
      expect(trackNode.kind).toBe('chapters');
      expect(manager.isManagedTrack(trackNode.track)).toBe(true);
    }
    const en = trackNodes.find((t) => t.srclang == 'en');
    expect(getCues(en)).toEqual([
      {id: '1', startTime: 0, endTime: 10, text: 'Intro'},
      {id: '2', startTime: 10, endTime: 20, text: 'Middle'},
    ]);
    const es = trackNodes.find((t) => t.srclang == 'es');
    expect(getCues(es)).toEqual([
      {id: 'a', startTime: 0, endTime: 20, text: 'Todo'},
    ]);
  });

  it('follows the controls attribute', async () => {
    createManager();
    await flush();
    expect(getTrackNodes().length).toBe(0);

    video.controls = true;
    await flush();
    expect(getTrackNodes().length).toBe(1);

    video.controls = false;
    await flush();
    expect(getTrackNodes().length).toBe(0);
  });

  it('follows the native fullscreen presentation mode', async () => {
    let presentationMode = 'inline';
    Object.defineProperty(video, 'webkitPresentationMode', {
      configurable: true,
      get: () => presentationMode,
    });
    createManager();
    await flush();
    expect(getTrackNodes().length).toBe(0);

    presentationMode = 'fullscreen';
    video.dispatchEvent(new Event('webkitpresentationmodechanged'));
    await flush();
    expect(getTrackNodes().length).toBe(1);

    presentationMode = 'inline';
    video.dispatchEvent(new Event('webkitpresentationmodechanged'));
    await flush();
    expect(getTrackNodes().length).toBe(0);
  });

  it('updates the cues when the chapters change', async () => {
    video.controls = true;
    createManager();
    await flush();
    const firstTrackNode = getTrackNodes()[0];

    // Nothing changed, so the track is kept.
    player.dispatchEvent(new shaka.util.FakeEvent('trackschanged'));
    await flush();
    expect(getTrackNodes()).toEqual([firstTrackNode]);

    chaptersByLanguage.set('en', [makeChapter('3', 0, 20, 'Everything')]);
    player.dispatchEvent(new shaka.util.FakeEvent('manifestupdated'));
    await flush();
    const trackNodes = getTrackNodes();
    expect(trackNodes.length).toBe(1);
    expect(getCues(trackNodes[0])).toEqual([
      {id: '3', startTime: 0, endTime: 20, text: 'Everything'},
    ]);

    chaptersByLanguage.clear();
    player.dispatchEvent(new shaka.util.FakeEvent('trackschanged'));
    await flush();
    expect(getTrackNodes().length).toBe(0);
  });

  it('ignores chapters without a positive duration', async () => {
    chaptersByLanguage.set('en', [
      makeChapter('1', 0, 10, 'Intro'),
      makeChapter('2', 10, 10, 'Empty'),
    ]);
    video.controls = true;
    createManager();
    await flush();
    expect(getCues(getTrackNodes()[0]).map((c) => c.id)).toEqual(['1']);
  });

  it('removes its tracks on release', async () => {
    video.controls = true;
    createManager();
    await flush();
    expect(getTrackNodes().length).toBe(1);

    manager.release();
    manager = null;
    expect(getTrackNodes().length).toBe(0);

    // Once released, events are ignored.
    video.controls = false;
    video.controls = true;
    player.dispatchEvent(new shaka.util.FakeEvent('trackschanged'));
    await flush();
    expect(getTrackNodes().length).toBe(0);
  });

  it('does not report foreign tracks as managed', async () => {
    const trackNode = /** @type {!HTMLTrackElement} */ (
      document.createElement('track'));
    trackNode.kind = 'chapters';
    video.appendChild(trackNode);
    video.controls = true;
    createManager();
    await flush();
    expect(manager.isManagedTrack(trackNode.track)).toBe(false);
  });
});
