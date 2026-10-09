/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.mkv.MatroskaIndexParser');

goog.require('shaka.mkv.BlockAddType');
goog.require('shaka.mkv.ContentCompression');
goog.require('shaka.mkv.ElementId');
goog.require('shaka.mkv.MatroskaConstants');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.EbmlParser');
goog.require('shaka.util.Error');
goog.requireType('shaka.util.EbmlElement');


/**
 * Reads the container metadata needed to index a Matroska file: the track list,
 * the timeline scale, the Cues (seek index) and the Chapters.  Offsets in the
 * results are absolute byte positions in the file, suitable for HTTP range
 * requests.  The parser never inspects a Cluster payload; see
 * shaka.mkv.MatroskaClusterParser for that.
 */
shaka.mkv.MatroskaIndexParser = class {
  /**
   * Parses the beginning of a file.  The data does not need to contain the
   * whole header: everything up to the first Cluster (or up to the first
   * element the data cuts short) is read, and if that element is the list of
   * tracks, the complete tracks that precede the cut.
   *
   * @param {BufferSource} data Bytes beginning at offset zero in the file.
   * @return {shaka.mkv.MatroskaIndexParser.Header}
   */
  static parseHeader(data) {
    const ElementId = shaka.mkv.ElementId;
    const MatroskaIndexParser = shaka.mkv.MatroskaIndexParser;
    const bytes = shaka.util.BufferUtils.toUint8(data);

    const parser = new shaka.util.EbmlParser(bytes);
    const ebml = MatroskaIndexParser.parseTopLevelElement_(
        parser, ElementId.EBML);
    if (ebml.isPartial()) {
      throw MatroskaIndexParser.invalid_();
    }
    let docType = null;
    const ebmlChildren = ebml.createParser();
    while (ebmlChildren.hasMoreData()) {
      const child = ebmlChildren.parseElement();
      if (child.id == ElementId.DOC_TYPE) {
        docType = child.getString();
      }
    }
    if (!shaka.mkv.MatroskaConstants.DOC_TYPES.includes(docType || '')) {
      throw MatroskaIndexParser.invalid_();
    }

    const segmentStart = parser.getPosition();
    const segment = MatroskaIndexParser.parseTopLevelElement_(
        parser, ElementId.SEGMENT);
    // SeekHead positions and Cue positions are relative to the first byte of
    // the Segment's data.
    const segmentOffset = segmentStart + segment.getHeaderSize();

    /** @type {shaka.mkv.MatroskaIndexParser.Header} */
    const header = {
      segmentOffset,
      cuesOffset: null,
      chaptersOffset: null,
      infoEndOffset: null,
      mediaEndOffset: null,
      duration: null,
      timecodeScale: shaka.mkv.MatroskaConstants.DEFAULT_TIMECODE_SCALE,
      tracks: [],
      firstClusterOffset: null,
    };
    // Where the SeekHead says the top-level elements other than Clusters live.
    const seekPositions = [];
    let unscaledDuration = null;

    const children = segment.createParser();
    while (children.hasMoreData()) {
      const position = children.getPosition();
      let element;
      try {
        element = children.parseElement();
      } catch (error) {
        // The data ended in the middle of an element header.
        if (error.code == shaka.util.Error.Code.BUFFER_READ_OUT_OF_BOUNDS) {
          break;
        }
        throw error;
      }
      const offset = segmentOffset + position;
      if (element.id == ElementId.CLUSTER) {
        header.firstClusterOffset = offset;
        break;
      }
      if (element.isPartial()) {
        // The data ends inside this element.  The tracks that precede the end
        // are still worth having: the initialization segment of a track stops
        // at the end of its TrackEntry.
        if (element.id == ElementId.TRACKS) {
          header.tracks = MatroskaIndexParser.parseTracks_(
              element, offset + element.getHeaderSize());
        }
        break;
      }
      switch (element.id) {
        case ElementId.SEEK_HEAD:
          MatroskaIndexParser.parseSeekHead_(
              element, segmentOffset, header, seekPositions);
          break;
        case ElementId.INFO: {
          const info = MatroskaIndexParser.parseInfo_(element);
          header.timecodeScale = info.timecodeScale;
          unscaledDuration = info.unscaledDuration;
          header.infoEndOffset = offset + element.getHeaderSize() +
              element.getDeclaredSize();
          break;
        }
        case ElementId.TRACKS:
          header.tracks = MatroskaIndexParser.parseTracks_(
              element, offset + element.getHeaderSize());
          break;
        case ElementId.CUES:
          header.cuesOffset = offset;
          break;
        case ElementId.CHAPTERS:
          header.chaptersOffset = offset;
          break;
      }
    }

    if (!header.tracks.length) {
      // Either the Tracks element is not in this data, or the file has none.
      // The caller reads more data when firstClusterOffset is still unknown.
      if (header.firstClusterOffset != null) {
        throw MatroskaIndexParser.invalid_();
      }
    }
    if (header.firstClusterOffset != null) {
      const firstCluster = header.firstClusterOffset;
      // The media data ends where the first non-Cluster element that follows
      // it starts (usually the Cues, at the end of the file).
      const later = seekPositions.filter((position) => position > firstCluster);
      header.mediaEndOffset = later.length ? Math.min(...later) : null;
    }
    if (unscaledDuration != null) {
      header.duration = unscaledDuration * header.timecodeScale /
          shaka.mkv.MatroskaConstants.NANOSECONDS_PER_SECOND;
    }
    return header;
  }

  /**
   * Gets the last byte of the initialization segment of a track.  That is the
   * beginning of the file, up to the end of the TrackEntry of the track (and of
   * the Info, which holds the timecode scale, should it come later).  Nothing
   * that follows is needed to tell what the track is.
   *
   * Besides being small, this makes the initialization segment of each track a
   * different byte range, which is how the StreamingEngine knows it has to
   * append it again when the track changes.
   *
   * @param {shaka.mkv.MatroskaIndexParser.Header} header
   * @param {!shaka.mkv.MatroskaIndexParser.Track} track
   * @return {number} The offset of the last byte, inclusive.
   */
  static getInitEndOffset(header, track) {
    return Math.max(track.offset + track.size, header.infoEndOffset || 0) - 1;
  }

  /**
   * Parses a complete Cues element fetched with a byte range request.
   *
   * @param {BufferSource} data
   * @param {number} segmentOffset
   * @param {number} timecodeScale
   * @return {!Array<shaka.mkv.MatroskaIndexParser.CuePoint>}
   */
  static parseCues(data, segmentOffset, timecodeScale) {
    const ElementId = shaka.mkv.ElementId;
    const MatroskaIndexParser = shaka.mkv.MatroskaIndexParser;
    const parser = new shaka.util.EbmlParser(data);
    const cues = MatroskaIndexParser.parseTopLevelElement_(
        parser, ElementId.CUES);
    if (cues.isPartial()) {
      throw MatroskaIndexParser.invalid_();
    }

    /** @type {!Array<shaka.mkv.MatroskaIndexParser.CuePoint>} */
    const result = [];
    const points = cues.createParser();
    while (points.hasMoreData()) {
      const point = points.parseElement();
      if (point.id != ElementId.CUE_POINT) {
        continue;
      }
      let ticks = null;
      const positions = [];
      const fields = point.createParser();
      while (fields.hasMoreData()) {
        const field = fields.parseElement();
        if (field.id == ElementId.CUE_TIME) {
          ticks = field.getUint();
        } else if (field.id == ElementId.CUE_TRACK_POSITIONS) {
          let track = null;
          let position = null;
          const values = field.createParser();
          while (values.hasMoreData()) {
            const value = values.parseElement();
            if (value.id == ElementId.CUE_TRACK) {
              track = value.getUint();
            } else if (value.id == ElementId.CUE_CLUSTER_POSITION) {
              position = value.getUint();
            }
          }
          if (track != null && position != null) {
            positions.push({track, position});
          }
        }
      }
      if (ticks != null) {
        const time = ticks * timecodeScale /
            shaka.mkv.MatroskaConstants.NANOSECONDS_PER_SECOND;
        for (const {track, position} of positions) {
          result.push({time, track, offset: segmentOffset + position});
        }
      }
    }
    return result;
  }

  /**
   * Reads the total length of a top-level element (header included) from its
   * first bytes.  The caller can use this to fetch precisely the element with
   * one more range request.
   *
   * @param {BufferSource} data
   * @param {shaka.mkv.ElementId} expectedId
   * @return {number}
   */
  static getElementLength(data, expectedId) {
    const MatroskaIndexParser = shaka.mkv.MatroskaIndexParser;
    const element = MatroskaIndexParser.parseTopLevelElement_(
        new shaka.util.EbmlParser(data), expectedId);
    if (element.getDeclaredSize() == Infinity) {
      throw MatroskaIndexParser.invalid_();
    }
    return element.getHeaderSize() + element.getDeclaredSize();
  }

  /**
   * Parses a complete Chapters element fetched with a byte range request.
   * Only the first edition is read: Shaka's chapter API has no notion of
   * edition selection.
   *
   * @param {BufferSource} data
   * @return {!Array<shaka.mkv.MatroskaIndexParser.Chapter>}
   */
  static parseChapters(data) {
    const ElementId = shaka.mkv.ElementId;
    const MatroskaIndexParser = shaka.mkv.MatroskaIndexParser;
    const chapters = MatroskaIndexParser.parseTopLevelElement_(
        new shaka.util.EbmlParser(data), ElementId.CHAPTERS);
    if (chapters.isPartial()) {
      throw MatroskaIndexParser.invalid_();
    }
    const result = [];
    const editions = chapters.createParser();
    while (editions.hasMoreData()) {
      const edition = editions.parseElement();
      if (edition.id != ElementId.EDITION_ENTRY) {
        continue;
      }
      const atoms = edition.createParser();
      while (atoms.hasMoreData()) {
        const atom = atoms.parseElement();
        if (atom.id == ElementId.CHAPTER_ATOM) {
          MatroskaIndexParser.parseChapterAtom_(atom, result);
        }
      }
      break;
    }
    return result;
  }

  /**
   * Parses the element at the parser's position and checks its ID.
   *
   * @param {!shaka.util.EbmlParser} parser
   * @param {shaka.mkv.ElementId} expectedId
   * @return {!shaka.util.EbmlElement}
   * @private
   */
  static parseTopLevelElement_(parser, expectedId) {
    let element;
    try {
      element = parser.parseElement();
    } catch (error) {
      // A truncated or garbled element header: not something we can read.
      throw shaka.mkv.MatroskaIndexParser.invalid_();
    }
    if (element.id != expectedId) {
      throw shaka.mkv.MatroskaIndexParser.invalid_();
    }
    return element;
  }

  /**
   * @param {!shaka.util.EbmlElement} seekHead
   * @param {number} segmentOffset
   * @param {shaka.mkv.MatroskaIndexParser.Header} header
   * @param {!Array<number>} seekPositions Receives the absolute position of
   *   every element the SeekHead lists.
   * @private
   */
  static parseSeekHead_(seekHead, segmentOffset, header, seekPositions) {
    const ElementId = shaka.mkv.ElementId;
    const seeks = seekHead.createParser();
    while (seeks.hasMoreData()) {
      const seek = seeks.parseElement();
      if (seek.id != ElementId.SEEK) {
        continue;
      }
      let seekId = 0;
      let seekPosition = null;
      const fields = seek.createParser();
      while (fields.hasMoreData()) {
        const field = fields.parseElement();
        if (field.id == ElementId.SEEK_ID) {
          // The ID is stored as its raw bytes, i.e. as a big-endian integer.
          seekId = field.getUint();
        } else if (field.id == ElementId.SEEK_POSITION) {
          seekPosition = field.getUint();
        }
      }
      if (seekPosition == null) {
        continue;
      }
      const position = segmentOffset + seekPosition;
      if (seekId == ElementId.CUES) {
        header.cuesOffset = position;
      } else if (seekId == ElementId.CHAPTERS) {
        header.chaptersOffset = position;
      }
      if (seekId != ElementId.CLUSTER) {
        seekPositions.push(position);
      }
    }
  }

  /**
   * @param {!shaka.util.EbmlElement} info
   * @return {{timecodeScale: number, unscaledDuration: ?number}}
   * @private
   */
  static parseInfo_(info) {
    const ElementId = shaka.mkv.ElementId;
    let timecodeScale = shaka.mkv.MatroskaConstants.DEFAULT_TIMECODE_SCALE;
    let unscaledDuration = null;
    const fields = info.createParser();
    while (fields.hasMoreData()) {
      const field = fields.parseElement();
      if (field.id == ElementId.TIMECODE_SCALE) {
        timecodeScale = field.getUint();
      } else if (field.id == ElementId.DURATION) {
        unscaledDuration = field.getFloat();
      }
    }
    if (!Number.isFinite(timecodeScale) || timecodeScale <= 0) {
      throw shaka.mkv.MatroskaIndexParser.invalid_();
    }
    return {timecodeScale, unscaledDuration};
  }

  /**
   * @param {!shaka.util.EbmlElement} tracks
   * @param {number} dataOffset Absolute offset of the first byte of |tracks|'s
   *   data.
   * @return {!Array<!shaka.mkv.MatroskaIndexParser.Track>}
   * @private
   */
  static parseTracks_(tracks, dataOffset) {
    const result = [];
    const entries = tracks.createParser();
    while (entries.hasMoreData()) {
      const position = entries.getPosition();
      let entry;
      try {
        entry = entries.parseElement();
      } catch (error) {
        // The data ends in the middle of the header of an entry.
        if (error.code == shaka.util.Error.Code.BUFFER_READ_OUT_OF_BOUNDS) {
          break;
        }
        throw error;
      }
      if (entry.isPartial()) {
        break;
      }
      if (entry.id == shaka.mkv.ElementId.TRACK_ENTRY) {
        result.push(shaka.mkv.MatroskaIndexParser.parseTrackEntry_(
            entry, dataOffset + position));
      }
    }
    return result;
  }

  /**
   * @param {!shaka.util.EbmlElement} entry
   * @param {number} offset Absolute offset of the TrackEntry element.
   * @return {!shaka.mkv.MatroskaIndexParser.Track}
   * @private
   */
  static parseTrackEntry_(entry, offset) {
    const ElementId = shaka.mkv.ElementId;
    const MatroskaIndexParser = shaka.mkv.MatroskaIndexParser;

    /** @type {!shaka.mkv.MatroskaIndexParser.Track} */
    const track = {
      offset,
      size: entry.getHeaderSize() + entry.getDeclaredSize(),
      number: 0,
      type: 0,
      codecId: '',
      codecPrivate: null,
      codecDelay: null,
      language: shaka.mkv.MatroskaConstants.DEFAULT_LANGUAGE,
      name: '',
      // Per the specification every flag but FlagDefault... has a default.
      enabled: true,
      isDefault: true,
      forced: false,
      hearingImpaired: false,
      visualImpaired: false,
      original: false,
      commentary: false,
      width: null,
      height: null,
      displayWidth: null,
      displayHeight: null,
      transferCharacteristics: null,
      channels: null,
      sampleRate: null,
      outputSampleRate: null,
      defaultDuration: null,
      strippedHeader: null,
      unsupportedEncoding: false,
      dolbyVisionConfig: null,
    };
    let bcp47Language = null;

    const fields = entry.createParser();
    while (fields.hasMoreData()) {
      const field = fields.parseElement();
      switch (field.id) {
        case ElementId.TRACK_NUMBER:
          track.number = field.getUint();
          break;
        case ElementId.TRACK_TYPE:
          track.type = field.getUint();
          break;
        case ElementId.CODEC_ID:
          track.codecId = field.getString();
          break;
        case ElementId.CODEC_PRIVATE:
          // Copy: the header buffer must not be kept alive by a track.
          track.codecPrivate = field.getBytes().slice();
          break;
        case ElementId.CODEC_DELAY:
          track.codecDelay = field.getUint() /
              shaka.mkv.MatroskaConstants.NANOSECONDS_PER_SECOND;
          break;
        case ElementId.DEFAULT_DURATION:
          track.defaultDuration = field.getUint() /
              shaka.mkv.MatroskaConstants.NANOSECONDS_PER_SECOND;
          break;
        case ElementId.LANGUAGE:
          track.language = field.getString();
          break;
        case ElementId.LANGUAGE_BCP47:
          bcp47Language = field.getString();
          break;
        case ElementId.TRACK_NAME:
          track.name = field.getString();
          break;
        case ElementId.FLAG_ENABLED:
          track.enabled = field.getUint() != 0;
          break;
        case ElementId.FLAG_DEFAULT:
          track.isDefault = field.getUint() != 0;
          break;
        case ElementId.FLAG_FORCED:
          track.forced = field.getUint() != 0;
          break;
        case ElementId.FLAG_HEARING_IMPAIRED:
          track.hearingImpaired = field.getUint() != 0;
          break;
        case ElementId.FLAG_VISUAL_IMPAIRED:
          track.visualImpaired = field.getUint() != 0;
          break;
        case ElementId.FLAG_ORIGINAL:
          track.original = field.getUint() != 0;
          break;
        case ElementId.FLAG_COMMENTARY:
          track.commentary = field.getUint() != 0;
          break;
        case ElementId.VIDEO:
          MatroskaIndexParser.parseVideoSettings_(field, track);
          break;
        case ElementId.AUDIO:
          MatroskaIndexParser.parseAudioSettings_(field, track);
          break;
        case ElementId.CONTENT_ENCODINGS:
          MatroskaIndexParser.parseContentEncodings_(field, track);
          break;
        case ElementId.BLOCK_ADDITION_MAPPING:
          MatroskaIndexParser.parseBlockAdditionMapping_(field, track);
          break;
      }
    }
    // The BCP 47 form supersedes the ISO 639-2 one when both are written.
    if (bcp47Language) {
      track.language = bcp47Language;
    }
    return track;
  }

  /**
   * @param {!shaka.util.EbmlElement} video
   * @param {!shaka.mkv.MatroskaIndexParser.Track} track
   * @private
   */
  static parseVideoSettings_(video, track) {
    const ElementId = shaka.mkv.ElementId;
    const fields = video.createParser();
    while (fields.hasMoreData()) {
      const field = fields.parseElement();
      switch (field.id) {
        case ElementId.PIXEL_WIDTH:
          track.width = field.getUint();
          break;
        case ElementId.PIXEL_HEIGHT:
          track.height = field.getUint();
          break;
        case ElementId.DISPLAY_WIDTH:
          track.displayWidth = field.getUint();
          break;
        case ElementId.DISPLAY_HEIGHT:
          track.displayHeight = field.getUint();
          break;
        case ElementId.DISPLAY_UNIT:
          // Display dimensions only describe an aspect ratio when they are in
          // pixels (0).  Other units say how big the picture is when shown.
          if (field.getUint() != 0) {
            track.displayWidth = null;
            track.displayHeight = null;
          }
          break;
        case ElementId.COLOUR: {
          const colour = field.createParser();
          while (colour.hasMoreData()) {
            const value = colour.parseElement();
            if (value.id == ElementId.TRANSFER_CHARACTERISTICS) {
              track.transferCharacteristics = value.getUint();
            }
          }
          break;
        }
      }
    }
  }

  /**
   * @param {!shaka.util.EbmlElement} audio
   * @param {!shaka.mkv.MatroskaIndexParser.Track} track
   * @private
   */
  static parseAudioSettings_(audio, track) {
    const ElementId = shaka.mkv.ElementId;
    const fields = audio.createParser();
    while (fields.hasMoreData()) {
      const field = fields.parseElement();
      switch (field.id) {
        case ElementId.CHANNELS:
          track.channels = field.getUint();
          break;
        case ElementId.SAMPLING_FREQUENCY:
          track.sampleRate = field.getFloat();
          break;
        case ElementId.OUTPUT_SAMPLING_FREQUENCY:
          track.outputSampleRate = field.getFloat();
          break;
      }
    }
  }

  /**
   * Reads a BlockAdditionMapping, which says what the additional data of the
   * blocks, or the extra data of the track, is.  The one that is looked for is
   * the Dolby Vision configuration.
   *
   * @param {!shaka.util.EbmlElement} mapping
   * @param {!shaka.mkv.MatroskaIndexParser.Track} track
   * @private
   */
  static parseBlockAdditionMapping_(mapping, track) {
    const ElementId = shaka.mkv.ElementId;
    const BlockAddType = shaka.mkv.BlockAddType;
    let type = 0;
    let extraData = null;
    const fields = mapping.createParser();
    while (fields.hasMoreData()) {
      const field = fields.parseElement();
      if (field.id == ElementId.BLOCK_ADD_ID_TYPE) {
        type = field.getUint();
      } else if (field.id == ElementId.BLOCK_ADD_ID_EXTRA_DATA) {
        extraData = field.getBytes().slice();
      }
    }
    if (extraData && (type == BlockAddType.DVCC || type == BlockAddType.DVVC)) {
      track.dolbyVisionConfig = extraData;
    }
  }

  /**
   * Reads the ContentEncodings of a track.  The only encoding that can be
   * undone without a decompressor or a key is header stripping, in which the
   * muxer removed a common prefix from every frame.
   *
   * @param {!shaka.util.EbmlElement} encodings
   * @param {!shaka.mkv.MatroskaIndexParser.Track} track
   * @private
   */
  static parseContentEncodings_(encodings, track) {
    const ElementId = shaka.mkv.ElementId;
    // Defaults of the specification: the encoding applies to the frames only
    // and is a compression (0) using zlib (0).
    const scopeFrames = 1;
    const typeCompression = 0;
    const algoZlib = 0;

    const list = encodings.createParser();
    while (list.hasMoreData()) {
      const encoding = list.parseElement();
      if (encoding.id != ElementId.CONTENT_ENCODING) {
        continue;
      }
      let scope = scopeFrames;
      let type = typeCompression;
      let algo = algoZlib;
      let settings = null;
      const fields = encoding.createParser();
      while (fields.hasMoreData()) {
        const field = fields.parseElement();
        switch (field.id) {
          case ElementId.CONTENT_ENCODING_SCOPE:
            scope = field.getUint();
            break;
          case ElementId.CONTENT_ENCODING_TYPE:
            type = field.getUint();
            break;
          case ElementId.CONTENT_COMPRESSION: {
            const compression = field.createParser();
            while (compression.hasMoreData()) {
              const value = compression.parseElement();
              if (value.id == ElementId.CONTENT_COMP_ALGO) {
                algo = value.getUint();
              } else if (value.id == ElementId.CONTENT_COMP_SETTINGS) {
                settings = value.getBytes().slice();
              }
            }
            break;
          }
        }
      }
      const isHeaderStripping = type == typeCompression &&
          algo == shaka.mkv.ContentCompression.HEADER_STRIPPING &&
          scope == scopeFrames;
      if (isHeaderStripping && !track.strippedHeader) {
        track.strippedHeader = settings || new Uint8Array(0);
      } else {
        track.unsupportedEncoding = true;
      }
    }
  }

  /**
   * @param {!shaka.util.EbmlElement} atom
   * @param {!Array<shaka.mkv.MatroskaIndexParser.Chapter>} result
   * @private
   */
  static parseChapterAtom_(atom, result) {
    const ElementId = shaka.mkv.ElementId;
    const MatroskaIndexParser = shaka.mkv.MatroskaIndexParser;
    const nanosecondsPerSecond =
        shaka.mkv.MatroskaConstants.NANOSECONDS_PER_SECOND;
    let start = null;
    let end = null;
    const displays = [];
    const nested = [];

    const fields = atom.createParser();
    while (fields.hasMoreData()) {
      const field = fields.parseElement();
      switch (field.id) {
        case ElementId.CHAPTER_TIME_START:
          start = field.getUint() / nanosecondsPerSecond;
          break;
        case ElementId.CHAPTER_TIME_END:
          end = field.getUint() / nanosecondsPerSecond;
          break;
        case ElementId.CHAPTER_DISPLAY: {
          let title = '';
          let language = 'und';
          const items = field.createParser();
          while (items.hasMoreData()) {
            const item = items.parseElement();
            if (item.id == ElementId.CHAP_STRING) {
              title = item.getString();
            } else if (item.id == ElementId.CHAP_LANGUAGE ||
                item.id == ElementId.CHAP_LANGUAGE_BCP47) {
              language = item.getString();
            }
          }
          if (title) {
            displays.push({title, language});
          }
          break;
        }
        case ElementId.CHAPTER_ATOM:
          nested.push(field);
          break;
      }
    }
    if (start != null) {
      for (const display of displays) {
        result.push({
          start,
          end,
          title: display.title,
          language: display.language,
        });
      }
    }
    for (const child of nested) {
      MatroskaIndexParser.parseChapterAtom_(child, result);
    }
  }

  /** @return {!shaka.util.Error} @private */
  static invalid_() {
    return new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.MKV_INVALID_FILE);
  }
};


