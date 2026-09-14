/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.CmcdManager');

goog.require('goog.asserts');
goog.require('cml.cmcd.CMCD_EVENT_KEYS');
goog.require('cml.cmcd.CMCD_HEADERS');
goog.require('cml.cmcd.CMCD_QUERY');
goog.require('cml.cmcd.CMCD_REQUEST_KEYS');
goog.require('cml.cmcd.CMCD_REQUEST_MODE');
goog.require('cml.cmcd.CMCD_RESPONSE_KEYS');
goog.require('cml.cmcd.CMCD_V1');
goog.require('cml.cmcd.CMCD_V1_KEYS');
goog.require('cml.cmcd.CMCD_V2');
goog.require('cml.cmcd.CmcdEventType');
goog.require('cml.cmcd.CmcdObjectType');
goog.require('cml.cmcd.CmcdPlayerState');
goog.require('cml.cmcd.CmcdReporter');
goog.require('cml.cmcd.CmcdStreamType');
goog.require('cml.cmcd.CmcdStreamingFormat');
goog.require('cml.cmcd.appendCmcdQuery');
goog.require('cml.cmcd.isCmcdCustomKey');

goog.require('shaka.log');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.ArrayUtils');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.StringUtils');

goog.requireType('cml.cmcd.Cmcd');
goog.requireType('cml.cmcd.CmcdEncodeOptions');
goog.requireType('cml.cmcd.CmcdReporterConfig');
goog.requireType('shaka.media.SegmentReference');
goog.requireType('shaka.Player');


/**
 * @summary
 * Thin shaka adapter around `cml.cmcd.CmcdReporter`. The vendored
 * reporter owns CMCD state, encoding, key filtering, sequence numbers,
 * and event-mode dispatch. The adapter translates shaka's player /
 * `<video>` events into reporter calls, and shaka's request/response
 * shapes into CML's HttpRequest/HttpResponse shapes.
 *
 * Adapter responsibilities:
 *   1. Lifecycle: construct/start/stop CmcdReporter from configure() /
 *      onLoad() / reset()
 *   2. Player wiring: <video> + Player events → reporter.update.
 *      State-change events (PLAY_STATE/BITRATE_CHANGE/BACKGROUNDED_MODE)
 *      auto-fire from update() since v2.4.0; adapter only invokes
 *      recordEvent() for non-state-change events (MUTE/UNMUTE/ERROR/etc.).
 *   3. Request mode: applyRequestData → reporter.createRequestReport
 *   4. Response mode: applyResponseData → reporter.recordResponseReceived
 *   5. Event mode: requester callback → NetworkingEngine.request
 *   6. Config translation: shaka.extern.CmcdConfiguration → CmcdReporterConfig
 *   7. Public-API back-compat: re-exports for StreamingFormat / EventType /
 *      PlayerState
 */
