/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.transmuxer.TransmuxerEngine');

goog.require('goog.asserts');
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
   * @export
   */
  static registerTransmuxer(mimeType, plugin, priority) {
    const TransmuxerEngine = shaka.transmuxer.TransmuxerEngine;
    goog.asserts.assert(priority == undefined || priority > 0,
        'explicit priority must be > 0');
    const mimeTypeNormalizated = TransmuxerEngine.normalizeMimeType_(mimeType);
    const existing = TransmuxerEngine.transmuxerMap_[mimeTypeNormalizated];
    if (!existing || priority >= existing.priority) {
      TransmuxerEngine.transmuxerMap_[mimeTypeNormalizated] = {
        priority: priority,
        plugin: plugin,
      };
    }
  }

  /**
   * @param {string} mimeType
   * @export
   */
  static unregisterTransmuxer(mimeType) {
    const TransmuxerEngine = shaka.transmuxer.TransmuxerEngine;
    const mimeTypeNormalizated = TransmuxerEngine.normalizeMimeType_(mimeType);
    delete TransmuxerEngine.transmuxerMap_[mimeTypeNormalizated];
  }

  /**
   * @return {?shaka.extern.TransmuxerPlugin}
   * @export
   */
  static findTransmuxer(mimeType) {
    const TransmuxerEngine = shaka.transmuxer.TransmuxerEngine;
    const mimeTypeNormalizated = TransmuxerEngine.normalizeMimeType_(mimeType);
    const object = TransmuxerEngine.transmuxerMap_[mimeTypeNormalizated];
    return object ? object.plugin : null;
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
    const transmuxer = transmuxerPlugin();
    const isSupported = transmuxer.isSupported(mimeType, contentType);
    transmuxer.destroy();
    return isSupported;
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
 *   priority: number
 * }}
 * @property {shaka.extern.TransmuxerPlugin} plugin
 *   The associated plugin.
 * @property {number} priority
 *   The plugin's priority.
 */
shaka.transmuxer.TransmuxerEngine.PluginObject;


/**
 * @private {!Object.<string, !shaka.transmuxer.TransmuxerEngine.PluginObject>}
 */
shaka.transmuxer.TransmuxerEngine.transmuxerMap_ = {};


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
  'PREFERRED': 2,
  'APPLICATION': 3,
};

