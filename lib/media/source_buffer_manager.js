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
goog.require('shaka.media.SegmentRange');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.IBandwidthEstimator');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.RangeRequest');
goog.require('shaka.util.Task');



/**
 * Creates a SourceBufferManager (SBM).
 *
 * The SBM manages access to a SourceBuffer object through a fetch operation
 * and a clear operation. It also maintains a "virtual source buffer" to keep
 * track of which segments have been appended to the actual underlying source
 * buffer. The SBM uses this virtual source buffer because it cannot rely on
 * the browser to tell it what is in the underlying SourceBuffer because the
 * segment index may use PTS (presentation timestamps) and the browser may use
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
   * A map that indicates which segments from the current stream have been
   * inserted into the SourceBuffer. These segments may or may not have been
   * evicted by the browser.
   * @private {!Object.<number, boolean>}
   */
  this.inserted_ = {};

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
 * Checks if the segment corresponding to the given SegmentReference has
 * been inserted.
 * @param {!shaka.media.SegmentReference} reference
 * @return {boolean} True if the segment has been inserted.
 */
shaka.media.SourceBufferManager.prototype.isInserted = function(reference) {
  return this.inserted_[reference.id];
};


/**
 * Checks if the given timestamp is buffered according to the SourceBuffer.
 * @param {number} timestamp
 * @return {boolean} True if the timestamp is buffered.
 */
shaka.media.SourceBufferManager.prototype.isBuffered = function(timestamp) {
  return this.bufferedAheadOf(timestamp) > 0;
};


/**
 * Computes how far ahead of the given timestamp we have buffered.
 * @param {number} timestamp
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
 * Fetches the segments specified by the given SegmentRange and appends the
 * retrieved segment data to the underlying SourceBuffer. This cannot be called
 * if another operation is in progress.
 *
 * @param {!shaka.media.SegmentRange} segmentRange
 * @param {ArrayBuffer} initSegment Optional initialization segment that
 *     will be appended to the underlying SourceBuffer before the retrieved
 *     segment data.
 * @param {!Array.<number>} endEarlyOn A list of statuses on which the task
 *     will be ended early without failure.
 *
 * @return {!Promise}
 */
shaka.media.SourceBufferManager.prototype.fetch = function(
    segmentRange, initSegment, endEarlyOn) {
  shaka.log.v1('fetch');

  // Check state.
  shaka.asserts.assert(!this.task_);
  if (this.task_) {
    var error = new Error('Cannot fetch: previous operation not complete.');
    error.type = 'stream';
    return Promise.reject(error);
  }

  this.task_ = new shaka.util.Task();

  if (initSegment) {
    this.task_.append(function() {
      var p = this.append_(initSegment);
      return [p, this.abort_.bind(this)];
    }.bind(this));
  }

  // If the segments are all located at the same URL then only a single request
  // is required.
  var singleLocation = true;
  var references = segmentRange.references;

  if (references.length) {
    var firstUrl = references[0].url.toString();
    for (var i = 1; i < references.length; ++i) {
      if (references[i].url.toString() != firstUrl) {
        singleLocation = false;
        break;
      }
    }

    if (singleLocation) {
      this.appendFetchStages_(references, endEarlyOn);
    } else {
      for (var i = 0; i < references.length; ++i) {
        this.appendFetchStages_([references[i]], endEarlyOn);
      }
    }
  }

  return this.startTask_();
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
 * Resets the map of inserted segments without removing any media from the
 * underlying SourceBuffer.  This should be called when switching
 * representations.
 */
shaka.media.SourceBufferManager.prototype.reset = function() {
  this.inserted_ = {};
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
 * Adds stages to the task to fetch references, append them to the source
 * buffer, and update the virtual source buffer.
 *
 * All references must have the same URL.  Only one fetch will be made.
 *
 * @param {!Array.<!shaka.media.SegmentReference>} references
 * @param {!Array.<number>} endEarlyOn A list of statuses on which the task
 *     will be ended early without failure.
 * @private
 */
shaka.media.SourceBufferManager.prototype.appendFetchStages_ =
    function(references, endEarlyOn) {
  shaka.log.v1('appendFetchStages_');

  shaka.asserts.assert(this.task_);
  shaka.asserts.assert(references.every(function(item) {
    return item.url == references[0].url;
  }));

  this.task_.append(
      function() {
        var refDuration = references[0].endTime ?
            (references[0].endTime - references[0].startTime) : 1;
        var request = new shaka.util.RangeRequest(
            references[0].url.toString(),
            references[0].startByte,
            references[references.length - 1].endByte,
            3 /* maxAttempts */,
            refDuration * 1000 /* baseRetryDelayMs */);
        request.estimator = this.estimator_;

        var p = request.send().catch(function(error) {
          if (endEarlyOn.indexOf(error.status) != -1) {
            // End the task early, but do not fail the task.
            this.task_.end();
          } else {
            // Actual error.  Pass it along.
            return Promise.reject(error);
          }
        }.bind(this));

        return [p, request.abort.bind(request)];
      }.bind(this));
  this.task_.append(
      /** @param {!ArrayBuffer} data */
      function(data) {
        shaka.log.debug('Estimated bandwidth:',
            (this.estimator_.getBandwidth() / 1e6).toFixed(2), 'Mbps');
        var p = this.append_(data);
        return [p, this.abort_.bind(this)];
      }.bind(this));
  this.task_.append(
      function() {
        for (var i = 0; i < references.length; ++i) {
          this.inserted_[references[i].id] = true;
        }
      }.bind(this));
};


/**
 * Starts the task and returns a Promise which is resolved/rejected after the
 * task ends and is cleaned up.
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
 * @return {!Promise}
 * @private
 */
shaka.media.SourceBufferManager.prototype.clear_ = function() {
  shaka.asserts.assert(!this.operationPromise_);

  if (this.sourceBuffer_.buffered.length == 0) {
    shaka.log.v1('Nothing to clear.');
    shaka.asserts.assert(Object.keys(this.inserted_).length == 0);
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
  this.inserted_ = {};

  this.operationPromise_ = new shaka.util.PublicPromise();
  return this.operationPromise_;
};


/**
 * Abort the current operation on the source buffer.
 * @private
 */
shaka.media.SourceBufferManager.prototype.abort_ = function() {
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
  shaka.log.v1('onSourceBufferUpdateEnd_');

  shaka.asserts.assert(!this.sourceBuffer_.updating);
  shaka.asserts.assert(this.operationPromise_);

  this.operationPromise_.resolve();
  this.operationPromise_ = null;
};

