/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.QualityObserver');

goog.require('shaka.media.IPlayheadObserver');
goog.require('shaka.log');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');

/**
 * Monitors the quality of content being appended to the source buffers and
 * fires 'qualitychange' events when the media quality at the playhead changes.
 *
 * @implements {shaka.media.IPlayheadObserver}
 * @final
 */
shaka.media.QualityObserver = class extends shaka.util.FakeEventTarget {
  /**
   * Creates a new QualityObserver.
   *
   * @param {!function():!shaka.extern.BufferedInfo} getBufferedInfo
   *   Buffered info is needed to purge QualityChanges that are no
   *   longer relevant.
   */
  constructor(getBufferedInfo) {
    super();

    /**
     * @private {!Map.<string,!shaka.media.QualityObserver.ContentTypeState>}
     */
    this.contentTypeStates_ = new Map();

    /** @private function():!shaka.extern.BufferedInfo */
    this.getBufferedInfo_ = getBufferedInfo;
  }

  /** @override */
  release() {
    this.contentTypeStates_.clear();
    super.release();
  }

  /**
   * Get the ContenTypeState for a contentType, creating a new
   * one if necessary.
   *
   * @param {!string} contentType
   *  The contend type e.g. "video" or "audio".
   * @return {!shaka.media.QualityObserver.ContentTypeState}
   * @private
   */
  getContentTypeState_(contentType) {
    let contentTypeState = this.contentTypeStates_.get(contentType);
    if (!contentTypeState) {
      contentTypeState = {
        qualityChangePositions: [],
        currentQuality: null,
        contentType: contentType,
      };
      this.contentTypeStates_.set(contentType, contentTypeState);
    }
    return contentTypeState;
  }

  /**
   * Adds a QualityChangePosition for the contentType identified by
   * the mediaQuality.contentType.
   *
   * @param {!shaka.extern.MediaQualityInfo} mediaQuality
   * @param {!number} position
   *  Position in seconds of the quality change.
   */
  addMediaQualityChange(mediaQuality, position) {
    const contentTypeState =
      this.getContentTypeState_(mediaQuality.contentType);

    // Remove unneeded QualityChangePosition(s) before adding the new one
    this.purgeQualityChangePositions_(contentTypeState);

    const newChangePosition = {
      mediaQuality: mediaQuality,
      position: position,
    };

    const changePositions = contentTypeState.qualityChangePositions;
    const insertBeforeIndex = changePositions.findIndex(
        (qualityChange) => (qualityChange.position >= position));

    if (insertBeforeIndex >= 0) {
      const duplicatePositions =
        (changePositions[insertBeforeIndex].position == position) ? 1 : 0;
      changePositions.splice(
          insertBeforeIndex, duplicatePositions, newChangePosition);
    } else {
      changePositions.push(newChangePosition);
    }
  }

  /**
   * Determines the media quality at a specific position in the source buffer.
   *
   * @param {!number} position
   *  Position in seconds
   * @param {!shaka.media.QualityObserver.ContentTypeState} contentTypeState
   * @return {?shaka.extern.MediaQualityInfo}
   * @private
   */
  static getMediaQualityAtPosition_(position, contentTypeState) {
    // The qualityChangePositions must be ordered by position ascending
    // Find the last QualityChangePosition prior to the position
    const changePositions = contentTypeState.qualityChangePositions;
    for (let i = changePositions.length - 1; i >= 0; i--) {
      const qualityChange = changePositions[i];
      if (qualityChange.position <= position) {
        return qualityChange.mediaQuality;
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
    if (mq1 === mq2) {
      return true;
    }
    if (!mq1 || !mq2) {
      return false;
    }
    return (mq1.bandwidth == mq2.bandwidth) &&
      (mq1.audioSamplingRate == mq2.audioSamplingRate) &&
      (mq1.codecs == mq2.codecs) &&
      (mq1.contentType == mq2.contentType) &&
      (mq1.frameRate == mq2.frameRate) &&
      (mq1.height == mq2.height) &&
      (mq1.mimeType == mq2.mimeType) &&
      (mq1.channelsCount == mq2.channelsCount) &&
      (mq1.pixelAspectRatio == mq2.pixelAspectRatio) &&
      (mq1.width == mq2.width);
  }

  /** @override */
  poll(positionInSeconds, wasSeeking) {
    for (const contentTypeState of this.contentTypeStates_.values()) {
      const qualityAtPosition =
        shaka.media.QualityObserver.getMediaQualityAtPosition_(
            positionInSeconds, contentTypeState);
      if (qualityAtPosition &&
          !shaka.media.QualityObserver.mediaQualitiesAreTheSame_(
              contentTypeState.currentQuality, qualityAtPosition)) {
        if (this.positionIsBuffered_(
            positionInSeconds, qualityAtPosition.contentType)) {
          contentTypeState.currentQuality = qualityAtPosition;

          shaka.log.debug('Media quality changed at position ' +
            positionInSeconds + ' ' + JSON.stringify(qualityAtPosition));

          const event = new shaka.util.FakeEvent('qualitychange', new Map([
            ['quality', qualityAtPosition],
            ['position', positionInSeconds],
          ]));
          this.dispatchEvent(event);
        }
      }
    }
  }

  /**
   * Determine if a position is buffered for a given content type.
   *
   * @param {!number} position
   * @param {!string} contentType
   * @private
   */
  positionIsBuffered_(position, contentType) {
    const bufferedInfo = this.getBufferedInfo_();
    const bufferedRanges = bufferedInfo[contentType];
    if (bufferedRanges && bufferedRanges.length > 0) {
      const bufferStart = bufferedRanges[0].start;
      const bufferEnd = bufferedRanges[bufferedRanges.length - 1].end;
      if (position >= bufferStart && position < bufferEnd) {
        return true;
      }
    }
    return false;
  }

  /**
   * Removes the QualityChangePosition(s) that are not relevant to the buffered
   * content of the specified contentType. Note that this function is
   * invoked just before adding the quality change info associated with
   * the next media segment to be appended.
   *
   * @param {!shaka.media.QualityObserver.ContentTypeState} contentTypeState
   * @private
   */
  purgeQualityChangePositions_(contentTypeState) {
    const bufferedInfo = this.getBufferedInfo_();
    const bufferedRanges = bufferedInfo[contentTypeState.contentType];

    if (bufferedRanges && bufferedRanges.length > 0) {
      const bufferStart = bufferedRanges[0].start;
      const bufferEnd = bufferedRanges[bufferedRanges.length - 1].end;
      const oldChangePositions = contentTypeState.qualityChangePositions;
      contentTypeState.qualityChangePositions =
        oldChangePositions.filter(
            (qualityChange, index) => {
              // Remove all but last quality change before bufferStart.
              if ((qualityChange.position <= bufferStart) &&
                (index + 1 < oldChangePositions.length) &&
                (oldChangePositions[index + 1].position <= bufferStart)) {
                return false;
              }
              // Remove all quality changes after bufferEnd.
              if (qualityChange.position >= bufferEnd) {
                return false;
              }
              return true;
            });
    } else {
      // Nothing is buffered; so remove all quality changes.
      contentTypeState.qualityChangePositions = [];
    }
  }
};

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
shaka.media.QualityObserver.QualityChangePosition;

/**
  * @typedef {{
  *  qualityChangePositions:
  *   !Array.<shaka.media.QualityObserver.QualityChangePosition>,
  *  currentQuality: ?shaka.extern.MediaQualityInfo,
  *  contentType: !string
  * }}
  *
  * @description
  * Contains media quality information for a specific content type
  * e.g video or audio.
  *
  * @property {!Array.<shaka.media.QualityObserver.QualityChangePosition>}
  * qualityChangePositions
  *   Quality changes ordered by position ascending.
  * @property {?shaka.media.MediaQualityInfo} currentMediaQuality
  *   The media quality at the playhead position.
  * @property {string} contentType
  *   The contentType e.g. 'video' or 'audio'
  */
shaka.media.QualityObserver.ContentTypeState;
