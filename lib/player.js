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

goog.provide('shaka.Player');

goog.require('goog.Uri');
goog.require('goog.asserts');
goog.require('shaka.abr.SimpleAbrManager');
goog.require('shaka.log');
goog.require('shaka.media.DrmEngine');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.media.MediaSourceEngine');
goog.require('shaka.media.Playhead');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.media.StreamingEngine');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.Error');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.Functional');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.PublicPromise');



/**
 * Construct a Player.
 *
 * @param {!HTMLMediaElement} video Any existing TextTracks attached to this
 *     element that were not created by Shaka will be disabled.  A new
 *     TextTrack may be created to display captions or subtitles.
 *
 * @constructor
 * @struct
 * @implements {shaka.util.IDestroyable}
 * @extends {shaka.util.FakeEventTarget}
 * @export
 */
shaka.Player = function(video) {
  shaka.util.FakeEventTarget.call(this);

  /** @private {HTMLMediaElement} */
  this.video_ = video;

  /** @private {TextTrack} */
  this.textTrack_ = null;

  /** @private {shaka.util.EventManager} */
  this.eventManager_ = new shaka.util.EventManager();

  /** @private {shakaExtern.AbrManager} */
  this.defaultAbrManager_ = new shaka.abr.SimpleAbrManager();

  /** @private {shaka.net.NetworkingEngine} */
  this.networkingEngine_ = new shaka.net.NetworkingEngine(
      this.onSegmentDownloaded_.bind(this));

  /** @private {shaka.media.DrmEngine} */
  this.drmEngine_ = null;

  /** @private {MediaSource} */
  this.mediaSource_ = null;

  /** @private {shaka.media.MediaSourceEngine} */
  this.mediaSourceEngine_ = null;

  /** @private {Promise} */
  this.mediaSourceOpen_ = null;

  /** @private {shaka.media.Playhead} */
  this.playhead_ = null;

  /** @private {shaka.media.StreamingEngine} */
  this.streamingEngine_ = null;

  /** @private {shakaExtern.ManifestParser} */
  this.parser_ = null;

  /** @private {?shakaExtern.Manifest} */
  this.manifest_ = null;

  /**
   * Contains an ID for use with creating streams.  The manifest parser should
   * start with small IDs, so this starts with a large one.
   * @private {number}
   */
  this.nextExternalStreamId_ = 1e9;

  /** @private {boolean} */
  this.buffering_ = false;

  /** @private {boolean} */
  this.switchingPeriods_ = true;

  /** @private {boolean} */
  this.loadInProgress_ = false;

  /** @private {!Object.<string, shakaExtern.Stream>} */
  this.deferredSwitches_ = {};

  /** @private {?shakaExtern.PlayerConfiguration} */
  this.config_ = this.defaultConfig_();

  /** @private {!Array.<shakaExtern.StreamChoice>} */
  this.switchHistory_ = [];

  /** @private {number} */
  this.playTime_ = 0;

  /** @private {number} */
  this.bufferingTime_ = 0;

  /** @private {number} */
  this.lastStatUpdateTimestamp_ = 0;

  this.initialize_();
};
goog.inherits(shaka.Player, shaka.util.FakeEventTarget);


/**
 * After destruction, a Player object cannot be used again.
 *
 * @override
 * @export
 */
shaka.Player.prototype.destroy = function() {
  var p = Promise.all([
    this.destroyStreaming_(),
    this.eventManager_ ? this.eventManager_.destroy() : null,
    this.networkingEngine_ ? this.networkingEngine_.destroy() : null
  ]);

  this.video_ = null;
  this.textTrack_ = null;
  this.eventManager_ = null;
  this.defaultAbrManager_ = null;
  this.networkingEngine_ = null;
  this.config_ = null;

  return p;
};


/**
 * @define {string} A version number taken from git at compile time.
 */
goog.define('GIT_VERSION', 'v1.9.9-alpha-debug');


/**
 * @const {string}
 * @export
 */
shaka.Player.version = GIT_VERSION;


/**
 * @event shaka.Player.ErrorEvent
 * @description Fired when a playback error occurs.
 * @property {string} type
 *   'error'
 * @property {!shaka.util.Error} detail
 *   An object which contains details on the error.  The error's 'category' and
 *   'code' properties will identify the specific error that occured.  In an
 *   uncompiled build, you can also use the 'message' and 'stack' properties
 *   to debug.
 * @exportDoc
 */


/**
 * @event shaka.Player.BufferingEvent
 * @description Fired when the player's buffering state changes.
 * @property {string} type
 *   'buffering'
 * @property {boolean} buffering
 *   True when the Player enters the buffering state.
 *   False when the Player leaves the buffering state.
 * @exportDoc
 */


/**
 * @event shaka.Player.TracksChangedEvent
 * @description Fired when the list of tracks changes.
 * @property {string} type
 *   'trackschanged'
 * @exportDoc
 */


/**
 * @event shaka.Player.AdaptationEvent
 * @description Fired when the active tracks change.
 * @property {string} type
 *   'adaptation'
 * @exportDoc
 */


// TODO: SeekRangeChangedEvent


/**
 * Query the browser/platform and the plugins for manifest, media, and DRM
 * support.  Return a Promise to an object with details on what is supported.
 *
 * If returnValue.supported is false, Shaka Player cannot be used at all.
 * In this case, do not construct a Player instance and do not use the library.
 *
 * @return {!Promise.<!shakaExtern.SupportType>}
 * @export
 */