shaka.util.CmcdManager = class {
  /**
   * @param {shaka.Player} player
   * @param {shaka.extern.CmcdConfiguration} config
   */
  constructor(player, config) {
    /** @private {?shaka.Player} */
    this.player_ = player;

    /** @private {?shaka.extern.CmcdConfiguration} */
    this.config_ = config;

    /**
     * CMCD parameters signaled by the manifest, or null.
     *
     * @private {?shaka.extern.ClientDataReporting}
     */
    this.manifestParams_ = null;

    /**
     * Session id generated when neither the app nor the manifest supplies
     * one. Kept across reporter rebuilds; cleared by reset() so each
     * playback session gets a fresh id.
     *
     * @private {?string}
     */
    this.generatedSessionId_ = null;

    /**
     * The configuration actually in effect: app config merged with manifest
     * parameters.
     *
     * @private {!shaka.util.CmcdManager.EffectiveConfig}
     */
    this.effective_ = this.resolveEffectiveConfig_();

    /** @private {HTMLMediaElement} */
    this.video_ = null;

    /** @private {?cml.cmcd.CmcdReporter} */
    this.reporter_ = null;

    /** @private {?string} */
    this.lastPlayerState_ = null;

    /**
     * Streaming format set once at manifest-load time. CTA-5004 / CTA-5004-B
     * define `sf` as a stable manifest-type indicator (`'d'`/`'h'`/`'s'`/
     * `'o'`); the value does not reflect the low-latency state.
     *
     * @private {(cml.cmcd.CmcdStreamingFormat|undefined)}
     */
    this.sf_ = undefined;

    /**
     * Per-request `ts` values for TTFB/TTLB derivation in
     * `applyResponseData`. CmcdReporter cannot observe request-send time;
     * the adapter measures it.
     *
     * @private {!Map<!shaka.extern.Request, number>}
     */
    this.requestTimestampMap_ = new Map();

    /** @private {shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();

    /** @private {number} */
    this.startTimeOfLoad_ = 0;
  }

  /**
   * Set the media element and start the reporter (if enabled).
   *
   * @param {HTMLMediaElement} mediaElement The video element
   */
  setMediaElement(mediaElement) {
    this.video_ = mediaElement;
    this.maybeStartReporter_();
  }

  /**
   * Update the application configuration. If the effective configuration
   * changes materially, the reporter is torn down and recreated.
   *
   * @param {shaka.extern.CmcdConfiguration} config
   */
  configure(config) {
    this.config_ = config;
    this.applyEffectiveConfig_();
  }

  /**
   * Apply CMCD parameters signaled by the manifest (DASH
   * ServiceDescription/ClientDataReporting, ISO/IEC 23009-1:2026 Annex K).
   * Pass null when the manifest carries none. Honored only while
   * `applyParametersFromManifest` is enabled in the app configuration.
   *
   * @param {?shaka.extern.ClientDataReporting} params
   */
  setManifestParameters(params) {
    this.manifestParams_ = params;
    this.applyEffectiveConfig_();
  }

  /**
   * Reset the manager at the end of a playback session. Stops the reporter
   * and clears all session-scoped state, including manifest parameters and
   * the generated session id. The video element reference is preserved
   * (shaka keeps it attached across unload()/load(); only detach() releases
   * it), so onLoad() can re-arm the reporter for the next session.
   */
  reset() {
    this.stopReporter_();
    this.manifestParams_ = null;
    this.generatedSessionId_ = null;
    this.lastPlayerState_ = null;
    this.sf_ = undefined;
    this.startTimeOfLoad_ = 0;
    this.effective_ = this.resolveEffectiveConfig_();
  }

  /**
   * Recompute the effective configuration and rebuild the reporter when a
   * material field changed.
   *
   * @private
   */
  applyEffectiveConfig_() {
    const previous = this.effective_;
    this.effective_ = this.resolveEffectiveConfig_();
    if (this.reporter_ &&
        shaka.util.CmcdManager.isMaterialChange_(previous, this.effective_)) {
      this.stopReporter_();
    }
    this.maybeStartReporter_();
  }

  /**
   * @return {!shaka.util.CmcdManager.EffectiveConfig}
   * @private
   */
  resolveEffectiveConfig_() {
    return shaka.util.CmcdManager.resolveEffectiveConfig(
        /** @type {!shaka.extern.CmcdConfiguration} */ (this.config_),
        this.manifestParams_, this.generatedSessionId_);
  }

  /**
   * Stop the reporter and drop request-scoped state. Session-scoped state
   * that a rebuild must carry over (manifest parameters, the generated
   * session id, the learned `sf`, the last player state and the start time
   * of load) is kept, so that a rebuild triggered mid-load does not lose
   * the pending `msd` measurement.
   *
   * @private
   */
  stopReporter_() {
    if (this.reporter_) {
      this.reporter_.stop(true);
      this.reporter_ = null;
    }
    this.requestTimestampMap_.clear();
    this.eventManager_.removeAll();
  }

  /**
   * Re-arm the reporter for a new playback session. The Player calls
   * this at the start of every `load()`: each `load()` after the first
   * is preceded by an unload that stops the reporter via `reset()`, and
   * neither `setMediaElement()` (the element stays attached) nor
   * `configure()` runs again on that path, so without this hook CMCD
   * would stay silent for every load after the first
   * (https://github.com/shaka-project/shaka-player/issues/10414).
   *
   * No-ops when a reporter is already running, when CMCD is disabled,
   * or when no media element is attached.
   */
  onLoad() {
    this.maybeStartReporter_();
  }

  /**
   * Forwarded from Player buffering observer; translates to a
   * REBUFFERING / PLAYING player-state transition.
   *
   * @param {boolean} buffering
   */
  setBuffering(buffering) {
    this.setPlayerState_(buffering ?
        cml.cmcd.CmcdPlayerState.REBUFFERING :
        cml.cmcd.CmcdPlayerState.PLAYING);
  }

  /**
   * No-op shim retained for Player call-site back-compat. Phase 1
   * dropped the non-spec `'ld'`/`'lh'` StreamingFormat values; CTA-5004
   * does not define LL-specific values, so low-latency content emits
   * `sf=d` (DASH) or `sf=h` (HLS).
   *
   * @param {boolean} lowLatency
   */
  setLowLatency(lowLatency) {}

  /**
   * Set start time of load; trigger autoplay-driven start if applicable.
   *
   * @param {number} startTimeOfLoad
   */
  setStartTimeOfLoad(startTimeOfLoad) {
    if (!this.reporter_) {
      return;
    }
    this.startTimeOfLoad_ = startTimeOfLoad;
    if (this.video_ && this.video_.autoplay) {
      const playResult = this.video_.play();
      if (playResult) {
        playResult.catch(() => {
          this.startTimeOfLoad_ = 0;
        });
      }
    }
  }

  /**
   * Apply CMCD data to a request via the reporter.
   *
   * @param {!shaka.net.NetworkingEngine.RequestType} type
   * @param {!shaka.extern.Request} request
   * @param {shaka.extern.RequestContext=} context
   */
  applyRequestData(type, request, context = {}) {
    if (!this.reporter_) {
      return;
    }

    const RequestType = shaka.net.NetworkingEngine.RequestType;
    const ObjectType = cml.cmcd.CmcdObjectType;

    // Learn the streaming format from every manifest request, including one
    // that includeInRequests excludes from decoration: `sf` / `st` are
    // session-scoped state the reporter needs for the requests it does
    // decorate, not data carried by the manifest request itself.
    if (type == RequestType.MANIFEST && context.type) {
      const sf = this.getStreamFormat_(context.type);
      if (sf && sf !== this.sf_) {
        this.sf_ = sf;
        this.reporter_.update(/** @type {!cml.cmcd.Cmcd} */ (
          {sf: sf, st: this.getStreamType_()}));
      }
    }

    if (!this.shouldApplyToRequest_(type, request, context)) {
      return;
    }

    if (request.method === 'HEAD') {
      this.applyToRequest_(request, {});
      return;
    }

    switch (type) {
      case RequestType.MANIFEST:
        this.applyToRequest_(request, /** @type {!cml.cmcd.Cmcd} */ ({
          ot: ObjectType.MANIFEST,
          su: this.lastPlayerState_ === null,
        }));
        break;

      case RequestType.SEGMENT: {
        const data = this.getDataForSegment_(context, request.uris[0]);
        // Track request initiation time for TTFB/TTLB derivation when
        // the response comes back.
        if (this.requestTimestampMap_.has(request)) {
          this.requestTimestampMap_.delete(request);
        }
        this.requestTimestampMap_.set(request, Date.now());
        this.applyToRequest_(request,
            /** @type {!cml.cmcd.Cmcd} */ (data));
        break;
      }

      case RequestType.LICENSE:
      case RequestType.SERVER_CERTIFICATE:
      case RequestType.KEY:
        this.applyToRequest_(request, /** @type {!cml.cmcd.Cmcd} */ (
          {ot: ObjectType.KEY}));
        break;

      case RequestType.TIMING:
        this.applyToRequest_(request, /** @type {!cml.cmcd.Cmcd} */ (
          {ot: ObjectType.OTHER}));
        break;

      case RequestType.CONTENT_STEERING:
      case RequestType.EVENT_CALLBACK:
        this.applyToRequest_(request, /** @type {!cml.cmcd.Cmcd} */ (
          {ot: ObjectType.OTHER}));
        break;
    }
  }

  /**
   * Apply CMCD data to a response.
   *
   * @param {!shaka.net.NetworkingEngine.RequestType} type
   * @param {!shaka.extern.Response} response
   * @param {shaka.extern.RequestContext=} context
   */
  applyResponseData(type, response, context = {}) {
    if (!this.reporter_) {
      return;
    }

    const RequestType = shaka.net.NetworkingEngine.RequestType;
    if (type !== RequestType.SEGMENT) {
      return;
    }

    // Always clean up the per-request timestamp entry to prevent unbounded
    // map growth when response-mode reporting is disabled (the default when
    // eventTargets is empty). Mirrors the upstream fix in shaka-project#9193.
    const startTs = this.requestTimestampMap_.get(response.originalRequest);
    this.requestTimestampMap_.delete(response.originalRequest);

    if (!this.responseModeEnabled_()) {
      return;
    }

    try {
      const url = this.removeCmcdQueryFromUri_(
          response.originalUri || response.uri);

      /** @type {!cml.cmcd.Cmcd} */
      const data = /** @type {!cml.cmcd.Cmcd} */ ({url: url});
      if (response.status != null) {
        data.rc = response.status;
      }
      if (response.originalRequest &&
          response.originalRequest.timeToFirstByte != null) {
        data.ttfb = response.originalRequest.timeToFirstByte;
      }
      if (response.timeMs != null) {
        data.ttlb = response.timeMs;
      }
      if (startTs != null) {
        data.ts = startTs;
      }
      if (response.headers && response.headers['CMSD-Static']) {
        data.cmsds = btoa(response.headers['CMSD-Static']);
      }
      if (response.headers && response.headers['CMSD-Dynamic']) {
        data.cmsdd = btoa(response.headers['CMSD-Dynamic']);
      }

      // Synthesize a CML-shaped HttpResponse: CmcdReporter reads
      // `request.url` and `status`. We pass `data` as the override so
      // CML's auto-derivation from `resourceTiming` is bypassed
      // (shaka measures these via `requestTimestampMap_`).
      this.reporter_.recordResponseReceived({
        request: {url: url},
        status: response.status || 0,
      }, data);
    } catch (error) {
      shaka.log.warnOnce(
          'CMCD_RESPONSE_ERROR',
          'Could not apply CMCD data to response.', error);
    }
  }

  /**
   * Apply CMCD data to a sidecar text request.
   *
   * @param {!shaka.extern.Request} request
   */
  applyTextData(request) {
    if (!this.reporter_ || !this.isTokenAllowed_('segment')) {
      return;
    }
    this.applyToRequest_(request, /** @type {!cml.cmcd.Cmcd} */ ({
      ot: cml.cmcd.CmcdObjectType.CAPTION,
      su: true,
    }));
  }

  /**
   * Apply CMCD data to streams loaded via `<video src=...>`. Forces
   * query-mode encoding regardless of configured `useHeaders`, since
   * direct media loads cannot carry custom request headers.
   *
   * @param {string} uri
   * @param {string} mimeType
   * @return {string}
   */
  appendSrcData(uri, mimeType) {
    if (!this.reporter_ || !this.isTokenAllowed_('segment')) {
      return uri;
    }
    try {
      const data = this.buildExternalUriData_();
      data.ot = this.getObjectTypeFromMimeType_(mimeType);
      data.su = true;
      return cml.cmcd.appendCmcdQuery(
          uri, data, this.encodeOptionsForUri_(uri));
    } catch (error) {
      shaka.log.warnOnce('CMCD_SRC_ERROR',
          'Could not generate src CMCD data.', error);
      return uri;
    }
  }

  /**
   * Apply CMCD data to a sidecar text track URI.
   *
   * @param {string} uri
   * @return {string}
   */
  appendTextTrackData(uri) {
    if (!this.reporter_ || !this.isTokenAllowed_('segment')) {
      return uri;
    }
    try {
      const data = this.buildExternalUriData_();
      data.ot = cml.cmcd.CmcdObjectType.CAPTION;
      data.su = true;
      return cml.cmcd.appendCmcdQuery(
          uri, data, this.encodeOptionsForUri_(uri));
    } catch (error) {
      shaka.log.warnOnce('CMCD_TEXT_TRACK_ERROR',
          'Could not generate text track CMCD data.', error);
      return uri;
    }
  }

  /**
   * Construct and start the reporter, and wire up its event listeners, if
   * the effective configuration is enabled and a video element is
   * available. No-ops if the reporter is already running or either
   * precondition fails.
   *
   * @private
   */
  maybeStartReporter_() {
    if (this.reporter_ || !this.video_ || !this.effective_.enabled) {
      return;
    }
    if (!this.effective_.sessionId) {
      this.generatedSessionId_ = window.crypto.randomUUID();
      this.effective_ = this.resolveEffectiveConfig_();
    }
    const reporterConfig = this.toReporterConfig_(this.effective_);
    this.reporter_ = new cml.cmcd.CmcdReporter(
        reporterConfig, this.makeRequester_());
    this.reporter_.start();
    // A rebuild happens after the manifest request that teaches sf and
    // after playback may have started, so re-teach what the previous
    // reporter had learned.
    if (this.sf_) {
      this.reporter_.update(/** @type {!cml.cmcd.Cmcd} */ (
        {sf: this.sf_, st: this.getStreamType_()}));
    }
    if (this.lastPlayerState_) {
      this.reporter_.update(/** @type {!cml.cmcd.Cmcd} */ (
        {sta: this.lastPlayerState_}));
    }
    this.setupEventListeners_();
  }

  /**
   * Translate the effective configuration into
   * `cml.cmcd.CmcdReporterConfig`. Field renames:
   *   - `useHeaders` → `transmissionMode` enum
   *   - `version: 1|2` → `CMCD_V1` / `CMCD_V2` constants
   *   - per-target `includeKeys` → `enabledKeys`
   *
   * Empty `includeKeys` is expanded to all valid keys for the version,
   * since CML's reporter early-returns when `enabledKeys` is empty.
   *
   * @param {!shaka.util.CmcdManager.EffectiveConfig} cfg
   * @return {!cml.cmcd.CmcdReporterConfig}
   * @private
   */
  toReporterConfig_(cfg) {
    const allKeysForVersion = shaka.util.CmcdManager.allKeysForVersion_;
    const includeKeys = (cfg.includeKeys && cfg.includeKeys.length) ?
        cfg.includeKeys : allKeysForVersion(cfg.version);

    /** @type {!cml.cmcd.CmcdReporterConfig} */
    const reporterConfig = /** @type {!cml.cmcd.CmcdReporterConfig} */ ({
      sid: cfg.sessionId,
      cid: cfg.contentId,
      transmissionMode: cfg.useHeaders ?
          cml.cmcd.CMCD_HEADERS : cml.cmcd.CMCD_QUERY,
      enabledKeys: includeKeys,
      version: cfg.version === 2 ? cml.cmcd.CMCD_V2 : cml.cmcd.CMCD_V1,
    });

    const targets = cfg.eventTargets;
    if (targets && targets.length) {
      reporterConfig.eventTargets = targets
          .filter((t) => t.enabled !== false && t.url &&
              t.events && t.events.length)
          .map((t) => {
            const tIncludeKeys = (t.includeKeys && t.includeKeys.length) ?
                t.includeKeys :
                allKeysForVersion(t.version || cfg.version);
            return {
              url: t.url,
              events: t.events,
              interval: t.interval,
              batchSize: t.batchSize,
              enabledKeys: tIncludeKeys,
              version: cml.cmcd.CMCD_V2,
            };
          });
    }
    return reporterConfig;
  }

  /**
   * Build the `requester` callback CmcdReporter uses for event-mode
   * dispatch. Routes through NetworkingEngine so the request inherits
   * auth / retry / filters.
   *
   * @return {function(!Object): !Promise<{status: number}>}
   * @private
   */
  makeRequester_() {
    return async (cmcdReq) => {
      const RequestType = shaka.net.NetworkingEngine.RequestType;
      const retryParams =
          shaka.net.NetworkingEngine.defaultRetryParameters();
      const url = /** @type {string} */ (cmcdReq['url']);
      const shakaReq =
          shaka.net.NetworkingEngine.makeRequest([url], retryParams);
      shakaReq.method =
        /** @type {string} */ (cmcdReq['method']) || 'POST';
      shakaReq.headers = /** @type {!Object<string, string>} */ (
        cmcdReq['headers']) || {};
      shakaReq.body = shaka.util.StringUtils.toUTF8(
          /** @type {string} */ (cmcdReq['body']));

      try {
        const networkingEngine = this.player_.getNetworkingEngine();
        goog.asserts.assert(networkingEngine, 'Must have net engine');

        await networkingEngine.request(
            RequestType.CMCD, shakaReq).promise;
        return {status: 200};
      } catch (err) {
        return {
          status: /** @type {number} */ (
              (err && err['status']) ? err['status'] : 0),
        };
      }
    };
  }

  /**
   * Player-state deduplication: skip the update + recordEvent pair if
   * the new state is identical to the last-emitted one. Without this,
   * `<video>` events can fire repeatedly on stable states (e.g.,
   * `playing` after every minor stall) and spam the reporter.
   *
   * @param {!cml.cmcd.CmcdPlayerState} state
   * @private
   */
  setPlayerState_(state) {
    if (!this.reporter_ || this.lastPlayerState_ === state) {
      return;
    }
    this.lastPlayerState_ = state;
    // CmcdReporter.update() auto-fires PLAY_STATE since v2.4.0
    // when sta changes vs. lastEmitted.
    this.reporter_.update(/** @type {!cml.cmcd.Cmcd} */ ({sta: state}));
  }

  /**
   * Push a CMCD-applied request through `createRequestReport`. Mutates
   * `request` in place to preserve shaka's existing applyRequestData
   * contract.
   *
   * @param {!shaka.extern.Request} request
   * @param {!cml.cmcd.Cmcd} data
   * @private
   */
  applyToRequest_(request, data) {
    try {
      /** @type {!Object<string, *>} */
      const cmlReq = {
        url: request.uris[0],
        headers: Object.assign({}, request.headers || {}),
        customData: {},
      };
      const report = /** @type {!Object<string, *>} */ (
        this.reporter_.createRequestReport(cmlReq, data));

      // Headers mode: copy CMCD-* headers back onto the request.
      const reportHeaders = /** @type {!Object<string, string>} */ (
        report['headers'] || {});
      const inputHeaderCount =
          Object.keys(cmlReq.headers).length;
      const newHeaderCount = Object.keys(reportHeaders).length;
      if (newHeaderCount > inputHeaderCount) {
        if (!request.headers) {
          request.headers = {};
        }
        for (const key of Object.keys(reportHeaders)) {
          if (!(key in cmlReq.headers)) {
            request.headers[key] = reportHeaders[key];
          }
        }
      }

      // Query mode: report.url has CMCD appended. Apply to all URIs in
      // the retry list (alternates carry identical CMCD).
      const reportUrl = /** @type {string} */ (report['url']);
      if (reportUrl && reportUrl !== cmlReq.url) {
        if (request.uris.length === 1) {
          request.uris = [reportUrl];
        } else {
          let cmcdParam = null;
          try {
            const u = new URL(reportUrl);
            cmcdParam = u.searchParams.get('CMCD');
          } catch (e) {
            // First URI not parsable; leave list untouched.
          }
          if (cmcdParam != null) {
            const param = cmcdParam;
            request.uris = request.uris.map((uri) => {
              if (uri.includes('offline:')) {
                return uri;
              }
              try {
                const uu = new URL(uri);
                uu.searchParams.set('CMCD', param);
                return uu.toString();
              } catch (e) {
                return uri;
              }
            });
          }
        }
      }
    } catch (error) {
      shaka.log.warnOnce('CMCD_REQUEST_ERROR',
          'Could not apply CMCD data to request.', error);
    }
  }

  /**
   * Whether CMCD data should be attached to this request, per the effective
   * includeInRequests list (ISO/IEC 23009-1:2026 Table I.4 tokens).
   *
   * @param {!shaka.net.NetworkingEngine.RequestType} type
   * @param {!shaka.extern.Request} request
   * @param {!shaka.extern.RequestContext} context
   * @return {boolean}
   * @private
   */
  shouldApplyToRequest_(type, request, context) {
    const token = shaka.util.CmcdManager.requestTypeToken_(type, context);
    if (!token || !this.isTokenAllowed_(token)) {
      return false;
    }
    return this.passesManifestFilters_(type, request, context);
  }

  /**
   * Apply the ClientDataReporting serviceLocations and adaptationSets
   * filters (ISO/IEC 23009-1:2026 Table K.7). Both filters intersect. A
   * request whose service location cannot be resolved is excluded on
   * purpose: header-mode CMCD toward a CDN that did not ask for it can
   * trigger CORS preflight failures. Steering requests are not CDN requests
   * and bypass the service location filter (dash.js does the same). The
   * adaptationSets filter applies only to requests that carry a stream.
   *
   * @param {!shaka.net.NetworkingEngine.RequestType} type
   * @param {!shaka.extern.Request} request
   * @param {!shaka.extern.RequestContext} context
   * @return {boolean}
   * @private
   */
  passesManifestFilters_(type, request, context) {
    const RequestType = shaka.net.NetworkingEngine.RequestType;
    const effective = this.effective_;

    if (effective.serviceLocations &&
        type != RequestType.CONTENT_STEERING) {
      const location = shaka.util.CmcdManager.resolveServiceLocation_(
          request.uris[0], effective.serviceLocationBaseUris);
      if (!location) {
        shaka.log.warnOnce('CMCD_UNKNOWN_SERVICE_LOCATION',
            'CMCD: the manifest restricts reporting to service locations ' +
            effective.serviceLocations.join(' ') + ' but the location of ' +
            'some requests cannot be resolved; they are not decorated.');
        return false;
      }
      if (!effective.serviceLocations.includes(location)) {
        return false;
      }
    }

    if (effective.adaptationSets && context.stream) {
      // For DASH, Stream.groupId is the AdaptationSet id, with a
      // '_preselection_<id>' suffix on Preselection copies.
      const groupId = context.stream.groupId;
      if (!groupId) {
        return false;
      }
      const matches = effective.adaptationSets.some((id) =>
        groupId == id || groupId.startsWith(id + '_preselection_'));
      if (!matches) {
        return false;
      }
    }

    return true;
  }

  /**
   * An empty list means different things depending on where it came from. A
   * manifest-supplied list is authoritative even when empty: it named only
   * request types this player never makes, so nothing is decorated. An empty
   * application list is just the unconfigured default, and falls back to the
   * legacy request set.
   *
   * @param {string} token A Table I.4 request type token, or one of the
   *   internal tokens 'license' / 'timing'.
   * @return {boolean}
   * @private
   */
  isTokenAllowed_(token) {
    const list = this.effective_.includeInRequests;
    let allowed = list;
    if (!list.length) {
      if (this.effective_.fromManifest) {
        return false;
      }
      allowed = shaka.util.CmcdManager.LEGACY_REQUEST_TOKENS_;
    }
    if (allowed.includes('*')) {
      return true;
    }
    if (token == 'init' && allowed.includes('segment')) {
      // 'segment' covers initialization segments too (dash.js parity, and
      // CTA-5004 expects CMCD on init files).
      return true;
    }
    return allowed.includes(token);
  }

  /**
   * Whether any configured `eventTarget` subscribes to the `'rr'`
   * (response-received) event. Saves recording response-received calls
   * into the reporter when no target consumes them.
   *
   * @return {boolean}
   * @private
   */
  responseModeEnabled_() {
    const targets = this.effective_.eventTargets;
    if (!targets) {
      return false;
    }
    return targets.some((target) =>
      target.enabled !== false &&
      target.events &&
      target.events.includes(cml.cmcd.CmcdEventType.RESPONSE_RECEIVED));
  }

  /**
   * Persistent CMCD baseline used by `appendSrcData` /
   * `appendTextTrackData`. These bypass the reporter (browsers can't
   * observe headers for direct media loads, so we always force query
   * mode regardless of configured `useHeaders`); `sn` is omitted since
   * the reporter's per-target counters don't apply.
   *
   * @return {!cml.cmcd.Cmcd}
   * @private
   */
  buildExternalUriData_() {
    return /** @type {!cml.cmcd.Cmcd} */ ({
      v: this.effective_.version,
      sid: this.effective_.sessionId,
      cid: this.effective_.contentId,
      sf: this.sf_,
      mtp: this.player_.getBandwidthEstimate() / 1000,
    });
  }

  /**
   * Encode options for direct `cml.cmcd.appendCmcdQuery` calls
   * (`appendSrcData`, `appendTextTrackData`). `baseUrl` lets CML
   * relativize `nor` URLs root-relative; `version` filters keys per
   * spec; `reportingMode = REQUEST` pins the request-mode key filter.
   *
   * @param {string} uri
   * @return {!cml.cmcd.CmcdEncodeOptions}
   * @private
   */
  encodeOptionsForUri_(uri) {
    /** @type {!cml.cmcd.CmcdEncodeOptions} */
    const options = /** @type {!cml.cmcd.CmcdEncodeOptions} */ ({});
    if (uri && !uri.includes('offline:')) {
      try {
        options.baseUrl = new URL(uri).origin;
      } catch (e) {
        // Unparsable URI; CML's `nor` formatter passes values through
        // unchanged when baseUrl is absent.
      }
    }
    if (this.effective_.version != null) {
      options.version = this.effective_.version;
    }
    options.reportingMode = cml.cmcd.CMCD_REQUEST_MODE;
    return options;
  }

  /**
   * Wire `<video>` and Player events to reporter calls per spec
   * § "Player state ↔ reporter state mapping".
   *
   * @private
   */
  setupEventListeners_() {
    const PlayerState = cml.cmcd.CmcdPlayerState;
    const EventType = cml.cmcd.CmcdEventType;

    this.eventManager_.listen(this.video_, 'pause', () => {
      this.setPlayerState_(PlayerState.PAUSED);
    });

    this.eventManager_.listen(this.video_, 'playing', () => {
      this.setPlayerState_(PlayerState.PLAYING);
      // Compute and emit Measured Start Delay (msd) on the first 'playing'
      // event after setStartTimeOfLoad() has been called. CmcdReporter
      // sends msd once per target on the first request; zeroing
      // startTimeOfLoad_ here prevents re-emission on subsequent 'playing'
      // events within the same session.
      if (this.reporter_ && this.startTimeOfLoad_) {
        this.reporter_.update(/** @type {!cml.cmcd.Cmcd} */ (
          {msd: Date.now() - this.startTimeOfLoad_}));
        this.startTimeOfLoad_ = 0;
      }
    });

    this.eventManager_.listen(this.video_, 'seeking', () => {
      this.setPlayerState_(PlayerState.SEEKING);
    });

    this.eventManager_.listen(this.video_, 'ended', () => {
      this.setPlayerState_(PlayerState.ENDED);
    });

    this.eventManager_.listen(this.video_, 'volumechange', () => {
      if (!this.reporter_ || !this.video_) {
        return;
      }
      const muted = this.video_.muted;
      // Mute state isn't a persistent CMCD wire key (CTA-5004-B uses
      // m/um events, not a `muted` data field). Emit the event only.
      this.reporter_.recordEvent(muted ? EventType.MUTE : EventType.UNMUTE);
    });

    this.eventManager_.listen(this.player_, 'buffering', (e) => {
      const buffering = /** @type {!Object} */ (e)['buffering'];
      this.setPlayerState_(buffering ?
          PlayerState.REBUFFERING : PlayerState.PLAYING);
    });

    this.eventManager_.listen(this.player_, 'adaptation', () => {
      if (!this.reporter_ || !this.player_) {
        return;
      }
      const variants = this.player_.getVariantTracks();
      const active = variants.find((t) => t.active);
      if (active && active.bandwidth) {
        // CmcdReporter.update() auto-fires BITRATE_CHANGE since v2.4.0
        // when br changes vs. lastEmitted.
        this.reporter_.update(/** @type {!cml.cmcd.Cmcd} */ (
          {br: [active.bandwidth / 1000]}));
      }
    });

    this.eventManager_.listen(this.player_, 'error', () => {
      this.setPlayerState_(PlayerState.FATAL_ERROR);
      if (this.reporter_) {
        this.reporter_.recordEvent(EventType.ERROR);
      }
    });

    this.eventManager_.listen(document, 'fullscreenchange', () => {
      if (!this.reporter_) {
        return;
      }
      const isFullscreen = !!document.fullscreenElement;
      this.reporter_.recordEvent(isFullscreen ?
          EventType.PLAYER_EXPAND : EventType.PLAYER_COLLAPSE);
    });

    const video = /** @type {HTMLVideoElement} */ (this.video_);
    if (video.webkitPresentationMode || video.webkitSupportsFullscreen) {
      this.eventManager_.listen(video, 'webkitpresentationmodechanged', () => {
        if (!this.reporter_) {
          return;
        }
        if (video.webkitPresentationMode) {
          this.reporter_.recordEvent(
              video.webkitPresentationMode !== 'inline' ?
                  EventType.PLAYER_EXPAND : EventType.PLAYER_COLLAPSE);
        } else if (video.webkitSupportsFullscreen) {
          this.reporter_.recordEvent(
              video.webkitDisplayingFullscreen ?
                  EventType.PLAYER_EXPAND : EventType.PLAYER_COLLAPSE);
        }
      });
    }

    this.eventManager_.listen(this.video_, 'enterpictureinpicture', () => {
      if (this.reporter_) {
        this.reporter_.recordEvent(EventType.PLAYER_EXPAND);
      }
    });

    this.eventManager_.listen(this.video_, 'leavepictureinpicture', () => {
      if (this.reporter_) {
        this.reporter_.recordEvent(EventType.PLAYER_COLLAPSE);
      }
    });

    if ('documentPictureInPicture' in window) {
      this.eventManager_.listen(window.documentPictureInPicture, 'enter',
          (e) => {
            if (!this.reporter_) {
              return;
            }
            this.reporter_.recordEvent(EventType.PLAYER_EXPAND);
            const event = /** @type {DocumentPictureInPictureEvent} */ (e);
            const pipWindow = event.window;
            this.eventManager_.listenOnce(pipWindow, 'pagehide', () => {
              if (this.reporter_) {
                this.reporter_.recordEvent(EventType.PLAYER_COLLAPSE);
              }
            });
          });
    }

    this.eventManager_.listen(document, 'visibilitychange', () => {
      if (!this.reporter_) {
        return;
      }
      const backgrounded = document.hidden;
      // CmcdReporter.update() auto-fires BACKGROUNDED_MODE since v2.4.0
      // when bg changes vs. lastEmitted.
      this.reporter_.update(/** @type {!cml.cmcd.Cmcd} */ (
        {bg: backgrounded}));
    });

    this.eventManager_.listen(this.player_, 'complete', () => {
      this.setPlayerState_(PlayerState.ENDED);
    });
  }

  /**
   * Strip the CMCD query parameter from a URL.
   *
   * @param {string} uri
   * @return {string}
   * @private
   */
  removeCmcdQueryFromUri_(uri) {
    if (!uri.includes('CMCD=')) {
      return uri;
    }
    try {
      const url = new URL(uri);
      url.searchParams.delete('CMCD');
      return url.toString();
    } catch (error) {
      shaka.log.error('Failed to parse URI for CMCD removal:', uri, error);
      return uri;
    }
  }

  /**
   * Map a shaka request context to a CMCD object type.
   *
   * @param {shaka.extern.RequestContext} context
   * @return {(cml.cmcd.CmcdObjectType|undefined)}
   * @private
   */
  getObjectType_(context) {
    if (context.type ===
        shaka.net.NetworkingEngine.AdvancedRequestType.INIT_SEGMENT) {
      return cml.cmcd.CmcdObjectType.INIT;
    }
    const stream = context.stream;
    if (!stream) {
      return undefined;
    }
    const type = stream.type;
    if (type == 'video') {
      if (stream.codecs && stream.codecs.includes(',')) {
        return cml.cmcd.CmcdObjectType.MUXED;
      }
      return cml.cmcd.CmcdObjectType.VIDEO;
    }
    if (type == 'audio') {
      return cml.cmcd.CmcdObjectType.AUDIO;
    }
    if (type == 'text') {
      if (stream.mimeType === 'application/mp4') {
        return cml.cmcd.CmcdObjectType.TIMED_TEXT;
      }
      return cml.cmcd.CmcdObjectType.CAPTION;
    }
    return undefined;
  }

  /**
   * Map a mimeType to a CMCD object type. Used by `appendSrcData`.
   *
   * @param {string} mimeType
   * @return {(cml.cmcd.CmcdObjectType|undefined)}
   * @private
   */
  getObjectTypeFromMimeType_(mimeType) {
    switch (mimeType.toLowerCase()) {
      case 'audio/mp4':
      case 'audio/webm':
      case 'audio/ogg':
      case 'audio/mpeg':
      case 'audio/aac':
      case 'audio/flac':
      case 'audio/wav':
        return cml.cmcd.CmcdObjectType.AUDIO;

      case 'video/webm':
      case 'video/mp4':
      case 'video/mpeg':
      case 'video/mp2t':
        return cml.cmcd.CmcdObjectType.MUXED;

      case 'application/x-mpegurl':
      case 'application/vnd.apple.mpegurl':
      case 'audio/x-mpegurl':
      case 'application/dash+xml':
      case 'video/vnd.mpeg.dash.mpd':
      case 'application/vnd.ms-sstr+xml':
        return cml.cmcd.CmcdObjectType.MANIFEST;

      default:
        return undefined;
    }
  }

  /**
   * Buffer length in milliseconds for a media type.
   *
   * @param {string} type
   * @return {number}
   * @private
   */
  getBufferLength_(type) {
    const ranges = this.player_.getBufferedInfo()[type];
    if (!ranges.length) {
      return NaN;
    }
    const start = this.getCurrentTime_();
    const range = ranges.find((r) => r.start <= start && r.end >= start);
    if (!range) {
      return NaN;
    }
    return (range.end - start) * 1000;
  }

  /**
   * Remaining buffer length in milliseconds.
   *
   * @param {string} type
   * @return {number}
   * @private
   */
  getRemainingBufferLength_(type) {
    const ranges = this.player_.getBufferedInfo()[type];
    if (!ranges.length) {
      return 0;
    }
    const start = this.getCurrentTime_();
    const range = ranges.find((r) => r.start <= start && r.end >= start);
    if (!range) {
      return 0;
    }
    return (range.end - start) * 1000;
  }

  /**
   * Computed `rtp` (requested maximum throughput) for a segment.
   *
   * @param {shaka.extern.Stream} stream
   * @param {shaka.media.SegmentReference} segment
   * @return {number}
   * @private
   */
  calculateRtp_(stream, segment) {
    const playbackRate = this.player_.getPlaybackRate() || 1;
    const currentBufferLevel =
        this.getRemainingBufferLength_(stream.type) || 500;
    const bandwidth = stream.bandwidth;
    if (!bandwidth) {
      return NaN;
    }
    const segmentDuration = segment.endTime - segment.startTime;
    const segmentSize = bandwidth * segmentDuration / 1000;
    const timeToLoad = (currentBufferLevel / playbackRate) / 1000;
    const minBandwidth = segmentSize / timeToLoad;
    return minBandwidth * this.effective_.rtpSafetyFactor;
  }

  /**
   * Resolve `sf` from the manifest-parser advanced-request type.
   *
   * @param {shaka.net.NetworkingEngine.AdvancedRequestType} type
   * @return {(cml.cmcd.CmcdStreamingFormat|undefined)}
   * @private
   */
  getStreamFormat_(type) {
    const AdvancedRequestType = shaka.net.NetworkingEngine.AdvancedRequestType;
    switch (type) {
      case AdvancedRequestType.MPD:
        return cml.cmcd.CmcdStreamingFormat.DASH;
      case AdvancedRequestType.MASTER_PLAYLIST:
      case AdvancedRequestType.MEDIA_PLAYLIST:
        return cml.cmcd.CmcdStreamingFormat.HLS;
    }
    return undefined;
  }

  /**
   * @return {cml.cmcd.CmcdStreamType}
   * @private
   */
  getStreamType_() {
    return this.player_.isLive() ?
        cml.cmcd.CmcdStreamType.LIVE :
        cml.cmcd.CmcdStreamType.VOD;
  }

  /**
   * Top-bandwidth value across variants for a given object type.
   *
   * @param {(cml.cmcd.CmcdObjectType|undefined)} type
   * @return {number}
   * @private
   */
  getTopBandwidth_(type) {
    const variants = this.player_.getVariantTracks();
    if (!variants.length) {
      return NaN;
    }
    let top = variants[0];
    for (const variant of variants) {
      if (variant.type === 'variant' && variant.bandwidth > top.bandwidth) {
        top = variant;
      }
    }
    const ObjectType = cml.cmcd.CmcdObjectType;
    switch (type) {
      case ObjectType.VIDEO:
        return top.videoBandwidth || NaN;
      case ObjectType.AUDIO:
        return top.audioBandwidth || NaN;
      default:
        return top.bandwidth;
    }
  }

  /**
   * Build the per-segment CMCD payload from shaka's request context.
   *
   * @param {shaka.extern.RequestContext} context
   * @param {?string} requestUri
   * @return {!Object<string, *>}
   * @private
   */
  getDataForSegment_(context, requestUri) {
    const segment = context.segment;
    let duration = 0;
    if (segment) {
      duration = segment.endTime - segment.startTime;
    }

    /** @type {!Object<string, *>} */
    const data = {
      d: duration * 1000,
      st: this.getStreamType_(),
    };
    data['ot'] = this.getObjectType_(context);

    const ObjectType = cml.cmcd.CmcdObjectType;
    const isMedia = data['ot'] === ObjectType.VIDEO ||
        data['ot'] === ObjectType.AUDIO ||
        data['ot'] === ObjectType.MUXED ||
        data['ot'] === ObjectType.TIMED_TEXT;

    const stream = context.stream;
    if (stream) {
      const playbackRate = this.player_.getPlaybackRate();
      if (isMedia) {
        const bl = this.getBufferLength_(stream.type);
        if (Number.isFinite(bl)) {
          data['bl'] = bl;
        }
        if (data['ot'] !== ObjectType.TIMED_TEXT) {
          const remainingBufferLength =
              this.getRemainingBufferLength_(stream.type);
          if (playbackRate) {
            data['dl'] = remainingBufferLength / Math.abs(playbackRate);
          } else {
            data['dl'] = remainingBufferLength;
          }
        }
      }

      if (stream.bandwidth) {
        data['br'] = stream.bandwidth / 1000;
      }

      if (stream.segmentIndex && segment) {
        const reverse = playbackRate < 0;
        const iterator = stream.segmentIndex.getIteratorForTime(
            segment.endTime, /* allowNonIndependent= */ true, reverse);
        if (iterator) {
          const nextSegment = iterator.next().value;
          if (nextSegment && nextSegment != segment) {
            if (requestUri && !shaka.util.ArrayUtils.equal(
                segment.getUris(), nextSegment.getUris())) {
              data['nor'] = nextSegment.getUris()[0];
            }
            if ((nextSegment.startByte || nextSegment.endByte) &&
                (segment.startByte != nextSegment.startByte ||
                segment.endByte != nextSegment.endByte)) {
              let range = nextSegment.startByte + '-';
              if (nextSegment.endByte) {
                range += nextSegment.endByte;
              }
              data['nrr'] = range;
            }
          }
        }
        const rtp = this.calculateRtp_(stream, segment);
        if (Number.isFinite(rtp)) {
          data['rtp'] = rtp;
        }
      }
    }

    if (isMedia && data['ot'] !== ObjectType.TIMED_TEXT) {
      const tb = this.getTopBandwidth_(
          /** @type {(cml.cmcd.CmcdObjectType|undefined)} */ (
            data['ot'])) / 1000;
      if (Number.isFinite(tb)) {
        data['tb'] = tb;
      }
    }

    if (this.player_.isLive()) {
      const liveLatency = this.player_.getLiveLatency();
      if (liveLatency) {
        data['ltc'] = liveLatency;
      }
    }

    // Set the startup flag: true when the player has not yet transitioned
    // to a playing state (lastPlayerState_ is null = initial buffering) or
    // is actively rebuffering. Mirrors pre-refactor: `data.su = buffering_`.
    data['su'] = this.lastPlayerState_ === null ||
        this.lastPlayerState_ === cml.cmcd.CmcdPlayerState.REBUFFERING;

    return data;
  }

  /**
   * @return {number}
   * @private
   */
  getCurrentTime_() {
    return this.video_ ? this.video_.currentTime : 0;
  }
};

