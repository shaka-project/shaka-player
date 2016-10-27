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


// Types and enums {{{
/**
 * A container for demo assets.
 * @class
 */
var shakaAssets = {};


/** @enum {string} */
shakaAssets.Encoder = {
  UNKNOWN: 'Unknown',
  SHAKA_PACKAGER: 'Shaka packager',
  YOUTUBE: 'YouTube',
  AXINOM: 'Axinom',
  UNIFIED_STREAMING: 'Unified Streaming',
  WOWZA: 'Wowza',
  BITCODIN: 'Bitcodin',
  NIMBLE_STREAMER: 'Nimble Streamer',
  AZURE_MEDIA_SERVICES: 'Azure Media Services',
  MP4BOX: 'MP4Box'
};


/** @enum {string} */
shakaAssets.Source = {
  SHAKA: 'Shaka',
  YOUTUBE: 'YouTube',
  AXINOM: 'Axinom',
  UNIFIED_STREAMING: 'Unified Streaming',
  DASH_IF: 'DASH-IF',
  WOWZA: 'Wowza',
  BITCODIN: 'Bitcodin',
  NIMBLE_STREAMER: 'Nimble Streamer',
  AZURE_MEDIA_SERVICES: 'Azure Media Services',
  GPAC: 'GPAC'
};


/** @enum {string} */
shakaAssets.KeySystem = {
  CLEAR_KEY: 'org.w3.clearkey',
  PLAYREADY: 'com.microsoft.playready',
  WIDEVINE: 'com.widevine.alpha'
};


/** @enum {string} */
shakaAssets.Feature = {
  SEGMENT_BASE: 'SegmentBase',
  SEGMENT_LIST_DURATION: 'SegmentList w/ @duration',
  SEGMENT_LIST_TIMELINE: 'SegmentList w/ SegmentTimeline',
  SEGMENT_TEMPLATE_DURATION: 'SegmentTemplate w/ @duration',
  SEGMENT_TEMPLATE_TIMELINE: 'SegmentTemplate w/ SegmentTimeline',

  PSSH: 'embedded PSSH',
  MULTIKEY: 'multiple keys',
  MULTIPERIOD: 'multiple Periods',

  SUBTITLES: 'subtitles',
  CAPTIONS: 'captions',
  SEGMENTED_TEXT: 'segmented text',
  EMBEDDED_TEXT: 'embedded text',
  MULTIPLE_LANGUAGES: 'multiple languages',

  LIVE: 'live',
  WEBM: 'WebM',
  MP4: 'mp4',
  TTML: 'TTML',
  WEBVTT: 'WebVTT',

  HIGH_DEFINITION: 'high definition',
  ULTRA_HIGH_DEFINITION: 'ultra-high definition'
};


/**
 * @typedef {{
 *   uri: string,
 *   language: string,
 *   kind: string,
 *   mime: string,
 *   codecs: (string|undefined)
 * }}
 *
 * @property {string} uri
 *   The URI of the text.
 * @property {string} language
 *   The language of the text (e.g. 'en').
 * @property {string} kind
 *   The kind of text (e.g. 'subtitles').
 * @property {string} mime
 *   The MIME type of the text (e.g. 'text/vtt')
 * @property {(string|undefined)} codecs
 *   (optional) The codecs string, if needed to refine the MIME type.
 */
shakaAssets.ExtraText;


/**
 * @typedef {{
 *   name: string,
 *   manifestUri: string,
 *   focus: (boolean|undefined),
 *   disabled: (boolean|undefined),
 *   extraText: (!Array.<shakaAssets.ExtraText>|undefined),
 *
 *   encoder: shakaAssets.Encoder,
 *   source: shakaAssets.Source,
 *   drm: !Array.<shakaAssets.KeySystem>,
 *   features: !Array.<shakaAssets.Feature>,
 *
 *   licenseServers: (!Object.<string, string>|undefined),
 *   licenseRequestHeaders: (!Object.<string, string>|undefined),
 *   requestFilter: (shaka.net.NetworkingEngine.RequestFilter|undefined),
 *   responseFilter: (shaka.net.NetworkingEngine.ResponseFilter|undefined),
 *   drmCallback: (shakaExtern.DashContentProtectionCallback|undefined),
 *   clearKeys: (!Object.<string, string>|undefined),
 *
 *   extraConfig: (Object|undefined)
 * }}
 *
 * @property {string} name
 *   The name of the asset.  This does not have to be unique and can be the
 *   same if the asset is encoded different ways (or by different encoders).
 * @property {string} manifestUri
 *   The URI of the manifest.
 * @property {(boolean|undefined)} focus
 *   (optional) If true, focuses the integration test for this asset and selects
 *   this asset in the demo app.
 * @property {(boolean|undefined)} disabled
 *   (optional) If true, disables tests for this asset and hides it in the demo
 *   app.
 * @property {(!Array.<shakaAssets.ExtraText>|undefined)} extraText
 *   (optional) An array of extra text sources (e.g. external captions).
 *
 * @property {shakaAssets.Encoder} encoder
 *   The encoder that created the asset.
 * @property {shakaAssets.Source} source
 *   The source of the asset.
 * @property {!Array.<shakaAssets.KeySystem>} drm
 *   An array of key-systems that the asset uses.
 * @property {!Array.<shakaAssets.Feature>} features
 *   An array of features that this asset has.
 *
 * @property {(!Object.<string, string>|undefined)} licenseServers
 *   (optional) A map of key-system to license server.
 * @property {(!Object.<string, string>|undefined)} licenseRequestHeaders
 *   (optional) A map of headers to add to license requests.
 * @property {(shaka.net.NetworkingEngine.RequestFilter|undefined)}
 *     requestFilter
 *   A filter on license requests before they are passed to the server.
 * @property {(shaka.net.NetworkingEngine.ResponseFilter|undefined)}
 *     responseFilter
 *   A filter on license responses before they are passed to the CDM.
 * @property {(shakaExtern.DashContentProtectionCallback|undefined)} drmCallback
 *   A callback to use to interpret ContentProtection elements.
 * @property {(!Object.<string, string>|undefined)} clearKeys
 *   A map of key-id to key to use with clear-key encryption.
 *
 * @property {(Object|undefined)} extraConfig
 *   Arbitrary player config to be applied after all other settings.
 */
