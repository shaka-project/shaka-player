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
goog.require('shaka.offline.DownloadManager');
goog.require('shaka.offline.IStorageEngine');
goog.require('shaka.offline.ManifestConverter');
goog.require('shaka.offline.OfflineUri');
goog.require('shaka.offline.StorageEngineFactory');
goog.require('shaka.offline.StoredContentUtils');
goog.require('shaka.util.ConfigUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.Functional');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.StreamUtils');



/**
 * This manages persistent offline data including storage, listing, and deleting
 * stored manifests.  Playback of offline manifests are done using Player
 * using the special URI (see shaka.offline.OfflineUri).
 *
 * First, check support() to see if offline is supported by the platform.
 * Second, configure() the storage object with callbacks to your application.
 * Third, call store(), remove(), or list() as needed.
 * When done, call destroy().
 *
 * @param {shaka.Player} player
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
  if (!player || player.constructor != shaka.Player) {
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.LOCAL_PLAYER_INSTANCE_REQUIRED);
  }

  /** @private {shaka.offline.IStorageEngine} */
  this.storageEngine_ = null;

  /** @private {shaka.Player} */
  this.player_ = player;

  /** @private {?shakaExtern.OfflineConfiguration} */
  this.config_ = this.defaultConfig_();

  /** @private {boolean} */
  this.storeInProgress_ = false;

  /** @private {Array.<shakaExtern.Track>} */
  this.firstPeriodTracks_ = null;

  /**
   * The stored content for the manifest that storage is currently downloading.
   * If this is null, it means that storage is not downloading a manifest.
   * @private {?shakaExtern.StoredContent}
   */
  this.pendingContent_ = null;

  /** @private {shaka.offline.DownloadManager} */
  this.downloadManager_ = null;
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
  return shaka.offline.StorageEngineFactory.isSupported();
};


/**
 * @override
 * @export
 */
shaka.offline.Storage.prototype.destroy = function() {
  var storageEngine = this.storageEngine_;
  // Destroy the download manager first since it needs the StorageEngine to
  // clean up old segments.
  var ret = !this.downloadManager_ ?
      Promise.resolve() :
      this.downloadManager_.destroy()
          .catch(function() {})
          .then(function() {
            if (storageEngine) return storageEngine.destroy();
          });

  this.storageEngine_ = null;
  this.downloadManager_ = null;
  this.player_ = null;
  this.config_ = null;
  return ret;
};


/**
 * Sets configuration values for Storage.  This is not associated with
 * Player.configure and will not change Player.
 *
 * There are two important callbacks configured here: one for download progress,
 * and one to decide which tracks to store.
 *
 * The default track selection callback will store the largest SD video track.
 * Provide your own callback to choose the tracks you want to store.
 *
 * @param {!Object} config This should follow the form of
 *   {@link shakaExtern.OfflineConfiguration}, but you may omit any field you do
 *   not wish to change.
 * @export
 */
shaka.offline.Storage.prototype.configure = function(config) {
  goog.asserts.assert(this.config_, 'Storage must not be destroyed');
  shaka.util.ConfigUtils.mergeConfigObjects(
      this.config_, config, this.defaultConfig_(), {}, '');
};


/**
 * Stores the given manifest.  If the content is encrypted, and encrypted
 * content cannot be stored on this platform, the Promise will be rejected with
 * error code 6001, REQUESTED_KEY_SYSTEM_CONFIG_UNAVAILABLE.
 *
 * @param {string} manifestUri The URI of the manifest to store.
 * @param {!Object=} opt_appMetadata An arbitrary object from the application
 *   that will be stored along-side the offline content.  Use this for any
 *   application-specific metadata you need associated with the stored content.
 *   For details on the data types that can be stored here, please refer to
 *   {@link https://goo.gl/h62coS}
 * @param {!shakaExtern.ManifestParser.Factory=} opt_manifestParserFactory
 * @return {!Promise.<shakaExtern.StoredContent>}  A Promise to a structure
 *   representing what was stored.  The "offlineUri" member is the URI that
 *   should be given to Player.load() to play this piece of content offline.
 *   The "appMetadata" member is the appMetadata argument you passed to store().
 * @export
 */
