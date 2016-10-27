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

describe('CastReceiver', function() {
  var CastReceiver;
  var CastUtils;

  var originalCast;
  var originalUserAgent;

  var mockReceiverManager;
  var mockVideo;
  var mockPlayer;
  var mockAppDataCallback;

  var mockReceiverApi;
  var mockMessageBus;

  /** @type {shaka.cast.CastReceiver} */
  var receiver;

  var isChrome;
  var isChromecast;

  function checkChromeOrChromecast() {
    if (!isChromecast && !isChrome) {
      pending('Skipping CastReceiver tests for non-Chrome and non-Chromecast');
    }
  }

  beforeAll(function() {
    // The receiver is only meant to run on the Chromecast, so we have the
    // ability to use modern APIs there that may not be available on all of the
    // browsers our library supports.  Because of this, CastReceiver tests will
    // only be run on Chrome and Chromecast.
    isChromecast = navigator.userAgent.indexOf('CrKey') >= 0;
    var isEdge = navigator.userAgent.indexOf('Edge/') >= 0;
    // Edge also has "Chrome/" in its user agent string.
    isChrome = navigator.userAgent.indexOf('Chrome/') >= 0 && !isEdge;

    CastReceiver = shaka.cast.CastReceiver;
    CastUtils = shaka.cast.CastUtils;

    // Don't do any more work here if the tests will not end up running.
    if (!isChromecast && !isChrome) return;

    originalCast = window['cast'];
    originalUserAgent = navigator.userAgent;

    // In uncompiled mode, there is a UA check for Chromecast in order to make
    // manual testing easier.  For these automated tests, we want to act as if
    // we are running on the Chromecast, even in Chrome.
    // Since we can't write to window.navigator or navigator.userAgent, we use
    // Object.defineProperty.
    Object.defineProperty(window['navigator'],
                          'userAgent', {value: 'CrKey'});
  });

  beforeEach(function() {
    mockReceiverApi = createMockReceiverApi();
    // We're using quotes to access window.cast because the compiler
    // knows about lots of Cast-specific APIs we aren't mocking.  We
    // don't need this mock strictly type-checked.
    window['cast'] = { receiver: mockReceiverApi };

    mockReceiverManager = createMockReceiverManager();
    mockMessageBus = createMockMessageBus();
    mockVideo = createMockVideo();
    mockPlayer = createMockPlayer();
    mockAppDataCallback = jasmine.createSpy('appDataCallback');

    receiver = new CastReceiver(mockVideo, mockPlayer, mockAppDataCallback);
  });

  afterEach(function(done) {
    receiver.destroy().catch(fail).then(done);
  });

  afterAll(function() {
    if (originalUserAgent) {
      window['cast'] = originalCast;
      Object.defineProperty(window['navigator'],
                            'userAgent', {value: originalUserAgent});
    }
  });

  describe('constructor', function() {
    it('starts the receiver manager', function() {
      checkChromeOrChromecast();
      expect(mockReceiverManager.start).toHaveBeenCalled();
    });

    it('listens for video and player events', function() {
      checkChromeOrChromecast();
      expect(Object.keys(mockVideo.listeners).length).toBeGreaterThan(0);
      expect(Object.keys(mockPlayer.listeners).length).toBeGreaterThan(0);
    });

    it('limits streams to 1080p', function() {
      checkChromeOrChromecast();
      expect(mockPlayer.setMaxHardwareResolution).
          toHaveBeenCalledWith(1920, 1080);
    });

    it('does not start polling', function() {
      checkChromeOrChromecast();
      expect(mockPlayer.getConfiguration).not.toHaveBeenCalled();
      expect(mockMessageBus.messages.length).toBe(0);
    });
  });

  describe('isConnected', function() {
    it('is true when there are senders', function() {
      checkChromeOrChromecast();
      expect(receiver.isConnected()).toBe(false);
      fakeConnectedSenders(1);
      expect(receiver.isConnected()).toBe(true);
      fakeConnectedSenders(2);
      expect(receiver.isConnected()).toBe(true);
      fakeConnectedSenders(99);
      expect(receiver.isConnected()).toBe(true);
      fakeConnectedSenders(0);
      expect(receiver.isConnected()).toBe(false);
    });
  });

  describe('"caststatuschanged" event', function() {
    it('is triggered when senders connect or disconnect', function(done) {
      checkChromeOrChromecast();
      var listener = jasmine.createSpy('listener');
      receiver.addEventListener('caststatuschanged', listener);

      shaka.test.Util.delay(0.2).then(function() {
        expect(listener).not.toHaveBeenCalled();
        fakeConnectedSenders(1);
        return shaka.test.Util.delay(0.2);
      }).then(function() {
        expect(listener).toHaveBeenCalled();
        listener.calls.reset();
        mockReceiverManager.onSenderDisconnected();
        return shaka.test.Util.delay(0.2);
      }).then(function() {
        expect(listener).toHaveBeenCalled();
      }).catch(fail).then(done);
    });

    it('is triggered when idle state changes', function(done) {
      checkChromeOrChromecast();
      var listener = jasmine.createSpy('listener');
      receiver.addEventListener('caststatuschanged', listener);

      var fakeLoadingEvent = {type: 'loading'};
      var fakeUnloadingEvent = {type: 'unloading'};
      var fakeEndedEvent = {type: 'ended'};
      var fakePlayingEvent = {type: 'playing'};

      shaka.test.Util.delay(0.2).then(function() {
        expect(listener).not.toHaveBeenCalled();
        expect(receiver.isIdle()).toBe(true);

        mockPlayer.listeners['loading'](fakeLoadingEvent);
        return shaka.test.Util.delay(0.2);
      }).then(function() {
        expect(listener).toHaveBeenCalled();
        expect(receiver.isIdle()).toBe(false);
        listener.calls.reset();

        mockPlayer.listeners['unloading'](fakeUnloadingEvent);
        return shaka.test.Util.delay(0.2);
      }).then(function() {
        expect(listener).toHaveBeenCalled();
        expect(receiver.isIdle()).toBe(true);
        listener.calls.reset();

        mockVideo.ended = true;
        mockVideo.listeners['ended'](fakeEndedEvent);
        return shaka.test.Util.delay(5.2);  // There is a long delay for 'ended'
      }).then(function() {
        expect(listener).toHaveBeenCalled();
        listener.calls.reset();
        expect(receiver.isIdle()).toBe(true);

        mockVideo.ended = false;
        mockVideo.listeners['playing'](fakePlayingEvent);
      }).then(function() {
        expect(listener).toHaveBeenCalled();
        expect(receiver.isIdle()).toBe(false);
      }).catch(fail).then(done);
    });
  });

  describe('local events', function() {
    it('trigger "update" and "event" messages', function() {
      checkChromeOrChromecast();
      fakeConnectedSenders(1);

      // No messages yet.
      expect(mockMessageBus.messages).toEqual([]);
      var fakeEvent = {type: 'timeupdate'};
      mockVideo.listeners['timeupdate'](fakeEvent);

      // There are now "update" and "event" messages, in that order.
      expect(mockMessageBus.messages).toEqual([
        {
          type: 'update',
          update: jasmine.any(Object)
        },
        {
          type: 'event',
          targetName: 'video',
          event: jasmine.objectContaining(fakeEvent)
        }
      ]);
    });
  });

  describe('"init" message', function() {
    var fakeInitState;
    var fakeConfig = {key: 'value'};
    var fakeAppData = {myFakeAppData: 1234};

    beforeEach(function() {
      fakeInitState = {
        player: {
          configure: fakeConfig
        },
        'playerAfterLoad': {
          setTextTrackVisibility: true
        },
        video: {
          loop: true,
          playbackRate: 5
        }
      };
    });

    it('sets initial state', function(done) {
      checkChromeOrChromecast();
      expect(mockVideo.loop).toBe(undefined);
      expect(mockVideo.playbackRate).toBe(undefined);
      expect(mockPlayer.configure).not.toHaveBeenCalled();

      fakeIncomingMessage({
        type: 'init',
        initState: fakeInitState,
        appData: fakeAppData
      });

      // Initial Player state first:
      expect(mockPlayer.configure).toHaveBeenCalledWith(fakeConfig);
      // App data next:
      expect(mockAppDataCallback).toHaveBeenCalledWith(fakeAppData);
      // Nothing else yet:
      expect(mockPlayer.setTextTrackVisibility).not.toHaveBeenCalled();
      expect(mockVideo.loop).toBe(undefined);
      expect(mockVideo.playbackRate).toBe(undefined);

      // The rest is done async:
      shaka.test.Util.delay(0.1).then(function() {
        expect(mockPlayer.setTextTrackVisibility).toHaveBeenCalledWith(
            fakeInitState['playerAfterLoad'].setTextTrackVisibility);
        expect(mockVideo.loop).toEqual(fakeInitState.video.loop);
        expect(mockVideo.playbackRate).toEqual(
            fakeInitState.video.playbackRate);
      }).catch(fail).then(done);
    });

    it('starts polling', function() {
      checkChromeOrChromecast();
      var fakeConfig = {key: 'value'};
      mockPlayer.getConfiguration.and.returnValue(fakeConfig);

      fakeConnectedSenders(1);

      mockPlayer.getConfiguration.calls.reset();

      expect(mockMessageBus.messages.length).toBe(0);
      fakeIncomingMessage({
        type: 'init',
        initState: fakeInitState,
        appData: fakeAppData
      });

      expect(mockPlayer.getConfiguration).toHaveBeenCalled();
      expect(mockMessageBus.messages).toContain(jasmine.objectContaining({
        type: 'update',
        update: jasmine.objectContaining({
          player: jasmine.objectContaining({
            getConfiguration: fakeConfig
          })
        })
      }));
    });

    it('loads the manifest', function() {
      checkChromeOrChromecast();
      fakeInitState.startTime = 12;
      fakeInitState.manifest = 'foo://bar';
      expect(mockPlayer.load).not.toHaveBeenCalled();

      fakeIncomingMessage({
        type: 'init',
        initState: fakeInitState,
        appData: fakeAppData
      });

      expect(mockPlayer.load).toHaveBeenCalledWith('foo://bar', 12);
    });

    it('plays the video after loading', function(done) {
      checkChromeOrChromecast();
      fakeInitState.manifest = 'foo://bar';
      // Autoplay has not been touched on the video yet.
      expect(mockVideo.autoplay).toBe(undefined);

      fakeIncomingMessage({
        type: 'init',
        initState: fakeInitState,
        appData: fakeAppData
      });

      // Video autoplay inhibited:
      expect(mockVideo.autoplay).toBe(false);
      shaka.test.Util.delay(0.1).then(function() {
        expect(mockVideo.play).toHaveBeenCalled();
        // Video autoplay restored:
        expect(mockVideo.autoplay).toBe(undefined);
      }).catch(fail).then(done);
    });

    it('does not load or play without a manifest URI', function(done) {
      checkChromeOrChromecast();
      fakeInitState.manifest = null;

      fakeIncomingMessage({
        type: 'init',
        initState: fakeInitState,
        appData: fakeAppData
      });

      shaka.test.Util.delay(0.1).then(function() {
        // Nothing loaded or played:
        expect(mockPlayer.load).not.toHaveBeenCalled();
        expect(mockVideo.play).not.toHaveBeenCalled();

        // State was still transferred, though:
        expect(mockPlayer.setTextTrackVisibility).toHaveBeenCalledWith(
            fakeInitState['playerAfterLoad'].setTextTrackVisibility);
        expect(mockVideo.loop).toEqual(fakeInitState.video.loop);
        expect(mockVideo.playbackRate).toEqual(
            fakeInitState.video.playbackRate);
      }).catch(fail).then(done);
    });

    it('triggers an "error" event if load fails', function(done) {
      checkChromeOrChromecast();
      fakeInitState.manifest = 'foo://bar';
      var fakeError = new shaka.util.Error(
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.UNABLE_TO_GUESS_MANIFEST_TYPE);
      mockPlayer.load.and.returnValue(Promise.reject(fakeError));

      var listener = jasmine.createSpy('listener');
      mockPlayer.addEventListener('error', listener);
      expect(listener).not.toHaveBeenCalled();

      fakeIncomingMessage({
        type: 'init',
        initState: fakeInitState,
        appData: fakeAppData
      });

      shaka.test.Util.delay(0.1).then(function() {
        expect(mockPlayer.load).toHaveBeenCalled();
        expect(mockPlayer.dispatchEvent).toHaveBeenCalledWith(
            jasmine.objectContaining({ type: 'error', detail: fakeError }));
      }).catch(fail).then(done);
    });
  });

  describe('"appData" message', function() {
    it('triggers the app data callback', function() {
      checkChromeOrChromecast();
      expect(mockAppDataCallback).not.toHaveBeenCalled();

      var fakeAppData = {myFakeAppData: 1234};
      fakeIncomingMessage({
        type: 'appData',
        appData: fakeAppData
      });

      expect(mockAppDataCallback).toHaveBeenCalledWith(fakeAppData);
    });
  });

  describe('"set" message', function() {
    it('sets local properties', function() {
      checkChromeOrChromecast();
      expect(mockVideo.currentTime).toBe(undefined);
      fakeIncomingMessage({
        type: 'set',
        targetName: 'video',
        property: 'currentTime',
        value: 12
      });
      expect(mockVideo.currentTime).toEqual(12);

      expect(mockPlayer['arbitraryName']).toBe(undefined);
      fakeIncomingMessage({
        type: 'set',
        targetName: 'player',
        property: 'arbitraryName',
        value: 'arbitraryValue'
      });
      expect(mockPlayer['arbitraryName']).toEqual('arbitraryValue');
    });

    it('routes volume properties to the receiver manager', function() {
      checkChromeOrChromecast();
      expect(mockVideo.volume).toBe(undefined);
      expect(mockVideo.muted).toBe(undefined);
      expect(mockReceiverManager.setSystemVolumeLevel).not.toHaveBeenCalled();
      expect(mockReceiverManager.setSystemVolumeMuted).not.toHaveBeenCalled();

      fakeIncomingMessage({
        type: 'set',
        targetName: 'video',
        property: 'volume',
        value: 0.5
      });
      fakeIncomingMessage({
        type: 'set',
        targetName: 'video',
        property: 'muted',
        value: true
      });

      expect(mockVideo.volume).toBe(undefined);
      expect(mockVideo.muted).toBe(undefined);
      expect(mockReceiverManager.setSystemVolumeLevel).
          toHaveBeenCalledWith(0.5);
      expect(mockReceiverManager.setSystemVolumeMuted).
          toHaveBeenCalledWith(true);
    });
  });

  describe('"call" message', function() {
    it('calls local methods', function() {
      checkChromeOrChromecast();
      expect(mockVideo.play).not.toHaveBeenCalled();
      fakeIncomingMessage({
        type: 'call',
        targetName: 'video',
        methodName: 'play',
        args: [1, 2, 3]
      });
      expect(mockVideo.play).toHaveBeenCalledWith(1, 2, 3);

      expect(mockPlayer.configure).not.toHaveBeenCalled();
      fakeIncomingMessage({
        type: 'call',
        targetName: 'player',
        methodName: 'configure',
        args: [42]
      });
      expect(mockPlayer.configure).toHaveBeenCalledWith(42);
    });
  });

  describe('"asyncCall" message', function() {
    var p;
    var fakeSenderId = 'senderId';
    var fakeCallId = '5';

    beforeEach(function() {
      fakeConnectedSenders(1);
      p = new shaka.util.PublicPromise();
      mockPlayer.load.and.returnValue(p);

      expect(mockPlayer.load).not.toHaveBeenCalled();
      fakeIncomingMessage({
        type: 'asyncCall',
        id: fakeCallId,
        targetName: 'player',
        methodName: 'load',
        args: ['foo://bar', 12]
      }, fakeSenderId);
    });

    it('calls local async methods', function() {
      checkChromeOrChromecast();
      expect(mockPlayer.load).toHaveBeenCalledWith('foo://bar', 12);
      p.resolve();
    });

    it('sends "asyncComplete" replies when resolved', function(done) {
      checkChromeOrChromecast();
      // No messages have been sent, either broadcast  or privately.
      expect(mockMessageBus.broadcast).not.toHaveBeenCalled();
      expect(mockMessageBus.getCastChannel).not.toHaveBeenCalled();

      p.resolve();
      shaka.test.Util.delay(0.1).then(function() {
        // No broadcast messages have been sent, but a private message has
        // been sent to the sender who started the async call.
        expect(mockMessageBus.broadcast).not.toHaveBeenCalled();
        expect(mockMessageBus.getCastChannel).toHaveBeenCalledWith(
            fakeSenderId);
        var senderChannel = mockMessageBus.getCastChannel();
        expect(senderChannel.messages).toEqual([{
          type: 'asyncComplete',
          id: fakeCallId,
          error: null
        }]);
      }).catch(fail).then(done);
    });

    it('sends "asyncComplete" replies when rejected', function(done) {
      checkChromeOrChromecast();
      // No messages have been sent, either broadcast  or privately.
      expect(mockMessageBus.broadcast).not.toHaveBeenCalled();
      expect(mockMessageBus.getCastChannel).not.toHaveBeenCalled();

      var fakeError = new shaka.util.Error(
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.UNABLE_TO_GUESS_MANIFEST_TYPE);
      p.reject(fakeError);
      shaka.test.Util.delay(0.1).then(function() {
        // No broadcast messages have been sent, but a private message has
        // been sent to the sender who started the async call.
        expect(mockMessageBus.broadcast).not.toHaveBeenCalled();
        expect(mockMessageBus.getCastChannel).toHaveBeenCalledWith(
            fakeSenderId);
        var senderChannel = mockMessageBus.getCastChannel();
        expect(senderChannel.messages).toEqual([{
          type: 'asyncComplete',
          id: fakeCallId,
          error: jasmine.any(Object)
        }]);
        if (senderChannel.messages.length) {
          var error = senderChannel.messages[0].error;
          shaka.test.Util.expectToEqualError(fakeError, error);
        }
      }).catch(fail).then(done);
    });
  });

  describe('destroy', function() {
    it('destroys the local player', function(done) {
      checkChromeOrChromecast();
      expect(mockPlayer.destroy).not.toHaveBeenCalled();
      receiver.destroy().then(function() {
        expect(mockPlayer.destroy).toHaveBeenCalled();
      }).catch(fail).then(done);
    });

    it('stops polling', function(done) {
      checkChromeOrChromecast();
      // Start polling:
      fakeIncomingMessage({
        type: 'init',
        initState: {},
        appData: {}
      });

      mockPlayer.getConfiguration.calls.reset();
      shaka.test.Util.delay(1).then(function() {
        // We have polled at least once, so this getter has been called.
        expect(mockPlayer.getConfiguration).toHaveBeenCalled();
        mockPlayer.getConfiguration.calls.reset();
        // Destroy the receiver.
        return receiver.destroy();
      }).then(function() {
        // Wait another second.
        return shaka.test.Util.delay(1);
      }).then(function() {
        // We have not polled again since destruction.
        expect(mockPlayer.getConfiguration).not.toHaveBeenCalled();
      }).catch(fail).then(done);
    });

    it('stops the receiver manager', function(done) {
      checkChromeOrChromecast();
      expect(mockReceiverManager.stop).not.toHaveBeenCalled();
      receiver.destroy().then(function() {
        expect(mockReceiverManager.stop).toHaveBeenCalled();
      }).catch(fail).then(done);
    });
  });

  function createMockReceiverApi() {
    return {
      CastReceiverManager: {
        getInstance: function()  { return mockReceiverManager; }
      }
    };
  }

  function createMockReceiverManager() {
    return {
      start: jasmine.createSpy('CastReceiverManager.start'),
      stop: jasmine.createSpy('CastReceiverManager.stop'),
      setSystemVolumeLevel:
          jasmine.createSpy('CastReceiverManager.setSystemVolumeLevel'),
      setSystemVolumeMuted:
          jasmine.createSpy('CastReceiverManager.setSystemVolumeMuted'),
      getSenders: jasmine.createSpy('CastReceiverManager.getSenders'),
      getSystemVolume: function() { return { level: 1, muted: false }; },
      getCastMessageBus: function() { return mockMessageBus; }
    };
  }

  function createMockMessageBus() {
    var bus = {
      messages: [],
      broadcast: jasmine.createSpy('CastMessageBus.broadcast'),
      getCastChannel: jasmine.createSpy('CastMessageBus.getCastChannel')
    };
    // For convenience, deserialize and store sent messages.
    bus.broadcast.and.callFake(function(message) {
      bus.messages.push(CastUtils.deserialize(message));
    });
    var channel = {
      messages: [],
      send: function(message) {
        channel.messages.push(CastUtils.deserialize(message));
      }
    };
    bus.getCastChannel.and.returnValue(channel);
    return bus;
  }

  function createMockVideo() {
    var video = {
      play: jasmine.createSpy('play'),
      pause: jasmine.createSpy('pause'),
      addEventListener: function(eventName, listener) {
        video.listeners[eventName] = listener;
      },
      // For convenience:
      listeners: {}
    };
    return video;
  }

  function createMockPlayer() {
    var player = {
      getConfiguration: jasmine.createSpy('getConfiguration'),
      getManifestUri: jasmine.createSpy('getManifestUri'),
      getPlaybackRate: jasmine.createSpy('getPlaybackRate'),
      getTracks: jasmine.createSpy('getTracks'),
      getStats: jasmine.createSpy('getStats'),
      isBuffering: jasmine.createSpy('isBuffering'),
      isLive: jasmine.createSpy('isLive'),
      isTextTrackVisible: jasmine.createSpy('isTextTrackVisible'),
      seekRange: jasmine.createSpy('seekRange'),
      configure: jasmine.createSpy('configure'),
      setTextTrackVisibility: jasmine.createSpy('setTextTrackVisibility'),
      setMaxHardwareResolution: jasmine.createSpy('setMaxHardwareResolution'),
      load: jasmine.createSpy('load'),
      destroy: jasmine.createSpy('destroy'),
      addEventListener: function(eventName, listener) {
        player.listeners[eventName] = listener;
      },
      dispatchEvent: jasmine.createSpy('dispatchEvent'),
      // For convenience:
      listeners: {}
    };
    player.destroy.and.returnValue(Promise.resolve());
    player.load.and.returnValue(Promise.resolve());
    return player;
  }

  /**
   * @param {number} num
   */
  function fakeConnectedSenders(num) {
    var senderArray = [];
    while (num--) {
      senderArray.push('senderId');
    }

    mockReceiverManager.getSenders.and.returnValue(senderArray);
    mockReceiverManager.onSenderConnected();
  }

  /**
   * @param {?} message
   * @param {string=} opt_senderId
   */
  function fakeIncomingMessage(message, opt_senderId) {
    var serialized = CastUtils.serialize(message);
    var messageEvent = {
      senderId: opt_senderId,
      data: serialized
    };
    mockMessageBus.onMessage(messageEvent);
  }
});