shaka.Player.support = function() {
  // Basic features needed for the library to be usable.
  var basic = !!window.Promise && !!window.Uint8Array &&
              !!Array.prototype.forEach;

  if (basic) {
    var manifest = shaka.media.ManifestParser.support();
    var media = shaka.media.MediaSourceEngine.support();
    return shaka.media.DrmEngine.support().then(function(drm) {
      /** @type {!shakaExtern.SupportType} */
      var support = {
        manifest: manifest,
        media: media,
        drm: drm,
        supported: manifest['basic'] && media['basic'] && drm['basic']
      };
      return support;
    });
  } else {
    // Return something Promise-like so that the application can still check
    // for support.
    return /** @type {!Promise.<!shakaExtern.SupportType>} */({
      'then': function(fn) {
        fn({'supported': false});
      }
    });
  }
};


/**
 * Load a manifest.
 *
 * @param {string} manifestUri
 * @param {number=} opt_startTime Optional start time, in seconds, to begin
 *     playback.  Defaults to 0 for VOD and to the live edge for live.
 * @param {shakaExtern.ManifestParser.Factory=} opt_manifestParserFactory
 *     Optional manifest parser factory to override auto-detection or use an
 *     unregistered parser.
 * @return {!Promise} Resolved when playback can begin.
 * @export
 */
shaka.Player.prototype.load = function(manifestUri, opt_startTime,
                                       opt_manifestParserFactory) {
  var factory = opt_manifestParserFactory;
  var factoryReady = Promise.resolve();
  var extension;

  if (!factory) {
    // Try to choose a manifest parser by file extension.
    var uriObj = new goog.Uri(manifestUri);
    var uriPieces = uriObj.getPath().split('/');
    var uriFilename = uriPieces.pop();
    var filenamePieces = uriFilename.split('.');
    // Only one piece means there is no extension.
    if (filenamePieces.length > 1) {
      extension = filenamePieces.pop().toLowerCase();
      factory = shaka.media.ManifestParser.parsersByExtension[extension];
    }
  }

  if (!factory) {
    // Try to choose a manifest parser by MIME type.
    var headRequest = shaka.net.NetworkingEngine.makeRequest(
        [manifestUri], this.config_.manifest.retryParameters);
    headRequest.method = 'HEAD';
    var type = shaka.net.NetworkingEngine.RequestType.MANIFEST;

    factoryReady = this.networkingEngine_.request(type, headRequest).then(
        function(response) {
          var mimeType = response.headers['content-type'];
          // https://goo.gl/yzKDRx says this header should always be available,
          // but just to be safe:
          if (mimeType) {
            mimeType = mimeType.toLowerCase();
          }
          factory = shaka.media.ManifestParser.parsersByMime[mimeType];
          if (!factory) {
            shaka.log.error(
                'Unable to guess manifest type by file extension ' +
                'or by MIME type.', extension, mimeType);
            return Promise.reject(new shaka.util.Error(
                shaka.util.Error.Category.MANIFEST,
                shaka.util.Error.Code.UNABLE_TO_GUESS_MANIFEST_TYPE,
                manifestUri));
          }
        }, function(error) {
          shaka.log.error('HEAD request to guess manifest type failed!', error);
          return Promise.reject(new shaka.util.Error(
              shaka.util.Error.Category.MANIFEST,
              shaka.util.Error.Code.UNABLE_TO_GUESS_MANIFEST_TYPE,
              manifestUri));
        });
  }

  var manifestReady = factoryReady.then(function() {
    goog.asserts.assert(factory, 'Manifest factory should be set!');
    goog.asserts.assert(this.networkingEngine_,
        'Networking engine should be set!');
    this.parser_ = new factory();
    this.parser_.configure(this.config_.manifest);
    return this.parser_.start(manifestUri,
                              this.networkingEngine_,
                              this.filterPeriod_.bind(this),
                              this.onError_.bind(this));
  }.bind(this)).then(function(manifest) {
    this.manifest_ = manifest;
    this.lastStatUpdateTimestamp_ = Date.now() / 1000;
  }.bind(this));

  var unloaded = Promise.resolve();
  if (this.video_.src) {
    unloaded = this.unload();
  }

  this.loadInProgress_ = true;
  return Promise.all([unloaded, manifestReady]).then(function() {
    // TODO: Write unit tests for unload() and destroy() interrupting load().
    goog.asserts.assert(this.manifest_, 'Manifest should be set!');
    this.drmEngine_ = this.createDrmEngine();
    this.drmEngine_.configure(this.config_.drm);
    return this.drmEngine_.init(this.manifest_, false /* offline */);
  }.bind(this)).then(function() {
    // Re-filter the manifest after DRM has been initialized.
    this.manifest_.periods.forEach(this.filterPeriod_.bind(this));

    // Wait for MediaSource to open before continuing.
    return Promise.all([
      this.drmEngine_.attach(this.video_),
      this.mediaSourceOpen_
    ]);
  }.bind(this)).then(function() {
    // MediaSource is open, so create the Playhead, MediaSourceEngine, and
    // StreamingEngine.
    this.playhead_ = this.createPlayhead(opt_startTime);
    this.mediaSourceEngine_ = this.createMediaSourceEngine();

    this.streamingEngine_ = this.createStreamingEngine();
    this.streamingEngine_.configure(this.config_.streaming);
    return this.streamingEngine_.init();
  }.bind(this)).then(function() {
    // Re-filter the manifest after streams have been chosen.
    this.manifest_.periods.forEach(this.filterPeriod_.bind(this));
    // Dispatch a 'trackschanged' event now that all initial filtering is done.
    this.onTracksChanged_();
    // Since the first streams just became active, send an adaptation event.
    this.onAdaptation_();

    this.loadInProgress_ = false;
    this.config_.abrManager.init(this.switch_.bind(this));
  }.bind(this)).catch(function(error) {
    this.loadInProgress_ = false;
    goog.asserts.assert(error instanceof shaka.util.Error,
                        'Wrong error type!');
    return Promise.reject(error);
  });
};


