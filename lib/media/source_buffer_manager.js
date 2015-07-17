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
 * @fileoverview Manages a SourceBuffer an provides an enhanced interface
 * based on Promises.
 */

goog.provide('shaka.media.SourceBufferManager');

goog.require('shaka.asserts');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.IBandwidthEstimator');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.RangeRequest');
goog.require('shaka.util.Task');
goog.require('shaka.util.TypedBind');



/**
 * Creates a SourceBufferManager (SBM).
 *
 * The SBM manages access to a SourceBuffer object through a fetch operation
 * and a clear operation. It also maintains a "virtual source buffer" to keep
 * track of which segments have been appended to the actual underlying
 * SourceBuffer. The SBM uses this virtual source buffer because it cannot rely
 * on the browser to tell it what is in the underlying SourceBuffer because a
 * SegmentIndex may use PTS (presentation timestamps) and a browser may use
 * DTS (decoding timestamps) or vice-versa.
 *
 * @param {!MediaSource} mediaSource The SourceBuffer's parent MediaSource.
 * @param {!SourceBuffer} sourceBuffer
 * @param {!shaka.util.IBandwidthEstimator} estimator A bandwidth estimator to
 *     attach to all requests.
 * @struct
 * @constructor
 */
shaka.media.SourceBufferManager = function(
    mediaSource, sourceBuffer, estimator) {
  /** @private {!MediaSource} */
  this.mediaSource_ = mediaSource;

  /** @private {!SourceBuffer} */
  this.sourceBuffer_ = sourceBuffer;

  /** @private {!shaka.util.IBandwidthEstimator} */
  this.estimator_ = estimator;

  /** @private {!shaka.util.EventManager} */
  this.eventManager_ = new shaka.util.EventManager();

  /**
   * Contains a list of segments that have been inserted into the SourceBuffer.
   * These segments may or may not have been evicted by the browser.
   * @private {!Array.<!shaka.media.SegmentReference>}
   */
  this.inserted_ = [];

  /** @private {number} */
  this.timestampCorrection_ = 0;

  /** @private {shaka.util.Task} */
  this.task_ = null;

  /** @private {shaka.util.PublicPromise} */
  this.operationPromise_ = null;

  this.eventManager_.listen(
      this.sourceBuffer_,
      'updateend',
      this.onSourceBufferUpdateEnd_.bind(this));
};


/**
 * A fudge factor to apply to buffered ranges to account for rounding error.
 * @const {number}
 * @private
 */
shaka.media.SourceBufferManager.FUDGE_FACTOR_ = 1 / 60;


/**
 * Destroys the SourceBufferManager.
 * @suppress {checkTypes} to set otherwise non-nullable types to null.
 */
shaka.media.SourceBufferManager.prototype.destroy = function() {
  this.abort();

  this.operationPromise_ = null;
  this.task_ = null;

  this.inserted_ = null;

  this.eventManager_.destroy();
  this.eventManager_ = null;

  this.sourceBuffer_ = null;
  this.mediaSource_ = null;
};


/**
 * Checks if the given timestamp is buffered according to the virtual source
 * buffer.
 *
 * Note that as a SegmentIndex may use PTS and a browser may use DTS or
 * vice-versa, and due to MSE implementation details, isInserted(t) does not
 * imply isBuffered(t) nor does isBuffered(t) imply isInserted(t).
 *
 * @param {number} timestamp The timestamp in seconds.
 * @return {boolean} True if the timestamp is buffered.
 */
shaka.media.SourceBufferManager.prototype.isInserted = function(timestamp) {
  return shaka.media.SegmentReference.find(this.inserted_, timestamp) >= 0;
};


/**
 * Gets the SegmentReference corresponding to the last inserted segment.
 *
 * @return {shaka.media.SegmentReference}
 */
shaka.media.SourceBufferManager.prototype.getLastInserted = function() {
  var length = this.inserted_.length;
  return length > 0 ? this.inserted_[length - 1] : null;
};


/**
 * Checks if the given timestamp is buffered according to the underlying
 * SourceBuffer.
 *
 * @param {number} timestamp The timestamp in seconds.
 * @return {boolean} True if the timestamp is buffered.
 */
shaka.media.SourceBufferManager.prototype.isBuffered = function(timestamp) {
  return this.bufferedAheadOf(timestamp) > 0;
};


/**
 * Computes how far ahead of the given timestamp we have buffered according to
 * the underlying SourceBuffer.
 *
 * @param {number} timestamp The timestamp in seconds.
 * @return {number} in seconds
 */
