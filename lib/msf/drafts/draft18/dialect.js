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
 * The draft-18 dialect, and the base of the draft-18 family.
 *
 * Draft-20 and draft-21 differ from draft-18 in one control message body and
 * nothing else, so they subclass this and override createMessageWriter() and
 * the three identity accessors. Everything here -- the SETUP handshake, the
 * authorization token layout, the codec, the session -- is shared verbatim.
 *
 * @implements {shaka.extern.MsfDialect}
 */
shaka.msf.draft18.Dialect = class {
  /** */
  constructor() {
    /** @private {!shaka.msf.draft18.Codec} */
    this.codec_ = new shaka.msf.draft18.Codec();
  }

  /**
   * Builds a writer for this draft's control messages.
   *
   * @return {!shaka.msf.draft18.MessageWriter}
   * @protected
   */
  createMessageWriter() {
    return new shaka.msf.draft18.MessageWriter(this.codec_);
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

    const writer = this.createMessageWriter();
    writer.marshalSetup(options);
    await controlWriter.write(writer.getBytes());
    shaka.log.v1(`Sent SETUP on our control stream (${this.getName()})`);

    return new shaka.msf.draft18.Session(
        webTransport, controlWriter, this, config,
        () => this.createMessageWriter());
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