/**
 * Sets the current networking engine.  Used for testing.
 *
 * @param {!shaka.net.NetworkingEngine} netEngine
 */
shaka.Player.prototype.setNetworkingEngine = function(netEngine) {
  this.networkingEngine_ = netEngine;
};


/**
 * Creates a new instance of DrmEngine.  This can be replaced by tests to create
 * fake DrmEngine instances instead.
 *
 * @return {!shaka.media.DrmEngine}
 */
shaka.Player.prototype.createDrmEngine = function() {
  goog.asserts.assert(
      this.networkingEngine_, 'Networking engine should be set!');
  return new shaka.media.DrmEngine(
      this.networkingEngine_,
      this.onError_.bind(this),
      this.onKeyStatus_.bind(this));
};


/**
 * Creates a new instance of Playhead.  This can be replaced by tests to create
 * fake instances instead.
 *
 * @param {number=} opt_startTime
 * @return {!shaka.media.Playhead}
 */
shaka.Player.prototype.createPlayhead = function(opt_startTime) {
  var timeline = this.manifest_.presentationTimeline;
  var rebufferingGoal = shaka.media.StreamingEngine.getRebufferingGoal(
      this.manifest_, this.config_.streaming);
  return new shaka.media.Playhead(
      this.video_, timeline, rebufferingGoal, opt_startTime || null,
      this.onBuffering_.bind(this), this.onSeek_.bind(this));
};


/**
 * Create and open MediaSource.  Potentially slow.
 *
 * @return {!Promise}
 */
shaka.Player.prototype.createMediaSource = function() {
  this.mediaSource_ = new MediaSource();
  var ret = new shaka.util.PublicPromise();
  this.eventManager_.listen(this.mediaSource_, 'sourceopen', ret.resolve);
  this.video_.src = window.URL.createObjectURL(this.mediaSource_);
  return ret;
};


/**
 * Creates a new instance of MediaSourceEngine.  This can be replaced by tests
 * to create fake instances instead.
 *
 * @return {!shaka.media.MediaSourceEngine}
 */
shaka.Player.prototype.createMediaSourceEngine = function() {
  return new shaka.media.MediaSourceEngine(
      this.video_, this.mediaSource_, this.textTrack_);
};


/**
 * Creates a new instance of StreamingEngine.  This can be replaced by tests
 * to create fake instances instead.
 *
 * @return {!shaka.media.StreamingEngine}
 */
shaka.Player.prototype.createStreamingEngine = function() {
  goog.asserts.assert(this.playhead_, 'Must not be destroyed');
  goog.asserts.assert(this.mediaSourceEngine_, 'Must not be destroyed');
  goog.asserts.assert(this.manifest_, 'Must not be destroyed');
  return new shaka.media.StreamingEngine(
      this.playhead_, this.mediaSourceEngine_, this.networkingEngine_,
      this.manifest_, this.onChooseStreams_.bind(this),
      this.canSwitch_.bind(this), this.onError_.bind(this));
};


/**
 * Configure the Player instance.
 *
 * The config object passed in need not be complete.  It will be merged with
 * the existing Player configuration.
 *
 * Config keys and types will be checked.  If any problems with the config
 * object are found, errors will be reported through logs.
 *
 * @param {shakaExtern.PlayerConfiguration} config
 * @export
 */
shaka.Player.prototype.configure = function(config) {
  goog.asserts.assert(this.config_, 'Config must not be null!');

  var audioLangChanged = config.preferredAudioLanguage &&
      config.preferredAudioLanguage !== this.config_.preferredAudioLanguage;
  var textLangChanged = config.preferredTextLanguage &&
      config.preferredTextLanguage !== this.config_.preferredTextLanguage;

  if (config.abrManager &&
      config.abrManager != this.config_.abrManager) {
    this.config_.abrManager.stop();
    config.abrManager.init(this.switch_.bind(this));
  }

  this.mergeConfigObjects_(this.config_, config, this.defaultConfig_(), '');

  if (this.parser_) {
    this.parser_.configure(this.config_.manifest);
  }
  if (this.drmEngine_) {
    this.drmEngine_.configure(this.config_.drm);
  }
  if (this.streamingEngine_) {
    this.streamingEngine_.configure(this.config_.streaming);

    // If the languages have changed, then choose streams again.
    var period = this.streamingEngine_.getCurrentPeriod();
    // This will disable AbrManager but it will be enabled again below.
    var chosen = this.chooseStreams_(period);

    for (var kind in chosen) {
      if ((kind == 'audio' && audioLangChanged) ||
          (kind == 'text' && textLangChanged)) {
        if (this.switchingPeriods_) {
          this.deferredSwitches_[kind] = chosen[kind];
        } else {
          this.streamingEngine_.switch(kind, chosen[kind],
                                       /* clearBuffer */ true);
        }
      }
    }
  }

  // Simply enable/disable ABR with each call, since multiple calls to these
  // methods have no effect.
  if (this.config_.enableAdaptation && !this.switchingPeriods_) {
    this.config_.abrManager.enable();
  } else {
    this.config_.abrManager.disable();
  }
};


