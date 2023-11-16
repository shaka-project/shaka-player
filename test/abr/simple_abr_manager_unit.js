/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('SimpleAbrManager', () => {
  const sufficientBWMultiplier = 1.06;
  const defaultBandwidthEstimate = 500e3; // 500kbps
  const oldDateNow = Date.now;

  /** @type {shaka.extern.AbrConfiguration} */
  let config;
  /** @type {!jasmine.Spy} */
  let switchCallback;
  /** @type {!shaka.abr.SimpleAbrManager} */
  let abrManager;
  /** @type {shaka.extern.Manifest} */
  let manifest;
  /** @type {!Array.<shaka.extern.Variant>} */
  let variants;

  beforeEach(() => {
    Date.now = () => 0;
    switchCallback = jasmine.createSpy('switchCallback');

    // Keep unsorted.
    manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.addVariant(100, (variant) => {
        variant.bandwidth = 4e5;  // 400 kbps
        variant.addAudio(0);
        variant.addVideo(1);
      });
      manifest.addVariant(101, (variant) => {
        variant.bandwidth = 1e6;  // 1000 kbps
        variant.addAudio(2);
        variant.addVideo(3);
      });
      manifest.addVariant(102, (variant) => {
        variant.bandwidth = 5e5;  // 500 kbps
        variant.addAudio(4);
        variant.addVideo(5);
      });
      manifest.addVariant(103, (variant) => {
        variant.bandwidth = 2e6;
        variant.addAudio(6);
        variant.addVideo(7);
      });
      manifest.addVariant(104, (variant) => {
        variant.bandwidth = 2e6;  // Identical on purpose.
        variant.addAudio(8);
        variant.addVideo(9);
      });
      manifest.addVariant(105, (variant) => {
        variant.bandwidth = 6e5;
        variant.addAudio(10);
        variant.addVideo(11);
      });
      manifest.addTextStream(20);
      manifest.addTextStream(21);
    });

    config = shaka.util.PlayerConfiguration.createDefault().abr;
    config.defaultBandwidthEstimate = defaultBandwidthEstimate;
    config.useNetworkInformation = false;

    variants = manifest.variants;

    abrManager = new shaka.abr.SimpleAbrManager();
    abrManager.init(shaka.test.Util.spyFunc(switchCallback));
    abrManager.configure(config);
    abrManager.setVariants(variants);
  });

  afterEach(() => {
    abrManager.stop();
    Date.now = oldDateNow;
  });

  it('can choose audio and video Streams right away', () => {
    const chosen = abrManager.chooseVariant();
    expect(chosen).not.toBe(null);
  });

  it('uses custom default estimate', () => {
    config.defaultBandwidthEstimate = 3e6;
    abrManager.configure(config);
    const chosen = abrManager.chooseVariant();
    expect(chosen.id).toBe(103);
  });

  it('can handle empty variants', () => {
    abrManager.setVariants([]);
    const chosen = abrManager.chooseVariant();
    expect(chosen).toBe(null);
  });

  it('can choose from audio only variants', () => {
    manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.addVariant(0, (variant) => {
        variant.bandwidth = 4e5;
        variant.addAudio(0);
      });
      manifest.addVariant(1, (variant) => {
        variant.bandwidth = 1e6;
        variant.addAudio(2);
      });
    });

    abrManager.setVariants(manifest.variants);
    const chosen = abrManager.chooseVariant();
    expect(chosen).not.toBe(null);
    expect(chosen.audio).not.toBe(null);
    expect(chosen.video).toBe(null);
  });

  it('can choose from video only variants', () => {
    manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.addVariant(0, (variant) => {
        variant.bandwidth = 4e5;
        variant.addVideo(0);
      });
      manifest.addVariant(1, (variant) => {
        variant.bandwidth = 1e6;
        variant.addVideo(2);
      });
    });

    abrManager.setVariants(manifest.variants);
    const chosen = abrManager.chooseVariant();
    expect(chosen).not.toBe(null);
    expect(chosen.audio).toBe(null);
    expect(chosen.video).not.toBe(null);
  });

  for (const bandwidth of [5e5, 6e5]) {
    // Simulate some segments being downloaded just above the desired
    // bandwidth.
    const bytesPerSecond = sufficientBWMultiplier * bandwidth / 8.0;

    const bandwidthKbps = bandwidth / 1000.0;
    const description = 'picks correct Variant at ' + bandwidthKbps + ' kbps';

    it(description, () => {
      abrManager.setVariants(variants);
      abrManager.chooseVariant();

      abrManager.segmentDownloaded(1000, bytesPerSecond, true);
      abrManager.segmentDownloaded(1000, bytesPerSecond, true);

      abrManager.enable();

      // Make another call to segmentDownloaded() so switchCallback() is
      // called.
      abrManager.segmentDownloaded(1000, bytesPerSecond, true);

      // Expect variants 2 to be chosen for bandwidth = 5e5
      // and variant 5 - for bandwidth = 6e5
      const expectedVariant = (bandwidth == 6e5) ? variants[5] : variants[2];

      expect(switchCallback).toHaveBeenCalledWith(expectedVariant, false, 0);
    });
  }

  it('can handle 0 duration segments', () => {
    // Makes sure bandwidth estimate doesn't get set to NaN
    // when a 0 duration segment is encountered.
    // https://github.com/shaka-project/shaka-player/issues/582
    const bandwidth = 5e5;
    const bytesPerSecond = sufficientBWMultiplier * bandwidth / 8.0;

    abrManager.setVariants(variants);
    abrManager.chooseVariant();

    // 0 duration segment shouldn't cause us to get stuck on the lowest variant
    abrManager.segmentDownloaded(0, bytesPerSecond, true);
    abrManager.segmentDownloaded(1000, bytesPerSecond, true);

    abrManager.enable();

    abrManager.segmentDownloaded(1000, bytesPerSecond, true);

    expect(abrManager.getBandwidthEstimate()).toBeTruthy();
  });

  it('picks lowest variant when there is insufficient bandwidth', () => {
    const bandwidth = 2e6;

    abrManager.setVariants(variants);
    abrManager.chooseVariant();

    // Simulate some segments being downloaded just above the desired
    // bandwidth.
    const bytesPerSecond = sufficientBWMultiplier * bandwidth / 8.0;

    abrManager.segmentDownloaded(1000, bytesPerSecond, true);
    abrManager.segmentDownloaded(1000, bytesPerSecond, true);

    abrManager.enable();

    // Make another call to segmentDownloaded() so switchCallback() is
    // called.
    abrManager.segmentDownloaded(1000, bytesPerSecond, true);

    // Expect variants 4 to be chosen
    const expectedVariant = variants[3];

    expect(switchCallback).toHaveBeenCalledWith(expectedVariant, false, 0);
  });

  it('does not call switchCallback() if not enabled', () => {
    const bandwidth = 5e5;
    const bytesPerSecond = sufficientBWMultiplier * bandwidth / 8.0;

    abrManager.setVariants(variants);
    abrManager.chooseVariant();

    // Don't enable AbrManager.
    abrManager.segmentDownloaded(1000, bytesPerSecond, true);
    abrManager.segmentDownloaded(1000, bytesPerSecond, true);
    abrManager.segmentDownloaded(1000, bytesPerSecond, true);
    expect(switchCallback).not.toHaveBeenCalled();
  });

  it('does not call switchCallback() in switch interval', () => {
    let bandwidth = 5e5;
    let bytesPerSecond = sufficientBWMultiplier * bandwidth / 8.0;

    abrManager.setVariants(variants);
    abrManager.chooseVariant();

    abrManager.segmentDownloaded(1000, bytesPerSecond, true);
    abrManager.segmentDownloaded(1000, bytesPerSecond, true);

    abrManager.enable();

    abrManager.segmentDownloaded(1000, bytesPerSecond, true);
    expect(switchCallback).toHaveBeenCalled();
    switchCallback.calls.reset();

    // Simulate drop in bandwidth.
    bandwidth = 2e6;
    bytesPerSecond = sufficientBWMultiplier * bandwidth / 8.0;

    abrManager.segmentDownloaded(1000, bytesPerSecond, true);
    abrManager.segmentDownloaded(1000, bytesPerSecond, true);
    abrManager.segmentDownloaded(1000, bytesPerSecond, true);
    abrManager.segmentDownloaded(1000, bytesPerSecond, true);
    abrManager.segmentDownloaded(1000, bytesPerSecond, true);
    abrManager.segmentDownloaded(1000, bytesPerSecond, true);
    abrManager.segmentDownloaded(1000, bytesPerSecond, true);

    // Stay inside switch interval.
    Date.now = () => (config.switchInterval - 2) * 1e3;
    abrManager.segmentDownloaded(1000, bytesPerSecond, true);

    expect(switchCallback).not.toHaveBeenCalled();

    // Move outside switch interval.
    Date.now = () => (config.switchInterval + 2) * 1e3;
    abrManager.segmentDownloaded(1000, bytesPerSecond, true);

    expect(switchCallback).toHaveBeenCalled();
  });

  it('does not clear the buffer on upgrade', () => {
    // Simulate some segments being downloaded at a high rate, to trigger an
    // upgrade.
    const bandwidth = 5e5;
    const bytesPerSecond = sufficientBWMultiplier * bandwidth / 8.0;

    abrManager.setVariants(variants);
    abrManager.chooseVariant();

    abrManager.segmentDownloaded(1000, bytesPerSecond, true);
    abrManager.segmentDownloaded(1000, bytesPerSecond, true);

    abrManager.enable();

    // Make another call to segmentDownloaded(). switchCallback() will be
    // called to upgrade.
    abrManager.segmentDownloaded(1000, bytesPerSecond, true);

    // The second parameter is missing to indicate that the buffer should not be
    // cleared.
    expect(switchCallback).toHaveBeenCalledWith(jasmine.any(Object), false, 0);
  });

  it('does clear the buffer on upgrade with safemargin to 4', () => {
    // Simulate some segments being downloaded at a high rate, to trigger an
    // upgrade.
    const bandwidth = 5e5;
    const bytesPerSecond = sufficientBWMultiplier * bandwidth / 8.0;

    // Set the clear buffer to true and the safe margin to 4.
    config.clearBufferSwitch = true;
    config.safeMarginSwitch = 4;
    abrManager.configure(config);

    abrManager.setVariants(variants);
    abrManager.chooseVariant();

    abrManager.segmentDownloaded(1000, bytesPerSecond, true);
    abrManager.segmentDownloaded(1000, bytesPerSecond, true);

    abrManager.enable();

    // Make another call to segmentDownloaded(). switchCallback() will be
    // called to upgrade.
    abrManager.segmentDownloaded(1000, bytesPerSecond, true);

    // The second parameter is missing to indicate that the buffer should not be
    // cleared.
    expect(switchCallback).toHaveBeenCalledWith(jasmine.any(Object), true, 4);
  });

  it('does not clear the buffer on downgrade', () => {
    // Simulate some segments being downloaded at a low rate, to trigger a
    // downgrade.
    const bandwidth = 5e5;
    const bytesPerSecond = sufficientBWMultiplier * bandwidth / 8.0;

    // Set the default high so that the initial choice will be high-quality.
    config.defaultBandwidthEstimate = 4e6;
    abrManager.configure(config);

    abrManager.setVariants(variants);
    abrManager.chooseVariant();

    abrManager.segmentDownloaded(1000, bytesPerSecond, true);
    abrManager.segmentDownloaded(1000, bytesPerSecond, true);

    abrManager.enable();

    // Make another call to segmentDownloaded(). switchCallback() will be
    // called to downgrade.
    abrManager.segmentDownloaded(1000, bytesPerSecond, true);

    // The second parameter is missing to indicate that the buffer should not be
    // cleared.
    expect(switchCallback).toHaveBeenCalledWith(jasmine.any(Object), false, 0);
  });

  it('will respect restrictions', () => {
    manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.addVariant(10, (variant) => {
        variant.bandwidth = 1e5;
        variant.addVideo(0, (stream) => {
          stream.size(50, 50);
        });
      });
      manifest.addVariant(11, (variant) => {
        variant.bandwidth = 2e5;
        variant.addVideo(1, (stream) => {
          stream.size(200, 200);
        });
      });
    });

    abrManager.setVariants(manifest.variants);
    let chosen = abrManager.chooseVariant();
    expect(chosen.id).toBe(11);

    config.restrictions.maxWidth = 100;
    abrManager.configure(config);

    chosen = abrManager.chooseVariant();
    expect(chosen.id).toBe(10);
  });

  it('uses lowest-bandwidth variant when restrictions cannot be met', () => {
    manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.addVariant(10, (variant) => {
        variant.bandwidth = 1e5;
        variant.addVideo(0, (stream) => {
          stream.size(50, 50);
        });
      });
      manifest.addVariant(11, (variant) => {
        variant.bandwidth = 2e5;
        variant.addVideo(1, (stream) => {
          stream.size(200, 200);
        });
      });
    });

    abrManager.setVariants(manifest.variants);
    let chosen = abrManager.chooseVariant();
    expect(chosen.id).toBe(11);

    // This restriction cannot be met, but we shouldn't fail.
    config.restrictions.maxWidth = 1;
    abrManager.configure(config);

    chosen = abrManager.chooseVariant();
    expect(chosen.id).toBe(10);
  });
});
