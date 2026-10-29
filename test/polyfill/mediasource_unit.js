/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('MediaSource polyfill', () => {
  /* eslint-disable @stylistic/max-len */
  // cspell:disable
  const ps4 = 'Mozilla/5.0 (PlayStation 4 WebMAF) AppleWebKit/538.8 (KHTML, like Gecko) WebMAF/v2.3.0-0-g349b724';
  const ps5 = 'Mozilla/5.0 (PlayStation; PlayStation 5/10.00) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
  const safari12 = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.2 Safari/605.1.15';
  const safari14 = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Safari/605.1.15';
  const webkitStb = 'Mozilla/5.0 (Linux; DT_STB_BCM) AppleWebKit/605.1.15 (KHTML, like Gecko)';
  // cspell:enable
  /* eslint-enable @stylistic/max-len */

  const Util = shaka.test.Util;
  const originalUserAgent = navigator.userAgent;

  // install() patches these globals, so they are restored after every test.
  // SourceBuffer is not exposed on window on every platform (Tizen 3, for
  // example).
  /* eslint-disable no-restricted-syntax */
  const originalAddSourceBuffer = MediaSource.prototype.addSourceBuffer;
  const originalRemove =
      window.SourceBuffer ? SourceBuffer.prototype.remove : null;
  /* eslint-enable no-restricted-syntax */
  const originalIsTypeSupported = MediaSource.isTypeSupported;
  const originalManagedIsTypeSupported =
      window.ManagedMediaSource ? ManagedMediaSource.isTypeSupported : null;

  afterEach(() => {
    Util.setUserAgent(originalUserAgent);
    /* eslint-disable no-restricted-syntax */
    MediaSource.prototype.addSourceBuffer = originalAddSourceBuffer;
    if (originalRemove) {
      SourceBuffer.prototype.remove = originalRemove;
    }
    /* eslint-enable no-restricted-syntax */
    MediaSource.isTypeSupported = originalIsTypeSupported;
    if (originalManagedIsTypeSupported) {
      ManagedMediaSource.isTypeSupported = originalManagedIsTypeSupported;
    }
  });

  /**
   * @param {string} userAgent
   * @param {function(new:shaka.device.IDevice)} Device
   */
  function installOn(userAgent, Device) {
    Util.setUserAgent(userAgent);
    spyOn(shaka.device.DeviceFactory, 'getDevice').and.returnValue(
        new Device());
    shaka.polyfill.MediaSource.install();
  }

  /** @return {boolean} */
  function abortIsStubbed() {
    // eslint-disable-next-line no-restricted-syntax
    return MediaSource.prototype.addSourceBuffer !== originalAddSourceBuffer;
  }

  /** @return {boolean} */
  function removalRangeIsPatched() {
    if (!window.SourceBuffer) {
      return false;
    }
    // eslint-disable-next-line no-restricted-syntax
    return SourceBuffer.prototype.remove !== originalRemove;
  }

  // Patching remove() requires SourceBuffer on window.
  function requireSourceBuffer() {
    if (!window.SourceBuffer) {
      pending('SourceBuffer is not exposed on window');
    }
  }

  it('does not apply the Safari patches on PlayStation 4', () => {
    installOn(ps4, shaka.device.PlayStation);
    expect(abortIsStubbed()).toBe(false);
    expect(removalRangeIsPatched()).toBe(false);
  });

  it('does not apply the Safari patches on PlayStation 5', () => {
    installOn(ps5, shaka.device.PlayStation);
    expect(abortIsStubbed()).toBe(false);
    expect(removalRangeIsPatched()).toBe(false);
  });

  it('patches abort() and remove() on Safari 12', () => {
    requireSourceBuffer();
    installOn(safari12, shaka.device.AppleBrowser);
    expect(abortIsStubbed()).toBe(true);
    expect(removalRangeIsPatched()).toBe(true);
  });

  it('patches only abort() on Safari 14', () => {
    installOn(safari14, shaka.device.AppleBrowser);
    expect(abortIsStubbed()).toBe(true);
    expect(removalRangeIsPatched()).toBe(false);
  });

  it('patches abort() and remove() on WebKit STBs reporting version 11',
      () => {
        requireSourceBuffer();
        installOn(webkitStb, shaka.device.WebKitSTB);
        expect(abortIsStubbed()).toBe(true);
        expect(removalRangeIsPatched()).toBe(true);
      });

  describe('rejecting codecs', () => {
    /**
     * Installs the polyfill for a device that rejects |codecs|, over a
     * MediaSource that claims to support everything.
     *
     * @param {!Array<string>} codecs
     */
    function installRejecting(codecs) {
      MediaSource.isTypeSupported = () => true;
      if (window.ManagedMediaSource) {
        ManagedMediaSource.isTypeSupported = () => true;
      }

      const device = new shaka.device.DefaultBrowser();
      spyOn(device, 'rejectCodecs').and.returnValue(codecs);
      spyOn(shaka.device.DeviceFactory, 'getDevice').and.returnValue(device);
      shaka.polyfill.MediaSource.install();
    }

    it('rejects the codec', () => {
      installRejecting(['opus']);
      expect(MediaSource.isTypeSupported('audio/webm; codecs="opus"'))
          .toBe(false);
    });

    it('ignores case', () => {
      installRejecting(['opus']);
      expect(MediaSource.isTypeSupported('audio/mp4; codecs="Opus"'))
          .toBe(false);
    });

    it('rejects the codec alongside others', () => {
      installRejecting(['opus']);
      expect(MediaSource.isTypeSupported(
          'video/webm; codecs="vp09.00.10.08, opus"')).toBe(false);
    });

    it('accepts other codecs', () => {
      installRejecting(['opus']);
      expect(MediaSource.isTypeSupported('audio/mp4; codecs="mp4a.40.2"'))
          .toBe(true);
      expect(MediaSource.isTypeSupported(
          'video/mp4; codecs="avc1.42E01E,mp4a.40.2"')).toBe(true);
      expect(MediaSource.isTypeSupported('audio/webm')).toBe(true);
    });

    it('accepts the codec on other devices', () => {
      installRejecting([]);
      expect(MediaSource.isTypeSupported('audio/webm; codecs="opus"'))
          .toBe(true);
    });

    it('rejects the codec in ManagedMediaSource', () => {
      if (!window.ManagedMediaSource) {
        pending('ManagedMediaSource is not available');
      }
      installRejecting(['opus']);
      expect(ManagedMediaSource.isTypeSupported('audio/webm; codecs="opus"'))
          .toBe(false);
      expect(ManagedMediaSource.isTypeSupported(
          'audio/mp4; codecs="mp4a.40.2"')).toBe(true);
    });
  });
});
