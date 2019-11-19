/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for prefixed EME v0.1b.
 * @externs
 */


/**
 * @param {string} keySystem
 * @param {Uint8Array} key
 * @param {Uint8Array} keyId
 * @param {string} sessionId
 */
HTMLMediaElement.prototype.webkitAddKey =
    function(keySystem, key, keyId, sessionId) {};


/**
 * @param {string} keySystem
 * @param {string} sessionId
 */
HTMLMediaElement.prototype.webkitCancelKeyRequest =
    function(keySystem, sessionId) {};


/**
 * @param {string} keySystem
 * @param {!Uint8Array} initData
 */
HTMLMediaElement.prototype.webkitGenerateKeyRequest =
    function(keySystem, initData) {};


/**
 * An unprefixed variant of the webkit-prefixed API from EME v0.1b.
 * @param {string} keySystem
 * @param {!Uint8Array} initData
 */
HTMLMediaElement.prototype.generateKeyRequest =
    function(keySystem, initData) {};


/**
 * @param {string} mimeType
 * @param {string=} keySystem
 * @return {string} '', 'maybe', or 'probably'
 * @override the standard one-argument version
 */
HTMLVideoElement.prototype.canPlayType =
    function(mimeType, keySystem) {};


/**
 * @constructor
 * @param {string} type
 * @param {Object=} eventInitDict
 * @extends {Event}
 */
function MediaKeyEvent(type, eventInitDict) {}


/**
 * @type {string}
 * @const
 */
MediaKeyEvent.prototype.keySystem;


/**
 * @type {string}
 * @const
 */
MediaKeyEvent.prototype.sessionId;


/**
 * @type {!Uint8Array}
 * @const
 */
MediaKeyEvent.prototype.initData;


/**
 * @type {!Uint8Array}
 * @const
 */
MediaKeyEvent.prototype.message;


/**
 * @type {string}
 * @const
 */
MediaKeyEvent.prototype.defaultURL;


/**
 * @type {MediaKeyError}
 * @const
 */
MediaKeyEvent.prototype.errorCode;


/**
 * @type {number}
 * @const
 */
MediaKeyEvent.prototype.systemCode;


/**
 * @type {!HTMLMediaElement}
 * @const
 */
MediaKeyEvent.prototype.target;


/** @constructor */
function MediaKeyError() {}


/** @type {number} */
MediaKeyError.prototype.code;


/** @type {number} */
MediaKeyError.prototype.systemCode;

