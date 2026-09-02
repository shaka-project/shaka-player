/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.Sender');

goog.require('shaka.log');
goog.require('shaka.msf.BufferControlWriter');

goog.requireType('shaka.msf.Utils');
goog.requireType('shaka.msf.Writer');

shaka.msf.Sender = class {
  /**
   * @param {!shaka.msf.Writer} writer
   * @param {!shaka.extern.MsfCodec} codec
   */
  constructor(writer, codec) {
    /** @private {!shaka.msf.Writer} */
    this.writer_ = writer;

    /** @private {!shaka.extern.MsfCodec} */
    this.codec_ = codec;
  }

  /**
   * @param {shaka.msf.Utils.ClientSetup} client
   * @return {!Promise}
   */
  async client(client) {
    shaka.log.debug('Encoding client setup message:', client);

    // Create a message writer for the negotiated draft
    const writer = new shaka.msf.BufferControlWriter(this.codec_);

    // Marshal the client setup message
    writer.marshalClientSetup({
      params: client.params,
    });

    // Get the bytes from the writer
    const bytes = writer.getBytes();
    shaka.log.v1(`Client setup message created: ${bytes.length} bytes`);

    // Write the entire message in a single operation
    await this.writer_.write(bytes);

    shaka.log.v1('Client setup message sent successfully');
  }
};
