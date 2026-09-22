/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.msf.MSFParser');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.drm.DrmUtils');
goog.require('shaka.drm.PlayReady');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.media.PresentationTimeline');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.msf.MediaTimeline');
goog.require('shaka.msf.MSFTransport');
goog.require('shaka.msf.MSFPresentationTimeline');
goog.require('shaka.msf.PackagingRegistry');
goog.require('shaka.msf.Utils');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.Error');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.Functional');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MimeUtils');
goog.require('shaka.util.PlayerConfiguration');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.Uint8ArrayUtils');

goog.requireType('shaka.media.InitSegmentReference');


/**
 * MOQT Streaming Format.
 *
 * @see https://datatracker.ietf.org/doc/draft-ietf-moq-transport/
 * @see https://datatracker.ietf.org/doc/draft-ietf-moq-msf/
 * @see https://datatracker.ietf.org/doc/draft-ietf-moq-cmsf/
 *
 * @implements {shaka.extern.ManifestParser}
 * @export
 */
shaka.msf.MSFParser = class {
  constructor() {
    /** @private {?shaka.extern.ManifestParser.PlayerInterface} */
    this.playerInterface_ = null;

    /** @private {?shaka.extern.ManifestConfiguration} */
    this.config_ = null;

    /** @private {function():boolean} */
    this.isPreloadFn_ = () => false;

    /** @private {?shaka.extern.Manifest} */
    this.manifest_ = null;

    /** @private {?shaka.msf.MSFTransport} */
    this.msfTransport_ = null;

    /** @private {?shaka.extern.MsfSession} */
    this.connection_ = null;

    /** @private {!Array<Array<string>>} */
    this.publishNamespaces_ = [];

    /** @private {?function()} */
    this.unregisterPublishNamespaceCallback_ = null;

    /** @private {?function()} */
    this.unregisterCatalogCallback_ = null;

    /** @private {!Promise.PromiseWithResolvers} */
    this.catalogPromise_ = Promise.withResolvers();

    /** @private {number} */
    this.globalId_ = 1;

    /**
     * The in-progress ABR bandwidth sample for each track, keyed by track key.
     * Tracks are accumulated separately because each has its own group
     * sequence.
     * @private {!Map<string, {bytes: number, readMs: number, group: bigint}>}
     */
    this.bandwidthSamples_ = new Map();

    /** @private {?shaka.media.PresentationTimeline} */
    this.presentationTimeline_ = null;

    /** @private {!Array<!shaka.extern.Variant>} */
    this.variants_ = [];

    /** @private {!Array<!shaka.extern.Stream>} */
    this.audioStreams_ = [];

    /** @private {!Array<!shaka.extern.Stream>} */
    this.videoStreams_ = [];

    /** @private {!Array<!shaka.extern.Stream>} */
    this.textStreams_ = [];

    /** @private {!Map<string, function()>} */
    this.unregisterTracksCallback_ = new Map();

    /**
     * Subscriptions whose SUBSCRIBE_OK has not arrived yet, by track key.
     * A subscription can only be withdrawn once it has an alias, so a track
     * closed before then has to leave a note for the in-flight subscribe to
     * find; without it the subscription is orphaned and the publisher keeps
     * sending objects nobody listens to for the rest of the session.
     *
     * @private {!Map<string, {cancelled: boolean}>}
     */
    this.pendingSubscriptions_ = new Map();

    /** @private {boolean} */
    this.isFirstVideoSegment_ = true;

    /**
     * Tracks whether the first segment has been received for each content type.
     * Used to delay locking the presentation timeline until all expected
     * stream types have started producing data.
     * @private {!Set<shaka.util.ManifestParserUtils.ContentType>}
     */
    this.receivedFirstSegment_ = new Set();

    /**
     * The media timeline of each track that has one, by catalog track name.
     *
     * A track gets one from a media timeline track that names it in `depends`,
     * from its own `template` field, or from both, in which case the one
     * instance holds both and prefers the explicit records.
     *
     * @private {!Map<string, !shaka.msf.MediaTimeline>}
     */
    this.mediaTimelines_ = new Map();

    /**
     * The streams that are currently subscribed, by track key. A seek has to
     * find them to re-point their subscriptions, which is why the state that
     * used to live in createSegmentIndex's closure is out here.
     *
     * @private {!Map<string, shaka.msf.MSFParser.StreamState>}
     */
    this.activeStreams_ = new Map();

    /** @private {HTMLMediaElement} */
    this.mediaElement_ = null;

    /** @private {shaka.util.EventManager} */
    this.eventManager_ = null;
  }

  /**
   * @param {shaka.extern.ManifestConfiguration} config
   * @param {(function():boolean)=} isPreloadFn
   * @override
   * @exportInterface
   */
  configure(config, isPreloadFn) {
    this.config_ = config;
    if (isPreloadFn) {
      this.isPreloadFn_ = isPreloadFn;
    }
    if (this.msfTransport_) {
      this.msfTransport_.configure(this.config_.msf);
    }
  }

  /**
   * @override
   * @exportInterface
   */
  async start(uri, playerInterface) {
    goog.asserts.assert(this.config_, 'Must call configure() before start()!');
    this.playerInterface_ = playerInterface;

    this.msfTransport_ = new shaka.msf.MSFTransport(this.config_.msf);

    /** @type {?Uint8Array} */
    let fingerprint = null;
    if (this.config_.msf.fingerprintUri) {
      const requestType = shaka.net.NetworkingEngine.RequestType.FINGERPRINT;
      const request = shaka.net.NetworkingEngine.makeRequest(
          [this.config_.msf.fingerprintUri], this.config_.retryParameters);
      const response = await this.playerInterface_.networkingEngine.request(
          requestType, request).promise;

      // Make sure that the parser has not been destroyed.
      if (!this.playerInterface_) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.PLAYER,
            shaka.util.Error.Code.OPERATION_ABORTED);
      }

      const hexString = shaka.util.StringUtils.fromUTF8(response.data).trim();

      const hexBytes = new Uint8Array(hexString.length / 2);
      for (let i = 0; i < hexBytes.length; i += 1) {
        hexBytes[i] = parseInt(hexString.slice(2 * i, 2 * i + 2), 16);
      }
      fingerprint = hexBytes;
    }

    try {
      this.connection_ = await this.msfTransport_.connect(
          uri, fingerprint, this.config_.msf.authorizationToken);
    } catch (error) {
      if (error instanceof shaka.util.Error) {
        throw error;
      }
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.WEBTRANSPORT_INITIALIZATION_FAILED,
          error);
    }

    if (this.config_.msf.namespaces.length) {
      // Get catalog in this namespace
      this.getCatalog_(this.config_.msf.namespaces);
    } else {
      // Listen for announcements
      // Catalog subscription will happen after announcement is received
      this.listenForAnnouncements_();
    }

    this.presentationTimeline_ = new shaka.msf.MSFPresentationTimeline();
    this.presentationTimeline_.setStatic(true);

    this.manifest_ = {
      presentationTimeline: this.presentationTimeline_,
      variants: [],
      textStreams: [],
      imageStreams: [],
      chapterStreams: [],
      offlineSessionIds: [],
      sequenceMode: false,
      ignoreManifestTimestampsInSegmentsMode: false,
      type: shaka.media.ManifestParser.MSF,
      serviceDescription: null,
      nextUrl: null,
      periodCount: 1,
      gapCount: 0,
      isLowLatency: false,
      startTime: null,
    };

    // A session the server hangs up on never answers, so wait for the end of
    // the session as well as for the catalog: the reason the session gives is
    // worth reporting, and waiting out the timeout for it is not.
    const sessionEndPromise = this.msfTransport_.waitForSessionEnd().then(
        (reason) => {
          throw new shaka.util.Error(
              shaka.util.Error.Severity.CRITICAL,
              shaka.util.Error.Category.MANIFEST,
              shaka.util.Error.Code.MSF_CONNECTION_CLOSED,
              reason);
        });

    let catalog;
    try {
      catalog = await shaka.util.Functional.promiseWithTimeout(
          /* seconds= */ 10,
          Promise.race([this.catalogPromise_.promise, sessionEndPromise]));
    } catch (error) {
      if (error instanceof shaka.util.Error) {
        throw error;
      }
      if (error) {
        // The timeout rejects with nothing at all, so anything here is the
        // failure that the subscription or the transport itself reported.
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MANIFEST,
            shaka.util.Error.Code.MSF_CONNECTION_CLOSED,
            String(error));
      }
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.MSF_CATALOG_TIMEOUT);
    }

    await this.processCatalog_(catalog);

    if (!this.presentationTimeline_.isLive()) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.MSF_VOD_CONTENT_NOT_SUPPORTED);
    }

    this.createVariants_();

    this.manifest_.isLowLatency = this.presentationTimeline_.isDynamic();
    this.manifest_.variants = this.variants_;
    this.manifest_.textStreams = this.textStreams_;

    this.playerInterface_.makeTextStreamsForClosedCaptions(this.manifest_);

    return this.manifest_;
  }

  /**
   * @override
   * @exportInterface
   */
  async stop() {
    this.unregisterCatalogCallback_?.();
    this.unregisterCatalogCallback_ = null;
    this.unregisterPublishNamespaceCallback_?.();
    this.unregisterPublishNamespaceCallback_ = null;
    this.unregisterTracksCallback_.forEach((callback, key) => {
      callback();
    });
    this.unregisterTracksCallback_.clear();
    for (const token of this.pendingSubscriptions_.values()) {
      token.cancelled = true;
    }
    this.pendingSubscriptions_.clear();
    this.eventManager_?.release();
    this.eventManager_ = null;
    this.mediaElement_ = null;
    this.activeStreams_.clear();
    this.mediaTimelines_.clear();
    if (this.connection_) {
      // Try to close the connection if it's not already closed
      try {
        // WebTransport requires some time to close connections, so we set
        // 1 second here, but this is based on experimental testing only.
        await shaka.util.Functional.delay(/* seconds= */ 1);
        await this.connection_.close();
        this.connection_ = null;
      } catch (error) {
        // Ignore error
      }
    }
    this.msfTransport_?.release();
    this.msfTransport_ = null;
    this.playerInterface_ = null;
    this.config_ = null;
    this.manifest_ = null;
  }

  /**
   * @override
   * @exportInterface
   */
  update() {}

  /**
   * @override
   * @exportInterface
   */
  onExpirationUpdated(sessionId, expiration) {
    // No-op
  }

  /**
   * @override
   * @exportInterface
   */
  onInitialVariantChosen(variant) {
    // No-op
  }

  /**
   * @override
   * @exportInterface
   */
  banLocation(uri) {
    // No-op
  }

  /**
   * @override
   * @exportInterface
   */
  setMediaElement(mediaElement) {
    this.eventManager_?.release();
    this.eventManager_ = null;
    this.mediaElement_ = mediaElement;

    if (!mediaElement) {
      return;
    }

    // A seek is the one thing that makes this parser issue a request of its
    // own: there is no manifest to consult and no URL to fetch, so the target
    // has to be turned into a Location and subscribed from.
    this.eventManager_ = new shaka.util.EventManager();
    this.eventManager_.listen(mediaElement, 'seeking', () => this.onSeeking_());
  }

  /**
   * Listen for announcements from the server
   * @private
   */
  listenForAnnouncements_() {
    try {
      shaka.log.debug('Listening for announcements...');

      // Subscribe to announcements
      const unregister =
          this.msfTransport_.registerPublishNamespaceCallback((namespace) => {
            const namespaceStr = namespace.join('/');
            shaka.log.debug(`Received publish namespace callback with namespace:
                ${namespaceStr}`);

            const isAlreadyProcessed = this.publishNamespaces_.some((ns) =>
              ns.join('/') === namespaceStr);
            if (isAlreadyProcessed) {
              shaka.log.debug(`Already processed namespace: ${namespaceStr}`);
              return;
            }

            // Store the namespace
            this.publishNamespaces_.push(namespace);

            // Get catalog in this namespace
            this.getCatalog_(namespace);
          });

      // Save the unregister function
      this.unregisterPublishNamespaceCallback_ = unregister;

      // Log that we've registered the callback
      shaka.log.debug('Announcement listener registered successfully');
    } catch (error) {
      shaka.log.error(`Error listening for announcements:
          ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get the catalog in the given namespace
   *
   * @param {Array<string>} namespace
   * @return {!Promise}
   * @private
   */
  getCatalog_(namespace) {
    if (this.config_.msf.useFetchCatalog) {
      return this.fetchCatalog_(namespace);
    }
    return this.subscribeToCatalog_(namespace);
  }

  /**
   * Fetch the catalog using FETCH (one-shot)
   *
   * @param {Array<string>} namespace
   * @return {!Promise}
   * @private
   */
  async fetchCatalog_(namespace) {
    try {
      const namespaceStr = namespace.join('/');
      shaka.log.debug(`Fetching catalog in namespace: ${namespaceStr}`);

      await this.msfTransport_.fetchTrack(
          namespace, 'catalog', (obj) => {
            // Objects with no payload carry an object status (e.g. the
            // draft-16 end-of-group marker), not catalog data; skip them.
            if (!obj['data'].byteLength) {
              return;
            }
            try {
              const text = shaka.util.StringUtils.fromUTF8(obj['data']);
              const catalog = /** @type {msfCatalog.Catalog} */(
                JSON.parse(text));
              this.catalogPromise_.resolve(catalog);
            } catch (e) {
              shaka.log.error(`Failed to decode catalog data:
              ${e instanceof Error ? e.message : String(e)}`);
            }
          });

      shaka.log.debug(
          `Successfully fetched catalog in namespace: ${namespaceStr}`);
    } catch (error) {
      shaka.log.error('Error fetching catalog:', error);
      if (error && error.kind == shaka.msf.Utils.MessageType.FETCH_ERROR) {
        this.catalogPromise_.reject(new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MANIFEST,
            shaka.util.Error.Code.MSF_NO_CATALOG,
            error.code,
            error.reason));
      } else {
        this.catalogPromise_.reject(error);
      }
    }
  }

  /**
   * Subscribe to the catalog in the given namespace
   *
   * @param {Array<string>} namespace
   * @return {!Promise}
   * @private
   */
  async subscribeToCatalog_(namespace) {
    try {
      const namespaceStr = namespace.join('/');
      shaka.log.debug(`Subscribing to catalog in namespace: ${namespaceStr}`);

      // Subscribe to the "catalog" track in the given namespace
      const trackAlias = await this.msfTransport_.subscribeTrack(
          namespace, 'catalog', (obj) => {
            // Objects with no payload carry an object status (e.g. the
            // draft-16 end-of-group marker), not catalog data; skip them.
            if (!obj['data'].byteLength) {
              return;
            }
            try {
              const text = shaka.util.StringUtils.fromUTF8(obj['data']);
              const catalog = /** @type {msfCatalog.Catalog} */(
                JSON.parse(text));
              this.catalogPromise_.resolve(catalog);
            } catch (e) {
              shaka.log.error(`Failed to decode catalog data:
              ${e instanceof Error ? e.message : String(e)}`);
            }
          });

      // Create an unregister function that uses the track alias
      const unregisterFunc = () => {
        // Don't try to unsubscribe if we're already disconnecting
        if (!this.playerInterface_) {
          shaka.log.debug('Skipping catalog unsubscribe during disconnect');
          return;
        }
        shaka.log.debug(`Unsubscribing from catalog track with alias
            ${trackAlias}`);
        this.msfTransport_.unsubscribeTrack(trackAlias).catch((err) => {
          shaka.log.error(`Failed to unsubscribe from catalog: ${err}`);
        });
      };

      if (this.unregisterCatalogCallback_) {
        shaka.log.debug('Unregistering previous catalog callback');
        this.unregisterCatalogCallback_();
      }
      this.unregisterCatalogCallback_ = unregisterFunc;
      shaka.log.debug(`Successfully subscribed to catalog in namespace:
          ${namespaceStr} with track alias: ${trackAlias}`);
    } catch (error) {
      shaka.log.error('Error subscribing to catalog:', error);
      if (error && error.kind == shaka.msf.Utils.MessageType.SUBSCRIBE_ERROR) {
        this.catalogPromise_.reject(new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MANIFEST,
            shaka.util.Error.Code.MSF_NO_CATALOG,
            error.code,
            error.reason));
      } else {
        this.catalogPromise_.reject(error);
      }
    }
  }

  /**
   * Feed the ABR bandwidth estimator.
   *
   * MoQ delivers media as many small per-object (often per-frame) chunks, which
   * are individually too small for the bandwidth estimator to draw a useful
   * throughput sample from. A group is the natural aggregation unit, so
   * accumulate a group's objects and report one sample once the group is
   * complete, which we detect by the object's group changing.
   *
   * The time reported is the sum of the per-object <em>active read</em>
   * durations, not wall clock. A push stream delivers at (roughly) the encoded
   * rate, so wall-clock timing would only ever measure the current variant's
   * bitrate and ABR could never learn there is spare capacity. When the link
   * has headroom the objects sit ready in the transport buffer and read almost
   * instantly, so the active read time reflects the true link speed and lets
   * ABR climb to a variant the connection can actually sustain.
   *
   * @param {string} trackKey
   * @param {shaka.msf.Utils.Location} location
   * @param {number} byteLength
   * @param {number} readMs Active time spent reading this object from the
   *   stream.
   * @private
   */
  recordBandwidthSample_(trackKey, location, byteLength, readMs) {
    const sample = this.bandwidthSamples_.getOrInsert(trackKey, {
      bytes: 0,
      readMs: 0,
      group: location.group,
    });

    if (location.group !== sample.group) {
      // A new group started, so the previous one is complete: report it.
      if (sample.bytes > 0) {
        this.playerInterface_.onSegmentReceived(
            // Guard against a zero total; Date.now() has millisecond
            // resolution, so a small group can read in "no" time.
            Math.max(sample.readMs, 1), sample.bytes);
      }
      sample.bytes = 0;
      sample.readMs = 0;
      sample.group = location.group;
    }

    sample.bytes += byteLength;
    sample.readMs += readMs;
  }

  /**
   * @param {msfCatalog.Track} track
   * @param {string} trackKey
   * @param {shaka.msf.Utils.ObjectCallback} callback
   * @param {?shaka.msf.Utils.Location=} startLocation Where delivery should
   *   begin, or null to start at the live edge.
   * @return {!Promise<boolean>} Whether the track ended up subscribed. A
   *   publisher can refuse a request, and one that starts at a Location is
   *   the likeliest to be refused: the Group asked for may be older than
   *   anything the publisher still holds, whatever its media timeline said.
   */
  async subscribeToTrack(track, trackKey, callback, startLocation) {
    try {
      // Fall back to the session namespace when the catalog track object
      // does not include an explicit namespace field (the namespace is
      // typically established at the transport level via PUBLISH_NAMESPACE).
      let namespace = [];
      if (track.namespace) {
        namespace.push(track.namespace);
      }
      if (!namespace.length) {
        if (this.config_.msf.namespaces.length) {
          namespace = this.config_.msf.namespaces;
        } else if (this.publishNamespaces_.length) {
          namespace = this.publishNamespaces_[0];
        } else {
          namespace = [];
        }
      }
      const trackName = track.name;

      shaka.log.debug(`Subscribing to track: ${trackKey}`);

      const token = {cancelled: false};
      this.pendingSubscriptions_.set(trackKey, token);

      const trackAlias = await this.msfTransport_.subscribeTrack(
          namespace, trackName, (obj) => {
            if (token.cancelled) {
              return;
            }
            shaka.log.v1(
                `Received object for track ${trackKey} with`, obj);
            callback(obj);
          }, startLocation);

      if (this.pendingSubscriptions_.get(trackKey) == token) {
        this.pendingSubscriptions_.delete(trackKey);
      }

      // Create an unregister function that uses the track alias
      const unregisterFunc = () => {
        // Don't try to unsubscribe if we're already disconnecting
        if (!this.playerInterface_) {
          shaka.log.debug('Skipping catalog unsubscribe during disconnect');
          return;
        }
        shaka.log.debug(`Unsubscribing from catalog track with alias
            ${trackAlias}`);
        this.msfTransport_.unsubscribeTrack(trackAlias).catch((err) => {
          shaka.log.error(`Failed to unsubscribe from catalog: ${err}`);
        });
      };

      if (token.cancelled) {
        // The track was closed while we were waiting for the SUBSCRIBE_OK.
        // Now that there is an alias, withdraw it rather than registering a
        // subscription nobody will ever close.
        shaka.log.debug(
            `Track ${trackKey} was closed before it finished subscribing`);
        unregisterFunc();
        return false;
      }

      // Store the subscription
      this.unregisterTracksCallback_.set(trackKey, unregisterFunc);
      shaka.log.debug(
          `Subscribed to track ${trackKey} with alias ${trackAlias}`);
      return true;
    } catch (error) {
      shaka.log.debug(`Error subscribing to track:
          ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * @param {msfCatalog.Catalog} catalog
   * @return {!Promise}
   * @private
   */
  processCatalog_(catalog) {
    // A preprocessor mutates the catalog, and a console renders a logged
    // object when it is expanded, so this logs a copy or both lines would show
    // the processed one. goog.DEBUG keeps the copy out of release builds,
    // which drop the log call but not its arguments.
    if (goog.DEBUG) {
      shaka.log.info('MSF Catalog:', structuredClone(catalog));
    }
    const catalogPreprocessor = this.config_.msf.catalogPreprocessor;
    const defaultCatalogPreprocessor =
        shaka.util.PlayerConfiguration.defaultCatalogPreprocessor;
    if (catalogPreprocessor != defaultCatalogPreprocessor) {
      catalogPreprocessor(catalog);
      shaka.log.info('MSF Catalog after preprocessor:', catalog);
    }
    const promises = [];
    let isLive = true;
    let duration = Infinity;
    let targetLatency = 0;
    const contentProtections = this.getContentProtections_(catalog);
    const initDataList = new Map();
    for (const init of catalog.initDataList || []) {
      initDataList.set(init.id, init.data);
    }
    for (const track of catalog.tracks) {
      if (track.packaging == shaka.msf.MSFParser.MEDIA_TIMELINE_PACKAGING_) {
        // A media timeline track carries no media, so none of what follows
        // applies to it: it says nothing about how long the presentation is
        // or how far behind the live edge to play, and a publisher is not
        // required to mark it live at all, so letting it set isLive here
        // would let a metadata track decide the presentation is VOD.
        this.processMediaTimelineTrack_(track);
        continue;
      }
      if ('isLive' in track) {
        isLive = track.isLive;
      }
      if (track.targetLatency) {
        targetLatency = Math.max(targetLatency, track.targetLatency);
      }
      if (track.trackDuration) {
        duration = Math.min(duration, track.trackDuration);
      }
      if (track.template) {
        this.getOrCreateTimeline_(track.name).setTemplate(track.template);
      }
      promises.push(this.processTrack_(
          track, contentProtections, initDataList));
    }
    if (targetLatency) {
      /** @type {shaka.extern.ServiceDescription} */
      const serviceDescription = {
        maxLatency: null,
        maxPlaybackRate: null,
        minLatency: null,
        minPlaybackRate: null,
        targetLatency: targetLatency / 1000,
        clientDataReporting: null,
      };
      this.manifest_.serviceDescription = serviceDescription;
    }
    if (isLive) {
      this.presentationTimeline_.setStatic(false);
    }
    this.presentationTimeline_.setDuration(duration);
    return Promise.all(promises);
  }

  /**
   * Subscribes to a media timeline track and feeds what it publishes to the
   * timelines of the tracks it describes.
   *
   * @param {msfCatalog.Track} track
   * @private
   */
  processMediaTimelineTrack_(track) {
    const depends = track.depends || [];
    if (!depends.length) {
      // MSF requires it, and without it there is nothing to say which tracks
      // these records address, so the map they carry cannot be used.
      shaka.log.warning(
          'Ignoring a media timeline track that declares no "depends"', track);
      return;
    }

    const timelines = depends.map((name) => this.getOrCreateTimeline_(name));
    const trackKey = `${track.namespace || ''}/${track.name}`;

    this.subscribeToTrack(track, trackKey, (obj) => {
      if (!obj.data.byteLength) {
        // An Object with no payload carries an Object status, not a document.
        return;
      }
      // The first Object of a Group is a complete timeline and replaces what
      // we hold; the ones after it in that Group only add to it (MSF 8.3).
      const independent = !obj.location.object;
      let changed = false;
      for (const timeline of timelines) {
        changed = timeline.addObject(obj.data, independent) || changed;
      }
      if (changed) {
        this.updateAvailabilityWindow_();
      }
    });
  }

  /**
   * @param {string} trackName
   * @return {!shaka.msf.MediaTimeline}
   * @private
   */
  getOrCreateTimeline_(trackName) {
    let timeline = this.mediaTimelines_.get(trackName);
    if (!timeline) {
      timeline = new shaka.msf.MediaTimeline();
      this.mediaTimelines_.set(trackName, timeline);
    }
    return timeline;
  }

  /**
   * The earliest presentation time the player can seek to and actually be
   * served, or null when there is no such point and the window should stay at
   * the live edge.
   *
   * Every subscribed track has to be able to reach it, so this is the latest
   * of their starts and is null as soon as one of them has no timeline: a seek
   * range is a promise that all of the media is there, and half of it is a
   * stall rather than a seek.
   *
   * @return {?number}
   * @private
   */
  getTimelineWindowStart_() {
    let start = null;
    for (const state of this.activeStreams_.values()) {
      const timeline = this.mediaTimelines_.get(state.track.name);
      const trackStart = timeline ? timeline.getStartTime() : null;
      if (trackStart == null) {
        return null;
      }
      start = start == null ? trackStart : Math.max(start, trackStart);
    }
    return start;
  }

  /**
   * Sizes the segment availability window, which is what the player offers as
   * the seek range.
   *
   * Without a media timeline the window is a floor around the live edge and
   * the presentation has no DVR, because nothing says where to subscribe from
   * to get anything older. With one, the window reaches back to the oldest
   * point the timeline still describes.
   *
   * @private
   */
  updateAvailabilityWindow_() {
    if (!this.presentationTimeline_ ||
        !this.presentationTimeline_.isDynamic()) {
      return;
    }

    const override = this.config_.availabilityWindowOverride;
    if (!isNaN(override)) {
      this.presentationTimeline_.setSegmentAvailabilityDuration(override);
      return;
    }

    let duration = 0;
    const maxSegmentDuration =
        this.presentationTimeline_.getMaxSegmentDuration();
    if (maxSegmentDuration > 0) {
      // No DVR -- the window sits at the live edge. But it still has to be
      // wide enough to CONTAIN the playhead, which trails the live edge,
      // and to hold the trailing track when the two are not published in
      // lockstep.
      //
      // "availability window = one segment" is right when a segment is
      // seconds long. Where one object is one frame it is tens of
      // milliseconds, so the playhead falls outside its own seek range
      // immediately and shaka re-seeks it back into range over and over,
      // while the trailing track is never inside the window at all.
      duration = Math.max(
          maxSegmentDuration, shaka.msf.MSFParser.MIN_AVAILABILITY_WINDOW_SEC_);
    }

    const windowStart = this.getTimelineWindowStart_();
    if (windowStart != null) {
      const availabilityEnd =
          this.presentationTimeline_.getSegmentAvailabilityEnd();
      duration = Math.max(duration, availabilityEnd - windowStart);
    }

    if (duration > 0) {
      this.presentationTimeline_.setSegmentAvailabilityDuration(duration);
    }
  }

  /**
   * Subscribes a stream's track and turns the Objects it delivers into
   * segments, from the live edge or from a given Location.
   *
   * @param {shaka.msf.MSFParser.StreamState} state
   * @param {?shaka.msf.Utils.Location} startLocation Where to start, or null
   *   for the live edge.
   * @return {!Promise} Resolves once the subscription has produced its first
   *   segment.
   * @private
   */
  startSubscription_(state, startLocation) {
    const stream = state.stream;

    // Objects of the subscription being replaced can still be in flight, and
    // they describe a part of the presentation we have just left. The
    // generation is what tells them apart from the ones asked for here.
    const generation = ++state.generation;
    state.startLocation = startLocation;

    const segmenter =
        state.packaging.createSegmenter(this.msfTransport_.getCodec());
    let promiseWithResolvers = Promise.withResolvers();

    stream.segmentIndex?.release();
    stream.segmentIndex = new shaka.media.SegmentIndex([]);

    this.subscribeToTrack(state.track, state.trackKey, (obj) => {
      if (state.generation != generation || !stream.segmentIndex) {
        return;
      }
      // An object with no payload carries an object status rather than
      // media, so it contributes no bytes to measure.  It is still handed to
      // the segmenter, which may need it to know a group has ended.
      if (obj.data.byteLength) {
        this.recordBandwidthSample_(state.trackKey, obj.location,
            obj.data.byteLength,
            obj.receiveTimestampMs - obj.payloadReadStartMs);
      }

      for (const segment of segmenter.push(obj)) {
        // recordBandwidthSample_() above reports to ABR, which can pick a
        // new variant and switch to it synchronously; StreamingEngine then
        // calls closeSegmentIndex() on this stream before we get here.
        // Re-check on every segment instead of only on entry, or we append
        // to a segment index that is already gone.
        if (state.generation != generation || !stream.segmentIndex) {
          return;
        }
        this.addSegment_(stream, state.type, segment,
            state.description.initSegmentReference);
        promiseWithResolvers?.resolve();
        promiseWithResolvers = null;
      }
    }, startLocation).then((subscribed) => {
      if (subscribed || !startLocation || state.generation != generation ||
          !stream.segmentIndex ||
          !this.activeStreams_.has(state.trackKey)) {
        // Nothing failed that is still wanted: the subscription is up, it
        // was the live edge to begin with, or the stream has been closed or
        // re-pointed since.
        return;
      }
      // The publisher refused to start where the media timeline said it
      // could. Following the live edge is not what the viewer asked for, but
      // it plays, whereas leaving the subscription withdrawn leaves the
      // stream waiting for content that is never coming.
      shaka.log.warning(
          `Track ${state.trackKey} could not be subscribed from ` +
          `group ${startLocation.group}; returning to the live edge`);
      this.startSubscription_(state, /* startLocation= */ null);
    });

    return /** @type {!Promise} */(promiseWithResolvers?.promise);
  }

  /**
   * Withdraws a stream's subscription, leaving its segment index alone.
   *
   * @param {shaka.msf.MSFParser.StreamState} state
   * @private
   */
  stopSubscription_(state) {
    const pending = this.pendingSubscriptions_.get(state.trackKey);
    if (pending) {
      pending.cancelled = true;
      this.pendingSubscriptions_.delete(state.trackKey);
    }
    const unregister = this.unregisterTracksCallback_.get(state.trackKey);
    if (unregister) {
      unregister();
      this.unregisterTracksCallback_.delete(state.trackKey);
    }
    // The next subscription starts a new group sequence, so an accumulated
    // sample from this one would be reported as one enormous group.
    this.bandwidthSamples_.delete(state.trackKey);
  }

  /**
   * Re-points the subscriptions after a seek to content that has been
   * published but not received.
   *
   * A MoQT subscription is a position in a track, not a URL to fetch, so this
   * is what a seek costs here: the subscription is withdrawn and asked for
   * again from the Location the media timeline gives for the target, and the
   * segment index starts over from there. Seeking within what has already
   * arrived costs nothing and is left alone.
   *
   * @private
   */
  onSeeking_() {
    if (!this.mediaElement_ || !this.msfTransport_ ||
        !this.presentationTimeline_) {
      return;
    }

    const time = this.mediaElement_.currentTime;
    const liveEdge = this.presentationTimeline_.getSegmentAvailabilityEnd();

    for (const state of this.activeStreams_.values()) {
      const stream = state.stream;
      if (!stream.segmentIndex ||
          shaka.msf.MSFParser.isIndexed_(stream.segmentIndex, time)) {
        // Nothing to ask for: either the stream is not subscribed, or the
        // target is already indexed and the media is on its way.
        continue;
      }

      /** @type {?shaka.msf.Utils.Location} */
      let startLocation = null;
      if (time < liveEdge - shaka.msf.MSFParser.LIVE_EDGE_TOLERANCE_SEC_) {
        const timeline = this.mediaTimelines_.get(state.track.name);
        startLocation = timeline ? timeline.locationForTime(time) : null;
        if (!startLocation) {
          continue;
        }
        if (state.startLocation &&
            state.startLocation.group == startLocation.group &&
            state.startLocation.object == startLocation.object) {
          // Already waiting on exactly this; asking again would restart the
          // wait and drop the Objects that are on their way.
          continue;
        }
      } else if (!state.startLocation) {
        // Back at the live edge on a subscription that already follows it.
        continue;
      }

      shaka.log.debug(`Re-subscribing ${state.trackKey} at ${time}s`,
          startLocation);
      this.stopSubscription_(state);
      this.startSubscription_(state, startLocation);
    }
  }

  /**
   * @param {msfCatalog.Catalog} catalog
   * @return {!Map<string, !shaka.extern.DrmInfo>}
   * @private
   */
  getContentProtections_(catalog) {
    const uuidMap = shaka.drm.DrmUtils.getUuidMap();

    /** @type {!Map<string, !shaka.extern.DrmInfo>} */
    const mapContentProtections = new Map();
    const contentProtections = catalog.contentProtections || [];
    for (const contentProtection of contentProtections) {
      const refId = contentProtection.refID;
      const drmSystem = contentProtection.drmSystem;

      if (!drmSystem) {
        continue;
      }
      const keySystem = uuidMap[drmSystem.systemID.toLowerCase()];
      if (!keySystem) {
        continue;
      }
      const encryptionScheme = contentProtection.scheme || 'cenc';

      let initData = null;
      if (drmSystem.pssh) {
        initData = [{
          initDataType: 'cenc',
          initData: shaka.util.Uint8ArrayUtils.fromBase64(drmSystem.pssh),
        }];
      }

      const drmInfo = shaka.util.ManifestParserUtils.createDrmInfo(
          keySystem, encryptionScheme, initData);

      if (drmSystem.laURL?.url) {
        drmInfo.licenseServerUri = drmSystem.laURL.url;
      } else if (initData &&
          shaka.drm.DrmUtils.isPlayReadyKeySystem(keySystem)) {
        drmInfo.licenseServerUri =
            shaka.drm.PlayReady.getLicenseUrlFromPssh(initData[0].initData);
      }
      if (drmSystem.certURL?.url) {
        drmInfo.serverCertificateUri = drmSystem.certURL.url;
      }
      if (drmSystem.robustness) {
        drmInfo.videoRobustness = drmSystem.robustness;
        drmInfo.audioRobustness = drmSystem.robustness;
      }
      if (contentProtection.defaultKID) {
        for (const kid of contentProtection.defaultKID) {
          const normalizedKid = kid.replace(/-/g, '').toLowerCase();
          drmInfo.keyIds.add(normalizedKid);
        }
      }

      mapContentProtections.set(refId, drmInfo);
    }
    return mapContentProtections;
  }

  /**
   * @param {msfCatalog.Track} track
   * @param {!Map<string, !shaka.extern.DrmInfo>} contentProtections
   * @param {!Map<string, string>} initDataList
   * @private
   */
  processTrack_(track, contentProtections, initDataList) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const ManifestParserUtils = shaka.util.ManifestParserUtils;

    let initData = new Uint8Array([]);
    if (track.initData) {
      initData = shaka.util.Uint8ArrayUtils.fromBase64(track.initData);
    } else if (track.initRef) {
      if (initDataList.has(track.initRef)) {
        initData = shaka.util.Uint8ArrayUtils.fromBase64(
            initDataList.get(track.initRef));
      }
    }

    const packaging = shaka.msf.PackagingRegistry.create(track.packaging);
    if (!packaging) {
      shaka.log.info(
          `Skipping track with unsupported packaging "${track.packaging}"`,
          track);
      return;
    }

    const description = packaging.describeTrack(track, initData);
    if (!description) {
      shaka.log.info('Skipping incompatible track', track);
      return;
    }
    const basicInfo = description.basicInfo;

    const mimeType = basicInfo.mimeType || track.mimeType || '';
    const codecs = basicInfo.codecs;
    let language = track.lang;
    if (!track.lang || track.lang == 'und') {
      language = basicInfo.language || track.lang;
    }
    const frameRate = Number(basicInfo.frameRate) || track.framerate;
    const width = Number(basicInfo.width) || track.width;
    const height = Number(basicInfo.height) || track.height;
    let channelsCount = basicInfo.channelCount;
    if (!channelsCount && track.channelConfig) {
      channelsCount = parseInt(track.channelConfig, 10);
    }
    const audioSamplingRate = basicInfo.sampleRate || track.samplerate || null;
    const hdr = basicInfo.videoRange || undefined;
    const colorGamut = basicInfo.colorGamut || undefined;

    let type = ContentType.TEXT;
    for (const format of ManifestParserUtils.VIDEO_CODEC_REGEXPS) {
      if (format.test(codecs.trim())) {
        type = ContentType.VIDEO;
      }
    }
    if (type == ContentType.TEXT) {
      for (const format of ManifestParserUtils.AUDIO_CODEC_REGEXPS) {
        if (format.test(codecs.trim())) {
          type = ContentType.AUDIO;
        }
      }
    }

    let kind = undefined;
    let accessibilityPurpose = null;

    const roles = [];
    if (track.role) {
      roles.push(track.role);
      switch (track.role) {
        case 'audiodescription':
          if (type == ContentType.AUDIO) {
            accessibilityPurpose =
              shaka.media.ManifestParser.AccessibilityPurpose.VISUALLY_IMPAIRED;
          }
          break;
        case 'caption':
          if (type == ContentType.TEXT) {
            kind = ManifestParserUtils.TextStreamKind.CLOSED_CAPTION;
          }
          break;
        case 'subtitle':
          if (type == ContentType.TEXT) {
            kind = ManifestParserUtils.TextStreamKind.SUBTITLE;
          }
          break;
      }
    }

    let drmInfos = [];
    const contentProtectionRefIDs = track.contentProtectionRefIDs;
    if (contentProtectionRefIDs) {
      for (const refId of contentProtectionRefIDs) {
        const drmInfo = contentProtections.get(refId);
        if (drmInfo) {
          drmInfos.push(drmInfo);
        } else {
          shaka.log.alwaysWarn('Unrecognized contentProtectionRefID', refId);
          return;
        }
      }
    } else {
      drmInfos = basicInfo.drmInfos;
    }

    const closedCaptions = new Map();
    if (!this.config_.disableText) {
      for (const accessibility of (track.accessibility || [])) {
        // draft-ietf-moq-msf-01 5.2.44 names this field 'scheme'.  The
        // corresponding DASH attribute is 'schemeIdUri', which is where the
        // wrong name came from; reading it left closedCaptions empty for
        // every conforming catalog, so embedded captions were never exposed.
        const scheme = accessibility.scheme;
        const value = accessibility.value;
        if (scheme == 'urn:scte:dash:cc:cea-608:2015') {
          ManifestParserUtils.parseCEA608Captions(value, closedCaptions);
        } else if (scheme == 'urn:scte:dash:cc:cea-708:2015') {
          ManifestParserUtils.parseCEA708Captions(value, closedCaptions);
        }
      }
    }

    /** @type {shaka.extern.Stream} */
    const stream = {
      id: this.globalId_++,
      originalId: track.name,
      groupId: null,
      createSegmentIndex: () => Promise.resolve(),
      segmentIndex: null,
      mimeType,
      codecs,
      supplementalCodecs: '',
      kind,
      encrypted: false,
      drmInfos,
      keyIds: new Set(),
      language: shaka.util.LanguageUtils.normalize(language || 'und'),
      originalLanguage: language || null,
      label: track.label || null,
      type,
      primary: false,
      trickModeVideo: null,
      dependencyStream: null,
      emsgSchemeIdUris: null,
      frameRate,
      pixelAspectRatio: undefined,
      width,
      height,
      bandwidth: track.bitrate,
      roles,
      forced: false,
      channelsCount,
      audioSamplingRate,
      spatialAudio: false,
      closedCaptions,
      hdr,
      colorGamut,
      videoLayout: undefined,
      tilesLayout: undefined,
      accessibilityPurpose,
      external: false,
      fastSwitching: false,
      fullMimeTypes: new Set([shaka.util.MimeUtils.getFullType(
          mimeType, codecs)]),
      isAudioMuxedInVideo: false,
      baseOriginalId: null,
      isIframe: false,
      preselection: null,
    };

    const trackKey = `${track.namespace || ''}/${track.name}`;

    /** @type {shaka.msf.MSFParser.StreamState} */
    const state = {
      stream,
      type,
      track,
      trackKey,
      packaging,
      description,
      startLocation: null,
      generation: 0,
    };

    stream.createSegmentIndex = () => {
      this.activeStreams_.set(trackKey, state);
      return this.startSubscription_(state, /* startLocation= */ null);
    };

    stream.closeSegmentIndex = () => {
      this.activeStreams_.delete(trackKey);
      // Whatever the subscription still has in flight belongs to a stream
      // that is going away.
      state.generation++;
      this.stopSubscription_(state);
      // If we have a segment index, release it.
      stream.segmentIndex?.release();
      stream.segmentIndex = null;
    };

    switch (type) {
      case ContentType.AUDIO:
        if (!this.config_.disableAudio) {
          this.audioStreams_.push(stream);
        }
        break;
      case ContentType.VIDEO:
        if (!this.config_.disableVideo) {
          this.videoStreams_.push(stream);
        }
        break;
      case ContentType.TEXT:
        if (!this.config_.disableText) {
          this.textStreams_.push(stream);
        }
        break;
    }
  }

  /**
   * Adds a segment produced by a packaging's segmenter to a stream's segment
   * index and advances the presentation timeline to cover it.
   *
   * @param {shaka.extern.Stream} stream
   * @param {shaka.util.ManifestParserUtils.ContentType} type
   * @param {!shaka.extern.MsfSegment} segment
   * @param {shaka.media.InitSegmentReference} initSegmentReference
   * @private
   */
  addSegment_(stream, type, segment, initSegmentReference) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    const reference = new shaka.media.SegmentReference(
        /* startTime= */ segment.startTime,
        /* endTime= */ segment.startTime + segment.duration,
        /* getUris= */ () => [],
        /* startByte= */ 0,
        /* endByte= */ null,
        /* initSegmentReference= */ initSegmentReference,
        /* timestampOffset= */ segment.timestampOffset,
        /* appendWindowStart= */ 0,
        /* appendWindowEnd= */ Infinity);

    reference.discontinuitySequence = segment.discontinuitySequence;
    reference.setSegmentData(segment.data);

    this.receivedFirstSegment_.add(type);

    const timelineLocked = this.presentationTimeline_.isStartTimeLocked();

    if (timelineLocked) {
      // StreamingEngine walks the index in order from its last appended
      // reference, so it can never skip to content whose predecessor has been
      // evicted: when the reference it wants next is gone,
      // getSegmentReferenceNeeded_ returns null and update_ parks in its
      // "segment could not be found" retry, falls further behind, and the
      // eviction that caused the stall guarantees the stall persists.
      //
      // Retaining a couple of seconds is only sane when a reference is a
      // multi-second segment. Where one reference is one frame it is a few
      // dozen of them, and any hiccup longer than that is unrecoverable.
      // References are metadata, so retention is cheap.
      const evictTime = Math.min(
          reference.startTime - shaka.msf.MSFParser.INDEX_RETENTION_SEC_,
          this.presentationTimeline_.getSegmentAvailabilityStart());
      stream.segmentIndex.mergeAndEvict([reference], evictTime);
    } else {
      stream.segmentIndex.merge([reference]);
    }

    this.presentationTimeline_.notifySegments([reference]);
    this.presentationTimeline_.notifyMaxSegmentDuration(segment.duration);

    this.updateAvailabilityWindow_();

    if (!timelineLocked &&
        (!this.audioStreams_.length ||
        this.receivedFirstSegment_.has(ContentType.AUDIO)) &&
        (!this.videoStreams_.length ||
        this.receivedFirstSegment_.has(ContentType.VIDEO))) {
      // Only lock once we have first segments from all expected types.
      this.presentationTimeline_.lockStartTime();
    }
  }

  /**
   * @private
   */
  createVariants_() {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    // Create variants for all audio/video combinations.
    let nextVariantId = 0;
    const variants = [];
    if (!this.videoStreams_.length || !this.audioStreams_.length) {
      // For audio-only or video-only content, just give each stream its own
      // variant.
      const streams = this.videoStreams_.length ? this.videoStreams_ :
        this.audioStreams_;
      for (const stream of streams) {
        const id = nextVariantId++;
        let bandwidth = stream.bandwidth || 0;
        if (stream.dependencyStream) {
          bandwidth += stream.dependencyStream.bandwidth || 0;
        }
        variants.push({
          id,
          language: stream.language,
          disabledUntilTime: 0,
          primary: stream.primary,
          audio: stream.type == ContentType.AUDIO ? stream : null,
          video: stream.type == ContentType.VIDEO ? stream : null,
          bandwidth,
          drmInfos: stream.drmInfos,
          allowedByApplication: true,
          allowedByKeySystem: true,
          decodingInfos: [],
        });
      }
    } else {
      for (const audio of this.audioStreams_) {
        for (const video of this.videoStreams_) {
          const commonDrmInfos = shaka.drm.DrmUtils.getCommonDrmInfos(
              audio.drmInfos, video.drmInfos);

          if (audio.drmInfos.length && video.drmInfos.length &&
              !commonDrmInfos.length) {
            shaka.log.warning(
                'Incompatible DRM in audio & video, skipping variant creation.',
                audio, video);
            continue;
          }

          let bandwidth = (audio.bandwidth || 0) + (video.bandwidth || 0);
          if (audio.dependencyStream) {
            bandwidth += audio.dependencyStream.bandwidth || 0;
          }
          if (video.dependencyStream) {
            bandwidth += video.dependencyStream.bandwidth || 0;
          }

          const id = nextVariantId++;
          variants.push({
            id,
            language: audio.language,
            disabledUntilTime: 0,
            primary: audio.primary,
            audio,
            video,
            bandwidth,
            drmInfos: commonDrmInfos,
            allowedByApplication: true,
            allowedByKeySystem: true,
            decodingInfos: [],
          });
        }
      }
    }

    this.variants_ = variants;
  }
};


