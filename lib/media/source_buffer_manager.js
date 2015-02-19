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
 * @param {shaka.util.IBandwidthEstimator} estimator A bandwidth estimator to
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

  /** @private {shaka.util.IBandwidthEstimator} */
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

  /** @private {shaka.media.SourceBufferManager.State_} */
  this.state_ = shaka.media.SourceBufferManager.State_.IDLE;

  /** @private {Promise} */
  this.promise_ = null;

  /** @private {Promise} */
  this.abortPromise_ = null;

  /**
   * The current SegmentReferences being fetched or appended.
   * @private {!Array.<!shaka.media.SegmentReference>}
   */
  this.references_ = [];

  /**
   * The current request while fetching.
   * @private {shaka.util.RangeRequest}
   */
  this.request_ = null;

  /**
   * The current segment data being fetched or appended.
   * @private {!Array.<!ArrayBuffer>}
   */
  this.segments_ = [];

  this.eventManager_.listen(
      this.sourceBuffer_,
      'updateend',
      this.onSourceBufferUpdateEnd_.bind(this));
};


/**
 * SBM states.
 * @enum
 * @private
 */
shaka.media.SourceBufferManager.State_ = {
  IDLE: 0,
  REQUESTING: 1,
  APPENDING: 2,
  CLEARING: 3,
  ABORTING: 4
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

  this.state_ = null;
  this.segments_ = null;
  this.request_ = null;
  this.references_ = null;
  this.abortPromise_ = null;
  this.promise_ = null;

  this.eventManager_.destroy();
  this.eventManager_ = null;

  this.inserted_ = null;

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
  return this.inserted_[reference.segmentNumber];
};


/**
 * Checks if the given timestamp is buffered according to the SourceBuffer.
 * @param {number} timestamp
 * @return {boolean} True if the timestamp is buffered.
 */
shaka.media.SourceBufferManager.prototype.isBuffered = function(timestamp) {
  var b = this.sourceBuffer_.buffered;
  for (var i = 0; i < b.length; ++i) {
    var start = b.start(i) - shaka.media.SourceBufferManager.FUDGE_FACTOR_;
    var end = b.end(i) + shaka.media.SourceBufferManager.FUDGE_FACTOR_;
    if (timestamp >= start && timestamp <= end) {
      return true;
    }
  }
  return false;
};


/**
 * Fetches the segments specified by the given SegmentRange and appends the
 * retrieved segment data to the underlying SourceBuffer. This cannot be called
 * if another operation is in progress.
 *
 * @param {!shaka.media.SegmentRange} segmentRange
 * @param {ArrayBuffer=} opt_initSegment Optional initialization segment that
 *     will be appended to the underlying SourceBuffer before the retrieved
 *     segment data.
 *
 * @return {!Promise}
 */
shaka.media.SourceBufferManager.prototype.fetch = function(
    segmentRange, opt_initSegment) {
  shaka.log.v1('fetch');

  // Alias.
  var SBM = shaka.media.SourceBufferManager;

  // Check state.
  shaka.asserts.assert(this.state_ == SBM.State_.IDLE);
  if (this.state_ != SBM.State_.IDLE) {
    var error = new Error('Cannot fetch: previous operation not complete.');
    error.type = 'stream';
    return Promise.reject(error);
  }

  shaka.asserts.assert(this.promise_ == null);
  shaka.asserts.assert(this.references_.length == 0);
  shaka.asserts.assert(this.request_ == null);
  shaka.asserts.assert(this.segments_.length == 0);

  this.state_ = SBM.State_.REQUESTING;
  this.promise_ = new shaka.util.PublicPromise();
  this.references_ = segmentRange.references;

  if (opt_initSegment) {
    this.segments_.push(opt_initSegment);
  }

  // If the segments are all located at the same URL then only a single request
  // is required.
  var singleLocation = true;

  var firstUrl = this.references_[0].url.toString();
  for (var i = 1; i < this.references_.length; ++i) {
    if (this.references_[i].url.toString() != firstUrl) {
      singleLocation = false;
      break;
    }
  }

  // Send the request. If this.abort() is called before |this.request_|'s
  // promise is resolved then |this.request_|'s promise will be rejected via a
  // call to this.request_.abort().
  var p = singleLocation ?
          this.fetchFromSingleUrl_() :
          this.fetchFromMultipleUrls_();

  p.then(shaka.util.TypedBind(this,
      function() {
        shaka.log.debug('Estimated bandwidth:',
            (this.estimator_.getBandwidth() / 1e6).toFixed(2), 'Mbps');

        this.sourceBuffer_.appendBuffer(this.segments_.shift());
        this.state_ = SBM.State_.APPENDING;
        this.request_ = null;
      })
  ).catch(shaka.util.TypedBind(this,
      /** @param {!Error} error */
      function(error) {
        if (error.type != 'aborted') {
          this.rejectPromise_(error);
        }
      })
  );

  return this.promise_;
};


