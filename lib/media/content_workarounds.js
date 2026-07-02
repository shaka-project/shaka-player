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
        .boxes(shaka.util.Mp4Parser.SAMPLE_TABLE_PATH,
            shaka.util.Mp4Parser.children)
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
   * Change the box type of the dvvC box from `dvvC` to `free`. This is a
   * content workaround suggested by Dolby for Dolby Vision streams on some
   * chromium-based devices.
   * See https://professionalsupport.dolby.com/s/article/Guidelines-to-developers-building-DASH-HLS-player-apps-for-LG-WebOS-Chromecast-and-other-Chromium-based-app-development-platforms?language=en_US
   * @param {!BufferSource} initSegmentBuffer
   * @return {!Uint8Array}
   */
  static freeDvvcBox(initSegmentBuffer) {
    const initSegment = shaka.util.BufferUtils.toUint8(initSegmentBuffer);

    /** @type {?DataView} */
    let hvcDataView = null;
    let hvcStart = -1;

    new shaka.util.Mp4Parser()
        .boxes(shaka.util.Mp4Parser.SAMPLE_TABLE_PATH,
            shaka.util.Mp4Parser.children)
        .fullBox('stsd', shaka.util.Mp4Parser.sampleDescription)
        .box('hvc1', (box) => {
          hvcDataView = box.reader.getDataView();
          hvcStart = box.start;
          return shaka.util.Mp4Parser.visualSampleEntry(box);
        })
        .box('dvvC', (box) => {
          const ContentWorkarounds = shaka.media.ContentWorkarounds;
          box.parser.stop();
          // box start - hvc1 box start - type size
          const byteOffset = box.start - hvcStart - 4;
          hvcDataView.setUint32(byteOffset, ContentWorkarounds.BOX_TYPE_FREE_);
        })
        .parse(initSegment);

    return initSegment;
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
   * @param {?string} keySystem
   * @return {!Uint8Array}
   * @see https://github.com/shaka-project/shaka-player/issues/2759
   */
  static fakeEncryption(stream, initSegmentBuffer, uri, keySystem) {
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
        .boxes(shaka.util.Mp4Parser.SAMPLE_TABLE_PATH, onSimpleAncestorBox)
        .fullBox('stsd', (box) => {
          stsdBox = box;
          ancestorBoxes.push(box);
          shaka.util.Mp4Parser.sampleDescription(box);
        })
        .boxes([
          'encv',
          'enca',
        ], onEncryptionMetadataBox)
        .boxes(shaka.util.Mp4Parser.AVC_HEVC_VVC_DV, pushEncv)
        .boxes([...shaka.util.Mp4Parser.GENERIC_AUDIO_SAMPLE_ENTRIES, 'mp4a'],
            pushEnca)
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
          workItem.newType, keySystem);
    }

    // Insert PSSH boxes as some platforms require it, i.e. NOS STBs.
    modifiedInitSegment = ContentWorkarounds.insertPsshBoxes_(stream,
        modifiedInitSegment);

    // Edge Windows needs the unmodified init segment to be appended after the
    // patched one, otherwise video element throws following error:
    // CHUNK_DEMUXER_ERROR_APPEND_FAILED: Sample encryption info is not
    // available.
    const device = shaka.device.DeviceFactory.getDevice();
    if (device.requiresClearAndEncryptedInitSegments(keySystem)) {
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
        .boxes(shaka.util.Mp4Parser.FRAGMENT_PATH, onSimpleAncestorBox)
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
   * @param {?string} keySystem
   * @return {!Uint8Array}
   * @private
   */
  static insertEncryptionMetadata_(
      stream, initSegment, stsdBox, sourceBox, ancestorBoxes, metadataBoxType,
      keySystem) {
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
    const cutPoint = device.insertEncryptionDataBeforeClear(keySystem) ?
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

    const mp4Generator = new shaka.util.Mp4Generator();
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
   * @param {!shaka.extern.Stream} stream
   * @param {!Uint8Array} initSegment
   * @return {!Uint8Array}
   * @private
   */
  static insertPsshBoxes_(stream, initSegment) {
    const psshs = new shaka.util.Mp4Generator().psshs(stream);
    if (psshs.byteLength === 0) {
      return initSegment;
    }

    let moovBoxStart = 0;
    let moovBoxSize = 0;
    new shaka.util.Mp4Parser()
        .box('moov', (box) => {
          moovBoxStart = box.start;
          moovBoxSize = box.size;
          box.parser.stop();
        })
        .parse(initSegment);

    const updatedMoovBoxSize = moovBoxSize + psshs.byteLength;
    const cutPoint = moovBoxStart + moovBoxSize;

    shaka.media.ContentWorkarounds.updateBoxSize_(
        initSegment, moovBoxStart, updatedMoovBoxSize);

    const newInitSegment = new Uint8Array(initSegment.byteLength +
      psshs.byteLength);
    const beforeData = initSegment.subarray(0, cutPoint);
    const afterData = initSegment.subarray(cutPoint);

    newInitSegment.set(beforeData);
    newInitSegment.set(psshs, cutPoint);
    newInitSegment.set(afterData, cutPoint + psshs.byteLength);

    return newInitSegment;
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
        .boxes(shaka.util.Mp4Parser.SAMPLE_TABLE_PATH, onSimpleAncestorBox)
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

  /**
   * Some packagers produce broken I-frame only media segments: they clip the
   * byte range down to the first I-frame but leave the moof/trun declaring the
   * whole GOP (many samples) and the mdat declaring the full, un-clipped size.
   * The demuxer then tries to decode samples whose data is not present and
   * fails (e.g. "Failed to prepare video sample for decode").
   *
   * When the mdat is shorter than the trun/mdat headers declare, rewrite the
   * fragment so that it only describes the single I-frame that is actually
   * present, and extend that sample's duration to span the original segment so
   * the buffered timeline stays continuous.  Returns the segment untouched when
   * it is well-formed or when the layout is not one we can safely rewrite.
   *
   * @param {!BufferSource} mediaSegmentBuffer
   * @return {!Uint8Array}
   */
  static fixBrokenIframes(mediaSegmentBuffer) {
    const ContentWorkarounds = shaka.media.ContentWorkarounds;
    const Mp4Parser = shaka.util.Mp4Parser;
    const segment = shaka.util.BufferUtils.toUint8(mediaSegmentBuffer);

    const moofBoxes = [];
    const trafBoxes = [];
    const tfhdBoxes = [];
    const trunBoxes = [];
    let hasEncryptionBoxes = false;

    new Mp4Parser()
        .box('moof', (box) => {
          moofBoxes.push(box);
          Mp4Parser.children(box);
        })
        .box('traf', (box) => {
          trafBoxes.push(box);
          Mp4Parser.children(box);
        })
        .fullBox('tfhd', (box) => {
          tfhdBoxes.push(box);
        })
        .fullBox('trun', (box) => {
          trunBoxes.push(box);
        })
        .boxes([
          'senc',
          'saiz',
          'saio',
        ], () => {
          hasEncryptionBoxes = true;
        })
        .parse(segment, /* partialOkay= */ false, /* stopOnPartial= */ true);

    // Only handle a single, unencrypted movie fragment.  Anything more complex
    // is left untouched.
    if (hasEncryptionBoxes || moofBoxes.length != 1 || trafBoxes.length != 1 ||
        tfhdBoxes.length != 1 || trunBoxes.length != 1) {
      return segment;
    }

    const moofBox = moofBoxes[0];
    const trafBox = trafBoxes[0];
    const tfhdBox = tfhdBoxes[0];
    const trunBox = trunBoxes[0];

    goog.asserts.assert(tfhdBox.flags != null, 'TFHD should have valid flags');
    goog.asserts.assert(trunBox.flags != null, 'TRUN should have valid flags');
    goog.asserts.assert(
        trunBox.version != null, 'TRUN should have a valid version');
    const trunFlags = trunBox.flags;
    const parsedTfhd =
        shaka.util.Mp4BoxParsers.parseTFHD(tfhdBox.reader, tfhdBox.flags);
    const parsedTrun = shaka.util.Mp4BoxParsers.parseTRUN(
        trunBox.reader, trunBox.version, trunBox.flags);

    // A base_data_offset or an implicit data offset means the sample data is
    // addressed in ways our byte removal would invalidate.
    if (parsedTfhd.baseDataOffset != null ||
        !(trunFlags & 0x000001) || parsedTrun.dataOffset == null) {
      return segment;
    }

    const mdatStart = moofBox.start + moofBox.size;
    const dataView = shaka.util.BufferUtils.toDataView(segment);
    if (mdatStart + 8 > segment.byteLength ||
        dataView.getUint32(mdatStart + ContentWorkarounds.BOX_TYPE_OFFSET_) !=
            ContentWorkarounds.BOX_TYPE_MDAT_) {
      return segment;
    }

    let mdatSize = dataView.getUint32(mdatStart);
    const mdatHeaderSize = 8;
    if (mdatSize == 1) {
      // A 64-bit mdat size is not something we expect for I-frame segments.
      return segment;
    } else if (mdatSize == 0) {
      mdatSize = segment.byteLength - mdatStart;
    }

    const availablePayload = segment.byteLength - (mdatStart + mdatHeaderSize);
    const declaredPayload = mdatSize - mdatHeaderSize;

    // If all the declared data is present, the fragment is well-formed.
    if (availablePayload >= declaredPayload) {
      return segment;
    }

    // Count how many whole samples fit in the bytes that are actually present.
    let keptPayloadBytes = 0;
    let keepCount = 0;
    for (const sample of parsedTrun.sampleData) {
      const size = sample.sampleSize != null ?
          sample.sampleSize : parsedTfhd.defaultSampleSize;
      if (size == null) {
        return segment;
      }
      if (keptPayloadBytes + size > availablePayload) {
        break;
      }
      keptPayloadBytes += size;
      keepCount++;
    }

    // We only handle the case where exactly the first sample (the I-frame) is
    // present out of a larger declared GOP.
    if (keepCount != 1 || keepCount >= parsedTrun.sampleCount) {
      return segment;
    }

    // Preserve the original segment duration so the single I-frame spans the
    // whole slot and the buffered timeline stays continuous.
    const hasPerSampleDuration = (trunFlags & 0x000100) != 0;
    let originalTotalDuration = 0;
    for (const sample of parsedTrun.sampleData) {
      const duration = hasPerSampleDuration ?
          sample.sampleDuration : parsedTfhd.defaultSampleDuration;
      if (duration == null) {
        return segment;
      }
      originalTotalDuration += duration;
    }

    const trunHeaderSize = Mp4Parser.headerSize(trunBox);
    // trun payload layout: sample_count(4) [+ data_offset(4)]
    // [+ first_sample_flags(4)] then the per-sample entries.
    let sampleEntriesStart = trunBox.start + trunHeaderSize + 4;
    sampleEntriesStart += 4; // data_offset, guaranteed present above.
    if (trunFlags & 0x000004) {
      sampleEntriesStart += 4; // first_sample_flags
    }

    let perSampleEntrySize = 0;
    if (trunFlags & 0x000100) {
      perSampleEntrySize += 4; // duration
    }
    if (trunFlags & 0x000200) {
      perSampleEntrySize += 4; // size
    }
    if (trunFlags & 0x000400) {
      perSampleEntrySize += 4; // flags
    }
    if (trunFlags & 0x000800) {
      perSampleEntrySize += 4; // composition time offset
    }

    const removedSamples = parsedTrun.sampleCount - keepCount;
    const bytesRemoved = removedSamples * perSampleEntrySize;
    const keepEntriesEnd = sampleEntriesStart + keepCount * perSampleEntrySize;

    // The removed sample entries must be the tail of the moof, immediately
    // followed by the mdat, or the layout is more complex than we can rewrite.
    if (keepEntriesEnd + bytesRemoved != mdatStart) {
      return segment;
    }

    // Build the fixed fragment: patched moof header + kept sample entry,
    // followed by an mdat that only holds the bytes we actually have.
    const front = segment.slice(0, keepEntriesEnd);
    const frontView = shaka.util.BufferUtils.toDataView(front);

    // trun: sample_count -> keepCount, data_offset shifted by removed bytes.
    frontView.setUint32(trunBox.start + trunHeaderSize, keepCount);
    frontView.setInt32(trunBox.start + trunHeaderSize + 4,
        parsedTrun.dataOffset - bytesRemoved);

    // Extend the kept sample's duration to the original segment duration.
    if (hasPerSampleDuration) {
      // The duration is the first per-sample field.
      frontView.setUint32(sampleEntriesStart, originalTotalDuration);
    } else {
      // The duration comes from tfhd's default_sample_duration.
      let durationOffset =
          tfhdBox.start + Mp4Parser.headerSize(tfhdBox) + 4; // track_ID
      if (parsedTfhd.sampleDescriptionIndex != null) {
        durationOffset += 4;
      }
      frontView.setUint32(durationOffset, originalTotalDuration);
    }

    // Shrink the container boxes to account for the removed sample entries.
    ContentWorkarounds.updateBoxSize_(
        front, trunBox.start, trunBox.size - bytesRemoved);
    ContentWorkarounds.updateBoxSize_(
        front, trafBox.start, trafBox.size - bytesRemoved);
    ContentWorkarounds.updateBoxSize_(
        front, moofBox.start, moofBox.size - bytesRemoved);

    // Rebuild the mdat header with the corrected size, then append only the
    // payload bytes that are actually present.
    const mdatHeader = segment.slice(mdatStart, mdatStart + mdatHeaderSize);
    ContentWorkarounds.updateBoxSize_(
        mdatHeader, 0, mdatHeaderSize + keptPayloadBytes);
    const mdatPayload = segment.subarray(mdatStart + mdatHeaderSize,
        mdatStart + mdatHeaderSize + keptPayloadBytes);

    return shaka.util.Uint8ArrayUtils.concat(front, mdatHeader, mdatPayload);
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
 * Box type for "mdat".
 *
 * @const {number}
 * @private
 */
shaka.media.ContentWorkarounds.BOX_TYPE_MDAT_ = 0x6d646174;

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
 * Box type for "free".
 *
 * @const {number}
 * @private
 */
shaka.media.ContentWorkarounds.BOX_TYPE_FREE_ = 0x66726565;

/**
 * Box type for "dec3".
 *
 * @const {number}
 * @private
 */
shaka.media.ContentWorkarounds.BOX_TYPE_DEC3_ = 0x64656333;
