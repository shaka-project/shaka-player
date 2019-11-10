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

goog.provide('shaka.deprecate.Enforcer');

goog.require('shaka.deprecate.Version');


/**
 * The enforcer's job is to call the correct callback when a feature will need
 * to be removed later or removed now.
 *
 * The "what should be done" is not part of the enforcer, that must be provided
 * to the enforcer when it is created. This separation was created so that
 * testing and production could be equal users of the enforcer.
 *
 * @final
 */
shaka.deprecate.Enforcer = class {
  /**
   * @param {!shaka.deprecate.Version} libraryVersion
   * @param {shaka.deprecate.Listener} onPending
   * @param {shaka.deprecate.Listener} onExpired
   */
  constructor(libraryVersion, onPending, onExpired) {
    /** @private {!shaka.deprecate.Version} */
    this.libraryVersion_ = libraryVersion;

    /** @private {shaka.deprecate.Listener} */
    this.onPending_ = onPending;
    /** @private {shaka.deprecate.Listener} */
    this.onExpired_ = onExpired;
  }

  /**
   * Tell the enforcer that a feature will expire on |expiredOn| and that it
   * should notify the listeners if it is pending or expired.
   *
   * @param {!shaka.deprecate.Version} expiresOn
   * @param {string} name
   * @param {string} description
   */
  enforce(expiresOn, name, description) {
    // If the expiration version is larger than the library version
    // (compareTo > 0), it means the expiration is in the future, and is still
    // pending.
    const isPending = expiresOn.compareTo(this.libraryVersion_) > 0;

    // Find the right callback (pending or expired) for this enforcement request
    // call it to handle this features pending/expired removal.
    const callback = isPending ? this.onPending_ : this.onExpired_;
    callback(this.libraryVersion_, expiresOn, name, description);
  }
};

/**
 * A callback for listening to deprecation events.
 *
 * Parameters:
 *  libraryVersion: !shaka.deprecate.Version
 *  featureVersion: !shaka.deprecate.Version
 *  name: string
 *  description: string
 *
 * libraryVersion: The current version of the library.
 * featureVersion: The version of the library when the feature should be
 *                 removed.
 * name: The name of the feature that will/should be removed.
 * description: A description of what is changing.
 *
 * @typedef {function(
 *    !shaka.deprecate.Version,
 *    !shaka.deprecate.Version,
 *    string,
 *    string)}
 */
shaka.deprecate.Listener;
