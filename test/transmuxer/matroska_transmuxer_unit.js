/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.require('shaka.device.DeviceFactory');
goog.require('shaka.media.Capabilities');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.mkv.BlockAddType');
goog.require('shaka.mkv.BlockFlag');
goog.require('shaka.mkv.CodecId');
goog.require('shaka.mkv.ElementId');
goog.require('shaka.mkv.MatroskaClusterParser');
goog.require('shaka.mkv.MatroskaCodecs');
goog.require('shaka.mkv.MatroskaConstants');
goog.require('shaka.mkv.MatroskaIndexParser');
goog.require('shaka.transmuxer.MatroskaTransmuxer');
goog.require('shaka.mkv.TrackType');
goog.require('shaka.transmuxer.TransmuxerEngine');
goog.require('shaka.util.Error');
goog.require('shaka.util.Mp4BoxParsers');
goog.require('shaka.util.Mp4Parser');
goog.require('shaka.util.StreamUtils');
goog.require('shaka.util.Uint8ArrayUtils');

describe('MatroskaTransmuxer', () => {
  const BlockFlag = shaka.mkv.BlockFlag;
  const CodecId = shaka.mkv.CodecId;
  const MatroskaClusterParser = shaka.mkv.MatroskaClusterParser;
  const MatroskaCodecs = shaka.mkv.MatroskaCodecs;
  const MatroskaIndexParser = shaka.mkv.MatroskaIndexParser;
  const Matroska = shaka.test.Matroska;

  /**
   * @param {!Uint8Array} bytes
   * @param {shaka.mkv.MatroskaIndexParser.Header} fileHeader
   * @param {!shaka.mkv.MatroskaIndexParser.Track} track
   * @return {!Uint8Array}
   */
  const getInit = (bytes, fileHeader, track) => {
    return Matroska.getInit(bytes, fileHeader, track);
  };

  /**
   * @param {!Uint8Array} bytes
   * @param {shaka.mkv.MatroskaIndexParser.Header} fileHeader
   * @return {!Array<!shaka.test.Matroska.Segment>}
   */
  const getSegments = (bytes, fileHeader) => {
    return Matroska.getSegments(bytes, fileHeader);
  };
  const Mp4BoxParsers = shaka.util.Mp4BoxParsers;
  const Mp4Parser = shaka.util.Mp4Parser;
  const TrackType = shaka.mkv.TrackType;

  // The clock the video is written in.
  const VIDEO_TIMESCALE = 90000;

  // How much later than in the file the media is written.
  const SHIFT = shaka.mkv.MatroskaConstants.MEDIA_TIME_SHIFT;

  /** @type {!Uint8Array} */
  let multitrack;
  /** @type {shaka.mkv.MatroskaIndexParser.Header} */
  let header;
  /** @type {!shaka.transmuxer.MatroskaTransmuxer} */
  let transmuxer;

  beforeAll(async () => {
    multitrack = await Matroska.fetchAsset('multitrack.mkv');
    header = MatroskaIndexParser.parseHeader(multitrack.subarray(0, 8192));
  });

  beforeEach(() => {
    transmuxer = new shaka.transmuxer.MatroskaTransmuxer('video/x-matroska');
  });

  afterEach(() => {
    transmuxer.destroy();
  });

  /**
   * @param {shaka.mkv.MatroskaIndexParser.Header} fileHeader
   * @param {!shaka.mkv.MatroskaIndexParser.Track} track
   * @return {!shaka.extern.Stream}
   */
  const makeStream = (fileHeader, track) => {
    const type = MatroskaCodecs.getContentType(track);
    return shaka.util.StreamUtils.createStream({
      id: track.number,
      originalId: String(track.number),
      type,
      mimeType: type + '/x-matroska',
      codecs: MatroskaCodecs.getCodecs(track),
      width: track.width,
      height: track.height,
      channelsCount: track.channels,
      audioSamplingRate: track.sampleRate,
      language: 'und',
    });
  };

  /**
   * @param {number} number
   * @return {!shaka.mkv.MatroskaIndexParser.Track}
   */
  const getTrack = (number) => {
    return /** @type {!shaka.mkv.MatroskaIndexParser.Track} */(
      header.tracks.find((track) => track.number == number));
  };

  /**
   * @param {!Uint8Array} data
   * @return {!shaka.test.Matroska.Fragment}
   */
  const parseFragment = (data) => {
    const result = {baseMediaDecodeTime: -1, samples: []};
    new Mp4Parser()
        .box('moof', Mp4Parser.children)
        .box('traf', Mp4Parser.children)
        .fullBox('tfdt', (box) => {
          result.baseMediaDecodeTime = Mp4BoxParsers.parseTFDT(
              box.reader, /** @type {number} */(box.version))
              .baseMediaDecodeTime;
        })
        .fullBox('trun', (box) => {
          const trun = Mp4BoxParsers.parseTRUN(box.reader,
              /** @type {number} */(box.version),
              /** @type {number} */(box.flags));
          for (const sample of trun.sampleData) {
            result.samples.push({
              duration: sample.sampleDuration,
              size: sample.sampleSize,
              cts: sample.sampleCompositionTimeOffset,
            });
          }
        })
        .parse(data);
    return result;
  };

  /**
   * @param {!Uint8Array} init
   * @return {number} The timescale of the track.
   */
  const getTimescale = (init) => {
    let timescale = 0;
    new Mp4Parser()
        .box('moov', Mp4Parser.children)
        .box('trak', Mp4Parser.children)
        .box('mdia', Mp4Parser.children)
        .fullBox('mdhd', (box) => {
          timescale = Mp4BoxParsers.parseMDHD(
              box.reader, /** @type {number} */(box.version)).timescale;
        })
        .parse(init);
    return timescale;
  };

  /**
   * @param {!Uint8Array} data
   * @param {string} name A four-character box name.
   * @return {boolean} Whether the name is in the data.
   */
  const hasBox = (data, name) => {
    const codes = Array.from(name).map((char) => char.charCodeAt(0));
    for (let i = 0; i + codes.length <= data.length; i++) {
      if (codes.every((code, j) => data[i + j] == code)) {
        return true;
      }
    }
    return false;
  };

  /**
   * @param {!Uint8Array|shaka.extern.TransmuxerOutput} output
   * @return {shaka.extern.TransmuxerOutput}
   */
  const asOutput = (output) => {
    expect(ArrayBuffer.isView(output)).toBe(false);
    return /** @type {shaka.extern.TransmuxerOutput} */(output);
  };

  describe('isSupported', () => {
    it('supports the codecs that MP4 carries if the browser plays them', () => {
      const candidates = [
        'video/x-matroska; codecs="avc1.64001f"',
        'video/x-matroska; codecs="hvc1.2.4.L120.90"',
        'video/x-matroska; codecs="av01.0.08M.10"',
        'video/x-matroska; codecs="vp09.00.31.08.01"',
        'video/x-matroska; codecs="vp8"',
      ];
      for (const mimeType of candidates) {
        expect(transmuxer.isSupported(mimeType, 'video')).toBe(
            shaka.media.Capabilities.isTypeSupported(
                transmuxer.convertCodecs('video', mimeType)));
      }
      const audioTransmuxer = new shaka.transmuxer.MatroskaTransmuxer(
          'audio/x-matroska');
      for (const codec of ['mp4a.40.2', 'opus', 'ac-3', 'ec-3', 'mp3', 'flac',
        'vorbis']) {
        const mimeType = `audio/x-matroska; codecs="${codec}"`;
        expect(audioTransmuxer.isSupported(mimeType, 'audio')).toBe(
            shaka.media.Capabilities.isTypeSupported(
                audioTransmuxer.convertCodecs('audio', mimeType)));
      }
      audioTransmuxer.destroy();
    });

    it('does not support the codecs it cannot repackage', () => {
      for (const codec of ['vp9', 'mp2v', 'theora']) {
        expect(transmuxer.isSupported(
            `video/x-matroska; codecs="${codec}"`, 'video')).toBe(false);
      }
      const audioTransmuxer = new shaka.transmuxer.MatroskaTransmuxer(
          'audio/x-matroska');
      for (const codec of ['dtsc', 'dtse', 'pcm']) {
        expect(audioTransmuxer.isSupported(
            `audio/x-matroska; codecs="${codec}"`, 'audio')).toBe(false);
      }
      audioTransmuxer.destroy();
    });

    it('does not support another container or no codec', () => {
      expect(transmuxer.isSupported(
          'video/mp4; codecs="avc1.64001f"', 'video')).toBe(false);
      expect(transmuxer.isSupported('video/x-matroska', 'video')).toBe(false);
      // The audio and the video are transmuxed by different instances.
      expect(transmuxer.isSupported(
          'audio/x-matroska; codecs="opus"', 'audio')).toBe(false);
    });

    it('is found by the engine for the Matroska MIME types', () => {
      const TransmuxerEngine = shaka.transmuxer.TransmuxerEngine;
      expect(TransmuxerEngine.findTransmuxerPlugin('video/x-matroska'))
          .not.toBe(null);
      expect(TransmuxerEngine.findTransmuxerPlugin('audio/x-matroska'))
          .not.toBe(null);
    });
  });

  describe('convertCodecs', () => {
    it('changes the container to MP4', () => {
      expect(transmuxer.convertCodecs(
          'video', 'video/x-matroska; codecs="avc1.64001f"'))
          .toBe('video/mp4; codecs="avc1.64001f"');
    });

    it('changes the container of audio', () => {
      const audioTransmuxer = new shaka.transmuxer.MatroskaTransmuxer(
          'audio/x-matroska');
      expect(audioTransmuxer.convertCodecs(
          'audio', 'audio/x-matroska; codecs="mp4a.40.2"'))
          .toBe('audio/mp4; codecs="mp4a.40.2"');
      audioTransmuxer.destroy();
    });

    it('gives the codec that the platform needs for Dolby Digital', () => {
      const audioTransmuxer = new shaka.transmuxer.MatroskaTransmuxer(
          'audio/x-matroska');
      const device = shaka.device.DeviceFactory.getDevice();
      expect(audioTransmuxer.convertCodecs(
          'audio', 'audio/x-matroska; codecs="ac-3"')).toBe(
          device.requiresEC3InitSegments() ?
              'audio/mp4; codecs="ec-3"' : 'audio/mp4; codecs="ac-3"');
      audioTransmuxer.destroy();
    });

    it('gives WebM for the codecs that only WebM has', () => {
      expect(transmuxer.convertCodecs(
          'video', 'video/x-matroska; codecs="vp8"'))
          .toBe('video/webm; codecs="vp8"');
      const audioTransmuxer = new shaka.transmuxer.MatroskaTransmuxer(
          'audio/x-matroska');
      expect(audioTransmuxer.convertCodecs(
          'audio', 'audio/x-matroska; codecs="vorbis"'))
          .toBe('audio/webm; codecs="vorbis"');
      audioTransmuxer.destroy();
    });

    for (const rawSupported of [false, true]) {
      it('selects MP3 output with raw support ' + rawSupported, () => {
        spyOn(shaka.media.Capabilities, 'isTypeSupported').and.callFake(
            (type) => type == 'audio/mpeg' ? rawSupported : !rawSupported);
        const audio =
            new shaka.transmuxer.MatroskaTransmuxer('audio/x-matroska');
        const mimeType = 'audio/x-matroska; codecs="mp3"';
        expect(audio.convertCodecs('audio', mimeType)).toBe(rawSupported ?
            'audio/mpeg' : 'audio/mp4; codecs="mp3"');
        expect(audio.isSupported(mimeType, 'audio')).toBe(true);
        audio.destroy();
      });
    }

    it('gives MP4 for FLAC', () => {
      const audioTransmuxer = new shaka.transmuxer.MatroskaTransmuxer(
          'audio/x-matroska');
      expect(audioTransmuxer.convertCodecs(
          'audio', 'audio/x-matroska; codecs="flac"'))
          .toMatch(/^audio\/mp4; codecs="[fF][lL][aA][cC]"$/);
      audioTransmuxer.destroy();
    });

    it('leaves another MIME type as it is', () => {
      expect(transmuxer.convertCodecs(
          'video', 'video/mp4; codecs="avc1.64001f"'))
          .toBe('video/mp4; codecs="avc1.64001f"');
    });
  });

  describe('video', () => {
    /** @type {!shaka.mkv.MatroskaIndexParser.Track} */
    let track;
    /** @type {!shaka.extern.Stream} */
    let stream;
    /** @type {!Array<!shaka.test.Matroska.Segment>} */
    let segments;

    beforeEach(async () => {
      track = getTrack(1);
      stream = makeStream(header, track);
      segments = getSegments(multitrack, header);
      const init = await transmuxer.transmux(
          getInit(multitrack, header, track), stream, null, 4.5, 'video');
      // There is nothing to append for the initialization segment.
      expect(/** @type {!Uint8Array} */(init).byteLength).toBe(0);
    });

    it('produces the initialization segment with the first segment',
        async () => {
          const output = asOutput(await transmuxer.transmux(
              segments[0].data, stream, segments[0].reference, 4.5, 'video'));
          expect(output.init).not.toBe(null);
          const init = /** @type {!Uint8Array} */(output.init);
          expect(hasBox(init, 'ftyp')).toBe(true);
          expect(hasBox(init, 'moov')).toBe(true);
          expect(hasBox(init, 'avc1')).toBe(true);
          expect(hasBox(init, 'avcC')).toBe(true);
          expect(getTimescale(init)).toBe(VIDEO_TIMESCALE);
          expect(hasBox(output.data, 'moof')).toBe(true);
          expect(hasBox(output.data, 'mdat')).toBe(true);
        });

    it('produces it only once', async () => {
      await transmuxer.transmux(
          segments[0].data, stream, segments[0].reference, 4.5, 'video');
      const output = asOutput(await transmuxer.transmux(
          segments[1].data, stream, segments[1].reference, 4.5, 'video'));
      expect(output.init).toBe(null);
    });

    it('keeps every frame with its presentation time', async () => {
      const timescale = VIDEO_TIMESCALE;
      for (const segment of segments) {
        // eslint-disable-next-line no-await-in-loop
        const output = asOutput(await transmuxer.transmux(
            segment.data, stream, segment.reference, 4.5, 'video'));
        const fragment = parseFragment(output.data);
        const frames = MatroskaClusterParser.parseFrames(
            segment.data, track, header.timecodeScale);
        expect(fragment.samples.length).toBe(frames.length);
        expect(fragment.samples.length).toBeGreaterThan(10);

        let decodeTime = fragment.baseMediaDecodeTime;
        fragment.samples.forEach((sample, i) => {
          // The frame was not changed.
          expect(sample.size).toBe(frames[i].data.byteLength);
          // And it is presented when the file says, moved by the shift.
          expect(decodeTime + sample.cts).toBe(
              Math.round((frames[i].time + SHIFT) * timescale));
          decodeTime += sample.duration;
          expect(sample.duration).toBeGreaterThan(0);
        });
      }
    });

    it('never presents a frame before it is decoded', async () => {
      // Not even at the start of the file, where the frames that the encoder
      // reorders would have to be decoded before time 0.
      for (const segment of segments) {
        // eslint-disable-next-line no-await-in-loop
        const output = asOutput(await transmuxer.transmux(
            segment.data, stream, segment.reference, 4.5, 'video'));
        const fragment = parseFragment(output.data);
        for (const sample of fragment.samples) {
          expect(sample.cts).not.toBeLessThan(0);
        }
      }
    });

    it('decodes the frames at the times of the file', async () => {
      const output = asOutput(await transmuxer.transmux(
          segments[0].data, stream, segments[0].reference, 4.5, 'video'));
      const fragment = parseFragment(output.data);
      // The first frame is decoded at the start of the file, and presented
      // one shift later.
      expect(fragment.baseMediaDecodeTime).toBe(0);
      expect(fragment.samples[0].cts).toBe(SHIFT * VIDEO_TIMESCALE);
    });

    it('makes each segment start where the previous one ended', async () => {
      let expectedStart = null;
      for (const segment of segments) {
        // eslint-disable-next-line no-await-in-loop
        const output = asOutput(await transmuxer.transmux(
            segment.data, stream, segment.reference, 4.5, 'video'));
        const fragment = parseFragment(output.data);
        if (expectedStart != null) {
          expect(fragment.baseMediaDecodeTime).toBe(expectedStart);
        }
        expectedStart = fragment.baseMediaDecodeTime +
            fragment.samples.reduce((sum, sample) => {
              return sum + sample.duration;
            }, 0);
      }
    });

    it('does not chain segments that are far apart', async () => {
      // As after a seek: the second segment only.
      const output = asOutput(await transmuxer.transmux(
          segments[1].data, stream, segments[1].reference, 4.5, 'video'));
      const fragment = parseFragment(output.data);
      // It is decoded at the time of its first frame.
      const start = Math.round(
          segments[1].reference.startTime * VIDEO_TIMESCALE);
      expect(fragment.baseMediaDecodeTime).toBeLessThanOrEqual(start);
      expect(fragment.baseMediaDecodeTime).toBeGreaterThan(
          start - VIDEO_TIMESCALE / 2);
    });

    it('writes the sync flags of the frames', async () => {
      const output = asOutput(await transmuxer.transmux(
          segments[0].data, stream, segments[0].reference, 4.5, 'video'));
      const data = /** @type {!Uint8Array} */(output.data);
      // The sdtp box lists whether each sample depends on others: 2 for the
      // keyframe, 1 for the rest.
      const frames = MatroskaClusterParser.parseFrames(
          segments[0].data, track, header.timecodeScale);
      const sdtp = [];
      new Mp4Parser()
          .box('moof', Mp4Parser.children)
          .box('traf', Mp4Parser.children)
          .fullBox('sdtp', (box) => {
            while (box.reader.hasMoreData()) {
              sdtp.push(box.reader.readUint8() >> 4);
            }
          })
          .parse(data);
      expect(sdtp).toEqual(frames.map((frame) => frame.keyframe ? 2 : 1));
      expect(sdtp[0]).toBe(2);
    });

    it('returns nothing for a range without frames of the track', async () => {
      // The Cues, which follow the last Cluster.
      const start = /** @type {number} */(header.cuesOffset);
      const output = asOutput(await transmuxer.transmux(
          multitrack.subarray(start), stream, segments[0].reference, 4.5,
          'video'));
      expect(output.data.byteLength).toBe(0);
      expect(output.init).toBe(null);
    });

    it('rejects a range that is cut in the middle of a cluster', async () => {
      const cut = segments[0].data.subarray(0, 1000);
      await expectAsync(transmuxer.transmux(
          cut, stream, segments[0].reference, 4.5, 'video')).toBeRejected();
    });
  });

  describe('state', () => {
    it('needs the initialization segment of the track', async () => {
      const stream = makeStream(header, getTrack(1));
      const segments = getSegments(multitrack, header);
      const error = await transmuxer.transmux(segments[0].data, stream,
          segments[0].reference, 4.5, 'video').then(fail, (e) => e);
      expect(error.code).toBe(shaka.util.Error.Code.TRANSMUXING_FAILED);
      expect(error.category).toBe(shaka.util.Error.Category.MEDIA);
    });

    it('rejects a segment of a track it was not initialized with',
        async () => {
          const segments = getSegments(multitrack, header);
          const video = makeStream(header, getTrack(1));
          await transmuxer.transmux(
              getInit(multitrack, header, getTrack(1)), video, null, 4.5,
              'video');
          const other = makeStream(header, getTrack(2));
          const error = await transmuxer.transmux(segments[0].data, other,
              segments[0].reference, 4.5, 'audio').then(fail, (e) => e);
          expect(error.code).toBe(shaka.util.Error.Code.TRANSMUXING_FAILED);
        });

    it('rejects an initialization segment of another track', async () => {
      const stream = makeStream(header, getTrack(1));
      // A stream whose track is not in the file.
      stream.id = 99;
      const error = await transmuxer.transmux(
          getInit(multitrack, header, getTrack(1)), stream, null, 4.5,
          'video').then(fail, (e) => e);
      expect(error.code).toBe(shaka.util.Error.Code.TRANSMUXING_FAILED);
    });

    it('forgets what it knew when it is initialized for another track',
        async () => {
          const segments = getSegments(multitrack, header);
          const audioTransmuxer = new shaka.transmuxer.MatroskaTransmuxer(
              'audio/x-matroska');
          const aac = getTrack(2);
          const opus = getTrack(3);
          const aacStream = makeStream(header, aac);
          const opusStream = makeStream(header, opus);

          await audioTransmuxer.transmux(
              getInit(multitrack, header, aac), aacStream, null, 4.5, 'audio');
          const first = asOutput(await audioTransmuxer.transmux(
              segments[0].data, aacStream, segments[0].reference, 4.5,
              'audio'));
          expect(hasBox(/** @type {!Uint8Array} */(first.init), 'mp4a'))
              .toBe(true);

          // The audio track changes: the new one gets its own initialization
          // segment, and the timeline of the previous one is not continued.
          await audioTransmuxer.transmux(getInit(multitrack, header, opus),
              opusStream, null, 4.5, 'audio');
          const second = asOutput(await audioTransmuxer.transmux(
              segments[1].data, opusStream, segments[1].reference, 4.5,
              'audio'));
          expect(hasBox(/** @type {!Uint8Array} */(second.init), 'Opus'))
              .toBe(true);
          audioTransmuxer.destroy();
        });

    it('can be destroyed at any time', () => {
      transmuxer.destroy();
      transmuxer.destroy();
    });
  });

  describe('audio', () => {
    /**
     * Converts the first two segments of an audio track.
     *
     * @param {number} number The track number.
     * @return {!Promise<{stream: !shaka.extern.Stream, track:
     *   !shaka.mkv.MatroskaIndexParser.Track, init: !Uint8Array, fragments:
     *   !Array<!shaka.test.Matroska.Fragment>, frames: !Array<!Array<
     *   shaka.mkv.MatroskaClusterParser.Frame>>}>}
     */
    const convert = async (number) => {
      const audioTransmuxer = new shaka.transmuxer.MatroskaTransmuxer(
          'audio/x-matroska');
      const track = getTrack(number);
      const stream = makeStream(header, track);
      await audioTransmuxer.transmux(
          getInit(multitrack, header, track), stream, null, 4.5, 'audio');
      const segments = getSegments(multitrack, header);
      let init = null;
      const fragments = [];
      const frames = [];
      for (const segment of segments) {
        // eslint-disable-next-line no-await-in-loop
        const output = asOutput(await audioTransmuxer.transmux(
            segment.data, stream, segment.reference, 4.5, 'audio'));
        if (output.init) {
          init = output.init;
        }
        fragments.push(parseFragment(output.data));
        frames.push(MatroskaClusterParser.parseFrames(
            segment.data, track, header.timecodeScale));
      }
      audioTransmuxer.destroy();
      return {stream, track, init: /** @type {!Uint8Array} */(init),
        fragments, frames};
    };

    /**
     * @param {{fragments: !Array<!shaka.test.Matroska.Fragment>,
     *   frames: !Array<!Array<shaka.mkv.MatroskaClusterParser.Frame>>}} result
     */
    const expectAllFrames = (result) => {
      expect(result.fragments.length).toBe(2);
      result.fragments.forEach((fragment, i) => {
        expect(fragment.samples.length).toBe(result.frames[i].length);
        expect(fragment.samples.length).toBeGreaterThan(5);
        fragment.samples.forEach((sample, j) => {
          expect(sample.size).toBe(result.frames[i][j].data.byteLength);
        });
      });
    };

    it('repackages AAC', async () => {
      const result = await convert(2);
      expect(hasBox(result.init, 'mp4a')).toBe(true);
      expect(hasBox(result.init, 'esds')).toBe(true);
      expect(getTimescale(result.init)).toBe(48000);
      expectAllFrames(result);
      // 1024 samples per frame.
      for (const sample of result.fragments[0].samples) {
        expect(sample.duration).toBe(1024);
      }
    });

    it('repackages Opus', async () => {
      const result = await convert(3);
      expect(hasBox(result.init, 'Opus')).toBe(true);
      expect(hasBox(result.init, 'dOps')).toBe(true);
      // Opus is always at 48 kHz.
      expect(getTimescale(result.init)).toBe(48000);
      expectAllFrames(result);
      // The durations come from the packets: 20 ms is 960 samples.
      for (const sample of result.fragments[0].samples) {
        expect(sample.duration % 120).toBe(0);
      }
      const total = result.fragments[0].samples.reduce((sum, sample) => {
        return sum + sample.duration;
      }, 0);
      // The audio of a segment covers about the time of its frames.
      expect(total / 48000).toBeGreaterThan(1);
      expect(total / 48000).toBeLessThan(2);
    });

    it('repackages MP3 in MP4 when raw MPEG audio is unavailable', async () => {
      spyOn(shaka.media.Capabilities, 'isTypeSupported').and.returnValue(false);
      const result = await convert(4);
      expect(hasBox(result.init, '.mp3')).toBe(true);
      // The rate of this file, not 48 kHz.
      expect(getTimescale(result.init)).toBe(44100);
      expectAllFrames(result);
      // An MPEG-1 Layer III frame has 1152 samples.
      for (const sample of result.fragments[0].samples) {
        expect(sample.duration).toBe(1152);
      }
      expect(result.stream.audioSamplingRate).toBe(44100);
    });

    it('extracts all MP3 frames when raw MPEG audio is supported', async () => {
      spyOn(shaka.media.Capabilities, 'isTypeSupported')
          .and.callFake((type) => type == 'audio/mpeg');
      const track = getTrack(4);
      const stream = makeStream(header, track);
      await transmuxer.transmux(
          getInit(multitrack, header, track), stream, null, 4.5, 'audio');
      for (const segment of getSegments(multitrack, header)) {
        // eslint-disable-next-line no-await-in-loop
        const result = asOutput(await transmuxer.transmux(
            segment.data, stream, segment.reference, 4.5, 'audio'));
        const frames = MatroskaClusterParser.parseFrames(
            segment.data, track, header.timecodeScale);
        expect(result.init).toBeNull();
        expect(result.data).toEqual(shaka.util.Uint8ArrayUtils.concatRange(
            frames.map((frame) => frame.data)));
      }
      expect(stream.audioSamplingRate).toBe(44100);
      expect(stream.channelsCount).toBe(1);
    });

    it('repackages Dolby Digital', async () => {
      const result = await convert(5);
      const device = shaka.device.DeviceFactory.getDevice();
      expect(hasBox(result.init, device.requiresEC3InitSegments() ?
          'dec3' : 'dac3')).toBe(true);
      expect(getTimescale(result.init)).toBe(48000);
      expectAllFrames(result);
      for (const sample of result.fragments[0].samples) {
        expect(sample.duration).toBe(1536);
      }
      // What the first frame says.
      expect(result.stream.audioSamplingRate).toBe(48000);
      expect(result.stream.channelsCount).toBe(1);
    });

    it('repackages Dolby Digital Plus', async () => {
      const result = await convert(6);
      expect(hasBox(result.init, 'dec3')).toBe(true);
      expect(getTimescale(result.init)).toBe(48000);
      expectAllFrames(result);
      for (const sample of result.fragments[0].samples) {
        expect(sample.duration).toBe(1536);
      }
    });

    it('makes each segment start where the previous one ended', async () => {
      for (const number of [2, 3, 4, 5, 6]) {
        // eslint-disable-next-line no-await-in-loop
        const result = await convert(number);
        const first = result.fragments[0];
        const end = first.baseMediaDecodeTime + first.samples.reduce(
            (sum, sample) => sum + sample.duration, 0);
        expect(result.fragments[1].baseMediaDecodeTime).toBe(end);
      }
    });

    it('starts the audio where the file says', async () => {
      const result = await convert(2);
      expect(result.fragments[0].baseMediaDecodeTime).toBe(Math.round(
          (result.frames[0][0].time + SHIFT) * 48000));
    });

    it('repackages FLAC', async () => {
      const result = await convert(7);
      expect(hasBox(result.init, 'fLaC')).toBe(true);
      expect(hasBox(result.init, 'dfLa')).toBe(true);
      // The rate of this file.
      expect(getTimescale(result.init)).toBe(8000);
      expectAllFrames(result);
      const total = result.fragments[0].samples.reduce((sum, sample) => {
        return sum + sample.duration;
      }, 0);
      // The frames say how many samples they have: they add up to about the
      // 1.5 seconds of the segment.
      expect(total / 8000).toBeGreaterThan(1);
      expect(total / 8000).toBeLessThan(2);
      expect(result.stream.audioSamplingRate).toBe(8000);
      expect(result.stream.channelsCount).toBe(1);
    });

    it('rejects a codec it does not repackage', async () => {
      const audioTransmuxer = new shaka.transmuxer.MatroskaTransmuxer(
          'audio/x-matroska');
      const file = Matroska.makeFile(Matroska.trackEntry(
          1, TrackType.AUDIO, 'A_DTS'));
      const fileHeader = MatroskaIndexParser.parseHeader(file);
      const firstCluster = /** @type {number} */(
        fileHeader.firstClusterOffset);
      const stream = shaka.util.StreamUtils.createStream({
        id: 1, type: 'audio', mimeType: 'audio/x-matroska', codecs: 'dtsc',
        language: 'und',
      });
      await audioTransmuxer.transmux(
          file.subarray(0, firstCluster), stream, null, 1, 'audio');
      const cluster = Matroska.cluster(0,
          Matroska.simpleBlock(1, 0, BlockFlag.KEYFRAME, new Uint8Array(20)));
      const reference = new shaka.media.SegmentReference(
          0, 1, () => ['uri'], 0, null, null, 0, 0, Infinity);
      await expectAsync(audioTransmuxer.transmux(
          cluster, stream, reference, 1, 'audio')).toBeRejected();
      audioTransmuxer.destroy();
    });
  });

  describe('WebM', () => {
    /**
     * Converts the segments of a track and reads what was written.
     *
     * @param {!Uint8Array} bytes
     * @param {shaka.mkv.MatroskaIndexParser.Header} fileHeader
     * @param {!shaka.mkv.MatroskaIndexParser.Track} track
     * @param {string} mimeType
     * @return {!Promise<{init: !Uint8Array, output:
     *   !Array<shaka.extern.TransmuxerOutput>, written:
     *   !shaka.mkv.MatroskaIndexParser.Header, frames:
     *   !Array<shaka.mkv.MatroskaClusterParser.Frame>,
     *   original: !Array<shaka.mkv.MatroskaClusterParser.Frame>}>}
     */
    const convertToWebm = async (bytes, fileHeader, track, mimeType) => {
      const webmTransmuxer = new shaka.transmuxer.MatroskaTransmuxer(mimeType);
      const stream = makeStream(fileHeader, track);
      const type = /** @type {string} */(
        MatroskaCodecs.getContentType(track));
      await webmTransmuxer.transmux(getInit(bytes, fileHeader, track), stream,
          null, 3, type);
      const output = [];
      const original = [];
      let init = null;
      const written = [];
      for (const segment of getSegments(bytes, fileHeader)) {
        // eslint-disable-next-line no-await-in-loop
        const result = asOutput(await webmTransmuxer.transmux(segment.data,
            stream, segment.reference, 3, type));
        output.push(result);
        if (result.init) {
          init = result.init;
        }
        written.push(result.data);
        original.push(...MatroskaClusterParser.parseFrames(
            segment.data, track, fileHeader.timecodeScale));
      }
      webmTransmuxer.destroy();
      // The initialization segment is the beginning of a file that has the
      // written media after it, so it can be read like one.
      const file = shaka.util.Uint8ArrayUtils.concat(
          /** @type {!Uint8Array} */(init), ...written);
      const writtenHeader = MatroskaIndexParser.parseHeader(file);
      const firstCluster = /** @type {number} */(
        writtenHeader.firstClusterOffset);
      const frames = MatroskaClusterParser.parseFrames(
          file.subarray(firstCluster), writtenHeader.tracks[0],
          writtenHeader.timecodeScale);
      return {init: /** @type {!Uint8Array} */(init), output,
        written: writtenHeader, frames, original};
    };

    it('repackages Vorbis', async () => {
      const track = getTrack(8);
      const result = await convertToWebm(
          multitrack, header, track, 'audio/x-matroska');
      // One initialization segment, with the first media segment.
      expect(result.output.map((output) => !!output.init))
          .toEqual([true, false]);
      const written = result.written.tracks[0];
      expect(written.codecId).toBe(CodecId.VORBIS);
      expect(written.type).toBe(TrackType.AUDIO);
      // The headers that configure the decoder are kept.
      expect(Array.from(/** @type {!Uint8Array} */(written.codecPrivate)))
          .toEqual(Array.from(/** @type {!Uint8Array} */(track.codecPrivate)));
      expect(written.sampleRate).toBe(8000);
      expect(written.channels).toBe(2);
    });

    it('keeps every frame and its time', async () => {
      const result = await convertToWebm(
          multitrack, header, getTrack(8), 'audio/x-matroska');
      expect(result.frames.length).toBe(result.original.length);
      expect(result.frames.length).toBeGreaterThan(10);
      result.frames.forEach((frame, i) => {
        expect(Array.from(frame.data)).toEqual(
            Array.from(result.original[i].data));
        // Moved by the shift, to the millisecond that WebM has.
        expect(frame.time).toBeCloseTo(result.original[i].time + SHIFT, 3);
      });
    });

    it('gives each packet of a laced block a block of its own', async () => {
      // A Vorbis block that laces three packets, like the muxers write them:
      // one time and one duration for the three.
      const codecPrivate = new Uint8Array([2, 30, 40, 1, 2, 3, 4]);
      const file = Matroska.makeFile(Matroska.trackEntry(
          1, TrackType.AUDIO, CodecId.VORBIS,
          Matroska.element(shaka.mkv.ElementId.CODEC_PRIVATE, codecPrivate),
          Matroska.element(shaka.mkv.ElementId.AUDIO,
              Matroska.float(shaka.mkv.ElementId.SAMPLING_FREQUENCY, 48000),
              Matroska.uint(shaka.mkv.ElementId.CHANNELS, 2))));
      const fileHeader = MatroskaIndexParser.parseHeader(file);
      const frames = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5]),
        new Uint8Array([6, 7, 8, 9])];
      const block = Matroska.element(shaka.mkv.ElementId.BLOCK_GROUP,
          Matroska.element(shaka.mkv.ElementId.BLOCK, Matroska.blockPayload(
              1, 20, shaka.mkv.Lacing.XIPH, new Uint8Array([2, 3, 2]),
              ...frames)),
          Matroska.uint(shaka.mkv.ElementId.BLOCK_DURATION, 60));
      const cluster = Matroska.cluster(5000, block);

      const webmTransmuxer = new shaka.transmuxer.MatroskaTransmuxer(
          'audio/x-matroska');
      const stream = makeStream(fileHeader, fileHeader.tracks[0]);
      const firstCluster = /** @type {number} */(
        fileHeader.firstClusterOffset);
      await webmTransmuxer.transmux(
          file.subarray(0, firstCluster), stream, null, 10, 'audio');
      const reference = new shaka.media.SegmentReference(
          5, 6, () => ['uri'], 0, null, null, 0, 0, Infinity);
      const output = asOutput(await webmTransmuxer.transmux(
          cluster, stream, reference, 10, 'audio'));
      webmTransmuxer.destroy();

      const written = shaka.util.Uint8ArrayUtils.concat(
          /** @type {!Uint8Array} */(output.init), output.data);
      const writtenHeader = MatroskaIndexParser.parseHeader(written);
      const track = writtenHeader.tracks[0];
      expect(Array.from(/** @type {!Uint8Array} */(track.codecPrivate)))
          .toEqual(Array.from(codecPrivate));
      const read = MatroskaClusterParser.parseFrames(
          written.subarray(
              /** @type {number} */(writtenHeader.firstClusterOffset)),
          track, writtenHeader.timecodeScale);
      expect(read.map((frame) => Array.from(frame.data)))
          .toEqual(frames.map((frame) => Array.from(frame)));
      // The three keep the time and duration the file gave them, one shift
      // later, instead of all having the time of the block.
      expect(read[0].time).toBeCloseTo(5.02 + SHIFT, 6);
      expect(read[1].time).toBeCloseTo(5.04 + SHIFT, 6);
      expect(read[2].time).toBeCloseTo(5.06 + SHIFT, 6);
    });

    it('gives the document type WebM', async () => {
      const result = await convertToWebm(
          multitrack, header, getTrack(8), 'audio/x-matroska');
      expect(hasBox(result.init.subarray(0, 40), 'webm')).toBe(true);
    });

    it('repackages VP8', async () => {
      const bytes = await Matroska.fetchAsset('vp8-vorbis-srt.mkv');
      // The header of the subtitle and Vorbis-carrying files is larger than a
      // fixed prefix, and the parser stops at the first Cluster anyway.
      const fileHeader = MatroskaIndexParser.parseHeader(bytes);
      const track = fileHeader.tracks[0];
      expect(track.codecId).toBe(CodecId.VP8);
      const result = await convertToWebm(
          bytes, fileHeader, track, 'video/x-matroska');
      const written = result.written.tracks[0];
      expect(written.codecId).toBe(CodecId.VP8);
      expect(written.type).toBe(TrackType.VIDEO);
      expect(written.width).toBe(160);
      expect(written.height).toBe(128);
      expect(result.frames.length).toBe(result.original.length);
      expect(result.frames.length).toBeGreaterThan(20);
      // The keyframes are still the only ones.
      expect(result.frames.map((frame) => frame.keyframe)).toEqual(
          result.original.map((frame) => frame.keyframe));
      expect(result.frames.filter((frame) => frame.keyframe).length)
          .toBe(4);
    });
  });

  describe('other video codecs', () => {
    /**
     * @param {string} name
     * @return {!Promise<{init: !Uint8Array, data: !Uint8Array,
     *   stream: !shaka.extern.Stream}>}
     */
    const convertFile = async (name) => {
      const bytes = await Matroska.fetchAsset(name);
      // The header of the subtitle and Vorbis-carrying files is larger than a
      // fixed prefix, and the parser stops at the first Cluster anyway.
      const fileHeader = MatroskaIndexParser.parseHeader(bytes);
      const track = /** @type {!shaka.mkv.MatroskaIndexParser.Track} */(
        fileHeader.tracks.find((entry) => entry.type == TrackType.VIDEO));
      const stream = makeStream(fileHeader, track);
      const segments = getSegments(bytes, fileHeader);
      await transmuxer.transmux(getInit(bytes, fileHeader, track), stream,
          null, 2, 'video');
      const output = asOutput(await transmuxer.transmux(segments[0].data,
          stream, segments[0].reference, 2, 'video'));
      return {
        init: /** @type {!Uint8Array} */(output.init),
        data: output.data,
        stream,
      };
    };

    it('repackages HEVC', async () => {
      const result = await convertFile('hevc-10bit-eac3.mkv');
      expect(hasBox(result.init, 'hvc1')).toBe(true);
      expect(hasBox(result.init, 'hvcC')).toBe(true);
    });

    it('repackages AV1', async () => {
      const result = await convertFile('av1-10bit-opus.mkv');
      expect(hasBox(result.init, 'av01')).toBe(true);
      expect(hasBox(result.init, 'av1C')).toBe(true);
      expect(parseFragment(result.data).samples.length).toBeGreaterThan(5);
    });

    it('repackages VP9', async () => {
      // The track has no CodecPrivate, so the configuration comes from the
      // codec string.
      const bytes = await Matroska.fetchAsset('index.mkv');
      const fileHeader = MatroskaIndexParser.parseHeader(
          bytes.subarray(0, 1024));
      const track = fileHeader.tracks[0];
      const stream = makeStream(fileHeader, track);
      stream.codecs = 'vp09.00.10.08.01';
      const segments = getSegments(bytes, fileHeader);
      await transmuxer.transmux(getInit(bytes, fileHeader, track), stream,
          null, 2, 'video');
      const output = asOutput(await transmuxer.transmux(segments[0].data,
          stream, segments[0].reference, 2, 'video'));
      const init = /** @type {!Uint8Array} */(output.init);
      expect(hasBox(init, 'vp09')).toBe(true);
      expect(hasBox(init, 'vpcC')).toBe(true);
      let profile = -1;
      let level = -1;
      new Mp4Parser()
          .box('moov', Mp4Parser.children)
          .box('trak', Mp4Parser.children)
          .box('mdia', Mp4Parser.children)
          .box('minf', Mp4Parser.children)
          .box('stbl', Mp4Parser.children)
          .fullBox('stsd', Mp4Parser.sampleDescription)
          .box('vp09', Mp4Parser.visualSampleEntry)
          .fullBox('vpcC', (box) => {
            profile = box.reader.readUint8();
            level = box.reader.readUint8();
          })
          .parse(init);
      expect(profile).toBe(0);
      expect(level).toBe(10);
    });
  });

  describe('Dolby Vision', () => {
    // Version 1.0, profile 8, level 3, RPU and base layer, HDR10 compatible.
    const record = new Uint8Array(24);
    record.set([1, 0, 8 << 1, (3 << 3) | 0x05, 0x10]);
    const hvcC = new Uint8Array(
        [1, 0x02, 0x20, 0, 0, 0, 0x90, 0, 0, 0, 0, 0, 120, 0xff, 0xe0, 0]);

    /**
     * @param {string} codecs
     * @param {number=} streamId
     * @return {!Promise<!Uint8Array>} The initialization segment.
     */
    const convert = async (codecs, streamId = 1) => {
      const file = Matroska.makeFile(Matroska.trackEntry(
          1, TrackType.VIDEO, CodecId.HEVC,
          Matroska.element(shaka.mkv.ElementId.CODEC_PRIVATE, hvcC),
          Matroska.element(shaka.mkv.ElementId.BLOCK_ADDITION_MAPPING,
              Matroska.uint(shaka.mkv.ElementId.BLOCK_ADD_ID_TYPE,
                  shaka.mkv.BlockAddType.DVVC),
              Matroska.element(
                  shaka.mkv.ElementId.BLOCK_ADD_ID_EXTRA_DATA, record))));
      const fileHeader = MatroskaIndexParser.parseHeader(file);
      const stream = shaka.util.StreamUtils.createStream({
        id: streamId, type: 'video', mimeType: 'video/x-matroska', codecs,
        width: 1920, height: 1080, language: 'und',
      });
      const firstCluster = /** @type {number} */(
        fileHeader.firstClusterOffset);
      await transmuxer.transmux(
          file.subarray(0, firstCluster), stream, null, 1, 'video');
      const cluster = Matroska.cluster(0,
          Matroska.simpleBlock(1, 0, BlockFlag.KEYFRAME, new Uint8Array(20)));
      const reference = new shaka.media.SegmentReference(
          0, 1, () => ['uri'], 0, null, null, 0, 0, Infinity);
      const output = asOutput(await transmuxer.transmux(
          cluster, stream, reference, 1, 'video'));
      return /** @type {!Uint8Array} */(output.init);
    };

    it('writes the Dolby Vision sample entry for a Dolby Vision stream',
        async () => {
          const init = await convert('dvh1.08.03');
          expect(hasBox(init, 'dvh1')).toBe(true);
          expect(hasBox(init, 'hvcC')).toBe(true);
          // Profile 8 is in a dvvC box.
          expect(hasBox(init, 'dvvC')).toBe(true);
          expect(hasBox(init, 'hvc1')).toBe(false);
        });

    it('writes the plain sample entry for the plain codec', async () => {
      // As the manifest parser says where the platform does not decode Dolby
      // Vision, even though the file has the record.
      const init = await convert('hvc1.2.4.L120.90');
      expect(hasBox(init, 'hvc1')).toBe(true);
      expect(hasBox(init, 'hvcC')).toBe(true);
      expect(hasBox(init, 'dvvC')).toBe(false);
      expect(hasBox(init, 'dvh1')).toBe(false);
    });

    it('finds the track of the second stream of a track', async () => {
      // As the manifest parser gives it an identifier of its own.
      const offset = shaka.mkv.MatroskaConstants.ALTERNATE_STREAM_ID_OFFSET;
      const init = await convert('dvh1.08.03', 1 + offset);
      expect(hasBox(init, 'dvh1')).toBe(true);
    });

    it('supports the codec strings of Dolby Vision', () => {
      expect(transmuxer.isSupported(
          'video/x-matroska; codecs="dvh1.08.03"', 'video')).toBe(
          shaka.media.Capabilities.isTypeSupported(
              'video/mp4; codecs="dvh1.08.03"'));
    });
  });

  describe('a frame that lasts alone', () => {
    it('lasts as long as the track says a frame does', async () => {
      const avcC = new Uint8Array([1, 0x64, 0x00, 0x1f, 0xff, 0xe0, 0x00]);
      const file = shaka.util.Uint8ArrayUtils.concat(
          Matroska.makeFile(Matroska.trackEntry(1, TrackType.VIDEO,
              CodecId.AVC,
              Matroska.element(shaka.mkv.ElementId.CODEC_PRIVATE, avcC),
              Matroska.uint(shaka.mkv.ElementId.DEFAULT_DURATION, 40000000),
              Matroska.element(shaka.mkv.ElementId.VIDEO,
                  Matroska.uint(shaka.mkv.ElementId.PIXEL_WIDTH, 720),
                  Matroska.uint(shaka.mkv.ElementId.PIXEL_HEIGHT, 480),
                  Matroska.uint(shaka.mkv.ElementId.DISPLAY_WIDTH, 853),
                  Matroska.uint(shaka.mkv.ElementId.DISPLAY_HEIGHT, 480)))));
      const fileHeader = MatroskaIndexParser.parseHeader(file);
      const track = fileHeader.tracks[0];
      const stream = makeStream(fileHeader, track);
      const firstCluster = /** @type {number} */(
        fileHeader.firstClusterOffset);
      await transmuxer.transmux(
          file.subarray(0, firstCluster), stream, null, 1, 'video');

      const cluster = Matroska.cluster(0,
          Matroska.simpleBlock(1, 0, BlockFlag.KEYFRAME, new Uint8Array(20)));
      const reference = new shaka.media.SegmentReference(
          0, 1, () => ['uri'], 0, null, null, 0, 0, Infinity);
      const output = asOutput(await transmuxer.transmux(
          cluster, stream, reference, 1, 'video'));
      const fragment = parseFragment(output.data);
      expect(fragment.samples.length).toBe(1);
      // 40 ms.
      expect(fragment.samples[0].duration).toBe(3600);
      // The pixels are not square: 853:720.
      expect(hasBox(/** @type {!Uint8Array} */(output.init), 'pasp'))
          .toBe(true);
    });
  });
});
