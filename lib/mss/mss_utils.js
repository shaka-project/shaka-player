/*! @license
 * MSS Utils
 * Copyright 2015 Dash Industry Forum
 * SPDX-License-Identifier: BSD-3-Clause
 */

/*
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * - Redistributions of source code must retain the above copyright notice,
 *   this list of conditions and the following disclaimer.
 * - Redistributions in binary form must reproduce the above copyright notice,
 *   this list of conditions and the following disclaimer in the documentation
 *   and/or other materials provided with the distribution.
 * - Neither the name of the Dash Industry Forum nor the names of its
 *   contributors may be used to endorse or promote products derived from this
 *   software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS “AS IS”
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */

goog.provide('shaka.mss.MssUtils');

goog.require('goog.asserts');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.dependencies');


/**
 * @summary MSS processing utility functions.
 */
shaka.mss.MssUtils = class {
  /**
   * Generate a Init Segment (MP4) for a MSS stream.
   *
   * @param {shaka.extern.Stream} stream
   * @return {!BufferSource}
   */
  static generateInitSegment(stream) {
    const MssUtils = shaka.mss.MssUtils;
    const isoBoxer = shaka.dependencies.isoBoxer();
    goog.asserts.assert(isoBoxer, 'ISOBoxer should be defined.');
    const isoFile = isoBoxer.createFile();
    MssUtils.createFtypBox_(isoBoxer, isoFile);
    MssUtils.createMoovBox_(isoBoxer, isoFile, stream);
    return shaka.util.BufferUtils.toUint8(isoFile.write());
  }

  /**
   * Create ftyp box.
   *
   * @param {ISOBoxer} isoBoxer
   * @param {ISOBoxer} isoFile
   * @private
   */
  static createFtypBox_(isoBoxer, isoFile) {
    const ftyp = isoBoxer.createBox('ftyp', isoFile);
    ftyp.major_brand = 'iso6';
    // is an informative integer for the minor version of the major brand
    ftyp.minor_version = 1;
    // is a list, to the end of the box, of brands isom, iso6 and msdh
    ftyp.compatible_brands = [];
    // => decimal ASCII value for isom
    ftyp.compatible_brands[0] = 'isom';
    // => decimal ASCII value for iso6
    ftyp.compatible_brands[1] = 'iso6';
    // => decimal ASCII value for msdh
    ftyp.compatible_brands[2] = 'msdh';
  }

  /**
   * Create moov box.
   *
   * @param {ISOBoxer} isoBoxer
   * @param {ISOBoxer} isoFile
   * @param {shaka.extern.Stream} stream
   * @private
   */
  static createMoovBox_(isoBoxer, isoFile, stream) {
    const MssUtils = shaka.mss.MssUtils;
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    // moov box
    const moov = isoBoxer.createBox('moov', isoFile);
    // moov/mvhd
    MssUtils.createMvhdBox_(isoBoxer, moov, stream);
    // moov/trak
    const trak = isoBoxer.createBox('trak', moov);
    // moov/trak/tkhd
    MssUtils.createTkhdBox_(isoBoxer, trak, stream);
    // moov/trak/mdia
    const mdia = isoBoxer.createBox('mdia', trak);
    // moov/trak/mdia/mdhd
    MssUtils.createMdhdBox_(isoBoxer, mdia, stream);
    // moov/trak/mdia/hdlr
    MssUtils.createHdlrBox_(isoBoxer, mdia, stream);
    // moov/trak/mdia/minf
    const minf = isoBoxer.createBox('minf', mdia);
    switch (stream.type) {
      case ContentType.VIDEO:
        // moov/trak/mdia/minf/vmhd
        MssUtils.createVmhdBox_(isoBoxer, minf);
        break;
      case ContentType.AUDIO:
        // moov/trak/mdia/minf/smhd
        MssUtils.createSmhdBox_(isoBoxer, minf);
        break;
    }
    // moov/trak/mdia/minf/dinf
    const dinf = isoBoxer.createBox('dinf', minf);
    // moov/trak/mdia/minf/dinf/dref
    MssUtils.createDrefBox_(isoBoxer, dinf);
    // moov/trak/mdia/minf/stbl
    const stbl = isoBoxer.createBox('stbl', minf);
    // Create empty stts, stsc, stco and stsz boxes
    // Use data field as for codem-isoboxer unknown boxes for setting
    // fields value
    // moov/trak/mdia/minf/stbl/stts
    const stts = isoBoxer.createFullBox('stts', stbl);
    // version = 0, flags = 0, entry_count = 0
    stts._data = [0, 0, 0, 0, 0, 0, 0, 0];
    // moov/trak/mdia/minf/stbl/stsc
    const stsc = isoBoxer.createFullBox('stsc', stbl);
    // version = 0, flags = 0, entry_count = 0
    stsc._data = [0, 0, 0, 0, 0, 0, 0, 0];
    // moov/trak/mdia/minf/stbl/stco
    const stco = isoBoxer.createFullBox('stco', stbl);
    // version = 0, flags = 0, entry_count = 0
    stco._data = [0, 0, 0, 0, 0, 0, 0, 0];
    // moov/trak/mdia/minf/stbl/stsz
    const stsz = isoBoxer.createFullBox('stsz', stbl);
    // version = 0, flags = 0, sample_size = 0, sample_count = 0
    stsz._data = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    // moov/trak/mdia/minf/stbl/stsd
    MssUtils.createStsdBox_(isoBoxer, stbl, stream);
    // moov/mvex
    const mvex = isoBoxer.createBox('mvex', moov);
    // moov/mvex/trex
    MssUtils.createTrexBox_(isoBoxer, mvex, stream);
    if (stream.encrypted) {
      MssUtils.createProtectionSystemSpecificHeaderBox_(isoBoxer, moov, stream);
    }
  }

  /**
   * Create mvhd box.
   *
   * @param {ISOBoxer} isoBoxer
   * @param {ISOBoxer} moov
   * @param {shaka.extern.Stream} stream
   * @private
   */
  static createMvhdBox_(isoBoxer, moov, stream) {
    const mvhd = isoBoxer.createFullBox('mvhd', moov);
    // version = 1  in order to have 64bits duration value
    mvhd.version = 1;
    // the creation time of the presentation => ignore (set to 0)
    mvhd.creation_time = 0;
    // the most recent time the presentation was modified => ignore (set to 0)
    mvhd.modification_time = 0;
    // the time-scale for the entire presentation => 10000000 for MSS
    const timescale = stream.mssPrivateData.timescale;
    mvhd.timescale = timescale;
    // the length of the presentation (in the indicated timescale)
    const duration = stream.mssPrivateData.duration;
    mvhd.duration = duration === Infinity ?
        0x1FFFFFFFFFFFFF : Math.round(duration * timescale);
    // 16.16 number, '1.0' = normal playback
    mvhd.rate = 1.0;
    // 8.8 number, '1.0' = full volume
    mvhd.volume = 1.0;
    mvhd.reserved1 = 0;
    mvhd.reserved2 = [0x0, 0x0];
    mvhd.matrix = [
      1, 0, 0, // provides a transformation matrix for the video;
      0, 1, 0, // (u,v,w) are restricted here to (0,0,1)
      0, 0, 16384,
    ];
    mvhd.pre_defined = [0, 0, 0, 0, 0, 0];
    // indicates a value to use for the track ID of the next track to be
    // added to this presentation
    mvhd.next_track_ID = (stream.id + 1) + 1;
  }

  /**
   * Create tkhd box.
   *
   * @param {ISOBoxer} isoBoxer
   * @param {ISOBoxer} trak
   * @param {shaka.extern.Stream} stream
   * @private
   */
  static createTkhdBox_(isoBoxer, trak, stream) {
    const tkhd = isoBoxer.createFullBox('tkhd', trak);
    // version = 1  in order to have 64bits duration value
    tkhd.version = 1;
    // Track_enabled (0x000001): Indicates that the track is enabled
    // Track_in_movie (0x000002):  Indicates that the track is used in
    // the presentation
    // Track_in_preview (0x000004):  Indicates that the track is used when
    // previewing the presentation
    tkhd.flags = 0x1 | 0x2 | 0x4;
    // the creation time of the presentation => ignore (set to 0)
    tkhd.creation_time = 0;
    // the most recent time the presentation was modified => ignore (set to 0)
    tkhd.modification_time = 0;
    // uniquely identifies this track over the entire life-time of this
    // presentation
    tkhd.track_ID = (stream.id + 1);
    tkhd.reserved1 = 0;
    // the duration of this track (in the timescale indicated in the Movie
    // Header Box)
    const duration = stream.mssPrivateData.duration;
    const timescale = stream.mssPrivateData.timescale;
    tkhd.duration = duration === Infinity ?
        0x1FFFFFFFFFFFFF : Math.round(duration * timescale);
    tkhd.reserved2 = [0x0, 0x0];
    // specifies the front-to-back ordering of video tracks; tracks with lower
    // numbers are closer to the viewer => 0 since only one video track
    tkhd.layer = 0;
    // specifies a group or collection of tracks => ignore
    tkhd.alternate_group = 0;
    // '1.0' = full volume
    tkhd.volume = 1.0;
    tkhd.reserved3 = 0;
    tkhd.matrix = [
      1, 0, 0, // provides a transformation matrix for the video;
      0, 1, 0, // (u,v,w) are restricted here to (0,0,1)
      0, 0, 16384,
    ];
    // visual presentation width
    tkhd.width = stream.width;
    // visual presentation height
    tkhd.height = stream.height;
  }

  /**
   * Create mdhd box.
   *
   * @param {ISOBoxer} isoBoxer
   * @param {ISOBoxer} mdia
   * @param {shaka.extern.Stream} stream
   * @private
   */
  static createMdhdBox_(isoBoxer, mdia, stream) {
    const mdhd = isoBoxer.createFullBox('mdhd', mdia);
    // version = 1  in order to have 64bits duration value
    mdhd.version = 1;
    // the creation time of the presentation => ignore (set to 0)
    mdhd.creation_time = 0;
    // the most recent time the presentation was modified => ignore (set to 0)
    mdhd.modification_time = 0;
    // the time-scale for the entire presentation
    const timescale = stream.mssPrivateData.timescale;
    mdhd.timescale = timescale;
    // the duration of this media (in the scale of the timescale).
    // If the duration cannot be determined then duration is set to all 1s.
    const duration = stream.mssPrivateData.duration;
    mdhd.duration = duration === Infinity ?
        0x1FFFFFFFFFFFFF : Math.round(duration * timescale);
    // declares the language code for this media
    mdhd.language = stream.language;
    mdhd.pre_defined = 0;
  }

  /**
   * Create hdlr box.
   *
   * @param {ISOBoxer} isoBoxer
   * @param {ISOBoxer} mdia
   * @param {shaka.extern.Stream} stream
   * @private
   */
  static createHdlrBox_(isoBoxer, mdia, stream) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const hdlr = isoBoxer.createFullBox('hdlr', mdia);
    hdlr.pre_defined = 0;
    switch (stream.type) {
      case ContentType.VIDEO:
        hdlr.handler_type = 'vide';
        break;
      case ContentType.AUDIO:
        hdlr.handler_type = 'soun';
        break;
      default:
        hdlr.handler_type = 'meta';
        break;
    }
    hdlr.name = stream.originalId;
    hdlr.reserved = [0, 0, 0];
  }

  /**
   * Create vmhd box.
   *
   * @param {ISOBoxer} isoBoxer
   * @param {ISOBoxer} minf
   * @private
   */
  static createVmhdBox_(isoBoxer, minf) {
    const vmhd = isoBoxer.createFullBox('vmhd', minf);
    vmhd.flags = 1;
    // specifies a composition mode for this video track, from the following
    // enumerated set, which may be extended by derived specifications:
    // copy = 0 copy over the existing image
    vmhd.graphicsmode = 0;
    // is a set of 3 colour values (red, green, blue) available for use by
    // graphics modes
    vmhd.opcolor = [0, 0, 0];
  }

  /**
   * Create smhd box.
   *
   * @param {ISOBoxer} isoBoxer
   * @param {ISOBoxer} minf
   * @private
   */
  static createSmhdBox_(isoBoxer, minf) {
    const smhd = isoBoxer.createFullBox('smhd', minf);
    smhd.flags = 1;
    // is a fixed-point 8.8 number that places mono audio tracks in a stereo
    // space; 0 is centre (the normal value); full left is -1.0 and full
    // right is 1.0.
    smhd.balance = 0;
    smhd.reserved = 0;
  }

  /**
   * Create dref box.
   *
   * @param {ISOBoxer} isoBoxer
   * @param {ISOBoxer} dinf
   * @private
   */
  static createDrefBox_(isoBoxer, dinf) {
    const dref = isoBoxer.createFullBox('dref', dinf);
    dref.entry_count = 1;
    dref.entries = [];
    const url = isoBoxer.createFullBox('url ', dref, false);
    url.location = '';
    url.flags = 1;
    dref.entries.push(url);
  }

  /**
   * Create stsd box.
   *
   * @param {ISOBoxer} isoBoxer
   * @param {ISOBoxer} stbl
   * @param {shaka.extern.Stream} stream
   * @private
   */
  static createStsdBox_(isoBoxer, stbl, stream) {
    const MssUtils = shaka.mss.MssUtils;
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const stsd = isoBoxer.createFullBox('stsd', stbl);
    stsd.entries = [];
    switch (stream.type) {
      case ContentType.VIDEO:
      case ContentType.AUDIO:
        stsd.entries.push(MssUtils.createSampleEntry_(isoBoxer, stsd, stream));
        break;
      default:
        break;
    }
    // is an integer that counts the actual entries
    stsd.entry_count = stsd.entries.length;
  }

  /**
   * Create sample entry box.
   *
   * @param {ISOBoxer} isoBoxer
   * @param {ISOBoxer} stsd
   * @param {shaka.extern.Stream} stream
   * @private
   */
  static createSampleEntry_(isoBoxer, stsd, stream) {
    const MssUtils = shaka.mss.MssUtils;
    const codec = stream.codecs.substring(0, stream.codecs.indexOf('.'));
    switch (codec) {
      case 'avc1':
        return MssUtils.createAVCVisualSampleEntry_(
            isoBoxer, stsd, codec, stream);
      case 'mp4a':
        return MssUtils.createMP4AudioSampleEntry_(
            isoBoxer, stsd, codec, stream);
      default:
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MEDIA,
            shaka.util.Error.Code.MSS_TRANSMUXING_CODEC_UNKNOWN,
            codec);
    }
  }

  /**
   * Create AVC Visual Sample Entry box.
   *
   * @param {ISOBoxer} isoBoxer
   * @param {ISOBoxer} stsd
   * @param {string} codec
   * @param {shaka.extern.Stream} stream
   * @private
   */
  static createAVCVisualSampleEntry_(isoBoxer, stsd, codec, stream) {
    const MssUtils = shaka.mss.MssUtils;
    let avc1;
    if (stream.encrypted) {
      avc1 = isoBoxer.createBox('encv', stsd, false);
    } else {
      avc1 = isoBoxer.createBox('avc1', stsd, false);
    }
    // SampleEntry fields
    avc1.reserved1 = [0x0, 0x0, 0x0, 0x0, 0x0, 0x0];
    avc1.data_reference_index = 1;
    // VisualSampleEntry fields
    avc1.pre_defined1 = 0;
    avc1.reserved2 = 0;
    avc1.pre_defined2 = [0, 0, 0];
    avc1.height = stream.height;
    avc1.width = stream.width;
    // 72 dpi
    avc1.horizresolution = 72;
    // 72 dpi
    avc1.vertresolution = 72;
    avc1.reserved3 = 0;
    // 1 compressed video frame per sample
    avc1.frame_count = 1;
    avc1.compressorname = [
      0x0A, 0x41, 0x56, 0x43, 0x20, 0x43, 0x6F, 0x64, // = 'AVC Coding';
      0x69, 0x6E, 0x67, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ];
    // 0x0018 – images are in colour with no alpha.
    avc1.depth = 0x0018;
    avc1.pre_defined3 = 65535;
    avc1.config = MssUtils.createAVC1ConfigurationRecord_(isoBoxer, stream);
    if (stream.encrypted) {
      // Create and add Protection Scheme Info Box
      const sinf = isoBoxer.createBox('sinf', avc1);
      // Create and add Original Format Box => indicate codec type of the
      // encrypted content
      MssUtils.createOriginalFormatBox_(isoBoxer, sinf, codec);
      // Create and add Scheme Type box
      MssUtils.createSchemeTypeBox_(isoBoxer, sinf);
      // Create and add Scheme Information Box
      MssUtils.createSchemeInformationBox_(isoBoxer, sinf, stream);
    }
    return avc1;
  }

  /**
   * Create AVC1 configuration record.
   *
   * @param {ISOBoxer} isoBoxer
   * @param {shaka.extern.Stream} stream
   * @private
   */
  static createAVC1ConfigurationRecord_(isoBoxer, stream) {
    const MssUtils = shaka.mss.MssUtils;

    const NALUTYPE_SPS = 7;
    const NALUTYPE_PPS = 8;

    // length = 15 by default (0 SPS and 0 PPS)
    let avcCLength = 15;
    // First get all SPS and PPS from codecPrivateData
    const sps = [];
    const pps = [];
    let AVCProfileIndication = 0;
    let AVCLevelIndication = 0;
    let profileCompatibility = 0;
    const codecPrivateData = stream.mssPrivateData.codecPrivateData;
    const nalus = codecPrivateData.split('00000001').slice(1);
    for (let i = 0; i < nalus.length; i++) {
      const naluBytes = MssUtils.hexStringToBuffer_(nalus[i]);
      const naluType = naluBytes[0] & 0x1F;
      switch (naluType) {
        case NALUTYPE_SPS:
          sps.push(naluBytes);
          // 2 = sequenceParameterSetLength field length
          avcCLength += naluBytes.length + 2;
          break;
        case NALUTYPE_PPS:
          pps.push(naluBytes);
          // 2 = pictureParameterSetLength field length
          avcCLength += naluBytes.length + 2;
          break;
        default:
          break;
      }
    }
    // Get profile and level from SPS
    if (sps.length > 0) {
      AVCProfileIndication = sps[0][1];
      profileCompatibility = sps[0][2];
      AVCLevelIndication = sps[0][3];
    }
    // Generate avcC buffer
    const avcC = new Uint8Array(avcCLength);
    let i = 0;
    // length
    avcC[i++] = (avcCLength & 0xFF000000) >> 24;
    avcC[i++] = (avcCLength & 0x00FF0000) >> 16;
    avcC[i++] = (avcCLength & 0x0000FF00) >> 8;
    avcC[i++] = (avcCLength & 0x000000FF);
    // type = 'avcC'
    avcC.set([0x61, 0x76, 0x63, 0x43], i);
    i += 4;
    // configurationVersion = 1
    avcC[i++] = 1;
    avcC[i++] = AVCProfileIndication;
    avcC[i++] = profileCompatibility;
    avcC[i++] = AVCLevelIndication;
    // '11111' + lengthSizeMinusOne = 3
    avcC[i++] = 0xFF;
    // '111' + numOfSequenceParameterSets
    avcC[i++] = 0xE0 | sps.length;
    for (let n = 0; n < sps.length; n++) {
      avcC[i++] = (sps[n].length & 0xFF00) >> 8;
      avcC[i++] = (sps[n].length & 0x00FF);
      avcC.set(sps[n], i);
      i += sps[n].length;
    }
    // numOfPictureParameterSets
    avcC[i++] = pps.length;
    for (let n = 0; n < pps.length; n++) {
      avcC[i++] = (pps[n].length & 0xFF00) >> 8;
      avcC[i++] = (pps[n].length & 0x00FF);
      avcC.set(pps[n], i);
      i += pps[n].length;
    }
    return avcC;
  }

  /**
   * Create MP4 Audio Sample Entry box.
   *
   * @param {ISOBoxer} isoBoxer
   * @param {ISOBoxer} stsd
   * @param {string} codec
   * @param {shaka.extern.Stream} stream
   * @private
   */
  static createMP4AudioSampleEntry_(isoBoxer, stsd, codec, stream) {
    const MssUtils = shaka.mss.MssUtils;
    // By default assumes stereo
    const channelsCount = stream.channelsCount || 2;
    // By default assumes 44.1khz
    const audioSamplingRate = stream.audioSamplingRate || 44100;
    let mp4a;
    if (stream.encrypted) {
      mp4a = isoBoxer.createBox('enca', stsd, false);
    } else {
      mp4a = isoBoxer.createBox('mp4a', stsd, false);
    }
    // SampleEntry fields
    mp4a.reserved1 = [0x0, 0x0, 0x0, 0x0, 0x0, 0x0];
    mp4a.data_reference_index = 1;
    // AudioSampleEntry fields
    mp4a.reserved2 = [0x0, 0x0];
    mp4a.channelcount = channelsCount;
    mp4a.samplesize = 16;
    mp4a.pre_defined = 0;
    mp4a.reserved_3 = 0;
    mp4a.samplerate = audioSamplingRate << 16;
    mp4a.esds = MssUtils.createMPEG4AACESDescriptor_(isoBoxer, stream);
    if (stream.encrypted) {
      // Create and add Protection Scheme Info Box
      const sinf = isoBoxer.createBox('sinf', mp4a);
      // Create and add Original Format Box => indicate codec type of the
      // encrypted content
      MssUtils.createOriginalFormatBox_(isoBoxer, sinf, codec);
      // Create and add Scheme Type box
      MssUtils.createSchemeTypeBox_(isoBoxer, sinf);
      // Create and add Scheme Information Box
      MssUtils.createSchemeInformationBox_(isoBoxer, sinf, stream);
    }
    return mp4a;
  }

  /**
   * Create ESDS descriptor.
   *
   * @param {ISOBoxer} isoBoxer
   * @param {shaka.extern.Stream} stream
   * @private
   */
  static createMPEG4AACESDescriptor_(isoBoxer, stream) {
    const MssUtils = shaka.mss.MssUtils;
    const codecPrivateData = stream.mssPrivateData.codecPrivateData;
    goog.asserts.assert(codecPrivateData, 'Missing CodecPrivateData');
    // AudioSpecificConfig (see ISO/IEC 14496-3, subpart 1) => corresponds to
    // hex bytes contained in 'codecPrivateData' field
    const audioSpecificConfig = MssUtils.hexStringToBuffer_(codecPrivateData);

    // ESDS length = esds box header length (= 12) +
    //               ES_Descriptor header length (= 5) +
    //               DecoderConfigDescriptor header length (= 15) +
    //               decoderSpecificInfo header length (= 2) +
    //               AudioSpecificConfig length (= codecPrivateData length)
    const esdsLength = 34 + audioSpecificConfig.length;
    const esds = new Uint8Array(esdsLength);
    let i = 0;
    // esds box
    // esds box length
    esds[i++] = (esdsLength & 0xFF000000) >> 24;
    esds[i++] = (esdsLength & 0x00FF0000) >> 16;
    esds[i++] = (esdsLength & 0x0000FF00) >> 8;
    esds[i++] = (esdsLength & 0x000000FF);
    // type = 'esds'
    esds.set([0x65, 0x73, 0x64, 0x73], i);
    i += 4;
    // version = 0, flags = 0
    esds.set([0, 0, 0, 0], i);
    i += 4;
    // ES_Descriptor (see ISO/IEC 14496-1 (Systems))
    // tag = 0x03 (ES_DescrTag)
    esds[i++] = 0x03;
    // size
    esds[i++] = 20 + audioSpecificConfig.length;
    // ES_ID = track_id
    esds[i++] = ((stream.id + 1) & 0xFF00) >> 8;
    esds[i++] = ((stream.id + 1) & 0x00FF);
    // flags and streamPriority
    esds[i++] = 0;
    // DecoderConfigDescriptor (see ISO/IEC 14496-1 (Systems))
    // tag = 0x04 (DecoderConfigDescrTag)
    esds[i++] = 0x04;
    // size
    esds[i++] = 15 + audioSpecificConfig.length;
    // objectTypeIndication = 0x40 (MPEG-4 AAC)
    esds[i++] = 0x40;
    // streamType = 0x05 (Audiostream)
    esds[i] = 0x05 << 2;
    // upStream = 0
    esds[i] |= 0 << 1;
    // reserved = 1
    esds[i++] |= 1;
    // buffersizeDB = undefined
    esds[i++] = 0xFF;
    esds[i++] = 0xFF;
    esds[i++] = 0xFF;
    const bandwidth = stream.bandwidth || 0;
    // maxBitrate
    esds[i++] = (bandwidth & 0xFF000000) >> 24;
    esds[i++] = (bandwidth & 0x00FF0000) >> 16;
    esds[i++] = (bandwidth & 0x0000FF00) >> 8;
    esds[i++] = (bandwidth & 0x000000FF);
    // avgbitrate
    esds[i++] = (bandwidth & 0xFF000000) >> 24;
    esds[i++] = (bandwidth & 0x00FF0000) >> 16;
    esds[i++] = (bandwidth & 0x0000FF00) >> 8;
    esds[i++] = (bandwidth & 0x000000FF);

    // DecoderSpecificInfo (see ISO/IEC 14496-1 (Systems))
    // tag = 0x05 (DecSpecificInfoTag)
    esds[i++] = 0x05;
    // size
    esds[i++] = audioSpecificConfig.length;
    // AudioSpecificConfig bytes
    esds.set(audioSpecificConfig, i);

    return esds;
  }

  /**
   * Create frma box.
   *
   * @param {ISOBoxer} isoBoxer
   * @param {ISOBoxer} sinf
   * @param {string} codec
   * @private
   */
  static createOriginalFormatBox_(isoBoxer, sinf, codec) {
    const MssUtils = shaka.mss.MssUtils;
    const frma = isoBoxer.createBox('frma', sinf);
    frma.data_format = MssUtils.stringToCharCode_(codec);
  }

  /**
   * Create schm box.
   *
   * @param {ISOBoxer} isoBoxer
   * @param {ISOBoxer} sinf
   * @private
   */
  static createSchemeTypeBox_(isoBoxer, sinf) {
    const schm = isoBoxer.createFullBox('schm', sinf);
    schm.flags = 0;
    schm.version = 0;
    // 'cenc' => common encryption
    schm.scheme_type = 0x63656E63;
    // version set to 0x00010000 (Major version 1, Minor version 0)
    schm.scheme_version = 0x00010000;
  }

  /**
   * Create schi box.
   *
   * @param {ISOBoxer} isoBoxer
   * @param {ISOBoxer} sinf
   * @param {shaka.extern.Stream} stream
   * @private
   */
  static createSchemeInformationBox_(isoBoxer, sinf, stream) {
    const MssUtils = shaka.mss.MssUtils;
    const schi = isoBoxer.createBox('schi', sinf);
    // Create and add Track Encryption Box
    MssUtils.createTrackEncryptionBox_(isoBoxer, schi, stream);
  }

  /**
   * Create tenc box.
   *
   * @param {ISOBoxer} isoBoxer
   * @param {ISOBoxer} schi
   * @param {shaka.extern.Stream} stream
   * @private
   */
  static createTrackEncryptionBox_(isoBoxer, schi, stream) {
    const tenc = isoBoxer.createFullBox('tenc', schi);
    tenc.flags = 0;
    tenc.version = 0;
    tenc.default_IsEncrypted = 0x1;
    tenc.default_IV_size = 8;
    let defaultKID = [0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0,
      0x0, 0x0, 0x0, 0x0, 0x0];
    for (const drmInfo of stream.drmInfos) {
      if (drmInfo && drmInfo.keyId && drmInfo.keyIds.size) {
        for (const keyId of drmInfo.keyIds) {
          defaultKID = keyId;
        }
      }
    }
    tenc.default_KID = defaultKID;
  }

  /**
   * Create trex box.
   *
   * @param {ISOBoxer} isoBoxer
   * @param {ISOBoxer} moov
   * @param {shaka.extern.Stream} stream
   * @private
   */
  static createTrexBox_(isoBoxer, moov, stream) {
    const trex = isoBoxer.createFullBox('trex', moov);
    trex.track_ID = (stream.id + 1);
    trex.default_sample_description_index = 1;
    trex.default_sample_duration = 0;
    trex.default_sample_size = 0;
    trex.default_sample_flags = 0;
  }

  /**
   * Create PSSH box.
   *
   * @param {ISOBoxer} isoBoxer
   * @param {ISOBoxer} moov
   * @param {shaka.extern.Stream} stream
   * @private
   */
  static createProtectionSystemSpecificHeaderBox_(isoBoxer, moov, stream) {
    const BufferUtils = shaka.util.BufferUtils;
    for (const drmInfo of stream.drmInfos) {
      if (!drmInfo.initData) {
        continue;
      }
      for (const initData of drmInfo.initData) {
        const initDataBuffer = BufferUtils.toArrayBuffer(initData.initData);
        const parsedBuffer = isoBoxer.parseBuffer(initDataBuffer);
        const pssh = parsedBuffer.fetch('pssh');
        if (pssh) {
          isoBoxer.Utils.appendBox(moov, pssh);
        }
      }
    }
  }

  /**
   * Convert a hex string to buffer.
   *
   * @param {string} str
   * @return {Uint8Array}
   * @private
   */
  static hexStringToBuffer_(str) {
    const buf = new Uint8Array(str.length / 2);
    for (let i = 0; i < str.length / 2; i += 1) {
      buf[i] = parseInt(String(str[i * 2] + str[i * 2 + 1]), 16);
    }
    return buf;
  }

  /**
   * Convert a string to char code.
   *
   * @param {string} str
   * @return {number}
   * @private
   */
  static stringToCharCode_(str) {
    let code = 0;
    for (let i = 0; i < str.length; i += 1) {
      code |= str.charCodeAt(i) << ((str.length - i - 1) * 8);
    }
    return code;
  }
};

