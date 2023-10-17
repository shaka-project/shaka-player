/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// The receiver is only meant to run on the Chromecast, so we have the
// ability to use modern APIs there that may not be available on all of the
// browsers our library supports.  Because of this, CastReceiver tests will
// only be run on Chrome and Chromecast.
/** @return {boolean} */
const castReceiverIntegrationSupport =
    () => shaka.util.Platform.isChrome() || shaka.util.Platform.isChromecast();
filterDescribe('CastReceiver', castReceiverIntegrationSupport, () => {
  const CastReceiver = shaka.cast.CastReceiver;
  const CastUtils = shaka.cast.CastUtils;

  const originalCast = window['cast'];
  const originalUserAgent = navigator.userAgent;

  const eventManager = new shaka.util.EventManager();

  let mockReceiverManager;
  let mockReceiverApi;
  let mockShakaMessageBus;
  let mockGenericMessageBus;

  /** @type {shaka.cast.CastReceiver} */
  let receiver;
  /** @type {shaka.Player} */
  let player;
  /** @type {HTMLVideoElement} */
  let video;

  /** @type {shaka.util.PublicPromise} */
  let messageWaitPromise;
  /** @type {Array.<string>} */
  let pendingMessages = null;

  /** @type {!Array.<function()>} */
  let toRestore;
  let pendingWaitWrapperCalls = 0;

  /** @type {!Object.<string, ?shaka.extern.DrmSupportType>} */
  let support = {};

  let fakeInitState;

  beforeAll(async () => {
    // In uncompiled mode, there is a UA check for Chromecast in order to make
    // manual testing easier.  For these automated tests, we want to act as if
    // we are running on the Chromecast, even in Chrome.
    // Since we can't write to window.navigator or navigator.userAgent, we use
    // Object.defineProperty.
    Object.defineProperty(window['navigator'],
        'userAgent', {value: 'CrKey', configurable: true});

    shaka.net.NetworkingEngine.registerScheme(
        'test', shaka.test.TestScheme.plugin);
    shaka.media.ManifestParser.registerParserByMime(
        'application/x-test-manifest',
        shaka.test.TestScheme.ManifestParser.factory);

    await shaka.test.TestScheme.createManifests(shaka, '');
    support = await shaka.media.DrmEngine.probeSupport();
  });

  beforeEach(async () => {
    mockReceiverApi = createMockReceiverApi();

    const mockCanDisplayType = jasmine.createSpy('canDisplayType');
    mockCanDisplayType.and.returnValue(true);

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

    video = shaka.test.UiUtils.createVideoElement();

    document.body.appendChild(video);

    player = new shaka.Player();
    await player.attach(video);
    receiver = new CastReceiver(video, player);

    toRestore = [];
    pendingWaitWrapperCalls = 0;

    messageWaitPromise = null;
    pendingMessages = null;

    fakeInitState = {
      player: {
        configure: {},
      },
      playerAfterLoad: {
        setTextTrackVisibility: true,
      },
      video: {
        loop: true,
        playbackRate: 5,
      },
      manifest: 'test:sintel_no_text',
      startTime: 0,
    };
  });

  afterEach(async () => {
    for (const restoreCallback of toRestore) {
      restoreCallback();
    }

    await receiver.destroy();
    document.body.removeChild(video);

    player = null;
    video = null;
    receiver = null;

    if (messageWaitPromise) {
      messageWaitPromise.resolve([]);
    }
    messageWaitPromise = null;
    pendingMessages = null;
  });

  afterAll(() => {
    if (originalUserAgent) {
      window['cast'] = originalCast;
      Object.defineProperty(window['navigator'],
          'userAgent', {value: originalUserAgent});
    }
  });

  describe('state changed event', () => {
    it('does not trigger a stack overflow', async () => {
      const p = waitForLoadedData();

      // We had a regression in which polling attributes eventually triggered a
      // stack overflow because of a state change event that fired every time
      // we checked the state.  The error itself got swallowed and hidden
      // inside CastReceiver, but would cause tests to disconnect in some
      // environments (consistently in GitHub Actions VMs, inconsistently
      // elsewhere).
      //
      // Testing for this is subtle: if we try to catch the error, it will be
      // caught at a point when the stack has already or is about to overflow.
      // Then if we call "fail", Jasmine will grow the stack further,
      // triggering *another* overflow inside of fail(), causing our test to
      // *pass*.  So we need to fail fast.  The best way I have found is to
      // catch the very first recursion of pollAttributes_, long before we
      // overflow, fail, then return early to avoid the actual recursion.
      const original = /** @type {?} */(receiver).pollAttributes_;
      let numRecursions = 0;
      // eslint-disable-next-line no-restricted-syntax
      /** @type {?} */(receiver).pollAttributes_ = function() {
        try {
          if (numRecursions > 0) {
            fail('Found recursion in pollAttributes_!');
            return undefined;
          }

          numRecursions++;
          return original.apply(receiver, arguments);
        } finally {
          numRecursions--;
        }
      };

      // Start the process of loading by sending a fake init message.
      fakeConnectedSenders(1);
      fakeIncomingMessage({
        type: 'init',
        initState: fakeInitState,
        appData: {},
      }, mockShakaMessageBus);

      await p;
    });
  });

  describe('without drm', () => {
    it('sends reasonably-sized updates', async () => {
      // Use an unencrypted asset.
      fakeInitState.manifest = 'test:sintel';

      const p = waitForLoadedData();

      // Start the process of loading by sending a fake init message.
      fakeConnectedSenders(1);
      fakeIncomingMessage({
        type: 'init',
        initState: fakeInitState,
        appData: {},
      }, mockShakaMessageBus);

      await p;
      // Wait for an update message.
      const messages = await waitForUpdateMessages();
      for (const message of messages) {
        // Check that the update message is of a reasonable size. From previous
        // testing we found that the socket would silently reject data that got
        // too big. 6KB is safely below the limit.
        expect(message.length).toBeLessThan(6000);
      }
    });

    it('has reasonable average message size', async () => {
      // Use an unencrypted asset.
      fakeInitState.manifest = 'test:sintel';

      const p = waitForLoadedData();

      // Start the process of loading by sending a fake init message.
      fakeConnectedSenders(1);
      fakeIncomingMessage({
        type: 'init',
        initState: fakeInitState,
        appData: {},
      }, mockShakaMessageBus);

      await p;

      // Collect messages over 50 update cycles, and average their length.
      // Not all properties are passed along on every update message, so
      // the average length is expected to be lower than the length of the first
      // update message.
      let totalLength = 0;
      let totalMessages = 0;
      for (let i = 0; i < 50; i++) {
        // eslint-disable-next-line no-await-in-loop
        const messages = await waitForUpdateMessages();
        for (const message of messages) {
          totalLength += message.length;
          totalMessages += 1;
        }
      }
      expect(totalLength / totalMessages).toBeLessThan(2000);
    });
  });

  filterDescribe('with drm', () => support['com.widevine.alpha'], () => {
    drmIt('sends reasonably-sized updates', async () => {
      // Use an encrypted asset, to make sure DRM info doesn't balloon the size.
      fakeInitState.manifest = 'test:sintel-enc';
      fakeInitState.player.configure['drm'] = {
        'servers': {
          'com.widevine.alpha': 'https://cwip-shaka-proxy.appspot.com/no_auth',
        },
      };

      const p = waitForLoadedData();

      // Start the process of loading by sending a fake init message.
      fakeConnectedSenders(1);
      fakeIncomingMessage({
        type: 'init',
        initState: fakeInitState,
        appData: {},
      }, mockShakaMessageBus);

      await p;
      // Wait for an update message.
      const messages = await waitForUpdateMessages();
      for (const message of messages) {
        // Check that the update message is of a reasonable size. From previous
        // testing we found that the socket would silently reject data that got
        // too big. 6KB is safely below the limit.
        expect(message.length).toBeLessThan(6000);
      }
    });

    drmIt('has reasonable average message size', async () => {
      // Use an encrypted asset, to make sure DRM info doesn't balloon the size.
      fakeInitState.manifest = 'test:sintel-enc';
      fakeInitState.player.configure['drm'] = {
        'servers': {
          'com.widevine.alpha': 'https://cwip-shaka-proxy.appspot.com/no_auth',
        },
      };

      const p = waitForLoadedData();

      // Start the process of loading by sending a fake init message.
      fakeConnectedSenders(1);
      fakeIncomingMessage({
        type: 'init',
        initState: fakeInitState,
        appData: {},
      }, mockShakaMessageBus);

      await p;

      // Collect messages over 50 update cycles, and average their length.
      // Not all properties are passed along on every update message, so
      // the average length is expected to be lower than the length of the first
      // update message.
      let totalLength = 0;
      let totalMessages = 0;
      for (let i = 0; i < 50; i++) {
        // eslint-disable-next-line no-await-in-loop
        const messages = await waitForUpdateMessages();
        for (const message of messages) {
          totalLength += message.length;
          totalMessages += 1;
        }
      }
      expect(totalLength / totalMessages).toBeLessThan(2000);
    });
  });

  it('sends update messages every stage of loading', async () => {
    // Add wrappers to various methods along player.load to make sure that,
    // at each stage, the cast receiver can form an update message without
    // causing an error.
    waitForUpdateMessageWrapper(
        // eslint-disable-next-line no-restricted-syntax
        shaka.test.TestScheme.ManifestParser.prototype, 'ManifestParser',
        'start');
    waitForUpdateMessageWrapper(
        // eslint-disable-next-line no-restricted-syntax
        shaka.media.DrmEngine.prototype, 'DrmEngine', 'initForPlayback');
    waitForUpdateMessageWrapper(
        // eslint-disable-next-line no-restricted-syntax
        shaka.media.DrmEngine.prototype, 'DrmEngine', 'attach');
    waitForUpdateMessageWrapper(
        // eslint-disable-next-line no-restricted-syntax
        shaka.media.StreamingEngine.prototype, 'StreamingEngine', 'start');

    const p = waitForLoadedData();

    // Start the process of loading by sending a fake init message.
    fakeConnectedSenders(1);
    fakeIncomingMessage({
      type: 'init',
      initState: fakeInitState,
      appData: {},
    }, mockShakaMessageBus);

    await p;
    // Make sure that each of the methods covered by
    // waitForUpdateMessageWrapper is called by this point.
    expect(pendingWaitWrapperCalls).toBe(0);

    // Wait for a final update message before proceeding.
    await waitForUpdateMessages();
  });

  /**
   * Creates a wrapper around a method on a given prototype, which makes it
   * wait on waitForUpdateMessages before returning, and registers that wrapper
   * to be uninstalled afterwards.
   * The replaced method is expected to be a method that returns a promise.
   * @param {!Object} prototype
   * @param {string} name
   * @param {string} methodName
   */
  function waitForUpdateMessageWrapper(prototype, name, methodName) {
    pendingWaitWrapperCalls += 1;
    const original = prototype[methodName];
    // eslint-disable-next-line no-restricted-syntax
    prototype[methodName] = /** @this {Object} @return {*} */ async function() {
      pendingWaitWrapperCalls -= 1;
      shaka.log.debug(
          'Waiting for update message before calling ' +
          name + '.' + methodName + '...');
      const originalArguments = Array.from(arguments);
      await waitForUpdateMessages();
      // eslint-disable-next-line no-restricted-syntax
      return original.apply(this, originalArguments);
    };
    toRestore.push(() => {
      prototype[methodName] = original;
    });
  }

  function waitForLoadedData() {
    return new Promise((resolve, reject) => {
      eventManager.listenOnce(video, 'loadeddata', resolve);
      eventManager.listenOnce(player, 'error', reject);
    });
  }

  function waitForUpdateMessages() {
    pendingMessages = [];
    messageWaitPromise = new shaka.util.PublicPromise();
    return messageWaitPromise;
  }

  function createMockReceiverApi() {
    return {
      CastReceiverManager: {
        getInstance: () => mockReceiverManager,
      },
      media: {
        // Defined by the SDK, but we aren't loading it here.
        MetadataType: {
          GENERIC: 0,
          MUSIC_TRACK: 3,
        },
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
        if (namespace == CastUtils.SHAKA_MESSAGE_NAMESPACE) {
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
      // Check to see if it's an update message.
      const parsed = CastUtils.deserialize(message);
      if (parsed.type == 'update' && pendingMessages) {
        shaka.log.debug('Received update message. Proceeding...');
        // The code waiting on this Promise will get an array of all of the
        // messages processed within this tick.
        pendingMessages.push(message);
        messageWaitPromise.resolve(pendingMessages);
      }
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
   * @param {*} message
   * @param {!cast.receiver.CastMessageBus} bus
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
