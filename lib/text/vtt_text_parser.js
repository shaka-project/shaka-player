/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.text.VttTextParser');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.text.Cue');
goog.require('shaka.text.CueRegion');
goog.require('shaka.text.TextEngine');
goog.require('shaka.util.Error');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.TextParser');
goog.require('shaka.util.XmlUtils');


/**
 * @implements {shaka.extern.TextParser}
 * @export
 */
shaka.text.VttTextParser = class {
  /**
   * @override
   * @export
   */
  parseInit(data) {
    goog.asserts.assert(false, 'VTT does not have init segments');
  }

  /**
   * @override
   * @export
   */
  parseMedia(data, time) {
    const VttTextParser = shaka.text.VttTextParser;
    // Get the input as a string.  Normalize newlines to \n.
    let str = shaka.util.StringUtils.fromUTF8(data);
    str = str.replace(/\r\n|\r(?=[^\n]|$)/gm, '\n');
    const blocks = str.split(/\n{2,}/m);

    if (!/^WEBVTT($|[ \t\n])/m.test(blocks[0])) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_TEXT_HEADER);
    }

    // NOTE: "periodStart" is the timestamp offset applied via TextEngine.
    // It is no longer closely tied to periods, but the name stuck around.
    let offset = time.periodStart;

    if (blocks[0].includes('X-TIMESTAMP-MAP')) {
      // https://bit.ly/2K92l7y
      // The 'X-TIMESTAMP-MAP' header is used in HLS to align text with
      // the rest of the media.
      // The header format is 'X-TIMESTAMP-MAP=MPEGTS:n,LOCAL:m'
      // (the attributes can go in any order)
      // where n is MPEG-2 time and m is cue time it maps to.
      // For example 'X-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:900000'
      // means an offset of 10 seconds
      // 900000/MPEG_TIMESCALE - cue time.
      const cueTimeMatch =
            blocks[0].match(/LOCAL:((?:(\d{1,}):)?(\d{2}):(\d{2})\.(\d{3}))/m);

      const mpegTimeMatch = blocks[0].match(/MPEGTS:(\d+)/m);
      if (cueTimeMatch && mpegTimeMatch) {
        const parser = new shaka.util.TextParser(cueTimeMatch[1]);
        const cueTime = shaka.text.VttTextParser.parseTime_(parser);
        if (cueTime == null) {
          throw new shaka.util.Error(
              shaka.util.Error.Severity.CRITICAL,
              shaka.util.Error.Category.TEXT,
              shaka.util.Error.Code.INVALID_TEXT_HEADER);
        }

        let mpegTime = Number(mpegTimeMatch[1]);
        const mpegTimescale = shaka.text.VttTextParser.MPEG_TIMESCALE_;

        const rolloverSeconds =
            shaka.text.VttTextParser.TS_ROLLOVER_ / mpegTimescale;
        let segmentStart = time.segmentStart;
        while (segmentStart >= rolloverSeconds) {
          segmentStart -= rolloverSeconds;
          mpegTime += shaka.text.VttTextParser.TS_ROLLOVER_;
        }

        // Apple-encoded HLS content uses absolute timestamps, so assume the
        // presence of the map tag means the content uses absolute timestamps.
        offset = time.periodStart + mpegTime / mpegTimescale - cueTime;
      }
    }

    // Parse VTT regions.
    /* !Array.<!shaka.extern.CueRegion> */
    const regions = [];
    for (const line of blocks[0].split('\n')) {
      if (/^Region:/.test(line)) {
        const region = VttTextParser.parseRegion_(line);
        regions.push(region);
      }
    }

    /** @type {!Map.<string, shaka.text.Cue>} */
    const styles = new Map();
    VttTextParser.addDefaultTextColor_(styles);

    // Parse cues.
    const ret = [];
    for (const block of blocks.slice(1)) {
      const lines = block.split('\n');
      VttTextParser.parseStyle_(lines, styles);
      const cue = VttTextParser.parseCue_(lines, offset, regions, styles);
      if (cue) {
        ret.push(cue);
      }
    }

    return ret;
  }

  /**
   * Add deafult color
   *
   * @param {!Map.<string, shaka.text.Cue>} styles
   * @private
   */
  static addDefaultTextColor_(styles) {
    const textColor = shaka.text.Cue.defaultTextColor;
    for (const [key, value] of Object.entries(textColor)) {
      const cue = new shaka.text.Cue(0, 0, '');
      cue.color = value;
      styles.set(key, cue);
    }

    const bgColor = shaka.text.Cue.defaultTextBackgroundColor;
    for (const [key, value] of Object.entries(bgColor)) {
      const cue = new shaka.text.Cue(0, 0, '');
      cue.backgroundColor = value;
      styles.set(key, cue);
    }
  }

  /**
   * Parses a string into a Region object.
   *
   * @param {string} text
   * @return {!shaka.extern.CueRegion}
   * @private
   */
  static parseRegion_(text) {
    const VttTextParser = shaka.text.VttTextParser;
    const parser = new shaka.util.TextParser(text);
    // The region string looks like this:
    // Region: id=fred width=50% lines=3 regionanchor=0%,100%
    //         viewportanchor=10%,90% scroll=up
    const region = new shaka.text.CueRegion();

    // Skip 'Region:'
    parser.readWord();
    parser.skipWhitespace();

    let word = parser.readWord();
    while (word) {
      if (!VttTextParser.parseRegionSetting_(region, word)) {
        shaka.log.warning(
            'VTT parser encountered an invalid VTTRegion setting: ', word,
            ' The setting will be ignored.');
      }
      parser.skipWhitespace();
      word = parser.readWord();
    }

    return region;
  }

  /**
   * Parses a style block into a Cue object.
   *
   * @param {!Array.<string>} text
   * @param {!Map.<string, shaka.text.Cue>} styles
   * @private
   */
  static parseStyle_(text, styles) {
    // Skip empty blocks.
    if (text.length == 1 && !text[0]) {
      return;
    }

    // Skip comment blocks.
    if (/^NOTE($|[ \t])/.test(text[0])) {
      return;
    }

    // Only style block are allowed.
    if (text[0] != 'STYLE') {
      return;
    }

    if (!text[1].includes('::cue')) {
      return;
    }
    let styleSelector = 'global';
    // Look for what is within parentisesis. For example:
    // <code>:: cue (b) {</code>, what we are looking for is <code>b</code>
    const selector = text[1].match(/\((.*)\)/);
    if (selector) {
      styleSelector = selector.pop();
    }

    // We start at 2 to avoid '::cue' and end earlier to avoid '}'
    let propertyLines = text.slice(2, -1);
    if (text[1].includes('}')) {
      const payload = /\{(.*?)\}/.exec(text[1]);
      if (payload) {
        propertyLines = payload[1].split(';');
      }
    }

    const cue = new shaka.text.Cue(0, 0, '');
    let validStyle = false;
    for (let i = 0; i < propertyLines.length; i++) {
      // We look for CSS properties. As a general rule they are separated by
      // <code>:</code>. Eg: <code>color: red;</code>
      const lineParts = /^\s*([^:]+):\s*(.*)/.exec(propertyLines[i]);
      if (lineParts) {
        const name = lineParts[1].trim();
        const value = lineParts[2].trim().replace(';', '');
        switch (name) {
          case 'background-color':
            validStyle = true;
            cue.backgroundColor = value;
            break;
          case 'color':
            validStyle = true;
            cue.color = value;
            break;
          case 'font-family':
            validStyle = true;
            cue.fontFamily = value;
            break;
          case 'font-size':
            validStyle = true;
            cue.fontSize = value;
            break;
          case 'font-weight':
            if (parseInt(value, 10) >= 700) {
              validStyle = true;
              cue.fontWeight = shaka.text.Cue.fontWeight.BOLD;
            }
            break;
          case 'font-style':
            switch (value) {
              case 'normal':
                validStyle = true;
                cue.fontStyle = shaka.text.Cue.fontStyle.NORMAL;
                break;
              case 'italic':
                validStyle = true;
                cue.fontStyle = shaka.text.Cue.fontStyle.ITALIC;
                break;
              case 'oblique':
                validStyle = true;
                cue.fontStyle = shaka.text.Cue.fontStyle.OBLIQUE;
                break;
            }
            break;
          case 'opacity':
            validStyle = true;
            cue.opacity = parseFloat(value);
            break;
          case 'white-space':
            validStyle = true;
            cue.wrapLine = value != 'noWrap';
            break;
          default:
            shaka.log.warning('VTT parser encountered an unsupported style: ',
                lineParts);
            break;
        }
      }
    }

    if (validStyle) {
      styles.set(styleSelector, cue);
    }
  }

  /**
   * Parses a text block into a Cue object.
   *
   * @param {!Array.<string>} text
   * @param {number} timeOffset
   * @param {!Array.<!shaka.extern.CueRegion>} regions
   * @param {!Map.<string, shaka.text.Cue>} styles
   * @return {shaka.text.Cue}
   * @private
   */
  static parseCue_(text, timeOffset, regions, styles) {
    const VttTextParser = shaka.text.VttTextParser;

    // Skip empty blocks.
    if (text.length == 1 && !text[0]) {
      return null;
    }

    // Skip comment blocks.
    if (/^NOTE($|[ \t])/.test(text[0])) {
      return null;
    }

    // Skip style blocks.
    if (text[0] == 'STYLE') {
      return null;
    }

    let id = null;
    if (!text[0].includes('-->')) {
      id = text[0];
      text.splice(0, 1);
    }

    // Parse the times.
    const parser = new shaka.util.TextParser(text[0]);
    let start = VttTextParser.parseTime_(parser);
    const expect = parser.readRegex(/[ \t]+-->[ \t]+/g);
    let end = VttTextParser.parseTime_(parser);

    if (start == null || expect == null || end == null) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_TEXT_CUE,
          'Could not parse cue time range in WebVTT');
    }

    start += timeOffset;
    end += timeOffset;

    // Get the payload.
    const payload = text.slice(1).join('\n').trim();

    let cue = null;
    if (styles.has('global')) {
      cue = styles.get('global').clone();
      cue.startTime = start;
      cue.endTime = end;
      cue.payload = '';
    } else {
      cue = new shaka.text.Cue(start, end, '');
    }

    VttTextParser.parseCueStyles(payload, cue, styles);

    // Parse optional settings.
    parser.skipWhitespace();
    let word = parser.readWord();
    while (word) {
      if (!VttTextParser.parseCueSetting(cue, word, regions)) {
        shaka.log.warning('VTT parser encountered an invalid VTT setting: ',
            word,
            ' The setting will be ignored.');
      }
      parser.skipWhitespace();
      word = parser.readWord();
    }

    if (id != null) {
      cue.id = id;
    }
    return cue;
  }

  /**
   * Parses a WebVTT styles from the given payload.
   *
   * @param {string} payload
   * @param {!shaka.text.Cue} rootCue
   * @param {!Map.<string, shaka.text.Cue>} styles
   */
  static parseCueStyles(payload, rootCue, styles) {
    const VttTextParser = shaka.text.VttTextParser;
    if (styles.size === 0) {
      VttTextParser.addDefaultTextColor_(styles);
    }
    payload = VttTextParser.replaceColorPayload_(payload);
    const xmlPayload = '<span>' + payload + '</span>';
    const element = shaka.util.XmlUtils.parseXmlString(xmlPayload, 'span');
    if (element) {
      /** @type {!Array.<!shaka.extern.Cue>} */
      const cues = [];
      const childNodes = element.childNodes;
      if (childNodes.length == 1) {
        const childNode = childNodes[0];
        if (childNode.nodeType == Node.TEXT_NODE ||
            childNode.nodeType == Node.CDATA_SECTION_NODE) {
          rootCue.payload = payload;
          return;
        }
      }
      for (const childNode of childNodes) {
        VttTextParser.generateCueFromElement_(
            childNode, rootCue, cues, styles);
      }
      rootCue.nestedCues = cues;
    } else {
      shaka.log.warning('The cue\'s markup could not be parsed: ', payload);
      rootCue.payload = payload;
    }
  }

  /**
   * Converts color end tag to be valid for xml parsing
   * For example,
   * input: <c.yellow.bg_blue>Yellow text on blue bg</c>
   * output: <c.yellow.bg_blue>Yellow text on blue bg</c.yellow.bg_blue>
   *
   * Returns original payload if invalid tag is found.
   * Invalid tag example: <c.yellow><b>Example</c></b>
   *
   * @param {string} payload
   * @return {string} processed payload
   * @private
   */
  static replaceColorPayload_(payload) {
    const names = [];
    let nameStart = -1;
    let newPayload = '';
    for (let i = 0; i < payload.length; i++) {
      if (payload[i] === '/') {
        const end = payload.indexOf('>', i);
        if (end <= i) {
          return payload;
        }
        const tagEnd = payload.substring(i + 1, end);
        const tagStart = names.pop();
        if (tagStart === tagEnd) {
          newPayload += '/' + tagEnd + '>';
          i += tagEnd.length + 1;
        } else {
          if (!tagStart.startsWith('c.') || tagEnd !== 'c') {
            return payload;
          }
          newPayload += '/' + tagStart + '>';
          i += tagEnd.length + 1;
        }
      } else {
        if (payload[i] === '<') {
          nameStart = i + 1;
        } else if (payload[i] === '>') {
          if (nameStart > 0) {
            names.push(payload.substr(nameStart, i - nameStart));
            nameStart = -1;
          }
        }
        newPayload += payload[i];
      }
    }
    return newPayload;
  }

  /**
   * @param {string} value
   * @param {string} defaultValue
   * @private
   */
  static getOrDefault_(value, defaultValue) {
    if (value && value.length > 0) {
      return value;
    }
    return defaultValue;
  }

  /**
   * Merges values created in parseStyle_
   * @param {!shaka.extern.Cue} cue
   * @param {shaka.extern.Cue} refCue
   * @private
   */
  static mergeStyle_(cue, refCue) {
    if (!refCue) {
      return;
    }

    const VttTextParser = shaka.text.VttTextParser;
    // Overwrites if new value string length > 0
    cue.backgroundColor = VttTextParser.getOrDefault_(
        refCue.backgroundColor, cue.backgroundColor);
    cue.color = VttTextParser.getOrDefault_(
        refCue.color, cue.color);
    cue.fontFamily = VttTextParser.getOrDefault_(
        refCue.fontFamily, cue.fontFamily);
    cue.fontSize = VttTextParser.getOrDefault_(
        refCue.fontSize, cue.fontSize);

    // Overwrite with new values as unable to determine
    // if new value is set or not
    cue.fontWeight = refCue.fontWeight;
    cue.fontStyle = refCue.fontStyle;
    cue.opacity = refCue.opacity;
    cue.wrapLine = refCue.wrapLine;
  }

  /**
   * @param {!Node} element
   * @param {!shaka.text.Cue} rootCue
   * @param {Array.<!shaka.extern.Cue>} cues
   * @param {!Map.<string, shaka.text.Cue>} styles
   * @private
   */
  static generateCueFromElement_(element, rootCue, cues, styles) {
    const VttTextParser = shaka.text.VttTextParser;
    const nestedCue = rootCue.clone();
    if (element.nodeType === Node.ELEMENT_NODE && element.nodeName) {
      const bold = shaka.text.Cue.fontWeight.BOLD;
      const italic = shaka.text.Cue.fontStyle.ITALIC;
      const underline = shaka.text.Cue.textDecoration.UNDERLINE;
      const tags = element.nodeName.split(/[ .]+/);
      for (const tag of tags) {
        if (styles.has(tag)) {
          VttTextParser.mergeStyle_(nestedCue, styles.get(tag));
        }
        switch (tag) {
          case 'b':
            nestedCue.fontWeight = bold;
            break;
          case 'i':
            nestedCue.fontStyle = italic;
            break;
          case 'u':
            nestedCue.textDecoration.push(underline);
            break;
          default:
            break;
        }
      }
    }
    const isTextNode = shaka.util.XmlUtils.isText(element);
    if (isTextNode) {
      // Trailing line breaks may lost when convert cue to HTML tag
      // Need to insert line break cue to preserve line breaks
      const textArr = element.textContent.split('\n');
      let isFirst = true;
      for (const text of textArr) {
        if (!isFirst) {
          const lineBreakCue = rootCue.clone();
          lineBreakCue.lineBreak = true;
          cues.push(lineBreakCue);
        }
        if (text.length > 0) {
          const textCue = nestedCue.clone();
          textCue.payload = text;
          cues.push(textCue);
        }
        isFirst = false;
      }
    } else {
      for (const childNode of element.childNodes) {
        VttTextParser.generateCueFromElement_(
            childNode, nestedCue, cues, styles);
      }
    }
  }

  /**
   * Parses a WebVTT setting from the given word.
   *
   * @param {!shaka.text.Cue} cue
   * @param {string} word
   * @param {!Array.<!shaka.text.CueRegion>} regions
   * @return {boolean} True on success.
   */
  static parseCueSetting(cue, word, regions) {
    const VttTextParser = shaka.text.VttTextParser;
    let results = null;
    if ((results = /^align:(start|middle|center|end|left|right)$/.exec(word))) {
      VttTextParser.setTextAlign_(cue, results[1]);
    } else if ((results = /^vertical:(lr|rl)$/.exec(word))) {
      VttTextParser.setVerticalWritingMode_(cue, results[1]);
    } else if ((results = /^size:([\d.]+)%$/.exec(word))) {
      cue.size = Number(results[1]);
    } else if ((results =
        /^position:([\d.]+)%(?:,(line-left|line-right|center|start|end))?$/
            .exec(word))) {
      cue.position = Number(results[1]);
      if (results[2]) {
        VttTextParser.setPositionAlign_(cue, results[2]);
      }
    } else if ((results = /^region:(.*)$/.exec(word))) {
      const region = VttTextParser.getRegionById_(regions, results[1]);
      if (region) {
        cue.region = region;
      }
    } else {
      return VttTextParser.parsedLineValueAndInterpretation_(cue, word);
    }

    return true;
  }

  /**
   *
   * @param {!Array.<!shaka.text.CueRegion>} regions
   * @param {string} id
   * @return {?shaka.text.CueRegion}
   * @private
   */
  static getRegionById_(regions, id) {
    const regionsWithId = regions.filter((region) => {
      return region.id == id;
    });
    if (!regionsWithId.length) {
      shaka.log.warning('VTT parser could not find a region with id: ',
          id,
          ' The region will be ignored.');
      return null;
    }
    goog.asserts.assert(regionsWithId.length == 1,
        'VTTRegion ids should be unique!');

    return regionsWithId[0];
  }

  /**
   * Parses a WebVTTRegion setting from the given word.
   *
   * @param {!shaka.text.CueRegion} region
   * @param {string} word
   * @return {boolean} True on success.
   * @private
   */
  static parseRegionSetting_(region, word) {
    let results = null;
    if ((results = /^id=(.*)$/.exec(word))) {
      region.id = results[1];
    } else if ((results = /^width=(\d{1,2}|100)%$/.exec(word))) {
      region.width = Number(results[1]);
    } else if ((results = /^lines=(\d+)$/.exec(word))) {
      region.height = Number(results[1]);
      region.heightUnits = shaka.text.CueRegion.units.LINES;
    } else if ((results = /^regionanchor=(\d{1,2}|100)%,(\d{1,2}|100)%$/
        .exec(word))) {
      region.regionAnchorX = Number(results[1]);
      region.regionAnchorY = Number(results[2]);
    } else if ((results = /^viewportanchor=(\d{1,2}|100)%,(\d{1,2}|100)%$/
        .exec(word))) {
      region.viewportAnchorX = Number(results[1]);
      region.viewportAnchorY = Number(results[2]);
    } else if ((results = /^scroll=up$/.exec(word))) {
      region.scroll = shaka.text.CueRegion.scrollMode.UP;
    } else {
      return false;
    }

    return true;
  }

  /**
   * @param {!shaka.text.Cue} cue
   * @param {string} align
   * @private
   */
  static setTextAlign_(cue, align) {
    const Cue = shaka.text.Cue;
    if (align == 'middle') {
      cue.textAlign = Cue.textAlign.CENTER;
    } else {
      goog.asserts.assert(align.toUpperCase() in Cue.textAlign,
          align.toUpperCase() +
                          ' Should be in Cue.textAlign values!');

      cue.textAlign = Cue.textAlign[align.toUpperCase()];
    }
  }

  /**
   * @param {!shaka.text.Cue} cue
   * @param {string} align
   * @private
   */
  static setPositionAlign_(cue, align) {
    const Cue = shaka.text.Cue;
    if (align == 'line-left' || align == 'start') {
      cue.positionAlign = Cue.positionAlign.LEFT;
    } else if (align == 'line-right' || align == 'end') {
      cue.positionAlign = Cue.positionAlign.RIGHT;
    } else {
      cue.positionAlign = Cue.positionAlign.CENTER;
    }
  }

  /**
   * @param {!shaka.text.Cue} cue
   * @param {string} value
   * @private
   */
  static setVerticalWritingMode_(cue, value) {
    const Cue = shaka.text.Cue;
    if (value == 'lr') {
      cue.writingMode = Cue.writingMode.VERTICAL_LEFT_TO_RIGHT;
    } else {
      cue.writingMode = Cue.writingMode.VERTICAL_RIGHT_TO_LEFT;
    }
  }

  /**
   * @param {!shaka.text.Cue} cue
   * @param {string} word
   * @return {boolean}
   * @private
   */
  static parsedLineValueAndInterpretation_(cue, word) {
    const Cue = shaka.text.Cue;
    let results = null;
    if ((results = /^line:([\d.]+)%(?:,(start|end|center))?$/.exec(word))) {
      cue.lineInterpretation = Cue.lineInterpretation.PERCENTAGE;
      cue.line = Number(results[1]);
      if (results[2]) {
        goog.asserts.assert(
            results[2].toUpperCase() in Cue.lineAlign,
            results[2].toUpperCase() + ' Should be in Cue.lineAlign values!');
        cue.lineAlign = Cue.lineAlign[results[2].toUpperCase()];
      }
    } else if ((results =
                    /^line:(-?\d+)(?:,(start|end|center))?$/.exec(word))) {
      cue.lineInterpretation = Cue.lineInterpretation.LINE_NUMBER;
      cue.line = Number(results[1]);
      if (results[2]) {
        goog.asserts.assert(
            results[2].toUpperCase() in Cue.lineAlign,
            results[2].toUpperCase() + ' Should be in Cue.lineAlign values!');
        cue.lineAlign = Cue.lineAlign[results[2].toUpperCase()];
      }
    } else {
      return false;
    }

    return true;
  }

  /**
   * Parses a WebVTT time from the given parser.
   *
   * @param {!shaka.util.TextParser} parser
   * @return {?number}
   * @private
   */
  static parseTime_(parser) {
    // 00:00.000 or 00:00:00.000 or 0:00:00.000 or
    // 00:00.00 or 00:00:00.00 or 0:00:00.00
    const regexExpresion = /(?:(\d{1,}):)?(\d{2}):(\d{2})\.(\d{2,3})/g;
    const results = parser.readRegex(regexExpresion);
    if (results == null) {
      return null;
    }
    // This capture is optional, but will still be in the array as undefined,
    // in which case it is 0.
    const hours = Number(results[1]) || 0;
    const minutes = Number(results[2]);
    const seconds = Number(results[3]);
    const milliseconds = Number(results[4]);
    if (minutes > 59 || seconds > 59) {
      return null;
    }

    return (milliseconds / 1000) + seconds + (minutes * 60) + (hours * 3600);
  }
};

/**
 * @const {number}
 * @private
 */
shaka.text.VttTextParser.MPEG_TIMESCALE_ = 90000;

/**
 * At this value, timestamps roll over in TS content.
 * @const {number}
 * @private
 */
shaka.text.VttTextParser.TS_ROLLOVER_ = 0x200000000;

shaka.text.TextEngine.registerParser(
    'text/vtt', () => new shaka.text.VttTextParser());

shaka.text.TextEngine.registerParser(
    'text/vtt; codecs="vtt"', () => new shaka.text.VttTextParser());

shaka.text.TextEngine.registerParser(
    'text/vtt; codecs="wvtt"', () => new shaka.text.VttTextParser());
