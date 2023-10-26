/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('AdaptationSetCriteria', () => {
  describe('preference based selection', () => {
    it('chooses variants in user\'s preferred language', () => {
      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(1, (variant) => {
          variant.language = 'es';
        });
        manifest.addVariant(2, (variant) => {
          variant.language = 'en';
        });
        manifest.addVariant(3, (variant) => {
          variant.language = 'en';
        });
      });

      const builder = new shaka.media.PreferenceBasedCriteria(
          /* language= */ 'en',
          /* role= */ '',
          /* channelCount= */ 0,
          /* hdrLevel= */ '',
          /* videoLayout= */ '');
      const set = builder.create(manifest.variants);

      checkSet(set, [
        manifest.variants[1],
        manifest.variants[2],
      ]);
    });

    it('prefers primary variants', () => {
      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(1, (variant) => {
          variant.primary = true;
        });
        manifest.addVariant(2);
        manifest.addVariant(3);
        manifest.addVariant(4, (variant) => {
          variant.primary = true;
        });
      });

      const builder = new shaka.media.PreferenceBasedCriteria(
          /* language= */ 'en',
          /* role= */ '',
          /* channelCount= */ 0,
          /* hdrLevel= */ '',
          /* videoLayout= */ '');
      const set = builder.create(manifest.variants);

      checkSet(set, [
        manifest.variants[0],
        manifest.variants[3],
      ]);
    });

    it('should not filter varaints when codec switching startegy is smooth '+
        'and changeType is supported', () => {
      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(1, (variant) => {
          variant.addAudio(10, (stream) => {
            stream.codecs = 'mp4a.69';
          });
          variant.addVideo(11, (stream) => {
            stream.codecs = 'avc1';
          });
        });
        manifest.addVariant(2, (variant) => {
          variant.addAudio(12, (stream) => {
            stream.codecs = 'mp4a.66';
          });
          variant.addVideo(13, (stream) => {
            stream.codecs = 'hvc1';
          });
        });
        manifest.addVariant(3, (variant) => {
          variant.addAudio(14, (stream) => {
            stream.codecs = 'mp4a.a6';
          });
          variant.addVideo(14, (stream) => {
            stream.codecs = 'dvh1';
          });
        });
      });

      const originalIsChangeTypeSupported = shaka.media.Capabilities
          .isChangeTypeSupported;

      try {
        shaka.media.Capabilities.isChangeTypeSupported = () => {
          return true;
        };

        const builder = new shaka.media.PreferenceBasedCriteria(
            /* language= */ 'en',
            /* role= */ '',
            /* channelCount= */ 0,
            /* hdrLevel= */ '',
            /* videoLayout= */ '',
            /* label= */ '',
            shaka.config.CodecSwitchingStrategy.SMOOTH);
        const set = builder.create(manifest.variants);

        expect(Array.from(set.values()).length).toBe(3);
      } finally {
        shaka.media.Capabilities
            .isChangeTypeSupported = originalIsChangeTypeSupported;
      }
    });

    it('should filter varaints when codec switching startegy'+
        'is not SMOOTH', () => {
      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(1, (variant) => {
          variant.addAudio(10, (stream) => {
            stream.codecs = 'mp4a.69';
          });
          variant.addVideo(11, (stream) => {
            stream.codecs = 'avc1';
          });
        });
        manifest.addVariant(2, (variant) => {
          variant.addAudio(12, (stream) => {
            stream.codecs = 'mp4a.66';
          });
          variant.addVideo(13, (stream) => {
            stream.codecs = 'hvc1';
          });
        });
        manifest.addVariant(3, (variant) => {
          variant.addAudio(14, (stream) => {
            stream.codecs = 'mp4a.a6';
          });
          variant.addVideo(14, (stream) => {
            stream.codecs = 'dvh1';
          });
        });
      });

      const builder = new shaka.media.PreferenceBasedCriteria(
          /* language= */ 'en',
          /* role= */ '',
          /* channelCount= */ 0,
          /* hdrLevel= */ '',
          /* videoLayout= */ '',
          /* label= */ '',
          shaka.config.CodecSwitchingStrategy.RELOAD);
      const set = builder.create(manifest.variants);

      expect(Array.from(set.values()).length).toBe(1);
    });

    it('chooses variants in preferred language and role', () => {
      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(1, (variant) => {
          variant.language = 'en';
          variant.addAudio(10, (stream) => {
            stream.roles = ['main', 'commentary'];
          });
        });
        manifest.addVariant(2, (variant) => {
          variant.language = 'en';
          variant.addAudio(20, (stream) => {
            stream.roles = ['secondary'];
          });
        });
        manifest.addVariant(3, (variant) => {
          variant.language = 'es';
          variant.addAudio(30, (stream) => {
            stream.roles = ['main'];
          });
        });
      });

      const builder = new shaka.media.PreferenceBasedCriteria(
          /* language= */ 'en',
          /* role= */ 'main',
          /* channelCount= */ 0,
          /* hdrLevel= */ '',
          /* videoLayout= */ '');
      const set = builder.create(manifest.variants);

      checkSet(set, [
        manifest.variants[0],
      ]);
    });

    it('chooses only one role, even if none is preferred', () => {
      // Regression test for https://github.com/shaka-project/shaka-player/issues/949
      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(1, (variant) => {
          variant.language = 'en';
          variant.addAudio(10, (stream) => {
            stream.roles = ['commentary'];
          });
        });
        manifest.addVariant(2, (variant) => {
          variant.language = 'en';
          variant.addAudio(20, (stream) => {
            stream.roles = ['commentary'];
          });
        });
        manifest.addVariant(3, (variant) => {
          variant.language = 'en';
          variant.addAudio(30, (stream) => {
            stream.roles = ['secondary'];
          });
        });
        manifest.addVariant(4, (variant) => {
          variant.language = 'en';
          variant.addAudio(40, (stream) => {
            stream.roles = ['secondary'];
          });
        });
        manifest.addVariant(5, (variant) => {
          variant.language = 'en';
          variant.addAudio(50, (stream) => {
            stream.roles = ['main'];
          });
        });
        manifest.addVariant(6, (variant) => {
          variant.language = 'en';
          variant.addAudio(60, (stream) => {
            stream.roles = ['main'];
          });
        });
      });

      const builder = new shaka.media.PreferenceBasedCriteria(
          /* language= */ 'en',
          /* role= */ '',
          /* channelCount= */ 0,
          /* hdrLevel= */ '',
          /* videoLayout= */ '');
      const set = builder.create(manifest.variants);

      // Which role is chosen is an implementation detail.
      // Each role is found on two variants, so we should have two.
      checkSet(set, [
        manifest.variants[0],
        manifest.variants[1],
      ]);
    });

    it('chooses only one role, even if all are primary', () => {
      // Regression test for https://github.com/shaka-project/shaka-player/issues/949
      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(1, (variant) => {
          variant.language = 'en';
          variant.primary = true;
          variant.addAudio(10, (stream) => {
            stream.roles = ['commentary'];
          });
        });
        manifest.addVariant(2, (variant) => {
          variant.language = 'en';
          variant.primary = true;
          variant.addAudio(20, (stream) => {
            stream.roles = ['commentary'];
          });
        });
        manifest.addVariant(3, (variant) => {
          variant.language = 'en';
          variant.primary = true;
          variant.addAudio(30, (stream) => {
            stream.roles = ['secondary'];
          });
        });
        manifest.addVariant(4, (variant) => {
          variant.language = 'en';
          variant.primary = true;
          variant.addAudio(40, (stream) => {
            stream.roles = ['secondary'];
          });
        });
        manifest.addVariant(5, (variant) => {
          variant.language = 'en';
          variant.primary = true;
          variant.addAudio(50, (stream) => {
            stream.roles = ['main'];
          });
        });
        manifest.addVariant(6, (variant) => {
          variant.language = 'en';
          variant.primary = true;
          variant.addAudio(60, (stream) => {
            stream.roles = ['main'];
          });
        });
      });

      const builder = new shaka.media.PreferenceBasedCriteria(
          /* language= */ 'zh',
          /* role= */ '',
          /* channelCount= */ 0,
          /* hdrLevel= */ '',
          /* videoLayout= */ '');
      const set = builder.create(manifest.variants);

      // Which role is chosen is an implementation detail.
      // Each role is found on two variants, so we should have two.
      checkSet(set, [
        manifest.variants[0],
        manifest.variants[1],
      ]);
    });

    it('chooses only one language, even if all are primary', () => {
      // Regression test for https://github.com/shaka-project/shaka-player/issues/918
      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(1, (variant) => {
          variant.language = 'en';
          variant.primary = true;
          variant.addAudio(10);
        });
        manifest.addVariant(2, (variant) => {
          variant.language = 'en';
          variant.primary = true;
          variant.addAudio(20);
        });
        manifest.addVariant(3, (variant) => {
          variant.language = 'es';
          variant.primary = true;
          variant.addAudio(30);
        });
        manifest.addVariant(4, (variant) => {
          variant.language = 'es';
          variant.primary = true;
          variant.addAudio(40);
        });
      });

      const builder = new shaka.media.PreferenceBasedCriteria(
          /* language= */ 'zh',
          /* role= */ '',
          /* channelCount= */ 0,
          /* hdrLevel= */ '',
          /* videoLayout= */ '');
      const set = builder.create(manifest.variants);

      // Which language is chosen is an implementation detail.
      // Each role is found on two variants, so we should have two.
      checkSet(set, [
        manifest.variants[0],
        manifest.variants[1],
      ]);
    });

    it('chooses a role from among primary variants without language match',
        () => {
          const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
            manifest.addVariant(1, (variant) => {
              variant.language = 'en';
              variant.primary = true;
              variant.addAudio(10, (stream) => {
                stream.roles = ['commentary'];
              });
            });
            manifest.addVariant(2, (variant) => {
              variant.language = 'en';
              variant.primary = true;
              variant.addAudio(20, (stream) => {
                stream.roles = ['commentary'];
              });
            });
            manifest.addVariant(3, (variant) => {
              variant.language = 'en';
              variant.addAudio(30, (stream) => {
                stream.roles = ['secondary'];
              });
            });
            manifest.addVariant(4, (variant) => {
              variant.language = 'en';
              variant.addAudio(40, (stream) => {
                stream.roles = ['secondary'];
              });
            });
            manifest.addVariant(5, (variant) => {
              variant.language = 'en';
              variant.primary = true;
              variant.addAudio(50, (stream) => {
                stream.roles = ['main'];
              });
            });
            manifest.addVariant(6, (variant) => {
              variant.language = 'en';
              variant.primary = true;
              variant.addAudio(60, (stream) => {
                stream.roles = ['main'];
              });
            });
          });

          const builder = new shaka.media.PreferenceBasedCriteria(
              /* language= */ 'zh',
              /* role= */ '',
              /* channelCount= */ 0,
              /* hdrLevel= */ '',
              /* videoLayout= */ '');
          const set = builder.create(manifest.variants);

          // Which role is chosen is an implementation detail. Each role is
          // found on two variants, so we should have two. Since nothing matches
          // our language preference, we chose primary variants.
          checkSet(set, [
            manifest.variants[0],
            manifest.variants[1],
          ]);
        });

    it('chooses a role from best language match, in spite of primary',
        () => {
          const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
            manifest.addVariant(1, (variant) => {
              variant.language = 'en';
              variant.primary = true;
              variant.addAudio(10, (stream) => {
                stream.roles = ['commentary'];
              });
            });
            manifest.addVariant(2, (variant) => {
              variant.language = 'en';
              variant.primary = true;
              variant.addAudio(20, (stream) => {
                stream.roles = ['commentary'];
              });
            });
            manifest.addVariant(3, (variant) => {
              variant.language = 'zh';
              variant.addAudio(30, (stream) => {
                stream.roles = ['secondary'];
              });
            });
            manifest.addVariant(4, (variant) => {
              variant.language = 'zh';
              variant.addAudio(40, (stream) => {
                stream.roles = ['secondary'];
              });
            });
            manifest.addVariant(5, (variant) => {
              variant.language = 'en';
              variant.primary = true;
              variant.addAudio(50, (stream) => {
                stream.roles = ['main'];
              });
            });
            manifest.addVariant(6, (variant) => {
              variant.language = 'en';
              variant.primary = true;
              variant.addAudio(60, (stream) => {
                stream.roles = ['main'];
              });
            });
          });

          const builder = new shaka.media.PreferenceBasedCriteria(
              /* language= */ 'zh',
              /* role= */ '',
              /* channelCount= */ 0,
              /* hdrLevel= */ '',
              /* videoLayout= */ '');
          const set = builder.create(manifest.variants);

          checkSet(set, [
            manifest.variants[2],
            manifest.variants[3],
          ]);
        });

    it('chooses variants with preferred hdr level', () => {
      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(1, (variant) => {
          variant.addVideo(10, (stream) => {
            stream.hdr = 'PQ';
          });
        });
        manifest.addVariant(2, (variant) => {
          variant.addVideo(20, (stream) => {
            stream.hdr = 'SDR';
          });
        });
        manifest.addVariant(3, (variant) => {
          variant.addVideo(30, (stream) => {
            stream.hdr = 'PQ';
          });
        });
      });

      const builder = new shaka.media.PreferenceBasedCriteria(
          /* language= */ '',
          /* role= */ '',
          /* channelCount= */ 0,
          /* hdrLevel= */ 'PQ',
          /* videoLayout= */ '');
      const set = builder.create(manifest.variants);

      checkSet(set, [
        manifest.variants[0],
        manifest.variants[2],
      ]);
    });

    it('chooses variants with preferred video layout (CH-STEREO)', () => {
      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(1, (variant) => {
          variant.addVideo(10, (stream) => {
            stream.videoLayout = 'CH-STEREO';
          });
        });
        manifest.addVariant(2, (variant) => {
          variant.addVideo(20, (stream) => {
            stream.videoLayout = 'CH-MONO';
          });
        });
        manifest.addVariant(3, (variant) => {
          variant.addVideo(30, (stream) => {
            stream.videoLayout = '';
          });
        });
      });

      const builder = new shaka.media.PreferenceBasedCriteria(
          /* language= */ '',
          /* role= */ '',
          /* channelCount= */ 0,
          /* hdrLevel= */ '',
          /* videoLayout= */ 'CH-STEREO');
      const set = builder.create(manifest.variants);

      checkSet(set, [
        manifest.variants[0],
        manifest.variants[2],
      ]);
    });

    it('chooses variants with preferred video layout (CH-MONO)', () => {
      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(1, (variant) => {
          variant.addVideo(10, (stream) => {
            stream.videoLayout = 'CH-STEREO';
          });
        });
        manifest.addVariant(2, (variant) => {
          variant.addVideo(20, (stream) => {
            stream.videoLayout = 'CH-MONO';
          });
        });
        manifest.addVariant(3, (variant) => {
          variant.addVideo(30, (stream) => {
            stream.videoLayout = 'CH-STEREO';
          });
        });
      });

      const builder = new shaka.media.PreferenceBasedCriteria(
          /* language= */ '',
          /* role= */ '',
          /* channelCount= */ 0,
          /* hdrLevel= */ '',
          /* videoLayout= */ 'CH-MONO');
      const set = builder.create(manifest.variants);

      checkSet(set, [
        manifest.variants[1],
      ]);
    });

    it('chooses variants with preferred audio channels count', () => {
      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(1, (variant) => {
          variant.addAudio(10, (stream) => {
            stream.channelsCount = 2;
          });
        });
        manifest.addVariant(2, (variant) => {
          variant.addAudio(20, (stream) => {
            stream.channelsCount = 6;
          });
        });
        manifest.addVariant(3, (variant) => {
          variant.addAudio(30, (stream) => {
            stream.channelsCount = 2;
          });
        });
      });

      const builder = new shaka.media.PreferenceBasedCriteria(
          /* language= */ '',
          /* role= */ '',
          /* channelCount= */ 2,
          /* hdrLevel= */ '',
          /* videoLayout= */ '');
      const set = builder.create(manifest.variants);

      checkSet(set, [
        manifest.variants[0],
        manifest.variants[2],
      ]);
    });

    it('chooses variants with largest audio channel count less than config' +
        ' when no exact audio channel count match is possible', () => {
      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(1, (variant) => {
          variant.addAudio(10, (stream) => {
            stream.channelsCount = 2;
          });
        });
        manifest.addVariant(2, (variant) => {
          variant.addAudio(20, (stream) => {
            stream.channelsCount = 8;
          });
        });
        manifest.addVariant(3, (variant) => {
          variant.addAudio(30, (stream) => {
            stream.channelsCount = 2;
          });
        });
      });

      const builder = new shaka.media.PreferenceBasedCriteria(
          /* language= */ '',
          /* role= */ '',
          /* channelCount= */ 6,
          /* hdrLevel= */ '',
          /* videoLayout= */ '');
      const set = builder.create(manifest.variants);

      checkSet(set, [
        manifest.variants[0],
        manifest.variants[2],
      ]);
    });

    it('chooses variants with fewest audio channels when none fit in the ' +
        'config', () => {
      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(1, (variant) => {
          variant.addAudio(10, (stream) => {
            stream.channelsCount = 6;
          });
        });
        manifest.addVariant(2, (variant) => {
          variant.addAudio(20, (stream) => {
            stream.channelsCount = 8;
          });
        });
        manifest.addVariant(3, (variant) => {
          variant.addAudio(30, (stream) => {
            stream.channelsCount = 6;
          });
        });
      });

      const builder = new shaka.media.PreferenceBasedCriteria(
          /* language= */ '',
          /* role= */ '',
          /* channelCount= */ 2,
          /* hdrLevel= */ '',
          /* videoLayout= */ '');
      const set = builder.create(manifest.variants);

      checkSet(set, [
        manifest.variants[0],
        manifest.variants[2],
      ]);
    });

    it('chooses variants with preferred label', () => {
      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(1, (variant) => {
          variant.addAudio(10, (stream) => {
            stream.label = 'preferredLabel';
          });
        });
        manifest.addVariant(2, (variant) => {
          variant.addAudio(20, (stream) => {
            stream.label = 'otherLabel';
          });
        });
        manifest.addVariant(3, (variant) => {
          variant.addAudio(30, (stream) => {
            stream.label = 'preferredLabel';
          });
        });
      });

      const builder = new shaka.media.PreferenceBasedCriteria(
          /* language= */ '',
          /* role= */ '',
          /* channelCount= */ 0,
          /* hdrLevel= */ '',
          /* videoLayout= */ '',
          /* label= */ 'preferredLabel');
      const set = builder.create(manifest.variants);

      checkSet(set, [
        manifest.variants[0],
        manifest.variants[2],
      ]);
    });

    it('chooses variants with preferred label and language', () => {
      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        // Preferred language and label
        manifest.addVariant(1, (variant) => {
          variant.language = 'zh';
          variant.addAudio(10, (stream) => {
            stream.label = 'preferredLabel';
          });
        });
        // Same language, a different label
        manifest.addVariant(2, (variant) => {
          variant.language = 'zh';
          variant.addAudio(20, (stream) => {
            stream.label = 'otherLabel';
          });
        });
        // Same language and label
        manifest.addVariant(3, (variant) => {
          variant.language = 'zh';
          variant.addAudio(30, (stream) => {
            stream.label = 'preferredLabel';
          });
        });
        // Same label different language
        manifest.addVariant(4, (variant) => {
          variant.language = 'pt';
          variant.addAudio(40, (stream) => {
            stream.label = 'preferredLabel';
          });
        });
      });

      const builder = new shaka.media.PreferenceBasedCriteria(
          /* language= */ 'zh',
          /* role= */ '',
          /* channelCount= */ 0,
          /* hdrLevel= */ '',
          /* videoLayout= */ '',
          /* label= */ 'preferredLabel');
      const set = builder.create(manifest.variants);

      checkSet(set, [
        manifest.variants[0],
        manifest.variants[2],
      ]);
    });

    it('filters by audio group if enabled', () => {
      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(1, (variant) => {
          variant.language = 'en';
          variant.bandwidth = 300;
          variant.addAudio(10, (stream) => {
            stream.groupId = '1';
          });
        });
        manifest.addVariant(2, (variant) => {
          variant.language = 'en';
          variant.bandwidth = 400;
          variant.addAudio(11, (stream) => {
            stream.groupId = '2';
          });
        });
        manifest.addVariant(3, (variant) => {
          variant.language = 'en';
          variant.bandwidth = 500;
          variant.addAudio(12, (stream) => {
            stream.groupId = '1';
          });
        });
      });

      const builder = new shaka.media.PreferenceBasedCriteria(
          /* language= */ 'en',
          /* role= */ '',
          /* channelCount= */ 0,
          /* hdrLevel= */ '',
          /* videoLayout= */ '',
          /* label= */ '',
          shaka.config.CodecSwitchingStrategy.RELOAD,
          /* enableAudioGroups= */ true);
      const set = builder.create(manifest.variants);

      checkSet(set, [
        manifest.variants[0],
        manifest.variants[2],
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