shaka.media.SourceBufferManager.prototype.bufferedAheadOf =
    function(timestamp) {
  var b = this.sourceBuffer_.buffered;
  for (var i = 0; i < b.length; ++i) {
    var start = b.start(i) - shaka.media.SourceBufferManager.FUDGE_FACTOR_;
    var end = b.end(i) + shaka.media.SourceBufferManager.FUDGE_FACTOR_;
    if (timestamp >= start && timestamp <= end) {
      return b.end(i) - timestamp;
    }
  }
  return 0;
};


/**
 * Fetches the segment corresponding to the given SegmentReference and appends
 * the it to the underlying SourceBuffer. This cannot be called if another
 * operation is in progress.
 *
 * @param {!shaka.media.SegmentReference} reference
 * @param {ArrayBuffer} initData Optional initialization segment that
 *     will be appended to the underlying SourceBuffer before the retrieved
 *     segment.
 * @return {!Promise.<?number>} A promise to a timestamp correction, which may
 *     be null if a timestamp correction could not be computed. A timestamp
 *     correction is computed if the underlying SourceBuffer is initially
 *     empty. The timestamp correction, if one is computed, is not
 *     automatically applied to the virtual source buffer; to apply a timestamp
 *     correction, call correct().
 */
shaka.media.SourceBufferManager.prototype.fetch = function(
    reference, initData) {
  shaka.log.v1('fetch');

  // Check state.
  shaka.asserts.assert(!this.task_);
  if (this.task_) {
    var error = new Error('Cannot fetch: previous operation not complete.');
    error.type = 'stream';
    return Promise.reject(error);
  }

  this.task_ = new shaka.util.Task();

  if (initData) {
    this.task_.append(
        function() {
          return [this.append_(/** @type {!ArrayBuffer} */(initData)),
                  this.abort_.bind(this)];
        }.bind(this));
  }

  this.task_.append(
      function() {
        var refDuration =
            reference.endTime ? (reference.endTime - reference.startTime) : 1;
        var request = new shaka.util.RangeRequest(
            reference.url.toString(),
            reference.startByte,
            reference.endByte,
            3 /* maxAttempts */,
            refDuration * 1000 /* baseRetryDelayMs */);
        request.estimator = this.estimator_;
        return [request.send(), request.abort.bind(request)];
      }.bind(this));

  this.task_.append(shaka.util.TypedBind(this,
      /** @param {!ArrayBuffer} data */
      function(data) {
        shaka.log.debug('Estimated bandwidth:',
            (this.estimator_.getBandwidth() / 1e6).toFixed(2), 'Mbps');
        return [this.append_(data), this.abort_.bind(this)];
      }));

  var computeTimestampCorrection =
      this.sourceBuffer_.buffered.length == 0 &&
      this.inserted_.length == 0;

  /** @type {?number} */
  var timestampCorrection = null;

  this.task_.append(
      function() {
        if (computeTimestampCorrection) {
          shaka.asserts.assert(this.inserted_.length == 0);
          var expectedTimestamp = reference.startTime;
          shaka.asserts.assert(this.sourceBuffer_.buffered.length > 0);
          var actualTimestamp = this.sourceBuffer_.buffered.start(0);
          timestampCorrection = actualTimestamp - expectedTimestamp;
        }

        var i = shaka.media.SegmentReference.find(
            this.inserted_, reference.startTime);
        if (i >= 0) {
          // The SegmentReference at i has a start time less than |reference|'s.
          this.inserted_.splice(i + 1, 0, reference);
        } else {
          this.inserted_.push(reference);
        }
      }.bind(this));

  return this.startTask_().then(
      function() {
        return Promise.resolve(timestampCorrection);
      }.bind(this));
};


/**
 * Resets the virtual source buffer and clears all media from the underlying
 * SourceBuffer. The returned promise will resolve immediately if there is no
 * media within the underlying SourceBuffer. This cannot be called if another
 * operation is in progress.
 *
 * @return {!Promise}
 */
shaka.media.SourceBufferManager.prototype.clear = function() {
  shaka.log.v1('clear');

  // Check state.
  shaka.asserts.assert(!this.task_);
  if (this.task_) {
    var error = new Error('Cannot clear: previous operation not complete.');
    error.type = 'stream';
    return Promise.reject(error);
  }

  this.task_ = new shaka.util.Task();

  this.task_.append(function() {
    var p = this.clear_();
    return [p, this.abort_.bind(this)];
  }.bind(this));

  return this.startTask_();
};


