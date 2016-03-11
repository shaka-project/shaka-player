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

goog.provide('shaka.Player');

goog.require('goog.Uri');
goog.require('goog.asserts');
goog.require('shaka.abr.SimpleAbrManager');
goog.require('shaka.log');
goog.require('shaka.media.DrmEngine');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.media.MediaSourceEngine');
goog.require('shaka.media.Playhead');
goog.require('shaka.media.StreamingEngine');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.Error');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
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
  this.drmEngine_ = new shaka.media.DrmEngine(
      this.networkingEngine_,
      this.onError_.bind(this),
      this.onKeyStatus_.bind(this));

  /** @private {MediaSource} */
  this.mediaSource_ = new MediaSource();

  /** @private {shaka.media.MediaSourceEngine} */
  this.mediaSourceEngine_ = null;

  /** @private {shaka.util.PublicPromise} */
  this.mediaSourceOpen_ = new shaka.util.PublicPromise();

  /** @private {shaka.media.Playhead} */
  this.playhead_ = null;

  /** @private {shaka.media.StreamingEngine} */
  this.streamingEngine_ = null;

  /** @private {shakaExtern.ManifestParser} */
  this.parser_ = null;

  /** @private {?shakaExtern.Manifest} */
  this.manifest_ = null;

  /** @private {boolean} */
  this.buffering_ = false;

  /** @private {?shakaExtern.PlayerConfiguration} */
  this.config_ = this.defaultConfig_();


  this.defaultAbrManager_.init(this.switch_.bind(this));
  this.drmEngine_.configure(this.config_.drm);

  // Start the (potentially slow) process of opening MediaSource now.
  this.eventManager_.listen(this.mediaSource_, 'sourceopen',
      this.onMediaSourceOpen_.bind(this));
  this.video_.src = window.URL.createObjectURL(this.mediaSource_);

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
goog.inherits(shaka.Player, shaka.util.FakeEventTarget);


/**
 * After destruction, a Player object cannot be used again.
 *
 * @override
 */
