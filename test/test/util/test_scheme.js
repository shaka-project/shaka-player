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
 * @param {shakaExtern.Request} request
 * @return {!Promise.<shakaExtern.Response>}
 */
shaka.test.TestScheme = function(uri, request) {
  var manifestParts = /^test:([^\/]+)$/.exec(uri);
  if (manifestParts) {
    /** @type {shakaExtern.Response} */
    var response = {
      uri: uri,
      data: new ArrayBuffer(0),
      headers: {'content-type': 'application/x-test-manifest'}
    };
    return Promise.resolve(response);
  }
  var re = /^test:([^\/]+)\/(video|audio)\/(init|[0-9]+)$/;
  var segmentParts = re.exec(uri);
  if (!segmentParts) {
    // Use expect so the URI is printed on errors.
    expect(uri).toMatch(re);
    return Promise.reject();
  }

  var name = segmentParts[1];
  var type = segmentParts[2];

  var generators = shaka.test.TestScheme.GENERATORS[name];
  expect(generators).toBeTruthy();
  if (!generators) return Promise.reject();

  var generator = generators[type];
  expect(generator).toBeTruthy();
  if (!generator) return Promise.reject();

  var responseData;
  if (segmentParts[3] === 'init') {
    responseData = generator.getInitSegment(0);
  } else {
    var index = Number(segmentParts[3]);
    responseData = generator.getSegment(index + 1, 0, 0);
  }

  var ret = {uri: uri, data: responseData, headers: {}};
  // Cannot use |Promise.resolve(ret)| because of a compiler bug.
  // https://goo.gl/4TdteC
  return Promise.resolve().then(function() { return ret; });
};


/** @const {!Object.<string, shakaExtern.Manifest>} */
shaka.test.TestScheme.MANIFESTS = {};


/** @const {!Object.<string, !Object.<string, !shaka.test.IStreamGenerator>>} */
shaka.test.TestScheme.GENERATORS = {};


/** @const */
shaka.test.TestScheme.DATA = {
  'sintel': {
    video: {
      initSegmentUri: '/base/test/test/assets/sintel-video-init.mp4',
      mvhdOffset: 0x24,
      segmentUri: '/base/test/test/assets/sintel-video-segment.mp4',
      tfdtOffset: 0x38,
      segmentDuration: 10,
      presentationTimeOffset: 0,
      mimeType: 'video/mp4',
      codecs: 'avc1.42c01e'
    },
    audio: {
      initSegmentUri: '/base/test/test/assets/sintel-audio-init.mp4',
      mvhdOffset: 0x20,
      segmentUri: '/base/test/test/assets/sintel-audio-segment.mp4',
      tfdtOffset: 0x3c,
      segmentDuration: 10.005,
      presentationTimeOffset: 0,
      mimeType: 'audio/mp4',
      codecs: 'mp4a.40.2'
    },
    text: {
      uri: '/base/test/test/assets/text-clip.vtt',
      mimeType: 'text/vtt'
    },
    duration: 30
  },
  'sintel-enc': {
    video: {
      initSegmentUri: '/base/test/test/assets/encrypted-sintel-video-init.mp4',
      mvhdOffset: 0x24,
      segmentUri: '/base/test/test/assets/encrypted-sintel-video-segment.mp4',
      tfdtOffset: 0x38,
      segmentDuration: 10,
      presentationTimeOffset: 0,
      mimeType: 'video/mp4',
      codecs: 'avc1.42c01e',
      initData:
          'AAAAc3Bzc2gAAAAA7e+LqXnWSs6jyCfc1R0h7QAAAFMIARIQaKzMBtasU1iYiGwe' +
          'MeC/ORIQPgfUgWF6UGqdIm5yx/XJtxIQRC1g0g+tXe6lxz4ABfHDnhoNd2lkZXZp' +
          'bmVfdGVzdCIIzsW/9dxA3ckyAA=='
    },
    audio: {
      initSegmentUri: '/base/test/test/assets/encrypted-sintel-audio-init.mp4',
      mvhdOffset: 0x20,
      segmentUri: '/base/test/test/assets/encrypted-sintel-audio-segment.mp4',
      tfdtOffset: 0x3c,
      segmentDuration: 10.005,
      presentationTimeOffset: 0,
      mimeType: 'audio/mp4',
      codecs: 'mp4a.40.2',
      initData:
          'AAAAc3Bzc2gAAAAA7e+LqXnWSs6jyCfc1R0h7QAAAFMIARIQaKzMBtasU1iYiGwe' +
          'MeC/ORIQPgfUgWF6UGqdIm5yx/XJtxIQRC1g0g+tXe6lxz4ABfHDnhoNd2lkZXZp' +
          'bmVfdGVzdCIIzsW/9dxA3ckyAA=='
    },
    text: {
      uri: '/base/test/test/assets/text-clip.vtt',
      mimeType: 'text/vtt'
    },
    licenseServers: {
      'com.widevine.alpha': '//widevine-proxy.appspot.com/proxy'
    },
    duration: 30
  },
  'multidrm': {
    video: {
      initSegmentUri: '/base/test/test/assets/multidrm-video-init.mp4',
      mvhdOffset: 0x72,
      segmentUri: '/base/test/test/assets/multidrm-video-segment.mp4',
      tfdtOffset: 0x78,
      segmentDuration: 4,
      presentationTimeOffset: 0,
      mimeType: 'video/mp4',
      codecs: 'avc1.64001e',
      initData:
          'AAAANHBzc2gAAAAA7e+LqXnWSs6jyCfc1R0h7QAAABQIARIQblodJidXR9eARuq' +
          'l0dNLWg=='
    },
    audio: {
      initSegmentUri: '/base/test/test/assets/multidrm-audio-init.mp4',
      mvhdOffset: 0x72,
      segmentUri: '/base/test/test/assets/multidrm-audio-segment.mp4',
      tfdtOffset: 0x7c,
      segmentDuration: 4,
      presentationTimeOffset: 0,
      mimeType: 'audio/mp4',
      codecs: 'mp4a.40.2',
      initData:
          'AAAANHBzc2gAAAAA7e+LqXnWSs6jyCfc1R0h7QAAABQIARIQblodJidXR9eARuq' +
          'l0dNLWg=='
    },
    text: {
      uri: '/base/test/test/assets/text-clip.vtt',
      mimeType: 'text/vtt'
    },
    licenseServers: {
      'com.widevine.alpha':
          '//drm-widevine-licensing.axtest.net/AcquireLicense',
      'com.microsoft.playready':
          '//drm-playready-licensing.axtest.net/AcquireLicense'
    },
    licenseRequestHeaders: {
      'X-AxDRM-Message':
          'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ2ZXJzaW9uIjoxLCJjb21fa2V5' +
          'X2lkIjoiNjllNTQwODgtZTllMC00NTMwLThjMWEtMWViNmRjZDBkMTRlIiwibWVzc' +
          '2FnZSI6eyJ0eXBlIjoiZW50aXRsZW1lbnRfbWVzc2FnZSIsImtleXMiOlt7ImlkIj' +
          'oiNmU1YTFkMjYtMjc1Ny00N2Q3LTgwNDYtZWFhNWQxZDM0YjVhIn1dfX0.yF7PflO' +
          'Pv9qHnu3ZWJNZ12jgkqTabmwXbDWk_47tLNE'
    },
    duration: 30
  }
};


