describe('shaka.msf.ControlStream', () => {
  /** @type {!shaka.msf.ControlStream} */
  let controlStream;

  /** @type {!shaka.msf.Reader} */
  let reader;

  /** @type {!shaka.msf.Writer} */
  let writer;

  /** @type {!Array<!Uint8Array>} */
  let writtenChunks;

  const messages = [
    {
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE,
      msg: {
        kind: shaka.msf.Utils.MessageType.SUBSCRIBE,
        requestId: 1,
        trackAlias: 1,
        namespace: ['ns'],
        name: 'track',
        subscriberPriority: 0,
        groupOrder: shaka.msf.Utils.GroupOrder.PUBLISHER,
        forward: true,
        filterType: shaka.msf.Utils.FilterType.NONE,
        params: [],
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE_OK,
      msg: {
        kind: shaka.msf.Utils.MessageType.SUBSCRIBE_OK,
        requestId: 1,
        expires: 12345,
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
        trackAlias: 1,
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE_DONE,
      msg: {
        kind: shaka.msf.Utils.MessageType.SUBSCRIBE_DONE,
        requestId: 1,
        code: 0,
        streamCount: 5,
        reason: 'Done',
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
      kind: shaka.msf.Utils.MessageType.ANNOUNCE,
      msg: {
        kind: shaka.msf.Utils.MessageType.ANNOUNCE,
        requestId: 1,
        namespace: ['ns'],
        params: [],
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.ANNOUNCE_OK,
      msg: {
        kind: shaka.msf.Utils.MessageType.ANNOUNCE_OK,
        requestId: 1,
        namespace: ['ns'],
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.ANNOUNCE_ERROR,
      msg: {
        kind: shaka.msf.Utils.MessageType.ANNOUNCE_ERROR,
        requestId: 1,
        code: 500,
        reason: 'Server error',
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.UNANNOUNCE,
      msg: {
        kind: shaka.msf.Utils.MessageType.UNANNOUNCE,
        namespace: ['ns'],
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

    reader = new shaka.msf.Reader(dummyData, readable);

    writtenChunks = [];

    /** @type {!WritableStream<!Uint8Array>} */
    const writable = new WritableStream({
      write: /** @param {!Uint8Array} chunk */ (chunk) => {
        writtenChunks.push(chunk);
      },
    });

    writer = new shaka.msf.Writer(writable);

    controlStream = new shaka.msf.ControlStream(reader, writer);
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

describe('shaka.msf.ControlStreamEncoder', () => {
  /** @type {!shaka.msf.ControlStreamEncoder} */
  let encoder;

  /** @type {!Array<!Uint8Array>} */
  let writtenChunks;

  /** @type {!shaka.msf.Writer} */
  let writer;

  const messages = [
    {
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE,
      msg: {
        kind: shaka.msf.Utils.MessageType.SUBSCRIBE,
        requestId: 1,
        trackAlias: 1,
        namespace: ['ns'],
        name: 'track',
        subscriberPriority: 0,
        groupOrder: shaka.msf.Utils.GroupOrder.PUBLISHER,
        forward: true,
        filterType: shaka.msf.Utils.FilterType.NONE,
        params: [],
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE_OK,
      msg: {
        kind: shaka.msf.Utils.MessageType.SUBSCRIBE_OK,
        requestId: 1,
        expires: 12345,
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
        trackAlias: 1,
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.SUBSCRIBE_DONE,
      msg: {
        kind: shaka.msf.Utils.MessageType.SUBSCRIBE_DONE,
        requestId: 1,
        code: 0,
        streamCount: 5,
        reason: 'Done',
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
      kind: shaka.msf.Utils.MessageType.ANNOUNCE,
      msg: {
        kind: shaka.msf.Utils.MessageType.ANNOUNCE,
        requestId: 1,
        namespace: ['ns'],
        params: [],
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.ANNOUNCE_OK,
      msg: {
        kind: shaka.msf.Utils.MessageType.ANNOUNCE_OK,
        requestId: 1,
        namespace: ['ns'],
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.ANNOUNCE_ERROR,
      msg: {
        kind: shaka.msf.Utils.MessageType.ANNOUNCE_ERROR,
        requestId: 1,
        code: 500,
        reason: 'Server error',
      },
    },
    {
      kind: shaka.msf.Utils.MessageType.UNANNOUNCE,
      msg: {
        kind: shaka.msf.Utils.MessageType.UNANNOUNCE,
        namespace: ['ns'],
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

    encoder = new shaka.msf.ControlStreamEncoder(writer);
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
});
