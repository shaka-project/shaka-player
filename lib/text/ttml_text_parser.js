/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

goog.provide('shaka.text.TtmlTextParser');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.text.Cue');
goog.require('shaka.text.CueRegion');
goog.require('shaka.text.TextEngine');
goog.require('shaka.util.ArrayUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.XmlUtils');


/**
 * @constructor
 * @implements {shaka.extern.TextParser}
 * @export
 */
shaka.text.TtmlTextParser = function() {};


/**
 * @const {string}
 * @private
 */
shaka.text.TtmlTextParser.parameterNs_ = 'http://www.w3.org/ns/ttml#parameter';


/**
 * @const {string}
 * @private
 */
shaka.text.TtmlTextParser.styleNs_ = 'http://www.w3.org/ns/ttml#styling';


/**
 * @override
 * @export
 */
shaka.text.TtmlTextParser.prototype.parseInit = function(data) {
  goog.asserts.assert(false, 'TTML does not have init segments');
};


/**
 * @override
 * @export
 */
shaka.text.TtmlTextParser.prototype.parseMedia = function(data, time) {
  const TtmlTextParser = shaka.text.TtmlTextParser;
  const XmlUtils = shaka.util.XmlUtils;
  const ttpNs = TtmlTextParser.parameterNs_;
  const ttsNs = TtmlTextParser.styleNs_;
  let str = shaka.util.StringUtils.fromUTF8(data);
  let ret = [];
  let parser = new DOMParser();
  let xml = null;

    // dont try to parse empty string as
    // DOMParser will not throw error but return an errored xml
    if (str == '') {
      return ret;
    }

  try {
    xml = parser.parseFromString(str, 'text/xml');
  } catch (exception) {
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_XML,
          'Failed to parse TTML.');
  }

  if (xml) {
      const parserError = xml.getElementsByTagName('parsererror')[0];
      if (parserError) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.TEXT,
            shaka.util.Error.Code.INVALID_XML,
            parserError.textContent);
      }

    // Try to get the framerate, subFrameRate and frameRateMultiplier
    // if applicable
    let frameRate = null;
    let subFrameRate = null;
    let frameRateMultiplier = null;
    let tickRate = null;
    let spaceStyle = null;
    let extent = null;
    let tts = xml.getElementsByTagName('tt');
    let tt = tts[0];
    // TTML should always have tt element.
    if (!tt) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
            shaka.util.Error.Code.INVALID_XML,
            'TTML does not contain <tt> tag.');
    } else {
      frameRate = XmlUtils.getAttributeNS(tt, ttpNs, 'frameRate');
      subFrameRate = XmlUtils.getAttributeNS(tt, ttpNs, 'subFrameRate');
      frameRateMultiplier =
          XmlUtils.getAttributeNS(tt, ttpNs, 'frameRateMultiplier');
      tickRate = XmlUtils.getAttributeNS(tt, ttpNs, 'tickRate');
      spaceStyle = tt.getAttribute('xml:space') || 'default';
      extent = XmlUtils.getAttributeNS(tt, ttsNs, 'extent');
    }

    if (spaceStyle != 'default' && spaceStyle != 'preserve') {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
            shaka.util.Error.Code.INVALID_XML,
            'Invalid xml:space value: ' + spaceStyle);
    }
    let whitespaceTrim = spaceStyle == 'default';

    let rateInfo = new TtmlTextParser.RateInfo_(
        frameRate, subFrameRate, frameRateMultiplier, tickRate);

    const metadataElements = TtmlTextParser.getLeafNodes_(
        tt.getElementsByTagName('metadata')[0]);
    let styles = TtmlTextParser.getLeafNodes_(
        tt.getElementsByTagName('styling')[0]);
    let regionElements = TtmlTextParser.getLeafNodes_(
        tt.getElementsByTagName('layout')[0]);
    let cueRegions = [];
    for (let i = 0; i < regionElements.length; i++) {
      let cueRegion = TtmlTextParser.parseCueRegion_(
          regionElements[i], styles, extent);
      if (cueRegion) {
        cueRegions.push(cueRegion);
      }
    }

  const textNodes = TtmlTextParser.getLeafCues_(
      tt.getElementsByTagName('body')[0]);
  for (const node of textNodes) {
    const cue = TtmlTextParser.parseCue_(
        node, time.periodStart, rateInfo, metadataElements, styles,
        regionElements, cueRegions, whitespaceTrim, false);
      if (cue) {
        ret.push(cue);
      }
    }
  }

  return ret;
};


/**
 * @const
 * @private {!RegExp}
 * @example 50.17% 10%
 */
shaka.text.TtmlTextParser.percentValues_ =
    /^(\d{1,2}(?:\.\d+)?|100(?:\.0+)?)% (\d{1,2}(?:\.\d+)?|100(?:\.0+)?)%$/;


