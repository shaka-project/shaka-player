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

goog.provide('shaka.util.FairPlayUtils');

goog.require('goog.Uri');


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
    const uint8 = new Uint8Array(initData);
    const dataview = new DataView(
        uint8.buffer, uint8.byteOffset, uint8.byteLength);
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
    /** @type {!Uint8Array} */
    let contentIdArray;
    if (typeof contentId == 'string') {
      contentIdArray = new Uint8Array(
          shaka.util.StringUtils.toUTF16(contentId, /* littleEndian= */ true));
    } else {
      contentIdArray = new Uint8Array(contentId);
    }

    const rebuiltInitData = new Uint8Array(
        8 + initData.byteLength + contentIdArray.byteLength + cert.byteLength);

    let offset = 0;
    /** @param {!Uint8Array} array */
    const append = (array) => {
      rebuiltInitData.set(array, offset);
      offset += array.byteLength;
    };
    /** @param {!Uint8Array} array */
    const appendWithLength = (array) => {
      const view = new DataView(rebuiltInitData.buffer);
      const value = array.byteLength;
      view.setUint32(offset, value, /* littleEndian= */ true);
      offset += 4;
      append(array);
    };

    append(new Uint8Array(initData));
    appendWithLength(contentIdArray);
    appendWithLength(new Uint8Array(cert));

    return rebuiltInitData;
  }
};
