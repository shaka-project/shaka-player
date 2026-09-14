/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview CmcdManager unit tests. Tests poke at the manager's
 * internals (the `reporter_` field and a handful of `_`-suffixed
 * helpers) for white-box coverage of the adapter's translation layer;
 * the file-level suppress unblocks Closure's strict-property and
 * private-access checks across the whole file.
 *
 * @suppress {checkTypes|accessControls|missingProperties|undefinedVars}
 */

describe('CmcdManager', () => {
  const CmcdManager = shaka.util.CmcdManager;
  const NetworkingEngine = shaka.net.NetworkingEngine;
  const RequestType = NetworkingEngine.RequestType;
  const AdvancedRequestType = NetworkingEngine.AdvancedRequestType;
  const ObjectType = cml.cmcd.CmcdObjectType;
  const PlayerState = cml.cmcd.CmcdPlayerState;
  const EventType = cml.cmcd.CmcdEventType;
  const StreamingFormat = cml.cmcd.CmcdStreamingFormat;

  /**
   * Cast any object to `Object<string, *>` so tests can poke at private
   * fields/methods (`reporter_`, `setPlayerState_`, etc.) without struct
   * or visibility complaints from Closure. The `@suppress` opens all
   * relevant gates.
   *
   * @param {*} m
   * @return {!Object<string, *>}
   * @suppress {checkTypes|accessControls|strictPrimitiveOperators}
   */
  function priv(m) {
    return /** @type {!Object<string, *>} */ (m);
  }

  /** @extends {shaka.util.FakeEventTarget} */
  class MockCmcdVideo extends shaka.util.FakeEventTarget {
    constructor() {
      super();
      /** @type {number} */
      this.currentTime = 0;
      /** @type {boolean} */
      this.muted = false;
      /** @type {boolean} */
      this.autoplay = false;
    }

    play() { return Promise.resolve(); }
  }

  function createMockPlayer() {
    const player = /** @type {shaka.util.FakeEventTarget} */ (
      new shaka.util.FakeEventTarget());
    Object.assign(player, {
      isLive: () => false,
      getLiveLatency: () => 0,
      getBandwidthEstimate: () => 10000000,
      getBufferedInfo: () => ({
        video: [{start: 0, end: 30}],
        audio: [{start: 0, end: 30}],
        text: [],
      }),
      getNetworkingEngine: () => null,
      getPlaybackRate: () => 1,
      getVariantTracks: () => [
        {
          type: 'variant', active: false, bandwidth: 50000,
          videoBandwidth: 40000, audioBandwidth: 10000,
        },
        {
          type: 'variant', active: true, bandwidth: 5000000,
          videoBandwidth: 4000000, audioBandwidth: 1000000,
        },
      ],
    });
    return player;
  }

  function createConfig(overrides = {}) {
    return Object.assign({
      enabled: true,
      sessionId: '2ed2d1cd-970b-48f2-bfb3-50a79e87cfa3',
      contentId: 'testing',
      rtpSafetyFactor: 5,
      useHeaders: false,
      includeKeys: [],
      includeInRequests: [],
      version: 2,
      eventTargets: [],
      applyParametersFromManifest: true,
    }, overrides);
  }

  /**
   * @param {!Object=} cmcdOverrides Overrides for the CMCDParameters part.
   * @param {!Object=} reportingOverrides Overrides for the reporting part.
   * @return {shaka.extern.ClientDataReporting}
   */
  function createManifestParams(cmcdOverrides = {}, reportingOverrides = {}) {
    const cmcdParameters = Object.assign({
      version: 1,
      mode: 'query',
      includeInRequests: ['segment'],
      keys: null,
      contentId: null,
      sessionId: null,
    }, cmcdOverrides);
    return /** @type {shaka.extern.ClientDataReporting} */ (Object.assign({
      schemeIdUri: 'urn:mpeg:dash:cta-5004:2023',
      serviceLocations: null,
      adaptationSets: null,
      serviceLocationBaseUris: [],
      cmcdParameters: cmcdParameters,
    }, reportingOverrides));
  }

  /**
   * @param {!shaka.extern.Request} request
   * @return {string} The decoded CMCD query dictionary, or '' when absent.
   */
  function cmcdQueryOf(request) {
    return new URL(request.uris[0]).searchParams.get('CMCD') || '';
  }

  function createManager(player, configOverrides = {}, attach = true) {
    const config = createConfig(configOverrides);
    const manager = new CmcdManager(
        /** @type {!shaka.Player} */ (player), config);
    if (attach) {
      const video = new MockCmcdVideo();
      video.currentTime = 10;
      manager.setMediaElement(
          /** @type {!HTMLMediaElement} */ (/** @type {*} */ (video)));
    }
    return {manager, config};
  }

  function createRequest(uri = 'https://test.com/seg.mp4') {
    return /** @type {shaka.extern.Request} */ ({
      uris: [uri],
      method: 'GET',
      body: null,
      headers: {},
      allowCrossSiteCredentials: false,
      retryParameters: /** @type {shaka.extern.RetryParameters} */ ({}),
      licenseRequestType: null,
      sessionId: null,
      drmInfo: null,
      initData: null,
      initDataType: null,
      streamDataCallback: null,
    });
  }

  function createSegmentContext(type = 'video') {
    return /** @type {shaka.extern.RequestContext} */ ({
      type: AdvancedRequestType.MEDIA_SEGMENT,
      stream: /** @type {shaka.extern.Stream} */ ({
        bandwidth: 5234167,
        codecs: 'avc1.42001e',
        mimeType: 'video/mp4',
        type: type,
        segmentIndex: null,
      }),
      segment: /** @type {shaka.media.SegmentReference} */ ({
        startTime: 0,
        endTime: 3.33,
        getUris: () => ['https://test.com/seg.mp4'],
      }),
    });
  }

  describe('default configuration', () => {
    it('applies manifest parameters and uses the legacy request set', () => {
      const cmcd = shaka.util.PlayerConfiguration.createDefault().cmcd;
      expect(cmcd.applyParametersFromManifest).toBe(true);
      expect(cmcd.includeInRequests).toEqual([]);
    });
  });

  // ── Public API back-compat re-exports ──

  describe('public API re-exports', () => {
    it('StreamingFormat preserves value-identity with cml.cmcd', () => {
      expect(CmcdManager.StreamingFormat).toEqual(
          /** @type {!Object<string, string>} */ (StreamingFormat));
    });

    it('EventType preserves value-identity with cml.cmcd', () => {
      expect(CmcdManager.EventType).toEqual(
          /** @type {!Object<string, string>} */ (EventType));
    });

    it('PlayerState preserves value-identity with cml.cmcd', () => {
      expect(CmcdManager.PlayerState).toEqual(
          /** @type {!Object<string, string>} */ (PlayerState));
    });
  });

  // ── Lifecycle ──

  describe('lifecycle', () => {
    it('does not construct a reporter when enabled is false', () => {
      const player = createMockPlayer();
      const {manager} = createManager(player, {enabled: false});
      expect(priv(manager)['reporter_']).toBeNull();
    });

    it('constructs a reporter once setMediaElement is called', () => {
      const player = createMockPlayer();
      const config = createConfig();
      const manager = new CmcdManager(
          /** @type {!shaka.Player} */ (player), config);
      expect(priv(manager)['reporter_']).toBeNull();
      const video = new MockCmcdVideo();
      manager.setMediaElement(
          /** @type {!HTMLMediaElement} */ (/** @type {*} */ (video)));
      expect(priv(manager)['reporter_']).not.toBeNull();
    });

    it('tears down and rebuilds the reporter on configure with enabled toggle',
        () => {
          const player = createMockPlayer();
          const {manager, config} = createManager(player);
          const firstReporter = priv(manager)['reporter_'];
          expect(firstReporter).not.toBeNull();
          manager.configure(Object.assign({}, config, {enabled: false}));
          expect(priv(manager)['reporter_']).toBeNull();
          manager.configure(Object.assign({}, config, {enabled: true}));
          expect(priv(manager)['reporter_']).not.toBeNull();
          expect(priv(manager)['reporter_']).not.toBe(firstReporter);
        });

    it('tears down and rebuilds on material config change', () => {
      const player = createMockPlayer();
      const {manager, config} = createManager(player);
      const firstReporter = priv(manager)['reporter_'];
      manager.configure(Object.assign({}, config, {contentId: 'changed'}));
      expect(priv(manager)['reporter_']).not.toBe(firstReporter);
    });

    it('keeps the same reporter for non-material changes', () => {
      const player = createMockPlayer();
      const {manager, config} = createManager(player);
      const firstReporter = priv(manager)['reporter_'];
      manager.configure(Object.assign({}, config, {rtpSafetyFactor: 7}));
      expect(priv(manager)['reporter_']).toBe(firstReporter);
    });

    // configure()'s teardown branch must also clear event listeners —
    // otherwise the rebuild path registers every video/player/document
    // listener a second time, and recordEvent-based events (MUTE,
    // UNMUTE, PLAYER_EXPAND, ...) get reported once per registration.
    // State-change updates (sta) are deduped by lastPlayerState_, which
    // masked the doubling.

    it('does not duplicate listeners across disable/re-enable', () => {
      const player = createMockPlayer();
      const {manager, config} = createManager(player);
      const video = priv(manager)['video_'];
      manager.configure(Object.assign({}, config, {enabled: false}));
      manager.configure(Object.assign({}, config, {enabled: true}));
      spyOn(priv(manager)['reporter_'], 'recordEvent');
      video.muted = true;
      video.dispatchEvent(new shaka.util.FakeEvent('volumechange'));
      expect(priv(manager)['reporter_'].recordEvent).toHaveBeenCalledTimes(1);
    });

    it('does not duplicate listeners on material config change', () => {
      const player = createMockPlayer();
      const {manager, config} = createManager(player);
      const video = priv(manager)['video_'];
      manager.configure(Object.assign({}, config, {contentId: 'changed'}));
      spyOn(priv(manager)['reporter_'], 'recordEvent');
      video.muted = true;
      video.dispatchEvent(new shaka.util.FakeEvent('volumechange'));
      expect(priv(manager)['reporter_'].recordEvent).toHaveBeenCalledTimes(1);
    });

    it('rebuilt reporter keeps the learned sf', () => {
      // The manifest request that teaches sf has already happened when a
      // rebuild occurs (for example when manifest parameters arrive), so the
      // rebuilt reporter must be re-taught the cached value.
      const player = createMockPlayer();
      const {manager, config} = createManager(player);
      const manifestContext = /** @type {shaka.extern.RequestContext} */ (
        {type: AdvancedRequestType.MPD});
      manager.applyRequestData(
          RequestType.MANIFEST, createRequest(), manifestContext);
      manager.configure(Object.assign({}, config, {contentId: 'changed'}));
      const r = createRequest();
      manager.applyRequestData(RequestType.SEGMENT, r, createSegmentContext());
      expect(cmcdQueryOf(r)).toContain('sf=d');
    });

    it('reset stops the reporter and clears state', () => {
      const player = createMockPlayer();
      const {manager} = createManager(player);
      spyOn(priv(manager)['reporter_'], 'stop');
      const reporterRef = priv(manager)['reporter_'];
      manager.reset();
      expect(reporterRef.stop).toHaveBeenCalledWith(true);
      expect(priv(manager)['reporter_']).toBeNull();
      expect(priv(manager)['lastPlayerState_']).toBeNull();
    });

    it('reset preserves video_ so subsequent configure can rebuild', () => {
      // Regression: shaka's lifecycle keeps the video element attached
      // across `unload()`/`load()`. Reset must preserve `video_` so a
      // post-unload `configure({material change})` can reconstruct the
      // reporter without needing another `setMediaElement` call.
      const player = createMockPlayer();
      const {manager, config} = createManager(player);
      manager.reset();
      expect(priv(manager)['video_']).not.toBeNull();
      // Now reconfigure with a material change — reporter should
      // reconstruct and event listeners should re-attach.
      manager.configure(Object.assign({}, config, {useHeaders: true}));
      expect(priv(manager)['reporter_']).not.toBeNull();
    });

    // Regression coverage for
    // https://github.com/shaka-project/shaka-player/issues/10414: every
    // load() after the first triggers an internal unload → reset(), and
    // nothing in the plain load() path re-ran setMediaElement() or
    // configure() — so the reporter stayed dead and CMCD silently stopped.
    // Player.load() now calls onLoad() to re-arm the reporter for each
    // new playback session.

    it('onLoad() re-arms the reporter after reset()', () => {
      const player = createMockPlayer();
      const {manager} = createManager(player);
      manager.reset();
      expect(priv(manager)['reporter_']).toBeNull();
      manager.onLoad();
      expect(priv(manager)['reporter_']).not.toBeNull();
    });

    it('onLoad() keeps the running reporter when one exists', () => {
      const player = createMockPlayer();
      const {manager} = createManager(player);
      const firstReporter = priv(manager)['reporter_'];
      expect(firstReporter).not.toBeNull();
      manager.onLoad();
      expect(priv(manager)['reporter_']).toBe(firstReporter);
    });

    it('onLoad() does not start a reporter when disabled', () => {
      const player = createMockPlayer();
      const {manager} = createManager(player, {enabled: false});
      manager.onLoad();
      expect(priv(manager)['reporter_']).toBeNull();
    });

    it('applies request data after a reset()/onLoad() cycle', () => {
      const player = createMockPlayer();
      const {manager} = createManager(player);
      manager.reset();
      manager.onLoad();
      const request = createRequest();
      manager.applyRequestData(
          RequestType.SEGMENT, request, createSegmentContext());
      expect(request.uris[0]).toContain('CMCD=');
    });

    it('re-attaches video listeners after a reset()/onLoad() cycle', () => {
      const player = createMockPlayer();
      const {manager} = createManager(player);
      const video = priv(manager)['video_'];
      manager.reset();
      manager.onLoad();
      spyOn(priv(manager)['reporter_'], 'update');
      video.dispatchEvent(new shaka.util.FakeEvent('pause'));
      expect(priv(manager)['reporter_'].update).toHaveBeenCalledWith(
          {sta: PlayerState.PAUSED});
    });
  });

  // ── Manifest-signaled parameters ──

  describe('manifest parameters', () => {
    const resolve = CmcdManager.resolveEffectiveConfig;

    it('uses the application configuration when the manifest says nothing',
        () => {
          const config = createConfig({
            version: 2, useHeaders: true, includeKeys: ['br'],
            includeInRequests: ['mpd'],
          });
          const effective = resolve(config, null, 'generated');
          expect(effective.enabled).toBe(true);
          expect(effective.version).toBe(2);
          expect(effective.useHeaders).toBe(true);
          expect(effective.includeKeys).toEqual(['br']);
          expect(effective.includeInRequests).toEqual(['mpd']);
          expect(effective.sessionId).toBe(config.sessionId);
          expect(effective.contentId).toBe('testing');
          expect(effective.fromManifest).toBe(false);
        });

    it('lets manifest parameters override the overlapping fields', () => {
      const config = createConfig({
        version: 2, useHeaders: true, includeKeys: ['br'],
        contentId: 'app', sessionId: 'app-session',
      });
      const params = createManifestParams({
        version: 1, mode: 'query', keys: ['bl', 'cid'],
        contentId: 'mpd', sessionId: 'mpd-session',
        includeInRequests: ['segment', 'mpd'],
      });
      const effective = resolve(config, params, null);
      expect(effective.enabled).toBe(true);
      expect(effective.version).toBe(1);
      expect(effective.useHeaders).toBe(false);
      expect(effective.includeKeys).toEqual(['bl', 'cid']);
      expect(effective.contentId).toBe('mpd');
      expect(effective.sessionId).toBe('mpd-session');
      expect(effective.includeInRequests).toEqual(['segment', 'mpd']);
      expect(effective.rtpSafetyFactor).toBe(config.rtpSafetyFactor);
      expect(effective.eventTargets).toBe(config.eventTargets);
      expect(effective.fromManifest).toBe(true);
    });

    it('falls back to app values for absent manifest ids and keys', () => {
      const config = createConfig({
        includeKeys: ['br'], contentId: 'app', sessionId: 'app-session',
      });
      const effective = resolve(config, createManifestParams(), null);
      expect(effective.includeKeys).toEqual(['br']);
      expect(effective.contentId).toBe('app');
      expect(effective.sessionId).toBe('app-session');
    });

    it('enables CMCD when the manifest carries parameters', () => {
      const effective = resolve(
          createConfig({enabled: false}), createManifestParams(), 'generated');
      expect(effective.enabled).toBe(true);
      expect(effective.sessionId).toBe(
          '2ed2d1cd-970b-48f2-bfb3-50a79e87cfa3');
    });

    it('ignores the manifest when applyParametersFromManifest is false',
        () => {
          const config = createConfig({
            enabled: false, applyParametersFromManifest: false,
          });
          const effective = resolve(
              config, createManifestParams({contentId: 'mpd'}), null);
          expect(effective.enabled).toBe(false);
          expect(effective.contentId).toBe('testing');
          expect(effective.fromManifest).toBe(false);
        });

    it('drops manifest keys the player does not support', () => {
      const params = createManifestParams({
        version: 1, keys: ['br', 'bogus', 'com.example-custom', 'sid'],
      });
      const effective = resolve(createConfig(), params, null);
      expect(effective.includeKeys).toEqual(
          ['br', 'com.example-custom', 'sid']);
    });

    it('starts a reporter from manifest parameters when the app disabled ' +
        'CMCD', () => {
      const player = createMockPlayer();
      const {manager} = createManager(player, {enabled: false});
      expect(priv(manager)['reporter_']).toBeNull();
      manager.setManifestParameters(
          createManifestParams({keys: ['sid', 'cid', 'ot'], contentId: 'mpd'}));
      expect(priv(manager)['reporter_']).not.toBeNull();
      const r = createRequest();
      manager.applyRequestData(RequestType.SEGMENT, r, createSegmentContext());
      expect(cmcdQueryOf(r)).toContain('cid="mpd"');
    });

    it('rebuilds only when the effective configuration changes', () => {
      const player = createMockPlayer();
      const {manager} = createManager(player);
      const first = priv(manager)['reporter_'];
      manager.setManifestParameters(createManifestParams({contentId: 'mpd'}));
      const second = priv(manager)['reporter_'];
      expect(second).not.toBe(first);
      manager.setManifestParameters(createManifestParams({contentId: 'mpd'}));
      expect(priv(manager)['reporter_']).toBe(second);
    });

    it('keeps the generated session id across rebuilds and drops it on ' +
        'reset', () => {
      const player = createMockPlayer();
      const {manager} = createManager(player, {sessionId: ''});
      const sid = priv(manager)['effective_'].sessionId;
      expect(sid).toBeTruthy();
      manager.setManifestParameters(createManifestParams({contentId: 'mpd'}));
      expect(priv(manager)['effective_'].sessionId).toBe(sid);
      manager.reset();
      manager.onLoad();
      expect(priv(manager)['effective_'].sessionId).toBeTruthy();
      expect(priv(manager)['effective_'].sessionId).not.toBe(sid);
    });

    it('re-teaches sf and sta to a rebuilt reporter', () => {
      const player = createMockPlayer();
      const {manager} = createManager(
          player, {includeKeys: ['sf', 'sta', 'ot']});
      manager.applyRequestData(RequestType.MANIFEST, createRequest(),
          /** @type {shaka.extern.RequestContext} */ (
            {type: AdvancedRequestType.MPD}));
      priv(manager)['video_'].dispatchEvent(
          new shaka.util.FakeEvent('playing'));
      manager.setManifestParameters(createManifestParams({
        version: 2, contentId: 'mpd', keys: ['sf', 'sta', 'ot', 'cid'],
      }));
      const r = createRequest();
      manager.applyRequestData(RequestType.SEGMENT, r, createSegmentContext());
      const cmcd = cmcdQueryOf(r);
      expect(cmcd).toContain('sf=d');
      expect(cmcd).toContain('sta=p');
    });

    it('keeps the start time of load across a rebuild so msd still fires',
        () => {
          // A live MPD refresh can deliver material CMCD parameters after
          // setStartTimeOfLoad() but before the first 'playing' event.
          // startTimeOfLoad_ is session-scoped, so the rebuild must not
          // clear it or msd is lost for the whole session.
          const player = createMockPlayer();
          const {manager} = createManager(player);
          const video = priv(manager)['video_'];
          manager.setStartTimeOfLoad(Date.now() - 200);
          manager.setManifestParameters(
              createManifestParams({version: 2, contentId: 'mpd'}));
          video.dispatchEvent(new shaka.util.FakeEvent('playing'));
          const r = createRequest();
          manager.applyRequestData(
              RequestType.SEGMENT, r, createSegmentContext());
          expect(cmcdQueryOf(r)).toContain('msd=');
        });

    it('reset() clears manifest parameters', () => {
      const player = createMockPlayer();
      const {manager} = createManager(player, {enabled: false});
      manager.setManifestParameters(createManifestParams());
      expect(priv(manager)['reporter_']).not.toBeNull();
      manager.reset();
      manager.onLoad();
      expect(priv(manager)['manifestParams_']).toBeNull();
      expect(priv(manager)['reporter_']).toBeNull();
    });
  });

  describe('includeInRequests', () => {
    /**
     * @param {!Object} fields
     * @return {shaka.extern.RequestContext}
     */
    function ctx(fields) {
      return /** @type {shaka.extern.RequestContext} */ (fields);
    }

    /**
     * @param {!shaka.util.CmcdManager} manager
     * @param {!shaka.net.NetworkingEngine.RequestType} type
     * @param {shaka.extern.RequestContext=} context
     * @return {boolean} Whether CMCD was attached.
     */
    function decorated(manager, type, context) {
      const r = createRequest('https://test.com/resource');
      manager.applyRequestData(type, r, context);
      return r.uris[0].includes('CMCD=');
    }

    const mpdContext = ctx({type: AdvancedRequestType.MPD});

    it('uses the legacy set when the list is empty', () => {
      const {manager} = createManager(createMockPlayer(),
          {includeInRequests: []});
      expect(decorated(manager, RequestType.MANIFEST, mpdContext)).toBe(true);
      expect(decorated(manager, RequestType.MANIFEST,
          ctx({type: AdvancedRequestType.XLINK}))).toBe(true);
      expect(decorated(manager, RequestType.MANIFEST,
          ctx({type: AdvancedRequestType.LINKED_MPD}))).toBe(true);
      expect(decorated(manager, RequestType.SEGMENT, createSegmentContext()))
          .toBe(true);
      expect(decorated(manager, RequestType.LICENSE)).toBe(true);
      expect(decorated(manager, RequestType.TIMING)).toBe(true);
      expect(decorated(manager, RequestType.CONTENT_STEERING)).toBe(false);
      expect(decorated(manager, RequestType.EVENT_CALLBACK)).toBe(false);
    });

    it('honors an explicit list', () => {
      const {manager} = createManager(createMockPlayer(),
          {includeInRequests: ['segment', 'steering']});
      expect(decorated(manager, RequestType.SEGMENT, createSegmentContext()))
          .toBe(true);
      expect(decorated(manager, RequestType.CONTENT_STEERING)).toBe(true);
      expect(decorated(manager, RequestType.MANIFEST, mpdContext)).toBe(false);
      expect(decorated(manager, RequestType.LICENSE)).toBe(false);
      expect(decorated(manager, RequestType.TIMING)).toBe(false);
    });

    it('treats segment as covering init segments and init as init only',
        () => {
          const initContext = ctx(Object.assign(createSegmentContext(),
              {type: AdvancedRequestType.INIT_SEGMENT}));
          const {manager} = createManager(createMockPlayer(),
              {includeInRequests: ['segment']});
          expect(decorated(manager, RequestType.SEGMENT, initContext))
              .toBe(true);

          const {manager: initOnly} = createManager(createMockPlayer(),
              {includeInRequests: ['init']});
          expect(decorated(initOnly, RequestType.SEGMENT, initContext))
              .toBe(true);
          expect(decorated(initOnly, RequestType.SEGMENT,
              createSegmentContext())).toBe(false);
        });

    it('distinguishes mpd, mpdpatch, xlink and mpdlink', () => {
      const {manager} = createManager(createMockPlayer(),
          {includeInRequests: ['mpdpatch', 'mpdlink']});
      expect(decorated(manager, RequestType.MANIFEST, mpdContext)).toBe(false);
      expect(decorated(manager, RequestType.MANIFEST,
          ctx({type: AdvancedRequestType.MPD_PATCH}))).toBe(true);
      expect(decorated(manager, RequestType.MANIFEST,
          ctx({type: AdvancedRequestType.XLINK}))).toBe(false);
      expect(decorated(manager, RequestType.MANIFEST,
          ctx({type: AdvancedRequestType.LINKED_MPD}))).toBe(true);
    });

    it('learns sf from undecorated manifest requests', () => {
      const {manager} = createManager(createMockPlayer(),
          {includeInRequests: ['segment']});
      expect(decorated(manager, RequestType.MANIFEST, mpdContext)).toBe(false);
      const r = createRequest();
      manager.applyRequestData(
          RequestType.SEGMENT, r, createSegmentContext());
      expect(cmcdQueryOf(r)).toContain('sf=d');
    });

    it('decorates everything with "*", including steering and callbacks',
        () => {
          const {manager} = createManager(createMockPlayer(),
              {includeInRequests: ['*']});
          expect(decorated(manager, RequestType.CONTENT_STEERING)).toBe(true);
          expect(decorated(manager, RequestType.EVENT_CALLBACK)).toBe(true);
          expect(decorated(manager, RequestType.LICENSE)).toBe(true);
          expect(decorated(manager, RequestType.MANIFEST, mpdContext))
              .toBe(true);
        });

    it('sends ot=o on steering and callback requests', () => {
      const {manager} = createManager(createMockPlayer(),
          {includeInRequests: ['*']});
      spyOn(priv(manager)['reporter_'], 'createRequestReport')
          .and.callThrough();
      for (const type of [
        RequestType.CONTENT_STEERING, RequestType.EVENT_CALLBACK,
      ]) {
        manager.applyRequestData(type, createRequest());
        const data = /** @type {!Object} */ (
          priv(manager)['reporter_'].createRequestReport.calls
              .mostRecent().args[1]);
        expect(data.ot).toBe(ObjectType.OTHER);
      }
    });

    it('applies manifest includeInRequests over the app list', () => {
      const {manager} = createManager(createMockPlayer(),
          {includeInRequests: ['*']});
      manager.setManifestParameters(
          createManifestParams({includeInRequests: ['segment']}));
      expect(decorated(manager, RequestType.SEGMENT, createSegmentContext()))
          .toBe(true);
      expect(decorated(manager, RequestType.MANIFEST, mpdContext)).toBe(false);
      expect(decorated(manager, RequestType.LICENSE)).toBe(false);
    });

    it('decorates nothing when the manifest list is empty', () => {
      const {manager} = createManager(createMockPlayer(),
          {includeInRequests: []});
      manager.setManifestParameters(
          createManifestParams({includeInRequests: []}));
      expect(decorated(manager, RequestType.SEGMENT, createSegmentContext()))
          .toBe(false);
      expect(decorated(manager, RequestType.MANIFEST, mpdContext)).toBe(false);
    });

    it('gates sidecar text and src= URIs on the segment token', () => {
      const {manager} = createManager(createMockPlayer(),
          {includeInRequests: ['mpd']});
      expect(manager.appendSrcData('https://test.com/a.mp4', 'video/mp4'))
          .toBe('https://test.com/a.mp4');
      expect(manager.appendTextTrackData('https://test.com/a.vtt'))
          .toBe('https://test.com/a.vtt');
      const r = createRequest('https://test.com/a.vtt');
      manager.applyTextData(r);
      expect(r.uris[0]).toBe('https://test.com/a.vtt');

      const {manager: withSegments} = createManager(createMockPlayer(),
          {includeInRequests: ['segment']});
      expect(withSegments.appendSrcData('https://test.com/a.mp4', 'video/mp4'))
          .toContain('CMCD=');
    });
  });

  // ── Configuration translation ──

  describe('toReporterConfig_', () => {
    it('renames useHeaders to transmissionMode', () => {
      const player = createMockPlayer();
      const {manager} = createManager(player, {useHeaders: true});
      const cfg = priv(manager)['toReporterConfig_'](
          createConfig({useHeaders: true}));
      expect(cfg.transmissionMode).toBe(cml.cmcd.CMCD_HEADERS);
      const cfg2 = priv(manager)['toReporterConfig_'](
          createConfig({useHeaders: false}));
      expect(cfg2.transmissionMode).toBe(cml.cmcd.CMCD_QUERY);
    });

    it('maps version 1 → CMCD_V1, version 2 → CMCD_V2', () => {
      const player = createMockPlayer();
      const {manager} = createManager(player);
      const v1 = priv(manager)['toReporterConfig_'](createConfig({version: 1}));
      expect(v1.version).toBe(cml.cmcd.CMCD_V1);
      const v2 = priv(manager)['toReporterConfig_'](createConfig({version: 2}));
      expect(v2.version).toBe(cml.cmcd.CMCD_V2);
    });

    it('expands empty includeKeys to all keys for the version', () => {
      const player = createMockPlayer();
      const {manager} = createManager(player);
      const v2Cfg = priv(manager)['toReporterConfig_'](
          createConfig({version: 2, includeKeys: []}));
      // V2 expansion includes request + response + event keys.
      expect(v2Cfg.enabledKeys.length).toBeGreaterThan(
          cml.cmcd.CMCD_REQUEST_KEYS.length);
      const v1Cfg = priv(manager)['toReporterConfig_'](
          createConfig({version: 1, includeKeys: []}));
      // V1 expansion is the V1 keyset only.
      expect(v1Cfg.enabledKeys.length).toBe(cml.cmcd.CMCD_V1_KEYS.length);
    });

    it('preserves user-supplied includeKeys', () => {
      const player = createMockPlayer();
      const {manager} = createManager(player);
      const cfg = priv(manager)['toReporterConfig_'](
          createConfig({includeKeys: ['cid', 'sid']}));
      expect(cfg.enabledKeys).toEqual(['cid', 'sid']);
    });

    it('renames per-target includeKeys → enabledKeys, interval, batchSize',
        () => {
          const player = createMockPlayer();
          const {manager} = createManager(player);
          const cfg = priv(manager)['toReporterConfig_'](createConfig({
            eventTargets: [{
              enabled: true,
              url: 'https://collector/cmcd',
              events: [EventType.PLAY_STATE],
              includeKeys: ['ot', 'sf'],
              interval: 15,
              batchSize: 5,
              mode: 'response',
              useHeaders: false,
            }],
          }));
          expect(cfg.eventTargets.length).toBe(1);
          expect(cfg.eventTargets[0].url).toBe('https://collector/cmcd');
          expect(cfg.eventTargets[0].enabledKeys).toEqual(['ot', 'sf']);
          expect(cfg.eventTargets[0].interval).toBe(15);
          expect(cfg.eventTargets[0].batchSize).toBe(5);
          expect(cfg.eventTargets[0].events).toEqual([EventType.PLAY_STATE]);
        });

    it('skips event targets that are disabled or missing url/events', () => {
      const player = createMockPlayer();
      const {manager} = createManager(player);
      const cfg = priv(manager)['toReporterConfig_'](createConfig({
        eventTargets: [
          {enabled: false, url: 'x', events: [EventType.PLAY_STATE],
            includeKeys: [], mode: '', useHeaders: false},
          {enabled: true, url: '', events: [EventType.PLAY_STATE],
            includeKeys: [], mode: '', useHeaders: false},
          {enabled: true, url: 'x', events: [],
            includeKeys: [], mode: '', useHeaders: false},
          {enabled: true, url: 'https://collector/cmcd',
            events: [EventType.ERROR],
            includeKeys: [], mode: '', useHeaders: false},
        ],
      }));
      expect(cfg.eventTargets.length).toBe(1);
      expect(cfg.eventTargets[0].url).toBe('https://collector/cmcd');
    });

    it('auto-generates a sessionId without mutating the app config', () => {
      const player = createMockPlayer();
      const {manager, config} = createManager(player, {sessionId: ''});
      expect(priv(manager)['effective_'].sessionId).toBeTruthy();
      expect(config.sessionId).toBe('');
    });
  });

  // ── Request mode (applyRequestData) ──

  describe('applyRequestData', () => {
    /** @type {shaka.util.CmcdManager} */
    let manager;

    beforeEach(() => {
      const player = createMockPlayer();
      const result = createManager(player, {includeKeys: ['cid', 'sid', 'ot']});
      manager = result.manager;
    });

    it('no-ops when reporter is absent (enabled=false)', () => {
      const player = createMockPlayer();
      const {manager: m2} = createManager(player, {enabled: false});
      const r = createRequest();
      const originalUri = r.uris[0];
      m2.applyRequestData(RequestType.MANIFEST, r,
          /** @type {shaka.extern.RequestContext} */ (
            {type: AdvancedRequestType.MPD}));
      expect(r.uris[0]).toBe(originalUri);
    });

    it('routes MANIFEST through createRequestReport with ot=m', () => {
      spyOn(priv(manager)['reporter_'], 'createRequestReport')
          .and.callThrough();
      const r = createRequest('https://test.com/manifest.mpd');
      manager.applyRequestData(RequestType.MANIFEST, r,
          /** @type {shaka.extern.RequestContext} */ (
            {type: AdvancedRequestType.MPD}));
      expect(priv(manager)['reporter_'].createRequestReport).toHaveBeenCalled();
      const reporter = priv(manager)['reporter_'];
      const args = /** @type {!Array} */ (
        reporter.createRequestReport.calls.mostRecent().args);
      expect(args[1].ot).toBe(ObjectType.MANIFEST);
    });

    it('routes SEGMENT requests with the segment payload', () => {
      spyOn(priv(manager)['reporter_'], 'createRequestReport')
          .and.callThrough();
      const r = createRequest();
      manager.applyRequestData(RequestType.SEGMENT, r,
          createSegmentContext('video'));
      expect(priv(manager)['reporter_'].createRequestReport).toHaveBeenCalled();
      const data = /** @type {!Object} */ (
        priv(manager)['reporter_'].createRequestReport.calls
            .mostRecent().args[1]);
      expect(data.ot).toBe(ObjectType.VIDEO);
    });

    it('routes LICENSE/KEY/SERVER_CERTIFICATE with ot=k', () => {
      spyOn(priv(manager)['reporter_'], 'createRequestReport')
          .and.callThrough();
      for (const type of [
        RequestType.LICENSE, RequestType.KEY, RequestType.SERVER_CERTIFICATE,
      ]) {
        manager.applyRequestData(type, createRequest());
        const data = /** @type {!Object} */ (
          priv(manager)['reporter_'].createRequestReport.calls
              .mostRecent().args[1]);
        expect(data.ot).toBe(ObjectType.KEY);
      }
    });

    it('routes TIMING with ot=o', () => {
      spyOn(priv(manager)['reporter_'], 'createRequestReport')
          .and.callThrough();
      manager.applyRequestData(RequestType.TIMING, createRequest());
      const data = /** @type {!Object} */ (
        priv(manager)['reporter_'].createRequestReport.calls
            .mostRecent().args[1]);
      expect(data.ot).toBe(ObjectType.OTHER);
    });

    it('updates streaming format on first manifest request', () => {
      spyOn(priv(manager)['reporter_'], 'update').and.callThrough();
      manager.applyRequestData(RequestType.MANIFEST, createRequest(),
          /** @type {shaka.extern.RequestContext} */ (
            {type: AdvancedRequestType.MPD}));
      expect(priv(manager)['reporter_'].update).toHaveBeenCalledWith(
          jasmine.objectContaining({sf: StreamingFormat.DASH}));
    });

    it('rewrites all URIs in a multi-URI request (query mode)', () => {
      const r = createRequest();
      r.uris = [
        'https://cdn1.example.com/seg.mp4',
        'https://cdn2.example.com/seg.mp4',
      ];
      manager.applyRequestData(RequestType.SEGMENT, r,
          createSegmentContext('video'));
      expect(r.uris[0]).toContain('CMCD=');
      expect(r.uris[1]).toContain('CMCD=');
      expect(r.uris[0]).toContain('cdn1.example.com');
      expect(r.uris[1]).toContain('cdn2.example.com');
    });

    it('writes CMCD-* headers when useHeaders is true', () => {
      const player = createMockPlayer();
      const {manager: m} = createManager(player,
          {useHeaders: true, includeKeys: ['cid', 'sid']});
      const r = createRequest();
      m.applyRequestData(RequestType.SEGMENT, r,
          createSegmentContext('video'));
      const headerKeys = Object.keys(r.headers);
      expect(headerKeys.some((k) => k.startsWith('CMCD-'))).toBe(true);
    });

    it('records request initiation timestamp for SEGMENT requests', () => {
      const r = createRequest();
      manager.applyRequestData(RequestType.SEGMENT, r,
          createSegmentContext('video'));
      expect(priv(manager)['requestTimestampMap_'].has(r)).toBe(true);
    });

    it('sets su=true on segment requests while buffering (initial)', () => {
      spyOn(priv(manager)['reporter_'], 'createRequestReport')
          .and.callThrough();
      const r = createRequest();
      // lastPlayerState_ is null by default (not yet playing) → su=true
      manager.applyRequestData(RequestType.SEGMENT, r,
          createSegmentContext('video'));
      const data = /** @type {!Object} */ (
        priv(manager)['reporter_'].createRequestReport.calls
            .mostRecent().args[1]);
      expect(data.su).toBe(true);
    });

    it('sets su=false on segment requests when playing', () => {
      spyOn(priv(manager)['reporter_'], 'createRequestReport')
          .and.callThrough();
      // Simulate player in PLAYING state
      priv(manager)['lastPlayerState_'] = PlayerState.PLAYING;
      const r = createRequest();
      manager.applyRequestData(RequestType.SEGMENT, r,
          createSegmentContext('video'));
      const data = /** @type {!Object} */ (
        priv(manager)['reporter_'].createRequestReport.calls
            .mostRecent().args[1]);
      expect(data.su).toBe(false);
    });

    it('sets su=true on segment requests during rebuffering', () => {
      spyOn(priv(manager)['reporter_'], 'createRequestReport')
          .and.callThrough();
      priv(manager)['lastPlayerState_'] = PlayerState.REBUFFERING;
      const r = createRequest();
      manager.applyRequestData(RequestType.SEGMENT, r,
          createSegmentContext('video'));
      const data = /** @type {!Object} */ (
        priv(manager)['reporter_'].createRequestReport.calls
            .mostRecent().args[1]);
      expect(data.su).toBe(true);
    });

    it('handles HEAD method with empty payload', () => {
      spyOn(priv(manager)['reporter_'], 'createRequestReport')
          .and.callThrough();
      const r = createRequest();
      r.method = 'HEAD';
      manager.applyRequestData(RequestType.SEGMENT, r,
          createSegmentContext('video'));
      const data = /** @type {!Object} */ (
        priv(manager)['reporter_'].createRequestReport.calls
            .mostRecent().args[1]);
      expect(Object.keys(data).length).toBe(0);
    });
  });

  // ── Response mode (applyResponseData) ──

  describe('applyResponseData', () => {
    function createResponseConfig() {
      return createConfig({
        eventTargets: [{
          enabled: true,
          url: 'https://collector/cmcd',
          events: [EventType.RESPONSE_RECEIVED],
          includeKeys: [],
          mode: 'response',
          useHeaders: false,
        }],
      });
    }

    it('no-ops when no event target subscribes to rr', () => {
      const player = createMockPlayer();
      const {manager} = createManager(player);
      spyOn(priv(manager)['reporter_'], 'recordResponseReceived');
      manager.applyResponseData(RequestType.SEGMENT,
          /** @type {shaka.extern.Response} */ (
            {status: 200, uri: 'https://test/seg', headers: {}}));
      expect(priv(manager)['reporter_'].recordResponseReceived)
          .not.toHaveBeenCalled();
    });

    it('cleans up requestTimestampMap_ even when response mode is disabled',
        () => {
          const player = createMockPlayer();
          // Default config has no eventTargets → responseModeEnabled_=false
          const {manager} = createManager(player);
          const r = createRequest();
          // Seed the timestamp map via applyRequestData
          manager.applyRequestData(RequestType.SEGMENT, r,
              createSegmentContext('video'));
          expect(priv(manager)['requestTimestampMap_'].has(r)).toBe(true);
          // applyResponseData should clean up even though rr reporting is off
          manager.applyResponseData(RequestType.SEGMENT,
              /** @type {shaka.extern.Response} */ ({
                status: 200,
                uri: 'https://test/seg.mp4',
                originalRequest: r,
                headers: {},
              }));
          expect(priv(manager)['requestTimestampMap_'].has(r)).toBe(false);
        });

    it('forwards response data to recordResponseReceived', () => {
      const player = createMockPlayer();
      const {manager} = createManager(player, createResponseConfig());
      spyOn(priv(manager)['reporter_'], 'recordResponseReceived');
      const r = createRequest();
      // Seed timestamp map first.
      manager.applyRequestData(RequestType.SEGMENT, r,
          createSegmentContext('video'));
      manager.applyResponseData(RequestType.SEGMENT,
          /** @type {shaka.extern.Response} */ ({
            status: 200,
            uri: 'https://test/seg.mp4',
            originalUri: 'https://test/seg.mp4',
            originalRequest: r,
            timeMs: 50,
            headers: {},
          }));
      expect(priv(manager)['reporter_'].recordResponseReceived)
          .toHaveBeenCalled();
      const args =
      /** @type {!Array} */ (
          priv(manager)['reporter_'].recordResponseReceived.calls
              .mostRecent().args);
      const data = /** @type {!Object} */ (args[1]);
      expect(data.rc).toBe(200);
      expect(data.ttlb).toBe(50);
      expect(data.url).toBe('https://test/seg.mp4');
    });

    it('only fires for SEGMENT responses', () => {
      const player = createMockPlayer();
      const {manager} = createManager(player, createResponseConfig());
      spyOn(priv(manager)['reporter_'], 'recordResponseReceived');
      manager.applyResponseData(RequestType.MANIFEST,
          /** @type {shaka.extern.Response} */ (
            {status: 200, uri: 'https://test/m', headers: {}}));
      expect(priv(manager)['reporter_'].recordResponseReceived)
          .not.toHaveBeenCalled();
    });

    it('strips CMCD query from the reported url', () => {
      const player = createMockPlayer();
      const {manager} = createManager(player, createResponseConfig());
      spyOn(priv(manager)['reporter_'], 'recordResponseReceived');
      manager.applyResponseData(RequestType.SEGMENT,
          /** @type {shaka.extern.Response} */ ({
            status: 200,
            uri: 'https://test/seg.mp4?CMCD=cid%3D%22x%22',
            originalUri: 'https://test/seg.mp4?CMCD=cid%3D%22x%22',
            originalRequest: createRequest(),
            timeMs: 50,
            headers: {},
          }));
      const data = /** @type {!Object} */ (
        priv(manager)['reporter_'].recordResponseReceived.calls
            .mostRecent().args[1]);
      expect(data.url).toBe('https://test/seg.mp4');
    });
  });

  // ── Player-state deduplication ──

  describe('player-state deduplication', () => {
    it('emits an update on each unique state transition', () => {
      // v2.4.0: adapter calls update({sta}); CmcdReporter auto-fires
      // PLAY_STATE from update() when sta changes vs. lastEmitted.
      // Adapter-side lastPlayerState_ short-circuits before entering
      // the reporter.
      const player = createMockPlayer();
      const {manager} = createManager(player);
      spyOn(priv(manager)['reporter_'], 'update');
      priv(manager)['setPlayerState_'](PlayerState.PLAYING);
      priv(manager)['setPlayerState_'](PlayerState.PAUSED);
      priv(manager)['setPlayerState_'](PlayerState.PLAYING);
      expect(priv(manager)['reporter_'].update).toHaveBeenCalledTimes(3);
    });

    it('suppresses duplicates of the same state', () => {
      // Adapter-side lastPlayerState_ deduplication short-circuits before
      // entering the reporter; the reporter's own deduplication is a
      // backstop.
      const player = createMockPlayer();
      const {manager} = createManager(player);
      spyOn(priv(manager)['reporter_'], 'update');
      priv(manager)['setPlayerState_'](PlayerState.PLAYING);
      priv(manager)['setPlayerState_'](PlayerState.PLAYING);
      priv(manager)['setPlayerState_'](PlayerState.PLAYING);
      expect(priv(manager)['reporter_'].update).toHaveBeenCalledTimes(1);
    });

    it('updates with sta wire key on transition', () => {
      const player = createMockPlayer();
      const {manager} = createManager(player);
      spyOn(priv(manager)['reporter_'], 'update');
      priv(manager)['setPlayerState_'](PlayerState.SEEKING);
      expect(priv(manager)['reporter_'].update).toHaveBeenCalledWith(
          {sta: PlayerState.SEEKING});
    });
  });

  // ── Player event listener wiring ──

  describe('player event wiring', () => {
    /** @type {shaka.util.CmcdManager} */
    let manager;
    /** @type {shaka.util.FakeEventTarget} */
    let player;
    /** @type {!MockCmcdVideo} */
    let video;

    beforeEach(() => {
      player = createMockPlayer();
      const config = createConfig();
      manager = new CmcdManager(
          /** @type {!shaka.Player} */ (player), config);
      video = new MockCmcdVideo();
      manager.setMediaElement(
          /** @type {!HTMLMediaElement} */ (/** @type {*} */ (video)));
    });

    it('translates pause → PAUSED player-state', () => {
      // v2.4.0: adapter calls update({sta}); reporter auto-fires
      // PLAY_STATE from update.
      spyOn(priv(manager)['reporter_'], 'update');
      video.dispatchEvent(new shaka.util.FakeEvent('pause'));
      expect(priv(manager)['reporter_'].update).toHaveBeenCalledWith(
          {sta: PlayerState.PAUSED});
    });

    it('translates seeking → SEEKING player-state', () => {
      spyOn(priv(manager)['reporter_'], 'recordEvent');
      video.dispatchEvent(new shaka.util.FakeEvent('seeking'));
      expect(priv(manager)['reporter_'].recordEvent).toHaveBeenCalledWith(
          EventType.PLAY_STATE);
    });

    it('translates ended → ENDED player-state', () => {
      spyOn(priv(manager)['reporter_'], 'update');
      video.dispatchEvent(new shaka.util.FakeEvent('ended'));
      expect(priv(manager)['reporter_'].update).toHaveBeenCalledWith(
          {sta: PlayerState.ENDED});
    });

    it('translates volumechange → MUTE/UNMUTE event', () => {
      spyOn(priv(manager)['reporter_'], 'recordEvent');
      video.muted = true;
      video.dispatchEvent(new shaka.util.FakeEvent('volumechange'));
      expect(priv(manager)['reporter_'].recordEvent)
          .toHaveBeenCalledWith(EventType.MUTE);
      video.muted = false;
      video.dispatchEvent(new shaka.util.FakeEvent('volumechange'));
      expect(priv(manager)['reporter_'].recordEvent)
          .toHaveBeenCalledWith(EventType.UNMUTE);
    });

    it('translates Player buffering event → REBUFFERING/PLAYING', () => {
      spyOn(priv(manager)['reporter_'], 'update');
      const evt = new shaka.util.FakeEvent('buffering');
      evt['buffering'] = true;
      player.dispatchEvent(evt);
      expect(priv(manager)['reporter_'].update).toHaveBeenCalledWith(
          {sta: PlayerState.REBUFFERING});
      const evt2 = new shaka.util.FakeEvent('buffering');
      evt2['buffering'] = false;
      player.dispatchEvent(evt2);
      expect(priv(manager)['reporter_'].update).toHaveBeenCalledWith(
          {sta: PlayerState.PLAYING});
    });

    it('translates Player adaptation → BITRATE_CHANGE', () => {
      // v2.4.0: adapter calls update({br}); reporter auto-fires
      // BITRATE_CHANGE from update.
      spyOn(priv(manager)['reporter_'], 'update');
      player.dispatchEvent(new shaka.util.FakeEvent('adaptation'));
      expect(priv(manager)['reporter_'].update).toHaveBeenCalledWith(
          {br: [5000]});
    });

    it('translates Player error → FATAL_ERROR + ERROR', () => {
      spyOn(priv(manager)['reporter_'], 'recordEvent');
      player.dispatchEvent(new shaka.util.FakeEvent('error'));
      expect(priv(manager)['reporter_'].recordEvent).toHaveBeenCalledWith(
          EventType.PLAY_STATE);
      expect(priv(manager)['reporter_'].recordEvent).toHaveBeenCalledWith(
          EventType.ERROR);
    });

    it('translates Player complete → ENDED player-state', () => {
      spyOn(priv(manager)['reporter_'], 'update');
      player.dispatchEvent(new shaka.util.FakeEvent('complete'));
      expect(priv(manager)['reporter_'].update).toHaveBeenCalledWith(
          {sta: PlayerState.ENDED});
    });

    it('emits msd on first playing event after setStartTimeOfLoad', () => {
      spyOn(priv(manager)['reporter_'], 'update').and.callThrough();
      const before = Date.now();
      // Simulate player.js calling setStartTimeOfLoad with a timestamp ~200ms
      // in the past to exercise the msd computation path.
      manager.setStartTimeOfLoad(before - 200);
      video.dispatchEvent(new shaka.util.FakeEvent('playing'));
      const calls = /** @type {!Array} */ (
        priv(manager)['reporter_'].update.calls.allArgs());
      const msdCall = calls.find((args) => args[0] && args[0].msd != null);
      expect(msdCall).toBeDefined();
      expect(msdCall[0].msd).toBeGreaterThanOrEqual(200);
      // startTimeOfLoad_ should be cleared so a second playing event
      // does NOT re-emit msd.
      expect(priv(manager)['startTimeOfLoad_']).toBe(0);
    });

    it('does not emit msd if setStartTimeOfLoad was not called', () => {
      spyOn(priv(manager)['reporter_'], 'update').and.callThrough();
      // startTimeOfLoad_ is 0 (falsy) by default
      video.dispatchEvent(new shaka.util.FakeEvent('playing'));
      const calls = /** @type {!Array} */ (
        priv(manager)['reporter_'].update.calls.allArgs());
      const msdCall = calls.find((args) => args[0] && args[0].msd != null);
      expect(msdCall).toBeUndefined();
    });
  });

  // ── Externally-applied URI helpers ──

  describe('appendSrcData / appendTextTrackData', () => {
    /** @type {shaka.util.CmcdManager} */
    let manager;

    beforeEach(() => {
      const player = createMockPlayer();
      const result = createManager(player);
      manager = result.manager;
    });

    it('appendSrcData adds CMCD query to a media URI', () => {
      const out = manager.appendSrcData(
          'https://test.com/file.mp4', 'video/mp4');
      expect(out).toContain('CMCD=');
      // video/mp4 mimeType maps to MUXED (`'av'`).
      expect(decodeURIComponent(out)).toContain('ot=av');
    });

    it('appendTextTrackData adds CMCD query to a text URI', () => {
      const out = manager.appendTextTrackData('https://test.com/captions.vtt');
      expect(out).toContain('CMCD=');
      expect(decodeURIComponent(out)).toContain('ot=c');
    });

    it('returns input URI unchanged when disabled', () => {
      const player = createMockPlayer();
      const {manager: m2} = createManager(player, {enabled: false});
      const uri = 'https://test.com/file.mp4';
      expect(m2.appendSrcData(uri, 'video/mp4')).toBe(uri);
      expect(m2.appendTextTrackData(uri)).toBe(uri);
    });

    it('passes through offline: URIs unchanged', () => {
      const out = manager.appendSrcData('offline:abc', 'video/mp4');
      // Offline scheme is rare — appendCmcdQuery treats it as a string and
      // appends; we accept either no rewrite or a rewrite that preserves
      // the offline: prefix.
      expect(out.startsWith('offline:abc')).toBe(true);
    });
  });

  // ── Adapter helpers (shaka knowledge) ──

  describe('adapter helpers', () => {
    /** @type {shaka.util.CmcdManager} */
    let manager;

    beforeEach(() => {
      const player = createMockPlayer();
      const result = createManager(player);
      manager = result.manager;
    });

    it('getStreamFormat_ maps DASH/HLS', () => {
      expect(priv(manager)['getStreamFormat_'](AdvancedRequestType.MPD))
          .toBe(StreamingFormat.DASH);
      expect(priv(manager)['getStreamFormat_'](
          AdvancedRequestType.MASTER_PLAYLIST))
          .toBe(StreamingFormat.HLS);
      expect(priv(manager)['getStreamFormat_'](
          AdvancedRequestType.MEDIA_PLAYLIST))
          .toBe(StreamingFormat.HLS);
    });

    it('getStreamType_ reflects player live state', () => {
      expect(priv(manager)['getStreamType_']())
          .toBe(cml.cmcd.CmcdStreamType.VOD);
    });

    it('getObjectType_ maps stream type to CmcdObjectType', () => {
      const ctx = createSegmentContext('video');
      expect(priv(manager)['getObjectType_'](ctx)).toBe(ObjectType.VIDEO);
      const audioCtx = createSegmentContext('audio');
      expect(priv(manager)['getObjectType_'](audioCtx)).toBe(ObjectType.AUDIO);
    });

    it('getObjectType_ returns INIT for INIT_SEGMENT', () => {
      const ctx = /** @type {shaka.extern.RequestContext} */ ({
        type: AdvancedRequestType.INIT_SEGMENT,
        stream: null,
        segment: null,
      });
      expect(priv(manager)['getObjectType_'](ctx)).toBe(ObjectType.INIT);
    });

    it('getObjectTypeFromMimeType_ maps known MIME types', () => {
      expect(priv(manager)['getObjectTypeFromMimeType_']('audio/mp4'))
          .toBe(ObjectType.AUDIO);
      expect(priv(manager)['getObjectTypeFromMimeType_']('video/mp4'))
          .toBe(ObjectType.MUXED);
      expect(priv(manager)['getObjectTypeFromMimeType_'](
          'application/dash+xml')).toBe(ObjectType.MANIFEST);
      expect(priv(manager)['getObjectTypeFromMimeType_']('unknown/unknown'))
          .toBeUndefined();
    });

    it('calculateRtp_ computes bitrate × rtpSafetyFactor', () => {
      const stream = /** @type {shaka.extern.Stream} */ (
        {bandwidth: 1000000, type: 'video'});
      const segment = /** @type {shaka.media.SegmentReference} */ (
        {startTime: 0, endTime: 4});
      const rtp = priv(manager)['calculateRtp_'](stream, segment);
      // segmentSize = 1000000 * 4 / 1000 = 4000
      // timeToLoad = 20000 / 1 / 1000 = 20
      // minBandwidth = 4000 / 20 = 200
      // rtp = 200 * 5 = 1000
      expect(rtp).toBe(1000);
    });
  });

  // ── Event-mode dispatch via NetworkingEngine (Bucket C smoke) ──

  describe('event-mode dispatch', () => {
    it('routes event-mode reports through NetworkingEngine', async () => {
      const player = createMockPlayer();
      let captured = null;
      const networkingEngine = /** @type {shaka.net.NetworkingEngine} */ ({
        request: jasmine.createSpy('request').and.callFake(
            (type, request, context) => {
              captured = {type, request, context};
              return {
                promise: Promise.resolve(
                    {data: new ArrayBuffer(0), uri: '', headers: {}}),
                abort: () => Promise.resolve(),
              };
            }),
      });
      player.getNetworkingEngine = () => networkingEngine;

      const {manager} = createManager(player, {
        eventTargets: [{
          enabled: true,
          url: 'https://collector/cmcd',
          events: [EventType.PLAY_STATE],
          includeKeys: ['cid', 'sid', 'sta'],
          interval: 0,
          batchSize: 1,
          mode: 'response',
          useHeaders: false,
        }],
      });

      // Trigger a play-state change → reporter queues an event → flushes
      // via the requester callback → NetworkingEngine.request called.
      priv(manager)['setPlayerState_'](PlayerState.PLAYING);
      priv(manager)['reporter_'].flush();

      // Allow the async requester to resolve.
      await Promise.resolve();
      await Promise.resolve();

      expect(networkingEngine.request).toHaveBeenCalled();
      expect(captured.type).toBe(RequestType.CMCD);
      expect(captured.request.method).toBe('POST');
    });
  });

  // ── End-to-end smoke (Bucket C) ──

  describe('end-to-end smoke', () => {
    /**
     * Build a manager and exercise it end-to-end with a real reporter.
     * Verifies the encoded wire output for each combination of v1/v2 ×
     * query/headers transmission mode.
     *
     * @param {!Object} configOverrides
     * @return {string|!Object<string, string>}
     */
    function exerciseAndCollect(configOverrides) {
      const player = createMockPlayer();
      const {manager} = createManager(player, Object.assign(
          {includeKeys: ['cid', 'sid', 'ot', 'sf']}, configOverrides));
      const r = createRequest();
      manager.applyRequestData(RequestType.MANIFEST, r,
          /** @type {shaka.extern.RequestContext} */ (
            {type: AdvancedRequestType.MPD}));
      return configOverrides.useHeaders ? r.headers : r.uris[0];
    }

    it('v1 + query: emits CMCD as URL query parameter', () => {
      const out = /** @type {string} */ (
        exerciseAndCollect({version: 1, useHeaders: false}));
      expect(out).toContain('CMCD=');
      expect(out).toContain('ot%3Dm');
    });

    it('v2 + query: includes v=2 in the encoded output', () => {
      const out = /** @type {string} */ (
        exerciseAndCollect({version: 2, useHeaders: false}));
      expect(out).toContain('CMCD=');
      expect(out).toContain('v%3D2');
    });

    it('v1 + headers: writes CMCD-Object/Request/Session shards', () => {
      const headers = /** @type {!Object<string, string>} */ (
        exerciseAndCollect({version: 1, useHeaders: true}));
      const headerKeys = Object.keys(headers);
      expect(headerKeys.some((k) => k.startsWith('CMCD-'))).toBe(true);
    });

    it('v2 + headers: places v=2 in CMCD-Session only', () => {
      const headers = /** @type {!Object<string, string>} */ (
        exerciseAndCollect({version: 2, useHeaders: true}));
      // CMCD-Session is the only shard that should carry v=2.
      const session = headers['CMCD-Session'] || '';
      expect(session).toContain('v=2');
      // None of the other shards should carry v=2.
      for (const key of Object.keys(headers)) {
        if (key !== 'CMCD-Session') {
          expect(headers[key]).not.toContain('v=2');
        }
      }
    });
  });
});
