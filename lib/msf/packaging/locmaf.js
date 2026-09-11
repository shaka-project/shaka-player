/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.packaging.Locmaf');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.media.InitSegmentReference');
goog.require('shaka.media.SegmentUtils');
goog.require('shaka.msf.LOCMAFParser');
goog.require('shaka.msf.PackagingRegistry');
goog.require('shaka.msf.QuicVarIntCodec');
goog.require('shaka.util.Mp4BoxParsers');
goog.require('shaka.util.Mp4Parser');


/**
 * Packaging for LOCMAF tracks, where every MoQT object is one CMAF chunk with
 * its `moof` reduced to a handful of tagged fields.
 *
 * The media is the same as a `cmaf` track's -- the same initialization
 * segment, the same sample data, the same DRM signaling -- so everything
 * about how the track presents itself is shared with that packaging. What
 * differs is that an object is not appendable as it stands: the `moof` has to
 * be rebuilt from the fields ahead of the sample data, and a chunk that
 * carries only what changed since the previous one cannot be read without it.
 * All of that lives in shaka.msf.LOCMAFParser; this class supplies it the
 * three things the initialization segment contributes and nothing else.
 *
 * A catalog may offer one rendition under `locmaf` and `cmaf` at the same
 * time, sharing a single initialization-data entry: they are alternative
 * encodings of one source rather than distinct media, and nothing in the
 * catalog marks either as the one to use. Registering this packaging
 * therefore makes both visible, doubling the variant list for such a catalog.
 * Which encoding to keep is the application's call, made by dropping the
 * others in `manifest.msf.catalogPreprocessor`; the demo's
 * `shakaAssets.preferLocmafTracks` is a worked example.
 *
 * @see https://datatracker.ietf.org/doc/draft-einarsson-moq-locmaf/
 *
 * @implements {shaka.extern.MsfPackaging}
 * @final
 */
