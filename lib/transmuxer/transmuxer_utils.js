/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.transmuxer.TransmuxerUtils');

goog.requireType('shaka.util.Mp4Generator');


/**
 * Shared constants for transmuxer implementations.
 */
shaka.transmuxer.TransmuxerUtils = class {};

/**
 * Shared sample flags for audio frames.
 * Reused across all samples to avoid per-frame object allocation.
 *
 * @const {!shaka.util.Mp4Generator.Mp4SampleFlags}
 */
shaka.transmuxer.TransmuxerUtils.AUDIO_SAMPLE_FLAGS = Object.freeze({
  isLeading: 0,
  isDependedOn: 0,
  hasRedundancy: 0,
  degradPrio: 0,
  dependsOn: 2,
  isNonSync: 0,
});

/**
 * Shared sample flags for video keyframes.
 *
 * @const {!shaka.util.Mp4Generator.Mp4SampleFlags}
 */
shaka.transmuxer.TransmuxerUtils.VIDEO_KEYFRAME_FLAGS = Object.freeze({
  isLeading: 0,
  isDependedOn: 0,
  hasRedundancy: 0,
  degradPrio: 0,
  dependsOn: 2,
  isNonSync: 0,
});

/**
 * Shared sample flags for video non-keyframes.
 *
 * @const {!shaka.util.Mp4Generator.Mp4SampleFlags}
 */
shaka.transmuxer.TransmuxerUtils.VIDEO_NON_KEYFRAME_FLAGS = Object.freeze({
  isLeading: 0,
  isDependedOn: 0,
  hasRedundancy: 0,
  degradPrio: 0,
  dependsOn: 1,
  isNonSync: 1,
});
