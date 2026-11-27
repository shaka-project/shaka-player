/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.config.MixedVariantTypes');

/**
 * Which variants to keep when a manifest mixes audio-video variants with
 * audio-only or video-only ones (e.g. an HLS master playlist offering an
 * audio-only variant for very low bandwidths).
 *
 * @enum {string}
 * @export
 */
shaka.config.MixedVariantTypes = {
  /**
   * Keep only the audio-video variants.
   */
  'AV_ONLY': 'av_only',
  /**
   * Keep every variant, but adaptation only chooses audio-video variants.
   * Audio-only and video-only variants are only played when selected
   * manually.
   */
  'MANUAL_SELECTION': 'manual_selection',
  // TODO: Add an 'ALL' value, to keep every variant and let adaptation fall
  // back to the audio-only variants as a last resort, when the bandwidth can't
  // sustain any audio-video variant.  That policy belongs in the AbrManager,
  // so that custom AbrManagers can apply their own.
};
