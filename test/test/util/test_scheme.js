/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

goog.provide('shaka.test.TestScheme');


/**
 * A plugin that handles fake network requests.  This will serve both segments
 * and manifests that will point to a fake manifest generator.
 *
 * @param {string} uri
 * @param {shaka.extern.Request} request
 * @param {shaka.net.NetworkingEngine.RequestType=} requestType
 * @return {!shaka.extern.IAbortableOperation.<shaka.extern.Response>}
 */
shaka.test.TestScheme = function(uri, request, requestType) {
  let manifestParts = /^test:([^/]+)$/.exec(uri);
  if (manifestParts) {
    /** @type {shaka.extern.Response} */
    let response = {
      uri: uri,
      originalUri: uri,
      data: new ArrayBuffer(0),
      headers: {'content-type': 'application/x-test-manifest'},
    };
    return shaka.util.AbortableOperation.completed(response);
  }

  let malformed = new shaka.util.Error(
      shaka.util.Error.Severity.CRITICAL,
      shaka.util.Error.Category.NETWORK,
      shaka.util.Error.Code.MALFORMED_TEST_URI);

  let re = /^test:([^/]+)\/(video|audio)\/(init|[0-9]+)$/;
  let segmentParts = re.exec(uri);
  if (!segmentParts) {
    // Use expect so the URI is printed on errors.
    expect(uri).toMatch(re);
    return shaka.util.AbortableOperation.failed(malformed);
  }

  let name = segmentParts[1];
  let type = segmentParts[2];

  let generators = shaka.test.TestScheme.GENERATORS[name];
  expect(generators).toBeTruthy();
  if (!generators) {
    return shaka.util.AbortableOperation.failed(malformed);
  }

  let generator = generators[type];
  expect(generator).toBeTruthy();
  if (!generator) {
    return shaka.util.AbortableOperation.failed(malformed);
  }

  let responseData;
  if (segmentParts[3] === 'init') {
    responseData = generator.getInitSegment(0);
  } else {
    let index = Number(segmentParts[3]);
    responseData = generator.getSegment(index + 1, 0, 0);
  }

  /** @type {shaka.extern.Response} */
  const ret = {uri: uri, originalUri: uri, data: responseData, headers: {}};
  return shaka.util.AbortableOperation.completed(ret);
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
      presentationTimeOffset: 0,
      mimeType: 'video/mp4',
      codecs: 'avc1.42c01e',
    },
    audio: {
      initSegmentUri: '/base/test/test/assets/sintel-audio-init.mp4',
      mdhdOffset: 0x1b6,
      segmentUri: '/base/test/test/assets/sintel-audio-segment.mp4',
      tfdtOffset: 0x3c,
      segmentDuration: 10.005,
      presentationTimeOffset: 0,
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
      presentationTimeOffset: 0,
      mimeType: 'video/mp4',
      codecs: 'avc1.42c01e',
    },
    audio: {
      initSegmentUri: '/base/test/test/assets/sintel-audio-init.mp4',
      mdhdOffset: 0x1b6,
      segmentUri: '/base/test/test/assets/sintel-audio-segment.mp4',
      tfdtOffset: 0x3c,
      segmentDuration: 10.005,
      presentationTimeOffset: 0,
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
      presentationTimeOffset: 0,
      mimeType: 'video/mp4',
      codecs: 'avc1.42c01e',
    },
    audio: {
      initSegmentUri: '/base/test/test/assets/sintel-audio-init.mp4',
      mdhdOffset: 0x1b6,
      segmentUri: '/base/test/test/assets/sintel-audio-segment.mp4',
      tfdtOffset: 0x3c,
      segmentDuration: 10.005,
      presentationTimeOffset: 0,
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
      presentationTimeOffset: 0,
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
      presentationTimeOffset: 0,
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
      presentationTimeOffset: 0,
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
      presentationTimeOffset: 0,
      mimeType: 'video/mp4',
      codecs: 'avc1.42c01e',
    },
    audio: {
      initSegmentUri: '/base/test/test/assets/sintel-audio-init.mp4',
      mdhdOffset: 0x1b6,
      segmentUri: '/base/test/test/assets/sintel-audio-segment.mp4',
      tfdtOffset: 0x3c,
      segmentDuration: 10.005,
      presentationTimeOffset: 0,
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
      presentationTimeOffset: 0,
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
      presentationTimeOffset: 0,
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
      presentationTimeOffset: 0,
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
      presentationTimeOffset: 0,
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
      presentationTimeOffset: 0,
      mimeType: 'video/mp4',
      codecs: 'avc1.64001e',
    },
    audio: {
      initSegmentUri: '/base/test/test/assets/multidrm-audio-init.mp4',
      mdhdOffset: 0x192,
      segmentUri: '/base/test/test/assets/multidrm-audio-segment.mp4',
      tfdtOffset: 0x7c,
      segmentDuration: 4,
      presentationTimeOffset: 0,
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
      presentationTimeOffset: 0,
      mimeType: 'video/mp4',
      codecs: 'avc1.64001e',
      closedCaptions: new Map([['CC1', 'en']]),
    },
    duration: 30,
  },
};


