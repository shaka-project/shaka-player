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

goog.provide('shaka.polyfill.MediaSource');

goog.require('shaka.log');
goog.require('shaka.polyfill.register');
goog.require('shaka.util.MimeUtils');
goog.require('shaka.util.Platform');

/**
 * @namespace shaka.polyfill.MediaSource
 *
 * @summary A polyfill to patch MSE bugs.
 */


/**
 * Install the polyfill if needed.
 */
shaka.polyfill.MediaSource.install = function() {
  shaka.log.debug('MediaSource.install');

  // MediaSource bugs are difficult to detect without checking for the affected
  // platform.  SourceBuffer is not always exposed on window, for example, and
  // instances are only accessible after setting up MediaSource on a video
  // element.  Because of this, we use UA detection and other platform detection
  // tricks to decide which patches to install.
  const safariVersion = shaka.util.Platform.safariVersion();

  if (!window.MediaSource) {
    shaka.log.info('No MSE implementation available.');
  } else if (window.cast && cast.__platform__ &&
             cast.__platform__.canDisplayType) {
    shaka.log.info('Patching Chromecast MSE bugs.');
    // Chromecast cannot make accurate determinations via isTypeSupported.
    shaka.polyfill.MediaSource.patchCastIsTypeSupported_();
  } else if (safariVersion) {
    // TS content is broken on Safari in general.
    // See https://github.com/google/shaka-player/issues/743
    // and https://bugs.webkit.org/show_bug.cgi?id=165342
    shaka.polyfill.MediaSource.rejectTsContent_();

    if (safariVersion <= 12) {
      shaka.log.info('Patching Safari 11 & 12 MSE bugs.');
      // Safari 11 & 12 do not correctly implement abort() on SourceBuffer.
      // Calling abort() before appending a segment causes that segment to be
      // incomplete in the buffer.
      // Bug filed: https://bugs.webkit.org/show_bug.cgi?id=165342
      shaka.polyfill.MediaSource.stubAbort_();

      // If you remove up to a keyframe, Safari 11 & 12 incorrectly will also
      // remove that keyframe and the content up to the next.
      // Offsetting the end of the removal range seems to help.
      // Bug filed: https://bugs.webkit.org/show_bug.cgi?id=177884
      shaka.polyfill.MediaSource.patchRemovalRange_();
    } else {
      shaka.log.info('Patching Safari 13 MSE bugs.');
      // Safari 13 does not correctly implement abort() on SourceBuffer.
      // Calling abort() before appending a segment causes that segment to be
      // incomplete in the buffer.
      // Bug filed: https://bugs.webkit.org/show_bug.cgi?id=165342
      shaka.polyfill.MediaSource.stubAbort_();
    }
  } else if (shaka.util.Platform.isTizen()) {
    // Tizen's implementation of MSE does not work well with opus. To prevent
    // the player from trying to play opus on Tizen, we will override media
    // source to always reject opus content.

    shaka.polyfill.MediaSource.rejectCodec_('opus');
  } else {
    shaka.log.info('Using native MSE as-is.');
  }
};


/**
 * Blacklist the current browser by removing media source. A side-effect of this
 * will be to make |shaka.util.Platform.supportsMediaSource| return |false|.
 *
 * @private
 */
shaka.polyfill.MediaSource.blacklist_ = function() {
  window['MediaSource'] = null;
};


/**
 * Stub out abort().  On some buggy MSE implementations, calling abort() causes
 * various problems.
 *
 * @private
 */
shaka.polyfill.MediaSource.stubAbort_ = function() {
  const addSourceBuffer = MediaSource.prototype.addSourceBuffer;
  MediaSource.prototype.addSourceBuffer = function(...varArgs) {
    let sourceBuffer = addSourceBuffer.apply(this, varArgs);
    sourceBuffer.abort = function() {};  // Stub out for buggy implementations.
    return sourceBuffer;
  };
};


/**
 * Patch remove().  On Safari 11, if you call remove() to remove the content up
 * to a keyframe, Safari will also remove the keyframe and all of the data up to
 * the next one. For example, if the keyframes are at 0s, 5s, and 10s, and you
 * tried to remove 0s-5s, it would instead remove 0s-10s.
 *
 * Offsetting the end of the range seems to be a usable workaround.
 *
 * @private
 */
