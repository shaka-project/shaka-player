/**
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
 *
 * @fileoverview A utility to create abortable, multi-stage tasks based on
 * Promises.
 */

goog.provide('shaka.util.Task');

goog.require('shaka.asserts');
goog.require('shaka.util.PublicPromise');



/**
 * @constructor
 */
shaka.util.Task = function() {
  /** @private {!shaka.util.PublicPromise} */
  this.taskPromise_ = new shaka.util.PublicPromise();

  /** @private {boolean} */
  this.started_ = false;

  /** @private {shaka.util.PublicPromise} */
  this.abortedPromise_ = null;

  /** @private {!Array.<shaka.util.Task.StageFunction>} */
  this.stages_ = [];

  /** @private {?function()} */
  this.aborter_ = null;
};


/** @typedef {function(?):(Array|undefined)} */
shaka.util.Task.StageFunction;


/**
 * Adds a new stage to the task.  Should only be used before starting the task.
 *
 * A stage function should return either nothing or an Array with two items in
 * it.
 *
 * If the stage function returns nothing, this stage is always successful and
 * completes right away.  No data will be passed to the next stage.
 *
 * If the stage function returns an Array, the first item should be a Promise
 * which is resolved or rejected when the stage completes.  If this promise is
 * rejected, the task has failed and the task's 'catch' functions are called.
 *
 * The second item in the Array should be a function which aborts this stage
 * of the operation.  If this is omitted, then the stage cannot be terminated
 * early, and aborting the Task during this stage means waiting for the end of
 * the stage.
 *
 * @param {shaka.util.Task.StageFunction} fn The next stage of the task.
 * @throws {Error} if the task has been started.
 */
shaka.util.Task.prototype.append = function(fn) {
  if (this.started_) {
    throw new Error('Cannot append to a running task!');
  }
  this.stages_.push(fn);
};


/**
 * Starts the task.
 * @throws {Error} if the task has already been started.
 */
shaka.util.Task.prototype.start = function() {
  if (this.started_) {
    throw new Error('Task already started!');
  }
  this.started_ = true;
  // The first 'stage' is an empty function, which ensures two things:
  // 1. All real stages execute asynchronously.
  // 2. It is always safe to call startNextStage_ at least once.
  this.stages_.unshift(function() {});
  this.startNextStage_(undefined);
};


/**
 * Abort the task and run all 'catch' handlers.
 * The caught error will have type 'aborted'.
 * @return {!Promise} resolved once the task is aborted.
 */
shaka.util.Task.prototype.abort = function() {
  if (this.abortedPromise_) {
    return this.abortedPromise_;
  }

  // Reject the task now with an aborted error.
  // Then, if the aborter function causes the current stage to fail,
  // we still end with the correct error.
  var error = new Error('Task aborted.');
  error.type = 'aborted';
  this.taskPromise_.reject(error);

  if (!this.started_) {
    this.started_ = true;
    return Promise.resolve();
  }

  if (this.aborter_) {
    this.aborter_();
  }

  this.abortedPromise_ = new shaka.util.PublicPromise();
  return this.abortedPromise_;
};


/**
 * End the running task.  No more stages will be executed, and this will not
 * be considered an error.  Should always be called from within a stage.
 */
shaka.util.Task.prototype.end = function() {
  // Forget all stages after this one.
  this.stages_.splice(1);
};


/**
 * Get a promise which represents the entire task.
 * @return {!Promise}
 */
shaka.util.Task.prototype.getPromise = function() {
  return this.taskPromise_;
};


/**
 * Start the next stage of the task.
 * @param {?} arg passed to the next stage.
 * @private
 */
shaka.util.Task.prototype.startNextStage_ = function(arg) {
  var retval = this.stages_[0](arg);

  var done;
  if (retval) {
    shaka.asserts.assert(retval.length == 1 || retval.length == 2);
    done = retval[0];
    shaka.asserts.assert(done);
    this.aborter_ = retval[1];
  } else {
    done = Promise.resolve();
    this.aborter_ = null;
  }

  done.then(function(arg) {
    if (this.abortedPromise_) {
      // Aborted in between stages or in a way that didn't fail the stage.
      // Clean up.
      this.stages_ = [];
      this.aborter_ = null;
      // Resolve the aborted promise.
      this.abortedPromise_.resolve();
      this.abortedPromise_ = null;
      return;
    }

    // Throw away the stage we just completed.
    this.stages_.shift();

    if (this.stages_.length) {
      // Start the next stage.
      this.startNextStage_(arg);
    } else {
      // All done.  Clean up.
      this.taskPromise_.resolve(arg);
      this.aborter_ = null;
    }
  }.bind(this)).catch(function(error) {
    // Task failed.  Clean up.
    this.taskPromise_.reject(error);
    this.stages_ = [];
    this.aborter_ = null;

    if (this.abortedPromise_) {
      // Aborted during a stage in a way that failed the stage.
      // Resolve the aborted promise.
      this.abortedPromise_.resolve();
      this.abortedPromise_ = null;
    }
  }.bind(this));
};

