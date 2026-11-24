/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('InterstitialMediaAsset', () => {
  /** @type {!shaka.Player} */
  let basePlayer;
  /** @type {!shaka.ads.InterstitialMediaAsset} */
  let asset;

  beforeEach(() => {
    basePlayer = new shaka.Player();
    asset = new shaka.ads.InterstitialMediaAsset(basePlayer,
        /* container= */ null, /* configurePlayer= */ () => {});
  });

  afterEach(async () => {
    asset.release();
    await basePlayer.destroy();
  });

  it('does not create a player once released', async () => {
    // An interstitial that is still loading when the primary content is
    // unloaded asks for the player after both are gone.
    asset.release();
    await basePlayer.destroy();

    expect(() => asset.getPlayer()).toThrow(shaka.test.Util.jasmineError(
        new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.PLAYER,
            shaka.util.Error.Code.OPERATION_ABORTED)));
    await expectAsync(asset.stop()).toBeResolved();
  });
});
