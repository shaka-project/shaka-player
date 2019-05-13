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

describe('CastSender', () => {
  const CastSender = shaka.cast.CastSender;
  const CastUtils = shaka.cast.CastUtils;
  const Util = shaka.test.Util;

  const originalChrome = window['chrome'];

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
    resetClassVariables();
  });

  afterEach((done) => {
    delete window.__onGCastApiAvailable;
    sender.destroy().catch(fail).then(done);
  });

  afterAll(() => {
    window['chrome'] = originalChrome;
  });

  describe('init', () => {
    it('installs a callback if the cast API is not available', () => {
      // Remove the mock cast API.
      delete window['chrome'].cast;
      // This shouldn't exist yet.
      expect(window.__onGCastApiAvailable).toBe(undefined);

      // Init and expect the callback to be installed.
      sender.init();
      expect(window.__onGCastApiAvailable).not.toBe(undefined);
      expect(sender.apiReady()).toBe(false);
      expect(onStatusChanged).not.toHaveBeenCalled();

      // Restore the mock cast API.
      window['chrome'].cast = mockCastApi;
      window.__onGCastApiAvailable(true);
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

    it('remembers status from previous senders', (done) => {
      sender.init();
      fakeReceiverAvailability(true);
      sender.destroy().then(() => {
        sender = new CastSender(
            fakeAppId, Util.spyFunc(onStatusChanged),
            Util.spyFunc(onFirstCastStateUpdate), Util.spyFunc(onRemoteEvent),
            Util.spyFunc(onResumeLocal), Util.spyFunc(onInitStateRequired));
        sender.init();
        // You get an initial call to onStatusChanged when it initializes.
        expect(onStatusChanged).toHaveBeenCalledTimes(3);

        return Util.delay(0.25);
      }).then(() => {
        // And then you get another call after it has 'discovered' the
        // existing receivers.
        expect(sender.hasReceivers()).toBe(true);
        expect(onStatusChanged).toHaveBeenCalledTimes(4);
      }).catch(fail).then(done);
    });
  });

  describe('cast', () => {
    it('fails when the cast API is not ready', (done) => {
      mockCastApi.isAvailable = false;
      sender.init();
      expect(sender.apiReady()).toBe(false);
      sender.cast(fakeInitState).then(fail).catch((error) => {
        expect(error.category).toBe(shaka.util.Error.Category.CAST);
        expect(error.code).toBe(shaka.util.Error.Code.CAST_API_UNAVAILABLE);
      }).then(done);
    });

    it('fails when there are no receivers', (done) => {
      sender.init();
      expect(sender.apiReady()).toBe(true);
      expect(sender.hasReceivers()).toBe(false);
      sender.cast(fakeInitState).then(fail).catch((error) => {
        expect(error.category).toBe(shaka.util.Error.Category.CAST);
        expect(error.code).toBe(shaka.util.Error.Code.NO_CAST_RECEIVERS);
      }).then(done);
    });

    it('creates a session and sends an "init" message', (done) => {
      sender.init();
      expect(sender.apiReady()).toBe(true);
      fakeReceiverAvailability(true);
      expect(sender.hasReceivers()).toBe(true);

      const p = sender.cast(fakeInitState);
      fakeSessionConnection();

      p.then(() => {
        expect(onStatusChanged).toHaveBeenCalled();
        expect(sender.isCasting()).toBe(true);
        expect(mockSession.messages).toContain(jasmine.objectContaining({
          type: 'init',
          initState: fakeInitState,
        }));
      }).catch(fail).then(done);
    });

    // The library is not loaded yet during describe(), so we can't refer to
    // Shaka error codes by name here.  Instead, we use the numeric value and
    // put the name in a comment.
    const connectionFailures = [
      {
        condition: 'canceled by the user',
        castErrorCode: 'cancel',
        shakaErrorCode: 8004,  // Code.CAST_CANCELED_BY_USER
      },
      {
        condition: 'the connection times out',
        castErrorCode: 'timeout',
        shakaErrorCode: 8005,  // Code.CAST_CONNECTION_TIMED_OUT
      },
      {
        condition: 'the receiver is unavailable',
        castErrorCode: 'receiver_unavailable',
        shakaErrorCode: 8006,  // Code.CAST_RECEIVER_APP_UNAVAILABLE
      },
      {
        condition: 'an unexpected error occurs',
        castErrorCode: 'anything else',
        shakaErrorCode: 8003,  // Code.UNEXPECTED_CAST_ERROR
      },
    ];

    connectionFailures.forEach((metadata) => {
      it('fails when ' + metadata.condition, (done) => {
        sender.init();
        fakeReceiverAvailability(true);

        const p = sender.cast(fakeInitState);
        fakeSessionConnectionFailure(metadata.castErrorCode);

        p.then(fail).catch((error) => {
          expect(error.category).toBe(shaka.util.Error.Category.CAST);
          expect(error.code).toBe(metadata.shakaErrorCode);
        }).then(done);
      });
    });

    it('fails when we are already casting', (done) => {
      sender.init();
      fakeReceiverAvailability(true);

      const p = sender.cast(fakeInitState);
      fakeSessionConnection();

      p.catch(fail).then(() => {
        return sender.cast(fakeInitState);
      }).then(fail).catch((error) => {
        expect(error.category).toBe(shaka.util.Error.Category.CAST);
        expect(error.code).toBe(shaka.util.Error.Code.ALREADY_CASTING);
      }).then(done);
    });
  });

  it('re-uses old sessions', (done) => {
    sender.init();
    fakeReceiverAvailability(true);
    const p = sender.cast(fakeInitState);
    fakeSessionConnection();
    const oldMockSession = mockSession;
    p.then(() => {
      return sender.destroy();
    }).then(() => {
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
    }).catch(fail).then(done);
  });

  it('doesn\'t re-use stopped sessions', (done) => {
    sender.init();
    fakeReceiverAvailability(true);
    const p = sender.cast(fakeInitState);
    fakeSessionConnection();
    p.then(() => {
      return sender.destroy();
    }).then(() => {
      mockCastApi.ApiConfig.calls.reset();

      // The session is stopped in the meantime.
      mockSession.status = chrome.cast.SessionStatus.STOPPED;

      sender = new CastSender(
          fakeAppId, Util.spyFunc(onStatusChanged),
          Util.spyFunc(onFirstCastStateUpdate), Util.spyFunc(onRemoteEvent),
          Util.spyFunc(onResumeLocal), Util.spyFunc(onInitStateRequired));
      sender.init();

      expect(sender.isCasting()).toBe(false);
    }).catch(fail).then(done);
  });

  it('joins existing sessions automatically', (done) => {
    sender.init();
    fakeReceiverAvailability(true);
    fakeJoinExistingSession();

    Util.delay(0.1).then(() => {
      expect(onStatusChanged).toHaveBeenCalled();
      expect(sender.isCasting()).toBe(true);
      expect(onInitStateRequired).toHaveBeenCalled();
      expect(mockSession.messages).toContain(jasmine.objectContaining({
        type: 'init',
        initState: fakeInitState,
      }));
    }).catch(fail).then(done);
  });

  describe('setAppData', () => {
    const fakeAppData = {
      myKey1: 'myValue1',
      myKey2: 'myValue2',
    };

    it('sets "appData" for "init" message if not casting', (done) => {
      sender.init();
      fakeReceiverAvailability(true);
      sender.setAppData(fakeAppData);
      sender.cast(fakeInitState).then(() => {
        expect(mockSession.messages).toContain(jasmine.objectContaining({
          type: 'init',
          appData: fakeAppData,
        }));
      }).catch(fail).then(done);
      fakeSessionConnection();
    });

    it('sends a special "appData" message if casting', (done) => {
      sender.init();
      fakeReceiverAvailability(true);
      sender.cast(fakeInitState).then(() => {
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
      }).catch(fail).then(done);
      fakeSessionConnection();
    });
  });

  describe('onFirstCastStateUpdate', () => {
    it('is triggered by an "update" message', (done) => {
      // You have to join an existing session for it to work.
      sender.init();
      fakeReceiverAvailability(true);
      fakeJoinExistingSession();

      Util.delay(0.1).then(() => {
        expect(onFirstCastStateUpdate).not.toHaveBeenCalled();

        fakeSessionMessage({
          type: 'update',
          update: {video: {currentTime: 12}, player: {isLive: false}},
        });
        expect(onFirstCastStateUpdate).toHaveBeenCalled();
      }).catch(fail).then(done);
    });

    it('is not triggered if making a new session', (done) => {
      sender.init();
      fakeReceiverAvailability(true);
      sender.cast(fakeInitState).then(() => {
        fakeSessionMessage({
          type: 'update',
          update: {video: {currentTime: 12}, player: {isLive: false}},
        });
        expect(onFirstCastStateUpdate).not.toHaveBeenCalled();
      }).catch(fail).then(done);
      fakeSessionConnection();
    });

    it('is triggered once per existing session', (done) => {
      sender.init();
      fakeReceiverAvailability(true);
      fakeJoinExistingSession();

      Util.delay(0.1).then(() => {
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
        return Util.delay(0.1);
      }).then(() => {
        fakeSessionMessage({
          type: 'update',
          update: {video: {currentTime: 12}, player: {isLive: false}},
        });
        expect(onFirstCastStateUpdate).toHaveBeenCalled();
      }).catch(fail).then(done);
    });
  });

  describe('onRemoteEvent', () => {
    it('is triggered by an "event" message', (done) => {
      sender.init();
      fakeReceiverAvailability(true);
      sender.cast(fakeInitState).then(() => {
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
      }).catch(fail).then(done);
      fakeSessionConnection();
    });
  });

  describe('onResumeLocal', () => {
    it('is triggered when casting ends', (done) => {
      sender.init();
      fakeReceiverAvailability(true);
      sender.cast(fakeInitState).then(() => {
        expect(sender.isCasting()).toBe(true);
        expect(onResumeLocal).not.toHaveBeenCalled();

        fakeRemoteDisconnect();
        expect(sender.isCasting()).toBe(false);
        expect(onResumeLocal).toHaveBeenCalled();
      }).catch(fail).then(done);
      fakeSessionConnection();
    });
  });

  describe('showDisconnectDialog', () => {
    it('opens the dialog if we are casting', (done) => {
      sender.init();
      fakeReceiverAvailability(true);
      sender.cast(fakeInitState).then(() => {
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
      }).catch(fail).then(done);
      fakeSessionConnection();
    });
  });

  describe('get', () => {
    it('returns most recent properties from "update" messages', (done) => {
      sender.init();
      fakeReceiverAvailability(true);
      sender.cast(fakeInitState).then(() => {
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
      }).catch(fail).then(done);
      fakeSessionConnection();
    });

    it('returns functions for video and player methods', () => {
      sender.init();
      expect(sender.get('video', 'play')).toEqual(jasmine.any(Function));
      expect(sender.get('player', 'isLive')).toEqual(jasmine.any(Function));
      expect(sender.get('player', 'configure')).toEqual(jasmine.any(Function));
      expect(sender.get('player', 'load')).toEqual(jasmine.any(Function));
    });

    it('simple methods trigger "call" messages', (done) => {
      sender.init();
      fakeReceiverAvailability(true);
      sender.cast(fakeInitState).then(() => {
        const method = sender.get('video', 'play');
        const retval = method(123, 'abc');
        expect(retval).toBe(undefined);

        expect(mockSession.messages).toContain(jasmine.objectContaining({
          type: 'call',
          targetName: 'video',
          methodName: 'play',
          args: [123, 'abc'],
        }));
      }).catch(fail).then(done);
      fakeSessionConnection();
    });

    describe('async player methods', () => {
      let method;

      beforeEach((done) => {
        method = null;
        sender.init();
        fakeReceiverAvailability(true);
        sender.cast(fakeInitState).then(() => {
          method = sender.get('player', 'load');
        }).catch(fail).then(done);
        fakeSessionConnection();
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

      it('resolve when "asyncComplete" messages are received', (done) => {
        const p = new shaka.test.StatusPromise(method(123, 'abc'));

        // Wait a tick for the Promise status to be set.
        Util.delay(0.1).then(() => {
          expect(p.status).toBe('pending');
          const id = mockSession.messages[mockSession.messages.length - 1].id;
          fakeSessionMessage({
            type: 'asyncComplete',
            id: id,
            error: null,
          });

          // Wait a tick for the Promise status to change.
          return Util.delay(0.1);
        }).then(() => {
          expect(p.status).toBe('resolved');
        }).catch(fail).then(done);
      });

      it('reject when "asyncComplete" messages have an error', (done) => {
        const originalError = new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MANIFEST,
            shaka.util.Error.Code.UNABLE_TO_GUESS_MANIFEST_TYPE,
            'foo://bar');
        const p = new shaka.test.StatusPromise(method(123, 'abc'));

        // Wait a tick for the Promise status to be set.
        Util.delay(0.1).then(() => {
          expect(p.status).toBe('pending');
          const id = mockSession.messages[mockSession.messages.length - 1].id;
          fakeSessionMessage({
            type: 'asyncComplete',
            id: id,
            error: originalError,
          });

          // Wait a tick for the Promise status to change.
          return Util.delay(0.1);
        }).then(() => {
          expect(p.status).toBe('rejected');
          return p.catch((error) => {
            Util.expectToEqualError(error, originalError);
          });
        }).catch(fail).then(done);
      });

      it('reject when disconnected remotely', (done) => {
        const p = new shaka.test.StatusPromise(method(123, 'abc'));

        // Wait a tick for the Promise status to be set.
        Util.delay(0.1).then(() => {
          expect(p.status).toBe('pending');
          fakeRemoteDisconnect();

          // Wait a tick for the Promise status to change.
          return Util.delay(0.1);
        }).then(() => {
          expect(p.status).toBe('rejected');
          return p.catch((error) => {
            Util.expectToEqualError(error, new shaka.util.Error(
                shaka.util.Error.Severity.RECOVERABLE,
                shaka.util.Error.Category.PLAYER,
                shaka.util.Error.Code.LOAD_INTERRUPTED));
          });
        }).catch(fail).then(done);
      });
    });
  });

  describe('set', () => {
    it('overrides any cached properties', (done) => {
      sender.init();
      fakeReceiverAvailability(true);
      sender.cast(fakeInitState).then(() => {
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
      }).catch(fail).then(done);
      fakeSessionConnection();
    });

    it('causes a "set" message to be sent', (done) => {
      sender.init();
      fakeReceiverAvailability(true);
      sender.cast(fakeInitState).then(() => {
        sender.set('video', 'muted', true);
        expect(mockSession.messages).toContain(jasmine.objectContaining({
          type: 'set',
          targetName: 'video',
          property: 'muted',
          value: true,
        }));
      }).catch(fail).then(done);
      fakeSessionConnection();
    });

    it('can be used before we have an "update" message', (done) => {
      sender.init();
      fakeReceiverAvailability(true);
      sender.cast(fakeInitState).then(() => {
        expect(sender.get('video', 'muted')).toBe(undefined);
        sender.set('video', 'muted', true);
        expect(sender.get('video', 'muted')).toBe(true);
      }).catch(fail).then(done);
      fakeSessionConnection();
    });
  });

  describe('hasRemoteProperties', () => {
    it('is true only after we have an "update" message', (done) => {
      sender.init();
      fakeReceiverAvailability(true);
      sender.cast(fakeInitState).then(() => {
        expect(sender.hasRemoteProperties()).toBe(false);

        fakeSessionMessage({
          type: 'update',
          update: {video: {currentTime: 12}, player: {isLive: false}},
        });
        expect(sender.hasRemoteProperties()).toBe(true);
      }).catch(fail).then(done);
      fakeSessionConnection();
    });
  });

  describe('forceDisconnect', () => {
    it('disconnects and cancels all async operations', (done) => {
      sender.init();
      fakeReceiverAvailability(true);
      sender.cast(fakeInitState).then(() => {
        expect(sender.isCasting()).toBe(true);
        expect(mockSession.leave).not.toHaveBeenCalled();
        expect(mockSession.stop).not.toHaveBeenCalled();
        expect(mockSession.removeUpdateListener).not.toHaveBeenCalled();
        expect(mockSession.removeMessageListener).not.toHaveBeenCalled();

        const method = sender.get('player', 'load');
        const p = new shaka.test.StatusPromise(method());

        // Wait a tick for the Promise status to be set.
        return Util.delay(0.1).then(() => {
          expect(p.status).toBe('pending');
          sender.forceDisconnect();
          expect(mockSession.leave).not.toHaveBeenCalled();
          expect(mockSession.stop).toHaveBeenCalled();
          expect(mockSession.removeUpdateListener).toHaveBeenCalled();
          expect(mockSession.removeMessageListener).toHaveBeenCalled();

          // Wait a tick for the Promise status to change.
          return Util.delay(0.1);
        }).then(() => {
          expect(p.status).toBe('rejected');
          return p.catch((error) => {
            Util.expectToEqualError(error, new shaka.util.Error(
                shaka.util.Error.Severity.RECOVERABLE,
                shaka.util.Error.Category.PLAYER,
                shaka.util.Error.Code.LOAD_INTERRUPTED));
          });
        });
      }).catch(fail).then(done);
      fakeSessionConnection();
    });
  });

  describe('destroy', () => {
    it('cancels all async operations', (done) => {
      sender.init();
      fakeReceiverAvailability(true);
      sender.cast(fakeInitState).then(() => {
        expect(sender.isCasting()).toBe(true);
        expect(mockSession.stop).not.toHaveBeenCalled();
        expect(mockSession.removeUpdateListener).not.toHaveBeenCalled();
        expect(mockSession.removeMessageListener).not.toHaveBeenCalled();

        const method = sender.get('player', 'load');
        const p = new shaka.test.StatusPromise(method());

        // Wait a tick for the Promise status to be set.
        return Util.delay(0.1).then(() => {
          expect(p.status).toBe('pending');
          sender.destroy().catch(fail);
          expect(mockSession.leave).not.toHaveBeenCalled();
          expect(mockSession.stop).not.toHaveBeenCalled();
          expect(mockSession.removeUpdateListener).toHaveBeenCalled();
          expect(mockSession.removeMessageListener).toHaveBeenCalled();

          // Wait a tick for the Promise status to change.
          return Util.delay(0.1);
        }).then(() => {
          expect(p.status).toBe('rejected');
          return p.catch((error) => {
            Util.expectToEqualError(error, new shaka.util.Error(
                shaka.util.Error.Severity.RECOVERABLE,
                shaka.util.Error.Category.PLAYER,
                shaka.util.Error.Code.LOAD_INTERRUPTED));
          });
        });
      }).catch(fail).then(done);
      fakeSessionConnection();
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
    const calls = mockCastApi.ApiConfig.calls;
    expect(calls.count()).toEqual(1);
    if (calls.count()) {
      const onReceiverStatusChanged = calls.argsFor(0)[2];
      onReceiverStatusChanged(yes ? 'available' : 'unavailable');
    }
  }

  function fakeSessionConnection() {
    const calls = mockCastApi.requestSession.calls;
    expect(calls.count()).toEqual(1);
    if (calls.count()) {
      const onSessionInitiated = calls.argsFor(0)[0];
      mockSession = createMockCastSession();
      onSessionInitiated(mockSession);
    }
  }

  /**
   * @param {string} code
   */
  function fakeSessionConnectionFailure(code) {
    const calls = mockCastApi.requestSession.calls;
    expect(calls.count()).toEqual(1);
    if (calls.count()) {
      const onSessionError = calls.argsFor(0)[1];
      onSessionError({code: code});
    }
  }

  /**
   * @param {?} message
   */
  function fakeSessionMessage(message) {
    const calls = mockSession.addMessageListener.calls;
    expect(calls.count()).toEqual(1);
    if (calls.count()) {
      const namespace = calls.argsFor(0)[0];
      const listener = calls.argsFor(0)[1];
      const serialized = CastUtils.serialize(message);
      listener(namespace, serialized);
    }
  }

  function fakeRemoteDisconnect() {
    mockSession.status = 'disconnected';
    const calls = mockSession.addUpdateListener.calls;
    expect(calls.count()).toEqual(1);
    if (calls.count()) {
      const onConnectionStatus = calls.argsFor(0)[0];
      onConnectionStatus();
    }
  }

  function fakeJoinExistingSession() {
    const calls = mockCastApi.ApiConfig.calls;
    expect(calls.count()).toEqual(1);
    if (calls.count()) {
      const onJoinExistingSession = calls.argsFor(0)[1];
      mockSession = createMockCastSession();
      onJoinExistingSession(mockSession);
    }
  }

  /**
   * @suppress {visibility}
   */
  function resetClassVariables() {
    // @suppress visibility has function scope, so this is a mini-function that
    // exists solely to suppress visibility for this call.
    CastSender.hasReceivers_ = false;
    CastSender.session_ = null;
  }
});
