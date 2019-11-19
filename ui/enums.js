/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.Enums');


/**
 * These strings are used to insert material design icons
 * and should never be localized.
 * @enum {string}
 */
shaka.ui.Enums.MaterialDesignIcons = {
  'FULLSCREEN': 'fullscreen',
  'EXIT_FULLSCREEN': 'fullscreen_exit',
  'CLOSED_CAPTIONS': 'closed_caption',
  'CHECKMARK': 'done',
  'LANGUAGE': 'language',
  'PIP': 'picture_in_picture_alt',
  // 'branding_watermark' material icon looks like a "dark version"
  // of the p-i-p icon. We use "dark version" icons to signal that the
  // feature is turned on.
  'EXIT_PIP': 'branding_watermark',
  'BACK': 'arrow_back',
  'RESOLUTION': 'settings',
  'MUTE': 'volume_up',
  'UNMUTE': 'volume_off',
  'CAST': 'cast',
  'EXIT_CAST': 'cast_connected',
  'OPEN_OVERFLOW': 'more_vert',
  'REWIND': 'fast_rewind',
  'FAST_FORWARD': 'fast_forward',
  'PLAY': 'play_arrow',
  'PAUSE': 'pause',
};


/**
 * @enum {number}
 */
shaka.ui.Enums.Opacity = {
  'TRANSPARENT': 0,
  'OPAQUE': 1,
};