/**
 * The configuration actually in effect after merging the application
 * configuration with manifest-signaled parameters.
 *
 * @typedef {{
 *   enabled: boolean,
 *   version: number,
 *   useHeaders: boolean,
 *   sessionId: string,
 *   contentId: string,
 *   rtpSafetyFactor: number,
 *   includeKeys: !Array<string>,
 *   includeInRequests: !Array<string>,
 *   eventTargets: ?Array<shaka.extern.CmcdTarget>,
 *   serviceLocations: ?Array<string>,
 *   adaptationSets: ?Array<string>,
 *   serviceLocationBaseUris: !Array<shaka.extern.ServiceLocationBaseUri>,
 *   fromManifest: boolean
 * }}
 */
shaka.util.CmcdManager.EffectiveConfig;


/**
 * Merge the application configuration with manifest-signaled CMCD
 * parameters (ISO/IEC 23009-1:2026 Annex K). Manifest values win for the
 * fields the manifest can express (version, mode, keys, includeInRequests,
 * contentID, sessionID) and the presence of parameters enables reporting.
 * Attributes the manifest omitted already carry the spec defaults, except
 * keys / ids, which fall back to the application values. Everything else
 * comes from the application. Pure: no side effects.
 *
 * @param {!shaka.extern.CmcdConfiguration} config
 * @param {?shaka.extern.ClientDataReporting} manifestParams
 * @param {?string} generatedSessionId
 * @return {!shaka.util.CmcdManager.EffectiveConfig}
 */
