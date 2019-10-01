/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


describe('StallDetector', () => {
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
        /* stallThresholdSeconds= */ 1);

    detector.onStall(shaka.test.Util.spyFunc(onStall));
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
      /* stallDurationms= */ 10,
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

  it('does not call onStall multiple times for same stall', () => {
    implementation.shouldMakeProgress = true;
    implementation.presentationSeconds = 0;
    implementation.wallSeconds = 0;
    detector.poll();
    expect(onStall).not.toHaveBeenCalled();

    implementation.wallSeconds = 10;
    detector.poll();
    expect(onStall).toHaveBeenCalled();
    onStall.calls.reset();

    // This is the same stall, should not be called again.
    implementation.wallSeconds = 20;
    detector.poll();
    expect(onStall).not.toHaveBeenCalled();

    // Now that we changed time, we should get another call.
    implementation.presentationSeconds = 10;
    implementation.wallSeconds = 30;
    detector.poll();
    implementation.wallSeconds = 40;
    detector.poll();
    expect(onStall).toHaveBeenCalled();
  });
});
