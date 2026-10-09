/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.mkv.BlockAddType');
goog.provide('shaka.mkv.BlockFlag');
goog.provide('shaka.mkv.CodecId');
goog.provide('shaka.mkv.ContentCompression');
goog.provide('shaka.mkv.ElementId');
goog.provide('shaka.mkv.Lacing');
goog.provide('shaka.mkv.MatroskaConstants');
goog.provide('shaka.mkv.TrackType');


/**
 * EBML element IDs used by Matroska and WebM.
 *
 * The IDs are the wire values of the Matroska specification (RFC 9559), IDs
 * included their length marker, so they can be compared directly with what the
 * EBML parser returns.
 *
 * @see https://www.rfc-editor.org/rfc/rfc9559.html#name-matroska-schema
 * @enum {number}
 */
shaka.mkv.ElementId = {
  // EBML header.
  EBML: 0x1A45DFA3,
  EBML_VERSION: 0x4286,
  EBML_READ_VERSION: 0x42F7,
  EBML_MAX_ID_LENGTH: 0x42F2,
  EBML_MAX_SIZE_LENGTH: 0x42F3,
  DOC_TYPE: 0x4282,
  DOC_TYPE_VERSION: 0x4287,
  DOC_TYPE_READ_VERSION: 0x4285,

  // Segment and its top-level children.
  SEGMENT: 0x18538067,
  SEEK_HEAD: 0x114D9B74,
  INFO: 0x1549A966,
  TRACKS: 0x1654AE6B,
  CLUSTER: 0x1F43B675,
  CUES: 0x1C53BB6B,
  CHAPTERS: 0x1043A770,
  TAGS: 0x1254C367,
  ATTACHMENTS: 0x1941A469,

  // SeekHead.
  SEEK: 0x4DBB,
  SEEK_ID: 0x53AB,
  SEEK_POSITION: 0x53AC,

  // Info.
  TIMECODE_SCALE: 0x2AD7B1,
  DURATION: 0x4489,
  MUXING_APP: 0x4D80,
  WRITING_APP: 0x5741,

  // Tracks.
  TRACK_ENTRY: 0xAE,
  TRACK_NUMBER: 0xD7,
  TRACK_UID: 0x73C5,
  TRACK_TYPE: 0x83,
  FLAG_ENABLED: 0xB9,
  FLAG_DEFAULT: 0x88,
  FLAG_FORCED: 0x55AA,
  FLAG_HEARING_IMPAIRED: 0x55AB,
  FLAG_VISUAL_IMPAIRED: 0x55AC,
  FLAG_ORIGINAL: 0x55AE,
  FLAG_COMMENTARY: 0x55AF,
  DEFAULT_DURATION: 0x23E383,
  TRACK_NAME: 0x536E,
  LANGUAGE: 0x22B59C,
  LANGUAGE_BCP47: 0x22B59D,
  CODEC_ID: 0x86,
  CODEC_PRIVATE: 0x63A2,
  CODEC_DELAY: 0x56AA,
  BLOCK_ADDITION_MAPPING: 0x41E4,
  BLOCK_ADD_ID_TYPE: 0x41E7,
  BLOCK_ADD_ID_EXTRA_DATA: 0x41ED,
  CONTENT_ENCODINGS: 0x6D80,
  CONTENT_ENCODING: 0x6240,
  CONTENT_ENCODING_SCOPE: 0x5032,
  CONTENT_ENCODING_TYPE: 0x5033,
  CONTENT_COMPRESSION: 0x5034,
  CONTENT_COMP_ALGO: 0x4254,
  CONTENT_COMP_SETTINGS: 0x4255,

  // Track video settings.
  VIDEO: 0xE0,
  PIXEL_WIDTH: 0xB0,
  PIXEL_HEIGHT: 0xBA,
  DISPLAY_WIDTH: 0x54B0,
  DISPLAY_HEIGHT: 0x54BA,
  DISPLAY_UNIT: 0x54B2,
  COLOUR: 0x55B0,
  TRANSFER_CHARACTERISTICS: 0x55BA,
  COLOUR_PRIMARIES: 0x55BB,

  // Track audio settings.
  AUDIO: 0xE1,
  SAMPLING_FREQUENCY: 0xB5,
  OUTPUT_SAMPLING_FREQUENCY: 0x78B5,
  CHANNELS: 0x9F,
  BIT_DEPTH: 0x6264,

  // Cluster.
  CLUSTER_TIMECODE: 0xE7,
  SIMPLE_BLOCK: 0xA3,
  BLOCK_GROUP: 0xA0,
  BLOCK: 0xA1,
  BLOCK_DURATION: 0x9B,
  REFERENCE_BLOCK: 0xFB,

  // Cues.
  CUE_POINT: 0xBB,
  CUE_TIME: 0xB3,
  CUE_TRACK_POSITIONS: 0xB7,
  CUE_TRACK: 0xF7,
  CUE_CLUSTER_POSITION: 0xF1,

  // Chapters.
  EDITION_ENTRY: 0x45B9,
  CHAPTER_ATOM: 0xB6,
  CHAPTER_TIME_START: 0x91,
  CHAPTER_TIME_END: 0x92,
  CHAPTER_DISPLAY: 0x80,
  CHAP_STRING: 0x85,
  CHAP_LANGUAGE: 0x437C,
  CHAP_LANGUAGE_BCP47: 0x437D,
};


/**
 * Values of the TrackType element.
 *
 * @see https://www.rfc-editor.org/rfc/rfc9559.html#name-tracktype-element
 * @enum {number}
 */
shaka.mkv.TrackType = {
  VIDEO: 1,
  AUDIO: 2,
  SUBTITLE: 0x11,
};