/**
 * How many seconds of SegmentReferences to keep in the index behind the newest
 * one.
 *
 * Must exceed how far StreamingEngine can lag the live edge, because it walks
 * the index in order and cannot skip to content whose predecessor has been
 * evicted. Where one reference is one frame this is a large number of
 * references but a small amount of memory.
 *
 * @private @const {number}
 */
shaka.msf.MSFParser.INDEX_RETENTION_SEC_ = 20;


/**
 * Floor for the live segment-availability window, in seconds.
 *
 * Deriving the window from one object's duration gives tens of milliseconds on
 * a frame-per-object packaging.  That is too narrow on two counts: the
 * playhead, which trails the live edge, falls outside its own seek range and
 * is re-seeked continuously; and the trailing track of a pair published a few
 * hundred milliseconds apart is never inside the window at all, so
 * StreamingEngine reports "cannot find segment" for it forever.
 *
 * Bounded from above as well.  This window IS the seek range, so it is what
 * the player offers the user as DVR, and it is how far the playhead may drift
 * behind the live edge before being pulled back to it.  Neither is wanted on a
 * transport chosen for low latency, and a window of five seconds or more also
 * makes the UI show a seek bar (shaka.ui.SeekBar's minimum seek window), which
 * would advertise DVR on a stream that has none.
 *
 * The quantity it has to cover is the lag between the newest reference and the
 * newest sample actually appended, since that is where the playhead can be.
 * Measured on a live LOC stream, that lag ran 2.0-4.7 s and the playhead sat
 * 1.0-3.8 s behind the live edge; a window of 1.5 s put it outside the range
 * again and it thrashed.
 *
 * @private @const {number}
 */
