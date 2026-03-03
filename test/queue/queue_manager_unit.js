/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('QueueManager', () => {
  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {!shaka.Player} */
  let player;
  /** @type {shaka.extern.IQueueManager} */
  let queueManager;

  /** @type {shaka.extern.QueueItem} */
  const queueItem = {
    manifestUri: '/base/test/test/assets/small.mp4',
    preloadManager: null,
    startTime: null,
    mimeType: null,
    config: null,
    extraText: [
      {
        uri: '/base/test/test/assets/text-clip.vtt',
        language: 'en',
        kind: 'subtitles',
      },
    ],
    extraThumbnail: [
      '/base/test/test/assets/thumbnails.vtt',
    ],
    extraChapter: [
      {
        uri: '/base/test/test/assets/chapters.srt',
        language: 'en',
      },
    ],
  };

  /** @type {shaka.extern.QueueItem} */
  const queueItem2 = {
    manifestUri: '/base/test/test/assets/small.mp4',
    preloadManager: null,
    startTime: null,
    mimeType: null,
    config: null,
    extraText: null,
    extraThumbnail: null,
    extraChapter: null,
  };

  beforeEach(async () => {
    video = shaka.test.UiUtils.createVideoElement();
    document.body.appendChild(video);
    player = new shaka.Player();
    await player.attach(video, /* initializeMediaSource= */ false);
    queueManager = player.getQueueManager();
    expect(queueManager instanceof shaka.queue.QueueManager).toBe(true);

    const config = shaka.util.PlayerConfiguration.createDefault().queue;
    queueManager.configure(config);
  });

  afterEach(async () => {
    await queueManager.removeAllItems();
    await player.destroy();
    document.body.removeChild(video);
  });

  it('fire itemsInserted', () => {
    const itemsInserted = jasmine.createSpy('itemsInserted');
    queueManager.addEventListener(
        shaka.util.FakeEvent.EventName.ItemsInserted,
        shaka.test.Util.spyFunc(itemsInserted));
    queueManager.insertItems([queueItem]);
    expect(itemsInserted).toHaveBeenCalledTimes(1);
    queueManager.insertItems([queueItem]);
    expect(itemsInserted).toHaveBeenCalledTimes(2);
    queueManager.insertItems([queueItem, queueItem, queueItem]);
    expect(itemsInserted).toHaveBeenCalledTimes(3);
  });

  it('fire itemsRemoved', () => {
    const itemsRemoved = jasmine.createSpy('itemsRemoved');
    queueManager.addEventListener(
        shaka.util.FakeEvent.EventName.ItemsRemoved,
        shaka.test.Util.spyFunc(itemsRemoved));
    queueManager.insertItems([queueItem]);
    queueManager.removeAllItems();
    expect(itemsRemoved).toHaveBeenCalledTimes(1);
  });

  it('getItems', () => {
    queueManager.insertItems([queueItem]);
    expect(queueManager.getItems().length).toBe(1);
    queueManager.insertItems([queueItem, queueItem]);
    expect(queueManager.getItems().length).toBe(3);
    queueManager.removeAllItems();
    expect(queueManager.getItems().length).toBe(0);
  });

  it('not return anything if not using', () => {
    expect(queueManager.getCurrentItem()).toBeNull();
    expect(queueManager.getCurrentItemIndex()).toBe(-1);
  });

  it('not return anything if not playing', () => {
    queueManager.insertItems([queueItem]);
    expect(queueManager.getCurrentItem()).toBeNull();
    expect(queueManager.getCurrentItemIndex()).toBe(-1);
  });

  it('playItem throws if index out of bounds', async () => {
    const expectedError = shaka.test.Util.jasmineError(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.PLAYER,
        shaka.util.Error.Code.QUEUE_INDEX_OUT_OF_BOUNDS));
    queueManager.insertItems([queueItem]);
    await expectAsync(queueManager.playItem(-1))
        .toBeRejectedWith(expectedError);
    await expectAsync(queueManager.playItem(10))
        .toBeRejectedWith(expectedError);
  });

  // eslint-disable-next-line @stylistic/max-len
  it('playItem sets currentItemIndex and fires CurrentItemChanged', async () => {
    const spy = jasmine.createSpy('currentChanged');
    queueManager.addEventListener(
        shaka.util.FakeEvent.EventName.CurrentItemChanged,
        shaka.test.Util.spyFunc(spy));

    queueManager.insertItems([queueItem, queueItem2]);
    await queueManager.playItem(0);

    expect(queueManager.getCurrentItemIndex()).toBe(0);
    expect(queueManager.getCurrentItem()).toEqual(queueItem);
    expect(spy).toHaveBeenCalled();

    await queueManager.playItem(1);
    expect(queueManager.getCurrentItemIndex()).toBe(1);
    expect(queueManager.getCurrentItem()).toEqual(queueItem2);
  });

  it('preloads next item when close to end', async () => {
    queueManager.insertItems([queueItem, queueItem2]);
    await queueManager.playItem(0);

    const fakePreloadManager = {
      isDestroyed: () => false,
      destroy: async () => {},
    };

    const preloadSpy =
        spyOn(player, 'preload').and.callFake(() => fakePreloadManager);

    video.currentTime = 9;
    spyOn(player, 'seekRange').and.returnValue({start: 0, end: 10});

    video.dispatchEvent(new Event('timeupdate'));
    await shaka.test.Util.shortDelay();

    expect(preloadSpy).toHaveBeenCalledWith(
        queueItem2.manifestUri, null, null, null);
  });

  it('cleans up previous preload when playing next item', async () => {
    queueManager.insertItems([queueItem, queueItem2]);
    const config = queueManager.getConfiguration();
    config.preloadPrevItem = true;
    queueManager.configure(config);

    spyOn(player, 'getLoadMode')
        .and.returnValue(shaka.Player.LoadMode.MEDIA_SOURCE);

    const fakePreloadManager = {
      destroy: async () => {},
      isDestroyed: () => false,
    };

    const unloadSpy = spyOn(player, 'unloadAndSavePreload')
        .and.returnValue(Promise.resolve(fakePreloadManager));

    await queueManager.playItem(0);
    await queueManager.playItem(1);

    expect(unloadSpy).toHaveBeenCalled();
  });

  // eslint-disable-next-line @stylistic/max-len
  it('does not clean up previous preload when preloadPrevItem is false', async () => {
    queueManager.insertItems([queueItem, queueItem2]);
    const config = queueManager.getConfiguration();
    config.preloadPrevItem = false;
    queueManager.configure(config);

    const unloadSpy = spyOn(player, 'unloadAndSavePreload')
        .and.returnValue(Promise.resolve({
          destroy: async () => {},
          isDestroyed: () => false,
        }));

    await queueManager.playItem(0);
    await queueManager.playItem(1);

    expect(unloadSpy).not.toHaveBeenCalled();
    expect(queueManager.getCurrentItemIndex()).toBe(1);
    expect(queueManager.getCurrentItem()).toEqual(queueItem2);
  });

  it('SINGLE mode repeats current item', async () => {
    queueManager.insertItems([queueItem]);
    const config = queueManager.getConfiguration();
    config.repeatMode = shaka.config.RepeatMode.SINGLE;
    queueManager.configure(config);

    await queueManager.playItem(0);
    video.currentTime = 10;

    const playSpy = spyOn(video, 'play').and.callThrough();

    player.dispatchEvent(new shaka.util.FakeEvent('complete'));

    expect(video.currentTime).toBe(0);
    expect(playSpy).toHaveBeenCalled();
  });

  it('ALL mode moves to next item', async () => {
    queueManager.insertItems([queueItem, queueItem2]);
    const config = queueManager.getConfiguration();
    config.repeatMode = shaka.config.RepeatMode.ALL;
    queueManager.configure(config);

    await queueManager.playItem(0);
    player.dispatchEvent(new shaka.util.FakeEvent('complete'));

    await shaka.test.Util.shortDelay();

    expect(queueManager.getCurrentItemIndex()).toBe(1);
    expect(queueManager.getCurrentItem()).toEqual(queueItem2);
  });

  it('ALL mode repeats single item if length=1', async () => {
    queueManager.insertItems([queueItem]);
    const config = queueManager.getConfiguration();
    config.repeatMode = shaka.config.RepeatMode.ALL;
    queueManager.configure(config);

    await queueManager.playItem(0);
    video.currentTime = 10;

    const playSpy = spyOn(video, 'play').and.callThrough();
    player.dispatchEvent(new shaka.util.FakeEvent('complete'));

    expect(video.currentTime).toBe(0);
    expect(playSpy).toHaveBeenCalled();
  });

  it('does not repeat or advance when repeatMode is OFF', async () => {
    queueManager.insertItems([queueItem, queueItem2]);
    const config = queueManager.getConfiguration();
    config.repeatMode = shaka.config.RepeatMode.OFF;
    queueManager.configure(config);

    await queueManager.playItem(0);

    const initialIndex = queueManager.getCurrentItemIndex();
    const initialItem = queueManager.getCurrentItem();
    video.currentTime = 5;

    const playSpy = spyOn(video, 'play').and.callThrough();

    player.dispatchEvent(new shaka.util.FakeEvent('complete'));

    await shaka.test.Util.shortDelay();

    expect(queueManager.getCurrentItemIndex()).toBe(initialIndex);
    expect(queueManager.getCurrentItem()).toEqual(initialItem);
    expect(video.currentTime).toBe(5);
    expect(playSpy).not.toHaveBeenCalled();
  });

  it('adds text, thumbnail, and chapter tracks', async () => {
    queueManager.insertItems([queueItem, queueItem2]);
    await queueManager.playItem(0);

    expect(player.getTextTracks().length).toBe(1);
    expect(player.getImageTracks().length).toBe(1);

    const BrowserEngine = shaka.device.IDevice.BrowserEngine;
    if (deviceDetected.getBrowserEngine() === BrowserEngine.WEBKIT) {
      expect(player.getChaptersTracks().length).toBeGreaterThanOrEqual(1);
    } else {
      expect(player.getChaptersTracks().length).toBe(1);
    }

    await queueManager.playItem(1);

    expect(player.getTextTracks().length).toBe(0);
    expect(player.getImageTracks().length).toBe(0);

    if (deviceDetected.getBrowserEngine() === BrowserEngine.WEBKIT) {
      expect(player.getChaptersTracks().length).toBeGreaterThanOrEqual(0);
    } else {
      expect(player.getChaptersTracks().length).toBe(0);
    }
  });
});
