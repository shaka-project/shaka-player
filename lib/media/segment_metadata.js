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
 * @fileoverview Implements SegmentMetadata.
 */

goog.provide('shaka.media.SegmentMetadata');

goog.require('goog.Uri');
goog.require('shaka.util.RangeRequest');
goog.require('shaka.util.Task');
goog.require('shaka.util.TypedBind');



/**
 * Creates a SegmentMetadata.
 *
 * A SegmentMetadata lazy-loads segment metadata.
 *
 * @param {!goog.Uri} url
 * @param {number} startByte
 * @param {?number} endByte
 * @constructor
 * @struct
 */
shaka.media.SegmentMetadata = function(url, startByte, endByte) {
  /** @const {!goog.Uri} */
  this.url = url;

  /** @const {number} */
  this.startByte = startByte;

  /** @const {?number} */
  this.endByte = endByte;

  /** @private {shaka.util.RangeRequest} */
  this.request_ = null;

  /** @private {Promise.<!ArrayBuffer>} */
  this.requestPromise_ = null;

  /** @private {ArrayBuffer} */
  this.data_ = null;
};


/**
 * Fetches the segment metadata. The result is memoized so calling this
 * function twice does not result in another request.
 *
 * @return {!Promise.<!ArrayBuffer>}
 */
shaka.media.SegmentMetadata.prototype.fetch = function() {
  if (this.requestPromise_) {
    // A fetch has already completed or is in progress.
    return this.requestPromise_;
  }

  shaka.asserts.assert(!this.request_);
  this.request_ = new shaka.util.RangeRequest(
      this.url.toString(), this.startByte, this.endByte);

  var p = this.request_.send().then(shaka.util.TypedBind(this,
      /** @param {!ArrayBuffer} data */
      function(data) {
        this.request_ = null;
        return Promise.resolve(data);
      }));

  p = p.catch(shaka.util.TypedBind(this,
      /** @param {!Error} error */
      function(error) {
        this.request_ = null;
        this.requestPromise_ = null;
        return Promise.reject(error);
      }));

  this.requestPromise_ = p;
  return this.requestPromise_;
};


/**
 * Aborts fetch() if it is pending.
 */
shaka.media.SegmentMetadata.prototype.abortFetch = function() {
  if (this.request_) {
    this.request_.abort();
    this.request_ = null;
    this.requestPromise_ = null;
  }
};

