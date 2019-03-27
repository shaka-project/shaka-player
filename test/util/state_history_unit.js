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

describe('StateHistory', () => {
  /** @type {!shaka.util.StateHistory} */
  let history;

  beforeAll(() => {
    // Mock the clock so that the timing logic inside the state history will be
    // controlled by the test and not the system.
    jasmine.clock().install();
    jasmine.clock().mockDate();
  });

  afterAll(() => {
    jasmine.clock().uninstall();
  });

  beforeEach(() => {
    history = new shaka.util.StateHistory();
  });

  // After a state change, the new state should have no duration. It must have
  // an update after (regardless of state) to update the duration.
  it('open entry have no duration', () => {
    history.update('a');
    jasmine.clock().tick(5000);

    const entries = history.getCopy();
    expect(entries.length).toBe(1);
    expect(entries[0].state).toBe('a');
    expect(entries[0].duration).toBe(0);
  });

  // Updating while in the same state should only add duration to the previous
  // entry.
  it('accumulates time', () => {
    history.update('a');
    jasmine.clock().tick(5000);
    history.update('a');

    const entries = history.getCopy();
    expect(entries.length).toBe(1);
    expect(entries[0].state).toBe('a');
    expect(entries[0].duration).toBe(5);
  });

  it('state changes update duration of last entry', () => {
    history.update('a');
    jasmine.clock().tick(5000);
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
    jasmine.clock().tick(1000);

    history.update('a');
    jasmine.clock().tick(5000);

    history.update('b');
    jasmine.clock().tick(3000);

    history.update('a');
    jasmine.clock().tick(1500);

    history.update('c');
    jasmine.clock().tick(4000);

    history.update('b');
    jasmine.clock().tick(7500);

    // Add another 'b' entry so that the elapsed time will be updated.
    history.update('b');

    expect(history.getTimeSpentIn('a')).toBe(7.5);
    expect(history.getTimeSpentIn('b')).toBe(10.5);
    expect(history.getTimeSpentIn('c')).toBe(4);
  });
});
