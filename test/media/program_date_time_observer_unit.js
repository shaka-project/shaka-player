/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('ProgramDateTimeObserver', () => {
  /** @type {!shaka.media.PresentationTimeline} */
  let timeline;
  /** @type {!shaka.media.ProgramDateTimeObserver} */
  let observer;
  /** @type {!jasmine.Spy} */
  let onChange;

  beforeEach(() => {
    timeline = new shaka.media.PresentationTimeline(null, 0);
    // A discontinuity at presentation time 30 jumps the PDT forward by an
    // extra 1000s relative to the continuous timeline.
    timeline.setProgramDateTimeRegions([
      {start: 0, pdt: 1000},
      {start: 30, pdt: 1030 + 1000},
    ]);

    observer = new shaka.media.ProgramDateTimeObserver(timeline);
    onChange = jasmine.createSpy('onChange');
    observer.addEventListener('change', (event) => {
      shaka.test.Util.spyFunc(onChange)(
          event['programDateTime'], event['timestamp']);
    });
  });

  afterEach(() => {
    observer.release();
  });

  it('does not fire for the region the playhead starts in', () => {
    observer.poll(/* position= */ 10, /* seeking= */ false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('fires when crossing into a new region', () => {
    observer.poll(/* position= */ 10, /* seeking= */ false);
    expect(onChange).not.toHaveBeenCalled();

    observer.poll(/* position= */ 35, /* seeking= */ false);
    expect(onChange).toHaveBeenCalledOnceMoreWith(
        [new Date((1030 + 1000) * 1000), 30]);
  });

  it('does not fire again while staying in the same region', () => {
    observer.poll(/* position= */ 10, /* seeking= */ false);
    observer.poll(/* position= */ 35, /* seeking= */ false);
    expect(onChange).toHaveBeenCalledTimes(1);

    observer.poll(/* position= */ 40, /* seeking= */ false);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('fires when seeking into a different region', () => {
    observer.poll(/* position= */ 5, /* seeking= */ false);
    expect(onChange).not.toHaveBeenCalled();

    observer.poll(/* position= */ 50, /* seeking= */ true);
    expect(onChange).toHaveBeenCalledOnceMoreWith(
        [new Date((1030 + 1000) * 1000), 30]);
  });

  it('does not fire when there are no regions', () => {
    timeline.setProgramDateTimeRegions([]);

    observer.poll(/* position= */ 10, /* seeking= */ false);
    observer.poll(/* position= */ 35, /* seeking= */ false);
    expect(onChange).not.toHaveBeenCalled();
  });
});
