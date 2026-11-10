/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.draft18.MessageType');
goog.provide('shaka.msf.draft18.MessageTypeId');
goog.provide('shaka.msf.draft18.MessageWriter');

goog.require('shaka.msf.Utils');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.DataViewWriter');
goog.require('shaka.util.StringUtils');


/**
 * Message type IDs for draft-18.
 *
 * Deliberately owned by this draft family rather than shared. The drafts
 * reassign IDs and, more dangerously, reuse them with different meanings: 0x7
 * was PUBLISH_NAMESPACE_OK and is now the generic REQUEST_OK, 0x8 was
 * PUBLISH_NAMESPACE_ERROR and is now NAMESPACE, 0xE was TRACK_STATUS_OK and is
 * now NAMESPACE_DONE, 0xF was TRACK_STATUS_ERROR and is now PUBLISH_BLOCKED,
 * and SUBSCRIBE_NAMESPACE moved from 0x11 to 0x50. A shared enum would
 * mis-parse silently instead of failing.
 *
 * Note the values are var ints, not single bytes: SETUP is 0x2F00.
 *
 * @enum {number}
 */
shaka.msf.draft18.MessageTypeId = {
  SETUP: 0x2f00,
  GOAWAY: 0x10,
  SUBSCRIBE: 0x3,
  SUBSCRIBE_OK: 0x4,
  PUBLISH: 0x1d,
  PUBLISH_OK: 0x1e,
  PUBLISH_DONE: 0xb,
  FETCH: 0x16,
  FETCH_OK: 0x18,
  TRACK_STATUS: 0xd,
  PUBLISH_NAMESPACE: 0x6,
  SUBSCRIBE_NAMESPACE: 0x50,
  SUBSCRIBE_TRACKS: 0x51,
  NAMESPACE: 0x8,
  NAMESPACE_DONE: 0xe,
  PUBLISH_BLOCKED: 0xf,
  REQUEST_UPDATE: 0x2,
  REQUEST_OK: 0x7,
  REQUEST_ERROR: 0x5,
};


/**
 * Internal discriminators for decoded draft-18 messages.
 *
 * @enum {string}
 */
shaka.msf.draft18.MessageType = {
  SETUP: 'setup',
  GOAWAY: 'goaway',
  SUBSCRIBE: 'subscribe',
  SUBSCRIBE_OK: 'subscribe_ok',
  PUBLISH: 'publish',
  PUBLISH_OK: 'publish_ok',
  PUBLISH_DONE: 'publish_done',
  FETCH: 'fetch',
  FETCH_OK: 'fetch_ok',
  TRACK_STATUS: 'track_status',
  PUBLISH_NAMESPACE: 'publish_namespace',
  SUBSCRIBE_NAMESPACE: 'subscribe_namespace',
  SUBSCRIBE_TRACKS: 'subscribe_tracks',
  NAMESPACE: 'namespace',
  NAMESPACE_DONE: 'namespace_done',
  PUBLISH_BLOCKED: 'publish_blocked',
  REQUEST_UPDATE: 'request_update',
  REQUEST_OK: 'request_ok',
  REQUEST_ERROR: 'request_error',
};


/**
 * Fetch Type values, from draft-18 section 10.12.
 *
 * @enum {number}
 */
shaka.msf.draft18.FetchType = {
  STANDALONE: 0x1,
  RELATIVE_JOINING: 0x2,
  ABSOLUTE_JOINING: 0x3,
};


/**
 * Serializes draft-18 control messages.
 *
 * Every message is a var int type, a 16-bit length (a var int from draft-23),
 * then the payload. Two
 * things differ structurally from draft-16 beyond the field layouts:
 *
 *  - The type is a var int rather than a single byte, because SETUP is 0x2F00.
 *  - Responses carry no Request ID. They arrive on the bidirectional stream
 *    that carried the request, and that stream is the correlation, so there is
 *    nothing to write.
 *
 * Draft-20 changed one message body and nothing else, so the field writers and
 * the type/length framing are protected rather than private: draft-20 extends
 * this class and overrides only marshalFetch().
 */
