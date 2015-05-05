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
 * @fileoverview Implements SegmentInitSource.
 */

goog.provide('shaka.media.SegmentInitSource');

goog.require('goog.Uri');
goog.require('shaka.asserts');
goog.require('shaka.media.SegmentMetadata');



/**
 * Creates a SegmentInitSource.
 *
 * @param {shaka.media.SegmentMetadata} metadata
 * @constructor
 * @struct
 */
shaka.media.SegmentInitSource = function(metadata) {
  /** @private {shaka.media.SegmentMetadata} */
  this.metadata_ = metadata;
};


/**
 * Destroys this SegmentInitSource.
 */
shaka.media.SegmentInitSource.prototype.destroy = function() {
  if (this.metadata_) {
    this.metadata_.abortFetch();
    this.metadata_ = null;
  }
};


/**
 * Creates the initialization data.
 *
 * @return {!Promise.<!ArrayBuffer>|!Promise.<null>}
 */
shaka.media.SegmentInitSource.prototype.create = function() {
  return this.metadata_ ? this.metadata_.fetch() : Promise.resolve(null);
};

