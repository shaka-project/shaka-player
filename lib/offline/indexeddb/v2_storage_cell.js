/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.offline.indexeddb.V2StorageCell');

goog.require('shaka.offline.indexeddb.BaseStorageCell');
goog.require('shaka.util.Periods');


/**
 * The V2StorageCell is for all stores that follow the shaka.externs V2 and V3
 * offline types.  V2 was introduced in Shaka Player v2.3.0 and quickly
 * replaced with V3 in Shaka Player v2.3.2.  V3 was then deprecated in v2.6.
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
   * @return {shaka.extern.ManifestDB}
   */
  convertManifest(old) {
    const streamsPerPeriod = [];

    for (let i = 0; i < old.periods.length; ++i) {
      // The last period ends at the end of the presentation.
      const periodEnd = i == old.periods.length - 1 ?
          old.duration : old.periods[i + 1].startTime;
      const duration = periodEnd - old.periods[i].startTime;
      const streams = this.convertPeriod_(old.periods[i], duration);

      streamsPerPeriod.push(streams);
    }

    return {
      appMetadata: old.appMetadata,
      drmInfo: old.drmInfo,
      duration: old.duration,
      // JSON serialization turns Infinity into null, so turn it back now.
      expiration: old.expiration == null ? Infinity : old.expiration,
      originalManifestUri: old.originalManifestUri,
      sessionIds: old.sessionIds,
      size: old.size,
      streams: shaka.util.Periods.stitchStreamDBs(streamsPerPeriod),
    };
  }

  /**
   * @param {shaka.extern.PeriodDBV2} period
   * @param {number} periodDuration
   * @return {!Array.<shaka.extern.StreamDB>}
   * @private
   */
  convertPeriod_(period, periodDuration) {
    return period.streams.map((stream) => this.convertStream_(
        stream, period.startTime, period.startTime + periodDuration));
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
      primary: old.primary,
      contentType: old.contentType,
      mimeType: old.mimeType,
      codecs: old.codecs,
      frameRate: old.frameRate,
      pixelAspectRatio: old.pixelAspectRatio,
      kind: old.kind,
      language: old.language,
      label: old.label,
      width: old.width,
      height: old.height,
      encrypted: old.encrypted,
      keyIds: [old.keyId],
      segments: old.segments.map((segment) =>
        this.convertSegment_(
            segment, old.initSegmentKey, periodStart, periodEnd,
            old.presentationTimeOffset)),
      variantIds: old.variantIds,
      roles: [],
      audioSamplingRate: null,
      channelsCount: null,
      closedCaptions: null,
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
    };
  }
};
