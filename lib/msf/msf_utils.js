/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.Utils');

goog.require('shaka.log');
goog.require('shaka.util.BufferUtils');
goog.requireType('shaka.config.MsfFilterType');


shaka.msf.Utils = class {
  /**
   * Parses a block of MoQT Properties into a property map. Object Properties
   * and Track Properties share this layout, so it serves both.
   *
   * Wire format — a flat sequence of MOQT Key-Value-Pairs
   * (draft-ietf-moq-transport-18 §1.4.3) running to the end of the buffer;
   * whatever length prefix the block had was already consumed by the
   * transport layer:
   *
   *   delta type (vi64)
   *   value: vi64           when the resolved type is even
   *          length (vi64) + bytes  when the resolved type is odd
   *
   * Types are DELTA encoded against the previous type in the block, starting
   * from 0. Reading them as absolute is worse than dropping the trailing
   * properties: a delta can collide with a real type and bind an unrelated
   * property's value to it. With the LOC Timestamp and Timescale present the
   * deltas are 6 and 2, so an absolute read loses Timescale entirely.
   *
   * If parsing throws at any point the partial map built so far is returned,
   * so callers always receive a valid (possibly empty) map.
   *
   * @param {!Uint8Array} data
   * @param {!shaka.extern.MsfCodec} codec The negotiated draft's primitive
   *   codec. Draft-17 changed the var int encoding, so the same property
   *   bytes mean different numbers depending on which draft delivered them.
   * @return {!Map<bigint, bigint|!Uint8Array>}
   */
  static parseProperties(data, codec) {
    /** @type {!Map<bigint, bigint|!Uint8Array>} */
    const props = new Map();

    if (data.byteLength === 0) {
      return props;
    }

    /** @type {function(number):{value: bigint, bytesRead: number}} */
    const readVi64At =
        (offset) => shaka.msf.Utils.readVi64At(data, offset, codec);

    try {
      let offset = 0;
      /** @type {bigint} */
      let previousType = BigInt(0);
      while (offset < data.byteLength) {
        const deltaResult = readVi64At(offset);
        offset += deltaResult.bytesRead;
        const type = previousType + deltaResult.value;
        previousType = type;

        if (type % BigInt(2) === BigInt(0)) {
          // Even type → single vi64 value
          const valResult = readVi64At(offset);
          offset += valResult.bytesRead;
          props.set(type, valResult.value);
        } else {
          // Odd type → length-prefixed byte sequence
          const lenResult = readVi64At(offset);
          offset += lenResult.bytesRead;
          const len = Number(lenResult.value);
          props.set(type, shaka.util.BufferUtils.toUint8(data, offset, len));
          offset += len;
        }
      }
    } catch (e) {
      shaka.log.v2('Failed to parse MoQT properties, returning partial map',
          e);
    }

    return props;
  }

  /**
   * Reads one variable-length integer from `buffer` at byte `offset`, in
   * whichever encoding the negotiated draft uses. Draft-17 replaced the QUIC
   * two-bit size tag with a leading-ones count, so the same bytes mean
   * different numbers under the two.
   *
   * Synchronous equivalent of `Reader.u62WithSize()` in msf_classes.js.
   *
   * @param {!Uint8Array} buffer
   * @param {number} offset
   * @param {!shaka.extern.MsfCodec} codec
   * @return {{value: bigint, bytesRead: number}}
   */
  static readVi64At(buffer, offset, codec) {
    if (offset >= buffer.length) {
      throw new Error(`readVi64At: underflow at offset ${offset}`);
    }

    const bytesRead = codec.varIntLength(buffer[offset]);
    if (offset + bytesRead > buffer.length) {
      throw new Error(`readVi64At: need ${bytesRead} bytes`);
    }
    return {value: codec.decodeVarInt(
        buffer.subarray(offset, offset + bytesRead)), bytesRead};
  }
};

/**
 * Enum for message type IDs, matching the draft-16 specification
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
 * Enum for message names, matching the draft-16 specification
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
 * Where an Object sits in a track. Defined in externs as
 * shaka.extern.MsfLocation, since it is part of the dialect plugin contract
 * and externs are compiled into builds that omit MSF entirely.
 *
 * @typedef {shaka.extern.MsfLocation}
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
 * Draft-16 negotiates the version via the WebTransport subprotocol, so the
 * SETUP messages carry only parameters.
 *
 * @typedef {{
 *   params: (Array<shaka.msf.Utils.KeyValuePair>|undefined),
 * }}
 */
shaka.msf.Utils.ClientSetup;


/**
 * @typedef {{
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
 * The shape delivered to subscription and fetch callbacks. Defined in externs
 * as shaka.extern.MsfObject, since it is part of the dialect plugin contract
 * and externs are compiled into builds that omit MSF entirely.
 *
 * @typedef {shaka.extern.MsfObject}
 */
shaka.msf.Utils.MOQObject;


/**
 * @typedef {shaka.extern.MsfObjectCallback}
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


