/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @externs
 */

/**
 * An adaptation set criteria is a unit of logic that can take a set of
 * variants and return a subset of variants that should (and can) be
 * adapted between.
 *
 * @interface
 * @exportDoc
 */
shaka.extern.AdaptationSetCriteria = class {
  /**
   * Take a set of variants, and return a subset of variants that can be
   * adapted between.
   *
   * @param {!Array<shaka.extern.Variant>} variants
   * @return {!shaka.media.AdaptationSet}
   * @exportDoc
   */
  create(variants) {}

  /**
   * Sets the AdaptationSetCriteria configuration.
   *
   * @param {shaka.extern.AdaptationSetCriteria.Configuration} config
   * @exportDoc
   */
  configure(config) {}

  /**
   * Gets the current AdaptationSetCriteria configuration.
   *
   * @return {?shaka.extern.AdaptationSetCriteria.Configuration}
   * @exportDoc
   */
  getConfiguration() {}

  /**
   * Return the result of last create call.
   *
   * @return {?shaka.media.AdaptationSet}
   * @exportDoc
   */
  getLastAdaptationSet() {}
};

/**
 * A factory for creating the AdaptationSetCriteria.
 *
 * @typedef {function():!shaka.extern.AdaptationSetCriteria}
 * @exportDoc
 */
shaka.extern.AdaptationSetCriteria.Factory;

/**
 * @typedef {{
 *   preferredAudio: !Array<!shaka.extern.AudioPreference>,
 *   preferredVideo: !Array<!shaka.extern.VideoPreference>,
 *   codecSwitchingStrategy: shaka.config.CodecSwitchingStrategy,
 *   audioCodec: string,
 *   activeAudioCodec: string,
 *   activeAudioChannelCount: number,
 *   keySystem: string,
 * }}
 *
 * @property {!Array<!shaka.extern.AudioPreference>} preferredAudio
 *   An ordered list of audio preferences used to filter variants.
 * @property {!Array<!shaka.extern.VideoPreference>} preferredVideo
 *   An ordered list of video preferences used to filter variants.
 * @property {shaka.config.CodecSwitchingStrategy} codecSwitchingStrategy
 *   The codec switching strategy used to filter variants.
 * @property {string} audioCodec
 *   The audio codec used to filter variants.
 * @property {string} activeAudioCodec
 *   The active audio codec used to filter variants.
 * @property {number} activeAudioChannelCount
 *   The active audio channel count used to filter variants.
 * @property {string} keySystem
 *   Current used key system or empty if not used.
 * @exportDoc
 */
shaka.extern.AdaptationSetCriteria.Configuration;
