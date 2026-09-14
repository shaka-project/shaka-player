/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.dash.ServiceDescriptionParser');

goog.require('shaka.log');
goog.require('shaka.util.TXml');
goog.require('shaka.util.URL');


/**
 * @summary
 * Parses MPD-level ServiceDescription elements (ISO/IEC 23009-1:2026
 * Annex K) into a shaka.extern.ServiceDescription.
 *
 * Selection rules:
 *   1. Descriptions are visited in document order.
 *   2. A description that carries Scope children is ignored unless one of
 *      them names a scheme this player recognizes, per K.4.2.1: clients
 *      that recognize none of the scope descriptors must ignore the
 *      description. The DVB DASH low-latency scope is recognized; the
 *      event-activation scope (K.6) is not, which keeps event-activated
 *      descriptions from being applied at load time.
 *   3. Latency and PlaybackRate come from the first remaining description
 *      that has them.
 *   4. ClientDataReporting comes from the first remaining description that
 *      has one with a supported scheme.
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
    let reportingParsed = false;

    for (const elem of TXml.findChildren(mpd, 'ServiceDescription')) {
      const scopes = TXml.findChildren(elem, 'Scope');
      const recognized = scopes.some((scope) =>
        Parser.RECOGNIZED_SCOPES_.includes(scope.attributes['schemeIdUri']));
      if (scopes.length && !recognized) {
        shaka.log.debug('Ignoring ServiceDescription with unrecognized scopes',
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

      if (!reportingParsed) {
        const reporting = Parser.parseClientDataReporting_(
            mpd, elem, manifestBaseUris);
        if (reporting) {
          description = description || Parser.createEmpty_();
          description.clientDataReporting = reporting;
          reportingParsed = true;
        }
      }

      if (latencyParsed && reportingParsed) {
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

  /**
   * Reads the first ClientDataReporting child with a supported CMCD scheme.
   * The scheme is taken from ClientDataReporting@schemeIdUri and, for
   * lenience with MPDs written against dash.js samples, falls back to
   * CMCDParameters@schemeIdUri.
   *
   * @param {!shaka.extern.xml.Node} mpd
   * @param {!shaka.extern.xml.Node} elem The ServiceDescription element.
   * @param {!Array<string>} manifestBaseUris
   * @return {?shaka.extern.ClientDataReporting}
   * @private
   */
  static parseClientDataReporting_(mpd, elem, manifestBaseUris) {
    const TXml = shaka.util.TXml;
    const Parser = shaka.dash.ServiceDescriptionParser;

    for (const reporting of TXml.findChildren(elem, 'ClientDataReporting')) {
      // Multiple CMCDParameters children are allowed by the schema but have
      // no defined semantics; use the first one.
      const params = TXml.findChildren(reporting, 'CMCDParameters')[0] || null;
      const schemeIdUri = reporting.attributes['schemeIdUri'] ||
          (params ? params.attributes['schemeIdUri'] : null) || '';
      if (schemeIdUri != Parser.CMCD_SCHEME_) {
        shaka.log.info(
            'Ignoring ClientDataReporting with unsupported scheme',
            schemeIdUri);
        continue;
      }
      return {
        schemeIdUri: schemeIdUri,
        serviceLocations: Parser.parseList_(reporting, 'serviceLocations'),
        adaptationSets: Parser.parseList_(reporting, 'adaptationSets'),
        serviceLocationBaseUris:
            Parser.parseServiceLocationBaseUris_(mpd, manifestBaseUris),
        cmcdParameters: params ? Parser.parseCmcdParameters_(params) : null,
      };
    }
    return null;
  }

  /**
   * Validates a CMCDParameters element (Table K.8 / K.17). Invalid values
   * degrade to the spec defaults with a warning; parsing never throws.
   *
   * @param {!shaka.extern.xml.Node} node
   * @return {!shaka.extern.CmcdParameters}
   * @private
   */
  static parseCmcdParameters_(node) {
    const TXml = shaka.util.TXml;
    const Parser = shaka.dash.ServiceDescriptionParser;
    const attrs = node.attributes;

    let version = 1;
    if ('version' in attrs) {
      const parsed = TXml.parseInt(attrs['version']);
      if (parsed == null || parsed < 1) {
        shaka.log.warning('CMCDParameters@version is invalid:',
            attrs['version'], '- using version 1');
      } else {
        // @version is the highest version the reporting server accepts, so
        // anything up to it is acceptable; clamp to what shaka supports.
        version = Math.min(parsed, Parser.MAX_CMCD_VERSION_);
      }
    }

    let mode = 'query';
    if ('mode' in attrs) {
      if (attrs['mode'] == 'query' || attrs['mode'] == 'header') {
        mode = attrs['mode'];
      } else {
        shaka.log.warning('CMCDParameters@mode is invalid:', attrs['mode'],
            '- using query mode');
      }
    }

    let includeInRequests = ['segment'];
    if ('includeInRequests' in attrs) {
      includeInRequests = [];
      for (const token of Parser.splitList_(attrs['includeInRequests'])) {
        if (token.includes(':')) {
          // URN / tag URI request types are dropped when unknown (I.3.6).
          continue;
        }
        if (Parser.REQUEST_TYPES_.includes(token)) {
          includeInRequests.push(token);
        } else {
          shaka.log.warning(
              'Ignoring unknown CMCDParameters@includeInRequests token',
              token);
        }
      }
      if (!includeInRequests.length) {
        shaka.log.warning('CMCDParameters@includeInRequests has no usable ' +
            'request types; CMCD will not be attached to any request.');
      }
    }

    let keys = null;
    if ('keys' in attrs) {
      const list = Parser.splitList_(attrs['keys']);
      // An attribute that lists nothing is not a selection of zero keys;
      // @keys is mandatory, so an empty one is as good as absent.
      keys = list.length ? list : null;
    }
    if (!keys) {
      shaka.log.warning('CMCDParameters@keys is mandatory; falling back to ' +
          'the player configuration keys.');
    }

    return {
      version: version,
      mode: mode,
      includeInRequests: includeInRequests,
      keys: keys,
      contentId: Parser.parseId_(node, 'contentID'),
      sessionId: Parser.parseId_(node, 'sessionID'),
    };
  }

  /**
   * Reads a contentID / sessionID attribute, enforcing the 1..64 character
   * limit from Table K.8.
   *
   * @param {!shaka.extern.xml.Node} node
   * @param {string} name
   * @return {?string}
   * @private
   */
  static parseId_(node, name) {
    if (!(name in node.attributes)) {
      return null;
    }
    const value = node.attributes[name].trim();
    if (!value.length || value.length > 64) {
      shaka.log.warning('CMCDParameters@' + name +
          ' must be 1 to 64 characters; ignoring it.');
      return null;
    }
    return value;
  }

  /**
   * @param {!shaka.extern.xml.Node} elem
   * @param {string} name
   * @return {?Array<string>} The whitespace-separated list, or null when
   *   the attribute is absent.
   * @private
   */
  static parseList_(elem, name) {
    if (!(name in elem.attributes)) {
      return null;
    }
    return shaka.dash.ServiceDescriptionParser.splitList_(
        elem.attributes[name]);
  }

  /**
   * @param {string} value
   * @return {!Array<string>}
   * @private
   */
  static splitList_(value) {
    return value.split(/\s+/).filter((token) => token.length > 0);
  }

  /**
   * Resolves every MPD-level BaseURL and Location element that carries a
   * serviceLocation attribute to absolute URIs. Lower-level BaseURL
   * elements are not mapped; requests under them resolve to no service
   * location and are excluded when a serviceLocations filter is active.
   *
   * @param {!shaka.extern.xml.Node} mpd
   * @param {!Array<string>} manifestBaseUris
   * @return {!Array<shaka.extern.ServiceLocationBaseUri>}
   * @private
   */
  static parseServiceLocationBaseUris_(mpd, manifestBaseUris) {
    const TXml = shaka.util.TXml;
    /** @type {!Array<shaka.extern.ServiceLocationBaseUri>} */
    const result = [];
    for (const name of ['BaseURL', 'Location']) {
      for (const node of TXml.findChildren(mpd, name)) {
        const serviceLocation = node.attributes['serviceLocation'];
        const uri = TXml.getContents(node);
        if (!serviceLocation || !uri) {
          continue;
        }
        const resolved = shaka.util.URL.resolveUris(manifestBaseUris, [uri]);
        for (const absolute of resolved) {
          result.push({serviceLocation: serviceLocation, uri: absolute});
        }
      }
    }
    return result;
  }
};