shaka.Player.prototype.destroy = function() {
  if (this.video_)
    this.video_.src = '';

  var p = Promise.all([
    this.eventManager_.destroy(),
    this.config_.abrManager.stop(),
    this.networkingEngine_.destroy(),
    this.drmEngine_.destroy(),
    this.mediaSourceEngine_ ? this.mediaSourceEngine_.destroy() : null,
    this.playhead_ ? this.playhead_.destroy() : null,
    this.streamingEngine_ ? this.streamingEngine_.destroy() : null,
    this.parser_ ? this.parser_.stop() : null
  ]);

  this.video_ = null;
  this.textTrack_ = null;
  this.eventManager_ = null;
  this.defaultAbrManager_ = null;
  this.networkingEngine_ = null;
  this.drmEngine_ = null;
  this.mediaSource_ = null;
  this.mediaSourceEngine_ = null;
  this.mediaSourceOpen_ = null;
  this.playhead_ = null;
  this.streamingEngine_ = null;
  this.parser_ = null;
  this.manifest_ = null;
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


// TODO: AdaptationEvent, SeekRangeChangedEvent, TracksChangedEvent


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
  // TODO: A Player instance should be re-usable.
  var factory = opt_manifestParserFactory;
  var p = Promise.resolve();
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

    p = this.networkingEngine_.request(type, headRequest).then(
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

  return p.then(function() {
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
    return this.drmEngine_.init(manifest, false /* offline */);
  }.bind(this)).then(function() {
    // Re-filter the manifest after DRM has been initialized.
    this.manifest_.periods.forEach(this.filterPeriod_.bind(this));

    // Wait for MediaSource to open before continuing.
    return Promise.all([
      this.drmEngine_.attach(this.video_),
      this.mediaSourceOpen_
    ]);
  }.bind(this)).then(function() {
    var timeline = this.manifest_.presentationTimeline;
    var isLive = timeline.getDuration() == Number.POSITIVE_INFINITY;

    var defaultStartTime = isLive ?
        timeline.getSegmentAvailabilityEnd() :
        timeline.getSegmentAvailabilityStart();
    var startTime = opt_startTime || defaultStartTime;

    // MediaSource is open, so start MediaSourceEngine & StreamingEngine.
    this.mediaSourceEngine_ =
        new shaka.media.MediaSourceEngine(this.video_,
                                          this.mediaSource_,
                                          this.textTrack_);
    this.playhead_ = new shaka.media.Playhead(
        this.video_,
        timeline,
        this.config_.streaming.rebufferingGoal,
        startTime,
        this.onBuffering_.bind(this),
        this.onSeek_.bind(this));
    this.streamingEngine_ = new shaka.media.StreamingEngine(
        this.playhead_,
        this.mediaSourceEngine_,
        this.networkingEngine_,
        this.manifest_,
        this.chooseStreams_.bind(this),
        this.canSwitch_.bind(this),
        this.onError_.bind(this));
    this.streamingEngine_.configure(this.config_.streaming);
    this.streamingEngine_.init();
  }.bind(this)).catch(function(error) {
    goog.asserts.assert(error instanceof shaka.util.Error,
                        'Wrong error type!');
    return Promise.reject(error);
  });
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
  if (this.playhead_) {
    this.playhead_.setMinBufferTime(this.config_.streaming.rebufferingGoal);
  }
  if (this.streamingEngine_) {
    // TODO: if languages have changed, make new StreamSet choices
    this.streamingEngine_.configure(this.config_.streaming);
  }
  // TODO: if enableAdaptation has changed, turn on/off abrManager.
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
  return this.cloneObject_(this.config_);
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
  // TODO: A Player instance should be re-usable.
  return Promise.reject();
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
 * Return a list of audio, video, and text tracks available.
 *
 * @return {!Array.<*>}
 * @export
 */
shaka.Player.prototype.getTracks = function() {
  // TODO: Define track types
  // TODO: tracks WRT Periods
  return [];
};


/**
 * Select a specific track.  For audio or video, this disables adaptation.
 *
 * @param {*} track
 * @export
 */
shaka.Player.prototype.selectTrack = function(track) {
  // TODO: Define track types
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
 * @return {*}
 * @export
 */
shaka.Player.prototype.getStats = function() {
  // TODO: Define stats types
};


// TODO: API for external captions


/**
 * @const {string}
 * @private
 */
shaka.Player.TextTrackId_ = 'Shaka Player TextTrack';


/**
 * @param {!Event} event
 * @private
 */
shaka.Player.prototype.onMediaSourceOpen_ = function(event) {
  this.mediaSourceOpen_.resolve();
};


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
 * @param {!T} source
 * @return {!T}
 * @template T
 * @private
 */
shaka.Player.prototype.cloneObject_ = function(source) {
  var destination = {};
  for (var k in source) {
    if (typeof source[k] == 'object' && source[k] !== null) {
      destination[k] = this.cloneObject_(source[k]);
    } else {
      destination[k] = source[k];
    }
  }
  return destination;
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
      byteLimit: 300 << 20  // 300MB
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
  for (var i = 0; i < period.streamSets.length; ++i) {
    var streamSet = period.streamSets[i];

    var keySystem = this.drmEngine_.keySystem();
    if (this.drmEngine_.initialized() && keySystem) {
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

    for (var j = 0; j < streamSet.streams.length; ++j) {
      var stream = streamSet.streams[j];
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
 * Callback from StreamingEngine.
 *
 * @param {!shakaExtern.Period} period
 * @return {!Object.<string, !shakaExtern.Stream>} A map of stream types to
 *   streams.
 * @private
 */
shaka.Player.prototype.chooseStreams_ = function(period) {
  var LanguageUtils = shaka.util.LanguageUtils;
  shaka.log.debug('chooseStreams_', period);

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
            if (LanguageUtils.match(matchType, pref, lang))
              streamSetsByType[set.type] = set;
          }
        }.bind(this));
      }.bind(this));

  var chosen = this.config_.abrManager.chooseStreams(streamSetsByType);

  // AbrManager does not choose text tracks, so use the first stream if it
  // exists.
  if (streamSetsByType['text']) {
    chosen['text'] = streamSetsByType['text'].streams[0];
    // If audio and text tracks have different languages, then show the
    // captions.
    if (streamSetsByType['audio'] &&
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
 * @private
 */
shaka.Player.prototype.canSwitch_ = function() {
  shaka.log.debug('canSwitch_');
  this.config_.abrManager.enable();
};


/**
 * Callback from AbrManager.
 *
 * @param {!Object.<string, !shakaExtern.Stream>} streamsByType
 * @private
 */
shaka.Player.prototype.switch_ = function(streamsByType) {
  shaka.log.debug('switch_');
  if (this.streamingEngine_) {
    for (var type in streamsByType) {
      this.streamingEngine_.switch(type, streamsByType[type]);
    }
  }
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
  var code = this.video_.error ? this.video_.error.code : 0;

  if (code == 1 /* MEDIA_ERR_ABORTED */) {
    // Ignore this error code, which should only occur when navigating away or
    // deliberately stopping playback of HTTP content.
    return;
  }

  this.onError_(new shaka.util.Error(
      shaka.util.Error.Category.MEDIA,
      shaka.util.Error.Code.VIDEO_ERROR,
      code));
};


/**
 * @param {!Object.<string, string>} keyStatusMap A map of hex key IDs to
 *   statuses.
 * @private
 */
shaka.Player.prototype.onKeyStatus_ = function(keyStatusMap) {
  // TODO: use key status information
};