shaka.offline.Storage.prototype.store = function(
    manifestUri, opt_appMetadata, opt_manifestParserFactory) {
  // TODO: Create a way for a download to be canceled while being downloaded.
  if (this.storeInProgress_) {
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.STORE_ALREADY_IN_PROGRESS));
  }
  this.storeInProgress_ = true;

  /** @type {!Object} */
  var appMetadata = opt_appMetadata || {};

  let error = null;

  return this.initIfNeeded_().then(() => {
    this.checkDestroyed_();
    return this.loadInternal(
        manifestUri, (e) => { error = e; }, opt_manifestParserFactory);
  }).then((data) => {
    this.checkDestroyed_();
    if (error) { throw error; }

    let manifest = data.manifest;
    let drmEngine = data.drmEngine;

    return this.downloadAndStoreManifest_(
        manifestUri, manifest, appMetadata, drmEngine).then(
            (r) => drmEngine.destroy().then(() => Promise.resolve(r)),
            (e) => drmEngine.destroy().then(() => Promise.reject(e)));
  }).then(
      (content) => {
        this.checkDestroyed_();

        this.storeInProgress_ = false;
        this.firstPeriodTracks_ = null;

        return content;
      },
      (err) => {
        this.storeInProgress_ = false;
        this.firstPeriodTracks_ = null;

        // If we already had an error, ignore this error to avoid hiding
        // the original error.
        throw error || err;
      });
};


/**
 * @param {string} manifestUri
 * @param {shakaExtern.Manifest} manifest
 * @param {!Object} appMetadata
 * @param {!shaka.media.DrmEngine} drmEngine
 * @return {!Promise.<shakaExtern.StoredContent>}
 * @private
 */
shaka.offline.Storage.prototype.downloadAndStoreManifest_ = function(
    manifestUri, manifest, appMetadata, drmEngine) {
  if (manifest.presentationTimeline.isLive() ||
      manifest.presentationTimeline.isInProgress()) {
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.CANNOT_STORE_LIVE_OFFLINE,
        manifestUri);
  }

  // Re-filter now that DrmEngine is initialized.
  this.filterAllPeriods_(drmEngine, manifest.periods);

  this.pendingContent_ = shaka.offline.StoredContentUtils.fromManifest(
      manifestUri,
      manifest,
      0,  // start with a size of 0
      appMetadata);

  /** @type {shakaExtern.ManifestDB} */
  let manifestDB = this.createOfflineManifest_(
      drmEngine, manifest, manifestUri, appMetadata);

  return this.downloadManager_.downloadAndStore(manifestDB)
      .then(function(id) {
        /** @type {!shaka.offline.OfflineUri} */
        let uri = shaka.offline.OfflineUri.manifest(
            'mechanism', 'cell', id);
        return shaka.offline.StoredContentUtils.fromManifestDB(
            uri, manifestDB);
      });
};


/**
 * Removes the given stored content.
 *
 * @param {string} contentUri
 * @return {!Promise}
 * @export
 */
shaka.offline.Storage.prototype.remove = function(contentUri) {
  let nullableUri = shaka.offline.OfflineUri.parse(contentUri);
  if (nullableUri == null || !nullableUri.isManifest()) {
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.MALFORMED_OFFLINE_URI,
        contentUri));
  }

  let uri = /** @type {!shaka.offline.OfflineUri} */ (nullableUri);

  return shaka.offline.Storage.withStorageEngine_((storage) => {
    return storage.getManifest(uri.key()).then((manifestDB) => {
      if (!manifestDB) {
        return Promise.reject(new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.STORAGE,
            shaka.util.Error.Code.REQUESTED_ITEM_NOT_FOUND,
            contentUri));
      }

      return Promise.all([
          this.removeFromDRM_(uri, manifestDB),
          this.removeFromStorage_(storage, uri, manifestDB)
      ]);
    });
  });
};


/**
 * @param {!shaka.offline.OfflineUri} uri
 * @param {shakaExtern.ManifestDB} manifestDB
 * @return {!Promise}
 * @private
 */
