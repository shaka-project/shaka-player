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


/** @typedef {function(function())} */
jasmine.Callback;



/**
 * @constructor
 * @struct
 */
jasmine.Spec;


/** @param {string=} opt_message */
jasmine.Spec.prototype.pend = function(opt_message) {};


/**
 * @type {{failedExpectations: !Array}}
 * gjslint: disable=900
 */
jasmine.Spec.prototype.result;



/**
 * @constructor
 * @struct
 */
jasmine.Matchers = function() {};


/**
 * @param {*} value
 * @return {!jasmine.Matchers}
 */
var expect = function(value) {};


/** @param {string=} opt_message */
var pending = function(opt_message) {};


/** @const {!jasmine.Matchers} */
jasmine.Matchers.prototype.not;


/** @param {*} value */
jasmine.Matchers.prototype.toBe = function(value) {};


/**
 * @param {number} value
 * @param {number=} opt_precision A number of decimal places, default 2.
 */
jasmine.Matchers.prototype.toBeCloseTo = function(value, opt_precision) {};


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


/** @param {*=} opt_value */
jasmine.Matchers.prototype.toHaveBeenCalled = function(opt_value) {};


/** @param {...*} var_args */
jasmine.Matchers.prototype.toHaveBeenCalledWith = function(var_args) {};


/** @param {string|RegExp} value */
jasmine.Matchers.prototype.toMatch = function(value) {};


/** @param {*} value */
jasmine.Matchers.prototype.toThrow = function(value) {};


/** @param {*} value */
jasmine.Matchers.prototype.toThrowError = function(value) {};



/**
 * @constructor
 * @struct
 */
jasmine.SpyStrategy = function() {};


/**
 * @param {...*} var_args
 * @return {*}
 */
jasmine.SpyStrategy.prototype.exec = function(var_args) {};


/** @return {!jasmine.Spy} */
jasmine.SpyStrategy.prototype.callThrough = function() {};


/**
 * @param {*} value
 * @return {!jasmine.Spy}
 */
jasmine.SpyStrategy.prototype.returnValue = function(value) {};


/**
 * @param {...*} var_args
 * @return {!jasmine.Spy}
 */
jasmine.SpyStrategy.prototype.returnValues = function(var_args) {};


/**
 * @param {*} value
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
 * @struct
 */
jasmine.Spy = function() {};


/** @const {!jasmine.CallTracker} */
jasmine.Spy.prototype.calls;


/** @const {!jasmine.SpyStrategy} */
jasmine.Spy.prototype.and;


/**
 * @param {string} name
 * @return {!jasmine.Spy|!Function}
 * @see https://github.com/google/closure-compiler/issues/1422
 */
jasmine.createSpy = function(name) {};


/**
 * @param {string} name
 * @param {!Array.<string>} members
 * @return {!Object}
 */
jasmine.createSpyObj = function(name, members) {};


/**
 * @param {*} obj
 * @param {string} name
 * @return {!jasmine.Spy|!Function}
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


/** @param {*=} opt_reason */
var fail = function(opt_reason) {};


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


/** @param {(number|Date)=} opt_value */
jasmine.Clock.prototype.mockDate = function(opt_value) {};


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


/** const {string|RegExp} */
jasmine.Ajax.RequestStub.prototype.query;


/** const {string|RegExp} */
jasmine.Ajax.RequestStub.prototype.data;


/** const {string} */
jasmine.Ajax.RequestStub.prototype.method;


/** const {!Object.<string, string>} */
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


/** @const {!jasmine.Ajax.RequestTracker} */
jasmine.Ajax.requests;


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