shaka.msf.MSFParser.MIN_AVAILABILITY_WINDOW_SEC_ = 4;


/**
 * Whether a segment index holds a reference covering the given time.
 *
 * SegmentIndex.find() answers a position, and for a time before everything it
 * holds it answers the first position rather than nothing, so its result says
 * where to look, not whether the time is there. Seeking behind the index is
 * exactly the case that distinction decides.
 *
 * @param {!shaka.media.SegmentIndex} segmentIndex
 * @param {number} time
 * @return {boolean}
 * @private
 */
shaka.msf.MSFParser.isIndexed_ = (segmentIndex, time) => {
  const position = segmentIndex.find(time);
  if (position == null) {
    return false;
  }
  const reference = segmentIndex.get(position);
  return !!reference &&
      time >= reference.startTime && time < reference.endTime;
};


/**
 * The catalog `packaging` value of a media timeline track.
 *
 * @private @const {string}
 */
shaka.msf.MSFParser.MEDIA_TIMELINE_PACKAGING_ = 'mediatimeline';


/**
 * How close to the live edge a seek target has to land to be treated as a
 * return to the live edge rather than as a seek into the DVR window, in
 * seconds.
 *
 * Seeking to "live" lands on the seek range end, which is the newest segment
 * end time; by the time the seek is handled the edge may have moved on, so an
 * exact comparison would read the seek as one into the past and anchor the
 * subscription just behind the edge instead of following it.
 *
 * @private @const {number}
 */
