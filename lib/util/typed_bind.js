/**
 * Copyright 2014 Google Inc.
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
 *
 * @fileoverview A bind wrapper which infers and preserves type information.
 */

goog.provide('shaka.util.TypedBind');


/**
 * @namespace
 *
 * @summary A bind wrapper which infers and preserves type information in
 * the closure compiler.  Function.prototype.bind, in contrast, destroys the
 * compiler's type information.  As a trade-off, this interface limits the
 * number of arguments to the bound function and does not permit partial
 * binding.
 *
 * @param {CLASS} context
 * @param {function(this:CLASS, A)} fn
 * @return {function(A)}
 * @template CLASS, A
 */
shaka.util.TypedBind = function(context, fn) {
  return fn.bind(context);
};

