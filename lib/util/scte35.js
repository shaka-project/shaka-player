/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.Scte35');

goog.require('shaka.util.StringUtils');
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
      // 0xffffffff means the duration is unknown.
      endTime: emsg.eventDuration == 0xffffffff ?
          emsg.startTime : emsg.endTime,
      id: String(emsg.id),
      source: 'emsg',
      kind: '',
      data: null,
      node: null,
    };
    if (emsg.messageData && emsg.messageData.length) {
      if (emsg.schemeIdUri.trim().endsWith(':bin')) {
        event.data = emsg.messageData;
      } else {
        // A message we cannot even decode as text must not fail playback.
        let node = null;
        try {
          node = shaka.util.Scte35.parseXml_(
              shaka.util.StringUtils.fromBytesAutoDetect(emsg.messageData));
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
   * Reads one record of an MSF event timeline track carrying SCTE-35
   * (draft-wilaw-moq-scte35-event-timeline), once the caller has placed it on
   * the presentation timeline.
   *
   * @param {string} eventType The track's catalog `eventType`.
   * @param {string} payload The record's `scte35_payload`: base64 for binary
   *   carriage, the XML itself for XML carriage.
   * @param {number} startTime
   * @param {string} id
   * @return {?shaka.extern.Scte35Event} Null when the event type is not an
   *   SCTE-35 one, or the payload cannot be decoded.
   */
  static fromMsf(eventType, payload, startTime, id) {
    const format = shaka.util.Scte35.MSF_EVENT_TYPES_.get(eventType.trim());
    if (!format) {
      return null;
    }
    const event = {
      schemeIdUri: eventType,
      startTime,
      // The envelope carries no duration; it is only inside the payload.
      endTime: startTime,
      id,
      source: 'msf',
      kind: '',
      data: null,
      node: null,
    };
    if (format == 'bin') {
      event.data = shaka.util.Scte35.fromBase64_(payload);
      return event.data ? event : null;
    }
    const node = shaka.util.Scte35.parseXml_(payload);
    if (!node) {
      return null;
    }
    event.data = shaka.util.Scte35.binaryPayload_(node);
    if (!event.data) {
      event.node = node;
    }
    return event;
  }

  /**
   * Whether an MSF event timeline `eventType` is one fromMsf() reads.
   *
   * @param {string} eventType
   * @return {boolean}
   */
  static isMsfEventType(eventType) {
    return shaka.util.Scte35.MSF_EVENT_TYPES_.has(eventType.trim());
  }

  /**
   * The first element of an XML message, or null when there is none.
   *
   * TXml.parseXmlString() answers the first node it finds, which for text
   * that is not XML at all is the text itself rather than an element, and for
   * a document with an XML declaration is the declaration.
   *
   * @param {string} text
   * @return {?shaka.extern.xml.Node}
   * @private
   */
  static parseXml_(text) {
    // A message we cannot even parse must not fail playback.
    try {
      for (const node of shaka.util.TXml.parse(text, false) || []) {
        if (typeof node != 'string' && !node.tagName.startsWith('?')) {
          return node;
        }
      }
    } catch (error) {}
    return null;
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
      return shaka.util.Scte35.fromBase64_(
          shaka.util.TXml.getTextContents(node));
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
   * @private
   */
  static fromBase64_(text) {
    text = (text || '').replace(/\s/g, '');
    if (!text || text.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(text)) {
      return null;
    }
    return shaka.util.Uint8ArrayUtils.fromBase64(text);
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

/**
 * The MSF event timeline types carrying SCTE-35, and whether their payload is
 * base64 binary or XML.  draft-wilaw-moq-scte35-event-timeline defines the
 * 2022 names; the MSF draft's own catalog example uses the 2013 one.  These
 * are kept apart from SCHEMES_ so that recognizing them in MSF does not change
 * what DASH and emsg recognize.
 *
 * @private @const {!Map<string, string>}
 */
shaka.util.Scte35.MSF_EVENT_TYPES_ = new Map([
  ['urn:scte:scte35:2022:bin', 'bin'],
  ['urn:scte:scte35:2022:xml', 'xml'],
  ['urn:scte:scte35:2013:bin', 'bin'],
  ['urn:scte:scte35:2013:xml', 'xml'],
  ['urn:scte:scte35:2014:xml+bin', 'xml'],
  ['urn:scte:scte35:2013:xml+bin', 'xml'],
]);
