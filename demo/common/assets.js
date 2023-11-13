// vim: foldmethod=marker:foldmarker={{{,}}}
/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview
 * @suppress {missingRequire}
 */

goog.require('ShakaDemoAssetInfo');

goog.provide('shakaAssets');


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
  METACDN: 'MetaCDN',
  NIMBLE_STREAMER: 'Nimble Streamer',
  AZURE_MEDIA_SERVICES: 'Azure Media Services',
  GPAC: 'GPAC',
  UPLYNK: 'Verizon Digital Media Services',
  APPLE: 'Apple',
  IRT: 'IRT',
  MICROSOFT: 'Microsoft',
  VNOVA: 'V-Nova',
  AWS: 'AWS',
};


/** @enum {string} */
shakaAssets.KeySystem = {
  CLEAR_KEY: 'Clear Key DRM',
  FAIRPLAY: 'Fairplay DRM',
  PLAYREADY: 'PlayReady DRM',
  WIDEVINE: 'Widevine DRM',
  AES128: 'AES-128 protection',
  CLEAR: 'No DRM protection',
};


/** @enum {string} */
shakaAssets.AdTag = {
  SINGLE_LINEAR_AD: 'https://pubads.g.doubleclick.net/gampad/ads?sz=640x480' +
    '&iu=/124319096/external/' +
    'single_ad_samples&ciu_szs=300x250&impl=s&gdfp_req=1&env=vp&output=vast&' +
    'unviewed_position_start=1&cust_params=deployment%3Ddevsite%26sample_ct%' +
    '3Dlinear&correlator=',
  SINGLE_NON_LINEAR_AD: 'https://pubads.g.doubleclick.net/gampad/ads?' +
    'sz=480x70&iu=/124319096/external/single_ad_samples&ciu_szs=300x250 ' +
    '&impl=s&gdfp_req=1&env=vp&output=vast&unviewed_position_start=1' +
    '&cust_params=deployment%3Ddevsite%26sample_ct%3Dnonlinear&correlator=',
  SINGLE_SKIPPABLE_AD: 'https://pubads.g.doubleclick.net/gampad/ads?sz=640x480&iu=/' +
    '124319096/external/single_ad_samples&ciu_szs=300x250&impl=s&' +
    'gdfp_req=1&env=vp&output=vast&unviewed_position_start=1&cust_params=' +
    'deployment%3Ddevsite%26sample_ct%3Dskippablelinear&correlator=',
  AD_POD_PREROLL_MIDROLL_POSTROLL: 'https://pubads.g.doubleclick.net/gampad/ads?' +
    'sz=640x480&iu=/124319096/external/ad_rule_samples&' +
    'ciu_szs=300x250&ad_rule=1&impl=s&gdfp_req=1&env=vp&output=' +
    'vmap&unviewed_position_start=1&cust_params=deployment%3Ddevsite' +
    '%26sample_ar%3Dpremidpostpod&cmsid=496&vid=short_onecue&correlator=',
};


/**
 * @param {!shakaAssets.KeySystem} keySystem
 * @return {string}
 */
shakaAssets.identifierForKeySystem = (keySystem) => {
  const KeySystem = shakaAssets.KeySystem;
  switch (keySystem) {
    case KeySystem.CLEAR_KEY: return 'org.w3.clearkey';
    case KeySystem.FAIRPLAY: return 'com.apple.fps';
    case KeySystem.PLAYREADY: return 'com.microsoft.playready';
    case KeySystem.WIDEVINE: return 'com.widevine.alpha';
    case KeySystem.AES128: return 'aes128';
    default: return 'no drm protection';
  }
};


/** @enum {string} */
shakaAssets.Feature = {
  // Set if the asset has a special trick mode track, for rewinding effects.
  TRICK_MODE: 'Special trick mode track',
  XLINK: 'XLink',

  // Set if the asset has any subtitle tracks.
  SUBTITLES: 'Subtitles',
  // Set if the asset has any closed caption tracks.
  CAPTIONS: 'Captions',
  // Set if the asset has multiple audio languages.
  MULTIPLE_LANGUAGES: 'Multiple languages',
  // Set if the asset is audio-only.
  AUDIO_ONLY: 'Audio only',
  // Set if the asset can be stored offline.
  OFFLINE: 'Downloadable',
  // A synthetic property used in the "all content" tab. Should not be given to
  // assets.
  STORED: 'Downloaded',
  // Set if the asset has ads. Autoset by calling setAdTagUri() on an asset.
  // Does not need to be set manually.
  ADS: 'Ads',

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
  // Set if the asset has at least one containerless stream (AAC, etc).
  CONTAINERLESS: 'Containerless',

  // Set if the asset requires Dolby Vision with MV-HEVC (for 3D) support.
  DOLBY_VISION_3D: 'Dolby Vision 3D',

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
  // Set if the asset is an MSS manifest.
  MSS: 'MSS',

  // Set if the asset has at least one image stream.
  THUMBNAILS: 'Thumbnails',

  // Set if the asset has at least one chapter stream.
  CHAPTERS: 'Chapters',

  // Set if the asset has LCEVC.
  LCEVC: 'LCEVC',

  // Set if the asset has Low Latency mode.
  LOW_LATENCY: 'Low Latency',
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
 *   uri: string,
 *   language: string,
 *   mime: string
 * }}
 *
 * @property {string} uri
 *   The URI of the chapter.
 * @property {string} language
 *   The language of the chapter (e.g. 'en').
 * @property {string} mime
 *   The MIME type of the chapter (e.g. 'text/vtt')
 */
shakaAssets.ExtraChapter;
// End types and enums }}}


// Custom callbacks {{{
/**
 * A prefix retrieved in a manifest response filter and used in a subsequent
 * license request filter.  Necessary for VDMS content.
 *
 * @type {string}
 */
shakaAssets.lastUplynkPrefix = '';

/**
 * A response filter for VDMS Uplynk manifest responses.
 * This allows us to get the license prefix that is necessary
 * to later generate a proper license response.
 *
 * @param {shaka.net.NetworkingEngine.RequestType} type
 * @param {shaka.extern.Response} response
 */
shakaAssets.UplynkResponseFilter = (type, response) => {
  if (type == shaka.net.NetworkingEngine.RequestType.MANIFEST) {
    // Parse a custom header that contains a value needed to build a proper
    // license server URL.
    if (response.headers['x-uplynk-prefix']) {
      shakaAssets.lastUplynkPrefix = response.headers['x-uplynk-prefix'];
    } else {
      shakaAssets.lastUplynkPrefix = '';
    }
  }
};


/**
 * A license request filter for VDMS Uplynk license requests.
 *
 * @param {shaka.net.NetworkingEngine.RequestType} type
 * @param {shaka.extern.Request} request
 */