/**
 * @typedef {{
 *   offset: number,
 *   size: number,
 *   number: number,
 *   type: number,
 *   codecId: string,
 *   codecPrivate: ?Uint8Array,
 *   codecDelay: ?number,
 *   language: string,
 *   name: string,
 *   enabled: boolean,
 *   isDefault: boolean,
 *   forced: boolean,
 *   hearingImpaired: boolean,
 *   visualImpaired: boolean,
 *   original: boolean,
 *   commentary: boolean,
 *   width: ?number,
 *   height: ?number,
 *   displayWidth: ?number,
 *   displayHeight: ?number,
 *   transferCharacteristics: ?number,
 *   channels: ?number,
 *   sampleRate: ?number,
 *   outputSampleRate: ?number,
 *   defaultDuration: ?number,
 *   strippedHeader: ?Uint8Array,
 *   unsupportedEncoding: boolean,
 *   dolbyVisionConfig: ?Uint8Array,
 * }}
 *
 * @property {number} offset
 *   Absolute file offset of the TrackEntry element.
 * @property {number} size
 *   Size in bytes of the whole TrackEntry element, header included.
 * @property {number} number
 *   TrackNumber: what the blocks of the track refer to.
 * @property {number} type
 *   TrackType; see shaka.mkv.TrackType.
 * @property {?number} codecDelay
 *   CodecDelay in seconds.
 * @property {?number} defaultDuration
 *   DefaultDuration (the frame duration) in seconds.
 * @property {?number} transferCharacteristics
 *   Video Colour transfer characteristics (H.273 values).
 * @property {?Uint8Array} strippedHeader
 *   The prefix to put back in front of every frame, when the track uses header
 *   stripping.
 * @property {boolean} unsupportedEncoding
 *   True when the track is compressed or encrypted in a way that cannot be
 *   undone.
 * @property {?Uint8Array} dolbyVisionConfig
 *   The Dolby Vision configuration record (the payload of dvcC or dvvC).
 */
