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
 * @fileoverview Externs for jasmine.
 * @externs
 */


/** @const */
var jasmine = {};


/** @typedef {(function(function())|function())} */
jasmine.Callback;


/**
 * @param {!Object} matchers
 */
jasmine.addMatchers = function(matchers) {};


/**
 * @constructor
 * @struct
 */
jasmine.Spec;


/** @param {string=} message */
jasmine.Spec.prototype.pend = function(message) {};


/**
 * @type {{failedExpectations: !Array}}
 */
jasmine.Spec.prototype.result;


/**
 * @return {string}
 */
jasmine.Spec.prototype.getFullName = function() {};


/**
 * @constructor
 * @struct
 */
jasmine.Matchers = function() {};


/**
 * @constructor
 * @struct
 */
jasmine.MatchersAsync = function() {};


/**
 * @param {*} value
 * @return {!jasmine.Matchers}
 */
var expect = function(value) {};


/**
 * @param {!Promise} value
 * @return {!jasmine.MatchersAsync}
 */
var expectAsync = function(value) {};


/** @param {string=} message */
var pending = function(message) {};


/** @const {!jasmine.Matchers} */
jasmine.Matchers.prototype.not;


/**
 * @param {*} value
 * @param {string=} message
 */
jasmine.Matchers.prototype.toBe = function(value, message) {};


/**
 * @param {number} value
 * @param {number=} precision A number of decimal places, default 2.
 */
jasmine.Matchers.prototype.toBeCloseTo = function(value, precision) {};


jasmine.Matchers.prototype.toBeDefined = function() {};


jasmine.Matchers.prototype.toBeFalsy = function() {};


/** @param {*} value */
jasmine.Matchers.prototype.toBeGreaterThan = function(value) {};


/** @param {*} value */
jasmine.Matchers.prototype.toBeLessThan = function(value) {};


jasmine.Matchers.prototype.toBeNaN = function() {};


jasmine.Matchers.prototype.toBeNull = function() {};


jasmine.Matchers.prototype.toBeTruthy = function() {};


jasmine.Matchers.prototype.toBeUndefined = function() {};


/** @param {*} value */
jasmine.Matchers.prototype.toContain = function(value) {};


/** @param {*} value */
jasmine.Matchers.prototype.toEqual = function(value) {};


/** @param {*=} value */
jasmine.Matchers.prototype.toHaveBeenCalled = function(value) {};


/** @param {...*} varArgs */
jasmine.Matchers.prototype.toHaveBeenCalledWith = function(varArgs) {};


/** @param {number} times */
jasmine.Matchers.prototype.toHaveBeenCalledTimes = function(times) {};


/** @param {string|RegExp} value */
jasmine.Matchers.prototype.toMatch = function(value) {};


/** @param {*} value */
jasmine.Matchers.prototype.toThrow = function(value) {};


/** @param {*} value */
jasmine.Matchers.prototype.toThrowError = function(value) {};


/**
 * A custom matcher for DOM Node objects.
 * @param {!Element} expected
 */
jasmine.Matchers.prototype.toEqualElement = function(expected) {};

/**
 * A custom matcher for checking if a spy has been called once. This
 * will reset the call count after each call.
 */
jasmine.Matchers.prototype.toHaveBeenCalledOnceMore = function() {};

/**
 * A customer matcher for checking if a spy has been called once and
 * with specific arguments. This will reset the call count after each
 * call.
 *
 * @param {!Array.<*>} args
 */
jasmine.Matchers.prototype.toHaveBeenCalledOnceMoreWith = function(args) {};


/** @type {!jasmine.MatchersAsync} */
jasmine.MatchersAsync.prototype.not;

/** @return {!Promise} */
jasmine.MatchersAsync.prototype.toBeRejected = function() {};

/**
 * @param {*} expected
 * @return {!Promise}
 */
jasmine.MatchersAsync.prototype.toBeRejectedWith = function(expected) {};

/** @return {!Promise} */
jasmine.MatchersAsync.prototype.toBeResolved = function() {};

/**
 * @param {*} expected
 * @return {!Promise}
 */
jasmine.MatchersAsync.prototype.toBeResolvedTo = function(expected) {};

/**
 * @param {string} message
 * @return {!jasmine.MatchersAsync}
 */
