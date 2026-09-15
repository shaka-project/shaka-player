/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.packaging.M2ts');

goog.require('shaka.log');
goog.require('shaka.media.SegmentUtils');
goog.require('shaka.msf.PackagingRegistry');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.TsParser');


/**
 * Packaging for MPEG-2 Transport Stream tracks, where a MoQT object is a run
 * of whole transport packets.
 *
 * Unlike the other packagings, an object is not a segment. A transport packet
 * carries no timing of its own, a PES packet spans many of them, and an object
 * boundary falls wherever the publisher chose to cut, so a single object is
 * neither self-describing nor independently decodable. What the draft does
 * guarantee is that a Group begins at a random access point, so the Group is
 * the smallest unit that can be appended, and objects are accumulated until
 * the Group ends.
 *
 * That costs roughly one Group of latency, which is the price of the format:
 * there is no smaller boundary that can be cut safely.
 *
 * @see https://datatracker.ietf.org/doc/draft-gregoire-moq-msfts/
 *
 * @implements {shaka.extern.MsfPackaging}
 * @final
 */
shaka.msf.packaging.M2ts = class {
  constructor() {
    /** @private {number} */
    this.packetSize_ = 0;

    /**
     * The catalog's initialization packets, normalized to 188-octet transport
     * packets and prepended to every group.
     * @private {!Uint8Array}
     */
    this.psi_ = new Uint8Array(0);

    /** @private {string} */
    this.timingContentType_ = '';

    /** @private {number} */
    this.frameDuration_ = 0;

    /** @private {?number} */
    this.pcrPid_ = null;
  }

  /**
   * @override
   */
  describeTrack(track, initData) {
    const M2ts = shaka.msf.packaging.M2ts;
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    const packetSize = track.m2tsPacketSize;
    if (packetSize != M2ts.TS_PACKET_SIZE &&
        packetSize != M2ts.M2TS_PACKET_SIZE) {
      shaka.log.alwaysWarn(`m2ts track "${track.name}" declares an ` +
          `unsupported m2tsPacketSize ${packetSize}; skipping. Only 188 ` +
          'and 192 are supported.');
      return null;
    }

    // The draft's Track object leaves the codec to the base MSF catalog, and
    // the player needs it before playback starts: the codec decides which
    // source buffers MediaSource opens, and that happens before the first
    // group has arrived to be probed.
    if (!track.codec) {
      shaka.log.alwaysWarn(`m2ts track "${track.name}" has no codec; ` +
          'skipping. The catalog must declare it.');
      return null;
    }

    const codecs = track.codec.split(',')
        .map((codec) => codec.trim())
        .filter((codec) => codec.length);
    const hasVideo = codecs.some((codec) => M2ts.isVideoCodec_(codec));
    const hasAudio = codecs.some((codec) => M2ts.isAudioCodec_(codec));
    if (!hasVideo && !hasAudio) {
      shaka.log.alwaysWarn(`m2ts track "${track.name}" declares no ` +
          `recognized codec ("${track.codec}"); skipping.`);
      return null;
    }

    if (track.m2tsRandomAccess === false) {
      shaka.log.warning(`m2ts track "${track.name}" declares ` +
          'm2tsRandomAccess false, so a group may not begin at a random ' +
          'access point and the start of a group may not decode.');
    }

    this.packetSize_ = packetSize;
    this.psi_ = M2ts.normalizePackets_(initData, packetSize);
    // Timestamps are read from whichever elementary stream the track is
    // presented as. A muxed program is presented as video.
    this.timingContentType_ = hasVideo ? ContentType.VIDEO : ContentType.AUDIO;
    this.frameDuration_ = track.framerate ? 1 / track.framerate : 0;
    this.pcrPid_ = track.m2tsPcrPid != undefined ? track.m2tsPcrPid : null;

    // A muxed program keeps both codecs on the one stream. MediaSourceEngine
    // recognizes that combination and opens a source buffer for each, feeding
    // both from this stream's segments.
    const basicInfo = shaka.media.SegmentUtils.getBasicInfoFromMimeType(
        `video/mp2t; codecs="${codecs.join(',')}"`);

    // Transport streams have no initialization segment. The PAT/PMT that plays
    // its part is prepended to each group's payload instead, because it is
    // part of the transport stream rather than something appended before it.
    return {basicInfo, initSegmentReference: null};
  }

  /**
   * @override
   */
  createSegmenter() {
    return new shaka.msf.packaging.M2tsSegmenter(
        this.packetSize_, this.psi_, this.timingContentType_,
        this.frameDuration_, this.pcrPid_);
  }

  /**
   * Copies out the 188-octet transport packets of a buffer of source packets,
   * dropping the 4-octet timestamp prefix of 192-octet M2TS source packets.
   *
   * The prefix records when a packet arrived at a contribution encoder, which
   * says nothing about presentation, so nothing downstream wants it. Removing
   * it here means the rest of the player only ever sees plain transport
   * packets.
   *
   * @param {!Uint8Array} data
   * @param {number} packetSize
   * @return {!Uint8Array}
   * @private
   */
  static normalizePackets_(data, packetSize) {
    const M2ts = shaka.msf.packaging.M2ts;
    if (packetSize == M2ts.TS_PACKET_SIZE) {
      return data;
    }

    const count = Math.floor(data.byteLength / packetSize);
    const out = new Uint8Array(count * M2ts.TS_PACKET_SIZE);
    for (let i = 0; i < count; i++) {
      const start = i * packetSize + M2ts.M2TS_TIMESTAMP_PREFIX_SIZE;
      out.set(data.subarray(start, start + M2ts.TS_PACKET_SIZE),
          i * M2ts.TS_PACKET_SIZE);
    }
    return out;
  }

  /**
   * @param {string} codec
   * @return {boolean}
   * @private
   */
  static isVideoCodec_(codec) {
    return shaka.util.ManifestParserUtils.VIDEO_CODEC_REGEXPS.some(
        (regexp) => regexp.test(codec));
  }

  /**
   * @param {string} codec
   * @return {boolean}
   * @private
   */
  static isAudioCodec_(codec) {
    return shaka.util.ManifestParserUtils.AUDIO_CODEC_REGEXPS.some(
        (regexp) => regexp.test(codec));
  }
};


