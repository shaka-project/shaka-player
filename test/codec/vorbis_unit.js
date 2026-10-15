/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.require('shaka.codec.Vorbis');
goog.require('shaka.mkv.CodecId');
goog.require('shaka.mkv.MatroskaClusterParser');
goog.require('shaka.mkv.MatroskaIndexParser');

describe('Vorbis', () => {
  const Vorbis = shaka.codec.Vorbis;
  const Matroska = shaka.test.Matroska;

  /** @type {!Uint8Array} */
  let bytes;
  /** @type {shaka.mkv.MatroskaIndexParser.Header} */
  let header;
  /** @type {!shaka.mkv.MatroskaIndexParser.Track} */
  let track;

  beforeAll(async () => {
    bytes = await Matroska.fetchAsset('multitrack.mkv');
    header = shaka.mkv.MatroskaIndexParser.parseHeader(
        bytes.subarray(0, 8192));
    track = /** @type {!shaka.mkv.MatroskaIndexParser.Track} */(
      header.tracks.find((entry) => {
        return entry.codecId == shaka.mkv.CodecId.VORBIS;
      }));
  });

  /** @return {shaka.codec.Vorbis.Info} */
  const getInfo = () => {
    return /** @type {shaka.codec.Vorbis.Info} */(Vorbis.parseHeaders(
        /** @type {!Uint8Array} */(track.codecPrivate)));
  };

  describe('parseHeaders', () => {
    it('reads the window sizes and the modes', () => {
      const info = getInfo();
      // The small and the large window: this encoder makes both 2048.
      expect(info.blockSizes.length).toBe(2);
      expect(info.blockSizes[0]).toBeLessThanOrEqual(info.blockSizes[1]);
      expect(info.blockSizes[0]).toBeGreaterThanOrEqual(64);
      expect(info.modeBlockFlags.length).toBeGreaterThan(0);
      for (const flag of info.modeBlockFlags) {
        expect([0, 1]).toContain(flag);
      }
      expect(info.modeBits).toBe(info.modeBlockFlags.length > 1 ? 1 : 0);
    });

    it('rejects data that is not the headers of Vorbis', () => {
      expect(Vorbis.parseHeaders(new Uint8Array(0))).toBe(null);
      expect(Vorbis.parseHeaders(new Uint8Array([2, 1, 1, 1]))).toBe(null);
      // Three headers announced, but they are shorter than said.
      expect(Vorbis.parseHeaders(new Uint8Array([2, 200, 200, 1, 2, 3])))
          .toBe(null);
    });
  });

  describe('getWindowSize', () => {
    it('is 0 for a header packet or nothing', () => {
      const info = getInfo();
      expect(Vorbis.getWindowSize(info, new Uint8Array([1, 2, 3]))).toBe(0);
      expect(Vorbis.getWindowSize(info, new Uint8Array(0))).toBe(0);
    });
  });

  describe('getAdvance', () => {
    it('is a quarter of the two windows', () => {
      expect(Vorbis.getAdvance(2048, 2048)).toBe(1024);
      expect(Vorbis.getAdvance(256, 2048)).toBe(576);
      expect(Vorbis.getAdvance(256, 256)).toBe(128);
    });
  });

  it('gives the times that the muxer wrote for the packets', () => {
    // Each block of this file has one packet, and its time is the one the
    // muxer computed from the same rules; accumulating the advances from the
    // first packet must agree with them, but for the millisecond they round to.
    const info = getInfo();
    const segments = Matroska.getSegments(bytes, header);
    const frames = shaka.mkv.MatroskaClusterParser.parseFrames(
        segments[0].data, track, header.timecodeScale);
    expect(frames.length).toBeGreaterThan(5);

    let time = frames[0].time;
    let previous = Vorbis.getWindowSize(info, frames[0].data);
    let checked = 0;
    for (let i = 1; i < frames.length; i++) {
      const window = Vorbis.getWindowSize(info, frames[i].data);
      expect(window).toBeGreaterThan(0);
      time += Vorbis.getAdvance(previous, window) /
      /** @type {number} */(track.sampleRate);
      previous = window;
      // The samples are 1/8000 s, and the file has milliseconds.
      expect(Math.abs(time - frames[i].time)).toBeLessThan(0.0015);
      checked++;
    }
    expect(checked).toBeGreaterThan(5);
  });
});
