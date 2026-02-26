/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.ui.MediaSession');

goog.require('shaka.log');
goog.require('shaka.ads.Utils');
goog.require('shaka.net.NetworkingUtils');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.IReleasable');
goog.require('shaka.util.TXml');

goog.requireType('shaka.Player');
goog.requireType('shaka.ui.Controls');

/**
 * @export
 * @implements {shaka.util.IReleasable}
 */
shaka.ui.MediaSession = class {
  /**
   * @param {!shaka.ui.Controls} controls
   */
  constructor(controls) {
    /** @private {!shaka.ui.Controls} */
    this.controls_ = controls;

    /** @private {shaka.Player} */
    this.player_ = this.controls_.getPlayer();

    /** @private {HTMLMediaElement} */
    this.video_ = this.controls_.getVideo();

    /** @private {shaka.extern.IAdManager} */
    this.adManager_ = this.controls_.getAdManager();

    /** @private {shaka.extern.IQueueManager} */
    this.queueManager_ = this.controls_.getQueueManager();

    /** @private {!shaka.extern.UIConfiguration} */
    this.config_ = this.controls_.getConfig();

    /** @private {shaka.util.EventManager} */
    this.loadEventManager_ = new shaka.util.EventManager();

    /** @private {shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();

    /** @private {boolean} */
    this.supported_ = !!navigator.mediaSession;

    /** @private {boolean} */
    this.enabled_ = false;

    /** @private {boolean} */
    this.supportsChapterInfo_ =
        // eslint-disable-next-line no-restricted-syntax
        this.supported_ && 'chapterInfo' in MediaMetadata.prototype;

    /** @private {!Set<string>} */
    this.actionsHandled_ = new Set();

    if (this.player_.isFullyLoaded()) {
      this.init_();
    }
    this.loadEventManager_.listen(this.player_, 'loading', () => {
      this.init_();
    });
    this.loadEventManager_.listen(this.player_, 'unloading', () => {
      this.stop_();
    });
  }

  /**
   * @param {!shaka.extern.UIConfiguration} config
   * @export
   */
  configure(config) {
    this.stop_();
    this.config_ = config;
    this.init_();
  }

  /**
   * @override
   * @export
   */
  release() {
    if (this.loadEventManager_) {
      this.loadEventManager_.release();
      this.loadEventManager_ = null;
    }
    if (this.eventManager_) {
      this.eventManager_.release();
      this.eventManager_ = null;
    }
    this.stop_();
  }

  /**
   * @private
   */
  stop_() {
    if (!this.enabled_) {
      return;
    }
    this.enabled_ = false;
    if (this.eventManager_) {
      this.eventManager_.removeAll();
    }
    if (this.config_.mediaSession.handleMetadata) {
      navigator.mediaSession.metadata = new MediaMetadata({});
    }
    if (this.config_.mediaSession.handlePosition) {
      this.clearPositionState_();
    }
    for (const actionName of Array.from(this.actionsHandled_)) {
      this.addMediaSessionHandler(actionName);
    }
    this.actionsHandled_.clear();
  }

  /**
   * @private
   */
  init_() {
    if (!this.supported_ || this.enabled_ ||
        !this.config_.mediaSession.enabled) {
      return;
    }
    this.enabled_ = true;

    this.setupMediaSessionActions_();
    this.setupMediaSessionMetadata_();
    this.setupMediaSessionPosition_();
  }

  /**
   * @return {!{title: string, artist: string, album: string,
   *         artwork: Object, chapterInfo: ?Object}}
   */
  getMediaMetadata() {
    const metadata = {
      title: '',
      artist: '',
      album: '',
      artwork: [],
    };
    if (this.supportsChapterInfo_) {
      metadata.chapterInfo = [];
    }
    if (this.supported_ && navigator.mediaSession.metadata) {
      metadata.title = navigator.mediaSession.metadata.title;
      metadata.artist = navigator.mediaSession.metadata.artist;
      metadata.album = navigator.mediaSession.metadata.album;
      metadata.artwork = navigator.mediaSession.metadata.artwork;
      if (this.supportsChapterInfo_) {
        metadata.chapterInfo = navigator.mediaSession.metadata.chapterInfo;
      }
    }
    return metadata;
  }

  /**
   * @param {string} title
   * @export
   */
  setupTitle(title) {
    const castReceiver = this.controls_.getCastReceiver();
    if (castReceiver) {
      castReceiver.setContentTitle(title);
    }
    if (this.supported_) {
      const metadata = this.getMediaMetadata();
      metadata.title = title;
      navigator.mediaSession.metadata = new MediaMetadata(metadata);
    }
  }

  /**
   * @param {string} imageUrl
   * @export
   */
  setupPoster(imageUrl) {
    const video = /** @type {HTMLVideoElement} */ (this.video_);
    if (imageUrl != video.poster) {
      video.poster = imageUrl;
    }
    const castReceiver = this.controls_.getCastReceiver();
    if (castReceiver) {
      castReceiver.setContentImage(imageUrl);
    }
    if (this.supported_) {
      const metadata = this.getMediaMetadata();
      const artwork = {
        src: imageUrl,
      };
      const mimeType =
          shaka.net.NetworkingUtils.getMimeTypeFromUri(imageUrl);
      if (mimeType) {
        artwork.type = mimeType;
      }
      metadata.artwork = [artwork];
      navigator.mediaSession.metadata = new MediaMetadata(metadata);
    }
  }

  /**
   * @param {!Array<!shaka.extern.Chapter>} chapters
   * @export
   */
  setupChapters(chapters) {
    if (!this.supportsChapterInfo_) {
      return;
    }
    const chapterInfo = [];
    for (const chapter of chapters) {
      const info = {
        title: chapter.title,
        startTime: chapter.startTime,
        artwork: [],
      };
      for (const imageInfo of chapter.images) {
        const artwork = {
          src: imageInfo.url,
        };
        if (imageInfo.width && imageInfo.height) {
          artwork.sizes = `${imageInfo.width}x${imageInfo.height}`;
        }
        const mimeType =
            shaka.net.NetworkingUtils.getMimeTypeFromUri(imageInfo.url);
        if (mimeType) {
          artwork.type = mimeType;
        }
        info.artwork.push(artwork);
      }
      chapterInfo.push(info);
    }
    const metadata = this.getMediaMetadata();
    metadata.chapterInfo = chapterInfo;
    navigator.mediaSession.metadata = new MediaMetadata(metadata);
  }

  /**
   * @param {string} type
   * @param {?Function=} callback
   * @export
   */
  addMediaSessionHandler(type, callback = null) {
    if (!this.supported_) {
      return;
    }
    try {
      if (callback) {
        if (!this.config_.mediaSession.supportedActions.includes(type)) {
          return;
        }
        this.actionsHandled_.add(type);
      } else {
        if (!this.actionsHandled_.has(type)) {
          return;
        }
        this.actionsHandled_.delete(type);
      }
      navigator.mediaSession.setActionHandler(type, callback);
    } catch (error) {
      shaka.log.debug(
          `The "${type}" media session action is not supported.`);
    }
  }

  /**
   * @param {!{action: string, seekOffset: ?number,
   *         seekTime: ?number}} details
   * @export
   */
  commonActionHandler(details) {
    const ad = this.controls_.getAd();
    const keyboardSeekDistance = this.config_.keyboardSeekDistance;
    switch (details.action) {
      case 'pause':
        this.controls_.playPausePresentation();
        break;
      case 'play':
        this.controls_.playPausePresentation();
        break;
      case 'seekbackward':
        if (details.seekOffset && !isFinite(details.seekOffset)) {
          break;
        }
        if (!ad || !ad.isLinear()) {
          this.controls_.seekIncrement(
              -(details.seekOffset || keyboardSeekDistance));
        }
        break;
      case 'seekforward':
        if (details.seekOffset && !isFinite(details.seekOffset)) {
          break;
        }
        if (!ad || !ad.isLinear()) {
          this.controls_.seekIncrement(
              details.seekOffset || keyboardSeekDistance);
        }
        break;
      case 'seekto':
        if (details.seekTime && !isFinite(details.seekTime)) {
          break;
        }
        if (!ad || !ad.isLinear()) {
          this.controls_.seekTo(
              this.player_.seekRange().start + details.seekTime);
        }
        break;
      case 'stop':
        this.player_.unload();
        break;
      case 'enterpictureinpicture':
        if (!ad || !ad.isLinear()) {
          this.controls_.togglePiP();
        }
        break;
      case 'nexttrack':
        this.queueManager_.playItem(
            this.queueManager_.getCurrentItemIndex() + 1);
        break;
      case 'previoustrack':
        this.queueManager_.playItem(
            this.queueManager_.getCurrentItemIndex() - 1);
        break;
      case 'skipad':
        if (ad) {
          ad.skip();
        }
        break;
    }
  };

  /**
   * @private
   */
  clearPositionState_() {
    try {
      navigator.mediaSession.setPositionState();
    } catch (error) {
      shaka.log.v2(
          'setPositionState in media session is not supported.');
    }
  }

  /**
   * @private
   */
  setupMediaSessionMetadata_() {
    if (!this.config_.mediaSession.handleMetadata) {
      return;
    }
    this.eventManager_.listen(this.controls_, 'chaptersupdated', () => {
      this.setupChapters(this.controls_.getChapters());
    });
    this.eventManager_.listen(this.player_, 'metadata', (event) => {
      const payload = event['payload'];
      if (!payload) {
        return;
      }
      let title;
      if (payload['key'] == 'TIT2' && payload['data']) {
        title = payload['data'];
      }
      let imageUrl;
      if (payload['key'] == 'APIC' && payload['mimeType'] == '-->') {
        imageUrl = payload['data'];
      }
      if (title) {
        this.setupTitle(title);
      }
      if (imageUrl) {
        this.setupPoster(imageUrl);
      }
    });
    this.eventManager_.listen(this.player_, 'sessiondata', (event) => {
      const id = event['id'];
      switch (id) {
        case 'com.apple.hls.title': {
          const title = event['value'];
          if (title) {
            this.setupTitle(title);
          }
          break;
        }
        case 'com.apple.hls.poster': {
          let imageUrl = event['value'];
          if (imageUrl) {
            imageUrl = imageUrl.replace('{w}', '512')
                .replace('{h}', '512')
                .replace('{f}', 'jpeg');
            this.setupPoster(imageUrl);
          }
          break;
        }
      }
    });
    this.eventManager_.listen(this.player_, 'programinformation', (event) => {
      if (!event['detail']) {
        return;
      }
      const TXml = shaka.util.TXml;
      /** @type {!shaka.extern.xml.Node} */
      const detail =
      /** @type {!shaka.extern.xml.Node} */(event['detail']);
      const titleNode = TXml.findChild(detail, 'Title');
      if (titleNode) {
        const title = TXml.getContents(titleNode);
        if (title) {
          this.setupTitle(title);
        }
      }
    });
    this.eventManager_.listen(this.player_, 'unloading', () => {
      navigator.mediaSession.metadata = new MediaMetadata({});
    });
  }

  /**
   * @private
   */
  setupMediaSessionPosition_() {
    if (!this.config_.mediaSession.handlePosition) {
      return;
    }
    const updatePositionState = () => {
      const ad = this.controls_.getAd();
      if (ad && ad.isLinear()) {
        this.clearPositionState_();
        return;
      }
      const seekRange = this.player_.seekRange();
      let duration = seekRange.end - seekRange.start;
      const position = parseFloat(
          (this.video_.currentTime - seekRange.start).toFixed(2));
      if (this.player_.isLive() && Math.abs(duration - position) < 1) {
        // Positive infinity indicates media without a defined end, such as a
        // live stream.
        duration = Infinity;
      }
      try {
        navigator.mediaSession.setPositionState({
          duration: Math.max(0, duration),
          playbackRate: this.video_.playbackRate,
          position: Math.max(0, position),
        });
      } catch (error) {
        shaka.log.v2(
            'setPositionState in media session is not supported.');
      }
    };
    const playerLoaded = () => {
      if (this.player_.isLive() || this.player_.seekRange().start != 0) {
        updatePositionState();
        this.eventManager_.listen(
            this.video_, 'timeupdate', updatePositionState);
      } else {
        this.clearPositionState_();
      }
    };
    if (this.player_.isFullyLoaded()) {
      playerLoaded();
    }
    this.eventManager_.listen(
        this.player_, 'loaded', playerLoaded);
    this.eventManager_.listen(this.player_, 'unloading', () => {
      this.eventManager_.unlisten(
          this.video_, 'timeupdate', updatePositionState);
    });
  }

  /** @private */
  setupMediaSessionActions_() {
    if (!this.config_.mediaSession.handleActions) {
      return;
    }
    const actionHandler = (details) => {
      this.commonActionHandler(details);
    };
    this.addMediaSessionHandler('pause', actionHandler);
    this.addMediaSessionHandler('play', actionHandler);
    this.addMediaSessionHandler('seekbackward', actionHandler);
    this.addMediaSessionHandler('seekforward', actionHandler);
    this.addMediaSessionHandler('seekto', actionHandler);
    this.addMediaSessionHandler('stop', actionHandler);
    this.addMediaSessionHandler('enterpictureinpicture', actionHandler);

    const checkQueueItems = () => {
      const itemsLength = this.queueManager_.getItems().length;
      const currentIndex = this.queueManager_.getCurrentItemIndex();
      if (itemsLength <= 1 || currentIndex == -1) {
        this.addMediaSessionHandler('previoustrack', null);
        this.addMediaSessionHandler('nexttrack', null);
        return;
      }
      if (currentIndex > 0) {
        this.addMediaSessionHandler('previoustrack', actionHandler);
      } else {
        this.addMediaSessionHandler('previoustrack', null);
      }
      if ((currentIndex + 1) < itemsLength) {
        this.addMediaSessionHandler('nexttrack', actionHandler);
      } else {
        this.addMediaSessionHandler('nexttrack', null);
      }
    };

    this.eventManager_.listen(
        this.queueManager_, 'currentitemchanged', checkQueueItems);
    this.eventManager_.listen(
        this.queueManager_, 'itemsinserted', checkQueueItems);
    this.eventManager_.listen(
        this.queueManager_, 'itemsremoved', checkQueueItems);
    this.eventManager_.listen(
        this.player_, 'loading', checkQueueItems);

    checkQueueItems();

    const checkSkipAd = () => {
      const ad = this.controls_.getAd();
      if (!ad || !ad.isSkippable() || !ad.canSkipNow()) {
        this.addMediaSessionHandler('skipad', null);
      } else {
        this.addMediaSessionHandler('skipad', actionHandler);
      }
    };

    this.eventManager_.listen(
        this.adManager_, shaka.ads.Utils.AD_STARTED, checkSkipAd);
    this.eventManager_.listen(
        this.adManager_, shaka.ads.Utils.AD_SKIP_STATE_CHANGED, checkSkipAd);
    this.eventManager_.listen(
        this.adManager_, shaka.ads.Utils.AD_STOPPED, checkSkipAd);

    checkSkipAd();
  }
};
