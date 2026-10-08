/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.draft20.MessageWriter');

goog.require('shaka.msf.draft18.MessageTypeId');
goog.require('shaka.msf.draft18.MessageWriter');


/**
 * Serializes draft-20 control messages.
 *
 * Draft-20 is draft-18 with one message body changed, so this extends the
 * draft-18 writer and overrides marshalFetch() alone. Everything else --
 * the var int type and 16-bit length framing, SETUP, SUBSCRIBE, the parameter
 * and namespace encodings -- is byte for byte what draft-18 writes.
 *
 * The message type IDs this player sends and reads are unchanged too, so there
 * is no draft-20 copy of the enum. Draft-20 does rename PUBLISH_BLOCKED to
 * PUBLISH_SKIPPED and reserve PUBLISH_OK (0x1E), but this player sends
 * neither, so the draft-18 names are the ones in use and renaming them here
 * would leave two enums to keep in step for no gain.
 *
 * Draft-22 changed the LOCATION_FILTER value alone, so it extends this class
 * and overrides locationFilterValue() and createNestedWriter().
 */
shaka.msf.draft20.MessageWriter = class
  extends shaka.msf.draft18.MessageWriter {
  /**
   * Draft-20 removed the Fetch Type field along with the Joining variants, and
   * moved the range out of the message and into the LOCATION_FILTER parameter,
   * leaving a body shaped exactly like SUBSCRIBE.
   *
   * The range asked for is the same one draft-18 puts in the message, so it
   * goes out as a filter rather than being dropped: an absent LOCATION_FILTER
   * means an unfiltered fetch of the whole track (draft-20 section 10.2.9),
   * which is a different request.
   *
   * @override
   */
  marshalFetch(msg) {
    const range = shaka.msf.draft18.MessageWriter.fetchRange(msg);
    if (range.end.group < range.start.group) {
      // Delta encoding cannot express it, and the range is invalid in every
      // draft of this family anyway.
      throw new Error(
          `FETCH end group ${range.end.group} precedes start group ` +
          `${range.start.group}`);
    }

    const params = (msg.params || []).concat([{
      type: BigInt(shaka.msf.draft18.MessageWriter.Parameter.LOCATION_FILTER),
      // With all four fields present the filter is absolute, and EndGroupDelta
      // is measured from StartGroup rather than from the Largest Object. A
      // shorter field list would be read as a filter relative to the live edge
      // instead (draft-20 section 5.1.2).
      value: this.locationFilterValue([
        range.start.group,
        range.start.object,
        range.end.group - range.start.group,
        range.end.object,
      ]),
    }]);

    return this.marshal(shaka.msf.draft18.MessageTypeId.FETCH, () => {
      this.writeVarInt(msg.requestId);
      this.writeNamespace(msg.namespace);
      this.writeString(msg.trackName);
      this.writeParameters(params);
    });
  }

  /**
   * Draft-20 removed the Joining FETCH. A subscriber joins at the current
   * Group with FILL_PARAMETERS instead: its LOCATION_FILTER, evaluated like a
   * FETCH's, selects the Groups to fill, and StartGroup alone is relative to
   * the Next Group, so 1 is the current one (draft-20 section 5.1.6). The
   * publisher delivers them on a fill fetch stream whose FETCH_HEADER carries
   * the SUBSCRIBE's Request ID.
   *
   * The value is a Parameter list of its own, counted and delta encoded like
   * the one around it.
   *
   * @override
   */
  fillCurrentGroupParam() {
    const inner = this.createNestedWriter();
    inner.writeParameters([{
      type: BigInt(shaka.msf.draft18.MessageWriter.Parameter.LOCATION_FILTER),
      value: this.locationFilterValue([BigInt(1)]),
    }]);
    return {
      type: BigInt(shaka.msf.draft18.MessageWriter.Parameter.FILL_PARAMETERS),
      value: inner.getBytes(),
    };
  }

  /**
   * Draft-20 has no Joining FETCH; fillCurrentGroupParam() is what joins.
   *
   * @override
   */
  marshalJoiningFetch(msg) {
    throw new Error('Draft-20 has no Joining FETCH');
  }

  /**
   * Draft-20 replaced the Filter Type with a field count: the number of var
   * ints in the LOCATION_FILTER value is what says which fields are present,
   * and two of them are a Start Group and a Start Object, absolute and
   * open-ended (draft-20 section 9.20.10). That is the same request draft-18
   * spells as AbsoluteStart, so only the encoding changes here.
   *
   * The one reading that is not absolute is two zeroed fields, which mean the
   * Next Object instead; callers ask for {0, 0} by sending no filter at all,
   * so it cannot arrive here.
   *
   * @override
   */
  locationFilterParam(startLocation) {
    return {
      type: BigInt(shaka.msf.draft18.MessageWriter.Parameter.LOCATION_FILTER),
      value: this.locationFilterValue([
        startLocation.group,
        startLocation.object,
      ]),
    };
  }

  /**
   * The value of a LOCATION_FILTER holding these fields. In draft-20 that is
   * the fields alone: the parameter's length says how many there are.
   *
   * @param {!Array<bigint>} fields
   * @return {!Uint8Array}
   * @protected
   */
  locationFilterValue(fields) {
    return this.encodeVarIntField(fields);
  }

  /**
   * A writer of this draft for a parameter list nested inside another, as
   * FILL_PARAMETERS carries.
   *
   * @return {!shaka.msf.draft20.MessageWriter}
   * @protected
   */
  createNestedWriter() {
    return new shaka.msf.draft20.MessageWriter(this.getCodec());
  }
};
