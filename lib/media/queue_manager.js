/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.QueueManager');

goog.require('goog.asserts');
goog.require('shaka.config.RepeatMode');
goog.require('shaka.util.Error');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.IDestroyable');
goog.requireType('shaka.Player');
goog.requireType('shaka.media.PreloadManager');

/**
 * @implements {shaka.util.IDestroyable}
 * @export
 */
shaka.media.QueueManager = class extends shaka.util.FakeEventTarget {
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
     * @private {?{item: shaka.extern.QueueItem,
     *             preloadManager: ?shaka.media.PreloadManager}}
     */
    this.preloadNext_ = null;

    /** @private {shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();
  }

  /**
   * @override
   * @export
   */
  async destroy() {
    await this.removeAllItems();
    if (this.player_) {
      this.player_ = null;
    }
    if (this.eventManager_) {
      this.eventManager_.release();
      this.eventManager_ = null;
    }

    // FakeEventTarget implements IReleasable
    super.release();
  }

  /**
   * Called by the Player to provide an updated configuration any time it
   * changes.
   *
   * @param {shaka.extern.QueueConfiguration} config
   * @export
   */
  configure(config) {
    this.config_ = config;
  }

  /**
   * Returns the current configuration.
   *
   * @return {?shaka.extern.QueueConfiguration}
   * @export
   */
  getConfiguration() {
    return this.config_;
  }

  /**
   * Returns the current item.
   *
   * @return {?shaka.extern.QueueItem}
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
   * Returns the index of the current playing item.
   *
   * @return {?number}
   * @export
   */
  getCurrentItemIndex() {
    if (this.currentItemIndex_ == -1) {
      return null;
    }
    return this.currentItemIndex_;
  }

  /**
   * Returns all items.
   *this.player_.preload(
   * @return {!Array<shaka.extern.QueueItem>}
   * @export
   */
  getItems() {
    return this.items_;
  }

  /**
   * Insert new items in the current queue.
   *
   * @param {!Array<shaka.extern.QueueItem>} items
   * @export
   */
  insertItems(items) {
    this.items_.push(...items);
    this.dispatchEvent(new shaka.util.FakeEvent(
        shaka.util.FakeEvent.EventName.ItemsInserted));
  }

  /**
   * Remove all items.
   *
   * @return {!Promise}
   * @export
   */
  async removeAllItems() {
    this.eventManager_.removeAll();
    if (this.items_.length) {
      this.player_.unload();
    }
    if (this.preloadNext_) {
      if (!this.preloadNext_.preloadManager.isDestroyed()) {
        await this.preloadNext_.preloadManager.destroy();
      }
      this.preloadNext_ = null;
    }
    this.items_ = [];
    this.dispatchEvent(new shaka.util.FakeEvent(
        shaka.util.FakeEvent.EventName.ItemsRemoved));
  }

  /**
   * Plays a item number in the queue.
   *
   * @param {number} itemIndex
   * @return {!Promise}
   * @export
   */
  async playItem(itemIndex) {
    goog.asserts.assert(this.player_, 'We should have player');
    this.eventManager_.removeAll();
    if (!this.items_.length || itemIndex >= this.items_.length) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.PLAYER,
          shaka.util.Error.Code.INDEX_OUT_OF_BOUNDS);
    }
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
            if (nextItem) {
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

    if (item.config) {
      this.player_.resetConfiguration();
      this.player_.configure(item.config);
    }
    let assetUriOrPreloader = item.manifestUri;
    if (this.preloadNext_ && this.preloadNext_.item == item &&
        this.preloadNext_.preloadManager) {
      assetUriOrPreloader = this.preloadNext_.preloadManager;
    }
    await this.player_.load(assetUriOrPreloader, item.startTime, item.mimeType);
    this.preloadNext_ = null;
  }
};
