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
    };
  }
});

