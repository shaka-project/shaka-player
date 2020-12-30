/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.require('shaka.test.FakeDrmEngine');
goog.require('shaka.test.ManifestGenerator');
goog.require('shaka.util.StreamUtils');

describe('StreamUtils', () => {
  const StreamUtils = shaka.util.StreamUtils;

  let manifest;

  describe('filterStreamsByLanguageAndRole', () => {
    it('chooses text streams in user\'s preferred language', () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addTextStream(1, (stream) => {
          stream.language = 'en';
        });
        manifest.addTextStream(2, (stream) => {
          stream.language = 'es';
        });
        manifest.addTextStream(3, (stream) => {
          stream.language = 'en';
        });
      });

      const chosen = StreamUtils.filterStreamsByLanguageAndRole(
          manifest.textStreams,
          'en',
          '',
          false);
      expect(chosen.length).toBe(2);
      expect(chosen[0]).toBe(manifest.textStreams[0]);
      expect(chosen[1]).toBe(manifest.textStreams[2]);
    });

    it('chooses text streams in user\'s preferred forced language', () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addTextStream(1, (stream) => {
          stream.language = 'en';
        });
        manifest.addTextStream(2, (stream) => {
          stream.language = 'es';
        });
        manifest.addTextStream(3, (stream) => {
          stream.language = 'en';
          stream.forced = true;
        });
      });

      const chosen = StreamUtils.filterStreamsByLanguageAndRole(
          manifest.textStreams,
          'en',
          '',
          true);
      expect(chosen.length).toBe(1);
      expect(chosen[0]).toBe(manifest.textStreams[2]);
    });

    it('no chooses text streams if there are not forced language', () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addTextStream(1, (stream) => {
          stream.language = 'en';
        });
        manifest.addTextStream(2, (stream) => {
          stream.language = 'es';
        });
      });

      const chosen = StreamUtils.filterStreamsByLanguageAndRole(
          manifest.textStreams,
          'es',
          '',
          true);
      expect(chosen.length).toBe(0);
    });

    it('chooses primary text streams', () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addTextStream(1);
        manifest.addTextStream(2, (stream) => {
          stream.primary = true;
        });
        manifest.addTextStream(3, (stream) => {
          stream.primary = true;
        });
      });

      const chosen = StreamUtils.filterStreamsByLanguageAndRole(
          manifest.textStreams,
          'en',
          '',
          false);
      expect(chosen.length).toBe(2);
      expect(chosen[0]).toBe(manifest.textStreams[1]);
      expect(chosen[1]).toBe(manifest.textStreams[2]);
    });

    it('chooses text streams in preferred language and role', () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addTextStream(1, (stream) => {
          stream.language = 'en';
          stream.roles = ['main', 'commentary'];
        });
        manifest.addTextStream(2, (stream) => {
          stream.language = 'es';
        });
        manifest.addTextStream(3, (stream) => {
          stream.language = 'en';
          stream.roles = ['caption'];
        });
      });

      const chosen = StreamUtils.filterStreamsByLanguageAndRole(
          manifest.textStreams,
          'en',
          'main',
          false);
      expect(chosen.length).toBe(1);
      expect(chosen[0]).toBe(manifest.textStreams[0]);
    });

    it('prefers no-role streams if there is no preferred role', () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addTextStream(0, (stream) => {
          stream.language = 'en';
          stream.roles = ['commentary'];
        });
        manifest.addTextStream(1, (stream) => {
          stream.language = 'en';
        });
        manifest.addTextStream(2, (stream) => {
          stream.language = 'en';
          stream.roles = ['secondary'];
        });
      });

      const chosen = StreamUtils.filterStreamsByLanguageAndRole(
          manifest.textStreams,
          'en',
          '',
          false);
      expect(chosen.length).toBe(1);
      expect(chosen[0].roles.length).toBe(0); // Pick a stream with no role.
    });

    it('ignores no-role streams if there is a preferred role', () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addTextStream(0, (stream) => {
          stream.language = 'en';
          stream.roles = ['commentary'];
        });
        manifest.addTextStream(1, (stream) => {
          stream.language = 'en';
        });
        manifest.addTextStream(2, (stream) => {
          stream.language = 'en';
          stream.roles = ['secondary'];
        });
      });

      const chosen = StreamUtils.filterStreamsByLanguageAndRole(
          manifest.textStreams,
          'en',
          'main', false); // A role that is not present.
      expect(chosen.length).toBe(1);
      expect(chosen[0].roles.length).toBe(1); // Pick a stream with a role.
    });

    it('chooses only one role, even if none is preferred', () => {
      // Regression test for https://github.com/google/shaka-player/issues/949
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addTextStream(0, (stream) => {
          stream.language = 'en';
          stream.roles = ['commentary'];
        });
        manifest.addTextStream(1, (stream) => {
          stream.language = 'en';
          stream.roles = ['commentary'];
        });
        manifest.addTextStream(2, (stream) => {
          stream.language = 'en';
          stream.roles = ['secondary'];
        });
        manifest.addTextStream(3, (stream) => {
          stream.language = 'en';
          stream.roles = ['secondary'];
        });
        manifest.addTextStream(4, (stream) => {
          stream.language = 'en';
          stream.roles = ['main'];
        });
        manifest.addTextStream(5, (stream) => {
          stream.language = 'en';
          stream.roles = ['main'];
        });
      });

      const chosen = StreamUtils.filterStreamsByLanguageAndRole(
          manifest.textStreams,
          'en',
          '', false);
      // Which role is chosen is an implementation detail.
      // Each role is found on two text streams, so we should have two.
      expect(chosen.length).toBe(2);
      expect(chosen[0].roles[0]).toBe(chosen[1].roles[0]);
    });

    it('chooses only one role, even if all are primary', () => {
      // Regression test for https://github.com/google/shaka-player/issues/949
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addTextStream(0, (stream) => {
          stream.language = 'en';
          stream.primary = true;
          stream.roles = ['commentary'];
        });
        manifest.addTextStream(1, (stream) => {
          stream.language = 'en';
          stream.primary = true;
          stream.roles = ['commentary'];
        });
        manifest.addTextStream(2, (stream) => {
          stream.language = 'en';
          stream.primary = true;
          stream.roles = ['secondary'];
        });
        manifest.addTextStream(3, (stream) => {
          stream.language = 'en';
          stream.primary = true;
          stream.roles = ['secondary'];
        });
        manifest.addTextStream(4, (stream) => {
          stream.language = 'en';
          stream.primary = true;
          stream.roles = ['main'];
        });
        manifest.addTextStream(5, (stream) => {
          stream.language = 'en';
          stream.primary = true;
          stream.roles = ['main'];
        });
      });

      const chosen = StreamUtils.filterStreamsByLanguageAndRole(
          manifest.textStreams,
          'zh',
          '',
          false);
      // Which role is chosen is an implementation detail.
      // Each role is found on two text streams, so we should have two.
      expect(chosen.length).toBe(2);
      expect(chosen[0].roles[0]).toBe(chosen[1].roles[0]);
    });

    it('chooses only one language, even if all are primary', () => {
      // Regression test for https://github.com/google/shaka-player/issues/918
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addTextStream(0, (stream) => {
          stream.language = 'en';
          stream.primary = true;
        });
        manifest.addTextStream(1, (stream) => {
          stream.language = 'en';
          stream.primary = true;
        });
        manifest.addTextStream(2, (stream) => {
          stream.language = 'es';
          stream.primary = true;
        });
        manifest.addTextStream(3, (stream) => {
          stream.language = 'es';
          stream.primary = true;
        });
      });

      const chosen = StreamUtils.filterStreamsByLanguageAndRole(
          manifest.textStreams,
          'zh',
          '',
          false);
      // Which language is chosen is an implementation detail.
      // Each role is found on two variants, so we should have two.
      expect(chosen.length).toBe(2);
      expect(chosen[0].language).toBe(chosen[1].language);
    });

    it('chooses a role from among primary streams without language match',
        () => {
          manifest = shaka.test.ManifestGenerator.generate((manifest) => {
            manifest.addTextStream(0, (stream) => {
              stream.language = 'en';
              stream.primary = true;
              stream.roles = ['commentary'];
            });
            manifest.addTextStream(1, (stream) => {
              stream.language = 'en';
              stream.primary = true;
              stream.roles = ['commentary'];
            });
            manifest.addTextStream(2, (stream) => {
              stream.language = 'en';
              stream.roles = ['secondary'];
            });
            manifest.addTextStream(3, (stream) => {
              stream.language = 'en';
              stream.roles = ['secondary'];
            });
            manifest.addTextStream(4, (stream) => {
              stream.language = 'en';
              stream.primary = true;
              stream.roles = ['main'];
            });
            manifest.addTextStream(5, (stream) => {
              stream.language = 'en';
              stream.primary = true;
              stream.roles = ['main'];
            });
          });

          const chosen = StreamUtils.filterStreamsByLanguageAndRole(
              manifest.textStreams,
              'zh',
              '',
              false);
          // Which role is chosen is an implementation detail.
          // Each role is found on two text streams, so we should have two.
          expect(chosen.length).toBe(2);
          expect(chosen[0].roles[0]).toBe(chosen[1].roles[0]);

          // Since nothing matches our language preference, we chose primary
          // text streams.
          expect(chosen[0].primary).toBe(true);
          expect(chosen[1].primary).toBe(true);
        });

    it('chooses a role from best language match, in spite of primary',
        () => {
          manifest = shaka.test.ManifestGenerator.generate((manifest) => {
            manifest.addTextStream(0, (stream) => {
              stream.language = 'en';
              stream.primary = true;
              stream.roles = ['commentary'];
            });
            manifest.addTextStream(1, (stream) => {
              stream.language = 'en';
              stream.primary = true;
              stream.roles = ['commentary'];
            });
            manifest.addTextStream(2, (stream) => {
              stream.language = 'zh';
              stream.roles = ['secondary'];
            });
            manifest.addTextStream(3, (stream) => {
              stream.language = 'zh';
              stream.roles = ['secondary'];
            });
            manifest.addTextStream(4, (stream) => {
              stream.language = 'en';
              stream.primary = true;
              stream.roles = ['main'];
            });
            manifest.addTextStream(5, (stream) => {
              stream.language = 'en';
              stream.primary = true;
              stream.roles = ['main'];
            });
          });

          const chosen = StreamUtils.filterStreamsByLanguageAndRole(
              manifest.textStreams,
              'zh',
              '',
              false);
          expect(chosen.length).toBe(2);
          expect(chosen[0].language).toBe('zh');
          expect(chosen[1].language).toBe('zh');
          expect(chosen[0].primary).toBe(false);
          expect(chosen[1].primary).toBe(false);
        });
  });

  describe('filterVariantsByAudioChannelCount', () => {
    it('chooses variants with preferred audio channels count', () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(0, (variant) => {
          variant.addAudio(0, (stream) => {
            stream.channelsCount = 2;
          });
        });
        manifest.addVariant(1, (variant) => {
          variant.addAudio(1, (stream) => {
            stream.channelsCount = 6;
          });
        });
        manifest.addVariant(2, (variant) => {
          variant.addAudio(2, (stream) => {
            stream.channelsCount = 2;
          });
        });
      });

      const chosen = StreamUtils.filterVariantsByAudioChannelCount(
          manifest.variants, 2);
      expect(chosen.length).toBe(2);
      expect(chosen[0]).toBe(manifest.variants[0]);
      expect(chosen[1]).toBe(manifest.variants[2]);
    });

    it('chooses variants with largest audio channel count less than config' +
        ' when no exact audio channel count match is possible', () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(0, (variant) => {
          variant.addAudio(0, (stream) => {
            stream.channelsCount = 2;
          });
        });
        manifest.addVariant(1, (variant) => {
          variant.addAudio(1, (stream) => {
            stream.channelsCount = 8;
          });
        });
        manifest.addVariant(2, (variant) => {
          variant.addAudio(2, (stream) => {
            stream.channelsCount = 2;
          });
        });
      });

      const chosen = StreamUtils.filterVariantsByAudioChannelCount(
          manifest.variants, 6);
      expect(chosen.length).toBe(2);
      expect(chosen[0]).toBe(manifest.variants[0]);
      expect(chosen[1]).toBe(manifest.variants[2]);
    });

    it('chooses variants with fewest audio channels when none fit in the ' +
        'config', () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(0, (variant) => {
          variant.addAudio(0, (stream) => {
            stream.channelsCount = 6;
          });
        });
        manifest.addVariant(1, (variant) => {
          variant.addAudio(1, (stream) => {
            stream.channelsCount = 8;
          });
        });
        manifest.addVariant(2, (variant) => {
          variant.addAudio(2, (stream) => {
            stream.channelsCount = 6;
          });
        });
      });

      const chosen = StreamUtils.filterVariantsByAudioChannelCount(
          manifest.variants, 2);
      expect(chosen.length).toBe(2);
      expect(chosen[0]).toBe(manifest.variants[0]);
      expect(chosen[1]).toBe(manifest.variants[2]);
    });
  });

  describe('filterManifest', () => {
    let fakeDrmEngine;

    beforeAll(() => {
      fakeDrmEngine = new shaka.test.FakeDrmEngine();
    });

    it('filters text streams with the full MIME type', async () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addTextStream(1, (stream) => {
          stream.mimeType = 'text/vtt';
        });
        manifest.addTextStream(2, (stream) => {
          stream.mime('application/mp4', 'wvtt');
        });
        manifest.addTextStream(3, (stream) => {
          stream.mimeType = 'text/bogus';
        });
        manifest.addTextStream(4, (stream) => {
          stream.mime('application/mp4', 'bogus');
        });
      });

      const noVariant = null;
      await shaka.util.StreamUtils.filterManifest(
          fakeDrmEngine, noVariant, manifest);

      // Covers a regression in which we would remove streams with codecs.
      // The last two streams should be removed because their full MIME types
      // are bogus.
      expect(manifest.textStreams.length).toBe(2);
      expect(manifest.textStreams[0].id).toBe(1);
      expect(manifest.textStreams[1].id).toBe(2);
    });
  });

  describe('filterVariantsByHeight_', () => {
    const avc1Variant1080 = /** @type {shaka.extern.Variant} */(
      /** @type {?} */({
        bandwidth: 5058558,
        audio: {
          bandwidth: 129998,
          codecs: 'mp4a.40.2',
        },
        video: {
          bandwidth: 4928560,
          codecs: 'avc1.640028',
          height: 1080,
          width: 1920,
        },
      })
    );

    const vp9Variant1080 = /** @type {shaka.extern.Variant} */(
      /** @type {?} */({
        bandwidth: 4911000,
        audio: {
          bandwidth: 129998,
          codecs: 'mp4a.40.2',
        },
        video: {
          bandwidth: 4781002,
          codecs: 'vp09.00.40.08.00.02.02.02.00',
          height: 1080,
          width: 1920,
        },
      })
    );

    const vp9Variant2160 = /** @type {shaka.extern.Variant} */(
      /** @type {?} */({
        bandwidth: 10850316,
        audio: {
          bandwidth: 65992,
          codecs: 'mp4a.40.2',
        },
        video: {
          bandwidth: 10784324,
          codecs: 'vp09.00.50.08.00.02.02.02.00',
          height: 2160,
          width: 3840,
        },
      })
    );

    it('filters variants by height', () => {
      const variantsByCodecs = StreamUtils.getVariantsByCodecs_([
        avc1Variant1080,
        vp9Variant1080,
        vp9Variant2160,
      ]);

      const actual = StreamUtils.filterVariantsByHeight_(
          variantsByCodecs
      ).getAll();

      const expected = StreamUtils.getVariantsByCodecs_([
        avc1Variant1080,
        vp9Variant1080,
      ]).getAll();

      expect(actual).toEqual(expected);
    });

    describe('findBestCodecs_', () => {
      it('returns best codecs with same heights', () => {
        const variantsByCodecs = StreamUtils.getVariantsByCodecs_([
          avc1Variant1080,
          vp9Variant1080,
          vp9Variant2160,
        ]);

        const filteredVariantsByCodecs = StreamUtils.filterVariantsByHeight_(
            variantsByCodecs
        );

        const bestCodecs = StreamUtils.findBestCodecs_(
            filteredVariantsByCodecs
        );

        expect(bestCodecs).toBe('vp09-mp4a');
      });

      it('returns best codecs without same heights', () => {
        const variantsByCodecs = StreamUtils.getVariantsByCodecs_([
          avc1Variant1080,
          vp9Variant2160,
        ]);

        const filteredVariantsByCodecs = StreamUtils.filterVariantsByHeight_(
            variantsByCodecs
        );

        const bestCodecs = StreamUtils.findBestCodecs_(
            filteredVariantsByCodecs
        );

        expect(bestCodecs).toBe('avc1-mp4a');
      });
    });
  });

  describe('getGroupVariantCodecs_', () => {
    it('returns group of codecs', () => {
      const variant = /** @type {shaka.extern.Variant} */(
        /** @type {?} */({
          audio: {
            codecs: 'mp4a.40.2',
          },
          video: {
            codecs: 'avc1.640028',
          },
        })
      );

      expect(StreamUtils.getGroupVariantCodecs_(variant)).toBe('avc1-mp4a');
    });

    it('returns group of codecs without audio', () => {
      const variant = /** @type {shaka.extern.Variant} */(
        /** @type {?} */({
          audio: null,
          video: {
            codecs: 'avc1.640028',
          },
        })
      );

      expect(StreamUtils.getGroupVariantCodecs_(variant)).toBe('avc1-');
    });

    it('returns group of codecs without video', () => {
      const variant = /** @type {shaka.extern.Variant} */(
        /** @type {?} */({
          audio: {
            codecs: 'mp4a.40.2',
          },
          video: null,
        })
      );

      expect(StreamUtils.getGroupVariantCodecs_(variant)).toBe('-mp4a');
    });
  });
});
