/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('StreamUtils', () => {
  const filterStreamsByLanguageAndRole =
      shaka.util.StreamUtils.filterStreamsByLanguageAndRole;
  const filterVariantsByAudioChannelCount =
      shaka.util.StreamUtils.filterVariantsByAudioChannelCount;

  let manifest;

  describe('filterStreamsByLanguageAndRole', () => {
    it('chooses text streams in user\'s preferred language', () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addTextStream(1, (stream) => {
            stream.language = 'en';
          });
          period.addTextStream(2, (stream) => {
            stream.language = 'es';
          });
          period.addTextStream(3, (stream) => {
            stream.language = 'en';
          });
        });
      });

      const chosen = filterStreamsByLanguageAndRole(
          manifest.periods[0].textStreams,
          'en',
          '');
      expect(chosen.length).toBe(2);
      expect(chosen[0]).toBe(manifest.periods[0].textStreams[0]);
      expect(chosen[1]).toBe(manifest.periods[0].textStreams[2]);
    });

    it('chooses primary text streams', () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addTextStream(1);
          period.addTextStream(2, (stream) => {
            stream.primary = true;
          });
          period.addTextStream(3, (stream) => {
            stream.primary = true;
          });
        });
      });

      const chosen = filterStreamsByLanguageAndRole(
          manifest.periods[0].textStreams,
          'en',
          '');
      expect(chosen.length).toBe(2);
      expect(chosen[0]).toBe(manifest.periods[0].textStreams[1]);
      expect(chosen[1]).toBe(manifest.periods[0].textStreams[2]);
    });

    it('chooses text streams in preferred language and role', () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addTextStream(1, (stream) => {
            stream.language = 'en';
            stream.roles = ['main', 'commentary'];
          });
          period.addTextStream(2, (stream) => {
            stream.language = 'es';
          });
          period.addTextStream(3, (stream) => {
            stream.language = 'en';
            stream.roles = ['caption'];
          });
        });
      });

      const chosen = filterStreamsByLanguageAndRole(
          manifest.periods[0].textStreams,
          'en',
          'main');
      expect(chosen.length).toBe(1);
      expect(chosen[0]).toBe(manifest.periods[0].textStreams[0]);
    });

    it('prefers no-role streams if there is no preferred role', () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addTextStream(0, (stream) => {
            stream.language = 'en';
            stream.roles = ['commentary'];
          });
          period.addTextStream(1, (stream) => {
            stream.language = 'en';
          });
          period.addTextStream(2, (stream) => {
            stream.language = 'en';
            stream.roles = ['secondary'];
          });
        });
      });

      const chosen = filterStreamsByLanguageAndRole(
          manifest.periods[0].textStreams,
          'en',
          '');
      expect(chosen.length).toBe(1);
      expect(chosen[0].roles.length).toBe(0); // Pick a stream with no role.
    });

    it('ignores no-role streams if there is a preferred role', () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addTextStream(0, (stream) => {
            stream.language = 'en';
            stream.roles = ['commentary'];
          });
          period.addTextStream(1, (stream) => {
            stream.language = 'en';
          });
          period.addTextStream(2, (stream) => {
            stream.language = 'en';
            stream.roles = ['secondary'];
          });
        });
      });

      const chosen = filterStreamsByLanguageAndRole(
          manifest.periods[0].textStreams,
          'en',
          'main'); // A role that is not present.
      expect(chosen.length).toBe(1);
      expect(chosen[0].roles.length).toBe(1); // Pick a stream with a role.
    });

    it('chooses only one role, even if none is preferred', () => {
      // Regression test for https://github.com/google/shaka-player/issues/949
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addTextStream(0, (stream) => {
            stream.language = 'en';
            stream.roles = ['commentary'];
          });
          period.addTextStream(1, (stream) => {
            stream.language = 'en';
            stream.roles = ['commentary'];
          });
          period.addTextStream(2, (stream) => {
            stream.language = 'en';
            stream.roles = ['secondary'];
          });
          period.addTextStream(3, (stream) => {
            stream.language = 'en';
            stream.roles = ['secondary'];
          });
          period.addTextStream(4, (stream) => {
            stream.language = 'en';
            stream.roles = ['main'];
          });
          period.addTextStream(5, (stream) => {
            stream.language = 'en';
            stream.roles = ['main'];
          });
        });
      });

      const chosen = filterStreamsByLanguageAndRole(
          manifest.periods[0].textStreams,
          'en',
          '');
      // Which role is chosen is an implementation detail.
      // Each role is found on two text streams, so we should have two.
      expect(chosen.length).toBe(2);
      expect(chosen[0].roles[0]).toBe(chosen[1].roles[0]);
    });

    it('chooses only one role, even if all are primary', () => {
      // Regression test for https://github.com/google/shaka-player/issues/949
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addTextStream(0, (stream) => {
            stream.language = 'en';
            stream.primary = true;
            stream.roles = ['commentary'];
          });
          period.addTextStream(1, (stream) => {
            stream.language = 'en';
            stream.primary = true;
            stream.roles = ['commentary'];
          });
          period.addTextStream(2, (stream) => {
            stream.language = 'en';
            stream.primary = true;
            stream.roles = ['secondary'];
          });
          period.addTextStream(3, (stream) => {
            stream.language = 'en';
            stream.primary = true;
            stream.roles = ['secondary'];
          });
          period.addTextStream(4, (stream) => {
            stream.language = 'en';
            stream.primary = true;
            stream.roles = ['main'];
          });
          period.addTextStream(5, (stream) => {
            stream.language = 'en';
            stream.primary = true;
            stream.roles = ['main'];
          });
        });
      });

      const chosen = filterStreamsByLanguageAndRole(
          manifest.periods[0].textStreams,
          'zh',
          '');
      // Which role is chosen is an implementation detail.
      // Each role is found on two text streams, so we should have two.
      expect(chosen.length).toBe(2);
      expect(chosen[0].roles[0]).toBe(chosen[1].roles[0]);
    });

    it('chooses only one language, even if all are primary', () => {
      // Regression test for https://github.com/google/shaka-player/issues/918
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addTextStream(0, (stream) => {
            stream.language = 'en';
            stream.primary = true;
          });
          period.addTextStream(1, (stream) => {
            stream.language = 'en';
            stream.primary = true;
          });
          period.addTextStream(2, (stream) => {
            stream.language = 'es';
            stream.primary = true;
          });
          period.addTextStream(3, (stream) => {
            stream.language = 'es';
            stream.primary = true;
          });
        });
      });

      const chosen = filterStreamsByLanguageAndRole(
          manifest.periods[0].textStreams,
          'zh',
          '');
      // Which language is chosen is an implementation detail.
      // Each role is found on two variants, so we should have two.
      expect(chosen.length).toBe(2);
      expect(chosen[0].language).toBe(chosen[1].language);
    });

    it('chooses a role from among primary streams without language match',
        () => {
          manifest = shaka.test.ManifestGenerator.generate((manifest) => {
            manifest.addPeriod(0, (period) => {
              period.addTextStream(0, (stream) => {
                stream.language = 'en';
                stream.primary = true;
                stream.roles = ['commentary'];
              });
              period.addTextStream(1, (stream) => {
                stream.language = 'en';
                stream.primary = true;
                stream.roles = ['commentary'];
              });
              period.addTextStream(2, (stream) => {
                stream.language = 'en';
                stream.roles = ['secondary'];
              });
              period.addTextStream(3, (stream) => {
                stream.language = 'en';
                stream.roles = ['secondary'];
              });
              period.addTextStream(4, (stream) => {
                stream.language = 'en';
                stream.primary = true;
                stream.roles = ['main'];
              });
              period.addTextStream(5, (stream) => {
                stream.language = 'en';
                stream.primary = true;
                stream.roles = ['main'];
              });
            });
          });

          const chosen = filterStreamsByLanguageAndRole(
              manifest.periods[0].textStreams,
              'zh',
              '');
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
            manifest.addPeriod(0, (period) => {
              period.addTextStream(0, (stream) => {
                stream.language = 'en';
                stream.primary = true;
                stream.roles = ['commentary'];
              });
              period.addTextStream(1, (stream) => {
                stream.language = 'en';
                stream.primary = true;
                stream.roles = ['commentary'];
              });
              period.addTextStream(2, (stream) => {
                stream.language = 'zh';
                stream.roles = ['secondary'];
              });
              period.addTextStream(3, (stream) => {
                stream.language = 'zh';
                stream.roles = ['secondary'];
              });
              period.addTextStream(4, (stream) => {
                stream.language = 'en';
                stream.primary = true;
                stream.roles = ['main'];
              });
              period.addTextStream(5, (stream) => {
                stream.language = 'en';
                stream.primary = true;
                stream.roles = ['main'];
              });
            });
          });

          const chosen = filterStreamsByLanguageAndRole(
              manifest.periods[0].textStreams,
              'zh',
              '');
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
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.addAudio(0, (stream) => {
              stream.channelsCount = 2;
            });
          });
          period.addVariant(1, (variant) => {
            variant.addAudio(1, (stream) => {
              stream.channelsCount = 6;
            });
          });
          period.addVariant(2, (variant) => {
            variant.addAudio(2, (stream) => {
              stream.channelsCount = 2;
            });
          });
        });
      });

      const chosen = filterVariantsByAudioChannelCount(
          manifest.periods[0].variants, 2);
      expect(chosen.length).toBe(2);
      expect(chosen[0]).toBe(manifest.periods[0].variants[0]);
      expect(chosen[1]).toBe(manifest.periods[0].variants[2]);
    });

    it('chooses variants with largest audio channel count less than config' +
        ' when no exact audio channel count match is possible', () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.addAudio(0, (stream) => {
              stream.channelsCount = 2;
            });
          });
          period.addVariant(1, (variant) => {
            variant.addAudio(1, (stream) => {
              stream.channelsCount = 8;
            });
          });
          period.addVariant(2, (variant) => {
            variant.addAudio(2, (stream) => {
              stream.channelsCount = 2;
            });
          });
        });
      });

      const chosen = filterVariantsByAudioChannelCount(
          manifest.periods[0].variants, 6);
      expect(chosen.length).toBe(2);
      expect(chosen[0]).toBe(manifest.periods[0].variants[0]);
      expect(chosen[1]).toBe(manifest.periods[0].variants[2]);
    });

    it('chooses variants with fewest audio channels when none fit in the ' +
        'config', () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.addAudio(0, (stream) => {
              stream.channelsCount = 6;
            });
          });
          period.addVariant(1, (variant) => {
            variant.addAudio(1, (stream) => {
              stream.channelsCount = 8;
            });
          });
          period.addVariant(2, (variant) => {
            variant.addAudio(2, (stream) => {
              stream.channelsCount = 6;
            });
          });
        });
      });

      const chosen = filterVariantsByAudioChannelCount(
          manifest.periods[0].variants, 2);
      expect(chosen.length).toBe(2);
      expect(chosen[0]).toBe(manifest.periods[0].variants[0]);
      expect(chosen[1]).toBe(manifest.periods[0].variants[2]);
    });
  });

  describe('filterNewPeriod', () => {
    let fakeDrmEngine;

    beforeAll(() => {
      fakeDrmEngine = new shaka.test.FakeDrmEngine();
    });

    it('filters text streams with the full MIME type', () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addTextStream(1, (stream) => {
            stream.mimeType = 'text/vtt';
          });
          period.addTextStream(2, (stream) => {
            stream.mime('application/mp4', 'wvtt');
          });
          period.addTextStream(3, (stream) => {
            stream.mimeType = 'text/bogus';
          });
          period.addTextStream(4, (stream) => {
            stream.mime('application/mp4', 'bogus');
          });
        });
      });

      const noAudio = null;
      const noVideo = null;
      shaka.util.StreamUtils.filterNewPeriod(
          fakeDrmEngine, noAudio, noVideo, manifest.periods[0]);

      // Covers a regression in which we would remove streams with codecs.
      // The last two streams should be removed because their full MIME types
      // are bogus.
      expect(manifest.periods[0].textStreams.length).toBe(2);
      const textStreams = manifest.periods[0].textStreams;
      expect(textStreams[0].id).toBe(1);
      expect(textStreams[1].id).toBe(2);
    });
  });
});
