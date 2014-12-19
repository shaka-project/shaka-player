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
 * @fileoverview Implements a player stats object.
 */

goog.provide('shaka.player.Stats');

goog.require('shaka.asserts');
goog.require('shaka.dash.mpd');



/**
 * Creates a Stats object.
 *
 * @constructor
 * @struct
 */
shaka.player.Stats = function() {
  /**
   * @type {shaka.player.Stats.RepresentationStats}
   * @expose
   */
  this.representation = null;

  /**
   * Number of frames decoded.  NaN if not available.
   *
   * @type {number}
   * @expose
   */
  this.decodedFrames = NaN;

  /**
   * Number of frames dropped.  NaN if not available.
   *
   * @type {number}
   * @expose
   */
  this.droppedFrames = NaN;

  /**
   * Estimated bandwidth in bits per second.
   *
   * @type {number}
   * @expose
   */
  this.estimatedBandwidth = 0;

  /**
   * Time in playback state in seconds.
   *
   * @type {number}
   * @expose
   */
  this.playTime = 0;

  /**
   * Time in buffering state in seconds.
   *
   * @type {number}
   * @expose
   */
  this.bufferingTime = 0;

  /**
   * Playback latency in seconds.  NaN if autoplay is not used.
   *
   * @type {number}
   * @expose
   */
  this.playbackLatency = NaN;

  /**
   * Buffering history.  Each number is a timestamp when the player entered a
   * buffering state.
   *
   * @type {!Array.<number>}
   * @expose
   */
  this.bufferingHistory = [];

  /**
   * Bandwidth history.  Each timestamped value is a bandwidth measurement, in
   * bits per second.
   *
   * @type {!Array.<shaka.player.Stats.TimedValue.<number>>}
   * @expose
   */
  this.bandwidthHistory = [];

  /**
   * Representation history.  Each timestamped value is a representation chosen
   * by the player.
   *
   * @type {!Array.<shaka.player.Stats.TimedValue.<
   *            shaka.player.Stats.RepresentationStats>>}
   * @expose
   */
  this.representationHistory = [];
};


/**
 * Updates video stats from the video tag.
 *
 * @param {HTMLVideoElement} video
 */
shaka.player.Stats.prototype.updateVideoStats = function(video) {
  // Quality metrics may not be supported in all browsers yet.
  var quality = video.getVideoPlaybackQuality();
  if (quality) {
    this.decodedFrames = quality.totalVideoFrames;
    this.droppedFrames = quality.droppedVideoFrames;
  }
};


/**
 * Logs a buffering event.
 */
shaka.player.Stats.prototype.logBufferingEvent = function() {
  this.bufferingHistory.push(Date.now() / 1000.0);
};


/**
 * Logs play time.
 *
 * @param {number} t Milliseconds the player has been in a playback state.
 */
shaka.player.Stats.prototype.logPlayTime = function(t) {
  this.playTime += t / 1000.0;
};


/**
 * Logs buffering time.
 *
 * @param {number} t Milliseconds the player has been in a buffering state.
 */
shaka.player.Stats.prototype.logBufferingTime = function(t) {
  this.bufferingTime += t / 1000.0;
};


/**
 * Logs a representation change.
 *
 * @param {!shaka.dash.mpd.Representation} representation
 */
shaka.player.Stats.prototype.logRepresentationChange =
    function(representation) {
  this.representation =
      new shaka.player.Stats.RepresentationStats(representation);
  this.representationHistory.push(
      new shaka.player.Stats.TimedValue(this.representation));
};


/**
 * Logs bandwidth stats.
 *
 * @param {number} bandwidth in bits per second.
 */
shaka.player.Stats.prototype.logBandwidth = function(bandwidth) {
  this.estimatedBandwidth = bandwidth;
  this.bandwidthHistory.push(
      new shaka.player.Stats.TimedValue(bandwidth));
};


/**
 * Logs playback latency.
 *
 * @param {number} latency in milliseconds.
 */
shaka.player.Stats.prototype.logPlaybackLatency = function(latency) {
  this.playbackLatency = latency / 1000.0;
};



/**
 * A collection of video representation stats.
 *
 * @param {!shaka.dash.mpd.Representation} representation
 *
 * @constructor
 * @struct
 */
shaka.player.Stats.RepresentationStats = function(representation) {
  /**
   * Representation width in pixels.
   *
   * @type {?number}
   * @expose
   */
  this.videoWidth = representation.width;

  /**
   * Representation height in pixels.
   *
   * @type {?number}
   * @expose
   */
  this.videoHeight = representation.height;

  /**
   * Representation MIME type.
   *
   * @type {?string}
   * @expose
   */
  this.videoMimeType = representation.mimeType;

  /**
   * Representation bandwidth requirement in bits per second.
   *
   * @type {?number}
   * @expose
   */
  this.videoBandwidth = representation.bandwidth;
};



/**
 * A value associated with a timestamp.
 *
 * @param {T} value
 *
 * @template T
 * @constructor
 * @struct
 */
shaka.player.Stats.TimedValue = function(value) {
  /**
   * Seconds since 1970.
   *
   * @type {number}
   * @const
   * @expose
   */
  this.timestamp = Date.now() / 1000.0;

  /**
   * @const {T}
   * @expose
   */
  this.value = value;
};

