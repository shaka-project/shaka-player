/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for NetworkInformation which were missing in the
 * Closure compiler.
 *
 * @externs
 */

/**
 * @extends {NetworkInformation}
 * @extends {EventTarget}
 * @interface
 */
class NetworkInformationEvent {
  /** @override */
  addEventListener(type, listener, useCapture) {}

  /** @override */
  removeEventListener(type, listener, useCapture) {}

  /** @override */
  dispatchEvent(event) {}
}


/** @type {NetworkInformationEvent} */
const NetworkInformation = {};

/** @type {boolean} */
NetworkInformation.prototype.saveData;

/** @type {number} */
NetworkInformation.prototype.downlink;
