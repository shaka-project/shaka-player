/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.TimestampOffsetCorrector');

goog.require('shaka.log');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.Mp4SegmentParsers');

/**
 * Corrects the timestampOffset in SegmentReference(s) by
 * comparing the expected and actual media times and adjusting
 * the timestampOffset accordingly.
 */
shaka.media.TimestampOffsetCorrector = class {
  /**
   * Create new instance
   * @param {function(!Event)} onEvent Called when an event is raised to be sent
   *   to the application.
   */
  constructor(onEvent) {
    /**
     * Maps a contentType, e.g., 'audio', 'video', or 'text'
     * to the data needed to correct timestampOffset.
     *
     * @private {!Map<shaka.util.ManifestParserUtils.ContentType,
     *                !shaka.media.TimestampOffsetCorrector.MediaData_>}
     */
    this.contentTypeMediaData_ = new Map();

    /** @private {?shaka.extern.StreamingConfiguration} */
    this.config_ = null;

    /** @private {?function(!Event)} */
    this.onEvent_ = onEvent;
  }

  /**
   * Configure timestamp offset corrector
   *
   * @param {shaka.extern.StreamingConfiguration} config
   */
  configure(config) {
    this.config_ = config;
  }

  /**
   * Returns MediaData for a content type.
   *
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @return {!shaka.media.TimestampOffsetCorrector.MediaData_}
   * @private
   */
  getMediaData_(contentType) {
    if (this.contentTypeMediaData_.has(contentType)) {
      return this.contentTypeMediaData_.get(contentType);
    }
    /** @type {Map<number,number>} */
    const trackTimescales = new Map();

    /** @type {shaka.media.TimestampOffsetCorrector.MediaData_} */
    const mediaData = {
      timestampOffset: null,
      originalTimestampOffset: null,
      trackTimescales: trackTimescales,
    };
    this.contentTypeMediaData_.set(contentType, mediaData);
    return mediaData;
  }

  /**
   * Applies corrected timestamp offset to a segment reference
   *
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   *   The contentType of the segment reference e.g. 'audio', 'video'
   * @param {shaka.media.SegmentReference} reference
   *   A media segment reference
   */
  correctTimestampOffset(contentType, reference) {
    const mediaData = this.getMediaData_(contentType);

    // If the original timestampOffset has not changed since we
    // last determined the correct timestamp offset then
    // correct the timestamp offset in the segment reference.
    if (mediaData.timestampOffset !== null &&
        mediaData.originalTimestampOffset !== null &&
        reference.timestampOffset === mediaData.originalTimestampOffset) {
      reference.timestampOffset = mediaData.timestampOffset;
    }
  }


  /**
   * Detects discrepancies in timestamp offset and saves that info for
   * use in correctTimestampOffset().
   *
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   *   The contentType of the segment reference e.g. 'audio', 'video'
   * @param {shaka.media.SegmentReference} reference
   *   A media segment reference
   * @param {BufferSource} segmentData
   *   The data for a media segment
   * @return {boolean} true if the timestampOffset has not already been
   *   corrected and we detect a discrepancy in the timestampOffset.
   */
  checkTimestampOffset(contentType, reference, segmentData) {
    const mediaData = this.getMediaData_(contentType);

    // If timestampOffset has already been corrected do nothing.
    if (mediaData.timestampOffset !== null &&
        mediaData.timestampOffset === reference.timestampOffset) {
      return false;
    }

    const segmentStartTime =
        shaka.util.Mp4SegmentParsers.parseBaseMediaDecodeTime(
            segmentData,
            mediaData.trackTimescales) +
        reference.timestampOffset;
    const timestampDiscrepancy =
        segmentStartTime - reference.getStartTime();

    mediaData.originalTimestampOffset = reference.timestampOffset;
    let correctedTimestampOffset = reference.timestampOffset;

    let timestampOffsetChanged = false;
    if (Math.abs(timestampDiscrepancy) >
        this.config_.maxTimestampDiscrepancy) {
      correctedTimestampOffset =
          reference.timestampOffset - timestampDiscrepancy;
      shaka.log.debug('timestamp discrepancy detected ',
          'contentType', contentType,
          'segmentStartTime', segmentStartTime,
          'reference.getStartTime()', reference.getStartTime(),
          'timestampDiscrepancy', timestampDiscrepancy,
          'originalTimestampOffset', reference.timestampOffset,
          'correctedTimestampOffset', correctedTimestampOffset);

      const timestampCorrectedEvent =
          new shaka.util.FakeEvent('timestampcorrected', new Map([
            ['contentType', contentType],
            ['segmentStartTime', segmentStartTime],
            ['referenceStartTime', reference.getStartTime()],
            ['timestampDiscrepancy', timestampDiscrepancy],
          ]));
      this.onEvent_(timestampCorrectedEvent);
      timestampOffsetChanged = true;
    }
    reference.timestampOffset = correctedTimestampOffset;
    mediaData.timestampOffset = correctedTimestampOffset;
    return timestampOffsetChanged;
  }

  /**
   * Parses timescales from an init segment
   *
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @param {BufferSource} initSegment
   */
  parseTimescalesFromInitSegment(contentType, initSegment) {
    const trackTimescales =
        shaka.util.Mp4SegmentParsers.parseTrackTimescales(initSegment);

    const mediaData = this.getMediaData_(contentType);
    mediaData.trackTimescales = trackTimescales;
  }
};

/**
 * @typedef {{
 *   timestampOffset: ?number,
 *   trackTimescales: Map<number,number>,
 *   originalTimestampOffset: ?number
 * }}
 *
 * @description
 * Contains information needed to correct the timestampOffset
 * for a specific media type.
 *
 * @property {?number} timestampOffset
 *   The timestampOffset being used for this media type
 * @property {!Map<number,number>} trackTimescales
 *   Map of trackId to timescale for this media type
 * @property {?number} originalTimestampOffset
 *   The original value of tiemstampOffset before correcting for
 *   this media type.
 */
shaka.media.TimestampOffsetCorrector.MediaData_;

