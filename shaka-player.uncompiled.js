/**
 * Copyright 2014 Google Inc.
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
 *
 * @fileoverview Requires all exported classes from the library.
 */

goog.require('shaka.player.DashVideoSource');
goog.require('shaka.player.DrmSchemeInfo');
goog.require('shaka.player.HttpVideoSource');
goog.require('shaka.player.OfflineVideoSource');
goog.require('shaka.player.Player');
goog.require('shaka.player.StreamVideoSource');
goog.require('shaka.polyfill.installAll');
goog.require('shaka.util.EWMABandwidthEstimator');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.Uint8ArrayUtils');
