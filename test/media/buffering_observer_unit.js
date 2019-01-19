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

describe('BufferingObserver', () => {
  const BufferingObserver = shaka.media.BufferingObserver;

  /** @type {!shaka.media.BufferingObserver} */
  let observer;

  /** @type {!jasmine.Spy} */
  let onStarving;
  /** @type {!jasmine.Spy} */
  let onSatisfied;

  /** @type {!jasmine.Spy} */
  let isBufferedToEndSpy;
  /** @type {!jasmine.Spy} */
  let getBufferedAfterSpy;

  beforeEach(() => {
    onStarving = jasmine.createSpy('onStarving');
    onSatisfied = jasmine.createSpy('onSatisfied');

    isBufferedToEndSpy = jasmine.createSpy('isBufferedToEnd');
    getBufferedAfterSpy = jasmine.createSpy('getBufferedSecondsAfter');
  });

  afterEach(() => {
    observer.release();
  });

  describe('when satisfied', () => {
    const Util = shaka.test.Util;

    beforeEach(() => {
      observer = new BufferingObserver(
          /* thresholdAfterStarving= */ 5,
          /* initialState= */ BufferingObserver.State.SATISFIED,
          /* getSecondsBufferedAfter= */ Util.spyFunc(getBufferedAfterSpy),
          /* isBufferedToEnd= */ Util.spyFunc(isBufferedToEndSpy));
      observer.setListeners(
          /* onStarving= */ Util.spyFunc(onStarving),
          /* onSatisfied= */ Util.spyFunc(onSatisfied));
    });

    it('is starving when approaching end of buffered region', () => {
      // Move the playhead to be just before the end of the buffered region.
      // This move us from "satisfied" to "starving", firing an event.
      expect(onStarving).toHaveBeenCalledTimes(0);

      poll(observer,
          /* currentTime= */ 59.9,
          /* startOfBufferInSeconds= */ 0,
          /* endOfBufferInSeconds= */ 60,
          /* bufferedToEnd= */ false);
      expect(onStarving).toHaveBeenCalledTimes(1);
    });

    it('is starving when jumping to unbuffered region', () => {
      // Move the playhead to a state where it will be seen as starving. This
      // will cause us to change from "satisfied" to "starving", firing the
      // event.
      expect(onStarving).toHaveBeenCalledTimes(0);
      poll(observer,
          /* currentTime= */ 100,
          /* startOfBufferInSeconds= */ 0,
          /* endOfBufferInSeconds= */ 60,
          /* bufferedToEnd= */ false);
      expect(onStarving).toHaveBeenCalledTimes(1);
    });

    // Just because we say once that we have buffered to the end, it does not
    // mean that the "end" will not change. For example, with live content, we
    // say the live edge is the "end". The live edge can and will move.
    it('is starving if buffered to end changes back to false', () => {
      expect(onStarving).toHaveBeenCalledTimes(0);
      expect(onSatisfied).toHaveBeenCalledTimes(0);

      // Move us from satisfied to starving by positioning us at the end of the
      // buffered range but say we have not buffered to the end.
      poll(observer,
          /* currentTime= */ 30,
          /* startOfBufferInSeconds= */ 0,
          /* endOfBufferInSeconds= */ 30,
          /* bufferedToEnd= */ false);

      expect(onStarving).toHaveBeenCalledTimes(1);
      expect(onSatisfied).toHaveBeenCalledTimes(0);

      // Move us from starving to satisfied by keeping us at the end of the
      // buffered range but now say that we have buffered to the end of the end.
      poll(observer,
          /* currentTime= */ 30,
          /* startOfBufferInSeconds= */ 0,
          /* endOfBufferInSeconds= */ 30,
          /* bufferedToEnd= */ true);

      expect(onStarving).toHaveBeenCalledTimes(1);
      expect(onSatisfied).toHaveBeenCalledTimes(1);

      // Move us from satisfied to starving again by keeping us at the end of
      // the buffered range but "move" the end so that we are no longer buffered
      // to the end.
      poll(observer,
          /* currentTime= */ 30,
          /* startOfBufferInSeconds= */ 0,
          /* endOfBufferInSeconds= */ 30,
          /* bufferedToEnd= */ false);

      expect(onStarving).toHaveBeenCalledTimes(2);
      expect(onSatisfied).toHaveBeenCalledTimes(1);
    });

    // As the playhead approaches the end of the buffered range, we should
    // remain satisfied since we will be buffered to the end of the
    // presentation.
    it('remains satisfied when content is buffered to the end', () => {
      expect(onStarving).toHaveBeenCalledTimes(0);
      expect(onSatisfied).toHaveBeenCalledTimes(0);

      // "Play" through the presentation with a very small step; this will
      // allow us to move into the starvation gap, but because we are buffered
      // to the end, we should never enter the starving state.
      for (let time = 0; time <= 30; time += 0.1) {
        poll(observer,
            time,
            /* startOfBufferInSeconds= */ 0,
            /* endOfBufferInSeconds= */ 30,
            /* bufferedToEnd= */ true);
      }

      expect(onStarving).toHaveBeenCalledTimes(0);
      expect(onSatisfied).toHaveBeenCalledTimes(0);
    });

    // Make sure that we stay satisfied while enough content is buffered. We
    // should not see |onStarving| while moving around the buffered range.
    it('remains satisfied when enough content is buffered', () => {
      expect(onStarving).toHaveBeenCalledTimes(0);
      expect(onSatisfied).toHaveBeenCalledTimes(0);

      // "Play" through the presentation with a very small step; this will
      // allow us to move into the starvation gap, but because we are buffered
      // to the end, we should never enter the starving state.
      for (let time = 10; time <= 20; time += 1) {
        poll(observer,
            time,
            /* startOfBufferInSeconds= */ 0,
            /* endOfBufferInSeconds= */ 30,
            /* bufferedToEnd= */ false);
      }

      expect(onStarving).toHaveBeenCalledTimes(0);
      expect(onSatisfied).toHaveBeenCalledTimes(0);
    });
  });

  describe('when starving', () => {
    beforeEach(() => {
      const Util = shaka.test.Util;

      observer = new BufferingObserver(
          /* thresholdAfterStarving= */ 5,
          /* initialState= */ BufferingObserver.State.STARVING,
          /* getSecondsBufferedAfter= */ Util.spyFunc(getBufferedAfterSpy),
          /* isBufferedToEnd= */ Util.spyFunc(isBufferedToEndSpy));
      observer.setListeners(
          /* onStarving= */ Util.spyFunc(onStarving),
          /* onSatisfied= */ Util.spyFunc(onSatisfied));
    });

    it('becomes satisfied when enough content is buffered', () => {
      expect(onSatisfied).toHaveBeenCalledTimes(0);

      // We will be at time=30 and buffered up to time=30. We will need to
      // buffer up to time=35 before we move to satisfied.
      const currentTime = 30;

      // Since we are starving, we need to have 5 seconds of content buffered
      // before we will moved to satisfied. Move bit-by-bit as we approach 5
      // seconds. Until we reach 5 seconds worth of buffered lead, we should
      // not see a call to |onSatisfied|.
      for (let delta = 0; delta <= 4; delta++) {
        poll(observer,
            currentTime,
            /* startOfBufferInSeconds= */ 0,
            /* endOfBufferInSeconds= */ currentTime + delta,
            /* bufferedToEnd= */ false);

        expect(onSatisfied).toHaveBeenCalledTimes(0);
      }

      // Finally we will have 5 seconds worth of buffered content, we should
      // see a call to |onSatisfied|.
      poll(observer,
          currentTime,
          /* startOfBufferInSeconds= */ 0,
          /* endOfBufferInSeconds= */ currentTime + 5,
          /* bufferedToEnd= */ false);

      expect(onSatisfied).toHaveBeenCalledTimes(1);
    });

    it('becomes satisfied when the end is buffered', () => {
      expect(onSatisfied).toHaveBeenCalledTimes(0);

      // We will be at time=0 and buffered up to time=3, which is less than
      // the 5 second threshold to be satisfied.
      poll(observer,
          /* currentTime= */ 0,
          /* startOfBufferInSeconds= */ 0,
          /* endOfBufferInSeconds= */ 3,
          /* bufferedToEnd= */ false);
      expect(onSatisfied).toHaveBeenCalledTimes(0);

      // If this is the end, though, we should be satisfied.
      poll(observer,
          /* currentTime= */ 0,
          /* startOfBufferInSeconds= */ 0,
          /* endOfBufferInSeconds= */ 3,
          /* bufferedToEnd= */ true);

      expect(onSatisfied).toHaveBeenCalledTimes(1);
    });

    // TODO: Move this test. This test focuses on the function that determines
    //       how much content we have buffered ahead of the playhead rather.
    //       That responsibility is now assigned in |Player|, and not part
    //       of the observer.
    xit('becomes satisfied with small non-zero start time', () => {
      poll(observer,
          /* positionInSeconds= */ 0,
          /* startOfBufferInSeconds= */ 0.2,
          /* endOfBufferInSeconds= */ 20,
          /* bufferedToEnd= */ false);

      expect(onSatisfied).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * @param {!shaka.media.IPlayheadObserver} observer
   * @param {number} positionInSeconds
   * @param {number} startOfBufferInSeconds
   * @param {number} endOfBufferInSeconds
   * @param {boolean} isBufferedToEnd
   */
  function poll(
      observer,
      positionInSeconds,
      startOfBufferInSeconds,
      endOfBufferInSeconds,
      isBufferedToEnd) {
    getBufferedAfterSpy.and.callFake((timeInSeconds) => {
      if (positionInSeconds < startOfBufferInSeconds) {
        return 0;
      }
      if (positionInSeconds > endOfBufferInSeconds) {
        return 0;
      }

      return endOfBufferInSeconds - positionInSeconds;
    });

    isBufferedToEndSpy.and.returnValue(isBufferedToEnd);

    observer.poll(positionInSeconds, /* seeking = */ false);
  }
});