/**
 * @const
 * @private {!RegExp}
 * @example 100px
 */
shaka.text.TtmlTextParser.unitValues_ = /^(\d+px|\d+em)$/;


/**
 * @const
 * @private {!RegExp}
 * @example 100px
 */
shaka.text.TtmlTextParser.pixelValues_ = /^(\d+)px (\d+)px$/;

/**
 * @const
 * @private {!RegExp}
 * @example 00:00:40:07 (7 frames) or 00:00:40:07.1 (7 frames, 1 subframe)
 */
shaka.text.TtmlTextParser.timeColonFormatFrames_ =
    /^(\d{2,}):(\d{2}):(\d{2}):(\d{2})\.?(\d+)?$/;


/**
 * @const
 * @private {!RegExp}
 * @example 00:00:40 or 00:40
 */
shaka.text.TtmlTextParser.timeColonFormat_ = /^(?:(\d{2,}):)?(\d{2}):(\d{2})$/;


/**
 * @const
 * @private {!RegExp}
 * @example 01:02:43.0345555 or 02:43.03
 */
shaka.text.TtmlTextParser.timeColonFormatMilliseconds_ =
    /^(?:(\d{2,}):)?(\d{2}):(\d{2}\.\d{2,})$/;


/**
 * @const
 * @private {!RegExp}
 * @example 75f or 75.5f
 */
shaka.text.TtmlTextParser.timeFramesFormat_ = /^(\d*(?:\.\d*)?)f$/;


/**
 * @const
 * @private {!RegExp}
 * @example 50t or 50.5t
 */
shaka.text.TtmlTextParser.timeTickFormat_ = /^(\d*(?:\.\d*)?)t$/;


/**
 * @const
 * @private {!RegExp}
 * @example 3.45h, 3m or 4.20s
 */
shaka.text.TtmlTextParser.timeHMSFormat_ =
    new RegExp(['^(?:(\\d*(?:\\.\\d*)?)h)?',
                '(?:(\\d*(?:\\.\\d*)?)m)?',
                '(?:(\\d*(?:\\.\\d*)?)s)?',
                '(?:(\\d*(?:\\.\\d*)?)ms)?$'].join(''));


/**
 * @const
 * @private {!Object.<string, shaka.text.Cue.lineAlign>}
 */
shaka.text.TtmlTextParser.textAlignToLineAlign_ = {
  'left': shaka.text.Cue.lineAlign.START,
  'center': shaka.text.Cue.lineAlign.CENTER,
  'right': shaka.text.Cue.lineAlign.END,
  'start': shaka.text.Cue.lineAlign.START,
  'end': shaka.text.Cue.lineAlign.END,
};


/**
 * @const
 * @private {!Object.<string, shaka.text.Cue.positionAlign>}
 */
shaka.text.TtmlTextParser.textAlignToPositionAlign_ = {
  'left': shaka.text.Cue.positionAlign.LEFT,
  'center': shaka.text.Cue.positionAlign.CENTER,
  'right': shaka.text.Cue.positionAlign.RIGHT,
};


/**
 * Gets the leaf nodes of the xml node tree. Ignores the text, br elements
 * and the spans positioned inside paragraphs
 *
 * @param {Element} element
 * @return {!Array.<!Element>}
 * @private
 */
shaka.text.TtmlTextParser.getLeafNodes_ = function(element) {
  let result = [];
  if (!element) {
    return result;
  }

  for (const node of element.childNodes) {
    if (
      node.nodeType == Node.ELEMENT_NODE &&
      node.nodeName !== 'br'
    ) {
      // Get the leaves the child might contain.
      goog.asserts.assert(node instanceof Element,
          'Node should be Element!');
      const leafChildren = shaka.text.TtmlTextParser.getLeafNodes_(
          /** @type {Element} */(node));
      goog.asserts.assert(leafChildren.length > 0,
                          'Only a null Element should return no leaves!');

      result = result.concat(leafChildren);
    }
  }

  // if no result at this point, the element itself must be a leaf.
  if (!result.length) {
    result.push(element);
  }

  return result;
};


/**
 * Get the leaf nodes that can act as cues
 * (at least begin attribute)
 *
 * @param {Element} element
 * @return {!Array.<!Element>}
 * @private
 */
shaka.text.TtmlTextParser.getLeafCues_ = function(element) {
  if (!element) {
    return [];
  }

  let ret = [];
  // Recursively find any child elements that have a 'begin' attribute.
  for (const child of element.childNodes) {
    if (child instanceof Element) {
      if (child.hasAttribute('begin')) {
        ret.push(child);
      } else {
        ret = ret.concat(shaka.text.TtmlTextParser.getLeafCues_(child));
      }
    }
  }
  return ret;
};


