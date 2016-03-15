/**
 * @license
 * Copyright 2015 Google Inc.
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

describe('Player', function() {
  var originalNetworkingEngine;
  var originalLogError;
  var logErrorSpy;
  var player;

  beforeAll(function() {
    originalNetworkingEngine = shaka.net.NetworkingEngine;
    originalLogError = shaka.log.error;

    shaka.net.NetworkingEngine = function() {};
    shaka.net.NetworkingEngine.defaultRetryParameters =
        originalNetworkingEngine.defaultRetryParameters;

    logErrorSpy = jasmine.createSpy('shaka.log.error');
    shaka.log.error = logErrorSpy;
  });

  beforeEach(function() {
    // By default, errors are a failure.
    logErrorSpy.calls.reset();
    logErrorSpy.and.callFake(fail);

    var video = createMockVideo();
    player = new shaka.Player(video);
  });

  afterAll(function() {
    shaka.net.NetworkingEngine = originalNetworkingEngine;
    shaka.log.error = originalLogError;
  });

  describe('getConfiguration', function() {
    it('returns a copy of the configuration', function() {
      var config1 = player.getConfiguration();
      config1.streaming.byteLimit = -99;
      var config2 = player.getConfiguration();
      expect(config1.streaming.byteLimit).not.toEqual(
          config2.streaming.byteLimit);
    });
  });

  describe('configure', function() {
    it('overwrites defaults', function() {
      var defaultConfig = player.getConfiguration();
      // Make sure the default differs from our test value:
      expect(defaultConfig.drm.retryParameters.backoffFactor).not.toBe(5);
      expect(defaultConfig.manifest.retryParameters.backoffFactor).not.toBe(5);

      player.configure({
        drm: {
          retryParameters: { backoffFactor: 5 }
        }
      });

      var newConfig = player.getConfiguration();
      // Make sure we changed the backoff for DRM, but not for manifests:
      expect(newConfig.drm.retryParameters.backoffFactor).toBe(5);
      expect(newConfig.manifest.retryParameters.backoffFactor).not.toBe(5);
    });

    it('reverts to defaults when undefined is given', function() {
      player.configure({
        streaming: {
          retryParameters: { backoffFactor: 5 },
          byteLimit: 7
        }
      });

      var newConfig = player.getConfiguration();
      expect(newConfig.streaming.retryParameters.backoffFactor).toBe(5);
      expect(newConfig.streaming.byteLimit).toBe(7);

      player.configure({
        streaming: {
          retryParameters: undefined
        }
      });

      newConfig = player.getConfiguration();
      expect(newConfig.streaming.retryParameters.backoffFactor).not.toBe(5);
      expect(newConfig.streaming.byteLimit).toBe(7);

      player.configure({streaming: undefined});
      newConfig = player.getConfiguration();
      expect(newConfig.streaming.byteLimit).not.toBe(7);
    });

    it('restricts the types of config values', function() {
      logErrorSpy.and.stub();
      var defaultConfig = player.getConfiguration();

      // Try a bogus byteLimit (string instead of number)
      player.configure({
        streaming: { byteLimit: '77' }
      });

      var newConfig = player.getConfiguration();
      expect(newConfig).toEqual(defaultConfig);
      expect(logErrorSpy).toHaveBeenCalledWith(
          stringContaining('.streaming.byteLimit'));

      // Try a bogus streaming config (number instead of Object)
      logErrorSpy.calls.reset();
      player.configure({
        streaming: 5
      });

      newConfig = player.getConfiguration();
      expect(newConfig).toEqual(defaultConfig);
      expect(logErrorSpy).toHaveBeenCalledWith(
          stringContaining('.streaming'));
    });

    it('expands dictionaries that allow arbitrary keys', function() {
      player.configure({
        drm: { servers: { 'com.widevine.alpha': 'http://foo/widevine' } }
      });

      var newConfig = player.getConfiguration();
      expect(newConfig.drm.servers).toEqual({
        'com.widevine.alpha': 'http://foo/widevine'
      });

      player.configure({
        drm: { servers: { 'com.microsoft.playready': 'http://foo/playready' } }
      });

      newConfig = player.getConfiguration();
      expect(newConfig.drm.servers).toEqual({
        'com.widevine.alpha': 'http://foo/widevine',
        'com.microsoft.playready': 'http://foo/playready'
      });
    });

    it('expands dictionaries but still restricts their values', function() {
      // Try a bogus server value (number instead of string)
      logErrorSpy.and.stub();
      player.configure({
        drm: { servers: { 'com.widevine.alpha': 7 } }
      });

      var newConfig = player.getConfiguration();
      expect(newConfig.drm.servers).toEqual({});
      expect(logErrorSpy).toHaveBeenCalledWith(
          stringContaining('.drm.servers.com.widevine.alpha'));

      // Try a valid advanced config.
      logErrorSpy.calls.reset();
      player.configure({
        drm: { advanced: { 'ks1': { distinctiveIdentifierRequired: true } } }
      });

      newConfig = player.getConfiguration();
      expect(newConfig.drm.advanced).toEqual(jasmine.objectContaining({
        'ks1': { distinctiveIdentifierRequired: true }
      }));
      expect(logErrorSpy).not.toHaveBeenCalled();
      var lastGoodConfig = newConfig;

      // Try an invalid advanced config key.
      player.configure({
        drm: { advanced: { 'ks1': { bogus: true } } }
      });

      newConfig = player.getConfiguration();
      expect(newConfig).toEqual(lastGoodConfig);
      expect(logErrorSpy).toHaveBeenCalledWith(
          stringContaining('.drm.advanced.ks1.bogus'));
    });

    it('removes dictionary entries when undefined is given', function() {
      player.configure({
        drm: {
          servers: {
            'com.widevine.alpha': 'http://foo/widevine',
            'com.microsoft.playready': 'http://foo/playready'
          }
        }
      });

      var newConfig = player.getConfiguration();
      expect(newConfig.drm.servers).toEqual({
        'com.widevine.alpha': 'http://foo/widevine',
        'com.microsoft.playready': 'http://foo/playready'
      });

      player.configure({
        drm: { servers: { 'com.widevine.alpha': undefined } }
      });

      newConfig = player.getConfiguration();
      expect(newConfig.drm.servers).toEqual({
        'com.microsoft.playready': 'http://foo/playready'
      });

      player.configure({
        drm: { servers: undefined }
      });

      newConfig = player.getConfiguration();
      expect(newConfig.drm.servers).toEqual({});
    });

    it('checks the number of arguments to functions', function() {
      logErrorSpy.and.stub();
      var goodCustomScheme = function(node) {};
      var badCustomScheme1 = function() {};  // too few args
      var badCustomScheme2 = function(x, y) {};  // too many args

      // Takes good callback.
      player.configure({
        manifest: { dash: { customScheme: goodCustomScheme } }
      });

      var newConfig = player.getConfiguration();
      expect(newConfig.manifest.dash.customScheme).toBe(goodCustomScheme);
      expect(logErrorSpy).not.toHaveBeenCalled();

      // Doesn't take bad callback #1, refuses to overwrite good callback.
      logErrorSpy.calls.reset();
      player.configure({
        manifest: { dash: { customScheme: badCustomScheme1 } }
      });

      newConfig = player.getConfiguration();
      expect(newConfig.manifest.dash.customScheme).toBe(goodCustomScheme);
      expect(logErrorSpy).toHaveBeenCalledWith(
          stringContaining('.manifest.dash.customScheme'));

      // Doesn't take bad callback #2, refuses to overwrite good callback.
      logErrorSpy.calls.reset();
      player.configure({
        manifest: { dash: { customScheme: badCustomScheme2 } }
      });

      newConfig = player.getConfiguration();
      expect(newConfig.manifest.dash.customScheme).toBe(goodCustomScheme);
      expect(logErrorSpy).toHaveBeenCalledWith(
          stringContaining('.manifest.dash.customScheme'));

      // Resets to default if undefined.
      logErrorSpy.calls.reset();
      player.configure({
        manifest: { dash: { customScheme: undefined } }
      });

      newConfig = player.getConfiguration();
      expect(newConfig.manifest.dash.customScheme).not.toBe(goodCustomScheme);
      expect(logErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('AbrManager', function() {
    var abrManager;

    beforeEach(function() {
      abrManager = createMockAbrManager();
      player.configure({abrManager: abrManager});
    });

    it('sets through configure', function() {
      var config = player.getConfiguration();
      expect(config.abrManager).toBe(abrManager);
      expect(abrManager.init).toHaveBeenCalled();
    });

    it('calls chooseStreams', function() {
      expect(abrManager.chooseStreams).not.toHaveBeenCalled();
      chooseStreams();
      expect(abrManager.chooseStreams).toHaveBeenCalled();
    });

    it('does not enable before stream startup', function() {
      chooseStreams();
      expect(abrManager.enable).not.toHaveBeenCalled();
      canSwitch();
      expect(abrManager.enable).toHaveBeenCalled();
    });

    it('does not enable if adaptation is disabled', function() {
      player.configure({enableAdaptation: false});
      chooseStreams();
      canSwitch();
      expect(abrManager.enable).not.toHaveBeenCalled();
    });

    it('enables/disables though configure', function() {
      chooseStreams();
      canSwitch();
      abrManager.enable.calls.reset();
      abrManager.disable.calls.reset();

      player.configure({enableAdaptation: false});
      expect(abrManager.disable).toHaveBeenCalled();

      player.configure({enableAdaptation: true});
      expect(abrManager.enable).toHaveBeenCalled();
    });

    it('waits to enable if in-between Periods', function() {
      player.configure({enableAdaptation: false});
      chooseStreams();
      player.configure({enableAdaptation: true});
      expect(abrManager.enable).not.toHaveBeenCalled();
      canSwitch();
      expect(abrManager.enable).toHaveBeenCalled();
    });

    it('still disables if called after chooseStreams', function() {
      chooseStreams();
      player.configure({enableAdaptation: false});
      canSwitch();
      expect(abrManager.enable).not.toHaveBeenCalled();
    });

    /** @suppress {accessControls} */
    function chooseStreams() {
      var period = {streamSets: []};
      player.chooseStreams_(period);
    }

    /** @suppress {accessControls} */
    function canSwitch() {
      player.canSwitch_();
    }
  });

  describe('chooseStreams_', function() {
    beforeEach(function() {
      player.configure({abrManager: createMockAbrManager()});
    });

    it('chooses the first as default', function() {
      runTest(['es', 'en'], 'pt', 'es');
    });

    it('chooses the primary track', function() {
      runTest(['es', 'en', '*fr'], 'pt', 'fr');
    });

    it('chooses exact match for main language', function() {
      runTest(['pt-BR', 'pt'], 'pt', 'pt');
    });

    it('chooses exact match for subtags', function() {
      runTest(['pt-BR', 'pt'], 'pt-BR', 'pt-BR');
    });

    it('chooses base language if exact does not exist', function() {
      runTest(['en', 'pt'], 'pt-BR', 'pt');
    });

    it('chooses different subtags if base language does not exist', function() {
      runTest(['pt-BR', 'en'], 'pt-PT', 'pt-BR');
    });

    it('enables text track if audio and text are different language',
       /** @suppress {accessControls} */ function() {
         player.configure(
             {preferredAudioLanguage: 'en', preferredTextLanguage: 'es'});
         var streamSets = [
           {language: 'en', type: 'audio', streams: ['en']},
           {language: 'es', type: 'text', streams: ['es']}
         ];
         var period = {streamSets: streamSets};

         expect(player.textTrack_.mode).toBe('hidden');
         var result = player.chooseStreams_(period);
         expect(player.textTrack_.mode).toBe('showing');
         expect(result['audio']).toBe('en');
         expect(result['text']).toBe('es');
       });

    /**
     * @param {!Array.<string>} languages
     * @param {string} preference
     * @param {string} expected
     * @suppress {accessControls}
     */
    function runTest(languages, preference, expected) {
      player.configure({preferredAudioLanguage: preference});
      var streamSets = languages.map(function(lang) {
        if (lang.charAt(0) == '*')
          return {language: lang.substr(1), type: 'audio', primary: true};
        else
          return {language: lang, type: 'audio'};
      });
      var period = {streamSets: streamSets};
      var result = player.chooseStreams_(period);
      // Normally this is a stream, but because of the AbrManager above, it
      // will be the language of the stream set it came from.
      expect(result['audio']).toBe(expected);
    }
  });

  /**
   * A Jasmine asymmetric matcher for substring matches.
   * @param {string} substring
   * @return {!Object}
   */
  function stringContaining(substring) {
    return {
      asymmetricMatch: function(actual) {
        return actual.indexOf(substring) >= 0;
      }
    };
  }

  function createMockVideo() {
    var video = {
      src: '',
      textTracks: [],
      addTextTrack: jasmine.createSpy('addTextTrack'),
      addEventListener: jasmine.createSpy('addEventListener'),
      removeEventListener: jasmine.createSpy('removeEventListener'),
      dispatchEvent: jasmine.createSpy('dispatchEvent'),
      on: {}  // event listeners
    };
    video.addTextTrack.and.callFake(function(kind, id) {
      var track = createMockTextTrack();
      video.textTracks.push(track);
      return track;
    });
    video.addEventListener.and.callFake(function(name, callback) {
      video.on[name] = callback;
    });
    return video;
  }

  function createMockTextTrack() {
    // TODO: mock TextTrack, if/when Player starts directly accessing it.
    return {};
  }

  function createMockAbrManager() {
    // This AbrManager will return fake streams that are the language of the
    // stream set it came from.
    var manager = {
      init: jasmine.createSpy('AbrManager.init'),
      stop: jasmine.createSpy('AbrManager.stop'),
      enable: jasmine.createSpy('AbrManager.enable'),
      disable: jasmine.createSpy('AbrManager.disable'),
      chooseStreams: jasmine.createSpy('AbrManager.chooseStreams')
    };
    manager.chooseStreams.and.callFake(function(streamSets) {
      var ret = {};
      Object.keys(streamSets).forEach(function(key) {
        ret[key] = streamSets[key].language;
      });
      return ret;
    });
    return manager;
  }
});