/**
 * Return a copy of the current configuration.  Modifications of the returned
 * value will not affect the Player's active configuration.  You must call
 * player.configure() to make changes.
 *
 * @return {shakaExtern.PlayerConfiguration}
 * @export
 */
shaka.Player.prototype.getConfiguration = function() {
  goog.asserts.assert(this.config_, 'Config must not be null!');

  var ret = this.defaultConfig_();
  this.mergeConfigObjects_(ret, this.config_, this.defaultConfig_(), '');
  return ret;
};


/**
 * @return {shaka.net.NetworkingEngine} A reference to the Player's networking
 *     engine.  Applications may use this to make requests through Shaka's
 *     networking plugins.
 * @export
 */
shaka.Player.prototype.getNetworkingEngine = function() {
  return this.networkingEngine_;
};


/**
 * @return {boolean} True if the current stream is live.  False if the stream is
 *     VOD or if there is no active stream.
 * @export
 */
shaka.Player.prototype.isLive = function() {
  if (!this.manifest_) return false;
  var timeline = this.manifest_.presentationTimeline;
  return timeline.getDuration() == Number.POSITIVE_INFINITY;
};


/**
 * @return {boolean} True if the Player is in a buffering state.
 * @export
 */
shaka.Player.prototype.isBuffering = function() {
  return this.buffering_;
};


/**
 * Unload the current manifest and make the Player available for re-use.
 *
 * @return {!Promise} Resolved when streaming has stopped and the previous
 *     content, if any, has been unloaded.
 * @export
 */
shaka.Player.prototype.unload = function() {
  return this.destroyStreaming_().then(function() {
    // Start the (potentially slow) process of opening MediaSource now.
    this.mediaSourceOpen_ = this.createMediaSource();
  }.bind(this));
};


/**
 * Skip through the content without playing.  Simulated using repeated seeks.
 *
 * Trick play will be canceled automatically if the playhead hits the beginning
 * or end of the seekable range for the content.
 *
 * @param {number} rate The playback rate to simulate.  For example, a rate of
 *     2.5 would result in 2.5 seconds of content being skipped every second.
 *     To trick-play backward, use a negative rate.
 * @export
 */
shaka.Player.prototype.trickPlay = function(rate) {
  // TODO: Trick play
};


/**
 * Cancel trick-play.
 * @export
 */
shaka.Player.prototype.cancelTrickPlay = function() {
  // TODO: Trick play
};


/**
 * Return a list of audio, video, and text tracks available for the current
 * Period.  If there are multiple Periods, then you must seek to the Period
 * before being able to switch.
 *
 * @return {!Array.<shakaExtern.Track>}
 * @export
 */
shaka.Player.prototype.getTracks = function() {
  var Functional = shaka.util.Functional;
  if (!this.streamingEngine_)
    return [];

  // Convert each stream into a track and squash them into one array.
  var activeStreams = this.streamingEngine_.getActiveStreams();
  var period = this.streamingEngine_.getCurrentPeriod();
  return period.streamSets
      .map(function(streamSet) {
        var activeStream = activeStreams[streamSet.type];
        return streamSet.streams.map(function(stream) {
          return {
            id: stream.id,
            active: activeStream == stream,
            type: streamSet.type,
            bandwidth: stream.bandwidth,
            language: streamSet.language,
            kind: stream.kind || null,
            width: stream.width || null,
            height: stream.height || null
          };
        });
      })
      .reduce(Functional.collapseArrays, []);
};


/**
 * Select a specific track.  For audio or video, this disables adaptation.
 *
 * @param {shakaExtern.Track} track
 * @param {boolean=} opt_clearBuffer
 * @export
 */
shaka.Player.prototype.selectTrack = function(track, opt_clearBuffer) {
  if (!this.streamingEngine_)
    return;

  /** @type {shakaExtern.Stream} */
  var stream;
  var period = this.streamingEngine_.getCurrentPeriod();
  period.streamSets.forEach(function(streamSet) {
    streamSet.streams.forEach(function(curStream) {
      if (curStream.id == track.id)
        stream = curStream;
    });
  });

  if (!stream) {
    shaka.log.error('Unable to find the track with id "' + track.id +
                    '"; did we change Periods?');
    return;
  }

  // Add an entry to the history.
  this.switchHistory_.push({
    timestamp: Date.now() / 1000,
    id: stream.id,
    type: track.type,
    fromAdaptation: false
  });

  if (track.type != 'text') {
    var config = /** @type {shakaExtern.PlayerConfiguration} */ (
        {enableAdaptation: false});
    this.configure(config);
  }

  if (this.switchingPeriods_) {
    // We are switching Periods so we cannot switch yet, so wait until
    // chooseStreams_ is called and handle there.  The buffer does not have any
    // data from this Period, so we can ignore |opt_clearBuffer|.
    this.deferredSwitches_[track.type] = stream;
  } else {
    // Since text tracks are small and likely fully buffered (some are just a
    // single segment), always clear the buffer for text tracks.
    this.streamingEngine_.switch(track.type, stream,
                                 opt_clearBuffer || track.type == 'text');
  }
};


/**
 * @return {boolean} True if the current text track is visible.
 * @export
 */
shaka.Player.prototype.isTextTrackVisible = function() {
  return this.textTrack_.mode == 'showing';
};


/**
 * Set the visibility of the current text track, if any.
 *
 * @param {boolean} on
 * @export
 */
