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

goog.provide('shaka.offline.Storage');

goog.require('goog.asserts');
goog.require('shaka.Player');
goog.require('shaka.log');
goog.require('shaka.media.DrmEngine');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.offline.DownloadManager');
goog.require('shaka.offline.ManifestConverter');
goog.require('shaka.offline.OfflineUri');
goog.require('shaka.offline.StorageCellPath');
goog.require('shaka.offline.StorageMuxer');
goog.require('shaka.offline.StoredContentUtils');
goog.require('shaka.offline.StreamBandwidthEstimator');
goog.require('shaka.util.ConfigUtils');
goog.require('shaka.util.Destroyer');
goog.require('shaka.util.Error');
goog.require('shaka.util.Functional');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.MapUtils');
goog.require('shaka.util.PlayerConfiguration');
goog.require('shaka.util.StreamUtils');


/**
 * This manages persistent offline data including storage, listing, and deleting
 * stored manifests.  Playback of offline manifests are done through the Player
 * using a special URI (see shaka.offline.OfflineUri).
 *
 * First, check support() to see if offline is supported by the platform.
 * Second, configure() the storage object with callbacks to your application.
 * Third, call store(), remove(), or list() as needed.
 * When done, call destroy().
 *
 * @param {!shaka.Player} player
 *   The player instance to pull configuration data from.
 *
 * @struct
 * @constructor
 * @implements {shaka.util.IDestroyable}
 * @export
 */
shaka.offline.Storage = function(player) {
  // It is an easy mistake to make to pass a Player proxy from CastProxy.
  // Rather than throw a vague exception later, throw an explicit and clear one
  // now.
  if (player.constructor != shaka.Player) {
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.LOCAL_PLAYER_INSTANCE_REQUIRED);
  }

  /** @private {shaka.Player} */
  this.player_ = player;

  /** @private {?shaka.extern.PlayerConfiguration} */
  this.config_ = player.getSharedConfiguration();

  /** @private {shaka.net.NetworkingEngine} */
  this.networkingEngine_ = player.getNetworkingEngine();
  goog.asserts.assert(
      this.networkingEngine_,
      'Storage should not be initialized with a player that has |destroy| ' +
          'called on it.');

  /** @private {boolean} */
  this.storeInProgress_ = false;

  /** @private {Array.<shaka.extern.Track>} */
  this.firstPeriodTracks_ = null;

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
};


/**
 * Gets whether offline storage is supported.  Returns true if offline storage
 * is supported for clear content.  Support for offline storage of encrypted
 * content will not be determined until storage is attempted.
 *
 * @return {boolean}
 * @export
 */
shaka.offline.Storage.support = function() {
  return shaka.offline.StorageMuxer.support();
};


/**
 * @override
 * @export
 */
shaka.offline.Storage.prototype.destroy = function() {
  this.config_ = null;
  this.networkingEngine_ = null;
  this.player_ = null;

  // Wait for all the open operations to end. Wrap each operations so that a
  // single rejected promise won't cause |Promise.all| to return early or to
  // return a rejected Promise.
  let noop = () => {};
  return Promise.all(this.openOperations_.map((op) => op.then(noop, noop)));
};


/**
 * Sets configuration values for Storage.  This is associated with
 * Player.configure and will change the player instance given at
 * initialization.
 *
 * @param {!Object} config This should follow the form of
 *   {@link shaka.extern.PlayerConfiguration}, but you may omit any field
 *   you do not wish to change.
 * @export
 */
shaka.offline.Storage.prototype.configure = function(config) {
  shaka.offline.Storage.verifyConfig_(config);

  goog.asserts.assert(
      this.config_, 'Cannot reconfigure stroage after calling destroy.');

  shaka.util.ConfigUtils.mergeConfigObjects(
      this.config_ /* destination */,
      config /* updates */,
      shaka.util.PlayerConfiguration.createDefault() /* template */,
      {},
      '');
};


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
shaka.offline.Storage.prototype.getNetworkingEngine = function() {
  return this.networkingEngine_;
};


