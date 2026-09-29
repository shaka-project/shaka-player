/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.require('shaka.mkv.BlockFlag');
goog.require('shaka.mkv.CodecId');
goog.require('shaka.mkv.MatroskaIndexParser');
goog.require('shaka.text.MatroskaTextParser');
goog.require('shaka.mkv.TrackType');
goog.require('shaka.text.Cue');
goog.require('shaka.text.TextEngine');
goog.require('shaka.util.Error');
goog.require('shaka.util.StringUtils');

describe('MatroskaTextParser', () => {
  const BlockFlag = shaka.mkv.BlockFlag;
  const CodecId = shaka.mkv.CodecId;
  const Matroska = shaka.test.Matroska;
  const MatroskaIndexParser = shaka.mkv.MatroskaIndexParser;
  const TrackType = shaka.mkv.TrackType;

  /** @type {!Uint8Array} */
  let bytes;
  /** @type {shaka.mkv.MatroskaIndexParser.Header} */
  let header;
  /** @type {!shaka.text.MatroskaTextParser} */
  let parser;

  beforeAll(async () => {
    bytes = await Matroska.fetchAsset('multitrack.mkv');
    header = MatroskaIndexParser.parseHeader(bytes.subarray(0, 8192));
  });

  beforeEach(() => {
    parser = new shaka.text.MatroskaTextParser();
  });

  /**
   * @param {number} start
   * @param {number} end
   * @return {shaka.extern.TextParser.TimeContext}
   */
  const makeTime = (start, end) => {
    return {
      periodStart: 0,
      segmentStart: start,
      segmentEnd: end,
      // What the text engine gives an external stream: the start of the
      // segment.  The times of the cues are absolute, so this must not count.
      vttOffset: start,
      isMpegTs: false,
    };
  };

  /**
   * @param {string} language
   * @return {!shaka.mkv.MatroskaIndexParser.Track}
   */
  const getSubtitleTrack = (language) => {
    return /** @type {!shaka.mkv.MatroskaIndexParser.Track} */(
      header.tracks.find((track) => {
        return track.type == TrackType.SUBTITLE && track.language == language;
      }));
  };

  /**
   * @param {!shaka.text.Cue} cue
   * @return {string} The text of the cue, with its nested cues.
   */
  const getText = (cue) => {
    if (cue.nestedCues.length) {
      return cue.nestedCues.map(getText).join('');
    }
    return cue.lineBreak ? '\n' : cue.payload;
  };

  describe('parseMedia', () => {
    /**
     * @param {string} language
     * @param {number} segment
     * @return {!Array<!shaka.text.Cue>}
     */
    const parseSegment = (language, segment) => {
      const track = getSubtitleTrack(language);
      parser.parseInit(Matroska.getInit(bytes, header, track));
      const segments = Matroska.getSegments(bytes, header);
      const reference = segments[segment].reference;
      return parser.parseMedia(segments[segment].data,
          makeTime(reference.startTime, reference.endTime), 'uri', []);
    };

    it('makes a cue of each block, at the time of the block', () => {
      const cues = parseSegment('eng', 0);
      expect(cues.length).toBe(2);
      // The times are those of the file, not the times of the segment added
      // to them.
      expect(cues[0].startTime).toBeCloseTo(0.2, 3);
      expect(cues[0].endTime).toBeCloseTo(0.9, 3);
      expect(cues[1].startTime).toBeCloseTo(1.0, 3);
      expect(cues[1].endTime).toBeCloseTo(1.8, 3);
    });

    it('reads the cues of a later segment', () => {
      const cues = parseSegment('eng', 1);
      expect(cues.length).toBe(1);
      expect(getText(cues[0])).toBe('Later cue');
      expect(cues[0].startTime).toBeCloseTo(3.5, 3);
      expect(cues[0].endTime).toBeCloseTo(4.5, 3);
    });

    it('reads the text, with its lines and its styles', () => {
      const cues = parseSegment('eng', 0);
      expect(getText(cues[0])).toBe('Hello world');
      expect(getText(cues[1])).toBe('Second line\nwith two rows');
    });

    it('reads the track that init says', () => {
      const cues = parseSegment('spa', 0);
      expect(cues.length).toBe(1);
      expect(getText(cues[0])).toBe('Hola mundo');
      expect(cues[0].startTime).toBeCloseTo(0.3, 3);
    });

    it('has no cues for a range without them', () => {
      const track = getSubtitleTrack('spa');
      parser.parseInit(Matroska.getInit(bytes, header, track));
      const segments = Matroska.getSegments(bytes, header);
      const reference = segments[1].reference;
      expect(parser.parseMedia(segments[1].data,
          makeTime(reference.startTime, reference.endTime), 'uri', []))
          .toEqual([]);
    });

    it('needs the initialization segment', () => {
      const segments = Matroska.getSegments(bytes, header);
      expect(() => parser.parseMedia(segments[0].data,
          makeTime(0, 1.5), 'uri', [])).toThrow(jasmine.objectContaining({
        category: shaka.util.Error.Category.TEXT,
      }));
    });

    it('rejects an initialization segment without a track', () => {
      // The beginning of the file, cut before the first track.
      const first = header.tracks[0];
      expect(() => parser.parseInit(bytes.subarray(0, first.offset)))
          .toThrow();
    });
  });

  describe('ASS', () => {
    /** @type {!Uint8Array} */
    let assBytes;
    /** @type {shaka.mkv.MatroskaIndexParser.Header} */
    let assHeader;

    beforeAll(async () => {
      assBytes = await Matroska.fetchAsset('ass-styles.mkv');
      assHeader = MatroskaIndexParser.parseHeader(assBytes.subarray(0, 8192));
    });

    /** @return {!Array<!shaka.text.Cue>} */
    const parseAll = () => {
      const track = /** @type {!shaka.mkv.MatroskaIndexParser.Track} */(
        assHeader.tracks.find((entry) => entry.type == TrackType.SUBTITLE));
      parser.parseInit(Matroska.getInit(assBytes, assHeader, track));
      const cues = [];
      for (const segment of Matroska.getSegments(assBytes, assHeader)) {
        const reference = segment.reference;
        cues.push(...parser.parseMedia(segment.data,
            makeTime(reference.startTime, reference.endTime), 'uri', []));
      }
      return cues.sort((a, b) => a.startTime - b.startTime);
    };

    it('makes a cue of each event, at the time of the block', () => {
      const cues = parseAll();
      expect(cues.map((cue) => getText(cue))).toEqual(
          ['Hello, world\nsecond row', 'Top line', 'Later, with, commas']);
      expect(cues[0].startTime).toBeCloseTo(0.2, 2);
      expect(cues[0].endTime).toBeCloseTo(1.0, 2);
      expect(cues[1].startTime).toBeCloseTo(1.1, 2);
      expect(cues[2].startTime).toBeCloseTo(2.5, 2);
      expect(cues[2].endTime).toBeCloseTo(3.5, 2);
    });

    it('does not show the event that draws a shape', () => {
      const texts = parseAll().map((cue) => getText(cue));
      expect(texts.length).toBe(3);
      expect(texts.some((text) => text.includes('m 0 0'))).toBe(false);
    });

    it('uses the styles of the header of the track', () => {
      const cues = parseAll();
      expect(cues[0].fontFamily).toBe('Arial');
      expect(cues[0].fontSize).toBe('20px');
      expect(cues[0].displayAlign).toBe(shaka.text.Cue.displayAlign.AFTER);
      // The second style is bold and italic, at the top.
      expect(cues[1].fontFamily).toBe('Verdana');
      expect(cues[1].fontWeight).toBe(shaka.text.Cue.fontWeight.BOLD);
      expect(cues[1].fontStyle).toBe(shaka.text.Cue.fontStyle.ITALIC);
      expect(cues[1].displayAlign).toBe(shaka.text.Cue.displayAlign.BEFORE);
    });

    it('is registered for the text of Matroska', () => {
      expect(shaka.text.TextEngine.findParser(
          'text/x-matroska; codecs="ass"')).toBeDefined();
    });
  });

  describe('with a file built for the test', () => {
    /**
     * A file with a subtitle track, and the cluster with the given blocks.
     *
     * @param {...!Uint8Array} blocks
     * @return {!Array<!shaka.text.Cue>}
     */
    const parseBlocks = (...blocks) => {
      const file = Matroska.makeFile(Matroska.trackEntry(
          3, TrackType.SUBTITLE, CodecId.SRT));
      const fileHeader = MatroskaIndexParser.parseHeader(file);
      parser.parseInit(file.subarray(
          0, /** @type {number} */(fileHeader.firstClusterOffset)));
      return parser.parseMedia(Matroska.cluster(5000, ...blocks),
          makeTime(5, 10), 'uri', []);
    };

    const group = (relative, duration, text) => {
      return Matroska.blockGroup(3, relative, duration,
          shaka.util.BufferUtils.toUint8(shaka.util.StringUtils.toUTF8(text)));
    };

    it('ends a cue where the next one starts when it has no duration', () => {
      const block = (relative, text) => {
        return Matroska.simpleBlock(3, relative, BlockFlag.KEYFRAME,
            shaka.util.BufferUtils.toUint8(
                shaka.util.StringUtils.toUTF8(text)));
      };
      const cues = parseBlocks(block(0, 'One'), block(1000, 'Two'));
      expect(cues[0].startTime).toBeCloseTo(5, 3);
      expect(cues[0].endTime).toBeCloseTo(6, 3);
      // The last one lasts until the end of the segment.
      expect(cues[1].startTime).toBeCloseTo(6, 3);
      expect(cues[1].endTime).toBeCloseTo(10, 3);
    });

    it('keeps an empty line out of the middle of a cue', () => {
      // An empty line ends a cue in SRT.
      const cues = parseBlocks(group(0, 1000, 'One\r\n\r\nTwo'));
      expect(cues.length).toBe(1);
      expect(getText(cues[0])).toBe('One\nTwo');
    });

    it('skips a block that has no text', () => {
      const cues = parseBlocks(group(0, 1000, '  '), group(1000, 500, 'Yes'));
      expect(cues.length).toBe(1);
      expect(getText(cues[0])).toBe('Yes');
    });

    it('reads text that is not ASCII', () => {
      const cues = parseBlocks(group(0, 1000, '¿Qué? 日本語'));
      expect(getText(cues[0])).toBe('¿Qué? 日本語');
    });

    it('does not read a track that is not there', () => {
      const file = Matroska.makeFile(Matroska.trackEntry(
          3, TrackType.SUBTITLE, CodecId.SRT));
      const fileHeader = MatroskaIndexParser.parseHeader(file);
      parser.parseInit(file.subarray(
          0, /** @type {number} */(fileHeader.firstClusterOffset)));
      // The block is of track 4.
      const cues = parser.parseMedia(Matroska.cluster(0,
          Matroska.blockGroup(4, 0, 500, new Uint8Array([65]))),
      makeTime(0, 1), 'uri', []);
      expect(cues).toEqual([]);
    });
  });

  it('is registered for the text of Matroska', () => {
    expect(shaka.text.TextEngine.findParser(
        'text/x-matroska; codecs="srt"')).toBeDefined();
    const created = shaka.text.TextEngine.findParser(
        'text/x-matroska; codecs="srt"')();
    expect(created instanceof shaka.text.MatroskaTextParser).toBe(true);
  });

  it('passes the manifest type on to the parser of SRT', () => {
    expect(() => parser.setManifestType('MKV')).not.toThrow();
  });
});
