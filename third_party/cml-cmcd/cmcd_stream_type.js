/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdStreamType');


/**
 * Common Media Client Data Stream Type — values for the `st` key.
 *
 * @see {@link https://cta-wave.github.io/Resources/common-media-client-data--cta-5004-b.html#stream-type}
 *
 * @enum {string}
 */
cml.cmcd.CmcdStreamType = {
  /**
   * All segments are available – e.g., VOD
   */
  VOD: 'v',

  /**
   * Segments become available over time – e.g., LIVE
   */
  LIVE: 'l',

  /**
   * Low latency stream
   */
  LOW_LATENCY: 'll',
};
