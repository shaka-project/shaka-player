/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.text.SsaTextParser');

goog.require('shaka.log');
goog.require('shaka.text.Cue');
goog.require('shaka.text.TextEngine');
goog.require('shaka.util.StringUtils');


/**
 * Parser of SubStation Alpha subtitles (SSA and ASS, the V4 and V4+ versions).
 * It reads the text of a whole file, or of a header followed by events, and
 * gives a cue for each Dialogue line, with the properties of its style.
 *
 * What ASS can do beyond a line of text (positions, transitions, drawings,
 * karaoke) is not shown: the override blocks are dropped, and so are the
 * events that draw shapes.
 *
 * @see http://moodub.free.fr/video/ass-specs.doc
 * @see https://en.wikipedia.org/wiki/SubStation_Alpha
 *
 * @implements {shaka.extern.TextParser}
 * @export
 */
shaka.text.SsaTextParser = class {
  /**
   * @override
   * @export
   */
  parseInit(data) {
    // There is no initialization segment: a file has everything.
  }

  /**
   * @override
   * @export
   */
  setManifestType(manifestType) {
    // Unused.
  }

  /**
   * @override
   * @export
   */
  parseMedia(data, time, uri, images) {
    const SsaTextParser = shaka.text.SsaTextParser;
    const text = shaka.util.StringUtils.fromUTF8(data);
    const sections = SsaTextParser.splitSections_(text);

    const styles = [];
    let isV4Plus = false;
    for (const [name, lines] of sections) {
      const lowerName = name.toLowerCase();
      if (lowerName == SsaTextParser.SECTION_V4_STYLES_ ||
          lowerName == SsaTextParser.SECTION_V4_PLUS_STYLES_) {
        isV4Plus = lowerName == SsaTextParser.SECTION_V4_PLUS_STYLES_;
        styles.push(...SsaTextParser.parseTable_(lines, 'Style'));
      } else if (lowerName != SsaTextParser.SECTION_EVENTS_ &&
          lowerName != SsaTextParser.SECTION_SCRIPT_INFO_) {
        shaka.log.debug('SsaTextParser skips the section', name);
      }
    }

    /** @type {!Array<!shaka.text.Cue>} */
    const cues = [];
    for (const [name, lines] of sections) {
      if (name.toLowerCase() != SsaTextParser.SECTION_EVENTS_) {
        continue;
      }
      for (const event of SsaTextParser.parseTable_(lines, 'Dialogue')) {
        const cue = SsaTextParser.makeCue_(event, styles, isV4Plus);
        if (cue) {
          cues.push(cue);
        }
      }
    }
    return cues;
  }

  /**
   * Splits a file in its sections: the lines that follow each [Name] line.
   *
   * @param {string} text
   * @return {!Array<!Array>} Pairs of a name and its lines.
   * @private
   */
  static splitSections_(text) {
    const sections = [];
    let lines = null;
    for (const line of text.split(/\r?\n/)) {
      const match = shaka.text.SsaTextParser.SECTION_HEADER_.exec(line);
      if (match) {
        lines = [];
        sections.push([match[1], lines]);
      } else if (lines) {
        lines.push(line);
      }
    }
    return sections;
  }

  /**
   * Reads the lines of a section that are a table: a Format line, which names
   * the columns, and the lines of a kind (Style, Dialogue) that have the
   * values.
   *
   * @param {!Array<string>} lines
   * @param {string} kind
   * @return {!Array<!Object<string, string>>} The values of each row by the
   *   name of their column.
   * @private
   */
  static parseTable_(lines, kind) {
    const SsaTextParser = shaka.text.SsaTextParser;
    /** @type {?Array<string>} */
    let columns = null;
    const rows = [];
    for (const line of lines) {
      // A line that starts with ; is a comment.
      if (SsaTextParser.COMMENT_.test(line)) {
        continue;
      }
      const match = SsaTextParser.KEY_VALUE_.exec(line);
      if (!match) {
        continue;
      }
      const key = match[1].trim();
      if (key == 'Format') {
        columns = match[2].split(',').map((column) => column.trim());
      } else if (key == kind && columns) {
        // The last column, the text, can have commas of its own, so it takes
        // all that is left.
        const values = SsaTextParser.splitFirst(
            match[2], ',', columns.length);
        /** @type {!Object<string, string>} */
        const row = {};
        for (let i = 0; i < columns.length && i < values.length; i++) {
          row[columns[i]] = values[i];
        }
        rows.push(row);
      }
    }
    return rows;
  }

  /**
   * Splits a string in at most |count| parts by a separator, the last of which
   * has what is left.  Some formats have the commas of the text of the last
   * field among the ones that separate the fields.
   *
   * @param {string} text
   * @param {string} separator
   * @param {number} count
   * @return {!Array<string>}
   */
  static splitFirst(text, separator, count) {
    const parts = [];
    let start = 0;
    while (parts.length < count - 1) {
      const end = text.indexOf(separator, start);
      if (end < 0) {
        break;
      }
      parts.push(text.substring(start, end));
      start = end + separator.length;
    }
    parts.push(text.substring(start));
    return parts;
  }

  /**
   * @param {!Object<string, string>} event The values of a Dialogue line.
   * @param {!Array<!Object<string, string>>} styles
   * @param {boolean} isV4Plus
   * @return {?shaka.text.Cue}
   * @private
   */
  static makeCue_(event, styles, isV4Plus) {
    const SsaTextParser = shaka.text.SsaTextParser;
    const startTime = SsaTextParser.parseTime_(event['Start']);
    const endTime = SsaTextParser.parseTime_(event['End']);
    if (startTime == null || endTime == null) {
      shaka.log.debug('SsaTextParser skips an event with no times');
      return null;
    }
    const raw = event['Text'] || '';
    // An event that draws a shape has the drawing commands as its text.
    if (SsaTextParser.DRAWING_.test(raw)) {
      return null;
    }
    const payload = raw
        // A hard line break.
        .replace(/\\N/g, '\n')
        // A soft line break and a hard space.
        .replace(/\\n/g, ' ')
        .replace(/\\h/g, ' ')
        // The blocks of override tags, such as {\pos(400,570)}.
        .replace(/\{[^}]*\}/g, '');
    if (!payload.trim()) {
      return null;
    }

    const cue = new shaka.text.Cue(startTime, endTime, payload);
    const style = styles.find((entry) => entry['Name'] == event['Style']);
    if (style) {
      SsaTextParser.addStyle_(cue, style, isV4Plus);
    }
    return cue;
  }

  /**
   * Adds the properties of a style that a cue has.
   *
   * @param {shaka.text.Cue} cue
   * @param {!Object<string, string>} style
   * @param {boolean} isV4Plus
   * @private
   */
  static addStyle_(cue, style, isV4Plus) {
    const Cue = shaka.text.Cue;
    const SsaTextParser = shaka.text.SsaTextParser;
    if (style['Fontname']) {
      cue.fontFamily = style['Fontname'];
    }
    if (style['Fontsize']) {
      cue.fontSize = style['Fontsize'] + 'px';
    }
    if (style['PrimaryColour']) {
      const color = SsaTextParser.parseColor_(style['PrimaryColour']);
      if (color) {
        cue.color = color;
      }
    }
    if (style['BackColour']) {
      const color = SsaTextParser.parseColor_(style['BackColour']);
      if (color) {
        cue.backgroundColor = color;
      }
    }
    if (SsaTextParser.isSet_(style['Bold'])) {
      cue.fontWeight = Cue.fontWeight.BOLD;
    }
    if (SsaTextParser.isSet_(style['Italic'])) {
      cue.fontStyle = Cue.fontStyle.ITALIC;
    }
    if (SsaTextParser.isSet_(style['Underline'])) {
      cue.textDecoration.push(Cue.textDecoration.UNDERLINE);
    }
    if (style['Spacing']) {
      cue.letterSpacing = style['Spacing'] + 'px';
    }
    const alignment = SsaTextParser.parseAlignment_(
        style['Alignment'], isV4Plus);
    if (alignment) {
      cue.displayAlign = alignment.displayAlign;
      cue.textAlign = alignment.textAlign;
    }
    if (style['AlphaLevel']) {
      cue.opacity = parseFloat(style['AlphaLevel']);
    }
  }

  /**
   * Tells whether a flag of a style is set.  Styles write flags as -1 (set) and
   * 0 (not set).
   *
   * @param {(string|undefined)} value
   * @return {boolean}
   * @private
   */
  static isSet_(value) {
    const number = parseInt(value, 10);
    return !isNaN(number) && number != 0;
  }

  /**
   * Reads the alignment of a style.  ASS (V4+) numbers the nine positions like
   * the keys of a numeric keypad, from the bottom left.  SSA (V4) has its own
   * numbers: 1 to 3 at the bottom, 5 to 7 at the top and 9 to 11 in the
   * middle, and left, center and right in each.
   *
   * @param {(string|undefined)} value
   * @param {boolean} isV4Plus
   * @return {?{displayAlign: shaka.text.Cue.displayAlign,
   *   textAlign: shaka.text.Cue.textAlign}}
   * @private
   */
  static parseAlignment_(value, isV4Plus) {
    const Cue = shaka.text.Cue;
    const number = parseInt(value, 10);
    if (isNaN(number)) {
      return null;
    }
    let row;
    let column;
    if (isV4Plus) {
      if (number < 1 || number > 9) {
        return null;
      }
      row = Math.floor((number - 1) / 3);
      column = (number - 1) % 3;
    } else {
      // The ranges 1-3, 5-7 and 9-11 are the bottom, top and middle rows.
      const rowsOfSsa = [0, 2, 1];
      const group = Math.floor((number - 1) / 4);
      column = (number - 1) % 4;
      if (group > 2 || column > 2) {
        return null;
      }
      row = rowsOfSsa[group];
    }
    // Row 0 is the bottom one.
    const displayAligns = [
      Cue.displayAlign.AFTER,
      Cue.displayAlign.CENTER,
      Cue.displayAlign.BEFORE,
    ];
    const textAligns = [
      Cue.textAlign.START,
      Cue.textAlign.CENTER,
      Cue.textAlign.END,
    ];
    return {displayAlign: displayAligns[row], textAlign: textAligns[column]};
  }

  /**
   * Reads a color.  It is a number in hexadecimal (&HAABBGGRR) or in decimal,
   * with the bytes in the order alpha, blue, green and red, and its alpha is
   * the other way around: 0xFF is transparent.
   *
   * @param {string} colorString
   * @return {?string} A CSS color.
   * @private
   */
  static parseColor_(colorString) {
    const trimmed = colorString.trim();
    const isHex = /^&H/i.test(trimmed);
    const abgr = isHex ? parseInt(trimmed.replace(/^&H/i, ''), 16) :
        parseInt(trimmed, 10);
    if (isNaN(abgr)) {
      return null;
    }
    // Do not use >> on the whole number: it is a signed 32-bit shift, and the
    // number can have 32 bits of value.
    const unsigned = abgr >>> 0;
    const alpha = (((unsigned >>> 24) & 0xff) ^ 0xff) / 255;
    const blue = (unsigned >>> 16) & 0xff;
    const green = (unsigned >>> 8) & 0xff;
    const red = unsigned & 0xff;
    return 'rgba(' + red + ',' + green + ',' + blue + ',' + alpha + ')';
  }

  /**
   * Reads a time: H:MM:SS.cc, with one to three digits after the dot.
   *
   * @param {(string|undefined)} string
   * @return {?number} The time in seconds.
   * @private
   */
  static parseTime_(string) {
    const match = shaka.text.SsaTextParser.TIME_.exec((string || '').trim());
    if (!match) {
      return null;
    }
    const hours = match[1] ? parseInt(match[1], 10) : 0;
    return hours * 3600 + parseInt(match[2], 10) * 60 + parseFloat(match[3]);
  }
};


