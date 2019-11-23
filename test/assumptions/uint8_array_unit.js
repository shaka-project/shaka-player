/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Uint8Array', () => {
  it('checks equality', () => {
    const subject = new Uint8Array([0, 1, 2, 3]);
    const same = new Uint8Array([0, 1, 2, 3]);
    const different = new Uint8Array([4, 5, 6, 7]);

    expect(subject).toBe(subject);
    expect(subject).toEqual(subject);

    expect(subject).not.toBe(same);
    expect(subject).toEqual(same);

    expect(subject).not.toBe(different);
    expect(subject).not.toEqual(different);
  });
});
