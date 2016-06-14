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

goog.require('shaka.media.TextEngine');
goog.require('shaka.util.Error');
goog.require('shaka.util.TextParser');


/**
 * @namespace
 * @summary A TextEngine plugin that parses TTML files.
 * @param {ArrayBuffer|ArrayBufferView} data
 * @return {!Array.<!TextTrackCue>}
 * @throws {shaka.util.Error}
 */
shaka.media.TtmlTextParser = function(data) {
  var str = shaka.util.StringUtils.fromBytesAutoDetect(data);
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
    // Try to get the framerate if applicable
    var frameRate = null;
    var tts = xml.getElementsByTagName('tt');
    var tt = tts[0];
    // TTML should always have tt element
    if (!tt) {
      throw new shaka.util.Error(
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_TTML);
    } else {
      frameRate = tt.getAttribute('ttp:frameRate');
    }

    var styles = shaka.media.TtmlTextParser.getLeafNodes_(
        tt.getElementsByTagName('styling')[0]);
    var regions = shaka.media.TtmlTextParser.getLeafNodes_(
        tt.getElementsByTagName('layout')[0]);
    var textNodes = shaka.media.TtmlTextParser.getLeafNodes_(
        tt.getElementsByTagName('body')[0]);

    for (var i = 0; i < textNodes.length; i++) {
      var cue = shaka.media.TtmlTextParser.parseCue_(
          textNodes[i], frameRate, styles, regions);
      if (cue) {
        ret.push(cue);
      }
    }
  }

  return ret;
};


/**
 * Gets leaf nodes of the xml node tree. Ignores the text, br elements
 * and the spans positioned inside paragraphs
 *
 * @param {Node} element
 * @return {!Array.<Node>}
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
      var leafChildren = shaka.media.TtmlTextParser.getLeafNodes_(
          childNodes[i]);
      if (leafChildren.length > 0) {
        result = result.concat(leafChildren);
      } else {
        // the node's a leaf itself
        result.push(childNodes[i]);
      }
    }
  }

  // if no result at this point, the element itself must be a leaf
  if (!result.length) {
    result.push(element);
  }
  return result;
};


/**
 * Parses an xml Element node into a Cue Element.
 *
 * @param {Node|Element} element
 * @param {?string} frameRate
 * @param {Array.<Element>} styles
 * @param {Array.<Element>} regions
 * @return {TextTrackCue} ret
 * @private
 */
shaka.media.TtmlTextParser.parseCue_ = function(
    element, frameRate, styles, regions) {

  // Get time
  var start = shaka.media.TtmlTextParser.parseTime_(
      element.getAttribute('begin'), frameRate);
  var end = shaka.media.TtmlTextParser.parseTime_(
      element.getAttribute('end'), frameRate);
  var payload = element.textContent;

  if (start == null || end == null) {
    throw new shaka.util.Error(
        shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.INVALID_TEXT_CUE);
  }

  var cue;
  if (window.VTTCue) {
    cue = new VTTCue(start, end, payload);

    // Get other properties if available
    var region = shaka.media.TtmlTextParser.getElementFromCollection_(
        element, 'region', regions);
    shaka.media.TtmlTextParser.addStyle_(cue, region, styles);
  } else {
    cue = new TextTrackCue(start, end, payload);
  }

  return cue;
};


/**
 * Adds applicable style properties to a cue (only align at the moment)
 *
 * @param {!VTTCue} cue
 * @param {Element} region
 * @param {Array<Element>} styles
 * @private
 */
shaka.media.TtmlTextParser.addStyle_ = function(cue, region, styles) {
  if (!region) {
    return;
  }

  var align;

  // region can have a style attribute or contain <style> nodes
  var style = shaka.media.TtmlTextParser.getElementFromCollection_(
      region, 'style', styles);
  if (style)
    align = style.getAttribute('tts:textAlign');

  // look for <style> nodes inside the region
  else {
    var regionChildren = shaka.media.TtmlTextParser.getLeafNodes_(region);
    for (var i = 0; i < regionChildren.length; i++) {
      align = regionChildren[i].getAttribute('tts:textAlign');
      if (align)
        break;
    }
  }
  if (align)
    cue.lineAlign = align;
};