/**
 * Returns a promise to fetch one or more segments from the same location. The
 * promise will resolve once the request completes. This synchronously sets
 * |request_| to the request in progress.
 *
 * @return {!Promise}
 * @private
 */
shaka.media.SourceBufferManager.prototype.fetchFromSingleUrl_ = function() {
  shaka.log.v1('fetchFromSingleUrl_');
  shaka.asserts.assert(this.references_.length > 0);
  shaka.asserts.assert(this.request_ == null);

  this.request_ = new shaka.util.RangeRequest(
      this.references_[0].url.toString(),
      this.references_[0].startByte,
      this.references_[this.references_.length - 1].endByte);

  this.request_.estimator = this.estimator_;

  return this.request_.send().then(this.appendSegment_.bind(this));
};


/**
 * Returns a promise to fetch multiple segments from different locations. The
 * promise will resolve once the last request completes. This synchronously
 * sets |request_| to the first request and then asynchronously sets |request_|
 * to the request in progress.
 *
 * @return {!Promise}
 * @private
 */
shaka.media.SourceBufferManager.prototype.fetchFromMultipleUrls_ = function() {
  shaka.log.v1('fetchFromMultipleUrls_');
  shaka.asserts.assert(this.references_.length > 0);
  shaka.asserts.assert(this.request_ == null);

  /**
   * Requests the segment specified by |reference|.
   * @param {!shaka.media.SegmentReference} reference
   * @this {shaka.media.SourceBufferManager}
   * @return {!Promise.<!ArrayBuffer>}
   */
  var requestSegment = function(reference) {
    this.request_ = new shaka.util.RangeRequest(
        reference.url.toString(),
        reference.startByte,
        reference.endByte);

    this.request_.estimator = this.estimator_;

    return this.request_.send();
  };

  // Request the first segment.
  var p = shaka.util.TypedBind(this, requestSegment)(this.references_[0]);

  // Request the subsequent segments.
  var appendSegment = this.appendSegment_.bind(this);
  for (var i = 1; i < this.references_.length; ++i) {
    var requestNextSegment = requestSegment.bind(this, this.references_[i]);
    p = p.then(appendSegment).then(requestNextSegment);
  }

  p = p.then(shaka.util.TypedBind(this, this.appendSegment_));

  return p;
};


/**
 * Appends |data| to |segments_|.
 *
 * @param {!ArrayBuffer} data
 * @return {!Promise}
 * @private
 */
