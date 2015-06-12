


/** @constructor */
shaka.StatsOverlay = function() {

  /** @private {?shaka.player.Player} */
  this.player_;

  /** @private {?HTMLElement} */
  this.canvas_;

  /** @protected {number} */
  this.width = 200;

  /** @protected {number} */
  this.height = 100;

  /** @private {?number} */
  this.startTimestamp;

  /** @private {?number} */
  this.currentXOffset;

  /** @private {?number} */
  this.refreshIntervalId;

  /** @protected {number} */
  this.maxY = 1000;
};


/**
 * Initializes the stats ovelay.
 * @param {!shaka.player.Player} player
 * @param {?HTMLElement} canvas
 */
shaka.StatsOverlay.prototype.init = function(player, canvas) {

  this.player_ = player;
  this.canvas_ = canvas;

  this.width = canvas.width;
  this.height = canvas.height - 5;

  this.reset();
};


/**
 * Converts a timestamp to an x coordinate
 * @param {?number} timestamp
 * @return {number}
 */
shaka.StatsOverlay.prototype.convertTimestampToXCoordinate = function(timestamp)
    {
  return Math.round(timestamp - this.startTimestamp + this.currentXOffset) +
         0.5;
};


/**
 * Converts bits to the Y Coordinate
 * Updated the running maxY to calculate the correct scale
 * @param {?number} bits
 * @return {number}
 */
shaka.StatsOverlay.prototype.convertBitsToYCoordinate = function(bits) {

  // update the running scale
  if (bits && bits > this.maxY) {
    this.maxY = bits;

    // update the scaleY
    this.scaleY = - (this.height / (this.maxY * 1.1));
  }

  // fudge the coordindate to ensure that the paths produce clean lines
  return Math.round((bits * this.scaleY) + this.height) + 0.5;
};


/**
 * Reset the overlay
 */
shaka.StatsOverlay.prototype.reset = function() {
  this.maxY = 1000;
  this.scaleY = - (this.height / this.maxY);
};


/**
 * Draw stats to the overlay
 */
shaka.StatsOverlay.prototype.draw = function() {

  var context = this.canvas_.getContext('2d');
  var stats = this.player_.getStats();

  // check if there is any band width history
  // reset the overlay to as the video has changed
  if (stats.bandwidthHistory.length == 0) {
    this.reset();
    return;
  }

  // play start time is determined by the first bandwidth history
  this.startTimestamp = stats.bandwidthHistory[0].timestamp;

  // shift the output based on the size of the canvas and the elaspsed time
  this.currentXOffset = - Math.max(0,
      (shaka.util.Clock.now() / 1000) - this.startTimestamp - this.width);

  // clear the canvas
  this.canvas_.width = this.canvas_.width;

  this.drawGraph(context, stats);

  this.drawStreamHistory(context, stats);

  this.drawBandwidth(context, stats);

  this.drawBufferingHistory(context, stats);
};


/**
 * Draw the bandwidth bands
 * @param {?Object} context
 * @param {!shaka.player.Stats} stats
 */
shaka.StatsOverlay.prototype.drawGraph = function(context, stats) {

  context.beginPath();
  context.moveTo(0, this.height + 0.5);
  context.lineTo(this.width, this.height + 0.5);
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
        this.convertBitsToYCoordinate(bitRateInfo[i].bandwidth));
    context.lineTo(this.width,
        this.convertBitsToYCoordinate(bitRateInfo[i].bandwidth));
  }

  context.stroke();
};


/**
 * Draw a blue square line to indicate the stream being played
 * @param {?Object} context
 * @param {!shaka.player.Stats} stats
 */
shaka.StatsOverlay.prototype.drawStreamHistory = function(context, stats) {

  var py = this.height;
  var px = 0;

  context.beginPath();
  context.moveTo(px, this.height);

  // graph historical stream changes - square graph
  for (var i = 0; i < stats.streamHistory.length; ++i) {

    // move to the new x
    px = this.convertTimestampToXCoordinate(
        stats.streamHistory[i].timestamp);
    context.lineTo(px, py);

    // move to the new y - convert from bytes to bits
    py = this.convertBitsToYCoordinate(
        stats.streamHistory[i].value.videoBandwidth);
    context.lineTo(px, py);
  }

  // graph to current time
  px = this.convertTimestampToXCoordinate(shaka.util.Clock.now() / 1000);
  context.lineTo(px, py);

  context.strokeStyle = '#00b';
  context.lineWidth = 0.5;
  context.stroke();
};


/**
 * Draw the bandwidth history as a red line
 * @param {?Object} context
 * @param {!shaka.player.Stats} stats
 */
shaka.StatsOverlay.prototype.drawBandwidth = function(context, stats) {

  var py = 0;
  var px = 0;

  context.beginPath();
  context.moveTo(px, this.height);

  // graph current bandwidth
  for (var i = 0; i < stats.bandwidthHistory.length; ++i) {

    px = this.convertTimestampToXCoordinate(
        stats.bandwidthHistory[i].timestamp);
    py = this.convertBitsToYCoordinate(
        stats.bandwidthHistory[i].value);

    context.lineTo(px, py);
  }
  context.strokeStyle = '#F00';
  context.lineWidth = 0.5;
  context.stroke();
};


/**
 * Draw the buffering moments as a vertical green line
 * @param {?Object} context
 * @param {!shaka.player.Stats} stats
 */
shaka.StatsOverlay.prototype.drawBufferingHistory = function(context, stats) {

  var py = 0;
  var px = 0;

  context.beginPath();
  for (var i = 0; i < stats.bufferingHistory.length; ++i) {
    px = this.convertTimestampToXCoordinate(stats.bufferingHistory[i]);
    context.moveTo(px, this.height);
    context.lineTo(px, 0);
  }
  context.strokeStyle = '#0A0';
  context.stroke();
};


/**
 * Starts or stops the refreshing of the stats
 * @param {!boolean} enable
 */
shaka.StatsOverlay.prototype.refresh = function(enable) {

  if (enable) {
    var overlay = this;
    this.refreshIntervalId = setInterval(function() { overlay.draw(); }, 500);
  }
  else if (this.refreshIntervalId) {
    clearInterval(this.refreshIntervalId);
  }
};
