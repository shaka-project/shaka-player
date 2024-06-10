/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('PatchedMediaKeys_Apple', () => {
  const PatchedMediaKeysApple = shaka.polyfill.PatchedMediaKeysApple;
  let originalMediaKeys;
  let originalHTMLMediaElementPrototypeSetMediaKeys;
  let originalWindowMediaKeys;
  let originalWindowMediaKeySystemAccess;
  let originalNavigatorRequestMediaKeySystemAccess;
  let originalHTMLSVideoElement;
  let originalWebKitMediaKeys;

  beforeEach(() => {
    originalHTMLSVideoElement = window.HTMLVideoElement;
    originalWebKitMediaKeys = window.WebKitMediaKeys;

    Object.defineProperty(window,
        'HTMLVideoElement', {value: {}, configurable: true, writable: true});
    Object.defineProperty(window,
        'WebKitMediaKeys', {value: {}, configurable: true, writable: true});

    originalMediaKeys = /** @type {!Object} */ (
      Object.getOwnPropertyDescriptor(
          // eslint-disable-next-line no-restricted-syntax
          HTMLMediaElement.prototype, 'mediaKeys',
      )
    );

    // eslint-disable-next-line no-restricted-syntax
    originalHTMLMediaElementPrototypeSetMediaKeys = HTMLMediaElement
        .prototype.setMediaKeys;
    originalWindowMediaKeys = window.MediaKeys;
    originalWindowMediaKeySystemAccess = window.MediaKeySystemAccess;
    originalNavigatorRequestMediaKeySystemAccess = navigator
        .requestMediaKeySystemAccess;

    delete window.shakaMediaKeysPolyfill;
  });

  afterEach(() => {
    window.HTMLVideoElement = originalHTMLSVideoElement;
    window.WebKitMediaKeys = originalWebKitMediaKeys;

    Object.defineProperty(
        // eslint-disable-next-line no-restricted-syntax
        HTMLMediaElement.prototype,
        'mediaKeys',
        originalMediaKeys,
    );

    // eslint-disable-next-line no-restricted-syntax
    HTMLMediaElement
        .prototype.setMediaKeys =
        originalHTMLMediaElementPrototypeSetMediaKeys;
    window.MediaKeys = originalWindowMediaKeys;
    window.MediaKeySystemAccess = originalWindowMediaKeySystemAccess;
    navigator
        .requestMediaKeySystemAccess =
      originalNavigatorRequestMediaKeySystemAccess;

    delete window.shakaMediaKeysPolyfill;
  });

  describe('install', () => {
    it('should override browser globals', () => {
      shaka.polyfill.PatchedMediaKeysApple.install();

      expect(shaka.polyfill.PatchedMediaKeysApple.enableUninstall)
          .toBe(undefined);

      expect(
          originalHTMLMediaElementPrototypeSetMediaKeys,
      ).not.toEqual(
          // eslint-disable-next-line no-restricted-syntax
          HTMLMediaElement.prototype.setMediaKeys,
      );

      expect(
          Object.getOwnPropertyDescriptor(
          // eslint-disable-next-line no-restricted-syntax
              HTMLMediaElement.prototype, 'mediaKeys',
          ).value,
      ).toBeNull();

      // eslint-disable-next-line no-restricted-syntax
      expect(HTMLMediaElement.prototype.setMediaKeys)
          .toEqual(PatchedMediaKeysApple.setMediaKeys);

      expect(window.MediaKeys).toEqual(PatchedMediaKeysApple.MediaKeys);
      expect(window.MediaKeySystemAccess)
          .toEqual(PatchedMediaKeysApple.MediaKeySystemAccess);
      expect(navigator.requestMediaKeySystemAccess)
          .toEqual(PatchedMediaKeysApple.requestMediaKeySystemAccess);
      expect(window.shakaMediaKeysPolyfill).toBe('apple');
    });
  });

  describe('uninstall', () => {
    it('should restore browser globals', () => {
      shaka.polyfill.PatchedMediaKeysApple.install(true);

      expect(shaka.polyfill.PatchedMediaKeysApple.enableUninstall)
          .toBe(true);

      shaka.polyfill.PatchedMediaKeysApple.uninstall();

      expect(
          Object.getOwnPropertyDescriptor(
          // eslint-disable-next-line no-restricted-syntax
              HTMLMediaElement.prototype, 'mediaKeys',
          ).value,
      ).not.toBeNull();

      // eslint-disable-next-line no-restricted-syntax
      expect(HTMLMediaElement.prototype.setMediaKeys)
          .toEqual(originalHTMLMediaElementPrototypeSetMediaKeys);

      expect(window.MediaKeys).toEqual(originalWindowMediaKeys);
      expect(window.MediaKeySystemAccess)
          .toEqual(originalWindowMediaKeySystemAccess);
      expect(navigator.requestMediaKeySystemAccess)
          .toEqual(originalNavigatorRequestMediaKeySystemAccess);
      expect(window.shakaMediaKeysPolyfill).toBe('');
    });
  });
});
