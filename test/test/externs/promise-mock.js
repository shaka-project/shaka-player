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
 * @fileoverview Externs for promise-mock.
 * @externs
 */

/** @const */
var PromiseMock = {};

/**
 * A convenience/clarity method added by us after loading the module.
 * Calls runAll(false) to flush all pending Promises without throwing when there
 * are none.
 */
PromiseMock.flush = function() {};

/** @const {!Array} */
PromiseMock.waiting;

/**
 * Execute a pending Promise.
 * @param {number=} count Number of Promises to execute.  Defaults to 1.
 */
PromiseMock.run = function(count) {};

/**
 * Execute all pending Promises.
 * @param {boolean=} strict Defaults to true.  If true, throws an error when no
 *   Promises are pending.
 */
PromiseMock.runAll = function runAll(strict) {};

/** Install the mock. */
PromiseMock.install = function install() {};

/** Restore the original Promise implementation. */
PromiseMock.uninstall = function uninstall() {};

/**
 * Get the result of a Promise synchronously, throws on Promise reject.
 * @param {Promise} promise
 * @returns {*}
 */
PromiseMock.getResult = function result(promise) {};

/** Clear all pending Promises. */
PromiseMock.clear = function clear() {};
