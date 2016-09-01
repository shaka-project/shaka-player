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

describe('CastSender', function() {
  var CastSender;
  var CastUtils;

  var originalChrome;

  var fakeAppId = 'asdf';
  var fakeInitState = {
    manifest: null,
    player: null,
    startTime: null,
    video: null
  };

  var onStatusChanged;
  var onRemoteEvent;
  var onResumeLocal;
  var onInitStateRequired;

  var mockCastApi;
  var mockSession;

  /** @type {shaka.cast.CastSender} */
  var sender;

  beforeAll(function() {
    CastSender = shaka.cast.CastSender;
    CastUtils = shaka.cast.CastUtils;

    originalChrome = window['chrome'];
  });

  beforeEach(function() {
    onStatusChanged = jasmine.createSpy('onStatusChanged');
    onRemoteEvent = jasmine.createSpy('onRemoteEvent');
    onResumeLocal = jasmine.createSpy('onResumeLocal');
    onInitStateRequired = jasmine.createSpy('onInitStateRequired')
                          .and.returnValue(fakeInitState);

    mockCastApi = createMockCastApi();
    // We're using quotes to access window.chrome because the compiler
    // knows about lots of Chrome-specific APIs we aren't mocking.  We
    // don't need this mock strictly type-checked.
    window['chrome'] = { cast: mockCastApi };
    mockSession = null;

    sender = new CastSender(fakeAppId, onStatusChanged, onRemoteEvent,
                            onResumeLocal, onInitStateRequired);
  });

  afterEach(function(done) {
    delete window.__onGCastApiAvailable;
    sender.destroy().catch(fail).then(done);
  });

  afterAll(function() {
    window['chrome'] = originalChrome;
  });

  describe('init', function() {
    it('installs a callback if the cast API is not available', function() {
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

    it('sets up cast API right away if it is available', function() {
      sender.init();
      // Expect the API to be ready and initialized.
      expect(sender.apiReady()).toBe(true);
      expect(sender.hasReceivers()).toBe(false);
      expect(onStatusChanged).toHaveBeenCalled();
      expect(mockCastApi.SessionRequest).toHaveBeenCalledWith(fakeAppId);
      expect(mockCastApi.initialize).toHaveBeenCalled();
    });
  });

  describe('hasReceivers', function() {
    it('reflects the most recent receiver status', function() {
      sender.init();
      expect(sender.hasReceivers()).toBe(false);

      fakeReceiverAvailability(true);
      expect(sender.hasReceivers()).toBe(true);

      fakeReceiverAvailability(false);
      expect(sender.hasReceivers()).toBe(false);
    });
  });

  describe('cast', function() {
    it('fails when the cast API is not ready', function(done) {
      mockCastApi.isAvailable = false;
      sender.init();
      expect(sender.apiReady()).toBe(false);
      sender.cast(fakeInitState).then(fail).catch(function(error) {
        expect(error.category).toBe(shaka.util.Error.Category.CAST);
        expect(error.code).toBe(shaka.util.Error.Code.CAST_API_UNAVAILABLE);
      }).then(done);
    });

    it('fails when there are no receivers', function(done) {
      sender.init();
      expect(sender.apiReady()).toBe(true);
      expect(sender.hasReceivers()).toBe(false);
      sender.cast(fakeInitState).then(fail).catch(function(error) {
        expect(error.category).toBe(shaka.util.Error.Category.CAST);
        expect(error.code).toBe(shaka.util.Error.Code.NO_CAST_RECEIVERS);
      }).then(done);
    });

    it('creates a session and sends an "init" message', function(done) {
      sender.init();
      expect(sender.apiReady()).toBe(true);
      fakeReceiverAvailability(true);
      expect(sender.hasReceivers()).toBe(true);

      var p = sender.cast(fakeInitState);
      fakeSessionConnection();

      p.then(function() {
        expect(onStatusChanged).toHaveBeenCalled();
        expect(sender.isCasting()).toBe(true);
        expect(mockSession.messages).toContain(jasmine.objectContaining({
          type: 'init',
          initState: fakeInitState
        }));
      }).catch(fail).then(done);
    });

    // The library is not loaded yet during describe(), so we can't refer to
    // Shaka error codes by name here.  Instead, we use the numeric value and
    // put the name in a comment.
    var connectionFailures = [
      {
        condition: 'canceled by the user',
        castErrorCode: 'cancel',
        shakaErrorCode: 8004  // Code.CAST_CANCELED_BY_USER
      },
      {
        condition: 'the connection times out',
        castErrorCode: 'timeout',
        shakaErrorCode: 8005  // Code.CAST_CONNECTION_TIMED_OUT
      },
      {
        condition: 'the receiver is unavailable',
        castErrorCode: 'receiver_unavailable',
        shakaErrorCode: 8006  // Code.CAST_RECEIVER_APP_UNAVAILABLE
      },
      {
        condition: 'an unexpected error occurs',
        castErrorCode: 'anything else',
        shakaErrorCode: 8003  // Code.UNEXPECTED_CAST_ERROR
      }
    ];

    connectionFailures.forEach(function(metadata) {
      it('fails when ' + metadata.condition, function(done) {
        sender.init();
        fakeReceiverAvailability(true);

        var p = sender.cast(fakeInitState);
        fakeSessionConnectionFailure(metadata.castErrorCode);

        p.then(fail).catch(function(error) {
          expect(error.category).toBe(shaka.util.Error.Category.CAST);
          expect(error.code).toBe(metadata.shakaErrorCode);
        }).then(done);
      });
    });

    it('fails when we are already casting', function(done) {
      sender.init();
      fakeReceiverAvailability(true);

      var p = sender.cast(fakeInitState);
      fakeSessionConnection();

      p.catch(fail).then(function() {
        return sender.cast(fakeInitState);
      }).then(fail).catch(function(error) {
        expect(error.category).toBe(shaka.util.Error.Category.CAST);
        expect(error.code).toBe(shaka.util.Error.Code.ALREADY_CASTING);
      }).then(done);
    });
  });

  it('joins existing sessions automatically', function(done) {
    sender.init();
    fakeReceiverAvailability(true);
    fakeJoinExistingSession();

    shaka.test.Util.delay(0.1).then(function() {
      expect(onStatusChanged).toHaveBeenCalled();
      expect(sender.isCasting()).toBe(true);
      expect(onInitStateRequired).toHaveBeenCalled();
      expect(mockSession.messages).toContain(jasmine.objectContaining({
        type: 'init',
        initState: fakeInitState
      }));
    }).catch(fail).then(done);
  });

  describe('setAppData', function() {
    var fakeAppData = {
      myKey1: 'myValue1',
      myKey2: 'myValue2'
    };

    it('sets "appData" for "init" message if not casting', function(done) {
      sender.init();
      fakeReceiverAvailability(true);
      sender.setAppData(fakeAppData);
      sender.cast(fakeInitState).then(function() {
        expect(mockSession.messages).toContain(jasmine.objectContaining({
          type: 'init',
          appData: fakeAppData
        }));
      }).catch(fail).then(done);
      fakeSessionConnection();
    });

    it('sends a special "appData" message if casting', function(done) {
      sender.init();
      fakeReceiverAvailability(true);
      sender.cast(fakeInitState).then(function() {
        // init message has no appData
        expect(mockSession.messages).toContain(jasmine.objectContaining({
          type: 'init',
          appData: null
        }));
        // no appData message yet
        expect(mockSession.messages).not.toContain(jasmine.objectContaining({
          type: 'appData'
        }));

        sender.setAppData(fakeAppData);
        // now there is an appData message
        expect(mockSession.messages).toContain(jasmine.objectContaining({
          type: 'appData',
          appData: fakeAppData
        }));
      }).catch(fail).then(done);
      fakeSessionConnection();
    });
  });

  describe('onRemoteEvent', function() {
    it('is triggered by an "event" message', function(done) {
      sender.init();
      fakeReceiverAvailability(true);
      sender.cast(fakeInitState).then(function() {
        var fakeEvent = {
          type: 'eventName',
          detail: {key1: 'value1'}
        };
        fakeSessionMessage({
          type: 'event',
          targetName: 'video',
          event: fakeEvent
        });

        expect(onRemoteEvent).toHaveBeenCalledWith(
            'video', jasmine.objectContaining(fakeEvent));
      }).catch(fail).then(done);
      fakeSessionConnection();
    });
  });

  describe('onResumeLocal', function() {
    it('is triggered when casting ends', function(done) {
      sender.init();
      fakeReceiverAvailability(true);
      sender.cast(fakeInitState).then(function() {
        expect(sender.isCasting()).toBe(true);
        expect(onResumeLocal).not.toHaveBeenCalled();

        fakeRemoteDisconnect();
        expect(sender.isCasting()).toBe(false);
        expect(onResumeLocal).toHaveBeenCalled();
      }).catch(fail).then(done);
      fakeSessionConnection();
    });
  });

  describe('disconnect', function() {
    it('stops the session if we are casting', function(done) {
      sender.init();
      fakeReceiverAvailability(true);
      sender.cast(fakeInitState).then(function() {
        expect(sender.isCasting()).toBe(true);
        expect(mockSession.stop).not.toHaveBeenCalled();

        sender.showDisconnectDialog();
        expect(mockCastApi.requestSession).toHaveBeenCalled();
        fakeRemoteDisconnect();
      }).catch(fail).then(done);
      fakeSessionConnection();
    });
  });

  describe('get', function() {
    it('returns most recent properties from "update" messages', function(done) {
      sender.init();
      fakeReceiverAvailability(true);
      sender.cast(fakeInitState).then(function() {
        var update = {
          video: {
            currentTime: 12,
            paused: false
          },
          player: {
            isBuffering: true,
            seekRange: {start: 5, end: 17}
          }
        };
        fakeSessionMessage({
          type: 'update',
          update: update
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

    it('returns functions for video and player methods', function() {
      sender.init();
      expect(sender.get('video', 'play')).toEqual(jasmine.any(Function));
      expect(sender.get('player', 'isLive')).toEqual(jasmine.any(Function));
      expect(sender.get('player', 'configure')).toEqual(jasmine.any(Function));
      expect(sender.get('player', 'load')).toEqual(jasmine.any(Function));
    });

    it('simple methods trigger "call" messages', function(done) {
      sender.init();
      fakeReceiverAvailability(true);
      sender.cast(fakeInitState).then(function() {
        var method = sender.get('video', 'play');
        var retval = method(123, 'abc');
        expect(retval).toBe(undefined);

        expect(mockSession.messages).toContain(jasmine.objectContaining({
          type: 'call',
          targetName: 'video',
          methodName: 'play',
          args: [123, 'abc']
        }));
      }).catch(fail).then(done);
      fakeSessionConnection();
    });

    describe('async player methods', function() {
      var method;

      beforeEach(function(done) {
        method = null;
        sender.init();
        fakeReceiverAvailability(true);
        sender.cast(fakeInitState).then(function() {
          method = sender.get('player', 'load');
        }).catch(fail).then(done);
        fakeSessionConnection();
      });

      it('return Promises', function() {
        var p = method();
        expect(p).toEqual(jasmine.any(Promise));
        p.catch(function() {});  // silence logs about uncaught rejections
      });

      it('trigger "asyncCall" messages', function() {
        var p = method(123, 'abc');
        p.catch(function() {});  // silence logs about uncaught rejections

        expect(mockSession.messages).toContain(jasmine.objectContaining({
          type: 'asyncCall',
          targetName: 'player',
          methodName: 'load',
          args: [123, 'abc'],
          id: jasmine.any(String)
        }));
      });

      it('resolve when "asyncComplete" messages are received', function(done) {
        var p = method(123, 'abc');
        shaka.test.Util.capturePromiseStatus(p);

        // Wait a tick for the Promise status to be set.
        shaka.test.Util.delay(0.1).then(function() {
          expect(p.status).toBe('pending');
          var id = mockSession.messages[mockSession.messages.length - 1].id;
          fakeSessionMessage({
            type: 'asyncComplete',
            id: id,
            error: null
          });

          // Wait a tick for the Promise status to change.
          return shaka.test.Util.delay(0.1);
        }).then(function() {
          expect(p.status).toBe('resolved');
        }).catch(fail).then(done);
      });

      it('reject when "asyncComplete" messages have an error', function(done) {
        var originalError = new shaka.util.Error(
            shaka.util.Error.Category.MANIFEST,
            shaka.util.Error.Code.UNABLE_TO_GUESS_MANIFEST_TYPE,
            'foo://bar');
        var p = method(123, 'abc');
        shaka.test.Util.capturePromiseStatus(p);

        // Wait a tick for the Promise status to be set.
        shaka.test.Util.delay(0.1).then(function() {
          expect(p.status).toBe('pending');
          var id = mockSession.messages[mockSession.messages.length - 1].id;
          fakeSessionMessage({
            type: 'asyncComplete',
            id: id,
            error: originalError
          });

          // Wait a tick for the Promise status to change.
          return shaka.test.Util.delay(0.1);
        }).then(function() {
          expect(p.status).toBe('rejected');
          return p.catch(function(error) {
            shaka.test.Util.expectToEqualError(error, originalError);
          });
        }).catch(fail).then(done);
      });

      it('reject when disconnected remotely', function(done) {
        var p = method(123, 'abc');
        shaka.test.Util.capturePromiseStatus(p);

        // Wait a tick for the Promise status to be set.
        shaka.test.Util.delay(0.1).then(function() {
          expect(p.status).toBe('pending');
          fakeRemoteDisconnect();

          // Wait a tick for the Promise status to change.
          return shaka.test.Util.delay(0.1);
        }).then(function() {
          expect(p.status).toBe('rejected');
          return p.catch(function(error) {
            shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
                shaka.util.Error.Category.PLAYER,
                shaka.util.Error.Code.LOAD_INTERRUPTED));
          });
        }).catch(fail).then(done);
      });
    });
  });

  describe('set', function() {
    it('overrides any cached properties', function(done) {
      sender.init();
      fakeReceiverAvailability(true);
      sender.cast(fakeInitState).then(function() {
        var update = {
          video: {muted: false}
        };
        fakeSessionMessage({
          type: 'update',
          update: update
        });
        expect(sender.get('video', 'muted')).toBe(false);

        sender.set('video', 'muted', true);
        expect(sender.get('video', 'muted')).toBe(true);
      }).catch(fail).then(done);
      fakeSessionConnection();
    });

    it('causes a "set" message to be sent', function(done) {
      sender.init();
      fakeReceiverAvailability(true);
      sender.cast(fakeInitState).then(function() {
        sender.set('video', 'muted', true);
        expect(mockSession.messages).toContain(jasmine.objectContaining({
          type: 'set',
          targetName: 'video',
          property: 'muted',
          value: true
        }));
      }).catch(fail).then(done);
      fakeSessionConnection();
    });

    it('can be used before we have an "update" message', function(done) {
      sender.init();
      fakeReceiverAvailability(true);
      sender.cast(fakeInitState).then(function() {
        expect(sender.get('video', 'muted')).toBe(undefined);
        sender.set('video', 'muted', true);
        expect(sender.get('video', 'muted')).toBe(true);
      }).catch(fail).then(done);
      fakeSessionConnection();
    });
  });

  describe('hasRemoteProperties', function() {
    it('is true only after we have an "update" message', function(done) {
      sender.init();
      fakeReceiverAvailability(true);
      sender.cast(fakeInitState).then(function() {
        expect(sender.hasRemoteProperties()).toBe(false);

        fakeSessionMessage({
          type: 'update',
          update: {video: {currentTime: 12}, player: {isLive: false}}
        });
        expect(sender.hasRemoteProperties()).toBe(true);
      }).catch(fail).then(done);
      fakeSessionConnection();
    });
  });

  describe('destroy', function() {
    it('disconnects and cancels all async operations', function(done) {
      sender.init();
      fakeReceiverAvailability(true);
      sender.cast(fakeInitState).then(function() {
        expect(sender.isCasting()).toBe(true);
        expect(mockSession.stop).not.toHaveBeenCalled();

        var method = sender.get('player', 'load');
        var p = method();
        shaka.test.Util.capturePromiseStatus(p);

        // Wait a tick for the Promise status to be set.
        return shaka.test.Util.delay(0.1).then(function() {
          expect(p.status).toBe('pending');
          sender.destroy().catch(fail);
          expect(mockSession.stop).toHaveBeenCalled();

          // Wait a tick for the Promise status to change.
          return shaka.test.Util.delay(0.1);
        }).then(function() {
          expect(p.status).toBe('rejected');
          return p.catch(function(error) {
            shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
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
      ApiConfig: jasmine.createSpy('chrome.cast.ApiConfig'),
      initialize: jasmine.createSpy('chrome.cast.initialize'),
      requestSession: jasmine.createSpy('chrome.cast.requestSession')
    };
  }

  function createMockCastSession() {
    var session = {
      messages: [],
      status: 'connected',
      receiver: { friendlyName: 'SomeDevice' },
      addUpdateListener: jasmine.createSpy('Session.addUpdateListener'),
      addMessageListener: jasmine.createSpy('Session.addMessageListener'),
      sendMessage: jasmine.createSpy('Session.sendMessage'),
      stop: jasmine.createSpy('Session.stop')
    };

    // For convenience, deserialize and store sent messages.
    session.sendMessage.and.callFake(
        function(namespace, message, successCallback, errorCallback) {
          session.messages.push(CastUtils.deserialize(message));
        });
    return session;
  }

  /**
   * @param {boolean} yes If true, simulate receivers being available.
   */
  function fakeReceiverAvailability(yes) {
    var calls = mockCastApi.ApiConfig.calls;
    expect(calls.count()).toEqual(1);
    if (calls.count()) {
      var onReceiverStatusChanged = calls.argsFor(0)[2];
      onReceiverStatusChanged(yes ? 'available' : 'unavailable');
    }
  }

  function fakeSessionConnection() {
    var calls = mockCastApi.requestSession.calls;
    expect(calls.count()).toEqual(1);
    if (calls.count()) {
      var onSessionInitiated = calls.argsFor(0)[0];
      mockSession = createMockCastSession();
      onSessionInitiated(mockSession);
    }
  }

  /**
   * @param {string} code
   */
  function fakeSessionConnectionFailure(code) {
    var calls = mockCastApi.requestSession.calls;
    expect(calls.count()).toEqual(1);
    if (calls.count()) {
      var onSessionError = calls.argsFor(0)[1];
      onSessionError({code: code});
    }
  }

  /**
   * @param {?} message
   */
  function fakeSessionMessage(message) {
    var calls = mockSession.addMessageListener.calls;
    expect(calls.count()).toEqual(1);
    if (calls.count()) {
      var namespace = calls.argsFor(0)[0];
      var listener = calls.argsFor(0)[1];
      var serialized = CastUtils.serialize(message);
      listener(namespace, serialized);
    }
  }

  function fakeRemoteDisconnect() {
    mockSession.status = 'disconnected';
    var calls = mockSession.addUpdateListener.calls;
    expect(calls.count()).toEqual(1);
    if (calls.count()) {
      var onConnectionStatus = calls.argsFor(0)[0];
      onConnectionStatus();
    }
  }

  function fakeJoinExistingSession() {
    var calls = mockCastApi.ApiConfig.calls;
    expect(calls.count()).toEqual(1);
    if (calls.count()) {
      var onJoinExistingSession = calls.argsFor(0)[1];
      mockSession = createMockCastSession();
      onJoinExistingSession(mockSession);
    }
  }
});
