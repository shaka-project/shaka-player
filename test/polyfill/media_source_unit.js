/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('MediaSource', () => {
  const originalMediaSource = window.MediaSource;

  afterEach(() => {
    window.MediaSource = originalMediaSource;
  });

  describe('rejectCodec_', () => {
    /** @suppress {visibility} */
    function reject(codec) {
      shaka.polyfill.MediaSource.rejectCodec_('opus');
    }

    it('opus returns false', () => {
      reject('opus');
      expect(window.MediaSource.isTypeSupported('audio/mp4; codecs="opus"'))
          .toBe(false);
    });

    it('dvh1 returns false', () => {
      reject('dvh1');
      expect(window.MediaSource.isTypeSupported('video/mp4; codecs="dvh1.05.03"'))
          .toBe(false);
    });

    reject('dvhe');
    it('dvhe returns false', () => {
      expect(window.MediaSource.isTypeSupported('video/mp4; codecs="dvhe.05.03"'))
          .toBe(false);
    });
  });
});
