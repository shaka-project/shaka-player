/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.draft16.Dialect');

goog.require('shaka.Player');
goog.require('shaka.config.MsfVersion');
goog.require('shaka.log');
goog.require('shaka.msf.ControlStream');
goog.require('shaka.msf.DialectRegistry');
goog.require('shaka.msf.Reader');
goog.require('shaka.msf.Receiver');
goog.require('shaka.msf.Sender');
goog.require('shaka.msf.Utils');
goog.require('shaka.msf.Writer');
goog.require('shaka.msf.QuicVarIntCodec');
goog.require('shaka.msf.RequestIdSession');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.DataViewWriter');
goog.require('shaka.util.StringUtils');


/**
 * The draft-16 dialect.
 *
 * Draft-16 negotiates the version through the WebTransport subprotocol, runs
 * every control message over a single bidirectional stream, and matches
 * responses to requests by the Request ID carried in both.
 *
 * @implements {shaka.extern.MsfDialect}
 * @final
 */
shaka.msf.draft16.Dialect = class {
  /** */
  constructor() {
    /** @private {!shaka.msf.QuicVarIntCodec} */
    this.codec_ = new shaka.msf.QuicVarIntCodec();
  }

  /** @override */
  getSubprotocol() {
    return 'moqt-16';
  }

  /** @override */
  getName() {
    return shaka.config.MsfVersion.DRAFT_16;
  }

  /** @override */
  getDraftNumber() {
    return 16;
  }

  /** @override */
  getCodec() {
    return this.codec_;
  }

  /**
   * @param {!shaka.msf.Reader} reader
   * @param {!shaka.msf.Writer} writer
   * @return {!shaka.msf.ControlStream}
   * @private
   */
  createControlStream_(reader, writer) {
    return new shaka.msf.ControlStream(reader, writer, this.codec_);
  }

  /** @override */
  async connect(webTransport, config, authorizationToken) {
    // Draft-16 runs the whole control plane over one bidirectional stream.
    /** @type {!WebTransportBidirectionalStream} */
    const stream = await webTransport.createBidirectionalStream();
    shaka.log.v1('Bidirectional stream created', stream);

    const writer = new shaka.msf.Writer(stream.writable);
    const reader =
        new shaka.msf.Reader(new Uint8Array([]), stream.readable, this.codec_);

    const implementation = 'ShakaPlayer/' + shaka.Player.version;
    const params = [
      {
        type: BigInt(shaka.msf.Utils.SetupOption.MAX_REQUEST_ID),
        value: BigInt(42069),
      },
      {
        type: BigInt(shaka.msf.Utils.SetupOption.IMPLEMENTATION),
        value: shaka.util.BufferUtils.toUint8(
            shaka.util.StringUtils.toUTF8(implementation)),
      },
    ];
    if (authorizationToken) {
      params.push({
        type: BigInt(shaka.msf.Utils.SetupOption.AUTHORIZATION_TOKEN),
        value: this.buildAuthToken_(authorizationToken),
      });
    }

    shaka.log.v1('Sending client setup message');
    await new shaka.msf.Sender(writer, this.codec_).client({params});

    shaka.log.v1('Waiting for server setup message');
    const server = await new shaka.msf.Receiver(reader).server();
    shaka.log.v1('Received server setup:', server);

    const controlStream = this.createControlStream_(reader, writer);
    shaka.log.v1('Control stream established (draft-16)');

    return new shaka.msf.RequestIdSession(
        webTransport, controlStream, this, config);
  }

  /**
   * Builds the AUTHORIZATION_TOKEN setup parameter value.
   *
   * @param {string} token
   * @return {!Uint8Array}
   * @private
   */
  buildAuthToken_(token) {
    const tokenBytes = shaka.util.BufferUtils.toUint8(
        shaka.util.StringUtils.toUTF8(token));

    const writer = new shaka.util.DataViewWriter(
        2 + tokenBytes.length, // alias + type + token,
        shaka.util.DataViewWriter.Endianness.BIG_ENDIAN);

    // Alias Type = USE_VALUE (0x03)
    this.codec_.encodeVarInt(writer, BigInt(0x03));

    // Token Type = 0 (not defined)
    this.codec_.encodeVarInt(writer, BigInt(0x00));

    // Token Value
    writer.writeBytes(tokenBytes);

    return writer.getBytes();
  }
};


shaka.msf.DialectRegistry.registerDialect(
    shaka.config.MsfVersion.DRAFT_16,
    () => new shaka.msf.draft16.Dialect());