/**
 * Trims and removes multiple spaces from a string
 *
 * @param {Element} element
 * @param {boolean} whitespaceTrim
 * @return {string}
 * @private
 */
shaka.text.TtmlTextParser.sanitizeTextContent = function(
    element, whitespaceTrim) {
  let payload = '';

  for (const node of element.childNodes) {
    if (node.nodeName == 'br' && element.childNodes[0] !== node) {
      payload += '\n';
    } else if (node.childNodes && node.childNodes.length > 0) {
      payload += shaka.text.TtmlTextParser.sanitizeTextContent(
          /** @type {!Element} */ (node),
          whitespaceTrim
      );
    } else if (whitespaceTrim) {
      // Trim leading and trailing whitespace.
      let trimmed = node.textContent.trim();
      // Collapse multiple spaces into one.
      trimmed = trimmed.replace(/\s+/g, ' ');

      payload += trimmed;
    } else {
      payload += node.textContent;
    }
  }

  return payload;
};


/**
 * Parses an Element into a TextTrackCue or VTTCue.
 *
 * @param {!Element} cueElement
 * @param {number} offset
 * @param {!shaka.text.TtmlTextParser.RateInfo_} rateInfo
 * @param {!Array.<!Element>} metadataElements
 * @param {!Array.<!Element>} styles
 * @param {!Array.<!Element>} regionElements
 * @param {!Array.<!shaka.text.CueRegion>} cueRegions
 * @param {boolean} whitespaceTrim
   * @param {boolean} isNested
 * @return {shaka.text.Cue}
 * @private
 */
shaka.text.TtmlTextParser.parseCue_ = function(
    cueElement, offset, rateInfo, metadataElements, styles, regionElements,
    cueRegions, whitespaceTrim, isNested) {
  if (isNested && cueElement.nodeName == 'br') {
    const cue = new shaka.text.Cue(0, 0, '');
    cue.spacer = true;

    return cue;
  }

    const isTextContentEmpty = /^[\s\n]*$/.test(cueElement.textContent);
    const hasNoTimeAttributes = cueElement.nodeType == Node.ELEMENT_NODE &&
        !cueElement.hasAttribute('begin') &&
        !cueElement.hasAttribute('end');

    if (
      cueElement.nodeType != Node.ELEMENT_NODE ||
      /* Disregards empty elements without time attributes nor content
       * <p begin="..." smpte:backgroundImage="..." /> will go through,
       *    as some information could be holded by its attributes
       * <p />, <div></div> won't,
       *    as they don't have means to be displayed into a playback sequence
       */
      (hasNoTimeAttributes && isTextContentEmpty) ||
      /*
       * Let nested cue without time attributes through:
       *    time attributes are holded by its parent
       */
      (hasNoTimeAttributes && !isNested)
    ) {
    return null;
  }

  const spaceStyle = cueElement.getAttribute('xml:space') ||
      (whitespaceTrim ? 'default' : 'preserve');
  const localWhitespaceTrim = spaceStyle == 'default';

  // Get time.
  let start = shaka.text.TtmlTextParser.parseTime_(
      cueElement.getAttribute('begin'), rateInfo);
  let end = shaka.text.TtmlTextParser.parseTime_(
      cueElement.getAttribute('end'), rateInfo);
  let duration = shaka.text.TtmlTextParser.parseTime_(
      cueElement.getAttribute('dur'), rateInfo);

  if (end == null && duration != null) {
    end = start + duration;
  }

    if (!isNested && (start == null || end == null)) {
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.INVALID_TEXT_CUE);
  }

  if (isNested && start == null) {
    start = 0;
  } else {
    start += offset;
  }

  if (isNested && end == null) {
    end = 0;
  } else {
    end += offset;
  }

  let payload = '';
  const nestedCues = [];
  // If one of the children is a text node with something other than whitespace
  // in it, stop going down and write the payload.
  if (
    Array.from(cueElement.childNodes).find(
        (childNode) => childNode.nodeType === Node.TEXT_NODE &&
        /\S+/.test(childNode.textContent)
    )
  ) {
    payload = shaka.text.TtmlTextParser.sanitizeTextContent(
        cueElement,
        localWhitespaceTrim);
  } else {
    for (const childNode of cueElement.childNodes) {
      const nestedCue = shaka.text.TtmlTextParser.parseCue_(
          /** @type {!Element} */ (childNode),
          offset,
          rateInfo,
          metadataElements,
          styles,
          regionElements,
          cueRegions,
          localWhitespaceTrim,
          /* isNested */ true);

      if (nestedCue) {
        // Set the start time and end time for the nested cues.
        nestedCue.startTime = nestedCue.startTime || start;
        nestedCue.endTime = nestedCue.endTime || end;
        nestedCues.push(nestedCue);
      }
    }
  }

  const cue = new shaka.text.Cue(start, end, payload);
  cue.nestedCues = nestedCues;

  // Get other properties if available.
  const regionElement = shaka.text.TtmlTextParser.getElementsFromCollection_(
      cueElement, 'region', regionElements, /* prefix= */ '')[0];
  if (regionElement && regionElement.getAttribute('xml:id')) {
    const regionId = regionElement.getAttribute('xml:id');
    cue.region = cueRegions.filter((region) => region.id == regionId)[0];
  }
  const imageElement = shaka.text.TtmlTextParser.getElementsFromCollection_(
      cueElement, 'backgroundImage', metadataElements, '#',
      shaka.text.TtmlTextParser.smpteNs_)[0];

  shaka.text.TtmlTextParser.addStyle_(
      cue,
      cueElement,
      regionElement,
      imageElement,
      styles);

  return cue;
};