shaka.msf.packaging.Locmaf = class {
  constructor() {
    /** @private {?shaka.msf.LOCMAFParser.TrackParams} */
    this.params_ = null;
  }

  /**
   * @override
   */
  describeTrack(track, initData) {
    // A version this parser does not know reinterprets wire syntax it would
    // otherwise decode into plausible nonsense, which the bytes themselves
    // give no way to detect. The catalog offers the same source under `cmaf`,
    // so skipping the track is the graceful outcome.
    if (track.locmafVersion !== shaka.msf.packaging.Locmaf.VERSION) {
      shaka.log.warning(`Skipping LOCMAF track "${track.name}" with ` +
          `unsupported locmafVersion "${track.locmafVersion}"; this build ` +
          `supports "${shaka.msf.packaging.Locmaf.VERSION}".`);
      return null;
    }

    if (!initData.byteLength) {
      shaka.log.warning(`Skipping LOCMAF track "${track.name}" with no ` +
          'initialization data; a LOCMAF chunk cannot be reconstructed ' +
          'without the trex defaults its fields fall back to.');
      return null;
    }

    const basicInfo = shaka.media.SegmentUtils.getBasicInfoFromMp4(
        initData, initData, /* disableText= */ false);
    if (!basicInfo) {
      return null;
    }

    const timescale = basicInfo.timescale || track.timescale;
    if (!timescale) {
      shaka.log.info(
          'Skipping incompatible track due missing timescale', track);
      return null;
    }

    const params =
        shaka.msf.packaging.Locmaf.readTrackParams_(initData, timescale);
    if (!params) {
      shaka.log.warning(`Skipping LOCMAF track "${track.name}" whose ` +
          'initialization segment carries no trex defaults.');
      return null;
    }
    this.params_ = params;

    return {
      basicInfo,
      initSegmentReference: new shaka.media.InitSegmentReference(
          () => [],
          /* startBytes= */ 0,
          /* endBytes= */ null,
          /* mediaQuality= */ null,
          timescale,
          initData),
    };
  }

  /**
   * @override
   */
  createSegmenter(codec) {
    goog.asserts.assert(this.params_, 'describeTrack() must run first');
    // A caller with no session -- a test, or a packaging driven directly --
    // gets the encoding every draft up to 16 used.
    return new shaka.msf.packaging.LocmafSegmenter(
        new shaka.msf.LOCMAFParser(
            codec || new shaka.msf.QuicVarIntCodec(),
            /** @type {!shaka.msf.LOCMAFParser.TrackParams} */ (
              this.params_)));
  }

  /**
   * Reads what the CMAF Header contributes to reconstruction: the track's ID,
   * the `trex` defaults every omitted field falls back to, and the `tenc`
   * per-sample IV size protected tracks need.
   *
   * shaka.util.Mp4BoxParsers.parseTREX is not used here because it reports
   * only two of the five values -- it exists for the transmuxer, which needs
   * no more -- and widening it would change what every other caller reads.
   *
   * @param {!Uint8Array} initData
   * @param {number} timescale
   * @return {?shaka.msf.LOCMAFParser.TrackParams}
   * @private
   */
  static readTrackParams_(initData, timescale) {
    const Mp4Parser = shaka.util.Mp4Parser;

    /** @type {?shaka.msf.LOCMAFParser.TrackParams} */
    let params = null;
    let isProtected = false;
    let defaultPerSampleIvSize = 0;

    new Mp4Parser()
        .box('moov', Mp4Parser.children)
        .box('mvex', Mp4Parser.children)
        .fullBox('trex', (box) => {
          const reader = box.reader;
          params = {
            trackId: reader.readUint32(),
            timescale,
            trexSampleDescriptionIndex: reader.readUint32(),
            trexSampleDuration: reader.readUint32(),
            trexSampleSize: reader.readUint32(),
            trexSampleFlags: reader.readUint32(),
            isProtected: false,
            defaultPerSampleIvSize: 0,
          };
        })
        .boxes([...Mp4Parser.SAMPLE_TABLE_PATH, 'sinf', 'schi'],
            Mp4Parser.children)
        .fullBox('stsd', Mp4Parser.sampleDescription)
        .box('encv', Mp4Parser.visualSampleEntry)
        .box('enca', Mp4Parser.audioSampleEntry)
        .fullBox('tenc', (box) => {
          goog.asserts.assert(
              box.version != null,
              'TENC is a full box and should have a valid version.');
          const parsed =
              shaka.util.Mp4BoxParsers.parseTENC(box.reader, box.version);
          isProtected = parsed.defaultIsProtected === 1;
          defaultPerSampleIvSize = parsed.defaultPerSampleIVSize;
        })
        .parse(initData, /* partialOkay= */ true);

    if (!params) {
      return null;
    }
    params.isProtected = isProtected;
    params.defaultPerSampleIvSize = defaultPerSampleIvSize;
    return params;
  }
};


/**
 * The LOCMAF packaging version this build reads, as carried in the catalog's
 * `locmafVersion` field.
 *
 * @const {string}
 */
shaka.msf.packaging.Locmaf.VERSION = '0.3';


/**
 * @implements {shaka.extern.MsfSegmenter}
 * @final
 */
shaka.msf.packaging.LocmafSegmenter = class {
  /**
   * @param {!shaka.msf.LOCMAFParser} parser
   */
  constructor(parser) {
    /** @private {!shaka.msf.LOCMAFParser} */
    this.parser_ = parser;
  }

  /**
   * @override
   */
  push(obj) {
    // An object with an empty payload carries a status rather than media, but
    // it still occupies an object ID, so the parser is told about it: a
    // status object between two chunks is not a gap in the delta chain.
    const chunk = this.parser_.parse(obj);
    if (!chunk) {
      return [];
    }

    return [{
      startTime: chunk.startTime,
      duration: chunk.duration,
      data: chunk.data,
      timestampOffset: 0,
      discontinuitySequence: -1,
    }];
  }
};


shaka.msf.PackagingRegistry.registerPackaging(
    'locmaf', () => new shaka.msf.packaging.Locmaf());
