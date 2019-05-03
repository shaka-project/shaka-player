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

goog.require('shaka.log');
goog.require('shaka.util.StringUtils');


/**
 * @namespace shaka.util.XmlUtils
 * @summary A set of XML utility functions.
 */


/**
 * Finds a child XML element.
 * @param {!Node} elem The parent XML element.
 * @param {string} name The child XML element's tag name.
 * @return {Element} The child XML element, or null if a child XML element does
 *   not exist with the given tag name OR if there exists more than one
 *   child XML element with the given tag name.
 */
shaka.util.XmlUtils.findChild = function(elem, name) {
  let children = shaka.util.XmlUtils.findChildren(elem, name);
  if (children.length != 1) {
    return null;
  }
  return children[0];
};


/**
 * Finds a namespace-qualified child XML element.
 * @param {!Node} elem The parent XML element.
 * @param {string} ns The child XML element's namespace URI.
 * @param {string} name The child XML element's local name.
 * @return {Element} The child XML element, or null if a child XML element does
 *   not exist with the given tag name OR if there exists more than one
 *   child XML element with the given tag name.
 */
shaka.util.XmlUtils.findChildNS = function(elem, ns, name) {
  let children = shaka.util.XmlUtils.findChildrenNS(elem, ns, name);
  if (children.length != 1) {
    return null;
  }
  return children[0];
};


/**
 * Finds child XML elements.
 * @param {!Node} elem The parent XML element.
 * @param {string} name The child XML element's tag name.
 * @return {!Array.<!Element>} The child XML elements.
 */
shaka.util.XmlUtils.findChildren = function(elem, name) {
  return Array.prototype.filter.call(elem.childNodes, function(child) {
    return child instanceof Element && child.tagName == name;
  });
};


/**
 * Finds namespace-qualified child XML elements.
 * @param {!Node} elem The parent XML element.
 * @param {string} ns The child XML element's namespace URI.
 * @param {string} name The child XML element's local name.
 * @return {!Array.<!Element>} The child XML elements.
 */
shaka.util.XmlUtils.findChildrenNS = function(elem, ns, name) {
  return Array.prototype.filter.call(elem.childNodes, function(child) {
    return child instanceof Element && child.localName == name &&
        child.namespaceURI == ns;
  });
};


/**
 * Gets a namespace-qualified attribute.
 * @param {!Element} elem The element to get from.
 * @param {string} ns The namespace URI.
 * @param {string} name The local name of the attribute.
 * @return {?string} The attribute's value, or null if not present.
 */
shaka.util.XmlUtils.getAttributeNS = function(elem, ns, name) {
  // Some browsers return the empty string when the attribute is missing,
  // so check if it exists first.  See: https://mzl.la/2L7F0UK
  return elem.hasAttributeNS(ns, name) ? elem.getAttributeNS(ns, name) : null;
};


/**
 * Gets the text contents of a node.
 * @param {!Node} elem The XML element.
 * @return {?string} The text contents, or null if there are none.
 */
shaka.util.XmlUtils.getContents = function(elem) {
  let isText = (child) => {
    return child.nodeType == Node.TEXT_NODE ||
        child.nodeType == Node.CDATA_SECTION_NODE;
  };
  if (!Array.prototype.every.call(elem.childNodes, isText)) {
    return null;
  }

  // Read merged text content from all text nodes.
  return elem.textContent.trim();
};


/**
 * Parses an attribute by its name.
 * @param {!Element} elem The XML element.
 * @param {string} name The attribute name.
 * @param {function(string): (T|null)} parseFunction A function that parses
 *   the attribute.
 * @param {(T|null)=} defaultValue The attribute's default value, if not
 *   specified, the attibute's default value is null.
 * @return {(T|null)} The parsed attribute on success, or the attribute's
 *   default value if the attribute does not exist or could not be parsed.
 * @template T
 */
shaka.util.XmlUtils.parseAttr = function(
    elem, name, parseFunction, defaultValue = null) {
  let parsedValue = null;

  let value = elem.getAttribute(name);
  if (value != null) {
    parsedValue = parseFunction(value);
  }
  return parsedValue == null ? defaultValue : parsedValue;
};


/**
 * Parses an XML date string.
 * @param {string} dateString
 * @return {?number} The parsed date in seconds on success; otherwise, return
 *   null.
 */
