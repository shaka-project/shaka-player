/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.draft20.Dialect');

goog.require('shaka.config.MsfVersion');
goog.require('shaka.msf.DialectRegistry');
goog.require('shaka.msf.draft18.Dialect');
goog.require('shaka.msf.draft20.MessageWriter');


/**
 * The draft-20 dialect, which also serves draft-21.
 *
 * Draft-20 changed one thing this player can observe: FETCH lost its Fetch
 * Type field and its Start and End Locations, which moved into the
 * LOCATION_FILTER parameter. Everything else it touches -- the SETUP
 * handshake, SUBSCRIBE and SUBSCRIBE_OK, the message type IDs, the
 * leading-ones var int encoding, the pair of unidirectional control streams,
 * the per-request bidirectional streams, and the whole data plane down to the
 * SUBGROUP_HEADER type flag bits -- is byte for byte draft-18. So this
 * subclasses the draft-18 dialect and swaps the message writer.
 *
 * Draft-21 is draft-20 with editorial changes only: its own change log lists
 * nothing but restructuring, and every wire format block and code point table
 * is identical. It is therefore the same implementation under a different
 * name and subprotocol, not a dialect of its own.
 *
 * @final
 */
shaka.msf.draft20.Dialect = class extends shaka.msf.draft18.Dialect {
  /**
   * @param {shaka.config.MsfVersion} name
   * @param {string} subprotocol
   * @param {number} draftNumber
   */
  constructor(name, subprotocol, draftNumber) {
    super();

    /** @private {shaka.config.MsfVersion} */
    this.name_ = name;
    /** @private {string} */
    this.subprotocol_ = subprotocol;
    /** @private {number} */
    this.draftNumber_ = draftNumber;
  }

  /** @override */
  getSubprotocol() {
    return this.subprotocol_;
  }

  /** @override */
  getName() {
    return this.name_;
  }

  /** @override */
  getDraftNumber() {
    return this.draftNumber_;
  }

  /** @override */
  createMessageWriter() {
    return new shaka.msf.draft20.MessageWriter(this.getCodec());
  }
};


shaka.msf.DialectRegistry.registerDialect(
    shaka.config.MsfVersion.DRAFT_20,
    () => new shaka.msf.draft20.Dialect(
        shaka.config.MsfVersion.DRAFT_20, 'moqt-20', 20));

shaka.msf.DialectRegistry.registerDialect(
    shaka.config.MsfVersion.DRAFT_21,
    () => new shaka.msf.draft20.Dialect(
        shaka.config.MsfVersion.DRAFT_21, 'moqt-21', 21));
