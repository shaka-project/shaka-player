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
 * Represents a URL object used in DRM system fields such as laURL, certURL
 * and authzURL, as defined in the CMSF Content Protection section.
 *
 * @typedef {{
 *   url: string,
 *   type: (string|undefined),
 * }}
 */
msfCatalog.DrmUrl;


/**
 * Describes a single DRM system configuration within a Content Protection
 * entry, as defined in the CMSF Content Protection section (drmSystem field).
 *
 * @typedef {{
 *   systemID: string,
 *   laURL: (!msfCatalog.DrmUrl|undefined),
 *   certURL: (!msfCatalog.DrmUrl|undefined),
 *   authzURL: (!msfCatalog.DrmUrl|undefined),
 *   pssh: (string|undefined),
 *   robustness: (string|undefined),
 * }}
 */
msfCatalog.DrmSystem;


/**
 * Describes a single content protection entry at the root level of the
 * catalog, as defined in the CMSF Content Protection section.
 * Tracks reference these entries via contentProtectionRefIDs.
 *
 * @typedef {{
 *   refID: string,
 *   defaultKID: !Array<string>,
 *   scheme: string,
 *   drmSystem: !msfCatalog.DrmSystem,
 * }}
 */
msfCatalog.ContentProtection;


/**
 * Describes a single accessibility descriptor within a Track entry,
 * as defined in the MSF catalog accessibility field.
 * The schemeId identifies the accessibility scheme (e.g. CEA-608, CEA-708),
 * and the optional value carries the scheme-specific parameters such as
 * channel-to-language assignments.
 *
 * CEA-608 example: { schemeId: "urn:scte:dash:cc:cea-608:2015",
 *                    value: "CC1=eng;CC3=spa" }
 * CEA-708 example: { schemeId: "urn:scte:dash:cc:cea-708:2015",
 *                    value: "1=lang:eng;2=lang:spa" }
 *
 * @typedef {{
 *   schemeId: string,
 *   value: (string|undefined),
 * }}
 */
msfCatalog.Accessibility;


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
 *   contentProtectionRefIDs: (Array<string>|undefined),
 *   accessibility: (Array<!msfCatalog.Accessibility>|undefined),
 * }}
 */
msfCatalog.Track;


/**
 * @typedef {{
 *   version: number,
 *   generatedAt: (number|undefined),
 *   isComplete: (boolean|undefined),
 *   deltaUpdate: (boolean|undefined),
 *   contentProtections: (Array<!msfCatalog.ContentProtection>|undefined),
 *   addTracks: (Array<!msfCatalog.Track>|undefined),
 *   removeTracks: (Array<!msfCatalog.Track>|undefined),
 *   cloneTracks: (Array<!msfCatalog.Track>|undefined),
 *   tracks: !Array<!msfCatalog.Track>
 * }}
 */
msfCatalog.Catalog;
