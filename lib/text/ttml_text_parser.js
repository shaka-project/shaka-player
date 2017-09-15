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
goog.require('shaka.text.Cue');
goog.require('shaka.text.TextEngine');
goog.require('shaka.util.ArrayUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.StringUtils');



/**
 * @constructor
 * @implements {shakaExtern.TextParser}
 */
shaka.text.TtmlTextParser = function() {};


/** @override */
shaka.text.TtmlTextParser.prototype.parseInit = function(data) {
  goog.asserts.assert(false, 'TTML does not have init segments');
};


/** @override */
shaka.text.TtmlTextParser.prototype.parseMedia = function(data, time) {
  var str = shaka.util.StringUtils.fromUTF8(data);
  var ret = [];
  var parser = new DOMParser();
  var xml = null;

  try {
    xml = parser.parseFromString(str, 'text/xml');
  } catch (exception) {
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.INVALID_XML);
  }

  if (xml) {
    // Try to get the framerate, subFrameRate and frameRateMultiplier
    // if applicable
    var frameRate = null;
    var subFrameRate = null;
    var frameRateMultiplier = null;
    var tickRate = null;
    var spaceStyle = null;
    var tts = xml.getElementsByTagName('tt');
    var tt = tts[0];
    // TTML should always have tt element
    if (!tt) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_XML);
    } else {
      frameRate = tt.getAttribute('ttp:frameRate');
      subFrameRate = tt.getAttribute('ttp:subFrameRate');
      frameRateMultiplier = tt.getAttribute('ttp:frameRateMultiplier');
      tickRate = tt.getAttribute('ttp:tickRate');
      spaceStyle = tt.getAttribute('xml:space') || 'default';
    }

    if (spaceStyle != 'default' && spaceStyle != 'preserve') {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_XML);
    }
    var whitespaceTrim = spaceStyle == 'default';

    var rateInfo = new shaka.text.TtmlTextParser.RateInfo_(
        frameRate, subFrameRate, frameRateMultiplier, tickRate);

    var styles = shaka.text.TtmlTextParser.getLeafNodes_(
        tt.getElementsByTagName('styling')[0]);
    var regions = shaka.text.TtmlTextParser.getLeafNodes_(
        tt.getElementsByTagName('layout')[0]);
    var textNodes = shaka.text.TtmlTextParser.getLeafNodes_(
        tt.getElementsByTagName('body')[0]);

    for (var i = 0; i < textNodes.length; i++) {
      var cue = shaka.text.TtmlTextParser.parseCue_(textNodes[i],
                                                    time.periodStart,
                                                    rateInfo,
                                                    styles,
                                                    regions,
                                                    whitespaceTrim);
      if (cue)
        ret.push(cue);
    }
  }

  return ret;
};


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
shaka.text.TtmlTextParser.timeColonFormat_ =
    /^(?:(\d{2,}):)?(\d{2}):(\d{2})$/;


/**
 * @const
 * @private {!RegExp}
 * example 01:02:43.0345555 or 02:43.03
 */
shaka.text.TtmlTextParser.timeColonFormatMilliseconds_ =
    /^(?:(\d{2,}):)?(\d{2}):(\d{2}\.\d{2,})$/;


/**
 * @const
 * @private {!RegExp}
 * @example 75f or 75.5f
 */
shaka.text.TtmlTextParser.timeFramesFormat_ = /^(\d*\.?\d*)f$/;


/**
 * @const
 * @private {!RegExp}
 * @example 50t or 50.5t
 */
shaka.text.TtmlTextParser.timeTickFormat_ = /^(\d*\.?\d*)t$/;


/**
 * @const
 * @private {!RegExp}
 * @example 3.45h, 3m or 4.20s
 */
shaka.text.TtmlTextParser.timeHMSFormat_ =
    /^(?:(\d*\.?\d*)h)?(?:(\d*\.?\d*)m)?(?:(\d*\.?\d*)s)?(?:(\d*\.?\d*)ms)?$/;


/**
 * @const
 * @private {!RegExp}
 * @example 50% 10%
 */
shaka.text.TtmlTextParser.percentValues_ = /^(\d{1,2}|100)% (\d{1,2}|100)%$/;


/**
 * @const
 * @private {!RegExp}
 * @example 100px
 */
shaka.text.TtmlTextParser.unitValues_ = /^(\d+px|\d+em)$/;


/**
 * @const
 * @private {!Object}
 */
