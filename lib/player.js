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

  /** @private {shakaExtern.RetryParameters} */
  this.defaultRetryParameters_ = {
    maxAttempts: 1,
    baseDelay: 1000,
    backoffFactor: 2,
    fuzzFactor: 0.5,
    timeout: 0
  };
};


/**
 * @override
 */
shaka.Player.prototype.destroy = function() {
  var p = Promise.all([
    this.parser_ ? this.parser_.stop() : null,
    this.networkingEngine_.destroy()
  ]);

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
    var headRequest = {
      uris: [manifestUri],
      method: 'HEAD',
      body: null,
      headers: {},
      allowCrossSiteCredentials: false,
      retryParameters: this.defaultRetryParameters_
    };
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
                         this.defaultRetryParameters_,
                         this.filterPeriod_.bind(this),
                         this.onError_.bind(this));
    return parser.start(manifestUri);
  }.bind(this)).then(function(manifest) {
    this.parser_ = parser;
    this.manifest_ = manifest;
    // TODO: DrmEngine
    // TODO: StreamingEngine
  }.bind(this));
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
