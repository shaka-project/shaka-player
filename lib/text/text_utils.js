/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.text.Utils');

goog.require('goog.asserts');
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

    if (!cue.payload) {
      return cue.payload;
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
    const colorName = shaka.text.Utils.getColorName(color);
    if (colorName) {
      classes += `.${colorName}`;
    }
    let bgColor = cue.backgroundColor;
    if (bgColor == '' && parentCue) {
      bgColor = parentCue.backgroundColor;
    }
    const bgColorName = shaka.text.Utils.getColorName(bgColor);
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
   */
  static getColorName(string) {
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
   * Parses a CSS color into its red, green, blue and alpha components.
   * Supports hexadecimal colors, rgb() and rgba() colors, and the basic named
   * colors used by subtitle formats.
   *
   * @param {string} color
   * @return {?Array<number>} The [red, green, blue, alpha] components, with
   *   red, green and blue between 0 and 255 and alpha between 0 and 1, or
   *   null if the color can't be parsed.
   */
  static parseColor(color) {
    let colorString = color.trim().toLowerCase();
    if (shaka.text.Utils.NAMED_COLORS_.has(colorString)) {
      colorString = shaka.text.Utils.NAMED_COLORS_.get(colorString);
    }

    const hex = colorString.match(/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/);
    if (hex) {
      let digits = hex[1];
      if (digits.length <= 4) {
        digits = digits.split('').map((digit) => digit + digit).join('');
      }
      const components = [];
      for (let i = 0; i < digits.length; i += 2) {
        components.push(parseInt(digits.slice(i, i + 2), 16));
      }
      if (components.length == 3) {
        components.push(1);
      } else {
        components[3] = components[3] / 255;
      }
      return components;
    }

    // Both the legacy syntax, rgba(255, 0, 0, 0.5), and the modern syntax,
    // rgb(255 0 0 / 50%), are supported.
    const rgb = colorString.match(/^rgba?\(([^)]*)\)$/);
    if (rgb) {
      const values = rgb[1].trim().split(/\s*[,/]\s*|\s+/);
      if (values.length < 3 || values.length > 4) {
        return null;
      }
      const components = [];
      for (let i = 0; i < values.length; i++) {
        const value = values[i];
        const isPercentage = value.endsWith('%');
        let number = Number(isPercentage ? value.slice(0, -1) : value);
        if (!value || isNaN(number)) {
          return null;
        }
        if (i < 3) {
          number = isPercentage ? number * 255 / 100 : number;
          components.push(Math.min(255, Math.max(0, number)));
        } else {
          number = isPercentage ? number / 100 : number;
          components.push(Math.min(1, Math.max(0, number)));
        }
      }
      if (components.length == 3) {
        components.push(1);
      }
      return components;
    }

    return null;
  }

  /**
   * Replaces the opacity of a CSS color.
   *
   * @param {string} color
   * @param {number} opacity Between 0 and 1.
   * @return {?string} The color as rgba(), or null if the color can't be
   *   parsed.
   */
  static setColorOpacity(color, opacity) {
    const components = shaka.text.Utils.parseColor(color);
    if (!components) {
      return null;
    }
    const alpha = Math.min(1, Math.max(0, opacity));
    return 'rgba(' + components.slice(0, 3).join(', ') + ', ' + alpha + ')';
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
   * @param {!Array<!shaka.text.Cue>} cues
   * @param {?shaka.text.Cue=} parentCue
   * @return {!Array<!shaka.text.Cue>}
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
   * @param {!Array<!shaka.text.Cue>} cues
   * @return {!Array<!shaka.text.Cue>}
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
   * @param {Map<string, !VTTRegion>=} nativeRegions The native regions of the
   *   track the cue will be added to.  Needed to render the cue in its region,
   *   if any.
   * @return {TextTrackCue}
   */
  static mapShakaCueToNativeCue(shakaCue, nativeRegions) {
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

    if (nativeRegions) {
      const region = shaka.text.Utils.getNativeRegion_(
          nativeRegions, shakaCue.region);
      if (region) {
        vttCue.region = region;
      }
    }

    return vttCue;
  }

  /**
   * Gets the native region to render cues of the given region into.  The
   * browser groups the cues of a region by the VTTRegion object, so cues of the
   * same region, even when parsed from different segments, share it.
   *
   * @param {!Map<string, !VTTRegion>} nativeRegions The native regions of the
   *   track, by the properties of their region.
   * @param {?shaka.text.CueRegion} region
   * @return {VTTRegion}
   * @private
   */
  static getNativeRegion_(nativeRegions, region) {
    const CueRegion = shaka.text.CueRegion;
    // Only Firefox and Safari support WebVTT regions.
    // eslint-disable-next-line no-restricted-syntax
    if (!window.VTTRegion || !('region' in VTTCue.prototype)) {
      return null;
    }
    // Only WebVTT regions can be rendered natively.  Regions of other formats,
    // like TTML or CEA-708, are sized in other units.
    if (!region || !region.id ||
        region.heightUnits != CueRegion.units.LINES ||
        region.widthUnits != CueRegion.units.PERCENTAGE ||
        region.viewportAnchorUnits != CueRegion.units.PERCENTAGE) {
      return null;
    }

    const key = [
      region.id,
      region.width,
      region.height,
      region.regionAnchorX,
      region.regionAnchorY,
      region.viewportAnchorX,
      region.viewportAnchorY,
      region.scroll,
    ].join('_');
    let nativeRegion = nativeRegions.get(key);
    if (!nativeRegion) {
      nativeRegion = new VTTRegion();
      nativeRegion.id = region.id;
      nativeRegion.width = region.width;
      nativeRegion.lines = region.height;
      nativeRegion.regionAnchorX = region.regionAnchorX;
      nativeRegion.regionAnchorY = region.regionAnchorY;
      nativeRegion.viewportAnchorX = region.viewportAnchorX;
      nativeRegion.viewportAnchorY = region.viewportAnchorY;
      nativeRegion.scroll = region.scroll;
      nativeRegions.set(key, nativeRegion);
    }
    return nativeRegion;
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
    if (vttCue.lineAlign) {
      cue.lineAlign = /** @type {shaka.text.Cue.lineAlign} */
        (vttCue.lineAlign);
    }
    cue.lineInterpretation = vttCue.snapToLines ?
      shaka.text.Cue.lineInterpretation.LINE_NUMBER :
      shaka.text.Cue.lineInterpretation.PERCENTAGE;
    cue.position = typeof vttCue.position === 'number' ?
      vttCue.position : null;
    if (vttCue.positionAlign) {
      cue.positionAlign = /** @type {shaka.text.Cue.positionAlign} */
        (vttCue.positionAlign);
    }
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

  /**
   * @param {!TextTrack} textTrack
   * @param {!Array<shaka.text.Cue>} cues
   * @param {Map<string, !VTTRegion>=} nativeRegions The native regions of the
   *   track, to render the cues in their regions.
   */
  static appendCuesToTextTrack(textTrack, cues, nativeRegions) {
    const flattenedCues = shaka.text.Utils.getCuesToFlatten(cues);

    // Convert cues.
    const textTrackCues = [];
    const cuesInTextTrack = textTrack.cues ?
      Array.from(textTrack.cues) : [];

    for (const inCue of flattenedCues) {
      // When a VTT cue spans a segment boundary, the cue will be duplicated
      // into two segments.
      // To avoid displaying duplicate cues, if the current textTrack cues
      // list already contains the cue, skip it.
      const containsCue = cuesInTextTrack.some((cueInTextTrack) =>
        cueInTextTrack.startTime == inCue.startTime &&
          cueInTextTrack.endTime == inCue.endTime &&
          cueInTextTrack.text == inCue.payload);

      if (!containsCue && inCue.payload) {
        const cue =
          shaka.text.Utils.mapShakaCueToNativeCue(inCue, nativeRegions);
        if (cue) {
          textTrackCues.push(cue);
        }
      }
    }

    // Sort the cues based on start/end times.  Make a copy of the array so
    // we can get the index in the original ordering.  Out of order cues are
    // rejected by Edge.  See https://bit.ly/2K9VX3s
    const sortedCues = textTrackCues.slice().sort((a, b) => {
      if (a.startTime != b.startTime) {
        return a.startTime - b.startTime;
      } else if (a.endTime != b.endTime) {
        return a.endTime - b.startTime;
      } else {
        // The browser will display cues with identical time ranges from the
        // bottom up.  Reversing the order of equal cues means the first one
        // parsed will be at the top, as you would expect.
        // See https://github.com/shaka-project/shaka-player/issues/848 for
        // more info.
        // However, this ordering behavior is part of VTTCue's "line" field.
        // Some platforms don't have a real VTTCue and use a polyfill instead.
        // When VTTCue is polyfilled or does not support "line", we should not
        // reverse the order.  This occurs on legacy Edge.
        // eslint-disable-next-line no-restricted-syntax
        if ('line' in VTTCue.prototype) {
          // Native VTTCue
          return textTrackCues.indexOf(b) - textTrackCues.indexOf(a);
        } else {
          // Polyfilled VTTCue
          return textTrackCues.indexOf(a) - textTrackCues.indexOf(b);
        }
      }
    });

    for (const cue of sortedCues) {
      textTrack.addCue(cue);
    }
  }


  /**
   * Iterate over all the cues in a text track and remove all those for which
   * |predicate(cue)| returns true.
   *
   * @param {!TextTrack} texTrack
   * @param {function(!TextTrackCue):boolean} predicate
   */
  static removeCuesFromTextTrack(texTrack, predicate) {
    // Since |track.cues| can be null if |track.mode| is "disabled", force it
    // to something other than "disabled".
    //
    // If the texTrack is already showing, then we should keep it as showing.
    // But if it something else, we will use hidden so that we don't "flash"
    // cues on the screen.
    let disabled = false;

    if (texTrack.mode === 'disabled') {
      disabled = true;
      texTrack.mode = 'hidden';
      goog.asserts.assert(
          texTrack.cues,
          'Cues should be accessible when mode is set to "hidden".',
      );
    }

    let i = 0;
    while (i < texTrack.cues.length) {
      const cue = texTrack.cues[i];
      if (predicate(cue)) {
        texTrack.removeCue(cue);
      } else {
        i++;
      }
    }

    if (disabled) {
      texTrack.mode = 'disabled';
    }
  }

  /**
   * Reset all positioning-related properties of a cue, including all nested
   * cues.
   *
   * @param {!shaka.text.Cue} cue
   */
  static resetCuePositioning(cue) {
    // Cue dummy to obtain the real default values
    const defaultCue = new shaka.text.Cue(0, 0, '');

    /**
     * Copy default positioning values recursively
     *
     * @param {!shaka.text.Cue} target
     */
    const reset = (target) => {
      target.line = defaultCue.line;
      target.lineAlign = defaultCue.lineAlign;
      target.position = defaultCue.position;
      target.positionAlign = defaultCue.positionAlign;
      target.size = defaultCue.size;
      target.displayAlign = defaultCue.displayAlign;
      target.region = defaultCue.region;

      for (const nested of target.nestedCues) {
        reset(nested);
      }
    };

    reset(cue);
  }
};


/**
 * The named colors used by subtitle formats (the TTML named colors, which
 * include the WebVTT ones), as hexadecimal colors.
 *
 * @const {!Map<string, string>}
 * @private
 */
shaka.text.Utils.NAMED_COLORS_ = new Map([
  ['transparent', '#0000'],
  ['black', '#000'],
  ['silver', '#c0c0c0'],
  ['gray', '#808080'],
  ['grey', '#808080'],
  ['white', '#fff'],
  ['maroon', '#800000'],
  ['red', '#f00'],
  ['purple', '#800080'],
  ['fuchsia', '#f0f'],
  ['magenta', '#f0f'],
  ['green', '#008000'],
  ['lime', '#0f0'],
  ['olive', '#808000'],
  ['yellow', '#ff0'],
  ['navy', '#000080'],
  ['blue', '#00f'],
  ['teal', '#008080'],
  ['aqua', '#0ff'],
  ['cyan', '#0ff'],
]);
