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


/** @const */
var __onGCastApiAvailable;


/** @const */
var cast = {};


/** @const */
cast.receiver = {};


/** @const */
cast.receiver.system = {};


cast.receiver.system.DisconnectReason = {
  REQUESTED_BY_SENDER: 'requested by sender',
  ERROR: 'error',
  UNKNOWN: 'unknown'
};



/**
 * @param {string} namespace
 * @param {string} ipcChannel
 * @param {Array.<string>} senders
 * @param {string=} opt_messageType
 * @constructor
 */
cast.receiver.CastMessageBus = function(
    namespace, ipcChannel, senders, opt_messageType) {};


/**
 * @param {*} message
 */
cast.receiver.CastMessageBus.prototype.broadcast = function(message) {};



/** @constructor */
cast.receiver.CastReceiverManager = function() {};



/** @constructor */
cast.receiver.CastReceiverManager.Config = function() {};


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


/**
 * @param {cast.receiver.CastReceiverManager.Config=} opt_config
 */
cast.receiver.CastReceiverManager.prototype.start = function(opt_config) {};


/** @const */
chrome.cast = {};


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
 * @param {Object=} opt_autoJoinPolicy
 * @param {Object=} opt_defaultActionPolicy
 * @constructor
 */
chrome.cast.ApiConfig = function(
    sessionRequest,
    sessionListener,
    receiverListener,
    opt_autoJoinPolicy,
    opt_defaultActionPolicy) {};


/** @typedef {string} */
chrome.cast.Capability;



/**
 * @param {string} url
 * @constructor
 */
chrome.cast.Image = function(url) {};



/**
 * @param {string} label
 * @param {string} friendlyName
 * @param {Array.<chrome.cast.Capability>=} opt_capabilities
 * @param {chrome.cast.Volume=} opt_volume
 * @constructor
 */
chrome.cast.Receiver = function(
    label, friendlyName, opt_capabilities, opt_volume) {};



/**
 * @param {string} sessionId
 * @param {string} appId
 * @param {string} displayName
 * @param {chrome.cast.Image} appImages
 * @param {chrome.cast.Receiver} receiver
 * @constructor
 */
chrome.cast.Session = function(
    sessionId, appId, displayName, appImages, receiver) {};


/** @type {string} */
chrome.cast.Session.prototype.sessionId;


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
 * @param {Array.<chrome.cast.Capability>=} opt_capabilities
 * @param {number=} opt_timeout
 * @constructor
 */
chrome.cast.SessionRequest = function(appId, opt_capabilities, opt_timeout) {};



/**
 * @param {number=} opt_level
 * @param {boolean=} opt_muted
 * @constructor
 */
chrome.cast.Volume = function(opt_level, opt_muted) {};
