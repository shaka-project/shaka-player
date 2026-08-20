/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for the MSF packaging plugin interface.
 *
 * @externs
 */


/**
 * How a catalog track's media is packaged into MoQT objects: everything the
 * MSF parser needs to know about a `packaging` value, gathered behind one
 * interface.
 *
 * A packaging is chosen once per track, from the catalog's `packaging` field,
 * and nothing above this layer branches on it. Supporting a new packaging
 * means providing an implementation of this interface and registering it with
 * shaka.msf.PackagingRegistry.
 *
 * The interface has two halves because the differences between packagings run
 * deeper than how a payload is framed. A CMAF chunk is self-describing, so one
 * object is one segment; a LOC object is one frame, timed from a fixed frame
 * duration; an MPEG-2 TS object is a run of transport packets that carries no
 * timing of its own and is not independently decodable, so segments can only
 * be cut at Group boundaries. An implementation therefore owns both how a
 * track presents itself and how its objects turn into segments.
 *
 * An instance is created per track, so it may keep whatever state
 * describeTrack() derived for createSegmenter() to use.
 *
 * @interface
 * @exportDoc
 */
shaka.extern.MsfPackaging = class {
  /**
   * Inspects a catalog track and describes how to present it, or returns null
   * if this packaging cannot handle the track, in which case the track is
   * skipped. Called once per track, before any objects arrive.
   *
   * @param {msfCatalog.Track} track
   * @param {!Uint8Array} initData The track's resolved initialization data,
   *   empty when the catalog carries none. Its meaning is packaging-specific:
   *   an MP4 initialization segment for CMAF, PAT/PMT transport packets for
   *   m2ts.
   * @return {?shaka.extern.MsfTrackDescription}
   * @exportDoc
   */
  describeTrack(track, initData) {}

  /**
   * Creates a segmenter for the track this instance described. Called each
   * time the stream's segment index is created, so a track that is unsubscribed
   * and resubscribed starts from a clean segmenter.
   *
   * @return {!shaka.extern.MsfSegmenter}
   * @exportDoc
   */
  createSegmenter() {}
};


/**
 * How a track presents itself, as derived from the catalog.
 *
 * @typedef {{
 *   basicInfo: !shaka.extern.BasicInfo,
 *   initSegmentReference: shaka.media.InitSegmentReference,
 * }}
 *
 * @property {!shaka.extern.BasicInfo} basicInfo
 *   The stream's media properties. Fields left null fall back to the
 *   corresponding catalog fields.
 * @property {shaka.media.InitSegmentReference} initSegmentReference
 *   The initialization segment to attach to every segment of this track, or
 *   null for packagings that have none, such as m2ts.
 * @exportDoc
 */
shaka.extern.MsfTrackDescription;


/**
 * One segment, ready to append, produced from one or more MoQT objects.
 *
 * @typedef {{
 *   startTime: number,
 *   duration: number,
 *   data: !Uint8Array,
 *   timestampOffset: number,
 *   discontinuitySequence: number,
 * }}
 *
 * @property {number} startTime
 *   Presentation start time in seconds.
 * @property {number} duration
 *   Duration in seconds. Must be greater than zero.
 * @property {!Uint8Array} data
 *   The bytes to append.
 * @property {number} timestampOffset
 *   Added to the media's own timestamps at append time. Zero unless the
 *   packaging shifts media off its own timeline, as m2ts does to stay
 *   monotonic across a PCR discontinuity.
 * @property {number} discontinuitySequence
 *   Increments whenever the media timeline is discontinuous with the previous
 *   segment, or -1 when the packaging cannot have discontinuities. Downstream
 *   this resets the transport-stream rollover reference and forces a fresh
 *   transmuxed initialization segment.
 * @exportDoc
 */
shaka.extern.MsfSegment;


/**
 * Turns a track's stream of MoQT objects into segments ready to append.
 *
 * @interface
 * @exportDoc
 */
shaka.extern.MsfSegmenter = class {
  /**
   * Consumes one MoQT object and returns the segments it completed, which is
   * usually none or one. Objects with an empty payload carry an object status
   * rather than media and are delivered here too, because for some packagings
   * they are the signal that a Group has ended.
   *
   * @param {!shaka.extern.MsfObject} obj
   * @return {!Array<!shaka.extern.MsfSegment>}
   * @exportDoc
   */
  push(obj) {}
};


/**
 * A factory for creating a packaging. This function is registered with
 * shaka.msf.PackagingRegistry to create packaging instances.
 *
 * @typedef {function():!shaka.extern.MsfPackaging}
 * @exportDoc
 */
shaka.extern.MsfPackaging.Factory;
