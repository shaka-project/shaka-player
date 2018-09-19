/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

goog.provide('shaka.media.AdaptationSet');

goog.require('goog.asserts');
goog.require('shaka.util.MimeUtils');


/**
 * A set of variants that we want to adapt between.
 *
 * @final
 */
shaka.media.AdaptationSet = class {
  /**
   * @param {shaka.extern.Variant} root
   */
  constructor(root) {
    /** @type {shaka.extern.Variant} */
    this.root_ = root;
    /** @type {!Set.<shaka.extern.Variant>} */
    this.variants_ = new Set([root]);
  }

  /**
   * @param {shaka.extern.Variant} variant
   * @return {boolean}
   */
  add(variant) {
    if (this.canInclude(variant)) {
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
   * @return {boolean}
   */
  canInclude(variant) {
    return shaka.media.AdaptationSet.areAdaptable(this.root_, variant);
  }

  /**
   * @param {shaka.extern.Variant} a
   * @param {shaka.extern.Variant} b
   * @return {boolean}
   */
  static areAdaptable(a, b) {
    const AdaptationSet = shaka.media.AdaptationSet;
    const areAudiosCompatible = AdaptationSet.areAudiosCompatible_;
    const areVideosCompatible = AdaptationSet.areVideosCompatible_;

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
    if (a.audio && b.audio && !areAudiosCompatible(a.audio, b.audio)) {
      return false;
    }

    goog.asserts.assert(
        !!a.video == !!b.video,
        'Both should either have video or not have video.');
    if (a.video && b.video && !areVideosCompatible(a.video, b.video)) {
      return false;
    }

    return true;
  }

  /**
   * @return {!Iterable.<shaka.extern.Variant>}
   */
  values() {
    return this.variants_.values();
  }

  /**
   * Check if we can switch between two audio streams.
   *
   * @param {shaka.extern.Stream} a
   * @param {shaka.extern.Stream} b
   * @return {boolean}
   * @private
   */
  static areAudiosCompatible_(a, b) {
    const AdaptationSet = shaka.media.AdaptationSet;
    const canTransitionBetween = AdaptationSet.canTransitionBetween_;
    const areRolesEqual = AdaptationSet.areRolesEqual_;

    // Audio channel counts must not change between adaptations.
    if (a.channelsCount != b.channelsCount) {
      return false;
    }

    // We can only adapt between base-codecs.
    if (!canTransitionBetween(a, b)) {
      return false;
    }

    // Audio roles must not change between adaptations.
    if (!areRolesEqual(a.roles, b.roles)) {
      return false;
    }

    return true;
  }

  /**
   * Check if we can switch between two video streams.
   *
   * @param {shaka.extern.Stream} a
   * @param {shaka.extern.Stream} b
   * @return {boolean}
   * @private
   */
  static areVideosCompatible_(a, b) {
    const AdaptationSet = shaka.media.AdaptationSet;
    const canTransitionBetween = AdaptationSet.canTransitionBetween_;
    const areRolesEqual = AdaptationSet.areRolesEqual_;

    // We can only adapt between base-codecs.
    if (!canTransitionBetween(a, b)) {
      return false;
    }

    // Video roles must not change between adaptations.
    if (!areRolesEqual(a.roles, b.roles)) {
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
    const codecBaseA = shaka.util.MimeUtils.getCodecBase(a.codecs);
    const codecBaseB = shaka.util.MimeUtils.getCodecBase(b.codecs);

    return (codecBaseA == codecBaseB) && (a.mimeType == b.mimeType);
  }

  /**
   * Check if two role lists are the equal. This will take into account all
   * unique behaviours when comparing roles.
   *
   * @param {!Iterable.<string>} a
   * @param {!Iterable.<string>} b
   * @return {boolean}
   * @private
   */
  static areRolesEqual_(a, b) {
    const aSet = new Set(a);
    const bSet = new Set(b);

    // Remove the main role from the role lists (we expect to see them only
    // in dash manifests).
    const mainRole = 'main';
    aSet.delete(mainRole);
    bSet.delete(mainRole);

    // Make sure that we have the same number roles in each list. Make sure to
    // do it after correcting for 'main'.
    if (aSet.size != bSet.size) { return false; }

    // Because we know the two sets are the same size, if any item is missing
    // if means that they are not the same.
    for (const x of aSet) {
      if (!bSet.has(x)) { return false; }
    }

    return true;
  }
};