shaka.Player.prototype.setTextTrackVisibility = function(on) {
  this.textTrack_.mode = on ? 'showing' : 'disabled';
};


/**
 * Return playback and adaptation stats.
 *
 * @return {shakaExtern.Stats}
 * @export
 */
shaka.Player.prototype.getStats = function() {
  this.updateStats_();

  var video = {};
  var audio = {};
  var videoInfo = this.video_ && this.video_.getVideoPlaybackQuality ?
      this.video_.getVideoPlaybackQuality() :
      {};
  if (this.streamingEngine_) {
    var activeStreams = this.streamingEngine_.getActiveStreams();
    video = activeStreams['video'] || {};
    audio = activeStreams['audio'] || {};
  }

  return {
    width: video.width || 0,
    height: video.height || 0,
    streamBandwidth: ((video.bandwidth + audio.bandwidth) || 0) / 1000,

    decodedFrames: Number(videoInfo.totalVideoFrames),
    droppedFrames: Number(videoInfo.droppedVideoFrames),
    estimatedBandwidth: this.config_.abrManager.getBandwidthEstimate(),
    playTime: this.playTime_,
    bufferingTime: this.bufferingTime_,

    switchHistory: this.switchHistory_.slice(0)
  };
};


/**
 * Adds the given text track to the current Period.  Load() must resolve before
 * calling.  The current Period or the presentation must have a duration.  This
 * returns a Promise that will resolve when the track can be switched to and
 * will resolve with the track that was created.
 *
 * @param {string} uri
 * @param {string} language
 * @param {string} kind
 * @param {string} mime
 * @param {string=} opt_codec
 * @return {!Promise.<shakaExtern.Track>}
 * @export
 */
shaka.Player.prototype.addTextTrack = function(
    uri, language, kind, mime, opt_codec) {
  if (!this.manifest_) {
    shaka.log.error(
        'Must call load() and wait for it to resolve before adding text ' +
        'tracks.');
    return Promise.reject();
  }

  // Get the Period duration.
  var period = this.streamingEngine_.getCurrentPeriod();
  /** @type {number} */
  var periodDuration;
  for (var i = 0; i < this.manifest_.periods.length; i++) {
    if (this.manifest_.periods[i] == period) {
      if (i == this.manifest_.periods.length - 1) {
        periodDuration = this.manifest_.presentationTimeline.getDuration() -
            period.startTime;
        if (periodDuration == Number.POSITIVE_INFINITY) {
          shaka.log.error(
              'The current Period or the presentation must have a duration ' +
              'to add external text tracks.');
          return Promise.reject();
        }
      } else {
        var nextPeriod = this.manifest_.periods[i + 1];
        periodDuration = nextPeriod.startTime - period.startTime;
      }
      break;
    }
  }

  /** @type {shakaExtern.Stream} */
  var stream = {
    id: this.nextExternalStreamId_++,
    createSegmentIndex: Promise.resolve.bind(Promise),
    findSegmentPosition: function(time) { return 1; },
    getSegmentReference: function(ref) {
      if (ref != 1) return null;
      return new shaka.media.SegmentReference(
          1, 0, periodDuration, [uri], 0, null);
    },
    initSegmentReference: null,
    presentationTimeOffset: 0,
    mimeType: mime,
    codecs: opt_codec || '',
    bandwidth: 0,
    kind: kind,
    keyId: null
  };
  /** @type {shakaExtern.StreamSet} */
  var streamSet = {
    language: language,
    type: 'text',
    primary: true,
    drmInfos: [],
    streams: [stream]
  };

  return this.streamingEngine_.notifyNewStream('text', stream).then(function() {
    // Only add the stream once it has been initialized.  This ensures that
    // calls to getTracks do not return the uninitialized stream.
    period.streamSets.push(streamSet);
    return {
      id: stream.id,
      active: false,
      type: 'text',
      bandwidth: 0,
      language: language,
      kind: kind,
      width: null,
      height: null
    };
  });
};


/**
 * Initialize the Player.
 * @private
 */
shaka.Player.prototype.initialize_ = function() {
  // Start the (potentially slow) process of opening MediaSource now.
  this.mediaSourceOpen_ = this.createMediaSource();

  // If the video element has TextTracks, disable them.  If we see one that
  // was created by a previous instance of Shaka Player, reuse it.
  for (var i = 0; i < this.video_.textTracks.length; ++i) {
    var track = this.video_.textTracks[i];
    track.mode = 'hidden';

    if (track.id == shaka.Player.TextTrackId_) {
      this.textTrack_ = track;
    }
  }

  if (!this.textTrack_) {
    // As far as I can tell, there is no observable difference between setting
    // kind to 'subtitles' or 'captions' when creating the TextTrack object.
    // The individual text tracks from the manifest will still have their own
    // kinds which can be displayed in the app's UI.
    this.textTrack_ = this.video_.addTextTrack(
        'subtitles', shaka.Player.TextTrackId_);
    this.textTrack_.mode = 'hidden';
  }

  // TODO: test that in all cases, the built-in CC controls in the video element
  // are toggling our TextTrack.

  // Listen for video errors.
  this.eventManager_.listen(this.video_, 'error',
      this.onVideoError_.bind(this));
};


/**
 * Destroy members responsible for streaming.
 *
 * @return {!Promise}
 * @private
 */
