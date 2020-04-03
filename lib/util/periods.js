/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.Periods');

/**
 * This is a collection of period-focused utility methods.
 *
 * @final
 */
shaka.util.Periods = class {
  /**
   * Stitch together variants across periods.
   *
   * @param {!Array.<!Array.<shaka.extern.Variant>>} variantsPerPeriod
   * @return {!Array.<shaka.extern.Variant>}
   */
  static stitchVariants(variantsPerPeriod) {
    if (variantsPerPeriod.length == 1) {
      return variantsPerPeriod[0];
    }

    // FIXME(#1339): implement
    return variantsPerPeriod[0];
  }

  /**
   * Stitch together text streams across periods.
   *
   * @param {!Array.<!Array.<shaka.extern.Stream>>} textStreamsPerPeriod
   * @return {!Array.<shaka.extern.Stream>}
   */
  static stitchTextStreams(textStreamsPerPeriod) {
    if (textStreamsPerPeriod.length == 1) {
      return textStreamsPerPeriod[0];
    }

    // FIXME(#1339): implement
    return textStreamsPerPeriod[0];
  }

  /**
   * Stitch together DB streams across periods, taking a mix of stream types.
   * The offline database does not separate these by type.
   *
   * @param {!Array.<!Array.<shaka.extern.StreamDB>>} streamDBsPerPeriod
   * @return {!Array.<shaka.extern.StreamDB>}
   */
  static stitchStreamDBs(streamDBsPerPeriod) {
    // FIXME(#1339): implement
    return streamDBsPerPeriod[0];
  }
};