/**
 * Sets up the networking callbacks required to play the given asset.
 *
 * @param {!shaka.Player} player
 * @param {string} name
 */
shaka.test.TestScheme.setupPlayer = function(player, name) {
  let asset = shaka.test.TestScheme.DATA[name];
  goog.asserts.assert(asset, 'Unknown asset');
  if (!asset) return;
  if (asset.licenseRequestHeaders) {
    let netEngine = player.getNetworkingEngine();
    netEngine.registerRequestFilter(
        function(type, request) {
          if (type != shaka.net.NetworkingEngine.RequestType.LICENSE) return;

          for (let header in asset.licenseRequestHeaders) {
            request.headers[header] = asset.licenseRequestHeaders[header];
          }
        });
  }
  if (asset.licenseServers) {
    let config = {drm: {servers: asset.licenseServers}};
    player.configure(config);
  }
};


/**
 * Creates the manifests and generators.
 * @param {*} shaka
 * @param {string} suffix
 * @return {!Promise}
 */
shaka.test.TestScheme.createManifests = function(shaka, suffix) {
  /** @type {?} */
  let windowShaka = window['shaka'];

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
        metadata.tfdtOffset, metadata.segmentDuration,
        metadata.presentationTimeOffset);
  }

  /**
   * Not for simulating non-segmented text streams.
   *
   * @param {shaka.test.ManifestGenerator} manifestGenerator
   * @param {Object} data
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @param {string} name
   */
  function addStreamInfo(manifestGenerator, data, contentType, name) {
    manifestGenerator
      .presentationTimeOffset(data[contentType].presentationTimeOffset)
      .mime(data[contentType].mimeType, data[contentType].codecs)
      .initSegmentReference(
            ['test:' + name + '/' + contentType + '/init'], 0, null)
      .useSegmentTemplate('test:' + name + '/' + contentType + '/%d',
                          data[contentType].segmentDuration)
      .closedCaptions(data[contentType].closedCaptions);

    if (data[contentType].language) {
      manifestGenerator.language(data[contentType].language);
    }

    if (data[contentType].delaySetup) {
      manifestGenerator.delayCreateSegmentIndex();
    }

    if (data.licenseServers) {
      for (let keySystem in data.licenseServers) {
        manifestGenerator.addDrmInfo(keySystem)
            .licenseServerUri(data.licenseServers[keySystem]);
        if (data[contentType].initData) {
          manifestGenerator.addCencInitData(data[contentType].initData);
        }
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

  let async = [];
  // Include 'window' to use uncompiled version version of the library.
  const DATA = windowShaka.test.TestScheme.DATA;
  const GENERATORS = windowShaka.test.TestScheme.GENERATORS;
  const MANIFESTS = windowShaka.test.TestScheme.MANIFESTS;
  const ContentType = windowShaka.util.ManifestParserUtils.ContentType;

  for (let name in DATA) {
    GENERATORS[name + suffix] = GENERATORS[name + suffix] || {};
    let data = DATA[name];
    [ContentType.VIDEO, ContentType.AUDIO].forEach(function(type) {
      if (data[type]) {
        let streamGen = createStreamGenerator(data[type]);
        GENERATORS[name + suffix][type] = streamGen;
        async.push(streamGen.init());
      }
    });

    let gen = new windowShaka.test.ManifestGenerator(shaka)
        .setPresentationDuration(data.duration)
        .addPeriod(/* startTime= */ data.periodStart || 0)
        .addVariant(0);

    if (data[ContentType.VIDEO]) {
      gen.addVideo(1);
      addStreamInfo(gen, data, ContentType.VIDEO, name);
    }
    if (data[ContentType.AUDIO]) {
      gen.addAudio(2);
      addStreamInfo(gen, data, ContentType.AUDIO, name);
    }

    if (data.text) {
      gen.addTextStream(3)
            .mime(data.text.mimeType, data.text.codecs)
            .textStream(getAbsoluteUri(data));

      if (data.text.language) {
        gen.language(data.text.language);
      }
    }

    MANIFESTS[name + suffix] = gen.build();
  }

  // Custom generators:

  const data = DATA['sintel'];
  const periodDuration = 10;

  // Multi-period
  const numPeriods = 10;
  let gen = new windowShaka.test.ManifestGenerator(shaka)
      .setPresentationDuration(periodDuration * numPeriods);

  for (let i = 0; i < numPeriods; i++) {
    gen.addPeriod(/* startTime= */ periodDuration * i);

    gen.addVariant(2 * i).language('en');
    gen.addVideo(4 * i);
    addStreamInfo(gen, data, ContentType.VIDEO, 'sintel');
    gen.addAudio(4 * i + 1);
    addStreamInfo(gen, data, ContentType.AUDIO, 'sintel');

    gen.addVariant(2 * i + 1).language('es');
    gen.addVideo(4 * i + 2);
    addStreamInfo(gen, data, ContentType.VIDEO, 'sintel');
    gen.addAudio(4 * i + 3);
    addStreamInfo(gen, data, ContentType.AUDIO, 'sintel');
  }

  MANIFESTS['sintel_short_periods' + suffix] = gen.build();

  // Multi-stream. Different languages and resolutions.
  let idCount = 1;
  gen = new windowShaka.test.ManifestGenerator(shaka)
      .setPresentationDuration(periodDuration);
  gen.addPeriod(/* startTime= */ 0);

  // Variant in English, res 426x182
  gen.addVariant(idCount++).language('en');
  gen.addVideo(idCount++).size(426, 182);
  addStreamInfo(gen, data, ContentType.VIDEO, 'sintel');
  gen.addAudio(idCount++).language('en');
  addStreamInfo(gen, data, ContentType.AUDIO, 'sintel');

  // Same language, different resolution
  gen.addVariant(idCount++).language('en');
  gen.addVideo(idCount++).size(640, 272);
  addStreamInfo(gen, data, ContentType.VIDEO, 'sintel');
  gen.addAudio(idCount++).language('en');
  addStreamInfo(gen, data, ContentType.AUDIO, 'sintel');

  // Same resolution, different language
  gen.addVariant(idCount++).language('es');
  gen.addVideo(idCount++).size(640, 272);
  addStreamInfo(gen, data, ContentType.VIDEO, 'sintel');
  gen.addAudio(idCount++).language('es');
  addStreamInfo(gen, data, ContentType.AUDIO, 'sintel');

  gen.addTextStream(idCount++)
     .mime(data.text.mimeType, data.text.codecs)
     .textStream(getAbsoluteUri(data))
     .language('zh');

  gen.addTextStream(idCount++)
     .mime(data.text.mimeType, data.text.codecs)
     .textStream(getAbsoluteUri(data))
     .language('fr');

  MANIFESTS['sintel_multi_lingual_multi_res' + suffix] = gen.build();

  return Promise.all(async);
};


beforeAll(function(done) {
  shaka.test.TestScheme.createManifests(shaka, '').catch(fail).then(done);
});


/**
 * @constructor
 * @struct
 * @implements {shaka.extern.ManifestParser}
 */
shaka.test.TestScheme.ManifestParser = function() {};


/** @override */
shaka.test.TestScheme.ManifestParser.prototype.configure = function(config) {};


/** @override */
shaka.test.TestScheme.ManifestParser.prototype.start =
    function(uri, playerInterface) {
  let re = /^test:([^/]+)$/;
  let manifestParts = re.exec(uri);
  if (!manifestParts) {
    // Use expect so the URI is printed on errors.
    expect(uri).toMatch(re);
    return Promise.reject();
  }

  let manifest = shaka.test.TestScheme.MANIFESTS[manifestParts[1]];
  expect(manifest).toBeTruthy();
  if (!manifest) return Promise.reject();

  // Invoke filtering interfaces similar to how a real parser would.
  // This makes sure the filtering functions are covered implicitly by tests.
  // This covers regression https://github.com/google/shaka-player/issues/988
  playerInterface.filterAllPeriods(manifest.periods);
  manifest.periods.forEach(function(period) {
    playerInterface.filterNewPeriod(period);
  });

  return Promise.resolve(manifest);
};


/** @override */
shaka.test.TestScheme.ManifestParser.prototype.stop = function() {
  return Promise.resolve();
};


/** @override */
shaka.test.TestScheme.ManifestParser.prototype.update = function() {};


/** @override */
shaka.test.TestScheme.ManifestParser.prototype.onExpirationUpdated =
    function() {};


shaka.net.NetworkingEngine.registerScheme('test', shaka.test.TestScheme);
shaka.media.ManifestParser.registerParserByMime(
    'application/x-test-manifest', shaka.test.TestScheme.ManifestParser);

