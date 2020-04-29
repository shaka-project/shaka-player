/** @license
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

    // We don't know what order they will be in, but both tracks got "upgraded"
    // to 1080p by the ad.  We would consider this scenario unusual.  The
    // strange results are because we can't tell the difference between joining
    // a presentation during an ad or during the main content, so we don't know
    // which Period's resolutions would be more "authoritative" for the track
    // list.
    expect(variants).toEqual(jasmine.arrayWithExactContents([
      makeAVVariant(1080, 'en'),
      makeAVVariant(1080, 'en'),
    ]));

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
    expect(audio.audioSamplingRate).toBe(48000);
    expect(audio.originalId).toBe('44100,48000');
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
