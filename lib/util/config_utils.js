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

goog.provide('shaka.util.ConfigUtils');

goog.require('goog.asserts');
goog.require('shaka.log');


/**
 * @param {!Object} destination
 * @param {!Object} source
 * @param {!Object} template supplies default values
 * @param {!Object} overrides
 *   Supplies override type checking.  When the current path matches the key in
 *   this object, each sub-value must match the type in this object.  If this
 *   contains an Object, it is used as the template.
 * @param {string} path to this part of the config
 */
shaka.util.ConfigUtils.mergeConfigObjects =
    function(destination, source, template, overrides, path) {
  goog.asserts.assert(destination, 'Destination config must not be null!');

  /**
   * @type {boolean}
   * If true, don't validate the keys in the next level.
   */
  var ignoreKeys = path in overrides;

  for (var k in source) {
    var subPath = path + '.' + k;
    var subTemplate = ignoreKeys ? overrides[path] : template[k];

    /**
     * @type {boolean}
     * If true, simply copy the object over and don't verify.
     */
    var copyObject = !!({
      '.abr.manager': true
    })[subPath];

    // The order of these checks is important.
    if (!ignoreKeys && !(k in destination)) {
      shaka.log.error('Invalid config, unrecognized key ' + subPath);
    } else if (source[k] === undefined) {
      // An explicit 'undefined' value causes the key to be deleted from the
      // destination config and replaced with a default from the template if
      // possible.
      if (subTemplate === undefined || ignoreKeys) {
        delete destination[k];
      } else {
        destination[k] = subTemplate;
      }
    } else if (copyObject) {
      destination[k] = source[k];
    } else if (typeof destination[k] == 'object' &&
               typeof source[k] == 'object') {
      shaka.util.ConfigUtils.mergeConfigObjects(
          destination[k], source[k], subTemplate, overrides, subPath);
    } else if (typeof source[k] != typeof subTemplate) {
      shaka.log.error('Invalid config, wrong type for ' + subPath);
    } else if (typeof destination[k] == 'function' &&
               destination[k].length != source[k].length) {
      shaka.log.warning(
          'Invalid config, wrong number of arguments for ' + subPath);
      destination[k] = source[k];
    } else {
      destination[k] = source[k];
    }
  }
};
