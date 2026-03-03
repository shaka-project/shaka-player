/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Mp4TtmlParser', () => {
  const ttmlInitSegmentUri = '/base/test/test/assets/ttml-init.mp4';
  const ttmlSegmentUri = '/base/test/test/assets/ttml-segment.mp4';
  const ttmlSegmentMultipleMDATUri =
      '/base/test/test/assets/ttml-segment-multiple-mdat.mp4';
  const ttmlSegmentMultipleSampleUri =
      '/base/test/test/assets/ttml-segment-multiple-sample.mp4';
  const imscImageInitSegmentUri =
      '/base/test/test/assets/imsc-image-init.cmft';
  const imscImageSegmentUri =
      '/base/test/test/assets/imsc-image-segment.cmft';
  const audioInitSegmentUri = '/base/test/test/assets/sintel-audio-init.mp4';

  /** @type {!Uint8Array} */
  let ttmlInitSegment;
  /** @type {!Uint8Array} */
  let ttmlSegment;
  /** @type {!Uint8Array} */
  let ttmlSegmentMultipleMDAT;
  /** @type {!Uint8Array} */
  let ttmlSegmentMultipleSample;
  /** @type {!Uint8Array} */
  let imscImageInitSegment;
  /** @type {!Uint8Array} */
  let imscImageSegment;
  /** @type {!Uint8Array} */
  let audioInitSegment;

  beforeAll(async () => {
    const responses = await Promise.all([
      shaka.test.Util.fetch(ttmlInitSegmentUri),
      shaka.test.Util.fetch(ttmlSegmentUri),
      shaka.test.Util.fetch(ttmlSegmentMultipleMDATUri),
      shaka.test.Util.fetch(ttmlSegmentMultipleSampleUri),
      shaka.test.Util.fetch(imscImageInitSegmentUri),
      shaka.test.Util.fetch(imscImageSegmentUri),
      shaka.test.Util.fetch(audioInitSegmentUri),
    ]);
    ttmlInitSegment = shaka.util.BufferUtils.toUint8(responses[0]);
    ttmlSegment = shaka.util.BufferUtils.toUint8(responses[1]);
    ttmlSegmentMultipleMDAT = shaka.util.BufferUtils.toUint8(responses[2]);
    ttmlSegmentMultipleSample = shaka.util.BufferUtils.toUint8(responses[3]);
    imscImageInitSegment = shaka.util.BufferUtils.toUint8(responses[4]);
    imscImageSegment = shaka.util.BufferUtils.toUint8(responses[5]);
    audioInitSegment = shaka.util.BufferUtils.toUint8(responses[6]);
  });

  it('parses init segment', () => {
    new shaka.text.Mp4TtmlParser().parseInit(ttmlInitSegment);
  });


  it('handles media segments with multiple mdats', () => {
    const parser = new shaka.text.Mp4TtmlParser();
    parser.parseInit(ttmlInitSegment);
    const time =
        {periodStart: 0, segmentStart: 0, segmentEnd: 60, vttOffset: 0};
    const ret = parser.parseMedia(ttmlSegmentMultipleMDAT, time, null);
    // Bodies.
    expect(ret.length).toBe(2);
    // Divs.
    expect(ret[0].nestedCues.length).toBe(1);
    expect(ret[1].nestedCues.length).toBe(1);
    // Cues.
    expect(ret[0].nestedCues[0].nestedCues.length).toBe(5);
    expect(ret[1].nestedCues[0].nestedCues.length).toBe(5);
  });

  it('handles media segments with multiple sample', () => {
    const parser = new shaka.text.Mp4TtmlParser();
    parser.parseInit(ttmlInitSegment);
    const time =
        {periodStart: 0, segmentStart: 0, segmentEnd: 60, vttOffset: 0};
    const ret = parser.parseMedia(ttmlSegmentMultipleSample, time, null);
    // Bodies.
    expect(ret.length).toBe(2);
    // Divs.
    expect(ret[0].nestedCues.length).toBe(1);
    expect(ret[1].nestedCues.length).toBe(1);
    // Cues.
    expect(ret[0].nestedCues[0].nestedCues.length).toBe(5);
    expect(ret[1].nestedCues[0].nestedCues.length).toBe(5);
  });

  it('accounts for offset', () => {
    const time1 =
        {periodStart: 0, segmentStart: 0, segmentEnd: 70, vttOffset: 0};
    const time2 =
        {periodStart: 7, segmentStart: 0, segmentEnd: 70, vttOffset: 7};

    const parser = new shaka.text.Mp4TtmlParser();
    parser.parseInit(ttmlInitSegment);

    const ret1 = parser.parseMedia(ttmlSegment, time1, null);
    expect(ret1.length).toBeGreaterThan(0);

    const ret2 = parser.parseMedia(ttmlSegment, time2, null);
    expect(ret2.length).toBeGreaterThan(0);

    expect(ret2[0].startTime).toBe(ret1[0].startTime + 7);
    expect(ret2[0].endTime).toBe(ret1[0].endTime + 7);
  });

  it('rejects init segment with no ttml', () => {
    const error = shaka.test.Util.jasmineError(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.INVALID_MP4_TTML));

    expect(() => new shaka.text.Mp4TtmlParser().parseInit(audioInitSegment))
        .toThrow(error);
  });

  it('parses media segment', () => {
    const cues = [
      {
        startTime: 23,
        endTime: 24.5,
        payload: 'You\'re a jerk, Thom.',
      },
      {
        startTime: 25,
        endTime: 27,
        payload: 'Look Celia, we have to follow our passions;',
      },
      {
        startTime: 27,
        endTime: 30.5,
        nestedCues: [{
          payload: '...you have your robotics, and I',
        }, {
          lineBreak: true,
        }, {
          payload: 'just want to be awesome in space.',
        }],
      },
      {
        startTime: 30.8,
        endTime: 34,
        nestedCues: [{
          payload: 'Why don\'t you just admit that',
        }, {
          lineBreak: true,
        }, {
          payload: 'you\'re freaked out by my robot hand?',
        }],
      },
      {
        startTime: 34.5,
        endTime: 36,
        payload: 'I\'m not freaked out by- it\'s...',
      },
      {
        startTime: 37,
        endTime: 38,
        payload: '...alright! Fine!',
      },
      {
        startTime: 38,
        endTime: 41,
        nestedCues: [{
          payload: 'I\'m freaked out! I have nightmares',
        }, {
          lineBreak: true,
        }, {
          payload: 'that I\'m being chased...',
        }],
      },
      {
        startTime: 41,
        endTime: 42,
        payload: '...by these giant robotic claws of death...',
      },
      {
        startTime: 42.2,
        endTime: 45,
        nestedCues: [{
          // cspell:disable-next-line
          payload: '"Fourty years later"',
        }, {
          lineBreak: true,
        }, {
          payload: 'Whatever, Thom. We\'re done.',
        }],
      },
      {
        startTime: 50,
        endTime: 53.5,
        payload: 'Robot\'s memory synced and locked!',
      },
    ];
    const parser = new shaka.text.Mp4TtmlParser();
    parser.parseInit(ttmlInitSegment);
    const time =
        {periodStart: 0, segmentStart: 0, segmentEnd: 60, vttOffset: 0};
    const result = parser.parseMedia(ttmlSegment, time, null);
    shaka.test.TtmlUtils.verifyHelper(
        cues, result, {startTime: 23, endTime: 53.5});
  });

  it('handles IMSC1 (CMAF) image subtitle', () => {
    const parser = new shaka.text.Mp4TtmlParser();
    parser.parseInit(imscImageInitSegment);
    const time =
        {periodStart: 0, segmentStart: 0, segmentEnd: 60, vttOffset: 0};
    const ret = parser.parseMedia(imscImageSegment, time, null);
    // Bodies.
    expect(ret.length).toBe(1);
    // Divs.
    expect(ret[0].nestedCues.length).toBe(1);
    // Cues.
    // eslint-disable-next-line @stylistic/max-len
    expect(ret[0].nestedCues[0].backgroundImage).toBe('data:image/png;base64,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');
  });
});
