/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * @externs
 */

/**
 * @typedef {{
 *    defaultSampleDuration: ?number
 * }}
 *
 * @property {?number} defaultSampleDuration
 *   If specified via flags, this overrides the default sample
 *   duration in the Track Extends Box for this fragment
 *
 * @exportDoc
 */
shaka.extern.ParsedTFHDBox;

/**
 * @typedef {{
 *    baseMediaDecodeTime: !number
 * }}
 *
 * @property {!number} baseMediaDecodeTime
 *  As per the spec: the absolute decode time, measured on the media
 *  timeline, of the first sample in decode order in the track fragment
 *
 * @exportDoc
 */
shaka.extern.ParsedTFDTBox;

/**
 * @typedef {{
 *    timescale: !number
 * }}
 *
 * @property {!number} timescale
 *  As per the spec: an integer that specifies the time‐scale for this media;
 * this is the number of time units that pass in one second
 *
 * @exportDoc
 */
shaka.extern.ParsedMDHDBox;

/**
 * @typedef {{
 *    defaultSampleDuration: !number
 * }}
 *
 * @property {!number} defaultSampleDuration
 *  The default sample duration to be used in track fragments
 *
 * @exportDoc
 */
shaka.extern.ParsedTREXBox;

/**
 * @typedef {{
 *    sampleCount: !number,
 *    sampleData: !Array.<shaka.extern.TRUNSample>
 * }}
 *
 * @property {!number} sampleCount
 *  As per the spec: the number of samples being added in this run;
 * @property {!Array.<shaka.extern.TRUNSample>} sampleData
 *  An array of size <sampleCount> containing data for each sample
 *
 * @exportDoc
 */
shaka.extern.ParsedTRUNBox;

/**
 * @typedef {{
 *    sampleDuration: ?number,
 *    sampleSize: ?number,
 *    sampleCompositionTimeOffset: ?number
 *  }}
 *
 * @property {?number} sampleDuration
 *    The length of the sample in timescale units.
 * @property {?number} sampleSize
 *    The size of the sample in bytes.
 * @property {?number} sampleCompositionTimeOffset
 *    The time since the start of the sample in timescale units. Time
 *    offset is based of the start of the sample. If this value is
 *    missing, the accumated durations preceeding this time sample will
 *    be used to create the start time.
 */
shaka.extern.TRUNSample;
