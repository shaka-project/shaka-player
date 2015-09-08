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

goog.provide('shaka.media.SourceBufferManager');

goog.require('shaka.asserts');
goog.require('shaka.player.Defaults');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.IBandwidthEstimator');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.Task');
goog.require('shaka.util.TypedBind');



/**
 * Creates a SourceBufferManager (SBM), which manages a SourceBuffer and
 * provides an enhanced interface based on Promises.
 *
 * The SBM manages access to a SourceBuffer object through a fetch operation
 * and a clear operation. It also maintains a "virtual source buffer" to keep
 * track of which segments have been appended to the actual underlying
 * SourceBuffer. The SBM uses this virtual source buffer because it cannot rely
 * on the browser to tell it what is in the underlying SourceBuffer because a
 * SegmentIndex may use PTS (presentation timestamps) and a browser may use
 * DTS (decoding timestamps) or vice-versa.
 *
 * @param {!MediaSource} mediaSource The MediaSource, which must be in the
 *     'open' state.
 * @param {string} fullMimeType The SourceBuffer's full MIME type.
 * @param {!shaka.util.IBandwidthEstimator} estimator A bandwidth estimator to
 *     attach to all requests.
 *
 * @throws {QuotaExceededError} if no more SourceBuffers are allowed.
 *
 * @struct
 * @constructor
 */
