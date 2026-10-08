/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.draft22.Dialect');

goog.require('shaka.config.MsfVersion');
goog.require('shaka.msf.DialectRegistry');
goog.require('shaka.msf.draft20.Dialect');
goog.require('shaka.msf.draft22.MessageWriter');


/**
 * The draft-22 dialect.
 *
 * Draft-22 changed one thing on the wire: the LOCATION_FILTER parameter
 * carries an explicit Location Filter Type in place of its length. The rest
 * -- the SETUP handshake, the message type IDs, the var int encoding, the
 * stream topology and the data plane -- is byte for byte draft-21, so this
 * subclasses the draft-20 dialect and swaps the message writer.
 *
 * @final
 */
shaka.msf.draft22.Dialect = class extends shaka.msf.draft20.Dialect {
  /** */
  constructor() {
    super(shaka.config.MsfVersion.DRAFT_22, 'moqt-22', 22);
  }

  /** @override */
  createMessageWriter() {
    return new shaka.msf.draft22.MessageWriter(this.getCodec());
  }
};


shaka.msf.DialectRegistry.registerDialect(
    shaka.config.MsfVersion.DRAFT_22,
    () => new shaka.msf.draft22.Dialect());
