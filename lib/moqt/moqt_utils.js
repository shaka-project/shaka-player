/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.moqt.Utils');


shaka.moqt.Utils = class {

};

/**
 * Enum for message type IDs, matching the draft-11 specification
 *
 * @enum {number}
 */
shaka.moqt.Utils.MessageTypeId = {
  SUBSCRIBE: 0x3,
  SUBSCRIBE_OK: 0x4,
  SUBSCRIBE_ERROR: 0x5,
  SUBSCRIBE_UPDATE: 0x2,
  SUBSCRIBE_DONE: 0xb,
  UNSUBSCRIBE: 0xa,
  ANNOUNCE: 0x6,
  ANNOUNCE_OK: 0x7,
  ANNOUNCE_ERROR: 0x8,
  UNANNOUNCE: 0x9,
  REQUESTS_BLOCKED: 0x1a,
  CLIENT_SETUP: 0x20,
  SERVER_SETUP: 0x21,
};

/**
 * Enum for message names, matching the draft-11 specification
 *
 * @enum {string}
 */
shaka.moqt.Utils.MessageType = {
  SUBSCRIBE: 'subscribe',
  SUBSCRIBE_OK: 'subscribe_ok',
  SUBSCRIBE_ERROR: 'subscribe_error',
  SUBSCRIBE_UPDATE: 'subscribe_update',
  SUBSCRIBE_DONE: 'subscribe_done',
  UNSUBSCRIBE: 'unsubscribe',
  ANNOUNCE: 'announce',
  ANNOUNCE_OK: 'announce_ok',
  ANNOUNCE_ERROR: 'announce_error',
  UNANNOUNCE: 'unannounce',
  REQUESTS_BLOCKED: 'requests_blocked',
};

/**
 * @enum {number}
 */
shaka.moqt.Utils.GroupOrder = {
  PUBLISHER: 0x0, // Original publisher's order should be used
  ASCENDING: 0x1,
  DESCENDING: 0x2,
};

/**
 * @enum {number}
 */
shaka.moqt.Utils.FilterType = {
  NONE: 0x0,
  NEXT_GROUP_START: 0x1,
  LATEST_OBJECT: 0x2,
  ABSOLUTE_START: 0x3,
  ABSOLUTE_RANGE: 0x4,
};

/**
 * @enum {number}
 */
shaka.moqt.Utils.Version = {
  DRAFT_11: 0xff00000b,
};

/**
 * @enum {number}
 */
shaka.moqt.Utils.SetupType = {
  CLIENT: 0x20,
  SERVER: 0x21,
};


/**
 * @typedef {{
 *   type: number,
 *   value: (number|!Uint8Array),
 * }}
 *
 * @property {number} type
 * @property {(number|!Uint8Array)} value
 */
shaka.moqt.Utils.KeyValuePair;


/**
 * @typedef {{
 *   group: number,
 *   object: number,
 *   subgroup: ?(number|undefined)
 * }}
 *
 * @property {number} group
 * @property {number} object
 * @property {?(number|undefined)} subgroup
 */
shaka.moqt.Utils.Location;


/**
 * @typedef {{
 *   kind: shaka.moqt.Utils.MessageType,
 *   requestId: number,
 *   trackAlias: number,
 *   namespace: Array<string>,
 *   name: string,
 *   subscriberPriority: number,
 *   groupOrder: shaka.moqt.Utils.GroupOrder,
 *   forward: boolean,
 *   filterType: shaka.moqt.Utils.FilterType,
 *   startLocation: (shaka.moqt.Utils.Location|undefined),
 *   endGroup: (number|undefined),
 *   params: Array<shaka.moqt.Utils.KeyValuePair>,
 * }}
 *
 * @property {shaka.moqt.Utils.MessageType} kind
 * @property {number} requestId
 * @property {number} trackAlias
 * @property {Array<string>} namespace
 * @property {string} name
 * @property {number} subscriberPriority
 * @property {shaka.moqt.Utils.GroupOrder} groupOrder
 * @property {boolean} forward
 * @property {shaka.moqt.Utils.FilterType} filterType
 * @property {(shaka.moqt.Utils.Location|undefined)} startLocation
 * @property {(number|undefined)} endGroup
 * @property {Array<shaka.moqt.Utils.KeyValuePair>} params
 */
shaka.moqt.Utils.Subscribe;


