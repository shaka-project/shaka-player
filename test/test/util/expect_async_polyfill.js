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


/**
 * @fileoverview This polyfills the expectAsync method from Jasmine 3.
 */


// TODO: Remove once we upgrade to Jasmine 3.0+.
if (window.expectAsync === undefined) {
  /** @extends {jasmine.MatchersAsync} */
  const AsyncMatchers = class {
    /**
     * @param {!Promise} val
     * @param {boolean=} negated
     */
    constructor(val, negated = false) {
      this.val_ = val;
      this.negated_ = negated;

      // Don't use a normal property to avoid infinite recursion.
      Object.defineProperty(this, 'not', {
        get: () => new AsyncMatchers(val, !negated),
      });
    }

    /** @override */
    async toBeResolved() {
      await this.toBeResolvedShared(/* has_value= */ false);
    }

    /** @override */
    async toBeResolvedTo(expected) {
      await this.toBeResolvedShared(/* has_value= */ true, expected);
    }

    /**
     * @param {boolean} hasValue
     * @param {*=} expected
     * @return {!Promise}
     */
    async toBeResolvedShared(hasValue, expected = undefined) {
      let msg = 'Expected ';
      if (this.negated_) {
        msg += ' not';
      }
      msg += ' to be resolved';
      if (hasValue) {
        msg += ' to ' + expected;
      }

      try {
        const actual = await this.val_;
        if (this.negated_) {
          if (hasValue) {
            expect(actual).not.toEqual(expected);
          } else {
            fail(msg);
          }
        } else if (hasValue) {
          expect(actual).toEqual(expected);
        }
      } catch (e) {
        if (!this.negated_) {
          fail(msg);
        }
      }
    }

    /** @override */
    async toBeRejected() {
      await this.toBeRejectedShared(/* has_value= */ false);
    }

    /** @override */
    async toBeRejectedWith(expected) {
      await this.toBeRejectedShared(/* has_value= */ true, expected);
    }

    /**
     * @param {boolean} hasValue
     * @param {*=} expected
     * @return {!Promise}
     */
    async toBeRejectedShared(hasValue, expected = undefined) {
      let msg = 'Expected ';
      if (this.negated_) {
        msg += ' not';
      }
      msg += ' to be rejected';
      if (hasValue) {
        msg += ' with ' + expected;
      }

      try {
        await this.val_;
        if (!this.negated_) {
          fail(msg);
        }
      } catch (actual) {
        if (this.negated_) {
          if (hasValue) {
            expect(actual).not.toEqual(expected);
          } else {
            fail(msg);
          }
        } else if (hasValue) {
          expect(actual).toEqual(expected);
        }
      }
    }
  };

  /**
   * @param {*} obj
   * @return {!AsyncMatchers}
   */
  window.expectAsync = (obj) => {
    goog.asserts.assert(obj instanceof Promise, 'Must pass promise');
    expect(obj instanceof Promise).toBe(true);
    return new AsyncMatchers(obj);
  };
}
