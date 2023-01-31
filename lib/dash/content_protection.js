/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.dash.ContentProtection');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.Pssh');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.Uint8ArrayUtils');
goog.require('shaka.util.XmlUtils');


/**
 * @summary A set of functions for parsing and interpreting ContentProtection
 *   elements.
 */
shaka.dash.ContentProtection = class {
  /**
   * Parses info from the ContentProtection elements at the AdaptationSet level.
   *
   * @param {!Array.<!Element>} elems
   * @param {boolean} ignoreDrmInfo
   * @param {!Object.<string, string>} keySystemsByURI
   * @return {shaka.dash.ContentProtection.Context}
   */
  static parseFromAdaptationSet(elems, ignoreDrmInfo, keySystemsByURI) {
    const ContentProtection = shaka.dash.ContentProtection;
    const ManifestParserUtils = shaka.util.ManifestParserUtils;
    const parsed = ContentProtection.parseElements_(elems);
    /** @type {Array.<shaka.extern.InitDataOverride>} */
    let defaultInit = null;
    /** @type {!Array.<shaka.extern.DrmInfo>} */
    let drmInfos = [];
    let parsedNonCenc = [];

    // Get the default key ID; if there are multiple, they must all match.
    const keyIds = new Set(parsed.map((element) => element.keyId));
    // Remove any possible null value (elements may have no key ids).
    keyIds.delete(null);

    if (keyIds.size > 1) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_CONFLICTING_KEY_IDS);
    }

    if (!ignoreDrmInfo) {
      // Find the default key ID and init data.  Create a new array of all the
      // non-CENC elements.
      parsedNonCenc = parsed.filter((elem) => {
        if (elem.schemeUri == ContentProtection.MP4Protection_) {
          goog.asserts.assert(!elem.init || elem.init.length,
              'Init data must be null or non-empty.');
          defaultInit = elem.init || defaultInit;
          return false;
        } else {
          return true;
        }
      });

      if (parsedNonCenc.length) {
        drmInfos = ContentProtection.convertElements_(
            defaultInit, parsedNonCenc, keySystemsByURI, keyIds);

        // If there are no drmInfos after parsing, then add a dummy entry.
        // This may be removed in parseKeyIds.
        if (drmInfos.length == 0) {
          drmInfos = [ManifestParserUtils.createDrmInfo('', defaultInit)];
        }
      }
    }

    // If there are only CENC element(s) or ignoreDrmInfo flag is set, assume
    // all key-systems are supported.
    if (parsed.length && (ignoreDrmInfo || !parsedNonCenc.length)) {
      drmInfos = [];

      for (const keySystem of Object.values(keySystemsByURI)) {
        // If the manifest doesn't specify any key systems, we shouldn't
        // put clearkey in this list.  Otherwise, it may be triggered when
        // a real key system should be used instead.
        if (keySystem != 'org.w3.clearkey') {
          const info =
              ManifestParserUtils.createDrmInfo(keySystem, defaultInit);
          drmInfos.push(info);
        }
      }
    }

    // If we have a default key id, apply it to every initData.
    const defaultKeyId = Array.from(keyIds)[0] || null;

    if (defaultKeyId) {
      for (const info of drmInfos) {
        for (const initData of info.initData) {
          initData.keyId = defaultKeyId;
        }
      }
    }

    return {
      defaultKeyId: defaultKeyId,
      defaultInit: defaultInit,
      drmInfos: drmInfos,
      firstRepresentation: true,
    };
  }

  /**
   * Parses the given ContentProtection elements found at the Representation
   * level.  This may update the |context|.
   *
   * @param {!Array.<!Element>} elems
   * @param {shaka.dash.ContentProtection.Context} context
   * @param {boolean} ignoreDrmInfo
   * @param {!Object.<string, string>} keySystemsByURI
   * @return {?string} The parsed key ID
   */
  static parseFromRepresentation(
      elems, context, ignoreDrmInfo, keySystemsByURI) {
    const ContentProtection = shaka.dash.ContentProtection;
    const repContext = ContentProtection.parseFromAdaptationSet(
        elems, ignoreDrmInfo, keySystemsByURI);

    if (context.firstRepresentation) {
      const asUnknown = context.drmInfos.length == 1 &&
          !context.drmInfos[0].keySystem;
      const asUnencrypted = context.drmInfos.length == 0;
      const repUnencrypted = repContext.drmInfos.length == 0;

      // There are two cases where we need to replace the |drmInfos| in the
      // context with those in the Representation:
      //   1. The AdaptationSet does not list any ContentProtection.
      //   2. The AdaptationSet only lists unknown key-systems.
      if (asUnencrypted || (asUnknown && !repUnencrypted)) {
        context.drmInfos = repContext.drmInfos;
      }
      context.firstRepresentation = false;
    } else if (repContext.drmInfos.length > 0) {
      // If this is not the first Representation, then we need to remove entries
      // from the context that do not appear in this Representation.
      context.drmInfos = context.drmInfos.filter((asInfo) => {
        return repContext.drmInfos.some((repInfo) => {
          return repInfo.keySystem == asInfo.keySystem;
        });
      });
      // If we have filtered out all key-systems, throw an error.
      if (context.drmInfos.length == 0) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MANIFEST,
            shaka.util.Error.Code.DASH_NO_COMMON_KEY_SYSTEM);
      }
    }

    return repContext.defaultKeyId || context.defaultKeyId;
  }

  /**
   * Gets a Widevine license URL from a content protection element
   * containing a custom `ms:laurl` or 'dashif:Laurl' elements
   *
   * @param {shaka.dash.ContentProtection.Element} element
   * @return {string}
   */
  static getWidevineLicenseUrl(element) {
    const dashIfLaurlNode = shaka.util.XmlUtils.findChildNS(
        element.node, shaka.dash.ContentProtection.DashIfNamespaceUri_,
        'Laurl',
    );
    if (dashIfLaurlNode && dashIfLaurlNode.textContent) {
      return dashIfLaurlNode.textContent;
    }
    const mslaurlNode = shaka.util.XmlUtils.findChildNS(
        element.node, 'urn:microsoft', 'laurl');
    if (mslaurlNode) {
      return mslaurlNode.getAttribute('licenseUrl') || '';
    }
    return '';
  }

  /**
   * Gets a ClearKey license URL from a content protection element
   * containing a custom `clearkey::Laurl` or 'dashif:Laurl' elements
   *
   * @param {shaka.dash.ContentProtection.Element} element
   * @return {string}
   */
  static getClearKeyLicenseUrl(element) {
    const dashIfLaurlNode = shaka.util.XmlUtils.findChildNS(
        element.node, shaka.dash.ContentProtection.DashIfNamespaceUri_,
        'Laurl',
    );
    if (dashIfLaurlNode && dashIfLaurlNode.textContent) {
      return dashIfLaurlNode.textContent;
    }
    const clearKeyLaurlNode = shaka.util.XmlUtils.findChildNS(
        element.node, shaka.dash.ContentProtection.ClearKeyNamespaceUri_,
        'Laurl',
    );
    if (clearKeyLaurlNode &&
      clearKeyLaurlNode.getAttribute('Lic_type') === 'EME-1.0') {
      if (clearKeyLaurlNode.textContent) {
        return clearKeyLaurlNode.textContent;
      }
    }
    return '';
  }

  /**
   * Parses an Array buffer starting at byteOffset for PlayReady Object Records.
   * Each PRO Record is preceded by its PlayReady Record type and length in
   * bytes.
   *
   * PlayReady Object Record format: https://goo.gl/FTcu46
   *
   * @param {!DataView} view
   * @param {number} byteOffset
   * @return {!Array.<shaka.dash.ContentProtection.PlayReadyRecord>}
   * @private
   */
  static parseMsProRecords_(view, byteOffset) {
    const records = [];

    while (byteOffset < view.byteLength - 1) {
      const type = view.getUint16(byteOffset, true);
      byteOffset += 2;

      const byteLength = view.getUint16(byteOffset, true);
      byteOffset += 2;

      if ((byteLength & 1) != 0 || byteLength + byteOffset > view.byteLength) {
        shaka.log.warning('Malformed MS PRO object');
        return [];
      }

      const recordValue = shaka.util.BufferUtils.toUint8(
          view, byteOffset, byteLength);
      records.push({
        type: type,
        value: recordValue,
      });

      byteOffset += byteLength;
    }

    return records;
  }

  /**
   * Parses a buffer for PlayReady Objects.  The data
   * should contain a 32-bit integer indicating the length of
   * the PRO in bytes.  Following that, a 16-bit integer for
   * the number of PlayReady Object Records in the PRO.  Lastly,
   * a byte array of the PRO Records themselves.
   *
   * PlayReady Object format: https://goo.gl/W8yAN4
   *
   * @param {BufferSource} data
   * @return {!Array.<shaka.dash.ContentProtection.PlayReadyRecord>}
   * @private
   */
  static parseMsPro_(data) {
    let byteOffset = 0;
    const view = shaka.util.BufferUtils.toDataView(data);

    // First 4 bytes is the PRO length (DWORD)
    const byteLength = view.getUint32(byteOffset, /* littleEndian= */ true);
    byteOffset += 4;

    if (byteLength != data.byteLength) {
      // Malformed PRO
      shaka.log.warning('PlayReady Object with invalid length encountered.');
      return [];
    }

    // Skip PRO Record count (WORD)
    byteOffset += 2;

    // Rest of the data contains the PRO Records
    const ContentProtection = shaka.dash.ContentProtection;
    return ContentProtection.parseMsProRecords_(view, byteOffset);
  }

  /**
   * PlayReady Header format: https://goo.gl/dBzxNA
   *
   * @param {!Element} xml
   * @return {string}
   * @private
   */
  static getLaurl_(xml) {
    // LA_URL element is optional and no more than one is
    // allowed inside the DATA element. Only absolute URLs are allowed.
    // If the LA_URL element exists, it must not be empty.
    for (const elem of xml.getElementsByTagName('DATA')) {
      for (const child of elem.childNodes) {
        if (child instanceof Element && child.tagName == 'LA_URL') {
          return child.textContent;
        }
      }
    }

    // Not found
    return '';
  }

  /**
   * Gets a PlayReady license URL from a content protection element
   * containing a PlayReady Header Object
   *
   * @param {shaka.dash.ContentProtection.Element} element
   * @return {string}
   */
  static getPlayReadyLicenseUrl(element) {
    const dashIfLaurlNode = shaka.util.XmlUtils.findChildNS(
        element.node, shaka.dash.ContentProtection.DashIfNamespaceUri_,
        'Laurl',
    );
    if (dashIfLaurlNode && dashIfLaurlNode.textContent) {
      return dashIfLaurlNode.textContent;
    }

    const proNode = shaka.util.XmlUtils.findChildNS(
        element.node, 'urn:microsoft:playready', 'pro');

    if (!proNode) {
      return '';
    }

    const ContentProtection = shaka.dash.ContentProtection;
    const PLAYREADY_RECORD_TYPES = ContentProtection.PLAYREADY_RECORD_TYPES;

    const bytes = shaka.util.Uint8ArrayUtils.fromBase64(proNode.textContent);
    const records = ContentProtection.parseMsPro_(bytes);
    const record = records.filter((record) => {
      return record.type === PLAYREADY_RECORD_TYPES.RIGHTS_MANAGEMENT;
    })[0];

    if (!record) {
      return '';
    }

    const xml = shaka.util.StringUtils.fromUTF16(record.value, true);
    const rootElement = shaka.util.XmlUtils.parseXmlString(xml, 'WRMHEADER');
    if (!rootElement) {
      return '';
    }

    return ContentProtection.getLaurl_(rootElement);
  }

  /**
   * Gets a PlayReady initData from a content protection element
   * containing a PlayReady Pro Object
   *
   * @param {shaka.dash.ContentProtection.Element} element
   * @return {?Array.<shaka.extern.InitDataOverride>}
   * @private
   */
  static getInitDataFromPro_(element) {
    const proNode = shaka.util.XmlUtils.findChildNS(
        element.node, 'urn:microsoft:playready', 'pro');
    if (!proNode) {
      return null;
    }
    const Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;
    const data = Uint8ArrayUtils.fromBase64(proNode.textContent);
    const systemId = new Uint8Array([
      0x9a, 0x04, 0xf0, 0x79, 0x98, 0x40, 0x42, 0x86,
      0xab, 0x92, 0xe6, 0x5b, 0xe0, 0x88, 0x5f, 0x95,
    ]);
    const keyIds = new Set();
    const psshVersion = 0;
    const pssh =
        shaka.util.Pssh.createPssh(data, systemId, keyIds, psshVersion);
    return [
      {
        initData: pssh,
        initDataType: 'cenc',
        keyId: element.keyId,
      },
    ];
  }

  /**
   * Creates ClearKey initData from Default_KID value retrieved from previously
   * parsed ContentProtection tag.
   * @param {shaka.dash.ContentProtection.Element} element
   * @param {!Set.<string>} keyIds
   * @return {?Array.<shaka.extern.InitDataOverride>}
   * @private
   */
  static getInitDataClearKey_(element, keyIds) {
    if (keyIds.size == 0) {
      return null;
    }

    const systemId = new Uint8Array([
      0x10, 0x77, 0xef, 0xec, 0xc0, 0xb2, 0x4d, 0x02,
      0xac, 0xe3, 0x3c, 0x1e, 0x52, 0xe2, 0xfb, 0x4b,
    ]);
    const data = new Uint8Array([]);
    const psshVersion = 1;
    const pssh =
         shaka.util.Pssh.createPssh(data, systemId, keyIds, psshVersion);

    return [
      {
        initData: pssh,
        initDataType: 'cenc',
        keyId: element.keyId,
      },
    ];
  }

  /**
   * Creates DrmInfo objects from the given element.
   *
   * @param {Array.<shaka.extern.InitDataOverride>} defaultInit
   * @param {!Array.<shaka.dash.ContentProtection.Element>} elements
   * @param {!Object.<string, string>} keySystemsByURI
   * @param {!Set.<string>} keyIds
   * @return {!Array.<shaka.extern.DrmInfo>}
   * @private
   */
  static convertElements_(defaultInit, elements, keySystemsByURI, keyIds) {
    const ContentProtection = shaka.dash.ContentProtection;
    const ManifestParserUtils = shaka.util.ManifestParserUtils;
    const licenseUrlParsers = ContentProtection.licenseUrlParsers_;

    /** @type {!Array.<shaka.extern.DrmInfo>} */
    const out = [];

    for (const element of elements) {
      const keySystem = keySystemsByURI[element.schemeUri];
      if (keySystem) {
        goog.asserts.assert(
            !element.init || element.init.length,
            'Init data must be null or non-empty.');

        const proInitData = ContentProtection.getInitDataFromPro_(element);
        let clearKeyInitData = null;
        if (element.schemeUri ===
              shaka.dash.ContentProtection.ClearKeySchemeUri_) {
          clearKeyInitData =
            ContentProtection.getInitDataClearKey_(element, keyIds);
        }
        const initData = element.init || defaultInit || proInitData ||
          clearKeyInitData;
        const info = ManifestParserUtils.createDrmInfo(keySystem, initData);
        const licenseParser = licenseUrlParsers.get(keySystem);
        if (licenseParser) {
          info.licenseServerUri = licenseParser(element);
        }

        out.push(info);
      }
    }

    return out;
  }

  /**
   * Parses the given ContentProtection elements.  If there is an error, it
   * removes those elements.
   *
   * @param {!Array.<!Element>} elems
   * @return {!Array.<shaka.dash.ContentProtection.Element>}
   * @private
   */
  static parseElements_(elems) {
    /** @type {!Array.<shaka.dash.ContentProtection.Element>} */
    const out = [];

    for (const elem of elems) {
      const parsed = shaka.dash.ContentProtection.parseElement_(elem);
      if (parsed) {
        out.push(parsed);
      }
    }

    return out;
  }

  /**
   * Parses the given ContentProtection element.
   *
   * @param {!Element} elem
   * @return {?shaka.dash.ContentProtection.Element}
   * @private
   */
  static parseElement_(elem) {
    const NS = shaka.dash.ContentProtection.CencNamespaceUri_;

    /** @type {?string} */
    let schemeUri = elem.getAttribute('schemeIdUri');
    /** @type {?string} */
    let keyId = shaka.util.XmlUtils.getAttributeNS(elem, NS, 'default_KID');
    /** @type {!Array.<string>} */
    const psshs = shaka.util.XmlUtils.findChildrenNS(elem, NS, 'pssh')
        .map(shaka.util.XmlUtils.getContents);

    if (!schemeUri) {
      shaka.log.error('Missing required schemeIdUri attribute on',
          'ContentProtection element', elem);
      return null;
    }

    schemeUri = schemeUri.toLowerCase();
    if (keyId) {
      keyId = keyId.replace(/-/g, '').toLowerCase();
      if (keyId.includes(' ')) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MANIFEST,
            shaka.util.Error.Code.DASH_MULTIPLE_KEY_IDS_NOT_SUPPORTED);
      }
    }

    /** @type {!Array.<shaka.extern.InitDataOverride>} */
    let init = [];
    try {
      // Try parsing PSSH data.
      init = psshs.map((pssh) => {
        return {
          initDataType: 'cenc',
          initData: shaka.util.Uint8ArrayUtils.fromBase64(pssh),
          keyId: null,
        };
      });
    } catch (e) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_PSSH_BAD_ENCODING);
    }

    return {
      node: elem,
      schemeUri: schemeUri,
      keyId: keyId,
      init: (init.length > 0 ? init : null),
    };
  }
};