/**
 * @typedef {{
 *   kind: shaka.moqt.Utils.MessageType,
 *   requestId: number,
 *   expires: number,
 *   groupOrder: shaka.moqt.Utils.GroupOrder,
 *   contentExists: boolean,
 *   largest: (shaka.moqt.Utils.Location|undefined),
 *   params: Array<shaka.moqt.Utils.KeyValuePair>,
 * }}
 *
 * @property {shaka.moqt.Utils.MessageType} kind
 * @property {number} requestId
 * @property {number} expires
 * @property {shaka.moqt.Utils.GroupOrder} groupOrder
 * @property {boolean} contentExists
 * @property {(shaka.moqt.Utils.Location|undefined)} largest
 * @property {Array<shaka.moqt.Utils.KeyValuePair>} params
 */
shaka.moqt.Utils.SubscribeOk;


/**
 * @typedef {{
 *   kind: shaka.moqt.Utils.MessageType,
 *   requestId: number,
 *   code: number,
 *   reason: string,
 *   trackAlias: number,
 * }}
 *
 * @property {shaka.moqt.Utils.MessageType} kind
 * @property {number} requestId
 * @property {number} code
 * @property {string} reason
 * @property {number} trackAlias
 */
shaka.moqt.Utils.SubscribeError;


/**
 * @typedef {{
 *   kind: shaka.moqt.Utils.MessageType,
 *   requestId: number,
 *   startLocation: shaka.moqt.Utils.Location,
 *   endGroup: number,
 *   subscriberPriority: number,
 *   forward: boolean,
 *   params: Array<shaka.moqt.Utils.KeyValuePair>,
 * }}
 *
 * @property {shaka.moqt.Utils.MessageType} kind
 * @property {number} requestId
 * @property {shaka.moqt.Utils.Location} startLocation
 * @property {number} endGroup
 * @property {number} subscriberPriority
 * @property {boolean} forward
 * @property {Array<shaka.moqt.Utils.KeyValuePair>} params
 */
shaka.moqt.Utils.SubscribeUpdate;


/**
 * @typedef {{
 *   kind: shaka.moqt.Utils.MessageType,
 *   requestId: number,
 * }}
 *
 * @property {shaka.moqt.Utils.MessageType} kind
 * @property {number} requestId
 */
shaka.moqt.Utils.Unsubscribe;


/**
 * @typedef {{
 *   kind: shaka.moqt.Utils.MessageType,
 *   requestId: number,
 *   code: number,
 *   streamCount: number,
 *   reason: string,
 * }}
 *
 * @property {shaka.moqt.Utils.MessageType} kind
 * @property {number} requestId
 * @property {number} code
 * @property {number} streamCount
 * @property {string} reason
 */
shaka.moqt.Utils.SubscribeDone;


/**
 * @typedef {{
 *   kind: shaka.moqt.Utils.MessageType,
 *   requestId: number,
 *   namespace: Array<string>,
 *   params: Array<shaka.moqt.Utils.KeyValuePair>,
 * }}
 *
 * @property {shaka.moqt.Utils.MessageType} kind
 * @property {number} requestId
 * @property {Array<string>} namespace
 * @property {Array<shaka.moqt.Utils.KeyValuePair>} params
 */
shaka.moqt.Utils.Announce;


/**
 * @typedef {{
 *   kind: shaka.moqt.Utils.MessageType,
 *   requestId: number,
 *   namespace: Array<string>,
 * }}
 *
 * @property {shaka.moqt.Utils.MessageType} kind
 * @property {number} requestId
 * @property {Array<string>} namespace
 */
shaka.moqt.Utils.AnnounceOk;


/**
 * @typedef {{
 *   kind: shaka.moqt.Utils.MessageType,
 *   requestId: number,
 *   code: number,
 *   reason: string,
 * }}
 *
 * @property {shaka.moqt.Utils.MessageType} kind
 * @property {number} requestId
 * @property {number} code
 * @property {string} reason
 */
shaka.moqt.Utils.AnnounceError;


/**
 * @typedef {{
 *   kind: shaka.moqt.Utils.MessageType,
 *   namespace: Array<string>,
 * }}
 *
 * @property {shaka.moqt.Utils.MessageType} kind
 * @property {Array<string>} namespace
 */
shaka.moqt.Utils.Unannounce;


/**
 * @typedef {{
 *   kind: shaka.moqt.Utils.MessageType,
 *   maximumRequestId: number,
 * }}
 *
 * @property {shaka.moqt.Utils.MessageType} kind
 * @property {number} maximumRequestId
 */
shaka.moqt.Utils.RequestsBlocked;


/**
 * @typedef {{
 *   versions: Array<number>,
 *   params: (Array<shaka.moqt.Utils.KeyValuePair>|undefined),
 * }}
 *
 * @property {Array<number>} versions
 * @property {(Array<shaka.moqt.Utils.KeyValuePair>|undefined)} params
 */
shaka.moqt.Utils.ClientSetup;


/**
 * @typedef {{
 *   version: number,
 *   params: (Array<shaka.moqt.Utils.KeyValuePair>|undefined),
 * }}
 *
 * @property {number} version
 * @property {(Array<shaka.moqt.Utils.KeyValuePair>|undefined)} params
 */
