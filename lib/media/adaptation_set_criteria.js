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
   * @param {!Array<shaka.extern.Variant>} variants
   * @return {!shaka.media.AdaptationSet}
   * @exportInterface
   */
  create(variants) {}

  /**
   * Sets the AdaptationSetCriteria configuration.
   *
   * @param {shaka.media.AdaptationSetCriteria.Configuration} config
   * @exportInterface
   */
  configure(config) {}
};

/**
 * A factory for creating the AdaptationSetCriteria.
 *
 * @typedef {function():!shaka.media.AdaptationSetCriteria}
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
 * @property {string} language
 *   The language used to filter variants.
 * @property {string} role
 *   The adaptation role used to filter variants.
 * @property {string} channelCount
 *   The audio channel count used to filter variants.
 * @property {string} hdrLevel
 *   The HDR level used to filter variants.
 * @property {boolean} spatialAudio
 *   Whether should prefer audio tracks with spatial audio.
 * @property {string} videoLayout
 *   The video layout used to filter variants.
 * @property {string} audioLabel
 *   The audio label used to filter variants.
 * @property {string} videoLabel
 *   The video label used to filter variants.
 * @property {shaka.config.CodecSwitchingStrategy} codecSwitchingStrategy
 *   The codec switching strategy used to filter variants.
 * @property {string} audioCodec
 *   The audio codec used to filter variants.
 * @export
 */
shaka.media.AdaptationSetCriteria.Configuration;
