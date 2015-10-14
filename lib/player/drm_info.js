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

goog.provide('shaka.player.DrmInfo');

goog.require('shaka.asserts');
goog.require('shaka.util.ArrayUtils');
goog.require('shaka.util.Uint8ArrayUtils');



/**
 * Creates a DrmInfo, which represents a set of DRM configuration options.
 * DrmInfo is an internal class, please see
 * {@link shaka.player.DashVideoSource.ContentProtectionCallback},
 * {@link shaka.player.HttpVideoSource}, and
 * {@link shaka.player.DrmInfo.Config} for information on how to configure the
 * key system from the application.
 *
 * @constructor
 * @struct
 * @see {shaka.player.DashVideoSource.ContentProtectionCallback}
 * @see {shaka.player.DrmInfo.Config}
 * @exportDoc
 */
shaka.player.DrmInfo = function() {
  /**
   * An empty string indicates no key system.
   * @type {string}
   */
  this.keySystem = '';

  /** @type {string} */
  this.licenseServerUrl = '';

  /** @type {boolean} */
  this.withCredentials = false;

  /** @type {?shaka.player.DrmInfo.LicensePostProcessor} */
  this.licensePostProcessor = null;

  /** @type {?shaka.player.DrmInfo.LicensePreProcessor} */
  this.licensePreProcessor = null;

  /** @type {boolean} */
  this.distinctiveIdentifierRequired = false;

  /** @type {boolean} */
  this.persistentStateRequired = false;

  /** @type {string} */
  this.audioRobustness = '';

  /** @type {string} */
  this.videoRobustness = '';

  /** @type {Uint8Array} */
  this.serverCertificate = null;

  /** @type {!Array.<shaka.player.DrmInfo.InitData>} */
  this.initDatas = [];
};


/**
 * @typedef {{initData: !Uint8Array, initDataType: string}}
 * @exportDoc
 */
shaka.player.DrmInfo.InitData;


/**
 * <p>
 * An object which represents a set of application provided DRM configuration
 * options.
 * </p>
 *
 * <p>
 * For encrypted content, an application must provide one or more DrmInfo.Config
 * objects to its VideoSource. For DASH content, the application can provide
 * Config objects to {@link shaka.player.DashVideoSource} via a callback
 * (see {@link shaka.player.DashVideoSource.ContentProtectionCallback}),
 * and for HTTP content, the application can provide a single Config object to
 * {@link shaka.player.HttpVideoSource} via HttpVideoSource's constructor.
 * </p>
 *
 * The following options are supported:
 * <ul>
 * <li>
 *   <b>keySystem</b>: string (required) <br>
 *   The key system, e.g., "com.widevine.alpha".
 *   A blank string indicates unencrypted content.
 *
 * <li>
 *   <b>licenseServerUrl</b>: string (required for streaming encrypted content)
 *   <br>
 *   The license server URL.
 *
 * <li>
 *   <b>withCredentials:</b> boolean <br>
 *   True if license requests should include cookies when sent cross-domain
 *   (see {@link http://goo.gl/pzY9F7}). Defaults to false.
 *
 * <li>
 *   <b>licensePostProcessor:</b> shaka.player.DrmInfo.LicensePostProcessor <br>
 *   A license post-processor that does application-specific post-processing on
 *   license responses.
 *
 * <li>
 *   <b>licensePreProcessor:</b> shaka.player.DrmInfo.LicensePreProcessor <br>
 *   A license pre-processor that does application-specific pre-processing on
 *   license requests.
 *
 * <li>
 *   <b>distinctiveIdentifierRequired:</b> boolean <br>
 *   True if the application requires the key system to support distinctive
 *   identifiers. Defaults to false.
 *
 * <li>
 *   <b>persistentStateRequired:</b> boolean <br>
 *   True if the application requires the key system to support persistent
 *   state, e.g., for persistent license storage. Defaults to false.
 *
 * <li>
 *   <b>audioRobustness:</b> string <br>
 *   A key system specific string that specifies an audio decrypt/decode
 *   security level.
 *
 * <li>
 *   <b>videoRobustness:</b> string <br>
 *   A key system specific string that specifies a video decrypt/decode
 *   security level.
 *
 * <li>
 *   <b>serverCertificate:</b> Uint8Array <br>
 *   An key system specific server certificate for authenticating license
 *   requests.
 *
 * <li>
 *   <b>initData:</b> shaka.player.DrmInfo.InitData <br>
 *   Explicit key system initialization data (initData value), which overrides
 *   both the initData given in the manifest, if any, and the initData in the
 *   actual content (which may be inspected via an EME 'encrypted' event).  The
 *   initDataType values and the formats that they correspond to are specified
 *   {@link http://goo.gl/hKBdff here}.
 * </ul>
 *
 * @typedef {Object.<string, *>}
 * @exportDoc
 */
