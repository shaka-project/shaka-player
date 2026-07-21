/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.IControlStream');

goog.requireType('shaka.msf.Utils');


/**
 * A control stream carrying MoQT control messages in some draft's wire format.
 *
 * shaka.msf.RequestIdSession talks to one of these rather than to a concrete
 * class: draft-14 and draft-16 share a single bidirectional control stream and
 * the same session logic, and differ only in how the messages on it are
 * serialized.
 *
 * This is internal plumbing between the two implementations rather than a
 * plugin contract, which is why it lives here and not in externs alongside
 * shaka.extern.MsfDialect.
 *
 * @interface
 */
shaka.msf.IControlStream = class {
  /**
   * Reads the next control message.
   *
   * @return {!Promise<shaka.msf.Utils.Message>}
   */
  receive() {}

  /**
   * Writes a control message.
   *
   * @param {shaka.msf.Utils.Message} msg
   * @return {!Promise}
   */
  send(msg) {}
};
