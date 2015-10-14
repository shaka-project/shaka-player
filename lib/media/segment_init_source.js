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

goog.provide('shaka.media.SegmentInitSource');

goog.require('shaka.asserts');
goog.require('shaka.util.FailoverUri');



/**
 * Creates a SegmentInitSource.
 *
 * @param {shaka.util.FailoverUri} metadata
 * @param {ArrayBuffer=} opt_data
 * @constructor
 * @struct
 */
shaka.media.SegmentInitSource = function(metadata, opt_data) {
  shaka.asserts.assert(!metadata || !opt_data);

  /** @private {shaka.util.FailoverUri} */
  this.metadata_ = metadata;

  /** @private {ArrayBuffer} */
  this.data_ = opt_data || null;
};


/**
 * Destroys this SegmentInitSource.
 */
shaka.media.SegmentInitSource.prototype.destroy = function() {
  if (this.metadata_) {
    this.metadata_.abortFetch();
    this.metadata_ = null;
  }
  this.data_ = null;
};


/**
 * Creates the initialization data.
 *
 * @return {!Promise.<ArrayBuffer>}
 */
shaka.media.SegmentInitSource.prototype.create = function() {
  return this.metadata_ ?
      /** @type {!Promise.<ArrayBuffer>} */ (this.metadata_.fetch()) :
      Promise.resolve(this.data_);
};

