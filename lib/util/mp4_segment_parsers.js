/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.Mp4SegmentParsers');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.util.Mp4Parser');
goog.require('shaka.util.Mp4BoxParsers');

shaka.util.Mp4SegmentParsers = class {
  /**
   * Parses track timescales from an init segment.
   *
   * @param {BufferSource} initSegment
   * @return {!Map<number, number>} trackId to timescale map
   */
  static parseTrackTimescales(initSegment) {
    const Mp4Parser = shaka.util.Mp4Parser;
    const trackIds = [];
    const timescales = [];

    new Mp4Parser()
        .box('moov', Mp4Parser.children)
        .box('mvex', Mp4Parser.children)
        .fullBox('trex', (box) => {
          const parsedTREXBox = shaka.util.Mp4BoxParsers.parseTREX(
              box.reader);

          this.defaultSampleDuration_ = parsedTREXBox.defaultSampleDuration;
          this.defaultSampleSize_ = parsedTREXBox.defaultSampleSize;
        })
        .box('trak', Mp4Parser.children)
        .fullBox('tkhd', (box) => {
          goog.asserts.assert(
              box.version != null,
              'TKHD is a full box and should have a valid version.');
          const parsedTKHDBox = shaka.util.Mp4BoxParsers.parseTKHD(
              box.reader, box.version);
          trackIds.push(parsedTKHDBox.trackId);
        })
        .box('mdia', Mp4Parser.children)
        .fullBox('mdhd', (box) => {
          goog.asserts.assert(
              box.version != null,
              'MDHD is a full box and should have a valid version.');
          const parsedMDHDBox = shaka.util.Mp4BoxParsers.parseMDHD(
              box.reader, box.version);
          timescales.push(parsedMDHDBox.timescale);
        })
        .parse(initSegment, /* partialOkay= */ true);

    const trackIdToTimescale = new Map();

    // At least one track should exist, and each track should have a
    // corresponding Id in TKHD box, and timescale in its MDHD box
    if (!trackIds.length || !timescales.length ||
        trackIds.length != timescales.length) {
      return trackIdToTimescale;
    }

    // Populate the map from track Id to timescale
    trackIds.forEach((trackId, idx) => {
      trackIdToTimescale.set(trackId, timescales[idx]);
    });

    return trackIdToTimescale;
  }

  /**
   * Parses the baseMediaDecodeTime from a media segment and converts 
   * to seconds using trackTimescale, that may be obtained by a previous
   * call to `parseTrackTimescales`.
   *
   * @param {BufferSource} segmentData
   * @param {Map<number,number>} trackTimescales
   * @return {number} base media decode time in seconds
   */
   static parseBaseMediaDecodeTime(segmentData, trackTimescales) {
    const Mp4Parser = shaka.util.Mp4Parser;

    // Fields that are found in MOOF boxes
    let baseMediaDecodeTime = 0;
    let trackId = 0;

    new Mp4Parser()
        .box('moof', Mp4Parser.children)
        .box('traf', Mp4Parser.children)
        .fullBox('tfhd', (box) => {
          if (box.flags !== null) {
            const parsedTFHD = shaka.util.Mp4BoxParsers.parseTFHD(
                box.reader, box.flags);
            trackId = parsedTFHD.trackId;
          }
        })
        .fullBox('tfdt', (box) => {
          if (box.version !== null) {
            const parsedTFDT = shaka.util.Mp4BoxParsers.parseTFDT(
                box.reader, box.version);
            baseMediaDecodeTime = parsedTFDT.baseMediaDecodeTime;
          }
        })
        .parse(segmentData, /* partialOkay= */ false);

    let timescale = 1;
    if (trackTimescales.has(trackId)) {
      timescale = trackTimescales.get(trackId);
    }
    const baseMediaDecodeTimeSec = baseMediaDecodeTime / timescale;
    shaka.log.v2('parseBaseMediaDecodeTime()',
        'trackId', trackId,
        'timescale', timescale,
        'baseMediaDecodeTime', baseMediaDecodeTime,
        'baseMediaDecodeTimeSec', baseMediaDecodeTimeSec);

    return baseMediaDecodeTimeSec;
  }
};
