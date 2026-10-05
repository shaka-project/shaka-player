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
        !AdaptationSet.areAudiosCompatible(a.audio, b.audio, compareCodecs)) {
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
   * Check if two variants carry what the user perceives as the same audio,
   * so that changing between them (e.g. as part of a video change) does not
   * change the audio track.  Unlike the adaptation rules, this ignores the
   * codec profile within a codec family (e.g. HE-AAC and AAC-LC), which is
   * how HLS content usually pairs each video with its own audio group.
   *
   * @param {shaka.extern.Variant} a
   * @param {shaka.extern.Variant} b
   * @return {boolean}
   */
  static haveSameAudio(a, b) {
    if (!a.audio || !b.audio) {
      return a.audio == b.audio;
    }
    if (a.audio == b.audio) {
      return true;
    }
    const MimeUtils = shaka.util.MimeUtils;
    // An unknown channel count (e.g. an HLS rendition without CHANNELS whose
    // media playlist hasn't been loaded yet) matches any.
    const sameChannels = !a.audio.channelsCount || !b.audio.channelsCount ||
        a.audio.channelsCount == b.audio.channelsCount;
    return a.language == b.language &&
        a.audio.label == b.audio.label &&
        sameChannels &&
        a.audio.spatialAudio == b.audio.spatialAudio &&
        a.audio.groupId == b.audio.groupId &&
        MimeUtils.getNormalizedCodec(a.audio.codecs) ==
            MimeUtils.getNormalizedCodec(b.audio.codecs) &&
        shaka.media.AdaptationSet.areRolesEqual_(a.audio.roles, b.audio.roles);
  }

  /**
   * Check if two variants belong to the same video track, i.e. the same
   * camera angle, sign language video, etc., regardless of its quality.
   *
   * @param {shaka.extern.Variant} a
   * @param {shaka.extern.Variant} b
   * @return {boolean}
   */
  static haveSameVideoTrack(a, b) {
    if (!a.video || !b.video) {
      return !a.video == !b.video;
    }
    return (a.video.label || '') == (b.video.label || '') &&
        (a.video.language || '') == (b.video.language || '') &&
        shaka.media.AdaptationSet.areRolesEqual_(
            a.video.roles, b.video.roles);
  }

  /**
   * Get the variants that adaptation can fall back to when it can't afford
   * any variant of |variants|, whose audio has more channels (e.g. 5.1 or
   * spatial audio paired only with high video qualities).  The fallbacks
   * carry the same audio with fewer channels, one channel tier at a time
   * (e.g. 5.1, then stereo, then mono), and each tier only adds variants
   * cheaper than everything above it, so a tier is only used when the
   * bandwidth can't sustain the one above.
   *
   * @param {!Array<shaka.extern.Variant>} variants The variants chosen for
   *   adaptation.
   * @param {!Array<shaka.extern.Variant>} candidates All playable variants.
   * @param {boolean} compareCodecs
   * @return {!Array<shaka.extern.Variant>}
   */
  static getAudioFallbacks(variants, candidates, compareCodecs) {
    const AdaptationSet = shaka.media.AdaptationSet;
    const MimeUtils = shaka.util.MimeUtils;

    const root = variants[0];
    if (!root || !root.audio ||
        variants.some((v) => !v.audio || !v.audio.channelsCount)) {
      return [];
    }

    // Spatial audio ranks above non-spatial audio with the same channels.
    const getTier = (audio) =>
      (audio.channelsCount || 0) * 2 + (audio.spatialAudio ? 1 : 0);
    const lowestTier =
        Math.min(...variants.map((v) => getTier(v.audio)));
    const hdrLevels = new Set(variants.map((v) => v.video && v.video.hdr));
    const videoLayouts =
        new Set(variants.map((v) => v.video && v.video.videoLayout));

    /** @type {!Map<number, !Array<shaka.extern.Variant>>} */
    const variantsByTier = new Map();
    for (const candidate of candidates) {
      const audio = candidate.audio;
      if (variants.includes(candidate) || !audio || !audio.channelsCount ||
          getTier(audio) >= lowestTier) {
        continue;
      }
      // The same audio, except for the channels.
      if (candidate.language != root.language ||
          audio.label != root.audio.label ||
          !AdaptationSet.areRolesEqual_(audio.roles, root.audio.roles) ||
          (compareCodecs &&
          !AdaptationSet.canTransitionBetween_(root.audio, audio))) {
        continue;
      }
      // The same video choices.
      if (!AdaptationSet.haveSameVideoTrack(root, candidate) ||
          (root.video && candidate.video &&
          (!hdrLevels.has(candidate.video.hdr) ||
          !videoLayouts.has(candidate.video.videoLayout) ||
          !AdaptationSet.areVideosCompatible_(
              root.video, candidate.video, compareCodecs)))) {
        continue;
      }
      const tier = getTier(audio);
      if (!variantsByTier.has(tier)) {
        variantsByTier.set(tier, []);
      }
      variantsByTier.get(tier).push(candidate);
    }

    const getFamily =
        (variant) => MimeUtils.getNormalizedCodec(variant.audio.codecs);
    const rootFamily = getFamily(root);
    const fallbacks = [];
    let floor = Math.min(...variants.map((v) => v.bandwidth));
    const tiers = Array.from(variantsByTier.keys()).sort((a, b) => b - a);
    for (const tier of tiers) {
      const tierVariants = variantsByTier.get(tier);
      // Use a single codec family per tier: the root's one if possible,
      // otherwise the one with the most variants.
      const countByFamily = new Map();
      for (const variant of tierVariants) {
        const family = getFamily(variant);
        countByFamily.set(family, (countByFamily.get(family) || 0) + 1);
      }
      let family = rootFamily;
      if (!countByFamily.has(family)) {
        family = Array.from(countByFamily.keys()).reduce((best, f) =>
          countByFamily.get(f) > countByFamily.get(best) ? f : best);
      }
      const cheaper = tierVariants.filter(
          (v) => getFamily(v) == family && v.bandwidth < floor);
      if (cheaper.length) {
        fallbacks.push(...cheaper);
        floor = Math.min(...cheaper.map((v) => v.bandwidth));
      }
    }
    return fallbacks;
  }

  /**
   * Check if we can switch between two audio streams.
   *
   * @param {shaka.extern.Stream} a
   * @param {shaka.extern.Stream} b
   * @param {boolean} compareCodecs
   * @return {boolean}
   */
  static areAudiosCompatible(a, b, compareCodecs) {
    const AdaptationSet = shaka.media.AdaptationSet;
    const MimeUtils = shaka.util.MimeUtils;

    if (!a.channelsCount || !b.channelsCount) {
      // An unknown channel count (e.g. an HLS rendition without CHANNELS
      // whose media playlist hasn't been loaded yet) tells us nothing, so
      // only require the same kind of audio.
      if (a.channelsCount != b.channelsCount &&
          MimeUtils.getNormalizedCodec(a.codecs) !=
              MimeUtils.getNormalizedCodec(b.codecs)) {
        return false;
      }
    } else if (a.channelsCount > 2 || b.channelsCount > 2) {
      // Don't adapt between channel counts, which could annoy the user
      // due to volume changes on downmixing.  An exception is made for
      // stereo and mono, which should be fine to adapt between.
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
