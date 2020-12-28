/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.text.SsaTextParser');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.text.Cue');
goog.require('shaka.text.TextEngine');
goog.require('shaka.util.StringUtils');


/**
 * Documentation: http://moodub.free.fr/video/ass-specs.doc
 * https://en.wikipedia.org/wiki/SubStation_Alpha
 * @implements {shaka.extern.TextParser}
 * @export
 */
shaka.text.SsaTextParser = class {
  /**
   * @override
   * @export
   */
  parseInit(data) {
    goog.asserts.assert(false, 'SSA does not have init segments');
  }

  /**
   * @override
   * @export
   */
  parseMedia(data, time) {
    return shaka.text.SsaTextParser.getCues(data);
  }

  /**
   * @param {BufferSource} data
   * @return {!Array.<!shaka.extern.Cue>}
   * @export
   */
  static getCues(data) {
    const StringUtils = shaka.util.StringUtils;
    const SsaTextParser = shaka.text.SsaTextParser;

    // Get the input as a string.
    const str = StringUtils.fromUTF8(data);


    const styles = [];

    /** @type {!Array.<!shaka.extern.Cue>} */
    const cues = [];
    const parts = str.split(/\r?\n\s*\r?\n/);
    for (const part of parts) {
      // SSA content
      const match = SsaTextParser.ssaContent_.exec(part);
      if (match) {
        const tag = match[1];
        if (tag == 'Script Info') {
          // Skip info tag
          continue;
        }

        // Used to be able to iterate over the parameters.
        let columns = null;

        const lines = match[2].split(/\r?\n/);
        for (const line of lines) {
          if (/^\s*;/.test(line)) {
            // Skip comment
            continue;
          }
          const lineParts = SsaTextParser.lineParts_.exec(line);
          if (lineParts) {
            const name = lineParts[1].trim();
            const value = lineParts[2].trim();
            if (tag == 'V4 Styles' || tag == 'V4+ Styles') {
              if (name == 'Format') {
                columns = value.split(SsaTextParser.valuesFormat_);
                continue;
              }
              if (name == 'Style') {
                const values = value.split(SsaTextParser.valuesFormat_);
                const style = {};
                for (let c = 0; c < columns.length && c < values.length; c++) {
                  style[columns[c]] = values[c];
                }
                styles.push(style);
                continue;
              }
            }
            // Note: It is mandatory that if styles are used, they are in the
            // file before the events.
            if (tag == 'Events') {
              if (name == 'Format') {
                columns = value.split(SsaTextParser.valuesFormat_);
                continue;
              }
              if (name == 'Dialogue') {
                const values = value.split(SsaTextParser.valuesFormat_);
                const data = {};
                for (let c = 0; c < columns.length && c < values.length; c++) {
                  data[columns[c]] = values[c];
                }

                const startTime = SsaTextParser.parseTime_(data['Start']);
                const endTime = SsaTextParser.parseTime_(data['End']);

                // Note: Normally, you should take the "Text" field, but if it
                // has a comma, it fails.
                const indexOfPayload =
                  value.split(',', columns.length - 1).join(',').length + 1;
                const payload = value.substr(indexOfPayload)
                    .replace(/\\N/g, '\n') // '\n' for new line
                    .replace(/\{[^}]+\}/g, ''); // {\pos(400,570)}

                const cue = new shaka.text.Cue(startTime, endTime, payload);

                const styleName = data['Style'];
                const styleData = styles.find((s) => s['Name'] == styleName);
                if (styleData) {
                  SsaTextParser.addStyle_(cue, styleData);
                }

                cues.push(cue);

                continue;
              }
            }
          }
        }
      }
      shaka.log.warning('SsaTextParser parser encountered an unknown part.',
          part);
    }

    return cues;
  }

  /**
   * Adds applicable style properties to a cue.
   *
   * @param {shaka.extern.Cue} cue
   * @param {Object} style
   * @private
   */
  static addStyle_(cue, style) {
    const Cue = shaka.text.Cue;
    const fontFamily = style['Fontname'];
    if (fontFamily) {
      cue.fontFamily = fontFamily;
    }
    const fontSize = style['Fontsize'];
    if (fontSize) {
      cue.fontSize = fontSize + 'px';
    }
    // TODO: convert a long integer BGR (blue-green-red) into RGB
    // const color = style['PrimaryColour'];
    // if (color) {
    // }
    // const backgroundColor = style['BackColour'];
    // if (backgroundColor) {
    // }
    const bold = style['Bold'];
    if (bold) {
      cue.fontWeight = Cue.fontWeight.BOLD;
    }
    const italic = style['Italic'];
    if (italic) {
      cue.fontStyle = Cue.fontStyle.ITALIC;
    }
    const underline = style['Underline'];
    if (underline) {
      cue.textDecoration.push(Cue.textDecoration.UNDERLINE);
    }
    const letterSpacing = style['Spacing'];
    if (letterSpacing) {
      cue.letterSpacing = letterSpacing + 'px';
    }
    const alignment = style['Alignment'];
    if (alignment) {
      const alignmentInt = parseInt(alignment, 10);
      switch (alignmentInt) {
        case 1:
          cue.displayAlign = Cue.displayAlign.AFTER;
          cue.textAlign = Cue.textAlign.START;
          break;
        case 2:
          cue.displayAlign = Cue.displayAlign.AFTER;
          cue.textAlign = Cue.textAlign.CENTER;
          break;
        case 3:
          cue.displayAlign = Cue.displayAlign.AFTER;
          cue.textAlign = Cue.textAlign.END;
          break;
        case 5:
          cue.displayAlign = Cue.displayAlign.BEFORE;
          cue.textAlign = Cue.textAlign.START;
          break;
        case 6:
          cue.displayAlign = Cue.displayAlign.BEFORE;
          cue.textAlign = Cue.textAlign.CENTER;
          break;
        case 7:
          cue.displayAlign = Cue.displayAlign.BEFORE;
          cue.textAlign = Cue.textAlign.END;
          break;
        case 9:
          cue.displayAlign = Cue.displayAlign.CENTER;
          cue.textAlign = Cue.textAlign.START;
          break;
        case 10:
          cue.displayAlign = Cue.displayAlign.CENTER;
          cue.textAlign = Cue.textAlign.CENTER;
          break;
        case 11:
          cue.displayAlign = Cue.displayAlign.CENTER;
          cue.textAlign = Cue.textAlign.END;
          break;
      }
    }
    const opacity = style['AlphaLevel'];
    if (opacity) {
      cue.opacity = parseFloat(opacity);
    }
  }

  /**
   * Parses a SSA time from the given parser.
   *
   * @param {string} string
   * @return {number}
   * @private
   */
  static parseTime_(string) {
    const SsaTextParser = shaka.text.SsaTextParser;
    const match = SsaTextParser.timeFormat_.exec(string);
    const hours = match[1] ? parseInt(match[1].replace(':', ''), 10) : 0;
    const minutes = parseInt(match[2], 10);
    const seconds = parseFloat(match[3]);
    return hours * 3600 + minutes * 60 + seconds;
  }
};

/**
 * @const
 * @private {!RegExp}
 * @example [V4 Styles]\nFormat: Name\nStyle: DefaultVCD
 */
shaka.text.SsaTextParser.ssaContent_ =
    /^\s*\[([^\]]+)\]\r?\n([\s\S]*)/;

/**
 * @const
 * @private {!RegExp}
 * @example Style: DefaultVCD,...
 */
shaka.text.SsaTextParser.lineParts_ =
    /^\s*([^:]+):\s*(.*)/;

/**
 * @const
 * @private {!RegExp}
 * @example Style: DefaultVCD,...
 */
shaka.text.SsaTextParser.valuesFormat_ = /\s*,\s*/;

/**
 * @const
 * @private {!RegExp}
 * @example 0:00:01.18 or 0:00:01.180 or 0:00:01.1
 */
shaka.text.SsaTextParser.timeFormat_ =
    /^(\d+:)?(\d{1,2}):(\d{1,2}(?:[.,]\d{1,3})?)?$/;

shaka.text.TextEngine.registerParser(
    'text/x-ssa', () => new shaka.text.SsaTextParser());
