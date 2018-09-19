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

/**
 * @fileoverview Require all exported classes an app might use.
 * @suppress {extraRequire}
 */

goog.require('shaka.Player');
goog.require('shaka.abr.SimpleAbrManager');
goog.require('shaka.cast.CastProxy');
goog.require('shaka.cast.CastReceiver');
goog.require('shaka.dash.DashParser');
goog.require('shaka.hls.HlsParser');
goog.require('shaka.log');
goog.require('shaka.media.InitSegmentReference');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.media.PresentationTimeline');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.net.DataUriPlugin');
goog.require('shaka.net.HttpFetchPlugin');
goog.require('shaka.net.HttpXHRPlugin');
goog.require('shaka.offline.OfflineManifestParser');
goog.require('shaka.offline.OfflineScheme');
goog.require('shaka.offline.Storage');
goog.require('shaka.offline.indexeddb.StorageMechanism');
goog.require('shaka.polyfill.Fullscreen');
goog.require('shaka.polyfill.IndexedDB');
goog.require('shaka.polyfill.InputEvent');
goog.require('shaka.polyfill.MathRound');
goog.require('shaka.polyfill.MediaSource');
goog.require('shaka.polyfill.PatchedMediaKeysMs');
goog.require('shaka.polyfill.PatchedMediaKeysNop');
goog.require('shaka.polyfill.PatchedMediaKeysWebkit');
goog.require('shaka.polyfill.VTTCue');
goog.require('shaka.polyfill.VideoPlayPromise');
goog.require('shaka.polyfill.VideoPlaybackQuality');
goog.require('shaka.polyfill.installAll');
goog.require('shaka.text.Cue');
goog.require('shaka.text.Mp4TtmlParser');
goog.require('shaka.text.Mp4VttParser');
goog.require('shaka.text.SimpleTextDisplayer');
goog.require('shaka.text.TextEngine');
goog.require('shaka.text.TtmlTextParser');
goog.require('shaka.text.VttTextParser');
goog.require('shaka.util.Error');
goog.require('shaka.util.Iterables');