/**
 * Stores the given manifest.  If the content is encrypted, and encrypted
 * content cannot be stored on this platform, the Promise will be rejected with
 * error code 6001, REQUESTED_KEY_SYSTEM_CONFIG_UNAVAILABLE.
 *
 * @param {string} uri The URI of the manifest to store.
 * @param {!Object=} appMetadata An arbitrary object from the application
 *   that will be stored along-side the offline content.  Use this for any
 *   application-specific metadata you need associated with the stored content.
 *   For details on the data types that can be stored here, please refer to
 *   {@link https://bit.ly/StructClone}
 * @param {string|shaka.extern.ManifestParser.Factory=} mimeType
 *   The mime type for the content |manifestUri| points to or a manifest parser
 *   factory to override auto-detection or use an unregistered parser. Passing
 *   a manifest parser factory is deprecated and will be removed.
 * @return {!Promise.<shaka.extern.StoredContent>}  A Promise to a structure
 *   representing what was stored.  The "offlineUri" member is the URI that
 *   should be given to Player.load() to play this piece of content offline.
 *   The "appMetadata" member is the appMetadata argument you passed to store().
 * @export
 */
shaka.offline.Storage.prototype.store = function(uri, appMetadata, mimeType) {
  /** @type {?shaka.extern.ManifestParser.Factory} */
  let Factory = null;
  /** @type {?string} */
  let contentMimeType = null;

  // TODO(vaage) : Remove the code that supports manifest parser factories
  //               in v2.6.
  if (mimeType) {
    if (typeof mimeType == 'string') {
      contentMimeType = /** @type {string} */(mimeType);
    } else {
      shaka.log.alwaysWarn(
          'Loading with a manifest parser factory is deprecated. Instead ' +
              'please register a manifest parser and pass in the mime type.');
      Factory = /** @type {shaka.extern.ManifestParser.Factory} */(mimeType);
    }
  }

  const getParser = async () => {
    const parser = Factory ?
                   new Factory() :
                   await this.getParser_(uri, contentMimeType);

    parser.configure(this.player_.getConfiguration().manifest);
    return parser;
  };

  return this.startOperation_(this.store_(uri, appMetadata || {}, getParser));
};


/**
 * See |shaka.offline.Storage.store| for details.
 *
 * @param {string} uri
 * @param {!Object} appMetadata
 * @param {function():!Promise.<shaka.extern.ManifestParser>} getParser
 * @return {!Promise.<shaka.extern.StoredContent>}
 */
shaka.offline.Storage.prototype.store_ = async function(
    uri, appMetadata, getParser) {
  // TODO: Create a way for a download to be canceled while being downloaded.
  this.requireSupport_();

  if (this.storeInProgress_) {
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.STORE_ALREADY_IN_PROGRESS));
  }
  this.storeInProgress_ = true;

  let error = null;
  let onError = (e) => {
    // To avoid hiding a previously thrown error, throw the older error.
    error = error || e;
  };

  let data = await this.loadInternal(uri, onError, getParser);

  let canDownload = !data.manifest.presentationTimeline.isLive() &&
                    !data.manifest.presentationTimeline.isInProgress();

  if (!canDownload) {
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.CANNOT_STORE_LIVE_OFFLINE,
        uri);
  }

  this.checkDestroyed_();
  if (error) { throw error; }

  /** @type {!shaka.offline.StorageMuxer} */
  const muxer = new shaka.offline.StorageMuxer();
  return shaka.util.Destroyer.with([muxer, data.drmEngine], async () => {
    try {
      await muxer.init();
      this.checkDestroyed_();

      // Re-filter now that DrmEngine is initialized.
      this.filterAllPeriods_(data.drmEngine, data.manifest.periods);

      // Get the cell that we are saving the manifest to. Once we get a cell
      // we will only reference the cell and not the muxer so that the manifest
      // and segments will all be saved to the same cell.
      let active = await muxer.getActive();
      this.checkDestroyed_();

      try {
        let manifestDB = await this.downloadManifest_(
            active.cell,
            data.drmEngine,
            data.manifest,
            uri,
            appMetadata);
        this.checkDestroyed_();

        let ids = await active.cell.addManifests([manifestDB]);
        this.checkDestroyed_();

        let offlineUri = shaka.offline.OfflineUri.manifest(
            active.path.mechanism, active.path.cell, ids[0]);
        return shaka.offline.StoredContentUtils.fromManifestDB(
            offlineUri, manifestDB);
      } catch (e) {
        // We need to remove all the segments that did get into storage as
        // the manifest won't be playable.
        let segmentsToRemove = this.segmentsFromStore_;
        let noop = () => {};
        await active.cell.removeSegments(segmentsToRemove, noop);

        // If we already had an error, ignore this error to avoid hiding
        // the original error.
        throw error || e;
      }
    } finally {
      this.storeInProgress_ = false;
      this.firstPeriodTracks_ = null;
      this.segmentsFromStore_ = [];
    }
  });
};