shaka.text.TtmlTextParser.textAlignToLineAlign_ = {
  'left': 'start',
  'center': 'center',
  'right': 'end',
  'start': 'start',
  'end': 'end'
};


/**
 * @const
 * @private {!Object}
 */
shaka.text.TtmlTextParser.textAlignToPositionAlign_ = {
  'left': 'line-left',
  'center': 'center',
  'right': 'line-right'
};


/**
 * Gets leaf nodes of the xml node tree. Ignores the text, br elements
 * and the spans positioned inside paragraphs
 *
 * @param {Element} element
 * @return {!Array.<!Element>}
 * @private
 */
shaka.text.TtmlTextParser.getLeafNodes_ = function(element) {
  var result = [];
  if (!element)
    return result;

  var childNodes = element.childNodes;
  for (var i = 0; i < childNodes.length; i++) {
    // Currently we don't support styles applicable to span
    // elements, so they are ignored
    var isSpanChildOfP = childNodes[i].nodeName == 'span' &&
        element.nodeName == 'p';
    if (childNodes[i].nodeType == Node.ELEMENT_NODE &&
        childNodes[i].nodeName != 'br' && !isSpanChildOfP) {
      // Get the leafs the child might contain
      goog.asserts.assert(childNodes[i] instanceof Element,
                          'Node should be Element!');
      var leafChildren = shaka.text.TtmlTextParser.getLeafNodes_(
          /** @type {Element} */(childNodes[i]));
      goog.asserts.assert(leafChildren.length > 0,
                          'Only a null Element should return no leaves!');
      result = result.concat(leafChildren);
    }
  }

  // if no result at this point, the element itself must be a leaf
  if (!result.length) {
    result.push(element);
  }
  return result;
};


/**
 * Insert \n where <br> tags are found
 *
 * @param {!Node} element
 * @param {boolean} whitespaceTrim
 * @private
 */
shaka.text.TtmlTextParser.addNewLines_ = function(element, whitespaceTrim) {
  var childNodes = element.childNodes;

  for (var i = 0; i < childNodes.length; i++) {
    if (childNodes[i].nodeName == 'br' && i > 0) {
      childNodes[i - 1].textContent += '\n';
    } else if (childNodes[i].childNodes.length > 0) {
      shaka.text.TtmlTextParser.addNewLines_(childNodes[i], whitespaceTrim);
    } else if (whitespaceTrim) {
      // Trim leading and trailing whitespace.
      var trimmed = childNodes[i].textContent.trim();
      // Collapse multiple spaces into one.
      trimmed = trimmed.replace(/\s+/g, ' ');

      childNodes[i].textContent = trimmed;
    }
  }
};


/**
 * Parses an Element into a TextTrackCue or VTTCue.
 *
 * @param {!Element} cueElement
 * @param {number} offset
 * @param {!shaka.text.TtmlTextParser.RateInfo_} rateInfo
 * @param {!Array.<!Element>} styles
 * @param {!Array.<!Element>} regions
 * @param {boolean} whitespaceTrim
 * @return {shaka.text.Cue}
 * @private
 */
shaka.text.TtmlTextParser.parseCue_ = function(
    cueElement, offset, rateInfo, styles, regions, whitespaceTrim) {

  // Disregard empty elements:
  // TTML allows for empty elements like <div></div>.
  // If cueElement has neither time attributes, nor
  // non-whitespace text, don't try to make a cue out of it.
  if (!cueElement.hasAttribute('begin') &&
      !cueElement.hasAttribute('end') &&
      /^\s*$/.test(cueElement.textContent))
    return null;

  shaka.text.TtmlTextParser.addNewLines_(cueElement, whitespaceTrim);

  // Get time
  var start = shaka.text.TtmlTextParser.parseTime_(
      cueElement.getAttribute('begin'), rateInfo);
  var end = shaka.text.TtmlTextParser.parseTime_(
      cueElement.getAttribute('end'), rateInfo);
  var duration = shaka.text.TtmlTextParser.parseTime_(
      cueElement.getAttribute('dur'), rateInfo);
  var payload = cueElement.textContent;

  if (end == null && duration != null)
    end = start + duration;

  if (start == null || end == null) {
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.INVALID_TEXT_CUE);
  }

  start += offset;
  end += offset;

  var cue = new shaka.text.Cue(start, end, payload);

  // Get other properties if available
  var region = shaka.text.TtmlTextParser.getElementFromCollection_(
      cueElement, 'region', regions);
  shaka.text.TtmlTextParser.addStyle_(cue, cueElement, region, styles);

  return cue;
};


