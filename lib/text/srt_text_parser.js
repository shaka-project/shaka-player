/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.text.SrtTextParser');

goog.require('goog.asserts');
goog.require('shaka.text.TextEngine');
goog.require('shaka.text.VttTextParser');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.StringUtils');


/**
 * @implements {shaka.extern.TextParser}
 * @export
 */
shaka.text.SrtTextParser = class {
  constructor() {
    /**
     * @type {!shaka.extern.TextParser}
     * @private
     */
    this.parser_ = new shaka.text.VttTextParser();
  }

  /**
   * @override
   * @export
   */
  parseInit(data) {
    goog.asserts.assert(false, 'SRT does not have init segments');
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
  parseMedia(data, time, uri) {
    const BufferUtils = shaka.util.BufferUtils;
    const StringUtils = shaka.util.StringUtils;

    // Get the input as a string.
    const str = StringUtils.fromUTF8(data);

    const vvtText = this.srt2webvtt_(str);

    const newData = BufferUtils.toUint8(StringUtils.toUTF8(vvtText));

    return this.parser_.parseMedia(newData, time, uri, /* images= */ []);
  }

  /**
   * Convert a SRT format to WebVTT
   *
   * @param {string} data
   * @return {string}
   * @private
   */
  srt2webvtt_(data) {
    let result = 'WEBVTT\n\n';

    // Supports no cues
    if (data == '') {
      return result;
    }

    // remove dos newlines
    let srt = data.replace(/\r+/g, '');
    // trim white space start and end
    srt = srt.trim();

    // get cues
    const cuelist = srt.split('\n\n');
    for (const cue of cuelist) {
      result += this.convertSrtCue_(cue);
    }

    return result;
  }

  /**
   * Convert a single SRT cue into a WebVTT cue
   * Handles: timestamps, alignment, position, styles, colors.
   *
   * @param {string} caption
   * @return {string} WebVTT cue
   * @private
   */
  convertSrtCue_(caption) {
    // Split cue into non-empty trimmed lines
    const lines = caption.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      return '';
    }

    // 1. Remove numeric ID if present
    if (/^\d+$/.test(lines[0])) {
      lines.shift();
    }

    if (lines.length < 2) {
      return '';
    }

    // 2. Parse time line (start --> end [settings])
    const timeRegex = /^([\d:,]+)\s*-->\s*([\d:,]+)(.*)?$/;
    const match = lines[0].match(timeRegex);
    if (!match) {
      return '';
    }

    const start = this.normalizeTime_(match[1]);
    const end = this.normalizeTime_(match[2]);
    let settings = '';

    // 3. Combine remaining lines as cue text
    let text = lines.slice(1).join('\n');

    // 4. Aegisub alignment {\anX} → WebVTT line & align settings
    const alignMatch = text.match(/{\\an(\d)}/);
    if (alignMatch) {
      const map = {
        1: 'line:-1 align:left',
        2: 'line:-1 align:center',
        3: 'line:-1 align:right',
        7: 'line:0 align:left',
        8: 'line:0 align:center',
        9: 'line:0 align:right',
      };
      settings += map[alignMatch[1]] ? ` ${map[alignMatch[1]]}` : '';
    }

    // 5. Aegisub position {\pos(x,y)} → WebVTT position & line
    const posMatch = text.match(/{\\pos\((\d+),(\d+)\)}/);
    if (posMatch) {
      // Convert coordinates to percentages (approximation)
      const x = Math.min(100, Math.round(parseFloat(posMatch[1]) / 19.2));
      const y = Math.min(100, Math.round(parseFloat(posMatch[2]) / 10.8));
      settings += ` position:${x}% line:${y}%`;
    }

    // 6. Remove all remaining Aegisub/unsupported tags
    text = text.replace(/{\\.*?}/g, '');

    // 7. Convert basic SRT style tags {b}{/b}, {i}{/i}, {u}{/u} → HTML
    text = text
        .replace(/{b}/gi, '<b>')
        .replace(/{\/b}/gi, '</b>')
        .replace(/{i}/gi, '<i>')
        .replace(/{\/i}/gi, '</i>')
        .replace(/{u}/gi, '<u>')
        .replace(/{\/u}/gi, '</u>');

    // 8. Convert <font color="#XXXXXX"> → <c.colorName> (WebVTT spec)
    text = this.convertColors_(text);

    // 9. Return formatted WebVTT cue
    return `${start} --> ${end}${settings}\n${text}\n\n`;
  }

  /**
   * Normalize timestamp for WebVTT
   * Supports MM:SS,mmm → 00:MM:SS.mmm
   *
   * @param {string} time
   * @return {string}
   * @private
   */
  normalizeTime_(time) {
    if (/^\d{2}:\d{2},\d{3}$/.test(time)) {
      return '00:' + time.replace(',', '.');
    }
    return time.replace(',', '.');
  }

  /**
   * Convert SRT <font color="#XXXXXX"> or <font color="name"> tags
   * into WebVTT <c.colorName>. Unknown colors are removed safely.
   *
   * @param {string} text
   * @return {string}
   * @private
   */
  convertColors_(text) {
    // Map of supported colors to WebVTT classes
    const colorMap = {
      '#ffff00': 'yellow',
      '#ff0000': 'red',
      '#00ff00': 'lime',
      '#0000ff': 'blue',
      '#ffffff': 'white',
      '#000000': 'black',
      '#ffa500': 'orange',
      '#800080': 'purple',
      'yellow': 'yellow',
      'red': 'red',
      'lime': 'lime',
      'blue': 'blue',
      'white': 'white',
      'black': 'black',
      'orange': 'orange',
      'purple': 'purple',
    };

    const openColors = [];

    text = text.replace(/<font color=["']?([^"'>]+)["']?>/gi, (_, color) => {
      const key = color.toLowerCase();
      if (colorMap[key]) {
        openColors.push(colorMap[key]);
        return `<c.${colorMap[key]}>`;
      }
      return '';
    });

    text = text.replace(/<\/font>/gi, () => {
      if (openColors.length) {
        return `</c>`;
      }
      return '';
    });

    return text;
  }
};


shaka.text.TextEngine.registerParser(
    'text/srt', () => new shaka.text.SrtTextParser());
