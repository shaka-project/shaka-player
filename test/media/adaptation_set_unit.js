/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('AdaptationSet', () => {
  describe('roles', () => {
    const mimeType = 'mime-type';
    const audioCodecs = ['a.35'];
    const videoCodecs = ['b.12'];

    it('accepts matching roles', () => {
      const variants = [
        makeVariant(
            1,  // variant id
            makeStream(11, mimeType, audioCodecs, ['audio-role-1'], null),
            makeStream(12, mimeType, videoCodecs, ['video-role-1'], null)),

        makeVariant(
            2,  // variant id
            makeStream(21, mimeType, audioCodecs, ['audio-role-1'], null),
            makeStream(22, mimeType, videoCodecs, ['video-role-1'], null)),
      ];

      const set = new shaka.media.AdaptationSet(variants[0]);
      expect(set.canInclude(variants[1])).toBeTruthy();
    });

    it('accepts matching empty roles', () => {
      const variants = [
        makeVariant(
            1,  // variant id
            makeStream(11, mimeType, audioCodecs, [], null),
            makeStream(12, mimeType, videoCodecs, [], null)),
        makeVariant(
            2,  // variant id
            makeStream(21, mimeType, audioCodecs, [], null),
            makeStream(22, mimeType, videoCodecs, [], null)),
      ];

      const set = new shaka.media.AdaptationSet(variants[0]);
      expect(set.canInclude(variants[1])).toBeTruthy();
    });

    it('reject different roles', () => {
      const variants = [
        makeVariant(
            1,  // variant id
            makeStream(11, mimeType, audioCodecs, ['audio-role-1'], null),
            makeStream(12, mimeType, videoCodecs, ['video-role-1'], null)),

        // Can't include this variant because the audio roles do not match.
        makeVariant(
            2,  // variant id
            makeStream(21, mimeType, audioCodecs, ['audio-role-2'], null),
            makeStream(22, mimeType, videoCodecs, ['video-role-1'], null)),

        // Can't include this variant because the video roles do not match.
        makeVariant(
            3,  // variant id
            makeStream(31, mimeType, audioCodecs, ['audio-role-1'], null),
            makeStream(32, mimeType, videoCodecs, ['video-role-2'], null)),

        // Can't include this variant because the audio role is missing.
        makeVariant(
            4,  // variant id
            makeStream(41, mimeType, audioCodecs, [], null),
            makeStream(42, mimeType, videoCodecs, ['video-role-1'], null)),

        // Can't include this variant because the video role is missing.
        makeVariant(
            5,  // variant id
            makeStream(51, mimeType, audioCodecs, ['audio-role-1'], null),
            makeStream(52, mimeType, videoCodecs, [], null)),
      ];

      const set = new shaka.media.AdaptationSet(variants[0]);
      expect(set.canInclude(variants[1])).toBeFalsy();
      expect(set.canInclude(variants[2])).toBeFalsy();
      expect(set.canInclude(variants[3])).toBeFalsy();
      expect(set.canInclude(variants[4])).toBeFalsy();
    });
  });

  it('rejects different mime types', () => {
    const variants = [
      makeVariant(
          1,  // variant id
          makeStream(10, 'a', ['a.35'], [], null),
          makeStream(11, 'a', ['b.12'], [], null)),

      // Can't include this variant because the audio stream has a different
      // mime type.
      makeVariant(
          2,  // variant id
          makeStream(12, 'b', ['a.35'], [], null),
          makeStream(13, 'a', ['b.12'], [], null)),
    ];

    const set = new shaka.media.AdaptationSet(variants[0]);
    expect(set.canInclude(variants[1])).toBeFalsy();
  });

  it('rejects mis-aligned transmuxed streams', () => {
    const variants = [
      makeVariant(
          1,  // variant id
          null, // no audio
          makeStream(10, 'a', ['a.35', 'b.12'], [], null)),

      // Can't mix transmuxed and non-transmuxed streams.
      makeVariant(
          2,  // variant id
          makeStream(11, 'a', ['a.35'], [], null),
          makeStream(12, 'a', ['b.12'], [], null)),

      // Can't mix transmuxed streams with different bases.
      makeVariant(
          3,  // variant id
          null, // no audio
          makeStream(13, 'a', ['a.35', 'c.12'], [], null)),
    ];

    const set = new shaka.media.AdaptationSet(variants[0]);
    expect(set.canInclude(variants[1])).toBeFalsy();
    expect(set.canInclude(variants[2])).toBeFalsy();
  });

  it('accepts matching mono and stereo channelsCount', () => {
    const variants = [
      makeVariant(
          1,  // variant id
          makeStream(11, 'a', ['a.35'], [], 1),
          makeStream(12, 'a', ['b.12'], [], 1)),
      makeVariant(
          2,  // variant id
          makeStream(21, 'a', ['a.35'], [], 2),
          makeStream(22, 'a', ['b.12'], [], 2)),
    ];

    const set = new shaka.media.AdaptationSet(variants[0]);
    expect(set.canInclude(variants[1])).toBeTruthy();
  });

  it('rejects mono and surround channelsCount', () => {
    const variants = [
      makeVariant(
          1,  // variant id
          makeStream(11, 'a', ['a.35'], [], 1),
          makeStream(12, 'a', ['b.12'], [], 1)),

      // Can't include this variant because the audio stream has a surround
      // channelsCount.
      makeVariant(
          2,  // variant id
          makeStream(21, 'a', ['a.35'], [], 6),
          makeStream(22, 'a', ['b.12'], [], 6)),
    ];

    const set = new shaka.media.AdaptationSet(variants[0]);
    expect(set.canInclude(variants[1])).toBeFalsy();
  });

  it('accepts an unknown channelsCount with the same codec family', () => {
    const variants = [
      makeVariant(
          1,  // variant id
          makeStream(11, 'a', ['mp4a.40.2'], [], 2),
          makeStream(12, 'a', ['b.12'], [], null)),
      makeVariant(
          2,  // variant id
          makeStream(21, 'a', ['mp4a.40.5'], [], null),
          makeStream(22, 'a', ['b.12'], [], null)),
    ];

    const set = new shaka.media.AdaptationSet(variants[0]);
    expect(set.canInclude(variants[1])).toBeTruthy();
  });

  it('rejects an unknown channelsCount with another codec family', () => {
    const variants = [
      makeVariant(
          1,  // variant id
          makeStream(11, 'a', ['ec-3'], [], 6),
          makeStream(12, 'a', ['b.12'], [], null)),
      makeVariant(
          2,  // variant id
          makeStream(21, 'a', ['mp4a.40.2'], [], null),
          makeStream(22, 'a', ['b.12'], [], null)),
    ];

    const set = new shaka.media.AdaptationSet(
        variants[0], [], /* compareCodecs= */ false);
    expect(set.canInclude(variants[1], /* compareCodecs= */ false))
        .toBeFalsy();
  });

  describe('haveSameAudio', () => {
    it('ignores the codec profile within a codec family', () => {
      const a = makeVariant(
          1,  // variant id
          makeStream(11, 'a', ['mp4a.40.29'], [], 2),
          makeStream(12, 'a', ['b.12'], [], null));
      const b = makeVariant(
          2,  // variant id
          makeStream(21, 'a', ['mp4a.40.2'], [], 2),
          makeStream(22, 'a', ['b.13'], [], null));

      expect(shaka.media.AdaptationSet.haveSameAudio(a, b)).toBe(true);
    });

    it('matches an unknown channelsCount', () => {
      const a = makeVariant(
          1,  // variant id
          makeStream(11, 'a', ['mp4a.40.5'], [], null),
          makeStream(12, 'a', ['b.12'], [], null));
      const b = makeVariant(
          2,  // variant id
          makeStream(21, 'a', ['mp4a.40.2'], [], 1),
          makeStream(22, 'a', ['b.13'], [], null));

      expect(shaka.media.AdaptationSet.haveSameAudio(a, b)).toBe(true);
    });

    it('rejects different codec families and channel counts', () => {
      const aac = makeVariant(
          1,  // variant id
          makeStream(11, 'a', ['mp4a.40.2'], [], 2),
          makeStream(12, 'a', ['b.12'], [], null));
      const ec3 = makeVariant(
          2,  // variant id
          makeStream(21, 'a', ['ec-3'], [], 2),
          makeStream(22, 'a', ['b.13'], [], null));
      const mono = makeVariant(
          3,  // variant id
          makeStream(31, 'a', ['mp4a.40.2'], [], 1),
          makeStream(32, 'a', ['b.14'], [], null));

      expect(shaka.media.AdaptationSet.haveSameAudio(aac, ec3)).toBe(false);
      expect(shaka.media.AdaptationSet.haveSameAudio(aac, mono)).toBe(false);
    });
  });

  describe('getAudioFallbacks', () => {
    const AdaptationSet = shaka.media.AdaptationSet;

    /**
     * @param {number} id
     * @param {number} bandwidth
     * @param {number} channelsCount
     * @param {string=} codec
     * @param {boolean=} spatialAudio
     * @param {?string=} label
     * @return {shaka.extern.Variant}
     */
    function makeAudioVariant(id, bandwidth, channelsCount, codec = 'ec-3',
        spatialAudio = false, label = null) {
      const audio = makeStream(
          id * 10, 'a', [codec], [], channelsCount, spatialAudio);
      audio.label = label;
      const variant = makeVariant(
          id, audio, makeStream(id * 10 + 1, 'v', ['avc1.4d401e'], [], null));
      variant.bandwidth = bandwidth;
      return variant;
    }

    it('falls back one channel tier at a time below the cheapest', () => {
      const atmos = [
        makeAudioVariant(1, 5000, 16, 'ec-3', /* spatialAudio= */ true),
        makeAudioVariant(2, 8000, 16, 'ec-3', /* spatialAudio= */ true),
      ];
      const surround51 = [
        makeAudioVariant(3, 4000, 6),
        makeAudioVariant(4, 6000, 6),  // Not cheaper than Atmos.
      ];
      const stereo = [
        makeAudioVariant(5, 1000, 2),
        makeAudioVariant(6, 3000, 2),
        makeAudioVariant(7, 4500, 2),  // Not cheaper than 5.1.
      ];
      const mono = [
        makeAudioVariant(8, 500, 1),
        makeAudioVariant(9, 1200, 1),  // Not cheaper than stereo.
      ];
      const all = [...atmos, ...surround51, ...stereo, ...mono];

      const fallbacks = AdaptationSet.getAudioFallbacks(
          atmos, all, /* compareCodecs= */ false);
      expect(fallbacks.map((v) => v.id)).toEqual([3, 5, 6, 8]);
    });

    it('only falls back to the same audio', () => {
      const surround = [makeAudioVariant(1, 4000, 6, 'ec-3', false, 'en')];
      const all = [
        ...surround,
        makeAudioVariant(2, 1000, 2, 'ec-3', false, 'en'),
        makeAudioVariant(3, 900, 2, 'ec-3', false, 'commentary'),
      ];

      const fallbacks = AdaptationSet.getAudioFallbacks(
          surround, all, /* compareCodecs= */ false);
      expect(fallbacks.map((v) => v.id)).toEqual([2]);
    });

    it('uses a single codec family per tier, preferring the current', () => {
      const surround = [makeAudioVariant(1, 4000, 6, 'ec-3')];
      const all = [
        ...surround,
        makeAudioVariant(2, 1000, 2, 'mp4a.40.2'),
        makeAudioVariant(3, 1500, 2, 'mp4a.40.5'),
        makeAudioVariant(4, 2000, 2, 'ec-3'),
      ];

      expect(AdaptationSet.getAudioFallbacks(surround, all, false)
          .map((v) => v.id)).toEqual([4]);

      // Without the current family, the one with the most variants.
      expect(AdaptationSet.getAudioFallbacks(surround, all.slice(0, 3), false)
          .map((v) => v.id)).toEqual([2, 3]);
    });

    it('needs the same codec without smooth codec switching', () => {
      const surround = [makeAudioVariant(1, 4000, 6, 'ec-3')];
      const all = [...surround, makeAudioVariant(2, 1000, 2, 'mp4a.40.2')];

      expect(AdaptationSet.getAudioFallbacks(surround, all, true)).toEqual([]);
    });

    it('does nothing for the lowest tier or unknown channels', () => {
      const stereo = [makeAudioVariant(1, 1000, 2)];
      const unknown = [makeAudioVariant(2, 4000, 0)];
      const all = [...stereo, ...unknown, makeAudioVariant(3, 500, 1)];

      expect(AdaptationSet.getAudioFallbacks(stereo, all, false)
          .map((v) => v.id)).toEqual([3]);
      expect(AdaptationSet.getAudioFallbacks(unknown, all, false)).toEqual([]);
      expect(AdaptationSet.getAudioFallbacks([all[2]], all, false))
          .toEqual([]);
    });
  });

  it('rejects misaligned spatial audio', () => {
    const variants = [
      makeVariant(
          1,  // variant id
          makeStream(11, 'a', ['a.35'], [], 6, false),
          makeStream(12, 'a', ['b.12'], [], 6, false)),
      makeVariant(
          2,  // variant id
          makeStream(21, 'a', ['a.35'], [], 6, true),
          makeStream(22, 'a', ['b.12'], [], 6, true)),
    ];

    const set = new shaka.media.AdaptationSet(variants[0]);
    expect(set.canInclude(variants[1])).toBeFalsy();
  });

  /**
   * Create a variant where the audio stream is optional but the video stream
   * is required. For the cases where audio and video are in the same stream,
   * it should be provided as the video stream.
   *
   * @param {number} id
   * @param {?shaka.extern.Stream} audio
   * @param {shaka.extern.Stream} video
   * @return {shaka.extern.Variant}
   */
  function makeVariant(id, audio, video) {
    return {
      allowedByApplication: true,
      allowedByKeySystem: true,
      audio: audio,
      bandwidth: 1024,
      id: id,
      disabledUntilTime: 0,
      language: '',
      primary: false,
      video: video,
      decodingInfos: [],
    };
  }

  /**
   * @param {number} id
   * @param {string} mimeType
   * @param {!Array<string>} codecs
   * @param {!Array<string>} roles
   * @param {?number} channelsCount
   * @param {boolean=} spatialAudio
   * @return {shaka.extern.Stream}
   */
  function makeStream(id, mimeType, codecs, roles, channelsCount,
      spatialAudio = false) {
    return {
      audioSamplingRate: null,
      channelsCount: channelsCount,
      spatialAudio,
      closedCaptions: null,
      codecs: codecs.join(','),
      supplementalCodecs: '',
      createSegmentIndex: () => Promise.resolve(),
      emsgSchemeIdUris: null,
      encrypted: false,
      drmInfos: [],
      segmentIndex: null,
      id: id,
      keyIds: new Set(),
      label: null,
      language: '',
      originalLanguage: null,
      mimeType: mimeType,
      originalId: String(id),
      primary: false,
      roles: roles,
      forced: false,
      trickModeVideo: null,
      dependencyStream: null,
      type: '',
      accessibilityPurpose: null,
      external: false,
      groupId: null,
      fastSwitching: false,
      fullMimeTypes: new Set([shaka.util.MimeUtils.getFullType(
          mimeType, codecs.join(','))]),
      isAudioMuxedInVideo: false,
      baseOriginalId: null,
      isIframe: false,
      preselection: null,
    };
  }
});

