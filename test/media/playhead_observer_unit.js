/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('PlayheadObserverManager', () => {
  /** @type {!shaka.test.FakeVideo} */
  let video;
  /** @type {!shaka.media.PlayheadObserverManager} */
  let manager;
  /** @type {!jasmine.Spy} */
  let pollSpy;

  beforeEach(() => {
    video = new shaka.test.FakeVideo();
    // Start paused so that the manager does not schedule its polling loop; we
    // drive the polls from the events under test.
    video.paused = true;

    manager = new shaka.media.PlayheadObserverManager(
        /** @type {!HTMLMediaElement} */(/** @type {?} */(video)));

    pollSpy = jasmine.createSpy('poll');
    const observer = /** @type {!shaka.media.IPlayheadObserver} */ ({
      poll: shaka.test.Util.spyFunc(pollSpy),
      release: () => {},
    });
    manager.manage(observer);
  });

  afterEach(() => {
    manager.release();
  });

  // The end of the media also fires 'pause', which stops the polling loop, so
  // the last poll of the loop lands short of the end. Without a poll on
  // 'ended', a region that starts at the very end of the presentation is never
  // entered.
  it('polls with the duration when playback ends', () => {
    video.currentTime = 19.9;
    video.duration = 20;

    video.on['ended']();

    expect(pollSpy).toHaveBeenCalledTimes(1);
    expect(pollSpy).toHaveBeenCalledWith(20, false);
  });

  it('polls with the current time when the duration is not finite', () => {
    video.currentTime = 19.9;
    video.duration = Infinity;

    video.on['ended']();

    expect(pollSpy).toHaveBeenCalledTimes(1);
    expect(pollSpy).toHaveBeenCalledWith(19.9, false);
  });

  it('polls with the current time on seek', () => {
    video.currentTime = 10;
    video.duration = 20;

    manager.notifyOfSeek(/* seeking= */ true);

    expect(pollSpy).toHaveBeenCalledWith(10, true);
  });
});