/**
 * Aborts the current operation if one exists.
 * The returned promise will never be rejected.
 *
 * @return {!Promise}
 */
shaka.media.SourceBufferManager.prototype.abort = function() {
  shaka.log.v1('abort');
  if (!this.task_) {
    return Promise.resolve();
  }
  return this.task_.abort();
};


/**
 * Corrects each SegmentReference in the virtual source buffer by the given
 * timestamp correction. The previous timestamp correction, if it exists, is
 * replaced.
 *
 * @param {number} timestampCorrection
 */
shaka.media.SourceBufferManager.prototype.correct = function(
    timestampCorrection) {
  var delta = timestampCorrection - this.timestampCorrection_;
  if (delta == 0) {
    return;
  }

  this.inserted_ = shaka.media.SegmentReference.shift(this.inserted_, delta);
  this.timestampCorrection_ = timestampCorrection;

  shaka.log.debug(
      'Applied timestamp correction of',
      timestampCorrection,
      'seconds to SourceBufferManager',
      this);
};


/**
 * Emits an error message and returns true if there are multiple buffered
 * ranges; otherwise, does nothing and returns false.
 *
 * @return {boolean}
 */
shaka.media.SourceBufferManager.prototype.detectMultipleBufferedRanges =
    function() {
  if (this.sourceBuffer_.buffered.length > 1) {
    shaka.log.error(
        'Multiple buffered ranges detected:',
        'Either the content has gaps in it,',
        'the content\'s segments are not aligned across bitrates,',
        'or the browser has evicted the middle of the buffer.');
    return true;
  } else {
    return false;
  }
};


/**
 * Starts the task and returns a Promise which is resolved/rejected after the
 * task ends and is cleaned up.
 *
 * @return {!Promise}
 * @private
 */
shaka.media.SourceBufferManager.prototype.startTask_ = function() {
  shaka.asserts.assert(this.task_);
  this.task_.start();
  return this.task_.getPromise().then(function() {
    this.task_ = null;
  }.bind(this)).catch(function(error) {
    this.task_ = null;
    return Promise.reject(error);
  }.bind(this));
};


/**
 * Append to the source buffer.
 *
 * @param {!ArrayBuffer} data
 * @return {!Promise}
 * @private
 */
shaka.media.SourceBufferManager.prototype.append_ = function(data) {
  shaka.asserts.assert(!this.operationPromise_);
  shaka.asserts.assert(this.task_);

  try {
    // This will trigger an 'updateend' event.
    this.sourceBuffer_.appendBuffer(data);
  } catch (exception) {
    shaka.log.debug('Failed to append buffer:', exception);
    return Promise.reject(exception);
  }

  this.operationPromise_ = new shaka.util.PublicPromise();
  return this.operationPromise_;
};


/**
 * Clear the source buffer.
 *
 * @return {!Promise}
 * @private
 */
shaka.media.SourceBufferManager.prototype.clear_ = function() {
  shaka.asserts.assert(!this.operationPromise_);

  if (this.sourceBuffer_.buffered.length == 0) {
    shaka.log.v1('Nothing to clear.');
    shaka.asserts.assert(this.inserted_.length == 0);
    return Promise.resolve();
  }

  try {
    // This will trigger an 'updateend' event.
    this.sourceBuffer_.remove(0, Number.POSITIVE_INFINITY);
  } catch (exception) {
    shaka.log.debug('Failed to clear buffer:', exception);
    return Promise.reject(exception);
  }

  // Clear |inserted_| immediately since any inserted segments will be
  // gone soon.
  this.inserted_ = [];

  this.operationPromise_ = new shaka.util.PublicPromise();
  return this.operationPromise_;
};


/**
 * Abort the current operation on the source buffer.
 *
 * @private
 */
shaka.media.SourceBufferManager.prototype.abort_ = function() {
  shaka.log.v1('abort_');
  shaka.asserts.assert(this.operationPromise_);
  if (this.mediaSource_.readyState == 'open') {
    this.sourceBuffer_.abort();
  }
};


/**
 * |sourceBuffer_|'s 'updateend' callback.
 *
 * @param {!Event} event
 * @private
 */
shaka.media.SourceBufferManager.prototype.onSourceBufferUpdateEnd_ =
    function(event) {
  shaka.log.v2('onSourceBufferUpdateEnd_');

  shaka.asserts.assert(!this.sourceBuffer_.updating);
  shaka.asserts.assert(this.operationPromise_);

  this.operationPromise_.resolve();
  this.operationPromise_ = null;
};

