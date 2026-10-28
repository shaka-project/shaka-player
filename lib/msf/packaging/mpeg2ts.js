/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.packaging.Mpeg2ts');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.media.SegmentUtils');
goog.require('shaka.msf.PackagingRegistry');
goog.require('shaka.msf.packaging.Mpeg2tsProgram');
goog.require('shaka.util.Error');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.TsParser');


/**
 * Packaging for MPEG-2 Transport Stream tracks, where a MoQT object is a run
 * of whole source packets.
 *
 * Unlike the other packagings, an object is not a segment. A transport packet
 * carries no timing of its own, a PES packet spans many of them, and an object
 * boundary falls wherever the publisher chose to cut, so a single object is
 * neither self-describing nor independently decodable. The Group is the
 * smallest unit that can be appended, and objects are accumulated until the
 * Group ends.
 *
 * That costs roughly one Group of latency, which is the price of the format:
 * there is no smaller boundary that can be cut safely.
 *
 * Of the draft's carriage modes, the ones that carry a whole program are
 * supported: "unmodified-program", "per-program" and "unmodified-multiplex",
 * which is cut down to its reference program. "es-packets" splits a program
 * into one track per PID, which would have to be put back together before it
 * could be played, and is not supported yet.
 *
 * @see https://datatracker.ietf.org/doc/draft-gregoire-moq-msfts/
 *
 * @implements {shaka.extern.MsfPackaging}
 * @final
 */