shaka.Player.prototype.destroyStreaming_ = function() {
  if (this.eventManager_) {
    this.eventManager_.unlisten(this.mediaSource_, 'sourceopen');
  }

  if (this.video_) {
    this.video_.removeAttribute('src');
    this.video_.load();
  }

  var p = Promise.all([
    this.config_.abrManager.stop(),
    this.drmEngine_ ? this.drmEngine_.destroy() : null,
    this.mediaSourceEngine_ ? this.mediaSourceEngine_.destroy() : null,
    this.playhead_ ? this.playhead_.destroy() : null,
    this.streamingEngine_ ? this.streamingEngine_.destroy() : null,
    this.parser_ ? this.parser_.stop() : null
  ]);

  this.drmEngine_ = null;
  this.mediaSourceEngine_ = null;
  this.playhead_ = null;
  this.streamingEngine_ = null;
  this.parser_ = null;
  this.manifest_ = null;
  this.mediaSourceOpen_ = null;
  this.mediaSource_ = null;
  this.deferredSwitches_ = {};
  this.switchHistory_ = [];
  this.playTime_ = 0;
  this.bufferingTime_ = 0;

  return p;
};


/**
 * @const {string}
 * @private
 */
shaka.Player.TextTrackId_ = 'Shaka Player TextTrack';


// TODO: consider moving config-parsing to another file.
/**
 * @param {!Object} destination
 * @param {!Object} source
 * @param {!Object} template supplies default values
 * @param {string} path to this part of the config
 * @private
 */
shaka.Player.prototype.mergeConfigObjects_ =
    function(destination, source, template, path) {
  /**
   * @type {boolean}
   * If true, don't validate the keys in the next level.
   */
  var ignoreKeys = !!({
    '.drm.servers': true,
    '.drm.clearKeys': true,
    '.drm.advanced': true
  })[path];

  /**
   * @type {string}
   * If present, require this specific type instead of following the template.
   */
  var requiredType = ({
    '.drm.servers': 'string',
    '.drm.clearKeys': 'string'
  })[path] || '';

  /**
   * @type {Object}
   * If present, use this object as the template for the next level.
   */
  var overrideSubTemplate = ({
    '.drm.advanced': this.defaultAdvancedDrmConfig_()
  })[path];

  goog.asserts.assert(destination, 'Destination config must not be null!');

  for (var k in source) {
    var subPath = path + '.' + k;
    var subTemplate = template[k];
    if (overrideSubTemplate) {
      subTemplate = overrideSubTemplate;
    }

    /**
     * @type {boolean}
     * If true, simply copy the object over and don't verify.
     */
    var copyObject = !!({
      '.abrManager': true
    })[subPath];

    // The order of these checks is important.
    if (!ignoreKeys && !(k in destination)) {
      shaka.log.error('Invalid config, unrecognized key ' + subPath);
    } else if (source[k] === undefined) {
      // An explicit 'undefined' value causes the key to be deleted from the
      // destination config and replaced with a default from the template if
      // possible.
      if (subTemplate === undefined) {
        delete destination[k];
      } else {
        destination[k] = subTemplate;
      }
    } else if (copyObject) {
      destination[k] = source[k];
    } else if (typeof destination[k] == 'object' &&
               typeof source[k] == 'object') {
      this.mergeConfigObjects_(destination[k], source[k], subTemplate, subPath);
    } else if (!ignoreKeys && (typeof source[k] != typeof destination[k])) {
      shaka.log.error('Invalid config, wrong type for ' + subPath);
    } else if (requiredType && (typeof source[k] != requiredType)) {
      shaka.log.error('Invalid config, wrong type for ' + subPath);
    } else if (typeof destination[k] == 'function' &&
               destination[k].length != source[k].length) {
      shaka.log.error('Invalid config, wrong number of arguments for ' +
                      subPath);
    } else {
      destination[k] = source[k];
    }
  }
};


/**
 * @return {shakaExtern.PlayerConfiguration}
 * @private
 */
shaka.Player.prototype.defaultConfig_ = function() {
  return {
    drm: {
      retryParameters: shaka.net.NetworkingEngine.defaultRetryParameters(),
      // These will all be verified by special cases in mergeConfigObjects_():
      servers: {},    // key is arbitrary key system ID, value must be string
      clearKeys: {},  // key is arbitrary key system ID, value must be string
      advanced: {}    // key is arbitrary key system ID, value is a record type
    },
    manifest: {
      retryParameters: shaka.net.NetworkingEngine.defaultRetryParameters(),
      dash: {
        customScheme: function(node) {
          // Reference node to keep closure from removing it.
          // If the argument is removed, it breaks our function length check
          // in mergeConfigObjects_().
          // TODO: Find a better solution if possible.
          if (node) return null;
        }
      }
    },
    streaming: {
      retryParameters: shaka.net.NetworkingEngine.defaultRetryParameters(),
      rebufferingGoal: 15,
      bufferingGoal: 30,
      bufferBehind: 30
    },
    abrManager: this.defaultAbrManager_,
    enableAdaptation: true,
    preferredAudioLanguage: '',
    preferredTextLanguage: ''
  };
};


/**
 * @return {shakaExtern.AdvancedDrmConfiguration}
 * @private
 */
shaka.Player.prototype.defaultAdvancedDrmConfig_ = function() {
  return {
    distinctiveIdentifierRequired: false,
    persistentStateRequired: false,
    videoRobustness: '',
    audioRobustness: '',
    serverCertificate: null
  };
};


/**
 * @param {shakaExtern.Period} period
 * @private
 */
