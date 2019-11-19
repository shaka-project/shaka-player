/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('CastProxy', () => {
  const CastProxy = shaka.cast.CastProxy;
  const FakeEvent = shaka.util.FakeEvent;
  const Util = shaka.test.Util;

  const originalCastSender = shaka.cast.CastSender;
  const fakeAppId = 'fake app ID';

  let mockPlayer;
  let mockSender;
  /** @type {!shaka.test.FakeVideo} */
  let mockVideo;
  /** @type {!jasmine.Spy} */
  let mockCastSenderConstructor;

  /** @type {shaka.cast.CastProxy} */
  let proxy;

  beforeEach(() => {
    mockCastSenderConstructor = jasmine.createSpy('CastSender constructor');
    mockCastSenderConstructor.and.callFake(createMockCastSender);
    shaka.cast.CastSender = Util.spyFunc(mockCastSenderConstructor);

    mockVideo = new shaka.test.FakeVideo();
    mockPlayer = createMockPlayer();
    mockSender = null;

    proxy = new CastProxy(mockVideo, mockPlayer, fakeAppId);
  });

  afterEach(async () => {
    try {
      await proxy.destroy();
    } finally {
      shaka.cast.CastSender = originalCastSender;
    }
  });

  describe('constructor', () => {
    it('creates and initializes a CastSender', () => {
      expect(mockCastSenderConstructor).toHaveBeenCalled();
      expect(mockSender).toBeTruthy();
      expect(mockSender.init).toHaveBeenCalled();
    });

    it('listens for video and player events', () => {
      expect(Object.keys(mockVideo.on).length).toBeGreaterThan(0);
      expect(Object.keys(mockPlayer.listeners).length).toBeGreaterThan(0);
    });

    it('creates proxies for video and player', () => {
      expect(proxy.getVideo()).toBeTruthy();
      expect(proxy.getVideo()).not.toBe(mockVideo);
      expect(proxy.getPlayer()).toBeTruthy();
      expect(proxy.getPlayer()).not.toBe(mockPlayer);
    });
  });

  describe('canCast', () => {
    it('is true if the API is ready and we have receivers', () => {
      mockSender.apiReady.and.returnValue(false);
      mockSender.hasReceivers.and.returnValue(false);
      expect(proxy.canCast()).toBe(false);

      mockSender.apiReady.and.returnValue(true);
      expect(proxy.canCast()).toBe(false);

      mockSender.hasReceivers.and.returnValue(true);
      expect(proxy.canCast()).toBe(true);
    });
  });

  describe('isCasting', () => {
    it('delegates directly to the sender', () => {
      mockSender.isCasting.and.returnValue(false);
      expect(proxy.isCasting()).toBe(false);
      mockSender.isCasting.and.returnValue(true);
      expect(proxy.isCasting()).toBe(true);
    });
  });

  describe('receiverName', () => {
    it('delegates directly to the sender', () => {
      mockSender.receiverName.and.returnValue('abc');
      expect(proxy.receiverName()).toBe('abc');
      mockSender.receiverName.and.returnValue('xyz');
      expect(proxy.receiverName()).toBe('xyz');
    });
  });

  describe('setAppData', () => {
    it('delegates directly to the sender', () => {
      const fakeAppData = {key: 'value'};
      expect(mockSender.setAppData).not.toHaveBeenCalled();
      proxy.setAppData(fakeAppData);
      expect(mockSender.setAppData).toHaveBeenCalledWith(fakeAppData);
    });
  });

  describe('disconnect', () => {
    it('delegates directly to the sender', () => {
      expect(mockSender.showDisconnectDialog).not.toHaveBeenCalled();
      proxy.suggestDisconnect();
      expect(mockSender.showDisconnectDialog).toHaveBeenCalled();
    });
  });

  describe('cast', () => {
    it('pauses the local video', () => {
      proxy.cast();
      expect(mockVideo.pause).toHaveBeenCalled();
    });

    it('passes initial state to sender', () => {
      mockVideo.loop = true;
      mockVideo.playbackRate = 3;
      mockVideo.currentTime = 12;
      const fakeConfig = {key: 'value'};
      mockPlayer.getConfiguration.and.returnValue(fakeConfig);
      mockPlayer.isTextTrackVisible.and.returnValue(false);
      const fakeManifestUri = 'foo://bar';
      mockPlayer.getAssetUri.and.returnValue(fakeManifestUri);

      proxy.cast();
      const calls = mockSender.cast.calls;
      expect(calls.count()).toBe(1);
      if (calls.count()) {
        const state = calls.argsFor(0)[0];
        // Video state goes directly:
        expect(state.video.loop).toBe(mockVideo.loop);
        expect(state.video.playbackRate).toBe(mockVideo.playbackRate);
        // Player state uses corresponding setter names:
        expect(state.player.configure).toEqual(fakeConfig);
        expect(state['playerAfterLoad'].setTextTrackVisibility).toBe(false);
        // Manifest URI:
        expect(state.manifest).toBe(fakeManifestUri);
        // Start time:
        expect(state.startTime).toBe(mockVideo.currentTime);
      }
    });

    it('does not provide a start time if the video has ended', () => {
      mockVideo.ended = true;
      mockVideo.currentTime = 12;

      proxy.cast();
      const calls = mockSender.cast.calls;
      expect(calls.count()).toBe(1);
      if (calls.count()) {
        const state = calls.argsFor(0)[0];
        expect(state.startTime).toBe(null);
      }
    });

    it('unloads the local player after casting is complete', async () => {
      /** @type {!shaka.util.PublicPromise} */
      const p = new shaka.util.PublicPromise();
      mockSender.cast.and.returnValue(p);

      proxy.cast();
      await shaka.test.Util.shortDelay();
      // unload() has not been called yet.
      expect(mockPlayer.unload).not.toHaveBeenCalled();
      // Resolve the cast() promise.
      p.resolve();
      await shaka.test.Util.shortDelay();

      // unload() has now been called.
      expect(mockPlayer.unload).toHaveBeenCalled();
    });
  });

  describe('video proxy', () => {
    describe('get', () => {
      it('returns local values when we are playing back locally', () => {
        mockVideo.currentTime = 12;
        mockVideo.paused = true;
        expect(proxy.getVideo().currentTime).toBe(mockVideo.currentTime);
        expect(proxy.getVideo().paused).toBe(mockVideo.paused);

        expect(mockVideo.play).not.toHaveBeenCalled();
        proxy.getVideo().play();
        expect(mockVideo.play).toHaveBeenCalled();
        // The local method call was properly bound:
        expect(mockVideo.play.calls.mostRecent().object).toBe(mockVideo);
      });

      it('returns cached remote values when we are casting', () => {
        // Local values that will be ignored:
        mockVideo.currentTime = 12;
        mockVideo.paused = true;

        // Set up the sender in casting mode:
        mockSender.isCasting.and.returnValue(true);
        mockSender.hasRemoteProperties.and.returnValue(true);

        // Simulate remote values:
        const cache = {video: {
          currentTime: 24,
          paused: false,
          play: jasmine.createSpy('play'),
        }};
        mockSender.get.and.callFake((targetName, property) => {
          expect(targetName).toBe('video');
          return cache.video[property];
        });

        expect(proxy.getVideo().currentTime).not.toBe(mockVideo.currentTime);
        expect(proxy.getVideo().currentTime).toBe(cache.video.currentTime);
        expect(proxy.getVideo().paused).not.toBe(mockVideo.paused);
        expect(proxy.getVideo().paused).toBe(cache.video.paused);

        // Call a method:
        expect(mockVideo.play).not.toHaveBeenCalled();
        proxy.getVideo().play();
        // The call was routed to the remote video.
        expect(mockVideo.play).not.toHaveBeenCalled();
        expect(cache.video.play).toHaveBeenCalled();
      });

      it('returns local values when we have no remote values yet', () => {
        mockVideo.currentTime = 12;
        mockVideo.paused = true;

        // Set up the sender in casting mode, but without any remote values:
        mockSender.isCasting.and.returnValue(true);
        mockSender.hasRemoteProperties.and.returnValue(false);

        // Simulate remote method:
        const playSpy = jasmine.createSpy('play');
        mockSender.get.and.callFake((targetName, property) => {
          expect(targetName).toBe('video');
          expect(property).toBe('play');
          return playSpy;
        });

        // Without remote values, we should still return the local ones.
        expect(proxy.getVideo().currentTime).toBe(mockVideo.currentTime);
        expect(proxy.getVideo().paused).toBe(mockVideo.paused);

        // Call a method:
        expect(mockVideo.play).not.toHaveBeenCalled();
        proxy.getVideo().play();
        // The call was still routed to the remote video.
        expect(mockVideo.play).not.toHaveBeenCalled();
        expect(playSpy).toHaveBeenCalled();
      });
    });

    describe('set', () => {
      it('writes local values when we are playing back locally', () => {
        mockVideo.currentTime = 12;
        expect(proxy.getVideo().currentTime).toBe(12);

        // Writes to the proxy are reflected immediately in both the proxy and
        // the local video.
        proxy.getVideo().currentTime = 24;
        expect(proxy.getVideo().currentTime).toBe(24);
        expect(mockVideo.currentTime).toBe(24);
      });

      it('writes values remotely when we are casting', () => {
        mockVideo.currentTime = 12;

        // Set up the sender in casting mode:
        mockSender.isCasting.and.returnValue(true);
        mockSender.hasRemoteProperties.and.returnValue(true);

        // Set the value of currentTime:
        expect(mockSender.set).not.toHaveBeenCalled();
        proxy.getVideo().currentTime = 24;
        expect(mockSender.set).toHaveBeenCalledWith('video', 'currentTime', 24);

        // The local value was unaffected.
        expect(mockVideo.currentTime).toBe(12);
      });
    });

    describe('local events', () => {
      it('forward to the proxy when we are playing back locally', () => {
        const proxyListener = jasmine.createSpy('listener');
        proxy.getVideo().addEventListener(
            'timeupdate', Util.spyFunc(proxyListener));

        expect(proxyListener).not.toHaveBeenCalled();
        const fakeEvent = new FakeEvent('timeupdate', {detail: 8675309});
        mockVideo.on['timeupdate'](fakeEvent);
        expect(proxyListener).toHaveBeenCalledWith(jasmine.objectContaining({
          type: 'timeupdate',
          detail: 8675309,
        }));
      });

      it('are ignored when we are casting', () => {
        const proxyListener = jasmine.createSpy('listener');
        proxy.getVideo().addEventListener(
            'timeupdate', Util.spyFunc(proxyListener));

        // Set up the sender in casting mode:
        mockSender.isCasting.and.returnValue(true);
        mockSender.hasRemoteProperties.and.returnValue(true);

        expect(proxyListener).not.toHaveBeenCalled();
        const fakeEvent = new FakeEvent('timeupdate', {detail: 8675309});
        mockVideo.on['timeupdate'](fakeEvent);
        expect(proxyListener).not.toHaveBeenCalled();
      });
    });

    describe('remote events', () => {
      it('forward to the proxy when we are casting', () => {
        const proxyListener = jasmine.createSpy('listener');
        proxy.getVideo().addEventListener(
            'timeupdate', Util.spyFunc(proxyListener));

        // Set up the sender in casting mode:
        mockSender.isCasting.and.returnValue(true);
        mockSender.hasRemoteProperties.and.returnValue(true);

        expect(proxyListener).not.toHaveBeenCalled();
        const fakeEvent = new FakeEvent('timeupdate', {detail: 8675309});
        mockSender.onRemoteEvent('video', fakeEvent);
        expect(proxyListener).toHaveBeenCalledWith(jasmine.objectContaining({
          type: 'timeupdate',
          detail: 8675309,
        }));
      });
    });
  });

  describe('player proxy', () => {
    describe('get', () => {
      it('returns local values when we are playing back locally', () => {
        const fakeConfig = {key: 'value'};
        mockPlayer.getConfiguration.and.returnValue(fakeConfig);
        expect(proxy.getPlayer().getConfiguration()).toEqual(fakeConfig);

        expect(mockPlayer.trickPlay).not.toHaveBeenCalled();
        proxy.getPlayer().trickPlay(5);
        expect(mockPlayer.trickPlay).toHaveBeenCalledWith(5);
        // The local method call was properly bound:
        expect(mockPlayer.trickPlay.calls.mostRecent().object).toBe(mockPlayer);
      });

      it('returns cached remote values when we are casting', () => {
        // Local values that will be ignored:
        const fakeConfig = {key: 'value'};
        mockPlayer.getConfiguration.and.returnValue(fakeConfig);
        mockPlayer.isTextTrackVisible.and.returnValue(false);

        // Set up the sender in casting mode:
        mockSender.isCasting.and.returnValue(true);
        mockSender.hasRemoteProperties.and.returnValue(true);

        // Simulate remote values:
        const fakeConfig2 = {key2: 'value2'};
        const cache = {player: {
          getConfiguration: fakeConfig2,
          isTextTrackVisible: true,
          trickPlay: jasmine.createSpy('trickPlay'),
        }};
        mockSender.get.and.callFake((targetName, property) => {
          expect(targetName).toBe('player');
          const value = cache.player[property];
          if (typeof value == 'function') {
            // methods:
            return value;
          } else {
            // getters:
            return () => value;
          }
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

      it('returns local values when we have no remote values yet', () => {
        const fakeConfig = {key: 'value'};
        mockPlayer.getConfiguration.and.returnValue(fakeConfig);
        mockPlayer.isTextTrackVisible.and.returnValue(true);

        // Set up the sender in casting mode, but without any remote values:
        mockSender.isCasting.and.returnValue(true);
        mockSender.hasRemoteProperties.and.returnValue(false);

        // Simulate remote method:
        const trickPlaySpy = jasmine.createSpy('trickPlay');
        mockSender.get.and.callFake((targetName, property) => {
          expect(targetName).toBe('player');
          expect(property).toBe('trickPlay');
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

      it('always returns a local NetworkingEngine', () => {
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

    describe('local events', () => {
      it('forward to the proxy when we are playing back locally', () => {
        const proxyListener = jasmine.createSpy('listener');
        proxy.getPlayer().addEventListener(
            'buffering', Util.spyFunc(proxyListener));

        expect(proxyListener).not.toHaveBeenCalled();
        const fakeEvent = new FakeEvent('buffering', {detail: 8675309});
        mockPlayer.listeners['buffering'](fakeEvent);
        expect(proxyListener).toHaveBeenCalledWith(jasmine.objectContaining({
          type: 'buffering',
          detail: 8675309,
        }));
      });

      it('are ignored when we are casting', () => {
        const proxyListener = jasmine.createSpy('listener');
        proxy.getPlayer().addEventListener(
            'buffering', Util.spyFunc(proxyListener));

        // Set up the sender in casting mode:
        mockSender.isCasting.and.returnValue(true);
        mockSender.hasRemoteProperties.and.returnValue(true);

        expect(proxyListener).not.toHaveBeenCalled();
        const fakeEvent = new FakeEvent('buffering', {detail: 8675309});
        mockPlayer.listeners['buffering'](fakeEvent);
        expect(proxyListener).not.toHaveBeenCalled();
      });
    });

    describe('remote events', () => {
      it('forward to the proxy when we are casting', () => {
        const proxyListener = jasmine.createSpy('listener');
        proxy.getPlayer().addEventListener(
            'buffering', Util.spyFunc(proxyListener));

        // Set up the sender in casting mode:
        mockSender.isCasting.and.returnValue(true);
        mockSender.hasRemoteProperties.and.returnValue(true);

        expect(proxyListener).not.toHaveBeenCalled();
        const fakeEvent = new FakeEvent('buffering', {detail: 8675309});
        mockSender.onRemoteEvent('player', fakeEvent);
        expect(proxyListener).toHaveBeenCalledWith(jasmine.objectContaining({
          type: 'buffering',
          detail: 8675309,
        }));
      });
    });
  });

  describe('"caststatuschanged" event', () => {
    it('is triggered by the sender', () => {
      const listener = jasmine.createSpy('listener');
      proxy.addEventListener('caststatuschanged', Util.spyFunc(listener));
      expect(listener).not.toHaveBeenCalled();
      mockSender.onCastStatusChanged();
      expect(listener).toHaveBeenCalledWith(jasmine.objectContaining({
        type: 'caststatuschanged',
      }));
    });
  });

  describe('synthetic video events from onFirstCastStateUpdate', () => {
    it('sends a pause event if the video is paused', () => {
      mockVideo.paused = true;
      const proxyListener = jasmine.createSpy('listener');
      proxy.getVideo().addEventListener('pause', Util.spyFunc(proxyListener));
      expect(proxyListener).not.toHaveBeenCalled();
      mockSender.onFirstCastStateUpdate();
      expect(proxyListener).toHaveBeenCalled();
    });

    it('sends a play event if the video is playing', () => {
      mockVideo.paused = false;
      const proxyListener = jasmine.createSpy('listener');
      proxy.getVideo().addEventListener('play', Util.spyFunc(proxyListener));
      expect(proxyListener).not.toHaveBeenCalled();
      mockSender.onFirstCastStateUpdate();
      expect(proxyListener).toHaveBeenCalled();
    });
  });

  describe('resume local playback', () => {
    let cache;

    beforeEach(() => {
      // Simulate cached remote state:
      cache = {
        video: {
          loop: true,
          playbackRate: 5,
        },
        player: {
          getConfiguration: {key: 'value'},
          isTextTrackVisisble: true,
        },
      };
      mockSender.get.and.callFake((targetName, property) => {
        if (targetName == 'player') {
          return () => cache[targetName][property];
        } else {
          return cache[targetName][property];
        }
      });
    });

    it('transfers remote state back to local objects', async () => {
      // Nothing has been set yet:
      expect(mockPlayer.configure).not.toHaveBeenCalled();
      expect(mockPlayer.setTextTrackVisibility).not.toHaveBeenCalled();
      expect(mockVideo.loop).toBe(false);
      expect(mockVideo.playbackRate).toBe(1);

      // Resume local playback.
      mockSender.onResumeLocal();

      // Initial Player state first:
      expect(mockPlayer.configure).toHaveBeenCalledWith(
          cache.player.getConfiguration);
      // Nothing else yet:
      expect(mockPlayer.setTextTrackVisibility).not.toHaveBeenCalled();
      expect(mockVideo.loop).toBe(false);
      expect(mockVideo.playbackRate).toBe(1);

      // The rest is done async:
      await shaka.test.Util.shortDelay();
      expect(mockPlayer.setTextTrackVisibility).toHaveBeenCalledWith(
          cache.player.isTextTrackVisible);
      expect(mockVideo.loop).toBe(cache.video.loop);
      expect(mockVideo.playbackRate).toBe(cache.video.playbackRate);
    });

    it('loads the manifest', () => {
      cache.video.currentTime = 12;
      cache.player.getAssetUri = 'foo://bar';
      expect(mockPlayer.load).not.toHaveBeenCalled();

      mockSender.onResumeLocal();

      expect(mockPlayer.load).toHaveBeenCalledWith('foo://bar', 12);
    });

    it('does not provide a start time if the video has ended', () => {
      cache.video.currentTime = 12;
      cache.video.ended = true;
      cache.player.getAssetUri = 'foo://bar';
      expect(mockPlayer.load).not.toHaveBeenCalled();

      mockSender.onResumeLocal();

      expect(mockPlayer.load).toHaveBeenCalledWith('foo://bar', null);
    });

    it('plays the video after loading', async () => {
      cache.player.getAssetUri = 'foo://bar';
      // Should play even if the video was paused remotely.
      cache.video.paused = true;
      mockVideo.autoplay = true;

      mockSender.onResumeLocal();

      // Video autoplay inhibited:
      expect(mockVideo.autoplay).toBe(false);
      await shaka.test.Util.shortDelay();
      expect(mockVideo.play).toHaveBeenCalled();
      // Video autoplay restored:
      expect(mockVideo.autoplay).toBe(true);
    });

    it('does not load or play without a manifest URI', async () => {
      cache.player.getAssetUri = null;

      mockSender.onResumeLocal();

      await shaka.test.Util.shortDelay();
      // Nothing loaded or played:
      expect(mockPlayer.load).not.toHaveBeenCalled();
      expect(mockVideo.play).not.toHaveBeenCalled();

      // State was still transferred, though:
      expect(mockPlayer.setTextTrackVisibility).toHaveBeenCalledWith(
          cache.player.isTextTrackVisible);
      expect(mockVideo.loop).toBe(cache.video.loop);
      expect(mockVideo.playbackRate).toBe(cache.video.playbackRate);
    });

    it('triggers an "error" event if load fails', async () => {
      cache.player.getAssetUri = 'foo://bar';
      const fakeError = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.UNABLE_TO_GUESS_MANIFEST_TYPE);
      mockPlayer.load.and.returnValue(Promise.reject(fakeError));

      mockSender.onResumeLocal();

      await shaka.test.Util.shortDelay();
      expect(mockPlayer.load).toHaveBeenCalled();
      expect(mockPlayer.dispatchEvent).toHaveBeenCalledWith(
          jasmine.objectContaining({type: 'error', detail: fakeError}));
    });
  });

  describe('destroy', () => {
    it('destroys the local player and the sender', async () => {
      expect(mockPlayer.destroy).not.toHaveBeenCalled();
      expect(mockSender.destroy).not.toHaveBeenCalled();
      expect(mockSender.forceDisconnect).not.toHaveBeenCalled();

      const p = proxy.destroy();

      expect(mockPlayer.destroy).toHaveBeenCalled();
      expect(mockSender.destroy).toHaveBeenCalled();
      expect(mockSender.forceDisconnect).not.toHaveBeenCalled();
      await p;
    });

    it('optionally forces the sender to disconnect', async () => {
      expect(mockSender.destroy).not.toHaveBeenCalled();
      expect(mockSender.forceDisconnect).not.toHaveBeenCalled();

      const p = proxy.destroy(true);

      expect(mockSender.destroy).toHaveBeenCalled();
      expect(mockSender.forceDisconnect).toHaveBeenCalled();
      await p;
    });
  });

  /**
   * @param {string} appId
   * @param {Function} onCastStatusChanged
   * @param {Function} onFirstCastStateUpdate
   * @param {Function} onRemoteEvent
   * @param {Function} onResumeLocal
   * @return {!Object}
   */
  function createMockCastSender(
      appId, onCastStatusChanged, onFirstCastStateUpdate,
      onRemoteEvent, onResumeLocal) {
    expect(appId).toBe(fakeAppId);

    mockSender = {
      init: jasmine.createSpy('init'),
      destroy: jasmine.createSpy('destroy'),
      apiReady: jasmine.createSpy('apiReady'),
      hasReceivers: jasmine.createSpy('hasReceivers'),
      isCasting: jasmine.createSpy('isCasting'),
      receiverName: jasmine.createSpy('receiverName'),
      hasRemoteProperties: jasmine.createSpy('hasRemoteProperties'),
      setAppData: jasmine.createSpy('setAppData'),
      forceDisconnect: jasmine.createSpy('forceDisconnect'),
      showDisconnectDialog: jasmine.createSpy('showDisconnectDialog'),
      cast: jasmine.createSpy('cast'),
      get: jasmine.createSpy('get'),
      set: jasmine.createSpy('set'),
      // For convenience:
      onCastStatusChanged: onCastStatusChanged,
      onFirstCastStateUpdate: onFirstCastStateUpdate,
      onRemoteEvent: onRemoteEvent,
      onResumeLocal: onResumeLocal,
    };
    mockSender.cast.and.returnValue(Promise.resolve());
    return mockSender;
  }

  function createMockPlayer() {
    const player = {
      load: jasmine.createSpy('load'),
      unload: jasmine.createSpy('unload'),
      getNetworkingEngine: jasmine.createSpy('getNetworkingEngine'),
      getAssetUri: jasmine.createSpy('getAssetUri'),
      getConfiguration: jasmine.createSpy('getConfiguration'),
      configure: jasmine.createSpy('configure'),
      isTextTrackVisible: jasmine.createSpy('isTextTrackVisible'),
      setTextTrackVisibility: jasmine.createSpy('setTextTrackVisibility'),
      trickPlay: jasmine.createSpy('trickPlay'),
      destroy: jasmine.createSpy('destroy'),
      addEventListener: (eventName, listener) => {
        player.listeners[eventName] = listener;
      },
      removeEventListener: (eventName, listener) => {
        delete player.listeners[eventName];
      },
      dispatchEvent: jasmine.createSpy('dispatchEvent'),
      // For convenience:
      listeners: {},
    };
    player.load.and.returnValue(Promise.resolve());
    player.unload.and.returnValue(Promise.resolve());
    return player;
  }
});