shaka.offline.Storage.prototype.removeFromDRM_ = function(uri, manifestDB) {
  // Use a public promise so that the drm engine can reject the promise if it
  // sees an error.
  let p = new shaka.util.PublicPromise();

  let netEngine = this.player_.getNetworkingEngine();
  goog.asserts.assert(netEngine, 'Player must not be destroyed');

  let drmEngine = new shaka.media.DrmEngine({
    netEngine: netEngine,
    onError: (e) => {
      // Ignore errors if the session was already removed.
      if (e.code != shaka.util.Error.Code.OFFLINE_SESSION_REMOVED) {
        p.reject(e);
      }
    },
    onKeyStatus: () => {},
    onExpirationUpdated: () => {},
    onEvent: () => {}
  });
  drmEngine.configure(this.player_.getConfiguration().drm);


  let converter =
      new shaka.offline.ManifestConverter(uri.mechanism(), uri.cell());
  let manifest = converter.fromManifestDB(manifestDB);

  drmEngine.init(manifest, this.config_.usePersistentLicense)
      .then(() => drmEngine.removeSessions(manifestDB.sessionIds))
      .then(() => drmEngine.destroy().then(() => p.resolve()),
            (e) => drmEngine.destroy().then(() => p.reject(e)));

  return p;
};


/**
 * @param {!shaka.offline.IStorageEngine} storage
 * @param {!shaka.offline.OfflineUri} uri
 * @param {shakaExtern.ManifestDB} manifest
 * @return {!Promise}
 * @private
 */
shaka.offline.Storage.prototype.removeFromStorage_ = function(
    storage, uri, manifest) {
  /** @type {function(shakaExtern.StoredContent, number)} */
  var callback = this.config_.progressCallback;

  /** @type {shakaExtern.StoredContent} */
  let content = shaka.offline.StoredContentUtils.fromManifestDB(
      uri, manifest);

  /** @type {!Array.<number>} */
  var segmentIds = shaka.offline.Storage.getAllSegmentIds_(manifest);

  /** @type {number} */
  var thingsRemoved = 0;
  /** @type {number} */
  var thingsToRemove = segmentIds.length + 1; // "+ 1" for manifest

  /** @type {function()} */
  let onThingRemoved = () => {
    thingsRemoved++;
    callback(content, thingsRemoved / thingsToRemove);
  };

  return Promise.all([
    storage.removeSegments(segmentIds, onThingRemoved),
    storage.removeManifests([uri.key()], onThingRemoved)
  ]);
};


/**
 * Lists all the stored content available.
 *
 * @return {!Promise.<!Array.<shakaExtern.StoredContent>>}  A Promise to an
 *   array of structures representing all stored content.  The "offlineUri"
 *   member of the structure is the URI that should be given to Player.load()
 *   to play this piece of content offline.  The "appMetadata" member is the
 *   appMetadata argument you passed to store().
 * @export
 */
shaka.offline.Storage.prototype.list = function() {
  /** @type {!Array.<!shakaExtern.StoredContent>} */
  let result = [];

  return shaka.offline.Storage.withStorageEngine_((storage) => {
    return storage.forEachManifest((id, manifest) => {
      let uri =
          shaka.offline.OfflineUri.manifest('mechanism', 'cell', id);
      let content =
          shaka.offline.StoredContentUtils.fromManifestDB(uri, manifest);

      result.push(content);
    });
  }).then(() => result);
};


/**
 * Loads the given manifest, parses it, and constructs the DrmEngine.  This
 * stops the manifest parser.  This may be replaced by tests.
 *
 * @param {string} manifestUri
 * @param {function(*)} onError
 * @param {!shakaExtern.ManifestParser.Factory=} opt_manifestParserFactory
 * @return {!Promise.<{
 *   manifest: shakaExtern.Manifest,
 *   drmEngine: !shaka.media.DrmEngine
 * }>}
 */
shaka.offline.Storage.prototype.loadInternal = function(
    manifestUri, onError, opt_manifestParserFactory) {

  var netEngine = /** @type {!shaka.net.NetworkingEngine} */ (
      this.player_.getNetworkingEngine());
  var config = this.player_.getConfiguration();

  /** @type {shakaExtern.Manifest} */
  var manifest;
  /** @type {!shaka.media.DrmEngine} */
  var drmEngine;
  /** @type {!shakaExtern.ManifestParser} */
  var manifestParser;

  var onKeyStatusChange = function() {};
  return shaka.media.ManifestParser
      .getFactory(
          manifestUri, netEngine, config.manifest.retryParameters,
          opt_manifestParserFactory)
      .then(function(factory) {
        this.checkDestroyed_();

        drmEngine = new shaka.media.DrmEngine({
          netEngine: netEngine,
          onError: onError,
          onKeyStatus: onKeyStatusChange,
          onExpirationUpdated: () => {},
          onEvent: () => {}
        });

        drmEngine.configure(config.drm);

        var playerInterface = {
          networkingEngine: netEngine,
          filterAllPeriods: (periods) => {
            this.filterAllPeriods_(drmEngine, periods);
          },
          filterNewPeriod: (period) => {
            this.filterPeriod_(drmEngine, period);
          },
          onTimelineRegionAdded: function() {},
          onEvent: function() {},
          onError: onError
        };

        manifestParser = new factory();
        manifestParser.configure(config.manifest);
        return manifestParser.start(manifestUri, playerInterface);
      }.bind(this))
      .then(function(data) {
        this.checkDestroyed_();
        manifest = data;
        return drmEngine.init(manifest, this.config_.usePersistentLicense);
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
        if (manifestParser)
          return manifestParser.stop().then(function() { throw error; });
        else
          throw error;
      });
};