jasmine.MatchersAsync.prototype.withContext = function(message) {};


/**
 * @constructor
 * @struct
 */
jasmine.SpyStrategy = function() {};


/**
 * @param {...*} varArgs
 * @return {*}
 */
jasmine.SpyStrategy.prototype.exec = function(varArgs) {};


/** @return {!jasmine.Spy} */
jasmine.SpyStrategy.prototype.callThrough = function() {};


/**
 * @param {*} value
 * @return {!jasmine.Spy}
 */
jasmine.SpyStrategy.prototype.returnValue = function(value) {};


/**
 * @param {...*} varArgs
 * @return {!jasmine.Spy}
 */
jasmine.SpyStrategy.prototype.returnValues = function(varArgs) {};


/**
 * @param {*=} value
 * @return {!jasmine.Spy}
 */
jasmine.SpyStrategy.prototype.throwError = function(value) {};


/**
 * @param {Function} value
 * @return {!jasmine.Spy}
 */
jasmine.SpyStrategy.prototype.callFake = function(value) {};


/** @return {!jasmine.Spy} */
jasmine.SpyStrategy.prototype.stub = function() {};


/**
 * @constructor
 * @struct
 */
jasmine.CallContext = function() {};


/** @const {*} */
jasmine.CallContext.prototype.object;


/** @const {!Array.<*>} */
jasmine.CallContext.prototype.args;


/** @const {*} */
jasmine.CallContext.prototype.returnValue;


/**
 * @constructor
 * @struct
 */
jasmine.CallTracker = function() {};


/** @return {boolean} */
jasmine.CallTracker.prototype.any = function() {};


/** @return {number} */
jasmine.CallTracker.prototype.count = function() {};


/**
 * @param {number} i
 * @return {!Array.<*>}
 */
jasmine.CallTracker.prototype.argsFor = function(i) {};


/** @return {!Array.<!Array.<*>>} */
jasmine.CallTracker.prototype.allArgs = function() {};


/** @return {!Array.<!jasmine.CallContext>} */
jasmine.CallTracker.prototype.all = function() {};


/** @return {!jasmine.CallContext} */
jasmine.CallTracker.prototype.mostRecent = function() {};


/** @return {!jasmine.CallContext} */
jasmine.CallTracker.prototype.first = function() {};


jasmine.CallTracker.prototype.reset = function() {};


/**
 * @constructor
 * @extends {Function}
 */
jasmine.Spy = function() {};


/** @const {!jasmine.CallTracker} */
jasmine.Spy.prototype.calls;


/** @const {!jasmine.SpyStrategy} */
jasmine.Spy.prototype.and;


/**
 * @param {string} name
 * @return {!jasmine.Spy}
 * @see https://github.com/google/closure-compiler/issues/1422
 */
jasmine.createSpy = function(name) {};


/**
 * @param {string} name
 * @param {!Array.<string>} members
 * @return {?}
 */
jasmine.createSpyObj = function(name, members) {};


/**
 * @param {*} obj
 * @param {string} name
 * @return {!jasmine.Spy}
 * @see https://github.com/google/closure-compiler/issues/1422
 */
var spyOn = function(obj, name) {};


/**
 * @param {Function} factory
 * @return {?}
 */
jasmine.any = function(factory) {};


/** @return {!Object} */
jasmine.anything = function() {};


/**
 * @param {!Object} value
 * @return {!Object}
 */
jasmine.objectContaining = function(value) {};


/**
 * @param {string|RegExp} value
 * @return {!Object}
 */
jasmine.stringMatching = function(value) {};


/**
 * @param {!Array.<T>} value
 * @return {!Array.<T>}
 * @template T
 */
jasmine.arrayContaining = function(value) {};


/**
 * @param {jasmine.Callback} callback
 */
var beforeEach = function(callback) {};


/**
 * @param {jasmine.Callback} callback
 */
var beforeAll = function(callback) {};


/**
 * @param {jasmine.Callback} callback
 */
var afterEach = function(callback) {};


/**
 * @param {jasmine.Callback} callback
 */
var afterAll = function(callback) {};


/** @param {*=} reason */
var fail = function(reason) {};


/**
 * @param {string} name
 * @param {jasmine.Callback} callback
 */
var describe = function(name, callback) {};