shaka.msf.draft18.MessageWriter = class {
  /**
   * @param {!shaka.extern.MsfCodec} codec
   * @param {number=} initialSize
   */
  constructor(codec, initialSize = 1024) {
    /** @private {!shaka.extern.MsfCodec} */
    this.codec_ = codec;

    /** @private {!shaka.util.DataViewWriter} */
    this.writer_ = new shaka.util.DataViewWriter(
        initialSize, shaka.util.DataViewWriter.Endianness.BIG_ENDIAN);
  }

  /**
   * @return {!Uint8Array}
   */
  getBytes() {
    return this.writer_.getBytes();
  }

  /**
   * @return {!shaka.extern.MsfCodec}
   * @protected
   */
  getCodec() {
    return this.codec_;
  }

  /** Resets the buffer to start writing from the beginning. */
  reset() {
    this.writer_.reset();
  }

  /**
   * @param {bigint|number} value
   * @protected
   */
  writeVarInt(value) {
    this.codec_.encodeVarInt(
        this.writer_, typeof value == 'bigint' ? value : BigInt(value));
  }

  /**
   * @param {string} str
   * @protected
   */
  writeString(str) {
    const bytes = shaka.util.BufferUtils.toUint8(
        shaka.util.StringUtils.toUTF8(str));
    this.writeVarInt(bytes.length);
    this.writer_.writeBytes(bytes);
  }

  /**
   * A Track Namespace is a count of fields followed by each length-prefixed
   * field.
   *
   * @param {Array<string>} namespace
   * @protected
   */
  writeNamespace(namespace) {
    const fields = namespace || [];
    this.writeVarInt(fields.length);
    for (const field of fields) {
      this.writeString(field);
    }
  }

  /**
   * @param {shaka.msf.Utils.Location} location
   * @protected
   */
  writeLocation(location) {
    this.writeVarInt(location.group);
    this.writeVarInt(location.object);
  }

  /**
   * Writes delta-encoded Key-Value-Pairs without a count prefix, which is how
   * Setup Options are framed: they span the whole message payload and are
   * bounded by the message length.
   *
   * Draft-22 gave LOCATION_FILTER a value that leads with its own Location
   * Filter Type rather than a length, and draft-23 did the same for
   * FILL_PARAMETERS with a Number of Parameters, so a parameter list asks
   * getParameterEncoding() whether an odd type's value carries a length.
   * Setup Options always do.
   *
   * @param {!Array<shaka.msf.Utils.KeyValuePair>} pairs
   * @param {boolean=} isParameterList
   * @protected
   */
  writeKeyValuePairs(pairs, isParameterList = false) {
    const Encoding = shaka.msf.draft18.MessageWriter.ParameterEncoding;

    // Delta encoding requires ascending type order.
    /** @type {!Array<shaka.msf.Utils.KeyValuePair>} */
    const sorted = [...pairs].sort(
        (a, b) => (a.type < b.type ? -1 : (a.type > b.type ? 1 : 0)));

    let prevType = BigInt(0);
    for (const pair of sorted) {
      this.writeVarInt(pair.type - prevType);
      prevType = pair.type;

      if (pair.type % BigInt(2) === BigInt(0)) {
        if (typeof pair.value !== 'bigint') {
          throw new Error(
              `Invalid value for even key ${pair.type}: expected bigint`);
        }
        this.writeVarInt(pair.value);
      } else {
        if (!ArrayBuffer.isView(pair.value)) {
          throw new Error(
              `Invalid value for odd key ${pair.type}: expected Uint8Array`);
        }
        const bytes = /** @type {!Uint8Array} */ (pair.value);
        const encoding = isParameterList ?
            this.getParameterEncoding(Number(pair.type)) : null;
        const selfDelimited = encoding == Encoding.LOCATION_FILTER ||
            encoding == Encoding.PARAMETER_LIST;
        if (!selfDelimited) {
          this.writeVarInt(bytes.byteLength);
        }
        this.writer_.writeBytes(bytes);
      }
    }
  }

  /**
   * Writes a count-prefixed parameter list, which is how every message other
   * than SETUP frames its parameters.
   *
   * @param {(Array<shaka.msf.Utils.KeyValuePair>|undefined)} pairs
   * @protected
   */
  writeParameters(pairs) {
    const params = pairs || [];
    this.writeVarInt(params.length);
    this.writeKeyValuePairs(params, /* isParameterList= */ true);
  }

  /**
   * How this draft encodes the value of a Message Parameter type, or null for
   * a type it does not define. Since draft-18 that is set per type rather
   * than by the parity rule Properties use, so a type nobody told us about
   * cannot be stepped over when reading a response.
   *
   * @param {number} type
   * @return {?shaka.msf.draft18.MessageWriter.ParameterEncoding}
   */
  getParameterEncoding(type) {
    return shaka.msf.draft18.MessageWriter.PARAMETER_ENCODINGS_.get(type) ??
        null;
  }

  /**
   * Writes the var int type and the length around a payload. The length is
   * 16 bits up to draft-22 and a var int from draft-23.
   *
   * @param {shaka.msf.draft18.MessageTypeId} type
   * @param {function()} writeContent
   * @return {!shaka.msf.draft18.MessageWriter}
   * @protected
   */
  marshal(type, writeContent) {
    this.writeVarInt(type);

    if (this.hasVarIntMessageLength()) {
      // How wide the length is depends on its value, so the payload is
      // written first and then moved along behind it.
      const contentStart = this.writer_.getPosition();
      writeContent();
      const content = this.writer_.getBytes().slice(contentStart);
      this.writer_.seek(contentStart);
      this.writeVarInt(content.byteLength);
      this.writer_.writeBytes(content);
      return this;
    }

    const lengthPosition = this.writer_.getPosition();
    this.writer_.writeUint16(0); // Placeholder

    const contentStart = this.writer_.getPosition();
    writeContent();
    this.writer_.patchUint16(
        lengthPosition, this.writer_.getPosition() - contentStart);
    return this;
  }

  /**
   * Whether the Length of a control message is a var int, as it is from
   * draft-23, rather than 16 bits. The session reads by the same rule.
   *
   * @return {boolean}
   */
  hasVarIntMessageLength() {
    return false;
  }

  /**
   * What answers a FETCH, and what comes ahead of its Parameters: up to
   * draft-22 a FETCH_OK whose End Of Track (8) and End Location (Group,
   * Object) come first. Draft-23 answers with a REQUEST_OK that starts with
   * the Parameters.
   *
   * @return {shaka.msf.draft18.MessageWriter.FetchOkLayout}
   */
  getFetchOkLayout() {
    return {
      type: shaka.msf.draft18.MessageTypeId.FETCH_OK,
      leadingBytes: 1,
      leadingVarInts: 2,
    };
  }

  /**
   * Whether a REQUEST_ERROR ends with Error Details, as it does from
   * draft-23, rather than with the Redirect earlier drafts carry only when
   * the code is REDIRECT.
   *
   * @return {boolean}
   */
  hasErrorDetails() {
    return false;
  }

  /**
   * How the Objects on a fetch stream are serialized in this draft.
   *
   * @return {shaka.msf.draft18.MessageWriter.FetchSerialization}
   */
  getFetchSerialization() {
    return shaka.msf.draft18.MessageWriter.FetchSerialization.DRAFT_18;
  }

  /**
   * The parameter that makes a SUBSCRIBE forward Objects from the start, or
   * null when that is already the default. Up to draft-22 it is FORWARD = 1;
   * draft-23 replaced it with PAUSED, which defaults to unpaused.
   *
   * @return {?shaka.msf.Utils.KeyValuePair}
   */
  forwardParam() {
    return {
      type: BigInt(shaka.msf.draft18.MessageWriter.Parameter.FORWARD),
      value: BigInt(1),
    };
  }

  /**
   * Draft-17 collapsed CLIENT_SETUP and SERVER_SETUP into one message whose
   * payload is nothing but Setup Options, uncounted and bounded by the
   * message length.
   *
   * @param {!Array<shaka.msf.Utils.KeyValuePair>} options
   * @return {!shaka.msf.draft18.MessageWriter}
   */
  marshalSetup(options) {
    return this.marshal(shaka.msf.draft18.MessageTypeId.SETUP, () => {
      this.writeKeyValuePairs(options);
    });
  }

  /**
   * @param {{
   *   requestId: bigint,
   *   namespace: Array<string>,
   *   trackName: string,
   *   params: (Array<shaka.msf.Utils.KeyValuePair>|undefined),
   * }} msg
   * @return {!shaka.msf.draft18.MessageWriter}
   */
  marshalSubscribe(msg) {
    return this.marshal(shaka.msf.draft18.MessageTypeId.SUBSCRIBE, () => {
      this.writeVarInt(msg.requestId);
      this.writeNamespace(msg.namespace);
      this.writeString(msg.trackName);
      this.writeParameters(msg.params);
    });
  }

  /**
   * A standalone FETCH. Start and End are Location structures rather than the
   * four loose var ints draft-16 used, and the range is a field of the message
   * rather than a parameter, which is what draft-20 changed.
   *
   * The range is an inclusive pair of absolute Locations, so the zeroed pair
   * the caller may leave out asks for exactly the Object at {0, 0}, not for
   * the whole track. Draft-20 says the same thing with a LOCATION_FILTER.
   *
   * @param {{
   *   requestId: bigint,
   *   namespace: Array<string>,
   *   trackName: string,
   *   startLocation: (shaka.msf.Utils.Location|undefined),
   *   endLocation: (shaka.msf.Utils.Location|undefined),
   *   params: (Array<shaka.msf.Utils.KeyValuePair>|undefined),
   * }} msg
   * @return {!shaka.msf.draft18.MessageWriter}
   */
  marshalFetch(msg) {
    const range = shaka.msf.draft18.MessageWriter.fetchRange(msg);
    return this.marshal(shaka.msf.draft18.MessageTypeId.FETCH, () => {
      this.writeVarInt(msg.requestId);
      this.writeVarInt(shaka.msf.draft18.FetchType.STANDALONE);
      this.writeNamespace(msg.namespace);
      this.writeString(msg.trackName);
      this.writeLocation(range.start);
      this.writeLocation(range.end);
      this.writeParameters(msg.params);
    });
  }

  /**
   * A Joining FETCH: the Groups leading up to a subscription's Joining
   * Location, contiguous with what the subscription delivers after it
   * (draft-18 section 10.12.2).
   *
   * A Relative Joining FETCH counts its Joining Start back from the current
   * Group, so 0 asks for the current Group from its first Object. An Absolute
   * one names the Group, which is what a subscription that starts in the past
   * needs: a SUBSCRIBE only forwards what is published after it, so whatever
   * was published before has to be fetched.
   *
   * @param {{
   *   requestId: bigint,
   *   joiningRequestId: bigint,
   *   joiningStart: bigint,
   *   absolute: (boolean|undefined),
   *   params: (Array<shaka.msf.Utils.KeyValuePair>|undefined),
   * }} msg
   * @return {!shaka.msf.draft18.MessageWriter}
   */
  marshalJoiningFetch(msg) {
    const FetchType = shaka.msf.draft18.FetchType;
    return this.marshal(shaka.msf.draft18.MessageTypeId.FETCH, () => {
      this.writeVarInt(msg.requestId);
      this.writeVarInt(msg.absolute ?
          FetchType.ABSOLUTE_JOINING : FetchType.RELATIVE_JOINING);
      this.writeVarInt(msg.joiningRequestId);
      this.writeVarInt(msg.joiningStart);
      this.writeParameters(msg.params);
    });
  }

  /**
   * The SUBSCRIBE parameter that also delivers what was published before the
   * subscription, from the first Object of the current Group or of the Group
   * at startLocation, or null when this draft has none and a Joining FETCH
   * has to be sent instead, as it does in draft-18.
   *
   * @param {?shaka.msf.Utils.Location=} startLocation Where the fill starts,
   *   or null for the current Group.
   * @return {?shaka.msf.Utils.KeyValuePair}
   */
  fillParam(startLocation) {
    return null;
  }

  /**
   * The filter that starts subscription delivery after the current fill, or
   * null when this draft does not use an explicit filter for that join.
   *
   * @return {?shaka.msf.Utils.KeyValuePair}
   */
  nextObjectFilterParam() {
    return null;
  }

  /**
   * The parameter that makes a SUBSCRIBE start at a given Location rather than
   * at the live edge, which is what seeking into already-published content
   * needs.
   *
   * Draft-18 spells it SUBSCRIPTION_FILTER (0x21): a Filter Type followed by
   * the fields that type takes. AbsoluteStart takes a Start Location and no
   * end, so the subscription runs from there to the live edge and onwards, and
   * the draft says outright that the Start Location MAY be smaller than the
   * publisher's Largest Object (section 5.1.2). Draft-20 keeps the parameter
   * type and changes its contents, so the draft-20 writer overrides this.
   *
   * @param {shaka.msf.Utils.Location} startLocation
   * @return {shaka.msf.Utils.KeyValuePair}
   */
  locationFilterParam(startLocation) {
    return {
      type: BigInt(shaka.msf.draft18.MessageWriter.Parameter.LOCATION_FILTER),
      value: this.encodeVarIntField([
        BigInt(shaka.msf.draft18.MessageWriter.FilterType.ABSOLUTE_START),
        startLocation.group,
        startLocation.object,
      ]),
    };
  }

  /**
   * The Location range a FETCH covers, filling in the default the callers that
   * do not care rely on. Shared with draft-20, which carries the same range in
   * a parameter instead of in the message.
   *
   * @param {{
   *   startLocation: (shaka.msf.Utils.Location|undefined),
   *   endLocation: (shaka.msf.Utils.Location|undefined),
   * }} msg
   * @return {{
   *   start: shaka.msf.Utils.Location,
   *   end: shaka.msf.Utils.Location,
   * }}
   * @protected
   */
  static fetchRange(msg) {
    const origin = {group: BigInt(0), object: BigInt(0)};
    return {
      start: msg.startLocation || origin,
      end: msg.endLocation || origin,
    };
  }

  /**
   * Encodes a sequence of var ints into a standalone byte field, for the
   * parameters whose value is itself a var int structure rather than a single
   * integer.
   *
   * @param {!Array<bigint>} values
   * @return {!Uint8Array}
   * @protected
   */
  encodeVarIntField(values) {
    // Nine bytes is the widest a var int gets in this draft family.
    const writer = new shaka.util.DataViewWriter(
        9 * values.length, shaka.util.DataViewWriter.Endianness.BIG_ENDIAN);
    for (const value of values) {
      this.codec_.encodeVarInt(writer, value);
    }
    return writer.getBytes();
  }

  /**
   * @param {{
   *   requestId: bigint,
   *   namespace: Array<string>,
   *   params: (Array<shaka.msf.Utils.KeyValuePair>|undefined),
   * }} msg
   * @return {!shaka.msf.draft18.MessageWriter}
   */
  marshalSubscribeNamespace(msg) {
    return this.marshal(
        shaka.msf.draft18.MessageTypeId.SUBSCRIBE_NAMESPACE, () => {
          this.writeVarInt(msg.requestId);
          this.writeNamespace(msg.namespace);
          this.writeParameters(msg.params);
        });
  }

  /**
   * REQUEST_OK answers PUBLISH_NAMESPACE, SUBSCRIBE_NAMESPACE, TRACK_STATUS
   * and the rest. It carries no Request ID: it goes back on the request's own
   * bidirectional stream.
   *
   * @param {(Array<shaka.msf.Utils.KeyValuePair>|undefined)=} params
   * @return {!shaka.msf.draft18.MessageWriter}
   */
  marshalRequestOk(params) {
    return this.marshal(shaka.msf.draft18.MessageTypeId.REQUEST_OK, () => {
      this.writeParameters(params);
      // Track Properties are empty for everything but TRACK_STATUS_OK.
    });
  }
};


