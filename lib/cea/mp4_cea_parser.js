/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.cea.Mp4CeaParser');

goog.require('goog.asserts');
goog.require('shaka.cea.CeaParser');
goog.require('shaka.cea.SeiProcessor');
goog.require('shaka.util.Mp4Parser');
goog.require('shaka.util.Mp4BoxParsers');
goog.require('shaka.util.DataViewReader');

/**
 * MPEG4 stream parser used for extracting 708 closed captions data.
 * @implements {shaka.cea.CeaParser}
 */
shaka.cea.Mp4CeaParser = class {
  constructor() {
    /**
     * SEI data processor.
     * @private @const {!shaka.cea.SeiProcessor}
     */
    this.seiProcessor_ = new shaka.cea.SeiProcessor();

    /**
     * Map of track id to corresponding timescale.
     * @private {!Object<number, number>}
     */
    this.trackIdToTimescale_ = {};

    /**
     * Default sample duration, as specified by the TREX box.
     * @private {!number}
     */
    this.defaultSampleDuration_ = 0;

    /**
     * Default sample size, as specified by the TREX box.
     * @private {!number}
     */
    this.defaultSampleSize_ = 0;
  }

  /**
   * Parses the init segment. Gets Default Sample Duration and Size from the
   * TREX box, and constructs a map of Track IDs to timescales. Each TRAK box
   * contains a track header (TKHD) containing track ID, and a media header box
   * (MDHD) containing the timescale for the track
   * @override
   */
  init(data) {
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
        .parse(data, /* partialOkay= */ true);

    // At least one track should exist, and each track should have a
    // corresponding Id in TKHD box, and timescale in its MDHD box
    if (trackIds.length <= 0 || timescales.length <= 0 ||
      trackIds.length != timescales.length) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_MP4_CEA);
    }

    // Populate the map from track Id to timescale
    trackIds.forEach((trackId, idx) => {
      this.trackIdToTimescale_[trackId] = timescales[idx];
    });
  }

  /**
   * Parses each video segment. In fragmented MP4s, MOOF and MDAT come in
   * pairs. The following logic gets the necessary info from MOOFs to parse
   * MDATs (base media decode time, sample sizes/offsets/durations, etc),
   * and then parses the MDAT boxes for CEA-708 packets using this information.
   * CEA-708 packets are returned in the callback.
   * @override
   */
  parse(data, on708Data) {
    const Mp4Parser = shaka.util.Mp4Parser;

    // Fields that are found in MOOF boxes
    let defaultSampleDuration = this.defaultSampleDuration_;
    let defaultSampleSize = this.defaultSampleSize_;
    let sampleData = [];
    let baseMediaDecodeTime = null;
    let timescale = shaka.cea.CeaParser.DEFAULT_TIMESCALE_VALUE;

    new Mp4Parser()
        .box('moof', Mp4Parser.children)
        .box('traf', Mp4Parser.children)
        .fullBox('trun', (box) => {
          goog.asserts.assert(
              box.version != null && box.flags!=null,
              'TRUN is a full box and should have a valid version & flags.');

          const parsedTRUN = shaka.util.Mp4BoxParsers.parseTRUN(
              box.reader, box.version, box.flags);

          sampleData = parsedTRUN.sampleData;
        })

        .fullBox('tfhd', (box) => {
          goog.asserts.assert(
              box.flags != null,
              'TFHD is a full box and should have valid flags.');

          const parsedTFHD = shaka.util.Mp4BoxParsers.parseTFHD(
              box.reader, box.flags);

          // If specified, defaultSampleDuration and defaultSampleSize
          // override the ones specified in the TREX box
          defaultSampleDuration = parsedTFHD.defaultSampleDuration
            || this.defaultSampleDuration_;

          defaultSampleSize = parsedTFHD.defaultSampleSize
            || this.defaultSampleSize_;

          const trackId = parsedTFHD.trackId;

          // Get the timescale from the track Id
          if (this.trackIdToTimescale_[trackId]) {
            timescale = this.trackIdToTimescale_[trackId];
          }
        })

        .fullBox('tfdt', (box) => {
          goog.asserts.assert(
              box.version != null,
              'TFDT is a full box and should have a valid version.');

          const parsedTFDT = shaka.util.Mp4BoxParsers.parseTFDT(
              box.reader, box.version);

          baseMediaDecodeTime = parsedTFDT.baseMediaDecodeTime;
        })
        .box('mdat', (box) => {
          this.parseMdat_(box.reader, baseMediaDecodeTime, timescale,
              defaultSampleDuration, defaultSampleSize, sampleData, on708Data);
        })
        .parse(data, /* partialOkay= */ false);
  }

  /**
   * Parse MDAT box.
   * @param {!shaka.util.DataViewReader} reader
   * @param {?number} time
   * @param {!number} timescale
   * @param {!number} defaultSampleDuration
   * @param {!number} defaultSampleSize
   * @param {!Array<shaka.util.ParsedTRUNSample>} sampleData
   * @param {function(!BufferSource, number)} on708Data
   * @private
   */
  parseMdat_(reader, time, timescale, defaultSampleDuration,
      defaultSampleSize, sampleData, on708Data) {
    if (time === null) {
      // This field should have been populated by
      // the Base Media Decode time in the TFDT box
      return;
    }

    let sampleIndex = 0;
    let sampleSize = sampleData.length > 0 ? sampleData[0].sampleSize
      || defaultSampleSize: defaultSampleSize;

    while (reader.hasMoreData()) {
      const naluSize = reader.readUint32();
      const naluType = reader.readUint8() & 0x1F;
      if (naluType == shaka.cea.CeaParser.NALU_TYPE_SEI) {
        const timeOffset = sampleData.length > sampleIndex ?
            sampleData[sampleIndex].sampleCompositionTimeOffset || 0 : 0;

        // todo do calculation here
        this.seiProcessor_.append(reader.readBytes(naluSize - 1));
        this.seiProcessor_.process(time/timescale + timeOffset/timescale,
            on708Data);
      } else {
        reader.skip(naluSize - 1);
      }
      sampleSize -= (naluSize + 4);
      if (sampleSize == 0) {
        time += sampleData.length > sampleIndex ?
          sampleData[sampleIndex].sampleDuration
          || defaultSampleDuration: defaultSampleDuration;

        sampleSize = sampleData.length > sampleIndex ?
          sampleData[sampleIndex].sampleSize
          || defaultSampleSize : defaultSampleSize;
        sampleIndex++;
      }
    }
  }
};
