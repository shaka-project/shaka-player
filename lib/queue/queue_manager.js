/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.queue.QueueManager');

goog.require('goog.asserts');
goog.require('shaka.Player');
goog.require('shaka.config.RepeatMode');
goog.require('shaka.util.Error');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.IDestroyable');
goog.requireType('shaka.media.PreloadManager');

/**
 * @implements {shaka.extern.IQueueManager}
 * @implements {shaka.util.IDestroyable}
 * @export
 */
shaka.queue.QueueManager = class extends shaka.util.FakeEventTarget {
  /**
   * @param {shaka.Player} player
   */
  constructor(player) {
    super();

    /** @private {?shaka.Player} */
    this.player_ = player;

    /** @private {?shaka.extern.QueueConfiguration} */
    this.config_ = null;

    /** @private {!Array<shaka.extern.QueueItem>} */
    this.items_ = [];

    /** @private {number} */
    this.currentItemIndex_ = -1;

    /**
     * @private {?{
     *   item: shaka.extern.QueueItem,
     *   preloadManager: ?shaka.media.PreloadManager,
     * }}
     */
    this.preloadNext_ = null;

    /**
     * @private {?{
     *   item: shaka.extern.QueueItem,
     *   preloadManager: ?shaka.media.PreloadManager,
     * }}
     */
    this.preloadPrev_ = null;

    /** @private {shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();
  }

  /**
   * @override
   * @export
   */
  async destroy() {
    await this.removeAllItems();
    this.player_ = null;
    if (this.eventManager_) {
      this.eventManager_.release();
      this.eventManager_ = null;
    }

    // FakeEventTarget implements IReleasable
    super.release();
  }

  /**
   * @override
   * @export
   */
  configure(config) {
    this.config_ = config;
  }

  /**
   * @override
   * @export
   */
  getConfiguration() {
    return this.config_;
  }

  /**
   * @override
   * @export
   */
  getCurrentItem() {
    if (this.items_.length && this.currentItemIndex_ >= 0 &&
        this.currentItemIndex_ < this.items_.length) {
      return this.items_[this.currentItemIndex_];
    }
    return null;
  }

  /**
   * @override
   * @export
   */
  getCurrentItemIndex() {
    return this.currentItemIndex_;
  }

  /**
   * @override
   * @export
   */
  getItems() {
    return this.items_.slice();
  }

  /**
   * @override
   * @export
   */
  insertItems(items) {
    this.items_.push(...items);
    this.dispatchEvent(new shaka.util.FakeEvent(
        shaka.util.FakeEvent.EventName.ItemsInserted));
  }

  /**
   * @override
   * @export
   */
  async removeAllItems() {
    this.eventManager_.removeAll();
    if (this.items_.length && this.currentItemIndex_ >= 0) {
      await this.player_.unload();
    }
    const promises = [];
    if (this.preloadPrev_) {
      if (!this.preloadPrev_.preloadManager.isDestroyed()) {
        promises.push(this.preloadPrev_.preloadManager.destroy());
      }
      this.preloadPrev_ = null;
    }
    if (this.preloadNext_) {
      if (!this.preloadNext_.preloadManager.isDestroyed()) {
        promises.push(this.preloadNext_.preloadManager.destroy());
      }
      this.preloadNext_ = null;
    }
    for (const item of this.items_) {
      if (item.preloadManager && !item.preloadManager.isDestroyed()) {
        promises.push(item.preloadManager.destroy());
      }
    }
    if (promises.length) {
      await Promise.all(promises);
    }
    this.items_ = [];
    this.currentItemIndex_ = -1;
    this.dispatchEvent(new shaka.util.FakeEvent(
        shaka.util.FakeEvent.EventName.ItemsRemoved));
  }

  /**
   * @override
   * @export
   */
  async playItem(itemIndex) {
    goog.asserts.assert(this.player_, 'We should have player');
    this.eventManager_.removeAll();
    if (!this.items_.length || itemIndex >= this.items_.length) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.PLAYER,
          shaka.util.Error.Code.QUEUE_INDEX_OUT_OF_BOUNDS);
    }
    const currentItem = this.getCurrentItem();
    const item = this.items_[itemIndex];
    if (this.currentItemIndex_ != itemIndex) {
      this.currentItemIndex_ = itemIndex;
      this.dispatchEvent(new shaka.util.FakeEvent(
          shaka.util.FakeEvent.EventName.CurrentItemChanged));
    }

    const mediaElement = this.player_.getMediaElement();
    const preloadNextUrlWindow =
        this.config_ ? this.config_.preloadNextUrlWindow : 0;
    if (preloadNextUrlWindow > 0) {
      let preloadInProcess = false;
      this.eventManager_.listen(mediaElement, 'timeupdate', async () => {
        if (this.preloadNext_ || this.items_.length <= 1 || preloadInProcess ||
            this.player_.isLive() || !mediaElement.duration) {
          return;
        }
        const timeToEnd =
            this.player_.seekRange().end - mediaElement.currentTime;
        if (!isNaN(timeToEnd)) {
          if (timeToEnd <= preloadNextUrlWindow) {
            const repeatMode = this.config_ && this.config_.repeatMode;
            let nextItem = null;
            if ((this.currentItemIndex_ + 1) < this.items_.length) {
              nextItem = this.items_[this.currentItemIndex_ + 1];
            } else if (repeatMode == shaka.config.RepeatMode.ALL) {
              nextItem = this.items_[0];
            }
            if (nextItem && (!nextItem.preloadManager ||
                nextItem.preloadManager.isDestroyed())) {
              preloadInProcess = true;
              let preloadManager = null;
              try {
                preloadManager = await this.player_.preload(
                    nextItem.manifestUri,
                    nextItem.startTime,
                    nextItem.mimeType,
                    nextItem.config);
              } catch (error) {
                preloadManager = null;
                // Ignore errors.
              }
              this.preloadNext_ = {
                item: nextItem,
                preloadManager,
              };
              preloadInProcess = false;
            }
          }
        }
      });
    }
    this.eventManager_.listen(this.player_, 'complete', () => {
      const repeatMode = this.config_ && this.config_.repeatMode;
      let playAgain = false;
      if (repeatMode == shaka.config.RepeatMode.SINGLE) {
        playAgain = true;
      } else {
        const nextItemIndex = this.currentItemIndex_ + 1;
        if (nextItemIndex < this.items_.length) {
          this.playItem(nextItemIndex);
        } else if (repeatMode == shaka.config.RepeatMode.ALL) {
          if (this.items_.length == 1) {
            playAgain = true;
          } else {
            this.playItem(0);
          }
        }
      }
      if (playAgain) {
        if (mediaElement.paused) {
          mediaElement.currentTime = this.player_.seekRange().start;
          mediaElement.play();
        } else {
          this.eventManager_.listen(mediaElement, 'paused', () => {
            mediaElement.currentTime = this.player_.seekRange().start;
            mediaElement.play();
          });
        }
      }
    });
    let assetUriOrPreloader = item.manifestUri;
    if (item.preloadManager && !item.preloadManager.isDestroyed()) {
      assetUriOrPreloader = item.preloadManager;
    }
    let usingPrev = false;
    if (this.preloadNext_ && this.preloadNext_.item == item &&
        this.preloadNext_.preloadManager) {
      assetUriOrPreloader = this.preloadNext_.preloadManager;
    } else if (this.preloadPrev_ && this.preloadPrev_.item == item &&
        this.preloadPrev_.preloadManager) {
      assetUriOrPreloader = this.preloadPrev_.preloadManager;
      usingPrev = true;
    }
    if (this.preloadPrev_) {
      if (!usingPrev && !this.preloadPrev_.preloadManager.isDestroyed()) {
        await this.preloadPrev_.preloadManager.destroy();
      }
      this.preloadPrev_ = null;
    }
    if (this.config_ && this.config_.preloadPrevItem && currentItem &&
        this.player_.getLoadMode() === shaka.Player.LoadMode.MEDIA_SOURCE) {
      let preloadManager = null;
      try {
        preloadManager = await this.player_.unloadAndSavePreload();
      } catch (error) {
        preloadManager = null;
        // Ignore errors.
      }
      this.preloadPrev_ = {
        item: currentItem,
        preloadManager,
      };
    }
    if (item.config) {
      this.player_.resetConfiguration();
      this.player_.configure(item.config);
    }
    await this.player_.load(assetUriOrPreloader, item.startTime, item.mimeType);
    this.preloadNext_ = null;

    if (item.extraText) {
      for (const extraText of item.extraText) {
        if (extraText.mime) {
          this.player_.addTextTrackAsync(extraText.uri, extraText.language,
              extraText.kind, extraText.mime, extraText.codecs);
        } else {
          this.player_.addTextTrackAsync(extraText.uri, extraText.language,
              extraText.kind);
        }
      }
    }
    if (item.extraThumbnail) {
      for (const extraThumbnail of item.extraThumbnail) {
        this.player_.addThumbnailsTrack(extraThumbnail);
      }
    }
    if (item.extraChapter) {
      for (const extraChapter of item.extraChapter) {
        this.player_.addChaptersTrack(
            extraChapter.uri, extraChapter.language, extraChapter.mime);
      }
    }
  }
};


shaka.Player.setQueueManagerFactory((player) => {
  return new shaka.queue.QueueManager(player);
});

