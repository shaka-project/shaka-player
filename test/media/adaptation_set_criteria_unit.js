/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('AdaptationSetCriteria', () => {
  describe('preference based selection', () => {
    function variants(manifest) {
      return manifest.periods[0].variants;
    }

    it('chooses variants in user\'s preferred language', () => {
      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(1, (variant) => {
            variant.language = 'es';
          });
          period.addVariant(2, (variant) => {
            variant.language = 'en';
          });
          period.addVariant(3, (variant) => {
            variant.language = 'en';
          });
        });
      });

      const builder = new shaka.media.PreferenceBasedCriteria('en', '', 0);
      const set = builder.create(variants(manifest));

      checkSet(set, [
        manifest.periods[0].variants[1],
        manifest.periods[0].variants[2],
      ]);
    });

    it('prefers primary variants', () => {
      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(1, (variant) => {
            variant.primary = true;
          });
          period.addVariant(2);
          period.addVariant(3);
          period.addVariant(4, (variant) => {
            variant.primary = true;
          });
        });
      });

      const builder = new shaka.media.PreferenceBasedCriteria('en', '', 0);
      const set = builder.create(variants(manifest));

      checkSet(set, [
        manifest.periods[0].variants[0],
        manifest.periods[0].variants[3],
      ]);
    });

    it('chooses variants in preferred language and role', () => {
      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(1, (variant) => {
            variant.language = 'en';
            variant.addAudio(10, (stream) => {
              stream.roles = ['main', 'commentary'];
            });
          });
          period.addVariant(2, (variant) => {
            variant.language = 'en';
            variant.addAudio(20, (stream) => {
              stream.roles = ['secondary'];
            });
          });
          period.addVariant(3, (variant) => {
            variant.language = 'es';
            variant.addAudio(30, (stream) => {
              stream.roles = ['main'];
            });
          });
        });
      });

      const builder = new shaka.media.PreferenceBasedCriteria('en', 'main', 0);
      const set = builder.create(variants(manifest));

      checkSet(set, [
        manifest.periods[0].variants[0],
      ]);
    });

    it('chooses only one role, even if none is preferred', () => {
      // Regression test for https://github.com/google/shaka-player/issues/949
      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(1, (variant) => {
            variant.language = 'en';
            variant.addAudio(10, (stream) => {
              stream.roles = ['commentary'];
            });
          });
          period.addVariant(2, (variant) => {
            variant.language = 'en';
            variant.addAudio(20, (stream) => {
              stream.roles = ['commentary'];
            });
          });
          period.addVariant(3, (variant) => {
            variant.language = 'en';
            variant.addAudio(30, (stream) => {
              stream.roles = ['secondary'];
            });
          });
          period.addVariant(4, (variant) => {
            variant.language = 'en';
            variant.addAudio(40, (stream) => {
              stream.roles = ['secondary'];
            });
          });
          period.addVariant(5, (variant) => {
            variant.language = 'en';
            variant.addAudio(50, (stream) => {
              stream.roles = ['main'];
            });
          });
          period.addVariant(6, (variant) => {
            variant.language = 'en';
            variant.addAudio(60, (stream) => {
              stream.roles = ['main'];
            });
          });
        });
      });

      const builder = new shaka.media.PreferenceBasedCriteria('en', '', 0);
      const set = builder.create(variants(manifest));

      // Which role is chosen is an implementation detail.
      // Each role is found on two variants, so we should have two.
      checkSet(set, [
        manifest.periods[0].variants[0],
        manifest.periods[0].variants[1],
      ]);
    });

    it('chooses only one role, even if all are primary', () => {
      // Regression test for https://github.com/google/shaka-player/issues/949
      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(1, (variant) => {
            variant.language = 'en';
            variant.primary = true;
            variant.addAudio(10, (stream) => {
              stream.roles = ['commentary'];
            });
          });
          period.addVariant(2, (variant) => {
            variant.language = 'en';
            variant.primary = true;
            variant.addAudio(20, (stream) => {
              stream.roles = ['commentary'];
            });
          });
          period.addVariant(3, (variant) => {
            variant.language = 'en';
            variant.primary = true;
            variant.addAudio(30, (stream) => {
              stream.roles = ['secondary'];
            });
          });
          period.addVariant(4, (variant) => {
            variant.language = 'en';
            variant.primary = true;
            variant.addAudio(40, (stream) => {
              stream.roles = ['secondary'];
            });
          });
          period.addVariant(5, (variant) => {
            variant.language = 'en';
            variant.primary = true;
            variant.addAudio(50, (stream) => {
              stream.roles = ['main'];
            });
          });
          period.addVariant(6, (variant) => {
            variant.language = 'en';
            variant.primary = true;
            variant.addAudio(60, (stream) => {
              stream.roles = ['main'];
            });
          });
        });
      });

      const builder = new shaka.media.PreferenceBasedCriteria('zh', '', 0);
      const set = builder.create(variants(manifest));

      // Which role is chosen is an implementation detail.
      // Each role is found on two variants, so we should have two.
      checkSet(set, [
        manifest.periods[0].variants[0],
        manifest.periods[0].variants[1],
      ]);
    });

    it('chooses only one language, even if all are primary', () => {
      // Regression test for https://github.com/google/shaka-player/issues/918
      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(1, (variant) => {
            variant.language = 'en';
            variant.primary = true;
            variant.addAudio(10);
          });
          period.addVariant(2, (variant) => {
            variant.language = 'en';
            variant.primary = true;
            variant.addAudio(20);
          });
          period.addVariant(3, (variant) => {
            variant.language = 'es';
            variant.primary = true;
            variant.addAudio(30);
          });
          period.addVariant(4, (variant) => {
            variant.language = 'es';
            variant.primary = true;
            variant.addAudio(40);
          });
        });
      });

      const builder = new shaka.media.PreferenceBasedCriteria('zh', '', 0);
      const set = builder.create(variants(manifest));

      // Which language is chosen is an implementation detail.
      // Each role is found on two variants, so we should have two.
      checkSet(set, [
        manifest.periods[0].variants[0],
        manifest.periods[0].variants[1],
      ]);
    });

    it('chooses a role from among primary variants without language match',
        () => {
          const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
            manifest.addPeriod(0, (period) => {
              period.addVariant(1, (variant) => {
                variant.language = 'en';
                variant.primary = true;
                variant.addAudio(10, (stream) => {
                  stream.roles = ['commentary'];
                });
              });
              period.addVariant(2, (variant) => {
                variant.language = 'en';
                variant.primary = true;
                variant.addAudio(20, (stream) => {
                  stream.roles = ['commentary'];
                });
              });
              period.addVariant(3, (variant) => {
                variant.language = 'en';
                variant.addAudio(30, (stream) => {
                  stream.roles = ['secondary'];
                });
              });
              period.addVariant(4, (variant) => {
                variant.language = 'en';
                variant.addAudio(40, (stream) => {
                  stream.roles = ['secondary'];
                });
              });
              period.addVariant(5, (variant) => {
                variant.language = 'en';
                variant.primary = true;
                variant.addAudio(50, (stream) => {
                  stream.roles = ['main'];
                });
              });
              period.addVariant(6, (variant) => {
                variant.language = 'en';
                variant.primary = true;
                variant.addAudio(60, (stream) => {
                  stream.roles = ['main'];
                });
              });
            });
          });

          const builder = new shaka.media.PreferenceBasedCriteria('zh', '', 0);
          const set = builder.create(variants(manifest));

          // Which role is chosen is an implementation detail. Each role is
          // found on two variants, so we should have two. Since nothing matches
          // our language preference, we chose primary variants.
          checkSet(set, [
            manifest.periods[0].variants[0],
            manifest.periods[0].variants[1],
          ]);
        });

    it('chooses a role from best language match, in spite of primary',
        () => {
          const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
            manifest.addPeriod(0, (period) => {
              period.addVariant(1, (variant) => {
                variant.language = 'en';
                variant.primary = true;
                variant.addAudio(10, (stream) => {
                  stream.roles = ['commentary'];
                });
              });
              period.addVariant(2, (variant) => {
                variant.language = 'en';
                variant.primary = true;
                variant.addAudio(20, (stream) => {
                  stream.roles = ['commentary'];
                });
              });
              period.addVariant(3, (variant) => {
                variant.language = 'zh';
                variant.addAudio(30, (stream) => {
                  stream.roles = ['secondary'];
                });
              });
              period.addVariant(4, (variant) => {
                variant.language = 'zh';
                variant.addAudio(40, (stream) => {
                  stream.roles = ['secondary'];
                });
              });
              period.addVariant(5, (variant) => {
                variant.language = 'en';
                variant.primary = true;
                variant.addAudio(50, (stream) => {
                  stream.roles = ['main'];
                });
              });
              period.addVariant(6, (variant) => {
                variant.language = 'en';
                variant.primary = true;
                variant.addAudio(60, (stream) => {
                  stream.roles = ['main'];
                });
              });
            });
          });

          const builder = new shaka.media.PreferenceBasedCriteria('zh', '', 0);
          const set = builder.create(variants(manifest));

          checkSet(set, [
            manifest.periods[0].variants[2],
            manifest.periods[0].variants[3],
          ]);
        });

    it('chooses variants with preferred audio channels count', () => {
      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(1, (variant) => {
            variant.addAudio(10, (stream) => {
              stream.channelsCount = 2;
            });
          });
          period.addVariant(2, (variant) => {
            variant.addAudio(20, (stream) => {
              stream.channelsCount = 6;
            });
          });
          period.addVariant(3, (variant) => {
            variant.addAudio(30, (stream) => {
              stream.channelsCount = 2;
            });
          });
        });
      });

      const builder = new shaka.media.PreferenceBasedCriteria('', '', 2);
      const set = builder.create(variants(manifest));

      checkSet(set, [
        manifest.periods[0].variants[0],
        manifest.periods[0].variants[2],
      ]);
    });

    it('chooses variants with largest audio channel count less than config' +
        ' when no exact audio channel count match is possible', () => {
      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(1, (variant) => {
            variant.addAudio(10, (stream) => {
              stream.channelsCount = 2;
            });
          });
          period.addVariant(2, (variant) => {
            variant.addAudio(20, (stream) => {
              stream.channelsCount = 8;
            });
          });
          period.addVariant(3, (variant) => {
            variant.addAudio(30, (stream) => {
              stream.channelsCount = 2;
            });
          });
        });
      });

      const builder = new shaka.media.PreferenceBasedCriteria('', '', 6);
      const set = builder.create(variants(manifest));

      checkSet(set, [
        manifest.periods[0].variants[0],
        manifest.periods[0].variants[2],
      ]);
    });

    it('chooses variants with fewest audio channels when none fit in the ' +
        'config', () => {
      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(1, (variant) => {
            variant.addAudio(10, (stream) => {
              stream.channelsCount = 6;
            });
          });
          period.addVariant(2, (variant) => {
            variant.addAudio(20, (stream) => {
              stream.channelsCount = 8;
            });
          });
          period.addVariant(3, (variant) => {
            variant.addAudio(30, (stream) => {
              stream.channelsCount = 6;
            });
          });
        });
      });

      const builder = new shaka.media.PreferenceBasedCriteria('', '', 2);
      const set = builder.create(variants(manifest));

      checkSet(set, [
        manifest.periods[0].variants[0],
        manifest.periods[0].variants[2],
      ]);
    });

    it('chooses variants with preferred label', () => {
      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(1, (variant) => {
            variant.addAudio(10, (stream) => {
              stream.label = 'preferredLabel';
            });
          });
          period.addVariant(2, (variant) => {
            variant.addAudio(20, (stream) => {
              stream.label = 'otherLabel';
            });
          });
          period.addVariant(3, (variant) => {
            variant.addAudio(30, (stream) => {
              stream.label = 'preferredLabel';
            });
          });
        });
      });

      const builder =
          new shaka.media.PreferenceBasedCriteria('', '', 0, 'preferredLabel');
      const set = builder.create(variants(manifest));

      checkSet(set, [
        manifest.periods[0].variants[0],
        manifest.periods[0].variants[2],
      ]);
    });

    it('chooses variants with preferred label and language', () => {
      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          // Preferred language and label
          period.addVariant(1, (variant) => {
            variant.language = 'zh';
            variant.addAudio(10, (stream) => {
              stream.label = 'preferredLabel';
            });
          });
          // Same language, a different label
          period.addVariant(2, (variant) => {
            variant.language = 'zh';
            variant.addAudio(20, (stream) => {
              stream.label = 'otherLabel';
            });
          });
          // Same language and label
          period.addVariant(3, (variant) => {
            variant.language = 'zh';
            variant.addAudio(30, (stream) => {
              stream.label = 'preferredLabel';
            });
          });
          // Same label different language
          period.addVariant(4, (variant) => {
            variant.language = 'pt';
            variant.addAudio(40, (stream) => {
              stream.label = 'preferredLabel';
            });
          });
        });
      });

      const builder = new shaka.media.PreferenceBasedCriteria(
          'zh', '', 0, 'preferredLabel');
      const set = builder.create(variants(manifest));

      checkSet(set, [
        manifest.periods[0].variants[0],
        manifest.periods[0].variants[2],
      ]);
    });
  });

  /**
   * @param {!shaka.media.AdaptationSet} set
   * @param {!Array<T>} array
   * @template T
   */
  function checkSet(set, array) {
    expect(Array.from(set.values())).toEqual(array);
  }
});
