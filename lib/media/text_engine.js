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

goog.provide('shaka.media.TextEngine');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.util.IDestroyable');



/**
 * Manages text parsers and cues.
 *
 * @struct
 * @constructor
 * @param {TextTrack} track
 * @param {string} mimeType
 * @param {boolean} useRelativeCueTimestamps
 * @implements {shaka.util.IDestroyable}
 */
shaka.media.TextEngine = function(track, mimeType, useRelativeCueTimestamps) {
  /** @private {?shaka.media.TextEngine.TextParser} */
  this.parser_ = shaka.media.TextEngine.parserMap_[mimeType];

  // This should not happen if type negotiation is working as it should.
  goog.asserts.assert(this.parser_,
                      'Text type negotiation should have happened already');

  /** @private {TextTrack} */
  this.track_ = track;

  /** @private {number} */
  this.timestampOffset_ = 0;

  /** @private {number} */
  this.appendWindowEnd_ = Infinity;

  /** @private {?number} */
  this.bufferStart_ = null;

  /** @private {?number} */
  this.bufferEnd_ = null;

  /** @private {boolean} */
  this.useRelativeCueTimestamps_ = useRelativeCueTimestamps;
};


/**
 * Parses a text buffer into an array of cues.
 *
 * @typedef {
 *   function(ArrayBuffer, number, ?number,
 *            ?number, boolean):!Array.<!TextTrackCue>
 * }
 * @exportDoc
 */
shaka.media.TextEngine.TextParser;


/** @private {!Object.<string, !shaka.media.TextEngine.TextParser>} */
shaka.media.TextEngine.parserMap_ = {};


/**
 * @param {string} mimeType
 * @param {!shaka.media.TextEngine.TextParser} parser
 * @export
 */
shaka.media.TextEngine.registerParser = function(mimeType, parser) {
  shaka.media.TextEngine.parserMap_[mimeType] = parser;
};


/**
 * @param {string} mimeType
 * @export
 */
shaka.media.TextEngine.unregisterParser = function(mimeType) {
  delete shaka.media.TextEngine.parserMap_[mimeType];
};


/**
 * @param {string} mimeType
 * @return {boolean}
 */
shaka.media.TextEngine.isTypeSupported = function(mimeType) {
  return !!shaka.media.TextEngine.parserMap_[mimeType];
};


/**
 * Creates a cue using the best platform-specific interface available.
 *
 * @param {number} startTime
 * @param {number} endTime
 * @param {string} payload
 * @return {TextTrackCue} or null if the parameters were invalid.
 * @export
 */
shaka.media.TextEngine.makeCue = function(startTime, endTime, payload) {
  if (startTime >= endTime) {
    // IE/Edge will throw in this case.
    // See issue #501
    shaka.log.warning('Invalid cue times: ' + startTime + ' - ' + endTime);
    return null;
  }

  return new shaka.media.TextEngine.CueConstructor_(
      startTime, endTime, payload);
};


/** @private {function(new:TextTrackCue, number, number, string)} */
shaka.media.TextEngine.CueConstructor_ = window.VTTCue || window.TextTrackCue;


/** @override */
shaka.media.TextEngine.prototype.destroy = function() {
  if (this.track_) {
    this.removeWhere_(function(cue) { return true; });
  }

  this.parser_ = null;
  this.track_ = null;

  return Promise.resolve();
};


/**
 * @param {ArrayBuffer} buffer
 * @param {?number} startTime
 * @param {?number} endTime
 * @return {!Promise}
 */
shaka.media.TextEngine.prototype.appendBuffer =
    function(buffer, startTime, endTime) {
  var offset = this.timestampOffset_;

  // Start the operation asynchronously to avoid blocking the caller.
  return Promise.resolve().then(function() {
    // Check that TextEngine hasn't been destroyed.
    if (!this.track_) return;

    // Parse the buffer and add the new cues.
    var cues = this.parser_(buffer,
                            offset,
                            startTime,
                            endTime,
                            this.useRelativeCueTimestamps_);

    if (startTime == null || endTime == null) {
      // Init segments will not have start/end times passed
      return;
    }

    for (var i = 0; i < cues.length; ++i) {
      if (cues[i].startTime >= this.appendWindowEnd_) break;
      this.track_.addCue(cues[i]);
    }

    // NOTE: We update the buffered range from the start and end times passed
    // down from the segment reference, not with the start and end times of the
    // parsed cues.  This is important because some segments may contain no
    // cues, but we must still consider those ranges buffered.
    if (this.bufferStart_ == null) {
      this.bufferStart_ = startTime;
    } else {
      // We already had something in buffer, and we assume we are extending the
      // range from the end.
      goog.asserts.assert((startTime - this.bufferEnd_) <= 1,
                          'There should not be a gap in text references >1s');
    }
    this.bufferEnd_ = Math.min(endTime, this.appendWindowEnd_);
  }.bind(this));
};


