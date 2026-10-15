/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.require('shaka.mkv.MatroskaClusterParser');
goog.require('shaka.mkv.MatroskaIndexParser');
goog.require('shaka.mkv.TrackType');
goog.require('shaka.util.WebmGenerator');
goog.require('shaka.util.Uint8ArrayUtils');

describe('WebmGenerator', () => {
  const MatroskaClusterParser = shaka.mkv.MatroskaClusterParser;
  const MatroskaIndexParser = shaka.mkv.MatroskaIndexParser;
  const TrackType = shaka.mkv.TrackType;
  const WebmGenerator = shaka.util.WebmGenerator;

  /**
   * @param {!Object} overrides
   * @return {shaka.util.WebmGenerator.StreamInfo}
   */
  const makeInfo = (overrides) => {
    return /** @type {shaka.util.WebmGenerator.StreamInfo} */(
      Object.assign({
        trackNumber: 2,
        type: TrackType.VIDEO,
        codecId: 'V_VP8',
        codecPrivate: null,
        timecodeScale: 1000000,
        width: 640,
        height: 360,
        channelCount: 1,
        sampleRate: 0,
        frames: [],
      }, overrides));
  };

  /**
   * Reads what was written like a file: the initialization segment with the
   * media segment after it.
   *
   * @param {shaka.util.WebmGenerator.StreamInfo} info
   * @return {{header: shaka.mkv.MatroskaIndexParser.Header,
   *   frames: !Array<shaka.mkv.MatroskaClusterParser.Frame>,
   *   file: !Uint8Array}}
   */
  const readBack = (info) => {
    const generator = new WebmGenerator(info);
    const file = shaka.util.Uint8ArrayUtils.concat(
        generator.initSegment(), generator.segmentData());
    const header = MatroskaIndexParser.parseHeader(file);
    const frames = MatroskaClusterParser.parseFrames(
        file.subarray(/** @type {number} */(header.firstClusterOffset)),
        header.tracks[0], header.timecodeScale);
    return {header, frames, file};
  };

  const frame = (timecode, keyframe, ...bytes) => {
    return {timecode, keyframe, data: new Uint8Array(bytes)};
  };

  describe('initSegment', () => {
    it('is a WebM header with one track', () => {
      const {header} = readBack(makeInfo({}));
      expect(header.tracks.length).toBe(1);
      expect(header.timecodeScale).toBe(1000000);
    });

    it('writes the document type WebM', () => {
      const init = new WebmGenerator(makeInfo({})).initSegment();
      const text = Array.from(init.subarray(0, 60))
          .map((code) => String.fromCharCode(code)).join('');
      expect(text).toContain('webm');
      expect(text).not.toContain('matroska');
    });

    it('describes a video track', () => {
      const {header} = readBack(makeInfo({}));
      const track = header.tracks[0];
      expect(track.number).toBe(2);
      expect(track.type).toBe(TrackType.VIDEO);
      expect(track.codecId).toBe('V_VP8');
      expect(track.width).toBe(640);
      expect(track.height).toBe(360);
      expect(track.codecPrivate).toBe(null);
    });

    it('describes an audio track, with its codec private data', () => {
      const codecPrivate = new Uint8Array([2, 30, 40, 1, 2, 3]);
      const {header} = readBack(makeInfo({
        trackNumber: 1,
        type: TrackType.AUDIO,
        codecId: 'A_VORBIS',
        codecPrivate,
        channelCount: 2,
        sampleRate: 44100,
      }));
      const track = header.tracks[0];
      expect(track.type).toBe(TrackType.AUDIO);
      expect(track.codecId).toBe('A_VORBIS');
      expect(track.channels).toBe(2);
      expect(track.sampleRate).toBe(44100);
      expect(Array.from(/** @type {!Uint8Array} */(track.codecPrivate)))
          .toEqual(Array.from(codecPrivate));
    });

    it('has a Segment of unknown size, as it is not over', () => {
      const {header} = readBack(makeInfo({frames: [frame(0, true, 1)]}));
      // The header could be read, with media that follows it.
      expect(header.firstClusterOffset).not.toBe(null);
    });

    it('keeps the timecode scale', () => {
      const {header} = readBack(makeInfo({timecodeScale: 100000}));
      expect(header.timecodeScale).toBe(100000);
    });
  });

  describe('segmentData', () => {
    it('writes the frames with their times and data', () => {
      const {frames} = readBack(makeInfo({
        frames: [frame(1000, true, 1, 2, 3), frame(1040, false, 4, 5)],
      }));
      expect(frames.length).toBe(2);
      expect(frames[0].time).toBeCloseTo(1, 6);
      expect(Array.from(frames[0].data)).toEqual([1, 2, 3]);
      expect(frames[1].time).toBeCloseTo(1.04, 6);
      expect(Array.from(frames[1].data)).toEqual([4, 5]);
    });

    it('marks the keyframes of video', () => {
      const {frames} = readBack(makeInfo({
        frames: [frame(0, true, 1), frame(40, false, 2), frame(80, true, 3)],
      }));
      expect(frames.map((f) => f.keyframe)).toEqual([true, false, true]);
    });

    it('marks every block of audio as a keyframe', () => {
      const {frames} = readBack(makeInfo({
        type: TrackType.AUDIO,
        frames: [frame(0, false, 1), frame(20, false, 2)],
      }));
      expect(frames.map((f) => f.keyframe)).toEqual([true, true]);
    });

    it('starts a new Cluster when the times are too far apart', () => {
      // A block can be 32767 ticks from its Cluster at most.
      const {frames} = readBack(makeInfo({
        frames: [
          frame(0, true, 1),
          frame(20000, false, 2),
          frame(40000, false, 3),
          frame(100000, true, 4),
        ],
      }));
      expect(frames.map((f) => Math.round(f.time * 1000))).toEqual(
          [0, 20000, 40000, 100000]);
    });

    it('writes a track number that takes more than a byte', () => {
      const {frames} = readBack(makeInfo({
        trackNumber: 300,
        frames: [frame(0, true, 1)],
      }));
      expect(frames.length).toBe(1);
    });

    it('writes nothing for no frames', () => {
      const generator = new WebmGenerator(makeInfo({}));
      expect(generator.segmentData().length).toBe(0);
    });

    it('does not write a time that does not fit a block', () => {
      // Two blocks 30000 ticks apart still share a Cluster.
      const {frames} = readBack(makeInfo({
        frames: [frame(5, true, 1), frame(30005, false, 2)],
      }));
      expect(frames.map((f) => Math.round(f.time * 1000))).toEqual(
          [5, 30005]);
    });
  });
});