/**
 * Create a download manager and download the manifest.
 *
 * @param {shaka.extern.StorageCell} storage
 * @param {!shaka.media.DrmEngine} drm
 * @param {shaka.extern.Manifest} manifest
 * @param {string} uri
 * @param {!Object} metadata
 * @return {!Promise.<shaka.extern.ManifestDB>}
 * @private
 */
shaka.offline.Storage.prototype.downloadManifest_ = async function(
    storage, drm, manifest, uri, metadata) {
  const noSize = 0;
  let pendingContent = shaka.offline.StoredContentUtils.fromManifest(
      uri, manifest, noSize, metadata);

  /** @type {!shaka.offline.DownloadManager} */
  let downloader = new shaka.offline.DownloadManager((progress, size) => {
    // Update the size of the stored content before issuing a progress update.
    pendingContent.size = size;
    this.config_.offline.progressCallback(pendingContent, progress);
  });

  goog.asserts.assert(
      this.networkingEngine_,
      'Cannot call |downloadManifest_| after calling |destroy|.');
  const networkingEngine = this.networkingEngine_;

  /** @type {shaka.extern.ManifestDB} */
  let manifestDB;

  await shaka.util.Destroyer.with([downloader], async () => {
    manifestDB = this.createOfflineManifest_(
        downloader, storage, drm, manifest, uri, metadata);
    await downloader.download(networkingEngine);
  });

  // Update the size before saving it.
  manifestDB.size = pendingContent.size;
  return manifestDB;
};


/**
 * Removes the given stored content.
 *
 * @param {string} contentUri
 * @return {!Promise}
 * @export
 */
shaka.offline.Storage.prototype.remove = function(contentUri) {
  return this.startOperation_(this.remove_(contentUri));
};


/**
 * See |shaka.offline.Storage.remove| for details.
 *
 * @param {string} contentUri
 * @return {!Promise}
 */
shaka.offline.Storage.prototype.remove_ = function(contentUri) {
  this.requireSupport_();

  let nullableUri = shaka.offline.OfflineUri.parse(contentUri);
  if (nullableUri == null || !nullableUri.isManifest()) {
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.MALFORMED_OFFLINE_URI,
        contentUri));
  }

  let uri = /** @type {!shaka.offline.OfflineUri} */ (nullableUri);

  let muxer = new shaka.offline.StorageMuxer();
  return shaka.util.Destroyer.with([muxer], async () => {
    await muxer.init();

    let cell = await muxer.getCell(uri.mechanism(), uri.cell());
    let manifests = await cell.getManifests([uri.key()]);
    let manifest = manifests[0];

    await Promise.all([
      this.removeFromDRM_(uri, manifest),
      this.removeFromStorage_(cell, uri, manifest),
    ]);
  });
};


/**
 * @param {!shaka.offline.OfflineUri} uri
 * @param {shaka.extern.ManifestDB} manifestDB
 * @return {!Promise}
 * @private
 */
shaka.offline.Storage.prototype.removeFromDRM_ = function(uri, manifestDB) {
  let error;
  let onError = (e) => {
    // Ignore errors if the session was already removed.
    if (e.code != shaka.util.Error.Code.OFFLINE_SESSION_REMOVED) {
      error = e;
    }
  };

  goog.asserts.assert(
      this.networkingEngine_, 'Cannot call |removeFromDRM_| after |destroy|');

  let drmEngine = new shaka.media.DrmEngine({
    netEngine: this.networkingEngine_,
    onError: onError,
    onKeyStatus: () => {},
    onExpirationUpdated: () => {},
    onEvent: () => {},
  });

  drmEngine.configure(this.player_.getConfiguration().drm);

  let converter = new shaka.offline.ManifestConverter(
      uri.mechanism(), uri.cell());
  let manifest = converter.fromManifestDB(manifestDB);

  return shaka.util.Destroyer.with([drmEngine], async () => {
    await drmEngine.init(manifest, this.config_.offline.usePersistentLicense);
    await drmEngine.removeSessions(manifestDB.sessionIds);
  }).then(() => { if (error) { throw error; } });
};


/**
 * @param {shaka.extern.StorageCell} storage
 * @param {!shaka.offline.OfflineUri} uri
 * @param {shaka.extern.ManifestDB} manifest
 * @return {!Promise}
 * @private
 */
shaka.offline.Storage.prototype.removeFromStorage_ = function(
    storage, uri, manifest) {
  /** @type {!Array.<number>} */
  let segmentIds = shaka.offline.Storage.getAllSegmentIds_(manifest);

  // Count(segments) + Count(manifests)
  let toRemove = segmentIds.length + 1;
  let removed = 0;

  let pendingContent = shaka.offline.StoredContentUtils.fromManifestDB(
      uri, manifest);

  let onRemove = (key) => {
    removed += 1;
    this.config_.offline.progressCallback(pendingContent, removed / toRemove);
  };

  return Promise.all([
    storage.removeSegments(segmentIds, onRemove),
    storage.removeManifests([uri.key()], onRemove),
  ]);
};


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
shaka.offline.Storage.prototype.list = function() {
  return this.startOperation_(this.list_());
};