shaka.util.CmcdManager.resolveEffectiveConfig = (
    config, manifestParams, generatedSessionId) => {
  const applyManifest = config.applyParametersFromManifest !== false;
  const reporting = (applyManifest && manifestParams &&
      manifestParams.cmcdParameters) ? manifestParams : null;
  const mpd = reporting ? reporting.cmcdParameters : null;

  const version = mpd ? mpd.version : config.version;
  let includeKeys = config.includeKeys || [];
  if (mpd && mpd.keys) {
    includeKeys = shaka.util.CmcdManager.filterSupportedKeys_(
        mpd.keys, version);
  }

  return {
    enabled: !!mpd || config.enabled,
    version: version,
    useHeaders: mpd ? mpd.mode == 'header' : config.useHeaders,
    sessionId: (mpd && mpd.sessionId) || config.sessionId ||
        generatedSessionId || '',
    contentId: (mpd && mpd.contentId) || config.contentId || '',
    rtpSafetyFactor: config.rtpSafetyFactor,
    includeKeys: includeKeys,
    includeInRequests: mpd ?
        mpd.includeInRequests : (config.includeInRequests || []),
    eventTargets: config.eventTargets,
    serviceLocations: reporting ? reporting.serviceLocations : null,
    adaptationSets: reporting ? reporting.adaptationSets : null,
    serviceLocationBaseUris: reporting ?
        reporting.serviceLocationBaseUris : [],
    fromManifest: !!mpd,
  };
};


