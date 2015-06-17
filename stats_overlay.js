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
 * @fileoverview A statistics visualiser.
 */

 goog.provide('shaka.StatsOverlay');

/** @constructor
 * @export
*/
shaka.StatsOverlay = function() {

  /** @private {?shaka.player.Player} */
  this.player_;

  /** @private {?HTMLElement} */
  this.canvas_;

  /** @private {?HTMLVideoElement} */
  this.video_;

  /** @private {?number} */
  this.width_;

  /** @private {?number} */
  this.height_;

  /** @private {number} */
  this.maxY_ = 1;

  /** @private {number} */
  this.maxBufferLength_ = 1;

  /** @private {?number} */
  this.startTimestamp_;

  /** @private {?number} */
  this.currentXOffset_;

  /** @private {?number} */
  this.refreshIntervalId_;

  /** @private {?Array} */
  this.bufferLengthHistory_;

};


/**
 * Initializes the stats ovelay.
 * @param {!shaka.player.Player} player
 * @param {?HTMLElement} canvas
*  @param {!HTMLVideoElement} video The video element.
 * @export
 */
shaka.StatsOverlay.prototype.init = function(player, canvas, video) {

  this.player_ = player;
  this.canvas_ = canvas;
  this.video_ = video;

  this.width_ = canvas.width;
  this.height_ = canvas.height - 5;

  this.reset();
};


/**
 * Converts a timestamp to an x coordinate
 * @private
 * @param {?number} timestamp
 * @return {number}
 */
shaka.StatsOverlay.prototype.convertTimestampToXCoordinate_ =
    function(timestamp) {
  return Math.round(timestamp - this.startTimestamp_ + this.currentXOffset_) +
         0.5;
};


/**
 * Converts bits to the Y Coordinate
 * Updated the running maxY_ to calculate the correct scale
 * @private
 * @param {?number} bits
 * @return {number}
 */
shaka.StatsOverlay.prototype.convertBitsToYCoordinate_ = function(bits) {

  // update the running scale
  if (bits && bits > this.maxY_) {
    this.maxY_ = bits;

    // update the scaleY
    this.scaleY_ = - (this.height_ / (this.maxY_ * 1.1));
  }

  // fudge the coordindate to ensure that the paths produce clean lines
  return Math.round((bits * this.scaleY_) + this.height_) + 0.5;
};

/**
 * Converts bits to the Y Coordinate
 * Updated the running maxY_ to calculate the correct scale
 * @private
 * @param {?number} bufferLength
 * @return {number}
 */
shaka.StatsOverlay.prototype.convertBufferLengthToYCoordinate_ = function(bufferLength) {

  // update the running scale
  if (bufferLength && bufferLength > this.maxBufferLength_) {
    this.maxBufferLength_ = bufferLength;

    // update the bufferLength scaleY
    this.scaleBufferLengthY_ = - (this.height_ / (this.maxBufferLength_ * 1.1));
  }

  // fudge the coordindate to ensure that the paths produce clean lines
  return Math.round((bufferLength * this.scaleBufferLengthY_) + this.height_) + 0.5;
};

/**
 * Reset the overlay
 */
shaka.StatsOverlay.prototype.reset = function() {
  this.maxY_ = 1;
  this.scaleY_ = - (this.height_ / this.maxY_);

  this.maxBufferLength_ = 1;
  this.scaleBufferLengthY_ = - (this.height_ / this.maxBufferLength_);

  this.bufferLengthHistory_ = [];
};


/**
 * Record buffer history
 * @private
 */
shaka.StatsOverlay.prototype.recordBufferHistory_ = function(){

  if (!(this.player_ && this.video_))
    return;

  var currentTime = this.video_.currentTime;
  var timestamp = Math.round(shaka.util.Clock.now() / 1000);

  // limit the recording rate
  if (this.bufferLengthHistory_.length > 0 && this.bufferLengthHistory_[0].timestamp == timestamp)
    return;

  // calculate the buffer size
  var buffered = this.video_.buffered;
  var ahead = 0;
  // var behind = 0;

  for (var i = 0; i < buffered.length; ++i) {
    if (buffered.start(i) <= currentTime && buffered.end(i) >= currentTime) {
      ahead = buffered.end(i) - currentTime;
      break;
    }
  }

  this.bufferLengthHistory_.push({
    timestamp: timestamp,
    value: ahead
  });
}


/**
 * Draw stats to the overlay
 * @private
 */
shaka.StatsOverlay.prototype.draw_ = function() {

  var context = this.canvas_.getContext('2d');
  var stats = this.player_.getStats();

  // check if there is any band width history
  // reset the overlay to as the video has changed
  if (stats.bandwidthHistory.length == 0) {
    this.reset();
    return;
  }

  this.recordBufferHistory_();

  // play start time is determined by the first bandwidth history
  this.startTimestamp_ = stats.bandwidthHistory[0].timestamp;

  // shift the output based on the size of the canvas and the elaspsed time
  this.currentXOffset_ = - Math.max(0,
      (shaka.util.Clock.now() / 1000) - this.startTimestamp_ - this.width_);

  context.clearRect(0, 0, this.canvas_.width, this.canvas_.height);

  this.drawGraph_(context, stats);

  this.drawBufferLengthHistory_(context);

  this.drawStreamHistory_(context, stats);

  this.drawBandwidth_(context, stats);

  this.drawBufferingHistory_(context, stats);


};


