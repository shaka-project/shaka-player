describe('DataViewWriter', () => {
  /** @type {!shaka.util.DataViewWriter} */
  let writer;

  beforeEach(() => {
    writer = new shaka.util.DataViewWriter(
        16, shaka.util.DataViewWriter.Endianness.BIG_ENDIAN);
  });

  it('writes and retrieves uint8', () => {
    writer.writeUint8(0x12);
    writer.writeUint8(0xff);
    const bytes = writer.getBytes();
    expect(bytes).toEqual(new Uint8Array([0x12, 0xff]));
    expect(writer.getPosition()).toBe(2);
  });

  it('writes and retrieves uint16', () => {
    writer.writeUint16(0x1234);
    const bytes = writer.getBytes();
    expect(bytes).toEqual(new Uint8Array([0x12, 0x34]));
    expect(writer.getPosition()).toBe(2);
  });

  it('writes and retrieves uint32', () => {
    writer.writeUint32(0x12345678);
    const bytes = writer.getBytes();
    expect(bytes).toEqual(new Uint8Array([0x12, 0x34, 0x56, 0x78]));
    expect(writer.getPosition()).toBe(4);
  });

  it('writes and retrieves uint64', () => {
    const value = 0x123456789abcd;
    writer.writeUint64(value);
    const bytes = writer.getBytes();
    expect(bytes.length).toBe(8);
    expect(writer.getPosition()).toBe(8);
  });

  it('grows buffer automatically when writing beyond initial size', () => {
    writer = new shaka.util.DataViewWriter(
        2, shaka.util.DataViewWriter.Endianness.BIG_ENDIAN);
    writer.writeUint32(0x11223344); // 4 bytes > initial 2
    const bytes = writer.getBytes();
    expect(bytes.length).toBe(4);
  });

  it('writes and retrieves bytes', () => {
    const data = new Uint8Array([1, 2, 3]);
    writer.writeBytes(data);
    expect(writer.getBytes()).toEqual(data);
    expect(writer.getPosition()).toBe(3);
  });

  it('writes and retrieves string with uint32 length prefix', () => {
    writer.writeString('abc');
    const bytes = writer.getBytes();
    // Length prefix is 3 -> 0x00 0x00 0x00 0x03
    expect(bytes.slice(0, 4)).toEqual(new Uint8Array([0, 0, 0, 3]));
    expect(bytes.slice(4)).toEqual(new Uint8Array([97, 98, 99])); // 'abc'
  });

  it('writes and retrieves varInt53 values', () => {
    writer.writeVarInt53(0x3f); // 1-byte
    writer.writeVarInt53(0x1234); // 2-byte
    writer.writeVarInt53(0x12345678); // 4-byte
    writer.writeVarInt53(Number.MAX_SAFE_INTEGER); // 8-byte
    expect(writer.getPosition()).toBeGreaterThan(0);
  });

  describe('varInt62', () => {
    it('writes small values with varInt62 using varInt53 path', () => {
      writer.writeVarInt62(0x1234);
      const bytes = writer.getBytes();
      expect(bytes.length).toBe(2);
    });

    it('throws on negative values', () => {
      expect(() => writer.writeVarInt62(-1)).toThrow();
    });

    it('writes varInt53 values via varInt62 path for numbers <= 53-bit', () => {
      const val = Number.MAX_SAFE_INTEGER;
      writer.writeVarInt62(val);
      const bytes = writer.getBytes();
      expect(bytes.length).toBe(8);
    });
  });

  it('resets position correctly', () => {
    writer.writeUint8(1);
    writer.reset();
    expect(writer.getPosition()).toBe(0);
    expect(writer.getLength()).toBe(0);
  });

  it('seeks and skips correctly', () => {
    writer.writeUint8(1);
    writer.skip(2);
    expect(writer.getPosition()).toBe(3);
    writer.seek(1);
    expect(writer.getPosition()).toBe(1);
  });

  it('reserves and patches uint16', () => {
    const pos = writer.reserveUint16();
    writer.writeUint8(0x12);
    writer.patchUint16(pos, 0x3456);
    const bytes = writer.getBytes();
    expect(bytes.slice(0, 2)).toEqual(new Uint8Array([0x34, 0x56]));
    expect(bytes[2]).toBe(0x12);
  });
});
