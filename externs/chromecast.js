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
 * @fileoverview Google Cast API externs.
 * Based on the {@link https://goo.gl/psEjEh Google Cast API}.
 * @externs
 */


/** @type {function(boolean)} */
var __onGCastApiAvailable;


/** @const */
var cast = {};


/** @const */
cast.receiver = {};


/** @const */
cast.receiver.system = {};



/**
 * @constructor
 * @struct
 */
cast.receiver.system.SystemVolumeData = function() {};


/** @type {number} */
cast.receiver.system.SystemVolumeData.prototype.level;


/** @type {boolean} */
cast.receiver.system.SystemVolumeData.prototype.muted;



/**
 * @constructor
 * @struct
 */
cast.receiver.CastMessageBus = function() {};


/** @param {*} message */
cast.receiver.CastMessageBus.prototype.broadcast = function(message) {};


/**
 * @param {string} senderId
 * @return {!cast.receiver.CastChannel}
 */
cast.receiver.CastMessageBus.prototype.getCastChannel = function(senderId) {};


/** @type {Function} */
cast.receiver.CastMessageBus.prototype.onMessage;



/**
 * @constructor
 * @struct
 */
cast.receiver.CastMessageBus.Event = function() {};


/** @type {?} */
cast.receiver.CastMessageBus.Event.prototype.data;


/** @type {string} */
cast.receiver.CastMessageBus.Event.prototype.senderId;



/**
 * @constructor
 * @struct
 */
cast.receiver.CastChannel = function() {};


/** @param {*} message */
cast.receiver.CastChannel.prototype.send = function(message) {};



/**
 * @constructor
 * @struct
 */
cast.receiver.CastReceiverManager = function() {};


/** @return {cast.receiver.CastReceiverManager} */
cast.receiver.CastReceiverManager.getInstance = function() {};


/**
 * @param {string} namespace
 * @param {string=} opt_messageType
 * @return {cast.receiver.CastMessageBus}
 */
cast.receiver.CastReceiverManager.prototype.getCastMessageBus = function(
    namespace, opt_messageType) {};


/** @return {Array.<string>} */
cast.receiver.CastReceiverManager.prototype.getSenders = function() {};


cast.receiver.CastReceiverManager.prototype.start = function() {};


cast.receiver.CastReceiverManager.prototype.stop = function() {};


/** @return {?cast.receiver.system.SystemVolumeData} */
cast.receiver.CastReceiverManager.prototype.getSystemVolume = function() {};


/** @param {number} level */
cast.receiver.CastReceiverManager.prototype.setSystemVolumeLevel =
    function(level) {};


/** @param {number} muted */
cast.receiver.CastReceiverManager.prototype.setSystemVolumeMuted =
    function(muted) {};


/** @return {boolean} */
cast.receiver.CastReceiverManager.prototype.isSystemReady = function() {};


/** @type {Function} */
cast.receiver.CastReceiverManager.prototype.onSenderConnected;


/** @type {Function} */
cast.receiver.CastReceiverManager.prototype.onSenderDisconnected;


/** @type {Function} */
cast.receiver.CastReceiverManager.prototype.onSystemVolumeChanged;


/** @const */
chrome.cast = {};


/** @type {boolean} */
chrome.cast.isAvailable;


/**
 * @param {chrome.cast.ApiConfig} apiConfig
 * @param {Function} successCallback
 * @param {Function} errorCallback
 */
chrome.cast.initialize = function(apiConfig, successCallback, errorCallback) {};


/**
 * @param {Function} successCallback
 * @param {Function} errorCallback
 * @param {chrome.cast.SessionRequest=} opt_sessionRequest
 */
chrome.cast.requestSession = function(
    successCallback, errorCallback, opt_sessionRequest) {};



/**
 * @param {chrome.cast.SessionRequest} sessionRequest
 * @param {Function} sessionListener
 * @param {Function} receiverListener
 * @param {string=} opt_autoJoinPolicy
 * @param {string=} opt_defaultActionPolicy
 * @constructor
 * @struct
 */
chrome.cast.ApiConfig = function(
    sessionRequest,
    sessionListener,
    receiverListener,
    opt_autoJoinPolicy,
    opt_defaultActionPolicy) {};



/**
 * @param {string} code
 * @param {string=} opt_description
 * @param {Object=} opt_details
 * @constructor
 * @struct
 */
chrome.cast.Error = function(code, opt_description, opt_details) {};


/** @type {string} */
chrome.cast.Error.prototype.code;


/** @type {?string} */
chrome.cast.Error.prototype.description;


/** @type {Object} */
chrome.cast.Error.prototype.details;



/**
 * @constructor
 * @struct
 */
chrome.cast.Receiver = function() {};


/** @const {string} */
chrome.cast.Receiver.prototype.friendlyName;



/**
 * @constructor
 * @struct
 */
chrome.cast.Session = function() {};


/** @type {string} */
chrome.cast.Session.prototype.sessionId;


/** @type {string} */
chrome.cast.Session.prototype.status;


/** @type {chrome.cast.Receiver} */
chrome.cast.Session.prototype.receiver;


/**
 * @param {string} namespace
 * @param {Function} listener
 */
chrome.cast.Session.prototype.addMessageListener = function(
    namespace, listener) {};


/**
 * @param {Function} listener
 */
chrome.cast.Session.prototype.addUpdateListener = function(listener) {};


/**
 * @param {string} namespace
 * @param {!Object|string} message
 * @param {Function} successCallback
 * @param {Function} errorCallback
 */
chrome.cast.Session.prototype.sendMessage = function(
    namespace, message, successCallback, errorCallback) {};


/**
 * @param {Function} successCallback
 * @param {Function} errorCallback
 */
chrome.cast.Session.prototype.stop = function(
    successCallback, errorCallback) {};



/**
 * @param {string} appId
 * @constructor
 * @struct
 */
chrome.cast.SessionRequest = function(appId) {};
