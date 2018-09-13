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
  const CastReceiver = shaka.cast.CastReceiver;
  const CastUtils = shaka.cast.CastUtils;
  const Util = shaka.test.Util;

  const originalCast = window['cast'];
  const originalUserAgent = navigator.userAgent;

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

  /** @type {boolean} */
  let isChrome;
  /** @type {boolean} */
  let isChromecast;

  /**
   * Before running the test, check if this is Chrome or Chromecast.
   * @param {function(function()=)} test
   * @return {function(function())}
   */
  function checkAndRun(test) {
   let check = function(done) {
     if (!isChromecast && !isChrome) {
       pending(
           'Skipping CastReceiver tests for non-Chrome and non-Chromecast');
     } else {
       test(done);
     }
   };
   // Account for tests with a done argument, and tests without.
   if (test.length == 1) {
     return (done) => check(done);
   }
   return () => check(undefined);
  }

  beforeAll(function() {
    // The receiver is only meant to run on the Chromecast, so we have the
    // ability to use modern APIs there that may not be available on all of the
    // browsers our library supports.  Because of this, CastReceiver tests will
    // only be run on Chrome and Chromecast.
    isChromecast = navigator.userAgent.includes('CrKey');
    let isEdge = navigator.userAgent.includes('Edge/');
    // Edge also has "Chrome/" in its user agent string.
    isChrome = navigator.userAgent.includes('Chrome/') && !isEdge;

    // Don't do any more work here if the tests will not end up running.
    if (!isChromecast && !isChrome) return;

    // In uncompiled mode, there is a UA check for Chromecast in order to make
    // manual testing easier.  For these automated tests, we want to act as if
    // we are running on the Chromecast, even in Chrome.
    // Since we can't write to window.navigator or navigator.userAgent, we use
    // Object.defineProperty.
    Object.defineProperty(window['navigator'],
                          'userAgent', {value: 'CrKey', configurable: true});
  });

  beforeEach(checkAndRun(() => {
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
  }));

  afterEach(function(done) {
    if (receiver) {
      receiver.destroy().catch(fail).then(done);
    } else {
      done();
    }
  });

  afterAll(function() {
    if (originalUserAgent) {
      window['cast'] = originalCast;
      Object.defineProperty(window['navigator'],
                            'userAgent', {value: originalUserAgent});
    }
  });

  describe('constructor', function() {
    it('starts the receiver manager', checkAndRun(() => {
      receiver = new CastReceiver(
          mockVideo, mockPlayer, Util.spyFunc(mockAppDataCallback));
      expect(mockReceiverManager.start).toHaveBeenCalled();
    }));

    it('listens for video and player events', checkAndRun(() => {
      receiver = new CastReceiver(
          mockVideo, mockPlayer, Util.spyFunc(mockAppDataCallback));
      expect(Object.keys(mockVideo.on).length).toBeGreaterThan(0);
      expect(Object.keys(mockPlayer.listeners).length).toBeGreaterThan(0);
    }));

    it('limits streams to 1080p on Chromecast v1 and v2', checkAndRun(() => {
      // Simulate the canDisplayType reponse of Chromecast v1 or v2
      mockCanDisplayType.and.callFake(function(type) {
        let matches = /height=(\d+)/.exec(type);
        let height = matches[1];
        if (height && height > 1080) return false;
        return true;
      });
      receiver = new CastReceiver(
          mockVideo, mockPlayer, Util.spyFunc(mockAppDataCallback));
      expect(mockCanDisplayType).toHaveBeenCalled();
      expect(mockPlayer.setMaxHardwareResolution).
          toHaveBeenCalledWith(1920, 1080);
    }));

    it('limits streams to 4k on Chromecast Ultra', checkAndRun(() => {
      // Simulate the canDisplayType reponse of Chromecast Ultra
      mockCanDisplayType.and.callFake(function(type) {
        let matches = /height=(\d+)/.exec(type);
        let height = matches[1];
        if (height && height > 2160) return false;
        return true;
      });
      receiver = new CastReceiver(
          mockVideo, mockPlayer, Util.spyFunc(mockAppDataCallback));
      expect(mockCanDisplayType).toHaveBeenCalled();
      expect(mockPlayer.setMaxHardwareResolution).
          toHaveBeenCalledWith(3840, 2160);
    }));

    it('does not start polling', checkAndRun(() => {
      receiver = new CastReceiver(
          mockVideo, mockPlayer, Util.spyFunc(mockAppDataCallback));
      expect(mockPlayer.getConfiguration).not.toHaveBeenCalled();
      expect(mockShakaMessageBus.messages.length).toBe(0);
    }));
  });

  describe('isConnected', function() {
    beforeEach(function() {
      receiver = new CastReceiver(
          mockVideo, mockPlayer, Util.spyFunc(mockAppDataCallback));
    });

    it('is true when there are senders', checkAndRun(() => {
      expect(receiver.isConnected()).toBe(false);
      fakeConnectedSenders(1);
      expect(receiver.isConnected()).toBe(true);
      fakeConnectedSenders(2);
      expect(receiver.isConnected()).toBe(true);
      fakeConnectedSenders(99);
      expect(receiver.isConnected()).toBe(true);
      fakeConnectedSenders(0);
      expect(receiver.isConnected()).toBe(false);
    }));
  });

  describe('"caststatuschanged" event', function() {
    beforeEach(function() {
      receiver = new CastReceiver(
          mockVideo, mockPlayer, Util.spyFunc(mockAppDataCallback));
    });

    it('triggers when senders connect or disconnect', checkAndRun((done) => {
      let listener = jasmine.createSpy('listener');
      receiver.addEventListener('caststatuschanged', Util.spyFunc(listener));

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
    }));

    it('triggers when idle state changes', checkAndRun((done) => {
      let listener = jasmine.createSpy('listener');
      receiver.addEventListener('caststatuschanged', Util.spyFunc(listener));

      let fakeLoadingEvent = {type: 'loading'};
      let fakeUnloadingEvent = {type: 'unloading'};
      let fakeEndedEvent = {type: 'ended'};
      let fakePlayingEvent = {type: 'playing'};

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
        mockVideo.on['ended'](fakeEndedEvent);
        return shaka.test.Util.delay(5.2);  // There is a long delay for 'ended'
      }).then(function() {
        expect(listener).toHaveBeenCalled();
        listener.calls.reset();
        expect(receiver.isIdle()).toBe(true);

        mockVideo.ended = false;
        mockVideo.on['playing'](fakePlayingEvent);
      }).then(function() {
        expect(listener).toHaveBeenCalled();
        expect(receiver.isIdle()).toBe(false);
      }).catch(fail).then(done);
    }));
  });

  describe('local events', function() {
    beforeEach(function() {
      receiver = new CastReceiver(
          mockVideo, mockPlayer, Util.spyFunc(mockAppDataCallback));
    });

    it('trigger "update" and "event" messages', checkAndRun(() => {
      fakeConnectedSenders(1);

      // No messages yet.
      expect(mockShakaMessageBus.messages).toEqual([]);
      let fakeEvent = {type: 'timeupdate'};
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
    }));
  });

  describe('"init" message', function() {
    /** @const */
    let fakeConfig = {key: 'value'};
    /** @const */
    let fakeAppData = {myFakeAppData: 1234};
    let fakeInitState;

    beforeEach(function() {
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

    it('sets initial state', checkAndRun((done) => {
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
      shaka.test.Util.delay(0.1).then(function() {
        expect(mockPlayer.setTextTrackVisibility).toHaveBeenCalledWith(
            fakeInitState['playerAfterLoad'].setTextTrackVisibility);
        expect(mockVideo.loop).toEqual(fakeInitState.video.loop);
        expect(mockVideo.playbackRate).toEqual(
            fakeInitState.video.playbackRate);
      }).catch(fail).then(done);
    }));

    it('starts polling', checkAndRun(() => {
      let fakeConfig = {key: 'value'};
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
    }));

    it('doesn\'t poll live methods while loading a VOD', checkAndRun(() => {
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
    }));

    it('does poll live methods while loading a livestream', checkAndRun(() => {
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
    }));

    it('loads the manifest', checkAndRun(() => {
      fakeInitState.startTime = 12;
      fakeInitState.manifest = 'foo://bar';
      expect(mockPlayer.load).not.toHaveBeenCalled();

      fakeIncomingMessage({
        type: 'init',
        initState: fakeInitState,
        appData: fakeAppData,
      }, mockShakaMessageBus);

      expect(mockPlayer.load).toHaveBeenCalledWith('foo://bar', 12);
    }));

    it('plays the video after loading', checkAndRun((done) => {
      fakeInitState.manifest = 'foo://bar';
      mockVideo.autoplay = true;

      fakeIncomingMessage({
        type: 'init',
        initState: fakeInitState,
        appData: fakeAppData,
      }, mockShakaMessageBus);

      // Video autoplay inhibited:
      expect(mockVideo.autoplay).toBe(false);
      shaka.test.Util.delay(0.1).then(function() {
        expect(mockVideo.play).toHaveBeenCalled();
        // Video autoplay restored:
        expect(mockVideo.autoplay).toBe(true);
      }).catch(fail).then(done);
    }));

    it('does not load or play without a manifest URI', checkAndRun((done) => {
      fakeInitState.manifest = null;

      fakeIncomingMessage({
        type: 'init',
        initState: fakeInitState,
        appData: fakeAppData,
      }, mockShakaMessageBus);

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
    }));

    it('triggers an "error" event if load fails', checkAndRun((done) => {
      fakeInitState.manifest = 'foo://bar';
      let fakeError = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.UNABLE_TO_GUESS_MANIFEST_TYPE);
      mockPlayer.load.and.returnValue(Promise.reject(fakeError));

      let listener = jasmine.createSpy('listener');
      mockPlayer.addEventListener('error', listener);
      expect(listener).not.toHaveBeenCalled();

      fakeIncomingMessage({
        type: 'init',
        initState: fakeInitState,
        appData: fakeAppData,
      }, mockShakaMessageBus);

      shaka.test.Util.delay(0.1).then(function() {
        expect(mockPlayer.load).toHaveBeenCalled();
        expect(mockPlayer.dispatchEvent).toHaveBeenCalledWith(
            jasmine.objectContaining({type: 'error', detail: fakeError}));
      }).catch(fail).then(done);
    }));
  });

  describe('"appData" message', function() {
    beforeEach(function() {
      receiver = new CastReceiver(
          mockVideo, mockPlayer, Util.spyFunc(mockAppDataCallback));
    });

    it('triggers the app data callback', checkAndRun(() => {
      expect(mockAppDataCallback).not.toHaveBeenCalled();

      let fakeAppData = {myFakeAppData: 1234};
      fakeIncomingMessage({
        type: 'appData',
        appData: fakeAppData,
      }, mockShakaMessageBus);

      expect(mockAppDataCallback).toHaveBeenCalledWith(fakeAppData);
    }));
  });

  describe('"set" message', function() {
    beforeEach(function() {
      receiver = new CastReceiver(
          mockVideo, mockPlayer, Util.spyFunc(mockAppDataCallback));
    });

    it('sets local properties', checkAndRun(() => {
      expect(mockVideo.currentTime).toBe(0);
      fakeIncomingMessage({
        type: 'set',
        targetName: 'video',
        property: 'currentTime',
        value: 12,
      }, mockShakaMessageBus);
      expect(mockVideo.currentTime).toEqual(12);

      expect(mockPlayer['arbitraryName']).toBe(undefined);
      fakeIncomingMessage({
        type: 'set',
        targetName: 'player',
        property: 'arbitraryName',
        value: 'arbitraryValue',
      }, mockShakaMessageBus);
      expect(mockPlayer['arbitraryName']).toEqual('arbitraryValue');
    }));

    it('routes volume properties to the receiver manager', checkAndRun(() => {
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
      expect(mockReceiverManager.setSystemVolumeLevel).
          toHaveBeenCalledWith(0.5);
      expect(mockReceiverManager.setSystemVolumeMuted).
          toHaveBeenCalledWith(true);
    }));
  });

  describe('"call" message', function() {
    beforeEach(function() {
      receiver = new CastReceiver(
          mockVideo, mockPlayer, Util.spyFunc(mockAppDataCallback));
    });

    it('calls local methods', checkAndRun(() => {
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
    }));
  });

  describe('"asyncCall" message', function() {
    /** @const */
    let fakeSenderId = 'senderId';
    /** @const */
    let fakeCallId = '5';
    /** @type {!shaka.util.PublicPromise} */
    let p;

    beforeEach(function() {
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

    it('calls local async methods', checkAndRun(() => {
      expect(mockPlayer.load).toHaveBeenCalledWith('foo://bar', 12);
      p.resolve();
    }));

    it('sends "asyncComplete" replies when resolved', checkAndRun((done) => {
      // No messages have been sent, either broadcast  or privately.
      expect(mockShakaMessageBus.broadcast).not.toHaveBeenCalled();
      expect(mockShakaMessageBus.getCastChannel).not.toHaveBeenCalled();

      p.resolve();
      shaka.test.Util.delay(0.1).then(function() {
        // No broadcast messages have been sent, but a private message has
        // been sent to the sender who started the async call.
        expect(mockShakaMessageBus.broadcast).not.toHaveBeenCalled();
        expect(mockShakaMessageBus.getCastChannel).toHaveBeenCalledWith(
            fakeSenderId);
        let senderChannel = mockShakaMessageBus.getCastChannel();
        expect(senderChannel.messages).toEqual([{
          type: 'asyncComplete',
          id: fakeCallId,
          error: null,
        }]);
      }).catch(fail).then(done);
    }));

    it('sends "asyncComplete" replies when rejected', checkAndRun((done) => {
      // No messages have been sent, either broadcast  or privately.
      expect(mockShakaMessageBus.broadcast).not.toHaveBeenCalled();
      expect(mockShakaMessageBus.getCastChannel).not.toHaveBeenCalled();

      let fakeError = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.UNABLE_TO_GUESS_MANIFEST_TYPE);
      p.reject(fakeError);
      shaka.test.Util.delay(0.1).then(function() {
        // No broadcast messages have been sent, but a private message has
        // been sent to the sender who started the async call.
        expect(mockShakaMessageBus.broadcast).not.toHaveBeenCalled();
        expect(mockShakaMessageBus.getCastChannel).toHaveBeenCalledWith(
            fakeSenderId);
        let senderChannel = mockShakaMessageBus.getCastChannel();
        expect(senderChannel.messages).toEqual([{
          type: 'asyncComplete',
          id: fakeCallId,
          error: jasmine.any(Object),
        }]);
        if (senderChannel.messages.length) {
          let error = senderChannel.messages[0].error;
          shaka.test.Util.expectToEqualError(fakeError, error);
        }
      }).catch(fail).then(done);
    }));
  });

  describe('sends duration', function() {
    beforeEach(checkAndRun((done) => {
      receiver = new CastReceiver(
          mockVideo, mockPlayer, Util.spyFunc(mockAppDataCallback));
      fakeConnectedSenders(1);
      mockPlayer.load = function() {
        mockVideo.duration = 1;
        mockPlayer.getAssetUri = function() {
          return 'URI A';
        };
        return Promise.resolve();
      };
      fakeIncomingMessage({
        type: 'init',
        initState: {manifest: 'URI A'},
        appData: {},
      }, mockShakaMessageBus);

      // The messages will show up asychronously:
      Util.delay(0.1).then(function() {
        expectMediaInfo('URI A', 1);
        mockGenericMessageBus.messages = [];
      }).then(done);
    }));

    it('only once, if nothing else changes', checkAndRun((done) => {
      Util.delay(0.5).then(function() {
        expect(mockGenericMessageBus.messages.length).toBe(0);
      }).then(done);
    }));

    it('after new sender connects', checkAndRun((done) => {
      fakeConnectedSenders(1);
      Util.delay(0.5).then(function() {
        expectMediaInfo('URI A', 1);
        expect(mockGenericMessageBus.messages.length).toBe(0);
      }).then(done);
    }));

    it('for correct manifest after loading new', checkAndRun((done) => {
      // Change media information, but only after half a second.
      mockPlayer.load = function() {
        return Util.delay(0.5).then(function() {
          mockVideo.duration = 2;
          mockPlayer.getAssetUri = function() {
            return 'URI B';
          };
        });
      };
      fakeIncomingMessage({
        type: 'asyncCall',
        id: '5',
        targetName: 'player',
        methodName: 'load',
        args: ['URI B'],
      }, mockShakaMessageBus, 'senderId');

      // Wait for the mockPlayer to finish 'loading' before checking again.
      Util.delay(1.0).then(function() {
        expectMediaInfo('URI B', 2); // pollAttributes_
        expect(mockGenericMessageBus.messages.length).toBe(0);
      }).then(done);
    }));

    it('after LOAD system message', checkAndRun((done) => {
      mockPlayer.load = function() {
        mockVideo.duration = 2;
        mockPlayer.getAssetUri = function() {
          return 'URI B';
        };
        return Promise.resolve();
      };
      let message = {
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

      Util.delay(0.5).then(function() {
        expectMediaInfo('URI B', 2);
        expect(mockGenericMessageBus.messages.length).toBe(0);
      }).then(done);
    }));

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

  describe('respects generic control messages', function() {
    beforeEach(function() {
      receiver = new CastReceiver(
          mockVideo, mockPlayer, Util.spyFunc(mockAppDataCallback));
      fakeConnectedSenders(1);
    });

    it('get status', checkAndRun(() => {
      let message = {
        // Arbitrary number
        'requestId': 0,
        'type': 'GET_STATUS',
      };

      fakeIncomingMessage(message, mockGenericMessageBus);
      expect(mockGenericMessageBus.broadcast.calls.count()).toEqual(1);
      expect(mockGenericMessageBus.broadcast.calls.argsFor(0)[0].includes(
          '"requestId":0,"type":"MEDIA_STATUS"')).toBe(true);
    }));

    it('play', checkAndRun(() => {
      let message = {
        // Arbitrary number
        'requestId': 0,
        'type': 'PLAY',
      };

      fakeIncomingMessage(message, mockGenericMessageBus);
      expect(mockVideo.play).toHaveBeenCalled();
    }));

    it('pause', checkAndRun(() => {
      let message = {
        // Arbitrary number
        'requestId': 0,
        'type': 'PAUSE',
      };

      fakeIncomingMessage(message, mockGenericMessageBus);
      expect(mockVideo.pause).toHaveBeenCalled();
    }));

    it('seek', checkAndRun(() => {
      let message = {
        // Arbitrary number
        'requestId': 0,
        'type': 'SEEK',
        'resumeState': 'PLAYBACK_START',
        'currentTime': 10,
      };

      fakeIncomingMessage(message, mockGenericMessageBus);
      expect(mockVideo.play).toHaveBeenCalled();
      expect(mockVideo.currentTime).toBe(10);
    }));

    it('stop', checkAndRun(() => {
      let message = {
        // Arbitrary number
        'requestId': 0,
        'type': 'STOP',
      };

      fakeIncomingMessage(message, mockGenericMessageBus);
      expect(mockPlayer.unload).toHaveBeenCalled();
    }));

    it('volume', checkAndRun(() => {
      let message = {
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
    }));

    it('load', checkAndRun(() => {
      let message = {
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
    }));

    it('dispatches error on unrecognized request type', checkAndRun(() => {
      let message = {
        // Arbitrary number
        'requestId': 0,
        'type': 'UNKNOWN_TYPE',
      };

      fakeIncomingMessage(message, mockGenericMessageBus);
      expect(mockGenericMessageBus.broadcast.calls.count()).toEqual(1);
      expect(mockGenericMessageBus.broadcast.calls.argsFor(0)[0].includes(
          '"requestId":0,' +
          '"type":"INVALID_REQUEST",' +
          '"reason":"INVALID_COMMAND"'))
          .toBe(true);
    }));
  });

  describe('destroy', function() {
    beforeEach(function() {
      receiver = new CastReceiver(
          mockVideo, mockPlayer, Util.spyFunc(mockAppDataCallback));
    });

    it('destroys the local player', checkAndRun((done) => {
      expect(mockPlayer.destroy).not.toHaveBeenCalled();
      receiver.destroy().then(function() {
        expect(mockPlayer.destroy).toHaveBeenCalled();
      }).catch(fail).then(done);
    }));

    it('stops polling', checkAndRun((done) => {
      // Start polling:
      fakeIncomingMessage({
        type: 'init',
        initState: {},
        appData: {},
      }, mockShakaMessageBus);

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
    }));

    it('stops the receiver manager', checkAndRun((done) => {
      expect(mockReceiverManager.stop).not.toHaveBeenCalled();
      receiver.destroy().then(function() {
        expect(mockReceiverManager.stop).toHaveBeenCalled();
      }).catch(fail).then(done);
    }));
  });

  function createMockReceiverApi() {
    return {
      CastReceiverManager: {
        getInstance: function() { return mockReceiverManager; },
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
      getSystemVolume: function() { return {level: 1, muted: false}; },
      getCastMessageBus: function(namespace) {
        if (namespace == shaka.cast.CastUtils.SHAKA_MESSAGE_NAMESPACE) {
          return mockShakaMessageBus;
        }

        return mockGenericMessageBus;
      },
    };
  }

  function createMockMessageBus() {
    let bus = {
      messages: [],
      broadcast: jasmine.createSpy('CastMessageBus.broadcast'),
      getCastChannel: jasmine.createSpy('CastMessageBus.getCastChannel'),
    };
    // For convenience, deserialize and store sent messages.
    bus.broadcast.and.callFake(function(message) {
      bus.messages.push(CastUtils.deserialize(message));
    });
    let channel = {
      messages: [],
      send: function(message) {
        channel.messages.push(CastUtils.deserialize(message));
      },
    };
    bus.getCastChannel.and.returnValue(channel);
    return bus;
  }

  function createMockPlayer() {
    let player = {
      destroy: jasmine.createSpy('destroy').and.returnValue(Promise.resolve()),
      setMaxHardwareResolution: jasmine.createSpy('setMaxHardwareResolution'),

      addEventListener: function(eventName, listener) {
        player.listeners[eventName] = listener;
      },
      removeEventListener: function(eventName, listener) {
        player.listeners[eventName] = null;
      },
      dispatchEvent: jasmine.createSpy('dispatchEvent'),
      // For convenience:
      listeners: {},
    };

    CastUtils.PlayerVoidMethods.forEach(function(name) {
      player[name] = jasmine.createSpy(name);
    });
    for (let name in CastUtils.PlayerGetterMethods) {
      player[name] = jasmine.createSpy(name);
    }
    for (let name in CastUtils.PlayerGetterMethodsThatRequireLive) {
      player[name] = jasmine.createSpy(name);
    }
    CastUtils.PlayerPromiseMethods.forEach(function(name) {
      player[name] = jasmine.createSpy(name).and.returnValue(Promise.resolve());
    });

    return player;
  }

  /**
   * @param {number} num
   */
  function fakeConnectedSenders(num) {
    let senderArray = [];
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
    let serialized = CastUtils.serialize(message);
    let messageEvent = {
      senderId: senderId,
      data: serialized,
    };
    bus.onMessage(messageEvent);
  }
});
