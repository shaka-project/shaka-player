/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.test.TestScheme');


shaka.test.TestScheme = class {
  /**
   * A plugin that handles fake network requests.  This will serve both segments
   * and manifests that will point to a fake manifest generator.
   *
   * The test scheme URIs look like one of the following:
   * - test:name
   * - test:name/video/123
   *
   * @param {string} uri
   * @param {shaka.extern.Request} request
   * @param {shaka.net.NetworkingEngine.RequestType=} requestType
   * @return {!shaka.extern.IAbortableOperation.<shaka.extern.Response>}
   */
  static plugin(uri, request, requestType) {
    const manifestParts = /^test:([^/]+)$/.exec(uri);
    if (manifestParts) {
      /** @type {shaka.extern.Response} */
      const response = {
        uri: uri,
        originalUri: uri,
        data: new ArrayBuffer(0),
        headers: {'content-type': 'application/x-test-manifest'},
      };
      return shaka.util.AbortableOperation.completed(response);
    }

    const malformed = new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.NETWORK,
        shaka.util.Error.Code.MALFORMED_TEST_URI);

    const re = /^test:([^/]+)\/(video|audio)\/(init|[0-9]+)$/;
    const segmentParts = re.exec(uri);
    if (!segmentParts) {
      // Use expect so the URI is printed on errors.
      expect(uri).toMatch(re);
      return shaka.util.AbortableOperation.failed(malformed);
    }

    const name = segmentParts[1];
    const type = segmentParts[2];

    const generators = shaka.test.TestScheme.GENERATORS[name];
    expect(generators).toBeTruthy();
    if (!generators) {
      return shaka.util.AbortableOperation.failed(malformed);
    }

    const generator = generators[type];
    expect(generator).toBeTruthy();
    if (!generator) {
      return shaka.util.AbortableOperation.failed(malformed);
    }

    let responseData;
    if (segmentParts[3] === 'init') {
      responseData = generator.getInitSegment(0);
    } else {
      const index = Number(segmentParts[3]);
      responseData = generator.getSegment(index + 1, 0, 0);
    }
    if (!responseData) {
      return shaka.util.AbortableOperation.failed(malformed);
    }

    /** @type {shaka.extern.Response} */
    const ret = {uri: uri, originalUri: uri, data: responseData, headers: {}};
    return shaka.util.AbortableOperation.completed(ret);
  }

  /**
   * Sets up the networking callbacks required to play the given asset.
   *
   * @param {!shaka.Player} player
   * @param {string} name
   */
  static setupPlayer(player, name) {
    const asset = shaka.test.TestScheme.DATA[name];
    goog.asserts.assert(asset, 'Unknown asset');
    if (!asset) {
      return;
    }
    if (asset.licenseRequestHeaders) {
      const netEngine = player.getNetworkingEngine();
      netEngine.registerRequestFilter((type, request) => {
        if (type != shaka.net.NetworkingEngine.RequestType.LICENSE) {
          return;
        }

        for (const header in asset.licenseRequestHeaders) {
          request.headers[header] = asset.licenseRequestHeaders[header];
        }
      });
    }
    if (asset.licenseServers) {
      const config = {drm: {servers: asset.licenseServers}};
      player.configure(config);
    }
  }

  /**
   * Creates the manifests and generators.
   * @param {*} shaka
   * @param {string} suffix
   * @return {!Promise}
   */
  static createManifests(shaka, suffix) {
    /** @type {?} */
    const windowShaka = window['shaka'];

    /**
     * @param {Object} metadata
     * @return {shaka.test.IStreamGenerator}
     */
    function createStreamGenerator(metadata) {
      if (metadata.segmentUri.includes('.ts')) {
        return new windowShaka.test.TSVodStreamGenerator(
            metadata.segmentUri);
      }
      return new windowShaka.test.Mp4VodStreamGenerator(
          metadata.initSegmentUri, metadata.mdhdOffset, metadata.segmentUri,
          metadata.tfdtOffset, metadata.segmentDuration);
    }

    /**
     * Not for simulating non-segmented text streams.
     *
     * @param {!shaka.test.ManifestGenerator.Stream} stream
     * @param {!shaka.test.ManifestGenerator.Variant} variant
     * @param {Object} data
     * @param {shaka.util.ManifestParserUtils.ContentType} contentType
     * @param {string} name
     */
    function addStreamInfo(stream, variant, data, contentType, name) {
      stream.mime = data[contentType].mimeType;
      stream.codecs = data[contentType].codecs;
      stream.setInitSegmentReference(
          ['test:' + name + '/' + contentType + '/init'], 0, null);
      stream.useSegmentTemplate(
          'test:' + name + '/' + contentType + '/%d',
          data[contentType].segmentDuration);
      stream.closedCaptions = data[contentType].closedCaptions;

      if (data[contentType].language) {
        stream.language = data[contentType].language;
      }

      if (data[contentType].delaySetup) {
        stream.createSegmentIndex = () => windowShaka.test.Util.delay(1);
      }

      if (data.licenseServers) {
        for (const keySystem in data.licenseServers) {
          variant.addDrmInfo(keySystem, (drmInfo) => {
            drmInfo.licenseServerUri = data.licenseServers[keySystem];
            if (data[contentType].initData) {
              drmInfo.addCencInitData(data[contentType].initData);
            }
          });
        }
      }
    }

    /**
     * @param {!Object} data
     * @return {string}
     */
    function getAbsoluteUri(data) {
      // This seems to be necessary.  Otherwise, we end up with an URL like
      // "http:/base/..." which then fails to load on Safari for some reason.
      const locationUri = new goog.Uri(location.href);
      const partialUri = new goog.Uri(data.text.uri);
      return locationUri.resolve(partialUri).toString();
    }

    const promises = [];
    // Include 'window' to use uncompiled version version of the library.
    const DATA = windowShaka.test.TestScheme.DATA;
    const GENERATORS = windowShaka.test.TestScheme.GENERATORS;
    const MANIFESTS = windowShaka.test.TestScheme.MANIFESTS;
    const ContentType = windowShaka.util.ManifestParserUtils.ContentType;

    for (const name in DATA) {
      GENERATORS[name + suffix] = GENERATORS[name + suffix] || {};
      const data = DATA[name];
      for (const type of [ContentType.VIDEO, ContentType.AUDIO]) {
        if (data[type]) {
          const streamGen = createStreamGenerator(data[type]);
          GENERATORS[name + suffix][type] = streamGen;
          promises.push(streamGen.init());
        }
      }

      const manifest =
          windowShaka.test.ManifestGenerator.generate((manifest) => {
            manifest.presentationTimeline.setDuration(data.duration);
            manifest.addPeriod(/* startTime= */ 0, (period) => {
              period.addVariant(0, (variant) => {
                if (data[ContentType.VIDEO]) {
                  variant.addVideo(1, (stream) => {
                    addStreamInfo(
                        stream, variant, data, ContentType.VIDEO, name);
                  });
                }
                if (data[ContentType.AUDIO]) {
                  variant.addAudio(2, (stream) => {
                    addStreamInfo(
                        stream, variant, data, ContentType.AUDIO, name);
                  });
                }
              });

              if (data.text) {
                period.addTextStream(3, (stream) => {
                  stream.mime = data.text.mimeType;
                  stream.codecs = data.text.codecs;
                  stream.textStream(getAbsoluteUri(data));

                  if (data.text.language) {
                    stream.language = data.text.language;
                  }
                });
              }
            });
          }, shaka);
      MANIFESTS[name + suffix] = manifest;
    }
    // Custom generators:

    const data = DATA['sintel'];
    const periodDuration = 10;

    // Multi-period
    const numPeriods = 10;
    let manifest = windowShaka.test.ManifestGenerator.generate((manifest) => {
      manifest.presentationTimeline.setDuration(periodDuration * numPeriods);

      let idCount = 1;
      for (const i of windowShaka.util.Iterables.range(numPeriods)) {
        manifest.addPeriod(
            /* startTime= */ periodDuration * i,
            (period) => {
              period.addVariant(idCount++, (variant) => {
                variant.language = 'en';
                variant.addVideo(idCount++, (stream) => {
                  addStreamInfo(
                      stream, variant, data, ContentType.VIDEO, 'sintel');
                });
                variant.addAudio(idCount++, (stream) => {
                  addStreamInfo(
                      stream, variant, data, ContentType.AUDIO, 'sintel');
                });
              });

              period.addVariant(idCount++, (variant) => {
                variant.language = 'es';
                variant.addVideo(idCount++, (stream) => {
                  addStreamInfo(
                      stream, variant, data, ContentType.VIDEO, 'sintel');
                });
                variant.addAudio(idCount++, (stream) => {
                  addStreamInfo(
                      stream, variant, data, ContentType.AUDIO, 'sintel');
                });
              });
            });
      }
    }, shaka);
    MANIFESTS['sintel_short_periods' + suffix] = manifest;


    // Multi-stream. Different languages and resolutions.
    let idCount = 1;
    manifest = windowShaka.test.ManifestGenerator.generate((manifest) => {
      manifest.presentationTimeline.setDuration(periodDuration);
      manifest.addPeriod(/* startTime= */ 0, (period) => {
        // Variant in English, res 426x182
        period.addVariant(idCount++, (variant) => {
          variant.language = 'en';
          variant.addVideo(idCount++, (stream) => {
            stream.size(426, 182);
            addStreamInfo(stream, variant, data, ContentType.VIDEO, 'sintel');
          });
          variant.addAudio(idCount++, (stream) => {
            stream.language = 'en';
            addStreamInfo(stream, variant, data, ContentType.AUDIO, 'sintel');
          });
        });

        // Same language, different resolution
        period.addVariant(idCount++, (variant) => {
          variant.language = 'en';
          variant.addVideo(idCount++, (stream) => {
            stream.size(640, 272);
            addStreamInfo(stream, variant, data, ContentType.VIDEO, 'sintel');
          });
          variant.addAudio(idCount++, (stream) => {
            stream.language = 'en';
            addStreamInfo(stream, variant, data, ContentType.AUDIO, 'sintel');
          });
        });

        // Same resolution, different language
        period.addVariant(idCount++, (variant) => {
          variant.language = 'es';
          variant.addVideo(idCount++, (stream) => {
            stream.size(640, 272);
            addStreamInfo(stream, variant, data, ContentType.VIDEO, 'sintel');
          });
          variant.addAudio(idCount++, (stream) => {
            stream.language = 'es';
            addStreamInfo(stream, variant, data, ContentType.AUDIO, 'sintel');
          });
        });

        period.addTextStream(idCount++, (stream) => {
          stream.language = 'zh';
          stream.mime = data.text.mimeType;
          stream.codecs = data.text.codecs;
          stream.textStream(getAbsoluteUri(data));
        });

        period.addTextStream(idCount++, (stream) => {
          stream.language = 'fr';
          stream.mime = data.text.mimeType;
          stream.codecs = data.text.codecs;
          stream.textStream(getAbsoluteUri(data));
        });
      });
    }, shaka);
    MANIFESTS['sintel_multi_lingual_multi_res' + suffix] = manifest;

    return Promise.all(promises);
  }
};


