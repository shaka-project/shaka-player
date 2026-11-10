/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.draft23.MessageWriter');

goog.require('shaka.msf.draft18.MessageTypeId');
goog.require('shaka.msf.draft18.MessageWriter');
goog.require('shaka.msf.draft22.MessageWriter');


/**
 * Serializes draft-23 control messages, and says how the session reads what
 * changed in draft-23.
 *
 * The message bodies this player sends are those of draft-22. What differs:
 *
 *  - The Length of every control message is a var int rather than 16 bits
 *    (draft-23 section 9).
 *  - FILL_PARAMETERS is a Number of Parameters followed by them, with no
 *    length around it (section 9.19.15).
 *  - FORWARD (0x10) is gone. PAUSED (0x11) took its place with the meaning
 *    inverted, and it defaults to unpaused, which is what we want.
 *  - FETCH is answered by a REQUEST_OK without the End Of Track and End
 *    Location FETCH_OK had (section 9.3).
 *  - REQUEST_ERROR ends with Error Details rather than a Redirect (section
 *    9.4).
 *  - Fetch streams add 2 to an Object ID Delta within a Group, delta encode
 *    End of Range, and add End of Gone Range, End of Group and End of Track
 *    (section 11.4).
 *
 * @final
 */
shaka.msf.draft23.MessageWriter = class
  extends shaka.msf.draft22.MessageWriter {
  /** @override */
  hasVarIntMessageLength() {
    return true;
  }

  /** @override */
  getFetchOkLayout() {
    return {
      type: shaka.msf.draft18.MessageTypeId.REQUEST_OK,
      leadingBytes: 0,
      leadingVarInts: 0,
    };
  }

  /** @override */
  hasErrorDetails() {
    return true;
  }

  /** @override */
  getFetchSerialization() {
    return shaka.msf.draft18.MessageWriter.FetchSerialization.DRAFT_23;
  }

  /** @override */
  forwardParam() {
    return null;
  }

  /** @override */
  createNestedWriter() {
    return new shaka.msf.draft23.MessageWriter(this.getCodec());
  }

  /**
   * FILL_PARAMETERS leads with its own Number of Parameters and drops the
   * length that framed it before, and PAUSED replaces FORWARD as a uint8.
   *
   * @override
   */
  getParameterEncoding(type) {
    const Parameter = shaka.msf.draft23.MessageWriter.Parameter_;
    const Encoding = shaka.msf.draft18.MessageWriter.ParameterEncoding;
    switch (type) {
      case shaka.msf.draft18.MessageWriter.Parameter.FILL_PARAMETERS:
        return Encoding.PARAMETER_LIST;
      case Parameter.FORWARD:
        return null;
      case Parameter.PAUSED:
        return Encoding.UINT8;
    }
    return super.getParameterEncoding(type);
  }
};


/**
 * The parameter types whose encoding draft-23 changes.
 *
 * @enum {number}
 * @private
 */
shaka.msf.draft23.MessageWriter.Parameter_ = {
  FORWARD: 0x10,
  PAUSED: 0x11,
};
