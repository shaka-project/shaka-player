/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.polyfill.MediaSource');

goog.require('shaka.log');
goog.require('shaka.polyfill');
goog.require('shaka.util.MimeUtils');
goog.require('shaka.util.Platform');

/**
 * @summary A polyfill to patch MSE bugs.
 */
shaka.polyfill.MediaSource = class {
  /**
   * Install the polyfill if needed.
   */
  static install() {
    shaka.log.debug('MediaSource.install');

    // MediaSource bugs are difficult to detect without checking for the
    // affected platform.  SourceBuffer is not always exposed on window, for
    // example, and instances are only accessible after setting up MediaSource
    // on a video element.  Because of this, we use UA detection and other
    // platform detection tricks to decide which patches to install.

    if (!window.MediaSource) {
      shaka.log.info('No MSE implementation available.');
    } else if (window.cast && cast.__platform__ &&
               cast.__platform__.canDisplayType) {
      shaka.log.info('Patching Chromecast MSE bugs.');
      // Chromecast cannot make accurate determinations via isTypeSupported.
      shaka.polyfill.MediaSource.patchCastIsTypeSupported_();
    } else if (shaka.util.Platform.isApple()) {
      const match = navigator.appVersion.match(/Version\/(\d+)/);
      const version = parseInt(match[1], /* base */ 10);

      // TS content is broken on Safari in general.
      // See https://github.com/google/shaka-player/issues/743
      // and https://bugs.webkit.org/show_bug.cgi?id=165342
      shaka.polyfill.MediaSource.rejectTsContent_();

      if (version <= 10) {
        // Safari 8 does not implement appendWindowEnd.
        // Safari 9 & 10 do not correctly implement abort() on SourceBuffer.
        // Bug filed: https://bugs.webkit.org/show_bug.cgi?id=160316
        // Bug filed: https://bugs.webkit.org/show_bug.cgi?id=165342
        // Safari 10 fires spurious 'updateend' events after endOfStream().
        // Bug filed: https://bugs.webkit.org/show_bug.cgi?id=165336

        // Blacklist these very outdated versions.
        shaka.log.info('Blacklisting MSE on Safari <= 10.');
        shaka.polyfill.MediaSource.blacklist_();
      } else if (version <= 12) {
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
  }

  /**
   * Blacklist the current browser by removing media source. A side-effect of
   * this will be to make |shaka.util.Platform.supportsMediaSource| return
   * |false|.
   *
   * @private
   */
  static blacklist_() {
    window['MediaSource'] = null;
  }

  /**
   * Stub out abort().  On some buggy MSE implementations, calling abort()
   * causes various problems.
   *
   * @private
   */
  static stubAbort_() {
    /* eslint-disable no-restricted-syntax */
    const addSourceBuffer = MediaSource.prototype.addSourceBuffer;
    MediaSource.prototype.addSourceBuffer = function(...varArgs) {
      const sourceBuffer = addSourceBuffer.apply(this, varArgs);
      sourceBuffer.abort = function() {}; // Stub out for buggy implementations.
      return sourceBuffer;
    };
    /* eslint-enable no-restricted-syntax */
  }

  /**
   * Patch remove().  On Safari 11, if you call remove() to remove the content
   * up to a keyframe, Safari will also remove the keyframe and all of the data
   * up to the next one. For example, if the keyframes are at 0s, 5s, and 10s,
   * and you tried to remove 0s-5s, it would instead remove 0s-10s.
   *
   * Offsetting the end of the range seems to be a usable workaround.
   *
   * @private
   */
  static patchRemovalRange_() {
    // eslint-disable-next-line no-restricted-syntax
    const originalRemove = SourceBuffer.prototype.remove;

    // eslint-disable-next-line no-restricted-syntax
    SourceBuffer.prototype.remove = function(startTime, endTime) {
      // eslint-disable-next-line no-restricted-syntax
      return originalRemove.call(this, startTime, endTime - 0.001);
    };
  }

  /**
   * Patch isTypeSupported() to reject TS content.  Used to avoid TS-related MSE
   * bugs on Safari.
   *
   * @private
   */
  static rejectTsContent_() {
    const originalIsTypeSupported = MediaSource.isTypeSupported;

    MediaSource.isTypeSupported = (mimeType) => {
      // Parse the basic MIME type from its parameters.
      const pieces = mimeType.split(/ *; */);
      const basicMimeType = pieces[0];
      const container = basicMimeType.split('/')[1];

      if (container.toLowerCase() == 'mp2t') {
        return false;
      }

      return originalIsTypeSupported(mimeType);
    };
  }

  /**
   * Patch |MediaSource.isTypeSupported| to always reject |codec|. This is used
   * when we know that we are on a platform that does not work well with a given
   * codec.
   *
   * @param {string} codec
   * @private
   */
  static rejectCodec_(codec) {
    const isTypeSupported = MediaSource.isTypeSupported;

    MediaSource.isTypeSupported = (mimeType) => {
      const actualCodec = shaka.util.MimeUtils.getCodecBase(mimeType);
      return actualCodec != codec && isTypeSupported(mimeType);
    };
  }

  /**
   * Patch isTypeSupported() to parse for HDR-related clues and chain to a
   * private API on the Chromecast which can query for support.
   *
   * @private
   */
  static patchCastIsTypeSupported_() {
    const originalIsTypeSupported = MediaSource.isTypeSupported;

    // Docs from Dolby detailing profile names: https://bit.ly/2T2wKbu
    const dolbyVisionRegex = /^dv(?:h[e1]|a[v1])\./;

    MediaSource.isTypeSupported = (mimeType) => {
      // Parse the basic MIME type from its parameters.
      const pieces = mimeType.split(/ *; */);
      const basicMimeType = pieces.shift();  // Remove pieces[0].

      // Parse the parameters into key-value pairs.
      /** @type {Object.<string, string>} */
      const parameters = {};
      for (const piece of pieces) {
        const kv = piece.split('=');
        const k = kv[0];
        const v = kv[1].replace(/"(.*)"/, '$1');
        parameters[k] = v;
      }

      const codecs = parameters['codecs'];
      if (!codecs) {
        return originalIsTypeSupported(mimeType);
      }

      let isHDR = false;
      let isDolbyVision = false;

      const codecList = codecs.split(',').filter((codec) => {
        if (dolbyVisionRegex.test(codec)) {
          isDolbyVision = true;
        }

        // We take this string as a signal for HDR, but don't remove it.
        // This regex matches the strings "hev1.2" and "hvc1.2".
        if (/^(hev|hvc)1\.2/.test(codec)) {
          isHDR = true;
        }

        // Keep all other strings in the list.
        return true;
      });

      // If the content uses Dolby Vision, we take this as a sign that the
      // content is not HDR after all.
      if (isDolbyVision) {
        isHDR = false;
      }

      // Reconstruct the "codecs" parameter from the results of the filter.
      parameters['codecs'] = codecList.join(',');

      // If the content is HDR, we add this additional parameter so that the
      // Cast platform will check for HDR support.
      if (isHDR) {
        parameters['eotf'] = 'smpte2084';
      }

      // Reconstruct the MIME type, possibly with additional parameters.
      let extendedMimeType = basicMimeType;
      for (const k in parameters) {
        const v = parameters[k];
        extendedMimeType += '; ' + k + '="' + v + '"';
      }
      return cast.__platform__.canDisplayType(extendedMimeType);
    };
  }
};


shaka.polyfill.register(shaka.polyfill.MediaSource.install);
