/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('VideoWrapper', () => {
  // Keep playback, currentTime writes, and native event delivery independent.
  // In particular, a currentTime assignment must not dispatch synchronously.
  class Video extends shaka.util.FakeEventTarget {
    constructor() {
      super();
      this.readyState = HTMLMediaElement.HAVE_METADATA;
      this.seekable = createFakeBuffered([]);
      this.seeking = false;
      this.ended = false;
      this.paused = true;
      this.pause = jasmine.createSpy('pause');
      this.currentTimeSetter = jasmine.createSpy('currentTime setter');
      /** @private {number} */
      this.clockTime_ = 0;
    }

    /** @return {number} */
    get currentTime() {
      return this.clockTime_;
    }

    /** @param {number} time */
    set currentTime(time) {
      shaka.test.Util.invokeSpy(this.currentTimeSetter, time);
      if (!this.seekable.length) {
        return;
      }
      this.clockTime_ = Math.max(this.seekable.start(0),
          Math.min(time, this.seekable.end(0)));
      this.seeking = true;
    }

    /** @param {number} seconds */
    advanceClock(seconds) {
      this.clockTime_ += seconds;
    }
  }

  /** @type {!Video} */
  let video;
  /** @type {?shaka.media.VideoWrapper} */
  let wrapper;
  /** @type {?shaka.media.VideoWrapper.PlayheadMover} */
  let mover;
  /** @type {!jasmine.Spy} */
  let onStarted;
  /** @type {!jasmine.Spy} */
  let onSeek;

  beforeEach(() => {
    jasmine.clock().install();
    wrapper = null;
    mover = null;
    video = new Video();
    onStarted = jasmine.createSpy('onStarted');
    onSeek = jasmine.createSpy('onSeek');
    spyOn(shaka.log, 'warning');
  });

  afterEach(() => {
    try {
      if (wrapper) {
        wrapper.release();
      }
      if (mover) {
        mover.release();
      }
      video.release();
    } finally {
      jasmine.clock().uninstall();
    }
  });

  /** @param {number} startTime */
  function createWrapper(startTime) {
    wrapper = new shaka.media.VideoWrapper(
        /** @type {!HTMLMediaElement} */ (/** @type {?} */ (video)),
        shaka.test.Util.spyFunc(onSeek),
        shaka.test.Util.spyFunc(onStarted),
        () => startTime);
  }

  /** @param {string} type */
  function dispatch(type) {
    video.dispatchEvent(new shaka.util.FakeEvent(type));
  }

  /**
   * Retain the owned mover to check cleanup after wrapper.release clears it.
   * There is no public accessor for this internal resource.
   * @return {shaka.media.VideoWrapper.PlayheadMover}
   * @suppress {accessControls}
   */
  function getStartupMover() {
    return wrapper.mover_;
  }

  /**
   * Callback retention is not observable after the timer stops. Inspect the
   * reference to verify it cannot retain the startup wrapper.
   * @param {shaka.media.VideoWrapper.PlayheadMover} playheadMover
   * @suppress {accessControls}
   */
  function expectCompletionCleared(playheadMover) {
    expect(playheadMover.isComplete_).toBeNull();
  }

  it('retries ignored startup seeks after independent playback ' +
      'advances', () => {
    createWrapper(30);
    expect(video.seekable.length).toBe(0);
    expect(video.currentTimeSetter).toHaveBeenCalledTimes(1);
    expect(video.currentTime).toBe(0);

    // Playback advances without acknowledging the ignored currentTime write.
    video.advanceClock(0.25);
    expect(video.seeking).toBe(false);
    jasmine.clock().tick(100);
    expect(video.currentTimeSetter).toHaveBeenCalledTimes(2);
    expect(wrapper.getTime()).toBe(30);
    expect(onStarted).not.toHaveBeenCalled();

    video.seekable = createFakeBuffered([{start: 0, end: 60}]);
    jasmine.clock().tick(100);
    expect(video.currentTimeSetter).toHaveBeenCalledTimes(3);
    expect(video.currentTimeSetter).toHaveBeenCalledWith(30);
    expect(video.currentTime).toBe(30);
    expect(video.seeking).toBe(true);
    expect(onStarted).not.toHaveBeenCalled();

    // Deliver the browser's queued acknowledgement after the assignment.
    dispatch('seeking');
    video.seeking = false;
    jasmine.clock().tick(2000);
    expect(onStarted).toHaveBeenCalledTimes(1);
    expect(onStarted).toHaveBeenCalledWith(30);
    expect(onSeek).not.toHaveBeenCalled();
    expect(video.currentTimeSetter).toHaveBeenCalledTimes(3);
    expect(shaka.log.warning).not.toHaveBeenCalled();

    video.advanceClock(1);
    expect(wrapper.getTime()).toBe(31);
    dispatch('seeking');
    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(onStarted).toHaveBeenCalledTimes(1);
  });

  for (const target of [-5, 80]) {
    it('accepts native seeking for a clamped startup target of ' +
        target, () => {
      video.seekable = createFakeBuffered([{start: 0, end: 60}]);
      createWrapper(target);
      const acceptedTime = target < 0 ? 0 : 60;
      expect(video.currentTime).toBe(acceptedTime);
      expect(wrapper.getTime()).toBe(target);
      expect(onStarted).not.toHaveBeenCalled();

      jasmine.clock().tick(300);
      expect(video.currentTimeSetter).toHaveBeenCalledTimes(1);
      dispatch('seeking');
      video.seeking = false;
      jasmine.clock().tick(2000);

      expect(onStarted).toHaveBeenCalledTimes(1);
      expect(onStarted).toHaveBeenCalledWith(acceptedTime);
      expect(wrapper.getTime()).toBe(acceptedTime);
      expect(onSeek).not.toHaveBeenCalled();
      expect(video.currentTimeSetter).toHaveBeenCalledTimes(1);
      expect(shaka.log.warning).not.toHaveBeenCalled();
      expectCompletionCleared(getStartupMover());
    });
  }

  for (const [current, target] of [[0, 0], [10, 10.0005], [10, 9.9995]]) {
    it('starts without a seek within 1ms at ' +
        current + ' / ' + target, () => {
      video.advanceClock(current);
      createWrapper(target);
      jasmine.clock().tick(2000);
      expect(video.currentTimeSetter).not.toHaveBeenCalled();
      expect(onStarted).toHaveBeenCalledTimes(1);
      expect(onStarted).toHaveBeenCalledWith(current);
      expect(wrapper.getTime()).toBe(current);
      dispatch('seeking');
      expect(onSeek).toHaveBeenCalledTimes(1);
      expect(onStarted).toHaveBeenCalledTimes(1);
      expect(shaka.log.warning).not.toHaveBeenCalled();
    });
  }

  it('bounds startup retries while seeking without repeated writes', () => {
    video.seekable = createFakeBuffered([{start: 0, end: 60}]);
    createWrapper(30);
    expect(video.seeking).toBe(true);
    jasmine.clock().tick(1000);
    expect(video.currentTimeSetter).toHaveBeenCalledTimes(1);
    expect(onStarted).not.toHaveBeenCalled();
    expect(shaka.log.warning).not.toHaveBeenCalled();

    jasmine.clock().tick(100);
    expect(shaka.log.warning).toHaveBeenCalledTimes(1);
    expectCompletionCleared(getStartupMover());
    video.seeking = false;
    jasmine.clock().tick(2000);
    expect(video.currentTimeSetter).toHaveBeenCalledTimes(1);
    expect(onStarted).not.toHaveBeenCalled();
    expect(shaka.log.warning).toHaveBeenCalledTimes(1);
  });

  it('warns on ignored startup exhaustion without falsely ' +
      'acknowledging', () => {
    createWrapper(30);
    video.advanceClock(0.25);
    jasmine.clock().tick(1100);
    expect(video.currentTimeSetter).toHaveBeenCalledTimes(11);
    expect(shaka.log.warning).toHaveBeenCalledTimes(1);
    expect(shaka.log.warning).toHaveBeenCalledWith(
        'Failed to move playhead from 0 to 30');
    expect(wrapper.getTime()).toBe(30);
    expect(onStarted).not.toHaveBeenCalled();
    expect(onSeek).not.toHaveBeenCalled();
    expectCompletionCleared(getStartupMover());
    jasmine.clock().tick(2000);
    expect(video.currentTimeSetter).toHaveBeenCalledTimes(11);
    expect(shaka.log.warning).toHaveBeenCalledTimes(1);
  });

  it('acknowledges the final accepted startup retry before exhaustion', () => {
    createWrapper(30);
    jasmine.clock().tick(900);
    expect(video.currentTimeSetter).toHaveBeenCalledTimes(10);
    video.seekable = createFakeBuffered([{start: 0, end: 60}]);
    jasmine.clock().tick(100);
    expect(video.currentTimeSetter).toHaveBeenCalledTimes(11);
    expect(onStarted).not.toHaveBeenCalled();
    dispatch('seeking');
    video.seeking = false;
    jasmine.clock().tick(2000);
    expect(onStarted).toHaveBeenCalledTimes(1);
    expect(onStarted).toHaveBeenCalledWith(30);
    expect(video.currentTimeSetter).toHaveBeenCalledTimes(11);
    expect(shaka.log.warning).not.toHaveBeenCalled();
    expectCompletionCleared(getStartupMover());
  });

  for (const readyState of [0, 1]) {
    for (const target of [0, 42]) {
      it('uses the latest explicit pending target ' + target +
          ' at readyState ' + readyState, () => {
        video.readyState = readyState;
        video.advanceClock(9);
        createWrapper(30);
        // Playhead.setStartTime and corrective seeks reach the wrapper here.
        wrapper.setTime(17);
        wrapper.setTime(target);
        expect(wrapper.getTime()).toBe(target);
        expect(onStarted).not.toHaveBeenCalled();
        if (!readyState) {
          expect(video.currentTimeSetter).not.toHaveBeenCalled();
        }

        video.currentTimeSetter.calls.reset();
        video.seekable = createFakeBuffered([{start: 0, end: 60}]);
        video.readyState = HTMLMediaElement.HAVE_METADATA;
        if (!readyState) {
          dispatch('loadedmetadata');
        } else {
          jasmine.clock().tick(100);
        }
        expect(video.currentTimeSetter).toHaveBeenCalledTimes(1);
        expect(video.currentTimeSetter).toHaveBeenCalledWith(target);
        expect(video.currentTime).toBe(target);
        expect(onStarted).not.toHaveBeenCalled();

        dispatch('seeking');
        video.seeking = false;
        jasmine.clock().tick(2000);
        expect(wrapper.getTime()).toBe(target);
        expect(onStarted).toHaveBeenCalledTimes(1);
        expect(onStarted).toHaveBeenCalledWith(target);
        expect(onSeek).not.toHaveBeenCalled();
        expect(video.currentTimeSetter).toHaveBeenCalledTimes(1);
        dispatch('seeking');
        expect(onSeek).toHaveBeenCalledTimes(1);
        expect(onStarted).toHaveBeenCalledTimes(1);
        expect(shaka.log.warning).not.toHaveBeenCalled();
      });
    }
  }

  it('applies the latest ordinary seek after metadata readiness ' +
      'regresses', () => {
    video.readyState = HTMLMediaElement.HAVE_NOTHING;
    createWrapper(0);
    video.readyState = HTMLMediaElement.HAVE_METADATA;
    dispatch('loadedmetadata');
    expect(onStarted).toHaveBeenCalledTimes(1);
    expect(onStarted).toHaveBeenCalledWith(0);

    /** @type {!jasmine.Spy} */
    const addListener = spyOn(video, 'addEventListener').and.callThrough();
    /** @type {!jasmine.Spy} */
    const removeListener =
        spyOn(video, 'removeEventListener').and.callThrough();
    video.advanceClock(40);
    video.readyState = HTMLMediaElement.HAVE_NOTHING;
    wrapper.setTime(41);
    wrapper.setTime(42);
    expect(video.currentTime).toBe(40);
    expect(wrapper.getTime()).toBe(40);
    expect(video.currentTimeSetter).not.toHaveBeenCalled();
    expect(addListener).toHaveBeenCalledTimes(2);
    for (const args of addListener.calls.allArgs()) {
      expect(args[0]).toBe('loadedmetadata');
    }
    expect(removeListener).toHaveBeenCalledTimes(1);
    expect(removeListener).toHaveBeenCalledWith(
        ...addListener.calls.first().args);

    video.seekable = createFakeBuffered([{start: 0, end: 60}]);
    video.readyState = HTMLMediaElement.HAVE_METADATA;
    dispatch('loadedmetadata');
    expect(removeListener).toHaveBeenCalledTimes(2);
    expect(addListener).toHaveBeenCalledTimes(2);
    expect(video.currentTimeSetter).toHaveBeenCalledTimes(1);
    expect(video.currentTimeSetter).toHaveBeenCalledWith(42);
    expect(wrapper.getTime()).toBe(42);
    expectCompletionCleared(getStartupMover());
    jasmine.clock().tick(2000);
    expect(onStarted).toHaveBeenCalledTimes(1);
    expect(onSeek).not.toHaveBeenCalled();
    dispatch('loadedmetadata');
    expect(video.currentTimeSetter).toHaveBeenCalledTimes(1);
    dispatch('seeking');
    expect(onSeek).toHaveBeenCalledTimes(1);
    video.seeking = false;
    video.currentTime = 43;
    dispatch('seeking');
    expect(onSeek).toHaveBeenCalledTimes(2);
    expect(onStarted).toHaveBeenCalledTimes(1);
    expect(shaka.log.warning).not.toHaveBeenCalled();
  });

  for (const target of [0, 42]) {
    it('replaces pending startup after metadata readiness regresses with ' +
        target, () => {
      video.readyState = HTMLMediaElement.HAVE_NOTHING;
      createWrapper(30);
      video.readyState = HTMLMediaElement.HAVE_METADATA;
      dispatch('loadedmetadata');
      expect(video.currentTimeSetter).toHaveBeenCalledTimes(1);
      expect(video.currentTimeSetter).toHaveBeenCalledWith(30);
      expect(onStarted).not.toHaveBeenCalled();

      /** @type {!jasmine.Spy} */
      const addListener = spyOn(video, 'addEventListener').and.callThrough();
      /** @type {!jasmine.Spy} */
      const removeListener =
          spyOn(video, 'removeEventListener').and.callThrough();
      video.advanceClock(40);
      video.readyState = HTMLMediaElement.HAVE_NOTHING;
      wrapper.setTime(41);
      wrapper.setTime(target);
      expect(wrapper.getTime()).toBe(target);
      expect(video.currentTime).toBe(40);
      expect(video.currentTimeSetter).toHaveBeenCalledTimes(1);
      expect(addListener).toHaveBeenCalledTimes(2);
      for (const args of addListener.calls.allArgs()) {
        expect(args[0]).toBe('loadedmetadata');
      }
      expect(removeListener).toHaveBeenCalledTimes(1);
      expect(removeListener).toHaveBeenCalledWith(
          ...addListener.calls.first().args);

      video.seekable = createFakeBuffered([{start: 0, end: 60}]);
      video.readyState = HTMLMediaElement.HAVE_METADATA;
      dispatch('loadedmetadata');
      expect(video.currentTimeSetter).toHaveBeenCalledTimes(2);
      expect(video.currentTimeSetter.calls.mostRecent().args).toEqual([target]);
      expect(video.currentTime).toBe(target);
      expect(addListener).toHaveBeenCalledTimes(3);
      expect(addListener.calls.mostRecent().args[0]).toBe('seeking');
      expect(removeListener).toHaveBeenCalledTimes(3);
      expect(removeListener.calls.mostRecent().args[0]).toBe('seeking');
      jasmine.clock().tick(300);
      expect(video.currentTimeSetter).toHaveBeenCalledTimes(2);
      expect(onStarted).not.toHaveBeenCalled();
      expect(onSeek).not.toHaveBeenCalled();

      dispatch('seeking');
      video.seeking = false;
      jasmine.clock().tick(2000);
      expect(onStarted).toHaveBeenCalledTimes(1);
      expect(onStarted).toHaveBeenCalledWith(target);
      expect(onSeek).not.toHaveBeenCalled();
      expect(wrapper.getTime()).toBe(target);
      expectCompletionCleared(getStartupMover());
      dispatch('loadedmetadata');
      expect(video.currentTimeSetter).toHaveBeenCalledTimes(2);
      dispatch('seeking');
      expect(onSeek).toHaveBeenCalledTimes(1);
      expect(onStarted).toHaveBeenCalledTimes(1);
      expect(shaka.log.warning).not.toHaveBeenCalled();
    });
  }

  it('replaces a pending startup seek with the already current zero', () => {
    createWrapper(30);
    wrapper.setTime(0);
    expect(onStarted).toHaveBeenCalledTimes(1);
    expect(onStarted).toHaveBeenCalledWith(0);
    jasmine.clock().tick(2000);
    expect(wrapper.getTime()).toBe(0);
    expect(video.currentTimeSetter).toHaveBeenCalledTimes(1);
    expectCompletionCleared(getStartupMover());
    dispatch('seeking');
    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(onStarted).toHaveBeenCalledTimes(1);
    expect(shaka.log.warning).not.toHaveBeenCalled();
  });

  it('lets a newer native user seek supersede pending startup', () => {
    createWrapper(30);
    video.advanceClock(0.25);
    jasmine.clock().tick(100);
    video.seekable = createFakeBuffered([{start: 0, end: 60}]);
    video.currentTime = 12;
    dispatch('seeking');
    video.seeking = false;
    const writes = video.currentTimeSetter.calls.count();
    jasmine.clock().tick(2000);
    expect(wrapper.getTime()).toBe(12);
    expect(onStarted).toHaveBeenCalledTimes(1);
    expect(onStarted).toHaveBeenCalledWith(12);
    expect(onSeek).not.toHaveBeenCalled();
    expect(video.currentTimeSetter).toHaveBeenCalledTimes(writes);
    expectCompletionCleared(getStartupMover());

    video.currentTime = 18;
    dispatch('seeking');
    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(onStarted).toHaveBeenCalledTimes(1);
    expect(wrapper.getTime()).toBe(18);
    expect(shaka.log.warning).not.toHaveBeenCalled();
  });

  for (const readyState of [0, 1]) {
    it('releases listeners and pending work at readyState ' +
        readyState, () => {
      video.readyState = readyState;
      /** @type {!jasmine.Spy} */
      const addListener = spyOn(video, 'addEventListener').and.callThrough();
      /** @type {!jasmine.Spy} */
      const removeListener =
          spyOn(video, 'removeEventListener').and.callThrough();
      createWrapper(30);
      const startupMover = getStartupMover();
      spyOn(startupMover, 'release').and.callThrough();
      const writes = video.currentTimeSetter.calls.count();
      expect(addListener).toHaveBeenCalledWith(
          readyState ? 'seeking' : 'loadedmetadata',
          jasmine.any(Function), jasmine.anything());

      wrapper.release();
      wrapper.release();
      expect(startupMover.release).toHaveBeenCalledTimes(1);
      expectCompletionCleared(startupMover);
      expect(removeListener).toHaveBeenCalledTimes(addListener.calls.count());
      for (const args of addListener.calls.allArgs()) {
        expect(removeListener).toHaveBeenCalledWith(...args);
      }
      video.readyState = HTMLMediaElement.HAVE_METADATA;
      video.seekable = createFakeBuffered([{start: 0, end: 60}]);
      dispatch('loadedmetadata');
      dispatch('seeking');
      dispatch('ended');
      dispatch('play');
      jasmine.clock().tick(2000);
      expect(video.currentTimeSetter).toHaveBeenCalledTimes(writes);
      expect(onStarted).not.toHaveBeenCalled();
      expect(onSeek).not.toHaveBeenCalled();
      expect(shaka.log.warning).not.toHaveBeenCalled();
    });
  }

  it('uses the strict startup target over a nonzero time before ' +
      'metadata', () => {
    video.readyState = HTMLMediaElement.HAVE_NOTHING;
    createWrapper(30);
    video.advanceClock(9);
    video.seekable = createFakeBuffered([{start: 0, end: 60}]);
    video.readyState = HTMLMediaElement.HAVE_METADATA;
    dispatch('loadedmetadata');
    expect(video.currentTimeSetter).toHaveBeenCalledWith(30);
    expect(video.currentTime).toBe(30);
    dispatch('seeking');
    jasmine.clock().tick(2000);
    expect(onStarted).toHaveBeenCalledTimes(1);
    expect(onStarted).toHaveBeenCalledWith(30);
    expect(shaka.log.warning).not.toHaveBeenCalled();
  });

  it('preserves the remembered ended pause workaround after startup', () => {
    createWrapper(0);
    video.ended = true;
    dispatch('ended');
    // Native seeking may clear ended before its event is delivered.
    video.ended = false;
    dispatch('seeking');
    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(onSeek).toHaveBeenCalledTimes(1);
    dispatch('seeking');
    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(onSeek).toHaveBeenCalledTimes(2);
    expect(onStarted).toHaveBeenCalledTimes(1);
  });

  it('clears the remembered ended state on play', () => {
    createWrapper(0);
    dispatch('ended');
    dispatch('play');
    dispatch('seeking');
    expect(video.pause).not.toHaveBeenCalled();
    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(onStarted).toHaveBeenCalledTimes(1);
  });

  describe('PlayheadMover', () => {
    /** @param {number} maxAttempts */
    function createMover(maxAttempts) {
      mover = new shaka.media.VideoWrapper.PlayheadMover(
          /** @type {!HTMLMediaElement} */ (/** @type {?} */ (video)),
          maxAttempts);
    }

    it('clears the completion predicate after acknowledgement', () => {
      createMover(3);
      const complete = jasmine.createSpy('complete').and.returnValue(false);
      mover.moveTo(30, shaka.test.Util.spyFunc(complete));
      video.advanceClock(0.25);
      jasmine.clock().tick(100);
      expect(complete).toHaveBeenCalledTimes(1);
      expect(video.currentTimeSetter).toHaveBeenCalledTimes(2);
      complete.and.returnValue(true);
      jasmine.clock().tick(100);
      expectCompletionCleared(mover);
      jasmine.clock().tick(2000);
      expect(complete).toHaveBeenCalledTimes(2);
      expect(video.currentTimeSetter).toHaveBeenCalledTimes(2);
      expect(shaka.log.warning).not.toHaveBeenCalled();
    });

    it('replaces the completion predicate on a newer move', () => {
      createMover(3);
      const first = jasmine.createSpy('first').and.returnValue(false);
      const second = jasmine.createSpy('second').and.returnValue(false);
      mover.moveTo(30, shaka.test.Util.spyFunc(first));
      jasmine.clock().tick(100);
      mover.moveTo(42, shaka.test.Util.spyFunc(second));
      jasmine.clock().tick(100);
      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);
      expect(video.currentTimeSetter.calls.mostRecent().args).toEqual([42]);
      second.and.returnValue(true);
      jasmine.clock().tick(2000);
      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(2);
      expectCompletionCleared(mover);
      expect(shaka.log.warning).not.toHaveBeenCalled();
    });

    it('drops the startup predicate when superseded by an ' +
        'ordinary move', () => {
      createMover(3);
      const complete = jasmine.createSpy('complete').and.returnValue(false);
      mover.moveTo(30, shaka.test.Util.spyFunc(complete));
      jasmine.clock().tick(100);
      mover.moveTo(42);
      expectCompletionCleared(mover);
      video.advanceClock(0.25);
      jasmine.clock().tick(2000);
      expect(complete).toHaveBeenCalledTimes(1);
      expect(video.currentTimeSetter).toHaveBeenCalledTimes(3);
      expect(video.currentTimeSetter.calls.mostRecent().args).toEqual([42]);
      expect(shaka.log.warning).not.toHaveBeenCalled();
    });

    it('clears the completion predicate and timer on release', () => {
      createMover(3);
      const complete = jasmine.createSpy('complete').and.returnValue(false);
      mover.moveTo(30, shaka.test.Util.spyFunc(complete));
      mover.release();
      expectCompletionCleared(mover);
      jasmine.clock().tick(2000);
      expect(complete).not.toHaveBeenCalled();
      expect(video.currentTimeSetter).toHaveBeenCalledTimes(1);
      expect(shaka.log.warning).not.toHaveBeenCalled();
    });

    it('clears the completion predicate on exhaustion', () => {
      createMover(2);
      const complete = jasmine.createSpy('complete').and.returnValue(false);
      mover.moveTo(30, shaka.test.Util.spyFunc(complete));
      jasmine.clock().tick(300);
      expect(complete).toHaveBeenCalledTimes(3);
      expect(video.currentTimeSetter).toHaveBeenCalledTimes(3);
      expect(shaka.log.warning).toHaveBeenCalledTimes(1);
      expectCompletionCleared(mover);
      jasmine.clock().tick(2000);
      expect(complete).toHaveBeenCalledTimes(3);
      expect(video.currentTimeSetter).toHaveBeenCalledTimes(3);
      expect(shaka.log.warning).toHaveBeenCalledTimes(1);
    });

    it('preserves ordinary any-movement completion', () => {
      createMover(3);
      mover.moveTo(30);
      video.advanceClock(0.25);
      jasmine.clock().tick(2000);
      expect(video.currentTime).toBe(0.25);
      expect(video.currentTimeSetter).toHaveBeenCalledTimes(1);
      expect(shaka.log.warning).not.toHaveBeenCalled();
    });

    it('accepts ordinary seeks rounded short of the requested time', () => {
      createMover(3);
      video.seekable = createFakeBuffered([{start: 0, end: 60}]);
      mover.moveTo(30);
      video.advanceClock(-0.00001);
      jasmine.clock().tick(2000);
      expect(video.currentTime).toBeCloseTo(29.99999, 6);
      expect(video.currentTimeSetter).toHaveBeenCalledTimes(1);
      expect(shaka.log.warning).not.toHaveBeenCalled();
    });

    it('does not suppress ordinary retries while seeking', () => {
      createMover(3);
      video.seeking = true;
      mover.moveTo(30);
      jasmine.clock().tick(100);
      expect(video.currentTimeSetter).toHaveBeenCalledTimes(2);
      video.advanceClock(0.25);
      jasmine.clock().tick(2000);
      expect(video.currentTimeSetter).toHaveBeenCalledTimes(2);
      expect(shaka.log.warning).not.toHaveBeenCalled();
    });

    it('accepts an ordinary move already at its target with no budget', () => {
      createMover(0);
      mover.moveTo(0);
      jasmine.clock().tick(2000);
      expect(video.currentTimeSetter).toHaveBeenCalledTimes(1);
      expect(shaka.log.warning).not.toHaveBeenCalled();
    });

    it('bounds ordinary ignored retries and warns only once', () => {
      createMover(3);
      mover.moveTo(30);
      jasmine.clock().tick(300);
      expect(video.currentTimeSetter).toHaveBeenCalledTimes(4);
      expect(shaka.log.warning).not.toHaveBeenCalled();
      jasmine.clock().tick(2000);
      expect(video.currentTimeSetter).toHaveBeenCalledTimes(4);
      expect(shaka.log.warning).toHaveBeenCalledTimes(1);
    });

    for (const [ended, paused] of [
      [true, true], [false, true], [true, false],
    ]) {
      it('preserves pause handling for ended=' + ended +
          ', paused=' + paused, () => {
        createMover(3);
        video.ended = ended;
        video.paused = paused;
        mover.moveTo(30);
        expect(video.pause).toHaveBeenCalledTimes(ended && paused ? 1 : 0);
      });
    }
  });
});
