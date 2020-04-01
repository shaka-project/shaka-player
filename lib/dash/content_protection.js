/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

goog.provide('shaka.dash.ContentProtection');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.util.Error');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.Pssh');
goog.require('shaka.util.Uint8ArrayUtils');
goog.require('shaka.util.XmlUtils');


/**
 * @namespace shaka.dash.ContentProtection
 * @summary A set of functions for parsing and interpreting ContentProtection
 *   elements.
 */


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
 * A map of scheme URI to key system name.
 *
 * @const {!Map.<string, string>}
 * @private
 */
shaka.dash.ContentProtection.defaultKeySystems_ = new Map()
    .set('urn:uuid:1077efec-c0b2-4d02-ace3-3c1e52e2fb4b',
         'org.w3.clearkey')
    .set('urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed',
         'com.widevine.alpha')
    .set('urn:uuid:9a04f079-9840-4286-ab92-e65be0885f95',
         'com.microsoft.playready')
    .set('urn:uuid:79f0049a-4098-8642-ab92-e65be0885f95',
        'com.microsoft.playready')
    .set('urn:uuid:f239e769-efa3-4850-9c16-a903c6932efb',
         'com.adobe.primetime');


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
 * Parses info from the ContentProtection elements at the AdaptationSet level.
 *
 * @param {!Array.<!Element>} elems
 * @param {shaka.extern.DashContentProtectionCallback} callback
 * @param {boolean} ignoreDrmInfo
 * @return {shaka.dash.ContentProtection.Context}
 */
