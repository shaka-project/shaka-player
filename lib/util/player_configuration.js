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

goog.provide('shaka.util.PlayerConfiguration');

goog.require('shaka.abr.SimpleAbrManager');
goog.require('shaka.util.ConfigUtils');


// TODO(vaage): Many times in our configs, we need to create an empty
//  implementation of a method, but to avoid closure from removing unused
//  parameters (and breaking our merge config code) we need to use each
//  parameter. Is there a better solution to this problem than what we are
//  doing now?
//
//  NOTE: Chrome App Content Security Policy prohibits usage of new Function()

/**
 * @final
 * @export
 */
shaka.util.PlayerConfiguration = class {
  /** @return {shaka.extern.PlayerConfiguration} */
  static createDefault() {
    // This is a relatively safe default, since 3G cell connections
    // are faster than this.  For slower connections, such as 2G,
    // the default estimate may be too high.
    let bandwidthEstimate = 500e3; // 500kbps

    let abrMaxHeight = Infinity;

    // Some browsers implement the Network Information API, which allows
    // retrieving information about a user's network connection.
    if (navigator.connection) {
      // If it's available, get the bandwidth estimate from the browser (in
      // megabits per second) and use it as defaultBandwidthEstimate.
      bandwidthEstimate = navigator.connection.downlink * 1e6;
      // TODO: Move this into AbrManager, where changes to the estimate can be
      // observed and absorbed.

      // If the user has checked a box in the browser to ask it to use less
      // data, the browser will expose this intent via connection.saveData.
      // When that is true, we will default the max ABR height to 360p. Apps
      // can override this if they wish.
      //
      // The decision to use 360p was somewhat arbitrary. We needed a default
      // limit, and rather than restrict to a certain bandwidth, we decided to
      // restrict resolution. This will implicitly restrict bandwidth and
      // therefore save data. We (Shaka+Chrome) judged that:
      //   - HD would be inappropriate
      //   - If a user is asking their browser to save data, 360p it reasonable
      //   - 360p would not look terrible on small mobile device screen
      // We also found that:
      //   - YouTube's website on mobile defaults to 360p (as of 2018)
      //   - iPhone 6, in portrait mode, has a physical resolution big enough
      //     for 360p widescreen, but a little smaller than 480p widescreen
      //     (https://apple.co/2yze4es)
      // If the content's lowest resolution is above 360p, AbrManager will use
      // the lowest resolution.
      if (navigator.connection.saveData) {
        abrMaxHeight = 360;
      }
    }

    const drm = {
      retryParameters: shaka.net.NetworkingEngine.defaultRetryParameters(),
      // These will all be verified by special cases in mergeConfigObjects_():
      servers: {},    // key is arbitrary key system ID, value must be string
      clearKeys: {},  // key is arbitrary key system ID, value must be string
      advanced: {},    // key is arbitrary key system ID, value is a record type
      delayLicenseRequestUntilPlayed: false,
      initDataTransform: shaka.media.DrmEngine.defaultInitDataTransform,
      fairPlayTransform: true,
    };

    const manifest = {
      retryParameters: shaka.net.NetworkingEngine.defaultRetryParameters(),
      availabilityWindowOverride: NaN,
      disableAudio: false,
      dash: {
        // Reference node to keep closure from removing it.
        // If the argument is removed, it breaks our function length check
        // in mergeConfigObjects_().
        customScheme: (node) => {
          if (node) return null;
        },
        clockSyncUri: '',
        ignoreDrmInfo: false,
        xlinkFailGracefully: false,
        defaultPresentationDelay: 10,
        ignoreMinBufferTime: false,
        autoCorrectDrift: true,
      },
      hls: {
        ignoreTextStreamFailures: false,
      },
    };

    const streaming = {
      retryParameters: shaka.net.NetworkingEngine.defaultRetryParameters(),
      // Need some operation in the callback or else closure may remove calls
      // to the function as it would be a no-op.
      failureCallback: (error) => {
        shaka.log.error('Unhandled streaming error', error);
      },
      rebufferingGoal: 2,
      bufferingGoal: 10,
      bufferBehind: 30,
      ignoreTextStreamFailures: false,
      alwaysStreamText: false,
      startAtSegmentBoundary: false,
      smallGapLimit: 0.5,
      jumpLargeGaps: false,
      durationBackoff: 1,
      forceTransmuxTS: false,
      // Offset by 5 seconds since Chromecast takes a few seconds to start
      // playing after a seek, even when buffered.
      safeSeekOffset: 5,
      stallEnabled: true,
      stallThreshold: 1 /* seconds */,
      stallSkip: 0.1 /* seconds */,
      useNativeHlsOnSafari: true,
    };

    // WebOS has a long hardware pipeline that responds slowly, making it easy
    // to misidentify stalls. To avoid this, by default disable stall detection
    // on WebOS.
    if (shaka.util.Platform.isWebOS()) {
      streaming.stallEnabled = false;
    }

    const offline = {
      // We need to set this to a throw-away implementation for now as our
      // default implementation will need to reference other fields in the
      // config. We will set it to our intended implementation after we have
      // the top-level object created.
      trackSelectionCallback: (tracks) => tracks,

      // Need some operation in the callback or else closure may remove calls
      // to the function as it would be a no-op.
      progressCallback: (content, progress) => {
        shaka.log.v2('Offline operation on',
                     content.originalManifestUri,
                     'progress at',
                     progress);
      },

      // By default we use persistent licenses as forces errors to surface if
      // a platform does not support offline licenses rather than causing
      // unexpected behaviours when someone tries to plays downloaded content
      // without a persistent license.
      usePersistentLicense: true,
    };

    const abr = {
      enabled: true,
      defaultBandwidthEstimate: bandwidthEstimate,
      switchInterval: 8,
      bandwidthUpgradeTarget: 0.85,
      bandwidthDowngradeTarget: 0.95,
      restrictions: {
        minWidth: 0,
        maxWidth: Infinity,
        minHeight: 0,
        maxHeight: abrMaxHeight,
        minPixels: 0,
        maxPixels: Infinity,
        minBandwidth: 0,
        maxBandwidth: Infinity,
      },
    };

    /** @type {shaka.extern.PlayerConfiguration} */
    const config = {
      drm: drm,
      manifest: manifest,
      streaming: streaming,
      offline: offline,
      abrFactory: shaka.abr.SimpleAbrManager,
      abr: abr,
      preferredAudioLanguage: '',
      preferredTextLanguage: '',
      preferredVariantRole: '',
      preferredTextRole: '',
      preferredAudioChannelCount: 2,
      restrictions: {
        minWidth: 0,
        maxWidth: Infinity,
        minHeight: 0,
        maxHeight: Infinity,
        minPixels: 0,
        maxPixels: Infinity,
        minBandwidth: 0,
        maxBandwidth: Infinity,
      },
      playRangeStart: 0,
      playRangeEnd: Infinity,
      textDisplayFactory: () => null,
    };

    // Add this callback so that we can reference the preferred audio language
    // through the config object so that if it gets updated, we have the
    // updated value.
    offline.trackSelectionCallback = (tracks) => {
      return shaka.util.PlayerConfiguration.defaultTrackSelect(
          tracks, config.preferredAudioLanguage);
    };

    return config;
  }

  /**
   * Merges the given configuration changes into the given destination.  This
   * uses the default Player configurations as the template.
   *
   * @param {shaka.extern.PlayerConfiguration} destination
   * @param {!Object} updates
   * @param {shaka.extern.PlayerConfiguration=} template
   * @return {boolean}
   * @export
   */
  static mergeConfigObjects(destination, updates, template) {
    const overrides = {
      '.drm.servers': '',
      '.drm.clearKeys': '',
      '.drm.advanced': {
        distinctiveIdentifierRequired: false,
        persistentStateRequired: false,
        videoRobustness: '',
        audioRobustness: '',
        serverCertificate: new Uint8Array(0),
        individualizationServer: '',
      },
    };
    return shaka.util.ConfigUtils.mergeConfigObjects(
        destination, updates,
        template || shaka.util.PlayerConfiguration.createDefault(), overrides,
        '');
  }

  /**
   * @param {!Array.<shaka.extern.Track>} tracks
   * @param {string} preferredAudioLanguage
   * @return {!Array.<shaka.extern.Track>}
   */
  static defaultTrackSelect(tracks, preferredAudioLanguage) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const LanguageUtils = shaka.util.LanguageUtils;

    /** @type {!Array.<shaka.extern.Track>} */
    const allVariants = tracks.filter((track) => track.type == 'variant');

    /** @type {!Array.<shaka.extern.Track>} */
    let selectedVariants = [];

    // Find the locale that best matches our preferred audio locale.
    const closestLocale = LanguageUtils.findClosestLocale(
        preferredAudioLanguage,
        allVariants.map((variant) => variant.language));
    // If we found a locale that was close to our preference, then only use
    // variants that use that locale.
    if (closestLocale) {
      selectedVariants = allVariants.filter((variant) => {
        const locale = LanguageUtils.normalize(variant.language);
        return locale == closestLocale;
      });
    }

    // If we failed to get a language match, go with primary.
    if (selectedVariants.length == 0) {
      selectedVariants = allVariants.filter((variant) => {
        return variant.primary;
      });
    }

    // Otherwise, there is no good way to choose the language, so we don't
    // choose a language at all.
    if (selectedVariants.length == 0) {
      // Issue a warning, but only if the content has multiple languages.
      // Otherwise, this warning would just be noise.
      const languages = new Set(allVariants.map((track) => {
        return track.language;
      }));

      if (languages.size > 1) {
        shaka.log.warning('Could not choose a good audio track based on ' +
                          'language preferences or primary tracks.  An ' +
                          'arbitrary language will be stored!');
      }

      // Default back to all variants.
      selectedVariants = allVariants;
    }

    // From previously selected variants, choose the SD ones (height <= 480).
    const tracksByHeight = selectedVariants.filter((track) => {
      return track.height && track.height <= 480;
    });

    // If variants don't have video or no video with height <= 480 was
    // found, proceed with the previously selected tracks.
    if (tracksByHeight.length) {
      // Sort by resolution, then select all variants which match the height
      // of the highest SD res.  There may be multiple audio bitrates for the
      // same video resolution.
      tracksByHeight.sort((a, b) => b.height - a.height);
      selectedVariants = tracksByHeight.filter((track) => {
        return track.height == tracksByHeight[0].height;
      });
    }

    /** @type {!Array.<shaka.extern.Track>} */
    const selectedTracks = [];

    // If there are multiple matches at different audio bitrates, select the
    // middle bandwidth one.
    if (selectedVariants.length) {
      const middleIndex = Math.floor(selectedVariants.length / 2);
      selectedVariants.sort((a, b) => a.bandwidth - b.bandwidth);
      selectedTracks.push(selectedVariants[middleIndex]);
    }

    // Since this default callback is used primarily by our own demo app and by
    // app developers who haven't thought about which tracks they want, we
    // should select all text tracks, regardless of language.  This makes for a
    // better demo for us, and does not rely on user preferences for the
    // unconfigured app.
    for (const track of tracks) {
      if (track.type == ContentType.TEXT) { selectedTracks.push(track); }
    }

    return selectedTracks;
  }
};
