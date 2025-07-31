/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * @externs
 */


/**
 * @typedef {{
 *   manifestUri: string,
 *   preloadManager: ?shaka.media.PreloadManager,
 *   startTime: ?(number|Date),
 *   mimeType: ?string,
 *   config: ?shaka.extern.PlayerConfiguration,
 *   extraText: ?Array<!shaka.extern.ExtraText>,
 *   extraThumbnail: ?Array<string>,
 *   extraChapter: ?Array<!shaka.extern.ExtraChapter>
 * }}
 *
 * @property {string} manifestUri
 * @property {?shaka.media.PreloadManager} preloadManager
 * @property {?(number|Date)} startTime
 * @property {?string} mimeType
 * @property {?shaka.extern.PlayerConfiguration} config
 * @property {?Array<!shaka.extern.ExtraText>} extraText
 * @property {?Array<string>} extraThumbnail
 * @property {?Array<!shaka.extern.ExtraChapter>} extraChapter
 * @exportDoc
 */
shaka.extern.QueueItem;

/**
 * An object that's responsible for all the queue-related logic
 * in the player.
 *
 * @interface
 * @extends {shaka.util.IDestroyable}
 * @exportDoc
 */
shaka.extern.IQueueManager = class extends EventTarget {
  /**
   * @return {!Promise}
   */
  destroy() {}

  /**
   * Called by the Player to provide an updated configuration any time it
   * changes.
   *
   * @param {shaka.extern.QueueConfiguration} config
   */
  configure(config) {}

  /**
   * Returns the current configuration.
   *
   * @return {?shaka.extern.QueueConfiguration}
   */
  getConfiguration() {}

  /**
   * Returns the current item.
   *
   * @return {?shaka.extern.QueueItem}
   */
  getCurrentItem() {}

  /**
   * Returns the index of the current playing item.
   *
   * @return {number}
   */
  getCurrentItemIndex() {}

  /**
   * Returns all items.
   *
   * @return {!Array<shaka.extern.QueueItem>}
   */
  getItems() {}

  /**
   * Insert new items in the current queue.
   *
   * @param {!Array<shaka.extern.QueueItem>} items
   */
  insertItems(items) {}

  /**
   * Remove all items.
   *
   * @return {!Promise}
   */
  removeAllItems() {}

  /**
   * Plays a item number in the queue.
   *
   * @param {number} itemIndex
   * @return {!Promise}
   */
  playItem(itemIndex) {}
};


/**
 * A factory for creating the queue manager.
 *
 * @typedef {function(shaka.Player):!shaka.extern.IQueueManager}
 * @exportDoc
 */
shaka.extern.IQueueManager.Factory;
