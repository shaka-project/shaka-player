/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.draft18.MessageType');
goog.provide('shaka.msf.draft18.MessageTypeId');
goog.provide('shaka.msf.draft18.MessageWriter');

goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.DataViewWriter');
goog.require('shaka.util.StringUtils');

goog.require('shaka.msf.Utils');


/**
 * Message type IDs for draft-18.
 *
 * Deliberately separate from the draft-16 constants rather than shared. The
 * drafts reassign IDs and, more dangerously, reuse them with different
 * meanings: 0x7 was PUBLISH_NAMESPACE_OK and is now the generic REQUEST_OK,
 * 0x8 was PUBLISH_NAMESPACE_ERROR and is now NAMESPACE, 0xE was
 * TRACK_STATUS_OK and is now NAMESPACE_DONE, 0xF was TRACK_STATUS_ERROR and is
 * now PUBLISH_BLOCKED, and SUBSCRIBE_NAMESPACE moved from 0x11 to 0x50. A
 * shared enum would mis-parse silently instead of failing.
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
 * Every message is a var int type, a 16-bit length, then the payload. Two
 * things differ structurally from draft-16 beyond the field layouts:
 *
 *  - The type is a var int rather than a single byte, because SETUP is 0x2F00.
 *  - Responses carry no Request ID. They arrive on the bidirectional stream
 *    that carried the request, and that stream is the correlation, so there is
 *    nothing to write.
 *
 * @final
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

  /** Resets the buffer to start writing from the beginning. */
  reset() {
    this.writer_.reset();
  }

  /**
   * @param {bigint|number} value
   * @private
   */
  writeVarInt_(value) {
    this.codec_.encodeVarInt(
        this.writer_, typeof value == 'bigint' ? value : BigInt(value));
  }

  /**
   * @param {string} str
   * @private
   */
  writeString_(str) {
    const bytes = shaka.util.BufferUtils.toUint8(
        shaka.util.StringUtils.toUTF8(str));
    this.writeVarInt_(bytes.length);
    this.writer_.writeBytes(bytes);
  }

  /**
   * A Track Namespace is a count of fields followed by each length-prefixed
   * field.
   *
   * @param {Array<string>} namespace
   * @private
   */
  writeNamespace_(namespace) {
    const fields = namespace || [];
    this.writeVarInt_(fields.length);
    for (const field of fields) {
      this.writeString_(field);
    }
  }

  /**
   * @param {shaka.msf.Utils.Location} location
   * @private
   */
  writeLocation_(location) {
    this.writeVarInt_(location.group);
    this.writeVarInt_(location.object);
  }

  /**
   * Writes delta-encoded Key-Value-Pairs without a count prefix, which is how
   * Setup Options are framed: they span the whole message payload and are
   * bounded by the message length.
   *
   * @param {!Array<shaka.msf.Utils.KeyValuePair>} pairs
   * @private
   */
  writeKeyValuePairs_(pairs) {
    // Delta encoding requires ascending type order.
    /** @type {!Array<shaka.msf.Utils.KeyValuePair>} */
    const sorted = [...pairs].sort(
        (a, b) => (a.type < b.type ? -1 : (a.type > b.type ? 1 : 0)));

    let prevType = BigInt(0);
    for (const pair of sorted) {
      this.writeVarInt_(pair.type - prevType);
      prevType = pair.type;

      if (pair.type % BigInt(2) === BigInt(0)) {
        if (typeof pair.value !== 'bigint') {
          throw new Error(
              `Invalid value for even key ${pair.type}: expected bigint`);
        }
        this.writeVarInt_(pair.value);
      } else {
        if (!ArrayBuffer.isView(pair.value)) {
          throw new Error(
              `Invalid value for odd key ${pair.type}: expected Uint8Array`);
        }
        const bytes = /** @type {!Uint8Array} */ (pair.value);
        this.writeVarInt_(bytes.byteLength);
        this.writer_.writeBytes(bytes);
      }
    }
  }

  /**
   * Writes a count-prefixed parameter list, which is how every message other
   * than SETUP frames its parameters.
   *
   * @param {(Array<shaka.msf.Utils.KeyValuePair>|undefined)} pairs
   * @private
   */
  writeParameters_(pairs) {
    const params = pairs || [];
    this.writeVarInt_(params.length);
    this.writeKeyValuePairs_(params);
  }

  /**
   * Writes the var int type and 16-bit length around a payload.
   *
   * @param {shaka.msf.draft18.MessageTypeId} type
   * @param {function()} writeContent
   * @return {!shaka.msf.draft18.MessageWriter}
   * @private
   */
  marshal_(type, writeContent) {
    this.writeVarInt_(type);

    const lengthPosition = this.writer_.getPosition();
    this.writer_.writeUint16(0); // Placeholder

    const contentStart = this.writer_.getPosition();
    writeContent();
    this.writer_.patchUint16(
        lengthPosition, this.writer_.getPosition() - contentStart);
    return this;
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
    return this.marshal_(shaka.msf.draft18.MessageTypeId.SETUP, () => {
      this.writeKeyValuePairs_(options);
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
    return this.marshal_(shaka.msf.draft18.MessageTypeId.SUBSCRIBE, () => {
      this.writeVarInt_(msg.requestId);
      this.writeNamespace_(msg.namespace);
      this.writeString_(msg.trackName);
      this.writeParameters_(msg.params);
    });
  }

  /**
   * A standalone FETCH. Start and End are Location structures rather than the
   * four loose var ints draft-16 used.
   *
   * @param {{
   *   requestId: bigint,
   *   namespace: Array<string>,
   *   trackName: string,
   *   startLocation: shaka.msf.Utils.Location,
   *   endLocation: shaka.msf.Utils.Location,
   *   params: (Array<shaka.msf.Utils.KeyValuePair>|undefined),
   * }} msg
   * @return {!shaka.msf.draft18.MessageWriter}
   */
  marshalFetch(msg) {
    return this.marshal_(shaka.msf.draft18.MessageTypeId.FETCH, () => {
      this.writeVarInt_(msg.requestId);
      this.writeVarInt_(shaka.msf.draft18.FetchType.STANDALONE);
      this.writeNamespace_(msg.namespace);
      this.writeString_(msg.trackName);
      this.writeLocation_(msg.startLocation);
      this.writeLocation_(msg.endLocation);
      this.writeParameters_(msg.params);
    });
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
    return this.marshal_(
        shaka.msf.draft18.MessageTypeId.SUBSCRIBE_NAMESPACE, () => {
          this.writeVarInt_(msg.requestId);
          this.writeNamespace_(msg.namespace);
          this.writeParameters_(msg.params);
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
    return this.marshal_(shaka.msf.draft18.MessageTypeId.REQUEST_OK, () => {
      this.writeParameters_(params);
      // Track Properties are empty for everything but TRACK_STATUS_OK.
    });
  }
};