shaka.msf.MSFParser.LIVE_EDGE_TOLERANCE_SEC_ = 1;


/**
 * What the parser keeps for a stream that is currently subscribed. It is
 * everything a subscription needs to be started again from somewhere else,
 * which is what a seek does.
 *
 * @typedef {{
 *   stream: shaka.extern.Stream,
 *   type: shaka.util.ManifestParserUtils.ContentType,
 *   track: msfCatalog.Track,
 *   trackKey: string,
 *   packaging: shaka.extern.MsfPackaging,
 *   description: shaka.extern.MsfTrackDescription,
 *   startLocation: ?shaka.msf.Utils.Location,
 *   generation: number,
 * }}
 *
 * @property {shaka.extern.Stream} stream
 *   The stream this track feeds.
 * @property {shaka.util.ManifestParserUtils.ContentType} type
 *   The stream's content type.
 * @property {msfCatalog.Track} track
 *   The catalog track, which is what a subscription is addressed with.
 * @property {string} trackKey
 *   The namespace-qualified track name, used as the subscription key.
 * @property {shaka.extern.MsfPackaging} packaging
 *   The packaging that makes segments out of this track's Objects.
 * @property {shaka.extern.MsfTrackDescription} description
 *   What the packaging derived from the catalog, held for the initialization
 *   segment reference every segment carries.
 * @property {?shaka.msf.Utils.Location} startLocation
 *   Where the current subscription was asked to start, or null when it
 *   follows the live edge.
 * @property {number} generation
 *   Counts the subscriptions this stream has had, so that Objects still in
 *   flight from a previous one can be told apart and dropped.
 */
shaka.msf.MSFParser.StreamState;


shaka.media.ManifestParser.registerParserByMime(
    'application/msf', () => new shaka.msf.MSFParser());