/**
 * @param {number} start
 * @param {number} end
 * @return {!Promise}
 */
shaka.media.TextEngine.prototype.remove = function(start, end) {
  // Start the operation asynchronously to avoid blocking the caller.
  return Promise.resolve().then(function() {
    // Check that TextEngine hasn't been destroyed.
    if (!this.track_) return;

    this.removeWhere_(function(cue) {
      if (cue.startTime >= end || cue.endTime <= start) {
        // Outside the remove range.  Hang on to it.
        return false;
      }
      return true;
    });

    if (this.bufferStart_ == null) {
      goog.asserts.assert(this.bufferEnd_ == null,
                          'end must be null if start is null');
    } else {
      goog.asserts.assert(this.bufferEnd_ != null,
                          'end must be non-null if start is non-null');

      // Update buffered range.
      if (end <= this.bufferStart_ || start >= this.bufferEnd_) {
        // No intersection.  Nothing was removed.
      } else if (start <= this.bufferStart_ && end >= this.bufferEnd_) {
        // We wiped out everything.
        goog.asserts.assert(
            this.track_.cues.length == 0, 'should be no cues left');
        this.bufferStart_ = this.bufferEnd_ = null;
      } else if (start <= this.bufferStart_ && end < this.bufferEnd_) {
        // We removed from the beginning of the range.
        this.bufferStart_ = end;
      } else if (start > this.bufferStart_ && end >= this.bufferEnd_) {
        // We removed from the end of the range.
        this.bufferEnd_ = start;
      } else {
        // We removed from the middle?  StreamingEngine isn't supposed to.
        goog.asserts.assert(
            false, 'removal from the middle is not supported by TextEngine');
      }
    }
  }.bind(this));
};


/** @param {number} timestampOffset */
shaka.media.TextEngine.prototype.setTimestampOffset =
    function(timestampOffset) {
  this.timestampOffset_ = timestampOffset;
};


/** @param {number} windowEnd */
shaka.media.TextEngine.prototype.setAppendWindowEnd =
    function(windowEnd) {
  this.appendWindowEnd_ = windowEnd;
};


/**
 * @return {?number} Time in seconds of the beginning of the buffered range,
 *   or null if nothing is buffered.
 */
shaka.media.TextEngine.prototype.bufferStart = function() {
  return this.bufferStart_;
};


/**
 * @return {?number} Time in seconds of the end of the buffered range,
 *   or null if nothing is buffered.
 */
shaka.media.TextEngine.prototype.bufferEnd = function() {
  return this.bufferEnd_;
};


/**
 * @param {number} t A timestamp
 * @return {number} Number of seconds ahead of 't' we have buffered
 */
shaka.media.TextEngine.prototype.bufferedAheadOf = function(t) {
  if (this.bufferEnd_ == null || this.bufferEnd_ < t) return 0;

  goog.asserts.assert(
      this.bufferStart_ != null, 'start should not be null if end is not null');

  if (t < this.bufferStart_) return 0;

  return this.bufferEnd_ - t;
};


/**
 * Remove all cues for which the matching function returns true.
 *
 * @param {function(!TextTrackCue):boolean} predicate
 * @private
 */
shaka.media.TextEngine.prototype.removeWhere_ = function(predicate) {
  var cues = this.track_.cues;
  var removeMe = [];

  // Remove these in another loop to avoid mutating the TextTrackCueList
  // while iterating over it.  This allows us to avoid making assumptions
  // about whether or not this.track_.remove() will alter that list.
  for (var i = 0; i < cues.length; ++i) {
    if (predicate(cues[i])) {
      removeMe.push(cues[i]);
    }
  }

  for (var i = 0; i < removeMe.length; ++i) {
    this.track_.removeCue(removeMe[i]);
  }
};
