/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.offline.Storage');

goog.require('goog.asserts');
goog.require('shaka.Player');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.drm.DrmEngine');
goog.require('shaka.log');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.media.SegmentUtils');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.net.NetworkingUtils');
goog.require('shaka.offline.DownloadInfo');
goog.require('shaka.offline.DownloadManager');
goog.require('shaka.offline.OfflineUri');
goog.require('shaka.offline.SessionDeleter');
goog.require('shaka.offline.StorageMuxer');
goog.require('shaka.offline.StoredContentUtils');
goog.require('shaka.offline.StreamBandwidthEstimator');
goog.require('shaka.text.TextEngine');
goog.require('shaka.util.AbortableOperation');
goog.require('shaka.util.ArrayUtils');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.ConfigUtils');
goog.require('shaka.util.Destroyer');
goog.require('shaka.util.Error');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.Iterables');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MimeUtils');
goog.require('shaka.util.PlayerConfiguration');
goog.require('shaka.util.StreamUtils');
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
      this.networkingEngine_.configure(this.config_.networking);
    }

    /**
     * A list of open operations that are being performed by this instance of
     * |shaka.offline.Storage|.
     *
     * @private {!Array<!Promise>}
     */
    this.openOperations_ = [];

    /**
     * A list of open download managers that are being used to download things.
     *
     * @private {!Array<!shaka.offline.DownloadManager>}
     */
    this.openDownloadManagers_ = [];

    /**
     * Storage should only destroy the networking engine if it was initialized
     * without a player instance. Store this as a flag here to avoid including
     * the player object in the destroyer's closure.
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

    /**
     * Contains an ID for use with creating streams.  The manifest parser should
     * start with small IDs, so this starts with a large one.
     * @private {number}
     */
    this.nextExternalStreamId_ = 1e9;
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
    const device = shaka.device.DeviceFactory.getDevice();
    if (!device.supportsMediaSource()) {
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

    goog.asserts.assert(
        this.config_, 'Cannot reconfigure storage after calling destroy.');
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
   * @param {?string=} mimeType
   *   The mime type for the content |manifestUri| points to.
   * @param {?Array<string>=} externalThumbnails
   *   The external thumbnails to store along the main content.
   * @param {?Array<shaka.extern.ExtraText>=} externalText
   *   The external text to store along the main content.
   * @return {!shaka.extern.IAbortableOperation.<shaka.extern.StoredContent>}
   *   An AbortableOperation that resolves with a structure representing what
   *   was stored.  The "offlineUri" member is the URI that should be given to
   *   Player.load() to play this piece of content offline.  The "appMetadata"
   *   member is the appMetadata argument you passed to store().
   *   If you want to cancel this download, call the "abort" method on
   *   AbortableOperation.
   * @export
   */
  store(uri, appMetadata, mimeType, externalThumbnails, externalText) {
    goog.asserts.assert(
        this.networkingEngine_,
        'Cannot call |store| after calling |destroy|.');

    // Get a copy of the current config.
    const config = this.getConfiguration();

    const getParser = async () => {
      goog.asserts.assert(
          this.networkingEngine_, 'Should not call |store| after |destroy|');

      if (!mimeType) {
        mimeType = await shaka.net.NetworkingUtils.getMimeType(
            uri, this.networkingEngine_, config.manifest.retryParameters);
      }

      const factory = shaka.media.ManifestParser.getFactory(
          uri,
          mimeType || null);

      return factory();
    };

    /** @type {!shaka.offline.DownloadManager} */
    const downloader =
        new shaka.offline.DownloadManager(this.networkingEngine_);
    this.openDownloadManagers_.push(downloader);

    const storeOp = this.store_(
        uri, appMetadata || {}, externalThumbnails || [], externalText || [],
        getParser, config, downloader);
    const abortableStoreOp = new shaka.util.AbortableOperation(storeOp, () => {
      return downloader.abortAll();
    });
    abortableStoreOp.finally(() => {
      shaka.util.ArrayUtils.remove(this.openDownloadManagers_, downloader);
    });

    return this.startAbortableOperation_(abortableStoreOp);
  }

  /**
   * See |shaka.offline.Storage.store| for details.
   *
   * @param {string} uri
   * @param {!Object} appMetadata
   * @param {!Array<string>} externalThumbnails
   * @param {!Array<shaka.extern.ExtraText>} externalText
   * @param {function(): !Promise<shaka.extern.ManifestParser>} getParser
   * @param {shaka.extern.PlayerConfiguration} config
   * @param {!shaka.offline.DownloadManager} downloader
   * @return {!Promise<shaka.extern.StoredContent>}
   * @private
   */
  async store_(uri, appMetadata, externalThumbnails, externalText,
      getParser, config, downloader) {
    this.requireSupport_();

    // Since we will need to use |parser|, |drmEngine|, |activeHandle|, and
    // |muxer| in the catch/finally blocks, we need to define them out here.
    // Since they may not get initialized when we enter the catch/finally block,
    // we need to assume that they may be null/undefined when we get there.

    /** @type {?shaka.extern.ManifestParser} */
    let parser = null;
    /** @type {?shaka.drm.DrmEngine} */
    let drmEngine = null;
    /** @type {shaka.offline.StorageMuxer} */
    const muxer = new shaka.offline.StorageMuxer();
    /** @type {?shaka.offline.StorageCellHandle} */
    let activeHandle = null;
    /** @type {?number} */
    let manifestId = null;

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

      for (const thumbnailUri of externalThumbnails) {
        const imageStream =
            // eslint-disable-next-line no-await-in-loop
            await this.createExternalImageStream_(thumbnailUri, manifest);
        manifest.imageStreams.push(imageStream);
        this.ensureNotDestroyed_();
      }

      for (const text of externalText) {
        const textStream =
            // eslint-disable-next-line no-await-in-loop
            await this.createExternalTextStream_(manifest,
                text.uri, text.language, text.kind, text.mime, text.codecs);
        manifest.textStreams.push(textStream);
        this.ensureNotDestroyed_();
      }

      shaka.drm.DrmEngine.configureClearKey(
          config.drm.clearKeys, manifest.variants);

      const clearKeyDataLicenseServerUri = manifest.variants.some((v) => {
        if (v.audio) {
          for (const drmInfo of v.audio.drmInfos) {
            if (drmInfo.licenseServerUri.startsWith('data:')) {
              return true;
            }
          }
        }
        if (v.video) {
          for (const drmInfo of v.video.drmInfos) {
            if (drmInfo.licenseServerUri.startsWith('data:')) {
              return true;
            }
          }
        }
        return false;
      });

      let usePersistentLicense = config.offline.usePersistentLicense;
      if (clearKeyDataLicenseServerUri) {
        usePersistentLicense = false;
      }

      // Create the DRM engine, and load the keys in the manifest.
      drmEngine = await this.createDrmEngine(
          manifest,
          (e) => { drmError = drmError || e; },
          config,
          usePersistentLicense);

      // We could have been asked to destroy ourselves while we were "away"
      // creating the drm engine.
      this.ensureNotDestroyed_();
      if (drmError) {
        throw drmError;
      }

      await this.filterManifest_(
          manifest, drmEngine, config, usePersistentLicense);

      await muxer.init();
      this.ensureNotDestroyed_();

      // Get the cell that we are saving the manifest to. Once we get a cell
      // we will only reference the cell and not the muxer so that the manifest
      // and segments will all be saved to the same cell.
      activeHandle = await muxer.getActive();
      this.ensureNotDestroyed_();

      goog.asserts.assert(drmEngine, 'drmEngine should be non-null here.');
      const {manifestDB, toDownload} = this.makeManifestDB_(
          drmEngine, manifest, uri, appMetadata, config, downloader,
          usePersistentLicense);

      // Store the empty manifest, before downloading the segments.
      const ids = await activeHandle.cell.addManifests([manifestDB]);
      this.ensureNotDestroyed_();
      manifestId = ids[0];

      goog.asserts.assert(drmEngine, 'drmEngine should be non-null here.');
      this.ensureNotDestroyed_();
      if (drmError) {
        throw drmError;
      }

      await this.downloadSegments_(toDownload, manifestId, manifestDB,
          downloader, config, activeHandle.cell, manifest, drmEngine,
          usePersistentLicense);
      this.ensureNotDestroyed_();

      this.setManifestDrmFields_(
          manifest, manifestDB, drmEngine, usePersistentLicense);
      await activeHandle.cell.updateManifest(manifestId, manifestDB);
      this.ensureNotDestroyed_();

      const offlineUri = shaka.offline.OfflineUri.manifest(
          activeHandle.path.mechanism, activeHandle.path.cell, manifestId);

      return shaka.offline.StoredContentUtils.fromManifestDB(
          offlineUri, manifestDB);
    } catch (e) {
      if (manifestId != null) {
        await shaka.offline.Storage.cleanStoredManifest(manifestId);
      }

      // If we already had an error, ignore this error to avoid hiding
      // the original error.
      throw drmError || e;
    } finally {
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
   * Download and then store the contents of each segment.
   * The promise this returns will wait for local downloads.
   *
   * @param {!Array<!shaka.offline.DownloadInfo>} toDownload
   * @param {number} manifestId
   * @param {shaka.extern.ManifestDB} manifestDB
   * @param {!shaka.offline.DownloadManager} downloader
   * @param {shaka.extern.PlayerConfiguration} config
   * @param {shaka.extern.StorageCell} storage
   * @param {shaka.extern.Manifest} manifest
   * @param {!shaka.drm.DrmEngine} drmEngine
   * @param {boolean} usePersistentLicense
   * @return {!Promise}
   * @private
   */
  async downloadSegments_(
      toDownload, manifestId, manifestDB, downloader, config, storage,
      manifest, drmEngine, usePersistentLicense) {
    let pendingManifestUpdates = {};
    let pendingDataSize = 0;

    const ensureNotAbortedOrDestroyed = () => {
      if (this.destroyer_.destroyed() || downloader.isAborted()) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.STORAGE,
            shaka.util.Error.Code.OPERATION_ABORTED);
      }
    };

    /**
     * @param {!Array<!shaka.offline.DownloadInfo>} toDownload
     * @param {boolean} updateDRM
     */
    const download = async (toDownload, updateDRM) => {
      for (const download of toDownload) {
        ensureNotAbortedOrDestroyed();
        const request = download.makeSegmentRequest(config);
        const estimateId = download.estimateId;
        const isInitSegment = download.isInitSegment;

        const onDownloaded = async (data) => {
          const ref = /** @type {!shaka.media.SegmentReference} */ (
            download.ref);
          const segmentData =
              ref.getSegmentData(/* allowDeleteOnSingleUse= */ false);
          if (ref.aesKey && !segmentData) {
            data = await shaka.media.SegmentUtils.aesDecrypt(
                data, ref.aesKey, download.refPosition);
          }
          const id = shaka.offline.DownloadInfo.idForSegmentRef(ref);
          // Store the data.
          const dataKeys = await storage.addSegments([{data}]);
          ensureNotAbortedOrDestroyed();

          // Store the necessary update to the manifest, to be processed later.
          pendingManifestUpdates[id] = dataKeys[0];
          pendingDataSize += data.byteLength;
        };

        const ref = /** @type {!shaka.media.SegmentReference} */ (
          download.ref);
        const segmentData =
            ref.getSegmentData(/* allowDeleteOnSingleUse= */ false);
        if (segmentData) {
          downloader.queueData(download.groupId,
              segmentData, estimateId, isInitSegment, onDownloaded);
        } else {
          downloader.queue(download.groupId,
              request, estimateId, isInitSegment, onDownloaded);
        }
      }
      await downloader.waitToFinish();
      ensureNotAbortedOrDestroyed();

      if (updateDRM && !downloader.isAborted()) {
        // Re-store the manifest, to attach session IDs.
        // These were (maybe) discovered inside the downloader; we can only add
        // them now, at the end, since the manifestDB is in flux during the
        // process of downloading and storing, and assignSegmentsToManifest
        // does not know about the DRM engine.
        this.setManifestDrmFields_(
            manifest, manifestDB, drmEngine, usePersistentLicense);
        await storage.updateManifest(manifestId, manifestDB);
      }
    };

    const usingBgFetch = false; // TODO: Get.

    try {
      if (this.getManifestIsEncrypted_(manifest) && usingBgFetch &&
          !this.getManifestIncludesInitData_(manifest)) {
        // Background fetch can't make DRM sessions, so if we have to get the
        // init data from the init segments, download those first before
        // anything else.
        await download(toDownload.filter((info) => info.isInitSegment), true);
        ensureNotAbortedOrDestroyed();
        toDownload = toDownload.filter((info) => !info.isInitSegment);

        // Copy these and reset them now, before calling await.
        const manifestUpdates = pendingManifestUpdates;
        const dataSize = pendingDataSize;
        pendingManifestUpdates = {};
        pendingDataSize = 0;

        await shaka.offline.Storage.assignSegmentsToManifest(
            storage, manifestId, manifestDB, manifestUpdates, dataSize,
            () => this.ensureNotDestroyed_());
        ensureNotAbortedOrDestroyed();
      }

      if (!usingBgFetch) {
        await download(toDownload, false);
        ensureNotAbortedOrDestroyed();

        // Copy these and reset them now, before calling await.
        const manifestUpdates = pendingManifestUpdates;
        const dataSize = pendingDataSize;
        pendingManifestUpdates = {};
        pendingDataSize = 0;

        await shaka.offline.Storage.assignSegmentsToManifest(
            storage, manifestId, manifestDB, manifestUpdates, dataSize,
            () => ensureNotAbortedOrDestroyed());
        ensureNotAbortedOrDestroyed();

        goog.asserts.assert(
            !manifestDB.isIncomplete, 'The manifest should be complete by now');
      } else {
        // TODO: Send the request to the service worker. Don't await the result.
      }
    } catch (error) {
      const dataKeys = Object.values(pendingManifestUpdates);
      // Remove these pending segments that are not yet linked to the manifest.
      await storage.removeSegments(dataKeys, (key) => {});

      throw error;
    }
  }

  /**
   * Removes all of the contents for a given manifest, statelessly.
   *
   * @param {number} manifestId
   * @return {!Promise}
   */
  static async cleanStoredManifest(manifestId) {
    const muxer = new shaka.offline.StorageMuxer();
    await muxer.init();
    const activeHandle = await muxer.getActive();
    const uri = shaka.offline.OfflineUri.manifest(
        activeHandle.path.mechanism,
        activeHandle.path.cell,
        manifestId);
    await muxer.destroy();
    const storage = new shaka.offline.Storage();
    await storage.remove(uri.toString());
  }

  /**
   * Updates the given manifest, assigns database keys to segments, then stores
   * the updated manifest.
   *
   * It is up to the caller to ensure that this method is not called
   * concurrently on the same manifest.
   *
   * @param {shaka.extern.StorageCell} storage
   * @param {number} manifestId
   * @param {!shaka.extern.ManifestDB} manifestDB
   * @param {!Object<string, number>} manifestUpdates
   * @param {number} dataSizeUpdate
   * @param {function()} throwIfAbortedFn  A function that should throw if the
   *   download has been aborted.
   * @return {!Promise}
   */
  static async assignSegmentsToManifest(
      storage, manifestId, manifestDB, manifestUpdates, dataSizeUpdate,
      throwIfAbortedFn) {
    let manifestUpdated = false;

    try {
      // Assign the stored data to the manifest.
      let complete = true;
      for (const stream of manifestDB.streams) {
        for (const segment of stream.segments) {
          let dataKey = segment.pendingSegmentRefId ?
              manifestUpdates[segment.pendingSegmentRefId] : null;
          if (dataKey != null) {
            segment.dataKey = dataKey;
            // Now that the segment has been associated with the appropriate
            // dataKey, the pendingSegmentRefId is no longer necessary.
            segment.pendingSegmentRefId = undefined;
          }

          dataKey = segment.pendingInitSegmentRefId ?
              manifestUpdates[segment.pendingInitSegmentRefId] : null;
          if (dataKey != null) {
            segment.initSegmentKey = dataKey;
            // Now that the init segment has been associated with the
            // appropriate initSegmentKey, the pendingInitSegmentRefId is no
            // longer necessary.
            segment.pendingInitSegmentRefId = undefined;
          }

          if (segment.pendingSegmentRefId) {
            complete = false;
          }
          if (segment.pendingInitSegmentRefId) {
            complete = false;
          }
        }
      }

      // Update the size of the manifest.
      manifestDB.size += dataSizeUpdate;

      // Mark the manifest as complete, if all segments are downloaded.
      if (complete) {
        manifestDB.isIncomplete = false;
      }

      // Update the manifest.
      await storage.updateManifest(manifestId, manifestDB);
      manifestUpdated = true;
      throwIfAbortedFn();
    } catch (e) {
      await shaka.offline.Storage.cleanStoredManifest(manifestId);

      if (!manifestUpdated) {
        const dataKeys = Object.values(manifestUpdates);
        // The cleanStoredManifest method will not "see" any segments that have
        // been downloaded but not assigned to the manifest yet. So un-store
        // them separately.
        await storage.removeSegments(dataKeys, (key) => {});
      }

      throw e;
    }
  }

  /**
   * Filter |manifest| such that it will only contain the variants and text
   * streams that we want to store and can actually play.
   *
   * @param {shaka.extern.Manifest} manifest
   * @param {!shaka.drm.DrmEngine} drmEngine
   * @param {shaka.extern.PlayerConfiguration} config
   * @param {boolean} usePersistentLicense
   * @return {!Promise}
   * @private
   */
  async filterManifest_(manifest, drmEngine, config, usePersistentLicense) {
    // Filter the manifest based on the restrictions given in the player
    // configuration.
    const maxHwRes = {width: Infinity, height: Infinity};
    shaka.util.StreamUtils.filterByRestrictions(
        manifest, config.restrictions, maxHwRes);

    // Filter the manifest based on what we know MediaCapabilities will be able
    // to play later (no point storing something we can't play).
    await shaka.util.StreamUtils.filterManifestByMediaCapabilities(
        drmEngine, manifest, usePersistentLicense,
        config.drm.preferredKeySystems, config.drm.keySystemsMapping);

    // Gather all tracks.
    const allTracks = [];

    // Choose the codec that has the lowest average bandwidth.
    const preferredDecodingAttributes = config.preferredDecodingAttributes;
    const preferredVideoCodecs = config.preferredVideoCodecs;
    const preferredAudioCodecs = config.preferredAudioCodecs;
    const preferredTextFormats = config.preferredTextFormats;

    shaka.util.StreamUtils.chooseCodecsAndFilterManifest(
        manifest, preferredVideoCodecs, preferredAudioCodecs,
        preferredDecodingAttributes, preferredTextFormats);

    for (const variant of manifest.variants) {
      goog.asserts.assert(
          shaka.util.StreamUtils.isPlayable(variant),
          'We should have already filtered by "is playable"');

      allTracks.push(shaka.util.StreamUtils.variantToTrack(variant));
    }

    for (const text of manifest.textStreams) {
      allTracks.push(shaka.util.StreamUtils.textStreamToTrack(text));
    }

    for (const image of manifest.imageStreams) {
      allTracks.push(shaka.util.StreamUtils.imageStreamToTrack(image));
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

    /** @type {!Set<number>} */
    const variantIds = new Set();
    /** @type {!Set<number>} */
    const textIds = new Set();
    /** @type {!Set<number>} */
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
   * This also sets up download infos for each segment to be downloaded.
   *
   * @param {!shaka.drm.DrmEngine} drmEngine
   * @param {shaka.extern.Manifest} manifest
   * @param {string} uri
   * @param {!Object} metadata
   * @param {shaka.extern.PlayerConfiguration} config
   * @param {!shaka.offline.DownloadManager} downloader
   * @param {boolean} usePersistentLicense
   * @return {{
   *   manifestDB: shaka.extern.ManifestDB,
   *   toDownload: !Array<!shaka.offline.DownloadInfo>,
   * }}
   * @private
   */
  makeManifestDB_(drmEngine, manifest, uri, metadata, config, downloader,
      usePersistentLicense) {
    const pendingContent = shaka.offline.StoredContentUtils.fromManifest(
        uri, manifest, /* size= */ 0, metadata);
    // In https://github.com/shaka-project/shaka-player/issues/2652, we found
    // that this callback would be removed by the compiler if we reference the
    // config in the onProgress closure below.  Reading it into a local
    // variable first seems to work around this apparent compiler bug.
    const progressCallback = config.offline.progressCallback;

    const onProgress = (progress, size) => {
      // Update the size of the stored content before issuing a progress
      // update.
      pendingContent.size = size;
      progressCallback(pendingContent, progress);
    };
    const onInitData = (initData, systemId) => {
      if (needsInitData && usePersistentLicense &&
          currentSystemId == systemId) {
        drmEngine.newInitData('cenc', initData);
      }
    };
    downloader.setCallbacks(onProgress, onInitData);

    const needsInitData = this.getManifestIsEncrypted_(manifest) &&
                          !this.getManifestIncludesInitData_(manifest);

    let currentSystemId = null;
    if (needsInitData) {
      const drmInfo = drmEngine.getDrmInfo();
      currentSystemId =
          shaka.offline.Storage.defaultSystemIds_.get(drmInfo.keySystem);
    }

    // Make the estimator, which is used to make the download registries.
    const estimator = new shaka.offline.StreamBandwidthEstimator();
    for (const stream of manifest.textStreams) {
      estimator.addText(stream);
    }
    for (const stream of manifest.imageStreams) {
      estimator.addImage(stream);
    }
    for (const variant of manifest.variants) {
      estimator.addVariant(variant);
    }
    const {streams, toDownload} = this.createStreams_(
        downloader, estimator, drmEngine, manifest, config);

    const drmInfo = drmEngine.getDrmInfo();
    if (drmInfo && usePersistentLicense) {
      // Don't store init data, since we have stored sessions.
      drmInfo.initData = [];
    }

    const manifestDB = {
      creationTime: Date.now(),
      originalManifestUri: uri,
      duration: manifest.presentationTimeline.getDuration(),
      size: 0,
      expiration: drmEngine.getExpiration(),
      streams,
      sessionIds: usePersistentLicense ? drmEngine.getSessionIds() : [],
      drmInfo,
      appMetadata: metadata,
      isIncomplete: true,
      sequenceMode: manifest.sequenceMode,
      type: manifest.type,
    };

    return {manifestDB, toDownload};
  }

  /**
   * @param {shaka.extern.Manifest} manifest
   * @return {boolean}
   * @private
   */
  getManifestIsEncrypted_(manifest) {
    return manifest.variants.some((variant) => {
      const videoEncrypted = variant.video && variant.video.encrypted;
      const audioEncrypted = variant.audio && variant.audio.encrypted;
      return videoEncrypted || audioEncrypted;
    });
  }

  /**
   * @param {shaka.extern.Manifest} manifest
   * @return {boolean}
   * @private
   */
  getManifestIncludesInitData_(manifest) {
    return manifest.variants.some((variant) => {
      const videoDrmInfos = variant.video ? variant.video.drmInfos : [];
      const audioDrmInfos = variant.audio ? variant.audio.drmInfos : [];
      const drmInfos = videoDrmInfos.concat(audioDrmInfos);
      return drmInfos.some((drmInfos) => {
        return drmInfos.initData && drmInfos.initData.length;
      });
    });
  }

  /**
   * @param {shaka.extern.Manifest} manifest
   * @param {shaka.extern.ManifestDB} manifestDB
   * @param {!shaka.drm.DrmEngine} drmEngine
   * @param {boolean} usePersistentLicense
   * @private
   */
  setManifestDrmFields_(manifest, manifestDB, drmEngine, usePersistentLicense) {
    manifestDB.expiration = drmEngine.getExpiration();

    const sessions = drmEngine.getSessionIds();
    manifestDB.sessionIds = usePersistentLicense ? sessions : [];

    if (this.getManifestIsEncrypted_(manifest) &&
        usePersistentLicense && !sessions.length) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.STORAGE,
          shaka.util.Error.Code.NO_INIT_DATA_FOR_OFFLINE);
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
   * @return {!Array<MediaKeySystemMediaCapability>}
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
  removeFromStorage_(storage, uri, manifest) {
    /** @type {!Array<number>} */
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
   * Removes any orphaned EME sessions.
   *
   * When DRM content is stored offline with a persistent session, the DRM
   * session ID is stored in the offline content database. When DRM content
   * gets deleted from the database, EME is asked to release the underlying
   * session attached to that ID.
   *
   * If for some reason that fails, or if the browser is closed before that
   * asynchronous process is completed, session IDs must still be tracked in
   * the database. Otherwise, they would get orphaned and there would be no way
   * to discover them or clean them up.
   *
   * This method will clean up any orphaned, persistent DRM sessions that the
   * database is still tracking. It should be called on application startup,
   * and will do nothing if there are no orphaned DRM sessions. It returns a
   * Promise that resolves to true if all the sessions were successfully
   * removed, or false if there are still sessions remaining.
   *
   * @return {!Promise<boolean>}
   * @export
   */
  removeEmeSessions() {
    return this.startOperation_(this.removeEmeSessions_());
  }

  /**
   * @return {!Promise<boolean>}
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

      /** @type {!Array<shaka.extern.EmeSessionStorageCell>} */
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
   * @return {!Promise<!Array<shaka.extern.StoredContent>>}  A Promise to an
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
   * @return {!Promise<!Array<shaka.extern.StoredContent>>}
   * @private
   */
  async list_() {
    this.requireSupport_();

    /** @type {!Array<shaka.extern.StoredContent>} */
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
   * @return {!Promise<shaka.extern.Manifest>}
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
      updateDuration: () => {},
      newDrmInfo: (stream) => {},
      onManifestUpdated: () => {},
      getBandwidthEstimate: () => config.abr.defaultBandwidthEstimate,
      onMetadata: () => {},
      disableStream: (stream) => {},
      addFont: (name, url) => {},
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
   * @param {string} uri
   * @param {shaka.extern.Manifest} manifest
   * @return {!Promise<shaka.extern.Stream>}
   * @private
   */
  async createExternalImageStream_(uri, manifest) {
    const mimeType = await this.getTextMimetype_(uri);

    if (mimeType != 'text/vtt') {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.UNSUPPORTED_EXTERNAL_THUMBNAILS_URI,
          uri);
    }

    goog.asserts.assert(
        this.networkingEngine_, 'Need networking engine.');
    const buffer = await this.getTextData_(uri,
        this.networkingEngine_,
        this.config_.streaming.retryParameters);

    const factory = shaka.text.TextEngine.findParser(mimeType);
    if (!factory) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.MISSING_TEXT_PLUGIN,
          mimeType);
    }
    const TextParser = factory();
    const time = {
      periodStart: 0,
      segmentStart: 0,
      segmentEnd: manifest.presentationTimeline.getDuration(),
      vttOffset: 0,
    };
    const data = shaka.util.BufferUtils.toUint8(buffer);
    const cues = TextParser.parseMedia(data, time, uri, /* images= */ []);

    const references = [];
    for (const cue of cues) {
      let uris = null;
      const getUris = () => {
        if (uris == null) {
          uris = shaka.util.ManifestParserUtils.resolveUris(
              [uri], [cue.payload]);
        }
        return uris || [];
      };
      const reference = new shaka.media.SegmentReference(
          cue.startTime,
          cue.endTime,
          getUris,
          /* startByte= */ 0,
          /* endByte= */ null,
          /* initSegmentReference= */ null,
          /* timestampOffset= */ 0,
          /* appendWindowStart= */ 0,
          /* appendWindowEnd= */ Infinity,
      );
      if (cue.payload.includes('#xywh')) {
        const spriteInfo = cue.payload.split('#xywh=')[1].split(',');
        if (spriteInfo.length === 4) {
          reference.setThumbnailSprite({
            height: parseInt(spriteInfo[3], 10),
            positionX: parseInt(spriteInfo[0], 10),
            positionY: parseInt(spriteInfo[1], 10),
            width: parseInt(spriteInfo[2], 10),
          });
        }
      }
      references.push(reference);
    }

    let segmentMimeType = mimeType;
    if (references.length) {
      segmentMimeType = await shaka.net.NetworkingUtils.getMimeType(
          references[0].getUris()[0],
          this.networkingEngine_, this.config_.manifest.retryParameters);
    }

    return {
      id: this.nextExternalStreamId_++,
      originalId: null,
      groupId: null,
      createSegmentIndex: () => Promise.resolve(),
      segmentIndex: new shaka.media.SegmentIndex(references),
      mimeType: segmentMimeType || '',
      codecs: '',
      kind: '',
      encrypted: false,
      drmInfos: [],
      keyIds: new Set(),
      language: 'und',
      originalLanguage: null,
      label: null,
      type: shaka.util.ManifestParserUtils.ContentType.IMAGE,
      primary: false,
      trickModeVideo: null,
      dependencyStream: null,
      emsgSchemeIdUris: null,
      roles: [],
      forced: false,
      channelsCount: null,
      audioSamplingRate: null,
      spatialAudio: false,
      closedCaptions: null,
      tilesLayout: '1x1',
      accessibilityPurpose: null,
      external: true,
      fastSwitching: false,
      fullMimeTypes: new Set([shaka.util.MimeUtils.getFullType(
          segmentMimeType || '', '')]),
      isAudioMuxedInVideo: false,
      baseOriginalId: null,
    };
  }

  /**
   * @param {shaka.extern.Manifest} manifest
   * @param {string} uri
   * @param {string} language
   * @param {string} kind
   * @param {string=} mimeType
   * @param {string=} codec
   * @private
   */
  async createExternalTextStream_(manifest, uri, language, kind, mimeType,
      codec) {
    if (!mimeType) {
      mimeType = await this.getTextMimetype_(uri);
    }

    /** @type {shaka.extern.Stream} */
    const stream = {
      id: this.nextExternalStreamId_++,
      originalId: null,
      groupId: null,
      createSegmentIndex: () => Promise.resolve(),
      segmentIndex: shaka.media.SegmentIndex.forSingleSegment(
          /* startTime= */ 0,
          /* duration= */ manifest.presentationTimeline.getDuration(),
          /* uris= */ [uri]),
      mimeType: mimeType || '',
      codecs: codec || '',
      kind: kind,
      encrypted: false,
      drmInfos: [],
      keyIds: new Set(),
      language: language,
      originalLanguage: language,
      label: null,
      type: shaka.util.ManifestParserUtils.ContentType.TEXT,
      primary: false,
      trickModeVideo: null,
      dependencyStream: null,
      emsgSchemeIdUris: null,
      roles: [],
      forced: false,
      channelsCount: null,
      audioSamplingRate: null,
      spatialAudio: false,
      closedCaptions: null,
      accessibilityPurpose: null,
      external: true,
      fastSwitching: false,
      fullMimeTypes: new Set([shaka.util.MimeUtils.getFullType(
          mimeType || '', codec || '')]),
      isAudioMuxedInVideo: false,
      baseOriginalId: null,
    };

    const fullMimeType = shaka.util.MimeUtils.getFullType(
        stream.mimeType, stream.codecs);
    const supported = shaka.text.TextEngine.isTypeSupported(fullMimeType);
    if (!supported) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.MISSING_TEXT_PLUGIN,
          mimeType);
    }

    return stream;
  }

  /**
   * @param {string} uri
   * @return {!Promise<string>}
   * @private
   */
  async getTextMimetype_(uri) {
    let mimeType;
    try {
      goog.asserts.assert(
          this.networkingEngine_, 'Need networking engine.');
      mimeType = await shaka.net.NetworkingUtils.getMimeType(uri,
          this.networkingEngine_,
          this.config_.streaming.retryParameters);
    } catch (error) {}

    if (mimeType) {
      return mimeType;
    }

    shaka.log.error(
        'The mimeType has not been provided and it could not be deduced ' +
        'from its uri.');
    throw new shaka.util.Error(
        shaka.util.Error.Severity.RECOVERABLE,
        shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.TEXT_COULD_NOT_GUESS_MIME_TYPE,
        uri);
  }

  /**
   * @param {string} uri
   * @param {!shaka.net.NetworkingEngine} netEngine
   * @param {shaka.extern.RetryParameters} retryParams
   * @return {!Promise<BufferSource>}
   * @private
   */
  async getTextData_(uri, netEngine, retryParams) {
    const type = shaka.net.NetworkingEngine.RequestType.SEGMENT;

    const request = shaka.net.NetworkingEngine.makeRequest([uri], retryParams);
    request.method = 'GET';

    const response = await netEngine.request(type, request).promise;

    return response.data;
  }

  /**
   * This method is public so that it can be override in testing.
   *
   * @param {shaka.extern.Manifest} manifest
   * @param {function(shaka.util.Error)} onError
   * @param {shaka.extern.PlayerConfiguration} config
   * @param {boolean} usePersistentLicense
   * @return {!Promise<!shaka.drm.DrmEngine>}
   */
  async createDrmEngine(manifest, onError, config, usePersistentLicense) {
    goog.asserts.assert(
        this.networkingEngine_,
        'Cannot call |createDrmEngine| after |destroy|');

    /** @type {!shaka.drm.DrmEngine} */
    const drmEngine = new shaka.drm.DrmEngine({
      netEngine: this.networkingEngine_,
      onError: onError,
      onKeyStatus: () => {},
      onExpirationUpdated: () => {},
      onEvent: () => {},
    });

    drmEngine.configure(config.drm);
    await drmEngine.initForStorage(manifest.variants, usePersistentLicense);
    await drmEngine.createOrLoad();

    return drmEngine;
  }

  /**
   * Converts manifest Streams to database Streams.
   *
   * @param {!shaka.offline.DownloadManager} downloader
   * @param {shaka.offline.StreamBandwidthEstimator} estimator
   * @param {!shaka.drm.DrmEngine} drmEngine
   * @param {shaka.extern.Manifest} manifest
   * @param {shaka.extern.PlayerConfiguration} config
   * @return {{
   *   streams: !Array<shaka.extern.StreamDB>,
   *   toDownload: !Array<!shaka.offline.DownloadInfo>,
   * }}
   * @private
   */
  createStreams_(downloader, estimator, drmEngine, manifest, config) {
    // Download infos are stored based on their refId, to deduplicate them.
    /** @type {!Map<string, !shaka.offline.DownloadInfo>} */
    const toDownload = new Map();

    // Find the streams we want to download and create a stream db instance
    // for each of them.
    const streamSet =
        shaka.offline.Storage.getAllStreamsFromManifest_(manifest);
    const streamDBs = new Map();

    for (const stream of streamSet) {
      const streamDB = this.createStream_(
          downloader, estimator, manifest, stream, config, toDownload);
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

    return {
      streams: Array.from(streamDBs.values()),
      toDownload: Array.from(toDownload.values()),
    };
  }

  /**
   * Converts a manifest stream to a database stream.  This will search the
   * segment index and add all the segments to the download infos.
   *
   * @param {!shaka.offline.DownloadManager} downloader
   * @param {shaka.offline.StreamBandwidthEstimator} estimator
   * @param {shaka.extern.Manifest} manifest
   * @param {shaka.extern.Stream} stream
   * @param {shaka.extern.PlayerConfiguration} config
   * @param {!Map<string, !shaka.offline.DownloadInfo>} toDownload
   * @return {shaka.extern.StreamDB}
   * @private
   */
  createStream_(downloader, estimator, manifest, stream, config, toDownload) {
    /** @type {shaka.extern.StreamDB} */
    const streamDb = {
      id: stream.id,
      originalId: stream.originalId,
      groupId: stream.groupId,
      primary: stream.primary,
      type: stream.type,
      mimeType: stream.mimeType,
      codecs: stream.codecs,
      frameRate: stream.frameRate,
      pixelAspectRatio: stream.pixelAspectRatio,
      hdr: stream.hdr,
      colorGamut: stream.colorGamut,
      videoLayout: stream.videoLayout,
      kind: stream.kind,
      language: stream.language,
      originalLanguage: stream.originalLanguage,
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
      mssPrivateData: stream.mssPrivateData,
      external: stream.external,
      fastSwitching: stream.fastSwitching,
      isAudioMuxedInVideo: stream.isAudioMuxedInVideo,
    };

    const startTime =
        manifest.presentationTimeline.getSegmentAvailabilityStart();

    const numberOfParallelDownloads = config.offline.numberOfParallelDownloads;
    let groupId = numberOfParallelDownloads === 0 ? stream.id : 0;

    shaka.offline.Storage.forEachSegment_(stream, startTime, (segment, pos) => {
      const pendingSegmentRefId =
          shaka.offline.DownloadInfo.idForSegmentRef(segment);
      let pendingInitSegmentRefId = undefined;

      // Set up the download for the segment, which will be downloaded later,
      // perhaps in a service worker.
      if (!toDownload.has(pendingSegmentRefId)) {
        const estimateId = downloader.addDownloadEstimate(
            estimator.getSegmentEstimate(stream.id, segment));
        const segmentDownload = new shaka.offline.DownloadInfo(
            segment,
            estimateId,
            groupId,
            /* isInitSegment= */ false,
            pos);
        toDownload.set(pendingSegmentRefId, segmentDownload);
      }

      // Set up the download for the init segment, similarly, if there is one.
      if (segment.initSegmentReference) {
        pendingInitSegmentRefId = shaka.offline.DownloadInfo.idForSegmentRef(
            segment.initSegmentReference);
        if (!toDownload.has(pendingInitSegmentRefId)) {
          const estimateId = downloader.addDownloadEstimate(
              estimator.getInitSegmentEstimate(stream.id));
          const initDownload = new shaka.offline.DownloadInfo(
              segment.initSegmentReference,
              estimateId,
              groupId,
              /* isInitSegment= */ true,
              pos);
          toDownload.set(pendingInitSegmentRefId, initDownload);
        }
      }

      /** @type {!shaka.extern.SegmentDB} */
      const segmentDB = {
        pendingInitSegmentRefId,
        initSegmentKey: pendingInitSegmentRefId ? 0 : null,
        startTime: segment.startTime,
        endTime: segment.endTime,
        appendWindowStart: segment.appendWindowStart,
        appendWindowEnd: segment.appendWindowEnd,
        timestampOffset: segment.timestampOffset,
        tilesLayout: segment.tilesLayout,
        pendingSegmentRefId,
        dataKey: 0,
        mimeType: segment.mimeType,
        codecs: segment.codecs,
        thumbnailSprite: segment.thumbnailSprite,
      };
      streamDb.segments.push(segmentDB);
      if (numberOfParallelDownloads !== 0) {
        groupId = (groupId + 1) % numberOfParallelDownloads;
      }
    });

    return streamDb;
  }

  /**
   * @param {shaka.extern.Stream} stream
   * @param {number} startTime
   * @param {function(!shaka.media.SegmentReference, number)} callback
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
      callback(ref, i);
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
   * @return {!Array<number>}
   * @private
   */
  static getAllSegmentIds_(manifest) {
    /** @type {!Set<number>} */
    const ids = new Set();

    // Get every segment for every stream in the manifest.
    for (const stream of manifest.streams) {
      for (const segment of stream.segments) {
        if (segment.initSegmentKey != null) {
          ids.add(segment.initSegmentKey);
        }

        ids.add(segment.dataKey);
      }
    }

    return Array.from(ids);
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

    /** @type {!Array<shaka.extern.EmeSessionDB>} */
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
   * @return {!Set<shaka.extern.Stream>}
   * @private
   */
  static getAllStreamsFromManifest_(manifest) {
    /** @type {!Set<shaka.extern.Stream>} */
    const set = new Set();

    for (const variant of manifest.variants) {
      if (variant.audio) {
        set.add(variant.audio);
      }
      if (variant.video) {
        set.add(variant.video);
      }
    }

    for (const text of manifest.textStreams) {
      set.add(text);
    }

    for (const image of manifest.imageStreams) {
      set.add(image);
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
    .set('com.huawei.wiseplay', '3d5e6d359b9a41e8b843dd3c6e72c42c');

shaka.Player.registerSupportPlugin('offline', shaka.offline.Storage.support);