/**
 * Draw the bandwidth bands
 * @private
 * @param {?Object} context
 * @param {!shaka.player.Stats} stats
 */
shaka.StatsOverlay.prototype.drawGraph_ = function(context, stats) {

  context.beginPath();
  context.moveTo(0, this.height_ + 0.5);
  context.lineTo(this.width_, this.height_ + 0.5);
  context.strokeStyle = '#000';
  context.lineWidth = 0.5;
  context.stroke();

  // draw bitrates
  var bitRateInfo = this.player_.getVideoTracks();
  context.beginPath();
  context.strokeStyle = '#999';
  context.lineWidth = 0.5;

  for (var i = 0; i < bitRateInfo.length; i++)
  {
    context.moveTo(0,
        this.convertBitsToYCoordinate_(bitRateInfo[i].bandwidth));
    context.lineTo(this.width_,
        this.convertBitsToYCoordinate_(bitRateInfo[i].bandwidth));
  }

  context.stroke();
};


/**
 * Draw a blue square line to indicate the stream being played
 * @private
 * @param {?Object} context
 * @param {!shaka.player.Stats} stats
 */
shaka.StatsOverlay.prototype.drawStreamHistory_ = function(context, stats) {

  var py = this.height_;
  var px = 0;

  context.beginPath();
  context.strokeStyle = '#00b';
  context.lineWidth = 0.5;
  context.moveTo(px, this.height_);

  // graph historical stream changes - square graph
  for (var i = 0; i < stats.streamHistory.length; ++i) {

    // move to the new x
    px = this.convertTimestampToXCoordinate_(
        stats.streamHistory[i].timestamp);
    context.lineTo(px, py);

    // move to the new y - convert from bytes to bits
    py = this.convertBitsToYCoordinate_(
        stats.streamHistory[i].value.videoBandwidth);
    context.lineTo(px, py);
  }

  // graph to current time
  px = this.convertTimestampToXCoordinate_(shaka.util.Clock.now() / 1000);
  context.lineTo(px, py);
  context.stroke();
};


/**
 * Draw the bandwidth history as a red line
 * @private
 * @param {?Object} context
 * @param {!shaka.player.Stats} stats
 */
shaka.StatsOverlay.prototype.drawBandwidth_ = function(context, stats) {

  var py = 0;
  var px = 0;

  context.beginPath();
  context.strokeStyle = '#F00';
  context.lineWidth = 0.5;
  context.moveTo(px, this.height_);

  // graph current bandwidth
  for (var i = 0; i < stats.bandwidthHistory.length; ++i) {

    px = this.convertTimestampToXCoordinate_(
        stats.bandwidthHistory[i].timestamp);
    py = this.convertBitsToYCoordinate_(
        stats.bandwidthHistory[i].value);

    context.lineTo(px, py);
  }

  context.stroke();
};


/**
 * Draw the buffering moments as a vertical green line
 * @private
 * @param {?Object} context
 * @param {!shaka.player.Stats} stats
 */
shaka.StatsOverlay.prototype.drawBufferingHistory_ = function(context, stats) {

  var px = 0;

  context.beginPath();
  context.strokeStyle = '#0A0';
  context.lineWidth = 0.5;

  for (var i = 0; i < stats.bufferingHistory.length; ++i) {
    px = this.convertTimestampToXCoordinate_(stats.bufferingHistory[i]);
    context.moveTo(px, this.height_);
    context.lineTo(px, 0);
  }

  context.stroke();
};


/**
 * Draw the buffer level as a while line
 * @private
 * @param {?Object} context
 */
shaka.StatsOverlay.prototype.drawBufferLengthHistory_ = function(context) {

  var py = 0;
  var px = 0;

  context.beginPath();
  context.strokeStyle = '#FFF';
  context.lineWidth = 0.5;
  context.moveTo(px, this.height_);

  for (var i = 0; i < this.bufferLengthHistory_.length; ++i) {
    px = this.convertTimestampToXCoordinate_(
      this.bufferLengthHistory_[i].timestamp);
    py = this.convertBufferLengthToYCoordinate_(
      this.bufferLengthHistory_[i].value);

    context.lineTo(px, py);
  }

  context.stroke();
};


/**
 * Starts or stops the refreshing of the stats
 * @param {!boolean} enable
 * @export
 */
shaka.StatsOverlay.prototype.refresh = function(enable) {

  if (enable) {
    var overlay = this;
    this.refreshIntervalId_ = setInterval(function() { overlay.draw_(); }, 500);
  }
  else if (this.refreshIntervalId_) {
    clearInterval(this.refreshIntervalId_);
  }
};
