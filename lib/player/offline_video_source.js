/**
 * @license
 * Copyright 2015 Google Inc.
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

goog.provide('shaka.player.OfflineVideoSource');

goog.require('goog.Uri');
goog.require('shaka.asserts');
goog.require('shaka.dash.MpdProcessor');
goog.require('shaka.dash.MpdRequest');
goog.require('shaka.dash.mpd');
goog.require('shaka.features');
goog.require('shaka.log');
goog.require('shaka.media.EmeManager');
goog.require('shaka.media.IAbrManager');
goog.require('shaka.media.OfflineSegmentIndexSource');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SimpleAbrManager');
goog.require('shaka.media.StreamInfo');
goog.require('shaka.player.StreamVideoSource');
goog.require('shaka.util.ContentDatabaseReader');
goog.require('shaka.util.ContentDatabaseWriter');
goog.require('shaka.util.FailoverUri');
goog.require('shaka.util.IBandwidthEstimator');
goog.require('shaka.util.TypedBind');
goog.require('shaka.util.Uint8ArrayUtils');



/**
 * Creates an OfflineVideoSource.
 * @param {?number} groupId The unique ID of the group of streams
 *    in this source.
 * @param {shaka.util.IBandwidthEstimator} estimator
 * @param {shaka.media.IAbrManager} abrManager
 *
 * @struct
 * @constructor
 * @extends {shaka.player.StreamVideoSource}
 * @exportDoc
 */
shaka.player.OfflineVideoSource = function(groupId, estimator, abrManager) {
  if (!estimator) {
    // For backward compatibility, provide an instance of the default
    // implementation if none is provided.
    estimator = new shaka.util.EWMABandwidthEstimator();
  }
  if (!abrManager) {
    abrManager = new shaka.media.SimpleAbrManager();
  }

  shaka.player.StreamVideoSource.call(this, null, estimator, abrManager);

  /** @private {?number} */
  this.groupId_ = groupId;

  /** @private {!Array.<string>} */
  this.sessionIds_ = [];

  /**
   * The timeout, in milliseconds, for downloading and storing offline licenses
   * for encrypted content.
   * @type {number}
   * @expose
   */
  this.timeoutMs = 30000;

  /** @private {!Object.<string, *>} */
  this.config_ = {};

  /** @private {shaka.util.FailoverUri.NetworkCallback} */
  this.networkCallback_ = null;

  /** @private {shaka.player.DrmInfo.Config} */
  this.overrideConfig_ = null;
};
goog.inherits(shaka.player.OfflineVideoSource, shaka.player.StreamVideoSource);
if (shaka.features.Offline) {
  goog.exportSymbol('shaka.player.OfflineVideoSource',
                    shaka.player.OfflineVideoSource);
}


/**
 * A callback to the application to choose the tracks which will be stored
 * offline.  Returns a Promise to an array of track IDs.  This uses Promises
 * so that the application can, if it chooses, display some dialog to the user
 * to drive the choice of tracks.
 *
 * @typedef {function():!Promise.<!Array.<number>>}
 * @expose
 */
shaka.player.OfflineVideoSource.ChooseTracksCallback;


/**
 * Configures the OfflineVideoSource options.
 * Options are set via key-value pairs.
 *
 * The following configuration options are supported:
 *  licenseRequestTimeout: number
 *    Sets the license request timeout in seconds.
 *  mpdRequestTimeout: number
 *    Sets the MPD request timeout in seconds.
 *  segmentRequestTimeout: number
 *    Sets the segment request timeout in seconds.
 *
 * @example
 *     offlineVideoSouce.configure({'licenseRequestTimeout': 20});
 *
 * @param {!Object.<string, *>} config A configuration object, which contains
 *     the configuration options as key-value pairs. All fields should have
 *     already been validated.
 * @override
 */
shaka.player.OfflineVideoSource.prototype.configure = function(config) {
  if (config['licenseRequestTimeout'] != null) {
    this.config_['licenseRequestTimeout'] = config['licenseRequestTimeout'];
  }
  if (config['segmentRequestTimeout'] != null) {
    this.config_['segmentRequestTimeout'] = config['segmentRequestTimeout'];
  }
  var baseClassConfigure = shaka.player.StreamVideoSource.prototype.configure;
  baseClassConfigure.call(this, config);
};


/**
 * Retrieves an array of all stored group IDs.
 * @return {!Promise.<!Array.<number>>} The unique IDs of all of the
 *    stored groups.
 * @exportDoc
 */