/**
 * The default track selection function.
 *
 * @param {!Array.<shakaExtern.Track>} tracks
 * @return {!Array.<shakaExtern.Track>}
 * @private
 */
shaka.offline.Storage.prototype.defaultTrackSelect_ = function(tracks) {
  var LanguageUtils = shaka.util.LanguageUtils;
  var ContentType = shaka.util.ManifestParserUtils.ContentType;

  var selectedTracks = [];

  // Select variants with best language match.
  var audioLangPref = LanguageUtils.normalize(
      this.player_.getConfiguration().preferredAudioLanguage);
  var matchTypes = [
    LanguageUtils.MatchType.EXACT,
    LanguageUtils.MatchType.BASE_LANGUAGE_OKAY,
    LanguageUtils.MatchType.OTHER_SUB_LANGUAGE_OKAY
  ];
  var allVariantTracks =
      tracks.filter(function(track) { return track.type == 'variant'; });
  // For each match type, get the tracks that match the audio preference for
  // that match type.
  var tracksByMatchType = matchTypes.map(function(match) {
    return allVariantTracks.filter(function(track) {
      var lang = LanguageUtils.normalize(track.language);
      return LanguageUtils.match(match, audioLangPref, lang);
    });
  });

  // Find the best match type that has any matches.
  var variantTracks;
  for (var i = 0; i < tracksByMatchType.length; i++) {
    if (tracksByMatchType[i].length) {
      variantTracks = tracksByMatchType[i];
      break;
    }
  }

  // Fall back to "primary" audio tracks, if present.
  if (!variantTracks) {
    var primaryTracks = allVariantTracks.filter(function(track) {
      return track.primary;
    });
    if (primaryTracks.length)
      variantTracks = primaryTracks;
  }

  // Otherwise, there is no good way to choose the language, so we don't choose
  // a language at all.
  if (!variantTracks) {
    variantTracks = allVariantTracks;
    // Issue a warning, but only if the content has multiple languages.
    // Otherwise, this warning would just be noise.
    var languages = allVariantTracks
        .map(function(track) { return track.language; })
        .filter(shaka.util.Functional.isNotDuplicate);
    if (languages.length > 1) {
      shaka.log.warning('Could not choose a good audio track based on ' +
                        'language preferences or primary tracks.  An ' +
                        'arbitrary language will be stored!');
    }
  }

  // From previously selected variants, choose the SD ones (height <= 480).
  var tracksByHeight = variantTracks.filter(function(track) {
    return track.height && track.height <= 480;
  });

  // If variants don't have video or no video with height <= 480 was
  // found, proceed with the previously selected tracks.
  if (tracksByHeight.length) {
    // Sort by resolution, then select all variants which match the height
    // of the highest SD res.  There may be multiple audio bitrates for the
    // same video resolution.
    tracksByHeight.sort(function(a, b) { return b.height - a.height; });
    variantTracks = tracksByHeight.filter(function(track) {
      return track.height == tracksByHeight[0].height;
    });
  }

  // Now sort by bandwidth.
  variantTracks.sort(function(a, b) { return a.bandwidth - b.bandwidth; });

  // In case there are multiple matches at different audio bitrates, select the
  // middle bandwidth one.
  if (variantTracks.length)
    selectedTracks.push(variantTracks[Math.floor(variantTracks.length / 2)]);

  // Since this default callback is used primarily by our own demo app and by
  // app developers who haven't thought about which tracks they want, we should
  // select all text tracks, regardless of language.  This makes for a better
  // demo for us, and does not rely on user preferences for the unconfigured
  // app.
  selectedTracks.push.apply(selectedTracks, tracks.filter(function(track) {
    return track.type == ContentType.TEXT;
  }));

  return selectedTracks;
};


