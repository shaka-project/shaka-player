/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for Media Tailor.
 * @externs
 */


/** @const */
var mediaTailor = {};


/**
 * @typedef {{
 *   manifestUrl: ?string,
 *   trackingUrl: ?string
 * }}
 *
 * @property {?string} manifestUrl
 * @property {?string} trackingUrl
 * @exportDoc
 */
mediaTailor.SessionResponse;


/**
 * @typedef {{
 *   avails: !Array<mediaTailor.AdBreak>
 * }}
 *
 * @property {!Array<mediaTailor.AdBreak>} avails
 * @exportDoc
 */
mediaTailor.TrackingResponse;


/**
 * @typedef {{
 *   adBreakTrackingEvents: !Array<mediaTailor.TrackingEvent>,
 *   ads: !Array<mediaTailor.Ad>,
 *   durationInSeconds: number,
 *   nonLinearAdsList: !Array<mediaTailor.Ad>,
 *   startTimeInSeconds: number
 * }}
 *
 * @property {!Array<mediaTailor.TrackingEvent>} adBreakTrackingEvents
 * @property {!Array<mediaTailor.Ad>} ads
 * @property {number} durationInSeconds
 * @property {!Array<mediaTailor.Ad>} nonLinearAdsList
 * @property {number} startTimeInSeconds
 * @exportDoc
 */
mediaTailor.AdBreak;


/**
 * @typedef {{
 *   adId: string,
 *   adParameters: string,
 *   adSystem: string,
 *   adTitle: string,
 *   creativeId: string,
 *   creativeSequence: string,
 *   durationInSeconds: number,
 *   skipOffset: ?string,
 *   startTimeInSeconds: number,
 *   nonLinearAdList: !Array<mediaTailor.NonLinearAd>,
 *   trackingEvents: !Array<mediaTailor.TrackingEvent>,
 *   vastAdId: ?string
 * }}
 *
 * @property {string} adId
 * @property {string} adParameters
 * @property {string} adSystem
 * @property {string} adTitle
 * @property {string} creativeId
 * @property {string} creativeSequence
 * @property {number} durationInSeconds
 * @property {?string} skipOffset
 * @property {number} startTimeInSeconds
 * @property {!Array<mediaTailor.NonLinearAd>} nonLinearAdList
 * @property {!Array<mediaTailor.TrackingEvent>} trackingEvents
 * @property {?string} vastAdId
 * @exportDoc
 */
mediaTailor.Ad;


/**
 * @typedef {{
 *   adId: string,
 *   adParameters: string,
 *   adSystem: string,
 *   adTitle: string,
 *   creativeAdId: string,
 *   creativeId: string,
 *   creativeSequence: string,
 *   height: ?number,
 *   width: ?number,
 *   staticResource: string
 * }}
 *
 * @property {string} adId
 * @property {string} adParameters
 * @property {string} adSystem
 * @property {string} adTitle
 * @property {string} creativeAdId
 * @property {string} creativeId
 * @property {string} creativeSequence
 * @property {?number} height
 * @property {?number} width
 * @property {string} staticResource
 * @exportDoc
 */
mediaTailor.NonLinearAd;


/**
 * @typedef {{
 *   beaconUrls: !Array<string>,
 *   eventType: string
 * }}
 *
 * @property {!Array<string>} beaconUrls
 * @property {string} eventType
 * @exportDoc
 */
mediaTailor.TrackingEvent;


/** @const */
var mediaTailorExternalResource = {};


/**
 * @typedef {{
 *   apps: !Array<mediaTailorExternalResource.App>
 * }}
 *
 * @property {!Array<mediaTailorExternalResource.App>} apps
 * @exportDoc
 */
mediaTailorExternalResource.Response;


/**
 * @typedef {{
 *   placeholder: mediaTailorExternalResource.AppPlaceholder,
 *   data: mediaTailorExternalResource.AppData
 * }}
 *
 * @property {mediaTailorExternalResource.AppPlaceholder} placeholder
 * @property {mediaTailorExternalResource.AppData} data
 * @exportDoc
 */
mediaTailorExternalResource.App;


/**
 * @typedef {{
 *   left: number,
 *   top: number
 * }}
 *
 * @property {number} left
 * @property {number} top
 * @exportDoc
 */
mediaTailorExternalResource.AppPlaceholder;


/**
 * @typedef {{
 *   source: !Array<mediaTailorExternalResource.AppDataSource>
 * }}
 *
 * @property {!Array<mediaTailorExternalResource.AppDataSource>} source
 * @exportDoc
 */
mediaTailorExternalResource.AppData;


/**
 * @typedef {{
 *   url: string
 * }}
 *
 * @property {string} url
 * @exportDoc
 */
mediaTailorExternalResource.AppDataSource;
