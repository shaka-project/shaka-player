/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.AdaptationSetCriteria');

goog.require('shaka.media.AdaptationSet');
goog.require('shaka.config.CodecSwitchingStrategy');


/**
 * An adaptation set criteria is a unit of logic that can take a set of
 * variants and return a subset of variants that should (and can) be
 * adapted between.
 *
 * @interface
 * @export
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

  /**
   * Sets the AdaptationSetCriteria configuration.
   *
   * It is the responsibility of the AbrManager implementation to implement the
   * restrictions behavior described in shaka.extern.AbrConfiguration.
   *
   * @param {shaka.media.AdaptationSetCriteria.Configuration} config
   * @exportDoc
   */
  configure(config) {}
};

/**
 * A factory for creating the AdaptationSetCriteria.
 *
 * @typedef {function():!shaka.media.AdaptationSetCriteria}
 * @exportDoc
 * @export
 */
shaka.media.AdaptationSetCriteria.Factory;

/**
 * @typedef {{
 *   language: string,
 *   role: string,
 *   channelCount: number,
 *   hdrLevel: string,
 *   spatialAudio: boolean,
 *   videoLayout: string,
 *   audioLabel: string,
 *   videoLabel: string,
 *   codecSwitchingStrategy: shaka.config.CodecSwitchingStrategy,
 *   audioCodec: string
 * }}
 *
 * @property {boolean} enabled
 *   If true, enable adaptation by the current AbrManager.
 *   <br>
 *   Defaults to <code>true</code>.
 * @exportDoc
 * @export
 */
shaka.media.AdaptationSetCriteria.Configuration;
