/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.draft22.MessageWriter');

goog.require('shaka.msf.draft18.MessageWriter');
goog.require('shaka.msf.draft20.MessageWriter');


/**
 * Serializes draft-22 control messages.
 *
 * Draft-22 is draft-21 with one parameter changed: LOCATION_FILTER (0x21)
 * lost its length and leads with an explicit Location Filter Type instead,
 * which says which fields follow (draft-22 section 9.20.9). Every message
 * body, type ID and other parameter is byte for byte draft-21, so this
 * extends the draft-20 writer and changes how that one value is encoded and
 * framed.
 *
 * @final
 */
shaka.msf.draft22.MessageWriter = class
  extends shaka.msf.draft20.MessageWriter {
  /**
   * The Location Filter Types that carry fields -- 0x01 Relative Start, 0x02
   * Absolute Start, 0x03 Absolute Start with a Group End and 0x04 Absolute
   * Range -- are numbered by how many fields they carry, and each has exactly
   * the meaning draft-20 gave that many fields. So the type is the field
   * count, and everything draft-20 asks for keeps its meaning.
   *
   * The one form that does not carry over is two zeroed fields, which
   * draft-20 read as the Next Object and draft-22 reads as the absolute
   * Location {0, 0}. Callers ask for {0, 0} by sending no filter at all, so
   * it cannot arrive here.
   *
   * @override
   */
  locationFilterValue(fields) {
    return this.encodeVarIntField([BigInt(fields.length), ...fields]);
  }

  /** @override */
  createNestedWriter() {
    return new shaka.msf.draft22.MessageWriter(this.getCodec());
  }

  /**
   * With its Filter Type in front, a LOCATION_FILTER says where it ends
   * itself, and draft-22 drops the length that framed it before.
   *
   * @override
   */
  getParameterEncoding(type) {
    if (type == shaka.msf.draft18.MessageWriter.Parameter.LOCATION_FILTER) {
      return shaka.msf.draft18.MessageWriter.ParameterEncoding.LOCATION_FILTER;
    }
    return super.getParameterEncoding(type);
  }
};
