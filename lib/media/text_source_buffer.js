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

goog.provide('shaka.media.TextSourceBuffer');

goog.require('shaka.asserts');
goog.require('shaka.log');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.PublicPromise');



/**
 * A SourceBuffer work-alike for text types.
 *
 * @struct
 * @constructor
 * @param {TextTrack} track
 * @param {string} mimeType
 * @extends {shaka.util.FakeEventTarget}
 * @see http://w3c.github.io/media-source/#sourcebuffer
 */
shaka.media.TextSourceBuffer = function(track, mimeType) {
  shaka.util.FakeEventTarget.call(this, null);

  /** @private {shaka.media.TextSourceBuffer.TextParser} */
  this.parser_ = shaka.media.TextSourceBuffer.parserMap_[mimeType];

  // A more accurate work-alike would throw NotSupportedError here, but this
  // should not happen if type-negotiation is working as it should.
  shaka.asserts.assert(this.parser_,
                       'Text type negotiation should have happened already');

  /** @private {TextTrack} */
  this.track_ = track;

  /** @type {boolean} */
  this.updating = false;

  /**
   * A work-alike for TimeRanges.
   * @type {{ length: number,
   *          start: function(number): number,
   *          end: function(number): number }}
   */
  this.buffered = {
    'length': 0,
    'start': this.bufferStart_.bind(this),
    'end': this.bufferEnd_.bind(this)
  };

  /**
   * Ignored.
   * @type {number}
   */
  this.timestampOffset = 0;
};
goog.inherits(shaka.media.TextSourceBuffer, shaka.util.FakeEventTarget);


/**
 * Parses a text buffer into an array of cues.
 *
 * @typedef {function((ArrayBuffer|ArrayBufferView)):!Array.<!TextTrackCue>}
 * @exportDoc
 */
shaka.media.TextSourceBuffer.TextParser;


/** @private {!Object.<string, !shaka.media.TextSourceBuffer.TextParser>} */
shaka.media.TextSourceBuffer.parserMap_ = {};


/**
 * @param {string} mimeType
 * @param {!shaka.media.TextSourceBuffer.TextParser} parser
 * @export
 */
shaka.media.TextSourceBuffer.registerParser = function(mimeType, parser) {
  shaka.media.TextSourceBuffer.parserMap_[mimeType] = parser;
};


/**
 * @param {string} mimeType
 * @export
 */
shaka.media.TextSourceBuffer.unregisterParser = function(mimeType) {
  delete shaka.media.TextSourceBuffer.parserMap_[mimeType];
};


/**
 * @param {string} mimeType
 * @return {boolean}
 */
shaka.media.TextSourceBuffer.isTypeSupported = function(mimeType) {
  return !!shaka.media.TextSourceBuffer.parserMap_[mimeType];
};


/**
 * @param {ArrayBuffer|ArrayBufferView} buffer
 */
shaka.media.TextSourceBuffer.prototype.appendBuffer = function(buffer) {
  shaka.asserts.assert(this.updating == false,
                       'Text appendBuffer called while updating!');
  this.updating = true;

  // Start the operation asynchronously to avoid blocking the caller.
  Promise.resolve().then(function() {
    // Parse the buffer and add the new cues.
    var cues = this.parser_(buffer);

    for (var i = 0; i < cues.length; ++i) {
      this.track_.addCue(cues[i]);
    }

    this.update_();
  }.bind(this));
};


/**
 * @param {number} start
 * @param {number} end
 */
shaka.media.TextSourceBuffer.prototype.remove = function(start, end) {
  shaka.asserts.assert(this.updating == false,
                       'Text remove called while updating!');
  this.updating = true;

  // Start the operation asynchronously to avoid blocking the caller.
  Promise.resolve().then(function() {
    var cues = this.track_.cues;
    var removeMe = [];

    for (var i = 0; i < cues.length; ++i) {
      if (cues[i].startTime > end || cues[i].endTime < start) {
        // Outside the remove range.  Hang on to it.
      } else {
        // Remove these in another loop to avoid mutating the TextTrackCueList
        // while iterating over it.  This allows us to avoid making assumptions
        // about whether or not this.track_.remove() will alter that list.
        removeMe.push(cues[i]);
      }
    }

    for (var i = 0; i < removeMe.length; ++i) {
      this.track_.removeCue(removeMe[i]);
    }

    this.update_();
  }.bind(this));
};


/**
 * Perform actions common to all updates (appendBuffer, remove).
 * @private
 */
shaka.media.TextSourceBuffer.prototype.update_ = function() {
  this.buffered.length = this.track_.cues.length ? 1 : 0;
  this.updating = false;
  var updateEnd = shaka.util.FakeEvent.create({'type': 'updateend'});
  this.dispatchEvent(updateEnd);
};


/**
 * @param {number} index
 * @return {number}
 * @private
 */
shaka.media.TextSourceBuffer.prototype.bufferStart_ = function(index) {
  shaka.asserts.assert(index == 0 && this.buffered.length == 1,
                       'Only one text buffered range allowed!');
  return this.track_.cues[0].startTime;
};


/**
 * @param {number} index
 * @return {number}
 * @private
 */
shaka.media.TextSourceBuffer.prototype.bufferEnd_ = function(index) {
  shaka.asserts.assert(index == 0 && this.buffered.length == 1,
                       'Only one text buffered range allowed!');
  return this.track_.cues[this.track_.cues.length - 1].endTime;
};
