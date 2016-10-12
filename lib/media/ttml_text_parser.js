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

goog.provide('shaka.media.TtmlTextParser');

goog.require('goog.asserts');
goog.require('shaka.media.TextEngine');
goog.require('shaka.util.Error');
goog.require('shaka.util.StringUtils');


/**
 * @namespace
 * @summary A TextEngine plugin that parses TTML files.
 * @param {ArrayBuffer} data
 * @param {number} offset
 * @param {?number} segmentStartTime
 * @param {?number} segmentEndTime
 * @param {boolean} useRelativeCueTimestamps Only used by the VTT parser
 * @return {!Array.<!TextTrackCue>}
 * @throws {shaka.util.Error}
 */
shaka.media.TtmlTextParser =
    function(data, offset, segmentStartTime,
             segmentEndTime, useRelativeCueTimestamps) {

  var str = shaka.util.StringUtils.fromUTF8(data);
  var ret = [];
  var parser = new DOMParser();
  var xml = null;

  try {
    xml = parser.parseFromString(str, 'text/xml');
  } catch (exception) {
    throw new shaka.util.Error(
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
    var tts = xml.getElementsByTagName('tt');
    var tt = tts[0];
    // TTML should always have tt element
    if (!tt) {
      throw new shaka.util.Error(
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_TTML);
    } else {
      frameRate = tt.getAttribute('ttp:frameRate');
      subFrameRate = tt.getAttribute('ttp:subFrameRate');
      frameRateMultiplier = tt.getAttribute('ttp:frameRateMultiplier');
      tickRate = tt.getAttribute('ttp:tickRate');
    }

    var rateInfo = new shaka.media.TtmlTextParser.RateInfo_(
        frameRate, subFrameRate, frameRateMultiplier, tickRate);

    var styles = shaka.media.TtmlTextParser.getLeafNodes_(
        tt.getElementsByTagName('styling')[0]);
    var regions = shaka.media.TtmlTextParser.getLeafNodes_(
        tt.getElementsByTagName('layout')[0]);
    var textNodes = shaka.media.TtmlTextParser.getLeafNodes_(
        tt.getElementsByTagName('body')[0]);

    for (var i = 0; i < textNodes.length; i++) {
      var cue = shaka.media.TtmlTextParser.parseCue_(
          textNodes[i], offset, rateInfo, styles, regions);
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
shaka.media.TtmlTextParser.timeColonFormatFrames_ =
    /^(\d{2,}):(\d{2}):(\d{2}):(\d{2})\.?(\d+)?$/;


/**
 * @const
 * @private {!RegExp}
 * @example 00:00:40 or 00:40
 */
shaka.media.TtmlTextParser.timeColonFormat_ =
    /^(?:(\d{2,}):)?(\d{2}):(\d{2})$/;


/**
 * @const
 * @private {!RegExp}
 * example 01:02:43.0345555 or 02:43.03
 */
shaka.media.TtmlTextParser.timeColonFormatMilliseconds_ =
    /^(?:(\d{2,}):)?(\d{2}):(\d{2}\.\d{2,})$/;


/**
 * @const
 * @private {!RegExp}
 * @example 75f or 75.5f
 */
shaka.media.TtmlTextParser.timeFramesFormat_ = /^(\d*\.?\d*)f$/;


/**
 * @const
 * @private {!RegExp}
 * @example 50t or 50.5t
 */
shaka.media.TtmlTextParser.timeTickFormat_ = /^(\d*\.?\d*)t$/;


/**
 * @const
 * @private {!RegExp}
 * @example 3.45h, 3m or 4.20s
 */
shaka.media.TtmlTextParser.timeHMSFormat_ =
    /^(?:(\d*\.?\d*)h)?(?:(\d*\.?\d*)m)?(?:(\d*\.?\d*)s)?(?:(\d*\.?\d*)ms)?$/;


/**
 * @const
 * @private {!RegExp}
 * @example 50% 10%
 */
shaka.media.TtmlTextParser.percentValues_ = /^(\d{1,2}|100)% (\d{1,2}|100)%$/;


/**
 * Gets leaf nodes of the xml node tree. Ignores the text, br elements
 * and the spans positioned inside paragraphs
 *
 * @param {Element} element
 * @return {!Array.<!Element>}
 * @private
 */
shaka.media.TtmlTextParser.getLeafNodes_ = function(element) {
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
      var leafChildren = shaka.media.TtmlTextParser.getLeafNodes_(
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
 * Parses an Element into a TextTrackCue or VTTCue.
 *
 * @param {!Element} cueElement
 * @param {number} offset
 * @param {!shaka.media.TtmlTextParser.RateInfo_} rateInfo
 * @param {!Array.<!Element>} styles
 * @param {!Array.<!Element>} regions
 * @return {TextTrackCue}
 * @private
 */
shaka.media.TtmlTextParser.parseCue_ = function(
    cueElement, offset, rateInfo, styles, regions) {

  // Disregard empty elements:
  // TTML allows for empty elements like <div></div>.
  // If cueElement has neither time attributes, nor text,
  // don't try to make a cue out of it.
  if (!cueElement.hasAttribute('begin') &&
      !cueElement.hasAttribute('end') &&
      cueElement.textContent == '')
    return null;

  // Get time
  var start = shaka.media.TtmlTextParser.parseTime_(
      cueElement.getAttribute('begin'), rateInfo);
  var end = shaka.media.TtmlTextParser.parseTime_(
      cueElement.getAttribute('end'), rateInfo);
  var duration = shaka.media.TtmlTextParser.parseTime_(
      cueElement.getAttribute('dur'), rateInfo);
  var payload = cueElement.textContent;

  if (end == null && duration != null)
    end = start + duration;

  if (start == null || end == null) {
    throw new shaka.util.Error(
        shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.INVALID_TEXT_CUE);
  }

  start += offset;
  end += offset;

  var cue = shaka.media.TextEngine.makeCue(start, end, payload);
  if (!cue)
    return null;

  // Get other properties if available
  var region = shaka.media.TtmlTextParser.getElementFromCollection_(
      cueElement, 'region', regions);
  shaka.media.TtmlTextParser.addStyle_(cue, cueElement, region, styles);

  return cue;
};


/**
 * Adds applicable style properties to a cue.
 *
 * @param {!TextTrackCue} cue
 * @param {!Element} cueElement
 * @param {Element} region
 * @param {!Array.<!Element>} styles
 * @private
 */
shaka.media.TtmlTextParser.addStyle_ = function(
    cue, cueElement, region, styles) {
  var TtmlTextParser = shaka.media.TtmlTextParser;
  var results = null;

  var align = TtmlTextParser.getStyleAttribute_(
      cueElement, region, styles, 'tts:textAlign');
  if (align)
    cue.lineAlign = align;

  var extent = TtmlTextParser.getStyleAttribute_(
      cueElement, region, styles, 'tts:extent');
  if (extent) {
    results = TtmlTextParser.percentValues_.exec(extent);
    if (results != null) {
      // Use width value of the extent attribute for size.
      // Height value is ignored.
      cue.size = Number(results[1]);
    }
  }

  var writingMode = TtmlTextParser.getStyleAttribute_(
      cueElement, region, styles, 'tts:writingMode');
  var isVerticalText = true;
  if (writingMode == 'tb' || writingMode == 'tblr')
    cue.vertical = 'lr';
  else if (writingMode == 'tbrl')
    cue.vertical = 'rl';
  else
    isVerticalText = false;

  var origin = TtmlTextParser.getStyleAttribute_(
      cueElement, region, styles, 'tts:origin');
  if (origin) {
    results = TtmlTextParser.percentValues_.exec(origin);
    if (results != null) {
      // for vertical text use first coordinate of tts:origin
      // to represent line of the cue and second - for position.
      // Otherwise (horizontal), use them the other way around.
      if (isVerticalText) {
        cue.position = Number(results[2]);
        cue.line = Number(results[1]);
      } else {
        cue.position = Number(results[1]);
        cue.line = Number(results[2]);
      }
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
shaka.media.TtmlTextParser.getStyleAttribute_ = function(
    cueElement, region, styles, attribute) {

  // An attribute can be specified on region level or in a styling block
  // associated with the region or original element.
  var regionChildren = shaka.media.TtmlTextParser.getLeafNodes_(region);
  for (var i = 0; i < regionChildren.length; i++) {
    var attr = regionChildren[i].getAttribute(attribute);
    if (attr)
      return attr;
  }

  var getElementFromCollection_ =
      shaka.media.TtmlTextParser.getElementFromCollection_;
  var style = getElementFromCollection_(region, 'style', styles) ||
              getElementFromCollection_(cueElement, 'style', styles);
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
shaka.media.TtmlTextParser.getElementFromCollection_ = function(
    element, attributeName, collection) {
  if (!element || collection.length < 1) {
    return null;
  }
  var item = null;
  var itemName = shaka.media.TtmlTextParser.getInheritedAttribute_(
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
shaka.media.TtmlTextParser.getInheritedAttribute_ = function(
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
 * @param {!shaka.media.TtmlTextParser.RateInfo_} rateInfo
 * @return {?number}
 * @private
 */
shaka.media.TtmlTextParser.parseTime_ = function(text, rateInfo) {
  var ret = null;
  var TtmlTextParser = shaka.media.TtmlTextParser;

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
 * @param {!shaka.media.TtmlTextParser.RateInfo_} rateInfo
 * @param {string} text
 * @return {?number}
 * @private
 */
shaka.media.TtmlTextParser.parseFramesTime_ = function(rateInfo, text) {

  // 75f or 75.5f
  var results = shaka.media.TtmlTextParser.timeFramesFormat_.exec(text);
  var frames = Number(results[1]);

  return frames / rateInfo.frameRate;
};


/**
 * Parses a TTML time in tick format
 *
 * @param {!shaka.media.TtmlTextParser.RateInfo_} rateInfo
 * @param {string} text
 * @return {?number}
 * @private
 */
shaka.media.TtmlTextParser.parseTickTime_ = function(rateInfo, text) {

  // 50t or 50.5t
  var results = shaka.media.TtmlTextParser.timeTickFormat_.exec(text);
  var ticks = Number(results[1]);

  return ticks / rateInfo.tickRate;
};


/**
 * Parses a TTML colon formatted time containing frames
 *
 * @param {!shaka.media.TtmlTextParser.RateInfo_} rateInfo
 * @param {string} text
 * @return {?number}
 * @private
 */
shaka.media.TtmlTextParser.parseColonTimeWithFrames_ = function(
    rateInfo, text) {

  // 01:02:43:07 ('07' is frames) or 01:02:43:07.1 (subframes)
  var results = shaka.media.TtmlTextParser.timeColonFormatFrames_.exec(text);

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
shaka.media.TtmlTextParser.parseTimeFromRegex_ = function(regex, text) {
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
shaka.media.TtmlTextParser.RateInfo_ = function(
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


shaka.media.TextEngine.registerParser(
    'application/ttml+xml', shaka.media.TtmlTextParser);