shaka.msf.packaging.Mpeg2ts = class {
  constructor() {
    /** @private {?shaka.msf.packaging.Mpeg2ts.Config} */
    this.config_ = null;
  }

  /**
   * @override
   */
  describeTrack(track, initData) {
    const Mpeg2ts = shaka.msf.packaging.Mpeg2ts;
    const Mode = Mpeg2ts.Mode_;
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const name = track.name;

    const mode = track.mpeg2tsMode;
    if (mode == Mode.ES_PACKETS) {
      shaka.log.alwaysWarn(`mpeg2ts track "${name}" uses the "es-packets" ` +
          'mode, which is not supported yet; skipping.');
      return null;
    }
    if (mode != Mode.UNMODIFIED_PROGRAM && mode != Mode.PER_PROGRAM &&
        mode != Mode.UNMODIFIED_MULTIPLEX) {
      shaka.log.alwaysWarn(`mpeg2ts track "${name}" declares an unknown ` +
          `mpeg2tsMode "${mode}"; skipping.`);
      return null;
    }

    const packetSize = track.mpeg2tsPacketSize;
    if (packetSize != Mpeg2ts.TS_PACKET_SIZE &&
        packetSize != Mpeg2ts.M2TS_PACKET_SIZE) {
      shaka.log.alwaysWarn(`mpeg2ts track "${name}" declares an ` +
          `unsupported mpeg2tsPacketSize ${packetSize}; skipping. Only 188 ` +
          'and 192 are supported.');
      return null;
    }

    if (track.mpeg2tsEsPid != undefined) {
      shaka.log.alwaysWarn(`mpeg2ts track "${name}" declares mpeg2tsEsPid ` +
          'outside the "es-packets" mode; skipping.');
      return null;
    }

    // The catalog is untrusted input, and these values decide which packets
    // are kept.
    const ranges = [
      ['mpeg2tsProgramNumber', track.mpeg2tsProgramNumber, 1, 0xffff],
      ['mpeg2tsPcrPid', track.mpeg2tsPcrPid, 0, Mpeg2ts.MAX_PID_],
    ];
    for (const [field, value, min, max] of ranges) {
      if (value != undefined &&
          !(Number.isInteger(value) && value >= min && value <= max)) {
        shaka.log.alwaysWarn(`mpeg2ts track "${name}" declares an invalid ` +
            `${field} ${value}; skipping.`);
        return null;
      }
    }

    const isMultiplex = mode == Mode.UNMODIFIED_MULTIPLEX;
    if (isMultiplex) {
      // Only one program of a multiplex can be played, and without a
      // reference program nothing says which.
      if (track.mpeg2tsProgramNumber == undefined) {
        shaka.log.alwaysWarn(`mpeg2ts track "${name}" carries a multiplex ` +
            'without naming a reference program in mpeg2tsProgramNumber; ' +
            'skipping.');
        return null;
      }
      if (track.altGroup != undefined) {
        shaka.log.alwaysWarn(`mpeg2ts track "${name}" carries a multiplex ` +
            'in an altGroup, which the draft forbids; skipping.');
        return null;
      }
    }

    if (track.mpeg2tsTimestampMode != undefined &&
        packetSize == Mpeg2ts.TS_PACKET_SIZE) {
      shaka.log.warning(`mpeg2ts track "${name}" declares ` +
          'mpeg2tsTimestampMode for 188-octet packets, which have no ' +
          'timestamp prefix; ignoring it.');
    }

    const randomAccess = track.mpeg2tsRandomAccess === true;
    if (!randomAccess) {
      shaka.log.info(`mpeg2ts track "${name}" does not guarantee that a ` +
          'group begins at a random access point, so the first group is ' +
          'played from its first one.');
    }

    let rawPsi = new Uint8Array(0);
    if (initData.byteLength) {
      if (Mpeg2ts.isWholePackets_(initData, packetSize)) {
        rawPsi = Mpeg2ts.normalizePackets_(initData, packetSize);
      } else {
        shaka.log.warning(`mpeg2ts track "${name}" has initialization data ` +
            'that is not a run of whole source packets; ignoring it.');
      }
    }

    // Outside a multiplex the program number is advisory, and the PAT, which
    // takes precedence, lists only the one program anyway.
    const programNumber = isMultiplex ?
        /** @type {number} */ (track.mpeg2tsProgramNumber) : null;
    const program =
        new shaka.msf.packaging.Mpeg2tsProgram(programNumber, isMultiplex);
    Mpeg2ts.feed_(program, rawPsi);
    // A multiplex's initialization data may still list every program, so
    // only what was learnt of the reference program is kept of it.
    const psi = isMultiplex ? program.getPsi() : rawPsi;

    // The codec decides which source buffers MediaSource opens, which happens
    // before the first group has arrived. The draft leaves it to the base MSF
    // catalog, and failing that it can be read from the PMT.
    let codecs = [];
    if (track.codec) {
      codecs = track.codec.split(',')
          .map((codec) => codec.trim())
          .filter((codec) => codec.length);
    } else {
      codecs = Mpeg2ts.codecsFromPsi_(program.getPsi());
      if (!codecs.length) {
        shaka.log.alwaysWarn(`mpeg2ts track "${name}" declares no codec, ` +
            'and none can be read from initialization data; skipping.');
        return null;
      }
    }

    const hasVideo = codecs.some((codec) => Mpeg2ts.isVideoCodec_(codec));
    const hasAudio = codecs.some((codec) => Mpeg2ts.isAudioCodec_(codec));
    if (!hasVideo && !hasAudio) {
      shaka.log.alwaysWarn(`mpeg2ts track "${name}" declares no ` +
          `recognized codec ("${codecs.join(',')}"); skipping.`);
      return null;
    }

    this.config_ = {
      packetSize,
      psi,
      programNumber,
      filter: isMultiplex,
      // Timestamps are read from whichever elementary stream the track is
      // presented as. A muxed program is presented as video.
      timingContentType: hasVideo ? ContentType.VIDEO : ContentType.AUDIO,
      frameDuration: track.framerate ? 1 / track.framerate : 0,
      pcrPid: track.mpeg2tsPcrPid != undefined ? track.mpeg2tsPcrPid : null,
      randomAccess,
    };

    // A muxed program keeps both codecs on the one stream. MediaSourceEngine
    // recognizes that combination and opens a source buffer for each, feeding
    // both from this stream's segments.
    const basicInfo = shaka.media.SegmentUtils.getBasicInfoFromMimeType(
        `video/mp2t; codecs="${codecs.join(',')}"`);

    // Transport streams have no initialization segment. The PAT/PMT that plays
    // its part is prepended to a group that lacks it instead, because it is
    // part of the transport stream rather than something appended before it.
    return {basicInfo, initSegmentReference: null};
  }

  /**
   * @override
   */
  createSegmenter() {
    goog.asserts.assert(this.config_, 'The track must be described first');
    return new shaka.msf.packaging.Mpeg2tsSegmenter(
        /** @type {shaka.msf.packaging.Mpeg2ts.Config} */ (this.config_));
  }

  /**
   * @param {!shaka.msf.packaging.Mpeg2tsProgram} program
   * @param {!Uint8Array} data 188-octet transport packets.
   * @private
   */
  static feed_(program, data) {
    const size = shaka.msf.packaging.Mpeg2ts.TS_PACKET_SIZE;
    for (let i = 0; i + size <= data.byteLength; i += size) {
      program.process(data.subarray(i, i + size));
    }
  }

  /**
   * @param {!Uint8Array} data
   * @param {number} packetSize
   * @return {boolean}
   * @private
   */
  static isWholePackets_(data, packetSize) {
    if (data.byteLength % packetSize) {
      return false;
    }
    const tsOffset = packetSize - shaka.msf.packaging.Mpeg2ts.TS_PACKET_SIZE;
    for (let i = tsOffset; i < data.byteLength; i += packetSize) {
      if (data[i] != 0x47) {
        return false;
      }
    }
    return true;
  }

  /**
   * Copies out the 188-octet transport packets of a buffer of source packets,
   * dropping the 4-octet prefix of 192-octet M2TS source packets.
   *
   * Whatever the prefix carries -- an arrival time, or something the draft
   * leaves opaque -- says nothing about presentation, so nothing downstream
   * wants it. Removing it here means the rest of the player only ever sees
   * plain transport packets.
   *
   * @param {!Uint8Array} data
   * @param {number} packetSize
   * @return {!Uint8Array}
   * @private
   */
  static normalizePackets_(data, packetSize) {
    const Mpeg2ts = shaka.msf.packaging.Mpeg2ts;
    if (packetSize == Mpeg2ts.TS_PACKET_SIZE) {
      return data;
    }

    const count = Math.floor(data.byteLength / packetSize);
    const out = new Uint8Array(count * Mpeg2ts.TS_PACKET_SIZE);
    for (let i = 0; i < count; i++) {
      const start = i * packetSize + Mpeg2ts.M2TS_PREFIX_SIZE;
      out.set(data.subarray(start, start + Mpeg2ts.TS_PACKET_SIZE),
          i * Mpeg2ts.TS_PACKET_SIZE);
    }
    return out;
  }

  /**
   * Reads the codecs of a program from its PMT.
   *
   * A PMT only says which kind of codec each stream uses, not its profile or
   * level, so these are the same defaults used when a transport stream is
   * probed. The transmuxer writes the real ones into the initialization
   * segment it produces.
   *
   * @param {!Uint8Array} psi The program's PAT and PMT.
   * @return {!Array<string>}
   * @private
   */
  static codecsFromPsi_(psi) {
    const Mpeg2ts = shaka.msf.packaging.Mpeg2ts;
    if (!psi.byteLength) {
      return [];
    }
    // TsParser ignores anything shorter than three packets, so a null packet
    // pads out a lone PAT and PMT.
    const data = new Uint8Array(psi.byteLength + Mpeg2ts.TS_PACKET_SIZE);
    data.set(psi);
    data.set([0x47, 0x1f, 0xff, 0x10], psi.byteLength);
    const tsCodecs = new shaka.util.TsParser().parse(data).getCodecs();

    const codecs = [];
    const video = Mpeg2ts.DEFAULT_VIDEO_CODECS_.get(tsCodecs.video || '');
    if (video) {
      codecs.push(video);
    }
    const audio = Mpeg2ts.DEFAULT_AUDIO_CODECS_.get(tsCodecs.audio || '');
    if (audio) {
      codecs.push(audio);
    }
    return codecs;
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
 * What a segmenter needs to know about its track.
 *
 * @typedef {{
 *   packetSize: number,
 *   psi: !Uint8Array,
 *   programNumber: ?number,
 *   filter: boolean,
 *   timingContentType: string,
 *   frameDuration: number,
 *   pcrPid: ?number,
 *   randomAccess: boolean,
 * }}
 *
 * @property {number} packetSize
 *   The source packet size, 188 or 192.
 * @property {!Uint8Array} psi
 *   The catalog's initialization packets, normalized to 188 octets.
 * @property {?number} programNumber
 *   The program to follow, or null for the first one.
 * @property {boolean} filter
 *   Whether the track is a multiplex to cut down to that program.
 * @property {string} timingContentType
 *   The elementary stream the track's timing is read from.
 * @property {number} frameDuration
 *   Seconds per frame from the catalog, or 0 when it does not say.
 * @property {?number} pcrPid
 *   The catalog's PCR PID, used until the PMT has been seen.
 * @property {boolean} randomAccess
 *   Whether every group is guaranteed to begin at a random access point.
 */
shaka.msf.packaging.Mpeg2ts.Config;


/**
 * The values of mpeg2tsMode.
 *
 * @enum {string}
 * @private
 */
shaka.msf.packaging.Mpeg2ts.Mode_ = {
  UNMODIFIED_PROGRAM: 'unmodified-program',
  UNMODIFIED_MULTIPLEX: 'unmodified-multiplex',
  PER_PROGRAM: 'per-program',
  ES_PACKETS: 'es-packets',
};


/**
 * The size of an MPEG-2 transport packet.
 *
 * @const {number}
 */
shaka.msf.packaging.Mpeg2ts.TS_PACKET_SIZE = 188;


/**
 * The size of an M2TS source packet: a transport packet behind a 4-octet
 * prefix.
 *
 * @const {number}
 */
shaka.msf.packaging.Mpeg2ts.M2TS_PACKET_SIZE = 192;


/**
 * @const {number}
 */
shaka.msf.packaging.Mpeg2ts.M2TS_PREFIX_SIZE = 4;


/**
 * @private @const {number}
 */
shaka.msf.packaging.Mpeg2ts.MAX_PID_ = 0x1fff;


/**
 * @private @const {!Map<string, string>}
 */
shaka.msf.packaging.Mpeg2ts.DEFAULT_VIDEO_CODECS_ = new Map([
  ['avc', 'avc1.42E01E'],
  ['hvc', 'hvc1.1.6.L93.90'],
  ['av1', 'av01.0.01M.08'],
]);


/**
 * @private @const {!Map<string, string>}
 */
shaka.msf.packaging.Mpeg2ts.DEFAULT_AUDIO_CODECS_ = new Map([
  ['aac', 'mp4a.40.2'],
  ['aac-loas', 'mp4a.40.2'],
  ['mp3', 'mp4a.40.34'],
  ['ac3', 'ac-3'],
  ['ec3', 'ec-3'],
  ['opus', 'opus'],
]);


/**
 * Accumulates a Group's objects and emits it as one segment once the Group
 * ends, which is when an object from the next Group arrives.
 *
 * @implements {shaka.extern.MsfSegmenter}
 * @final
 */
shaka.msf.packaging.Mpeg2tsSegmenter = class {
  /**
   * @param {shaka.msf.packaging.Mpeg2ts.Config} config
   */
  constructor(config) {
    /** @private {shaka.msf.packaging.Mpeg2ts.Config} */
    this.config_ = config;

    /** @private {!shaka.msf.packaging.Mpeg2tsProgram} */
    this.program_ = new shaka.msf.packaging.Mpeg2tsProgram(
        config.programNumber, config.filter);
    shaka.msf.packaging.Mpeg2ts.feed_(this.program_, config.psi);

    /**
     * Kept across groups so that its 33-bit timestamp rollover reference
     * survives, which is what lets a group that straddles the wrap be timed
     * correctly.
     * @private {!shaka.util.TsParser}
     */
    this.tsParser_ = new shaka.util.TsParser();

    /** @private {?bigint} */
    this.group_ = null;

    /**
     * The 188-octet transport packets kept of the current part of the group.
     * @private {!Array<!Uint8Array>}
     */
    this.packets_ = [];

    /**
     * The PAT and PMT known when the current part began, which is what to put
     * in front of it if it does not open with its own.
     * @private {!Uint8Array}
     */
    this.psi_ = new Uint8Array(0);

    /** @private {boolean} */
    this.startsWithPsi_ = false;

    /**
     * Whether an elementary stream has started a PES packet in the current
     * part, which is what makes a discontinuity worth a part of its own.
     * @private {boolean}
     */
    this.hasMedia_ = false;

    /** @private {boolean} */
    this.discontinuity_ = false;

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

    /**
     * Whether the first random access point is still to come. A subscription
     * joins a track at the start of a Group, and when the catalog does not
     * guarantee that a Group starts at a random access point, what comes
     * before the first one cannot be decoded.
     * @private {boolean}
     */
    this.waitingForRandomAccess_ = !config.randomAccess;
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
      segments.push(...this.append_(obj.data));
    }

    return segments;
  }

  /**
   * Validates an object's source packets and holds onto what is kept of them
   * until the group ends.
   *
   * @param {!Uint8Array} data
   * @return {!Array<!shaka.extern.MsfSegment>} A part of the group cut short
   *   by a discontinuity, if there was one.
   * @private
   */
  append_(data) {
    const Mpeg2ts = shaka.msf.packaging.Mpeg2ts;
    const Mpeg2tsProgram = shaka.msf.packaging.Mpeg2tsProgram;
    const size = this.config_.packetSize;

    if (!Mpeg2ts.isWholePackets_(data, size)) {
      shaka.log.warning('Dropping mpeg2ts object whose payload is not a ' +
          `run of whole ${size}-octet source packets.`);
      return [];
    }

    /** @type {!Array<!shaka.extern.MsfSegment>} */
    const segments = [];

    // In a 192-octet source packet the transport packet starts after the
    // prefix.
    const tsOffset = size - Mpeg2ts.TS_PACKET_SIZE;
    for (let i = 0; i < data.byteLength; i += size) {
      const packet = this.program_.process(data.subarray(
          i + tsOffset, i + tsOffset + Mpeg2ts.TS_PACKET_SIZE));
      if (!packet) {
        continue;
      }
      const pid = Mpeg2tsProgram.getPid(packet);
      const isPsi = this.program_.isPsiPid(pid);

      if (!isPsi && (packet[3] & 0xc0)) {
        shaka.log.alwaysWarn('The mpeg2ts track is scrambled at the ' +
            'transport stream level, which browsers cannot descramble.');
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MANIFEST,
            shaka.util.Error.Code.CONTENT_UNSUPPORTED_BY_BROWSER);
      }

      if (!isPsi && this.isDiscontinuity_(packet, pid)) {
        // In the unmodified modes a discontinuity in the source reaches us
        // wherever it happened, so it can fall in the middle of a Group. The
        // media on either side of it is on a different clock and cannot be
        // timed as one segment.
        if (this.hasMedia_) {
          const segment = this.flush_();
          if (segment) {
            segments.push(segment);
          }
        }
        this.discontinuity_ = true;
      }

      if (!this.packets_.length) {
        this.startsWithPsi_ = isPsi;
        this.psi_ = this.program_.getPsi();
        if (!this.psi_.byteLength) {
          this.psi_ = this.config_.psi;
        }
      }
      if (!isPsi && (packet[1] & 0x40)) {
        this.hasMedia_ = true;
      }
      this.packets_.push(packet);
    }

    return segments;
  }

  /**
   * Reads the adaptation field's discontinuity_indicator, which is how the
   * draft requires a publisher to signal that it moved the clock between two
   * groups.
   *
   * Only the PCR PID is trusted, because on other PIDs the same bit signals a
   * continuity counter discontinuity, which is a different thing and does not
   * move the clock. The PMT says which PID that is; the catalog's value is
   * advisory and only used until the PMT has been seen.
   *
   * @param {!Uint8Array} packet
   * @param {number} pid
   * @return {boolean}
   * @private
   */
  isDiscontinuity_(packet, pid) {
    const adaptationFieldControl = (packet[3] & 0x30) >> 4;
    // 0 and 1 mean there is no adaptation field to read the flag out of.
    if (adaptationFieldControl <= 1) {
      return false;
    }
    // An adaptation field of length zero is a single stuffing octet.
    if (!packet[4]) {
      return false;
    }
    if (!(packet[5] & 0x80)) {
      return false;
    }
    let pcrPid = this.program_.getPcrPid();
    if (pcrPid == null) {
      pcrPid = this.config_.pcrPid;
    }
    return pcrPid == null || pid == pcrPid;
  }

  /**
   * Turns the accumulated part of the group into a segment.
   *
   * @return {?shaka.extern.MsfSegment}
   * @private
   */
  flush_() {
    const Mpeg2tsProgram = shaka.msf.packaging.Mpeg2tsProgram;

    let packets = this.packets_;
    const psi = this.startsWithPsi_ ? new Uint8Array(0) : this.psi_;
    const discontinuity = this.discontinuity_;
    this.resetGroup_();

    if (!packets.length) {
      return null;
    }

    if (this.waitingForRandomAccess_) {
      const start = this.findRandomAccess_(packets);
      if (start < 0) {
        shaka.log.info('Dropping an mpeg2ts group with no random access ' +
            'point to start playback from.');
        return null;
      }
      if (start > 0) {
        // The program information ahead of it is still needed to read it.
        packets = packets.filter((packet, i) => i >= start ||
            this.program_.isPsiPid(Mpeg2tsProgram.getPid(packet)));
      }
      this.waitingForRandomAccess_ = false;
    }

    if (discontinuity) {
      this.discontinuitySequence_++;
    }

    const data = this.buildData_(psi, packets);

    this.tsParser_.clearData();
    this.tsParser_.setDiscontinuitySequence(this.discontinuitySequence_);
    this.tsParser_.parse(data);

    const timing = this.getTiming_();
    if (!timing) {
      shaka.log.warning('Dropping mpeg2ts group with no usable timestamps.');
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
      independent: this.config_.randomAccess ||
          this.tsParser_.startsWithVideoKeyframe() !== false,
      group: this.group_ === null ? undefined : this.group_,
    };
  }

  /**
   * Copies the part's transport packets into one buffer, behind the program
   * information it needs.
   *
   * The PAT/PMT is prepended because the draft only requires a publisher to
   * repeat the program information periodically, so a group may open without
   * it, and a transport stream cannot be interpreted without it. The latest
   * one seen in the track is used rather than the catalog's, because the
   * program information in the media takes precedence when the two differ.
   *
   * @param {!Uint8Array} psi
   * @param {!Array<!Uint8Array>} packets
   * @return {!Uint8Array}
   * @private
   */
  buildData_(psi, packets) {
    const size = shaka.msf.packaging.Mpeg2ts.TS_PACKET_SIZE;
    const out = new Uint8Array(psi.byteLength + packets.length * size);
    out.set(psi, 0);
    let offset = psi.byteLength;
    for (const packet of packets) {
      out.set(packet, offset);
      offset += size;
    }
    return out;
  }

  /**
   * The index of the packet that starts the first random access point among
   * the given packets, or -1 when there is none.
   *
   * A random access point is a PES packet of the video stream that the
   * publisher flagged with random_access_indicator, or whose first picture is
   * an IDR. A track without H.264 or H.265 video can be decoded from
   * anywhere, as far as can be told here.
   *
   * @param {!Array<!Uint8Array>} packets
   * @return {number}
   * @private
   */
  findRandomAccess_(packets) {
    const Mpeg2tsProgram = shaka.msf.packaging.Mpeg2tsProgram;
    const video = this.program_.getVideoStream();
    if (!video) {
      return 0;
    }
    for (let i = 0; i < packets.length; i++) {
      const packet = packets[i];
      if (Mpeg2tsProgram.getPid(packet) != video.pid ||
          !(packet[1] & 0x40)) {
        continue;
      }
      const adaptationFieldControl = (packet[3] & 0x30) >> 4;
      if (adaptationFieldControl > 1 && packet[4] && (packet[5] & 0x40)) {
        return i;
      }
      if (this.startsWithIdr_(packets, i, video.pid, video.streamType)) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Whether the first picture of the PES packet that starts at the given
   * packet is an IDR.
   *
   * @param {!Array<!Uint8Array>} packets
   * @param {number} index
   * @param {number} pid
   * @param {number} streamType
   * @return {boolean}
   * @private
   */
  startsWithIdr_(packets, index, pid, streamType) {
    const Mpeg2tsProgram = shaka.msf.packaging.Mpeg2tsProgram;
    const Mpeg2tsSegmenter = shaka.msf.packaging.Mpeg2tsSegmenter;
    const isHevc = streamType == 0x24;

    // The first picture follows the parameter sets and SEI, which fit in a
    // few packets; looking further would only cost time.
    const payloads = [];
    let length = 0;
    for (let i = index; i < packets.length &&
        payloads.length < Mpeg2tsSegmenter.MAX_IDR_SCAN_PACKETS_; i++) {
      const packet = packets[i];
      if (Mpeg2tsProgram.getPid(packet) != pid) {
        continue;
      }
      if (i > index && (packet[1] & 0x40)) {
        break;
      }
      const payload =
          packet.subarray(Mpeg2tsProgram.getPayloadOffset(packet));
      payloads.push(payload);
      length += payload.byteLength;
    }
    const data = new Uint8Array(length);
    let offset = 0;
    for (const payload of payloads) {
      data.set(payload, offset);
      offset += payload.byteLength;
    }

    // Skip the PES header to reach the elementary stream.
    if (data.byteLength < 9 || data[0] || data[1] || data[2] != 1) {
      return false;
    }
    for (let i = 9 + data[8]; i + 3 < data.byteLength; i++) {
      if (data[i] || data[i + 1] || data[i + 2] != 1) {
        continue;
      }
      i += 3;
      if (isHevc) {
        const type = (data[i] >> 1) & 0x3f;
        // 16 to 21 are the random access pictures, below them the rest.
        if (type <= 21) {
          return type >= 16;
        }
      } else {
        const type = data[i] & 0x1f;
        // 5 is an IDR slice, 1 to 4 the rest.
        if (type >= 1 && type <= 5) {
          return type == 5;
        }
      }
    }
    return false;
  }

  /**
   * Derives the part's presentation timing from the timestamps of the
   * elementary stream the track is presented as.
   *
   * @return {?{startTime: number, duration: number}}
   * @private
   */
  getTiming_() {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const timescale = shaka.util.TsParser.Timescale;

    const pesList = this.config_.timingContentType == ContentType.VIDEO ?
        this.tsParser_.getVideoData(/* naluProcessing= */ false) :
        this.tsParser_.getAudioData();

    let earliest = Infinity;
    let latestPts = -Infinity;
    let count = 0;
    for (const pes of pesList) {
      if (pes.pts == null) {
        continue;
      }
      // A frame is decoded at its DTS and presented at its PTS, so the part
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
    // of this part's frames.
    let lastFrameDuration = this.config_.frameDuration;
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
    this.packets_ = [];
    this.psi_ = new Uint8Array(0);
    this.startsWithPsi_ = false;
    this.hasMedia_ = false;
    this.discontinuity_ = false;
  }
};


/**
 * @private @const {number}
 */
shaka.msf.packaging.Mpeg2tsSegmenter.MAX_IDR_SCAN_PACKETS_ = 64;


shaka.msf.PackagingRegistry.registerPackaging(
    'mpeg2ts', () => new shaka.msf.packaging.Mpeg2ts());
