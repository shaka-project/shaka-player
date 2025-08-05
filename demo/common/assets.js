// vim: foldmethod=marker:foldmarker={{{,}}}
/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// cspell:ignore playenabler

/**
 * @fileoverview
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
  DASH_IF: 'DASH-IF',
  BITCODIN: 'Bitcodin',
  NIMBLE_STREAMER: 'Nimble Streamer',
  GPAC: 'GPAC',
  UPLYNK: 'Verizon Digital Media Services',
  APPLE: 'Apple',
  MICROSOFT: 'Microsoft',
  VNOVA: 'V-Nova',
  AWS: 'AWS',
  BRIGHTCOVE: 'Brightcove',
  BROADPEAK: 'Broadpeak',
  EZDRM: 'EZDRM',
  THEO_PLAYER: 'THEOplayer',
  JWPLAYER: 'JW Player',
  BBC: 'BBC',
  DOLBY: 'Dolby',
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
  SINGLE_LINEAR_AD: 'https://pubads.g.doubleclick.net/gampad/ads?sz=640x480&iu=/124319096/external/single_ad_samples&ciu_szs=300x250&impl=s&gdfp_req=1&env=vp&output=vast&unviewed_position_start=1&cust_params=deployment%3Ddevsite%26sample_ct%3Dlinear&correlator=',
  SINGLE_NON_LINEAR_AD: 'https://pubads.g.doubleclick.net/gampad/ads?sz=480x70&iu=/124319096/external/single_ad_samples&ciu_szs=300x250&impl=s&gdfp_req=1&env=vp&output=vast&unviewed_position_start=1&cust_params=deployment%3Ddevsite%26sample_ct%3Dnonlinear&correlator=',
  SINGLE_SKIPPABLE_AD: 'https://pubads.g.doubleclick.net/gampad/ads?sz=640x480&iu=/124319096/external/single_ad_samples&ciu_szs=300x250&impl=s&gdfp_req=1&env=vp&output=vast&unviewed_position_start=1&cust_params=deployment%3Ddevsite%26sample_ct%3Dskippablelinear&correlator=',
  AD_POD_PREROLL_MIDROLL_POSTROLL: 'https://pubads.g.doubleclick.net/gampad/ads?sz=640x480&iu=/124319096/external/ad_rule_samples&ciu_szs=300x250&ad_rule=1&impl=s&gdfp_req=1&env=vp&output=vmap&unviewed_position_start=1&cust_params=deployment%3Ddevsite%26sample_ar%3Dpremidpostpod&cmsid=496&vid=short_onecue&correlator=',
};


/**
 * @param {!shakaAssets.KeySystem} keySystem
 * @return {!Array<string>}
 */
shakaAssets.identifiersForKeySystem = (keySystem) => {
  const keySystems = [];
  const KeySystem = shakaAssets.KeySystem;
  switch (keySystem) {
    case KeySystem.CLEAR_KEY:
      keySystems.push('org.w3.clearkey');
      break;
    case KeySystem.FAIRPLAY:
      keySystems.push('com.apple.fps');
      keySystems.push('com.apple.fps.1_0');
      break;
    case KeySystem.PLAYREADY:
      keySystems.push('com.microsoft.playready');
      keySystems.push('com.microsoft.playready.recommendation');
      keySystems.push('com.microsoft.playready.recommendation.3000');
      break;
    case KeySystem.WIDEVINE:
      keySystems.push('com.widevine.alpha');
      break;
  }
  return keySystems;
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
  // Set if the asset has ads. Auto set by calling setAdTagUri() on an asset.
  // Does not need to be set manually.
  ADS: 'Ads',

  // Set if the asset is a live stream.
  LIVE: 'Live',
  // A synthetic property used if the asset is VOD (not a live stream).
  VOD: 'VOD',
  // Set if the asset has at least one WebM stream.
  WEBM: 'WebM',
  // Set if the asset has at least one mp4 stream.
  MP4: 'MP4',
  // Set if the asset has at least one MPEG-2 TS stream.
  MP2TS: 'MPEG-2 TS',
  // Set if the asset has at least one containerless stream (AAC, etc).
  CONTAINERLESS: 'Containerless',

  // Set if the asset requires Dolby Vision support.
  DOLBY_VISION: 'Dolby Vision',
  // Set if the asset requires Dolby Vision Profile 5 support.
  DOLBY_VISION_P5: 'Dolby Vision P5',
  // Set if the asset requires Dolby Vision Profile 8.1 support.
  DOLBY_VISION_P8_1: 'Dolby Vision P8.1',
  // Set if the asset requires Dolby Vision Profile 8.4 support.
  DOLBY_VISION_P8_4: 'Dolby Vision P8.4',
  // Set if the asset requires Dolby Vision with MV-HEVC (for 3D) support.
  DOLBY_VISION_3D: 'Dolby Vision 3D',

  // Set if the asset requires AV1 support.
  AV1: 'AV1',
  // Set if the asset requires MV-HEVC support.
  MV_HEVC: 'MV-HEVC',
  // Set if the asset requires APAC support.
  APAC: 'APAC',

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

  // Set if the asset has Content Steering.
  CONTENT_STEERING: 'Content Steering',

  // Set if the asset supports MPD Patch.
  MPD_PATCH: 'MPD Patch',

  // Set if the asset is VR.
  VR: 'VR',

  // Set if the asset has MPD Chaining.
  MPD_CHAINING: 'MPD Chaining',

  // Set if the asset has Common Media Server Data.
  CMSD: 'Common Media Server Data',
};
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


