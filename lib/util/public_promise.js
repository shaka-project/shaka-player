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

goog.provide('shaka.util.PublicPromise');



/**
 * A utility to create Promises with convenient public resolve and reject
 * methods.
 *
 * @constructor
 * @struct
 * @extends {Promise.<T>}
 * @return {Promise.<T>}
 * @template T
 */
shaka.util.PublicPromise = function() {
  var resolvePromise;
  var rejectPromise;

  // Promise.call causes an error.  It seems that inheriting from a native
  // Promise is not permitted by JavaScript interpreters.

  // The work-around is to construct a Promise object, modify it to look like
  // the compiler's picture of PublicPromise, then return it.  The caller of
  // new PublicPromise will receive |promise| instead of |this|, and the
  // compiler will be aware of the additional properties |resolve| and
  // |reject|.

  var promise = new Promise(function(resolve, reject) {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  promise.resolve = resolvePromise;
  promise.reject = rejectPromise;

  return promise;
};


/** @type {function(T=)} */
shaka.util.PublicPromise.prototype.resolve;


/** @type {function(*=)} */
shaka.util.PublicPromise.prototype.reject;
