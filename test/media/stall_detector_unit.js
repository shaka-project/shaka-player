/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('StallDetector', () => {
  const Util = shaka.test.Util;

  /**
   * @implements {shaka.media.StallDetector.Implementation}
   * @final
   */
  class TestImplementation {
    constructor() {
      /** @type {boolean} */
      this.shouldMakeProgress = true;
      /** @type {number} */
      this.presentationSeconds = 0;
      /** @type {number} */
      this.wallSeconds = 0;
    }

    /** @override */
    shouldBeMakingProgress() { return this.shouldMakeProgress; }

    /** @override */
    getPresentationSeconds() { return this.presentationSeconds; }

    /** @override */
    getWallSeconds() { return this.wallSeconds; }

    /** @override */
    release() {}
  }

  /** @type {!TestImplementation} */
  let implementation;

  /** @type {!shaka.media.StallDetector} */
  let detector;

  /** @type {!jasmine.Spy} */
  let onStall;

  beforeEach(() => {
    onStall = jasmine.createSpy('onStall');

    implementation = new TestImplementation();

    detector = new shaka.media.StallDetector(
        implementation,
        /* stallThresholdSeconds= */ 1,
        Util.spyFunc(onStall));
  });

  it('does not call onStall when values changes', () => {
    // Keep setting the value to a new value, we will use the time to make
    // it easier to write.
    implementation.presentationSeconds = 5;
    implementation.wallSeconds = 5;

    detector.poll();

    implementation.presentationSeconds = 10;
    implementation.wallSeconds = 10;

    detector.poll();

    expect(onStall).not.toHaveBeenCalled();
  });

  it('calls onStall when value is updated but not changed', () => {
    // Update the detector with a value of |5| every time. After the value has
    // been |5| for a second, we should see |onStall| called.
    for (const time of [0, 0.25, 0.5, 0.75]) {
      implementation.presentationSeconds = 5;
      implementation.wallSeconds = time;

      detector.poll();
      expect(onStall).not.toHaveBeenCalled();
    }

    implementation.presentationSeconds = 5;
    implementation.wallSeconds = 1;

    detector.poll();
    expect(onStall).toHaveBeenCalledOnceMoreWith([
      /* stalledWith= */ 5,
      /* stallDurationSeconds= */ 1,
      /* retryNumber= */ 0,
    ]);
  });

  it('calls onStall when value is not changed after long delay', () => {
    implementation.presentationSeconds = 5;

    implementation.wallSeconds = 0;
    detector.poll();

    implementation.wallSeconds = 10;
    detector.poll();

    expect(onStall).toHaveBeenCalledOnceMoreWith([
      /* stalledWith= */ 5,
      /* stallDurationMs= */ 10,
      /* retryNumber= */ 0,
    ]);
  });

  it('does not call onStall when it should not be making progress', () => {
    implementation.shouldMakeProgress = false;

    implementation.presentationSeconds = 0;
    implementation.wallSeconds = 0;

    detector.poll();

    // Move the wall time forward, but since we should not be making progress
    // we should not see the event called.
    implementation.presentationSeconds = 0;
    implementation.wallSeconds = 10;

    detector.poll();

    expect(onStall).not.toHaveBeenCalled();
  });

  it('does not call onStall when changing "making progress"', () => {
    implementation.shouldMakeProgress = false;
    implementation.presentationSeconds = 0;
    implementation.wallSeconds = 0;
    detector.poll();

    expect(onStall).not.toHaveBeenCalled();

    // Change us to expect progress. We don't want to see |onStall| since we
    // have not been stalled.
    implementation.shouldMakeProgress = true;
    implementation.presentationSeconds = 0;
    implementation.wallSeconds = 10;
    detector.poll();

    expect(onStall).not.toHaveBeenCalled();
  });

  it('retries onStall while the stall persists, up to the limit', () => {
    implementation.shouldMakeProgress = true;
    implementation.presentationSeconds = 5;
    implementation.wallSeconds = 0;
    detector.poll();
    expect(onStall).not.toHaveBeenCalled();

    // The initial attempt happens after the stall threshold.
    implementation.wallSeconds = 1;
    detector.poll();
    expect(onStall).toHaveBeenCalledOnceMoreWith([
      /* stalledWith= */ 5,
      /* stallDurationSeconds= */ 1,
      /* retryNumber= */ 0,
    ]);

    // Polling again before a full threshold has passed since the last
    // attempt should not retry yet.
    detector.poll();
    implementation.wallSeconds = 1.5;
    detector.poll();
    expect(onStall).not.toHaveBeenCalled();

    // First retry, one threshold after the previous attempt.
    implementation.wallSeconds = 2;
    detector.poll();
    expect(onStall).toHaveBeenCalledOnceMoreWith([
      /* stalledWith= */ 5,
      /* stallDurationSeconds= */ 2,
      /* retryNumber= */ 1,
    ]);

    // Second and last retry.
    implementation.wallSeconds = 3;
    detector.poll();
    expect(onStall).toHaveBeenCalledOnceMoreWith([
      /* stalledWith= */ 5,
      /* stallDurationSeconds= */ 3,
      /* retryNumber= */ 2,
    ]);

    // The retry limit has been reached, so the same stall should not
    // trigger any more attempts.
    implementation.wallSeconds = 30;
    detector.poll();
    expect(onStall).not.toHaveBeenCalled();
  });

  it('resets the retry limit when progress is made', () => {
    implementation.shouldMakeProgress = true;
    implementation.presentationSeconds = 5;
    implementation.wallSeconds = 0;
    detector.poll();

    // Exhaust all the attempts for the first stall.
    for (const time of [1, 2, 3, 30]) {
      implementation.wallSeconds = time;
      detector.poll();
    }
    expect(onStall).toHaveBeenCalledTimes(
        1 + shaka.media.StallDetector.MAX_STALL_RETRIES);
    onStall.calls.reset();

    // Progress resets the limit, so a new stall triggers again.
    implementation.presentationSeconds = 10;
    implementation.wallSeconds = 31;
    detector.poll();
    expect(onStall).not.toHaveBeenCalled();

    implementation.wallSeconds = 32;
    detector.poll();
    expect(onStall).toHaveBeenCalledOnceMoreWith([
      /* stalledWith= */ 10,
      /* stallDurationSeconds= */ 1,
      /* retryNumber= */ 0,
    ]);
  });
});
