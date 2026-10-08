/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

filterDescribe('shaka.msf.draft22.MessageWriter', isMSFSupported, () => {
  /** @type {!shaka.msf.draft22.MessageWriter} */
  let writer;

  beforeEach(() => {
    // Draft-22 keeps the draft-18 var int encoding, so it keeps the codec too.
    writer = new shaka.msf.draft22.MessageWriter(
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
    it('should carry the range as an Absolute Range filter', () => {
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
        0x21, // type delta, from 0: LOCATION_FILTER, with no length
        0x04, // Location Filter Type: Absolute Range
        0x01, // StartGroup 1
        0x02, // StartObject 2
        0x02, // EndGroupDelta 3 - 1
        0x04, // EndObject 4
      ]);
    });

    it('should default the range to the object at {0, 0}', () => {
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
        0x21, 0x04, // LOCATION_FILTER, Absolute Range
        0x00, 0x00, 0x00, 0x00,
      ]);
    });

    it('should keep the other parameters length-prefixed', () => {
      // Only LOCATION_FILTER lost its length; an odd parameter type of any
      // other kind is still framed by one.
      writer.marshalFetch({
        requestId: BigInt(2),
        namespace: ['ns'],
        trackName: 'a',
        startLocation: undefined,
        endLocation: undefined,
        params: [{type: BigInt(0x03), value: new Uint8Array([0xab])}],
      });

      expectMessage([0x16], [
        0x02,
        0x01, 0x02, 0x6e, 0x73,
        0x01, 0x61,
        0x02, // parameter count
        0x03, 0x01, 0xab, // AUTHORIZATION_TOKEN, 1 byte
        0x1e, 0x04, // delta 0x1e -> LOCATION_FILTER, Absolute Range
        0x00, 0x00, 0x00, 0x00,
      ]);
    });
  });

  describe('locationFilterParam', () => {
    it('should encode an open-ended start as Absolute Start', () => {
      const param = writer.locationFilterParam(
          {group: BigInt(7), object: BigInt(3)});

      expect(param.type).toBe(BigInt(0x21));
      expect(Array.from(/** @type {!Uint8Array} */(param.value)))
          .toEqual([0x02, 0x07, 0x03]);
    });

    it('should frame SUBSCRIBE\'s filter without a length', () => {
      writer.marshalSubscribe({
        requestId: BigInt(4),
        namespace: ['ns'],
        trackName: 'a',
        params: [writer.locationFilterParam(
            {group: BigInt(7), object: BigInt(3)})],
      });

      expectMessage([0x03], [
        0x04, // requestId
        0x01, 0x02, 0x6e, 0x73, // namespace ['ns']
        0x01, 0x61, // 'a'
        0x01, // parameter count
        0x21, 0x02, 0x07, 0x03, // LOCATION_FILTER, Absolute Start {7, 3}
      ]);
    });
  });

  describe('fillCurrentGroupParam', () => {
    it('should ask for the current Group as Relative Start 1', () => {
      const param = writer.fillCurrentGroupParam();

      expect(param.type).toBe(BigInt(0x23));
      expect(Array.from(/** @type {!Uint8Array} */(param.value))).toEqual([
        0x01, // Parameter count
        0x21, // LOCATION_FILTER, with no length
        0x01, // Location Filter Type: Relative Start
        0x01, // StartGroup 1: the current Group
      ]);
    });
  });

  describe('getParameterEncoding', () => {
    it('should make LOCATION_FILTER the only change from draft-20', () => {
      const draft20Writer = new shaka.msf.draft20.MessageWriter(
          new shaka.msf.draft18.Codec());
      const Encoding = shaka.msf.draft18.MessageWriter.ParameterEncoding;

      for (let type = 0; type < 0x40; type++) {
        const expected = type == 0x21 ?
            Encoding.LOCATION_FILTER : draft20Writer.getParameterEncoding(type);
        expect(writer.getParameterEncoding(type)).toBe(expected);
      }
    });
  });

  describe('inherited messages', () => {
    it('should serialize SETUP exactly as draft-21 does', () => {
      // Setup Options are not parameters, so an odd type keeps its length
      // even at the LOCATION_FILTER code point.
      const draft20Writer = new shaka.msf.draft20.MessageWriter(
          new shaka.msf.draft18.Codec());
      const options = [
        {type: BigInt(0x07), value: new Uint8Array([0xab])},
        {type: BigInt(0x21), value: new Uint8Array([0xcd])},
      ];

      writer.marshalSetup(options);
      draft20Writer.marshalSetup(options);

      expect(Array.from(writer.getBytes()))
          .toEqual(Array.from(draft20Writer.getBytes()));
    });
  });
});
