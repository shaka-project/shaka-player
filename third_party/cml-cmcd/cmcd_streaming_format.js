/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdStreamingFormat');


/**
 * Common Media Client Data Streaming Format — values for the `sf` key.
 *
 * @see {@link https://cta-wave.github.io/Resources/common-media-client-data--cta-5004-b.html#streaming-format}
 *
 * @enum {string}
 */
cml.cmcd.CmcdStreamingFormat = {
  /**
   * MPEG DASH
   */
  DASH: 'd',

  /**
   * HTTP Live Streaming (HLS)
   */
  HLS: 'h',

  /**
   * Smooth Streaming
   */
  SMOOTH: 's',

  /**
   * Other
   */
  OTHER: 'o',
};
