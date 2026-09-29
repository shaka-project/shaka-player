/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.require('shaka.mkv.BlockAddType');
goog.require('shaka.mkv.CodecId');
goog.require('shaka.mkv.ContentCompression');
goog.require('shaka.mkv.ElementId');
goog.require('shaka.mkv.MatroskaIndexParser');
goog.require('shaka.mkv.TrackType');
goog.require('shaka.util.Error');

describe('MatroskaIndexParser', () => {
  const CodecId = shaka.mkv.CodecId;
  const ElementId = shaka.mkv.ElementId;
  const MatroskaIndexParser = shaka.mkv.MatroskaIndexParser;
  const Matroska = shaka.test.Matroska;
  const TrackType = shaka.mkv.TrackType;

  // Enough for the whole header of the fixtures.
  const HEADER_SIZE = 8192;

  /** @type {!Uint8Array} */
  let indexFile;
  /** @type {!Uint8Array} */
  let multitrack;

  beforeAll(async () => {
    indexFile = await Matroska.fetchAsset('index.mkv');
    multitrack = await Matroska.fetchAsset('multitrack.mkv');
  });

  describe('parseHeader', () => {
    it('reads the tracks and the positions of the index', () => {
      const header = MatroskaIndexParser.parseHeader(
          indexFile.subarray(0, 1024));
      expect(header.segmentOffset).toBe(52);
      expect(header.firstClusterOffset).toBe(727);
      expect(header.cuesOffset).toBe(9517);
      expect(header.duration).toBeCloseTo(2.008, 3);
      expect(header.timecodeScale).toBe(1000000);
      expect(header.tracks.length).toBe(2);
      expect(header.tracks[0].number).toBe(1);
      expect(header.tracks[0].type).toBe(TrackType.VIDEO);
      expect(header.tracks[0].codecId).toBe(CodecId.VP9);
      expect(header.tracks[0].width).toBe(64);
      expect(header.tracks[0].height).toBe(64);
      expect(header.tracks[1].number).toBe(2);
      expect(header.tracks[1].type).toBe(TrackType.AUDIO);
      expect(header.tracks[1].codecId).toBe(CodecId.OPUS);
      expect(header.tracks[1].sampleRate).toBe(48000);
      expect(header.tracks[1].channels).toBe(1);
    });

    it('ends the media where the Cues start', () => {
      const header = MatroskaIndexParser.parseHeader(
          indexFile.subarray(0, 1024));
      expect(header.mediaEndOffset).toBe(header.cuesOffset);
    });

    it('reads the languages, names and flags of the tracks', () => {
      const header = MatroskaIndexParser.parseHeader(
          multitrack.subarray(0, HEADER_SIZE));
      const byNumber = (number) => {
        return header.tracks.find((track) => track.number == number);
      };
      // The encoder that wrote the video track set it as undetermined.
      expect(byNumber(1).language).toBe('und');
      expect(byNumber(2).language).toBe('eng');
      expect(byNumber(2).isDefault).toBe(true);
      expect(byNumber(3).language).toBe('spa');
      expect(byNumber(3).isDefault).toBe(false);
      expect(byNumber(4).language).toBe('fra');
      const english = header.tracks.find((track) => {
        return track.type == TrackType.SUBTITLE && track.language == 'eng';
      });
      expect(english.forced).toBe(false);
      const spanish = header.tracks.find((track) => {
        return track.type == TrackType.SUBTITLE && track.language == 'spa';
      });
      expect(spanish.forced).toBe(true);
      expect(spanish.name).toBe('Forzados');
    });

    it('reads the settings of the video and the audio', () => {
      const header = MatroskaIndexParser.parseHeader(
          multitrack.subarray(0, HEADER_SIZE));
      const video = header.tracks[0];
      expect(video.codecId).toBe(CodecId.AVC);
      expect(video.width).toBe(64);
      expect(video.height).toBe(64);
      // 10 frames per second.
      expect(video.defaultDuration).toBeCloseTo(0.1, 6);
      expect(video.codecPrivate).not.toBe(null);
      const mp3 = header.tracks.find((track) => track.codecId == CodecId.MP3);
      expect(mp3.sampleRate).toBe(44100);
      expect(mp3.channels).toBe(1);
    });

    it('does not reach the first cluster in a cut header', () => {
      const header = MatroskaIndexParser.parseHeader(
          indexFile.subarray(0, 100));
      expect(header.firstClusterOffset).toBe(null);
    });

    it('gives the tracks that come before the cut in the Tracks', () => {
      const whole = MatroskaIndexParser.parseHeader(
          multitrack.subarray(0, HEADER_SIZE));
      const third = whole.tracks[2];
      const cut = multitrack.subarray(0, third.offset + third.size);
      const header = MatroskaIndexParser.parseHeader(cut);
      expect(header.firstClusterOffset).toBe(null);
      expect(header.tracks.map((track) => track.number)).toEqual(
          [1, 2, 3]);
    });

    it('rejects a non-Matroska document', () => {
      const invalid = indexFile.slice(0, 1024);
      invalid[0] = 0;
      expect(() => MatroskaIndexParser.parseHeader(invalid)).toThrow(
          jasmine.objectContaining(
              {code: shaka.util.Error.Code.MKV_INVALID_FILE}));
    });

    it('rejects a document of another type', () => {
      const data = shaka.util.Uint8ArrayUtils.concat(
          Matroska.element(ElementId.EBML,
              Matroska.string(ElementId.DOC_TYPE, 'ogg')),
          Matroska.element(ElementId.SEGMENT, new Uint8Array(0)));
      expect(() => MatroskaIndexParser.parseHeader(data)).toThrow();
    });

    it('accepts a WebM document', () => {
      const data = Matroska.makeFileOfType('webm',
          Matroska.trackEntry(1, TrackType.VIDEO, CodecId.VP9));
      expect(MatroskaIndexParser.parseHeader(data).tracks.length).toBe(1);
    });

    it('accepts a Segment of unknown size', () => {
      const header = MatroskaIndexParser.parseHeader(Matroska.makeFile(
          Matroska.trackEntry(1, TrackType.VIDEO, CodecId.AVC)));
      expect(header.tracks.length).toBe(1);
      expect(header.firstClusterOffset).not.toBe(null);
      expect(header.duration).toBeCloseTo(2, 6);
    });

    it('rejects a file that has media but no tracks', () => {
      expect(() => MatroskaIndexParser.parseHeader(Matroska.makeFile()))
          .toThrow();
    });

    it('scales the duration with the timecode scale', () => {
      const data = shaka.util.Uint8ArrayUtils.concat(
          Matroska.element(ElementId.EBML,
              Matroska.string(ElementId.DOC_TYPE, 'matroska')),
          Matroska.element(ElementId.SEGMENT,
              Matroska.element(ElementId.INFO,
                  // A tick of 0.1 ms.
                  Matroska.uint(ElementId.TIMECODE_SCALE, 100000),
                  Matroska.float(ElementId.DURATION, 30000)),
              Matroska.element(ElementId.TRACKS, Matroska.trackEntry(
                  1, TrackType.VIDEO, CodecId.AVC)),
              Matroska.cluster(0)));
      const header = MatroskaIndexParser.parseHeader(data);
      expect(header.timecodeScale).toBe(100000);
      expect(header.duration).toBeCloseTo(3, 6);
    });
  });

  describe('tracks', () => {
    /**
     * @param {...!Uint8Array} fields
     * @return {!shaka.mkv.MatroskaIndexParser.Track}
     */
    const parseTrack = (...fields) => {
      const header = MatroskaIndexParser.parseHeader(Matroska.makeFile(
          Matroska.trackEntry(7, TrackType.VIDEO, CodecId.AVC, ...fields)));
      return header.tracks[0];
    };

    it('has the defaults of the specification', () => {
      const track = parseTrack();
      expect(track.number).toBe(7);
      expect(track.language).toBe('eng');
      expect(track.enabled).toBe(true);
      expect(track.isDefault).toBe(true);
      expect(track.forced).toBe(false);
      expect(track.codecPrivate).toBe(null);
      expect(track.strippedHeader).toBe(null);
      expect(track.unsupportedEncoding).toBe(false);
    });

    it('prefers the BCP 47 language', () => {
      const track = parseTrack(
          Matroska.string(ElementId.LANGUAGE, 'spa'),
          Matroska.string(ElementId.LANGUAGE_BCP47, 'es-MX'));
      expect(track.language).toBe('es-MX');
    });

    it('reads the flags', () => {
      const track = parseTrack(
          Matroska.uint(ElementId.FLAG_ENABLED, 0),
          Matroska.uint(ElementId.FLAG_DEFAULT, 0),
          Matroska.uint(ElementId.FLAG_FORCED, 1),
          Matroska.uint(ElementId.FLAG_HEARING_IMPAIRED, 1),
          Matroska.uint(ElementId.FLAG_VISUAL_IMPAIRED, 1),
          Matroska.uint(ElementId.FLAG_ORIGINAL, 1),
          Matroska.uint(ElementId.FLAG_COMMENTARY, 1));
      expect(track.enabled).toBe(false);
      expect(track.isDefault).toBe(false);
      expect(track.forced).toBe(true);
      expect(track.hearingImpaired).toBe(true);
      expect(track.visualImpaired).toBe(true);
      expect(track.original).toBe(true);
      expect(track.commentary).toBe(true);
    });

    it('reads the display size and the colour of a video', () => {
      const track = parseTrack(Matroska.element(ElementId.VIDEO,
          Matroska.uint(ElementId.PIXEL_WIDTH, 720),
          Matroska.uint(ElementId.PIXEL_HEIGHT, 480),
          Matroska.uint(ElementId.DISPLAY_WIDTH, 853),
          Matroska.uint(ElementId.DISPLAY_HEIGHT, 480),
          Matroska.element(ElementId.COLOUR,
              Matroska.uint(ElementId.TRANSFER_CHARACTERISTICS, 16))));
      expect(track.width).toBe(720);
      expect(track.displayWidth).toBe(853);
      expect(track.displayHeight).toBe(480);
      expect(track.transferCharacteristics).toBe(16);
    });

    it('ignores a display size that is not in pixels', () => {
      const track = parseTrack(Matroska.element(ElementId.VIDEO,
          Matroska.uint(ElementId.DISPLAY_WIDTH, 10),
          Matroska.uint(ElementId.DISPLAY_HEIGHT, 5),
          // Centimeters.
          Matroska.uint(ElementId.DISPLAY_UNIT, 1)));
      expect(track.displayWidth).toBe(null);
      expect(track.displayHeight).toBe(null);
    });

    it('reads both sample rates of an audio track', () => {
      const header = MatroskaIndexParser.parseHeader(Matroska.makeFile(
          Matroska.trackEntry(1, TrackType.AUDIO, CodecId.AAC,
              Matroska.element(ElementId.AUDIO,
                  Matroska.float(ElementId.SAMPLING_FREQUENCY, 24000),
                  Matroska.float(ElementId.OUTPUT_SAMPLING_FREQUENCY, 48000),
                  Matroska.uint(ElementId.CHANNELS, 2)))));
      expect(header.tracks[0].sampleRate).toBe(24000);
      expect(header.tracks[0].outputSampleRate).toBe(48000);
      expect(header.tracks[0].channels).toBe(2);
    });

    describe('Dolby Vision', () => {
      const record = new Uint8Array(24);
      record.set([1, 0, 8 << 1, (3 << 3) | 0x05, 0x10]);

      /**
       * @param {number} type
       * @return {!Uint8Array}
       */
      const mapping = (type) => {
        return Matroska.element(ElementId.BLOCK_ADDITION_MAPPING,
            Matroska.uint(ElementId.BLOCK_ADD_ID_TYPE, type),
            Matroska.element(ElementId.BLOCK_ADD_ID_EXTRA_DATA, record));
      };

      it('reads the record of a dvvC mapping', () => {
        const track = parseTrack(mapping(shaka.mkv.BlockAddType.DVVC));
        expect(Array.from(/** @type {!Uint8Array} */(track.dolbyVisionConfig)))
            .toEqual(Array.from(record));
      });

      it('reads the record of a dvcC mapping', () => {
        const track = parseTrack(mapping(shaka.mkv.BlockAddType.DVCC));
        expect(track.dolbyVisionConfig).not.toBe(null);
      });

      it('ignores the mappings of other types', () => {
        // 'hvcC'.
        const track = parseTrack(mapping(0x68766343));
        expect(track.dolbyVisionConfig).toBe(null);
      });
    });

    describe('content encodings', () => {
      /**
       * @param {number} algorithm
       * @param {number=} scope
       * @param {number=} type
       * @return {!Uint8Array}
       */
      const encoding = (algorithm, scope = 1, type = 0) => {
        return Matroska.element(ElementId.CONTENT_ENCODINGS,
            Matroska.element(ElementId.CONTENT_ENCODING,
                Matroska.uint(ElementId.CONTENT_ENCODING_SCOPE, scope),
                Matroska.uint(ElementId.CONTENT_ENCODING_TYPE, type),
                Matroska.element(ElementId.CONTENT_COMPRESSION,
                    Matroska.uint(ElementId.CONTENT_COMP_ALGO, algorithm),
                    Matroska.element(ElementId.CONTENT_COMP_SETTINGS,
                        new Uint8Array([0xaa, 0xbb])))));
      };

      it('reads a stripped header', () => {
        const track = parseTrack(
            encoding(shaka.mkv.ContentCompression.HEADER_STRIPPING));
        expect(Array.from(/** @type {!Uint8Array} */(track.strippedHeader)))
            .toEqual([0xaa, 0xbb]);
        expect(track.unsupportedEncoding).toBe(false);
      });

      it('marks compression it cannot undo', () => {
        // zlib.
        const track = parseTrack(encoding(0));
        expect(track.strippedHeader).toBe(null);
        expect(track.unsupportedEncoding).toBe(true);
      });

      it('marks an encoding that is not for the frames', () => {
        // Header stripping of the CodecPrivate only.
        const track = parseTrack(encoding(
            shaka.mkv.ContentCompression.HEADER_STRIPPING, /* scope= */ 2));
        expect(track.unsupportedEncoding).toBe(true);
      });

      it('marks encryption', () => {
        const track = parseTrack(encoding(
            shaka.mkv.ContentCompression.HEADER_STRIPPING, 1, /* type= */ 1));
        expect(track.unsupportedEncoding).toBe(true);
      });
    });
  });

  describe('getInitEndOffset', () => {
    it('ends the initialization segment of each track at its entry', () => {
      const header = MatroskaIndexParser.parseHeader(
          multitrack.subarray(0, HEADER_SIZE));
      const ends = header.tracks.map((track) => {
        return MatroskaIndexParser.getInitEndOffset(header, track);
      });
      // Each one is different and inside the header.
      expect(new Set(ends).size).toBe(header.tracks.length);
      expect(ends).toEqual(ends.slice().sort((a, b) => a - b));
      expect(ends[ends.length - 1]).toBeLessThan(
          /** @type {number} */(header.firstClusterOffset));
    });

    it('is enough to tell what the track is', () => {
      const whole = MatroskaIndexParser.parseHeader(
          multitrack.subarray(0, HEADER_SIZE));
      for (const track of whole.tracks) {
        const end = MatroskaIndexParser.getInitEndOffset(whole, track);
        const header = MatroskaIndexParser.parseHeader(
            multitrack.subarray(0, end + 1));
        const last = header.tracks[header.tracks.length - 1];
        expect(last.number).toBe(track.number);
        expect(last.codecId).toBe(track.codecId);
        expect(header.timecodeScale).toBe(whole.timecodeScale);
      }
    });

    it('still says what the track is with one more byte', () => {
      // The first byte of the element that follows.  It is not enough for an
      // element, so the header is read as it is without it.
      const whole = MatroskaIndexParser.parseHeader(
          multitrack.subarray(0, HEADER_SIZE));
      for (const track of whole.tracks) {
        const end = MatroskaIndexParser.getInitEndOffset(whole, track);
        const header = MatroskaIndexParser.parseHeader(
            multitrack.subarray(0, end + 2));
        const last = header.tracks[header.tracks.length - 1];
        expect(last.number).toBe(track.number);
        expect(header.tracks.length).toBe(whole.tracks.indexOf(track) + 1);
      }
    });

    it('includes the Info when it follows the tracks', () => {
      const info = Matroska.element(ElementId.INFO,
          Matroska.uint(ElementId.TIMECODE_SCALE, 250000));
      const data = shaka.util.Uint8ArrayUtils.concat(
          Matroska.element(ElementId.EBML,
              Matroska.string(ElementId.DOC_TYPE, 'matroska')),
          Matroska.unknownSizeElement(ElementId.SEGMENT,
              Matroska.element(ElementId.TRACKS, Matroska.trackEntry(
                  1, TrackType.VIDEO, CodecId.AVC)),
              info, Matroska.cluster(0)));
      const header = MatroskaIndexParser.parseHeader(data);
      const end = MatroskaIndexParser.getInitEndOffset(
          header, header.tracks[0]);
      expect(end + 1).toBe(header.firstClusterOffset);
      expect(MatroskaIndexParser.parseHeader(data.subarray(0, end + 1))
          .timecodeScale).toBe(250000);
    });
  });

  describe('parseCues', () => {
    it('reads the time, track and position of each point', () => {
      const header = MatroskaIndexParser.parseHeader(
          multitrack.subarray(0, HEADER_SIZE));
      const cues = MatroskaIndexParser.parseCues(
          multitrack.subarray(/** @type {number} */(header.cuesOffset)),
          header.segmentOffset, header.timecodeScale);
      const video = cues.filter((cue) => cue.track == 1);
      // The video has a keyframe every 1.5 seconds, and lasts 3.
      expect(video.map((cue) => cue.time)).toEqual([0, 1.5]);
      expect(video[0].offset).toBe(header.firstClusterOffset);
      expect(video[1].offset).toBeGreaterThan(video[0].offset);
    });

    it('needs the whole element', () => {
      const header = MatroskaIndexParser.parseHeader(
          multitrack.subarray(0, HEADER_SIZE));
      const start = /** @type {number} */(header.cuesOffset);
      expect(() => MatroskaIndexParser.parseCues(
          multitrack.subarray(start, start + 8),
          header.segmentOffset, header.timecodeScale)).toThrow();
    });
  });

  describe('getElementLength', () => {
    it('gives the length of an element from its first bytes', () => {
      const header = MatroskaIndexParser.parseHeader(
          multitrack.subarray(0, HEADER_SIZE));
      const start = /** @type {number} */(header.cuesOffset);
      const length = MatroskaIndexParser.getElementLength(
          multitrack.subarray(start, start + 16), ElementId.CUES);
      expect(start + length).toBeLessThanOrEqual(multitrack.length);
      // The Cues are the last element of the file.
      expect(start + length).toBe(multitrack.length);
    });

    it('rejects another element', () => {
      expect(() => MatroskaIndexParser.getElementLength(
          multitrack.subarray(0, 16), ElementId.CUES)).toThrow();
    });

    it('rejects a size that is unknown', () => {
      expect(() => MatroskaIndexParser.getElementLength(
          Matroska.unknownSizeElement(ElementId.CUES), ElementId.CUES))
          .toThrow();
    });
  });

  describe('parseChapters', () => {
    it('reads the titles, times and languages', async () => {
      const bytes = await Matroska.fetchAsset('avc-aac-srt.mkv');
      const header = MatroskaIndexParser.parseHeader(
          bytes.subarray(0, HEADER_SIZE));
      const start = /** @type {number} */(header.chaptersOffset);
      const length = MatroskaIndexParser.getElementLength(
          bytes.subarray(start, start + 16), ElementId.CHAPTERS);
      const chapters = MatroskaIndexParser.parseChapters(
          bytes.subarray(start, start + length));
      expect(chapters.map((chapter) => chapter.title)).toEqual(
          ['Opening', 'Ending']);
      expect(chapters[0].start).toBe(0);
      expect(chapters[1].start).toBe(2);
    });

    it('reads the chapters that are nested', () => {
      const atom = (start, title, ...children) => {
        return Matroska.element(ElementId.CHAPTER_ATOM,
            Matroska.uint(ElementId.CHAPTER_TIME_START, start * 1e9),
            Matroska.element(ElementId.CHAPTER_DISPLAY,
                Matroska.string(ElementId.CHAP_STRING, title),
                Matroska.string(ElementId.CHAP_LANGUAGE, 'eng')),
            ...children);
      };
      const data = Matroska.element(ElementId.CHAPTERS,
          Matroska.element(ElementId.EDITION_ENTRY,
              atom(0, 'Part 1', atom(1, 'Scene 1'), atom(2, 'Scene 2')),
              atom(5, 'Part 2')));
      const chapters = MatroskaIndexParser.parseChapters(data);
      expect(chapters.map((chapter) => chapter.title)).toEqual(
          ['Part 1', 'Scene 1', 'Scene 2', 'Part 2']);
    });
  });
});
