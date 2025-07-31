/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.Utils');

goog.require('shaka.util.TextParser');
goog.require('shaka.util.TXml');


/**
 * A class responsible for ad utils.
 * @export
 */
shaka.ads.Utils = class {
  /**
   * @param {!shaka.extern.xml.Node} vast
   * @param {?number} currentTime
   * @return {!Array<shaka.extern.AdInterstitial>}
   */
  static parseVastToInterstitials(vast, currentTime) {
    const TXml = shaka.util.TXml;
    /** @type {!Array<shaka.extern.AdInterstitial>} */
    const interstitials = [];

    for (const ad of TXml.findChildren(vast, 'Ad')) {
      const inline = TXml.findChild(ad, 'InLine');
      if (!inline) {
        continue;
      }
      const creatives = TXml.findChild(inline, 'Creatives');
      if (!creatives) {
        continue;
      }
      for (const creative of TXml.findChildren(creatives, 'Creative')) {
        const linear = TXml.findChild(creative, 'Linear');
        if (linear) {
          shaka.ads.Utils.processLinearAd_(
              interstitials, currentTime, linear);
        }
        const nonLinearAds = TXml.findChild(creative, 'NonLinearAds');
        if (nonLinearAds) {
          const nonLinears = TXml.findChildren(nonLinearAds, 'NonLinear');
          for (const nonLinear of nonLinears) {
            shaka.ads.Utils.processNonLinearAd_(
                interstitials, currentTime, nonLinear);
          }
        }
      }
    }
    return interstitials;
  }

  /**
   * @param {!Array<shaka.extern.AdInterstitial>} interstitials
   * @param {?number} currentTime
   * @param {!shaka.extern.xml.Node} linear
   * @private
   */
  static processLinearAd_(interstitials, currentTime, linear) {
    const TXml = shaka.util.TXml;
    let startTime = 0;
    if (currentTime != null) {
      startTime = currentTime;
    }
    let skipOffset = null;
    if (linear.attributes['skipoffset']) {
      skipOffset = shaka.util.TextParser.parseTime(
          linear.attributes['skipoffset']);
      if (isNaN(skipOffset)) {
        skipOffset = null;
      }
    }
    const mediaFiles = TXml.findChild(linear, 'MediaFiles');
    if (!mediaFiles) {
      return;
    }
    let clickThroughUrl = null;
    const videoClicks = TXml.findChild(linear, 'VideoClicks');
    if (videoClicks) {
      const clickThroughElement = TXml.findChild(videoClicks, 'ClickThrough');
      if (clickThroughElement) {
        const clickUrl = TXml.getContents(clickThroughElement);
        if (clickUrl) {
          clickThroughUrl = clickUrl;
        }
      }
    }
    const medias = TXml.findChildren(mediaFiles, 'MediaFile');
    let checkMedias = medias;
    const streamingMedias = medias.filter((media) => {
      return media.attributes['delivery'] == 'streaming';
    });
    if (streamingMedias.length) {
      checkMedias = streamingMedias;
    }
    const sortedMedias = checkMedias.sort((a, b) => {
      const aHeight = parseInt(a.attributes['height'], 10) || 0;
      const bHeight = parseInt(b.attributes['height'], 10) || 0;
      return bHeight - aHeight;
    });
    for (const media of sortedMedias) {
      if (media.attributes['apiFramework']) {
        continue;
      }
      const adUrl = TXml.getContents(media);
      if (!adUrl) {
        continue;
      }
      interstitials.push({
        id: null,
        groupId: null,
        startTime: startTime,
        endTime: null,
        uri: adUrl,
        mimeType: media.attributes['type'] || null,
        isSkippable: skipOffset != null,
        skipOffset,
        skipFor: null,
        canJump: false,
        resumeOffset: 0,
        playoutLimit: null,
        once: true,
        pre: currentTime == null,
        post: currentTime == Infinity,
        timelineRange: false,
        loop: false,
        overlay: null,
        displayOnBackground: false,
        currentVideo: null,
        background: null,
        clickThroughUrl: clickThroughUrl,
      });
      break;
    }
  }

  /**
   * @param {!Array<shaka.extern.AdInterstitial>} interstitials
   * @param {?number} currentTime
   * @param {!shaka.extern.xml.Node} nonLinear
   * @private
   */
  static processNonLinearAd_(interstitials, currentTime, nonLinear) {
    const TXml = shaka.util.TXml;
    let mimeType = null;
    let resource = TXml.findChild(nonLinear, 'StaticResource');
    if (resource) {
      mimeType = resource.attributes['creativeType'];
    } else {
      resource = TXml.findChild(nonLinear, 'HTMLResource');
      if (!resource) {
        return;
      }
      mimeType = 'text/html';
    }
    let adUrl = TXml.getContents(resource);
    if (!adUrl) {
      return;
    }
    if (mimeType === 'text/html') {
      adUrl = 'data:text/html;charset=UTF-8,' + encodeURIComponent(adUrl);
    }
    const width = TXml.parseAttr(nonLinear, 'width', TXml.parseInt) ||
        TXml.parseAttr(nonLinear, 'expandedWidth', TXml.parseInt);
    const height = TXml.parseAttr(nonLinear, 'height', TXml.parseInt) ||
        TXml.parseAttr(nonLinear, 'expandedHeight', TXml.parseInt);
    if (!width && !height) {
      return;
    }
    let clickThroughUrl = null;
    const nonLinearClickThrough =
        TXml.findChild(nonLinear, 'NonLinearClickThrough');
    if (nonLinearClickThrough) {
      const clickUrl = TXml.getContents(nonLinearClickThrough);
      if (clickUrl) {
        clickThroughUrl = clickUrl;
      }
    }
    let playoutLimit = null;
    const minSuggestedDuration =
        nonLinear.attributes['minSuggestedDuration'];
    if (minSuggestedDuration) {
      playoutLimit = shaka.util.TextParser.parseTime(minSuggestedDuration);
    }
    let startTime = 0;
    if (currentTime != null) {
      startTime = currentTime;
    }
    interstitials.push({
      id: null,
      groupId: null,
      startTime: startTime,
      endTime: null,
      uri: adUrl,
      mimeType,
      isSkippable: false,
      skipOffset: null,
      skipFor: null,
      canJump: false,
      resumeOffset: 0,
      playoutLimit,
      once: true,
      pre: currentTime == null,
      post: currentTime == Infinity,
      timelineRange: false,
      loop: false,
      overlay: {
        viewport: {
          x: 0,
          y: 0,
        },
        topLeft: {
          x: 0,
          y: 0,
        },
        size: {
          x: width || 0,
          y: height || 0,
        },
      },
      displayOnBackground: false,
      currentVideo: null,
      background: null,
      clickThroughUrl: clickThroughUrl,
    });
  }

  /**
   * @param {!shaka.extern.xml.Node} vmap
   * @return {!Array<{time: ?number, uri: string}>}
   */
  static parseVMAP(vmap) {
    const TXml = shaka.util.TXml;
    /** @type {!Array<{time: ?number, uri: string}>} */
    const ads = [];
    for (const adBreak of TXml.findChildren(vmap, 'vmap:AdBreak')) {
      const timeOffset = adBreak.attributes['timeOffset'];
      if (!timeOffset) {
        continue;
      }
      let time = null;
      if (timeOffset == 'start') {
        time = null;
      } else if (timeOffset == 'end') {
        time = Infinity;
      } else {
        time = shaka.util.TextParser.parseTime(timeOffset);
      }
      const adSource = TXml.findChild(adBreak, 'vmap:AdSource');
      if (!adSource) {
        continue;
      }
      const adTagURI = TXml.findChild(adSource, 'vmap:AdTagURI');
      if (!adTagURI) {
        continue;
      }
      const uri = TXml.getTextContents(adTagURI);
      if (!uri) {
        continue;
      }
      ads.push({
        time,
        uri,
      });
    }
    return ads;
  }
};