shaka.player.DrmInfo.Config;


/**
 * <p>
 * A callback which does application-specific post-processing on license
 * responses before they are passed to the key system. The application can
 * set this callback in a {@link shaka.player.DrmInfo.Config} object.
 * </p>
 *
 * <p>
 * The parameter is the license response from the license server.
 * Must return the raw license.
 * </p>
 *
 * @example
 *     // Suppose the license server provides a JSON encoded license response
 *     // with the format {"header": header_string, "license": license_string}.
 *     // The application would need to use a license post-processor like
 *     // the following:
 *     var postProcessor = function(serverResponse) {
 *       // serverResponse is a Uint8Array, so decode it into an object.
 *       var json = String.fromCharCode.apply(null, serverResponse);
 *       var obj = JSON.parse(json);
 *
 *       var headerString = obj['header'];
 *       // Do something with the header...
 *
 *       // obj['license'] is a string, so encode it into a Uint8Array.
 *       var licenseString = obj['license'];
 *       var license = new Uint8Array(licenseString.split('').map(
 *           function(ch) { return ch.charCodeAt(0); }));
 *       return license;
 *     };
 *
 * @typedef {function(!Uint8Array):!Uint8Array}
 * @exportDoc
 */
shaka.player.DrmInfo.LicensePostProcessor;


/**
 * An object that describes a license request for license request
 * pre-processing (see {@link shaka.player.DrmInfo.LicensePreProcessor}).
 * <br>
 *
 * The following options are supported:
 * <ul>
 * <li>
 *   <b>url</b>: string (required) <br>
 *   The license server URL.
 *
 * <li>
 *   <b>body</b>: (ArrayBuffer|?string) <br>
 *   The license request's body.
 *
 * <li>
 *   <b>method</b>: string (required) <br>
 *   The HTTP request method, which must be either 'GET' or 'POST'.
 *
 * <li>
 *   <b>headers</b>: Object.<string, string> <br>
 *   Extra HTTP request headers as key-value pairs.
 * </ul>
 *
 * @typedef {Object.<string, *>}
 * @exportDoc
 */
shaka.player.DrmInfo.LicenseRequestInfo;


/**
 * <p>
 * A callback which does application-specific pre-processing on license
 * requests before they are sent to the license server. The application can
 * set this callback in a {@link shaka.player.DrmInfo.Config} object.
 * </p>
 *
 * <p>
 * The parameter is a {@link shaka.player.DrmInfo.LicenseRequestInfo}
 * object. The callback may modify the object's fields as it requires; some
 * fields are set to initial values:
 * <ul>
 * <li>
 *   The |url| field is initially set to the license server URL provided by the
 *   license request pre-processor's corresponding DrmInfo; it may be set
 *   to an arbitrary URL, or may be extended with extra query parameters.
 *
 * <li>
 *   The |body| field is initially set to the raw license request (an
 *   ArrayBuffer) emitted by the browser; it may be replaced (to another
 *   ArrayBuffer or string) or be removed entirely (e.g., if the server expects
 *   the raw license to be encoded in the URL).
 *
 * <li>
 *   The |method| field is initially set to 'POST', but may be set to 'GET'.
 *
 * <li>
 *   The |headers| field is initially an empty map; arbitrary request headers
 *   may be added as key-value pairs, e.g.,
 *   headers['Content-Type'] = 'application/x-www-form-urlencoded';
 * </ul>
 * </p>
 *
 * @example
 *     // Suppose the license server expects a license request to use a
 *     // base64 encoded payload and include special query parameters.
 *     // The application would need to use a license pre-processor like
 *     // the following:
 *     var preProcessor = function(requestInfo) {
 *       // Add query parameters.
 *       requestInfo.url += '?session=123&token=abc'
 *       // Encode the payload as base64.
 *       requestInfo.body = window.btoa(
 *           String.fromCharCode.apply(null, new Uint8Array(requestInfo.body)));
 *     };
 * @typedef {function(!shaka.player.DrmInfo.LicenseRequestInfo)}
 * @exportDoc
 */