/**
 * Sets up the networking callbacks required to play the given asset.
 *
 * @param {!shaka.Player} player
 * @param {string} name
 */
shaka.test.TestScheme.setupPlayer = function(player, name) {
  var asset = shaka.test.TestScheme.DATA[name];
  goog.asserts.assert(asset, 'Unknown asset');
  if (!asset) return;
  if (asset.licenseRequestHeaders) {
    player.getNetworkingEngine().registerRequestFilter(
        function(type, request) {
          if (type != shaka.net.NetworkingEngine.RequestType.LICENSE) return;

          for (var header in asset.licenseRequestHeaders) {
            request.headers[header] = asset.licenseRequestHeaders[header];
          }
        });
  }
  if (asset.licenseServers) {
    var config = {drm: {servers: asset.licenseServers}};
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
  /**
   * @param {Object} metadata
   * @return {shaka.test.DashVodStreamGenerator}
   */
  function createStreamGenerator(metadata) {
    return new window.shaka.test.DashVodStreamGenerator(
        metadata.initSegmentUri, metadata.mvhdOffset, metadata.segmentUri,
        metadata.tfdtOffset, metadata.segmentDuration,
        metadata.presentationTimeOffset);
  }

  /**
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
                          data[contentType].segmentDuration);

    if (data.licenseServers) {
      for (var keySystem in data.licenseServers) {
        gen.addDrmInfo(keySystem)
            .licenseServerUri(data.licenseServers[keySystem]);
        if (data[contentType].initData) {
          gen.addCencInitData(data[contentType].initData);
        }
      }
    }
  }

  var async = [];
  // Include 'window' to use uncompiled version version of the
  // library.
  var DATA = window.shaka.test.TestScheme.DATA;
  var GENERATORS = window.shaka.test.TestScheme.GENERATORS;
  var MANIFESTS = window.shaka.test.TestScheme.MANIFESTS;
  var ContentType = window.shaka.util.ManifestParserUtils.ContentType;

  for (var name in DATA) {
    GENERATORS[name + suffix] = GENERATORS[name + suffix] || {};
    var data = DATA[name];
    [ContentType.VIDEO, ContentType.AUDIO].forEach(function(type) {
      var streamGen = createStreamGenerator(data[type]);
      GENERATORS[name + suffix][type] = streamGen;
      async.push(streamGen.init());
    });

    var gen = new window.shaka.test.ManifestGenerator(shaka)
        .setPresentationDuration(data.duration)
        .addPeriod(0)
        .addVariant(0)
          .addVideo(1);
    addStreamInfo(gen, data, ContentType.VIDEO, name);
    gen.addAudio(2);
    addStreamInfo(gen, data, ContentType.AUDIO, name);

    // This seems to be necessary.  Otherwise, we end up with a URL like
    // "http:/base/..." which then fails to load on Safari for some reason.
    var locationUri = new goog.Uri(location.href);
    var partialUri = new goog.Uri(data.text.uri);
    var absoluteUri = locationUri.resolve(partialUri);

    gen.addTextStream(3)
          .mime(data.text.mimeType, data.text.codecs)
          .textStream(absoluteUri.toString());

    MANIFESTS[name + suffix] = gen.build();
  }

  return Promise.all(async);
};


beforeAll(function(done) {
  shaka.test.TestScheme.createManifests(shaka, '').catch(fail).then(done);
});



/**
 * @constructor
 * @struct
 * @implements {shakaExtern.ManifestParser}
 */
shaka.test.TestScheme.ManifestParser = function() {};


/** @override */
shaka.test.TestScheme.ManifestParser.prototype.configure = function(config) {};


/** @override */
shaka.test.TestScheme.ManifestParser.prototype.start = function(uri) {
  var re = /^test:([^\/]+)$/;
  var manifestParts = re.exec(uri);
  if (!manifestParts) {
    // Use expect so the URI is printed on errors.
    expect(uri).toMatch(re);
    return Promise.reject();
  }

  var manifest = shaka.test.TestScheme.MANIFESTS[manifestParts[1]];
  expect(manifest).toBeTruthy();
  if (!manifest) return Promise.reject();

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

