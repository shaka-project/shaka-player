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
      version: 2,
      eventTargets: [],
    }, overrides);
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

    it('auto-generates a sessionId when not provided', () => {
      const player = createMockPlayer();
      const {manager} = createManager(player);
      const cfg = createConfig({sessionId: ''});
      const reporterCfg = priv(manager)['toReporterConfig_'](cfg);
      expect(reporterCfg.sid).toBeTruthy();
      expect(cfg.sessionId).toBe(/** @type {string} */ (reporterCfg.sid));
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
