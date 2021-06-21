/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.text.Mp4VttParser');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.text.Cue');
goog.require('shaka.text.TextEngine');
goog.require('shaka.text.VttTextParser');
goog.require('shaka.util.DataViewReader');
goog.require('shaka.util.Error');
goog.require('shaka.util.Functional');
goog.require('shaka.util.Mp4Parser');
goog.require('shaka.util.Mp4BoxParsers');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.TextParser');


/**
 * @implements {shaka.extern.TextParser}
 * @export
 */
shaka.text.Mp4VttParser = class {
  /** */
  constructor() {
    /**
     * The current time scale used by the VTT parser.
     *
     * @type {?number}
     * @private
     */
    this.timescale_ = null;
  }

  /**
   * @override
   * @export
   */
  parseInit(data) {
    const Mp4Parser = shaka.util.Mp4Parser;

    let sawWVTT = false;

    new Mp4Parser()
        .box('moov', Mp4Parser.children)
        .box('trak', Mp4Parser.children)
        .box('mdia', Mp4Parser.children)
        .fullBox('mdhd', (box) => {
          goog.asserts.assert(
              box.version == 0 || box.version == 1,
              'MDHD version can only be 0 or 1');

          const parsedMDHDBox = shaka.util.Mp4BoxParsers.parseMDHD(
              box.reader, box.version);
          this.timescale_ = parsedMDHDBox.timescale;
        })
        .box('minf', Mp4Parser.children)
        .box('stbl', Mp4Parser.children)
        .fullBox('stsd', Mp4Parser.sampleDescription)
        .box('wvtt', (box) => {
          // A valid vtt init segment, though we have no actual subtitles yet.
          sawWVTT = true;
        }).parse(data);

    if (!this.timescale_) {
      // Missing timescale for VTT content. It should be located in the MDHD.
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_MP4_VTT);
    }

    if (!sawWVTT) {
      // A WVTT box should have been seen (a valid vtt init segment with no
      // actual subtitles).
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_MP4_VTT);
    }
  }

  /**
   * @override
   * @export
   */
  parseMedia(data, time) {
    if (!this.timescale_) {
      // Missing timescale for VTT content. We should have seen the init
      // segment.
      shaka.log.error('No init segment for MP4+VTT!');
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_MP4_VTT);
    }

    const Mp4Parser = shaka.util.Mp4Parser;

    let baseTime = 0;
    /** @type {!Array.<shaka.util.ParsedTRUNSample>} */
    let presentations = [];
    /** @type {!Uint8Array} */
    let rawPayload;
    /** @type {!Array.<shaka.text.Cue>} */
    const cues = [];

    let sawTFDT = false;
    let sawTRUN = false;
    let sawMDAT = false;
    let defaultDuration = null;

    const parser = new Mp4Parser()
        .box('moof', Mp4Parser.children)
        .box('traf', Mp4Parser.children)
        .fullBox('tfdt', (box) => {
          sawTFDT = true;
          goog.asserts.assert(
              box.version == 0 || box.version == 1,
              'TFDT version can only be 0 or 1');

          const parsedTFDTBox = shaka.util.Mp4BoxParsers.parseTFDT(
              box.reader, box.version);
          baseTime = parsedTFDTBox.baseMediaDecodeTime;
        })
        .fullBox('tfhd', (box) => {
          goog.asserts.assert(
              box.flags != null,
              'A TFHD box should have a valid flags value');
          const parsedTFHDBox = shaka.util.Mp4BoxParsers.parseTFHD(
              box.reader, box.flags);
          defaultDuration = parsedTFHDBox.defaultSampleDuration;
        })
        .fullBox('trun', (box) => {
          sawTRUN = true;
          goog.asserts.assert(
              box.version != null,
              'A TRUN box should have a valid version value');
          goog.asserts.assert(
              box.flags != null,
              'A TRUN box should have a valid flags value');

          const parsedTRUNBox = shaka.util.Mp4BoxParsers.parseTRUN(
              box.reader, box.version, box.flags);
          presentations = parsedTRUNBox.sampleData;
        })
        .box('mdat', Mp4Parser.allData((data) => {
          goog.asserts.assert(
              !sawMDAT,
              'VTT cues in mp4 with multiple MDAT are not currently supported');
          sawMDAT = true;
          rawPayload = data;
        }));
    parser.parse(data, /* partialOkay= */ false);

    if (!sawMDAT && !sawTFDT && !sawTRUN) {
      // A required box is missing.
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_MP4_VTT);
    }

    let currentTime = baseTime;

    /** @type {!shaka.util.DataViewReader} */
    const reader = new shaka.util.DataViewReader(
        rawPayload, shaka.util.DataViewReader.Endianness.BIG_ENDIAN);

    for (const presentation of presentations) {
      // If one presentation corresponds to multiple payloads, it is assumed
      // that all of those payloads have the same start time and duration.
      const duration = presentation.sampleDuration || defaultDuration;
      const startTime = presentation.sampleCompositionTimeOffset ?
                      baseTime + presentation.sampleCompositionTimeOffset :
                      currentTime;
      currentTime = startTime + (duration || 0);

      // Read samples until it adds up to the given size.
      let totalSize = 0;
      do {
        // Read the payload size.
        const payloadSize = reader.readUint32();
        totalSize += payloadSize;

        // Skip the type.
        const payloadType = reader.readUint32();
        const payloadName = shaka.util.Mp4Parser.typeToString(payloadType);

        // Read the data payload.
        /** @type {Uint8Array} */
        let payload = null;
        if (payloadName == 'vttc') {
          if (payloadSize > 8) {
            payload = reader.readBytes(payloadSize - 8);
          }
        } else if (payloadName == 'vtte') {
          // It's a vtte, which is a vtt cue that is empty. Ignore any data that
          // does exist.
          reader.skip(payloadSize - 8);
        } else {
          shaka.log.error('Unknown box ' + payloadName + '! Skipping!');
          reader.skip(payloadSize - 8);
        }

        if (duration) {
          if (payload) {
            goog.asserts.assert(
                this.timescale_ != null, 'Timescale should not be null!');
            const cue = shaka.text.Mp4VttParser.parseVTTC_(
                payload,
                time.periodStart + startTime / this.timescale_,
                time.periodStart + currentTime / this.timescale_);
            cues.push(cue);
          }
        } else {
          shaka.log.error(
              'WVTT sample duration unknown, and no default found!');
        }

        goog.asserts.assert(
            !presentation.sampleSize || totalSize <= presentation.sampleSize,
            'The samples do not fit evenly into the sample sizes given in ' +
            'the TRUN box!');

        // If no sampleSize was specified, it's assumed that this presentation
        // corresponds to only a single cue.
      } while (presentation.sampleSize &&
               (totalSize < presentation.sampleSize));
    }

    goog.asserts.assert(
        !reader.hasMoreData(),
        'MDAT which contain VTT cues and non-VTT data are not currently ' +
        'supported!');

    return /** @type {!Array.<!shaka.extern.Cue>} */ (
      cues.filter(shaka.util.Functional.isNotNull));
  }

  /**
   * Parses a vttc box into a cue.
   *
   * @param {!Uint8Array} data
   * @param {number} startTime
   * @param {number} endTime
   * @return {shaka.text.Cue}
   * @private
   */
  static parseVTTC_(data, startTime, endTime) {
    let payload;
    let id;
    let settings;

    new shaka.util.Mp4Parser()
        .box('payl', shaka.util.Mp4Parser.allData((data) => {
          payload = shaka.util.StringUtils.fromUTF8(data);
        }))
        .box('iden', shaka.util.Mp4Parser.allData((data) => {
          id = shaka.util.StringUtils.fromUTF8(data);
        }))
        .box('sttg', shaka.util.Mp4Parser.allData((data) => {
          settings = shaka.util.StringUtils.fromUTF8(data);
        }))
        .parse(data);

    if (payload) {
      return shaka.text.Mp4VttParser.assembleCue_(
          payload, id, settings, startTime, endTime);
    } else {
      return null;
    }
  }

  /**
   * Take the individual components that make a cue and create a vttc cue.
   *
   * @param {string} payload
   * @param {?string} id
   * @param {?string} settings
   * @param {number} startTime
   * @param {number} endTime
   * @return {!shaka.text.Cue}
   * @private
   */
  static assembleCue_(payload, id, settings, startTime, endTime) {
    const cue = new shaka.text.Cue(startTime, endTime, '');

    /** @type {!Map.<string, shaka.text.Cue>} */
    const styles = new Map();
    shaka.text.VttTextParser.parseCueStyles(payload, cue, styles);

    if (id) {
      cue.id = id;
    }

    if (settings) {
      const parser = new shaka.util.TextParser(settings);

      let word = parser.readWord();

      while (word) {
        // TODO: Check WebVTTConfigurationBox for region info.
        if (!shaka.text.VttTextParser.parseCueSetting(
            cue, word, /* VTTRegions= */[])) {
          shaka.log.warning(
              'VTT parser encountered an invalid VTT setting: ', word,
              ' The setting will be ignored.');
        }

        parser.skipWhitespace();
        word = parser.readWord();
      }
    }

    return cue;
  }
};

shaka.text.TextEngine.registerParser(
    'application/mp4; codecs="wvtt"', () => new shaka.text.Mp4VttParser());
