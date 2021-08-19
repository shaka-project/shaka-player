/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.hls.Utils');

goog.require('shaka.util.ManifestParserUtils');
goog.requireType('shaka.hls.Tag');


shaka.hls.Utils = class {
  /**
   *
   * @param {!Array.<!shaka.hls.Tag>} tags
   * @param {string} name
   * @return {!Array.<!shaka.hls.Tag>}
   */
  static filterTagsByName(tags, name) {
    return tags.filter((tag) => {
      return tag.name == name;
    });
  }


  /**
   *
   * @param {!Array.<!shaka.hls.Tag>} tags
   * @param {string} type
   * @return {!Array.<!shaka.hls.Tag>}
   */
  static filterTagsByType(tags, type) {
    return tags.filter((tag) => {
      const tagType = tag.getRequiredAttrValue('TYPE');
      return tagType == type;
    });
  }


  /**
   *
   * @param {!Array.<!shaka.hls.Tag>} tags
   * @param {string} name
   * @return {?shaka.hls.Tag}
   */
  static getFirstTagWithName(tags, name) {
    const tagsWithName = shaka.hls.Utils.filterTagsByName(tags, name);
    if (!tagsWithName.length) {
      return null;
    }

    return tagsWithName[0];
  }

  /**
   * Get the numerical value of the first tag with given name if available.
   * Return the default value if the tag is not present.
   *
   * @param {!Array.<!shaka.hls.Tag>} tags
   * @param {string} name
   * @param {number=} defaultValue
   * @return {number}
   */
  static getFirstTagWithNameAsNumber(tags, name, defaultValue = 0) {
    const tag = shaka.hls.Utils.getFirstTagWithName(tags, name);
    const value = tag ? Number(tag.value) : defaultValue;
    return value;
  }


  /**
   * @param {string} parentAbsoluteUri
   * @param {string} uri
   * @return {string}
   */
  static constructAbsoluteUri(parentAbsoluteUri, uri) {
    const uris = shaka.util.ManifestParserUtils.resolveUris(
        [parentAbsoluteUri], [uri]);

    return uris[0];
  }


  /**
   * Matches a string to an HLS comment format and returns the result.
   *
   * @param {string} line
   * @return {boolean}
   */
  static isComment(line) {
    return /^#(?!EXT)/m.test(line);
  }
};
