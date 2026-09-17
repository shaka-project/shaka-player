/*! @license
 * Shaka Player
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Scte35Timeline', () => {
  const Fixtures = shaka.test.Scte35;
  /** @type {!shaka.media.Scte35Timeline} */
  let timeline;
  /** @type {!jasmine.Spy} */
  let added;
  /** @type {!jasmine.Spy} */
  let updated;
  let start;

  beforeEach(() => {
    jasmine.clock().install();
    start = 0;
    timeline = new shaka.media.Scte35Timeline(() => ({start, end: 100}));
    added = jasmine.createSpy('added');
    updated = jasmine.createSpy('updated');
    timeline.addEventListener('scte35added', shaka.test.Util.spyFunc(added));
    timeline.addEventListener('scte35updated',
        shaka.test.Util.spyFunc(updated));
  });

  afterEach(() => {
    timeline.release();
    jasmine.clock().uninstall();
  });

  it('deduplicates repeated messages', () => {
    timeline.addEvent(shaka.util.Scte35.fromRegion(Fixtures.region()));
    timeline.addEvent(shaka.util.Scte35.fromRegion(Fixtures.region()));
    expect(added).toHaveBeenCalledTimes(1);
    expect(updated).not.toHaveBeenCalled();
  });

  it('deduplicates equivalent XML and binary and retains their origins', () => {
    timeline.addEvent(shaka.util.Scte35.fromRegion(Fixtures.region()));
    timeline.addEvent(shaka.util.Scte35.fromEmsg(Fixtures.emsg()));
    timeline.addEvent(shaka.util.Scte35.fromEmsg(Fixtures.emsg()));
    expect(added).toHaveBeenCalledTimes(1);
    expect(updated).toHaveBeenCalledTimes(1);
    const events = Array.from(timeline.events());
    expect(events.length).toBe(1);
    expect(events[0].origins.map((o) => o.source)).toEqual(['dash', 'emsg']);
  });

  it('updates confirmed duration without adding another message', () => {
    const event = shaka.util.Scte35.fromRegion(Fixtures.region());
    event.duration = null;
    event.plannedDuration = 60;
    timeline.addEvent(event);
    event.duration = 59.993;
    timeline.addEvent(event);
    expect(added).toHaveBeenCalledTimes(1);
    expect(updated).toHaveBeenCalledTimes(1);
    expect(Array.from(timeline.events())[0].duration).toBe(59.993);
  });

  it('preserves distinct messages less than a tenth of a second apart', () => {
    const event = shaka.util.Scte35.fromEmsg(Fixtures.emsg());
    event.startTime = 10.01;
    timeline.addEvent(event);
    event.startTime = 10.02;
    timeline.addEvent(event);
    expect(added).toHaveBeenCalledTimes(2);
  });

  it('preserves different simultaneous emsg messages with reused IDs', () => {
    timeline.addEvent(shaka.util.Scte35.fromEmsg(Fixtures.emsg()));
    timeline.addEvent(shaka.util.Scte35.fromEmsg(
        Fixtures.emsg(Fixtures.signal())));
    expect(added).toHaveBeenCalledTimes(2);
  });

  it('preserves different messages at a boundary between DASH Periods', () => {
    timeline.addEvent(shaka.util.Scte35.fromRegion(Fixtures.region(), '0'));
    timeline.addEvent(shaka.util.Scte35.fromRegion(
        Fixtures.region(Fixtures.signalXml()), '10'));
    expect(added).toHaveBeenCalledTimes(2);
  });

  it('does not overwrite HLS confirmed duration with repeated emsg envelopes',
      () => {
        const event = shaka.test.Scte35.event();
        event.origins[0].source = 'hls';
        event.kind = 'out';
        event.duration = 59.993;
        timeline.addEvent(event);
        timeline.addEvent(shaka.test.Scte35.event());
        const emsg = shaka.test.Scte35.event();
        emsg.duration = 0;
        timeline.addEvent(emsg);
        expect(added).toHaveBeenCalledTimes(1);
        expect(updated).toHaveBeenCalledTimes(1);
        expect(Array.from(timeline.events())[0].duration).toBe(59.993);
        expect(Array.from(timeline.events())[0].kind).toBe('out');
      });

  it('updates payloads for a stable manifest identity', () => {
    timeline.addEvent(shaka.util.Scte35.fromRegion(Fixtures.region()));
    timeline.addEvent(shaka.util.Scte35.fromRegion(
        Fixtures.region(Fixtures.signalXml())));
    expect(added).toHaveBeenCalledTimes(1);
    expect(updated).toHaveBeenCalledTimes(1);
    expect(Array.from(timeline.events())[0].command.type).toBe(6);
  });

  it('isolates messages from listeners and caller mutations', () => {
    const event = shaka.util.Scte35.fromEmsg(Fixtures.emsg());
    timeline.addEvent(event);
    event.data.fill(0);
    event.command.spliceEventId = 0;
    const dispatched = added.calls.argsFor(0)[0]['detail'];
    dispatched.data.fill(0);
    dispatched.command.spliceEventId = 0;
    const stored = Array.from(timeline.events())[0];
    expect(stored.data).toEqual(Fixtures.insert());
    expect(stored.command.spliceEventId).toBe(1234);
  });

  it('prunes inaccessible messages and their deduplication state', () => {
    const event = shaka.util.Scte35.fromEmsg(Fixtures.emsg());
    event.duration = null;
    timeline.addEvent(event);
    start = 11;
    jasmine.clock().tick(2001);
    expect(Array.from(timeline.events())).toEqual([]);
    timeline.addEvent(event);
    expect(added).toHaveBeenCalledTimes(1);
    start = 0;
    timeline.addEvent(event);
    expect(added).toHaveBeenCalledTimes(2);
  });

  it('does not postpone cleanup when new messages keep arriving', () => {
    const event = shaka.test.Scte35.event();
    event.duration = null;
    timeline.addEvent(event);
    jasmine.clock().tick(1000);
    event.startTime = 20;
    timeline.addEvent(event);
    start = 11;
    jasmine.clock().tick(1001);
    expect(Array.from(timeline.events()).map((e) => e.startTime)).toEqual([20]);
  });

  it('does not restart after release', () => {
    timeline.release();
    timeline.addEvent(shaka.test.Scte35.event());
    expect(Array.from(timeline.events())).toEqual([]);
    expect(added).not.toHaveBeenCalled();
  });
});
