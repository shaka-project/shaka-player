/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.require('ShakaDemoAssetInfo');
goog.require('shakaAssets');

describe('Demo', () => {
  /**
   * @return {!ShakaDemoAssetInfo}
   */
  const makeBlankAsset = () => {
    return new ShakaDemoAssetInfo(
        /* name= */ '',
        /* iconUri= */ '',
        /* manifestUri= */ '',
        /* source= */ shakaAssets.Source.CUSTOM);
  };

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
    it('does not copy dangerous extra config keys into player config', () => {
      const asset = makeBlankAsset();
      asset.extraConfig = /** @type {!Object} */(JSON.parse(
          '{"__proto__":{"testPolluted":"YES"}}'));
      const cleanProto = Object.getPrototypeOf({});

      const config = asset.getConfiguration();

      expect(/** @type {!Object} */(config)['testPolluted']).toBe(undefined);
      expect(Object.getPrototypeOf(config)).toBe(cleanProto);
    });

    it('does not serialize inherited asset properties into JSON', () => {
      const asset = makeBlankAsset();
      const inheritedProto = Object.create(Object.getPrototypeOf(asset));
      /** @type {!Object} */(inheritedProto)['testPolluted'] = 'YES';
      Object.setPrototypeOf(asset, inheritedProto);

      const raw = asset.toJSON();

      expect(Object.hasOwn(raw, 'testPolluted')).toBe(false);
    });

    it('does not accept dangerous keys when parsing saved assets', () => {
      const assetProto = Object.getPrototypeOf(makeBlankAsset());
      const raw = /** @type {!Object} */(JSON.parse(
          '{"name":"n","shortName":"s","iconUri":"","manifestUri":' +
          '"" ,"source":0,"__proto__":{"testPolluted":"YES"}}'));

      const asset = ShakaDemoAssetInfo.fromJSON(raw);

      expect(/** @type {!Object} */(asset)['testPolluted']).toBe(undefined);
      expect(Object.getPrototypeOf(asset)).toBe(assetProto);
    });

    it('does not have entries for invalid config options', () => {
      const exceptions = new Set()
          .add('preferredAudioCodecs')
          .add('preferredVideoCodecs')
          .add('preferredTextFormats');
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
