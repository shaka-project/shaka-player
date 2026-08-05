/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.draft14.Dialect');

goog.require('shaka.Deprecate');
goog.require('shaka.Player');
goog.require('shaka.config.MsfVersion');
goog.require('shaka.log');
goog.require('shaka.msf.DialectRegistry');
goog.require('shaka.msf.QuicVarIntCodec');
goog.require('shaka.msf.Reader');
goog.require('shaka.msf.RequestIdSession');
goog.require('shaka.msf.Utils');
goog.require('shaka.msf.Writer');
goog.require('shaka.msf.draft14.ControlStream');
goog.require('shaka.msf.draft14.MessageWriter');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.DataViewWriter');
goog.require('shaka.util.StringUtils');


/**
 * The draft-14 dialect.
 *
 * Deprecated: draft-14 predates the ALPN-based version negotiation introduced
 * in draft-15 and negotiates in band instead, sending a list of supported
 * versions in CLIENT_SETUP and receiving the server's choice in SERVER_SETUP.
 * It also predates delta-encoded message parameters. It is retained so that
 * existing deployments are not broken without notice, and is scheduled for
 * removal in v6.
 *
 * It shares the QUIC variable-length integer codec and the session topology
 * with draft-16, both of which changed only in draft-17. Its message
 * serialization is its own, which keeps its eventual removal to deleting a
 * directory.
 *
 * @implements {shaka.extern.MsfDialect}
 * @final
 */
shaka.msf.draft14.Dialect = class {
  /** */
  constructor() {
    /** @private {!shaka.msf.QuicVarIntCodec} */
    this.codec_ = new shaka.msf.QuicVarIntCodec();
  }

  /** @override */
  getSubprotocol() {
    // Draft versions before -15 all used the moq-00 ALPN, then negotiated the
    // real version inside SETUP.
    return 'moq-00';
  }

  /** @override */
  getName() {
    return shaka.config.MsfVersion.DRAFT_14;
  }

  /** @override */
  getDraftNumber() {
    return 14;
  }

  /** @override */
  getCodec() {
    return this.codec_;
  }

  /** @override */
  async connect(webTransport, config, authorizationToken) {
    shaka.Deprecate.deprecateFeature(6,
        'MoQT draft-14 support',
        'Draft-14 is superseded by draft-16 and draft-18, and will be ' +
        'removed in v6. Set manifest.msf.version to ' +
        'shaka.config.MsfVersion.DRAFT_18 (or leave it as AUTO) and use a ' +
        'relay that speaks a newer draft.');

    /** @type {!WebTransportBidirectionalStream} */
    const stream = await webTransport.createBidirectionalStream();

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

    // Draft-14 negotiates the version in band: we offer, the server picks.
    const versions = [shaka.msf.draft14.Dialect.VERSION];
    const setupWriter = new shaka.msf.draft14.MessageWriter(this.codec_);
    setupWriter.marshalClientSetup({versions, params});
    await writer.write(setupWriter.getBytes());
    shaka.log.v1('Sent CLIENT_SETUP (draft-14)');

    const server = await this.readServerSetup_(reader);
    if (!versions.includes(server.version)) {
      throw new Error(
          `Server selected an unsupported version: 0x` +
          `${server.version.toString(16)}`);
    }
    shaka.log.v1('Received SERVER_SETUP (draft-14)');

    const controlStream =
        new shaka.msf.draft14.ControlStream(reader, writer, this.codec_);

    return new shaka.msf.RequestIdSession(
        webTransport, controlStream, this, config);
  }

  /**
   * Reads the draft-14 SERVER_SETUP, which carries the selected version
   * followed by the setup parameters.
   *
   * @param {!shaka.msf.Reader} reader
   * @return {!Promise<{version: number,
   *                    params: (Array<shaka.msf.Utils.KeyValuePair>|
   *                             undefined)}>}
   * @private
   */
  async readServerSetup_(reader) {
    const SERVER_SETUP = shaka.msf.Utils.MessageTypeId.SERVER_SETUP;

    const type = await reader.u53();
    if (type !== SERVER_SETUP) {
      throw new Error(
          `Server SETUP type must be ${SERVER_SETUP}, got ${type}`);
    }

    // 16-bit length, which we do not need beyond framing.
    await reader.read(2);

    const version = await reader.u53();
    const params = await reader.keyValuePairs();

    return {version, params};
  }

  /**
   * @param {string} token
   * @return {!Uint8Array}
   * @private
   */
  buildAuthToken_(token) {
    const tokenBytes = shaka.util.BufferUtils.toUint8(
        shaka.util.StringUtils.toUTF8(token));

    const writer = new shaka.util.DataViewWriter(
        2 + tokenBytes.length,
        shaka.util.DataViewWriter.Endianness.BIG_ENDIAN);

    // Alias Type = USE_VALUE (0x03), Token Type = 0.
    this.codec_.encodeVarInt(writer, BigInt(0x03));
    this.codec_.encodeVarInt(writer, BigInt(0x00));
    writer.writeBytes(tokenBytes);

    return writer.getBytes();
  }
};


/**
 * The in-band version number for draft-14.
 *
 * @const {number}
 */
shaka.msf.draft14.Dialect.VERSION = 0xff00000e;


shaka.msf.DialectRegistry.registerDialect(
    shaka.config.MsfVersion.DRAFT_14,
    () => new shaka.msf.draft14.Dialect());