/**
 * See |shaka.offline.Storage.list| for details.
 *
 * @return {!Promise.<!Array.<shaka.extern.StoredContent>>}
 */
shaka.offline.Storage.prototype.list_ = function() {
  this.requireSupport_();

  /** @type {!Array.<shaka.extern.StoredContent>} */
  let result = [];

  /**
   * @param {!shaka.offline.StorageCellPath} path
   * @param {shaka.extern.StorageCell} cell
   */
  async function onCell(path, cell) {
    let manifests = await cell.getAllManifests();

    shaka.util.MapUtils.forEach(manifests, (key, manifest) => {
      let uri = shaka.offline.OfflineUri.manifest(
          path.mechanism, path.cell, key);
      let content = shaka.offline.StoredContentUtils.fromManifestDB(
          uri, manifest);

      result.push(content);
    });
  }

  // Go over each storage cell and call |onCell| to create our list of
  // stored content.
  let muxer = new shaka.offline.StorageMuxer();
  return shaka.util.Destroyer.with([muxer], async () => {
    await muxer.init();

    let p = Promise.resolve();
    muxer.forEachCell((path, cell) => {
      p = p.then(() => onCell(path, cell));
    });

    await p;
  }).then(() => result);
};


/**
 * Loads the given manifest, parses it, and constructs the DrmEngine.  This
 * stops the manifest parser.  This may be replaced by tests.
 *
 * @param {string} manifestUri
 * @param {function(*)} onError
 * @param {function():!Promise.<shaka.extern.ManifestParser>} getParser
 * @return {!Promise.<{
 *   manifest: shaka.extern.Manifest,
 *   drmEngine: !shaka.media.DrmEngine
 * }>}
 */
shaka.offline.Storage.prototype.loadInternal = function(
    manifestUri, onError, getParser) {
  goog.asserts.assert(
      this.networkingEngine_,
      'Cannot call |loadInternal| after calling |destroy|');
  const netEngine = this.networkingEngine_;

  let config = this.player_.getConfiguration();

  /** @type {shaka.extern.Manifest} */
  let manifest;
  /** @type {!shaka.media.DrmEngine} */
  let drmEngine;
  /** @type {shaka.extern.ManifestParser} */
  let manifestParser;

  let onKeyStatusChange = function() {};

  // TODO(vaage): Change the promise chain below to use async/await.

  return getParser().then(function(parser) {
        this.checkDestroyed_();

        manifestParser = parser;

        drmEngine = new shaka.media.DrmEngine({
          netEngine: netEngine,
          onError: onError,
          onKeyStatus: onKeyStatusChange,
          onExpirationUpdated: () => {},
          onEvent: () => {},
        });

        drmEngine.configure(config.drm);

        let playerInterface = {
          networkingEngine: netEngine,
          filterAllPeriods: (periods) => {
            this.filterAllPeriods_(drmEngine, periods);
          },
          filterNewPeriod: (period) => {
            this.filterPeriod_(drmEngine, period);
          },
          onTimelineRegionAdded: function() {},
          onEvent: function() {},
          onError: onError,
        };

        return manifestParser.start(manifestUri, playerInterface);
      }.bind(this))
      .then(function(data) {
        this.checkDestroyed_();
        manifest = data;
        return drmEngine.init(
            manifest, this.config_.offline.usePersistentLicense);
      }.bind(this))
      .then(function() {
        this.checkDestroyed_();
        return this.createSegmentIndex_(manifest);
      }.bind(this))
      .then(function() {
        this.checkDestroyed_();
        return drmEngine.createOrLoad();
      }.bind(this))
      .then(function() {
        this.checkDestroyed_();
        return manifestParser.stop();
      }.bind(this))
      .then(function() {
        this.checkDestroyed_();
        return {manifest: manifest, drmEngine: drmEngine};
      }.bind(this))
      .catch(function(error) {
        if (manifestParser) {
          return manifestParser.stop().then(function() { throw error; });
        } else {
          throw error;
        }
      });
};


/**
 * @param {!shaka.media.DrmEngine} drmEngine
 * @param {!Array.<shaka.extern.Period>} periods
 * @private
 */
