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
   * @return {!Array.<shaka.extern.AdInterstitial>}
   */
  static parseVastToInterstitials(vast, currentTime) {
    const TXml = shaka.util.TXml;
    /** @type {!Array.<shaka.extern.AdInterstitial>} */
    const interstitials = [];

    let startTime = 0;
    if (currentTime != null) {
      startTime = currentTime;
    }

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
        if (!linear) {
          continue;
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
          continue;
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
          const adUrl = TXml.getTextContents(media);
          if (!adUrl) {
            continue;
          }
          interstitials.push({
            id: null,
            startTime: startTime,
            endTime: null,
            uri: adUrl,
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
          });
          break;
        }
      }
    }
    return interstitials;
  }

  /**
   * @param {!shaka.extern.xml.Node} vmap
   * @return {!Array.<{time: ?number, uri: string}>}
   */
  static parseVMAP(vmap) {
    const TXml = shaka.util.TXml;
    /** @type {!Array.<{time: ?number, uri: string}>} */
    const ads = [];
    for (const adBreak of TXml.findChildren(vmap, 'vmap:AdBreak')) {
      const timeOffset = adBreak.attributes['timeOffset'];
      if (!timeOffset) {
        continue;
      }
      let time = null;
      if (timeOffset == 'start') {
        time = 0;
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

