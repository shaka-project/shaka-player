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

describe('DownloadProgressEstimator', () => {
  /** @type {!shaka.offline.DownloadProgressEstimator} */
  let estimator;

  beforeEach(() => {
    estimator = new shaka.offline.DownloadProgressEstimator();
  });

  it('closing updates total download', () => {
    const id = estimator.open(/* estimate= */ 12);
    estimator.close(id, /* actual= */ 13);

    expect(estimator.getTotalDownloaded()).toBe(13);
  });

  // If we call |close| with an id that was not returned by |open|, then it
  // should be ignored.
  it('closing with invalid id is ignored', () => {
    expect(estimator.getTotalDownloaded()).toBe(0);
    estimator.close(72, /* actual= */ 13);
    expect(estimator.getTotalDownloaded()).toBe(0);
  });

  it('closing the same id twice has no effect', () => {
    expect(estimator.getEstimatedProgress()).toBe(0);

    estimator.open(/* estimate= */ 15);
    const id = estimator.open(/* estimate= */ 5);

    expect(estimator.getEstimatedProgress()).toBe(0);

    estimator.close(id, /* actual= */ 5);
    expect(estimator.getEstimatedProgress()).toBeCloseTo(0.25);
    expect(estimator.getTotalDownloaded()).toBe(5);

    // We will close |id| again, but nothing should change. We will even say
    // the downloaded size is different, but that should not change anything.
    estimator.close(id, /* actual= */ 200);
    expect(estimator.getEstimatedProgress()).toBeCloseTo(0.25);
    expect(estimator.getTotalDownloaded()).toBe(5);
  });

  // Calling both |open| and |close| should affect our progress. Calling |open|
  // should cause our progress to grow smaller (we are saying there is more work
  // to do) and calling |close| should cause our progress to grow larger (we are
  // saying we completed work).
  it('opening and closing updates progress', () => {
    expect(estimator.getEstimatedProgress()).toBe(0);

    const id0 = estimator.open(/* estimate= */ 5);
    const id1 = estimator.open(/* estimate= */ 15);

    expect(estimator.getEstimatedProgress()).toBe(0);

    estimator.close(id0, /* actual= */ 5);
    expect(estimator.getEstimatedProgress()).toBeCloseTo(0.25);

    estimator.close(id1, /* actual= */ 15);
    expect(estimator.getEstimatedProgress()).toBeCloseTo(1.0);

    // Open a new estimate with a size equal to all previous estimates. Since
    // everything else was closed, this should drop our progress from 100% to
    // 50%.
    estimator.open(/* estimate= */ 20);
    expect(estimator.getEstimatedProgress()).toBeCloseTo(0.5);
  });

  // When tracking progress, we want to use the estimated size. This means no
  // matter what value we provide for the actual downloaded size, it should not
  // affect the progress (the original estimate should be used).
  it('actual bytes do not affect progres', () => {
    expect(estimator.getEstimatedProgress()).toBe(0);

    estimator.open(/* estimate= */ 15);
    const id = estimator.open(/* estimate= */ 5);

    expect(estimator.getEstimatedProgress()).toBe(0);

    // Use an actual value so large that if used for progress, it would break
    // the progress value bounds.
    estimator.close(id, /* actual= */ 200);
    expect(estimator.getEstimatedProgress()).toBeCloseTo(0.25);
  });
});