/**
 * The parameter types this player sends on a SUBSCRIBE or a FETCH.
 *
 * Draft-20 renamed 0x21 from SUBSCRIPTION_FILTER to LOCATION_FILTER and
 * changed what its value holds, but the code point is the same in both, so
 * there is one constant rather than one per draft.
 *
 * @enum {number}
 */
shaka.msf.draft18.MessageWriter.Parameter = {
  FORWARD: 0x10,
  SUBSCRIBER_PRIORITY: 0x20,
  LOCATION_FILTER: 0x21,
  FILL_PARAMETERS: 0x23,
};


/**
 * The SUBSCRIPTION_FILTER Filter Types this player sends (draft-18 section
 * 5.1.2). Draft-20 and draft-21 have no Filter Type, and draft-22 numbers its
 * own differently.
 *
 * @enum {number}
 */
shaka.msf.draft18.MessageWriter.FilterType = {
  ABSOLUTE_START: 0x3,
};


/**
 * How a Message Parameter's value is encoded (draft-18 section 10.2).
 *
 * @enum {number}
 */
shaka.msf.draft18.MessageWriter.ParameterEncoding = {
  UINT8: 0,
  VARINT: 1,
  LOCATION: 2,
  LENGTH_PREFIXED: 3,
  // A Location Filter Type followed by the var ints that type selects, with
  // no length (draft-22 section 9.20.9). Draft-22 onwards.
  LOCATION_FILTER: 4,
  // A Number of Parameters followed by that many Parameters, with no length
  // (draft-23 section 9.19.15). Only draft-23 uses it, for FILL_PARAMETERS.
  PARAMETER_LIST: 5,
};


