/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.text.MatroskaTextParser');

goog.require('shaka.mkv.MatroskaClusterParser');
goog.require('shaka.mkv.CodecId');
goog.require('shaka.mkv.MatroskaCodecs');
goog.require('shaka.mkv.MatroskaIndexParser');
goog.require('shaka.text.SrtTextParser');
goog.require('shaka.text.SsaTextParser');
goog.require('shaka.text.TextEngine');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.StringUtils');


/**
 * Reads the subtitles of a Matroska file: SRT (S_TEXT/UTF8) and SSA/ASS
 * (S_TEXT/SSA, S_TEXT/ASS).
 *
 * A subtitle track is stored as one block per cue, whose payload has no times:
 * the time and the duration are those of the block.  This parser puts the cues
 * back together into SRT, or into ASS with the header of the track, and lets
 * shaka.text.SrtTextParser or shaka.text.SsaTextParser do the rest, so styles
 * are handled like in any other file of the format.
 *
 * The initialization segment of the stream is the beginning of the file, up
 * to the end of the TrackEntry of the subtitle track, so the track is the last
 * one it describes.  The media segments are the byte ranges of the Clusters,
 * the same ones the audio and the video are read from.
 *
 * @implements {shaka.extern.TextParser}
 * @export
 */
shaka.text.MatroskaTextParser = class {
  constructor() {
    /** @private {?shaka.mkv.MatroskaIndexParser.Header} */
    this.header_ = null;

    /** @private {?shaka.mkv.MatroskaIndexParser.Track} */
    this.track_ = null;

    /** @private {!shaka.text.SrtTextParser} */
    this.srtParser_ = new shaka.text.SrtTextParser();

    /** @private {!shaka.text.SsaTextParser} */
    this.ssaParser_ = new shaka.text.SsaTextParser();
  }

  /**
   * @override
   * @export
   */
  parseInit(data) {
    const header = shaka.mkv.MatroskaIndexParser.parseHeader(data);
    const track = header.tracks[header.tracks.length - 1];
    if (!track) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_TEXT_HEADER);
    }
    this.header_ = header;
    this.track_ = track;
  }

  /**
   * @override
   * @export
   */
  setManifestType(manifestType) {
    this.srtParser_.setManifestType(manifestType);
  }

  /**
   * @override
   * @export
   */
  parseMedia(data, time, uri, images) {
    if (!this.header_ || !this.track_) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_TEXT_HEADER);
    }
    const frames = shaka.mkv.MatroskaClusterParser.parseFrames(
        data, this.track_, this.header_.timecodeScale);

    const isSsa = this.track_.codecId == shaka.mkv.CodecId.ASS ||
        this.track_.codecId == shaka.mkv.CodecId.SSA;
    const text = isSsa ? this.makeSsa_(frames, time) :
        this.makeSrt_(frames, time);

    // The times are absolute, so no offset is to be added to them.
    /** @type {shaka.extern.TextParser.TimeContext} */
    const absoluteTime = {
      periodStart: time.periodStart,
      segmentStart: time.segmentStart,
      segmentEnd: time.segmentEnd,
      vttOffset: 0,
      isMpegTs: time.isMpegTs,
    };
    const parser = isSsa ? this.ssaParser_ : this.srtParser_;
    return parser.parseMedia(
        shaka.util.BufferUtils.toUint8(shaka.util.StringUtils.toUTF8(text)),
        absoluteTime, uri, images);
  }

  /**
   * @param {!Array<shaka.mkv.MatroskaClusterParser.Frame>} frames
   * @param {shaka.extern.TextParser.TimeContext} time
   * @return {string}
   * @private
   */
  makeSrt_(frames, time) {
    const MatroskaTextParser = shaka.text.MatroskaTextParser;
    let srt = '';
    let index = 1;
    for (let i = 0; i < frames.length; i++) {
      const text = MatroskaTextParser.normalizeText_(
          shaka.util.StringUtils.fromUTF8(frames[i].data));
      if (!text) {
        continue;
      }
      const start = frames[i].time;
      const end = MatroskaTextParser.getEnd_(frames, i, time);
      srt += (index++) + '\n' +
          MatroskaTextParser.formatSrtTime_(start) + ' --> ' +
          MatroskaTextParser.formatSrtTime_(end) + '\n' + text + '\n\n';
    }
    return srt;
  }

  /**
   * Writes the events of the blocks after the header of the track, as a file of
   * ASS has them.  A block has the fields of a Dialogue line but for the times:
   * ReadOrder, Layer (Marked in SSA), Style, Name, MarginL, MarginR, MarginV,
   * Effect and Text.
   *
   * @param {!Array<shaka.mkv.MatroskaClusterParser.Frame>} frames
   * @param {shaka.extern.TextParser.TimeContext} time
   * @return {string}
   * @private
   */
  makeSsa_(frames, time) {
    const MatroskaTextParser = shaka.text.MatroskaTextParser;
    const track = /** @type {!shaka.mkv.MatroskaIndexParser.Track} */(
      this.track_);
    // The header ends with the line that names the columns of the events.
    let ssa = shaka.util.StringUtils.fromUTF8(
        track.codecPrivate || new Uint8Array(0)).trim() + '\n';
    for (let i = 0; i < frames.length; i++) {
      const fields = shaka.text.SsaTextParser.splitFirst(
          shaka.util.StringUtils.fromUTF8(frames[i].data), ',',
          MatroskaTextParser.SSA_BLOCK_FIELDS_);
      if (fields.length < MatroskaTextParser.SSA_BLOCK_FIELDS_) {
        continue;
      }
      // Drop ReadOrder, which is the order in the file, and put the times
      // after the layer.
      const [, layer, style, name, marginL, marginR, marginV, effect,
        text] = fields;
      const start = MatroskaTextParser.formatSsaTime_(frames[i].time);
      const end = MatroskaTextParser.formatSsaTime_(
          MatroskaTextParser.getEnd_(frames, i, time));
      ssa += 'Dialogue: ' + [layer, start, end, style, name, marginL, marginR,
        marginV, effect, text].join(',') + '\n';
    }
    return ssa;
  }

  /**
   * Gets when a cue ends.  A cue that does not say how long it lasts ends where
   * the next one starts or, for the last one, with the segment.
   *
   * @param {!Array<shaka.mkv.MatroskaClusterParser.Frame>} frames
   * @param {number} index
   * @param {shaka.extern.TextParser.TimeContext} time
   * @return {number}
   * @private
   */
  static getEnd_(frames, index, time) {
    const frame = frames[index];
    let end = time.segmentEnd;
    if (frame.duration != null) {
      end = frame.time + frame.duration;
    } else if (index + 1 < frames.length) {
      end = frames[index + 1].time;
    }
    return Math.max(frame.time, end);
  }

  /**
   * Makes the text of a cue safe to put in SRT, where an empty line ends the
   * cue.
   *
   * @param {string} text
   * @return {string}
   * @private
   */
  static normalizeText_(text) {
    return text.replace(/\r\n?/g, '\n').replace(/\n{2,}/g, '\n').trim();
  }

  /**
   * @param {number} seconds
   * @return {string} The time as H:MM:SS.mmm, which is how ASS has them (with
   *   centiseconds, but the parser takes up to three digits).
   * @private
   */
  static formatSsaTime_(seconds) {
    const totalMilliseconds = Math.max(0, Math.round(seconds * 1000));
    const milliseconds = totalMilliseconds % 1000;
    const totalSeconds = Math.floor(totalMilliseconds / 1000);
    const pad = (value, length) => String(value).padStart(length, '0');
    return Math.floor(totalSeconds / 3600) + ':' +
        pad(Math.floor(totalSeconds / 60) % 60, 2) + ':' +
        pad(totalSeconds % 60, 2) + '.' + pad(milliseconds, 3);
  }

  /**
   * @param {number} seconds
   * @return {string} The time as HH:MM:SS,mmm.
   * @private
   */
  static formatSrtTime_(seconds) {
    const pad = (value, length) => String(value).padStart(length, '0');
    const totalMilliseconds = Math.max(0, Math.round(seconds * 1000));
    const milliseconds = totalMilliseconds % 1000;
    const totalSeconds = Math.floor(totalMilliseconds / 1000);
    return pad(Math.floor(totalSeconds / 3600), 2) + ':' +
        pad(Math.floor(totalSeconds / 60) % 60, 2) + ':' +
        pad(totalSeconds % 60, 2) + ',' + pad(milliseconds, 3);
  }
};


/**
 * The MIME type of the text streams that the Matroska parser creates.  The
 * container is what identifies the parser, the codec the format of the cues.
 *
 * @const {string}
 */
shaka.text.MatroskaTextParser.MIME_TYPE = 'text/x-matroska';


/**
 * How many fields the text of a block of ASS has: ReadOrder, Layer, Style,
 * Name, MarginL, MarginR, MarginV, Effect and Text.
 *
 * @private @const {number}
 */
shaka.text.MatroskaTextParser.SSA_BLOCK_FIELDS_ = 9;


for (const codec of [shaka.mkv.MatroskaCodecs.SRT_CODEC,
  shaka.mkv.MatroskaCodecs.ASS_CODEC]) {
  shaka.text.TextEngine.registerParser(
      'text/x-matroska; codecs="' + codec + '"',
      () => new shaka.text.MatroskaTextParser());
}