/**
 * @typedef {{
 *   type: number,
 *   value: !Uint8Array
 * }}
 *
 * @description
 * The parsed result of a PlayReady object record.
 *
 * @property {number} type
 *   Type of data stored in the record.
 * @property {!Uint8Array} value
 *   Record content.
 */
shaka.dash.ContentProtection.PlayReadyRecord;

/**
 * Enum for PlayReady record types.
 * @enum {number}
 */
shaka.dash.ContentProtection.PLAYREADY_RECORD_TYPES = {
  RIGHTS_MANAGEMENT: 0x001,
  RESERVED: 0x002,
  EMBEDDED_LICENSE: 0x003,
};

/**
 * @typedef {{
 *   defaultKeyId: ?string,
 *   defaultInit: Array.<shaka.extern.InitDataOverride>,
 *   drmInfos: !Array.<shaka.extern.DrmInfo>,
 *   firstRepresentation: boolean
 * }}
 *
 * @description
 * Contains information about the ContentProtection elements found at the
 * AdaptationSet level.
 *
 * @property {?string} defaultKeyId
 *   The default key ID to use.  This is used by parseKeyIds as a default.  This
 *   can be null to indicate that there is no default.
 * @property {Array.<shaka.extern.InitDataOverride>} defaultInit
 *   The default init data override.  This can be null to indicate that there
 *   is no default.
 * @property {!Array.<shaka.extern.DrmInfo>} drmInfos
 *   The DrmInfo objects.
 * @property {boolean} firstRepresentation
 *   True when first parsed; changed to false after the first call to
 *   parseKeyIds.  This is used to determine if a dummy key-system should be
 *   overwritten; namely that the first representation can replace the dummy
 *   from the AdaptationSet.
 */
