/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.offline.DownloadInfo');

goog.require('shaka.util.Networking');
goog.require('shaka.util.Uint8ArrayUtils');
goog.requireType('shaka.media.InitSegmentReference');
goog.requireType('shaka.media.SegmentReference');


/**
 * An object that represents a single segment, that the storage system will soon
 * download, but has not yet started downloading.
 */
shaka.offline.DownloadInfo = class {
  /**
   * @param {shaka.media.SegmentReference|shaka.media.InitSegmentReference} ref
   * @param {number} estimateId
   * @param {number} groupId
   * @param {boolean} isInitSegment
   * @param {number} refPosition
   */
  constructor(ref, estimateId, groupId, isInitSegment, refPosition) {
    /** @type {shaka.media.SegmentReference|shaka.media.InitSegmentReference} */
    this.ref = ref;

    /** @type {number} */
    this.estimateId = estimateId;

    /** @type {number} */
    this.groupId = groupId;

    /** @type {boolean} */
    this.isInitSegment = isInitSegment;

    /** @type {number} */
    this.refPosition = refPosition;
  }

  /**
   * Creates an ID that encapsulates all important information in the ref, which
   * can then be used to check for equality.
   * @param {shaka.media.SegmentReference|shaka.media.InitSegmentReference} ref
   * @return {string}
   */
  static idForSegmentRef(ref) {
    const segmentData = ref.getSegmentData(/* allowDeleteOnSingleUse= */ false);
    if (segmentData) {
      return shaka.util.Uint8ArrayUtils.toBase64(segmentData);
    }
    // Escape the URIs using encodeURI, to make sure that a weirdly formed URI
    // cannot cause two unrelated refs to be considered equivalent.
    const removeSprites = (uri) => {
      return uri.split('#xywh=')[0];
    };
    return ref.getUris().map(
        (uri) => '{' + encodeURI(removeSprites(uri)) + '}').join('') +
        ':' + ref.startByte + ':' + ref.endByte;
  }

  /** @return {string} */
  getRefId() {
    return shaka.offline.DownloadInfo.idForSegmentRef(this.ref);
  }

  /**
   * @param {shaka.extern.PlayerConfiguration} config
   * @return {!shaka.extern.Request}
   */
  makeSegmentRequest(config) {
    return shaka.util.Networking.createSegmentRequest(
        this.ref.getUris(),
        this.ref.startByte,
        this.ref.endByte,
        config.streaming.retryParameters);
  }
};
