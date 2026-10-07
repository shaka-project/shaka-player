/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Definitions of newer Closure Compiler built-in types for the
 * older compiler bundled with Clutz.  These are used only to generate
 * TypeScript defs, and are removed from the output by generateTsDefs.py.
 *
 * @externs
 */


/**
 * The iterator protocol.  Newer Closure Compiler externs define this, and
 * redefine "Iterator" as a subtype of it for ES2025 iterator helpers.
 *
 * @record
 * @template T
 */
function IteratorLike() {}

/**
 * @return {!IIterableResult<T>}
 */
IteratorLike.prototype.next = function() {};
