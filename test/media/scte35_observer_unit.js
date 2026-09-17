/*! @license
 * Shaka Player
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Scte35Observer', () => {
  /** @type {!shaka.media.Scte35Timeline} */
  let timeline;
  /** @type {!shaka.media.Scte35Observer} */
  let observer;
  /** @type {!jasmine.Spy} */
  let fired;

  beforeEach(() => {
    timeline = new shaka.media.Scte35Timeline(() => ({start: 0, end: 100}));
    timeline.addEvent(shaka.util.Scte35.fromEmsg(shaka.test.Scte35.emsg()));
    observer = new shaka.media.Scte35Observer(timeline, false);
    fired = jasmine.createSpy('fired');
    observer.addEventListener('scte35', shaka.test.Util.spyFunc(fired));
  });

  afterEach(() => {
    observer.release();
    timeline.release();
  });

  it('fires once when playback crosses a message, regardless of duration',
      () => {
        observer.poll(9.9, false);
        observer.poll(10.1, false);
        observer.poll(11, false);
        observer.poll(71, false);
        expect(fired).toHaveBeenCalledTimes(1);
      });

  it('does not fire for messages skipped by seeking', () => {
    observer.poll(9, false);
    observer.poll(11, true);
    observer.poll(12, false);
    expect(fired).not.toHaveBeenCalled();
  });

  it('fires again after seeking back and replaying', () => {
    observer.poll(9, false);
    observer.poll(11, false);
    observer.poll(9, true);
    observer.poll(11, false);
    expect(fired).toHaveBeenCalledTimes(2);
  });

  it('does not replay late discoveries', () => {
    observer.poll(11, false);
    const event = shaka.util.Scte35.fromEmsg(shaka.test.Scte35.emsg());
    event.startTime = 10.5;
    timeline.addEvent(event);
    observer.poll(12, false);
    expect(fired).not.toHaveBeenCalled();
  });

  it('does not fire before a live playhead has been initialized', () => {
    observer.release();
    observer = new shaka.media.Scte35Observer(timeline, true);
    observer.addEventListener('scte35', shaka.test.Util.spyFunc(fired));
    observer.poll(0, false);
    observer.poll(11, false);
    expect(fired).not.toHaveBeenCalled();
  });

  it('fires a message at the initial playback position', () => {
    observer.poll(10, false);
    observer.poll(10, false);
    expect(fired).toHaveBeenCalledTimes(1);
  });

  it('emits crossed messages in presentation order', () => {
    const event = shaka.test.Scte35.event();
    event.startTime = 9.5;
    timeline.addEvent(event);
    observer.poll(9, false);
    observer.poll(11, false);
    expect(fired.calls.argsFor(0)[0]['detail'].startTime).toBe(9.5);
    expect(fired.calls.argsFor(1)[0]['detail'].startTime).toBe(10);
  });
});
