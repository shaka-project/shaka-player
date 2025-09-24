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
          .add('streaming.speechToText.languagesToTranslate');
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
