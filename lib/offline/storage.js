/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.offline.Storage');

goog.require('goog.asserts');
goog.require('shaka.Deprecate');
goog.require('shaka.Player');
goog.require('shaka.log');
goog.require('shaka.media.DrmEngine');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.offline.DownloadManager');
goog.require('shaka.offline.OfflineUri');
goog.require('shaka.offline.SessionDeleter');
goog.require('shaka.offline.StorageMuxer');
goog.require('shaka.offline.StoredContentUtils');
goog.require('shaka.offline.StreamBandwidthEstimator');
goog.require('shaka.util.ArrayUtils');
goog.require('shaka.util.Destroyer');
goog.require('shaka.util.Error');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.ManifestFilter');
goog.require('shaka.util.Networking');
goog.require('shaka.util.Periods');
goog.require('shaka.util.Platform');
goog.require('shaka.util.PlayerConfiguration');
goog.require('shaka.util.StreamUtils');


/**
 * @summary
 * This manages persistent offline data including storage, listing, and deleting
 * stored manifests.  Playback of offline manifests are done through the Player
 * using a special URI (see shaka.offline.OfflineUri).
 *
 * First, check support() to see if offline is supported by the platform.
 * Second, configure() the storage object with callbacks to your application.
 * Third, call store(), remove(), or list() as needed.
 * When done, call destroy().
 *
 * @implements {shaka.util.IDestroyable}
 * @export
 */
