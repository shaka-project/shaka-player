
goog.provide('shaka.abr.EwmaVideoQualityEstimator');

goog.require('shaka.abr.Ewma');
goog.require('shaka.log');

var SLOW_THRESHOLD = 5;
var FAST_TRESHOLD = 0;

shaka.abr.EwmaVideoQualityEstimator = function() {

    this.totalDroppedFrames_ = 0;
    this.totalDecodedFrames_ = 0;

    /**
     * A fast-moving average.
     * Half of the estimate is based on the last 2 seconds of sample history.
     * @private {!shaka.abr.Ewma}
     */
    this.fast_ = new shaka.abr.Ewma(2);

    /**
     * A slow-moving average.
     * Half of the estimate is based on the last 5 seconds of sample history.
     * @private {!shaka.abr.Ewma}
     */
    this.slow_ = new shaka.abr.Ewma(5);
};

shaka.abr.EwmaVideoQualityEstimator.evalVideoQualityScalar = function(videoStream) {
  return videoStream.height * videoStream.width * videoStream.frameRate;
};

shaka.abr.EwmaVideoQualityEstimator.prototype.sample = function(droppedFramesSum, decodedFramesSum) {

  console.log('droppedFramesSum:', droppedFramesSum, 'decodedFramesSum:', decodedFramesSum);

  var droppedDiff = (droppedFramesSum - this.totalDroppedFrames_);
  var decodedDiff = (decodedFramesSum - this.totalDecodedFrames_);

  // if we haven't decoded any more pictures we should not sample anything
  if (decodedDiff === 0) {
      return;
  }

  var droppedRatio = droppedDiff / decodedDiff;
  var weight = decodedDiff;

  console.log('Dropped frames ratio:', droppedRatio);  

  this.fast_.sample(weight, droppedRatio);
  this.slow_.sample(weight, droppedRatio);

  this.totalDroppedFrames_ = droppedFramesSum;
  this.totalDecodedFrames_ = decodedFramesSum;
};

shaka.abr.EwmaVideoQualityEstimator.prototype.getDroppedFramesRatioEstimate = function() {

  if (this.totalDecodedFrames_ === 0) {
    return 0;
  }

  return Math.max(this.fast_.getEstimate(), this.slow_.getEstimate());
}
