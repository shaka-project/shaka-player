/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('NumberUtils', () => {
  const NumberUtils = shaka.util.NumberUtils;

  it('compares float', () => {
    expect(NumberUtils.isFloatEqual(0.1 + 0.2, 0.3)).toBe(true);
    expect(NumberUtils.isFloatEqual(0.4 - 0.1, 0.3)).toBe(true);
    expect(NumberUtils.isFloatEqual(0.0004, 0.0003)).toBe(false);
  });

  it('respects provided tolerance margin', () => {
    expect(NumberUtils.isFloatEqual(1.5, 1.4)).toBe(false);
    expect(NumberUtils.isFloatEqual(1.5, 1.4, 0.1)).toBe(true);
  });
});
