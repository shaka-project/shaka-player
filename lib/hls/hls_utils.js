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

goog.provide('shaka.hls.Utils');

goog.require('shaka.util.ManifestParserUtils');


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
   * @param {!Array.<!shaka.hls.Tag>} tags An array of EXT-X-MEDIA tags.
   * @param {string} type
   * @param {string} groupId
   * @return {!Array.<!shaka.hls.Tag>} The first tag that has the given media
   *   type and group id.
   */
  static findMediaTags(tags, type, groupId) {
    return tags.filter((tag) => {
      const typeAttr = tag.getAttribute('TYPE');
      const groupIdAttr = tag.getAttribute('GROUP-ID');
      return typeAttr.value == type && groupIdAttr.value == groupId;
    });
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
