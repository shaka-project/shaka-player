/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

filterDescribe('shaka.msf.draft20.MessageWriter', isMSFSupported, () => {
  /** @type {!shaka.msf.draft20.MessageWriter} */
  let writer;

  beforeEach(() => {
    // Draft-20 keeps the draft-18 var int encoding, so it keeps the codec too.
    writer = new shaka.msf.draft20.MessageWriter(
        new shaka.msf.draft18.Codec());
  });

  /**
   * Asserts the full serialization: the var int type, the 16-bit length, and
   * the exact payload bytes.
   *
   * @param {!Array<number>} expectedType
   * @param {!Array<number>} expectedPayload
   */
  function expectMessage(expectedType, expectedPayload) {
    const bytes = Array.from(writer.getBytes());
    const typeWidth = expectedType.length;
    expect(bytes.slice(0, typeWidth)).toEqual(expectedType);

    const length = (bytes[typeWidth] << 8) | bytes[typeWidth + 1];
    expect(length).toBe(expectedPayload.length);
    expect(bytes.slice(typeWidth + 2)).toEqual(expectedPayload);
  }

  describe('marshalFetch', () => {
    it('should drop the fetch type and carry the range as a filter', () => {
      // Draft-20 removed the Fetch Type field along with the Joining variants
      // and moved the range into the LOCATION_FILTER parameter, leaving a body
      // shaped like SUBSCRIBE.
      writer.marshalFetch({
        requestId: BigInt(2),
        namespace: ['ns'],
        trackName: 'a',
        startLocation: {group: BigInt(1), object: BigInt(2)},
        endLocation: {group: BigInt(3), object: BigInt(4)},
        params: [],
      });

      expectMessage([0x16], [
        0x02, // requestId
        0x01, 0x02, 0x6e, 0x73, // namespace ['ns']
        0x01, 0x61, // 'a'
        0x01, // parameter count
        0x21, // type delta, from 0: LOCATION_FILTER
        0x04, // value length
        0x01, // StartGroup 1
        0x02, // StartObject 2
        0x02, // EndGroupDelta 3 - 1
        0x04, // EndObject 4
      ]);
    });

    it('should default the range to the object at {0, 0}', () => {
      // An omitted LOCATION_FILTER would mean an unfiltered fetch of the whole
      // track, which is a different request, so the default range is written
      // out. All four fields present makes it absolute rather than relative to
      // the live edge.
      writer.marshalFetch({
        requestId: BigInt(2),
        namespace: ['ns'],
        trackName: 'a',
        startLocation: undefined,
        endLocation: undefined,
        params: [],
      });

      expectMessage([0x16], [
        0x02,
        0x01, 0x02, 0x6e, 0x73,
        0x01, 0x61,
        0x01, // parameter count
        0x21, 0x04, // LOCATION_FILTER, 4 bytes
        0x00, 0x00, 0x00, 0x00,
      ]);
    });

    it('should reject a range whose end group precedes its start', () => {
      expect(() => writer.marshalFetch({
        requestId: BigInt(2),
        namespace: ['ns'],
        trackName: 'a',
        startLocation: {group: BigInt(5), object: BigInt(0)},
        endLocation: {group: BigInt(3), object: BigInt(0)},
        params: [],
      })).toThrow();
    });
  });

  describe('inherited messages', () => {
    it('should serialize SUBSCRIBE exactly as draft-18 does', () => {
      // Every message body but FETCH is unchanged, so this proves the
      // subclass did not disturb the framing it inherits.
      const draft18Writer = new shaka.msf.draft18.MessageWriter(
          new shaka.msf.draft18.Codec());
      const msg = {
        requestId: BigInt(4),
        namespace: ['ns', 'sub'],
        trackName: 'track',
        params: [{type: BigInt(0x10), value: BigInt(1)}],
      };

      writer.marshalSubscribe(msg);
      draft18Writer.marshalSubscribe(msg);

      expect(Array.from(writer.getBytes()))
          .toEqual(Array.from(draft18Writer.getBytes()));
    });

    it('should serialize SETUP exactly as draft-18 does', () => {
      const draft18Writer = new shaka.msf.draft18.MessageWriter(
          new shaka.msf.draft18.Codec());
      const options = [{type: BigInt(0x07), value: new Uint8Array([0xab])}];

      writer.marshalSetup(options);
      draft18Writer.marshalSetup(options);

      expect(Array.from(writer.getBytes()))
          .toEqual(Array.from(draft18Writer.getBytes()));
    });
  });
});
