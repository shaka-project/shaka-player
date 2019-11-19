/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('CastSender', () => {
  const CastSender = shaka.cast.CastSender;
  const CastUtils = shaka.cast.CastUtils;
  const Util = shaka.test.Util;

  const originalChrome = window['chrome'];
  const originalStatusDelay = shaka.cast.CastSender.STATUS_DELAY;

  const fakeAppId = 'asdf';
  const fakeInitState = {
    manifest: null,
    player: null,
    startTime: null,
    video: null,
  };

  /** @type {!jasmine.Spy} */
  let onStatusChanged;
  /** @type {!jasmine.Spy} */
  let onFirstCastStateUpdate;
  let onRemoteEvent;
  let onResumeLocal;
  let onInitStateRequired;

  let mockCastApi;
  let mockSession;

  /** @type {shaka.cast.CastSender} */
  let sender;

  beforeEach(() => {
    onStatusChanged = jasmine.createSpy('onStatusChanged');
    onFirstCastStateUpdate = jasmine.createSpy('onFirstCastStateUpdate');
    onRemoteEvent = jasmine.createSpy('onRemoteEvent');
    onResumeLocal = jasmine.createSpy('onResumeLocal');
    onInitStateRequired = jasmine.createSpy('onInitStateRequired')
        .and.returnValue(fakeInitState);

    mockCastApi = createMockCastApi();
    // We're using quotes to access window.chrome because the compiler
    // knows about lots of Chrome-specific APIs we aren't mocking.  We
    // don't need this mock strictly type-checked.
    window['chrome'] = {cast: mockCastApi};
    mockSession = null;

    sender = new CastSender(
        fakeAppId, Util.spyFunc(onStatusChanged),
        Util.spyFunc(onFirstCastStateUpdate), Util.spyFunc(onRemoteEvent),
        Util.spyFunc(onResumeLocal), Util.spyFunc(onInitStateRequired));
  });

  afterEach(async () => {
    await sender.destroy();
    resetClassVariables();
  });

  beforeAll(() => {
    shaka.cast.CastSender.STATUS_DELAY = 0;
  });

  afterAll(() => {
    window['chrome'] = originalChrome;
    shaka.cast.CastSender.STATUS_DELAY = originalStatusDelay;
  });

  describe('init', () => {
    it('installs a callback if the cast API is not available', () => {
      // Remove the mock cast API.
      delete window['chrome'].cast;

      // Init and expect that apiReady is false and no status is available.
      sender.init();
      expect(sender.apiReady()).toBe(false);
      expect(onStatusChanged).not.toHaveBeenCalled();

      // Restore the mock cast API.
      window['chrome'].cast = mockCastApi;
      simulateSdkLoaded();

      // Expect the API to be ready and initialized.
      expect(sender.apiReady()).toBe(true);
      expect(sender.hasReceivers()).toBe(false);
      expect(onStatusChanged).toHaveBeenCalled();
      expect(mockCastApi.SessionRequest).toHaveBeenCalledWith(fakeAppId);
      expect(mockCastApi.initialize).toHaveBeenCalled();
    });

    it('sets up cast API right away if it is available', () => {
      sender.init();
      // Expect the API to be ready and initialized.
      expect(sender.apiReady()).toBe(true);
      expect(sender.hasReceivers()).toBe(false);
      expect(onStatusChanged).toHaveBeenCalled();
      expect(mockCastApi.SessionRequest).toHaveBeenCalledWith(fakeAppId);
      expect(mockCastApi.initialize).toHaveBeenCalled();
    });
  });

  describe('hasReceivers', () => {
    it('reflects the most recent receiver status', () => {
      sender.init();
      expect(sender.hasReceivers()).toBe(false);

      fakeReceiverAvailability(true);
      expect(sender.hasReceivers()).toBe(true);

      fakeReceiverAvailability(false);
      expect(sender.hasReceivers()).toBe(false);
    });

    it('remembers status from previous senders', async () => {
      sender.init();
      fakeReceiverAvailability(true);
      await sender.destroy();

      sender = new CastSender(
          fakeAppId, Util.spyFunc(onStatusChanged),
          Util.spyFunc(onFirstCastStateUpdate), Util.spyFunc(onRemoteEvent),
          Util.spyFunc(onResumeLocal), Util.spyFunc(onInitStateRequired));
      sender.init();
      // You get an initial call to onStatusChanged when it initializes.
      expect(onStatusChanged).toHaveBeenCalledTimes(3);
      await Util.shortDelay();

      // And then you get another call after it has 'discovered' the
      // existing receivers.
      expect(sender.hasReceivers()).toBe(true);
      expect(onStatusChanged).toHaveBeenCalledTimes(4);
    });
  });

  describe('cast', () => {
    it('fails when the cast API is not ready', async () => {
      mockCastApi.isAvailable = false;
      sender.init();
      expect(sender.apiReady()).toBe(false);
      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.CAST,
          shaka.util.Error.Code.CAST_API_UNAVAILABLE));
      await expectAsync(sender.cast(fakeInitState)).toBeRejectedWith(expected);
    });

    it('fails when there are no receivers', async () => {
      sender.init();
      expect(sender.apiReady()).toBe(true);
      expect(sender.hasReceivers()).toBe(false);
      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.CAST,
          shaka.util.Error.Code.NO_CAST_RECEIVERS));
      await expectAsync(sender.cast(fakeInitState)).toBeRejectedWith(expected);
    });

    it('creates a session and sends an "init" message', async () => {
      sender.init();
      expect(sender.apiReady()).toBe(true);
      fakeReceiverAvailability(true);
      expect(sender.hasReceivers()).toBe(true);

      const p = sender.cast(fakeInitState);
      fakeSessionConnection();

      await p;
      expect(onStatusChanged).toHaveBeenCalled();
      expect(sender.isCasting()).toBe(true);
      expect(mockSession.messages).toContain(jasmine.objectContaining({
        type: 'init',
        initState: fakeInitState,
      }));
    });

    // The library is not loaded yet during describe(), so we can't refer to
    // Shaka error codes by name here.  Instead, we use the numeric value and
    // put the name in a comment.
    const connectionFailures = [
      {
        condition: 'canceled by the user',
        castErrorCode: 'cancel',
        shakaErrorCode: shaka.util.Error.Code.CAST_CANCELED_BY_USER,
      },
      {
        condition: 'the connection times out',
        castErrorCode: 'timeout',
        shakaErrorCode: shaka.util.Error.Code.CAST_CONNECTION_TIMED_OUT,
      },
      {
        condition: 'the receiver is unavailable',
        castErrorCode: 'receiver_unavailable',
        shakaErrorCode: shaka.util.Error.Code.CAST_RECEIVER_APP_UNAVAILABLE,
      },
      {
        condition: 'an unexpected error occurs',
        castErrorCode: 'anything else',
        shakaErrorCode: shaka.util.Error.Code.UNEXPECTED_CAST_ERROR,
      },
    ];

    for (const metadata of connectionFailures) {
      it('fails when ' + metadata.condition, async () => {
        sender.init();
        fakeReceiverAvailability(true);

        const p = sender.cast(fakeInitState);
        fakeSessionConnectionFailure(metadata.castErrorCode);

        const expected = Util.jasmineError(new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.CAST,
            metadata.shakaErrorCode,
            jasmine.anything()));
        await expectAsync(p).toBeRejectedWith(expected);
      });
    }

    it('fails when we are already casting', async () => {
      sender.init();
      fakeReceiverAvailability(true);

      const p = sender.cast(fakeInitState);
      fakeSessionConnection();

      await p;
      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.CAST,
          shaka.util.Error.Code.ALREADY_CASTING));
      await expectAsync(sender.cast(fakeInitState)).toBeRejectedWith(expected);
    });
  });

  it('re-uses old sessions', async () => {
    sender.init();
    fakeReceiverAvailability(true);
    const p = sender.cast(fakeInitState);
    fakeSessionConnection();
    const oldMockSession = mockSession;
    await p;
    await sender.destroy();

    // Reset tracking variables.
    mockCastApi.ApiConfig.calls.reset();
    onStatusChanged.calls.reset();
    oldMockSession.messages = [];

    // Make a new session, to ensure that the sender is correctly using
    // the previous mock session.
    mockSession = createMockCastSession();

    sender = new CastSender(
        fakeAppId, Util.spyFunc(onStatusChanged),
        Util.spyFunc(onFirstCastStateUpdate), Util.spyFunc(onRemoteEvent),
        Util.spyFunc(onResumeLocal), Util.spyFunc(onInitStateRequired));
    sender.init();

    // The sender should automatically rejoin the session, without needing
    // to be told to cast.
    expect(onStatusChanged).toHaveBeenCalled();
    expect(sender.isCasting()).toBe(true);

    // The message should be on the old session, instead of the new one.
    expect(mockSession.messages.length).toBe(0);
    expect(oldMockSession.messages).toContain(jasmine.objectContaining({
      type: 'init',
      initState: fakeInitState,
    }));
  });

  it('doesn\'t re-use stopped sessions', async () => {
    sender.init();
    fakeReceiverAvailability(true);
    const p = sender.cast(fakeInitState);
    fakeSessionConnection();
    await p;
    await sender.destroy();

    mockCastApi.ApiConfig.calls.reset();

    // The session is stopped in the meantime.
    mockSession.status = chrome.cast.SessionStatus.STOPPED;

    sender = new CastSender(
        fakeAppId, Util.spyFunc(onStatusChanged),
        Util.spyFunc(onFirstCastStateUpdate), Util.spyFunc(onRemoteEvent),
        Util.spyFunc(onResumeLocal), Util.spyFunc(onInitStateRequired));
    sender.init();

    expect(sender.isCasting()).toBe(false);
  });

  it('joins existing sessions automatically', async () => {
    sender.init();
    fakeReceiverAvailability(true);
    fakeJoinExistingSession();

    await Util.shortDelay();
    expect(onStatusChanged).toHaveBeenCalled();
    expect(sender.isCasting()).toBe(true);
    expect(onInitStateRequired).toHaveBeenCalled();
    expect(mockSession.messages).toContain(jasmine.objectContaining({
      type: 'init',
      initState: fakeInitState,
    }));
  });

  describe('setAppData', () => {
    const fakeAppData = {
      myKey1: 'myValue1',
      myKey2: 'myValue2',
    };

    it('sets "appData" for "init" message if not casting', async () => {
      sender.init();
      fakeReceiverAvailability(true);
      sender.setAppData(fakeAppData);
      const p = sender.cast(fakeInitState);
      fakeSessionConnection();

      await p;
      expect(mockSession.messages).toContain(jasmine.objectContaining({
        type: 'init',
        appData: fakeAppData,
      }));
    });

    it('sends a special "appData" message if casting', async () => {
      sender.init();
      fakeReceiverAvailability(true);
      const p = sender.cast(fakeInitState);
      fakeSessionConnection();
      await p;

      // init message has no appData
      expect(mockSession.messages).toContain(jasmine.objectContaining({
        type: 'init',
        appData: null,
      }));
      // no appData message yet
      expect(mockSession.messages).not.toContain(jasmine.objectContaining({
        type: 'appData',
      }));

      sender.setAppData(fakeAppData);
      // now there is an appData message
      expect(mockSession.messages).toContain(jasmine.objectContaining({
        type: 'appData',
        appData: fakeAppData,
      }));
    });
  });

  describe('onFirstCastStateUpdate', () => {
    it('is triggered by an "update" message', async () => {
      // You have to join an existing session for it to work.
      sender.init();
      fakeReceiverAvailability(true);
      fakeJoinExistingSession();

      await Util.shortDelay();
      expect(onFirstCastStateUpdate).not.toHaveBeenCalled();

      fakeSessionMessage({
        type: 'update',
        update: {video: {currentTime: 12}, player: {isLive: false}},
      });
      expect(onFirstCastStateUpdate).toHaveBeenCalled();
    });

    it('is not triggered if making a new session', async () => {
      sender.init();
      fakeReceiverAvailability(true);
      const p = sender.cast(fakeInitState);
      fakeSessionConnection();
      await p;

      fakeSessionMessage({
        type: 'update',
        update: {video: {currentTime: 12}, player: {isLive: false}},
      });
      expect(onFirstCastStateUpdate).not.toHaveBeenCalled();
    });

    it('is triggered once per existing session', async () => {
      sender.init();
      fakeReceiverAvailability(true);
      fakeJoinExistingSession();

      await Util.shortDelay();
      fakeSessionMessage({
        type: 'update',
        update: {video: {currentTime: 12}, player: {isLive: false}},
      });
      expect(onFirstCastStateUpdate).toHaveBeenCalled();
      onFirstCastStateUpdate.calls.reset();

      fakeSessionMessage({
        type: 'update',
        update: {video: {currentTime: 12}, player: {isLive: false}},
      });
      expect(onFirstCastStateUpdate).not.toHaveBeenCalled();
      onFirstCastStateUpdate.calls.reset();

      // Disconnect and then connect to another existing session.
      fakeJoinExistingSession();
      await Util.shortDelay();

      fakeSessionMessage({
        type: 'update',
        update: {video: {currentTime: 12}, player: {isLive: false}},
      });
      expect(onFirstCastStateUpdate).toHaveBeenCalled();
    });
  });

  describe('onRemoteEvent', () => {
    it('is triggered by an "event" message', async () => {
      sender.init();
      fakeReceiverAvailability(true);
      const p = sender.cast(fakeInitState);
      fakeSessionConnection();
      await p;

      const fakeEvent = {
        type: 'eventName',
        detail: {key1: 'value1'},
      };
      fakeSessionMessage({
        type: 'event',
        targetName: 'video',
        event: fakeEvent,
      });

      expect(onRemoteEvent).toHaveBeenCalledWith(
          'video', jasmine.objectContaining(fakeEvent));
    });
  });

  describe('onResumeLocal', () => {
    it('is triggered when casting ends', async () => {
      sender.init();
      fakeReceiverAvailability(true);
      const p = sender.cast(fakeInitState);
      fakeSessionConnection();
      await p;

      expect(sender.isCasting()).toBe(true);
      expect(onResumeLocal).not.toHaveBeenCalled();

      fakeRemoteDisconnect();
      expect(sender.isCasting()).toBe(false);
      expect(onResumeLocal).toHaveBeenCalled();
    });
  });

  describe('showDisconnectDialog', () => {
    it('opens the dialog if we are casting', async () => {
      sender.init();
      fakeReceiverAvailability(true);
      const p = sender.cast(fakeInitState);
      fakeSessionConnection();
      await p;

      expect(sender.isCasting()).toBe(true);
      expect(mockSession.leave).not.toHaveBeenCalled();
      expect(mockSession.stop).not.toHaveBeenCalled();
      mockCastApi.requestSession.calls.reset();

      sender.showDisconnectDialog();

      // this call opens the dialog:
      expect(mockCastApi.requestSession).toHaveBeenCalled();
      // these were not used:
      expect(mockSession.leave).not.toHaveBeenCalled();
      expect(mockSession.stop).not.toHaveBeenCalled();

      fakeRemoteDisconnect();
    });
  });

  describe('get', () => {
    it('returns most recent properties from "update" messages', async () => {
      sender.init();
      fakeReceiverAvailability(true);
      const p = sender.cast(fakeInitState);
      fakeSessionConnection();
      await p;

      const update = {
        video: {
          currentTime: 12,
          paused: false,
        },
        player: {
          isBuffering: true,
          seekRange: {start: 5, end: 17},
        },
      };
      fakeSessionMessage({
        type: 'update',
        update: update,
      });

      // These are properties:
      expect(sender.get('video', 'currentTime')).toBe(
          update.video.currentTime);
      expect(sender.get('video', 'paused')).toBe(
          update.video.paused);

      // These are getter methods:
      expect(sender.get('player', 'isBuffering')()).toBe(
          update.player.isBuffering);
      expect(sender.get('player', 'seekRange')()).toEqual(
          update.player.seekRange);
    });

    it('returns functions for video and player methods', () => {
      sender.init();
      expect(sender.get('video', 'play')).toEqual(jasmine.any(Function));
      expect(sender.get('player', 'isLive')).toEqual(jasmine.any(Function));
      expect(sender.get('player', 'configure')).toEqual(jasmine.any(Function));
      expect(sender.get('player', 'load')).toEqual(jasmine.any(Function));
    });

    it('simple methods trigger "call" messages', async () => {
      sender.init();
      fakeReceiverAvailability(true);
      const p = sender.cast(fakeInitState);
      fakeSessionConnection();
      await p;

      const method = sender.get('video', 'play');
      const retval = method(123, 'abc');
      expect(retval).toBe(undefined);

      expect(mockSession.messages).toContain(jasmine.objectContaining({
        type: 'call',
        targetName: 'video',
        methodName: 'play',
        args: [123, 'abc'],
      }));
    });

    describe('async player methods', () => {
      let method;

      beforeEach(async () => {
        method = null;
        sender.init();
        fakeReceiverAvailability(true);
        const p = sender.cast(fakeInitState);
        fakeSessionConnection();
        await p;

        method = sender.get('player', 'load');
      });

      it('return Promises', () => {
        const p = method();
        expect(p).toEqual(jasmine.any(Promise));
        p.catch(() => {});  // silence logs about uncaught rejections
      });

      it('trigger "asyncCall" messages', () => {
        const p = method(123, 'abc');
        p.catch(() => {});  // silence logs about uncaught rejections

        expect(mockSession.messages).toContain(jasmine.objectContaining({
          type: 'asyncCall',
          targetName: 'player',
          methodName: 'load',
          args: [123, 'abc'],
          id: jasmine.any(String),
        }));
      });

      it('resolve when "asyncComplete" messages are received', async () => {
        /** @type {!shaka.test.StatusPromise} */
        const p = new shaka.test.StatusPromise(method(123, 'abc'));

        // Wait a tick for the Promise status to be set.
        await Util.shortDelay();
        expect(p.status).toBe('pending');
        const id = mockSession.messages[mockSession.messages.length - 1].id;
        fakeSessionMessage({
          type: 'asyncComplete',
          id: id,
          error: null,
        });

        await expectAsync(p).toBeResolved();
      });

      it('reject when "asyncComplete" messages have an error', async () => {
        const originalError = new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MANIFEST,
            shaka.util.Error.Code.UNABLE_TO_GUESS_MANIFEST_TYPE,
            'foo://bar');
        /** @type {!shaka.test.StatusPromise} */
        const p = new shaka.test.StatusPromise(method(123, 'abc'));

        // Wait a tick for the Promise status to be set.
        await Util.shortDelay();
        expect(p.status).toBe('pending');
        const id = mockSession.messages[mockSession.messages.length - 1].id;
        fakeSessionMessage({
          type: 'asyncComplete',
          id: id,
          error: originalError,
        });

        await expectAsync(p).toBeRejectedWith(Util.jasmineError(originalError));
      });

      it('reject when disconnected remotely', async () => {
        /** @type {!shaka.test.StatusPromise} */
        const p = new shaka.test.StatusPromise(method(123, 'abc'));

        // Wait a tick for the Promise status to be set.
        await Util.shortDelay();
        expect(p.status).toBe('pending');
        fakeRemoteDisconnect();

        const expected = Util.jasmineError(new shaka.util.Error(
            shaka.util.Error.Severity.RECOVERABLE,
            shaka.util.Error.Category.PLAYER,
            shaka.util.Error.Code.LOAD_INTERRUPTED));
        await expectAsync(p).toBeRejectedWith(expected);
      });
    });
  });

  describe('set', () => {
    it('overrides any cached properties', async () => {
      sender.init();
      fakeReceiverAvailability(true);
      const p = sender.cast(fakeInitState);
      fakeSessionConnection();
      await p;

      const update = {
        video: {muted: false},
      };
      fakeSessionMessage({
        type: 'update',
        update: update,
      });
      expect(sender.get('video', 'muted')).toBe(false);

      sender.set('video', 'muted', true);
      expect(sender.get('video', 'muted')).toBe(true);
    });

    it('causes a "set" message to be sent', async () => {
      sender.init();
      fakeReceiverAvailability(true);
      const p = sender.cast(fakeInitState);
      fakeSessionConnection();
      await p;

      sender.set('video', 'muted', true);
      expect(mockSession.messages).toContain(jasmine.objectContaining({
        type: 'set',
        targetName: 'video',
        property: 'muted',
        value: true,
      }));
    });

    it('can be used before we have an "update" message', async () => {
      sender.init();
      fakeReceiverAvailability(true);
      const p = sender.cast(fakeInitState);
      fakeSessionConnection();
      await p;

      expect(sender.get('video', 'muted')).toBe(undefined);
      sender.set('video', 'muted', true);
      expect(sender.get('video', 'muted')).toBe(true);
    });
  });

  describe('hasRemoteProperties', () => {
    it('is true only after we have an "update" message', async () => {
      sender.init();
      fakeReceiverAvailability(true);
      const p = sender.cast(fakeInitState);
      fakeSessionConnection();
      await p;

      expect(sender.hasRemoteProperties()).toBe(false);

      fakeSessionMessage({
        type: 'update',
        update: {video: {currentTime: 12}, player: {isLive: false}},
      });
      expect(sender.hasRemoteProperties()).toBe(true);
    });
  });

  describe('forceDisconnect', () => {
    it('disconnects and cancels all async operations', async () => {
      sender.init();
      fakeReceiverAvailability(true);
      const cast = sender.cast(fakeInitState);
      fakeSessionConnection();
      await cast;

      expect(sender.isCasting()).toBe(true);
      expect(mockSession.leave).not.toHaveBeenCalled();
      expect(mockSession.stop).not.toHaveBeenCalled();
      expect(mockSession.removeUpdateListener).not.toHaveBeenCalled();
      expect(mockSession.removeMessageListener).not.toHaveBeenCalled();

      const method = sender.get('player', 'load');
      /** @type {!shaka.test.StatusPromise} */
      const p = new shaka.test.StatusPromise(method());

      // Wait a tick for the Promise status to be set.
      await Util.shortDelay();
      expect(p.status).toBe('pending');
      sender.forceDisconnect();
      expect(mockSession.leave).not.toHaveBeenCalled();
      expect(mockSession.stop).toHaveBeenCalled();
      expect(mockSession.removeUpdateListener).toHaveBeenCalled();
      expect(mockSession.removeMessageListener).toHaveBeenCalled();

      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.PLAYER,
          shaka.util.Error.Code.LOAD_INTERRUPTED));
      await expectAsync(p).toBeRejectedWith(expected);
    });
  });

  describe('destroy', () => {
    it('cancels all async operations', async () => {
      sender.init();
      fakeReceiverAvailability(true);
      const cast = sender.cast(fakeInitState);
      fakeSessionConnection();
      await cast;

      expect(sender.isCasting()).toBe(true);
      expect(mockSession.stop).not.toHaveBeenCalled();
      expect(mockSession.removeUpdateListener).not.toHaveBeenCalled();
      expect(mockSession.removeMessageListener).not.toHaveBeenCalled();

      const method = sender.get('player', 'load');
      /** @type {!shaka.test.StatusPromise} */
      const p = new shaka.test.StatusPromise(method());

      // Wait a tick for the Promise status to be set.
      await Util.shortDelay();
      expect(p.status).toBe('pending');
      const destroy = sender.destroy();
      expect(mockSession.leave).not.toHaveBeenCalled();
      expect(mockSession.stop).not.toHaveBeenCalled();
      expect(mockSession.removeUpdateListener).toHaveBeenCalled();
      expect(mockSession.removeMessageListener).toHaveBeenCalled();

      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.PLAYER,
          shaka.util.Error.Code.LOAD_INTERRUPTED));
      await expectAsync(p).toBeRejectedWith(expected);
      await destroy;
    });
  });

  function createMockCastApi() {
    return {
      isAvailable: true,
      SessionRequest: jasmine.createSpy('chrome.cast.SessionRequest'),
      SessionStatus: {STOPPED: 'stopped'},
      ApiConfig: jasmine.createSpy('chrome.cast.ApiConfig'),
      initialize: jasmine.createSpy('chrome.cast.initialize'),
      requestSession: jasmine.createSpy('chrome.cast.requestSession'),
    };
  }

  function createMockCastSession() {
    const session = {
      messages: [],
      status: 'connected',
      receiver: {friendlyName: 'SomeDevice'},
      addUpdateListener: jasmine.createSpy('Session.addUpdateListener'),
      removeUpdateListener: jasmine.createSpy('Session.removeUpdateListener'),
      addMessageListener: jasmine.createSpy('Session.addMessageListener'),
      removeMessageListener: jasmine.createSpy('Session.removeMessageListener'),
      leave: jasmine.createSpy('Session.leave'),
      sendMessage: jasmine.createSpy('Session.sendMessage'),
      stop: jasmine.createSpy('Session.stop'),
    };

    // For convenience, deserialize and store sent messages.
    session.sendMessage.and.callFake(
        (namespace, message, successCallback, errorCallback) => {
          session.messages.push(CastUtils.deserialize(message));
        });
    return session;
  }

  /**
   * @param {boolean} yes If true, simulate receivers being available.
   */
  function fakeReceiverAvailability(yes) {
    expect(mockCastApi.ApiConfig).toHaveBeenCalledTimes(1);
    const onReceiverStatusChanged = mockCastApi.ApiConfig.calls.argsFor(0)[2];
    onReceiverStatusChanged(yes ? 'available' : 'unavailable');
  }

  function fakeSessionConnection() {
    expect(mockCastApi.requestSession).toHaveBeenCalledTimes(1);
    const onSessionInitiated = mockCastApi.requestSession.calls.argsFor(0)[0];
    mockSession = createMockCastSession();
    onSessionInitiated(mockSession);
  }

  /**
   * @param {string} code
   */
  function fakeSessionConnectionFailure(code) {
    expect(mockCastApi.requestSession).toHaveBeenCalledTimes(1);
    const onSessionError = mockCastApi.requestSession.calls.argsFor(0)[1];
    onSessionError({code: code});
  }

  /**
   * @param {?} message
   */
  function fakeSessionMessage(message) {
    expect(mockSession.addMessageListener).toHaveBeenCalledTimes(1);
    const namespace = mockSession.addMessageListener.calls.argsFor(0)[0];
    const listener = mockSession.addMessageListener.calls.argsFor(0)[1];
    const serialized = CastUtils.serialize(message);
    listener(namespace, serialized);
  }

  function fakeRemoteDisconnect() {
    mockSession.status = 'disconnected';
    expect(mockSession.addUpdateListener).toHaveBeenCalledTimes(1);
    const onConnectionStatus =
        mockSession.addUpdateListener.calls.argsFor(0)[0];
    onConnectionStatus();
  }

  function fakeJoinExistingSession() {
    expect(mockCastApi.ApiConfig).toHaveBeenCalledTimes(1);
    const onJoinExistingSession = mockCastApi.ApiConfig.calls.argsFor(0)[1];
    mockSession = createMockCastSession();
    onJoinExistingSession(mockSession);
  }

  /**
   * @suppress {visibility}
   * "suppress visibility" has function scope, so this is a mini-function that
   * exists solely to suppress visibility rules for these actions.
   */
  function resetClassVariables() {
    CastSender.hasReceivers_ = false;
    CastSender.session_ = null;
  }

  /**
   * @suppress {visibility}
   * "suppress visibility" has function scope, so this is a mini-function that
   * exists solely to suppress visibility rules for these actions.
   */
  function simulateSdkLoaded() {
    shaka.cast.CastSender.onSdkLoaded_(true);
  }
});
