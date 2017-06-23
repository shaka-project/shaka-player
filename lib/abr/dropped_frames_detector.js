
goog.provide('shaka.abr.DroppedFramesDetector');

const CHECK_STATS_INTERVAL_MS = 1000;
const CPU_COOLDOWN_TIME_MS = 10000;
const DROPPED_FPS_TRIGGER = 5;

const PIXELS_PALNTSC = 384 * 288;
const PIXELS_SD = 640 * 480;
const PIXELS_HD = 960 * 720;

const DeviceCapacityLevels = {
    'INSUFFICIENT': -3,
    'NO_SD': -2,
    'NO_HD': -1,
    'NORMAL': 0
};

DeviceCapacityLevels.translate = function(deviceCapacityLevel) {
	switch(deviceCapacityLevel) {
	case DeviceCapacityLevels.INSUFFICIENT: return 'INSUFFICIENT';
	case DeviceCapacityLevels.NO_SD: return 'NO_SD';
	case DeviceCapacityLevels.NO_HD: return 'NO_HD';
	case DeviceCapacityLevels.NORMAL: return 'NORMAL';
	default: throw new Error('unknown DeviceCapacityLevel:', deviceCapacityLevel);
	}
}

DeviceCapacityLevels.mapToPixelsThreshold = function(deviceCapacityLevel) {
	switch(deviceCapacityLevel) {
	case DeviceCapacityLevels.INSUFFICIENT: return PIXELS_PALNTSC; // PAL/NTSC/SECAM
	case DeviceCapacityLevels.NO_SD: return PIXELS_SD; // SD
	case DeviceCapacityLevels.NO_HD: return PIXELS_HD; // HD
	case DeviceCapacityLevels.NORMAL: return Infinity;
	default: throw new Error('unknown DeviceCapacityLevel:', deviceCapacityLevel);
	}
}

DeviceCapacityLevels.mapToMaxPixels = function(deviceCapacityLevel) {
	return DeviceCapacityLevels.mapToPixelsThreshold(deviceCapacityLevel) - 1;
}

shaka.abr.DroppedFramesDetector = function(statsProvider, deviceCapacityCallback) {
	this.getStats_ = statsProvider;
	this.switchDeviceCapacity_ = deviceCapacityCallback;

	this.deviceCapacityLevel_ = DeviceCapacityLevels.NORMAL;

    this.timeOfLastStatsCheck_ = null;
    this.timeOfLastHeatUp_ = null;
	this.previousDroppedFrames_ = null;
    this.checkStatsInterval_ = null;
};

shaka.abr.DroppedFramesDetector.DeviceCapacityLevels = DeviceCapacityLevels;

shaka.abr.DroppedFramesDetector.prototype.start = function() {
	if (this.checkStatsInterval_) {
		throw new Error('DroppedFramesDetector already startd');
	}
    this.checkStatsInterval_ = setInterval(this.checkStats_.bind(this), 
    	CHECK_STATS_INTERVAL_MS);
};

shaka.abr.DroppedFramesDetector.prototype.stop = function(keepState) {
	clearInterval(this.checkStatsInterval_);
	if (!keepState) {
	    this.timeOfLastStatsCheck_ = null;
	    this.timeOfLastHeatUp_ = null;
		this.previousDroppedFrames_ = null;
	    this.checkStatsInterval_ = null;
		this.deviceCapacityLevel_ = DeviceCapacityLevels.NORMAL;		
	}
};

shaka.abr.DroppedFramesDetector.prototype.haveStats_ = function() {
	return typeof this.timeOfLastStatsCheck_ === 'number' 
        && typeof this.previousDroppedFrames_ === 'number';
};

shaka.abr.DroppedFramesDetector.prototype.hadHeatUp_ = function() {
	return typeof this.timeOfLastHeatUp_ === 'number';
};

shaka.abr.DroppedFramesDetector.prototype.checkStats_ = function() {
    const stats = this.getStats_();
    const now = Date.now();

    if (this.haveStats_()) {
        const diffSeconds = (now - this.timeOfLastStatsCheck_) / 1000.0;
        const diffFrames = (stats.droppedFrames - this.previousDroppedFrames_);
        const droppedFps = Math.ceil(diffFrames / diffSeconds);

        console.log('Dropped FPS:', droppedFps);

        if (droppedFps >= DROPPED_FPS_TRIGGER) {

            this.timeOfLastHeatUp_ = now;

            if (this.deviceCapacityLevel_ > DeviceCapacityLevels.INSUFFICIENT) {
                this.deviceCapacityLevel_--;
                console.warn('Too many dropped frames. Set device capacity level to:', 
                	DeviceCapacityLevels.translate(this.deviceCapacityLevel_));

                this.switchDeviceCapacity_(this.deviceCapacityLevel_);
            } else {
                console.warn('Too many dropped frames. User should be notified about insufficient hardware.');
            }
        }            
    }

    if (this.hadHeatUp_()) {

        const timeSinceLastHeatup = now - this.timeOfLastHeatUp_;

        // NOTE: we should also check if we are currently paused or buffering
        //       before actually handling this as a valid cooldown. 
        //       Not currently possible to interface with the player this way, 
        //       needs change to ABR-manager iface.
        if (timeSinceLastHeatup >= CPU_COOLDOWN_TIME_MS 
            && this.deviceCapacityLevel_ < DeviceCapacityLevels.NORMAL) {
            this.deviceCapacityLevel_++;
            // we dont want to go up all at once, so we set this as a heat-up time
            this.timeOfLastHeatUp_ = now;
            console.warn('Cooldown period passed, increasing device capacity level to:', 
            	DeviceCapacityLevels.translate(this.deviceCapacityLevel_));

            this.switchDeviceCapacity_(this.deviceCapacityLevel_);
        }
    }

    this.previousDroppedFrames_ = stats.droppedFrames;
    this.timeOfLastStatsCheck_ = now;
};
