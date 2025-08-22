/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.dash.ContentProtection');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.drm.DrmUtils');
goog.require('shaka.drm.PlayReady');
goog.require('shaka.util.Error');
goog.require('shaka.util.IReleasable');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.Pssh');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.TXml');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * @summary A set of functions for parsing and interpreting ContentProtection
 *   elements.
 * @implements {shaka.util.IReleasable}
 */
shaka.dash.ContentProtection = class {
  constructor() {
    /** @private {!Map<string, !Uint8Array>} */
    this.psshToInitData_ = new Map();
  }

  /** @override */
  release() {
    this.psshToInitData_.clear();
  }

  /**
   * Parses info from the ContentProtection elements at the AdaptationSet level.
   *
   * @param {!Array<!shaka.extern.xml.Node>} elements
   * @param {boolean} ignoreDrmInfo
   * @param {!Object<string, string>} keySystemsByURI
   * @return {shaka.dash.ContentProtection.Context}
   */
  parseFromAdaptationSet(elements, ignoreDrmInfo, keySystemsByURI) {
    const ContentProtection = shaka.dash.ContentProtection;
    const ManifestParserUtils = shaka.util.ManifestParserUtils;
    const parsed = this.parseElements_(elements);
    /** @type {Array<shaka.extern.InitDataOverride>} */
    let defaultInit = null;
    /** @type {!Array<shaka.extern.DrmInfo>} */
    let drmInfos = [];
    let parsedNonCenc = [];
    /** @type {?shaka.dash.ContentProtection.Aes128Info} */
    let aes128Info = null;

    // Get the default key ID; if there are multiple, they must all match.
    const keyIds = new Set(parsed.map((element) => element.keyId));
    // Remove any possible null value (elements may have no key ids).
    keyIds.delete(null);

    let encryptionScheme = 'cenc';

    if (keyIds.size > 1) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_CONFLICTING_KEY_IDS);
    }

    if (!ignoreDrmInfo) {
      const aes128Elements = parsed.filter((elem) => {
        return elem.schemeUri == ContentProtection.Aes128Protection_;
      });

      if (aes128Elements.length > 1) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MANIFEST,
            shaka.util.Error.Code.DASH_CONFLICTING_AES_128);
      }

      if (aes128Elements.length) {
        aes128Info = ContentProtection.parseAes128_(aes128Elements[0]);
      }

      const mp4ProtectionParsed = parsed.find((elem) => {
        return elem.schemeUri == ContentProtection.MP4Protection_;
      });

      if (mp4ProtectionParsed && mp4ProtectionParsed.encryptionScheme) {
        encryptionScheme = mp4ProtectionParsed.encryptionScheme;
      }

      // Find the default key ID and init data.  Create a new array of all the
      // non-CENC elements.
      parsedNonCenc = parsed.filter((elem) => {
        if (elem.schemeUri == ContentProtection.MP4Protection_) {
          goog.asserts.assert(!elem.init || elem.init.length,
              'Init data must be null or non-empty.');
          defaultInit = elem.init || defaultInit;
          return false;
        } else {
          return elem.schemeUri != ContentProtection.Aes128Protection_;
        }
      });

      if (parsedNonCenc.length) {
        drmInfos = ContentProtection.convertElements_(defaultInit,
            encryptionScheme, parsedNonCenc, keySystemsByURI, keyIds);

        // If there are no drmInfos after parsing, then add a dummy entry.
        // This may be removed in parseKeyIds.
        if (drmInfos.length == 0) {
          drmInfos = [ManifestParserUtils.createDrmInfo(
              '', encryptionScheme, defaultInit)];
        }
      }
    }

    // If there are only CENC element(s) or ignoreDrmInfo flag is set, assume
    // all key-systems are supported.
    if (parsed.length && !aes128Info &&
        (ignoreDrmInfo || !parsedNonCenc.length)) {
      drmInfos = [];

      for (const keySystem of Object.values(keySystemsByURI)) {
        // If the manifest doesn't specify any key systems, we shouldn't
        // put clearkey in this list.  Otherwise, it may be triggered when
        // a real key system should be used instead.
        if (keySystem != 'org.w3.clearkey') {
          const info = ManifestParserUtils.createDrmInfo(
              keySystem, encryptionScheme, defaultInit);
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
      aes128Info: aes128Info,
      firstRepresentation: true,
    };
  }

  /**
   * Parses the given ContentProtection elements found at the Representation
   * level.  This may update the |context|.
   *
   * @param {!Array<!shaka.extern.xml.Node>} elements
   * @param {shaka.dash.ContentProtection.Context} context
   * @param {boolean} ignoreDrmInfo
   * @param {!Object<string, string>} keySystemsByURI
   * @return {?string} The parsed key ID
   */
  parseFromRepresentation(
      elements, context, ignoreDrmInfo, keySystemsByURI) {
    const repContext = this.parseFromAdaptationSet(
        elements, ignoreDrmInfo, keySystemsByURI);

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
   * Gets a FairPlay license URL from a content protection element
   * containing a 'dashif:Laurl' element
   *
   * @param {shaka.dash.ContentProtection.Element} element
   * @return {string}
   */
  static getFairPlayLicenseUrl(element) {
    if (shaka.drm.DrmUtils.isMediaKeysPolyfilled('apple')) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code
              .DASH_MSE_ENCRYPTED_LEGACY_APPLE_MEDIA_KEYS_NOT_SUPPORTED);
    }
    const dashIfLaurlNode = shaka.util.TXml.findChildNS(
        element.node, shaka.dash.ContentProtection.DashIfNamespaceUri_,
        'Laurl',
    );
    if (dashIfLaurlNode) {
      const textContents = shaka.util.TXml.getTextContents(dashIfLaurlNode);
      if (textContents) {
        return textContents;
      }
    }
    return '';
  }

  /**
   * Gets a Widevine license URL from a content protection element
   * containing a custom `ms:laurl` or 'dashif:Laurl' elements
   *
   * @param {shaka.dash.ContentProtection.Element} element
   * @return {string}
   */
  static getWidevineLicenseUrl(element) {
    const StringUtils = shaka.util.StringUtils;
    const dashIfLaurlNode = shaka.util.TXml.findChildNS(
        element.node, shaka.dash.ContentProtection.DashIfNamespaceUri_,
        'Laurl',
    );
    if (dashIfLaurlNode) {
      const textContents = shaka.util.TXml.getTextContents(dashIfLaurlNode);
      if (textContents) {
        return textContents;
      }
    }
    const msLaUrlNode = shaka.util.TXml.findChildNS(
        element.node, 'urn:microsoft', 'laurl');
    if (msLaUrlNode) {
      return StringUtils.htmlUnescape(
          msLaUrlNode.attributes['licenseUrl']) || '';
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
    const dashIfLaurlNode = shaka.util.TXml.findChildNS(
        element.node, shaka.dash.ContentProtection.DashIfNamespaceUri_,
        'Laurl',
    );
    if (dashIfLaurlNode) {
      const textContents = shaka.util.TXml.getTextContents(dashIfLaurlNode);
      if (textContents) {
        return textContents;
      }
    }
    const clearKeyLaurlNode = shaka.util.TXml.findChildNS(
        element.node, shaka.dash.ContentProtection.ClearKeyNamespaceUri_,
        'Laurl',
    );
    if (clearKeyLaurlNode &&
        clearKeyLaurlNode.attributes['Lic_type'] === 'EME-1.0') {
      if (clearKeyLaurlNode) {
        const textContents = shaka.util.TXml.getTextContents(clearKeyLaurlNode);
        if (textContents) {
          return textContents;
        }
      }
    }
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
    const TXml = shaka.util.TXml;
    const dashIfLaurlNode = TXml.findChildNS(
        element.node, shaka.dash.ContentProtection.DashIfNamespaceUri_,
        'Laurl',
    );
    if (dashIfLaurlNode) {
      const textContents = TXml.getTextContents(dashIfLaurlNode);
      if (textContents) {
        return textContents;
      }
    }

    const proNode = TXml.findChildNS(
        element.node, 'urn:microsoft:playready', 'pro');
    if (proNode) {
      const textContents = TXml.getTextContents(proNode);
      if (textContents) {
        return shaka.drm.PlayReady.getLicenseUrl(proNode);
      }
    }

    const psshNode = TXml.findChildNS(
        element.node, shaka.dash.ContentProtection.CencNamespaceUri_, 'pssh');
    if (psshNode) {
      const textContents = TXml.getTextContents(psshNode);
      if (textContents) {
        const proData = shaka.util.Pssh.getPsshData(
            shaka.util.Uint8ArrayUtils.fromBase64(textContents));
        const proString = shaka.util.Uint8ArrayUtils.toStandardBase64(proData);
        const reBuildProNode =
            TXml.parseXmlString('<pro>' + proString + '</pro>');
        goog.asserts.assert(reBuildProNode, 'Must have pro node');
        return shaka.drm.PlayReady.getLicenseUrl(reBuildProNode);
      }
    }

    return '';
  }

  /**
   * Gets a PlayReady initData from a content protection element
   * containing a PlayReady Pro Object
   *
   * @param {shaka.dash.ContentProtection.Element} element
   * @return {?Array<shaka.extern.InitDataOverride>}
   * @private
   */
  static getInitDataFromPro_(element) {
    const proNode = shaka.util.TXml.findChildNS(
        element.node, 'urn:microsoft:playready', 'pro');
    if (!proNode || !shaka.util.TXml.getTextContents(proNode)) {
      return null;
    }

    const Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;
    const textContent =
    /** @type {string} */ (shaka.util.TXml.getTextContents(proNode));
    const data = Uint8ArrayUtils.fromBase64(textContent);
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
   * @param {!Set<string>} keyIds
   * @return {?Array<shaka.extern.InitDataOverride>}
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
   * @param {Array<shaka.extern.InitDataOverride>} defaultInit
   * @param {string} encryptionScheme
   * @param {!Array<shaka.dash.ContentProtection.Element>} elements
   * @param {!Object<string, string>} keySystemsByURI
   * @param {!Set<string>} keyIds
   * @return {!Array<shaka.extern.DrmInfo>}
   * @private
   */
  static convertElements_(defaultInit, encryptionScheme, elements,
      keySystemsByURI, keyIds) {
    const ContentProtection = shaka.dash.ContentProtection;
    const ManifestParserUtils = shaka.util.ManifestParserUtils;
    const licenseUrlParsers = ContentProtection.licenseUrlParsers_;

    /** @type {!Array<shaka.extern.DrmInfo>} */
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
        const info = ManifestParserUtils.createDrmInfo(
            keySystem, encryptionScheme, initData);
        const licenseParser = licenseUrlParsers.get(keySystem);
        if (licenseParser) {
          info.licenseServerUri = licenseParser(element);
        }
        info.serverCertificateUri =
            ContentProtection.getServerCertificateUri(element);

        out.push(info);
      }
    }

    return out;
  }

  /**
   * Gets a server certificate URL from a content protection element
   * containing a 'dashif:Certurl' element
   *
   * @param {shaka.dash.ContentProtection.Element} element
   * @return {string}
   */
  static getServerCertificateUri(element) {
    const dashIfCerturlNode = shaka.util.TXml.findChildNS(
        element.node, shaka.dash.ContentProtection.DashIfNamespaceUri_,
        'Certurl',
    );
    if (dashIfCerturlNode) {
      const textContents = shaka.util.TXml.getTextContents(dashIfCerturlNode);
      if (textContents) {
        return textContents;
      }
    }
    return '';
  }

  /**
   * Parses the given ContentProtection elements.  If there is an error, it
   * removes those elements.
   *
   * @param {!Array<!shaka.extern.xml.Node>} elements
   * @return {!Array<shaka.dash.ContentProtection.Element>}
   * @private
   */
  parseElements_(elements) {
    /** @type {!Array<shaka.dash.ContentProtection.Element>} */
    const out = [];

    for (const element of elements) {
      const parsed = this.parseElement_(element);
      if (parsed) {
        out.push(parsed);
      }
    }

    return out;
  }

  /**
   * Parses the given ContentProtection element.
   *
   * @param {!shaka.extern.xml.Node} elem
   * @return {?shaka.dash.ContentProtection.Element}
   * @private
   */
  parseElement_(elem) {
    const NS = shaka.dash.ContentProtection.CencNamespaceUri_;
    const TXml = shaka.util.TXml;

    /** @type {?string} */
    let schemeUri = elem.attributes['schemeIdUri'];
    /** @type {?string} */
    let keyId = TXml.getAttributeNS(elem, NS, 'default_KID');
    /** @type {!Array<string>} */
    const psshs = TXml.findChildrenNS(elem, NS, 'pssh')
        .map(TXml.getContents);

    const encryptionScheme = elem.attributes['value'];

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

    /** @type {!Array<shaka.extern.InitDataOverride>} */
    let init = [];
    try {
      // Try parsing PSSH data.
      init = psshs.map((pssh) => {
        if (!this.psshToInitData_.has(pssh)) {
          const initData = shaka.util.Uint8ArrayUtils.fromBase64(pssh);
          this.psshToInitData_.set(pssh, initData);
        }
        return {
          initDataType: 'cenc',
          initData: this.psshToInitData_.get(pssh),
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
      schemeUri,
      keyId,
      init: (init.length > 0 ? init : null),
      encryptionScheme,
    };
  }

  /**
   * Parses the given AES-128 ContentProtection element.
   *
   * @param {shaka.dash.ContentProtection.Element} element
   * @return {?shaka.dash.ContentProtection.Aes128Info}
   * @private
   */
  static parseAes128_(element) {
    // Check if the Web Crypto API is available.
    if (!window.crypto || !window.crypto.subtle) {
      shaka.log.alwaysWarn('Web Crypto API is not available to decrypt ' +
          'AES-128. (Web Crypto only exists in secure origins like https)');
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.NO_WEB_CRYPTO_API);
    }

    const namespace = 'urn:mpeg:dash:schema:sea:2012';
    const segmentEncryption = shaka.util.TXml.findChildNS(
        element.node, namespace, 'SegmentEncryption');

    if (!segmentEncryption) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_UNSUPPORTED_AES_128);
    }

    const aesSchemeIdUri = 'urn:mpeg:dash:sea:aes128-cbc:2013';
    const segmentEncryptionSchemeIdUri =
        segmentEncryption.attributes['schemeIdUri'];
    if (segmentEncryptionSchemeIdUri != aesSchemeIdUri) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_UNSUPPORTED_AES_128);
    }

    const cryptoPeriod = shaka.util.TXml.findChildNS(
        element.node, namespace, 'CryptoPeriod');

    if (!cryptoPeriod) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_UNSUPPORTED_AES_128);
    }

    const ivHex = cryptoPeriod.attributes['IV'];
    const keyUri = shaka.util.StringUtils.htmlUnescape(
        cryptoPeriod.attributes['keyUriTemplate']);
    if (!ivHex || !keyUri) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_UNSUPPORTED_AES_128);
    }

    // Exclude 0x at the start of string.
    const iv = shaka.util.Uint8ArrayUtils.fromHex(ivHex.substr(2));
    if (iv.byteLength != 16) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.AES_128_INVALID_IV_LENGTH);
    }

    return {
      keyUri,
      iv,
    };
  }
};