shaka.offline.Storage.prototype.filterAllPeriods_ = function(
    drmEngine, periods) {
  periods.forEach((period) => this.filterPeriod_(drmEngine, period));
};


/**
 * @param {!shaka.media.DrmEngine} drmEngine
 * @param {shaka.extern.Period} period
 * @private
 */
shaka.offline.Storage.prototype.filterPeriod_ = function(drmEngine, period) {
  const StreamUtils = shaka.util.StreamUtils;

  const maxHwRes = {width: Infinity, height: Infinity};

  /** @type {?shaka.extern.Variant} */
  let variant = null;

  if (this.firstPeriodTracks_) {
    let variantTrack = this.firstPeriodTracks_.filter(function(track) {
      return track.type == 'variant';
    })[0];

    if (variantTrack) {
      variant = StreamUtils.findVariantForTrack(period, variantTrack);
    }
  }

  /** @type {?shaka.extern.Stream} */
  let activeAudio = null;
  /** @type {?shaka.extern.Stream} */
  let activeVideo = null;

  if (variant) {
    // Use the first variant as the container of "active streams".  This
    // is then used to filter out the streams that are not compatible with it.
    // This ensures that in multi-Period content, all Periods have streams
    // with compatible MIME types.
    if (variant.audio) activeAudio = variant.audio;
    if (variant.video) activeVideo = variant.video;
  }

  StreamUtils.filterNewPeriod(
      drmEngine, activeAudio, activeVideo, period);
  StreamUtils.applyRestrictions(
      period.variants, this.player_.getConfiguration().restrictions, maxHwRes);
};


/**
 * Calls createSegmentIndex for all streams in the manifest.
 *
 * @param {shaka.extern.Manifest} manifest
 * @return {!Promise}
 * @private
 */
shaka.offline.Storage.prototype.createSegmentIndex_ = function(manifest) {
  const Functional = shaka.util.Functional;
  let streams = manifest.periods
      .map(function(period) { return period.variants; })
      .reduce(Functional.collapseArrays, [])
      .map(function(variant) {
        let variantStreams = [];
        if (variant.audio) variantStreams.push(variant.audio);
        if (variant.video) variantStreams.push(variant.video);
        return variantStreams;
      })
      .reduce(Functional.collapseArrays, [])
      .filter(Functional.isNotDuplicate);

  let textStreams = manifest.periods
      .map(function(period) { return period.textStreams; })
      .reduce(Functional.collapseArrays, []);

  streams.push.apply(streams, textStreams);
  return Promise.all(
      streams.map(function(stream) { return stream.createSegmentIndex(); }));
};


