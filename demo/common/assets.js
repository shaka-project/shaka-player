// vim: foldmethod=marker:foldmarker={{{,}}}
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
 *
 * Note: due to an issue with testing on Tizen 2017, we must use "var" at this
 * scope instead of "let".
 *
 * @class
 */
var shakaAssets = {};  // eslint-disable-line no-var


/** @enum {string} */
shakaAssets.Encoder = {
  UNKNOWN: 'Unknown',
  SHAKA_PACKAGER: 'Shaka packager',
  AXINOM: 'Axinom',
  UNIFIED_STREAMING: 'Unified Streaming',
  WOWZA: 'Wowza',
  BITCODIN: 'Bitcodin',
  NIMBLE_STREAMER: 'Nimble Streamer',
  AZURE_MEDIA_SERVICES: 'Azure Media Services',
  MP4BOX: 'MP4Box',
  APPLE: 'Apple',
  UPLYNK: 'Verizon Digital Media Services'
};


/** @enum {string} */
shakaAssets.Source = {
  SHAKA: 'Shaka',
  AXINOM: 'Axinom',
  UNIFIED_STREAMING: 'Unified Streaming',
  DASH_IF: 'DASH-IF',
  WOWZA: 'Wowza',
  BITCODIN: 'Bitcodin',
  NIMBLE_STREAMER: 'Nimble Streamer',
  AZURE_MEDIA_SERVICES: 'Azure Media Services',
  GPAC: 'GPAC',
  UPLYNK: 'Verizon Digital Media Services'
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
  SEGMENT_TEMPLATE_TIMELINE_TIME: 'SegmentTemplate w/ SegmentTimeline $Time$',
  SEGMENT_TEMPLATE_TIMELINE_NUMBER: 'SegmentTemplate w/ SegTimeline $Number$',

  PSSH: 'embedded PSSH',
  MULTIKEY: 'multiple keys',
  MULTIPERIOD: 'multiple Periods',
  ENCRYPTED_WITH_CLEAR: 'mixing encrypted and unencrypted periods',
  AESCTR_16_BYTE_IV: 'encrypted with AES CTR Mode using a 16 byte IV',
  AESCTR_8_BYTE_IV: 'encrypted with AES CTR Mode using a 8 byte IV',
  TRICK_MODE: 'special trick mode track',
  XLINK: 'xlink',

  SUBTITLES: 'subtitles',
  CAPTIONS: 'captions',
  SEGMENTED_TEXT: 'segmented text',
  EMBEDDED_TEXT: 'embedded text',
  MULTIPLE_LANGUAGES: 'multiple languages',
  OFFLINE: 'offline',

  LIVE: 'live',
  WEBM: 'WebM',
  MP4: 'mp4',
  MP2TS: 'MPEG-2 TS',
  TTML: 'TTML',
  WEBVTT: 'WebVTT',

  HIGH_DEFINITION: 'high definition',
  ULTRA_HIGH_DEFINITION: 'ultra-high definition',

  SURROUND: 'surround sound',

  HLS: 'HLS'
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
 *   certificateUri: (string|undefined),
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
 *   requestFilter: (shakaExtern.RequestFilter|undefined),
 *   responseFilter: (shakaExtern.ResponseFilter|undefined),
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
 * @property {(string|undefined)} certificateUri
 *   The URI of the DRM server certificate, if required to play this asset.
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
 * @property {(shakaExtern.RequestFilter|undefined)}
 *     requestFilter
 *   A filter on license requests before they are passed to the server.
 * @property {(shakaExtern.ResponseFilter|undefined)}
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
 * A response filter for VDMS Uplynk manifest responses.
 * This allows us to get the license prefix that is necessary
 * to later generate a proper license response.
 * @param {shaka.net.NetworkingEngine.RequestType} type
 * @param {shakaExtern.Response} response
 * The uplynk_prefix attribute is set on the shakaAssets object
 * and is later referenced in the UplynkRequestFilter.
 */
shakaAssets.UplynkResponseFilter = function(type, response) {
  if (type == shaka.net.NetworkingEngine.RequestType.MANIFEST) {
    // Parse a custom header that contains a value needed to build a proper
    // license server URL.
    if (response.headers['x-uplynk-prefix']) {
      shakaAssets.uplynk_prefix = response.headers['x-uplynk-prefix'];
    } else {
      shakaAssets.uplynk_prefix = '';
    }
  }
};


/**
 * A license request filter for VDMS Uplynk license requests.
 * @param {shaka.net.NetworkingEngine.RequestType} type
 * @param {shakaExtern.Request} request
 * The uplynk_prefix variable is retrieved from the shakaAssets
 * object, and requires that the uplynk manifest response filter also be set.
 */
shakaAssets.UplynkRequestFilter = function(type, request) {
  if (type == shaka.net.NetworkingEngine.RequestType.LICENSE) {
    // Modify the license request URL based on our cookie.
    if (request.uris[0].indexOf('wv') !== -1 &&
        shakaAssets.uplynk_prefix) {
      request.uris[0] = shakaAssets.uplynk_prefix.concat('/wv');
    } else if (request.uris[0].indexOf('ck') !== -1 &&
               shakaAssets.uplynk_prefix) {
      request.uris[0] = shakaAssets.uplynk_prefix.concat('/ck');
    } else if (request.uris[0].indexOf('pr') !== -1 &&
               shakaAssets.uplynk_prefix) {
      request.uris[0] = shakaAssets.uplynk_prefix.concat('/pr');
    }
  }
};
// }}}


/** @const {!Array.<shakaAssets.AssetInfo>} */
shakaAssets.testAssets = [
  // Shaka assets {{{
  {
    name: 'Angel One (multicodec, multilingual)',
    manifestUri: 'https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd',

    encoder: shakaAssets.Encoder.SHAKA_PACKAGER,
    source: shakaAssets.Source.SHAKA,
    drm: [],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.MULTIPLE_LANGUAGES,
      shakaAssets.Feature.SEGMENT_BASE,
      shakaAssets.Feature.SUBTITLES,
      shakaAssets.Feature.WEBM,
      shakaAssets.Feature.WEBVTT,
      shakaAssets.Feature.OFFLINE,
    ],
  },
  {
    name: 'Angel One (multicodec, multilingual, Widevine)',
    manifestUri: 'https://storage.googleapis.com/shaka-demo-assets/angel-one-widevine/dash.mpd',

    encoder: shakaAssets.Encoder.SHAKA_PACKAGER,
    source: shakaAssets.Source.SHAKA,
    drm: [shakaAssets.KeySystem.WIDEVINE],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.MULTIPLE_LANGUAGES,
      shakaAssets.Feature.SEGMENT_BASE,
      shakaAssets.Feature.SUBTITLES,
      shakaAssets.Feature.WEBM,
      shakaAssets.Feature.WEBVTT,
      shakaAssets.Feature.OFFLINE,
    ],

    licenseServers: {
      'com.widevine.alpha': 'https://cwip-shaka-proxy.appspot.com/no_auth'
    }
  },
  {
    name: 'Angel One (multicodec, multilingual, ClearKey server)',
    manifestUri: 'https://storage.googleapis.com/shaka-demo-assets/angel-one-clearkey/dash.mpd',

    encoder: shakaAssets.Encoder.SHAKA_PACKAGER,
    source: shakaAssets.Source.SHAKA,
    drm: [shakaAssets.KeySystem.CLEAR_KEY],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.MULTIPLE_LANGUAGES,
      shakaAssets.Feature.SEGMENT_BASE,
      shakaAssets.Feature.SUBTITLES,
      shakaAssets.Feature.WEBM,
      shakaAssets.Feature.WEBVTT,
      shakaAssets.Feature.OFFLINE,
    ],

    licenseServers: {
      'org.w3.clearkey': 'https://cwip-shaka-proxy.appspot.com/clearkey?_u3wDe7erb7v8Lqt8A3QDQ=ABEiM0RVZneImaq7zN3u_w'
    }
  },
  {
    name: 'Angel One (HLS, MP4, multilingual)',
    manifestUri: 'https://storage.googleapis.com/shaka-demo-assets/angel-one-hls/hls.m3u8',

    encoder: shakaAssets.Encoder.SHAKA_PACKAGER,
    source: shakaAssets.Source.SHAKA,
    drm: [],
    features: [
      shakaAssets.Feature.HLS,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.MULTIPLE_LANGUAGES,
      shakaAssets.Feature.OFFLINE,
    ],
  },
  {
    name: 'Angel One (HLS, MP4, multilingual, Widevine)',
    manifestUri: 'https://storage.googleapis.com/shaka-demo-assets/angel-one-widevine-hls/hls.m3u8',

    encoder: shakaAssets.Encoder.SHAKA_PACKAGER,
    source: shakaAssets.Source.SHAKA,
    drm: [shakaAssets.KeySystem.WIDEVINE],
    features: [
      shakaAssets.Feature.HLS,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.MULTIPLE_LANGUAGES,
      shakaAssets.Feature.OFFLINE,
    ],

    licenseServers: {
      'com.widevine.alpha': 'https://cwip-shaka-proxy.appspot.com/no_auth'
    }
  },
  {
    name: 'Sintel 4k (multicodec)',
    manifestUri: 'https://storage.googleapis.com/shaka-demo-assets/sintel/dash.mpd',

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
      shakaAssets.Feature.WEBVTT,
      shakaAssets.Feature.OFFLINE,
    ],
  },
  {
    name: 'Sintel w/ trick mode (MP4 only, 720p)',
    manifestUri: 'https://storage.googleapis.com/shaka-demo-assets/sintel-trickplay/dash.mpd',

    encoder: shakaAssets.Encoder.SHAKA_PACKAGER,
    source: shakaAssets.Source.SHAKA,
    drm: [],
    features: [
      shakaAssets.Feature.HIGH_DEFINITION,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_BASE,
      shakaAssets.Feature.SUBTITLES,
      shakaAssets.Feature.TRICK_MODE,
      shakaAssets.Feature.WEBVTT,
      shakaAssets.Feature.OFFLINE,
    ],
  },
  {
    name: 'Sintel 4k (WebM only)',
    manifestUri: 'https://storage.googleapis.com/shaka-demo-assets/sintel-webm-only/dash.mpd',
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
      shakaAssets.Feature.WEBVTT,
      shakaAssets.Feature.OFFLINE,
    ],
  },
  {
    name: 'Sintel 4k (MP4 only)',
    manifestUri: 'https://storage.googleapis.com/shaka-demo-assets/sintel-mp4-only/dash.mpd',

    encoder: shakaAssets.Encoder.SHAKA_PACKAGER,
    source: shakaAssets.Source.SHAKA,
    drm: [],
    features: [
      shakaAssets.Feature.HIGH_DEFINITION,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_BASE,
      shakaAssets.Feature.SUBTITLES,
      shakaAssets.Feature.ULTRA_HIGH_DEFINITION,
      shakaAssets.Feature.WEBVTT,
      shakaAssets.Feature.OFFLINE,
    ],
  },
  {
    name: 'Sintel 4k (multicodec, Widevine)',
    manifestUri: 'https://storage.googleapis.com/shaka-demo-assets/sintel-widevine/dash.mpd',

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
      shakaAssets.Feature.WEBVTT,
      shakaAssets.Feature.OFFLINE,
    ],

    licenseServers: {
      'com.widevine.alpha': 'https://cwip-shaka-proxy.appspot.com/no_auth'
    }
  },
  {
    name: 'Sintel 4k (multicodec, VTT in MP4)',
    manifestUri: 'https://storage.googleapis.com/shaka-demo-assets/sintel-mp4-wvtt/dash.mpd',

    encoder: shakaAssets.Encoder.SHAKA_PACKAGER,
    source: shakaAssets.Source.SHAKA,
    drm: [],
    features: [
      shakaAssets.Feature.EMBEDDED_TEXT,
      shakaAssets.Feature.HIGH_DEFINITION,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_BASE,
      shakaAssets.Feature.SUBTITLES,
      shakaAssets.Feature.ULTRA_HIGH_DEFINITION,
      shakaAssets.Feature.WEBM,
      shakaAssets.Feature.WEBVTT,
      shakaAssets.Feature.OFFLINE,
    ],
  },
  {
    name: 'Heliocentrism (multicodec, multiperiod)',
    manifestUri: 'https://storage.googleapis.com/shaka-demo-assets/heliocentrism/heliocentrism.mpd',

    encoder: shakaAssets.Encoder.SHAKA_PACKAGER,
    source: shakaAssets.Source.SHAKA,
    drm: [],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.MULTIPERIOD,
      shakaAssets.Feature.SEGMENT_BASE,
      shakaAssets.Feature.WEBM,
      shakaAssets.Feature.OFFLINE,
    ],
  },
  {
    name: 'Heliocentrism (multicodec, multiperiod, xlink)',
    manifestUri: 'https://storage.googleapis.com/shaka-demo-assets/heliocentrism-xlink/heliocentrism.mpd',

    encoder: shakaAssets.Encoder.SHAKA_PACKAGER,
    source: shakaAssets.Source.SHAKA,
    drm: [],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.MULTIPERIOD,
      shakaAssets.Feature.SEGMENT_BASE,
      shakaAssets.Feature.WEBM,
      shakaAssets.Feature.XLINK,
      shakaAssets.Feature.OFFLINE,
    ],
  },
  {
    name: '"Dig the Uke" by Stefan Kartenberg (audio only, multicodec)',
    // From: http://dig.ccmixter.org/files/JeffSpeed68/53327
    // Licensed under Creative Commons BY-NC 3.0.
    // Free for non-commercial use with attribution.
    // http://creativecommons.org/licenses/by-nc/3.0/
    manifestUri: 'https://storage.googleapis.com/shaka-demo-assets/dig-the-uke-clear/dash.mpd',

    encoder: shakaAssets.Encoder.SHAKA_PACKAGER,
    source: shakaAssets.Source.SHAKA,
    drm: [],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_BASE,
      shakaAssets.Feature.WEBM,
      shakaAssets.Feature.OFFLINE,
    ],
  },
  {
    name: '"Dig the Uke" by Stefan Kartenberg (audio only, multicodec, Widevine)',  // eslint-disable-line max-len
    // From: http://dig.ccmixter.org/files/JeffSpeed68/53327
    // Licensed under Creative Commons BY-NC 3.0.
    // Free for non-commercial use with attribution.
    // http://creativecommons.org/licenses/by-nc/3.0/
    manifestUri: 'https://storage.googleapis.com/shaka-demo-assets/dig-the-uke/dash.mpd',

    encoder: shakaAssets.Encoder.SHAKA_PACKAGER,
    source: shakaAssets.Source.SHAKA,
    drm: [shakaAssets.KeySystem.WIDEVINE],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_BASE,
      shakaAssets.Feature.WEBM,
      shakaAssets.Feature.OFFLINE,
    ],

    licenseServers: {
      'com.widevine.alpha': 'https://cwip-shaka-proxy.appspot.com/no_auth'
    }
  },
  {
    name: 'Tears of Steel (multicodec, TTML)',
    manifestUri: 'https://storage.googleapis.com/shaka-demo-assets/tos-ttml/dash.mpd',
    encoder: shakaAssets.Encoder.SHAKA_PACKAGER,
    source: shakaAssets.Source.SHAKA,
    drm: [],
    features: [
      shakaAssets.Feature.HIGH_DEFINITION,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_BASE,
      shakaAssets.Feature.SUBTITLES,
      shakaAssets.Feature.TTML,
      shakaAssets.Feature.WEBM,
      shakaAssets.Feature.OFFLINE,
    ],
  },
  {
    name: 'Tears of Steel (multicodec, surround + stereo)',
    manifestUri: 'https://storage.googleapis.com/shaka-demo-assets/tos-surround/dash.mpd',
    encoder: shakaAssets.Encoder.SHAKA_PACKAGER,
    source: shakaAssets.Source.SHAKA,
    drm: [],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_BASE,
      shakaAssets.Feature.SURROUND,
      shakaAssets.Feature.WEBM,
      shakaAssets.Feature.OFFLINE,
    ],
  },
  {
    name: 'Shaka Player History (multicodec, live, DASH)',
    manifestUri: 'https://storage.googleapis.com/shaka-live-assets/player-source.mpd',
    encoder: shakaAssets.Encoder.SHAKA_PACKAGER,
    source: shakaAssets.Source.SHAKA,
    drm: [],
    features: [
      shakaAssets.Feature.HIGH_DEFINITION,
      shakaAssets.Feature.LIVE,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_TEMPLATE_TIMELINE,
      shakaAssets.Feature.WEBM
    ]
  },
  {
    name: 'Shaka Player History (live, HLS)',
    manifestUri: 'https://storage.googleapis.com/shaka-live-assets/player-source.m3u8',
    encoder: shakaAssets.Encoder.SHAKA_PACKAGER,
    source: shakaAssets.Source.SHAKA,
    drm: [],
    features: [
      shakaAssets.Feature.HIGH_DEFINITION,
      shakaAssets.Feature.HLS,
      shakaAssets.Feature.LIVE,
      shakaAssets.Feature.MP4
    ]
  },
  // }}}

  // Axinom assets {{{
  // Src: https://github.com/Axinom/dash-test-vectors
  {
    name: 'Multi-DRM',
    manifestUri: 'https://media.axprod.net/TestVectors/v7-MultiDRM-SingleKey/Manifest.mpd',

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
      'com.widevine.alpha': 'https://drm-widevine-licensing.axtest.net/AcquireLicense',
      'com.microsoft.playready': 'https://drm-playready-licensing.axtest.net/AcquireLicense'
    },
    licenseRequestHeaders: {
      'X-AxDRM-Message': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZXJzaW9uIjoxLCJjb21fa2V5X2lkIjoiYjMzNjRlYjUtNTFmNi00YWUzLThjOTgtMzNjZWQ1ZTMxYzc4IiwibWVzc2FnZSI6eyJ0eXBlIjoiZW50aXRsZW1lbnRfbWVzc2FnZSIsImtleXMiOlt7ImlkIjoiOWViNDA1MGQtZTQ0Yi00ODAyLTkzMmUtMjdkNzUwODNlMjY2IiwiZW5jcnlwdGVkX2tleSI6ImxLM09qSExZVzI0Y3Iya3RSNzRmbnc9PSJ9XX19.4lWwW46k-oWcah8oN18LPj5OLS5ZU-_AQv7fe0JhNjA'  // eslint-disable-line max-len
    }
  },
  {
    name: 'Multi-DRM, multi-key',
    manifestUri: 'https://media.axprod.net/TestVectors/v7-MultiDRM-MultiKey/Manifest.mpd',

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
      'com.widevine.alpha': 'https://drm-widevine-licensing.axtest.net/AcquireLicense',
      'com.microsoft.playready': 'https://drm-playready-licensing.axtest.net/AcquireLicense'
    },
    licenseRequestHeaders: {
      'X-AxDRM-Message': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZXJzaW9uIjoxLCJjb21fa2V5X2lkIjoiYjMzNjRlYjUtNTFmNi00YWUzLThjOTgtMzNjZWQ1ZTMxYzc4IiwibWVzc2FnZSI6eyJ0eXBlIjoiZW50aXRsZW1lbnRfbWVzc2FnZSIsImtleXMiOlt7ImlkIjoiODAzOTliZjUtOGEyMS00MDE0LTgwNTMtZTI3ZTc0OGU5OGMwIiwiZW5jcnlwdGVkX2tleSI6ImxpTkpxVmFZa05oK01LY3hKRms3SWc9PSJ9LHsiaWQiOiI5MDk1M2UwOS02Y2IyLTQ5YTMtYTI2MC03YTVmZWZlYWQ0OTkiLCJlbmNyeXB0ZWRfa2V5Ijoia1l0SEh2cnJmQ01lVmRKNkxrYmtuZz09In0seyJpZCI6IjBlNGRhOTJiLWQwZTgtNGE2Ni04YzNmLWMyNWE5N2ViNjUzMiIsImVuY3J5cHRlZF9rZXkiOiI3dzdOWkhITE1nSjRtUUtFSzVMVE1RPT0ifSx7ImlkIjoiNTg1ZjIzM2YtMzA3Mi00NmYxLTlmYTQtNmRjMjJjNjZhMDE0IiwiZW5jcnlwdGVkX2tleSI6IkFjNFVVbVl0Qko1blBROU4xNXJjM2c9PSJ9LHsiaWQiOiI0MjIyYmQ3OC1iYzQ1LTQxYmYtYjYzZS02ZjgxNGRjMzkxZGYiLCJlbmNyeXB0ZWRfa2V5IjoiTzZGTzBmcVNXb3BwN2JqYy9ENGxNQT09In1dfX0.uF6YlKAREOmbniAeYiH070HSJhV0YS7zSKjlCtiDR5Y'  // eslint-disable-line max-len
    }
  },
  {
    name: 'Multi-DRM, multi-key, multi-Period',
    manifestUri: 'https://media.axprod.net/TestVectors/v7-MultiDRM-MultiKey-MultiPeriod/Manifest.mpd',

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
      'com.widevine.alpha': 'https://drm-widevine-licensing.axtest.net/AcquireLicense',
      'com.microsoft.playready': 'https://drm-playready-licensing.axtest.net/AcquireLicense'
    },
    licenseRequestHeaders: {
      'X-AxDRM-Message': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZXJzaW9uIjoxLCJjb21fa2V5X2lkIjoiYjMzNjRlYjUtNTFmNi00YWUzLThjOTgtMzNjZWQ1ZTMxYzc4IiwibWVzc2FnZSI6eyJ0eXBlIjoiZW50aXRsZW1lbnRfbWVzc2FnZSIsImtleXMiOlt7ImlkIjoiMDg3Mjc4NmUtZjllNy00NjVmLWEzYTItNGU1YjBlZjhmYTQ1IiwiZW5jcnlwdGVkX2tleSI6IlB3NitlRVlOY3ZqWWJmc2gzWDNmbWc9PSJ9LHsiaWQiOiJjMTRmMDcwOS1mMmI5LTQ0MjctOTE2Yi02MWI1MjU4NjUwNmEiLCJlbmNyeXB0ZWRfa2V5IjoiLzErZk5paDM4bXFSdjR5Y1l6bnQvdz09In0seyJpZCI6IjhiMDI5ZTUxLWQ1NmEtNDRiZC05MTBmLWQ0YjVmZDkwZmJhMiIsImVuY3J5cHRlZF9rZXkiOiJrcTBKdVpFanBGTjhzYVRtdDU2ME9nPT0ifSx7ImlkIjoiMmQ2ZTkzODctNjBjYS00MTQ1LWFlYzItYzQwODM3YjRiMDI2IiwiZW5jcnlwdGVkX2tleSI6IlRjUlFlQld4RW9IT0tIcmFkNFNlVlE9PSJ9LHsiaWQiOiJkZTAyZjA3Zi1hMDk4LTRlZTAtYjU1Ni05MDdjMGQxN2ZiYmMiLCJlbmNyeXB0ZWRfa2V5IjoicG9lbmNTN0dnbWVHRmVvSjZQRUFUUT09In0seyJpZCI6IjkxNGU2OWY0LTBhYjMtNDUzNC05ZTlmLTk4NTM2MTVlMjZmNiIsImVuY3J5cHRlZF9rZXkiOiJlaUkvTXNsbHJRNHdDbFJUL0xObUNBPT0ifSx7ImlkIjoiZGE0NDQ1YzItZGI1ZS00OGVmLWIwOTYtM2VmMzQ3YjE2YzdmIiwiZW5jcnlwdGVkX2tleSI6IjJ3K3pkdnFycERWM3hSMGJKeTR1Z3c9PSJ9LHsiaWQiOiIyOWYwNWU4Zi1hMWFlLTQ2ZTQtODBlOS0yMmRjZDQ0Y2Q3YTEiLCJlbmNyeXB0ZWRfa2V5IjoiL3hsU0hweHdxdTNnby9nbHBtU2dhUT09In0seyJpZCI6IjY5ZmU3MDc3LWRhZGQtNGI1NS05NmNkLWMzZWRiMzk5MTg1MyIsImVuY3J5cHRlZF9rZXkiOiJ6dTZpdXpOMnBzaTBaU3hRaUFUa1JRPT0ifV19fQ.BXr93Et1krYMVs-CUnf7F3ywJWFRtxYdkR7Qn4w3-to'  // eslint-disable-line max-len
    }
  },
  {
    name: 'Clear, single-Period',
    manifestUri: 'https://media.axprod.net/TestVectors/v7-Clear/Manifest.mpd',

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
      shakaAssets.Feature.WEBVTT,
      shakaAssets.Feature.OFFLINE,
    ],
  },
  {
    name: 'Clear, multi-Period',
    manifestUri: 'https://media.axprod.net/TestVectors/v7-Clear/Manifest_MultiPeriod.mpd',

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
      shakaAssets.Feature.WEBVTT,
      shakaAssets.Feature.OFFLINE,
    ],
  },
  {
    name: 'Clear, Live DASH',
    manifestUri: 'https://akamai-axtest.akamaized.net/routes/lapd-v1-acceptance/www_c4/Manifest.mpd',

    encoder: shakaAssets.Encoder.AXINOM,
    source: shakaAssets.Source.AXINOM,
    drm: [],
    features: [
      shakaAssets.Feature.EMBEDDED_TEXT,
      shakaAssets.Feature.LIVE,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_TEMPLATE_DURATION,
      shakaAssets.Feature.WEBVTT
    ]
  },
  {
    name: 'Clear, Live HLS',
    manifestUri: 'https://akamai-axtest.akamaized.net/routes/lapd-v1-acceptance/www_c4/Manifest.m3u8',

    encoder: shakaAssets.Encoder.AXINOM,
    source: shakaAssets.Source.AXINOM,
    drm: [],
    features: [
      shakaAssets.Feature.HLS,
      shakaAssets.Feature.LIVE,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.WEBVTT
    ]
  },
  // }}}

  // Unified Streaming {{{
  // Src: http://demo.unified-streaming.com/features.html
  {
    name: 'Tears of Steel',
    manifestUri: 'https://demo.unified-streaming.com/video/tears-of-steel/tears-of-steel.ism/.mpd',

    encoder: shakaAssets.Encoder.UNIFIED_STREAMING,
    source: shakaAssets.Source.UNIFIED_STREAMING,
    drm: [],
    features: [
      shakaAssets.Feature.HIGH_DEFINITION,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_TEMPLATE_TIMELINE,
      shakaAssets.Feature.ULTRA_HIGH_DEFINITION,
      shakaAssets.Feature.OFFLINE,
    ],
  },
  {
    name: 'Tears of Steel (Widevine)',
    manifestUri: 'https://demo.unified-streaming.com/video/tears-of-steel/tears-of-steel-dash-widevine.ism/.mpd',

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
      'com.widevine.alpha': 'https://cwip-shaka-proxy.appspot.com/no_auth'
    }
  },
  {
    name: 'Tears of Steel (PlayReady)',
    manifestUri: 'https://demo.unified-streaming.com/video/tears-of-steel/tears-of-steel-dash-playready.ism/.mpd',

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
      'com.microsoft.playready': 'https://test.playready.microsoft.com/service/rightsmanager.asmx?PlayRight=1&UseSimpleNonPersistentLicense=1'
    }
  },
  {
    name: 'Tears of Steel (subtitles)',
    manifestUri: 'https://demo.unified-streaming.com/video/tears-of-steel/tears-of-steel-en.ism/.mpd',

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
      shakaAssets.Feature.ULTRA_HIGH_DEFINITION,
      shakaAssets.Feature.OFFLINE,
    ],
  },
  // }}}

  // DASH-IF assets {{{
  // Src: http://dashif.org/test-vectors/
  {
    name: 'Big Buck Bunny',
    manifestUri: 'https://dash.akamaized.net/dash264/TestCases/1c/qualcomm/2/MultiRate.mpd',

    encoder: shakaAssets.Encoder.UNKNOWN,
    source: shakaAssets.Source.DASH_IF,
    drm: [],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_TEMPLATE_TIMELINE,
      shakaAssets.Feature.OFFLINE,
    ],
  },
  {
    name: 'Live sim (2s segments)',
    manifestUri: 'https://livesim.dashif.org/livesim/utc_head/testpic_2s/Manifest.mpd',

    encoder: shakaAssets.Encoder.UNKNOWN,
    source: shakaAssets.Source.DASH_IF,
    drm: [],
    features: [
      shakaAssets.Feature.LIVE,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_TEMPLATE_DURATION,
    ],
  },
  {
    name: 'Live sim SegmentTimeline w $Time$ (6s segments)',
    manifestUri: 'https://livesim.dashif.org/livesim/segtimeline_1/utc_head/testpic_6s/Manifest.mpd',

    encoder: shakaAssets.Encoder.UNKNOWN,
    source: shakaAssets.Source.DASH_IF,
    drm: [],
    features: [
      shakaAssets.Feature.LIVE,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_TEMPLATE_TIMELINE_TIME,
    ],
  },
  {
    name: 'Live sim SegmentTimeline w $Number$ (6s segments)',
    manifestUri: 'https://livesim.dashif.org/livesim/segtimelinenr_1/utc_head/testpic_6s/Manifest.mpd',

    encoder: shakaAssets.Encoder.UNKNOWN,
    source: shakaAssets.Source.DASH_IF,
    drm: [],
    features: [
      shakaAssets.Feature.LIVE,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_TEMPLATE_TIMELINE_NUMBER,
    ],
  },
  {
    name: 'Live sim SegmentTimeline StartOver [-20s, +20s] (2s segments)',
    manifestUri: 'https://livesim.dashif.org/livesim/segtimeline_1/startrel_-20/stoprel_20/timeoffset_0/testpic_2s/Manifest.mpd',

    encoder: shakaAssets.Encoder.UNKNOWN,
    source: shakaAssets.Source.DASH_IF,
    drm: [],
    features: [
      shakaAssets.Feature.LIVE,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_TEMPLATE_TIMELINE_TIME,
    ],
  },
  {
    name: 'Live sim StartOver SegTmpl Duration [-20s, +20s] (2s segments)',
    manifestUri: 'https://livesim.dashif.org/livesim/startrel_-20/stoprel_20/timeoffset_0/testpic_2s/Manifest.mpd',

    encoder: shakaAssets.Encoder.UNKNOWN,
    source: shakaAssets.Source.DASH_IF,
    drm: [],
    features: [
      shakaAssets.Feature.LIVE,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_TEMPLATE_DURATION,
    ],
  },
  {
    name: 'Live sim SegTmpl Duration (multi-period 60s)',
    manifestUri: 'https://livesim.dashif.org/livesim/utc_head/periods_60/testpic_2s/Manifest.mpd',

    encoder: shakaAssets.Encoder.UNKNOWN,
    source: shakaAssets.Source.DASH_IF,
    drm: [],
    features: [
      shakaAssets.Feature.LIVE,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.MULTIPERIOD,
      shakaAssets.Feature.SEGMENT_TEMPLATE_DURATION,
    ],
  },
  // }}}

  // Wowza assets {{{
  // Src: http://www.dash-player.com/demo/streaming-server-and-encoder-support/
  {
    name: 'Big Buck Bunny (Live)',
    manifestUri: 'https://wowzaec2demo.streamlock.net/live/bigbuckbunny/manifest_mpm4sav_mvtime.mpd',

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
  // Src: https://bitmovin.com/mpeg-dash-hls-examples-sample-streams/
  {
    name: 'Art of Motion (DASH)',
    manifestUri: 'https://bitdash-a.akamaihd.net/content/MI201109210084_1/mpds/f08e80da-bf1d-4e3d-8899-f0f6155f6efa.mpd',

    encoder: shakaAssets.Encoder.BITCODIN,
    source: shakaAssets.Source.BITCODIN,
    drm: [],
    features: [
      shakaAssets.Feature.HIGH_DEFINITION,
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_TEMPLATE_DURATION,
      shakaAssets.Feature.OFFLINE,
    ],
  },
  {
    name: 'Art of Motion (HLS, TS)',
    manifestUri: 'https://bitdash-a.akamaihd.net/content/MI201109210084_1/m3u8s/f08e80da-bf1d-4e3d-8899-f0f6155f6efa.m3u8',

    encoder: shakaAssets.Encoder.BITCODIN,
    source: shakaAssets.Source.BITCODIN,
    drm: [],
    features: [
      shakaAssets.Feature.HIGH_DEFINITION,
      shakaAssets.Feature.HLS,
      shakaAssets.Feature.MP2TS,
      shakaAssets.Feature.OFFLINE,
    ],
  },
  {
    name: 'Sintel (HLS, TS, 4k)',
    manifestUri: 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8',

    encoder: shakaAssets.Encoder.BITCODIN,
    source: shakaAssets.Source.BITCODIN,
    drm: [],
    features: [
      shakaAssets.Feature.HIGH_DEFINITION,
      shakaAssets.Feature.HLS,
      shakaAssets.Feature.MP2TS,
      shakaAssets.Feature.ULTRA_HIGH_DEFINITION,
      shakaAssets.Feature.OFFLINE,
    ],
  },
  // }}}

  // Nimble Streamer assets {{{
  // Src: http://www.dash-player.com/demo/streaming-server-and-encoder-support/
  {
    name: 'Big Buck Bunny',
    manifestUri: 'https://video.wmspanel.com/local/raw/BigBuckBunny_320x180.mp4/manifest.mpd',
    // As of 2017-08-04, there is a common name mismatch error with this site's
    // SSL certificate.  See https://github.com/google/shaka-player/issues/955
    disabled: true,

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
    manifestUri: 'https://amssamples.streaming.mediaservices.windows.net/91492735-c523-432b-ba01-faba6c2206a2/AzureMediaServicesPromo.ism/manifest(format=mpd-time-csf)',

    encoder: shakaAssets.Encoder.AZURE_MEDIA_SERVICES,
    source: shakaAssets.Source.AZURE_MEDIA_SERVICES,
    drm: [],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_TEMPLATE_TIMELINE,
      shakaAssets.Feature.OFFLINE,
    ],
  },
  {
    name: 'Big Buck Bunny',
    manifestUri: 'https://amssamples.streaming.mediaservices.windows.net/622b189f-ec39-43f2-93a2-201ac4e31ce1/BigBuckBunny.ism/manifest(format=mpd-time-csf)',

    encoder: shakaAssets.Encoder.AZURE_MEDIA_SERVICES,
    source: shakaAssets.Source.AZURE_MEDIA_SERVICES,
    drm: [
      shakaAssets.KeySystem.PLAYREADY,
      shakaAssets.KeySystem.WIDEVINE
    ],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_TEMPLATE_TIMELINE,
      shakaAssets.Feature.OFFLINE,
    ],

    licenseServers: {
      'com.widevine.alpha': 'https://amssamples.keydelivery.mediaservices.windows.net/Widevine/?KID=1ab45440-532c-4399-94dc-5c5ad9584bac',
      'com.microsoft.playready': 'https://amssamples.keydelivery.mediaservices.windows.net/PlayReady/'
    }
  },
  {
    name: 'Tears Of Steel (external text)',
    manifestUri: 'https://ams-samplescdn.streaming.mediaservices.windows.net/11196e3d-2f40-4835-9a4d-fc52751b0323/TearsOfSteel_WAMEH264SmoothStreaming720p.ism/manifest(format=mpd-time-csf)',
    extraText: [
      {
        uri: 'https://ams-samplescdn.streaming.mediaservices.windows.net/11196e3d-2f40-4835-9a4d-fc52751b0323/TOS-en.vtt',
        language: 'en',
        kind: 'subtitle',
        mime: 'text/vtt'
      },
      {
        uri: 'https://ams-samplescdn.streaming.mediaservices.windows.net/11196e3d-2f40-4835-9a4d-fc52751b0323/TOS-es.vtt',
        language: 'es',
        kind: 'subtitle',
        mime: 'text/vtt'
      },
      {
        uri: 'https://ams-samplescdn.streaming.mediaservices.windows.net/11196e3d-2f40-4835-9a4d-fc52751b0323/TOS-fr.vtt',
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
      shakaAssets.Feature.WEBVTT,
      shakaAssets.Feature.OFFLINE,
    ],
  },
  // }}}

  // GPAC assets {{{
  // Src: https://gpac.wp.mines-telecom.fr/2012/02/23/dash-sequences/
  // NOTE: The assets here using the "live profile" are not actually
  // "live streams".  The content is still static, as is the timeline.
  {
    name: 'live profile',
    manifestUri: 'https://download.tsi.telecom-paristech.fr/gpac/DASH_CONFORMANCE/TelecomParisTech/mp4-live/mp4-live-mpd-AV-BS.mpd',
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
    manifestUri: 'https://download.tsi.telecom-paristech.fr/gpac/DASH_CONFORMANCE/TelecomParisTech/mp4-live-periods/mp4-live-periods-mpd.mpd',

    encoder: shakaAssets.Encoder.MP4BOX,
    source: shakaAssets.Source.GPAC,
    drm: [],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.MULTIPERIOD,
      shakaAssets.Feature.SEGMENT_TEMPLATE_DURATION,
      shakaAssets.Feature.OFFLINE,
    ],
  },
  {
    name: 'main profile, single file',
    manifestUri: 'https://download.tsi.telecom-paristech.fr/gpac/DASH_CONFORMANCE/TelecomParisTech/mp4-main-single/mp4-main-single-mpd-AV-NBS.mpd',

    encoder: shakaAssets.Encoder.MP4BOX,
    source: shakaAssets.Source.GPAC,
    drm: [],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_LIST_DURATION,
      shakaAssets.Feature.OFFLINE,
    ],
  },
  {
    name: 'main profile, mutiple files',
    manifestUri: 'https://download.tsi.telecom-paristech.fr/gpac/DASH_CONFORMANCE/TelecomParisTech/mp4-main-multi/mp4-main-multi-mpd-AV-BS.mpd',
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
    manifestUri: 'https://download.tsi.telecom-paristech.fr/gpac/DASH_CONFORMANCE/TelecomParisTech/mp4-onDemand/mp4-onDemand-mpd-AV.mpd',

    encoder: shakaAssets.Encoder.MP4BOX,
    source: shakaAssets.Source.GPAC,
    drm: [],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.SEGMENT_BASE,
      shakaAssets.Feature.OFFLINE,
    ],
  },
  {
    name: 'main profile, open GOP',
    manifestUri: 'https://download.tsi.telecom-paristech.fr/gpac/DASH_CONFORMANCE/TelecomParisTech/mp4-main-ogop/mp4-main-ogop-mpd-AV-BS.mpd',
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
    manifestUri: 'https://download.tsi.telecom-paristech.fr/gpac/DASH_CONFORMANCE/TelecomParisTech/mp4-full-gdr/mp4-full-gdr-mpd-AV-BS.mpd',
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
  },
  // }}}

  // Verizon Digital Media Services (VDMS) assets {{{
  {
    name: 'Multi DRM - 8 Byte IV',
    // Reliable Playready playback requires Edge 16+
    // The playenabler and sl url parameters allow for playback in VMs
    manifestUri: 'https://content.uplynk.com/847859273a4b4a81959d8fea181672a4.mpd?pr.version=2&pr.playenabler=B621D91F-EDCC-4035-8D4B-DC71760D43E9&pr.securitylevel=150',
    encoder: shakaAssets.Encoder.UPLYNK,
    source: shakaAssets.Source.UPLYNK,
    drm: [
      shakaAssets.KeySystem.PLAYREADY,
      shakaAssets.KeySystem.WIDEVINE
    ],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.PSSH,
      shakaAssets.Feature.MULTIKEY,
      shakaAssets.Feature.AESCTR_8_BYTE_IV,
      shakaAssets.Feature.SEGMENT_LIST_DURATION,
      shakaAssets.Feature.HIGH_DEFINITION
    ],
    licenseServers: {
      'com.microsoft.playready': 'https://content.uplynk.com/pr',
      'com.widevine.alpha': 'https://content.uplynk.com/wv'
    },
    requestFilter: shakaAssets.UplynkRequestFilter,
    responseFilter: shakaAssets.UplynkResponseFilter
  },
  {
    name: 'Multi DRM - MultiPeriod - 8 Byte IV',
    // Reliable Playready playback requires Edge 16+
    // The playenabler and sl url parameters allow for playback in VMs
    manifestUri: 'https://content.uplynk.com/054225d59be2454fabdca3e96912d847.mpd?ad=cleardash&pr.version=2&pr.playenabler=B621D91F-EDCC-4035-8D4B-DC71760D43E9&pr.securitylevel=150',
    encoder: shakaAssets.Encoder.UPLYNK,
    source: shakaAssets.Source.UPLYNK,
    drm: [
      shakaAssets.KeySystem.PLAYREADY,
      shakaAssets.KeySystem.WIDEVINE
    ],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.PSSH,
      shakaAssets.Feature.MULTIKEY,
      shakaAssets.Feature.MULTIPERIOD,
      shakaAssets.Feature.SEGMENT_LIST_DURATION,
      shakaAssets.Feature.AESCTR_8_BYTE_IV,
      shakaAssets.Feature.HIGH_DEFINITION
    ],
    licenseServers: {
      'com.microsoft.playready': 'https://content.uplynk.com/pr',
      'com.widevine.alpha': 'https://content.uplynk.com/wv'
    },
    requestFilter: shakaAssets.UplynkRequestFilter,
    responseFilter: shakaAssets.UplynkResponseFilter
  },
  {
    name: 'Widevine - 16 Byte IV',
    manifestUri: 'https://content.uplynk.com/224ac8717e714b68831997ab6cea4015.mpd',
    encoder: shakaAssets.Encoder.UPLYNK,
    source: shakaAssets.Source.UPLYNK,
    drm: [
      shakaAssets.KeySystem.WIDEVINE
    ],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.PSSH,
      shakaAssets.Feature.MULTIKEY,
      shakaAssets.Feature.AESCTR_16_BYTE_IV,
      shakaAssets.Feature.SEGMENT_LIST_DURATION,
      shakaAssets.Feature.HIGH_DEFINITION
    ],
    licenseServers: {
      'com.widevine.alpha': 'https://content.uplynk.com/wv'
    },
    requestFilter: shakaAssets.UplynkRequestFilter,
    responseFilter: shakaAssets.UplynkResponseFilter
  },
  {
    name: 'Widevine - 16 Byte IV - (mix of encrypted and unencrypted periods)',
    // Unencrypted periods interspersed with protected periods
    // Doesn't work on Chrome < 58
    manifestUri: 'https://content.uplynk.com/1eb40d8e64234f5c9879db7045c3d48c.mpd?ad=cleardash&rays=cdefg',

    encoder: shakaAssets.Encoder.UPLYNK,
    source: shakaAssets.Source.UPLYNK,
    drm: [
      shakaAssets.KeySystem.WIDEVINE
    ],
    features: [
      shakaAssets.Feature.MP4,
      shakaAssets.Feature.MULTIPLE_LANGUAGES,
      shakaAssets.Feature.SEGMENT_LIST_DURATION,
      shakaAssets.Feature.PSSH,
      shakaAssets.Feature.HIGH_DEFINITION,
      shakaAssets.Feature.MULTIPERIOD,
      shakaAssets.Feature.MULTIKEY,
      shakaAssets.Feature.AESCTR_16_BYTE_IV,
      shakaAssets.Feature.ENCRYPTED_WITH_CLEAR
    ],
    licenseServers: {
      'com.widevine.alpha': 'https://content.uplynk.com/wv'
    },
    requestFilter: shakaAssets.UplynkRequestFilter,
    responseFilter: shakaAssets.UplynkResponseFilter
  }
  // }}}
];
