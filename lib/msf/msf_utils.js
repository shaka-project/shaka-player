/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.Utils');

goog.requireType('shaka.config.MsfFilterType');


shaka.msf.Utils = class {
  /**
   * Draft-16+ uses ALPN/protocol negotiation instead of in-band SETUP version
   * fields.
   *
   * @param {shaka.msf.Utils.Version} version
   * @return {boolean}
   */
  static isDraft16(version) {
    return version >= shaka.msf.Utils.Version.DRAFT_16;
  }
};

/**
 * Enum for message type IDs, matching the draft-14 specification
 *
 * @enum {number}
 */
shaka.msf.Utils.MessageTypeId = {
  CLIENT_SETUP: 0x20,
  SERVER_SETUP: 0x21,
  GOAWAY: 0x10,
  MAX_REQUEST_ID: 0x15,
  REQUESTS_BLOCKED: 0x1a,
  SUBSCRIBE: 0x3,
  SUBSCRIBE_OK: 0x4,
  SUBSCRIBE_ERROR: 0x5,
  SUBSCRIBE_UPDATE: 0x2,
  UNSUBSCRIBE: 0xa,
  PUBLISH_DONE: 0xb,
  PUBLISH: 0x1d,
  PUBLISH_OK: 0x1e,
  PUBLISH_ERROR: 0x1f,
  FETCH: 0x16,
  FETCH_OK: 0x18,
  FETCH_ERROR: 0x19,
  FETCH_CANCEL: 0x17,
  TRACK_STATUS: 0xd,
  TRACK_STATUS_OK: 0xe,
  TRACK_STATUS_ERROR: 0xf,
  PUBLISH_NAMESPACE: 0x6,
  PUBLISH_NAMESPACE_OK: 0x7,
  PUBLISH_NAMESPACE_ERROR: 0x8,
  PUBLISH_NAMESPACE_DONE: 0x9,
  PUBLISH_NAMESPACE_CANCEL: 0xc,
  SUBSCRIBE_NAMESPACE: 0x11,
  SUBSCRIBE_NAMESPACE_OK: 0x12,
  SUBSCRIBE_NAMESPACE_ERROR: 0x13,
  UNSUBSCRIBE_NAMESPACE: 0x14,
};

/**
 * Enum for message names, matching the draft-14 specification
 *
 * @enum {string}
 */
shaka.msf.Utils.MessageType = {
  GOAWAY: 'goaway',
  MAX_REQUEST_ID: 'max_request_id',
  REQUESTS_BLOCKED: 'requests_blocked',
  SUBSCRIBE: 'subscribe',
  SUBSCRIBE_OK: 'subscribe_ok',
  SUBSCRIBE_ERROR: 'subscribe_error',
  SUBSCRIBE_UPDATE: 'subscribe_update',
  UNSUBSCRIBE: 'unsubscribe',
  PUBLISH_DONE: 'publish_done',
  PUBLISH: 'publish',
  PUBLISH_OK: 'publish_ok',
  PUBLISH_ERROR: 'publish_error',
  FETCH: 'fetch',
  FETCH_OK: 'fetch_ok',
  FETCH_ERROR: 'fetch_error',
  FETCH_CANCEL: 'fetch_cancel',
  TRACK_STATUS: 'track_status',
  TRACK_STATUS_OK: 'track_status_ok',
  TRACK_STATUS_ERROR: 'track_status_error',
  PUBLISH_NAMESPACE: 'publish_namespace',
  PUBLISH_NAMESPACE_OK: 'publish_namespace_ok',
  PUBLISH_NAMESPACE_ERROR: 'publish_namespace_error',
  PUBLISH_NAMESPACE_DONE: 'publish_namespace_done',
  PUBLISH_NAMESPACE_CANCEL: 'publish_namespace_cancel',
  SUBSCRIBE_NAMESPACE: 'subscribe_namespace',
  SUBSCRIBE_NAMESPACE_OK: 'subscribe_namespace_ok',
  SUBSCRIBE_NAMESPACE_ERROR: 'subscribe_namespace_error',
  UNSUBSCRIBE_NAMESPACE: 'unsubscribe_namespace',
};

/**
 * @enum {number}
 */
shaka.msf.Utils.SetupOption = {
  MAX_REQUEST_ID: 0x2,
  AUTHORIZATION_TOKEN: 0x3,
  MAX_AUTH_TOKEN_CACHE_SIZE: 0x4,
  IMPLEMENTATION: 0x7,
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
  LARGEST_OBJECT: 0x2,
  ABSOLUTE_START: 0x3,
  ABSOLUTE_RANGE: 0x4,
};

/**
 * @enum {number}
 */
shaka.msf.Utils.Version = {
  DRAFT_14: 0xff00000e,
  DRAFT_16: 0xff000010,
};

/**
 * @enum {number}
 */
shaka.msf.Utils.FetchType = {
  STANDALONE: 0x1,
  RELATIVE: 0x02,
  ABSOLUTE: 0x03,
};

