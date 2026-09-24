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
 * @final
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
      value: this.encodeVarIntField([
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
      value: this.encodeVarIntField([
        startLocation.group,
        startLocation.object,
      ]),
    };
  }
};
