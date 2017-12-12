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

goog.provide('shaka.test.ManifestParser');


/**
 * Verifies the segment references of a stream.
 *
 * @param {?shakaExtern.Stream} stream
 * @param {!Array.<shaka.media.SegmentReference>} references
 */
shaka.test.ManifestParser.verifySegmentIndex = function(stream, references) {
  expect(stream).toBeTruthy();
  expect(stream.findSegmentPosition).toBeTruthy();
  expect(stream.getSegmentReference).toBeTruthy();

  if (references.length == 0) {
    expect(stream.findSegmentPosition(0)).toBe(null);
    return;
  }

  // Even if the first segment doesn't start at 0, this should return the first
  // segment.
  expect(stream.findSegmentPosition(0)).toBe(references[0].position);

  for (var i = 0; i < references.length; i++) {
    var expectedRef = references[i];
    // Don't query negative times.  Query 0 instead.
    var startTime = Math.max(0, expectedRef.startTime);
    var position = stream.findSegmentPosition(startTime);
    expect(position).not.toBe(null);
    var actualRef =
        stream.getSegmentReference(/** @type {number} */ (position));
    expect(actualRef).toEqual(expectedRef);
  }

  // Make sure that the references stop at the end.
  var lastExpectedReference = references[references.length - 1];
  var positionAfterEnd =
      stream.findSegmentPosition(lastExpectedReference.endTime);
  expect(positionAfterEnd).toBe(null);
  var referencePastEnd =
      stream.getSegmentReference(lastExpectedReference.position + 1);
  expect(referencePastEnd).toBe(null);
};


/**
 * Creates a segment reference using a relative URI.
 *
 * @param {string} uri A relative URI to http://example.com
 * @param {number} position
 * @param {number} start
 * @param {number} end
 * @param {string=} opt_baseUri
 * @param {number=} opt_startByte
 * @param {?number=} opt_endByte
 * @return {!shaka.media.SegmentReference}
 */
shaka.test.ManifestParser.makeReference =
    function(uri, position, start, end, opt_baseUri,
             opt_startByte, opt_endByte) {
  var base = opt_baseUri || '';
  var startByte = opt_startByte || 0;
  var endByte = opt_endByte || null;
  var getUris = function() { return [base + uri]; };
  return new shaka.media.SegmentReference(
      position, start, end, getUris, startByte, endByte);
};
