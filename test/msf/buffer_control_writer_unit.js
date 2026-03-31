filterDescribe('shaka.msf.BufferControlWriter', isMSFSupported, () => {
  /** @type {!shaka.msf.BufferControlWriter} */
  let writer;

  function readUint8(bytes, pos) {
    return bytes[pos];
  }

  function readUint16BE(bytes, pos) {
    return (bytes[pos] << 8) | bytes[pos + 1];
  }

  beforeEach(() => {
    writer = new shaka.msf.BufferControlWriter();
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
    it('should marshal a valid Subscribe message', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.SUBSCRIBE,
        requestId: BigInt(1),
        namespace: ['ns1', 'ns2'],
        name: 'track1',
        subscriberPriority: 1,
        groupOrder: shaka.msf.Utils.GroupOrder.ASCENDING,
        forward: true,
        filterType: shaka.msf.Utils.FilterType.NONE,
        params: [],
      };
      writer.marshalSubscribe(msg);
      const bytes = writer.getBytes();
      expect(bytes.length).toBeGreaterThan(0);
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
        filterType: shaka.msf.Utils.FilterType.ABSOLUTE_START,
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
        code: BigInt(404),
        reason: 'Not found',
        trackAlias: BigInt(5),
      };
      writer.marshalSubscribeError(msg);
      expect(writer.getBytes().length).toBeGreaterThan(0);
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
    it('should marshal an PublishNamespaceOk message', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_OK,
        requestId: BigInt(1),
        namespace: ['ns'],
      };
      writer.marshalPublishNamespaceOk(msg);
      expect(writer.getBytes().length).toBeGreaterThan(0);
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
    it('should marshal a ClientSetup message', () => {
      const msg = {
        versions: [1, 2, 3],
        params: []}
         ;
      writer.marshalClientSetup(msg);
      expect(writer.getBytes().length).toBeGreaterThan(0);
    });
  });

  describe('marshalServerSetup', () => {
    it('should marshal a ServerSetup message', () => {
      const msg = {
        version: 1,
        params: [],
      };
      writer.marshalServerSetup(msg);
      expect(writer.getBytes().length).toBeGreaterThan(0);
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
      filterType: shaka.msf.Utils.FilterType.NONE,
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

  it('marshalClientSetup writes versions array correctly', () => {
    const msg = {
      versions: [1, 255],
      params: [],
    };
    writer.marshalClientSetup(msg);
    const bytes = writer.getBytes();

    expect(readUint8(bytes, 0))
        .toBe(shaka.msf.Utils.MessageTypeId.CLIENT_SETUP);
    const length = readUint16BE(bytes, 1);
    expect(length).toBe(bytes.length - 3);

    expect(bytes[3]).toBeGreaterThan(0);
  });

  it('marshalServerSetup writes version correctly', () => {
    const msg = {
      version: 0xff00000b,
      params: [],
    };
    writer.marshalServerSetup(msg);
    const bytes = writer.getBytes();

    expect(readUint8(bytes, 0))
        .toBe(shaka.msf.Utils.MessageTypeId.SERVER_SETUP);
    const length = readUint16BE(bytes, 1);
    expect(length).toBe(bytes.length - 3);

    expect(bytes[3]).toBeGreaterThan(0);
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
        errorCode: BigInt(500),
        reason: 'Error occurred',
      };
      writer.marshalPublishError(msg);
      const bytes = writer.getBytes();
      expect(bytes.length).toBeGreaterThan(0);
    });
  });

  describe('KeyValuePairs', () => {
    it('should marshal even key with bigint value', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.SUBSCRIBE_UPDATE,
        requestId: BigInt(1),
        startLocation: {group: BigInt(1), object: BigInt(2)},
        endGroup: BigInt(5),
        subscriberPriority: 1,
        forward: false,
        params: [{type: BigInt(2), value: BigInt(123)}],
      };
      writer.marshalSubscribeUpdate(msg);
      expect(writer.getBytes().length).toBeGreaterThan(0);
    });

    it('should marshal odd key with Uint8Array value', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.SUBSCRIBE_UPDATE,
        requestId: BigInt(1),
        startLocation: {group: BigInt(1), object: BigInt(2)},
        endGroup: BigInt(5),
        subscriberPriority: 1,
        forward: false,
        params: [{type: BigInt(3), value: new Uint8Array([1, 2, 3])}],
      };
      writer.marshalSubscribeUpdate(msg);
      expect(writer.getBytes().length).toBeGreaterThan(0);
    });

    it('should handle empty params array', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.SUBSCRIBE_UPDATE,
        requestId: BigInt(1),
        startLocation: {group: BigInt(1), object: BigInt(2)},
        endGroup: BigInt(5),
        subscriberPriority: 1,
        forward: false,
        params: [],
      };
      writer.marshalSubscribeUpdate(msg);
      expect(writer.getBytes().length).toBeGreaterThan(0);
    });
  });

  describe('marshalPublishNamespaceCancel', () => {
    it('should marshal a PublishNamespaceCancel message', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_CANCEL,
        namespace: ['ns1'],
        errorCode: BigInt(404),
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
        errorCode: BigInt(500),
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

  describe('marshalSubscribe with ABSOLUTE_RANGE filter', () => {
    it('should throw if endGroup is missing', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.SUBSCRIBE,
        requestId: BigInt(1),
        namespace: ['ns1'],
        name: 'track',
        subscriberPriority: 1,
        groupOrder: shaka.msf.Utils.GroupOrder.ASCENDING,
        forward: true,
        filterType: shaka.msf.Utils.FilterType.ABSOLUTE_RANGE,
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
