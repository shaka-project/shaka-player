/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for SVTA Ad Creative Signaling
 *
 * @externs
 */

/* eslint-disable @stylistic/max-len */

shaka.extern.AdCreativeSignaling = {};

/**
 * @typedef {{
 *   version: (number|undefined),
 *   type: (string|undefined),
 *   payload: !Array<!(shaka.extern.AdCreativeSignaling.Slot|shaka.extern.AdCreativeSignaling.Pod|shaka.extern.AdCreativeSignaling.TrackingEvent|shaka.extern.AdCreativeSignaling.Verification)>,
 *   features: (!{
 *     remoteFields: boolean
 *   }|undefined)
 * }}
 */
shaka.extern.AdCreativeSignaling.CarriageEnvelope;

/**
 * @typedef {{
 *   type: (string|undefined),
 *   start: number,
 *   duration: number,
 *   identifiers: (!Array<!shaka.extern.AdCreativeSignaling.AdIdentifier>|undefined),
 *   tracking: (!Array<!shaka.extern.AdCreativeSignaling.TrackingEvent>|undefined),
 *   verifications: (!Array<!shaka.extern.AdCreativeSignaling.Verification>|undefined),
 *   skipOffset: (number|undefined),
 *   clickThrough: (string|undefined),
 *   $remote: (!shaka.extern.AdCreativeSignaling.RemoteFields|undefined)
 * }}
 */
shaka.extern.AdCreativeSignaling.Slot;

/**
 * @typedef {{
 *   start: (number|undefined),
 *   duration: number,
 *   slots: (!Array<!shaka.extern.AdCreativeSignaling.Slot>|undefined),
 *   tracking: (!Array<!shaka.extern.AdCreativeSignaling.TrackingEvent>|undefined),
 *   $remote: (!shaka.extern.AdCreativeSignaling.RemoteFields|undefined)
 * }}
 */
shaka.extern.AdCreativeSignaling.Pod;

/**
 * @typedef {{
 *   scheme: string,
 *   value: string
 * }}
 */
shaka.extern.AdCreativeSignaling.AdIdentifier;

/**
 * @typedef {{
 *   type: string,
 *   offset: (number|undefined),
 *   urls: !Array<string>
 * }}
 */
shaka.extern.AdCreativeSignaling.TrackingEvent;

/**
 * @typedef {{
 *   vendor: string,
 *   resource: (string|undefined),
 *   parameters: (string|undefined)
 * }}
 */
shaka.extern.AdCreativeSignaling.Verification;

/**
 * @typedef {{
 *   tracking: (string|undefined),
 *   slots: (string|undefined),
 *   verifications: (string|undefined)
 * }}
 */
shaka.extern.AdCreativeSignaling.RemoteFields;
