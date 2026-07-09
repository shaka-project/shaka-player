/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('VorbisUtils', () => {
  const VorbisUtils = shaka.metadata.VorbisUtils;
  const BufferUtils = shaka.util.BufferUtils;

  // ---------------------------------------------------------------------------
  // Binary-construction helpers
  // ---------------------------------------------------------------------------

  /**
   * @param {number} n
   * @return {!Array<number>}
   */
  function uint32LE(n) {
    return [
      (n >>> 0) & 0xff,
      (n >>> 8) & 0xff,
      (n >>> 16) & 0xff,
      (n >>> 24) & 0xff,
    ];
  }

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
   * Encode an ASCII string as a plain byte array.
   * @param {string} str
   * @return {!Array<number>}
   */
  function ascii(str) {
    return Array.from(str).map((c) => c.charCodeAt(0));
  }

  /**
   * Build a raw Vorbis comment block body (little-endian lengths).
   *
   * @param {string} vendor
   * @param {!Array<string>} comments  e.g. ['TITLE=Shaka', 'ARTIST=Hans']
   * @return {!Array<number>}
   */
  function vorbisCommentBody(vendor, comments) {
    const vendorBytes = ascii(vendor);
    const out = [
      ...uint32LE(vendorBytes.length),
      ...vendorBytes,
      ...uint32LE(comments.length),
    ];
    for (const c of comments) {
      const cb = ascii(c);
      out.push(...uint32LE(cb.length), ...cb);
    }
    return out;
  }

  /**
   * Wrap a body into a FLAC metadata block header.
   *
   * @param {number} blockType  0–127
   * @param {boolean} isLast
   * @param {!Array<number>} body
   * @return {!Array<number>}
   */
  function flacBlock(blockType, isLast, body) {
    const header = (isLast ? 0x80 : 0x00) | (blockType & 0x7f);
    const len = body.length;
    return [
      header,
      (len >>> 16) & 0xff,
      (len >>> 8) & 0xff,
      len & 0xff,
      ...body,
    ];
  }

  /**
   * Build a complete FLAC file from an array of pre-built block byte arrays.
   *
   * @param {!Array<!Array<number>>} blocks
   * @return {!Uint8Array}
   */
  function flac(blocks) {
    return new Uint8Array([
      0x66, 0x4c, 0x61, 0x43, // fLaC
      ...blocks.reduce((acc, block) => {
        return acc.concat(block);
      }, []),
    ]);
  }

  /**
   * Build the body of a FLAC PICTURE block (big-endian lengths).
   *
   * @param {number} pictureType
   * @param {string} mimeType
   * @param {string} description
   * @param {!Array<number>} imageData
   * @return {!Array<number>}
   */
  function flacPictureBody(pictureType, mimeType, description, imageData) {
    const mimeBytes = ascii(mimeType);
    const descBytes = ascii(description);
    return [
      ...uint32BE(pictureType),
      ...uint32BE(mimeBytes.length),
      ...mimeBytes,
      ...uint32BE(descBytes.length),
      ...descBytes,
      ...uint32BE(0),            // width  – ignored
      ...uint32BE(0),            // height – ignored
      ...uint32BE(0),            // color depth  – ignored
      ...uint32BE(0),            // color count  – ignored
      ...uint32BE(imageData.length),
      ...imageData,
    ];
  }

  /**
   * Build a minimal OGG container carrying a Vorbis comment block.
   *
   * parseOgg_ looks for 'OpusTags' (8 bytes) or 'vorbis' (6 bytes) and then
   * skips 8 bytes before handing the rest to parseVorbisCommentBlock_.  This
   * helper places the marker immediately after the OggS magic so the comment
   * body starts exactly at byte 4 + 8 = 12.
   *
   * @param {string} codec
   * @param {!Array<number>} commentBodyBytes
   * @return {!Uint8Array}
   */
  function ogg(codec, commentBodyBytes) {
    const oggsMagic = [0x4f, 0x67, 0x67, 0x53]; // OggS

    if (codec === 'opus') {
      // 'OpusTags' is exactly 8 bytes; the comment body begins right after.
      return new Uint8Array([
        ...oggsMagic,
        ...ascii('OpusTags'),
        ...commentBodyBytes,
      ]);
    }

    // 'vorbis' is 6 bytes.  parseOgg_ skips 8 from the match index, so we add
    // 2 padding bytes after the marker so the comment body aligns correctly.
    return new Uint8Array([
      ...oggsMagic,
      ...ascii('vorbis'),
      0x00, 0x00,                 // 2 padding bytes to reach offset+8
      ...commentBodyBytes,
    ]);
  }

  // ---------------------------------------------------------------------------
  // parse – dispatch
  // ---------------------------------------------------------------------------

  it('empty data returns empty output', () => {
    expect(new VorbisUtils().parse(new Uint8Array([]))).toEqual([]);
  });

  it('non-FLAC non-OGG data returns empty output', () => {
    const data = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    expect(new VorbisUtils().parse(data)).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // FLAC – VORBIS_COMMENT block (type 4)
  // ---------------------------------------------------------------------------

  it('parses a single comment from a FLAC VORBIS_COMMENT block', () => {
    const body = vorbisCommentBody('', ['TITLE=Shaka']);
    const data = flac([flacBlock(4, /* isLast= */ true, body)]);

    expect(new VorbisUtils().parse(data)).toEqual([{
      key: 'TIT2',
      data: 'Shaka',
      description: '',
      mimeType: null,
      pictureType: null,
    }]);
  });

  it('parses multiple comments from a single VORBIS_COMMENT block', () => {
    const body = vorbisCommentBody(
        'reference libFLAC 1.4.3',
        ['TITLE=A Way of Life', 'ARTIST=Hans Zimmer', 'ALBUM=The Last Samurai'],
    );
    const data = flac([flacBlock(4, /* isLast= */ true, body)]);
    const frames = new VorbisUtils().parse(data);

    expect(frames).toEqual(jasmine.arrayContaining([
      jasmine.objectContaining({key: 'TIT2', data: 'A Way of Life'}),
      jasmine.objectContaining({key: 'TPE1', data: 'Hans Zimmer'}),
      jasmine.objectContaining({key: 'TALB', data: 'The Last Samurai'}),
    ]));
  });

  it('maps all supported Vorbis field names to their ID3 equivalents', () => {
    const mapping = [
      ['TITLE', 'TIT2'],
      ['ARTIST', 'TPE1'],
      ['ALBUM', 'TALB'],
      ['ALBUMARTIST', 'TPE2'],
      ['TRACKNUMBER', 'TRCK'],
      ['DISCNUMBER', 'TPOS'],
      ['DATE', 'TDRC'],
      ['GENRE', 'TCON'],
      ['COMMENT', 'COMM'],
      ['DESCRIPTION', 'TIT3'],
      ['COPYRIGHT', 'TCOP'],
      ['COMPOSER', 'TCOM'],
      ['LYRICS', 'USLT'],
      ['ISRC', 'TSRC'],
    ];

    for (const [vorbisKey, id3Key] of mapping) {
      const body = vorbisCommentBody('', [`${vorbisKey}=test`]);
      const data = flac([flacBlock(4, /* isLast= */ true, body)]);
      const frames = new VorbisUtils().parse(data);

      expect(frames[0].key)
          .withContext(`${vorbisKey} → ${id3Key}`)
          .toBe(id3Key);
    }
  });

  it('passes unknown Vorbis keys through unchanged in upper-case', () => {
    const body = vorbisCommentBody('', ['REPLAYGAIN_TRACK_GAIN=-6.0 dB']);
    const data = flac([flacBlock(4, /* isLast= */ true, body)]);
    const frames = new VorbisUtils().parse(data);

    expect(frames[0].key).toBe('REPLAYGAIN_TRACK_GAIN');
    expect(frames[0].data).toBe('-6.0 dB');
  });

  // eslint-disable-next-line @stylistic/max-len
  it('lower-case Vorbis keys are normalised to upper-case before mapping', () => {
    const body = vorbisCommentBody('', ['title=Shaka']);
    const data = flac([flacBlock(4, /* isLast= */ true, body)]);
    const frames = new VorbisUtils().parse(data);

    expect(frames[0].key).toBe('TIT2');
  });

  it('skips comment entries that have no "=" separator', () => {
    const body = vorbisCommentBody('', ['BADENTRY', 'TITLE=Shaka']);
    const data = flac([flacBlock(4, /* isLast= */ true, body)]);
    const frames = new VorbisUtils().parse(data);

    expect(frames.length).toBe(1);
    expect(frames[0].key).toBe('TIT2');
  });

  it('value may contain "=" characters without being truncated', () => {
    const body = vorbisCommentBody('', ['TITLE=A=B=C']);
    const data = flac([flacBlock(4, /* isLast= */ true, body)]);
    const frames = new VorbisUtils().parse(data);

    expect(frames[0].data).toBe('A=B=C');
  });

  it('stops parsing FLAC blocks after the isLast block', () => {
    // First block: isLast=true with TITLE. Second block would add ARTIST but
    // must never be reached.
    const firstBody = vorbisCommentBody('', ['TITLE=Shaka']);
    const secondBody = vorbisCommentBody('', ['ARTIST=Hans Zimmer']);

    const data = flac([
      flacBlock(4, /* isLast= */ true, firstBody),
      flacBlock(4, /* isLast= */ true, secondBody),
    ]);

    const frames = new VorbisUtils().parse(data);

    expect(frames.length).toBe(1);
    expect(frames[0].key).toBe('TIT2');
  });

  it('gracefully stops when a block length exceeds the available data', () => {
    // Build a valid FLAC header with a block whose declared size is huge.
    const data = new Uint8Array([
      0x66, 0x4c, 0x61, 0x43, // fLaC
      0x84,                    // type=4, isLast=true
      0x00, 0x10, 0x00,        // length = 4096 (way past end of buffer)
      0x00, 0x00, 0x00, 0x00,  // only 4 bytes of body
    ]);

    expect(new VorbisUtils().parse(data)).toEqual([]);
  });

  // eslint-disable-next-line @stylistic/max-len
  it('returns empty when VORBIS_COMMENT body is too short for vendor length', () => {
    // Body is only 2 bytes – not enough for the 4-byte vendor_length field.
    const body = [0x00, 0x01];
    const data = flac([flacBlock(4, /* isLast= */ true, body)]);

    expect(new VorbisUtils().parse(data)).toEqual([]);
  });

  // eslint-disable-next-line @stylistic/max-len
  it('returns empty when VORBIS_COMMENT body is truncated after vendor string', () => {
    // vendor_length = 0, then only 2 bytes instead of the 4 needed for
    // comment_count.
    const body = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    const data = flac([flacBlock(4, /* isLast= */ true, body)]);

    expect(new VorbisUtils().parse(data)).toEqual([]);
  });

  // eslint-disable-next-line @stylistic/max-len
  it('stops mid-loop when a comment entry length exceeds remaining data', () => {
    // comment_count = 2, first entry valid, second entry claims 255 bytes.
    const firstEntry = [...uint32LE(7), ...ascii('TITLE=A')];
    const brokenEntry = [...uint32LE(255)]; // no actual bytes follow

    const body = [
      ...uint32LE(0),       // vendor_length = 0
      ...uint32LE(2),       // comment_count = 2
      ...firstEntry,
      ...brokenEntry,
    ];
    const data = flac([flacBlock(4, /* isLast= */ true, body)]);
    const frames = new VorbisUtils().parse(data);

    // Only the valid first entry should be returned.
    expect(frames.length).toBe(1);
    expect(frames[0].key).toBe('TIT2');
  });

  // ---------------------------------------------------------------------------
  // FLAC – PICTURE block (type 6)
  // ---------------------------------------------------------------------------

  it('parses a FLAC PICTURE block as an APIC frame', () => {
    const imageData = [0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02]; // fake JPEG header
    const body = flacPictureBody(3, 'image/jpeg', '', imageData);
    const data = flac([flacBlock(6, /* isLast= */ true, body)]);
    const frames = new VorbisUtils().parse(data);

    expect(frames).toEqual([{
      key: 'APIC',
      mimeType: 'image/jpeg',
      pictureType: 3,
      description: '',
      data: BufferUtils.toArrayBuffer(new Uint8Array(imageData)),
    }]);
  });

  it('preserves the description field from a FLAC PICTURE block', () => {
    const body = flacPictureBody(3, 'image/png', 'Front Cover', [0x89, 0x50]);
    const data = flac([flacBlock(6, /* isLast= */ true, body)]);
    const frames = new VorbisUtils().parse(data);

    expect(frames[0].description).toBe('Front Cover');
  });

  it('preserves the pictureType value from a FLAC PICTURE block', () => {
    // pictureType 4 = "Back cover"
    const body = flacPictureBody(4, 'image/jpeg', '', [0x01]);
    const data = flac([flacBlock(6, /* isLast= */ true, body)]);
    const frames = new VorbisUtils().parse(data);

    expect(frames[0].pictureType).toBe(4);
  });

  // eslint-disable-next-line @stylistic/max-len
  it('returns null (skips) a PICTURE block that is too short for pictureType', () => {
    // Only 2 bytes – not enough for the first uint32 BE.
    const data = flac([flacBlock(6, /* isLast= */ true, [0x00, 0x00])]);

    expect(new VorbisUtils().parse(data)).toEqual([]);
  });

  it('returns null (skips) a PICTURE block truncated after MIME type', () => {
    // pictureType(4) + mime_length=10 but only 3 mime bytes follow.
    const body = [
      ...uint32BE(3),   // pictureType
      ...uint32BE(10),  // mime_length = 10
      ...ascii('ima'),  // only 3 bytes instead of 10
    ];
    const data = flac([flacBlock(6, /* isLast= */ true, body)]);

    expect(new VorbisUtils().parse(data)).toEqual([]);
  });

  it('returns null (skips) a PICTURE block truncated after description', () => {
    const mimeBytes = ascii('image/jpeg');
    const body = [
      ...uint32BE(3),
      ...uint32BE(mimeBytes.length),
      ...mimeBytes,
      ...uint32BE(5),   // desc_length = 5
      ...ascii('ab'),   // only 2 bytes instead of 5
    ];
    const data = flac([flacBlock(6, /* isLast= */ true, body)]);

    expect(new VorbisUtils().parse(data)).toEqual([]);
  });

  // eslint-disable-next-line @stylistic/max-len
  it('returns null (skips) a PICTURE block truncated before data length field', () => {
    const mimeBytes = ascii('image/jpeg');
    const descBytes = ascii('');
    // Provide everything up to and including the 16 spatial bytes, then stop.
    const body = [
      ...uint32BE(3),
      ...uint32BE(mimeBytes.length),
      ...mimeBytes,
      ...uint32BE(descBytes.length),
      ...descBytes,
      ...uint32BE(0), ...uint32BE(0), ...uint32BE(0), ...uint32BE(0),
      // data_length field (4 bytes) is missing
    ];
    const data = flac([flacBlock(6, /* isLast= */ true, body)]);

    expect(new VorbisUtils().parse(data)).toEqual([]);
  });

  // eslint-disable-next-line @stylistic/max-len
  it('returns null (skips) a PICTURE block where image data is truncated', () => {
    const mimeBytes = ascii('image/jpeg');
    const body = [
      ...uint32BE(3),
      ...uint32BE(mimeBytes.length),
      ...mimeBytes,
      ...uint32BE(0),              // desc_length = 0
      ...uint32BE(0), ...uint32BE(0), ...uint32BE(0), ...uint32BE(0),
      ...uint32BE(100),            // data_length = 100
      0x01, 0x02,                  // only 2 bytes of image data
    ];
    const data = flac([flacBlock(6, /* isLast= */ true, body)]);

    expect(new VorbisUtils().parse(data)).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // FLAC – both block types together
  // ---------------------------------------------------------------------------

  // eslint-disable-next-line @stylistic/max-len
  it('parses both a VORBIS_COMMENT and a PICTURE block from the same FLAC', () => {
    const commentBody = vorbisCommentBody('', ['TITLE=Shaka']);
    const pictureBody = flacPictureBody(3, 'image/jpeg', '', [0x01, 0x02]);

    const data = flac([
      flacBlock(4, /* isLast= */ false, commentBody),
      flacBlock(6, /* isLast= */ true, pictureBody),
    ]);

    const frames = new VorbisUtils().parse(data);

    expect(frames.length).toBe(2);
    expect(frames.find((f) => f.key === 'TIT2')).toBeDefined();
    expect(frames.find((f) => f.key === 'APIC')).toBeDefined();
  });

  it('ignores unrecognised FLAC block types without errors', () => {
    // Block type 2 (SEEKTABLE) has no handler and must be silently skipped.
    const seekBody = new Array(18).fill(0xff);
    const commentBody = vorbisCommentBody('', ['TITLE=Shaka']);

    const data = flac([
      flacBlock(2, /* isLast= */ false, seekBody),
      flacBlock(4, /* isLast= */ true, commentBody),
    ]);

    const frames = new VorbisUtils().parse(data);

    expect(frames.length).toBe(1);
    expect(frames[0].key).toBe('TIT2');
  });

  // ---------------------------------------------------------------------------
  // OGG – OpusTags
  // ---------------------------------------------------------------------------

  it('parses OGG Opus comments via the OpusTags marker', () => {
    const body = vorbisCommentBody('', ['TITLE=Shaka', 'ARTIST=Hans Zimmer']);
    const data = ogg('opus', body);
    const frames = new VorbisUtils().parse(data);

    expect(frames).toEqual(jasmine.arrayContaining([
      jasmine.objectContaining({key: 'TIT2', data: 'Shaka'}),
      jasmine.objectContaining({key: 'TPE1', data: 'Hans Zimmer'}),
    ]));
  });

  it('returns empty array for OGG Opus with no comments', () => {
    const body = vorbisCommentBody('reference libopus', []);
    const data = ogg('opus', body);
    const frames = new VorbisUtils().parse(data);

    expect(frames).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // OGG – vorbis marker
  // ---------------------------------------------------------------------------

  it('parses OGG Vorbis comments via the vorbis marker', () => {
    const body = vorbisCommentBody('', ['ALBUM=The Last Samurai']);
    const data = ogg('vorbis', body);
    const frames = new VorbisUtils().parse(data);

    expect(frames).toEqual([
      jasmine.objectContaining({key: 'TALB', data: 'The Last Samurai'}),
    ]);
  });

  it('returns empty for OGG data with no recognised marker', () => {
    // Valid OggS magic but no OpusTags or vorbis string anywhere.
    const data = new Uint8Array([
      0x4f, 0x67, 0x67, 0x53, // OggS
      0x00, 0x01, 0x02, 0x03,
    ]);

    expect(new VorbisUtils().parse(data)).toEqual([]);
  });
});
