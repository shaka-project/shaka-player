/**
 * @license
 * Copyright 2016 Google Inc.
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

goog.provide('shaka.test.FakeMediaSourceEngine');



/**
 * Creates a FakeMediaSourceEngine.
 *
 * The FakeMediaSourceEngine simulates multiple SourceBuffers. However, it only
 * allows segments to be appended if they are aligned (i.e., it goes not permit
 * gaps or overlaps are within the buffers).
 *
 * @param {!Object.<string, shaka.test.FakeMediaSourceEngine.SegmentData>}
 *   segmentData
 * @param {number=} opt_drift Optional drift. Defaults to 0.
 *
 * @constructor
 * @struct
 * @extends {shaka.media.MediaSourceEngine}
 */
shaka.test.FakeMediaSourceEngine = function(segmentData, opt_drift) {
  /** @type {!Object.<string, shaka.test.FakeMediaSourceEngine.SegmentData>} */
  this.segmentData = segmentData;

  /** @type {!Object.<string, !Array.<boolean>>} */
  this.initSegments = {};

  /** @type {!Object.<string, !Array.<boolean>>} */
  this.segments = {};

  /** @private {number} */
  this.drift_ = opt_drift || 0;

  /** @private {!Object.<string, number>} */
  this.timestampOffsets_ = {};

  /** @private {number} */
  this.duration_ = Infinity;

  for (var type in segmentData) {
    var data = segmentData[type];

    this.initSegments[type] = [];
    for (var i = 0; i < data.initSegments.length; ++i) {
      this.initSegments[type].push(false);
    }

    this.segments[type] = [];
    for (var i = 0; i < data.segments.length; ++i) {
      this.segments[type].push(false);
    }

    this.timestampOffsets_[type] = 0;
  }

  spyOn(this, 'destroy').and.callThrough();
  spyOn(this, 'init').and.callThrough();
  spyOn(this, 'bufferStart').and.callThrough();
  spyOn(this, 'bufferEnd').and.callThrough();
  spyOn(this, 'bufferedAheadOf').and.callThrough();
  spyOn(this, 'appendBuffer').and.callThrough();
  spyOn(this, 'remove').and.callThrough();
  spyOn(this, 'clear').and.callThrough();
  spyOn(this, 'endOfStream').and.callThrough();
  spyOn(this, 'setTimestampOffset').and.callThrough();
  spyOn(this, 'setAppendWindowEnd').and.callThrough();
  spyOn(this, 'setDuration').and.callThrough();
  spyOn(this, 'getDuration').and.callThrough();
};


/**
 * @typedef {{
 *   initSegments: !Array.<!BufferSource>,
 *   segments: !Array.<!BufferSource>,
 *   segmentStartTimes: !Array.<number>,
 *   segmentPeriodTimes: !Array.<number>,
 *   segmentDuration: number
 * }}
 *
 * @property {!Array.<!BufferSource>} initSegments
 *   The stream's initialization segments (for all periods).
 * @property {!Array.<!BufferSource>} segments
 *   The stream's media segments (for all periods).
 * @property {!Array.<number>} segmentStartTimes
 *   The start time of each media segment as they would appear within a
 *   segment index. These values plus drift simulate the segments'
 *   baseMediaDecodeTime (or equivalent) values.
 * @property {!Array.<number>} segmentPeriodTimes
 *   The start time of the period of the associated segment.  These are the same
 *   segments as in |segmentStartTimes|.
 * @property {number} segmentDuration
 *   The duration of each media segment.
 */
shaka.test.FakeMediaSourceEngine.SegmentData;


/** @override */
shaka.test.FakeMediaSourceEngine.prototype.destroy = function() {
  return Promise.resolve();
};


/** @override */
shaka.test.FakeMediaSourceEngine.prototype.init = function() {};


/** @override */
shaka.test.FakeMediaSourceEngine.prototype.bufferStart = function(type) {
  if (this.segments[type] === undefined) throw new Error('unexpected type');

  var first = this.segments[type].indexOf(true);
  if (first < 0)
    return null;

  return this.toTime_(type, first);
};


/** @override */
shaka.test.FakeMediaSourceEngine.prototype.bufferEnd = function(type) {
  if (this.segments[type] === undefined) throw new Error('unexpected type');

  var last = this.segments[type].lastIndexOf(true);
  if (last < 0)
    return null;

  return this.toTime_(type, last + 1);
};


