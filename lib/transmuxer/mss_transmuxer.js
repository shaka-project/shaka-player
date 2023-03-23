/*! @license
 * MSS Transmuxer
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

goog.provide('shaka.transmuxer.MssTransmuxer');

goog.require('shaka.media.Capabilities');
goog.require('shaka.transmuxer.TransmuxerEngine');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.dependencies');

goog.requireType('shaka.media.SegmentReference');


/**
 * @implements {shaka.extern.Transmuxer}
 * @export
 */
shaka.transmuxer.MssTransmuxer = class {
  /**
   * @param {string} mimeType
   */
  constructor(mimeType) {
    /** @private {string} */
    this.originalMimeType_ = mimeType;

    /** @private {?ISOBoxer} */
    this.isoBoxer_ = shaka.dependencies.isoBoxer();

    if (this.isoBoxer_) {
      this.addSpecificBoxProcessor_();
    }
  }

  /**
   * Add specific box processor for codem-isoboxer
   *
   * @private
   */
  addSpecificBoxProcessor_() {
    // eslint-disable-next-line no-restricted-syntax
    this.isoBoxer_.addBoxProcessor('saio', function() {
      // eslint-disable-next-line no-invalid-this
      const box = /** @type {!ISOBox} */(this);
      box._procFullBox();
      if (box.flags & 1) {
        box._procField('aux_info_type', 'uint', 32);
        box._procField('aux_info_type_parameter', 'uint', 32);
      }
      box._procField('entry_count', 'uint', 32);
      box._procFieldArray('offset', box.entry_count, 'uint',
          (box.version === 1) ? 64 : 32);
    });
    // eslint-disable-next-line no-restricted-syntax
    this.isoBoxer_.addBoxProcessor('saiz', function() {
      // eslint-disable-next-line no-invalid-this
      const box = /** @type {!ISOBox} */(this);
      box._procFullBox();
      if (box.flags & 1) {
        box._procField('aux_info_type', 'uint', 32);
        box._procField('aux_info_type_parameter', 'uint', 32);
      }
      box._procField('default_sample_info_size', 'uint', 8);
      box._procField('sample_count', 'uint', 32);
      if (box.default_sample_info_size === 0) {
        box._procFieldArray('sample_info_size',
            box.sample_count, 'uint', 8);
      }
    });
    // eslint-disable-next-line no-restricted-syntax
    this.isoBoxer_.addBoxProcessor('senc', function() {
      // eslint-disable-next-line no-invalid-this
      const box = /** @type {!ISOBox} */(this);
      box._procFullBox();
      box._procField('sample_count', 'uint', 32);
      if (box.flags & 1) {
        box._procField('IV_size', 'uint', 8);
      }
      // eslint-disable-next-line no-restricted-syntax
      box._procEntries('entry', box.sample_count, function(entry) {
        // eslint-disable-next-line no-invalid-this
        const boxEntry = /** @type {!ISOBox} */(this);
        boxEntry._procEntryField(entry, 'InitializationVector', 'data', 8);
        if (boxEntry.flags & 2) {
          boxEntry._procEntryField(entry, 'NumberOfEntries', 'uint', 16);
          boxEntry._procSubEntries(entry, 'clearAndCryptedData',
              // eslint-disable-next-line no-restricted-syntax
              entry.NumberOfEntries, function(clearAndCryptedData) {
                // eslint-disable-next-line no-invalid-this
                const subBoxEntry = /** @type {!ISOBox} */(this);
                subBoxEntry._procEntryField(clearAndCryptedData,
                    'BytesOfClearData', 'uint', 16);
                subBoxEntry._procEntryField(clearAndCryptedData,
                    'BytesOfEncryptedData', 'uint', 32);
              });
        }
      });
    });
  }


  /**
   * @override
   * @export
   */
  destroy() {
    // Nothing
  }


  /**
   * Check if the mime type and the content type is supported.
   * @param {string} mimeType
   * @param {string=} contentType
   * @return {boolean}
   * @override
   * @export
   */
  isSupported(mimeType, contentType) {
    const Capabilities = shaka.media.Capabilities;

    const isMss = mimeType.startsWith('mss/');

    if (!this.isoBoxer_ || !isMss) {
      return false;
    }

    if (contentType) {
      return Capabilities.isTypeSupported(
          this.convertCodecs(contentType, mimeType));
    }

    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    const audioMime = this.convertCodecs(ContentType.AUDIO, mimeType);
    const videoMime = this.convertCodecs(ContentType.VIDEO, mimeType);
    return Capabilities.isTypeSupported(audioMime) ||
        Capabilities.isTypeSupported(videoMime);
  }


  /**
   * @override
   * @export
   */
  convertCodecs(contentType, mimeType) {
    return mimeType.replace('mss/', '');
  }


  /**
   * @override
   * @export
   */
  getOrginalMimeType() {
    return this.originalMimeType_;
  }


  /**
   * @override
   * @export
   */
  transmux(data, stream, reference) {
    if (!reference) {
      // Init segment doesn't need transmux
      return Promise.resolve(shaka.util.BufferUtils.toUint8(data));
    }
    if (!stream.mssPrivateData) {
      return Promise.reject(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.MSS_MISSING_DATA_FOR_TRANSMUXING));
    }
    try {
      const transmuxedData = this.processMediaSegment_(
          data, stream, reference);
      return Promise.resolve(transmuxedData);
    } catch (exception) {
      if (exception instanceof shaka.util.Error) {
        return Promise.reject(exception);
      }
      return Promise.reject(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.MSS_TRANSMUXING_FAILED));
    }
  }

  /**
   * Process a media segment from a data and stream.
   * @param {BufferSource} data
   * @param {shaka.extern.Stream} stream
   * @param {shaka.media.SegmentReference} reference
   * @return {!Uint8Array}
   * @private
   */
  processMediaSegment_(data, stream, reference) {
    let i;
    const isoFile = this.isoBoxer_.parseBuffer(data);
    // Update track_Id in tfhd box
    const tfhd = isoFile.fetch('tfhd');
    tfhd.track_ID = stream.id + 1;
    // Add tfdt box
    let tfdt = isoFile.fetch('tfdt');
    const traf = isoFile.fetch('traf');
    if (tfdt === null) {
      tfdt = this.isoBoxer_.createFullBox('tfdt', traf, tfhd);
      tfdt.version = 1;
      tfdt.flags = 0;
      const timescale = stream.mssPrivateData.timescale;
      const startTime = reference.startTime;
      tfdt.baseMediaDecodeTime = Math.floor(startTime * timescale);
    }
    const trun = isoFile.fetch('trun');
    // Process tfxd boxes
    // This box provide absolute timestamp but we take the segment start
    // time for tfdt
    let tfxd = isoFile.fetch('tfxd');
    if (tfxd) {
      tfxd._parent.boxes.splice(tfxd._parent.boxes.indexOf(tfxd), 1);
      tfxd = null;
    }
    let tfrf = isoFile.fetch('tfrf');
    if (tfrf) {
      tfrf._parent.boxes.splice(tfrf._parent.boxes.indexOf(tfrf), 1);
      tfrf = null;
    }

    // If protected content in PIFF1.1 format
    // (sepiff box = Sample Encryption PIFF)
    // => convert sepiff box it into a senc box
    // => create saio and saiz boxes (if not already present)
    const sepiff = isoFile.fetch('sepiff');
    if (sepiff !== null) {
      sepiff.type = 'senc';
      sepiff.usertype = undefined;

      let saio = isoFile.fetch('saio');
      if (saio === null) {
        // Create Sample Auxiliary Information Offsets Box box (saio)
        saio = this.isoBoxer_.createFullBox('saio', traf);
        saio.version = 0;
        saio.flags = 0;
        saio.entry_count = 1;
        saio.offset = [0];
        const saiz = this.isoBoxer_.createFullBox('saiz', traf);
        saiz.version = 0;
        saiz.flags = 0;
        saiz.sample_count = sepiff.sample_count;
        saiz.default_sample_info_size = 0;
        saiz.sample_info_size = [];
        if (sepiff.flags & 0x02) {
          // Sub-sample encryption => set sample_info_size for each sample
          for (i = 0; i < sepiff.sample_count; i += 1) {
            // 10 = 8 (InitializationVector field size) + 2
            // (subsample_count field size)
            // 6 = 2 (BytesOfClearData field size) + 4
            // (BytesOfEncryptedData field size)
            saiz.sample_info_size[i] =
                10 + (6 * sepiff.entry[i].NumberOfEntries);
          }
        } else {
          // No sub-sample encryption => set default
          // sample_info_size = InitializationVector field size (8)
          saiz.default_sample_info_size = 8;
        }
      }
    }

    // set tfhd.base-data-offset-present to false
    tfhd.flags &= 0xFFFFFE;
    // set tfhd.default-base-is-moof to true
    tfhd.flags |= 0x020000;
    // set trun.data-offset-present to true
    trun.flags |= 0x000001;

    // Update trun.data_offset field that corresponds to first data byte
    // (inside mdat box)
    const moof = isoFile.fetch('moof');
    const length = moof.getLength();
    trun.data_offset = length + 8;

    // Update saio box offset field according to new senc box offset
    const saio = isoFile.fetch('saio');
    if (saio !== null) {
      const trafPosInMoof = this.getBoxOffset_(moof, 'traf');
      const sencPosInTraf = this.getBoxOffset_(traf, 'senc');
      // Set offset from begin fragment to the first IV field in senc box
      // 16 = box header (12) + sample_count field size (4)
      saio.offset[0] = trafPosInMoof + sencPosInTraf + 16;
    }

    return shaka.util.BufferUtils.toUint8(isoFile.write());
  }

  /**
   * This function returns the offset of the 1st byte of a child box within
   * a container box.
   *
   * @param {ISOBox} parent
   * @param {string} type
   * @return {number}
   * @private
   */
  getBoxOffset_(parent, type) {
    let offset = 8;
    for (let i = 0; i < parent.boxes.length; i++) {
      if (parent.boxes[i].type === type) {
        return offset;
      }
      offset += parent.boxes[i].size;
    }
    return offset;
  }
};

shaka.transmuxer.TransmuxerEngine.registerTransmuxer(
    'mss/audio/mp4',
    () => new shaka.transmuxer.MssTransmuxer('mss/audio/mp4'),
    shaka.transmuxer.TransmuxerEngine.PluginPriority.FALLBACK);
shaka.transmuxer.TransmuxerEngine.registerTransmuxer(
    'mss/video/mp4',
    () => new shaka.transmuxer.MssTransmuxer('mss/video/mp4'),
    shaka.transmuxer.TransmuxerEngine.PluginPriority.FALLBACK);