shakaAssets.UplynkRequestFilter = (type, request) => {
  if (type == shaka.net.NetworkingEngine.RequestType.LICENSE) {
    // Modify the license request URL based on our cookie.
    if (request.uris[0].includes('wv') && shakaAssets.lastUplynkPrefix) {
      request.uris[0] = shakaAssets.lastUplynkPrefix.concat('/wv');
    } else if (request.uris[0].includes('ck') && shakaAssets.lastUplynkPrefix) {
      request.uris[0] = shakaAssets.lastUplynkPrefix.concat('/ck');
    } else if (request.uris[0].includes('pr') && shakaAssets.lastUplynkPrefix) {
      request.uris[0] = shakaAssets.lastUplynkPrefix.concat('/pr');
    }
  }
};
// End custom callbacks }}}


/* eslint-disable max-len */
/** @const {!Array.<!ShakaDemoAssetInfo>} */
shakaAssets.testAssets = [
  // Shaka assets {{{
  new ShakaDemoAssetInfo(
      /* name= */ 'Big Buck Bunny: the Dark Truths of a Video Dev Cartoon (DASH)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dark_truth.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/bbb-dark-truths/dash.mpd',
      /* source= */ shakaAssets.Source.SHAKA)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.WEBM)
      .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Big Buck Bunny: the Dark Truths of a Video Dev Cartoon (HLS)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dark_truth.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/bbb-dark-truths-hls/hls.m3u8',
      /* source= */ shakaAssets.Source.SHAKA)
      .addDescription('A serious documentary about a problem plaguing video developers.')
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
      .addDescription('A clip from a classic Star Trek TNG episode, presented in MPEG-DASH.')
      .markAsFeatured('Angel One')
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.MULTIPLE_LANGUAGES)
      .addFeature(shakaAssets.Feature.SUBTITLES)
      .addFeature(shakaAssets.Feature.WEBM)
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
      .addFeature(shakaAssets.Feature.WEBM)
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
      .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Angel One (HLS, MP4, video media playlist only)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/angel_one.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/angel-one-hls/playlist_v-0480p-1000k-libx264.mp4.m3u8',
      /* source= */ shakaAssets.Source.SHAKA)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.MP4)
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
      .addFeature(shakaAssets.Feature.OFFLINE)
      .addLicenseServer('com.widevine.alpha', 'https://cwip-shaka-proxy.appspot.com/no_auth'),
  new ShakaDemoAssetInfo(
      /* name= */ 'Angel One (HLS, MP4, multilingual, Widevine, single linear ad)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/angel_one.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/angel-one-widevine-hls/hls.m3u8',
      /* source= */ shakaAssets.Source.SHAKA)
      .addKeySystem(shakaAssets.KeySystem.WIDEVINE)
      .setAdTagUri(shakaAssets.AdTag.SINGLE_LINEAR_AD)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.MULTIPLE_LANGUAGES)
      .addFeature(shakaAssets.Feature.SUBTITLES)
      .addFeature(shakaAssets.Feature.SURROUND)
      .addFeature(shakaAssets.Feature.OFFLINE)
      .addLicenseServer('com.widevine.alpha', 'https://cwip-shaka-proxy.appspot.com/no_auth'),
  new ShakaDemoAssetInfo(
      /* name= */ 'Angel One (HLS, MP4, multilingual, Widevine, single non-linear ad)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/angel_one.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/angel-one-widevine-hls/hls.m3u8',
      /* source= */ shakaAssets.Source.SHAKA)
      .addKeySystem(shakaAssets.KeySystem.WIDEVINE)
      .setAdTagUri(shakaAssets.AdTag.SINGLE_NON_LINEAR_AD)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.MULTIPLE_LANGUAGES)
      .addFeature(shakaAssets.Feature.SUBTITLES)
      .addFeature(shakaAssets.Feature.SURROUND)
      .addFeature(shakaAssets.Feature.OFFLINE)
      .addLicenseServer('com.widevine.alpha', 'https://cwip-shaka-proxy.appspot.com/no_auth'),
  new ShakaDemoAssetInfo(
      /* name= */ 'Sintel (HLS, TS, AES-128 key rotation)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/sintel.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/sintel-ts-aes-key-rotation/master.m3u8',
      /* source= */ shakaAssets.Source.SHAKA)
      .addKeySystem(shakaAssets.KeySystem.AES128)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.MP2TS)
      .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Sintel (HLS, FMP4, AES-128)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/sintel.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/sintel-fmp4-aes/master.m3u8',
      /* source= */ shakaAssets.Source.SHAKA)
      .addKeySystem(shakaAssets.KeySystem.AES128)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Sintel 4k (multicodec)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/sintel.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/sintel/dash.mpd',
      /* source= */ shakaAssets.Source.SHAKA)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.SUBTITLES)
      .addFeature(shakaAssets.Feature.WEBM)
      .addFeature(shakaAssets.Feature.OFFLINE)
      .addFeature(shakaAssets.Feature.CHAPTERS)
      .addExtraChapter({
        uri: 'https://storage.googleapis.com/shaka-demo-assets/sintel-chapters.vtt',
        language: 'en',
        mime: 'text/vtt',
      }),
  new ShakaDemoAssetInfo(
      /* name= */ 'Sintel w/ trick mode (MP4 only, 720p)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/sintel.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/sintel-trickplay/dash.mpd',
      /* source= */ shakaAssets.Source.SHAKA)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.SUBTITLES)
      .addFeature(shakaAssets.Feature.TRICK_MODE)
      .addFeature(shakaAssets.Feature.OFFLINE),
  // NOTE: hanging in Firefox
  // https://bugzilla.mozilla.org/show_bug.cgi?id=1291451
  new ShakaDemoAssetInfo(
      /* name= */ 'Sintel 4k (WebM only)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/sintel.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/sintel-webm-only/dash.mpd',
      /* source= */ shakaAssets.Source.SHAKA)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.SUBTITLES)
      .addFeature(shakaAssets.Feature.WEBM)
      .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Sintel 4k (MP4 only)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/sintel.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/sintel-mp4-only/dash.mpd',
      /* source= */ shakaAssets.Source.SHAKA)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.SUBTITLES)
      .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Sintel 4k (multicodec, Widevine)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/sintel.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/sintel-widevine/dash.mpd',
      /* source= */ shakaAssets.Source.SHAKA)
      .addKeySystem(shakaAssets.KeySystem.WIDEVINE)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.SUBTITLES)
      .addFeature(shakaAssets.Feature.WEBM)
      .addFeature(shakaAssets.Feature.OFFLINE)
      .addLicenseServer('com.widevine.alpha', 'https://cwip-shaka-proxy.appspot.com/no_auth')
      .setExtraConfig({
        drm: {
          advanced: {
            'com.widevine.alpha': {
              serverCertificateUri: 'https://cwip-shaka-proxy.appspot.com/service-cert',
            },
          },
        },
      }),
  new ShakaDemoAssetInfo(
      /* name= */ 'Sintel 4k (multicodec, Widevine, ads)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/sintel.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/sintel-widevine/dash.mpd',
      /* source= */ shakaAssets.Source.SHAKA)
      .addDescription('A Blender Foundation short film, protected by Widevine encryption ' +
          ' with pre-roll, mid-roll, and post-roll ads.')
      .markAsFeatured('Sintel')
      .setAdTagUri(shakaAssets.AdTag.AD_POD_PREROLL_MIDROLL_POSTROLL)
      .addKeySystem(shakaAssets.KeySystem.WIDEVINE)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.SUBTITLES)
      .addFeature(shakaAssets.Feature.WEBM)
      .addFeature(shakaAssets.Feature.OFFLINE)
      .addLicenseServer('com.widevine.alpha', 'https://cwip-shaka-proxy.appspot.com/no_auth'),
  new ShakaDemoAssetInfo(
      /* name= */ 'Sintel 4k (MP4, VTT in MP4)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/sintel.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/sintel-mp4-wvtt/dash.mpd',
      /* source= */ shakaAssets.Source.SHAKA)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.SUBTITLES)
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
      .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Heliocentrism (multicodec, multiperiod)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/heliocentricism.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/heliocentrism/heliocentrism.mpd',
      /* source= */ shakaAssets.Source.SHAKA)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.WEBM)
      .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Heliocentrism (multicodec, multiperiod, xlink)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/heliocentricism.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/heliocentrism-xlink/heliocentrism.mpd',
      /* source= */ shakaAssets.Source.SHAKA)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.WEBM)
      .addFeature(shakaAssets.Feature.XLINK)
      .addFeature(shakaAssets.Feature.OFFLINE),
  // From: http://dig.ccmixter.org/files/JeffSpeed68/53327
  // Licensed under Creative Commons BY-NC 3.0.
  // Free for non-commercial use with attribution.
  // http://creativecommons.org/licenses/by-nc/3.0/
  new ShakaDemoAssetInfo(
      /* name= */ '"Dig the Uke" by Stefan Kartenberg (audio only, multicodec)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/audio_only.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/dig-the-uke-clear/dash.mpd',
      /* source= */ shakaAssets.Source.SHAKA)
      .addDescription('An audio-only presentation performed by Stefan Kartenberg.')
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
      /* name= */ '"Dig the Uke" by Stefan Kartenberg (audio only, multicodec, Widevine)',
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
      .addFeature(shakaAssets.Feature.WEBM)
      .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Tears of Steel (HLS, Server Side ads)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/tears_of_steel.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/tos/hls.m3u8',
      /* source= */ shakaAssets.Source.SHAKA)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.OFFLINE)
      .setIMAContentSourceId('2528370')
      .setIMAVideoId('tears-of-steel')
      .setIMAManifestType('HLS'),
  new ShakaDemoAssetInfo(
      /* name= */ 'Tears of Steel (live, DASH, Server Side ads)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/tears_of_steel.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/tos-ttml/dash.mpd',
      /* source= */ shakaAssets.Source.SHAKA)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.SUBTITLES)
      .addFeature(shakaAssets.Feature.LIVE)
      .setIMAAssetKey('PSzZMzAkSXCmlJOWDmRj8Q')
      .setIMAManifestType('DASH'),
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
      /* name= */ 'Tears of Steel (multicodec, surround + stereo, single skippable ad)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/tears_of_steel.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/tos-surround/dash.mpd',
      /* source= */ shakaAssets.Source.SHAKA)
      .setAdTagUri(shakaAssets.AdTag.SINGLE_SKIPPABLE_AD)
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
  // End Shaka assets }}}

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
      .addLicenseServer('com.widevine.alpha', 'https://drm-widevine-licensing.axtest.net/AcquireLicense')
      .addLicenseServer('com.microsoft.playready', 'https://drm-playready-licensing.axtest.net/AcquireLicense')
      .addLicenseRequestHeader('X-AxDRM-Message', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZXJzaW9uIjoxLCJjb21fa2V5X2lkIjoiYjMzNjRlYjUtNTFmNi00YWUzLThjOTgtMzNjZWQ1ZTMxYzc4IiwibWVzc2FnZSI6eyJ0eXBlIjoiZW50aXRsZW1lbnRfbWVzc2FnZSIsImtleXMiOlt7ImlkIjoiOWViNDA1MGQtZTQ0Yi00ODAyLTkzMmUtMjdkNzUwODNlMjY2IiwiZW5jcnlwdGVkX2tleSI6ImxLM09qSExZVzI0Y3Iya3RSNzRmbnc9PSJ9XX19.4lWwW46k-oWcah8oN18LPj5OLS5ZU-_AQv7fe0JhNjA'),
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
      .addFeature(shakaAssets.Feature.SUBTITLES)
      .addLicenseServer('com.widevine.alpha', 'https://drm-widevine-licensing.axtest.net/AcquireLicense')
      .addLicenseServer('com.microsoft.playready', 'https://drm-playready-licensing.axtest.net/AcquireLicense')
      .addLicenseRequestHeader('X-AxDRM-Message', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZXJzaW9uIjoxLCJjb21fa2V5X2lkIjoiYjMzNjRlYjUtNTFmNi00YWUzLThjOTgtMzNjZWQ1ZTMxYzc4IiwibWVzc2FnZSI6eyJ0eXBlIjoiZW50aXRsZW1lbnRfbWVzc2FnZSIsImtleXMiOlt7ImlkIjoiODAzOTliZjUtOGEyMS00MDE0LTgwNTMtZTI3ZTc0OGU5OGMwIiwiZW5jcnlwdGVkX2tleSI6ImxpTkpxVmFZa05oK01LY3hKRms3SWc9PSJ9LHsiaWQiOiI5MDk1M2UwOS02Y2IyLTQ5YTMtYTI2MC03YTVmZWZlYWQ0OTkiLCJlbmNyeXB0ZWRfa2V5Ijoia1l0SEh2cnJmQ01lVmRKNkxrYmtuZz09In0seyJpZCI6IjBlNGRhOTJiLWQwZTgtNGE2Ni04YzNmLWMyNWE5N2ViNjUzMiIsImVuY3J5cHRlZF9rZXkiOiI3dzdOWkhITE1nSjRtUUtFSzVMVE1RPT0ifSx7ImlkIjoiNTg1ZjIzM2YtMzA3Mi00NmYxLTlmYTQtNmRjMjJjNjZhMDE0IiwiZW5jcnlwdGVkX2tleSI6IkFjNFVVbVl0Qko1blBROU4xNXJjM2c9PSJ9LHsiaWQiOiI0MjIyYmQ3OC1iYzQ1LTQxYmYtYjYzZS02ZjgxNGRjMzkxZGYiLCJlbmNyeXB0ZWRfa2V5IjoiTzZGTzBmcVNXb3BwN2JqYy9ENGxNQT09In1dfX0.uF6YlKAREOmbniAeYiH070HSJhV0YS7zSKjlCtiDR5Y'),
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
      .addLicenseServer('com.widevine.alpha', 'https://drm-widevine-licensing.axtest.net/AcquireLicense')
      .addLicenseServer('com.microsoft.playready', 'https://drm-playready-licensing.axtest.net/AcquireLicense')
      .addLicenseRequestHeader('X-AxDRM-Message', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZXJzaW9uIjoxLCJjb21fa2V5X2lkIjoiYjMzNjRlYjUtNTFmNi00YWUzLThjOTgtMzNjZWQ1ZTMxYzc4IiwibWVzc2FnZSI6eyJ0eXBlIjoiZW50aXRsZW1lbnRfbWVzc2FnZSIsImtleXMiOlt7ImlkIjoiMDg3Mjc4NmUtZjllNy00NjVmLWEzYTItNGU1YjBlZjhmYTQ1IiwiZW5jcnlwdGVkX2tleSI6IlB3NitlRVlOY3ZqWWJmc2gzWDNmbWc9PSJ9LHsiaWQiOiJjMTRmMDcwOS1mMmI5LTQ0MjctOTE2Yi02MWI1MjU4NjUwNmEiLCJlbmNyeXB0ZWRfa2V5IjoiLzErZk5paDM4bXFSdjR5Y1l6bnQvdz09In0seyJpZCI6IjhiMDI5ZTUxLWQ1NmEtNDRiZC05MTBmLWQ0YjVmZDkwZmJhMiIsImVuY3J5cHRlZF9rZXkiOiJrcTBKdVpFanBGTjhzYVRtdDU2ME9nPT0ifSx7ImlkIjoiMmQ2ZTkzODctNjBjYS00MTQ1LWFlYzItYzQwODM3YjRiMDI2IiwiZW5jcnlwdGVkX2tleSI6IlRjUlFlQld4RW9IT0tIcmFkNFNlVlE9PSJ9LHsiaWQiOiJkZTAyZjA3Zi1hMDk4LTRlZTAtYjU1Ni05MDdjMGQxN2ZiYmMiLCJlbmNyeXB0ZWRfa2V5IjoicG9lbmNTN0dnbWVHRmVvSjZQRUFUUT09In0seyJpZCI6IjkxNGU2OWY0LTBhYjMtNDUzNC05ZTlmLTk4NTM2MTVlMjZmNiIsImVuY3J5cHRlZF9rZXkiOiJlaUkvTXNsbHJRNHdDbFJUL0xObUNBPT0ifSx7ImlkIjoiZGE0NDQ1YzItZGI1ZS00OGVmLWIwOTYtM2VmMzQ3YjE2YzdmIiwiZW5jcnlwdGVkX2tleSI6IjJ3K3pkdnFycERWM3hSMGJKeTR1Z3c9PSJ9LHsiaWQiOiIyOWYwNWU4Zi1hMWFlLTQ2ZTQtODBlOS0yMmRjZDQ0Y2Q3YTEiLCJlbmNyeXB0ZWRfa2V5IjoiL3hsU0hweHdxdTNnby9nbHBtU2dhUT09In0seyJpZCI6IjY5ZmU3MDc3LWRhZGQtNGI1NS05NmNkLWMzZWRiMzk5MTg1MyIsImVuY3J5cHRlZF9rZXkiOiJ6dTZpdXpOMnBzaTBaU3hRaUFUa1JRPT0ifV19fQ.BXr93Et1krYMVs-CUnf7F3ywJWFRtxYdkR7Qn4w3-to'),
  new ShakaDemoAssetInfo(
      /* name= */ 'Clear, single-Period',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/tears_of_steel.png',
      /* manifestUri= */ 'https://media.axprod.net/TestVectors/v7-Clear/Manifest.mpd',
      /* source= */ shakaAssets.Source.AXINOM)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.MULTIPLE_LANGUAGES)
      .addFeature(shakaAssets.Feature.SUBTITLES)
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
      .addFeature(shakaAssets.Feature.SUBTITLES)
      .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Clear, Live DASH',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/axinom_test.png',
      /* manifestUri= */ 'https://akamai-axtest.akamaized.net/routes/lapd-v1-acceptance/www_c4/Manifest.mpd',
      /* source= */ shakaAssets.Source.AXINOM)
      // Disabled pending resolution of https://github.com/Axinom/public-test-vectors/issues/16
      // Disabled pending resolution of https://github.com/Axinom/public-test-vectors/issues/17
      .markAsDisabled()
      .addFeature(shakaAssets.Feature.LIVE)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.DASH),
  new ShakaDemoAssetInfo(
      /* name= */ 'Clear, Live HLS',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/axinom_test.png',
      /* manifestUri= */ 'https://akamai-axtest.akamaized.net/routes/lapd-v1-acceptance/www_c4/Manifest.m3u8',
      /* source= */ shakaAssets.Source.AXINOM)
      // Disabled pending resolution of https://github.com/Axinom/public-test-vectors/issues/17
      .markAsDisabled()
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.LIVE)
      .addFeature(shakaAssets.Feature.MP4),
  new ShakaDemoAssetInfo(
      /* name= */ 'Multi-DRM (CBCS), multi-key',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/tears_of_steel.png',
      /* manifestUri= */ 'https://media.axprod.net/TestVectors/MultiKey/Cmaf_h264_1080p_cbcs/manifest.mpd',
      /* source= */ shakaAssets.Source.AXINOM)
      .addKeySystem(shakaAssets.KeySystem.PLAYREADY)
      .addKeySystem(shakaAssets.KeySystem.WIDEVINE)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.MULTIPLE_LANGUAGES)
      .addFeature(shakaAssets.Feature.SUBTITLES)
      .addLicenseServer('com.widevine.alpha', 'https://drm-widevine-licensing.axprod.net/AcquireLicense')
      .addLicenseServer('com.microsoft.playready', 'https://drm-playready-licensing.axtest.net/AcquireLicense')
      .addLicenseRequestHeader('X-AxDRM-Message', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJ2ZXJzaW9uIjogMSwKICAiY29tX2tleV9pZCI6ICI2OWU1NDA4OC1lOWUwLTQ1MzAtOGMxYS0xZWI2ZGNkMGQxNGUiLAogICJtZXNzYWdlIjogewogICAgInR5cGUiOiAiZW50aXRsZW1lbnRfbWVzc2FnZSIsCiAgICAidmVyc2lvbiI6IDIsCiAgICAibGljZW5zZSI6IHsKICAgICAgImFsbG93X3BlcnNpc3RlbmNlIjogdHJ1ZQogICAgfSwKICAgICJjb250ZW50X2tleXNfc291cmNlIjogewogICAgICAiaW5saW5lIjogWwogICAgICAgIHsKICAgICAgICAgICJpZCI6ICJiNTRlYzkxNC0xOTJkLTRlYTEtYWMxOS1mNDI5ZWI0OTgyNjgiLAogICAgICAgICAgImVuY3J5cHRlZF9rZXkiOiAiR1ZERnJZUU9Bb1kzZmpxVVVtamswQT09IiwKICAgICAgICAgICJ1c2FnZV9wb2xpY3kiOiAiUG9saWN5IEEiCiAgICAgICAgfSwKICAgICAgICB7CiAgICAgICAgICAiaWQiOiAiYzgzYzRlYTgtMGYyYS00NTIzLTg1MWMtZmJlY2NkYzBmMjAyIiwKICAgICAgICAgICJlbmNyeXB0ZWRfa2V5IjogIlRKZGZsWmJLYmZXQXl5K1dta21UUEE9PSIsCiAgICAgICAgICAidXNhZ2VfcG9saWN5IjogIlBvbGljeSBBIgogICAgICAgIH0sCiAgICAgICAgewogICAgICAgICAgImlkIjogImM4NjhjNzAyLWM3MWItNDA2NC1hZTJiLWMyNGY3Y2MxMDc5MiIsCiAgICAgICAgICAiZW5jcnlwdGVkX2tleSI6ICJ4QXJpUkpOcUFTdXp6RExDRzNXSjdnPT0iLAogICAgICAgICAgInVzYWdlX3BvbGljeSI6ICJQb2xpY3kgQSIKICAgICAgICB9CiAgICAgIF0KICAgIH0sCiAgICAiY29udGVudF9rZXlfdXNhZ2VfcG9saWNpZXMiOiBbCiAgICAgIHsKICAgICAgICAibmFtZSI6ICJQb2xpY3kgQSIsCiAgICAgICAgInBsYXlyZWFkeSI6IHsKICAgICAgICAgICJtaW5fZGV2aWNlX3NlY3VyaXR5X2xldmVsIjogMTUwLAogICAgICAgICAgInBsYXlfZW5hYmxlcnMiOiBbCiAgICAgICAgICAgICI3ODY2MjdEOC1DMkE2LTQ0QkUtOEY4OC0wOEFFMjU1QjAxQTciCiAgICAgICAgICBdCiAgICAgICAgfQogICAgICB9CiAgICBdCiAgfQp9.XC0YIbZpKGFc3IZROklP4LvISc6cZGpE9UL-XcpcqWg'),
  // End Axinom assets }}}

  // Unified Streaming assets {{{
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
      .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Tears of Steel (Thumbnails)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/tears_of_steel.png',
      /* manifestUri= */ 'https://demo.unified-streaming.com/video/tears-of-steel/tears-of-steel-tiled-thumbnails-timeline.ism/.mpd',
      /* source= */ shakaAssets.Source.UNIFIED_STREAMING)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.SUBTITLES)
      .addFeature(shakaAssets.Feature.OFFLINE)
      .addFeature(shakaAssets.Feature.THUMBNAILS),
  // End Unified Streaming assets }}}

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
      /* manifestUri= */ 'https://livesim2.dashif.org/livesim2/utc_head/testpic_2s/Manifest.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
      .addFeature(shakaAssets.Feature.LIVE)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.DASH),
  new ShakaDemoAssetInfo(
      /* name= */ 'Live sim SegmentTimeline w/ $Time$ (6s segments)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://livesim2.dashif.org/livesim2/segtimeline_1/utc_head/testpic_6s/Manifest.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.LIVE)
      .addFeature(shakaAssets.Feature.MP4),
  new ShakaDemoAssetInfo(
      /* name= */ 'Live sim SegmentTimeline w/ $Number$ (6s segments)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://livesim2.dashif.org/livesim2/segtimelinenr_1/utc_head/testpic_6s/Manifest.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.LIVE)
      .addFeature(shakaAssets.Feature.MP4),
  new ShakaDemoAssetInfo(
      /* name= */ 'Live sim SegmentTimeline StartOver [-20s, +20s] (2s segments)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://livesim2.dashif.org/livesim2/segtimeline_1/startrel_-20/stoprel_20/timeoffset_0/testpic_2s/Manifest.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.MP4),
  new ShakaDemoAssetInfo(
      /* name= */ 'Live sim StartOver SegTmpl Duration [-20s, +20s] (2s segments)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://livesim2.dashif.org/livesim2/startrel_-20/stoprel_20/timeoffset_0/testpic_2s/Manifest.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.MP4),
  new ShakaDemoAssetInfo(
      /* name= */ 'Live sim SegTmpl Duration (multi-period 60s)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://livesim2.dashif.org/livesim2/utc_head/periods_60/testpic_2s/Manifest.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.LIVE)
      .addFeature(shakaAssets.Feature.MP4),
  new ShakaDemoAssetInfo(
      /* name= */ 'Live sim TTML Image Subtitles embedded (VoD)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://livesim2.dashif.org/dash/testpic_2s/img_subs.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.SUBTITLES)
      .addFeature(shakaAssets.Feature.MP4),
  new ShakaDemoAssetInfo(
      /* name= */ 'Low Latency DASH Live',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://livesim2.dashif.org/livesim2/chunkdur_1/ato_7/testpic4_8s/Manifest300.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.LIVE)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.LOW_LATENCY)
      .setExtraConfig({
        streaming: {
          lowLatencyMode: true,
        },
      }),
  new ShakaDemoAssetInfo(
      /* name= */ 'DASH-IF CEA-608 VOD',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://livesim2.dashif.org/dash/testpic_2s/cea608.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.SUBTITLES)
      .addFeature(shakaAssets.Feature.MP4),
  new ShakaDemoAssetInfo(
      /* name= */ 'DASH-IF CEA-608 Live',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://livesim2.dashif.org/livesim2/testpic_2s/cea608.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.LIVE)
      .addFeature(shakaAssets.Feature.SUBTITLES)
      .addFeature(shakaAssets.Feature.MP4),
  new ShakaDemoAssetInfo(
      /* name= */ 'Akamai Low Latency DASH Live',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://akamaibroadcasteruseast.akamaized.net/cmaf/live/657078/akasource/out.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.LIVE)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.LOW_LATENCY)
      .setExtraConfig({
        streaming: {
          lowLatencyMode: true,
        },
      }),
  new ShakaDemoAssetInfo(
      /* name= */ 'DASH-IF THUMBNAILS - Single adaptation set, 7 tiles at 10x1, each thumb 320x180',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://dash.akamaized.net/akamai/bbb_30fps/bbb_with_tiled_thumbnails.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.OFFLINE)
      .addFeature(shakaAssets.Feature.THUMBNAILS),
  new ShakaDemoAssetInfo(
      /* name= */ 'DASH-IF THUMBNAILS - Single adaptation set, 4 tiles at 10x1, each thumb 205x115',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://dash.akamaized.net/akamai/bbb_30fps/bbb_with_4_tiles_thumbnails.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.OFFLINE)
      .addFeature(shakaAssets.Feature.THUMBNAILS),
  new ShakaDemoAssetInfo(
      /* name= */ 'DASH-IF THUMBNAILS - Single adaptation set, 1 tile at 10x20, each thumb 102x58',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://dash.akamaized.net/akamai/bbb_30fps/bbb_with_tiled_thumbnails_2.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.OFFLINE)
      .addFeature(shakaAssets.Feature.THUMBNAILS),
  new ShakaDemoAssetInfo(
      /* name= */ 'DASH-IF THUMBNAILS - Two adaptation sets with different thumb resolutions',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://dash.akamaized.net/akamai/bbb_30fps/bbb_with_multiple_tiled_thumbnails.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.OFFLINE)
      .addFeature(shakaAssets.Feature.THUMBNAILS),
  new ShakaDemoAssetInfo(
      /* name= */ 'DASH-IF THUMBNAILS - Live stream, Single adaptation set, 1x1 tiles (livesim)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://livesim2.dashif.org/livesim2/testpic_2s/Manifest_thumbs.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.LIVE)
      .addFeature(shakaAssets.Feature.THUMBNAILS),
  // End DASH-IF Assets }}}

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
      /* name= */ 'Art of Motion (HLS, TS, AES-128)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/art_of_motion.png',
      /* manifestUri= */ 'https://bitmovin-a.akamaihd.net/content/art-of-motion_drm/m3u8s/11331.m3u8',
      /* source= */ shakaAssets.Source.BITCODIN)
      .addKeySystem(shakaAssets.KeySystem.AES128)
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
      .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.MP2TS)
      .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Art of Motion (DASH) (external thumbnails)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/art_of_motion.png',
      /* manifestUri= */ 'https://cdn.bitmovin.com/content/assets/art-of-motion-dash-hls-progressive/mpds/f08e80da-bf1d-4e3d-8899-f0f6155f6efa.mpd',
      /* source= */ shakaAssets.Source.BITCODIN)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.THUMBNAILS)
      .addExtraThumbnail('https://cdn.bitmovin.com/content/assets/art-of-motion-dash-hls-progressive/thumbnails/f08e80da-bf1d-4e3d-8899-f0f6155f6efa.vtt'),
  new ShakaDemoAssetInfo(
      /* name= */ 'Art of Motion (HLS) (external thumbnails)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/art_of_motion.png',
      /* manifestUri= */ 'https://cdn.bitmovin.com/content/assets/art-of-motion-dash-hls-progressive/m3u8s/f08e80da-bf1d-4e3d-8899-f0f6155f6efa.m3u8',
      /* source= */ shakaAssets.Source.BITCODIN)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP2TS)
      .addFeature(shakaAssets.Feature.THUMBNAILS)
      .addExtraThumbnail('https://cdn.bitmovin.com/content/assets/art-of-motion-dash-hls-progressive/thumbnails/f08e80da-bf1d-4e3d-8899-f0f6155f6efa.vtt'),
  new ShakaDemoAssetInfo(
      /* name= */ 'Art of Motion (MP4) (external thumbnails)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/art_of_motion.png',
      /* manifestUri= */ 'https://cdn.bitmovin.com/content/assets/art-of-motion-dash-hls-progressive/MI201109210084_mpeg-4_hd_high_1080p25_10mbits.mp4',
      /* source= */ shakaAssets.Source.BITCODIN)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.THUMBNAILS)
      .addExtraThumbnail('https://cdn.bitmovin.com/content/assets/art-of-motion-dash-hls-progressive/thumbnails/f08e80da-bf1d-4e3d-8899-f0f6155f6efa.vtt'),
  // End bitcodin assets }}}

  // MetaCDN assets {{{
  new ShakaDemoAssetInfo(
      /* name= */ 'Car Ride (DASH, VOD, 180 Degrees)',
      /* iconUri= */ 'https://lab.streamshark.io:10433/streams/balmain_360/.png?scale=300:210',
      /* manifestUri= */ 'https://lab.streamshark.io:10433/streams/balmain_360/Feature.DASH/.mpd',
      /* source= */ shakaAssets.Source.METACDN)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.VOD),
  new ShakaDemoAssetInfo(
      /* name= */ 'Car Ride (HLS, VOD, 180 Degrees)',
      /* iconUri= */ 'https://lab.streamshark.io:10433/streams/balmain_360/.png?scale=300:210',
      /* manifestUri= */ 'https://lab.streamshark.io:10433/streams/balmain_360/Feature.HLS/.m3u8',
      /* source= */ shakaAssets.Source.METACDN)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.MP2TS)
      .addFeature(shakaAssets.Feature.VOD),
  new ShakaDemoAssetInfo(
      /* name= */ 'Queensland, Australia Landscape (DASH)',
      /* iconUri= */ 'https://lab.streamshark.io:10433/streams/sharkahouse/.png?scale=300:210',
      /* manifestUri= */ 'https://lab.streamshark.io:10433/streams/sharkahouse/Feature.DASH/.mpd',
      /* source= */ shakaAssets.Source.METACDN)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.VOD),
  new ShakaDemoAssetInfo(
      /* name= */ 'Queensland, Australia Landscape (HLS)',
      /* iconUri= */ 'https://lab.streamshark.io:10433/streams/sharkahouse/.png?scale=300:210',
      /* manifestUri= */ 'https://lab.streamshark.io:10433/streams/sharkahouse/Feature.HLS/.m3u8',
      /* source= */ shakaAssets.Source.METACDN)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.MP2TS)
      .addFeature(shakaAssets.Feature.VOD),
  // End MetaCDN assets }}}

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
  new ShakaDemoAssetInfo(
      /* name= */ 'Sintel (DASH, AES-128)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/sintel.png',
      /* manifestUri= */ 'https://amssamples.streaming.mediaservices.windows.net/49b57c87-f5f3-48b3-ba22-c55cfdffa9cb/Sintel.ism/manifest(format=mpd-time-csf)',
      /* source= */ shakaAssets.Source.AZURE_MEDIA_SERVICES)
      .addKeySystem(shakaAssets.KeySystem.AES128)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.OFFLINE),
  // End Azure Media Services assets }}}

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
      // NOTE: segments do not start with keyframes
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
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addLicenseServer('com.widevine.alpha', 'https://content.uplynk.com/wv')
      .setRequestFilter(shakaAssets.UplynkRequestFilter)
      .setResponseFilter(shakaAssets.UplynkResponseFilter),
  new ShakaDemoAssetInfo(
      /* name= */ 'Widevine - 16 Byte IV - (mix of encrypted and unencrypted periods)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/sintel.png',
      /* manifestUri= */ 'https://content.uplynk.com/1eb40d8e64234f5c9879db7045c3d48c.mpd?ad=cleardash&rays=cdefg',
      /* source= */ shakaAssets.Source.UPLYNK)
      .addKeySystem(shakaAssets.KeySystem.WIDEVINE)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.MULTIPLE_LANGUAGES)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
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
      .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Apple Advanced HLS Stream (TS)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/apple_test_pattern.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/apple-advanced-stream-ts/master.m3u8',
      /* source= */ shakaAssets.Source.APPLE)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.MP2TS)
      .addFeature(shakaAssets.Feature.CAPTIONS)
      .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Low Latency HLS Live',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/apple_test_pattern.png',
      /* manifestUri= */ 'https://ll-hls-test.cdn-apple.com/llhls4/ll-hls-test-04/multi.m3u8',
      /* source= */ shakaAssets.Source.APPLE)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.LIVE)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.LOW_LATENCY)
      .setExtraConfig({
        streaming: {
          lowLatencyMode: true,
        },
      }),
  new ShakaDemoAssetInfo(
      /* name= */ 'Audio only HLS with raw AAC',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/apple_test_pattern.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/raw-hls-audio-only/manifest.m3u8',
      /* source= */ shakaAssets.Source.APPLE)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.CONTAINERLESS)
      .addFeature(shakaAssets.Feature.AUDIO_ONLY),
  new ShakaDemoAssetInfo(
      /* name= */ 'Apple Advanced HLS Stream (TS) with raw AAC',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/apple_test_pattern.png',
      /* manifestUri= */ 'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/master.m3u8',
      /* source= */ shakaAssets.Source.APPLE)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.MP2TS)
      .addFeature(shakaAssets.Feature.CONTAINERLESS)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Advanced stream HLS Stream (UHD/4K/HDR/ATMOS)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/becoming_you.png',
      /* manifestUri= */ 'https://devstreaming-cdn.apple.com/videos/streaming/examples/adv_dv_atmos/main.m3u8',
      /* source= */ shakaAssets.Source.APPLE)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.OFFLINE)
      .addFeature(shakaAssets.Feature.THUMBNAILS),
  new ShakaDemoAssetInfo(
      /* name= */ '3D movie stream',
      /* iconUri= */ '',
      /* manifestUri= */ 'https://devstreaming-cdn.apple.com/videos/streaming/examples/historic_planet_content_2023-10-26-3d-video/main.m3u8',
      /* source= */ shakaAssets.Source.APPLE)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.DOLBY_VISION_3D)
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

  // MICROSOFT assets {{{
  // Src: http://subtitling.irt.de/cmaf/#urls
  // Note: According to the website, these assets may not be available 24/7.
  new ShakaDemoAssetInfo(
      /* name= */ 'Big Buck Bunny: the Dark Truths of a Video Dev Cartoon (HLS - PlayReady)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dark_truth.png',
      /* manifestUri= */ 'https://test.playready.microsoft.com/media/dash/APPLEENC_CBCS_BBB_1080p/1080p_alternate.m3u8',
      /* source= */ shakaAssets.Source.MICROSOFT)
      .addKeySystem(shakaAssets.KeySystem.PLAYREADY)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addLicenseServer('com.microsoft.playready', 'http://test.playready.microsoft.com/service/rightsmanager.asmx?cfg=(persist:false,ck:W31bfVt9W31bfVt9W31bfQ==,ckt:aescbc)'),
  new ShakaDemoAssetInfo(
      /* name= */ 'Super Speedway Trailer (MSS - Clear)',
      /* iconUri= */ 'https://reference.dashif.org/dash.js/latest/samples/lib/img/mss-1.jpg',
      /* manifestUri= */ 'https://playready.directtaps.net/smoothstreaming/SSWSS720H264/SuperSpeedway_720.ism/Manifest',
      /* source= */ shakaAssets.Source.MICROSOFT)
      .addFeature(shakaAssets.Feature.MSS)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4),
  new ShakaDemoAssetInfo(
      /* name= */ 'Super Speedway Trailer (MSS - PlayReady)',
      /* iconUri= */ 'https://reference.dashif.org/dash.js/latest/samples/lib/img/mss-1.jpg',
      /* manifestUri= */ 'https://test.playready.microsoft.com/smoothstreaming/SSWSS720H264PR/SuperSpeedway_720.ism/Manifest',
      /* source= */ shakaAssets.Source.MICROSOFT)
      .addFeature(shakaAssets.Feature.MSS)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addLicenseServer('com.microsoft.playready', 'https://test.playready.microsoft.com/service/rightsmanager.asmx?cfg=(persist:false,sl:150)'),
  // }}}

  // MPEG-5 LCEVC assets {{{
  /* LCEVC Enhanced Contents */
  new ShakaDemoAssetInfo(
      /* name= */ 'Big Buck Bunny LCEVC H264 (DASH, MP4)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/big_buck_bunny.png',
      /* manifestUri= */ 'https://d3mfda3gpj3dw1.cloudfront.net/vn9s0p86SVbJorX6/master.mpd',
      /* source= */ shakaAssets.Source.VNOVA)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP2TS)
      .addFeature(shakaAssets.Feature.OFFLINE)
      .addFeature(shakaAssets.Feature.LCEVC)
      .addDescription('LCEVC Enhanced eSports content selection.')
      .setExtraConfig({
        streaming: {
          useNativeHlsOnSafari: false,
        },
        mediaSource: {
          forceTransmux: true,
        },
        lcevc: {
          enabled: true,
          dynamicPerformanceScaling: true,
          logLevel: 0,
          drawLogo: false,
        },
      }),
  new ShakaDemoAssetInfo(
      /* name= */ 'Tears of Steel LCEVC H264 (HLS, MP4)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/tears_of_steel.png',
      /* manifestUri= */ 'https://d3mfda3gpj3dw1.cloudfront.net/vn2LvEps745ShGtQ/master.m3u8',
      /* source= */ shakaAssets.Source.VNOVA)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.OFFLINE)
      .addFeature(shakaAssets.Feature.LCEVC)
      .setExtraConfig({
        lcevc: {
          enabled: true,
          dynamicPerformanceScaling: true,
          logLevel: 0,
          drawLogo: false,
        },
      }),
  new ShakaDemoAssetInfo(
      /* name= */ 'eSports LCEVC H264 (HLS, TS)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/shaka.png',
      /* manifestUri= */ 'https://d3mfda3gpj3dw1.cloudfront.net/vnmITf0oAwlErGf9/master.m3u8',
      /* source= */ shakaAssets.Source.VNOVA)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP2TS)
      .addFeature(shakaAssets.Feature.OFFLINE)
      .addFeature(shakaAssets.Feature.LCEVC)
      .setExtraConfig({
        streaming: {
          useNativeHlsOnSafari: false,
        },
        mediaSource: {
          forceTransmux: true,
        },
        lcevc: {
          enabled: true,
          dynamicPerformanceScaling: true,
          logLevel: 0,
          drawLogo: false,
        },
      }),
  new ShakaDemoAssetInfo(
      /* name= */ 'Tears of Steel LCEVC H264 (HLS, MP4)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/tears_of_steel.png',
      /* manifestUri= */ 'https://d3mfda3gpj3dw1.cloudfront.net/vn2LvEps745ShGtQ/master.m3u8',
      /* source= */ shakaAssets.Source.VNOVA)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.OFFLINE)
      .addFeature(shakaAssets.Feature.LCEVC)
      .setExtraConfig({
        streaming: {
          useNativeHlsOnSafari: false,
        },
        mediaSource: {
          forceTransmux: true,
        },
        lcevc: {
          enabled: true,
          dynamicPerformanceScaling: true,
          logLevel: 0,
          drawLogo: false,
        },
      }),
  new ShakaDemoAssetInfo(
      /* name= */ ' eSports LCEVC HEVC (DASH, MP4)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/shaka.png',
      /* manifestUri= */ 'https://d3mfda3gpj3dw1.cloudfront.net/vnCTVqNpUs9400xP/master.mpd',
      /* source= */ shakaAssets.Source.VNOVA)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.OFFLINE)
      .addFeature(shakaAssets.Feature.LCEVC)
      .setExtraConfig({
        lcevc: {
          enabled: true,
          dynamicPerformanceScaling: true,
          logLevel: 0,
          drawLogo: false,
        },
      }),
  // }}}

  // AWS assets {{{
  /* MediaTailor Contents */
  new ShakaDemoAssetInfo(
      /* name= */ 'Media Tailor HLS',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/sing.png',
      /* manifestUri= */ 'https://ad391cc0d55b44c6a86d232548adc225.mediatailor.us-east-1.amazonaws.com/v1/session/d02fedbbc5a68596164208dd24e9b48aa60dadc7/singssai/master.m3u8',
      /* source= */ shakaAssets.Source.AWS)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP2TS)
      .setMediaTailor('https://ad391cc0d55b44c6a86d232548adc225.mediatailor.us-east-1.amazonaws.com/v1/session/d02fedbbc5a68596164208dd24e9b48aa60dadc7/singssai/master.m3u8'),
  new ShakaDemoAssetInfo(
      /* name= */ 'Media Tailor Live HLS',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/big_buck_bunny.png',
      /* manifestUri= */ 'https://d305rncpy6ne2q.cloudfront.net/v1/session/94063eadf7d8c56e9e2edd84fdf897826a70d0df/SFP-MediaTailor-Live-HLS-DASH/channel/sfp-channel1/hls.m3u8',
      /* source= */ shakaAssets.Source.AWS)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP2TS)
      .addFeature(shakaAssets.Feature.LIVE)
      .setMediaTailor('https://d305rncpy6ne2q.cloudfront.net/v1/session/94063eadf7d8c56e9e2edd84fdf897826a70d0df/SFP-MediaTailor-Live-HLS-DASH/channel/sfp-channel1/hls.m3u8'),
  new ShakaDemoAssetInfo(
      /* name= */ 'Media Tailor DASH',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/big_buck_bunny.png',
      /* manifestUri= */ 'https://d305rncpy6ne2q.cloudfront.net/v1/session/94063eadf7d8c56e9e2edd84fdf897826a70d0df/SFP-MediaTailor-VOD-HLS-DASH/out/v1/b94f3611978f419985a18335bac9d9cb/ddb73bf548a44551a0059c346226445a/eaa5485198bf497284559efb8172425e/index.mpd',
      /* source= */ shakaAssets.Source.AWS)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .setMediaTailor('https://d305rncpy6ne2q.cloudfront.net/v1/session/94063eadf7d8c56e9e2edd84fdf897826a70d0df/SFP-MediaTailor-VOD-HLS-DASH/out/v1/b94f3611978f419985a18335bac9d9cb/ddb73bf548a44551a0059c346226445a/eaa5485198bf497284559efb8172425e/index.mpd',
          {
            adsParams: {
              assetid: 'test2',
              podduration: '15',
            },
          }),
  new ShakaDemoAssetInfo(
      /* name= */ 'Media Tailor Live DASH',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/big_buck_bunny.png',
      /* manifestUri= */ 'https://d305rncpy6ne2q.cloudfront.net/v1/session/94063eadf7d8c56e9e2edd84fdf897826a70d0df/SFP-MediaTailor-Live-HLS-DASH/channel/sfp-channel1/dash.mpd',
      /* source= */ shakaAssets.Source.AWS)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.LIVE)
      .setMediaTailor('https://d305rncpy6ne2q.cloudfront.net/v1/session/94063eadf7d8c56e9e2edd84fdf897826a70d0df/SFP-MediaTailor-Live-HLS-DASH/channel/sfp-channel1/dash.mpd'),
  new ShakaDemoAssetInfo(
      /* name= */ 'Media Tailor Live HLS with overlays',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/re_mars.png',
      /* manifestUri= */ 'https://d305rncpy6ne2q.cloudfront.net/v1/session/94063eadf7d8c56e9e2edd84fdf897826a70d0df/SFP-MediaTailor-Live-HLS-Overlays/channel/sfp-channel2/hls.m3u8',
      /* source= */ shakaAssets.Source.AWS)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP2TS)
      .addFeature(shakaAssets.Feature.LIVE)
      .setMediaTailor('https://d305rncpy6ne2q.cloudfront.net/v1/session/94063eadf7d8c56e9e2edd84fdf897826a70d0df/SFP-MediaTailor-Live-HLS-Overlays/channel/sfp-channel2/hls.m3u8'),
  // }}}
];
/* eslint-enable max-len */