shaka.offline.Storage = class {
  /**
   * @param {!shaka.Player=} player
   *    A player instance to share a networking engine and configuration with.
   *    When initializing with a player, storage is only valid as long as
   *    |destroy| has not been called on the player instance. When omitted,
   *    storage will manage its own networking engine and configuration.
   */
  constructor(player) {
    // It is an easy mistake to make to pass a Player proxy from CastProxy.
    // Rather than throw a vague exception later, throw an explicit and clear
    // one now.
    //
    // TODO(vaage): After we decide whether or not we want to support
    //  initializing storage with a player proxy, we should either remove
    //  this error or rename the error.
    if (player && player.constructor != shaka.Player) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.STORAGE,
          shaka.util.Error.Code.LOCAL_PLAYER_INSTANCE_REQUIRED);
    }

    /** @private {?shaka.extern.PlayerConfiguration} */
    this.config_ = null;

    /** @private {shaka.net.NetworkingEngine} */
    this.networkingEngine_ = null;

    // Initialize |config_| and |networkingEngine_| based on whether or not
    // we were given a player instance.
    if (player) {
      this.config_ = player.getSharedConfiguration();
      this.networkingEngine_ = player.getNetworkingEngine();

      goog.asserts.assert(
          this.networkingEngine_,
          'Storage should not be initialized with a player that had ' +
              '|destroy| called on it.');
    } else {
      this.config_ = shaka.util.PlayerConfiguration.createDefault();
      this.networkingEngine_ = new shaka.net.NetworkingEngine();
    }

    /** @private {boolean} */
    this.storeInProgress_ = false;

    /**
     * A list of segment ids for all the segments that were added during the
     * current store. If the store fails or is aborted, these need to be
     * removed from storage.
     * @private {!Array.<number>}
     */
    this.segmentsFromStore_ = [];

    /**
     * A list of open operations that are being performed by this instance of
     * |shaka.offline.Storage|.
     *
     * @private {!Array.<!Promise>}
     */
    this.openOperations_ = [];

    /**
     * Storage should only destroy the networking engine if it was initialized
     * without a player instance. Store this as a flag here to avoid including
     * the player object in the destoyer's closure.
     *
     * @type {boolean}
     */
    const destroyNetworkingEngine = !player;

    /** @private {!shaka.util.Destroyer} */
    this.destroyer_ = new shaka.util.Destroyer(async () => {
      // Wait for all the open operations to end. Wrap each operations so that a
      // single rejected promise won't cause |Promise.all| to return early or to
      // return a rejected Promise.
      const noop = () => {};
      await Promise.all(this.openOperations_.map((op) => op.then(noop, noop)));

      // Wait until after all the operations have finished before we destroy
      // the networking engine to avoid any unexpected errors.
      if (destroyNetworkingEngine) {
        await this.networkingEngine_.destroy();
      }

      // Drop all references to internal objects to help with GC.
      this.config_ = null;
      this.networkingEngine_ = null;
    });
  }


  /**
   * Gets whether offline storage is supported.  Returns true if offline storage
   * is supported for clear content.  Support for offline storage of encrypted
   * content will not be determined until storage is attempted.
   *
   * @return {boolean}
   * @export
   */
  static support() {
    // Our Storage system is useless without MediaSource.  MediaSource allows us
    // to pull data from anywhere (including our Storage system) and feed it to
    // the video element.
    if (!shaka.util.Platform.supportsMediaSource()) {
      return false;
    }

    return shaka.offline.StorageMuxer.support();
  }

  /**
   * @override
   * @export
   */
  destroy() {
    return this.destroyer_.destroy();
  }

  /**
   * Sets configuration values for Storage.  This is associated with
   * Player.configure and will change the player instance given at
   * initialization.
   *
   * @param {string|!Object} config This should either be a field name or an
   *   object following the form of {@link shaka.extern.PlayerConfiguration},
   *   where you may omit any field you do not wish to change.
   * @param {*=} value This should be provided if the previous parameter
   *   was a string field name.
   * @return {boolean}
   * @export
   */
  configure(config, value) {
    goog.asserts.assert(typeof(config) == 'object' || arguments.length == 2,
        'String configs should have values!');

    // ('fieldName', value) format
    if (arguments.length == 2 && typeof(config) == 'string') {
      config = shaka.util.ConfigUtils.convertToConfigObject(config, value);
    }

    goog.asserts.assert(typeof(config) == 'object', 'Should be an object!');

    shaka.offline.Storage.verifyConfig_(config);

    goog.asserts.assert(
        this.config_, 'Cannot reconfigure stroage after calling destroy.');
    return shaka.util.PlayerConfiguration.mergeConfigObjects(
        this.config_ /* destination */, config /* updates */);
  }

  /**
   * Return a copy of the current configuration.  Modifications of the returned
   * value will not affect the Storage instance's active configuration.  You
   * must call storage.configure() to make changes.
   *
   * @return {shaka.extern.PlayerConfiguration}
   * @export
   */
  getConfiguration() {
    goog.asserts.assert(this.config_, 'Config must not be null!');

    const ret = shaka.util.PlayerConfiguration.createDefault();
    shaka.util.PlayerConfiguration.mergeConfigObjects(
        ret, this.config_, shaka.util.PlayerConfiguration.createDefault());
    return ret;
  }

  /**
   * Return the networking engine that storage is using. If storage was
   * initialized with a player instance, then the networking engine returned
   * will be the same as |player.getNetworkingEngine()|.
   *
   * The returned value will only be null if |destroy| was called before
   * |getNetworkingEngine|.
   *
   * @return {shaka.net.NetworkingEngine}
   * @export
   */
  getNetworkingEngine() {
    return this.networkingEngine_;
  }

  /**
   * Stores the given manifest.  If the content is encrypted, and encrypted
   * content cannot be stored on this platform, the Promise will be rejected
   * with error code 6001, REQUESTED_KEY_SYSTEM_CONFIG_UNAVAILABLE.
   *
   * @param {string} uri The URI of the manifest to store.
   * @param {!Object=} appMetadata An arbitrary object from the application
   *   that will be stored along-side the offline content.  Use this for any
   *   application-specific metadata you need associated with the stored
   *   content.  For details on the data types that can be stored here, please
   *   refer to {@link https://bit.ly/StructClone}
   * @param {string|shaka.extern.ManifestParser.Factory=} mimeType
   *   The mime type for the content |manifestUri| points to or a manifest
   *   parser factory to override auto-detection or use an unregistered parser.
   *   Passing a manifest parser factory is deprecated and will be removed.
   * @return {!Promise.<shaka.extern.StoredContent>}  A Promise to a structure
   *   representing what was stored.  The "offlineUri" member is the URI that
   *   should be given to Player.load() to play this piece of content offline.
   *   The "appMetadata" member is the appMetadata argument you passed to
   *   store().
   * @export
   */
  store(uri, appMetadata, mimeType) {
    const getParser = async () => {
      if (mimeType && typeof mimeType != 'string') {
        shaka.Deprecate.deprecateFeature(
            2, 6,
            'Storing with a manifest parser factory',
            'Please register a manifest parser and for the mime-type.');

        const Factory =
        /** @type {shaka.extern.ManifestParser.Factory} */(mimeType);
        return new Factory();
      }

      goog.asserts.assert(
          this.networkingEngine_, 'Should not call |store| after |destroy|');

      const parser = await shaka.media.ManifestParser.create(
          uri,
          this.networkingEngine_,
          this.config_.manifest.retryParameters,
          /** @type {?string} */ (mimeType));

      return parser;
    };

    return this.startOperation_(this.store_(uri, appMetadata || {}, getParser));
  }

  /**
   * Returns true if an asset is currently downloading.
   *
   * @return {boolean}
   * @export
   */
  getStoreInProgress() {
    return this.storeInProgress_;
  }

  /**
   * See |shaka.offline.Storage.store| for details.
   *
   * @param {string} uri
   * @param {!Object} appMetadata
   * @param {function():!Promise.<shaka.extern.ManifestParser>} getParser
   * @return {!Promise.<shaka.extern.StoredContent>}
   * @private
   */
  async store_(uri, appMetadata, getParser) {
    // TODO: Create a way for a download to be canceled while being downloaded.
    this.requireSupport_();

    if (this.storeInProgress_) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.STORAGE,
          shaka.util.Error.Code.STORE_ALREADY_IN_PROGRESS);
    }
    this.storeInProgress_ = true;

    const manifest = await this.parseManifest(uri, getParser);

    // Check if we were asked to destroy ourselves while we were "away"
    // downloading the manifest.
    this.ensureNotDestroyed_();

    // Check if we can even download this type of manifest before trying to
    // create the drm engine.
    const canDownload = !manifest.presentationTimeline.isLive() &&
                        !manifest.presentationTimeline.isInProgress();
    if (!canDownload) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.STORAGE,
          shaka.util.Error.Code.CANNOT_STORE_LIVE_OFFLINE,
          uri);
    }

    // Since we will need to use |drmEngine|, |activeHandle|, and |muxer| in the
    // catch/finally blocks, we need to define them out here. Since they may not
    // get initialized when we enter the catch/finally block, we need to assume
    // that they may be null/undefined when we get there.
    /** @type {?shaka.media.DrmEngine} */
    let drmEngine = null;
    /** @type {shaka.offline.StorageMuxer} */
    const muxer = new shaka.offline.StorageMuxer();
    /** @type {?shaka.offline.StorageCellHandle} */
    let activeHandle = null;

    // This will be used to store any errors from drm engine. Whenever drm
    // engine is passed to another function to do work, we should check if this
    // was set.
    let drmError = null;

    try {
      drmEngine = await this.createDrmEngine(
          manifest,
          (e) => { drmError = drmError || e; });

      // We could have been asked to destroy ourselves while we were "away"
      // creating the drm engine.
      this.ensureNotDestroyed_();
      if (drmError) {
        throw drmError;
      }

      this.filterManifest_(manifest, drmEngine);

      await muxer.init();
      this.ensureNotDestroyed_();

      // Get the cell that we are saving the manifest to. Once we get a cell
      // we will only reference the cell and not the muxer so that the manifest
      // and segments will all be saved to the same cell.
      activeHandle = await muxer.getActive();
      this.ensureNotDestroyed_();

      goog.asserts.assert(drmEngine, 'drmEngine should be non-null here.');

      const manifestDB = await this.downloadManifest_(
          activeHandle.cell, drmEngine, manifest, uri, appMetadata);
      this.ensureNotDestroyed_();
      if (drmError) {
        throw drmError;
      }

      const ids = await activeHandle.cell.addManifests([manifestDB]);
      this.ensureNotDestroyed_();

      const offlineUri = shaka.offline.OfflineUri.manifest(
          activeHandle.path.mechanism, activeHandle.path.cell, ids[0]);

      return shaka.offline.StoredContentUtils.fromManifestDB(
          offlineUri, manifestDB);
    } catch (e) {
      // If we did start saving some data, we need to remove it all to avoid
      // wasting storage. However if the muxer did not manage to initialize,
      // then we won't have an active cell to remove the segments from.
      if (activeHandle) {
        await activeHandle.cell.removeSegments(
            this.segmentsFromStore_, () => {});
      }

      // If we already had an error, ignore this error to avoid hiding
      // the original error.
      throw drmError || e;
    } finally {
      this.storeInProgress_ = false;
      this.segmentsFromStore_ = [];

      await muxer.destroy();
      if (drmEngine) {
        await drmEngine.destroy();
      }
    }
  }

  /**
   * Filter |manifest| such that it will only contain the variants and text
   * streams that we want to store and can actually play.
   *
   * @param {shaka.extern.Manifest} manifest
   * @param {!shaka.media.DrmEngine} drmEngine
   * @private
   */
  filterManifest_(manifest, drmEngine) {
    // Filter the manifest based on the restrictions given in the player
    // configuration.
    const maxHwRes = {width: Infinity, height: Infinity};
    shaka.util.ManifestFilter.filterByRestrictions(
        manifest, this.config_.restrictions, maxHwRes);

    // Filter the manifest based on what we know media source will be able to
    // play later (no point storing something we can't play).
    shaka.util.ManifestFilter.filterByMediaSourceSupport(manifest);

    // Filter the manifest based on what we know our drm system will support
    // playing later.
    shaka.util.ManifestFilter.filterByDrmSupport(manifest, drmEngine);

    // Filter the manifest so that it will only use codecs that are available in
    // all periods.
    shaka.util.ManifestFilter.filterByCommonCodecs(manifest);

    // Filter each variant based on what the app says they want to store. The
    // app will only be given variants that are compatible with all previous
    // post-filtered periods.
    shaka.util.ManifestFilter.rollingFilter(manifest, (period) => {
      const StreamUtils = shaka.util.StreamUtils;
      const allTracks = [];

      for (const variant of period.variants) {
        goog.asserts.assert(
            StreamUtils.isPlayable(variant),
            'We should have already filtered by "is playable"');

        allTracks.push(StreamUtils.variantToTrack(variant));
      }

      for (const text of period.textStreams) {
        allTracks.push(StreamUtils.textStreamToTrack(text));
      }

      const chosenTracks =
          this.config_.offline.trackSelectionCallback(allTracks);

      /** @type {!Set.<number>} */
      const variantIds = new Set();
      /** @type {!Set.<number>} */
      const textIds = new Set();

      for (const track of chosenTracks) {
        if (track.type == 'variant') {
          variantIds.add(track.id);
        }
        if (track.type == 'text') {
          textIds.add(track.id);
        }
      }

      period.variants =
          period.variants.filter((variant) => variantIds.has(variant.id));
      period.textStreams =
          period.textStreams.filter((stream) => textIds.has(stream.id));
    });

    // Check the post-filtered manifest for characteristics that may indicate
    // issues with how the app selected tracks.
    shaka.offline.Storage.validateManifest_(manifest);
  }

  /**
   * Create a download manager and download the manifest.
   *
   * @param {shaka.extern.StorageCell} storage
   * @param {!shaka.media.DrmEngine} drmEngine
   * @param {shaka.extern.Manifest} manifest
   * @param {string} uri
   * @param {!Object} metadata
   * @return {!Promise.<shaka.extern.ManifestDB>}
   * @private
   */
  async downloadManifest_(storage, drmEngine, manifest, uri, metadata) {
    goog.asserts.assert(
        this.networkingEngine_,
        'Cannot call |downloadManifest_| after calling |destroy|.');

    const pendingContent = shaka.offline.StoredContentUtils.fromManifest(
        uri, manifest, /* size */ 0, metadata);

    const isEncrypted = manifest.periods.some((period) => {
      return period.variants.some((variant) => {
        return variant.drmInfos && variant.drmInfos.length;
      });
    });
    const includesInitData = manifest.periods.some((period) => {
      return period.variants.some((variant) => {
        return variant.drmInfos.some((drmInfos) => {
          return drmInfos.initData && drmInfos.initData.length;
        });
      });
    });
    const needsInitData = isEncrypted && !includesInitData;

    /** @type {!shaka.offline.DownloadManager} */
    const downloader = new shaka.offline.DownloadManager(
        this.networkingEngine_,
        (progress, size) => {
          // Update the size of the stored content before issuing a progress
          // update.
          pendingContent.size = size;
          this.config_.offline.progressCallback(pendingContent, progress);
        },
        (initData) => {
          if (needsInitData && this.config_.offline.usePersistentLicense) {
            drmEngine.newInitData('cenc', initData);
          }
        });

    try {
      const manifestDB = this.createOfflineManifest_(
          downloader, storage, drmEngine, manifest, uri, metadata);

      manifestDB.size = await downloader.waitToFinish();
      manifestDB.expiration = drmEngine.getExpiration();
      const sessions = drmEngine.getSessionIds();
      manifestDB.sessionIds = this.config_.offline.usePersistentLicense ?
          sessions : [];

      if (isEncrypted && this.config_.offline.usePersistentLicense &&
          !sessions.length) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.STORAGE,
            shaka.util.Error.Code.NO_INIT_DATA_FOR_OFFLINE);
      }

      return manifestDB;
    } finally {
      await downloader.destroy();
    }
  }

  /**
   * Removes the given stored content.  This will also attempt to release the
   * licenses, if any.
   *
   * @param {string} contentUri
   * @return {!Promise}
   * @export
   */
  remove(contentUri) {
    return this.startOperation_(this.remove_(contentUri));
  }

  /**
   * See |shaka.offline.Storage.remove| for details.
   *
   * @param {string} contentUri
   * @return {!Promise}
   * @private
   */
  async remove_(contentUri) {
    this.requireSupport_();

    const nullableUri = shaka.offline.OfflineUri.parse(contentUri);
    if (nullableUri == null || !nullableUri.isManifest()) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.STORAGE,
          shaka.util.Error.Code.MALFORMED_OFFLINE_URI,
          contentUri);
    }

    /** @type {!shaka.offline.OfflineUri} */
    const uri = nullableUri;

    /** @type {!shaka.offline.StorageMuxer} */
    const muxer = new shaka.offline.StorageMuxer();

    try {
      await muxer.init();

      const cell = await muxer.getCell(uri.mechanism(), uri.cell());
      const manifests = await cell.getManifests([uri.key()]);
      const manifest = manifests[0];

      await Promise.all([
        this.removeFromDRM_(uri, manifest, muxer),
        this.removeFromStorage_(cell, uri, manifest),
      ]);
    } finally {
      await muxer.destroy();
    }
  }

  /**
   * @param {shaka.extern.ManifestDB} manifestDb
   * @param {boolean} isVideo
   * @return {!Array.<MediaKeySystemMediaCapability>}
   * @private
   */
  static getCapabilities_(manifestDb, isVideo) {
    const MimeUtils = shaka.util.MimeUtils;

    const ret = [];
    for (const period of manifestDb.periods) {
      for (const stream of period.streams) {
        if (isVideo && stream.contentType == 'video') {
          ret.push({
            contentType: MimeUtils.getFullType(stream.mimeType, stream.codecs),
            robustness: manifestDb.drmInfo.videoRobustness,
          });
        } else if (!isVideo && stream.contentType == 'audio') {
          ret.push({
            contentType: MimeUtils.getFullType(stream.mimeType, stream.codecs),
            robustness: manifestDb.drmInfo.audioRobustness,
          });
        }
      }
    }
    return ret;
  }

  /**
   * @param {!shaka.offline.OfflineUri} uri
   * @param {shaka.extern.ManifestDB} manifestDb
   * @param {!shaka.offline.StorageMuxer} muxer
   * @return {!Promise}
   * @private
   */
  async removeFromDRM_(uri, manifestDb, muxer) {
    goog.asserts.assert(this.networkingEngine_, 'Cannot be destroyed');
    await shaka.offline.Storage.deleteLicenseFor_(
        this.networkingEngine_, this.config_.drm, muxer, manifestDb);
  }

  /**
   * @param {shaka.extern.StorageCell} storage
   * @param {!shaka.offline.OfflineUri} uri
   * @param {shaka.extern.ManifestDB} manifest
   * @return {!Promise}
   * @private
   */
  removeFromStorage_( storage, uri, manifest) {
    /** @type {!Array.<number>} */
    const segmentIds = shaka.offline.Storage.getAllSegmentIds_(manifest);

    // Count(segments) + Count(manifests)
    const toRemove = segmentIds.length + 1;
    let removed = 0;

    const pendingContent = shaka.offline.StoredContentUtils.fromManifestDB(
        uri, manifest);

    const onRemove = (key) => {
      removed += 1;
      this.config_.offline.progressCallback(pendingContent, removed / toRemove);
    };

    return Promise.all([
      storage.removeSegments(segmentIds, onRemove),
      storage.removeManifests([uri.key()], onRemove),
    ]);
  }

  /**
   * Removes any EME sessions that were not successfully removed before.  This
   * returns whether all the sessions were successfully removed.
   *
   * @return {!Promise.<boolean>}
   * @export
   */
  removeEmeSessions() {
    return this.startOperation_(this.removeEmeSessions_());
  }

  /**
   * @return {!Promise.<boolean>}
   * @private
   */
  async removeEmeSessions_() {
    this.requireSupport_();

    goog.asserts.assert(this.networkingEngine_, 'Cannot be destroyed');
    const net = this.networkingEngine_;
    const config = this.config_.drm;

    /** @type {!shaka.offline.StorageMuxer} */
    const muxer = new shaka.offline.StorageMuxer();
    /** @type {!shaka.offline.SessionDeleter} */
    const deleter = new shaka.offline.SessionDeleter();

    let hasRemaining = false;

    try {
      await muxer.init();

      /** @type {!Array.<shaka.extern.EmeSessionStorageCell>} */
      const cells = [];
      muxer.forEachEmeSessionCell((c) => cells.push(c));

      // Run these sequentially to avoid creating too many DrmEngine instances
      // and having multiple CDMs alive at once.  Some embedded platforms may
      // not support that.
      for (const sessionIdCell of cells) {
        /* eslint-disable no-await-in-loop */
        const sessions = await sessionIdCell.getAll();
        const deletedSessionIds = await deleter.delete(config, net, sessions);
        await sessionIdCell.remove(deletedSessionIds);

        if (deletedSessionIds.length != sessions.length) {
          hasRemaining = true;
        }
        /* eslint-enable no-await-in-loop */
      }
    } finally {
      await muxer.destroy();
    }

    return !hasRemaining;
  }

  /**
   * Lists all the stored content available.
   *
   * @return {!Promise.<!Array.<shaka.extern.StoredContent>>}  A Promise to an
   *   array of structures representing all stored content.  The "offlineUri"
   *   member of the structure is the URI that should be given to Player.load()
   *   to play this piece of content offline.  The "appMetadata" member is the
   *   appMetadata argument you passed to store().
   * @export
   */
  list() {
    return this.startOperation_(this.list_());
  }

  /**
   * See |shaka.offline.Storage.list| for details.
   *
   * @return {!Promise.<!Array.<shaka.extern.StoredContent>>}
   * @private
   */
  async list_() {
    this.requireSupport_();

    /** @type {!Array.<shaka.extern.StoredContent>} */
    const result = [];

    /** @type {!shaka.offline.StorageMuxer} */
    const muxer = new shaka.offline.StorageMuxer();
    try {
      await muxer.init();

      let p = Promise.resolve();
      muxer.forEachCell((path, cell) => {
        p = p.then(async () => {
          const manifests = await cell.getAllManifests();

          manifests.forEach((manifest, key) => {
            const uri = shaka.offline.OfflineUri.manifest(
                path.mechanism,
                path.cell,
                key);

            const content = shaka.offline.StoredContentUtils.fromManifestDB(
                uri,
                manifest);

            result.push(content);
          });
        });
      });

      await p;
    } finally {
      await muxer.destroy();
    }

    return result;
  }


  /**
   * This method is public so that it can be overridden in testing.
   *
   * @param {string} uri
   * @param {function():!Promise.<shaka.extern.ManifestParser>} getParser
   * @return {!Promise.<shaka.extern.Manifest>}
   */
  async parseManifest(uri, getParser) {
    let error = null;

    const networkingEngine = this.networkingEngine_;
    goog.asserts.assert(networkingEngine, 'Should be initialized!');

    /** @type {shaka.extern.ManifestParser.PlayerInterface} */
    const playerInterface = {
      networkingEngine: networkingEngine,

      // Don't bother filtering now. We will do that later when we have all the
      // information we need to filter.
      filterAllPeriods: () => {},
      filterNewPeriod: () => {},

      onTimelineRegionAdded: () => {},
      onEvent: () => {},

      // Used to capture an error from the manifest parser. We will check the
      // error before returning.
      onError: (e) => {
        error = e;
      },
    };

    const parser = await getParser();
    parser.configure(this.config_.manifest);

    // We may have been destroyed while we were waiting on |getParser| to
    // resolve.
    this.ensureNotDestroyed_();

    try {
      const manifest = await parser.start(uri, playerInterface);

      // We may have been destroyed while we were waiting on |start| to
      // resolve.
      this.ensureNotDestroyed_();

      // Get all the streams that are used in the manifest.
      const streams = shaka.offline.Storage.getStreamSet_(manifest);

      // Wait for each stream to create their segment indexes.
      await Promise.all(Array.from(streams).map((stream) => {
        return stream.createSegmentIndex();
      }));

      // We may have been destroyed while we were waiting on
      // |createSegmentIndex| to resolve for each stream.
      this.ensureNotDestroyed_();

      // If we saw an error while parsing, surface the error.
      if (error) {
        throw error;
      }

      return manifest;
    } finally {
      await parser.stop();
    }
  }

  /**
   * This method is public so that it can be override in testing.
   *
   * @param {shaka.extern.Manifest} manifest
   * @param {function(shaka.util.Error)} onError
   * @return {!Promise.<!shaka.media.DrmEngine>}
   */
  async createDrmEngine(manifest, onError) {
    goog.asserts.assert(
        this.networkingEngine_,
        'Cannot call |createDrmEngine| after |destroy|');

    /** @type {!shaka.media.DrmEngine} */
    const drmEngine = new shaka.media.DrmEngine({
      netEngine: this.networkingEngine_,
      onError: onError,
      onKeyStatus: () => {},
      onExpirationUpdated: () => {},
      onEvent: () => {},
    });

    const variants = shaka.util.Periods.getAllVariantsFrom(manifest.periods);

    const config = this.config_;
    drmEngine.configure(config.drm);
    await drmEngine.initForStorage(
        variants, config.offline.usePersistentLicense);
    await drmEngine.setServerCertificate();
    await drmEngine.createOrLoad();

    return drmEngine;
  }

  /**
   * Creates an offline 'manifest' for the real manifest.  This does not store
   * the segments yet, only adds them to the download manager through
   * createPeriod_.
   *
   * @param {!shaka.offline.DownloadManager} downloader
   * @param {shaka.extern.StorageCell} storage
   * @param {!shaka.media.DrmEngine} drmEngine
   * @param {shaka.extern.Manifest} manifest
   * @param {string} originalManifestUri
   * @param {!Object} metadata
   * @return {shaka.extern.ManifestDB}
   * @private
   */
  createOfflineManifest_(
      downloader, storage, drmEngine, manifest, originalManifestUri, metadata) {
    const estimator = new shaka.offline.StreamBandwidthEstimator();

    const periods = manifest.periods.map((period) => {
      return this.createPeriod_(
          downloader, storage, estimator, drmEngine, manifest, period);
    });

    const usePersistentLicense = this.config_.offline.usePersistentLicense;
    const drmInfo = drmEngine.getDrmInfo();

    if (drmInfo && usePersistentLicense) {
      // Don't store init data, since we have stored sessions.
      drmInfo.initData = [];
    }

    return {
      originalManifestUri: originalManifestUri,
      duration: manifest.presentationTimeline.getDuration(),
      size: 0,
      expiration: drmEngine.getExpiration(),
      periods: periods,
      sessionIds: usePersistentLicense ? drmEngine.getSessionIds() : [],
      drmInfo: drmInfo,
      appMetadata: metadata,
    };
  }

  /**
   * Converts a manifest Period to a database Period.  This will use the current
   * configuration to get the tracks to use, then it will search each segment
   * index and add all the segments to the download manager through
   * createStream_.
   *
   * @param {!shaka.offline.DownloadManager} downloader
   * @param {shaka.extern.StorageCell} storage
   * @param {shaka.offline.StreamBandwidthEstimator} estimator
   * @param {!shaka.media.DrmEngine} drmEngine
   * @param {shaka.extern.Manifest} manifest
   * @param {shaka.extern.Period} period
   * @return {shaka.extern.PeriodDB}
   * @private
   */
  createPeriod_(downloader, storage, estimator, drmEngine, manifest, period) {
    // Pass all variants and text streams to the estimator so that we can
    // get the best estimate for each stream later.
    for (const period of manifest.periods) {
      for (const variant of period.variants) {
        estimator.addVariant(variant);
      }
      for (const text of period.textStreams) {
        estimator.addText(text);
      }
    }

    // Find the streams we want to download and create a stream db instance
    // for each of them.
    const streamSet = shaka.offline.Storage.getStreamSet_(manifest);
    const streamDBs = new Map();

    for (const stream of streamSet) {
      const streamDB = this.createStream_(
          downloader, storage, estimator, manifest, period, stream);
      streamDBs.set(stream.id, streamDB);
    }

    // Connect streams and variants together.
    for (const variant of period.variants) {
      if (variant.audio) {
        streamDBs.get(variant.audio.id).variantIds.push(variant.id);
      }
      if (variant.video) {
        streamDBs.get(variant.video.id).variantIds.push(variant.id);
      }
    }

    return {
      startTime: period.startTime,
      streams: Array.from(streamDBs.values()),
    };
  }

  /**
   * Converts a manifest stream to a database stream.  This will search the
   * segment index and add all the segments to the download manager.
   *
   * @param {!shaka.offline.DownloadManager} downloader
   * @param {shaka.extern.StorageCell} storage
   * @param {shaka.offline.StreamBandwidthEstimator} estimator
   * @param {shaka.extern.Manifest} manifest
   * @param {shaka.extern.Period} period
   * @param {shaka.extern.Stream} stream
   * @return {shaka.extern.StreamDB}
   * @private
   */
  createStream_(downloader, storage, estimator, manifest, period, stream) {
    /** @type {shaka.extern.StreamDB} */
    const streamDb = {
      id: stream.id,
      originalId: stream.originalId,
      primary: stream.primary,
      presentationTimeOffset: 0,
      contentType: stream.type,
      mimeType: stream.mimeType,
      codecs: stream.codecs,
      frameRate: stream.frameRate,
      kind: stream.kind,
      language: stream.language,
      label: stream.label,
      width: stream.width || null,
      height: stream.height || null,
      initSegmentKey: null,
      encrypted: stream.encrypted,
      keyId: stream.keyId,
      segments: [],
      variantIds: [],
    };

    /** @type {number} */
    const startTime =
        manifest.presentationTimeline.getSegmentAvailabilityStart();

    // Download each stream in parallel.
    const downloadGroup = stream.id;

    // Extract the init segment reference and PTO from the first segment.
    // Temporary, until the DB types are updated to match the manifest types.
    const firstPosition = stream.segmentIndex.find(startTime);
    const firstMediaSegment = firstPosition != null ?
        stream.segmentIndex.get(firstPosition) : null;
    const initSegment = firstMediaSegment ?
        firstMediaSegment.initSegmentReference : null;
    streamDb.presentationTimeOffset = firstMediaSegment ?
        firstMediaSegment.presentationTimeOffset : 0;

    if (initSegment) {
      const request = shaka.util.Networking.createSegmentRequest(
          initSegment.getUris(),
          initSegment.startByte,
          initSegment.endByte,
          this.config_.streaming.retryParameters);

      downloader.queue(
          downloadGroup,
          request,
          estimator.getInitSegmentEstimate(stream.id),
          /* isInitSegment */ true,
          async (data) => {
            const ids = await storage.addSegments([{data: data}]);
            this.segmentsFromStore_.push(ids[0]);
            streamDb.initSegmentKey = ids[0];
          });
    }

    shaka.offline.Storage.forEachSegment_(stream, startTime, (segment) => {
      const request = shaka.util.Networking.createSegmentRequest(
          segment.getUris(),
          segment.startByte,
          segment.endByte,
          this.config_.streaming.retryParameters);

      downloader.queue(
          downloadGroup,
          request,
          estimator.getSegmentEstimate(stream.id, segment),
          /* isInitSegment */ false,
          async (data) => {
            const ids = await storage.addSegments([{data: data}]);
            this.segmentsFromStore_.push(ids[0]);

            streamDb.segments.push({
              startTime: segment.startTime,
              endTime: segment.endTime,
              dataKey: ids[0],
            });
          });
    });

    return streamDb;
  }

  /**
   * @param {shaka.extern.Stream} stream
   * @param {number} startTime
   * @param {function(!shaka.media.SegmentReference)} callback
   * @private
   */
  static forEachSegment_(stream, startTime, callback) {
    /** @type {?number} */
    let i = stream.segmentIndex.find(startTime);
    /** @type {?shaka.media.SegmentReference} */
    let ref = i == null ? null : stream.segmentIndex.get(i);

    while (ref) {
      callback(ref);
      ref = stream.segmentIndex.get(++i);
    }
  }

  /**
   * Throws an error if the object is destroyed.
   * @private
   */
  ensureNotDestroyed_() {
    if (this.destroyer_.destroyed()) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.STORAGE,
          shaka.util.Error.Code.OPERATION_ABORTED);
    }
  }

  /**
   * Used by functions that need storage support to ensure that the current
   * platform has storage support before continuing. This should only be
   * needed to be used at the start of public methods.
   *
   * @private
   */
  requireSupport_() {
    if (!shaka.offline.Storage.support()) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.STORAGE,
          shaka.util.Error.Code.STORAGE_NOT_SUPPORTED);
    }
  }

  /**
   * Perform an action. Track the action's progress so that when we destroy
   * we will wait until all the actions have completed before allowing destroy
   * to resolve.
   *
   * @param {!Promise<T>} action
   * @return {!Promise<T>}
   * @template T
   * @private
   */
  async startOperation_(action) {
    this.openOperations_.push(action);

    try {
      // Await |action| so we can use the finally statement to remove |action|
      // from |openOperations_| when we still have a reference to |action|.
      return await action;
    } finally {
      shaka.util.ArrayUtils.remove(this.openOperations_, action);
    }
  }

  /**
   * @param {shaka.extern.ManifestDB} manifest
   * @return {!Array.<number>}
   * @private
   */
  static getAllSegmentIds_(manifest) {
    /** @type {!Array.<number>} */
    const ids = [];

    // Get every segment for every stream in the manifest.
    for (const period of manifest.periods) {
      for (const stream of period.streams) {
        if (stream.initSegmentKey != null) {
          ids.push(stream.initSegmentKey);
        }

        for (const segment of stream.segments) {
          ids.push(segment.dataKey);
        }
      }
    }

    return ids;
  }

  /**
   * Delete the on-disk storage and all the content it contains. This should not
   * be done in normal circumstances. Only do it when storage is rendered
   * unusable, such as by a version mismatch. No business logic will be run, and
   * licenses will not be released.
   *
   * @return {!Promise}
   * @export
   */
  static async deleteAll() {
    /** @type {!shaka.offline.StorageMuxer} */
    const muxer = new shaka.offline.StorageMuxer();
    try {
      // Wipe all content from all storage mechanisms.
      await muxer.erase();
    } finally {
      // Destroy the muxer, whether or not erase() succeeded.
      await muxer.destroy();
    }
  }

  /**
   * @param {!shaka.net.NetworkingEngine} net
   * @param {!shaka.extern.DrmConfiguration} drmConfig
   * @param {!shaka.offline.StorageMuxer} muxer
   * @param {shaka.extern.ManifestDB} manifestDb
   * @return {!Promise}
   * @private
   */
  static async deleteLicenseFor_(net, drmConfig, muxer, manifestDb) {
    if (!manifestDb.drmInfo) {
      return;
    }

    const sessionIdCell = muxer.getEmeSessionCell();

    /** @type {!Array.<shaka.extern.EmeSessionDB>} */
    const sessions = manifestDb.sessionIds.map((sessionId) => {
      return {
        sessionId: sessionId,
        keySystem: manifestDb.drmInfo.keySystem,
        licenseUri: manifestDb.drmInfo.licenseServerUri,
        serverCertificate: manifestDb.drmInfo.serverCertificate,
        audioCapabilities: shaka.offline.Storage.getCapabilities_(
            manifestDb,
            /* isVideo */ false),
        videoCapabilities: shaka.offline.Storage.getCapabilities_(
            manifestDb,
            /* isVideo */ true),
      };
    });
    // Try to delete the sessions; any sessions that weren't deleted get stored
    // in the database so we can try to remove them again later.  This allows us
    // to still delete the stored content but not "forget" about these sessions.
    // Later, we can remove the sessions to free up space.
    const deleter = new shaka.offline.SessionDeleter();
    const deletedSessionIds = await deleter.delete(drmConfig, net, sessions);
    await sessionIdCell.remove(deletedSessionIds);
    await sessionIdCell.add(sessions.filter(
        (session) => !deletedSessionIds.includes(session.sessionId)));
  }

  /**
   * Get the set of all streams in |manifest|.
   *
   * @param {shaka.extern.Manifest} manifest
   * @return {!Set.<shaka.extern.Stream>}
   * @private
   */
  static getStreamSet_(manifest) {
    /** @type {!Set.<shaka.extern.Stream>} */
    const set = new Set();

    for (const period of manifest.periods) {
      for (const text of period.textStreams) {
        set.add(text);
      }

      for (const variant of period.variants) {
        if (variant.audio) {
          set.add(variant.audio);
        }
        if (variant.video) {
          set.add(variant.video);
        }
      }
    }

    return set;
  }

  /**
   * Make sure that the given configuration object follows the correct structure
   * expected by |configure|. This function should be removed in v2.6 when
   * backward-compatibility is no longer needed.
   *
   * @param {!Object} config
   *    The config fields that the app wants to update. This object will be
   *    change by this function.
   * @private
   */
  static verifyConfig_(config) {
    // To avoid printing a deprecated warning multiple times, track all
    // infractions and then print it once at the end.
    let usedLegacyConfig = false;

    // For each field in the legacy config structure
    // (shaka.extern.OfflineConfiguration), move any occurrences to the correct
    // location in the player configuration.
    if (config.trackSelectionCallback != null) {
      usedLegacyConfig = true;
      config.offline = config.offline || {};
      config.offline.trackSelectionCallback = config.trackSelectionCallback;
      delete config.trackSelectionCallback;
    }

    if (config.progressCallback != null) {
      usedLegacyConfig = true;
      config.offline = config.offline || {};
      config.offline.progressCallback = config.progressCallback;
      delete config.progressCallback;
    }

    if (config.usePersistentLicense != null) {
      usedLegacyConfig = true;
      config.offline = config.offline || {};
      config.offline.usePersistentLicense = config.usePersistentLicense;
      delete config.usePersistentLicense;
    }

    if (usedLegacyConfig) {
      shaka.Deprecate.deprecateFeature(
          2, 6,
          'Storage.configure with OfflineConfig',
          'Please configure storage with a player configuration.');
    }
  }

  /**
   * Go over a manifest and issue warnings for any suspicious properties.
   *
   * @param {shaka.extern.Manifest} manifest
   * @private
   */
  static validateManifest_(manifest) {
    // Make sure that the period has not been reduced to nothing.
    if (manifest.periods.length == 0) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.NO_PERIODS);
    }

    for (const period of manifest.periods) {
      shaka.offline.Storage.validatePeriod_(period);
    }
  }

  /**
   * Go over a period and issue warnings for any suspicious properties.
   *
   * @param {shaka.extern.Period} period
   * @private
   */
  static validatePeriod_(period) {
    const videos = new Set(period.variants.map((v) => v.video));
    const audios = new Set(period.variants.map((v) => v.audio));
    const texts = period.textStreams;

    if (videos.size > 1) {
      shaka.log.warning('Multiple video tracks selected to be stored');
    }

    for (const audio1 of audios) {
      for (const audio2 of audios) {
        if (audio1 != audio2 && audio1.language == audio2.language) {
          shaka.log.warning(
              'Similar audio tracks were selected to be stored',
              audio1.id,
              audio2.id);
        }
      }
    }

    for (const text1 of texts) {
      for (const text2 of texts) {
        if (text1 != text2 && text1.language == text2.language) {
          shaka.log.warning(
              'Similar text tracks were selected to be stored',
              text1.id,
              text2.id);
        }
      }
    }
  }
};

shaka.Player.registerSupportPlugin('offline', shaka.offline.Storage.support);