shakaAssets.AssetInfo;
// }}}


// Custom callbacks {{{
/**
 * A license request filter for YouTube license requests.
 * @param {shaka.net.NetworkingEngine.RequestType} type
 * @param {shakaExtern.Request} request
 */
shakaAssets.YouTubeRequestFilter = function(type, request) {
  if (type != shaka.net.NetworkingEngine.RequestType.LICENSE)
    return;

  // The Playready endpoint does not allow cross-origin requests that include
  // the headers we extracted from the Playready XML.  Remove them.
  request.headers = {};
};


/**
 * A license response filter for YouTube license responses.
 * @param {shaka.net.NetworkingEngine.RequestType} type
 * @param {shakaExtern.Response} response
 */
shakaAssets.YouTubeResponseFilter = function(type, response) {
  if (type != shaka.net.NetworkingEngine.RequestType.LICENSE)
    return;

  // We are extracting an ASCII header and not reading the Stringified version
  // of the license thereafter, so this conversion is safe.
  var responseArray = new Uint8Array(response.data);
  var responseStr = String.fromCharCode.apply(null, responseArray);
  var headerIndex = responseStr.indexOf('\r\n\r\n');
  if (responseStr.indexOf('GLS/1.0') == 0 && headerIndex >= 0) {
    // Strip off the headers.
    response.data = response.data.slice(headerIndex + 4);
  }
};


/**
 * @param {!Node} node
 * @return {Array.<shakaExtern.DrmInfo>}
 */
shakaAssets.YouTubeCallback = function(node) {
  var schemeIdUri = node.getAttribute('schemeIdUri');
  if (schemeIdUri == 'http://youtube.com/drm/2012/10/10') {
    /** @type {!Array.<shakaExtern.DrmInfo>} */
    var configs = [];

    for (var i = 0; i < node.childNodes.length; ++i) {
      var child = node.childNodes[i];
      if (child.nodeName == 'yt:SystemURL') {
        var licenseServerUri = child.textContent;
        var typeAttr = child.getAttribute('type');
        var keySystem;
        // NOTE: Ignoring clearkey type here because this YT demo content does
        // not contain PSSHs appropriate for the clearkey CDM.
        if (typeAttr == 'widevine') {
          keySystem = 'com.widevine.alpha';
        } else if (typeAttr == 'playready') {
          keySystem = 'com.microsoft.playready';
        } else {
          continue;
        }

        configs.push({
          keySystem: keySystem,
          licenseServerUri: licenseServerUri,
          distinctiveIdentifierRequired: false,
          persistentStateRequired: false,
          audioRobustness: '',
          videoRobustness: '',
          serverCertificate: null,
          initData: null,
          keyIds: []
        });
      }
    }
    return configs;
  }

  return null;
};
// }}}


