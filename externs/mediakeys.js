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
 * @fileoverview Externs for MediaKeys based on
 * {@link http://goo.gl/blgtZZ EME draft 12 March 2015}
 *
 * @externs
 */


/**
 * @typedef {string}
 * 'optional', 'required', 'not-allowed'
 */
var MediaKeysRequirement;


/**
 * @typedef {string}
 * 'temporary', 'persistent-license', 'persistent-usage-record'
 */
var MediaKeySessionType;


/**
 * @typedef {{contentType: string, robustness: string}}
 * gjslint: disable=900
 */
var MediaKeySystemMediaCapability;


/**
 * @typedef {{
 *   initDataTypes: (Array.<string>|undefined),
 *   audioCapabilities: (Array.<!MediaKeySystemMediaCapability>|undefined),
 *   videoCapabilities: (Array.<!MediaKeySystemMediaCapability>|undefined),
 *   distinctiveIdentifier: (MediaKeysRequirement|undefined),
 *   persistentState: (MediaKeysRequirement|undefined),
 *   sessionTypes: (Array.<MediaKeySessionType>|undefined),
 *   label: (string|undefined)
 * }}
 * gjslint: disable=900
 */
var MediaKeySystemConfiguration;


/**
 * @param {string} keySystem
 * @param {!Array.<!MediaKeySystemConfiguration>} supportedConfigurations
 * @return {!Promise.<!MediaKeySystemAccess>}
 */
Navigator.prototype.requestMediaKeySystemAccess =
    function(keySystem, supportedConfigurations) {};


/** @const {MediaKeys} */
HTMLMediaElement.prototype.mediaKeys;


/**
 * @param {MediaKeys} mediaKeys
 * @return {!Promise}
 */
HTMLMediaElement.prototype.setMediaKeys = function(mediaKeys) {};



/** @interface */
function MediaKeySystemAccess() {}


/** @return {!Promise.<!MediaKeys>} */
MediaKeySystemAccess.prototype.createMediaKeys = function() {};


/** @return {!MediaKeySystemConfiguration} */
MediaKeySystemAccess.prototype.getConfiguration = function() {};


/** @const {string} */
MediaKeySystemAccess.prototype.keySystem;



/** @interface */
function MediaKeys() {}


/**
 * @param {MediaKeySessionType=} opt_sessionType defaults to "temporary"
 * @return {!MediaKeySession}
 * @throws {TypeError} if opt_sessionType is invalid.
 */
MediaKeys.prototype.createSession = function(opt_sessionType) {};


/**
 * @param {?BufferSource} serverCertificate
 * @return {!Promise}
 */
MediaKeys.prototype.setServerCertificate = function(serverCertificate) {};



/**
 * @interface
 */
function MediaKeyStatusMap() {}


/** @const {number} */
MediaKeyStatusMap.prototype.size;


/**
 * The functor is called with each status and key ID.
 * @param {function(string, BufferSource)} fn
 */
MediaKeyStatusMap.prototype.forEach = function(fn) {};


/**
 * @param {BufferSource} keyId
 * @return {string|undefined}
 */
MediaKeyStatusMap.prototype.get = function(keyId) {};


/**
 * @param {BufferSource} keyId
 * @return {boolean}
 */
MediaKeyStatusMap.prototype.has = function(keyId) {};



/**
 * @interface
 * @extends {EventTarget}
 */
function MediaKeySession() {}


/** @const {string} */
MediaKeySession.prototype.sessionId;


/** @const {number} */
MediaKeySession.prototype.expiration;


/** @const {!Promise} */
MediaKeySession.prototype.closed;


/** @const {!MediaKeyStatusMap} */
MediaKeySession.prototype.keyStatuses;


/**
 * @param {string} initDataType
 * @param {!BufferSource} initData
 * @return {!Promise}
 */
MediaKeySession.prototype.generateRequest = function(initDataType, initData) {};


/**
 * @param {string} sessionId
 * @return {!Promise.<boolean>}}
 */
MediaKeySession.prototype.load = function(sessionId) {};


/**
 * @param {?BufferSource} response
 * @return {!Promise}
 */
MediaKeySession.prototype.update = function(response) {};


/** @return {!Promise} */
MediaKeySession.prototype.close = function() {};


/** @return {!Promise} */
MediaKeySession.prototype.remove = function() {};


/** @override */
MediaKeySession.prototype.addEventListener =
    function(type, listener, useCapture) {};


/** @override */
MediaKeySession.prototype.removeEventListener =
    function(type, listener, useCapture) {};


/** @override */
MediaKeySession.prototype.dispatchEvent = function(evt) {};



/**
 * @constructor
 * @param {string} type
 * @param {Object=} opt_eventInitDict
 * @extends {Event}
 */
function MediaKeyMessageEvent(type, opt_eventInitDict) {}


/** @const {string} */
MediaKeyMessageEvent.prototype.messageType;


/** @const {!ArrayBuffer} */
MediaKeyMessageEvent.prototype.message;


/** @const {!MediaKeySession} */
MediaKeyMessageEvent.prototype.target;



/**
 * @constructor
 * @param {string} type
 * @param {Object=} opt_eventInitDict
 * @extends {Event}
 */
function MediaEncryptedEvent(type, opt_eventInitDict) {}


/** @const {string} */
MediaEncryptedEvent.prototype.initDataType;


/** @const {ArrayBuffer} */
MediaEncryptedEvent.prototype.initData;


/** @const {!HTMLMediaElement} */
MediaEncryptedEvent.prototype.target;