/**
 * Keep only the manifest keys this player can emit for the given version:
 * keys CML knows for that version plus custom keys (hyphenated prefix).
 * Unsupported keys are ignored per Table K.8.
 *
 * @param {!Array<string>} keys
 * @param {number} version
 * @return {!Array<string>}
 * @private
 */
shaka.util.CmcdManager.filterSupportedKeys_ = (keys, version) => {
  const supported = new Set(
      shaka.util.CmcdManager.allKeysForVersion_(version));
  const kept = keys.filter((key) =>
    supported.has(key) || cml.cmcd.isCmcdCustomKey(key));
  if (kept.length != keys.length) {
    shaka.log.info('CMCD: ignoring manifest keys this player does not ' +
        'support:', keys.filter((key) => !kept.includes(key)));
  }
  return kept;
};


/**
 * @param {(number|undefined)} version
 * @return {!Array<string>}
 * @private
 */
shaka.util.CmcdManager.allKeysForVersion_ = (version) => {
  if (version === 2 || version === cml.cmcd.CMCD_V2) {
    return Array.from(new Set([].concat(
        cml.cmcd.CMCD_REQUEST_KEYS,
        cml.cmcd.CMCD_RESPONSE_KEYS,
        cml.cmcd.CMCD_EVENT_KEYS)));
  }
  return [].concat(cml.cmcd.CMCD_V1_KEYS);
};