shaka.player.DrmInfo.LicensePreProcessor;


/**
 * Creates a DrmInfo object from a Config object.
 *
 * @param {shaka.player.DrmInfo.Config} config
 * @throws TypeError if a configuration option has the wrong type.
 * @throws Error if the application fails to provide any required fields.
 * @return {!shaka.player.DrmInfo}
 */
shaka.player.DrmInfo.createFromConfig = function(config) {
  var drmInfo = new shaka.player.DrmInfo();

  if (!config) return drmInfo;

  // Alias.
  var MapUtils = shaka.util.MapUtils;

  var keySystem = MapUtils.getString(config, 'keySystem');
  if (keySystem != null) {
    drmInfo.keySystem = keySystem;
  } else {
    throw new Error('\'keySystem\' cannot be null.');
  }

  var licenseServerUrl = MapUtils.getString(config, 'licenseServerUrl');
  if (licenseServerUrl != null) {
    drmInfo.licenseServerUrl = licenseServerUrl;
  } else if (keySystem) {
    throw new Error('For encrypted streaming content, \'licenseServerUrl\' ' +
                    'cannot be null or empty.');
  }

  var withCredentials = MapUtils.getBoolean(config, 'withCredentials');
  if (withCredentials != null) {
    drmInfo.withCredentials = withCredentials;
  }

  var licensePostProcessor = MapUtils.getAsInstanceType(
      config, 'licensePostProcessor', Function);
  if (licensePostProcessor != null) {
    drmInfo.licensePostProcessor = licensePostProcessor;
  }

  var licensePreProcessor = MapUtils.getAsInstanceType(
      config, 'licensePreProcessor', Function);
  if (licensePreProcessor != null) {
    drmInfo.licensePreProcessor = licensePreProcessor;
  }

  var distinctiveIdentifierRequired = MapUtils.getBoolean(
      config, 'distinctiveIdentifierRequired');
  if (distinctiveIdentifierRequired != null) {
    drmInfo.distinctiveIdentifierRequired = distinctiveIdentifierRequired;
  }

  var persistentStateRequired = MapUtils.getBoolean(
      config, 'persistentStateRequired');
  if (persistentStateRequired != null) {
    drmInfo.persistentStateRequired = persistentStateRequired;
  }

  var audioRobustness = MapUtils.getString(config, 'audioRobustness');
  if (audioRobustness != null) {
    drmInfo.audioRobustness = audioRobustness;
  }

  var videoRobustness = MapUtils.getString(config, 'videoRobustness');
  if (videoRobustness != null) {
    drmInfo.videoRobustness = videoRobustness;
  }

  var serverCertificate = MapUtils.getAsInstanceType(
      config, 'serverCertificate', Uint8Array);
  if (serverCertificate != null) {
    drmInfo.serverCertificate = serverCertificate;
  }

  var initData = MapUtils.getAsInstanceType(config, 'initData', Object);
  if (initData) {
    var data = MapUtils.getAsInstanceType(initData, 'initData', Uint8Array);
    if (data == null) {
      throw new Error('\'initData.initData\' cannot be null.');
    }

    var dataType = MapUtils.getString(initData, 'initDataType');
    if (dataType == null) {
      throw new Error('\'initData.initDataType\' cannot be null.');
    }

    drmInfo.initDatas.push({
      'initData': new Uint8Array(data.buffer),
      'initDataType': dataType
    });
  }

  return drmInfo;
};