shaka.player.OfflineVideoSource.retrieveGroupIds = function() {
  var contentDatabase = new shaka.util.ContentDatabaseReader();

  var p = contentDatabase.setUpDatabase().then(
      function() {
        return contentDatabase.retrieveGroupIds();
      });

  p.then(
      function() {
        contentDatabase.closeDatabaseConnection();
      }
  ).catch(
      function() {
        contentDatabase.closeDatabaseConnection();
      }
  );

  return p;
};
if (shaka.features.Offline) {
  goog.exportSymbol('shaka.player.OfflineVideoSource.retrieveGroupIds',
                    shaka.player.OfflineVideoSource.retrieveGroupIds);
}


/**
 * Stores the content described by the MPD for offline playback.
 * @param {string} mpdUrl The MPD URL.
 * @param {string} preferredLanguage The user's preferred language tag.
 * @param {?shaka.player.DashVideoSource.ContentProtectionCallback}
 *     interpretContentProtection A callback to interpret the ContentProtection
 *     elements in the MPD.
 * @param {shaka.player.OfflineVideoSource.ChooseTracksCallback} chooseTracks
 * @return {!Promise.<number>} The group ID of the stored content.
 * @exportDoc
 */
shaka.player.OfflineVideoSource.prototype.store = function(
    mpdUrl, preferredLanguage, interpretContentProtection, chooseTracks) {
  var emeManager;
  var error = null;

  /** @type {!Object.<number, !shaka.media.StreamInfo>} */
  var streamIdMap = {};

  /** @type {!Array.<!shaka.media.StreamInfo>} */
  var selectedStreams = [];

  var failover = new shaka.util.FailoverUri(this.networkCallback_,
                                            [new goog.Uri(mpdUrl)]);
  var mpdRequest = new shaka.dash.MpdRequest(failover, this.mpdRequestTimeout);

  return mpdRequest.send().then(shaka.util.TypedBind(this,
      /** @param {!shaka.dash.mpd.Mpd} mpd */
      function(mpd) {
        var mpdProcessor =
            new shaka.dash.MpdProcessor(interpretContentProtection);
        this.manifestInfo = mpdProcessor.process(mpd, this.networkCallback_);

        if (this.manifestInfo.live) {
          var error = new Error('Unable to store live streams offline.');
          error.type = 'app';
          return Promise.reject(error);
        }

        this.configure({'preferredLanguage': preferredLanguage});
        var baseClassLoad = shaka.player.StreamVideoSource.prototype.load;
        return baseClassLoad.call(this);
      })
  ).then(shaka.util.TypedBind(this,
      function() {
        var fakeVideoElement = /** @type {!HTMLVideoElement} */ (
            document.createElement('video'));
        fakeVideoElement.src = window.URL.createObjectURL(this.mediaSource);

        emeManager =
            new shaka.media.EmeManager(null, fakeVideoElement, this);
        if (this.config_['licenseRequestTimeout'] != null) {
          emeManager.setLicenseRequestTimeout(
              Number(this.config_['licenseRequestTimeout']));
        }
        this.eventManager.listen(
            emeManager, 'sessionReady', this.onSessionReady_.bind(this));
        this.eventManager.listen(emeManager, 'error', function(e) {
          error = e;
        });
        return emeManager.initialize();
      })
  ).then(shaka.util.TypedBind(this,
      function() {
        // Build a map of stream IDs.
        var streamSetInfos = this.streamSetsByType.getAll();
        for (var i = 0; i < streamSetInfos.length; ++i) {
          var streamSetInfo = streamSetInfos[i];
          for (var j = 0; j < streamSetInfo.streamInfos.length; ++j) {
            var streamInfo = streamSetInfo.streamInfos[j];
            streamIdMap[streamInfo.uniqueId] = streamInfo;
          }
        }

        // Ask the application to choose streams.
        return chooseTracks();
      })
  ).then(shaka.util.TypedBind(this,
      /** @param {!Array.<number>} trackIds */
      function(trackIds) {
        // Map the track IDs back to streams.
        for (var i = 0; i < trackIds.length; ++i) {
          var id = trackIds[i];
          var selectedStream = streamIdMap[id];
          if (selectedStream) {
            selectedStreams.push(selectedStream);
          } else {
            return Promise.reject(new Error('Invalid stream ID chosen: ' + id));
          }
        }

        // Only keep those which are supported types.
        // TODO(natalieharris): Add text support.
        var supportedTypes = ['audio', 'video'];
        selectedStreams = selectedStreams.filter(function(streamInfo) {
          if (supportedTypes.indexOf(streamInfo.getContentType()) < 0) {
            shaka.log.warning('Ignoring track ID ' + streamInfo.uniqueId +
                              ' due to unsupported type: ' +
                              streamInfo.getContentType());
            return false;
          }
          return true;
        });

        var async = selectedStreams.map(
            function(streamInfo) {
              return streamInfo.segmentInitSource.create();
            });
        return Promise.all(async);
      })
  ).then(shaka.util.TypedBind(this,
      /** @param {!Array.<ArrayBuffer>} initDatas */
      function(initDatas) {
        return this.initializeStreams_(selectedStreams, initDatas);
      })
  ).then(shaka.util.TypedBind(this,
      function() {
        return emeManager.allSessionsReady(this.timeoutMs);
      })
  ).then(shaka.util.TypedBind(this,
      function() {
        if (error) {
          return Promise.reject(error);
        }

        var drmInfo = emeManager.getDrmInfo();
        // TODO(story 1890046): Support multiple periods.
        var duration = this.manifestInfo.periodInfos[0].duration;
        if (!duration) {
          shaka.log.warning('The duration of the stream being stored is null.');
        }
        shaka.asserts.assert(duration != Number.POSITIVE_INFINITY);

        return this.insertGroup_(selectedStreams, drmInfo, duration);
      })
  ).then(shaka.util.TypedBind(this,
      /** @param {number} i */
      function(i) {
        this.groupId_ = i;
        if (error) {
          this.deleteGroupContent_();
          return Promise.reject(error);
        }

        return Promise.resolve(i);
      })
  );
};
if (shaka.features.Offline && shaka.features.Dash) {
  goog.exportSymbol('shaka.player.OfflineVideoSource.prototype.store',
                    shaka.player.OfflineVideoSource.prototype.store);
}


