/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.routing.Node');


/**
 * @typedef {{
 *   name: string
 * }}
 *
 * @description
 *   A node is the one of the two fundamental units used to build graphs. It
 *   represents the position within a graph.
 *
 * @property {string} name
 *   A human-readable name for this node. While this should not be used in
 *   production, the name helps identify nodes when debugging.
 */
shaka.routing.Node;
