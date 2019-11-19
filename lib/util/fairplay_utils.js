/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.FairPlayUtils');

goog.require('goog.Uri');
goog.require('shaka.util.BufferUtils');


/**
 * @summary A set of FairPlay utility functions.
 * @exportInterface
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
    const uint8 = shaka.util.BufferUtils.toUint8(initData);
    const dataview = shaka.util.BufferUtils.toDataView(uint8);
    // The first part is a 4 byte little-endian int, which is the length of
    // the second part.
    const length = dataview.getUint32(
        /* position= */ 0, /* littleEndian= */ true);
    if (length + 4 != uint8.byteLength) {
      throw new RangeError('Malformed FairPlay init data');
    }

    // The second part is a UTF-16 LE URI from the manifest.
    const uriString = shaka.util.StringUtils.fromUTF16(
        uint8.subarray(4), /* littleEndian= */ true);

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
    // composed of several parts.  First, the raw init data we already got.
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

    const rebuiltInitData = new Uint8Array(
        8 + initData.byteLength + contentIdArray.byteLength + cert.byteLength);

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

    append(initData);
    appendWithLength(contentIdArray);
    appendWithLength(cert);

    return rebuiltInitData;
  }
};
