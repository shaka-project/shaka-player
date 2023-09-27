/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.cea.Mp4CeaParser');

goog.require('goog.asserts');
goog.require('shaka.cea.CeaUtils');
goog.require('shaka.cea.SeiProcessor');
goog.require('shaka.log');
goog.require('shaka.media.ClosedCaptionParser');
goog.require('shaka.util.DataViewReader');
goog.require('shaka.util.Error');
goog.require('shaka.util.Mp4Parser');
goog.require('shaka.util.Mp4BoxParsers');

/**
 * MPEG4 stream parser used for extracting 708 closed captions data.
 * @implements {shaka.extern.ICeaParser}
 * @export
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

    /**
     * @private {shaka.cea.Mp4CeaParser.BitstreamFormat}
     */
    this.bitstreamFormat_ = shaka.cea.Mp4CeaParser.BitstreamFormat.UNKNOWN;
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
    const BitstreamFormat = shaka.cea.Mp4CeaParser.BitstreamFormat;
    const trackIds = [];
    const timescales = [];

    const codecBoxParser = (box) => this.setBitstreamFormat_(box.name);

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
        .box('minf', Mp4Parser.children)
        .box('stbl', Mp4Parser.children)
        .fullBox('stsd', Mp4Parser.sampleDescription)

        // These are the various boxes that signal a codec.
        .box('avc1', codecBoxParser)
        .box('avc3', codecBoxParser)
        .box('hev1', codecBoxParser)
        .box('hvc1', codecBoxParser)
        .box('dvh1', codecBoxParser)
        .box('dvhe', codecBoxParser)

        // This signals an encrypted sample, which we can go inside of to find
        // the codec used.
        .box('encv', Mp4Parser.visualSampleEntry)
        .box('sinf', Mp4Parser.children)
        .box('frma', (box) => {
          const {codec} = shaka.util.Mp4BoxParsers.parseFRMA(box.reader);
          this.setBitstreamFormat_(codec);
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

    if (this.bitstreamFormat_ == BitstreamFormat.UNKNOWN) {
      shaka.log.alwaysWarn(
          'Unable to determine bitstream format for CEA parsing!');
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
    const BitstreamFormat = shaka.cea.Mp4CeaParser.BitstreamFormat;

    if (this.bitstreamFormat_ == BitstreamFormat.UNKNOWN) {
      // We don't know how to extract SEI from this.
      return [];
    }

    /** @type {!Array<!shaka.extern.ICeaParser.CaptionPacket>} **/
    const captionPackets = [];

    // Fields that are found in MOOF boxes
    let defaultSampleDuration = this.defaultSampleDuration_;
    let defaultSampleSize = this.defaultSampleSize_;
    let moofOffset = 0;
    /** @type {!Array<shaka.util.ParsedTRUNBox>} */
    let parsedTRUNs = [];
    let baseMediaDecodeTime = null;
    let timescale = shaka.cea.CeaUtils.DEFAULT_TIMESCALE_VALUE;

    new Mp4Parser()
        .box('moof', (box) => {
          moofOffset = box.start;
          // trun box parsing is reset on each moof.
          parsedTRUNs = [];
          Mp4Parser.children(box);
        })
        .box('traf', Mp4Parser.children)
        .fullBox('trun', (box) => {
          goog.asserts.assert(
              box.version != null && box.flags!=null,
              'TRUN is a full box and should have a valid version & flags.');

          const parsedTRUN = shaka.util.Mp4BoxParsers.parseTRUN(
              box.reader, box.version, box.flags);
          parsedTRUNs.push(parsedTRUN);
        })
        .fullBox('tfhd', (box) => {
          goog.asserts.assert(
              box.flags != null,
              'TFHD is a full box and should have valid flags.');

          const parsedTFHD = shaka.util.Mp4BoxParsers.parseTFHD(
              box.reader, box.flags);

          // If specified, defaultSampleDuration and defaultSampleSize
          // override the ones specified in the TREX box
          defaultSampleDuration = parsedTFHD.defaultSampleDuration ||
              this.defaultSampleDuration_;

          defaultSampleSize = parsedTFHD.defaultSampleSize ||
              this.defaultSampleSize_;

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

          const parsedTFDT = shaka.util.Mp4BoxParsers.parseTFDTInaccurate(
              box.reader, box.version);

          baseMediaDecodeTime = parsedTFDT.baseMediaDecodeTime;
        })
        .box('mdat', (box) => {
          if (baseMediaDecodeTime === null) {
            // This field should have been populated by the Base Media Decode
            // Time in the tfdt box.
            shaka.log.alwaysWarn(
                'Unable to find base media decode time for CEA captions!');
            throw new shaka.util.Error(
                shaka.util.Error.Severity.CRITICAL,
                shaka.util.Error.Category.TEXT,
                shaka.util.Error.Code.INVALID_MP4_CEA);
          }

          const offset = moofOffset - box.start - 8;
          this.parseMdat_(box.reader, baseMediaDecodeTime, timescale,
              defaultSampleDuration, defaultSampleSize, offset, parsedTRUNs,
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
   * @param {number} offset
   * @param {!Array<shaka.util.ParsedTRUNBox>} parsedTRUNs
   * @param {!Array<!shaka.extern.ICeaParser.CaptionPacket>} captionPackets
   * @private
   */
  parseMdat_(reader, time, timescale, defaultSampleDuration,
      defaultSampleSize, offset, parsedTRUNs, captionPackets) {
    const BitstreamFormat = shaka.cea.Mp4CeaParser.BitstreamFormat;
    const CeaUtils = shaka.cea.CeaUtils;
    let sampleIndex = 0;

    // The fields in each ParsedTRUNSample contained in the sampleData
    // array are nullable. In the case of sample data and sample duration,
    // we use the defaults provided by the TREX/TFHD boxes. For sample
    // composition time offset, we default to 0.
    let sampleSize = defaultSampleSize;

    // Combine all sample data.  This assumes that the samples described across
    // multiple trun boxes are still continuous in the mdat box.
    const sampleDatas = parsedTRUNs.map((t) => t.sampleData);
    const sampleData = [].concat(...sampleDatas);

    if (sampleData.length) {
      sampleSize = sampleData[0].sampleSize || defaultSampleSize;
    }

    reader.skip(offset + parsedTRUNs[0].dataOffset);

    while (reader.hasMoreData()) {
      const naluSize = reader.readUint32();
      const naluHeader = reader.readUint8();
      let naluType = null;
      let isSeiMessage = false;
      let naluHeaderSize = 1;

      goog.asserts.assert(this.bitstreamFormat_ != BitstreamFormat.UNKNOWN,
          'Bitstream format should have been checked before now!');
      switch (this.bitstreamFormat_) {
        case BitstreamFormat.H264:
          naluType = naluHeader & 0x1f;
          isSeiMessage = naluType == CeaUtils.H264_NALU_TYPE_SEI;
          break;

        case BitstreamFormat.H265:
          naluHeaderSize = 2;
          reader.skip(1);
          naluType = (naluHeader >> 1) & 0x3f;
          isSeiMessage =
              naluType == CeaUtils.H265_PREFIX_NALU_TYPE_SEI ||
              naluType == CeaUtils.H265_SUFFIX_NALU_TYPE_SEI;
          break;

        default:
          return;
      }

      if (isSeiMessage) {
        let timeOffset = 0;

        if (sampleIndex < sampleData.length) {
          timeOffset = sampleData[sampleIndex].sampleCompositionTimeOffset || 0;
        }

        const pts = (time + timeOffset)/timescale;
        for (const packet of this.seiProcessor_
            .process(reader.readBytes(naluSize - naluHeaderSize))) {
          captionPackets.push({
            packet,
            pts,
          });
        }
      } else {
        try {
          reader.skip(naluSize - naluHeaderSize);
        } catch (e) {
          // It is necessary to ignore this error because it can break the start
          // of playback even if the user does not want to see the subtitles.
          break;
        }
      }
      sampleSize -= (naluSize + 4);
      if (sampleSize == 0) {
        if (sampleIndex < sampleData.length) {
          time += sampleData[sampleIndex].sampleDuration ||
              defaultSampleDuration;
        } else {
          time += defaultSampleDuration;
        }

        sampleIndex++;

        if (sampleIndex < sampleData.length) {
          sampleSize = sampleData[sampleIndex].sampleSize || defaultSampleSize;
        } else {
          sampleSize = defaultSampleSize;
        }
      }
    }
  }

  /**
   * @param {string} codec A fourcc for a codec.
   * @private
   */
  setBitstreamFormat_(codec) {
    if (codec in shaka.cea.Mp4CeaParser.CodecBitstreamMap_) {
      this.bitstreamFormat_ = shaka.cea.Mp4CeaParser.CodecBitstreamMap_[codec];
    }
  }
};

/** @enum {number} */
shaka.cea.Mp4CeaParser.BitstreamFormat = {
  UNKNOWN: 0,
  H264: 1,
  H265: 2,
};

/** @private {Object.<string, shaka.cea.Mp4CeaParser.BitstreamFormat>} */
shaka.cea.Mp4CeaParser.CodecBitstreamMap_ = {
  'avc1': shaka.cea.Mp4CeaParser.BitstreamFormat.H264,
  'avc3': shaka.cea.Mp4CeaParser.BitstreamFormat.H264,
  'hev1': shaka.cea.Mp4CeaParser.BitstreamFormat.H265,
  'hvc1': shaka.cea.Mp4CeaParser.BitstreamFormat.H265,
  // Dobly vision is also H265.
  'dvh1': shaka.cea.Mp4CeaParser.BitstreamFormat.H265,
  'dvhe': shaka.cea.Mp4CeaParser.BitstreamFormat.H265,
};

shaka.media.ClosedCaptionParser.registerParser('video/mp4',
    () => new shaka.cea.Mp4CeaParser());
