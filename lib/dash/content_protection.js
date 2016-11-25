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
goog.require('shaka.util.Functional');
goog.require('shaka.util.MapUtils');
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
 *   defaultInit: Array.<shakaExtern.InitDataOverride>,
 *   drmInfos: !Array.<shakaExtern.DrmInfo>,
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
 * @property {Array.<shakaExtern.InitDataOverride>} defaultInit
 *   The default init data override.  This can be null to indicate that there
 *   is no default.
 * @property {!Array.<shakaExtern.DrmInfo>} drmInfos
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
 *   init: Array.<shakaExtern.InitDataOverride>
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
 * @property {Array.<shakaExtern.InitDataOverride>} init
 *   The init data, if present.  If there is no init data, it will be null.  If
 *   this is non-null, there is at least one element.
 */
shaka.dash.ContentProtection.Element;


/**
 * A map of scheme URI to key system name.
 *
 * @const {!Object.<string, string>}
 * @private
 */
shaka.dash.ContentProtection.defaultKeySystems_ = {
  'urn:uuid:1077efec-c0b2-4d02-ace3-3c1e52e2fb4b': 'org.w3.clearkey',
  'urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed': 'com.widevine.alpha',
  'urn:uuid:9a04f079-9840-4286-ab92-e65be0885f95': 'com.microsoft.playready',
  'urn:uuid:f239e769-efa3-4850-9c16-a903c6932efb': 'com.adobe.primetime'
};


/**
 * @const {string}
 * @private
 */
shaka.dash.ContentProtection.MP4Protection_ =
    'urn:mpeg:dash:mp4protection:2011';


/**
 * Parses info from the ContentProtection elements at the AdaptationSet level.
 *
 * @param {!Array.<!Element>} elems
 * @param {shakaExtern.DashContentProtectionCallback} callback
 * @return {shaka.dash.ContentProtection.Context}
 */
shaka.dash.ContentProtection.parseFromAdaptationSet = function(
    elems, callback) {
  var ContentProtection = shaka.dash.ContentProtection;
  var Functional = shaka.util.Functional;
  var MapUtils = shaka.util.MapUtils;
  var parsed = ContentProtection.parseElements_(elems);

  // Find the default key ID and init data.  Create a new array of all the
  // non-CENC elements.
  /** @type {Array.<shakaExtern.InitDataOverride>} */
  var defaultInit = null;
  var parsedNonCenc = parsed.filter(function(elem) {
    if (elem.schemeUri == ContentProtection.MP4Protection_) {
      goog.asserts.assert(!elem.init || elem.init.length,
                          'Init data must be null or non-empty.');
      defaultInit = elem.init || defaultInit;
      return false;
    } else {
      return true;
    }
  });

  // Get the default key ID; if there are multiple, they must all match.
  var keyIds = parsed.map(function(elem) { return elem.keyId; })
    .filter(Functional.isNotNull);
  /** @type {?string} */
  var defaultKeyId = null;
  if (keyIds.length > 0) {
    defaultKeyId = keyIds[0];
    if (keyIds.some(Functional.isNotEqualFunc(defaultKeyId))) {
      throw new shaka.util.Error(
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_CONFLICTING_KEY_IDS);
    }
  }

  /** @type {!Array.<shakaExtern.DrmInfo>} */
  var drmInfos = [];
  if (parsedNonCenc.length > 0) {
    drmInfos = ContentProtection.convertElements_(
        defaultInit, callback, parsedNonCenc);

    // If there are no drmInfos after parsing, then add a dummy entry.  This may
    // be removed in parseKeyIds.
    if (drmInfos.length == 0) {
      drmInfos = [ContentProtection.createDrmInfo_('', defaultInit)];
    }
  } else if (parsed.length > 0) {
    // If there are only CENC element(s), then assume all key-systems are
    // supported.
    var keySystems = ContentProtection.defaultKeySystems_;
    drmInfos =
        MapUtils.values(keySystems)
            .map(function(keySystem) {
              return ContentProtection.createDrmInfo_(keySystem, defaultInit);
            });
  }

  return {
    defaultKeyId: defaultKeyId,
    defaultInit: defaultInit,
    drmInfos: drmInfos,
    firstRepresentation: true
  };
};


/**
 * Parses the given ContentProtection elements found at the Representation
 * level.  This may update the |context|.
 *
 * @param {!Array.<!Element>} elems
 * @param {shakaExtern.DashContentProtectionCallback} callback
 * @param {shaka.dash.ContentProtection.Context} context
 * @return {?string} The parsed key ID
 */