shaka.util.XmlUtils.parseDate = function(dateString) {
  if (!dateString) {
    return null;
  }

  // Times in the manifest should be in UTC.  If they don't specify a timezone,
  // Date.parse() will use the local timezone instead of UTC.  So manually add
  // the timezone if missing ('Z' indicates the UTC timezone).
  // Format: YYYY-MM-DDThh:mm:ss.ssssss
  if (/^\d+-\d+-\d+T\d+:\d+:\d+(\.\d+)?$/.test(dateString)) {
    dateString += 'Z';
  }

  let result = Date.parse(dateString);
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
  if (!durationString) {
    return null;
  }

  let re = '^P(?:([0-9]*)Y)?(?:([0-9]*)M)?(?:([0-9]*)D)?' +
           '(?:T(?:([0-9]*)H)?(?:([0-9]*)M)?(?:([0-9.]*)S)?)?$';
  let matches = new RegExp(re).exec(durationString);

  if (!matches) {
    shaka.log.warning('Invalid duration string:', durationString);
    return null;
  }

  // Note: Number(null) == 0 but Number(undefined) == NaN.
  let years = Number(matches[1] || null);
  let months = Number(matches[2] || null);
  let days = Number(matches[3] || null);
  let hours = Number(matches[4] || null);
  let minutes = Number(matches[5] || null);
  let seconds = Number(matches[6] || null);

  // Assume a year always has 365 days and a month always has 30 days.
  let d = (60 * 60 * 24 * 365) * years +
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
  let matches = /([0-9]+)-([0-9]+)/.exec(rangeString);

  if (!matches) {
    return null;
  }

  let start = Number(matches[1]);
  if (!isFinite(start)) {
    return null;
  }

  let end = Number(matches[2]);
  if (!isFinite(end)) {
    return null;
  }

  return {start: start, end: end};
};


/**
 * Parses an integer.
 * @param {string} intString The integer string.
 * @return {?number} The parsed integer on success; otherwise, return null.
 */
shaka.util.XmlUtils.parseInt = function(intString) {
  let n = Number(intString);
  return (n % 1 === 0) ? n : null;
};


/**
 * Parses a positive integer.
 * @param {string} intString The integer string.
 * @return {?number} The parsed positive integer on success; otherwise,
 *   return null.
 */
shaka.util.XmlUtils.parsePositiveInt = function(intString) {
  let n = Number(intString);
  return (n % 1 === 0) && (n > 0) ? n : null;
};


/**
 * Parses a non-negative integer.
 * @param {string} intString The integer string.
 * @return {?number} The parsed non-negative integer on success; otherwise,
 *   return null.
 */
shaka.util.XmlUtils.parseNonNegativeInt = function(intString) {
  let n = Number(intString);
  return (n % 1 === 0) && (n >= 0) ? n : null;
};


/**
 * Parses a floating point number.
 * @param {string} floatString The floating point number string.
 * @return {?number} The parsed floating point number on success; otherwise,
 *   return null. May return -Infinity or Infinity.
 */
shaka.util.XmlUtils.parseFloat = function(floatString) {
  let n = Number(floatString);
  return !isNaN(n) ? n : null;
};


/**
 * Evaluate a division expressed as a string.
 * @param {string} exprString
 *   The expression to evaluate, e.g. "200/2". Can also be a single number.
 * @return {?number} The evaluated expression as floating point number on
 *   success; otherwise return null.
 */
shaka.util.XmlUtils.evalDivision = function(exprString) {
  let res;
  let n;
  if ((res = exprString.match(/^(\d+)\/(\d+)$/))) {
    n = Number(res[1]) / Number(res[2]);
  } else {
    n = Number(exprString);
  }
  return !isNaN(n) ? n : null;
};


/**
 * Parse a string and return the resulting root element if
 * it was valid XML.
 * @param {string} xmlString
 * @param {string} expectedRootElemName
 * @return {Element|undefined}
 */
shaka.util.XmlUtils.parseXmlString = function(xmlString, expectedRootElemName) {
  const parser = new DOMParser();
  let rootElem;
  let xml;
  try {
    xml = parser.parseFromString(xmlString, 'text/xml');
  } catch (exception) {}
  if (xml) {
    // The top-level element in the loaded xml should have the
    // same type as the element linking.
    if (xml.documentElement.tagName == expectedRootElemName) {
      rootElem = xml.documentElement;
    }
  }
  if (rootElem && rootElem.getElementsByTagName('parsererror').length > 0) {
    return null;
  }  // It had a parser error in it.

  return rootElem;
};


/**
 * Parse some UTF8 data and return the resulting root element if
 * it was valid XML.
 * @param {ArrayBuffer} data
 * @param {string} expectedRootElemName
 * @return {Element|undefined}
 */
shaka.util.XmlUtils.parseXml = function(data, expectedRootElemName) {
  try {
    const string = shaka.util.StringUtils.fromUTF8(data);
    return shaka.util.XmlUtils.parseXmlString(string, expectedRootElemName);
  } catch (exception) {}
};