/**
 * Selects an element from |collection| whose id matches |attributeName|
 * from |node|.
 *
 * @param {Node} node
 * @param {string} attributeName
 * @param {Array<Element>} collection
 * @return {Element} region
 * @private
 */
shaka.media.TtmlTextParser.getElementFromCollection_ = function(
    node, attributeName, collection) {
  if (!node || collection.length < 1) {
    return null;
  }
  var element = null;
  var elementName = shaka.media.TtmlTextParser.getInheritedAttribute_(
      node, attributeName);
  if (elementName) {
    for (var i = 0; i < collection.length; i++) {
      if (collection[i].getAttribute('xml:id') == elementName) {
        element = collection[i];
        break;
      }
    }
  }

  return element;
};


/**
 * Traverses upwards from a given node until a given attribute is found
 *
 * @param {?Node} element
 * @param {string} attributeName
 * @return {?string} region
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
    element = element.parentNode;
  }

  return ret;
};


/**
 * Parses a TTML time from the given word.
 *
 * @param {string} text
 * @param {?string} frameRate
 * @return {?number} ret
 * @private
 */
shaka.media.TtmlTextParser.parseTime_ = function(text, frameRate) {
  var ret = null;
  var parser = new shaka.util.TextParser(text);

  // 01:02:43:07 or 01:02:43:07.1
  var timeColonFormatFrames = /^(\d{2,}):(\d{2}):(\d{2}):(\d{2}(\.\d+)?)$/g;

  // 00:00:40 or 00:40
  var timeColonFormat = /(?:(\d{2,}):)?(\d{2}):(\d{2})$/g;

  // 01:02:43.0345555 or 02:43.03
  var timeColonFormatMilliseconds = /(?:(\d{2,}):)?(\d{2}):(\d{2})\.(\d{2,})/g;

  // 3.45h, 3m or 4.20s
  var timeHMSFormat =
      /(?:([0-9]*\.*[0-9]*)h)?(?:([0-9]*\.*[0-9]*)m)?(?:([0-9.]*\.*[0-9]*)s)?$/g;

  if (timeColonFormatFrames.test(text)) {
    ret = shaka.media.TtmlTextParser.parseTimeWithFrames_(parser, frameRate);
  } else if (timeColonFormat.test(text)) {
    ret = parser.parseTime(timeColonFormat);
  } else if (timeColonFormatMilliseconds.test(text)) {
    ret = parser.parseTime(timeColonFormatMilliseconds);
  } else if (timeHMSFormat.test(text)) {
    ret = parser.parseTime(timeHMSFormat);
  }

  return ret;
};


/**
 * Parses a TTML time containing frames
 *
 * @param {!shaka.util.TextParser} parser
 * @param {?string} frameRate
 * @return {?number}
 * @private
 */
shaka.media.TtmlTextParser.parseTimeWithFrames_ = function(
    parser, frameRate) {
  if (!frameRate)
    return null;

  var frameRateNum = Number(frameRate);
  // 01:02:43:07 ('07' is frames) or 01:02:43:07.1 (subframes)
  var results = parser.readRegex(/^(\d{2,}):(\d{2}):(\d{2}):(\d{2}(\.\d+)?)$/g);
  if (results == null)
    return null;

  var hours = Number(results[1]);
  var minutes = Number(results[2]);
  var seconds = Number(results[3]);
  var frames = Number(results[4]);

  var miliseconds = frames * frameRateNum;
  if (minutes > 59 || seconds > 59)
    return null;

  return (miliseconds / 1000) + seconds + (minutes * 60) + (hours * 3600);
};


shaka.media.TextEngine.registerParser(
    'application/ttml+xml', shaka.media.TtmlTextParser);