/**
 * The event name for when a sequence of ads has been loaded.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.ADS_LOADED = 'ads-loaded';

/**
 * The event name for when an ad has started playing.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_STARTED = 'ad-started';


/**
 * The event name for when an ad playhead crosses first quartile.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_FIRST_QUARTILE = 'ad-first-quartile';


/**
 * The event name for when an ad playhead crosses midpoint.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_MIDPOINT = 'ad-midpoint';


/**
 * The event name for when an ad playhead crosses third quartile.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_THIRD_QUARTILE = 'ad-third-quartile';


/**
 * The event name for when an ad has completed playing.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_COMPLETE = 'ad-complete';


/**
 * The event name for when an ad has finished playing
 * (played all the way through, was skipped, or was unable to proceed
 * due to an error).
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_STOPPED = 'ad-stopped';


/**
 * The event name for when an ad is skipped by the user..
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_SKIPPED = 'ad-skipped';


/**
 * The event name for when the ad volume has changed.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_VOLUME_CHANGED = 'ad-volume-changed';


/**
 * The event name for when the ad was muted.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_MUTED = 'ad-muted';


/**
 * The event name for when the ad was paused.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_PAUSED = 'ad-paused';


/**
 * The event name for when the ad was resumed after a pause.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_RESUMED = 'ad-resumed';


/**
 * The event name for when the ad's skip status changes
 * (usually it becomes skippable when it wasn't before).
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_SKIP_STATE_CHANGED = 'ad-skip-state-changed';


/**
 * The event name for when the ad's cue points (start/end markers)
 * have changed.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.CUEPOINTS_CHANGED = 'ad-cue-points-changed';


/**
 * The event name for when the native IMA ad manager object has
 * loaded and become available.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.IMA_AD_MANAGER_LOADED = 'ima-ad-manager-loaded';


/**
 * The event name for when the native IMA stream manager object has
 * loaded and become available.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.IMA_STREAM_MANAGER_LOADED = 'ima-stream-manager-loaded';


/**
 * The event name for when the ad was clicked.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_CLICKED = 'ad-clicked';


/**
 * The event name for when there is an update to the current ad's progress.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_PROGRESS = 'ad-progress';


/**
 * The event name for when the ad is buffering.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_BUFFERING = 'ad-buffering';


/**
 * The event name for when the ad's URL was hit.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_IMPRESSION = 'ad-impression';


/**
 * The event name for when the ad's duration changed.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_DURATION_CHANGED = 'ad-duration-changed';


/**
 * The event name for when the ad was closed by the user.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_CLOSED = 'ad-closed';


/**
 * The event name for when the ad data becomes available.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_LOADED = 'ad-loaded';


/**
 * The event name for when all the ads were completed.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.ALL_ADS_COMPLETED = 'all-ads-completed';


/**
 * The event name for when the ad changes from or to linear.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_LINEAR_CHANGED = 'ad-linear-changed';


/**
 * The event name for when the ad's metadata becomes available.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_METADATA = 'ad-metadata';


/**
 * The event name for when the ad display encountered a recoverable
 * error.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_RECOVERABLE_ERROR = 'ad-recoverable-error';

/**
 * The event name for when the ad manager dispatch errors.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_ERROR = 'ad-error';

/**
 * The event name for when the client side SDK signalled its readiness
 * to play a VPAID ad or an ad rule.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_BREAK_READY = 'ad-break-ready';


/**
 * The event name for when the interaction callback for the ad was
 * triggered.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_INTERACTION = 'ad-interaction';


/**
 * The name of the event for when an ad requires the main content to be paused.
 * Fired when the platform does not support multiple media elements.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_CONTENT_PAUSE_REQUESTED = 'ad-content-pause-requested';


/**
 * The name of the event for when an ad requires the main content to be resumed.
 * Fired when the platform does not support multiple media elements.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_CONTENT_RESUME_REQUESTED = 'ad-content-resume-requested';


/**
 * The name of the event for when an ad requires the video of the main content
 * to be attached.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_CONTENT_ATTACH_REQUESTED = 'ad-content-attach-requested';

