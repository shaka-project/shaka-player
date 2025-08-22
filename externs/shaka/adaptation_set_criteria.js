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
 *   language: string,
 *   role: string,
 *   videoRole: string,
 *   channelCount: number,
 *   hdrLevel: string,
 *   spatialAudio: boolean,
 *   videoLayout: string,
 *   audioLabel: string,
 *   videoLabel: string,
 *   codecSwitchingStrategy: shaka.config.CodecSwitchingStrategy,
 *   audioCodec: string,
 *   activeAudioCodec: string,
 *   activeAudioChannelCount: number,
 *   preferredAudioCodecs: !Array<string>,
 *   preferredAudioChannelCount: number,
 * }}
 *
 * @property {string} language
 *   The language used to filter variants.
 * @property {string} role
 *   The adaptation audio role used to filter variants.
 * @property {string} videoRole
 *   The adaptation video role used to filter variants.
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
 * @property {string} activeAudioCodec
 *   The active audio codec used to filter variants.
 * @property {number} activeAudioChannelCount
 *   The active audio channel count used to filter variants.
 * @property {!Array<string>} preferredAudioCodecs
 *   The ordered list of audio codecs to filter variants.
 * @property {number} preferredAudioChannelCount
 *   The preferred audio channel count to filter variants.
 * @exportDoc
 */
shaka.extern.AdaptationSetCriteria.Configuration;
