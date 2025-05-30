/*! @license
 * Shaka Player
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
  'CLOSE': 'close',
  'CLOSED_CAPTIONS': 'closed_caption',
  'CLOSED_CAPTIONS_OFF': 'closed_caption_disabled',
  'CHECKMARK': 'done',
  'LANGUAGE': 'language',
  'PIP': 'picture_in_picture_alt',
  // 'branding_watermark' material icon looks like a "dark version"
  // of the p-i-p icon. We use "dark version" icons to signal that the
  // feature is turned on.
  'EXIT_PIP': 'branding_watermark',
  'BACK': 'navigate_before',
  'RESOLUTION': 'tune',
  'MUTE': 'volume_up',
  'UNMUTE': 'volume_off',
  'CAST': 'cast',
  'EXIT_CAST': 'cast_connected',
  'OPEN_OVERFLOW': 'settings',
  'REWIND': 'fast_rewind',
  'FAST_FORWARD': 'fast_forward',
  'PLAY': 'play_arrow',
  'PLAYBACK_RATE': 'slow_motion_video',
  'PAUSE': 'pause',
  'LOOP': 'repeat',
  'UNLOOP': 'repeat_on',
  'AIRPLAY': 'airplay',
  'REPLAY': 'replay',
  'SKIP_NEXT': 'skip_next',
  'STATISTICS_ON': 'insert_chart_outlined',
  'STATISTICS_OFF': 'insert_chart',
  'RECENTER_VR': 'control_camera',
  'TOGGLE_STEREOSCOPIC': '3d_rotation',
  'DOWNLOAD': 'download',
  'CHAPTER': 'bookmarks',
};
