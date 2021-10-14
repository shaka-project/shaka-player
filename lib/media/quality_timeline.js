/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.QualityTimeline');

goog.require('shaka.media.IPlayheadObserver');

/**
 * TODO
 *
 * @typedef {function(shaka.extern.MediaQualityInfo)}
 */
shaka.media.QualityTimeline.EventListener;

/**
 * @typedef {{
 *   mediaQuality: !shaka.extern.MediaQualityInfo,
 *   position: !number
 * }}
 *
 * @description
 * TODO
 *
 * @property {shaka.extern.MediaQualityInfo} !mediaQuality
 *   TODO
 * @property {number} !position
 *   TODO
 */
shaka.media.MediaQualityChange;

/**
 * @typedef {{
 *   qualityChanges: !Array.<shaka.media.MediaQualityChange>,
 *   currentQuality: ?shaka.extern.MediaQualityInfo
 * }}
 *
 * @description
 * TODO
 *
 * @property {!Array.<shaka.media.MediaQualityChange>} qualityChanges
 *   In ascending order of the position field
 * @property {?shaka.media.MediaQualityInfo} currentMediaQuality
 *   TODO
 */
shaka.media.ContentMediaQuality;

/**
 * TODO
 *
 * @implements {shaka.media.IPlayheadObserver}
 * @final
 */
shaka.media.QualityTimeline = class {
  /**
   *  TODO
   */
  constructor() {
    /**
     * @private {!Map.<string,
     *                 !shaka.media.ContentMediaQuality>}
     */
    this.contentMediaQualities_ = new Map();

    /**
     *  @private {shaka.media.QualityTimeline.EventListener}
     */
    this.onQualityChange_ = (mediaQuality) => {};
  }

  /**
   * Set all the listeners. This overrides any previous calls to |setListeners|.
   *
   * @param {shaka.media.QualityTimeline.EventListener} onQualityChange
   * TODO
   */
  setListeners(onQualityChange) {
    this.onQualityChange_ = onQualityChange;
  }

  /** @override */
  release() {
    this.contentMediaQualities_.clear();
  }

  /**
   * TODO
   * @param {!string} contentType
   * @return {!shaka.media.ContentMediaQuality}
   * @private
   */
  getContentMediaQuality_(contentType) {
    let contentMediaQuality = this.contentMediaQualities_.get(contentType);
    if (!contentMediaQuality) {
      contentMediaQuality = {
        qualityChanges: [],
        currentQuality: null,
      };
      this.contentMediaQualities_.set(contentType, contentMediaQuality);
    }
    return contentMediaQuality;
  }

  /**
   * TODO
   * @param {!shaka.extern.MediaQualityInfo} mediaQuality
   * @param {!number} position
   */
  addMediaQualityChange(mediaQuality, position) {
    const newQualityChange = {
      mediaQuality: mediaQuality,
      position: position,
    };
    const contentMediaQuality =
      this.getContentMediaQuality_(mediaQuality.contentType);
    const insertBeforeIndex =
      contentMediaQuality.qualityChanges.findIndex((qualityChange) =>
        (qualityChange.position > position));
    if (insertBeforeIndex >= 0) {
      contentMediaQuality.qualityChanges.splice(
          insertBeforeIndex, 0, newQualityChange);
    } else {
      contentMediaQuality.qualityChanges.push(newQualityChange);
    }
  }

  /**
   * TODO
   * @param {!number} position
   * @param {!shaka.media.ContentMediaQuality} contentMediaQuality
   * @return {?shaka.extern.MediaQualityInfo}
   * @private
   */
  static getMediaQualityAtPosition_(position, contentMediaQuality) {
    for (let i = contentMediaQuality.qualityChanges.length -1; i >= 0; i--) {
      const mediaQualityChange = contentMediaQuality.qualityChanges[i];
      if (mediaQualityChange.position <= position) {
        return mediaQualityChange.mediaQuality;
      }
    }
    return null;
  }

  /**
   * TODO
   * @param {?shaka.extern.MediaQualityInfo} mq1
   * @param {?shaka.extern.MediaQualityInfo} mq2
   * @return {boolean}
   * @private
   */
  static mediaQualitiesAreTheSame_(mq1, mq2) {
    if (!mq1 || !mq2) {
      return false;
    }
    if (mq1 === mq2) {
      return true;
    }
    return (mq1.bandwidth != mq2.bandwidth) &&
      (mq1.audioSamplingRate != mq2.audioSamplingRate) &&
      (mq1.codecs != mq2.codecs) &&
      (mq1.contentType != mq2.contentType) &&
      (mq1.frameRate != mq2.frameRate) &&
      (mq1.height != mq2.height) &&
      (mq1.mimeType != mq2.mimeType) &&
      (mq1.numChannels != mq2.numChannels) &&
      (mq1.pixelAspectRatio != mq2.pixelAspectRatio) &&
      (mq1.width != mq2.width);
  }

  /** @override */
  poll(positionInSeconds, wasSeeking) {
    for (const contentMediaQuality of this.contentMediaQualities_.values()) {
      const mediaQualityAtPosition =
        shaka.media.QualityTimeline.getMediaQualityAtPosition_(
            positionInSeconds, contentMediaQuality);
      if (mediaQualityAtPosition &&
          !shaka.media.QualityTimeline.mediaQualitiesAreTheSame_(
              contentMediaQuality.currentQuality, mediaQualityAtPosition)) {
        contentMediaQuality.currentQuality = mediaQualityAtPosition;
        this.onQualityChange_(mediaQualityAtPosition);
      }
    }
  }

  /**
   *
   * @param {{shaka.extern.BufferedInfo}} bufferedInfo
   */
  purge(bufferedInfo) {
    for (const contentType of this.contentMediaQualities_.keys()) {
      const contentMediaQuality = this.contentMediaQualities_.get(contentType);
      const bufferedRanges = bufferedInfo[contentType];
      if (bufferedRanges && bufferedRanges.length > 0) {
        const bufferStart = bufferedRanges[0].start;
        const bufferEnd = bufferedRanges[bufferedRanges.length - 1].end;
        const oldQualityChanges = contentMediaQuality.qualityChanges;
        contentMediaQuality.qualityChanges =
          oldQualityChanges.filter(
              (qualityChange, index) => {
                // Keep at most one quality change prior to the buffer start
                if ((qualityChange.position <= bufferStart) &&
                  (index + 1 < oldQualityChanges.length) &&
                  (oldQualityChanges[index + 1].position <= bufferStart)) {
                  return false;
                }
                // Keep at most one quality change after the buffer end
                if ((qualityChange.position >= bufferEnd) &&
                  (index > 0) &&
                  (oldQualityChanges[index - 1].position >= bufferEnd)) {
                  return false;
                }
                return true;
              });
      }
    }
  }
};

