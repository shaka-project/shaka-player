/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.offline.SessionDeleter');


goog.require('shaka.drm.DrmEngine');
goog.require('shaka.log');
goog.require('shaka.util.ArrayUtils');
goog.requireType('shaka.net.NetworkingEngine');


/**
 * Contains a utility method to delete persistent EME sessions.
 */
shaka.offline.SessionDeleter = class {
  /**
   * Deletes the given sessions.  This never fails and instead logs the error.
   *
   * @param {shaka.extern.DrmConfiguration} config
   * @param {!shaka.net.NetworkingEngine} netEngine
   * @param {!Array<shaka.extern.EmeSessionDB>} sessions
   * @return {!Promise<!Array<string>>} The session IDs that were deleted.
   */
  async delete(config, netEngine, sessions) {
    const SessionDeleter = shaka.offline.SessionDeleter;

    let deleted = [];
    for (const bucket of SessionDeleter.createBuckets_(sessions)) {
      // Run these sequentially to avoid creating multiple CDM instances at one
      // time.  Some embedded platforms may not support multiples.
      const p = this.doDelete_(config, netEngine, bucket);
      const cur = await p;  // eslint-disable-line no-await-in-loop
      deleted = deleted.concat(cur);
    }
    return deleted;
  }


  /**
   * Performs the deletion of the given session IDs.
   *
   * @param {shaka.extern.DrmConfiguration} config
   * @param {!shaka.net.NetworkingEngine} netEngine
   * @param {shaka.offline.SessionDeleter.Bucket_} bucket
   * @return {!Promise<!Array<string>>} The sessions that were deleted
   * @private
   */
  async doDelete_(config, netEngine, bucket) {
    /** @type {!shaka.drm.DrmEngine} */
    const drmEngine = new shaka.drm.DrmEngine({
      netEngine: netEngine,
      onError: () => {},
      onKeyStatus: () => {},
      onExpirationUpdated: () => {},
      onEvent: () => {},
    });

    try {
      drmEngine.configure(config);
      await drmEngine.initForRemoval(
          bucket.info.keySystem, bucket.info.licenseUri,
          bucket.info.serverCertificate,
          bucket.info.audioCapabilities, bucket.info.videoCapabilities);
    } catch (e) {
      shaka.log.warning('Error initializing EME', e);
      await drmEngine.destroy();
      return [];
    }

    /** @type {!Array<string>} */
    const sessionIds = [];
    await Promise.all(bucket.sessionIds.map(async (sessionId) => {
      // This method is in a .map(), so this starts multiple removes at once,
      // so this removes the sessions in parallel.
      try {
        await drmEngine.removeSession(sessionId);
        sessionIds.push(sessionId);
      } catch (e) {
        shaka.log.warning('Error deleting offline session', e);
      }
    }));
    await drmEngine.destroy();
    return sessionIds;
  }


  /**
   * Collects the given sessions into buckets that can be done at the same time.
   * Since querying with different parameters can give us back different CDMs,
   * we can't just use one CDM instance to delete everything.
   *
   * @param {!Array<shaka.extern.EmeSessionDB>} sessions
   * @return {!Array<shaka.offline.SessionDeleter.Bucket_>}
   * @private
   */
  static createBuckets_(sessions) {
    const SessionDeleter = shaka.offline.SessionDeleter;

    /** @type {!Array<shaka.offline.SessionDeleter.Bucket_>} */
    const ret = [];
    for (const session of sessions) {
      let found = false;
      for (const bucket of ret) {
        if (SessionDeleter.isCompatible_(bucket.info, session)) {
          bucket.sessionIds.push(session.sessionId);
          found = true;
          break;
        }
      }
      if (!found) {
        ret.push({info: session, sessionIds: [session.sessionId]});
      }
    }

    return ret;
  }


  /**
   * Returns whether the given session infos are compatible with each other.
   * @param {shaka.extern.EmeSessionDB} a
   * @param {shaka.extern.EmeSessionDB} b
   * @return {boolean}
   * @private
   */
  static isCompatible_(a, b) {
    const ArrayUtils = shaka.util.ArrayUtils;

    // TODO: Add a way to change the license server in DrmEngine to avoid
    // resetting EME for different license servers.
    const comp = (x, y) =>
      x.robustness == y.robustness && x.contentType == y.contentType;
    return a.keySystem == b.keySystem && a.licenseUri == b.licenseUri &&
        ArrayUtils.hasSameElements(
            a.audioCapabilities, b.audioCapabilities, comp) &&
        ArrayUtils.hasSameElements(
            a.videoCapabilities, b.videoCapabilities, comp);
  }
};


/**
 * @typedef {{
 *   info: shaka.extern.EmeSessionDB,
 *   sessionIds: !Array<string>,
 * }}
 */
shaka.offline.SessionDeleter.Bucket_;
