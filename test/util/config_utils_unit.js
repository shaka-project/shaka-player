/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('ConfigUtils', () => {
  it('rejects dangerous keys while merging generic objects', () => {
    const destination = shaka.util.PlayerConfiguration.createDefault();
    const updates = {
      drm: {
        advanced: JSON.parse(
            '{"__proto__":{"testPolluted":"YES"},' +
            '"com.widevine.alpha":{"videoRobustness":["SW_SECURE_DECODE"]}}'),
      },
    };

    const valid = shaka.util.PlayerConfiguration.mergeConfigObjects(
        destination, updates,
        shaka.util.PlayerConfiguration.createDefault());

    expect(valid).toBe(false);
    expect(/** @type {!Object} */(destination.drm.advanced)['testPolluted'])
        .toBe(undefined);
    expect(
        Object.getPrototypeOf(/** @type {!Object} */(destination.drm.advanced)))
        .toBe(
            Object.getPrototypeOf({}));
    expect(destination.drm.advanced['com.widevine.alpha'].videoRobustness)
        .toEqual(['SW_SECURE_DECODE']);
  });

  it('does not traverse inherited magic keys during config merges', () => {
    const inheritedProto = Object.create(null);
    Object.defineProperty(inheritedProto, '__proto__', {
      enumerable: true,
      value: {testPolluted: 'YES'},
    });

    const updates = Object.create(inheritedProto);
    const destination = shaka.util.PlayerConfiguration.createDefault();

    const valid = shaka.util.PlayerConfiguration.mergeConfigObjects(
        destination, updates,
        shaka.util.PlayerConfiguration.createDefault());

    expect(valid).toBe(true);
    expect(/** @type {!Object} */({})['testPolluted']).toBe(undefined);
  });
});
