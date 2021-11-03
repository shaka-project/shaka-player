/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.require('shaka.test.FakeDrmEngine');
goog.require('shaka.test.ManifestGenerator');
goog.require('shaka.test.Util');
goog.require('shaka.util.StreamUtils');

describe('StreamUtils', () => {
  const StreamUtils = shaka.util.StreamUtils;

  let manifest;
  /** @type {!jasmine.Spy} */
  let decodingInfoSpy;

  const originalDecodingInfo = window.shakaMediaCapabilities.decodingInfo;

  beforeEach(() => {
    decodingInfoSpy = jasmine.createSpy('decodingInfo');
  });

  afterEach(() => {
    window.shakaMediaCapabilities.decodingInfo = originalDecodingInfo;
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
          /* usePersistentLicenses= */false, /* srcEquals= */ false);
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
          /* usePersistentLicenses= */false, /* srcEquals= */ true);
      expect(manifest.variants.length).toBeTruthy();
      expect(manifest.variants[0].decodingInfos.length).toBe(1);
      expect(manifest.variants[0].decodingInfos[0].supported).toBeTruthy();
    });

    it('handles decodingInfo exception', async () => {
      window.shakaMediaCapabilities.decodingInfo =
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
          /* usePersistentLicenses= */false, /* srcEquals= */ false);
      expect(manifest.variants.length).toBe(1);
      expect(manifest.variants[0].decodingInfos.length).toBe(0);
    });

    it('includes transferFunction in config when hdr', async () => {
      window.shakaMediaCapabilities.decodingInfo =
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
          /* usePersistentLicenses= */ false, /* srcEquals= */ false);
      expect(decodingInfoSpy.calls.argsFor(0)[0].video.transferFunction)
          .toBe('srgb');
      expect(decodingInfoSpy.calls.argsFor(1)[0].video.transferFunction)
          .toBe('pq');
      expect(decodingInfoSpy.calls.argsFor(2)[0].video.transferFunction)
          .toBe('hlg');
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

    it('filters image streams', async () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addImageStream(1, (stream) => {
          stream.mimeType = 'image/svg+xml';
        });
        manifest.addImageStream(2, (stream) => {
          stream.mimeType = 'image/png';
        });
        manifest.addImageStream(3, (stream) => {
          stream.mimeType = 'image/jpeg';
        });
        manifest.addImageStream(4, (stream) => {
          stream.mimeType = 'image/bogus';
        });
      });

      const noVariant = null;
      await shaka.util.StreamUtils.filterManifest(
          fakeDrmEngine, noVariant, manifest);

      // Covers a regression in which we would remove streams with codecs.
      // The last two streams should be removed because their full MIME types
      // are bogus.
      expect(manifest.imageStreams.length).toBe(3);
      expect(manifest.imageStreams[0].id).toBe(1);
      expect(manifest.imageStreams[1].id).toBe(2);
      expect(manifest.imageStreams[2].id).toBe(3);
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

      await shaka.util.StreamUtils.filterManifest(
          fakeDrmEngine, /* currentVariant= */ null, manifest,
          /* useMediaCapabilities= */ true);

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

      await shaka.util.StreamUtils.filterManifest(
          fakeDrmEngine, /* currentVariant= */ null, manifest,
          /* useMediaCapabilities= */ true);
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

      await shaka.util.StreamUtils.filterManifest(
          fakeDrmEngine, /* currentVariant= */ null, manifest,
          /* useMediaCapabilities= */ true);

      expect(manifest.variants.length).toBe(1);
    });
  });

  describe('chooseCodecsAndFilterManifest', () => {
    const avc1Codecs = 'avc1.640028';
    const vp09Codecs = 'vp09.00.40.08.00.02.02.02.00';

    const addVariant1080Avc1 = (manifest) => {
      manifest.addVariant(0, (variant) => {
        variant.bandwidth = 5058558;
        variant.addAudio(1, (stream) => {
          stream.bandwidth = 129998;
        });
        variant.addVideo(2, (stream) => {
          stream.bandwidth = 4928560;
          stream.codecs = avc1Codecs;
          stream.size(1920, 1080);
        });
      });
    };

    const addVariant1080Vp9 = (manifest) => {
      manifest.addVariant(3, (variant) => {
        variant.bandwidth = 4911000;
        variant.addAudio(4, (stream) => {
          stream.bandwidth = 129998;
        });
        variant.addVideo(5, (stream) => {
          stream.bandwidth = 4781002;
          stream.codecs = vp09Codecs;
          stream.size(1920, 1080);
        });
      });
    };

    const addVariant2160Vp9 = (manifest) => {
      manifest.addVariant(6, (variant) => {
        variant.bandwidth = 10850316;
        variant.addAudio(7, (stream) => {
          stream.bandwidth = 129998;
        });
        variant.addVideo(8, (stream) => {
          stream.bandwidth = 10784324;
          stream.codecs = vp09Codecs;
          stream.size(3840, 2160);
        });
      });
    };

    it('chooses variants with different sizes (density) by codecs', () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        addVariant1080Avc1(manifest);
        addVariant1080Vp9(manifest);
        addVariant2160Vp9(manifest);
      });

      shaka.util.StreamUtils.chooseCodecsAndFilterManifest(manifest, 2);

      expect(manifest.variants.length).toBe(2);
      expect(manifest.variants[0].video.codecs).toBe(vp09Codecs);
      expect(manifest.variants[1].video.codecs).toBe(vp09Codecs);
    });

    it('chooses variants with same sizes (density) by codecs', () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        addVariant1080Avc1(manifest);
        addVariant1080Vp9(manifest);
      });

      shaka.util.StreamUtils.chooseCodecsAndFilterManifest(manifest, 2);

      expect(manifest.variants.length).toBe(1);
      expect(manifest.variants[0].video.codecs).toBe(vp09Codecs);
    });
  });
});
