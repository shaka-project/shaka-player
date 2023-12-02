/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

shaka.test.ManifestParser = class {
  /**
   * Verifies the segment references of a stream.
   *
   * @param {?shaka.extern.Stream} stream
   * @param {!Array.<shaka.media.SegmentReference>} references
   */
  static verifySegmentIndex(stream, references) {
    expect(stream).toBeTruthy();
    expect(stream.segmentIndex).toBeTruthy();

    if (references.length == 0) {
      expect(stream.segmentIndex.find(0)).toBe(null);
      return;
    }

    for (const expectedRef of references) {
      // Don't query negative times.  Query 0 instead.
      const startTime = Math.max(0, expectedRef.startTime);
      const position = stream.segmentIndex.find(startTime);
      expect(position).not.toBe(null);
      const actualRef =
          stream.segmentIndex.get(/** @type {number} */ (position));
      // NOTE: A custom matcher for SegmentReferences is installed, so this
      // checks the URIs as well.
      expect(actualRef).toEqual(expectedRef);
    }

    // Make sure that the references stop at the end.
    const lastExpectedReference = references[references.length - 1];
    const positionAfterEnd =
        stream.segmentIndex.find(lastExpectedReference.endTime);
    expect(positionAfterEnd).toBe(null);
  }

  /**
   * Creates a segment reference using a relative URI.
   *
   * @param {string|Array.<string>} uri A relative URI to http://example.com
   * @param {number} start
   * @param {number} end
   * @param {string=} baseUri
   * @param {number=} startByte
   * @param {?number=} endByte
   * @param {number=} timestampOffset
   * @param {!Array.<!shaka.media.SegmentReference>=} partialReferences
   * @param {?string=} tilesLayout
   * @param {?number=} syncTime
   * @return {!shaka.media.SegmentReference}
   */
  static makeReference(uri, start, end, baseUri = '',
      startByte = 0, endByte = null, timestampOffset = 0,
      partialReferences = [], tilesLayout = '', syncTime = null) {
    const getUris = () => {
      const uris = [];
      if (uri instanceof Array) {
        for (const url of uri) {
          if (url.length) {
            uris.push(baseUri + url);
          }
        }
      } else if (uri.length) {
        uris.push(baseUri + uri);
      }
      return uris;
    };

    // If a test wants to verify these, they can be set explicitly after
    // makeReference is called.
    const initSegmentReference = /** @type {?} */({
      asymmetricMatch: (value) => {
        return value == null ||
            value instanceof shaka.media.InitSegmentReference;
      },
    });

    timestampOffset =
        timestampOffset || /** @type {?} */(jasmine.any(Number));
    const appendWindowStart = /** @type {?} */(jasmine.any(Number));
    const appendWindowEnd = /** @type {?} */(jasmine.any(Number));

    const ref = new shaka.media.SegmentReference(
        start, end, getUris, startByte, endByte,
        initSegmentReference,
        timestampOffset,
        appendWindowStart,
        appendWindowEnd,
        partialReferences,
        tilesLayout,
        /* tileDuration= */ undefined,
        syncTime);
    ref.discontinuitySequence = /** @type {?} */(jasmine.any(Number));
    return ref;
  }
};
