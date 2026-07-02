/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CMCD_EVENT_AD_BREAK_END');
goog.provide('cml.cmcd.CMCD_EVENT_AD_BREAK_START');
goog.provide('cml.cmcd.CMCD_EVENT_AD_END');
goog.provide('cml.cmcd.CMCD_EVENT_AD_START');
goog.provide('cml.cmcd.CMCD_EVENT_BACKGROUNDED_MODE');
goog.provide('cml.cmcd.CMCD_EVENT_BITRATE_CHANGE');
goog.provide('cml.cmcd.CMCD_EVENT_CONTENT_ID');
goog.provide('cml.cmcd.CMCD_EVENT_CUSTOM_EVENT');
goog.provide('cml.cmcd.CMCD_EVENT_ERROR');
goog.provide('cml.cmcd.CMCD_EVENT_MUTE');
goog.provide('cml.cmcd.CMCD_EVENT_PLAYBACK_RATE');
goog.provide('cml.cmcd.CMCD_EVENT_PLAYER_COLLAPSE');
goog.provide('cml.cmcd.CMCD_EVENT_PLAYER_EXPAND');
goog.provide('cml.cmcd.CMCD_EVENT_PLAY_STATE');
goog.provide('cml.cmcd.CMCD_EVENT_RESPONSE_RECEIVED');
goog.provide('cml.cmcd.CMCD_EVENT_SKIP');
goog.provide('cml.cmcd.CMCD_EVENT_TIME_INTERVAL');
goog.provide('cml.cmcd.CMCD_EVENT_UNMUTE');
goog.provide('cml.cmcd.CmcdEventType');


/**
 * CMCD event type for the 'bc' key (bitrate change).
 *
 * @const {string}
 */
cml.cmcd.CMCD_EVENT_BITRATE_CHANGE = 'bc';

/**
 * CMCD event type for the 'ps' key (play state change).
 *
 * @const {string}
 */
cml.cmcd.CMCD_EVENT_PLAY_STATE = 'ps';

/**
 * CMCD event type for the 'pr' key (playback rate change).
 *
 * @const {string}
 */
cml.cmcd.CMCD_EVENT_PLAYBACK_RATE = 'pr';

/**
 * CMCD event type for the 'e' key (error).
 *
 * @const {string}
 */
cml.cmcd.CMCD_EVENT_ERROR = 'e';

/**
 * CMCD event type for the 't' key (time interval).
 *
 * @const {string}
 */
cml.cmcd.CMCD_EVENT_TIME_INTERVAL = 't';

/**
 * CMCD event type for the 'c' key (content ID).
 *
 * @const {string}
 */
cml.cmcd.CMCD_EVENT_CONTENT_ID = 'c';

/**
 * CMCD event type for the 'b' key (backgrounded mode).
 *
 * @const {string}
 */
cml.cmcd.CMCD_EVENT_BACKGROUNDED_MODE = 'b';

/**
 * CMCD event type for the 'm' key (mute).
 *
 * @const {string}
 */
cml.cmcd.CMCD_EVENT_MUTE = 'm';

/**
 * CMCD event type for the 'um' key (unmute).
 *
 * @const {string}
 */
cml.cmcd.CMCD_EVENT_UNMUTE = 'um';

/**
 * CMCD event type for the 'pe' key (player expand).
 *
 * @const {string}
 */
cml.cmcd.CMCD_EVENT_PLAYER_EXPAND = 'pe';

/**
 * CMCD event type for the 'pc' key (player collapse).
 *
 * @const {string}
 */
cml.cmcd.CMCD_EVENT_PLAYER_COLLAPSE = 'pc';

/**
 * CMCD event type for the 'rr' key (response received).
 *
 * @const {string}
 */
cml.cmcd.CMCD_EVENT_RESPONSE_RECEIVED = 'rr';

/**
 * CMCD event type for the 'as' key (ad start).
 *
 * @const {string}
 */
cml.cmcd.CMCD_EVENT_AD_START = 'as';

/**
 * CMCD event type for the 'ae' key (ad end).
 *
 * @const {string}
 */
cml.cmcd.CMCD_EVENT_AD_END = 'ae';

/**
 * CMCD event type for the 'abs' key (ad break start).
 *
 * @const {string}
 */
cml.cmcd.CMCD_EVENT_AD_BREAK_START = 'abs';

/**
 * CMCD event type for the 'abe' key (ad break end).
 *
 * @const {string}
 */
cml.cmcd.CMCD_EVENT_AD_BREAK_END = 'abe';

/**
 * CMCD event type for the 'sk' key (skip).
 *
 * @const {string}
 */
cml.cmcd.CMCD_EVENT_SKIP = 'sk';

/**
 * CMCD event type for the 'ce' key (custom event).
 *
 * @const {string}
 */
cml.cmcd.CMCD_EVENT_CUSTOM_EVENT = 'ce';


/**
 * CMCD event types for the `e` key (event mode).
 *
 * @see {@link https://cta-wave.github.io/Resources/common-media-client-data--cta-5004-b.html#event}
 *
 * @enum {string}
 */
cml.cmcd.CmcdEventType = {
  /**
   * A change in the bitrate.
   */
  BITRATE_CHANGE: cml.cmcd.CMCD_EVENT_BITRATE_CHANGE,

  /**
   * A change in the player state.
   */
  PLAY_STATE: cml.cmcd.CMCD_EVENT_PLAY_STATE,

  /**
   * A change in the playback rate.
   */
  PLAYBACK_RATE: cml.cmcd.CMCD_EVENT_PLAYBACK_RATE,

  /**
   * An error event.
   */
  ERROR: cml.cmcd.CMCD_EVENT_ERROR,

  /**
   * A periodic report sent on a time interval.
   */
  TIME_INTERVAL: cml.cmcd.CMCD_EVENT_TIME_INTERVAL,

  /**
   * A change of the content ID.
   */
  CONTENT_ID: cml.cmcd.CMCD_EVENT_CONTENT_ID,

  /**
   * A change in the application's backgrounded state.
   */
  BACKGROUNDED_MODE: cml.cmcd.CMCD_EVENT_BACKGROUNDED_MODE,

  /**
   * The player was muted.
   */
  MUTE: cml.cmcd.CMCD_EVENT_MUTE,

  /**
   * Player unmuted.
   */
  UNMUTE: cml.cmcd.CMCD_EVENT_UNMUTE,

  /**
   * The player view was expanded.
   */
  PLAYER_EXPAND: cml.cmcd.CMCD_EVENT_PLAYER_EXPAND,

  /**
   * The player view was collapsed.
   */
  PLAYER_COLLAPSE: cml.cmcd.CMCD_EVENT_PLAYER_COLLAPSE,

  /**
   * The receipt of a response.
   */
  RESPONSE_RECEIVED: cml.cmcd.CMCD_EVENT_RESPONSE_RECEIVED,

  /**
   * The start of an ad.
   */
  AD_START: cml.cmcd.CMCD_EVENT_AD_START,

  /**
   * The end of an ad.
   */
  AD_END: cml.cmcd.CMCD_EVENT_AD_END,

  /**
   * The start of an ad break.
   */
  AD_BREAK_START: cml.cmcd.CMCD_EVENT_AD_BREAK_START,

  /**
   * The end of an ad break.
   */
  AD_BREAK_END: cml.cmcd.CMCD_EVENT_AD_BREAK_END,

  /**
   * The user skipped an ad.
   */
  SKIP: cml.cmcd.CMCD_EVENT_SKIP,

  /**
   * A custom event.
   */
  CUSTOM_EVENT: cml.cmcd.CMCD_EVENT_CUSTOM_EVENT,
};