shaka.media.SourceBufferManager.prototype.appendSegment_ = function(data) {
  this.segments_.push(data);
  return Promise.resolve();
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

  // Alias.
  var SBM = shaka.media.SourceBufferManager;

  // Check state.
  shaka.asserts.assert(this.state_ == SBM.State_.IDLE);
  if (this.state_ != SBM.State_.IDLE) {
    var error = new Error('Cannot clear: previous operation not complete.');
    error.type = 'stream';
    return Promise.reject(error);
  }

  shaka.asserts.assert(this.promise_ == null);
  shaka.asserts.assert(this.references_.length == 0);
  shaka.asserts.assert(this.request_ == null);
  shaka.asserts.assert(this.segments_.length == 0);

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

  this.state_ = SBM.State_.CLEARING;
  this.promise_ = new shaka.util.PublicPromise();

  return this.promise_;
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
 * Aborts the current operation if one exists. This should not be called
 * if the current operation is an abort operation. The returned promise
 * will never be rejected.
 *
 * @return {!Promise}
 */
shaka.media.SourceBufferManager.prototype.abort = function() {
  shaka.log.v1('abort');

  // Alias.
  var SBM = shaka.media.SourceBufferManager;

  shaka.asserts.assert(this.abortPromise_ == null);
  shaka.asserts.assert(this.state_ != SBM.State_.ABORTING);

  switch (this.state_) {
    case SBM.State_.IDLE:
      return Promise.resolve();
    case SBM.State_.REQUESTING:
      shaka.log.info('Aborting request...');
      shaka.asserts.assert(this.request_);
      this.state_ = SBM.State_.ABORTING;

      // We do not need to wait for |request_| to completely stop.  It is
      // enough to know that no SourceBuffer operations are in progress when
      // the abort promise is resolved.

      // Create a new promise where resolveAbortPromise_() will look for it.
      this.abortPromise_ = new shaka.util.PublicPromise();
      // Keep a local reference since resolveAbortPromise_() will nullify it.
      var p = this.abortPromise_;
      // Abort the request.
      this.request_.abort();
      // Reject the original promise and resolve the abort promise.
      this.resolveAbortPromise_();
      // Return the local reference to the abort promise.
      return p;
    case SBM.State_.APPENDING:
    case SBM.State_.CLEARING:
      shaka.log.info('Aborting append/clear...');
      this.state_ = SBM.State_.ABORTING;
      this.abortPromise_ = new shaka.util.PublicPromise();
      // If |mediaSource_| is open and aborting will not cause an exception,
      // call abort() on |sourceBuffer_|.  This will trigger an 'updateend'
      // event if updating (e.g., appending or removing).
      if (this.mediaSource_.readyState == 'open') {
        this.sourceBuffer_.abort();
      }
      shaka.asserts.assert(this.sourceBuffer_.updating == false);
      return this.abortPromise_;
    case SBM.State_.ABORTING:
      // This case should not happen, but handle it just in case it occurs in
      // production.
      shaka.log.error('Already aborting!');
      shaka.asserts.assert(this.abortPromise_);
      return /** @type {!Promise} */ (this.abortPromise_);
  }

  shaka.asserts.unreachable();
};


/**
 * |sourceBuffer_|'s 'updateend' callback.
 *
 * @param {!Event} event
 *
 * @private
 */
shaka.media.SourceBufferManager.prototype.onSourceBufferUpdateEnd_ =
    function(event) {
  shaka.log.v1('onSourceBufferUpdateEnd_');

  // Alias.
  var SBM = shaka.media.SourceBufferManager;

  shaka.asserts.assert(!this.sourceBuffer_.updating);
  shaka.asserts.assert(this.state_ == SBM.State_.APPENDING ||
                       this.state_ == SBM.State_.CLEARING ||
                       this.state_ == SBM.State_.ABORTING);
  shaka.asserts.assert(this.promise_);
  shaka.asserts.assert(!this.request_);

  switch (this.state_) {
    case SBM.State_.APPENDING:
      // A segment has been appended so update |inserted_|.
      shaka.asserts.assert(this.references_.length > 0);

      if (this.segments_.length > 0) {
        // Append the next segment.
        try {
          this.sourceBuffer_.appendBuffer(this.segments_.shift());
        } catch (exception) {
          shaka.log.debug('Failed to append buffer:', exception);
          this.rejectPromise_(exception);
        }
        return;
      }

      // Update |inserted_|. Note that if we abort an append then there may be
      // segments in the underlying SourceBuffer that are not indicated in
      // |inserted_|. However, this should not cause any harm.
      for (var i = 0; i < this.references_.length; ++i) {
        var r = this.references_[i];
        this.inserted_[r.segmentNumber] = true;
      }
      this.references_ = [];

      // Fall-through.
    case SBM.State_.CLEARING:
      this.state_ = SBM.State_.IDLE;
      this.promise_.resolve();
      this.promise_ = null;
      break;
    case SBM.State_.ABORTING:
      this.resolveAbortPromise_();
      break;
    default:
      shaka.asserts.unreachable();
  }
};


/**
 * Resolves |abortPromise_|, and then calls rejectPromise_().
 *
 * @private
 */
shaka.media.SourceBufferManager.prototype.resolveAbortPromise_ = function() {
  shaka.log.v1('resolveAbortPromise_');
  shaka.asserts.assert(this.abortPromise_);

  this.abortPromise_.resolve();
  this.abortPromise_ = null;

  var error = new Error('Current operation aborted.');
  error.type = 'aborted';

  this.rejectPromise_(error);
};


/**
 * Rejects |promise_| and puts the SBM into the IDLE state.
 *
 * @param {!Error} error
 *
 * @private
 */
shaka.media.SourceBufferManager.prototype.rejectPromise_ = function(error) {
  shaka.log.v1('rejectPromise_');
  shaka.asserts.assert(this.promise_);
  shaka.asserts.assert(this.abortPromise_ == null);

  this.promise_.reject(error);

  this.state_ = shaka.media.SourceBufferManager.State_.IDLE;
  this.promise_ = null;
  this.references_ = [];
  this.request_ = null;
  this.segments_ = [];
};

