/*! @license
 * Shaka Player
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.Scte35');

goog.require('shaka.util.TXml');
goog.require('shaka.util.Uint8ArrayUtils');

/**
 * Recognizes SCTE-35 messages in the transports that can carry them, and
 * normalizes them onto the presentation timeline.  The payload itself is
 * passed through untouched for the application to decode.
 */
shaka.util.Scte35 = class {
  /**
   * @param {string} scheme
   * @return {boolean}
   */
  static isScheme(scheme) {
    return shaka.util.Scte35.SCHEMES_.includes(scheme.trim());
  }

  /**
   * @param {shaka.extern.TimelineRegionInfo} region
   * @return {?shaka.extern.Scte35Event}
   */
  static fromRegion(region) {
    if (!shaka.util.Scte35.isScheme(region.schemeIdUri)) {
      return null;
    }
    const event = {
      schemeIdUri: region.schemeIdUri,
      startTime: region.startTime,
      endTime: region.endTime,
      id: region.id,
      source: 'dash',
      kind: '',
      data: null,
      node: null,
    };
    if (region.eventNode) {
      // xml+bin wraps the section in <Binary>; plain xml has no binary form.
      event.data = shaka.util.Scte35.binaryPayload_(region.eventNode);
      if (!event.data) {
        event.node = region.eventNode;
      }
    }
    return event;
  }

  /**
   * @param {shaka.extern.EmsgInfo} emsg
   * @return {?shaka.extern.Scte35Event}
   */
  static fromEmsg(emsg) {
    if (!shaka.util.Scte35.isScheme(emsg.schemeIdUri)) {
      return null;
    }
    const event = {
      schemeIdUri: emsg.schemeIdUri,
      startTime: emsg.startTime,
      // 0xffffffff means the duration is unknown, not 136 years.
      endTime: emsg.eventDuration == 0xffffffff ?
          emsg.startTime : emsg.endTime,
      id: String(emsg.id),
      source: 'emsg',
      kind: '',
      data: null,
      node: null,
    };
    if (emsg.messageData?.length) {
      if (emsg.schemeIdUri.trim().endsWith(':bin')) {
        event.data = emsg.messageData;
      } else {
        // A message we cannot even decode as text must not fail playback.
        let node = null;
        try {
          node = shaka.util.TXml.parseXml(emsg.messageData);
        } catch (error) {}
        if (node) {
          event.data = shaka.util.Scte35.binaryPayload_(node);
          if (!event.data) {
            event.node = node;
          }
        }
      }
    }
    return event;
  }

  /**
   * Finds the base64 <Binary> section, ignoring the producer's namespace
   * prefix and how deeply it nested the element.
   * @param {!shaka.extern.xml.Node} node
   * @return {?Uint8Array}
   * @private
   */
  static binaryPayload_(node) {
    if (node.tagName.split(':').pop() == 'Binary') {
      const text = (shaka.util.TXml.getTextContents(node) || '')
          .replace(/\s/g, '');
      if (!text || text.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(text)) {
        return null;
      }
      return shaka.util.Uint8ArrayUtils.fromBase64(text);
    }
    for (const child of node.children) {
      if (typeof child != 'string') {
        const data = shaka.util.Scte35.binaryPayload_(child);
        if (data) {
          return data;
        }
      }
    }
    return null;
  }

  /**
   * @param {?string} text
   * @return {?Uint8Array}
   */
  static fromHex(text) {
    if (!text || !/^0[xX](?:[0-9a-fA-F]{2})+$/.test(text)) {
      return null;
    }
    return shaka.util.Uint8ArrayUtils.fromHex(text.substring(2));
  }
};

/** @private @const {!Array<string>} */
shaka.util.Scte35.SCHEMES_ = [
  'urn:scte:scte35:2013:xml',
  'urn:scte:scte35:2014:xml+bin',
  // Compatibility alias used by some producers.
  'urn:scte:scte35:2013:xml+bin',
  'urn:scte:scte35:2013:bin',
];
