/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CMCD_STATE_EVENT_FIELDS');

goog.require('cml.cmcd.CMCD_EVENT_BACKGROUNDED_MODE');
goog.require('cml.cmcd.CMCD_EVENT_BITRATE_CHANGE');
goog.require('cml.cmcd.CMCD_EVENT_CONTENT_ID');
goog.require('cml.cmcd.CMCD_EVENT_PLAY_STATE');
goog.require('cml.cmcd.CMCD_EVENT_PLAYBACK_RATE');


/**
 * Maps each state-change event type to the persistent field whose
 * value the event signals.
 *
 * Per CTA-5004-B, the state-change events `ps`, `pr`, `c`, `b`, `bc`
 * are state-transition markers and must carry the field whose value
 * they signal. Consumers force-include the field post-filter
 * (`prepareCmcdData`), dedup against its value (`CmcdReporter`), and
 * check its presence in payloads (`validateCmcdStructure`).
 *
 * Iteration order is load-bearing: `CmcdReporter.update()` fires
 * state-change events in map order when multiple tracked fields
 * change in a single call. Do not reorder entries without auditing
 * reporter behavior.
 *
 * @const {!Map<string, string>}
 */
cml.cmcd.CMCD_STATE_EVENT_FIELDS = new Map([
  [cml.cmcd.CMCD_EVENT_PLAY_STATE, 'sta'],
  [cml.cmcd.CMCD_EVENT_PLAYBACK_RATE, 'pr'],
  [cml.cmcd.CMCD_EVENT_CONTENT_ID, 'cid'],
  [cml.cmcd.CMCD_EVENT_BACKGROUNDED_MODE, 'bg'],
  [cml.cmcd.CMCD_EVENT_BITRATE_CHANGE, 'br'],
]);
