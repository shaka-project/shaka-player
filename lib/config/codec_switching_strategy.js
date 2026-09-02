/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.config.CodecSwitchingStrategy');

/**
 * @enum {string}
 * @export
 */
shaka.config.CodecSwitchingStrategy = {
  /**
   * Allow codec switching which will always involve reloading
   * the <code<MediaSource</code>.
   */
  'RELOAD': 'reload',
  /**
   * Allow codec switching; determine if <code>SourceBuffer.changeType</code>
   * is available and attempt to use this first, but fall back to reloading
   * <code>MediaSource</code> if not available.
   * <br>
   * Note: Some devices that support <code>SourceBuffer.changeType</code> can
   * become stuck in a pause state.
   */
  'SMOOTH': 'smooth',
};
