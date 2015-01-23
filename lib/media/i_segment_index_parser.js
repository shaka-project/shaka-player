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
 * @fileoverview An interface for a generic segment index parser.
 */

goog.provide('shaka.media.ISegmentIndexParser');

goog.require('shaka.media.SegmentReference');



/**
 * An interface for a generic segment index parser.
 *
 * @interface
 */
shaka.media.ISegmentIndexParser = function() {};


/**
 * Parses a segment index into segment references.
 *
 * @param {DataView} initSegmentData The initialization segment, or null if not
 *     available.  Some parsers may require this.
 * @param {!DataView} indexData The segment index bytes.
 * @param {number} indexOffset The byte offset of the segmentIndex in the
 *     container.
 * @return {Array.<!shaka.media.SegmentReference>} The segment references, or
 *     null if an error occurred
 */
shaka.media.ISegmentIndexParser.prototype.parse =
    function(initSegmentData, indexData, indexOffset) {};

