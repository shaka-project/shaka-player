/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('StateHistory', () => {
  const oldDateNow = Date.now;

  /** @type {!shaka.util.StateHistory} */
  let history;
  /** @type {number} */
  let currentTime;

  beforeAll(() => {
    Date.now = () => currentTime;
  });

  afterAll(() => {
    Date.now = oldDateNow;
  });

  beforeEach(() => {
    currentTime = 0;
    history = new shaka.util.StateHistory();
  });

  // After a state change, the new state should have no duration. It must have
  // an update after (regardless of state) to update the duration.
  it('open entry have no duration', () => {
    history.update('a');
    currentTime += 5000;

    const entries = history.getCopy();
    expect(entries.length).toBe(1);
    expect(entries[0].state).toBe('a');
    expect(entries[0].duration).toBe(0);
  });

  // Updating while in the same state should only add duration to the previous
  // entry.
  it('accumulates time', () => {
    history.update('a');
    currentTime += 5000;
    history.update('a');

    const entries = history.getCopy();
    expect(entries.length).toBe(1);
    expect(entries[0].state).toBe('a');
    expect(entries[0].duration).toBe(5);
  });

  it('state changes update duration of last entry', () => {
    history.update('a');
    currentTime += 5000;
    history.update('b');

    const entries = history.getCopy();
    expect(entries.length).toBe(2);
    expect(entries[0].state).toBe('a');
    expect(entries[0].duration).toBe(5);
    expect(entries[1].state).toBe('b');
    expect(entries[1].duration).toBe(0);
  });

  it('sum of missing entry is zero', () => {
    expect(history.getTimeSpentIn('a')).toBe(0);
  });

  it('sum of open entry is zero', () => {
    history.update('a');
    expect(history.getTimeSpentIn('a')).toBe(0);
  });

  it('sums all entries of one state', () => {
    history.update('a');
    currentTime += 1000;

    history.update('a');
    currentTime += 5000;

    history.update('b');
    currentTime += 3000;

    history.update('a');
    currentTime += 1500;

    history.update('c');
    currentTime += 4000;

    history.update('b');
    currentTime += 7500;

    // Add another 'b' entry so that the elapsed time will be updated.
    history.update('b');

    expect(history.getTimeSpentIn('a')).toBe(7.5);
    expect(history.getTimeSpentIn('b')).toBe(10.5);
    expect(history.getTimeSpentIn('c')).toBe(4);
  });
});