/**
 * Creates an offline 'manifest' for the real manifest.  This does not store the
 * segments yet, only adds them to the download manager through createPeriod_.
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
shaka.offline.Storage.prototype.createOfflineManifest_ = function(
    downloader, storage, drmEngine, manifest, originalManifestUri, metadata) {
  let estimator = new shaka.offline.StreamBandwidthEstimator();

  let periods = manifest.periods.map((period) => {
    return this.createPeriod_(
        downloader, storage, estimator, drmEngine, manifest, period);
  });

  let drmInfo = drmEngine.getDrmInfo();
  let sessions = drmEngine.getSessionIds();

  if (drmInfo && this.config_.offline.usePersistentLicense) {
    if (!sessions.length) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL, shaka.util.Error.Category.STORAGE,
          shaka.util.Error.Code.NO_INIT_DATA_FOR_OFFLINE, originalManifestUri);
    }
    // Don't store init data, since we have stored sessions.
    drmInfo.initData = [];
  }

  return {
    originalManifestUri: originalManifestUri,
    duration: manifest.presentationTimeline.getDuration(),
    size: 0,
    expiration: drmEngine.getExpiration(),
    periods: periods,
    sessionIds: this.config_.offline.usePersistentLicense ? sessions : [],
    drmInfo: drmInfo,
    appMetadata: metadata,
  };
};


/**
 * Converts a manifest Period to a database Period.  This will use the current
 * configuration to get the tracks to use, then it will search each segment
 * index and add all the segments to the download manager through createStream_.
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
shaka.offline.Storage.prototype.createPeriod_ = function(
    downloader, storage, estimator, drmEngine, manifest, period) {
  const StreamUtils = shaka.util.StreamUtils;

  let variantTracks = StreamUtils.getVariantTracks(period, null, null);
  let textTracks = StreamUtils.getTextTracks(period, null);
  let allTracks = variantTracks.concat(textTracks);

  let chosenTracks = this.config_.offline.trackSelectionCallback(allTracks);

  if (this.firstPeriodTracks_ == null) {
    this.firstPeriodTracks_ = chosenTracks;
    // Now that the first tracks are chosen, filter again.  This ensures all
    // Periods have compatible content types.
    this.filterAllPeriods_(drmEngine, manifest.periods);
  }

  // Check for any similar tracks.
  if (shaka.offline.Storage.lookForSimilarTracks_(chosenTracks)) {
    shaka.log.warning(
        'Multiple tracks of the same type/kind/language given.');
  }

  // Pass all variants and text streams to the estimator so that we can
  // get the best estimate for each stream later.
  manifest.periods.forEach((period) => {
    period.variants.forEach((variant) => { estimator.addVariant(variant); });
    period.textStreams.forEach((text) => { estimator.addText(text); });
  });

  // Need a way to look up which streams should be downloaded. Use a map so
  // that we can easily lookup if a stream should be downloaded just by
  // checking if its id is in the map.
  let idMap = {};
  chosenTracks.forEach((track) => {
    if (track.type == 'variant' && track.audioId != null) {
      idMap[track.audioId] = true;
    }
    if (track.type == 'variant' && track.videoId != null) {
      idMap[track.videoId] = true;
    }
    if (track.type == 'text') {
      idMap[track.id] = true;
    }
  });

  // Find the streams we want to download and create a stream db instance
  // for each of them.
  let streamDBs = {};
  shaka.offline.Storage.getStreamSet_(manifest)
      .filter((stream) => !!idMap[stream.id])
      .forEach((stream) => {
        streamDBs[stream.id] = this.createStream_(
            downloader, storage, estimator, manifest, period, stream);
      });

  // Connect streams and variants together.
  chosenTracks.forEach((track) => {
    if (track.type == 'variant' && track.audioId != null) {
      streamDBs[track.audioId].variantIds.push(track.id);
    }
    if (track.type == 'variant' && track.videoId != null) {
      streamDBs[track.videoId].variantIds.push(track.id);
    }
  });

  return {
    startTime: period.startTime,
    streams: shaka.util.MapUtils.values(streamDBs),
  };
};


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
shaka.offline.Storage.prototype.createStream_ = function(
    downloader, storage, estimator, manifest, period, stream) {
  /** @type {shaka.extern.StreamDB} */
  let streamDb = {
    id: stream.id,
    primary: stream.primary,
    presentationTimeOffset: stream.presentationTimeOffset || 0,
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
  let startTime =
      manifest.presentationTimeline.getSegmentAvailabilityStart();

  // Download each stream in parallel.
  let downloadGroup = stream.id;

  shaka.offline.Storage.forEachSegment_(stream, startTime, (segment) => {
    downloader.queue(
        downloadGroup,
        this.createRequest_(segment),
        estimator.getSegmentEstimate(stream.id, segment),
        (data) => {
          return storage.addSegments([{data: data}]).then((ids) => {
            this.segmentsFromStore_.push(ids[0]);

            streamDb.segments.push({
              startTime: segment.startTime,
              endTime: segment.endTime,
              dataKey: ids[0],
            });
          });
        });
  });

  let initSegment = stream.initSegmentReference;
  if (initSegment) {
    downloader.queue(
        downloadGroup,
        this.createRequest_(initSegment),
        estimator.getInitSegmentEstimate(stream.id),
        (data) => {
          return storage.addSegments([{data: data}]).then((ids) => {
            this.segmentsFromStore_.push(ids[0]);
            streamDb.initSegmentKey = ids[0];
          });
        });
  }

  return streamDb;
};


/**
 * @param {shaka.extern.Stream} stream
 * @param {number} startTime
 * @param {function(!shaka.media.SegmentReference)} callback
 * @private
 */
shaka.offline.Storage.forEachSegment_ = function(stream, startTime, callback) {
  /** @type {?number} */
  let i = stream.findSegmentPosition(startTime);
  /** @type {?shaka.media.SegmentReference} */
  let ref = i == null ? null : stream.getSegmentReference(i);

  while (ref) {
    callback(ref);
    ref = stream.getSegmentReference(++i);
  }
};


/**
 * Throws an error if the object is destroyed.
 * @private
 */
shaka.offline.Storage.prototype.checkDestroyed_ = function() {
  if (!this.player_) {
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.OPERATION_ABORTED);
  }
};


/**
 * Used by functions that need storage support to ensure that the current
 * platform has storage support before continuing. This should only be
 * needed to be used at the start of public methods.
 *
 * @private
 */
shaka.offline.Storage.prototype.requireSupport_ = function() {
  if (!shaka.offline.Storage.support()) {
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.STORAGE_NOT_SUPPORTED);
  }
};


