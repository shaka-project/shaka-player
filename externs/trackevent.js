/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for the TrackEvent interface.
 * @externs
 *
 * TODO: Remove once this is available from the compiler.
 */

class TrackEvent extends Event {}

/** @type {(!AudioTrack|!TextTrack|!VideoTrack)} */
TrackEvent.prototype.track;
