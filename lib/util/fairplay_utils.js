/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.FairPlayUtils');

goog.require('goog.Uri');
goog.require('goog.asserts');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.StringUtils');


/**
 * @summary A set of FairPlay utility functions.
 * @export
 */
shaka.util.FairPlayUtils = class {
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
};
