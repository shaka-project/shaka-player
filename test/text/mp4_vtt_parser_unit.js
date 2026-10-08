/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Mp4VttParser', () => {
  const vttInitSegmentUri = '/base/test/test/assets/vtt-init.mp4';
  const vttSegmentUri = '/base/test/test/assets/vtt-segment.mp4';
  const vttSegmentMultiPayloadUri =
      '/base/test/test/assets/vtt-segment-multi-payload.mp4';
  const vttSegSettingsUri = '/base/test/test/assets/vtt-segment-settings.mp4';
  const vttSegNoDurationUri =
      '/base/test/test/assets/vtt-segment-no-duration.mp4';
  const audioInitSegmentUri = '/base/test/test/assets/sintel-audio-init.mp4';
  // A livesim2 segment of four 0.5 s fragments, one sample each.
  const vttChunkedInitUri = '/base/test/test/assets/vtt-chunked-init.mp4';
  const vttChunkedSegmentUri = '/base/test/test/assets/vtt-chunked-segment.mp4';

  /** @type {!Uint8Array} */
  let vttInitSegment;
  /** @type {!Uint8Array} */
  let vttSegment;
  /** @type {!Uint8Array} */
  let vttSegmentMultiPayload;
  /** @type {!Uint8Array} */
  let vttSegSettings;
  /** @type {!Uint8Array} */
  let vttSegNoDuration;
  /** @type {!Uint8Array} */
  let audioInitSegment;
  /** @type {!Uint8Array} */
  let vttChunkedInit;
  /** @type {!Uint8Array} */
  let vttChunkedSegment;

  beforeAll(async () => {
    const responses = await Promise.all([
      shaka.test.Util.fetch(vttInitSegmentUri),
      shaka.test.Util.fetch(vttSegmentUri),
      shaka.test.Util.fetch(vttSegmentMultiPayloadUri),
      shaka.test.Util.fetch(vttSegSettingsUri),
      shaka.test.Util.fetch(vttSegNoDurationUri),
      shaka.test.Util.fetch(audioInitSegmentUri),
      shaka.test.Util.fetch(vttChunkedInitUri),
      shaka.test.Util.fetch(vttChunkedSegmentUri),
    ]);
    vttInitSegment = shaka.util.BufferUtils.toUint8(responses[0]);
    vttSegment = shaka.util.BufferUtils.toUint8(responses[1]);
    vttSegmentMultiPayload = shaka.util.BufferUtils.toUint8(responses[2]);
    vttSegSettings = shaka.util.BufferUtils.toUint8(responses[3]);
    vttSegNoDuration = shaka.util.BufferUtils.toUint8(responses[4]);
    audioInitSegment = shaka.util.BufferUtils.toUint8(responses[5]);
    vttChunkedInit = shaka.util.BufferUtils.toUint8(responses[6]);
    vttChunkedSegment = shaka.util.BufferUtils.toUint8(responses[7]);
  });

  it('parses init segment', () => {
    new shaka.text.Mp4VttParser().parseInit(vttInitSegment);
  });

  it('parses media segment', () => {
    const cues = [
      {
        startTime: 111.8,
        endTime: 115.8,
        payload: 'It has shed much innocent blood.\n',
      },
      {
        startTime: 118,
        endTime: 120,
        payload:
            'You\'re a fool for traveling alone,\nso completely unprepared.\n',
      },
    ];

    const parser = new shaka.text.Mp4VttParser();
    parser.parseInit(vttInitSegment);
    const time = {
      periodStart: 0,
      segmentStart: 0,
      segmentEnd: 0,
      vttOffset: 0,
      isMpegTs: false,
    };
    const result = parser.parseMedia(vttSegment, time, null, []);
    verifyHelper(cues, result);
  });

  it('plays multiple payloads at one time if specified by size', () => {
    const cues = [
      {
        startTime: 110,
        endTime: 113,
        payload: 'Hello',
      },
      // This cue is part of the same presentation as the previous one, so it
      // shares the same start time and duration.
      {
        startTime: 110,
        endTime: 113,
        payload: 'and',
      },
      {
        startTime: 113,
        endTime: 116.276,
        payload: 'goodbye',
      },
    ];

    const parser = new shaka.text.Mp4VttParser();
    parser.parseInit(vttInitSegment);
    const time = {
      periodStart: 0,
      segmentStart: 0,
      segmentEnd: 0,
      vttOffset: 0,
      isMpegTs: false,
    };
    const result = parser.parseMedia(vttSegmentMultiPayload, time, null, []);
    verifyHelper(cues, result);
  });

  it('parses media segment containing settings', () => {
    const Cue = shaka.text.Cue;
    const cues = [
      {
        startTime: 111.8,
        endTime: 115.8,
        payload: 'It has shed much innocent blood.\n',
        textAlign: 'right',
        size: 50,
        position: 10,
      },
      {
        startTime: 118,
        endTime: 120,
        payload:
            'You\'re a fool for traveling alone,\nso completely unprepared.\n',
        writingMode: Cue.writingMode.VERTICAL_LEFT_TO_RIGHT,
        line: 1,
      },
    ];

    const parser = new shaka.text.Mp4VttParser();
    parser.parseInit(vttInitSegment);
    const time = {
      periodStart: 0,
      segmentStart: 0,
      segmentEnd: 0,
      vttOffset: 0,
      isMpegTs: false,
    };
    const result = parser.parseMedia(vttSegSettings, time, null, []);
    verifyHelper(cues, result);
  });

  it('parses media segments without a sample duration', () => {
    // Regression test for https://github.com/shaka-project/shaka-player/issues/919
    const cues = [
      {startTime: 10, endTime: 11, payload: 'cue 10'},
      {startTime: 11, endTime: 12, payload: 'cue 11'},
      {startTime: 12, endTime: 13, payload: 'cue 12'},
      {startTime: 13, endTime: 14, payload: 'cue 13'},
      {startTime: 14, endTime: 15, payload: 'cue 14'},
      {startTime: 15, endTime: 16, payload: 'cue 15'},
      {startTime: 16, endTime: 17, payload: 'cue 16'},
      {startTime: 17, endTime: 18, payload: 'cue 17'},
      {startTime: 18, endTime: 19, payload: 'cue 18'},
      {startTime: 19, endTime: 20, payload: 'cue 19'},
    ];

    const parser = new shaka.text.Mp4VttParser();
    parser.parseInit(vttInitSegment);
    const time = {
      periodStart: 0,
      segmentStart: 0,
      segmentEnd: 0,
      vttOffset: 0,
      isMpegTs: false,
    };
    const result = parser.parseMedia(vttSegNoDuration, time, null, []);
    verifyHelper(cues, result);
  });

  it('accounts for offset', () => {
    const cues = [
      {
        startTime: 121.8,
        endTime: 125.8,
        payload: 'It has shed much innocent blood.\n',
      },
      {
        startTime: 128,
        endTime: 130,
        payload:
            'You\'re a fool for traveling alone,\nso completely unprepared.\n',
      },
    ];

    const parser = new shaka.text.Mp4VttParser();
    parser.parseInit(vttInitSegment);
    const time = {
      periodStart: 10,
      segmentStart: 0,
      segmentEnd: 0,
      vttOffset: 10,
      isMpegTs: false,
    };
    const result = parser.parseMedia(vttSegment, time, null, []);
    verifyHelper(cues, result);
  });

  it('handles empty media segments', () => {
    const parser = new shaka.text.Mp4VttParser();
    parser.parseInit(vttInitSegment);
    const time = {
      periodStart: 0,
      segmentStart: 0,
      segmentEnd: 0,
      vttOffset: 0,
      isMpegTs: false,
    };
    const result = parser.parseMedia(new Uint8Array(0), time, null, []);
    verifyHelper([], result);
  });

  it('rejects a media segment with a zero-length payload box', () => {
    const error = shaka.test.Util.jasmineError(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.INVALID_MP4_VTT));

    // The first payload box of vtt-segment.mp4 is an 8-byte 'vtte' whose
    // header starts here.  A size of 0 would move the reader backwards by the
    // header size, making the sample loop spin forever.
    const boxOffset = 128;
    const segment = shaka.util.BufferUtils.toUint8(vttSegment.slice());
    expect(new shaka.util.DataViewReader(
        segment.subarray(boxOffset),
        shaka.util.DataViewReader.Endianness.BIG_ENDIAN).readUint32()).toBe(8);
    segment.set([0, 0, 0, 0], boxOffset);

    const parser = new shaka.text.Mp4VttParser();
    parser.parseInit(vttInitSegment);
    const time = {
      periodStart: 0,
      segmentStart: 0,
      segmentEnd: 0,
      vttOffset: 0,
      isMpegTs: false,
    };
    expect(() => parser.parseMedia(segment, time, null, [])).toThrow(error);
  });

  it('parses every fragment of a multi-fragment segment', () => {
    // The fragments hold a cue, a vtte, and a new cue that the last fragment
    // repeats.  Each is timed by its own tfdt.
    const parser = new shaka.text.Mp4VttParser();
    parser.parseInit(vttChunkedInit);
    const time = {
      periodStart: 0,
      segmentStart: 1790260814,
      segmentEnd: 1790260816,
      vttOffset: 0,
      isMpegTs: false,
    };
    const cues = parser.parseMedia(vttChunkedSegment, time, null, []);

    expect(cues.map((c) => [c.startTime, c.endTime])).toEqual([
      [1790260814, 1790260814.5],
      [1790260815, 1790260815.5],
      [1790260815.5, 1790260816],
    ]);
    expect(cues[2].payload).toBe(cues[1].payload);
    expect(cues[0].payload).not.toBe(cues[1].payload);
  });

  it('rejects init segment with no vtt', () => {
    const error = shaka.test.Util.jasmineError(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.INVALID_MP4_VTT));

    expect(() => new shaka.text.Mp4VttParser().parseInit(audioInitSegment))
        .toThrow(error);
  });

  it('uses the regions of the WebVTTConfigurationBox', () => {
    const config =
        'WEBVTT\n\n' +
        'REGION\n' +
        'id:fred\n' +
        'width:40%\n' +
        'lines:2\n' +
        'regionanchor:0%,100%\n' +
        'viewportanchor:10%,90%\n' +
        'scroll:up\n';
    const parser = new shaka.text.Mp4VttParser();
    parser.parseInit(createInitSegment(config));
    const time = {
      periodStart: 0,
      segmentStart: 0,
      segmentEnd: 0,
      vttOffset: 0,
      isMpegTs: false,
    };
    const result = parser.parseMedia(
        createMediaSegment([
          {settings: 'region:fred', payload: 'In the region'},
          {settings: 'region:fred line:0', payload: 'Out of the region'},
          {settings: 'region:bob', payload: 'Unknown region'},
        ]),
        time, null, []);

    verifyHelper(
        [
          {
            startTime: 0,
            endTime: 1,
            payload: 'In the region',
            region: jasmine.objectContaining({
              id: 'fred',
              width: 40,
              height: 2,
              heightUnits: shaka.text.CueRegion.units.LINES,
              regionAnchorX: 0,
              regionAnchorY: 100,
              viewportAnchorX: 10,
              viewportAnchorY: 90,
              scroll: shaka.text.CueRegion.scrollMode.UP,
            }),
          },
          {
            startTime: 1,
            endTime: 2,
            payload: 'Out of the region',
            line: 0,
            region: jasmine.objectContaining({id: ''}),
          },
          {
            startTime: 2,
            endTime: 3,
            payload: 'Unknown region',
            region: jasmine.objectContaining({id: ''}),
          },
        ],
        result);
  });

  /**
   * @param {string} name
   * @param {...!Uint8Array} payload
   * @return {!Uint8Array}
   */
  function box(name, ...payload) {
    return shaka.util.Mp4Generator.box(name, ...payload);
  }

  /**
   * @param {string} str
   * @return {!Uint8Array}
   */
  function utf8(str) {
    return shaka.util.BufferUtils.toUint8(shaka.util.StringUtils.toUTF8(str));
  }

  /**
   * Creates a WebVTT in MP4 init segment, with a timescale of 1000.
   *
   * @param {string} config The contents of the WebVTTConfigurationBox.
   * @return {!Uint8Array}
   */
  function createInitSegment(config) {
    const mdhd = box('mdhd', new Uint8Array([
      0, 0, 0, 0, // version and flags
      0, 0, 0, 0, // creation time
      0, 0, 0, 0, // modification time
      0, 0, 0x03, 0xe8, // timescale
      0, 0, 0, 0, // duration
      0x55, 0xc4, 0, 0, // language and pre-defined
    ]));
    const wvtt = box('wvtt',
        new Uint8Array([
          0, 0, 0, 0, 0, 0, // reserved
          0, 1, // data reference index
        ]),
        box('vttC', utf8(config)));
    const stsd = box('stsd',
        new Uint8Array([
          0, 0, 0, 0, // version and flags
          0, 0, 0, 1, // entry count
        ]),
        wvtt);
    return box('moov',
        box('trak',
            box('mdia', mdhd,
                box('minf',
                    box('stbl', stsd)))));
  }

  /**
   * Creates a WebVTT in MP4 media segment with one cue per second.
   *
   * @param {!Array<{settings: string, payload: string}>} cues
   * @return {!Uint8Array}
   */
  function createMediaSegment(cues) {
    const samples = cues.map((cue) => box('vttc',
        box('sttg', utf8(cue.settings)),
        box('payl', utf8(cue.payload))));
    const tfdt = box('tfdt', new Uint8Array([
      0, 0, 0, 0, // version and flags
      0, 0, 0, 0, // base media decode time
    ]));
    // Per-sample durations and sizes.
    const trunPayload = new Uint8Array(8 + samples.length * 8);
    const view = shaka.util.BufferUtils.toDataView(trunPayload);
    view.setUint32(0, 0x000300); // flags: sample duration and size present
    view.setUint32(4, samples.length);
    samples.forEach((sample, i) => {
      view.setUint32(8 + i * 8, 1000);
      view.setUint32(12 + i * 8, sample.byteLength);
    });
    const trun = box('trun', trunPayload);
    return shaka.util.Uint8ArrayUtils.concat(
        box('moof', box('traf', tfdt, trun)),
        box('mdat', ...samples));
  }

  function verifyHelper(/** !Array */ expected, /** !Array */ actual) {
    expect(actual).toEqual(expected.map((c) => jasmine.objectContaining(c)));
  }
});
