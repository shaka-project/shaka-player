/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.dash.ServiceDescriptionParser');

goog.require('shaka.log');
goog.require('shaka.util.TXml');


/**
 * @summary
 * Parses MPD-level ServiceDescription elements (ISO/IEC 23009-1:2026
 * Annex K) into a shaka.extern.ServiceDescription.
 *
 * Selection rules:
 *   1. Descriptions are visited in document order.
 *   2. A description with one or more Scope children is ignored: shaka
 *      recognizes no scope schemes, and K.4.2.1 says clients that recognize
 *      none of them must ignore the description. This also keeps
 *      event-activated descriptions (K.6) from being applied at load time.
 *   3. Latency and PlaybackRate come from the first remaining description
 *      that has them.
 *   4. ClientDataReporting comes from the first remaining description that
 *      has one with a supported scheme (Task 3).
 */
shaka.dash.ServiceDescriptionParser = class {
  /**
   * @param {!shaka.extern.xml.Node} mpd
   * @param {!Array<string>} manifestBaseUris Absolute URIs the MPD-level
   *   BaseURL elements resolve against.
   * @return {?shaka.extern.ServiceDescription}
   */
  static parse(mpd, manifestBaseUris) {
    const TXml = shaka.util.TXml;
    const Parser = shaka.dash.ServiceDescriptionParser;

    /** @type {?shaka.extern.ServiceDescription} */
    let description = null;
    let latencyParsed = false;

    for (const elem of TXml.findChildren(mpd, 'ServiceDescription')) {
      if (TXml.findChildren(elem, 'Scope').length) {
        shaka.log.debug('Ignoring scoped ServiceDescription',
            elem.attributes['id']);
        continue;
      }

      if (!latencyParsed) {
        const latency = Parser.parseLatencyAndPlaybackRate_(elem);
        if (latency) {
          description = description || Parser.createEmpty_();
          Object.assign(description, latency);
          latencyParsed = true;
        }
      }

      if (latencyParsed) {
        break;
      }
    }

    return description;
  }

  /**
   * A description with no latency targets and no client data reporting.
   * Latency fields are deliberately left undefined so existing consumers
   * that test for `undefined` keep working.
   *
   * @return {!shaka.extern.ServiceDescription}
   * @private
   */
  static createEmpty_() {
    return /** @type {!shaka.extern.ServiceDescription} */ ({
      clientDataReporting: null,
    });
  }

  /**
   * Reads the Latency and PlaybackRate children of a ServiceDescription.
   *
   * @param {!shaka.extern.xml.Node} elem
   * @return {?Object} Partial description with only the present fields, or
   *   null when neither child exists.
   * @private
   */
  static parseLatencyAndPlaybackRate_(elem) {
    const TXml = shaka.util.TXml;
    const latencyNode = TXml.findChild(elem, 'Latency');
    const playbackRateNode = TXml.findChild(elem, 'PlaybackRate');

    if (!latencyNode && !playbackRateNode) {
      return null;
    }

    const result = {};

    if (latencyNode) {
      if ('target' in latencyNode.attributes) {
        result.targetLatency =
            parseInt(latencyNode.attributes['target'], 10) / 1000;
      }
      if ('max' in latencyNode.attributes) {
        result.maxLatency =
            parseInt(latencyNode.attributes['max'], 10) / 1000;
      }
      if ('min' in latencyNode.attributes) {
        result.minLatency =
            parseInt(latencyNode.attributes['min'], 10) / 1000;
      }
    }

    if (playbackRateNode) {
      if ('max' in playbackRateNode.attributes) {
        result.maxPlaybackRate =
            parseFloat(playbackRateNode.attributes['max']);
      }
      if ('min' in playbackRateNode.attributes) {
        result.minPlaybackRate =
            parseFloat(playbackRateNode.attributes['min']);
      }
    }

    return result;
  }
};
