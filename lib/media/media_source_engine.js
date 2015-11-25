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

goog.provide('shaka.media.MediaSourceEngine');

goog.require('shaka.asserts');
goog.require('shaka.media.TextSourceBuffer');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.PublicPromise');



/**
 * MediaSourceEngine wraps all operations on MediaSource and SourceBuffers.
 * All asynchronous operations return a Promise, and all operations are
 * internally synchronized and serialized as needed.  Operations that can
 * be done in parallel will be done in parallel.
 *
 * @param {!MediaSource} mediaSource The MediaSource, which must be in the
 *     'open' state.
 * @param {TextTrack} textTrack The TextTrack to use for subtitles/captions.
 *
 * @struct
 * @constructor
 * @implements {shaka.util.IDestroyable}
 */
shaka.media.MediaSourceEngine = function(mediaSource, textTrack) {
  shaka.asserts.assert(mediaSource.readyState == 'open',
                       'The MediaSource should be in the \'open\' state.');

  /** @private {MediaSource} */
  this.mediaSource_ = mediaSource;

  /** @private {TextTrack} */
  this.textTrack_ = textTrack;

  /** @private {!Object.<string, !SourceBuffer>} */
  this.sourceBuffers_ = {};

  /**
   * @private {!Object.<string,
   *                    !Array.<shaka.media.MediaSourceEngine.Operation>>}
   */
  this.queues_ = {};

  /** @private {shaka.util.EventManager} */
  this.eventManager_ = new shaka.util.EventManager();

  /** @private {boolean} */
  this.destroyed_ = false;
};


/** @typedef {{start: function(), p: !shaka.util.PublicPromise}} */
shaka.media.MediaSourceEngine.Operation;


/**
 * Checks if a certain type is supported.
 *
 * @param {string} mimeType
 * @return {boolean}
 */
shaka.media.MediaSourceEngine.isTypeSupported = function(mimeType) {
  var contentType = mimeType.split('/')[0];
  if (contentType == 'text') {
    return shaka.media.TextSourceBuffer.isTypeSupported(mimeType);
  }
  return MediaSource.isTypeSupported(mimeType);
};


/**
 * @override
 */
shaka.media.MediaSourceEngine.prototype.destroy = function() {
  this.destroyed_ = true;

  var cleanup = [];

  for (var contentType in this.queues_) {
    // Make a local copy of the queue and the first item.
    var q = this.queues_[contentType];
    var inProgress = q[0];

    // Drop everything else out of the queue.
    this.queues_[contentType] = q.slice(0, 1);

    // We will wait for this item to complete/fail.
    if (inProgress) {
      cleanup.push(inProgress.p.catch(function() {}));
    }

    // The rest will be rejected silently if possible.
    for (var i = 1; i < q.length; ++i) {
      q[i].p.catch(function() {});
      q[i].p.reject();
    }
  }

  return Promise.all(cleanup).then(function() {
    this.eventManager_.destroy();
    this.eventManager_ = null;
    this.mediaSource_ = null;
    this.textTrack_ = null;
    this.sourceBuffers_ = {};
    if (!COMPILED) {
      for (var contentType in this.queues_) {
        shaka.asserts.assert(
            this.queues_[contentType].length == 0,
            contentType + ' queue should be empty after destroy!');
      }
    }
    this.queues_ = {};
  }.bind(this));
};


/**
 * @param {!Object.<string, string>} typeConfig A map of content types to full
 *     MIME types.  For example: { 'audio': 'audio/webm; codecs="vorbis"',
 *     'video': 'video/webm; codecs="vp9"', 'text': 'text/vtt' }.
 *     All types given must be supported.
 *
 * @throws InvalidAccessError if blank MIME types are given
 * @throws NotSupportedError if unsupported MIME types are given
 * @throws QuotaExceededError if the browser can't support that many buffers
 */
shaka.media.MediaSourceEngine.prototype.init = function(typeConfig) {
  for (var contentType in typeConfig) {
    var mimeType = typeConfig[contentType];
    shaka.asserts.assert(
        shaka.media.MediaSourceEngine.isTypeSupported(mimeType),
        'Type negotation should happen before MediaSourceEngine.init!');

    var sourceBuffer;
    if (contentType == 'text') {
      var textSourceBuffer =
          new shaka.media.TextSourceBuffer(this.textTrack_, mimeType);
      // This crazy cast is a hack to satisfy the compiler, since
      // TextSourceBuffer isn't a subclass of SourceBuffer.
      sourceBuffer = /** @type {!SourceBuffer} */(/** @type {*} */(
          textSourceBuffer));
    } else {
      sourceBuffer = /** @type {!SourceBuffer} */(
          this.mediaSource_.addSourceBuffer(mimeType));
    }

    this.eventManager_.listen(
        sourceBuffer, 'error', this.onError_.bind(this, contentType));
    this.eventManager_.listen(
        sourceBuffer, 'updateend', this.onUpdateEnd_.bind(this, contentType));

    this.sourceBuffers_[contentType] = sourceBuffer;
    this.queues_[contentType] = [];
  }
};