/**
 * Adds applicable style properties to a cue.
 *
 * @param {!shaka.text.Cue} cue
 * @param {!Element} cueElement
 * @param {Element} region
 * @param {!Array.<!Element>} styles
 * @private
 */
shaka.text.TtmlTextParser.addStyle_ = function(
    cue, cueElement, region, styles) {
  var TtmlTextParser = shaka.text.TtmlTextParser;
  var Cue = shaka.text.Cue;

  var results = null;

  var direction = TtmlTextParser.getStyleAttribute_(
      cueElement, region, styles, 'tts:direction');
  if (direction == 'rtl')
    cue.writingDirection = Cue.writingDirection.HORIZONTAL_RIGHT_TO_LEFT;

  // Direction attribute specifies one-dimentional writing direction
  // (left to right or right to left). Writing mode specifies that
  // plus whether text is vertical or horizontal.
  // They should not contradict each other. If they do, we give
  // preference to writing mode.
  var writingMode = TtmlTextParser.getStyleAttribute_(
      cueElement, region, styles, 'tts:writingMode');
  if (writingMode == 'tb' || writingMode == 'tblr')
    cue.writingDirection = Cue.writingDirection.VERTICAL_LEFT_TO_RIGHT;
  else if (writingMode == 'tbrl')
    cue.writingDirection = Cue.writingDirection.VERTICAL_RIGHT_TO_LEFT;
  else if (writingMode == 'rltb' || writingMode == 'rl')
    cue.writingDirection = Cue.writingDirection.HORIZONTAL_RIGHT_TO_LEFT;
  else if (writingMode)
    cue.writingDirection = Cue.writingDirection.HORIZONTAL_LEFT_TO_RIGHT;

  var origin = TtmlTextParser.getStyleAttribute_(
      cueElement, region, styles, 'tts:origin');
  if (origin) {
    results = TtmlTextParser.percentValues_.exec(origin);
    if (results != null) {
      cue.region.x = Number(results[1]);
      cue.region.y = Number(results[2]);
    }
  }

  var extent = TtmlTextParser.getStyleAttribute_(
      cueElement, region, styles, 'tts:extent');
  if (extent) {
    results = TtmlTextParser.percentValues_.exec(extent);
    if (results != null) {
      cue.region.width = Number(results[1]);
      cue.region.height = Number(results[2]);
    }
  }

  var align = TtmlTextParser.getStyleAttribute_(
      cueElement, region, styles, 'tts:textAlign');
  if (align) {
    cue.positionAlign = TtmlTextParser.textAlignToPositionAlign_[align];
    cue.lineAlign = TtmlTextParser.textAlignToLineAlign_[align];

    goog.asserts.assert(align.toUpperCase() in Cue.textAlign,
                        align.toUpperCase() +
                        ' Should be in Cue.textAlign values!');

    cue.textAlign = Cue.textAlign[align.toUpperCase()];
  }

  var displayAlign = TtmlTextParser.getStyleAttribute_(
      cueElement, region, styles, 'tts:displayAlign');
  if (displayAlign) {
    goog.asserts.assert(displayAlign.toUpperCase() in Cue.displayAlign,
                        displayAlign.toUpperCase() +
                        ' Should be in Cue.displayAlign values!');
    cue.displayAlign = Cue.displayAlign[displayAlign.toUpperCase()];
  }

  var color = TtmlTextParser.getStyleAttribute_(
      cueElement, region, styles, 'tts:color');
  if (color)
    cue.color = color;

  var backgroundColor = TtmlTextParser.getStyleAttribute_(
      cueElement, region, styles, 'tts:backgroundColor');
  if (backgroundColor)
    cue.backgroundColor = backgroundColor;

  var fontFamily = TtmlTextParser.getStyleAttribute_(
      cueElement, region, styles, 'tts:fontFamily');
  if (fontFamily)
    cue.fontFamily = fontFamily;

  var fontWeight = TtmlTextParser.getStyleAttribute_(
      cueElement, region, styles, 'tts:fontWeight');
  if (fontWeight && fontWeight == 'bold')
    cue.fontWeight = Cue.fontWeight.BOLD;

  var wrapOption = TtmlTextParser.getStyleAttribute_(
      cueElement, region, styles, 'tts:wrapOption');
  if (wrapOption && wrapOption == 'noWrap')
    cue.wrapLine = false;

  var lineHeight = TtmlTextParser.getStyleAttribute_(
      cueElement, region, styles, 'tts:lineHeight');
  if (lineHeight && lineHeight.match(TtmlTextParser.unitValues_))
    cue.lineHeight = lineHeight;

  var fontSize = TtmlTextParser.getStyleAttribute_(
      cueElement, region, styles, 'tts:fontSize');
  if (fontSize && fontSize.match(TtmlTextParser.unitValues_))
    cue.fontSize = fontSize;

  var fontStyle = TtmlTextParser.getStyleAttribute_(
      cueElement, region, styles, 'tts:fontStyle');
  if (fontStyle) {
    goog.asserts.assert(fontStyle.toUpperCase() in Cue.fontStyle,
                        fontStyle.toUpperCase() +
                        ' Should be in Cue.fontStyle values!');
    cue.fontStyle = Cue.fontStyle[fontStyle.toUpperCase()];
  }

  // Text decoration is an array of values which can come both
  // from the element's style or be inherited from elements'
  // parent nodes. All of those values should be applied as long
  // as they don't contradict each other. If they do, elements'
  // own style gets preference.
  var textDecorationRegion = TtmlTextParser.getStyleAttributeFromRegion_(
      region, styles, 'tts:textDecoration');
  if (textDecorationRegion)
    TtmlTextParser.addTextDecoration_(cue, textDecorationRegion);

  var textDecorationElement = TtmlTextParser.getStyleAttributeFromElement_(
      cueElement, styles, 'tts:textDecoration');
  if (textDecorationElement)
    TtmlTextParser.addTextDecoration_(cue, textDecorationElement);
};


