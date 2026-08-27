/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.draft18.Dialect');

goog.require('shaka.Player');
goog.require('shaka.config.MsfVersion');
goog.require('shaka.log');
goog.require('shaka.msf.DialectRegistry');
goog.require('shaka.msf.Utils');
goog.require('shaka.msf.Writer');
goog.require('shaka.msf.draft18.Codec');
goog.require('shaka.msf.draft18.MessageWriter');
goog.require('shaka.msf.draft18.Session');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.DataViewWriter');
goog.require('shaka.util.StringUtils');


/**
 * The draft-18 dialect.
 *
 * @implements {shaka.extern.MsfDialect}
 * @final
 */
shaka.msf.draft18.Dialect = class {
  /** */
  constructor() {
    /** @private {!shaka.msf.draft18.Codec} */
    this.codec_ = new shaka.msf.draft18.Codec();
  }

  /** @override */
  getSubprotocol() {
    return 'moqt-18';
  }

  /** @override */
  getName() {
    return shaka.config.MsfVersion.DRAFT_18;
  }

  /** @override */
  getDraftNumber() {
    return 18;
  }

  /** @override */
  getCodec() {
    return this.codec_;
  }

  /** @override */
  async connect(webTransport, config, authorizationToken) {
    // We open our own unidirectional control stream and send SETUP on it
    // without waiting for the peer's; the session picks the peer's control
    // stream out of the incoming unidirectional streams by its SETUP.
    const controlStream =
        await webTransport.createUnidirectionalStream();
    const controlWriter = new shaka.msf.Writer(controlStream);

    const implementation = 'ShakaPlayer/' + shaka.Player.version;
    /** @type {!Array<shaka.msf.Utils.KeyValuePair>} */
    const options = [
      {
        type: BigInt(shaka.msf.Utils.SetupOption.IMPLEMENTATION),
        value: shaka.util.BufferUtils.toUint8(
            shaka.util.StringUtils.toUTF8(implementation)),
      },
    ];
    if (authorizationToken) {
      options.push({
        type: BigInt(shaka.msf.Utils.SetupOption.AUTHORIZATION_TOKEN),
        value: this.buildAuthToken_(authorizationToken),
      });
    }

    const writer = new shaka.msf.draft18.MessageWriter(this.codec_);
    writer.marshalSetup(options);
    await controlWriter.write(writer.getBytes());
    shaka.log.v1('Sent SETUP on our control stream (draft-18)');

    return new shaka.msf.draft18.Session(
        webTransport, controlWriter, this, config);
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


shaka.msf.DialectRegistry.registerDialect(
    shaka.config.MsfVersion.DRAFT_18,
    () => new shaka.msf.draft18.Dialect());
