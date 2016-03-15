/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
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
 * @param {string} mimeType
 * @param {string=} opt_keySystem
 * @return {string} '', 'maybe', or 'probably'
 */
HTMLVideoElement.prototype.canPlayType =
    function(mimeType, opt_keySystem) {};



/**
 * @constructor
 * @param {string} type
 * @param {Object=} opt_eventInitDict
 * @extends {Event}
 */
function MediaKeyEvent(type, opt_eventInitDict) {}


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
 * @type {Uint8Array}
 * @const
 */
MediaKeyEvent.prototype.initData;


/**
 * @type {Uint8Array}
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

