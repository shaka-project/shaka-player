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
 * @fileoverview Implements a DASH stream for text tracks.
 */

goog.provide('shaka.dash.DashTextStream');

goog.require('shaka.dash.IDashStream');
goog.require('shaka.log');
goog.require('shaka.util.FakeEventTarget');



/**
 * Creates a DashTextStream. A DashTextStream is a DashStream work-alike for
 * text tracks.
 *
 * @param {!shaka.util.FakeEventTarget} parent The parent for event bubbling.
 * @param {!HTMLVideoElement} video The video element.
 * @struct
 * @constructor
 * @implements {shaka.dash.IDashStream}
 * @extends {shaka.util.FakeEventTarget}
 */
shaka.dash.DashTextStream = function(parent, video) {
  shaka.util.FakeEventTarget.call(this, parent);

  /** @private {!HTMLVideoElement} */
  this.video_ = video;

  /** @private {shaka.dash.mpd.Representation} */
  this.representation_ = null;

  /** @private {HTMLTrackElement} */
  this.track_ = null;
};
goog.inherits(shaka.dash.DashTextStream, shaka.util.FakeEventTarget);


/**
 * @override
 * @suppress {checkTypes} to set otherwise non-nullable types to null.
 */
shaka.dash.DashTextStream.prototype.destroy = function() {
  if (this.track_) {
    this.video_.removeChild(this.track_);
  }

  this.track_ = null;
  this.representation_ = null;
  this.video_ = null;
  this.parent = null;
};


/** @override */
shaka.dash.DashTextStream.prototype.getRepresentation = function() {
  return this.representation_;
};


/** @override */
shaka.dash.DashTextStream.prototype.hasEnded = function() {
  return true;
};


/** @override */
shaka.dash.DashTextStream.prototype.start = function(representation) {
  this.representation_ = representation;
  shaka.log.info('Starting stream for', this.representation_);

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

  var url = this.representation_.baseUrl.toString();
  this.track_.src = url;

  // NOTE: mode must be set after appending to the DOM.
  this.setEnabled(false);
};


/** @override */
shaka.dash.DashTextStream.prototype.switch =
    function(representation, immediate) {
  this.start(representation);
};


/** @override */
shaka.dash.DashTextStream.prototype.resync = function() {
  // NOP
};


/** @override */
shaka.dash.DashTextStream.prototype.setEnabled = function(enabled) {
  this.track_.track.mode = enabled ? 'showing' : 'disabled';
};


/** @override */
shaka.dash.DashTextStream.prototype.getEnabled = function() {
  return this.track_.track.mode == 'showing';
};

