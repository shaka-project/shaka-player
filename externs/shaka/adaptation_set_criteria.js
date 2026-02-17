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
 *   language: string,
 *   role: string,
 *   videoRole: string,
 *   channelCount: number,
 *   hdrLevel: string,
 *   spatialAudio: boolean,
 *   videoLayout: string,
 *   audioLabel: string,
 *   videoLabel: string,
 *   preferredAudioCodecs: !Array<string>,
 *   preferredAudioChannelCount: number,
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
 * @property {string} language
 *   @deprecated Use preferredAudio instead.
 *   The language used to filter variants. Populated from
 *   preferredAudio[0].language.
 * @property {string} role
 *   @deprecated Use preferredAudio instead.
 *   The adaptation audio role used to filter variants. Populated from
 *   preferredAudio[0].role.
 * @property {string} videoRole
 *   @deprecated Use preferredVideo instead.
 *   The adaptation video role used to filter variants. Populated from
 *   preferredVideo[0].role.
 * @property {number} channelCount
 *   @deprecated Use preferredAudio instead.
 *   The audio channel count used to filter variants. Populated from
 *   preferredAudio[0].channelCount.
 * @property {string} hdrLevel
 *   @deprecated Use preferredVideo instead.
 *   The HDR level used to filter variants. Populated from
 *   preferredVideo[0].hdrLevel.
 * @property {boolean} spatialAudio
 *   @deprecated Use preferredAudio instead.
 *   Whether should prefer audio tracks with spatial audio. Populated from
 *   preferredAudio[0].spatialAudio.
 * @property {string} videoLayout
 *   @deprecated Use preferredVideo instead.
 *   The video layout used to filter variants. Populated from
 *   preferredVideo[0].layout.
 * @property {string} audioLabel
 *   @deprecated Use preferredAudio instead.
 *   The audio label used to filter variants. Populated from
 *   preferredAudio[0].label.
 * @property {string} videoLabel
 *   @deprecated Use preferredVideo instead.
 *   The video label used to filter variants. Populated from
 *   preferredVideo[0].label.
 * @property {!Array<string>} preferredAudioCodecs
 *   @deprecated Use preferredAudio instead.
 *   The ordered list of audio codecs to filter variants. Populated from
 *   preferredAudio[*].codec.
 * @property {number} preferredAudioChannelCount
 *   @deprecated Use preferredAudio instead.
 *   The preferred audio channel count to filter variants. Populated from
 *   preferredAudio[0].channelCount.
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
