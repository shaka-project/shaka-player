/*! @license
 * Shaka Player
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.dash.DashJsonParser');

goog.require('shaka.dash.DashParser');
goog.require('shaka.dash.JsonUtils');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.util.Error');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.TXml');


/**
 * @extends {shaka.dash.DashParser}
 * @export
 */
shaka.dash.DashJsonParser = class extends shaka.dash.DashParser {
  /**
   * @override
   * @param {BufferSource} data
   * @param {string} finalManifestUri
   * @param {string} rootElement
   * @return {!Promise}
   */
  parseManifest(data, finalManifestUri, rootElement) {
    const jsonString = shaka.util.StringUtils.fromBytesAutoDetect(data);

    let mpd;
    try {
      /** @type {!Object} */
      const json = /** @type {!Object} */ (JSON.parse(jsonString));
      const xmlString = shaka.dash.JsonUtils.jsonToMpd(json);
      mpd = shaka.util.TXml.parseXmlString(xmlString, rootElement);
    } catch (e) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_INVALID_JSON,
          finalManifestUri);
    }

    return this.processParsedMpd(mpd, finalManifestUri, rootElement);
  }
};

shaka.media.ManifestParser.registerParserByMime(
    'application/dash+json', () => new shaka.dash.DashJsonParser());
