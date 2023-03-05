/*! @license
 * Shaka Player
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
 * @export
 */
shaka.polyfill.MediaSource = class {
  /**
   * Install the polyfill if needed.
   * @export
   */
  static install() {
    shaka.log.debug('MediaSource.install');

    // MediaSource bugs are difficult to detect without checking for the
    // affected platform.  SourceBuffer is not always exposed on window, for
    // example, and instances are only accessible after setting up MediaSource
    // on a video element.  Because of this, we use UA detection and other
    // platform detection tricks to decide which patches to install.
    const safariVersion = shaka.util.Platform.safariVersion();

    if (!window.MediaSource) {
      shaka.log.info('No MSE implementation available.');
    } else if (window.cast && cast.__platform__ &&
               cast.__platform__.canDisplayType) {
      shaka.log.info('Patching Chromecast MSE bugs.');
      // Chromecast cannot make accurate determinations via isTypeSupported.
      shaka.polyfill.MediaSource.patchCastIsTypeSupported_();
    } else if (safariVersion) {
      // NOTE:  shaka.Player.isBrowserSupported() has its own restrictions on
      // Safari version.
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
      } else if (safariVersion <= 15) {
        shaka.log.info('Patching Safari 13 & 14 & 15 MSE bugs.');
        // Safari 13 does not correctly implement abort() on SourceBuffer.
        // Calling abort() before appending a segment causes that segment to be
        // incomplete in the buffer.
        // Bug filed: https://bugs.webkit.org/show_bug.cgi?id=165342
        shaka.polyfill.MediaSource.stubAbort_();
      }
    } else if (shaka.util.Platform.isEdge()) {
      shaka.log.info('Rejecting TS container.');
      // TS content is broken on Edge in general.
      // See https://github.com/shaka-project/shaka-player/issues/4955
      shaka.polyfill.MediaSource.rejectContainer_('mp2t');
    } else if (shaka.util.Platform.isTizen2() ||
        shaka.util.Platform.isTizen3() ||
        shaka.util.Platform.isTizen4()) {
      shaka.log.info('Rejecting Opus.');
      // Tizen's implementation of MSE does not work well with opus. To prevent
      // the player from trying to play opus on Tizen, we will override media
      // source to always reject opus content.
      shaka.polyfill.MediaSource.rejectCodec_('opus');
    } else {
      shaka.log.info('Using native MSE as-is.');
    }

    if (window.MediaSource &&
        MediaSource.isTypeSupported('video/webm; codecs="vp9"') &&
        !MediaSource.isTypeSupported('video/webm; codecs="vp09.00.10.08"')) {
      shaka.log.info('Patching vp09 support queries.');
      // Only the old, deprecated style of VP9 codec strings is supported.
      // This occurs on older smart TVs.
      // Patch isTypeSupported to translate the new strings into the old one.
      shaka.polyfill.MediaSource.patchVp09_();
    }
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
   * Patch |MediaSource.isTypeSupported| to always reject |container|. This is
   * used when we know that we are on a platform that does not work well with
   * a given container.
   *
   * @param {string} container
   * @private
   */
  static rejectContainer_(container) {
    const isTypeSupported = MediaSource.isTypeSupported;

    MediaSource.isTypeSupported = (mimeType) => {
      const actualContainer = shaka.util.MimeUtils.getContainerType(mimeType);
      return actualContainer != container && isTypeSupported(mimeType);
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
   * Patch isTypeSupported() to chain to a private API on the Chromecast which
   * can query for support of detailed content parameters.
   *
   * @private
   */
  static patchCastIsTypeSupported_() {
    const originalIsTypeSupported = MediaSource.isTypeSupported;

    MediaSource.isTypeSupported = (mimeType) => {
      // Parse the basic MIME type from its parameters.
      const pieces = mimeType.split(/ *; */);
      pieces.shift();  // Remove basic MIME type from pieces.

      const hasCodecs = pieces.some((piece) => piece.startsWith('codecs='));
      if (!hasCodecs) {
        // Though the original reason for this special case was not documented,
        // it is presumed to be because the platform won't accept a MIME type
        // without codecs in canDisplayType.  It is valid, however, in
        // isTypeSupported.
        return originalIsTypeSupported(mimeType);
      }

      // Only canDisplayType can check extended MIME type parameters on this
      // platform (such as frame rate, resolution, etc).
      // In previous versions of this polyfill, the MIME type parameters were
      // manipulated, filtered, or extended.  This is no longer true, so we pass
      // the full MIME type to the platform as we received it.
      return cast.__platform__.canDisplayType(mimeType);
    };
  }

  /**
   * Patch isTypeSupported() to translate vp09 codec strings into vp9, to allow
   * such content to play on older smart TVs.
   *
   * @private
   */
  static patchVp09_() {
    const originalIsTypeSupported = MediaSource.isTypeSupported;

    if (shaka.util.Platform.isWebOS()) {
      // Don't do this on LG webOS as otherwise it is unable
      // to play vp09 at all.
      return;
    }

    MediaSource.isTypeSupported = (mimeType) => {
      // Split the MIME type into its various parameters.
      const pieces = mimeType.split(/ *; */);

      const codecsIndex =
          pieces.findIndex((piece) => piece.startsWith('codecs='));
      if (codecsIndex < 0) {
        // No codec? Call the original without modifying the MIME type.
        return originalIsTypeSupported(mimeType);
      }

      const codecsParam = pieces[codecsIndex];
      const codecs = codecsParam
          .replace('codecs=', '').replace(/"/g, '').split(/\s*,\s*/);

      const vp09Index = codecs.findIndex(
          (codecName) => codecName.startsWith('vp09'));
      if (vp09Index >= 0) {
        // vp09? Replace it with vp9.
        codecs[vp09Index] = 'vp9';
        pieces[codecsIndex] = 'codecs="' + codecs.join(',') + '"';
        mimeType = pieces.join('; ');
      }

      return originalIsTypeSupported(mimeType);
    };
  }
};


shaka.polyfill.register(shaka.polyfill.MediaSource.install);
