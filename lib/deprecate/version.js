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

goog.provide('shaka.deprecate.Version');

/**
 * A class that defines what a library version is within the deprecation
 * system. Within deprecation we only care about the major and minor versions.
 *
 * @final
 */
shaka.deprecate.Version = class {
  /**
   * @param {number} major
   * @param {number} minor
   */
  constructor(major, minor) {
    this.major_ = major;
    this.minor_ = minor;
  }

  /** @return {number} */
  major() { return this.major_; }

  /** @return {number} */
  minor() { return this.minor_; }

  /**
   * Returns:
   *  - positive if |this| > |other|
   *  - zero if |this| == |other|
   *  - negative if |this| < |other|
   *
   * @param {!shaka.deprecate.Version} other
   * @return {number}
   */
  compareTo(other) {
    const majorCheck = this.major_ - other.major_;
    const minorCheck = this.minor_ - other.minor_;

    return majorCheck || minorCheck;
  }

  /** @override */
  toString() {
    return 'v' + this.major_ + '.' + this.minor_;
  }

  /**
   * Parse the major and minor values out of a version string that is assumed
   * to follow the grammar: "vMAJOR.MINOR.". What comes after the last "." we
   * will ignore.
   *
   * @param {string} versionString
   * @return {!shaka.deprecate.Version}
   */
  static parse(versionString) {
    // Make sure to drop the "v" from the front. We limit the number of splits
    // to two as we don't care what happens after the minor version number.
    // For example: 'a.b.c.d'.split('.', 2) == ['a', 'b']
    const components = versionString.substring(1).split('.', /* limit= */ 2);

    return new shaka.deprecate.Version(
        Number(components[0]),
        Number(components[1]));
  }
};