shaka.dash.ContentProtection.parseFromRepresentation = function(
    elems, callback, context) {
  var ContentProtection = shaka.dash.ContentProtection;
  var repContext = ContentProtection.parseFromAdaptationSet(elems, callback);

  if (context.firstRepresentation) {
    var asUnknown = context.drmInfos.length == 1 &&
        !context.drmInfos[0].keySystem;
    var asUnencrypted = context.drmInfos.length == 0;
    var repUnencrypted = repContext.drmInfos.length == 0;

    // There are two cases when we need to replace the |drmInfos| in the context
    // with those in the Representation:
    // * The AdaptationSet does not list any ContentProtection.
    // * The AdaptationSet only lists unknown key-systems.
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
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_NO_COMMON_KEY_SYSTEM);
    }
  }

  return repContext.defaultKeyId || context.defaultKeyId;
};


/**
 * Creates a DrmInfo object from the given info.
 *
 * @param {string} keySystem
 * @param {Array.<shakaExtern.InitDataOverride>} initData
 * @return {shakaExtern.DrmInfo}
 * @private
 */
shaka.dash.ContentProtection.createDrmInfo_ = function(keySystem, initData) {
  return {
    keySystem: keySystem,
    licenseServerUri: '',
    distinctiveIdentifierRequired: false,
    persistentStateRequired: false,
    audioRobustness: '',
    videoRobustness: '',
    serverCertificate: null,
    initData: initData || [],
    keyIds: []
  };
};


/**
 * Creates DrmInfo objects from the given element.
 *
 * @param {Array.<shakaExtern.InitDataOverride>} defaultInit
 * @param {shakaExtern.DashContentProtectionCallback} callback
 * @param {!Array.<shaka.dash.ContentProtection.Element>} elements
 * @return {!Array.<shakaExtern.DrmInfo>}
 * @private
 */
shaka.dash.ContentProtection.convertElements_ = function(
    defaultInit, callback, elements) {
  var Functional = shaka.util.Functional;
  return elements.map(
      /**
       * @param {shaka.dash.ContentProtection.Element} element
       * @return {!Array.<shakaExtern.DrmInfo>}
       */
      function(element) {
        var ContentProtection = shaka.dash.ContentProtection;
        var keySystem = ContentProtection.defaultKeySystems_[element.schemeUri];
        if (keySystem) {
          goog.asserts.assert(!element.init || element.init.length,
                              'Init data must be null or non-empty.');
          var initData = element.init || defaultInit;
          return [ContentProtection.createDrmInfo_(keySystem, initData)];
        } else {
          goog.asserts.assert(
              callback, 'ContentProtection callback is required');
          return callback(element.node) || [];
        }
      }).reduce(Functional.collapseArrays, []);
};


/**
 * Parses the given ContentProtection elements.  If there is an error, it
 * removes those elements.
 *
 * @param {!Array.<!Element>} elems
 * @return {!Array.<shaka.dash.ContentProtection.Element>}
 * @private
 */
shaka.dash.ContentProtection.parseElements_ = function(elems) {
  var Functional = shaka.util.Functional;
  return elems.map(
      /**
       * @param {!Element} elem
       * @return {?shaka.dash.ContentProtection.Element}
       */
      function(elem) {
        /** @type {?string} */
        var schemeUri = elem.getAttribute('schemeIdUri');
        /** @type {?string} */
        var keyId = elem.getAttribute('cenc:default_KID');
        /** @type {!Array.<string>} */
        var psshs = shaka.util.XmlUtils.findChildren(elem, 'cenc:pssh')
                        .map(shaka.util.XmlUtils.getContents);

        if (!schemeUri) {
          shaka.log.error('Missing required schemeIdUri attribute on',
                          'ContentProtection element', elem);
          return null;
        }

        schemeUri = schemeUri.toLowerCase();
        if (keyId) {
          keyId = keyId.replace(/-/g, '').toLowerCase();
          if (keyId.indexOf(' ') >= 0) {
            throw new shaka.util.Error(
                shaka.util.Error.Category.MANIFEST,
                shaka.util.Error.Code.DASH_MULTIPLE_KEY_IDS_NOT_SUPPORTED);
          }
        }

        /** @type {!Array.<shakaExtern.InitDataOverride>} */
        var init = [];
        try {
          init = psshs.map(function(pssh) {
            /** @type {shakaExtern.InitDataOverride} */
            var ret = {
              initDataType: 'cenc',
              initData: shaka.util.Uint8ArrayUtils.fromBase64(pssh)
            };
            return ret;
          });
        } catch (e) {
          // Invalid PSSH data, ignore.
          throw new shaka.util.Error(
              shaka.util.Error.Category.MANIFEST,
              shaka.util.Error.Code.DASH_PSSH_BAD_ENCODING);
        }

        /** @type {shaka.dash.ContentProtection.Element} */
        var element = {
          node: elem,
          schemeUri: schemeUri,
          keyId: keyId,
          init: (init.length > 0 ? init : null)
        };
        return element;
      }).filter(Functional.isNotNull);
};

