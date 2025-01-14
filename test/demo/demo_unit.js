/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Demo', () => {
  beforeEach(() => {
    // Make mock versions of misc third-party libraries.
    window['tippy'] = () => {};
    window['Awesomplete'] = class {
      constructor() {
        this.list = [];
        this.minChars = 0;
      }

      evaluate() {}
    };
    window['componentHandler'] = class {
      upgradeDom() {}
    };
    window['dialogPolyfill'] = {registerDialog: (dialog) => {}};

    // Make the FakeDemoMain, which will trigger the various tabs to load.
    shaka.test.FakeDemoMain.setup();
  });

  afterEach(async () => {
    delete window['tippy'];
    delete window['Awesomplete'];
    delete window['componentHandler'];
    delete window['dialogPolyfill'];
    await shakaDemoMain.cleanup();
  });

  describe('config', () => {
    it('does not have entries for invalid config options', () => {
      const exceptions = new Set()
          .add('preferredAudioCodecs')
          .add('preferredVideoCodecs')
          .add('preferredTextFormats')
          .add('preferredAudioLanguage')
          .add('preferredAudioLabel')
          .add('preferredTextLanguage')
          .add('preferredVariantRole')
          .add('preferredTextRole')
          .add('preferredAudioChannelCount')
          .add('preferredVideoHdrLevel')
          .add('preferredVideoLayout')
          .add('preferredVideoLabel')
          .add('preferForcedSubs')
          .add('preferSpatialAudio')
          .add('restrictions.minWidth')
          .add('restrictions.maxWidth')
          .add('restrictions.minHeight')
          .add('restrictions.maxHeight')
          .add('restrictions.minPixels')
          .add('restrictions.maxPixels')
          .add('restrictions.minFrameRate')
          .add('restrictions.maxFrameRate')
          .add('restrictions.minBandwidth')
          .add('restrictions.maxBandwidth')
          .add('restrictions.minChannelsCount')
          .add('restrictions.maxChannelsCount')
          .add('textDisplayer.captionsUpdatePeriod')
          .add('cmcd.enabled')
          .add('cmcd.sessionId')
          .add('cmcd.contentId')
          .add('cmcd.rtpSafetyFactor')
          .add('cmcd.useHeaders')
          .add('cmcd.version')
          .add('cmsd.enabled')
          .add('cmsd.applyMaximumSuggestedBitrate')
          .add('cmsd.estimatedThroughputWeightRatio')
          .add('lcevc.enabled')
          .add('lcevc.dynamicPerformanceScaling')
          .add('lcevc.logLevel')
          .add('lcevc.drawLogo')
          .add('ads.customPlayheadTracker')
          .add('ads.skipPlayDetection')
          .add('ads.supportsMultipleMediaElements')
          .add('ads.disableHLSInterstitial')
          .add('ads.disableDASHInterstitial')
          .add('watermarkText')
          .add('ignoreHardwareResolution')
          .add('playRangeStart')
          .add('playRangeEnd')
          .add('manifest.dash.keySystemsByURI')
          .add('manifest.hls.ignoreManifestProgramDateTimeForTypes')
          .add('manifest.mss.keySystemsBySystemId')
          .add('drm.keySystemsMapping')
          .add('manifest.raiseFatalErrorOnManifestUpdateRequestFailure')
          .add('drm.persistentSessionOnlinePlayback')
          .add('drm.persistentSessionsMetadata')
          .add('mediaSource.modifyCueCallback');

      // We determine whether a config option has been made or not by looking at
      // which config values have been queried (via the fake main object's
      // |getCurrentConfigValue| method).
      const allConfigQueries = shakaDemoMain.getCurrentConfigValue.calls.all();
      const configQueryData = allConfigQueries.map((spyData) => {
        return spyData.args[0];
      });

      const knownValueNames = new Set();
      checkConfig((valueName) => {
        knownValueNames.add(valueName);
      });
      for (const valueName of configQueryData) {
        if (!knownValueNames.has(valueName) &&
          !exceptions.has(valueName)) {
          fail('Demo has a config field for unknown value "' + valueName + '"');
        }
      }
    });

    it('has an entry for every config option', () => {
      // We determine whether a config option has been made or not by looking at
      // which config values have been queried (via the fake main object's
      // |getCurrentConfigValue| method).
      const allConfigQueries = shakaDemoMain.getCurrentConfigValue.calls.all();
      const configQueryData = allConfigQueries.map((spyData) => {
        return spyData.args[0];
      });

      checkConfig((valueName) => {
        if (!configQueryData.includes(valueName)) {
          fail('Demo does not have a config field for "' + valueName + '"');
        }
      });
    });

    /** @param {function(string)} checkValueNameFn */
    function checkConfig(checkValueNameFn) {
      const configPrimitives = new Set(['number', 'string', 'boolean']);
      const exceptions = new Set()
          .add('ignoreHardwareResolution')
          .add('playRangeStart')
          .add('playRangeEnd')
          .add('manifest.dash.keySystemsByURI')
          .add('manifest.hls.ignoreManifestProgramDateTimeForTypes')
          .add('manifest.mss.keySystemsBySystemId')
          .add('drm.keySystemsMapping')
          .add('manifest.raiseFatalErrorOnManifestUpdateRequestFailure')
          .add('drm.persistentSessionOnlinePlayback')
          .add('drm.persistentSessionsMetadata')
          .add('mediaSource.modifyCueCallback');


      /**
       * @param {!Object} section
       * @param {string} accumulatedName
       */
      const check = (section, accumulatedName) => {
        for (const key in section) {
          const name = (accumulatedName) ? (accumulatedName + '.' + key) : key;
          const value = section[key];

          if (!exceptions.has(name)) {
            if (configPrimitives.has(typeof value)) {
              checkValueNameFn(name);
            } else {
              // It's a sub-section.
              check(value, name);
            }
          }
        }
      };
      check(shakaDemoMain.getConfiguration(), '');
    }
  });
});
