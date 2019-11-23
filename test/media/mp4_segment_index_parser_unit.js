/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Mp4SegmentIndexParser', () => {
  const Util = shaka.test.Util;

  const indexSegmentUri = '/base/test/test/assets/index-segment.mp4';
  const mediaSegmentUri = '/base/test/test/assets/sintel-audio-segment.mp4';

  let indexSegment;
  let mediaSegment;

  beforeAll(async () => {
    const responses = await Promise.all([
      shaka.test.Util.fetch(indexSegmentUri),
      shaka.test.Util.fetch(mediaSegmentUri),
    ]);
    indexSegment = responses[0];
    mediaSegment = responses[1];
  });

  it('rejects a non-index segment ', () => {
    const error = Util.jasmineError(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MEDIA,
        shaka.util.Error.Code.MP4_SIDX_WRONG_BOX_TYPE));

    expect(() => shaka.media.Mp4SegmentIndexParser.parse(
        mediaSegment,
        /* sidxOffset */ 0,
        /* uris */ [],
        /* initSegmentReference */ null,
        /* scaledPresentationTimeOffset */ 0)).toThrow(error);
  });

  it('parses index segment ', () => {
    const result = shaka.media.Mp4SegmentIndexParser.parse(
        indexSegment,
        /* sidxOffset */ 0,
        /* uris */ [],
        /* initSegmentReference */ null,
        /* scaledPresentationTimeOffset */ 0);
    const references = [
      {startTime: 0, endTime: 12, startByte: 92, endByte: 194960},
      {startTime: 12, endTime: 24, startByte: 194961, endByte: 294059},
      {startTime: 24, endTime: 36, startByte: 294060, endByte: 466352},
      {startTime: 36, endTime: 48, startByte: 466353, endByte: 615511},
      {startTime: 48, endTime: 60, startByte: 615512, endByte: 743301},
    ];

    expect(result).toEqual(references.map((o) => jasmine.objectContaining(o)));
  });

  it('takes a scaled presentationTimeOffset in seconds', () => {
    const result = shaka.media.Mp4SegmentIndexParser.parse(
        indexSegment,
        /* sidxOffset */ 0,
        /* uris */ [],
        /* initSegmentReference */ null,
        /* scaledPresentationTimeOffset */ 2);
    const references = [
      {startTime: -2, endTime: 10},
      {startTime: 10, endTime: 22},
      {startTime: 22, endTime: 34},
      {startTime: 34, endTime: 46},
      {startTime: 46, endTime: 58},
    ];

    expect(result).toEqual(references.map((o) => jasmine.objectContaining(o)));
  });
});
