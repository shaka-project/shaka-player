/**
 * @license
 * Copyright 2015 Google Inc.
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

goog.provide('shaka.polyfill.Promise');

goog.require('shaka.asserts');
goog.require('shaka.log');


/**
 * @namespace shaka.polyfill.Promise
 * @export
 *
 * @summary A polyfill to implement Promises, primarily for IE.
 * Does not support thenables, but otherwise passes the A+ conformance tests.
 * Note that Promise.all() and Promise.race() are not tested by that suite.
 */



/**
 * @constructor
 * @param {function(function(*), function(*))=} opt_callback
 */
shaka.polyfill.Promise = function(opt_callback) {
  /** @private {!Array.<shaka.polyfill.Promise.Child>} */
  this.thens_ = [];

  /** @private {!Array.<shaka.polyfill.Promise.Child>} */
  this.catches_ = [];

  /** @private {shaka.polyfill.Promise.State} */
  this.state_ = shaka.polyfill.Promise.State.PENDING;

  /** @private {*} */
  this.value_;

  // External callers must supply the callback.  Internally, we may construct
  // child Promises without it, since we can directly access their resolve_ and
  // reject_ methods when convenient.
  if (opt_callback) {
    try {
      opt_callback(this.resolve_.bind(this), this.reject_.bind(this));
    } catch (e) {
      this.reject_(e);
    }
  }
};


/**
 * @typedef {{
 *   promise: !shaka.polyfill.Promise,
 *   callback: (function(*)|undefined)
 * }}
 */
shaka.polyfill.Promise.Child;


/**
 * @enum {number}
 */
shaka.polyfill.Promise.State = {
  PENDING: 0,
  RESOLVED: 1,
  REJECTED: 2
};


/**
 * Install the polyfill if needed.
 * @export
 */
shaka.polyfill.Promise.install = function() {
  if (window.Promise) {
    shaka.log.info('Using native Promises.');
    return;
  }

  shaka.log.info('Using Promises polyfill.');
  // Quoted to work around type-checking, since our then() signature doesn't
  // exactly match that of a native Promise.
  window['Promise'] = shaka.polyfill.Promise;

  // Explicitly installed because the compiler won't necessarily attach them
  // to the compiled constructor.  Exporting them will only attach them to
  // their original namespace, which isn't the same as attaching them to the
  // constructor unless you also export the constructor.
  window.Promise.resolve = shaka.polyfill.Promise.resolve;
  window.Promise.reject = shaka.polyfill.Promise.reject;
  window.Promise.all = shaka.polyfill.Promise.all;
  window.Promise.race = shaka.polyfill.Promise.race;

  // Decide on the best way to invoke a callback as soon as possible.
  // Precompute the Promise.soon_ convenience method to avoid the overhead
  // of this switch every time a callback has to be invoked.
  if (window.setImmediate) {
    // For IE and node.js:
    shaka.polyfill.Promise.soon_ = function(callback) {
      window.setImmediate(callback);
    };
  } else {
    shaka.polyfill.Promise.soon_ = function(callback) {
      window.setTimeout(callback, 0);
    };
  }
};


/**
 * @param {*} value
 * @return {!shaka.polyfill.Promise}
 */
shaka.polyfill.Promise.resolve = function(value) {
  var p = new shaka.polyfill.Promise();
  p.resolve_(value);
  return p;
};


/**
 * @param {*} reason
 * @return {!shaka.polyfill.Promise}
 */
shaka.polyfill.Promise.reject = function(reason) {
  var p = new shaka.polyfill.Promise();
  p.reject_(reason);
  return p;
};


/**
 * @param {!Array.<!shaka.polyfill.Promise>} others
 * @return {!shaka.polyfill.Promise}
 */
shaka.polyfill.Promise.all = function(others) {
  var p = new shaka.polyfill.Promise();
  if (!others.length) {
    p.resolve_([]);
    return p;
  }

  // The array of results must be in the same order as the array of Promises
  // passed to all().  So we pre-allocate the array and keep a count of how
  // many have resolved.  Only when all have resolved is the returned Promise
  // itself resolved.
  var count = 0;
  var values = new Array(others.length);
  var resolve = function(p, i, newValue) {
    shaka.asserts.assert(p.state_ != shaka.polyfill.Promise.State.RESOLVED);
    // If one of the Promises in the array was rejected, this Promise was
    // rejected and new values are ignored.  In such a case, the values array
    // and its contents continue to be alive in memory until all of the Promises
    // in the array have completed.
    if (p.state_ == shaka.polyfill.Promise.State.PENDING) {
      values[i] = newValue;
      count++;
      if (count == values.length) {
        p.resolve_(values);
      }
    }
  };

  var reject = p.reject_.bind(p);
  for (var i = 0; i < others.length; ++i) {
    if (others[i].then) {
      others[i].then(resolve.bind(null, p, i), reject);
    } else {
      resolve(p, i, others[i]);
    }
  }
  return p;
};


