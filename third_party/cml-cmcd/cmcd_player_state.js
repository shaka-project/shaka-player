/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdPlayerState');


/**
 * CMCD v2 player states for the `sta` key.
 *
 * @see {@link https://cta-wave.github.io/Resources/common-media-client-data--cta-5004-b.html#state}
 *
 * @enum {string}
 */
cml.cmcd.CmcdPlayerState = {
  /**
   * Starting: Initial startup of the player.
   */
  STARTING: 's',

  /**
   * Playing: The player is actively rendering content.
   */
  PLAYING: 'p',

  /**
   * Seeking: The player is seeking to a new position.
   */
  SEEKING: 'k',

  /**
   * Rebuffering: The player is buffering data during playback.
   */
  REBUFFERING: 'r',

  /**
   * Paused: The player is paused.
   */
  PAUSED: 'a',

  /**
   * Waiting: The player is waiting for a user action or another event.
   */
  WAITING: 'w',

  /**
   * Ended: The media has finished playing.
   */
  ENDED: 'e',

  /**
   * Fatal Error: The player has encountered a fatal error.
   */
  FATAL_ERROR: 'f',

  /**
   * Quit: User initiated end of playback before media asset
   * completion.
   */
  QUIT: 'q',

  /**
   * Preloading: The player is loading assets ahead of starting in
   * order to provide a fast startup. The expectation is that
   * playback will commence at a future time.
   */
  PRELOADING: 'd',
};
