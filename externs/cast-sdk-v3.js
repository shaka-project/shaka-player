/*! @license
 * Shaka Player
 * Copyright 2024 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for the limited subset of the Cast Application
 * Framework (Receiver SDK v3) that we use in our test infrastructure.
 *
 * @externs
 */

/** @const */
cast.framework = {};

/**
 * @typedef {{
 *   statusText: string,
 *   disableIdleTimeout: boolean,
 *   skipPlayersLoad: boolean
 * }}
 */
cast.framework.CastReceiverOptions;

cast.framework.CastReceiverContext = class {
  /** @return {!cast.framework.CastReceiverContext} */
  static getInstance() {}

  /**
   * @param {!cast.framework.CastReceiverOptions} options
   * @return {!cast.framework.CastReceiverContext}
   */
  start(options) {}
};