/**
 * Parses text decoration values and adds/removes them to/from the cue.
 *
 * @param {!shaka.text.Cue} cue
 * @param {string} decoration
 * @private
 */
shaka.text.TtmlTextParser.addTextDecoration_ = function(cue, decoration) {
  var Cue = shaka.text.Cue;
  var values = decoration.split(' ');
  for (var i = 0; i < values.length; i++) {
    switch (values[i]) {
      case 'underline':
        if (cue.textDecoration.indexOf(Cue.textDecoration.UNDERLINE) < 0)
          cue.textDecoration.push(Cue.textDecoration.UNDERLINE);
        break;
      case 'noUnderline':
        if (cue.textDecoration.indexOf(Cue.textDecoration.UNDERLINE) >= 0) {
          shaka.util.ArrayUtils.remove(cue.textDecoration,
                                       Cue.textDecoration.UNDERLINE);
        }
        break;
      case 'lineThrough':
        if (cue.textDecoration.indexOf(Cue.textDecoration.LINE_THROUGH) < 0)
          cue.textDecoration.push(Cue.textDecoration.LINE_THROUGH);
        break;
      case 'noLineThrough':
        if (cue.textDecoration.indexOf(Cue.textDecoration.LINE_THROUGH) >= 0) {
          shaka.util.ArrayUtils.remove(cue.textDecoration,
                                       Cue.textDecoration.LINE_THROUGH);
        }
        break;
      case 'overline':
        if (cue.textDecoration.indexOf(Cue.textDecoration.OVERLINE) < 0)
          cue.textDecoration.push(Cue.textDecoration.OVERLINE);
        break;
      case 'noOverline':
        if (cue.textDecoration.indexOf(Cue.textDecoration.OVERLINE) >= 0) {
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
  var TtmlTextParser = shaka.text.TtmlTextParser;
  var attr = TtmlTextParser.getStyleAttributeFromElement_(
      cueElement, styles, attribute);
  if (attr)
    return attr;

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
  var regionChildren = shaka.text.TtmlTextParser.getLeafNodes_(region);
  for (var i = 0; i < regionChildren.length; i++) {
    var attr = regionChildren[i].getAttribute(attribute);
    if (attr)
      return attr;
  }

  var style = shaka.text.TtmlTextParser.getElementFromCollection_(
      region, 'style', styles);
  if (style)
    return style.getAttribute(attribute);
  return null;
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
  var getElementFromCollection_ =
      shaka.text.TtmlTextParser.getElementFromCollection_;
  var style = getElementFromCollection_(cueElement, 'style', styles);
  if (style)
    return style.getAttribute(attribute);
  return null;
};


/**
 * Selects an item from |collection| whose id matches |attributeName|
 * from |element|.
 *
 * @param {Element} element
 * @param {string} attributeName
 * @param {!Array.<Element>} collection
 * @return {Element}
 * @private
 */
shaka.text.TtmlTextParser.getElementFromCollection_ = function(
    element, attributeName, collection) {
  if (!element || collection.length < 1) {
    return null;
  }
  var item = null;
  var itemName = shaka.text.TtmlTextParser.getInheritedAttribute_(
      element, attributeName);
  if (itemName) {
    for (var i = 0; i < collection.length; i++) {
      if (collection[i].getAttribute('xml:id') == itemName) {
        item = collection[i];
        break;
      }
    }
  }

  return item;
};


/**
 * Traverses upwards from a given node until a given attribute is found.
 *
 * @param {!Element} element
 * @param {string} attributeName
 * @return {?string}
 * @private
 */
shaka.text.TtmlTextParser.getInheritedAttribute_ = function(
    element, attributeName) {
  var ret = null;
  while (element) {
    ret = element.getAttribute(attributeName);
    if (ret) {
      break;
    }

    // Element.parentNode can lead to XMLDocument, which is not an Element and
    // has no getAttribute().
    var parentNode = element.parentNode;
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
  var ret = null;
  var TtmlTextParser = shaka.text.TtmlTextParser;

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
 * Parses a TTML time in frame format
 *
 * @param {!shaka.text.TtmlTextParser.RateInfo_} rateInfo
 * @param {string} text
 * @return {?number}
 * @private
 */
shaka.text.TtmlTextParser.parseFramesTime_ = function(rateInfo, text) {

  // 75f or 75.5f
  var results = shaka.text.TtmlTextParser.timeFramesFormat_.exec(text);
  var frames = Number(results[1]);

  return frames / rateInfo.frameRate;
};


/**
 * Parses a TTML time in tick format
 *
 * @param {!shaka.text.TtmlTextParser.RateInfo_} rateInfo
 * @param {string} text
 * @return {?number}
 * @private
 */
shaka.text.TtmlTextParser.parseTickTime_ = function(rateInfo, text) {

  // 50t or 50.5t
  var results = shaka.text.TtmlTextParser.timeTickFormat_.exec(text);
  var ticks = Number(results[1]);

  return ticks / rateInfo.tickRate;
};


/**
 * Parses a TTML colon formatted time containing frames
 *
 * @param {!shaka.text.TtmlTextParser.RateInfo_} rateInfo
 * @param {string} text
 * @return {?number}
 * @private
 */
shaka.text.TtmlTextParser.parseColonTimeWithFrames_ = function(
    rateInfo, text) {

  // 01:02:43:07 ('07' is frames) or 01:02:43:07.1 (subframes)
  var results = shaka.text.TtmlTextParser.timeColonFormatFrames_.exec(text);

  var hours = Number(results[1]);
  var minutes = Number(results[2]);
  var seconds = Number(results[3]);
  var frames = Number(results[4]);
  var subframes = Number(results[5]) || 0;

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
  var results = regex.exec(text);
  if (results == null || results[0] == '')
    return null;
  // This capture is optional, but will still be in the array as undefined,
  // default to 0.
  var hours = Number(results[1]) || 0;
  var minutes = Number(results[2]) || 0;
  var seconds = Number(results[3]) || 0;
  var miliseconds = Number(results[4]) || 0;

  return (miliseconds / 1000) + seconds + (minutes * 60) + (hours * 3600);
};



/**
 * Contains information about frame/subframe rate
 * and frame rate multiplier for time in frame format.
 * ex. 01:02:03:04(4 frames) or 01:02:03:04.1(4 frames, 1 subframe)
 *
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
    if (frameRate)
      this.tickRate = this.frameRate * this.subFrameRate;
    else
      this.tickRate = 1;
  }

  if (frameRateMultiplier) {
    var multiplierResults = /^(\d+) (\d+)$/g.exec(frameRateMultiplier);
    if (multiplierResults) {
      var numerator = multiplierResults[1];
      var denominator = multiplierResults[2];
      var multiplierNum = numerator / denominator;
      this.frameRate *= multiplierNum;
    }
  }
};


shaka.text.TextEngine.registerParser(
    'application/ttml+xml',
    shaka.text.TtmlTextParser);
