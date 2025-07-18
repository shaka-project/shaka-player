/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.ContentWorkarounds');

goog.require('goog.asserts');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.log');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.Mp4BoxParsers');
goog.require('shaka.util.Mp4Generator');
goog.require('shaka.util.Mp4Parser');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * @summary
 * A collection of methods to work around content issues on various platforms.
 */
shaka.media.ContentWorkarounds = class {
  /**
   * For EAC-3 audio, the "enca" box ChannelCount field
   * MUST always be set to 2.
   * See ETSI TS 102 366 V1.2.1 Sec F.3
   *
   * Clients SHOULD ignore this value; however, it has been discovered that
   * some user agents don't, and instead, invalid values here can cause decoder
   * failures to be thrown (this has been observed with Chromecast).
   *
   * Given that this value MUST be hard-coded to 2, and that clients "SHALL"
   * ignore the value, it seems safe to manipulate the value to be 2 even when
   * the packager has provided a different value.
   * @param {!BufferSource} initSegmentBuffer
   * @return {!Uint8Array}
   */
  static correctEnca(initSegmentBuffer) {
    const initSegment = shaka.util.BufferUtils.toUint8(initSegmentBuffer);
    const modifiedInitSegment = initSegment;

    /**
     * Skip reserved bytes: 6
     * Skip data_reference_index: 2
     * Skip reserved bytes: 8
     */
    const encaChannelCountOffset = 16;

    /** @type {?DataView} */
    let encaBoxDataView = null;

    new shaka.util.Mp4Parser()
        .box('moov', shaka.util.Mp4Parser.children)
        .box('trak', shaka.util.Mp4Parser.children)
        .box('mdia', shaka.util.Mp4Parser.children)
        .box('minf', shaka.util.Mp4Parser.children)
        .box('stbl', shaka.util.Mp4Parser.children)
        .fullBox('stsd', shaka.util.Mp4Parser.sampleDescription)
        .box('enca', (box) => {
          encaBoxDataView = box.reader.getDataView();
          return shaka.util.Mp4Parser.audioSampleEntry(box);
        })
        .box('sinf', shaka.util.Mp4Parser.children)
        .box('frma', (box) => {
          box.parser.stop();
          const {codec} = shaka.util.Mp4BoxParsers.parseFRMA(box.reader);
          if (codec === 'ec-3' &&
                encaBoxDataView &&
                encaBoxDataView.getUint16(encaChannelCountOffset) !== 2
          ) {
            encaBoxDataView.setUint16(encaChannelCountOffset, 2);
          }
        })
        .parse(initSegment);

    return modifiedInitSegment;
  }

  /**
   * Transform the init segment into a new init segment buffer that indicates
   * encryption.  If the init segment already indicates encryption, return the
   * original init segment.
   *
   * Should only be called for MP4 init segments, and only on platforms that
   * need this workaround.
   *
   * @param {!shaka.extern.Stream} stream
   * @param {!BufferSource} initSegmentBuffer
   * @param {?string} uri
   * @return {!Uint8Array}
   * @see https://github.com/shaka-project/shaka-player/issues/2759
   */
  static fakeEncryption(stream, initSegmentBuffer, uri) {
    const ContentWorkarounds = shaka.media.ContentWorkarounds;
    const initSegment = shaka.util.BufferUtils.toUint8(initSegmentBuffer);
    let modifiedInitSegment = initSegment;
    let isEncrypted = false;
    /** @type {shaka.extern.ParsedBox} */
    let stsdBox;
    const ancestorBoxes = [];

    const onSimpleAncestorBox = (box) => {
      ancestorBoxes.push(box);
      shaka.util.Mp4Parser.children(box);
    };

    const onEncryptionMetadataBox = (box) => {
      isEncrypted = true;
      box.parser.stop();
    };

    // Multiplexed content could have multiple boxes that we need to modify.
    // Add to this array in order of box offset.  This will be important later,
    // when we process the boxes.
    /** @type {!Array<{box: shaka.extern.ParsedBox, newType: number}>} */
    const boxesToModify = [];

    const pushEncv = (box) => {
      boxesToModify.push({
        box,
        newType: ContentWorkarounds.BOX_TYPE_ENCV_,
      });
    };

    const pushEnca = (box) => {
      boxesToModify.push({
        box,
        newType: ContentWorkarounds.BOX_TYPE_ENCA_,
      });
    };

    new shaka.util.Mp4Parser()
        .box('moov', onSimpleAncestorBox)
        .box('trak', onSimpleAncestorBox)
        .box('mdia', onSimpleAncestorBox)
        .box('minf', onSimpleAncestorBox)
        .box('stbl', onSimpleAncestorBox)
        .fullBox('stsd', (box) => {
          stsdBox = box;
          ancestorBoxes.push(box);
          shaka.util.Mp4Parser.sampleDescription(box);
        })
        .fullBox('encv', onEncryptionMetadataBox)
        .fullBox('enca', onEncryptionMetadataBox)
        .fullBox('dvav', pushEncv)
        .fullBox('dva1', pushEncv)
        .fullBox('dvh1', pushEncv)
        .fullBox('dvhe', pushEncv)
        .fullBox('dvc1', pushEncv)
        .fullBox('dvi1', pushEncv)
        .fullBox('hev1', pushEncv)
        .fullBox('hvc1', pushEncv)
        .fullBox('avc1', pushEncv)
        .fullBox('avc3', pushEncv)
        .fullBox('ac-3', pushEnca)
        .fullBox('ec-3', pushEnca)
        .fullBox('ac-4', pushEnca)
        .fullBox('Opus', pushEnca)
        .fullBox('fLaC', pushEnca)
        .fullBox('mp4a', pushEnca)
        .parse(initSegment);

    if (isEncrypted) {
      shaka.log.debug('Init segment already indicates encryption.');
      return initSegment;
    }

    if (boxesToModify.length == 0 || !stsdBox) {
      shaka.log.error('Failed to find boxes needed to fake encryption!');
      shaka.log.v2('Failed init segment (hex):',
          shaka.util.Uint8ArrayUtils.toHex(initSegment));
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.CONTENT_TRANSFORMATION_FAILED,
          uri);
    }

    // Modify boxes in order from largest offset to smallest, so that earlier
    // boxes don't have their offsets changed before we process them.
    boxesToModify.reverse();  // in place!
    for (const workItem of boxesToModify) {
      const insertedBoxType =
          shaka.util.Mp4Parser.typeToString(workItem.newType);
      shaka.log.debug(`Inserting "${insertedBoxType}" box into init segment.`);
      modifiedInitSegment = ContentWorkarounds.insertEncryptionMetadata_(
          stream, modifiedInitSegment, stsdBox, workItem.box, ancestorBoxes,
          workItem.newType);
    }

    // Edge Windows needs the unmodified init segment to be appended after the
    // patched one, otherwise video element throws following error:
    // CHUNK_DEMUXER_ERROR_APPEND_FAILED: Sample encryption info is not
    // available.
    const device = shaka.device.DeviceFactory.getDevice();
    if (device.requiresClearAndEncryptedInitSegments()) {
      const doubleInitSegment = new Uint8Array(initSegment.byteLength +
        modifiedInitSegment.byteLength);
      doubleInitSegment.set(modifiedInitSegment);
      doubleInitSegment.set(initSegment, modifiedInitSegment.byteLength);
      return doubleInitSegment;
    }

    return modifiedInitSegment;
  }

  /**
   * @param {!BufferSource} mediaSegmentBuffer
   * @return {!Uint8Array}
   */
  static fakeMediaEncryption(mediaSegmentBuffer) {
    const mediaSegment = shaka.util.BufferUtils.toUint8(mediaSegmentBuffer);
    const mdatBoxes = [];
    new shaka.util.Mp4Parser()
        .box('mdat', (box) => {
          mdatBoxes.push(box);
        })
        .parse(mediaSegment);

    const newSegmentChunks = [];
    for (let i = 0; i < mdatBoxes.length; i++) {
      const prevMdat = mdatBoxes[i - 1];
      const currMdat = mdatBoxes[i];
      const chunkStart = prevMdat ? prevMdat.start + prevMdat.size : 0;
      const chunkEnd = currMdat.start + currMdat.size;
      const chunk = mediaSegment.subarray(chunkStart, chunkEnd);
      newSegmentChunks.push(
          shaka.media.ContentWorkarounds.fakeMediaEncryptionInChunk_(chunk));
    }
    return shaka.util.Uint8ArrayUtils.concat(...newSegmentChunks);
  }

  /**
   * @param {!Uint8Array} chunk
   * @return {!Uint8Array}
   * @private
   */
  static fakeMediaEncryptionInChunk_(chunk) {
    // Which track from stsd we want to use, 1-based.
    const desiredSampleDescriptionIndex = 2;
    let tfhdBox;
    let trunBox;
    let parsedTfhd;
    let parsedTrun;
    const ancestorBoxes = [];
    const onSimpleAncestorBox = (box) => {
      ancestorBoxes.push(box);
      shaka.util.Mp4Parser.children(box);
    };
    const onTfhdBox = (box) => {
      tfhdBox = box;
      parsedTfhd = shaka.util.Mp4BoxParsers.parseTFHD(box.reader, box.flags);
    };
    const onTrunBox = (box) => {
      trunBox = box;
      parsedTrun = shaka.util.Mp4BoxParsers.parseTRUN(box.reader, box.version,
          box.flags);
    };
    new shaka.util.Mp4Parser()
        .box('moof', onSimpleAncestorBox)
        .box('traf', onSimpleAncestorBox)
        .fullBox('tfhd', onTfhdBox)
        .fullBox('trun', onTrunBox)
        .parse(chunk);
    if (parsedTfhd && parsedTfhd.sampleDescriptionIndex !==
        desiredSampleDescriptionIndex) {
      const sdiPosition = tfhdBox.start +
          shaka.util.Mp4Parser.headerSize(tfhdBox) +
          4 + // track_id
          (parsedTfhd.baseDataOffset !== null ? 8 : 0);
      const dataview = shaka.util.BufferUtils.toDataView(chunk);
      if (parsedTfhd.sampleDescriptionIndex !== null) {
        dataview.setUint32(sdiPosition, desiredSampleDescriptionIndex);
      } else {
        const sdiSize = 4; // uint32

        // first, update size & flags of tfhd
        shaka.media.ContentWorkarounds.updateBoxSize_(chunk,
            tfhdBox.start, tfhdBox.size + sdiSize);
        const versionAndFlags = dataview.getUint32(tfhdBox.start + 8);
        dataview.setUint32(tfhdBox.start + 8, versionAndFlags | 0x000002);

        // second, update trun
        if (parsedTrun && parsedTrun.dataOffset !== null) {
          const newDataOffset = parsedTrun.dataOffset + sdiSize;
          const dataOffsetPosition = trunBox.start +
              shaka.util.Mp4Parser.headerSize(trunBox) +
              4; // sample count
          dataview.setInt32(dataOffsetPosition, newDataOffset);
        }
        const beforeSdi = chunk.subarray(0, sdiPosition);
        const afterSdi = chunk.subarray(sdiPosition);
        chunk = new Uint8Array(chunk.byteLength + sdiSize);
        chunk.set(beforeSdi);

        const bytes = [];
        for (let byte = sdiSize - 1; byte >= 0; byte--) {
          bytes.push((desiredSampleDescriptionIndex >> (8 * byte)) & 0xff);
        }
        chunk.set(new Uint8Array(bytes), sdiPosition);
        chunk.set(afterSdi, sdiPosition + sdiSize);
        for (const box of ancestorBoxes) {
          shaka.media.ContentWorkarounds.updateBoxSize_(chunk, box.start,
              box.size + sdiSize);
        }
      }
    }

    return chunk;
  }

  /**
   * Insert an encryption metadata box ("encv" or "enca" box) into the MP4 init
   * segment, based on the source box ("mp4a", "avc1", etc).  Returns a new
   * buffer containing the modified init segment.
   *
   * @param {!shaka.extern.Stream} stream
   * @param {!Uint8Array} initSegment
   * @param {shaka.extern.ParsedBox} stsdBox
   * @param {shaka.extern.ParsedBox} sourceBox
   * @param {!Array<shaka.extern.ParsedBox>} ancestorBoxes
   * @param {number} metadataBoxType
   * @return {!Uint8Array}
   * @private
   */
  static insertEncryptionMetadata_(
      stream, initSegment, stsdBox, sourceBox, ancestorBoxes, metadataBoxType) {
    const ContentWorkarounds = shaka.media.ContentWorkarounds;
    const metadataBoxArray = ContentWorkarounds.createEncryptionMetadata_(
        stream, initSegment, sourceBox, metadataBoxType);

    // Construct a new init segment array with room for the encryption metadata
    // box we're adding.
    const newInitSegment =
        new Uint8Array(initSegment.byteLength + metadataBoxArray.byteLength);

    // For Xbox One & Edge, we cut and insert at the start of the source box.
    // For other platforms, we cut and insert at the end of the source box. It's
    // not clear why this is necessary on Xbox One, but it seems to be evidence
    // of another bug in the firmware implementation of MediaSource & EME.
    const device = shaka.device.DeviceFactory.getDevice();
    const cutPoint = device.insertEncryptionDataBeforeClear() ?
      sourceBox.start :
      sourceBox.start + sourceBox.size;

    // The data before the cut point will be copied to the same location as
    // before.  The data after that will be appended after the added metadata
    // box.
    const beforeData = initSegment.subarray(0, cutPoint);
    const afterData = initSegment.subarray(cutPoint);

    newInitSegment.set(beforeData);
    newInitSegment.set(metadataBoxArray, cutPoint);
    newInitSegment.set(afterData, cutPoint + metadataBoxArray.byteLength);

    // The parents up the chain from the encryption metadata box need their
    // sizes adjusted to account for the added box.  These offsets should not be
    // changed, because they should all be within the first section we copy.
    for (const box of ancestorBoxes) {
      goog.asserts.assert(box.start < cutPoint,
          'Ancestor MP4 box found in the wrong location!  ' +
          'Modified init segment will not make sense!');
      ContentWorkarounds.updateBoxSize_(
          newInitSegment, box.start, box.size + metadataBoxArray.byteLength);
    }

    // Add one to the sample entries field of the "stsd" box.  This is a 4-byte
    // field just past the box header.
    const stsdBoxView = shaka.util.BufferUtils.toDataView(
        newInitSegment, stsdBox.start);
    const stsdBoxHeaderSize = shaka.util.Mp4Parser.headerSize(stsdBox);
    const numEntries = stsdBoxView.getUint32(stsdBoxHeaderSize);
    stsdBoxView.setUint32(stsdBoxHeaderSize, numEntries + 1);

    return newInitSegment;
  }

  /**
   * Create an encryption metadata box ("encv" or "enca" box), based on the
   * source box ("mp4a", "avc1", etc).  Returns a new buffer containing the
   * encryption metadata box.
   *
   * @param {!shaka.extern.Stream} stream
   * @param {!Uint8Array} initSegment
   * @param {shaka.extern.ParsedBox} sourceBox
   * @param {number} metadataBoxType
   * @return {!Uint8Array}
   * @private
   */
  static createEncryptionMetadata_(stream, initSegment, sourceBox,
      metadataBoxType) {
    const ContentWorkarounds = shaka.media.ContentWorkarounds;

    const mp4Generator = new shaka.util.Mp4Generator([]);
    const sinfBoxArray = mp4Generator.sinf(stream, sourceBox.name);

    // Create a subarray which points to the source box data.
    const sourceBoxArray = initSegment.subarray(
        /* start= */ sourceBox.start,
        /* end= */ sourceBox.start + sourceBox.size);

    // Create an array to hold the new encryption metadata box, which is based
    // on the source box.
    const metadataBoxArray = new Uint8Array(
        sourceBox.size + sinfBoxArray.byteLength);

    // Copy the source box into the new array.
    metadataBoxArray.set(sourceBoxArray, /* targetOffset= */ 0);

    // Change the box type.
    const metadataBoxView = shaka.util.BufferUtils.toDataView(metadataBoxArray);
    metadataBoxView.setUint32(
        ContentWorkarounds.BOX_TYPE_OFFSET_, metadataBoxType);

    // Append the "sinf" box to the encryption metadata box.
    metadataBoxArray.set(sinfBoxArray, /* targetOffset= */ sourceBox.size);

    // Now update the encryption metadata box size.
    ContentWorkarounds.updateBoxSize_(
        metadataBoxArray, /* boxStart= */ 0, metadataBoxArray.byteLength);

    return metadataBoxArray;
  }

  /**
   * Modify an MP4 box's size field in-place.
   *
   * @param {!Uint8Array} dataArray
   * @param {number} boxStart The start position of the box in dataArray.
   * @param {number} newBoxSize The new size of the box.
   * @private
   */
  static updateBoxSize_(dataArray, boxStart, newBoxSize) {
    const ContentWorkarounds = shaka.media.ContentWorkarounds;
    const boxView = shaka.util.BufferUtils.toDataView(dataArray, boxStart);
    const sizeField = boxView.getUint32(ContentWorkarounds.BOX_SIZE_OFFSET_);
    if (sizeField == 0) { // Means "the rest of the box".
      // No adjustment needed for this box.
    } else if (sizeField == 1) { // Means "use 64-bit size box".
      // Set the 64-bit int in two 32-bit parts.
      // The high bits should definitely be 0 in practice, but we're being
      // thorough here.
      boxView.setUint32(ContentWorkarounds.BOX_SIZE_64_OFFSET_,
          newBoxSize >> 32);
      boxView.setUint32(ContentWorkarounds.BOX_SIZE_64_OFFSET_ + 4,
          newBoxSize & 0xffffffff);
    } else { // Normal 32-bit size field.
      // Not checking the size of the value here, since a box larger than 4GB is
      // unrealistic.
      boxView.setUint32(ContentWorkarounds.BOX_SIZE_OFFSET_, newBoxSize);
    }
  }

  /**
   * Transform the init segment into a new init segment buffer that indicates
   * EC-3 as audio codec instead of AC-3. Even though any EC-3 decoder should
   * be able to decode AC-3 streams, there are platforms that do not accept
   * AC-3 as codec.
   *
   * Should only be called for MP4 init segments, and only on platforms that
   * need this workaround. Returns a new buffer containing the modified init
   * segment.
   *
   * @param {!BufferSource} initSegmentBuffer
   * @return {!Uint8Array}
   */
  static fakeEC3(initSegmentBuffer) {
    const ContentWorkarounds = shaka.media.ContentWorkarounds;
    const initSegment = shaka.util.BufferUtils.toUint8(initSegmentBuffer);
    const ancestorBoxes = [];

    const onSimpleAncestorBox = (box) => {
      ancestorBoxes.push({start: box.start, size: box.size});
      shaka.util.Mp4Parser.children(box);
    };

    new shaka.util.Mp4Parser()
        .box('moov', onSimpleAncestorBox)
        .box('trak', onSimpleAncestorBox)
        .box('mdia', onSimpleAncestorBox)
        .box('minf', onSimpleAncestorBox)
        .box('stbl', onSimpleAncestorBox)
        .box('stsd', (box) => {
          ancestorBoxes.push({start: box.start, size: box.size});
          const stsdBoxView = shaka.util.BufferUtils.toDataView(
              initSegment, box.start);
          // "size - 3" is because we immediately read a uint32.
          for (let i = 0; i < box.size -3; i++) {
            const codecTag = stsdBoxView.getUint32(i);
            if (codecTag == ContentWorkarounds.BOX_TYPE_AC_3_) {
              stsdBoxView.setUint32(i, ContentWorkarounds.BOX_TYPE_EC_3_);
            } else if (codecTag == ContentWorkarounds.BOX_TYPE_DAC3_) {
              stsdBoxView.setUint32(i, ContentWorkarounds.BOX_TYPE_DEC3_);
            }
          }
        }).parse(initSegment);

    return initSegment;
  }
};

