/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * @externs
 */


/**
 * @typedef {{
 *   publishKey: string,
 *   subscribeKey: string,
 *   userId: (string|undefined),
 *   maxDriftThreshold: (number|undefined),
 *   syncIntervalMs: (number|undefined)
 * }}
 *
 * @description
 * Configuration object for SyncManager.
 *
 * @property {string} publishKey
 *   Your PubNub publish key from the PubNub Admin Dashboard.
 * @property {string} subscribeKey
 *   Your PubNub subscribe key from the PubNub Admin Dashboard.
 * @property {string|undefined} userId
 *   Optional unique identifier for this client. If not provided,
 *   a random ID will be generated.
 * @property {number|undefined} maxDriftThreshold
 *   Maximum allowed time drift (in seconds) before forcing correction.
 *   Default is 0.5 seconds.
 * @property {number|undefined} syncIntervalMs
 *   How often (in milliseconds) to send sync pulses. Default is 5000ms.
 * @exportDoc
 */
shaka.sync.SyncManager.Config;


/**
 * @typedef {{
 *   timestamp: number,
 *   senderId: string,
 *   isPaused: boolean,
 *   currentTime: (number|undefined),
 *   playbackRate: (number|undefined)
 * }}
 *
 * @description
 * Payload object for sync commands.
 */
shaka.sync.SyncManager.SyncPayload;


/**
 * @typedef {{
 *   type: string,
 *   command: string,
 *   payload: shaka.sync.SyncManager.SyncPayload
 * }}
 *
 * @description
 * Message object for sync commands.
 */
shaka.sync.SyncManager.SyncMessage;