/**
 * The lacing scheme of a block, stored in bits 1-2 of the block flags.  Lacing
 * packs several small frames (typically audio) into one block.
 *
 * @see https://www.rfc-editor.org/rfc/rfc9559.html#name-lacing
 * @enum {number}
 */
shaka.mkv.Lacing = {
  NONE: 0x00,
  XIPH: 0x02,
  FIXED_SIZE: 0x04,
  EBML: 0x06,
};


/**
 * Bits of the flags byte that follows the timecode in a (Simple)Block.
 *
 * @enum {number}
 */
shaka.mkv.BlockFlag = {
  /** Set on a SimpleBlock that is a keyframe. */
  KEYFRAME: 0x80,
  /** Mask of the two lacing bits. */
  LACING_MASK: 0x06,
};


/**
 * Values of ContentCompAlgo.  Only header stripping can be undone without a
 * decompressor; it is what mkvmerge uses to save a few bytes per frame.
 *
 * @enum {number}
 */
shaka.mkv.ContentCompression = {
  HEADER_STRIPPING: 3,
};


/**
 * Values of BlockAddIDType that the parser knows: the four characters of a
 * box name, as a number.  Matroska carries the Dolby Vision configuration
 * record in a BlockAdditionMapping of this type.
 *
 * @enum {number}
 */
shaka.mkv.BlockAddType = {
  DVCC: 0x64766343,
  DVVC: 0x64767643,
};


/**
 * The CodecID strings of the codecs the parser knows how to repackage into
 * fragmented MP4.  Any other CodecID is ignored.
 *
 * @see https://www.matroska.org/technical/codec_specs.html
 * @enum {string}
 */
shaka.mkv.CodecId = {
  AVC: 'V_MPEG4/ISO/AVC',
  HEVC: 'V_MPEGH/ISO/HEVC',
  VP8: 'V_VP8',
  VP9: 'V_VP9',
  AV1: 'V_AV1',
  AAC: 'A_AAC',
  AC3: 'A_AC3',
  EAC3: 'A_EAC3',
  OPUS: 'A_OPUS',
  VORBIS: 'A_VORBIS',
  FLAC: 'A_FLAC',
  MP3: 'A_MPEG/L3',
  SRT: 'S_TEXT/UTF8',
  // Deprecated alias of S_TEXT/UTF8 that old muxers still write.
  ASCII: 'S_TEXT/ASCII',
  ASS: 'S_TEXT/ASS',
  SSA: 'S_TEXT/SSA',
};


shaka.mkv.MatroskaConstants = class {};


/**
 * Matroska stores every time as an integer count of "ticks", and TimecodeScale
 * says how many nanoseconds a tick is.  This is the number of nanoseconds in a
 * second, i.e. the factor that turns ticks * TimecodeScale into seconds.
 *
 * @const {number}
 */
shaka.mkv.MatroskaConstants.NANOSECONDS_PER_SECOND = 1e9;


/**
 * Default TimecodeScale when the Info element does not write one: 1,000,000 ns,
 * i.e. every tick is 1 ms.
 *
 * @const {number}
 */
shaka.mkv.MatroskaConstants.DEFAULT_TIMECODE_SCALE = 1000000;


/**
 * Language of a track that has no Language element.  The Matroska
 * specification (not "und") defines the default as English.
 *
 * @const {string}
 */
shaka.mkv.MatroskaConstants.DEFAULT_LANGUAGE = 'eng';


/**
 * How much later than in the file the transmuxer presents the media, in
 * seconds.  The parser makes up for it with the timestampOffset of the
 * references, so the presentation times do not change.
 *
 * A frame in MP4 cannot be decoded after it is presented, and decode times
 * cannot be negative.  A video frame that the encoder reorders (B-frames) is
 * decoded earlier than it is presented, by up to 16 frames (about 0.7 s at
 * 24 fps).  The transmuxer uses the times of the file as decode times, and
 * moves the presentation times by more than that delay, so no frame is
 * presented before it is decoded, and the decode times of the segments follow
 * each other with no gap or overlap.
 *
 * @const {number}
 */
shaka.mkv.MatroskaConstants.MEDIA_TIME_SHIFT = 1;


/**
 * What is added to the number of a track to make the identifier of a second
 * stream of the same track.  A Dolby Vision track whose base layer plays on its
 * own has two streams, one with each codec, the way HLS and DASH describe
 * them, and the identifiers of streams are unique.  It is larger than any track
 * number a muxer writes (they count from 1).
 *
 * @const {number}
 */
shaka.mkv.MatroskaConstants.ALTERNATE_STREAM_ID_OFFSET = 1048576;


/**
 * The EBML DocType values a Matroska parser accepts.  WebM is the subset of
 * Matroska that browsers can already play, but the same structure applies.
 *
 * @const {!Array<string>}
 */
shaka.mkv.MatroskaConstants.DOC_TYPES = ['matroska', 'webm'];


/**
 * Level-1 elements: the children of Segment.  An unknown-size Cluster ends
 * when the next one of these begins.
 *
 * @const {!Set<number>}
 */
shaka.mkv.MatroskaConstants.LEVEL_1_IDS = new Set([
  shaka.mkv.ElementId.SEEK_HEAD,
  shaka.mkv.ElementId.INFO,
  shaka.mkv.ElementId.TRACKS,
  shaka.mkv.ElementId.CLUSTER,
  shaka.mkv.ElementId.CUES,
  shaka.mkv.ElementId.CHAPTERS,
  shaka.mkv.ElementId.TAGS,
  shaka.mkv.ElementId.ATTACHMENTS,
]);
