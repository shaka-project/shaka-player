describe('shaka.msf.BufferControlWriter', () => {
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
      requestId: 123,
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
        requestId: 1,
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
        requestId: 1,
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
        requestId: 1,
        trackAlias: 2,
        expires: 100,
        groupOrder: shaka.msf.Utils.GroupOrder.ASCENDING,
        contentExists: true,
        largest: {group: 1, object: 2},
        params: [],
      };
      writer.marshalSubscribeOk(msg);
      expect(writer.getBytes().length).toBeGreaterThan(0);
    });

    it('should throw if largest is missing when contentExists is true', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.SUBSCRIBE_OK,
        requestId: 1,
        trackAlias: 2,
        expires: 100,
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
        requestId: 1,
        code: 404,
        reason: 'Not found',
        trackAlias: 5,
      };
      writer.marshalSubscribeError(msg);
      expect(writer.getBytes().length).toBeGreaterThan(0);
    });
  });

  describe('marshalPublishDone', () => {
    it('should marshal a PublishDone message', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.PUBLISH_DONE,
        requestId: 1,
        code: 0,
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
        requestId: 1,
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
        requestId: 1,
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
        requestId: 1,
      };
      writer.marshalUnsubscribe(msg);
      expect(writer.getBytes().length).toBeGreaterThan(0);
    });
  });

  describe('marshalPublishNamespaceError', () => {
    it('should marshal an PublishNamespaceError message', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.PUBLISH_NAMESPACE_ERROR,
        requestId: 1,
        code: 500,
        reason: 'Server error'}
        ;
      writer.marshalPublishNamespaceError(msg);
      expect(writer.getBytes().length).toBeGreaterThan(0);
    });
  });

  describe('marshalUnpublishNamespace', () => {
    it('should marshal an UnpublishNamespace message', () => {
      const msg = {
        kind: shaka.msf.Utils.MessageType.UNPUBLISH_NAMESPACE,
        namespace: ['ns'],
      };
      writer.marshalUnpublishNamespace(msg);
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
      requestId: 1,
      trackAlias: 2,
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
      requestId: 5,
      trackAlias: 2,
      expires: 1234,
      groupOrder: shaka.msf.Utils.GroupOrder.DESCENDING,
      contentExists: true,
      largest: {group: 10, object: 20},
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
      requestId: 42,
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
});
