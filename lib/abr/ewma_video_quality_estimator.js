
goog.provide('shaka.abr.EwmaVideoQualityEstimator');

goog.require('shaka.abr.Ewma');
goog.require('shaka.log');

var FAST_WINDOW = 1;
var SLOW_WINDOW = 3;

shaka.abr.EwmaVideoQualityEstimator = function() {

  /**
  * A fast-moving average.
  * Half of the estimate is based on the last `FAST_WINDOW` seconds of sample history.
  * @private {!Ewma}
  */
  this.fast_ = new shaka.abr.Ewma(FAST_WINDOW);
  this.fastExpected_ = new shaka.abr.Ewma(FAST_WINDOW);
  this.fastDifferential_ = new shaka.abr.Ewma(FAST_WINDOW);

  /**
  * A slow-moving average.
  * Half of the estimate is based on the last `SLOW_WINDOW` seconds of sample history.
  * @private {!Ewma}
  */
  this.slow_ = new shaka.abr.Ewma(SLOW_WINDOW);
  this.slowExpected_ = new shaka.abr.Ewma(SLOW_WINDOW);
  this.slowDifferential_ = new shaka.abr.Ewma(SLOW_WINDOW);

};

shaka.abr.EwmaVideoQualityEstimator.prototype.sample = function(
        totalFrames, droppedFrames,
        videoWidth, videoHeight,
        bandwidth,
        frameRate) {

  var totalPixels = videoWidth * videoHeight;
  var displayedFramesRatio = (totalFrames - droppedFrames) / totalFrames;
  var totalPixelsPerSecond = frameRate * totalPixels;
  var displayedPixelsPerSecond = displayedFramesRatio * totalPixelsPerSecond;
  var quality = displayedPixelsPerSecond / bandwidth; // Quality as coding-efficiency [pixels / bits]
  // NOT subjectively perceived image quality
  // which may rather be approximated by a heuristic
  // of pixels times bandwidth as opposed to
  // pixels per bandwidth
  var expectedQuality = totalPixelsPerSecond / bandwidth;

  var weight = totalFrames / frameRate;

  this.fast_.sample(weight, quality);
  this.slow_.sample(weight, quality);

  this.fastExpected_.sample(weight, expectedQuality);
  this.slowExpected_.sample(weight, expectedQuality);

  this.fastDifferential_.sample(weight, quality - expectedQuality);
  this.slowDifferential_.sample(weight, quality - expectedQuality);
};

shaka.abr.EwmaVideoQualityEstimator.prototype.getVideoQualityEstimate = function() {
  return Math.min(this.fast_.getEstimate(), this.slow_.getEstimate());
};

shaka.abr.EwmaVideoQualityEstimator.prototype.getExpectedVideoQualityEstimate = function() {
  return Math.min(this.fastExpected_.getEstimate(), this.slowExpected_.getEstimate());
};

shaka.abr.EwmaVideoQualityEstimator.prototype.getDifferentialVideoQualityEstimate = function() {
  return Math.min(this.fastDifferential_.getEstimate(), this.slowDifferential_.getEstimate());
};
