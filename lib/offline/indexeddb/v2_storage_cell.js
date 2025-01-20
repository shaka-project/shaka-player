/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.offline.indexeddb.V2StorageCell');

goog.require('shaka.offline.indexeddb.BaseStorageCell');
goog.require('shaka.util.PeriodCombiner');


/**
 * The V2StorageCell is for all stores that follow the shaka.externs V2 and V3
 * offline types.  V2 was introduced in Shaka Player v2.3.0 and quickly
 * replaced with V3 in Shaka Player v2.3.2.  V3 was then deprecated in v3.0.
 *
 * Upgrading from V1 to V2 initially broke the database in a way that prevented
 * adding new records.  The problem was with the upgrade process, not with the
 * database format.  Once database upgrades were removed, we increased the
 * database version to V3 and marked V2 as read-only.  Therefore, V2 and V3
 * databases can both be read by this cell.
 *
 * The manifest and segment stores didn't change in database V4, but a separate
 * table for session IDs was added.  So this cell also covers DB V4.
 *
 * @implements {shaka.extern.StorageCell}
 */
shaka.offline.indexeddb.V2StorageCell = class
  extends shaka.offline.indexeddb.BaseStorageCell {
  /**
   * @override
   * @param {shaka.extern.ManifestDBV2} old
   * @return {!Promise<shaka.extern.ManifestDB>}
   */
  async convertManifest(old) {
    const streamsPerPeriod = [];

    for (let i = 0; i < old.periods.length; ++i) {
      // The last period ends at the end of the presentation.
      const periodEnd = i == old.periods.length - 1 ?
          old.duration : old.periods[i + 1].startTime;
      const duration = periodEnd - old.periods[i].startTime;
      const streams = this.convertPeriod_(old.periods[i], duration);

      streamsPerPeriod.push(streams);
    }

    const streams = await shaka.util.PeriodCombiner.combineDbStreams(
        streamsPerPeriod);

    return {
      appMetadata: old.appMetadata,
      creationTime: 0,
      drmInfo: old.drmInfo,
      duration: old.duration,
      // JSON serialization turns Infinity into null, so turn it back now.
      expiration: old.expiration == null ? Infinity : old.expiration,
      originalManifestUri: old.originalManifestUri,
      sessionIds: old.sessionIds,
      size: old.size,
      streams,
      sequenceMode: false,
    };
  }

  /**
   * @param {shaka.extern.PeriodDBV2} period
   * @param {number} periodDuration
   * @return {!Array<shaka.extern.StreamDB>}
   * @private
   */
  convertPeriod_(period, periodDuration) {
    const streams = [];
    for (const stream of period.streams) {
      // The v4 version of the database as written by v2.5.0 - v2.5.9 might have
      // been corrupted slightly.  A bug caused the stream metadata from all
      // periods to be written to each period.  This was corrected in v2.5.10.
      // To fix this, we can identify the extra streams by their lack of
      // variantIds and skip them.
      if (stream.variantIds.length == 0) {
        continue;
      }

      streams.push(this.convertStream_(
          stream, period.startTime, period.startTime + periodDuration));
    }
    return streams;
  }

  /**
   * @param {shaka.extern.StreamDBV2} old
   * @param {number} periodStart
   * @param {number} periodEnd
   * @return {shaka.extern.StreamDB}
   * @private
   */
  convertStream_(old, periodStart, periodEnd) {
    return {
      id: old.id,
      originalId: old.originalId,
      groupId: null,
      primary: old.primary,
      type: old.contentType,
      mimeType: old.mimeType,
      codecs: old.codecs,
      frameRate: old.frameRate,
      pixelAspectRatio: old.pixelAspectRatio,
      hdr: undefined,
      colorGamut: undefined,
      videoLayout: undefined,
      kind: old.kind,
      language: old.language,
      originalLanguage: old.language || null,
      label: old.label,
      width: old.width,
      height: old.height,
      encrypted: old.encrypted,
      keyIds: new Set([old.keyId]),
      segments: old.segments.map((segment) =>
        this.convertSegment_(
            segment, old.initSegmentKey, periodStart, periodEnd,
            old.presentationTimeOffset)),
      variantIds: old.variantIds,
      roles: [],
      forced: false,
      audioSamplingRate: null,
      channelsCount: null,
      spatialAudio: false,
      closedCaptions: null,
      tilesLayout: undefined,
      external: false,
      fastSwitching: false,
      isAudioMuxedInVideo: false,
    };
  }

  /**
   * @param {shaka.extern.SegmentDBV2} old
   * @param {?number} initSegmentKey
   * @param {number} periodStart
   * @param {number} periodEnd
   * @param {number} presentationTimeOffset
   * @return {shaka.extern.SegmentDB}
   * @private
   */
  convertSegment_(
      old, initSegmentKey, periodStart, periodEnd, presentationTimeOffset) {
    const timestampOffset = periodStart - presentationTimeOffset;

    return {
      startTime: periodStart + old.startTime,
      endTime: periodStart + old.endTime,
      initSegmentKey,
      appendWindowStart: periodStart,
      appendWindowEnd: periodEnd,
      timestampOffset,
      dataKey: old.dataKey,
      tilesLayout: '',
      mimeType: null,
      codecs: null,
      thumbnailSprite: null,
    };
  }
};