/**
 * The line that starts a section, such as [V4+ Styles].
 * @private @const {!RegExp}
 */
shaka.text.SsaTextParser.SECTION_HEADER_ = /^\s*\[([^\]]+)\]\s*$/;

/**
 * A line that has a key, a colon and a value, such as Style: Default,Arial.
 * @private @const {!RegExp}
 */
shaka.text.SsaTextParser.KEY_VALUE_ = /^\s*([^:]+):\s*(.*)$/;

/**
 * A comment.
 * @private @const {!RegExp}
 */
shaka.text.SsaTextParser.COMMENT_ = /^\s*;/;

/**
 * A time: 0:00:01.1, 0:00:01.18 or 0:00:01.180.
 * @private @const {!RegExp}
 */
shaka.text.SsaTextParser.TIME_ =
    /^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d{1,3})?)$/;

/**
 * The tag that turns the text of an event into commands to draw a shape.
 * @private @const {!RegExp}
 */
shaka.text.SsaTextParser.DRAWING_ = /\{[^}]*\\p[1-9]/;

/**
 * The names of the sections that are read, in lower case.
 * @private @const {string}
 */
shaka.text.SsaTextParser.SECTION_SCRIPT_INFO_ = 'script info';

/** @private @const {string} */
shaka.text.SsaTextParser.SECTION_V4_STYLES_ = 'v4 styles';

/** @private @const {string} */
shaka.text.SsaTextParser.SECTION_V4_PLUS_STYLES_ = 'v4+ styles';

/** @private @const {string} */
shaka.text.SsaTextParser.SECTION_EVENTS_ = 'events';


shaka.text.TextEngine.registerParser(
    'text/x-ssa', () => new shaka.text.SsaTextParser());
