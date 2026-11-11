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
   * Location {0, 0}. A SUBSCRIBE that starts at {0, 0} is sent with no
   * filter at all; only a fill from the origin spells it, which is the
   * draft-22 reading.
   *
   * @override
   */
  locationFilterValue(fields) {
    return this.encodeVarIntField([BigInt(fields.length), ...fields]);
  }

  /**
   * Draft-22 reads two zeroed fields as the absolute Location {0, 0}, so a
   * fill from the origin can say so instead of leaning on the subscription's
   * filter, as draft-20 has to.
   *
   * @override
   */
  fillParam(startLocation) {
    if (!startLocation || startLocation.group || startLocation.object) {
      return super.fillParam(startLocation);
    }
    const inner = this.createNestedWriter();
    inner.writeParameters([this.locationFilterParam(startLocation)]);
    return {
      type: BigInt(shaka.msf.draft18.MessageWriter.Parameter.FILL_PARAMETERS),
      value: inner.getBytes(),
    };
  }

  /** @override */
  nextObjectFilterParam() {
    return {
      type: BigInt(shaka.msf.draft18.MessageWriter.Parameter.LOCATION_FILTER),
      value: this.encodeVarIntField([BigInt(0x05)]),
    };
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
