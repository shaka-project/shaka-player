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

goog.provide('shaka.media.TextStream');

goog.require('shaka.log');
goog.require('shaka.media.IStream');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.StreamInfo');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.PublicPromise');



/**
 * Creates a TextStream, which presents subtitles via an HTMLVideoElement's
 * built-in subtitles support.
 *
 * @param {!shaka.util.FakeEventTarget} parent The parent for event bubbling.
 * @param {!HTMLVideoElement} video The video element.
 *
 * @fires shaka.media.IStream.AdaptationEvent
 *
 * @struct
 * @constructor
 * @implements {shaka.media.IStream}
 * @extends {shaka.util.FakeEventTarget}
 */
shaka.media.TextStream = function(parent, video) {
  shaka.util.FakeEventTarget.call(this, parent);

  /** @private {!HTMLVideoElement} */
  this.video_ = video;

  /** @private {boolean} */
  this.enabled_ = true;

  /** @private {shaka.media.StreamInfo} */
  this.streamInfo_ = null;

  /** @private {shaka.media.SegmentIndex} */
  this.segmentIndex_ = null;

  /** @private {!shaka.util.PublicPromise} */
  this.startedPromise_ = new shaka.util.PublicPromise();

  /** @private {HTMLTrackElement} */
  this.track_ = null;
};
goog.inherits(shaka.media.TextStream, shaka.util.FakeEventTarget);


/** @override */
shaka.media.TextStream.prototype.configure = function(config) {};


/**
 * @override
 * @suppress {checkTypes} to set otherwise non-nullable types to null.
 */
shaka.media.TextStream.prototype.destroy = function() {
  if (this.track_) {
    this.video_.removeChild(this.track_);
  }

  this.startedPromise_.destroy();
  this.startedPromise_ = null;
  this.track_ = null;
  this.segmentIndex_ = null;
  this.streamInfo_ = null;
  this.video_ = null;
  this.parent = null;
};


/** @override */
shaka.media.TextStream.prototype.getStreamInfo = function() {
  return this.streamInfo_;
};


/** @override */
shaka.media.TextStream.prototype.getSegmentIndex = function() {
  return this.segmentIndex_;
};


/**
 * Returns a Promise that the Stream will resolve after it has begun presenting
 * its first text stream. The Stream will never reject the returned Promise.
 *
 * @override
 */
shaka.media.TextStream.prototype.started = function(proceed) {
  return this.startedPromise_;
};


/**
 * Always returns true since text streams are not segmented.
 *
 * @override
 */
shaka.media.TextStream.prototype.hasEnded = function() {
  return true;
};


/**
 * Starts presenting the specified stream asynchronously.
 * Note: |clearBuffer| and |opt_clearBufferOffset| are ignored.
 *
 * @override
 */
shaka.media.TextStream.prototype.switch = function(
    streamInfo, clearBuffer, opt_clearBufferOffset) {
  shaka.log.info('Switching stream to', streamInfo);

  streamInfo.segmentIndexSource.create().then(shaka.util.TypedBind(this,
      /** @param {!shaka.media.SegmentIndex} segmentIndex */
      function(segmentIndex) {
        if (!this.video_) {
          // We got destroyed.
          return;
        }

        if (segmentIndex.length() == 0) {
          return Promise.reject(new Error('No subtitles URL available.'));
        }

        var previousStreamInfo = this.streamInfo_;

        this.streamInfo_ = streamInfo;
        this.segmentIndex_ = segmentIndex;

        // TODO: Add support for failover in subtitles?
        var subtitlesUrl = segmentIndex.first().url.urls[0].toString();

        // Save the enabled flag so that changing the active text track does
        // not change the visibility of the text track.
        var enabled = this.getEnabled();

        // NOTE: Simply changing the src attribute of an existing track may
        // result in both the old and new subtitles appearing simultaneously.
        // To be safe, remove the old track and create a new one.
        if (this.track_) {
          // NOTE: When the current track is enabled, and we change tracks and
          // immediately disable the new one, the new one seems to end up
          // enabled anyway.  To solve this, we disable the current track
          // before removing.
          this.setEnabled(false);
          this.video_.removeChild(this.track_);
        }

        this.track_ = /** @type {HTMLTrackElement} */
            (document.createElement('track'));
        this.video_.appendChild(this.track_);

        this.track_.src = subtitlesUrl;

        // NOTE: mode must be set after appending to the DOM.
        this.setEnabled(enabled);

        var event = shaka.media.TextStream.createAdaptationEvent_(streamInfo);
        this.dispatchEvent(event);

        if (!previousStreamInfo) {
          this.startedPromise_.resolve(0 /* timestampCorrection */);
        }
      }));
};


/**
 * Does nothing since text streams do not require manual resynchronization.
 *
 * @override
 */
shaka.media.TextStream.prototype.resync = function() {};


/**
 * Returns true since text streams don't need to buffer.
 *
 * @override
 */
shaka.media.TextStream.prototype.isBuffered = function(time) {
  return true;
};


/** @override */
shaka.media.TextStream.prototype.setEnabled = function(enabled) {
  this.enabled_ = enabled;
  if (this.track_) {
    this.track_.track.mode = enabled ? 'showing' : 'disabled';
  }
};


/** @override */
shaka.media.TextStream.prototype.getEnabled = function() {
  return this.enabled_;
};


/**
 * Creates an event object for an AdaptationEvent using the given StreamInfo.
 *
 * @param {!shaka.media.StreamInfo} streamInfo
 * @return {!Event}
 * @private
 */
shaka.media.TextStream.createAdaptationEvent_ = function(streamInfo) {
  var event = shaka.util.FakeEvent.create({
    'type': 'adaptation',
    'bubbles': true,
    'contentType': 'text',
    'size': null,
    'bandwidth': streamInfo.bandwidth
  });
  return event;
};

