
goog.provide('shaka.abr.VideoPlaybackQualityWatcher');

goog.require('shaka.abr.EwmaVideoQualityEstimator');

var DEBUG = true;
var MAX_LOSS_DB = 0.30;
var MIN_QUALITY_TO_NOISE_DB = 40;

var noop = function() {};
var log = window.console.log.bind(window.console, "VideoPlaybackQualityWatcher:");

var print = DEBUG ? log : noop;

var toDb = function(ratio) {
    return 10 * Math.log(Math.abs(ratio));
};

shaka.abr.VideoPlaybackQualityWatcher = function(videoEl, 
  initialBandwidth, samplingPeriodMs, onUpdate) {

  if (typeof videoEl.getVideoPlaybackQuality !== "function") {
    throw new Error("Video element has no getVideoPlaybackQuality function");
  }

  this.onUpdate_ = onUpdate;
  this.videoEl_ = videoEl;
  this.currentBandwidth_ = initialBandwidth;
  this.droppedVideoFrames_ = 0;
  this.totalVideoFrames_ = 0;
  this.currentTime_ = null;
  this.estimator_ = new shaka.abr.EwmaVideoQualityEstimator();

  /* This is needed because MediaElement.seeking is non-standard prop */
  this.seeking_ = false;

  this.videoEl_.addEventListener("seeking", function() {
    this.setSeeking_(true);
  }.bind(this));

  this.videoEl_.addEventListener("seeked", function() {
    this.setSeeking_(false);
  }.bind(this));

  this.videoEl_.addEventListener("playing", function() {
    this.setSeeking_(false);
  }.bind(this));

  this.sampleInterval_ = setInterval(
    this.onSampleIntervalTick_.bind(this),
    samplingPeriodMs);
};

shaka.abr.VideoPlaybackQualityWatcher.prototype.setSeeking_ = function(seeking) {
  this.seeking_ = seeking;
  if(seeking) {
    this.resetCounters();
  }
};

shaka.abr.VideoPlaybackQualityWatcher.prototype.onSampleIntervalTick_ = function() {

  let currentEstimate;
  let currentExpectedEstimate;
  let currentDifferentialEstimate;
  let frameRate = 0;
  let droppedRate;
  let timeDifference;
  let totalFramesDifference;
  let droppedFramesDifference;

  const previousTime = this.currentTime_ || 0;
  const firstRun = !this.currentTime_;
  const playheadIsMovingForwardNormally = this.playheadIsMovingForwardNormally();
  const videoEl = this.videoEl_;
  const bandwidth = this.currentBandwidth_;

  const videoPlaybackQuality = videoEl.getVideoPlaybackQuality();

  print("got VideoPlaybackQuality:", videoPlaybackQuality, "first run:", firstRun);

  const {totalVideoFrames, droppedVideoFrames} = videoPlaybackQuality;
  const {videoWidth, videoHeight, currentTime} = videoEl;

  if (bandwidth <= 0) {
    print('no valid bandwidth set, not updating');
    return;
  }

  if (!firstRun && playheadIsMovingForwardNormally) {

    timeDifference = currentTime - previousTime;
    totalFramesDifference = totalVideoFrames - this.totalVideoFrames_;
    droppedFramesDifference = droppedVideoFrames - this.droppedVideoFrames_;
    frameRate = totalFramesDifference / timeDifference;
    droppedRate = droppedFramesDifference / timeDifference;

    print("sampling status:", {
        bandwidth,
        timeDifference,
        totalFramesDifference,
        droppedFramesDifference,
        frameRate,
        droppedRate
    });
  }

  if (playheadIsMovingForwardNormally) {
      this.droppedVideoFrames_ = droppedVideoFrames;
      this.totalVideoFrames_ = totalVideoFrames;
      this.currentTime_ = currentTime;
  } else {
      print("playhead not moving forward normally");
      this.resetCounters();
      return;
  }

  if (firstRun) {
      print("first run, not sampling/estimating");
      return;
  }

  this.estimator_.sample(totalVideoFrames, droppedVideoFrames,
      videoWidth, videoHeight, bandwidth, frameRate);

  currentEstimate = this.estimator_.getVideoQualityEstimate();
  currentExpectedEstimate = this.estimator_.getExpectedVideoQualityEstimate();
  currentDifferentialEstimate = this.estimator_.getDifferentialVideoQualityEstimate();

  this.onEstimatesUpdated_(currentEstimate,
      currentExpectedEstimate,
      currentDifferentialEstimate);
};

shaka.abr.VideoPlaybackQualityWatcher.prototype.onEstimatesUpdated_ = function(currentEstimate,
        currentExpectedEstimate,
        currentDifferentialEstimate) {

  print("current video-playback-quality estimate:",
      (currentEstimate).toFixed(2), "[pixels/bits]");

  print("current expected video-playback-quality estimate:",
      (currentExpectedEstimate).toFixed(2), "[pixels/bits]");

  print("current differential video-playback-quality estimate:",
      (currentDifferentialEstimate).toFixed(2), "[pixels/bits]");

  let qualityLoss = currentEstimate / currentExpectedEstimate;
  let qualityToNoiseRatio = currentDifferentialEstimate / currentExpectedEstimate;

  let qualityLossDb = -1 * toDb(qualityLoss);
  let qualityToNoiseRatioDb = -1 * toDb(qualityToNoiseRatio);

  print("quality-degration-ratio:", qualityLossDb.toFixed(2), "[db]");
  print("quality-noise-ratio:", qualityToNoiseRatioDb.toFixed(2), "[db]");

  let qualityLossExceeded = qualityLossDb > MAX_LOSS_DB;
  let qualityToNoiseTooLow = qualityToNoiseRatioDb < MIN_QUALITY_TO_NOISE_DB;

  this.onUpdate_ && this.onUpdate_({
      qualityLossExceeded,
      qualityToNoiseTooLow
  });
};

shaka.abr.VideoPlaybackQualityWatcher.prototype.resetCounters = function() {
  print("resetting counters");
  this.currentTime_ = null;
  this.droppedVideoFrames_ = 0;
  this.totalVideoFrames_ = 0;
};

shaka.abr.VideoPlaybackQualityWatcher.prototype.updateBandwidth = function(bandwidth) {
  this.currentBandwidth_ = bandwidth;
};

shaka.abr.VideoPlaybackQualityWatcher.prototype.isEnabled = function() {
  return !!this.sampleInterval_;
};

shaka.abr.VideoPlaybackQualityWatcher.prototype.playheadIsMovingForwardNormally = function() {
  const videoEl = this.videoEl_;
  const seeking = this.seeking_ || videoEl.seeking;
  const paused = videoEl.paused || videoEl.playbackRate === 0;
  const rewinding = videoEl.playbackRate < 0;
  const fastForward = videoEl.playbackRate > 1;

  return !seeking && !paused && !rewinding && !fastForward;
};

shaka.abr.VideoPlaybackQualityWatcher.prototype.dispose = function() {
  if (this.sampleInterval_) {
      clearInterval(this.sampleInterval_);
  }
  this.sampleInterval_ = null;
};
