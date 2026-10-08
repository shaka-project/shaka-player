filterDescribe('shaka.msf.Reader', isMSFSupported, () => {
  /** @type {!shaka.msf.Reader} */
  let reader;

  /** @type {!shaka.msf.draft18.Codec} */
  let codec;

  beforeEach(() => {
    codec = new shaka.msf.draft18.Codec();
  });

  // Helper: create a readable stream from Uint8Array chunks
  const createTestStream = (chunks) => {
    let index = 0;
    return new ReadableStream({
      pull: (controller) => {
        if (index < chunks.length) {
          controller.enqueue(chunks[index++]);
        } else {
          controller.close();
        }
      },
    });
  };

  it('should initialize with empty buffer', () => {
    if (!isReadableStreamSupported()) {
      pending('ReadableStream is not supported by the platform.');
    }
    const buffer = new Uint8Array([]);
    const stream = createTestStream([]);
    reader = new shaka.msf.Reader(buffer, stream, codec);
    expect(reader.getByteLength()).toBe(0);
    expect(reader.getBuffer().length).toBe(0);
  });

  it('should read bytes correctly', async () => {
    if (!isReadableStreamSupported()) {
      pending('ReadableStream is not supported by the platform.');
    }
    const stream = createTestStream([new Uint8Array([1, 2, 3, 4, 5])]);
    reader = new shaka.msf.Reader(new Uint8Array([]), stream, codec);

    const bytes = await reader.read(3);
    expect(bytes).toEqual(new Uint8Array([1, 2, 3]));

    const remaining = await reader.readAll();
    expect(remaining).toEqual(new Uint8Array([4, 5]));
  });

  it('should read u8 and u8Bool correctly', async () => {
    if (!isReadableStreamSupported()) {
      pending('ReadableStream is not supported by the platform.');
    }
    const stream = createTestStream([new Uint8Array([0x01, 0x00])]);
    reader = new shaka.msf.Reader(new Uint8Array([]), stream, codec);

    expect(await reader.u8()).toBe(1);
    expect(await reader.u8Bool()).toBe(false);
  });

  it('should read string correctly', async () => {
    if (!isReadableStreamSupported()) {
      pending('ReadableStream is not supported by the platform.');
    }
    const stream = createTestStream([new Uint8Array([0x02, 72, 105])]);
    reader = new shaka.msf.Reader(new Uint8Array([]), stream, codec);

    const str = await reader.string(10);
    expect(str).toBe('Hi');
  });

  it('should throw if string exceeds maxLength', async () => {
    if (!isReadableStreamSupported()) {
      pending('ReadableStream is not supported by the platform.');
    }
    const stream = createTestStream([new Uint8Array([0x02, 65, 66])]);
    reader = new shaka.msf.Reader(new Uint8Array([]), stream, codec);

    // Use expectAsync instead of try/catch/fail
    await expectAsync(reader.string(1)).toBeRejectedWith(
        jasmine.objectContaining({
          message: 'string length 2 exceeds max length 1',
        }));
  });

  it('should read tuple correctly', async () => {
    if (!isReadableStreamSupported()) {
      pending('ReadableStream is not supported by the platform.');
    }
    const stream = createTestStream([
      new Uint8Array([0x02, 0x01, 65, 0x01, 66]),
    ]);
    reader = new shaka.msf.Reader(new Uint8Array([]), stream, codec);

    const tuple = await reader.tuple();
    expect(tuple).toEqual(['A', 'B']);
  });

  it('done() should reflect buffer and stream state', async () => {
    if (!isReadableStreamSupported()) {
      pending('ReadableStream is not supported by the platform.');
    }
    const stream = createTestStream([new Uint8Array([1, 2])]);
    reader = new shaka.msf.Reader(new Uint8Array([]), stream, codec);

    expect(await reader.done()).toBe(false);
    await reader.readAll();
    expect(await reader.done()).toBe(true);
  });

  it('release() and close() should not throw', async () => {
    if (!isReadableStreamSupported()) {
      pending('ReadableStream is not supported by the platform.');
    }
    const stream = createTestStream([new Uint8Array([1])]);
    reader = new shaka.msf.Reader(new Uint8Array([]), stream, codec);

    expect(() => reader.release()).not.toThrow();

    await expectAsync(reader.close()).toBeResolved();
  });

  it('should read deltaKeyValuePairs correctly', async () => {
    if (!isReadableStreamSupported()) {
      pending('ReadableStream is not supported by the platform.');
    }
    // count 2; delta 2 -> type 2 (even) value 3; delta 1 -> type 3 (odd)
    // length 1, byte 'A'.
    const bytes = new Uint8Array([0x02, 0x02, 0x03, 0x01, 0x01, 65]);
    reader = new shaka.msf.Reader(
        new Uint8Array([]), createTestStream([bytes]), codec);

    const pairs = await reader.deltaKeyValuePairs();
    expect(pairs.length).toBe(2);
    expect(pairs[0]).toEqual({type: BigInt(2), value: BigInt(3)});
    expect(pairs[1].type).toBe(BigInt(3));
    expect(shaka.util.StringUtils.fromUTF8(
        /** @type {!ArrayBufferView} */ (pairs[1].value),
    )).toBe('A');
  });
});

filterDescribe('shaka.msf.Writer', isMSFSupported, () => {
  /** @type {!shaka.msf.Writer} */
  let writer;

  /** @type {!Array<!Uint8Array>} */
  let writtenChunks;

  // Helper: writable stream storing chunks in array
  const createTestWritable = () => {
    writtenChunks = [];
    return new WritableStream({
      write: (chunk) => {
        writtenChunks.push(/** @type {!Uint8Array} */ (chunk));
      },
    });
  };

  beforeEach(() => {
    const writable = createTestWritable();
    writer = new shaka.msf.Writer(writable);
  });

  it('should write a single Uint8Array chunk', async () => {
    if (!isWritableStreamSupported()) {
      pending('WritableStream is not supported by the platform.');
    }
    const data = new Uint8Array([10, 20]);
    await writer.write(data);
    expect(writtenChunks.length).toBe(1);
    expect(writtenChunks[0]).toEqual(data);
  });

  it('should write multiple chunks sequentially', async () => {
    if (!isWritableStreamSupported()) {
      pending('WritableStream is not supported by the platform.');
    }
    const data1 = new Uint8Array([1]);
    const data2 = new Uint8Array([2]);
    await writer.write(data1);
    await writer.write(data2);
    expect(writtenChunks).toEqual([data1, data2]);
  });
});
