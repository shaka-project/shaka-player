/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.packaging.Mmtp');
goog.provide('shaka.msf.packaging.MmtpSegmenter');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.media.InitSegmentReference');
goog.require('shaka.media.SegmentUtils');
goog.require('shaka.msf.PackagingRegistry');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.Mp4BoxParsers');
goog.require('shaka.util.Mp4Parser');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * Packaging for MMTP tracks (draft-ramadan-moq-mmt), where a MoQT object is
 * one MMTP packet.
 *
 * An MMTP packet is not a sample. The publisher splits each ISO-BMFF sample
 * into media fragment units sized to its packets, and states the sample's
 * timing in a separate movie fragment packet, so samples only exist once the
 * packets have been reassembled. All of that -- packet parsing, fragment
 * reassembly, associating samples with their authored timing -- is done by
 * libmmt, which must be loaded as a classic script before the player starts:
 * `@blockcast/mmt-container`'s `dist/mmtp-container-parser.no-modules.js`,
 * which installs the `BlockcastMmt` global. Without it MMTP tracks are
 * skipped.
 *
 * What this packaging owns is presentation: each reassembled sample becomes a
 * CMAF movie fragment, timed exactly as the publisher authored it.
 *
 * @see https://datatracker.ietf.org/doc/draft-ramadan-moq-mmt/
 *
 * @implements {shaka.extern.MsfPackaging}
 * @final
 */
shaka.msf.packaging.Mmtp = class {
  constructor() {
    /** @private {string} */
    this.contentType_ = '';

    /** @private {string} */
    this.codec_ = '';

    /** @private {string} */
    this.trackName_ = '';
  }

  /**
   * @override
   */
  describeTrack(track, initData) {
    const Mmtp = shaka.msf.packaging.Mmtp;
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    const reason = Mmtp.whyUnsupported(track);
    if (reason) {
      shaka.log.alwaysWarn(
          `MMTP track "${track.name}" skipped: ${reason}`);
      return null;
    }

    const codec = /** @type {string} */ (track.codec).trim();
    const isVideo = shaka.util.ManifestParserUtils.VIDEO_CODEC_REGEXPS.some(
        (regexp) => regexp.test(codec));
    this.contentType_ = isVideo ? ContentType.VIDEO : ContentType.AUDIO;
    this.codec_ = codec;
    this.trackName_ = track.name;

    if (!initData.byteLength) {
      // The publisher repeats the initialization segment in-band, in MPU
      // metadata packets, so a catalog is not required to carry it. The
      // segmenter then appends it ahead of the first sample instead.
      const basicInfo = shaka.media.SegmentUtils.getBasicInfoFromMimeType(
          `${this.contentType_}/mp4; codecs="${codec}"`);
      return {basicInfo, initSegmentReference: null};
    }

    const basicInfo = shaka.media.SegmentUtils.getBasicInfoFromMp4(
        initData, initData, /* disableText= */ false);
    if (!basicInfo) {
      shaka.log.alwaysWarn(`MMTP track "${track.name}" skipped: its ` +
          'catalog initialization data is not an ISO-BMFF initialization ' +
          'segment.');
      return null;
    }
    return {
      basicInfo,
      initSegmentReference: new shaka.media.InitSegmentReference(
          () => [],
          /* startBytes= */ 0,
          /* endBytes= */ null,
          /* mediaQuality= */ null,
          basicInfo.timescale || track.timescale,
          initData),
    };
  }

  /**
   * @override
   */
  createSegmenter() {
    return new shaka.msf.packaging.MmtpSegmenter(
        this.contentType_, this.codec_, this.trackName_);
  }

  /**
   * Returns why a catalog track cannot be played as MMTP, or null when it
   * can.
   *
   * @param {msfCatalog.Track} track
   * @return {?string}
   */
  static whyUnsupported(track) {
    const ManifestParserUtils = shaka.util.ManifestParserUtils;

    if (typeof BlockcastMmt === 'undefined') {
      return 'libmmt is not loaded. Load @blockcast/mmt-container\'s ' +
          'dist/mmtp-container-parser.no-modules.js before the player.';
    }

    // libmmt owns the MMTP catalog contract: the mode, the timescale and the
    // group duration are checked against its schema and semantic rules, not
    // re-derived here. The track is wrapped in a catalog of its own because
    // that is the unit the contract is written for.
    //
    // Its FEC declaration is left out. Repair symbols only matter where
    // packets can be lost, and Objects of a MoQT subscription are not, so
    // this packaging never joins a repair track -- and a single-track
    // catalog could not name one anyway, so validating the declaration here
    // would reject every FEC-protected track for want of its repair track.
    const unprotected = Object.assign({}, track);
    delete unprotected['fec'];
    try {
      BlockcastMmt.validateCmsfMmtpCatalog({
        'version': 1,
        'streamingFormat': 'mmtp',
        'streamingFormatVersion': 'draft-ramadan-moq-mmt-00',
        'tracks': [unprotected],
      });
    } catch (error) {
      return `its catalog entry is invalid (${error.message}).`;
    }

    // An MPU-mode track carries whole MPUs per Object rather than fragment
    // units, which is a different reassembly path this packaging does not
    // implement.
    if (track.mmtpMode != 'mfu') {
      return `mmtpMode "${track.mmtpMode}" is not supported; only "mfu" is.`;
    }

    // The codec decides which source buffer MediaSource opens, and that
    // happens before the first packet has arrived to be inspected.
    const codec = (track.codec || '').trim();
    if (!codec) {
      return 'it has no codec. The catalog must declare it.';
    }
    if (codec.includes(',')) {
      return `it declares several codecs ("${codec}"). An MMTP track ` +
          'carries one asset, so it has exactly one.';
    }
    const isVideo = ManifestParserUtils.VIDEO_CODEC_REGEXPS.some(
        (regexp) => regexp.test(codec));
    const isAudio = ManifestParserUtils.AUDIO_CODEC_REGEXPS.some(
        (regexp) => regexp.test(codec));
    if (!isVideo && !isAudio) {
      return `its codec "${codec}" is neither audio nor video.`;
    }
    return null;
  }
};


