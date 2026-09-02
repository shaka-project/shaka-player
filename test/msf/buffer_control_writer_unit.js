filterDescribe('shaka.msf.BufferControlWriter', isMSFSupported, () => {
  /** @type {!shaka.msf.BufferControlWriter} */
  let writer;

  function readUint8(bytes, pos) {
    return bytes[pos];
  }

  function readUint16BE(bytes, pos) {
    return (bytes[pos] << 8) | bytes[pos + 1];
  }

  /**
   * Asserts the full serialization of the message currently in the writer:
   * the type byte, the 16-bit length field, and the exact payload bytes.
   *
   * Checking the payload byte-for-byte is what makes these tests able to
   * catch a wire-format regression; asserting only that something was
   * written cannot.
   *
   * @param {number} expectedType
   * @param {!Array<number>} expectedPayload
   */
  function expectMessage(expectedType, expectedPayload) {
    const bytes = writer.getBytes();
    expect(readUint8(bytes, 0)).toBe(expectedType);
    expect(readUint16BE(bytes, 1)).toBe(expectedPayload.length);
    expect(Array.from(bytes.subarray(3))).toEqual(expectedPayload);
  }

  beforeEach(() => {
    writer = new shaka.msf.BufferControlWriter(new shaka.msf.QuicVarIntCodec());
  });

  // eslint-disable-next-line @stylistic/max-len
  it('should initialize with a buffer and getBytes() should return Uint8Array', () => {
    const bytes = writer.getBytes();
    expect(bytes).toEqual(jasmine.any(Uint8Array));
  });

  it('should reset the buffer', () => {
    const msg = {
      kind: shaka.msf.Utils.MessageType.UNSUBSCRIBE,
      requestId: BigInt(123),
    };
    writer.marshalUnsubscribe(msg);
    const beforeReset = writer.getBytes().length;
    expect(beforeReset).toBeGreaterThan(0);

    writer.reset();
    const afterReset = writer.getBytes().length;
    expect(afterReset).toBe(0);
  });

  describe('marshalSubscribe', () => {
    it('should encode priority, forward, filter and order as params', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.SUBSCRIBE,
        requestId: BigInt(1),
        namespace: ['ns1', 'ns2'],
        name: 'track1',
        subscriberPriority: 1,
        groupOrder: shaka.msf.Utils.GroupOrder.ASCENDING,
        forward: true,
        filterType: shaka.config.MsfFilterType.NONE,
        params: [],
      };
      writer.marshalSubscribe(msg);

      // Draft-16 moves subscriberPriority, forward, the subscription filter
      // and groupOrder out of fixed fields and into delta-encoded params.
      expectMessage(shaka.msf.Utils.MessageTypeId.SUBSCRIBE, [
        0x01, // requestId
        0x02, 0x03, 0x6e, 0x73, 0x31, 0x03, 0x6e, 0x73, 0x32, // ['ns1','ns2']
        0x06, 0x74, 0x72, 0x61, 0x63, 0x6b, 0x31, // 'track1'
        0x04, // param count
        0x10, 0x01, // type 0x10 FORWARD = 1
        0x10, 0x01, // delta 0x10 -> type 0x20 SUBSCRIBER_PRIORITY = 1
        0x01, 0x01, 0x00, // delta 1 -> type 0x21 FILTER, len 1, NONE
        0x01, 0x01, // delta 1 -> type 0x22 GROUP_ORDER = ASCENDING
      ]);
    });

    it('should throw if startLocation is missing for absolute filter', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.SUBSCRIBE,
        requestId: BigInt(1),
        namespace: [],
        name: 'track1',
        subscriberPriority: 1,
        groupOrder: shaka.msf.Utils.GroupOrder.ASCENDING,
        forward: true,
        filterType: shaka.config.MsfFilterType.ABSOLUTE_START,
        params: [],
      };
      expect(() => writer.marshalSubscribe(msg)).toThrow();
    });
  });

  describe('marshalSubscribeOk', () => {
    it('should marshal a SubscribeOk message with content', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.SUBSCRIBE_OK,
        requestId: BigInt(1),
        trackAlias: BigInt(2),
        expires: BigInt(100),
        groupOrder: shaka.msf.Utils.GroupOrder.ASCENDING,
        contentExists: true,
        largest: {group: BigInt(1), object: BigInt(2)},
        params: [],
      };
      writer.marshalSubscribeOk(msg);
      expect(writer.getBytes().length).toBeGreaterThan(0);
    });

    it('should throw if largest is missing when contentExists is true', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.SUBSCRIBE_OK,
        requestId: BigInt(1),
        trackAlias: BigInt(2),
        expires: BigInt(100),
        groupOrder: shaka.msf.Utils.GroupOrder.ASCENDING,
        contentExists: true,
        largest: undefined,
        params: [],
      };
      expect(() => writer.marshalSubscribeOk(msg)).toThrow();
    });
  });

  describe('marshalSubscribeError', () => {
    it('should marshal a SubscribeError message', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.SUBSCRIBE_ERROR,
        requestId: BigInt(1),
        code: BigInt(4),
        retryInterval: BigInt(7),
        reason: 'no',
      };
      writer.marshalSubscribeError(msg);

      expectMessage(shaka.msf.Utils.MessageTypeId.SUBSCRIBE_ERROR, [
        0x01, // requestId
        0x04, // code
        0x07, // retryInterval
        0x02, 0x6e, 0x6f, // 'no'
      ]);
    });

    it('should default a missing retryInterval to zero', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.SUBSCRIBE_ERROR,
        requestId: BigInt(1),
        code: BigInt(4),
        reason: 'no',
      };
      writer.marshalSubscribeError(msg);

      expectMessage(shaka.msf.Utils.MessageTypeId.SUBSCRIBE_ERROR, [
        0x01, 0x04,
        0x00, // retryInterval defaulted
        0x02, 0x6e, 0x6f,
      ]);
    });
  });

  describe('marshalPublishDone', () => {
    it('should marshal a PublishDone message', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.PUBLISH_DONE,
        requestId: BigInt(1),
        code: BigInt(0),
        reason: 'Done',
        streamCount: 3,
      };
      writer.marshalPublishDone(msg);
      expect(writer.getBytes().length).toBeGreaterThan(0);
    });
  });

  describe('marshalFetch', () => {
    it('should marshal a Fetch message', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.FETCH,
        requestId: BigInt(1),
        subscriberPriority: 1,
        groupOrder: shaka.msf.Utils.GroupOrder.ASCENDING,
        fetchType: shaka.msf.Utils.FetchType.STANDALONE,
        namespace: ['ns1', 'ns2'],
        trackName: 'trackName',
        startGroup: BigInt(10),
        startObject: BigInt(10),
        endGroup: BigInt(10),
        endObject: BigInt(10),
        params: [],
      };
      writer.marshalFetch(msg);
      expect(writer.getBytes().length).toBeGreaterThan(0);
    });
  });

  describe('marshalFetchOk', () => {
    it('should marshal a FetchOk message', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.FETCH_OK,
        requestId: BigInt(1),
        groupOrder: shaka.msf.Utils.GroupOrder.ASCENDING,
        endOfTrack: 1,
        endGroup: BigInt(10),
        endObject: BigInt(10),
        params: [],
      };
      writer.marshalFetchOk(msg);
      expect(writer.getBytes().length).toBeGreaterThan(0);
    });
  });

  describe('marshalFetchError', () => {
    it('should marshal a FetchError message', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.FETCH_ERROR,
        requestId: BigInt(1),
        code: BigInt(500),
        reason: 'Error occurred',
      };
      writer.marshalFetchError(msg);
      expect(writer.getBytes().length).toBeGreaterThan(0);
    });
  });

  describe('marshalFetchCancel', () => {
    it('should marshal a FetchCancel message', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.FETCH_CANCEL,
        requestId: BigInt(1),
      };
      writer.marshalFetchCancel(msg);
      expect(writer.getBytes().length).toBeGreaterThan(0);
    });
  });

  describe('marshalPublishNamespace', () => {
    it('should marshal an PublishNamespace message', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE,
        requestId: BigInt(1),
        namespace: ['ns'],
        params: [],
      };
      writer.marshalPublishNamespace(msg);
      expect(writer.getBytes().length).toBeGreaterThan(0);
    });
  });

  describe('marshalPublishNamespaceOk', () => {
    it('should marshal an PublishNamespaceOk with a parameter list', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_OK,
        requestId: BigInt(1),
        namespace: ['ns'],
      };
      writer.marshalPublishNamespaceOk(msg);

      // Draft-16 REQUEST_OK carries a (here empty) parameter list.
      expectMessage(shaka.msf.Utils.MessageTypeId.PUBLISH_NAMESPACE_OK, [
        0x01, // requestId
        0x00, // param count = 0
      ]);
    });
  });

  describe('marshalUnsubscribe', () => {
    it('should marshal an Unsubscribe message', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.UNSUBSCRIBE,
        requestId: BigInt(1),
      };
      writer.marshalUnsubscribe(msg);
      expect(writer.getBytes().length).toBeGreaterThan(0);
    });
  });

  describe('marshalPublishNamespaceError', () => {
    it('should marshal an PublishNamespaceError message', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_ERROR,
        requestId: BigInt(1),
        code: BigInt(500),
        reason: 'Server error'}
        ;
      writer.marshalPublishNamespaceError(msg);
      expect(writer.getBytes().length).toBeGreaterThan(0);
    });
  });

  describe('marshalPublishNamespaceDone', () => {
    it('should marshal an PublishNamespaceDone message', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_DONE,
        namespace: ['ns'],
      };
      writer.marshalPublishNamespaceDone(msg);
      expect(writer.getBytes().length).toBeGreaterThan(0);
    });
  });

  describe('marshalClientSetup', () => {
    it('should marshal a ClientSetup with no in-band version', () => {
      writer.marshalClientSetup({params: []});

      // The version is negotiated via the WebTransport subprotocol, so the
      // payload is nothing but the parameter list.
      expectMessage(shaka.msf.Utils.MessageTypeId.CLIENT_SETUP, [
        0x00, // param count = 0
      ]);
    });

    it('should marshal ClientSetup parameters', () => {
      writer.marshalClientSetup({
        params: [{type: BigInt(2), value: BigInt(42)}],
      });

      expectMessage(shaka.msf.Utils.MessageTypeId.CLIENT_SETUP, [
        0x01, // param count
        0x02, 0x2a, // delta type 2 -> type 2 (even), value 42
      ]);
    });
  });

  describe('marshalServerSetup', () => {
    it('should marshal a ServerSetup with no in-band version', () => {
      writer.marshalServerSetup({params: []});

      expectMessage(shaka.msf.Utils.MessageTypeId.SERVER_SETUP, [
        0x00, // param count = 0
      ]);
    });
  });

  it('marshalSubscribe writes correct message type and length', () => {
    const msg = {
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE,
      requestId: BigInt(1),
      trackAlias: BigInt(2),
      namespace: ['ns1', 'ns2'],
      name: 'trackName',
      subscriberPriority: 1,
      groupOrder: shaka.msf.Utils.GroupOrder.ASCENDING,
      forward: true,
      filterType: shaka.config.MsfFilterType.NONE,
      params: [],
    };

    writer.marshalSubscribe(msg);
    const bytes = writer.getBytes();

    expect(readUint8(bytes, 0)).toBe(shaka.msf.Utils.MessageTypeId.SUBSCRIBE);

    const length = readUint16BE(bytes, 1);
    expect(length).toBe(bytes.length - 3);
  });

  // eslint-disable-next-line @stylistic/max-len
  it('marshalSubscribeOk writes correct message type and largest location', () => {
    const msg = {
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE_OK,
      requestId: BigInt(5),
      trackAlias: BigInt(2),
      expires: BigInt(1234),
      groupOrder: shaka.msf.Utils.GroupOrder.DESCENDING,
      contentExists: true,
      largest: {group: BigInt(10), object: BigInt(20)},
      params: [],
    };

    writer.marshalSubscribeOk(msg);
    const bytes = writer.getBytes();

    expect(readUint8(bytes, 0))
        .toBe(shaka.msf.Utils.MessageTypeId.SUBSCRIBE_OK);

    const length = readUint16BE(bytes, 1);
    expect(length).toBe(bytes.length - 3);

    const groupOrderFound =
        Array.from(bytes).includes(shaka.msf.Utils.GroupOrder.DESCENDING);
    expect(groupOrderFound).toBe(true);

    const contentExistsFound = Array.from(bytes).includes(1);
    expect(contentExistsFound).toBe(true);
  });

  it('marshalUnsubscribe writes correct message type and requestId', () => {
    const msg = {
      kind: shaka.msf.Utils.MessageType.UNSUBSCRIBE,
      requestId: BigInt(42),
    };

    writer.marshalUnsubscribe(msg);
    const bytes = writer.getBytes();

    expect(readUint8(bytes, 0)).toBe(shaka.msf.Utils.MessageTypeId.UNSUBSCRIBE);

    const length = readUint16BE(bytes, 1);
    expect(length).toBe(bytes.length - 3);

    expect(bytes.length).toBeGreaterThan(3);
  });

  describe('marshalSubscribeUpdate', () => {
    it('should marshal a valid SubscribeUpdate message', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.SUBSCRIBE_UPDATE,
        requestId: BigInt(1),
        startLocation: {group: BigInt(10), object: BigInt(20)},
        endGroup: BigInt(30),
        subscriberPriority: 2,
        forward: true,
        params: [],
      };
      writer.marshalSubscribeUpdate(msg);
      const bytes = writer.getBytes();
      expect(bytes.length).toBeGreaterThan(0);
    });
  });

  describe('marshalPublish', () => {
    it('should marshal a Publish with contentExists true', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.PUBLISH,
        requestId: BigInt(1),
        namespace: ['ns1'],
        name: 'track1',
        trackAlias: BigInt(2),
        groupOrder: shaka.msf.Utils.GroupOrder.ASCENDING,
        contentExists: true,
        largestLocation: {group: BigInt(10), object: BigInt(20)},
        forward: true,
        params: [],
      };
      writer.marshalPublish(msg);
      const bytes = writer.getBytes();
      expect(bytes.length).toBeGreaterThan(0);
    });

    it('should marshal a Publish with contentExists false', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.PUBLISH,
        requestId: BigInt(1),
        namespace: ['ns1'],
        name: 'track1',
        trackAlias: BigInt(2),
        groupOrder: shaka.msf.Utils.GroupOrder.ASCENDING,
        contentExists: false,
        largestLocation: undefined,
        forward: false,
        params: [],
      };
      writer.marshalPublish(msg);
      const bytes = writer.getBytes();
      expect(bytes.length).toBeGreaterThan(0);
    });
  });

  describe('marshalPublishOk', () => {
    it('should marshal with ABSOLUTE_START filter', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.PUBLISH_OK,
        requestId: BigInt(1),
        subscriberPriority: 1,
        groupOrder: shaka.msf.Utils.GroupOrder.ASCENDING,
        forward: true,
        filterType: shaka.msf.Utils.FilterType.ABSOLUTE_START,
        startLocation: {group: BigInt(5), object: BigInt(6)},
        params: [],
      };
      writer.marshalPublishOk(msg);
      const bytes = writer.getBytes();
      expect(bytes.length).toBeGreaterThan(0);
    });

    it('should marshal with ABSOLUTE_RANGE filter', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.PUBLISH_OK,
        requestId: BigInt(1),
        subscriberPriority: 1,
        groupOrder: shaka.msf.Utils.GroupOrder.ASCENDING,
        forward: true,
        filterType: shaka.msf.Utils.FilterType.ABSOLUTE_RANGE,
        startLocation: {group: BigInt(5), object: BigInt(6)},
        endGroup: BigInt(10),
        params: [],
      };
      writer.marshalPublishOk(msg);
      const bytes = writer.getBytes();
      expect(bytes.length).toBeGreaterThan(0);
    });

    it('should throw if startLocation is missing for ABSOLUTE_START', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.PUBLISH_OK,
        requestId: BigInt(1),
        subscriberPriority: 1,
        groupOrder: shaka.msf.Utils.GroupOrder.ASCENDING,
        forward: true,
        filterType: shaka.msf.Utils.FilterType.ABSOLUTE_START,
        startLocation: undefined,
        params: [],
      };
      expect(() => writer.marshalPublishOk(msg)).toThrow();
    });

    it('should throw if endGroup is missing for ABSOLUTE_RANGE', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.PUBLISH_OK,
        requestId: BigInt(1),
        subscriberPriority: 1,
        groupOrder: shaka.msf.Utils.GroupOrder.ASCENDING,
        forward: true,
        filterType: shaka.msf.Utils.FilterType.ABSOLUTE_RANGE,
        startLocation: {group: BigInt(5), object: BigInt(6)},
        endGroup: undefined,
        params: [],
      };
      expect(() => writer.marshalPublishOk(msg)).toThrow();
    });
  });

  describe('marshalPublishError', () => {
    it('should marshal a PublishError message', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.PUBLISH_ERROR,
        requestId: BigInt(1),
        code: BigInt(500),
        reason: 'Error occurred',
      };
      writer.marshalPublishError(msg);
      const bytes = writer.getBytes();
      expect(bytes.length).toBeGreaterThan(0);
    });
  });

  describe('delta-encoded KeyValuePairs', () => {
    /**
     * Marshals a PublishNamespace, whose payload is requestId, namespace and
     * then nothing but the parameter list, and returns the serialized
     * parameter list: the pair count followed by the delta-encoded pairs.
     *
     * @param {!Array<shaka.msf.Utils.KeyValuePair>} params
     * @return {!Array<number>}
     */
    function paramBytes(params) {
      writer.marshalPublishNamespace({
        kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE,
        requestId: BigInt(1),
        namespace: [],
        params,
      });
      // 3 header bytes + requestId + the empty namespace tuple's count.
      return Array.from(writer.getBytes().subarray(5));
    }

    it('should encode an even key as a var int value', () => {
      // 123 exceeds the 1-byte var int range (0-63), so it takes 2 bytes.
      expect(paramBytes([{type: BigInt(2), value: BigInt(123)}]))
          .toEqual([0x01, 0x02, 0x40, 0x7b]);
    });

    it('should encode an odd key as a length-prefixed byte string', () => {
      expect(paramBytes([{type: BigInt(3), value: new Uint8Array([1, 2, 3])}]))
          .toEqual([0x01, 0x03, 0x03, 0x01, 0x02, 0x03]);
    });

    it('should encode types as deltas from the previous type', () => {
      // Types 2 and 8 serialize as deltas 2 and 6.
      expect(paramBytes([
        {type: BigInt(2), value: BigInt(1)},
        {type: BigInt(8), value: BigInt(2)},
      ])).toEqual([0x02, 0x02, 0x01, 0x06, 0x02]);
    });

    it('should sort by ascending type before delta encoding', () => {
      // Same pairs supplied out of order must produce the same bytes.
      expect(paramBytes([
        {type: BigInt(8), value: BigInt(2)},
        {type: BigInt(2), value: BigInt(1)},
      ])).toEqual([0x02, 0x02, 0x01, 0x06, 0x02]);
    });

    it('should write a zero count for an empty params array', () => {
      expect(paramBytes([])).toEqual([0x00]);
    });

    it('should reject an even key whose value is not a bigint', () => {
      expect(() => paramBytes([{type: BigInt(2), value: new Uint8Array([1])}]))
          .toThrow();
    });

    it('should reject an odd key whose value is not bytes', () => {
      expect(() => paramBytes([{type: BigInt(3), value: BigInt(1)}]))
          .toThrow();
    });
  });

  describe('marshalPublishNamespaceCancel', () => {
    it('should marshal a PublishNamespaceCancel message', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_CANCEL,
        namespace: ['ns1'],
        code: BigInt(404),
        reason: 'Cancelled',
      };
      writer.marshalPublishNamespaceCancel(msg);
      expect(writer.getBytes().length).toBeGreaterThan(0);
    });
  });

  describe('marshalSubscribeNamespace variants', () => {
    it('should marshal SubscribeNamespace', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.SUBSCRIBE_NAMESPACE,
        requestId: BigInt(1),
        namespace: ['ns1'],
        params: [],
      };
      writer.marshalSubscribeNamespace(msg);
      expect(writer.getBytes().length).toBeGreaterThan(0);
    });

    it('should marshal SubscribeNamespaceOk', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.SUBSCRIBE_NAMESPACE_OK,
        requestId: BigInt(1),
      };
      writer.marshalSubscribeNamespaceOk(msg);
      expect(writer.getBytes().length).toBeGreaterThan(0);
    });

    it('should marshal SubscribeNamespaceError', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.SUBSCRIBE_NAMESPACE_ERROR,
        requestId: BigInt(1),
        code: BigInt(500),
        reason: 'Error',
      };
      writer.marshalSubscribeNamespaceError(msg);
      expect(writer.getBytes().length).toBeGreaterThan(0);
    });

    it('should marshal UnsubscribeNamespace', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.UNSUBSCRIBE_NAMESPACE,
        namespace: ['ns1'],
      };
      writer.marshalUnsubscribeNamespace(msg);
      expect(writer.getBytes().length).toBeGreaterThan(0);
    });
  });

  describe('Other messages', () => {
    it('should marshal Goaway', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.GOAWAY,
        newSessionUri: 'session://new',
      };
      writer.marshalGoaway(msg);
      expect(writer.getBytes().length).toBeGreaterThan(0);
    });

    it('should marshal MaxRequestId', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.MAX_REQUEST_ID,
        requestId: BigInt(42),
      };
      writer.marshalMaxRequestId(msg);
      expect(writer.getBytes().length).toBeGreaterThan(0);
    });

    it('should marshal RequestsBlocked', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.REQUESTS_BLOCKED,
        maximumRequestId: BigInt(99),
      };
      writer.marshalRequestsBlocked(msg);
      expect(writer.getBytes().length).toBeGreaterThan(0);
    });
  });

  describe('caller-supplied params', () => {
    it('should not mutate the message when marshaling Subscribe', () => {
      const params = [];
      const msg = {
        kind: shaka.msf.Utils.MessageType.SUBSCRIBE,
        requestId: BigInt(1),
        namespace: [],
        name: '',
        subscriberPriority: 1,
        groupOrder: shaka.msf.Utils.GroupOrder.ASCENDING,
        forward: true,
        filterType: shaka.config.MsfFilterType.NONE,
        params,
      };

      writer.marshalSubscribe(msg);
      const first = Array.from(writer.getBytes());

      // The synthesized forward/priority/filter/order params must not be
      // appended to the caller's array, or marshaling again would emit them
      // twice.
      expect(params.length).toBe(0);

      writer.reset();
      writer.marshalSubscribe(msg);
      expect(Array.from(writer.getBytes())).toEqual(first);
    });

    it('should not mutate the message when marshaling SubscribeUpdate', () => {
      const params = [];
      const msg = {
        kind: shaka.msf.Utils.MessageType.SUBSCRIBE_UPDATE,
        requestId: BigInt(1),
        startLocation: {group: BigInt(1), object: BigInt(2)},
        endGroup: BigInt(5),
        subscriberPriority: 1,
        forward: false,
        params,
      };

      writer.marshalSubscribeUpdate(msg);
      const first = Array.from(writer.getBytes());

      expect(params.length).toBe(0);

      writer.reset();
      writer.marshalSubscribeUpdate(msg);
      expect(Array.from(writer.getBytes())).toEqual(first);
    });
  });

  describe('subscription filter encoding', () => {
    /**
     * @param {shaka.config.MsfFilterType} filterType
     * @param {(shaka.msf.Utils.Location|undefined)} startLocation
     * @param {(bigint|undefined)} endGroup
     * @return {!Array<number>}
     */
    function filterBytes(filterType, startLocation, endGroup) {
      writer.marshalSubscribe({
        kind: shaka.msf.Utils.MessageType.SUBSCRIBE,
        requestId: BigInt(1),
        namespace: [],
        name: '',
        subscriberPriority: 1,
        groupOrder: shaka.msf.Utils.GroupOrder.ASCENDING,
        forward: true,
        filterType,
        startLocation,
        endGroup,
        params: [],
      });
      // The filter is the odd-typed param 0x21, written third of four pairs.
      // Payload: requestId, empty tuple, empty name, count, then the pairs
      // 0x10/0x01, 0x10/0x01, then delta 0x01, length, filter bytes.
      const bytes = writer.getBytes();
      const filterLength = bytes[3 + 4 + 4 + 1];
      const start = 3 + 4 + 4 + 2;
      return Array.from(bytes.subarray(start, start + filterLength));
    }

    it('should encode an End Group for ABSOLUTE_RANGE', () => {
      expect(filterBytes(
          shaka.config.MsfFilterType.ABSOLUTE_RANGE,
          {group: BigInt(1), object: BigInt(2)},
          BigInt(9)))
          .toEqual([0x04, 0x01, 0x02, 0x09]);
    });

    it('should not encode an End Group for ABSOLUTE_START', () => {
      // AbsoluteStart is open ended: the filter is type plus start only.
      expect(filterBytes(
          shaka.config.MsfFilterType.ABSOLUTE_START,
          {group: BigInt(1), object: BigInt(2)},
          undefined))
          .toEqual([0x03, 0x01, 0x02]);
    });

    it('should encode neither start nor end for LARGEST_OBJECT', () => {
      expect(filterBytes(
          shaka.config.MsfFilterType.LARGEST_OBJECT, undefined, undefined))
          .toEqual([0x02]);
    });

    it('should throw if endGroup is missing', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.SUBSCRIBE,
        requestId: BigInt(1),
        namespace: ['ns1'],
        name: 'track',
        subscriberPriority: 1,
        groupOrder: shaka.msf.Utils.GroupOrder.ASCENDING,
        forward: true,
        filterType: shaka.config.MsfFilterType.ABSOLUTE_RANGE,
        startLocation: {group: BigInt(1), object: BigInt(2)},
        endGroup: undefined,
        params: [],
      };
      expect(() => writer.marshalSubscribe(msg)).toThrow();
    });
  });

  describe('marshalSubscribeOk with contentExists false', () => {
    it('should marshal without largest', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.SUBSCRIBE_OK,
        requestId: BigInt(1),
        trackAlias: BigInt(2),
        expires: BigInt(100),
        groupOrder: shaka.msf.Utils.GroupOrder.ASCENDING,
        contentExists: false,
        largest: undefined,
        params: [],
      };
      writer.marshalSubscribeOk(msg);
      expect(writer.getBytes().length).toBeGreaterThan(0);
    });
  });

  describe('Buffer integrity', () => {
    it('marshalWithLength computes correct length', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.UNSUBSCRIBE,
        requestId: BigInt(123),
      };
      writer.marshalUnsubscribe(msg);
      const bytes = writer.getBytes();
      const lengthField = readUint16BE(bytes, 1);
      expect(lengthField).toBe(bytes.length - 3);
    });

    it('marshal_ returns the writer for chaining', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.UNSUBSCRIBE,
        requestId: BigInt(1),
      };
      const result = writer.marshalUnsubscribe(msg);
      expect(result).toBe(writer);
    });
  });
});
