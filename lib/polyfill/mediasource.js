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

  if (!window.MediaSource) {
    shaka.log.info('No MSE implementation available.');
    return;
  }

  // Detection is complicated by the fact that Safari does not expose
  // SourceBuffer on window.  So we can't detect missing features by accessing
  // SourceBuffer.prototype.  That is why we use navigator to detect Safari and
  // particular versions of it.
  var vendor = navigator.vendor;
  var version = navigator.appVersion;
  if (!vendor || !version || vendor.indexOf('Apple') < 0) {
    shaka.log.info('Using native MSE as-is.');
    return;
  }

  if (version.indexOf('Version/8') >= 0) {
    // Safari 8 does not implement appendWindowEnd.  If we ignore the
    // incomplete MSE implementation, some content (especially multi-period)
    // will fail to play correctly.  The best we can do is blacklist Safari 8.
    shaka.log.info('Blacklisting Safari 8 MSE.');
    shaka.polyfill.MediaSource.blacklist_();
  } else if (version.indexOf('Version/9') >= 0) {
    shaka.log.info('Patching Safari 9 MSE bugs.');
    // Safari 9 does not correctly implement abort() on SourceBuffer.
    // Calling abort() causes a decoder failure, rather than resetting the
    // decode timestamp as called for by the spec.
    // Bug filed: http://goo.gl/UZ2rPp
    shaka.polyfill.MediaSource.stubAbort_();
  } else if (version.indexOf('Version/10') >= 0) {
    shaka.log.info('Patching Safari 10 MSE bugs.');
    // Safari 10 does not correctly implement abort() on SourceBuffer.
    // Calling abort() before appending a segment causes that segment to be
    // incomplete in buffer.
    // Bug filed: https://goo.gl/rC3CLj
    shaka.polyfill.MediaSource.stubAbort_();
    // Safari 10 fires spurious 'updateend' events after endOfStream().
    // Bug filed: https://goo.gl/qCeTZr
    shaka.polyfill.MediaSource.patchEndOfStreamEvents_();
  } else {
    shaka.log.info('Using native MSE as-is.');
  }
};


/**
 * Blacklist the current browser by making MediaSourceEngine.isBrowserSupported
 * fail later.
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
  var addSourceBuffer = MediaSource.prototype.addSourceBuffer;
  MediaSource.prototype.addSourceBuffer = function() {
    var sourceBuffer = addSourceBuffer.apply(this, arguments);
    sourceBuffer.abort = function() {};  // Stub out for buggy implementations.
    return sourceBuffer;
  };
};


/**
 * Patch endOfStream() to get rid of 'updateend' events that should not fire.
 * These extra events confuse MediaSourceEngine, which relies on correct events
 * to manage SourceBuffer state.
 *
 * @private
 */
shaka.polyfill.MediaSource.patchEndOfStreamEvents_ = function() {
  var endOfStream = MediaSource.prototype.endOfStream;
  MediaSource.prototype.endOfStream = function() {
    // This bug manifests only when endOfStream() results in the truncation
    // of the MediaSource's duration.  So first we must calculate what the
    // new duration will be.
    var newDuration = 0;
    for (var i = 0; i < this.sourceBuffers.length; ++i) {
      var buffer = this.sourceBuffers[i];
      var bufferEnd = buffer.buffered.end(buffer.buffered.length - 1);
      newDuration = Math.max(newDuration, bufferEnd);
    }

    // If the duration is going to be reduced, suppress the next 'updateend'
    // event on each SourceBuffer.
    if (!isNaN(this.duration) &&
        newDuration < this.duration) {
      this.ignoreUpdateEnd_ = true;
      for (var i = 0; i < this.sourceBuffers.length; ++i) {
        var buffer = this.sourceBuffers[i];
        buffer.eventSuppressed_ = false;
      }
    }

    return endOfStream.apply(this, arguments);
  };

  var addSourceBuffer = MediaSource.prototype.addSourceBuffer;
  MediaSource.prototype.addSourceBuffer = function() {
    // After adding a new source buffer, add an event listener to allow us to
    // suppress events.
    var sourceBuffer = addSourceBuffer.apply(this, arguments);
    sourceBuffer.mediaSource_ = this;
    sourceBuffer.addEventListener('updateend',
        shaka.polyfill.MediaSource.ignoreUpdateEnd_, false);

    if (!this.cleanUpHandlerInstalled_) {
      // If we haven't already, install an event listener to allow us to clean
      // up listeners when MediaSource is torn down.
      this.addEventListener('sourceclose',
          shaka.polyfill.MediaSource.cleanUpListeners_, false);
      this.cleanUpHandlerInstalled_ = true;
    }
    return sourceBuffer;
  };
};


/**
 * An event listener for 'updateend' which selectively suppresses the events.
 *
 * @see shaka.polyfill.MediaSource.patchEndOfStreamEvents_
 *
 * @param {Event} event
 * @private
 */
shaka.polyfill.MediaSource.ignoreUpdateEnd_ = function(event) {
  var sourceBuffer = event.target;
  var mediaSource = sourceBuffer.mediaSource_;

  if (mediaSource.ignoreUpdateEnd_) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    sourceBuffer.eventSuppressed_ = true;

    for (var i = 0; i < mediaSource.sourceBuffers.length; ++i) {
      var buffer = mediaSource.sourceBuffers[i];
      if (buffer.eventSuppressed_ == false) {
        // More events need to be suppressed.
        return;
      }
    }

    // All events have been suppressed, all buffers are out of 'updating'
    // mode.  Stop suppressing events.
    mediaSource.ignoreUpdateEnd_ = false;
  }
};


/**
 * An event listener for 'sourceclose' which cleans up listeners for 'updateend'
 * to avoid memory leaks.
 *
 * @see shaka.polyfill.MediaSource.patchEndOfStreamEvents_
 * @see shaka.polyfill.MediaSource.ignoreUpdateEnd_
 *
 * @param {Event} event
 * @private
 */
shaka.polyfill.MediaSource.cleanUpListeners_ = function(event) {
  var mediaSource = event.target;
  for (var i = 0; i < mediaSource.sourceBuffers.length; ++i) {
    var buffer = mediaSource.sourceBuffers[i];
    buffer.removeEventListener('updateend',
        shaka.polyfill.MediaSource.ignoreUpdateEnd_, false);
  }
  mediaSource.removeEventListener('sourceclose',
      shaka.polyfill.MediaSource.cleanUpListeners_, false);
};


shaka.polyfill.register(shaka.polyfill.MediaSource.install);