/**
 * @param {!shaka.media.SegmentReference|
 *         !shaka.media.InitSegmentReference} segment
 * @return {shaka.extern.Request}
 * @private
 */
shaka.offline.Storage.prototype.createRequest_ = function(segment) {
  let retryParams = this.player_.getConfiguration().streaming.retryParameters;
  let request = shaka.net.NetworkingEngine.makeRequest(
      segment.getUris(), retryParams);

  if (segment.startByte != 0 || segment.endByte != null) {
    let end = segment.endByte == null ? '' : segment.endByte;
    request.headers['Range'] = 'bytes=' + segment.startByte + '-' + end;
  }

  return request;
};


/**
 * Perform an action. Track the action's progress so that when we destroy
 * we will wait until all the actions have completed before allowing destroy
 * to resolve.
 *
 * @param {!Promise<T>} action
 * @return {!Promise<T>}
 * @template T
 */
shaka.offline.Storage.prototype.startOperation_ = async function(action) {
  this.openOperations_.push(action);

  try {
    // Await |action| so we can use the finally statement to remove |action|
    // from |openOperations_| when we still have a reference to |action|.
    return await action;
  } finally {
    shaka.util.ArrayUtils.remove(this.openOperations_, action);
  }
};


/**
 * Get a parser for the asset located at |assetUri|.
 *
 * @param {string} assetUri
 * @param {?string} mimeType
 *    When not null, the mimeType will be used to find the best manifest parser
 *    for the given asset.
 * @return {!Promise.<shaka.extern.ManifestParser>}
 */
shaka.offline.Storage.prototype.getParser_ = async function(
    assetUri, mimeType) {
  goog.asserts.assert(
      this.player_,
      'Cannot call |getParser_| after calling |destroy|.');

  const networkingEngine = this.player_.getNetworkingEngine();
  goog.asserts.assert(
      networkingEngine,
      'Cannot called |getParser_| after calling |destroy| on Player.');

  const Factory = await shaka.media.ManifestParser.getFactory(
      assetUri,
      networkingEngine,
      this.player_.getConfiguration().manifest.retryParameters,
      mimeType);

  return new Factory();
};


/**
 * @param {shaka.extern.ManifestDB} manifest
 * @return {!Array.<number>}
 * @private
 */
shaka.offline.Storage.getAllSegmentIds_ = function(manifest) {
  /** @type {!Array.<number>} */
  let ids = [];

  // Get every segment for every stream in the manifest.
  manifest.periods.forEach(function(period) {
    period.streams.forEach(function(stream) {
      if (stream.initSegmentKey != null) {
        ids.push(stream.initSegmentKey);
      }

      stream.segments.forEach(function(segment) {
        ids.push(segment.dataKey);
      });
    });
  });

  return ids;
};


/**
 * Delete the on-disk storage and all the content it contains. This should not
 * be done regularly; only do it when storage is rendered unusable.
 *
 * @param {!shaka.Player} player
 * @return {!Promise}
 * @export
 */
shaka.offline.Storage.deleteAll = function(player) {
  /** @type {shaka.net.NetworkingEngine} */
  const networkingEngine = player.getNetworkingEngine();
  goog.asserts.assert(
      networkingEngine, 'Cannot used destroyed player with |deleteAll|');

  /** @type {shaka.extern.PlayerConfiguration} */
  const config = player.getConfiguration();

  return shaka.offline.Storage.deleteAll_(networkingEngine, config.drm);
};


/**
 * @param {!shaka.net.NetworkingEngine} networkingEngine
 * @param {shaka.extern.DrmConfiguration} drmConfig
 * @return {!Promise}
 * @private
 */
shaka.offline.Storage.deleteAll_ = function(networkingEngine, drmConfig) {
  const deleteLicenseFor = shaka.offline.Storage.deleteLicenseFor_;

  /** @type {!shaka.offline.StorageMuxer} */
  const muxer = new shaka.offline.StorageMuxer();

  return shaka.util.Destroyer.with([muxer], async () => {
    await muxer.init();

    /** @type {!Array.<shaka.extern.Manifest>} */
    let manifests = await shaka.offline.Storage.getAllManifests_(muxer);

    let deleteLicenses = Promise.resolve();

    // Since |deleteLicenseFor_| will create a drm engine instance and each
    // drm engine instance represents a CDM instance, having too many CDM
    // instances open on some platforms could be problematic. So instead
    // we will need to do each manifest serially to avoid potential problems
    // with too many open sessions.
    manifests.forEach((manifest) => {
      deleteLicenses = deleteLicenses.then(() => {
        return deleteLicenseFor(networkingEngine, drmConfig, manifest);
      });
    });

    // Wait for all the sessions to be removed before clearing storage. In the
    // case that something goes wrong, we will still have the manifests so that
    // we can get the sessions and try removing them again.
    await deleteLicenses;

    // Now that the sessions are gone, we can remove all the content.
    await muxer.erase();
  });
};


