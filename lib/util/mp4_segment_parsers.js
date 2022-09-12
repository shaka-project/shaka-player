/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.Mp4SegmentParsers');

goog.require('goog.asserts');
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
};
