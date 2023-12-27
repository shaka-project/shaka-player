goog.provide('shaka.util.TXml');

goog.require('shaka.util.StringUtils');
goog.require('shaka.log');

/**
 * @author: Tobias Nickel
 * created: 06.04.2015
 * This code has been taken
 * https://github.com/TobiasNickel/tXml
 */

shaka.util.TXml = class {
  /**
     * Parse some data
     * @param {BufferSource} data
     * @param {string=} expectedRootElemName
     * @return {shaka.extern.xml.Node | null}
     */
  static parseXml(data, expectedRootElemName) {
    const xmlString = shaka.util.StringUtils.fromBytesAutoDetect(data);
    return shaka.util.TXml.parseXmlString(xmlString, expectedRootElemName);
  }

  /**
   * Parse some data
   * @param {string} xmlString
   * @param {string=} expectedRootElemName
   * @return {shaka.extern.xml.Node | null}
   */
  static parseXmlString(xmlString, expectedRootElemName) {
    const result = shaka.util.TXml.parse(xmlString);
    if (!expectedRootElemName && result.length) {
      return result[0];
    }
    const rootNode = result.find(
        (n) => {
          return n.tagName === expectedRootElemName;
        });
    if (rootNode) {
      return rootNode;
    }

    shaka.log.error('parseXml root element not found!');
    return null;
  }

  /**
   * Parse some data
   * @param {string} schema
   * @return {string}
   */
  static getKnownNameSpace(schema) {
    if (shaka.util.TXml.knownNameSpaces_.has(schema)) {
      return shaka.util.TXml.knownNameSpaces_.get(schema);
    }
    return '';
  }

  /**
   * Parse some data
   * @param {string} schema
   * @param {string} NS
   */
  static setKnownNameSpace(schema, NS) {
    shaka.util.TXml.knownNameSpaces_.set(schema, NS);
  }

  /**
     * parseXML / html into a DOM Object,
     * with no validation and some failure tolerance
     * @param {string} S your XML to parse
     * @return {Array.<shaka.extern.xml.Node>}
     */
  static parse(S) {
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
     */
    function parseChildren(tagName) {
      /** @type {Array.<shaka.extern.xml.Node | string>} */
      const children = [];
      while (S[pos]) {
        if (S.charCodeAt(pos) == openBracketCC) {
          if (S.charCodeAt(pos + 1) === slashCC) {
            const closeStart = pos + 2;
            pos = S.indexOf(closeBracket, pos);

            const closeTag = S.substring(closeStart, pos);
            // eslint-disable-next-line no-restricted-syntax
            if (closeTag.indexOf(tagName) == -1) {
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
          const node = parseNode();
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
          const trimmed = text.trim();
          if (trimmed.length > 0) {
            children.push(trimmed);
          }
          pos++;
        }
      }
      return children;
    }

    /**
     *    returns the text outside of texts until the first '<'
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
       * @return {shaka.extern.xml.Node | string}
       */
    function parseNode() {
      pos++;
      const tagName = parseName();
      const attributes = {};
      let children = [];
      let innerText = null;

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
                innerText,
                parent: null,
              };
              for (let i = 0; i < children.length; i++) {
                children[i].parent = node;
              }
              return node;
            }
          } else {
            value = null;
            pos--;
          }
          if (name.startsWith('xmlns:')) {
            const segs = name.split(':');
            shaka.util.TXml.setKnownNameSpace(
                /** @type {string} */ (value), segs[1]);
          }
          attributes[name] = value;
        }
        pos++;
      }
      // optional parsing of children
      if (S.charCodeAt(pos - 1) !== slashCC) {
        pos++;
        const contents = parseChildren(tagName);
        if (typeof contents[0] === 'string') {
          innerText = contents[0];
        } else {
          children = contents;
        }
      } else {
        pos++;
      }
      /** @type {shaka.extern.xml.Node} */
      const node = {
        tagName,
        attributes,
        children,
        innerText,
        parent: null,
      };
      for (let i = 0; i < children.length; i++) {
        children[i].parent = node;
      }
      return node;
    }

    /**
       * Parse string in current context
       * @return {string}
       */
    function parseString() {
      const startChar = S[pos];
      const startpos = pos + 1;
      pos = S.indexOf(startChar, startpos);
      return S.slice(startpos, pos);
    }

    return parseChildren('');
  }

  /**
   * Finds child XML elements.
   * @param {!shaka.extern.xml.Node} elem The parent XML element.
   * @param {string} name The child XML element's tag name.
   * @return {!Array.<!shaka.extern.xml.Node>} The child XML elements.
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
   * Gets the text contents of a node.
   * @param {!shaka.extern.xml.Node} node The XML element.
   * @return {?string} The text contents, or null if there are none.
   */
  static getContents(node) {
    if (node && node.innerText) {
      return node.innerText.trim();
    }
    return null;
  }

  /**
   * Finds child XML elements recursively.
   * @param {!shaka.extern.xml.Node} elem The parent XML element.
   * @param {string} name The child XML element's tag name.
   * @param {!Array.<!shaka.extern.xml.Node>} found accumulator for found nodes
   * @return {!Array.<!shaka.extern.xml.Node>} The child XML elements.
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
   *   specified, the attibute's default value is null.
   * @return {(T|null)} The parsed attribute on success, or the attribute's
   *   default value if the attribute does not exist or could not be parsed.
   * @template T
   */
  static parseAttr(
      elem, name, parseFunction, defaultValue = null) {
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
   * @return {!Array.<!shaka.extern.xml.Node>} The child XML elements.
   */
  static findChildrenNS(elem, ns, name) {
    const schemaNS = shaka.util.TXml.getKnownNameSpace(ns);
    const found = [];
    if (elem.children) {
      for (const child of elem.children) {
        if (child && child.tagName === `${schemaNS}:${name}`) {
          found.push(child);
        }
      }
    }
    return found;
  }

  /**
   * Gets a namespace-qualified attribute.
   * @param {!shaka.extern.xml.Node} elem The element to get from.
   * @param {!Array.<string>} nsList The lis of namespace URIs.
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
};

shaka.util.TXml.knownNameSpaces_ = new Map([]);
