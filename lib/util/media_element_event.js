/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.MediaElementEvent');

/**
 * Enum for HTMLMediaElement events
 * @enum {string}
 */
shaka.util.MediaElementEvent = {
  CAN_PLAY: 'canplay',
  CAN_PLAY_THROUGH: 'canplaythrough',
  DURATION_CHANGE: 'durationchange',
  ENCRYPTED: 'encrypted',
  ENDED: 'ended',
  LOADED_DATA: 'loadeddata',
  LOADED_METADATA: 'loadedmetadata',
  PAUSE: 'pause',
  PLAY: 'play',
  PLAYING: 'playing',
  PROGRESS: 'progress',
  RATE_CHANGE: 'ratechange',
  SEEKED: 'seeked',
  SEEKING: 'seeking',
  STALLED: 'stalled',
  TIME_UPDATE: 'timeupdate',
  VOLUME_CHANGE: 'volumechange',
  WAITING: 'waiting',
};