/**
 * How the Objects on a fetch stream are serialized.
 *
 * DRAFT_18 covers draft-18 to draft-22. DRAFT_23 adds 2 to an Object ID Delta
 * within a Group, delta encodes End of Range, and adds End of Gone Range, End
 * of Group and End of Track (draft-23 section 11.4).
 *
 * @enum {number}
 */
shaka.msf.draft18.MessageWriter.FetchSerialization = {
  DRAFT_18: 0,
  DRAFT_23: 1,
};


/**
 * The message that answers a FETCH, and how many fields come ahead of its
 * Parameters: `leadingBytes` single bytes, then `leadingVarInts` var ints.
 *
 * @typedef {{
 *   type: shaka.msf.draft18.MessageTypeId,
 *   leadingBytes: number,
 *   leadingVarInts: number,
 * }}
 */
shaka.msf.draft18.MessageWriter.FetchOkLayout;


/**
 * The encoding of the Message Parameter types defined across draft-18,
 * draft-20 and draft-21. The types are numbers rather than bigint so that
 * building this map needs no BigInt at load time.
 *
 * @private @const {!Map<number,
 *     shaka.msf.draft18.MessageWriter.ParameterEncoding>}
 */
shaka.msf.draft18.MessageWriter.PARAMETER_ENCODINGS_ = new Map([
  [0x02, shaka.msf.draft18.MessageWriter.ParameterEncoding.VARINT],
  [0x03, shaka.msf.draft18.MessageWriter.ParameterEncoding.LENGTH_PREFIXED],
  [0x06, shaka.msf.draft18.MessageWriter.ParameterEncoding.VARINT],
  [0x08, shaka.msf.draft18.MessageWriter.ParameterEncoding.VARINT],
  [0x09, shaka.msf.draft18.MessageWriter.ParameterEncoding.LOCATION],
  [0x10, shaka.msf.draft18.MessageWriter.ParameterEncoding.UINT8],
  [0x20, shaka.msf.draft18.MessageWriter.ParameterEncoding.UINT8],
  [0x21, shaka.msf.draft18.MessageWriter.ParameterEncoding.LENGTH_PREFIXED],
  [0x22, shaka.msf.draft18.MessageWriter.ParameterEncoding.UINT8],
  [0x23, shaka.msf.draft18.MessageWriter.ParameterEncoding.LENGTH_PREFIXED],
  [0x32, shaka.msf.draft18.MessageWriter.ParameterEncoding.VARINT],
  [0x35, shaka.msf.draft18.MessageWriter.ParameterEncoding.UINT8],
]);