/**
 * Whether two effective configurations differ in a field that requires a
 * reporter rebuild. `eventTargets` is compared by reference, as before.
 *
 * @param {!shaka.util.CmcdManager.EffectiveConfig} a
 * @param {!shaka.util.CmcdManager.EffectiveConfig} b
 * @return {boolean}
 * @private
 */
shaka.util.CmcdManager.isMaterialChange_ = (a, b) => {
  const ArrayUtils = shaka.util.ArrayUtils;
  return a.enabled != b.enabled ||
      a.version != b.version ||
      a.useHeaders != b.useHeaders ||
      a.sessionId != b.sessionId ||
      a.contentId != b.contentId ||
      a.eventTargets != b.eventTargets ||
      !ArrayUtils.equal(a.includeKeys, b.includeKeys) ||
      !ArrayUtils.equal(a.includeInRequests, b.includeInRequests) ||
      !ArrayUtils.equal(a.serviceLocations, b.serviceLocations) ||
      !ArrayUtils.equal(a.adaptationSets, b.adaptationSets);
};


/**
 * Map a shaka request to its ISO/IEC 23009-1:2026 Table I.4 request type
 * token. License, key, certificate and timing requests have no DASH token;
 * they get the internal tokens 'license' and 'timing', which only the legacy
 * default set and '*' match.
 *
 * @param {!shaka.net.NetworkingEngine.RequestType} type
 * @param {!shaka.extern.RequestContext} context
 * @return {?string} null when shaka never decorates this request type.
 * @private
 */
