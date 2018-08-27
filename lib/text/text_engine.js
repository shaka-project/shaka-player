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

goog.provide('shaka.text.TextEngine');

goog.require('goog.asserts');
goog.require('shaka.util.Error');
goog.require('shaka.util.IDestroyable');



/**
 * Manages text parsers and cues.
 *
 * @param {shakaExtern.TextDisplayer} displayer
 * @struct
 * @constructor
 * @implements {shaka.util.IDestroyable}
 */
shaka.text.TextEngine = function(displayer) {
  /** @private {shakaExtern.TextParser} */
  this.parser_ = null;

  /** @private {shakaExtern.TextDisplayer} */
  this.displayer_ = displayer;

  /** @private {number} */
  this.timestampOffset_ = 0;

  /** @private {number} */
  this.appendWindowStart_ = 0;

  /** @private {number} */
  this.appendWindowEnd_ = Infinity;

  /** @private {?number} */
  this.bufferStart_ = null;

  /** @private {?number} */
  this.bufferEnd_ = null;
};


/** @private {!Object.<string, !shakaExtern.TextParserPlugin>} */
shaka.text.TextEngine.parserMap_ = {};


/**
 * @param {string} mimeType
 * @param {!shakaExtern.TextParserPlugin} plugin
 * @export
 */
shaka.text.TextEngine.registerParser = function(mimeType, plugin) {
  shaka.text.TextEngine.parserMap_[mimeType] = plugin;
};


/**
 * @param {string} mimeType
 * @export
 */
shaka.text.TextEngine.unregisterParser = function(mimeType) {
  delete shaka.text.TextEngine.parserMap_[mimeType];
};


/**
 * @param {string} mimeType
 * @return {boolean}
 */
shaka.text.TextEngine.isTypeSupported = function(mimeType) {
  return !!shaka.text.TextEngine.parserMap_[mimeType];
};


/** @override */
shaka.text.TextEngine.prototype.destroy = function() {
  this.parser_ = null;
  this.displayer_ = null;

  return Promise.resolve();
};


/**
 * @param {shakaExtern.TextDisplayer} displayer
 * @export
 */
shaka.text.TextEngine.prototype.setDisplayer = function(displayer) {
  this.displayer_ = displayer;
};


/**
 * Initialize the parser.  This can be called multiple times, but must be called
 * at least once before appendBuffer.
 *
 * @param {string} mimeType
 */
shaka.text.TextEngine.prototype.initParser = function(mimeType) {
  let factory = shaka.text.TextEngine.parserMap_[mimeType];
  goog.asserts.assert(
      factory,
      'Text type negotiation should have happened already');
  this.parser_ = new factory();
};


/**
 * Parse the start time from the text media segment, if possible.
 *
 * @param {!ArrayBuffer} buffer
 * @return {number}
 * @throws {shaka.util.Error} on failure
 */
shaka.text.TextEngine.prototype.getStartTime = function(buffer) {
  goog.asserts.assert(this.parser_, 'The parser should already be initialized');

  /** @type {shakaExtern.TextParser.TimeContext} **/
  let time = {
    periodStart: 0,
    segmentStart: null,
    segmentEnd: 0
  };

  // Parse the buffer and extract the first cue start time.
  try {
    let allCues = this.parser_.parseMedia(new Uint8Array(buffer), time);
    return allCues[0].startTime;
  } catch (exception) {
    // This could be a failure from the parser itself (init segment required)
    // or an exception from allCues.length being zero.
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.UNABLE_TO_EXTRACT_CUE_START_TIME,
        exception);
  }
};


/**
 * @param {!ArrayBuffer} buffer
 * @param {?number} startTime relative to the start of the presentation
 * @param {?number} endTime relative to the start of the presentation
 * @return {!Promise}
 */