/**
 * @param {!shaka.net.NetworkingEngine} net
 * @param {!shaka.extern.DrmConfiguration} drmConfig
 * @param {shaka.extern.Manifest} manifest
 * @return {!Promise}
 * @private
 */
shaka.offline.Storage.deleteLicenseFor_ = function(net, drmConfig, manifest) {
  const isOffline = true;

  /** @type {!shaka.media.DrmEngine} */
  let drm = new shaka.media.DrmEngine({
    netEngine: net,
    onError: (e) => shaka.log.error('ignoring drm engine error', e),
    onKeyStatus: () => {},
    onExpirationUpdated: () => {},
    onEvent: () => {},
  });

  drm.configure(drmConfig);

  return shaka.util.Destroyer.with([drm], async () => {
    await drm.init(manifest, isOffline);
    await drm.removeSessions(manifest.offlineSessionIds);
  });
};


/**
 * Look to see if there are any tracks that are "too" similar to each other.
 *
 * @param {!Array.<shaka.extern.Track>} tracks
 * @return {boolean}
 * @private
 */
shaka.offline.Storage.lookForSimilarTracks_ = function(tracks) {
  return tracks.some((t0) => {
    return tracks.some((t1) => {
      return t0 != t1 &&
             t0.type == t1.type &&
             t0.kind == t1.kind &&
             t0.language == t1.language;
    });
  });
};


/**
 * Get a collection of streams that are in the manifest. This collection will
 * only have one instance of each stream (similar to a set).
 *
 * @param {shaka.extern.Manifest} manifest
 * @return {!Array.<shaka.extern.Stream>}
 * @private
 */
shaka.offline.Storage.getStreamSet_ = function(manifest) {
  // Use a map so that we don't store duplicates. Since a stream's id should
  // be unique within the manifest, we can use that as the key.
  let map = {};

  manifest.periods.forEach((period) => {
    period.textStreams.forEach((text) => { map[text.id] = text; });
    period.variants.forEach((variant) => {
      if (variant.audio) { map[variant.audio.id] = variant.audio; }
      if (variant.video) { map[variant.video.id] = variant.video; }
    });
  });

  return shaka.util.MapUtils.values(map);
};


/**
 * @param{!shaka.offline.StorageMuxer} muxer
 * @return {!Promise.<!Array.<shaka.extern.Manifest>>}
 * @private
 */
shaka.offline.Storage.getAllManifests_ = function(muxer) {
  let manifests = [];

  let waits = [];

  muxer.forEachCell((path, cell) => {
    let converter = new shaka.offline.ManifestConverter(
        path.mechanism, path.cell);

    waits.push(cell.getAllManifests().then((map) => {
      let manifestDBs = shaka.util.MapUtils.values(map);
      manifestDBs.forEach((manifestDB) => {
        manifests.push(converter.fromManifestDB(manifestDB));
      });
    }));
  });

  return Promise.all(waits).then(() => manifests);
};


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
shaka.offline.Storage.verifyConfig_ = function(config) {
  // To avoid printing a deprecated warning multiple times, track all
  // infractions and then print it once at the end.
  let usedLegacyConfig = false;

  // For each field in the legacy config structure
  // (shaka.extern.OfflineConfiguration), move any occurances to the correct
  // location in the player configuration.
  if (config.trackSelectionCallback != null) {
    usedLegacyConfig = true;
    config.offline = config.offline || {};
    config.offline.trackSelectionCallback = config.trackSelectionCallback;
  }

  if (config.progressCallback != null) {
    usedLegacyConfig = true;
    config.offline = config.offline || {};
    config.offline.progressCallback = config.progressCallback;
  }

  if (config.usePersistentLicense != null) {
    usedLegacyConfig = true;
    config.offline = config.offline || {};
    config.offline.usePersistentLicense = config.usePersistentLicense;
  }

  if (usedLegacyConfig) {
    shaka.log.alwaysWarn(
        'Storage.configure should now be passed a player configuration ' +
            'structure. Using a non-player configuration will be deprecated ' +
            'in v2.6.');
  }
};

shaka.Player.registerSupportPlugin('offline', shaka.offline.Storage.support);
