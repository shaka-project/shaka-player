/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.QualityObserver');

goog.require('shaka.media.IPlayheadObserver');

/**
 * When media quality changes for audio or video
 * content types, the onQualityChange listener is invoked
 * with the new quality info.
 *
 * @typedef {function(shaka.extern.MediaQualityInfo)}
 */
shaka.media.QualityObserver.EventListener;

/**
 * @typedef {{
 *   mediaQuality: !shaka.extern.MediaQualityInfo,
 *   position: !number
 * }}
 *
 * @description
 * Identifies the position of a media quality change in the
 * source buffer.
 *
 * @property {shaka.extern.MediaQualityInfo} !mediaQuality
 *   The new media quality for content after position in the source buffer.
 * @property {number} !position
 *   A position in seconds in the source buffer
 */
shaka.media.QualityObserver.QualityChange;

/**
 * @typedef {{
 *   qualityChanges: !Array.<shaka.media.QualityObserver.QualityChange>,
 *   currentQuality: ?shaka.extern.MediaQualityInfo
 * }}
 *
 * @description
 * Contains media quality information for a specific content type
 * e.g video or audio.
 *
 * @property {!Array.<shaka.media.QualityObserver.QualityChange>}
 * qualityChanges
 *   Quality changes ordered by position ascending.
 * @property {?shaka.media.MediaQualityInfo} currentMediaQuality
 *   The media quality at the playhead position.
 */
shaka.media.QualityObserver.ContentMediaQuality;

/**
 * Monitors the quality of content being appended to the source
 * buffers and fires onQualityChange events when the media quality
 * at the playhead changes.
 *
 * @implements {shaka.media.IPlayheadObserver}
 * @final
 */
shaka.media.QualityObserver = class {
  /**
   * Create a new QualityObserver
   *
   * @param {!function():!shaka.extern.BufferedInfo} getBufferedInfo
   *  Buffered info is needed to purge QualityChanges that are no
   * longer relevant.
   */
  constructor(getBufferedInfo) {
    /**
     * @private {!Map.<string,!shaka.media.QualityObserver.ContentMediaQuality>}
     */
    this.contentMediaQualities_ = new Map();

    /**
     *  @private {shaka.media.QualityObserver.EventListener}
     */
    this.onQualityChange_ = (mediaQuality) => {};

    /** @private function():!shaka.extern.BufferedInfo */
    this.getBufferedInfo_ = getBufferedInfo;
  }

  /**
   * Set all the listeners. This overrides any previous calls to |setListeners|.
   *
   * @param {shaka.media.QualityObserver.EventListener} onQualityChange
   */
  setListeners(onQualityChange) {
    this.onQualityChange_ = onQualityChange;
  }

  /** @override */
  release() {
    this.contentMediaQualities_.clear();
  }

  /**
   * Get the ContenMedaiQuality for a contentType, creating a new
   * one if necessary.
   *
   * @param {!string} contentType
   *  The contend type e.g. "video" or "audio".
   * @return {!shaka.media.QualityObserver.ContentMediaQuality}
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
   * Adds a MediaQualityChange for the contentType identified by
   * the mediaQuality.contentType.
   *
   * @param {!shaka.extern.MediaQualityInfo} mediaQuality
   * @param {!number} position
   *  Position in seconds of the quality change.
   */
  addMediaQualityChange(mediaQuality, position) {
    // Remove unneeded QualityChanges BEFORE adding the new one
    this.purgeQualityChangesForContentType_(
        this.getBufferedInfo_(), mediaQuality.contentType);
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
   * Determines the media quality at a specific position in the source buffer.
   *
   * @param {!number} position
   *  Position in seconds
   * @param {!shaka.media.QualityObserver.ContentMediaQuality}
   *  contentMediaQuality
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
   * Determines if two MediaQualityInfo objects are the same or not.
   *
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
        shaka.media.QualityObserver.getMediaQualityAtPosition_(
            positionInSeconds, contentMediaQuality);
      if (mediaQualityAtPosition &&
          !shaka.media.QualityObserver.mediaQualitiesAreTheSame_(
              contentMediaQuality.currentQuality, mediaQualityAtPosition)) {
        contentMediaQuality.currentQuality = mediaQualityAtPosition;
        this.onQualityChange_(mediaQualityAtPosition);
      }
    }
  }

  /**
   * Removes the QualityChange(s) that are not relevant to the buffered
   * content of a specific content type
   *
   * @param {!shaka.extern.BufferedInfo} bufferedInfo
   * @param {!string} contentType
   * @private
   */
  purgeQualityChangesForContentType_(bufferedInfo, contentType) {
    const contentMediaQuality = this.getContentMediaQuality_(contentType);
    const bufferedRanges = bufferedInfo[contentType];
    if (bufferedRanges && bufferedRanges.length > 0) {
      const bufferStart = bufferedRanges[0].start;
      const bufferEnd = bufferedRanges[bufferedRanges.length - 1].end;
      const oldQualityChanges = contentMediaQuality.qualityChanges;
      contentMediaQuality.qualityChanges =
        oldQualityChanges.filter(
            (qualityChange, index) => {
              // Remove quality changes that are prior to the bufferStart
              // when the next quality change is also before the bufferStart.
              if ((qualityChange.position <= bufferStart) &&
                (index + 1 < oldQualityChanges.length) &&
                (oldQualityChanges[index + 1].position <= bufferStart)) {
                return false;
              }
              // Remove quality changes that are after the bufferEnd
              if ((qualityChange.position >= bufferEnd) &&
                (index < oldQualityChanges.length - 1)) {
                return false;
              }
              return true;
            });
    }
  }
};

