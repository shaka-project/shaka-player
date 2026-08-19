/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

filterDescribe('StorageMechanism', offlineSupported, () => {
  const dbName = 'shaka_offline_db';

  /**
   * Delete the offline database, reporting whether the delete completed or was
   * left blocked by a connection that is still open.
   *
   * @param {number} timeoutSeconds
   * @return {!Promise<string>}
   */
  function tryDeleteDatabase(timeoutSeconds) {
    let blocked = false;

    const deleted = new Promise((resolve, reject) => {
      const request = window.indexedDB.deleteDatabase(dbName);
      request.onblocked = () => {
        blocked = true;
      };
      request.onsuccess = () => {
        resolve('deleted');
      };
      request.onerror = () => {
        reject(request.error);
      };
    });

    // A blocked delete never settles on its own, so race it rather than let
    // the spec sit until its timeout.
    return Promise.race([
      deleted,
      shaka.test.Util.delay(timeoutSeconds).then(
          () => blocked ? 'blocked by an open connection' : 'never finished'),
    ]);
  }

  // The ordinary teardown, with the open allowed to finish first.  This runs
  // before the regression test below on purpose: a leaked connection cannot be
  // closed by anything, so once the case below has leaked one, every later
  // delete in the same browser is blocked too.  Checking the ordinary path
  // first keeps that collateral damage from hiding which case actually broke.
  it('does not leak its connection when destroyed after init', async () => {
    const muxer = new shaka.offline.StorageMuxer();

    await muxer.init();
    await muxer.destroy();

    expect(await tryDeleteDatabase(10)).toBe('deleted');
  });

  // Regression test.  A storage mechanism opens its connection asynchronously,
  // and the operation that wanted it can be torn down while that open is still
  // in flight -- which is what happens when a player is destroyed during
  // offline playback, since every segment read opens its own connection.
  //
  // The mechanism used to drop such a connection on the floor: destroy() saw
  // no connection yet and closed nothing, then the open completed and handed
  // the connection to a mechanism no one held any more.  Nothing could close
  // it after that, and while it stayed open no one could delete or upgrade the
  // database -- the request did not fail, it blocked for the life of the page,
  // with every later IndexedDB operation queued behind it.
  //
  // The race only decides whether a connection leaks.  Once one has, the
  // deadlock is certain, so this reproduces on every platform.
  it('does not leak its connection when destroyed during init', async () => {
    const muxer = new shaka.offline.StorageMuxer();

    // Do not await init.  Destroying now lands inside the window between the
    // open being issued and it completing, which is the case being tested.
    const init = muxer.init();
    await muxer.destroy();
    await init;

    expect(await tryDeleteDatabase(10)).toBe('deleted');
  });
});
