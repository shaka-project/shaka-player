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
goog.require('shaka.offline.IStorageEngine');
goog.require('shaka.offline.ManifestConverter');
goog.require('shaka.offline.OfflineUri');
goog.require('shaka.offline.StorageEngineFactory');
goog.require('shaka.offline.StoredContentUtils');
goog.require('shaka.offline.StreamBandwidthEstimator');
goog.require('shaka.util.ConfigUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.Functional');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MapUtils');
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

  /** @private {shaka.Player} */
  this.player_ = player;

  /** @private {?shaka.extern.OfflineConfiguration} */
  this.config_ = this.defaultConfig_();

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
  this.config_ = null;
  this.player_ = null;

  // TODO: Need to wait for whatever current store, remove, or list async
  //       operations that may be in progress to stop/fail before we
  //       resolve this promise.
  return Promise.resolve();
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
 *   {@link shaka.extern.OfflineConfiguration}, but you may omit any field
 *   you do not wish to change.
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
 * @param {!shaka.extern.ManifestParser.Factory=} opt_manifestParserFactory
 * @return {!Promise.<shaka.extern.StoredContent>}  A Promise to a structure
 *   representing what was stored.  The "offlineUri" member is the URI that
 *   should be given to Player.load() to play this piece of content offline.
 *   The "appMetadata" member is the appMetadata argument you passed to store().
 * @export
 */
shaka.offline.Storage.prototype.store = async function(
    manifestUri, opt_appMetadata, opt_manifestParserFactory) {
  // TODO: Create a way for a download to be canceled while being downloaded.
  this.requireSupport_();

  if (this.storeInProgress_) {
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.STORE_ALREADY_IN_PROGRESS));
  }
  this.storeInProgress_ = true;

  /** @type {!Object} */
  let appMetadata = opt_appMetadata || {};

  let error = null;

  let data = await this.loadInternal(
      manifestUri, (e) => { error = e; }, opt_manifestParserFactory);

  let canDownload = !data.manifest.presentationTimeline.isLive() &&
                    !data.manifest.presentationTimeline.isInProgress();

  if (!canDownload) {
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.CANNOT_STORE_LIVE_OFFLINE,
        manifestUri);
  }

  this.checkDestroyed_();
  if (error) { throw error; }

  return shaka.offline.Storage.withStorageEngine_((storage) => {
    return shaka.util.IDestroyable.with(data.drmEngine, async () => {
      try {
        // Re-filter now that DrmEngine is initialized.
        this.filterAllPeriods_(data.drmEngine, data.manifest.periods);

        /** @type {shaka.extern.ManifestDB} */
        let manifestDB = await this.downloadManifest_(
              storage, data.drmEngine, data.manifest, manifestUri, appMetadata);

        let id = await storage.addManifest(manifestDB);
        let uri = shaka.offline.OfflineUri.manifest('mechanism', 'cell', id);

        let content = shaka.offline.StoredContentUtils.fromManifestDB(
            uri, manifestDB);

        return content;
      } catch (e) {
        // We need to remove all the segments that did get into storage as
        // the manifest won't be playable.
        let segmentsToRemove = this.segmentsFromStore_;
        let noop = () => {};
        await storage.removeSegments(segmentsToRemove, noop);

        // If we already had an error, ignore this error to avoid hiding
        // the original error.
        throw error || e;
      } finally {
        this.storeInProgress_ = false;
        this.firstPeriodTracks_ = null;
        this.segmentsFromStore_ = [];
      }
    });
  });
};


/**
 * Create a download manager and download the manifest.
 *
 * @param {!shaka.offline.IStorageEngine} storage
 * @param {!shaka.media.DrmEngine} drm
 * @param {shaka.extern.Manifest} manifest
 * @param {string} uri
 * @param {!Object} metadata
 * @return {!Promise.<shaka.extern.ManifestDB>}
 * @private
 */
