/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.transmuxer.TransmuxerEngine');

goog.require('shaka.util.IDestroyable');


// TODO: revisit this when Closure Compiler supports partially-exported classes.
/**
 * @summary Manages transmuxer plugins.
 * @implements {shaka.util.IDestroyable}
 * @export
 */
shaka.transmuxer.TransmuxerEngine = class {
  // TODO: revisit this when the compiler supports partially-exported classes.
  /**
   * @override
   * @export
   */
  destroy() {}

  /**
   * @param {string} mimeType
   * @param {!shaka.extern.TransmuxerPlugin} plugin
   * @param {number} priority
   * @export
   */
  static registerTransmuxer(mimeType, plugin, priority) {
    const TransmuxerEngine = shaka.transmuxer.TransmuxerEngine;
    const normalizedMimetype = TransmuxerEngine.normalizeMimeType_(mimeType);
    const key = normalizedMimetype + '-' + priority;
    TransmuxerEngine.transmuxerMap_.set(key, {
      priority: priority,
      plugin: plugin,
    });
  }

  /**
   * @param {string} mimeType
   * @param {number} priority
   * @export
   */
  static unregisterTransmuxer(mimeType, priority) {
    const TransmuxerEngine = shaka.transmuxer.TransmuxerEngine;
    const normalizedMimetype = TransmuxerEngine.normalizeMimeType_(mimeType);
    const key = normalizedMimetype + '-' + priority;
    TransmuxerEngine.transmuxerMap_.delete(key);
  }

  /**
   * @param {string} mimeType
   * @param {string=} contentType
   * @return {?shaka.extern.TransmuxerPlugin}
   * @export
   */
  static findTransmuxer(mimeType, contentType) {
    const TransmuxerEngine = shaka.transmuxer.TransmuxerEngine;
    for (const priority of TransmuxerEngine.PLUGIN_PRIORITY_ORDER) {
      const plugin = TransmuxerEngine.findTransmuxerPlugin(mimeType, priority);
      if (!plugin) {
        continue;
      }
      const transmuxer = plugin();
      const isSupported = transmuxer.isSupported(mimeType, contentType);
      transmuxer.destroy();
      if (isSupported) {
        return plugin;
      }
    }
    return null;
  }

  /**
   * Finds a plugin registered for |mimeType| without instantiating it or
   * calling isSupported(). Used by the worker where MediaSource may not be
   * available to validate support.
   *
   * When |priority| is null (default), returns the highest-priority plugin.
   * When |priority| is specified, returns the plugin at that exact priority or
   * null if none is registered at that level.
   *
   * @param {string} mimeType
   * @param {?number=} priority
   * @return {?shaka.extern.TransmuxerPlugin}
   */
  static findTransmuxerPlugin(mimeType, priority = null) {
    const TransmuxerEngine = shaka.transmuxer.TransmuxerEngine;
    const normalizedMimetype = TransmuxerEngine.normalizeMimeType_(mimeType);
    const priorities = priority !== null ?
        [priority] : TransmuxerEngine.PLUGIN_PRIORITY_ORDER;
    for (const p of priorities) {
      const key = normalizedMimetype + '-' + p;
      const object = TransmuxerEngine.transmuxerMap_.get(key);
      if (object) {
        return object.plugin;
      }
    }
    return null;
  }

  /**
   * @param {string} mimeType
   * @return {string}
   * @private
   */
  static normalizeMimeType_(mimeType) {
    return mimeType.toLowerCase().split(';')[0];
  }

  /**
   * Check if the mime type and the content type is supported.
   * @param {string} mimeType
   * @param {string=} contentType
   * @return {boolean}
   */
  static isSupported(mimeType, contentType) {
    const TransmuxerEngine = shaka.transmuxer.TransmuxerEngine;
    const transmuxerPlugin = TransmuxerEngine.findTransmuxer(mimeType);
    if (!transmuxerPlugin) {
      return false;
    }
    return true;
  }

  /**
   * For any stream, convert its codecs to MP4 codecs.
   * @param {string} contentType
   * @param {string} mimeType
   * @return {string}
   */
  static convertCodecs(contentType, mimeType) {
    const TransmuxerEngine = shaka.transmuxer.TransmuxerEngine;
    const transmuxerPlugin = TransmuxerEngine.findTransmuxer(mimeType);
    if (!transmuxerPlugin) {
      return mimeType;
    }
    const transmuxer = transmuxerPlugin();
    const codecs = transmuxer.convertCodecs(contentType, mimeType);
    transmuxer.destroy();
    return codecs;
  }
};


/**
 * @typedef {{
 *   plugin: shaka.extern.TransmuxerPlugin,
 *   priority: number,
 * }}
 * @property {shaka.extern.TransmuxerPlugin} plugin
 *   The associated plugin.
 * @property {number} priority
 *   The plugin's priority.
 */
shaka.transmuxer.TransmuxerEngine.PluginObject;


/**
 * @private {!Map<string, !shaka.transmuxer.TransmuxerEngine.PluginObject>}
 */
shaka.transmuxer.TransmuxerEngine.transmuxerMap_ = new Map();


/**
 * Priority level for transmuxer plugins.
 * If multiple plugins are provided for the same mime type, only the
 * highest-priority one is used.
 *
 * @enum {number}
 * @export
 */
shaka.transmuxer.TransmuxerEngine.PluginPriority = {
  'FALLBACK': 1,
  'PREFERRED_SECONDARY': 2,
  'PREFERRED': 3,
  'APPLICATION': 4,
};


/**
 * Priorities in descending order (highest first), used when searching for
 * a matching transmuxer plugin.
 *
 * @const {!Array<number>}
 */
shaka.transmuxer.TransmuxerEngine.PLUGIN_PRIORITY_ORDER = [
  shaka.transmuxer.TransmuxerEngine.PluginPriority.APPLICATION,
  shaka.transmuxer.TransmuxerEngine.PluginPriority.PREFERRED,
  shaka.transmuxer.TransmuxerEngine.PluginPriority.PREFERRED_SECONDARY,
  shaka.transmuxer.TransmuxerEngine.PluginPriority.FALLBACK,
];