shaka.text.TextEngine.prototype.appendBuffer =
    function(buffer, startTime, endTime) {
  goog.asserts.assert(this.parser_, 'The parser should already be initialized');

  // Start the operation asynchronously to avoid blocking the caller.
  return Promise.resolve().then(function() {
    // Check that TextEngine hasn't been destroyed.
    if (!this.parser_ || !this.displayer_) return;

    if (startTime == null || endTime == null) {
      this.parser_.parseInit(new Uint8Array(buffer));
      return;
    }

    /** @type {shakaExtern.TextParser.TimeContext} **/
    let time = {
      periodStart: this.timestampOffset_,
      segmentStart: startTime,
      segmentEnd: endTime,
    };

    // Parse the buffer and add the new cues.
    let allCues = this.parser_.parseMedia(new Uint8Array(buffer), time);
    let cuesToAppend = allCues.filter(function(cue) {
      return cue.startTime >= this.appendWindowStart_ &&
             cue.startTime < this.appendWindowEnd_;
    }.bind(this));

    this.displayer_.append(cuesToAppend);

    // NOTE: We update the buffered range from the start and end times passed
    // down from the segment reference, not with the start and end times of the
    // parsed cues.  This is important because some segments may contain no
    // cues, but we must still consider those ranges buffered.
    if (this.bufferStart_ == null) {
      this.bufferStart_ = Math.max(startTime, this.appendWindowStart_);
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
 * @param {number} startTime relative to the start of the presentation
 * @param {number} endTime relative to the start of the presentation
 * @return {!Promise}
 */
shaka.text.TextEngine.prototype.remove = function(startTime, endTime) {
  // Start the operation asynchronously to avoid blocking the caller.
  return Promise.resolve().then(function() {
    if (this.displayer_ && this.displayer_.remove(startTime, endTime)) {
      if (this.bufferStart_ == null) {
        goog.asserts.assert(this.bufferEnd_ == null,
                            'end must be null if startTime is null');
      } else {
        goog.asserts.assert(this.bufferEnd_ != null,
                            'end must be non-null if startTime is non-null');

        // Update buffered range.
        if (endTime <= this.bufferStart_ || startTime >= this.bufferEnd_) {
          // No intersection.  Nothing was removed.
        } else if (startTime <= this.bufferStart_ &&
                   endTime >= this.bufferEnd_) {
          // We wiped out everything.
          this.bufferStart_ = this.bufferEnd_ = null;
        } else if (startTime <= this.bufferStart_ &&
                   endTime < this.bufferEnd_) {
          // We removed from the beginning of the range.
          this.bufferStart_ = endTime;
        } else if (startTime > this.bufferStart_ &&
                   endTime >= this.bufferEnd_) {
          // We removed from the end of the range.
          this.bufferEnd_ = startTime;
        } else {
          // We removed from the middle?  StreamingEngine isn't supposed to.
          goog.asserts.assert(
              false, 'removal from the middle is not supported by TextEngine');
        }
      }
    }
  }.bind(this));
};


/** @param {number} timestampOffset */
shaka.text.TextEngine.prototype.setTimestampOffset =
    function(timestampOffset) {
  this.timestampOffset_ = timestampOffset;
};


/**
 * @param {number} appendWindowStart
 * @param {number} appendWindowEnd
 */
shaka.text.TextEngine.prototype.setAppendWindow =
    function(appendWindowStart, appendWindowEnd) {
  this.appendWindowStart_ = appendWindowStart;
  this.appendWindowEnd_ = appendWindowEnd;
};


/**
 * @return {?number} Time in seconds of the beginning of the buffered range,
 *   or null if nothing is buffered.
 */
shaka.text.TextEngine.prototype.bufferStart = function() {
  return this.bufferStart_;
};


/**
 * @return {?number} Time in seconds of the end of the buffered range,
 *   or null if nothing is buffered.
 */
shaka.text.TextEngine.prototype.bufferEnd = function() {
  return this.bufferEnd_;
};


/**
 * @param {number} t A timestamp
 * @return {boolean}
 */
shaka.text.TextEngine.prototype.isBuffered = function(t) {
  return t >= this.bufferStart_ && t < this.bufferEnd_;
};


/**
 * @param {number} t A timestamp
 * @return {number} Number of seconds ahead of 't' we have buffered
 */
shaka.text.TextEngine.prototype.bufferedAheadOf = function(t) {
  if (this.bufferEnd_ == null || this.bufferEnd_ < t) return 0;

  goog.asserts.assert(
      this.bufferStart_ != null, 'start should not be null if end is not null');

  return this.bufferEnd_ - Math.max(t, this.bufferStart_);
};


/**
 * Append cues to text displayer.
 *
 * @param {!Array.<!shaka.text.Cue>} cues
 * @export
 */
shaka.text.TextEngine.prototype.appendCues = function(cues) {
  this.displayer_.append(cues);
};