shaka.mkv.MatroskaIndexParser.Track;


/**
 * @typedef {{
 *   segmentOffset: number,
 *   cuesOffset: ?number,
 *   chaptersOffset: ?number,
 *   infoEndOffset: ?number,
 *   mediaEndOffset: ?number,
 *   duration: ?number,
 *   timecodeScale: number,
 *   tracks: !Array<!shaka.mkv.MatroskaIndexParser.Track>,
 *   firstClusterOffset: ?number,
 * }}
 *
 * @property {number} segmentOffset
 *   Absolute file offset of the first byte of the Segment's data.
 * @property {?number} cuesOffset
 *   Absolute file offset of the Cues element.
 * @property {?number} chaptersOffset
 *   Absolute file offset of the Chapters element.
 * @property {?number} infoEndOffset
 *   Absolute file offset of the byte after the Info element.
 * @property {?number} mediaEndOffset
 *   Absolute file offset where the Clusters end, if known.
 * @property {?number} duration
 *   Duration in seconds.
 * @property {number} timecodeScale
 *   Nanoseconds per timecode tick.
 * @property {?number} firstClusterOffset
 *   Absolute file offset of the first Cluster; null while it has not been
 *   reached in the data.
 */
shaka.mkv.MatroskaIndexParser.Header;


/**
 * @typedef {{time: number, track: number, offset: number}}
 *
 * @property {number} time
 *   CueTime in seconds.
 * @property {number} track
 *   CueTrack.
 * @property {number} offset
 *   Absolute file offset of the Cluster the CuePoint refers to.
 */
shaka.mkv.MatroskaIndexParser.CuePoint;


/**
 * @typedef {{start: number, end: ?number, title: string, language: string}}
 */
shaka.mkv.MatroskaIndexParser.Chapter;
