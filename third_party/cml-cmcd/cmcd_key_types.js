/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CMCD_KEY_TYPES');
goog.provide('cml.cmcd.CMCD_KEY_TYPE_BOOLEAN');
goog.provide('cml.cmcd.CMCD_KEY_TYPE_INTEGER');
goog.provide('cml.cmcd.CMCD_KEY_TYPE_NUMBER');
goog.provide('cml.cmcd.CMCD_KEY_TYPE_NUMBER_LIST');
goog.provide('cml.cmcd.CMCD_KEY_TYPE_STRING');
goog.provide('cml.cmcd.CMCD_KEY_TYPE_STRING_LIST');
goog.provide('cml.cmcd.CMCD_KEY_TYPE_TOKEN');
goog.provide('cml.cmcd.CMCD_V1_KEY_TYPE_OVERRIDES');


/**
 * CMCD key value type: inner list of numbers with token identifiers.
 *
 * @const {string}
 */
cml.cmcd.CMCD_KEY_TYPE_NUMBER_LIST = 'number[]';

/**
 * CMCD key value type: inner list of strings.
 *
 * @const {string}
 */
cml.cmcd.CMCD_KEY_TYPE_STRING_LIST = 'string[]';

/**
 * CMCD key value type: integer.
 *
 * @const {string}
 */
cml.cmcd.CMCD_KEY_TYPE_INTEGER = 'integer';

/**
 * CMCD key value type: number (decimal).
 *
 * @const {string}
 */
cml.cmcd.CMCD_KEY_TYPE_NUMBER = 'number';

/**
 * CMCD key value type: boolean.
 *
 * @const {string}
 */
cml.cmcd.CMCD_KEY_TYPE_BOOLEAN = 'boolean';

/**
 * CMCD key value type: string.
 *
 * @const {string}
 */
cml.cmcd.CMCD_KEY_TYPE_STRING = 'string';

/**
 * CMCD key value type: token.
 *
 * @const {string}
 */
cml.cmcd.CMCD_KEY_TYPE_TOKEN = 'token';


/**
 * Maps each CMCD spec key to its expected value type for v2.
 *
 * Keys that differ between v1 and v2 are handled by
 * CMCD_V1_KEY_TYPE_OVERRIDES.
 *
 * @const {!Object<string, string>}
 */
cml.cmcd.CMCD_KEY_TYPES = {
  // List keys (inner list of integers/numbers with token identifiers)
  ab: cml.cmcd.CMCD_KEY_TYPE_NUMBER_LIST,
  bl: cml.cmcd.CMCD_KEY_TYPE_NUMBER_LIST,
  br: cml.cmcd.CMCD_KEY_TYPE_NUMBER_LIST,
  bsa: cml.cmcd.CMCD_KEY_TYPE_NUMBER_LIST,
  bsd: cml.cmcd.CMCD_KEY_TYPE_NUMBER_LIST,
  bsda: cml.cmcd.CMCD_KEY_TYPE_NUMBER_LIST,
  lab: cml.cmcd.CMCD_KEY_TYPE_NUMBER_LIST,
  lb: cml.cmcd.CMCD_KEY_TYPE_NUMBER_LIST,
  mtp: cml.cmcd.CMCD_KEY_TYPE_NUMBER_LIST,
  pb: cml.cmcd.CMCD_KEY_TYPE_NUMBER_LIST,
  tab: cml.cmcd.CMCD_KEY_TYPE_NUMBER_LIST,
  tb: cml.cmcd.CMCD_KEY_TYPE_NUMBER_LIST,
  tbl: cml.cmcd.CMCD_KEY_TYPE_NUMBER_LIST,
  tpb: cml.cmcd.CMCD_KEY_TYPE_NUMBER_LIST,

  // String array keys (inner list of strings)
  ec: cml.cmcd.CMCD_KEY_TYPE_STRING_LIST,
  nor: cml.cmcd.CMCD_KEY_TYPE_STRING_LIST,

  // Integer keys
  d: cml.cmcd.CMCD_KEY_TYPE_INTEGER,
  dfa: cml.cmcd.CMCD_KEY_TYPE_INTEGER,
  dl: cml.cmcd.CMCD_KEY_TYPE_INTEGER,
  ltc: cml.cmcd.CMCD_KEY_TYPE_INTEGER,
  msd: cml.cmcd.CMCD_KEY_TYPE_INTEGER,
  pt: cml.cmcd.CMCD_KEY_TYPE_INTEGER,
  rc: cml.cmcd.CMCD_KEY_TYPE_INTEGER,
  rtp: cml.cmcd.CMCD_KEY_TYPE_INTEGER,
  sn: cml.cmcd.CMCD_KEY_TYPE_INTEGER,
  ts: cml.cmcd.CMCD_KEY_TYPE_INTEGER,
  ttfb: cml.cmcd.CMCD_KEY_TYPE_INTEGER,
  ttfbb: cml.cmcd.CMCD_KEY_TYPE_INTEGER,
  ttlb: cml.cmcd.CMCD_KEY_TYPE_INTEGER,
  v: cml.cmcd.CMCD_KEY_TYPE_INTEGER,

  // Number keys
  pr: cml.cmcd.CMCD_KEY_TYPE_NUMBER,

  // Boolean keys
  bg: cml.cmcd.CMCD_KEY_TYPE_BOOLEAN,
  bs: cml.cmcd.CMCD_KEY_TYPE_BOOLEAN,
  nr: cml.cmcd.CMCD_KEY_TYPE_BOOLEAN,
  su: cml.cmcd.CMCD_KEY_TYPE_BOOLEAN,

  // String keys
  cdn: cml.cmcd.CMCD_KEY_TYPE_STRING,
  cen: cml.cmcd.CMCD_KEY_TYPE_STRING,
  cid: cml.cmcd.CMCD_KEY_TYPE_STRING,
  cmsdd: cml.cmcd.CMCD_KEY_TYPE_STRING,
  cmsds: cml.cmcd.CMCD_KEY_TYPE_STRING,
  cs: cml.cmcd.CMCD_KEY_TYPE_STRING,
  h: cml.cmcd.CMCD_KEY_TYPE_STRING,
  nrr: cml.cmcd.CMCD_KEY_TYPE_STRING,
  sid: cml.cmcd.CMCD_KEY_TYPE_STRING,
  smrt: cml.cmcd.CMCD_KEY_TYPE_STRING,
  url: cml.cmcd.CMCD_KEY_TYPE_STRING,

  // Token keys
  e: cml.cmcd.CMCD_KEY_TYPE_TOKEN,
  ot: cml.cmcd.CMCD_KEY_TYPE_TOKEN,
  sf: cml.cmcd.CMCD_KEY_TYPE_TOKEN,
  st: cml.cmcd.CMCD_KEY_TYPE_TOKEN,
  sta: cml.cmcd.CMCD_KEY_TYPE_TOKEN,
};


/**
 * Maps keys to their v1-specific types when they differ from v2.
 *
 * @const {!Object<string, string>}
 */
cml.cmcd.CMCD_V1_KEY_TYPE_OVERRIDES = {
  bl: cml.cmcd.CMCD_KEY_TYPE_INTEGER,
  br: cml.cmcd.CMCD_KEY_TYPE_NUMBER,
  mtp: cml.cmcd.CMCD_KEY_TYPE_INTEGER,
  tb: cml.cmcd.CMCD_KEY_TYPE_NUMBER,
  nor: cml.cmcd.CMCD_KEY_TYPE_STRING,
};
