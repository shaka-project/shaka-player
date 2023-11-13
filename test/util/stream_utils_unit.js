/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('StreamUtils', () => {
  const StreamUtils = shaka.util.StreamUtils;

  let manifest;
  /** @type {!jasmine.Spy} */
  let decodingInfoSpy;

  const originalDecodingInfo = navigator.mediaCapabilities.decodingInfo;

  beforeEach(() => {
    decodingInfoSpy = jasmine.createSpy('decodingInfo');
  });

  afterEach(() => {
    navigator.mediaCapabilities.decodingInfo = originalDecodingInfo;
  });

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
      // Regression test for https://github.com/shaka-project/shaka-player/issues/949
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
      // Regression test for https://github.com/shaka-project/shaka-player/issues/949
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
      // Regression test for https://github.com/shaka-project/shaka-player/issues/918
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

  describe('getDecodingInfosForVariants', () => {
    it('for multiplexd content', async () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(0, (variant) => {
          variant.addVideo(1, (stream) => {
            stream.mime('video/mp2t', 'avc1.4d400d,mp4a.40.2');
          });
        });
      });

      await StreamUtils.getDecodingInfosForVariants(manifest.variants,
          /* usePersistentLicenses= */false, /* srcEquals= */ false,
          /* preferredKeySystems= */ []);
      expect(manifest.variants.length).toBeTruthy();
      expect(manifest.variants[0].decodingInfos.length).toBe(1);
      expect(manifest.variants[0].decodingInfos[0].supported).toBeTruthy();
    });

    it('for srcEquals content', async () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(0, (variant) => {
          variant.addVideo(1, (stream) => {
            stream.mime('video/mp4', 'avc1.4d400d');
          });
        });
      });

      await StreamUtils.getDecodingInfosForVariants(manifest.variants,
          /* usePersistentLicenses= */false, /* srcEquals= */ true,
          /* preferredKeySystems= */ []);
      expect(manifest.variants.length).toBeTruthy();
      expect(manifest.variants[0].decodingInfos.length).toBe(1);
      expect(manifest.variants[0].decodingInfos[0].supported).toBeTruthy();
    });

    it('handles decodingInfo exception', async () => {
      navigator.mediaCapabilities.decodingInfo =
          shaka.test.Util.spyFunc(decodingInfoSpy);
      // If decodingInfo() fails, setDecodingInfo should finish without throwing
      // an exception, and the variant should have no decodingInfo result.
      decodingInfoSpy.and.throwError('MediaCapabilties.decodingInfo failed.');

      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(0, (variant) => {
          variant.addVideo(1, (stream) => {
            stream.mime('video/mp4', 'avc1');
            stream.encrypted = true;
            stream.mime('video/mp4', 'avc1.4d400d');
          });
          variant.addAudio(2, (stream) => {
            stream.mime('audio/mp4', 'mp4a.40.2');
            stream.encrypted = true;
            stream.addDrmInfo('com.widevine.alpha');
          });
        });
      });

      await StreamUtils.getDecodingInfosForVariants(manifest.variants,
          /* usePersistentLicenses= */false, /* srcEquals= */ false,
          /* preferredKeySystems= */ []);
      expect(manifest.variants.length).toBe(1);
      expect(manifest.variants[0].decodingInfos.length).toBe(0);
    });

    it('includes transferFunction in config when hdr', async () => {
      const originalDecodingInfo = navigator.mediaCapabilities.decodingInfo;

      try {
        navigator.mediaCapabilities.decodingInfo =
            shaka.test.Util.spyFunc(decodingInfoSpy);

        manifest = shaka.test.ManifestGenerator.generate((manifest) => {
          manifest.addVariant(0, (variant) => {
            variant.addVideo(0, (stream) => {
              stream.mime('video/mp4', 'avc1.640028');
              stream.hdr = 'SDR';
            });
          });
          manifest.addVariant(1, (variant) => {
            variant.addVideo(1, (stream) => {
              stream.mime('video/mp4', 'hvc1.2.4.L150.90');
              stream.hdr = 'PQ';
            });
          });
          manifest.addVariant(2, (variant) => {
            variant.addVideo(2, (stream) => {
              stream.mime('video/mp4', 'hvc1.2.4.L153.B0');
              stream.hdr = 'HLG';
            });
          });
        });

        await StreamUtils.getDecodingInfosForVariants(manifest.variants,
            /* usePersistentLicenses= */ false, /* srcEquals= */ false,
            /* preferredKeySystems= */ []);
        expect(decodingInfoSpy.calls.argsFor(0)[0].video.transferFunction)
            .toBe('srgb');
        expect(decodingInfoSpy.calls.argsFor(1)[0].video.transferFunction)
            .toBe('pq');
        expect(decodingInfoSpy.calls.argsFor(2)[0].video.transferFunction)
            .toBe('hlg');
      } finally {
        navigator.mediaCapabilities.decodingInfo = originalDecodingInfo;
      }
    });

    it('includes streams only with preferred key system', async () => {
      const originalDecodingInfo = navigator.mediaCapabilities.decodingInfo;

      try {
        navigator.mediaCapabilities.decodingInfo =
            shaka.test.Util.spyFunc(decodingInfoSpy);

        manifest = shaka.test.ManifestGenerator.generate((manifest) => {
          manifest.addVariant(0, (variant) => {
            variant.addVideo(1, (stream) => {
              stream.mime('video/mp4', 'avc1.4d400d');
              stream.encrypted = true;
              stream.addDrmInfo('com.widevine.alpha');
              stream.addDrmInfo('com.microsoft.playready');
            });
          });
        });

        await StreamUtils.getDecodingInfosForVariants(manifest.variants,
            /* usePersistentLicenses= */ false, /* srcEquals= */ false,
            /* preferredKeySystems= */ ['com.microsoft.playready']);

        // if preferred key system satisfies us, we shouldn't check other ones.
        expect(decodingInfoSpy).toHaveBeenCalledTimes(1);
        expect(decodingInfoSpy.calls.argsFor(0)[0].keySystemConfiguration
            .keySystem)
            .toBe('com.microsoft.playready');
      } finally {
        navigator.mediaCapabilities.decodingInfo = originalDecodingInfo;
      }
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

      await shaka.util.StreamUtils.filterManifest(fakeDrmEngine, manifest);

      // Covers a regression in which we would remove streams with codecs.
      // The last two streams should be removed because their full MIME types
      // are bogus.
      expect(manifest.textStreams.length).toBe(2);
      expect(manifest.textStreams[0].id).toBe(1);
      expect(manifest.textStreams[1].id).toBe(2);
    });

    it('filters image streams', async () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addImageStream(1, (stream) => {
          stream.mimeType = 'image/svg+xml';
        });
        manifest.addImageStream(2, (stream) => {
          stream.mimeType = 'image/png';
        });
        manifest.addImageStream(3, (stream) => {
          stream.mimeType = 'image/jpg';
        });
        manifest.addImageStream(4, (stream) => {
          stream.mimeType = 'image/jpeg';
        });
        manifest.addImageStream(5, (stream) => {
          stream.mimeType = 'image/bogus';
        });
        manifest.addImageStream(6, (stream) => {
          stream.mimeType = 'image/avif';
        });
        manifest.addImageStream(7, (stream) => {
          stream.mimeType = 'image/webp';
        });
      });

      await shaka.util.StreamUtils.filterManifest(fakeDrmEngine, manifest);

      // Covers a regression in which we would remove streams with codecs.
      // The first 4 streams should be there because they are always supported.
      // The 5th stream should be removed because the MIME type is bogus.
      // The 6th and 7th streams may be there, based on platform support.
      expect(manifest.imageStreams).toContain(
          jasmine.objectContaining({id: 1}));
      expect(manifest.imageStreams).toContain(
          jasmine.objectContaining({id: 2}));
      expect(manifest.imageStreams).toContain(
          jasmine.objectContaining({id: 3}));
      expect(manifest.imageStreams).toContain(
          jasmine.objectContaining({id: 4}));
      expect(manifest.imageStreams).not.toContain(
          jasmine.objectContaining({id: 5}));
    });

    it('does not filter manifest when codec switching is enabled', async () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(1, (variant) => {
          variant.addAudio(10, (stream) => {
            stream.codecs = 'mp4a.69';
          });
          variant.addVideo(11, (stream) => {
            stream.codecs = 'avc1';
          });
        });
      });

      const originalFilterManifestByCurrentVariant =
          shaka.util.StreamUtils.filterManifestByCurrentVariant;

      try {
        const filterManifestByCurrentVariantSpy =
          jasmine.createSpy('filterManifestByCurrentVariant');
        shaka.util.StreamUtils.filterManifestByCurrentVariant =
          shaka.test.Util.spyFunc(filterManifestByCurrentVariantSpy);

        await shaka.util.StreamUtils.filterManifest(fakeDrmEngine, manifest);

        expect(filterManifestByCurrentVariantSpy).not.toHaveBeenCalled();
      } finally {
        shaka.util.StreamUtils.filterManifestByCurrentVariant =
          originalFilterManifestByCurrentVariant;
      }
    });

    it('filters transport streams', async () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(0, (variant) => {
          variant.language = 'en';
          variant.addVideo(1, (stream) => {
            stream.mime('video/mp2t', 'avc1.42c00d');
          });
          variant.addAudio(2, (stream) => {
            stream.mime('video/mp2t', 'mp4a.40.2');
          });
        });
      });

      await shaka.util.StreamUtils.filterManifest(fakeDrmEngine, manifest);

      // Covers a regression in which we would remove streams with codecs.
      // The last two streams should be removed because their full MIME types
      // are bogus.
      expect(manifest.variants.length).toBe(1);
      expect(manifest.variants[0].video.id).toBe(1);
      expect(manifest.variants[0].audio.id).toBe(2);
    });

    // MediaCapabilities decodingInfo requires valid bandwidth, frameRate,
    // width, height as part of the input. Fill in default values if those info
    // are not available from the manifest.
    it('tolerates empty bandwidth, frameRate, width, height', async () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(0, (variant) => {
          variant.language = 'en';
          variant.addVideo(1, (stream) => {
            stream.codecs = 'avc1.4d401f';
          });
          variant.addAudio(2, (stream) => {
            stream.codecs = 'mp4a.40.2';
          });
        });
      });

      await shaka.util.StreamUtils.filterManifest(fakeDrmEngine, manifest);
      expect(manifest.variants.length).toBe(1);
    });

    it('supports VP9 codec', async () => {
      if (!MediaSource.isTypeSupported('video/webm; codecs="vp9"')) {
        pending('Codec VP9 is not supported by the platform.');
      }
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(0, (variant) => {
          variant.addVideo(1, (stream) => {
            stream.mime('video/webm', 'vp9');
          });
        });
      });

      await shaka.util.StreamUtils.filterManifest(fakeDrmEngine, manifest);

      expect(manifest.variants.length).toBe(1);
    });

    it('supports fLaC codec', async () => {
      if (!MediaSource.isTypeSupported('audio/mp4; codecs="flac"')) {
        pending('Codec fLaC is not supported by the platform.');
      }
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(0, (variant) => {
          variant.addAudio(1, (stream) => {
            stream.mime('audio/mp4', 'fLaC');
          });
        });
        manifest.addVariant(2, (variant) => {
          variant.addAudio(3, (stream) => {
            stream.mime('audio/mp4', 'flac');
          });
        });
      });

      await shaka.util.StreamUtils.filterManifest(fakeDrmEngine, manifest);

      expect(manifest.variants.length).toBe(2);
    });

    it('supports Opus codec', async () => {
      if (!MediaSource.isTypeSupported('audio/mp4; codecs="opus"')) {
        pending('Codec Opus is not supported by the platform.');
      }
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(0, (variant) => {
          variant.addAudio(1, (stream) => {
            stream.mime('audio/mp4', 'Opus');
          });
        });
        manifest.addVariant(2, (variant) => {
          variant.addAudio(3, (stream) => {
            stream.mime('audio/mp4', 'opus');
          });
        });
      });

      await shaka.util.StreamUtils.filterManifest(fakeDrmEngine, manifest);

      expect(manifest.variants.length).toBe(2);
    });

    it('supports legacy AVC1 codec', async () => {
      if (!MediaSource.isTypeSupported('video/mp4; codecs="avc1.42001e"')) {
        pending('Codec avc1.42001e is not supported by the platform.');
      }
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(0, (variant) => {
          variant.addVideo(1, (stream) => {
            stream.mime('video/mp4', 'avc1.66.30');
          });
        });
      });

      await shaka.util.StreamUtils.filterManifest(fakeDrmEngine, manifest);

      expect(manifest.variants.length).toBe(1);
    });
  });

  describe('chooseCodecsAndFilterManifest', () => {
    const addVariant720Avc1 = (manifest) => {
      manifest.addVariant(0, (variant) => {
        variant.bandwidth = 5058558;
        variant.addAudio(1, (stream) => {
          stream.bandwidth = 129998;
          stream.mime('audio/mp4', 'mp4a.40.2');
        });
        variant.addVideo(2, (stream) => {
          stream.bandwidth = 4928560;
          stream.size(1280, 720);
          stream.mime('video/mp4', 'avc1.640028');
        });
      });
    };

    const addVariant720Vp9 = (manifest) => {
      manifest.addVariant(3, (variant) => {
        variant.bandwidth = 4911000;
        variant.addAudio(4, (stream) => {
          stream.bandwidth = 129998;
          stream.mime('audio/webm', 'vorbis');
        });
        variant.addVideo(5, (stream) => {
          stream.bandwidth = 4781002;
          stream.size(1280, 720);
          stream.mime('video/webm', 'vp9');
        });
      });
    };

    const addVariant1080Vp9 = (manifest) => {
      manifest.addVariant(6, (variant) => {
        variant.bandwidth = 10850316;
        variant.addAudio(1, (stream) => {
          stream.bandwidth = 129998;
          stream.mime('audio/mp4', 'mp4a.40.2');
        });
        variant.addVideo(8, (stream) => {
          stream.bandwidth = 10784324;
          stream.size(1920, 1080);
          stream.mime('video/webm', 'vp9');
        });
      });
    };

    it('should filter variants by the best available bandwidth' +
        ' for video resolution', () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(0, (variant) => {
          variant.bandwidth = 4058558;
          variant.addVideo(1, (stream) => {
            stream.bandwidth = 300000;
            stream.size(10, 10);
          });
        });
        manifest.addVariant(2, (variant) => {
          variant.bandwidth = 4781002;
          variant.addVideo(3, (stream) => {
            stream.bandwidth = 400000;
            stream.size(10, 10);
          });
        });
        manifest.addVariant(4, (variant) => {
          variant.addVideo(5, (stream) => {
            stream.bandwidth = 500000;
            stream.size(20, 20);
          });
        });
        manifest.addVariant(6, (variant) => {
          variant.addVideo(7, (stream) => {
            stream.bandwidth = 600000;
            stream.size(20, 20);
          });
        });
      });

      shaka.util.StreamUtils.chooseCodecsAndFilterManifest(manifest,
          /* preferredVideoCodecs= */[],
          /* preferredAudioCodecs= */[],
          /* preferredDecodingAttributes= */[]);

      expect(manifest.variants.length).toBe(2);
      expect(manifest.variants.every((v) => [300000, 500000].includes(
          v.video.bandwidth))).toBeTruthy();
    });

    it('should filter variants by the best available bandwidth' +
    ' for audio language', () => {
      // This test is flaky in some Tizen devices, due to codec restrictions.
      if (shaka.util.Platform.isTizen()) {
        pending('Skip flaky test in Tizen');
      }
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(0, (variant) => {
          variant.bandwidth = 4058558;
          variant.addAudio(1, (stream) => {
            stream.bandwidth = 100000;
            stream.language = 'en';
            stream.mime('audio/mp4', 'mp4a.40.2');
          });
        });
        manifest.addVariant(2, (variant) => {
          variant.bandwidth = 4781002;
          variant.addAudio(3, (stream) => {
            stream.bandwidth = 200000;
            stream.language = 'en';
            stream.mime('audio/mp4', 'flac');
          });
        });
        manifest.addVariant(4, (variant) => {
          variant.addAudio(5, (stream) => {
            stream.bandwidth = 100000;
            stream.language = 'es';
            stream.mime('audio/mp4', 'mp4a.40.2');
          });
        });
        manifest.addVariant(6, (variant) => {
          variant.addAudio(7, (stream) => {
            stream.bandwidth = 500000;
            stream.language = 'es';
            stream.mime('audio/mp4', 'flac');
          });
        });
      });

      shaka.util.StreamUtils.chooseCodecsAndFilterManifest(manifest,
      /* preferredVideoCodecs= */[],
          /* preferredAudioCodecs= */[],
          /* preferredDecodingAttributes= */[]);

      expect(manifest.variants.length).toBe(2);
      expect(manifest.variants.every((v) => v.audio.bandwidth == 100000))
          .toBeTruthy();
    });

    it('should allow multiple codecs for codec switching', () => {
      if (!MediaSource.isTypeSupported('video/webm; codecs="vp9"')) {
        pending('Codec VP9 is not supported by the platform.');
      }
      if (!MediaSource.isTypeSupported('video/webm; codecs="vorbis"')) {
        pending('Codec vorbis is not supported by the platform.');
      }
      // This test is flaky in some Tizen devices, due to codec restrictions.
      if (shaka.util.Platform.isTizen()) {
        pending('Skip flaky test in Tizen');
      }
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        addVariant720Avc1(manifest);
        addVariant720Vp9(manifest);
        addVariant1080Vp9(manifest);
      });

      manifest.variants[0].video.bandwidth = 1;

      shaka.util.StreamUtils.chooseCodecsAndFilterManifest(manifest,
          /* preferredVideoCodecs= */[],
          /* preferredAudioCodecs= */[],
          /* preferredDecodingAttributes= */[]);

      expect(manifest.variants.length).toBe(2);
      expect(manifest.variants[0].video.codecs)
          .not.toBe(manifest.variants[1].video.codecs);
    });

    it('chooses preferred audio and video codecs', () => {
      if (!MediaSource.isTypeSupported('video/webm; codecs="vp9"')) {
        pending('Codec VP9 is not supported by the platform.');
      }
      if (!MediaSource.isTypeSupported('video/webm; codecs="vorbis"')) {
        pending('Codec vorbis is not supported by the platform.');
      }
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        addVariant720Avc1(manifest);
        addVariant720Vp9(manifest);
        addVariant1080Vp9(manifest);
      });
      const variants =
          shaka.util.StreamUtils.choosePreferredCodecs(manifest.variants,
              /* preferredVideoCodecs= */['vp9'],
              /* preferredAudioCodecs= */['mp4a']);

      expect(variants.length).toBe(1);
      expect(variants[0].video.codecs).toBe('vp9');
      expect(variants[0].audio.codecs).toBe('mp4a.40.2');
    });

    it('chooses preferred video codecs', () => {
      if (!MediaSource.isTypeSupported('video/webm; codecs="vp9"')) {
        pending('Codec VP9 is not supported by the platform.');
      }
      if (!MediaSource.isTypeSupported('video/webm; codecs="vorbis"')) {
        pending('Codec vorbis is not supported by the platform.');
      }
      // If no preferred audio codecs is specified or can be found, choose the
      // variants with preferred video codecs.
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        addVariant720Avc1(manifest);
        addVariant720Vp9(manifest);
        addVariant1080Vp9(manifest);
      });
      const variants =
          shaka.util.StreamUtils.choosePreferredCodecs(manifest.variants,
              /* preferredVideoCodecs= */['vp9'],
              /* preferredAudioCodecs= */[]);

      expect(variants.length).toBe(2);
      expect(variants[0].video.codecs).toBe('vp9');
      expect(variants[0].audio.codecs).toBe('vorbis');
      expect(variants[1].video.codecs).toBe('vp9');
      expect(variants[1].audio.codecs).toBe('mp4a.40.2');
    });

    it('chooses preferred audio codecs', () => {
      if (!MediaSource.isTypeSupported('video/webm; codecs="vp9"')) {
        pending('Codec VP9 is not supported by the platform.');
      }
      if (!MediaSource.isTypeSupported('video/webm; codecs="vorbis"')) {
        pending('Codec vorbis is not supported by the platform.');
      }
      // If no preferred video codecs is specified or can be found, choose the
      // variants with preferred audio codecs.
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        addVariant720Avc1(manifest);
        addVariant720Vp9(manifest);
        addVariant1080Vp9(manifest);
      });
      const variants =
          shaka.util.StreamUtils.choosePreferredCodecs(manifest.variants,
              /* preferredVideoCodecs= */['foo'],
              /* preferredAudioCodecs= */['mp4a.40.2']);

      expect(variants.length).toBe(2);
      expect(variants[0].video.codecs).toBe('avc1.640028');
      expect(variants[0].audio.codecs).toBe('mp4a.40.2');
      expect(variants[1].video.codecs).toBe('vp9');
      expect(variants[1].audio.codecs).toBe('mp4a.40.2');
    });

    it('chooses variants by decoding attributes', async () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(0, (variant) => {
          variant.bandwidth = 4058558;
          variant.addVideo(1, (stream) => {
            stream.mime('video', 'notsmooth');
          });
        });
        manifest.addVariant(1, (variant) => {
          variant.bandwidth = 4781002;
          variant.addVideo(2, (stream) => {
            stream.mime('video', 'smooth');
          });
        });
        manifest.addVariant(3, (variant) => {
          variant.addVideo(4, (stream) => {
            variant.bandwidth = 5058558;
            stream.mime('video', 'smooth-2');
          });
        });
      });
      navigator.mediaCapabilities.decodingInfo =
          shaka.test.Util.spyFunc(decodingInfoSpy);
      decodingInfoSpy.and.callFake((config) => {
        const res = config.video.contentType.includes('notsmooth') ?
           {supported: true, smooth: false} :
           {supported: true, smooth: true};
        return Promise.resolve(res);
      });

      await StreamUtils.getDecodingInfosForVariants(manifest.variants,
          /* usePersistentLicenses= */false, /* srcEquals= */ false,
          /* preferredKeySystems= */ []);

      shaka.util.StreamUtils.chooseCodecsAndFilterManifest(manifest,
          /* preferredVideoCodecs= */[],
          /* preferredAudioCodecs= */[],
          /* preferredDecodingAttributes= */
          [shaka.util.StreamUtils.DecodingAttributes.SMOOTH]);
      // 2 video codecs are smooth. Choose the one with the lowest bandwidth.
      expect(manifest.variants.length).toBe(1);
      expect(manifest.variants[0].id).toBe(1);
      expect(manifest.variants[0].video.id).toBe(2);
    });
  });

  describe('isPlayable', () => {
    /** @type {shaka.extern.Variant} */
    const variant = {
      id: 1,
      language: 'es',
      disabledUntilTime: 0,
      video: null,
      audio: null,
      primary: false,
      bandwidth: 2000,
      allowedByApplication: true,
      allowedByKeySystem: true,
      decodingInfos: [],
    };

    it('returns false if variant is disabled', () => {
      variant.allowedByApplication = true;
      variant.allowedByKeySystem = true;
      variant.disabledUntilTime = 1234;

      expect(shaka.util.StreamUtils.isPlayable(variant)).toBe(false);
    });
  });
});
