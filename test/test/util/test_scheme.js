/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @typedef {{
 *   initSegmentUri: string,
 *   mdhdOffset: number,
 *   segmentUri: string,
 *   tfdtOffset: number,
 *   segmentDuration: number,
 *   mimeType: string,
 *   codecs: string,
 *   delaySetup: (boolean|undefined),
 *   language: (string|undefined),
 *   closedCaptions: (!Map.<string, string>|undefined),
 *   initData: (string|undefined)
 * }}
 */
let AVMetadataType;

/**
 * @typedef {{
 *   uri: string,
 *   mimeType: string,
 *   codecs: (string|undefined),
 *   language: (string|undefined)
 * }}
 */
let TextMetadataType;

/**
 * @typedef {{
 *   delaySetup: (boolean|undefined),
 *   closedCaptions: (!Map.<string, string>|undefined),
 *   initData: (string|undefined),
 *   language: (string|undefined)
 * }}
 */
let ExtraMetadataType;

/**
 * @typedef {{
 *   video: AVMetadataType,
 *   audio: AVMetadataType,
 *   text: TextMetadataType,
 *   videoResolutions: (!Array.<!Array.<number>>|undefined),
 *   audioLanguages: (!Array.<string>|undefined),
 *   textLanguages: (!Array.<string>|undefined),
 *   duration: number,
 *   licenseServers: (!Object.<string, string>|undefined),
 *   licenseRequestHeaders: (!Object.<string, string>|undefined),
 *   customizeStream: (function(shaka.test.ManifestGenerator.Stream)|undefined),
 *   sequenceMode: (boolean|undefined)
 * }}
 */
