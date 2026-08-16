/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.AdaptationSet');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.util.ArrayUtils');
goog.require('shaka.util.MimeUtils');


/**
 * A set of variants that we want to adapt between.
 *
 * @final
 * @export
 */
shaka.media.AdaptationSet = class {
  /**
   * @param {shaka.extern.Variant} root
   *    The variant that all other variants will be tested against when being
   *    added to the adaptation set. If a variant is not compatible with the
   *    root, it will not be added.
   * @param {!Iterable<shaka.extern.Variant>=} candidates
   *    Variants that may be compatible with the root and should be added if
   *    compatible. If a candidate is not compatible, it will not end up in the
   *    adaptation set.
   * @param {boolean=} compareCodecs
   */
  constructor(root, candidates, compareCodecs = true) {
    /** @private {shaka.extern.Variant} */
    this.root_ = root;
    /** @private {!Set<shaka.extern.Variant>} */
    this.variants_ = new Set([root]);

    // Try to add all the candidates. If they cannot be added (because they
    // are not compatible with the root, they will be rejected by |add|.
    candidates = candidates || [];
    for (const candidate of candidates) {
      this.add(candidate, compareCodecs);
    }
  }

  /**
   * @param {shaka.extern.Variant} variant
   * @param {boolean} compareCodecs
   * @return {boolean}
   */
  add(variant, compareCodecs) {
    if (this.canInclude(variant, compareCodecs)) {
      this.variants_.add(variant);
      return true;
    }

    // To be nice, issue a warning if someone is trying to add something that
    // they shouldn't.
    shaka.log.warning('Rejecting variant - not compatible with root.');
    return false;
  }

  /**
   * Check if |variant| can be included with the set. If |canInclude| returns
   * |false|, calling |add| will result in it being ignored.
   *
   * @param {shaka.extern.Variant} variant
   * @param {boolean=} compareCodecs
   * @return {boolean}
   */
  canInclude(variant, compareCodecs = true) {
    return shaka.media.AdaptationSet
        .areAdaptable(this.root_, variant, compareCodecs);
  }

  /**
   * @param {shaka.extern.Variant} a
   * @param {shaka.extern.Variant} b
   * @param {boolean} compareCodecs
   * @return {boolean}
   */
  static areAdaptable(a, b, compareCodecs) {
    const AdaptationSet = shaka.media.AdaptationSet;

    // All variants should have audio or should all not have audio.
    if (!!a.audio != !!b.audio) {
      return false;
    }

    // All variants should have video or should all not have video.
    if (!!a.video != !!b.video) {
      return false;
    }

    // If the languages don't match, we should not adapt between them.
    if (a.language != b.language) {
      return false;
    }

    goog.asserts.assert(
        !!a.audio == !!b.audio,
        'Both should either have audio or not have audio.');
    if (a.audio && b.audio &&
        !AdaptationSet.areAudiosCompatible_(a.audio, b.audio, compareCodecs)) {
      return false;
    }

    goog.asserts.assert(
        !!a.video == !!b.video,
        'Both should either have video or not have video.');
    if (a.video && b.video &&
        !AdaptationSet.areVideosCompatible_(a.video, b.video, compareCodecs)) {
      return false;
    }

    return true;
  }

  /**
   * @return {!Iterable<shaka.extern.Variant>}
   */
  values() {
    return this.variants_.values();
  }

  /**
   * Check if we can switch between two audio streams.
   *
   * @param {shaka.extern.Stream} a
   * @param {shaka.extern.Stream} b
   * @param {boolean} compareCodecs
   * @return {boolean}
   * @private
   */
  static areAudiosCompatible_(a, b, compareCodecs) {
    const AdaptationSet = shaka.media.AdaptationSet;

    // Don't adapt between channel counts, which could annoy the user
    // due to volume changes on downmixing.  An exception is made for
    // stereo and mono, which should be fine to adapt between.
    if (!a.channelsCount || !b.channelsCount ||
        a.channelsCount > 2 || b.channelsCount > 2) {
      if (a.channelsCount != b.channelsCount) {
        return false;
      }
    }

    // Don't adapt between spatial and non spatial audio, which may
    // annoy the user.
    if (a.spatialAudio !== b.spatialAudio) {
      return false;
    }

    // We can only adapt between base-codecs.
    if (compareCodecs && !AdaptationSet.canTransitionBetween_(a, b)) {
      return false;
    }

    // Audio roles must not change between adaptations.
    if (!AdaptationSet.areRolesEqual_(a.roles, b.roles)) {
      return false;
    }

    // We can only adapt between the same groupId.
    if (a.groupId !== b.groupId) {
      return false;
    }

    return true;
  }

  /**
   * Check if we can switch between two video streams.
   *
   * @param {shaka.extern.Stream} a
   * @param {shaka.extern.Stream} b
   * @param {boolean} compareCodecs
   * @return {boolean}
   * @private
   */
  static areVideosCompatible_(a, b, compareCodecs) {
    const AdaptationSet = shaka.media.AdaptationSet;

    // We can only adapt between base-codecs.
    if (compareCodecs && !AdaptationSet.canTransitionBetween_(a, b)) {
      return false;
    }

    // Video roles must not change between adaptations.
    if (!AdaptationSet.areRolesEqual_(a.roles, b.roles)) {
      return false;
    }

    return true;
  }

  /**
   * Check if we can switch between two streams based on their codec and mime
   * type.
   *
   * @param {shaka.extern.Stream} a
   * @param {shaka.extern.Stream} b
   * @return {boolean}
   * @private
   */
  static canTransitionBetween_(a, b) {
    if (a.mimeType != b.mimeType) {
      return false;
    }

    // Get the base codec of each codec in each stream.
    const codecsA = shaka.util.MimeUtils.splitCodecs(a.codecs).map((codec) => {
      return shaka.util.MimeUtils.getCodecBase(codec);
    });
    const codecsB = shaka.util.MimeUtils.splitCodecs(b.codecs).map((codec) => {
      return shaka.util.MimeUtils.getCodecBase(codec);
    });

    return shaka.util.ArrayUtils.hasSameElements(codecsA, codecsB);
  }

  /**
   * Check if two role lists are the equal. This will take into account all
   * unique behaviours when comparing roles.
   *
   * @param {!Array<string>} a
   * @param {!Array<string>} b
   * @return {boolean}
   * @private
   */
  static areRolesEqual_(a, b) {
    return shaka.util.ArrayUtils.hasSameElements(a, b);
  }
};
