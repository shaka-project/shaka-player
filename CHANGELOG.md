# Changelog

## [4.0.5](https://github.com/shaka-project/shaka-player/compare/v4.0.4...v4.0.5) (2022-08-17)

### This is the **last planned release** in the v4.0.x branch.

### Bug Fixes

* add strictMissingProperties suppressions to unblock strict missing properties on union types. ([#4371](https://github.com/shaka-project/shaka-player/issues/4371)) ([2e26775](https://github.com/shaka-project/shaka-player/commit/2e2677528074e6180e80d21bfa92880c99eface9))
* exception if on early adError ([#4362](https://github.com/shaka-project/shaka-player/issues/4362)) ([94413d2](https://github.com/shaka-project/shaka-player/commit/94413d253edcf6bb9d11dc147c661426236bc0a9)), closes [#4004](https://github.com/shaka-project/shaka-player/issues/4004)
* Fix key ID byteswapping for PlayReady on PS4 ([#4377](https://github.com/shaka-project/shaka-player/issues/4377)) ([e677606](https://github.com/shaka-project/shaka-player/commit/e6776061436855ad508900d6b3826cbe6f4959a4))
* Fix MediaCapabilities polyfill on Tizen and WebOS ([#4396](https://github.com/shaka-project/shaka-player/issues/4396)) ([124f882](https://github.com/shaka-project/shaka-player/commit/124f8821b00d35530a533ad237a9ce2f0979addf)), closes [#4383](https://github.com/shaka-project/shaka-player/issues/4383) [#4357](https://github.com/shaka-project/shaka-player/issues/4357)
* Fix TextDecoder fallback and browser support check ([#4403](https://github.com/shaka-project/shaka-player/issues/4403)) ([d86b1ba](https://github.com/shaka-project/shaka-player/commit/d86b1baf3bf2c202e06276671dddfb07d63f2d5a))
* Fix UI captions icon state ([#4384](https://github.com/shaka-project/shaka-player/issues/4384)) ([65a90e8](https://github.com/shaka-project/shaka-player/commit/65a90e88b99a6508c04e38602dd3455f660bbfdc)), closes [#4358](https://github.com/shaka-project/shaka-player/issues/4358)
* Fix VP9 codec checks on Mac Firefox ([#4391](https://github.com/shaka-project/shaka-player/issues/4391)) ([0721b19](https://github.com/shaka-project/shaka-player/commit/0721b199467162ba777db5781bd39f39f75ac45c))
* **text:** Fix cue region rendering in UI ([#4412](https://github.com/shaka-project/shaka-player/issues/4412)) ([54184bb](https://github.com/shaka-project/shaka-player/commit/54184bb2c5224324b42e0e28383bcb8b073971f9)), closes [#4381](https://github.com/shaka-project/shaka-player/issues/4381)
* **text:** Fix TTML render timing and line break issues ([#4407](https://github.com/shaka-project/shaka-player/issues/4407)) ([6726d47](https://github.com/shaka-project/shaka-player/commit/6726d4728694a91bfac3d946a3e7c9abeb2aba0c)), closes [#4381](https://github.com/shaka-project/shaka-player/issues/4381)
* Update v4.0.x branch Cast receiver ID ([874fcd6](https://github.com/shaka-project/shaka-player/commit/874fcd64c8605c842be27b7bdd4457754e883f3e))

## [4.0.4](https://github.com/shaka-project/shaka-player/compare/v4.0.3...v4.0.4) (2022-07-14)


### Bug Fixes

* Add fallback to TextDecoder and TextEncoder ([#4324](https://github.com/shaka-project/shaka-player/issues/4324)) ([92f9190](https://github.com/shaka-project/shaka-player/commit/92f91904b08a09a56558d91818924287d35a4cb0))
* Debug buffer placement ([9f8520c](https://github.com/shaka-project/shaka-player/commit/9f8520c0e5c67a4404b03a7b96cbc3163db0844c))
* Fix EOS set-top box being identified as Apple. ([#4310](https://github.com/shaka-project/shaka-player/issues/4310)) ([1d642e5](https://github.com/shaka-project/shaka-player/commit/1d642e5fb101d985c05e68c7bcabab471ef122dd))
* Fix getVideoPlaybackQuality in WebOS 3 ([#4316](https://github.com/shaka-project/shaka-player/issues/4316)) ([a1af9dd](https://github.com/shaka-project/shaka-player/commit/a1af9dd5b9ebe6b671f5fe7daa97f713f66f8cfa))
* Fix MediaCapabilities polyfill on Playstation 4 ([#4320](https://github.com/shaka-project/shaka-player/issues/4320)) ([0f20944](https://github.com/shaka-project/shaka-player/commit/0f20944f34fef2dbb7dad62cdb3129729dfefcb5))
* Fix segment index assertions with DAI ([9a8bf42](https://github.com/shaka-project/shaka-player/commit/9a8bf42928e82818909e33b056644fd740636c94))
* VTT Cue Parsing On PlayStation 4 ([#4340](https://github.com/shaka-project/shaka-player/issues/4340)) ([37dc855](https://github.com/shaka-project/shaka-player/commit/37dc855d3613b8bb8a68c1f7da1ff2e76e948ed7)), closes [#4321](https://github.com/shaka-project/shaka-player/issues/4321)

## [4.0.3](https://github.com/shaka-project/shaka-player/compare/v4.0.2...v4.0.3) (2022-06-14)


### Bug Fixes

* **demo:** allow switch between UITextDisplayer and SimpleTextDisplayer ([#4275](https://github.com/shaka-project/shaka-player/issues/4275)) ([e8c04cd](https://github.com/shaka-project/shaka-player/commit/e8c04cd37e987c71ed6166454d40204cc693b947))
* **demo:** erroneous FairPlay keysystem in demo ([#4276](https://github.com/shaka-project/shaka-player/issues/4276)) ([1abfdb1](https://github.com/shaka-project/shaka-player/commit/1abfdb16e0bade37e6a21e4decb5600fdcbd296b))
* **hls:** Fix AV sync issues, fallback to sequence numbers if PROGRAM-DATE-TIME ignored ([#4289](https://github.com/shaka-project/shaka-player/issues/4289)) ([629a21d](https://github.com/shaka-project/shaka-player/commit/629a21dbe7b97eab04a61a08e39e76cf5263c352)), closes [#4287](https://github.com/shaka-project/shaka-player/issues/4287)
* New EME polyfill fixes EME/MCap issues on some smart TVs ([#4279](https://github.com/shaka-project/shaka-player/issues/4279)) ([e55350f](https://github.com/shaka-project/shaka-player/commit/e55350f1377a9fba49797cd59fb72983367b7a97))
* Populate track's spatialAudio property ([#4291](https://github.com/shaka-project/shaka-player/issues/4291)) ([46343f0](https://github.com/shaka-project/shaka-player/commit/46343f0dea9b4ce3f9424afe9a9dff96941eba8d))
* Remove IE 11 from default browsers for Windows ([#4272](https://github.com/shaka-project/shaka-player/issues/4272)) ([1e83080](https://github.com/shaka-project/shaka-player/commit/1e8308058cdfa9745dbd2ac37e427d89db0f6849)), closes [#4271](https://github.com/shaka-project/shaka-player/issues/4271)
* Use middle segment when guessing MIME type on HLS ([#4269](https://github.com/shaka-project/shaka-player/issues/4269)) ([#4270](https://github.com/shaka-project/shaka-player/issues/4270)) ([5406429](https://github.com/shaka-project/shaka-player/commit/5406429940e8ce6287356a24c495df11d2365d07))

## [4.0.2](https://github.com/shaka-project/shaka-player/compare/v4.0.1...v4.0.2) (2022-06-02)


### Bug Fixes

* **abr:** use Network Info API in ABR getBandwidthEstimate ([#4263](https://github.com/shaka-project/shaka-player/issues/4263)) ([2a12f0d](https://github.com/shaka-project/shaka-player/commit/2a12f0dc3c95220fc4c35b9871823eb685ecf337))
* Don't send drmsessionupdate after unload ([#4248](https://github.com/shaka-project/shaka-player/issues/4248)) ([d7a7024](https://github.com/shaka-project/shaka-player/commit/d7a70247b2c381f1ba1d129618e45771f0e58061))
* Fix audio mime type in multiplexed HLS stream ([#4241](https://github.com/shaka-project/shaka-player/issues/4241)) ([467fc8b](https://github.com/shaka-project/shaka-player/commit/467fc8b14b4a9ede601a1501ec901149088fc0c7))
* **HLS:** Fix duplicate hinted segments ([#4258](https://github.com/shaka-project/shaka-player/issues/4258)) ([d92881b](https://github.com/shaka-project/shaka-player/commit/d92881b7ae350ad41eda7b0aeb87d9e32b59375a)), closes [#4223](https://github.com/shaka-project/shaka-player/issues/4223)
* **ui:** Widen touchable button area ([#3249](https://github.com/shaka-project/shaka-player/issues/3249)) ([96b2965](https://github.com/shaka-project/shaka-player/commit/96b296595c32885caac66af7b04bdc1f59d0c790))

### [4.0.1](https://github.com/shaka-project/shaka-player/compare/v4.0.0...v4.0.1) (2022-05-18)


### Bug Fixes

* Do not report MANIFEST RESTRICTIONS_CANNOT_BE_MET error twice ([#4194](https://github.com/shaka-project/shaka-player/issues/4194)) ([0b03e79](https://github.com/shaka-project/shaka-player/commit/0b03e7900bd28420e6b066f909a69ff511144471)), closes [#4190](https://github.com/shaka-project/shaka-player/issues/4190)
* **fairplay:** Re-add initDataTransform config ([#4231](https://github.com/shaka-project/shaka-player/issues/4231)) ([9a6f150](https://github.com/shaka-project/shaka-player/commit/9a6f150c082e477f9dae95c4436d6ff764481d02))
* Fix event listener leaks in Player ([#4229](https://github.com/shaka-project/shaka-player/issues/4229)) ([e6c3b22](https://github.com/shaka-project/shaka-player/commit/e6c3b226ba25cd62b288c75da895531ed27087c0))
* Fix exception with streaming.startAtSegmentBoundary ([#4216](https://github.com/shaka-project/shaka-player/issues/4216)) ([24eac2c](https://github.com/shaka-project/shaka-player/commit/24eac2c4bcea726f36d11845d8a174672c28e74f)), closes [#4188](https://github.com/shaka-project/shaka-player/issues/4188)
* Fix PERIOD_FLATTENING_FAILED error when periods have different base sample types ([#4206](https://github.com/shaka-project/shaka-player/issues/4206)) ([0482aec](https://github.com/shaka-project/shaka-player/commit/0482aec127e5429434ba015bd98ae8c5e15fef68)), closes [#4202](https://github.com/shaka-project/shaka-player/issues/4202)
* Fix VTT cue timing in HLS ([#4217](https://github.com/shaka-project/shaka-player/issues/4217)) ([69d1c14](https://github.com/shaka-project/shaka-player/commit/69d1c143aaade9167cba03a05daea5b94b3ccf95)), closes [#4191](https://github.com/shaka-project/shaka-player/issues/4191)
* **hls:** Fix av1 codec selection in HLS. ([#4203](https://github.com/shaka-project/shaka-player/issues/4203)) ([4d418be](https://github.com/shaka-project/shaka-player/commit/4d418be18334b181ab7f32f9e9fe66522fc9057a))
* **hls:** Fix X-PRELOAD-HINT failure with LL mode off ([#4212](https://github.com/shaka-project/shaka-player/issues/4212)) ([ae84aac](https://github.com/shaka-project/shaka-player/commit/ae84aac87cc4331139a98441c90993319a3b19ef)), closes [#4185](https://github.com/shaka-project/shaka-player/issues/4185)
* Wait for chapters track to be loaded ([#4228](https://github.com/shaka-project/shaka-player/issues/4228)) ([dec3d9c](https://github.com/shaka-project/shaka-player/commit/dec3d9c50505a6a7707232f595acbe1cfea8c3a0)), closes [#4186](https://github.com/shaka-project/shaka-player/issues/4186)

## [4.0.0](https://github.com/shaka-project/shaka-player/compare/v3.3.0...v4.0.0) (2022-04-30)


### ⚠ BREAKING CHANGES

* Remove small/large gap config, always jump gaps (#4125)
* **config:** `manifest.dash.defaultPresentationDelay` has been replaced by `manifest.defaultPresentationDelay` (deprecated in v3.0.0)
* **config:** Configuration of factories should be plain factory functions, not constructors; these will not be invoked with `new` (deprecated in v3.1.0)
* **player:** `shaka.Player.prototype.addTextTrack()` has been replaced by `addTextTrackAsync()`, which returns a `Promise` (deprecated in v3.1.0)
* **ui:** `shaka.ui.TrackLabelFormat` has been renamed to `shaka.ui.Overlay.TrackLabelFormat` (deprecated in v3.1.0)
* **ui:** `shaka.ui.FailReasonCode` has been renamed to `shaka.ui.Overlay.FailReasonCode` (deprecated in v3.1.0)
* **offline:** `shaka.offline.Storage.prototype.store()` returns `AbortableOperation` instead of `Promise` (deprecated in v3.0.0)
* **offline:** `shaka.offline.Storage.prototype.getStoreInProgress()` has been removed; concurrent operations are supported, so callers don't need to check this (deprecated in v3.0.0)
* `shaka.util.Uint8ArrayUtils.equal` has been replaced by `shaka.util.BufferUtils.equal`, which can handle multiple types of buffers (deprecated in v3.0.0)
* **manifest:** `shaka.media.SegmentIndex.prototype.destroy()` has been replaced by `release()`, which is synchronous (deprecated in v3.0.0)
* **manifest:** `shaka.media.SegmentIterator.prototype.seek()`, which mutates the iterator, has been replaced by `shaka.media.SegmentIndex.getIteratorForTime()` (deprecated in v3.1.0)
* **manifest:** `shaka.media.SegmentIndex.prototype.merge()` has become private; use `mergeAndEvict()` instead (deprecated in v3.2.0)
* **plugin:** `AbrManager` plugins must implement the `playbackRateChanged()` method (deprecated in v3.0.0)
* **plugin:** `shaka.extern.Cue.prototype.spacer` has been replaced by the more clearly-named `lineBreak` (deprecated in v3.1.0)
* **plugin:** `IUIElement` plugins must have a `release()` method (not `destroy()`) (deprecated in v3.0.0)
* Remove deprecated features, update upgrade guides (#4089)
* Remove support for Safari 12 and iOS 12 (#4112)
* **hls:** HLS disabled in old browsers/platforms due to incompatibilities (#3964)

### Features

* `shaka.util.Uint8ArrayUtils.equal` has been replaced by `shaka.util.BufferUtils.equal`, which can handle multiple types of buffers (deprecated in v3.0.0) ([ac5acc8](https://github.com/shaka-project/shaka-player/commit/ac5acc80cb8d2bcb58455e8f66f7e1c2d18b0a3a))
* Add Dockerfile and docker build instructions ([925de19](https://github.com/shaka-project/shaka-player/commit/925de1995eeb22863e8d4e92d720465834619288))
* add modern EME support for FairPlay ([#3776](https://github.com/shaka-project/shaka-player/issues/3776)) ([6d76a13](https://github.com/shaka-project/shaka-player/commit/6d76a135e5128dfd47653acea025d0a264d121d5))
* add new methods to FairPlayUtils ([#4029](https://github.com/shaka-project/shaka-player/issues/4029)) ([f1eeac1](https://github.com/shaka-project/shaka-player/commit/f1eeac1efb618aa7202b17b67c43056714f8da2f))
* add option for segment-relative VTT timings ([#4083](https://github.com/shaka-project/shaka-player/issues/4083)) ([f382cc7](https://github.com/shaka-project/shaka-player/commit/f382cc702be6cc28266fe61a33e43573cb22be57))
* Add separate audio and video MIME types to Track API ([#3892](https://github.com/shaka-project/shaka-player/issues/3892)) ([74c491d](https://github.com/shaka-project/shaka-player/commit/74c491d2e0042f62385813f04e74517cf00fcade)), closes [#3888](https://github.com/shaka-project/shaka-player/issues/3888)
* Allow WebP and AVIF image streams ([#3856](https://github.com/shaka-project/shaka-player/issues/3856)) ([9f3fb46](https://github.com/shaka-project/shaka-player/commit/9f3fb46d371d52f58bc9a7fc5beefe51890879ed)), closes [#3845](https://github.com/shaka-project/shaka-player/issues/3845)
* **config:** `manifest.dash.defaultPresentationDelay` has been replaced by `manifest.defaultPresentationDelay` (deprecated in v3.0.0) ([ac5acc8](https://github.com/shaka-project/shaka-player/commit/ac5acc80cb8d2bcb58455e8f66f7e1c2d18b0a3a))
* **config:** Configuration of factories should be plain factory functions, not constructors; these will not be invoked with `new` (deprecated in v3.1.0) ([ac5acc8](https://github.com/shaka-project/shaka-player/commit/ac5acc80cb8d2bcb58455e8f66f7e1c2d18b0a3a))
* **dash:** Construct ClearKey PSSH based on MPD ContentProtection ([#4104](https://github.com/shaka-project/shaka-player/issues/4104)) ([b83b412](https://github.com/shaka-project/shaka-player/commit/b83b4120f46ae94e3ce194f43b13517b7a736f07))
* **dash:** Parse ClearKey license URL in MPD ([#4066](https://github.com/shaka-project/shaka-player/issues/4066)) ([19e24b1](https://github.com/shaka-project/shaka-player/commit/19e24b1d741b4ba6946011748be8b759b4b71773))
* **demo:** Add Apple Advanced HLS Stream (TS) with raw AAC ([#3933](https://github.com/shaka-project/shaka-player/issues/3933)) ([1becadf](https://github.com/shaka-project/shaka-player/commit/1becadfc93ca06d64d0c9ace37c80213268a1675))
* **demo:** Added demo asset with raw AAC. ([014c7b3](https://github.com/shaka-project/shaka-player/commit/014c7b302b292a22f62d4e01230b927b33bc51da)), closes [#2337](https://github.com/shaka-project/shaka-player/issues/2337)
* **DRM:** add drmInfo to license requests ([#4030](https://github.com/shaka-project/shaka-player/issues/4030)) ([abe846e](https://github.com/shaka-project/shaka-player/commit/abe846e1a3456b029822ea42eb0520dec547fda6))
* **DRM:** add initData and initDataType to license requests ([#4039](https://github.com/shaka-project/shaka-player/issues/4039)) ([bdc5ea7](https://github.com/shaka-project/shaka-player/commit/bdc5ea767ebe55bb0b18dd106e269ab3fecd6d00))
* **HLS:** Containerless format support ([36d0b54](https://github.com/shaka-project/shaka-player/commit/36d0b5484fad68dc1d640fbddf2fae3e1eb7169b)), closes [#2337](https://github.com/shaka-project/shaka-player/issues/2337)
* **hls:** HLS disabled in old browsers/platforms due to incompatibilities ([#3964](https://github.com/shaka-project/shaka-player/issues/3964)) ([0daa00f](https://github.com/shaka-project/shaka-player/commit/0daa00fc7f074c1c86968ed0fcd84bc30254ee6d))
* **hls:** make a head request if hls subtitles have no extension ([#4140](https://github.com/shaka-project/shaka-player/issues/4140)) ([19e12b5](https://github.com/shaka-project/shaka-player/commit/19e12b5e282e661a9a17a6bfbb87c565faf2bc6e))
* **hls:** parse EXT-X-GAP ([#4134](https://github.com/shaka-project/shaka-player/issues/4134)) ([42eecc8](https://github.com/shaka-project/shaka-player/commit/42eecc84f992ca6a680c3a5fd46d1c300fe92a72))
* **HLS:** Re-add TS support to Safari ([#4097](https://github.com/shaka-project/shaka-player/issues/4097)) ([8a3bed7](https://github.com/shaka-project/shaka-player/commit/8a3bed710c104c9729fec2072318e50f9fe15ab2))
* **hls:** Read EXT-X-PROGRAM-DATE-TIME ([#4034](https://github.com/shaka-project/shaka-player/issues/4034)) ([89409ce](https://github.com/shaka-project/shaka-player/commit/89409cee3eaeb6764dbc191b7408bf45eecdced3)), closes [#2337](https://github.com/shaka-project/shaka-player/issues/2337)
* **manifest:** `shaka.media.SegmentIndex.prototype.destroy()` has been replaced by `release()`, which is synchronous (deprecated in v3.0.0) ([ac5acc8](https://github.com/shaka-project/shaka-player/commit/ac5acc80cb8d2bcb58455e8f66f7e1c2d18b0a3a))
* **manifest:** `shaka.media.SegmentIndex.prototype.merge()` has become private; use `mergeAndEvict()` instead (deprecated in v3.2.0) ([ac5acc8](https://github.com/shaka-project/shaka-player/commit/ac5acc80cb8d2bcb58455e8f66f7e1c2d18b0a3a))
* **manifest:** `shaka.media.SegmentIterator.prototype.seek()`, which mutates the iterator, has been replaced by `shaka.media.SegmentIndex.getIteratorForTime()` (deprecated in v3.1.0) ([ac5acc8](https://github.com/shaka-project/shaka-player/commit/ac5acc80cb8d2bcb58455e8f66f7e1c2d18b0a3a))
* **offline:** `shaka.offline.Storage.prototype.getStoreInProgress()` has been removed; concurrent operations are supported, so callers don't need to check this (deprecated in v3.0.0) ([ac5acc8](https://github.com/shaka-project/shaka-player/commit/ac5acc80cb8d2bcb58455e8f66f7e1c2d18b0a3a))
* **offline:** `shaka.offline.Storage.prototype.store()` returns `AbortableOperation` instead of `Promise` (deprecated in v3.0.0) ([ac5acc8](https://github.com/shaka-project/shaka-player/commit/ac5acc80cb8d2bcb58455e8f66f7e1c2d18b0a3a))
* **offline:** improve the speed of offline downloads ([#4168](https://github.com/shaka-project/shaka-player/issues/4168)) ([73f6de3](https://github.com/shaka-project/shaka-player/commit/73f6de3e01ae4ed3b86302add7ee16c86c3b9b78))
* only polyfill MCap for non Android-based Cast devices. ([#4170](https://github.com/shaka-project/shaka-player/issues/4170)) ([11321d8](https://github.com/shaka-project/shaka-player/commit/11321d8f26b01412fa5173aa6efcf777186fa7a0))
* **player:** `shaka.Player.prototype.addTextTrack()` has been replaced by `addTextTrackAsync()`, which returns a `Promise` (deprecated in v3.1.0) ([ac5acc8](https://github.com/shaka-project/shaka-player/commit/ac5acc80cb8d2bcb58455e8f66f7e1c2d18b0a3a))
* **plugin:** `AbrManager` plugins must implement the `playbackRateChanged()` method (deprecated in v3.0.0) ([ac5acc8](https://github.com/shaka-project/shaka-player/commit/ac5acc80cb8d2bcb58455e8f66f7e1c2d18b0a3a))
* **plugin:** `IUIElement` plugins must have a `release()` method (not `destroy()`) (deprecated in v3.0.0) ([ac5acc8](https://github.com/shaka-project/shaka-player/commit/ac5acc80cb8d2bcb58455e8f66f7e1c2d18b0a3a))
* **plugin:** `shaka.extern.Cue.prototype.spacer` has been replaced by the more clearly-named `lineBreak` (deprecated in v3.1.0) ([ac5acc8](https://github.com/shaka-project/shaka-player/commit/ac5acc80cb8d2bcb58455e8f66f7e1c2d18b0a3a))
* Public release of Sindarin (sjn) translation easter egg ([#4033](https://github.com/shaka-project/shaka-player/issues/4033)) ([9029d06](https://github.com/shaka-project/shaka-player/commit/9029d0677e0e0325e0dbe939907ba60ecec74c92))
* Remove deprecated features, update upgrade guides ([#4089](https://github.com/shaka-project/shaka-player/issues/4089)) ([ac5acc8](https://github.com/shaka-project/shaka-player/commit/ac5acc80cb8d2bcb58455e8f66f7e1c2d18b0a3a))
* Remove small/large gap config, always jump gaps ([#4125](https://github.com/shaka-project/shaka-player/issues/4125)) ([0fd1999](https://github.com/shaka-project/shaka-player/commit/0fd19997dde7b03bad7464a82dc86d7b2cd8a304))
* Remove support for Safari 12 and iOS 12 ([#4112](https://github.com/shaka-project/shaka-player/issues/4112)) ([8bb7044](https://github.com/shaka-project/shaka-player/commit/8bb70449d33c31a0e7fc312260dc001cc9e3a792))
* **ui:** `shaka.ui.FailReasonCode` has been renamed to `shaka.ui.Overlay.FailReasonCode` (deprecated in v3.1.0) ([ac5acc8](https://github.com/shaka-project/shaka-player/commit/ac5acc80cb8d2bcb58455e8f66f7e1c2d18b0a3a))
* **ui:** `shaka.ui.TrackLabelFormat` has been renamed to `shaka.ui.Overlay.TrackLabelFormat` (deprecated in v3.1.0) ([ac5acc8](https://github.com/shaka-project/shaka-player/commit/ac5acc80cb8d2bcb58455e8f66f7e1c2d18b0a3a))
* **ui:** Add quality selection for audio-only content ([#3649](https://github.com/shaka-project/shaka-player/issues/3649)) ([adc3502](https://github.com/shaka-project/shaka-player/commit/adc3502d55f39eaca30f3c42e17961ec7d681c80)), closes [#2071](https://github.com/shaka-project/shaka-player/issues/2071)
* **UI:** Add video fullscreen support for iOS ([#3853](https://github.com/shaka-project/shaka-player/issues/3853)) ([8d1b5e6](https://github.com/shaka-project/shaka-player/commit/8d1b5e6b07e979bd641da0b2b53c5f8e872422ad)), closes [#3832](https://github.com/shaka-project/shaka-player/issues/3832)


### Bug Fixes

* Add explicit release() for FakeEventTarget ([#3950](https://github.com/shaka-project/shaka-player/issues/3950)) ([f1c1585](https://github.com/shaka-project/shaka-player/commit/f1c1585afb2cfa3eb6b7465c8b32c9bad8e62d15))
* Add missing module export in generated typescript defs ([feefd7b](https://github.com/shaka-project/shaka-player/commit/feefd7b7d1cc318800c8d83de8cce81c57939f7d))
* Avoid WebCrypto randomUUID when CMCD disabled ([4731c76](https://github.com/shaka-project/shaka-player/commit/4731c7677f4f179f19ae647d3bb1edfda40dac53))
* **cea:** make a more robust CEA MP4 parser ([#3965](https://github.com/shaka-project/shaka-player/issues/3965)) ([2687b95](https://github.com/shaka-project/shaka-player/commit/2687b95d5830179c53914a7e903ecfbaced429cc))
* Clear buffer on seek if mediaState is updating ([#3795](https://github.com/shaka-project/shaka-player/issues/3795)) ([9705639](https://github.com/shaka-project/shaka-player/commit/9705639f4514d8d2dbfe5d81a31388f99e6be507)), closes [#3299](https://github.com/shaka-project/shaka-player/issues/3299)
* **cmcd:** Fix Symbol usage in CMCD on Xbox One ([#4073](https://github.com/shaka-project/shaka-player/issues/4073)) ([4005754](https://github.com/shaka-project/shaka-player/commit/400575498f34cf252aaba0bc1367953b8cf44537)), closes [#4072](https://github.com/shaka-project/shaka-player/issues/4072)
* **css:** Fix missing % in calculation ([#4157](https://github.com/shaka-project/shaka-player/issues/4157)) ([1c86195](https://github.com/shaka-project/shaka-player/commit/1c8619582319c46c524807aa4bdff1191b2efc91))
* **dash:** Account for bandwidth before filtering text stream ([#3765](https://github.com/shaka-project/shaka-player/issues/3765)) ([0b04aec](https://github.com/shaka-project/shaka-player/commit/0b04aecdd7ad4184a72b8cf562318b28128344bf)), closes [#3724](https://github.com/shaka-project/shaka-player/issues/3724)
* **dash:** Fix performance regression ([#4064](https://github.com/shaka-project/shaka-player/issues/4064)) ([298b604](https://github.com/shaka-project/shaka-player/commit/298b60481d34bd9d776874fe1b9a8eea05b533d9))
* **dash:** Fix playback of Dolby Atmos ([#4173](https://github.com/shaka-project/shaka-player/issues/4173)) ([d51fe23](https://github.com/shaka-project/shaka-player/commit/d51fe23b7fab99501818c18cc76586e1ec4abcdd)), closes [#4171](https://github.com/shaka-project/shaka-player/issues/4171)
* Fix broken deps file generation on Windows ([#4086](https://github.com/shaka-project/shaka-player/issues/4086)) ([9660ce8](https://github.com/shaka-project/shaka-player/commit/9660ce85df48856b964eebc330c28beba2e3068a)), closes [#4085](https://github.com/shaka-project/shaka-player/issues/4085)
* Fix CMCD property mangling ([#3842](https://github.com/shaka-project/shaka-player/issues/3842)) ([fa5932c](https://github.com/shaka-project/shaka-player/commit/fa5932ca8f604952590734bf8bdc27ad8e69e8d8)), closes [#3839](https://github.com/shaka-project/shaka-player/issues/3839)
* Fix CMCD top bitrate reporting ([#3852](https://github.com/shaka-project/shaka-player/issues/3852)) ([922778a](https://github.com/shaka-project/shaka-player/commit/922778a5ebd2d58ca0c1e804745ca40cda1228bc)), closes [#3851](https://github.com/shaka-project/shaka-player/issues/3851)
* Fix compiler error introduced in [#3864](https://github.com/shaka-project/shaka-player/issues/3864) ([#3906](https://github.com/shaka-project/shaka-player/issues/3906)) ([0635e2c](https://github.com/shaka-project/shaka-player/commit/0635e2c055c13a405048c7696389c1dfc039902f))
* Fix download of some HLS assets ([#3934](https://github.com/shaka-project/shaka-player/issues/3934)) ([36ca820](https://github.com/shaka-project/shaka-player/commit/36ca820877965db8bcc8b9c4b2a428317301bb95))
* Fix duplicate CMCD parameters in HLS live content ([#3875](https://github.com/shaka-project/shaka-player/issues/3875)) ([f27401c](https://github.com/shaka-project/shaka-player/commit/f27401cc151a435ae8fb12be4e86d672c331e1e5)), closes [#3862](https://github.com/shaka-project/shaka-player/issues/3862)
* Fix encryption detection to work around broken platforms ([#4169](https://github.com/shaka-project/shaka-player/issues/4169)) ([c5f474e](https://github.com/shaka-project/shaka-player/commit/c5f474ef983169e6ff29f1594d15a9b50b12d316))
* Fix exception in StreamingEngine for EMSG with HLS ([#3887](https://github.com/shaka-project/shaka-player/issues/3887)) ([48433ab](https://github.com/shaka-project/shaka-player/commit/48433abe74c5f603cf06097e391ffdfa22d64256)), closes [#3886](https://github.com/shaka-project/shaka-player/issues/3886)
* Fix exceptions when quickly shutting down src= on Safari ([#4088](https://github.com/shaka-project/shaka-player/issues/4088)) ([ca08230](https://github.com/shaka-project/shaka-player/commit/ca08230fbe85d66176c7fa1fb4f9782d0ab364fc)), closes [#4087](https://github.com/shaka-project/shaka-player/issues/4087)
* Fix MediaCapabilities polyfill on Safari ([0201f2b](https://github.com/shaka-project/shaka-player/commit/0201f2b7604e76062b68b8b1acbf098faf71d019)), closes [#3696](https://github.com/shaka-project/shaka-player/issues/3696) [#3530](https://github.com/shaka-project/shaka-player/issues/3530)
* Fix memory leak in DASH live streams with inband EventStream ([#3957](https://github.com/shaka-project/shaka-player/issues/3957)) ([b7f04cb](https://github.com/shaka-project/shaka-player/commit/b7f04cb36bda664ec9cf23a081d237793907eaae))
* Fix misdetection of HEVC support on MS Edge ([#3897](https://github.com/shaka-project/shaka-player/issues/3897)) ([dfb3699](https://github.com/shaka-project/shaka-player/commit/dfb369935b9e84fe69a7d38c7904fb0e00dc064a)), closes [#3860](https://github.com/shaka-project/shaka-player/issues/3860)
* Fix missing throughput in CMCD for HLS live ([#3874](https://github.com/shaka-project/shaka-player/issues/3874)) ([df55944](https://github.com/shaka-project/shaka-player/commit/df55944e8f49bdf8e34a679219cd6596ba46c777)), closes [#3873](https://github.com/shaka-project/shaka-player/issues/3873)
* Fix playback failure due to rounding errors ([1cc99c1](https://github.com/shaka-project/shaka-player/commit/1cc99c1241c89b5fb5a989dd52ff0b9a9753b65f)), closes [#3717](https://github.com/shaka-project/shaka-player/issues/3717)
* Fix playRangeEnd for certain content ([#4068](https://github.com/shaka-project/shaka-player/issues/4068)) ([5c81f3b](https://github.com/shaka-project/shaka-player/commit/5c81f3bddb9e48431556f4d622364043fee4ea80)), closes [#4026](https://github.com/shaka-project/shaka-player/issues/4026)
* Fix support for TTAF1 namespace (old version of TTML) ([#3864](https://github.com/shaka-project/shaka-player/issues/3864)) ([771619f](https://github.com/shaka-project/shaka-player/commit/771619ff0ef8ba0e3da9569ded3894b428d03c58)), closes [#3009](https://github.com/shaka-project/shaka-player/issues/3009)
* Fix usage of Shaka without polyfills ([dfc44cb](https://github.com/shaka-project/shaka-player/commit/dfc44cbca6b95eb137882075cb8bf02cfc73a9d3))
* **hls:** Fixed buffering issue with live HLS ([#4002](https://github.com/shaka-project/shaka-player/issues/4002)) ([c438e85](https://github.com/shaka-project/shaka-player/commit/c438e857f2f122eb45899148e067d68ffec3477c))
* **HLS:** skip whitespace in attributes ([#3884](https://github.com/shaka-project/shaka-player/issues/3884)) ([ea6c02a](https://github.com/shaka-project/shaka-player/commit/ea6c02aece1510598a898c235e66335d20eabedb))
* **hls:** Support playing media playlists directly ([#4080](https://github.com/shaka-project/shaka-player/issues/4080)) ([48dd205](https://github.com/shaka-project/shaka-player/commit/48dd20562c2226f61cc753a922629e44c1866f6d)), closes [#3536](https://github.com/shaka-project/shaka-player/issues/3536)
* **image:** Fix HLS image track issues ([264c842](https://github.com/shaka-project/shaka-player/commit/264c84249684ee809f53fd4117f9aab4e0a599ac)), closes [#3840](https://github.com/shaka-project/shaka-player/issues/3840)
* **image:** Fix thumbnails issues ([#3858](https://github.com/shaka-project/shaka-player/issues/3858)) ([087a9b4](https://github.com/shaka-project/shaka-player/commit/087a9b489b030aa0dc80011ca4e0a0c7a4124ecd))
* **offline:** Clean up orphaned segments on abort ([#4177](https://github.com/shaka-project/shaka-player/issues/4177)) ([c07447f](https://github.com/shaka-project/shaka-player/commit/c07447f00e9095020890366695561b71b045e55a))
* **offline:** Speed up offline storage by ~87% ([#4176](https://github.com/shaka-project/shaka-player/issues/4176)) ([c1c9613](https://github.com/shaka-project/shaka-player/commit/c1c96135120480afc9615713812eecc4a51f153b)), closes [#4166](https://github.com/shaka-project/shaka-player/issues/4166)
* **performance:** Eliminate use of ES6 generators ([#4092](https://github.com/shaka-project/shaka-player/issues/4092)) ([57c7324](https://github.com/shaka-project/shaka-player/commit/57c73241a0e8ce1615f7b3aca4c3ad8f69b7e8c2)), closes [#4062](https://github.com/shaka-project/shaka-player/issues/4062)
* Revert "Add missing module export in generated typescript defs" ([#4175](https://github.com/shaka-project/shaka-player/issues/4175)) ([fe4f5c6](https://github.com/shaka-project/shaka-player/commit/fe4f5c6e19214d6cf4d42da9430de03040532bab)), closes [#4167](https://github.com/shaka-project/shaka-player/issues/4167)
* Select first of identical audio streams ([#3869](https://github.com/shaka-project/shaka-player/issues/3869)) ([a6d8610](https://github.com/shaka-project/shaka-player/commit/a6d8610241dc7c8abd56cf7f0d48993d6139dcae))
* Support multiple chapter tracks with same language ([#3868](https://github.com/shaka-project/shaka-player/issues/3868)) ([8c626ae](https://github.com/shaka-project/shaka-player/commit/8c626aec238c01ebad7ccd06c9313e4f2e99d383)), closes [#3597](https://github.com/shaka-project/shaka-player/issues/3597)
* **text:** Fix caption overlap. ([bf67d87](https://github.com/shaka-project/shaka-player/commit/bf67d87387b1dfc4d3d8e0661bfe4efb1e4083b2)), closes [#3850](https://github.com/shaka-project/shaka-player/issues/3850) [#3741](https://github.com/shaka-project/shaka-player/issues/3741)
* **text:** Fix webvtt offset in sequence mode ([#3955](https://github.com/shaka-project/shaka-player/issues/3955)) ([a4e9267](https://github.com/shaka-project/shaka-player/commit/a4e926772e1b754fe968ee6f97490f08a40fe535)), closes [#2337](https://github.com/shaka-project/shaka-player/issues/2337)
* **text:** Inherit alignment from regions. ([e9df8fb](https://github.com/shaka-project/shaka-player/commit/e9df8fb10c3752cb833e89c8ac793241497e29b6))
* **text:** Made nested cues inherit region ([#3837](https://github.com/shaka-project/shaka-player/issues/3837)) ([3ff48cb](https://github.com/shaka-project/shaka-player/commit/3ff48cba9b28a29e8decc11898e326d7918bc8f4)), closes [#3743](https://github.com/shaka-project/shaka-player/issues/3743)
* **text:** Remove caption wrapper bgColor ([#3838](https://github.com/shaka-project/shaka-player/issues/3838)) ([0117441](https://github.com/shaka-project/shaka-player/commit/0117441bb06e0325b84666d2a5a76c0c2de81725)), closes [#3745](https://github.com/shaka-project/shaka-player/issues/3745)
* **ttml:** Center subtitles by default ([#4023](https://github.com/shaka-project/shaka-player/issues/4023)) ([f2f24d5](https://github.com/shaka-project/shaka-player/commit/f2f24d528f71e59c81d6172c24da2f412ca18d70))
* **UI:** Add cursor pointer to range elements ([#4059](https://github.com/shaka-project/shaka-player/issues/4059)) ([33e8400](https://github.com/shaka-project/shaka-player/commit/33e84009dc9f6d48884ecfc2f66eeb285f60d05a)), closes [#3220](https://github.com/shaka-project/shaka-player/issues/3220)
* **UI:** Fix text UI not updating when text is disabled ([#3867](https://github.com/shaka-project/shaka-player/issues/3867)) ([9f53d39](https://github.com/shaka-project/shaka-player/commit/9f53d394279066f29a2d391b6964cba11c4a3e1e)), closes [#3728](https://github.com/shaka-project/shaka-player/issues/3728)


## Older changelogs:
 - [v3.3.x](https://github.com/shaka-project/shaka-player/blob/v3.3.x/CHANGELOG.md)
 - [v3.2.x](https://github.com/shaka-project/shaka-player/blob/v3.2.x/CHANGELOG.md)
 - [v3.1.x](https://github.com/shaka-project/shaka-player/blob/v3.1.x/CHANGELOG.md)
 - [v3.0.x](https://github.com/shaka-project/shaka-player/blob/v3.0.x/CHANGELOG.md)
 - [ancient](https://github.com/shaka-project/shaka-player/blob/v2.5.x/CHANGELOG.md)
