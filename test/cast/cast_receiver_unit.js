/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// The receiver is only meant to run on the Chromecast, so we have the
// ability to use modern APIs there that may not be available on all of the
// browsers our library supports.  Because of this, CastReceiver tests will
// only be run on Chrome and Chromecast.
/** @return {boolean} */
const castReceiverSupport =
    () => shaka.util.Platform.isChrome() || shaka.util.Platform.isChromecast();
filterDescribe('CastReceiver', castReceiverSupport, () => {
  const CastReceiver = shaka.cast.CastReceiver;
  const CastUtils = shaka.cast.CastUtils;
  const Util = shaka.test.Util;

  const originalCast = window['cast'];
  const originalUserAgent = navigator.userAgent;
  const originalPollInterval = CastReceiver.POLL_INTERVAL;
  const originalIdleInterval = CastReceiver.IDLE_INTERVAL;

  /** @type {!shaka.test.FakeVideo} */
  let mockVideo;
  /** @type {!jasmine.Spy} */
  let mockAppDataCallback;
  let mockPlayer;
  let mockReceiverManager;

  let mockReceiverApi;
  let mockShakaMessageBus;
  let mockGenericMessageBus;
  /** @type {!jasmine.Spy} */
  let mockCanDisplayType;

  /** @type {shaka.cast.CastReceiver} */
  let receiver;

  beforeAll(() => {
    // In uncompiled mode, there is a UA check for Chromecast in order to make
    // manual testing easier.  For these automated tests, we want to act as if
    // we are running on the Chromecast, even in Chrome.
    // Since we can't write to window.navigator or navigator.userAgent, we use
    // Object.defineProperty.
    Object.defineProperty(window['navigator'],
        'userAgent', {value: 'CrKey', configurable: true});

    CastReceiver.POLL_INTERVAL = 0.001;
    CastReceiver.IDLE_INTERVAL = 0.001;
  });

  beforeEach(() => {
    mockReceiverApi = createMockReceiverApi();
    mockCanDisplayType = jasmine.createSpy('canDisplayType');
    mockCanDisplayType.and.returnValue(false);

    // We're using quotes to access window.cast because the compiler
    // knows about lots of Cast-specific APIs we aren't mocking.  We
    // don't need this mock strictly type-checked.
    window['cast'] = {
      receiver: mockReceiverApi,
      __platform__: {canDisplayType: mockCanDisplayType},
    };

    mockReceiverManager = createMockReceiverManager();
    mockShakaMessageBus = createMockMessageBus();
    mockGenericMessageBus = createMockMessageBus();
    mockVideo = new shaka.test.FakeVideo();
    mockPlayer = createMockPlayer();
    mockAppDataCallback = jasmine.createSpy('appDataCallback');
  });

  afterEach(async () => {
    if (receiver) {
      await receiver.destroy();
    }
  });

  afterAll(() => {
    if (originalUserAgent) {
      window['cast'] = originalCast;
      Object.defineProperty(window['navigator'],
          'userAgent', {value: originalUserAgent});
    }
    CastReceiver.POLL_INTERVAL = originalPollInterval;
    CastReceiver.IDLE_INTERVAL = originalIdleInterval;
  });

  describe('constructor', () => {
    it('starts the receiver manager', () => {
      receiver = new CastReceiver(
          mockVideo, mockPlayer, Util.spyFunc(mockAppDataCallback));
      expect(mockReceiverManager.start).toHaveBeenCalled();
    });

    it('listens for video and player events', () => {
      receiver = new CastReceiver(
          mockVideo, mockPlayer, Util.spyFunc(mockAppDataCallback));
      expect(Object.keys(mockVideo.on).length).toBeGreaterThan(0);
      expect(Object.keys(mockPlayer.listeners).length).toBeGreaterThan(0);
    });

    it('limits streams to 1080p on Chromecast v1 and v2', () => {
      // Simulate the canDisplayType reponse of Chromecast v1 or v2
      mockCanDisplayType.and.callFake((type) => {
        const matches = /height=(\d+)/.exec(type);
        const height = matches[1];
        if (height && height > 1080) {
          return false;
        }
        return true;
      });
      receiver = new CastReceiver(
          mockVideo, mockPlayer, Util.spyFunc(mockAppDataCallback));
      expect(mockCanDisplayType).toHaveBeenCalled();
      expect(mockPlayer.setMaxHardwareResolution)
          .toHaveBeenCalledWith(1920, 1080);
    });

    it('limits streams to 4k on Chromecast Ultra', () => {
      // Simulate the canDisplayType reponse of Chromecast Ultra
      mockCanDisplayType.and.callFake((type) => {
        const matches = /height=(\d+)/.exec(type);
        const height = matches[1];
        if (height && height > 2160) {
          return false;
        }
        return true;
      });
      receiver = new CastReceiver(
          mockVideo, mockPlayer, Util.spyFunc(mockAppDataCallback));
      expect(mockCanDisplayType).toHaveBeenCalled();
      expect(mockPlayer.setMaxHardwareResolution)
          .toHaveBeenCalledWith(3840, 2160);
    });

    it('does not start polling', () => {
      receiver = new CastReceiver(
          mockVideo, mockPlayer, Util.spyFunc(mockAppDataCallback));
      expect(mockPlayer.getConfiguration).not.toHaveBeenCalled();
      expect(mockShakaMessageBus.messages.length).toBe(0);
    });
  });

  describe('isConnected', () => {
    beforeEach(() => {
      receiver = new CastReceiver(
          mockVideo, mockPlayer, Util.spyFunc(mockAppDataCallback));
    });

    it('is true when there are senders', () => {
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

  describe('"caststatuschanged" event', () => {
    beforeEach(() => {
      receiver = new CastReceiver(
          mockVideo, mockPlayer, Util.spyFunc(mockAppDataCallback));
    });

    it('triggers when senders connect or disconnect', async () => {
      /** @type {!jasmine.Spy} */
      const listener = jasmine.createSpy('listener');
      receiver.addEventListener('caststatuschanged', Util.spyFunc(listener));

      await shaka.test.Util.shortDelay();
      expect(listener).not.toHaveBeenCalled();
      fakeConnectedSenders(1);
      await shaka.test.Util.shortDelay();

      expect(listener).toHaveBeenCalled();
      listener.calls.reset();
      mockReceiverManager.onSenderDisconnected();
      await shaka.test.Util.shortDelay();

      expect(listener).toHaveBeenCalled();
    });

    it('triggers when idle state changes', async () => {
      /** @type {!jasmine.Spy} */
      const listener = jasmine.createSpy('listener');
      receiver.addEventListener('caststatuschanged', Util.spyFunc(listener));

      const fakeLoadingEvent = {type: 'loading'};
      const fakeUnloadingEvent = {type: 'unloading'};
      const fakeEndedEvent = {type: 'ended'};
      const fakePlayingEvent = {type: 'playing'};

      await shaka.test.Util.shortDelay();
      expect(listener).not.toHaveBeenCalled();
      expect(receiver.isIdle()).toBe(true);

      mockPlayer.listeners['loading'](fakeLoadingEvent);
      await shaka.test.Util.shortDelay();

      expect(listener).toHaveBeenCalled();
      expect(receiver.isIdle()).toBe(false);
      listener.calls.reset();

      mockPlayer.listeners['unloading'](fakeUnloadingEvent);
      await shaka.test.Util.shortDelay();

      expect(listener).toHaveBeenCalled();
      expect(receiver.isIdle()).toBe(true);
      listener.calls.reset();

      mockVideo.ended = true;
      mockVideo.on['ended'](fakeEndedEvent);
      await shaka.test.Util.shortDelay();

      expect(listener).toHaveBeenCalled();
      listener.calls.reset();
      expect(receiver.isIdle()).toBe(true);

      mockVideo.ended = false;
      mockVideo.on['playing'](fakePlayingEvent);
      await Promise.resolve();

      expect(listener).toHaveBeenCalled();
      expect(receiver.isIdle()).toBe(false);
    });
  });

  describe('local events', () => {
    beforeEach(() => {
      receiver = new CastReceiver(
          mockVideo, mockPlayer, Util.spyFunc(mockAppDataCallback));
    });

    it('trigger "update" and "event" messages', () => {
      fakeConnectedSenders(1);

      // No messages yet.
      expect(mockShakaMessageBus.messages).toEqual([]);
      const fakeEvent = {type: 'timeupdate'};
      mockVideo.on['timeupdate'](fakeEvent);

      // There are now "update" and "event" messages, in that order.
      expect(mockShakaMessageBus.messages).toEqual([
        {
          type: 'update',
          update: jasmine.any(Object),
        },
        {
          type: 'event',
          targetName: 'video',
          event: jasmine.objectContaining(fakeEvent),
        },
      ]);
    });
  });

  describe('"init" message', () => {
    /** @const */
    const fakeConfig = {key: 'value'};
    /** @const */
    const fakeAppData = {myFakeAppData: 1234};
    let fakeInitState;

    beforeEach(() => {
      receiver = new CastReceiver(
          mockVideo, mockPlayer, Util.spyFunc(mockAppDataCallback));

      fakeInitState = {
        player: {
          configure: fakeConfig,
        },
        playerAfterLoad: {
          setTextTrackVisibility: true,
        },
        video: {
          loop: true,
          playbackRate: 5,
        },
      };
    });

    it('sets initial state', async () => {
      expect(mockVideo.loop).toBe(false);
      expect(mockVideo.playbackRate).toBe(1);
      expect(mockPlayer.configure).not.toHaveBeenCalled();

      fakeIncomingMessage({
        type: 'init',
        initState: fakeInitState,
        appData: fakeAppData,
      }, mockShakaMessageBus);

      // Initial Player state first:
      expect(mockPlayer.configure).toHaveBeenCalledWith(fakeConfig);
      // App data next:
      expect(mockAppDataCallback).toHaveBeenCalledWith(fakeAppData);
      // Nothing else yet:
      expect(mockPlayer.setTextTrackVisibility).not.toHaveBeenCalled();
      expect(mockVideo.loop).toBe(false);
      expect(mockVideo.playbackRate).toBe(1);

      // The rest is done async:
      await shaka.test.Util.shortDelay();
      expect(mockPlayer.setTextTrackVisibility).toHaveBeenCalledWith(
          fakeInitState['playerAfterLoad'].setTextTrackVisibility);
      expect(mockVideo.loop).toBe(fakeInitState.video.loop);
      expect(mockVideo.playbackRate).toBe(fakeInitState.video.playbackRate);
    });

    it('starts polling', () => {
      const fakeConfig = {key: 'value'};
      mockPlayer.getConfiguration.and.returnValue(fakeConfig);

      fakeConnectedSenders(1);

      mockPlayer.getConfiguration.calls.reset();

      expect(mockShakaMessageBus.messages.length).toBe(0);
      fakeIncomingMessage({
        type: 'init',
        initState: fakeInitState,
        appData: fakeAppData,
      }, mockShakaMessageBus);

      expect(mockPlayer.getConfiguration).toHaveBeenCalled();
      expect(mockShakaMessageBus.messages).toContain(jasmine.objectContaining({
        type: 'update',
        update: jasmine.objectContaining({
          player: jasmine.objectContaining({
            getConfiguration: fakeConfig,
          }),
        }),
      }));
    });

    it('doesn\'t poll live methods while loading a VOD', () => {
      mockPlayer.getConfiguration.and.returnValue({key: 'value'});
      mockPlayer.isLive.and.returnValue(false);

      fakeConnectedSenders(1);

      expect(mockShakaMessageBus.messages.length).toBe(0);
      fakeIncomingMessage({
        type: 'init',
        initState: fakeInitState,
        appData: fakeAppData,
      }, mockShakaMessageBus);

      expect(mockPlayer.getPlayheadTimeAsDate).not.toHaveBeenCalled();
    });

    it('does poll live methods while loading a livestream', () => {
      mockPlayer.getConfiguration.and.returnValue({key: 'value'});
      mockPlayer.isLive.and.returnValue(true);

      fakeConnectedSenders(1);

      expect(mockShakaMessageBus.messages.length).toBe(0);
      fakeIncomingMessage({
        type: 'init',
        initState: fakeInitState,
        appData: fakeAppData,
      }, mockShakaMessageBus);

      expect(mockPlayer.getPlayheadTimeAsDate).toHaveBeenCalled();
    });

    it('loads the manifest', () => {
      fakeInitState.startTime = 12;
      fakeInitState.manifest = 'foo://bar';
      expect(mockPlayer.load).not.toHaveBeenCalled();

      fakeIncomingMessage({
        type: 'init',
        initState: fakeInitState,
        appData: fakeAppData,
      }, mockShakaMessageBus);

      expect(mockPlayer.load).toHaveBeenCalledWith('foo://bar', 12);
    });

    it('plays the video after loading', async () => {
      fakeInitState.manifest = 'foo://bar';
      mockVideo.autoplay = true;

      fakeIncomingMessage({
        type: 'init',
        initState: fakeInitState,
        appData: fakeAppData,
      }, mockShakaMessageBus);

      // Video autoplay inhibited:
      expect(mockVideo.autoplay).toBe(false);
      await shaka.test.Util.shortDelay();
      expect(mockVideo.play).toHaveBeenCalled();
      // Video autoplay restored:
      expect(mockVideo.autoplay).toBe(true);
    });

    it('does not load or play without a manifest URI', async () => {
      fakeInitState.manifest = null;

      fakeIncomingMessage({
        type: 'init',
        initState: fakeInitState,
        appData: fakeAppData,
      }, mockShakaMessageBus);

      await shaka.test.Util.shortDelay();
      // Nothing loaded or played:
      expect(mockPlayer.load).not.toHaveBeenCalled();
      expect(mockVideo.play).not.toHaveBeenCalled();

      // State was still transferred, though:
      expect(mockPlayer.setTextTrackVisibility).toHaveBeenCalledWith(
          fakeInitState['playerAfterLoad'].setTextTrackVisibility);
      expect(mockVideo.loop).toBe(fakeInitState.video.loop);
      expect(mockVideo.playbackRate).toBe(fakeInitState.video.playbackRate);
    });

    it('triggers an "error" event if load fails', async () => {
      fakeInitState.manifest = 'foo://bar';
      const fakeError = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.UNABLE_TO_GUESS_MANIFEST_TYPE);
      mockPlayer.load.and.returnValue(Promise.reject(fakeError));

      const listener = jasmine.createSpy('listener');
      mockPlayer.addEventListener('error', listener);
      expect(listener).not.toHaveBeenCalled();

      fakeIncomingMessage({
        type: 'init',
        initState: fakeInitState,
        appData: fakeAppData,
      }, mockShakaMessageBus);

      await shaka.test.Util.shortDelay();
      expect(mockPlayer.load).toHaveBeenCalled();
      expect(mockPlayer.dispatchEvent).toHaveBeenCalledWith(
          jasmine.objectContaining({type: 'error', detail: fakeError}));
    });
  });

  describe('"appData" message', () => {
    beforeEach(() => {
      receiver = new CastReceiver(
          mockVideo, mockPlayer, Util.spyFunc(mockAppDataCallback));
    });

    it('triggers the app data callback', () => {
      expect(mockAppDataCallback).not.toHaveBeenCalled();

      const fakeAppData = {myFakeAppData: 1234};
      fakeIncomingMessage({
        type: 'appData',
        appData: fakeAppData,
      }, mockShakaMessageBus);

      expect(mockAppDataCallback).toHaveBeenCalledWith(fakeAppData);
    });
  });

  describe('"set" message', () => {
    beforeEach(() => {
      receiver = new CastReceiver(
          mockVideo, mockPlayer, Util.spyFunc(mockAppDataCallback));
    });

    it('sets local properties', () => {
      expect(mockVideo.currentTime).toBe(0);
      fakeIncomingMessage({
        type: 'set',
        targetName: 'video',
        property: 'currentTime',
        value: 12,
      }, mockShakaMessageBus);
      expect(mockVideo.currentTime).toBe(12);

      expect(mockPlayer['arbitraryName']).toBe(undefined);
      fakeIncomingMessage({
        type: 'set',
        targetName: 'player',
        property: 'arbitraryName',
        value: 'arbitraryValue',
      }, mockShakaMessageBus);
      expect(mockPlayer['arbitraryName']).toBe('arbitraryValue');
    });

    it('routes volume properties to the receiver manager', () => {
      expect(mockVideo.volume).toBe(1);
      expect(mockVideo.muted).toBe(false);
      expect(mockReceiverManager.setSystemVolumeLevel).not.toHaveBeenCalled();
      expect(mockReceiverManager.setSystemVolumeMuted).not.toHaveBeenCalled();

      fakeIncomingMessage({
        type: 'set',
        targetName: 'video',
        property: 'volume',
        value: 0.5,
      }, mockShakaMessageBus);
      fakeIncomingMessage({
        type: 'set',
        targetName: 'video',
        property: 'muted',
        value: true,
      }, mockShakaMessageBus);

      expect(mockVideo.volume).toBe(1);
      expect(mockVideo.muted).toBe(false);
      expect(mockReceiverManager.setSystemVolumeLevel)
          .toHaveBeenCalledWith(0.5);
      expect(mockReceiverManager.setSystemVolumeMuted)
          .toHaveBeenCalledWith(true);
    });
  });

  describe('"call" message', () => {
    beforeEach(() => {
      receiver = new CastReceiver(
          mockVideo, mockPlayer, Util.spyFunc(mockAppDataCallback));
    });

    it('calls local methods', () => {
      expect(mockVideo.play).not.toHaveBeenCalled();
      fakeIncomingMessage({
        type: 'call',
        targetName: 'video',
        methodName: 'play',
        args: [1, 2, 3],
      }, mockShakaMessageBus);
      expect(mockVideo.play).toHaveBeenCalledWith(1, 2, 3);

      expect(mockPlayer.configure).not.toHaveBeenCalled();
      fakeIncomingMessage({
        type: 'call',
        targetName: 'player',
        methodName: 'configure',
        args: [42],
      }, mockShakaMessageBus);
      expect(mockPlayer.configure).toHaveBeenCalledWith(42);
    });
  });

  describe('"asyncCall" message', () => {
    /** @const */
    const fakeSenderId = 'senderId';
    /** @const */
    const fakeCallId = '5';
    /** @type {!shaka.util.PublicPromise} */
    let p;

    beforeEach(() => {
      receiver = new CastReceiver(
          mockVideo, mockPlayer, Util.spyFunc(mockAppDataCallback));

      fakeConnectedSenders(1);
      p = new shaka.util.PublicPromise();
      mockPlayer.load.and.returnValue(p);

      expect(mockPlayer.load).not.toHaveBeenCalled();
      fakeIncomingMessage({
        type: 'asyncCall',
        id: fakeCallId,
        targetName: 'player',
        methodName: 'load',
        args: ['foo://bar', 12],
      }, mockShakaMessageBus, fakeSenderId);
    });

    it('calls local async methods', () => {
      expect(mockPlayer.load).toHaveBeenCalledWith('foo://bar', 12);
      p.resolve();
    });

    it('sends "asyncComplete" replies when resolved', async () => {
      // No messages have been sent, either broadcast  or privately.
      expect(mockShakaMessageBus.broadcast).not.toHaveBeenCalled();
      expect(mockShakaMessageBus.getCastChannel).not.toHaveBeenCalled();

      p.resolve();
      await shaka.test.Util.shortDelay();
      // No broadcast messages have been sent, but a private message has
      // been sent to the sender who started the async call.
      expect(mockShakaMessageBus.broadcast).not.toHaveBeenCalled();
      expect(mockShakaMessageBus.getCastChannel).toHaveBeenCalledWith(
          fakeSenderId);
      const senderChannel = mockShakaMessageBus.getCastChannel();
      expect(senderChannel.messages).toEqual([{
        type: 'asyncComplete',
        id: fakeCallId,
        error: null,
      }]);
    });

    it('sends "asyncComplete" replies when rejected', async () => {
      // No messages have been sent, either broadcast  or privately.
      expect(mockShakaMessageBus.broadcast).not.toHaveBeenCalled();
      expect(mockShakaMessageBus.getCastChannel).not.toHaveBeenCalled();

      const fakeError = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.UNABLE_TO_GUESS_MANIFEST_TYPE);
      p.reject(fakeError);
      await shaka.test.Util.shortDelay();
      // No broadcast messages have been sent, but a private message has
      // been sent to the sender who started the async call.
      expect(mockShakaMessageBus.broadcast).not.toHaveBeenCalled();
      expect(mockShakaMessageBus.getCastChannel).toHaveBeenCalledWith(
          fakeSenderId);
      const senderChannel = mockShakaMessageBus.getCastChannel();
      expect(senderChannel.messages).toEqual([{
        type: 'asyncComplete',
        id: fakeCallId,
        error: jasmine.any(Object),
      }]);
      if (senderChannel.messages.length) {
        const error = senderChannel.messages[0].error;
        shaka.test.Util.expectToEqualError(fakeError, error);
      }
    });
  });

  describe('sends duration', () => {
    beforeEach(async () => {
      receiver = new CastReceiver(
          mockVideo, mockPlayer, Util.spyFunc(mockAppDataCallback));
      fakeConnectedSenders(1);
      mockPlayer.load = () => {
        mockVideo.duration = 1;
        mockPlayer.getAssetUri = () => 'URI A';
        return Promise.resolve();
      };
      fakeIncomingMessage({
        type: 'init',
        initState: {manifest: 'URI A'},
        appData: {},
      }, mockShakaMessageBus);

      // The messages will show up asychronously:
      await Util.shortDelay();
      expectMediaInfo('URI A', 1);
      mockGenericMessageBus.messages = [];
    });

    it('only once, if nothing else changes', async () => {
      await Util.shortDelay();
      expect(mockGenericMessageBus.messages.length).toBe(0);
    });

    it('after new sender connects', async () => {
      fakeConnectedSenders(1);
      await Util.shortDelay();
      expectMediaInfo('URI A', 1);
      expect(mockGenericMessageBus.messages.length).toBe(0);
    });

    it('for correct manifest after loading new', async () => {
      // Change media information, but only after half a second.
      mockPlayer.load = async () => {
        await Util.shortDelay();
        mockVideo.duration = 2;
        mockPlayer.getAssetUri = () => 'URI B';
      };
      fakeIncomingMessage({
        type: 'asyncCall',
        id: '5',
        targetName: 'player',
        methodName: 'load',
        args: ['URI B'],
      }, mockShakaMessageBus, 'senderId');

      // Wait for the mockPlayer to finish 'loading' before checking again.
      await Util.shortDelay();
      await Util.shortDelay();  // Delay again for the delay in "load" above.
      expectMediaInfo('URI B', 2); // pollAttributes_
      expect(mockGenericMessageBus.messages.length).toBe(0);
    });

    it('after LOAD system message', async () => {
      mockPlayer.load = () => {
        mockVideo.duration = 2;
        mockPlayer.getAssetUri = () => 'URI B';
        return Promise.resolve();
      };
      const message = {
        // Arbitrary number
        'requestId': 0,
        'type': 'LOAD',
        'autoplay': false,
        'currentTime': 10,
        'media': {
          'contentId': 'URI B',
          'contentType': 'video/mp4',
          'streamType': 'BUFFERED',
        },
      };
      fakeIncomingMessage(message, mockGenericMessageBus);

      await Util.shortDelay();
      expectMediaInfo('URI B', 2);
      expect(mockGenericMessageBus.messages.length).toBe(0);
    });

    function expectMediaInfo(expectedUri, expectedDuration) {
      expect(mockGenericMessageBus.messages.length).toBeGreaterThan(0);
      if (mockGenericMessageBus.messages.length == 0) {
        return;
      }
      expect(mockGenericMessageBus.messages[0]).toEqual(
          {
            requestId: 0,
            type: 'MEDIA_STATUS',
            status: [jasmine.objectContaining({
              media: {
                contentId: expectedUri,
                streamType: 'BUFFERED',
                duration: expectedDuration,
                contentType: '',
              },
            })],
          }
      );
      mockGenericMessageBus.messages.shift();
    }
  });

  describe('respects generic control messages', () => {
    beforeEach(() => {
      receiver = new CastReceiver(
          mockVideo, mockPlayer, Util.spyFunc(mockAppDataCallback));
      fakeConnectedSenders(1);
    });

    it('get status', () => {
      const message = {
        // Arbitrary number
        'requestId': 0,
        'type': 'GET_STATUS',
      };

      mockGenericMessageBus.broadcast.calls.reset();
      fakeIncomingMessage(message, mockGenericMessageBus);
      expect(mockGenericMessageBus.broadcast).toHaveBeenCalledTimes(1);
      expect(mockGenericMessageBus.broadcast.calls.argsFor(0)[0].includes(
          '"requestId":0,"type":"MEDIA_STATUS"')).toBe(true);
    });

    it('play', () => {
      const message = {
        // Arbitrary number
        'requestId': 0,
        'type': 'PLAY',
      };

      fakeIncomingMessage(message, mockGenericMessageBus);
      expect(mockVideo.play).toHaveBeenCalled();
    });

    it('pause', () => {
      const message = {
        // Arbitrary number
        'requestId': 0,
        'type': 'PAUSE',
      };

      fakeIncomingMessage(message, mockGenericMessageBus);
      expect(mockVideo.pause).toHaveBeenCalled();
    });

    it('seek', () => {
      const message = {
        // Arbitrary number
        'requestId': 0,
        'type': 'SEEK',
        'resumeState': 'PLAYBACK_START',
        'currentTime': 10,
      };

      fakeIncomingMessage(message, mockGenericMessageBus);
      expect(mockVideo.play).toHaveBeenCalled();
      expect(mockVideo.currentTime).toBe(10);
    });

    it('stop', () => {
      const message = {
        // Arbitrary number
        'requestId': 0,
        'type': 'STOP',
      };

      fakeIncomingMessage(message, mockGenericMessageBus);
      expect(mockPlayer.unload).toHaveBeenCalled();
    });

    it('volume', () => {
      const message = {
        // Arbitrary number
        'requestId': 0,
        'type': 'VOLUME',
        'volume': {
          'level': 0.5,
          'muted': true,
        },
      };

      fakeIncomingMessage(message, mockGenericMessageBus);
      expect(mockVideo.volume).toBe(0.5);
      expect(mockVideo.muted).toBe(true);
    });

    it('load', () => {
      const message = {
        // Arbitrary number
        'requestId': 0,
        'type': 'LOAD',
        'autoplay': false,
        'currentTime': 10,
        'media': {
          'contentId': 'manifestUri',
          'contentType': 'video/mp4',
          'streamType': 'BUFFERED',
        },
      };

      fakeIncomingMessage(message, mockGenericMessageBus);
      expect(mockPlayer.load).toHaveBeenCalled();
    });

    it('dispatches error on unrecognized request type', () => {
      const message = {
        // Arbitrary number
        'requestId': 0,
        'type': 'UNKNOWN_TYPE',
      };

      mockGenericMessageBus.broadcast.calls.reset();
      fakeIncomingMessage(message, mockGenericMessageBus);
      expect(mockGenericMessageBus.broadcast).toHaveBeenCalledTimes(1);
      expect(mockGenericMessageBus.broadcast.calls.argsFor(0)[0].includes(
          '"requestId":0,' +
          '"type":"INVALID_REQUEST",' +
          '"reason":"INVALID_COMMAND"'))
          .toBe(true);
    });
  });

  describe('destroy', () => {
    beforeEach(() => {
      receiver = new CastReceiver(
          mockVideo, mockPlayer, Util.spyFunc(mockAppDataCallback));
    });

    it('destroys the local player', async () => {
      expect(mockPlayer.destroy).not.toHaveBeenCalled();
      await receiver.destroy();
      expect(mockPlayer.destroy).toHaveBeenCalled();
    });

    it('stops polling', async () => {
      // Start polling:
      fakeIncomingMessage({
        type: 'init',
        initState: {},
        appData: {},
      }, mockShakaMessageBus);

      mockPlayer.getConfiguration.calls.reset();
      await shaka.test.Util.shortDelay();
      // We have polled at least once, so this getter has been called.
      expect(mockPlayer.getConfiguration).toHaveBeenCalled();
      mockPlayer.getConfiguration.calls.reset();
      // Destroy the receiver.
      await receiver.destroy();

      // Wait another second.
      await shaka.test.Util.shortDelay();

      // We have not polled again since destruction.
      expect(mockPlayer.getConfiguration).not.toHaveBeenCalled();
    });

    it('stops the receiver manager', async () => {
      expect(mockReceiverManager.stop).not.toHaveBeenCalled();
      await receiver.destroy();
      expect(mockReceiverManager.stop).toHaveBeenCalled();
    });
  });

  function createMockReceiverApi() {
    return {
      CastReceiverManager: {
        getInstance: () => mockReceiverManager,
      },
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
      getSystemVolume: () => ({level: 1, muted: false}),
      getCastMessageBus: (namespace) => {
        if (namespace == shaka.cast.CastUtils.SHAKA_MESSAGE_NAMESPACE) {
          return mockShakaMessageBus;
        }

        return mockGenericMessageBus;
      },
    };
  }

  function createMockMessageBus() {
    const bus = {
      messages: [],
      broadcast: jasmine.createSpy('CastMessageBus.broadcast'),
      getCastChannel: jasmine.createSpy('CastMessageBus.getCastChannel'),
    };
    // For convenience, deserialize and store sent messages.
    bus.broadcast.and.callFake((message) => {
      bus.messages.push(CastUtils.deserialize(message));
    });
    const channel = {
      messages: [],
      send: (message) => {
        channel.messages.push(CastUtils.deserialize(message));
      },
    };
    bus.getCastChannel.and.returnValue(channel);
    return bus;
  }

  function createMockPlayer() {
    const player = {
      destroy: jasmine.createSpy('destroy').and.returnValue(Promise.resolve()),
      setMaxHardwareResolution: jasmine.createSpy('setMaxHardwareResolution'),

      addEventListener: (eventName, listener) => {
        player.listeners[eventName] = listener;
      },
      removeEventListener: (eventName, listener) => {
        player.listeners[eventName] = null;
      },
      dispatchEvent: jasmine.createSpy('dispatchEvent'),
      // For convenience:
      listeners: {},
    };

    for (const name of CastUtils.PlayerVoidMethods) {
      player[name] = jasmine.createSpy(name);
    }
    for (const name in CastUtils.PlayerGetterMethods) {
      player[name] = jasmine.createSpy(name);
    }
    for (const name in CastUtils.PlayerGetterMethodsThatRequireLive) {
      player[name] = jasmine.createSpy(name);
    }
    for (const name of CastUtils.PlayerPromiseMethods) {
      player[name] = jasmine.createSpy(name).and.returnValue(Promise.resolve());
    }

    return player;
  }

  /**
   * @param {number} num
   */
  function fakeConnectedSenders(num) {
    const senderArray = [];
    while (num--) {
      senderArray.push('senderId');
    }

    mockReceiverManager.getSenders.and.returnValue(senderArray);
    mockReceiverManager.onSenderConnected();
  }

  /**
   * @param {?} message
   * @param {!Object} bus
   * @param {string=} senderId
   */
  function fakeIncomingMessage(message, bus, senderId) {
    const serialized = CastUtils.serialize(message);
    const messageEvent = {
      senderId: senderId,
      data: serialized,
    };
    bus.onMessage(messageEvent);
  }
});
