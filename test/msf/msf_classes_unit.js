describe('shaka.msf.Reader', () => {
  /** @type {!shaka.msf.Reader} */
  let reader;

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
    const buffer = new Uint8Array([]);
    const stream = createTestStream([]);
    reader = new shaka.msf.Reader(buffer, stream);
    expect(reader.getByteLength()).toBe(0);
    expect(reader.getBuffer().length).toBe(0);
  });

  it('should read bytes correctly', async () => {
    const stream = createTestStream([new Uint8Array([1, 2, 3, 4, 5])]);
    reader = new shaka.msf.Reader(new Uint8Array([]), stream);

    const bytes = await reader.read(3);
    expect(bytes).toEqual(new Uint8Array([1, 2, 3]));

    const remaining = await reader.readAll();
    expect(remaining).toEqual(new Uint8Array([4, 5]));
  });

  it('should read u8 and u8Bool correctly', async () => {
    const stream = createTestStream([new Uint8Array([0x01, 0x00])]);
    reader = new shaka.msf.Reader(new Uint8Array([]), stream);

    expect(await reader.u8()).toBe(1);
    expect(await reader.u8Bool()).toBe(false);
  });

  it('should read string correctly', async () => {
    const stream = createTestStream([new Uint8Array([0x02, 72, 105])]);
    reader = new shaka.msf.Reader(new Uint8Array([]), stream);

    const str = await reader.string(10);
    expect(str).toBe('Hi');
  });

  it('should throw if string exceeds maxLength', async () => {
    const stream = createTestStream([new Uint8Array([0x02, 65, 66])]);
    reader = new shaka.msf.Reader(new Uint8Array([]), stream);

    // Use expectAsync instead of try/catch/fail
    await expectAsync(reader.string(1)).toBeRejectedWith(
        jasmine.objectContaining({
          message: 'string length 2 exceeds max length 1',
        }));
  });

  it('should read tuple correctly', async () => {
    const stream = createTestStream([
      new Uint8Array([0x02, 0x01, 65, 0x01, 66]),
    ]);
    reader = new shaka.msf.Reader(new Uint8Array([]), stream);

    const tuple = await reader.tuple();
    expect(tuple).toEqual(['A', 'B']);
  });

  it('done() should reflect buffer and stream state', async () => {
    const stream = createTestStream([new Uint8Array([1, 2])]);
    reader = new shaka.msf.Reader(new Uint8Array([]), stream);

    expect(await reader.done()).toBe(false);
    await reader.readAll();
    expect(await reader.done()).toBe(true);
  });

  it('release() and close() should not throw', async () => {
    const stream = createTestStream([new Uint8Array([1])]);
    reader = new shaka.msf.Reader(new Uint8Array([]), stream);

    expect(() => reader.release()).not.toThrow();

    await expectAsync(reader.close()).toBeResolved();
  });

  it('should read keyValuePairs correctly', async () => {
    const bytes = new Uint8Array([0x02, 0x02, 0x03, 0x01, 0x01, 65]);
    reader = new shaka.msf.Reader(
        new Uint8Array([]), createTestStream([bytes]));

    const pairs = await reader.keyValuePairs();
    expect(pairs.length).toBe(2);
    expect(pairs[0]).toEqual({type: 2, value: 3});
    expect(pairs[1].type).toBe(1);
    expect(shaka.util.StringUtils.fromUTF8(
        /** @type {!ArrayBufferView} */ (pairs[1].value),
    )).toBe('A');
  });
});

describe('shaka.msf.Writer', () => {
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
    const data = new Uint8Array([10, 20]);
    await writer.write(data);
    expect(writtenChunks.length).toBe(1);
    expect(writtenChunks[0]).toEqual(data);
  });

  it('should write multiple chunks sequentially', async () => {
    const data1 = new Uint8Array([1]);
    const data2 = new Uint8Array([2]);
    await writer.write(data1);
    await writer.write(data2);
    expect(writtenChunks).toEqual([data1, data2]);
  });
});