shaka.dash.ContentProtection.parseFromAdaptationSet = function(
    elems, callback, ignoreDrmInfo) {
  const ContentProtection = shaka.dash.ContentProtection;
  const ManifestParserUtils = shaka.util.ManifestParserUtils;
  let parsed = ContentProtection.parseElements_(elems);
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
    parsedNonCenc = parsed.filter(function(elem) {
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
          defaultInit, callback, parsedNonCenc);

      // If there are no drmInfos after parsing, then add a dummy entry.
      // This may be removed in parseKeyIds.
      if (drmInfos.length == 0) {
        drmInfos = [ManifestParserUtils.createDrmInfo('', defaultInit)];
      }
    }
  }

  // If there are only CENC element(s) or ignoreDrmInfo flag is set, assume all
  // key-systems are supported.
  if (parsed.length && (ignoreDrmInfo || !parsedNonCenc.length)) {
    drmInfos = [];

    const keySystems = ContentProtection.defaultKeySystems_;
    for (const keySystem of keySystems.values()) {
      // If the manifest doesn't specify any key systems, we shouldn't
      // put clearkey in this list.  Otherwise, it may be triggered when
      // a real key system should be used instead.
      if (keySystem != 'org.w3.clearkey') {
        const info = ManifestParserUtils.createDrmInfo(keySystem, defaultInit);
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
};


/**
 * Parses the given ContentProtection elements found at the Representation
 * level.  This may update the |context|.
 *
 * @param {!Array.<!Element>} elems
 * @param {shaka.extern.DashContentProtectionCallback} callback
 * @param {shaka.dash.ContentProtection.Context} context
 * @param {boolean} ignoreDrmInfo
 * @return {?string} The parsed key ID
 */
shaka.dash.ContentProtection.parseFromRepresentation = function(
    elems, callback, context, ignoreDrmInfo) {
  const ContentProtection = shaka.dash.ContentProtection;
  let repContext = ContentProtection.parseFromAdaptationSet(
      elems, callback, ignoreDrmInfo);

  if (context.firstRepresentation) {
    let asUnknown = context.drmInfos.length == 1 &&
        !context.drmInfos[0].keySystem;
    let asUnencrypted = context.drmInfos.length == 0;
    let repUnencrypted = repContext.drmInfos.length == 0;

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
    context.drmInfos = context.drmInfos.filter(function(asInfo) {
      return repContext.drmInfos.some(function(repInfo) {
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
};


/**
 * Gets a Widevine license URL from a content protection element
 * containing a custom `ms:laurl` element
 *
 * @param {shaka.dash.ContentProtection.Element} element
 * @return {string}
 */
shaka.dash.ContentProtection.getWidevineLicenseUrl = function(element) {
  const mslaurlNode = shaka.util.XmlUtils.findChildNS(
    element.node, 'urn:microsoft', 'laurl');
  if (mslaurlNode) {
    return mslaurlNode.getAttribute('licenseUrl') || '';
  }
  return '';
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
 * Parses an Array buffer starting at byteOffset for PlayReady Object Records.
 * Each PRO Record is preceded by its PlayReady Record type and length in bytes.
 *
 * PlayReady Object Record format: https://goo.gl/FTcu46
 *
 * @param {!ArrayBuffer} recordData
 * @param {number} byteOffset
 * @return {!Array.<shaka.dash.ContentProtection.PlayReadyRecord>}
 * @private
 */
shaka.dash.ContentProtection.parseMsProRecords_ = function(
  recordData, byteOffset) {
  const records = [];
  const view = new DataView(recordData);

  while (byteOffset < recordData.byteLength - 1) {
    const type = view.getUint16(byteOffset, true);
    byteOffset += 2;

    const byteLength = view.getUint16(byteOffset, true);
    byteOffset += 2;

    goog.asserts.assert(
      (byteLength & 1) === 0,
      'expected byteLength to be an even number');

    const recordValue = new Uint8Array(recordData, byteOffset, byteLength);

    records.push({
      type: type,
      value: recordValue,
    });

    byteOffset += byteLength;
  }

  return records;
};


/**
 * Parses an ArrayBuffer for PlayReady Objects.  The data
 * should contain a 32-bit integer indicating the length of
 * the PRO in bytes.  Following that, a 16-bit integer for
 * the number of PlayReady Object Records in the PRO.  Lastly,
 * a byte array of the PRO Records themselves.
 *
 * PlayReady Object format: https://goo.gl/W8yAN4
 *
 * @param {!ArrayBuffer} data
 * @return {!Array.<shaka.dash.ContentProtection.PlayReadyRecord>}
 * @private
 */
shaka.dash.ContentProtection.parseMsPro_ = function(data) {
  let byteOffset = 0;
  const view = new DataView(data);

  // First 4 bytes is the PRO length (DWORD)
  const byteLength = view.getUint32(byteOffset, true /* littleEndian */);
  byteOffset += 4;

  if (byteLength !== data.byteLength) {
    // Malformed PRO
    shaka.log.warning('PlayReady Object with invalid length encountered.');
    return [];
  }

  // Skip PRO Record count (WORD)
  byteOffset += 2;

  // Rest of the data contains the PRO Records
  const ContentProtection = shaka.dash.ContentProtection;
  return ContentProtection.parseMsProRecords_(data, byteOffset);
};


/**
 * PlayReady Header format: https://goo.gl/dBzxNA
 *
 * @param {!Element} xml
 * @return {string}
 * @private
 */
shaka.dash.ContentProtection.getLaurl_ = function(xml) {
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
};


/**
 * Gets a PlayReady license URL from a content protection element
 * containing a PlayReady Header Object
 *
 * @param {shaka.dash.ContentProtection.Element} element
 * @return {string}
 */
shaka.dash.ContentProtection.getPlayReadyLicenseUrl = function(element) {
  const proNode = shaka.util.XmlUtils.findChildNS(
    element.node, 'urn:microsoft:playready', 'pro');

  if (!proNode) {
    return '';
  }

  const ContentProtection = shaka.dash.ContentProtection;
  const PLAYREADY_RECORD_TYPES = ContentProtection.PLAYREADY_RECORD_TYPES;

  const bytes = shaka.util.Uint8ArrayUtils.fromBase64(proNode.textContent);
  const records = ContentProtection.parseMsPro_(bytes.buffer);
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
};


/**
 * Gets a PlayReady initData from a content protection element
 * containing a PlayReady Pro Object
 *
 * @param {shaka.dash.ContentProtection.Element} element
 * @return {?Array.<shaka.extern.InitDataOverride>}
 * @private
 */
shaka.dash.ContentProtection.getInitDataFromPro_ = function(element) {
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
  const pssh = shaka.util.Pssh.createPssh(data, systemId);
  return [
    {
      initData: pssh,
      initDataType: 'cenc',
      keyId: element.keyId,
    },
  ];
};

/**
 * Creates DrmInfo objects from the given element.
 *
 * @param {Array.<shaka.extern.InitDataOverride>} defaultInit
 * @param {shaka.extern.DashContentProtectionCallback} callback
 * @param {!Array.<shaka.dash.ContentProtection.Element>} elements
 * @return {!Array.<shaka.extern.DrmInfo>}
 * @private
 */
shaka.dash.ContentProtection.convertElements_ = function(
  defaultInit, callback, elements) {
  const ContentProtection = shaka.dash.ContentProtection;
  const ManifestParserUtils = shaka.util.ManifestParserUtils;
  const defaultKeySystems = ContentProtection.defaultKeySystems_;
  const licenseUrlParsers = ContentProtection.licenseUrlParsers_;

  /** @type {!Array.<shaka.extern.DrmInfo>} */
  const out = [];

  for (const element of elements) {
    const keySystem = defaultKeySystems.get(element.schemeUri);
    if (keySystem) {
      goog.asserts.assert(
          !element.init || element.init.length,
          'Init data must be null or non-empty.');

        const proInitData = ContentProtection.getInitDataFromPro_(element);
        const initData = element.init || defaultInit || proInitData;
      const info = ManifestParserUtils.createDrmInfo(keySystem, initData);
      const licenseParser = licenseUrlParsers.get(keySystem);
      if (licenseParser) {
        info.licenseServerUri = licenseParser(element);
      }

      out.push(info);
    } else {
      goog.asserts.assert(callback, 'ContentProtection callback is required');
      const infos = callback(element.node) || [];
      for (const info of infos) {
        out.push(info);
      }
    }
  }

  return out;
};


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
         shaka.dash.ContentProtection.getPlayReadyLicenseUrl);


/**
 * Parses the given ContentProtection elements.  If there is an error, it
 * removes those elements.
 *
 * @param {!Array.<!Element>} elems
 * @return {!Array.<shaka.dash.ContentProtection.Element>}
 * @private
 */
shaka.dash.ContentProtection.parseElements_ = function(elems) {
  /** @type {!Array.<shaka.dash.ContentProtection.Element>} */
  const out = [];

  for (const elem of elems) {
    const parsed = shaka.dash.ContentProtection.parseElement_(elem);
    if (parsed) {
      out.push(parsed);
    }
  }

  return out;
};


/**
 * Parses the given ContentProtection element.
 *
 * @param {!Element} elem
 * @return {?shaka.dash.ContentProtection.Element}
 * @private
 */
shaka.dash.ContentProtection.parseElement_ = function(elem) {
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
};