/**
 * Parses an Element into a TextTrackCue or VTTCue.
 *
 * @param {!Element} regionElement
 * @param {!Array.<!Element>} styles Defined in the top of tt  element and
 * used principally for images.
 * @param {?string} globalExtent
 * @return {shaka.text.CueRegion}
 * @private
 */
shaka.text.TtmlTextParser.parseCueRegion_ = function(regionElement, styles,
  globalExtent) {
  const TtmlTextParser = shaka.text.TtmlTextParser;
  let region = new shaka.text.CueRegion();
  let id = regionElement.getAttribute('xml:id');
  if (!id) {
    shaka.log.warning('TtmlTextParser parser encountered a region with ' +
                      'no id. Region will be ignored.');
    return null;
  }
  region.id = id;

  let globalResults = null;
  if (globalExtent) {
    globalResults = TtmlTextParser.percentValues_.exec(globalExtent) ||
      TtmlTextParser.pixelValues_.exec(globalExtent);
  }
  const globalWidth = globalResults ? Number(globalResults[1]) : null;
  const globalHeight = globalResults ? Number(globalResults[2]) : null;

  let results = null;
  let percentage = null;
  let extent = TtmlTextParser.getStyleAttributeFromRegion_(
      regionElement, styles, 'extent');
  if (extent) {
    percentage = TtmlTextParser.percentValues_.exec(extent);
    results = percentage || TtmlTextParser.pixelValues_.exec(extent);
    if (results != null) {
      if (globalWidth != null) {
        region.width = Number(results[1]) * 100 / globalWidth;
      } else {
        region.width = Number(results[1]);
      }
      if (globalHeight != null) {
        region.height = Number(results[2]) * 100 / globalHeight;
      } else {
        region.height = Number(results[2]);
      }
      region.widthUnits = percentage || globalWidth != null ?
                         shaka.text.CueRegion.units.PERCENTAGE :
                         shaka.text.CueRegion.units.PX;

      region.heightUnits = percentage || globalHeight != null ?
                         shaka.text.CueRegion.units.PERCENTAGE :
                         shaka.text.CueRegion.units.PX;
    }
  }

  let origin = TtmlTextParser.getStyleAttributeFromRegion_(
      regionElement, styles, 'origin');
  if (origin) {
    percentage = TtmlTextParser.percentValues_.exec(origin);
    results = percentage || TtmlTextParser.pixelValues_.exec(origin);
    if (results != null) {
      if (globalWidth != null) {
        region.viewportAnchorX = Number(results[1]) * 100 / globalWidth;
      } else {
        region.viewportAnchorX = Number(results[1]);
      }
      if (globalHeight != null) {
        region.viewportAnchorY = Number(results[2]) * 100 / globalHeight;
      } else {
        region.viewportAnchorY = Number(results[2]);
      }
      region.viewportAnchorUnits = percentage || globalWidth != null ?
                shaka.text.CueRegion.units.PERCENTAGE :
                shaka.text.CueRegion.units.PX;
    }
  }

  return region;
};

/**
 * Adds applicable style properties to a cue.
 *
 * @param {!shaka.text.Cue} cue
 * @param {!Element} cueElement
 * @param {Element} region
 * @param {Element} imageElement
 * @param {!Array.<!Element>} styles
 * @private
 */
