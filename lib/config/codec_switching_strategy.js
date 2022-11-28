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
  // No codec switching allowed (i.e. current Shaka behaviour).
  DISABLED: 'disabled',
  // Allow codec switching which will always involve reloading the
  // `MediaSource`.
  RELOAD: 'reload',
  // Allow codec switching; determine if `SourceBuffer.changeType` is available
  // and attempt to use this first, but fall back to reloading `MediaSource` if
  // not available / fails.
  //
  // This case can be implemented as a future improvement once #1528 is
  // completed in order to reduce the scope of this change.
  SMOOTH: 'smooth',
};
