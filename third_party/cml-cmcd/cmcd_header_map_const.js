/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CMCD_HEADER_MAP');

goog.require('cml.cmcd.CMCD_OBJECT');
goog.require('cml.cmcd.CMCD_REQUEST');
goog.require('cml.cmcd.CMCD_SESSION');
goog.require('cml.cmcd.CMCD_STATUS');


/**
 * The map of CMCD keys to their appropriate header shard.
 *
 * Note: Event-only keys (e, ts, cen, h) and response-received keys
 * (rc, ttfb, ttlb, url, etc.) are intentionally absent. They are
 * transmitted via the event-mode POST body, not HTTP headers.
 *
 * @const {!Object<string, string>}
 */
cml.cmcd.CMCD_HEADER_MAP = {
  // Object
  ab: cml.cmcd.CMCD_OBJECT,
  br: cml.cmcd.CMCD_OBJECT,
  d: cml.cmcd.CMCD_OBJECT,
  lab: cml.cmcd.CMCD_OBJECT,
  lb: cml.cmcd.CMCD_OBJECT,
  ot: cml.cmcd.CMCD_OBJECT,
  tab: cml.cmcd.CMCD_OBJECT,
  tb: cml.cmcd.CMCD_OBJECT,
  tpb: cml.cmcd.CMCD_OBJECT,

  // Request
  bl: cml.cmcd.CMCD_REQUEST,
  cs: cml.cmcd.CMCD_REQUEST,
  dfa: cml.cmcd.CMCD_REQUEST,
  dl: cml.cmcd.CMCD_REQUEST,
  ltc: cml.cmcd.CMCD_REQUEST,
  mtp: cml.cmcd.CMCD_REQUEST,
  nor: cml.cmcd.CMCD_REQUEST,
  nrr: cml.cmcd.CMCD_REQUEST,
  pb: cml.cmcd.CMCD_REQUEST,
  sn: cml.cmcd.CMCD_REQUEST,
  sta: cml.cmcd.CMCD_REQUEST,
  su: cml.cmcd.CMCD_REQUEST,
  tbl: cml.cmcd.CMCD_REQUEST,

  // Session
  cid: cml.cmcd.CMCD_SESSION,
  msd: cml.cmcd.CMCD_SESSION,
  sf: cml.cmcd.CMCD_SESSION,
  sid: cml.cmcd.CMCD_SESSION,
  st: cml.cmcd.CMCD_SESSION,
  v: cml.cmcd.CMCD_SESSION,

  // Status
  bg: cml.cmcd.CMCD_STATUS,
  bs: cml.cmcd.CMCD_STATUS,
  bsa: cml.cmcd.CMCD_STATUS,
  bsd: cml.cmcd.CMCD_STATUS,
  bsda: cml.cmcd.CMCD_STATUS,
  cdn: cml.cmcd.CMCD_STATUS,
  ec: cml.cmcd.CMCD_STATUS,
  nr: cml.cmcd.CMCD_STATUS,
  pr: cml.cmcd.CMCD_STATUS,
  pt: cml.cmcd.CMCD_STATUS,
  rtp: cml.cmcd.CMCD_STATUS,
};
