/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.SegmentGenerator');


/**
 * Generates initialization and media segments for a media container.
 *
 * @interface
 */
shaka.util.SegmentGenerator = class {
  /**
   * Generates the initialization segment that configures the media tracks.
   * @return {!Uint8Array}
   */
  initSegment() {}

  /**
   * Generates the media segment containing the encoded samples.
   * @return {!Uint8Array}
   */
  segmentData() {}
};
