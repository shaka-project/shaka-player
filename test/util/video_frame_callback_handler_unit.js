/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('VideoFrameCallbackHandler', () => {
  const VideoFrameCallbackHandler = shaka.util.VideoFrameCallbackHandler;

  /** @type {!HTMLVideoElement} */
  let mockVideo;

  /** @type {shaka.util.VideoFrameCallbackHandler} */
  let handler;

  /**
   * Holds every VideoFrameRequestCallback registered via
   * requestVideoFrameCallback on the current mockVideo. Populated by
   * createMockVideoWithRVFC so that tests can trigger callbacks without
   * accessing spy internals.
   *
   * @type {!Array<!VideoFrameRequestCallback>}
   */
  let registeredCallbacks;

  beforeEach(() => {
    registeredCallbacks = [];
  });

  afterEach(() => {
    handler?.release();
    handler = null;
  });

  /**
   * Creates a mock video element that supports requestVideoFrameCallback
   * and cancelVideoFrameCallback.
   *
   * @return {!HTMLVideoElement}
   */
  function createMockVideoWithRVFC() {
    const video = jasmine.createSpyObj('video', [
      'requestVideoFrameCallback',
      'cancelVideoFrameCallback',
    ]);
    let handleCounter = 1;
    video.requestVideoFrameCallback.and.callFake(
        (/** !VideoFrameRequestCallback */ cb) => {
          registeredCallbacks.push(cb);
          return handleCounter++;
        });
    return /** @type {!HTMLVideoElement} */ (video);
  }

  /**
   * Creates a mock video element that does NOT support
   * requestVideoFrameCallback, simulating older devices.
   *
   * @return {!HTMLVideoElement}
   */
  function createMockVideoWithoutRVFC() {
    return /** @type {!HTMLVideoElement} */ ({});
  }

  /**
   * Fires the most recently registered video frame callback.
   *
   * @param {number=} now
   * @param {?VideoFrameMetadata=} metadata
   */
  function fireLastRegisteredCallback(now = 100, metadata = null) {
    registeredCallbacks[registeredCallbacks.length - 1](now, metadata);
  }

  describe('start', () => {
    it('returns false if requestVideoFrameCallback is not supported', () => {
      handler = new VideoFrameCallbackHandler(createMockVideoWithoutRVFC());

      expect(handler.start(() => {})).toBe(false);
    });

    it('returns true if requestVideoFrameCallback is supported', () => {
      mockVideo = createMockVideoWithRVFC();
      handler = new VideoFrameCallbackHandler(mockVideo);

      expect(handler.start(() => {})).toBe(true);
    });

    it('registers a video frame callback on the video element', () => {
      mockVideo = createMockVideoWithRVFC();
      handler = new VideoFrameCallbackHandler(mockVideo);

      handler.start(() => {});

      expect(mockVideo.requestVideoFrameCallback).toHaveBeenCalledTimes(1);
    });

    it('cancels the pending callback before registering a new one', () => {
      mockVideo = createMockVideoWithRVFC();
      handler = new VideoFrameCallbackHandler(mockVideo);

      handler.start(() => {});
      handler.start(() => {});

      expect(mockVideo.cancelVideoFrameCallback).toHaveBeenCalledTimes(1);
      expect(mockVideo.requestVideoFrameCallback).toHaveBeenCalledTimes(2);
    });

    it('does not call cancelVideoFrameCallback on the first start', () => {
      mockVideo = createMockVideoWithRVFC();
      handler = new VideoFrameCallbackHandler(mockVideo);

      handler.start(() => {});

      expect(mockVideo.cancelVideoFrameCallback).not.toHaveBeenCalled();
    });

    it('invokes the user callback when a video frame fires', () => {
      mockVideo = createMockVideoWithRVFC();
      handler = new VideoFrameCallbackHandler(mockVideo);
      const callbackSpy = jasmine.createSpy('userCallback');

      handler.start(shaka.test.Util.spyFunc(callbackSpy));
      fireLastRegisteredCallback(200, null);

      expect(callbackSpy).toHaveBeenCalledOnceWith(200, null);
    });

    it('re-registers the callback after each frame to loop continuously',
        () => {
          mockVideo = createMockVideoWithRVFC();
          handler = new VideoFrameCallbackHandler(mockVideo);

          handler.start(() => {});
          fireLastRegisteredCallback();
          fireLastRegisteredCallback();

          // 1 initial + 2 re-registrations after each fired frame
          expect(mockVideo.requestVideoFrameCallback)
              .toHaveBeenCalledTimes(3);
        });

    it('re-registers before invoking the user callback', () => {
      mockVideo = createMockVideoWithRVFC();
      handler = new VideoFrameCallbackHandler(mockVideo);

      handler.start(() => {
        expect(mockVideo.requestVideoFrameCallback).toHaveBeenCalledTimes(2);
      });
      fireLastRegisteredCallback();
    });

    it('stays armed when the user callback throws', () => {
      mockVideo = createMockVideoWithRVFC();
      handler = new VideoFrameCallbackHandler(mockVideo);
      const callbackSpy = jasmine.createSpy('userCallback')
          .and.throwError('boom');

      handler.start(shaka.test.Util.spyFunc(callbackSpy));
      expect(() => fireLastRegisteredCallback()).toThrow(new Error('boom'));
      expect(() => fireLastRegisteredCallback()).toThrow(new Error('boom'));

      expect(callbackSpy).toHaveBeenCalledTimes(2);
      expect(mockVideo.requestVideoFrameCallback).toHaveBeenCalledTimes(3);
    });

    it('cancels the re-registered callback when released mid-loop', () => {
      mockVideo = createMockVideoWithRVFC();
      handler = new VideoFrameCallbackHandler(mockVideo);

      handler.start(() => handler.release());
      fireLastRegisteredCallback();

      expect(mockVideo.cancelVideoFrameCallback).toHaveBeenCalledOnceWith(2);
    });

    it('cancels and ignores the old successor when restarted mid-loop', () => {
      mockVideo = createMockVideoWithRVFC();
      handler = new VideoFrameCallbackHandler(mockVideo);
      const firstCallbackSpy = jasmine.createSpy('firstCallback');
      const secondCallbackSpy = jasmine.createSpy('secondCallback');
      const firstCallback = shaka.test.Util.spyFunc(firstCallbackSpy);

      handler.start(() => {
        firstCallback();
        handler.start(shaka.test.Util.spyFunc(secondCallbackSpy));
      });
      fireLastRegisteredCallback();
      const staleSuccessor = registeredCallbacks[1];

      staleSuccessor(200, null);

      expect(mockVideo.cancelVideoFrameCallback).toHaveBeenCalledOnceWith(2);
      expect(firstCallbackSpy).toHaveBeenCalledTimes(1);
      expect(secondCallbackSpy).not.toHaveBeenCalled();

      fireLastRegisteredCallback(300, null);
      expect(secondCallbackSpy).toHaveBeenCalledOnceWith(300, null);
    });

    it('does not pre-register another callback in once mode', () => {
      mockVideo = createMockVideoWithRVFC();
      handler = new VideoFrameCallbackHandler(mockVideo);
      const callbackSpy = jasmine.createSpy('userCallback');

      handler.start(shaka.test.Util.spyFunc(callbackSpy), /* once= */ true);
      fireLastRegisteredCallback();
      handler.release();

      expect(callbackSpy).toHaveBeenCalledTimes(1);
      expect(mockVideo.requestVideoFrameCallback).toHaveBeenCalledTimes(1);
      expect(mockVideo.cancelVideoFrameCallback).not.toHaveBeenCalled();
    });

    it('does not re-register if start is called again mid-loop', () => {
      mockVideo = createMockVideoWithRVFC();
      handler = new VideoFrameCallbackHandler(mockVideo);
      const firstCallbackSpy = jasmine.createSpy('firstCallback');
      const secondCallbackSpy = jasmine.createSpy('secondCallback');

      handler.start(shaka.test.Util.spyFunc(firstCallbackSpy));

      // Capture the first registered callback before it fires
      const firstRegisteredCallback = registeredCallbacks[0];

      // Replace with a new callback
      handler.start(shaka.test.Util.spyFunc(secondCallbackSpy));

      // The stale first callback fires (e.g. already queued by the browser)
      firstRegisteredCallback(100, null);

      expect(firstCallbackSpy).not.toHaveBeenCalled();
      expect(secondCallbackSpy).not.toHaveBeenCalled();
    });
  });

  describe('release', () => {
    it('cancels a pending callback', () => {
      mockVideo = createMockVideoWithRVFC();
      handler = new VideoFrameCallbackHandler(mockVideo);

      handler.start(() => {});
      handler.release();

      expect(mockVideo.cancelVideoFrameCallback).toHaveBeenCalledTimes(1);
    });

    it('does not throw if called before start', () => {
      mockVideo = createMockVideoWithRVFC();
      handler = new VideoFrameCallbackHandler(mockVideo);

      expect(() => handler.release()).not.toThrow();
    });

    it('can be called multiple times without throwing', () => {
      mockVideo = createMockVideoWithRVFC();
      handler = new VideoFrameCallbackHandler(mockVideo);

      handler.start(() => {});

      expect(() => {
        handler.release();
        handler.release();
      }).not.toThrow();
    });

    it('stops the user callback from being invoked after release', () => {
      mockVideo = createMockVideoWithRVFC();
      handler = new VideoFrameCallbackHandler(mockVideo);
      const callbackSpy = jasmine.createSpy('userCallback');

      handler.start(shaka.test.Util.spyFunc(callbackSpy));

      // Capture the registered callback before release
      const registeredCallback = registeredCallbacks[0];

      handler.release();

      // Simulate a queued frame firing after release
      registeredCallback(100, null);

      expect(callbackSpy).not.toHaveBeenCalled();
    });

    it('stops re-registration of callback after release', () => {
      mockVideo = createMockVideoWithRVFC();
      handler = new VideoFrameCallbackHandler(mockVideo);

      handler.start(() => {});

      const registeredCallback = registeredCallbacks[0];

      handler.release();
      registeredCallback(100, null);

      // requestVideoFrameCallback should only have been called once (on start),
      // not again after the stale frame fires post-release.
      expect(mockVideo.requestVideoFrameCallback).toHaveBeenCalledTimes(1);
    });
  });
});
