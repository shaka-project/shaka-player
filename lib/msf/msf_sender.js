/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
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
   */
  constructor(writer) {
    /** @private {!shaka.msf.Writer} */
    this.writer_ = writer;
  }

  /**
   * @param {shaka.msf.Utils.ClientSetup} client
   * @return {!Promise}
   */
  async client(client) {
    shaka.log.debug('Encoding client setup message:', client);

    // Create a BufferControlWriter instance
    const writer = new shaka.msf.BufferControlWriter();

    // Marshal the client setup message
    writer.marshalClientSetup({
      versions: client.versions,
      params: client.params,
    });

    // Get the bytes from the writer
    const bytes = writer.getBytes();
    shaka.log.debug(`Client setup message created: ${bytes.length} bytes`);

    // Write the entire message in a single operation
    await this.writer_.write(bytes);

    shaka.log.debug('Client setup message sent successfully');
  }
};
