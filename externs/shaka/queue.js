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
 *   extraChapter: ?Array<!shaka.extern.ExtraChapter>,
 *   metadata: ?shaka.extern.QueueItemMetadata,
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
 * @property {?shaka.extern.QueueItemMetadata} metadata
 * @exportDoc
 */
shaka.extern.QueueItem;

/**
 * @typedef {{
 *   title: (string|undefined),
 *   poster: (string|undefined),
 * }}
 *
 * @description
 * Metadata for a QueueItem. Supports additional arbitrary properties that are
 * not type-checked.
 *
 * @property {(string|undefined)} title
 * @property {(string|undefined)} poster
 * @exportDoc
 */
shaka.extern.QueueItemMetadata;

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
   * Set a custom player for preloading, event management and autoplay next.
   * This is useful when using a CastProxy.
   *
   * @param {shaka.Player} player
   */
  setCustomPlayer(player) {}

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

  /**
   * Fetches an M3U/M3U8 playlist from the given URL using the player's
   * networking engine, parses it, and inserts the resulting items into the
   * queue. Supports the extended EXTINF format with tvg-* attributes
   * commonly found in IPTV playlists (tvg-id, tvg-name, tvg-logo,
   * tvg-language, tvg-country, tvg-url, group-title).
   *
   * The parsed tvg-* attribute values are stored in the item's metadata:
   *   - tvg-name  → metadata.title  (falls back to the display name)
   *   - tvg-logo  → metadata.poster
   *   - tvg-id    → metadata.tvgId
   *   - tvg-language → metadata.tvgLanguage
   *   - tvg-country  → metadata.tvgCountry
   *   - tvg-url      → metadata.tvgUrl
   *   - group-title  → metadata.groupTitle
   *   - display name → metadata.displayTitle
   *
   * @param {string} url
   * @param {boolean=} playOnLoad
   * @return {!Promise}
   */
  loadFromM3uPlaylist(url, playOnLoad) {}
};


/**
 * A factory for creating the queue manager.
 *
 * @typedef {function(shaka.Player):!shaka.extern.IQueueManager}
 * @exportDoc
 */
shaka.extern.IQueueManager.Factory;
