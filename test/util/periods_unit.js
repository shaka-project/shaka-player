/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('PeriodCombiner', () => {
  // These test cases don't really read well as "it" statements.  Phrasing them
  // that way would make the names very long, so here we break with that
  // convention.

  /** @type {shaka.util.PeriodCombiner} */
  let combiner;

  beforeEach(() => {
    combiner = new shaka.util.PeriodCombiner();
  });

  afterEach(() => {
    combiner.release();
  });

  it('Ad insertion - join during main content', async () => {
    /** @type {!Array.<shaka.util.PeriodCombiner.Period>} */
    const periods = [
      {
        id: 'main',
        videoStreams: [
          makeVideoStream(1080),
          makeVideoStream(720),
          makeVideoStream(480),
        ],
        audioStreams: [
          makeAudioStream('en', /* channels= */ 6),
          makeAudioStream('en', /* channels= */ 2),
        ],
        textStreams: [],
      },
      {
        id: 'ad',
        videoStreams: [
          makeVideoStream(480),
        ],
        audioStreams: [
          makeAudioStream('en', /* channels= */ 2),
        ],
        textStreams: [],
      },
    ];

    // Start with the first period only.
    await combiner.combinePeriods(periods.slice(0, 1), /* isDynamic= */ true);
    expect(combiner.getVariants()).toEqual(jasmine.arrayWithExactContents([
      makeAVVariant(1080, 'en', /* channels= */ 6),
      makeAVVariant(1080, 'en', /* channels= */ 2),
      makeAVVariant(720, 'en', /* channels= */ 6),
      makeAVVariant(720, 'en', /* channels= */ 2),
      makeAVVariant(480, 'en', /* channels= */ 6),
      makeAVVariant(480, 'en', /* channels= */ 2),
    ]));

    // Add the second period.
    await combiner.combinePeriods(periods, /* isDynamic= */ true);
    const variants = combiner.getVariants();
    expect(variants).toEqual(jasmine.arrayWithExactContents([
      makeAVVariant(1080, 'en', /* channels= */ 6),
      makeAVVariant(1080, 'en', /* channels= */ 2),
      makeAVVariant(720, 'en', /* channels= */ 6),
      makeAVVariant(720, 'en', /* channels= */ 2),
      makeAVVariant(480, 'en', /* channels= */ 6),
      makeAVVariant(480, 'en', /* channels= */ 2),
    ]));

    const h1080Surround = variants.find(
        (v) => v.video.height == 1080 && v.audio.channelsCount == 6);
    const h720Surround = variants.find(
        (v) => v.video.height == 720 && v.audio.channelsCount == 6);
    const h480Surround = variants.find(
        (v) => v.video.height == 480 && v.audio.channelsCount == 6);

    const h1080Stereo = variants.find(
        (v) => v.video.height == 1080 && v.audio.channelsCount == 2);
    const h720Stereo = variants.find(
        (v) => v.video.height == 720 && v.audio.channelsCount == 2);
    const h480Stereo = variants.find(
        (v) => v.video.height == 480 && v.audio.channelsCount == 2);

    // We can use the originalId field to see what each track is composed of.
    expect(h1080Surround.video.originalId).toBe('1080,480');
    expect(h1080Surround.audio.originalId).toBe('en-6c,en');
    expect(h720Surround.video.originalId).toBe('720,480');
    expect(h720Surround.audio.originalId).toBe('en-6c,en');
    expect(h480Surround.video.originalId).toBe('480,480');
    expect(h480Surround.audio.originalId).toBe('en-6c,en');

    expect(h1080Stereo.video.originalId).toBe('1080,480');
    expect(h1080Stereo.audio.originalId).toBe('en,en');
    expect(h720Stereo.video.originalId).toBe('720,480');
    expect(h720Stereo.audio.originalId).toBe('en,en');
    expect(h480Stereo.video.originalId).toBe('480,480');
    expect(h480Stereo.audio.originalId).toBe('en,en');
  });

  it('Ad insertion - join during ad', async () => {
    /** @type {!Array.<shaka.util.PeriodCombiner.Period>} */
    const periods = [
      {
        id: 'ad',
        videoStreams: [
          makeVideoStream(480),
        ],
        audioStreams: [
          makeAudioStream('en', /* channels= */ 2),
        ],
        textStreams: [],
      },
      {
        id: 'main',
        videoStreams: [
          makeVideoStream(1080),
          makeVideoStream(480),
          makeVideoStream(720),
        ],
        audioStreams: [
          makeAudioStream('en', /* channels= */ 6),
          makeAudioStream('en', /* channels= */ 2),
        ],
        textStreams: [],
      },
    ];

    // Start with the first period only.
    await combiner.combinePeriods(periods.slice(0, 1), /* isDynamic= */ true);
    expect(combiner.getVariants()).toEqual(jasmine.arrayWithExactContents([
      makeAVVariant(480, 'en', /* channels= */ 2),
    ]));

    // Add the second period.
    await combiner.combinePeriods(periods, /* isDynamic= */ true);
    const variants = combiner.getVariants();
    expect(variants).toEqual(jasmine.arrayWithExactContents([
      makeAVVariant(1080, 'en', /* channels= */ 6),
      makeAVVariant(1080, 'en', /* channels= */ 2),
      makeAVVariant(720, 'en', /* channels= */ 6),
      makeAVVariant(720, 'en', /* channels= */ 2),
      makeAVVariant(480, 'en', /* channels= */ 6),
      makeAVVariant(480, 'en', /* channels= */ 2),
    ]));

    const h1080Surround = variants.find(
        (v) => v.video.height == 1080 && v.audio.channelsCount == 6);
    const h720Surround = variants.find(
        (v) => v.video.height == 720 && v.audio.channelsCount == 6);
    const h480Surround = variants.find(
        (v) => v.video.height == 480 && v.audio.channelsCount == 6);

    const h1080Stereo = variants.find(
        (v) => v.video.height == 1080 && v.audio.channelsCount == 2);
    const h720Stereo = variants.find(
        (v) => v.video.height == 720 && v.audio.channelsCount == 2);
    const h480Stereo = variants.find(
        (v) => v.video.height == 480 && v.audio.channelsCount == 2);

    // We can use the originalId field to see what each track is composed of.
    expect(h1080Surround.video.originalId).toBe('480,1080');
    expect(h1080Surround.audio.originalId).toBe('en,en-6c');
    expect(h720Surround.video.originalId).toBe('480,720');
    expect(h720Surround.audio.originalId).toBe('en,en-6c');
    expect(h480Surround.video.originalId).toBe('480,480');
    expect(h480Surround.audio.originalId).toBe('en,en-6c');

    expect(h1080Stereo.video.originalId).toBe('480,1080');
    expect(h1080Stereo.audio.originalId).toBe('en,en');
    expect(h720Stereo.video.originalId).toBe('480,720');
    expect(h720Stereo.audio.originalId).toBe('en,en');
    expect(h480Stereo.video.originalId).toBe('480,480');
    expect(h480Stereo.audio.originalId).toBe('en,en');
  });

  it('Ad insertion - smaller ad, res not found in main content', async () => {
    /** @type {!Array.<shaka.util.PeriodCombiner.Period>} */
    const periods = [
      {
        id: '1',
        videoStreams: [
          makeVideoStream(1080),
          makeVideoStream(720),
        ],
        audioStreams: [
          makeAudioStream('en'),
        ],
        textStreams: [],
      },
      {
        id: '2',
        videoStreams: [
          makeVideoStream(480),
        ],
        audioStreams: [
          makeAudioStream('en'),
        ],
        textStreams: [],
      },
    ];

    // Start with the first period only.
    await combiner.combinePeriods(periods.slice(0, 1), /* isDynamic= */ true);
    expect(combiner.getVariants()).toEqual(jasmine.arrayWithExactContents([
      makeAVVariant(1080, 'en'),
      makeAVVariant(720, 'en'),
    ]));

    // Add the second period.
    await combiner.combinePeriods(periods, /* isDynamic= */ true);
    const variants = combiner.getVariants();
    expect(variants).toEqual(jasmine.arrayWithExactContents([
      makeAVVariant(1080, 'en'),
      makeAVVariant(720, 'en'),
    ]));

    // We can use the originalId field to see what each track is composed of.
    const h1080 = variants.find((v) => v.video.height == 1080);
    const h720 = variants.find((v) => v.video.height == 720);
    expect(h1080.video.originalId).toBe('1080,480');
    expect(h720.video.originalId).toBe('720,480');
  });

  it('Ad insertion - larger ad, res not found in main content', async () => {
    /** @type {!Array.<shaka.util.PeriodCombiner.Period>} */
    const periods = [
      {
        id: '1',
        videoStreams: [
          makeVideoStream(720),
          makeVideoStream(480),
        ],
        audioStreams: [
          makeAudioStream('en'),
        ],
        textStreams: [],
      },
      {
        id: '2',
        videoStreams: [
          makeVideoStream(1080),
        ],
        audioStreams: [
          makeAudioStream('en'),
        ],
        textStreams: [],
      },
    ];

    // Start with the first period only.
    await combiner.combinePeriods(periods.slice(0, 1), /* isDynamic= */ true);
    expect(combiner.getVariants()).toEqual(jasmine.arrayWithExactContents([
      makeAVVariant(720, 'en'),
      makeAVVariant(480, 'en'),
    ]));

    // Add the second period.
    await combiner.combinePeriods(periods, /* isDynamic= */ true);
    const variants = combiner.getVariants();
    expect(variants.length).toBe(2);

    // We can use the originalId field to see what each track is composed of.
    const originalIds = variants.map((v) => v.video.originalId);
    expect(originalIds).toEqual(jasmine.arrayWithExactContents([
      '720,1080',
      '480,1080',
    ]));
  });

  it('Language changes during and after an ad', async () => {
    /** @type {!Array.<shaka.util.PeriodCombiner.Period>} */
    const periods = [
      {
        id: 'show1',
        videoStreams: [
          makeVideoStream(1080),
          makeVideoStream(480),
        ],
        audioStreams: [
          makeAudioStream('es', /* channels= */ 2, /* primary= */ true),
          makeAudioStream('fr', /* channels= */ 2, /* primary= */ false),
        ],
        textStreams: [],
      },
      {
        id: 'ad',
        videoStreams: [
          makeVideoStream(480),
        ],
        audioStreams: [
          makeAudioStream('en'),
        ],
        textStreams: [],
      },
      {
        id: 'show2',
        videoStreams: [
          makeVideoStream(1080),
          makeVideoStream(480),
        ],
        audioStreams: [
          makeAudioStream('es', /* channels= */ 2, /* primary= */ false),
          makeAudioStream('fr', /* channels= */ 2, /* primary= */ true),
        ],
        textStreams: [],
      },
    ];

    await combiner.combinePeriods(periods, /* isDynamic= */ false);
    const variants = combiner.getVariants();
    expect(variants).toEqual(jasmine.arrayWithExactContents([
      makeAVVariant(1080, 'es'),
      makeAVVariant(480, 'es'),
      makeAVVariant(1080, 'en'),
      makeAVVariant(480, 'en'),
      makeAVVariant(1080, 'fr'),
      makeAVVariant(480, 'fr'),
    ]));

    // We can use the originalId field to see what each track is composed of.

    // The Spanish track is primary in the first period and has English 480p in
    // the middle period.
    const spanish = variants.find(
        (v) => v.video.height == 1080 && v.language == 'es');
    expect(spanish.audio.originalId).toBe('es*,en,es');
    expect(spanish.video.originalId).toBe('1080,480,1080');

    // The French track is primary in the last period and has English 480p in
    // the middle period.
    const french = variants.find(
        (v) => v.video.height == 1080 && v.language == 'fr');
    expect(french.audio.originalId).toBe('fr,en,fr*');
    expect(french.video.originalId).toBe('1080,480,1080');

    // Because there's no English in the first or last periods, the English
    // track follows the "primary" language in those periods.
    const english = variants.find(
        (v) => v.video.height == 1080 && v.language == 'en');
    expect(english.audio.originalId).toBe('es*,en,fr*');
    expect(english.video.originalId).toBe('1080,480,1080');
  });

  it('VOD playlist of completely unrelated periods', async () => {
    /** @type {!Array.<shaka.util.PeriodCombiner.Period>} */
    const periods = [
      {
        id: 'show1',
        videoStreams: [
          makeVideoStream(1080),
        ],
        audioStreams: [
          makeAudioStream('es'),
        ],
        textStreams: [],
      },
      {
        id: 'show2',
        videoStreams: [
          makeVideoStream(1080),
        ],
        audioStreams: [
          makeAudioStream('en'),
        ],
        textStreams: [],
      },
    ];

    await combiner.combinePeriods(periods, /* isDynamic= */ false);
    const variants = combiner.getVariants();
    expect(variants).toEqual(jasmine.arrayWithExactContents([
      makeAVVariant(1080, 'es'),
      makeAVVariant(1080, 'en'),
    ]));

    // We can use the originalId field to see what each track is composed of.

    // Both tracks are composed of the same things.
    const spanish = variants.find(
        (v) => v.video.height == 1080 && v.language == 'es');
    const english = variants.find(
        (v) => v.video.height == 1080 && v.language == 'en');
    expect(spanish.audio.originalId).toBe('es,en');
    expect(english.audio.originalId).toBe('es,en');
  });

  it('Multiple representations of the same resolution', async () => {
    /** @type {shaka.extern.Stream} */
    const video1 = makeVideoStream(480);
    video1.bandwidth = 1;
    /** @type {shaka.extern.Stream} */
    const video2 = makeVideoStream(480);
    video2.bandwidth = 2;
    /** @type {!Array.<shaka.util.PeriodCombiner.Period>} */
    const periods = [
      {
        id: '1',
        videoStreams: [
          video1,
          video2,
        ],
        audioStreams: [
          makeAudioStream('en'),
        ],
        textStreams: [],
      },
    ];

    await combiner.combinePeriods(periods, /* isDynamic= */ true);
    const variants = combiner.getVariants();
    expect(variants).toEqual(jasmine.arrayWithExactContents([
      makeAVVariant(480, 'en', /* channels= */ 2),
      makeAVVariant(480, 'en', /* channels= */ 2),
    ]));

    const lowBandwidth = variants.find(
        (v) => v.video.height == 480 && v.bandwidth == 1);
    const highBandwidth = variants.find(
        (v) => v.video.height == 480 && v.bandwidth == 2);
    expect(lowBandwidth.video.originalId).toBe('480');
    expect(highBandwidth.video.originalId).toBe('480');
  });


  it('Filters out duplicate streams', async () => {
    // v1 and v3 are duplicates
    const v1 = makeVideoStream(1280);
    v1.frameRate = 30000/1001;
    v1.originalId = 'v1';
    v1.bandwidth = 6200000;

    const v2 = makeVideoStream(1920);
    v2.frameRate = 30000/1001;
    v2.originalId = 'v2';
    v2.bandwidth = 8000000;

    const v3 = makeVideoStream(1280);
    v3.frameRate = 30000/1001;
    v3.originalId = 'v3';
    v3.bandwidth = 6200000;

    // a1 and a2 are duplicats
    const a1 = makeAudioStream('en', /* channels= */ 2);
    a1.originalId = 'a1';
    a1.bandwidth = 65106;
    a1.roles = ['role1', 'role2'];

    const a2 = makeAudioStream('en', /* channels= */ 2);
    a2.originalId = 'a2';
    a2.bandwidth = 65106;
    a2.roles = ['role1', 'role2'];

    const a3 = makeAudioStream('en', /* channels= */ 2);
    a3.originalId = 'a3';
    a3.bandwidth = 97065;
    a2.roles = ['role1', 'role2'];

    // t1 and t3 are duplicates
    const t1 = makeTextStream('en');
    t1.originalId = 't1';
    t1.roles = ['role1'];

    const t2 = makeTextStream('en');
    t2.originalId = 't2';
    t2.roles = ['role1', 'role2'];

    const t3 = makeTextStream('en');
    t3.originalId = 't3';
    t3.roles = ['role1'];

    /** @type {!Array.<shaka.util.PeriodCombiner.Period>} */
    const periods = [
      {
        id: '1',
        videoStreams: [
          v1,
          v2,
          v3,
        ],
        audioStreams: [
          a1,
          a2,
          a3,
        ],
        textStreams: [
          t1,
          t2,
          t3,
        ],
      },
    ];

    await combiner.combinePeriods(periods, /* isDynamic= */ true);
    const variants = combiner.getVariants();
    expect(variants.length).toBe(4);

    // v3 should've been filtered out
    const videoIds = variants.map((v) => v.video.originalId);
    for (const id of videoIds) {
      expect(id).not.toBe('v3');
    }

    // a2 should've been filtered out
    const audioIds = variants.map((v) => v.audio.originalId);
    for (const id of audioIds) {
      expect(id).not.toBe('a2');
    }

    const textStreams = combiner.getTextStreams();
    expect(textStreams.length).toBe(2);

    // t3 should've been filtered out
    const textIds = textStreams.map((t) => t.originalId);
    for (const id of textIds) {
      expect(id).not.toBe('t3');
    }
  });

  it('Text track gaps', async () => {
    /** @type {!Array.<shaka.util.PeriodCombiner.Period>} */
    const periods = [
      {
        id: '1',
        videoStreams: [
          makeVideoStream(1080),
        ],
        audioStreams: [
          makeAudioStream('en'),
        ],
        textStreams: [
          makeTextStream('en'),
        ],
      },
      {
        id: '2',
        videoStreams: [
          makeVideoStream(1080),
        ],
        audioStreams: [
          makeAudioStream('en'),
        ],
        textStreams: [
          /* No text streams */
        ],
      },
      {
        id: '3',
        videoStreams: [
          makeVideoStream(1080),
        ],
        audioStreams: [
          makeAudioStream('en'),
        ],
        textStreams: [
          makeTextStream('en'),
          makeTextStream('es'),
        ],
      },
    ];

    await combiner.combinePeriods(periods, /* isDynamic= */ false);
    const textStreams = combiner.getTextStreams();
    expect(textStreams).toEqual(jasmine.arrayWithExactContents([
      jasmine.objectContaining({
        language: 'es',
      }),
      jasmine.objectContaining({
        language: 'en',
      }),
    ]));

    // We can use the originalId field to see what each track is composed of.

    // Both tracks are composed of the same things.
    const spanish = textStreams.find((s) => s.language == 'es');
    const english = textStreams.find((s) => s.language == 'en');
    expect(spanish.originalId).toBe(',,es');
    expect(english.originalId).toBe('en,,en');
  });

  it('Disjoint audio channels', async () => {
    /** @type {!Array.<shaka.util.PeriodCombiner.Period>} */
    const periods = [
      {
        id: '1',
        videoStreams: [
          makeVideoStream(1080),
        ],
        audioStreams: [
          makeAudioStream('en', /* channels= */ 6),
        ],
        textStreams: [],
      },
      {
        id: '2',
        videoStreams: [
          makeVideoStream(1080),
        ],
        audioStreams: [
          makeAudioStream('en', /* channels= */ 2),
        ],
        textStreams: [],
      },
    ];

    await combiner.combinePeriods(periods, /* isDynamic= */ false);
    const variants = combiner.getVariants();
    expect(variants).toEqual(jasmine.arrayWithExactContents([
      makeAVVariant(1080, 'en', /* channels= */ 6),
    ]));

    // We can use the originalId field to see what each track is composed of.

    // There is only one track.  The whole thing gets "upgraded" to 6-channel
    // surround.
    const audio = variants[0].audio;
    expect(audio.originalId).toBe('en-6c,en');
  });

  it('Disjoint audio sample rates, ascending order', async () => {
    const makeAudioStreamWithSampleRate = (rate) => {
      const stream = makeAudioStream('en');
      stream.audioSamplingRate = rate;
      stream.originalId = rate.toString();
      return stream;
    };

    /** @type {!Array.<shaka.util.PeriodCombiner.Period>} */
    const periods = [
      {
        id: '1',
        videoStreams: [
          makeVideoStream(1080),
        ],
        audioStreams: [
          makeAudioStreamWithSampleRate(48000),
        ],
        textStreams: [],
      },
      {
        id: '2',
        videoStreams: [
          makeVideoStream(1080),
        ],
        audioStreams: [
          makeAudioStreamWithSampleRate(44100),
        ],
        textStreams: [],
      },
    ];

    await combiner.combinePeriods(periods, /* isDynamic= */ false);
    const variants = combiner.getVariants();
    expect(variants).toEqual(jasmine.arrayWithExactContents([
      makeAVVariant(1080, 'en'),
    ]));

    // We can use the originalId field to see what each track is composed of.

    // There is only one track.
    const audio = variants[0].audio;
    expect(audio.audioSamplingRate).toBe(48000);
    expect(audio.originalId).toBe('48000,44100');
  });

  it('Disjoint audio sample rates, descending order', async () => {
    const makeAudioStreamWithSampleRate = (rate) => {
      const stream = makeAudioStream('en');
      stream.audioSamplingRate = rate;
      stream.originalId = rate.toString();
      return stream;
    };

    /** @type {!Array.<shaka.util.PeriodCombiner.Period>} */
    const periods = [
      {
        id: '1',
        videoStreams: [
          makeVideoStream(1080),
        ],
        audioStreams: [
          makeAudioStreamWithSampleRate(44100),
        ],
        textStreams: [],
      },
      {
        id: '2',
        videoStreams: [
          makeVideoStream(1080),
        ],
        audioStreams: [
          makeAudioStreamWithSampleRate(48000),
        ],
        textStreams: [],
      },
    ];

    await combiner.combinePeriods(periods, /* isDynamic= */ false);
    const variants = combiner.getVariants();
    expect(variants).toEqual(jasmine.arrayWithExactContents([
      makeAVVariant(1080, 'en'),
    ]));

    // We can use the originalId field to see what each track is composed of.

    // There is only one track.
    const audio = variants[0].audio;
    expect(audio.audioSamplingRate).toBe(44100);
    expect(audio.originalId).toBe('44100,48000');
  });

  it('ignores newly added codecs', async () => {
    const newCodec = makeVideoStream(720);
    newCodec.codecs = 'foo.abcd';

    /** @type {!Array.<shaka.util.PeriodCombiner.Period>} */
    const periods = [
      {
        id: '1',
        videoStreams: [
          makeVideoStream(1080),
        ],
        audioStreams: [],
        textStreams: [],
      },
      {
        id: '2',
        videoStreams: [
          makeVideoStream(1080),
          newCodec,
        ],
        audioStreams: [],
        textStreams: [],
      },
    ];

    await combiner.combinePeriods(periods, /* isDynamic= */ false);
    const variants = combiner.getVariants();
    expect(variants.length).toBe(1);
  });


  it('Matches streams with most roles in common', async () => {
    const makeAudioStreamWithRoles = (roles) => {
      const stream = makeAudioStream('en');
      stream.roles = roles;
      return stream;
    };

    const stream1 = makeAudioStreamWithRoles(['role1', 'role2']);
    stream1.originalId = 'stream1';

    const stream2 = makeAudioStreamWithRoles(['role1']);
    stream2.originalId = 'stream2';

    const stream3 = makeAudioStreamWithRoles(['role1', 'role2']);
    stream3.originalId = 'stream3';

    const stream4 = makeAudioStreamWithRoles(['role1']);
    stream4.originalId = 'stream4';

    /** @type {!Array.<shaka.util.PeriodCombiner.Period>} */
    const periods = [
      {
        id: '1',
        videoStreams: [
          makeVideoStream(1080),
        ],
        audioStreams: [
          stream1,
          stream2,
        ],
        textStreams: [],
      },
      {
        id: '2',
        videoStreams: [
          makeVideoStream(1080),
        ],
        audioStreams: [
          stream3,
          stream4,
        ],
        textStreams: [],
      },
    ];

    await combiner.combinePeriods(periods, /* isDynamic= */ false);
    const variants = combiner.getVariants();

    expect(variants).toEqual(jasmine.arrayWithExactContents([
      makeAVVariant(1080, 'en'),
      makeAVVariant(1080, 'en'),
    ]));

    // We can use the originalId field to see what each track is composed of.
    const audio1 = variants[0].audio;
    expect(audio1.roles).toEqual(['role1', 'role2']);
    expect(audio1.originalId).toBe('stream1,stream3');

    const audio2 = variants[1].audio;
    expect(audio2.roles).toEqual(['role1']);
    expect(audio2.originalId).toBe('stream2,stream4');
  });


  it('The number of variants stays stable after many periods ' +
      'when going between similar content and varying ads', async () => {
    // This test is based on the content from
    // https://github.com/google/shaka-player/issues/2716
    // that used to cause our period flattening logic to keep
    // creating new variants for every new period added.
    // It's ok to create a few additional varinats/streams,
    // but we should stabilize eventually and keep the number
    // of variants from growing indefinitely.

    // 1st period streams
    const v1 = makeVideoStream(720);
    v1.frameRate = 30000/1001;
    v1.bandwidth = 6200000;

    const v2 = makeVideoStream(1080);
    v2.frameRate = 30000/1001;
    v2.bandwidth = 8000000;

    const v3 = makeVideoStream(272);
    v3.frameRate = 15000/1001;
    v3.bandwidth = 400000;

    const v4 = makeVideoStream(360);
    v4.frameRate = 30000/1001;
    v4.bandwidth = 800000;

    const v5 = makeVideoStream(432);
    v5.frameRate = 30000/1001;
    v5.bandwidth = 1200000;

    // 2nd period streams
    const v6 = makeVideoStream(432);
    v6.frameRate = 24000/1001;
    v6.bandwidth = 933000;

    const v7 = makeVideoStream(360);
    v7.frameRate = 30000/1001;
    v7.bandwidth = 363000;

    const v8 = makeVideoStream(540);
    v8.frameRate = 15000/1001;
    v8.bandwidth = 1780000;

    const v9 = makeVideoStream(720);
    v9.frameRate = 30000/1001;
    v9.bandwidth = 3940000;

    const v10 = makeVideoStream(360);
    v10.frameRate = 30000/1001;
    v10.bandwidth = 599000;


    // 3nd period streams
    const v11 = makeVideoStream(432);
    v11.frameRate = 24000/1001;
    v11.bandwidth = 894000;

    const v12 = makeVideoStream(360);
    v12.frameRate = 30000/1001;
    v12.bandwidth = 365000;

    const v13 = makeVideoStream(540);
    v13.frameRate = 15000/1001;
    v13.bandwidth = 1611000;

    const v14 = makeVideoStream(720);
    v14.frameRate = 30000/1001;
    v14.bandwidth = 3967000;

    const v15 = makeVideoStream(360);
    v15.frameRate = 30000/1001;
    v15.bandwidth = 570000;

    // 4th period streams
    const v16 = makeVideoStream(432);
    v16.frameRate = 24000/1001;
    v16.bandwidth = 933000;

    const v17 = makeVideoStream(360);
    v17.frameRate = 24000/1001;
    v17.bandwidth = 363000;

    const v18 = makeVideoStream(540);
    v18.frameRate = 24000/1001;
    v18.bandwidth = 1780000;

    const v19 = makeVideoStream(720);
    v19.frameRate = 24000/1001;
    v19.bandwidth = 3940000;

    const v20 = makeVideoStream(360);
    v20.frameRate = 24000/1001;
    v20.bandwidth = 570005990000;

    /** @type {!Array.<shaka.util.PeriodCombiner.Period>} */
    const periods = [
      {
        id: '1',
        videoStreams: [v1, v2, v3, v4, v5],
        audioStreams: [],
        textStreams: [],
      },
      {
        id: '2',
        videoStreams: [v6, v7, v8, v9, v10],
        audioStreams: [],
        textStreams: [],
      },
      {
        id: '3',
        videoStreams: [v11, v12, v13, v14, v15],
        audioStreams: [],
        textStreams: [],
      },
      {
        id: '4',
        videoStreams: [v16, v17, v18, v19, v20],
        audioStreams: [],
        textStreams: [],
      },
      {
        id: '5',
        // Same as 1st
        videoStreams: [v1, v2, v3, v4, v5],
        audioStreams: [],
        textStreams: [],
      },
      {
        id: '6',
        // Same as 2nd
        videoStreams: [v6, v7, v8, v9, v10],
        audioStreams: [],
        textStreams: [],
      },
      {
        id: '7',
        // Same as 3rd
        videoStreams: [v11, v12, v13, v14, v15],
        audioStreams: [],
        textStreams: [],
      },
      {
        id: '8',
        // Same as 4th
        videoStreams: [v16, v17, v18, v19, v20],
        audioStreams: [],
        textStreams: [],
      },
      // Adding the 1st period again since it was the one that used to
      // cause trouble when repeated.
      {
        id: '9',
        // Same as 1st and 5th
        videoStreams: [v1, v2, v3, v4, v5],
        audioStreams: [],
        textStreams: [],
      },
    ];

    await combiner.combinePeriods(periods.slice(0, 4), /* isDynamic= */ true);
    const variantsAfter4Periods = combiner.getVariants();

    await combiner.combinePeriods(periods.slice(0, 8), /* isDynamic= */ true);
    const variantsAfter8Periods = combiner.getVariants();
    expect(variantsAfter4Periods).toEqual(variantsAfter8Periods);

    await combiner.combinePeriods(periods, /* isDynamic= */ true);
    const variantsAfterAllPeriods = combiner.getVariants();
    expect(variantsAfter4Periods).toEqual(variantsAfterAllPeriods);
  });


  describe('compareClosestPreferLower', () => {
    const PeriodCombiner = shaka.util.PeriodCombiner;
    const {BETTER, EQUAL, WORSE} = shaka.util.PeriodCombiner.BetterOrWorse;

    it('Prefers value equal to the output', () => {
      let isCandidateBetter = PeriodCombiner.compareClosestPreferLower(
          /* output= */ 5, /* bestValue= */ 5, /* candidateValue= */ 3);
      expect(isCandidateBetter).toBe(WORSE);

      // Make sure it works correctly whether it's the candidate or the best
      // value that is equel to the output.
      isCandidateBetter = PeriodCombiner.compareClosestPreferLower(
          /* output= */ 5, /* bestValue= */ 3, /* candidateValue= */ 5);
      expect(isCandidateBetter).toBe(BETTER);
    });

    it('Prefers a value lower than the output', () => {
      let isCandidateBetter = PeriodCombiner.compareClosestPreferLower(
          /* output= */ 5, /* bestValue= */ 3, /* candidateValue= */ 6);
      expect(isCandidateBetter).toBe(WORSE);

      isCandidateBetter = PeriodCombiner.compareClosestPreferLower(
          /* output= */ 5, /* bestValue= */ 7, /* candidateValue= */ 2);
      expect(isCandidateBetter).toBe(BETTER);
    });

    it('If both values are lower than the output,' +
       ' prefer the one that\'s closer', () => {
      let isCandidateBetter = PeriodCombiner.compareClosestPreferLower(
          /* output= */ 5, /* bestValue= */ 4, /* candidateValue= */ 3);
      expect(isCandidateBetter).toBe(WORSE);

      isCandidateBetter = PeriodCombiner.compareClosestPreferLower(
          /* output= */ 5, /* bestValue= */ 2, /* candidateValue= */ 3);
      expect(isCandidateBetter).toBe(BETTER);
    });

    it('If both values are greater than the output,' +
       ' prefer the one that\'s closer', () => {
      let isCandidateBetter = PeriodCombiner.compareClosestPreferLower(
          /* output= */ 5, /* bestValue= */ 6, /* candidateValue= */ 7);
      expect(isCandidateBetter).toBe(WORSE);

      isCandidateBetter = PeriodCombiner.compareClosestPreferLower(
          /* output= */ 5, /* bestValue= */ 9, /* candidateValue= */ 8);
      expect(isCandidateBetter).toBe(BETTER);
    });
  });

  /** @type {number} */
  let nextId = 0;

  /**
   * @param {number} height
   * @return {shaka.extern.Stream}
   * @suppress {accessControls}
   */
  function makeVideoStream(height) {
    const width = height * 4 / 3;
    const streamGenerator = new shaka.test.ManifestGenerator.Stream(
        /* manifest= */ null,
        /* isPartial= */ false,
        /* id= */ nextId++,
        /* type= */ shaka.util.ManifestParserUtils.ContentType.VIDEO,
        /* lang= */ 'und');
    streamGenerator.size(width, height);
    streamGenerator.originalId = height.toString();
    return streamGenerator.build_();
  }

  /**
   * @param {string} language
   * @param {number=} channels
   * @param {boolean=} primary
   * @return {shaka.extern.Stream}
   * @suppress {accessControls}
   */
  function makeAudioStream(language, channels = 2, primary = false) {
    const streamGenerator = new shaka.test.ManifestGenerator.Stream(
        /* manifest= */ null,
        /* isPartial= */ false,
        /* id= */ nextId++,
        /* type= */ shaka.util.ManifestParserUtils.ContentType.AUDIO,
        language);
    streamGenerator.primary = primary;
    streamGenerator.channelsCount = channels;
    streamGenerator.originalId = primary ? language + '*' : language;
    if (channels != 2) {
      streamGenerator.originalId += `-${channels}c`;
    }
    return streamGenerator.build_();
  }

  /**
   * @param {string} language
   * @param {boolean=} primary
   * @return {shaka.extern.Stream}
   * @suppress {accessControls}
   */
  function makeTextStream(language, primary = false) {
    const streamGenerator = new shaka.test.ManifestGenerator.Stream(
        /* manifest= */ null,
        /* isPartial= */ false,
        /* id= */ nextId++,
        /* type= */ shaka.util.ManifestParserUtils.ContentType.TEXT,
        language);
    streamGenerator.primary = primary;
    streamGenerator.originalId = primary ? language + '*' : language;
    return streamGenerator.build_();
  }

  /**
   * @param {number} height
   * @param {string} language
   * @param {number=} channels
   * @return {shaka.extern.Variant}
   */
  function makeAVVariant(height, language, channels = 2) {
    const variant = jasmine.objectContaining({
      language,
      audio: jasmine.objectContaining({
        language,
        channelsCount: channels,
      }),
      video: jasmine.objectContaining({
        height,
      }),
    });
    return /** @type {shaka.extern.Variant} */(/** @type {?} */(variant));
  }
});