/**
 * The size of an MPEG-2 transport packet.
 *
 * @const {number}
 */
shaka.msf.packaging.M2ts.TS_PACKET_SIZE = 188;


/**
 * The size of an M2TS source packet: a transport packet behind a 4-octet
 * arrival timestamp.
 *
 * @const {number}
 */
shaka.msf.packaging.M2ts.M2TS_PACKET_SIZE = 192;


/**
 * @const {number}
 */
shaka.msf.packaging.M2ts.M2TS_TIMESTAMP_PREFIX_SIZE = 4;


/**
 * Accumulates a Group's objects and emits it as one segment once the Group
 * ends, which is when an object from the next Group arrives.
 *
 * @implements {shaka.extern.MsfSegmenter}
 * @final
 */
shaka.msf.packaging.M2tsSegmenter = class {
  /**
   * @param {number} packetSize
   * @param {!Uint8Array} psi
   * @param {string} timingContentType
   * @param {number} frameDuration Seconds per frame from the catalog, or 0
   *   when the catalog does not say.
   * @param {?number} pcrPid
   */
  constructor(packetSize, psi, timingContentType, frameDuration, pcrPid) {
    /** @private {number} */
    this.packetSize_ = packetSize;

    /** @private {!Uint8Array} */
    this.psi_ = psi;

    /** @private {string} */
    this.timingContentType_ = timingContentType;

    /** @private {number} */
    this.frameDuration_ = frameDuration;

    /** @private {?number} */
    this.pcrPid_ = pcrPid;

    /**
     * Kept across groups so that its 33-bit timestamp rollover reference
     * survives, which is what lets a group that straddles the wrap be timed
     * correctly.
     * @private {!shaka.util.TsParser}
     */
    this.tsParser_ = new shaka.util.TsParser();

    /** @private {?bigint} */
    this.group_ = null;

    /** @private {!Array<!Uint8Array>} */
    this.chunks_ = [];

    /** @private {number} */
    this.packetCount_ = 0;

    /** @private {boolean} */
    this.discontinuityInGroup_ = false;

    /** @private {number} */
    this.discontinuitySequence_ = 0;

    /**
     * Maps media time onto presentation time. Non-zero only once a
     * discontinuity has moved the media's own clock.
     * @private {number}
     */
    this.timelineOffset_ = 0;

    /** @private {?number} */
    this.previousEndTime_ = null;
  }

  /**
   * @override
   */
  push(obj) {
    /** @type {!Array<!shaka.extern.MsfSegment>} */
    const segments = [];

    if (this.group_ !== null && obj.location.group !== this.group_) {
      const segment = this.flush_();
      if (segment) {
        segments.push(segment);
      }
    }
    this.group_ = obj.location.group;

    if (obj.data.byteLength) {
      this.append_(obj.data);
    }

    return segments;
  }

  /**
   * Validates an object's source packets and holds onto them until the group
   * ends.
   *
   * @param {!Uint8Array} data
   * @private
   */
  append_(data) {
    const M2ts = shaka.msf.packaging.M2ts;
    const size = this.packetSize_;

    if (data.byteLength % size) {
      shaka.log.warning('Dropping m2ts object whose payload is not a whole ' +
          `number of ${size}-octet source packets.`);
      return;
    }

    // In a 192-octet source packet the transport packet starts after the
    // timestamp prefix.
    const tsOffset = size - M2ts.TS_PACKET_SIZE;
    let discontinuity = false;

    for (let i = 0; i + size <= data.byteLength; i += size) {
      const packet = i + tsOffset;
      if (data[packet] != 0x47) {
        shaka.log.warning('Dropping m2ts object with a source packet that ' +
            'does not start with the sync byte 0x47.');
        return;
      }
      if (!discontinuity && this.isDiscontinuity_(data, packet)) {
        discontinuity = true;
      }
    }

    this.chunks_.push(data);
    this.packetCount_ += data.byteLength / size;
    if (discontinuity) {
      this.discontinuityInGroup_ = true;
    }
  }

  /**
   * Reads the adaptation field's discontinuity_indicator, which is how the
   * draft requires a publisher to signal that it moved the clock between two
   * groups.
   *
   * When the catalog names the PCR PID we only trust that PID, because on
   * other PIDs the same bit signals a continuity counter discontinuity, which
   * is a different thing and does not move the clock.
   *
   * @param {!Uint8Array} data
   * @param {number} packet Offset of the transport packet.
   * @return {boolean}
   * @private
   */
  isDiscontinuity_(data, packet) {
    const adaptationFieldControl = (data[packet + 3] & 0x30) >> 4;
    // 0 and 1 mean there is no adaptation field to read the flag out of.
    if (adaptationFieldControl <= 1) {
      return false;
    }
    // An adaptation field of length zero is a single stuffing octet.
    if (!data[packet + 4]) {
      return false;
    }
    if (!(data[packet + 5] & 0x80)) {
      return false;
    }
    if (this.pcrPid_ == null) {
      return true;
    }
    const pid = ((data[packet + 1] & 0x1f) << 8) | data[packet + 2];
    return pid == this.pcrPid_;
  }

  /**
   * Turns the accumulated group into a segment.
   *
   * @return {?shaka.extern.MsfSegment}
   * @private
   */
  flush_() {
    if (!this.packetCount_) {
      this.resetGroup_();
      return null;
    }

    const discontinuity = this.discontinuityInGroup_;
    if (discontinuity) {
      this.discontinuitySequence_++;
    }

    const data = this.buildGroupData_();
    this.resetGroup_();

    this.tsParser_.clearData();
    this.tsParser_.setDiscontinuitySequence(this.discontinuitySequence_);
    this.tsParser_.parse(data);

    const timing = this.getTiming_();
    if (!timing) {
      shaka.log.warning('Dropping m2ts group with no usable timestamps.');
      return null;
    }

    if (discontinuity && this.previousEndTime_ != null) {
      // The media's clock moved. Re-anchor it so that presentation time keeps
      // running forward, which the rest of the player requires, and shift the
      // media by the same amount at append time so the two stay in step.
      this.timelineOffset_ = this.previousEndTime_ - timing.startTime;
    }

    const startTime = timing.startTime + this.timelineOffset_;
    this.previousEndTime_ = startTime + timing.duration;

    return {
      startTime,
      duration: timing.duration,
      data,
      timestampOffset: this.timelineOffset_,
      discontinuitySequence: this.discontinuitySequence_,
    };
  }

  /**
   * Copies the group's transport packets into one buffer, behind the
   * initialization packets.
   *
   * The 192-to-188 normalization happens as part of this copy rather than as a
   * pass of its own, so supporting M2TS source packets costs no extra
   * allocation and no extra traffic over the plain transport stream path.
   *
   * The PAT/PMT is prepended because the draft only requires a publisher to
   * repeat the program information periodically, so a group may open without
   * it, and a transport stream cannot be interpreted without it.
   *
   * @return {!Uint8Array}
   * @private
   */
  buildGroupData_() {
    const M2ts = shaka.msf.packaging.M2ts;
    const packetSize = M2ts.TS_PACKET_SIZE;

    const out = new Uint8Array(
        this.psi_.byteLength + this.packetCount_ * packetSize);
    out.set(this.psi_, 0);
    let offset = this.psi_.byteLength;

    for (const chunk of this.chunks_) {
      if (this.packetSize_ == packetSize) {
        out.set(chunk, offset);
        offset += chunk.byteLength;
      } else {
        for (let i = 0; i + this.packetSize_ <= chunk.byteLength;
          i += this.packetSize_) {
          const start = i + M2ts.M2TS_TIMESTAMP_PREFIX_SIZE;
          out.set(chunk.subarray(start, start + packetSize), offset);
          offset += packetSize;
        }
      }
    }

    return out;
  }

  /**
   * Derives the group's presentation timing from the timestamps of the
   * elementary stream the track is presented as.
   *
   * @return {?{startTime: number, duration: number}}
   * @private
   */
  getTiming_() {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const timescale = shaka.util.TsParser.Timescale;

    const pesList = this.timingContentType_ == ContentType.VIDEO ?
        this.tsParser_.getVideoData(/* naluProcessing= */ false) :
        this.tsParser_.getAudioData();

    let earliest = Infinity;
    let latestPts = -Infinity;
    let count = 0;
    for (const pes of pesList) {
      if (pes.pts == null) {
        continue;
      }
      // A frame is decoded at its DTS and presented at its PTS, so the group
      // starts at the earlier of the two and ends at the last PTS.
      const start = pes.dts != null ? Math.min(pes.pts, pes.dts) : pes.pts;
      earliest = Math.min(earliest, start);
      latestPts = Math.max(latestPts, pes.pts);
      count++;
    }

    if (!count) {
      return null;
    }

    const startTime = earliest / timescale;
    const span = (latestPts - earliest) / timescale;

    // The last frame's own duration is not in the timestamps. Use the
    // catalog's framerate when it has one, and otherwise the average spacing
    // of this group's frames.
    let lastFrameDuration = this.frameDuration_;
    if (!lastFrameDuration && count > 1) {
      lastFrameDuration = span / (count - 1);
    }

    const duration = span + lastFrameDuration;
    if (!(duration > 0)) {
      return null;
    }

    return {startTime, duration};
  }

  /**
   * @private
   */
  resetGroup_() {
    this.chunks_ = [];
    this.packetCount_ = 0;
    this.discontinuityInGroup_ = false;
  }
};


shaka.msf.PackagingRegistry.registerPackaging(
    'm2ts', () => new shaka.msf.packaging.M2ts());