/** @const {!Array.<shakaAssets.AssetInfo>} */
shakaAssets.testAssets = [
  // Shaka assets {{{
  {
    name: 'Angel One (multicodec, multilingual)',
    manifestUri: '//storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd',  // gjslint: disable=110

    encoder: shakaAssets.Encoder.SHAKA_PACKAGER,
    source: shakaAssets.Source.SHAKA,
    drm: [],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.MULTIPLE_LANGUAGES,
      shakaAssets.Feature.SEGMENT_BASE,
      shakaAssets.Feature.SUBTITLES,
      shakaAssets.Feature.WEBM,
      shakaAssets.Feature.WEBVTT
    ]
  },
  {
    name: 'Angel One (multicodec, multilingual, Widevine)',
    manifestUri: '//storage.googleapis.com/shaka-demo-assets/angel-one-widevine/dash.mpd',  // gjslint: disable=110

    encoder: shakaAssets.Encoder.SHAKA_PACKAGER,
    source: shakaAssets.Source.SHAKA,
    drm: [shakaAssets.KeySystem.WIDEVINE],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.MULTIPLE_LANGUAGES,
      shakaAssets.Feature.SEGMENT_BASE,
      shakaAssets.Feature.SUBTITLES,
      shakaAssets.Feature.WEBM,
      shakaAssets.Feature.WEBVTT
    ],

    licenseServers: {
      'com.widevine.alpha': '//widevine-proxy.appspot.com/proxy'
    }
  },
  {
    name: 'Angel One (multicodec, multilingual, ClearKey server)',
    manifestUri: '//storage.googleapis.com/shaka-demo-assets/angel-one-clearkey/dash.mpd',  // gjslint: disable=110

    encoder: shakaAssets.Encoder.SHAKA_PACKAGER,
    source: shakaAssets.Source.SHAKA,
    drm: [shakaAssets.KeySystem.CLEAR_KEY],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.MULTIPLE_LANGUAGES,
      shakaAssets.Feature.SEGMENT_BASE,
      shakaAssets.Feature.SUBTITLES,
      shakaAssets.Feature.WEBM,
      shakaAssets.Feature.WEBVTT
    ],

    licenseServers: {
      'org.w3.clearkey': '//cwip-shaka-proxy.appspot.com/clearkey?_u3wDe7erb7v8Lqt8A3QDQ=ABEiM0RVZneImaq7zN3u_w'  // gjslint: disable=110
    }
  },
  {
    name: 'Sintel 4k (multicodec)',
    manifestUri: '//storage.googleapis.com/shaka-demo-assets/sintel/dash.mpd',  // gjslint: disable=110

    encoder: shakaAssets.Encoder.SHAKA_PACKAGER,
    source: shakaAssets.Source.SHAKA,
    drm: [],
    features: [
      shakaAssets.Feature.HIGH_DEFINITION,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_BASE,
      shakaAssets.Feature.SUBTITLES,
      shakaAssets.Feature.ULTRA_HIGH_DEFINITION,
      shakaAssets.Feature.WEBM,
      shakaAssets.Feature.WEBVTT
    ]
  },
  {
    name: 'Sintel 4k (WebM only)',
    manifestUri: '//storage.googleapis.com/shaka-demo-assets/sintel-webm-only/dash.mpd',  // gjslint: disable=110
    // NOTE: hanging in Firefox
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1291451

    encoder: shakaAssets.Encoder.SHAKA_PACKAGER,
    source: shakaAssets.Source.SHAKA,
    drm: [],
    features: [
      shakaAssets.Feature.HIGH_DEFINITION,
      shakaAssets.Feature.SEGMENT_BASE,
      shakaAssets.Feature.SUBTITLES,
      shakaAssets.Feature.ULTRA_HIGH_DEFINITION,
      shakaAssets.Feature.WEBM,
      shakaAssets.Feature.WEBVTT
    ]
  },
  {
    name: 'Sintel 4k (MP4 only)',
    manifestUri: '//storage.googleapis.com/shaka-demo-assets/sintel-mp4-only/dash.mpd',  // gjslint: disable=110

    encoder: shakaAssets.Encoder.SHAKA_PACKAGER,
    source: shakaAssets.Source.SHAKA,
    drm: [],
    features: [
      shakaAssets.Feature.HIGH_DEFINITION,
      shakaAssets.Feature.SEGMENT_BASE,
      shakaAssets.Feature.SUBTITLES,
      shakaAssets.Feature.ULTRA_HIGH_DEFINITION,
      shakaAssets.Feature.WEBM,
      shakaAssets.Feature.WEBVTT
    ]
  },
  {
    name: 'Sintel 4k (multicodec, Widevine)',
    manifestUri: '//storage.googleapis.com/shaka-demo-assets/sintel-widevine/dash.mpd',  // gjslint: disable=110

    encoder: shakaAssets.Encoder.SHAKA_PACKAGER,
    source: shakaAssets.Source.SHAKA,
    drm: [shakaAssets.KeySystem.WIDEVINE],
    features: [
      shakaAssets.Feature.HIGH_DEFINITION,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.PSSH,
      shakaAssets.Feature.SEGMENT_BASE,
      shakaAssets.Feature.SUBTITLES,
      shakaAssets.Feature.ULTRA_HIGH_DEFINITION,
      shakaAssets.Feature.WEBM,
      shakaAssets.Feature.WEBVTT
    ],

    licenseServers: {
      'com.widevine.alpha': '//widevine-proxy.appspot.com/proxy'
    }
  },
  {
    name: 'Sintel 4k (multicodec, VTT in MP4)',
    manifestUri: '//storage.googleapis.com/shaka-demo-assets/sintel-mp4-wvtt/dash.mpd',  // gjslint: disable=110

    encoder: shakaAssets.Encoder.SHAKA_PACKAGER,
    source: shakaAssets.Source.SHAKA,
    drm: [shakaAssets.KeySystem.WIDEVINE],
    features: [
      shakaAssets.Feature.EMBEDDED_TEXT,
      shakaAssets.Feature.HIGH_DEFINITION,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_BASE,
      shakaAssets.Feature.SUBTITLES,
      shakaAssets.Feature.ULTRA_HIGH_DEFINITION,
      shakaAssets.Feature.WEBM,
      shakaAssets.Feature.WEBVTT
    ]
  },
  {
    name: 'Heliocentrism (multicodec, multiperiod)',
    manifestUri: '//storage.googleapis.com/shaka-demo-assets/heliocentrism/heliocentrism.mpd',  // gjslint: disable=110

    encoder: shakaAssets.Encoder.SHAKA_PACKAGER,
    source: shakaAssets.Source.SHAKA,
    drm: [],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.MULTIPERIOD,
      shakaAssets.Feature.SEGMENT_BASE,
      shakaAssets.Feature.WEBM
    ]
  },
  {
    name: '"Dig the Uke" by Stefan Kartenberg (audio only, multicodec, Widevine)',  // gjslint: disable=110
    // From: http://dig.ccmixter.org/files/JeffSpeed68/53327
    // Licensed under Creative Commons BY-NC 3.0.
    // Free for non-commercial use with attribution.
    // http://creativecommons.org/licenses/by-nc/3.0/
    manifestUri: '//storage.googleapis.com/shaka-demo-assets/dig-the-uke/dash.mpd',  // gjslint: disable=110

    encoder: shakaAssets.Encoder.SHAKA_PACKAGER,
    source: shakaAssets.Source.SHAKA,
    drm: [shakaAssets.KeySystem.WIDEVINE],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_BASE,
      shakaAssets.Feature.WEBM
    ],

    licenseServers: {
      'com.widevine.alpha': '//widevine-proxy.appspot.com/proxy'
    }
  },
  {
    name: 'Tears of Steel (multicodec, TTML)',
    manifestUri: '//storage.googleapis.com/shaka-demo-assets/tos-ttml/dash.mpd',
    encoder: shakaAssets.Encoder.SHAKA_PACKAGER,
    source: shakaAssets.Source.SHAKA,
    drm: [],
    features: [
      shakaAssets.Feature.HIGH_DEFINITION,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.PSSH,
      shakaAssets.Feature.SEGMENT_BASE,
      shakaAssets.Feature.SUBTITLES,
      shakaAssets.Feature.TTML,
      shakaAssets.Feature.WEBM
    ]
  },
  {
    name: 'Tears of Steel (multiperiod with segmented subtitles and PTO)',
    manifestUri: '//storage.googleapis.com/shaka-demo-assets/tos-pto-webvtt/dash.mpd',  // gjslint: disable=110
    encoder: shakaAssets.Encoder.SHAKA_PACKAGER,
    source: shakaAssets.Source.SHAKA,
    drm: [],
    features: [
      shakaAssets.Feature.HIGH_DEFINITION,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.MULTIPERIOD,
      shakaAssets.Feature.SEGMENT_TEMPLATE_TIMELINE,
      shakaAssets.Feature.SEGMENTED_TEXT,
      shakaAssets.Feature.SUBTITLES,
      shakaAssets.Feature.WEBVTT
    ]
  },
  // }}}

  // YouTube assets {{{
  // Src: http://dash-mse-test.appspot.com/media.html
  {
    name: 'Car',
    manifestUri: '//yt-dash-mse-test.commondatastorage.googleapis.com/media/car-20120827-manifest.mpd',  // gjslint: disable=110

    encoder: shakaAssets.Encoder.YOUTUBE,
    source: shakaAssets.Source.YOUTUBE,
    drm: [],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_BASE
    ]
  },
  {
    name: 'Car ClearKey',
    manifestUri: '//yt-dash-mse-test.commondatastorage.googleapis.com/media/car_cenc-20120827-manifest.mpd',  // gjslint: disable=110

    encoder: shakaAssets.Encoder.YOUTUBE,
    source: shakaAssets.Source.YOUTUBE,
    drm: [shakaAssets.KeySystem.CLEAR_KEY],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_BASE
    ],

    clearKeys: {
      '60061e017e477e877e57d00d1ed00d1e': '1a8a2095e4deb2d29ec816ac7bae2082'
    }
  },
  {
    name: 'Feelings',
    manifestUri: '//yt-dash-mse-test.commondatastorage.googleapis.com/media/feelings_vp9-20130806-manifest.mpd',  // gjslint: disable=110

    encoder: shakaAssets.Encoder.YOUTUBE,
    source: shakaAssets.Source.YOUTUBE,
    drm: [],
    features: [
      shakaAssets.Feature.SEGMENT_BASE,
      shakaAssets.Feature.WEBM
    ]
  },
  {
    name: 'Oops multi-DRM',
    manifestUri: '//yt-dash-mse-test.commondatastorage.googleapis.com/media/oops_cenc-20121114-signedlicenseurl-manifest.mpd',  // gjslint: disable=110

    encoder: shakaAssets.Encoder.YOUTUBE,
    source: shakaAssets.Source.YOUTUBE,
    drm: [
      // TODO: Failing on PlayReady with error 8004b896, investigate
      //shakaAssets.KeySystem.PLAYREADY,
      shakaAssets.KeySystem.WIDEVINE
    ],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_BASE
    ],

    drmCallback: shakaAssets.YouTubeCallback,
    requestFilter: shakaAssets.YouTubeRequestFilter,
    responseFilter: shakaAssets.YouTubeResponseFilter
  },
  // }}}

  // Axinom assets {{{
  // Src: https://github.com/Axinom/dash-test-vectors
  {
    name: 'Multi-DRM',
    manifestUri: '//media.axprod.net/TestVectors/v7-MultiDRM-SingleKey/Manifest.mpd',  // gjslint: disable=110

    encoder: shakaAssets.Encoder.AXINOM,
    source: shakaAssets.Source.AXINOM,
    drm: [
      shakaAssets.KeySystem.PLAYREADY,
      shakaAssets.KeySystem.WIDEVINE
    ],
    features: [
      shakaAssets.Feature.EMBEDDED_TEXT,
      shakaAssets.Feature.HIGH_DEFINITION,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_TEMPLATE_DURATION,
      shakaAssets.Feature.TTML,
      shakaAssets.Feature.ULTRA_HIGH_DEFINITION,
      shakaAssets.Feature.WEBVTT
    ],

    licenseServers: {
      'com.widevine.alpha': '//drm-widevine-licensing.axtest.net/AcquireLicense',  // gjslint: disable=110
      'com.microsoft.playready': '//drm-playready-licensing.axtest.net/AcquireLicense'  // gjslint: disable=110
    },
    licenseRequestHeaders: {
      'X-AxDRM-Message': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZXJzaW9uIjoxLCJjb21fa2V5X2lkIjoiYjMzNjRlYjUtNTFmNi00YWUzLThjOTgtMzNjZWQ1ZTMxYzc4IiwibWVzc2FnZSI6eyJ0eXBlIjoiZW50aXRsZW1lbnRfbWVzc2FnZSIsImtleXMiOlt7ImlkIjoiOWViNDA1MGQtZTQ0Yi00ODAyLTkzMmUtMjdkNzUwODNlMjY2IiwiZW5jcnlwdGVkX2tleSI6ImxLM09qSExZVzI0Y3Iya3RSNzRmbnc9PSJ9XX19.4lWwW46k-oWcah8oN18LPj5OLS5ZU-_AQv7fe0JhNjA'  // gjslint: disable=110
    }
  },
  {
    name: 'Multi-DRM, multi-key',
    manifestUri: '//media.axprod.net/TestVectors/v7-MultiDRM-MultiKey/Manifest.mpd',  // gjslint: disable=110

    encoder: shakaAssets.Encoder.AXINOM,
    source: shakaAssets.Source.AXINOM,
    drm: [
      shakaAssets.KeySystem.PLAYREADY,
      shakaAssets.KeySystem.WIDEVINE
    ],
    features: [
      shakaAssets.Feature.EMBEDDED_TEXT,
      shakaAssets.Feature.HIGH_DEFINITION,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.MULTIKEY,
      shakaAssets.Feature.SEGMENT_TEMPLATE_DURATION,
      shakaAssets.Feature.TTML,
      shakaAssets.Feature.ULTRA_HIGH_DEFINITION,
      shakaAssets.Feature.WEBVTT
    ],

    licenseServers: {
      'com.widevine.alpha': '//drm-widevine-licensing.axtest.net/AcquireLicense',  // gjslint: disable=110
      'com.microsoft.playready': '//drm-playready-licensing.axtest.net/AcquireLicense'  // gjslint: disable=110
    },
    licenseRequestHeaders: {
      'X-AxDRM-Message': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZXJzaW9uIjoxLCJjb21fa2V5X2lkIjoiYjMzNjRlYjUtNTFmNi00YWUzLThjOTgtMzNjZWQ1ZTMxYzc4IiwibWVzc2FnZSI6eyJ0eXBlIjoiZW50aXRsZW1lbnRfbWVzc2FnZSIsImtleXMiOlt7ImlkIjoiODAzOTliZjUtOGEyMS00MDE0LTgwNTMtZTI3ZTc0OGU5OGMwIiwiZW5jcnlwdGVkX2tleSI6ImxpTkpxVmFZa05oK01LY3hKRms3SWc9PSJ9LHsiaWQiOiI5MDk1M2UwOS02Y2IyLTQ5YTMtYTI2MC03YTVmZWZlYWQ0OTkiLCJlbmNyeXB0ZWRfa2V5Ijoia1l0SEh2cnJmQ01lVmRKNkxrYmtuZz09In0seyJpZCI6IjBlNGRhOTJiLWQwZTgtNGE2Ni04YzNmLWMyNWE5N2ViNjUzMiIsImVuY3J5cHRlZF9rZXkiOiI3dzdOWkhITE1nSjRtUUtFSzVMVE1RPT0ifSx7ImlkIjoiNTg1ZjIzM2YtMzA3Mi00NmYxLTlmYTQtNmRjMjJjNjZhMDE0IiwiZW5jcnlwdGVkX2tleSI6IkFjNFVVbVl0Qko1blBROU4xNXJjM2c9PSJ9LHsiaWQiOiI0MjIyYmQ3OC1iYzQ1LTQxYmYtYjYzZS02ZjgxNGRjMzkxZGYiLCJlbmNyeXB0ZWRfa2V5IjoiTzZGTzBmcVNXb3BwN2JqYy9ENGxNQT09In1dfX0.uF6YlKAREOmbniAeYiH070HSJhV0YS7zSKjlCtiDR5Y'  // gjslint: disable=110
    }
  },
  {
    name: 'Multi-DRM, multi-key, multi-Period',
    manifestUri: '//media.axprod.net/TestVectors/v7-MultiDRM-MultiKey-MultiPeriod/Manifest.mpd',  // gjslint: disable=110
    // NOTE: Some of period 1's audio is encrypted, and some of period 2's
    // audio is unencrypted.  This is something Chrome does not support at
    // this time.  See http://crbug.com/597443 for discussion and history.
    disabled: true,

    encoder: shakaAssets.Encoder.AXINOM,
    source: shakaAssets.Source.AXINOM,
    drm: [
      shakaAssets.KeySystem.PLAYREADY,
      shakaAssets.KeySystem.WIDEVINE
    ],
    features: [
      shakaAssets.Feature.EMBEDDED_TEXT,
      shakaAssets.Feature.HIGH_DEFINITION,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.MULTIKEY,
      shakaAssets.Feature.MULTIPERIOD,
      shakaAssets.Feature.SEGMENT_TEMPLATE_DURATION,
      shakaAssets.Feature.TTML,
      shakaAssets.Feature.ULTRA_HIGH_DEFINITION,
      shakaAssets.Feature.WEBVTT
    ],

    licenseServers: {
      'com.widevine.alpha': '//drm-widevine-licensing.axtest.net/AcquireLicense',  // gjslint: disable=110
      'com.microsoft.playready': '//drm-playready-licensing.axtest.net/AcquireLicense'  // gjslint: disable=110
    },
    licenseRequestHeaders: {
      'X-AxDRM-Message': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZXJzaW9uIjoxLCJjb21fa2V5X2lkIjoiYjMzNjRlYjUtNTFmNi00YWUzLThjOTgtMzNjZWQ1ZTMxYzc4IiwibWVzc2FnZSI6eyJ0eXBlIjoiZW50aXRsZW1lbnRfbWVzc2FnZSIsImtleXMiOlt7ImlkIjoiMDg3Mjc4NmUtZjllNy00NjVmLWEzYTItNGU1YjBlZjhmYTQ1IiwiZW5jcnlwdGVkX2tleSI6IlB3NitlRVlOY3ZqWWJmc2gzWDNmbWc9PSJ9LHsiaWQiOiJjMTRmMDcwOS1mMmI5LTQ0MjctOTE2Yi02MWI1MjU4NjUwNmEiLCJlbmNyeXB0ZWRfa2V5IjoiLzErZk5paDM4bXFSdjR5Y1l6bnQvdz09In0seyJpZCI6IjhiMDI5ZTUxLWQ1NmEtNDRiZC05MTBmLWQ0YjVmZDkwZmJhMiIsImVuY3J5cHRlZF9rZXkiOiJrcTBKdVpFanBGTjhzYVRtdDU2ME9nPT0ifSx7ImlkIjoiMmQ2ZTkzODctNjBjYS00MTQ1LWFlYzItYzQwODM3YjRiMDI2IiwiZW5jcnlwdGVkX2tleSI6IlRjUlFlQld4RW9IT0tIcmFkNFNlVlE9PSJ9LHsiaWQiOiJkZTAyZjA3Zi1hMDk4LTRlZTAtYjU1Ni05MDdjMGQxN2ZiYmMiLCJlbmNyeXB0ZWRfa2V5IjoicG9lbmNTN0dnbWVHRmVvSjZQRUFUUT09In0seyJpZCI6IjkxNGU2OWY0LTBhYjMtNDUzNC05ZTlmLTk4NTM2MTVlMjZmNiIsImVuY3J5cHRlZF9rZXkiOiJlaUkvTXNsbHJRNHdDbFJUL0xObUNBPT0ifSx7ImlkIjoiZGE0NDQ1YzItZGI1ZS00OGVmLWIwOTYtM2VmMzQ3YjE2YzdmIiwiZW5jcnlwdGVkX2tleSI6IjJ3K3pkdnFycERWM3hSMGJKeTR1Z3c9PSJ9LHsiaWQiOiIyOWYwNWU4Zi1hMWFlLTQ2ZTQtODBlOS0yMmRjZDQ0Y2Q3YTEiLCJlbmNyeXB0ZWRfa2V5IjoiL3hsU0hweHdxdTNnby9nbHBtU2dhUT09In0seyJpZCI6IjY5ZmU3MDc3LWRhZGQtNGI1NS05NmNkLWMzZWRiMzk5MTg1MyIsImVuY3J5cHRlZF9rZXkiOiJ6dTZpdXpOMnBzaTBaU3hRaUFUa1JRPT0ifV19fQ.BXr93Et1krYMVs-CUnf7F3ywJWFRtxYdkR7Qn4w3-to'  // gjslint: disable=110
    }
  },
  {
    name: 'Clear, single-Period',
    manifestUri: '//media.axprod.net/TestVectors/v7-Clear/Manifest.mpd',

    encoder: shakaAssets.Encoder.AXINOM,
    source: shakaAssets.Source.AXINOM,
    drm: [],
    features: [
      shakaAssets.Feature.EMBEDDED_TEXT,
      shakaAssets.Feature.HIGH_DEFINITION,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_TEMPLATE_DURATION,
      shakaAssets.Feature.TTML,
      shakaAssets.Feature.ULTRA_HIGH_DEFINITION,
      shakaAssets.Feature.WEBVTT
    ]
  },
  {
    name: 'Clear, multi-Period',
    manifestUri: '//media.axprod.net/TestVectors/v7-Clear/Manifest_MultiPeriod.mpd',  // gjslint: disable=110

    encoder: shakaAssets.Encoder.AXINOM,
    source: shakaAssets.Source.AXINOM,
    drm: [],
    features: [
      shakaAssets.Feature.EMBEDDED_TEXT,
      shakaAssets.Feature.HIGH_DEFINITION,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.MULTIPERIOD,
      shakaAssets.Feature.SEGMENT_TEMPLATE_DURATION,
      shakaAssets.Feature.TTML,
      shakaAssets.Feature.ULTRA_HIGH_DEFINITION,
      shakaAssets.Feature.WEBVTT
    ]
  },
  // }}}

  // Unified Streaming {{{
  // Src: http://demo.unified-streaming.com/features.html
  {
    name: 'Tears of Steel',
    manifestUri: '//demo.unified-streaming.com/video/tears-of-steel/tears-of-steel.ism/.mpd',  // gjslint: disable=110

    encoder: shakaAssets.Encoder.UNIFIED_STREAMING,
    source: shakaAssets.Source.UNIFIED_STREAMING,
    drm: [],
    features: [
      shakaAssets.Feature.HIGH_DEFINITION,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_TEMPLATE_TIMELINE,
      shakaAssets.Feature.ULTRA_HIGH_DEFINITION
    ]
  },
  {
    name: 'Tears of Steel (Widevine)',
    manifestUri: '//demo.unified-streaming.com/video/tears-of-steel/tears-of-steel-dash-widevine.ism/.mpd',  // gjslint: disable=110

    encoder: shakaAssets.Encoder.UNIFIED_STREAMING,
    source: shakaAssets.Source.UNIFIED_STREAMING,
    drm: [
      shakaAssets.KeySystem.WIDEVINE
    ],
    features: [
      shakaAssets.Feature.EMBEDDED_TEXT,
      shakaAssets.Feature.HIGH_DEFINITION,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_TEMPLATE_TIMELINE,
      shakaAssets.Feature.SUBTITLES,
      shakaAssets.Feature.TTML,
      shakaAssets.Feature.ULTRA_HIGH_DEFINITION
    ],

    licenseServers: {
      'com.widevine.alpha': '//widevine-proxy.appspot.com/proxy'
    }
  },
  {
    name: 'Tears of Steel (PlayReady)',
    manifestUri: '//demo.unified-streaming.com/video/tears-of-steel/tears-of-steel-dash-playready.ism/.mpd',  // gjslint: disable=110

    encoder: shakaAssets.Encoder.UNIFIED_STREAMING,
    source: shakaAssets.Source.UNIFIED_STREAMING,
    drm: [
      shakaAssets.KeySystem.PLAYREADY
    ],
    features: [
      shakaAssets.Feature.EMBEDDED_TEXT,
      shakaAssets.Feature.HIGH_DEFINITION,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_TEMPLATE_TIMELINE,
      shakaAssets.Feature.SUBTITLES,
      shakaAssets.Feature.TTML,
      shakaAssets.Feature.ULTRA_HIGH_DEFINITION
    ],

    licenseServers: {
      'com.microsoft.playready': '//playready.directtaps.net/pr/svc/rightsmanager.asmx?PlayRight=1&UseSimpleNonPersistentLicense=1'  // gjslint: disable=110
    }
  },
  {
    name: 'Tears of Steel (subtitles)',
    manifestUri: '//demo.unified-streaming.com/video/tears-of-steel/tears-of-steel-ru.ism/.mpd',  // gjslint: disable=110

    encoder: shakaAssets.Encoder.UNIFIED_STREAMING,
    source: shakaAssets.Source.UNIFIED_STREAMING,
    drm: [],
    features: [
      shakaAssets.Feature.EMBEDDED_TEXT,
      shakaAssets.Feature.HIGH_DEFINITION,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_TEMPLATE_TIMELINE,
      shakaAssets.Feature.SEGMENTED_TEXT,
      shakaAssets.Feature.SUBTITLES,
      shakaAssets.Feature.TTML,
      shakaAssets.Feature.ULTRA_HIGH_DEFINITION
    ]
  },
  // }}}

  // DASH-IF assets {{{
  // Src: http://dashif.org/test-vectors/
  {
    name: 'Big Buck Bunny',
    manifestUri: '//dash.edgesuite.net/dash264/TestCases/1c/qualcomm/2/MultiRate.mpd',  // gjslint: disable=110

    encoder: shakaAssets.Encoder.UNKNOWN,
    source: shakaAssets.Source.DASH_IF,
    drm: [],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_TEMPLATE_TIMELINE
    ]
  },
  {
    name: 'Live sim (2s segments)',
    manifestUri: '//vm2.dashif.org/livesim/utc_head/testpic_2s/Manifest.mpd',

    encoder: shakaAssets.Encoder.UNKNOWN,
    source: shakaAssets.Source.DASH_IF,
    drm: [],
    features: [
      shakaAssets.Feature.LIVE,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_TEMPLATE_TIMELINE
    ]
  },
  {
    name: 'Live sim (6s segments)',
    manifestUri: '//vm2.dashif.org/livesim/utc_head/testpic_6s/Manifest.mpd',

    encoder: shakaAssets.Encoder.UNKNOWN,
    source: shakaAssets.Source.DASH_IF,
    drm: [],
    features: [
      shakaAssets.Feature.LIVE,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_TEMPLATE_TIMELINE
    ]
  },
  // }}}

  // Wowza assets {{{
  // Src: http://www.dash-player.com/demo/streaming-server-and-encoder-support/
  {
    name: 'Big Buck Bunny (Live)',
    manifestUri: '//wowzaec2demo.streamlock.net/live/bigbuckbunny/manifest_mpm4sav_mvtime.mpd',  // gjslint: disable=110

    encoder: shakaAssets.Encoder.WOWZA,
    source: shakaAssets.Encoder.WOWZA,
    drm: [],
    features: [
      shakaAssets.Feature.LIVE,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_TEMPLATE_TIMELINE
    ]
  },
  // }}}

  // bitcodin assets {{{
  // Src: http://www.dash-player.com/demo/streaming-server-and-encoder-support/
  {
    name: 'Art of Motion',
    manifestUri: '//bitdash-a.akamaihd.net/content/MI201109210084_1/mpds/f08e80da-bf1d-4e3d-8899-f0f6155f6efa.mpd',  // gjslint: disable=110

    encoder: shakaAssets.Encoder.BITCODIN,
    source: shakaAssets.Source.BITCODIN,
    drm: [],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_TEMPLATE_DURATION
    ]
  },
  // }}}

  // Nimble Streamer assets {{{
  // Src: http://www.dash-player.com/demo/streaming-server-and-encoder-support/
  {
    name: 'Big Buck Bunny',
    manifestUri: '//video.wmspanel.com/local/raw/BigBuckBunny_320x180.mp4/manifest.mpd',  // gjslint: disable=110

    encoder: shakaAssets.Encoder.NIMBLE_STREAMER,
    source: shakaAssets.Source.NIMBLE_STREAMER,
    drm: [],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_TEMPLATE_TIMELINE
    ]
  },
  // }}}

  // Azure Media Services assets {{{
  // Src: http://amp.azure.net/libs/amp/latest/docs/samples.html
  {
    name: 'Azure Trailer',
    manifestUri: '//amssamples.streaming.mediaservices.windows.net/91492735-c523-432b-ba01-faba6c2206a2/AzureMediaServicesPromo.ism/manifest(format=mpd-time-csf)',  // gjslint: disable=110

    encoder: shakaAssets.Encoder.AZURE_MEDIA_SERVICES,
    source: shakaAssets.Source.AZURE_MEDIA_SERVICES,
    drm: [],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_TEMPLATE_TIMELINE
    ]
  },
  {
    name: 'Big Buck Bunny',
    manifestUri: '//amssamples.streaming.mediaservices.windows.net/622b189f-ec39-43f2-93a2-201ac4e31ce1/BigBuckBunny.ism/manifest(format=mpd-time-csf)',  // gjslint: disable=110
    // NOTE: License servers are timing out as of 2016-03-23.
    // NOTE: Still timing out as of 2016-08-02.
    disabled: true,

    encoder: shakaAssets.Encoder.AZURE_MEDIA_SERVICES,
    source: shakaAssets.Source.AZURE_MEDIA_SERVICES,
    drm: [
      shakaAssets.KeySystem.PLAYREADY,
      shakaAssets.KeySystem.WIDEVINE
    ],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_TEMPLATE_TIMELINE
    ],

    licenseServers: {
      'com.widevine.alpha': '//amssamples.keydelivery.mediaservices.windows.net/Widevine/?KID=1ab45440-532c-4399-94dc-5c5ad9584bac',  // gjslint: disable=110
      'com.microsoft.playready': '//amssamples.keydelivery.mediaservices.windows.net/PlayReady/'  // gjslint: disable=110
    }
  },
  {
    name: 'Tears Of Steel (external text)',
    manifestUri: '//ams-samplescdn.streaming.mediaservices.windows.net/11196e3d-2f40-4835-9a4d-fc52751b0323/TearsOfSteel_WAMEH264SmoothStreaming720p.ism/manifest(format=mpd-time-csf)',  // gjslint: disable=110
    extraText: [
      {
        uri: '//ams-samplescdn.streaming.mediaservices.windows.net/11196e3d-2f40-4835-9a4d-fc52751b0323/TOS-en.vtt',  // gjslint: disable=110
        language: 'en',
        kind: 'subtitle',
        mime: 'text/vtt'
      },
      {
        uri: '//ams-samplescdn.streaming.mediaservices.windows.net/11196e3d-2f40-4835-9a4d-fc52751b0323/TOS-es.vtt',  // gjslint: disable=110
        language: 'es',
        kind: 'subtitle',
        mime: 'text/vtt'
      },
      {
        uri: '//ams-samplescdn.streaming.mediaservices.windows.net/11196e3d-2f40-4835-9a4d-fc52751b0323/TOS-fr.vtt',  // gjslint: disable=110
        language: 'fr',
        kind: 'subtitle',
        mime: 'text/vtt'
      }
    ],

    encoder: shakaAssets.Encoder.AZURE_MEDIA_SERVICES,
    source: shakaAssets.Source.AZURE_MEDIA_SERVICES,
    drm: [],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_TEMPLATE_TIMELINE,
      shakaAssets.Feature.SUBTITLES,
      shakaAssets.Feature.WEBVTT
    ]
  },
  // }}}

  // GPAC assets {{{
  // Src: https://gpac.wp.mines-telecom.fr/2012/02/23/dash-sequences/
  // NOTE: The assets here using the "live profile" are not actually
  // "live streams".  The content is still static, as is the timeline.
  {
    name: 'live profile',
    manifestUri: '//download.tsi.telecom-paristech.fr/gpac/DASH_CONFORMANCE/TelecomParisTech/mp4-live/mp4-live-mpd-AV-BS.mpd',  // gjslint: disable=110
    // NOTE: Multiple SPS/PPS in init segment, no sample duration
    // NOTE: Decoder errors on Mac
    // https://github.com/gpac/gpac/issues/600
    // https://bugs.webkit.org/show_bug.cgi?id=160459
    disabled: true,

    encoder: shakaAssets.Encoder.MP4BOX,
    source: shakaAssets.Source.GPAC,
    drm: [],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_TEMPLATE_DURATION
    ]
  },
  {
    name: 'live profile with five periods',
    manifestUri: '//download.tsi.telecom-paristech.fr/gpac/DASH_CONFORMANCE/TelecomParisTech/mp4-live-periods/mp4-live-periods-mpd.mpd',  // gjslint: disable=110

    encoder: shakaAssets.Encoder.MP4BOX,
    source: shakaAssets.Source.GPAC,
    drm: [],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.MULTIPERIOD,
      shakaAssets.Feature.SEGMENT_TEMPLATE_DURATION
    ]
  },
  {
    name: 'main profile, single file',
    manifestUri: '//download.tsi.telecom-paristech.fr/gpac/DASH_CONFORMANCE/TelecomParisTech/mp4-main-single/mp4-main-single-mpd-AV-NBS.mpd',  // gjslint: disable=110

    encoder: shakaAssets.Encoder.MP4BOX,
    source: shakaAssets.Source.GPAC,
    drm: [],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_LIST_DURATION
    ]
  },
  {
    name: 'main profile, mutiple files',
    manifestUri: '//download.tsi.telecom-paristech.fr/gpac/DASH_CONFORMANCE/TelecomParisTech/mp4-main-multi/mp4-main-multi-mpd-AV-BS.mpd',  // gjslint: disable=110
    // NOTE: Multiple SPS/PPS in init segment, no sample duration
    // NOTE: Decoder errors on Mac
    // https://github.com/gpac/gpac/issues/600
    // https://bugs.webkit.org/show_bug.cgi?id=160459
    disabled: true,

    encoder: shakaAssets.Encoder.MP4BOX,
    source: shakaAssets.Source.GPAC,
    drm: [],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_LIST_DURATION
    ]
  },
  {
    name: 'onDemand profile',
    manifestUri: '//download.tsi.telecom-paristech.fr/gpac/DASH_CONFORMANCE/TelecomParisTech/mp4-onDemand/mp4-onDemand-mpd-AV.mpd',  // gjslint: disable=110

    encoder: shakaAssets.Encoder.MP4BOX,
    source: shakaAssets.Source.GPAC,
    drm: [],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_BASE
    ]
  },
  {
    name: 'main profile, open GOP',
    manifestUri: '//download.tsi.telecom-paristech.fr/gpac/DASH_CONFORMANCE/TelecomParisTech/mp4-main-ogop/mp4-main-ogop-mpd-AV-BS.mpd',  // gjslint: disable=110
    // NOTE: Segments do not start with keyframes
    // NOTE: Decoder errors on Safari
    // https://bugs.webkit.org/show_bug.cgi?id=160460
    disabled: true,

    encoder: shakaAssets.Encoder.MP4BOX,
    source: shakaAssets.Source.GPAC,
    drm: [],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_TEMPLATE_DURATION
    ]
  },
  {
    name: 'full profile, gradual decoding refresh',
    manifestUri: '//download.tsi.telecom-paristech.fr/gpac/DASH_CONFORMANCE/TelecomParisTech/mp4-full-gdr/mp4-full-gdr-mpd-AV-BS.mpd',  // gjslint: disable=110
    // NOTE: segments do not start with keyframes
    // NOTE: Decoder errors on Safari
    // https://bugs.webkit.org/show_bug.cgi?id=160460
    disabled: true,

    encoder: shakaAssets.Encoder.MP4BOX,
    source: shakaAssets.Source.GPAC,
    drm: [],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_TEMPLATE_DURATION
    ]
  }
  // }}}

  // TODO: Add a stable live stream with multiple periods.
];
