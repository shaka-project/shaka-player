/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('TransmuxerEngine', () => {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  const PluginPriority = shaka.transmuxer.TransmuxerEngine.PluginPriority;
  const TransmuxerEngine = shaka.transmuxer.TransmuxerEngine;

  const mimeType = 'video/x-shaka-fake-transmux; codecs="avc1.42E01E"';

  /** @type {!Array<number>} */
  let registeredPriorities;

  beforeEach(() => {
    registeredPriorities = [];
  });

  afterEach(() => {
    for (const priority of registeredPriorities) {
      TransmuxerEngine.unregisterTransmuxer(mimeType, priority);
    }
  });

  /**
   * @param {number} priority
   * @param {function():!shaka.extern.Transmuxer} plugin
   */
  function register(priority, plugin) {
    TransmuxerEngine.registerTransmuxer(mimeType, plugin, priority);
    registeredPriorities.push(priority);
  }

  /** @type {function():!shaka.extern.Transmuxer} */
  const throwingPlugin = () => {
    throw new Error('optional runtime not loaded');
  };

  /**
   * @param {boolean} supported
   * @return {function():!shaka.extern.Transmuxer}
   */
  function fakePlugin(supported) {
    return () => /** @type {!shaka.extern.Transmuxer} */ ({
      isSupported: () => supported,
      destroy: () => {},
    });
  }

  describe('findTransmuxer', () => {
    it('fails closed when the only plugin throws on construction', () => {
      register(PluginPriority.APPLICATION, throwingPlugin);

      expect(() => TransmuxerEngine.findTransmuxer(
          mimeType, ContentType.VIDEO)).not.toThrow();
      expect(TransmuxerEngine.findTransmuxer(
          mimeType, ContentType.VIDEO)).toBe(null);
      expect(TransmuxerEngine.isSupported(
          mimeType, ContentType.VIDEO)).toBe(false);
    });

    it('falls through to a lower-priority plugin that constructs', () => {
      const working = fakePlugin(true);
      register(PluginPriority.APPLICATION, throwingPlugin);
      register(PluginPriority.FALLBACK, working);

      expect(TransmuxerEngine.findTransmuxer(
          mimeType, ContentType.VIDEO)).toBe(working);
      expect(TransmuxerEngine.isSupported(
          mimeType, ContentType.VIDEO)).toBe(true);
    });

    it('falls through, and destroys, when a support probe throws', () => {
      const destroy = jasmine.createSpy('destroy');
      const working = fakePlugin(true);
      register(PluginPriority.APPLICATION,
          () => /** @type {!shaka.extern.Transmuxer} */ ({
            isSupported: () => {
              throw new Error('probe failed');
            },
            destroy: shaka.test.Util.spyFunc(destroy),
          }));
      register(PluginPriority.FALLBACK, working);

      expect(TransmuxerEngine.findTransmuxer(
          mimeType, ContentType.VIDEO)).toBe(working);
      expect(destroy).toHaveBeenCalledTimes(1);
    });
  });

  describe('findTransmuxerPluginPriority', () => {
    it('returns the priority the plugin is registered at', () => {
      const working = fakePlugin(true);
      register(PluginPriority.APPLICATION, throwingPlugin);
      register(PluginPriority.FALLBACK, working);

      expect(TransmuxerEngine.findTransmuxerPluginPriority(
          mimeType, working)).toBe(PluginPriority.FALLBACK);
      expect(TransmuxerEngine.findTransmuxerPluginPriority(
          mimeType, throwingPlugin)).toBe(PluginPriority.APPLICATION);
    });

    it('returns null for a plugin not registered for the type', () => {
      register(PluginPriority.FALLBACK, fakePlugin(true));

      expect(TransmuxerEngine.findTransmuxerPluginPriority(
          mimeType, fakePlugin(true))).toBe(null);
    });
  });
});
