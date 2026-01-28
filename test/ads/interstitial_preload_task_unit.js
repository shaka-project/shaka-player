describe('shaka.ads.InterstitialPreloadTask', () => {
  const fakeUri = 'https://example.com/ad.mp4';
  const fakeMimeType = 'video/mp4';

  /** @type {!shaka.ads.InterstitialPreloadTask} */
  let task;

  /**
   * @return {!shaka.media.PreloadManager}
   */
  function createFakePreloadManager() {
    return /** @type {!shaka.media.PreloadManager} */ (/** @type {?} */ ({
      destroy: jasmine.createSpy('destroy'),
    }));
  }

  /**
   * @param {!Promise<?>} preloadPromise
   * @return {!shaka.Player}
   */
  function createFakePlayer(preloadPromise) {
    const player = /** @type {!shaka.Player} */ (/** @type {?} */ ({
      preload: jasmine.createSpy('preload').and.returnValue(preloadPromise),
    }));

    return player;
  }

  afterEach(() => {
    if (task) {
      task.release();
    }
  });

  it('stores preloadManager on successful preload', async () => {
    const preloadManager = createFakePreloadManager();
    const player = createFakePlayer(Promise.resolve(preloadManager));

    task = new shaka.ads.InterstitialPreloadTask(
        player, fakeUri, fakeMimeType);

    await shaka.test.Util.shortDelay();

    expect(player.preload).toHaveBeenCalledWith(fakeUri, null, fakeMimeType);

    expect(task.getInitialError()).toBeNull();
    expect(task.getPreloadManager()).toBe(preloadManager);
  });

  it('stores initial error when preload fails', async () => {
    const error = new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.NETWORK,
        shaka.util.Error.Code.BAD_HTTP_STATUS);

    const player = createFakePlayer(Promise.reject(error));

    task = new shaka.ads.InterstitialPreloadTask(player, fakeUri, fakeMimeType);

    await shaka.test.Util.shortDelay();

    expect(task.getInitialError()).toBe(error);
    expect(task.getPreloadManager()).toBeNull();
  });

  it('ignores non-shaka errors', async () => {
    const player = createFakePlayer(Promise.reject(new Error('boom')));

    task = new shaka.ads.InterstitialPreloadTask(player, fakeUri, fakeMimeType);

    await shaka.test.Util.shortDelay();

    expect(task.getInitialError()).toBeNull();
    expect(task.getPreloadManager()).toBeNull();
  });

  it('destroys preloadManager on release()', async () => {
    const preloadManager = createFakePreloadManager();
    const player = createFakePlayer(Promise.resolve(preloadManager));

    task = new shaka.ads.InterstitialPreloadTask(player, fakeUri, fakeMimeType);

    await shaka.test.Util.shortDelay();

    task.release();

    expect(preloadManager.destroy).toHaveBeenCalled();
    expect(task.getPreloadManager()).toBeNull();
  });

  it('destroys preloadManager if preload finishes after release', async () => {
    let resolvePreload;
    const preloadPromise = new Promise((resolve) => {
      resolvePreload = resolve;
    });

    const preloadManager = createFakePreloadManager();
    const player = createFakePlayer(preloadPromise);

    task = new shaka.ads.InterstitialPreloadTask(player, fakeUri, fakeMimeType);

    task.release();

    resolvePreload(preloadManager);

    await shaka.test.Util.shortDelay();

    expect(preloadManager.destroy).toHaveBeenCalled();
    expect(task.getPreloadManager()).toBeNull();
  });

  it('release() is idempotent', async () => {
    const preloadManager = createFakePreloadManager();
    const player = createFakePlayer(Promise.resolve(preloadManager));

    task = new shaka.ads.InterstitialPreloadTask(
        player, fakeUri, fakeMimeType);

    await shaka.test.Util.shortDelay();

    task.release();
    task.release();

    expect(preloadManager.destroy).toHaveBeenCalledTimes(1);
  });

  it('passes undefined mimeType when not provided', async () => {
    const preloadManager = createFakePreloadManager();
    const player = createFakePlayer(Promise.resolve(preloadManager));

    task = new shaka.ads.InterstitialPreloadTask(player, fakeUri, null);

    await shaka.test.Util.shortDelay();

    expect(player.preload).toHaveBeenCalledWith(
        fakeUri, null, undefined);
  });
});
