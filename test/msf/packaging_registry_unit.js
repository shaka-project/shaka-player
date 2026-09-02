/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

filterDescribe('shaka.msf.PackagingRegistry', isMSFSupported, () => {
  /** @type {!Map<string, shaka.extern.MsfPackaging.Factory>} */
  let original;

  beforeEach(() => {
    // Registration is global, so snapshot it and restore afterwards rather
    // than leaking a fake packaging into other suites.
    original = /** @type {!Map<string, shaka.extern.MsfPackaging.Factory>} */ (
      new Map(shaka.msf.PackagingRegistry.packagingsByName));
  });

  afterEach(() => {
    shaka.msf.PackagingRegistry.packagingsByName = original;
  });

  /**
   * @return {!shaka.extern.MsfPackaging}
   */
  function fakePackaging() {
    return /** @type {!shaka.extern.MsfPackaging} */ ({
      describeTrack: () => null,
      createSegmenter: () => null,
    });
  }

  it('should have every shipped packaging registered by default', () => {
    const registered = shaka.msf.PackagingRegistry.getRegisteredPackagings();
    expect(registered).toContain('cmaf');
    expect(registered).toContain('chunk-per-object');
    expect(registered).toContain('loc');
    expect(registered).toContain('m2ts');
  });

  it('creates a packaging for a registered name', () => {
    expect(shaka.msf.PackagingRegistry.create('m2ts')).not.toBeNull();
  });

  it('returns null for a packaging nobody registered', () => {
    expect(shaka.msf.PackagingRegistry.create('not-a-packaging')).toBeNull();
  });

  it('returns null when a track declares no packaging', () => {
    expect(shaka.msf.PackagingRegistry.create(undefined)).toBeNull();
    expect(shaka.msf.PackagingRegistry.create('')).toBeNull();
  });

  it('creates a new instance per call', () => {
    // A packaging keeps the state it derived from one track, so two tracks
    // must never share one.
    const first = shaka.msf.PackagingRegistry.create('m2ts');
    const second = shaka.msf.PackagingRegistry.create('m2ts');
    expect(first).not.toBe(second);
  });

  it('lets an application register its own packaging', () => {
    const packaging = fakePackaging();
    shaka.msf.PackagingRegistry.registerPackaging('custom', () => packaging);

    expect(shaka.msf.PackagingRegistry.getRegisteredPackagings())
        .toContain('custom');
    expect(shaka.msf.PackagingRegistry.create('custom')).toBe(packaging);
  });

  it('lets an application unregister a packaging', () => {
    shaka.msf.PackagingRegistry.unregisterPackaging('loc');

    expect(shaka.msf.PackagingRegistry.getRegisteredPackagings())
        .not.toContain('loc');
    expect(shaka.msf.PackagingRegistry.create('loc')).toBeNull();
  });
});
