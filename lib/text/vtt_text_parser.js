/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.text.VttTextParser');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.text.Cue');
goog.require('shaka.text.CueRegion');
goog.require('shaka.text.TextEngine');
goog.require('shaka.util.Error');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.TextParser');


/**
 * @implements {shaka.extern.TextParser}
 * @export
 */
shaka.text.VttTextParser = class {
  /** Constructs a VTT parser. */
  constructor() {
    /** @private {boolean} */
    this.sequenceMode_ = false;

    /** @private {string} */
    this.manifestType_ = shaka.media.ManifestParser.UNKNOWN;
  }

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
  setSequenceMode(sequenceMode) {
    this.sequenceMode_ = sequenceMode;
  }

  /**
   * @override
   * @export
   */
  setManifestType(manifestType) {
    this.manifestType_ = manifestType;
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

    // Depending on "segmentRelativeVttTiming" configuration,
    // "vttOffset" will correspond to either "periodStart" (default)
    // or "segmentStart", for segmented VTT where timings are relative
    // to the beginning of each segment.
    // NOTE: "periodStart" is the timestamp offset applied via TextEngine.
    // It is no longer closely tied to periods, but the name stuck around.
    // NOTE: This offset and the flag choosing its meaning have no effect on
    // HLS content, which should use X-TIMESTAMP-MAP and periodStart instead.
    let offset = time.vttOffset;

    if (this.manifestType_ == shaka.media.ManifestParser.HLS) {
      // Only use 'X-TIMESTAMP-MAP' with HLS.
      if (blocks[0].includes('X-TIMESTAMP-MAP')) {
        offset = this.computeHlsOffset_(blocks[0], time);
      } else if (time.periodStart && time.vttOffset == time.periodStart) {
        // In the case where X-TIMESTAMP-MAP is not used and it is HLS, we
        // should not use offset unless segment-relative times are used.
        offset = 0;
      }
    }

    // Parse VTT regions.
    /* !Array<!shaka.text.CueRegion> */
    const regions = [];
    for (const line of blocks[0].split('\n')) {
      if (/^Region:/.test(line)) {
        const region = VttTextParser.parseRegion_(line);
        regions.push(region);
      }
    }

    /** @type {!Map<string, !shaka.text.Cue>} */
    const styles = new Map();
    shaka.text.Cue.addDefaultTextColor(styles);

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
   * @param {string} headerBlock Contains X-TIMESTAMP-MAP.
   * @param {shaka.extern.TextParser.TimeContext} time
   * @return {number}
   * @private
   */
  computeHlsOffset_(headerBlock, time) {
    // https://bit.ly/2K92l7y
    // The 'X-TIMESTAMP-MAP' header is used in HLS to align text with
    // the rest of the media.
    // The header format is 'X-TIMESTAMP-MAP=MPEGTS:n,LOCAL:m'
    // (the attributes can go in any order)
    // where n is MPEG-2 time and m is cue time it maps to.
    // For example 'X-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:900000'
    // means an offset of 10 seconds
    // 900000/MPEG_TIMESCALE - cue time.
    const cueTimeMatch = headerBlock.match(
        /LOCAL:((?:(\d{1,}):)?(\d{2}):(\d{2})\.(\d{3}))/m);
    const mpegTimeMatch = headerBlock.match(/MPEGTS:(\d+)/m);

    if (!cueTimeMatch || !mpegTimeMatch) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_TEXT_HEADER);
    }

    const cueTime = shaka.util.TextParser.parseTime(cueTimeMatch[1]);
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
    let segmentStart = time.segmentStart - time.periodStart;
    while (segmentStart >= rolloverSeconds) {
      segmentStart -= rolloverSeconds;
      mpegTime += shaka.text.VttTextParser.TS_ROLLOVER_;
    }

    return time.periodStart + mpegTime / mpegTimescale - cueTime;
  }

  /**
   * Parses a string into a Region object.
   *
   * @param {string} text
   * @return {!shaka.text.CueRegion}
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
   * @param {!Array<string>} text
   * @param {!Map<string, !shaka.text.Cue>} styles
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

    /** @type {!Array<!Array<string>>} */
    const styleBlocks = [];
    let lastBlockIndex = -1;
    for (let i = 1; i < text.length; i++) {
      if (text[i].includes('::cue')) {
        styleBlocks.push([]);
        lastBlockIndex = styleBlocks.length - 1;
      }
      if (lastBlockIndex == -1) {
        continue;
      }
      styleBlocks[lastBlockIndex].push(text[i]);
      if (text[i].includes('}')) {
        lastBlockIndex = -1;
      }
    }

    for (const styleBlock of styleBlocks) {
      let styleSelector = 'global';
      // Look for what is within parentheses. For example:
      // <code>:: cue (b) {</code>, what we are looking for is <code>b</code>
      const selector = styleBlock[0].match(/\((.*)\)/);
      if (selector) {
        styleSelector = selector.pop();
      }

      // We start at 1 to avoid '::cue' and end earlier to avoid '}'
      let propertyLines = styleBlock.slice(1, -1);
      if (styleBlock[0].includes('}')) {
        const payload = /\{(.*?)\}/.exec(styleBlock[0]);
        if (payload) {
          propertyLines = payload[1].split(';');
        }
      }

      // Continue styles over multiple selectors if necessary.
      // For example,
      //   ::cue(b) { background: white; } ::cue(b) { color: blue; }
      // should set both the background and foreground of bold tags.
      let cue = styles.get(styleSelector);
      if (!cue) {
        cue = new shaka.text.Cue(0, 0, '');
      }

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
            case 'background':
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
              if (parseInt(value, 10) >= 700 || value == 'bold') {
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
            case 'text-combine-upright':
              validStyle = true;
              cue.textCombineUpright = value;
              break;
            case 'text-shadow':
              validStyle = true;
              cue.textShadow = value;
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
  }

  /**
   * Parses a text block into a Cue object.
   *
   * @param {!Array<string>} text
   * @param {number} timeOffset
   * @param {!Array<!shaka.text.CueRegion>} regions
   * @param {!Map<string, !shaka.text.Cue>} styles
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

    // Skip style and region blocks.
    if (text[0] == 'STYLE' || text[0] == 'REGION') {
      return null;
    }

    let id = null;
    if (!text[0].includes('-->')) {
      id = text[0];
      text.splice(0, 1);
    }

    // Parse the times.
    const parser = new shaka.util.TextParser(text[0]);
    let start = parser.parseTime();
    const expect = parser.readRegex(/[ \t]+-->[ \t]+/g);
    let end = parser.parseTime();

    if (start == null || expect == null || end == null) {
      shaka.log.alwaysWarn(
          'Failed to parse VTT time code. Cue skipped:', id, text);
      return null;
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
      cue.payload = payload;
    } else {
      cue = new shaka.text.Cue(start, end, payload);
    }

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

    shaka.text.Cue.parseCuePayload(cue, styles);

    if (id != null) {
      cue.id = id;
    }
    return cue;
  }

  /**
   * Parses a WebVTT setting from the given word.
   *
   * @param {!shaka.text.Cue} cue
   * @param {string} word
   * @param {!Array<!shaka.text.CueRegion>} regions
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
        // eslint-disable-next-line @stylistic/max-len
        /^position:([\d.]+)%(?:,(line-left|line-right|middle|center|start|end|auto))?$/
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
   * @param {!Array<!shaka.text.CueRegion>} regions
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
    } else if (align == 'center' || align == 'middle') {
      cue.positionAlign = Cue.positionAlign.CENTER;
    } else {
      cue.positionAlign = Cue.positionAlign.AUTO;
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
