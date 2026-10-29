/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.packaging.Mpeg2tsProgram');

goog.require('shaka.log');
goog.require('shaka.util.TsParser');


/**
 * Follows the program specific information of one program in a transport
 * stream, packet by packet.
 *
 * It learns which PIDs make up the program from its PAT and PMT, remembers the
 * latest PAT and PMT so they can be put back in front of a Group that opens
 * without them.
 *
 * When asked to filter, it also cuts a multi-program transport stream down to
 * the one program: every packet of another program is dropped and the PAT is
 * rewritten to list only the program kept. The transmuxer's own parser follows
 * whichever program the PAT lists first, so a stream that still listed the
 * others would play the wrong one.
 *
 * @final
 */
shaka.msf.packaging.Mpeg2tsProgram = class {
  /**
   * @param {?number} programNumber The program to follow, or null for the
   *   first one the PAT lists.
   * @param {boolean} filter Whether to drop the packets of every other program
   *   and rewrite the PAT to list only this one.
   */
  constructor(programNumber, filter) {
    /** @private {?number} */
    this.programNumber_ = programNumber;

    /** @private {boolean} */
    this.filter_ = filter;

    /**
     * The program the PAT selected, which is the requested one when there is
     * one.
     * @private {?number}
     */
    this.selectedProgram_ = null;

    /** @private {?number} */
    this.pmtPid_ = null;

    /** @private {?number} */
    this.pcrPid_ = null;

    /**
     * The stream_type of each elementary stream the PMT lists, by PID.
     * @private {!Map<number, number>}
     */
    this.streams_ = new Map();

    /** @private {!Array<!Uint8Array>} */
    this.patPackets_ = [];

    /** @private {!Array<!Uint8Array>} */
    this.pmtPackets_ = [];

    /**
     * Sections still being reassembled, by PID.
     * @private {!Map<number, shaka.msf.packaging.Mpeg2tsProgram.Section>}
     */
    this.sections_ = new Map();

    /**
     * The rewritten PAT produced by the packet being processed, if any.
     * @private {?Uint8Array}
     */
    this.rewrittenPat_ = null;

    /** @private {number} */
    this.patContinuityCounter_ = 0;
  }

  /**
   * Reads one 188-octet transport packet and returns what should be kept of
   * it: the packet itself, a rewritten PAT in its place, or null when it does
   * not belong to the program.
   *
   * @param {!Uint8Array} packet
   * @return {?Uint8Array}
   */
  process(packet) {
    const Mpeg2tsProgram = shaka.msf.packaging.Mpeg2tsProgram;
    const pid = Mpeg2tsProgram.getPid(packet);

    if (pid == Mpeg2tsProgram.PAT_PID_) {
      this.rewrittenPat_ = null;
      this.readSections_(pid, packet);
      return this.filter_ ? this.rewrittenPat_ : packet;
    }
    if (pid == this.pmtPid_) {
      this.readSections_(pid, packet);
      return packet;
    }
    if (!this.filter_ || this.streams_.has(pid) || pid == this.pcrPid_) {
      return packet;
    }
    return null;
  }

  /**
   * The latest PAT and PMT of the program as transport packets, or an empty
   * array until both have been seen.
   *
   * @return {!Uint8Array}
   */
  getPsi() {
    if (!this.patPackets_.length || !this.pmtPackets_.length) {
      return new Uint8Array(0);
    }
    const packets = this.patPackets_.concat(this.pmtPackets_);
    const out = new Uint8Array(
        packets.length * shaka.msf.packaging.Mpeg2tsProgram.PACKET_SIZE);
    for (let i = 0; i < packets.length; i++) {
      out.set(packets[i], i * shaka.msf.packaging.Mpeg2tsProgram.PACKET_SIZE);
    }
    return out;
  }

  /**
   * Whether a PID carries the program's PAT or PMT.
   *
   * @param {number} pid
   * @return {boolean}
   */
  isPsiPid(pid) {
    return pid == shaka.msf.packaging.Mpeg2tsProgram.PAT_PID_ ||
        pid == this.pmtPid_;
  }

  /**
   * The PID the PMT says carries the program clock, or null until the PMT has
   * been seen or when the program has none.
   *
   * @return {?number}
   */
  getPcrPid() {
    const Mpeg2tsProgram = shaka.msf.packaging.Mpeg2tsProgram;
    return this.pcrPid_ == Mpeg2tsProgram.NULL_PID_ ? null : this.pcrPid_;
  }

  /**
   * The program's video elementary stream, or null when the PMT lists none
   * or has not been seen.
   *
   * @return {?{pid: number, streamType: number}}
   */
  getVideoStream() {
    for (const [pid, streamType] of this.streams_) {
      if (shaka.msf.packaging.Mpeg2tsProgram.VIDEO_STREAM_TYPES_.has(
          streamType)) {
        return {pid, streamType};
      }
    }
    return null;
  }

  /**
   * Reassembles the PSI sections a packet carries, which may finish one that
   * started in an earlier packet, start several, or both.
   *
   * @param {number} pid
   * @param {!Uint8Array} packet
   * @private
   */
  readSections_(pid, packet) {
    const Mpeg2tsProgram = shaka.msf.packaging.Mpeg2tsProgram;
    const size = Mpeg2tsProgram.PACKET_SIZE;

    let offset = Mpeg2tsProgram.getPayloadOffset(packet);
    if (offset >= size) {
      return;
    }

    const pending = this.sections_.get(pid);
    if (!(packet[1] & 0x40)) {
      if (pending) {
        this.continueSection_(pid, pending, packet, packet.subarray(offset));
      }
      return;
    }

    // The pointer field counts the octets that finish the previous section.
    const pointer = packet[offset];
    offset++;
    if (pending) {
      this.continueSection_(pid, pending, packet,
          packet.subarray(offset, Math.min(offset + pointer, size)));
    }
    this.sections_.delete(pid);
    offset += pointer;

    // Stuffing octets end the sections in a packet.
    while (offset + 3 <= size && packet[offset] != 0xff) {
      const length =
          3 + (((packet[offset + 1] & 0x0f) << 8) | packet[offset + 2]);
      if (length > Mpeg2tsProgram.MAX_SECTION_LENGTH_) {
        return;
      }
      /** @type {shaka.msf.packaging.Mpeg2tsProgram.Section} */
      const section = {
        data: new Uint8Array(length),
        received: 0,
        packets: [],
      };
      const chunk = packet.subarray(offset, Math.min(offset + length, size));
      offset += chunk.byteLength;
      if (!this.continueSection_(pid, section, packet, chunk)) {
        this.sections_.set(pid, section);
        return;
      }
    }
  }

  /**
   * @param {number} pid
   * @param {shaka.msf.packaging.Mpeg2tsProgram.Section} section
   * @param {!Uint8Array} packet
   * @param {!Uint8Array} chunk
   * @return {boolean} Whether the section is complete.
   * @private
   */
  continueSection_(pid, section, packet, chunk) {
    const take = Math.min(
        chunk.byteLength, section.data.byteLength - section.received);
    section.data.set(chunk.subarray(0, take), section.received);
    section.received += take;
    section.packets.push(packet);
    if (section.received < section.data.byteLength) {
      return false;
    }
    this.sections_.delete(pid);
    this.onSection_(pid, section.data, section.packets);
    return true;
  }

  /**
   * @param {number} pid
   * @param {!Uint8Array} section
   * @param {!Array<!Uint8Array>} packets The packets the section came in.
   * @private
   */
  onSection_(pid, section, packets) {
    const Mpeg2tsProgram = shaka.msf.packaging.Mpeg2tsProgram;
    if (shaka.util.TsParser.crc32(section)) {
      shaka.log.v1('Ignoring a transport stream section with a bad CRC');
      return;
    }
    const tableId = section[0];
    if (pid == Mpeg2tsProgram.PAT_PID_ && tableId == 0x00) {
      this.onPat_(section, packets);
    } else if (pid == this.pmtPid_ && tableId == 0x02) {
      this.onPmt_(section, packets);
    }
  }

  /**
   * @param {!Uint8Array} section
   * @param {!Array<!Uint8Array>} packets
   * @private
   */
  onPat_(section, packets) {
    const Mpeg2tsProgram = shaka.msf.packaging.Mpeg2tsProgram;

    let programNumber = null;
    let pmtPid = null;
    const end = section.byteLength - 4;
    for (let i = 8; i + 4 <= end; i += 4) {
      const number = (section[i] << 8) | section[i + 1];
      // Program 0 points at the network information table, not at a PMT.
      if (!number) {
        continue;
      }
      if (this.programNumber_ == null || number == this.programNumber_) {
        programNumber = number;
        pmtPid = ((section[i + 2] & 0x1f) << 8) | section[i + 3];
        break;
      }
    }
    if (programNumber == null || pmtPid == null) {
      shaka.log.warning(this.programNumber_ == null ?
          'The transport stream PAT lists no program' :
          `The transport stream PAT does not list program ` +
          `${this.programNumber_}`);
      return;
    }

    if (pmtPid != this.pmtPid_ || programNumber != this.selectedProgram_) {
      this.pmtPid_ = pmtPid;
      this.selectedProgram_ = programNumber;
      this.pcrPid_ = null;
      this.streams_.clear();
      this.pmtPackets_ = [];
      this.sections_.delete(pmtPid);
    }

    if (this.filter_) {
      this.rewrittenPat_ = this.buildPat_(section, programNumber, pmtPid);
      this.patPackets_ = [this.rewrittenPat_];
    } else {
      this.patPackets_ = Mpeg2tsProgram.copyPackets_(packets);
    }
  }

  /**
   * @param {!Uint8Array} section
   * @param {!Array<!Uint8Array>} packets
   * @private
   */
  onPmt_(section, packets) {
    // Several programs may share a PMT PID.
    const programNumber = (section[3] << 8) | section[4];
    if (programNumber != this.selectedProgram_) {
      return;
    }

    this.pcrPid_ = ((section[8] & 0x1f) << 8) | section[9];
    this.streams_.clear();

    const infoLength = ((section[10] & 0x0f) << 8) | section[11];
    const end = section.byteLength - 4;
    for (let i = 12 + infoLength; i + 5 <= end;) {
      const streamType = section[i];
      const pid = ((section[i + 1] & 0x1f) << 8) | section[i + 2];
      const esInfoLength = ((section[i + 3] & 0x0f) << 8) | section[i + 4];
      this.streams_.set(pid, streamType);
      i += 5 + esInfoLength;
    }

    this.pmtPackets_ =
        shaka.msf.packaging.Mpeg2tsProgram.copyPackets_(packets);
  }

  /**
   * Builds a PAT that lists only the given program.
   *
   * @param {!Uint8Array} source The PAT section it replaces.
   * @param {number} programNumber
   * @param {number} pmtPid
   * @return {!Uint8Array}
   * @private
   */
  buildPat_(source, programNumber, pmtPid) {
    const Mpeg2tsProgram = shaka.msf.packaging.Mpeg2tsProgram;

    const packet = new Uint8Array(Mpeg2tsProgram.PACKET_SIZE).fill(0xff);
    packet[0] = 0x47;
    // payload_unit_start_indicator, PID 0.
    packet[1] = 0x40;
    packet[2] = 0x00;
    // Payload only.
    packet[3] = 0x10 | this.patContinuityCounter_;
    this.patContinuityCounter_ = (this.patContinuityCounter_ + 1) & 0x0f;
    // pointer_field
    packet[4] = 0;

    const section = packet.subarray(5, 5 + 16);
    section[0] = 0x00;
    // section_syntax_indicator and a section_length of 13.
    section[1] = 0xb0;
    section[2] = 13;
    // transport_stream_id, version_number and current_next_indicator are the
    // source's, so a change to the source PAT still reads as one.
    section[3] = source[3];
    section[4] = source[4];
    section[5] = source[5];
    // section_number and last_section_number.
    section[6] = 0;
    section[7] = 0;
    section[8] = programNumber >> 8;
    section[9] = programNumber & 0xff;
    section[10] = 0xe0 | (pmtPid >> 8);
    section[11] = pmtPid & 0xff;

    const crc = shaka.util.TsParser.crc32(section.subarray(0, 12));
    section[12] = crc >>> 24;
    section[13] = (crc >>> 16) & 0xff;
    section[14] = (crc >>> 8) & 0xff;
    section[15] = crc & 0xff;

    return packet;
  }

  /**
   * @param {!Array<!Uint8Array>} packets
   * @return {!Array<!Uint8Array>}
   * @private
   */
  static copyPackets_(packets) {
    // The packets are views of a whole MoQT object, which a reference would
    // keep alive for as long as the PSI is.
    return packets.map((packet) => packet.slice());
  }

  /**
   * @param {!Uint8Array} packet
   * @return {number}
   */
  static getPid(packet) {
    return ((packet[1] & 0x1f) << 8) | packet[2];
  }

  /**
   * The offset of a transport packet's payload, which is the packet size when
   * it has none.
   *
   * @param {!Uint8Array} packet
   * @return {number}
   */
  static getPayloadOffset(packet) {
    const adaptationFieldControl = (packet[3] & 0x30) >> 4;
    if (!(adaptationFieldControl & 0x01)) {
      return shaka.msf.packaging.Mpeg2tsProgram.PACKET_SIZE;
    }
    if (adaptationFieldControl == 0x03) {
      return 5 + packet[4];
    }
    return 4;
  }
};


/**
 * A PSI section being reassembled from the packets it spans.
 *
 * @typedef {{
 *   data: !Uint8Array,
 *   received: number,
 *   packets: !Array<!Uint8Array>,
 * }}
 */
shaka.msf.packaging.Mpeg2tsProgram.Section;


/**
 * @const {number}
 */
shaka.msf.packaging.Mpeg2tsProgram.PACKET_SIZE = 188;


/**
 * @private @const {number}
 */
shaka.msf.packaging.Mpeg2tsProgram.PAT_PID_ = 0x0000;


/**
 * @private @const {number}
 */
shaka.msf.packaging.Mpeg2tsProgram.NULL_PID_ = 0x1fff;


/**
 * The longest a PAT or PMT section may be.
 *
 * @private @const {number}
 */
shaka.msf.packaging.Mpeg2tsProgram.MAX_SECTION_LENGTH_ = 1024;


/**
 * The video stream_types whose access units can be told apart as random
 * access points: H.264 and H.265.
 *
 * @private @const {!Set<number>}
 */
shaka.msf.packaging.Mpeg2tsProgram.VIDEO_STREAM_TYPES_ = new Set([0x1b, 0x24]);
