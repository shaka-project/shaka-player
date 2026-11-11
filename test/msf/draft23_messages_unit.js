/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

filterDescribe('shaka.msf.draft23.MessageWriter', isMSFSupported, () => {
  /** @type {!shaka.msf.draft23.MessageWriter} */
  let writer;

  beforeEach(() => {
    // Draft-23 keeps the draft-18 var int encoding, so it keeps the codec too.
    writer = new shaka.msf.draft23.MessageWriter(
        new shaka.msf.draft18.Codec());
  });

  describe('marshal', () => {
    it('should write a short Length as a one-byte var int', () => {
      writer.marshalSubscribe({
        requestId: BigInt(4),
        namespace: ['ns'],
        trackName: 'a',
        params: [],
      });

      expect(Array.from(writer.getBytes())).toEqual([
        0x03, // SUBSCRIBE
        0x08, // Length, a var int
        0x04, // requestId
        0x01, 0x02, 0x6e, 0x73, // namespace ['ns']
        0x01, 0x61, // 'a'
        0x00, // parameter count
      ]);
    });

    it('should widen the Length when the payload needs it', () => {
      // 128 is the first value a one-byte var int cannot hold, and the
      // payload has to move along behind the wider Length.
      const trackName = 'a'.repeat(121);
      writer.marshalSubscribe({
        requestId: BigInt(4),
        namespace: ['ns'],
        trackName,
        params: [],
      });

      const bytes = Array.from(writer.getBytes());
      expect(bytes.slice(0, 3)).toEqual([
        0x03, // SUBSCRIBE
        0x80, 0x80, // Length 128 as a two-byte var int
      ]);
      expect(bytes.length).toBe(3 + 128);
      expect(bytes.slice(3, 8)).toEqual([0x04, 0x01, 0x02, 0x6e, 0x73]);
      expect(bytes.slice(8, 9)).toEqual([121]); // Track Name Length
      expect(bytes[bytes.length - 1]).toBe(0x00); // parameter count
    });

    it('should frame the SETUP Length as a var int too', () => {
      writer.marshalSetup([{type: BigInt(0x02), value: BigInt(5)}]);

      expect(Array.from(writer.getBytes())).toEqual([
        0xaf, 0x00, // SETUP (0x2F00)
        0x02, // Length
        0x02, 0x05, // an even Setup Option
      ]);
    });
  });

  describe('fillParam', () => {
    it('should drop the length around FILL_PARAMETERS', () => {
      writer.marshalSubscribe({
        requestId: BigInt(4),
        namespace: ['ns'],
        trackName: 'a',
        params: [writer.fillParam(null)],
      });

      expect(Array.from(writer.getBytes().subarray(2))).toEqual([
        0x04, // requestId
        0x01, 0x02, 0x6e, 0x73, // namespace ['ns']
        0x01, 0x61, // 'a'
        0x01, // parameter count
        0x23, // FILL_PARAMETERS, with no length:
        0x01, // Number of Parameters
        0x21, 0x01, 0x01, // LOCATION_FILTER, Relative Start, StartGroup 1
      ]);
    });

    it('should nest a draft-23 parameter list', () => {
      // A nested writer of an older draft would put the length back.
      const param = writer.fillParam({group: BigInt(7), object: BigInt(3)});

      expect(param.type).toBe(BigInt(0x23));
      expect(Array.from(/** @type {!Uint8Array} */(param.value))).toEqual([
        0x01, // Number of Parameters
        0x21, 0x02, 0x07, 0x03, // LOCATION_FILTER, Absolute Start {7, 3}
      ]);
    });
  });

  describe('marshalFetch', () => {
    it('should keep the draft-22 absolute range', () => {
      // Draft-23 refuses a relative filter in a FETCH, and this one is not.
      writer.marshalFetch({
        requestId: BigInt(2),
        namespace: ['ns'],
        trackName: 'a',
        startLocation: {group: BigInt(1), object: BigInt(2)},
        endLocation: {group: BigInt(3), object: BigInt(4)},
        params: [],
      });

      expect(Array.from(writer.getBytes())).toEqual([
        0x16, // FETCH
        0x0e, // Length
        0x02, // requestId
        0x01, 0x02, 0x6e, 0x73, // namespace ['ns']
        0x01, 0x61, // 'a'
        0x01, // parameter count
        0x21, 0x04, 0x01, 0x02, 0x02, 0x04, // Absolute Range {1, 2}-{3, 4}
      ]);
    });
  });

  describe('wire format', () => {
    it('should not send FORWARD, which PAUSED replaced', () => {
      expect(writer.forwardParam()).toBeNull();
    });

    it('should describe how the session reads draft-23', () => {
      const Encoding = shaka.msf.draft18.MessageWriter.ParameterEncoding;

      expect(writer.hasVarIntMessageLength()).toBe(true);
      expect(writer.getFetchOkLayout()).toEqual({
        type: shaka.msf.draft18.MessageTypeId.REQUEST_OK,
        leadingBytes: 0,
        leadingVarInts: 0,
      });
      expect(writer.getFetchSerialization()).toBe(
          shaka.msf.draft18.MessageWriter.FetchSerialization.DRAFT_23);
      expect(writer.getParameterEncoding(0x23)).toBe(Encoding.PARAMETER_LIST);
      expect(writer.getParameterEncoding(0x11)).toBe(Encoding.UINT8);
      expect(writer.getParameterEncoding(0x10)).toBeNull();
      expect(writer.getParameterEncoding(0x21))
          .toBe(Encoding.LOCATION_FILTER);
    });

    it('should leave draft-22 as it was', () => {
      const draft22 = new shaka.msf.draft22.MessageWriter(
          new shaka.msf.draft18.Codec());

      expect(draft22.hasVarIntMessageLength()).toBe(false);
      expect(draft22.getFetchOkLayout().type).toBe(
          shaka.msf.draft18.MessageTypeId.FETCH_OK);
      expect(draft22.getFetchSerialization()).toBe(
          shaka.msf.draft18.MessageWriter.FetchSerialization.DRAFT_18);
      expect(draft22.forwardParam()).not.toBeNull();
    });
  });
});
