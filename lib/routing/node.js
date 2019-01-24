/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
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