/**
 * Sets the callback used to intercept the URL in network requests.
 *
 * @param {!shaka.util.FailoverUri.NetworkCallback} callback
 * @export
 */
shaka.player.OfflineVideoSource.prototype.setNetworkCallback =
    function(callback) {
  this.networkCallback_ = callback;
};


/**
 * Creates sourceBuffers and appends init data for each of the given streams.
 * This should trigger encrypted events for any encrypted streams.
 * @param {!Array.<!shaka.media.StreamInfo>} streamInfos The streams to
 *    initialize.
 * @param {!Array.<ArrayBuffer>} initDatas |streamInfos| corresponding
 *     initialization data.
 * @return {!Promise}
 * @private
 */
shaka.player.OfflineVideoSource.prototype.initializeStreams_ =
    function(streamInfos, initDatas) {
  shaka.asserts.assert(streamInfos.length == initDatas.length);

  var sourceBuffers = [];
  for (var i = 0; i < streamInfos.length; ++i) {
    try {
      var fullMimeType = streamInfos[i].getFullMimeType();
      sourceBuffers[i] = this.mediaSource.addSourceBuffer(fullMimeType);
    } catch (exception) {
      shaka.log.error('addSourceBuffer() failed', exception);
    }
  }

  if (streamInfos.length != sourceBuffers.length) {
    var error = new Error('Error initializing streams.');
    error.type = 'storage';
    return Promise.reject(error);
  }

  for (var i = 0; i < initDatas.length; ++i) {
    var initData = initDatas[i];
    if (initData) {
      sourceBuffers[i].appendBuffer(initData);
    }
  }

  return Promise.resolve();
};


/**
 * Event handler for sessionReady events.
 * @param {Event} event A sessionReady event.
 * @private
 */
shaka.player.OfflineVideoSource.prototype.onSessionReady_ = function(event) {
  var session = /** @type {MediaKeySession} */ (event.detail);
  this.sessionIds_.push(session.sessionId);
};


/**
 * Inserts a group of streams into the database.
 * @param {!Array.<!shaka.media.StreamInfo>} selectedStreams The streams to
 *    insert.
 * @param {shaka.player.DrmInfo} drmInfo
 * @param {?number} duration The duration of the entire stream.
 * @return {!Promise.<number>} The unique id assigned to the group.
 * @private
 */
shaka.player.OfflineVideoSource.prototype.insertGroup_ =
    function(selectedStreams, drmInfo, duration) {
  var contentDatabase =
      new shaka.util.ContentDatabaseWriter(this.estimator, this);
  if (this.config_['segmentRequestTimeout'] != null) {
    contentDatabase.setSegmentRequestTimeout(
        Number(this.config_['segmentRequestTimeout']));
  }

  // Insert the group of streams into the database and close the connection.
  return contentDatabase.setUpDatabase().then(shaka.util.TypedBind(this,
      function() {
        return contentDatabase.insertGroup(
            selectedStreams, this.sessionIds_, duration, drmInfo);
      })
  ).then(
      /** @param {number} groupId */
      function(groupId) {
        contentDatabase.closeDatabaseConnection();
        return Promise.resolve(groupId);
      }
  ).catch(
      /** @param {*} e */
      function(e) {
        contentDatabase.closeDatabaseConnection();
        return Promise.reject(e);
      }
  );
};


