/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.Utils');


shaka.msf.Utils = class {

};

/**
 * Enum for message type IDs, matching the draft-14 specification
 *
 * @enum {number}
 */
shaka.msf.Utils.MessageTypeId = {
  SUBSCRIBE: 0x3,
  SUBSCRIBE_OK: 0x4,
  SUBSCRIBE_ERROR: 0x5,
  SUBSCRIBE_UPDATE: 0x2,
  PUBLISH_DONE: 0xb,
  UNSUBSCRIBE: 0xa,
  PUBLISH_NAMESPACE: 0x6,
  PUBLISH_NAMESPACE_OK: 0x7,
  PUBLISH_NAMESPACE_ERROR: 0x8,
  UNPUBLISH_NAMESPACE: 0x9,
  REQUESTS_BLOCKED: 0x1a,
  CLIENT_SETUP: 0x20,
  SERVER_SETUP: 0x21,
};

/**
 * Enum for message names, matching the draft-11 specification
 *
 * @enum {string}
 */
shaka.msf.Utils.MessageType = {
  SUBSCRIBE: 'subscribe',
  SUBSCRIBE_OK: 'subscribe_ok',
  SUBSCRIBE_ERROR: 'subscribe_error',
  SUBSCRIBE_UPDATE: 'subscribe_update',
  PUBLISH_DONE: 'publish_done',
  UNSUBSCRIBE: 'unsubscribe',
  PUBLISH_NAMESPACE: 'publish_namespace',
  PUBLISH_NAMESPACE_OK: 'publish_namespace_ok',
  PUBLISH_NAMESPACE_ERROR: 'publish_namespace_error',
  UNPUBLISH_NAMESPACE: 'unpublish_namespace',
  REQUESTS_BLOCKED: 'requests_blocked',
};

/**
 * @enum {number}
 */
shaka.msf.Utils.GroupOrder = {
  PUBLISHER: 0x0, // Original publisher's order should be used
  ASCENDING: 0x1,
  DESCENDING: 0x2,
};

/**
 * @enum {number}
 */
shaka.msf.Utils.FilterType = {
  NONE: 0x0,
  NEXT_GROUP_START: 0x1,
  LATEST_OBJECT: 0x2,
  ABSOLUTE_START: 0x3,
  ABSOLUTE_RANGE: 0x4,
};

/**
 * @enum {number}
 */
shaka.msf.Utils.Version = {
  DRAFT_14: 0xff00000e,
};

/**
 * @enum {number}
 */
shaka.msf.Utils.SetupType = {
  CLIENT: 0x20,
  SERVER: 0x21,
};


/**
 * @typedef {{
 *   type: number,
 *   value: (number|!Uint8Array),
 * }}
 */
shaka.msf.Utils.KeyValuePair;


/**
 * @typedef {{
 *   group: number,
 *   object: number,
 *   subgroup: ?(number|undefined)
 * }}
 */
shaka.msf.Utils.Location;


/**
 * @typedef {{
 *   kind: shaka.msf.Utils.MessageType,
 *   requestId: number,
 *   namespace: Array<string>,
 *   name: string,
 *   subscriberPriority: number,
 *   groupOrder: shaka.msf.Utils.GroupOrder,
 *   forward: boolean,
 *   filterType: shaka.msf.Utils.FilterType,
 *   startLocation: (shaka.msf.Utils.Location|undefined),
 *   endGroup: (number|undefined),
 *   params: Array<shaka.msf.Utils.KeyValuePair>,
 * }}
 */
shaka.msf.Utils.Subscribe;


/**
 * @typedef {{
 *   kind: shaka.msf.Utils.MessageType,
 *   requestId: number,
 *   trackAlias: number,
 *   expires: number,
 *   groupOrder: shaka.msf.Utils.GroupOrder,
 *   contentExists: boolean,
 *   largest: (shaka.msf.Utils.Location|undefined),
 *   params: Array<shaka.msf.Utils.KeyValuePair>,
 * }}
 */
shaka.msf.Utils.SubscribeOk;


/**
 * @typedef {{
 *   kind: shaka.msf.Utils.MessageType,
 *   requestId: number,
 *   code: number,
 *   reason: string,
 *   trackAlias: number,
 * }}
 */
shaka.msf.Utils.SubscribeError;


/**
 * @typedef {{
 *   kind: shaka.msf.Utils.MessageType,
 *   requestId: number,
 *   startLocation: shaka.msf.Utils.Location,
 *   endGroup: number,
 *   subscriberPriority: number,
 *   forward: boolean,
 *   params: Array<shaka.msf.Utils.KeyValuePair>,
 * }}
 */