shaka.Player.prototype.filterPeriod_ = function(period) {
  var keySystem = '';
  if (this.drmEngine_ && this.drmEngine_.initialized()) {
    keySystem = this.drmEngine_.keySystem();
  }

  var activeStreams = {};
  if (this.streamingEngine_) {
    activeStreams = this.streamingEngine_.getActiveStreams();
  }

  for (var i = 0; i < period.streamSets.length; ++i) {
    var streamSet = period.streamSets[i];

    if (keySystem) {
      // A key system has been selected.
      // Remove streamSets which can only be used with other key systems.
      // Note that drmInfos == [] means unencrypted.
      var match = streamSet.drmInfos.length == 0 ||
                  streamSet.drmInfos.some(function(drmInfo) {
                    return drmInfo.keySystem == keySystem; });

      if (!match) {
        shaka.log.debug('Dropping StreamSet, can\'t be used with ' + keySystem,
                        streamSet);
        period.streamSets.splice(i, 1);
        --i;
        continue;
      }
    }

    var activeStream = activeStreams[streamSet.type];

    for (var j = 0; j < streamSet.streams.length; ++j) {
      var stream = streamSet.streams[j];
      if (activeStream && streamSet.type != 'text') {
        // Check that the basic mime types match.  For example, you can't switch
        // from WebM to MP4, so if we started with WebM, eliminate MP4.
        if (stream.mimeType != activeStream.mimeType) {
          streamSet.streams.splice(j, 1);
          --j;
          continue;
        }
      }

      var fullMimeType = stream.mimeType;
      if (stream.codecs) {
        fullMimeType += '; codecs="' + stream.codecs + '"';
      }

      if (!shaka.media.MediaSourceEngine.isTypeSupported(fullMimeType)) {
        streamSet.streams.splice(j, 1);
        --j;
        continue;
      }
    }

    if (streamSet.streams.length == 0) {
      period.streamSets.splice(i, 1);
      --i;
    }
  }

  if (period.streamSets.length == 0) {
    this.onError_(new shaka.util.Error(
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.UNPLAYABLE_PERIOD));
  }
};


/** @private */
shaka.Player.prototype.updateStats_ = function() {
  // Only count while we're loaded.
  if (!this.manifest_)
    return;

  var now = Date.now() / 1000;
  if (this.buffering_)
    this.bufferingTime_ += (now - this.lastStatUpdateTimestamp_);
  else
    this.playTime_ += (now - this.lastStatUpdateTimestamp_);

  this.lastStatUpdateTimestamp_ = now;
};


/**
 * Callback from NetworkingEngine.
 *
 * @param {number} startTimeMs
 * @param {number} endTimeMs
 * @param {number} numBytes
 * @private
 */
shaka.Player.prototype.onSegmentDownloaded_ = function(
    startTimeMs, endTimeMs, numBytes) {
  this.config_.abrManager.segmentDownloaded(startTimeMs, endTimeMs, numBytes);
};


/**
 * Callback from Playhead.
 *
 * @param {boolean} buffering
 * @private
 */
shaka.Player.prototype.onBuffering_ = function(buffering) {
  // Before setting |buffering_|, update the time spent in the previous state.
  this.updateStats_();
  this.buffering_ = buffering;

  var event = new shaka.util.FakeEvent('buffering', { buffering: buffering });
  this.dispatchEvent(event);
};


/**
 * Callback from Playhead.
 *
 * @private
 */
shaka.Player.prototype.onSeek_ = function() {
  if (this.streamingEngine_) {
    this.streamingEngine_.seeked();
  }
};


/**
 * Chooses streams from the given Period.
 *
 * @param {!shakaExtern.Period} period
 * @return {!Object.<string, !shakaExtern.Stream>} A map of stream types to
 *   streams.
 * @private
 */
shaka.Player.prototype.chooseStreams_ = function(period) {
  var LanguageUtils = shaka.util.LanguageUtils;

  // Choose the first stream set listed as the default.
  /** @type {!Object.<string, shakaExtern.StreamSet>} */
  var streamSetsByType = {};
  period.streamSets.forEach(function(set) {
    if (set.type in streamSetsByType) return;
    streamSetsByType[set.type] = set;
  });

  // Then if there are primary stream sets, override the default.
  period.streamSets.forEach(function(set) {
    if (set.primary)
      streamSetsByType[set.type] = set;
  });

  // Track whether or not we have a match.
  var languageMatches = { 'audio': false, 'text': false };

  // Finally, choose based on language preference.  Favor exact matches, then
  // base matches, finally different subtags.  Execute in reverse order so
  // the later steps override the previous ones.
  [LanguageUtils.MatchType.OTHER_SUB_LANGUAGE_OKAY,
   LanguageUtils.MatchType.BASE_LANGUAGE_OKAY,
   LanguageUtils.MatchType.EXACT]
      .forEach(function(matchType) {
        period.streamSets.forEach(function(set) {
          /** @type {string} */
          var pref;
          if (set.type == 'audio')
            pref = this.config_.preferredAudioLanguage;
          else if (set.type == 'text')
            pref = this.config_.preferredTextLanguage;

          if (pref) {
            pref = LanguageUtils.normalize(pref);
            var lang = LanguageUtils.normalize(set.language);
            if (LanguageUtils.match(matchType, pref, lang)) {
              languageMatches[set.type] = true;
              streamSetsByType[set.type] = set;
            }
          }
        }.bind(this));
      }.bind(this));

  var chosen = this.config_.abrManager.chooseStreams(streamSetsByType);

  // AbrManager does not choose text tracks, so use the first stream if it
  // exists.
  if (streamSetsByType['text']) {
    chosen['text'] = streamSetsByType['text'].streams[0];
    // If audio and text tracks have different languages, and the text track
    // matches the user's preference, then show the captions.
    if (streamSetsByType['audio'] &&
        languageMatches['text'] &&
        streamSetsByType['text'].language !=
            streamSetsByType['audio'].language) {
      this.textTrack_.mode = 'showing';
    }
  }

  return chosen;
};


