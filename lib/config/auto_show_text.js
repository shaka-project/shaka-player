/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.config.AutoShowText');

/**
 * @enum {number}
 * @export
 */
shaka.config.AutoShowText = {
  /** Never show text automatically on startup. */
  'NEVER': 0,
  /** Always show text automatically on startup. */
  'ALWAYS': 1,
  /**
   * Show text automatically on startup if it matches the preferred text
   * language.
   */
  'IF_PREFERRED_TEXT_LANGUAGE': 2,
  /**
   * Show text automatically on startup if we think that subtitles may be
   * needed.  This is specifically if the selected text matches the preferred
   * text language AND is different from the initial audio language.  (Example:
   * You prefer English, but the audio is only available in French, so English
   * subtitles should be enabled by default.)
   * <br>
   * This is the default setting.
   */
  'IF_SUBTITLES_MAY_BE_NEEDED': 3,
};