/**
 * @param {string} name
 * @param {jasmine.Callback} callback
 */
var fdescribe = function(name, callback) {};


/**
 * @param {string} name
 * @param {jasmine.Callback} callback
 */
var xdescribe = function(name, callback) {};


/**
 * @param {string} name
 * @param {jasmine.Callback} callback
 */
var it = function(name, callback) {};


/**
 * @param {string} name
 * @param {jasmine.Callback} callback
 */
var fit = function(name, callback) {};


/**
 * @param {string} name
 * @param {jasmine.Callback} callback
 */
var xit = function(name, callback) {};


/**
 * @constructor
 * @struct
 */
jasmine.Env = function() {};


/**
 * @param {jasmine.Spec} spec
 * @return {boolean}
 */
jasmine.Env.prototype.specFilter = function(spec) {};


/**
 * @param {boolean} random
 */
jasmine.Env.prototype.randomizeTests = function(random) {};


/**
 * @param {string} seed
 * @return {?string}
 */
jasmine.Env.prototype.seed = function(seed) {};


/** @return {!jasmine.Env} */
jasmine.getEnv = function() {};


/** @param {function(*, *)} comparer */
jasmine.addCustomEqualityTester;


/**
 * @constructor
 * @struct
 */
jasmine.Clock = function() {};


/** @return {!jasmine.Clock} */
jasmine.clock = function() {};


jasmine.Clock.prototype.install = function() {};


jasmine.Clock.prototype.uninstall = function() {};


/** @param {number} value */
jasmine.Clock.prototype.tick = function(value) {};


/** @param {(number|Date)=} value */
jasmine.Clock.prototype.mockDate = function(value) {};


/** @const */
jasmine.Ajax = {};


jasmine.Ajax.install = function() {};


jasmine.Ajax.uninstall = function() {};


/**
 * @constructor
 * @struct
 */
jasmine.Ajax.Stub = function() {};


/**
 * @param {string} value
 * @return {!jasmine.Ajax.Stub}
 */
jasmine.Ajax.stubRequest = function(value) {};


/** @param {!Object} value */
jasmine.Ajax.Stub.prototype.andReturn = function(value) {};


jasmine.Ajax.Stub.prototype.andTimeout = function() {};


jasmine.Ajax.Stub.prototype.andError = function() {};


/**
 * @constructor
 * @extends {XMLHttpRequest}
 * @struct
 */
jasmine.Ajax.RequestStub = function() {};


/** @const {string|RegExp} */
jasmine.Ajax.RequestStub.prototype.url;


/** @const {string|RegExp} */
jasmine.Ajax.RequestStub.prototype.query;


/** @const {string|RegExp} */
jasmine.Ajax.RequestStub.prototype.data;


/** @const {string} */
jasmine.Ajax.RequestStub.prototype.method;


/** @const {!Object.<string, string>} */
jasmine.Ajax.RequestStub.prototype.requestHeaders;


/** @param {!Object} options */
jasmine.Ajax.RequestStub.prototype.andReturn = function(options) {};


/** @return {boolean} */
jasmine.Ajax.RequestStub.prototype.isReturn = function() {};


jasmine.Ajax.RequestStub.prototype.andError = function() {};


/** @return {boolean} */
jasmine.Ajax.RequestStub.prototype.isError = function() {};


jasmine.Ajax.RequestStub.prototype.andTimeout = function() {};


/** @return {boolean} */
jasmine.Ajax.RequestStub.prototype.isTimeout = function() {};


/**
 * @constructor
 * @struct
 */
jasmine.Ajax.RequestTracker = function() {};


/** @return {!jasmine.Ajax.RequestStub} */
jasmine.Ajax.RequestTracker.prototype.first = function() {};


/** @return {number} */
jasmine.Ajax.RequestTracker.prototype.count = function() {};


jasmine.Ajax.RequestTracker.prototype.reset = function() {};


/** @return {!jasmine.Ajax.RequestStub} */
jasmine.Ajax.RequestTracker.prototype.mostRecent = function() {};


/**
 * @param {number} index
 * @return {jasmine.Ajax.RequestStub}
 */
jasmine.Ajax.RequestTracker.prototype.at = function(index) {};


/** @const {!jasmine.Ajax.RequestTracker} */
jasmine.Ajax.requests;