/* eslint-disable @stylistic/max-len */
/** @const {!Array<!ShakaDemoAssetInfo>} */
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
      /* name= */ 'Big Buck Bunny: the Dark Truths of a Video Dev Cartoon (HLS, interstitials)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dark_truth.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/hls-interstitials/interstitial.m3u8',
      /* source= */ shakaAssets.Source.SHAKA)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.ADS)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4),
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
      /* name= */ 'Angel One (multicodec, multilingual, mpd chaining)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/angel_one.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/angel-one/dash_chaining.mpd',
      /* source= */ shakaAssets.Source.SHAKA)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.MULTIPLE_LANGUAGES)
      .addFeature(shakaAssets.Feature.SUBTITLES)
      .addFeature(shakaAssets.Feature.WEBM)
      .addFeature(shakaAssets.Feature.OFFLINE)
      .addFeature(shakaAssets.Feature.MPD_CHAINING),
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
      /* name= */ 'Angel One (HLS, MP4, SAMPLE-AES-CTR, multi-key)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/angel_one.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/angel-one-sample-aes-ctr-multiple-key/manifest.m3u8',
      /* source= */ shakaAssets.Source.SHAKA)
      .addKeySystem(shakaAssets.KeySystem.CLEAR_KEY)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.OFFLINE),
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
        language: 'und',
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
      /* name= */ 'Sintel 4k (multiperiod, mixed encryption, encrypted first)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/sintel.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/sintel-mixed-encryption/enc-clear-enc.mpd',
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
      /* name= */ 'Sintel 4k (multiperiod, mixed encryption, clear first)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/sintel.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/sintel-mixed-encryption/clear-enc-clear.mpd',
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
      /* name= */ 'Heliocentrism (multicodec, multiperiod)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/heliocentricism.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/heliocentrism/heliocentrism.mpd',
      /* source= */ shakaAssets.Source.SHAKA)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.WEBM)
      .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Heliocentrism (multiperiod with forced mimeType/codec changes)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/heliocentricism.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/heliocentrism-mixed-codec/heliocentrism.mpd',
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
      .addFeature(shakaAssets.Feature.OFFLINE)
      .setExtraConfig({
        manifest: {
          dash: {
            disableXlinkProcessing: false,
          },
        },
      }),
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
      /* name= */ 'Tears of Steel (DASH, Server Side ads)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/tears_of_steel.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-demo-assets/tos-ttml/dash.mpd',
      /* source= */ shakaAssets.Source.SHAKA)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.SUBTITLES)
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
      /* name= */ 'Shaka Player History (H264, VP9, AV1, live, DASH)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/shaka.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-live-assets/player-source.mpd',
      /* source= */ shakaAssets.Source.SHAKA)
      .addDescription('A self-indulgent DASH live stream.')
      .markAsFeatured('Shaka Player History: Live')
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.LIVE)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.WEBM),
  new ShakaDemoAssetInfo(
      /* name= */ 'Shaka Player History (H264, VP9, AV1, live, HLS)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/shaka.png',
      /* manifestUri= */ 'https://storage.googleapis.com/shaka-live-assets/player-source.m3u8',
      /* source= */ shakaAssets.Source.SHAKA)
      .addDescription('A self-indulgent HLS live stream.')
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
      .setExtraConfig({
        drm: {
          advanced: {
            'com.widevine.alpha': {
              headers: {
                // cspell: disable-next-line
                'X-AxDRM-Message': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZXJzaW9uIjoxLCJjb21fa2V5X2lkIjoiYjMzNjRlYjUtNTFmNi00YWUzLThjOTgtMzNjZWQ1ZTMxYzc4IiwibWVzc2FnZSI6eyJ0eXBlIjoiZW50aXRsZW1lbnRfbWVzc2FnZSIsImtleXMiOlt7ImlkIjoiOWViNDA1MGQtZTQ0Yi00ODAyLTkzMmUtMjdkNzUwODNlMjY2IiwiZW5jcnlwdGVkX2tleSI6ImxLM09qSExZVzI0Y3Iya3RSNzRmbnc9PSJ9XX19.4lWwW46k-oWcah8oN18LPj5OLS5ZU-_AQv7fe0JhNjA',
              },
            },
            'com.microsoft.playready': {
              headers: {
                // cspell: disable-next-line
                'X-AxDRM-Message': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZXJzaW9uIjoxLCJjb21fa2V5X2lkIjoiYjMzNjRlYjUtNTFmNi00YWUzLThjOTgtMzNjZWQ1ZTMxYzc4IiwibWVzc2FnZSI6eyJ0eXBlIjoiZW50aXRsZW1lbnRfbWVzc2FnZSIsImtleXMiOlt7ImlkIjoiOWViNDA1MGQtZTQ0Yi00ODAyLTkzMmUtMjdkNzUwODNlMjY2IiwiZW5jcnlwdGVkX2tleSI6ImxLM09qSExZVzI0Y3Iya3RSNzRmbnc9PSJ9XX19.4lWwW46k-oWcah8oN18LPj5OLS5ZU-_AQv7fe0JhNjA',
              },
            },
          },
        },
      }),
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
      .setExtraConfig({
        drm: {
          advanced: {
            'com.widevine.alpha': {
              headers: {
                // cspell: disable-next-line
                'X-AxDRM-Message': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZXJzaW9uIjoxLCJjb21fa2V5X2lkIjoiYjMzNjRlYjUtNTFmNi00YWUzLThjOTgtMzNjZWQ1ZTMxYzc4IiwibWVzc2FnZSI6eyJ0eXBlIjoiZW50aXRsZW1lbnRfbWVzc2FnZSIsImtleXMiOlt7ImlkIjoiODAzOTliZjUtOGEyMS00MDE0LTgwNTMtZTI3ZTc0OGU5OGMwIiwiZW5jcnlwdGVkX2tleSI6ImxpTkpxVmFZa05oK01LY3hKRms3SWc9PSJ9LHsiaWQiOiI5MDk1M2UwOS02Y2IyLTQ5YTMtYTI2MC03YTVmZWZlYWQ0OTkiLCJlbmNyeXB0ZWRfa2V5Ijoia1l0SEh2cnJmQ01lVmRKNkxrYmtuZz09In0seyJpZCI6IjBlNGRhOTJiLWQwZTgtNGE2Ni04YzNmLWMyNWE5N2ViNjUzMiIsImVuY3J5cHRlZF9rZXkiOiI3dzdOWkhITE1nSjRtUUtFSzVMVE1RPT0ifSx7ImlkIjoiNTg1ZjIzM2YtMzA3Mi00NmYxLTlmYTQtNmRjMjJjNjZhMDE0IiwiZW5jcnlwdGVkX2tleSI6IkFjNFVVbVl0Qko1blBROU4xNXJjM2c9PSJ9LHsiaWQiOiI0MjIyYmQ3OC1iYzQ1LTQxYmYtYjYzZS02ZjgxNGRjMzkxZGYiLCJlbmNyeXB0ZWRfa2V5IjoiTzZGTzBmcVNXb3BwN2JqYy9ENGxNQT09In1dfX0.uF6YlKAREOmbniAeYiH070HSJhV0YS7zSKjlCtiDR5Y',
              },
            },
            'com.microsoft.playready': {
              headers: {
                // cspell: disable-next-line
                'X-AxDRM-Message': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZXJzaW9uIjoxLCJjb21fa2V5X2lkIjoiYjMzNjRlYjUtNTFmNi00YWUzLThjOTgtMzNjZWQ1ZTMxYzc4IiwibWVzc2FnZSI6eyJ0eXBlIjoiZW50aXRsZW1lbnRfbWVzc2FnZSIsImtleXMiOlt7ImlkIjoiODAzOTliZjUtOGEyMS00MDE0LTgwNTMtZTI3ZTc0OGU5OGMwIiwiZW5jcnlwdGVkX2tleSI6ImxpTkpxVmFZa05oK01LY3hKRms3SWc9PSJ9LHsiaWQiOiI5MDk1M2UwOS02Y2IyLTQ5YTMtYTI2MC03YTVmZWZlYWQ0OTkiLCJlbmNyeXB0ZWRfa2V5Ijoia1l0SEh2cnJmQ01lVmRKNkxrYmtuZz09In0seyJpZCI6IjBlNGRhOTJiLWQwZTgtNGE2Ni04YzNmLWMyNWE5N2ViNjUzMiIsImVuY3J5cHRlZF9rZXkiOiI3dzdOWkhITE1nSjRtUUtFSzVMVE1RPT0ifSx7ImlkIjoiNTg1ZjIzM2YtMzA3Mi00NmYxLTlmYTQtNmRjMjJjNjZhMDE0IiwiZW5jcnlwdGVkX2tleSI6IkFjNFVVbVl0Qko1blBROU4xNXJjM2c9PSJ9LHsiaWQiOiI0MjIyYmQ3OC1iYzQ1LTQxYmYtYjYzZS02ZjgxNGRjMzkxZGYiLCJlbmNyeXB0ZWRfa2V5IjoiTzZGTzBmcVNXb3BwN2JqYy9ENGxNQT09In1dfX0.uF6YlKAREOmbniAeYiH070HSJhV0YS7zSKjlCtiDR5Y',
              },
            },
          },
        },
      }),
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
      .setExtraConfig({
        drm: {
          advanced: {
            'com.widevine.alpha': {
              headers: {
                // cspell: disable-next-line
                'X-AxDRM-Message': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZXJzaW9uIjoxLCJjb21fa2V5X2lkIjoiYjMzNjRlYjUtNTFmNi00YWUzLThjOTgtMzNjZWQ1ZTMxYzc4IiwibWVzc2FnZSI6eyJ0eXBlIjoiZW50aXRsZW1lbnRfbWVzc2FnZSIsImtleXMiOlt7ImlkIjoiMDg3Mjc4NmUtZjllNy00NjVmLWEzYTItNGU1YjBlZjhmYTQ1IiwiZW5jcnlwdGVkX2tleSI6IlB3NitlRVlOY3ZqWWJmc2gzWDNmbWc9PSJ9LHsiaWQiOiJjMTRmMDcwOS1mMmI5LTQ0MjctOTE2Yi02MWI1MjU4NjUwNmEiLCJlbmNyeXB0ZWRfa2V5IjoiLzErZk5paDM4bXFSdjR5Y1l6bnQvdz09In0seyJpZCI6IjhiMDI5ZTUxLWQ1NmEtNDRiZC05MTBmLWQ0YjVmZDkwZmJhMiIsImVuY3J5cHRlZF9rZXkiOiJrcTBKdVpFanBGTjhzYVRtdDU2ME9nPT0ifSx7ImlkIjoiMmQ2ZTkzODctNjBjYS00MTQ1LWFlYzItYzQwODM3YjRiMDI2IiwiZW5jcnlwdGVkX2tleSI6IlRjUlFlQld4RW9IT0tIcmFkNFNlVlE9PSJ9LHsiaWQiOiJkZTAyZjA3Zi1hMDk4LTRlZTAtYjU1Ni05MDdjMGQxN2ZiYmMiLCJlbmNyeXB0ZWRfa2V5IjoicG9lbmNTN0dnbWVHRmVvSjZQRUFUUT09In0seyJpZCI6IjkxNGU2OWY0LTBhYjMtNDUzNC05ZTlmLTk4NTM2MTVlMjZmNiIsImVuY3J5cHRlZF9rZXkiOiJlaUkvTXNsbHJRNHdDbFJUL0xObUNBPT0ifSx7ImlkIjoiZGE0NDQ1YzItZGI1ZS00OGVmLWIwOTYtM2VmMzQ3YjE2YzdmIiwiZW5jcnlwdGVkX2tleSI6IjJ3K3pkdnFycERWM3hSMGJKeTR1Z3c9PSJ9LHsiaWQiOiIyOWYwNWU4Zi1hMWFlLTQ2ZTQtODBlOS0yMmRjZDQ0Y2Q3YTEiLCJlbmNyeXB0ZWRfa2V5IjoiL3hsU0hweHdxdTNnby9nbHBtU2dhUT09In0seyJpZCI6IjY5ZmU3MDc3LWRhZGQtNGI1NS05NmNkLWMzZWRiMzk5MTg1MyIsImVuY3J5cHRlZF9rZXkiOiJ6dTZpdXpOMnBzaTBaU3hRaUFUa1JRPT0ifV19fQ.BXr93Et1krYMVs-CUnf7F3ywJWFRtxYdkR7Qn4w3-to',
              },
            },
            'com.microsoft.playready': {
              headers: {
                // cspell: disable-next-line
                'X-AxDRM-Message': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZXJzaW9uIjoxLCJjb21fa2V5X2lkIjoiYjMzNjRlYjUtNTFmNi00YWUzLThjOTgtMzNjZWQ1ZTMxYzc4IiwibWVzc2FnZSI6eyJ0eXBlIjoiZW50aXRsZW1lbnRfbWVzc2FnZSIsImtleXMiOlt7ImlkIjoiMDg3Mjc4NmUtZjllNy00NjVmLWEzYTItNGU1YjBlZjhmYTQ1IiwiZW5jcnlwdGVkX2tleSI6IlB3NitlRVlOY3ZqWWJmc2gzWDNmbWc9PSJ9LHsiaWQiOiJjMTRmMDcwOS1mMmI5LTQ0MjctOTE2Yi02MWI1MjU4NjUwNmEiLCJlbmNyeXB0ZWRfa2V5IjoiLzErZk5paDM4bXFSdjR5Y1l6bnQvdz09In0seyJpZCI6IjhiMDI5ZTUxLWQ1NmEtNDRiZC05MTBmLWQ0YjVmZDkwZmJhMiIsImVuY3J5cHRlZF9rZXkiOiJrcTBKdVpFanBGTjhzYVRtdDU2ME9nPT0ifSx7ImlkIjoiMmQ2ZTkzODctNjBjYS00MTQ1LWFlYzItYzQwODM3YjRiMDI2IiwiZW5jcnlwdGVkX2tleSI6IlRjUlFlQld4RW9IT0tIcmFkNFNlVlE9PSJ9LHsiaWQiOiJkZTAyZjA3Zi1hMDk4LTRlZTAtYjU1Ni05MDdjMGQxN2ZiYmMiLCJlbmNyeXB0ZWRfa2V5IjoicG9lbmNTN0dnbWVHRmVvSjZQRUFUUT09In0seyJpZCI6IjkxNGU2OWY0LTBhYjMtNDUzNC05ZTlmLTk4NTM2MTVlMjZmNiIsImVuY3J5cHRlZF9rZXkiOiJlaUkvTXNsbHJRNHdDbFJUL0xObUNBPT0ifSx7ImlkIjoiZGE0NDQ1YzItZGI1ZS00OGVmLWIwOTYtM2VmMzQ3YjE2YzdmIiwiZW5jcnlwdGVkX2tleSI6IjJ3K3pkdnFycERWM3hSMGJKeTR1Z3c9PSJ9LHsiaWQiOiIyOWYwNWU4Zi1hMWFlLTQ2ZTQtODBlOS0yMmRjZDQ0Y2Q3YTEiLCJlbmNyeXB0ZWRfa2V5IjoiL3hsU0hweHdxdTNnby9nbHBtU2dhUT09In0seyJpZCI6IjY5ZmU3MDc3LWRhZGQtNGI1NS05NmNkLWMzZWRiMzk5MTg1MyIsImVuY3J5cHRlZF9rZXkiOiJ6dTZpdXpOMnBzaTBaU3hRaUFUa1JRPT0ifV19fQ.BXr93Et1krYMVs-CUnf7F3ywJWFRtxYdkR7Qn4w3-to',
              },
            },
          },
        },
      }),
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
      .setExtraConfig({
        drm: {
          advanced: {
            'com.widevine.alpha': {
              headers: {
                // cspell: disable-next-line
                'X-AxDRM-Message': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJ2ZXJzaW9uIjogMSwKICAiY29tX2tleV9pZCI6ICI2OWU1NDA4OC1lOWUwLTQ1MzAtOGMxYS0xZWI2ZGNkMGQxNGUiLAogICJtZXNzYWdlIjogewogICAgInR5cGUiOiAiZW50aXRsZW1lbnRfbWVzc2FnZSIsCiAgICAidmVyc2lvbiI6IDIsCiAgICAibGljZW5zZSI6IHsKICAgICAgImFsbG93X3BlcnNpc3RlbmNlIjogdHJ1ZQogICAgfSwKICAgICJjb250ZW50X2tleXNfc291cmNlIjogewogICAgICAiaW5saW5lIjogWwogICAgICAgIHsKICAgICAgICAgICJpZCI6ICJiNTRlYzkxNC0xOTJkLTRlYTEtYWMxOS1mNDI5ZWI0OTgyNjgiLAogICAgICAgICAgImVuY3J5cHRlZF9rZXkiOiAiR1ZERnJZUU9Bb1kzZmpxVVVtamswQT09IiwKICAgICAgICAgICJ1c2FnZV9wb2xpY3kiOiAiUG9saWN5IEEiCiAgICAgICAgfSwKICAgICAgICB7CiAgICAgICAgICAiaWQiOiAiYzgzYzRlYTgtMGYyYS00NTIzLTg1MWMtZmJlY2NkYzBmMjAyIiwKICAgICAgICAgICJlbmNyeXB0ZWRfa2V5IjogIlRKZGZsWmJLYmZXQXl5K1dta21UUEE9PSIsCiAgICAgICAgICAidXNhZ2VfcG9saWN5IjogIlBvbGljeSBBIgogICAgICAgIH0sCiAgICAgICAgewogICAgICAgICAgImlkIjogImM4NjhjNzAyLWM3MWItNDA2NC1hZTJiLWMyNGY3Y2MxMDc5MiIsCiAgICAgICAgICAiZW5jcnlwdGVkX2tleSI6ICJ4QXJpUkpOcUFTdXp6RExDRzNXSjdnPT0iLAogICAgICAgICAgInVzYWdlX3BvbGljeSI6ICJQb2xpY3kgQSIKICAgICAgICB9CiAgICAgIF0KICAgIH0sCiAgICAiY29udGVudF9rZXlfdXNhZ2VfcG9saWNpZXMiOiBbCiAgICAgIHsKICAgICAgICAibmFtZSI6ICJQb2xpY3kgQSIsCiAgICAgICAgInBsYXlyZWFkeSI6IHsKICAgICAgICAgICJtaW5fZGV2aWNlX3NlY3VyaXR5X2xldmVsIjogMTUwLAogICAgICAgICAgInBsYXlfZW5hYmxlcnMiOiBbCiAgICAgICAgICAgICI3ODY2MjdEOC1DMkE2LTQ0QkUtOEY4OC0wOEFFMjU1QjAxQTciCiAgICAgICAgICBdCiAgICAgICAgfQogICAgICB9CiAgICBdCiAgfQp9.XC0YIbZpKGFc3IZROklP4LvISc6cZGpE9UL-XcpcqWg',
              },
            },
            'com.microsoft.playready': {
              headers: {
                // cspell: disable-next-line
                'X-AxDRM-Message': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJ2ZXJzaW9uIjogMSwKICAiY29tX2tleV9pZCI6ICI2OWU1NDA4OC1lOWUwLTQ1MzAtOGMxYS0xZWI2ZGNkMGQxNGUiLAogICJtZXNzYWdlIjogewogICAgInR5cGUiOiAiZW50aXRsZW1lbnRfbWVzc2FnZSIsCiAgICAidmVyc2lvbiI6IDIsCiAgICAibGljZW5zZSI6IHsKICAgICAgImFsbG93X3BlcnNpc3RlbmNlIjogdHJ1ZQogICAgfSwKICAgICJjb250ZW50X2tleXNfc291cmNlIjogewogICAgICAiaW5saW5lIjogWwogICAgICAgIHsKICAgICAgICAgICJpZCI6ICJiNTRlYzkxNC0xOTJkLTRlYTEtYWMxOS1mNDI5ZWI0OTgyNjgiLAogICAgICAgICAgImVuY3J5cHRlZF9rZXkiOiAiR1ZERnJZUU9Bb1kzZmpxVVVtamswQT09IiwKICAgICAgICAgICJ1c2FnZV9wb2xpY3kiOiAiUG9saWN5IEEiCiAgICAgICAgfSwKICAgICAgICB7CiAgICAgICAgICAiaWQiOiAiYzgzYzRlYTgtMGYyYS00NTIzLTg1MWMtZmJlY2NkYzBmMjAyIiwKICAgICAgICAgICJlbmNyeXB0ZWRfa2V5IjogIlRKZGZsWmJLYmZXQXl5K1dta21UUEE9PSIsCiAgICAgICAgICAidXNhZ2VfcG9saWN5IjogIlBvbGljeSBBIgogICAgICAgIH0sCiAgICAgICAgewogICAgICAgICAgImlkIjogImM4NjhjNzAyLWM3MWItNDA2NC1hZTJiLWMyNGY3Y2MxMDc5MiIsCiAgICAgICAgICAiZW5jcnlwdGVkX2tleSI6ICJ4QXJpUkpOcUFTdXp6RExDRzNXSjdnPT0iLAogICAgICAgICAgInVzYWdlX3BvbGljeSI6ICJQb2xpY3kgQSIKICAgICAgICB9CiAgICAgIF0KICAgIH0sCiAgICAiY29udGVudF9rZXlfdXNhZ2VfcG9saWNpZXMiOiBbCiAgICAgIHsKICAgICAgICAibmFtZSI6ICJQb2xpY3kgQSIsCiAgICAgICAgInBsYXlyZWFkeSI6IHsKICAgICAgICAgICJtaW5fZGV2aWNlX3NlY3VyaXR5X2xldmVsIjogMTUwLAogICAgICAgICAgInBsYXlfZW5hYmxlcnMiOiBbCiAgICAgICAgICAgICI3ODY2MjdEOC1DMkE2LTQ0QkUtOEY4OC0wOEFFMjU1QjAxQTciCiAgICAgICAgICBdCiAgICAgICAgfQogICAgICB9CiAgICBdCiAgfQp9.XC0YIbZpKGFc3IZROklP4LvISc6cZGpE9UL-XcpcqWg',
              },
            },
          },
        },
      }),
  new ShakaDemoAssetInfo(
      /* name= */ 'ClearKey with raw single key',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/tears_of_steel.png',
      /* manifestUri= */ 'https://media.axprod.net/TestVectors/v7-MultiDRM-SingleKey/Manifest_1080p_ClearKey.mpd',
      /* source= */ shakaAssets.Source.AXINOM)
      .addKeySystem(shakaAssets.KeySystem.CLEAR_KEY)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.MULTIPLE_LANGUAGES)
      .addFeature(shakaAssets.Feature.SUBTITLES)
      .addFeature(shakaAssets.Feature.OFFLINE)
      .setExtraConfig({
        drm: {
          clearKeys: {
            // cspell: disable-next-line
            'nrQFDeRLSAKTLifXUIPiZg': 'FmY0xnWCPCNaSpRG-tUuTQ',
          },
        },
      }),
  new ShakaDemoAssetInfo(
      /* name= */ 'ClearKey with raw multiple keys',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/tears_of_steel.png',
      /* manifestUri= */ 'https://media.axprod.net/TestVectors/v7-MultiDRM-MultiKey/Manifest_1080p_ClearKey.mpd',
      /* source= */ shakaAssets.Source.AXINOM)
      .addKeySystem(shakaAssets.KeySystem.CLEAR_KEY)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.MULTIPLE_LANGUAGES)
      .addFeature(shakaAssets.Feature.SUBTITLES)
      .addFeature(shakaAssets.Feature.OFFLINE)
      .setExtraConfig({
        drm: {
          clearKeys: {
            // cspell: disable
            'gDmb9YohQBSAU-J-dI6YwA': '3aHppzZ2g3Y3wK1uNnUXmg',
            'kJU-CWyySaOiYHpf7-rUmQ': 'zsmKW7Mq9Unz5R7oUGeF8w',
            'Dk2pK9DoSmaMP8Jal-tlMg': 'UmYYfGb7znuoFAQM79ayHw',
            'WF8jPzByRvGfpG3CLGagFA': 'jayKpC3tmPq4YKXkapa8FA',
            'QiK9eLxFQb-2Pm-BTcOR3w': 'GAMi9v92b9ca5yBwaptN-Q',
            // cspell: enable
          },
        },
      }),
  new ShakaDemoAssetInfo(
      /* name= */ 'Tears of Steel (HLS AVC - FairPlay - MultiKey)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/tears_of_steel.png',
      /* manifestUri= */ 'https://media.axprod.net/TestVectors/MultiKey/Hls_h264_1080p_cenc/manifest.m3u8',
      /* source= */ shakaAssets.Source.AXINOM)
      .addKeySystem(shakaAssets.KeySystem.FAIRPLAY)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.MULTIPLE_LANGUAGES)
      .addFeature(shakaAssets.Feature.SUBTITLES)
      .addLicenseServer('com.apple.fps', 'https://drm-fairplay-licensing.axprod.net/AcquireLicense')
      .setExtraConfig({
        drm: {
          advanced: {
            'com.apple.fps': {
              serverCertificateUri: 'https://vtb.axinom.com/FPScert/fairplay.cer',
              headers: {
                // cspell: disable-next-line
                'X-AxDRM-Message': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJ2ZXJzaW9uIjogMSwKICAiY29tX2tleV9pZCI6ICI2OWU1NDA4OC1lOWUwLTQ1MzAtOGMxYS0xZWI2ZGNkMGQxNGUiLAogICJtZXNzYWdlIjogewogICAgInR5cGUiOiAiZW50aXRsZW1lbnRfbWVzc2FnZSIsCiAgICAidmVyc2lvbiI6IDIsCiAgICAibGljZW5zZSI6IHsKICAgICAgImFsbG93X3BlcnNpc3RlbmNlIjogdHJ1ZQogICAgfSwKICAgICJjb250ZW50X2tleXNfc291cmNlIjogewogICAgICAiaW5saW5lIjogWwogICAgICAgIHsKICAgICAgICAgICJpZCI6ICI0MjZkMWEzMi03OGZkLTRmMjItODczMC02OGRiMzk3NGRkYTkiLAogICAgICAgICAgImVuY3J5cHRlZF9rZXkiOiAiZjFsLy95M0dnN3pFVE9qM1ZQTXovQT09IiwKICAgICAgICAgICJ1c2FnZV9wb2xpY3kiOiAiUG9saWN5IEEiCiAgICAgICAgfSwKICAgICAgICB7CiAgICAgICAgICAiaWQiOiAiOWRjOGU4MGEtY2JmYS00MWMzLTk4NGYtYjYwNDM0NDAzOTFhIiwKICAgICAgICAgICJlbmNyeXB0ZWRfa2V5IjogInlxOW9pSjJ0QnQ1bkpFM1VENE53bXc9PSIsCiAgICAgICAgICAidXNhZ2VfcG9saWN5IjogIlBvbGljeSBBIgogICAgICAgIH0sCiAgICAgICAgewogICAgICAgICAgImlkIjogIjQxYmFhNTk5LTY5MDUtNGZjMC1hOGM2LTM1NWRjZDFhYjM5ZiIsCiAgICAgICAgICAiZW5jcnlwdGVkX2tleSI6ICJ0ZWhGVGhwK2RpMUFHSHM2eGdySjBRPT0iLAogICAgICAgICAgInVzYWdlX3BvbGljeSI6ICJQb2xpY3kgQSIKICAgICAgICB9CiAgICAgIF0KICAgIH0sCiAgICAiY29udGVudF9rZXlfdXNhZ2VfcG9saWNpZXMiOiBbCiAgICAgIHsKICAgICAgICAibmFtZSI6ICJQb2xpY3kgQSIsCiAgICAgICAgInBsYXlyZWFkeSI6IHsKICAgICAgICAgICJtaW5fZGV2aWNlX3NlY3VyaXR5X2xldmVsIjogMTUwLAogICAgICAgICAgInBsYXlfZW5hYmxlcnMiOiBbCiAgICAgICAgICAgICI3ODY2MjdEOC1DMkE2LTQ0QkUtOEY4OC0wOEFFMjU1QjAxQTciCiAgICAgICAgICBdCiAgICAgICAgfQogICAgICB9CiAgICBdCiAgfQp9.KpLCxibrW87lZwA_CSuZdqj7u0L-lnt-e3z_M1Toas0',
              },
            },
          },
        },
      }),
  // End A
  new ShakaDemoAssetInfo(
      /* name= */ 'Tears of Steel (HLS HEVC - FairPlay)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/tears_of_steel.png',
      /* manifestUri= */ 'https://media.axprod.net/TestVectors/H265/protected_hls_1080p_h265_singlekey/manifest.m3u8',
      /* source= */ shakaAssets.Source.AXINOM)
      .addKeySystem(shakaAssets.KeySystem.FAIRPLAY)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.MULTIPLE_LANGUAGES)
      .addFeature(shakaAssets.Feature.SUBTITLES)
      .addLicenseServer('com.apple.fps', 'https://drm-fairplay-licensing.axprod.net/AcquireLicense')
      .setExtraConfig({
        drm: {
          advanced: {
            'com.apple.fps': {
              serverCertificateUri: 'https://vtb.axinom.com/FPScert/fairplay.cer',
              headers: {
                // cspell: disable-next-line
                'X-AxDRM-Message': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJ2ZXJzaW9uIjogMSwKICAiY29tX2tleV9pZCI6ICI2OWU1NDA4OC1lOWUwLTQ1MzAtOGMxYS0xZWI2ZGNkMGQxNGUiLAogICJtZXNzYWdlIjogewogICAgInR5cGUiOiAiZW50aXRsZW1lbnRfbWVzc2FnZSIsCiAgICAidmVyc2lvbiI6IDIsCiAgICAibGljZW5zZSI6IHsKICAgICAgImFsbG93X3BlcnNpc3RlbmNlIjogdHJ1ZQogICAgfSwKICAgICJjb250ZW50X2tleXNfc291cmNlIjogewogICAgICAiaW5saW5lIjogWwogICAgICAgIHsKICAgICAgICAgICJpZCI6ICI5ZmQzODVkNS1mMzg5LTQ4YjUtYjdjMy1iMTg2M2VlMTA4ODgiLAogICAgICAgICAgImVuY3J5cHRlZF9rZXkiOiAiS3ZhaytZZVF1NGU2QnRvcEQ2Wm1JUT09IiwKICAgICAgICAgICJ1c2FnZV9wb2xpY3kiOiAiUG9saWN5IEEiCiAgICAgICAgfQogICAgICBdCiAgICB9LAogICAgImNvbnRlbnRfa2V5X3VzYWdlX3BvbGljaWVzIjogWwogICAgICB7CiAgICAgICAgIm5hbWUiOiAiUG9saWN5IEEiLAogICAgICAgICJwbGF5cmVhZHkiOiB7CiAgICAgICAgICAibWluX2RldmljZV9zZWN1cml0eV9sZXZlbCI6IDE1MCwKICAgICAgICAgICJwbGF5X2VuYWJsZXJzIjogWwogICAgICAgICAgICAiNzg2NjI3RDgtQzJBNi00NEJFLThGODgtMDhBRTI1NUIwMUE3IgogICAgICAgICAgXQogICAgICAgIH0KICAgICAgfQogICAgXQogIH0KfQ.CNEEm6UhOFiXadbcxQrs64NEb9ys7YdPZ7TmTO8aTbg',
              },
            },
          },
        },
      }),
  // End Axinom assets }}}

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
      .addFeature(shakaAssets.Feature.LIVE)
      .addFeature(shakaAssets.Feature.MP4),
  new ShakaDemoAssetInfo(
      /* name= */ 'Live sim StartOver SegmentTemplate Duration [-20s, +20s] (2s segments)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://livesim2.dashif.org/livesim2/startrel_-20/stoprel_20/timeoffset_0/testpic_2s/Manifest.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.LIVE)
      .addFeature(shakaAssets.Feature.MP4),
  new ShakaDemoAssetInfo(
      /* name= */ 'Live sim SegmentTemplate Duration (multi-period 60s)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://livesim2.dashif.org/livesim2/utc_head/periods_60/testpic_2s/Manifest.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.LIVE)
      .addFeature(shakaAssets.Feature.MP4),
  new ShakaDemoAssetInfo(
      /* name= */ 'Live sim TTML Image Subtitles embedded (VoD)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://livesim2.dashif.org/vod/testpic_2s/img_subs.mpd',
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
      .addFeature(shakaAssets.Feature.LOW_LATENCY),
  new ShakaDemoAssetInfo(
      /* name= */ 'Live sim (CBCS single key)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://livesim2.dashif.org/livesim2/drm_EZDRM-1-key-cbcs/testpic_2s/Manifest.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
      .addKeySystem(shakaAssets.KeySystem.PLAYREADY)
      .addKeySystem(shakaAssets.KeySystem.WIDEVINE)
      .addFeature(shakaAssets.Feature.LIVE)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.DASH),
  new ShakaDemoAssetInfo(
      /* name= */ 'Live sim (CBCS multi-key)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://livesim2.dashif.org/livesim2/drm_EZDRM-2-keys-cbcs/testpic_2s/Manifest.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
      .addKeySystem(shakaAssets.KeySystem.PLAYREADY)
      .addKeySystem(shakaAssets.KeySystem.WIDEVINE)
      .addFeature(shakaAssets.Feature.LIVE)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.DASH),
  new ShakaDemoAssetInfo(
      /* name= */ 'DASH-IF CEA-608 VOD',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://livesim2.dashif.org/vod/testpic_2s/cea608.mpd',
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
      .addFeature(shakaAssets.Feature.LOW_LATENCY),
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
  new ShakaDemoAssetInfo(
      /* name= */ 'DASH-IF MPD Patch - SegmentTemplate with $Number$ (livesim)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://livesim2.dashif.org/livesim2/patch_60/testpic_2s/Manifest.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.LIVE)
      .addFeature(shakaAssets.Feature.MPD_PATCH),
  new ShakaDemoAssetInfo(
      /* name= */ 'DASH-IF MPD Patch - SegmentTemplate with $Number$, multiperiod (livesim)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://livesim2.dashif.org/livesim2/patch_60/periods_60/testpic_2s/Manifest.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.LIVE)
      .addFeature(shakaAssets.Feature.MPD_PATCH),
  new ShakaDemoAssetInfo(
      /* name= */ 'DASH-IF MPD Patch - SegmentTimeline with $Number$ (livesim)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://livesim2.dashif.org/livesim2/patch_60/segtimelinenr_1/testpic_2s/Manifest.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.LIVE)
      .addFeature(shakaAssets.Feature.MPD_PATCH),
  new ShakaDemoAssetInfo(
      /* name= */ 'DASH-IF MPD Patch - SegmentTimeline with $Number$, multiperiod (livesim)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://livesim2.dashif.org/livesim2/patch_60/segtimelinenr_1/periods_60/testpic_2s/Manifest.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.LIVE)
      .addFeature(shakaAssets.Feature.MPD_PATCH),
  new ShakaDemoAssetInfo(
      /* name= */ 'DASH-IF MPD Patch - SegmentTimeline with $Time$ (livesim)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://livesim2.dashif.org/livesim2/patch_60/segtimeline_1/testpic_2s/Manifest.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.LIVE)
      .addFeature(shakaAssets.Feature.MPD_PATCH),
  new ShakaDemoAssetInfo(
      /* name= */ 'DASH-IF MPD Patch - SegmentTimeline with $Time$, multiperiod (livesim)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://livesim2.dashif.org/livesim2/patch_60/segtimeline_1/periods_60/testpic_2s/Manifest.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.LIVE)
      .addFeature(shakaAssets.Feature.MPD_PATCH),
  new ShakaDemoAssetInfo(
      /* name= */ 'DASH-IF - Regular chaining',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/elephant.png',
      /* manifestUri= */ 'https://dash.akamaized.net/dash264/TestCasesIOP33/MPDChaining/regular_chain/1/manifest_regular_MPDChaining_live.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.MPD_CHAINING),
  new ShakaDemoAssetInfo(
      /* name= */ 'DASH-IF IMSC1 (CMAF) Image Subtitle',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://livesim2.dashif.org/vod/testpic_2s/imsc1_img.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.SUBTITLES)
      .addFeature(shakaAssets.Feature.MP4),
  new ShakaDemoAssetInfo(
      /* name= */ 'DASH-IF - trick mode (livesim)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://livesim2.dashif.org/livesim2/testpic_2s/Manifest_trickmode.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.LIVE)
      .addFeature(shakaAssets.Feature.TRICK_MODE),
  new ShakaDemoAssetInfo(
      /* name= */ 'DASH-IF - trick mode',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://livesim2.dashif.org/vod/testpic_2s/Manifest_trickmode.mpd',
      /* source= */ shakaAssets.Source.DASH_IF)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.TRICK_MODE),
  new ShakaDemoAssetInfo(
      /* name= */ 'DASH-IF - DASH Annex I',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/dash_if_test_pattern.png',
      /* manifestUri= */ 'https://livesim2.dashif.org/livesim2/annexI_a=X,b=Y/testpic_2s/Manifest.mpd?a=X&b=Y',
      /* source= */ shakaAssets.Source.DASH_IF)
      .addFeature(shakaAssets.Feature.LIVE)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.DASH),
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
      /* name= */ 'Art of Motion (HLS, MP4, AES-256)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/art_of_motion.png',
      /* manifestUri= */ 'https://jvaryhlstests.blob.core.windows.net/hlstestdata/playlist_encrypted.m3u8',
      /* source= */ shakaAssets.Source.BITCODIN)
      .addKeySystem(shakaAssets.KeySystem.AES128)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.MP4)
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
      .addFeature(shakaAssets.Feature.OFFLINE)
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
      .addFeature(shakaAssets.Feature.OFFLINE)
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
  new ShakaDemoAssetInfo(
      /* name= */ 'VR Playhouse (DASH, VR equirectangular)',
      /* iconUri= */ 'https://cdn.bitmovin.com/content/assets/playhouse-vr/poster.jpg',
      /* manifestUri= */ 'https://cdn.bitmovin.com/content/assets/playhouse-vr/mpds/105560.mpd',
      /* source= */ shakaAssets.Source.BITCODIN)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.VR)
      .addFeature(shakaAssets.Feature.OFFLINE)
      .setExtraUiConfig({
        displayInVrMode: true,
        defaultVrProjectionMode: 'equirectangular',
      }),
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


  // GPAC assets {{{
  // Src: https://gpac.wp.mines-telecom.fr/2012/02/23/dash-sequences/
  // NOTE: The assets here using the "live profile" are not actually
  // "live streams".  The content is still static, as is the timeline.

  // TODO: Get actual icon?
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
      /* name= */ 'onDemand profile',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/gpac_test_pattern.png',
      /* manifestUri= */ 'https://download.tsi.telecom-paristech.fr/gpac/DASH_CONFORMANCE/TelecomParisTech/mp4-onDemand/mp4-onDemand-mpd-AV.mpd',
      /* source= */ shakaAssets.Source.GPAC)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.OFFLINE),
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
      .addFeature(shakaAssets.Feature.LOW_LATENCY),
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
      .addFeature(shakaAssets.Feature.TRICK_MODE)
      .addFeature(shakaAssets.Feature.SUBTITLES)
      .addFeature(shakaAssets.Feature.OFFLINE)
      .addFeature(shakaAssets.Feature.THUMBNAILS),
  new ShakaDemoAssetInfo(
      /* name= */ '3D movie stream',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/prehistoric.png',
      /* manifestUri= */ 'https://devstreaming-cdn.apple.com/videos/streaming/examples/historic_planet_content_2023-10-26-3d-video/main.m3u8',
      /* source= */ shakaAssets.Source.APPLE)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.DOLBY_VISION)
      .addFeature(shakaAssets.Feature.DOLBY_VISION_3D)
      .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Spatial video stream',
      /* iconUri= */ '',
      /* manifestUri= */ 'https://devstreaming-cdn.apple.com/videos/streaming/examples/immersive-media/spatialLighthouseFlowersWaves/mvp.m3u8',
      /* source= */ shakaAssets.Source.APPLE)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.MV_HEVC)
      .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Apple Immersive Video stream',
      /* iconUri= */ '',
      /* manifestUri= */ 'https://devstreaming-cdn.apple.com/videos/streaming/examples/immersive-media/apple-immersive-video/primary.m3u8',
      /* source= */ shakaAssets.Source.APPLE)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.APAC)
      .addFeature(shakaAssets.Feature.VR)
      .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'View 180°',
      /* iconUri= */ '',
      /* manifestUri= */ 'https://devstreaming-cdn.apple.com/videos/streaming/examples/immersive-media/180Lighthouse/mvp.m3u8',
      /* source= */ shakaAssets.Source.APPLE)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MV_HEVC)
      .addFeature(shakaAssets.Feature.VR)
      .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'View 360°',
      /* iconUri= */ '',
      /* manifestUri= */ 'https://devstreaming-cdn.apple.com/videos/streaming/examples/immersive-media/360Lighthouse/mvp.m3u8',
      /* source= */ shakaAssets.Source.APPLE)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MV_HEVC)
      .addFeature(shakaAssets.Feature.VR)
      .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'View wide fov',
      /* iconUri= */ '',
      /* manifestUri= */ 'https://devstreaming-cdn.apple.com/videos/streaming/examples/immersive-media/wfovCausewayWalk/mvp.m3u8',
      /* source= */ shakaAssets.Source.APPLE)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MV_HEVC)
      .addFeature(shakaAssets.Feature.VR)
      .addFeature(shakaAssets.Feature.OFFLINE),
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
      /* manifestUri= */ 'https://test.playready.microsoft.com/smoothstreaming/SSWSS720H264/SuperSpeedway_720.ism/Manifest',
      /* source= */ shakaAssets.Source.MICROSOFT)
      .addFeature(shakaAssets.Feature.MSS)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Super Speedway Trailer (MSS - PlayReady)',
      /* iconUri= */ 'https://reference.dashif.org/dash.js/latest/samples/lib/img/mss-1.jpg',
      /* manifestUri= */ 'https://test.playready.microsoft.com/smoothstreaming/SSWSS720H264PR/SuperSpeedway_720.ism/Manifest',
      /* source= */ shakaAssets.Source.MICROSOFT)
      .addKeySystem(shakaAssets.KeySystem.PLAYREADY)
      .addFeature(shakaAssets.Feature.MSS)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.OFFLINE)
      .addLicenseServer('com.microsoft.playready', 'https://test.playready.microsoft.com/service/rightsmanager.asmx?cfg=(persist:false,sl:150)')
      .addOfflineLicenseServer('com.microsoft.playready', 'https://test.playready.microsoft.com/service/rightsmanager.asmx?cfg=(persist:true,sl:150)')
      .setMimeType('application/vnd.ms-sstr+xml'),
  new ShakaDemoAssetInfo(
      /* name= */ 'Taxi3 soundtrack (MSS - Clear)',
      /* iconUri= */ '',
      /* manifestUri= */ 'https://test.playready.microsoft.com/media/profficialsite/Taxi3_AACHE.ism/manifest',
      /* source= */ shakaAssets.Source.MICROSOFT)
      .addFeature(shakaAssets.Feature.MSS)
      .addFeature(shakaAssets.Feature.AUDIO_ONLY)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Taxi3 soundtrack (MSS - PlayReady)',
      /* iconUri= */ '',
      /* manifestUri= */ 'https://test.playready.microsoft.com/media/profficialsite/Taxi3_AACHEPR.ism/manifest',
      /* source= */ shakaAssets.Source.MICROSOFT)
      .addKeySystem(shakaAssets.KeySystem.PLAYREADY)
      .addFeature(shakaAssets.Feature.MSS)
      .addFeature(shakaAssets.Feature.AUDIO_ONLY)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.OFFLINE)
      .addLicenseServer('com.microsoft.playready', 'https://test.playready.microsoft.com/service/rightsmanager.asmx?cfg=(persist:false,sl:150)')
      .addOfflineLicenseServer('com.microsoft.playready', 'https://test.playready.microsoft.com/service/rightsmanager.asmx?cfg=(persist:true,sl:150)'),
  new ShakaDemoAssetInfo(
      /* name= */ 'Big Buck Bunny CBCS AV1 (DASH - PlayReady)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/big_buck_bunny.png',
      /* manifestUri= */ 'https://test.playready.microsoft.com/media/dash/BBBAV1CBC/manifest.mpd',
      /* source= */ shakaAssets.Source.MICROSOFT)
      .addKeySystem(shakaAssets.KeySystem.PLAYREADY)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.AV1)
      .addFeature(shakaAssets.Feature.OFFLINE)
      .addLicenseServer('com.microsoft.playready', 'https://test.playready.microsoft.com/core/rightsmanager.asmx?cfg=(ckt:AES128BitCBC)'),
  new ShakaDemoAssetInfo(
      /* name= */ 'Big Buck Bunny CENC AV1 (DASH - PlayReady)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/big_buck_bunny.png',
      /* manifestUri= */ 'https://test.playready.microsoft.com/media/dash/BBBAV1/manifest.mpd',
      /* source= */ shakaAssets.Source.MICROSOFT)
      .addKeySystem(shakaAssets.KeySystem.PLAYREADY)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.AV1)
      .addFeature(shakaAssets.Feature.OFFLINE)
      .addLicenseServer('com.microsoft.playready', 'https://test.playready.microsoft.com/core/rightsmanager.asmx'),
  new ShakaDemoAssetInfo(
      /* name= */ 'Big Buck Bunny CENC (DASH - PlayReady)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/big_buck_bunny.png',
      /* manifestUri= */ 'https://test.playready.microsoft.com/media/dash/APPLEENC_CBCS_BBB_1080p/1080p.mpd',
      /* source= */ shakaAssets.Source.MICROSOFT)
      .addKeySystem(shakaAssets.KeySystem.PLAYREADY)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.OFFLINE)
      .addLicenseServer('com.microsoft.playready', 'https://test.playready.microsoft.com/service/rightsmanager.asmx?cfg=(persist:false,ck:W31bfVt9W31bfVt9W31bfQ==,ckt:aescbc)')
      .addOfflineLicenseServer('com.microsoft.playready', 'https://test.playready.microsoft.com/service/rightsmanager.asmx?cfg=(persist:true,ck:W31bfVt9W31bfVt9W31bfQ==,ckt:aescbc)'),
  new ShakaDemoAssetInfo(
      /* name= */ 'Tears of Steel (DASH - PlayReady)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/tears_of_steel.png',
      /* manifestUri= */ 'https://test.playready.microsoft.com/media/profficialsite/tearsofsteel_4k.ism/manifest.mpd',
      /* source= */ shakaAssets.Source.MICROSOFT)
      .addKeySystem(shakaAssets.KeySystem.PLAYREADY)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.OFFLINE)
      .addLicenseServer('com.microsoft.playready', 'https://test.playready.microsoft.com/service/rightsmanager.asmx?cfg=(persist:false,sl:150)')
      .addOfflineLicenseServer('com.microsoft.playready', 'https://test.playready.microsoft.com/service/rightsmanager.asmx?cfg=(persist:true,sl:150)'),
  new ShakaDemoAssetInfo(
      /* name= */ 'Tears of Steel (MSS - PlayReady)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/tears_of_steel.png',
      /* manifestUri= */ 'https://test.playready.microsoft.com/media/profficialsite/tearsofsteel_4k.ism.smoothstreaming/manifest',
      /* source= */ shakaAssets.Source.MICROSOFT)
      .addKeySystem(shakaAssets.KeySystem.PLAYREADY)
      .addFeature(shakaAssets.Feature.MSS)
      .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.OFFLINE)
      .addLicenseServer('com.microsoft.playready', 'https://test.playready.microsoft.com/service/rightsmanager.asmx?cfg=(persist:false,sl:150)')
      .addOfflineLicenseServer('com.microsoft.playready', 'https://test.playready.microsoft.com/service/rightsmanager.asmx?cfg=(persist:true,sl:150)'),
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
        lcevc: {
          enabled: true,
          dynamicPerformanceScaling: true,
          logLevel: 0,
          drawLogo: false,
          poster: true,
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
      .addFeature(shakaAssets.Feature.TRICK_MODE)
      .addFeature(shakaAssets.Feature.OFFLINE)
      .addFeature(shakaAssets.Feature.LCEVC)
      .setExtraConfig({
        lcevc: {
          enabled: true,
          dynamicPerformanceScaling: true,
          logLevel: 0,
          drawLogo: false,
          poster: true,
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
      .addFeature(shakaAssets.Feature.TRICK_MODE)
      .addFeature(shakaAssets.Feature.OFFLINE)
      .addFeature(shakaAssets.Feature.LCEVC)
      .setExtraConfig({
        lcevc: {
          enabled: true,
          dynamicPerformanceScaling: true,
          logLevel: 0,
          drawLogo: false,
          poster: true,
        },
      }),
  new ShakaDemoAssetInfo(
      /* name= */ ' eSports LCEVC HEVC (DASH, MP4)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/shaka.png',
      /* manifestUri= */ 'https://d3mfda3gpj3dw1.cloudfront.net/vnCTVqNpUs9400xP/master.mpd',
      /* source= */ shakaAssets.Source.VNOVA)
      .addFeature(shakaAssets.Feature.DASH)
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
          poster: true,
        },
      }),
  new ShakaDemoAssetInfo(
      /* name= */ 'Big Buck Bunny LCEVC Dual track (DASH, MP4)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/big_buck_bunny.png',
      /* manifestUri= */ 'https://s3.eu-west-1.amazonaws.com/origin-prod-lon-v-nova.com/lcevcDualTrack/1080p30_3Mbps_no_dR/master.mpd',
      /* source= */ shakaAssets.Source.VNOVA)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.LCEVC),
  new ShakaDemoAssetInfo(
      /* name= */ 'Big Buck Bunny LCEVC Dual track Debug (DASH, MP4)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/big_buck_bunny.png',
      /* manifestUri= */ 'https://s3.eu-west-1.amazonaws.com/origin-prod-lon-v-nova.com/lcevcDualTrack/1080p30_3Mbps_with_dR/master.mpd',
      /* source= */ shakaAssets.Source.VNOVA)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.LCEVC),
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

  // Brightcove assets {{{
  /* Brightcove Contents */
  new ShakaDemoAssetInfo(
      /* name= */ 'Content Steering HLS',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/big_buck_bunny.png',
      /* manifestUri= */ 'https://fastly.content-steering.com/bbb_hls/master_steering_fastly_https.m3u8',
      /* source= */ shakaAssets.Source.BRIGHTCOVE)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.CONTENT_STEERING),
  new ShakaDemoAssetInfo(
      /* name= */ 'Content Steering DASH',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/big_buck_bunny.png',
      /* manifestUri= */ 'https://fastly.content-steering.com/bbb/playlist_steering_fastly_https_cdn-a_cdn-c_cdn-b.mpd',
      /* source= */ shakaAssets.Source.BRIGHTCOVE)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.CONTENT_STEERING),
  // }}}

  // Broadpeak assets {{{
  /* Broadpeak Contents */
  new ShakaDemoAssetInfo(
      /* name= */ 'Live low latency (SegmentTemplate, CMSD)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/spring.png',
      /* manifestUri= */ 'https://explo.broadpeak.tv:8343/bpk-tv/spring/lowlat/index.mpd',
      /* source= */ shakaAssets.Source.BROADPEAK)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.LIVE)
      .addFeature(shakaAssets.Feature.LOW_LATENCY)
      .addFeature(shakaAssets.Feature.CMSD),
  new ShakaDemoAssetInfo(
      /* name= */ 'Live low latency (SegmentTimeline, CMSD)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/spring.png',
      /* manifestUri= */ 'https://explo.broadpeak.tv:8343/bpk-tv/spring/lowlat/index_timeline.mpd',
      /* source= */ shakaAssets.Source.BROADPEAK)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.LIVE)
      .addFeature(shakaAssets.Feature.LOW_LATENCY)
      .addFeature(shakaAssets.Feature.CMSD),
  // }}}

  // EZDRM assets {{{
  /* EZDRM Contents */
  new ShakaDemoAssetInfo(
      /* name= */ 'Big Buck Bunny (FairPlay)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/big_buck_bunny.png',
      /* manifestUri= */ 'https://na-fps.ezdrm.com/demo/ezdrm/master.m3u8',
      /* source= */ shakaAssets.Source.EZDRM)
      .addKeySystem(shakaAssets.KeySystem.FAIRPLAY)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addLicenseServer('com.apple.fps', 'https://fps.ezdrm.com/api/licenses/b99ed9e5-c641-49d1-bfa8-43692b686ddb')
      .setExtraConfig({
        drm: {
          advanced: {
            'com.apple.fps': {
              serverCertificateUri: 'https://fps.ezdrm.com/demo/video/eleisure.cer',
            },
          },
        },
      }),
  // }}}

  // THEOplayer assets {{{
  /* THEOplayer Contents */
  new ShakaDemoAssetInfo(
      /* name= */ 'National Geographic (HLS, VR equirectangular)',
      /* iconUri= */ 'https://demo.theoplayer.com/hubfs/videos/natgeo/poster.jpg',
      /* manifestUri= */ 'https://demo.theoplayer.com/hubfs/videos/natgeo/playlist.m3u8',
      /* source= */ shakaAssets.Source.THEO_PLAYER)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP2TS)
      .addFeature(shakaAssets.Feature.VR)
      .addFeature(shakaAssets.Feature.OFFLINE)
      .setExtraUiConfig({
        displayInVrMode: true,
        defaultVrProjectionMode: 'equirectangular',
      }),
  // }}}

  // JW Player assets {{{
  /* JW Player Contents */
  new ShakaDemoAssetInfo(
      /* name= */ 'Delta wing (MP4, VR cubemap)',
      /* iconUri= */ 'https://electroteque.org/plugins/jwplayer/vrvideo/images/previews/cubemap.png',
      /* manifestUri= */ 'https://videos.electroteque.org/360/ultra_light_flight_cubemap.mp4',
      /* source= */ shakaAssets.Source.JWPLAYER)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.VR)
      .setExtraUiConfig({
        displayInVrMode: true,
        defaultVrProjectionMode: 'cubemap',
      }),
  new ShakaDemoAssetInfo(
      /* name= */ 'Dragster (MP4, VR equirectangular)',
      /* iconUri= */ 'https://electroteque.org/plugins/jwplayer/vrvideo/images/previews/playlists.png',
      /* manifestUri= */ 'https://videos.electroteque.org/360/dragster_4k_720p.mp4',
      /* source= */ shakaAssets.Source.JWPLAYER)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.VR)
      .setExtraUiConfig({
        displayInVrMode: true,
        defaultVrProjectionMode: 'equirectangular',
      }),
  // }}}

  // BBC assets {{{
  /* BBC Contents */
  new ShakaDemoAssetInfo(
      /* name= */ 'On-demand Testcard - WOFF Font Download signalled with supplemental property descriptor',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/bbc.png',
      /* manifestUri= */ 'https://rdmedia.bbc.co.uk/testcard/vod/manifests/avc-ctv-stereo-en-sfdt-woff.mpd',
      /* source= */ shakaAssets.Source.BBC)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.SUBTITLES),
  new ShakaDemoAssetInfo(
      /* name= */ 'On-demand Testcard - WOFF Font Download signalled with essential property descriptor',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/bbc.png',
      /* manifestUri= */ 'https://rdmedia.bbc.co.uk/testcard/vod/manifests/avc-ctv-stereo-en-efdt-woff.mpd',
      /* source= */ shakaAssets.Source.BBC)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.SUBTITLES),
  new ShakaDemoAssetInfo(
      /* name= */ 'On-demand Testcard - WOFF Font Download signalled with essential property descriptor with relative url',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/bbc.png',
      /* manifestUri= */ 'https://rdmedia.bbc.co.uk/testcard/vod/manifests/avc-ctv-stereo-en-efdt-woff-bur.mpd',
      /* source= */ shakaAssets.Source.BBC)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.SUBTITLES),
  new ShakaDemoAssetInfo(
      /* name= */ 'Live Testcard - WOFF Font Download signalled with supplemental property descriptor',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/bbc.png',
      /* manifestUri= */ 'https://rdmedia.bbc.co.uk/testcard/simulcast/manifests/avc-ctv-stereo-en-sfdt-woff.mpd',
      /* source= */ shakaAssets.Source.BBC)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.SUBTITLES)
      .addFeature(shakaAssets.Feature.LIVE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Live Testcard - WOFF Font Download signalled with essential property descriptor',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/bbc.png',
      /* manifestUri= */ 'https://rdmedia.bbc.co.uk/testcard/simulcast/manifests/avc-ctv-stereo-en-efdt-woff.mpd',
      /* source= */ shakaAssets.Source.BBC)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.SUBTITLES)
      .addFeature(shakaAssets.Feature.LIVE),
  new ShakaDemoAssetInfo(
      /* name= */ 'On-demand Testcard - Multiple Languages, AAC Stereo and Surround, Audio Description, AVC Video',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/bbc.png',
      /* manifestUri= */ 'https://rdmedia.bbc.co.uk/testcard/vod/manifests/avc-full.mpd',
      /* source= */ shakaAssets.Source.BBC)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.MULTIPLE_LANGUAGES)
      .addFeature(shakaAssets.Feature.SUBTITLES)
      .addFeature(shakaAssets.Feature.SURROUND)
      .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Live Testcard - Multiple Languages, AVC Video',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/bbc.png',
      /* manifestUri= */ 'https://rdmedia.bbc.co.uk/testcard/simulcast/manifests/avc-full.mpd',
      /* source= */ shakaAssets.Source.BBC)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.MULTIPLE_LANGUAGES)
      .addFeature(shakaAssets.Feature.SUBTITLES)
      .addFeature(shakaAssets.Feature.SURROUND)
      .addFeature(shakaAssets.Feature.LIVE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Live Testcard - Multiple Languages, HEVC Video',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/bbc.png',
      /* manifestUri= */ 'https://rdmedia.bbc.co.uk/testcard/simulcast/manifests/hevc-ctv.mpd',
      /* source= */ shakaAssets.Source.BBC)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.MULTIPLE_LANGUAGES)
      .addFeature(shakaAssets.Feature.SUBTITLES)
      .addFeature(shakaAssets.Feature.SURROUND)
      .addFeature(shakaAssets.Feature.LIVE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Low-Latency Live Testcard - 4 Chunks per Segment, Multiple Languages, AVC Video',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/bbc.png',
      /* manifestUri= */ 'https://rdmedia.bbc.co.uk/testcard/lowlatency/manifests/ll-avc-full.mpd',
      /* source= */ shakaAssets.Source.BBC)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.MULTIPLE_LANGUAGES)
      .addFeature(shakaAssets.Feature.SUBTITLES)
      .addFeature(shakaAssets.Feature.SURROUND)
      .addFeature(shakaAssets.Feature.LIVE)
      .addFeature(shakaAssets.Feature.LOW_LATENCY),
  new ShakaDemoAssetInfo(
      /* name= */ 'Low-Latency Live Testcard - 4 Chunks per Segment, Multiple Languages, HEVC Video',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/bbc.png',
      /* manifestUri= */ 'https://rdmedia.bbc.co.uk/testcard/lowlatency/manifests/ll-hevc-ctv.mpd',
      /* source= */ shakaAssets.Source.BBC)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.MULTIPLE_LANGUAGES)
      .addFeature(shakaAssets.Feature.SUBTITLES)
      .addFeature(shakaAssets.Feature.SURROUND)
      .addFeature(shakaAssets.Feature.LIVE)
      .addFeature(shakaAssets.Feature.LOW_LATENCY),
  new ShakaDemoAssetInfo(
      /* name= */ 'On-demand Elephant\'s Dream - with EBU-TT-D Subtitle Track in English',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/elephant.png',
      /* manifestUri= */ 'https://rdmedia.bbc.co.uk/elephants_dream/1/client_manifest-all.mpd',
      /* source= */ shakaAssets.Source.BBC)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.SUBTITLES)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'On-demand Elephant\'s Dream - with EBU-TT-D \'Snaking\' Subtitle Track (random text) - lines grow over time simulating live subtitles',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/elephant.png',
      /* manifestUri= */ 'https://rdmedia.bbc.co.uk/elephants_dream/1/client_manifest-snake.mpd',
      /* source= */ shakaAssets.Source.BBC)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.SUBTITLES)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'Live Testcard Audio - DASH - AAC-LC Stereo in English',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/bbc.png',
      /* manifestUri= */ 'https://rdmedia.bbc.co.uk/testcard/simulcast/manifests/radio-lc-en.mpd',
      /* source= */ shakaAssets.Source.BBC)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.LIVE)
      .addFeature(shakaAssets.Feature.AUDIO_ONLY),
  new ShakaDemoAssetInfo(
      /* name= */ 'Live Testcard Audio - DASH - HE-AAC Stereo in English',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/bbc.png',
      /* manifestUri= */ 'https://rdmedia.bbc.co.uk/testcard/simulcast/manifests/radio-he-en.mpd',
      /* source= */ shakaAssets.Source.BBC)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.LIVE)
      .addFeature(shakaAssets.Feature.AUDIO_ONLY),
  new ShakaDemoAssetInfo(
      /* name= */ 'On-demand Testcard Audio - DASH - AAC-LC Surround (4 active channels) in English',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/bbc.png',
      /* manifestUri= */ 'https://rdmedia.bbc.co.uk/testcard/vod/manifests/radio-surround-en.mpd',
      /* source= */ shakaAssets.Source.BBC)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.SURROUND)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.AUDIO_ONLY)
      .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'On-demand Testcard Audio - DASH - FLAC Stereo in English',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/bbc.png',
      /* manifestUri= */ 'https://rdmedia.bbc.co.uk/testcard/vod/manifests/radio-flac-en.mpd',
      /* source= */ shakaAssets.Source.BBC)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.AUDIO_ONLY)
      .addFeature(shakaAssets.Feature.OFFLINE),
  new ShakaDemoAssetInfo(
      /* name= */ 'On-demand Testcard Audio - HLS - FLAC Stereo in English',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/bbc.png',
      /* manifestUri= */ 'https://rdmedia.bbc.co.uk/testcard/vod/manifests/radio-flac-en.m3u8',
      /* source= */ shakaAssets.Source.BBC)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.AUDIO_ONLY)
      .addFeature(shakaAssets.Feature.OFFLINE),
  // }}}

  // Dolby assets {{{
  /* Dolby Contents */
  new ShakaDemoAssetInfo(
      /* name= */ 'Dolby Vision P5 DASH',
      /* iconUri= */ '',
      /* manifestUri= */ 'https://ott.dolby.com/browser_test_kit/clear/p5/24/dash.mpd',
      /* source= */ shakaAssets.Source.DOLBY)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.SURROUND)
      .addFeature(shakaAssets.Feature.DOLBY_VISION)
      .addFeature(shakaAssets.Feature.DOLBY_VISION_P5),
  new ShakaDemoAssetInfo(
      /* name= */ 'Dolby Vision P8.1 DASH',
      /* iconUri= */ '',
      /* manifestUri= */ 'https://ott.dolby.com/browser_test_kit/clear/p81/24/dash.mpd',
      /* source= */ shakaAssets.Source.DOLBY)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.SURROUND)
      .addFeature(shakaAssets.Feature.DOLBY_VISION)
      .addFeature(shakaAssets.Feature.DOLBY_VISION_P8_1),
  new ShakaDemoAssetInfo(
      /* name= */ 'Dolby Vision P8.4 DASH',
      /* iconUri= */ '',
      /* manifestUri= */ 'https://ott.dolby.com/browser_test_kit/clear/p84/24/dash.mpd',
      /* source= */ shakaAssets.Source.DOLBY)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.SURROUND)
      .addFeature(shakaAssets.Feature.DOLBY_VISION)
      .addFeature(shakaAssets.Feature.DOLBY_VISION_P8_4),
  new ShakaDemoAssetInfo(
      /* name= */ 'Dolby Vision P5 HLS',
      /* iconUri= */ '',
      /* manifestUri= */ 'https://ott.dolby.com/browser_test_kit/clear/p5/24/master.m3u8',
      /* source= */ shakaAssets.Source.DOLBY)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.SURROUND)
      .addFeature(shakaAssets.Feature.DOLBY_VISION)
      .addFeature(shakaAssets.Feature.DOLBY_VISION_P5),
  new ShakaDemoAssetInfo(
      /* name= */ 'Dolby Vision P8.1 HLS',
      /* iconUri= */ '',
      /* manifestUri= */ 'https://ott.dolby.com/browser_test_kit/clear/p81/24/master.m3u8',
      /* source= */ shakaAssets.Source.DOLBY)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.SURROUND)
      .addFeature(shakaAssets.Feature.DOLBY_VISION)
      .addFeature(shakaAssets.Feature.DOLBY_VISION_P8_1),
  new ShakaDemoAssetInfo(
      /* name= */ 'Dolby Vision P8.4 HLS',
      /* iconUri= */ '',
      /* manifestUri= */ 'https://ott.dolby.com/browser_test_kit/clear/p84/24/master.m3u8',
      /* source= */ shakaAssets.Source.DOLBY)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.SURROUND)
      .addFeature(shakaAssets.Feature.DOLBY_VISION)
      .addFeature(shakaAssets.Feature.DOLBY_VISION_P8_4),
  new ShakaDemoAssetInfo(
      /* name= */ 'Dolby Vision P5 DASH (Multi-DRM CENC)',
      /* iconUri= */ '',
      /* manifestUri= */ 'https://ott.dolby.com/browser_test_kit/cenc/p5/24/dash.mpd',
      /* source= */ shakaAssets.Source.DOLBY)
      .addKeySystem(shakaAssets.KeySystem.PLAYREADY)
      .addKeySystem(shakaAssets.KeySystem.WIDEVINE)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.SURROUND)
      .addFeature(shakaAssets.Feature.DOLBY_VISION)
      .addFeature(shakaAssets.Feature.DOLBY_VISION_P5)
      .addLicenseServer('com.microsoft.playready', 'https://playready.ezdrm.com/cency/preauth.aspx?pX=DCB4DB')
      .addLicenseServer('com.widevine.alpha', ' https://widevine-dash.ezdrm.com/proxy?pX=E8A6EE'),
  new ShakaDemoAssetInfo(
      /* name= */ 'Dolby Vision P8.1 DASH (Multi-DRM CENC)',
      /* iconUri= */ '',
      /* manifestUri= */ 'https://ott.dolby.com/browser_test_kit/cenc/p81/24/dash.mpd',
      /* source= */ shakaAssets.Source.DOLBY)
      .addKeySystem(shakaAssets.KeySystem.PLAYREADY)
      .addKeySystem(shakaAssets.KeySystem.WIDEVINE)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.SURROUND)
      .addFeature(shakaAssets.Feature.DOLBY_VISION)
      .addFeature(shakaAssets.Feature.DOLBY_VISION_P8_1)
      .addLicenseServer('com.microsoft.playready', 'https://playready.ezdrm.com/cency/preauth.aspx?pX=DCB4DB')
      .addLicenseServer('com.widevine.alpha', ' https://widevine-dash.ezdrm.com/proxy?pX=E8A6EE'),
  new ShakaDemoAssetInfo(
      /* name= */ 'Dolby Vision P8.4 DASH (Multi-DRM CENC)',
      /* iconUri= */ '',
      /* manifestUri= */ 'https://ott.dolby.com/browser_test_kit/cenc/p84/24/dash.mpd',
      /* source= */ shakaAssets.Source.DOLBY)
      .addKeySystem(shakaAssets.KeySystem.PLAYREADY)
      .addKeySystem(shakaAssets.KeySystem.WIDEVINE)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.SURROUND)
      .addFeature(shakaAssets.Feature.DOLBY_VISION)
      .addFeature(shakaAssets.Feature.DOLBY_VISION_P8_4)
      .addLicenseServer('com.microsoft.playready', 'https://playready.ezdrm.com/cency/preauth.aspx?pX=DCB4DB')
      .addLicenseServer('com.widevine.alpha', ' https://widevine-dash.ezdrm.com/proxy?pX=E8A6EE'),
  new ShakaDemoAssetInfo(
      /* name= */ 'Dolby Vision P5 DASH (Multi-DRM CBCS)',
      /* iconUri= */ '',
      /* manifestUri= */ 'https://ott.dolby.com/browser_test_kit/cbcs/p5/24/dash.mpd',
      /* source= */ shakaAssets.Source.DOLBY)
      .addKeySystem(shakaAssets.KeySystem.PLAYREADY)
      .addKeySystem(shakaAssets.KeySystem.WIDEVINE)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.SURROUND)
      .addFeature(shakaAssets.Feature.DOLBY_VISION)
      .addFeature(shakaAssets.Feature.DOLBY_VISION_P5)
      .addLicenseServer('com.microsoft.playready', 'https://playready.ezdrm.com/cency/preauth.aspx?pX=DCB4DB')
      .addLicenseServer('com.widevine.alpha', ' https://widevine-dash.ezdrm.com/proxy?pX=E8A6EE'),
  new ShakaDemoAssetInfo(
      /* name= */ 'Dolby Vision P8.1 DASH (Multi-DRM CBCS)',
      /* iconUri= */ '',
      /* manifestUri= */ 'https://ott.dolby.com/browser_test_kit/cbcs/p81/24/dash.mpd',
      /* source= */ shakaAssets.Source.DOLBY)
      .addKeySystem(shakaAssets.KeySystem.PLAYREADY)
      .addKeySystem(shakaAssets.KeySystem.WIDEVINE)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.SURROUND)
      .addFeature(shakaAssets.Feature.DOLBY_VISION)
      .addFeature(shakaAssets.Feature.DOLBY_VISION_P8_1)
      .addLicenseServer('com.microsoft.playready', 'https://playready.ezdrm.com/cency/preauth.aspx?pX=DCB4DB')
      .addLicenseServer('com.widevine.alpha', ' https://widevine-dash.ezdrm.com/proxy?pX=E8A6EE'),
  new ShakaDemoAssetInfo(
      /* name= */ 'Dolby Vision P8.4 DASH (Multi-DRM CBCS)',
      /* iconUri= */ '',
      /* manifestUri= */ 'https://ott.dolby.com/browser_test_kit/cbcs/p84/24/dash.mpd',
      /* source= */ shakaAssets.Source.DOLBY)
      .addKeySystem(shakaAssets.KeySystem.PLAYREADY)
      .addKeySystem(shakaAssets.KeySystem.WIDEVINE)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.SURROUND)
      .addFeature(shakaAssets.Feature.DOLBY_VISION)
      .addFeature(shakaAssets.Feature.DOLBY_VISION_P8_4)
      .addLicenseServer('com.microsoft.playready', 'https://playready.ezdrm.com/cency/preauth.aspx?pX=DCB4DB')
      .addLicenseServer('com.widevine.alpha', ' https://widevine-dash.ezdrm.com/proxy?pX=E8A6EE'),
  new ShakaDemoAssetInfo(
      /* name= */ 'Dolby Vision P5 HLS FairPlay',
      /* iconUri= */ '',
      /* manifestUri= */ 'https://ott.dolby.com/browser_test_kit/cbcs/p5/24/master.m3u8',
      /* source= */ shakaAssets.Source.DOLBY)
      .addKeySystem(shakaAssets.KeySystem.FAIRPLAY)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.SURROUND)
      .addFeature(shakaAssets.Feature.DOLBY_VISION)
      .addFeature(shakaAssets.Feature.DOLBY_VISION_P5)
      .addLicenseServer('com.apple.fps', 'https://fps.ezdrm.com/api/licenses/auth?pX=9d69c5&assetID=dd90eccc-a5eb-428a-aca5-ae461c3338f6')
      .setExtraConfig({
        drm: {
          advanced: {
            'com.apple.fps': {
              serverCertificateUri: 'https://ott.dolby.com/OnDelKits/fairplay.cer',
            },
          },
        },
        streaming: {
          useNativeHlsForFairPlay: false,
        },
      }),
  new ShakaDemoAssetInfo(
      /* name= */ 'Dolby Vision P8.1 HLS FairPlay',
      /* iconUri= */ '',
      /* manifestUri= */ 'https://ott.dolby.com/browser_test_kit/cbcs/p81/24/master.m3u8',
      /* source= */ shakaAssets.Source.DOLBY)
      .addKeySystem(shakaAssets.KeySystem.FAIRPLAY)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.SURROUND)
      .addFeature(shakaAssets.Feature.DOLBY_VISION)
      .addFeature(shakaAssets.Feature.DOLBY_VISION_P8_1)
      .addLicenseServer('com.apple.fps', 'https://fps.ezdrm.com/api/licenses/auth?pX=9d69c5&assetID=03854522-021f-45bb-a51c-93e7a63d3db9')
      .setExtraConfig({
        drm: {
          advanced: {
            'com.apple.fps': {
              serverCertificateUri: 'https://ott.dolby.com/OnDelKits/fairplay.cer',
            },
          },
        },
        streaming: {
          useNativeHlsForFairPlay: false,
        },
      }),
  new ShakaDemoAssetInfo(
      /* name= */ 'Dolby Vision P8.4 HLS FairPlay',
      /* iconUri= */ '',
      /* manifestUri= */ 'https://ott.dolby.com/browser_test_kit/cbcs/p84/24/master.m3u8',
      /* source= */ shakaAssets.Source.DOLBY)
      .addKeySystem(shakaAssets.KeySystem.FAIRPLAY)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.ULTRA_HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.SURROUND)
      .addFeature(shakaAssets.Feature.DOLBY_VISION)
      .addFeature(shakaAssets.Feature.DOLBY_VISION_P8_4)
      .addLicenseServer('com.apple.fps', 'https://fps.ezdrm.com/api/licenses/auth?pX=9d69c5&assetID=14ad9b7f-f9c5-417b-9449-7e558550f5d5')
      .setExtraConfig({
        drm: {
          advanced: {
            'com.apple.fps': {
              serverCertificateUri: 'https://ott.dolby.com/OnDelKits/fairplay.cer',
            },
          },
        },
        streaming: {
          useNativeHlsForFairPlay: false,
        },
      }),
  new ShakaDemoAssetInfo(
      /* name= */ 'Multiple Dolby audio formats',
      /* iconUri= */ '',
      /* manifestUri= */ 'https://webapi.streaming.dolby.com/v0_9/sources/media/v01/dash/lesson_8.mpd',
      /* source= */ shakaAssets.Source.DOLBY)
      .addFeature(shakaAssets.Feature.DASH)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.OFFLINE),
  // }}}
];
/* eslint-enable @stylistic/max-len */
