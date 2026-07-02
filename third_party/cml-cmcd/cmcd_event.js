/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdEvent');

goog.requireType('cml.cmcd.CmcdObjectTypeList');


/**
 * Common Media Client Data (CMCD) version 2 - Event Mode.
 *
 * Extends `cml.cmcd.CmcdRequest` with event-specific keys (`cen`, `e`,
 * `h`, `ts`) for reporting events per the CMCD v2 specification.
 *
 * Upstream CML expresses this as `CmcdRequest & {event keys...}`.
 * Closure typedefs cannot express type intersection; we list the union
 * of all properties (request + event) directly. All members optional.
 *
 * The string-literal types for `e`, `ot`, `sf`, `sta`, `st` are the
 * `cml.cmcd.CmcdEventType`, `cml.cmcd.CmcdObjectType`,
 * `cml.cmcd.CmcdStreamingFormat`, `cml.cmcd.CmcdPlayerState`,
 * `cml.cmcd.CmcdStreamType` enum value unions. We use plain `string`
 * here to keep the typedef self-contained and avoid circular
 * `goog.require` between enum files and this typedef.
 *
 * @see {@link https://cta-wave.github.io/Resources/common-media-client-data--cta-5004-b.html#event-mode}
 *
 * @typedef {{
 *   ab: (cml.cmcd.CmcdObjectTypeList|undefined),
 *   bg: (boolean|undefined),
 *   bl: (cml.cmcd.CmcdObjectTypeList|undefined),
 *   br: (cml.cmcd.CmcdObjectTypeList|undefined),
 *   bs: (boolean|undefined),
 *   bsa: (cml.cmcd.CmcdObjectTypeList|undefined),
 *   bsd: (cml.cmcd.CmcdObjectTypeList|undefined),
 *   bsda: (cml.cmcd.CmcdObjectTypeList|undefined),
 *   cdn: (string|undefined),
 *   cen: (string|undefined),
 *   cid: (string|undefined),
 *   cs: (string|undefined),
 *   d: (number|undefined),
 *   dfa: (number|undefined),
 *   dl: (number|undefined),
 *   e: (string|undefined),
 *   ec: (!Array<string>|undefined),
 *   h: (string|undefined),
 *   lab: (cml.cmcd.CmcdObjectTypeList|undefined),
 *   lb: (cml.cmcd.CmcdObjectTypeList|undefined),
 *   ltc: (number|undefined),
 *   msd: (number|undefined),
 *   mtp: (cml.cmcd.CmcdObjectTypeList|undefined),
 *   nor: (!Array<*>|undefined),
 *   nr: (boolean|undefined),
 *   ot: (string|undefined),
 *   pb: (cml.cmcd.CmcdObjectTypeList|undefined),
 *   pr: (number|undefined),
 *   pt: (number|undefined),
 *   rtp: (number|undefined),
 *   sf: (string|undefined),
 *   sid: (string|undefined),
 *   sn: (number|undefined),
 *   st: (string|undefined),
 *   sta: (string|undefined),
 *   su: (boolean|undefined),
 *   tab: (cml.cmcd.CmcdObjectTypeList|undefined),
 *   tb: (cml.cmcd.CmcdObjectTypeList|undefined),
 *   tbl: (cml.cmcd.CmcdObjectTypeList|undefined),
 *   tpb: (cml.cmcd.CmcdObjectTypeList|undefined),
 *   ts: (number|undefined),
 *   v: (number|undefined)
 * }}
 */
cml.cmcd.CmcdEvent;