/**
 * @typedef {{
 *   type: bigint,
 *   value: (bigint|!Uint8Array),
 * }}
 */
shaka.msf.Utils.KeyValuePair;


/**
 * @typedef {{
 *   group: bigint,
 *   object: bigint,
 *   subgroup: ?(bigint|undefined)
 * }}
 */
shaka.msf.Utils.Location;


/**
 * @typedef {{
 *   kind: shaka.msf.Utils.MessageType,
 *   newSessionUri: string,
 * }}
 */
shaka.msf.Utils.Goaway;


/**
 * @typedef {{
 *   kind: shaka.msf.Utils.MessageType,
 *   requestId: bigint,
 * }}
 */
shaka.msf.Utils.MaxRequestId;


/**
 * @typedef {{
 *   kind: shaka.msf.Utils.MessageType,
 *   maximumRequestId: bigint,
 * }}
 */
shaka.msf.Utils.RequestsBlocked;


/**
 * @typedef {{
 *   kind: shaka.msf.Utils.MessageType,
 *   requestId: bigint,
 *   namespace: Array<string>,
 *   name: string,
 *   subscriberPriority: number,
 *   groupOrder: shaka.msf.Utils.GroupOrder,
 *   forward: boolean,
 *   filterType: shaka.config.MsfFilterType,
 *   startLocation: (shaka.msf.Utils.Location|undefined),
 *   endGroup: (bigint|undefined),
 *   params: Array<shaka.msf.Utils.KeyValuePair>,
 * }}
 */
shaka.msf.Utils.Subscribe;


/**
 * @typedef {{
 *   kind: shaka.msf.Utils.MessageType,
 *   requestId: bigint,
 *   trackAlias: bigint,
 *   expires: bigint,
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
 *   requestId: bigint,
 *   code: bigint,
 *   retryInterval: (bigint|undefined),
 *   reason: string,
 * }}
 */
shaka.msf.Utils.SubscribeError;


/**
 * @typedef {{
 *   kind: shaka.msf.Utils.MessageType,
 *   requestId: bigint,
 *   startLocation: shaka.msf.Utils.Location,
 *   endGroup: bigint,
 *   subscriberPriority: number,
 *   forward: boolean,
 *   params: Array<shaka.msf.Utils.KeyValuePair>,
 * }}
 */
shaka.msf.Utils.SubscribeUpdate;


/**
 * @typedef {{
 *   kind: shaka.msf.Utils.MessageType,
 *   requestId: bigint,
 * }}
 */
shaka.msf.Utils.Unsubscribe;


/**
 * @typedef {{
 *   kind: shaka.msf.Utils.MessageType,
 *   requestId: bigint,
 *   code: bigint,
 *   streamCount: number,
 *   reason: string,
 * }}
 */
shaka.msf.Utils.PublishDone;


/**
 * @typedef {{
 *   kind: shaka.msf.Utils.MessageType,
 *   requestId: bigint,
 *   namespace: Array<string>,
 *   name: string,
 *   trackAlias: bigint,
 *   groupOrder: shaka.msf.Utils.GroupOrder,
 *   contentExists: boolean,
 *   largestLocation: (shaka.msf.Utils.Location|undefined),
 *   forward: boolean,
 *   params: Array<shaka.msf.Utils.KeyValuePair>,
 * }}
 */
shaka.msf.Utils.Publish;


/**
 * @typedef {{
 *   kind: shaka.msf.Utils.MessageType,
 *   requestId: bigint,
 *   forward: boolean,
 *   subscriberPriority: number,
 *   groupOrder: shaka.msf.Utils.GroupOrder,
 *   filterType: shaka.msf.Utils.FilterType,
 *   startLocation: (shaka.msf.Utils.Location|undefined),
 *   endGroup: (bigint|undefined),
 *   params: Array<shaka.msf.Utils.KeyValuePair>,
 * }}
 */
shaka.msf.Utils.PublishOk;


/**
 * @typedef {{
 *   kind: shaka.msf.Utils.MessageType,
 *   requestId: bigint,
 *   code: bigint,
 *   retryInterval: (bigint|undefined),
 *   reason: string,
 * }}
 */
shaka.msf.Utils.PublishError;


/**
 * @typedef {{
 *   kind: shaka.msf.Utils.MessageType,
 *   requestId: bigint,
 *   subscriberPriority: number,
 *   groupOrder: shaka.msf.Utils.GroupOrder,
 *   fetchType: shaka.msf.Utils.FetchType,
 *   namespace: Array<string>,
 *   trackName: string,
 *   startGroup: bigint,
 *   startObject: bigint,
 *   endGroup: bigint,
 *   endObject: bigint,
 *   params: Array<shaka.msf.Utils.KeyValuePair>,
 * }}
 */
shaka.msf.Utils.Fetch;


