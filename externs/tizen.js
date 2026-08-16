/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for Tizen
 * @externs
 */


/** @const */
var webapis = {};


/** @const */
webapis.systeminfo = {};


/**
 * @return {shaka.extern.Resolution}
 */
webapis.systeminfo.getMaxVideoResolution = function() {};


/** @const */
webapis.productinfo = {};


/**
 * @return {boolean}
 */
webapis.productinfo.is8KPanelSupported = function() {};


/**
 * @return {boolean}
 */
webapis.productinfo.isUdPanelSupported = function() {};


/** @const */
webapis.avinfo = {};


/**
 * @return {boolean}
 */
webapis.avinfo.isHdrTvSupport = function() {};

