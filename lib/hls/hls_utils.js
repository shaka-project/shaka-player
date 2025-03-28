/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.hls.Utils');

goog.require('shaka.log');
goog.require('shaka.util.Error');
goog.require('shaka.util.ManifestParserUtils');
goog.requireType('shaka.hls.Tag');


shaka.hls.Utils = class {
  /**
   *
   * @param {!Array<!shaka.hls.Tag>} tags
   * @param {string} name
   * @return {!Array<!shaka.hls.Tag>}
   */
  static filterTagsByName(tags, name) {
    return tags.filter((tag) => {
      return tag.name == name;
    });
  }


  /**
   *
   * @param {!Array<!shaka.hls.Tag>} tags
   * @param {string} type
   * @return {!Array<!shaka.hls.Tag>}
   */
  static filterTagsByType(tags, type) {
    return tags.filter((tag) => {
      const tagType = tag.getRequiredAttrValue('TYPE');
      return tagType == type;
    });
  }


  /**
   *
   * @param {!Array<!shaka.hls.Tag>} tags
   * @param {string} name
   * @return {?shaka.hls.Tag}
   */
  static getFirstTagWithName(tags, name) {
    for (const tag of tags) {
      if (tag.name === name) {
        return tag;
      }
    }
    return null;
  }

  /**
   * Get the numerical value of the first tag with given name if available.
   * Return the default value if the tag is not present.
   *
   * @param {!Array<!shaka.hls.Tag>} tags
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
   * @param {!Array<string>} baseUris
   * @param {?string} relativeUri
   * @param {?Map<string, string>=} variables
   * @return {!Array<string>}
   */
  static constructSegmentUris(baseUris, relativeUri, variables) {
    if (!relativeUri) {
      return [];
    }
    return shaka.hls.Utils.constructUris(baseUris, [relativeUri], variables);
  }


  /**
   * @param {!Array<string>} baseUris
   * @param {!Array<string>} relativeUris
   * @param {?Map<string, string>=} variables
   * @return {!Array<string>}
   */
  static constructUris(baseUris, relativeUris, variables) {
    if (!relativeUris.length) {
      return [];
    }
    let newRelativeUris = relativeUris;
    if (variables && variables.size) {
      newRelativeUris = relativeUris.map((uri) => {
        return shaka.hls.Utils.variableSubstitution(uri, variables);
      });
    }
    return shaka.util.ManifestParserUtils.resolveUris(
        baseUris, newRelativeUris);
  }

  /**
   * Replaces the variables of a given URI.
   *
   * @param {string} uri
   * @param {?Map<string, string>=} variables
   * @return {string}
   */
  static variableSubstitution(uri, variables) {
    if (!variables || !variables.size) {
      return uri;
    }
    let newUri = String(uri).replace(/%7B/g, '{').replace(/%7D/g, '}');

    const uriVariables = newUri.match(/{\$\w*}/g);
    if (uriVariables) {
      for (const variable of uriVariables) {
        // Note: All variables have the structure {$...}
        const variableName = variable.slice(2, variable.length - 1);
        const replaceValue = variables.get(variableName);
        if (replaceValue) {
          newUri = newUri.replace(variable, replaceValue);
        } else {
          shaka.log.error('A variable has been found that is not declared',
              variableName);
          throw new shaka.util.Error(
              shaka.util.Error.Severity.CRITICAL,
              shaka.util.Error.Category.MANIFEST,
              shaka.util.Error.Code.HLS_VARIABLE_NOT_FOUND,
              variableName);
        }
      }
    }
    return newUri;
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