/** @override */
shaka.test.FakeMediaSourceEngine.prototype.bufferedAheadOf = function(
    type, start, opt_tolerance) {
  if (this.segments[type] === undefined) throw new Error('unexpected type');

  var tolerance = 0;
  // Note: |start| may equal the end of the last segment, so |first|
  // may equal segments[type].length
  var first = this.toIndex_(type, start);
  if (!this.segments[type][first] && opt_tolerance) {
    first = this.toIndex_(type, start + opt_tolerance);
    tolerance = opt_tolerance;
  }
  if (!this.segments[type][first])
    return 0;  // Unbuffered.

  // Find the first gap.
  var last = this.segments[type].indexOf(false, first);
  if (last < 0)
    last = this.segments[type].length;  // Buffered everything.

  return this.toTime_(type, last) - start + tolerance;
};


/** @override */
shaka.test.FakeMediaSourceEngine.prototype.appendBuffer = function(
    type, data, startTime, endTime) {
  if (this.segments[type] === undefined) throw new Error('unexpected type');

  // Set init segment.
  var i = this.segmentData[type].initSegments.indexOf(data);
  if (i >= 0) {
    expect(startTime).toBe(null);
    expect(endTime).toBe(null);
    for (var j = 0; j < this.segmentData[type].initSegments.length; ++j) {
      this.initSegments[type][j] = false;
    }
    this.initSegments[type][i] = true;
    return Promise.resolve();
  }

  // Set media segment.
  i = this.segmentData[type].segments.indexOf(data);
  if (i < 0)
    throw new Error('unexpected data');

  expect(startTime).toBe(
      this.segmentData[type].segmentStartTimes[i] +
      this.segmentData[type].segmentPeriodTimes[i]);
  expect(endTime).toBe(startTime + this.segmentData[type].segmentDuration);

  // Verify that the segment is aligned.
  var start = this.segmentData[type].segmentStartTimes[i] +
              this.timestampOffsets_[type];
  var expectedStart = i * this.segmentData[type].segmentDuration;
  expect(start).toBe(expectedStart);

  this.segments[type][i] = true;
  return Promise.resolve();
};


/** @override */
shaka.test.FakeMediaSourceEngine.prototype.remove = function(type, start, end) {
  if (this.segments[type] === undefined) throw new Error('unexpected type');

  var first = this.toIndex_(type, start);
  if (first < 0 || first >= this.segments[type].length)
    throw new Error('unexpected start');

  // Note: |end| is exclusive.
  var last = this.toIndex_(type, end - 0.000001);
  if (last < 0)
    throw new Error('unexpected end');

  if (first > last)
    throw new Error('unexpected start and end');

  for (var i = first; i <= last; ++i) {
    this.segments[type][i] = false;
  }

  return Promise.resolve();
};


/** @override */
shaka.test.FakeMediaSourceEngine.prototype.clear = function(type) {
  if (this.segments[type] === undefined) throw new Error('unexpected type');

  for (var i = 0; i < this.segments[type].length; ++i) {
    this.segments[type][i] = false;
  }

  return Promise.resolve();
};


/** @override */
shaka.test.FakeMediaSourceEngine.prototype.setTimestampOffset = function(
    type, offset) {
  if (this.segments[type] === undefined) throw new Error('unexpected type');
  this.timestampOffsets_[type] = offset;
  return Promise.resolve();
};


/** @override */
shaka.test.FakeMediaSourceEngine.prototype.setAppendWindowEnd = function(
    type, appendWindowEnd) {
  return Promise.resolve();
};


/**
 * @param {string=} opt_reason
 * @return {!Promise}
 * @override
 * TODO: explicit "param" and "return" are needed with current Closure
 * compiler, remove them once the Closure compiler is upgraded.
 */
shaka.test.FakeMediaSourceEngine.prototype.endOfStream = function(opt_reason) {
  return Promise.resolve();
};


/** @override */
shaka.test.FakeMediaSourceEngine.prototype.setDuration = function(duration) {
  this.duration_ = duration;
  return Promise.resolve();
};


/** @override */
shaka.test.FakeMediaSourceEngine.prototype.getDuration = function() {
  return this.duration_;
};


/**
 * @param {string} type
 * @param {number} ts
 * @return {number} The index of the segment which contains the given timestamp.
 * @private
 */
shaka.test.FakeMediaSourceEngine.prototype.toIndex_ = function(type, ts) {
  return Math.floor((ts - this.drift_) /
                    this.segmentData[type].segmentDuration);
};


/**
 * @param {string} type
 * @param {number} i
 * @return {number} The start time of the i'th segment.
 * @private
 */
shaka.test.FakeMediaSourceEngine.prototype.toTime_ = function(type, i) {
  return this.drift_ + (i * this.segmentData[type].segmentDuration);
};

