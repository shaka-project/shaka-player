/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.config.MsfVersion');

/**
 * @enum {string}
 * @export
 */
shaka.config.MsfVersion = {
  'AUTO': 'auto',
  /** @deprecated Removed in v6; use DRAFT_16 or DRAFT_18. */
  'DRAFT_14': 'draft-14',
  'DRAFT_16': 'draft-16',
  'DRAFT_18': 'draft-18',
};
