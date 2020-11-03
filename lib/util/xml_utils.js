/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.XmlUtils');

goog.require('shaka.log');
goog.require('shaka.util.StringUtils');


/**
 * @summary A set of XML utility functions.
 */
shaka.util.XmlUtils = class {
  /**
   * Finds a child XML element.
   * @param {!Node} elem The parent XML element.
   * @param {string} name The child XML element's tag name.
   * @return {Element} The child XML element, or null if a child XML element
   *   does not exist with the given tag name OR if there exists more than one
   *   child XML element with the given tag name.
   */
  static findChild(elem, name) {
    const children = shaka.util.XmlUtils.findChildren(elem, name);
    if (children.length != 1) {
      return null;
    }
    return children[0];
  }


  /**
   * Finds a namespace-qualified child XML element.
   * @param {!Node} elem The parent XML element.
   * @param {string} ns The child XML element's namespace URI.
   * @param {string} name The child XML element's local name.
   * @return {Element} The child XML element, or null if a child XML element
   *   does not exist with the given tag name OR if there exists more than one
   *   child XML element with the given tag name.
   */
  static findChildNS(elem, ns, name) {
    const children = shaka.util.XmlUtils.findChildrenNS(elem, ns, name);
    if (children.length != 1) {
      return null;
    }
    return children[0];
  }


  /**
   * Finds child XML elements.
   * @param {!Node} elem The parent XML element.
   * @param {string} name The child XML element's tag name.
   * @return {!Array.<!Element>} The child XML elements.
   */
  static findChildren(elem, name) {
    return Array.from(elem.childNodes).filter((child) => {
      return child instanceof Element && child.tagName == name;
    });
  }


  /**
   * @param {!Node} elem the parent XML element.
   * @return {!Array.<!Element>} The child XML elements.
   */
  static getChildren(elem) {
    return Array.from(elem.childNodes).filter((child) => {
      return child instanceof Element;
    });
  }


  /**
   * Finds namespace-qualified child XML elements.
   * @param {!Node} elem The parent XML element.
   * @param {string} ns The child XML element's namespace URI.
   * @param {string} name The child XML element's local name.
   * @return {!Array.<!Element>} The child XML elements.
   */
  static findChildrenNS(elem, ns, name) {
    return Array.from(elem.childNodes).filter((child) => {
      return child instanceof Element && child.localName == name &&
          child.namespaceURI == ns;
    });
  }


  /**
   * Gets a namespace-qualified attribute.
   * @param {!Element} elem The element to get from.
   * @param {string} ns The namespace URI.
   * @param {string} name The local name of the attribute.
   * @return {?string} The attribute's value, or null if not present.
   */
  static getAttributeNS(elem, ns, name) {
    // Some browsers return the empty string when the attribute is missing,
    // so check if it exists first.  See: https://mzl.la/2L7F0UK
    return elem.hasAttributeNS(ns, name) ? elem.getAttributeNS(ns, name) : null;
  }


  /**
   * Gets the text contents of a node.
   * @param {!Node} elem The XML element.
   * @return {?string} The text contents, or null if there are none.
   */
  static getContents(elem) {
    const XmlUtils = shaka.util.XmlUtils;
    if (!Array.from(elem.childNodes).every(XmlUtils.isText)) {
      return null;
    }

    // Read merged text content from all text nodes.
    return elem.textContent.trim();
  }

  /**
   * Checks if a node is of type text.
   * @param {!Node} elem The XML element.
   * @return {boolean} True if it is a text node.
   */
  static isText(elem) {
    return elem.nodeType == Node.TEXT_NODE ||
        elem.nodeType == Node.CDATA_SECTION_NODE;
  }

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
  static parseAttr(
      elem, name, parseFunction, defaultValue = null) {
    let parsedValue = null;

    const value = elem.getAttribute(name);
    if (value != null) {
      parsedValue = parseFunction(value);
    }
    return parsedValue == null ? defaultValue : parsedValue;
  }


  /**
   * Parses an XML date string.
   * @param {string} dateString
   * @return {?number} The parsed date in seconds on success; otherwise, return
   *   null.
   */
  static parseDate(dateString) {
    if (!dateString) {
      return null;
    }

    // Times in the manifest should be in UTC. If they don't specify a timezone,
    // Date.parse() will use the local timezone instead of UTC.  So manually add
    // the timezone if missing ('Z' indicates the UTC timezone).
    // Format: YYYY-MM-DDThh:mm:ss.ssssss
    if (/^\d+-\d+-\d+T\d+:\d+:\d+(\.\d+)?$/.test(dateString)) {
      dateString += 'Z';
    }

    const result = Date.parse(dateString);
    return (!isNaN(result) ? Math.floor(result / 1000.0) : null);
  }


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
  static parseDuration(durationString) {
    if (!durationString) {
      return null;
    }

    const re = '^P(?:([0-9]*)Y)?(?:([0-9]*)M)?(?:([0-9]*)D)?' +
             '(?:T(?:([0-9]*)H)?(?:([0-9]*)M)?(?:([0-9.]*)S)?)?$';
    const matches = new RegExp(re).exec(durationString);

    if (!matches) {
      shaka.log.warning('Invalid duration string:', durationString);
      return null;
    }

    // Note: Number(null) == 0 but Number(undefined) == NaN.
    const years = Number(matches[1] || null);
    const months = Number(matches[2] || null);
    const days = Number(matches[3] || null);
    const hours = Number(matches[4] || null);
    const minutes = Number(matches[5] || null);
    const seconds = Number(matches[6] || null);

    // Assume a year always has 365 days and a month always has 30 days.
    const d = (60 * 60 * 24 * 365) * years +
            (60 * 60 * 24 * 30) * months +
            (60 * 60 * 24) * days +
            (60 * 60) * hours +
            60 * minutes +
            seconds;
    return isFinite(d) ? d : null;
  }


  /**
   * Parses a range string.
   * @param {string} rangeString The range string, e.g., "101-9213".
   * @return {?{start: number, end: number}} The parsed range on success;
   *   otherwise, return null.
   */
  static parseRange(rangeString) {
    const matches = /([0-9]+)-([0-9]+)/.exec(rangeString);

    if (!matches) {
      return null;
    }

    const start = Number(matches[1]);
    if (!isFinite(start)) {
      return null;
    }

    const end = Number(matches[2]);
    if (!isFinite(end)) {
      return null;
    }

    return {start: start, end: end};
  }


  /**
   * Parses an integer.
   * @param {string} intString The integer string.
   * @return {?number} The parsed integer on success; otherwise, return null.
   */
  static parseInt(intString) {
    const n = Number(intString);
    return (n % 1 === 0) ? n : null;
  }


  /**
   * Parses a positive integer.
   * @param {string} intString The integer string.
   * @return {?number} The parsed positive integer on success; otherwise,
   *   return null.
   */
  static parsePositiveInt(intString) {
    const n = Number(intString);
    return (n % 1 === 0) && (n > 0) ? n : null;
  }


  /**
   * Parses a non-negative integer.
   * @param {string} intString The integer string.
   * @return {?number} The parsed non-negative integer on success; otherwise,
   *   return null.
   */
  static parseNonNegativeInt(intString) {
    const n = Number(intString);
    return (n % 1 === 0) && (n >= 0) ? n : null;
  }


  /**
   * Parses a floating point number.
   * @param {string} floatString The floating point number string.
   * @return {?number} The parsed floating point number on success; otherwise,
   *   return null. May return -Infinity or Infinity.
   */
  static parseFloat(floatString) {
    const n = Number(floatString);
    return !isNaN(n) ? n : null;
  }


  /**
   * Evaluate a division expressed as a string.
   * @param {string} exprString
   *   The expression to evaluate, e.g. "200/2". Can also be a single number.
   * @return {?number} The evaluated expression as floating point number on
   *   success; otherwise return null.
   */
  static evalDivision(exprString) {
    let res;
    let n;
    if ((res = exprString.match(/^(\d+)\/(\d+)$/))) {
      n = Number(res[1]) / Number(res[2]);
    } else {
      n = Number(exprString);
    }
    return !isNaN(n) ? n : null;
  }


  /**
   * Parse a string and return the resulting root element if
   * it was valid XML.
   * @param {string} xmlString
   * @param {string} expectedRootElemName
   * @return {Element}
   */
  static parseXmlString(xmlString, expectedRootElemName) {
    const parser = new DOMParser();
    let rootElem = null;
    let xml = null;
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
  }


  /**
   * Parse some UTF8 data and return the resulting root element if
   * it was valid XML.
   * @param {BufferSource} data
   * @param {string} expectedRootElemName
   * @return {Element}
   */
  static parseXml(data, expectedRootElemName) {
    try {
      const string = shaka.util.StringUtils.fromUTF8(data);
      return shaka.util.XmlUtils.parseXmlString(string, expectedRootElemName);
    } catch (exception) {
      return null;
    }
  }
};