shaka.util.CmcdManager.requestTypeToken_ = (type, context) => {
  const RequestType = shaka.net.NetworkingEngine.RequestType;
  const AdvancedRequestType = shaka.net.NetworkingEngine.AdvancedRequestType;
  switch (type) {
    case RequestType.SEGMENT:
      return context.type == AdvancedRequestType.INIT_SEGMENT ?
          'init' : 'segment';
    case RequestType.MANIFEST:
      switch (context.type) {
        case AdvancedRequestType.MPD_PATCH:
          return 'mpdpatch';
        case AdvancedRequestType.XLINK:
          return 'xlink';
        case AdvancedRequestType.LINKED_MPD:
          return 'mpdlink';
        default:
          return 'mpd';
      }
    case RequestType.CONTENT_STEERING:
      return 'steering';
    case RequestType.EVENT_CALLBACK:
      return 'callback';
    case RequestType.LICENSE:
    case RequestType.SERVER_CERTIFICATE:
    case RequestType.KEY:
      return 'license';
    case RequestType.TIMING:
      return 'timing';
    default:
      return null;
  }
};


/**
 * Resolve the service location of a URI by longest-prefix match over the
 * manifest's BaseURL / Location declarations.
 *
 * @param {string} uri
 * @param {!Array<shaka.extern.ServiceLocationBaseUri>} baseUris
 * @return {?string}
 * @private
 */
