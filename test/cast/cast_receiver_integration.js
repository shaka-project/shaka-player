/** @license
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
        shaka.test.TestScheme.ManifestParser);

    await shaka.test.TestScheme.createManifests(shaka, '');
    support = await shaka.media.DrmEngine.probeSupport();
  });

  beforeEach(() => {
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

    video = shaka.util.Dom.createVideoElement();

    document.body.appendChild(video);

    player = new shaka.Player(video);
    receiver = new CastReceiver(video, player);

    toRestore = [];
    pendingWaitWrapperCalls = 0;

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
  });

  afterAll(() => {
    if (originalUserAgent) {
      window['cast'] = originalCast;
      Object.defineProperty(window['navigator'],
          'userAgent', {value: originalUserAgent});
    }
  });

  filterDescribe('with drm', () => support['com.widevine.alpha'], () => {
    drmIt('sends reasonably-sized updates', async () => {
      // Use an encrypted asset, to make sure DRM info doesn't balloon the size.
      fakeInitState.manifest = 'test:sintel-enc';

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
      const message = await waitForUpdateMessage();
      // Check that the update message is of a reasonable size. From previous
      // testing we found that the socket would silently reject data that got
      // too big. 5KB is safely below the limit.
      expect(message.length).toBeLessThan(5 * 1024);
    });

    drmIt('has reasonable average message size', async () => {
      // Use an encrypted asset, to make sure DRM info doesn't balloon the size.
      fakeInitState.manifest = 'test:sintel-enc';

      const p = waitForLoadedData();

      // Start the process of loading by sending a fake init message.
      fakeConnectedSenders(1);
      fakeIncomingMessage({
        type: 'init',
        initState: fakeInitState,
        appData: {},
      }, mockShakaMessageBus);

      await p;
      // Collect 50 update messages, and average their length.
      // Not all properties are passed along on every update message, so
      // the average length is expected to be lower than the length of the first
      // update message.
      let totalLength = 0;
      for (const _ of shaka.util.Iterables.range(50)) {
        shaka.util.Functional.ignored(_);
        // eslint-disable-next-line no-await-in-loop
        const message = await waitForUpdateMessage();
        totalLength += message.length;
      }
      expect(totalLength / 50).toBeLessThan(3000);
    });
  });

  it('sends update messages every stage of loading', async () => {
    // Add wrappers to various methods along player.load to make sure that,
    // at each stage, the cast receiver can form an update message without
    // causing an error.
    waitForUpdateMessageWrapper(
        shaka.media.ManifestParser, 'ManifestParser', 'create');
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
    await waitForUpdateMessage();
  });

  /**
   * Creates a wrapper around a method on a given prototype, which makes it
   * wait on waitForUpdateMessage before returning, and registers that wrapper
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
      await waitForUpdateMessage();
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

  function waitForUpdateMessage() {
    messageWaitPromise = new shaka.util.PublicPromise();
    return messageWaitPromise;
  }

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
      if (parsed.type == 'update' && messageWaitPromise) {
        shaka.log.debug('Received update message. Proceeding...');
        messageWaitPromise.resolve(message);
        messageWaitPromise = null;
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
