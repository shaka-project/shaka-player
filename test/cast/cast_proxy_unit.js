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

describe('CastProxy', function() {
  var CastProxy;
  var FakeEvent;

  var originalCastSender;

  var fakeAppId = 'fake app ID';
  var mockVideo;
  var mockPlayer;
  var mockSender;
  var mockCastSenderConstructor;

  /** @type {shaka.cast.CastProxy} */
  var proxy;

  beforeAll(function() {
    CastProxy = shaka.cast.CastProxy;
    FakeEvent = shaka.util.FakeEvent;

    mockCastSenderConstructor = jasmine.createSpy('CastSender constructor');
    mockCastSenderConstructor.and.callFake(createMockCastSender);

    originalCastSender = shaka.cast.CastSender;
    shaka.cast.CastSender = mockCastSenderConstructor;
  });

  afterAll(function() {
    shaka.cast.CastSender = originalCastSender;
  });

  beforeEach(function() {
    mockVideo = createMockVideo();
    mockPlayer = createMockPlayer();
    mockSender = null;

    proxy = new CastProxy(mockVideo, mockPlayer, fakeAppId);
  });

  afterEach(function(done) {
    proxy.destroy().catch(fail).then(done);
  });

  describe('constructor', function() {
    it('creates and initializes a CastSender', function() {
      expect(mockCastSenderConstructor).toHaveBeenCalled();
      expect(mockSender).toBeTruthy();
      expect(mockSender.init).toHaveBeenCalled();
    });

    it('listens for video and player events', function() {
      expect(Object.keys(mockVideo.listeners).length).toBeGreaterThan(0);
      expect(Object.keys(mockPlayer.listeners).length).toBeGreaterThan(0);
    });

    it('creates proxies for video and player', function() {
      expect(proxy.getVideo()).toBeTruthy();
      expect(proxy.getVideo()).not.toBe(mockVideo);
      expect(proxy.getPlayer()).toBeTruthy();
      expect(proxy.getPlayer()).not.toBe(mockPlayer);
    });
  });

  describe('canCast', function() {
    it('is true if the API is ready and we have receivers', function() {
      mockSender.apiReady.and.returnValue(false);
      mockSender.hasReceivers.and.returnValue(false);
      expect(proxy.canCast()).toBe(false);

      mockSender.apiReady.and.returnValue(true);
      expect(proxy.canCast()).toBe(false);

      mockSender.hasReceivers.and.returnValue(true);
      expect(proxy.canCast()).toBe(true);
    });
  });

  describe('isCasting', function() {
    it('delegates directly to the sender', function() {
      mockSender.isCasting.and.returnValue(false);
      expect(proxy.isCasting()).toBe(false);
      mockSender.isCasting.and.returnValue(true);
      expect(proxy.isCasting()).toBe(true);
    });
  });

  describe('receiverName', function() {
    it('delegates directly to the sender', function() {
      mockSender.receiverName.and.returnValue('abc');
      expect(proxy.receiverName()).toBe('abc');
      mockSender.receiverName.and.returnValue('xyz');
      expect(proxy.receiverName()).toBe('xyz');
    });
  });

  describe('setAppData', function() {
    it('delegates directly to the sender', function() {
      var fakeAppData = {key: 'value'};
      expect(mockSender.setAppData).not.toHaveBeenCalled();
      proxy.setAppData(fakeAppData);
      expect(mockSender.setAppData).toHaveBeenCalledWith(fakeAppData);
    });
  });

  describe('disconnect', function() {
    it('delegates directly to the sender', function() {
      expect(mockSender.showDisconnectDialog).not.toHaveBeenCalled();
      proxy.suggestDisconnect();
      expect(mockSender.showDisconnectDialog).toHaveBeenCalled();
    });
  });

  describe('cast', function() {
    it('pauses the local video', function() {
      proxy.cast();
      expect(mockVideo.pause).toHaveBeenCalled();
    });

    it('passes initial state to sender', function() {
      mockVideo.loop = true;
      mockVideo.playbackRate = 3;
      mockVideo.currentTime = 12;
      var fakeConfig = {key: 'value'};
      mockPlayer.getConfiguration.and.returnValue(fakeConfig);
      mockPlayer.isTextTrackVisible.and.returnValue(false);
      var fakeManifestUri = 'foo://bar';
      mockPlayer.getManifestUri.and.returnValue(fakeManifestUri);

      proxy.cast();
      var calls = mockSender.cast.calls;
      expect(calls.count()).toBe(1);
      if (calls.count()) {
        var state = calls.argsFor(0)[0];
        // Video state goes directly:
        expect(state.video.loop).toEqual(mockVideo.loop);
        expect(state.video.playbackRate).toEqual(mockVideo.playbackRate);
        // Player state uses corresponding setter names:
        expect(state.player.configure).toEqual(fakeConfig);
        expect(state['playerAfterLoad'].setTextTrackVisibility).toBe(false);
        // Manifest URI:
        expect(state.manifest).toEqual(fakeManifestUri);
        // Start time:
        expect(state.startTime).toEqual(mockVideo.currentTime);
      }
    });

    it('does not provide a start time if the video has ended', function() {
      mockVideo.ended = true;
      mockVideo.currentTime = 12;

      proxy.cast();
      var calls = mockSender.cast.calls;
      expect(calls.count()).toBe(1);
      if (calls.count()) {
        var state = calls.argsFor(0)[0];
        expect(state.startTime).toBe(null);
      }
    });

    it('unloads the local player after casting is complete', function(done) {
      var p = new shaka.util.PublicPromise();
      mockSender.cast.and.returnValue(p);

      proxy.cast();
      shaka.test.Util.delay(0.1).then(function() {
        // unload() has not been called yet.
        expect(mockPlayer.unload).not.toHaveBeenCalled();
        // Resolve the cast() promise.
        p.resolve();
        return shaka.test.Util.delay(0.1);
      }).then(function() {
        // unload() has now been called.
        expect(mockPlayer.unload).toHaveBeenCalled();
      }).catch(fail).then(done);
    });
  });

  describe('video proxy', function() {
    describe('get', function() {
      it('returns local values when we are playing back locally', function() {
        mockVideo.currentTime = 12;
        mockVideo.paused = true;
        expect(proxy.getVideo().currentTime).toEqual(mockVideo.currentTime);
        expect(proxy.getVideo().paused).toEqual(mockVideo.paused);

        expect(mockVideo.play).not.toHaveBeenCalled();
        proxy.getVideo().play();
        expect(mockVideo.play).toHaveBeenCalled();
        // The local method call was properly bound:
        expect(mockVideo.play.calls.mostRecent().object).toBe(mockVideo);
      });

      it('returns cached remote values when we are casting', function() {
        // Local values that will be ignored:
        mockVideo.currentTime = 12;
        mockVideo.paused = true;

        // Set up the sender in casting mode:
        mockSender.isCasting.and.returnValue(true);
        mockSender.hasRemoteProperties.and.returnValue(true);

        // Simulate remote values:
        var cache = { video: {
          currentTime: 24,
          paused: false,
          play: jasmine.createSpy('play')
        }};
        mockSender.get.and.callFake(function(targetName, property) {
          expect(targetName).toEqual('video');
          return cache.video[property];
        });

        expect(proxy.getVideo().currentTime).not.toEqual(mockVideo.currentTime);
        expect(proxy.getVideo().currentTime).toEqual(cache.video.currentTime);
        expect(proxy.getVideo().paused).not.toEqual(mockVideo.paused);
        expect(proxy.getVideo().paused).toEqual(cache.video.paused);

        // Call a method:
        expect(mockVideo.play).not.toHaveBeenCalled();
        proxy.getVideo().play();
        // The call was routed to the remote video.
        expect(mockVideo.play).not.toHaveBeenCalled();
        expect(cache.video.play).toHaveBeenCalled();
      });

      it('returns local values when we have no remote values yet', function() {
        mockVideo.currentTime = 12;
        mockVideo.paused = true;

        // Set up the sender in casting mode, but without any remote values:
        mockSender.isCasting.and.returnValue(true);
        mockSender.hasRemoteProperties.and.returnValue(false);

        // Simulate remote method:
        var playSpy = jasmine.createSpy('play');
        mockSender.get.and.callFake(function(targetName, property) {
          expect(targetName).toEqual('video');
          expect(property).toEqual('play');
          return playSpy;
        });

        // Without remote values, we should still return the local ones.
        expect(proxy.getVideo().currentTime).toEqual(mockVideo.currentTime);
        expect(proxy.getVideo().paused).toEqual(mockVideo.paused);

        // Call a method:
        expect(mockVideo.play).not.toHaveBeenCalled();
        proxy.getVideo().play();
        // The call was still routed to the remote video.
        expect(mockVideo.play).not.toHaveBeenCalled();
        expect(playSpy).toHaveBeenCalled();
      });
    });

    describe('set', function() {
      it('writes local values when we are playing back locally', function() {
        mockVideo.currentTime = 12;
        expect(proxy.getVideo().currentTime).toEqual(12);

        // Writes to the proxy are reflected immediately in both the proxy and
        // the local video.
        proxy.getVideo().currentTime = 24;
        expect(proxy.getVideo().currentTime).toEqual(24);
        expect(mockVideo.currentTime).toEqual(24);
      });

      it('writes values remotely when we are casting', function() {
        mockVideo.currentTime = 12;

        // Set up the sender in casting mode:
        mockSender.isCasting.and.returnValue(true);
        mockSender.hasRemoteProperties.and.returnValue(true);

        // Set the value of currentTime:
        expect(mockSender.set).not.toHaveBeenCalled();
        proxy.getVideo().currentTime = 24;
        expect(mockSender.set).toHaveBeenCalledWith('video', 'currentTime', 24);

        // The local value was unaffected.
        expect(mockVideo.currentTime).toEqual(12);
      });
    });

    describe('local events', function() {
      it('forward to the proxy when we are playing back locally', function() {
        var proxyListener = jasmine.createSpy('listener');
        proxy.getVideo().addEventListener('timeupdate', proxyListener);

        expect(proxyListener).not.toHaveBeenCalled();
        var fakeEvent = new FakeEvent('timeupdate', {detail: 8675309});
        mockVideo.listeners['timeupdate'](fakeEvent);
        expect(proxyListener).toHaveBeenCalledWith(jasmine.objectContaining({
          type: 'timeupdate',
          detail: 8675309
        }));
      });

      it('are ignored when we are casting', function() {
        var proxyListener = jasmine.createSpy('listener');
        proxy.getVideo().addEventListener('timeupdate', proxyListener);

        // Set up the sender in casting mode:
        mockSender.isCasting.and.returnValue(true);
        mockSender.hasRemoteProperties.and.returnValue(true);

        expect(proxyListener).not.toHaveBeenCalled();
        var fakeEvent = new FakeEvent('timeupdate', {detail: 8675309});
        mockVideo.listeners['timeupdate'](fakeEvent);
        expect(proxyListener).not.toHaveBeenCalled();
      });
    });

    describe('remote events', function() {
      it('forward to the proxy when we are casting', function() {
        var proxyListener = jasmine.createSpy('listener');
        proxy.getVideo().addEventListener('timeupdate', proxyListener);

        // Set up the sender in casting mode:
        mockSender.isCasting.and.returnValue(true);
        mockSender.hasRemoteProperties.and.returnValue(true);

        expect(proxyListener).not.toHaveBeenCalled();
        var fakeEvent = new FakeEvent('timeupdate', {detail: 8675309});
        mockSender.onRemoteEvent('video', fakeEvent);
        expect(proxyListener).toHaveBeenCalledWith(jasmine.objectContaining({
          type: 'timeupdate',
          detail: 8675309
        }));
      });
    });
  });

  describe('player proxy', function() {
    describe('get', function() {
      it('returns local values when we are playing back locally', function() {
        var fakeConfig = {key: 'value'};
        mockPlayer.getConfiguration.and.returnValue(fakeConfig);
        expect(proxy.getPlayer().getConfiguration()).toEqual(fakeConfig);

        expect(mockPlayer.trickPlay).not.toHaveBeenCalled();
        proxy.getPlayer().trickPlay(5);
        expect(mockPlayer.trickPlay).toHaveBeenCalledWith(5);
        // The local method call was properly bound:
        expect(mockPlayer.trickPlay.calls.mostRecent().object).toBe(mockPlayer);
      });

      it('returns cached remote values when we are casting', function() {
        // Local values that will be ignored:
        var fakeConfig = {key: 'value'};
        mockPlayer.getConfiguration.and.returnValue(fakeConfig);
        mockPlayer.isTextTrackVisible.and.returnValue(false);

        // Set up the sender in casting mode:
        mockSender.isCasting.and.returnValue(true);
        mockSender.hasRemoteProperties.and.returnValue(true);

        // Simulate remote values:
        var fakeConfig2 = {key2: 'value2'};
        var cache = { player: {
          getConfiguration: fakeConfig2,
          isTextTrackVisible: true,
          trickPlay: jasmine.createSpy('trickPlay')
        }};
        mockSender.get.and.callFake(function(targetName, property) {
          expect(targetName).toEqual('player');
          var value = cache.player[property];
          // methods:
          if (typeof value == 'function') return value;
          // getters:
          else return function() { return value; };
        });

        expect(proxy.getPlayer().getConfiguration()).toEqual(fakeConfig2);
        expect(proxy.getPlayer().isTextTrackVisible()).toBe(true);

        // Call a method:
        expect(mockPlayer.trickPlay).not.toHaveBeenCalled();
        proxy.getPlayer().trickPlay(5);
        // The call was routed to the remote player.
        expect(mockPlayer.trickPlay).not.toHaveBeenCalled();
        expect(cache.player.trickPlay).toHaveBeenCalledWith(5);
      });

      it('returns local values when we have no remote values yet', function() {
        var fakeConfig = {key: 'value'};
        mockPlayer.getConfiguration.and.returnValue(fakeConfig);
        mockPlayer.isTextTrackVisible.and.returnValue(true);

        // Set up the sender in casting mode, but without any remote values:
        mockSender.isCasting.and.returnValue(true);
        mockSender.hasRemoteProperties.and.returnValue(false);

        // Simulate remote method:
        var trickPlaySpy = jasmine.createSpy('trickPlay');
        mockSender.get.and.callFake(function(targetName, property) {
          expect(targetName).toEqual('player');
          expect(property).toEqual('trickPlay');
          return trickPlaySpy;
        });

        // Without remote values, we should still return the local ones.
        expect(proxy.getPlayer().getConfiguration()).toEqual(fakeConfig);
        expect(proxy.getPlayer().isTextTrackVisible()).toBe(true);

        // Call a method:
        expect(mockPlayer.trickPlay).not.toHaveBeenCalled();
        proxy.getPlayer().trickPlay(5);
        // The call was still routed to the remote player.
        expect(mockPlayer.trickPlay).not.toHaveBeenCalled();
        expect(trickPlaySpy).toHaveBeenCalledWith(5);
      });

      it('always returns a local NetworkingEngine', function() {
        // Set up the sender in casting mode:
        mockSender.isCasting.and.returnValue(true);
        mockSender.hasRemoteProperties.and.returnValue(true);

        expect(mockPlayer.getNetworkingEngine).not.toHaveBeenCalled();
        proxy.getPlayer().getNetworkingEngine();
        expect(mockPlayer.getNetworkingEngine).toHaveBeenCalled();
        // The local method call was properly bound:
        expect(mockPlayer.getNetworkingEngine.calls.mostRecent().object).toBe(
            mockPlayer);
      });
    });

    describe('local events', function() {
      it('forward to the proxy when we are playing back locally', function() {
        var proxyListener = jasmine.createSpy('listener');
        proxy.getPlayer().addEventListener('buffering', proxyListener);

        expect(proxyListener).not.toHaveBeenCalled();
        var fakeEvent = new FakeEvent('buffering', {detail: 8675309});
        mockPlayer.listeners['buffering'](fakeEvent);
        expect(proxyListener).toHaveBeenCalledWith(jasmine.objectContaining({
          type: 'buffering',
          detail: 8675309
        }));
      });

      it('are ignored when we are casting', function() {
        var proxyListener = jasmine.createSpy('listener');
        proxy.getPlayer().addEventListener('buffering', proxyListener);

        // Set up the sender in casting mode:
        mockSender.isCasting.and.returnValue(true);
        mockSender.hasRemoteProperties.and.returnValue(true);

        expect(proxyListener).not.toHaveBeenCalled();
        var fakeEvent = new FakeEvent('buffering', {detail: 8675309});
        mockPlayer.listeners['buffering'](fakeEvent);
        expect(proxyListener).not.toHaveBeenCalled();
      });
    });

    describe('remote events', function() {
      it('forward to the proxy when we are casting', function() {
        var proxyListener = jasmine.createSpy('listener');
        proxy.getPlayer().addEventListener('buffering', proxyListener);

        // Set up the sender in casting mode:
        mockSender.isCasting.and.returnValue(true);
        mockSender.hasRemoteProperties.and.returnValue(true);

        expect(proxyListener).not.toHaveBeenCalled();
        var fakeEvent = new FakeEvent('buffering', {detail: 8675309});
        mockSender.onRemoteEvent('player', fakeEvent);
        expect(proxyListener).toHaveBeenCalledWith(jasmine.objectContaining({
          type: 'buffering',
          detail: 8675309
        }));
      });
    });
  });

  describe('"caststatuschanged" event', function() {
    it('is triggered by the sender', function() {
      var listener = jasmine.createSpy('listener');
      proxy.addEventListener('caststatuschanged', listener);
      expect(listener).not.toHaveBeenCalled();
      mockSender.onCastStatusChanged();
      expect(listener).toHaveBeenCalledWith(jasmine.objectContaining({
        type: 'caststatuschanged'
      }));
    });
  });

  describe('resume local playback', function() {
    var cache;

    beforeEach(function() {
      // Simulate cached remote state:
      cache = {
        video: {
          loop: true,
          playbackRate: 5
        },
        player: {
          getConfiguration: {key: 'value'},
          isTextTrackVisisble: true
        }
      };
      mockSender.get.and.callFake(function(targetName, property) {
        if (targetName == 'player') {
          return function() { return cache[targetName][property]; };
        } else {
          return cache[targetName][property];
        }
      });
    });

    it('transfers remote state back to local objects', function(done) {
      // Nothing has been set yet:
      expect(mockPlayer.configure).not.toHaveBeenCalled();
      expect(mockPlayer.setTextTrackVisibility).not.toHaveBeenCalled();
      expect(mockVideo.loop).toBe(undefined);
      expect(mockVideo.playbackRate).toBe(undefined);

      // Resume local playback.
      mockSender.onResumeLocal();

      // Initial Player state first:
      expect(mockPlayer.configure).toHaveBeenCalledWith(
          cache.player.getConfiguration);
      // Nothing else yet:
      expect(mockPlayer.setTextTrackVisibility).not.toHaveBeenCalled();
      expect(mockVideo.loop).toBe(undefined);
      expect(mockVideo.playbackRate).toBe(undefined);

      // The rest is done async:
      shaka.test.Util.delay(0.1).then(function() {
        expect(mockPlayer.setTextTrackVisibility).toHaveBeenCalledWith(
            cache.player.isTextTrackVisible);
        expect(mockVideo.loop).toEqual(cache.video.loop);
        expect(mockVideo.playbackRate).toEqual(cache.video.playbackRate);
      }).catch(fail).then(done);
    });

    it('loads the manifest', function() {
      cache.video.currentTime = 12;
      cache.player.getManifestUri = 'foo://bar';
      expect(mockPlayer.load).not.toHaveBeenCalled();

      mockSender.onResumeLocal();

      expect(mockPlayer.load).toHaveBeenCalledWith('foo://bar', 12);
    });

    it('does not provide a start time if the video has ended', function() {
      cache.video.currentTime = 12;
      cache.video.ended = true;
      cache.player.getManifestUri = 'foo://bar';
      expect(mockPlayer.load).not.toHaveBeenCalled();

      mockSender.onResumeLocal();

      expect(mockPlayer.load).toHaveBeenCalledWith('foo://bar', null);
    });

    it('plays the video after loading', function(done) {
      cache.player.getManifestUri = 'foo://bar';
      // Should play even if the video was paused remotely.
      cache.video.paused = true;
      // Autoplay has not been touched on the video yet.
      expect(mockVideo.autoplay).toBe(undefined);

      mockSender.onResumeLocal();

      // Video autoplay inhibited:
      expect(mockVideo.autoplay).toBe(false);
      shaka.test.Util.delay(0.1).then(function() {
        expect(mockVideo.play).toHaveBeenCalled();
        // Video autoplay restored:
        expect(mockVideo.autoplay).toBe(undefined);
      }).catch(fail).then(done);
    });

    it('does not load or play without a manifest URI', function(done) {
      cache.player.getManifestUri = null;

      mockSender.onResumeLocal();

      shaka.test.Util.delay(0.1).then(function() {
        // Nothing loaded or played:
        expect(mockPlayer.load).not.toHaveBeenCalled();
        expect(mockVideo.play).not.toHaveBeenCalled();

        // State was still transferred, though:
        expect(mockPlayer.setTextTrackVisibility).toHaveBeenCalledWith(
            cache.player.isTextTrackVisible);
        expect(mockVideo.loop).toEqual(cache.video.loop);
        expect(mockVideo.playbackRate).toEqual(cache.video.playbackRate);
      }).catch(fail).then(done);
    });

    it('triggers an "error" event if load fails', function(done) {
      cache.player.getManifestUri = 'foo://bar';
      var fakeError = new shaka.util.Error(
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.UNABLE_TO_GUESS_MANIFEST_TYPE);
      mockPlayer.load.and.returnValue(Promise.reject(fakeError));

      mockSender.onResumeLocal();

      shaka.test.Util.delay(0.1).then(function() {
        expect(mockPlayer.load).toHaveBeenCalled();
        expect(mockPlayer.dispatchEvent).toHaveBeenCalledWith(
            jasmine.objectContaining({ type: 'error', detail: fakeError }));
      }).catch(fail).then(done);
    });
  });

  describe('destroy', function() {
    it('destroys the local player and the sender', function(done) {
      expect(mockPlayer.destroy).not.toHaveBeenCalled();
      expect(mockSender.destroy).not.toHaveBeenCalled();

      proxy.destroy().catch(fail).then(done);

      expect(mockPlayer.destroy).toHaveBeenCalled();
      expect(mockSender.destroy).toHaveBeenCalled();
    });
  });

  /**
   * @param {string} appId
   * @param {Function} onCastStatusChanged
   * @param {Function} onRemoteEvent
   * @param {Function} onResumeLocal
   * @return {!Object}
   */
  function createMockCastSender(
      appId, onCastStatusChanged, onRemoteEvent, onResumeLocal) {
    expect(appId).toEqual(fakeAppId);

    mockSender = {
      init: jasmine.createSpy('init'),
      destroy: jasmine.createSpy('destroy'),
      apiReady: jasmine.createSpy('apiReady'),
      hasReceivers: jasmine.createSpy('hasReceivers'),
      isCasting: jasmine.createSpy('isCasting'),
      receiverName: jasmine.createSpy('receiverName'),
      hasRemoteProperties: jasmine.createSpy('hasRemoteProperties'),
      setAppData: jasmine.createSpy('setAppData'),
      showDisconnectDialog: jasmine.createSpy('showDisconnectDialog'),
      cast: jasmine.createSpy('cast'),
      get: jasmine.createSpy('get'),
      set: jasmine.createSpy('set'),
      // For convenience:
      onCastStatusChanged: onCastStatusChanged,
      onRemoteEvent: onRemoteEvent,
      onResumeLocal: onResumeLocal
    };
    mockSender.cast.and.returnValue(Promise.resolve());
    return mockSender;
  }

  // TODO: consolidate with simple_fakes.js
  function createMockVideo() {
    var video = {
      currentTime: undefined,
      ended: undefined,
      paused: undefined,
      play: jasmine.createSpy('play'),
      pause: jasmine.createSpy('pause'),
      addEventListener: function(eventName, listener) {
        video.listeners[eventName] = listener;
      },
      removeEventListener: function(eventName, listener) {
        delete video.listeners[eventName];
      },
      // For convenience:
      listeners: {}
    };
    return video;
  }

  function createMockPlayer() {
    var player = {
      load: jasmine.createSpy('load'),
      unload: jasmine.createSpy('unload'),
      getNetworkingEngine: jasmine.createSpy('getNetworkingEngine'),
      getManifestUri: jasmine.createSpy('getManifestUri'),
      getConfiguration: jasmine.createSpy('getConfiguration'),
      configure: jasmine.createSpy('configure'),
      isTextTrackVisible: jasmine.createSpy('isTextTrackVisible'),
      setTextTrackVisibility: jasmine.createSpy('setTextTrackVisibility'),
      trickPlay: jasmine.createSpy('trickPlay'),
      destroy: jasmine.createSpy('destroy'),
      addEventListener: function(eventName, listener) {
        player.listeners[eventName] = listener;
      },
      removeEventListener: function(eventName, listener) {
        delete player.listeners[eventName];
      },
      dispatchEvent: jasmine.createSpy('dispatchEvent'),
      // For convenience:
      listeners: {}
    };
    player.load.and.returnValue(Promise.resolve());
    player.unload.and.returnValue(Promise.resolve());
    return player;
  }
});