shaka.text.TtmlTextParser.addStyle_ = function(
    cue, cueElement, region, imageElement, styles) {
  const TtmlTextParser = shaka.text.TtmlTextParser;
  const Cue = shaka.text.Cue;

  let direction = TtmlTextParser.getStyleAttribute_(
      cueElement, region, styles, 'direction');
  if (direction == 'rtl') {
    cue.direction = Cue.direction.HORIZONTAL_RIGHT_TO_LEFT;
  }

  // Direction attribute specifies one-dimentional writing direction
  // (left to right or right to left). Writing mode specifies that
  // plus whether text is vertical or horizontal.
  // They should not contradict each other. If they do, we give
  // preference to writing mode.
  let writingMode = TtmlTextParser.getStyleAttribute_(
      cueElement, region, styles, 'writingMode');
  // Set cue's direction if the text is horizontal, and cue's writingMode if
  // it's vertical.
  if (writingMode == 'tb' || writingMode == 'tblr') {
    cue.writingMode = Cue.writingMode.VERTICAL_LEFT_TO_RIGHT;
  } else if (writingMode == 'tbrl') {
    cue.writingMode = Cue.writingMode.VERTICAL_RIGHT_TO_LEFT;
  } else if (writingMode == 'rltb' || writingMode == 'rl') {
    cue.direction = Cue.direction.HORIZONTAL_RIGHT_TO_LEFT;
  } else if (writingMode) {
    cue.direction = Cue.direction.HORIZONTAL_LEFT_TO_RIGHT;
  }

  let align = TtmlTextParser.getStyleAttribute_(
      cueElement, region, styles, 'textAlign');
  if (align) {
    cue.positionAlign = TtmlTextParser.textAlignToPositionAlign_[align];
    cue.lineAlign = TtmlTextParser.textAlignToLineAlign_[align];

    goog.asserts.assert(align.toUpperCase() in Cue.textAlign,
                        align.toUpperCase() +
                        ' Should be in Cue.textAlign values!');

    cue.textAlign = Cue.textAlign[align.toUpperCase()];
  } else {
    // Default value is START: https://bit.ly/32OGmvo
    cue.textAlign = Cue.textAlign.START;
  }

  let displayAlign = TtmlTextParser.getStyleAttribute_(
      cueElement, region, styles, 'displayAlign');
  if (displayAlign) {
    goog.asserts.assert(displayAlign.toUpperCase() in Cue.displayAlign,
                        displayAlign.toUpperCase() +
                        ' Should be in Cue.displayAlign values!');
    cue.displayAlign = Cue.displayAlign[displayAlign.toUpperCase()];
  }

  let color = TtmlTextParser.getStyleAttribute_(
      cueElement, region, styles, 'color');
  if (color) {
    cue.color = color;
  }

  let backgroundColor = TtmlTextParser.getStyleAttribute_(
      cueElement, region, styles, 'backgroundColor');
  if (backgroundColor) {
    cue.backgroundColor = backgroundColor;
  }

  let fontFamily = TtmlTextParser.getStyleAttribute_(
      cueElement, region, styles, 'fontFamily');
  if (fontFamily) {
    cue.fontFamily = fontFamily;
  }

  let fontWeight = TtmlTextParser.getStyleAttribute_(
      cueElement, region, styles, 'fontWeight');
  if (fontWeight && fontWeight == 'bold') {
    cue.fontWeight = Cue.fontWeight.BOLD;
  }

  let wrapOption = TtmlTextParser.getStyleAttribute_(
      cueElement, region, styles, 'wrapOption');
  if (wrapOption && wrapOption == 'noWrap') {
    cue.wrapLine = false;
  }

  let lineHeight = TtmlTextParser.getStyleAttribute_(
      cueElement, region, styles, 'lineHeight');
  if (lineHeight && lineHeight.match(TtmlTextParser.unitValues_)) {
    cue.lineHeight = lineHeight;
  }

  let fontSize = TtmlTextParser.getStyleAttribute_(
      cueElement, region, styles, 'fontSize');
  if (fontSize && fontSize.match(TtmlTextParser.unitValues_)) {
    cue.fontSize = fontSize;
  }

  let fontStyle = TtmlTextParser.getStyleAttribute_(
      cueElement, region, styles, 'fontStyle');
  if (fontStyle) {
    goog.asserts.assert(fontStyle.toUpperCase() in Cue.fontStyle,
                        fontStyle.toUpperCase() +
                        ' Should be in Cue.fontStyle values!');
    cue.fontStyle = Cue.fontStyle[fontStyle.toUpperCase()];
  }

  if (imageElement) {
    // According to the spec, we should use imageType (camelCase), but
    // historically we have checked for imagetype (lowercase).
    // This was the case since background image support was first introduced
    // in PR #1859, in April 2019, and first released in v2.5.0.
    // Now we check for both, although only imageType (camelCase) is to spec.
    const backgroundImageType =
        imageElement.getAttribute('imageType') ||
        imageElement.getAttribute('imagetype');
    const backgroundImageEncoding = imageElement.getAttribute('encoding');
    const backgroundImageData = imageElement.textContent.trim();
    if (backgroundImageType == 'PNG' &&
        backgroundImageEncoding == 'Base64' &&
        backgroundImageData) {
      cue.backgroundImage = 'data:image/png;base64,' + backgroundImageData;
    }
  }

  // Text decoration is an array of values which can come both from the
  // element's style or be inherited from elements' parent nodes. All of those
  // values should be applied as long as they don't contradict each other. If
  // they do, elements' own style gets preference.
  let textDecorationRegion = TtmlTextParser.getStyleAttributeFromRegion_(
      region, styles, 'textDecoration');
  if (textDecorationRegion) {
    TtmlTextParser.addTextDecoration_(cue, textDecorationRegion);
  }

  let textDecorationElement = TtmlTextParser.getStyleAttributeFromElement_(
      cueElement, styles, 'textDecoration');
  if (textDecorationElement) {
    TtmlTextParser.addTextDecoration_(cue, textDecorationElement);
  }
};


