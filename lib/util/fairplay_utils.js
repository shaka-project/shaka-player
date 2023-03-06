/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.FairPlayUtils');

goog.require('goog.Uri');
goog.require('goog.asserts');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * @summary A set of FairPlay utility functions.
 * @export
 */
shaka.util.FairPlayUtils = class {
  /**
   * Check if FairPlay is supported.
   *
   * @return {!Promise.<boolean>}
   * @export
   */
  static async isFairPlaySupported() {
    const config = {
      initDataTypes: ['cenc', 'sinf', 'skd'],
      videoCapabilities: [
        {
          contentType: 'video/mp4; codecs="avc1.42E01E"',
        },
      ],
    };
    try {
      await navigator.requestMediaKeySystemAccess('com.apple.fps', [config]);
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Using the default method, extract a content ID from the init data.  This is
   * based on the FairPlay example documentation.
   *
   * @param {!BufferSource} initData
   * @return {string}
   * @export
   */
  static defaultGetContentId(initData) {
    const uriString = shaka.util.StringUtils.fromBytesAutoDetect(initData);

    // The domain of that URI is the content ID according to Apple's FPS
    // sample.
    const uri = new goog.Uri(uriString);
    return uri.getDomain();
  }

  /**
   * Transforms the init data buffer using the given data.  The format is:
   *
   * <pre>
   * [4 bytes] initDataSize
   * [initDataSize bytes] initData
   * [4 bytes] contentIdSize
   * [contentIdSize bytes] contentId
   * [4 bytes] certSize
   * [certSize bytes] cert
   * </pre>
   *
   * @param {!BufferSource} initData
   * @param {!BufferSource|string} contentId
   * @param {?BufferSource} cert  The server certificate; this will throw if not
   *   provided.
   * @return {!Uint8Array}
   * @export
   */
  static initDataTransform(initData, contentId, cert) {
    if (!cert || !cert.byteLength) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.SERVER_CERTIFICATE_REQUIRED);
    }

    // From that, we build a new init data to use in the session.  This is
    // composed of several parts.  First, the init data as a UTF-16 sdk:// URL.
    // Second, a 4-byte LE length followed by the content ID in UTF-16-LE.
    // Third, a 4-byte LE length followed by the certificate.
    /** @type {BufferSource} */
    let contentIdArray;
    if (typeof contentId == 'string') {
      contentIdArray =
          shaka.util.StringUtils.toUTF16(contentId, /* littleEndian= */ true);
    } else {
      contentIdArray = contentId;
    }

    // The init data we get is a UTF-8 string; convert that to a UTF-16 string.
    const sdkUri = shaka.util.StringUtils.fromBytesAutoDetect(initData);
    const utf16 =
        shaka.util.StringUtils.toUTF16(sdkUri, /* littleEndian= */ true);

    const rebuiltInitData = new Uint8Array(
        12 + utf16.byteLength + contentIdArray.byteLength + cert.byteLength);

    let offset = 0;
    /** @param {BufferSource} array */
    const append = (array) => {
      rebuiltInitData.set(shaka.util.BufferUtils.toUint8(array), offset);
      offset += array.byteLength;
    };
    /** @param {BufferSource} array */
    const appendWithLength = (array) => {
      const view = shaka.util.BufferUtils.toDataView(rebuiltInitData);
      const value = array.byteLength;
      view.setUint32(offset, value, /* littleEndian= */ true);
      offset += 4;
      append(array);
    };

    appendWithLength(utf16);
    appendWithLength(contentIdArray);
    appendWithLength(cert);

    goog.asserts.assert(
        offset == rebuiltInitData.length, 'Inconsistent init data length');
    return rebuiltInitData;
  }

  /**
   * Basic initDataTransform configuration.
   *
   * @param {!Uint8Array} initData
   * @param {string} initDataType
   * @param {?shaka.extern.DrmInfo} drmInfo
   * @private
   */
  static basicInitDataTransform_(initData, initDataType, drmInfo) {
    if (initDataType !== 'skd') {
      return initData;
    }
    const StringUtils = shaka.util.StringUtils;
    const FairPlayUtils = shaka.util.FairPlayUtils;
    const cert = drmInfo.serverCertificate;
    const initDataAsString = StringUtils.fromBytesAutoDetect(initData);
    const contentId = initDataAsString.split('skd://').pop();
    return FairPlayUtils.initDataTransform(initData, contentId, cert);
  }

  /**
   * Verimatrix initDataTransform configuration.
   *
   * @param {!Uint8Array} initData
   * @param {string} initDataType
   * @param {?shaka.extern.DrmInfo} drmInfo
   * @export
   */
  static verimatrixInitDataTransform(initData, initDataType, drmInfo) {
    return shaka.util.FairPlayUtils.basicInitDataTransform_(
        initData, initDataType, drmInfo);
  }

  /**
   * EZDRM initDataTransform configuration.
   *
   * @param {!Uint8Array} initData
   * @param {string} initDataType
   * @param {?shaka.extern.DrmInfo} drmInfo
   * @export
   */
  static ezdrmInitDataTransform(initData, initDataType, drmInfo) {
    if (initDataType !== 'skd') {
      return initData;
    }
    const StringUtils = shaka.util.StringUtils;
    const FairPlayUtils = shaka.util.FairPlayUtils;
    const cert = drmInfo.serverCertificate;
    const initDataAsString = StringUtils.fromBytesAutoDetect(initData);
    const contentId = initDataAsString.split(';').pop();
    return FairPlayUtils.initDataTransform(initData, contentId, cert);
  }

  /**
   * Conax initDataTransform configuration.
   *
   * @param {!Uint8Array} initData
   * @param {string} initDataType
   * @param {?shaka.extern.DrmInfo} drmInfo
   * @export
   */
  static conaxInitDataTransform(initData, initDataType, drmInfo) {
    if (initDataType !== 'skd') {
      return initData;
    }
    const StringUtils = shaka.util.StringUtils;
    const FairPlayUtils = shaka.util.FairPlayUtils;
    const cert = drmInfo.serverCertificate;
    const initDataAsString = StringUtils.fromBytesAutoDetect(initData);
    const skdValue = initDataAsString.split('skd://').pop().split('?').shift();
    const stringToArray = (string) => {
      // 2 bytes for each char
      const buffer = new ArrayBuffer(string.length * 2);
      const array = new Uint16Array(buffer);
      for (let i = 0, strLen = string.length; i < strLen; i++) {
        array[i] = string.charCodeAt(i);
      }
      return array;
    };
    const contentId = stringToArray(window.atob(skdValue));
    return FairPlayUtils.initDataTransform(initData, contentId, cert);
  }

  /**
   * ExpressPlay initDataTransform configuration.
   *
   * @param {!Uint8Array} initData
   * @param {string} initDataType
   * @param {?shaka.extern.DrmInfo} drmInfo
   * @export
   */
  static expressplayInitDataTransform(initData, initDataType, drmInfo) {
    return shaka.util.FairPlayUtils.basicInitDataTransform_(
        initData, initDataType, drmInfo);
  }

  /**
   * Verimatrix FairPlay request.
   *
   * @param {shaka.net.NetworkingEngine.RequestType} type
   * @param {shaka.extern.Request} request
   * @param {shaka.net.NetworkingEngine.AdvancedRequestType=} advType
   * @export
   */
  static verimatrixFairPlayRequest(type, request, advType) {
    if (type !== shaka.net.NetworkingEngine.RequestType.LICENSE) {
      return;
    }
    const body = /** @type {!(ArrayBuffer|ArrayBufferView)} */(request.body);
    const originalPayload = shaka.util.BufferUtils.toUint8(body);
    const base64Payload = shaka.util.Uint8ArrayUtils.toBase64(originalPayload);
    request.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    request.body = shaka.util.StringUtils.toUTF8('spc=' + base64Payload);
  }

  /**
   * Set content-type to application/octet-stream in a FairPlay request.
   *
   * @param {shaka.net.NetworkingEngine.RequestType} type
   * @param {shaka.extern.Request} request
   * @param {shaka.net.NetworkingEngine.AdvancedRequestType=} advType
   * @private
   */
  static octetStreamFairPlayRequest_(type, request, advType) {
    if (type !== shaka.net.NetworkingEngine.RequestType.LICENSE) {
      return;
    }
    request.headers['Content-Type'] = 'application/octet-stream';
  }

  /**
   * EZDRM FairPlay request.
   *
   * @param {shaka.net.NetworkingEngine.RequestType} type
   * @param {shaka.extern.Request} request
   * @param {shaka.net.NetworkingEngine.AdvancedRequestType=} advType
   * @export
   */
  static ezdrmFairPlayRequest(type, request, advType) {
    shaka.util.FairPlayUtils.octetStreamFairPlayRequest_(type, request);
  }

  /**
   * Conax FairPlay request.
   *
   * @param {shaka.net.NetworkingEngine.RequestType} type
   * @param {shaka.extern.Request} request
   * @param {shaka.net.NetworkingEngine.AdvancedRequestType=} advType
   * @export
   */
  static conaxFairPlayRequest(type, request, advType) {
    shaka.util.FairPlayUtils.octetStreamFairPlayRequest_(type, request);
  }

  /**
   * ExpressPlay FairPlay request.
   *
   * @param {shaka.net.NetworkingEngine.RequestType} type
   * @param {shaka.extern.Request} request
   * @param {shaka.net.NetworkingEngine.AdvancedRequestType=} advType
   * @export
   */
  static expressplayFairPlayRequest(type, request, advType) {
    shaka.util.FairPlayUtils.octetStreamFairPlayRequest_(type, request);
  }

  /**
   * Common FairPlay response transform for some DRMs providers.
   *
   * @param {shaka.net.NetworkingEngine.RequestType} type
   * @param {shaka.extern.Response} response
   * @param {shaka.net.NetworkingEngine.AdvancedRequestType=} advType
   * @export
   */
  static commonFairPlayResponse(type, response, advType) {
    if (type !== shaka.net.NetworkingEngine.RequestType.LICENSE) {
      return;
    }

    // In Apple's docs, responses can be of the form:
    //   '\n<ckc>base64encoded</ckc>\n' or 'base64encoded'
    // We have also seen responses in JSON format from some of our partners.
    // In all of these text-based formats, the CKC data is base64-encoded.

    let responseText;
    try {
      // Convert it to text for further processing.
      responseText = shaka.util.StringUtils.fromUTF8(response.data);
    } catch (error) {
      // Assume it's not a text format of any kind and leave it alone.
      return;
    }

    let licenseProcessing = false;

    // Trim whitespace.
    responseText = responseText.trim();

    // Look for <ckc> wrapper and remove it.
    if (responseText.substr(0, 5) === '<ckc>' &&
        responseText.substr(-6) === '</ckc>') {
      responseText = responseText.slice(5, -6);
      licenseProcessing = true;
    }

    // Look for a JSON wrapper and remove it.
    try {
      const responseObject = /** @type {!Object} */(JSON.parse(responseText));
      if (responseObject['ckc']) {
        responseText = responseObject['ckc'];
        licenseProcessing = true;
      }
      if (responseObject['CkcMessage']) {
        responseText = responseObject['CkcMessage'];
        licenseProcessing = true;
      }
      if (responseObject['License']) {
        responseText = responseObject['License'];
        licenseProcessing = true;
      }
    } catch (err) {
      // It wasn't JSON.  Fall through with other transformations.
    }

    if (licenseProcessing) {
      // Decode the base64-encoded data into the format the browser expects.
      // It's not clear why FairPlay license servers don't just serve this
      // directly.
      response.data = shaka.util.BufferUtils.toArrayBuffer(
          shaka.util.Uint8ArrayUtils.fromBase64(responseText));
    }
  }
};