/**
 * @typedef {{
 *   defaultKeyId: ?string,
 *   defaultInit: Array<shaka.extern.InitDataOverride>,
 *   drmInfos: !Array<shaka.extern.DrmInfo>,
 *   aes128Info: ?shaka.dash.ContentProtection.Aes128Info,
 *   firstRepresentation: boolean,
 * }}
 *
 * @description
 * Contains information about the ContentProtection elements found at the
 * AdaptationSet level.
 *
 * @property {?string} defaultKeyId
 *   The default key ID to use.  This is used by parseKeyIds as a default.  This
 *   can be null to indicate that there is no default.
 * @property {Array<shaka.extern.InitDataOverride>} defaultInit
 *   The default init data override.  This can be null to indicate that there
 *   is no default.
 * @property {!Array<shaka.extern.DrmInfo>} drmInfos
 *   The DrmInfo objects.
 * @property {?shaka.dash.ContentProtection.Aes128Info} aes128Info
 *   The AES-128 key info.
 * @property {boolean} firstRepresentation
 *   True when first parsed; changed to false after the first call to
 *   parseKeyIds.  This is used to determine if a dummy key-system should be
 *   overwritten; namely that the first representation can replace the dummy
 *   from the AdaptationSet.
 */
shaka.dash.ContentProtection.Context;

