/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.ExampleBasedCriteria');

goog.require('shaka.media.AdaptationSetCriteria');
goog.requireType('shaka.config.CodecSwitchingStrategy');


/**
 * @implements {shaka.media.AdaptationSetCriteria}
 * @final
 */
shaka.media.ExampleBasedCriteria = class {
  /**
   * @param {shaka.extern.Variant} example
   * @param {shaka.config.CodecSwitchingStrategy} codecSwitchingStrategy
   * @param {shaka.media.AdaptationSetCriteria.Factory
   *        } adaptationSetCriteriaFactory
   */
  constructor(example, codecSwitchingStrategy, adaptationSetCriteriaFactory) {
    // We can't know if role and video label are really important, so we don't
    // use role and video label for this.
    const role = '';
    const audioLabel = example.audio && example.audio.label ?
        example.audio.label : '';
    const videoLabel = '';
    const hdrLevel = example.video && example.video.hdr ?
        example.video.hdr : '';
    const spatialAudio = example.audio && example.audio.spatialAudio ?
        example.audio.spatialAudio : false;
    const videoLayout = example.video && example.video.videoLayout ?
        example.video.videoLayout : '';
    const channelCount = example.audio && example.audio.channelsCount ?
        example.audio.channelsCount : 0;
    const audioCodec = example.audio && example.audio.codecs ?
        example.audio.codecs : '';

    /** @private {!shaka.media.AdaptationSetCriteria} */
    this.preferenceBasedCriteria_ = adaptationSetCriteriaFactory();
    this.preferenceBasedCriteria_.configure({
      language: example.language,
      role,
      channelCount,
      hdrLevel,
      spatialAudio,
      videoLayout,
      audioLabel,
      videoLabel,
      codecSwitchingStrategy,
      audioCodec,
    });
  }

  /**
   * @override
   */
  create(variants) {
    return this.preferenceBasedCriteria_.create(variants);
  }

  /**
   * @override
   */
  configure() {
  }
};