/** @const {!Object.<string, shaka.extern.Manifest>} */
shaka.test.TestScheme.MANIFESTS = {};


/** @const {!Object.<string, !Object.<string, !shaka.test.IStreamGenerator>>} */
shaka.test.TestScheme.GENERATORS = {};


// TODO: The values in mdhdOffset and tfdtOffset are specific to the segments
// in each test scheme.  These are byte offsets into these segments where
// certain boxes can be found and easily manipulated.  This predates our more
// general MP4 box parser.  We could eliminate these hard-coded offsets and use
// our box parser to find the boxes at runtime after we load the segments.

/** @const */
shaka.test.TestScheme.DATA = {
  'sintel': {
    video: {
      initSegmentUri: '/base/test/test/assets/sintel-video-init.mp4',
      mdhdOffset: 0x1ba,
      segmentUri: '/base/test/test/assets/sintel-video-segment.mp4',
      tfdtOffset: 0x38,
      segmentDuration: 10,
      mimeType: 'video/mp4',
      codecs: 'avc1.42c01e',
    },
    audio: {
      initSegmentUri: '/base/test/test/assets/sintel-audio-init.mp4',
      mdhdOffset: 0x1b6,
      segmentUri: '/base/test/test/assets/sintel-audio-segment.mp4',
      tfdtOffset: 0x3c,
      segmentDuration: 10.005,
      mimeType: 'audio/mp4',
      codecs: 'mp4a.40.2',
    },
    text: {
      uri: '/base/test/test/assets/text-clip.vtt',
      mimeType: 'text/vtt',
    },
    duration: 30,
  },

  // Like 'sintel', but much longer to test buffering and seeking.
  'sintel_long': {
    video: {
      initSegmentUri: '/base/test/test/assets/sintel-video-init.mp4',
      mdhdOffset: 0x1ba,
      segmentUri: '/base/test/test/assets/sintel-video-segment.mp4',
      tfdtOffset: 0x38,
      segmentDuration: 10,
      mimeType: 'video/mp4',
      codecs: 'avc1.42c01e',
    },
    audio: {
      initSegmentUri: '/base/test/test/assets/sintel-audio-init.mp4',
      mdhdOffset: 0x1b6,
      segmentUri: '/base/test/test/assets/sintel-audio-segment.mp4',
      tfdtOffset: 0x3c,
      segmentDuration: 10.005,
      mimeType: 'audio/mp4',
      codecs: 'mp4a.40.2',
    },
    duration: 300,
  },

  // Like 'sintel' above, but with a non-zero period start time.
  // This helps expose edge cases around startup and live streams.
  'sintel_start_at_3': {
    periodStart: 3,
    video: {
      initSegmentUri: '/base/test/test/assets/sintel-video-init.mp4',
      mdhdOffset: 0x1ba,
      segmentUri: '/base/test/test/assets/sintel-video-segment.mp4',
      tfdtOffset: 0x38,
      segmentDuration: 10,
      mimeType: 'video/mp4',
      codecs: 'avc1.42c01e',
    },
    audio: {
      initSegmentUri: '/base/test/test/assets/sintel-audio-init.mp4',
      mdhdOffset: 0x1b6,
      segmentUri: '/base/test/test/assets/sintel-audio-segment.mp4',
      tfdtOffset: 0x3c,
      segmentDuration: 10.005,
      mimeType: 'audio/mp4',
      codecs: 'mp4a.40.2',
    },
    text: {
      uri: '/base/test/test/assets/text-clip.vtt',
      mimeType: 'text/vtt',
    },
    duration: 30,
  },

  // Like 'sintel' above, but with languages and delayed setup.
  // These extra features help expose some edge cases.
  'sintel_realistic': {
    video: {
      initSegmentUri: '/base/test/test/assets/sintel-video-init.mp4',
      mdhdOffset: 0x1ba,
      segmentUri: '/base/test/test/assets/sintel-video-segment.mp4',
      tfdtOffset: 0x38,
      segmentDuration: 10,
      mimeType: 'video/mp4',
      codecs: 'avc1.42c01e',
      delaySetup: true,  // Necessary to repro #1696
    },
    audio: {
      initSegmentUri: '/base/test/test/assets/sintel-audio-init.mp4',
      mdhdOffset: 0x1b6,
      segmentUri: '/base/test/test/assets/sintel-audio-segment.mp4',
      tfdtOffset: 0x3c,
      segmentDuration: 10.005,
      mimeType: 'audio/mp4',
      codecs: 'mp4a.40.2',
      language: 'uk',  // Necessary to repro #1696
      delaySetup: true,  // Necessary to repro #1696
    },
    text: {
      uri: '/base/test/test/assets/text-clip.vtt',
      mimeType: 'text/vtt',
      language: 'fa',  // Necessary to repro #1696
    },
    duration: 30,
  },

  // 'sintel_short_periods' : Generated by createManifests().
  // 'sintel_multi_lingual_multi_res' : Generated by createManifests().

  'sintel_audio_only': {
    audio: {
      initSegmentUri: '/base/test/test/assets/sintel-audio-init.mp4',
      mdhdOffset: 0x1b6,
      segmentUri: '/base/test/test/assets/sintel-audio-segment.mp4',
      tfdtOffset: 0x3c,
      segmentDuration: 10.005,
      mimeType: 'audio/mp4',
      codecs: 'mp4a.40.2',
    },
    duration: 30,
  },

  'sintel_no_text': {
    video: {
      initSegmentUri: '/base/test/test/assets/sintel-video-init.mp4',
      mdhdOffset: 0x1ba,
      segmentUri: '/base/test/test/assets/sintel-video-segment.mp4',
      tfdtOffset: 0x38,
      segmentDuration: 10,
      mimeType: 'video/mp4',
      codecs: 'avc1.42c01e',
    },
    audio: {
      initSegmentUri: '/base/test/test/assets/sintel-audio-init.mp4',
      mdhdOffset: 0x1b6,
      segmentUri: '/base/test/test/assets/sintel-audio-segment.mp4',
      tfdtOffset: 0x3c,
      segmentDuration: 10.005,
      mimeType: 'audio/mp4',
      codecs: 'mp4a.40.2',
    },
    duration: 30,
  },

  'sintel-enc': {
    video: {
      initSegmentUri: '/base/test/test/assets/encrypted-sintel-video-init.mp4',
      mdhdOffset: 0x1ba,
      segmentUri: '/base/test/test/assets/encrypted-sintel-video-segment.mp4',
      tfdtOffset: 0x38,
      segmentDuration: 10,
      mimeType: 'video/mp4',
      codecs: 'avc1.42c01e',
      initData:
          'AAAAc3Bzc2gAAAAA7e+LqXnWSs6jyCfc1R0h7QAAAFMIARIQaKzMBtasU1iYiGwe' +
          'MeC/ORIQPgfUgWF6UGqdIm5yx/XJtxIQRC1g0g+tXe6lxz4ABfHDnhoNd2lkZXZp' +
          'bmVfdGVzdCIIzsW/9dxA3ckyAA==',
    },
    audio: {
      initSegmentUri: '/base/test/test/assets/encrypted-sintel-audio-init.mp4',
      mdhdOffset: 0x1b6,
      segmentUri: '/base/test/test/assets/encrypted-sintel-audio-segment.mp4',
      tfdtOffset: 0x3c,
      segmentDuration: 10.005,
      mimeType: 'audio/mp4',
      codecs: 'mp4a.40.2',
      initData:
          'AAAAc3Bzc2gAAAAA7e+LqXnWSs6jyCfc1R0h7QAAAFMIARIQaKzMBtasU1iYiGwe' +
          'MeC/ORIQPgfUgWF6UGqdIm5yx/XJtxIQRC1g0g+tXe6lxz4ABfHDnhoNd2lkZXZp' +
          'bmVfdGVzdCIIzsW/9dxA3ckyAA==',
    },
    text: {
      uri: '/base/test/test/assets/text-clip.vtt',
      mimeType: 'text/vtt',
    },
    licenseServers: {
      'com.widevine.alpha': 'https://cwip-shaka-proxy.appspot.com/no_auth',
    },
    duration: 30,
  },

  'multidrm': {
    video: {
      initSegmentUri: '/base/test/test/assets/multidrm-video-init.mp4',
      mdhdOffset: 0x1d1,
      segmentUri: '/base/test/test/assets/multidrm-video-segment.mp4',
      tfdtOffset: 0x78,
      segmentDuration: 4,
      mimeType: 'video/mp4',
      codecs: 'avc1.64001e',
      initData:
          'AAAANHBzc2gAAAAA7e+LqXnWSs6jyCfc1R0h7QAAABQIARIQblodJidXR9eARuq' +
          'l0dNLWg==',
    },
    audio: {
      initSegmentUri: '/base/test/test/assets/multidrm-audio-init.mp4',
      mdhdOffset: 0x192,
      segmentUri: '/base/test/test/assets/multidrm-audio-segment.mp4',
      tfdtOffset: 0x7c,
      segmentDuration: 4,
      mimeType: 'audio/mp4',
      codecs: 'mp4a.40.2',
      initData:
          'AAAANHBzc2gAAAAA7e+LqXnWSs6jyCfc1R0h7QAAABQIARIQblodJidXR9eARuq' +
          'l0dNLWg==',
    },
    text: {
      uri: '/base/test/test/assets/text-clip.vtt',
      mimeType: 'text/vtt',
    },
    licenseServers: {
      'com.widevine.alpha':
          'https://drm-widevine-licensing.axtest.net/AcquireLicense',
      'com.microsoft.playready':
          'https://drm-playready-licensing.axtest.net/AcquireLicense',
    },
    licenseRequestHeaders: {
      'X-AxDRM-Message':
          'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ2ZXJzaW9uIjoxLCJjb21fa2V5' +
          'X2lkIjoiNjllNTQwODgtZTllMC00NTMwLThjMWEtMWViNmRjZDBkMTRlIiwibWVzc' +
          '2FnZSI6eyJ0eXBlIjoiZW50aXRsZW1lbnRfbWVzc2FnZSIsImtleXMiOlt7ImlkIj' +
          'oiNmU1YTFkMjYtMjc1Ny00N2Q3LTgwNDYtZWFhNWQxZDM0YjVhIn1dfX0.yF7PflO' +
          'Pv9qHnu3ZWJNZ12jgkqTabmwXbDWk_47tLNE',
    },
    duration: 30,
  },

  'multidrm_no_init_data': {
    video: {
      initSegmentUri: '/base/test/test/assets/multidrm-video-init.mp4',
      mdhdOffset: 0x1d1,
      segmentUri: '/base/test/test/assets/multidrm-video-segment.mp4',
      tfdtOffset: 0x78,
      segmentDuration: 4,
      mimeType: 'video/mp4',
      codecs: 'avc1.64001e',
    },
    audio: {
      initSegmentUri: '/base/test/test/assets/multidrm-audio-init.mp4',
      mdhdOffset: 0x192,
      segmentUri: '/base/test/test/assets/multidrm-audio-segment.mp4',
      tfdtOffset: 0x7c,
      segmentDuration: 4,
      mimeType: 'audio/mp4',
      codecs: 'mp4a.40.2',
    },
    licenseServers: {
      'com.widevine.alpha':
          'https://drm-widevine-licensing.axtest.net/AcquireLicense',
      'com.microsoft.playready':
          'https://drm-playready-licensing.axtest.net/AcquireLicense',
    },
    licenseRequestHeaders: {
      'X-AxDRM-Message':
          'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ2ZXJzaW9uIjoxLCJjb21fa2V5' +
          'X2lkIjoiNjllNTQwODgtZTllMC00NTMwLThjMWEtMWViNmRjZDBkMTRlIiwibWVzc' +
          '2FnZSI6eyJ0eXBlIjoiZW50aXRsZW1lbnRfbWVzc2FnZSIsImtleXMiOlt7ImlkIj' +
          'oiNmU1YTFkMjYtMjc1Ny00N2Q3LTgwNDYtZWFhNWQxZDM0YjVhIn1dfX0.yF7PflO' +
          'Pv9qHnu3ZWJNZ12jgkqTabmwXbDWk_47tLNE',
    },
    duration: 30,
  },

  'cea-708_ts': {
    video: {
      segmentUri: '/base/test/test/assets/captions-test.ts',
      mimeType: 'video/mp2t',
      codecs: 'avc1.64001e',
    },
    text: {
      mimeType: 'application/cea-608',
    },
    duration: 30,
  },

  'cea-708_mp4': {
    video: {
      initSegmentUri: '/base/test/test/assets/cea-init.mp4',
      mdhdOffset: 0x100,
      segmentUri: '/base/test/test/assets/cea-segment.mp4',
      tfdtOffset: 0x48,
      segmentDuration: 2,
      mimeType: 'video/mp4',
      codecs: 'avc1.64001e',
      closedCaptions: new Map([['CC1', 'en']]),
    },
    duration: 30,
  },
};