/**
 * Computes how far ahead of the given timestamp we have buffered.
 *
 * @param {string} contentType
 * @param {number} time
 * @return {number} in seconds
 */
shaka.media.MediaSourceEngine.prototype.bufferedAheadOf =
    function(contentType, time) {
  // NOTE: On IE11, buffered ranges may show appended data before the associated
  // append operation is complete.
  var b = this.sourceBuffers_[contentType].buffered;
  var fudge = 0.000001;  // 1us
  // NOTE: The 1us fudge is needed on Safari, where removal up to X may leave a
  // range which starts at X + 1us.
  for (var i = 0; i < b.length; ++i) {
    if (time + fudge >= b.start(i) && time < b.end(i)) {
      return b.end(i) - time;
    }
  }
  return 0;
};


/**
 * Enqueue an operation to append data to the SourceBuffer.
 *
 * @param {string} contentType
 * @param {!ArrayBuffer|!ArrayBufferView} data
 * @return {!Promise}
 */
shaka.media.MediaSourceEngine.prototype.appendBuffer =
    function(contentType, data) {
  return this.enqueueOperation_(
      contentType,
      this.append_.bind(this, contentType, data));
};


/**
 * Enqueue an operation to remove data from the SourceBuffer.
 *
 * @param {string} contentType
 * @param {number} startTime
 * @param {number} endTime
 * @return {!Promise}
 */
shaka.media.MediaSourceEngine.prototype.remove =
    function(contentType, startTime, endTime) {
  return this.enqueueOperation_(
      contentType,
      this.remove_.bind(this, contentType, startTime, endTime));
};


/**
 * @param {string=} opt_reason Valid reasons are 'network' and 'decode'.
 * @return {!Promise}
 * @see http://w3c.github.io/media-source/#idl-def-EndOfStreamError
 */
shaka.media.MediaSourceEngine.prototype.endOfStream = function(opt_reason) {
  return this.enqueueBlockingOperation_(function() {
    // Chrome won't let me pass undefined, but it will let me omit the
    // argument.  Firefox does not have this problem.
    // TODO: File a bug about this.
    if (opt_reason) {
      this.mediaSource_.endOfStream(opt_reason);
    } else {
      this.mediaSource_.endOfStream();
    }
  }.bind(this));
};


/**
 * We only support increasing duration at this time.  Decreasing duration
 * causes the MSE removal algorithm to run, which results in an 'updateend'
 * event.  Supporting this scenario would be complicated, and is not currently
 * needed.
 *
 * @param {number} duration
 * @return {!Promise}
 */
shaka.media.MediaSourceEngine.prototype.setDuration = function(duration) {
  shaka.asserts.assert(this.mediaSource_.duration <= duration,
                       'duration cannot decrease: ' +
                       this.mediaSource_.duration + ' -> ' + duration);
  return this.enqueueBlockingOperation_(function() {
    this.mediaSource_.duration = duration;
  }.bind(this));
};


/**
 * Append data to the SourceBuffer.
 * @param {string} contentType
 * @param {!ArrayBuffer|!ArrayBufferView} data
 * @private
 */
shaka.media.MediaSourceEngine.prototype.append_ =
    function(contentType, data) {
  // This will trigger an 'updateend' event.
  this.sourceBuffers_[contentType].appendBuffer(data);
};


/**
 * Remove data from the SourceBuffer.
 * @param {string} contentType
 * @param {number} startTime
 * @param {number} endTime
 * @private
 */
shaka.media.MediaSourceEngine.prototype.remove_ =
    function(contentType, startTime, endTime) {
  // This will trigger an 'updateend' event.
  this.sourceBuffers_[contentType].remove(startTime, endTime);
};


/**
 * @param {string} contentType
 * @param {!Event} event
 * @private
 */
shaka.media.MediaSourceEngine.prototype.onError_ =
    function(contentType, event) {
  var operation = this.queues_[contentType][0];
  shaka.asserts.assert(operation, 'Spurious error event!');
  shaka.asserts.assert(!this.sourceBuffers_[contentType].updating,
                       'SourceBuffer should not be updating on error!');
  operation.p.reject();
  // Do not pop from queue.  An 'updateend' event will fire next, and to avoid
  // synchronizing these two event handlers, we will allow that one to pop from
  // the queue as normal.  Note that because the operation has already been
  // rejected, the call to resolve() in the 'updateend' handler will have no
  // effect.
};


