/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.AdaptationSetCriteria');

goog.require('shaka.media.AdaptationSet');


/**
 * An adaptation set criteria is a unit of logic that can take a set of
 * variants and return a subset of variants that should (and can) be
 * adapted between.
 *
 * @interface
 */
shaka.media.AdaptationSetCriteria = class {
  /**
   * Take a set of variants, and return a subset of variants that can be
   * adapted between.
   *
   * @param {!Array.<shaka.extern.Variant>} variants
   * @return {!shaka.media.AdaptationSet}
   */
  create(variants) {}
};
