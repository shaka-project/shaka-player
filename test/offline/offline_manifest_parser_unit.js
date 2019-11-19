/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** @return {boolean} */
const offlineManifestParserSupport = () => shaka.offline.StorageMuxer.support();
filterDescribe('OfflineManifestParser', offlineManifestParserSupport, () => {
  const Util = shaka.test.Util;
  // The offline manifest parser does not need the player interface, so
  // this is a work around to avoid creating one.
  const playerInterface =
  /** @type {shaka.extern.ManifestParser.PlayerInterface} */({});

  // A session id that will be found in the manifest created by |makeManifest|.
  const sessionId = 'session-id';

  /** @type {!shaka.offline.OfflineManifestParser} */
  let parser;

  beforeEach(async () => {
    // Make sure we start with a clean slate.
    await clearStorage();
    parser = new shaka.offline.OfflineManifestParser();
  });

  afterEach(async () => {
    parser.stop();
    // Make sure that we don't waste storage by leaving stuff in storage.
    await clearStorage();
  });

  it('returns manifest from storage', async () => {
    const inputManifest = makeManifest();

    /** @type {!shaka.offline.OfflineUri} */
    let uri;

    /** @type {!shaka.offline.StorageMuxer} */
    const muxer = new shaka.offline.StorageMuxer();

    try {
      await muxer.init();
      const handle = await muxer.getActive();
      const keys = await handle.cell.addManifests([inputManifest]);

      uri = shaka.offline.OfflineUri.manifest(
          handle.path.mechanism, handle.path.cell, keys[0]);
    } finally {
      await muxer.destroy();
    }

    const outputManifest = await parser.start(uri.toString(), playerInterface);
    expect(outputManifest).toBeTruthy();
  });

  it('updates expiration', async () => {
    const newExpiration = 1000;

    const inputManifest = makeManifest();
    // Make sure that the expiration is different from the new expiration
    // so that when we check that they are the same later, it actually
    // means that it changed.
    expect(inputManifest.expiration).not.toBe(newExpiration);

    /** @type {!shaka.offline.StorageMuxer} */
    const muxer = new shaka.offline.StorageMuxer();

    try {
      await muxer.init();
      const handle = await muxer.getActive();
      const keys = await handle.cell.addManifests([inputManifest]);

      /** @type {!shaka.offline.OfflineUri} */
      const uri = shaka.offline.OfflineUri.manifest(
          handle.path.mechanism, handle.path.cell, keys[0]);

      await parser.start(uri.toString(), playerInterface);
      await parser.onExpirationUpdated(sessionId, newExpiration);

      const found = await handle.cell.getManifests(keys);
      expect(found[0].expiration).toBe(newExpiration);
    } finally {
      await muxer.destroy();
    }
  });

  it('fails if manifest was not found', async () => {
    const inputManifest = makeManifest();

    /** @type {!shaka.offline.OfflineUri} */
    let uri;

    /** @type {!shaka.offline.StorageMuxer} */
    const muxer = new shaka.offline.StorageMuxer();

    try {
      await muxer.init();
      const handle = await muxer.getActive();
      const keys = await handle.cell.addManifests([inputManifest]);

      uri = shaka.offline.OfflineUri.manifest(
          handle.path.mechanism, handle.path.cell, keys[0]);

      // Remove the manifest so that the uri will point to nothing.
      const noop = () => {};
      await handle.cell.removeManifests(keys, noop);
    } finally {
      await muxer.destroy();
    }

    const expected = Util.jasmineError(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.KEY_NOT_FOUND,
        jasmine.any(String)));
    await expectAsync(parser.start(uri.toString(), playerInterface))
        .toBeRejectedWith(expected);
  });

  it('fails for invalid URI', async () => {
    const uri = 'this-is-an-invalid-uri';

    const expected = Util.jasmineError(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.NETWORK,
        shaka.util.Error.Code.MALFORMED_OFFLINE_URI,
        uri));
    await expectAsync(parser.start(uri, playerInterface))
        .toBeRejectedWith(expected);
  });

  it('ignores update expiration when data is deleted', async () => {
    const newExpiration = 1000;

    const inputManifest = makeManifest();

    /** @type {!shaka.offline.StorageMuxer} */
    const muxer = new shaka.offline.StorageMuxer();
    try {
      await muxer.init();
      const handle = await muxer.getActive();
      const keys = await handle.cell.addManifests([inputManifest]);

      const uri = shaka.offline.OfflineUri.manifest(
          handle.path.mechanism, handle.path.cell, keys[0]);

      await parser.start(uri.toString(), playerInterface);

      // Remove the manifest after we have parsed it so that the
      // update won't find it. Oh, we are sneaky.
      const noop = () => {};
      await handle.cell.removeManifests(keys, noop);
      await parser.onExpirationUpdated(sessionId, newExpiration);
    } finally {
      await muxer.destroy();
    }
  });

  it('ignores update expiration with unknown session', async () => {
    const wrongSession = 'this-session-wont-be-found';
    const newExpiration = 1000;

    const inputManifest = makeManifest();
    const oldExpiration = inputManifest.expiration;

    // Make sure that the expirations are not the same.
    expect(oldExpiration).not.toBe(newExpiration);

    /** @type {!shaka.offline.StorageMuxer} */
    const muxer = new shaka.offline.StorageMuxer();

    try {
      await muxer.init();
      const handle = await muxer.getActive();
      const keys = await handle.cell.addManifests([inputManifest]);

      const uri = shaka.offline.OfflineUri.manifest(
          handle.path.mechanism, handle.path.cell, keys[0]);

      await parser.start(uri.toString(), playerInterface);
      await parser.onExpirationUpdated(wrongSession, newExpiration);

      // Make sure that the expiration was not updated.
      const found = await handle.cell.getManifests(keys);
      expect(found[0].expiration).toBe(oldExpiration);
    } finally {
      await muxer.destroy();
    }
  });

  /**
   * @return {!shaka.extern.ManifestDB}
   */
  function makeManifest() {
    const mb = 1024 * 1024;
    const seconds = 1.0;

    /** @type {shaka.extern.ManifestDB} */
    const manifest = {
      originalManifestUri: '',
      duration: 600 * seconds,
      size: 100 * mb,
      expiration: Infinity,
      periods: [],
      sessionIds: [sessionId],
      drmInfo: null,
      appMetadata: {},
    };

    return manifest;
  }

  /**
   * @return {!Promise}
   */
  async function clearStorage() {
    /** @type {!shaka.offline.StorageMuxer} */
    const muxer = new shaka.offline.StorageMuxer();
    try {
      await muxer.erase();
    } finally {
      await muxer.destroy();
    }
  }
});
