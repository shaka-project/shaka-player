/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Error', () => {
  // Regression test for https://github.com/shaka-project/shaka-player/issues/10339
  // shaka.util.Error intentionally does not extend the native Error type.
  // This lets apps distinguish an unhandled native error from a
  // Shaka-specific error via `instanceof Error`, as documented in
  // docs/tutorials/errors.md.  If this ever starts failing, do not "fix" it
  // by making shaka.util.Error extend Error — see the class-level JSDoc in
  // lib/util/error.js for the tradeoffs (it would also break error
  // reconstruction across the Cast bus in shaka.cast.CastUtils).
  it('does not extend the native Error type', () => {
    const error = new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.DRM,
        shaka.util.Error.Code.LICENSE_REQUEST_FAILED);

    expect(error instanceof Error).toBe(false);
    expect(error instanceof shaka.util.Error).toBe(true);
  });
});