/**
 * Parses text decoration values and adds/removes them to/from the cue.
 *
 * @param {!shaka.text.Cue} cue
 * @param {string} decoration
 * @private
 */
shaka.text.TtmlTextParser.addTextDecoration_ = function(cue, decoration) {
  const Cue = shaka.text.Cue;
  let values = decoration.split(' ');
  for (let i = 0; i < values.length; i++) {
    switch (values[i]) {
      case 'underline':
        if (!cue.textDecoration.includes(Cue.textDecoration.UNDERLINE)) {
          cue.textDecoration.push(Cue.textDecoration.UNDERLINE);
        }
        break;
      case 'noUnderline':
        if (cue.textDecoration.includes(Cue.textDecoration.UNDERLINE)) {
          shaka.util.ArrayUtils.remove(cue.textDecoration,
                                       Cue.textDecoration.UNDERLINE);
        }
        break;
      case 'lineThrough':
        if (!cue.textDecoration.includes(Cue.textDecoration.LINE_THROUGH)) {
          cue.textDecoration.push(Cue.textDecoration.LINE_THROUGH);
        }
        break;
      case 'noLineThrough':
        if (cue.textDecoration.includes(Cue.textDecoration.LINE_THROUGH)) {
          shaka.util.ArrayUtils.remove(cue.textDecoration,
                                       Cue.textDecoration.LINE_THROUGH);
        }
        break;
      case 'overline':
        if (!cue.textDecoration.includes(Cue.textDecoration.OVERLINE)) {
          cue.textDecoration.push(Cue.textDecoration.OVERLINE);
        }
        break;
      case 'noOverline':
        if (cue.textDecoration.includes(Cue.textDecoration.OVERLINE)) {
          shaka.util.ArrayUtils.remove(cue.textDecoration,
                                       Cue.textDecoration.OVERLINE);
        }
        break;
    }
  }
};


/**
 * Finds a specified attribute on either the original cue element or its
 * associated region and returns the value if the attribute was found.
 *
 * @param {!Element} cueElement
 * @param {Element} region
 * @param {!Array.<!Element>} styles
 * @param {string} attribute
 * @return {?string}
 * @private
 */
shaka.text.TtmlTextParser.getStyleAttribute_ = function(
    cueElement, region, styles, attribute) {
  // An attribute can be specified on region level or in a styling block
  // associated with the region or original element.
  const TtmlTextParser = shaka.text.TtmlTextParser;
  let attr = TtmlTextParser.getStyleAttributeFromElement_(
      cueElement, styles, attribute);
  if (attr) {
    return attr;
  }

  return TtmlTextParser.getStyleAttributeFromRegion_(
      region, styles, attribute);
};


/**
 * Finds a specified attribute on the element's associated region
 * and returns the value if the attribute was found.
 *
 * @param {Element} region
 * @param {!Array.<!Element>} styles
 * @param {string} attribute
 * @return {?string}
 * @private
 */
shaka.text.TtmlTextParser.getStyleAttributeFromRegion_ = function(
    region, styles, attribute) {
  const XmlUtils = shaka.util.XmlUtils;
  const ttsNs = shaka.text.TtmlTextParser.styleNs_;

  if (!region) {
    return null;
  }

  let regionChildren = shaka.text.TtmlTextParser.getLeafNodes_(region);
  for (let i = 0; i < regionChildren.length; i++) {
    let attr = XmlUtils.getAttributeNS(regionChildren[i], ttsNs, attribute);
    if (attr) {
      return attr;
    }
  }

  return shaka.text.TtmlTextParser.getInheritedStyleAttribute_(
      region, styles, attribute);
};


/**
 * Finds a specified attribute on the cue element and returns the value
 * if the attribute was found.
 *
 * @param {!Element} cueElement
 * @param {!Array.<!Element>} styles
 * @param {string} attribute
 * @return {?string}
 * @private
 */
