/*! @license
 * Shaka Player
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
goog.require('shaka.util.AbortableOperation');
goog.require('shaka.util.ArrayUtils');
goog.require('shaka.util.ConfigUtils');
goog.require('shaka.util.Destroyer');
goog.require('shaka.util.Error');
goog.require('shaka.util.Functional');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.Iterables');
goog.require('shaka.util.MimeUtils');
goog.require('shaka.util.Networking');
goog.require('shaka.util.Platform');
goog.require('shaka.util.PlayerConfiguration');
goog.require('shaka.util.StreamUtils');
goog.requireType('shaka.media.InitSegmentReference');
goog.requireType('shaka.media.SegmentReference');
goog.requireType('shaka.offline.StorageCellHandle');


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
     * A list of open download managers that are being used to download things.
     *
     * @private {!Array.<!shaka.offline.DownloadManager>}
     */
    this.openDownloadManagers_ = [];

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
      // Cancel all in-progress store operations.
      await Promise.all(this.openDownloadManagers_.map((dl) => dl.abortAll()));

      // Wait for all remaining open operations to end. Wrap each operations so
      // that a single rejected promise won't cause |Promise.all| to return
      // early or to return a rejected Promise.
      const noop = () => {};
      const awaits = [];
      for (const op of this.openOperations_) {
        awaits.push(op.then(noop, noop));
      }
      await Promise.all(awaits);

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

    // Deprecate 'manifest.dash.defaultPresentationDelay' configuration.
    if (config['manifest'] && config['manifest']['dash'] &&
          'defaultPresentationDelay' in config['manifest']['dash']) {
      shaka.Deprecate.deprecateFeature(4,
          'manifest.dash.defaultPresentationDelay configuration',
          'Please Use manifest.defaultPresentationDelay instead.');
      config['manifest']['defaultPresentationDelay'] =
          config['manifest']['dash']['defaultPresentationDelay'];
      delete config['manifest']['dash']['defaultPresentationDelay'];
    }

    goog.asserts.assert(
        this.config_, 'Cannot reconfigure stroage after calling destroy.');
    return shaka.util.PlayerConfiguration.mergeConfigObjects(
        /* destination= */ this.config_, /* updates= */ config );
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
   * Multiple assets can be downloaded at the same time, but note that since
   * the storage instance has a single networking engine, multiple storage
   * objects will be necessary if some assets require unique network filters.
   * This snapshots the storage config at the time of the call, so it will not
   * honor any changes to config mid-store operation.
   *
   * @param {string} uri The URI of the manifest to store.
   * @param {!Object=} appMetadata An arbitrary object from the application
   *   that will be stored along-side the offline content.  Use this for any
   *   application-specific metadata you need associated with the stored
   *   content.  For details on the data types that can be stored here, please
   *   refer to {@link https://bit.ly/StructClone}
   * @param {string=} mimeType
   *   The mime type for the content |manifestUri| points to.
   * @return {!shaka.extern.IAbortableOperation.<shaka.extern.StoredContent>}
   *   An AbortableOperation that resolves with a structure representing what
   *   was stored.  The "offlineUri" member is the URI that should be given to
   *   Player.load() to play this piece of content offline.  The "appMetadata"
   *   member is the appMetadata argument you passed to store().
   *   If you want to cancel this download, call the "abort" method on
   *   AbortableOperation.
   * @export
   */
  store(uri, appMetadata, mimeType) {
    goog.asserts.assert(
        this.networkingEngine_,
        'Cannot call |downloadManifest_| after calling |destroy|.');

    // Get a copy of the current config.
    const config = this.getConfiguration();

    const getParser = async () => {
      goog.asserts.assert(
          this.networkingEngine_, 'Should not call |store| after |destroy|');

      const factory = await shaka.media.ManifestParser.getFactory(
          uri,
          this.networkingEngine_,
          config.manifest.retryParameters,
          mimeType || null);

      return shaka.util.Functional.callFactory(factory);
    };

    /** @type {!shaka.offline.DownloadManager} */
    const downloader =
        new shaka.offline.DownloadManager(this.networkingEngine_);
    this.openDownloadManagers_.push(downloader);

    const storeOp = this.store_(
        uri, appMetadata || {}, getParser, config, downloader);
    const abortableStoreOp = new shaka.util.AbortableOperation(storeOp, () => {
      return downloader.abortAll();
    });
    abortableStoreOp.finally(() => {
      shaka.util.ArrayUtils.remove(this.openDownloadManagers_, downloader);
    });

    // Provide a temporary shim for "then" for backward compatibility.
    /** @type {!Object} */ (abortableStoreOp)['then'] = (onSuccess) => {
      shaka.Deprecate.deprecateFeature(4,
          'shaka.offline.Storage.store.then',
          'Storage operations now return a shaka.util.AbortableOperation, ' +
          'rather than a promise.  Please update to conform to this new API; ' +
          'you can use the |chain| method instead.');
      return abortableStoreOp.promise.then(onSuccess);
    };

    return this.startAbortableOperation_(abortableStoreOp);
  }

  /**
   * Returns true if an asset is currently downloading.
   *
   * @return {boolean}
   * @deprecated
   * @export
   */
  getStoreInProgress() {
    shaka.Deprecate.deprecateFeature(4,
        'shaka.offline.Storage.getStoreInProgress',
        'Multiple concurrent downloads are now supported.');
    return false;
  }

  /**
   * See |shaka.offline.Storage.store| for details.
   *
   * @param {string} uri
   * @param {!Object} appMetadata
   * @param {function():!Promise.<shaka.extern.ManifestParser>} getParser
   * @param {shaka.extern.PlayerConfiguration} config
   * @param {!shaka.offline.DownloadManager} downloader
   * @return {!Promise.<shaka.extern.StoredContent>}
   * @private
   */
  async store_(uri, appMetadata, getParser, config, downloader) {
    this.requireSupport_();

    // Since we will need to use |parser|, |drmEngine|, |activeHandle|, and
    // |muxer| in the catch/finally blocks, we need to define them out here.
    // Since they may not get initialized when we enter the catch/finally block,
    // we need to assume that they may be null/undefined when we get there.

    /** @type {?shaka.extern.ManifestParser} */
    let parser = null;
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
      parser = await getParser();

      const manifest = await this.parseManifest(uri, parser, config);

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

      drmEngine = await this.createDrmEngine(
          manifest,
          (e) => { drmError = drmError || e; },
          config);

      // We could have been asked to destroy ourselves while we were "away"
      // creating the drm engine.
      this.ensureNotDestroyed_();
      if (drmError) {
        throw drmError;
      }

      await this.filterManifest_(manifest, drmEngine, config);

      await muxer.init();
      this.ensureNotDestroyed_();

      // Get the cell that we are saving the manifest to. Once we get a cell
      // we will only reference the cell and not the muxer so that the manifest
      // and segments will all be saved to the same cell.
      activeHandle = await muxer.getActive();
      this.ensureNotDestroyed_();

      goog.asserts.assert(drmEngine, 'drmEngine should be non-null here.');

      const manifestDB = await this.downloadManifest_(
          activeHandle.cell, drmEngine, manifest, uri, appMetadata, config,
          downloader);
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
      this.segmentsFromStore_ = [];

      await muxer.destroy();

      if (parser) {
        await parser.stop();
      }

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
   * @param {shaka.extern.PlayerConfiguration} config
   * @return {!Promise}
   * @private
   */
  async filterManifest_(manifest, drmEngine, config) {
    const StreamUtils = shaka.util.StreamUtils;

    // Filter the manifest based on the restrictions given in the player
    // configuration.
    const maxHwRes = {width: Infinity, height: Infinity};
    StreamUtils.filterByRestrictions(manifest, config.restrictions, maxHwRes);

    // Filter the manifest based on what we know MediaCapabilities will be able
    // to play later (no point storing something we can't play).
    StreamUtils.filterManifestByMediaCapabilities(
        manifest, config.offline.usePersistentLicense);

    // Gather all tracks.
    const allTracks = [];

    // Choose the codec that has the lowest average bandwidth.
    const preferredAudioChannelCount = config.preferredAudioChannelCount;
    const preferredDecodingAttributes = config.preferredDecodingAttributes;
    const preferredVideoCodecs = config.preferredVideoCodecs;
    const preferredAudioCodecs = config.preferredAudioCodecs;

    StreamUtils.chooseCodecsAndFilterManifest(
        manifest, preferredVideoCodecs, preferredAudioCodecs,
        preferredAudioChannelCount, preferredDecodingAttributes);

    for (const variant of manifest.variants) {
      goog.asserts.assert(
          StreamUtils.isPlayable(variant),
          'We should have already filtered by "is playable"');

      allTracks.push(StreamUtils.variantToTrack(variant));
    }

    for (const text of manifest.textStreams) {
      allTracks.push(StreamUtils.textStreamToTrack(text));
    }

    for (const image of manifest.imageStreams) {
      allTracks.push(StreamUtils.imageStreamToTrack(image));
    }

    // Let the application choose which tracks to store.
    const chosenTracks =
        await config.offline.trackSelectionCallback(allTracks);
    const duration = manifest.presentationTimeline.getDuration();
    let sizeEstimate = 0;
    for (const track of chosenTracks) {
      const trackSize = track.bandwidth * duration / 8;
      sizeEstimate += trackSize;
    }
    try {
      const allowedDownload =
          await config.offline.downloadSizeCallback(sizeEstimate);
      if (!allowedDownload) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.STORAGE,
            shaka.util.Error.Code.STORAGE_LIMIT_REACHED);
      }
    } catch (e) {
      // It is necessary to be able to catch the STORAGE_LIMIT_REACHED error
      if (e instanceof shaka.util.Error) {
        throw e;
      }
      shaka.log.warning(
          'downloadSizeCallback has produced an unexpected error', e);
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.STORAGE,
          shaka.util.Error.Code.DOWNLOAD_SIZE_CALLBACK_ERROR);
    }

    /** @type {!Set.<number>} */
    const variantIds = new Set();
    /** @type {!Set.<number>} */
    const textIds = new Set();
    /** @type {!Set.<number>} */
    const imageIds = new Set();

    // Collect the IDs of the chosen tracks.
    for (const track of chosenTracks) {
      if (track.type == 'variant') {
        variantIds.add(track.id);
      }
      if (track.type == 'text') {
        textIds.add(track.id);
      }
      if (track.type == 'image') {
        imageIds.add(track.id);
      }
    }

    // Filter the manifest to keep only what the app chose.
    manifest.variants =
        manifest.variants.filter((variant) => variantIds.has(variant.id));
    manifest.textStreams =
        manifest.textStreams.filter((stream) => textIds.has(stream.id));
    manifest.imageStreams =
        manifest.imageStreams.filter((stream) => imageIds.has(stream.id));

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
   * @param {shaka.extern.PlayerConfiguration} config
   * @param {!shaka.offline.DownloadManager} downloader
   * @return {!Promise.<shaka.extern.ManifestDB>}
   * @private
   */
  async downloadManifest_(
      storage, drmEngine, manifest, uri, metadata, config, downloader) {
    const pendingContent = shaka.offline.StoredContentUtils.fromManifest(
        uri, manifest, /* size= */ 0, metadata);
    // In https://github.com/google/shaka-player/issues/2652, we found that this
    // callback would be removed by the compiler if we reference the config in
    // the onProgress closure below.  Reading it into a local variable first
    // seems to work around this apparent compiler bug.
    const progressCallback = config.offline.progressCallback;

    const onProgress = (progress, size) => {
      // Update the size of the stored content before issuing a progress
      // update.
      pendingContent.size = size;
      progressCallback(pendingContent, progress);
    };
    const onInitData = (initData, systemId) => {
      if (needsInitData && config.offline.usePersistentLicense &&
          currentSystemId == systemId) {
        drmEngine.newInitData('cenc', initData);
      }
    };
    downloader.setCallbacks(onProgress, onInitData);

    const isEncrypted = manifest.variants.some((variant) => {
      const videoEncrypted = variant.video && variant.video.encrypted;
      const audioEncrypted = variant.audio && variant.audio.encrypted;
      return videoEncrypted || audioEncrypted;
    });
    const includesInitData = manifest.variants.some((variant) => {
      const videoDrmInfos = variant.video ? variant.video.drmInfos : [];
      const audioDrmInfos = variant.audio ? variant.audio.drmInfos : [];
      const drmInfos = videoDrmInfos.concat(audioDrmInfos);
      return drmInfos.some((drmInfos) => {
        return drmInfos.initData && drmInfos.initData.length;
      });
    });
    const needsInitData = isEncrypted && !includesInitData;

    let currentSystemId = null;
    if (needsInitData) {
      const drmInfo = drmEngine.getDrmInfo();
      currentSystemId =
          shaka.offline.Storage.defaultSystemIds_.get(drmInfo.keySystem);
    }

    try {
      const manifestDB = this.createOfflineManifest_(
          downloader, storage, drmEngine, manifest, uri, metadata, config);

      manifestDB.size = await downloader.waitToFinish();
      manifestDB.expiration = drmEngine.getExpiration();
      const sessions = drmEngine.getSessionIds();
      manifestDB.sessionIds = config.offline.usePersistentLicense ?
          sessions : [];

      if (isEncrypted && config.offline.usePersistentLicense &&
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
    for (const stream of manifestDb.streams) {
      if (isVideo && stream.type == 'video') {
        ret.push({
          contentType: MimeUtils.getFullType(stream.mimeType, stream.codecs),
          robustness: manifestDb.drmInfo.videoRobustness,
        });
      } else if (!isVideo && stream.type == 'audio') {
        ret.push({
          contentType: MimeUtils.getFullType(stream.mimeType, stream.codecs),
          robustness: manifestDb.drmInfo.audioRobustness,
        });
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
   * @param {shaka.extern.ManifestParser} parser
   * @param {shaka.extern.PlayerConfiguration} config
   * @return {!Promise.<shaka.extern.Manifest>}
   */
  async parseManifest(uri, parser, config) {
    let error = null;

    const networkingEngine = this.networkingEngine_;
    goog.asserts.assert(networkingEngine, 'Should be initialized!');

    /** @type {shaka.extern.ManifestParser.PlayerInterface} */
    const playerInterface = {
      networkingEngine: networkingEngine,

      // Don't bother filtering now. We will do that later when we have all the
      // information we need to filter.
      filter: () => Promise.resolve(),

      // The responsibility for making mock text streams for closed captions is
      // handled inside shaka.offline.OfflineManifestParser, before playback.
      makeTextStreamsForClosedCaptions: (manifest) => {},

      onTimelineRegionAdded: () => {},
      onEvent: () => {},

      // Used to capture an error from the manifest parser. We will check the
      // error before returning.
      onError: (e) => {
        error = e;
      },
      isLowLatencyMode: () => false,
      isAutoLowLatencyMode: () => false,
      enableLowLatencyMode: () => {},
    };

    parser.configure(config.manifest);

    // We may have been destroyed while we were waiting on |getParser| to
    // resolve.
    this.ensureNotDestroyed_();

    const manifest = await parser.start(uri, playerInterface);

    // We may have been destroyed while we were waiting on |start| to
    // resolve.
    this.ensureNotDestroyed_();

    // Get all the streams that are used in the manifest.
    const streams =
        shaka.offline.Storage.getAllStreamsFromManifest_(manifest);

    // Wait for each stream to create their segment indexes.
    await Promise.all(shaka.util.Iterables.map(streams, (stream) => {
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
  }

  /**
   * This method is public so that it can be override in testing.
   *
   * @param {shaka.extern.Manifest} manifest
   * @param {function(shaka.util.Error)} onError
   * @param {shaka.extern.PlayerConfiguration} config
   * @return {!Promise.<!shaka.media.DrmEngine>}
   */
  async createDrmEngine(manifest, onError, config) {
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

    drmEngine.configure(config.drm);
    await drmEngine.initForStorage(
        manifest.variants, config.offline.usePersistentLicense);
    await drmEngine.setServerCertificate();
    await drmEngine.createOrLoad();

    return drmEngine;
  }

  /**
   * Creates an offline 'manifest' for the real manifest.  This does not store
   * the segments yet, only adds them to the download manager through
   * createStreams_.
   *
   * @param {!shaka.offline.DownloadManager} downloader
   * @param {shaka.extern.StorageCell} storage
   * @param {!shaka.media.DrmEngine} drmEngine
   * @param {shaka.extern.Manifest} manifest
   * @param {string} originalManifestUri
   * @param {!Object} metadata
   * @param {shaka.extern.PlayerConfiguration} config
   * @return {shaka.extern.ManifestDB}
   * @private
   */
  createOfflineManifest_(
      downloader, storage, drmEngine, manifest, originalManifestUri, metadata,
      config) {
    const estimator = new shaka.offline.StreamBandwidthEstimator();

    const streams = this.createStreams_(
        downloader, storage, estimator, drmEngine, manifest, config);

    const usePersistentLicense = config.offline.usePersistentLicense;
    const drmInfo = drmEngine.getDrmInfo();

    if (drmInfo && usePersistentLicense) {
      // Don't store init data, since we have stored sessions.
      drmInfo.initData = [];
    }

    return {
      creationTime: Date.now(),
      originalManifestUri: originalManifestUri,
      duration: manifest.presentationTimeline.getDuration(),
      size: 0,
      expiration: drmEngine.getExpiration(),
      streams: streams,
      sessionIds: usePersistentLicense ? drmEngine.getSessionIds() : [],
      drmInfo: drmInfo,
      appMetadata: metadata,
    };
  }

  /**
   * Converts manifest Streams to database Streams.  This will use the current
   * configuration to get the tracks to use, then it will search each segment
   * index and add all the segments to the download manager through
   * createStream_.
   *
   * @param {!shaka.offline.DownloadManager} downloader
   * @param {shaka.extern.StorageCell} storage
   * @param {shaka.offline.StreamBandwidthEstimator} estimator
   * @param {!shaka.media.DrmEngine} drmEngine
   * @param {shaka.extern.Manifest} manifest
   * @param {shaka.extern.PlayerConfiguration} config
   * @return {!Array.<shaka.extern.StreamDB>}
   * @private
   */
  createStreams_(downloader, storage, estimator, drmEngine, manifest, config) {
    // Pass all variants and text streams to the estimator so that we can
    // get the best estimate for each stream later.
    for (const variant of manifest.variants) {
      estimator.addVariant(variant);
    }
    for (const text of manifest.textStreams) {
      estimator.addText(text);
    }
    for (const image of manifest.imageStreams) {
      estimator.addImage(image);
    }

    // TODO(joeyparrish): Break out stack-based state and method params into a
    // separate class to clean up.  See:
    // https://github.com/google/shaka-player/issues/2781#issuecomment-678438039

    /**
     * A cache mapping init segment references to Promises to their DB key.
     *
     * @type {!Map.<shaka.media.InitSegmentReference, !Promise.<?number>>}
     */
    const initSegmentDbKeyCache = new Map();

    // A null init segment reference always maps to a null DB key.
    initSegmentDbKeyCache.set(
        null, /** @type {!Promise.<?number>} */(Promise.resolve(null)));

    /**
     * A cache mapping equivalent segment references to Promises to their DB
     * key.  The key in this map is a string of the form
     * "<URI>-<startByte>-<endByte>".
     *
     * @type {!Map.<string, !Promise.<number>>}
     */
    const segmentDbKeyCache = new Map();

    // Find the streams we want to download and create a stream db instance
    // for each of them.
    const streamSet =
        shaka.offline.Storage.getAllStreamsFromManifest_(manifest);
    const streamDBs = new Map();

    for (const stream of streamSet) {
      const streamDB = this.createStream_(
          downloader, storage, estimator, manifest, stream, config,
          initSegmentDbKeyCache, segmentDbKeyCache);
      streamDBs.set(stream.id, streamDB);
    }

    // Connect streams and variants together.
    for (const variant of manifest.variants) {
      if (variant.audio) {
        streamDBs.get(variant.audio.id).variantIds.push(variant.id);
      }
      if (variant.video) {
        streamDBs.get(variant.video.id).variantIds.push(variant.id);
      }
    }

    return Array.from(streamDBs.values());
  }

  /**
   * Converts a manifest stream to a database stream.  This will search the
   * segment index and add all the segments to the download manager.
   *
   * @param {!shaka.offline.DownloadManager} downloader
   * @param {shaka.extern.StorageCell} storage
   * @param {shaka.offline.StreamBandwidthEstimator} estimator
   * @param {shaka.extern.Manifest} manifest
   * @param {shaka.extern.Stream} stream
   * @param {shaka.extern.PlayerConfiguration} config
   * @param {!Map.<shaka.media.InitSegmentReference, !Promise.<?number>>}
   *   initSegmentDbKeyCache
   * @param {!Map.<string, !Promise.<number>>} segmentDbKeyCache
   * @return {shaka.extern.StreamDB}
   * @private
   */
  createStream_(downloader, storage, estimator, manifest, stream, config,
      initSegmentDbKeyCache, segmentDbKeyCache) {
    /** @type {shaka.extern.StreamDB} */
    const streamDb = {
      id: stream.id,
      originalId: stream.originalId,
      primary: stream.primary,
      type: stream.type,
      mimeType: stream.mimeType,
      codecs: stream.codecs,
      frameRate: stream.frameRate,
      pixelAspectRatio: stream.pixelAspectRatio,
      hdr: stream.hdr,
      kind: stream.kind,
      language: stream.language,
      label: stream.label,
      width: stream.width || null,
      height: stream.height || null,
      encrypted: stream.encrypted,
      keyIds: stream.keyIds,
      segments: [],
      variantIds: [],
      roles: stream.roles,
      forced: stream.forced,
      channelsCount: stream.channelsCount,
      audioSamplingRate: stream.audioSamplingRate,
      spatialAudio: stream.spatialAudio,
      closedCaptions: stream.closedCaptions,
      tilesLayout: stream.tilesLayout,
    };

    // Download each stream in parallel.
    const downloadGroup = stream.id;

    const startTime =
        manifest.presentationTimeline.getSegmentAvailabilityStart();

    shaka.offline.Storage.forEachSegment_(stream, startTime, (segment) => {
      const initSegmentKeyPromise = this.getInitSegmentDbKey_(
          downloader, downloadGroup, stream.id, storage, estimator,
          segment.initSegmentReference, config, initSegmentDbKeyCache);

      const segmentKeyPromise = this.getSegmentDbKey_(
          downloader, downloadGroup, stream.id, storage, estimator, segment,
          config, segmentDbKeyCache);

      downloader.queueWork(downloadGroup, async () => {
        const initSegmentKey = await initSegmentKeyPromise;
        const dataKey = await segmentKeyPromise;

        streamDb.segments.push({
          initSegmentKey,
          startTime: segment.startTime,
          endTime: segment.endTime,
          appendWindowStart: segment.appendWindowStart,
          appendWindowEnd: segment.appendWindowEnd,
          timestampOffset: segment.timestampOffset,
          tilesLayout: segment.tilesLayout,
          dataKey,
        });
      });
    });

    return streamDb;
  }

  /**
   * Get a Promise to the DB key for a given init segment reference.
   *
   * The return values will be cached so that multiple calls with the same init
   * segment reference will only trigger one request.
   *
   * @param {!shaka.offline.DownloadManager} downloader
   * @param {number} downloadGroup
   * @param {number} streamId
   * @param {shaka.extern.StorageCell} storage
   * @param {shaka.offline.StreamBandwidthEstimator} estimator
   * @param {shaka.media.InitSegmentReference} initSegmentReference
   * @param {shaka.extern.PlayerConfiguration} config
   * @param {!Map.<shaka.media.InitSegmentReference, !Promise.<?number>>}
   *   initSegmentDbKeyCache
   * @return {!Promise.<?number>}
   * @private
   */
  getInitSegmentDbKey_(
      downloader, downloadGroup, streamId, storage, estimator,
      initSegmentReference, config, initSegmentDbKeyCache) {
    if (initSegmentDbKeyCache.has(initSegmentReference)) {
      return initSegmentDbKeyCache.get(initSegmentReference);
    }

    const request = shaka.util.Networking.createSegmentRequest(
        initSegmentReference.getUris(),
        initSegmentReference.startByte,
        initSegmentReference.endByte,
        config.streaming.retryParameters);

    const promise = downloader.queue(
        downloadGroup,
        request,
        estimator.getInitSegmentEstimate(streamId),
        /* isInitSegment= */ true,
        async (data) => {
          /** @type {!Array.<number>} */
          const ids = await storage.addSegments([{data: data}]);
          this.segmentsFromStore_.push(ids[0]);
          return ids[0];
        });

    initSegmentDbKeyCache.set(initSegmentReference, promise);
    return promise;
  }

  /**
   * Get a Promise to the DB key for a given segment reference.
   *
   * The return values will be cached so that multiple calls with the same
   * segment reference will only trigger one request.
   *
   * @param {!shaka.offline.DownloadManager} downloader
   * @param {number} downloadGroup
   * @param {number} streamId
   * @param {shaka.extern.StorageCell} storage
   * @param {shaka.offline.StreamBandwidthEstimator} estimator
   * @param {shaka.media.SegmentReference} segmentReference
   * @param {shaka.extern.PlayerConfiguration} config
   * @param {!Map.<string, !Promise.<number>>} segmentDbKeyCache
   * @return {!Promise.<number>}
   * @private
   */
  getSegmentDbKey_(
      downloader, downloadGroup, streamId, storage, estimator,
      segmentReference, config, segmentDbKeyCache) {
    const mapKey = [
      segmentReference.getUris()[0],
      segmentReference.startByte,
      segmentReference.endByte,
    ].join('-');

    if (segmentDbKeyCache.has(mapKey)) {
      return segmentDbKeyCache.get(mapKey);
    }

    const request = shaka.util.Networking.createSegmentRequest(
        segmentReference.getUris(),
        segmentReference.startByte,
        segmentReference.endByte,
        config.streaming.retryParameters);

    const promise = downloader.queue(
        downloadGroup,
        request,
        estimator.getSegmentEstimate(streamId, segmentReference),
        /* isInitSegment= */ false,
        async (data) => {
          /** @type {!Array.<number>} */
          const ids = await storage.addSegments([{data: data}]);
          this.segmentsFromStore_.push(ids[0]);
          return ids[0];
        });

    segmentDbKeyCache.set(mapKey, promise);
    return promise;
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

    if (i == null) {
      return;
    }

    /** @type {?shaka.media.SegmentReference} */
    let ref = stream.segmentIndex.get(i);
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
   * The equivalent of startOperation_, but for abortable operations.
   *
   * @param {!shaka.extern.IAbortableOperation<T>} action
   * @return {!shaka.extern.IAbortableOperation<T>}
   * @template T
   * @private
   */
  startAbortableOperation_(action) {
    const promise = action.promise;
    this.openOperations_.push(promise);

    // Remove the open operation once the action has completed. So that we
    // can still return the AbortableOperation, this is done using a |finally|
    // block, rather than awaiting the result.
    return action.finally(() => {
      shaka.util.ArrayUtils.remove(this.openOperations_, promise);
    });
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
    for (const stream of manifest.streams) {
      for (const segment of stream.segments) {
        if (segment.initSegmentKey != null) {
          ids.push(segment.initSegmentKey);
        }

        ids.push(segment.dataKey);
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
            /* isVideo= */ false),
        videoCapabilities: shaka.offline.Storage.getCapabilities_(
            manifestDb,
            /* isVideo= */ true),
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
  static getAllStreamsFromManifest_(manifest) {
    /** @type {!Set.<shaka.extern.Stream>} */
    const set = new Set();

    for (const text of manifest.textStreams) {
      set.add(text);
    }

    for (const image of manifest.imageStreams) {
      set.add(image);
    }

    for (const variant of manifest.variants) {
      if (variant.audio) {
        set.add(variant.audio);
      }
      if (variant.video) {
        set.add(variant.video);
      }
    }

    return set;
  }

  /**
   * Go over a manifest and issue warnings for any suspicious properties.
   *
   * @param {shaka.extern.Manifest} manifest
   * @private
   */
  static validateManifest_(manifest) {
    const videos = new Set(manifest.variants.map((v) => v.video));
    const audios = new Set(manifest.variants.map((v) => v.audio));
    const texts = manifest.textStreams;

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

shaka.offline.Storage.defaultSystemIds_ = new Map()
    .set('org.w3.clearkey', '1077efecc0b24d02ace33c1e52e2fb4b')
    .set('com.widevine.alpha', 'edef8ba979d64acea3c827dcd51d21ed')
    .set('com.microsoft.playready', '9a04f07998404286ab92e65be0885f95')
    .set('com.microsoft.playready.recommendation',
        '9a04f07998404286ab92e65be0885f95')
    .set('com.microsoft.playready.software',
        '9a04f07998404286ab92e65be0885f95')
    .set('com.microsoft.playready.hardware',
        '9a04f07998404286ab92e65be0885f95')
    .set('com.adobe.primetime', 'f239e769efa348509c16a903c6932efb');

shaka.Player.registerSupportPlugin('offline', shaka.offline.Storage.support);