/**
 * Offset to a box's size field.
 *
 * @const {number}
 * @private
 */
shaka.media.ContentWorkarounds.BOX_SIZE_OFFSET_ = 0;

/**
 * Offset to a box's type field.
 *
 * @const {number}
 * @private
 */
shaka.media.ContentWorkarounds.BOX_TYPE_OFFSET_ = 4;

/**
 * Offset to a box's 64-bit size field, if it has one.
 *
 * @const {number}
 * @private
 */
shaka.media.ContentWorkarounds.BOX_SIZE_64_OFFSET_ = 8;

/**
 * Box type for "encv".
 *
 * @const {number}
 * @private
 */
shaka.media.ContentWorkarounds.BOX_TYPE_ENCV_ = 0x656e6376;

/**
 * Box type for "enca".
 *
 * @const {number}
 * @private
 */
shaka.media.ContentWorkarounds.BOX_TYPE_ENCA_ = 0x656e6361;

/**
 * Box type for "ac-3".
 *
 * @const {number}
 * @private
 */
shaka.media.ContentWorkarounds.BOX_TYPE_AC_3_ = 0x61632d33;

/**
 * Box type for "dac3".
 *
 * @const {number}
 * @private
 */
shaka.media.ContentWorkarounds.BOX_TYPE_DAC3_ = 0x64616333;

/**
 * Box type for "ec-3".
 *
 * @const {number}
 * @private
 */
shaka.media.ContentWorkarounds.BOX_TYPE_EC_3_ = 0x65632d33;

/**
 * Box type for "dec3".
 *
 * @const {number}
 * @private
 */
shaka.media.ContentWorkarounds.BOX_TYPE_DEC3_ = 0x64656333;