/**
 * The descriptor scheme that identifies CMCD client data reporting
 * (ISO/IEC 23009-1:2026 K.4.2.7.2). dash.js also accepts a DASH-IF alias,
 * urn:dashif:cta-5004:2025, which has no registry entry; it is deliberately
 * not accepted here.
 *
 * @const {string}
 * @private
 */
shaka.dash.ServiceDescriptionParser.CMCD_SCHEME_ =
    'urn:mpeg:dash:cta-5004:2023';

/**
 * Scope schemes this player recognizes (ISO/IEC 23009-1:2026 Table K.10).
 * DVB-DASH low-latency MPDs (ETSI TS 103 285 clause 10.20.3, DASH-IF
 * CR-Low-Latency-Live-r8 clause 9) scope their low-latency
 * ServiceDescription, and shaka has always honored its Latency and
 * PlaybackRate targets.
 *
 * @const {!Array<string>}
 * @private
 */
shaka.dash.ServiceDescriptionParser.RECOGNIZED_SCOPES_ = [
  'urn:dvb:dash:lowlatency:scope:2019',
];

/**
 * Request type tokens from ISO/IEC 23009-1:2026 Table I.4, plus '*'.
 *
 * @const {!Array<string>}
 * @private
 */
shaka.dash.ServiceDescriptionParser.REQUEST_TYPES_ = [
  'segment', 'init', 'xlink', 'mpd', 'callback', 'chaining', 'fallback',
  'sbd', 'steering', 'mpdpatch', 'altmpd', 'mpdlink', '*',
];

/**
 * Highest CMCD version this player can emit.
 *
 * @const {number}
 * @private
 */
shaka.dash.ServiceDescriptionParser.MAX_CMCD_VERSION_ = 2;
