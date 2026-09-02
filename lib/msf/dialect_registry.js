/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.DialectRegistry');

goog.require('shaka.config.MsfVersion');
goog.require('shaka.log');


// TODO: revisit this when Closure Compiler supports partially-exported classes.
/**
 * @summary An interface to register MoQT draft dialects.
 *
 * Dialects register themselves, so this registry has no knowledge of which
 * drafts exist. Supporting a new draft means adding an implementation that
 * registers itself and requiring it from shaka-player.uncompiled.js, with no
 * change here. Applications can register a dialect of their own the same way,
 * or unregister one they do not want offered.
 *
 * @export
 */
shaka.msf.DialectRegistry = class {
  /**
   * Registers a MoQT dialect.
   *
   * @param {string} name The draft name, which must match the corresponding
   *   shaka.config.MsfVersion value, e.g. 'draft-16'.
   * @param {shaka.extern.MsfDialect.Factory} dialectFactory The factory used
   *   to create dialect instances.
   * @export
   */
  static registerDialect(name, dialectFactory) {
    shaka.msf.DialectRegistry.dialectsByName.set(name, dialectFactory);
  }

  /**
   * Unregisters a MoQT dialect.
   *
   * @param {string} name
   * @export
   */
  static unregisterDialect(name) {
    shaka.msf.DialectRegistry.dialectsByName.delete(name);
  }

  /**
   * Returns the names of all registered dialects.
   *
   * @return {!Array<string>}
   * @export
   */
  static getRegisteredDialects() {
    return Array.from(shaka.msf.DialectRegistry.dialectsByName.keys());
  }

  /**
   * Returns the dialects to offer for a configured version, newest draft
   * first. AUTO offers all of them.
   *
   * Ordering comes from each dialect's draft number rather than registration
   * order, so a dialect registered by an application still lands in the right
   * place in the preference list.
   *
   * @param {shaka.config.MsfVersion} version
   * @return {!Array<!shaka.extern.MsfDialect>}
   */
  static getForVersion(version) {
    const registry = shaka.msf.DialectRegistry;

    /** @type {!Array<!shaka.extern.MsfDialect>} */
    let dialects = [];
    if (version == shaka.config.MsfVersion.AUTO) {
      dialects = Array.from(registry.dialectsByName.values())
          .map((factory) => factory());
    } else {
      const factory = registry.dialectsByName.get(version);
      if (!factory) {
        throw new Error(`No MoQT dialect registered for version: ${version}`);
      }
      dialects = [factory()];
    }

    if (!dialects.length) {
      throw new Error('No MoQT dialects are registered');
    }

    dialects.sort((a, b) => b.getDraftNumber() - a.getDraftNumber());
    return dialects;
  }

  /**
   * Picks the dialect for an established connection.
   *
   * The WebTransport subprotocol echoed by the server is authoritative when
   * present, but relays are not consistent about echoing it: some accept the
   * offered subprotocol and leave WebTransport.protocol empty. Treating an
   * absent echo as a failure would break those connections, so we fall back to
   * the newest dialect we offered.
   *
   * @param {!Array<!shaka.extern.MsfDialect>} offered Newest draft first.
   * @param {string} echoedSubprotocol
   * @return {!shaka.extern.MsfDialect}
   */
  static select(offered, echoedSubprotocol) {
    if (echoedSubprotocol) {
      const echoed = offered.find(
          (dialect) => dialect.getSubprotocol() == echoedSubprotocol);
      if (echoed) {
        return echoed;
      }
      shaka.log.warning(
          `Server echoed unoffered MoQT subprotocol "${echoedSubprotocol}"; ` +
          `falling back to ${offered[0].getName()}`);
    }
    return offered[0];
  }
};


/**
 * Contains the registered dialect factories, keyed by draft name.
 *
 * @type {!Map<string, shaka.extern.MsfDialect.Factory>}
 */
shaka.msf.DialectRegistry.dialectsByName = new Map();
