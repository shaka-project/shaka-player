/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for the MoQT dialect plugin interface.
 *
 * @externs
 */


/**
 * A MoQT draft dialect: everything about a draft of the Media over QUIC
 * Transport specification that differs from the other drafts, gathered behind
 * one interface.
 *
 * A dialect is chosen once, when the session is established, and passed down
 * from there. Nothing above this layer branches on the draft version, so
 * supporting a new draft means providing an implementation of this interface
 * and registering it with shaka.msf.DialectRegistry.
 *
 * The interface exists because the differences between drafts run deeper than
 * message layouts. Draft-17 replaced the variable-length integer encoding
 * outright, so even reading an integer is draft-specific, and message type IDs
 * are reassigned between drafts and reused with different meanings, so each
 * dialect owns its own type constants rather than sharing an enum.
 *
 * @interface
 * @exportDoc
 */
shaka.extern.MsfDialect = class {
  /**
   * The WebTransport subprotocol string that selects this draft, e.g.
   * 'moqt-16'.
   *
   * @return {string}
   * @exportDoc
   */
  getSubprotocol() {}

  /**
   * The draft name, matching the shaka.config.MsfVersion value this dialect is
   * registered under, e.g. 'draft-16'.
   *
   * @return {string}
   * @exportDoc
   */
  getName() {}

  /**
   * The draft number, e.g. 16. Used to order dialects by preference during
   * negotiation, newest first.
   *
   * @return {number}
   * @exportDoc
   */
  getDraftNumber() {}

  /**
   * The primitive codec for this draft, which encodes and decodes the
   * variable-length integers every other field is built from.
   *
   * @return {!shaka.extern.MsfCodec}
   * @exportDoc
   */
  getCodec() {}

  /**
   * Performs this draft's setup handshake over an established WebTransport
   * connection and returns the resulting session.
   *
   * The handshake is part of the dialect because it is not stable across
   * drafts: draft-16 opens a single bidirectional stream and exchanges
   * CLIENT_SETUP and SERVER_SETUP over it, while draft-17 collapsed the two
   * into one SETUP message sent on each of a pair of unidirectional streams.
   *
   * @param {!WebTransport} webTransport
   * @param {!shaka.extern.MsfManifestConfiguration} config
   * @param {?string=} authorizationToken
   * @return {!Promise<!shaka.extern.MsfSession>}
   * @exportDoc
   */
  connect(webTransport, config, authorizationToken) {}
};


/**
 * An established MoQT session.
 *
 * This is the boundary between the draft-specific layers and the rest of the
 * player: it speaks only intent, and hands back objects in the draft-neutral
 * shaka.msf.Utils.MOQObject shape. Nothing above it knows how a request is
 * addressed, how a response is matched to it, or how object data is framed --
 * all of which change between drafts.
 *
 * @interface
 * @exportDoc
 */
shaka.extern.MsfSession = class {
  /**
   * Subscribes to a track, delivering its objects to the callback until
   * unsubscribed. Resolves with the track alias assigned by the publisher.
   *
   * @param {Array<string>} namespace
   * @param {string} trackName
   * @param {shaka.msf.Utils.ObjectCallback} callback
   * @return {!Promise<bigint>}
   * @exportDoc
   */
  subscribe(namespace, trackName, callback) {}

  /**
   * Stops delivery for a subscription.
   *
   * @param {bigint} trackAlias
   * @return {!Promise}
   * @exportDoc
   */
  unsubscribe(trackAlias) {}

  /**
   * Retrieves a track once rather than subscribing to it. Resolves when the
   * request has been accepted; objects arrive on the callback.
   *
   * @param {Array<string>} namespace
   * @param {string} trackName
   * @param {shaka.msf.Utils.ObjectCallback} callback
   * @return {!Promise}
   * @exportDoc
   */
  fetch(namespace, trackName, callback) {}

  /**
   * Registers a callback for namespaces the peer announces it can serve.
   *
   * @param {function(Array<string>)} callback
   * @return {function()} Unregisters the callback.
   * @exportDoc
   */
  onNamespacePublished(callback) {}

  /**
   * @param {!shaka.extern.MsfManifestConfiguration} config
   * @exportDoc
   */
  configure(config) {}

  /**
   * Closes the underlying transport.
   *
   * @param {number=} code
   * @param {string=} reason
   * @return {!Promise}
   * @exportDoc
   */
  close(code, reason) {}

  /**
   * Releases resources without closing the transport.
   *
   * @exportDoc
   */
  release() {}
};


/**
 * A control stream carrying MoQT control messages in some draft's wire format.
 *
 * The shared session for drafts 14 and 16 talks to one of these rather than to
 * a concrete class: both drafts use a single bidirectional control stream and
 * the same session logic, and differ only in how the messages on it are
 * serialized.
 *
 * @interface
 * @exportDoc
 */
shaka.extern.MsfControlStream = class {
  /**
   * Reads the next control message.
   *
   * @return {!Promise<shaka.msf.Utils.Message>}
   * @exportDoc
   */
  receive() {}

  /**
   * Writes a control message.
   *
   * @param {shaka.msf.Utils.Message} msg
   * @return {!Promise}
   * @exportDoc
   */
  send(msg) {}
};


/**
 * A factory for creating a MoQT dialect. This function is registered with
 * shaka.msf.DialectRegistry to create dialect instances.
 *
 * @typedef {function():!shaka.extern.MsfDialect}
 * @exportDoc
 */
shaka.extern.MsfDialect.Factory;


/**
 * Encodes and decodes the primitive types a MoQT draft is built from.
 *
 * This is the lowest layer of the dialect stack. It exists separately because
 * the variable-length integer encoding is not stable across drafts: draft-16
 * and earlier use the QUIC (RFC 9000) encoding, where the two most significant
 * bits of the first byte give a length of 1, 2, 4 or 8 bytes, while draft-17
 * replaced it with a leading-ones-count encoding of 1 to 9 bytes. Every integer
 * on the wire is affected, so the codec has to be selected per draft rather
 * than assumed.
 *
 * Implementations are stateless and operate on a caller-supplied byte sink or
 * slice, which keeps them usable from both the buffered stream reader and the
 * message writers.
 *
 * @interface
 * @exportDoc
 */
shaka.extern.MsfCodec = class {
  /**
   * Returns the total length in bytes of the variable-length integer that
   * starts with the given byte, so a reader knows how much to buffer before
   * decoding.
   *
   * @param {number} firstByte
   * @return {number}
   * @exportDoc
   */
  varIntLength(firstByte) {}

  /**
   * Decodes a variable-length integer from a slice holding exactly the bytes
   * of one encoded value, as reported by varIntLength().
   *
   * @param {!Uint8Array} bytes
   * @return {bigint}
   * @exportDoc
   */
  decodeVarInt(bytes) {}

  /**
   * Decodes the variable-length integer starting at the given offset within a
   * larger buffer, reporting how many bytes it consumed so the caller can
   * continue.
   *
   * @param {!Uint8Array} bytes
   * @param {number} offset
   * @return {!{value: bigint, bytesRead: number}}
   * @exportDoc
   */
  decodeVarIntAt(bytes, offset) {}

  /**
   * Appends a variable-length integer to the writer.
   *
   * @param {!shaka.util.DataViewWriter} writer
   * @param {bigint} value
   * @exportDoc
   */
  encodeVarInt(writer, value) {}
};
