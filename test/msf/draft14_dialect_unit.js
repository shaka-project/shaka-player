/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

filterDescribe('shaka.msf.draft14.Dialect', isMSFSupported, () => {
  /** @type {!shaka.msf.draft14.Dialect} */
  let dialect;

  beforeEach(() => {
    dialect = new shaka.msf.draft14.Dialect();
  });

  it('should identify itself as draft-14 over the moq-00 subprotocol', () => {
    // Drafts before -15 all used moq-00 and negotiated the real version in
    // band, so the subprotocol alone does not identify draft-14.
    expect(dialect.getSubprotocol()).toBe('moq-00');
    expect(dialect.getName()).toBe(shaka.config.MsfVersion.DRAFT_14);
    expect(dialect.getDraftNumber()).toBe(14);
  });

  it('should use the QUIC var int codec, as draft-16 does', () => {
    // The integer encoding only changed in draft-17.
    expect(dialect.getCodec()).toEqual(jasmine.any(shaka.msf.QuicVarIntCodec));
  });

  it('should warn that draft-14 is removed in v6 when connecting', async () => {
    const warning = spyOn(shaka.log, 'alwaysWarn');

    // connect() fails once it tries to open a stream on the fake transport,
    // which is fine: the deprecation notice is raised before any I/O.
    const fakeTransport = /** @type {!WebTransport} */ ({
      createBidirectionalStream: () =>
        Promise.reject(new Error('no transport')),
    });

    await expectAsync(dialect.connect(
        fakeTransport,
        /** @type {!shaka.extern.MsfManifestConfiguration} */ ({}),
        null)).toBeRejected();

    expect(warning).toHaveBeenCalled();
    const message = warning.calls.mostRecent().args.join(' ');
    expect(message).toContain('draft-14');
    expect(message).toContain('v6');
  });
});


filterDescribe('shaka.msf.draft14.MessageWriter', isMSFSupported, () => {
  /** @type {!shaka.msf.draft14.MessageWriter} */
  let writer;

  beforeEach(() => {
    writer = new shaka.msf.draft14.MessageWriter(
        new shaka.msf.QuicVarIntCodec());
  });

  /**
   * @param {number} expectedType
   * @param {!Array<number>} expectedPayload
   */
  function expectMessage(expectedType, expectedPayload) {
    const bytes = Array.from(writer.getBytes());
    expect(bytes[0]).toBe(expectedType);
    expect((bytes[1] << 8) | bytes[2]).toBe(expectedPayload.length);
    expect(bytes.slice(3)).toEqual(expectedPayload);
  }

  it('should carry the offered versions in CLIENT_SETUP', () => {
    // The defining difference from draft-16: the version list is in band
    // rather than negotiated through the WebTransport subprotocol.
    writer.marshalClientSetup({versions: [0xff00000e], params: []});

    expectMessage(shaka.msf.Utils.MessageTypeId.CLIENT_SETUP, [
      0x01, // version count
      0xc0, 0x00, 0x00, 0x00, 0xff, 0x00, 0x00, 0x0e, // 0xff00000e
      0x00, // param count
    ]);
  });

  it('should write SUBSCRIBE fields inline rather than as parameters', () => {
    // Draft-16 moved priority, forward, filter and group order into the
    // parameter list; draft-14 keeps them as fixed fields.
    writer.marshalSubscribe({
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE,
      requestId: BigInt(1),
      namespace: ['ns'],
      name: 'a',
      subscriberPriority: 2,
      groupOrder: shaka.msf.Utils.GroupOrder.ASCENDING,
      forward: true,
      filterType: shaka.config.MsfFilterType.NONE,
      params: [],
    });

    expectMessage(shaka.msf.Utils.MessageTypeId.SUBSCRIBE, [
      0x01, // requestId
      0x01, 0x02, 0x6e, 0x73, // namespace ['ns']
      0x01, 0x61, // 'a'
      0x02, // subscriberPriority
      0x01, // groupOrder ASCENDING
      0x01, // forward
      0x00, // filterType NONE
      0x00, // param count
    ]);
  });

  it('should write parameters with absolute, not delta, types', () => {
    writer.marshalPublishNamespace({
      kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE,
      requestId: BigInt(0),
      namespace: [],
      params: [
        {type: BigInt(2), value: BigInt(1)},
        {type: BigInt(8), value: BigInt(2)},
      ],
    });

    // Draft-16 would encode the second type as the delta 6; draft-14 writes
    // the absolute 8.
    expectMessage(shaka.msf.Utils.MessageTypeId.PUBLISH_NAMESPACE, [
      0x00, // requestId
      0x00, // empty namespace
      0x02, // param count
      0x02, 0x01, // type 2, value 1
      0x08, 0x02, // type 8 absolute, not delta 6
    ]);
  });

  it('should omit the retry interval from SUBSCRIBE_ERROR', () => {
    // Draft-16 added a retry interval to the error messages.
    writer.marshalSubscribeError({
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE_ERROR,
      requestId: BigInt(1),
      code: BigInt(4),
      reason: 'no',
    });

    expectMessage(shaka.msf.Utils.MessageTypeId.SUBSCRIBE_ERROR, [
      0x01, // requestId
      0x04, // code
      0x02, 0x6e, 0x6f, // 'no'
    ]);
  });

  it('should omit parameters from PUBLISH_NAMESPACE_OK', () => {
    // Draft-16 turned this into REQUEST_OK, which carries a parameter list.
    writer.marshalPublishNamespaceOk({
      kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_OK,
      requestId: BigInt(3),
    });

    expectMessage(shaka.msf.Utils.MessageTypeId.PUBLISH_NAMESPACE_OK, [0x03]);
  });
});
