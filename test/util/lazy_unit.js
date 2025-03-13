/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Lazy', () => {
  it('returns the same object each time', () => {
    const generator = jasmine.createSpy('generator').and.returnValue({});
    const lazy = new shaka.util.Lazy(shaka.test.Util.spyFunc(generator));
    const value = lazy.value();
    const value2 = lazy.value();
    expect(value).toBe(value2);
    expect(generator).toHaveBeenCalledTimes(1);
  });

  it('works correctly for primitive value', () => {
    const generator = jasmine.createSpy('generator').and.returnValue(7);
    const lazy = new shaka.util.Lazy(shaka.test.Util.spyFunc(generator));
    const value = lazy.value();
    const value2 = lazy.value();
    expect(value).toBe(value2);
    expect(generator).toHaveBeenCalledTimes(1);
  });

  it('works correctly for null', () => {
    const generator = jasmine.createSpy('generator').and.returnValue(null);
    const lazy = new shaka.util.Lazy(shaka.test.Util.spyFunc(generator));
    const value = lazy.value();
    expect(value).toBe(null);
    expect(generator).toHaveBeenCalledTimes(1);
  });
});
