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
goog.require('shaka.asserts');
goog.require('shaka.log');
goog.require('shaka.media.DrmEngine');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.media.MediaSourceEngine');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.Error');
goog.require('shaka.util.IDestroyable');



/**
 * @constructor
 * @struct
 * @implements {shaka.util.IDestroyable}
 * @export
 */
shaka.Player = function() {
  /** @private {shaka.net.NetworkingEngine} */
  this.networkingEngine_ = new shaka.net.NetworkingEngine();

  /** @private {shaka.media.ManifestParser} */
  this.parser_ = null;

  /** @private {?shakaExtern.Manifest} */
  this.manifest_ = null;

  /** @private {?shakaExtern.PlayerConfiguration} */
  this.config_ = this.defaultConfig_();
};


/**
 * @override
 */
shaka.Player.prototype.destroy = function() {
  var p = Promise.all([
    this.parser_ ? this.parser_.stop() : null,
    this.networkingEngine_.destroy()
  ]);

  this.config_ = null;
  this.manifest_ = null;
  this.parser_ = null;
  this.networkingEngine_ = null;
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
 * @param {string} manifestUri
 * @param {number=} opt_startTime
 * @param {shaka.media.ManifestParser.Factory=} opt_manifestParserFactory
 * @return {!Promise} Resolved when playback can begin.
 * @export
 */
shaka.Player.prototype.load = function(manifestUri, opt_startTime,
                                       opt_manifestParserFactory) {
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

  var parser;
  return p.then(function() {
    shaka.asserts.assert(factory, 'Manifest factory should be set!');
    shaka.asserts.assert(this.networkingEngine_,
        'Networking engine should be set!');
    var networkingEngine = /** @type {!shaka.net.NetworkingEngine} */(
        this.networkingEngine_);
    parser = new factory(networkingEngine,
                         this.filterPeriod_.bind(this),
                         this.onError_.bind(this));
    parser.configure(this.config_.manifest);
    return parser.start(manifestUri);
  }.bind(this)).then(function(manifest) {
    this.parser_ = parser;
    this.manifest_ = manifest;
    // TODO: DrmEngine
    // TODO: StreamingEngine
  }.bind(this));
};


/**
 * @param {shakaExtern.PlayerConfiguration} config
 * @export
 */
shaka.Player.prototype.configure = function(config) {
  shaka.asserts.assert(this.config_, 'Config must not be null!');
  this.mergeConfigObjects_(/** @type {!Object} */(this.config_), config,
                           this.defaultConfig_(), '');
  if (this.parser_) {
    this.parser_.configure(this.config_.manifest);
  }
};


/**
 * @return {shakaExtern.PlayerConfiguration}
 * @export
 */
shaka.Player.prototype.getConfiguration = function() {
  return /** @type {shakaExtern.PlayerConfiguration} */(
      this.cloneObject_(/** @type {!Object} */(this.config_)));
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

  shaka.asserts.assert(destination, 'Destination config must not be null!');

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
    } else {
      destination[k] = source[k];
    }
  }
};


/**
 * @param {!Object} source
 * @return {!Object}
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
        customScheme: null
      }
    },
    streaming: {
      retryParameters: shaka.net.NetworkingEngine.defaultRetryParameters(),
      rebufferingGoal: 15,
      bufferingGoal: 30,
      byteLimit: 300 << 20  // 300MB
    }
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
};


/**
 * @param {!shaka.util.Error} error
 * @private
 */
shaka.Player.prototype.onError_ = function(error) {
  // TODO
};