let MetadataType;


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
      responseData = generator.getSegment(index, 0);
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
   * @param {shakaNamespaceType} compiledShaka
   * @param {string} suffix
   * @return {!Promise}
   */
  static createManifests(compiledShaka, suffix) {
    /**
     * @param {AVMetadataType} metadata
     * @return {!shaka.test.IStreamGenerator}
     */
    function createStreamGenerator(metadata) {
      if (metadata.segmentUri.includes('.ts')) {
        return new shaka.test.TSVodStreamGenerator(
            metadata.segmentUri, metadata.segmentDuration);
      }
      if (metadata.segmentUri.includes('.aac')) {
        return new shaka.test.AACVodStreamGenerator(metadata.segmentUri);
      }
      return new shaka.test.Mp4VodStreamGenerator(
          metadata.initSegmentUri, metadata.mdhdOffset, metadata.segmentUri,
          metadata.tfdtOffset, metadata.segmentDuration);
    }

    /**
     * Not for simulating non-segmented text streams.
     *
     * @param {!shaka.test.ManifestGenerator.Stream} stream
     * @param {!shaka.test.ManifestGenerator.Variant} variant
     * @param {MetadataType} data
     * @param {shaka.util.ManifestParserUtils.ContentType} contentType
     * @param {string} name
     */
    function addStreamInfo(stream, variant, data, contentType, name) {
      const mediaQualityInfo = {
        bandwidth: 1,
        codecs: data[contentType].codecs || 'unknown',
        contentType: contentType,
        mimeType: data[contentType].mimeType,
        audioSamplingRate: null,
        frameRate: null,
        height: null,
        channelsCount: null,
        pixelAspectRatio: null,
        width: null,
      };
      stream.mimeType = data[contentType].mimeType;
      stream.codecs = data[contentType].codecs;
      stream.setInitSegmentReference(
          ['test:' + name + '/' + contentType + '/init'], 0, null,
          mediaQualityInfo);
      stream.useSegmentTemplate(
          'test:' + name + '/' + contentType + '/%d',
          data[contentType].segmentDuration);
      stream.segmentIndex.markImmutable();
      stream.closedCaptions = data[contentType].closedCaptions;

      if (data[contentType].delaySetup) {
        stream.createSegmentIndex = () => shaka.test.Util.delay(1);
      }

      if (data.licenseServers) {
        // Real content typically doesn't contain license server URLs, but if it
        // does, we use them in preference over everything else.  There is a
        // config to override that for DASH, but this test utility isn't DASH
        // and that player config wouldn't do any good for a test case.
        //
        // So, we don't put the specific license servers into the manifest
        // structure.  That should always be done in the player config instead,
        // and we have the static setupPlayer() method above to do that in
        // tests.
        //
        // Instead, we place generic DrmInfo for all common key systems here,
        // and tests can use any of them by configuring a license server.
        const commonKeySystems = [
          'com.apple.fps.1_0',
          'com.microsoft.playready',
          'com.widevine.alpha',
        ];
        for (const keySystem of commonKeySystems) {
          stream.encrypted = true;
          stream.addDrmInfo(keySystem, (drmInfo) => {
            if (data[contentType].initData) {
              drmInfo.addCencInitData(data[contentType].initData);
            }
          });
        }
      }

      if (data.customizeStream) {
        data.customizeStream(stream);
      }
    }

    /**
     * @param {MetadataType} data
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
    const DATA = shaka.test.TestScheme.DATA;
    const GENERATORS = shaka.test.TestScheme.GENERATORS;
    const MANIFESTS = shaka.test.TestScheme.MANIFESTS;
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

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

      let nextId = 0;

      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.presentationTimeline.setDuration(data.duration);
        manifest.sequenceMode = data.sequenceMode || false;

        const videoResolutions = data.videoResolutions || [undefined];
        const audioLanguages = data.audioLanguages ||
            (data.audio && [data.audio.language]) || [undefined];

        if (data.video && data.audio) {
          const resMap = new Map();
          const langMap = new Map();
          for (const res of videoResolutions) {
            for (const lang of audioLanguages) {
              manifest.addVariant(nextId++, (variant) => {
                if (resMap.has(res)) {
                  variant.addExistingStream(resMap.get(res));
                } else {
                  resMap.set(res, nextId);
                  variant.addVideo(nextId++, (stream) => {
                    addStreamInfo(
                        stream, variant, data, ContentType.VIDEO, name);
                    if (res) {
                      stream.size(res[0], res[1]);
                    }
                  });
                }

                if (langMap.has(lang)) {
                  variant.addExistingStream(langMap.get(lang));
                } else {
                  langMap.set(lang, nextId);
                  variant.addAudio(nextId++, (stream) => {
                    addStreamInfo(
                        stream, variant, data, ContentType.AUDIO, name);
                    if (lang) {
                      stream.language = lang;
                    }
                  });
                }

                if (lang) {
                  variant.language = lang;
                }
              });
            }
          }
        } else if (data.video) {
          for (const res of videoResolutions) {
            manifest.addVariant(nextId++, (variant) => {
              variant.addVideo(nextId++, (stream) => {
                addStreamInfo(stream, variant, data, ContentType.VIDEO, name);
                if (res) {
                  stream.size(res[0], res[1]);
                }
              });
            });
          }
        } else if (data.audio) {
          for (const lang of audioLanguages) {
            manifest.addVariant(nextId++, (variant) => {
              variant.addAudio(nextId++, (stream) => {
                addStreamInfo(stream, variant, data, ContentType.AUDIO, name);
                if (lang) {
                  variant.language = lang;
                  stream.language = lang;
                }
              });
            });
          }
        }

        if (data.text) {
          const textLanguages = data.textLanguages || [data.text.language];

          for (const lang of textLanguages) {
            manifest.addTextStream(nextId++, (stream) => {
              stream.mimeType = data.text.mimeType;
              stream.codecs = data.text.codecs || '';
              stream.textStream(getAbsoluteUri(data));

              if (lang) {
                stream.language = lang;
              }
            });
          }
        }
      }, compiledShaka);

      MANIFESTS[name + suffix] = manifest;
    }

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

/** @type {AVMetadataType} */
const sintelVideoSegment = {
  initSegmentUri: '/base/test/test/assets/sintel-video-init.mp4',
  mdhdOffset: 0x1ba,
  segmentUri: '/base/test/test/assets/sintel-video-segment.mp4',
  tfdtOffset: 0x38,
  segmentDuration: 10,
  mimeType: 'video/mp4',
  codecs: 'avc1.42c01e',
};

/** @type {AVMetadataType} */
const sintelAudioSegment = {
  initSegmentUri: '/base/test/test/assets/sintel-audio-init.mp4',
  mdhdOffset: 0x1b6,
  segmentUri: '/base/test/test/assets/sintel-audio-segment.mp4',
  tfdtOffset: 0x3c,
  segmentDuration: 10,
  mimeType: 'audio/mp4',
  codecs: 'mp4a.40.2',
};

/** @type {AVMetadataType} */
const sintelEncryptedVideo = {
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
};

/** @type {AVMetadataType} */
const sintelEncryptedAudio = {
  initSegmentUri: '/base/test/test/assets/encrypted-sintel-audio-init.mp4',
  mdhdOffset: 0x1b6,
  segmentUri: '/base/test/test/assets/encrypted-sintel-audio-segment.mp4',
  tfdtOffset: 0x3c,
  segmentDuration: 10,
  mimeType: 'audio/mp4',
  codecs: 'mp4a.40.2',
  initData:
      'AAAAc3Bzc2gAAAAA7e+LqXnWSs6jyCfc1R0h7QAAAFMIARIQaKzMBtasU1iYiGwe' +
      'MeC/ORIQPgfUgWF6UGqdIm5yx/XJtxIQRC1g0g+tXe6lxz4ABfHDnhoNd2lkZXZp' +
      'bmVfdGVzdCIIzsW/9dxA3ckyAA==',
};

/** @type {!Object.<string, string>} */
const widevineDrmServers = {
  'com.widevine.alpha': 'https://cwip-shaka-proxy.appspot.com/no_auth',
};

/** @type {AVMetadataType} */
const axinomMultiDrmVideoSegment = {
  // Taken from Axinom's v6 test vector.
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
};

/** @type {AVMetadataType} */
const axinomMultiDrmAudioSegment = {
  // Taken from Axinom's v6 test vector.
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
};

/** @type {!Object.<string, string>} */
const axinomDrmServers = {
  // NOTE: These are not Axinom's actual servers.  These are test servers for
  // Widevine and PlayReady that let us specify the known key IDs and keys for
  // Axinom's v6 test vectors.  Axinom's own servers started returning 403
  // errors for these older test vectors, and we were forced to switch to
  // something stable and independent.
  'com.widevine.alpha':
      'https://cwip-shaka-proxy.appspot.com/specific_key?blodJidXR9eARuql0dNLWg=GX8m9XLIZNIzizrl0RTqnA',
  'com.microsoft.playready':
      'https://test.playready.microsoft.com/service/rightsmanager.asmx?cfg=(kid:6e5a1d26-2757-47d7-8046-eaa5d1d34b5a,contentkey:GX8m9XLIZNIzizrl0RTqnA==,sl:150)',
};

/** @type {TextMetadataType} */
const vttSegment = {
  uri: '/base/test/test/assets/text-clip.vtt',
  mimeType: 'text/vtt',
};

/**
 * @template T
 * @param {T} base A TextMetadataType or AVMetadataType object.
 * @param {ExtraMetadataType} overrides Fields to override in the base.
 * @return {T}
 */
function inherit(base, overrides) {
  return Object.assign({}, base, overrides);
}

/** @const {!Object.<string, MetadataType>} */
shaka.test.TestScheme.DATA = {
  'sintel': {
    video: sintelVideoSegment,
    audio: sintelAudioSegment,
    text: vttSegment,
    duration: 30,
  },

  // Like 'sintel', but flagged as sequence mode.
  'sintel_sequence': {
    video: sintelVideoSegment,
    audio: sintelAudioSegment,
    text: vttSegment,
    duration: 30,
    sequenceMode: true,
  },

  // Like 'sintel', but much longer to test buffering and seeking.
  'sintel_long': {
    video: sintelVideoSegment,
    audio: sintelAudioSegment,
    duration: 300,
  },

  // Like 'sintel' above, but with languages and delayed setup.
  // These extra features help expose some edge cases.
  'sintel_realistic': {
    video: inherit(sintelVideoSegment, {
      delaySetup: true,  // Necessary to repro #1696
    }),
    audio: inherit(sintelAudioSegment, {
      language: 'uk',  // Necessary to repro #1696
      delaySetup: true,  // Necessary to repro #1696
    }),
    text: inherit(vttSegment, {
      language: 'fa',  // Necessary to repro #1696
    }),
    duration: 30,
  },

  'sintel_multi_lingual_multi_res': {
    video: sintelVideoSegment,
    audio: sintelAudioSegment,
    text: vttSegment,
    videoResolutions: [
      [426, 182],
      [640, 272],
    ],
    audioLanguages: ['en', 'es'],
    textLanguages: ['zh', 'fr'],
    duration: 30,
  },

  'sintel_audio_only': {
    audio: sintelAudioSegment,
    duration: 30,
  },

  'sintel_no_text': {
    video: sintelVideoSegment,
    audio: sintelAudioSegment,
    duration: 30,
  },

  // https://github.com/shaka-project/shaka-player/issues/2553
  'forced_subs_simulation': {
    audio: sintelAudioSegment,
    text: vttSegment,
    textLanguages: ['de', 'de'],  // one of these is the "forced subs" track
    duration: 30,
  },

  'sintel-enc': {
    video: sintelEncryptedVideo,
    audio: sintelEncryptedAudio,
    text: vttSegment,
    licenseServers: widevineDrmServers,
    duration: 30,
  },

  // Equivalent to what you get with HLS METHOD=SAMPLE-AES, KEYFORMAT=identity.
  // Requires explicit clear keys or license server configuration.
  'sintel-hls-clearkey': {
    video: sintelEncryptedVideo,
    audio: sintelEncryptedAudio,
    duration: 30,
    sequenceMode: true,
    customizeStream: (stream) => {
      stream.encrypted = true;
      stream.addDrmInfo('org.w3.clearkey');
    },
  },

  'multidrm': {
    video: axinomMultiDrmVideoSegment,
    audio: axinomMultiDrmAudioSegment,
    text: vttSegment,
    licenseServers: axinomDrmServers,
    duration: 30,
  },

  'multidrm_no_init_data': {
    video: inherit(axinomMultiDrmVideoSegment, {
      initData: undefined,
    }),
    audio: inherit(axinomMultiDrmAudioSegment, {
      initData: undefined,
    }),
    licenseServers: axinomDrmServers,
    duration: 30,
  },

  'cea-708_ts': {
    video: {
      segmentUri: '/base/test/test/assets/captions-test.ts',
      mimeType: 'video/mp2t',
      codecs: 'avc1.64001e',
      segmentDuration: 20,  // yes, this is accurate
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

  'id3-metadata_ts': {
    audio: {
      segmentUri: '/base/test/test/assets/id3-metadata.ts',
      mimeType: 'video/mp2t',
      codecs: 'mp4a.40.5',
      segmentDuration: 5,
    },
    duration: 4.99,
  },

  'id3-metadata_aac': {
    audio: {
      segmentUri: '/base/test/test/assets/id3-metadata.aac',
      mimeType: 'audio/aac',
      codecs: '',
      segmentDuration: 9.98458,
    },
    duration: 9.98458,
  },
};


beforeAll(async () => {
  await shaka.test.TestScheme.createManifests(shaka, '');
});

/**
 * Because our MediaCapabilities integration adds decoding info to each variant,
 * we need to be careful to reset this info on variants that are cached and
 * persist between tests and between manifest parser instances.  This ensures
 * that these unusual test variants will not have persistent decoding infos from
 * MediaCapabilities.
 *
 * For encrypted content, the decoding info contains negotiated EME information
 * which varies based on the chosen key system and whether the content will be
 * streamed or stored offline.  If one test loads the content for streaming,
 * then another test loads the same content for offline storage, the second test
 * would encounter the cached decoding info from the first test, and the
 * negotatied key system would not be set up for the correct session types.
 * This would lead to a test failure.  This sort of failure would not be seen in
 * real playback (since no supported manifest parser would ever cache variants).
 *
 * By resetting variant.decodingInfos when the fake manifest parser is stopped,
 * we ensure that each test gets a clean slate (as would happen with a real
 * parser), and the correct decodingInfos show up for each part of each test
 * case.
 *
 * @param {?shaka.extern.Manifest} manifest
 */
function resetDecodingInfos(manifest) {
  if (!manifest) {
    return;
  }

  for (const variant of manifest.variants) {
    variant.decodingInfos = [];
  }
}


/**
 * @implements {shaka.extern.ManifestParser}
 */
shaka.test.TestScheme.ManifestParser = class {
  constructor() {
    /** @private {?shaka.extern.Manifest} */
    this.manifest_ = null;
  }

  /** @override */
  configure(config) {}

  /** @return {!shaka.test.TestScheme.ManifestParser} */
  static factory() {
    return new shaka.test.TestScheme.ManifestParser();
  }

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
    this.manifest_ = manifest;

    playerInterface.makeTextStreamsForClosedCaptions(manifest);

    return Promise.resolve(manifest);
  }

  /** @override */
  stop() {
    resetDecodingInfos(this.manifest_);
    this.manifest_ = null;
    return Promise.resolve();
  }

  /** @override */
  update() {}

  /** @override */
  onExpirationUpdated() {}

  /** @override */
  onInitialVariantChosen() {}

  /** @override */
  banLocation() {}
};


shaka.net.NetworkingEngine.registerScheme('test', shaka.test.TestScheme.plugin);
shaka.media.ManifestParser.registerParserByMime(
    'application/x-test-manifest',
    shaka.test.TestScheme.ManifestParser.factory);
