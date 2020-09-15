/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Require all exported classes an app might use.
 * @suppress {extraRequire}
 */

goog.require('shaka.Deprecate');
goog.require('shaka.Player');
goog.require('shaka.abr.SimpleAbrManager');
goog.require('shaka.ads.AdManager');
goog.require('shaka.cast.CastProxy');
goog.require('shaka.cast.CastReceiver');
goog.require('shaka.dash.DashParser');
goog.require('shaka.hls.HlsParser');
goog.require('shaka.log');
goog.require('shaka.media.AdaptationSetCriteria');
goog.require('shaka.media.InitSegmentReference');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.media.PreferenceBasedCriteria');
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
goog.require('shaka.polyfill.EncryptionScheme');
goog.require('shaka.polyfill.Fullscreen');
goog.require('shaka.polyfill.InputEvent');
goog.require('shaka.polyfill.MathRound');
goog.require('shaka.polyfill.MediaSource');
goog.require('shaka.polyfill.PatchedMediaKeysApple');
goog.require('shaka.polyfill.PatchedMediaKeysMs');
goog.require('shaka.polyfill.PatchedMediaKeysNop');
goog.require('shaka.polyfill.PatchedMediaKeysWebkit');
goog.require('shaka.polyfill.PiPWebkit');
goog.require('shaka.polyfill.VTTCue');
goog.require('shaka.polyfill.VideoPlayPromise');
goog.require('shaka.polyfill.VideoPlaybackQuality');
goog.require('shaka.polyfill');
goog.require('shaka.routing.Walker');
goog.require('shaka.text.Cue');
goog.require('shaka.text.Mp4TtmlParser');
goog.require('shaka.text.Mp4VttParser');
goog.require('shaka.text.TextEngine');
goog.require('shaka.text.TtmlTextParser');
goog.require('shaka.text.VttTextParser');
goog.require('shaka.ui.Controls');
goog.require('shaka.ui.PlayButton');
goog.require('shaka.ui.SettingsMenu');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.AudioLanguageSelection');
goog.require('shaka.ui.AdCounter');
goog.require('shaka.ui.AdPosition');
goog.require('shaka.ui.BigPlayButton');
goog.require('shaka.ui.CastButton');
goog.require('shaka.ui.Element');
goog.require('shaka.ui.FastForwardButton');
goog.require('shaka.ui.FullscreenButton');
goog.require('shaka.ui.Localization');
goog.require('shaka.ui.LoopButton');
goog.require('shaka.ui.MuteButton');
goog.require('shaka.ui.Overlay');
goog.require('shaka.ui.PipButton');
goog.require('shaka.ui.PlaybackRateSelection');
goog.require('shaka.ui.PresentationTimeTracker');
goog.require('shaka.ui.ResolutionSelection');
goog.require('shaka.ui.RewindButton');
goog.require('shaka.ui.SkipAdButton');
goog.require('shaka.ui.SmallPlayButton');
goog.require('shaka.ui.Spacer');
goog.require('shaka.ui.TextSelection');
goog.require('shaka.ui.VolumeBar');
goog.require('shaka.util.Dom');
goog.require('shaka.util.Error');
goog.require('shaka.util.FairPlayUtils');
goog.require('shaka.util.Iterables');