/** @override */
shaka.player.OfflineVideoSource.prototype.load = function() {
  shaka.asserts.assert(this.groupId_ >= 0);
  var contentDatabase = new shaka.util.ContentDatabaseReader();
  var duration, config;

  return contentDatabase.setUpDatabase().then(shaka.util.TypedBind(this,
      function() {
        return contentDatabase.retrieveGroup(
            /** @type {number} */(this.groupId_));
      })
  ).then(shaka.util.TypedBind(this,
      /** @param {shaka.util.ContentDatabase.GroupInformation} group */
      function(group) {
        var async = [];
        this.sessionIds_ = group['session_ids'];
        duration = group['duration'];
        config = {
          'keySystem': group['key_system'],
          'distinctiveIdentifierRequired': group['distinctive_identifier'],
          'persistentStorageRequired': true,
          'audioRobustness': group['audio_robustness'],
          'videoRobustness': group['video_robustness'],
          'withCredentials': group['with_credentials'],
          'licenseServerUrl': group['license_server']
        };
        for (var i = 0; i < group['stream_ids'].length; ++i) {
          var streamId = group['stream_ids'][i];
          async.push(contentDatabase.retrieveStreamIndex(streamId));
        }
        return Promise.all(async);
      })
  ).then(shaka.util.TypedBind(this,
      /** @param {!Array.<shaka.util.ContentDatabase.StreamIndex>} indexes */
      function(indexes) {
        this.manifestInfo =
            this.reconstructManifestInfo_(indexes, duration, config);

        var baseClassLoad = shaka.player.StreamVideoSource.prototype.load;
        return baseClassLoad.call(this);
      })
  ).then(
      function() {
        contentDatabase.closeDatabaseConnection();
        return Promise.resolve();
      }
  ).catch(
      /** @param {*} e */
      function(e) {
        contentDatabase.closeDatabaseConnection();
        return Promise.reject(e);
      }
  );
};


/**
 * Reconstructs a ManifestInfo object with data from storage.
 * @param {!Array.<shaka.util.ContentDatabase.StreamIndex>} indexes The indexes
 *    of the streams in this manifest.
 * @param {number} duration The max stream's entire duration in the group.
 * @param {shaka.player.DrmInfo.Config} config The config info loaded from
 *     storage.
 * @return {!shaka.media.ManifestInfo}
 * @private
 */
shaka.player.OfflineVideoSource.prototype.reconstructManifestInfo_ =
    function(indexes, duration, config) {
  var manifestInfo = new shaka.media.ManifestInfo();
  manifestInfo.minBufferTime = 5;
  // TODO(story 1890046): Support multiple periods.
  var periodInfo = new shaka.media.PeriodInfo();

  for (var i = 0; i < indexes.length; ++i) {
    var storedStreamInfo = indexes[i];

    // Will only have one streamInfo per streamSetInfo stored.
    var streamInfo = new shaka.media.StreamInfo();

    var segmentIndexSource = new shaka.media.OfflineSegmentIndexSource(
        storedStreamInfo['references']);

    var initData = new Uint8Array(storedStreamInfo['init_segment']);
    // TODO: Use idb:// URI directly instead of transforming into a data URI.
    var segmentInitUrl =
        new goog.Uri('data:application/octet-stream;base64,' +
                     shaka.util.Uint8ArrayUtils.toBase64(initData));
    var segmentInitSource = new shaka.media.SegmentInitSource(
        new shaka.util.FailoverUri(this.networkCallback_, [segmentInitUrl],
                                   0, null));

    streamInfo.segmentIndexSource = segmentIndexSource;
    streamInfo.segmentInitSource = segmentInitSource;
    streamInfo.mimeType = storedStreamInfo['mime_type'];
    streamInfo.codecs = storedStreamInfo['codecs'];
    streamInfo.allowedByKeySystem = true;

    if (this.overrideConfig_) {
      if (this.overrideConfig_['licenseServerUrl'] != null) {
        config['licenseServerUrl'] = this.overrideConfig_['licenseServerUrl'];
      }
      if (this.overrideConfig_['withCredentials'] != null) {
        config['withCredentials'] = this.overrideConfig_['withCredentials'];
      }
      config['licensePostProcessor'] =
          this.overrideConfig_['licensePostProcessor'];
      config['licensePreProcessor'] =
          this.overrideConfig_['licensePreProcessor'];
      config['serverCertificate'] = this.overrideConfig_['serverCertificate'];
    }

    var drmInfo = shaka.player.DrmInfo.createFromConfig(config);
    var streamSetInfo = new shaka.media.StreamSetInfo();
    streamSetInfo.streamInfos.push(streamInfo);
    streamSetInfo.drmInfos.push(drmInfo);
    streamSetInfo.contentType = streamInfo.mimeType.split('/')[0];
    periodInfo.streamSetInfos.push(streamSetInfo);
    periodInfo.duration = duration;
  }
  manifestInfo.periodInfos.push(periodInfo);
  return manifestInfo;
};


