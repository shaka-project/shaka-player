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
   * @param {!Array<shaka.extern.ServiceLocationBaseUri>} baseUris The
   *   MPD-level BaseURL and Location elements that carry a serviceLocation
   *   attribute, resolved to absolute URIs by the caller the same way it
   *   resolves request URIs. They are attached to the parsed
   *   ClientDataReporting so the CMCD service-location filter can match
   *   requests by URI prefix.
   * @return {?shaka.extern.ServiceDescription}
   */
  static parse(mpd, baseUris) {
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
        const reporting = Parser.parseClientDataReporting_(elem, baseUris);
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
   * @return {?Object} Partial description with only the attributes that are
   *   present and parse, or null when neither child exists.
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
      const target = TXml.parseAttr(latencyNode, 'target', TXml.parseInt);
      if (target != null) {
        result.targetLatency = target / 1000;
      }
      const max = TXml.parseAttr(latencyNode, 'max', TXml.parseInt);
      if (max != null) {
        result.maxLatency = max / 1000;
      }
      const min = TXml.parseAttr(latencyNode, 'min', TXml.parseInt);
      if (min != null) {
        result.minLatency = min / 1000;
      }
    }

    if (playbackRateNode) {
      const max = TXml.parseAttr(playbackRateNode, 'max', TXml.parseFloat);
      if (max != null) {
        result.maxPlaybackRate = max;
      }
      const min = TXml.parseAttr(playbackRateNode, 'min', TXml.parseFloat);
      if (min != null) {
        result.minPlaybackRate = min;
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
   * @param {!shaka.extern.xml.Node} elem The ServiceDescription element.
   * @param {!Array<shaka.extern.ServiceLocationBaseUri>} baseUris
   * @return {?shaka.extern.ClientDataReporting}
   * @private
   */
  static parseClientDataReporting_(elem, baseUris) {
    const TXml = shaka.util.TXml;
    const Parser = shaka.dash.ServiceDescriptionParser;

    for (const reporting of TXml.findChildren(elem, 'ClientDataReporting')) {
      // Table K.16 and the schema allow 0..N CMCDParameters children
      // (maxOccurs="unbounded") without saying what several mean. Use the
      // first rather than TXml.findChild, which would treat two as none and
      // drop the whole reporting element.
      const paramsList = TXml.findChildren(reporting, 'CMCDParameters');
      const params = paramsList[0] || null;
      const schemeIdUri = reporting.attributes['schemeIdUri'] ||
          (params ? params.attributes['schemeIdUri'] : null) || '';
      if (schemeIdUri != Parser.CMCD_SCHEME_) {
        shaka.log.info(
            'Ignoring ClientDataReporting with unsupported scheme',
            schemeIdUri);
        continue;
      }
      if (paramsList.length > 1) {
        shaka.log.warning('ClientDataReporting has several CMCDParameters ' +
            'children; using the first one.');
      }
      return {
        schemeIdUri: schemeIdUri,
        serviceLocations: TXml.parseAttr(
            reporting, 'serviceLocations', TXml.parseStringList),
        adaptationSets: TXml.parseAttr(
            reporting, 'adaptationSets', TXml.parseStringList),
        serviceLocationBaseUris: baseUris,
        cmcdParameters: params ? Parser.parseCmcdParameters_(params) : null,
      };
    }
    return null;
  }

  /**
   * Reads a CMCDParameters element (Table K.8 / K.17). As with every other
   * attribute parsed through TXml.parseAttr, an absent, empty or invalid
   * value takes the spec default; parsing never throws.
   *
   * @param {!shaka.extern.xml.Node} node
   * @return {!shaka.extern.CmcdParameters}
   * @private
   */
  static parseCmcdParameters_(node) {
    const TXml = shaka.util.TXml;
    const Parser = shaka.dash.ServiceDescriptionParser;

    // @version is the highest version the reporting server accepts, so
    // anything up to it is acceptable; clamp to what shaka supports.
    const version = Math.min(
        /** @type {number} */ (TXml.parseAttr(
            node, 'version', TXml.parsePositiveInt, 1)),
        Parser.MAX_CMCD_VERSION_);

    const mode = /** @type {string} */ (TXml.parseAttr(node, 'mode',
        (value) => (value == 'query' || value == 'header') ? value : null,
        'query'));

    const includeInRequests = /** @type {!Array<string>} */ (TXml.parseAttr(
        node, 'includeInRequests', Parser.parseRequestTypes_, ['segment']));

    let keys = TXml.parseAttr(node, 'keys', TXml.parseStringList);
    if (!keys || !keys.length) {
      // @keys is mandatory, and an attribute that lists nothing is not a
      // selection of zero keys; both fall back to the player configuration.
      shaka.log.warning('CMCDParameters@keys is mandatory; falling back to ' +
          'the player configuration keys.');
      keys = null;
    }

    return {
      version: version,
      mode: mode,
      includeInRequests: includeInRequests,
      keys: keys,
      contentId: TXml.parseAttr(node, 'contentID', Parser.parseId_),
      sessionId: TXml.parseAttr(node, 'sessionID', Parser.parseId_),
    };
  }

  /**
   * Parses CMCDParameters@includeInRequests, keeping the request type tokens
   * this player understands.
   *
   * @param {string} value
   * @return {!Array<string>} Possibly empty, in which case CMCD is attached
   *   to no request at all.
   * @private
   */
  static parseRequestTypes_(value) {
    const Parser = shaka.dash.ServiceDescriptionParser;
    const tokens = [];
    for (const token of shaka.util.TXml.parseStringList(value)) {
      if (token.includes(':')) {
        // URN / tag URI request types are dropped when unknown (I.3.6).
        continue;
      }
      if (Parser.REQUEST_TYPES_.includes(token)) {
        tokens.push(token);
      } else {
        shaka.log.warning(
            'Ignoring unknown CMCDParameters@includeInRequests token', token);
      }
    }
    if (!tokens.length) {
      shaka.log.warning('CMCDParameters@includeInRequests has no usable ' +
          'request types; CMCD will not be attached to any request.');
    }
    return tokens;
  }

  /**
   * Parses a contentID / sessionID attribute, enforcing the 1..64 character
   * limit from Table K.8.
   *
   * @param {string} value
   * @return {?string}
   * @private
   */
  static parseId_(value) {
    const id = value.trim();
    if (!id.length || id.length > 64) {
      shaka.log.warning(
          'Ignoring a CMCDParameters id outside 1 to 64 characters:', value);
      return null;
    }
    return id;
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