shaka.polyfill.MediaSource.patchRemovalRange_ = function() {
  const originalRemove = SourceBuffer.prototype.remove;

  SourceBuffer.prototype.remove = function(startTime, endTime) {
    return originalRemove.call(this, startTime, endTime - 0.001);
  };
};


/**
 * Patch isTypeSupported() to reject TS content.  Used to avoid TS-related MSE
 * bugs on Safari.
 *
 * @private
 */
shaka.polyfill.MediaSource.rejectTsContent_ = function() {
  const originalIsTypeSupported = MediaSource.isTypeSupported;

  MediaSource.isTypeSupported = function(mimeType) {
    // Parse the basic MIME type from its parameters.
    let pieces = mimeType.split(/ *; */);
    let basicMimeType = pieces[0];
    let container = basicMimeType.split('/')[1];

    if (container.toLowerCase() == 'mp2t') {
      return false;
    }

    return originalIsTypeSupported(mimeType);
  };
};


/**
 * Patch |MediaSource.isTypeSupported| to always reject |codec|. This is used
 * when we know that we are on a platform that does not work well with a given
 * codec.
 *
 * @param {string} codec
 * @private
 */
shaka.polyfill.MediaSource.rejectCodec_ = function(codec) {
  const isTypeSupported = MediaSource.isTypeSupported;

  MediaSource.isTypeSupported = (mimeType) => {
    const actualCodec = shaka.util.MimeUtils.getCodecBase(mimeType);
    return actualCodec != codec && isTypeSupported(mimeType);
  };
};


/**
 * Patch isTypeSupported() to parse for HDR-related clues and chain to a private
 * API on the Chromecast which can query for support.
 *
 * @private
 */
shaka.polyfill.MediaSource.patchCastIsTypeSupported_ = function() {
  const originalIsTypeSupported = MediaSource.isTypeSupported;

  // Docs from Dolby detailing profile names: https://bit.ly/2T2wKbu
  let dolbyVisionRegex = /^dv(?:h[e1]|a[v1])\./;

  MediaSource.isTypeSupported = function(mimeType) {
    // Parse the basic MIME type from its parameters.
    let pieces = mimeType.split(/ *; */);
    let basicMimeType = pieces[0];

    // Parse the parameters into key-value pairs.
    /** @type {Object.<string, string>} */
    let parameters = {};
    for (let i = 1; i < pieces.length; ++i) {
      let kv = pieces[i].split('=');
      let k = kv[0];
      let v = kv[1].replace(/"(.*)"/, '$1');
      parameters[k] = v;
    }

    let codecs = parameters['codecs'];
    if (!codecs) {
      return originalIsTypeSupported(mimeType);
    }

    let isHDR = false;
    let isDolbyVision = false;

    let codecList = codecs.split(',').filter(function(codec) {
      if (dolbyVisionRegex.test(codec)) {
        isDolbyVision = true;
      }

      // We take this string as a signal for HDR, but don't remove it.
      if (/^(hev|hvc)1\.2/.test(codec)) {
        isHDR = true;
      }

      // Keep all other strings in the list.
      return true;
    });

    // If the content uses Dolby Vision, we take this as a sign that the content
    // is not HDR after all.
    if (isDolbyVision) isHDR = false;

    // Reconstruct the "codecs" parameter from the results of the filter.
    parameters['codecs'] = codecList.join(',');

    // If the content is HDR, we add this additional parameter so that the Cast
    // platform will check for HDR support.
    if (isHDR) {
      parameters['eotf'] = 'smpte2084';
    }

    // Reconstruct the MIME type, possibly with additional parameters.
    let extendedMimeType = basicMimeType;
    for (let k in parameters) {
      let v = parameters[k];
      extendedMimeType += '; ' + k + '="' + v + '"';
    }
    return cast.__platform__.canDisplayType(extendedMimeType);
  };
};


shaka.polyfill.register(shaka.polyfill.MediaSource.install);
