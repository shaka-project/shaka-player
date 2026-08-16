/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for JWK set.
 * @externs
 */


/** A JSON Web Key set. */
class JWKSet {
  constructor() {
    /** @type {Array<JWK>} */
    this.keys = [];
  }
}


/** A JSON Web Key. */
class JWK {
  constructor() {
    /**
     * A key ID.  Any ASCII string.
     * @type {string}
     */
    this.kid = '';

    /**
     * A key type.  One of:
     *   1. "oct" (symmetric key octect sequence)
     *   2. "RSA" (RSA key)
     *   3. "EC" (elliptical curve key)
     * Use "oct" for clearkey.
     * @type {string}
     */
    this.kty = '';

    /**
     * A key in base 64.  Used with kty="oct".
     * @type {string}
     */
    this.k = '';
  }
}
