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
          .add('preferredAudio')
          .add('preferredVideo')
          .add('preferredText')
          .add('accessibility.speechToText.languagesToTranslate')
          .add('manifest.msf.namespaces');
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

    it('does not have entries for invalid UI config options', () => {
      const allUIConfigQueries =
          shakaDemoMain.getCurrentUIConfigValue.calls.all();
      const uiConfigQueryData = allUIConfigQueries.map((spyData) => {
        return spyData.args[0];
      });

      const knownUIValueNames = new Set();
      checkUIConfig((valueName) => {
        knownUIValueNames.add(valueName);
      });
      for (const valueName of uiConfigQueryData) {
        if (!knownUIValueNames.has(valueName)) {
          fail('Demo has a UI config field for unknown value "' +
              valueName + '"');
        }
      }
    });

    it('has an entry for every UI config option', () => {
      const allUIConfigQueries =
          shakaDemoMain.getCurrentUIConfigValue.calls.all();
      const uiConfigQueryData = allUIConfigQueries.map((spyData) => {
        return spyData.args[0];
      });

      checkUIConfig((valueName) => {
        if (!uiConfigQueryData.includes(valueName)) {
          fail('Demo does not have a UI config field for "' + valueName + '"');
        }
      });
    });

    /** @param {function(string)} checkValueNameFn */
    function checkUIConfig(checkValueNameFn) {
      const configPrimitives = new Set(['number', 'string', 'boolean']);
      const exceptions = new Set()
          .add('fullScreenElement')
          .add('mediaSession.supportedActions');

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
            } else if (Array.isArray(value)) {
              checkValueNameFn(name);
            } else if (value !== null && typeof value == 'object') {
              // It's a sub-section.
              check(/** @type {!Object} */ (value), name);
            }
          }
        }
      };
      check(shakaDemoMain.getUIConfiguration(), '');
    }

    /** @param {function(string)} checkValueNameFn */
    function checkConfig(checkValueNameFn) {
      const configPrimitives = new Set(['number', 'string', 'boolean']);
      const exceptions = new Set()
          .add('ignoreHardwareResolution')
          .add('playRangeStart')
          .add('playRangeEnd')
          .add('manifest.dash.keySystemsByURI')
          .add('manifest.hls.ignoreManifestProgramDateTimeForTypes')
          .add('drm.keySystemsMapping')
          .add('manifest.raiseFatalErrorOnManifestUpdateRequestFailure')
          .add('drm.persistentSessionOnlinePlayback')
          .add('drm.persistentSessionsMetadata')
          .add('mediaSource.modifyCueCallback')
          .add('preferredAudio')
          .add('preferredVideo')
          .add('preferredText');

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
