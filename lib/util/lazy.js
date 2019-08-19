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

goog.provide('shaka.util.Lazy');

goog.require('goog.asserts');


/**
 * @summary
 * This contains a single value that is lazily generated when it is first
 * requested.  This can store any value except "undefined".
 *
 * @template T
 * @export
 */
shaka.util.Lazy = class {
  /** @param {function():T} gen */
  constructor(gen) {
    /** @private {function():T} */
    this.gen_ = gen;

    /** @private {T|undefined} */
    this.value_ = undefined;
  }

  /**
   * @return {T}
   * @export
   */
  value() {
    if (this.value_ == undefined) {
      // Compiler complains about unknown fields without this cast.
      this.value_ = /** @type {*} */ (this.gen_());
      goog.asserts.assert(
          this.value_ != undefined, 'Unable to create lazy value');
    }
    return this.value_;
  }
};
