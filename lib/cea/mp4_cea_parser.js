/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.cea.Mp4CeaParser');

goog.require('goog.asserts');
goog.require('shaka.cea.ICeaParser');
goog.require('shaka.cea.SeiProcessor');
goog.require('shaka.util.DataViewReader');
goog.require('shaka.util.Error');
goog.require('shaka.util.Mp4Parser');
goog.require('shaka.util.Mp4BoxParsers');

/**
 * MPEG4 stream parser used for extracting 708 closed captions data.
 * @implements {shaka.cea.ICeaParser}
 */
shaka.cea.Mp4CeaParser = class {
  /** */
  constructor() {
    /**
     * SEI data processor.
     * @private
     * @const {!shaka.cea.SeiProcessor}
     */
    this.seiProcessor_ = new shaka.cea.SeiProcessor();

    /**
     * Map of track id to corresponding timescale.
     * @private {!Map<number, number>}
     */
    this.trackIdToTimescale_ = new Map();

    /**
     * Default sample duration, as specified by the TREX box.
     * @private {number}
     */
    this.defaultSampleDuration_ = 0;

    /**
     * Default sample size, as specified by the TREX box.
     * @private {number}
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
  init(initSegment) {
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

    // At least one track should exist, and each track should have a
    // corresponding Id in TKHD box, and timescale in its MDHD box
    if (!trackIds.length|| !timescales.length ||
      trackIds.length != timescales.length) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_MP4_CEA);
    }

    // Populate the map from track Id to timescale
    trackIds.forEach((trackId, idx) => {
      this.trackIdToTimescale_.set(trackId, timescales[idx]);
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
  parse(mediaSegment) {
    const Mp4Parser = shaka.util.Mp4Parser;

    /** @type {!Array<!shaka.cea.ICeaParser.CaptionPacket>} **/
    const captionPackets = [];

    // Fields that are found in MOOF boxes
    let defaultSampleDuration = this.defaultSampleDuration_;
    let defaultSampleSize = this.defaultSampleSize_;
    let sampleData = [];
    let baseMediaDecodeTime = null;
    let timescale = shaka.cea.ICeaParser.DEFAULT_TIMESCALE_VALUE;

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
          if (this.trackIdToTimescale_.has(trackId)) {
            timescale = this.trackIdToTimescale_.get(trackId);
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
          if (baseMediaDecodeTime === null) {
            // This field should have been populated by
            // the Base Media Decode time in the TFDT box
            throw new shaka.util.Error(
                shaka.util.Error.Severity.CRITICAL,
                shaka.util.Error.Category.TEXT,
                shaka.util.Error.Code.INVALID_MP4_CEA);
          }
          this.parseMdat_(box.reader, baseMediaDecodeTime, timescale,
              defaultSampleDuration, defaultSampleSize, sampleData,
              captionPackets);
        })
        .parse(mediaSegment, /* partialOkay= */ false);

    return captionPackets;
  }

  /**
   * Parse MDAT box.
   * @param {!shaka.util.DataViewReader} reader
   * @param {number} time
   * @param {number} timescale
   * @param {number} defaultSampleDuration
   * @param {number} defaultSampleSize
   * @param {!Array<shaka.util.ParsedTRUNSample>} sampleData
   * @param {!Array<!shaka.cea.ICeaParser.CaptionPacket>} captionPackets
   * @private
   */
  parseMdat_(reader, time, timescale, defaultSampleDuration,
      defaultSampleSize, sampleData, captionPackets) {
    let sampleIndex = 0;

    // The fields in each ParsedTRUNSample contained in the sampleData
    // array are nullable. In the case of sample data and sample duration,
    // we use the defaults provided by the TREX/TFHD boxes. For sample
    // composition time offset, we default to 0.
    let sampleSize = defaultSampleSize;

    if (sampleData.length) {
      sampleSize = sampleData[0].sampleSize || defaultSampleSize;
    }

    while (reader.hasMoreData()) {
      const naluSize = reader.readUint32();
      const naluType = reader.readUint8() & 0x1F;
      if (naluType == shaka.cea.ICeaParser.NALU_TYPE_SEI) {
        let timeOffset = 0;

        if (sampleData.length > sampleIndex) {
          timeOffset = sampleData[sampleIndex].sampleCompositionTimeOffset || 0;
        }

        const pts = (time + timeOffset)/timescale;
        for (const packet of this.seiProcessor_
            .process(reader.readBytes(naluSize - 1))) {
          captionPackets.push({
            packet,
            pts,
          });
        }
      } else {
        reader.skip(naluSize - 1);
      }
      sampleSize -= (naluSize + 4);
      if (sampleSize == 0) {
        if (sampleData.length > sampleIndex) {
          time += sampleData[sampleIndex].sampleDuration ||
              defaultSampleDuration;
        } else {
          time += defaultSampleDuration;
        }

        sampleIndex++;

        if (sampleData.length > sampleIndex) {
          sampleSize = sampleData[sampleIndex].sampleSize || defaultSampleSize;
        } else {
          sampleSize = defaultSampleSize;
        }
      }
    }
  }
};