shaka.text.TtmlTextParser.getStyleAttributeFromElement_ = function(
    cueElement, styles, attribute) {
  const XmlUtils = shaka.util.XmlUtils;
  const ttsNs = shaka.text.TtmlTextParser.styleNs_;

  // Styling on elements should take precedence
  // over the main styling attributes
  const elementAttribute = XmlUtils.getAttributeNS(
      cueElement,
      ttsNs,
      attribute);

  if (elementAttribute) {
    return elementAttribute;
  }

  return shaka.text.TtmlTextParser.getInheritedStyleAttribute_(
      cueElement, styles, attribute);
};


/**
 * Finds a specified attribute on an element's styles and the styles those
 * styles inherit from.
 *
 * @param {!Element} element
 * @param {!Array.<!Element>} styles
 * @param {string} attribute
 * @return {?string}
 * @private
 */
shaka.text.TtmlTextParser.getInheritedStyleAttribute_ = function(
    element, styles, attribute) {
  const XmlUtils = shaka.util.XmlUtils;
  const ttsNs = shaka.text.TtmlTextParser.styleNs_;

  const inheritedStyles = shaka.text.TtmlTextParser.getElementsFromCollection_(
      element, 'style', styles, /* prefix= */ '');

  let styleValue = null;

  // The last value in our styles stack takes the precedence over the others
  for (let i = 0; i < inheritedStyles.length; i++) {
    let styleAttributeValue = XmlUtils.getAttributeNS(
        inheritedStyles[i],
        ttsNs,
        attribute);

    if (!styleAttributeValue) {
      // Styles can inherit from other styles, so traverse up that chain.
      styleAttributeValue =
          shaka.text.TtmlTextParser.getStyleAttributeFromElement_(
              inheritedStyles[i], styles, attribute);
    }

    if (styleAttributeValue) {
      styleValue = styleAttributeValue;
    }
  }

  return styleValue;
};


/**
 * Selects items from |collection| whose id matches |attributeName|
 * from |element|.
 *
 * @param {Element} element
 * @param {string} attributeName
 * @param {!Array.<Element>} collection
 * @param {string} prefixName
 * @param {string=} nsName
 * @return {!Array.<!Element>}
 * @private
 */
shaka.text.TtmlTextParser.getElementsFromCollection_ = function(
    element, attributeName, collection, prefixName, nsName) {
  const items = [];

  if (!element || collection.length < 1) {
    return items;
  }

  const attributeValue = shaka.text.TtmlTextParser.getInheritedAttribute_(
      element, attributeName, nsName);

  if (attributeValue) {
    // There could be multiple items in one attribute
    // <span style="style1 style2">A cue</span>
    const itemNames = attributeValue.split(' ');

    for (const name of itemNames) {
      for (const item of collection) {
        if ((prefixName + item.getAttribute('xml:id')) == name) {
          items.push(item);
          break;
        }
      }
    }
  }

  return items;
};


/**
 * Traverses upwards from a given node until a given attribute is found.
 *
 * @param {!Element} element
 * @param {string} attributeName
 * @param {string=} nsName
 * @return {?string}
 * @private
 */
shaka.text.TtmlTextParser.getInheritedAttribute_ = function(
    element, attributeName, nsName) {
  let ret = null;
  const XmlUtils = shaka.util.XmlUtils;
  while (element) {
    ret = nsName ? XmlUtils.getAttributeNS(element, nsName, attributeName)
                 : element.getAttribute(attributeName);
    if (ret) {
      break;
    }

    // Element.parentNode can lead to XMLDocument, which is not an Element and
    // has no getAttribute().
    let parentNode = element.parentNode;
    if (parentNode instanceof Element) {
      element = parentNode;
    } else {
      break;
    }
  }
  return ret;
};


/**
 * Parses a TTML time from the given word.
 *
 * @param {string} text
 * @param {!shaka.text.TtmlTextParser.RateInfo_} rateInfo
 * @return {?number}
 * @private
 */
shaka.text.TtmlTextParser.parseTime_ = function(text, rateInfo) {
  let ret = null;
  const TtmlTextParser = shaka.text.TtmlTextParser;

  if (TtmlTextParser.timeColonFormatFrames_.test(text)) {
    ret = TtmlTextParser.parseColonTimeWithFrames_(rateInfo, text);
  } else if (TtmlTextParser.timeColonFormat_.test(text)) {
    ret = TtmlTextParser.parseTimeFromRegex_(
        TtmlTextParser.timeColonFormat_, text);
  } else if (TtmlTextParser.timeColonFormatMilliseconds_.test(text)) {
    ret = TtmlTextParser.parseTimeFromRegex_(
        TtmlTextParser.timeColonFormatMilliseconds_, text);
  } else if (TtmlTextParser.timeFramesFormat_.test(text)) {
    ret = TtmlTextParser.parseFramesTime_(rateInfo, text);
  } else if (TtmlTextParser.timeTickFormat_.test(text)) {
    ret = TtmlTextParser.parseTickTime_(rateInfo, text);
  } else if (TtmlTextParser.timeHMSFormat_.test(text)) {
    ret = TtmlTextParser.parseTimeFromRegex_(
        TtmlTextParser.timeHMSFormat_, text);
  }

  return ret;
};