shaka.media.SourceBufferManager = function(
    mediaSource, fullMimeType, estimator) {
  shaka.asserts.assert(mediaSource.readyState == 'open',
                       'The MediaSource should be in the \'open\' state.');
  shaka.asserts.assert(fullMimeType.length > 0);
  shaka.asserts.assert(MediaSource.isTypeSupported(fullMimeType));

  var sourceBuffer = mediaSource.addSourceBuffer(fullMimeType);
  shaka.asserts.assert(sourceBuffer, 'SourceBuffer should not be null.');

  /** @private {!MediaSource} */
  this.mediaSource_ = mediaSource;

  /** @private {!SourceBuffer} */
  this.sourceBuffer_ = /** @type {!SourceBuffer} */(sourceBuffer);

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

  /** @private {number} */
  this.segmentRequestTimeout_ = shaka.player.Defaults.SEGMENT_REQUEST_TIMEOUT;

  // For debugging purposes:
  if (!COMPILED) {
    /** @private {string} */
    this.mimeType_ = fullMimeType.split(';')[0];
    shaka.asserts.assert(this.mimeType_.length > 0);
  }

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
  this.abort().catch(function() {});

  if (this.operationPromise_) {
    this.operationPromise_.destroy();
  }
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
 * @param {number} timestampOffset An offset, in seconds, that will be applied
 *     to each timestamp within the segment before appending it to the
 *     underlying SourceBuffer.
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
    reference, timestampOffset, initData) {
  shaka.log.v1(this.logPrefix_(), 'fetch');

  // Check state.
  shaka.asserts.assert(!this.task_);
  if (this.task_) {
    var error = new Error('Cannot fetch (' + this.mimeType_ + '): ' +
                          'previous operation not complete.');
    error.type = 'stream';
    return Promise.reject(error);
  }

  this.task_ = new shaka.util.Task();

  if (timestampOffset != this.sourceBuffer_.timestampOffset) {
    shaka.log.debug(
        this.logPrefix_(), 'setting timestampOffset to', timestampOffset);
    this.sourceBuffer_.timestampOffset = timestampOffset;
  }

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
        var params = new shaka.util.AjaxRequest.Parameters();
        params.maxAttempts = 3;
        params.baseRetryDelayMs = refDuration * 1000;
        params.requestTimeoutMs = this.segmentRequestTimeout_ * 1000;
        return [
          reference.url.fetch(params, this.estimator_),
          shaka.util.FailoverUri.prototype.abortFetch.bind(reference.url)];
      }.bind(this));

  // Sanity check: appendBuffer() should not modify the MediaSource's duration
  // because an appropriate append window should have been set.
  //
  // On some browsers, even with an append window, inserting a segment that
  // ends past the end of the append window can increase the MediaSource's
  // duration (slightly). However, when this occurs it appears that no content
  // is actually buffered past the end of the append window, and subsequently
  // calling endOfStream() resets the MediaSource's duration to the correct
  // value (i.e., the end of the append window).
  //
  // TODO: Determine if this is a browser bug or is actually compliant with the
  // MSE spec.
  if (!COMPILED) {
    var durationBefore;
  }

  this.task_.append(shaka.util.TypedBind(this,
      /** @param {!ArrayBuffer} data */
      function(data) {
        if (!COMPILED) {
          durationBefore = this.mediaSource_.duration;
        }

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
        if (!COMPILED) {
          var durationAfter = this.mediaSource_.duration;
          if (durationAfter != durationBefore) {
            shaka.log.warning(
                this.logPrefix_(),
                'appendBuffer() should not modify the MediaSource\'s duration:',
                'before', durationBefore,
                'after', durationAfter,
                'delta', durationAfter - durationBefore);
          }
        }

        if (this.sourceBuffer_.buffered.length == 0) {
          var error = new Error(
              'Failed to buffer segment (' + this.mimeType_ + ').');
          error.type = 'stream';
          return [Promise.reject(error)];
        }

        if (computeTimestampCorrection) {
          shaka.asserts.assert(this.inserted_.length == 0);
          var expectedTimestamp = reference.startTime;
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
  shaka.log.v1(this.logPrefix_(), 'clear');

  // Check state.
  shaka.asserts.assert(!this.task_);
  if (this.task_) {
    var error = new Error('Cannot clear (' + this.mimeType_ + '): ' +
                          'previous operation not complete.');
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
 * Resets the virtual source buffer and clears all media from the underlying
 * SourceBuffer after the given timestamp. The returned promise will resolve
 * immediately if there is no media within the underlying SourceBuffer. This
 * cannot be called if another operation is in progress.
 *
 * @param {number} timestamp
 *
 * @return {!Promise}
 */
shaka.media.SourceBufferManager.prototype.clearAfter = function(timestamp) {
  shaka.log.v1(this.logPrefix_(), 'clearAfter');

  // Check state.
  shaka.asserts.assert(!this.task_);
  if (this.task_) {
    var error = new Error('Cannot clearAfter (' + this.mimeType_ + '): ' +
                          'previous operation not complete.');
    error.type = 'stream';
    return Promise.reject(error);
  }

  this.task_ = new shaka.util.Task();

  this.task_.append(function() {
    var p = this.clearAfter_(timestamp);
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
  shaka.log.v1(this.logPrefix_(), 'abort');
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
      this.logPrefix_(),
      'applied timestamp correction of',
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
        this.logPrefix_(),
        'multiple buffered ranges detected:',
        'Either the content has gaps in it,',
        'the content\'s segments are not aligned across bitrates,',
        'or the browser has evicted the middle of the buffer.');
    return true;
  } else {
    return false;
  }
};


/**
 * Sets the segment request timeout in seconds.
 *
 * @param {number} timeout
 */
shaka.media.SourceBufferManager.prototype.setSegmentRequestTimeout =
    function(timeout) {
  shaka.asserts.assert(!isNaN(timeout));
  this.segmentRequestTimeout_ = timeout;
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
  return this.task_.getPromise().then(shaka.util.TypedBind(this,
      function() {
        this.task_ = null;
      })
  ).catch(shaka.util.TypedBind(this,
      /** @param {*} error */
      function(error) {
        shaka.log.v1(this.logPrefix_(), 'task failed!');
        this.task_ = null;
        return Promise.reject(error);
      })
  );
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
    shaka.log.v1(this.logPrefix_(), 'nothing to clear.');
    shaka.asserts.assert(this.inserted_.length == 0);
    return Promise.resolve();
  }

  try {
    // This will trigger an 'updateend' event.
    this.sourceBuffer_.remove(0, Number.POSITIVE_INFINITY);
  } catch (exception) {
    return Promise.reject(exception);
  }

  // Clear |inserted_| immediately since any inserted segments will be
  // gone soon.
  this.inserted_ = [];

  this.operationPromise_ = new shaka.util.PublicPromise();
  return this.operationPromise_;
};


/**
 * Clear the source buffer after the given timestamp (aligned to the next
 * segment boundary).
 *
 * @param {number} timestamp
 *
 * @return {!Promise}
 * @private
 */
shaka.media.SourceBufferManager.prototype.clearAfter_ = function(timestamp) {
  shaka.asserts.assert(!this.operationPromise_);

  if (this.sourceBuffer_.buffered.length == 0) {
    shaka.log.v1(this.logPrefix_(), 'nothing to clear.');
    shaka.asserts.assert(this.inserted_.length == 0);
    return Promise.resolve();
  }

  var index = shaka.media.SegmentReference.find(this.inserted_, timestamp);

  // If no segment found, or it's the last one, bail out gracefully.
  if (index == -1 || index == this.inserted_.length - 1) {
    shaka.log.v1(
        this.logPrefix_(),
        'nothing to clear: no segments on or after timestamp.');
    return Promise.resolve();
  }

  try {
    // This will trigger an 'updateend' event.
    this.sourceBuffer_.remove(
        this.inserted_[index + 1].startTime,
        Number.POSITIVE_INFINITY);
  } catch (exception) {
    return Promise.reject(exception);
  }

  this.inserted_ = this.inserted_.slice(0, index + 1);

  this.operationPromise_ = new shaka.util.PublicPromise();
  return this.operationPromise_;
};


/**
 * Abort the current operation on the source buffer.
 *
 * @private
 */
shaka.media.SourceBufferManager.prototype.abort_ = function() {
  shaka.log.v1(this.logPrefix_(), 'abort_');
  shaka.asserts.assert(this.operationPromise_);

  // See {@link http://www.w3.org/TR/media-source/#widl-SourceBuffer-abort-void}
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
  shaka.log.v1(this.logPrefix_(), 'onSourceBufferUpdateEnd_');

  shaka.asserts.assert(!this.sourceBuffer_.updating);
  shaka.asserts.assert(this.operationPromise_);

  this.operationPromise_.resolve();
  this.operationPromise_ = null;
};


if (!COMPILED) {
  /**
   * Returns a string with the form 'SBM MIME_TYPE:' for logging purposes.
   *
   * @return {string}
   * @private
   */
  shaka.media.SourceBufferManager.prototype.logPrefix_ = function() {
    return 'SBM ' + this.mimeType_ + ':';
  };
}