/**
 * @return {shakaExtern.OfflineConfiguration}
 * @private
 */
shaka.offline.Storage.prototype.defaultConfig_ = function() {
  return {
    trackSelectionCallback: this.defaultTrackSelect_.bind(this),
    progressCallback: function(storedContent, percent) {
      // Reference arguments to keep closure from removing it.
      // If the argument is removed, it breaks our function length check
      // in mergeConfigObjects_().
      // NOTE: Chrome App Content Security Policy prohibits usage of new
      // Function().
      if (storedContent || percent) return null;
    },
    usePersistentLicense: true
  };
};


/**
 * Initializes the IStorageEngine if it is not already.
 *
 * @return {!Promise}
 * @private
 */
shaka.offline.Storage.prototype.initIfNeeded_ = function() {
  if (!shaka.offline.Storage.support()) {
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.STORAGE_NOT_SUPPORTED));
  }

  if (this.storageEngine_) {
    return Promise.resolve();
  }

  goog.asserts.assert(this.player_, 'Player must be initialized');
  /** @type {shaka.net.NetworkingEngine} */
  var netEngine = this.player_.getNetworkingEngine();
  /** @type {shakaExtern.RetryParameters} */
  var retryParams = this.player_.getConfiguration().streaming.retryParameters;

  return shaka.offline.StorageEngineFactory.createStorageEngine()
      .then(function(storageEngine) {
        goog.asserts.assert(netEngine, 'Need valid networking engine.');
        goog.asserts.assert(storageEngine, 'Need valid storage engine.');

        // Save this instance of later use in other methods.
        this.storageEngine_ = storageEngine;

        this.downloadManager_ = new shaka.offline.DownloadManager(
            storageEngine,
            netEngine,
            retryParams);
        this.downloadManager_.followProgress(function(progress, size) {
          /** @type {?shakaExtern.StoredContent} */
          var content = this.pendingContent_;

          goog.asserts.assert(
              content,
              'Need stored content to be set when updating download progress.');

          // Update the size of the stored content before issuing a
          // progress update.
          content.size = size;

          this.config_.progressCallback(content, progress);
        }.bind(this));
      }.bind(this));
};


/**
 * @param {!shaka.media.DrmEngine} drmEngine
 * @param {!Array.<shakaExtern.Period>} periods
 * @private
 */
shaka.offline.Storage.prototype.filterAllPeriods_ = function(
    drmEngine, periods) {
  periods.forEach((period) => this.filterPeriod_(drmEngine, period));
};


/**
 * @param {!shaka.media.DrmEngine} drmEngine
 * @param {shakaExtern.Period} period
 * @private
 */
shaka.offline.Storage.prototype.filterPeriod_ = function(drmEngine, period) {
  const StreamUtils = shaka.util.StreamUtils;

  /** @const */
  var maxHwRes = { width: Infinity, height: Infinity };

  /** @type {?shakaExtern.Variant} */
  var variant = null;

  if (this.firstPeriodTracks_) {
    var variantTrack = this.firstPeriodTracks_.filter(function(track) {
      return track.type == 'variant';
    })[0];

    if (variantTrack) {
      variant = StreamUtils.findVariantForTrack(period, variantTrack);
    }
  }

  /** @type {?shakaExtern.Stream} */
  var activeAudio = null;
  /** @type {?shakaExtern.Stream} */
  var activeVideo = null;

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
      period, this.player_.getConfiguration().restrictions, maxHwRes);
};


/**
 * Calls createSegmentIndex for all streams in the manifest.
 *
 * @param {shakaExtern.Manifest} manifest
 * @return {!Promise}
 * @private
 */
shaka.offline.Storage.prototype.createSegmentIndex_ = function(manifest) {
  var Functional = shaka.util.Functional;
  var streams = manifest.periods
      .map(function(period) { return period.variants; })
      .reduce(Functional.collapseArrays, [])
      .map(function(variant) {
        var variantStreams = [];
        if (variant.audio) variantStreams.push(variant.audio);
        if (variant.video) variantStreams.push(variant.video);
        return variantStreams;
      })
      .reduce(Functional.collapseArrays, [])
      .filter(Functional.isNotDuplicate);

  var textStreams = manifest.periods
      .map(function(period) { return period.textStreams; })
      .reduce(Functional.collapseArrays, []);

  streams.push.apply(streams, textStreams);
  return Promise.all(
      streams.map(function(stream) { return stream.createSegmentIndex(); }));
};