/**
 * @param {!Array.<!shaka.polyfill.Promise>} others
 * @return {!shaka.polyfill.Promise}
 */
shaka.polyfill.Promise.race = function(others) {
  var p = new shaka.polyfill.Promise();

  // The returned Promise is resolved or rejected as soon as one of the others
  // is.
  var resolve = p.resolve_.bind(p);
  var reject = p.reject_.bind(p);
  for (var i = 0; i < others.length; ++i) {
    if (others[i].then) {
      others[i].then(resolve, reject);
    } else {
      resolve(others[i]);
    }
  }
  return p;
};


/**
 * @param {function(*)=} opt_successCallback
 * @param {function(*)=} opt_failCallback
 * @return {!shaka.polyfill.Promise}
 * @export
 */
shaka.polyfill.Promise.prototype.then = function(opt_successCallback,
                                                 opt_failCallback) {
  // then() returns a child Promise which is chained onto this one.
  var child = new shaka.polyfill.Promise();
  switch (this.state_) {
    case shaka.polyfill.Promise.State.RESOLVED:
      // This is already resolved, so we can chain to the child ASAP.
      this.schedule_(child, opt_successCallback);
      break;
    case shaka.polyfill.Promise.State.REJECTED:
      // This is already rejected, so we can chain to the child ASAP.
      this.schedule_(child, opt_failCallback);
      break;
    case shaka.polyfill.Promise.State.PENDING:
      // This is pending, so we have to track both callbacks and the child
      // in order to chain later.
      this.thens_.push({ promise: child, callback: opt_successCallback});
      this.catches_.push({ promise: child, callback: opt_failCallback});
      break;
  }

  return child;
};


/**
 * @param {function(*)} callback
 * @return {!shaka.polyfill.Promise}
 * @export
 */
shaka.polyfill.Promise.prototype.catch = function(callback) {
  // Devolves into a two-argument call to 'then'.
  return this.then(undefined, callback);
};


/**
 * @param {*} value
 * @private
 */
shaka.polyfill.Promise.prototype.resolve_ = function(value) {
  // Ignore resolve calls if we aren't still pending.
  if (this.state_ == shaka.polyfill.Promise.State.PENDING) {
    this.value_ = value;
    this.state_ = shaka.polyfill.Promise.State.RESOLVED;
    // Schedule calls to all of the chained callbacks.
    for (var i = 0; i < this.thens_.length; ++i) {
      this.schedule_(this.thens_[i].promise, this.thens_[i].callback);
    }
    this.thens_ = [];
    this.catches_ = [];
  }
};


/**
 * @param {*} reason
 * @private
 */
shaka.polyfill.Promise.prototype.reject_ = function(reason) {
  // Ignore reject calls if we aren't still pending.
  if (this.state_ == shaka.polyfill.Promise.State.PENDING) {
    this.value_ = reason;
    this.state_ = shaka.polyfill.Promise.State.REJECTED;
    // Schedule calls to all of the chained callbacks.
    for (var i = 0; i < this.catches_.length; ++i) {
      this.schedule_(this.catches_[i].promise, this.catches_[i].callback);
    }
    this.thens_ = [];
    this.catches_ = [];
  }
};


/**
 * @param {!shaka.polyfill.Promise} child
 * @param {function(*)|undefined} callback
 * @private
 */
shaka.polyfill.Promise.prototype.schedule_ = function(child, callback) {
  shaka.asserts.assert(this.state_ != shaka.polyfill.Promise.State.PENDING);

  var wrapper = function() {
    if (callback && typeof callback == 'function') {
      // Wrap around the callback.  Exceptions thrown by the callback are
      // converted to failures.
      try {
        var value = callback(this.value_);
      } catch (exception) {
        child.reject_(exception);
        return;
      }

      if (value instanceof shaka.polyfill.Promise) {
        // If the returned value is a Promise, we bind it's state to the child.
        if (value == child) {
          // Without this, a bad calling pattern can cause an infinite loop.
          child.reject_(new TypeError('Chaining cycle detected'));
        } else {
          value.then(child.resolve_.bind(child), child.reject_.bind(child));
        }
      } else {
        // If the returned value is not a Promise, the child is resolved with
        // that value.
        child.resolve_(value);
      }
    } else if (this.state_ == shaka.polyfill.Promise.State.RESOLVED) {
      // No callback for this state, so just chain on down the line.
      child.resolve_(this.value_);
    } else {
      // No callback for this state, so just chain on down the line.
      child.reject_(this.value_);
    }
  };

  // Call the wrapper ASAP.
  shaka.polyfill.Promise.soon_(wrapper.bind(this));
};


/**
 * @param {function()} callback
 * Schedule a callback as soon as possible.
 * Bound in shaka.polyfill.Promise.install() to a specific implementation.
 * @private
 */
shaka.polyfill.Promise.soon_ = function(callback) {};
