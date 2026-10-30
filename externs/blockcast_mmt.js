/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for libmmt, the MMTP library the MMTP packaging is
 * built on.
 *
 * libmmt's `@blockcast/mmt-container` package ships a classic script,
 * `dist/mmtp-container-parser.no-modules.js`, that installs a single
 * `BlockcastMmt` global. Only the members the packaging calls are declared
 * here; the rest of that surface is libmmt's to change.
 *
 * @externs
 */


// This empty namespace is declared to check if libmmt is loaded.
/** @const */
var BlockcastMmt = {};


/**
 * Validates a CMSF/MMTP catalog against libmmt's catalog contract and returns
 * it. Throws BlockcastMmt.CmsfCatalogValidationError naming the offending
 * field when it does not conform.
 *
 * @param {!Object} catalog
 * @return {!Object}
 */
BlockcastMmt.validateCmsfMmtpCatalog = function(catalog) {};


/**
 * The MFU reassembly policy for a reliable MoQT subscription, which runs
 * without a clock: an Object is never lost on a stream, so a fragment run is
 * complete once its last fragment arrives, however late.
 *
 * @return {!Object}
 */
BlockcastMmt.reliableMoqMfuReassembly = function() {};


/**
 * @typedef {{
 *   type: string,
 *   codec: string,
 * }}
 */
BlockcastMmt.TrackInfo;


/**
 * @typedef {{
 *   reassemblyPolicy: !Object,
 *   defaultTrack: !BlockcastMmt.TrackInfo,
 * }}
 */
BlockcastMmt.ParserConfig;


/**
 * Media timing exactly as the publisher authored it in its movie fragments,
 * in the track's media timescale.
 *
 * @typedef {{
 *   decodeTime: bigint,
 *   presentationTime: bigint,
 *   durationTicks: number,
 *   mediaTimescale: number,
 * }}
 */
BlockcastMmt.AuthoredTiming;


/**
 * @typedef {{
 *   packetId: number,
 * }}
 */
BlockcastMmt.PacketInfo;


/**
 * What one MMTP packet amounted to. `kind` is one of 'init', 'fragment',
 * 'pending', 'frame', 'repair', 'non-media' or 'rejected'; `data` is present
 * for 'init', 'fragment' and 'frame'.
 *
 * @typedef {{
 *   kind: string,
 *   packet: !BlockcastMmt.PacketInfo,
 *   data: (!Uint8Array|undefined),
 * }}
 */
BlockcastMmt.ParserRecord;


/**
 * @typedef {{
 *   keyframe: boolean,
 *   packetId: number,
 *   authoredTiming: (BlockcastMmt.AuthoredTiming|undefined),
 * }}
 */
BlockcastMmt.FrameMeta;


/**
 * Parses MMTP packets and reassembles their media fragment units into whole
 * samples.
 */
BlockcastMmt.MmtpContainerParser = class {
  /** @param {!BlockcastMmt.ParserConfig} config */
  constructor(config) {
    /**
     * Why the last feed() produced the record it did: the record's kind, or
     * 'drop:<reason>' when it produced none.
     * @type {?string}
     */
    this.lastFeedOutcome;

    /**
     * Counts of samples the parser completed but did not deliver, keyed by
     * reason, e.g. droppedBeforeStartupKeyframe.
     * @type {!Object<string, number>}
     */
    this.reorderStats;
  }

  /**
   * @param {!Uint8Array} packet
   * @return {?BlockcastMmt.ParserRecord}
   */
  feed(packet) {}

  /**
   * @param {function(!Uint8Array, !BlockcastMmt.FrameMeta)} callback
   */
  onFrame(callback) {}

  dispose() {}
};


/**
 * Wraps raw samples in CMAF movie fragments.
 */
BlockcastMmt.MmtpToCmaf = class {
  /**
   * @param {number} trackId
   * @param {number} timescale
   */
  setVideoTrackParams(trackId, timescale) {}

  /** @param {number} timescale */
  setAudioTimescale(timescale) {}

  /**
   * @param {!Array<{
   *   data: !Uint8Array,
   *   duration: number,
   *   keyframe: boolean,
   *   compositionTimeOffset: (number|undefined),
   * }>} samples
   * @param {number} baseDecodeTime
   * @param {number=} trackId
   * @return {!Uint8Array}
   */
  wrapVideoSamples(samples, baseDecodeTime, trackId) {}

  /**
   * @param {!Array<{
   *   data: !Uint8Array,
   *   duration: number,
   *   compositionTimeOffset: (number|undefined),
   * }>} samples
   * @param {number} baseDecodeTime
   * @param {number=} trackId
   * @return {!Uint8Array}
   */
  wrapAudioSamples(samples, baseDecodeTime, trackId) {}

  reset() {}
};
