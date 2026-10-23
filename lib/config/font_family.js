/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.config.FontFamily');

/**
 * Preset font families for the subtitles.  Each value is a CSS
 * <code>font-family</code> that lists several fonts, so a similar one is
 * found on every platform.  They are the font families of the subtitles of
 * YouTube.
 *
 * @enum {string}
 * @export
 */
shaka.config.FontFamily = {
  'DEFAULT': '',
  'MONOSPACED_SERIF':
      '"Courier New", Courier, "Nimbus Mono L", "Cutive Mono", monospace',
  'PROPORTIONAL_SERIF':
      '"Times New Roman", Times, Georgia, Cambria, "PT Serif Caption", serif',
  'MONOSPACED_SANS_SERIF':
      // The externs generator requires a literal, so it can't be split.
      // eslint-disable-next-line @stylistic/max-len
      '"Deja Vu Sans Mono", "Lucida Console", Monaco, Consolas, "PT Mono", monospace',
  'PROPORTIONAL_SANS_SERIF':
      'Roboto, Arial, Helvetica, Verdana, "PT Sans Caption", sans-serif',
  'CASUAL': '"Comic Sans MS", Impact, Handlee, fantasy',
  'CURSIVE':
      // eslint-disable-next-line @stylistic/max-len
      '"Monotype Corsiva", "URW Chancery L", "Apple Chancery", "Dancing Script", cursive',
  // Meant to be used with the 'small-caps' font variant, so the "Marcellus SC"
  // fallback (a small capitals font) matches the other fonts.
  'SMALL_CAPITALS': 'Arial, Helvetica, Verdana, "Marcellus SC", sans-serif',
};