shaka.dash.ContentProtection.Context;


/**
 * @typedef {{
 *   node: !Element,
 *   schemeUri: string,
 *   keyId: ?string,
 *   init: Array.<shaka.extern.InitDataOverride>
 * }}
 *
 * @description
 * The parsed result of a single ContentProtection element.
 *
 * @property {!Element} node
 *   The ContentProtection XML element.
 * @property {string} schemeUri
 *   The scheme URI.
 * @property {?string} keyId
 *   The default key ID, if present.
 * @property {Array.<shaka.extern.InitDataOverride>} init
 *   The init data, if present.  If there is no init data, it will be null.  If
 *   this is non-null, there is at least one element.
 */
shaka.dash.ContentProtection.Element;

/**
 * A map of key system name to license server url parser.
 *
 * @const {!Map.<string, function(shaka.dash.ContentProtection.Element)>}
 * @private
 */
shaka.dash.ContentProtection.licenseUrlParsers_ = new Map()
    .set('com.widevine.alpha',
        shaka.dash.ContentProtection.getWidevineLicenseUrl)
    .set('com.microsoft.playready',
        shaka.dash.ContentProtection.getPlayReadyLicenseUrl)
    .set('com.microsoft.playready.recommendation',
        shaka.dash.ContentProtection.getPlayReadyLicenseUrl)
    .set('com.microsoft.playready.software',
        shaka.dash.ContentProtection.getPlayReadyLicenseUrl)
    .set('com.microsoft.playready.hardware',
        shaka.dash.ContentProtection.getPlayReadyLicenseUrl)
    .set('org.w3.clearkey',
        shaka.dash.ContentProtection.getClearKeyLicenseUrl);

/**
 * @const {string}
 * @private
 */
shaka.dash.ContentProtection.MP4Protection_ =
    'urn:mpeg:dash:mp4protection:2011';


/**
 * @const {string}
 * @private
 */
shaka.dash.ContentProtection.CencNamespaceUri_ = 'urn:mpeg:cenc:2013';

/**
 * @const {string}
 * @private
 */
shaka.dash.ContentProtection.ClearKeyNamespaceUri_ =
  'http://dashif.org/guidelines/clearKey';


/**
 * @const {string}
 * @private
 */
shaka.dash.ContentProtection.ClearKeySchemeUri_ =
    'urn:uuid:e2719d58-a985-b3c9-781a-b030af78d30e';


/**
 * @const {string}
 * @private
 */
shaka.dash.ContentProtection.DashIfNamespaceUri_ =
  'https://dashif.org/CPS';