/**
 * Parses a TTML time in frame format.
 *
 * @param {!shaka.text.TtmlTextParser.RateInfo_} rateInfo
 * @param {string} text
 * @return {?number}
 * @private
 */
shaka.text.TtmlTextParser.parseFramesTime_ = function(rateInfo, text) {
  // 75f or 75.5f
  let results = shaka.text.TtmlTextParser.timeFramesFormat_.exec(text);
  let frames = Number(results[1]);

  return frames / rateInfo.frameRate;
};


/**
 * Parses a TTML time in tick format.
 *
 * @param {!shaka.text.TtmlTextParser.RateInfo_} rateInfo
 * @param {string} text
 * @return {?number}
 * @private
 */
shaka.text.TtmlTextParser.parseTickTime_ = function(rateInfo, text) {
  // 50t or 50.5t
  let results = shaka.text.TtmlTextParser.timeTickFormat_.exec(text);
  let ticks = Number(results[1]);

  return ticks / rateInfo.tickRate;
};


/**
 * Parses a TTML colon formatted time containing frames.
 *
 * @param {!shaka.text.TtmlTextParser.RateInfo_} rateInfo
 * @param {string} text
 * @return {?number}
 * @private
 */
shaka.text.TtmlTextParser.parseColonTimeWithFrames_ = function(
    rateInfo, text) {
  // 01:02:43:07 ('07' is frames) or 01:02:43:07.1 (subframes)
  let results = shaka.text.TtmlTextParser.timeColonFormatFrames_.exec(text);

  let hours = Number(results[1]);
  let minutes = Number(results[2]);
  let seconds = Number(results[3]);
  let frames = Number(results[4]);
  let subframes = Number(results[5]) || 0;

  frames += subframes / rateInfo.subFrameRate;
  seconds += frames / rateInfo.frameRate;

  return seconds + (minutes * 60) + (hours * 3600);
};


/**
 * Parses a TTML time with a given regex. Expects regex to be some
 * sort of a time-matcher to match hours, minutes, seconds and milliseconds
 *
 * @param {!RegExp} regex
 * @param {string} text
 * @return {?number}
 * @private
 */
shaka.text.TtmlTextParser.parseTimeFromRegex_ = function(regex, text) {
  let results = regex.exec(text);
  if (results == null || results[0] == '') {
    return null;
  }
  // This capture is optional, but will still be in the array as undefined,
  // in which case it is 0.
  let hours = Number(results[1]) || 0;
  let minutes = Number(results[2]) || 0;
  let seconds = Number(results[3]) || 0;
  let miliseconds = Number(results[4]) || 0;

  return (miliseconds / 1000) + seconds + (minutes * 60) + (hours * 3600);
};


/**
 * Contains information about frame/subframe rate
 * and frame rate multiplier for time in frame format.
 *
 * @example 01:02:03:04(4 frames) or 01:02:03:04.1(4 frames, 1 subframe)
 * @param {?string} frameRate
 * @param {?string} subFrameRate
 * @param {?string} frameRateMultiplier
 * @param {?string} tickRate
 * @constructor
 * @struct
 * @private
 */
shaka.text.TtmlTextParser.RateInfo_ = function(
    frameRate, subFrameRate, frameRateMultiplier, tickRate) {
  /**
   * @type {number}
   */
  this.frameRate = Number(frameRate) || 30;

  /**
   * @type {number}
   */
  this.subFrameRate = Number(subFrameRate) || 1;

  /**
   * @type {number}
   */
  this.tickRate = Number(tickRate);
  if (this.tickRate == 0) {
    if (frameRate) {
      this.tickRate = this.frameRate * this.subFrameRate;
    } else {
      this.tickRate = 1;
    }
  }

  if (frameRateMultiplier) {
    const multiplierResults = /^(\d+) (\d+)$/g.exec(frameRateMultiplier);
    if (multiplierResults) {
      const numerator = Number(multiplierResults[1]);
      const denominator = Number(multiplierResults[2]);
      const multiplierNum = numerator / denominator;
      this.frameRate *= multiplierNum;
    }
  }
};


/**
 * The namespace URL for SMPTE fields.
 * @const {string}
 * @private
 */
shaka.text.TtmlTextParser.smpteNs_ =
    'http://www.smpte-ra.org/schemas/2052-1/2010/smpte-tt';


shaka.text.TextEngine.registerParser(
    'application/ttml+xml',
    shaka.text.TtmlTextParser);
