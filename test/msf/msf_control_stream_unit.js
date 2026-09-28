filterDescribe('shaka.msf.ControlStream', isMSFSupported, () => {
  /** @type {!shaka.msf.ControlStream} */
  let controlStream;

  /** @type {!shaka.msf.QuicVarIntCodec} */
  const codec = new shaka.msf.QuicVarIntCodec();

  /** @type {!shaka.msf.Reader} */
  let reader;

  /** @type {!shaka.msf.Writer} */
  let writer;

  /** @type {!Array<!Uint8Array>} */
  let writtenChunks;

  const messages = [
    {
      kind: shaka.msf.Utils.MessageType.GOAWAY,
      msg: {
        kind: shaka.msf.Utils.MessageType.GOAWAY,
        newSessionUri: 'https://new.session',
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.MAX_REQUEST_ID,
      msg: {
        kind: shaka.msf.Utils.MessageType.MAX_REQUEST_ID,
        requestId: 123,
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.REQUESTS_BLOCKED,
      msg: {
        kind: shaka.msf.Utils.MessageType.REQUESTS_BLOCKED,
        maximumRequestId: 456,
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE,
      msg: {
        kind: shaka.msf.Utils.MessageType.SUBSCRIBE,
        requestId: 1,
        namespace: ['ns'],
        name: 'track',
        subscriberPriority: 0,
        groupOrder: shaka.msf.Utils.GroupOrder.PUBLISHER,
        forward: true,
        filterType: shaka.config.MsfFilterType.NONE,
        params: [],
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE_OK,
      msg: {
        kind: shaka.msf.Utils.MessageType.SUBSCRIBE_OK,
        requestId: 1,
        trackAlias: 2,
        expires: BigInt(12345),
        groupOrder: shaka.msf.Utils.GroupOrder.ASCENDING,
        contentExists: false,
        params: [],
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE_ERROR,
      msg: {
        kind: shaka.msf.Utils.MessageType.SUBSCRIBE_ERROR,
        requestId: 1,
        code: 404,
        reason: 'Not found',
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE_UPDATE,
      msg: {
        kind: shaka.msf.Utils.MessageType.SUBSCRIBE_UPDATE,
        requestId: 1,
        subscriptionRequestId: 2,
        startLocation: {
          group: 1,
          object: 2,
        },
        endGroup: 10,
        subscriberPriority: 0,
        forward: true,
        params: [],
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.UNSUBSCRIBE,
      msg: {
        kind: shaka.msf.Utils.MessageType.UNSUBSCRIBE,
        requestId: 1,
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.PUBLISH_DONE,
      msg: {
        kind: shaka.msf.Utils.MessageType.PUBLISH_DONE,
        requestId: 1,
        code: 0,
        streamCount: 5,
        reason: 'Done',
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.PUBLISH,
      msg: {
        kind: shaka.msf.Utils.MessageType.PUBLISH,
        requestId: 1,
        namespace: ['ns'],
        name: 'track',
        trackAlias: 1,
        groupOrder: shaka.msf.Utils.GroupOrder.PUBLISHER,
        contentExists: true,
        largestLocation: {
          group: 1,
          object: 2,
        },
        forward: true,
        params: [],
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.PUBLISH_OK,
      msg: {
        kind: shaka.msf.Utils.MessageType.PUBLISH_OK,
        requestId: 1,
        forward: true,
        subscriberPriority: 0,
        groupOrder: shaka.msf.Utils.GroupOrder.PUBLISHER,
        filterType: shaka.msf.Utils.FilterType.NONE,
        params: [],
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.PUBLISH_ERROR,
      msg: {
        kind: shaka.msf.Utils.MessageType.PUBLISH_ERROR,
        requestId: 1,
        code: 500,
        reason: 'Server error',
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.FETCH_ERROR,
      msg: {
        kind: shaka.msf.Utils.MessageType.FETCH_ERROR,
        requestId: 1,
        code: 500,
        reason: 'Server error',
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.FETCH_CANCEL,
      msg: {
        kind: shaka.msf.Utils.MessageType.FETCH_CANCEL,
        requestId: 1,
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE,
      msg: {
        kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE,
        requestId: 1,
        namespace: ['ns'],
        params: [],
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_OK,
      msg: {
        kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_OK,
        requestId: 1,
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_ERROR,
      msg: {
        kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_ERROR,
        requestId: 1,
        code: 500,
        reason: 'Server error',
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_DONE,
      msg: {
        kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_DONE,
        requestId: BigInt(1),
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_CANCEL,
      msg: {
        kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_CANCEL,
        requestId: BigInt(1),
        code: 500,
        reason: 'Server error',
      },
    },
  ];

  beforeEach(() => {
    const dummyData = new Uint8Array([0x00]);

    /** @type {!ReadableStream<!Uint8Array>} */
    const readable = new ReadableStream({
      pull: (ctrl) => {
        ctrl.enqueue(dummyData);
        ctrl.close();
      },
    });

    reader = new shaka.msf.Reader(dummyData, readable, codec);

    writtenChunks = [];

    /** @type {!WritableStream<!Uint8Array>} */
    const writable = new WritableStream({
      write: /** @param {!Uint8Array} chunk */ (chunk) => {
        writtenChunks.push(chunk);
      },
    });

    writer = new shaka.msf.Writer(writable);

    controlStream = new shaka.msf.ControlStream(reader, writer, codec);
  });

  for (const {kind, msg} of messages) {
    it(`send() should write a ${kind} message`, async () => {
      if (!isReadableStreamSupported()) {
        pending('ReadableStream is not supported by the platform.');
      }
      if (!isWritableStreamSupported()) {
        pending('WritableStream is not supported by the platform.');
      }
      await controlStream.send(msg);
      expect(writtenChunks.length).toBe(1);
      expect(writtenChunks[0].length).toBeGreaterThan(0);
    });
  }
});

filterDescribe('shaka.msf.ControlStreamDecoder', isMSFSupported, () => {
  /** @type {!shaka.msf.QuicVarIntCodec} */
  const codec = new shaka.msf.QuicVarIntCodec();

  /**
   * Builds a decoder over a single fixed control message.
   *
   * @param {number} type
   * @param {!Array<number>} payload
   * @return {!shaka.msf.ControlStreamDecoder}
   */
  function decoderFor(type, payload) {
    const bytes = new Uint8Array([
      type,
      (payload.length >> 8) & 0xff,
      payload.length & 0xff,
      ...payload,
    ]);
    const readable = new ReadableStream({
      pull: (ctrl) => {
        ctrl.close();
      },
    });
    return new shaka.msf.ControlStreamDecoder(
        new shaka.msf.Reader(bytes, readable, codec), codec);
  }

  it('should decode FetchOk parameters as delta encoded', async () => {
    if (!isReadableStreamSupported()) {
      pending('ReadableStream is not supported by the platform.');
    }
    const decoder = decoderFor(shaka.msf.Utils.MessageTypeId.FETCH_OK, [
      0x01, // requestId
      0x00, // endOfTrack
      0x05, // endGroup
      0x06, // endObject
      0x02, // param count = 2
      0x02, 0x2a, // delta type 2 -> type 2 (even), value 42
      0x06, 0x07, // delta type 6 -> type 8 (even), value 7
    ]);

    const msg = /** @type {shaka.msf.Utils.FetchOk} */ (
      await decoder.message());
    expect(msg.kind).toBe(shaka.msf.Utils.MessageType.FETCH_OK);
    expect(msg.requestId).toBe(BigInt(1));
    expect(msg.endGroup).toBe(BigInt(5));
    expect(msg.endObject).toBe(BigInt(6));
    // Delta encoding means the second type is 2 + 6 = 8, not 6.
    expect(msg.params.length).toBe(2);
    expect(msg.params[0].type).toBe(BigInt(2));
    expect(msg.params[0].value).toBe(BigInt(42));
    expect(msg.params[1].type).toBe(BigInt(8));
    expect(msg.params[1].value).toBe(BigInt(7));
  });

  it('should skip FetchOk track extensions', async () => {
    if (!isReadableStreamSupported()) {
      pending('ReadableStream is not supported by the platform.');
    }
    const fetchOk = [
      shaka.msf.Utils.MessageTypeId.FETCH_OK, 0x00, 0x07,
      0x01, // requestId
      0x01, // endOfTrack
      0x05, // endGroup
      0x06, // endObject
      0x00, // param count
      0x02, 0x2a, // a track extension: type 2 (even), value 42
    ];
    const requestError = [
      shaka.msf.Utils.MessageTypeId.REQUEST_ERROR, 0x00, 0x05,
      0x03, // requestId
      0x05, // code
      0x00, // retryInterval
      0x01, 0x78, // reason 'x'
    ];
    const readable = new ReadableStream({
      pull: (ctrl) => {
        ctrl.close();
      },
    });
    const decoder = new shaka.msf.ControlStreamDecoder(
        new shaka.msf.Reader(
            new Uint8Array([...fetchOk, ...requestError]), readable, codec),
        codec);

    const ok = /** @type {shaka.msf.Utils.FetchOk} */ (
      await decoder.message());
    expect(ok.kind).toBe(shaka.msf.Utils.MessageType.FETCH_OK);
    expect(ok.endOfTrack).toBe(1);
    expect(ok.endGroup).toBe(BigInt(5));
    expect(ok.endObject).toBe(BigInt(6));

    // The extension bytes must not be read as the next message.
    const error = /** @type {shaka.msf.Utils.RequestError} */ (
      await decoder.message());
    expect(error.kind).toBe(shaka.msf.Utils.MessageType.REQUEST_ERROR);
    expect(error.requestId).toBe(BigInt(3));
  });

  it('should decode SubscribeNamespace parameters as delta encoded',
      async () => {
        if (!isReadableStreamSupported()) {
          pending('ReadableStream is not supported by the platform.');
        }
        const decoder = decoderFor(
            shaka.msf.Utils.MessageTypeId.SUBSCRIBE_NAMESPACE, [
              0x02, // requestId
              0x01, 0x02, 0x6e, 0x73, // namespace ['ns']
              0x01, // subscribe options: NAMESPACE
              0x02, // param count = 2
              0x04, 0x09, // delta type 4 -> type 4 (even), value 9
              0x06, 0x03, // delta type 6 -> type 10 (even), value 3
            ]);

        const msg = /** @type {shaka.msf.Utils.SubscribeNamespace} */ (
          await decoder.message());
        expect(msg.kind)
            .toBe(shaka.msf.Utils.MessageType.SUBSCRIBE_NAMESPACE);
        expect(msg.namespace).toEqual(['ns']);
        expect(msg.subscribeOptions).toBe(1);
        expect(msg.params.length).toBe(2);
        expect(msg.params[0].type).toBe(BigInt(4));
        expect(msg.params[0].value).toBe(BigInt(9));
        expect(msg.params[1].type).toBe(BigInt(10));
        expect(msg.params[1].value).toBe(BigInt(3));
      });

  it('should decode Publish parameters as delta encoded', async () => {
    if (!isReadableStreamSupported()) {
      pending('ReadableStream is not supported by the platform.');
    }
    const decoder = decoderFor(shaka.msf.Utils.MessageTypeId.PUBLISH, [
      0x01, // requestId
      0x01, 0x02, 0x6e, 0x73, // namespace ['ns']
      0x03, 0x61, 0x62, 0x63, // name 'abc'
      0x07, // trackAlias
      0x02, // param count = 2
      0x02, 0x2a, // delta type 2 -> type 2 (even), value 42
      0x06, 0x07, // delta type 6 -> type 8 (even), value 7
    ]);

    const msg = /** @type {shaka.msf.Utils.Publish} */ (
      await decoder.message());
    expect(msg.kind).toBe(shaka.msf.Utils.MessageType.PUBLISH);
    expect(msg.trackAlias).toBe(BigInt(7));
    expect(msg.params.length).toBe(2);
    expect(msg.params[0].type).toBe(BigInt(2));
    expect(msg.params[0].value).toBe(BigInt(42));
    expect(msg.params[1].type).toBe(BigInt(8));
    expect(msg.params[1].value).toBe(BigInt(7));
    // The defaults for everything that was omitted.
    expect(msg.forward).toBe(true);
    expect(msg.contentExists).toBe(false);
    expect(msg.largestLocation).toBeUndefined();
    expect(msg.groupOrder).toBe(shaka.msf.Utils.GroupOrder.ASCENDING);
  });

  it('should decode Publish fields from params and extensions', async () => {
    if (!isReadableStreamSupported()) {
      pending('ReadableStream is not supported by the platform.');
    }
    const decoder = decoderFor(shaka.msf.Utils.MessageTypeId.PUBLISH, [
      0x01, // requestId
      0x01, 0x02, 0x6e, 0x73, // namespace ['ns']
      0x03, 0x61, 0x62, 0x63, // name 'abc'
      0x07, // trackAlias
      0x02, // param count = 2
      0x09, 0x02, 0x0a, 0x14, // type 0x09 LARGEST_OBJECT, len 2, {10, 20}
      0x07, 0x00, // delta 7 -> type 0x10 FORWARD = 0
      // Track Extensions, to the end of the message:
      0x22, 0x02, // type 0x22 DEFAULT_PUBLISHER_GROUP_ORDER = DESCENDING
    ]);

    const msg = /** @type {shaka.msf.Utils.Publish} */ (
      await decoder.message());
    expect(msg.forward).toBe(false);
    expect(msg.contentExists).toBe(true);
    expect(msg.largestLocation)
        .toEqual({group: BigInt(10), object: BigInt(20)});
    expect(msg.groupOrder).toBe(shaka.msf.Utils.GroupOrder.DESCENDING);
  });

  it('should reject a Publish group order of 0', async () => {
    if (!isReadableStreamSupported()) {
      pending('ReadableStream is not supported by the platform.');
    }
    const decoder = decoderFor(shaka.msf.Utils.MessageTypeId.PUBLISH, [
      0x01, // requestId
      0x01, 0x02, 0x6e, 0x73, // namespace ['ns']
      0x03, 0x61, 0x62, 0x63, // name 'abc'
      0x07, // trackAlias
      0x00, // param count
      0x22, 0x00, // DEFAULT_PUBLISHER_GROUP_ORDER = 0
    ]);

    await expectAsync(decoder.message()).toBeRejected();
  });

  it('should decode Subscribe fields from params', async () => {
    if (!isReadableStreamSupported()) {
      pending('ReadableStream is not supported by the platform.');
    }
    const decoder = decoderFor(shaka.msf.Utils.MessageTypeId.SUBSCRIBE, [
      0x01, // requestId
      0x01, 0x02, 0x6e, 0x73, // namespace ['ns']
      0x03, 0x61, 0x62, 0x63, // name 'abc'
      0x04, // param count = 4
      0x10, 0x00, // type 0x10 FORWARD = 0
      0x10, 0x05, // delta 0x10 -> type 0x20 SUBSCRIBER_PRIORITY = 5
      // delta 1 -> type 0x21 SUBSCRIPTION_FILTER, len 3, AbsoluteStart {1, 2}
      0x01, 0x03, 0x03, 0x01, 0x02,
      0x01, 0x02, // delta 1 -> type 0x22 GROUP_ORDER = DESCENDING
    ]);

    const msg = /** @type {shaka.msf.Utils.Subscribe} */ (
      await decoder.message());
    expect(msg.kind).toBe(shaka.msf.Utils.MessageType.SUBSCRIBE);
    expect(msg.namespace).toEqual(['ns']);
    expect(msg.name).toBe('abc');
    expect(msg.forward).toBe(false);
    expect(msg.subscriberPriority).toBe(5);
    expect(msg.filterType).toBe(shaka.config.MsfFilterType.ABSOLUTE_START);
    expect(msg.startLocation).toEqual({group: BigInt(1), object: BigInt(2)});
    expect(msg.endGroup).toBeUndefined();
    expect(msg.groupOrder).toBe(shaka.msf.Utils.GroupOrder.DESCENDING);
  });

  it('should apply Subscribe defaults for omitted params', async () => {
    if (!isReadableStreamSupported()) {
      pending('ReadableStream is not supported by the platform.');
    }
    const decoder = decoderFor(shaka.msf.Utils.MessageTypeId.SUBSCRIBE, [
      0x01, // requestId
      0x01, 0x02, 0x6e, 0x73, // namespace ['ns']
      0x03, 0x61, 0x62, 0x63, // name 'abc'
      0x00, // param count
    ]);

    const msg = /** @type {shaka.msf.Utils.Subscribe} */ (
      await decoder.message());
    expect(msg.forward).toBe(true);
    expect(msg.subscriberPriority).toBe(128);
    expect(msg.filterType).toBe(shaka.config.MsfFilterType.NONE);
    expect(msg.groupOrder).toBe(shaka.msf.Utils.GroupOrder.PUBLISHER);
  });

  it('should reject a Subscribe filter type of 0', async () => {
    if (!isReadableStreamSupported()) {
      pending('ReadableStream is not supported by the platform.');
    }
    const decoder = decoderFor(shaka.msf.Utils.MessageTypeId.SUBSCRIBE, [
      0x01, // requestId
      0x01, 0x02, 0x6e, 0x73, // namespace ['ns']
      0x03, 0x61, 0x62, 0x63, // name 'abc'
      0x01, // param count
      0x21, 0x01, 0x00, // type 0x21 SUBSCRIPTION_FILTER, len 1, type 0
    ]);

    await expectAsync(decoder.message()).toBeRejected();
  });

  it('should decode a SubscribeUpdate from a REQUEST_UPDATE', async () => {
    if (!isReadableStreamSupported()) {
      pending('ReadableStream is not supported by the platform.');
    }
    const decoder = decoderFor(
        shaka.msf.Utils.MessageTypeId.SUBSCRIBE_UPDATE, [
          0x04, // requestId
          0x02, // existing requestId
          0x02, // param count = 2
          0x20, 0x07, // type 0x20 SUBSCRIBER_PRIORITY = 7
          // delta 1 -> type 0x21 FILTER, len 4, AbsoluteRange {10, 20} to 29
          0x01, 0x04, 0x04, 0x0a, 0x14, 0x1d,
        ]);

    const msg = /** @type {shaka.msf.Utils.SubscribeUpdate} */ (
      await decoder.message());
    expect(msg.kind).toBe(shaka.msf.Utils.MessageType.SUBSCRIBE_UPDATE);
    expect(msg.requestId).toBe(BigInt(4));
    expect(msg.subscriptionRequestId).toBe(BigInt(2));
    expect(msg.subscriberPriority).toBe(7);
    expect(msg.startLocation).toEqual({group: BigInt(10), object: BigInt(20)});
    // Draft-14's End Group: the last group plus 1.
    expect(msg.endGroup).toBe(BigInt(30));
    // Left out, so unchanged.
    expect(msg.forward).toBeUndefined();
  });

  it('should decode REQUEST_OK and REQUEST_ERROR', async () => {
    if (!isReadableStreamSupported()) {
      pending('ReadableStream is not supported by the platform.');
    }
    const requestOk = [
      shaka.msf.Utils.MessageTypeId.REQUEST_OK, 0x00, 0x04,
      0x02, // requestId
      0x01, // param count
      0x08, 0x05, // type 0x08 EXPIRES = 5
    ];
    const requestError = [
      shaka.msf.Utils.MessageTypeId.REQUEST_ERROR, 0x00, 0x05,
      0x04, // requestId
      0x10, // code
      0x03, // retryInterval
      0x01, 0x78, // reason 'x'
    ];
    const readable = new ReadableStream({
      pull: (ctrl) => {
        ctrl.close();
      },
    });
    const decoder = new shaka.msf.ControlStreamDecoder(
        new shaka.msf.Reader(
            new Uint8Array([...requestOk, ...requestError]), readable, codec),
        codec);

    const ok = /** @type {shaka.msf.Utils.RequestOk} */ (
      await decoder.message());
    expect(ok.kind).toBe(shaka.msf.Utils.MessageType.REQUEST_OK);
    expect(ok.requestId).toBe(BigInt(2));
    expect(ok.params).toEqual([{type: BigInt(8), value: BigInt(5)}]);

    const error = /** @type {shaka.msf.Utils.RequestError} */ (
      await decoder.message());
    expect(error.kind).toBe(shaka.msf.Utils.MessageType.REQUEST_ERROR);
    expect(error.requestId).toBe(BigInt(4));
    expect(error.code).toBe(BigInt(16));
    expect(error.retryInterval).toBe(BigInt(3));
    expect(error.reason).toBe('x');
  });

  it('should decode 0x8 and 0xE as NAMESPACE and NAMESPACE_DONE', async () => {
    if (!isReadableStreamSupported()) {
      pending('ReadableStream is not supported by the platform.');
    }
    const decoder = decoderFor(shaka.msf.Utils.MessageTypeId.NAMESPACE, [
      0x01, 0x02, 0x6e, 0x73, // namespace suffix ['ns']
    ]);
    const msg = /** @type {shaka.msf.Utils.Namespace} */ (
      await decoder.message());
    expect(msg.kind).toBe(shaka.msf.Utils.MessageType.NAMESPACE);
    expect(msg.namespace).toEqual(['ns']);

    const doneDecoder = decoderFor(
        shaka.msf.Utils.MessageTypeId.NAMESPACE_DONE, [
          0x01, 0x02, 0x6e, 0x73, // namespace suffix ['ns']
        ]);
    const done = /** @type {shaka.msf.Utils.Namespace} */ (
      await doneDecoder.message());
    expect(done.kind).toBe(shaka.msf.Utils.MessageType.NAMESPACE_DONE);
  });

  it('should decode PublishNamespaceDone and Cancel by Request ID',
      async () => {
        if (!isReadableStreamSupported()) {
          pending('ReadableStream is not supported by the platform.');
        }
        const done = /** @type {shaka.msf.Utils.PublishNamespaceDone} */ (
          await decoderFor(
              shaka.msf.Utils.MessageTypeId.PUBLISH_NAMESPACE_DONE, [
                0x06, // requestId
              ]).message());
        expect(done.requestId).toBe(BigInt(6));

        const cancel = /** @type {shaka.msf.Utils.PublishNamespaceCancel} */ (
          await decoderFor(
              shaka.msf.Utils.MessageTypeId.PUBLISH_NAMESPACE_CANCEL, [
                0x06, // requestId
                0x02, // code
                0x01, 0x78, // reason 'x'
              ]).message());
        expect(cancel.requestId).toBe(BigInt(6));
        expect(cancel.code).toBe(BigInt(2));
        expect(cancel.reason).toBe('x');
      });

  it('should reject types that draft-16 does not define', async () => {
    if (!isReadableStreamSupported()) {
      pending('ReadableStream is not supported by the platform.');
    }
    // FETCH_ERROR is draft-14 only; draft-16 sends REQUEST_ERROR.
    const decoder = decoderFor(shaka.msf.Utils.MessageTypeId.FETCH_ERROR, [
      0x01, 0x02, 0x00, 0x00,
    ]);
    await expectAsync(decoder.message()).toBeRejected();
  });

  it('should decode PublishDone', async () => {
    if (!isReadableStreamSupported()) {
      pending('ReadableStream is not supported by the platform.');
    }
    const msg = /** @type {shaka.msf.Utils.PublishDone} */ (
      await decoderFor(shaka.msf.Utils.MessageTypeId.PUBLISH_DONE, [
        0x02, // requestId
        0x02, // status code TRACK_ENDED
        0x05, // stream count
        0x01, 0x78, // reason 'x'
      ]).message());
    expect(msg.requestId).toBe(BigInt(2));
    expect(msg.code).toBe(BigInt(2));
    expect(msg.streamCount).toBe(5);
    expect(msg.reason).toBe('x');
  });

  it('should decode SubscribeOk and skip its track extensions', async () => {
    if (!isReadableStreamSupported()) {
      pending('ReadableStream is not supported by the platform.');
    }
    const subscribeOk = [
      shaka.msf.Utils.MessageTypeId.SUBSCRIBE_OK, 0x00, 0x0c,
      0x01, // requestId
      0x07, // trackAlias
      0x02, // param count = 2
      0x08, 0x40, 0x64, // type 0x08 EXPIRES = 100
      0x01, 0x02, 0x0a, 0x14, // delta 1 -> type 0x09 LARGEST_OBJECT {10, 20}
      // Track Extensions, to the end of the message:
      0x22, 0x02, // type 0x22 DEFAULT_PUBLISHER_GROUP_ORDER = DESCENDING
    ];
    const unsubscribe = [
      shaka.msf.Utils.MessageTypeId.UNSUBSCRIBE, 0x00, 0x01,
      0x03, // requestId
    ];
    const readable = new ReadableStream({
      pull: (ctrl) => {
        ctrl.close();
      },
    });
    const decoder = new shaka.msf.ControlStreamDecoder(
        new shaka.msf.Reader(
            new Uint8Array([...subscribeOk, ...unsubscribe]), readable, codec),
        codec);

    const ok = /** @type {shaka.msf.Utils.SubscribeOk} */ (
      await decoder.message());
    expect(ok.kind).toBe(shaka.msf.Utils.MessageType.SUBSCRIBE_OK);
    expect(ok.trackAlias).toBe(BigInt(7));
    expect(ok.expires).toBe(BigInt(100));
    expect(ok.contentExists).toBe(true);
    expect(ok.largest).toEqual({group: BigInt(10), object: BigInt(20)});
    expect(ok.groupOrder).toBe(shaka.msf.Utils.GroupOrder.DESCENDING);

    const next = /** @type {shaka.msf.Utils.Unsubscribe} */ (
      await decoder.message());
    expect(next.kind).toBe(shaka.msf.Utils.MessageType.UNSUBSCRIBE);
    expect(next.requestId).toBe(BigInt(3));
  });

  it('should decode PublishOk fields from params', async () => {
    if (!isReadableStreamSupported()) {
      pending('ReadableStream is not supported by the platform.');
    }
    const decoder = decoderFor(shaka.msf.Utils.MessageTypeId.PUBLISH_OK, [
      0x01, // requestId
      0x04, // param count = 4
      0x10, 0x00, // type 0x10 FORWARD = 0
      0x10, 0x05, // delta 0x10 -> type 0x20 SUBSCRIBER_PRIORITY = 5
      // delta 1 -> type 0x21 SUBSCRIPTION_FILTER, len 4, AbsoluteRange
      // from {1, 2} to group 3
      0x01, 0x04, 0x04, 0x01, 0x02, 0x03,
      0x01, 0x02, // delta 1 -> type 0x22 GROUP_ORDER = DESCENDING
    ]);

    const msg = /** @type {shaka.msf.Utils.PublishOk} */ (
      await decoder.message());
    expect(msg.kind).toBe(shaka.msf.Utils.MessageType.PUBLISH_OK);
    expect(msg.forward).toBe(false);
    expect(msg.subscriberPriority).toBe(5);
    expect(msg.filterType).toBe(shaka.msf.Utils.FilterType.ABSOLUTE_RANGE);
    expect(msg.startLocation).toEqual({group: BigInt(1), object: BigInt(2)});
    expect(msg.endGroup).toBe(BigInt(3));
    expect(msg.groupOrder).toBe(shaka.msf.Utils.GroupOrder.DESCENDING);
  });

  it('should apply PublishOk defaults for omitted params', async () => {
    if (!isReadableStreamSupported()) {
      pending('ReadableStream is not supported by the platform.');
    }
    const decoder = decoderFor(shaka.msf.Utils.MessageTypeId.PUBLISH_OK, [
      0x01, // requestId
      0x00, // param count
    ]);

    const msg = /** @type {shaka.msf.Utils.PublishOk} */ (
      await decoder.message());
    expect(msg.forward).toBe(true);
    expect(msg.subscriberPriority).toBe(128);
    expect(msg.filterType).toBe(shaka.msf.Utils.FilterType.NONE);
    expect(msg.groupOrder).toBe(shaka.msf.Utils.GroupOrder.PUBLISHER);
  });
});

describe('shaka.msf.ControlStreamEncoder', () => {
  /** @type {!shaka.msf.ControlStreamEncoder} */
  let encoder;

  /** @type {!shaka.msf.QuicVarIntCodec} */
  const codec = new shaka.msf.QuicVarIntCodec();

  /** @type {!Array<!Uint8Array>} */
  let writtenChunks;

  /** @type {!shaka.msf.Writer} */
  let writer;

  const messages = [
    {
      kind: shaka.msf.Utils.MessageType.GOAWAY,
      msg: {
        kind: shaka.msf.Utils.MessageType.GOAWAY,
        newSessionUri: 'https://new.session',
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.MAX_REQUEST_ID,
      msg: {
        kind: shaka.msf.Utils.MessageType.MAX_REQUEST_ID,
        requestId: 123,
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.REQUESTS_BLOCKED,
      msg: {
        kind: shaka.msf.Utils.MessageType.REQUESTS_BLOCKED,
        maximumRequestId: 456,
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE,
      msg: {
        kind: shaka.msf.Utils.MessageType.SUBSCRIBE,
        requestId: 1,
        namespace: ['ns'],
        name: 'track',
        subscriberPriority: 0,
        groupOrder: shaka.msf.Utils.GroupOrder.PUBLISHER,
        forward: true,
        filterType: shaka.config.MsfFilterType.NONE,
        params: [],
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE_OK,
      msg: {
        kind: shaka.msf.Utils.MessageType.SUBSCRIBE_OK,
        requestId: 1,
        trackAlias: 2,
        expires: BigInt(12345),
        groupOrder: shaka.msf.Utils.GroupOrder.ASCENDING,
        contentExists: false,
        params: [],
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE_ERROR,
      msg: {
        kind: shaka.msf.Utils.MessageType.SUBSCRIBE_ERROR,
        requestId: 1,
        code: 404,
        reason: 'Not found',
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE_UPDATE,
      msg: {
        kind: shaka.msf.Utils.MessageType.SUBSCRIBE_UPDATE,
        requestId: 1,
        subscriptionRequestId: 2,
        startLocation: {
          group: 1,
          object: 2,
        },
        endGroup: 10,
        subscriberPriority: 0,
        forward: true,
        params: [],
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.UNSUBSCRIBE,
      msg: {
        kind: shaka.msf.Utils.MessageType.UNSUBSCRIBE,
        requestId: 1,
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.PUBLISH_DONE,
      msg: {
        kind: shaka.msf.Utils.MessageType.PUBLISH_DONE,
        requestId: 1,
        code: 0,
        streamCount: 5,
        reason: 'Done',
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.PUBLISH,
      msg: {
        kind: shaka.msf.Utils.MessageType.PUBLISH,
        requestId: 1,
        namespace: ['ns'],
        name: 'track',
        trackAlias: 1,
        groupOrder: shaka.msf.Utils.GroupOrder.PUBLISHER,
        contentExists: true,
        largestLocation: {
          group: 1,
          object: 2,
        },
        forward: true,
        params: [],
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.PUBLISH_OK,
      msg: {
        kind: shaka.msf.Utils.MessageType.PUBLISH_OK,
        requestId: 1,
        forward: true,
        subscriberPriority: 0,
        groupOrder: shaka.msf.Utils.GroupOrder.PUBLISHER,
        filterType: shaka.msf.Utils.FilterType.NONE,
        params: [],
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.PUBLISH_ERROR,
      msg: {
        kind: shaka.msf.Utils.MessageType.PUBLISH_ERROR,
        requestId: 1,
        code: 500,
        reason: 'Server error',
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE,
      msg: {
        kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE,
        requestId: 1,
        namespace: ['ns'],
        params: [],
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_OK,
      msg: {
        kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_OK,
        requestId: 1,
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_ERROR,
      msg: {
        kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_ERROR,
        requestId: 1,
        code: 500,
        reason: 'Server error',
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_DONE,
      msg: {
        kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_DONE,
        requestId: BigInt(1),
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_CANCEL,
      msg: {
        kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_CANCEL,
        requestId: BigInt(1),
        code: 500,
        reason: 'Server error',
      },
    },
  ];

  beforeEach(() => {
    writtenChunks = [];

    /** @type {!WritableStream<!Uint8Array>} */
    const writable = new WritableStream({
      write: /** @param {!Uint8Array} chunk */ (chunk) => {
        writtenChunks.push(chunk);
      },
    });

    writer = new shaka.msf.Writer(writable);

    encoder = new shaka.msf.ControlStreamEncoder(writer, codec);
  });

  for (const {kind, msg} of messages) {
    it(`message() should encode a ${kind} message`, async () => {
      if (!isWritableStreamSupported()) {
        pending('WritableStream is not supported by the platform.');
      }
      await encoder.message(msg);
      expect(writtenChunks.length).toBe(1);
      expect(writtenChunks[0].length).toBeGreaterThan(0);
    });
  }

  // Draft-16 runs these on a SUBSCRIBE_NAMESPACE stream of their own.
  for (const msg of [
    {
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE_NAMESPACE,
      requestId: BigInt(1),
      namespace: ['ns'],
      params: [],
    },
    {
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE_NAMESPACE_OK,
      requestId: BigInt(1),
    },
    {
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE_NAMESPACE_ERROR,
      requestId: BigInt(1),
      code: BigInt(500),
      reason: 'Server error',
    },
    {
      kind: shaka.msf.Utils.MessageType.UNSUBSCRIBE_NAMESPACE,
      namespace: ['ns'],
    },
  ]) {
    it(`message() should refuse ${msg.kind} on the control stream`,
        async () => {
          if (!isWritableStreamSupported()) {
            pending('WritableStream is not supported by the platform.');
          }
          await expectAsync(encoder.message(msg)).toBeRejected();
          expect(writtenChunks.length).toBe(0);
        });
  }
});
