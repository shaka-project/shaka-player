/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.draft23.Dialect');

goog.require('shaka.config.MsfVersion');
goog.require('shaka.msf.DialectRegistry');
goog.require('shaka.msf.draft20.Dialect');
goog.require('shaka.msf.draft23.MessageWriter');


/**
 * The draft-23 dialect.
 *
 * Draft-23 keeps the draft-22 SETUP handshake, message type IDs, var int
 * encoding and stream topology. It changes the control message Length, a
 * few parameters, the answer to FETCH and the serialization of fetch
 * streams; the message writer covers all of them, writing and reading, so
 * this subclasses the draft-20 dialect and swaps the writer.
 *
 * @final
 */
shaka.msf.draft23.Dialect = class extends shaka.msf.draft20.Dialect {
  /** */
  constructor() {
    super(shaka.config.MsfVersion.DRAFT_23, 'moqt-23', 23);
  }

  /** @override */
  createMessageWriter() {
    return new shaka.msf.draft23.MessageWriter(this.getCodec());
  }
};


shaka.msf.DialectRegistry.registerDialect(
    shaka.config.MsfVersion.DRAFT_23,
    () => new shaka.msf.draft23.Dialect());
