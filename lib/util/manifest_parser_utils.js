/**
 * @license
 * Copyright 2017 Google Inc.
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

goog.provide('shaka.util.ManifestParserUtils');

goog.require('goog.Uri');
goog.require('shaka.util.Functional');


/**
 * @namespace shaka.util.ManifestParserUtils
 * @summary Utility functions for manifest parsing.
 */


/**
 * Resolves an array of relative URIs to the given base URIs. This will result
 * in M*N number of URIs.
 *
 * @param {!Array.<string>} baseUris
 * @param {!Array.<string>} relativeUris
 * @return {!Array.<string>}
 */
shaka.util.ManifestParserUtils.resolveUris = function(baseUris, relativeUris) {
  var Functional = shaka.util.Functional;
  if (relativeUris.length == 0)
    return baseUris;

  var relativeAsGoog =
      relativeUris.map(function(uri) { return new goog.Uri(uri); });
  // Resolve each URI relative to each base URI, creating an Array of Arrays.
  // Then flatten the Arrays into a single Array.
  return baseUris.map(function(uri) { return new goog.Uri(uri); })
    .map(function(base) { return relativeAsGoog.map(base.resolve.bind(base)); })
    .reduce(Functional.collapseArrays, [])
    .map(function(uri) { return uri.toString(); });
};