/**
 * @param {string} contentType
 * @param {!Event} event
 * @private
 */
shaka.media.MediaSourceEngine.prototype.onUpdateEnd_ =
    function(contentType, event) {
  var operation = this.queues_[contentType][0];
  shaka.asserts.assert(operation, 'Spurious updateend event!');
  shaka.asserts.assert(!this.sourceBuffers_[contentType].updating,
                       'SourceBuffer should not be updating on updateend!');
  operation.p.resolve();
  this.popFromQueue_(contentType);
};


/**
 * Enqueue an operation and start it if appropriate.
 *
 * @param {string} contentType
 * @param {function()} start
 * @return {!Promise}
 * @private
 */
shaka.media.MediaSourceEngine.prototype.enqueueOperation_ =
    function(contentType, start) {
  if (this.destroyed_) return Promise.reject();

  var operation = {
    start: start,
    p: new shaka.util.PublicPromise()
  };
  this.queues_[contentType].push(operation);

  if (this.queues_[contentType].length == 1) {
    try {
      operation.start();
    } catch (exception) {
      operation.p.reject(exception);
      this.popFromQueue_(contentType);
    }
  }
  return operation.p;
};


/**
 * Enqueue an operation which must block all other operations on all
 * SourceBuffers.
 *
 * @param {function()} run
 * @return {!Promise}
 * @private
 */
shaka.media.MediaSourceEngine.prototype.enqueueBlockingOperation_ =
    function(run) {
  if (this.destroyed_) return Promise.reject();

  var allWaiters = [];

  // Enqueue a 'wait' operation onto each queue.
  // This operation signals its readiness when it starts.
  // When all wait operations are ready, the real operation takes place.
  for (var contentType in this.sourceBuffers_) {
    var ready = new shaka.util.PublicPromise();
    var operation = {
      start: function(ready) { ready.resolve(); }.bind(null, ready),
      p: ready
    };

    this.queues_[contentType].push(operation);
    allWaiters.push(ready);

    if (this.queues_[contentType].length == 1) {
      operation.start();
    }
  }

  // Return a Promise to the real operation, which waits to begin until there
  // are no other in-progress operations on any SourceBuffers.
  return Promise.all(allWaiters).then(function() {
    if (!COMPILED) {
      // If we did it correctly, nothing is updating.
      for (var contentType in this.sourceBuffers_) {
        shaka.asserts.assert(
            this.sourceBuffers_[contentType].updating == false,
            'SourceBuffers should not be updating after a blocking op!');
      }
    }

    var ret;
    // Run the real operation, which is synchronous.
    try {
      run();
    } catch (exception) {
      ret = Promise.reject(exception);
    }

    // Unblock the queues.
    for (var contentType in this.sourceBuffers_) {
      this.popFromQueue_(contentType);
    }

    return ret;
  }.bind(this), function() {
    // One of the waiters failed, which means we've been destroyed.
    shaka.asserts.assert(this.destroyed_);
    // We haven't popped from the queue.  Canceled waiters have been removed by
    // destroy.  What's left now should just be resolved waiters.  In uncompiled
    // mode, we will maintain good hygiene and make sure the assert at the end
    // of destroy passes.  In compiled mode, the queues are wiped in destroy.
    if (!COMPILED) {
      for (var contentType in this.sourceBuffers_) {
        if (this.queues_[contentType].length) {
          shaka.asserts.assert(
              this.queues_[contentType].length == 1,
              'Should be at most one item in queue!');
          shaka.asserts.assert(
              allWaiters.indexOf(this.queues_[contentType][0].p) != -1,
              'The item in queue should be one of our waiters!');
          this.queues_[contentType].shift();
        }
      }
    }
    return Promise.reject();
  }.bind(this));
};


/**
 * Pop from the front of the queue and start a new operation.
 * @param {string} contentType
 * @private
 */
shaka.media.MediaSourceEngine.prototype.popFromQueue_ = function(contentType) {
  // Remove the in-progress operation, which is now complete.
  this.queues_[contentType].shift();
  // Retrieve the next operation, if any, from the queue and start it.
  var next = this.queues_[contentType][0];
  if (next) {
    try {
      next.start();
    } catch (exception) {
      next.p.reject(exception);
      this.popFromQueue_(contentType);
    }
  }
};
