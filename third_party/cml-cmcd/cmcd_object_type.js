/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdObjectType');


/**
 * Common Media Client Data Object Type — values for the `ot` key.
 *
 * @see {@link https://cta-wave.github.io/Resources/common-media-client-data--cta-5004-b.html#object-type}
 *
 * @enum {string}
 */
cml.cmcd.CmcdObjectType = {
  /**
   * text file, such as a manifest or playlist
   */
  MANIFEST: 'm',

  /**
   * audio only
   */
  AUDIO: 'a',

  /**
   * video only
   */
  VIDEO: 'v',

  /**
   * muxed audio and video
   */
  MUXED: 'av',

  /**
   * init segment
   */
  INIT: 'i',

  /**
   * caption or subtitle
   */
  CAPTION: 'c',

  /**
   * ISOBMFF timed text track
   */
  TIMED_TEXT: 'tt',

  /**
   * cryptographic key, license or certificate.
   */
  KEY: 'k',

  /**
   * other
   */
  OTHER: 'o',
};
