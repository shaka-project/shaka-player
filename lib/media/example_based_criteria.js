/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.ExampleBasedCriteria');

goog.require('shaka.media.AdaptationSetCriteria');
goog.require('shaka.media.PreferenceBasedCriteria');
goog.requireType('shaka.config.CodecSwitchingStrategy');


/**
 * @implements {shaka.media.AdaptationSetCriteria}
 * @final
 */
shaka.media.ExampleBasedCriteria = class {
  /**
   * @param {shaka.extern.Variant} example
   * @param {shaka.config.CodecSwitchingStrategy} codecSwitchingStrategy
   */
  constructor(example, codecSwitchingStrategy) {
    // We can't know if role and label are really important, so we don't use
    // role and label for this.
    const role = '';
    const audioLabel = '';
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
    this.preferenceBasedCriteria_ = new shaka.media.PreferenceBasedCriteria(
        example.language, role, channelCount, hdrLevel, spatialAudio,
        videoLayout, audioLabel, videoLabel,
        codecSwitchingStrategy, audioCodec);
  }

  /** @override */
  create(variants) {
    return this.preferenceBasedCriteria_.create(variants);
  }
};