/**
 * @typedef {{
 *   kind: shaka.msf.Utils.MessageType,
 *   requestId: bigint,
 *   groupOrder: shaka.msf.Utils.GroupOrder,
 *   endOfTrack: number,
 *   endGroup: bigint,
 *   endObject: bigint,
 *   params: Array<shaka.msf.Utils.KeyValuePair>,
 * }}
 */
shaka.msf.Utils.FetchOk;


/**
 * @typedef {{
 *   kind: shaka.msf.Utils.MessageType,
 *   requestId: bigint,
 *   code: bigint,
 *   retryInterval: (bigint|undefined),
 *   reason: string,
 * }}
 */
shaka.msf.Utils.FetchError;

/**
 * @typedef {{
 *   kind: shaka.msf.Utils.MessageType,
 *   requestId: bigint,
 * }}
 */
shaka.msf.Utils.FetchCancel;


/**
 * @typedef {{
 *   kind: shaka.msf.Utils.MessageType,
 *   requestId: bigint,
 *   namespace: Array<string>,
 *   params: Array<shaka.msf.Utils.KeyValuePair>,
 * }}
 */
shaka.msf.Utils.PublishNamespace;


/**
 * @typedef {{
 *   kind: shaka.msf.Utils.MessageType,
 *   requestId: bigint,
 * }}
 */
shaka.msf.Utils.PublishNamespaceOk;


/**
 * @typedef {{
 *   kind: shaka.msf.Utils.MessageType,
 *   requestId: bigint,
 *   code: bigint,
 *   retryInterval: (bigint|undefined),
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
shaka.msf.Utils.PublishNamespaceDone;

/**
 * @typedef {{
 *   kind: shaka.msf.Utils.MessageType,
 *   namespace: Array<string>,
 *   code: bigint,
 *   reason: string,
 * }}
 */
shaka.msf.Utils.PublishNamespaceCancel;

/**
 * @typedef {{
 *   kind: shaka.msf.Utils.MessageType,
 *   requestId: bigint,
 *   namespace: Array<string>,
 *   params: Array<shaka.msf.Utils.KeyValuePair>,
 * }}
 */
shaka.msf.Utils.SubscribeNamespace;

/**
 * @typedef {{
 *   kind: shaka.msf.Utils.MessageType,
 *   requestId: bigint,
 * }}
 */
shaka.msf.Utils.SubscribeNamespaceOk;


/**
 * @typedef {{
 *   kind: shaka.msf.Utils.MessageType,
 *   requestId: bigint,
 *   code: bigint,
 *   retryInterval: (bigint|undefined),
 *   reason: string,
 * }}
 */
shaka.msf.Utils.SubscribeNamespaceError;


/**
 * @typedef {{
 *   kind: shaka.msf.Utils.MessageType,
 *   namespace: Array<string>,
 * }}
 */
shaka.msf.Utils.UnsubscribeNamespace;


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
 * @typedef {shaka.msf.Utils.Subscribe|
 *           shaka.msf.Utils.Unsubscribe|
 *           shaka.msf.Utils.PublishNamespaceOk|
 *           shaka.msf.Utils.PublishNamespaceError|
 *           shaka.msf.Utils.Goaway|
 *           shaka.msf.Utils.MaxRequestId|
 *           shaka.msf.Utils.Publish|
 *           shaka.msf.Utils.PublishOk|
 *           shaka.msf.Utils.PublishError|
 *           shaka.msf.Utils.Fetch|
 *           shaka.msf.Utils.FetchCancel|
 *           shaka.msf.Utils.UnsubscribeNamespace|
 *           shaka.msf.Utils.SubscribeNamespaceOk|
 *           shaka.msf.Utils.SubscribeNamespaceError}
 */
shaka.msf.Utils.Subscriber;


/**
 * @typedef {shaka.msf.Utils.SubscribeOk|
 *           shaka.msf.Utils.SubscribeError|
 *           shaka.msf.Utils.PublishDone|
 *           shaka.msf.Utils.FetchOk|
 *           shaka.msf.Utils.FetchError|
 *           shaka.msf.Utils.PublishNamespace|
 *           shaka.msf.Utils.PublishNamespaceDone|
 *           shaka.msf.Utils.RequestsBlocked|
 *           shaka.msf.Utils.SubscribeNamespace}
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
 *   trackAlias: bigint,
 *   location: shaka.msf.Utils.Location,
 *   data: !Uint8Array,
 *   extensions: ?(Uint8Array|undefined),
 *   status: ?(bigint|undefined)
 * }}
 */
shaka.msf.Utils.MOQObject;


/**
 * @typedef {function(shaka.msf.Utils.MOQObject)}
 */
shaka.msf.Utils.ObjectCallback;


/**
 * @typedef {{
 *   namespace: Array<string>,
 *   trackName: string,
 *   trackAlias: bigint,
 *   requestId: bigint,
 *   callbacks: !Array<shaka.msf.Utils.ObjectCallback>,
 *   closed: boolean,
 * }}
 */
shaka.msf.Utils.TrackInfo;