shaka.moqt.Utils.ServerSetup;


/**
 * @typedef {shaka.moqt.Utils.Subscribe|shaka.moqt.Utils.Unsubscribe|
 *           shaka.moqt.Utils.AnnounceOk|shaka.moqt.Utils.AnnounceError}
 */
shaka.moqt.Utils.Subscriber;


/**
 * @typedef {shaka.moqt.Utils.SubscribeOk|shaka.moqt.Utils.SubscribeError|
 *           shaka.moqt.Utils.SubscribeDone|shaka.moqt.Utils.Announce|
 *           shaka.moqt.Utils.Unannounce|shaka.moqt.Utils.RequestsBlocked}
 */
shaka.moqt.Utils.Publisher;


/**
 * @typedef {shaka.moqt.Utils.Subscriber|shaka.moqt.Utils.Publisher}
 */
shaka.moqt.Utils.Message;


/**
 * @typedef {function(shaka.moqt.Utils.Message)}
 */
shaka.moqt.Utils.MessageHandler;


/**
 * @typedef {{
 *   trackAlias: number,
 *   location: shaka.moqt.Utils.Location,
 *   data: !Uint8Array,
 *   extensions: ?(Uint8Array|undefined),
 *   status: ?(number|undefined)
 * }}
 *
 * @property {number} trackAlias
 * @property {shaka.moqt.Utils.Location} location
 * @property {!Uint8Array} data
 * @property {?(Uint8Array|undefined)} extensions
 * @property {?(number|undefined)} status
 */
shaka.moqt.Utils.MoQObject;


/**
 * @typedef {function(shaka.moqt.Utils.MoQObject)}
 */
shaka.moqt.Utils.ObjectCallback;


/**
 * @typedef {{
 *   namespace: string,
 *   trackName: string,
 *   trackAlias: number,
 *   requestId: number,
 *   callbacks: !Array<shaka.moqt.Utils.ObjectCallback>,
 * }}
 *
 * @property {string} namespace
 * @property {string} trackName
 * @property {number} trackAlias
 * @property {number} requestId
 * @property {!Array<shaka.moqt.Utils.ObjectCallback>} callbacks
 */
shaka.moqt.Utils.TrackInfo;


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
 *   parentName: (string|undefined),
 *   trackDuration: (number|undefined)
 * }}
 *
 * @property {string} name
 * @property {(string|undefined)} namespace
 * @property {(string|undefined)} packaging
 * @property {(string|undefined)} role
 * @property {boolean} isLive
 * @property {(string|undefined)} label
 * @property {(number|undefined)} renderGroup
 * @property {(number|undefined)} altGroup
 * @property {(string|undefined)} initData
 * @property {(Array<string>|undefined)} depends
 * @property {(number|undefined)} temporalId
 * @property {(number|undefined)} spatialId
 * @property {(string|undefined)} codec
 * @property {(string|undefined)} mimeType
 * @property {(number|undefined)} framerate
 * @property {(number|undefined)} timescale
 * @property {(number|undefined)} bitrate
 * @property {(number|undefined)} width
 * @property {(number|undefined)} height
 * @property {(number|undefined)} samplerate
 * @property {(string|undefined)} channelConfig
 * @property {(number|undefined)} displayWidth
 * @property {(number|undefined)} displayHeight
 * @property {(string|undefined)} lang
 * @property {(string|undefined)} parentName
 * @property {(number|undefined)} trackDuration
 */
shaka.moqt.Utils.WarpTrack;


/**
 * @typedef {{
 *   version: number,
 *   deltaUpdate: (boolean|undefined),
 *   addTracks: (Array<!shaka.moqt.Utils.WarpTrack>|undefined),
 *   removeTracks: (Array<!shaka.moqt.Utils.WarpTrack>|undefined),
 *   cloneTracks: (Array<!shaka.moqt.Utils.WarpTrack>|undefined),
 *   generatedAt: (number|undefined),
 *   tracks: !Array<!shaka.moqt.Utils.WarpTrack>
 * }}
 *
 * @property {number} version
 * @property {(boolean|undefined)} deltaUpdate
 * @property {(Array<!shaka.moqt.Utils.WarpTrack>|undefined)} addTracks
 * @property {(Array<!shaka.moqt.Utils.WarpTrack>|undefined)} removeTracks
 * @property {(Array<!shaka.moqt.Utils.WarpTrack>|undefined)} cloneTracks
 * @property {(number|undefined)} generatedAt
 * @property {!Array<!shaka.moqt.Utils.WarpTrack>} tracks
 */
shaka.moqt.Utils.WarpCatalog;
