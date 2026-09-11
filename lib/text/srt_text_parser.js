/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.text.SrtTextParser');

goog.require('shaka.text.TextEngine');
goog.require('shaka.text.Utils');
goog.require('shaka.text.VttTextParser');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.StringUtils');


/**
 * @implements {shaka.extern.TextParser}
 * @export
 */
shaka.text.SrtTextParser = class extends shaka.text.VttTextParser {
  /**
   * @override
   * @export
   */
  parseMedia(data, time, uri, images) {
    const BufferUtils = shaka.util.BufferUtils;
    const StringUtils = shaka.util.StringUtils;

    // Get the input as a string.
    const str = StringUtils.fromUTF8(data);

    const vttText = this.srt2webvtt_(str);

    const newData = BufferUtils.toUint8(StringUtils.toUTF8(vttText));

    return super.parseMedia(newData, time, uri, images);
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

    // Remove UTF-8 BOM if present
    let srt = data.replace(/^\uFEFF/, '');

    // remove dos newlines
    srt = srt.replace(/\r+/g, '');
    // trim white space start and end
    srt = srt.trim();

    // Supports no cues
    if (srt === '') {
      return result;
    }

    // get cues (split on blank lines, allowing whitespace on empty lines)
    const cuelist = srt.split(/\n\s*\n/);
    for (const cue of cuelist) {
      if (cue.trim()) {
        result += this.convertSrtCue_(cue);
      }
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
    const timeRegex = /^([\d:,.]+)\s*-->\s*([\d:,.]+)(.*)?$/;
    const match = lines[0].match(timeRegex);
    if (!match) {
      return '';
    }

    const start = this.normalizeTime_(match[1]);
    const end = this.normalizeTime_(match[2]);
    let settings = match[3] ? match[3].trim() : '';
    if (settings) {
      settings = ' ' + settings;
    }

    // 3. Combine remaining lines as cue text
    let text = lines.slice(1).join('\n');

    // 4. Aegisub alignment {\anX} or legacy SSA {\aX} → WebVTT settings
    const anMatch = text.match(/{[^{}]*?\\an([1-9])(?![0-9])[^{}]*}/);
    if (anMatch) {
      const anMap = {
        '1': 'line:-1 align:left',
        '2': 'line:-1 align:center',
        '3': 'line:-1 align:right',
        '4': 'line:50% align:left',
        '5': 'line:50% align:center',
        '6': 'line:50% align:right',
        '7': 'line:0 align:left',
        '8': 'line:0 align:center',
        '9': 'line:0 align:right',
      };
      const alignSetting = anMap[anMatch[1]];
      if (alignSetting) {
        settings += ` ${alignSetting}`;
      }
    } else {
      const aMatch =
          text.match(/{[^{}]*?\\a(10|11|[1-35-79])(?![0-9])[^{}]*}/);
      if (aMatch) {
        const aMap = {
          '1': 'line:-1 align:left',
          '2': 'line:-1 align:center',
          '3': 'line:-1 align:right',
          '5': 'line:0 align:left',
          '6': 'line:0 align:center',
          '7': 'line:0 align:right',
          '9': 'line:50% align:left',
          '10': 'line:50% align:center',
          '11': 'line:50% align:right',
        };
        const alignSetting = aMap[aMatch[1]];
        if (alignSetting) {
          settings += ` ${alignSetting}`;
        }
      }
    }

    // 5. Aegisub position {\pos(x,y)} → WebVTT position & line
    const posMatch = text.match(/{[^{}]*?\\pos\((\d+),(\d+)\)[^{}]*}/);
    if (posMatch) {
      // Convert coordinates to percentages (approximation)
      const x = Math.min(100, Math.round(parseFloat(posMatch[1]) / 19.2));
      const y = Math.min(100, Math.round(parseFloat(posMatch[2]) / 10.8));
      settings += ` position:${x}% line:${y}%`;
    }

    // 6. Convert Aegisub and SRT inline style tags
    text = text.replace(/{([^{}]*)}/g, (_, inner) => {
      const lower = inner.trim().toLowerCase();
      if (lower === 'b') {
        return '<b>';
      }
      if (lower === '/b') {
        return '</b>';
      }
      if (lower === 'i') {
        return '<i>';
      }
      if (lower === '/i') {
        return '</i>';
      }
      if (lower === 'u') {
        return '<u>';
      }
      if (lower === '/u') {
        return '</u>';
      }
      if (inner.startsWith('\\')) {
        let tagHtml = '';
        if (/\\b([1-9]\d{2,}|1)(?![0-9])/i.test(inner)) {
          tagHtml += '<b>';
        } else if (/\\b(0|(?![a-zA-Z0-9]))/i.test(inner)) {
          tagHtml += '</b>';
        }
        if (/\\i1(?![0-9])/i.test(inner)) {
          tagHtml += '<i>';
        } else if (/\\i(0|(?![a-zA-Z0-9]))/i.test(inner)) {
          tagHtml += '</i>';
        }
        if (/\\u1(?![0-9])/i.test(inner)) {
          tagHtml += '<u>';
        } else if (/\\u(0|(?![a-zA-Z0-9]))/i.test(inner)) {
          tagHtml += '</u>';
        }
        return tagHtml;
      }
      return '';
    });

    // 7. Remove all remaining Aegisub/unsupported tags
    text = text.replace(/{\\.*?}/g, '');

    // 8. Convert <font color="..."> → <c.colorName> (WebVTT spec)
    text = this.convertColors_(text);

    // 9. Return formatted WebVTT cue
    return `${start} --> ${end}${settings}\n${text}\n\n`;
  }

  /**
   * Normalize timestamp for WebVTT
   * Supports:
   *   H:MM:SS,mmm -> 0H:MM:SS.mmm
   *   M:SS,mmm -> 00:0M:SS.mmm
   *   MM:SS,mmm -> 00:MM:SS.mmm
   *
   * @param {string} time
   * @return {string}
   * @private
   */
  normalizeTime_(time) {
    time = time.replace(',', '.');
    const parts = time.split(':');
    if (parts.length === 2) {
      // M:SS.mmm or MM:SS.mmm -> 00:MM:SS.mmm
      const minutes = parts[0].padStart(2, '0');
      return `00:${minutes}:${parts[1]}`;
    } else if (parts.length === 3) {
      // H:MM:SS.mmm -> 0H:MM:SS.mmm
      const hours = parts[0].padStart(2, '0');
      return `${hours}:${parts[1]}:${parts[2]}`;
    }
    return time;
  }

  /**
   * Convert SRT <font ... color="#XXXXXX" ...> or
   * <font ... color="name" ...> tags into WebVTT <c.colorName>.
   * Unknown colors are removed safely.
   *
   * @param {string} text
   * @return {string}
   * @private
   */
  convertColors_(text) {
    const openColors = [];

    text = text.replace(/<font(\s+[^>]*)?>/gi, (_, attrs) => {
      if (attrs) {
        const colorMatch = attrs.match(/color=["']?([^"'\s>]+)["']?/i);
        if (colorMatch) {
          const key = colorMatch[1].toLowerCase();
          const colorName = shaka.text.Utils.getColorName(key);
          if (colorName) {
            openColors.push(colorName);
            return `<c.${colorName}>`;
          }
        }
      }
      openColors.push(null);
      return '';
    });

    text = text.replace(/<\/font>/gi, () => {
      if (openColors.length) {
        const colorName = openColors.pop();
        return colorName ? '</c>' : '';
      }
      return '';
    });

    return text;
  }
};


shaka.text.TextEngine.registerParser(
    'text/srt', () => new shaka.text.SrtTextParser());
