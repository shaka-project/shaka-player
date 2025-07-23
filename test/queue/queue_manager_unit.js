/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('QueueManager', () => {
  /** @type {!shaka.test.FakeVideo} */
  let mockVideo;
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
    extraText: null,
    extraThumbnail: null,
    extraChapter: null,
  };

  beforeEach(async () => {
    mockVideo = new shaka.test.FakeVideo();
    player = new shaka.Player();
    await player.attach(mockVideo, /* initializeMediaSource= */ false);
    queueManager = player.getQueueManager();
    expect(queueManager instanceof shaka.queue.QueueManager).toBe(true);

    const config = shaka.util.PlayerConfiguration.createDefault().queue;
    queueManager.configure(config);
  });

  afterEach(async () => {
    await player.destroy();
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
});