/**
 * @typedef {{
 *   keyUri: string,
 *   iv: !Uint8Array,
 * }}
 *
 * @description
 * Contains information about the AES-128 keyUri and IV found at the
 * AdaptationSet level.
 *
 * @property {string} method
 *   The keyUri in the manifest.
 * @property {!Uint8Array} iv
 *   The IV in the manifest.
 */
shaka.dash.ContentProtection.Aes128Info;

/**
 * @typedef {{
 *   node: !shaka.extern.xml.Node,
 *   schemeUri: string,
 *   keyId: ?string,
 *   init: Array<shaka.extern.InitDataOverride>,
 *   encryptionScheme: ?string,
 * }}
 *
 * @description
 * The parsed result of a single ContentProtection element.
 *
 * @property {!shaka.extern.xml.Node} node
 *   The ContentProtection XML element.
 * @property {string} schemeUri
 *   The scheme URI.
 * @property {?string} keyId
 *   The default key ID, if present.
 * @property {Array<shaka.extern.InitDataOverride>} init
 *   The init data, if present.  If there is no init data, it will be null.  If
 *   this is non-null, there is at least one element.
 * @property {?string} encryptionScheme
 *   The encryption scheme, if present.
 */
shaka.dash.ContentProtection.Element;

/**
 * A map of key system name to license server url parser.
 *
 * @const {!Map<string, function(shaka.dash.ContentProtection.Element)>}
 * @private
 */
shaka.dash.ContentProtection.licenseUrlParsers_ = new Map()
    .set('com.apple.fps',
        shaka.dash.ContentProtection.getFairPlayLicenseUrl)
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
shaka.dash.ContentProtection.Aes128Protection_ =
    'urn:mpeg:dash:sea:2012';


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