/**
 * Callback from StreamingEngine.
 *
 * @param {!shakaExtern.Period} period
 * @return {!Object.<string, !shakaExtern.Stream>} A map of stream types to
 *   streams.
 * @private
 */
shaka.Player.prototype.onChooseStreams_ = function(period) {
  shaka.log.debug('onChooseStreams_', period);

  // We are switching Periods, so the AbrManager will be disabled.  But if we
  // want to enableAdaptation, we do not want to call AbrManager.enable before
  // canSwitch_ is called.
  this.switchingPeriods_ = true;

  var chosen = this.chooseStreams_(period);

  // Override the chosen streams with the ones picked in selectTrack.
  for (var kind in this.deferredSwitches_) {
    chosen[kind] = this.deferredSwitches_[kind];
  }
  this.deferredSwitches_ = {};

  for (var type in chosen) {
    var stream = chosen[type];
    this.switchHistory_.push({
      timestamp: Date.now() / 1000,
      id: stream.id,
      type: type,
      fromAdaptation: true
    });
  }

  // If we are presently loading, we aren't done filtering streams just yet.
  // Wait to send a 'trackschanged' event.
  if (!this.loadInProgress_) {
    this.onTracksChanged_();
  }

  return chosen;
};


/**
 * Callback from StreamingEngine.
 *
 * @private
 */
shaka.Player.prototype.canSwitch_ = function() {
  shaka.log.debug('canSwitch_');
  this.switchingPeriods_ = false;
  if (this.config_.enableAdaptation)
    this.config_.abrManager.enable();

  // If we still have deferred switches, switch now.
  for (var kind in this.deferredSwitches_) {
    this.streamingEngine_.switch(kind, this.deferredSwitches_[kind]);
  }
  this.deferredSwitches_ = {};
};


/**
 * Callback from AbrManager.
 *
 * @param {!Object.<string, !shakaExtern.Stream>} streamsByType
 * @private
 */
shaka.Player.prototype.switch_ = function(streamsByType) {
  shaka.log.debug('switch_');

  // We have adapted to a new stream, record it in the history.  Only add if
  // we are actually switching the stream.
  var oldActive = this.streamingEngine_.getActiveStreams();
  for (var type in streamsByType) {
    var stream = streamsByType[type];
    if (oldActive[type] != stream) {
      this.switchHistory_.push({
        timestamp: Date.now() / 1000,
        id: stream.id,
        type: type,
        fromAdaptation: true
      });
    }
  }

  if (this.streamingEngine_) {
    for (var type in streamsByType) {
      this.streamingEngine_.switch(type, streamsByType[type]);
    }
    this.onAdaptation_();
  }
};


/**
 * Dispatches a 'adaptation' event.
 * @private
 */
shaka.Player.prototype.onAdaptation_ = function() {
  // In the next frame, dispatch a 'adaptation' event.
  // This gives StreamingEngine time to absorb the changes before the user
  // tries to query them.
  Promise.resolve().then(function() {
    if (!this.video_) {
      // We've been destroyed!  Do nothing.
      return;
    }

    var event = new shaka.util.FakeEvent('adaptation');
    this.dispatchEvent(event);
  }.bind(this));
};


/**
 * Dispatches a 'trackschanged' event.
 * @private
 */
shaka.Player.prototype.onTracksChanged_ = function() {
  // In the next frame, dispatch a 'trackschanged' event.
  // This gives StreamingEngine time to absorb the changes before the user
  // tries to query them.
  Promise.resolve().then(function() {
    if (!this.video_) {
      // We've been destroyed!  Do nothing.
      return;
    }

    var event = new shaka.util.FakeEvent('trackschanged');
    this.dispatchEvent(event);
  }.bind(this));
};


/**
 * @param {!shaka.util.Error} error
 * @private
 */
shaka.Player.prototype.onError_ = function(error) {
  goog.asserts.assert(error instanceof shaka.util.Error, 'Wrong error type!');

  var event = new shaka.util.FakeEvent('error', { detail: error });
  this.dispatchEvent(event);
};


/**
 * @param {!Event} event
 * @private
 */
shaka.Player.prototype.onVideoError_ = function(event) {
  if (!this.video_.error) return;

  var code = this.video_.error.code;
  if (code == 1 /* MEDIA_ERR_ABORTED */) {
    // Ignore this error code, which should only occur when navigating away or
    // deliberately stopping playback of HTTP content.
    return;
  }

  // Extra error information from MS Edge and IE11:
  var extended = this.video_.error.msExtendedCode;
  if (extended) {
    // Convert to unsigned:
    if (extended < 0) {
      extended += Math.pow(2, 32);
    }
    // Format as hex:
    extended = extended.toString(16);
  }

  this.onError_(new shaka.util.Error(
      shaka.util.Error.Category.MEDIA,
      shaka.util.Error.Code.VIDEO_ERROR,
      code, extended));
};


/**
 * @param {!Object.<string, string>} keyStatusMap A map of hex key IDs to
 *   statuses.
 * @private
 */
shaka.Player.prototype.onKeyStatus_ = function(keyStatusMap) {
  // TODO: use key status information
};
