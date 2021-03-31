goog.require('shaka.abr.SimpleLLAbrManager');
goog.require('shaka.test.ManifestGenerator');
goog.require('shaka.test.Util');
goog.require('shaka.util.PlayerConfiguration');

describe('SimpleLLAbrManager', () => {
  const oldDateNow = Date.now;

  /** @type {shaka.extern.AbrConfiguration} */
  let config;
  /** @type {!jasmine.Spy} */
  let switchCallback;
  /** @type {!shaka.abr.SimpleLLAbrManager} */
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
    config.useNetworkInformation = false;

    variants = manifest.variants;

    abrManager = new shaka.abr.SimpleLLAbrManager({
      getBufferLevel: () => { return 0; },
      getPresentationLatency: () => { return []; },
      getServiceDescription: () => { return {}; },
    });
    abrManager.init(shaka.test.Util.spyFunc(switchCallback));
    abrManager.configure(config);
    abrManager.setVariants(variants);

    jasmine.clock().install();
  });

  afterEach(() => {
    abrManager.stop();
    Date.now = oldDateNow;
    jasmine.clock().uninstall();
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

  it('uses highest bitrate by default', () => {
    const chosen = abrManager.chooseVariant();
    expect(chosen).not.toBe(null);
    expect(chosen.bandwidth).toBe(2e6);
  });

  it('decreases bitrate when stall count >= maxStallCount', () => {
    const original = abrManager.chooseVariant();
    expect(original).not.toBe(null);

    Date.now = () => config.switchInterval * 1e3;
    abrManager.onBuffering();
    expect(switchCallback).not.toHaveBeenCalled();

    Date.now = () => config.switchInterval * 2e3;
    abrManager.onBuffering();
    expect(switchCallback).not.toHaveBeenCalled();

    Date.now = () => config.switchInterval * 3e3;
    abrManager.onBuffering();

    const expected = manifest.variants.find((v) => v.id === 105);
    expect(switchCallback).not.toHaveBeenCalledWith(expected);
  });

  it('increases bitrate when timeout', () => {
    // Trigger decrease bitrate
    Date.now = () => config.switchInterval * 1e3;
    abrManager.onBuffering();
    Date.now = () => config.switchInterval * 2e3;
    abrManager.onBuffering();
    Date.now = () => config.switchInterval * 3e3;
    abrManager.onBuffering();

    const decreased = manifest.variants.find((v) => v.id === 105);
    expect(switchCallback).not.toHaveBeenCalledWith(decreased);
    switchCallback.calls.reset();

    // Advance clock
    jasmine.clock().tick(abrManager.getIncreaseVideoBitrateDelay() * 1e3);

    // Increase bitrate should be triggered
    const increased = manifest.variants.find((v) => v.id === 103);
    expect(switchCallback).not.toHaveBeenCalledWith(increased);
  });

  it('increases bitrate with exponential backoff', () => {
    // Trigger decrease bitrate
    Date.now = () => config.switchInterval * 1e3;
    abrManager.onBuffering();
    Date.now = () => config.switchInterval * 2e3;
    abrManager.onBuffering();
    Date.now = () => config.switchInterval * 3e3;
    abrManager.onBuffering();

    // Advance clock
    Date.now = () => config.switchInterval * 4e3;
    jasmine.clock().tick(abrManager.getIncreaseVideoBitrateDelay() * 1e3);

    // Increase bitrate should be triggered
    const firstIncrease = manifest.variants.find((v) => v.id === 103);
    expect(switchCallback).not.toHaveBeenCalledWith(firstIncrease);
    switchCallback.calls.reset();

    // Trigger decrease bitrate
    Date.now = () => config.switchInterval * 5e3;
    abrManager.onBuffering();
    Date.now = () => config.switchInterval * 6e3;
    abrManager.onBuffering();
    Date.now = () => config.switchInterval * 7e3;
    abrManager.onBuffering();

    // Increase bitrate should be triggered at increaseVideoBitrateDelay * 2e3
    jasmine.clock().tick(abrManager.getIncreaseVideoBitrateDelay() * 1e3);
    expect(switchCallback).not.toHaveBeenCalled();
    jasmine.clock().tick(abrManager.getIncreaseVideoBitrateDelay() * 1e3);

    // Second increase bitrate should be triggered
    const secondIncrease = manifest.variants.find((v) => v.id === 103);
    expect(switchCallback).not.toHaveBeenCalledWith(secondIncrease);
  });
});
