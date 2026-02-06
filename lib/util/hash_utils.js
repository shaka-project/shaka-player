/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.HashUtils');

/**
 * A set of lightweight hashing helpers.
 * @namespace shaka.util.HashUtils
 */
shaka.util.HashUtils = class {
  /**
   * Simple FNV-1a hash implementation.
   * @param {string} str
   * @param {number=} seed
   * @return {number}
   */
  static fnv1a(str, seed = 0x811c9dc5) {
    let hash = seed;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash;
  }

  /**
   * Deterministic incremental hash for TXml nodes.
   * @param {!shaka.extern.xml.Node} node
   * @param {number=} seed
   * @return {number}
   */
  static hashTXml(node, seed = 0x811c9dc5) {
    let hash = shaka.util.HashUtils.fnv1a(node.tagName, seed);

    if (node.attributes) {
      const keys = Object.keys(node.attributes).sort();
      for (const key of keys) {
        hash = shaka.util.HashUtils.fnv1a('A', hash);
        hash = shaka.util.HashUtils.fnv1a(key, hash);
        hash = shaka.util.HashUtils.fnv1a('=', hash);
        hash = shaka.util.HashUtils.fnv1a(node.attributes[key], hash);
      }
    }

    if (node.children) {
      for (const child of node.children) {
        if (typeof child === 'string') {
          hash = shaka.util.HashUtils.fnv1a('S', hash);
          hash = shaka.util.HashUtils.fnv1a(child, hash);
        } else {
          hash = shaka.util.HashUtils.hashTXml(child, hash);
        }
      }
    }

    hash = shaka.util.HashUtils.fnv1a('>', hash);
    return hash;
  }
};
