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
  EDASH_PACKAGER: 'eDash packager',
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
  WIDEVINE: 'com.widevine.alpha',
  PLAYREADY: 'com.microsoft.playready'
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
 *   licenseProcessor: (shaka.net.NetworkingEngine.ResponseFilter|undefined),
 *   drmCallback: (shakaExtern.DashContentProtectionCallback|undefined),
 *   clearKeys: (!Object.<string, string>|undefined)
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
 * @property {(shaka.net.NetworkingEngine.ResponseFilter|undefined)}
 *     licenseProcessor
 *   A callback to process license responses before they are passed to the CDM.
 * @property {(shakaExtern.DashContentProtectionCallback|undefined)} drmCallback
 *   A callback to use to interpret ContentProtection elements.
 * @property {(!Object.<string, string>|undefined)} clearKeys
 *   A map of key-id to key to use with clear-key encryption.
 */
shakaAssets.AssetInfo;
// }}}


// Custom callbacks {{{
/**
 * A license post-processor to process YouTube license repsponses.
 * @param {shaka.net.NetworkingEngine.RequestType} type
 * @param {shakaExtern.Response} response
 */
shakaAssets.YouTubePostProcessor = function(type, response) {
  if (type != shaka.net.NetworkingEngine.RequestType.LICENSE)
    return;

  // We are extracting an ASCII header and not reading the Stringified version
  // of the license thereafter, so this conversion is safe.
  var responseArray = new Uint8Array(response.data);
  var responseStr = String.fromCharCode.apply(null, responseArray);
  var index = responseStr.indexOf('\r\n\r\n');
  if (responseStr.startsWith('GLS/1.0') && index >= 0) {
    // Strip off the headers.
    // Create a new buffer to store the stripped data.  We have to create a new
    // Uint8Array and set so we can get the buffer.  When using subarray, the
    // buffer of the subarray still points to the original data.
    var subarray = responseArray.subarray(index + 4);
    var resultData = new Uint8Array(subarray.byteLength);
    resultData.set(subarray);
    response.data = resultData.buffer;
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
          initData: null
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

    encoder: shakaAssets.Encoder.EDASH_PACKAGER,
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
    name: 'Sintel 4k (multicodec)',
    manifestUri: '//storage.googleapis.com/shaka-demo-assets/sintel/dash.mpd',  // gjslint: disable=110

    encoder: shakaAssets.Encoder.EDASH_PACKAGER,
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
    name: 'Sintel 4k (multicodec, Widevine)',
    manifestUri: '//storage.googleapis.com/shaka-demo-assets/sintel-widevine/dash.mpd',  // gjslint: disable=110

    encoder: shakaAssets.Encoder.EDASH_PACKAGER,
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
    name: 'Heliocentrism (multicodec, multiperiod)',
    manifestUri: '//storage.googleapis.com/shaka-demo-assets/heliocentrism/heliocentrism.mpd',  // gjslint: disable=110

    encoder: shakaAssets.Encoder.EDASH_PACKAGER,
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

    encoder: shakaAssets.Encoder.EDASH_PACKAGER,
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
      shakaAssets.KeySystem.WIDEVINE,
      shakaAssets.KeySystem.PLAYREADY
    ],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_BASE
    ],

    drmCallback: shakaAssets.YouTubeCallback,
    licenseProcessor: shakaAssets.YouTubePostProcessor
  },
  // }}}

  // Axinom assets {{{
  // Src: https://github.com/Axinom/dash-test-vectors
  {
    name: 'Multi-DRM',
    manifestUri: '//media.axprod.net/TestVectors/v6-MultiDRM/Manifest.mpd',

    encoder: shakaAssets.Encoder.AXINOM,
    source: shakaAssets.Source.AXINOM,
    drm: [
      shakaAssets.KeySystem.WIDEVINE,
      shakaAssets.KeySystem.PLAYREADY
    ],
    features: [
      shakaAssets.Feature.HIGH_DEFINITION,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_TEMPLATE_DURATION,
      shakaAssets.Feature.ULTRA_HIGH_DEFINITION
    ],

    licenseServers: {
      'com.widevine.alpha': '//drm-widevine-licensing.axtest.net/AcquireLicense',  // gjslint: disable=110
      'com.microsoft.playready': '//drm-playready-licensing.axtest.net/AcquireLicense'  // gjslint: disable=110
    },
    licenseRequestHeaders: {
      'X-AxDRM-Message': 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ2ZXJzaW9uIjoxLCJjb21fa2V5X2lkIjoiNjllNTQwODgtZTllMC00NTMwLThjMWEtMWViNmRjZDBkMTRlIiwibWVzc2FnZSI6eyJ0eXBlIjoiZW50aXRsZW1lbnRfbWVzc2FnZSIsImtleXMiOlt7ImlkIjoiNmU1YTFkMjYtMjc1Ny00N2Q3LTgwNDYtZWFhNWQxZDM0YjVhIn1dfX0.yF7PflOPv9qHnu3ZWJNZ12jgkqTabmwXbDWk_47tLNE'  // gjslint: disable=110
    }
  },
  {
    name: 'Multi-DRM, multi-key',
    manifestUri: '//media.axprod.net/TestVectors/v6-MultiDRM-MultiKey/Manifest.mpd',  // gjslint: disable=110

    encoder: shakaAssets.Encoder.AXINOM,
    source: shakaAssets.Source.AXINOM,
    drm: [
      shakaAssets.KeySystem.WIDEVINE,
      shakaAssets.KeySystem.PLAYREADY
    ],
    features: [
      shakaAssets.Feature.HIGH_DEFINITION,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.MULTIKEY,
      shakaAssets.Feature.SEGMENT_TEMPLATE_DURATION,
      shakaAssets.Feature.ULTRA_HIGH_DEFINITION
    ],

    licenseServers: {
      'com.widevine.alpha': '//drm-widevine-licensing.axtest.net/AcquireLicense',  // gjslint: disable=110
      'com.microsoft.playready': '//drm-playready-licensing.axtest.net/AcquireLicense'  // gjslint: disable=110
    },
    licenseRequestHeaders: {
      'X-AxDRM-Message': 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ2ZXJzaW9uIjoxLCJjb21fa2V5X2lkIjoiNjllNTQwODgtZTllMC00NTMwLThjMWEtMWViNmRjZDBkMTRlIiwibWVzc2FnZSI6eyJ0eXBlIjoiZW50aXRsZW1lbnRfbWVzc2FnZSIsImtleXMiOlt7ImlkIjoiMTUzMGQzYTAtNjkwNC00NDZhLTkxYTEtMzNhMTE1YWE4YzQxIn0seyJpZCI6ImM4M2ViNjM5LWU2NjQtNDNmOC1hZTk4LTQwMzliMGMxM2IyZCJ9LHsiaWQiOiIzZDhjYzc2Mi0yN2FjLTQwMGYtOTg5Zi04YWI1ZGM3ZDc3NzUifSx7ImlkIjoiYmQ4ZGFkNTgtMDMyZC00YzI1LTg5ZmEtYzdiNzEwZTgyYWMyIn1dfX0.9t18lFmZFVHMzpoZxYDyqOS0Bk_evGhTBw_F2JnAK2k'  // gjslint: disable=110
    }
  },
  {
    name: 'Multi-DRM, multi-key, multi-Period',
    manifestUri: '//media.axprod.net/TestVectors/v6-MultiDRM-MultiKey-MultiPeriod/Manifest.mpd',  // gjslint: disable=110
    // NOTE: Some of period 1's audio is encrypted, and some of period 2's
    // audio is unencrypted.  This is something Chrome does not support at
    // this time.  See http://crbug.com/597443 for discussion and history.
    disabled: true,

    encoder: shakaAssets.Encoder.AXINOM,
    source: shakaAssets.Source.AXINOM,
    drm: [
      shakaAssets.KeySystem.WIDEVINE,
      shakaAssets.KeySystem.PLAYREADY
    ],
    features: [
      shakaAssets.Feature.HIGH_DEFINITION,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.MULTIKEY,
      shakaAssets.Feature.MULTIPERIOD,
      shakaAssets.Feature.SEGMENT_TEMPLATE_DURATION,
      shakaAssets.Feature.ULTRA_HIGH_DEFINITION
    ],

    licenseServers: {
      'com.widevine.alpha': '//drm-widevine-licensing.axtest.net/AcquireLicense',  // gjslint: disable=110
      'com.microsoft.playready': '//drm-playready-licensing.axtest.net/AcquireLicense'  // gjslint: disable=110
    },
    licenseRequestHeaders: {
      'X-AxDRM-Message': 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ2ZXJzaW9uIjoxLCJjb21fa2V5X2lkIjoiNjllNTQwODgtZTllMC00NTMwLThjMWEtMWViNmRjZDBkMTRlIiwibWVzc2FnZSI6eyJ0eXBlIjoiZW50aXRsZW1lbnRfbWVzc2FnZSIsImtleXMiOlt7ImlkIjoiNTNiZTc3NTctNzI4OC00YjZiLWIyMGEtZjA1YjY0YTRlZjc5In0seyJpZCI6IjBlZDgyMWE4LTgwZWQtNDBhYy1hODA0LTkyN2M5ZmRhZGJlOSJ9LHsiaWQiOiJlNDdkNzhjYS05NGRjLTQ1ZmItOWUzZC0yYTc3M2FlZjc0YjIifSx7ImlkIjoiMzJhMTQxZTktMjNhYi00NGZmLWE2YzctNTM0OWM4OTQ1MWNmIn0seyJpZCI6IjhkMDkxOTY2LTQ0YjUtNGNmOC04YTQ1LWVkMTJmZGIxOGQzNSJ9XX19.9YSK6QsDr4SYR7Q74ftq9mVtsT0ZkP3STE0zI-3mVIA'  // gjslint: disable=110
    }
  },
  {
    name: 'Multi-Period',
    manifestUri: '//media.axprod.net/TestVectors/v6-Clear/MultiPeriod_Manifest.mpd',  // gjslint: disable=110

    encoder: shakaAssets.Encoder.AXINOM,
    source: shakaAssets.Source.AXINOM,
    drm: [],
    features: [
      shakaAssets.Feature.HIGH_DEFINITION,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.MULTIPERIOD,
      shakaAssets.Feature.SEGMENT_TEMPLATE_DURATION,
      shakaAssets.Feature.ULTRA_HIGH_DEFINITION
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
      shakaAssets.Feature.SEGMENT_TEMPLATE_TIMELINE,
      shakaAssets.Feature.SEGMENTED_TEXT,
      shakaAssets.Feature.MP4,
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
    // FIXME: License servers are timing out as of 2016-03-23
    disabled: true,

    encoder: shakaAssets.Encoder.AZURE_MEDIA_SERVICES,
    source: shakaAssets.Source.AZURE_MEDIA_SERVICES,
    drm: [
      shakaAssets.KeySystem.WIDEVINE,
      shakaAssets.KeySystem.PLAYREADY
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
  }
  // TODO: Add open GOP and gradual decoding refresh assets once
  // https://crbug.com/229412 is resolved.  These assets have segments that
  // do not start with keyframes.
  // }}}

  // TODO: Add a stable live stream with multiple periods.
];
