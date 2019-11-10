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

goog.provide('shaka.Deprecate');

goog.require('goog.asserts');
goog.require('shaka.deprecate.Enforcer');
goog.require('shaka.deprecate.Version');


/**
 * |shaka.Deprecate| is the front-end of the deprecation system, allowing for
 * any part of the code to say that "this block of code should be removed by
 * version X".
 *
 * @final
 */
shaka.Deprecate = class {
  /**
   * Initialize the system. This must happen before any calls to |enforce|. In
   * our code base, |shaka.Player| will be the only one to call this (it has the
   * version string).
   *
   * If the |Deprecate| called |Player.version| to initialize itself, it would
   * mean that |Player| could not use |Deprecate| because it would create a
   * circular dependency. To work around this, we provide this method so that
   * |Player| can give us the version without us needing to know about |Player|.
   *
   * This will initialize the system to:
   *  - print warning messages when the feature is scheduled to be removed in a
   *    later version
   *  - print errors and fail assertions when the feature should be removed now
   *
   * @param {string} versionString
   */
  static init(versionString) {
    goog.asserts.assert(
        shaka.Deprecate.enforcer_ == null,
        'Deprecate.init should only be called once.');

    shaka.Deprecate.enforcer_ = new shaka.deprecate.Enforcer(
        shaka.deprecate.Version.parse(versionString),
        shaka.Deprecate.onPending_,
        shaka.Deprecate.onExpired_);
  }

  /**
   * Ask the deprecation system to require this feature to be removed by the
   * given version.
   *
   * @param {number} major
   * @param {number} minor
   * @param {string} name
   * @param {string} description
   */
  static deprecateFeature(major, minor, name, description) {
    const enforcer = shaka.Deprecate.enforcer_;
    goog.asserts.assert(
        enforcer,
        'Missing deprecation enforcer. Was |init| called?');

    const expiresAt = new shaka.deprecate.Version(major, minor);
    enforcer.enforce(expiresAt, name, description);
  }

  /**
   * @param {!shaka.deprecate.Version} libraryVersion
   * @param {!shaka.deprecate.Version} featureVersion
   * @param {string} name
   * @param {string} description
   * @private
   */
  static onPending_(libraryVersion, featureVersion, name, description) {
    // If we were to pass each value to the log call, it would be printed as
    // a comma-separated list. To make the print state appear more natural to
    // the reader, create one string for the message.
    shaka.log.alwaysWarn([
      name,
      'has been deprecated and will be removed in',
      featureVersion,
      '. We are currently at version',
      libraryVersion,
      '. Additional information:',
      description,
    ].join(' '));
  }

  /**
   * @param {!shaka.deprecate.Version} libraryVersion
   * @param {!shaka.deprecate.Version} featureVersion
   * @param {string} name
   * @param {string} description
   * @private
   */
  static onExpired_(libraryVersion, featureVersion, name, description) {
    // If we were to pass each value to the log call, it would be printed as
    // a comma-separated list. To make the print state appear more natural to
    // the reader, create one string for the message.
    const errorMessage = [
      name,
      'has been deprecated and has been removed in',
      featureVersion,
      '. We are now at version',
      libraryVersion,
      '. Additional information:',
      description,
    ].join('');

    shaka.log.alwaysError(errorMessage);
    goog.asserts.assert(false, errorMessage);
  }
};

/**
 * The global deprecation enforcer that will be set by the player (because the
 * player knows the version) when it calls |init|. This may appear a little
 * round-about to you, because it is. Since player uses |Deprecate|, it means
 * that |Deprecate| can't depend on Player directly.
 *
 * @private {shaka.deprecate.Enforcer}
 */
shaka.Deprecate.enforcer_ = null;
