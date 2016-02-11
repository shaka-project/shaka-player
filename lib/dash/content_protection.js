/**
 * @license
 * Copyright 2015 Google Inc.
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

goog.require('shaka.util.XmlUtils');


/**
 * @typedef {{
 *   defaultKeyId: ?string,
 *   defaultInit: Array.<shakaExtern.InitDataOverride>,
 *   drmInfo: !Array.<shakaExtern.DrmInfo>
 * }}
 *
 * @description
 * Contains information about the ContentProtection elements found at the
 * AdaptationSet level.
 *
 * @property {?string} defaultKeyId
 *   The default key ID to use.  This can be overridden for specific key
 *   systems.  This is used by parseKeyIds as a default.  This can be null
 *   to indicate that there is no default.
 * @property {Array.<shakaExtern.InitDataOverride>} defaultInit
 *   The default init data override.  This can be null to indicate that there
 *   is no default.
 * @property {!Array.<shakaExtern.DrmInfo>} drmInfo
 *   The DrmInfo objects.
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
 * @param {?shakaExtern.DashContentProtectionCallback} callback
 * @return {shaka.dash.ContentProtection.Context}
 */
shaka.dash.ContentProtection.parseFromAdaptationSet = function(
    elems, callback) {
  var ContentProtection = shaka.dash.ContentProtection;
  var parsed = ContentProtection.parseElements_(elems);

  // Find the default key ID and init data.  Create a new array of all the
  // non-CENC elements.
  /** @type {?string} */
  var defaultKeyId = null;
  /** @type {Array.<shakaExtern.InitDataOverride>} */
  var defaultInit = null;
  var parsedNonCenc = parsed.filter(function(elem) {
    if (elem.schemeUri == ContentProtection.MP4Protection_) {
      shaka.asserts.assert(!elem.init || elem.init.length,
                           'Init data must be null or non-empty.');
      defaultKeyId = elem.keyId || defaultKeyId;
      defaultInit = elem.init || defaultInit;
      return false;
    } else {
      return true;
    }
  });

  /** @type {!Array.<shakaExtern.DrmInfo>} */
  var drmInfo = [];
  if (parsedNonCenc.length > 0) {
    drmInfo = ContentProtection.convertElements_(
        defaultInit, callback, parsedNonCenc);
  } else if (parsed.length > 0) {
    // If there are only CENC element(s), then assume all key-systems are
    // supported.
    var keySystems = ContentProtection.defaultKeySystems_;
    drmInfo =
        Object.keys(keySystems)
            .map(function(uri) { return keySystems[uri]; })
            .map(function(keySystem) {
              return ContentProtection.createDrmInfo_(keySystem, defaultInit);
            });
  }

  return {
    defaultKeyId: defaultKeyId,
    defaultInit: defaultInit,
    drmInfo: drmInfo
  };
};


/**
 * Parses the key IDs from the given ContentProtection elements.
 *
 * @param {!Array.<!Element>} elems
 * @param {shaka.dash.ContentProtection.Context} context
 * @return {!Array.<string>}
 */
shaka.dash.ContentProtection.parseKeyIds = function(elems, context) {
  var ContentProtection = shaka.dash.ContentProtection;
  var parsed = ContentProtection.parseElements_(elems);

  // Find the default key ID and init data.  Create a new array of all the
  // non-CENC elements.
  /** @type {?string} */
  var defaultKeyId = context.defaultKeyId;
  var parsedNonCenc = parsed.filter(function(elem) {
    if (elem.schemeUri == ContentProtection.MP4Protection_) {
      defaultKeyId = elem.keyId || defaultKeyId;
      return false;
    } else {
      return true;
    }
  });

  if (parsedNonCenc.length > 0) {
    return parsedNonCenc.map(function(element) { return element.keyId; });
  } else if (defaultKeyId) {
    return [defaultKeyId];
  } else {
    return [];
  }
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
    robustness: '',
    serverCertificate: null,
    initData: initData || []
  };
};


/**
 * Creates DrmInfo objects from the given element.
 *
 * @param {Array.<shakaExtern.InitDataOverride>} defaultInit
 * @param {?shakaExtern.DashContentProtectionCallback} callback
 * @param {!Array.<shaka.dash.ContentProtection.Element>} elements
 * @return {!Array.<shakaExtern.DrmInfo>}
 * @private
 */
shaka.dash.ContentProtection.convertElements_ = function(
    defaultInit, callback, elements) {
  return elements.map(
      /** @return {!Array.<shakaExtern.DrmInfo>} */
      function(element) {
        var ContentProtection = shaka.dash.ContentProtection;
        var keySystem = ContentProtection.defaultKeySystems_[element.schemeUri];
        if (keySystem) {
          shaka.asserts.assert(!element.init || element.init.length,
                               'Init data must be null or non-empty.');
          var initData = element.init || defaultInit;
          return [ContentProtection.createDrmInfo_(keySystem, initData)];
        } else if (callback) {
          return callback(element.node) || [];
        }

        shaka.log.warning('Unrecognized schemeIdUri', element.schemeUri,
                          'ignoring', element.node);
        return [];
      }).reduce(function(all, part) { return all.concat(part); }, []);
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
  return elems.map(
      /** @return {?shaka.dash.ContentProtection.Element} */
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
          shaka.log.error('Invalid base64 encoding in PSSH data', elem);
          return null;
        }

        /** @type {shaka.dash.ContentProtection.Element} */
        var element = {
          node: elem,
          schemeUri: schemeUri,
          keyId: keyId,
          init: (init.length > 0 ? init : null)
        };
        return element;
      }).filter(function(e) { return e != null; });
};