/**
 * Creates an offline 'manifest' for the real manifest.  This does not store
 * the segments yet, only adds them to the download manager through
 * createPeriod_.
 *
 * @param {!shaka.media.DrmEngine} drmEngine
 * @param {shakaExtern.Manifest} manifest
 * @param {string} originalManifestUri
 * @param {!Object} metadata
 * @return {shakaExtern.ManifestDB}
 * @private
 */
shaka.offline.Storage.prototype.createOfflineManifest_ = function(
    drmEngine, manifest, originalManifestUri, metadata) {
  let periods = manifest.periods.map((period) => {
    return this.createPeriod_(drmEngine, manifest, period);
  });

  let drmInfo = drmEngine.getDrmInfo();
  let sessions = drmEngine.getSessionIds();

  if (drmInfo && this.config_.usePersistentLicense) {
    if (!sessions.length) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL, shaka.util.Error.Category.STORAGE,
          shaka.util.Error.Code.NO_INIT_DATA_FOR_OFFLINE, originalManifestUri);
    }
    // Don't store init data since we have stored sessions.
    drmInfo.initData = [];
  }

  return {
    originalManifestUri: originalManifestUri,
    duration: manifest.presentationTimeline.getDuration(),
    size: 0,
    expiration: drmEngine.getExpiration(),
    periods: periods,
    sessionIds: this.config_.usePersistentLicense ? sessions : [],
    drmInfo: drmInfo,
    appMetadata: metadata
  };
};


/**
 * Converts a manifest Period to a database Period.  This will use the current
 * configuration to get the tracks to use, then it will search each segment
 * index and add all the segments to the download manager through createStream_.
 *
 * @param {!shaka.media.DrmEngine} drmEngine
 * @param {shakaExtern.Manifest} manifest
 * @param {shakaExtern.Period} period
 * @return {shakaExtern.PeriodDB}
 * @private
 */
shaka.offline.Storage.prototype.createPeriod_ = function(
    drmEngine, manifest, period) {
  const StreamUtils = shaka.util.StreamUtils;

  var variantTracks = StreamUtils.getVariantTracks(period, null, null);
  var textTracks = StreamUtils.getTextTracks(period, null);
  var allTracks = variantTracks.concat(textTracks);

  var chosenTracks = this.config_.trackSelectionCallback(allTracks);

  if (this.firstPeriodTracks_ == null) {
    this.firstPeriodTracks_ = chosenTracks;
    // Now that the first tracks are chosen, filter again.  This ensures all
    // Periods have compatible content types.
    this.filterAllPeriods_(drmEngine, manifest.periods);
  }

  for (var i = chosenTracks.length - 1; i > 0; --i) {
    var foundSimilarTracks = false;
    for (var j = i - 1; j >= 0; --j) {
      if (chosenTracks[i].type == chosenTracks[j].type &&
          chosenTracks[i].kind == chosenTracks[j].kind &&
          chosenTracks[i].language == chosenTracks[j].language) {
        shaka.log.warning(
            'Multiple tracks of the same type/kind/language given.');
        foundSimilarTracks = true;
        break;
      }
    }
    if (foundSimilarTracks) break;
  }

  var streams = [];

  for (var i = 0; i < chosenTracks.length; i++) {
    var variant = StreamUtils.findVariantForTrack(period, chosenTracks[i]);
    if (variant) {
      // Make a rough estimation of the streams' bandwidth so download manager
      // can track the progress of the download.
      var bandwidthEstimation;
      if (variant.audio) {
        // If the audio stream has already been added to the DB
        // as part of another variant, add the ID to the list.
        // Otherwise, add it to the DB.
        var stream = streams.filter(function(s) {
          return s.id == variant.audio.id;
        })[0];
        if (stream) {
          stream.variantIds.push(variant.id);
        } else {
          // If variant has both audio and video, roughly estimate them
          // both to be 1/2 of the variant's bandwidth.
          // If variant only has one stream, it's bandwidth equals to
          // the bandwidth of the variant.
          bandwidthEstimation =
              variant.video ? variant.bandwidth / 2 : variant.bandwidth;
          streams.push(this.createStream_(
              manifest,
              period,
              variant.audio,
              bandwidthEstimation,
              variant.id));
        }
      }
      if (variant.video) {
        var stream = streams.filter(function(s) {
          return s.id == variant.video.id;
        })[0];
        if (stream) {
          stream.variantIds.push(variant.id);
        } else {
          bandwidthEstimation =
              variant.audio ? variant.bandwidth / 2 : variant.bandwidth;
          streams.push(this.createStream_(
              manifest,
              period,
              variant.video,
              bandwidthEstimation,
              variant.id));
        }
      }
    } else {
      var textStream =
          StreamUtils.findTextStreamForTrack(period, chosenTracks[i]);
      goog.asserts.assert(
          textStream, 'Could not find track with id ' + chosenTracks[i].id);
      streams.push(this.createStream_(
          manifest, period, textStream, 0 /* estimatedStreamBandwidth */));
    }
  }

  return {
    startTime: period.startTime,
    streams: streams
  };
};