shaka.util.CmcdManager.resolveServiceLocation_ = (uri, baseUris) => {
  /** @type {?shaka.extern.ServiceLocationBaseUri} */
  let best = null;
  for (const entry of baseUris) {
    if (uri.startsWith(entry.uri) &&
        (!best || entry.uri.length > best.uri.length)) {
      best = entry;
    }
  }
  return best ? best.serviceLocation : null;
};


/**
 * The request types shaka decorated before includeInRequests existed. Used
 * when the application left its list empty, so existing deployments see no
 * change. Steering and callback requests are deliberately absent.
 *
 * @const {!Array<string>}
 * @private
 */
shaka.util.CmcdManager.LEGACY_REQUEST_TOKENS_ = [
  'segment', 'init', 'mpd', 'mpdpatch', 'xlink', 'mpdlink', 'license',
  'timing',
];


/**
 * Public re-export of CMCD streaming-format values. The literal object
 * form is required for Closure tooling: clutz (TypeScript-defs gen)
 * and `generateExterns.js` reject `@export`ed `@enum`s whose RHS is a
 * MemberExpression / alias. The 4 values match
 * `cml.cmcd.CmcdStreamingFormat` exactly; a unit test asserts value
 * identity.
 *
 * @enum {string}
 * @export
 */
shaka.util.CmcdManager.StreamingFormat = {
  DASH: 'd',
  HLS: 'h',
  SMOOTH: 's',
  OTHER: 'o',
};

/**
 * Public re-export of CMCD v2 event types. Literal form per the
 * Closure-tooling constraint above. Values match `cml.cmcd.CmcdEventType`
 * exactly; unit-test asserts identity.
 *
 * @enum {string}
 * @export
 */
shaka.util.CmcdManager.EventType = {
  BITRATE_CHANGE: 'bc',
  PLAY_STATE: 'ps',
  PLAYBACK_RATE: 'pr',
  ERROR: 'e',
  TIME_INTERVAL: 't',
  CONTENT_ID: 'c',
  BACKGROUNDED_MODE: 'b',
  MUTE: 'm',
  UNMUTE: 'um',
  PLAYER_EXPAND: 'pe',
  PLAYER_COLLAPSE: 'pc',
  RESPONSE_RECEIVED: 'rr',
  AD_START: 'as',
  AD_END: 'ae',
  AD_BREAK_START: 'abs',
  AD_BREAK_END: 'abe',
  SKIP: 'sk',
  CUSTOM_EVENT: 'ce',
};

/**
 * Public re-export of CMCD v2 player states. Literal form per the
 * Closure-tooling constraint above. Values match `cml.cmcd.CmcdPlayerState`
 * exactly; unit-test asserts identity.
 *
 * @enum {string}
 * @export
 */
shaka.util.CmcdManager.PlayerState = {
  STARTING: 's',
  PLAYING: 'p',
  SEEKING: 'k',
  REBUFFERING: 'r',
  PAUSED: 'a',
  WAITING: 'w',
  ENDED: 'e',
  FATAL_ERROR: 'f',
  QUIT: 'q',
  PRELOADING: 'd',
};
