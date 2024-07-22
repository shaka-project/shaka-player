/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.text.Utils');

goog.require('shaka.log');
goog.require('shaka.text.Cue');
goog.require('shaka.text.CueRegion');


shaka.text.Utils = class {
  /**
   * Flatten nested cue payloads recursively.  If a cue has nested cues,
   * their contents should be combined and replace the payload of the parent.
   *
   * @param {!shaka.text.Cue} cue
   * @param {?shaka.text.Cue=} parentCue
   * @return {string}
   * @private
   */
  static flattenPayload_(cue, parentCue) {
    if (cue.lineBreak) {
      // This is a vertical lineBreak, so insert a newline.
      return '\n';
    }
    if (cue.nestedCues.length) {
      return cue.nestedCues.map((nested) => {
        return shaka.text.Utils.flattenPayload_(nested, cue);
      }).join('');
    }

    // Handle bold, italics and underline
    const openStyleTags = [];
    const bold = cue.fontWeight >= shaka.text.Cue.fontWeight.BOLD;
    const italics = cue.fontStyle == shaka.text.Cue.fontStyle.ITALIC;
    const underline = cue.textDecoration.includes(
        shaka.text.Cue.textDecoration.UNDERLINE);
    if (bold) {
      openStyleTags.push(['b']);
    }
    if (italics) {
      openStyleTags.push(['i']);
    }
    if (underline) {
      openStyleTags.push(['u']);
    }
    // Handle color classes, if the value consists of letters
    let color = cue.color;
    if (color == '' && parentCue) {
      color = parentCue.color;
    }
    let classes = '';
    const colorName = shaka.text.Utils.getColorName_(color);
    if (colorName) {
      classes += `.${colorName}`;
    }
    let bgColor = cue.backgroundColor;
    if (bgColor == '' && parentCue) {
      bgColor = parentCue.backgroundColor;
    }
    const bgColorName = shaka.text.Utils.getColorName_(bgColor);
    if (bgColorName) {
      classes += `.bg_${bgColorName}`;
    }
    if (classes) {
      openStyleTags.push(['c', classes]);
    }

    return openStyleTags.reduceRight((acc, [tag, classes = '']) => {
      return `<${tag}${classes}>${acc}</${tag}>`;
    }, cue.payload);
  }

  /**
   * Gets the color name from a color string.
   *
   * @param {string} string
   * @return {?string}
   * @private
   */
  static getColorName_(string) {
    let colorString = string.toLowerCase();
    const rgb = colorString.replace(/\s/g, '')
        .match(/^rgba?\((\d+),(\d+),(\d+),?([^,\s)]+)?/i);
    if (rgb) {
      colorString = '#' +
          (parseInt(rgb[1], 10) | (1 << 8)).toString(16).slice(1) +
          (parseInt(rgb[2], 10) | (1 << 8)).toString(16).slice(1) +
          (parseInt(rgb[3], 10) | (1 << 8)).toString(16).slice(1);
    } else if (colorString.startsWith('#') && colorString.length > 7) {
      // With this we lose the alpha of the color, but it is better than having
      // no color.
      colorString = colorString.slice(0, 7);
    }
    switch (colorString) {
      case 'white':
      case '#fff':
      case '#ffffff':
        return 'white';
      case 'lime':
      case '#0f0':
      case '#00ff00':
        return 'lime';
      case 'cyan':
      case '#0ff':
      case '#00ffff':
        return 'cyan';
      case 'red':
      case '#f00':
      case '#ff0000':
        return 'red';
      case 'yellow':
      case '#ff0':
      case '#ffff00':
        return 'yellow';
      case 'magenta':
      case '#f0f':
      case '#ff00ff':
        return 'magenta';
      case 'blue':
      case '#00f':
      case '#0000ff':
        return 'blue';
      case 'black':
      case '#000':
      case '#000000':
        return 'black';
    }
    // No color name
    return null;
  }

  /**
   * We don't want to modify the array or objects passed in, since we don't
   * technically own them.  So we build a new array and replace certain items
   * in it if they need to be flattened.
   * We also don't want to flatten the text payloads starting at a container
   * element; otherwise, for containers encapsulating multiple caption lines,
   * the lines would merge into a single cue. This is undesirable when a
   * subset of the captions are outside of the append time window. To fix
   * this, we only call flattenPayload() starting at elements marked as
   * isContainer = false.
   *
   * @param {!Array.<!shaka.text.Cue>} cues
   * @param {?shaka.text.Cue=} parentCue
   * @return {!Array.<!shaka.text.Cue>}
   */
  static getCuesToFlatten(cues, parentCue) {
    const result = [];
    for (const cue of shaka.text.Utils.removeDuplicates(cues)) {
      if (cue.isContainer) {
        // Recurse to find the actual text payload cues.
        result.push(...shaka.text.Utils.getCuesToFlatten(cue.nestedCues, cue));
      } else {
        // Flatten the payload.
        const flatCue = cue.clone();
        flatCue.nestedCues = [];
        flatCue.payload = shaka.text.Utils.flattenPayload_(cue, parentCue);
        result.push(flatCue);
      }
    }
    return result;
  }

  /**
   * @param {!Array.<!shaka.text.Cue>} cues
   * @return {!Array.<!shaka.text.Cue>}
   */
  static removeDuplicates(cues) {
    const uniqueCues = [];
    for (const cue of cues) {
      const isValid = !uniqueCues.some(
          (existingCue) => shaka.text.Cue.equal(cue, existingCue));
      if (isValid) {
        uniqueCues.push(cue);
      }
    }
    return uniqueCues;
  }

  /**
   * @param {!shaka.text.Cue} shakaCue
   * @return {TextTrackCue}
   */
  static mapShakaCueToNativeCue(shakaCue) {
    if (shakaCue.startTime >= shakaCue.endTime) {
      // Edge will throw in this case.
      // See issue #501
      shaka.log.warning('Invalid cue times: ' + shakaCue.startTime +
                        ' - ' + shakaCue.endTime);
      return null;
    }

    const Cue = shaka.text.Cue;
    /** @type {VTTCue} */
    const vttCue = new VTTCue(
        shakaCue.startTime,
        shakaCue.endTime,
        shakaCue.payload);

    const hash = (text) => {
      let hash = 5381;
      let i = text.length;
      while (i) {
        hash = (hash * 33) ^ text.charCodeAt(--i);
      }
      return (hash >>> 0).toString();
    };

    vttCue.id = hash(shakaCue.startTime.toString()) +
        hash(shakaCue.endTime.toString()) +
        hash(shakaCue.payload);

    // NOTE: positionAlign and lineAlign settings are not supported by Chrome
    // at the moment, so setting them will have no effect.
    // The bug on chromium to implement them:
    // https://bugs.chromium.org/p/chromium/issues/detail?id=633690

    vttCue.lineAlign = shakaCue.lineAlign;
    vttCue.positionAlign = shakaCue.positionAlign;
    if (shakaCue.size) {
      vttCue.size = shakaCue.size;
    }

    try {
      // Safari 10 seems to throw on align='center'.
      vttCue.align = shakaCue.textAlign;
    } catch (exception) {}

    if (shakaCue.textAlign == 'center' && vttCue.align != 'center') {
      // We want vttCue.position = 'auto'. By default, |position| is set to
      // "auto". If we set it to "auto" safari will throw an exception, so we
      // must rely on the default value.
      vttCue.align = 'middle';
    }

    if (shakaCue.writingMode ==
            Cue.writingMode.VERTICAL_LEFT_TO_RIGHT) {
      vttCue.vertical = 'lr';
    } else if (shakaCue.writingMode ==
             Cue.writingMode.VERTICAL_RIGHT_TO_LEFT) {
      vttCue.vertical = 'rl';
    }

    // snapToLines flag is true by default
    if (shakaCue.lineInterpretation == Cue.lineInterpretation.PERCENTAGE) {
      vttCue.snapToLines = false;
    }

    if (shakaCue.line != null) {
      vttCue.line = shakaCue.line;
    }

    if (shakaCue.position != null) {
      vttCue.position = shakaCue.position;
    }

    return vttCue;
  }

  /**
   * @param {!VTTCue} vttCue
   * @return {?shaka.text.Cue}
   */
  static mapNativeCueToShakaCue(vttCue) {
    if (vttCue.endTime === Infinity || vttCue.endTime < vttCue.startTime) {
      return null;
    }
    const cue = new shaka.text.Cue(vttCue.startTime, vttCue.endTime,
        vttCue.text);
    cue.line = typeof vttCue.line === 'number' ? vttCue.line : null;
    cue.lineAlign = /** @type {shaka.text.Cue.lineAlign} */ (vttCue.lineAlign);
    cue.lineInterpretation = vttCue.snapToLines ?
      shaka.text.Cue.lineInterpretation.LINE_NUMBER :
      shaka.text.Cue.lineInterpretation.PERCENTAGE;
    cue.position = typeof vttCue.position === 'number' ?
      vttCue.position : null;
    cue.positionAlign = /** @type {shaka.text.Cue.positionAlign} */
      (vttCue.positionAlign);
    cue.size = vttCue.size;
    cue.textAlign = /** @type {shaka.text.Cue.textAlign} */ (vttCue.align);
    if (vttCue.vertical === 'lr') {
      cue.writingMode = shaka.text.Cue.writingMode.VERTICAL_LEFT_TO_RIGHT;
    } else if (vttCue.vertical === 'rl') {
      cue.writingMode = shaka.text.Cue.writingMode.VERTICAL_RIGHT_TO_LEFT;
    }
    if (vttCue.region) {
      cue.region.id = vttCue.region.id;
      cue.region.height = vttCue.region.lines;
      cue.region.heightUnits = shaka.text.CueRegion.units.LINES;
      cue.region.regionAnchorX = vttCue.region.regionAnchorX;
      cue.region.regionAnchorY = vttCue.region.regionAnchorY;
      cue.region.scroll = /** @type {shaka.text.CueRegion.scrollMode} */
        (vttCue.region.scroll);
      cue.region.viewportAnchorX = vttCue.region.viewportAnchorX;
      cue.region.viewportAnchorY = vttCue.region.viewportAnchorY;
      cue.region.viewportAnchorUnits = shaka.text.CueRegion.units.PERCENTAGE;
      cue.region.width = vttCue.region.width;
      cue.region.widthUnits = shaka.text.CueRegion.units.PERCENTAGE;
    }
    shaka.text.Cue.parseCuePayload(cue);

    return cue;
  }
};
