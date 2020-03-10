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


goog.require('ShakaDemoAssetInfo');


// Types and enums {{{
/**
 * A container for demo assets.
 * @class
 */
const shakaAssets = {};


/** @enum {string} */
shakaAssets.Source = {
  CUSTOM: 'Custom',
  SHAKA: 'Shaka',
  AXINOM: 'Axinom',
  UNIFIED_STREAMING: 'Unified Streaming',
  DASH_IF: 'DASH-IF',
  BITCODIN: 'Bitcodin',
  NIMBLE_STREAMER: 'Nimble Streamer',
  AZURE_MEDIA_SERVICES: 'Azure Media Services',
  GPAC: 'GPAC',
  UPLYNK: 'Verizon Digital Media Services',
  APPLE: 'Apple',
  IRT: 'IRT',
};


/** @enum {string} */
shakaAssets.KeySystem = {
  CLEAR_KEY: 'org.w3.clearkey',
  FAIRPLAY: 'com.apple.fps.1_0',
  PLAYREADY: 'com.microsoft.playready',
  WIDEVINE: 'com.widevine.alpha',
  CLEAR: 'no drm protection',
};


/** @enum {string} */
shakaAssets.Feature = {
  // Set if the asset has more than one drm key defined.
  MULTIKEY: 'multiple keys',
  // Set if the asset has multiple periods.
  MULTIPERIOD: 'multiple Periods',
  ENCRYPTED_WITH_CLEAR: 'mixing encrypted and unencrypted periods',
  AESCTR_16_BYTE_IV: 'encrypted with AES CTR Mode using a 16 byte IV',
  AESCTR_8_BYTE_IV: 'encrypted with AES CTR Mode using a 8 byte IV',
  // Set if the asset has a special trick mode track, for rewinding effects.
  TRICK_MODE: 'Special trick mode track',
  XLINK: 'XLink',

  // Set if the asset has any subtitle tracks.
  SUBTITLES: 'Subtitles',
  // Set if the asset has any closed caption tracks.
  CAPTIONS: 'Captions',
  EMBEDDED_TEXT: 'embedded text',
  // Set if the asset has multiple audio languages.
  MULTIPLE_LANGUAGES: 'multiple languages',
  // Set if the asset is audio-only.
  AUDIO_ONLY: 'audio only',
  // Set if the asset can be stored offline.
  OFFLINE: 'Downloadable',
  // A synthetic property used in the "all content" tab. Should not be given to
  // assets.
  STORED: 'Downloaded',

  // Set if the asset is a livestream.
  LIVE: 'Live',
  // A synthetic property used if the asset is VOD (not-livestream).
  VOD: 'VOD',
  // Set if the asset has at least one WebM stream.
  WEBM: 'WebM',
  // Set if the asset has at least one mp4 stream.
  MP4: 'MP4',
  // Set if the asset has at least one MPEG-2 TS stream.
  MP2TS: 'MPEG-2 TS',
  // Set if the asset has at least one TTML text track.
  TTML: 'TTML',
  // Set if the asset has at least one WEBVTT text track.
  WEBVTT: 'WebVTT',

  // Set if the asset has at least one stream that is at least 720p.
  HIGH_DEFINITION: 'High definition',
  // Set if the asset has at least one stream that is at least 4k.
  ULTRA_HIGH_DEFINITION: 'Ultra-high definition',

  // Set if the asset has at least one stream that is surround sound.
  SURROUND: 'Surround sound',

  // Set if the asset is a MPEG-DASH manifest.
  DASH: 'DASH',
  // Set if the asset is an HLS manifest.
  HLS: 'HLS',
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
// }}}


// Custom callbacks {{{
/**
 * A response filter for VDMS Uplynk manifest responses.
 * This allows us to get the license prefix that is necessary
 * to later generate a proper license response.
 * @param {shaka.net.NetworkingEngine.RequestType} type
 * @param {shaka.extern.Response} response
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
 * @param {shaka.extern.Request} request
 * The uplynk_prefix variable is retrieved from the shakaAssets
 * object, and requires that the uplynk manifest response filter also be set.
 */
shakaAssets.UplynkRequestFilter = function(type, request) {
  if (type == shaka.net.NetworkingEngine.RequestType.LICENSE) {
    // Modify the license request URL based on our cookie.
    if (request.uris[0].includes('wv') &&
        shakaAssets.uplynk_prefix) {
      request.uris[0] = shakaAssets.uplynk_prefix.concat('/wv');
    } else if (request.uris[0].includes('ck') &&
               shakaAssets.uplynk_prefix) {
      request.uris[0] = shakaAssets.uplynk_prefix.concat('/ck');
    } else if (request.uris[0].includes('pr') &&
               shakaAssets.uplynk_prefix) {
      request.uris[0] = shakaAssets.uplynk_prefix.concat('/pr');
    }
  }
};
// }}}


/** @const {!Array.<!ShakaDemoAssetInfo>} */
shakaAssets.testAssets = [
  // Shaka assets {{{
  new ShakaDemoAssetInfo(
      /* name= */ 'Big Buck Bunny: the Dark Truths of a Video Dev Cartoon (DASH)', // eslint-disable-line max-len
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dark_truth.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/bbb-dark-truths/dash.mpd',
      /* source= */ shakaAssets.Source.SHAKA)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.WEBM)
    .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Big Buck Bunny: the Dark Truths of a Video Dev Cartoon (HLS)', // eslint-disable-line max-len
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dark_truth.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/bbb-dark-truths-hls/hls.m3u8',
      /* source= */ shakaAssets.Source.SHAKA)
    .addDescription('A serious documentary about a problem plaguing video developers.') // eslint-disable-line max-len
    .markAsFeatured('Big Buck Bunny: the Dark Truths')
    .addFeature(shakaAssets.Feature.HLS)
    .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Angel One (multicodec, multilingual)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/angel_one.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd',
      /* source= */ shakaAssets.Source.SHAKA)
    .addDescription('A clip from a classic Star Trek TNG episode, presented in MPEG-DASH.') // eslint-disable-line max-len
    .markAsFeatured('Angel One')
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.MULTIPLE_LANGUAGES)
    .addFeature(shakaAssets.Feature.SUBTITLES)
    .addFeature(shakaAssets.Feature.WEBM)
    .addFeature(shakaAssets.Feature.WEBVTT)
    .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Angel One (multicodec, multilingual, Widevine)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/angel_one.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/angel-one-widevine/dash.mpd',
      /* source= */ shakaAssets.Source.SHAKA)
    .addKeySystem(shakaAssets.KeySystem.WIDEVINE)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.MULTIPLE_LANGUAGES)
    .addFeature(shakaAssets.Feature.SUBTITLES)
    .addFeature(shakaAssets.Feature.MULTIKEY)
    .addFeature(shakaAssets.Feature.WEBM)
    .addFeature(shakaAssets.Feature.WEBVTT)
    .addFeature(shakaAssets.Feature.OFFLINE)
    .addLicenseServer('com.widevine.alpha', 'https://cwip-shaka-proxy.appspot.com/no_auth'),
  new ShakaDemoAssetInfo(
      /* name= */ 'Angel One (multicodec, multilingual, ClearKey server)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/angel_one.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/angel-one-clearkey/dash.mpd',
      /* source= */ shakaAssets.Source.SHAKA)
    .addKeySystem(shakaAssets.KeySystem.CLEAR_KEY)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.MULTIPLE_LANGUAGES)
    .addFeature(shakaAssets.Feature.SUBTITLES)
    .addFeature(shakaAssets.Feature.WEBM)
    .addFeature(shakaAssets.Feature.WEBVTT)
    .addFeature(shakaAssets.Feature.OFFLINE)
    .addLicenseServer('org.w3.clearkey', 'https://cwip-shaka-proxy.appspot.com/clearkey?_u3wDe7erb7v8Lqt8A3QDQ=ABEiM0RVZneImaq7zN3u_w'),
  new ShakaDemoAssetInfo(
      /* name= */ 'Angel One (HLS, MP4, multilingual)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/angel_one.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/angel-one-hls/hls.m3u8',
      /* source= */ shakaAssets.Source.SHAKA)
    .addFeature(shakaAssets.Feature.HLS)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.MULTIPLE_LANGUAGES)
    .addFeature(shakaAssets.Feature.SUBTITLES)
    .addFeature(shakaAssets.Feature.SURROUND)
    .addFeature(shakaAssets.Feature.WEBVTT)
    .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Angel One (HLS, MP4, multilingual, Widevine)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/angel_one.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/angel-one-widevine-hls/hls.m3u8',
      /* source= */ shakaAssets.Source.SHAKA)
    .addKeySystem(shakaAssets.KeySystem.WIDEVINE)
    .addFeature(shakaAssets.Feature.HLS)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.MULTIPLE_LANGUAGES)
    .addFeature(shakaAssets.Feature.SUBTITLES)
    .addFeature(shakaAssets.Feature.SURROUND)
    .addFeature(shakaAssets.Feature.MULTIKEY)
    .addFeature(shakaAssets.Feature.WEBVTT)
    .addFeature(shakaAssets.Feature.OFFLINE)
    .addLicenseServer('com.widevine.alpha', 'https://cwip-shaka-proxy.appspot.com/no_auth'),
  new ShakaDemoAssetInfo(
      /* name= */ 'Sintel 4k (multicodec)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/sintel.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/sintel/dash.mpd',
      /* source= */ shakaAssets.Source.SHAKA)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.SUBTITLES)
    .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.WEBM)
    .addFeature(shakaAssets.Feature.WEBVTT)
    .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Sintel w/ trick mode (MP4 only, 720p)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/sintel.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/sintel-trickplay/dash.mpd',
      /* source= */ shakaAssets.Source.SHAKA)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.SUBTITLES)
    .addFeature(shakaAssets.Feature.TRICK_MODE)
    .addFeature(shakaAssets.Feature.WEBVTT)
    .addFeature(shakaAssets.Feature.OFFLINE),
  // NOTE: hanging in Firefox
  // https://bugzilla.mozilla.org/show_bug.cgi?id=1291451
  new ShakaDemoAssetInfo(
      /* name= */ 'Sintel 4k (WebM only)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/sintel.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/sintel-webm-only/dash.mpd',
      /* source= */ shakaAssets.Source.SHAKA)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.SUBTITLES)
    .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.WEBM)
    .addFeature(shakaAssets.Feature.WEBVTT)
    .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Sintel 4k (MP4 only)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/sintel.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/sintel-mp4-only/dash.mpd',
      /* source= */ shakaAssets.Source.SHAKA)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.SUBTITLES)
    .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.WEBVTT)
    .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Sintel 4k (multicodec, Widevine)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/sintel.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/sintel-widevine/dash.mpd',
      /* source= */ shakaAssets.Source.SHAKA)
    .addDescription('A Blender Foundation short film, protected by Widevine encryption.') // eslint-disable-line max-len
    .markAsFeatured('Sintel')
    .addKeySystem(shakaAssets.KeySystem.WIDEVINE)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.MULTIKEY)
    .addFeature(shakaAssets.Feature.SUBTITLES)
    .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.WEBM)
    .addFeature(shakaAssets.Feature.WEBVTT)
    .addFeature(shakaAssets.Feature.OFFLINE)
    .addLicenseServer('com.widevine.alpha', 'https://cwip-shaka-proxy.appspot.com/no_auth'),
  new ShakaDemoAssetInfo(
      /* name= */ 'Sintel 4k (MP4, VTT in MP4)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/sintel.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/sintel-mp4-wvtt/dash.mpd',
      /* source= */ shakaAssets.Source.SHAKA)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.SUBTITLES)
    .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.WEBVTT)
    .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Sintel w/ 44 subtitle languages',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/sintel.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/sintel-many-subs/dash.mpd',
      /* source= */ shakaAssets.Source.SHAKA)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.SUBTITLES)
    .addFeature(shakaAssets.Feature.SURROUND)
    .addFeature(shakaAssets.Feature.WEBVTT)
    .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Heliocentrism (multicodec, multiperiod)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/heliocentricism.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/heliocentrism/heliocentrism.mpd',
      /* source= */ shakaAssets.Source.SHAKA)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.MULTIPERIOD)
    .addFeature(shakaAssets.Feature.WEBM)
    .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Heliocentrism (multicodec, multiperiod, xlink)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/heliocentricism.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/heliocentrism-xlink/heliocentrism.mpd',
      /* source= */ shakaAssets.Source.SHAKA)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.MULTIPERIOD)
    .addFeature(shakaAssets.Feature.WEBM)
    .addFeature(shakaAssets.Feature.XLINK)
    .addFeature(shakaAssets.Feature.OFFLINE),
  // From: http://dig.ccmixter.org/files/JeffSpeed68/53327
  // Licensed under Creative Commons BY-NC 3.0.
  // Free for non-commercial use with attribution.
  // http://creativecommons.org/licenses/by-nc/3.0/
  new ShakaDemoAssetInfo(
      /* name= */ '"Dig the Uke" by Stefan Kartenberg (audio only, multicodec)', // eslint-disable-line max-len
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/audio_only.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/dig-the-uke-clear/dash.mpd',
      /* source= */ shakaAssets.Source.SHAKA)
    .addDescription('An audio-only presentation performed by Stefan Kartenberg.') // eslint-disable-line max-len
    .markAsFeatured('Dig the Uke')
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.AUDIO_ONLY)
    .addFeature(shakaAssets.Feature.WEBM)
    .addFeature(shakaAssets.Feature.OFFLINE),
  // From: http://dig.ccmixter.org/files/JeffSpeed68/53327
  // Licensed under Creative Commons BY-NC 3.0.
  // Free for non-commercial use with attribution.
  // http://creativecommons.org/licenses/by-nc/3.0/
  new ShakaDemoAssetInfo(
      /* name= */ '"Dig the Uke" by Stefan Kartenberg (audio only, multicodec, Widevine)', // eslint-disable-line max-len
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/audio_only.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/dig-the-uke/dash.mpd',
      /* source= */ shakaAssets.Source.SHAKA)
    .addKeySystem(shakaAssets.KeySystem.WIDEVINE)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.AUDIO_ONLY)
    .addFeature(shakaAssets.Feature.WEBM)
    .addFeature(shakaAssets.Feature.OFFLINE)
    .addLicenseServer('com.widevine.alpha', 'https://cwip-shaka-proxy.appspot.com/no_auth'),
  new ShakaDemoAssetInfo(
      /* name= */ 'Tears of Steel (multicodec, TTML)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/tears_of_steel.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/tos-ttml/dash.mpd',
      /* source= */ shakaAssets.Source.SHAKA)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.SUBTITLES)
    .addFeature(shakaAssets.Feature.TTML)
    .addFeature(shakaAssets.Feature.WEBM)
    .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Tears of Steel (multicodec, surround + stereo)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/tears_of_steel.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/tos-surround/dash.mpd',
      /* source= */ shakaAssets.Source.SHAKA)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.SURROUND)
    .addFeature(shakaAssets.Feature.WEBM)
    .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Shaka Player History (multicodec, live, DASH)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/shaka.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-live-assets/player-source.mpd',
      /* source= */ shakaAssets.Source.SHAKA)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.LIVE)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.WEBM),
  new ShakaDemoAssetInfo(
      /* name= */ 'Shaka Player History (live, HLS)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/shaka.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-live-assets/player-source.m3u8',
      /* source= */ shakaAssets.Source.SHAKA)
    .addDescription('A self-indulgent HLS livestream.')
    .markAsFeatured('Shaka Player History')
    .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.HLS)
    .addFeature(shakaAssets.Feature.LIVE)
    .addFeature(shakaAssets.Feature.MP4),
  // }}}

  // Axinom assets {{{
  // Src: https://github.com/Axinom/dash-test-vectors
  new ShakaDemoAssetInfo(
      /* name= */ 'Multi-DRM',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/tears_of_steel.png',
      /* manifestUri= */ 'https://media.axprod.net/TestVectors/v7-MultiDRM-SingleKey/Manifest.mpd',
      /* source= */ shakaAssets.Source.AXINOM)
    .addKeySystem(shakaAssets.KeySystem.PLAYREADY)
    .addKeySystem(shakaAssets.KeySystem.WIDEVINE)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.MULTIPLE_LANGUAGES)
    .addFeature(shakaAssets.Feature.SUBTITLES)
    .addFeature(shakaAssets.Feature.TTML)
    .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.WEBVTT)
    .addLicenseServer('com.widevine.alpha', 'https://drm-widevine-licensing.axtest.net/AcquireLicense')
    .addLicenseServer('com.microsoft.playready', 'https://drm-playready-licensing.axtest.net/AcquireLicense')
    .addLicenseRequestHeader('X-AxDRM-Message', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZXJzaW9uIjoxLCJjb21fa2V5X2lkIjoiYjMzNjRlYjUtNTFmNi00YWUzLThjOTgtMzNjZWQ1ZTMxYzc4IiwibWVzc2FnZSI6eyJ0eXBlIjoiZW50aXRsZW1lbnRfbWVzc2FnZSIsImtleXMiOlt7ImlkIjoiOWViNDA1MGQtZTQ0Yi00ODAyLTkzMmUtMjdkNzUwODNlMjY2IiwiZW5jcnlwdGVkX2tleSI6ImxLM09qSExZVzI0Y3Iya3RSNzRmbnc9PSJ9XX19.4lWwW46k-oWcah8oN18LPj5OLS5ZU-_AQv7fe0JhNjA'), // eslint-disable-line max-len
  new ShakaDemoAssetInfo(
      /* name= */ 'Multi-DRM, multi-key',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/tears_of_steel.png',
      /* manifestUri= */ 'https://media.axprod.net/TestVectors/v7-MultiDRM-MultiKey/Manifest.mpd',
      /* source= */ shakaAssets.Source.AXINOM)
    .addKeySystem(shakaAssets.KeySystem.PLAYREADY)
    .addKeySystem(shakaAssets.KeySystem.WIDEVINE)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.MULTIPLE_LANGUAGES)
    .addFeature(shakaAssets.Feature.MULTIKEY)
    .addFeature(shakaAssets.Feature.SUBTITLES)
    .addFeature(shakaAssets.Feature.TTML)
    .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.WEBVTT)
    .addLicenseServer('com.widevine.alpha', 'https://drm-widevine-licensing.axtest.net/AcquireLicense')
    .addLicenseServer('com.microsoft.playready', 'https://drm-playready-licensing.axtest.net/AcquireLicense')
    .addLicenseRequestHeader('X-AxDRM-Message', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZXJzaW9uIjoxLCJjb21fa2V5X2lkIjoiYjMzNjRlYjUtNTFmNi00YWUzLThjOTgtMzNjZWQ1ZTMxYzc4IiwibWVzc2FnZSI6eyJ0eXBlIjoiZW50aXRsZW1lbnRfbWVzc2FnZSIsImtleXMiOlt7ImlkIjoiODAzOTliZjUtOGEyMS00MDE0LTgwNTMtZTI3ZTc0OGU5OGMwIiwiZW5jcnlwdGVkX2tleSI6ImxpTkpxVmFZa05oK01LY3hKRms3SWc9PSJ9LHsiaWQiOiI5MDk1M2UwOS02Y2IyLTQ5YTMtYTI2MC03YTVmZWZlYWQ0OTkiLCJlbmNyeXB0ZWRfa2V5Ijoia1l0SEh2cnJmQ01lVmRKNkxrYmtuZz09In0seyJpZCI6IjBlNGRhOTJiLWQwZTgtNGE2Ni04YzNmLWMyNWE5N2ViNjUzMiIsImVuY3J5cHRlZF9rZXkiOiI3dzdOWkhITE1nSjRtUUtFSzVMVE1RPT0ifSx7ImlkIjoiNTg1ZjIzM2YtMzA3Mi00NmYxLTlmYTQtNmRjMjJjNjZhMDE0IiwiZW5jcnlwdGVkX2tleSI6IkFjNFVVbVl0Qko1blBROU4xNXJjM2c9PSJ9LHsiaWQiOiI0MjIyYmQ3OC1iYzQ1LTQxYmYtYjYzZS02ZjgxNGRjMzkxZGYiLCJlbmNyeXB0ZWRfa2V5IjoiTzZGTzBmcVNXb3BwN2JqYy9ENGxNQT09In1dfX0.uF6YlKAREOmbniAeYiH070HSJhV0YS7zSKjlCtiDR5Y'), // eslint-disable-line max-len
  new ShakaDemoAssetInfo(
      /* name= */ 'Multi-DRM, multi-key, multi-Period',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/tears_of_steel.png',
      /* manifestUri= */ 'https://media.axprod.net/TestVectors/v7-MultiDRM-MultiKey-MultiPeriod/Manifest.mpd',
      /* source= */ shakaAssets.Source.AXINOM)
    .addKeySystem(shakaAssets.KeySystem.PLAYREADY)
    .addKeySystem(shakaAssets.KeySystem.WIDEVINE)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.MULTIPLE_LANGUAGES)
    .addFeature(shakaAssets.Feature.SUBTITLES)
    .addFeature(shakaAssets.Feature.MULTIKEY)
    .addFeature(shakaAssets.Feature.MULTIPERIOD)
    .addFeature(shakaAssets.Feature.TTML)
    .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.WEBVTT)
    .addLicenseServer('com.widevine.alpha', 'https://drm-widevine-licensing.axtest.net/AcquireLicense')
    .addLicenseServer('com.microsoft.playready', 'https://drm-playready-licensing.axtest.net/AcquireLicense')
    .addLicenseRequestHeader('X-AxDRM-Message', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZXJzaW9uIjoxLCJjb21fa2V5X2lkIjoiYjMzNjRlYjUtNTFmNi00YWUzLThjOTgtMzNjZWQ1ZTMxYzc4IiwibWVzc2FnZSI6eyJ0eXBlIjoiZW50aXRsZW1lbnRfbWVzc2FnZSIsImtleXMiOlt7ImlkIjoiMDg3Mjc4NmUtZjllNy00NjVmLWEzYTItNGU1YjBlZjhmYTQ1IiwiZW5jcnlwdGVkX2tleSI6IlB3NitlRVlOY3ZqWWJmc2gzWDNmbWc9PSJ9LHsiaWQiOiJjMTRmMDcwOS1mMmI5LTQ0MjctOTE2Yi02MWI1MjU4NjUwNmEiLCJlbmNyeXB0ZWRfa2V5IjoiLzErZk5paDM4bXFSdjR5Y1l6bnQvdz09In0seyJpZCI6IjhiMDI5ZTUxLWQ1NmEtNDRiZC05MTBmLWQ0YjVmZDkwZmJhMiIsImVuY3J5cHRlZF9rZXkiOiJrcTBKdVpFanBGTjhzYVRtdDU2ME9nPT0ifSx7ImlkIjoiMmQ2ZTkzODctNjBjYS00MTQ1LWFlYzItYzQwODM3YjRiMDI2IiwiZW5jcnlwdGVkX2tleSI6IlRjUlFlQld4RW9IT0tIcmFkNFNlVlE9PSJ9LHsiaWQiOiJkZTAyZjA3Zi1hMDk4LTRlZTAtYjU1Ni05MDdjMGQxN2ZiYmMiLCJlbmNyeXB0ZWRfa2V5IjoicG9lbmNTN0dnbWVHRmVvSjZQRUFUUT09In0seyJpZCI6IjkxNGU2OWY0LTBhYjMtNDUzNC05ZTlmLTk4NTM2MTVlMjZmNiIsImVuY3J5cHRlZF9rZXkiOiJlaUkvTXNsbHJRNHdDbFJUL0xObUNBPT0ifSx7ImlkIjoiZGE0NDQ1YzItZGI1ZS00OGVmLWIwOTYtM2VmMzQ3YjE2YzdmIiwiZW5jcnlwdGVkX2tleSI6IjJ3K3pkdnFycERWM3hSMGJKeTR1Z3c9PSJ9LHsiaWQiOiIyOWYwNWU4Zi1hMWFlLTQ2ZTQtODBlOS0yMmRjZDQ0Y2Q3YTEiLCJlbmNyeXB0ZWRfa2V5IjoiL3hsU0hweHdxdTNnby9nbHBtU2dhUT09In0seyJpZCI6IjY5ZmU3MDc3LWRhZGQtNGI1NS05NmNkLWMzZWRiMzk5MTg1MyIsImVuY3J5cHRlZF9rZXkiOiJ6dTZpdXpOMnBzaTBaU3hRaUFUa1JRPT0ifV19fQ.BXr93Et1krYMVs-CUnf7F3ywJWFRtxYdkR7Qn4w3-to'), // eslint-disable-line max-len
  new ShakaDemoAssetInfo(
      /* name= */ 'Clear, single-Period',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/tears_of_steel.png',
      /* manifestUri= */ 'https://media.axprod.net/TestVectors/v7-Clear/Manifest.mpd',
      /* source= */ shakaAssets.Source.AXINOM)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.MULTIPLE_LANGUAGES)
    .addFeature(shakaAssets.Feature.TTML)
    .addFeature(shakaAssets.Feature.SUBTITLES)
    .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.WEBVTT)
    .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Clear, multi-Period',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/tears_of_steel.png',
      /* manifestUri= */ 'https://media.axprod.net/TestVectors/v7-Clear/Manifest_MultiPeriod.mpd',
      /* source= */ shakaAssets.Source.AXINOM)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.MULTIPLE_LANGUAGES)
    .addFeature(shakaAssets.Feature.MULTIPERIOD)
    .addFeature(shakaAssets.Feature.TTML)
    .addFeature(shakaAssets.Feature.SUBTITLES)
    .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.WEBVTT)
    .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Clear, Live DASH',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/axinom_test.png',
      /* manifestUri= */ 'https://akamai-axtest.akamaized.net/routes/lapd-v1-acceptance/www_c4/Manifest.mpd',
      /* source= */ shakaAssets.Source.AXINOM)
    // Disabled pending resolution of https://github.com/Axinom/public-test-vectors/issues/16
    .markAsDisabled()
    .addFeature(shakaAssets.Feature.LIVE)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.DASH),
  new ShakaDemoAssetInfo(
      /* name= */ 'Clear, Live HLS',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/axinom_test.png',
      /* manifestUri= */ 'https://akamai-axtest.akamaized.net/routes/lapd-v1-acceptance/www_c4/Manifest.m3u8',
      /* source= */ shakaAssets.Source.AXINOM)
    .addFeature(shakaAssets.Feature.HLS)
    .addFeature(shakaAssets.Feature.LIVE)
    .addFeature(shakaAssets.Feature.MP4),
  // }}}

  // Unified Streaming {{{
  // Src: http://demo.unified-streaming.com/features.html
  new ShakaDemoAssetInfo(
      /* name= */ 'Tears of Steel',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/tears_of_steel.png',
      /* manifestUri= */ 'https://demo.unified-streaming.com/video/tears-of-steel/tears-of-steel.ism/.mpd',
      /* source= */ shakaAssets.Source.UNIFIED_STREAMING)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Tears of Steel (HLS, Subtitles)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/tears_of_steel.png',
      /* manifestUri= */ 'https://demo.unified-streaming.com/video/tears-of-steel/tears-of-steel-multiple-subtitles.ism/.m3u8',
      /* source= */ shakaAssets.Source.UNIFIED_STREAMING)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.SUBTITLES)
      .addFeature(shakaAssets.Feature.WEBVTT)
      .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Tears of Steel (Widevine)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/tears_of_steel.png',
      /* manifestUri= */ 'https://demo.unified-streaming.com/video/tears-of-steel/tears-of-steel-dash-widevine.ism/.mpd',
      /* source= */ shakaAssets.Source.UNIFIED_STREAMING)
    .addKeySystem(shakaAssets.KeySystem.WIDEVINE)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.SUBTITLES)
    .addFeature(shakaAssets.Feature.TTML)
    .addLicenseServer('com.widevine.alpha', 'https://cwip-shaka-proxy.appspot.com/no_auth'),
  new ShakaDemoAssetInfo(
      /* name= */ 'Tears of Steel (PlayReady)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/tears_of_steel.png',
      /* manifestUri= */ 'https://demo.unified-streaming.com/video/tears-of-steel/tears-of-steel-dash-playready.ism/.mpd',
      /* source= */ shakaAssets.Source.UNIFIED_STREAMING)
    .addKeySystem(shakaAssets.KeySystem.PLAYREADY)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.SUBTITLES)
    .addFeature(shakaAssets.Feature.TTML)
    .addLicenseServer('com.microsoft.playready', 'https://test.playready.microsoft.com/service/rightsmanager.asmx?PlayRight=1&UseSimpleNonPersistentLicense=1'),
  new ShakaDemoAssetInfo(
      /* name= */ 'Tears of Steel (subtitles)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/tears_of_steel.png',
      /* manifestUri= */ 'https://demo.unified-streaming.com/video/tears-of-steel/tears-of-steel-en.ism/.mpd',
      /* source= */ shakaAssets.Source.UNIFIED_STREAMING)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.SUBTITLES)
    .addFeature(shakaAssets.Feature.TTML)
    .addFeature(shakaAssets.Feature.OFFLINE),
  // }}}

  // DASH-IF assets {{{
  // Src: http://dashif.org/test-vectors/
  new ShakaDemoAssetInfo(
      /* name= */ 'Big Buck Bunny (DASH-IF)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/big_buck_bunny.png',
      /* manifestUri= */ 'https://dash.akamaized.net/dash264/TestCases/1c/qualcomm/2/MultiRate.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Live sim (2s segments)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://livesim.dashif.org/livesim/utc_head/testpic_2s/Manifest.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
    .addFeature(shakaAssets.Feature.LIVE)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.DASH),
  new ShakaDemoAssetInfo(
      /* name= */ 'Live sim SegmentTimeline w/ $Time$ (6s segments)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://livesim.dashif.org/livesim/segtimeline_1/utc_head/testpic_6s/Manifest.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.LIVE)
    .addFeature(shakaAssets.Feature.MP4),
  new ShakaDemoAssetInfo(
      /* name= */ 'Live sim SegmentTimeline w/ $Number$ (6s segments)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://livesim.dashif.org/livesim/segtimelinenr_1/utc_head/testpic_6s/Manifest.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.LIVE)
    .addFeature(shakaAssets.Feature.MP4),
  new ShakaDemoAssetInfo(
      /* name= */ 'Live sim SegmentTimeline StartOver [-20s, +20s] (2s segments)', // eslint-disable-line max-len
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://livesim.dashif.org/livesim/segtimeline_1/startrel_-20/stoprel_20/timeoffset_0/testpic_2s/Manifest.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.MP4),
  new ShakaDemoAssetInfo(
      /* name= */ 'Live sim StartOver SegTmpl Duration [-20s, +20s] (2s segments)', // eslint-disable-line max-len
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://livesim.dashif.org/livesim/startrel_-20/stoprel_20/timeoffset_0/testpic_2s/Manifest.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.MP4),
  new ShakaDemoAssetInfo(
      /* name= */ 'Live sim SegTmpl Duration (multi-period 60s)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://livesim.dashif.org/livesim/utc_head/periods_60/testpic_2s/Manifest.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.LIVE)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.MULTIPERIOD),
  new ShakaDemoAssetInfo(
      /* name= */ 'Live sim TTML Image Subtitles embedded (VoD)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://livesim.dashif.org/dash/vod/testpic_2s/img_subs.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.SUBTITLES)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.TTML),
  // }}}

  // bitcodin assets {{{
  // Src: http://www.dash-player.com/demo/streaming-server-and-encoder-support/
  // Src: https://bitmovin.com/mpeg-dash-hls-examples-sample-streams/
  new ShakaDemoAssetInfo(
      /* name= */ 'Art of Motion (DASH)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/art_of_motion.png',
      /* manifestUri= */ 'https://bitdash-a.akamaihd.net/content/MI201109210084_1/mpds/f08e80da-bf1d-4e3d-8899-f0f6155f6efa.mpd',
      /* source= */ shakaAssets.Source.BITCODIN)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Art of Motion (HLS, TS)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/art_of_motion.png',
      /* manifestUri= */ 'https://bitdash-a.akamaihd.net/content/MI201109210084_1/m3u8s/f08e80da-bf1d-4e3d-8899-f0f6155f6efa.m3u8',
      /* source= */ shakaAssets.Source.BITCODIN)
    .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.HLS)
    .addFeature(shakaAssets.Feature.MP2TS)
    .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Sintel (HLS, TS, 4k)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/sintel.png',
      /* manifestUri= */ 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8',
      /* source= */ shakaAssets.Source.BITCODIN)
    // Disabled because the audio playlist ends about 9 seconds early somehow.
    .markAsDisabled()
    .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.HLS)
    .addFeature(shakaAssets.Feature.MP2TS)
    .addFeature(shakaAssets.Feature.OFFLINE),
  // End bitcodin assets }}}

  // Nimble Streamer assets {{{
  // Src: https://wmspanel.com/nimble/demo
  new ShakaDemoAssetInfo(
      /* name= */ 'Big Buck Bunny (Nimble, DASH)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/big_buck_bunny.png',
      /* manifestUri= */ 'https://cf-sf-video.wmspanel.com/local/raw/BigBuckBunny_320x180.mp4/manifest.mpd',
      /* source= */ shakaAssets.Source.NIMBLE_STREAMER)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Big Buck Bunny (Nimble, HLS)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/big_buck_bunny.png',
      /* manifestUri= */ 'https://cf-sf-video.wmspanel.com/local/raw/BigBuckBunny_320x180.mp4/playlist.m3u8',
      /* source= */ shakaAssets.Source.NIMBLE_STREAMER)
    .addFeature(shakaAssets.Feature.HLS)
    .addFeature(shakaAssets.Feature.MP2TS)
    .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.OFFLINE),
  // End Nimble Streamer assets }}}

  // Azure Media Services assets {{{
  // Src: http://amp.azure.net/libs/amp/latest/docs/samples.html
  new ShakaDemoAssetInfo(
      /* name= */ 'Azure Trailer',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/azure.png',
      /* manifestUri= */ 'https://amssamples.streaming.mediaservices.windows.net/91492735-c523-432b-ba01-faba6c2206a2/AzureMediaServicesPromo.ism/manifest(format=mpd-time-csf)',
      /* source= */ shakaAssets.Source.AZURE_MEDIA_SERVICES)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Big Buck Bunny (Azure)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/big_buck_bunny.png',
      /* manifestUri= */ 'https://amssamples.streaming.mediaservices.windows.net/622b189f-ec39-43f2-93a2-201ac4e31ce1/BigBuckBunny.ism/manifest(format=mpd-time-csf)',
      /* source= */ shakaAssets.Source.AZURE_MEDIA_SERVICES)
    .addKeySystem(shakaAssets.KeySystem.PLAYREADY)
    .addKeySystem(shakaAssets.KeySystem.WIDEVINE)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.OFFLINE)
    .addLicenseServer('com.widevine.alpha', 'https://amssamples.keydelivery.mediaservices.windows.net/Widevine/?KID=1ab45440-532c-4399-94dc-5c5ad9584bac')
    .addLicenseServer('com.microsoft.playready', 'https://amssamples.keydelivery.mediaservices.windows.net/PlayReady/'),
  new ShakaDemoAssetInfo(
      /* name= */ 'Tears of Steel (external text)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/tears_of_steel.png',
      /* manifestUri= */ 'https://ams-samplescdn.streaming.mediaservices.windows.net/11196e3d-2f40-4835-9a4d-fc52751b0323/TearsOfSteel_WAMEH264SmoothStreaming720p.ism/manifest(format=mpd-time-csf)',
      /* source= */ shakaAssets.Source.AZURE_MEDIA_SERVICES)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.SUBTITLES)
    .addFeature(shakaAssets.Feature.WEBVTT)
    .addFeature(shakaAssets.Feature.OFFLINE)
    .addExtraText({
      uri: 'https://ams-samplescdn.streaming.mediaservices.windows.net/11196e3d-2f40-4835-9a4d-fc52751b0323/TOS-en.vtt',
      language: 'en',
      kind: 'subtitle',
      mime: 'text/vtt',
    }).addExtraText({
      uri: 'https://ams-samplescdn.streaming.mediaservices.windows.net/11196e3d-2f40-4835-9a4d-fc52751b0323/TOS-es.vtt',
      language: 'es',
      kind: 'subtitle',
      mime: 'text/vtt',
    }).addExtraText({
      uri: 'https://ams-samplescdn.streaming.mediaservices.windows.net/11196e3d-2f40-4835-9a4d-fc52751b0323/TOS-fr.vtt',
      language: 'fr',
      kind: 'subtitle',
      mime: 'text/vtt',
    }),
  // }}}

  // GPAC assets {{{
  // Src: https://gpac.wp.mines-telecom.fr/2012/02/23/dash-sequences/
  // NOTE: The assets here using the "live profile" are not actually
  // "live streams".  The content is still static, as is the timeline.

  // TODO: Get actual icon?
  new ShakaDemoAssetInfo(
      /* name= */ 'live profile',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/sintel.png',
      /* manifestUri= */ 'https://download.tsi.telecom-paristech.fr/gpac/DASH_CONFORMANCE/TelecomParisTech/mp4-live/mp4-live-mpd-AV-BS.mpd',
      /* source= */ shakaAssets.Source.GPAC)
    // NOTE: Multiple SPS/PPS in init segment, no sample duration
    // NOTE: Decoder errors on Mac
    // https://github.com/gpac/gpac/issues/600
    // https://bugs.webkit.org/show_bug.cgi?id=160459
    .markAsDisabled()
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.MP4),
  new ShakaDemoAssetInfo(
      /* name= */ 'live profile with five periods',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/gpac_test_pattern.png',
      /* manifestUri= */ 'https://download.tsi.telecom-paristech.fr/gpac/DASH_CONFORMANCE/TelecomParisTech/mp4-live-periods/mp4-live-periods-mpd.mpd',
      /* source= */ shakaAssets.Source.GPAC)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.MULTIPERIOD)
    .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'main profile, single file',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/gpac_test_pattern.png',
      /* manifestUri= */ 'https://download.tsi.telecom-paristech.fr/gpac/DASH_CONFORMANCE/TelecomParisTech/mp4-main-single/mp4-main-single-mpd-AV-NBS.mpd',
      /* source= */ shakaAssets.Source.GPAC)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'main profile, multiple files',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/gpac_test_pattern.png',
      /* manifestUri= */ 'https://download.tsi.telecom-paristech.fr/gpac/DASH_CONFORMANCE/TelecomParisTech/mp4-main-multi/mp4-main-multi-mpd-AV-BS.mpd',
      /* source= */ shakaAssets.Source.GPAC)
    // NOTE: Multiple SPS/PPS in init segment, no sample duration
    // NOTE: Decoder errors on Mac
    // https://github.com/gpac/gpac/issues/600
    // https://bugs.webkit.org/show_bug.cgi?id=160459
    .markAsDisabled()
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.MP4),
  new ShakaDemoAssetInfo(
      /* name= */ 'onDemand profile',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/gpac_test_pattern.png',
      /* manifestUri= */ 'https://download.tsi.telecom-paristech.fr/gpac/DASH_CONFORMANCE/TelecomParisTech/mp4-onDemand/mp4-onDemand-mpd-AV.mpd',
      /* source= */ shakaAssets.Source.GPAC)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'main profile, open GOP',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/gpac_test_pattern.png',
      /* manifestUri= */ 'https://download.tsi.telecom-paristech.fr/gpac/DASH_CONFORMANCE/TelecomParisTech/mp4-main-ogop/mp4-main-ogop-mpd-AV-BS.mpd',
      /* source= */ shakaAssets.Source.GPAC)
    // NOTE: Segments do not start with keyframes
    // NOTE: Decoder errors on Safari
    // https://bugs.webkit.org/show_bug.cgi?id=160460
    .markAsDisabled()
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.MP4),
  new ShakaDemoAssetInfo(
      /* name= */ 'full profile, gradual decoding refresh',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/gpac_test_pattern.png',
      /* manifestUri= */ 'https://download.tsi.telecom-paristech.fr/gpac/DASH_CONFORMANCE/TelecomParisTech/mp4-full-gdr/mp4-full-gdr-mpd-AV-BS.mpd',
      /* source= */ shakaAssets.Source.GPAC)
    // NOTE: Segments do not start with keyframes
    // NOTE: Decoder errors on Safari
    // https://bugs.webkit.org/show_bug.cgi?id=160460
    .markAsDisabled()
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.MP4),
  // End GPAC assets }}}

  // Verizon Digital Media Services (VDMS) assets {{{
  // Reliable Playready playback requires Edge 16+
  // The playenabler and sl url parameters allow for playback in VMs
  new ShakaDemoAssetInfo(
      /* name= */ 'Multi DRM - 8 Byte IV',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/azure.png',
      /* manifestUri= */ 'https://content.uplynk.com/847859273a4b4a81959d8fea181672a4.mpd?pr.version=2&pr.playenabler=B621D91F-EDCC-4035-8D4B-DC71760D43E9&pr.securitylevel=150',
      /* source= */ shakaAssets.Source.UPLYNK)
    .addKeySystem(shakaAssets.KeySystem.PLAYREADY)
    .addKeySystem(shakaAssets.KeySystem.WIDEVINE)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.MULTIKEY)
    .addFeature(shakaAssets.Feature.AESCTR_8_BYTE_IV)
    .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
    .addLicenseServer('com.microsoft.playready', 'https://content.uplynk.com/pr')
    .addLicenseServer('com.widevine.alpha', 'https://content.uplynk.com/wv')
    .setRequestFilter(shakaAssets.UplynkRequestFilter)
    .setResponseFilter(shakaAssets.UplynkResponseFilter),
  // Reliable Playready playback requires Edge 16+
  // The playenabler and sl url parameters allow for playback in VMs
  new ShakaDemoAssetInfo(
      /* name= */ 'Multi DRM - MultiPeriod - 8 Byte IV',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/sintel.png',
      /* manifestUri= */ 'https://content.uplynk.com/054225d59be2454fabdca3e96912d847.mpd?ad=cleardash&pr.version=2&pr.playenabler=B621D91F-EDCC-4035-8D4B-DC71760D43E9&pr.securitylevel=150',
      /* source= */ shakaAssets.Source.UPLYNK)
    .addKeySystem(shakaAssets.KeySystem.PLAYREADY)
    .addKeySystem(shakaAssets.KeySystem.WIDEVINE)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.SUBTITLES)
    .addFeature(shakaAssets.Feature.MULTIKEY)
    .addFeature(shakaAssets.Feature.MULTIPERIOD)
    .addFeature(shakaAssets.Feature.WEBVTT)
    .addFeature(shakaAssets.Feature.AESCTR_8_BYTE_IV)
    .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
    .addLicenseServer('com.microsoft.playready', 'https://content.uplynk.com/pr')
    .addLicenseServer('com.widevine.alpha', 'https://content.uplynk.com/wv')
    .setRequestFilter(shakaAssets.UplynkRequestFilter)
    .setResponseFilter(shakaAssets.UplynkResponseFilter),
  new ShakaDemoAssetInfo(
      /* name= */ 'Widevine - 16 Byte IV',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/big_buck_bunny.png',
      /* manifestUri= */ 'https://content.uplynk.com/224ac8717e714b68831997ab6cea4015.mpd',
      /* source= */ shakaAssets.Source.UPLYNK)
    .addKeySystem(shakaAssets.KeySystem.WIDEVINE)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.MULTIKEY)
    .addFeature(shakaAssets.Feature.AESCTR_16_BYTE_IV)
    .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
    .addLicenseServer('com.widevine.alpha', 'https://content.uplynk.com/wv')
    .setRequestFilter(shakaAssets.UplynkRequestFilter)
    .setResponseFilter(shakaAssets.UplynkResponseFilter),
  new ShakaDemoAssetInfo(
      /* name= */ 'Widevine - 16 Byte IV - (mix of encrypted and unencrypted periods)', // eslint-disable-line max-len
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/sintel.png',
      /* manifestUri= */ 'https://content.uplynk.com/1eb40d8e64234f5c9879db7045c3d48c.mpd?ad=cleardash&rays=cdefg',
      /* source= */ shakaAssets.Source.UPLYNK)
    .addKeySystem(shakaAssets.KeySystem.WIDEVINE)
    .addFeature(shakaAssets.Feature.DASH)
    .addFeature(shakaAssets.Feature.MP4)
    .addFeature(shakaAssets.Feature.MULTIPLE_LANGUAGES)
    .addFeature(shakaAssets.Feature.MULTIPERIOD)
    .addFeature(shakaAssets.Feature.MULTIKEY)
    .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
    .addFeature(shakaAssets.Feature.AESCTR_16_BYTE_IV)
    .addFeature(shakaAssets.Feature.ENCRYPTED_WITH_CLEAR)
    .addLicenseServer('com.widevine.alpha', 'https://content.uplynk.com/wv')
    .setRequestFilter(shakaAssets.UplynkRequestFilter)
    .setResponseFilter(shakaAssets.UplynkResponseFilter),
  // End Verizon Digital Media Services (VDMS) assets }}}

  // Apple assets {{{
  // Src: https://developer.apple.com/streaming/examples/
  new ShakaDemoAssetInfo(
      /* name= */ 'Apple Advanced HLS Stream (fMP4)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/apple_test_pattern.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/apple-advanced-stream-fmp4/master.m3u8',
      /* source= */ shakaAssets.Source.APPLE)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.CAPTIONS)
      .addFeature(shakaAssets.Feature.WEBVTT)
      .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Apple Advanced HLS Stream (TS)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/apple_test_pattern.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/apple-advanced-stream-ts/master.m3u8',
      /* source= */ shakaAssets.Source.APPLE)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.MP2TS)
      .addFeature(shakaAssets.Feature.CAPTIONS)
      .addFeature(shakaAssets.Feature.WEBVTT)
      .addFeature(shakaAssets.Feature.OFFLINE),
  // }}}

  // IRT assets {{{
  // Src: http://subtitling.irt.de/cmaf/#urls
  // Note: According to the website, these assets may not be available 24/7.
  new ShakaDemoAssetInfo(
      /* name= */ 'Bayerischer Rundfunk Recorded Loop (DASH)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/bayerischer_rundfunk.png',
      /* manifestUri= */ 'https://irtdashreference-i.akamaihd.net/dash/live/901161/keepixo1/manifestBR2.mpd',
      /* source= */ shakaAssets.Source.IRT)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.LIVE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Bayerischer Rundfunk Recorded Loop (HLS)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/bayerischer_rundfunk.png',
      /* manifestUri= */ 'https://irtdashreference-i.akamaihd.net/dash/live/901161/keepixo1/playlistBR2.m3u8',
      /* source= */ shakaAssets.Source.IRT)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.LIVE),
  // }}}
];
