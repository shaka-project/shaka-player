/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('BufferingObserver', () => {
  const BufferingObserver = shaka.media.BufferingObserver;
  const State = shaka.media.BufferingObserver.State;

  const thresholdAfterStarving = 5;
  const thresholdAfterSatisfied = 2;

  const originalDateNow = Date.now;

  /** @type {!Date} */
  let baseTime;

  /** @type {!shaka.media.BufferingObserver} */
  let controller;

  beforeEach(() => {
    // Any test using Date needs to have Date mocked to avoid flake.
    baseTime = new Date(2015, 11, 30);
    Date.now = () => baseTime.getTime();

    controller = new BufferingObserver(
        thresholdAfterStarving,
        thresholdAfterSatisfied);
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  describe('when satisfied', () => {
    beforeEach(() => {
      controller.setState(State.SATISFIED);
      expect(controller.getState()).toBe(State.SATISFIED);
    });

    it('is starving when approaching end of buffered region', () => {
      const changed = controller.update(/* lead= */ 0.1, /* toEnd= */ false);
      expect(changed).toBeTruthy();
      expect(controller.getState()).toBe(State.STARVING);
    });

    it('is starving when jumping to unbuffered region', () => {
      const changed = controller.update(/* lead= */ 0, /* toEnd= */ false);
      expect(changed).toBeTruthy();
      expect(controller.getState()).toBe(State.STARVING);
    });

    // Just because we say once that we have buffered to the end, it does not
    // mean that the "end" will not change. For example, with live content, we
    // say the live edge is the "end". The live edge can and will move.
    it('is starving if buffered to end changes back to false', () => {
      /** @type {boolean} */
      let changed;

      // Move us from satisfied to starving by positioning us at the end of the
      // buffered range but say we have not buffered to the end.
      changed = controller.update(/* lead= */ 0, /* toEnd= */ false);
      expect(changed).toBeTruthy();
      expect(controller.getState()).toBe(State.STARVING);

      // Move us from starving to satisfied by keeping us at the end of the
      // buffered range but now say that we have buffered to the end of the end.
      changed = controller.update(/* lead= */ 0, /* toEnd= */ true);
      expect(changed).toBeTruthy();
      expect(controller.getState()).toBe(State.SATISFIED);

      // Move us from satisfied to starving again by keeping us at the end of
      // the buffered range but "move" the end so that we are no longer buffered
      // to the end.
      changed = controller.update(/* lead= */ 0, /* toEnd= */ false);
      expect(changed).toBeTruthy();
      expect(controller.getState()).toBe(State.STARVING);
    });

    // As the playhead approaches the end of the buffered range, we should
    // remain satisfied since we will be buffered to the end of the
    // presentation.
    it('remains satisfied when content is buffered to the end', () => {
      // "Play" through the presentation with a very small step; this will
      // allow us to move into the starvation gap, but because we are buffered
      // to the end, we should never enter the starving state.
      for (let time = 0; time <= 30; time += 0.1) {
        const bufferLead = 30 - time;
        const changed = controller.update(bufferLead, /* toEnd= */ true);
        expect(changed).toBeFalsy();
      }

      expect(controller.getState()).toBe(State.SATISFIED);
    });

    // Make sure that we stay satisfied while enough content is buffered. We
    // should not see |onStarving| while moving around the buffered range.
    it('remains satisfied when enough content is buffered', () => {
      // "Play" through the presentation with a very small step; this will
      // allow us to move into the starvation gap, but because we are buffered
      // to the end, we should never enter the starving state.
      for (let time = 10; time <= 20; time += 1) {
        const bufferLead = 30 - time;
        const changed = controller.update(bufferLead, /* toEnd= */ false);
        expect(changed).toBeFalsy();
      }

      expect(controller.getState()).toBe(State.SATISFIED);
    });
  });

  describe('when starving', () => {
    beforeEach(() => {
      controller.setState(State.STARVING);
      expect(controller.getState()).toBe(State.STARVING);
      expect(controller.getLastRebufferTime()).toBe(0);
    });

    it('becomes satisfied when enough content is buffered', () => {
      // Since we are starving, we need to have 5 seconds of content buffered
      // before we will moved to satisfied. Move bit-by-bit as we approach 5
      // seconds. Until we reach 5 seconds worth of buffered lead, we should not
      // see a change to satisfied.

      /** @type {boolean} */
      let changed;

      for (let lead = 0; lead < 5; lead++) {
        changed = controller.update(lead, /* toEnd= */ false);
        expect(changed).toBeFalsy();
      }

      // Finally we will have 5 seconds worth of buffered content, we should
      // see a call to |onSatisfied|.
      changed = controller.update(/* lead= */ 5, /* toEnd= */ false);
      expect(changed).toBeTruthy();
      expect(controller.getState()).toBe(State.SATISFIED);
      expect(controller.getLastRebufferTime()).toBe(Date.now());
    });

    it('becomes satisfied when the end is buffered', () => {
      /** @type {boolean} */
      let changed;

      // We will be at time=0 and buffered up to time=3, which is less than
      // the 5 second threshold to be satisfied.
      changed = controller.update(/* lead= */ 3, /* toEnd= */ false);
      expect(changed).toBeFalsy();
      expect(controller.getState()).toBe(State.STARVING);

      // If this is the end, though, we should be satisfied.
      changed = controller.update(/* lead= */ 3, /* toEnd= */ true);
      expect(changed).toBeTruthy();
      expect(controller.getState()).toBe(State.SATISFIED);
      expect(controller.getLastRebufferTime()).toBe(Date.now());
    });
  });

  it('reports starving state when seeking', () => {
    controller.reportEvent(shaka.util.MediaElementEvent.SEEKING);
    expect(controller.getState()).toBe(State.STARVING);
  });

  it('reports satisfied state when playing', () => {
    controller.reportEvent(shaka.util.MediaElementEvent.PLAYING);
    expect(controller.getState()).toBe(State.SATISFIED);
  });
});
