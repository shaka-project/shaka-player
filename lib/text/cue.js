/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.text.Cue');

goog.require('shaka.log');
goog.require('shaka.text.CueRegion');
goog.require('shaka.util.ArrayUtils');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.TextParser');
goog.require('shaka.util.TXml');


/**
 * @export
 */
shaka.text.Cue = class {
  /**
   * @param {number} startTime
   * @param {number} endTime
   * @param {string} payload
   */
  constructor(startTime, endTime, payload) {
    const Cue = shaka.text.Cue;

    /**
     * The start time of the cue in seconds, relative to the start of the
     * presentation.
     * @type {number}
     * @export
     */
    this.startTime = startTime;

    /**
     * The end time of the cue in seconds, relative to the start of the
     * presentation.
     * @type {number}
     * @export
     */
    this.endTime = endTime;

    /**
     * The text payload of the cue.  If nestedCues is non-empty, this should be
     * empty.  Top-level block containers should have no payload of their own.
     * @type {string}
     * @export
     */
    this.payload = payload;

    /**
     * The region to render the cue into.  Only supported on top-level cues,
     * because nested cues are inline elements.
     * @type {shaka.text.CueRegion}
     * @export
     */
    this.region = new shaka.text.CueRegion();

    /**
     * The indent (in percent) of the cue box in the direction defined by the
     * writing direction.
     * @type {?number}
     * @export
     */
    this.position = null;

    /**
     * Position alignment of the cue.
     * @type {shaka.text.Cue.positionAlign}
     * @export
     */
    this.positionAlign = Cue.positionAlign.AUTO;

    /**
     * Size of the cue box (in percents), where 0 means "auto".
     * @type {number}
     * @export
     */
    this.size = 0;

    /**
     * Alignment of the text inside the cue box.
     * @type {shaka.text.Cue.textAlign}
     * @export
     */
    this.textAlign = Cue.textAlign.CENTER;

    /**
     * Text direction of the cue.
     * @type {shaka.text.Cue.direction}
     * @export
     */
    this.direction = Cue.direction.HORIZONTAL_LEFT_TO_RIGHT;

    /**
     * Text writing mode of the cue.
     * @type {shaka.text.Cue.writingMode}
     * @export
     */
    this.writingMode = Cue.writingMode.HORIZONTAL_TOP_TO_BOTTOM;

    /**
     * The way to interpret line field. (Either as an integer line number or
     * percentage from the display box).
     * @type {shaka.text.Cue.lineInterpretation}
     * @export
     */
    this.lineInterpretation = Cue.lineInterpretation.LINE_NUMBER;

    /**
     * The offset from the display box in either number of lines or
     * percentage depending on the value of lineInterpretation.
     * @type {?number}
     * @export
     */
    this.line = null;

    /**
     * Separation between line areas inside the cue box in px or em
     * (e.g. '100px'/'100em'). If not specified, this should be no less than
     * the largest font size applied to the text in the cue.
     * @type {string}.
     * @export
     */
    this.lineHeight = '';

    /**
     * Line alignment of the cue box.
     * Start alignment means the cue box’s top side (for horizontal cues), left
     * side (for vertical growing right), or right side (for vertical growing
     * left) is aligned at the line.
     * Center alignment means the cue box is centered at the line.
     * End alignment The cue box’s bottom side (for horizontal cues), right side
     * (for vertical growing right), or left side (for vertical growing left) is
     * aligned at the line.
     * @type {shaka.text.Cue.lineAlign}
     * @export
     */
    this.lineAlign = Cue.lineAlign.START;

    /**
     * Vertical alignments of the cues within their extents.
     * 'BEFORE' means displaying the captions at the top of the text display
     * container box, 'CENTER' means in the middle, 'AFTER' means at the bottom.
     * @type {shaka.text.Cue.displayAlign}
     * @export
     */
    this.displayAlign = Cue.displayAlign.AFTER;

    /**
     * Text color as a CSS color, e.g. "#FFFFFF" or "white".
     * @type {string}
     * @export
     */
    this.color = '';

    /**
     * Text background color as a CSS color, e.g. "#FFFFFF" or "white".
     * @type {string}
     * @export
     */
    this.backgroundColor = '';

    /**
     * The URL of the background image, e.g. "data:[mime type];base64,[data]".
     * @type {string}
     * @export
     */
    this.backgroundImage = '';

    /**
     * The border around this cue as a CSS border.
     * @type {string}
     * @export
     */
    this.border = '';

    /**
     * Text font size in px or em (e.g. '100px'/'100em').
     * @type {string}
     * @export
     */
    this.fontSize = '';

    /**
     * Text font weight. Either normal or bold.
     * @type {shaka.text.Cue.fontWeight}
     * @export
     */
    this.fontWeight = Cue.fontWeight.NORMAL;

    /**
     * Text font style. Normal, italic or oblique.
     * @type {shaka.text.Cue.fontStyle}
     * @export
     */
    this.fontStyle = Cue.fontStyle.NORMAL;

    /**
     * Text font family.
     * @type {string}
     * @export
     */
    this.fontFamily = '';

    /**
     * Text letter spacing as a CSS letter-spacing value.
     * @type {string}
     * @export
     */
    this.letterSpacing = '';

    /**
     * Text line padding as a CSS line-padding value.
     * @type {string}
     * @export
     */
    this.linePadding = '';

    /**
     * Opacity of the cue element, from 0-1.
     * @type {number}
     * @export
     */
    this.opacity = 1;

    /**
     * Text combine upright as a CSS text-combine-upright value.
     * @type {string}
     * @export
     */
    this.textCombineUpright = '';

    /**
     * Text decoration. A combination of underline, overline
     * and line through. Empty array means no decoration.
     * @type {!Array<!shaka.text.Cue.textDecoration>}
     * @export
     */
    this.textDecoration = [];

    /**
     * Text shadow color as a CSS text-shadow value.
     * @type {string}
     * @export
     */
    this.textShadow = '';

    /**
     * Text stroke color as a CSS color, e.g. "#FFFFFF" or "white".
     * @type {string}
     * @export
     */
    this.textStrokeColor = '';

    /**
     * Text stroke width as a CSS stroke-width value.
     * @type {string}
     * @export
     */
    this.textStrokeWidth = '';

    /**
     * Whether or not line wrapping should be applied to the cue.
     * @type {boolean}
     * @export
     */
    this.wrapLine = true;

    /**
     * Id of the cue.
     * @type {string}
     * @export
     */
    this.id = '';

    /**
     * Nested cues, which should be laid out horizontally in one block.
     * Top-level cues are blocks, and nested cues are inline elements.
     * Cues can be nested arbitrarily deeply.
     * @type {!Array<!shaka.text.Cue>}
     * @export
     */
    this.nestedCues = [];

    /**
     * If true, this represents a container element that is "above" the main
     * cues. For example, the <body> and <div> tags that contain the <p> tags
     * in a TTML file. This controls the flow of the final cues; any nested cues
     * within an "isContainer" cue will be laid out as separate lines.
     * @type {boolean}
     * @export
     */
    this.isContainer = false;

    /**
     * Whether or not the cue only acts as a line break between two nested cues.
     * Should only appear in nested cues.
     * @type {boolean}
     * @export
     */
    this.lineBreak = false;

    /**
     * Used to indicate the type of ruby tag that should be used when rendering
     * the cue. Valid values: ruby, rp, rt.
     * @type {?string}
     * @export
     */
    this.rubyTag = null;

    /**
     * The number of horizontal and vertical cells into which the Root Container
     * Region area is divided.
     *
     * @type {{ columns: number, rows: number }}
     * @export
     */
    this.cellResolution = {
      columns: 32,
      rows: 15,
    };
  }

  /**
   * @param {number} start
   * @param {number} end
   * @return {!shaka.text.Cue}
   */
  static lineBreak(start, end) {
    const cue = new shaka.text.Cue(start, end, '');
    cue.lineBreak = true;
    return cue;
  }

  /**
   * Create a copy of the cue with the same properties.
   * @return {!shaka.text.Cue}
   * @suppress {checkTypes} since we must use [] and "in" with a struct type.
   * @export
   */
  clone() {
    const clone = new shaka.text.Cue(0, 0, '');

    for (const k in this) {
      clone[k] = this[k];

      // Make copies of array fields, but only one level deep.  That way, if we
      // change, for instance, textDecoration on the clone, we don't affect the
      // original.
      if (Array.isArray(clone[k])) {
        clone[k] = /** @type {!Array} */(clone[k]).slice();
      }
    }

    return clone;
  }

  /**
   * Check if two Cues have all the same values in all properties.
   * @param {!shaka.text.Cue} cue1
   * @param {!shaka.text.Cue} cue2
   * @return {boolean}
   * @suppress {checkTypes} since we must use [] and "in" with a struct type.
   * @export
   */
  static equal(cue1, cue2) {
    // Compare the start time, end time and payload of the cues first for
    // performance optimization.  We can avoid the more expensive recursive
    // checks if the top-level properties don't match.
    // See: https://github.com/shaka-project/shaka-player/issues/3018
    if (cue1.payload != cue2.payload) {
      return false;
    }
    const isDiffNegligible = (a, b) => Math.abs(a - b) < 0.001;
    if (!isDiffNegligible(cue1.startTime, cue2.startTime) ||
        !isDiffNegligible(cue1.endTime, cue2.endTime)) {
      return false;
    }
    for (const k in cue1) {
      if (k == 'startTime' || k == 'endTime' || k == 'payload') {
        // Already compared.
      } else if (k == 'nestedCues') {
        // This uses shaka.text.Cue.equal rather than just this.equal, since
        // otherwise recursing here will unbox the method and cause "this" to be
        // undefined in deeper recursion.
        if (!shaka.util.ArrayUtils.equal(
            cue1.nestedCues, cue2.nestedCues, shaka.text.Cue.equal)) {
          return false;
        }
      } else if (k == 'region' || k == 'cellResolution') {
        for (const k2 in cue1[k]) {
          if (cue1[k][k2] != cue2[k][k2]) {
            return false;
          }
        }
      } else if (Array.isArray(cue1[k])) {
        if (!shaka.util.ArrayUtils.equal(cue1[k], cue2[k])) {
          return false;
        }
      } else {
        if (cue1[k] != cue2[k]) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Parses cue payload, searches for styling entities and, if needed,
   * modifies original payload and creates nested cues to better represent
   * styling found in payload. All changes are done in-place.
   * @param {!shaka.text.Cue} cue
   * @param {!Map<string, !shaka.text.Cue>=} styles
   * @export
   */
  static parseCuePayload(cue, styles = new Map()) {
    const StringUtils = shaka.util.StringUtils;
    const TXml = shaka.util.TXml;
    let payload = cue.payload;
    if (!payload.includes('<')) {
      cue.payload = StringUtils.htmlUnescape(payload);
      return;
    }
    if (styles.size === 0) {
      shaka.text.Cue.addDefaultTextColor(styles);
    }
    payload = shaka.text.Cue.replaceKaraokeStylePayload_(payload);
    payload = shaka.text.Cue.replaceVoiceStylePayload_(payload);
    payload = shaka.text.Cue.escapeInvalidChevrons_(payload);

    cue.payload = '';

    const xmlPayload = '<span>' + payload + '</span>';
    let element;
    try {
      element = TXml.parseXmlString(xmlPayload, 'span');
    } catch (e) {
      shaka.log.warning('cue parse fail: ', e);
    }
    if (element) {
      const childNodes = element.children;
      if (childNodes.length == 1) {
        const childNode = childNodes[0];
        if (!TXml.isNode(childNode)) {
          cue.payload = StringUtils.htmlUnescape(payload);
          return;
        }
      }
      for (const childNode of childNodes) {
        shaka.text.Cue.generateCueFromElement_(childNode, cue, styles);
      }
    } else {
      shaka.log.warning('The cue\'s markup could not be parsed: ', payload);
      cue.payload = StringUtils.htmlUnescape(payload);
    }
  }

  /**
   * Add default color
   *
   * @param {!Map<string, !shaka.text.Cue>} styles
   */
  static addDefaultTextColor(styles) {
    const textColor = shaka.text.Cue.defaultTextColor;
    for (const [key, value] of Object.entries(textColor)) {
      const cue = new shaka.text.Cue(0, 0, '');
      cue.color = value;
      styles.set('.' + key, cue);
    }

    const bgColor = shaka.text.Cue.defaultTextBackgroundColor;
    for (const [key, value] of Object.entries(bgColor)) {
      const cue = new shaka.text.Cue(0, 0, '');
      cue.backgroundColor = value;
      styles.set('.' + key, cue);
    }
  }

  /**
   * Converts karaoke style tag to be valid for xml parsing
   * For example,
   * input: Text <00:00:00.450> time <00:00:01.450> 1
   * output: Text <div time="00:00:00.450"> time
   *         <div time="00:00:01.450"> 1</div></div>
   *
   * @param {string} payload
   * @return {string} processed payload
   * @private
   */
  static replaceKaraokeStylePayload_(payload) {
    const names = [];
    let nameStart = -1;
    for (let i = 0; i < payload.length; i++) {
      if (payload[i] === '<') {
        nameStart = i + 1;
      } else if (payload[i] === '>') {
        if (nameStart > 0) {
          const name = payload.substr(nameStart, i - nameStart);
          if (name.match(shaka.text.Cue.timeFormat_)) {
            names.push(name);
          }
          nameStart = -1;
        }
      }
    }
    let newPayload = payload;
    for (const name of names) {
      const replaceTag = '<' + name + '>';
      const startTag = '<div time="' + name + '">';
      const endTag = '</div>';
      newPayload = newPayload.replace(replaceTag, startTag);
      newPayload += endTag;
    }
    return newPayload;
  }

  /**
   * Converts voice style tag to be valid for xml parsing
   * For example,
   * input: <v Shaka>Test
   * output: <v.voice-Shaka>Test</v.voice-Shaka>
   *
   * @param {string} payload
   * @return {string} processed payload
   * @private
   */
  static replaceVoiceStylePayload_(payload) {
    const voiceTag = 'v';
    const names = [];
    let nameStart = -1;
    let newPayload = '';
    let hasVoiceEndTag = false;
    for (let i = 0; i < payload.length; i++) {
      // This condition is used to manage tags that have end tags.
      if (payload[i] === '/') {
        const end = payload.indexOf('>', i);
        if (end === -1) {
          return payload;
        }
        const tagEnd = payload.substring(i + 1, end);
        if (!tagEnd || tagEnd != voiceTag) {
          newPayload += payload[i];
          continue;
        }
        hasVoiceEndTag = true;
        let tagStart = null;
        if (names.length) {
          tagStart = names[names.length -1];
        }
        if (!tagStart) {
          newPayload += payload[i];
        } else if (tagStart === tagEnd) {
          newPayload += '/' + tagEnd + '>';
          i += tagEnd.length + 1;
        } else {
          if (!tagStart.startsWith(voiceTag)) {
            newPayload += payload[i];
            continue;
          }
          newPayload += '/' + tagStart + '>';
          i += tagEnd.length + 1;
        }
      } else {
        // Here we only want the tag name, not any other payload.
        if (payload[i] === '<') {
          nameStart = i + 1;
          if (payload[nameStart] != voiceTag) {
            nameStart = -1;
          }
        } else if (payload[i] === '>') {
          if (nameStart > 0) {
            names.push(payload.substr(nameStart, i - nameStart));
            nameStart = -1;
          }
        }
        newPayload += payload[i];
      }
    }
    for (const name of names) {
      const newName = name.replace(' ', '.voice-');
      newPayload = newPayload.replace(`<${name}>`, `<${newName}>`);
      newPayload = newPayload.replace(`</${name}>`, `</${newName}>`);
      if (!hasVoiceEndTag) {
        newPayload += `</${newName}>`;
      }
    }
    return newPayload;
  }

  /**
   * This method converts invalid > chevrons to HTML entities.
   * It also removes < chevrons as per spec.
   *
   * @param {!string} input
   * @return {string}
   * @private
   */
  static escapeInvalidChevrons_(input) {
    // Used to map HTML entities to characters.
    const htmlEscapes = {
      '< ': '',
      ' >': ' &gt;',
    };

    const reEscapedHtml = /(< +>|<\s|\s>)/g;
    const reHasEscapedHtml = RegExp(reEscapedHtml.source);
    // This check is an optimization, since replace always makes a copy
    if (input && reHasEscapedHtml.test(input)) {
      return input.replace(reEscapedHtml, (entity) => {
        return htmlEscapes[entity] || '';
      });
    }
    return input || '';
  }

  /**
   * @param {!shaka.extern.xml.Node} element
   * @param {!shaka.text.Cue} rootCue
   * @param {!Map<string, !shaka.text.Cue>} styles
   * @private
   */
  static generateCueFromElement_(element, rootCue, styles) {
    const TXml = shaka.util.TXml;
    const nestedCue = rootCue.clone();
    // We don't want propagate some properties.
    nestedCue.nestedCues = [];
    nestedCue.payload = '';
    nestedCue.rubyTag = '';
    // We don't want propagate some position settings
    nestedCue.line = null;
    nestedCue.region = new shaka.text.CueRegion();
    nestedCue.position = null;
    nestedCue.size = 0;
    nestedCue.textAlign = shaka.text.Cue.textAlign.CENTER;

    if (TXml.isNode(element)) {
      const bold = shaka.text.Cue.fontWeight.BOLD;
      const italic = shaka.text.Cue.fontStyle.ITALIC;
      const underline = shaka.text.Cue.textDecoration.UNDERLINE;
      const tags = element.tagName.split(/(?=[ .])+/g);
      for (const tag of tags) {
        let styleTag = tag;
        // White blanks at start indicate that the style is a voice
        if (styleTag.startsWith('.voice-')) {
          const voice = styleTag.split('-').pop();
          styleTag = `v[voice="${voice}"]`;
          // The specification allows to have quotes and not, so we check to
          // see which one is being used.
          if (!styles.has(styleTag)) {
            styleTag = `v[voice=${voice}]`;
          }
        }
        if (styles.has(styleTag)) {
          shaka.text.Cue.mergeStyle_(nestedCue, styles.get(styleTag));
        }
        switch (tag) {
          case 'br': {
            const lineBreakCue = shaka.text.Cue.lineBreak(
                nestedCue.startTime, nestedCue.endTime);
            rootCue.nestedCues.push(lineBreakCue);
            return;
          }
          case 'b':
            nestedCue.fontWeight = bold;
            break;
          case 'i':
            nestedCue.fontStyle = italic;
            break;
          case 'u':
            nestedCue.textDecoration.push(underline);
            break;
          case 'font': {
            const color = element.attributes['color'];
            if (color) {
              nestedCue.color = color;
            }
            break;
          }
          case 'div': {
            const time = element.attributes['time'];
            if (!time) {
              break;
            }
            const cueTime = shaka.util.TextParser.parseTime(time);
            if (cueTime) {
              nestedCue.startTime = cueTime;
            }
            break;
          }
          case 'ruby':
          case 'rp':
          case 'rt':
            nestedCue.rubyTag = tag;
            break;
          default:
            break;
        }
      }
    }

    const isTextNode = (item) => TXml.isText(item);
    const childNodes = element.children;
    if (isTextNode(element) ||
        (childNodes.length == 1 && isTextNode(childNodes[0]))) {
      // Trailing line breaks may lost when convert cue to HTML tag
      // Need to insert line break cue to preserve line breaks
      const textArr = TXml.getTextContents(element).split('\n');
      let isFirst = true;
      for (const text of textArr) {
        if (!isFirst) {
          const lineBreakCue = shaka.text.Cue.lineBreak(
              nestedCue.startTime, nestedCue.endTime);
          rootCue.nestedCues.push(lineBreakCue);
        }
        if (text.length > 0) {
          const textCue = nestedCue.clone();
          textCue.payload = shaka.util.StringUtils.htmlUnescape(text);
          rootCue.nestedCues.push(textCue);
        }
        isFirst = false;
      }
    } else {
      rootCue.nestedCues.push(nestedCue);
      for (const childNode of childNodes) {
        shaka.text.Cue.generateCueFromElement_(childNode, nestedCue, styles);
      }
    }
  }

  /**
   * Merges values created in parseStyle_
   * @param {!shaka.text.Cue} cue
   * @param {shaka.text.Cue} refCue
   * @private
   */
  static mergeStyle_(cue, refCue) {
    if (!refCue) {
      return;
    }

    // Overwrites if new value string length > 0
    cue.backgroundColor = shaka.text.Cue.getOrDefault_(
        refCue.backgroundColor, cue.backgroundColor);
    cue.color = shaka.text.Cue.getOrDefault_(
        refCue.color, cue.color);
    cue.fontFamily = shaka.text.Cue.getOrDefault_(
        refCue.fontFamily, cue.fontFamily);
    cue.fontSize = shaka.text.Cue.getOrDefault_(
        refCue.fontSize, cue.fontSize);
    cue.textShadow = shaka.text.Cue.getOrDefault_(
        refCue.textShadow, cue.textShadow);

    // Overwrite with new values as unable to determine
    // if new value is set or not
    cue.fontWeight = refCue.fontWeight;
    cue.fontStyle = refCue.fontStyle;
    cue.opacity = refCue.opacity;
    cue.rubyTag = refCue.rubyTag;
    cue.textCombineUpright = refCue.textCombineUpright;
    cue.wrapLine = refCue.wrapLine;
  }

  /**
   * @param {string} value
   * @param {string} defaultValue
   * @return {string}
   * @private
   */
  static getOrDefault_(value, defaultValue) {
    if (value && value.length > 0) {
      return value;
    }
    return defaultValue;
  }
};


/**
 * @enum {string}
 * @export
 */
shaka.text.Cue.positionAlign = {
  'LEFT': 'line-left',
  'RIGHT': 'line-right',
  'CENTER': 'center',
  'AUTO': 'auto',
};


/**
 * @enum {string}
 * @export
 */
shaka.text.Cue.textAlign = {
  'LEFT': 'left',
  'RIGHT': 'right',
  'CENTER': 'center',
  'START': 'start',
  'END': 'end',
};


/**
 * Vertical alignments of the cues within their extents.
 * 'BEFORE' means displaying at the top of the captions container box, 'CENTER'
 *  means in the middle, 'AFTER' means at the bottom.
 * @enum {string}
 * @export
 */
shaka.text.Cue.displayAlign = {
  'BEFORE': 'before',
  'CENTER': 'center',
  'AFTER': 'after',
};


/**
 * @enum {string}
 * @export
 */
shaka.text.Cue.direction = {
  'HORIZONTAL_LEFT_TO_RIGHT': 'ltr',
  'HORIZONTAL_RIGHT_TO_LEFT': 'rtl',
};


/**
 * @enum {string}
 * @export
 */
shaka.text.Cue.writingMode = {
  'HORIZONTAL_TOP_TO_BOTTOM': 'horizontal-tb',
  'VERTICAL_LEFT_TO_RIGHT': 'vertical-lr',
  'VERTICAL_RIGHT_TO_LEFT': 'vertical-rl',
};


/**
 * @enum {number}
 * @export
 */
shaka.text.Cue.lineInterpretation = {
  'LINE_NUMBER': 0,
  'PERCENTAGE': 1,
};


/**
 * @enum {string}
 * @export
 */
shaka.text.Cue.lineAlign = {
  'CENTER': 'center',
  'START': 'start',
  'END': 'end',
};


/**
 * Default text color according to
 * https://w3c.github.io/webvtt/#default-text-color
 * @enum {string}
 * @export
 */
shaka.text.Cue.defaultTextColor = {
  'white': 'white',
  'lime': 'lime',
  'cyan': 'cyan',
  'red': 'red',
  'yellow': 'yellow',
  'magenta': 'magenta',
  'blue': 'blue',
  'black': 'black',
};


/**
 * Default text background color according to
 * https://w3c.github.io/webvtt/#default-text-background
 * @enum {string}
 * @export
 */
shaka.text.Cue.defaultTextBackgroundColor = {
  'bg_white': 'white',
  'bg_lime': 'lime',
  'bg_cyan': 'cyan',
  'bg_red': 'red',
  'bg_yellow': 'yellow',
  'bg_magenta': 'magenta',
  'bg_blue': 'blue',
  'bg_black': 'black',
};


/**
 * In CSS font weight can be a number, where 400 is normal and 700 is bold.
 * Use these values for the enum for consistency.
 * @enum {number}
 * @export
 */
shaka.text.Cue.fontWeight = {
  'NORMAL': 400,
  'BOLD': 700,
};


/**
 * @enum {string}
 * @export
 */
shaka.text.Cue.fontStyle = {
  'NORMAL': 'normal',
  'ITALIC': 'italic',
  'OBLIQUE': 'oblique',
};


/**
 * @enum {string}
 * @export
 */
shaka.text.Cue.textDecoration = {
  'UNDERLINE': 'underline',
  'LINE_THROUGH': 'lineThrough',
  'OVERLINE': 'overline',
};

/** @private */
shaka.text.Cue.timeFormat_ = /(?:(\d{1,}):)?(\d{2}):(\d{2})\.(\d{2,3})/g;
