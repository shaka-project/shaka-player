/*! @license
 * Shaka Player
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// cspell:ignore subk subv

goog.provide('shaka.dash.JsonUtils');


/**
 * @summary JSON processing utility functions.
 */
shaka.dash.JsonUtils = class {
  /**
   * Converts a DASH-JSON manifest (dash-json-schema) into an MPD XML string.
   *
   * @param {!Object} json - Root JSON object following dash-json-schema.
   * @return {string}
   */
  static jsonToMpd(json) {
    const MPD_NS = 'urn:mpeg:dash:schema:mpd:2011';

    /**
     * Escape XML special chars.
     * @param {*} s
     * @return {string}
     */
    function esc(s) {
      return String(s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
    }

    /**
     * Emit a tag with attributes and content.
     *
     * @param {string} tagName
     * @param {!Object<string, ?>} attrs
     * @param {string} inner
     * @return {string}
     */
    function emit(tagName, attrs, inner) {
      let out = '<' + tagName;
      for (const [k, v] of Object.entries(attrs)) {
        out += ` ${k}="${esc(v)}"`;
      }
      if (inner === '') {
        return out + '/>';
      }
      return out + '>' + inner + `</${tagName}>`;
    }

    /**
     * Recursively build XML for a JSON node.
     *
     * @param {string} key       Element name, WITHOUT prefix
     * @param {*} node           Value
     * @param {!Object} nsMap    Map prefix->URI
     * @return {string}
     */
    function buildNode(key, node, nsMap) {
      if (node == null) {
        return emit(key, {}, '');
      }

      // Primitive → <key>value</key>
      if (typeof node !== 'object') {
        return emit(key, {}, esc(String(node)));
      }

      // Object case
      const attrs = {};
      let textContent = '';
      const children = [];

      // Handle prefix groups (namespaced stuff)
      const obj = /** @type {!Object<string,?>} */ (node);
      for (const [k, v] of Object.entries(obj)) {
        if (k === '$value' || k === '$ns') {
          continue;
        }

        const isPrefixGroup = nsMap[k] !== undefined;
        if (isPrefixGroup && typeof v === 'object' && v != null) {
          const prefix = k;
          const groupObj = v;

          for (const [subk, subv] of Object.entries(groupObj)) {
            if (Array.isArray(subv)) {
              // Namespaced repeating child elements <prefix:subk>
              for (const item of subv) {
                const tag = `${prefix}:${subk}`;
                children.push(buildNode(tag, item, nsMap));
              }
            } else if (typeof subv === 'object') {
              // Single namespaced child element
              const tag = `${prefix}:${subk}`;
              children.push(buildNode(tag, subv, nsMap));
            } else {
              // Namespaced attribute prefix:attr
              attrs[`${prefix}:${subk}`] = subv;
            }
          }
          continue;
        }

        // Regular attribute / child element
        const val = v;
        const isObj = typeof val === 'object' && val != null;

        if (!isObj) {
          // scalar → attribute
          attrs[k] = val;
        } else {
          // object or array → child
          if (Array.isArray(val)) {
            for (const item of val) {
              children.push(buildNode(k, item, nsMap));
            }
          } else {
            children.push(buildNode(k, val, nsMap));
          }
        }
      }

      if (node['$value'] !== undefined && node['$value'] !== null) {
        textContent = esc(node['$value']);
      }

      return emit(key, attrs, textContent + children.join(''));
    }

    // ------------------------------------------------------------------
    // Build namespace map prefix→URI from $ns
    // ------------------------------------------------------------------
    const nsMap = {};
    if (json['$ns'] && typeof json['$ns'] === 'object') {
      for (const [uri, info] of Object.entries(json['$ns'])) {
        const prefix = info.prefix;
        nsMap[prefix] = uri;
      }
    }

    // ------------------------------------------------------------------
    // Build root attributes: xmlns + xmlns:pref + scalar attrs at root
    // ------------------------------------------------------------------
    const rootAttrs = {
      'xmlns': MPD_NS,
    };

    // nsMap: prefix→uri
    for (const [prefix, uri] of Object.entries(nsMap)) {
      rootAttrs[`xmlns:${prefix}`] = uri;
    }

    // Non-object root attributes
    for (const [k, v] of Object.entries(json)) {
      if (k === '$ns') {
        continue;
      }
      if (typeof v !== 'object' || v === null) {
        rootAttrs[k] = v;
      }
    }

    // ------------------------------------------------------------------
    // Build children of <MPD>
    // ------------------------------------------------------------------
    let mpdInner = '';

    for (const [k, v] of Object.entries(json)) {
      if (k === '$ns') {
        continue;
      }
      if (k in nsMap) {
        // Namespace group
        const groupObj = /** @type {!Object<string,?>} */ (v);

        for (const [subk, subv] of Object.entries(groupObj)) {
          if (Array.isArray(subv)) {
            for (const item of subv) {
              const tag = `${k}:${subk}`;
              mpdInner += buildNode(tag, item, nsMap);
            }
          } else if (typeof subv === 'object') {
            const tag = `${k}:${subk}`;
            mpdInner += buildNode(tag, subv, nsMap);
          } else {
            // namespaced attribute on root? (rare)
            rootAttrs[`${k}:${subk}`] = subv;
          }
        }
        continue;
      }
      if (typeof v === 'object' && v !== null) {
        if (Array.isArray(v)) {
          for (const item of v) {
            mpdInner += buildNode(k, item, nsMap);
          }
        } else {
          mpdInner += buildNode(k, v, nsMap);
        }
      }
    }

    return emit('MPD', rootAttrs, mpdInner);
  }
};