/**
 * Converts a manifest stream to a database stream.  This will search the
 * segment index and add all the segments to the download manager.
 *
 * @param {shakaExtern.Manifest} manifest
 * @param {shakaExtern.Period} period
 * @param {shakaExtern.Stream} stream
 * @param {number} estimatedStreamBandwidth
 * @param {number=} opt_variantId
 * @return {shakaExtern.StreamDB}
 * @private
 */
shaka.offline.Storage.prototype.createStream_ = function(
    manifest, period, stream, estimatedStreamBandwidth, opt_variantId) {
  /** @type {shakaExtern.StreamDB} */
  var streamDb = {
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
    variantIds: []
  };

  if (opt_variantId != null) {
    streamDb.variantIds.push(opt_variantId);
  }

  /** @type {number} */
  let startTime =
      manifest.presentationTimeline.getSegmentAvailabilityStart();

  shaka.offline.Storage.forEachSegment_(stream, startTime, function(segment) {
    /** @type {number} */
    var startTime = segment.startTime;
    /** @type {number} */
    var endTime = segment.endTime;
    /** @type {number} */
    var duration = endTime - startTime;
    /** @type {number} */
    var bandwidthSize = duration * estimatedStreamBandwidth / 8;

    this.downloadManager_.addSegment(
        stream.type,
        segment,
        bandwidthSize,
        function(id) {
          /** @type {shakaExtern.SegmentDB} */
          var segmentDb = {
            startTime: startTime,
            endTime: endTime,
            dataKey: id
          };

          streamDb.segments.push(segmentDb);
        });
  }.bind(this));

  var initSegment = stream.initSegmentReference;
  if (initSegment) {
    /** @const {number} */
    var noBandwidth = 0;

    this.downloadManager_.addSegment(
        stream.contentType,
        initSegment,
        noBandwidth,
        function(id) {
          streamDb.initSegmentKey = id;
        });
  }

  return streamDb;
};


/**
 * @param {shakaExtern.Stream} stream
 * @param {number} startTime
 * @param {!function(shaka.media.SegmentReference)} callback
 * @private
 */
shaka.offline.Storage.forEachSegment_ = function(stream, startTime, callback) {
  /** @type {?number} */
  var i = stream.findSegmentPosition(startTime);
  /** @type {?shaka.media.SegmentReference} */
  var ref = i == null ? null : stream.getSegmentReference(i);

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
 * @param {shakaExtern.ManifestDB} manifest
 * @return {!Array.<number>}
 * @private
 */
shaka.offline.Storage.getAllSegmentIds_ = function(manifest) {
  /** @type {!Array.<number>} */
  var ids = [];

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
 * Execute operations with an instance of storage engine and clean-up the
 * storage engine after the call completes (regardless of success).
 *
 * @param {function(!shaka.offline.IStorageEngine):!Promise<T>} callback
 * @return {!Promise.<T>}
 * @template T
 * @private
 */
shaka.offline.Storage.withStorageEngine_ = function(callback) {
  const StorageEngineFactory = shaka.offline.StorageEngineFactory;

  return StorageEngineFactory.createStorageEngine().then((storage) => {
    return callback(storage).then(
      (r) => storage.destroy().then(() => r),
      (e) => storage.destroy().then(() => { throw e; }));
  });
};


/**
 * Delete the on-disk storage and all the content it contains. This should not
 * be done regularly; only do it when storage is rendered unusable.
 *
 * @return {!Promise}
 * @export
 */
shaka.offline.Storage.deleteAll = function() {
  return shaka.offline.StorageEngineFactory.deleteStorage();
};



shaka.Player.registerSupportPlugin('offline', shaka.offline.Storage.support);
