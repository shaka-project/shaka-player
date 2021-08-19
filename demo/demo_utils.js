/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shakaDemo.Utils');


shakaDemo.Utils = class {
  /**
   * Goes through the various values in shaka.extern.PlayerConfiguration, and
   * calls the given callback on them so that they can be stored to or read from
   * an URL hash.
   *
   * @param {function(string, string)} callback A callback to call on each
   *   config value that can be automatically handled. The first parameter is
   *   the hashName (desired name in the hash). The second parameter is the
   *   configName (the full path of the value, as found in the config object).
   *
   * @param {!shaka.extern.PlayerConfiguration} config A config object to use
   *   for reference. Note that the exact config values in this are not used; it
   *   is checked only to determine the shape and structure of a
   *   PlayerConfiguration object.
   */
  static runThroughHashParams(callback, config) {
    // Override the "natural" name for a config value in the hash.
    // This exists for legacy reasons; the previous demo page had some hash
    // values set to names that did not match the names of their corresponding
    // config object name.
    const overridden = [];
    const configOverride = (hashName, configName) => {
      overridden.push(configName);
      callback(hashName, configName);
    };

    // Override config values with custom names.
    configOverride('audiolang', 'preferredAudioLanguage');
    configOverride('textlang', 'preferredTextLanguage');
    configOverride('textrole', 'preferredTextRole');
    configOverride('channels', 'preferredAudioChannelCount');

    // Override config values that are handled manually.
    overridden.push('abr.enabled');
    overridden.push('streaming.jumpLargeGaps');
    overridden.push('drm.advanced');
    overridden.push('drm.servers');

    // Determine which config values should be given full namespace names.
    // This is to remove ambiguity in situations where there are two objects in
    // the config that share a key with the same name, without wasting space by
    // pointlessly adding namespace information to every value.
    const added = [];
    const collisions = [];
    const findCollisions = (object) => {
      for (const key in object) {
        if (added.includes(key) && !collisions.includes(key)) {
          collisions.push(key);
        }
        added.push(key);

        const value = object[key];
        if (typeof value != 'number' && typeof value != 'string' &&
            typeof value != 'boolean') {
          findCollisions(value);
        }
      }
    };
    findCollisions(config);

    // TODO: This system for handling name collisions does mean that, if a new
    // collision appears later on, old hashes will become invalid.
    // E.g. if we add 'manifest.bufferBehind', then suddenly the page will
    // discard any 'bufferBehind=' values from old hashes.

    // Now automatically do other config values.
    const handleConfig = (object, accumulated) => {
      for (const key in object) {
        let hashName = key;
        const configName = accumulated + key;
        if (overridden.includes(configName)) {
          continue;
        }
        if (collisions.includes(key)) {
          hashName = configName;
        }

        const value = object[key];
        if (typeof value == 'number' || typeof value == 'string' ||
            typeof value == 'boolean') {
          callback(hashName, configName);
        } else {
          handleConfig(value, configName + '.');
        }
      }
    };
    handleConfig(config, '');
  }

  /**
   * @return {boolean} True if the browser would support the uncompiled build.
   */
  static browserSupportsUncompiledMode() {
    // Check if ES6 arrow function syntax and ES7 async are usable.  Both are
    // needed for uncompiled builds to work.
    try {
      eval('async ()=>{}');
      return true;
    } catch (e) {
      return false;
    }
  }
};
