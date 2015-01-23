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
 * @fileoverview Implements a SegmentRange, which represents a set of one or
 * more contiguous segments.
 */

goog.provide('shaka.media.SegmentRange');

goog.require('shaka.asserts');
goog.require('shaka.media.SegmentReference');



/**
 * Creates a SegmentRange, which represents a set of one or more contiguous
 * segments.
 *
 * @param {!Array.<!shaka.media.SegmentReference>} references A set of
 *     references to contiguous segments. There must be at least one reference.
 *
 * @constructor
 * @struct
 */
shaka.media.SegmentRange = function(references) {
  shaka.asserts.assert(references.length > 0);

  /** @type {!Array.<!shaka.media.SegmentReference>} */
  this.references = references;
};

