/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


// cspell:ignore xyzz smpb

describe('IlstUtils', () => {
  const IlstUtils = shaka.metadata.IlstUtils;
  const BufferUtils = shaka.util.BufferUtils;

  // ---------------------------------------------------------------------------
  // Binary-construction helpers
  // ---------------------------------------------------------------------------

  /**
   * @param {number} n
   * @return {!Array<number>}
   */
  function uint32BE(n) {
    return [
      (n >>> 24) & 0xff,
      (n >>> 16) & 0xff,
      (n >>> 8) & 0xff,
      (n >>> 0) & 0xff,
    ];
  }

  /**
   * Encode an ASCII string as a byte array.
   * Works for ILST four-char codes that contain Latin-1 characters (e.g. ©).
   *
   * @param {string} str
   * @return {!Array<number>}
   */
  function ascii(str) {
    return Array.from(str).map((c) => c.charCodeAt(0));
  }

  /**
   * Build a basic MP4 box: size(4) + fourCC(4) + payload.
   *
   * @param {string} type  Four-character box identifier.
   * @param {!Array<number>} payload
   * @return {!Array<number>}
   */
  function basicBox(type, payload) {
    const size = 8 + payload.length;
    return [...uint32BE(size), ...ascii(type), ...payload];
  }

  /**
   * Build a fullBox: basicBox with version(1) + flags(3) prepended to payload.
   *
   * @param {string} type
   * @param {number} version
   * @param {number} flags  24-bit value.
   * @param {!Array<number>} payload
   * @return {!Array<number>}
   */
  function fullBox(type, version, flags, payload) {
    return basicBox(type, [
      version & 0xff,
      (flags >>> 16) & 0xff,
      (flags >>> 8) & 0xff,
      flags & 0xff,
      ...payload,
    ]);
  }

  /**
   * Build an ILST `data` sub-box.
   *
   * Layout: fullBox('data', 0, flags, [0,0,0,0 reserved, ...value])
   *
   * iTunes type flags:
   *   1  = UTF-8 text
   *   13 = JPEG image
   *   14 = PNG image
   *   21 = big-endian signed integer
   *
   * @param {number} flags
   * @param {!Array<number>} value
   * @return {!Array<number>}
   */
  function dataBox(flags, value) {
    return fullBox('data', 0, flags, [0, 0, 0, 0, ...value]);
  }

  /**
   * Build a complete ILST child box (e.g. ©nam):
   *   basicBox(type, dataBox(flags, value))
   *
   * @param {string} type  Four-character ILST key.
   * @param {number} flags
   * @param {!Array<number>} value
   * @return {!Array<number>}
   */
  function ilstChild(type, flags, value) {
    return basicBox(type, dataBox(flags, value));
  }

  /**
   * Build a freeform `----` ILST child box containing mean / name / data.
   *
   * @param {string} mean   Reverse-domain namespace (e.g. 'com.apple.iTunes').
   * @param {string} name   Tag name (e.g. 'iTunSMPB').
   * @param {number} flags
   * @param {!Array<number>} value
   * @return {!Array<number>}
   */
  function freeformChild(mean, name, flags, value) {
    const meanBox = fullBox('mean', 0, 0, ascii(mean));
    const nameBox = fullBox('name', 0, 0, ascii(name));
    const dataBytes = dataBox(flags, value);
    return basicBox('----', [...meanBox, ...nameBox, ...dataBytes]);
  }

  /**
   * Wrap ILST children in the moov > udta > meta(full) > ilst structure
   * expected by new IlstUtils().parse().
   *
   * Each argument is an Array<number> representing one child box.
   *
   * @param {...!Array<number>} children
   * @return {!Uint8Array}
   */
  function buildMp4(...children) {
    const ilstContent = children.reduce((acc, ch) => {
      return acc.concat(ch);
    }, []);
    const ilst = basicBox('ilst', ilstContent);
    const meta = fullBox('meta', 0, 0, ilst);
    const udta = basicBox('udta', meta);
    const moov = basicBox('moov', udta);
    return new Uint8Array(moov);
  }

  // ---------------------------------------------------------------------------
  // Basic dispatch
  // ---------------------------------------------------------------------------

  it('empty data returns empty array', () => {
    expect(new IlstUtils().parse(new Uint8Array([]))).toEqual([]);
  });

  it('empty ilst box returns empty array', () => {
    const data = buildMp4(/* no children */);
    expect(new IlstUtils().parse(data)).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // UTF-8 text atoms (flags = 1)
  // ---------------------------------------------------------------------------

  it('parses a UTF-8 text atom and maps its key to the ID3 equivalent', () => {
    const data = buildMp4(ilstChild('©nam', 1, ascii('Shaka')));

    expect(new IlstUtils().parse(data)).toEqual([{
      key: 'TIT2',
      data: 'Shaka',
      description: '',
      mimeType: null,
      pictureType: null,
    }]);
  });

  it('strips embedded null characters from UTF-8 values', () => {
    const data = buildMp4(ilstChild('©nam', 1, [...ascii('Shaka'), 0, 0]));
    const frames = new IlstUtils().parse(data);
    expect(frames[0].data).toBe('Shaka');
  });

  it('maps all standard ILST keys to their ID3 equivalents', () => {
    const mapping = [
      ['©nam', 'TIT2'],
      ['©ART', 'TPE1'],
      ['aART', 'TPE2'],
      ['©alb', 'TALB'],
      ['©gen', 'TCON'],
      ['©day', 'TDRC'],
      ['©wrt', 'TEXT'],
      ['©cmt', 'COMM'],
      ['covr', 'APIC'],
      ['cprt', 'TCOP'],
      ['©too', 'TENC'],
      ['tmpo', 'TBPM'],
      ['cpil', 'TCMP'],
    ];

    for (const [ilstKey, id3Key] of mapping) {
      const data = buildMp4(ilstChild(ilstKey, 1, ascii('test')));
      const frames = new IlstUtils().parse(data);
      expect(frames[0].key)
          .withContext(`${ilstKey} → ${id3Key}`)
          .toBe(id3Key);
    }
  });

  it('passes through unrecognised ILST keys unchanged', () => {
    const data = buildMp4(ilstChild('xyzz', 1, ascii('value')));
    const frames = new IlstUtils().parse(data);
    expect(frames[0].key).toBe('xyzz');
  });

  it('treats atoms with unknown type flags as UTF-8 text', () => {
    // flags = 99 is not defined by iTunes; the default branch returns text.
    const data = buildMp4(ilstChild('©nam', 99, ascii('Shaka')));
    const frames = new IlstUtils().parse(data);
    expect(frames[0].data).toBe('Shaka');
  });

  // ---------------------------------------------------------------------------
  // Cover art — JPEG (flags = 13) and PNG (flags = 14)
  // ---------------------------------------------------------------------------

  it('parses a JPEG cover art atom as an APIC frame with image/jpeg', () => {
    const imageBytes = [0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02];
    const data = buildMp4(ilstChild('covr', 13, imageBytes));
    const frames = new IlstUtils().parse(data);

    expect(frames).toEqual([{
      key: 'APIC',
      data: BufferUtils.toArrayBuffer(new Uint8Array(imageBytes)),
      description: '',
      mimeType: 'image/jpeg',
      pictureType: 3,
    }]);
  });

  it('parses a PNG cover art atom as an APIC frame with image/png', () => {
    const imageBytes = [0x89, 0x50, 0x4e, 0x47];
    const data = buildMp4(ilstChild('covr', 14, imageBytes));
    const frames = new IlstUtils().parse(data);

    expect(frames[0].mimeType).toBe('image/png');
    expect(frames[0].pictureType).toBe(3);
    expect(frames[0].key).toBe('APIC');
  });

  // ---------------------------------------------------------------------------
  // Integer atoms (flags = 21)
  // ---------------------------------------------------------------------------

  it('parses a 1-byte signed integer (flags = 21)', () => {
    const data = buildMp4(ilstChild('tmpo', 21, [120]));
    expect(new IlstUtils().parse(data)[0].data).toBe(120);
  });

  it('parses a 2-byte signed integer (flags = 21)', () => {
    // 0x00C8 = 200
    const data = buildMp4(ilstChild('tmpo', 21, [0x00, 0xc8]));
    expect(new IlstUtils().parse(data)[0].data).toBe(200);
  });

  it('sign-extends a negative 3-byte integer (flags = 21)', () => {
    // 0x800000 with sign extension = -8388608
    const data = buildMp4(ilstChild('tmpo', 21, [0x80, 0x00, 0x00]));
    expect(new IlstUtils().parse(data)[0].data).toBe(-8388608);
  });

  it('parses a positive 3-byte integer (flags = 21)', () => {
    // 0x000003 = 3
    const data = buildMp4(ilstChild('tmpo', 21, [0x00, 0x00, 0x03]));
    expect(new IlstUtils().parse(data)[0].data).toBe(3);
  });

  it('parses a 4-byte negative signed integer (flags = 21)', () => {
    // 0xFFFFFF9C = -100 as Int32
    const data = buildMp4(ilstChild('tmpo', 21, [0xff, 0xff, 0xff, 0x9c]));
    expect(new IlstUtils().parse(data)[0].data).toBe(-100);
  });

  it('parses a 4-byte positive signed integer (flags = 21)', () => {
    // 0x000001F4 = 500
    const data = buildMp4(ilstChild('tmpo', 21, [0x00, 0x00, 0x01, 0xf4]));
    expect(new IlstUtils().parse(data)[0].data).toBe(500);
  });

  // ---------------------------------------------------------------------------
  // Track and disc number atoms (trkn, disk)
  // ---------------------------------------------------------------------------

  it('parses trkn atom as "index/total" when total > 0', () => {
    // Layout: 2 bytes padding, uint16BE index, uint16BE total, 2 bytes optional
    const value = [0x00, 0x00, 0x00, 0x03, 0x00, 0x0c, 0x00, 0x00]; // 3/12
    const data = buildMp4(ilstChild('trkn', 21, value));
    const frames = new IlstUtils().parse(data);

    expect(frames[0].key).toBe('TRCK');
    expect(frames[0].data).toBe('3/12');
  });

  it('parses trkn atom as plain index string when total = 0', () => {
    const value = [0x00, 0x00, 0x00, 0x05, 0x00, 0x00, 0x00, 0x00]; // 5
    const data = buildMp4(ilstChild('trkn', 21, value));
    const frames = new IlstUtils().parse(data);

    expect(frames[0].key).toBe('TRCK');
    expect(frames[0].data).toBe('5');
  });

  it('parses disk atom as "index/total" when total > 0', () => {
    const value = [0x00, 0x00, 0x00, 0x02, 0x00, 0x03, 0x00, 0x00]; // 2/3
    const data = buildMp4(ilstChild('disk', 21, value));
    const frames = new IlstUtils().parse(data);

    expect(frames[0].key).toBe('TPOS');
    expect(frames[0].data).toBe('2/3');
  });

  it('falls through to integer parsing when trkn payload is < 6 bytes', () => {
    // The trkn special case requires raw.length >= 6.  With 4 bytes it falls
    // through to the integer switch without throwing.
    const data = buildMp4(ilstChild('trkn', 21, [0x00, 0x00, 0x00, 0x05]));
    expect(() => new IlstUtils().parse(data)).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // Freeform atoms (----)
  // ---------------------------------------------------------------------------

  // eslint-disable-next-line @stylistic/max-len
  it('parses a freeform atom and exposes name as key, mean as description', () => {
    const data = buildMp4(
        freeformChild('com.apple.iTunes', 'iTunSMPB', 1, ascii('0 2112 840')),
    );

    expect(new IlstUtils().parse(data)).toEqual([{
      key: 'iTunSMPB',
      data: '0 2112 840',
      description: 'Domain: com.apple.iTunes',
      mimeType: null,
      pictureType: null,
    }]);
  });

  it('sets description to empty string when mean box is empty', () => {
    const data = buildMp4(
        freeformChild('', 'myTag', 1, ascii('hello')),
    );
    const frames = new IlstUtils().parse(data);
    expect(frames[0].description).toBe('');
  });

  it('skips a freeform atom when the name box is absent', () => {
    // Build ---- with only mean + data, no name.
    const meanBox = fullBox('mean', 0, 0, ascii('com.apple.iTunes'));
    const dataBytes = dataBox(1, ascii('value'));
    const child = basicBox('----', [...meanBox, ...dataBytes]);
    const data = buildMp4(child);

    expect(new IlstUtils().parse(data)).toEqual([]);
  });

  it('skips a freeform atom when the data box is absent', () => {
    // Build ---- with only mean + name.
    const meanBox = fullBox('mean', 0, 0, ascii('com.apple.iTunes'));
    const nameBox = fullBox('name', 0, 0, ascii('iTunSMPB'));
    const child = basicBox('----', [...meanBox, ...nameBox]);
    const data = buildMp4(child);

    expect(new IlstUtils().parse(data)).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Multiple atoms
  // ---------------------------------------------------------------------------

  it('parses multiple atoms from a single ilst box in order', () => {
    const data = buildMp4(
        ilstChild('©nam', 1, ascii('Blade Runner 2049')),
        ilstChild('©ART', 1, ascii('Hans Zimmer')),
        ilstChild('©alb', 1, ascii('Blade Runner 2049 OST')),
    );
    const frames = new IlstUtils().parse(data);

    expect(frames.length).toBe(3);
    expect(frames.find((f) => f.key === 'TIT2').data).toBe('Blade Runner 2049');
    expect(frames.find((f) => f.key === 'TPE1').data).toBe('Hans Zimmer');
    expect(frames.find((f) => f.key === 'TALB').data)
        .toBe('Blade Runner 2049 OST');
  });

  it('parses a mix of standard and freeform atoms', () => {
    const data = buildMp4(
        ilstChild('©nam', 1, ascii('Title')),
        freeformChild('com.apple.iTunes', 'iTunSMPB', 1, ascii('smpb')),
    );
    const frames = new IlstUtils().parse(data);

    expect(frames.length).toBe(2);
    expect(frames.find((f) => f.key === 'TIT2')).toBeDefined();
    expect(frames.find((f) => f.key === 'iTunSMPB')).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Robustness – malformed / truncated data
  // ---------------------------------------------------------------------------

  it('does not throw when an ilst child declares size < 8', () => {
    // size = 4 is less than the minimum 8-byte box header; the parser must
    // break out of the loop rather than attempting readBytes with a negative
    // or enormous count.
    const malformed = [...uint32BE(4), ...ascii('©nam')];
    const data = buildMp4(malformed);

    expect(() => new IlstUtils().parse(data)).not.toThrow();
    expect(new IlstUtils().parse(data)).toEqual([]);
  });

  // eslint-disable-next-line @stylistic/max-len
  it('clamps to available bytes when child size extends past the ilst boundary', () => {
    // Build a legitimate data box, then lie about the outer child size so it
    // would overrun the ilst payload.  The fixed parser clamps to maxPayload.
    const valueBytes = ascii('Shaka');
    const realDataBox = dataBox(1, valueBytes);
    const inflatedSize = 8 + realDataBox.length + 100; // claims 100 extra bytes

    const fakeChild = [
      ...uint32BE(inflatedSize),
      ...ascii('©nam'),
      ...realDataBox,
    ];
    const data = buildMp4(fakeChild);

    expect(() => new IlstUtils().parse(data)).not.toThrow();
    // The clamped payload is still a valid data box, so the frame parses.
    const frames = new IlstUtils().parse(data);
    expect(frames[0].key).toBe('TIT2');
    expect(frames[0].data).toBe('Shaka');
  });

  it('does not throw when a freeform atom contains no sub-boxes', () => {
    const emptyFreeform = basicBox('----', []);
    const data = buildMp4(emptyFreeform);
    expect(() => new IlstUtils().parse(data)).not.toThrow();
    expect(new IlstUtils().parse(data)).toEqual([]);
  });
});
