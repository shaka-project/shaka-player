/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for Xbox
 *
 * @externs
 */


/** @const */
var Windows = {};


/** @const */
Windows.Media = {};


/** @const */
Windows.Media.Protection = {};


/** @const */
Windows.Media.Protection.ProtectionCapabilities = class {
  /**
   * @param {string} type
   * @param {string} keySystem
   * @return {!Windows.Media.Protection.ProtectionCapabilityResult}
   */
  isTypeSupported(type, keySystem) {}
};

/**
 * @enum {string}
 */
Windows.Media.Protection.ProtectionCapabilityResult = {
  notSupported: 'NotSupported',
  maybe: 'Maybe',
  probably: 'Probably',
};


/** @const */
var chrome = {};


/** @const */
chrome.webview = {};


/** @const */
chrome.webview.hostObjects = {};


/** @const */
chrome.webview.hostObjects.sync = {};


/** @const */
chrome.webview.hostObjects.sync.Windows = Windows;

/**
 * Typedef for the module interface.
 *
 * @typedef {typeof Windows}
 */
var WinRT;
