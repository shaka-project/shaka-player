/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Player Cross Boundary', () => {
  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {!shaka.Player} */
  let player;
  /** @type {!shaka.util.EventManager} */
  let eventManager;
  /** @type {shaka.test.Waiter} */
  let waiter;

  beforeAll(() => {
    video = shaka.test.UiUtils.createVideoElement();
    document.body.appendChild(video);
  });

  beforeEach(() => {
    player = new shaka.Player();
    player.addEventListener('error', fail);
    player.attach(video);

    // Disable stall detection, which can interfere with playback tests.
    player.configure('streaming.stallEnabled', false);

    eventManager = new shaka.util.EventManager();
    waiter = new shaka.test.Waiter(eventManager);
  });

  afterEach(async () => {
    await player.destroy();
    player.releaseAllMutexes();

    eventManager.release();
  });

  afterAll(() => {
    document.body.removeChild(video);
  });

  describe('reset', () => {
    const MULTI_PERIOD_ASSET_URI_ =
      '/base/test/test/assets/clear-encrypted/manifest.mpd';

    beforeEach(() => {
      player.configure({
        streaming: {
          crossBoundaryStrategy: shaka.config.CrossBoundaryStrategy.RESET,
        },
        drm: {
          servers: {
            'com.widevine.alpha': 'https://drm-widevine-licensing.axtest.net/AcquireLicense',
          },
          advanced: {
            'com.widevine.alpha': {
              headers: {
                // cspell: disable-next-line
                'X-AxDRM-Message': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZXJzaW9uIjoxLCJjb21fa2V5X2lkIjoiYjMzNjRlYjUtNTFmNi00YWUzLThjOTgtMzNjZWQ1ZTMxYzc4IiwibWVzc2FnZSI6eyJ0eXBlIjoiZW50aXRsZW1lbnRfbWVzc2FnZSIsImtleXMiOlt7ImlkIjoiMDg3Mjc4NmUtZjllNy00NjVmLWEzYTItNGU1YjBlZjhmYTQ1IiwiZW5jcnlwdGVkX2tleSI6IlB3NitlRVlOY3ZqWWJmc2gzWDNmbWc9PSJ9LHsiaWQiOiJjMTRmMDcwOS1mMmI5LTQ0MjctOTE2Yi02MWI1MjU4NjUwNmEiLCJlbmNyeXB0ZWRfa2V5IjoiLzErZk5paDM4bXFSdjR5Y1l6bnQvdz09In0seyJpZCI6IjhiMDI5ZTUxLWQ1NmEtNDRiZC05MTBmLWQ0YjVmZDkwZmJhMiIsImVuY3J5cHRlZF9rZXkiOiJrcTBKdVpFanBGTjhzYVRtdDU2ME9nPT0ifSx7ImlkIjoiMmQ2ZTkzODctNjBjYS00MTQ1LWFlYzItYzQwODM3YjRiMDI2IiwiZW5jcnlwdGVkX2tleSI6IlRjUlFlQld4RW9IT0tIcmFkNFNlVlE9PSJ9LHsiaWQiOiJkZTAyZjA3Zi1hMDk4LTRlZTAtYjU1Ni05MDdjMGQxN2ZiYmMiLCJlbmNyeXB0ZWRfa2V5IjoicG9lbmNTN0dnbWVHRmVvSjZQRUFUUT09In0seyJpZCI6IjkxNGU2OWY0LTBhYjMtNDUzNC05ZTlmLTk4NTM2MTVlMjZmNiIsImVuY3J5cHRlZF9rZXkiOiJlaUkvTXNsbHJRNHdDbFJUL0xObUNBPT0ifSx7ImlkIjoiZGE0NDQ1YzItZGI1ZS00OGVmLWIwOTYtM2VmMzQ3YjE2YzdmIiwiZW5jcnlwdGVkX2tleSI6IjJ3K3pkdnFycERWM3hSMGJKeTR1Z3c9PSJ9LHsiaWQiOiIyOWYwNWU4Zi1hMWFlLTQ2ZTQtODBlOS0yMmRjZDQ0Y2Q3YTEiLCJlbmNyeXB0ZWRfa2V5IjoiL3hsU0hweHdxdTNnby9nbHBtU2dhUT09In0seyJpZCI6IjY5ZmU3MDc3LWRhZGQtNGI1NS05NmNkLWMzZWRiMzk5MTg1MyIsImVuY3J5cHRlZF9rZXkiOiJ6dTZpdXpOMnBzaTBaU3hRaUFUa1JRPT0ifV19fQ.BXr93Et1krYMVs-CUnf7F3ywJWFRtxYdkR7Qn4w3-to', // eslint-disable-line
              },
            },
          },
        },
      });
    });

    it('should reset MSE when crossing a boundary', async () => {
      await player.load(MULTI_PERIOD_ASSET_URI_);
      await video.play();

      await waiter.timeoutAfter(10).waitForEvent(player, 'boundarycrossed');

      expect(video.readyState).toBe(0);

      await waiter.waitForMovementOrFailOnTimeout(video, /* timeout= */ 10);
    });

    it('should buffer no further than boundary', async () => {
      await player.load(MULTI_PERIOD_ASSET_URI_);
      await video.play();

      await waiter.waitForMovementOrFailOnTimeout(video, /* timeout= */ 10);

      video.pause();
      await shaka.test.Util.delay(1);

      const end = player.getBufferedInfo().total[0].end;
      expect(end).toBeLessThanOrEqual(4);
    });
  });
});
