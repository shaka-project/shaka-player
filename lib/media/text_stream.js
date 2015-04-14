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
 * @fileoverview Implements a media stream for text tracks.
 */

goog.provide('shaka.media.TextStream');

goog.require('shaka.log');
goog.require('shaka.media.IStream');
goog.require('shaka.media.StreamInfo');
goog.require('shaka.util.FakeEventTarget');



/**
 * Creates a TextStream. A TextStream is a Stream work-alike for
 * text tracks.
 *
 * @param {!shaka.util.FakeEventTarget} parent The parent for event bubbling.
 * @param {!HTMLVideoElement} video The video element.
 * @struct
 * @constructor
 * @implements {shaka.media.IStream}
 * @extends {shaka.util.FakeEventTarget}
 */
shaka.media.TextStream = function(parent, video) {
  shaka.util.FakeEventTarget.call(this, parent);

  /** @private {!HTMLVideoElement} */
  this.video_ = video;

  /** @private {shaka.media.StreamInfo} */
  this.streamInfo_ = null;

  /** @private {HTMLTrackElement} */
  this.track_ = null;
};
goog.inherits(shaka.media.TextStream, shaka.util.FakeEventTarget);


/**
 * @override
 * @suppress {checkTypes} to set otherwise non-nullable types to null.
 */
shaka.media.TextStream.prototype.destroy = function() {
  if (this.track_) {
    this.video_.removeChild(this.track_);
  }

  this.track_ = null;
  this.streamInfo_ = null;
  this.video_ = null;
  this.parent = null;
};


/** @override */
shaka.media.TextStream.prototype.getStreamInfo = function() {
  return this.streamInfo_;
};


/** @override */
shaka.media.TextStream.prototype.hasStarted = function() {
  return true;
};


/** @override */
shaka.media.TextStream.prototype.hasEnded = function() {
  return true;
};


/** @override */
shaka.media.TextStream.prototype.start =
    function(streamInfo, initialBufferSize) {
  this.streamInfo_ = streamInfo;
  shaka.log.info('Starting stream for', streamInfo);

  // Save the enabled flag so that changing the active text track does not
  // change the visibility of the text track.
  var enabled = this.getEnabled();

  // NOTE: Simply changing the src attribute of an existing track may result
  // in both the old and new subtitles appearing simultaneously.  To be safe,
  // remove the old track and create a new one.
  if (this.track_) {
    // NOTE: When the current track is enabled, and we change tracks and
    // immediately disable the new one, the new one seems to end up enabled
    // anyway.  To solve this, we disable the current track before removing.
    this.setEnabled(false);
    this.video_.removeChild(this.track_);
  }

  this.track_ = /** @type {HTMLTrackElement} */
      (document.createElement('track'));
  this.video_.appendChild(this.track_);

  var url = this.streamInfo_.mediaUrl.toString();
  this.track_.src = url;

  // NOTE: mode must be set after appending to the DOM.
  this.setEnabled(enabled);
};


/** @override */
shaka.media.TextStream.prototype.switch = function(streamInfo, immediate) {
  this.start(streamInfo, 0);
};


/** @override */
shaka.media.TextStream.prototype.resync = function() {
  // NOP
};


/** @override */
shaka.media.TextStream.prototype.setEnabled = function(enabled) {
  this.track_.track.mode = enabled ? 'showing' : 'disabled';
};


/** @override */
shaka.media.TextStream.prototype.getEnabled = function() {
  if (!this.track_) return false;
  return this.track_.track.mode == 'showing';
};