beforeAll(async () => {
  await shaka.test.TestScheme.createManifests(shaka, '');
});


/**
 * @implements {shaka.extern.ManifestParser}
 */
shaka.test.TestScheme.ManifestParser = class {
  /** @override */
  configure(config) {}

  /** @override */
  start(uri, playerInterface) {
    const re = /^test:([^/]+)$/;
    const manifestParts = re.exec(uri);
    if (!manifestParts) {
      // Use expect so the URI is printed on errors.
      expect(uri).toMatch(re);
      throw new Error('Malformed uri!');
    }

    const manifest = shaka.test.TestScheme.MANIFESTS[manifestParts[1]];
    expect(manifest).toBeTruthy();
    if (!manifest) {
      throw new Error('Unknown manifest!');
    }

    // Invoke filtering interfaces similar to how a real parser would.
    // This makes sure the filtering functions are covered implicitly by
    // tests. This covers regression
    // https://github.com/google/shaka-player/issues/988
    playerInterface.filterAllPeriods(manifest.periods);
    for (const period of manifest.periods) {
      playerInterface.filterNewPeriod(period);
    }

    return Promise.resolve(manifest);
  }

  /** @override */
  stop() {
    return Promise.resolve();
  }

  /** @override */
  update() {}

  /** @override */
  onExpirationUpdated() {}
};


shaka.net.NetworkingEngine.registerScheme('test', shaka.test.TestScheme.plugin);
shaka.media.ManifestParser.registerParserByMime(
    'application/x-test-manifest', shaka.test.TestScheme.ManifestParser);