shaka.offline.Storage.prototype.downloadManifest_ = function(
    storage, drm, manifest, uri, metadata) {
  const noSize = 0;
  let pendingContent = shaka.offline.StoredContentUtils.fromManifest(
      uri, manifest, noSize, metadata);

  /** @type {!shaka.offline.DownloadManager} */
  let downloader = new shaka.offline.DownloadManager((progress, size) => {
    // Update the size of the stored content before issuing a progress update.
    pendingContent.size = size;
    this.config_.progressCallback(pendingContent, progress);
  });

  /** @type {shaka.extern.ManifestDB} */
  let manifestDB;
  return shaka.util.IDestroyable.with(downloader, () => {
    manifestDB = this.createOfflineManifest_(
        downloader, storage, drm, manifest, uri, metadata);
    return downloader.download(this.getNetEngine_());
  }).then(() => {
    // Update the size before saving it.
    manifestDB.size = pendingContent.size;
    return manifestDB;
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
 * @param {shaka.extern.ManifestDB} manifestDB
 * @return {!Promise}
 * @private
 */
shaka.offline.Storage.prototype.removeFromDRM_ = function(uri, manifestDB) {
  let netEngine = this.getNetEngine_();

  let error;
  let onError = (e) => {
    // Ignore errors if the session was already removed.
    if (e.code != shaka.util.Error.Code.OFFLINE_SESSION_REMOVED) {
      error = e;
    }
  };

  let drmEngine = new shaka.media.DrmEngine({
    netEngine: netEngine,
    onError: onError,
    onKeyStatus: () => {},
    onExpirationUpdated: () => {},
    onEvent: () => {}
  });

  drmEngine.configure(this.player_.getConfiguration().drm);

  let converter = new shaka.offline.ManifestConverter(
      uri.mechanism(), uri.cell());
  let manifest = converter.fromManifestDB(manifestDB);

  return shaka.util.IDestroyable.with(drmEngine, () => {
    return Promise.resolve()
        .then(() => drmEngine.init(manifest, this.config_.usePersistentLicense))
        .then(() => drmEngine.removeSessions(manifestDB.sessionIds));
  }).then(() => { if (error) { throw error; } });
};


/**
 * @param {!shaka.offline.IStorageEngine} storage
 * @param {!shaka.offline.OfflineUri} uri
 * @param {shaka.extern.ManifestDB} manifest
 * @return {!Promise}
 * @private
 */
shaka.offline.Storage.prototype.removeFromStorage_ = function(
    storage, uri, manifest) {
  /** @type {function(shaka.extern.StoredContent, number)} */
  let callback = this.config_.progressCallback;

  /** @type {shaka.extern.StoredContent} */
  let content = shaka.offline.StoredContentUtils.fromManifestDB(
      uri, manifest);

  /** @type {!Array.<number>} */
  let segmentIds = shaka.offline.Storage.getAllSegmentIds_(manifest);

  /** @type {number} */
  let thingsRemoved = 0;
  /** @type {number} */
  let thingsToRemove = segmentIds.length + 1; // The "+ 1" is the manifest.

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
 * @return {!Promise.<!Array.<shaka.extern.StoredContent>>}  A Promise to an
 *   array of structures representing all stored content.  The "offlineUri"
 *   member of the structure is the URI that should be given to Player.load()
 *   to play this piece of content offline.  The "appMetadata" member is the
 *   appMetadata argument you passed to store().
 * @export
 */
shaka.offline.Storage.prototype.list = function() {
  this.requireSupport_();

  /** @type {!Array.<!shaka.extern.StoredContent>} */
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
 * @param {!shaka.extern.ManifestParser.Factory=} opt_manifestParserFactory
 * @return {!Promise.<{
 *   manifest: shaka.extern.Manifest,
 *   drmEngine: !shaka.media.DrmEngine
 * }>}
 */
shaka.offline.Storage.prototype.loadInternal = function(
    manifestUri, onError, opt_manifestParserFactory) {

  let netEngine = this.getNetEngine_();
  let config = this.player_.getConfiguration();

  /** @type {shaka.extern.Manifest} */
  let manifest;
  /** @type {!shaka.media.DrmEngine} */
  let drmEngine;
  /** @type {!shaka.extern.ManifestParser} */
  let manifestParser;

  let onKeyStatusChange = function() {};
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
        if (manifestParser) {
          return manifestParser.stop().then(function() { throw error; });
        } else {
          throw error;
        }
      });
};


/**
 * The default track selection function.
 *
 * @param {!Array.<shaka.extern.Track>} tracks
 * @return {!Array.<shaka.extern.Track>}
 * @private
 */
shaka.offline.Storage.prototype.defaultTrackSelect_ = function(tracks) {
  const LanguageUtils = shaka.util.LanguageUtils;
  const ContentType = shaka.util.ManifestParserUtils.ContentType;

  let selectedTracks = [];

  // Select variants with best language match.
  let audioLangPref = LanguageUtils.normalize(
      this.player_.getConfiguration().preferredAudioLanguage);
  let matchTypes = [
    LanguageUtils.MatchType.EXACT,
    LanguageUtils.MatchType.BASE_LANGUAGE_OKAY,
    LanguageUtils.MatchType.OTHER_SUB_LANGUAGE_OKAY
  ];
  let allVariantTracks =
      tracks.filter(function(track) { return track.type == 'variant'; });
  // For each match type, get the tracks that match the audio preference for
  // that match type.
  let tracksByMatchType = matchTypes.map(function(match) {
    return allVariantTracks.filter(function(track) {
      let lang = LanguageUtils.normalize(track.language);
      return LanguageUtils.match(match, audioLangPref, lang);
    });
  });

  // Find the best match type that has any matches.
  let variantTracks;
  for (let i = 0; i < tracksByMatchType.length; i++) {
    if (tracksByMatchType[i].length) {
      variantTracks = tracksByMatchType[i];
      break;
    }
  }

  // Fall back to "primary" audio tracks, if present.
  if (!variantTracks) {
    let primaryTracks = allVariantTracks.filter(function(track) {
      return track.primary;
    });
    if (primaryTracks.length) {
      variantTracks = primaryTracks;
    }
  }

  // Otherwise, there is no good way to choose the language, so we don't choose
  // a language at all.
  if (!variantTracks) {
    variantTracks = allVariantTracks;
    // Issue a warning, but only if the content has multiple languages.
    // Otherwise, this warning would just be noise.
    let languages = allVariantTracks
        .map(function(track) { return track.language; })
        .filter(shaka.util.Functional.isNotDuplicate);
    if (languages.length > 1) {
      shaka.log.warning('Could not choose a good audio track based on ' +
                        'language preferences or primary tracks.  An ' +
                        'arbitrary language will be stored!');
    }
  }

  // From previously selected variants, choose the SD ones (height <= 480).
  let tracksByHeight = variantTracks.filter(function(track) {
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

  // If there are multiple matches at different audio bitrates, select the
  // middle bandwidth one.
  if (variantTracks.length) {
    selectedTracks.push(variantTracks[Math.floor(variantTracks.length / 2)]);
  }

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
 * @return {shaka.extern.OfflineConfiguration}
 * @private
 */
shaka.offline.Storage.prototype.defaultConfig_ = function() {
  return {
    trackSelectionCallback: this.defaultTrackSelect_.bind(this),
    progressCallback: function(storedContent, percent) {
      // Reference arguments to keep closure from removing them.
      // If the arguments are removed, it breaks our function length check
      // in mergeConfigObjects_().
      // NOTE: Chrome App Content Security Policy prohibits usage of new
      // Function().
      if (storedContent || percent) return null;
    },
    usePersistentLicense: true
  };
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
      period, this.player_.getConfiguration().restrictions, maxHwRes);
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
 * @param {!shaka.offline.IStorageEngine} storage
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

  if (drmInfo && this.config_.usePersistentLicense) {
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
 * @param {!shaka.offline.DownloadManager} downloader
 * @param {!shaka.offline.IStorageEngine} storage
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

  let chosenTracks = this.config_.trackSelectionCallback(allTracks);

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
    streams: shaka.util.MapUtils.values(streamDBs)
  };
};


/**
 * Converts a manifest stream to a database stream.  This will search the
 * segment index and add all the segments to the download manager.
 *
 * @param {!shaka.offline.DownloadManager} downloader
 * @param {!shaka.offline.IStorageEngine} storage
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
    variantIds: []
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
          return storage.addSegment({data: data}).then((id) => {
            this.segmentsFromStore_.push(id);

            streamDb.segments.push({
              startTime: segment.startTime,
              endTime: segment.endTime,
              dataKey: id
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
          return storage.addSegment({data: data}).then((id) => {
            this.segmentsFromStore_.push(id);
            streamDb.initSegmentKey = id;
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
 * @return {!shaka.net.NetworkingEngine}
 * @private
 */
shaka.offline.Storage.prototype.getNetEngine_ = function() {
  let net = this.player_.getNetworkingEngine();
  goog.asserts.assert(net, 'Player must not be destroyed');
  return net;
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
 * Execute operations with an instance of storage engine and clean-up the
 * storage engine after the call completes (regardless of success).
 *
 * @param {function(!shaka.offline.IStorageEngine):!Promise.<T>} callback
 * @return {!Promise.<T>}
 * @template T
 * @private
 */
shaka.offline.Storage.withStorageEngine_ = function(callback) {
  const StorageEngineFactory = shaka.offline.StorageEngineFactory;

  return StorageEngineFactory.createStorageEngine().then((storage) => {
    return shaka.util.IDestroyable.with(storage, () => callback(storage));
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


shaka.Player.registerSupportPlugin('offline', shaka.offline.Storage.support);
