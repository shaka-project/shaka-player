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
 * @fileoverview Defines the ISegmentIndexSource interface.
 */

goog.provide('shaka.media.ISegmentIndexSource');

goog.require('shaka.media.SegmentIndex');



/**
 * A SegmentIndexSource creates a SegmentIndex from a source of metadata, e.g.,
 * a container or a manifest.
 *
 * Constructing a SegmentIndex may require a fetch or may require some
 * non-trivial computation, so constructing several SegmentIndexes before
 * starting playback may not be desirable. A SegmentIndexSource allows
 * lazy-loading a SegmentIndex.
 *
 * A SegmentIndexSource also separates how a SegmentIndex is constructed from
 * how it behaves, which enables combining SegmentIndexSources and
 * SegmentIndexes in various ways.
 *
 * @interface
 */
shaka.media.ISegmentIndexSource = function() {};


/**
 * Destroys this SegmentIndexSource.
 */
shaka.media.ISegmentIndexSource.prototype.destroy = function() {};


/**
 * Creates the SegmentIndex.
 * The SegmentIndexSource retains ownership of the SegmentIndex.
 *
 * @return {!Promise.<!shaka.media.SegmentIndex>}
 */
shaka.media.ISegmentIndexSource.prototype.create = function() {};