shaka.msf.Utils.SubscribeUpdate;


/**
 * @typedef {{
 *   kind: shaka.msf.Utils.MessageType,
 *   requestId: number,
 * }}
 */
shaka.msf.Utils.Unsubscribe;


/**
 * @typedef {{
 *   kind: shaka.msf.Utils.MessageType,
 *   requestId: number,
 *   code: number,
 *   streamCount: number,
 *   reason: string,
 * }}
 */
shaka.msf.Utils.PublishDone;


/**
 * @typedef {{
 *   kind: shaka.msf.Utils.MessageType,
 *   requestId: number,
 *   namespace: Array<string>,
 *   params: Array<shaka.msf.Utils.KeyValuePair>,
 * }}
 */
shaka.msf.Utils.PublishNamespace;


/**
 * @typedef {{
 *   kind: shaka.msf.Utils.MessageType,
 *   requestId: number,
 *   namespace: Array<string>,
 * }}
 */
shaka.msf.Utils.PublishNamespaceOk;


/**
 * @typedef {{
 *   kind: shaka.msf.Utils.MessageType,
 *   requestId: number,
 *   code: number,
 *   reason: string,
 * }}
 */
shaka.msf.Utils.PublishNamespaceError;


/**
 * @typedef {{
 *   kind: shaka.msf.Utils.MessageType,
 *   namespace: Array<string>,
 * }}
 */
shaka.msf.Utils.UnpublishNamespace;


/**
 * @typedef {{
 *   kind: shaka.msf.Utils.MessageType,
 *   maximumRequestId: number,
 * }}
 */
shaka.msf.Utils.RequestsBlocked;


/**
 * @typedef {{
 *   versions: Array<number>,
 *   params: (Array<shaka.msf.Utils.KeyValuePair>|undefined),
 * }}
 */
shaka.msf.Utils.ClientSetup;


/**
 * @typedef {{
 *   version: number,
 *   params: (Array<shaka.msf.Utils.KeyValuePair>|undefined),
 * }}
 */
shaka.msf.Utils.ServerSetup;


/**
 * @typedef {shaka.msf.Utils.Subscribe|shaka.msf.Utils.Unsubscribe|
 *           shaka.msf.Utils.PublishNamespaceOk|
 *           shaka.msf.Utils.PublishNamespaceError}
 */
shaka.msf.Utils.Subscriber;


/**
 * @typedef {shaka.msf.Utils.SubscribeOk|shaka.msf.Utils.SubscribeError|
 *           shaka.msf.Utils.PublishDone|shaka.msf.Utils.PublishNamespace|
 *           shaka.msf.Utils.UnpublishNamespace|shaka.msf.Utils.RequestsBlocked}
 */
shaka.msf.Utils.Publisher;


/**
 * @typedef {shaka.msf.Utils.Subscriber|shaka.msf.Utils.Publisher}
 */
shaka.msf.Utils.Message;


/**
 * @typedef {function(shaka.msf.Utils.Message)}
 */
shaka.msf.Utils.MessageHandler;


/**
 * @typedef {{
 *   trackAlias: number,
 *   location: shaka.msf.Utils.Location,
 *   data: !Uint8Array,
 *   extensions: ?(Uint8Array|undefined),
 *   status: ?(number|undefined)
 * }}
 */
shaka.msf.Utils.MoQObject;


/**
 * @typedef {function(shaka.msf.Utils.MoQObject)}
 */
shaka.msf.Utils.ObjectCallback;


/**
 * @typedef {{
 *   namespace: string,
 *   trackName: string,
 *   trackAlias: number,
 *   requestId: number,
 *   callbacks: !Array<shaka.msf.Utils.ObjectCallback>,
 * }}
 */
shaka.msf.Utils.TrackInfo;


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
 */
shaka.msf.Utils.MSFTrack;


/**
 * @typedef {{
 *   version: number,
 *   deltaUpdate: (boolean|undefined),
 *   addTracks: (Array<!shaka.msf.Utils.MSFTrack>|undefined),
 *   removeTracks: (Array<!shaka.msf.Utils.MSFTrack>|undefined),
 *   cloneTracks: (Array<!shaka.msf.Utils.MSFTrack>|undefined),
 *   generatedAt: (number|undefined),
 *   tracks: !Array<!shaka.msf.Utils.MSFTrack>
 * }}
 */
shaka.msf.Utils.MSFCatalog;
