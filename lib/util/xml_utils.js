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

goog.provide('shaka.util.XmlUtils');

goog.require('goog.asserts');
goog.require('shaka.log');


/**
 * @namespace shaka.util.XmlUtils
 * @summary A set of XML utility functions.
 */


/**
 * Finds a child XML element.
 * @param {!Element} elem The parent XML element.
 * @param {string} name The child XML element's tag name.
 * @return {Element} The child XML element, or null if a child XML element does
 *   not exist with the given tag name OR if there exists more than one
 *   child XML element with the given tag name.
 */
shaka.util.XmlUtils.findChild = function(elem, name) {
  var children = shaka.util.XmlUtils.findChildren(elem, name);
  if (children.length != 1)
    return null;
  return children[0];
};


/**
 * Finds child XML elements.
 * @param {!Element} elem The parent XML element.
 * @param {string} name The child XML element's tag name.
 * @return {!Array.<!Element>} The child XML elements.
 */
shaka.util.XmlUtils.findChildren = function(elem, name) {
  return Array.prototype.filter.call(elem.childNodes, function(child) {
    goog.asserts.assert(
        child.tagName != name || child instanceof Element,
        'child element should be an Element');
    return child.tagName == name;
  });
};


/**
 * Gets the text contents of a node.
 * @param {!Element} elem The XML element.
 * @return {?string} The text contents, or null if there are none.
 */
shaka.util.XmlUtils.getContents = function(elem) {
  var contents = elem.firstChild;
  if (!contents || contents.nodeType != Node.TEXT_NODE)
    return null;

  return contents.nodeValue.trim();
};


/**
 * Parses an attribute by its name.
 * @param {!Element} elem The XML element.
 * @param {string} name The attribute name.
 * @param {function(string): (T|null)} parseFunction A function that parses
 *   the attribute.
 * @param {(T|null)=} opt_defaultValue The attribute's default value, if not
 *   specified, the attibute's default value is null.
 * @return {(T|null)} The parsed attribute on success, or the attribute's
 *   default value if the attribute does not exist or could not be parsed.
 * @template T
 */
shaka.util.XmlUtils.parseAttr = function(
    elem, name, parseFunction, opt_defaultValue) {
  var parsedValue = null;

  var value = elem.getAttribute(name);
  if (value != null)
    parsedValue = parseFunction(value);

  if (parsedValue == null)
    return opt_defaultValue !== undefined ? opt_defaultValue : null;

  return parsedValue;
};


/**
 * Parses an XML date string.
 * @param {string} dateString
 * @return {?number} The parsed date in seconds on success; otherwise, return
 *   null.
 */
shaka.util.XmlUtils.parseDate = function(dateString) {
  if (!dateString)
    return null;

  var result = Date.parse(dateString);
  return (!isNaN(result) ? Math.floor(result / 1000.0) : null);
};


/**
 * Parses an XML duration string.
 * Negative values are not supported. Years and months are treated as exactly
 * 365 and 30 days respectively.
 * @param {string} durationString The duration string, e.g., "PT1H3M43.2S",
 *   which means 1 hour, 3 minutes, and 43.2 seconds.
 * @return {?number} The parsed duration in seconds on success; otherwise,
 *   return null.
 * @see {@link http://www.datypic.com/sc/xsd/t-xsd_duration.html}
 */
shaka.util.XmlUtils.parseDuration = function(durationString) {
  if (!durationString)
    return null;

  var re = '^P(?:([0-9]*)Y)?(?:([0-9]*)M)?(?:([0-9]*)D)?' +
           '(?:T(?:([0-9]*)H)?(?:([0-9]*)M)?(?:([0-9.]*)S)?)?$';
  var matches = new RegExp(re).exec(durationString);

  if (!matches) {
    shaka.log.warning('Invalid duration string:', durationString);
    return null;
  }

  // Note: Number(null) == 0 but Number(undefined) == NaN.
  var years = Number(matches[1] || null);
  var months = Number(matches[2] || null);
  var days = Number(matches[3] || null);
  var hours = Number(matches[4] || null);
  var minutes = Number(matches[5] || null);
  var seconds = Number(matches[6] || null);

  // Assume a year always has 365 days and a month always has 30 days.
  var d = (60 * 60 * 24 * 365) * years +
          (60 * 60 * 24 * 30) * months +
          (60 * 60 * 24) * days +
          (60 * 60) * hours +
          60 * minutes +
          seconds;
  return isFinite(d) ? d : null;
};


/**
 * Parses a range string.
 * @param {string} rangeString The range string, e.g., "101-9213".
 * @return {?{start: number, end: number}} The parsed range on success;
 *   otherwise, return null.
 */
shaka.util.XmlUtils.parseRange = function(rangeString) {
  var matches = /([0-9]+)-([0-9]+)/.exec(rangeString);

  if (!matches)
    return null;

  var start = Number(matches[1]);
  if (!isFinite(start))
    return null;

  var end = Number(matches[2]);
  if (!isFinite(end))
    return null;

  return {start: start, end: end};
};


/**
 * Parses an integer.
 * @param {string} intString The integer string.
 * @return {?number} The parsed integer on success; otherwise, return null.
 */
shaka.util.XmlUtils.parseInt = function(intString) {
  var n = Number(intString);
  return (n % 1 === 0) ? n : null;
};


/**
 * Parses a positive integer.
 * @param {string} intString The integer string.
 * @return {?number} The parsed positive integer on success; otherwise,
 *   return null.
 */
shaka.util.XmlUtils.parsePositiveInt = function(intString) {
  var n = Number(intString);
  return (n % 1 === 0) && (n > 0) ? n : null;
};


/**
 * Parses a non-negative integer.
 * @param {string} intString The integer string.
 * @return {?number} The parsed non-negative integer on success; otherwise,
 *   return null.
 */
shaka.util.XmlUtils.parseNonNegativeInt = function(intString) {
  var n = Number(intString);
  return (n % 1 === 0) && (n >= 0) ? n : null;
};


/**
 * Parses a floating point number.
 * @param {string} floatString The floating point number string.
 * @return {?number} The parsed floating point number on success; otherwise,
 *   return null. May return -Infinity or Infinity.
 */
shaka.util.XmlUtils.parseFloat = function(floatString) {
  var n = Number(floatString);
  return !isNaN(n) ? n : null;
};


/**
 * Evaluate a division expressed as a string
 * @param {string} exprString
 *   The expression to evaluate, e.g. "200/2". Can also be a single number
 * @return {?number} The evaluated expression as floating point number on
 *   success; otherwise return null.
 */
shaka.util.XmlUtils.evalDivision = function(exprString) {
  var res;
  var n;
  if (res = exprString.match(/^(\d+)\/(\d+)$/)) {
    n = Number(res[1] / res[2]);
  } else {
    n = Number(exprString);
  }
  return !isNaN(n) ? n : null;
};