/**
 * Turns a track's MMTP packets into CMAF segments of one sample each.
 *
 * Every packet that does not end in a sample is accounted for by
 * getStats(), under the reason libmmt or this segmenter gave for it, so a
 * track that stops producing media can be told apart from one that is merely
 * between samples.
 *
 * @implements {shaka.extern.MsfSegmenter}
 * @final
 */
shaka.msf.packaging.MmtpSegmenter = class {
  /**
   * @param {string} contentType
   * @param {string} codec
   * @param {string} trackName
   */
  constructor(contentType, codec, trackName) {
    /** @private {boolean} */
    this.isVideo_ =
        contentType == shaka.util.ManifestParserUtils.ContentType.VIDEO;

    /** @private {string} */
    this.trackName_ = trackName;

    /** @private {!BlockcastMmt.MmtpContainerParser} */
    this.parser_ = new BlockcastMmt.MmtpContainerParser({
      reassemblyPolicy: BlockcastMmt.reliableMoqMfuReassembly(),
      defaultTrack: {
        type: this.isVideo_ ? 'video' : 'audio',
        codec,
      },
    });

    /** @private {!BlockcastMmt.MmtpToCmaf} */
    this.cmaf_ = new BlockcastMmt.MmtpToCmaf();

    /**
     * Samples libmmt completed during the current push().
     * @private {!Array<{data: !Uint8Array, meta: !BlockcastMmt.FrameMeta}>}
     */
    this.completed_ = [];
    this.parser_.onFrame((data, meta) => {
      this.completed_.push({data, meta});
    });

    /**
     * The packet ID this track's media is carried on, fixed by its first
     * media packet. A MoQT track carries one MMTP asset.
     * @private {?number}
     */
    this.packetId_ = null;

    /**
     * The in-band initialization segment last appended, or null before the
     * first one.
     * @private {?Uint8Array}
     */
    this.appendedInit_ = null;

    /**
     * An in-band initialization segment that differs from the one last
     * appended, waiting for the next sample to carry it.
     * @private {?Uint8Array}
     */
    this.pendingInit_ = null;

    /** @private {number} */
    this.trackId_ = 1;

    /**
     * The media timescale the converter is configured for, or 0 before the
     * first sample.
     * @private {number}
     */
    this.timescale_ = 0;

    /** @private {!Object<string, number>} */
    this.packetStats_ = {};

    /** @private {!Object<string, number>} */
    this.sampleStats_ = {};
  }

  /**
   * @override
   */
  push(obj) {
    // An empty Object carries an object status, not a packet.
    if (!obj.data.byteLength) {
      return [];
    }

    this.completed_ = [];
    let record;
    try {
      record = this.parser_.feed(obj.data);
    } catch (error) {
      shaka.log.warning(`MMTP track "${this.trackName_}": libmmt threw on ` +
          'a packet; dropping it.', error);
      this.countPacket_('drop:threw');
      return [];
    }

    if (!record) {
      this.countPacket_(this.parser_.lastFeedOutcome || 'drop:unknown');
    } else if (!this.acceptsPacketId_(record.packet.packetId, record.kind)) {
      this.countPacket_('drop:foreign-packet-id');
    } else {
      this.countPacket_(record.kind);
      if (record.kind == 'init' && record.data) {
        this.noteInit_(record.data);
      }
    }

    const segments = [];
    for (const {data, meta} of this.completed_) {
      const segment = this.toSegment_(data, meta);
      if (segment) {
        segments.push(segment);
      }
    }
    this.completed_ = [];
    return segments;
  }

  /**
   * How every packet and every reassembled sample ended.
   *
   * `packets` counts each packet once: under the libmmt record it produced
   * ('frame', 'pending', 'init', 'fragment', 'non-media', ...), or under
   * 'drop:<reason>' when it produced none. `samples` counts each sample libmmt
   * completed once: 'segment', or 'drop:<reason>'. `reorder` is libmmt's own
   * account of samples it completed but held back, such as those before the
   * first random access point, which are never decodable and so never reach
   * this segmenter.
   *
   * @return {{packets: !Object<string, number>,
   *           samples: !Object<string, number>,
   *           reorder: !Object<string, number>}}
   */
  getStats() {
    return {
      packets: Object.assign({}, this.packetStats_),
      samples: Object.assign({}, this.sampleStats_),
      reorder: Object.assign({}, this.parser_.reorderStats),
    };
  }

  /**
   * Releases libmmt's reassembly state.
   */
  release() {
    this.parser_.dispose();
  }

  /**
   * @param {number} packetId
   * @param {string} kind
   * @return {boolean}
   * @private
   */
  acceptsPacketId_(packetId, kind) {
    // Signaling (packet ID 0, ISO/IEC 23008-1) and repair packets belong to
    // no asset, so they neither fix the track's packet ID nor contradict it.
    if (kind == 'non-media' || kind == 'repair') {
      return true;
    }
    if (this.packetId_ == null) {
      this.packetId_ = packetId;
    }
    return packetId == this.packetId_;
  }

  /**
   * @param {!Uint8Array} init
   * @private
   */
  noteInit_(init) {
    if (this.appendedInit_ &&
        shaka.util.BufferUtils.equal(this.appendedInit_, init)) {
      this.pendingInit_ = null;
      return;
    }
    this.pendingInit_ = init;
  }

  /**
   * @param {!Uint8Array} data
   * @param {!BlockcastMmt.FrameMeta} meta
   * @return {?shaka.extern.MsfSegment}
   * @private
   */
  toSegment_(data, meta) {
    if (meta.packetId != this.packetId_) {
      this.countSample_('drop:foreign-packet-id');
      return null;
    }
    const timing = meta.authoredTiming;
    if (!timing || !(timing.mediaTimescale > 0) ||
        !(timing.durationTicks > 0)) {
      // libmmt only completes a sample whose timing it could associate, so
      // this is a sample it delivered without any. Inventing timing from
      // arrival would misplace it.
      this.countSample_('drop:sample-timing-missing');
      return null;
    }

    let init = null;
    if (this.pendingInit_) {
      init = this.pendingInit_;
      this.appendedInit_ = init;
      this.pendingInit_ = null;
      this.trackId_ =
          shaka.msf.packaging.MmtpSegmenter.trackIdOf_(init) || this.trackId_;
    }

    const timescale = timing.mediaTimescale;
    if (timescale != this.timescale_) {
      this.cmaf_.reset();
      if (this.isVideo_) {
        this.cmaf_.setVideoTrackParams(this.trackId_, timescale);
      } else {
        this.cmaf_.setAudioTimescale(timescale);
      }
      this.timescale_ = timescale;
    }

    const decodeTime = Number(timing.decodeTime);
    const compositionTimeOffset =
        Number(timing.presentationTime - timing.decodeTime);
    let fragment;
    if (this.isVideo_) {
      fragment = this.cmaf_.wrapVideoSamples([{
        data,
        duration: timing.durationTicks,
        keyframe: meta.keyframe,
        compositionTimeOffset,
      }], decodeTime, this.trackId_);
    } else {
      fragment = this.cmaf_.wrapAudioSamples([{
        data,
        duration: timing.durationTicks,
        compositionTimeOffset,
      }], decodeTime, this.trackId_);
    }

    this.countSample_('segment');
    return {
      startTime: decodeTime / timescale,
      duration: timing.durationTicks / timescale,
      data: init ? shaka.util.Uint8ArrayUtils.concat(init, fragment) :
          fragment,
      independent: !this.isVideo_ || meta.keyframe,
      timestampOffset: 0,
      discontinuitySequence: -1,
    };
  }

  /**
   * @param {string} outcome
   * @private
   */
  countPacket_(outcome) {
    this.packetStats_[outcome] = (this.packetStats_[outcome] || 0) + 1;
  }

  /**
   * @param {string} outcome
   * @private
   */
  countSample_(outcome) {
    this.sampleStats_[outcome] = (this.sampleStats_[outcome] || 0) + 1;
  }

  /**
   * Reads the track ID from an initialization segment's track header, which
   * the movie fragments built for it must repeat.
   *
   * @param {!Uint8Array} init
   * @return {?number}
   * @private
   */
  static trackIdOf_(init) {
    const Mp4Parser = shaka.util.Mp4Parser;
    let trackId = null;
    new Mp4Parser()
        .box('moov', Mp4Parser.children)
        .box('trak', Mp4Parser.children)
        .fullBox('tkhd', (box) => {
          goog.asserts.assert(box.version != null,
              'TKHD is a full box and should have a valid version.');
          trackId = shaka.util.Mp4BoxParsers.parseTKHD(
              box.reader, box.version).trackId;
          box.parser.stop();
        })
        .parse(init, /* partialOkay= */ true);
    return trackId;
  }
};


shaka.msf.PackagingRegistry.registerPackaging(
    'mmtp', () => new shaka.msf.packaging.Mmtp());
