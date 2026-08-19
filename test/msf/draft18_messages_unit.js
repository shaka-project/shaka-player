/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

filterDescribe('shaka.msf.draft18.MessageWriter', isMSFSupported, () => {
  /** @type {!shaka.msf.draft18.MessageWriter} */
  let writer;

  beforeEach(() => {
    writer = new shaka.msf.draft18.MessageWriter(
        new shaka.msf.draft18.Codec());
  });

  /**
   * Asserts the full serialization: the var int type, the 16-bit length, and
   * the exact payload bytes.
   *
   * The type is a var int in draft-18, not the single byte it was in
   * draft-16, so its width is part of what is being checked.
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

  describe('marshalSetup', () => {
    it('should encode the type 0x2f00 as a two-byte var int', () => {
      writer.marshalSetup([]);
      // 0x2f00 is 12032, which needs 14 bits: prefix 10, so 0xaf 0x00.
      expectMessage([0xaf, 0x00], []);
    });

    it('should write Setup Options without a count prefix', () => {
      // Setup Options span the whole payload bounded by the message length,
      // unlike every other message's counted parameter list.
      writer.marshalSetup([
        {type: BigInt(2), value: BigInt(42)},
        {type: BigInt(8), value: BigInt(7)},
      ]);

      expectMessage([0xaf, 0x00], [
        0x02, 0x2a, // delta 2 -> type 2 (even), value 42
        0x06, 0x07, // delta 6 -> type 8 (even), value 7
      ]);
    });

    it('should sort options by ascending type before delta encoding', () => {
      writer.marshalSetup([
        {type: BigInt(8), value: BigInt(7)},
        {type: BigInt(2), value: BigInt(42)},
      ]);
      expectMessage([0xaf, 0x00], [0x02, 0x2a, 0x06, 0x07]);
    });
  });

  describe('marshalSubscribe', () => {
    it('should marshal a subscribe with a counted parameter list', () => {
      writer.marshalSubscribe({
        requestId: BigInt(4),
        namespace: ['ns1', 'ns2'],
        trackName: 'track1',
        params: [{type: BigInt(2), value: BigInt(1)}],
      });

      expectMessage([0x03], [
        0x04, // requestId
        0x02, 0x03, 0x6e, 0x73, 0x31, 0x03, 0x6e, 0x73, 0x32, // ['ns1','ns2']
        0x06, 0x74, 0x72, 0x61, 0x63, 0x6b, 0x31, // 'track1'
        0x01, // parameter count
        0x02, 0x01, // delta 2 -> type 2 (even), value 1
      ]);
    });

    it('should write an empty parameter list as a zero count', () => {
      writer.marshalSubscribe({
        requestId: BigInt(0),
        namespace: [],
        trackName: '',
        params: [],
      });
      expectMessage([0x03], [0x00, 0x00, 0x00, 0x00]);
    });
  });

  describe('marshalFetch', () => {
    it('should encode start and end as Location structures', () => {
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
        0x01, // fetch type = standalone
        0x01, 0x02, 0x6e, 0x73, // namespace ['ns']
        0x01, 0x61, // 'a'
        0x01, 0x02, // start location
        0x03, 0x04, // end location
        0x00, // parameter count
      ]);
    });
  });

  describe('marshalRequestOk', () => {
    it('should carry no request id', () => {
      // The response goes back on the request's own bidirectional stream, so
      // there is nothing to correlate with in the message itself.
      writer.marshalRequestOk([]);
      expectMessage([0x07], [0x00]);
    });
  });

  describe('differences from draft-16', () => {
    it('should place SUBSCRIBE_NAMESPACE at 0x50, not 0x11', () => {
      writer.marshalSubscribeNamespace({
        requestId: BigInt(0),
        namespace: [],
        params: [],
      });
      // 80 fits in draft-18's 7-bit single-byte range, so the type is one
      // byte. Under draft-16's QUIC encoding the same value would have
      // needed two, which is a good illustration of why the codec cannot be
      // shared between the drafts.
      expectMessage([0x50], [0x00, 0x00, 0x00]);
    });

    it('should not share message ids with draft-16', () => {
      // 0x7 was PUBLISH_NAMESPACE_OK in draft-16 and is the generic
      // REQUEST_OK here; 0x8 was PUBLISH_NAMESPACE_ERROR and is now
      // NAMESPACE. Sharing an enum across drafts would mis-parse silently.
      const d16 = shaka.msf.Utils.MessageTypeId;
      const d18 = shaka.msf.draft18.MessageTypeId;
      expect(d16.PUBLISH_NAMESPACE_OK).toBe(0x7);
      expect(d18.REQUEST_OK).toBe(0x7);
      expect(d16.PUBLISH_NAMESPACE_ERROR).toBe(0x8);
      expect(d18.NAMESPACE).toBe(0x8);
      expect(d16.SUBSCRIBE_NAMESPACE).toBe(0x11);
      expect(d18.SUBSCRIBE_NAMESPACE).toBe(0x50);
    });
  });

  describe('key-value pair validation', () => {
    it('should reject an even key whose value is not a bigint', () => {
      expect(() => writer.marshalSetup(
          [{type: BigInt(2), value: new Uint8Array([1])}])).toThrow();
    });

    it('should reject an odd key whose value is not bytes', () => {
      expect(() => writer.marshalSetup(
          [{type: BigInt(3), value: BigInt(1)}])).toThrow();
    });

    it('should length-prefix an odd key value', () => {
      writer.marshalSetup([{type: BigInt(3), value: new Uint8Array([0xde])}]);
      expectMessage([0xaf, 0x00], [0x03, 0x01, 0xde]);
    });
  });
});
