/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for PubNub SDK.
 * @externs
 */


/**
 * PubNub keys for the demo app, loaded from keys.local.js.
 * @type {{publishKey: string, subscribeKey: string}|undefined}
 */
window.PUBNUB_KEYS;


/**
 * PubNub SDK constructor.
 * @constructor
 * @param {PubNubConfig} config
 */
function PubNub(config) {}


/**
 * @typedef {{
 *   publishKey: string,
 *   subscribeKey: string,
 *   userId: string,
 *   enableEventEngine: (boolean|undefined)
 * }}
 */
var PubNubConfig;


/**
 * @typedef {{
 *   category: string
 * }}
 */
var PubNubStatusEvent;


/**
 * @typedef {{
 *   message: *,
 *   channel: (string|undefined),
 *   timetoken: (string|undefined)
 * }}
 */
var PubNubMessageEvent;


/**
 * @typedef {{
 *   action: string,
 *   uuid: string,
 *   channel: (string|undefined),
 *   occupancy: (number|undefined)
 * }}
 */
var PubNubPresenceEvent;


/**
 * @typedef {{
 *   status: function(PubNubStatusEvent)
 * }}
 */
var PubNubListener;


/**
 * Adds a listener for PubNub events.
 * @param {PubNubListener} listener
 */
PubNub.prototype.addListener = function(listener) {};


/**
 * Removes all listeners.
 */
PubNub.prototype.removeAllListeners = function() {};


/**
 * Destroys the PubNub instance.
 */
PubNub.prototype.destroy = function() {};


/**
 * Gets a channel object.
 * @param {string} channelName
 * @return {PubNubChannel}
 */
PubNub.prototype.channel = function(channelName) {};


/**
 * Publishes a message to a channel.
 * @param {{channel: string, message: *}} params
 * @return {!Promise<*>}
 */
PubNub.prototype.publish = function(params) {};


/**
 * @typedef {{
 *   receivePresenceEvents: (boolean|undefined)
 * }}
 */
var PubNubSubscriptionOptions;


/**
 * PubNub Channel object.
 * @constructor
 */
function PubNubChannel() {}


/**
 * Creates a subscription for the channel.
 * @param {PubNubSubscriptionOptions=} options
 * @return {PubNubSubscription}
 */
PubNubChannel.prototype.subscription = function(options) {};


/**
 * PubNub Subscription object.
 * @constructor
 */
function PubNubSubscription() {}


/**
 * Callback for incoming messages.
 * @type {?function(PubNubMessageEvent)}
 */
PubNubSubscription.prototype.onMessage;


/**
 * Callback for presence events.
 * @type {?function(PubNubPresenceEvent)}
 */
PubNubSubscription.prototype.onPresence;


/**
 * Subscribes to the channel.
 */
PubNubSubscription.prototype.subscribe = function() {};


/**
 * Unsubscribes from the channel.
 */
PubNubSubscription.prototype.unsubscribe = function() {};

