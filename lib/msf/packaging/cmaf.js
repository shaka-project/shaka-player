/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.packaging.Cmaf');

goog.require('shaka.log');
goog.require('shaka.media.InitSegmentReference');
goog.require('shaka.media.SegmentUtils');
goog.require('shaka.msf.PackagingRegistry');


/**
 * Packaging for CMAF tracks, where every MoQT object is one CMAF chunk.
 *
 * A chunk carries its own `moof`, so an object is self-describing: its timing
 * comes out of the chunk itself and it can be appended on its own. That makes
 * this the simplest packaging -- one object in, one segment out -- and the
 * lowest latency one, since nothing has to be accumulated.
 *
 * @see https://datatracker.ietf.org/doc/draft-ietf-moq-cmsf/
 *
 * @implements {shaka.extern.MsfPackaging}
 * @final
 */
shaka.msf.packaging.Cmaf = class {
  constructor() {
    /** @private {number} */
    this.timescale_ = 0;
  }

  /**
   * @override
   */
  describeTrack(track, initData) {
    const basicInfo = shaka.media.SegmentUtils.getBasicInfoFromMp4(
        initData, initData, /* disableText= */ false);
    if (!basicInfo) {
      return null;
    }

    const timescale = basicInfo.timescale || track.timescale;
    if (!timescale) {
      shaka.log.info(
          'Skipping incompatible track due missing timescale', track);
      return null;
    }
    this.timescale_ = timescale;

    return {
      basicInfo,
      initSegmentReference: new shaka.media.InitSegmentReference(
          () => [],
          /* startBytes= */ 0,
          /* endBytes= */ null,
          /* mediaQuality= */ null,
          timescale,
          initData),
    };
  }

  /**
   * @override
   */
  createSegmenter() {
    return new shaka.msf.packaging.CmafSegmenter(this.timescale_);
  }
};


/**
 * @implements {shaka.extern.MsfSegmenter}
 * @final
 */
shaka.msf.packaging.CmafSegmenter = class {
  /**
   * @param {number} timescale
   */
  constructor(timescale) {
    /** @private {number} */
    this.timescale_ = timescale;
  }

  /**
   * @override
   */
  push(obj) {
    if (!obj.data.byteLength) {
      return [];
    }

    const info = shaka.media.SegmentUtils.getStartTimeAndDurationFromMp4(
        obj.data, this.timescale_);
    if (!info.duration) {
      return [];
    }

    return [{
      startTime: info.startTime,
      duration: info.duration,
      data: obj.data,
      timestampOffset: 0,
      discontinuitySequence: -1,
    }];
  }
};


shaka.msf.PackagingRegistry.registerPackaging(
    'cmaf', () => new shaka.msf.packaging.Cmaf());

shaka.msf.PackagingRegistry.registerPackaging(
    'chunk-per-object', () => new shaka.msf.packaging.Cmaf());
