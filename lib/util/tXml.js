/*! @license
 * tXml
 * Copyright 2015 Tobias Nickel
 * SPDX-License-Identifier: MIT
 */

goog.provide('shaka.util.TXml');

goog.require('shaka.util.ObjectUtils');
goog.require('shaka.util.StringUtils');
goog.require('shaka.log');

/**
 * This code is a modified version of the tXml library.
 *
 * @author Tobias Nickel
 * created: 06.04.2015
 * https://github.com/TobiasNickel/tXml
 */

/**
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */


shaka.util.TXml = class {
  /**
   * Parse some data
   * @param {BufferSource} data
   * @param {string=} expectedRootElemName
   * @param {boolean=} includeParent
   * @return {shaka.extern.xml.Node | null}
   */
  static parseXml(data, expectedRootElemName, includeParent = false) {
    const xmlString = shaka.util.StringUtils.fromBytesAutoDetect(data);
    return shaka.util.TXml.parseXmlString(
        xmlString, expectedRootElemName, includeParent);
  }

  /**
   * Parse some data
   * @param {string} xmlString
   * @param {string=} expectedRootElemName
   * @param {boolean=} includeParent
   * @return {shaka.extern.xml.Node | null}
   */
  static parseXmlString(xmlString, expectedRootElemName,
      includeParent = false) {
    const result = shaka.util.TXml.parse(xmlString, includeParent);
    if (!expectedRootElemName && result.length) {
      return result[0];
    }
    const rootNode = result.find((n) =>
      expectedRootElemName.split(',').includes(n.tagName));
    if (rootNode) {
      return rootNode;
    }

    shaka.log.error('parseXml root element not found!');
    return null;
  }

  /**
   * Get namespace based on schema
   * @param {string} schema
   * @return {string}
   */
  static getKnownNameSpace(schema) {
    if (shaka.util.TXml.uriToNameSpace_.has(schema)) {
      return shaka.util.TXml.uriToNameSpace_.get(schema);
    }
    return '';
  }

  /**
   * Get schema based on namespace
   * @param {string} NS
   * @return {string}
   */
  static getKnownSchema(NS) {
    if (shaka.util.TXml.nameSpaceToUri_.has(NS)) {
      return shaka.util.TXml.nameSpaceToUri_.get(NS);
    }
    return '';
  }

  /**
   * Sets NS <-> schema bidirectional mapping
   * @param {string} schema
   * @param {string} NS
   */
  static setKnownNameSpace(schema, NS) {
    shaka.util.TXml.uriToNameSpace_.set(schema, NS);
    shaka.util.TXml.nameSpaceToUri_.set(NS, schema);
  }

  /**
   * parseXML / html into a DOM Object,
   * with no validation and some failure tolerance
   * @param {string} S your XML to parse
   * @param {boolean} includeParent
   * @return {Array<shaka.extern.xml.Node>}
   */
  static parse(S, includeParent) {
    let pos = 0;

    const openBracket = '<';
    const openBracketCC = '<'.charCodeAt(0);
    const closeBracket = '>';
    const closeBracketCC = '>'.charCodeAt(0);
    const minusCC = '-'.charCodeAt(0);
    const slashCC = '/'.charCodeAt(0);
    const exclamationCC = '!'.charCodeAt(0);
    const singleQuoteCC = '\''.charCodeAt(0);
    const doubleQuoteCC = '"'.charCodeAt(0);
    const openCornerBracketCC = '['.charCodeAt(0);

    /**
     * parsing a list of entries
     * @param {string} tagName
     * @param {boolean=} preserveSpace
     * @return {!Array<shaka.extern.xml.Node | string>}
     */
    function parseChildren(tagName, preserveSpace = false) {
      /** @type {!Array<shaka.extern.xml.Node | string>} */
      const children = [];
      while (S[pos]) {
        if (S.charCodeAt(pos) == openBracketCC) {
          if (S.charCodeAt(pos + 1) === slashCC) {
            const closeStart = pos + 2;
            pos = S.indexOf(closeBracket, pos);

            const closeTag = S.substring(closeStart, pos);
            let indexOfCloseTag = closeTag.indexOf(tagName);
            if (indexOfCloseTag == -1) {
              // handle VTT closing tags like <c.lime></c>
              const indexOfPeriod = tagName.indexOf('.');
              if (indexOfPeriod > 0) {
                const shortTag = tagName.substring(0, indexOfPeriod);
                indexOfCloseTag = closeTag.indexOf(shortTag);
              }
            }
            if (indexOfCloseTag == -1) {
              const parsedText = S.substring(0, pos).split('\n');
              throw new Error(
                  'Unexpected close tag\nLine: ' + (parsedText.length - 1) +
                            '\nColumn: ' +
                            (parsedText[parsedText.length - 1].length + 1) +
                            '\nChar: ' + S[pos],
              );
            }

            if (pos + 1) {
              pos += 1;
            }

            return children;
          } else if (S.charCodeAt(pos + 1) === exclamationCC) {
            if (S.charCodeAt(pos + 2) == minusCC) {
              while (pos !== -1 && !(S.charCodeAt(pos) === closeBracketCC &&
                  S.charCodeAt(pos - 1) == minusCC &&
                  S.charCodeAt(pos - 2) == minusCC &&
                  pos != -1)) {
                pos = S.indexOf(closeBracket, pos + 1);
              }
              if (pos === -1) {
                pos = S.length;
              }
            } else if (
              S.charCodeAt(pos + 2) === openCornerBracketCC &&
                        S.charCodeAt(pos + 8) === openCornerBracketCC &&
                        S.substr(pos + 3, 5).toLowerCase() === 'cdata'
            ) {
              // cdata
              const cdataEndIndex = S.indexOf(']]>', pos);
              if (cdataEndIndex == -1) {
                children.push(S.substr(pos + 9));
                pos = S.length;
              } else {
                children.push(S.substring(pos + 9, cdataEndIndex));
                pos = cdataEndIndex + 3;
              }
              continue;
            }
            pos++;
            continue;
          }
          const node = parseNode(preserveSpace);
          children.push(node);
          if (typeof node === 'string') {
            return children;
          }
          if (node.tagName[0] === '?' && node.children) {
            children.push(...node.children);
            node.children = [];
          }
        } else {
          const text = parseText();
          if (preserveSpace) {
            if (text.length > 0) {
              children.push(text);
            }
          } else if (children.length &&
              text.length == 1 && text[0] == '\n') {
            children.push(text);
          } else {
            const trimmed = text.trim();
            if (trimmed.length > 0) {
              children.push(text);
            }
          }
          pos++;
        }
      }
      return children;
    }

    /**
     * returns the text outside of texts until the first '<'
     * @return {string}
     */
    function parseText() {
      const start = pos;
      pos = S.indexOf(openBracket, pos) - 1;
      if (pos === -2) {
        pos = S.length;
      }
      return S.slice(start, pos + 1);
    }
    /**
     *    returns text until the first nonAlphabetic letter
     */
    const nameSpacer = '\r\n\t>/= ';

    /**
     * Parse text in current context
     * @return {string}
     */
    function parseName() {
      const start = pos;
      while (nameSpacer.indexOf(S[pos]) === -1 && S[pos]) {
        pos++;
      }
      return S.slice(start, pos);
    }

    /**
     * Parse text in current context
     * @param {boolean} preserveSpace Preserve the space between nodes
     * @return {shaka.extern.xml.Node | string}
     */
    function parseNode(preserveSpace) {
      pos++;
      const tagName = parseName();
      const attributes = {};
      let children = [];

      // parsing attributes
      while (S.charCodeAt(pos) !== closeBracketCC && S[pos]) {
        const c = S.charCodeAt(pos);
        // abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
        if ((c > 64 && c < 91) || (c > 96 && c < 123)) {
          const name = parseName();
          // search beginning of the string
          let code = S.charCodeAt(pos);
          while (code && code !== singleQuoteCC && code !== doubleQuoteCC &&
                !((code > 64 && code < 91) || (code > 96 && code < 123)) &&
                code !== closeBracketCC) {
            pos++;
            code = S.charCodeAt(pos);
          }
          let value = parseString();
          if (code === singleQuoteCC || code === doubleQuoteCC) {
            if (pos === -1) {
              /** @type {shaka.extern.xml.Node} */
              const node = {
                tagName,
                attributes,
                children,
                parent: null,
              };
              if (includeParent) {
                for (let i = 0; i < children.length; i++) {
                  if (typeof children[i] !== 'string') {
                    children[i].parent = node;
                  }
                }
              }
              return node;
            }
          } else {
            value = null;
            pos--;
          }
          if (name.startsWith('xmlns:')) {
            const segments = name.split(':');
            shaka.util.TXml.setKnownNameSpace(
                /** @type {string} */ (value), segments[1]);
          }
          if (tagName === 'tt' &&
              name === 'xml:space' &&
              value === 'preserve') {
            preserveSpace = true;
          }
          attributes[name] = value;
        }
        pos++;
      }

      if (S.charCodeAt(pos - 1) !== slashCC) {
        pos++;
        const contents = parseChildren(tagName, preserveSpace);
        children = contents;
      } else {
        pos++;
      }
      /** @type {shaka.extern.xml.Node} */
      const node = {
        tagName,
        attributes,
        children,
        parent: null,
      };
      const childrenLength = children.length;
      for (let i = 0; i < childrenLength; i++) {
        const childrenValue = children[i];
        if (typeof childrenValue !== 'string') {
          if (includeParent) {
            childrenValue.parent = node;
          }
        } else if (i == childrenLength - 1 && childrenValue == '\n') {
          children.pop();
        }
      }
      return node;
    }

    /**
     * Parse string in current context
     * @return {string}
     */
    function parseString() {
      const startChar = S[pos];
      const startPos = pos + 1;
      pos = S.indexOf(startChar, startPos);
      return S.slice(startPos, pos);
    }

    return parseChildren('');
  }

  /**
   * Verifies if the element is a TXml node.
   * @param {!shaka.extern.xml.Node} elem The XML element.
   * @return {!boolean} Is the element a TXml node
   */
  static isNode(elem) {
    return !!(elem.tagName);
  }

  /**
   * Checks if a node is of type text.
   * @param {!shaka.extern.xml.Node | string} elem The XML element.
   * @return {boolean} True if it is a text node.
   */
  static isText(elem) {
    return typeof elem === 'string';
  }

  /**
   * gets child XML elements.
   * @param {!shaka.extern.xml.Node} elem The parent XML element.
   * @return {!Array<!shaka.extern.xml.Node>} The child XML elements.
   */
  static getChildNodes(elem) {
    const found = [];
    if (!elem.children) {
      return [];
    }
    for (const child of elem.children) {
      if (typeof child !== 'string') {
        found.push(child);
      }
    }
    return found;
  }

  /**
   * Finds child XML elements.
   * @param {!shaka.extern.xml.Node} elem The parent XML element.
   * @param {string} name The child XML element's tag name.
   * @return {!Array<!shaka.extern.xml.Node>} The child XML elements.
   */
  static findChildren(elem, name) {
    const found = [];
    if (!elem.children) {
      return [];
    }
    for (const child of elem.children) {
      if (child.tagName === name) {
        found.push(child);
      }
    }
    return found;
  }

  /**
   * Gets inner text.
   * @param {!shaka.extern.xml.Node | string} node The XML element.
   * @return {?string} The text contents, or null if there are none.
   */
  static getTextContents(node) {
    const StringUtils = shaka.util.StringUtils;
    if (typeof node === 'string') {
      return StringUtils.htmlUnescape(node);
    }
    const textContent = node.children.reduce(
        (acc, curr) => (typeof curr === 'string' ? acc + curr : acc),
        '',
    );
    if (textContent === '') {
      return null;
    }
    return StringUtils.htmlUnescape(textContent);
  }

  /**
   * Gets the text contents of a node.
   * @param {!shaka.extern.xml.Node} node The XML element.
   * @return {?string} The text contents, or null if there are none.
   */
  static getContents(node) {
    if (!Array.from(node.children).every(
        (n) => typeof n === 'string' )) {
      return null;
    }

    // Read merged text content from all text nodes.
    let text = shaka.util.TXml.getTextContents(node);
    if (text) {
      text = text.trim();
    }
    return text;
  }

  /**
   * Finds child XML elements recursively.
   * @param {!shaka.extern.xml.Node} elem The parent XML element.
   * @param {string} name The child XML element's tag name.
   * @param {!Array<!shaka.extern.xml.Node>} found accumulator for found nodes
   * @return {!Array<!shaka.extern.xml.Node>} The child XML elements.
   */
  static getElementsByTagName(elem, name, found = []) {
    if (elem.tagName === name) {
      found.push(elem);
    }
    if (elem.children) {
      for (const child of elem.children) {
        shaka.util.TXml.getElementsByTagName(child, name, found);
      }
    }
    return found;
  }

  /**
   * Finds a child XML element.
   * @param {!shaka.extern.xml.Node} elem The parent XML element.
   * @param {string} name The child XML element's tag name.
   * @return {shaka.extern.xml.Node | null} The child XML element,
   *   or null if a child XML element
   *   does not exist with the given tag name OR if there exists more than one
   *   child XML element with the given tag name.
   */
  static findChild(elem, name) {
    const children = shaka.util.TXml.findChildren(elem, name);
    if (children.length != 1) {
      return null;
    }
    return children[0];
  }

  /**
   * Finds a namespace-qualified child XML element.
   * @param {!shaka.extern.xml.Node} elem The parent XML element.
   * @param {string} ns The child XML element's namespace URI.
   * @param {string} name The child XML element's local name.
   * @return {shaka.extern.xml.Node | null} The child XML element, or null
   *   if a child XML element
   *   does not exist with the given tag name OR if there exists more than one
   *   child XML element with the given tag name.
   */
  static findChildNS(elem, ns, name) {
    const children = shaka.util.TXml.findChildrenNS(elem, ns, name);
    if (children.length != 1) {
      return null;
    }
    return children[0];
  }

  /**
   * Parses an attribute by its name.
   * @param {!shaka.extern.xml.Node} elem The XML element.
   * @param {string} name The attribute name.
   * @param {function(string): (T|null)} parseFunction A function that parses
   *   the attribute.
   * @param {(T|null)=} defaultValue The attribute's default value, if not
   *   specified, the attribute's default value is null.
   * @return {(T|null)} The parsed attribute on success, or the attribute's
   *   default value if the attribute does not exist or could not be parsed.
   * @template T
   */
  static parseAttr(elem, name, parseFunction, defaultValue = null) {
    let parsedValue = null;

    const value = elem.attributes[name];
    if (value != null) {
      parsedValue = parseFunction(value);
    }
    return parsedValue == null ? defaultValue : parsedValue;
  }

  /**
   * Gets a namespace-qualified attribute.
   * @param {!shaka.extern.xml.Node} elem The element to get from.
   * @param {string} ns The namespace URI.
   * @param {string} name The local name of the attribute.
   * @return {?string} The attribute's value, or null if not present.
   */
  static getAttributeNS(elem, ns, name) {
    const schemaNS = shaka.util.TXml.getKnownNameSpace(ns);
    // Think this is equivalent
    const attribute = elem.attributes[`${schemaNS}:${name}`];
    return attribute || null;
  }

  /**
   * Finds namespace-qualified child XML elements.
   * @param {!shaka.extern.xml.Node} elem The parent XML element.
   * @param {string} ns The child XML element's namespace URI.
   * @param {string} name The child XML element's local name.
   * @return {!Array<!shaka.extern.xml.Node>} The child XML elements.
   */
  static findChildrenNS(elem, ns, name) {
    const schemaNS = shaka.util.TXml.getKnownNameSpace(ns);
    const found = [];
    if (elem.children) {
      const tagName = schemaNS ? `${schemaNS}:${name}` : name;
      for (const child of elem.children) {
        if (child && child.tagName === tagName) {
          found.push(child);
        }
      }
    }
    return found;
  }

  /**
   * Gets a namespace-qualified attribute.
   * @param {!shaka.extern.xml.Node} elem The element to get from.
   * @param {!Array<string>} nsList The lis of namespace URIs.
   * @param {string} name The local name of the attribute.
   * @return {?string} The attribute's value, or null if not present.
   */
  static getAttributeNSList(elem, nsList, name) {
    for (const ns of nsList) {
      const attr = shaka.util.TXml.getAttributeNS(
          elem, ns, name,
      );
      if (attr) {
        return attr;
      }
    }
    return null;
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
    return isNaN(result) ? null : (result / 1000.0);
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
    const matches = new RegExp(re, 'i').exec(durationString);

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
   * Parses a boolean.
   * @param {string} booleanString The boolean string.
   * @return {boolean} The boolean
   */
  static parseBoolean(booleanString) {
    if (!booleanString) {
      return false;
    }
    return booleanString.toLowerCase() === 'true';
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
   * Parse xPath strings for segments and id targets.
   * @param {string} exprString
   * @return {!Array<!shaka.util.TXml.PathNode>}
   */
  static parseXpath(exprString) {
    const StringUtils = shaka.util.StringUtils;
    const returnPaths = [];
    // Split string by paths but ignore '/' in quotes
    const paths = StringUtils.htmlUnescape(exprString)
        .split(/\/+(?=(?:[^'"]*['"][^'"]*['"])*[^'"]*$)/);
    for (const path of paths) {
      const nodeName = path.match(/^([\w]+)/);

      if (nodeName) {
        // We only want the id attribute in which case
        // /'(.*?)'/ will suffice to get it.
        const idAttr = path.match(/(@id='(.*?)')/);
        const tAttr = path.match(/(@t='(\d+)')/);
        const numberIndex = path.match(/(@n='(\d+)')/);
        const position = path.match(/\[(\d+)\]/);
        returnPaths.push({
          name: nodeName[0],
          id: idAttr ?
            idAttr[0].match(/'(.*?)'/)[0].replace(/'/gm, '') : null,
          t: tAttr ?
            Number(tAttr[0].match(/'(.*?)'/)[0].replace(/'/gm, '')) : null,
          n: numberIndex ?
            Number(numberIndex[0].match(/'(.*?)'/)[0].replace(/'/gm, '')):
            null,
          // position is counted from 1, so make it readable for devs
          position: position ? Number(position[1]) - 1 : null,
          attribute: path.split('/@')[1] || null,
        });
      } else if (path.startsWith('@') && returnPaths.length) {
        returnPaths[returnPaths.length - 1].attribute = path.slice(1);
      }
    }
    return returnPaths;
  }


  /**
   * Modifies nodes in specified array by adding or removing nodes
   * and updating attributes.
   * @param {!Array<shaka.extern.xml.Node>} nodes
   * @param {!shaka.extern.xml.Node} patchNode
   */
  static modifyNodes(nodes, patchNode) {
    const TXml = shaka.util.TXml;

    const paths = TXml.parseXpath(patchNode.attributes['sel'] || '');
    if (!paths.length) {
      return;
    }
    const lastNode = paths[paths.length - 1];
    const position = patchNode.attributes['pos'] || null;

    let index = lastNode.position;
    if (index == null) {
      if (lastNode.t !== null) {
        index = TXml.nodePositionByAttribute_(nodes, 't', lastNode.t);
      }
      if (lastNode.n !== null) {
        index = TXml.nodePositionByAttribute_(nodes, 'n', lastNode.n);
      }
    }
    if (index === null) {
      index = position === 'prepend' ? 0 : nodes.length;
    } else if (position === 'prepend') {
      --index;
    } else if (position === 'after') {
      ++index;
    }
    const action = patchNode.tagName;
    const attribute = lastNode.attribute;

    // Modify attribute
    if (attribute && nodes[index]) {
      TXml.modifyNodeAttribute(nodes[index], action, attribute,
          TXml.getContents(patchNode) || '');
    // Rearrange nodes
    } else {
      if (action === 'remove' || action === 'replace') {
        nodes.splice(index, 1);
      }
      if (action === 'add' || action === 'replace') {
        const newNodes = patchNode.children;
        nodes.splice(index, 0, ...newNodes);
      }
    }
  }


  /**
   * Search the node index by the t attribute
   * and return the index. if not found return null
   * @param {!Array<shaka.extern.xml.Node>} nodes
   * @param {!string} attribute
   * @param {!number} value
   * @return {?number}
   * @private
   */
  static nodePositionByAttribute_(nodes, attribute, value) {
    let index = 0;
    for (const node of nodes) {
      const attrs = node.attributes;
      const val = Number(attrs[attribute]);
      if (val === value) {
        return index;
      }
      index++;
    }
    return null;
  }


  /**
   * @param {!shaka.extern.xml.Node} node
   * @param {string} action
   * @param {string} attribute
   * @param {string} value
   */
  static modifyNodeAttribute(node, action, attribute, value) {
    if (action === 'remove') {
      delete node.attributes[attribute];
    } else if (action === 'add' || action === 'replace') {
      node.attributes[attribute] = value;
    }
  }


  /**
   * Converts a tXml node to DOM element.
   * @param {shaka.extern.xml.Node} node
   * @return {!Element}
   */
  static txmlNodeToDomElement(node) {
    const TXml = shaka.util.TXml;
    let namespace = '';
    const parts = node.tagName.split(':');
    if (parts.length > 0) {
      namespace = TXml.getKnownSchema(parts[0]);
    }
    const element = document.createElementNS(namespace, node.tagName);

    for (const k in node.attributes) {
      const v = node.attributes[k];
      element.setAttribute(k, v);
    }

    for (const child of node.children) {
      let childElement;
      if (typeof child == 'string') {
        childElement = new Text(child);
      } else {
        childElement = TXml.txmlNodeToDomElement(child);
      }
      element.appendChild(childElement);
    }

    return element;
  }

  /**
   * Clones node and its children recursively. Skips parent.
   * @param {?shaka.extern.xml.Node} node
   * @return {?shaka.extern.xml.Node}
   */
  static cloneNode(node) {
    if (!node) {
      return null;
    }
    /** @type {!shaka.extern.xml.Node} */
    const clone = {
      tagName: node.tagName,
      attributes: shaka.util.ObjectUtils.shallowCloneObject(node.attributes),
      children: [],
      parent: null,
    };
    for (const child of node.children) {
      if (typeof child === 'string') {
        clone.children.push(child);
      } else {
        const clonedChild = shaka.util.TXml.cloneNode(child);
        clonedChild.parent = clone;
        clone.children.push(clonedChild);
      }
    }
    return clone;
  }
};

/** @private {!Map<string, string>} */
shaka.util.TXml.uriToNameSpace_ = new Map();

/** @private {!Map<string, string>} */
shaka.util.TXml.nameSpaceToUri_ = new Map();


/**
 * @typedef {{
 *   name: string,
 *   id: ?string,
 *   t: ?number,
 *   n: ?number,
 *   position: ?number,
 *   attribute: ?string,
 * }}
 */
shaka.util.TXml.PathNode;
