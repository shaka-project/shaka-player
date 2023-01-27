/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for IndexedDB to override the ones provided by the
 * Closure Compiler.
 *
 * TODO: contribute fixes to the Closure Compiler externs
 *
 * @externs
 */

/**
 * @constructor
 * @extends {IDBRequest<!IDBDatabase>}
 * @suppress {duplicate}
 * The upstream extern doesn't have the correct type for Result.
 */
var IDBOpenDBRequest = function() {};

/** @type {!IDBDatabase} */
IDBOpenDBRequest.prototype.result;