/**
 * Combines this DrmInfo object with another DrmInfo object to create a new
 * DrmInfo object.
 *
 * @param {!shaka.player.DrmInfo} other The other DrmInfo object, which should
 *     be compatible with this DrmInfo object.
 * @return {!shaka.player.DrmInfo}
 */
shaka.player.DrmInfo.prototype.combine = function(other) {
  if (!COMPILED && !this.isCompatible(other)) {
    shaka.log.warning(
        'combine() should only be called with a compatible DrmInfo object:',
        'this', this,
        'other', other);
  }

  var drmInfo = new shaka.player.DrmInfo();

  drmInfo.keySystem = this.keySystem;
  drmInfo.licenseServerUrl = this.licenseServerUrl;
  drmInfo.withCredentials = this.withCredentials;
  drmInfo.licensePostProcessor = this.licensePostProcessor;
  drmInfo.licensePreProcessor = this.licensePreProcessor;
  drmInfo.distinctiveIdentifierRequired = this.distinctiveIdentifierRequired;
  drmInfo.persistentStateRequired = this.persistentStateRequired;
  drmInfo.audioRobustness = this.audioRobustness;
  drmInfo.videoRobustness = this.videoRobustness;

  drmInfo.serverCertificate =
      this.serverCertificate ?
      new Uint8Array(this.serverCertificate.buffer) :
      null;

  drmInfo.addInitDatas(this.initDatas);
  drmInfo.addInitDatas(other.initDatas);

  return drmInfo;
};


/**
 * @param {!shaka.player.DrmInfo} other
 * @return {boolean} True if this DrmInfo is compatible with |other|;
 *     otherwise, return false.
 */
shaka.player.DrmInfo.prototype.isCompatible = function(other) {
  return (this.keySystem == other.keySystem) &&
         (this.licenseServerUrl == other.licenseServerUrl) &&
         (this.withCredentials == other.withCredentials) &&
         (this.licensePostProcessor == other.licensePostProcessor) &&
         (this.licensePreProcessor == other.licensePreProcessor) &&
         (this.distinctiveIdentifierRequired ==
          other.distinctiveIdentifierRequired) &&
         (this.persistentStateRequired == other.persistentStateRequired) &&
         (this.audioRobustness == other.audioRobustness) &&
         (this.videoRobustness == other.videoRobustness) &&
         (shaka.util.Uint8ArrayUtils.equal(this.serverCertificate,
                                           other.serverCertificate));
};


/**
 * Adds the given initDatas (removing duplicates).
 *
 * @param {!Array.<shaka.player.DrmInfo.InitData>} otherInitDatas
 */
shaka.player.DrmInfo.prototype.addInitDatas = function(
    otherInitDatas) {
  var unfilteredInitDatas =
      this.initDatas.concat(otherInitDatas.map(
          function(initData) {
            return {
              'initData': new Uint8Array(initData.initData.buffer),
              'initDataType': initData.initDataType
            };
          }));

  this.initDatas = shaka.util.ArrayUtils.removeDuplicates(
      unfilteredInitDatas, shaka.player.DrmInfo.compareInitDatas_);
};


/**
 * @param {!shaka.player.DrmInfo.InitData} initDataA
 * @param {!shaka.player.DrmInfo.InitData} initDataB
 * @return {boolean}
 * @private
 */
shaka.player.DrmInfo.compareInitDatas_ =
    function(initDataA, initDataB) {
  return initDataA.initDataType == initDataB.initDataType &&
         shaka.util.Uint8ArrayUtils.equal(initDataA.initData,
                                          initDataB.initData);
};