/**
 * Deletes a group of streams from storage.  This destroys the VideoSource.
 *
 * @param {shaka.player.DrmInfo.Config=} opt_config Optional config to override
 *   the values stored.  Can only change |licenseServerUrl|, |withCredentials|,
 *   |serverCertificate|, |licensePreProcessor|, and |licensePostProcessor|.
 * @param {boolean=} opt_forceDelete True to delete the content even if there
 *   is an error when deleting the persistent session.  The error is returned.
 * @return {!Promise.<Error>}
 * @export
 */
shaka.player.OfflineVideoSource.prototype.deleteGroup =
    function(opt_config, opt_forceDelete) {
  shaka.asserts.assert(this.groupId_ >= 0);

  if (opt_config) {
    this.overrideConfig_ = {
      'licenseServerUrl': opt_config['licenseServerUrl'],
      'withCredentials': opt_config['withCredentials'],
      'serverCertificate': opt_config['serverCertificate'],
      'licensePreProcessor': opt_config['licensePreProcessor'],
      'licensePostProcessor': opt_config['licensePostProcessor']
    };
  }

  var error = null;
  return this.deletePersistentSessions_().catch(function(e) {
    if (opt_forceDelete) {
      error = e;
      return Promise.resolve();
    }

    return Promise.reject(e);
  }).then(shaka.util.TypedBind(this, function() {
    return this.deleteGroupContent_();
  })).then(function() {
    return Promise.resolve(error);
  });
};


/** @override */
shaka.player.OfflineVideoSource.prototype.getSessionIds = function() {
  return this.sessionIds_;
};


/** @override */
shaka.player.OfflineVideoSource.prototype.isOffline = function() {
  return true;
};


/**
 * Deletes the offline content from the database for the given |group|.
 *
 * @return {!Promise}
 * @private
 */
shaka.player.OfflineVideoSource.prototype.deleteGroupContent_ = function() {
  var contentDatabase = new shaka.util.ContentDatabaseWriter(null, null);

  return contentDatabase.setUpDatabase().then(shaka.util.TypedBind(this,
      function() {
        return contentDatabase.deleteGroup(
            /** @type {number} */ (this.groupId_));
      })
  ).then(
      function() {
        contentDatabase.closeDatabaseConnection();
        return Promise.resolve();
      }
  ).catch(
      /** @param {*} e */
      function(e) {
        contentDatabase.closeDatabaseConnection();
        return Promise.reject(e);
      });
};


/**
 * Deletes any persistent sessions associated with the |groupId_|.
 *
 * @return {!Promise}
 * @private
 */
shaka.player.OfflineVideoSource.prototype.deletePersistentSessions_ =
    function() {
  var fakeVideoElement = /** @type {!HTMLVideoElement} */ (
      document.createElement('video'));
  fakeVideoElement.src = window.URL.createObjectURL(this.mediaSource);

  var emeManager = new shaka.media.EmeManager(null, fakeVideoElement, this);
  if (this.config_['licenseRequestTimeout'] != null) {
    emeManager.setLicenseRequestTimeout(
        Number(this.config_['licenseRequestTimeout']));
  }

  return this.load().then(function() {
    return emeManager.initialize();
  }).then(shaka.util.TypedBind(this, function() {
    return emeManager.allSessionsReady(this.timeoutMs);
  })).then(function() {
    return emeManager.deleteSessions();
  }).then(shaka.util.TypedBind(this,
      function() {
        emeManager.destroy();
        this.destroy();
        return Promise.resolve();
      })
  ).catch(shaka.util.TypedBind(this,
      /** @param {*} e */
      function(e) {
        emeManager.destroy();
        this.destroy();
        return Promise.reject(e);
      })
  );
};

