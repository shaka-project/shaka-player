/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for MSF Catalog JSON structures.
 * @externs
 */


/** @const */
var msfCatalog = {};


/**
 * @typedef {{
 *   namespace: (string|undefined),
 *   name: string,
 *   packaging: string,
 *   role: (string|undefined),
 *   isLive: boolean,
 *   label: (string|undefined),
 *   renderGroup: (number|undefined),
 *   altGroup: (number|undefined),
 *   initData: (string|undefined),
 *   depends: (Array<string>|undefined),
 *   temporalId: (number|undefined),
 *   spatialId: (number|undefined),
 *   codec: (string|undefined),
 *   mimeType: (string|undefined),
 *   framerate: (number|undefined),
 *   timescale: (number|undefined),
 *   bitrate: (number|undefined),
 *   width: (number|undefined),
 *   height: (number|undefined),
 *   samplerate: (number|undefined),
 *   channelConfig: (string|undefined),
 *   displayWidth: (number|undefined),
 *   displayHeight: (number|undefined),
 *   lang: (string|undefined),
 *   targetLatency: (number|undefined),
 *   trackDuration: (number|undefined),
 *   eventType: (string|undefined),
 *   parentName: (string|undefined),
 * }}
 */
msfCatalog.Track;


/**
 * @typedef {{
 *   version: number,
 *   generatedAt: (number|undefined),
 *   isComplete: (boolean|undefined),
 *   deltaUpdate: (boolean|undefined),
 *   addTracks: (Array<!msfCatalog.Track>|undefined),
 *   removeTracks: (Array<!msfCatalog.Track>|undefined),
 *   cloneTracks: (Array<!msfCatalog.Track>|undefined),
 *   tracks: !Array<!msfCatalog.Track>
 * }}
 */
msfCatalog.Catalog;
