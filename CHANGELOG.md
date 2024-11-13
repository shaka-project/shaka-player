# Changelog

## [4.12.0](https://github.com/shaka-project/shaka-player/compare/v4.11.0...v4.12.0) (2024-11-13)


### Features

* Add config to ignore hardware resolution ([#7572](https://github.com/shaka-project/shaka-player/issues/7572)) ([11a7b92](https://github.com/shaka-project/shaka-player/commit/11a7b926e864d8b96870acaa933589900edebe2f))
* Add manifest.disableIFrames config ([#7255](https://github.com/shaka-project/shaka-player/issues/7255)) ([7b07614](https://github.com/shaka-project/shaka-player/commit/7b076145327e7960e9dec51d24d774b9189f52a2))
* Add preferredTextFormats config ([#7523](https://github.com/shaka-project/shaka-player/issues/7523)) ([597e129](https://github.com/shaka-project/shaka-player/commit/597e129bd62b9603de6b38b5e1ea824a3d563a22))
* Add safeSeekEndOffset feature for live reposition ([#7532](https://github.com/shaka-project/shaka-player/issues/7532)) ([73524d0](https://github.com/shaka-project/shaka-player/commit/73524d021750be61479c136bd8a04e01593cf2d7))
* **Ads:** Add config to allow disable interstitials ([#7271](https://github.com/shaka-project/shaka-player/issues/7271)) ([64e45c9](https://github.com/shaka-project/shaka-player/commit/64e45c96ba468b938477b951a21a42b7d6de7d96))
* **Ads:** New HLS interstitial DATERANGE attributes for Skip Button ([#7467](https://github.com/shaka-project/shaka-player/issues/7467)) ([3107de3](https://github.com/shaka-project/shaka-player/commit/3107de3678b71cd5e70439b8419a2ccdd69f2d76))
* **Cast:** Enable storage in Android Cast devices ([#7292](https://github.com/shaka-project/shaka-player/issues/7292)) ([1434426](https://github.com/shaka-project/shaka-player/commit/1434426f2c3b9573a4480e6478ffeaa81d7e9f20))
* **DASH:** Disable xlink processing by default ([#7264](https://github.com/shaka-project/shaka-player/issues/7264)) ([d5ed8ed](https://github.com/shaka-project/shaka-player/commit/d5ed8edaf529613bcec624dc6a27e840e82ce4ea))
* **Demo:** Add new asset with DASH-FairPlay ([#7487](https://github.com/shaka-project/shaka-player/issues/7487)) ([fbc6179](https://github.com/shaka-project/shaka-player/commit/fbc6179aa6bb46163bf8a5caff5df41515be8446))
* Enable AirPlay in MSE ([#7431](https://github.com/shaka-project/shaka-player/issues/7431)) ([a6cf9cb](https://github.com/shaka-project/shaka-player/commit/a6cf9cbfd3d7e9dceeafc5fdc6903e99fbb6c8ef))
* Enable audio groups by default ([#7549](https://github.com/shaka-project/shaka-player/issues/7549)) ([5024184](https://github.com/shaka-project/shaka-player/commit/5024184363102554743ec513748ce85b5a5b3f63))
* **HLS:** Add the update period for HLS manifest ([#7498](https://github.com/shaka-project/shaka-player/issues/7498)) ([7b38ca8](https://github.com/shaka-project/shaka-player/commit/7b38ca8b4938bf4e75828549e1844645e89d357c))
* **HLS:** Make dummy streams for tags representing muxed audio ([#7343](https://github.com/shaka-project/shaka-player/issues/7343)) ([e2413ed](https://github.com/shaka-project/shaka-player/commit/e2413ed5f247088452b2fad8d408ec96db78e419))
* **i18n:** Add Belarusian translation ([#7409](https://github.com/shaka-project/shaka-player/issues/7409)) ([51d00b8](https://github.com/shaka-project/shaka-player/commit/51d00b8f082e571deb76f584f7eb39de2614d491))
* **Offline:** Allow store external text ([#7328](https://github.com/shaka-project/shaka-player/issues/7328)) ([346cf48](https://github.com/shaka-project/shaka-player/commit/346cf48a5ec88b7c62cf6d316a186c357c3a99d6))
* **Offline:** Allow store external thumbnails ([#7322](https://github.com/shaka-project/shaka-player/issues/7322)) ([013b3c7](https://github.com/shaka-project/shaka-player/commit/013b3c7f222ff74807f4beea7175bef97f595c0b))
* **preload:** Wait for prefetches when preloading ([#7533](https://github.com/shaka-project/shaka-player/issues/7533)) ([2ad1eff](https://github.com/shaka-project/shaka-player/commit/2ad1eff39ef063e026393a0e26ebc48ca3452b06)), closes [#7520](https://github.com/shaka-project/shaka-player/issues/7520)
* Remove streaming.parsePrftBox config ([#7358](https://github.com/shaka-project/shaka-player/issues/7358)) ([fc4893d](https://github.com/shaka-project/shaka-player/commit/fc4893d53818fec2af6f687076a25137160ab284))
* Support Fairplay DRM in DASH manifest. ([#7454](https://github.com/shaka-project/shaka-player/issues/7454)) ([c9f7723](https://github.com/shaka-project/shaka-player/commit/c9f7723d23c0b80eab7669c893bbe1969a818540))
* **UI:** Add close button to statistics panel ([#7482](https://github.com/shaka-project/shaka-player/issues/7482)) ([4e6e37c](https://github.com/shaka-project/shaka-player/commit/4e6e37c0ce7dc446dc19589f15542e00c813e466))
* **UI:** Added Mute button to context menu and overflow menu ([#7439](https://github.com/shaka-project/shaka-player/issues/7439)) ([e883fed](https://github.com/shaka-project/shaka-player/commit/e883fedd694688b8af585530aa0e7b407540ebca))
* **UI:** Allow configure the fullscreen mode in VisionOS ([#7540](https://github.com/shaka-project/shaka-player/issues/7540)) ([3bd0978](https://github.com/shaka-project/shaka-player/commit/3bd0978da07f560ea7049588b1dbc8ecaf38aefe))
* **UI:** Use the lang= attribute to help screen-readers recognize localized labels ([#7267](https://github.com/shaka-project/shaka-player/issues/7267)) ([3590aee](https://github.com/shaka-project/shaka-player/commit/3590aeea3d15e22e2734d888e354534b66c56845))
* Use source tags instead of src attribute ([#7406](https://github.com/shaka-project/shaka-player/issues/7406)) ([445b0ce](https://github.com/shaka-project/shaka-player/commit/445b0ce67f2b501491cc8df2399cdb177208e5e3))


### Bug Fixes

* Active track state on variantchanged and adaptation events ([#7350](https://github.com/shaka-project/shaka-player/issues/7350)) ([c15ca1d](https://github.com/shaka-project/shaka-player/commit/c15ca1dd180576b2512b03c4bcda75aaad2e3abe))
* **Ads:** Allow play interstitials on iOS fullscreen ([#7538](https://github.com/shaka-project/shaka-player/issues/7538)) ([84ae806](https://github.com/shaka-project/shaka-player/commit/84ae80675ade19e6cf542ef90481094b29a29d42))
* **Ads:** Allow play interstitials using single video element when use native HLS ([#7550](https://github.com/shaka-project/shaka-player/issues/7550)) ([fd6c322](https://github.com/shaka-project/shaka-player/commit/fd6c3223203b318f6236e227b31f234c87590a34))
* **Ads:** Allow preload and remove old interstitials when playing a interstitial ([#7465](https://github.com/shaka-project/shaka-player/issues/7465)) ([25e7620](https://github.com/shaka-project/shaka-player/commit/25e7620029dce214b0b3ba7ccfddc369f940fdc1))
* **Ads:** Disable interstitials when using AirPlay ([#7479](https://github.com/shaka-project/shaka-player/issues/7479)) ([2394ec2](https://github.com/shaka-project/shaka-player/commit/2394ec2b49d6a355a77afd529cfbaaacb04beea4))
* **Ads:** Don't load useless segments when using playoutLimit on interstitial ads ([#7469](https://github.com/shaka-project/shaka-player/issues/7469)) ([7d8510b](https://github.com/shaka-project/shaka-player/commit/7d8510b4619388bc9e1d9307202dc7299fda73f0))
* **Ads:** Fix duplicate Ads when playing interstitials through native HLS player ([#7527](https://github.com/shaka-project/shaka-player/issues/7527)) ([075713f](https://github.com/shaka-project/shaka-player/commit/075713f0e012b2287cd7b95a3219e8564cedc259))
* **Ads:** Fix JUMP implementation to avoid loop the same ad group in Interstitials ([#7329](https://github.com/shaka-project/shaka-player/issues/7329)) ([524014e](https://github.com/shaka-project/shaka-player/commit/524014e3bdff68464afffca8e6b4c36a5f9f5492))
* **Ads:** fix pre-roll identification when using src= ([#7493](https://github.com/shaka-project/shaka-player/issues/7493)) ([576e4a5](https://github.com/shaka-project/shaka-player/commit/576e4a5ea840643425e1ba530a1ef0601089149f))
* **Ads:** Limit interstitial duration to actual duration if available ([#7480](https://github.com/shaka-project/shaka-player/issues/7480)) ([ad9f2ac](https://github.com/shaka-project/shaka-player/commit/ad9f2ac039a61853ac3f0decdc55d29ebc19e044))
* **Ads:** Limit interstitial duration to actual duration if available when using src= ([#7488](https://github.com/shaka-project/shaka-player/issues/7488)) ([334a00e](https://github.com/shaka-project/shaka-player/commit/334a00e1b11f7e88ca2d32b2ff469e98a2736583))
* **Ads:** Release interstitials timer correctly ([#7373](https://github.com/shaka-project/shaka-player/issues/7373)) ([53b704f](https://github.com/shaka-project/shaka-player/commit/53b704f688dc5004e99bd50766940bedd02f16d6))
* **AirPlay:** Don't show subtitles on the player when using AirPlay ([#7514](https://github.com/shaka-project/shaka-player/issues/7514)) ([7c6dac5](https://github.com/shaka-project/shaka-player/commit/7c6dac55b628fd9723680492a4ead298a4270ae1))
* **AirPlay:** Prefer Playback Remote API for closeOpenSessions ([#7500](https://github.com/shaka-project/shaka-player/issues/7500)) ([30068a1](https://github.com/shaka-project/shaka-player/commit/30068a1cb522a6c18f47a506bb3276e4a9968f9b))
* **AirPlay:** Show AirPlay button when starting the playback with AirPlay ([#7515](https://github.com/shaka-project/shaka-player/issues/7515)) ([edb9e53](https://github.com/shaka-project/shaka-player/commit/edb9e532bab3184bf089bb462a88dea3608b65cb))
* Allow show subtitles using webkit Fullscreen API when playing native HLS ([#7539](https://github.com/shaka-project/shaka-player/issues/7539)) ([6ab6a8f](https://github.com/shaka-project/shaka-player/commit/6ab6a8f0cfc29d7919ac410e02f336b424df003f))
* Allow streaming again when we reset MSE ([#7495](https://github.com/shaka-project/shaka-player/issues/7495)) ([bc90c87](https://github.com/shaka-project/shaka-player/commit/bc90c87d2ae1ff918de280d85152cb8ba38cf8de))
* Avoid make HEAD request for image mime type ([#7332](https://github.com/shaka-project/shaka-player/issues/7332)) ([6716ff0](https://github.com/shaka-project/shaka-player/commit/6716ff00c411df5b284d0b705c0d7cd6ef2ec76e))
* Avoid notify buffered changes when segment appended is text ([#7353](https://github.com/shaka-project/shaka-player/issues/7353)) ([43314a1](https://github.com/shaka-project/shaka-player/commit/43314a1f1d1fa0c5ee18f7f388f2f76c9ad05e8a))
* calculations of channel count for DASH AudioChannelConfiguration elements. ([#7421](https://github.com/shaka-project/shaka-player/issues/7421)) ([669b7b3](https://github.com/shaka-project/shaka-player/commit/669b7b38297f240ee731bef09d1968c9ba756393))
* **DASH:** Allow mixing SegmentTemplate-SegmentTimeline with SegmentTemplate-numbering ([#7286](https://github.com/shaka-project/shaka-player/issues/7286)) ([e7229fb](https://github.com/shaka-project/shaka-player/commit/e7229fbc18ddd0dbc77548b9576d9256d4c74843))
* **DASH:** Avoid adding originalId when it is not necessary ([#7281](https://github.com/shaka-project/shaka-player/issues/7281)) ([a88be00](https://github.com/shaka-project/shaka-player/commit/a88be006536842641fc1c52298a3368461d0e7e1))
* **DASH:** Clear streamMap when period is removed from the manifest ([#7297](https://github.com/shaka-project/shaka-player/issues/7297)) ([da71e6d](https://github.com/shaka-project/shaka-player/commit/da71e6d644cc4123e6a3f5d134a8d28aad49a6f6))
* **DASH:** Clear usedPeriodIds when period is removed from the manifest ([#7305](https://github.com/shaka-project/shaka-player/issues/7305)) ([f8e3aa4](https://github.com/shaka-project/shaka-player/commit/f8e3aa4b61cd3a1a8282c7bd88ec891c8b896c27))
* **DASH:** Clone closedCaptions map in PeriodCombiner output stream ([#7309](https://github.com/shaka-project/shaka-player/issues/7309)) ([873bb24](https://github.com/shaka-project/shaka-player/commit/873bb2441abb100183dba80113f10fe191eb55d2)), closes [#7303](https://github.com/shaka-project/shaka-player/issues/7303)
* **DASH:** Clone EventStream nodes to reduce memory consumption ([#7285](https://github.com/shaka-project/shaka-player/issues/7285)) ([0023acc](https://github.com/shaka-project/shaka-player/commit/0023accf0f0b099544a4937a7651ab0fd917869e)), closes [#7148](https://github.com/shaka-project/shaka-player/issues/7148)
* **DASH:** Evict (by time) indexes in MetaSegmentIndex ([#7296](https://github.com/shaka-project/shaka-player/issues/7296)) ([69b317f](https://github.com/shaka-project/shaka-player/commit/69b317f32d22452b00c92fedf28056a44f26819a))
* **DASH:** Evict empty indexes in MetaSegmentIndex ([#7272](https://github.com/shaka-project/shaka-player/issues/7272)) ([c9998f9](https://github.com/shaka-project/shaka-player/commit/c9998f92819d08c936d4dd969d3fab3b191eb24e))
* **DASH:** Exclude text segments when calculating max segment size ([#7564](https://github.com/shaka-project/shaka-player/issues/7564)) ([3f9dec2](https://github.com/shaka-project/shaka-player/commit/3f9dec23422b16734250a3a2832cbe6c66862898))
* **DASH:** Fix HTTP redirect during manifest update ([#7339](https://github.com/shaka-project/shaka-player/issues/7339)) ([6532a7c](https://github.com/shaka-project/shaka-player/commit/6532a7c6050583f8bf6c31e39324c9eb857e5fdb))
* **DASH:** Live DASH allows segment overlap in the updated manifest for first new segments ([#7405](https://github.com/shaka-project/shaka-player/issues/7405)) ([051a8c5](https://github.com/shaka-project/shaka-player/commit/051a8c5edda97d396a283159b6e29e541784d7c6))
* **DASH:** Live to vod transition ([#7404](https://github.com/shaka-project/shaka-player/issues/7404)) ([2d14dd5](https://github.com/shaka-project/shaka-player/commit/2d14dd548073f7d05c7b3664a6412104a78dad63))
* **dash:** live to vod transition seek start ([#7347](https://github.com/shaka-project/shaka-player/issues/7347)) ([e02367c](https://github.com/shaka-project/shaka-player/commit/e02367cc1ee1a0a4dd66426341e0be389914d7cb))
* **DASH:** Release period combiner info correctly ([#7364](https://github.com/shaka-project/shaka-player/issues/7364)) ([fe2ea80](https://github.com/shaka-project/shaka-player/commit/fe2ea80ad4c7e9f6a5d297e8df3f72421552d11c))
* **DASH:** Use presentationTimeOffset in EventStream ([#7282](https://github.com/shaka-project/shaka-player/issues/7282)) ([c541b1c](https://github.com/shaka-project/shaka-player/commit/c541b1c9b4eb06d81af8262dfc8bd28141a13b29)), closes [#7277](https://github.com/shaka-project/shaka-player/issues/7277)
* Disable Encryption Scheme Polyfil On Some Devices ([#7355](https://github.com/shaka-project/shaka-player/issues/7355)) ([58f666b](https://github.com/shaka-project/shaka-player/commit/58f666ba7a1bc75baa70ab612e13caf46f70b737))
* Disable smooth codec switch if changeType is unavailable ([#7414](https://github.com/shaka-project/shaka-player/issues/7414)) ([c90d5ff](https://github.com/shaka-project/shaka-player/commit/c90d5ff82a7bd0171b3a8460c97e3283f6d4ff04))
* Do not allow MSE operations when using Remote Playback ([#7503](https://github.com/shaka-project/shaka-player/issues/7503)) ([b04caa3](https://github.com/shaka-project/shaka-player/commit/b04caa3b7461b82ba96c80ba2d349e193bd9e888))
* Do not recognize Sky Q as Apple device ([#7357](https://github.com/shaka-project/shaka-player/issues/7357)) ([e5fadab](https://github.com/shaka-project/shaka-player/commit/e5fadabca28de26c585b6f92703431c3c3515736))
* Do not reuse the same tsParser for different contentType ([#7563](https://github.com/shaka-project/shaka-player/issues/7563)) ([a020b19](https://github.com/shaka-project/shaka-player/commit/a020b1982b4844ba6d8bc94d25fcbd449548b0dd))
* Do not seek to first subtitle ([#7312](https://github.com/shaka-project/shaka-player/issues/7312)) ([0980ba3](https://github.com/shaka-project/shaka-player/commit/0980ba3e096d7e5a12bd5cbd93e9caa4fc65c9cb)), closes [#7310](https://github.com/shaka-project/shaka-player/issues/7310)
* **docs:** Add mising description of PRFT event ([#7403](https://github.com/shaka-project/shaka-player/issues/7403)) ([072f46c](https://github.com/shaka-project/shaka-player/commit/072f46c702a8557d1aba529ce7072c2f8b294614))
* Don't use info from MSE mode when using Remote Playback ([#7504](https://github.com/shaka-project/shaka-player/issues/7504)) ([e14a8eb](https://github.com/shaka-project/shaka-player/commit/e14a8eb6f76681cfbe8525b55deef0f9b0f49cb2))
* **DRM:** Fix persistent licenses not working for online playback ([#7457](https://github.com/shaka-project/shaka-player/issues/7457)) ([6088c1d](https://github.com/shaka-project/shaka-player/commit/6088c1db1af84d9f904bbfed8d745b67908e3a22))
* Evict buffer on QUOTA_EXCEEDED_ERROR error ([#7361](https://github.com/shaka-project/shaka-player/issues/7361)) ([0048e9d](https://github.com/shaka-project/shaka-player/commit/0048e9df1e57becb1c55aee2373dd518552cdfd3))
* Evict text buffer when unload the text stream ([#7360](https://github.com/shaka-project/shaka-player/issues/7360)) ([5b6652f](https://github.com/shaka-project/shaka-player/commit/5b6652f6f5cef0fba78850d19eb5c40265642e5e))
* Exclude TIMEOUT errors when disabling streams ([#7369](https://github.com/shaka-project/shaka-player/issues/7369)) ([67826ac](https://github.com/shaka-project/shaka-player/commit/67826acbe72bcfd74bf66db5d27434e6d287e0de)), closes [#7368](https://github.com/shaka-project/shaka-player/issues/7368)
* Export getFetchedPlaybackInfo ([#7418](https://github.com/shaka-project/shaka-player/issues/7418)) ([ce38dd9](https://github.com/shaka-project/shaka-player/commit/ce38dd980ee929272ceb0ffa0948eebb41c9626d)), closes [#7416](https://github.com/shaka-project/shaka-player/issues/7416)
* Fire PRFT event every time ([#7408](https://github.com/shaka-project/shaka-player/issues/7408)) ([e7f7825](https://github.com/shaka-project/shaka-player/commit/e7f78258ee843f8251beea469e3bf4c9ad83f7c8))
* Fix disable stream when no manifest ([#7497](https://github.com/shaka-project/shaka-player/issues/7497)) ([5e1fc5a](https://github.com/shaka-project/shaka-player/commit/5e1fc5a297bfbb515c2c7cce9761451e3c7a2ffd))
* Fix external image track mime type ([#7333](https://github.com/shaka-project/shaka-player/issues/7333)) ([3a146c2](https://github.com/shaka-project/shaka-player/commit/3a146c2ee6b151e21dcbd6d750d7ea1e405b8590))
* Fix metadata timing when using TS ([#7478](https://github.com/shaka-project/shaka-player/issues/7478)) ([2b56dcd](https://github.com/shaka-project/shaka-player/commit/2b56dcdc0886f715907a1f4b5c5288e3f9214fa1))
* Fix rendering of image subs when using SimpleTextDisplayer ([#7258](https://github.com/shaka-project/shaka-player/issues/7258)) ([3d0b817](https://github.com/shaka-project/shaka-player/commit/3d0b817588bc7925c4153740490b8d9ed4a1e345))
* Fix reset MSE to last independent segment ([#7494](https://github.com/shaka-project/shaka-player/issues/7494)) ([8c62370](https://github.com/shaka-project/shaka-player/commit/8c62370ec5ba2c4fac43f0b9eb7f84562d298505))
* Fix select HLG tracks when using AUTO hdr level ([#7470](https://github.com/shaka-project/shaka-player/issues/7470)) ([322ea6b](https://github.com/shaka-project/shaka-player/commit/322ea6b61674c38ec0e36c68afd9fcecf1ee00f3))
* Fix support of getAllThumbnails when using shaka.dash.TimelineSegmentIndex ([#7508](https://github.com/shaka-project/shaka-player/issues/7508)) ([0ff61a5](https://github.com/shaka-project/shaka-player/commit/0ff61a52b71a5a79a7faa38e7c3b8f4a0a5901ea))
* Fix Windows detection ([#7476](https://github.com/shaka-project/shaka-player/issues/7476)) ([fac9d84](https://github.com/shaka-project/shaka-player/commit/fac9d8472db7c0a579043b8d5cc84f7abc3628a8))
* **HLS:** Allow sync live streams without PROGRAM-DATE-TIME ([#7340](https://github.com/shaka-project/shaka-player/issues/7340)) ([db27227](https://github.com/shaka-project/shaka-player/commit/db27227c7326b7e66f5390170ac92f15f5b77aec))
* **HLS:** Avoid disabling muxed audio streams ([#7351](https://github.com/shaka-project/shaka-player/issues/7351)) ([53cea44](https://github.com/shaka-project/shaka-player/commit/53cea44791e39fe02ac5c5ebcfb87a2ee19a853f))
* **HLS:** Fix uncaught error in slow network scenario ([#7321](https://github.com/shaka-project/shaka-player/issues/7321)) ([68e579b](https://github.com/shaka-project/shaka-player/commit/68e579b6b0ba63a59af777193f07b06a1bca644e))
* **HLS:** Ignore DATERANGE with errors instead of fire an error ([#7499](https://github.com/shaka-project/shaka-player/issues/7499)) ([b2b4238](https://github.com/shaka-project/shaka-player/commit/b2b423890c91957fa8b3302081e5b1079b8f6e54))
* Install polyfills for Comcast X1 devices ([#7529](https://github.com/shaka-project/shaka-player/issues/7529)) ([2b2df4b](https://github.com/shaka-project/shaka-player/commit/2b2df4b2e24bc04709b44251e80df0890114a286))
* **MSS:** Don't allow prefetch segments with self-generated data ([#7485](https://github.com/shaka-project/shaka-player/issues/7485)) ([d502e9b](https://github.com/shaka-project/shaka-player/commit/d502e9b6896b6168fcb05b6aec3604e5ee22ae01))
* **MSS:** Fix playback of some MSS streams ([#7517](https://github.com/shaka-project/shaka-player/issues/7517)) ([6d0ee51](https://github.com/shaka-project/shaka-player/commit/6d0ee517a552a7087cfeb2d65481ab0b450c945e))
* **MSS:** Fix timeline repetitions ([#7484](https://github.com/shaka-project/shaka-player/issues/7484)) ([b1d3a3a](https://github.com/shaka-project/shaka-player/commit/b1d3a3ac8700305c52e5a723927f719879896cd7))
* **offline:** Text segments are downloaded before audio&video ([#7336](https://github.com/shaka-project/shaka-player/issues/7336)) ([e28a07e](https://github.com/shaka-project/shaka-player/commit/e28a07eaae61fbb0fd1f88cb9d00944f4da8777e))
* only use lastSegmentReference for knowing if variant changed ([#7537](https://github.com/shaka-project/shaka-player/issues/7537)) ([abfc0b2](https://github.com/shaka-project/shaka-player/commit/abfc0b2ac2e0bce206cfda26cbdd9fd36a60a2ec))
* **preload:** Resolve manifest promise sooner ([#7380](https://github.com/shaka-project/shaka-player/issues/7380)) ([c548315](https://github.com/shaka-project/shaka-player/commit/c54831500d47b509e777145e0ff55565533cc72e))
* **preload:** Set manifest before initializing DRM ([#7359](https://github.com/shaka-project/shaka-player/issues/7359)) ([b9ba66f](https://github.com/shaka-project/shaka-player/commit/b9ba66f211cc2c8ec372f441d0690c81406b65b9))
* **PS4/5:** Disable smooth codec switch on PS4/5 ([#7413](https://github.com/shaka-project/shaka-player/issues/7413)) ([7268a2b](https://github.com/shaka-project/shaka-player/commit/7268a2b64dfe74c9171316e49472b0ad399bc46e))
* Reduce calls to EME by ignoring MIME type in MediaKeySystemAccess cache ([#7374](https://github.com/shaka-project/shaka-player/issues/7374)) ([6a4e95b](https://github.com/shaka-project/shaka-player/commit/6a4e95bfaeddc6794ba043956d2c8a7b66e3f276)), closes [#7325](https://github.com/shaka-project/shaka-player/issues/7325)
* Reset MSE when we disconnect from Remote Playback ([#7506](https://github.com/shaka-project/shaka-player/issues/7506)) ([cf22042](https://github.com/shaka-project/shaka-player/commit/cf2204200e8ffec7ec27e3e0fe4bcfa78b5c33b7))
* Seek delay for Cast Nest hub ([#7423](https://github.com/shaka-project/shaka-player/issues/7423)) ([d454514](https://github.com/shaka-project/shaka-player/commit/d454514a1fadd965cd4b411f2a9f5c643de502f0))
* **Tizen:** Adding gapPadding to gap manager to solve Tizen issue ([#7331](https://github.com/shaka-project/shaka-player/issues/7331)) ([330e487](https://github.com/shaka-project/shaka-player/commit/330e4876f29c53bcdfc0e25f730d24502611780d))
* **TTML:** Fix absence of conversion of alpha (transparency) from 0-255 -&gt; 0-1 ([#7280](https://github.com/shaka-project/shaka-player/issues/7280)) ([fdf68d1](https://github.com/shaka-project/shaka-player/commit/fdf68d1994d5c0b561d2d5e68db1e9860f7eba0e)), closes [#7279](https://github.com/shaka-project/shaka-player/issues/7279)
* **TTML:** Fix subtitles not rendered due to complaint about xml:id ([#7270](https://github.com/shaka-project/shaka-player/issues/7270)) ([257de7f](https://github.com/shaka-project/shaka-player/commit/257de7fed392d84a5e19f997b78b1d539d07b6e8))
* **UI:** Disable fullscreen button conditionally when playing ads ([#7534](https://github.com/shaka-project/shaka-player/issues/7534)) ([1497148](https://github.com/shaka-project/shaka-player/commit/1497148eee1f2b32fa81b82a9e6455ba18dc82bf))
* **UI:** Disable save frame when using remote playback ([#7433](https://github.com/shaka-project/shaka-player/issues/7433)) ([263c6a6](https://github.com/shaka-project/shaka-player/commit/263c6a6a0f5df7fc2399c804e8e54f06b0f04bc7))
* **UI:** Display the font-family correctly in some cases ([#7266](https://github.com/shaka-project/shaka-player/issues/7266)) ([96f8914](https://github.com/shaka-project/shaka-player/commit/96f8914116ef4af69e333f1ad22ca167cd44e591))
* **UI:** Don't enable StatisticsButton when create overflow menu ([#7481](https://github.com/shaka-project/shaka-player/issues/7481)) ([ba36958](https://github.com/shaka-project/shaka-player/commit/ba369584bdd74e6c717f4e956c6e53b0422f190b))
* **UI:** Don't try to add MediaSessionHandler for PiP when it's not available ([#7376](https://github.com/shaka-project/shaka-player/issues/7376)) ([e71dca2](https://github.com/shaka-project/shaka-player/commit/e71dca214613b18379b8bc5c0b85fcec075ac301))
* **UI:** Fix "Live" label in some languages ([#7560](https://github.com/shaka-project/shaka-player/issues/7560)) ([8dae6e4](https://github.com/shaka-project/shaka-player/commit/8dae6e4e4058c82bd06835856d151f4c69893024))
* **UI:** Fix auto-load with source tags ([#7430](https://github.com/shaka-project/shaka-player/issues/7430)) ([0f2ee89](https://github.com/shaka-project/shaka-player/commit/0f2ee89df96baecbd3f0b62e59e8860993bd2461))
* **UI:** Fix mediaSession metadata update on Firefox ([#7375](https://github.com/shaka-project/shaka-player/issues/7375)) ([6884721](https://github.com/shaka-project/shaka-player/commit/6884721b0e45304b19da6eb900680e6468120e03))
* **UI:** Fix missing tracks in resolution selector ([#7352](https://github.com/shaka-project/shaka-player/issues/7352)) ([1314377](https://github.com/shaka-project/shaka-player/commit/131437734cad6c97b686a850c1b6dca33f0e7050))
* **UI:** Fix name for Dolby Digital Plus ([#7541](https://github.com/shaka-project/shaka-player/issues/7541)) ([a01b5fd](https://github.com/shaka-project/shaka-player/commit/a01b5fd449f5494beaba9c4b62efb5749be306c6))
* **UI:** Fix remote button availability and icon ([#7513](https://github.com/shaka-project/shaka-player/issues/7513)) ([c8bcfdb](https://github.com/shaka-project/shaka-player/commit/c8bcfdb7e9722bb73517e70fc9188eb675699b98))
* **UI:** Fix set MediaSession info when no previous Metadata ([#7521](https://github.com/shaka-project/shaka-player/issues/7521)) ([b00a2c3](https://github.com/shaka-project/shaka-player/commit/b00a2c3f3e286a0eca3ebc96bdc87dd836974410))
* **UI:** Fix the position of save video frame in the overflow menu ([#7438](https://github.com/shaka-project/shaka-player/issues/7438)) ([85282ce](https://github.com/shaka-project/shaka-player/commit/85282ceb4897f5bbb30ff6ef2959db9d5a4c6d36))
* **UI:** Hidden cursor correctly ([#7464](https://github.com/shaka-project/shaka-player/issues/7464)) ([3338579](https://github.com/shaka-project/shaka-player/commit/333857923e3ce1289ae19d4a6d01f31d8be95980))
* **UI:** Hidden cursor correctly when no touch screen ([#7458](https://github.com/shaka-project/shaka-player/issues/7458)) ([6e62cfa](https://github.com/shaka-project/shaka-player/commit/6e62cfa004f152e523c73904d79333a3b63a2a40))
* **UI:** Remove buffering spinner when playing a client side ad ([#7507](https://github.com/shaka-project/shaka-player/issues/7507)) ([b980f67](https://github.com/shaka-project/shaka-player/commit/b980f6785c9492a78c3615c1bc36a99d7ee0a952))
* **UI:** Remove spinner and client side ad container elements when calling destroy ([#7320](https://github.com/shaka-project/shaka-player/issues/7320)) ([3d51cb3](https://github.com/shaka-project/shaka-player/commit/3d51cb3c42d075d3b265990eb30f2d9c9fb9e5c8))
* **UI:** Restore missing AirPlay button ([#7389](https://github.com/shaka-project/shaka-player/issues/7389)) ([96da45a](https://github.com/shaka-project/shaka-player/commit/96da45a1823bd01cd79cc012b821c415fadf197a))
* **WebVTT:** Fix display italic subtitles with end align ([#7559](https://github.com/shaka-project/shaka-player/issues/7559)) ([781a27d](https://github.com/shaka-project/shaka-player/commit/781a27df8083ad5c6dc9c5c05a125befea71eff7))
* **WebVTT:** Fix mapNativeCueToShakaCue in Chromium browsers ([#7273](https://github.com/shaka-project/shaka-player/issues/7273)) ([76376e9](https://github.com/shaka-project/shaka-player/commit/76376e97f181bae042e23ff2c6e1e0df8b9185d7))


### Performance Improvements

* **Ads:** Reduce latency for interstitial to start playing ([#7525](https://github.com/shaka-project/shaka-player/issues/7525)) ([5ee6a4d](https://github.com/shaka-project/shaka-player/commit/5ee6a4d2f54141af4f71e38d5e0d14a3949c6ebc))
* **Ads:** Reduce latency for interstitial to start playing ([#7528](https://github.com/shaka-project/shaka-player/issues/7528)) ([6303924](https://github.com/shaka-project/shaka-player/commit/6303924dca9a071f4c610da4111773f21cac8e28))
* **DASH:** Create segment indexes only on new periods ([#7294](https://github.com/shaka-project/shaka-player/issues/7294)) ([173a814](https://github.com/shaka-project/shaka-player/commit/173a814e5baf2927ecacd3f340cdb1d4d02b242c))
* **DASH:** Delete old matchedStreams ([#7301](https://github.com/shaka-project/shaka-player/issues/7301)) ([d559366](https://github.com/shaka-project/shaka-player/commit/d5593661682c130fb8f9be1fb4cd4756b8653925))
* **DASH:** Delete old matchedStreams when using trickmodeVideo ([#7306](https://github.com/shaka-project/shaka-player/issues/7306)) ([4ab3dea](https://github.com/shaka-project/shaka-player/commit/4ab3dea8c1c089840c2b00b7759ca5af1ce448b0))
* Improve performance when parsing EMSG ([#7557](https://github.com/shaka-project/shaka-player/issues/7557)) ([cb66f47](https://github.com/shaka-project/shaka-player/commit/cb66f471a2c4fe1bf3341b6f8af36729f2cbbac7))
* Only use tXml parent when necessary ([#7304](https://github.com/shaka-project/shaka-player/issues/7304)) ([7ceffc0](https://github.com/shaka-project/shaka-player/commit/7ceffc0db7670b8c6afec9e1d271d86764425b1a))

## [4.11.0](https://github.com/shaka-project/shaka-player/compare/v4.10.0...v4.11.0) (2024-09-04)


### Features

* **ABR:** Add preferNetworkInformationBandwidth config ([#7090](https://github.com/shaka-project/shaka-player/issues/7090)) ([6425b91](https://github.com/shaka-project/shaka-player/commit/6425b91320b3c8cc1ff858aa2f0b4052a3690f6c))
* Add getFetchedPlaybackInfo method ([#7074](https://github.com/shaka-project/shaka-player/issues/7074)) ([ef02763](https://github.com/shaka-project/shaka-player/commit/ef02763b52a6b58f84176ee1283fcb8fecb6ab54))
* Add public method for parsing cue payload ([#6992](https://github.com/shaka-project/shaka-player/issues/6992)) ([eeadace](https://github.com/shaka-project/shaka-player/commit/eeadace2beb03d57af35de2130e396e7d4356a7d))
* Add video codec preference array at same resolution and bitrate ([#7204](https://github.com/shaka-project/shaka-player/issues/7204)) ([28523a3](https://github.com/shaka-project/shaka-player/commit/28523a356401d742496ec1e153d49ea4e6d61ddf))
* Add width/height to getFetchedPlaybackInfo ([#7107](https://github.com/shaka-project/shaka-player/issues/7107)) ([e58ac70](https://github.com/shaka-project/shaka-player/commit/e58ac70e00c7c0b6467d65f22d9155c7911f4f3f)), closes [#6725](https://github.com/shaka-project/shaka-player/issues/6725)
* **Ads:** Add basic VAST support without IMA ([#7052](https://github.com/shaka-project/shaka-player/issues/7052)) ([c59922b](https://github.com/shaka-project/shaka-player/commit/c59922bae593b780dac2a0cdcba41691567b66a7))
* **Ads:** Add basic VMAP support without IMA ([#7054](https://github.com/shaka-project/shaka-player/issues/7054)) ([a6f3999](https://github.com/shaka-project/shaka-player/commit/a6f39995c4b20db2e62ab74d83b8fda18e7a59e3))
* **Ads:** Added advanced type to ad requests ([#7196](https://github.com/shaka-project/shaka-player/issues/7196)) ([f5b78dc](https://github.com/shaka-project/shaka-player/commit/f5b78dc88ab15fbc23a1133578d6db9597a76c55))
* **Ads:** Allow the use of custom interstitials ads ([#6991](https://github.com/shaka-project/shaka-player/issues/6991)) ([9e1f4e7](https://github.com/shaka-project/shaka-player/commit/9e1f4e7b8c5240f0c189fe2a344360da5859ec0e))
* Allow set the videoContainer in the Player constructor ([#6953](https://github.com/shaka-project/shaka-player/issues/6953)) ([a35028c](https://github.com/shaka-project/shaka-player/commit/a35028c3bc3179bf17f5e893bac10dfff6809890))
* **CEA:** Support alignment in CEA-608 ([#7022](https://github.com/shaka-project/shaka-player/issues/7022)) ([11a2cc5](https://github.com/shaka-project/shaka-player/commit/11a2cc5db240d6bd3803d37cddf7e3d6e0724ee2))
* **CMCD:** Implement new streaming format from CMCDv2 ([#7216](https://github.com/shaka-project/shaka-player/issues/7216)) ([8842648](https://github.com/shaka-project/shaka-player/commit/88426487a7efab97156c9b1d7f41b5ce1fb7b633))
* **DASH:** Add DVB Font downloads ([#6971](https://github.com/shaka-project/shaka-player/issues/6971)) ([789101c](https://github.com/shaka-project/shaka-player/commit/789101cbbae63a85a49838ef0df85141df6e8f2a))
* **DASH:** Add support for urn:mpeg:dash:ssr:2023 with SegmentTemplate $Number$ ([#6745](https://github.com/shaka-project/shaka-player/issues/6745)) ([3cb40bf](https://github.com/shaka-project/shaka-player/commit/3cb40bf516d3533dbcacaef3631c41f423eda7be))
* **DASH:** MPD Alternate support ([#7055](https://github.com/shaka-project/shaka-player/issues/7055)) ([93f2d96](https://github.com/shaka-project/shaka-player/commit/93f2d96a4527ea35a62b749752bbca2e2d6c289c))
* **DASH:** Support Annex I: Flexible Insertion of URL Parameters ([#7086](https://github.com/shaka-project/shaka-player/issues/7086)) ([a5adb39](https://github.com/shaka-project/shaka-player/commit/a5adb397139cd2f55cb238725aa18cb3891ef742))
* **DASH:** Support DVB fonts with relative urls ([#6974](https://github.com/shaka-project/shaka-player/issues/6974)) ([5849e25](https://github.com/shaka-project/shaka-player/commit/5849e2579d32cd0ab76bb5215f22372ce15d2416))
* **DASH:** Support trick-mode per resolution ([#7224](https://github.com/shaka-project/shaka-player/issues/7224)) ([cb5aae4](https://github.com/shaka-project/shaka-player/commit/cb5aae47c036a58c12aadb46954a52680e713a82))
* Dispatch MediaSourceRecovered event ([#7198](https://github.com/shaka-project/shaka-player/issues/7198)) ([fd5b09c](https://github.com/shaka-project/shaka-player/commit/fd5b09c1bf425a280bb61262140b53da124aa32a))
* Export addFont method ([#6975](https://github.com/shaka-project/shaka-player/issues/6975)) ([afc3e59](https://github.com/shaka-project/shaka-player/commit/afc3e59c61978b3a2fec19cbe8d52f895e462a28))
* **HLS:** Add I-Frame playlist support ([#7230](https://github.com/shaka-project/shaka-player/issues/7230)) ([67859c9](https://github.com/shaka-project/shaka-player/commit/67859c987c90ebdd3982e00b7f1df718b0ea6898))
* **HLS:** Add support for EXT-X-START ([#6938](https://github.com/shaka-project/shaka-player/issues/6938)) ([d63df14](https://github.com/shaka-project/shaka-player/commit/d63df145aacbf09f9a4c99c54e22a09c10432d9e))
* **HLS:** Deprecate useSafariBehaviorForLive config ([#6978](https://github.com/shaka-project/shaka-player/issues/6978)) ([aaeafa4](https://github.com/shaka-project/shaka-player/commit/aaeafa451c98c0afc6bb5c7bdc7a54319b7402c5))
* **net:** Add minimum bytes for progress events ([#7117](https://github.com/shaka-project/shaka-player/issues/7117)) ([d36ff65](https://github.com/shaka-project/shaka-player/commit/d36ff6553c174682d8d12b91a54669b6439ed768))
* Parse TS frameRate ([#6998](https://github.com/shaka-project/shaka-player/issues/6998)) ([f4f9b05](https://github.com/shaka-project/shaka-player/commit/f4f9b05e63b55385a6f6e0b53f4d5f52e37fcb3c))
* **preload:** Add isPreload to net filter context ([#7170](https://github.com/shaka-project/shaka-player/issues/7170)) ([5723a2b](https://github.com/shaka-project/shaka-player/commit/5723a2bbe46e0030e0e6a454afb7c5341544171f))
* Render native cues using text displayer ([#6985](https://github.com/shaka-project/shaka-player/issues/6985)) ([6c0c63d](https://github.com/shaka-project/shaka-player/commit/6c0c63d38ca8a41a734559aa62d88af18e6d5b9c))
* Store bandwidth info inside references. ([#6825](https://github.com/shaka-project/shaka-player/issues/6825)) ([b4e04b6](https://github.com/shaka-project/shaka-player/commit/b4e04b6616bccc2e04a05416dc41538da5a32e54))
* **TTML:** Add support for IMSC1 (CMAF) image subtitle ([#6968](https://github.com/shaka-project/shaka-player/issues/6968)) ([3b62296](https://github.com/shaka-project/shaka-player/commit/3b6229616e7fab5aab412acf7a16511c4f926c9f))
* **UI:** Add chapter button ([#7018](https://github.com/shaka-project/shaka-player/issues/7018)) ([87bf738](https://github.com/shaka-project/shaka-player/commit/87bf738ece4081e4ed4ea2fa52467e6d09cb542d))
* **UI:** Add MediaSession management ([#7188](https://github.com/shaka-project/shaka-player/issues/7188)) ([3026ba5](https://github.com/shaka-project/shaka-player/commit/3026ba518b21017bbb8b99d5d69f5c73f7b7f927))


### Bug Fixes

* **ABR:** Do not adapt between spatial & non spatial audio ([#7067](https://github.com/shaka-project/shaka-player/issues/7067)) ([1dc5c87](https://github.com/shaka-project/shaka-player/commit/1dc5c8719cc5308c552b5a05ccd6e517f143edc0))
* **ABR:** Fix restrictToElementSize running while abr disabled ([#7153](https://github.com/shaka-project/shaka-player/issues/7153)) ([aea85b0](https://github.com/shaka-project/shaka-player/commit/aea85b04b6f603bd2c4550b31d8b48a14ff0ffab))
* **ABR:** Not change to another quality without respecting a min time ([#6979](https://github.com/shaka-project/shaka-player/issues/6979)) ([a5095a8](https://github.com/shaka-project/shaka-player/commit/a5095a80d34ecf04b3f919d780d956be00369e0a))
* Add more info in getVariantTracks for muxed streams ([#7181](https://github.com/shaka-project/shaka-player/issues/7181)) ([d63c44a](https://github.com/shaka-project/shaka-player/commit/d63c44afba8e217238d2e4eb25b27778f4fd3cb1))
* Add null check for current reference ([#7184](https://github.com/shaka-project/shaka-player/issues/7184)) ([f5aceed](https://github.com/shaka-project/shaka-player/commit/f5aceeddb3824487dfc4355158bfcfd5cee7a378))
* Adjust timing of mediaqualitychanged event when safe margin is set ([#7114](https://github.com/shaka-project/shaka-player/issues/7114)) ([f6ac236](https://github.com/shaka-project/shaka-player/commit/f6ac236f99f840a2ab5f82fc3138f490ee72a6d3))
* **Ads:** Detect correctly interstitial preroll when using native HLS playback in Safari ([#7093](https://github.com/shaka-project/shaka-player/issues/7093)) ([9912798](https://github.com/shaka-project/shaka-player/commit/9912798137a05af9c2a1d67a85d911b3ec472607))
* **Ads:** Don't show duplicate SKIP UI in IMA CS ([#7084](https://github.com/shaka-project/shaka-player/issues/7084)) ([9337143](https://github.com/shaka-project/shaka-player/commit/9337143856058c7f3773268556b875c4afa5e309))
* **Ads:** Fix back to live for native HLS when interstitial endTime is Infinity ([#7095](https://github.com/shaka-project/shaka-player/issues/7095)) ([18aea54](https://github.com/shaka-project/shaka-player/commit/18aea54f6e4a1013bc8fe4075f11b4662aa705c8))
* **Ads:** Fix mangled properties when using X-ASSET-LIST ([#7002](https://github.com/shaka-project/shaka-player/issues/7002)) ([ade19cb](https://github.com/shaka-project/shaka-player/commit/ade19cb2601a954c372dbc111a5088b54fbb3b87))
* **Ads:** Fix playback of preroll interstitial when the currentTime is 0 ([#7092](https://github.com/shaka-project/shaka-player/issues/7092)) ([0cdeb65](https://github.com/shaka-project/shaka-player/commit/0cdeb65799c262203ef5e94e273da1e3575cb1e1))
* **Ads:** Fix timelineRange detection in HLS interstitials ([#7091](https://github.com/shaka-project/shaka-player/issues/7091)) ([d79f8e2](https://github.com/shaka-project/shaka-player/commit/d79f8e2ce387b91ef79bb9a99a620b5310e17bdd))
* **Ads:** Only allow play the preroll once ([#7096](https://github.com/shaka-project/shaka-player/issues/7096)) ([0248268](https://github.com/shaka-project/shaka-player/commit/024826811d0ac5aff853df5123389a50759cf16a))
* Allow dispatch metadata event with cueTime equal to 0 ([#7098](https://github.com/shaka-project/shaka-player/issues/7098)) ([dcdecf9](https://github.com/shaka-project/shaka-player/commit/dcdecf9de0447b336e361b557364e7c7a60c0dd1))
* Allow recover normal stream when trick play stream fails ([#7234](https://github.com/shaka-project/shaka-player/issues/7234)) ([2638ada](https://github.com/shaka-project/shaka-player/commit/2638ada153ef477bbe5414c9050701a56ec91cda))
* Allow reference mimeType change in StreamingEngine ([#7061](https://github.com/shaka-project/shaka-player/issues/7061)) ([bf6632e](https://github.com/shaka-project/shaka-player/commit/bf6632e325e4690d4242c33236f7f5a984e1c83e))
* Apply playRange config to src= ([#7168](https://github.com/shaka-project/shaka-player/issues/7168)) ([7cf332e](https://github.com/shaka-project/shaka-player/commit/7cf332e3a9ed1cbf14d22e720d07922e70df542d))
* Avoid clear buffer when select the same audio track ([#6959](https://github.com/shaka-project/shaka-player/issues/6959)) ([b953a75](https://github.com/shaka-project/shaka-player/commit/b953a75474f52f79d3f6ade0a2a18cb30e56cd9e))
* Avoid reset iterator when seek into the buffer ([#7004](https://github.com/shaka-project/shaka-player/issues/7004)) ([dc34ec4](https://github.com/shaka-project/shaka-player/commit/dc34ec484a241c420eb6216a1151ffc7ed3c4817))
* **CEA:** Always init CEA parser with new init segment ([#7102](https://github.com/shaka-project/shaka-player/issues/7102)) ([61e570e](https://github.com/shaka-project/shaka-player/commit/61e570efa4056a913c523ef7a66511314e353eb1))
* **CEA:** Offset text CEA-608 that are out of viewport ([#7024](https://github.com/shaka-project/shaka-player/issues/7024)) ([230f6e0](https://github.com/shaka-project/shaka-player/commit/230f6e0095e74ea1f88a43c0da099d20d6ddfd41))
* Compare normalized codecs in codec switching checks ([#7143](https://github.com/shaka-project/shaka-player/issues/7143)) ([01545f4](https://github.com/shaka-project/shaka-player/commit/01545f4c3eb540d6cc32c11a91874d53ddf92386))
* Correct the behavior to defer closeSegmentIndex() calls during updates ([#7217](https://github.com/shaka-project/shaka-player/issues/7217)) ([7ba7e61](https://github.com/shaka-project/shaka-player/commit/7ba7e618d0991e0c31b9c126919c411aa35c2a97))
* **DASH:** Allow play all time fastSwitching tracks ([#7180](https://github.com/shaka-project/shaka-player/issues/7180)) ([4abfc5a](https://github.com/shaka-project/shaka-player/commit/4abfc5ac82927afa16ffdde270dd73ff42281f82))
* **DASH:** Clear streamMap when period is removed from the manifest ([#7202](https://github.com/shaka-project/shaka-player/issues/7202)) ([c5df88b](https://github.com/shaka-project/shaka-player/commit/c5df88b49542f324154adf0a5655a66d1da32d9a))
* **DASH:** Fix allPartialSegments signal when using L3D ([#7179](https://github.com/shaka-project/shaka-player/issues/7179)) ([a1d3927](https://github.com/shaka-project/shaka-player/commit/a1d392764067cef57906cc007c7c7f46117da472))
* **DASH:** Fix codec/mimeType for single text file ([#7075](https://github.com/shaka-project/shaka-player/issues/7075)) ([4728d08](https://github.com/shaka-project/shaka-player/commit/4728d082d7249970884a0457dec02a441936332f))
* **DASH:** Fix creation of multiperiod trickmode streams ([#7229](https://github.com/shaka-project/shaka-player/issues/7229)) ([ebab340](https://github.com/shaka-project/shaka-player/commit/ebab340d9aae7fddc1193f8598271ddedcd7f1c7))
* **DASH:** Fix EventStream Elements creation ([#7194](https://github.com/shaka-project/shaka-player/issues/7194)) ([bd06fe7](https://github.com/shaka-project/shaka-player/commit/bd06fe7a3d405b3705596b7a6fbf9e1334d6410c))
* **DASH:** Fix MPD Patch when SegmentTemplate is shared between Representations ([#7218](https://github.com/shaka-project/shaka-player/issues/7218)) ([b2502fd](https://github.com/shaka-project/shaka-player/commit/b2502fd0a0093dc9acddb8b18c7e87ef061098c6)), closes [#7214](https://github.com/shaka-project/shaka-player/issues/7214)
* **DASH:** Fix period combining when roles are equal ([#7065](https://github.com/shaka-project/shaka-player/issues/7065)) ([38c691b](https://github.com/shaka-project/shaka-player/commit/38c691beb51fc0bceafee3fbb72248598ca98376))
* **DASH:** Fix transitions from 'dynamic' to 'static' ([#7029](https://github.com/shaka-project/shaka-player/issues/7029)) ([3ba94b8](https://github.com/shaka-project/shaka-player/commit/3ba94b82ea43dcca71e129be0c24b1ee792f66d6))
* **DASH:** Improve memory usage with live streams ([#7039](https://github.com/shaka-project/shaka-player/issues/7039)) ([d1435c7](https://github.com/shaka-project/shaka-player/commit/d1435c74591859b16bf5063433b386d364d8331e))
* **DASH:** Patch manifest Adaptationset indexing, [@n](https://github.com/n)=&lt;Numbering&gt; and [@t](https://github.com/t)=<time> ([#7131](https://github.com/shaka-project/shaka-player/issues/7131)) ([0f2cea4](https://github.com/shaka-project/shaka-player/commit/0f2cea42eede4f8f4823fe9f6c9e25dfdecb45d3))
* **DASH:** Prioritize highest bandwidth in PeriodCombiner ([#7045](https://github.com/shaka-project/shaka-player/issues/7045)) ([29ed0a8](https://github.com/shaka-project/shaka-player/commit/29ed0a84f2bad98d59e34ad76436947ff4c90a32))
* **DASH:** Use proper namespace when mapping TXml node to Element ([#7240](https://github.com/shaka-project/shaka-player/issues/7240)) ([cd2fc71](https://github.com/shaka-project/shaka-player/commit/cd2fc715dc3586b80af1b8efa6664c31cce7e02d))
* Defer `closeSegmentIndex()` for old streams during ABR switches when segment fetches are ongoing ([#7157](https://github.com/shaka-project/shaka-player/issues/7157)) ([4cff18d](https://github.com/shaka-project/shaka-player/commit/4cff18dd3c0ac4f20662deb4e2e21b14d977306a))
* Destroy correctly unused transmuxer ([#7059](https://github.com/shaka-project/shaka-player/issues/7059)) ([f161a1c](https://github.com/shaka-project/shaka-player/commit/f161a1cd8f4d044a49b29d91f2819621c30d2dfd))
* Disable CC with disableText config ([#7078](https://github.com/shaka-project/shaka-player/issues/7078)) ([f9040ce](https://github.com/shaka-project/shaka-player/commit/f9040ce2fbd78ff9ad9780ae0f50321a9efd1c6c))
* Disable seek retry cooldown on most platforms ([#7010](https://github.com/shaka-project/shaka-player/issues/7010)) ([dcc60f9](https://github.com/shaka-project/shaka-player/commit/dcc60f9ea99689b855120a75aad52315e33cd71c))
* Do not minify CodecSwitchingStrategy enum keys ([#7200](https://github.com/shaka-project/shaka-player/issues/7200)) ([f718139](https://github.com/shaka-project/shaka-player/commit/f718139810fae603fbe7e3700fc80866efa202c2))
* Don't throw an error when trying to disable a trick mode stream ([#7235](https://github.com/shaka-project/shaka-player/issues/7235)) ([92f70ee](https://github.com/shaka-project/shaka-player/commit/92f70eeb081e5be1058dfd6e39029403ec6d544d))
* Dont use inaccurateManifestTolerance for sequenceMode ([#7207](https://github.com/shaka-project/shaka-player/issues/7207)) ([b119c03](https://github.com/shaka-project/shaka-player/commit/b119c0311292dde479d747d0a76c4a499db5338e))
* Dont use trick play track for liveSync feature ([#7219](https://github.com/shaka-project/shaka-player/issues/7219)) ([b7481f2](https://github.com/shaka-project/shaka-player/commit/b7481f2bc92892c40b708f7ed33909f975481c02))
* Exclude future segments in notifyTimeRange calculations ([#6970](https://github.com/shaka-project/shaka-player/issues/6970)) ([62881f6](https://github.com/shaka-project/shaka-player/commit/62881f6aad4d3da540325977b101759ff26f6b94))
* Filter duplicate cues on text displayer append ([#6949](https://github.com/shaka-project/shaka-player/issues/6949)) ([fa9feb3](https://github.com/shaka-project/shaka-player/commit/fa9feb346f0a9dac1a86bdd364868a48c88c058f))
* Fire the correct error code in src= mode in some situations ([#7167](https://github.com/shaka-project/shaka-player/issues/7167)) ([a7a307c](https://github.com/shaka-project/shaka-player/commit/a7a307c513bc6c538c0dee200aff846501c075e1))
* Fix bad warning when use selectAudioLanguage ([#6999](https://github.com/shaka-project/shaka-player/issues/6999)) ([fbf1ad0](https://github.com/shaka-project/shaka-player/commit/fbf1ad0c896fb3458daa4875f3cb613321edd1a6))
* Fix ended state in stateHistory ([#7189](https://github.com/shaka-project/shaka-player/issues/7189)) ([f6be619](https://github.com/shaka-project/shaka-player/commit/f6be6190121342dd9521a0aa32810809d9750a52))
* Fix error thrown after catching null error ([#7177](https://github.com/shaka-project/shaka-player/issues/7177)) ([b4dc2ad](https://github.com/shaka-project/shaka-player/commit/b4dc2adf43c43cc5c34bd4032859ef30bb68d659))
* Fix horizontal alignment of WebVTT in UITextDisplayer ([#7169](https://github.com/shaka-project/shaka-player/issues/7169)) ([efac129](https://github.com/shaka-project/shaka-player/commit/efac12984fe40e3d92341bc44d20b05085497b69))
* Fix ID3 timing when included in EMSG ([#7099](https://github.com/shaka-project/shaka-player/issues/7099)) ([eb36c0d](https://github.com/shaka-project/shaka-player/commit/eb36c0d264d67bcd0fe99f06cd6c76b3dcfd61c2))
* Fix iteration of document.fonts ([#6976](https://github.com/shaka-project/shaka-player/issues/6976)) ([c70586c](https://github.com/shaka-project/shaka-player/commit/c70586cfda34f5963a4bfc63dafa3d29c7b33308))
* Fix MSE polyfill for iOS ([#7049](https://github.com/shaka-project/shaka-player/issues/7049)) ([fcd87aa](https://github.com/shaka-project/shaka-player/commit/fcd87aa327c8d55ba9a2fae6f1b0b371725f1b70))
* Fix NaN and empty objects in getNonDefaultConfiguration ([#6956](https://github.com/shaka-project/shaka-player/issues/6956)) ([52e3864](https://github.com/shaka-project/shaka-player/commit/52e3864fd06ab7f3acb6d7bab87cc1a25b7ff7f1))
* Fix normalized codec for VVC ([#7201](https://github.com/shaka-project/shaka-player/issues/7201)) ([8ca1b74](https://github.com/shaka-project/shaka-player/commit/8ca1b741986b7c47ca2873fe424cf8d32c6df215))
* Fix skip interstitials with another ID but same URL ([#7050](https://github.com/shaka-project/shaka-player/issues/7050)) ([8b70bb6](https://github.com/shaka-project/shaka-player/commit/8b70bb6c388be9f9fb96bd79b00d4dddc7744e03))
* Fix support for Dolby Vision based in VVC ([#7212](https://github.com/shaka-project/shaka-player/issues/7212)) ([cdbbe23](https://github.com/shaka-project/shaka-player/commit/cdbbe232b1521aa2caafbf1d2c4ef93c768f1339))
* Fix type passed to isTypeSupported in some cases ([#7233](https://github.com/shaka-project/shaka-player/issues/7233)) ([3e3953d](https://github.com/shaka-project/shaka-player/commit/3e3953deb3e38bd7d4a954e027ff4a79de03db64))
* Fix UITextDisplayer desync & null pointer exception ([#7199](https://github.com/shaka-project/shaka-player/issues/7199)) ([247753d](https://github.com/shaka-project/shaka-player/commit/247753d8314a9ecc42ee8c4a71cfac327edaff50))
* **HLS:** A/V sync regression for HLS live ([#6987](https://github.com/shaka-project/shaka-player/issues/6987)) ([da6c605](https://github.com/shaka-project/shaka-player/commit/da6c6058f92637f30466fd45ce67d9b21647d4f7))
* **HLS:** A/V sync regression for HLS with different segment sizes ([#7015](https://github.com/shaka-project/shaka-player/issues/7015)) ([83955ee](https://github.com/shaka-project/shaka-player/commit/83955eecfd1412e0201ade97b2511f48d6b67ba4))
* **HLS:** Add HLS_EMPTY_MEDIA_PLAYLIST error ([#6951](https://github.com/shaka-project/shaka-player/issues/6951)) ([b3df270](https://github.com/shaka-project/shaka-player/commit/b3df270a3efe2886cb87007c6b543dd8c0a2bb6a))
* **HLS:** Calculate the delay based on the sum of the segment lengths ([#7209](https://github.com/shaka-project/shaka-player/issues/7209)) ([abdabb0](https://github.com/shaka-project/shaka-player/commit/abdabb05b6896d285d51d246899d39dd87f7365c))
* **HLS:** Check that segment 0 exists ([#7208](https://github.com/shaka-project/shaka-player/issues/7208)) ([d744ef8](https://github.com/shaka-project/shaka-player/commit/d744ef82e97fa1085da4a7095716115f0ca79960))
* **HLS:** Expose tilesLayout properly for live ([#7123](https://github.com/shaka-project/shaka-player/issues/7123)) ([388050c](https://github.com/shaka-project/shaka-player/commit/388050cbd2213cacf9c31f4518a6a8a8528a350d))
* **HLS:** Fix filtering video/audio streams without bandwidth ([#7008](https://github.com/shaka-project/shaka-player/issues/7008)) ([64430ed](https://github.com/shaka-project/shaka-player/commit/64430edb23c589ea587eed754a102e2b3bbb9031))
* **HLS:** Fix load AES media playlist ([#7012](https://github.com/shaka-project/shaka-player/issues/7012)) ([3bd032c](https://github.com/shaka-project/shaka-player/commit/3bd032c9d67fc8f7ddf4fbc4cc68760491a07d15))
* **HLS:** Fix parsing of width and height when using media playlist ([#6989](https://github.com/shaka-project/shaka-player/issues/6989)) ([cec6166](https://github.com/shaka-project/shaka-player/commit/cec616695f4f5134d4e8734059125eac034c8450))
* **HLS:** Fix use of EXT-X-MEDIA when not using Content Steering ([#7166](https://github.com/shaka-project/shaka-player/issues/7166)) ([fcacb95](https://github.com/shaka-project/shaka-player/commit/fcacb95094be9647d8cabfcfe0546c18e755b6d2))
* **HLS:** Propagate bandwidth to stream in audio-only and video-only ([#7006](https://github.com/shaka-project/shaka-player/issues/7006)) ([1f5badf](https://github.com/shaka-project/shaka-player/commit/1f5badf320fcf2f245fbf8cc8174de9537cf9b7b))
* **HLS:** Remove init segment on formats without init segment ([#7060](https://github.com/shaka-project/shaka-player/issues/7060)) ([c576bc3](https://github.com/shaka-project/shaka-player/commit/c576bc39bd85fd9af8aed69dc01901b36c1bd656))
* honor autoShowText on non-audio streams ([#6977](https://github.com/shaka-project/shaka-player/issues/6977)) ([ef15d13](https://github.com/shaka-project/shaka-player/commit/ef15d1334237dd638ed5cecb31c29cbfc08e9568))
* **net:** Remove `AbortController` polyfill ([#7149](https://github.com/shaka-project/shaka-player/issues/7149)) ([65e6681](https://github.com/shaka-project/shaka-player/commit/65e66813aa69eb61e35c670fa09704327718c29f))
* Offset text regions that are out of viewport ([#6986](https://github.com/shaka-project/shaka-player/issues/6986)) ([ca7fd6e](https://github.com/shaka-project/shaka-player/commit/ca7fd6ed6a0a1ebd44131f97ad3f0a13471b0094))
* Only check encryptionScheme when is not null and not empty string ([#7079](https://github.com/shaka-project/shaka-player/issues/7079)) ([c62c5b5](https://github.com/shaka-project/shaka-player/commit/c62c5b5131704c5a177b703a7c1b0698d776d6f2))
* Pass correct adaptation value to MediaSourceEngine ([#7111](https://github.com/shaka-project/shaka-player/issues/7111)) ([0ff0578](https://github.com/shaka-project/shaka-player/commit/0ff05787882b98de234ff392a777c32f9ded49ee))
* **PeriodCombiner:** Use normalized codec to remove duplicates ([#7032](https://github.com/shaka-project/shaka-player/issues/7032)) ([0669d24](https://github.com/shaka-project/shaka-player/commit/0669d2433e0aca35479f30f419f9d939732d647a))
* **Prefetch:** Use the same references time for evict and prefetchSegmentsByTime ([#7003](https://github.com/shaka-project/shaka-player/issues/7003)) ([9fcaf4d](https://github.com/shaka-project/shaka-player/commit/9fcaf4d19c578f056e1a68e0f25b518f70b85d4d))
* properly map region height/width when applying anchors ([#7105](https://github.com/shaka-project/shaka-player/issues/7105)) ([ac9a6ca](https://github.com/shaka-project/shaka-player/commit/ac9a6ca6d394da890c3ca3e76c7e5a065f63fb43))
* Repeated initial segment load & cancellations ([#7147](https://github.com/shaka-project/shaka-player/issues/7147)) ([3f3bbc6](https://github.com/shaka-project/shaka-player/commit/3f3bbc69851f7372e32168f9e130126632d0dd32))
* Revert change that caused a lot of warning with "cannot find endTime" and hls playback errors ([#7239](https://github.com/shaka-project/shaka-player/issues/7239)) ([e522921](https://github.com/shaka-project/shaka-player/commit/e522921bc275da81e96ef98f4316ece62b6f5423))
* Revert change that caused stalls with "cannot find endTime" ([#7213](https://github.com/shaka-project/shaka-player/issues/7213)) ([2d2bddd](https://github.com/shaka-project/shaka-player/commit/2d2bddd7f1c6e6d6261a22560003f74861645d31))
* **SimpleTextDisplayer:** Do not disable metadata & chapters tracks ([#6948](https://github.com/shaka-project/shaka-player/issues/6948)) ([c6d834e](https://github.com/shaka-project/shaka-player/commit/c6d834ed367efeba520a5c91d3d289d41a2f2475))
* **SSA:** Support files with line breaks that are not necessary ([#6947](https://github.com/shaka-project/shaka-player/issues/6947)) ([88431b6](https://github.com/shaka-project/shaka-player/commit/88431b6f3d71a84dd203ecd3d3837629fbfb95e4))
* **Stats:** Fix bytesDownloaded when using src= ([#7223](https://github.com/shaka-project/shaka-player/issues/7223)) ([1faada6](https://github.com/shaka-project/shaka-player/commit/1faada692483b552b21705ca5b39d64632e150af))
* **Stats:** Fix completionPercent for Live ([#6957](https://github.com/shaka-project/shaka-player/issues/6957)) ([d719328](https://github.com/shaka-project/shaka-player/commit/d719328ffaee752eba2f1d45299b60ec499ee57d))
* **Transmuxer:** Fix init segment between discontinuities ([#7042](https://github.com/shaka-project/shaka-player/issues/7042)) ([6850f68](https://github.com/shaka-project/shaka-player/commit/6850f687533d70a1560e3675ce6aba34bf10798b))
* **TTML:** Fix font styles parsing ([#6969](https://github.com/shaka-project/shaka-player/issues/6969)) ([f56f7ba](https://github.com/shaka-project/shaka-player/commit/f56f7ba9ca18271467e6fa917021959d2dd68efb))
* **ttml:** Handle escaped special characters. ([#7047](https://github.com/shaka-project/shaka-player/issues/7047)) ([90668c2](https://github.com/shaka-project/shaka-player/commit/90668c20e08d5a86ad010a2cf50e8d9638240ad2)), closes [#7044](https://github.com/shaka-project/shaka-player/issues/7044)
* **TTML:** Show background color with image subtitles ([#6967](https://github.com/shaka-project/shaka-player/issues/6967)) ([e68fd55](https://github.com/shaka-project/shaka-player/commit/e68fd55c440c1010aaf45eb650edcdf7684d3012))
* **UI:** Don't display NaN stats ([#6958](https://github.com/shaka-project/shaka-player/issues/6958)) ([7c33192](https://github.com/shaka-project/shaka-player/commit/7c33192a07b7ec7046adef607d177422789e7fe5))
* **UI:** Fix ad markers set before full initialization ([#7089](https://github.com/shaka-project/shaka-player/issues/7089)) ([1d5c7d2](https://github.com/shaka-project/shaka-player/commit/1d5c7d2a6497a5a7aaccea5818e74e80cf52907c))
* **UI:** Fix display seekbar and time when the seekrange is infinite ([#7182](https://github.com/shaka-project/shaka-player/issues/7182)) ([867f8b2](https://github.com/shaka-project/shaka-player/commit/867f8b2d160fdf1b54ebfeea1fd8a2f88e093fb9))
* **UI:** Fix font-family override in UITextDisplayer ([#7249](https://github.com/shaka-project/shaka-player/issues/7249)) ([3d33277](https://github.com/shaka-project/shaka-player/commit/3d3327785f447d2116a715b8ceeeca5aa44e6977))
* **UI:** Fix resolution label when the stream has not resolution ([#7043](https://github.com/shaka-project/shaka-player/issues/7043)) ([089518c](https://github.com/shaka-project/shaka-player/commit/089518c0e18fa9dd3f7fee2b9e5dfd95426dc6df))
* **UI:** Fix seek preview time in VoD ([#7027](https://github.com/shaka-project/shaka-player/issues/7027)) ([226c740](https://github.com/shaka-project/shaka-player/commit/226c7403116e9f0565b09cb87b7284ee4f06b3e4))
* **UI:** fix wrong french in translation ([#6982](https://github.com/shaka-project/shaka-player/issues/6982)) ([2d6c2af](https://github.com/shaka-project/shaka-player/commit/2d6c2afa252f57f1dc769ffe17f86060a14dc594))
* **UI:** Only show frame rate if there are several frame rates ([#7190](https://github.com/shaka-project/shaka-player/issues/7190)) ([d4249b1](https://github.com/shaka-project/shaka-player/commit/d4249b1b9cc4b5e6ad1def292e6e9280c8c4d6f3))
* **UI:** Remove not loaded font ([#7242](https://github.com/shaka-project/shaka-player/issues/7242)) ([47f686f](https://github.com/shaka-project/shaka-player/commit/47f686faad05471bcd224e6db6bf820fc3b67afb))
* **UI:** Show all resolutions when there are only one audio. ([#7017](https://github.com/shaka-project/shaka-player/issues/7017)) ([2a2c9cd](https://github.com/shaka-project/shaka-player/commit/2a2c9cd92d90d842805c73c3c5a171b042a0cdcd))
* **UI:** Show the ad marker in the seek bar when there are some intersections ([#6990](https://github.com/shaka-project/shaka-player/issues/6990)) ([247037e](https://github.com/shaka-project/shaka-player/commit/247037e5370c6194111331edde72082f01c22b1e))
* Unify maxDisabledTime behaviour ([#7077](https://github.com/shaka-project/shaka-player/issues/7077)) ([8e13e91](https://github.com/shaka-project/shaka-player/commit/8e13e91ba62300f0513be3e1852a82bf3f003e75))
* **WebVTT:** Fix rendering of WebVTT in UITextDisplayer ([#7023](https://github.com/shaka-project/shaka-player/issues/7023)) ([22a7c49](https://github.com/shaka-project/shaka-player/commit/22a7c497b046ab339d692c92387bf7a1cdef1800))
* **WebVTT:** Re-add rollover logic ([#7104](https://github.com/shaka-project/shaka-player/issues/7104)) ([0708379](https://github.com/shaka-project/shaka-player/commit/0708379badb5c5cf49c66e753e1544f973838cbc))
* **Xbox:** Fix screen resolution detection ([#6988](https://github.com/shaka-project/shaka-player/issues/6988)) ([4d2aa24](https://github.com/shaka-project/shaka-player/commit/4d2aa24b6b0a3d99f42f01a7d49fb8de34988000))
* **Xbox:** Override Dolby Vision codecs ([#7115](https://github.com/shaka-project/shaka-player/issues/7115)) ([2c399e0](https://github.com/shaka-project/shaka-player/commit/2c399e0f9f7aa42f7d1cac5a2b42b3603da58d5c))
* **Xbox:** Support screen resolution detection on Xbox when using WebView2 ([#7144](https://github.com/shaka-project/shaka-player/issues/7144)) ([d93a019](https://github.com/shaka-project/shaka-player/commit/d93a019454d7dc77ae31ae2ad637aab5bbf2c840)), closes [#7141](https://github.com/shaka-project/shaka-player/issues/7141)


### Performance Improvements

* **DRM:** compare init data only when config flag is set ([#6952](https://github.com/shaka-project/shaka-player/issues/6952)) ([be22e5b](https://github.com/shaka-project/shaka-player/commit/be22e5b0ce4093aedc434f81206a29eaad12c5ec))
* **HLS:** do not loop twice when processing nalus ([#6954](https://github.com/shaka-project/shaka-player/issues/6954)) ([a779d31](https://github.com/shaka-project/shaka-player/commit/a779d31efcf7c9f1db6b306165722c3b7d6ed1e6))

## [4.10.0](https://github.com/shaka-project/shaka-player/compare/v4.9.0...v4.10.0) (2024-07-01)


### Features

* add an audiotrackchanged event for when label, language, or roles of an audio track change ([#6913](https://github.com/shaka-project/shaka-player/issues/6913)) ([8825af7](https://github.com/shaka-project/shaka-player/commit/8825af7b719d60b944da5a5f0aa26cf16c460e47))
* Add audio codec to `selectAudioLanguage()` ([#6723](https://github.com/shaka-project/shaka-player/issues/6723)) ([48bdf17](https://github.com/shaka-project/shaka-player/commit/48bdf176cbb65091d76a348250ce03f87a0c44ae))
* Add dontChooseCodecs config ([#6759](https://github.com/shaka-project/shaka-player/issues/6759)) ([5067d5c](https://github.com/shaka-project/shaka-player/commit/5067d5cf5f83175b28510c01fdff26dcfd52bef0))
* Add isLowLatency to shaka.extern.Manifest ([#6842](https://github.com/shaka-project/shaka-player/issues/6842)) ([e020814](https://github.com/shaka-project/shaka-player/commit/e0208148cbe112b19df8dabddcf0bff7c32b4e97))
* add liveSyncTargetLatency option and deprecate liveSyncMinLatency and liveSyncMaxLatency options ([#6822](https://github.com/shaka-project/shaka-player/issues/6822)) ([277afbf](https://github.com/shaka-project/shaka-player/commit/277afbf894d1db22f95db71c3f9f8695c4e14423))
* Add option to disable continue loading live stream manifest when paused ([#6916](https://github.com/shaka-project/shaka-player/issues/6916)) ([0ea31b4](https://github.com/shaka-project/shaka-player/commit/0ea31b46e6a9f61749a34cad8e989221193d48c1))
* Add segment URIs to segment-related errors ([#6714](https://github.com/shaka-project/shaka-player/issues/6714)) ([8d680e5](https://github.com/shaka-project/shaka-player/commit/8d680e56b4dc8c0dfcdb10a85294d64f9be175d8)), closes [#6712](https://github.com/shaka-project/shaka-player/issues/6712)
* **Ads:** Add averageLoadTime and errors to ad stats ([#6828](https://github.com/shaka-project/shaka-player/issues/6828)) ([037d4cb](https://github.com/shaka-project/shaka-player/commit/037d4cbb7e9d629db16dc0794e778375746ce84d))
* **Ads:** Add content resume/pause requested events ([#6738](https://github.com/shaka-project/shaka-player/issues/6738)) ([9b47b8f](https://github.com/shaka-project/shaka-player/commit/9b47b8f74fc53cd437ea5747d58c5501c17c6716))
* **Ads:** Add CUE ONCE support in Interstitials ([#6785](https://github.com/shaka-project/shaka-player/issues/6785)) ([c72493a](https://github.com/shaka-project/shaka-player/commit/c72493a41b143583250d00b42f0fb107fbcb94da))
* **Ads:** Add CUE PRE and POST support in Interstitials ([#6799](https://github.com/shaka-project/shaka-player/issues/6799)) ([4ea9a44](https://github.com/shaka-project/shaka-player/commit/4ea9a4471d751146ba8f93b8476dd179d1396718))
* **Ads:** Add CUEPOINTS_CHANGED event to interstitials ([#6791](https://github.com/shaka-project/shaka-player/issues/6791)) ([9b25ff5](https://github.com/shaka-project/shaka-player/commit/9b25ff5bc1206b7acb884735c9c93cc1e5238a7c))
* **Ads:** Add support for interstitials when using src= ([#6777](https://github.com/shaka-project/shaka-player/issues/6777)) ([59304b8](https://github.com/shaka-project/shaka-player/commit/59304b820841bc4f03ba4718816eed759557a6bf))
* **Ads:** Add support for X-TIMELINE-OCCUPIES ([#6806](https://github.com/shaka-project/shaka-player/issues/6806)) ([7844fed](https://github.com/shaka-project/shaka-player/commit/7844fedf21efb96fdbfc5eb2e271a0d2bb365e41))
* **Ads:** Fill loadTime stats in interstitials ([#6817](https://github.com/shaka-project/shaka-player/issues/6817)) ([28d3c98](https://github.com/shaka-project/shaka-player/commit/28d3c98415239a894a6ff15e6c4ccbc7cee344ba))
* **Ads:** Fix playback of interstitials in iOS ([#6776](https://github.com/shaka-project/shaka-player/issues/6776)) ([363989c](https://github.com/shaka-project/shaka-player/commit/363989c77044347ab7fbd369c317c3fc81da9275))
* **Ads:** Improve preload timing on interstitials ([#6792](https://github.com/shaka-project/shaka-player/issues/6792)) ([4638775](https://github.com/shaka-project/shaka-player/commit/46387754ca494fcd0ae6cd560b9b8e3c6e3656ef))
* **Ads:** Improve resume times when the interstial uses two video elements ([#6774](https://github.com/shaka-project/shaka-player/issues/6774)) ([5bfe37f](https://github.com/shaka-project/shaka-player/commit/5bfe37f3c5a29ce8fc31ba602118262c5f0ab35e))
* **Ads:** Remove circular dependency ([#6868](https://github.com/shaka-project/shaka-player/issues/6868)) ([e39defb](https://github.com/shaka-project/shaka-player/commit/e39defb6f76bfbc9e30d7a1105261469b817708f))
* **CEA:** Add CEA support for VVC/H.266 ([#6912](https://github.com/shaka-project/shaka-player/issues/6912)) ([a3d09a9](https://github.com/shaka-project/shaka-player/commit/a3d09a9431da80971f38ff9cde002cf9906475a9))
* **DASH:** add  `MPD_PATCH` advanced request type ([#6787](https://github.com/shaka-project/shaka-player/issues/6787)) ([2f3a1eb](https://github.com/shaka-project/shaka-player/commit/2f3a1ebf944705b6b0aa9e464e19b79e232e2a2a))
* Dynamic target latency ([#6858](https://github.com/shaka-project/shaka-player/issues/6858)) ([68b4777](https://github.com/shaka-project/shaka-player/commit/68b4777feb425c5c500626eca2b26fdedd4d007e))
* Export getMaxSegmentEndTime and getAvailabilityTimeOffset in PresentationTimeline ([#6839](https://github.com/shaka-project/shaka-player/issues/6839)) ([680c0f1](https://github.com/shaka-project/shaka-player/commit/680c0f1dc9cfc673be6318c366af716d9c697436))
* Fix processing EXT-X-DATERANGE on live streams ([#6740](https://github.com/shaka-project/shaka-player/issues/6740)) ([4820565](https://github.com/shaka-project/shaka-player/commit/48205651441842655ea9facafa22358df0fc79cb))
* Fix useNativeHlsOnSafari deprecation ([#6935](https://github.com/shaka-project/shaka-player/issues/6935)) ([b71d0a1](https://github.com/shaka-project/shaka-player/commit/b71d0a1c93d013c12dd2e906c5147025a45c2c2b))
* **HLS:** Add HLS interstitial support ([#6761](https://github.com/shaka-project/shaka-player/issues/6761)) ([60e6847](https://github.com/shaka-project/shaka-player/commit/60e6847e39a01a6382eb35d37f0a606635c7be0e))
* **HLS:** Add support for EXT-X-DATERANGE ([#6718](https://github.com/shaka-project/shaka-player/issues/6718)) ([2ec6444](https://github.com/shaka-project/shaka-player/commit/2ec64442e2b43fdfdf5a20f63d4367dc3d531892))
* **HLS:** Add support for MediaQualityInfo events ([#6927](https://github.com/shaka-project/shaka-player/issues/6927)) ([0895e2e](https://github.com/shaka-project/shaka-player/commit/0895e2e7716812f12250fc1d5df2051704442c1e))
* **HLS:** Add support to variable substitution in EXT-X-DATERANGE ([#6751](https://github.com/shaka-project/shaka-player/issues/6751)) ([3b2477f](https://github.com/shaka-project/shaka-player/commit/3b2477f42c5d1fdd131e651a2ded1eb98c5fe514))
* **HLS:** Allow disable streams when the media playlist fails ([#6807](https://github.com/shaka-project/shaka-player/issues/6807)) ([c866d7b](https://github.com/shaka-project/shaka-player/commit/c866d7b4676922d6d0cec8bd44403d0afdbdd6e4))
* **hls:** expose manifest skd uri on drmInfo ([#6857](https://github.com/shaka-project/shaka-player/issues/6857)) ([644677c](https://github.com/shaka-project/shaka-player/commit/644677ca864ca06a360edad38c2089649aa2493f))
* **HLS:** Ignore EXT-X-DATERANGE in the past ([#6757](https://github.com/shaka-project/shaka-player/issues/6757)) ([8d7dd37](https://github.com/shaka-project/shaka-player/commit/8d7dd37cfbd2579582c7242b0c8d1f5ac244eeeb))
* **HLS:** Only process DATE-RANGE in AUDIO and VIDEO playlists ([#6793](https://github.com/shaka-project/shaka-player/issues/6793)) ([a1c91ae](https://github.com/shaka-project/shaka-player/commit/a1c91aeaf9b58f2938f1eb2c97d2e4982765a447))
* **HLS:** Use PLANNED-DURATION to determine the end time ([#6800](https://github.com/shaka-project/shaka-player/issues/6800)) ([bf5a103](https://github.com/shaka-project/shaka-player/commit/bf5a1036261047520ed7e8715c37b2b1b9b57225))
* move live sync options into their own object ([#6845](https://github.com/shaka-project/shaka-player/issues/6845)) ([da0bc4d](https://github.com/shaka-project/shaka-player/commit/da0bc4da4e267bae5d0ed35c82ac1c5ac782a1a6))
* **MSS:** Add support for MediaQualityInfo events ([#6923](https://github.com/shaka-project/shaka-player/issues/6923)) ([767cbed](https://github.com/shaka-project/shaka-player/commit/767cbede2ca9a87fcf68c4f60b2b499bb16a9650))
* Parse dvvC box for Dolby Vision support ([#6866](https://github.com/shaka-project/shaka-player/issues/6866)) ([69fe20f](https://github.com/shaka-project/shaka-player/commit/69fe20f43af7a21926f8cf9fa50c6f757fa5b247))
* **preload:** Add new method destroyAllPreloads ([#6756](https://github.com/shaka-project/shaka-player/issues/6756)) ([b500799](https://github.com/shaka-project/shaka-player/commit/b500799b97abf41299b6cca81ef58412348f82f6))
* **Stats:** Add `manifestGapCount` to stats ([#6804](https://github.com/shaka-project/shaka-player/issues/6804)) ([8a678f3](https://github.com/shaka-project/shaka-player/commit/8a678f374ddc36ce8e4125b6d6359188d516ce3c)), closes [#6789](https://github.com/shaka-project/shaka-player/issues/6789)
* **Stats:** Add `manifestPeriodCount` to stats ([#6798](https://github.com/shaka-project/shaka-player/issues/6798)) ([65b0b8d](https://github.com/shaka-project/shaka-player/commit/65b0b8dd2114ccabf6eef1fd4b52fa4f93aa7ad9)), closes [#6788](https://github.com/shaka-project/shaka-player/issues/6788)
* **Stats:** add size of the manifest to player stats ([#6783](https://github.com/shaka-project/shaka-player/issues/6783)) ([d0d5843](https://github.com/shaka-project/shaka-player/commit/d0d5843d8c0b1dee4b101efc00f9db71c81a549d))
* **Stats:** count non fatal errors ([#6781](https://github.com/shaka-project/shaka-player/issues/6781)) ([081afde](https://github.com/shaka-project/shaka-player/commit/081afde932ec27fde2d694d5289fc6f34a349244))
* **UI:** Add ad statistics button ([#6827](https://github.com/shaka-project/shaka-player/issues/6827)) ([ea82028](https://github.com/shaka-project/shaka-player/commit/ea8202805a6122b630e0085a1c1862134b01f613))
* **UI:** Add new stats to context menu ([#6814](https://github.com/shaka-project/shaka-player/issues/6814)) ([8395b91](https://github.com/shaka-project/shaka-player/commit/8395b912a70fc57699417ec9236c25f3190885ef))
* **UI:** Add save video frame button ([#6926](https://github.com/shaka-project/shaka-player/issues/6926)) ([19cfbf9](https://github.com/shaka-project/shaka-player/commit/19cfbf966fa956609a8341b204c6d51e72bfbdb1))
* **UI:** Highlight current time when hovered on seek bar ([#6870](https://github.com/shaka-project/shaka-player/issues/6870)) ([f46dbdc](https://github.com/shaka-project/shaka-player/commit/f46dbdc0197eae3fa4c654d801081726fbf16072))
* **UI:** Initialize interstitials by default when using UI ([#6797](https://github.com/shaka-project/shaka-player/issues/6797)) ([31d0445](https://github.com/shaka-project/shaka-player/commit/31d0445f8325c645eb919fb2c879126c14b04865))


### Bug Fixes

* `getPresentationStartTimeAsDate()` should return time unaffected by clock drift ([#6790](https://github.com/shaka-project/shaka-player/issues/6790)) ([0820491](https://github.com/shaka-project/shaka-player/commit/082049156482598f160dbf4878c1d8a3d5ef379b))
* `selectAudioLanguage()` should ignore unplayable variants ([#6805](https://github.com/shaka-project/shaka-player/issues/6805)) ([95590ad](https://github.com/shaka-project/shaka-player/commit/95590adefddfc0e7b5c5d0c65dbc3864cf9c2375))
* **ABR:** Add a guard when variant is null ([#6928](https://github.com/shaka-project/shaka-player/issues/6928)) ([3be95a8](https://github.com/shaka-project/shaka-player/commit/3be95a83ad8b01fa20a2ec938f7a956de6c32d4c))
* **ABR:** Fix variant choose when two variants have the same bandwidth but different resolution ([#6760](https://github.com/shaka-project/shaka-player/issues/6760)) ([a053dd2](https://github.com/shaka-project/shaka-player/commit/a053dd25137c9d1fed1303c7a2024231752baa54))
* **Ads:** Fix duplicate interstitials when using src= ([#6784](https://github.com/shaka-project/shaka-player/issues/6784)) ([3949686](https://github.com/shaka-project/shaka-player/commit/394968617efab6b21a42fffe2ac2c683fcf12e1d))
* **Ads:** Fix interstitial ad values when the ad is loading ([#6782](https://github.com/shaka-project/shaka-player/issues/6782)) ([08e8111](https://github.com/shaka-project/shaka-player/commit/08e81118cffef307ad9f47408f0db42d8b31b502))
* **Ads:** Fix skip functionality in MediaTailor ([#6910](https://github.com/shaka-project/shaka-player/issues/6910)) ([339bab4](https://github.com/shaka-project/shaka-player/commit/339bab44ec58cfdf288e7e9532f4c92b34568e65))
* Allow use startTime equal to 0 in HLS live streams using src= ([#6843](https://github.com/shaka-project/shaka-player/issues/6843)) ([224c1b9](https://github.com/shaka-project/shaka-player/commit/224c1b916a8689118d4f708eaec8fed1c8068bb1))
* Avoid filter manifest when the DRM is not initialized ([#6737](https://github.com/shaka-project/shaka-player/issues/6737)) ([80139b0](https://github.com/shaka-project/shaka-player/commit/80139b0ba714fb233b5631b0e75f3432eec0ff39))
* Avoid firing SEGMENT_MISSING when there is an alternative ([#6881](https://github.com/shaka-project/shaka-player/issues/6881)) ([aed859b](https://github.com/shaka-project/shaka-player/commit/aed859b05fe6c2ee668bff281c2baabe245c6ff7))
* **CEA:** CEA-608 is not rendered in some cases (multiples TRAF boxes) ([#6878](https://github.com/shaka-project/shaka-player/issues/6878)) ([a3e1fdd](https://github.com/shaka-project/shaka-player/commit/a3e1fdd0f82f4cb78d0925ca906b3a67ac863061))
* **CMCD:** Fix reset CMCD on unload ([#6821](https://github.com/shaka-project/shaka-player/issues/6821)) ([7bea10c](https://github.com/shaka-project/shaka-player/commit/7bea10c18d4e2afbc26826d8cead49eb5d61daf8))
* **CS:** Fix IMA integration ([#6907](https://github.com/shaka-project/shaka-player/issues/6907)) ([9b1ef04](https://github.com/shaka-project/shaka-player/commit/9b1ef046df31b968498dff6d423e349f9ee13597))
* **DASH:** Allow play when SegmentTimeline has a duration 0 "S" element ([#6896](https://github.com/shaka-project/shaka-player/issues/6896)) ([3e45e66](https://github.com/shaka-project/shaka-player/commit/3e45e66af23573e3c2d3dfea8879452e370fa04d))
* Do not export functions in getNonDefaultConfiguration ([#6739](https://github.com/shaka-project/shaka-player/issues/6739)) ([93c6123](https://github.com/shaka-project/shaka-player/commit/93c612392cc5f1bb7f4f7e72fa9f7c298c2074f9))
* Don't clear the buffer when disable a stream ([#6931](https://github.com/shaka-project/shaka-player/issues/6931)) ([5dac2c0](https://github.com/shaka-project/shaka-player/commit/5dac2c051cc58b9e10d713d70f1e31fe2f18792c))
* **DRM:** close properly webkit media key sessions ([#6775](https://github.com/shaka-project/shaka-player/issues/6775)) ([309bd72](https://github.com/shaka-project/shaka-player/commit/309bd72046acbdfb0f0ded81a599012f125d2e33))
* **DRM:** Probe robustness only for modern PlayReady keysystem ([#6851](https://github.com/shaka-project/shaka-player/issues/6851)) ([96f248c](https://github.com/shaka-project/shaka-player/commit/96f248cb7175ca6a2cfe8fbb5f40080c0e8b9be0))
* ensure all timelineregionenter events are fired ([#6713](https://github.com/shaka-project/shaka-player/issues/6713)) ([76863f2](https://github.com/shaka-project/shaka-player/commit/76863f2a5880ec793c0f7ebc11d187330b9f7651)), closes [#6711](https://github.com/shaka-project/shaka-player/issues/6711)
* Exclude fetch polyfill from fetch plugin ([#6838](https://github.com/shaka-project/shaka-player/issues/6838)) ([8bb2d6e](https://github.com/shaka-project/shaka-player/commit/8bb2d6e11a704fc6d1c5b2f3b7895bad37c2f75b))
* Fix AC-4 codec string in MediaSourceEngine ([#6780](https://github.com/shaka-project/shaka-player/issues/6780)) ([8fb31c1](https://github.com/shaka-project/shaka-player/commit/8fb31c1777ab6e7afade3fd82ee918bfee4867a9))
* Fix audio properties detection ([#6867](https://github.com/shaka-project/shaka-player/issues/6867)) ([e204bf6](https://github.com/shaka-project/shaka-player/commit/e204bf65c6b4c96c6735ba893c163eeb3a1390f7))
* Fix continues to play a few seconds after reaching playRangeEnd ([#6861](https://github.com/shaka-project/shaka-player/issues/6861)) ([9f5b5a5](https://github.com/shaka-project/shaka-player/commit/9f5b5a5aa9097f31c9b299ce149bf46eb73cd4dc))
* Fix green screen issue on Edge with mixed content ([#6719](https://github.com/shaka-project/shaka-player/issues/6719)) ([d5b1863](https://github.com/shaka-project/shaka-player/commit/d5b18631575171eaed4bba31aecb472471dd96df))
* Fix initial track selection in src= when using HLS ([#6803](https://github.com/shaka-project/shaka-player/issues/6803)) ([a65a6f8](https://github.com/shaka-project/shaka-player/commit/a65a6f8b20606d5c092e3f13f56d931dcb967249))
* Fix normalized codec for Dolby Vision ([#6865](https://github.com/shaka-project/shaka-player/issues/6865)) ([465a69a](https://github.com/shaka-project/shaka-player/commit/465a69aedb5a73b31dff028711aaef1f2cf41fb9))
* Fix timestampOffset when is greater than baseMediaDecodeTime ([#6849](https://github.com/shaka-project/shaka-player/issues/6849)) ([3eb85f9](https://github.com/shaka-project/shaka-player/commit/3eb85f938d707dc6a161db523e60b3568e379d2f))
* Generate the correct codec for AV1 HDR ([#6879](https://github.com/shaka-project/shaka-player/issues/6879)) ([1c863c8](https://github.com/shaka-project/shaka-player/commit/1c863c8510c3250c30cceaffcf1d5ccfeef8894f))
* **HLS:** Allow detect mimeType from non-gap segments ([#6892](https://github.com/shaka-project/shaka-player/issues/6892)) ([14ce038](https://github.com/shaka-project/shaka-player/commit/14ce038a636041e8eb4168870ceb61f5ceaecd6d))
* **HLS:** Allow disable initial variant if necessary ([#6940](https://github.com/shaka-project/shaka-player/issues/6940)) ([3416054](https://github.com/shaka-project/shaka-player/commit/3416054bb559b4c288fa63ce8952e92e78337402))
* **HLS:** Avoid get basic info when the first segment is a gap ([#6882](https://github.com/shaka-project/shaka-player/issues/6882)) ([f217344](https://github.com/shaka-project/shaka-player/commit/f2173440c8a7fd651089d35f37c4a6d6c2fb7820))
* **HLS:** Avoid make a HEAD request of gap segments ([#6880](https://github.com/shaka-project/shaka-player/issues/6880)) ([c90bc5f](https://github.com/shaka-project/shaka-player/commit/c90bc5f563ac9ecf11a7194dffc76f137b9618ce))
* **HLS:** Disable stream when the media live playlist is stuck ([#6900](https://github.com/shaka-project/shaka-player/issues/6900)) ([c555b38](https://github.com/shaka-project/shaka-player/commit/c555b38459654c1cdc8245784fa58c4bc5d38fec))
* **HLS:** Fix AC-4 codec selection in HLS ([#6818](https://github.com/shaka-project/shaka-player/issues/6818)) ([bf15b24](https://github.com/shaka-project/shaka-player/commit/bf15b24fc2d19f574895940a24f23838d8f6cac7))
* **HLS:** Fix get basic info from segments ([#6898](https://github.com/shaka-project/shaka-player/issues/6898)) ([02331e1](https://github.com/shaka-project/shaka-player/commit/02331e1064f2a0eb1d63492fefae6703d591f13f))
* **HLS:** Fix getAvailableSegment_ function ([#6915](https://github.com/shaka-project/shaka-player/issues/6915)) ([7bbf612](https://github.com/shaka-project/shaka-player/commit/7bbf6124aba3f96ed68227e615c2e067a0ba5a97))
* **HLS:** Fix MPEG-H codec selection in HLS ([#6901](https://github.com/shaka-project/shaka-player/issues/6901)) ([3db66b3](https://github.com/shaka-project/shaka-player/commit/3db66b3fb011ee0f585e8c2256c30b7579a08468))
* **HLS:** Fix seekRange when using delta playlist ([#6758](https://github.com/shaka-project/shaka-player/issues/6758)) ([7bcb86e](https://github.com/shaka-project/shaka-player/commit/7bcb86e5103ecc6d4ce09498899650493fb88557))
* **HLS:** Identify EXT-X-GAP with segment tags ([#6884](https://github.com/shaka-project/shaka-player/issues/6884)) ([4ff0859](https://github.com/shaka-project/shaka-player/commit/4ff0859f4bb3e1c37a4649a3f3dd4d505af6b027))
* **HLS:** Ignore query params in the uri of EXT-X-SESSION-KEY tags ([#6755](https://github.com/shaka-project/shaka-player/issues/6755)) ([c3e6450](https://github.com/shaka-project/shaka-player/commit/c3e64508c18f7d0fbc47a95d22862903788289e3))
* ignore buffered content less than 1e-4s ([#6802](https://github.com/shaka-project/shaka-player/issues/6802)) ([d6fcf66](https://github.com/shaka-project/shaka-player/commit/d6fcf66f5e5726550bb9e3101f9f36d240f97c42))
* Only request initialization segment when it's necessary ([#6929](https://github.com/shaka-project/shaka-player/issues/6929)) ([2f762ec](https://github.com/shaka-project/shaka-player/commit/2f762ec0940e883e5650b56267dc00e9a64a4d2b))
* **Prefetch:** cache iterator to avoid precision issues ([#6899](https://github.com/shaka-project/shaka-player/issues/6899)) ([b5f1ee9](https://github.com/shaka-project/shaka-player/commit/b5f1ee9f49d46bb1e914276fc676291aed9a3829))
* **Prefetch:** Ensure prefetched segments are continuous ([#6908](https://github.com/shaka-project/shaka-player/issues/6908)) ([db679e0](https://github.com/shaka-project/shaka-player/commit/db679e028273e24c10c6bc4057479ac4f2047b17))
* **preload:** Fix error handling ([#6753](https://github.com/shaka-project/shaka-player/issues/6753)) ([9d1fe4a](https://github.com/shaka-project/shaka-player/commit/9d1fe4abd59e182237d8cb30ac06ef87cd899515))
* **preload:** Fix memory leak with preload feature ([#6894](https://github.com/shaka-project/shaka-player/issues/6894)) ([88d2a02](https://github.com/shaka-project/shaka-player/commit/88d2a0227bc23ae2e02d45fd3fc27cd3d3e3f66d)), closes [#6883](https://github.com/shaka-project/shaka-player/issues/6883)
* **preload:** Fix preload error reporting ([#6746](https://github.com/shaka-project/shaka-player/issues/6746)) ([95422b1](https://github.com/shaka-project/shaka-player/commit/95422b17d62964f45528061b678651081910c184))
* **preload:** Fix preload load latency logic. ([#6890](https://github.com/shaka-project/shaka-player/issues/6890)) ([878bf62](https://github.com/shaka-project/shaka-player/commit/878bf62a21be8e2516016549c0e42617e7221030)), closes [#6871](https://github.com/shaka-project/shaka-player/issues/6871)
* **PS4:** Fix serverCertificate defaulted to null ([#6716](https://github.com/shaka-project/shaka-player/issues/6716)) ([6f84e41](https://github.com/shaka-project/shaka-player/commit/6f84e411ed7bf4647b94e90a5f63ac0d43d39d30))
* Support for Zenterio ([#6717](https://github.com/shaka-project/shaka-player/issues/6717)) ([97910dc](https://github.com/shaka-project/shaka-player/commit/97910dc8a9d658eee70c204f509c0adddc2cbb7a))
* **TTML:** Extended subtitle codec support ([#6832](https://github.com/shaka-project/shaka-player/issues/6832)) ([601098b](https://github.com/shaka-project/shaka-player/commit/601098bad14dd533b3de99d767c68f0db9921715)), closes [#6831](https://github.com/shaka-project/shaka-player/issues/6831)
* **TTML:** Fix timing parsing when using 1dp ([#6830](https://github.com/shaka-project/shaka-player/issues/6830)) ([3783ffd](https://github.com/shaka-project/shaka-player/commit/3783ffd44b7d31bd2bbeea1aebecf608ac42e2a2)), closes [#6829](https://github.com/shaka-project/shaka-player/issues/6829)
* **UI:** Don't show presentation time in ads ([#6752](https://github.com/shaka-project/shaka-player/issues/6752)) ([2e4ace5](https://github.com/shaka-project/shaka-player/commit/2e4ace593618b0c0bf68f2d67af01a846e5992f7))
* **UI:** Fix resolution sorting ([#6742](https://github.com/shaka-project/shaka-player/issues/6742)) ([aaf4b63](https://github.com/shaka-project/shaka-player/commit/aaf4b633995f91feecf6d77f7c96e7dba7c23206))
* **UI:** UI does not update after loading a new stream ([#6721](https://github.com/shaka-project/shaka-player/issues/6721)) ([d9242cd](https://github.com/shaka-project/shaka-player/commit/d9242cd09c2fae52f8c6842e2a97864fc05c3cd5))
* **UI:** update French translations ([#6873](https://github.com/shaka-project/shaka-player/issues/6873)) ([620756b](https://github.com/shaka-project/shaka-player/commit/620756b2ea03b342370af8ad7e583f4d258b6937))
* **UI:** update Polish translations ([#6846](https://github.com/shaka-project/shaka-player/issues/6846)) ([2c610a4](https://github.com/shaka-project/shaka-player/commit/2c610a42b4e97593d2acbf671d6bb703acd05145))
* **UI:** update Portuguese translations ([#6874](https://github.com/shaka-project/shaka-player/issues/6874)) ([1fed8b7](https://github.com/shaka-project/shaka-player/commit/1fed8b7863382f906bb8f407127f4c918c22dcba))
* **UI:** update Spanish translations ([#6875](https://github.com/shaka-project/shaka-player/issues/6875)) ([34cc33c](https://github.com/shaka-project/shaka-player/commit/34cc33cfb7360c6426bf7106bfa647f904eb38a5))

## [4.9.0](https://github.com/shaka-project/shaka-player/compare/v4.8.0...v4.9.0) (2024-05-30)


### Features

* **ABR:** Add cacheLoadThreshold config ([#6657](https://github.com/shaka-project/shaka-player/issues/6657)) ([f374173](https://github.com/shaka-project/shaka-player/commit/f3741737ac111cec665ef391495831aa5fe277ac))
* Add a new setting to allow remove based on channels count ([#6600](https://github.com/shaka-project/shaka-player/issues/6600)) ([0206e5a](https://github.com/shaka-project/shaka-player/commit/0206e5af8e4e1ea1415a8144470b0f12689ef9aa))
* Add config for add headers to license requests ([#6650](https://github.com/shaka-project/shaka-player/issues/6650)) ([e7b893b](https://github.com/shaka-project/shaka-player/commit/e7b893b74e5d2234120a8d5dfd9a8b9d2fc8d4d9))
* add config to clear decodingInfo cache on unload ([#6678](https://github.com/shaka-project/shaka-player/issues/6678)) ([e0eeb5b](https://github.com/shaka-project/shaka-player/commit/e0eeb5b77d4887d3fa54ca66236543d7d0df4a57))
* Add getNonDefaultConfiguration ([#6620](https://github.com/shaka-project/shaka-player/issues/6620)) ([907e6ba](https://github.com/shaka-project/shaka-player/commit/907e6bab287a61f160f2a3f6f942c44c325d96e6))
* Add response URI to BAD_HTTP_STATUS error ([#6561](https://github.com/shaka-project/shaka-player/issues/6561)) ([ed93987](https://github.com/shaka-project/shaka-player/commit/ed939872e13f33d6c65b6b70e4c5eb5499fa171a))
* Add support for probing encryption scheme support ([#6506](https://github.com/shaka-project/shaka-player/issues/6506)) ([2dea350](https://github.com/shaka-project/shaka-player/commit/2dea350d7483ba2c68b900e983a37562c15b8257))
* **Ads:** Implement skip ad functionality in Media Tailor ([#6598](https://github.com/shaka-project/shaka-player/issues/6598)) ([1429763](https://github.com/shaka-project/shaka-player/commit/1429763c975d5eef3c1fb70cf43394aa1646caca))
* **Ads:** Support CS on devices that don't support multiple media elements ([#6575](https://github.com/shaka-project/shaka-player/issues/6575)) ([520930c](https://github.com/shaka-project/shaka-player/commit/520930c6650cc95dd773ea9486176c62f097b9bc))
* Check encryptionScheme against MCap ([#6484](https://github.com/shaka-project/shaka-player/issues/6484)) ([ec29f82](https://github.com/shaka-project/shaka-player/commit/ec29f82592fdec9e189fc87a25704fabffb7d404))
* **DASH:** Add manifest.dash.enableFastSwitching config ([#6500](https://github.com/shaka-project/shaka-player/issues/6500)) ([2fc0c93](https://github.com/shaka-project/shaka-player/commit/2fc0c935c42cc5ef93e2a3c8644b7d0216cfad7b))
* **DASH:** Add MPD Chaining support ([#6641](https://github.com/shaka-project/shaka-player/issues/6641)) ([82c5149](https://github.com/shaka-project/shaka-player/commit/82c5149375745d6abbc5ebd1cde3c0632973ed62))
* **DASH:** Add MPD Patch support ([#5247](https://github.com/shaka-project/shaka-player/issues/5247)) ([d38aabf](https://github.com/shaka-project/shaka-player/commit/d38aabf04db86ed1297f3952cc3dc8f3366d747c))
* **DASH:** Parse and use target latency ([#6683](https://github.com/shaka-project/shaka-player/issues/6683)) ([9060ab0](https://github.com/shaka-project/shaka-player/commit/9060ab0a347fa6ea16f4f102470a82a039ee0034))
* **DASH:** Support Dolby Vision profile 8.x (HEVC) and 10.x (AV1) ([#6590](https://github.com/shaka-project/shaka-player/issues/6590)) ([e480bf0](https://github.com/shaka-project/shaka-player/commit/e480bf0ed4835fa1725f17135dc6caca71800b3e))
* Expose the maximum hardware resolution through probeSupport() ([#6569](https://github.com/shaka-project/shaka-player/issues/6569)) ([5da5de2](https://github.com/shaka-project/shaka-player/commit/5da5de2800a9190e3daf29fdec2e49c5108f268d))
* **HLS:** Build closed captions metadata on-the-fly ([#6700](https://github.com/shaka-project/shaka-player/issues/6700)) ([082f897](https://github.com/shaka-project/shaka-player/commit/082f89770165963cda5797bbe51966c72f6d4535))
* Improve default retry delay for Low Latency ([#6514](https://github.com/shaka-project/shaka-player/issues/6514)) ([5f8e7fd](https://github.com/shaka-project/shaka-player/commit/5f8e7fdd055b5ec09d7baff96138ee9b445c00ac))
* Optionally force HTTP content URIs ([#6649](https://github.com/shaka-project/shaka-player/issues/6649)) ([dda713a](https://github.com/shaka-project/shaka-player/commit/dda713aa71289da7282dfc131bdc870b78c918c7))
* Parse colorGamut and use it in MCap ([#6663](https://github.com/shaka-project/shaka-player/issues/6663)) ([329d42a](https://github.com/shaka-project/shaka-player/commit/329d42ad56b23d4b075349de72672d16f4d4bb80))
* Preload AES key when the key is available in EXT-X-SESSION-KEY ([#6495](https://github.com/shaka-project/shaka-player/issues/6495)) ([57cb6ad](https://github.com/shaka-project/shaka-player/commit/57cb6ad595d75ae0b36b9bb1ed99f896941c72ba))
* **Preload:** Add detachAndSavePreload method ([#6630](https://github.com/shaka-project/shaka-player/issues/6630)) ([0a68e93](https://github.com/shaka-project/shaka-player/commit/0a68e934fde7016286ed40e23eb5f41df59c63bd))
* Set autoCorrectDrift to false by default for low latency streaming ([#6549](https://github.com/shaka-project/shaka-player/issues/6549)) ([3d1c546](https://github.com/shaka-project/shaka-player/commit/3d1c5467e6c936c4620ae930332c62eeabe54841))
* Set maxDisabledTime to 1 by default for low latency streaming ([#6617](https://github.com/shaka-project/shaka-player/issues/6617)) ([1cdbbe0](https://github.com/shaka-project/shaka-player/commit/1cdbbe0f30c36ca95b6b0f6c1696af3d6c192844))
* **UI:** List bandwidth for duplicate resolutions ([#6548](https://github.com/shaka-project/shaka-player/issues/6548)) ([a9d5dc3](https://github.com/shaka-project/shaka-player/commit/a9d5dc399168cb8f9ab5ab0abdbef41e31e2942d)), closes [#6494](https://github.com/shaka-project/shaka-player/issues/6494)


### Bug Fixes

* Add timeout to fullyLoaded in src= ([#6676](https://github.com/shaka-project/shaka-player/issues/6676)) ([64e4fd8](https://github.com/shaka-project/shaka-player/commit/64e4fd8e922224d7acadf67f51d92330167c9c57))
* **Ads:** Fix CS destroy ([#6624](https://github.com/shaka-project/shaka-player/issues/6624)) ([0e9c2d8](https://github.com/shaka-project/shaka-player/commit/0e9c2d89671cdda434cd05d2edd0989bcc54ba21))
* Ban smooth codec switching on Tizen 5 & 6 ([#6686](https://github.com/shaka-project/shaka-player/issues/6686)) ([c541515](https://github.com/shaka-project/shaka-player/commit/c541515995f630573fa545f8478e65fb15585019))
* **Cast:** Incorrect detection of MediaCapabilities on Chromecast ([#6656](https://github.com/shaka-project/shaka-player/issues/6656)) ([00c5c1d](https://github.com/shaka-project/shaka-player/commit/00c5c1da1652622a3098b64e50ec74d214534597))
* **CEA:** Fix stream detection when the stream has not control codes ([#6703](https://github.com/shaka-project/shaka-player/issues/6703)) ([dd5658b](https://github.com/shaka-project/shaka-player/commit/dd5658bc3beaa0182c3e9e522a65f0a1b6e8773f))
* **CEA:** Ignore XDS control codes ([#6702](https://github.com/shaka-project/shaka-player/issues/6702)) ([f69694a](https://github.com/shaka-project/shaka-player/commit/f69694a37f2b3b44a761cdf98937c4a3e9e1f3cb))
* **CEA:** reset PTS on new init segment ([#6606](https://github.com/shaka-project/shaka-player/issues/6606)) ([024cb9b](https://github.com/shaka-project/shaka-player/commit/024cb9b96658e9fa9cf436d16e0888c8d6ffac23))
* **CEA:** reset PTS on new init segment ([#6671](https://github.com/shaka-project/shaka-player/issues/6671)) ([bcc6791](https://github.com/shaka-project/shaka-player/commit/bcc6791c5f96333999056e8f884761c32e100402))
* Clear preload array before awaiting destroy ([#6584](https://github.com/shaka-project/shaka-player/issues/6584)) ([be60f40](https://github.com/shaka-project/shaka-player/commit/be60f40cd71b5782d8386c73a0d426fa8e60dded))
* **DASH:** decrease memory preasure on manifest with SegmentReference by updating old initSegmentReference ([#6499](https://github.com/shaka-project/shaka-player/issues/6499)) ([2dd85e4](https://github.com/shaka-project/shaka-player/commit/2dd85e4e23773bd4ca353f38706066fc0415d231))
* **DASH:** Firefox multi-period/multi-codec bug ([#6691](https://github.com/shaka-project/shaka-player/issues/6691)) ([b3cacad](https://github.com/shaka-project/shaka-player/commit/b3cacadd162d2d0768d003e392c2c5611713354a)), closes [#6690](https://github.com/shaka-project/shaka-player/issues/6690)
* **DASH:** Fix get partial current position for LL when using SegmentTemplate@duration ([#6516](https://github.com/shaka-project/shaka-player/issues/6516)) ([6c47f8b](https://github.com/shaka-project/shaka-player/commit/6c47f8be65d19f4539dd1807f62822ab7258aab4))
* **DASH:** Fix unescape UTCTiming uris ([#6501](https://github.com/shaka-project/shaka-player/issues/6501)) ([27109fe](https://github.com/shaka-project/shaka-player/commit/27109feafac652348949bbea05e0a2a91bbb734b))
* **DASH:** Fix update of SegmentTemplate with $number$ for LL ([#6687](https://github.com/shaka-project/shaka-player/issues/6687)) ([c574be4](https://github.com/shaka-project/shaka-player/commit/c574be43770fa9be3e67e4912999eaa9dfdc582d))
* Destroy preload managers on player destroy ([#6576](https://github.com/shaka-project/shaka-player/issues/6576)) ([265784e](https://github.com/shaka-project/shaka-player/commit/265784eae16e32ae5695bafe77dc522ca9c7728d))
* Disallow Object.fromEntries in Tizen ([#6634](https://github.com/shaka-project/shaka-player/issues/6634)) ([11272a3](https://github.com/shaka-project/shaka-player/commit/11272a3feeb6214f50f94b9e8e6fee90b81f3519))
* Do not assume 1080p Cast devices, some are 720p ([#6562](https://github.com/shaka-project/shaka-player/issues/6562)) ([4498dcd](https://github.com/shaka-project/shaka-player/commit/4498dcde28995e3909714dcfdd996970922df038))
* Enable SMOOTH codec switching on Fuchsia cast devices ([#6609](https://github.com/shaka-project/shaka-player/issues/6609)) ([f1d620c](https://github.com/shaka-project/shaka-player/commit/f1d620cb23d6556d8a044c036f1c4db0f8c8f977))
* Fix COLR box parsing ([#6699](https://github.com/shaka-project/shaka-player/issues/6699)) ([2b358c5](https://github.com/shaka-project/shaka-player/commit/2b358c5c8eb879237ae43ea2a7147cea8ea9fae8))
* Fix default value of liveSyncMinPlaybackRate ([#6685](https://github.com/shaka-project/shaka-player/issues/6685)) ([a219e2f](https://github.com/shaka-project/shaka-player/commit/a219e2f3376444ee522f51d081ece5c9fc1ad45d))
* Fix deprecation warning for manifestPreprocessor that is always logged ([#6496](https://github.com/shaka-project/shaka-player/issues/6496)) ([0873d1e](https://github.com/shaka-project/shaka-player/commit/0873d1ecdd94d3a9b5562c29445c3c52e180d76d))
* Fix flac detection in Safari ([#6497](https://github.com/shaka-project/shaka-player/issues/6497)) ([0e00d65](https://github.com/shaka-project/shaka-player/commit/0e00d6551fbe60efefe3e47581aec25da6972511))
* Fix inefficient buffering behavior with negative trick play rate ([#6489](https://github.com/shaka-project/shaka-player/issues/6489)) ([a57002b](https://github.com/shaka-project/shaka-player/commit/a57002b4869348c62fbd9da4cc898558e14a2449))
* Fix init segment equality in Segment Prefetch ([#6537](https://github.com/shaka-project/shaka-player/issues/6537)) ([ce7cef4](https://github.com/shaka-project/shaka-player/commit/ce7cef4d00f63077f01e6c3f74dbf1ab3526be6b))
* Fix internal network filter for HEAD requests ([#6660](https://github.com/shaka-project/shaka-player/issues/6660)) ([d816e7c](https://github.com/shaka-project/shaka-player/commit/d816e7c04247e189eb70b0ea17103c9827db3997))
* Fix MCap checking when using src= ([#6675](https://github.com/shaka-project/shaka-player/issues/6675)) ([54234f1](https://github.com/shaka-project/shaka-player/commit/54234f1e7adc919b22b27f8302eaf3d099da9f94))
* Fix multi-codec filtering on DASH live ([#6647](https://github.com/shaka-project/shaka-player/issues/6647)) ([9071002](https://github.com/shaka-project/shaka-player/commit/90710023466dcad4d1d14a2869ae50e8da4e93ee))
* Fix numBytesRemaining when the request is done ([#6653](https://github.com/shaka-project/shaka-player/issues/6653)) ([812163a](https://github.com/shaka-project/shaka-player/commit/812163a9862ae0da3550bb95bda481cc28f13a71))
* Fix Opus support in Safari ([#6607](https://github.com/shaka-project/shaka-player/issues/6607)) ([0a4c9d1](https://github.com/shaka-project/shaka-player/commit/0a4c9d1973cb191d434acfa4f355261fd6b96f38))
* Fix progress events for VOD when using vodDynamicPlaybackRate ([#6688](https://github.com/shaka-project/shaka-player/issues/6688)) ([95d3c4a](https://github.com/shaka-project/shaka-player/commit/95d3c4a039aeb774d87bc662018c26c2a04681ca))
* Fix seeking timeouts ([#6539](https://github.com/shaka-project/shaka-player/issues/6539)) ([fda3c8f](https://github.com/shaka-project/shaka-player/commit/fda3c8f7e7f3ae60bedac96fc7e0db2d7adf6a0d)), closes [#5202](https://github.com/shaka-project/shaka-player/issues/5202)
* Fix tXml conversion to DOMElement ([#6538](https://github.com/shaka-project/shaka-player/issues/6538)) ([d494068](https://github.com/shaka-project/shaka-player/commit/d4940681dd40a88e3f89b6ba423a3456b4abd38e))
* Handle non existing navigator.platform string ([#6517](https://github.com/shaka-project/shaka-player/issues/6517)) ([#6518](https://github.com/shaka-project/shaka-player/issues/6518)) ([f337e06](https://github.com/shaka-project/shaka-player/commit/f337e06bdab676048eb9d0aa5faf172a09d06a1c))
* **HLS:** Fix bad detection in some MediaPlaylist ([#6608](https://github.com/shaka-project/shaka-player/issues/6608)) ([c5af5c7](https://github.com/shaka-project/shaka-player/commit/c5af5c776fba48c52d793421bbf73bcfd62f7f0a))
* **HLS:** Fix HLS load when using #EXT-X-I-FRAME-STREAM-INF without resolution ([#6680](https://github.com/shaka-project/shaka-player/issues/6680)) ([e51cd3b](https://github.com/shaka-project/shaka-player/commit/e51cd3b744e9a3b2d0170e302fd8d7143c15e170))
* **HLS:** Fix mimetype checking when using SUPPLEMENTAL-CODECS ([#6597](https://github.com/shaka-project/shaka-player/issues/6597)) ([5a90547](https://github.com/shaka-project/shaka-player/commit/5a90547160fdebdaeb46e8669843b946ac530d08)), closes [#6586](https://github.com/shaka-project/shaka-player/issues/6586)
* **HLS:** Support request byterange on media playlist detection ([#6629](https://github.com/shaka-project/shaka-player/issues/6629)) ([d66446f](https://github.com/shaka-project/shaka-player/commit/d66446f54fa55b0b15c4e6dc2feb18ff4af05012))
* Issue with compiler minifying webOS device properties ([#6558](https://github.com/shaka-project/shaka-player/issues/6558)) ([61ce88b](https://github.com/shaka-project/shaka-player/commit/61ce88b2f52cfa079595c89a3a6a39b1c055dc6c))
* Make UITextDisplayer constructor backward compatible ([#6532](https://github.com/shaka-project/shaka-player/issues/6532)) ([d564be8](https://github.com/shaka-project/shaka-player/commit/d564be8e8903ca1e825303a1f3c1e8369b2a5297))
* patch `setServerCertificate()` on older Tizens & webOS ([#6696](https://github.com/shaka-project/shaka-player/issues/6696)) ([9e26166](https://github.com/shaka-project/shaka-player/commit/9e26166c40a65997c30e79f9773d8a177385d360))
* **preload:** Copy net filters to preload manager ([#6709](https://github.com/shaka-project/shaka-player/issues/6709)) ([1cfb53e](https://github.com/shaka-project/shaka-player/commit/1cfb53e6482fd41620663d2daf56ab541ad83241)), closes [#6698](https://github.com/shaka-project/shaka-player/issues/6698)
* Re-add setting playbackRate to 0 to control buffering state ([#6546](https://github.com/shaka-project/shaka-player/issues/6546)) ([8232c60](https://github.com/shaka-project/shaka-player/commit/8232c600ce2fe6b62a76f19e900cf75a65565085))
* Remove preloaded segment when segment has network error ([#6515](https://github.com/shaka-project/shaka-player/issues/6515)) ([2f5062a](https://github.com/shaka-project/shaka-player/commit/2f5062a41724dad77bdf35591e9936657f4f1f25))
* **UI:** Allow show same resolution with different video bandwidth ([#6536](https://github.com/shaka-project/shaka-player/issues/6536)) ([9fb9b26](https://github.com/shaka-project/shaka-player/commit/9fb9b26b94a85fea3244a4c6b63fc0f7b22adba3))
* **UI:** Fix dragging the seek bar seeks and pans the view in VR mode ([#6677](https://github.com/shaka-project/shaka-player/issues/6677)) ([e3f85eb](https://github.com/shaka-project/shaka-player/commit/e3f85eb0edb8edd6c26f4d2b97d609bb08187df5))
* **UI:** Fix unhandled error when playing VR ([#6679](https://github.com/shaka-project/shaka-player/issues/6679)) ([35cd411](https://github.com/shaka-project/shaka-player/commit/35cd411ca3d7f957bdd8c47155b30720d643b927))
* Xbox - round gap jumping values ([#6695](https://github.com/shaka-project/shaka-player/issues/6695)) ([5b6e340](https://github.com/shaka-project/shaka-player/commit/5b6e340f592649695a0ac068d1cb7e34c767f301))

## [4.8.0](https://github.com/shaka-project/shaka-player/compare/v4.7.0...v4.8.0) (2024-04-26)


### Features

* **ABR:** Additional request information for ABR Managers ([#6313](https://github.com/shaka-project/shaka-player/issues/6313)) ([6c4333c](https://github.com/shaka-project/shaka-player/commit/6c4333c56506a67384672bc0cb7ac05e26025f14))
* add `mediaSource.addExtraFeaturesToSourceBuffer` ([#6362](https://github.com/shaka-project/shaka-player/issues/6362)) ([d0aa697](https://github.com/shaka-project/shaka-player/commit/d0aa69724bbdb257b1f3d7825e3ab3e6acce4b3f)), closes [#6358](https://github.com/shaka-project/shaka-player/issues/6358)
* add a live sync panic mode ([#6149](https://github.com/shaka-project/shaka-player/issues/6149)) ([65981e2](https://github.com/shaka-project/shaka-player/commit/65981e2aaea659f87e1133365239369ccb501764))
* add an option specifying when source buffer removals happen ([#6242](https://github.com/shaka-project/shaka-player/issues/6242)) ([93d616e](https://github.com/shaka-project/shaka-player/commit/93d616e9543b0c54f8b65695e713b9f710d1623b))
* Add bytesDownloaded to stats ([#6469](https://github.com/shaka-project/shaka-player/issues/6469)) ([d532bf4](https://github.com/shaka-project/shaka-player/commit/d532bf44c7a417c9fa61ae30f23c60fb026eaa99))
* Add config to set live stream duration to Infinity ([#6207](https://github.com/shaka-project/shaka-player/issues/6207)) ([de2957e](https://github.com/shaka-project/shaka-player/commit/de2957e8fa417f1bf741b2cb4da5f68adf3cc221))
* Add disableTextPrefetch config ([#6197](https://github.com/shaka-project/shaka-player/issues/6197)) ([202f308](https://github.com/shaka-project/shaka-player/commit/202f3082fd792f0d3346d4691fc8b64b44db46e0))
* Add encryptionScheme support on MCap polyfill ([#6482](https://github.com/shaka-project/shaka-player/issues/6482)) ([5a0e60a](https://github.com/shaka-project/shaka-player/commit/5a0e60ac0b63fa6219362ab48f96d002983559c5))
* Add encryptionScheme to shaka.extern.DrmInfo ([#6480](https://github.com/shaka-project/shaka-player/issues/6480)) ([c6c39df](https://github.com/shaka-project/shaka-player/commit/c6c39dfafc80ab2b02e4dd91c7451227e95bb0a1))
* add includeKeys to CMCD config to allow filtering of CMCD data ([#6248](https://github.com/shaka-project/shaka-player/issues/6248)) ([5a025fb](https://github.com/shaka-project/shaka-player/commit/5a025fbccd538d3e95a3fe6a878a398c93d4ae9e))
* Add Opus TS transmuxer ([#6387](https://github.com/shaka-project/shaka-player/issues/6387)) ([3b5a71c](https://github.com/shaka-project/shaka-player/commit/3b5a71c5bf34c88b3b020e558fbecdbeb69d1e64))
* Add preload system to player ([#5897](https://github.com/shaka-project/shaka-player/issues/5897)) ([489b11a](https://github.com/shaka-project/shaka-player/commit/489b11a959cfb1ec50a430baabf61821869b1b04)), closes [#880](https://github.com/shaka-project/shaka-player/issues/880)
* Add segmentData info to SegmentReference ([#6370](https://github.com/shaka-project/shaka-player/issues/6370)) ([2bb6dbc](https://github.com/shaka-project/shaka-player/commit/2bb6dbc56d1ed58071052487632c1f217f70471a))
* Add support for Dolby Vision based on AVC and AV1 ([#6154](https://github.com/shaka-project/shaka-player/issues/6154)) ([c100053](https://github.com/shaka-project/shaka-player/commit/c100053532d6ca40f07f4492b3deb34aeda68281))
* Add TextDisplayer config ([#6477](https://github.com/shaka-project/shaka-player/issues/6477)) ([de2a2d8](https://github.com/shaka-project/shaka-player/commit/de2a2d885f50ecdbebef9f5886bc90b232a20533))
* Add unloadAndSavePreload ([#6214](https://github.com/shaka-project/shaka-player/issues/6214)) ([0d929ca](https://github.com/shaka-project/shaka-player/commit/0d929caedb47c000c0e6f2cfa637d3698bcaf55f))
* **Ads:** Add ability to set tracking URL for Media Tailor ([#6365](https://github.com/shaka-project/shaka-player/issues/6365)) ([b51e661](https://github.com/shaka-project/shaka-player/commit/b51e6615ed43ed875928296fe97a13ba8ba2b561))
* **Ads:** Skip play detection in some devices ([#6443](https://github.com/shaka-project/shaka-player/issues/6443)) ([91f74e7](https://github.com/shaka-project/shaka-player/commit/91f74e793e411986363c410e6c3a929a82baa09c))
* Change default preferredKeySystems for Xbox and PS4 ([#6471](https://github.com/shaka-project/shaka-player/issues/6471)) ([cff3d84](https://github.com/shaka-project/shaka-player/commit/cff3d848dac711ef96606f0d3484383aeae81efc))
* **CMCD:** Add support to dl, nrr and nor parameters ([#6171](https://github.com/shaka-project/shaka-player/issues/6171)) ([8a9f17d](https://github.com/shaka-project/shaka-player/commit/8a9f17d48bef85a184d63648d47b86cc5c175375))
* **CMCD:** Add support to rtp parameter ([#6184](https://github.com/shaka-project/shaka-player/issues/6184)) ([038e894](https://github.com/shaka-project/shaka-player/commit/038e894e82a5636dd7ca6661b34770201a894edf))
* **DASH:** Add signalling the last segment number in Period ([#6416](https://github.com/shaka-project/shaka-player/issues/6416)) ([07a3241](https://github.com/shaka-project/shaka-player/commit/07a32419d3069dbf65fda8d9c56244175f934a4a))
* **DASH:** Allow PeriodCombiner for using streams once ([#6097](https://github.com/shaka-project/shaka-player/issues/6097)) ([5e3db78](https://github.com/shaka-project/shaka-player/commit/5e3db78a5e545960cf135200ca415f877ff84457))
* **DASH:** update period as part of configuration ([#6419](https://github.com/shaka-project/shaka-player/issues/6419)) ([bdabddc](https://github.com/shaka-project/shaka-player/commit/bdabddcc6b597e35b0c6aea9dedf837298efbce3))
* **demo:** Add new demo asset for multi-mimeType/codec feature ([#6349](https://github.com/shaka-project/shaka-player/issues/6349)) ([067d9ce](https://github.com/shaka-project/shaka-player/commit/067d9ce80f71b899be28c41b49b4bad17cb20427)), closes [#6010](https://github.com/shaka-project/shaka-player/issues/6010)
* **Demo:** Show APIC(ID3) as poster for audio only streams ([#6122](https://github.com/shaka-project/shaka-player/issues/6122)) ([291b497](https://github.com/shaka-project/shaka-player/commit/291b4971f92634970e26bd6b50a331e3abe2bfad))
* Detect maximum HW resolution automatically on some platforms ([#6180](https://github.com/shaka-project/shaka-player/issues/6180)) ([278c7bc](https://github.com/shaka-project/shaka-player/commit/278c7bc8cf8d4c8bfc12d4252300b9fc6095c4a0))
* Escape html codes when getting node contents ([#6198](https://github.com/shaka-project/shaka-player/issues/6198)) ([a1c1620](https://github.com/shaka-project/shaka-player/commit/a1c1620f09a35b53ce93feb098b5fd6388c5c3f8))
* Evict instead delete on prefetch ([#6404](https://github.com/shaka-project/shaka-player/issues/6404)) ([0fc5814](https://github.com/shaka-project/shaka-player/commit/0fc5814c6af20a861e4be22bd25dc09990821592))
* Expose PresentationTimeline segment availability duration through Player ([#6075](https://github.com/shaka-project/shaka-player/issues/6075)) ([8ff5b59](https://github.com/shaka-project/shaka-player/commit/8ff5b5916c474836e201dbec5fecede0bb4c40b2))
* **HLS:** Add AES-256 and AES-256-CTR support ([#6002](https://github.com/shaka-project/shaka-player/issues/6002)) ([c3380ce](https://github.com/shaka-project/shaka-player/commit/c3380ced14df146d8a7c5164bcdeb54136f33e48))
* **HLS:** Add automatically keyId-key for identity format ([#6308](https://github.com/shaka-project/shaka-player/issues/6308)) ([d251649](https://github.com/shaka-project/shaka-player/commit/d2516498d2add42cf3157b9a6b0a3fa475ade653))
* **HLS:** Add ignoreManifestProgramDateTimeForTypes ([#6372](https://github.com/shaka-project/shaka-player/issues/6372)) ([03bb463](https://github.com/shaka-project/shaka-player/commit/03bb463a724483c88df818b11c807a0fdc11cccb))
* **HLS:** Add support for SUPPLEMENTAL-CODECS ([#6155](https://github.com/shaka-project/shaka-player/issues/6155)) ([8d6ad7e](https://github.com/shaka-project/shaka-player/commit/8d6ad7ed64b27d5fb5f481dcc41cb068875999dc))
* **HLS:** Create segmentIndex when there is only one variant ([#6383](https://github.com/shaka-project/shaka-player/issues/6383)) ([3ba7492](https://github.com/shaka-project/shaka-player/commit/3ba7492584d1db3742720248ed897a47cbb6bb5d))
* Make getPlayheadTimeAsDate and getPresentationStartTimeAsDate available for VOD ([#6417](https://github.com/shaka-project/shaka-player/issues/6417)) ([986071b](https://github.com/shaka-project/shaka-player/commit/986071b7688536a1906cb3abdc17489d9cdd0eb9))
* Parse avcC, hvcC and dvcC boxes ([#6146](https://github.com/shaka-project/shaka-player/issues/6146)) ([b8520ed](https://github.com/shaka-project/shaka-player/commit/b8520ed9778b52c898a9d572b4892a8634b07376))
* Parse colr box ([#6438](https://github.com/shaka-project/shaka-player/issues/6438)) ([b8b1aa6](https://github.com/shaka-project/shaka-player/commit/b8b1aa648bfcf5b7a530d4ef6cb2f0a48c3e6337))
* Parse vpcC and av1C boxes ([#6157](https://github.com/shaka-project/shaka-player/issues/6157)) ([151b29c](https://github.com/shaka-project/shaka-player/commit/151b29c3c70381f4db761502b56377d43b5feff8))
* Parse XPath ([#6470](https://github.com/shaka-project/shaka-player/issues/6470)) ([0883c32](https://github.com/shaka-project/shaka-player/commit/0883c32ce650b1fc4c47453fc4f1cf22e281cca1))
* Prefer MSE HLS over native HLS in Apple platform when not encrypted ([#6188](https://github.com/shaka-project/shaka-player/issues/6188)) ([fc38aee](https://github.com/shaka-project/shaka-player/commit/fc38aeebe364a28efc710917745dcfa4b1fd3c14))
* prefetch audio languages. ([#6139](https://github.com/shaka-project/shaka-player/issues/6139)) ([a8ab0c8](https://github.com/shaka-project/shaka-player/commit/a8ab0c824b7e777e429401c294b7629d23cc0f78)), closes [#6128](https://github.com/shaka-project/shaka-player/issues/6128)
* Remove com.adobe.primetime keysystem ([#6189](https://github.com/shaka-project/shaka-player/issues/6189)) ([47602c6](https://github.com/shaka-project/shaka-player/commit/47602c6f5eda7ad5c5768f418c3825c40bf4ddcf))
* Rename aes128Key to aesKey to allow aes256 in the future ([#5990](https://github.com/shaka-project/shaka-player/issues/5990)) ([31c06ca](https://github.com/shaka-project/shaka-player/commit/31c06ca1891512ed4280a34c6a1f17df76bbfe1e))
* Replace native DOM Parser with a more performant one ([#6063](https://github.com/shaka-project/shaka-player/issues/6063)) ([7116a34](https://github.com/shaka-project/shaka-player/commit/7116a34ec207a42921fe1c6404d5e3af404dc294))
* SegmentIndex minimal interface ([#6095](https://github.com/shaka-project/shaka-player/issues/6095)) ([f064811](https://github.com/shaka-project/shaka-player/commit/f064811e21a678fbd0c73e6a2d1704d8b39b5165))
* Set updateIntervalSeconds to 0.1 by default for low latency streaming ([#6403](https://github.com/shaka-project/shaka-player/issues/6403)) ([9838622](https://github.com/shaka-project/shaka-player/commit/98386222599380b0034c17f336f7eb677ecd5a3c))
* **text:** Add MediaSource.modifyCueCallback ([#6167](https://github.com/shaka-project/shaka-player/issues/6167)) ([bd944d1](https://github.com/shaka-project/shaka-player/commit/bd944d15dbfb7a8ee2db92e605bdf978d79b014a))
* **text:** Add time context to modifyCueCallback ([#6252](https://github.com/shaka-project/shaka-player/issues/6252)) ([03633e4](https://github.com/shaka-project/shaka-player/commit/03633e47bb3036c2b5fbd60461c7171c1e4ea0ee))
* Trigger an event with spatial video info ([#6437](https://github.com/shaka-project/shaka-player/issues/6437)) ([d8d96c8](https://github.com/shaka-project/shaka-player/commit/d8d96c8546cd21e9f74ed1f3ee820963c2800cdb))
* **UI:** Add config for refreshTickInSeconds ([#6386](https://github.com/shaka-project/shaka-player/issues/6386)) ([dbdef5d](https://github.com/shaka-project/shaka-player/commit/dbdef5df3a405637c4109fd6d07b952ddc94b863))
* **UI:** Allow show/hide ui programmatically ([#6117](https://github.com/shaka-project/shaka-player/issues/6117)) ([4e599cb](https://github.com/shaka-project/shaka-player/commit/4e599cb4a46ca7851b74a9ddf2d722884d3d4db8))
* **UI:** Disable forward and rewind with arrows while seekbar not active ([#6049](https://github.com/shaka-project/shaka-player/issues/6049)) ([c189922](https://github.com/shaka-project/shaka-player/commit/c189922f8d921bf91b88ca5af3bedd71cb3b77e9))
* **UI:** Hide resolution overflow menu button if there's only one choice ([#6004](https://github.com/shaka-project/shaka-player/issues/6004)) ([8649e7e](https://github.com/shaka-project/shaka-player/commit/8649e7ebbdb173d70741ec5e7400bbcbf2019710))
* **UI:** Separate trackLabelFormat settings for text tracks and audio tracks ([#6052](https://github.com/shaka-project/shaka-player/issues/6052)) ([a94a602](https://github.com/shaka-project/shaka-player/commit/a94a60213dd7e84473c3f3c8bcfef861a6c939b8))
* **UI:** UI support for VR content ([#6450](https://github.com/shaka-project/shaka-player/issues/6450)) ([95c6a7d](https://github.com/shaka-project/shaka-player/commit/95c6a7dda3852860b709de0bbd93870f15b4e139))
* **UI:** Use the same logic to group variants into audio and quality selectors ([#6069](https://github.com/shaka-project/shaka-player/issues/6069)) ([eabfc47](https://github.com/shaka-project/shaka-player/commit/eabfc472aefd7419e9d6c7189524ca920d83ec33))
* **UI:** Use the same logic to group variants into audio and quality selectors ([#6096](https://github.com/shaka-project/shaka-player/issues/6096)) ([c596677](https://github.com/shaka-project/shaka-player/commit/c596677e4a3e59390225324e95968d0555c352d0))
* Update for LCEVC Integration with new features added. ([#6263](https://github.com/shaka-project/shaka-player/issues/6263)) ([7b717e5](https://github.com/shaka-project/shaka-player/commit/7b717e513d46d9b27982db0e432beda8f9b09cd2))
* vod dynamic playback rate buffer control ([#6172](https://github.com/shaka-project/shaka-player/issues/6172)) ([8fc292b](https://github.com/shaka-project/shaka-player/commit/8fc292bc28a99e715e4fa453b17865eecdb2e4b5))
* **WebVTT:** Handle badly formed VTT ([#6147](https://github.com/shaka-project/shaka-player/issues/6147)) ([335eab0](https://github.com/shaka-project/shaka-player/commit/335eab08ba5eb4970e1ff51f1f211dce25321fe6))
* **WebVTT:** Remove un-needed VTT payload normalisation ([#6145](https://github.com/shaka-project/shaka-player/issues/6145)) ([ee600c4](https://github.com/shaka-project/shaka-player/commit/ee600c4fd555850ffdc98a958627401a1c04b03d))


### Bug Fixes

* AC-3 audio codec support on Tizen ([#6166](https://github.com/shaka-project/shaka-player/issues/6166)) ([08cc34a](https://github.com/shaka-project/shaka-player/commit/08cc34a5322a4fdbabe4d80cf6b1c2a1d473f794))
* Add LOAS-AAC detection in TS ([#6390](https://github.com/shaka-project/shaka-player/issues/6390)) ([535d386](https://github.com/shaka-project/shaka-player/commit/535d386ec80576fbb9882fabde3ff0c912253942))
* Add ManagedMediaSource support in MediaSource polyfill ([#6361](https://github.com/shaka-project/shaka-player/issues/6361)) ([12bf642](https://github.com/shaka-project/shaka-player/commit/12bf6428e00b93cc2cf9cefcf4db39fe9c749ee3))
* add missing properties to PlayButton type ([#6130](https://github.com/shaka-project/shaka-player/issues/6130)) ([8f0db8e](https://github.com/shaka-project/shaka-player/commit/8f0db8e89d1964f1f576a9f87b4added61c8136f))
* Add Opus and AV1 detection in TS ([#6385](https://github.com/shaka-project/shaka-player/issues/6385)) ([bc23fff](https://github.com/shaka-project/shaka-player/commit/bc23fffd8adc6c71eacab5f81fea73df2ca790c4))
* **Ads:** Fix ad pausing when using customPlayheadTracker ([#6444](https://github.com/shaka-project/shaka-player/issues/6444)) ([2d42933](https://github.com/shaka-project/shaka-player/commit/2d42933ea1a468eff207ed7f8b8aa73abe34618d))
* **Ads:** Fix initial ads configuration ([#6176](https://github.com/shaka-project/shaka-player/issues/6176)) ([5b141eb](https://github.com/shaka-project/shaka-player/commit/5b141eb76ac5bfb8300cdf42489ca68f7cb5bfe9))
* **Ads:** Fix muting/unmuting ads won't affect video and vice versa ([#6073](https://github.com/shaka-project/shaka-player/issues/6073)) ([01a217f](https://github.com/shaka-project/shaka-player/commit/01a217f0fd9a375647d78e2f41faab912a1c7ab7))
* **Ads:** Fix VMAP won't play in muted autoplay ([#6046](https://github.com/shaka-project/shaka-player/issues/6046)) ([a8bbbce](https://github.com/shaka-project/shaka-player/commit/a8bbbcef7b4c03b6b841a72ac564cb8e58ae804b))
* Allow by default variants without pssh in the manifest ([#6144](https://github.com/shaka-project/shaka-player/issues/6144)) ([e1cd031](https://github.com/shaka-project/shaka-player/commit/e1cd031625c5a73cc964a8d1b039f9f10f8d52ab))
* APL set-top box wrongly identifies as an Apple device. ([#6026](https://github.com/shaka-project/shaka-player/issues/6026)) ([7f5005d](https://github.com/shaka-project/shaka-player/commit/7f5005db23e2f280cee9b695d5d6432e0d402024))
* auto cancel trickPlay on live as specified ([#6100](https://github.com/shaka-project/shaka-player/issues/6100)) ([45505b0](https://github.com/shaka-project/shaka-player/commit/45505b074389c4716b6fab50cde07e176c701aca))
* avoid uiTextDisplayer.destroy crashing if called more than once ([#6022](https://github.com/shaka-project/shaka-player/issues/6022)) ([42c235d](https://github.com/shaka-project/shaka-player/commit/42c235d12318706494194fb6024f00ce161473f1))
* call to load in MediaElement using src= in HLS Safari ([#6478](https://github.com/shaka-project/shaka-player/issues/6478)) ([064c3b7](https://github.com/shaka-project/shaka-player/commit/064c3b70db8de6fd2e7195a73451cf5252e98413))
* **Cast:** Don't pause local video until the cast connection is established ([#6359](https://github.com/shaka-project/shaka-player/issues/6359)) ([ac833da](https://github.com/shaka-project/shaka-player/commit/ac833da3dc7669ba66d074f8e09129389d7bb045))
* **Cast:** Force TS content to be transmuxed on Chromecast ([#6262](https://github.com/shaka-project/shaka-player/issues/6262)) ([b8905bd](https://github.com/shaka-project/shaka-player/commit/b8905bd8d44217b80dee8bb93ad306f55c145764)), closes [#5278](https://github.com/shaka-project/shaka-player/issues/5278)
* Change quality only when adding the last partial segment and it is fast switching ([#6114](https://github.com/shaka-project/shaka-player/issues/6114)) ([48626f2](https://github.com/shaka-project/shaka-player/commit/48626f2ae0187ed12e1edbd7d8ec0be6a1cf699a))
* clear listeners when resetting media source ([#6449](https://github.com/shaka-project/shaka-player/issues/6449)) ([ab36ce7](https://github.com/shaka-project/shaka-player/commit/ab36ce73431cc801035b547f2c7f5fbd3fa2e921))
* **CMCD:** Allow reconfigure session ID ([#6177](https://github.com/shaka-project/shaka-player/issues/6177)) ([3537dc0](https://github.com/shaka-project/shaka-player/commit/3537dc0a68eeb22890ffc7e658e5eb940eb1fd43))
* **CMCD:** allow session id to be configured ([#6192](https://github.com/shaka-project/shaka-player/issues/6192)) ([78c12a6](https://github.com/shaka-project/shaka-player/commit/78c12a6265430c80568ac28193b762edce193d1f))
* **CMCD:** Fix CMCD for some mimetypes in src= ([#6178](https://github.com/shaka-project/shaka-player/issues/6178)) ([33b40cf](https://github.com/shaka-project/shaka-player/commit/33b40cfcce6909f8d05c53753fdb22d7c6606b8d))
* Correct playhead when seek beyond seekRange ([#6304](https://github.com/shaka-project/shaka-player/issues/6304)) ([a6d27a9](https://github.com/shaka-project/shaka-player/commit/a6d27a915c61d3a248927ae5676d39d1c47678f3))
* **DASH:** Check if periodCombiner_ exists before configuring ([#5998](https://github.com/shaka-project/shaka-player/issues/5998)) ([bb64cb1](https://github.com/shaka-project/shaka-player/commit/bb64cb1f0cf94624e8c4d1243c5c327b15792e1e))
* **DASH:** Fix bad error on DASH DAI ([#6047](https://github.com/shaka-project/shaka-player/issues/6047)) ([a371f43](https://github.com/shaka-project/shaka-player/commit/a371f434acca086e7e38959ef7067277c6e4a014))
* **DASH:** Fix PERIOD_FLATTENING_FAILED on fastswitching streams ([#6113](https://github.com/shaka-project/shaka-player/issues/6113)) ([af12b0b](https://github.com/shaka-project/shaka-player/commit/af12b0b3f0375241fcbd38761a7408e0a0f10ec0))
* **DASH:** Fix precision issue on some platforms ([#6258](https://github.com/shaka-project/shaka-player/issues/6258)) ([4a0d1ca](https://github.com/shaka-project/shaka-player/commit/4a0d1ca06fe54975a344c9bb745d908b2588f566))
* **DASH:** Fix support for multi-mimeType variants ([#6348](https://github.com/shaka-project/shaka-player/issues/6348)) ([1da5da9](https://github.com/shaka-project/shaka-player/commit/1da5da9790b8ba2e3e7b3d548b2e47f08e474379))
* **DASH:** Set delay to 0 for LL streams ([#6406](https://github.com/shaka-project/shaka-player/issues/6406)) ([b7b2fc9](https://github.com/shaka-project/shaka-player/commit/b7b2fc999406692716df55adae4fcca501d2a031))
* **DASH:** Update dash manifest when minimumUpdatePeriod = 0 ([#6187](https://github.com/shaka-project/shaka-player/issues/6187)) ([a332070](https://github.com/shaka-project/shaka-player/commit/a3320707b9344a84242bcdc413f1bbf23bfa49e9))
* **DASH:** Use labels to stitch streams across periods ([#6121](https://github.com/shaka-project/shaka-player/issues/6121)) ([0de7af9](https://github.com/shaka-project/shaka-player/commit/0de7af94cd995b29496705523e10cfd004c9e554))
* **Demo:** Allow play MP4 and TS in legacy iOS devices ([#6051](https://github.com/shaka-project/shaka-player/issues/6051)) ([f0751cd](https://github.com/shaka-project/shaka-player/commit/f0751cdae606f1423c56e99574a603848a0f9b2a))
* **Demo:** Fix MSS assets ([#6194](https://github.com/shaka-project/shaka-player/issues/6194)) ([844c208](https://github.com/shaka-project/shaka-player/commit/844c208d14fdfdbbba8fd1889134be80d6e89ddb))
* **demo:** Remove max height of demo config tabs ([#6324](https://github.com/shaka-project/shaka-player/issues/6324)) ([4655271](https://github.com/shaka-project/shaka-player/commit/465527186fbe94802752cdf41b6a000b479b0b01))
* Disable smooth codec switching in Edge Windows ([#6384](https://github.com/shaka-project/shaka-player/issues/6384)) ([fdc7c6c](https://github.com/shaka-project/shaka-player/commit/fdc7c6c2eb02603e0778d1d8fe84aeaae788d531))
* do not append blank codec strings ([#6093](https://github.com/shaka-project/shaka-player/issues/6093)) ([ed0aa22](https://github.com/shaka-project/shaka-player/commit/ed0aa22c48a3d90da990e86665e43468782bf66b)), closes [#6092](https://github.com/shaka-project/shaka-player/issues/6092)
* Do not make LICENSE_REQUEST_FAILED fatal if other keys are successful ([#6457](https://github.com/shaka-project/shaka-player/issues/6457)) ([a6c748a](https://github.com/shaka-project/shaka-player/commit/a6c748ad1e1df5239f743d129f0f8f54037cbe73))
* Do not use `replaceAll` in XPath parsing ([#6473](https://github.com/shaka-project/shaka-player/issues/6473)) ([bf17a34](https://github.com/shaka-project/shaka-player/commit/bf17a3401e35076b77ba2d44ceb96efc8be5c83a))
* don't double wrap URIs for HLS key requests ([#6246](https://github.com/shaka-project/shaka-player/issues/6246)) ([948660b](https://github.com/shaka-project/shaka-player/commit/948660b3590bbfacc53bdfb339f36c17dfaf338c))
* Don't retry MSE errors on startup ([#6112](https://github.com/shaka-project/shaka-player/issues/6112)) ([de7d8d3](https://github.com/shaka-project/shaka-player/commit/de7d8d3c4b38867f4547862a13d4beb10f0eff3d))
* Don't update captions when video is paused ([#6474](https://github.com/shaka-project/shaka-player/issues/6474)) ([2f653f1](https://github.com/shaka-project/shaka-player/commit/2f653f132b98499e5a28c7b3884021d47596fbee))
* ENCRYPTED CONTENT WITHOUT DRM INFO on comcast X1 due to safari blocklist ([#6034](https://github.com/shaka-project/shaka-player/issues/6034)) ([3bf0664](https://github.com/shaka-project/shaka-player/commit/3bf0664457708d0b43de8512ce5eeee8260e9f8a))
* Fix cea608 whitespace rendering ([#6329](https://github.com/shaka-project/shaka-player/issues/6329)) ([8cf9d59](https://github.com/shaka-project/shaka-player/commit/8cf9d59eac6f4ceafb66f7dc59317e372dbbc059)), closes [#6328](https://github.com/shaka-project/shaka-player/issues/6328)
* Fix compiler issue in Mp4BoxParsers ([#6312](https://github.com/shaka-project/shaka-player/issues/6312)) ([5badb6a](https://github.com/shaka-project/shaka-player/commit/5badb6aa2b8968224ce18c944cf98f39d5442270))
* Fix detection of flac support on Safari ([#6250](https://github.com/shaka-project/shaka-player/issues/6250)) ([bb712c0](https://github.com/shaka-project/shaka-player/commit/bb712c02835f1214be5f23c7f37891eb206ee8e1)), closes [#6249](https://github.com/shaka-project/shaka-player/issues/6249)
* Fix detection of spatial rendering support in Cast ([#6138](https://github.com/shaka-project/shaka-player/issues/6138)) ([4e47acd](https://github.com/shaka-project/shaka-player/commit/4e47acda0cfc704a7efba8962f3c2e8bea333f5a))
* Fix DRM workaround for Xbox with Dolby Vision boxes ([#6201](https://github.com/shaka-project/shaka-player/issues/6201)) ([d938837](https://github.com/shaka-project/shaka-player/commit/d9388378e7b6a3ef940f72b3bea5dfc3ba17cf11))
* Fix duplicate init segment download when using startAtSegmentBoundary ([#6479](https://github.com/shaka-project/shaka-player/issues/6479)) ([da7863d](https://github.com/shaka-project/shaka-player/commit/da7863ddbc8e29edcdf6f12e3ca8a8829e581d6e))
* Fix ENCA box parsing ([#6298](https://github.com/shaka-project/shaka-player/issues/6298)) ([bca9f25](https://github.com/shaka-project/shaka-player/commit/bca9f2514bc2f3ccd2a43d19907721d06d7379c7))
* Fix encryptionScheme for FairPlay ([#6483](https://github.com/shaka-project/shaka-player/issues/6483)) ([bf9787a](https://github.com/shaka-project/shaka-player/commit/bf9787a436dd6bb25b375fc305ad9092d8ba96ec))
* Fix exceptions in StreamingEngine when reloading ([#6466](https://github.com/shaka-project/shaka-player/issues/6466)) ([d570ae1](https://github.com/shaka-project/shaka-player/commit/d570ae151f84197cf2cea5cddf63bf33a8f897a7)), closes [#6458](https://github.com/shaka-project/shaka-player/issues/6458)
* Fix gitpkg.now.sh dependencies ([#6211](https://github.com/shaka-project/shaka-player/issues/6211)) ([62ab048](https://github.com/shaka-project/shaka-player/commit/62ab04895ae0e83872dc8f5143eec6ed76f29d5e))
* fix handling of multiple CC tracks ([#6076](https://github.com/shaka-project/shaka-player/issues/6076)) ([44cb8a2](https://github.com/shaka-project/shaka-player/commit/44cb8a2ed8bd5d24d90e8c2213351eef2f22841e))
* Fix HLS segment index errors and x-program-date-time errors since v4.7.4 ([fd6b3d0](https://github.com/shaka-project/shaka-player/commit/fd6b3d0d6673c552e7e6ef995fc1e379918c702d))
* Fix liveLatency in stats ([#5982](https://github.com/shaka-project/shaka-player/issues/5982)) ([00c918f](https://github.com/shaka-project/shaka-player/commit/00c918f2cce8bef5646487465adce47a4be2fb9a))
* Fix nalu parsing in TS ([#6137](https://github.com/shaka-project/shaka-player/issues/6137)) ([df8dbb9](https://github.com/shaka-project/shaka-player/commit/df8dbb9caaa2391c14288782884546c5c7b4ac69))
* Fix PES rollover in TS ([#6363](https://github.com/shaka-project/shaka-player/issues/6363)) ([e8f37f0](https://github.com/shaka-project/shaka-player/commit/e8f37f0d6c9bbcc800d17302069b2bc4e62b0f33))
* Fix playback stuck on initial gap ([#6340](https://github.com/shaka-project/shaka-player/issues/6340)) ([292ef20](https://github.com/shaka-project/shaka-player/commit/292ef20d80019191a98f64a5f6106f92277991a4)), closes [#6339](https://github.com/shaka-project/shaka-player/issues/6339)
* Fix reusing region elements in UITextDisplayer ([#6476](https://github.com/shaka-project/shaka-player/issues/6476)) ([4302a6b](https://github.com/shaka-project/shaka-player/commit/4302a6bf174cef52e3eb569340c82c2babc20c82))
* Fix SAR when transmuxing ([#6309](https://github.com/shaka-project/shaka-player/issues/6309)) ([b5d69f0](https://github.com/shaka-project/shaka-player/commit/b5d69f067a80fee2857cea7aabe31757b5a1f112))
* Fix SegmentPrefetch in some cases ([#6199](https://github.com/shaka-project/shaka-player/issues/6199)) ([b508d48](https://github.com/shaka-project/shaka-player/commit/b508d482c64542c4708734274fe47a3142ada028))
* Fix support of getAllThumbnails when using DASH multi-period ([#6464](https://github.com/shaka-project/shaka-player/issues/6464)) ([6905c74](https://github.com/shaka-project/shaka-player/commit/6905c74122dd6f5ff7f3b399e3d0717450a37bd6))
* Fix transmuxer when some PES has the same pts and dts value ([#5985](https://github.com/shaka-project/shaka-player/issues/5985)) ([165feac](https://github.com/shaka-project/shaka-player/commit/165feacb00b960aa3929b8980554155e86784af1))
* Fix uncaught global OBJECT_DESTROYED errors ([#6460](https://github.com/shaka-project/shaka-player/issues/6460)) ([32d7054](https://github.com/shaka-project/shaka-player/commit/32d7054474eebbc2a5abbae0385bfc37c8ea5be9))
* Fix untrusted types in MediaTailorAdManager ([#5996](https://github.com/shaka-project/shaka-player/issues/5996)) ([2f06039](https://github.com/shaka-project/shaka-player/commit/2f06039193b28b3d59ace8ad938ee657ddccdaee))
* Fix waiting for empty init datas ([#6292](https://github.com/shaka-project/shaka-player/issues/6292)) ([118f47f](https://github.com/shaka-project/shaka-player/commit/118f47f1ea6f83e11c5304ce5ae3b36ccb2be8f3)), closes [#6228](https://github.com/shaka-project/shaka-player/issues/6228)
* Fix webOS 4 & 5 utility methods ([#6463](https://github.com/shaka-project/shaka-player/issues/6463)) ([8c549f3](https://github.com/shaka-project/shaka-player/commit/8c549f34272ea3838dd1b703fb7ccb09d3b32de0))
* Fix wrong aspect ratio in transmuxed videos ([#6170](https://github.com/shaka-project/shaka-player/issues/6170)) ([eb1fef8](https://github.com/shaka-project/shaka-player/commit/eb1fef888b771588e05ff443d78f630a28f29bf0))
* **HLS:** Avoid duplicate AES request when using the same info ([#6118](https://github.com/shaka-project/shaka-player/issues/6118)) ([1671a3e](https://github.com/shaka-project/shaka-player/commit/1671a3e98c1218c3a23f0baa430e04c8a899b468))
* **HLS:** Avoid duplicate AES requests ([#6399](https://github.com/shaka-project/shaka-player/issues/6399)) ([ea740ba](https://github.com/shaka-project/shaka-player/commit/ea740ba2468f3b035d463ea9933aa7eeccf5c748))
* **HLS:** Ban unsupported combinations of SAMPLE-AES encryption ([#6295](https://github.com/shaka-project/shaka-player/issues/6295)) ([edbac36](https://github.com/shaka-project/shaka-player/commit/edbac3622933c041164a42e494c3895c67b6b2dc))
* **HLS:** Fix bad init segment request with byterange when using media playlist ([#6297](https://github.com/shaka-project/shaka-player/issues/6297)) ([6a8f972](https://github.com/shaka-project/shaka-player/commit/6a8f972b5d14a24086349b71ccf7f86a83fc1ab4))
* **HLS:** Fix bad warning when playing HLS-AES128 ([#6434](https://github.com/shaka-project/shaka-player/issues/6434)) ([17df192](https://github.com/shaka-project/shaka-player/commit/17df192289a74d80ec87e13a6cc1bd3bf588ba84))
* **HLS:** Fix clear init segment mapping ([#6000](https://github.com/shaka-project/shaka-player/issues/6000)) ([8a44111](https://github.com/shaka-project/shaka-player/commit/8a44111ec8e59139ceb5b5c267f2eb39f9477fab))
* **HLS:** Fix IAMF codec selection in HLS ([#6389](https://github.com/shaka-project/shaka-player/issues/6389)) ([c59a3b8](https://github.com/shaka-project/shaka-player/commit/c59a3b83a33c7ae58b5ab25c7572584e813cf48d))
* **HLS:** Fix labelling of captions in Safari ([#6426](https://github.com/shaka-project/shaka-player/issues/6426)) ([35dd543](https://github.com/shaka-project/shaka-player/commit/35dd5433eddcb1fddba45ec1f6152de1cc20e81b))
* **HLS:** Fix playback of muxed TS content in Safari ([#6045](https://github.com/shaka-project/shaka-player/issues/6045)) ([1b675cb](https://github.com/shaka-project/shaka-player/commit/1b675cb58efe90657291e47edd3ffeab493da733))
* **HLS:** Fix SAMPLE-AES playback ([#6402](https://github.com/shaka-project/shaka-player/issues/6402)) ([af88a32](https://github.com/shaka-project/shaka-player/commit/af88a32d0842be6164f1162733129255af00df79))
* **HLS:** Fix variant synchronization in HLS after selectVariantTrack ([#5984](https://github.com/shaka-project/shaka-player/issues/5984)) ([8da033f](https://github.com/shaka-project/shaka-player/commit/8da033f7c90cc38bdc06500c8f22c5b5f3823584))
* **HLS:** Fix VVC codec selection in HLS ([#6156](https://github.com/shaka-project/shaka-player/issues/6156)) ([701ec9b](https://github.com/shaka-project/shaka-player/commit/701ec9bece38d202c08db7910130616ee4be11f8))
* **HLS:** getPlayheadTimeAsDate() differs from X-EXT-PROGRAM-DATE-TIME ([#6059](https://github.com/shaka-project/shaka-player/issues/6059)) ([776b69d](https://github.com/shaka-project/shaka-player/commit/776b69dcb99e1f5dbd22181e40c22898f0b8e47a))
* **HLS:** getPlayheadTimeAsDate() differs from X-EXT-PROGRAM-DATE-TIME ([#6371](https://github.com/shaka-project/shaka-player/issues/6371)) ([c615cf4](https://github.com/shaka-project/shaka-player/commit/c615cf459a13703244595fa34198814cf330e162))
* **HLS:** Live recovery after disconnects ([#6048](https://github.com/shaka-project/shaka-player/issues/6048)) ([8476631](https://github.com/shaka-project/shaka-player/commit/847663145390f5fc0a9378c3a663ae0dbf7b506b))
* **HLS:** Only offset segment ref times when needed w/ EXT-X-MEDIA-SEQUENCE ([#6378](https://github.com/shaka-project/shaka-player/issues/6378)) ([bca6252](https://github.com/shaka-project/shaka-player/commit/bca62521bf7f8ce08b66bd31681d07a724e4dbfc))
* **HLS:** Reset textSequenceModeOffset on discontinuity ([#6388](https://github.com/shaka-project/shaka-player/issues/6388)) ([966302d](https://github.com/shaka-project/shaka-player/commit/966302d447e896f8b67ef9ea865b62775589b7b1))
* **HLS:** Set the bandwidth correctly for audio/video-only variants ([#6165](https://github.com/shaka-project/shaka-player/issues/6165)) ([658386b](https://github.com/shaka-project/shaka-player/commit/658386bf936341230c3c3015293b5f89801d0d54))
* Improved HEAD request fail test when fallback-ing to GET request ([#6044](https://github.com/shaka-project/shaka-player/issues/6044)) ([b45877d](https://github.com/shaka-project/shaka-player/commit/b45877d17bb52b7d8455ce06f010408414822979))
* Include text bandwidth in stats ([#6109](https://github.com/shaka-project/shaka-player/issues/6109)) ([4823dfe](https://github.com/shaka-project/shaka-player/commit/4823dfefea0c497adca145e50fe4500d16fc4b19))
* Install by default shaka.polyfill.PatchedMediaKeysApple when there is no unprefixed EME support ([#6053](https://github.com/shaka-project/shaka-player/issues/6053)) ([5b5b2ce](https://github.com/shaka-project/shaka-player/commit/5b5b2ce1746ea888e163dddb3d36125f03100102))
* log prefetch miss for missing segments ([#6012](https://github.com/shaka-project/shaka-player/issues/6012)) ([a70136d](https://github.com/shaka-project/shaka-player/commit/a70136d31de062367a462c6b9934616e2a029a6e))
* Looser tolerance for ending trick play at edge of seek range. ([#6422](https://github.com/shaka-project/shaka-player/issues/6422)) ([9f603ad](https://github.com/shaka-project/shaka-player/commit/9f603adefb36be001aef0c2fbea632aae4e61277)), closes [#6421](https://github.com/shaka-project/shaka-player/issues/6421)
* **offline:** Fix server certificate error when trying to delete stored content ([#6080](https://github.com/shaka-project/shaka-player/issues/6080)) ([e1eb003](https://github.com/shaka-project/shaka-player/commit/e1eb0032566547b45f3d0ae288f7186618bf7e7f))
* **offline:** Fix store persistent licenses with drm info in the pssh ([#6143](https://github.com/shaka-project/shaka-player/issues/6143)) ([5acc773](https://github.com/shaka-project/shaka-player/commit/5acc7733647009d395a0ad8d399b4d18d045b2b3))
* player Dropping Variant (better codec available) when it should not ([#6163](https://github.com/shaka-project/shaka-player/issues/6163)) ([07ebdb1](https://github.com/shaka-project/shaka-player/commit/07ebdb1d2cebe20bbaa32a3d37ebf5efd1a287e7))
* **preload:** Fix load interruption ([#6271](https://github.com/shaka-project/shaka-player/issues/6271)) ([d795a00](https://github.com/shaka-project/shaka-player/commit/d795a00d6caf133020b8a0a35fac6d5daa65c733)), closes [#6225](https://github.com/shaka-project/shaka-player/issues/6225)
* **preload:** Fix timing of call to stopQueuingLatePhaseQueuedOperations ([#6238](https://github.com/shaka-project/shaka-player/issues/6238)) ([fd57e7f](https://github.com/shaka-project/shaka-player/commit/fd57e7f48a01ffbdf296d48b80089078b410eac7)), closes [#6225](https://github.com/shaka-project/shaka-player/issues/6225)
* **preload:** Only start preload if manager exists ([#6222](https://github.com/shaka-project/shaka-player/issues/6222)) ([36b7367](https://github.com/shaka-project/shaka-player/commit/36b7367ebd3efafd6e46d8ef74758cd834aff224))
* Prevent license requests for unplayable variants ([#6204](https://github.com/shaka-project/shaka-player/issues/6204)) ([cac1fd0](https://github.com/shaka-project/shaka-player/commit/cac1fd0f7f8569161d8118c724333ef91b14bfef))
* Provide a fallback to GET request when HEAD request fails ([#5986](https://github.com/shaka-project/shaka-player/issues/5986)) ([1af93e6](https://github.com/shaka-project/shaka-player/commit/1af93e63ffa6d1e585524e66d05072579a3cd299))
* Reject Opus encrypted on Firefox Android ([#6115](https://github.com/shaka-project/shaka-player/issues/6115)) ([e692d68](https://github.com/shaka-project/shaka-player/commit/e692d68ecf2eb3697711b3ce60d1774b99748cd2))
* Reject TS content on all platforms and transmux always ([#6382](https://github.com/shaka-project/shaka-player/issues/6382)) ([7e32636](https://github.com/shaka-project/shaka-player/commit/7e32636096b493b5665175bbe704d35751ada852))
* Reset to default playback rate on release playback rate controller ([#6089](https://github.com/shaka-project/shaka-player/issues/6089)) ([23fb2f5](https://github.com/shaka-project/shaka-player/commit/23fb2f5c057beb1b69368231f408f44407d57e94))
* stay paused after codec switch ([#6108](https://github.com/shaka-project/shaka-player/issues/6108)) ([e48438f](https://github.com/shaka-project/shaka-player/commit/e48438f3f143ce6b9f2b2044d28f1c73b23b8a4d))
* text roles being combined incorrectly in some multiperiod cases ([#6055](https://github.com/shaka-project/shaka-player/issues/6055)) ([b463e39](https://github.com/shaka-project/shaka-player/commit/b463e391c3795ece7619fda617530ef7f39bf198)), closes [#6054](https://github.com/shaka-project/shaka-player/issues/6054)
* **transmuxer:** Support raw AAC with TS extension ([#6360](https://github.com/shaka-project/shaka-player/issues/6360)) ([7c6e846](https://github.com/shaka-project/shaka-player/commit/7c6e84609440d4c107d97207345c095291bcd4d5))
* **TTML:** Clip to video when extent is not present ([#6086](https://github.com/shaka-project/shaka-player/issues/6086)) ([2862228](https://github.com/shaka-project/shaka-player/commit/28622287161b50b664cbfe9b5b8b7b1d5f894e27))
* **TTML:** Fix trim surrounding spaces with xml:space="default" ([#6395](https://github.com/shaka-project/shaka-player/issues/6395)) ([bcedec3](https://github.com/shaka-project/shaka-player/commit/bcedec3a0a242a26e683b9e3c83de4b20546045e))
* **tXml:** html unescape node attributes with urls ([#6267](https://github.com/shaka-project/shaka-player/issues/6267)) ([67cd2dd](https://github.com/shaka-project/shaka-player/commit/67cd2dd29d1f281f1f4011ec2cd2a88298dfb350))
* **UI:** Disable PiP on casting ([#6110](https://github.com/shaka-project/shaka-player/issues/6110)) ([6312fa3](https://github.com/shaka-project/shaka-player/commit/6312fa31b79a9fb284cfaebacf7e70a19755dff4))
* **UI:** Fix disable PiP when using documentPictureInPicture ([#5992](https://github.com/shaka-project/shaka-player/issues/5992)) ([6229284](https://github.com/shaka-project/shaka-player/commit/622928470f5ccf3ada5e61611fd9b54a712585f0))
* **UI:** Fix keyboard navigation of volume bar on Firefox ([#5981](https://github.com/shaka-project/shaka-player/issues/5981)) ([90f1d61](https://github.com/shaka-project/shaka-player/commit/90f1d61fe0a980a2592706162de97556f25f5e17))
* **UI:** Fix replay button when the post-roll is running using CS ([#6072](https://github.com/shaka-project/shaka-player/issues/6072)) ([6b7a02a](https://github.com/shaka-project/shaka-player/commit/6b7a02ae917485b00e5c9bab407df1824d19b1a7))
* **UI:** Fix the scrolling when scrolling from the laterals when seekOnTaps is enabled ([#6050](https://github.com/shaka-project/shaka-player/issues/6050)) ([df05692](https://github.com/shaka-project/shaka-player/commit/df056925ed414e06d6a6512eeeda62e25887fe51))
* **UI:** Update the playbackrate on loaded event ([#6090](https://github.com/shaka-project/shaka-player/issues/6090)) ([9b9ff16](https://github.com/shaka-project/shaka-player/commit/9b9ff16ba73d469b5419b047db18d36c0e28b4e7))
* **VTT:** fix setting textShadow when multiple CSS classes provided ([#6287](https://github.com/shaka-project/shaka-player/issues/6287)) ([d0e64d7](https://github.com/shaka-project/shaka-player/commit/d0e64d7379d44542562ee6fad0619c0ff533813b))
* **WebVTT:** Fix multiline colored VTT subtitles ([#6394](https://github.com/shaka-project/shaka-player/issues/6394)) ([25427c7](https://github.com/shaka-project/shaka-player/commit/25427c764ed597c148263446e5706b45e28e47dd))
* **WebVTT:** Remove rollover logic because we always transmux TS ([#6397](https://github.com/shaka-project/shaka-player/issues/6397)) ([286126e](https://github.com/shaka-project/shaka-player/commit/286126edf1d3ee603f4c2994b7b886e2dcc4ebda))
* When disconnecting from chromecast, subtitles are turned off ([#6103](https://github.com/shaka-project/shaka-player/issues/6103)) ([d4cd66d](https://github.com/shaka-project/shaka-player/commit/d4cd66dd59bb6ff4c763c2cdec604d22e1592c0b))


### Performance Improvements

* **Cast:** memoize/cache canDisplayType results to reduce startup latency ([#6367](https://github.com/shaka-project/shaka-player/issues/6367)) ([30285b2](https://github.com/shaka-project/shaka-player/commit/30285b2439b7702c7e0ace737b6875f6abb13c81))
* **DRM:** pass `preferredKeySystems` to `filterManifest()` ([#6468](https://github.com/shaka-project/shaka-player/issues/6468)) ([c9b61fe](https://github.com/shaka-project/shaka-player/commit/c9b61fe35138a751f66b175b47b90ed4c80f4943))
* **HLS:** do not filter all tags to get the first tag ([#6088](https://github.com/shaka-project/shaka-player/issues/6088)) ([9802f65](https://github.com/shaka-project/shaka-player/commit/9802f65dd9fa8056d969bc228e5cfdeac2458843))
* Improve performance of addThumbnailsTrack ([#6067](https://github.com/shaka-project/shaka-player/issues/6067)) ([3a14047](https://github.com/shaka-project/shaka-player/commit/3a14047a1208a6e03431aa088030dc0cbc96952c))
* **mp4generator:** stop nesting concat in methods ([#6041](https://github.com/shaka-project/shaka-player/issues/6041)) ([f52dd2b](https://github.com/shaka-project/shaka-player/commit/f52dd2b462b1ec88650c093be8bc89cb2bc5e260))
* Optimize init segment reference comparison for common case ([#6014](https://github.com/shaka-project/shaka-player/issues/6014)) ([58d946e](https://github.com/shaka-project/shaka-player/commit/58d946e35aa611cc107b4dc77b4729cc34a5caa2))
* PeriodCombiner improvements ([#6005](https://github.com/shaka-project/shaka-player/issues/6005)) ([4022788](https://github.com/shaka-project/shaka-player/commit/4022788a1822e0df06fb70d03ed2c798c774d746))
* **transmuxer:** Improve performance on video transmuxing ([#6364](https://github.com/shaka-project/shaka-player/issues/6364)) ([d0c3d9a](https://github.com/shaka-project/shaka-player/commit/d0c3d9a05e7b8b76394abce8ab8f3df31d1243d0))
* **transmuxer:** various performance improvements ([#6003](https://github.com/shaka-project/shaka-player/issues/6003)) ([cd326e2](https://github.com/shaka-project/shaka-player/commit/cd326e269148a1c58b1f156bbe3f67ad546f22b2))
* ts parser O(n^2) performance bug. ([#6035](https://github.com/shaka-project/shaka-player/issues/6035)) ([dd50028](https://github.com/shaka-project/shaka-player/commit/dd500285c2bcb605b54f70ed27c3ea8f204c5a6d))
* **WebVTT:** Improve parsing time for unstyled payloads ([#6066](https://github.com/shaka-project/shaka-player/issues/6066)) ([9462e12](https://github.com/shaka-project/shaka-player/commit/9462e1252d49f5badddc7ec74c5950cbd46175e6))


### Reverts

* Add chapter titles and dividers on the seek bar ([#6208](https://github.com/shaka-project/shaka-player/issues/6208)) ([32f8dc5](https://github.com/shaka-project/shaka-player/commit/32f8dc5cf41d5a20858cee1c3c2c6eef29c9b524))
* Fix potential AV sync issues after seek or adaptation ([#6435](https://github.com/shaka-project/shaka-player/issues/6435)) ([73117f0](https://github.com/shaka-project/shaka-player/commit/73117f005cffdc1d2ac85b30d2cda90e751a7ba4)), closes [#5785](https://github.com/shaka-project/shaka-player/issues/5785) [#4589](https://github.com/shaka-project/shaka-player/issues/4589)
* Install by default shaka.polyfill.PatchedMediaKeysApple when there is no unprefixed EME support ([#6068](https://github.com/shaka-project/shaka-player/issues/6068)) ([3ce4399](https://github.com/shaka-project/shaka-player/commit/3ce439978d18787f7901a54b737b3c93a7164642))

## [4.7.0](https://github.com/shaka-project/shaka-player/compare/v4.6.0...v4.7.0) (2023-12-04)


### Features

* Add config to allow Media Source recoveries ([#5938](https://github.com/shaka-project/shaka-player/issues/5938)) ([0deb25b](https://github.com/shaka-project/shaka-player/commit/0deb25b57f0612a802ad8fbc8e3e379dff54a57c))
* Add config to prefer spatial audio ([#5963](https://github.com/shaka-project/shaka-player/issues/5963)) ([90bc6a7](https://github.com/shaka-project/shaka-player/commit/90bc6a7c783103aaa4fca1a6284be338f9ec7301))
* add preferred video label ([#5948](https://github.com/shaka-project/shaka-player/issues/5948)) ([503327a](https://github.com/shaka-project/shaka-player/commit/503327a0e3570372d85e5cf4af62230ede35b1bf))
* Add support for Common Media Server Data (CMSD) ([#5900](https://github.com/shaka-project/shaka-player/issues/5900)) ([966b910](https://github.com/shaka-project/shaka-player/commit/966b910edcd3fea03e0276bee1f36ad859a453f6))
* Avoid streams which cannot fit into the browser's MediaSource quota ([#5937](https://github.com/shaka-project/shaka-player/issues/5937)) ([c496aaf](https://github.com/shaka-project/shaka-player/commit/c496aafaeb505851b6606f6a9567fcaae1930ac7))
* **DASH:** Add support for location in Content Steering ([#5914](https://github.com/shaka-project/shaka-player/issues/5914)) ([8f453c2](https://github.com/shaka-project/shaka-player/commit/8f453c245fd21c907109f2982c25514869ffb2e3))
* **DASH:** Handle mixed-codec variants. ([#5950](https://github.com/shaka-project/shaka-player/issues/5950)) ([24e3255](https://github.com/shaka-project/shaka-player/commit/24e32559bff6457aa8a1b356f26d83b6a320b9b2)), closes [#5961](https://github.com/shaka-project/shaka-player/issues/5961)
* **Demo:** Add field for chapters URL when adding custom content ([#5934](https://github.com/shaka-project/shaka-player/issues/5934)) ([d1bc83d](https://github.com/shaka-project/shaka-player/commit/d1bc83dd53fb596a8ff22a111c26d2331860e303))
* **Demo:** Add field for text URL when adding custom content ([#5953](https://github.com/shaka-project/shaka-player/issues/5953)) ([5c4a3a2](https://github.com/shaka-project/shaka-player/commit/5c4a3a24558c5b443f78fb4cf234a4f3a60674f1))
* **Demo:** Use MediaSession action handler in the demo ([#5927](https://github.com/shaka-project/shaka-player/issues/5927)) ([078ab36](https://github.com/shaka-project/shaka-player/commit/078ab36201946ce3f854197e7985dbdc56c6e9dc))
* expose CEA708 window position in the cue's region ([#5924](https://github.com/shaka-project/shaka-player/issues/5924)) ([2a524bf](https://github.com/shaka-project/shaka-player/commit/2a524bf51fc613b8ebddb5794524cbb3f6366d4b))
* Fix Media Source recoveries in some cases ([#5966](https://github.com/shaka-project/shaka-player/issues/5966)) ([b2a880b](https://github.com/shaka-project/shaka-player/commit/b2a880b402dd1eeef418383f7bed1a709369d8b4))
* Improve npm package size ([#5955](https://github.com/shaka-project/shaka-player/issues/5955)) ([ca28063](https://github.com/shaka-project/shaka-player/commit/ca28063427167933fc2ef198a5622610332eefbd))
* Set baseDelay to 100 by default for low latency streaming ([#5926](https://github.com/shaka-project/shaka-player/issues/5926)) ([515a4ab](https://github.com/shaka-project/shaka-player/commit/515a4ab02b15b11ee5e6873d6eaa80cfaa472482))
* **UI:** Add double tap to forward/rewind in the video ([#5943](https://github.com/shaka-project/shaka-player/issues/5943)) ([918c30b](https://github.com/shaka-project/shaka-player/commit/918c30b25ae7d193bef82de95d6e0e807426cea9))
* **UI:** Add more keyboard shortcuts ([#5942](https://github.com/shaka-project/shaka-player/issues/5942)) ([2fcc2f8](https://github.com/shaka-project/shaka-player/commit/2fcc2f8f123a5fe4c43bdebdef7c97edd7b83cb1))
* **UI:** Hide language and resolution overflow menu button if there's only one choice ([#5928](https://github.com/shaka-project/shaka-player/issues/5928)) ([628bb63](https://github.com/shaka-project/shaka-player/commit/628bb63c4c082b44f749876cf1cb8b3f06887d0b))


### Bug Fixes

* **CEA:** Fix positioning in CEA-608 ([#5925](https://github.com/shaka-project/shaka-player/issues/5925)) ([83f6f53](https://github.com/shaka-project/shaka-player/commit/83f6f5379bfaffac0166c08c0a5e038b6b5d439f))
* **DASH:** Fix bad url when specify using a full WebVTT with BaseURL ([#5954](https://github.com/shaka-project/shaka-player/issues/5954)) ([ba85ece](https://github.com/shaka-project/shaka-player/commit/ba85ece3ac4dd8d2df788f29b8a0530ba110d234))
* **DASH:** Fix false redirect detection ([#5910](https://github.com/shaka-project/shaka-player/issues/5910)) ([3a68623](https://github.com/shaka-project/shaka-player/commit/3a686239461cd2389ebb11615cd01886421a6fdd))
* **DASH:** SegmentTemplate@media not updated after change in manifest ([#5899](https://github.com/shaka-project/shaka-player/issues/5899)) ([30de177](https://github.com/shaka-project/shaka-player/commit/30de1771cf598068f5e0b446b36f07eb12676f4d))
* **Demo:** Allow configure some missing configs ([#5918](https://github.com/shaka-project/shaka-player/issues/5918)) ([c62e38c](https://github.com/shaka-project/shaka-player/commit/c62e38c6e35bdeb2b5c6ecc68c85e9b28d13e39d))
* **Demo:** Pressing "Edit" button unstores custom asset, but does not update "stored" button ([#5936](https://github.com/shaka-project/shaka-player/issues/5936)) ([82b958f](https://github.com/shaka-project/shaka-player/commit/82b958f3e4e34d2d6952f7f425d9f47a944a1e3b))
* Fix color detection in text utils ([#5970](https://github.com/shaka-project/shaka-player/issues/5970)) ([68903e1](https://github.com/shaka-project/shaka-player/commit/68903e130ec85585211d5b89ee92d6610aa6e4b3))
* Fix ESDS box parser ([#5952](https://github.com/shaka-project/shaka-player/issues/5952)) ([7683892](https://github.com/shaka-project/shaka-player/commit/76838921065d71bf31183f5a4b7ac775f24e800b))
* Fix init segment comparison ([#5920](https://github.com/shaka-project/shaka-player/issues/5920)) ([82ab893](https://github.com/shaka-project/shaka-player/commit/82ab8937e68e2a46002794d86fea1527cbba213e))
* Fix language comparison in addTextTrackAsync ([#5904](https://github.com/shaka-project/shaka-player/issues/5904)) ([f708318](https://github.com/shaka-project/shaka-player/commit/f7083183c30339e7074d7501a94fabb4ea3166df))
* Fix reset Media Source when using mixed codecs in different containers ([#5949](https://github.com/shaka-project/shaka-player/issues/5949)) ([419b1c3](https://github.com/shaka-project/shaka-player/commit/419b1c35d8c72c77fe17cb65d43d8f1c0f24f298))
* Fix trackschanged event not fired after a license request is denied for some tracks ([#5962](https://github.com/shaka-project/shaka-player/issues/5962)) ([4eba182](https://github.com/shaka-project/shaka-player/commit/4eba182826e71040dd2ed55072ecc1a4704ce536))
* Fix transmuxer when sample has no video data ([#5933](https://github.com/shaka-project/shaka-player/issues/5933)) ([6102060](https://github.com/shaka-project/shaka-player/commit/610206002838157658bdadb608588c4430cf075d))
* **HLS:** Fix m4s extension detection ([#5951](https://github.com/shaka-project/shaka-player/issues/5951)) ([d89945f](https://github.com/shaka-project/shaka-player/commit/d89945fc78ed671caabb6d8a5a8134630d5f89b4))
* **HLS:** Provide a fallback to GET request when HEAD request fails ([#5964](https://github.com/shaka-project/shaka-player/issues/5964)) ([fb5a833](https://github.com/shaka-project/shaka-player/commit/fb5a833df86a03d9f282f37fb2a3a61e61fa9c84))
* **HLS:** Recognize CEA subtitles when CLOSED-CAPTIONS attribute is missing ([#5916](https://github.com/shaka-project/shaka-player/issues/5916)) ([58d4597](https://github.com/shaka-project/shaka-player/commit/58d45976d83d5a2b63bf1c1a2defa018fc5c5d8c))
* Only append to the buffer init segments when the segment is independent ([#5921](https://github.com/shaka-project/shaka-player/issues/5921)) ([09f2a2e](https://github.com/shaka-project/shaka-player/commit/09f2a2e887459a534d13a7b0a9c3d65c77c4a403))
* Properly size region anchor from LINE units ([#5941](https://github.com/shaka-project/shaka-player/issues/5941)) ([8b6602e](https://github.com/shaka-project/shaka-player/commit/8b6602ec7c82717a56b672e5c2697856eab44ad2))
* **UI:** Correctly display video time and duration for VOD ([#5929](https://github.com/shaka-project/shaka-player/issues/5929)) ([00ff864](https://github.com/shaka-project/shaka-player/commit/00ff864c2c948de611ab8959e35194e5d356a751))
* Unmask errors on LL ([#5908](https://github.com/shaka-project/shaka-player/issues/5908)) ([c898364](https://github.com/shaka-project/shaka-player/commit/c8983646c1d3d1721ed86a5d8376dea84835ad63))
* **WebVTT:** Fix support for line vertical alignment ([#5945](https://github.com/shaka-project/shaka-player/issues/5945)) ([9f5e461](https://github.com/shaka-project/shaka-player/commit/9f5e46190ca00b1df36d5210852962bb52aac0c4))

## [4.6.0](https://github.com/shaka-project/shaka-player/compare/v4.5.0...v4.6.0) (2023-11-16)


### Features

* Add a stub text display class ([#5804](https://github.com/shaka-project/shaka-player/issues/5804)) ([#5806](https://github.com/shaka-project/shaka-player/issues/5806)) ([700d181](https://github.com/shaka-project/shaka-player/commit/700d181a576982617b211c948d990099306e1df5))
* Add config to ignore duplicate init data ([#5853](https://github.com/shaka-project/shaka-player/issues/5853)) ([acf23f8](https://github.com/shaka-project/shaka-player/commit/acf23f86af9691932f56e126bc9bf9d25ac19ec3))
* Add partial info to shaka.media.SegmentReference ([#5822](https://github.com/shaka-project/shaka-player/issues/5822)) ([766b0a1](https://github.com/shaka-project/shaka-player/commit/766b0a139e869a01a0170260e3f87a1378ca4860))
* Add support for WPE based browsers in RDK set-top boxes ([#5852](https://github.com/shaka-project/shaka-player/issues/5852)) ([2eedb12](https://github.com/shaka-project/shaka-player/commit/2eedb12a1e76044a410e5fd97ff5bda0a5c07db0))
* Add thumbnails support in src= ([#5802](https://github.com/shaka-project/shaka-player/issues/5802)) ([88e4cd4](https://github.com/shaka-project/shaka-player/commit/88e4cd41164c75dce44745c2fe89615b5d8c50a8))
* Add video progress events ([#5850](https://github.com/shaka-project/shaka-player/issues/5850)) ([c3beee6](https://github.com/shaka-project/shaka-player/commit/c3beee6f2a5dd929da2549ebeef1ee5018beafad))
* Allow prefetch init segments ([#5825](https://github.com/shaka-project/shaka-player/issues/5825)) ([3f392c0](https://github.com/shaka-project/shaka-player/commit/3f392c00dce6c8dcd57432c16aa683936bcf16df))
* **DASH:** Add initial support for "urn:mpeg:dash:ssr:2023" ([#5762](https://github.com/shaka-project/shaka-player/issues/5762)) ([508e5cf](https://github.com/shaka-project/shaka-player/commit/508e5cfbbaa36112d1f57841d83b232d2367e5dc))
* **DASH:** Add support for Content Steering ([#5710](https://github.com/shaka-project/shaka-player/issues/5710)) ([42f491f](https://github.com/shaka-project/shaka-player/commit/42f491f782f5c2c011fd8cd5b468d627529914f2))
* **DASH:** Add support for Content Steering in AdaptationSet BaseURL ([#5884](https://github.com/shaka-project/shaka-player/issues/5884)) ([1c6f1fa](https://github.com/shaka-project/shaka-player/commit/1c6f1fa7b32d32ab71e2420ec0f57b69cdbfb82a))
* **DASH:** Add support for minimum values in service descriptions ([#5844](https://github.com/shaka-project/shaka-player/issues/5844)) ([5f94a62](https://github.com/shaka-project/shaka-player/commit/5f94a6253ba3a598fdc086a11cedd1f061c7c291))
* **Demo:** Add CBCS content to demo ([#5862](https://github.com/shaka-project/shaka-player/issues/5862)) ([9777c52](https://github.com/shaka-project/shaka-player/commit/9777c524b6d7ea8a3cf8779affb01b887b048d09))
* **Demo:** Add Content Steering assets ([#5888](https://github.com/shaka-project/shaka-player/issues/5888)) ([8e0ee8a](https://github.com/shaka-project/shaka-player/commit/8e0ee8a8a783d1b881928d96f0cb8ab96f6d2621))
* **demo:** Add icon for new demo asset ([#5866](https://github.com/shaka-project/shaka-player/issues/5866)) ([f7448b7](https://github.com/shaka-project/shaka-player/commit/f7448b7bdb19f575c92854af3f90686890ee2761))
* **Demo:** Add new 3D movie stream from Apple ([#5872](https://github.com/shaka-project/shaka-player/issues/5872)) ([a5adf31](https://github.com/shaka-project/shaka-player/commit/a5adf3176fa1b74b2d3ccda10e9144ebd6bb627c))
* **HLS:** Add new config for allow LL-HLS byterange optimization ([#5877](https://github.com/shaka-project/shaka-player/issues/5877)) ([3e91e8e](https://github.com/shaka-project/shaka-player/commit/3e91e8eb0c584b3817421a8846bceba149ffd0dd))
* **HLS:** Add new config to get codecs from media segment for playlists without CODECS attribute ([#5772](https://github.com/shaka-project/shaka-player/issues/5772)) ([80630bb](https://github.com/shaka-project/shaka-player/commit/80630bb49581b056fb84afded0ac90a53fe54c36)), closes [#5769](https://github.com/shaka-project/shaka-player/issues/5769)
* **HLS:** Add support for Content Steering ([#5881](https://github.com/shaka-project/shaka-player/issues/5881)) ([b75ca1d](https://github.com/shaka-project/shaka-player/commit/b75ca1df63181976e1a39977360d25fc9a2e43e9))
* **HLS:** Add support for mjpg I-Frames playlist ([#5856](https://github.com/shaka-project/shaka-player/issues/5856)) ([801131f](https://github.com/shaka-project/shaka-player/commit/801131f84cf0cfadf79c4d069f82e1ff4c463a00))
* **HLS:** Add support for QUERYPARAM variable type in #EXT-X-DEFINE ([#5801](https://github.com/shaka-project/shaka-player/issues/5801)) ([fda3189](https://github.com/shaka-project/shaka-player/commit/fda3189fd2fb8a89946cdb2d8fd0c57bcbed3ab6))
* **HLS:** Add support for REQ-VIDEO-LAYOUT ([#5809](https://github.com/shaka-project/shaka-player/issues/5809)) ([81fc82b](https://github.com/shaka-project/shaka-player/commit/81fc82b6b24c2f17e60e6bfe89ee6870972efd72))
* **HLS:** Build closed captions metadata for media playlist on-the-fly. ([#5811](https://github.com/shaka-project/shaka-player/issues/5811)) ([754bfac](https://github.com/shaka-project/shaka-player/commit/754bfacf077226173eb46c3938696110bcbbfc55))
* **HLS:** Improve the stream info when EXT-X-MEDIA has not uri ([#5886](https://github.com/shaka-project/shaka-player/issues/5886)) ([b5b6a0f](https://github.com/shaka-project/shaka-player/commit/b5b6a0fd8455efbc635f75dd8c477c6c59474ee3))
* **ID3:** decode APIC frames ([#5857](https://github.com/shaka-project/shaka-player/issues/5857)) ([6a862d2](https://github.com/shaka-project/shaka-player/commit/6a862d265ac3b8e713e8f86bee3c641a1f0f38e5))
* Improve latency in LL DASH streams ([#5820](https://github.com/shaka-project/shaka-player/issues/5820)) ([20b4abf](https://github.com/shaka-project/shaka-player/commit/20b4abf81674e17fe5557d2cce58611faff7094c))
* **net:** Add shaka.net.NetworkingUtils ([#5756](https://github.com/shaka-project/shaka-player/issues/5756)) ([be96fd0](https://github.com/shaka-project/shaka-player/commit/be96fd0a2b0092efaecd1a09699ce78785266f52))
* Stop setting playbackRate to 0 to control buffering state ([#5696](https://github.com/shaka-project/shaka-player/issues/5696)) ([6156dce](https://github.com/shaka-project/shaka-player/commit/6156dced6bddc5e2cd0cc52071295cff63cadfcd))
* **thumbnails:** Add Player.getAllThumbnails ([#5783](https://github.com/shaka-project/shaka-player/issues/5783)) ([9f7576b](https://github.com/shaka-project/shaka-player/commit/9f7576be32c1c5292620ca1dc36325adde493626)), closes [#5781](https://github.com/shaka-project/shaka-player/issues/5781)
* **UI:** Add chapter titles and dividers on the seek bar ([#5863](https://github.com/shaka-project/shaka-player/issues/5863)) ([c1198df](https://github.com/shaka-project/shaka-player/commit/c1198df82f44f2fa402a5ff8d933219820ac9e8e))
* **UI:** Bucketize resolution names in the UI ([#5816](https://github.com/shaka-project/shaka-player/issues/5816)) ([b56b9df](https://github.com/shaka-project/shaka-player/commit/b56b9df602dfaff5012f95acfeea329f86dde618))
* **UI:** Display frame rates in the quality selector ([#5753](https://github.com/shaka-project/shaka-player/issues/5753)) ([3096378](https://github.com/shaka-project/shaka-player/commit/30963788be1d1840f9d8671cf8e91cbeaa721f10))
* **UI:** Show the channel count in the audio selector ([#5868](https://github.com/shaka-project/shaka-player/issues/5868)) ([1681acd](https://github.com/shaka-project/shaka-player/commit/1681acdd2439a542a976abc1aa252e377e4411d6))
* Use ManagedMediaSource when available ([#5683](https://github.com/shaka-project/shaka-player/issues/5683)) ([01da5fa](https://github.com/shaka-project/shaka-player/commit/01da5fa8a4b32c14582bd3cb865b5d5eca591d7f))


### Bug Fixes

* **ABR:** Fix HLS playback after internet connection is restored ([#5879](https://github.com/shaka-project/shaka-player/issues/5879)) ([f5777e5](https://github.com/shaka-project/shaka-player/commit/f5777e5625994a6c5483a33f68d5af9dec1e1335))
* AD_STARTED fires before ad started with AWS Media Tailor ([#5855](https://github.com/shaka-project/shaka-player/issues/5855)) ([b39f334](https://github.com/shaka-project/shaka-player/commit/b39f33466ebdeb8aba2df2edd1cf16bbccbd46dd))
* Add Orange platform to requiresEncryptionInfoInAllInitSegments ([#5895](https://github.com/shaka-project/shaka-player/issues/5895)) ([9d23a87](https://github.com/shaka-project/shaka-player/commit/9d23a87f859f1bed1a2e10c2f32f18de8ce0a579))
* Allow get seekRange on manifestparsed event in some cases ([#5892](https://github.com/shaka-project/shaka-player/issues/5892)) ([606d693](https://github.com/shaka-project/shaka-player/commit/606d693900a653fcc84dac64abeb7dda974101ca))
* Allow parseXmlString when createNodeIterator is not available ([#5805](https://github.com/shaka-project/shaka-player/issues/5805)) ([ea7764d](https://github.com/shaka-project/shaka-player/commit/ea7764d0a772bca59ad78f1e3bbc9a7e2734f456))
* ban new Uint16Array(buffer) ([#5838](https://github.com/shaka-project/shaka-player/issues/5838)) ([155befb](https://github.com/shaka-project/shaka-player/commit/155befb0a0e240adc331fe4b8b1967e344e5b0df))
* CEA decoder should return early if packet is not large enough ([#5893](https://github.com/shaka-project/shaka-player/issues/5893)) ([9a694b5](https://github.com/shaka-project/shaka-player/commit/9a694b59f824f7d3bf9d7ca64364abf6e60b0de4))
* **DASH:** Fix bad url when specify MPD BaseURL and AdaptationSet BaseURL ([#5883](https://github.com/shaka-project/shaka-player/issues/5883)) ([5f891d9](https://github.com/shaka-project/shaka-player/commit/5f891d98d65805f40c9ecab7fcc60a5b1cd00c3b))
* **DASH:** Fix manifest update time for Live manifests ([#5763](https://github.com/shaka-project/shaka-player/issues/5763)) ([65449d1](https://github.com/shaka-project/shaka-player/commit/65449d1a1c43c2f0741a3e8eed620fb5a374da84))
* **DASH:** Fix manifest update time for LL-DASH ([#5736](https://github.com/shaka-project/shaka-player/issues/5736)) ([8b7141f](https://github.com/shaka-project/shaka-player/commit/8b7141f92342044c8515679f6532efe635e205dc))
* **dash:** fix race condition in segment template ([#5842](https://github.com/shaka-project/shaka-player/issues/5842)) ([8d2b657](https://github.com/shaka-project/shaka-player/commit/8d2b6574de6d0510ae752637c3507df93fbf3591))
* **DASH:** Handle minimumUpdatePeriod=0 with urn:mpeg:dash:event:2012 (EMSG) ([#5823](https://github.com/shaka-project/shaka-player/issues/5823)) ([f8438df](https://github.com/shaka-project/shaka-player/commit/f8438df7b0f2834e77685eadc6d206f251730510))
* **DASH:** Segments being fetched out of the range of the timeline ([#5889](https://github.com/shaka-project/shaka-player/issues/5889)) ([d8aa24f](https://github.com/shaka-project/shaka-player/commit/d8aa24f41d79c9efb58014c3069c5183738f26d4))
* Dispatch streamDataCallback correctly in SegmentPrefetchOperation ([#5764](https://github.com/shaka-project/shaka-player/issues/5764)) ([bab8153](https://github.com/shaka-project/shaka-player/commit/bab81537626a0662ee291e4f5bccf488fd2c1870))
* Fix bug with live start time ([#5835](https://github.com/shaka-project/shaka-player/issues/5835)) ([577d141](https://github.com/shaka-project/shaka-player/commit/577d141f42b316a6a3708e9455453b49a6386be7))
* Fix chooseCodecsAndFilterManifest for similar frameRate ([#5817](https://github.com/shaka-project/shaka-player/issues/5817)) ([8ff204d](https://github.com/shaka-project/shaka-player/commit/8ff204d49dbf5f99189cb92f4a8d3ae4dd5494d4))
* Fix chooseCodecsAndFilterManifest for some HLS manifest ([#5800](https://github.com/shaka-project/shaka-player/issues/5800)) ([51870e9](https://github.com/shaka-project/shaka-player/commit/51870e9d7cced20ee98783184b69584bea90446e))
* Fix converts legacy avc1 codec strings on transmuxer ([#5790](https://github.com/shaka-project/shaka-player/issues/5790)) ([8944ca9](https://github.com/shaka-project/shaka-player/commit/8944ca9b0ff7731889c35dbd62d6a57bd9f2060c))
* Fix crash while playing HLS AES 128 streams ([#5830](https://github.com/shaka-project/shaka-player/issues/5830)) ([64b12c1](https://github.com/shaka-project/shaka-player/commit/64b12c15792be2aa8e7f79b57f4231dfcb549fbd))
* Fix DRM workaround for Tizen and Xbox with ac-4 boxes ([#5812](https://github.com/shaka-project/shaka-player/issues/5812)) ([72a5de3](https://github.com/shaka-project/shaka-player/commit/72a5de337357fa9808509efc0e63a6b1ba4f4077))
* Fix incompatible codec is selected in Windows Edge for Widevine ([#5831](https://github.com/shaka-project/shaka-player/issues/5831)) ([5aa3597](https://github.com/shaka-project/shaka-player/commit/5aa359707469cca3cac3efdc7e7efcff1a180216))
* Fix mangled property in compiled mode in Content Steering ([#5887](https://github.com/shaka-project/shaka-player/issues/5887)) ([0e62b8e](https://github.com/shaka-project/shaka-player/commit/0e62b8e00713a0b56a5d81b9758b3b4e1d98dfcf))
* Fix missing audio streams ([#5869](https://github.com/shaka-project/shaka-player/issues/5869)) ([d6aab6b](https://github.com/shaka-project/shaka-player/commit/d6aab6befaf72eb87e431f5b27cb6c6bc368b56d))
* Fix nalu parsing and improve performance in the transmuxer ([#5846](https://github.com/shaka-project/shaka-player/issues/5846)) ([ae423b4](https://github.com/shaka-project/shaka-player/commit/ae423b4239141a62cf9d8acea622398048a60936))
* Fix selectAudioLanguage using channelsCount param ([#5875](https://github.com/shaka-project/shaka-player/issues/5875)) ([c830a99](https://github.com/shaka-project/shaka-player/commit/c830a99041e2d8d2f105ab569485c959fc8c5530))
* Fix variant filtering by preferredAudioChannelCount ([#5859](https://github.com/shaka-project/shaka-player/issues/5859)) ([51edeae](https://github.com/shaka-project/shaka-player/commit/51edeaefa02a0d01706bf2d18d601ad8d2763202))
* For text content is not necessary codec switching ([#5731](https://github.com/shaka-project/shaka-player/issues/5731)) ([bdbaae5](https://github.com/shaka-project/shaka-player/commit/bdbaae5182c1f4f650822edb2a95246a918ad5df))
* **hisense:** set stallSkip to 0 for HiSense devices ([#5833](https://github.com/shaka-project/shaka-player/issues/5833)) ([c457db8](https://github.com/shaka-project/shaka-player/commit/c457db835fee8292b840dc27451424706f238d78))
* **HLS:** Fix accessibilityPurpose detection ([#5840](https://github.com/shaka-project/shaka-player/issues/5840)) ([ceaa9fa](https://github.com/shaka-project/shaka-player/commit/ceaa9faba92465bf58cd9ea78ddac77158eabac1))
* **HLS:** Fix bad detection in some MediaPlaylist ([#5878](https://github.com/shaka-project/shaka-player/issues/5878)) ([5e797bd](https://github.com/shaka-project/shaka-player/commit/5e797bd734ca95be0cf68f59022645fad8dc9077))
* **HLS:** Fix decryption of AES-128 ([#5871](https://github.com/shaka-project/shaka-player/issues/5871)) ([da38b36](https://github.com/shaka-project/shaka-player/commit/da38b362e8146521e509599f4f2cbdef41a077d8))
* **HLS:** Fix init segment when EXT-X-MAP is preceded by EXT-X-BYTERANGE ([#5732](https://github.com/shaka-project/shaka-player/issues/5732)) ([24e5de3](https://github.com/shaka-project/shaka-player/commit/24e5de34ba2bd8a1e03204a1e8b96436c6aed296))
* **HLS:** Fix kind detection for 'captions' text tracks ([#5819](https://github.com/shaka-project/shaka-player/issues/5819)) ([8e442b3](https://github.com/shaka-project/shaka-player/commit/8e442b3884cb308df69e5327d06c773c2baeff04))
* **HLS:** Fix LL-HLS with byterange optimization using segments mode ([#5876](https://github.com/shaka-project/shaka-player/issues/5876)) ([c79e5a5](https://github.com/shaka-project/shaka-player/commit/c79e5a505878084c8691d28eae0813bb1755c927))
* **HLS:** Fix url management in HLS ([#5722](https://github.com/shaka-project/shaka-player/issues/5722)) ([8deab71](https://github.com/shaka-project/shaka-player/commit/8deab717f358502b9c79a0fbd504531cc3173ddd))
* **Offline:** Fix download of some HLS manifests ([#5861](https://github.com/shaka-project/shaka-player/issues/5861)) ([c2c8320](https://github.com/shaka-project/shaka-player/commit/c2c8320251526a0e755debf5448913a2fa896371))
* **offline:** Fix server certificate error when trying to store content ([#5848](https://github.com/shaka-project/shaka-player/issues/5848)) ([f4a35f2](https://github.com/shaka-project/shaka-player/commit/f4a35f2c3fa55449c6a12dd45f207893bc9eabca))
* **TTML:** Fix support of urls in smpte:backgroundImage ([#5851](https://github.com/shaka-project/shaka-player/issues/5851)) ([fa93d53](https://github.com/shaka-project/shaka-player/commit/fa93d5353acf785e450c8e7e664f7012e0d99bdc))
* **UI:** Console error on remote.cancelwatchavailability() method in remote playback feature ([#5793](https://github.com/shaka-project/shaka-player/issues/5793)) ([b66a8e8](https://github.com/shaka-project/shaka-player/commit/b66a8e871b3d541890f1fe431eb1c4c294c26a6e))
* **UI:** Fix text selector when the trackLabelFormat is set to LABEL ([#5751](https://github.com/shaka-project/shaka-player/issues/5751)) ([bba0651](https://github.com/shaka-project/shaka-player/commit/bba0651e23bdebc5ba12dc17f7d6d2a33c0bb51a))
* UITextDisplayer font-family is overridden by UI's Roboto font ([#5829](https://github.com/shaka-project/shaka-player/issues/5829)) ([cb8a5ed](https://github.com/shaka-project/shaka-player/commit/cb8a5edd7071a504d2d0f654944d86436d2632a8))
* **WebVTT:** Fix wrong writing-mode in nested cues ([#5807](https://github.com/shaka-project/shaka-player/issues/5807)) ([ea7d83e](https://github.com/shaka-project/shaka-player/commit/ea7d83ed8760d98119e771ea0b48baa1ba4eb4ea))


### Performance Improvements

* **dash:** improve readability and reduce number of loops in dash parser ([#5768](https://github.com/shaka-project/shaka-player/issues/5768)) ([17a4363](https://github.com/shaka-project/shaka-player/commit/17a4363e331fab3c4674504e54100b354fa0f0b8))
* **DASH:** PeriodCombiner optimisations ([#5837](https://github.com/shaka-project/shaka-player/issues/5837)) ([ade93b0](https://github.com/shaka-project/shaka-player/commit/ade93b0d004b379841dfaf0bcf7e2f04b8f14345))
* **DASH:** reduce looping and remove chaining awaits in period ([#5774](https://github.com/shaka-project/shaka-player/issues/5774)) ([be755e8](https://github.com/shaka-project/shaka-player/commit/be755e899536e169a8ef524e52f384e7a6abd001))
* **HLS:** Improve detection of all partial segments ([#5761](https://github.com/shaka-project/shaka-player/issues/5761)) ([2a35579](https://github.com/shaka-project/shaka-player/commit/2a3557915f05f72cb44406eb1497a386c8fecbab))
* Improve transmuxer performance ([#5789](https://github.com/shaka-project/shaka-player/issues/5789)) ([aa41e87](https://github.com/shaka-project/shaka-player/commit/aa41e8733f04948d6370dc066a96a2d7e394bc59))
* **manifest:** avoid unnecessary looping in uri resolver ([#5773](https://github.com/shaka-project/shaka-player/issues/5773)) ([4d5caee](https://github.com/shaka-project/shaka-player/commit/4d5caee6615c04acf591d0bd04ae6ca4a1ffbdb0))
* simplify and improve performance of parsing initData when deduping ([#5775](https://github.com/shaka-project/shaka-player/issues/5775)) ([041a08f](https://github.com/shaka-project/shaka-player/commit/041a08f88d2855e9457e7853014ee10b23a7612b))
* **utils:** use WeakSet to track object references ([#5791](https://github.com/shaka-project/shaka-player/issues/5791)) ([daa9d1f](https://github.com/shaka-project/shaka-player/commit/daa9d1f206652b775c406ecb4887e0f2bc7c533f))
* **Xbox:** drop incompatible variants for XBOX early ([#5777](https://github.com/shaka-project/shaka-player/issues/5777)) ([170a40c](https://github.com/shaka-project/shaka-player/commit/170a40c3083a8e4a0c6fabcf96439c2008ffcb63))

## [4.5.0](https://github.com/shaka-project/shaka-player/compare/v4.4.0...v4.5.0) (2023-10-04)


### Features

* **ABR:** Allow some downscale when use restrictToElementSize or restrictToScreenSize ([#5631](https://github.com/shaka-project/shaka-player/issues/5631)) ([cad1ac8](https://github.com/shaka-project/shaka-player/commit/cad1ac82837123282248a0766147390d5c21bcb9))
* Add getBandwidthEstimate to the player interface for custom manifest parser ([#5714](https://github.com/shaka-project/shaka-player/issues/5714)) ([1271a18](https://github.com/shaka-project/shaka-player/commit/1271a18fec65551508a734615c9c1619ebd87e04))
* Add H.265 TS transmuxer ([#5611](https://github.com/shaka-project/shaka-player/issues/5611)) ([3c2c095](https://github.com/shaka-project/shaka-player/commit/3c2c0955cbd230f2360e2fb9d82e59cb19dab591))
* Add KeyStatusChanged and UpdateState events ([#5695](https://github.com/shaka-project/shaka-player/issues/5695)) ([2f97fa7](https://github.com/shaka-project/shaka-player/commit/2f97fa7ee3497261af038046f1de14095c6d4481))
* Add manifestupdated event ([#5602](https://github.com/shaka-project/shaka-player/issues/5602)) ([b16d2f0](https://github.com/shaka-project/shaka-player/commit/b16d2f0bf3691ef7cc2de4eea095df21814a2027))
* Add TS transmuxer for muxed content ([#5571](https://github.com/shaka-project/shaka-player/issues/5571)) ([7df3321](https://github.com/shaka-project/shaka-player/commit/7df33212726d0040ba5d5a4cc0c049f174a06c83))
* **Ads:** Add support for AWS Elemental MediaTailor ([#5679](https://github.com/shaka-project/shaka-player/issues/5679)) ([cf5a72b](https://github.com/shaka-project/shaka-player/commit/cf5a72bb513ff74e5b0f8ca7fd334313cd78370d))
* **CEA:** Parse CEA from TS with H.265 ([#5610](https://github.com/shaka-project/shaka-player/issues/5610)) ([54eaf63](https://github.com/shaka-project/shaka-player/commit/54eaf6371aeb2fb8b860d52b75a0c27555aaaaca))
* **DASH:** Add new config to prevent mixing of audio representations from different adaptation sets ([#5620](https://github.com/shaka-project/shaka-player/issues/5620)) ([0bbb470](https://github.com/shaka-project/shaka-player/commit/0bbb47025e347d321a9d764666a355b2d2a485a5))
* **DASH:** Add support for AES-128 ([#5656](https://github.com/shaka-project/shaka-player/issues/5656)) ([96ae7f2](https://github.com/shaka-project/shaka-player/commit/96ae7f2fe614402d1ee410591eb86a2868796c38))
* **DASH:** Allow the playback of DASH with $time$ and large timescale value ([#5621](https://github.com/shaka-project/shaka-player/issues/5621)) ([4a1c96e](https://github.com/shaka-project/shaka-player/commit/4a1c96e630de1ee259ed3a5ee582dddd0f844e04))
* **demo:** Added icons for new demo assets ([#5691](https://github.com/shaka-project/shaka-player/issues/5691)) ([12400b1](https://github.com/shaka-project/shaka-player/commit/12400b160b51c7ea87ecb9e8bb77ae481bb707d7))
* Enable codec switching ([#5470](https://github.com/shaka-project/shaka-player/issues/5470)) ([0078137](https://github.com/shaka-project/shaka-player/commit/0078137d1bd6bd471b5e1405e27d7fc76b5668ac))
* **HLS:** Get the correct video info for TS segments with H.265 ([#5616](https://github.com/shaka-project/shaka-player/issues/5616)) ([e191c75](https://github.com/shaka-project/shaka-player/commit/e191c755167abd8658e9e3aae35cd99d07d15ee6))
* **HLS:** Take into account the parsing time for manifest schedule update ([#5678](https://github.com/shaka-project/shaka-player/issues/5678)) ([f7e33a3](https://github.com/shaka-project/shaka-player/commit/f7e33a3ba529e13052bfaa8762b78379bb8c8e03))
* Migration of LCEVC DIL (Decoder Integration Layer) to LCEVC Dec (Decoder) ([#5459](https://github.com/shaka-project/shaka-player/issues/5459)) ([c1e18d3](https://github.com/shaka-project/shaka-player/commit/c1e18d358361392332372760b90c724047cf1310))
* **TTML:** Add support to tts:ruby ([#5645](https://github.com/shaka-project/shaka-player/issues/5645)) ([9fd220e](https://github.com/shaka-project/shaka-player/commit/9fd220e73f7ef0e9b5774717347b2d3fa7590e99))
* **TTML:** Add support to tts:textCombine ([#5644](https://github.com/shaka-project/shaka-player/issues/5644)) ([73a3bd9](https://github.com/shaka-project/shaka-player/commit/73a3bd931ebc7c9690f3d0aefb0639f2230fa594))
* **UI:** Add config to preferDocumentPictureInPicture ([#5690](https://github.com/shaka-project/shaka-player/issues/5690)) ([025502a](https://github.com/shaka-project/shaka-player/commit/025502a70c885216b9bbc063025ae80a72780fe6))
* **UI:** Add PiP function to controls ([#5629](https://github.com/shaka-project/shaka-player/issues/5629)) ([b422847](https://github.com/shaka-project/shaka-player/commit/b4228479dae3469e5a3a1e8190bef9c4e3e1a843))
* **UI:** Add remote button with RemotePlayback API ([#5650](https://github.com/shaka-project/shaka-player/issues/5650)) ([1ef5ae0](https://github.com/shaka-project/shaka-player/commit/1ef5ae0615a14baa26ff9ffa9fa5e083bfa19c7e))
* **WebVTT:** Add support to ruby, rt, rp html tags ([#5642](https://github.com/shaka-project/shaka-player/issues/5642)) ([76ffd38](https://github.com/shaka-project/shaka-player/commit/76ffd38c1d78042acac220df202a9abdd77489e9))
* **WebVTT:** Add support to text-combine-upright ([#5633](https://github.com/shaka-project/shaka-player/issues/5633)) ([a2f253f](https://github.com/shaka-project/shaka-player/commit/a2f253f8d619d2959c0195a8e1260657b5d34a3a))


### Bug Fixes

* Allow PID change in TsParser ([#5681](https://github.com/shaka-project/shaka-player/issues/5681)) ([d9b49d9](https://github.com/shaka-project/shaka-player/commit/d9b49d992f533bf7664932d547253b860064ea03))
* **CMCD:** Fix CMCD for some mimetypes in src= ([#5699](https://github.com/shaka-project/shaka-player/issues/5699)) ([e2c32c5](https://github.com/shaka-project/shaka-player/commit/e2c32c52f0ae347083bcc6b4b7dceca903b5546b))
* com.apple.fps should work with the default initDataTransform when using legacy Apple Media Keys ([#5603](https://github.com/shaka-project/shaka-player/issues/5603)) ([76fdda6](https://github.com/shaka-project/shaka-player/commit/76fdda65231905c945db6a5eedeece65f8d7711e))
* Compute correctly the positionAlign in UITextDisplayer ([#5630](https://github.com/shaka-project/shaka-player/issues/5630)) ([3a2dbc3](https://github.com/shaka-project/shaka-player/commit/3a2dbc3deaf1e1ee5384eed41c6c9e79817a8a09))
* **DASH:** Fix bigint implementation ([#5707](https://github.com/shaka-project/shaka-player/issues/5707)) ([45009d2](https://github.com/shaka-project/shaka-player/commit/45009d2c0cbbb203ecb864bc4b742ed4ad9a0d9a))
* **DASH:** Fix race condition error while switching audio tracks ([#5619](https://github.com/shaka-project/shaka-player/issues/5619)) ([29d9a10](https://github.com/shaka-project/shaka-player/commit/29d9a107054fff16ec2abe2cbdbb8fa0c0cfd882))
* **Demo:** Allow com.apple.fps.1_0 in the custom DRM System field ([#5600](https://github.com/shaka-project/shaka-player/issues/5600)) ([ab86000](https://github.com/shaka-project/shaka-player/commit/ab86000dc75a352505875fe6dbc37fe0bdd2857a))
* **Demo:** Fix url of "Low Latency HLS Live" asset ([#5708](https://github.com/shaka-project/shaka-player/issues/5708)) ([146d3ec](https://github.com/shaka-project/shaka-player/commit/146d3ecd280b8b985e1fae6fc9262fa04dcf6126))
* Fix compiled-mode error formatting ([#5623](https://github.com/shaka-project/shaka-player/issues/5623)) ([a19912e](https://github.com/shaka-project/shaka-player/commit/a19912e5bf9ec5425a366b07745d5bac631a9dd2))
* Fix creation of new Stream object for each manifest request in DASH Live when using CEA ([#5674](https://github.com/shaka-project/shaka-player/issues/5674)) ([0a8b519](https://github.com/shaka-project/shaka-player/commit/0a8b5193f2de0b83ddd24aacda09523926b1cdb9))
* Fix MediaSourceEngine reset operation ([#5576](https://github.com/shaka-project/shaka-player/issues/5576)) ([9f5e91f](https://github.com/shaka-project/shaka-player/commit/9f5e91f4a37a8e504adcf1dd756fac9c777c2051))
* Fix Mp4Generator ([#5566](https://github.com/shaka-project/shaka-player/issues/5566)) ([effafbc](https://github.com/shaka-project/shaka-player/commit/effafbc849cc83c732fe113f5da479513b884f9f))
* Fix NALU parsing in some HLS muxed live streams ([#5688](https://github.com/shaka-project/shaka-player/issues/5688)) ([756a576](https://github.com/shaka-project/shaka-player/commit/756a57658608b3d8e674ae810afc692a25dc85cf))
* Fix PES parsing ([#5559](https://github.com/shaka-project/shaka-player/issues/5559)) ([5c6ab9e](https://github.com/shaka-project/shaka-player/commit/5c6ab9e0c8ba1236710209b36ea08d7a44fb1bf3))
* fix preferred track selection on Safari ([#5601](https://github.com/shaka-project/shaka-player/issues/5601)) ([d021d6f](https://github.com/shaka-project/shaka-player/commit/d021d6f932b3a64d826b919b5a7b252599e2ecd5))
* Fix some properties on the shaka.text.Cue that are mangled ([#5673](https://github.com/shaka-project/shaka-player/issues/5673)) ([d2b7cb2](https://github.com/shaka-project/shaka-player/commit/d2b7cb28212d5fc82b70169c77826333e0fc081f))
* Fix transmuxed audio timestamps ([#5595](https://github.com/shaka-project/shaka-player/issues/5595)) ([0260aef](https://github.com/shaka-project/shaka-player/commit/0260aefcdbdda2184ea32d3d8678a04491cc6fd3))
* Fix transmuxing of muxed content ([#5686](https://github.com/shaka-project/shaka-player/issues/5686)) ([f20d50a](https://github.com/shaka-project/shaka-player/commit/f20d50a37b8629d5429b22e2fa0ced4729335af3))
* Fix TS transmuxer when the main content is muxed ([#5575](https://github.com/shaka-project/shaka-player/issues/5575)) ([65b3037](https://github.com/shaka-project/shaka-player/commit/65b3037181b30274b1cedf52283f5726cf7df0b9))
* Fix unreleased stack overflow on statechanged ([#5712](https://github.com/shaka-project/shaka-player/issues/5712)) ([ebacf32](https://github.com/shaka-project/shaka-player/commit/ebacf32127dfc7b8b5227d66f7d53d3eee54fdd3))
* **HLS:** Allow audio groups on audio-only content ([#5578](https://github.com/shaka-project/shaka-player/issues/5578)) ([3cbc444](https://github.com/shaka-project/shaka-player/commit/3cbc444c95ab2e8c124d2caaaac6ce7bc5fdf02f))
* **HLS:** Fix audio and video out of sync ([#5658](https://github.com/shaka-project/shaka-player/issues/5658)) ([4cc4143](https://github.com/shaka-project/shaka-player/commit/4cc4143d5f3d78fc5839d6e61d7464ac62479253))
* **HLS:** Fix display CEA-708 in HLS ([#5694](https://github.com/shaka-project/shaka-player/issues/5694)) ([2097193](https://github.com/shaka-project/shaka-player/commit/2097193c1d16b2fc7478959257e45dd0d8233ffa))
* **HLS:** Fix presentation delay for small live playlists (eg: 3-4 segments) ([#5687](https://github.com/shaka-project/shaka-player/issues/5687)) ([caef5a4](https://github.com/shaka-project/shaka-player/commit/caef5a41edb3b7ac09d58249990bc2fa14ac5adb))
* **HLS:** Get the correct video codec for TS segments ([#5598](https://github.com/shaka-project/shaka-player/issues/5598)) ([1135115](https://github.com/shaka-project/shaka-player/commit/11351150694814813cb1cfeab4dc78fdefcce6fa))
* **HLS:** Show WebVTT subtitles with X-TIMESTAMP-MAP in segments mode ([#5643](https://github.com/shaka-project/shaka-player/issues/5643)) ([bd636d4](https://github.com/shaka-project/shaka-player/commit/bd636d4edffed3e845c79666547dc5af91af4055))
* **HLS:** Skip segments without duration and without partial segments ([#5705](https://github.com/shaka-project/shaka-player/issues/5705)) ([f53d50d](https://github.com/shaka-project/shaka-player/commit/f53d50dc3620736add47f4db2f4e71b4d8eea526))
* **HLS:** Support AES-128 in init segment according the RFC ([#5677](https://github.com/shaka-project/shaka-player/issues/5677)) ([806d91a](https://github.com/shaka-project/shaka-player/commit/806d91af4da9e71f9e11af406ffebf14232c5e9f))
* Improve TsParse to avoid parsing errors ([#5615](https://github.com/shaka-project/shaka-player/issues/5615)) ([5fa8b42](https://github.com/shaka-project/shaka-player/commit/5fa8b42118103ee8bb32394feb3aeb57b6d47553))
* Prevent codecs override in the transmuxer ([#5568](https://github.com/shaka-project/shaka-player/issues/5568)) ([66c625f](https://github.com/shaka-project/shaka-player/commit/66c625f55ab00989ff74419e8f85ca7619446dd0))
* Remove debugging code on Simple Text ([#5582](https://github.com/shaka-project/shaka-player/issues/5582)) ([991130a](https://github.com/shaka-project/shaka-player/commit/991130a6d875fd41ff585254563c5a879057603a))
* seeking in segment timeline returns incorrect index ([#5716](https://github.com/shaka-project/shaka-player/issues/5716)) ([c02ccee](https://github.com/shaka-project/shaka-player/commit/c02cceeeca0590a9b9b3161783142d89ba4948d4)), closes [#5664](https://github.com/shaka-project/shaka-player/issues/5664)
* **TTML:** Fix wrong writing-mode in nested cues ([#5646](https://github.com/shaka-project/shaka-player/issues/5646)) ([3a4f108](https://github.com/shaka-project/shaka-player/commit/3a4f10878a91c7d30f71862f2cec780b0f5e1bac))
* **UI:** Fix broken language names on Google TV ([#5613](https://github.com/shaka-project/shaka-player/issues/5613)) ([fc93292](https://github.com/shaka-project/shaka-player/commit/fc93292d9e4f8d38561dea8320cbcd5fd25f2c75))
* **WebVTT:** Fix support for line:0 vertical alignment ([#5632](https://github.com/shaka-project/shaka-player/issues/5632)) ([eed393f](https://github.com/shaka-project/shaka-player/commit/eed393f1bf777f00f1e7242c96bf9124ad3dec30))
* **WebVTT:** Fix text displayed out of picture and with overlapping lines ([#5662](https://github.com/shaka-project/shaka-player/issues/5662)) ([6975be9](https://github.com/shaka-project/shaka-player/commit/6975be92d47fd5368492e861a6ea63e627a4846c)), closes [#5661](https://github.com/shaka-project/shaka-player/issues/5661)
* **WebVTT:** Fix wrong writing-mode in nested cues ([#5641](https://github.com/shaka-project/shaka-player/issues/5641)) ([56a4cea](https://github.com/shaka-project/shaka-player/commit/56a4cea5789f15b5e78c9a5d8d0cb97eb542bafc))


### Performance Improvements

* Optimization to resolve uris ([#5657](https://github.com/shaka-project/shaka-player/issues/5657)) ([bd17c2b](https://github.com/shaka-project/shaka-player/commit/bd17c2bfd077c596d77a2a3fdd865041ed08012c))

## [4.4.0](https://github.com/shaka-project/shaka-player/compare/v4.4.0...v4.4.0) (2023-08-30)


### Features

* **ABR:** Abr improvement config ([#5400](https://github.com/shaka-project/shaka-player/issues/5400)) ([b51ee6e](https://github.com/shaka-project/shaka-player/commit/b51ee6ed89fc9a6f362c687a1b808e64038b6e92))
* Add a Mp4Generator ([#5127](https://github.com/shaka-project/shaka-player/issues/5127)) ([d475a73](https://github.com/shaka-project/shaka-player/commit/d475a73d7d105d732a2fd8f9bca2686ff88d1732))
* Add AAC silent frame getter ([#5557](https://github.com/shaka-project/shaka-player/issues/5557)) ([933f039](https://github.com/shaka-project/shaka-player/commit/933f039ab043205ef6e5f1d9779283e710c2d7bc))
* Add AAC transmuxer ([#5240](https://github.com/shaka-project/shaka-player/issues/5240)) ([00d3a45](https://github.com/shaka-project/shaka-player/commit/00d3a45dad5957f14640f38dec1068dfd2397698))
* Add AC-3 and EC-3 support in Mp4Generator ([#5235](https://github.com/shaka-project/shaka-player/issues/5235)) ([28d18ad](https://github.com/shaka-project/shaka-player/commit/28d18ad7a77134d5e7a301a9753d67ac0c698764))
* Add AC-3 detection in TS ([#4931](https://github.com/shaka-project/shaka-player/issues/4931)) ([48c30bc](https://github.com/shaka-project/shaka-player/commit/48c30bcd036060a09175badadeeacdff4d8f3728))
* Add AC3 transmuxer ([#5297](https://github.com/shaka-project/shaka-player/issues/5297)) ([6f83997](https://github.com/shaka-project/shaka-player/commit/6f8399791352b6ccb6f3803c5163be4999c075f0))
* Add EC-3 detection in TS ([#5144](https://github.com/shaka-project/shaka-player/issues/5144)) ([24a3b7d](https://github.com/shaka-project/shaka-player/commit/24a3b7da1a8e0eff6f72b3b654b52fb44471a800))
* Add EC3 transmuxer ([#5352](https://github.com/shaka-project/shaka-player/issues/5352)) ([7d24e14](https://github.com/shaka-project/shaka-player/commit/7d24e14d2132ed3eee2a3f63e88892214755e717))
* Add ExpressPlay FairPlay util ([#4926](https://github.com/shaka-project/shaka-player/issues/4926)) ([7fa40fd](https://github.com/shaka-project/shaka-player/commit/7fa40fdb483e155099d0141ee110ac1a791d88ae))
* add feature-flag to insert fake encryption in init segments on broken platforms ([#5561](https://github.com/shaka-project/shaka-player/issues/5561)) ([f14f295](https://github.com/shaka-project/shaka-player/commit/f14f2959d6700a56d1895360da657afc796d25f5))
* Add getManifestType method ([#5021](https://github.com/shaka-project/shaka-player/issues/5021)) ([c7c5e94](https://github.com/shaka-project/shaka-player/commit/c7c5e94a32f402edc1ab8dd2b492139bb5079e49))
* Add liveSync configuration to catch up on live streams ([#5304](https://github.com/shaka-project/shaka-player/issues/5304)) ([db44dc8](https://github.com/shaka-project/shaka-player/commit/db44dc82242fd9dd845024737e969fef0e4caae5))
* Add missing export in TsParser ([#5145](https://github.com/shaka-project/shaka-player/issues/5145)) ([412a7e8](https://github.com/shaka-project/shaka-player/commit/412a7e8f922e1e2106530f4a59f070289a86bc5f))
* Add MP3 transmuxer ([#5208](https://github.com/shaka-project/shaka-player/issues/5208)) ([82e905b](https://github.com/shaka-project/shaka-player/commit/82e905b540b362ff14e1c14023de2d58a1e78a0f))
* add Occitan locale ([#4900](https://github.com/shaka-project/shaka-player/issues/4900)) ([68486a3](https://github.com/shaka-project/shaka-player/commit/68486a3f3743946188827aa0ebf6ef0e321153be))
* Add originalLanguage to the Track structure ([#5409](https://github.com/shaka-project/shaka-player/issues/5409)) ([f53349f](https://github.com/shaka-project/shaka-player/commit/f53349fc93e97dd1344025119b8566501950213b))
* Add preferredAudioLabel to PlayerConfiguration ([#4763](https://github.com/shaka-project/shaka-player/issues/4763)) ([aadecd6](https://github.com/shaka-project/shaka-player/commit/aadecd6401c00af56eccc26bd710d96d41be76ce))
* Add preferredVideoHdrLevel config. ([#5370](https://github.com/shaka-project/shaka-player/issues/5370)) ([2f511a2](https://github.com/shaka-project/shaka-player/commit/2f511a293014f2b5e7c8b14db5dedcbb4f24e3fe))
* Add safeMargin as a parameter of the player selectAudioLanguage method ([#5316](https://github.com/shaka-project/shaka-player/issues/5316)) ([e4a4138](https://github.com/shaka-project/shaka-player/commit/e4a41381f2ac8b70d8419a2742bb7109cb0e2015))
* Add support for AC-3 and EC-3 audio in DVB streams ([#5484](https://github.com/shaka-project/shaka-player/issues/5484)) ([9bd559b](https://github.com/shaka-project/shaka-player/commit/9bd559b94ad86234e927b2422bbde0655831bb75))
* Add support for changing codecs in MediaSourceEngine ([#5217](https://github.com/shaka-project/shaka-player/issues/5217)) ([464f33c](https://github.com/shaka-project/shaka-player/commit/464f33c984a78aa7d72c3e389ca97c9b28dc5b38))
* Add support for Document Picture-in-Picture ([#4969](https://github.com/shaka-project/shaka-player/issues/4969)) ([3828fd6](https://github.com/shaka-project/shaka-player/commit/3828fd6849fba98218ed934279d5d8a23183dc06))
* Add support to old EMSG schemeId for ID3 ([#5320](https://github.com/shaka-project/shaka-player/issues/5320)) ([cd9ee09](https://github.com/shaka-project/shaka-player/commit/cd9ee095e8864265b0b851c4d25bd2dc558c0e93))
* Add support to streamDataCallback when using prefetch ([#5310](https://github.com/shaka-project/shaka-player/issues/5310)) ([6104b57](https://github.com/shaka-project/shaka-player/commit/6104b57a76626f7b847b807ee07c543f90acbcad))
* Add TS transmuxer ([#5386](https://github.com/shaka-project/shaka-player/issues/5386)) ([eec25b2](https://github.com/shaka-project/shaka-player/commit/eec25b2c6efc1cccc35509131c37bd4569d54b9e))
* **Ads:** Add ads config ([#5085](https://github.com/shaka-project/shaka-player/issues/5085)) ([dfe263a](https://github.com/shaka-project/shaka-player/commit/dfe263aa6a252ff78901a150ee676594742d709c))
* **Ads:** Add control AdsRenderingSettings ([#5536](https://github.com/shaka-project/shaka-player/issues/5536)) ([d37143e](https://github.com/shaka-project/shaka-player/commit/d37143e060fe6318b9ec2bac67ee7a259a25947d))
* **ads:** Add getPodIndex to CS and SS ads ([#5524](https://github.com/shaka-project/shaka-player/issues/5524)) ([65cf077](https://github.com/shaka-project/shaka-player/commit/65cf0773f4041565826013244f571f88e3af22ff))
* **ads:** Add new methods to Ads ([#5107](https://github.com/shaka-project/shaka-player/issues/5107)) ([2b33315](https://github.com/shaka-project/shaka-player/commit/2b333159c344dcd7c39d65e384435563dad741a8))
* **Ads:** Allow multiple calls to requestAds in CS ([#5542](https://github.com/shaka-project/shaka-player/issues/5542)) ([837e0fb](https://github.com/shaka-project/shaka-player/commit/837e0fba4267bd74fa26acdfdace4ba833fb659a))
* **Ads:** Allow use a custom playhead tracker in CS ([#5543](https://github.com/shaka-project/shaka-player/issues/5543)) ([362f03f](https://github.com/shaka-project/shaka-player/commit/362f03ff3d55565449d83407db4fc17c8575a3e2))
* **Ads:** Disable custom playback on iOS 10+ browsers for client-side ads ([29e022e](https://github.com/shaka-project/shaka-player/commit/29e022e3aeac10fc3bcf0382b14dabd2d4a93c85))
* **ads:** Dispatch a player event for client-side ad errors ([#5045](https://github.com/shaka-project/shaka-player/issues/5045)) ([673b7fc](https://github.com/shaka-project/shaka-player/commit/673b7fceedaea659a8c5e9890fd8434d974756f1))
* Allow custom plugins for transmuxing ([#4854](https://github.com/shaka-project/shaka-player/issues/4854)) ([fac721d](https://github.com/shaka-project/shaka-player/commit/fac721df868af2a4a53f5454b1838a60da3cee83))
* Allow generate muxed content with Mp4Generator ([#5555](https://github.com/shaka-project/shaka-player/issues/5555)) ([1112d1d](https://github.com/shaka-project/shaka-player/commit/1112d1d447d699886f989b936cb0689261307775))
* Allow generate segments with Mp4Generator ([#5185](https://github.com/shaka-project/shaka-player/issues/5185)) ([8da971f](https://github.com/shaka-project/shaka-player/commit/8da971f5a7db6985319d178672076a2e2272abf9))
* allow reuse of persistent license sessions ([#4461](https://github.com/shaka-project/shaka-player/issues/4461)) ([cc97da1](https://github.com/shaka-project/shaka-player/commit/cc97da167f4b08b98613a3296b4879f0948b79b7))
* Allow VTT files with erroneous linebreaks ([#2394](https://github.com/shaka-project/shaka-player/issues/2394)) ([9b1c614](https://github.com/shaka-project/shaka-player/commit/9b1c614815d4963e03dec41a155e58cb5eefb94f)), closes [#2358](https://github.com/shaka-project/shaka-player/issues/2358)
* Cache mediaCapabilities.decodingInfo results ([#4789](https://github.com/shaka-project/shaka-player/issues/4789)) ([b7781f0](https://github.com/shaka-project/shaka-player/commit/b7781f04468c0e25502679a7bc740cc024551adf)), closes [#4775](https://github.com/shaka-project/shaka-player/issues/4775)
* Caching and other efficiency improvements for mcap polyfill ([#4708](https://github.com/shaka-project/shaka-player/issues/4708)) ([884c4ca](https://github.com/shaka-project/shaka-player/commit/884c4ca4f8ed94457e7eabce68d4e476811739d5)), closes [#4574](https://github.com/shaka-project/shaka-player/issues/4574)
* **cea:** Add CEA parser for TS ([#4697](https://github.com/shaka-project/shaka-player/issues/4697)) ([70fad8d](https://github.com/shaka-project/shaka-player/commit/70fad8de8fc18cdd186ee431bbd433bbd4d440cc))
* **CEA:** Add support to vertical position in CEA-608 ([#5531](https://github.com/shaka-project/shaka-player/issues/5531)) ([47224ff](https://github.com/shaka-project/shaka-player/commit/47224ff081fa7b022b8e013becab62b60a814143))
* Config to require a minimum HDCP version ([#4883](https://github.com/shaka-project/shaka-player/issues/4883)) ([61613cf](https://github.com/shaka-project/shaka-player/commit/61613cf0ee8bdbcbf7bfee209bba4fe052f8857c))
* Convert CEA parsers to plugins ([#5195](https://github.com/shaka-project/shaka-player/issues/5195)) ([7bda65d](https://github.com/shaka-project/shaka-player/commit/7bda65dcc75d4f739d8e090f397319b8ea391743))
* **DASH:** Achieve better latency in LL streams ([#5291](https://github.com/shaka-project/shaka-player/issues/5291)) ([f4bcc87](https://github.com/shaka-project/shaka-player/commit/f4bcc874d87b45f9e6678d17466c921594ba0fc5))
* **DASH:** Add support for &lt;dashif:Laurl&gt; ([#4849](https://github.com/shaka-project/shaka-player/issues/4849)) ([b441518](https://github.com/shaka-project/shaka-player/commit/b441518943241693fa2df03196be6ee707c8511e)), closes [#4748](https://github.com/shaka-project/shaka-player/issues/4748)
* **DASH:** Add support for service descriptions ([#5394](https://github.com/shaka-project/shaka-player/issues/5394)) ([693abd5](https://github.com/shaka-project/shaka-player/commit/693abd5081d6b1e317dd1e7e418e7a7c9b058f90))
* **DASH:** Expose accessibility purpose in track ([#5216](https://github.com/shaka-project/shaka-player/issues/5216)) ([654a028](https://github.com/shaka-project/shaka-player/commit/654a0281d9ee5d5d618aaa6a84b93aa85131682e)), closes [#5211](https://github.com/shaka-project/shaka-player/issues/5211)
* **dash:** Improve DASH SegmentTemplate performance with on-demand segment references ([#5061](https://github.com/shaka-project/shaka-player/issues/5061)) ([f1c5a1c](https://github.com/shaka-project/shaka-player/commit/f1c5a1c19126832184f43b0d08e9503a34b0dac0))
* **DASH:** Remove MIN_UPDATE_PERIOD_ to achieve better latency in Live ([#5286](https://github.com/shaka-project/shaka-player/issues/5286)) ([1515b7a](https://github.com/shaka-project/shaka-player/commit/1515b7abf62a9e7227d428d0a90c303e7aecc45d))
* **Demo:** Add Low Latency filter in demo page ([#5392](https://github.com/shaka-project/shaka-player/issues/5392)) ([c378e10](https://github.com/shaka-project/shaka-player/commit/c378e10bc68a0a1552ab757201ad4c38cffa015d))
* **Demo:** Add MSS Playready asset ([#5485](https://github.com/shaka-project/shaka-player/issues/5485)) ([89ca242](https://github.com/shaka-project/shaka-player/commit/89ca2427c931fe331193cf4d194ced8daa8c2300))
* **demo:** Improve bug report button in demo ([#5510](https://github.com/shaka-project/shaka-player/issues/5510)) ([4329d79](https://github.com/shaka-project/shaka-player/commit/4329d7913b10bfb1e51775b63c7af9fcf5307acc)), closes [#5056](https://github.com/shaka-project/shaka-player/issues/5056)
* **DRM:** use preferredKeySystems to reduce requestMediaKeySystemAccess() calls ([#5391](https://github.com/shaka-project/shaka-player/issues/5391)) ([6d75d89](https://github.com/shaka-project/shaka-player/commit/6d75d89fbb13a32de135a6c1ab6a7a3e55fcb3f4))
* Enable variant failover for BAD_HTTP_STATUS and TIMEOUT ([#4769](https://github.com/shaka-project/shaka-player/issues/4769)) ([b46012d](https://github.com/shaka-project/shaka-player/commit/b46012df647d0fd6f1b6209a324171ab86f9fa80))
* export period combiner ([#5324](https://github.com/shaka-project/shaka-player/issues/5324)) ([e9ba2f4](https://github.com/shaka-project/shaka-player/commit/e9ba2f432210d82a1beae063b6323c4d46cc1765)), closes [#5307](https://github.com/shaka-project/shaka-player/issues/5307)
* **HLS:** Add HLS config to ignore manifest timestamps when in segments mode ([#5103](https://github.com/shaka-project/shaka-player/issues/5103)) ([4d487e4](https://github.com/shaka-project/shaka-player/commit/4d487e46e163862775dbdb5038c309969ba1b43b))
* **HLS:** Add HLS support for non-sequence mode ([#4623](https://github.com/shaka-project/shaka-player/issues/4623)) ([2b50b88](https://github.com/shaka-project/shaka-player/commit/2b50b88030d44c841daea8f67a3c51eb9b2284a4))
* **HLS:** Add support to _HLS_msn query param in LL streams ([#5262](https://github.com/shaka-project/shaka-player/issues/5262)) ([2ece86f](https://github.com/shaka-project/shaka-player/commit/2ece86fde61e5f7f942c3bbdeb6eafe5fc50d8d0))
* **HLS:** Add support to _HLS_part query param in LL streams ([#5265](https://github.com/shaka-project/shaka-player/issues/5265)) ([ec8804d](https://github.com/shaka-project/shaka-player/commit/ec8804d0be2c2cd26a86bbd5737544261c29cc46))
* **HLS:** Add support to blocking playlist reload by adding the CAN-BLOCK-RELOAD=YES ([#5279](https://github.com/shaka-project/shaka-player/issues/5279)) ([090554b](https://github.com/shaka-project/shaka-player/commit/090554b9ed284e10e6de4305aa5ec7797ff8da3b))
* **HLS:** Add support to BYTERANGE-LENGTH in EXT-X-PRELOAD-HINT ([#5267](https://github.com/shaka-project/shaka-player/issues/5267)) ([ea97a5a](https://github.com/shaka-project/shaka-player/commit/ea97a5a90c3445405bfc53c96943ae607caf2e21))
* **HLS:** Add support to HLS-AES128 low latency ([#4982](https://github.com/shaka-project/shaka-player/issues/4982)) ([07787a8](https://github.com/shaka-project/shaka-player/commit/07787a8874f8448df66e487a5485155a00e39b0c))
* **HLS:** Add support to HOLD-BACK in EXT-X-SERVER-CONTROL ([#5281](https://github.com/shaka-project/shaka-player/issues/5281)) ([bb2c06a](https://github.com/shaka-project/shaka-player/commit/bb2c06a3df1a4d68c981b7bef13e12110b8d0ca7))
* **HLS:** Allow delivery directives in Live streams ([#5292](https://github.com/shaka-project/shaka-player/issues/5292)) ([aedf634](https://github.com/shaka-project/shaka-player/commit/aedf634f8ee9a8f0a172bfaa0d9b7b3f8ba3f294))
* **HLS:** Fix update time when using LL-HLS and byterange optimization ([#5495](https://github.com/shaka-project/shaka-player/issues/5495)) ([bba7537](https://github.com/shaka-project/shaka-player/commit/bba75370f36890e89d4d783d1726121577ff5968))
* **HLS:** Get resolution from TS when load a Media Playlist ([#5058](https://github.com/shaka-project/shaka-player/issues/5058)) ([42a9f96](https://github.com/shaka-project/shaka-player/commit/42a9f968d8597ba34a99c9fe68cace8600876112))
* **HLS:** Improve detection of basic info from Media Playlist ([#4809](https://github.com/shaka-project/shaka-player/issues/4809)) ([d465942](https://github.com/shaka-project/shaka-player/commit/d465942c4393e6c891d6a230bea90a44d90cc70b))
* **HLS:** Improve HLS parsing time ([#5264](https://github.com/shaka-project/shaka-player/issues/5264)) ([2ca7d0b](https://github.com/shaka-project/shaka-player/commit/2ca7d0b06075adce752cf048eb70693c837b1e9c))
* **HLS:** Improve Low Latency performance in HLS ([#4952](https://github.com/shaka-project/shaka-player/issues/4952)) ([5514385](https://github.com/shaka-project/shaka-player/commit/5514385c87440b4e77ae772f533b30927dcdb303))
* **HLS:** Optimization of LL-HLS with byterange ([#5319](https://github.com/shaka-project/shaka-player/issues/5319)) ([9e6655a](https://github.com/shaka-project/shaka-player/commit/9e6655a04a712641d53e4b717ca68f2120414d56))
* **HLS:** Optimize LL-HLS with byterange ([#5342](https://github.com/shaka-project/shaka-player/issues/5342)) ([53d6378](https://github.com/shaka-project/shaka-player/commit/53d6378bac540af8e69522d1e22887b56b598bf0))
* **HLS:** Parse #EXT-X-BITRATE ([#5550](https://github.com/shaka-project/shaka-player/issues/5550)) ([123183d](https://github.com/shaka-project/shaka-player/commit/123183d14152d988ff9817729b98980961917629))
* **HLS:** Parse SAMPLE-RATE attribute ([#5375](https://github.com/shaka-project/shaka-player/issues/5375)) ([5af34ad](https://github.com/shaka-project/shaka-player/commit/5af34add689ee5075b94eedf59125eec2f8a45c2))
* **HLS:** Poll HLS playlists using last segment duration ([#4779](https://github.com/shaka-project/shaka-player/issues/4779)) ([1ba3806](https://github.com/shaka-project/shaka-player/commit/1ba38067759654b5e53573c41db65d9d748af003)), closes [#4771](https://github.com/shaka-project/shaka-player/issues/4771)
* **HLS:** Support byterange optimization on servers with support to blocking playlist reload ([#5347](https://github.com/shaka-project/shaka-player/issues/5347)) ([263a17b](https://github.com/shaka-project/shaka-player/commit/263a17b984d7014e9d080e4b7437a78c7620aec7))
* Improve live latency on load ([#5268](https://github.com/shaka-project/shaka-player/issues/5268)) ([236dacb](https://github.com/shaka-project/shaka-player/commit/236dacb53bfc511ce3144e621b5f572f644e245d))
* Improve parsing time in DASH and HLS ([#5261](https://github.com/shaka-project/shaka-player/issues/5261)) ([f1e35fd](https://github.com/shaka-project/shaka-player/commit/f1e35fde00c65e6cf1acd42fb78c3b5562705542))
* Improve performance of multi-period DASH parsing ([#5350](https://github.com/shaka-project/shaka-player/issues/5350)) ([5b0b429](https://github.com/shaka-project/shaka-player/commit/5b0b4290e36091ff75da92fe307e7744799f4411))
* Improve performance of setStreamProperties on low-end devices ([#5380](https://github.com/shaka-project/shaka-player/issues/5380)) ([ddbc249](https://github.com/shaka-project/shaka-player/commit/ddbc2498bff6a3cb38fbebb37886e512d28720a0))
* Improve sequence mode start time ([#5326](https://github.com/shaka-project/shaka-player/issues/5326)) ([80cacf6](https://github.com/shaka-project/shaka-player/commit/80cacf6d8f28e3cd75f40b1c68d2e52a46219df6))
* Include stack trace in errors dispatched from production builds ([#5407](https://github.com/shaka-project/shaka-player/issues/5407)) ([7d049eb](https://github.com/shaka-project/shaka-player/commit/7d049eb8cb3f0b577148d15fa4c42262b9f322ed)), closes [#5406](https://github.com/shaka-project/shaka-player/issues/5406)
* **logs:** Add extra logging for 3015 errors ([#4932](https://github.com/shaka-project/shaka-player/issues/4932)) ([67a2451](https://github.com/shaka-project/shaka-player/commit/67a245129f53d99cce89aff3ea194b1098d65ee6))
* Make gap jump timer time configurable ([#5525](https://github.com/shaka-project/shaka-player/issues/5525)) ([97b7412](https://github.com/shaka-project/shaka-player/commit/97b741210e0744e1d4dbb2083285e95fc5d24755))
* Move forceTransmux from streaming to mediasource config ([#4783](https://github.com/shaka-project/shaka-player/issues/4783)) ([b491a6b](https://github.com/shaka-project/shaka-player/commit/b491a6b7caa5d4a8167adf18cf90b23c30a5a1be))
* **MSS:** Add support for Microsoft Smooth Streaming (VOD only) ([#5002](https://github.com/shaka-project/shaka-player/issues/5002)) ([f80bf20](https://github.com/shaka-project/shaka-player/commit/f80bf208b113c57fa9bd8d94f093972cf9571274))
* **MSS:** Fix MSS PlayReady support ([#5486](https://github.com/shaka-project/shaka-player/issues/5486)) ([1dd9809](https://github.com/shaka-project/shaka-player/commit/1dd98098087a54d8de68f4c2ca670cb79ebaa2ea))
* **net:** Added advanced type to filters ([#5006](https://github.com/shaka-project/shaka-player/issues/5006)) ([fbce38a](https://github.com/shaka-project/shaka-player/commit/fbce38af1cc7f05a30992907103af4a82f180520)), closes [#4966](https://github.com/shaka-project/shaka-player/issues/4966)
* Optimize appendBuffer operations for init segments ([#5377](https://github.com/shaka-project/shaka-player/issues/5377)) ([68f7a0e](https://github.com/shaka-project/shaka-player/commit/68f7a0eb2a8574645592e069c63813e0c97c5e66))
* Parses a PRFT Box, with a loss of precision beyond 53 bits ([#5354](https://github.com/shaka-project/shaka-player/issues/5354)) ([a797651](https://github.com/shaka-project/shaka-player/commit/a797651db4e636bd00cba3715686dc35057eb9de))
* Parses a TFDT Box, with a loss of precision beyond 53 bits ([#5329](https://github.com/shaka-project/shaka-player/issues/5329)) ([db73e1f](https://github.com/shaka-project/shaka-player/commit/db73e1f410f5e6754ea16329be35c48a48bca16d))
* Parses a TFDT Box, with a loss of precision beyond 53 bits ([#5501](https://github.com/shaka-project/shaka-player/issues/5501)) ([c6e8449](https://github.com/shaka-project/shaka-player/commit/c6e8449468698b0e7765b9739222344d470a6517))
* Raise fatal error on linear manifest request update failure ([#5138](https://github.com/shaka-project/shaka-player/issues/5138)) ([3ff7ba3](https://github.com/shaka-project/shaka-player/commit/3ff7ba370fcc6b561d4b63f18d144404d6d6ed43))
* Set segmentPrefetchLimit to 2 by default for low latency streaming ([#5275](https://github.com/shaka-project/shaka-player/issues/5275)) ([62f24d2](https://github.com/shaka-project/shaka-player/commit/62f24d22491353bf3a37f451c74a26b77f892197))
* **SRT:** Support stylized payload in SRT format ([#5500](https://github.com/shaka-project/shaka-player/issues/5500)) ([963cf61](https://github.com/shaka-project/shaka-player/commit/963cf614d9142c5bc93b0c6c0eb3498e208d235d))
* Support customizing clearBuffers and safeMargin when select variants by label ([#4770](https://github.com/shaka-project/shaka-player/issues/4770)) ([c724625](https://github.com/shaka-project/shaka-player/commit/c7246250323c3c97a2d30f9f66880e914e5c2344))
* Support Parallel Segment Fetching ([#4784](https://github.com/shaka-project/shaka-player/issues/4784)) ([de6abde](https://github.com/shaka-project/shaka-player/commit/de6abde06f38d802f1f9fb297c284283ca8e4751))
* Support private-use language tags ([#5223](https://github.com/shaka-project/shaka-player/issues/5223)) ([fa041d7](https://github.com/shaka-project/shaka-player/commit/fa041d776da720b9319e8db65aeb48df1d48a9bf))
* **UI:** Add HDR label to resolution when the track is HDR ([#5373](https://github.com/shaka-project/shaka-player/issues/5373)) ([3f9eade](https://github.com/shaka-project/shaka-player/commit/3f9eadeaaf5d3a4b4e20c6e05dbad3fc4b4b5f3c))
* **UI:** Add PageUp and PageDown to UI seek bar ([#5519](https://github.com/shaka-project/shaka-player/issues/5519)) ([8e22a50](https://github.com/shaka-project/shaka-player/commit/8e22a508520cc444fe8abb64e83771b5958f2c54))
* **UI:** Add thumbnails to the UI ([#5502](https://github.com/shaka-project/shaka-player/issues/5502)) ([c483975](https://github.com/shaka-project/shaka-player/commit/c483975cb819ee5908ebc5e75bfa644312fdad7a))
* **UI:** Allow customizing FullScreen element ([#4963](https://github.com/shaka-project/shaka-player/issues/4963)) ([c471d23](https://github.com/shaka-project/shaka-player/commit/c471d23bc25db11dda85a18870ebd3fe37971848))
* **UI:** Remove copyStyleSheets ([#5273](https://github.com/shaka-project/shaka-player/issues/5273)) ([fe43ed3](https://github.com/shaka-project/shaka-player/commit/fe43ed3964509d6be0c1a2123787adf51c91fc33))
* **UI:** Use Intl.DisplayNames to show the language name ([#5365](https://github.com/shaka-project/shaka-player/issues/5365)) ([35cb193](https://github.com/shaka-project/shaka-player/commit/35cb193c76a01b0bdea862b423cfc6721f42529a))
* Use local assets for transmuxer tests ([#5549](https://github.com/shaka-project/shaka-player/issues/5549)) ([a75e776](https://github.com/shaka-project/shaka-player/commit/a75e776778b9cdf9c751d3d781f6fb288da65689))
* Use shaka.text.Cue everywhere instead of shaka.extern.Cue ([#5529](https://github.com/shaka-project/shaka-player/issues/5529)) ([62156ba](https://github.com/shaka-project/shaka-player/commit/62156bae020cb16f5867c15a301e22b479c79c4e))
* **utils:** Export shaka.util.StreamUtils.meetsRestrictions ([#5100](https://github.com/shaka-project/shaka-player/issues/5100)) ([3543e57](https://github.com/shaka-project/shaka-player/commit/3543e579c5500ed5a4cc5374aa7eea4682190750))
* **WebVTT:** Add support to auto position ([#5532](https://github.com/shaka-project/shaka-player/issues/5532)) ([a8f7c41](https://github.com/shaka-project/shaka-player/commit/a8f7c41b0744f707fdebb6246ef2c9b6ebabc998))
* **webvtt:** webvtt colors output ([#4954](https://github.com/shaka-project/shaka-player/issues/4954)) ([ed7a736](https://github.com/shaka-project/shaka-player/commit/ed7a736ca22bb768672135ad0d468c00be4c5dac))


### Bug Fixes

* `config.streaming.preferNativeHls` only applies to HLS streams ([#5167](https://github.com/shaka-project/shaka-player/issues/5167)) ([bf4b4a5](https://github.com/shaka-project/shaka-player/commit/bf4b4a54cc56d5da98918274351063e22f31cd6d)), closes [#5166](https://github.com/shaka-project/shaka-player/issues/5166)
* add MIME type for HTML5 tracks ([#5452](https://github.com/shaka-project/shaka-player/issues/5452)) ([4f1a119](https://github.com/shaka-project/shaka-player/commit/4f1a1196a90b8d617aea10eae265769221ff6de1))
* Add missing AdvancedRequestType in some requests ([#5113](https://github.com/shaka-project/shaka-player/issues/5113)) ([b60bf16](https://github.com/shaka-project/shaka-player/commit/b60bf1610be3c9cf49e024ae91d1a0f6fad4ddb3))
* Add missing StreamInfo value in AAC transmuxer ([#5260](https://github.com/shaka-project/shaka-player/issues/5260)) ([5175e88](https://github.com/shaka-project/shaka-player/commit/5175e887af628a5163795e5213ea3cd5f2b2f809))
* Add mux.js to support.html ([#4923](https://github.com/shaka-project/shaka-player/issues/4923)) ([d9fa4eb](https://github.com/shaka-project/shaka-player/commit/d9fa4ebdec49b609690b4d028a0fa1318b83f179))
* Adds missing CMCD params to some http requests ([#5072](https://github.com/shaka-project/shaka-player/issues/5072)) ([fe38e45](https://github.com/shaka-project/shaka-player/commit/fe38e45f4d53fd5c74304948a3e2bb2a8abaaa21)), closes [#5067](https://github.com/shaka-project/shaka-player/issues/5067) [#5094](https://github.com/shaka-project/shaka-player/issues/5094)
* **ads:** Fix ads starting muted behavior ([#5153](https://github.com/shaka-project/shaka-player/issues/5153)) ([211624f](https://github.com/shaka-project/shaka-player/commit/211624f250efc5caaa3500fb26f0fd5d9d426d0d)), closes [#5125](https://github.com/shaka-project/shaka-player/issues/5125)
* **Ads:** Fix CS volume ad ([#5016](https://github.com/shaka-project/shaka-player/issues/5016)) ([492b5f3](https://github.com/shaka-project/shaka-player/commit/492b5f3ac83c801bc3f50a0aaa8a5382dd8f0936))
* **Ads:** Fix SS configure ([#5155](https://github.com/shaka-project/shaka-player/issues/5155)) ([49ed4ab](https://github.com/shaka-project/shaka-player/commit/49ed4ab33ffffb8ee8d05f2a2109c774ef98e6b9))
* **Ads:** Fix usage of EventManager on CS ([#5017](https://github.com/shaka-project/shaka-player/issues/5017)) ([541badc](https://github.com/shaka-project/shaka-player/commit/541badcfca7226ac77f9f6073e5542889b3fb104))
* **Ads:** Fix usage of EventManager on CS ([#5084](https://github.com/shaka-project/shaka-player/issues/5084)) ([122f5f3](https://github.com/shaka-project/shaka-player/commit/122f5f3e87375213eb775584626fbc95f1974d15))
* **ads:** Fix VMAP ads stay muted on muted autoplay ([#4995](https://github.com/shaka-project/shaka-player/issues/4995)) ([d074afc](https://github.com/shaka-project/shaka-player/commit/d074afc1fc1a675aaee7059df860a160004871fc))
* **Ads:** Initialize correctly the IMA ads manager ([#5541](https://github.com/shaka-project/shaka-player/issues/5541)) ([4428adf](https://github.com/shaka-project/shaka-player/commit/4428adf4c1d483e7d36e20e5800b434f32811cd2))
* Allow the playback of TS without mux.js ([#5041](https://github.com/shaka-project/shaka-player/issues/5041)) ([0b785f7](https://github.com/shaka-project/shaka-player/commit/0b785f7d9c4bdf379dcee0bf3d3989215b0f85a0))
* Avoid unnecessary timestampOffset updates when using HLS segments mode ([#5270](https://github.com/shaka-project/shaka-player/issues/5270)) ([9059944](https://github.com/shaka-project/shaka-player/commit/90599440dcac8116fe369654716c38b84efffc5d))
* Caption can not turn off at iOS Safari ([#4978](https://github.com/shaka-project/shaka-player/issues/4978)) ([9d2c325](https://github.com/shaka-project/shaka-player/commit/9d2c325cdf431664d33bca31626f73d5c6f7a608))
* **cast:** Added existence checks for MediaDecodingConfig.{audio|video} in decodingInfo(). ([#4796](https://github.com/shaka-project/shaka-player/issues/4796)) ([36db83d](https://github.com/shaka-project/shaka-player/commit/36db83dc992bf86e08c610f31ef39ae2c41d0130))
* **cast:** Use cast platform APIs in MediaCapabilties polyfill ([#4727](https://github.com/shaka-project/shaka-player/issues/4727)) ([5d6f56a](https://github.com/shaka-project/shaka-player/commit/5d6f56adf33557ca3ff70a0c459d400b2eae6f79))
* CEA 608 captions not work with H.265 video streams ([#5252](https://github.com/shaka-project/shaka-player/issues/5252)) ([f0ee16b](https://github.com/shaka-project/shaka-player/commit/f0ee16bdb35283e9543006c00ab45bf3ea06f002)), closes [#5251](https://github.com/shaka-project/shaka-player/issues/5251)
* **cea:** Fix MAX_ROWS in CEA-708 window ([#4757](https://github.com/shaka-project/shaka-player/issues/4757)) ([e89eeb6](https://github.com/shaka-project/shaka-player/commit/e89eeb69fab877ee6b330f12c4ff67b3eeac8839))
* **cea:** Fix not rendering CEA-608 on encrypted mp4 segments ([#4756](https://github.com/shaka-project/shaka-player/issues/4756)) ([d600109](https://github.com/shaka-project/shaka-player/commit/d6001097a9751bd9211eb52f940e282ead026a32))
* **chapters:** removed duplicate chapters by id ([#4810](https://github.com/shaka-project/shaka-player/issues/4810)) ([151bdda](https://github.com/shaka-project/shaka-player/commit/151bdda36d60499f5cfdd4d5c6ebbe088025cd2a))
* cmcd not applying configuration changes ([#5119](https://github.com/shaka-project/shaka-player/issues/5119)) ([58aa45f](https://github.com/shaka-project/shaka-player/commit/58aa45f285219928d2a6243d8a0e196c7606fb6b))
* Correct default initDataTransform for legacy Apple Media Keys ([#4797](https://github.com/shaka-project/shaka-player/issues/4797)) ([67a5d56](https://github.com/shaka-project/shaka-player/commit/67a5d56e8606c58cef6ff969aca6010e6db2dd16))
* **DASH:** Avoid "Possible encoding problem detected!" when appending chunked data ([#5376](https://github.com/shaka-project/shaka-player/issues/5376)) ([2071e3a](https://github.com/shaka-project/shaka-player/commit/2071e3ae6302be3fcb15f774b85525f9067e5798))
* **DASH:** Fix bufferBehind with image tracks regression ([#5210](https://github.com/shaka-project/shaka-player/issues/5210)) ([2d9f566](https://github.com/shaka-project/shaka-player/commit/2d9f56627a482cbd8e4687e83e478339ddc3b70a))
* **DASH:** Fix dynamic manifests from edgeware ([#4914](https://github.com/shaka-project/shaka-player/issues/4914)) ([056588b](https://github.com/shaka-project/shaka-player/commit/056588b2e1eaf2e627cb8878735f4db5d0d04087))
* **DASH:** Fix seeking on multiperiod content after variant change ([#5110](https://github.com/shaka-project/shaka-player/issues/5110)) ([3b0f013](https://github.com/shaka-project/shaka-player/commit/3b0f01377f526a42662c2ff4843d49f860f44bea))
* **DASH:** Ignore minBufferTime when using LL ([#5285](https://github.com/shaka-project/shaka-player/issues/5285)) ([fea46d8](https://github.com/shaka-project/shaka-player/commit/fea46d88cd9e2caef00b5ab272b0abcfb1251498))
* Default language to 'und' for native tracks ([#5464](https://github.com/shaka-project/shaka-player/issues/5464)) ([8cd3e2d](https://github.com/shaka-project/shaka-player/commit/8cd3e2dd2686acaccbd6f11484f5386719cfd54e))
* **Demo:** Allow enable LL only with Low Latency Mode config ([#5266](https://github.com/shaka-project/shaka-player/issues/5266)) ([70823f9](https://github.com/shaka-project/shaka-player/commit/70823f96a6c55d2eda8930cd72895dca89715c63))
* **Demo:** Allow manifest type for DAI custom assets ([#4977](https://github.com/shaka-project/shaka-player/issues/4977)) ([1e50630](https://github.com/shaka-project/shaka-player/commit/1e50630ad4631cd2455f0e8a179012de34935a80))
* **Demo:** Fix deployment of codem-isoboxer in the Demo ([#5257](https://github.com/shaka-project/shaka-player/issues/5257)) ([03b39f7](https://github.com/shaka-project/shaka-player/commit/03b39f75dacfc6a14cafb6afced35a9cff05c6b0))
* **Demo:** Fix error link width to avoid overlap with close button ([#5309](https://github.com/shaka-project/shaka-player/issues/5309)) ([08317d0](https://github.com/shaka-project/shaka-player/commit/08317d063284acd298c6c27d73efdf58c08d9911))
* **demo:** Fix native controls pointer events stolen by LCEVC canvas ([#5065](https://github.com/shaka-project/shaka-player/issues/5065)) ([6508f40](https://github.com/shaka-project/shaka-player/commit/6508f4037478c038dc8a0684d6cee784a827eab4))
* **Demo:** Show correctly external text in the Demo ([#5521](https://github.com/shaka-project/shaka-player/issues/5521)) ([e2bf1de](https://github.com/shaka-project/shaka-player/commit/e2bf1de03ec39a751d61b716384697b624bdecbc))
* **Demo:** Trim custom manifestUri to avoid copy-paste errors ([#5378](https://github.com/shaka-project/shaka-player/issues/5378)) ([0e32256](https://github.com/shaka-project/shaka-player/commit/0e322566dc9f51c4478e3b93fc467759c5ca1b94))
* Dispatch all emsg boxes, even if they are ID3 ([#5428](https://github.com/shaka-project/shaka-player/issues/5428)) ([25ecfa7](https://github.com/shaka-project/shaka-player/commit/25ecfa75d844482304e2bfd78b2af134ecb51cd4))
* **docs:** fix player configuration code in drm config tutorial ([#5359](https://github.com/shaka-project/shaka-player/issues/5359)) ([5487236](https://github.com/shaka-project/shaka-player/commit/5487236668d1d5178dd287af78b47ea0a647ffa1))
* Document Picture-in-Picture: Use width/height instead of initialAspectRatio ([#5224](https://github.com/shaka-project/shaka-player/issues/5224)) ([0da63a0](https://github.com/shaka-project/shaka-player/commit/0da63a05218ca2bdbe86039bc76577ae3b80e3ed))
* don't use navigator.connection event listener if it isn't implemented ([#5157](https://github.com/shaka-project/shaka-player/issues/5157)) ([fb68306](https://github.com/shaka-project/shaka-player/commit/fb6830693ca0dcde709d1b000dfacd4e6c05ec7b)), closes [#4542](https://github.com/shaka-project/shaka-player/issues/4542)
* **DRM:** broken keySystemsMapping due to multiple references of drmInfo ([#5388](https://github.com/shaka-project/shaka-player/issues/5388)) ([6513ac0](https://github.com/shaka-project/shaka-player/commit/6513ac056e5fd3ee9aecbb234c724119b058ef8d))
* DrmEngine exception thrown when using FairPlay ([#4971](https://github.com/shaka-project/shaka-player/issues/4971)) ([eebf18c](https://github.com/shaka-project/shaka-player/commit/eebf18cabdcee3c62daee9bed9ceb2958f30f9f5))
* exclude "future" segments from presentation timeline auto correct drift calculations ([#4945](https://github.com/shaka-project/shaka-player/issues/4945)) ([ea6774a](https://github.com/shaka-project/shaka-player/commit/ea6774a1fde3569df4a00992ed17093abefc73e9)), closes [#4944](https://github.com/shaka-project/shaka-player/issues/4944)
* Explicitly specify [@externs](https://github.com/externs) in transmuxer externs. ([#4999](https://github.com/shaka-project/shaka-player/issues/4999)) ([ef8078a](https://github.com/shaka-project/shaka-player/commit/ef8078a05f5b56cc4cabe7e6b78e14a5d26b89ce))
* Failed to set 'currentTime' property on 'HTMLMediaElement' on a Hisense TV ([#4962](https://github.com/shaka-project/shaka-player/issues/4962)) ([5d93b8f](https://github.com/shaka-project/shaka-player/commit/5d93b8f9a71214b984db45db3cda7ba40d86ff87))
* Fallback to isTypeSupported when cast namespace is undefined ([#5012](https://github.com/shaka-project/shaka-player/issues/5012)) ([50d0645](https://github.com/shaka-project/shaka-player/commit/50d0645a1e05e8a8dd9951ebd601639b7f5eb6c4))
* Fire correctly MIN_HDCP_VERSION_NOT_MATCH error ([2ae5a99](https://github.com/shaka-project/shaka-player/commit/2ae5a99642c5dc3b2971849b302d1a1b8e533ec2))
* Fix bufferBehind setting broken by image segments ([#4718](https://github.com/shaka-project/shaka-player/issues/4718)) ([cd1b7c0](https://github.com/shaka-project/shaka-player/commit/cd1b7c09429f9d13361a5ab1fdfb79940673f941)), closes [#4717](https://github.com/shaka-project/shaka-player/issues/4717)
* Fix buffering on the end of MSS streams ([#5196](https://github.com/shaka-project/shaka-player/issues/5196)) ([a8e3c9a](https://github.com/shaka-project/shaka-player/commit/a8e3c9ab310b14ca71610c568cffe108b30d38bf))
* Fix captions from MP4s with multiple trun boxes ([#5422](https://github.com/shaka-project/shaka-player/issues/5422)) ([bccfdbc](https://github.com/shaka-project/shaka-player/commit/bccfdbcea4a5d0a6af534833c793a5a8a5d84135)), closes [#5328](https://github.com/shaka-project/shaka-player/issues/5328)
* Fix compiler error on static use of "this" ([#4699](https://github.com/shaka-project/shaka-player/issues/4699)) ([b06fd6a](https://github.com/shaka-project/shaka-player/commit/b06fd6ad27b38238c401867971ce6b0ac1e53882))
* Fix DASH rejection of streams with ColourPrimaries and MatrixCoefficients ([#5345](https://github.com/shaka-project/shaka-player/issues/5345)) ([226ffa9](https://github.com/shaka-project/shaka-player/commit/226ffa9df6cc9c539febfc205886098d79b2281d))
* Fix DRM workaround for Tizen and Xbox with hvc1/hev1 boxes ([#4743](https://github.com/shaka-project/shaka-player/issues/4743)) ([a61c084](https://github.com/shaka-project/shaka-player/commit/a61c08433dab654edd224b2dc930c6d257460ec9)), closes [#4742](https://github.com/shaka-project/shaka-player/issues/4742)
* Fix duplicate updates in StreamingEngine ([#4840](https://github.com/shaka-project/shaka-player/issues/4840)) ([224207b](https://github.com/shaka-project/shaka-player/commit/224207ba6caf49b2cdb7434a0534df8210bc4be9)), closes [#4831](https://github.com/shaka-project/shaka-player/issues/4831)
* Fix duration error when HLS goes from LIVE to VOD ([#5001](https://github.com/shaka-project/shaka-player/issues/5001)) ([1aee989](https://github.com/shaka-project/shaka-player/commit/1aee98944f020427d081e9c7d1474675dac8b745))
* Fix error when network status changes on src= playbacks ([#5305](https://github.com/shaka-project/shaka-player/issues/5305)) ([07ca8f5](https://github.com/shaka-project/shaka-player/commit/07ca8f535a1bb16973754372276613d20fbe2c41))
* Fix exception enabling captions on HLS ([#4894](https://github.com/shaka-project/shaka-player/issues/4894)) ([b7b2a7c](https://github.com/shaka-project/shaka-player/commit/b7b2a7cbe9f1b23ca184617a2c51f26cc85bf0a3)), closes [#4889](https://github.com/shaka-project/shaka-player/issues/4889)
* Fix exception on Tizen due to unsupported Array method ([#5429](https://github.com/shaka-project/shaka-player/issues/5429)) ([8ff2917](https://github.com/shaka-project/shaka-player/commit/8ff29175d810fe94457e56ea3d0135f84ea712ab))
* Fix exiting fullscreen on Safari ([#5439](https://github.com/shaka-project/shaka-player/issues/5439)) ([ed93a0c](https://github.com/shaka-project/shaka-player/commit/ed93a0cb12173de65f76109136d179bb0f34c014)), closes [#5437](https://github.com/shaka-project/shaka-player/issues/5437)
* Fix failure when drivers lag behind browser ([#5423](https://github.com/shaka-project/shaka-player/issues/5423)) ([a909ed4](https://github.com/shaka-project/shaka-player/commit/a909ed4ce1e9f66456a3a9da79e28f52bb3cafd8))
* Fix fetch plugin with old implementations ([#5091](https://github.com/shaka-project/shaka-player/issues/5091)) ([36bcc37](https://github.com/shaka-project/shaka-player/commit/36bcc3775a71c22f1f5cd77bee229f219f8fc687))
* Fix flattenedCues in WebVttGenerator ([#4867](https://github.com/shaka-project/shaka-player/issues/4867)) ([15232dd](https://github.com/shaka-project/shaka-player/commit/15232ddf06294f7f932b2a97f619e6ff87514a6c))
* Fix gap jump at start when first jump lands in a new gap ([f56d49b](https://github.com/shaka-project/shaka-player/commit/f56d49b517c01cf4309dc227b7087aa725ce5344))
* Fix handling of CC when switching between codecs ([#5160](https://github.com/shaka-project/shaka-player/issues/5160)) ([6937325](https://github.com/shaka-project/shaka-player/commit/6937325b85d346fde6eba5c368ed201d152cc11f))
* Fix HEAD request exception ([#5194](https://github.com/shaka-project/shaka-player/issues/5194)) ([330f04b](https://github.com/shaka-project/shaka-player/commit/330f04b76fd8cbfbdc496e3c19a85d9b49746aca)), closes [#5164](https://github.com/shaka-project/shaka-player/issues/5164)
* Fix implementation of AAC and MP3 transmuxers ([#5296](https://github.com/shaka-project/shaka-player/issues/5296)) ([df18f10](https://github.com/shaka-project/shaka-player/commit/df18f10fca1b0ad643d9ee8dc02cc5bdbd22bab7))
* Fix legacy codec support by rewriting codec metadata ([#4858](https://github.com/shaka-project/shaka-player/issues/4858)) ([e351395](https://github.com/shaka-project/shaka-player/commit/e351395c4a78ccc9e3ceafaa0288cbd06489a927))
* Fix media source duration when using sequence mode ([#4848](https://github.com/shaka-project/shaka-player/issues/4848)) ([1762267](https://github.com/shaka-project/shaka-player/commit/1762267d356a04217340ec792c51ceadb842cd6a))
* Fix MediaCapabilities polyfill on Hisense ([#4927](https://github.com/shaka-project/shaka-player/issues/4927)) ([6a48cfe](https://github.com/shaka-project/shaka-player/commit/6a48cfe64da49c49aeaabeb646b0233537a2ae3e))
* Fix memory leak on SimpleAbrManager ([#5478](https://github.com/shaka-project/shaka-player/issues/5478)) ([e8f3ed0](https://github.com/shaka-project/shaka-player/commit/e8f3ed024bd389845bdc906168bf6dbfdbbd1c56))
* Fix missing originalUri in response filters ([#5114](https://github.com/shaka-project/shaka-player/issues/5114)) ([8bffb99](https://github.com/shaka-project/shaka-player/commit/8bffb99c6e19ca6f968490d8977518e61fc38ffd))
* Fix parsing error on Chromecast when resyncing HLS ([#4869](https://github.com/shaka-project/shaka-player/issues/4869)) ([afca6af](https://github.com/shaka-project/shaka-player/commit/afca6af230685a0c9b556fddb46341380b611923)), closes [#4589](https://github.com/shaka-project/shaka-player/issues/4589)
* Fix playRangeEnd does not work with HLS streams ([#5494](https://github.com/shaka-project/shaka-player/issues/5494)) ([1775672](https://github.com/shaka-project/shaka-player/commit/177567288f8ab7629d5b94226c95118a8849fb4e))
* Fix potential AV sync issues after seek or adaptation ([#4886](https://github.com/shaka-project/shaka-player/issues/4886)) ([c42565c](https://github.com/shaka-project/shaka-player/commit/c42565ccb9c69455307742e1f5c3c763892ec1c6)), closes [#4589](https://github.com/shaka-project/shaka-player/issues/4589)
* Fix potential duplicate segments, AV sync issues ([#4884](https://github.com/shaka-project/shaka-player/issues/4884)) ([52f4b63](https://github.com/shaka-project/shaka-player/commit/52f4b638b155b4b7f7f6a0bd14e6e9661d5cceba)), closes [#4589](https://github.com/shaka-project/shaka-player/issues/4589)
* Fix race that allows multiple text streams to be loaded ([#5129](https://github.com/shaka-project/shaka-player/issues/5129)) ([2ae9095](https://github.com/shaka-project/shaka-player/commit/2ae90950d509c065498fcf146970de84fcc4545b))
* Fix rare exception after StreamingEngine teardown ([#4830](https://github.com/shaka-project/shaka-player/issues/4830)) ([234beef](https://github.com/shaka-project/shaka-player/commit/234beefb73ea7f8a7442112eb2efb78d619a13cb)), closes [#4813](https://github.com/shaka-project/shaka-player/issues/4813)
* Fix selectVariantsByLabel using src= ([#5154](https://github.com/shaka-project/shaka-player/issues/5154)) ([e7d94f7](https://github.com/shaka-project/shaka-player/commit/e7d94f797d87d31b28a867a3d9560bdd691599a4))
* Fix subtitles not added to DOM region ([#4733](https://github.com/shaka-project/shaka-player/issues/4733)) ([4081434](https://github.com/shaka-project/shaka-player/commit/4081434eba7f90ea7fe8544665baf99f59ec5863)), closes [#4680](https://github.com/shaka-project/shaka-player/issues/4680)
* Fix temporarily disable streams on network error ([#5057](https://github.com/shaka-project/shaka-player/issues/5057)) ([fdc5cb1](https://github.com/shaka-project/shaka-player/commit/fdc5cb165d1cf02e48de8c814efaae6eb54a3dbe)), closes [#5055](https://github.com/shaka-project/shaka-player/issues/5055) [#5150](https://github.com/shaka-project/shaka-player/issues/5150)
* Fix timestamp offset for ID3 on DAI-HLS ([#4696](https://github.com/shaka-project/shaka-player/issues/4696)) ([386a28a](https://github.com/shaka-project/shaka-player/commit/386a28a8eb0cd995e7eee9f95c97b7f8e7542774))
* Fix usage of WebCrypto in old browsers ([#4711](https://github.com/shaka-project/shaka-player/issues/4711)) ([9afce3b](https://github.com/shaka-project/shaka-player/commit/9afce3b423406aae0cd2841bb39071c90196c792))
* Fix video/mp2t mimetype conversion. ([#5039](https://github.com/shaka-project/shaka-player/issues/5039)) ([2d0e4cc](https://github.com/shaka-project/shaka-player/commit/2d0e4cc4f4bb768d0c851e4038ecf297af9293e6))
* Fix WebVTT parser failure on REGION blocks ([#4915](https://github.com/shaka-project/shaka-player/issues/4915)) ([da84a2c](https://github.com/shaka-project/shaka-player/commit/da84a2c86b7d7e6968472ce9d2bbe09e0608dbef))
* gap jumping when gap exists at start position ([#5384](https://github.com/shaka-project/shaka-player/issues/5384)) ([6c71b0e](https://github.com/shaka-project/shaka-player/commit/6c71b0ee63fce62c9074788e255363dbbc9ba4e1))
* Get the correct timescale when there are two trak boxes ([#5327](https://github.com/shaka-project/shaka-player/issues/5327)) ([022f6b9](https://github.com/shaka-project/shaka-player/commit/022f6b96fb6620446fe14e0f6e25b5d81c92aefa))
* gettting maxWidth and maxHeight for restrictToElementSize option ([#5481](https://github.com/shaka-project/shaka-player/issues/5481)) ([9a3ac18](https://github.com/shaka-project/shaka-player/commit/9a3ac18f1bbdae282b0614aabf6cad45e6511164))
* Handle empty media segments for Mp4VttParser ([#5131](https://github.com/shaka-project/shaka-player/issues/5131)) ([6fd44c4](https://github.com/shaka-project/shaka-player/commit/6fd44c491043f3dfbe0034fcd3023fda1986d7da)), closes [#4429](https://github.com/shaka-project/shaka-player/issues/4429)
* **HLS:** Add `.tsa` and .`tsv` file extensions as valid MPEG2-TS. ([#5034](https://github.com/shaka-project/shaka-player/issues/5034)) ([a22bdc5](https://github.com/shaka-project/shaka-player/commit/a22bdc51f46376d3cda02d2767388a2b19b61d58))
* **HLS:** Add subtitle role when there are no roles ([#5357](https://github.com/shaka-project/shaka-player/issues/5357)) ([7de6340](https://github.com/shaka-project/shaka-player/commit/7de6340161fbd9c5b53bb6b67bcdd69d8b6ba780)), closes [#5355](https://github.com/shaka-project/shaka-player/issues/5355)
* **HLS:** Adding support for DTS Express in HLS fMP4 ([#5112](https://github.com/shaka-project/shaka-player/issues/5112)) ([#5117](https://github.com/shaka-project/shaka-player/issues/5117)) ([67b1e90](https://github.com/shaka-project/shaka-player/commit/67b1e903458965ac636d165e902b02b7d55cb857))
* **HLS:** Avoid "Possible encoding problem detected!" when is a preload reference ([#5332](https://github.com/shaka-project/shaka-player/issues/5332)) ([bd18a9d](https://github.com/shaka-project/shaka-player/commit/bd18a9de6068388849dd8af4088ce1e1b770d9c6))
* **HLS:** Avoid HLS resync when there is a gap in the stream ([#5284](https://github.com/shaka-project/shaka-player/issues/5284)) ([b8c2004](https://github.com/shaka-project/shaka-player/commit/b8c2004e0203b002fb3ea6fec740a53d48d74b33))
* **HLS:** Avoid variable substitution if no variables ([#5269](https://github.com/shaka-project/shaka-player/issues/5269)) ([5a5a7ac](https://github.com/shaka-project/shaka-player/commit/5a5a7acf5112148e62dfd033c3be568b8f4a56b5))
* **HLS:** Consider skipped segments to calculate next media sequence ([#5414](https://github.com/shaka-project/shaka-player/issues/5414)) ([b7d2305](https://github.com/shaka-project/shaka-player/commit/b7d2305a60c0a27630ed66981a9f22ddcf811cc8))
* **HLS:** don't do sequence mode workaround unless there's a text stream ([#5079](https://github.com/shaka-project/shaka-player/issues/5079)) ([fb22669](https://github.com/shaka-project/shaka-player/commit/fb226692eff74d3bddf76c5a371c6592cf1700f1))
* **HLS:** Don't do sequence mode workaround unless there's a text stream ([#5315](https://github.com/shaka-project/shaka-player/issues/5315)) ([019dcfd](https://github.com/shaka-project/shaka-player/commit/019dcfd9a298516797ab189384f506c416cf7d18))
* **HLS:** Fix AV sync over ad boundaries ([#4824](https://github.com/shaka-project/shaka-player/issues/4824)) ([35033bb](https://github.com/shaka-project/shaka-player/commit/35033bb2db1ca630f4f7895e7678bd0ee6cfd9ef)), closes [#4589](https://github.com/shaka-project/shaka-player/issues/4589)
* **HLS:** Fix avoid prefetch missing segments ([#5372](https://github.com/shaka-project/shaka-player/issues/5372)) ([7f8e051](https://github.com/shaka-project/shaka-player/commit/7f8e051886e6aab1b7a1997a600f982ca38c0c6c))
* **HLS:** Fix detection of Media Playlist for audio and video only in MP4 ([#4803](https://github.com/shaka-project/shaka-player/issues/4803)) ([76f96b9](https://github.com/shaka-project/shaka-player/commit/76f96b9fee2dc43b03f6803dd80c51fdc5b73a9e))
* **HLS:** Fix detection of WebVTT subtitles in HLS by extension ([#4928](https://github.com/shaka-project/shaka-player/issues/4928)) ([15b0388](https://github.com/shaka-project/shaka-player/commit/15b03884bb61542f451f7854a8562aa3d759ed0f)), closes [#4929](https://github.com/shaka-project/shaka-player/issues/4929)
* **HLS:** Fix discontinuity tracking ([#4881](https://github.com/shaka-project/shaka-player/issues/4881)) ([fc3d5c1](https://github.com/shaka-project/shaka-player/commit/fc3d5c144708c748d90f25de34c436495db2a816)), closes [#4589](https://github.com/shaka-project/shaka-player/issues/4589)
* **HLS:** Fix dvh1 and dvhe detection as video codec ([#5364](https://github.com/shaka-project/shaka-player/issues/5364)) ([37b7be6](https://github.com/shaka-project/shaka-player/commit/37b7be60b2d560f72e5149918007d4f1cd655e77))
* **HLS:** Fix external subtitles out of sync in HLS ([#5491](https://github.com/shaka-project/shaka-player/issues/5491)) ([de19884](https://github.com/shaka-project/shaka-player/commit/de19884dd151b49c69d622ed16398716832a958e))
* **HLS:** Fix HLS seekRange for live streams ([#5263](https://github.com/shaka-project/shaka-player/issues/5263)) ([258962f](https://github.com/shaka-project/shaka-player/commit/258962f9e0a9a7df6c13db7dbf0e8a54cd3a2ae2))
* **HLS:** fix lazy load with multiple raw audio tracks ([#4715](https://github.com/shaka-project/shaka-player/issues/4715)) ([76149ae](https://github.com/shaka-project/shaka-player/commit/76149ae7453ccff852483b437c9de72cb6ebfbf5))
* **HLS:** Fix live playlist update when using no LL in a LL stream ([#5282](https://github.com/shaka-project/shaka-player/issues/5282)) ([ad2eef6](https://github.com/shaka-project/shaka-player/commit/ad2eef6952b6164a67a5ab1d85f3a0e7071eb7cd))
* **HLS:** Fix load of LL-HLS when the partial segment is not independent ([#5277](https://github.com/shaka-project/shaka-player/issues/5277)) ([ed5915e](https://github.com/shaka-project/shaka-player/commit/ed5915e437db16983a5a8c84f900367af4736cb4))
* **HLS:** Fix lowLatencyPresentationDelay when using autoLowLatencyMode ([#4712](https://github.com/shaka-project/shaka-player/issues/4712)) ([877e954](https://github.com/shaka-project/shaka-player/commit/877e9542170aa0467d28b5edb5a4b1b29dd4452e))
* **HLS:** Fix missing roles ([#4760](https://github.com/shaka-project/shaka-player/issues/4760)) ([2bc481d](https://github.com/shaka-project/shaka-player/commit/2bc481decd11ec1db93e3bb5ca0db4a644b13269)), closes [#4759](https://github.com/shaka-project/shaka-player/issues/4759)
* **HLS:** Fix prefetch with LL-HLS stream ([#5274](https://github.com/shaka-project/shaka-player/issues/5274)) ([551422a](https://github.com/shaka-project/shaka-player/commit/551422a6f6a8da8a97485bee5552fd118ff933e7))
* **HLS:** Fix seek on LL streams when using segments mode ([#5283](https://github.com/shaka-project/shaka-player/issues/5283)) ([d4f3f5c](https://github.com/shaka-project/shaka-player/commit/d4f3f5c0686f0a6304bafbd86f9baf8a2bc6b9fb))
* **HLS:** Fix seekRange for EVENT playlist not using EXT-X-PLAYLIST-TYPE ([#5220](https://github.com/shaka-project/shaka-player/issues/5220)) ([1c89204](https://github.com/shaka-project/shaka-player/commit/1c892045dd5df5a2c831c6aac79428eca058415c))
* **HLS:** Fix support for mixed AES-128/NONE decryption ([#4847](https://github.com/shaka-project/shaka-player/issues/4847)) ([452694d](https://github.com/shaka-project/shaka-player/commit/452694d59785f2e88cab607618f10ba980851805))
* **HLS:** Fix support legacy AVC1 codec used in HLS ([#4716](https://github.com/shaka-project/shaka-player/issues/4716)) ([c3ff8e5](https://github.com/shaka-project/shaka-player/commit/c3ff8e5e5f6ad5867ed0650e153627dafcb1bcf7))
* **HLS:** Fix support of fragmented WebVTT ([#5156](https://github.com/shaka-project/shaka-player/issues/5156)) ([9c4a61f](https://github.com/shaka-project/shaka-player/commit/9c4a61f836e0c982bcf6677891487723a03ae465))
* **hls:** Fix type error in lazy-loading ([#4687](https://github.com/shaka-project/shaka-player/issues/4687)) ([28b73b9](https://github.com/shaka-project/shaka-player/commit/28b73b921d1dbdc6d7e016aa8e0a000e62318ed3))
* **HLS:** Ignore segments with zero duration ([#5371](https://github.com/shaka-project/shaka-player/issues/5371)) ([c25b26a](https://github.com/shaka-project/shaka-player/commit/c25b26a26a7e930af9455bae2f9d82804b921b7b))
* **HLS:** IMSC1 subtitles not working in a HLS stream ([#4942](https://github.com/shaka-project/shaka-player/issues/4942)) ([974f5dc](https://github.com/shaka-project/shaka-player/commit/974f5dcb630977fcdb8ac67d1af001919cf40f7f))
* **HLS:** Mark first partial segment as independent always ([#5312](https://github.com/shaka-project/shaka-player/issues/5312)) ([ea896d5](https://github.com/shaka-project/shaka-player/commit/ea896d5bd71127147c4e31c9da2f3737cae6abc6))
* **HLS:** Parse EXT-X-PART-INF as media playlist tag ([#5311](https://github.com/shaka-project/shaka-player/issues/5311)) ([d29f4bc](https://github.com/shaka-project/shaka-player/commit/d29f4bc5b5188397f746ba3b3d74bd9620975219))
* **HLS:** Parse the correct codec for AVC and MP4A in HLS parser ([#5515](https://github.com/shaka-project/shaka-player/issues/5515)) ([f3fa4f8](https://github.com/shaka-project/shaka-player/commit/f3fa4f87927f8adbb21673d2e619a11ab31e66fe))
* **HLS:** preserve discontinuitySequence in SegmentIndex#fit ([#5066](https://github.com/shaka-project/shaka-player/issues/5066)) ([36a15f6](https://github.com/shaka-project/shaka-player/commit/36a15f60724309edc7c8becf6f09b58238725d2d))
* **HLS:** Report HLS playlist updates as media playlist in network filters ([#5120](https://github.com/shaka-project/shaka-player/issues/5120)) ([c2a59d0](https://github.com/shaka-project/shaka-player/commit/c2a59d0d0cb9177887ee652f73d06f251fe1e89f))
* **HLS:** Require SegmentIndex to return independent segments only ([#5288](https://github.com/shaka-project/shaka-player/issues/5288)) ([9f80e3c](https://github.com/shaka-project/shaka-player/commit/9f80e3cda6348a4952ffa3d624120f4105bbb926))
* **HLS:** Single alternative video renditions not working ([#4785](https://github.com/shaka-project/shaka-player/issues/4785)) ([6915a97](https://github.com/shaka-project/shaka-player/commit/6915a970efead95d41dbe05a824f699e7c68a3a5))
* **HLS:** Skip EXT-X-PRELOAD-HINT without full byterange info ([#5294](https://github.com/shaka-project/shaka-player/issues/5294)) ([32d141d](https://github.com/shaka-project/shaka-player/commit/32d141d7e2bf43a0aa0928ff2814fc556a264e87))
* **HLS:** support discontinuities in segments mode ([#5102](https://github.com/shaka-project/shaka-player/issues/5102)) ([71affe7](https://github.com/shaka-project/shaka-player/commit/71affe7e8530917c6d578fae544c5d1d62214feb))
* **HLS:** Supports syncTime in partial segments ([#5280](https://github.com/shaka-project/shaka-player/issues/5280)) ([9dddc09](https://github.com/shaka-project/shaka-player/commit/9dddc09b897686ae5f838c1207ae2a77646ee1a1))
* Increase IndexedDB timeout ([#4984](https://github.com/shaka-project/shaka-player/issues/4984)) ([ea290ab](https://github.com/shaka-project/shaka-player/commit/ea290ab958385f81ef8ad4ce855100dc21d26667))
* **logging:** Simplify log code. ([#5050](https://github.com/shaka-project/shaka-player/issues/5050)) ([6944976](https://github.com/shaka-project/shaka-player/commit/694497684cda6b5eeb23d7181d0a8c96f8ede988)), closes [#5032](https://github.com/shaka-project/shaka-player/issues/5032)
* Make encoding problem detection more robust ([#4885](https://github.com/shaka-project/shaka-player/issues/4885)) ([0e3621c](https://github.com/shaka-project/shaka-player/commit/0e3621c21e914b38640e0c2c8cf9bece6158efad)), closes [#4589](https://github.com/shaka-project/shaka-player/issues/4589)
* Manually order key for decodingInfo cache ([#4795](https://github.com/shaka-project/shaka-player/issues/4795)) ([806a9a8](https://github.com/shaka-project/shaka-player/commit/806a9a81c4e6d16d8affa46010665479bfa5bdff))
* **MCap:** Remove robustness when robustness value is default ([#4953](https://github.com/shaka-project/shaka-player/issues/4953)) ([7439a26](https://github.com/shaka-project/shaka-player/commit/7439a264d63ff5b68b0411098939eb19708d7134))
* media source object URL revocation ([#5214](https://github.com/shaka-project/shaka-player/issues/5214)) ([fecb11a](https://github.com/shaka-project/shaka-player/commit/fecb11a230fa4eff94c14986a31ae00021ef5674))
* **media:** Fix region checking in livestreams ([#5361](https://github.com/shaka-project/shaka-player/issues/5361)) ([9fffcb9](https://github.com/shaka-project/shaka-player/commit/9fffcb9ea627832b3a49df0cfb094a8fd153866a)), closes [#5213](https://github.com/shaka-project/shaka-player/issues/5213)
* mitigate uncaught type error in media_source_engine ([#5069](https://github.com/shaka-project/shaka-player/issues/5069)) ([e19fa80](https://github.com/shaka-project/shaka-player/commit/e19fa80090d64a6eb76c53d68afe442c51f0727a)), closes [#4903](https://github.com/shaka-project/shaka-player/issues/4903)
* **net:** Fix HEAD requests in new Chromium ([#5180](https://github.com/shaka-project/shaka-player/issues/5180)) ([5155493](https://github.com/shaka-project/shaka-player/commit/51554934bebfe8aa62b6a728ae0bbd39758f5532)), closes [#5164](https://github.com/shaka-project/shaka-player/issues/5164)
* Only parse/probe TS if the reference is not an MP4 and not WebM ([#5381](https://github.com/shaka-project/shaka-player/issues/5381)) ([b1e7cc4](https://github.com/shaka-project/shaka-player/commit/b1e7cc4e67373d7ae7ab083fe5b626e28282e96b))
* Orange set top box is incorrectly categorized as Apple ([#5545](https://github.com/shaka-project/shaka-player/issues/5545)) ([937484e](https://github.com/shaka-project/shaka-player/commit/937484e0cb58b2c2ce3149beece291d4e0447b6a))
* PERIOD_FLATTENING_FAILED error with shaka 4.3.4 that did not occur with shaka 3.1.2 [#5183](https://github.com/shaka-project/shaka-player/issues/5183)  ([#5188](https://github.com/shaka-project/shaka-player/issues/5188)) ([e855326](https://github.com/shaka-project/shaka-player/commit/e855326cffb23f935f56c7411bb79f479a8db9c4))
* Polyfill missing AbortController on Tizen ([#4707](https://github.com/shaka-project/shaka-player/issues/4707)) ([75ef975](https://github.com/shaka-project/shaka-player/commit/75ef9752a4c7d618a934da773e35ed4d27a9bdf5))
* Populate HDR correctly ([#5369](https://github.com/shaka-project/shaka-player/issues/5369)) ([1ad75ec](https://github.com/shaka-project/shaka-player/commit/1ad75ec8b7da2afe75a5d41fe027c016679f5873))
* prevent access to null config_ in SimpleAbrManager ([#5362](https://github.com/shaka-project/shaka-player/issues/5362)) ([d1db694](https://github.com/shaka-project/shaka-player/commit/d1db694f6e58d27ae40e9b37f8fd8238c5d4d167))
* Prevent bad calls to MediaSource.endOfStream ([#5071](https://github.com/shaka-project/shaka-player/issues/5071)) ([64389a2](https://github.com/shaka-project/shaka-player/commit/64389a274a2d11039cd3d543bec847e1a672cccc)), closes [#5070](https://github.com/shaka-project/shaka-player/issues/5070)
* Prevent content from being restarted after Postroll ads ([#4979](https://github.com/shaka-project/shaka-player/issues/4979)) ([64e94f1](https://github.com/shaka-project/shaka-player/commit/64e94f1c79f3eda75e762474502ba2fc70fb9ee2)), closes [#4445](https://github.com/shaka-project/shaka-player/issues/4445)
* prevent memory leak in SimpleAbrManager while destroying ([#5149](https://github.com/shaka-project/shaka-player/issues/5149)) ([bbf228c](https://github.com/shaka-project/shaka-player/commit/bbf228c07664360ca0e8dc5e26deb59a863deb47))
* Reject TS content on Edge ([#5043](https://github.com/shaka-project/shaka-player/issues/5043)) ([8818a02](https://github.com/shaka-project/shaka-player/commit/8818a026d647b984825c92deacdc0630d6715b45))
* Release region timeline when unloading ([#4871](https://github.com/shaka-project/shaka-player/issues/4871)) ([a236180](https://github.com/shaka-project/shaka-player/commit/a2361806ce3b2eab60024cdca81ecb1ea5a0ed8a)), closes [#4850](https://github.com/shaka-project/shaka-player/issues/4850)
* Remove duplicate adaptation event before init ([#5492](https://github.com/shaka-project/shaka-player/issues/5492)) ([e3b2e7d](https://github.com/shaka-project/shaka-player/commit/e3b2e7d1e47da7e7ad99d4c480c9863f686cf5fc))
* Remove sourcebuffer before create a new media source instance ([#5533](https://github.com/shaka-project/shaka-player/issues/5533)) ([0056c0a](https://github.com/shaka-project/shaka-player/commit/0056c0a6b2bd6e6f2ff2a86d5cbc45776f19f99b))
* Ship to NPM without node version restrictions ([#5253](https://github.com/shaka-project/shaka-player/issues/5253)) ([524a80b](https://github.com/shaka-project/shaka-player/commit/524a80b4498d63c67efb97554641e41860270e83)), closes [#5243](https://github.com/shaka-project/shaka-player/issues/5243)
* stream property of request context obfuscated in production builds ([#5118](https://github.com/shaka-project/shaka-player/issues/5118)) ([93baba2](https://github.com/shaka-project/shaka-player/commit/93baba20a1b1a20bfac6742703d5701e523b535d))
* Support fLaC and Opus codec strings in HLS ([#5454](https://github.com/shaka-project/shaka-player/issues/5454)) ([ccc3d2f](https://github.com/shaka-project/shaka-player/commit/ccc3d2fb7171b35c64951d6e8054b8e7f8082d20)), closes [#5453](https://github.com/shaka-project/shaka-player/issues/5453)
* Sync each segment against EXT-X-PROGRAM-DATE-TIME ([#4870](https://github.com/shaka-project/shaka-player/issues/4870)) ([50c9df4](https://github.com/shaka-project/shaka-player/commit/50c9df49a70e17b8b2973ae7a7d47d7856cd09f8)), closes [#4589](https://github.com/shaka-project/shaka-player/issues/4589)
* Tizen video error fixed by checking the extended MIME type ([#4973](https://github.com/shaka-project/shaka-player/issues/4973)) ([eb01c60](https://github.com/shaka-project/shaka-player/commit/eb01c60b2746907692f9b76cc7dfda55d5cd2056)), closes [#4634](https://github.com/shaka-project/shaka-player/issues/4634)
* Transmux containerless to the correct mimetype ([#5205](https://github.com/shaka-project/shaka-player/issues/5205)) ([bb40d3b](https://github.com/shaka-project/shaka-player/commit/bb40d3bf24fe571916c150bba23c752381334cab))
* Treat regions uniquely ([#4841](https://github.com/shaka-project/shaka-player/issues/4841)) ([5681efe](https://github.com/shaka-project/shaka-player/commit/5681efe95cb7e32e2eddd6fcae1b44d265407939)), closes [#4839](https://github.com/shaka-project/shaka-player/issues/4839)
* **TTML:** Add font-family mapping ([#4801](https://github.com/shaka-project/shaka-player/issues/4801)) ([db8987d](https://github.com/shaka-project/shaka-player/commit/db8987d6dfdb59b9f6d187051d47edf6d846a9ed))
* **TTML:** Fix duplicate cues overlapping segment boundaries ([#4798](https://github.com/shaka-project/shaka-player/issues/4798)) ([bd75032](https://github.com/shaka-project/shaka-player/commit/bd75032d63755044d2d78ca109e2e9f132e36a00)), closes [#4631](https://github.com/shaka-project/shaka-player/issues/4631)
* Typing of PeriodCombiner.Period was incorrect ([#5442](https://github.com/shaka-project/shaka-player/issues/5442)) ([845649b](https://github.com/shaka-project/shaka-player/commit/845649b001e4dac4ed09d1a832b8213c8c56555d))
* **ui:** Avoid submitting form if player is inside form ([#4866](https://github.com/shaka-project/shaka-player/issues/4866)) ([da21850](https://github.com/shaka-project/shaka-player/commit/da21850f21ac94fc06349b528a2bf7c17487b681)), closes [#4861](https://github.com/shaka-project/shaka-player/issues/4861)
* **ui:** Check event cancelable before event.preventDefault ([#4690](https://github.com/shaka-project/shaka-player/issues/4690)) ([6d8de72](https://github.com/shaka-project/shaka-player/commit/6d8de72dafa757ac7d00ef7c4acbfab6529b15c2))
* **UI:** Disable right click on range elements ([#5497](https://github.com/shaka-project/shaka-player/issues/5497)) ([3333ca4](https://github.com/shaka-project/shaka-player/commit/3333ca449db25f4a6f34d21ede1fc68ebb5849f1))
* **ui:** Fix iOS fullscreen on rotation ([#4679](https://github.com/shaka-project/shaka-player/issues/4679)) ([86256f4](https://github.com/shaka-project/shaka-player/commit/86256f49202e64d15f53c7d29e5cac150f018d5c))
* **UI:** Fix playback restarts in safari when click on seekbar end ([#5527](https://github.com/shaka-project/shaka-player/issues/5527)) ([4235658](https://github.com/shaka-project/shaka-player/commit/42356589d579077af082143974e70cf897a7b658))
* **UI:** Fix resolution selection on src= ([#5367](https://github.com/shaka-project/shaka-player/issues/5367)) ([3863c73](https://github.com/shaka-project/shaka-player/commit/3863c73a15343e7879385c636a47c4a077d84e87))
* **UI:** Suppress error log from fullscreen button on desktop ([#4823](https://github.com/shaka-project/shaka-player/issues/4823)) ([99da4ce](https://github.com/shaka-project/shaka-player/commit/99da4ce7dea43ae67870acbcf708ed6479efa7cc)), closes [#4822](https://github.com/shaka-project/shaka-player/issues/4822)
* **UI:** Use pagehide instead of unload for PiP ([#5303](https://github.com/shaka-project/shaka-player/issues/5303)) ([a543b80](https://github.com/shaka-project/shaka-player/commit/a543b80648f429524c522295b0f4f60039c2e0ea))
* unnecessary parsing of in-band pssh when pssh is in the manifest ([#5198](https://github.com/shaka-project/shaka-player/issues/5198)) ([05aa931](https://github.com/shaka-project/shaka-player/commit/05aa93146129240f15309a4c7d04e531ee8edd57)), closes [#5197](https://github.com/shaka-project/shaka-player/issues/5197)
* Update karma-local-wd-launcher to fix Chromedriver &gt;= 115, fix M1 mac ([#5489](https://github.com/shaka-project/shaka-player/issues/5489)) ([c8a27ca](https://github.com/shaka-project/shaka-player/commit/c8a27ca248bfd4651a77bd511c2aaf3b4ac84eb8))
* Update karma-local-wd-launcher to fix Edge &gt;= 115 ([#5506](https://github.com/shaka-project/shaka-player/issues/5506)) ([3104a76](https://github.com/shaka-project/shaka-player/commit/3104a76814fe8fdc1e386bf47078d472012e7bff))
* **VTT:** Fix combining style selectors ([#4934](https://github.com/shaka-project/shaka-player/issues/4934)) ([128562d](https://github.com/shaka-project/shaka-player/commit/128562d93e90ba406c8cbde1af730052fcfc5175))
* **VTT:** Fix spacing between text lines ([#4961](https://github.com/shaka-project/shaka-player/issues/4961)) ([2d0469f](https://github.com/shaka-project/shaka-player/commit/2d0469fb4a2ee62d67fb9f0dbac8009b667156f2))
* **WebVTT:** Add support to &nbsp;, &lrm; and &rlm; ([#4920](https://github.com/shaka-project/shaka-player/issues/4920)) ([726ef42](https://github.com/shaka-project/shaka-player/commit/726ef425b095543a216ba8fed0dfe6d1657e2e95))
* **WebVTT:** Add support to middle position ([#5366](https://github.com/shaka-project/shaka-player/issues/5366)) ([5691d5e](https://github.com/shaka-project/shaka-player/commit/5691d5e4592ffdf712fc830547691f464fed031a))
* **WebVTT:** Fix horizontal positioning with cue box size ([#4949](https://github.com/shaka-project/shaka-player/issues/4949)) ([f456318](https://github.com/shaka-project/shaka-player/commit/f45631834d363b23eb8897b03bce9b3b1b50ca9a))
* **WebVTT:** Fix text-shadow in WebVTT not working ([#5499](https://github.com/shaka-project/shaka-player/issues/5499)) ([ac6a92a](https://github.com/shaka-project/shaka-player/commit/ac6a92a28d95d8008188d482c54cd1d817ce3184))
* **WebVTT:** Fix voice tag styles ([a5f8b43](https://github.com/shaka-project/shaka-player/commit/a5f8b4361e38973c74d0180b5ba7769f636c651d))
* **WebVTT:** Fix voices with styles and support to multiple styles ([#4922](https://github.com/shaka-project/shaka-player/issues/4922)) ([68968c1](https://github.com/shaka-project/shaka-player/commit/68968c17d8ad1eaca6afa6d86bb4f8b1baa69d10))
* **WebVTT:** Tags in the WebVTT subtitle are not parsed ([#4960](https://github.com/shaka-project/shaka-player/issues/4960)) ([d4fc54f](https://github.com/shaka-project/shaka-player/commit/d4fc54f8dc68668244b72405b9f972c711b9a868))


### Performance Improvements

* Caching mediaSource support for browser engine ([#4778](https://github.com/shaka-project/shaka-player/issues/4778)) ([ad6c085](https://github.com/shaka-project/shaka-player/commit/ad6c08561d509cd0cf0e7f4736ba4473774577d9))

## [4.3.0](https://github.com/shaka-project/shaka-player/compare/v4.2.0...v4.3.0) (2022-11-10)


### Features

* Add AAC transmuxer ([#4632](https://github.com/shaka-project/shaka-player/issues/4632)) ([8623a5d](https://github.com/shaka-project/shaka-player/commit/8623a5d0304dd3e65c613b176b4afa38a6dc96b5))
* Add config for sequenceMode in DASH ([#4607](https://github.com/shaka-project/shaka-player/issues/4607)) ([aff2a5d](https://github.com/shaka-project/shaka-player/commit/aff2a5d9e81e5fdfaeb91275aaa0821aa189d34f))
* Add external thumbnails support ([#4497](https://github.com/shaka-project/shaka-player/issues/4497)) ([3582f0a](https://github.com/shaka-project/shaka-player/commit/3582f0a7274d6bb6f0bbfdf2ad51c5ecfb6f974b))
* Add external thumbnails with sprites support ([#4584](https://github.com/shaka-project/shaka-player/issues/4584)) ([86cb3e7](https://github.com/shaka-project/shaka-player/commit/86cb3e714cc3f59cff8f0b33adb291e128c32609))
* Add limited support for HLS "identity" key format ([#4451](https://github.com/shaka-project/shaka-player/issues/4451)) ([b1e81a6](https://github.com/shaka-project/shaka-player/commit/b1e81a684afe086b7a37ea29bbbfc972575ba332)), closes [#2146](https://github.com/shaka-project/shaka-player/issues/2146)
* Adds ChannelCount as a filter to the Player Select Audio Track Method ([#4552](https://github.com/shaka-project/shaka-player/issues/4552)) ([9dd945c](https://github.com/shaka-project/shaka-player/commit/9dd945c3df7364b90a9c3cb3150021492ebb7d81)), closes [#4550](https://github.com/shaka-project/shaka-player/issues/4550)
* **ads:** Add getDescription to CS and SS ads ([#4526](https://github.com/shaka-project/shaka-player/issues/4526)) ([7d2a170](https://github.com/shaka-project/shaka-player/commit/7d2a170336b828e8aac871ff276dbb8b42c384a4))
* **ads:** Add getTitle to CS and SS ads ([#4513](https://github.com/shaka-project/shaka-player/issues/4513)) ([a019065](https://github.com/shaka-project/shaka-player/commit/a019065d5d19598c9d0ba6ce5d4d79070f3e3cba))
* **ads:** Ignore ad events with no associated ad ([#4488](https://github.com/shaka-project/shaka-player/issues/4488)) ([e826eb8](https://github.com/shaka-project/shaka-player/commit/e826eb8eec207dd2ebd4d4ee1e44510ebff22b71)), closes [#4481](https://github.com/shaka-project/shaka-player/issues/4481)
* Allow add extra features to MediaSource.addSourceBuffer ([#4527](https://github.com/shaka-project/shaka-player/issues/4527)) ([4033be7](https://github.com/shaka-project/shaka-player/commit/4033be7c5b1d1c397d5a4840ef7333a26ca93983))
* Allow clearKey configuration in base64 or hex ([#4627](https://github.com/shaka-project/shaka-player/issues/4627)) ([29ffc89](https://github.com/shaka-project/shaka-player/commit/29ffc89a117e6f4285c0133dce555e44a1414228))
* Allow customization of HLS Live behavior ([#4578](https://github.com/shaka-project/shaka-player/issues/4578)) ([4914201](https://github.com/shaka-project/shaka-player/commit/4914201f86f6e683b64c7cc3338cdf67cee544cf))
* Allow playback of HLS Media Playlist with AAC by default ([#4564](https://github.com/shaka-project/shaka-player/issues/4564)) ([757b34e](https://github.com/shaka-project/shaka-player/commit/757b34e5959f14c9a5b5aed173cc99d98a794a40))
* Allow playback of HLS Media Playlist with RAW formats by default and support ID3 ([#4591](https://github.com/shaka-project/shaka-player/issues/4591)) ([18d8367](https://github.com/shaka-project/shaka-player/commit/18d836746e20164409c070c787e08b8bcf4da180))
* Automatic ABR quality restrictions based on screen size ([#4515](https://github.com/shaka-project/shaka-player/issues/4515)) ([b5935a8](https://github.com/shaka-project/shaka-player/commit/b5935a8a6b3b05c0c4cd10774a9625b0bbaf1cf6))
* **demo:** Demo visualizer for buffered ranges. ([#4417](https://github.com/shaka-project/shaka-player/issues/4417)) ([55d0a15](https://github.com/shaka-project/shaka-player/commit/55d0a1556a273b6af0da16197b424796a175adf8))
* enable uninstalling PatchedMediaKeysApple ([#4471](https://github.com/shaka-project/shaka-player/issues/4471)) ([7166f0c](https://github.com/shaka-project/shaka-player/commit/7166f0c1d09ad458abf0ee18e961c88f415afefc)), closes [#4469](https://github.com/shaka-project/shaka-player/issues/4469)
* **HLS:** Add support for EXT-X-SESSION-KEY tag ([#4655](https://github.com/shaka-project/shaka-player/issues/4655)) ([172c9f8](https://github.com/shaka-project/shaka-player/commit/172c9f834ab6575cf9cdb2f825abd9961b9ad7fb)), closes [#917](https://github.com/shaka-project/shaka-player/issues/917)
* **HLS:** allow customize live segments delay ([#4585](https://github.com/shaka-project/shaka-player/issues/4585)) ([1f558a8](https://github.com/shaka-project/shaka-player/commit/1f558a82c14e3d68a3a67cbb58879f2ab12549d0))
* **HLS:** Allow mp3 playback with mp4a.40.34 ([#4592](https://github.com/shaka-project/shaka-player/issues/4592)) ([8f892b1](https://github.com/shaka-project/shaka-player/commit/8f892b136f4cadce6a4d0585f88d4eccaf065f1b))
* **HLS:** Lazy-load HLS media playlists ([#4511](https://github.com/shaka-project/shaka-player/issues/4511)) ([b2f279d](https://github.com/shaka-project/shaka-player/commit/b2f279db1b111e3c8a02706551f466468621cd97)), closes [#1936](https://github.com/shaka-project/shaka-player/issues/1936)
* **HLS:** Support for HLS key rotation ([#4568](https://github.com/shaka-project/shaka-player/issues/4568)) ([3846eea](https://github.com/shaka-project/shaka-player/commit/3846eeac3f3777c35e61f479958015062f4275af)), closes [#741](https://github.com/shaka-project/shaka-player/issues/741)
* Improved LCEVC integration ([#4560](https://github.com/shaka-project/shaka-player/issues/4560)) ([50062f5](https://github.com/shaka-project/shaka-player/commit/50062f58adea248a403461b50b65c3a585de31b4))
* LCEVC Integration ([#4050](https://github.com/shaka-project/shaka-player/issues/4050)) ([284ea63](https://github.com/shaka-project/shaka-player/commit/284ea63a60178cbc87ce2fde769eb06bdb8fb8ea))
* New autoShowText config to change initial text visibility behavior ([#3421](https://github.com/shaka-project/shaka-player/issues/3421)) ([5c24410](https://github.com/shaka-project/shaka-player/commit/5c24410560d8afa13e6f2492590f13506419b59e))
* Parse and surface "prft" boxes as events ([#4389](https://github.com/shaka-project/shaka-player/issues/4389)) ([89777dd](https://github.com/shaka-project/shaka-player/commit/89777dd7043ae2b5fa213ab73e43f93482bb86d0)), closes [#4382](https://github.com/shaka-project/shaka-player/issues/4382)
* Parse ID3 metadata ([#4409](https://github.com/shaka-project/shaka-player/issues/4409)) ([95bbf72](https://github.com/shaka-project/shaka-player/commit/95bbf72f426f9df899193f6083197a77191c0c4f))
* Support HTML-escaped cues in VTT ([#4660](https://github.com/shaka-project/shaka-player/issues/4660)) ([2b8b387](https://github.com/shaka-project/shaka-player/commit/2b8b38788ab5b6fc297eaa3537e97bc348d2b389))
* TS parser improvements ([#4612](https://github.com/shaka-project/shaka-player/issues/4612)) ([5157b44](https://github.com/shaka-project/shaka-player/commit/5157b44b2d644ec9cdc13b03b4ac762ed8e0f183))


### Bug Fixes

* **ads:** Fix IMA crash when autoplay is rejected ([#4518](https://github.com/shaka-project/shaka-player/issues/4518)) ([d27f7d2](https://github.com/shaka-project/shaka-player/commit/d27f7d24bb3e1000fc489a6aa125fca359dd77e1)), closes [#4179](https://github.com/shaka-project/shaka-player/issues/4179)
* allow build without text ([#4506](https://github.com/shaka-project/shaka-player/issues/4506)) ([340b04a](https://github.com/shaka-project/shaka-player/commit/340b04ad4798c9b68ed9510ae71912192a61348b))
* Allow overriding special handling of 404s ([#4635](https://github.com/shaka-project/shaka-player/issues/4635)) ([427f126](https://github.com/shaka-project/shaka-player/commit/427f126ea3958541d69474505e1af0eb892d8dde)), closes [#4548](https://github.com/shaka-project/shaka-player/issues/4548)
* allow the playback on platforms when low latency APIs are not supported ([#4485](https://github.com/shaka-project/shaka-player/issues/4485)) ([c1753e1](https://github.com/shaka-project/shaka-player/commit/c1753e1a02881cfbbafd863eeb582411c45df92c))
* **cast:** Reduce size of Cast update messages ([#4644](https://github.com/shaka-project/shaka-player/issues/4644)) ([4e75ec6](https://github.com/shaka-project/shaka-player/commit/4e75ec64be76414b1d4945cbfbf7bc52b5ff3b01))
* **cea:** Fix not rendering CEA-608 Closed Captions ([#4683](https://github.com/shaka-project/shaka-player/issues/4683)) ([a489282](https://github.com/shaka-project/shaka-player/commit/a489282ff26796a55f96e035b55d331abfc14142)), closes [#4605](https://github.com/shaka-project/shaka-player/issues/4605) [#3659](https://github.com/shaka-project/shaka-player/issues/3659)
* check for negative rows before moving ([#4510](https://github.com/shaka-project/shaka-player/issues/4510)) ([b3621c2](https://github.com/shaka-project/shaka-player/commit/b3621c26a86897ba80c17b68f316e22aba61b30b)), closes [#4508](https://github.com/shaka-project/shaka-player/issues/4508)
* Content reload starttime with HLS on iOS ([#4575](https://github.com/shaka-project/shaka-player/issues/4575)) ([59d4360](https://github.com/shaka-project/shaka-player/commit/59d4360b686421f07aa0d7f28eb944f0c51ff5a2)), closes [#4244](https://github.com/shaka-project/shaka-player/issues/4244)
* DAI ID3 metadata parsing ([#4616](https://github.com/shaka-project/shaka-player/issues/4616)) ([0d67ecd](https://github.com/shaka-project/shaka-player/commit/0d67ecd7cba253eb1919ae6e15a80f34e08fc132))
* embed cc not shown when seeking back ([#4643](https://github.com/shaka-project/shaka-player/issues/4643)) ([2a6b0d0](https://github.com/shaka-project/shaka-player/commit/2a6b0d02e550cfa5749b838f5915b8b6cf7b2099)), closes [#4641](https://github.com/shaka-project/shaka-player/issues/4641)
* Filter unsupported H.264 streams in Xbox ([#4493](https://github.com/shaka-project/shaka-player/issues/4493)) ([8475214](https://github.com/shaka-project/shaka-player/commit/8475214bc46e8321f7b60a6fc7fabee484a40800))
* Fix bitmap-based cue size ([#4453](https://github.com/shaka-project/shaka-player/issues/4453)) ([4a197e1](https://github.com/shaka-project/shaka-player/commit/4a197e1288c8f20a950cf491041eca9dde7033cb))
* Fix choppy HLS startup ([#4553](https://github.com/shaka-project/shaka-player/issues/4553)) ([59ef54a](https://github.com/shaka-project/shaka-player/commit/59ef54a158e14da2f7c6ab04e1fd9409bf63c6f0)), closes [#4516](https://github.com/shaka-project/shaka-player/issues/4516)
* Fix detection of ac4, dts, and dolby h265 ([#4657](https://github.com/shaka-project/shaka-player/issues/4657)) ([319a358](https://github.com/shaka-project/shaka-player/commit/319a358b8dc1838a89d8977109cab4296a558841))
* Fix dispatch ID3 metadata when transmuxing AAC ([#4639](https://github.com/shaka-project/shaka-player/issues/4639)) ([bf813f2](https://github.com/shaka-project/shaka-player/commit/bf813f2553dfc56efa79b708c54cbddee0f3ee2e))
* Fix drm.keySystemsMapping config ([#4425](https://github.com/shaka-project/shaka-player/issues/4425)) ([d945084](https://github.com/shaka-project/shaka-player/commit/d9450846e11224e0b1add6cc20a64844d6c09fcf)), closes [#4422](https://github.com/shaka-project/shaka-player/issues/4422)
* Fix errors with TS segments on Chromecast ([#4543](https://github.com/shaka-project/shaka-player/issues/4543)) ([593c280](https://github.com/shaka-project/shaka-player/commit/593c280dd578ee19cbb6a47f22962ff7fdd2cb45))
* Fix hang when seeking to the last segment ([#4537](https://github.com/shaka-project/shaka-player/issues/4537)) ([19a4842](https://github.com/shaka-project/shaka-player/commit/19a48422901440ff88fbbedfea5803c6dda07127))
* Fix HLS dynamic to static transition ([a16b1ac](https://github.com/shaka-project/shaka-player/commit/a16b1ac8a4c8f367f65747fc789a7d8c160e29e3))
* Fix HLS dynamic to static transition ([#4483](https://github.com/shaka-project/shaka-player/issues/4483)) ([a16b1ac](https://github.com/shaka-project/shaka-player/commit/a16b1ac8a4c8f367f65747fc789a7d8c160e29e3)), closes [#4431](https://github.com/shaka-project/shaka-player/issues/4431)
* Fix HLS lazy-loading exception during update ([#4648](https://github.com/shaka-project/shaka-player/issues/4648)) ([777c27e](https://github.com/shaka-project/shaka-player/commit/777c27ee558d803b3f166a0ac8b9778b08196654)), closes [#4647](https://github.com/shaka-project/shaka-player/issues/4647)
* Fix HLS lazy-loading exception on switch ([#4645](https://github.com/shaka-project/shaka-player/issues/4645)) ([941ed4e](https://github.com/shaka-project/shaka-player/commit/941ed4ed286e4463d4973e994d322250678cfdcb)), closes [#4621](https://github.com/shaka-project/shaka-player/issues/4621)
* Fix HLS lazy-loading with DRM ([#4646](https://github.com/shaka-project/shaka-player/issues/4646)) ([a7f0be7](https://github.com/shaka-project/shaka-player/commit/a7f0be726d5b801ac2365bb0c9b6db9e576c964f)), closes [#4622](https://github.com/shaka-project/shaka-player/issues/4622)
* Fix HLS live stream subtitle offsets ([#4586](https://github.com/shaka-project/shaka-player/issues/4586)) ([3b9af2e](https://github.com/shaka-project/shaka-player/commit/3b9af2efa6be06c8c8a13e5d715828e2875d75d7))
* Fix ID3 parsing in TS segments ([#4609](https://github.com/shaka-project/shaka-player/issues/4609)) ([3b534fd](https://github.com/shaka-project/shaka-player/commit/3b534fd405ad3254d37a86fd1895ceeb96dc8094))
* Fix in-band key rotation on Xbox One ([#4478](https://github.com/shaka-project/shaka-player/issues/4478)) ([4e93311](https://github.com/shaka-project/shaka-player/commit/4e933116984beb630d31ce7a0b8c9bc6f8b48c06)), closes [#4401](https://github.com/shaka-project/shaka-player/issues/4401)
* Fix metadata assert when the ID3 is future (coming in a previous segment) ([#4640](https://github.com/shaka-project/shaka-player/issues/4640)) ([216bdd7](https://github.com/shaka-project/shaka-player/commit/216bdd7657d7be8bb33f71c3a62f649ecc25ace5))
* Fix multi-period DASH with descriptive audio ([#4629](https://github.com/shaka-project/shaka-player/issues/4629)) ([81ccd5c](https://github.com/shaka-project/shaka-player/commit/81ccd5c73ba5e021466b82c05f8b607b0c345849)), closes [#4500](https://github.com/shaka-project/shaka-player/issues/4500)
* fix support clear and encrypted periods ([#4606](https://github.com/shaka-project/shaka-player/issues/4606)) ([6256db3](https://github.com/shaka-project/shaka-player/commit/6256db3af5065ea1db1951ea7583d4608ce5e28d))
* Fix vanishing tracks while offline ([#4426](https://github.com/shaka-project/shaka-player/issues/4426)) ([c935cc1](https://github.com/shaka-project/shaka-player/commit/c935cc17703297a44b3ce3bda75d8f2ea37f4147)), closes [#4408](https://github.com/shaka-project/shaka-player/issues/4408)
* Fixed LCEVC decode breaking dependencies issue and read me addition ([#4565](https://github.com/shaka-project/shaka-player/issues/4565)) ([3c75d1a](https://github.com/shaka-project/shaka-player/commit/3c75d1a71aea039c802555031fffbf3cad77f6fc))
* focus on first element when back to the settings menu ([#4653](https://github.com/shaka-project/shaka-player/issues/4653)) ([b40b6e7](https://github.com/shaka-project/shaka-player/commit/b40b6e7669d4ccf8677a6d262767f3e155eb02e6)), closes [#4652](https://github.com/shaka-project/shaka-player/issues/4652)
* Force using mcap polyfill on EOS browsers ([#4630](https://github.com/shaka-project/shaka-player/issues/4630)) ([6191d58](https://github.com/shaka-project/shaka-player/commit/6191d5894deb679ed68da54357dc1f6831edeb23))
* **HLS:** Add a guard on closeSegmentIndex ([#4615](https://github.com/shaka-project/shaka-player/issues/4615)) ([57ce56b](https://github.com/shaka-project/shaka-player/commit/57ce56b8d2bd5d2b1626b38594e6d54defd10255))
* **HLS:** Fix detection of WebVTT subtitles in HLS by extension ([#4663](https://github.com/shaka-project/shaka-player/issues/4663)) ([8f698c6](https://github.com/shaka-project/shaka-player/commit/8f698c6eaad6e1019f388e2d36f28883a142ddfb))
* **HLS:** Fix lazy-loading of TS content ([#4601](https://github.com/shaka-project/shaka-player/issues/4601)) ([dd7356d](https://github.com/shaka-project/shaka-player/commit/dd7356d0e0655f59792b3f992841d4c0c8d5540a))
* **hls:** Fix raw format detection when the main playlist hasn't type ([#4583](https://github.com/shaka-project/shaka-player/issues/4583)) ([d319718](https://github.com/shaka-project/shaka-player/commit/d319718eded6e36f4fc705588de84a301a428d49))
* **hls:** Fix single-variant HLS streams ([#4573](https://github.com/shaka-project/shaka-player/issues/4573)) ([62906bd](https://github.com/shaka-project/shaka-player/commit/62906bdc9a26456d213a0c5d33f00b4454cdfb5b)), closes [#1936](https://github.com/shaka-project/shaka-player/issues/1936) [#3536](https://github.com/shaka-project/shaka-player/issues/3536)
* **HLS:** Infer missing codecs from config ([#4656](https://github.com/shaka-project/shaka-player/issues/4656)) ([08fc7dd](https://github.com/shaka-project/shaka-player/commit/08fc7dd717390c61dcc3304c58bfff5c87c77833))
* **HLS:** Return 0-0 seek range until fully loaded ([#4590](https://github.com/shaka-project/shaka-player/issues/4590)) ([bf50ada](https://github.com/shaka-project/shaka-player/commit/bf50ada6874879b33ac1acd34ec7e5375eb4c45d))
* Limit key ids to 32 characters ([#4614](https://github.com/shaka-project/shaka-player/issues/4614)) ([9531b07](https://github.com/shaka-project/shaka-player/commit/9531b07296163d8cc5c8416f0baa4ffd29c0a90d))
* Make XML parsing secure ([#4598](https://github.com/shaka-project/shaka-player/issues/4598)) ([a731eba](https://github.com/shaka-project/shaka-player/commit/a731eba804ae1a3f3ee3061550fa43ea82e06313))
* Missing AES-128 key of last HLS segment ([#4519](https://github.com/shaka-project/shaka-player/issues/4519)) ([3d0f752](https://github.com/shaka-project/shaka-player/commit/3d0f752c7d0677f750dbbd9bcd2895358358628f)), closes [#4517](https://github.com/shaka-project/shaka-player/issues/4517)
* **offline:** Add storage muxer init timeout ([#4566](https://github.com/shaka-project/shaka-player/issues/4566)) ([d4d3740](https://github.com/shaka-project/shaka-player/commit/d4d37407c87b7c032a16679e96b318146bbdee22))
* **playhead:** Safeguard getStallsDetected as stallDetector can be null ([#4581](https://github.com/shaka-project/shaka-player/issues/4581)) ([21ceaca](https://github.com/shaka-project/shaka-player/commit/21ceacab9e9577c18cef7f6c76f57f39eca3dca9))
* Resolve load failures for TS-based content on Android-based Cast devices ([#4569](https://github.com/shaka-project/shaka-player/issues/4569)). ([#4570](https://github.com/shaka-project/shaka-player/issues/4570)) ([65903aa](https://github.com/shaka-project/shaka-player/commit/65903aa27b5723632ff16a92059cb20c4879fc59))
* Respect existing app usage of Cast SDK ([#4523](https://github.com/shaka-project/shaka-player/issues/4523)) ([8d3d556](https://github.com/shaka-project/shaka-player/commit/8d3d556edaa817af686e1577f0a0bad92d0c74d4)), closes [#4521](https://github.com/shaka-project/shaka-player/issues/4521)
* return width and height in the stats when we are using src= ([#4435](https://github.com/shaka-project/shaka-player/issues/4435)) ([9bbfb57](https://github.com/shaka-project/shaka-player/commit/9bbfb57cb4e2c0653e6eb5681e10714cb939bad9))
* Simplify transmuxer to allow more mimetypes in the future ([#4642](https://github.com/shaka-project/shaka-player/issues/4642)) ([a14e84b](https://github.com/shaka-project/shaka-player/commit/a14e84b5c9a6feb8f7f2efcbae52fe9691d48412))
* **ttml:** Default TTML background color to transparent if unspecified ([#4496](https://github.com/shaka-project/shaka-player/issues/4496)) ([32b0a90](https://github.com/shaka-project/shaka-player/commit/32b0a90a8c583bba03a3d7b035a1244d325e3da6)), closes [#4468](https://github.com/shaka-project/shaka-player/issues/4468)
* **UI:** Ad position and ad counter are too close to each other ([#4416](https://github.com/shaka-project/shaka-player/issues/4416)) ([8376410](https://github.com/shaka-project/shaka-player/commit/83764104277363b6ce0e05d8e53449ff454c6f0e))
* **ui:** Fix exception on screen rotation if fullscreen is not supported ([#4669](https://github.com/shaka-project/shaka-player/issues/4669)) ([fd93f6a](https://github.com/shaka-project/shaka-player/commit/fd93f6ae1bc917061c035abcfb835855e336bb06))
* Virgin Media set top box is incorrectly categorized as Apple/Safari ([df79470](https://github.com/shaka-project/shaka-player/commit/df79470af088089f8beba2f44a236593820d655a))
* WebVTT line not correctly positioned in UITextDisplayer ([#4567](https://github.com/shaka-project/shaka-player/issues/4567)) ([#4682](https://github.com/shaka-project/shaka-player/issues/4682)) ([140aefe](https://github.com/shaka-project/shaka-player/commit/140aefee04718faa631ba090d6313e372b608fc1))

## [4.2.0](https://github.com/shaka-project/shaka-player/compare/v4.1.0...v4.2.0) (2022-08-16)


### Features

* add Amazon Fire TV platform support ([#4375](https://github.com/shaka-project/shaka-player/issues/4375)) ([5102dac](https://github.com/shaka-project/shaka-player/commit/5102dac96cb1a749fefeb1f6b7a24c13f6b1077b))
* Add support for Modern EME and legacy Apple Media Keys for FairPlay ([#4309](https://github.com/shaka-project/shaka-player/issues/4309)) ([5441f93](https://github.com/shaka-project/shaka-player/commit/5441f932fd3da20f26da162cc0d49d0470689b41))
* Automatic ABR quality restrictions based on size ([#4404](https://github.com/shaka-project/shaka-player/issues/4404)) ([cfe8af5](https://github.com/shaka-project/shaka-player/commit/cfe8af5ff928fe7466b103429a6325917579ce70)), closes [#2333](https://github.com/shaka-project/shaka-player/issues/2333)
* **hls:** Support AES-128 in HLS ([#4386](https://github.com/shaka-project/shaka-player/issues/4386)) ([6194021](https://github.com/shaka-project/shaka-player/commit/6194021a3d4ea5dae22ade6713bb077875a4ee9d)), closes [#850](https://github.com/shaka-project/shaka-player/issues/850)
* Improve gap-detection robustness ([#4399](https://github.com/shaka-project/shaka-player/issues/4399)) ([4293a14](https://github.com/shaka-project/shaka-player/commit/4293a1421ada4b189d64b8c3f87a7599bc7b1a8f))
* Upgrade eme-encryption-scheme-polyfill to support ChromeCast version of PlayReady ([#4378](https://github.com/shaka-project/shaka-player/issues/4378)) ([e6b6d7c](https://github.com/shaka-project/shaka-player/commit/e6b6d7c24bee4138b6bb2735e3c9a4dc885a6cf6))
* **webvtt:** add support for karaoke style text in WebVTT ([#4274](https://github.com/shaka-project/shaka-player/issues/4274)) ([60af516](https://github.com/shaka-project/shaka-player/commit/60af5165207d39ebe26d536b009521192ab8cad9))


### Bug Fixes

* Add fallback to TextDecoder and TextEncoder [#4324](https://github.com/shaka-project/shaka-player/issues/4324) ([5b18069](https://github.com/shaka-project/shaka-player/commit/5b180694309f1cc01b2997cd0366154135f8acd8))
* add strictMissingProperties suppressions to unblock strict missing properties on union types. ([#4371](https://github.com/shaka-project/shaka-player/issues/4371)) ([b361948](https://github.com/shaka-project/shaka-player/commit/b36194878e26a22b522a6cf1dba07e9fc5cd341d))
* Debug buffer placement ([#4345](https://github.com/shaka-project/shaka-player/issues/4345)) ([47fa309](https://github.com/shaka-project/shaka-player/commit/47fa3093e1462d0bcca87238dc4886b9e2c1f8f4))
* **demo:** allow switch between UITextDisplayer and SimpleTextDisplayer ([#4275](https://github.com/shaka-project/shaka-player/issues/4275)) ([28689f3](https://github.com/shaka-project/shaka-player/commit/28689f38fb7cc8f3b85b6b1eb2337a1779e8ee95))
* **demo:** erroneous FairPlay keysystem in demo ([#4276](https://github.com/shaka-project/shaka-player/issues/4276)) ([8719bdc](https://github.com/shaka-project/shaka-player/commit/8719bdc0defd7956ec9fad934525477a603744a0))
* exception if on early adError ([#4362](https://github.com/shaka-project/shaka-player/issues/4362)) ([3c92f05](https://github.com/shaka-project/shaka-player/commit/3c92f0598e6c1628ff50d980a842dd40b2b56813)), closes [#4004](https://github.com/shaka-project/shaka-player/issues/4004)
* Fix EOS set-top box being identified as Apple. ([#4310](https://github.com/shaka-project/shaka-player/issues/4310)) ([7c2c4be](https://github.com/shaka-project/shaka-player/commit/7c2c4be2ae946c4cf270717f852b0d95b498266e))
* Fix getVideoPlaybackQuality in WebOS 3 ([#4316](https://github.com/shaka-project/shaka-player/issues/4316)) ([5561111](https://github.com/shaka-project/shaka-player/commit/556111143dfccbc7348fc15792df75bc35fea465))
* Fix key ID byteswapping for PlayReady on PS4 ([#4377](https://github.com/shaka-project/shaka-player/issues/4377)) ([25fd4f4](https://github.com/shaka-project/shaka-player/commit/25fd4f4af6ddd8953c4bc2da4a2d9eb1144c3fb9))
* Fix MediaCapabilities polyfill on Playstation 4 ([#4320](https://github.com/shaka-project/shaka-player/issues/4320)) ([0335b2a](https://github.com/shaka-project/shaka-player/commit/0335b2af2efea6ceda83e536e12094e4cc942a25))
* Fix MediaCapabilities polyfill on Tizen and WebOS ([#4396](https://github.com/shaka-project/shaka-player/issues/4396)) ([eb2aed8](https://github.com/shaka-project/shaka-player/commit/eb2aed825e84142f9fb9ddb3e69ebc333127c295)), closes [#4383](https://github.com/shaka-project/shaka-player/issues/4383) [#4357](https://github.com/shaka-project/shaka-player/issues/4357)
* Fix segment index assertions with DAI ([#4348](https://github.com/shaka-project/shaka-player/issues/4348)) ([c2b3853](https://github.com/shaka-project/shaka-player/commit/c2b3853a56e816c97fab57f961f295b7272e410e))
* Fix TextDecoder fallback and browser support check ([#4403](https://github.com/shaka-project/shaka-player/issues/4403)) ([04fc0d4](https://github.com/shaka-project/shaka-player/commit/04fc0d47c3895f294401b588ed49cc4360f31be1))
* Fix UI captions icon state ([#4384](https://github.com/shaka-project/shaka-player/issues/4384)) ([d462633](https://github.com/shaka-project/shaka-player/commit/d46263333ba3de68707d521b997c40c5ba492fda)), closes [#4358](https://github.com/shaka-project/shaka-player/issues/4358)
* Fix VP9 codec checks on Mac Firefox ([#4391](https://github.com/shaka-project/shaka-player/issues/4391)) ([b6ab769](https://github.com/shaka-project/shaka-player/commit/b6ab76976211852e96b2883562166a5e1e4dd0f2))
* **hls:** Fix AV sync issues, fallback to sequence numbers if PROGRAM-DATE-TIME ignored ([#4289](https://github.com/shaka-project/shaka-player/issues/4289)) ([314a987](https://github.com/shaka-project/shaka-player/commit/314a987ecf85b47cc8a6cef08f390ef817e11c49)), closes [#4287](https://github.com/shaka-project/shaka-player/issues/4287)
* New EME polyfill fixes EME/MCap issues on some smart TVs ([#4279](https://github.com/shaka-project/shaka-player/issues/4279)) ([db1b20e](https://github.com/shaka-project/shaka-player/commit/db1b20ec77f74472dd24f493f2a26c02b17927bc))
* Populate track's spatialAudio property ([#4291](https://github.com/shaka-project/shaka-player/issues/4291)) ([713f461](https://github.com/shaka-project/shaka-player/commit/713f461c62b23680557f8d6c4b9c3126bb604f9e))
* Remove IE 11 from default browsers for Windows ([#4272](https://github.com/shaka-project/shaka-player/issues/4272)) ([490b06c](https://github.com/shaka-project/shaka-player/commit/490b06cd45d09c7567056535f4b8dc6f3e2e5733)), closes [#4271](https://github.com/shaka-project/shaka-player/issues/4271)
* **text:** Fix cue region rendering in UI ([#4412](https://github.com/shaka-project/shaka-player/issues/4412)) ([b1f46db](https://github.com/shaka-project/shaka-player/commit/b1f46dbc3a685b0216600835e24fd13c504e1b62)), closes [#4381](https://github.com/shaka-project/shaka-player/issues/4381)
* **text:** Fix TTML render timing and line break issues for native display ([122f223](https://github.com/shaka-project/shaka-player/commit/122f223d19732bf5977ab8a5c93bbc4d934da1d7))
* Update main branch Cast receiver ID ([#4364](https://github.com/shaka-project/shaka-player/issues/4364)) ([46b27f1](https://github.com/shaka-project/shaka-player/commit/46b27f19e099d44ab3929222da7a3bcb41bdb230))
* Use middle segment when guessing MIME type on HLS ([#4269](https://github.com/shaka-project/shaka-player/issues/4269)) ([#4270](https://github.com/shaka-project/shaka-player/issues/4270)) ([3d27d2a](https://github.com/shaka-project/shaka-player/commit/3d27d2a2cfeb8fa21f3415baaf013567dcccf480))
* VTT Cue Parsing On PlayStation 4 ([#4340](https://github.com/shaka-project/shaka-player/issues/4340)) ([b5da41e](https://github.com/shaka-project/shaka-player/commit/b5da41ed80b96e8edae970c39dd5fac7348a9a55)), closes [#4321](https://github.com/shaka-project/shaka-player/issues/4321)

## [4.1.0](https://github.com/shaka-project/shaka-player/compare/v4.0.0...v4.1.0) (2022-06-02)


### Features

* Add Id to chapters ([#4184](https://github.com/shaka-project/shaka-player/issues/4184)) ([5ca3271](https://github.com/shaka-project/shaka-player/commit/5ca32712e375ba875be86827ea1efaaa5e3c0035))
* Add keySystemsMapping to drm config ([#4254](https://github.com/shaka-project/shaka-player/issues/4254)) ([5e107d5](https://github.com/shaka-project/shaka-player/commit/5e107d584f824e66ab3e5e07f9d833f6dc456d14)), closes [#4243](https://github.com/shaka-project/shaka-player/issues/4243)
* add listenable events for playback stall detection and gap jumping ([#4249](https://github.com/shaka-project/shaka-player/issues/4249)) ([5987458](https://github.com/shaka-project/shaka-player/commit/5987458e445cf21f91bf4833396edd63d5f69765))
* Add support to text-shadow in VTT parser ([#4257](https://github.com/shaka-project/shaka-player/issues/4257)) ([62bda2c](https://github.com/shaka-project/shaka-player/commit/62bda2cd36c6d49d08c10757bfe5869b5be54b88))
* **cast:** Add Android receiver support ([#4183](https://github.com/shaka-project/shaka-player/issues/4183)) ([dbba571](https://github.com/shaka-project/shaka-player/commit/dbba571c6bb7e99a99469ffb695f59a590d44118))
* **hls:** Add support for EXT-X-GAP ([#4208](https://github.com/shaka-project/shaka-player/issues/4208)) ([14e61a7](https://github.com/shaka-project/shaka-player/commit/14e61a7368ddbd66c4b10f3b0475840cc50512bd)), closes [#1308](https://github.com/shaka-project/shaka-player/issues/1308)
* Temporarily disable the active variant from NETWORK HTTP_ERROR ([#4189](https://github.com/shaka-project/shaka-player/issues/4189)) ([b57279d](https://github.com/shaka-project/shaka-player/commit/b57279d39c24d3b2568c4b62338524ecc23423ad)), closes [#4121](https://github.com/shaka-project/shaka-player/issues/4121) [#1542](https://github.com/shaka-project/shaka-player/issues/1542) [#2541](https://github.com/shaka-project/shaka-player/issues/2541)
* **UI:** Added keyboardSeekDistance config to UI ([#4246](https://github.com/shaka-project/shaka-player/issues/4246)) ([6084ca6](https://github.com/shaka-project/shaka-player/commit/6084ca6395fbe3d5a97fa92137b8bb51f15c89f8))


### Bug Fixes

* **abr:** use Network Info API in ABR getBandwidthEstimate ([#4263](https://github.com/shaka-project/shaka-player/issues/4263)) ([4fc7a48](https://github.com/shaka-project/shaka-player/commit/4fc7a4893fd081d4dafa26a2034361afd7b7e6ed))
* Do not report MANIFEST RESTRICTIONS_CANNOT_BE_MET error twice ([#4194](https://github.com/shaka-project/shaka-player/issues/4194)) ([08589e8](https://github.com/shaka-project/shaka-player/commit/08589e8fb27f3f73f64204e7d3a2387f3c197d84)), closes [#4190](https://github.com/shaka-project/shaka-player/issues/4190)
* Don't send drmsessionupdate after unload ([#4248](https://github.com/shaka-project/shaka-player/issues/4248)) ([60af9ad](https://github.com/shaka-project/shaka-player/commit/60af9ad596e5c2cb31d1e7bb616e415cf46ca761))
* **fairplay:** Re-add initDataTransform config ([#4231](https://github.com/shaka-project/shaka-player/issues/4231)) ([ff310e9](https://github.com/shaka-project/shaka-player/commit/ff310e91e564bcc4be340c47bf1be81a5323765a))
* Fix audio mime type in multiplexed HLS stream ([#4241](https://github.com/shaka-project/shaka-player/issues/4241)) ([4e4e92e](https://github.com/shaka-project/shaka-player/commit/4e4e92e98da357285547859a98e6b3fe75d1904f))
* Fix event listener leaks in Player ([#4229](https://github.com/shaka-project/shaka-player/issues/4229)) ([a5d3568](https://github.com/shaka-project/shaka-player/commit/a5d356874ba90069ca5a86be1979a5904a1150e8))
* Fix exception with streaming.startAtSegmentBoundary ([#4216](https://github.com/shaka-project/shaka-player/issues/4216)) ([426a19c](https://github.com/shaka-project/shaka-player/commit/426a19c8e7ff188390e7430fb02f3cfcb79cc017)), closes [#4188](https://github.com/shaka-project/shaka-player/issues/4188)
* Fix PERIOD_FLATTENING_FAILED error when periods have different base sample types ([#4206](https://github.com/shaka-project/shaka-player/issues/4206)) ([b757a81](https://github.com/shaka-project/shaka-player/commit/b757a81902a2159b217e7cb6a1445ab6d4d69bf4)), closes [#4202](https://github.com/shaka-project/shaka-player/issues/4202)
* Fix VTT cue timing in HLS ([#4217](https://github.com/shaka-project/shaka-player/issues/4217)) ([5818260](https://github.com/shaka-project/shaka-player/commit/58182605a7da3c18a7331828c319c88446a13d52)), closes [#4191](https://github.com/shaka-project/shaka-player/issues/4191)
* **hls:** Fix av1 codec selection in HLS. ([#4203](https://github.com/shaka-project/shaka-player/issues/4203)) ([5e13495](https://github.com/shaka-project/shaka-player/commit/5e1349570d64c17e6ca1fcdc5ffde1076ea9a999))
* **HLS:** Fix duplicate hinted segments ([#4258](https://github.com/shaka-project/shaka-player/issues/4258)) ([9171f73](https://github.com/shaka-project/shaka-player/commit/9171f733e8de0b811ebac71d5ddbe0cb1ff7c75b)), closes [#4223](https://github.com/shaka-project/shaka-player/issues/4223)
* **hls:** Fix X-PRELOAD-HINT failure with LL mode off ([#4212](https://github.com/shaka-project/shaka-player/issues/4212)) ([86497a5](https://github.com/shaka-project/shaka-player/commit/86497a5089e272ed682f017f5ed9135108be5a65)), closes [#4185](https://github.com/shaka-project/shaka-player/issues/4185)
* **ui:** Widen touchable button area ([#3249](https://github.com/shaka-project/shaka-player/issues/3249)) ([6c0283e](https://github.com/shaka-project/shaka-player/commit/6c0283e7d040fd0df9383454b174a7ceb2678c89))
* Upgrade mux.js to version that emits partial ID3 when malformed ([#4259](https://github.com/shaka-project/shaka-player/issues/4259)) ([dc88fe0](https://github.com/shaka-project/shaka-player/commit/dc88fe0814f82aa447a3fa8f7098c85621faf9c6)), closes [#3761](https://github.com/shaka-project/shaka-player/issues/3761)
* Wait for chapters track to be loaded ([#4228](https://github.com/shaka-project/shaka-player/issues/4228)) ([80e81f1](https://github.com/shaka-project/shaka-player/commit/80e81f139129dbe1c797ee07fedc1217b8790b53)), closes [#4186](https://github.com/shaka-project/shaka-player/issues/4186)

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

## 3.3.1 (2022-01-28)

Bugfixes:
  - Fix duplicate CMCD parameters in HLS live content
    - https://github.com/shaka-project/shaka-player/issues/3862
    - https://github.com/shaka-project/shaka-player/pull/3875
  - Inherit alignment from regions
  - Fix support for TTAF1 namespace (old version of TTML)
    - https://github.com/shaka-project/shaka-player/issues/3009
    - https://github.com/shaka-project/shaka-player/pull/3864
    - https://github.com/shaka-project/shaka-player/pull/3906
  - Fix misdetection of HEVC support on MS Edge
    - https://github.com/shaka-project/shaka-player/pull/3897
  - Fix caption overlap
    - https://github.com/shaka-project/shaka-player/issues/3850
    - https://github.com/shaka-project/shaka-player/issues/3741
  - Fix missing throughput in CMCD for HLS live
    - https://github.com/shaka-project/shaka-player/issues/3873
    - https://github.com/shaka-project/shaka-player/pull/3874
  - Support multiple chapter tracks with same language
    - https://github.com/shaka-project/shaka-player/issues/3597
    - https://github.com/shaka-project/shaka-player/pull/3868
  - Fix text UI not updating when text is disabled
    - https://github.com/shaka-project/shaka-player/issues/3728
    - https://github.com/shaka-project/shaka-player/pull/3867
  - Clear buffer on seek if mediaState is updating
    - https://github.com/shaka-project/shaka-player/issues/3299
    - https://github.com/shaka-project/shaka-player/pull/3795
  - Fix thumbnails issues
    - https://github.com/shaka-project/shaka-player/pull/3858
  - Made nested cues inherit region
    - https://github.com/shaka-project/shaka-player/issues/3743
    - https://github.com/shaka-project/shaka-player/pull/3837
  - Fix CMCD top bitrate reporting
    - https://github.com/shaka-project/shaka-player/issues/3851
    - https://github.com/shaka-project/shaka-player/pull/3852
  - Fix MediaCapabilities polyfill on Safari
    - https://github.com/shaka-project/shaka-player/issues/3696
    - https://github.com/shaka-project/shaka-player/issues/3530
  - Fix usage of Shaka without polyfills
    - https://github.com/shaka-project/shaka-player/issues/3843
  - Fix playback failure due to rounding errors
    - https://github.com/shaka-project/shaka-player/issues/3717
  - Fix HLS image track issues
    - https://github.com/shaka-project/shaka-player/issues/3840
  - Fix CMCD property mangling
    - https://github.com/shaka-project/shaka-player/issues/3839
    - https://github.com/shaka-project/shaka-player/pull/3842
  - Remove caption wrapper bgColor
    - https://github.com/shaka-project/shaka-player/issues/3745
    - https://github.com/shaka-project/shaka-player/pull/3838
  - Avoid WebCrypto randomUUID when CMCD disabled


## 3.2.3 (2022-01-28)

Bugfixes:
  - Fix support for TTAF1 namespace (old version of TTML)
    - https://github.com/shaka-project/shaka-player/issues/3009
    - https://github.com/shaka-project/shaka-player/pull/3864
    - https://github.com/shaka-project/shaka-player/pull/3906
  - Fix misdetection of HEVC support on MS Edge
    - https://github.com/shaka-project/shaka-player/pull/3897
  - Fix caption overlap
    - https://github.com/shaka-project/shaka-player/issues/3850
    - https://github.com/shaka-project/shaka-player/issues/3741
  - Support multiple chapter tracks with same language
    - https://github.com/shaka-project/shaka-player/issues/3597
    - https://github.com/shaka-project/shaka-player/pull/3868
  - Fix text UI not updating when text is disabled
    - https://github.com/shaka-project/shaka-player/issues/3728
    - https://github.com/shaka-project/shaka-player/pull/3867
  - Clear buffer on seek if mediaState is updating
    - https://github.com/shaka-project/shaka-player/issues/3299
    - https://github.com/shaka-project/shaka-player/pull/3795
  - Fix thumbnails issues
    - https://github.com/shaka-project/shaka-player/pull/3858
  - Made nested cues inherit region
    - https://github.com/shaka-project/shaka-player/issues/3743
    - https://github.com/shaka-project/shaka-player/pull/3837
  - Fix MediaCapabilities polyfill on Safari
    - https://github.com/shaka-project/shaka-player/issues/3696
    - https://github.com/shaka-project/shaka-player/issues/3530
  - Fix usage of Shaka without polyfills
    - https://github.com/shaka-project/shaka-player/issues/3843
  - Fix playback failure due to rounding errors
    - https://github.com/shaka-project/shaka-player/issues/3717
  - Fix HLS image track issues
    - https://github.com/shaka-project/shaka-player/issues/3840
  - Remove caption wrapper bgColor
    - https://github.com/shaka-project/shaka-player/issues/3745
    - https://github.com/shaka-project/shaka-player/pull/3838
  - Support "forced-subtitle" role
    - https://github.com/shaka-project/shaka-player/issues/3767
    - https://github.com/shaka-project/shaka-player/pull/3807
  - Fix time element height on Safari
    - https://github.com/shaka-project/shaka-player/issues/3739
    - https://github.com/shaka-project/shaka-player/pull/3809


## 3.1.5 (2022-01-28)

Bugfixes:
  - Fix support for TTAF1 namespace (old version of TTML)
    - https://github.com/shaka-project/shaka-player/issues/3009
    - https://github.com/shaka-project/shaka-player/pull/3864
    - https://github.com/shaka-project/shaka-player/pull/3906
  - Fix misdetection of HEVC support on MS Edge
    - https://github.com/shaka-project/shaka-player/pull/3897
  - Fix caption overlap
    - https://github.com/shaka-project/shaka-player/issues/3850
    - https://github.com/shaka-project/shaka-player/issues/3741
  - Fix text UI not updating when text is disabled
    - https://github.com/shaka-project/shaka-player/issues/3728
    - https://github.com/shaka-project/shaka-player/pull/3867
  - Clear buffer on seek if mediaState is updating
    - https://github.com/shaka-project/shaka-player/issues/3299
    - https://github.com/shaka-project/shaka-player/pull/3795
  - Made nested cues inherit region
    - https://github.com/shaka-project/shaka-player/issues/3743
    - https://github.com/shaka-project/shaka-player/pull/3837
  - Fix MediaCapabilities polyfill on Safari
    - https://github.com/shaka-project/shaka-player/issues/3696
    - https://github.com/shaka-project/shaka-player/issues/3530
  - Fix usage of Shaka without polyfills
    - https://github.com/shaka-project/shaka-player/issues/3843
  - Fix playback failure due to rounding errors
    - https://github.com/shaka-project/shaka-player/issues/3717
  - Remove caption wrapper bgColor
    - https://github.com/shaka-project/shaka-player/issues/3745
    - https://github.com/shaka-project/shaka-player/pull/3838
  - Support "forced-subtitle" role
    - https://github.com/shaka-project/shaka-player/issues/3767
    - https://github.com/shaka-project/shaka-player/pull/3807
  - Fix time element height on Safari
    - https://github.com/shaka-project/shaka-player/issues/3739
    - https://github.com/shaka-project/shaka-player/pull/3809


## 3.3.0 (2022-01-07)

New Features:
  - Adds singleClickForPlayAndPause config
    - https://github.com/shaka-project/shaka-player/issues/3821
  - Add media quality change events
    - https://github.com/shaka-project/shaka-player/pull/3700
  - Add Common Media Client Data (CMCD) logging support
    - https://github.com/shaka-project/shaka-player/issues/3619
    - https://github.com/shaka-project/shaka-player/pull/3662
  - Adds advanced ABR config options
    - https://github.com/shaka-project/shaka-player/issues/3422
    - https://github.com/shaka-project/shaka-player/pull/3706
  - Integrate with non-linear IMA CS ads
    - https://github.com/shaka-project/shaka-player/pull/3639
  - Add a config to dispatch all emsg boxes
    - https://github.com/shaka-project/shaka-player/issues/3348
    - https://github.com/shaka-project/shaka-player/pull/3653
  - Added Loop and PIP to context menu, and Statistics to overflow menu
    - https://github.com/shaka-project/shaka-player/pull/3578
  - Export LanguageUtils
    - https://github.com/shaka-project/shaka-player/issues/3692
  - Add randomUUID polyfill
    - https://github.com/shaka-project/shaka-player/pull/3669
  - Export individual polyfill install methods
    - https://github.com/shaka-project/shaka-player/pull/3660
  - Make default HLS audio/video codecs configurable
    - https://github.com/shaka-project/shaka-player/pull/3651
  - Add response HTTP status to Networking engine responses
    - https://github.com/shaka-project/shaka-player/issues/3640
    - https://github.com/shaka-project/shaka-player/pull/3641
  - Create segment index only when used
  - Partially support tts:textOutline
    - https://github.com/shaka-project/shaka-player/issues/3612
  - Add tooltips to control panel buttons
    - https://github.com/shaka-project/shaka-player/pull/3572
  - Add configurable rates
    - https://github.com/shaka-project/shaka-player/pull/3579
  - Add blob-url support
    - https://github.com/shaka-project/shaka-player/issues/1481
    - https://github.com/shaka-project/shaka-player/pull/3583
  - Add updateStartTime method to play
    - https://github.com/shaka-project/shaka-player/pull/3491
  - Add right-click context menu, statistics button
    - https://github.com/shaka-project/shaka-player/issues/2607
    - https://github.com/shaka-project/shaka-player/pull/3548
  - Added events for download lifecycle
    - https://github.com/shaka-project/shaka-player/issues/3533
  - Add Quality, Language, Playback, Captions buttons to control panel
    - https://github.com/shaka-project/shaka-player/pull/3465
  - Add goToLive method
    - https://github.com/shaka-project/shaka-player/pull/3527


## 3.2.2 (2022-01-06)

Bugfixes:
  - Allow comments in the TTML parser
    - https://github.com/shaka-project/shaka-player/issues/3766
    - https://github.com/shaka-project/shaka-player/pull/3827
  - Fix HDR signalling via essential or supplemental property
    - https://github.com/shaka-project/shaka-player/issues/3726
    - https://github.com/shaka-project/shaka-player/pull/3727
  - Fix MediaCapabilities polyfill on Playstation 5
    - https://github.com/shaka-project/shaka-player/issues/3582
    - https://github.com/shaka-project/shaka-player/pull/3808
  - Add DASH MIME type mapping for src= playback
    - https://github.com/shaka-project/shaka-player/pull/3805
  - Fix captions not working after a period transition on live DASH streams
    - https://github.com/shaka-project/shaka-player/issues/3783
    - https://github.com/shaka-project/shaka-player/pull/3801
  - Fix timestamp offset of CEA-608 cues
    - https://github.com/shaka-project/shaka-player/issues/3782
  - Force caption update when removing cues
  - Fixes parsing of HLS 'DEFAULT' attribute
    - https://github.com/shaka-project/shaka-player/issues/3769
    - https://github.com/shaka-project/shaka-player/pull/3771
  - support stpp.ttml codec in Mp4TtmlParser
    - https://github.com/shaka-project/shaka-player/pull/3754
  - Fix Russian translation
    - https://github.com/shaka-project/shaka-player/pull/3751
  - Fix HLS VOD duration
    - https://github.com/shaka-project/shaka-player/issues/3733
  - Query HDR transfer function
    - https://github.com/shaka-project/shaka-player/issues/3729
    - https://github.com/shaka-project/shaka-player/pull/3730
  - Fix styling of UI text cues
    - https://github.com/shaka-project/shaka-player/issues/3521
    - https://github.com/shaka-project/shaka-player/issues/3600
    - https://github.com/shaka-project/shaka-player/issues/3713
  - Fix seek range issues on transition from live to VOD
    - https://github.com/shaka-project/shaka-player/issues/3675
  - Enforce string-format of event data keys
    - https://github.com/shaka-project/shaka-player/issues/3710
  - Fix vp09 playback on webOS
    - https://github.com/shaka-project/shaka-player/pull/3566
  - Dedupe DRM init data
    - https://github.com/shaka-project/shaka-player/pull/3695
  - Failover in geo-redundant streams
    - https://github.com/shaka-project/shaka-player/pull/3587
  - Update Cast receiver ID for v3.2

Demo App:
  - Fix 'Tears of Steel (live, DASH, Server Side ads)'
    - https://github.com/shaka-project/shaka-player/pull/3758

Docs:
  - Fix typo in Fairplay tutorial
    - https://github.com/shaka-project/shaka-player/pull/3714


## 3.1.4 (2022-01-06)

Bugfixes:
  - Allow comments in the TTML parser
    - https://github.com/shaka-project/shaka-player/issues/3766
    - https://github.com/shaka-project/shaka-player/pull/3827
  - Fix HDR signalling via essential or supplemental property
    - https://github.com/shaka-project/shaka-player/issues/3726
    - https://github.com/shaka-project/shaka-player/pull/3727
  - Fix MediaCapabilities polyfill on Playstation 5
    - https://github.com/shaka-project/shaka-player/issues/3582
    - https://github.com/shaka-project/shaka-player/pull/3808
  - Add DASH MIME type mapping for src= playback
    - https://github.com/shaka-project/shaka-player/pull/3805
  - Fix captions not working after a period transition on live DASH streams
    - https://github.com/shaka-project/shaka-player/issues/3783
    - https://github.com/shaka-project/shaka-player/pull/3801
  - Fix timestamp offset of CEA-608 cues
    - https://github.com/shaka-project/shaka-player/issues/3782
  - Force caption update when removing cues
  - Fixes parsing of HLS 'DEFAULT' attribute
    - https://github.com/shaka-project/shaka-player/issues/3769
    - https://github.com/shaka-project/shaka-player/pull/3771
  - support stpp.ttml codec in Mp4TtmlParser
    - https://github.com/shaka-project/shaka-player/pull/3754
  - Fix Russian translation
    - https://github.com/shaka-project/shaka-player/pull/3751
  - Fix HLS VOD duration
    - https://github.com/shaka-project/shaka-player/issues/3733
  - Query HDR transfer function
    - https://github.com/shaka-project/shaka-player/issues/3729
    - https://github.com/shaka-project/shaka-player/pull/3730
  - Fix styling of UI text cues
    - https://github.com/shaka-project/shaka-player/issues/3521
    - https://github.com/shaka-project/shaka-player/issues/3600
    - https://github.com/shaka-project/shaka-player/issues/3713
  - Fix seek range issues on transition from live to VOD
    - https://github.com/shaka-project/shaka-player/issues/3675
  - Enforce string-format of event data keys.
    - https://github.com/shaka-project/shaka-player/issues/3710
  - Fix vp09 playback on webOS
    - https://github.com/shaka-project/shaka-player/pull/3566
  - Dedupe DRM init data
    - https://github.com/shaka-project/shaka-player/pull/3695
  - Failover in geo-redundant streams
    - https://github.com/shaka-project/shaka-player/pull/3587

Demo App:
  - Fix 'Tears of Steel (live, DASH, Server Side ads)'
    - https://github.com/shaka-project/shaka-player/pull/3758

Docs:
  - Fix typo in Fairplay tutorial
    - https://github.com/shaka-project/shaka-player/pull/3714


## 3.0.15 (2022-01-06)

Bugfixes:
  - Allow comments in the TTML parser
    - https://github.com/shaka-project/shaka-player/issues/3766
    - https://github.com/shaka-project/shaka-player/pull/3827
  - Add DASH MIME type mapping for src= playback
    - https://github.com/shaka-project/shaka-player/pull/3805
  - Fix captions not working after a period transition on live DASH streams
    - https://github.com/shaka-project/shaka-player/issues/3783
    - https://github.com/shaka-project/shaka-player/pull/3801
  - Force caption update when removing cues
  - Fixes parsing of HLS 'DEFAULT' attribute
    - https://github.com/shaka-project/shaka-player/issues/3769
    - https://github.com/shaka-project/shaka-player/pull/3771
  - support stpp.ttml codec in Mp4TtmlParser
    - https://github.com/shaka-project/shaka-player/pull/3754
  - Fix Russian translation
    - https://github.com/shaka-project/shaka-player/pull/3751
  - Made HLS notify segments after fit
    - https://github.com/shaka-project/shaka-player/issues/3733
  - Fix seek range issues on transition from live to VOD
    - https://github.com/shaka-project/shaka-player/issues/3675
  - Enforce string-format of event data keys
    - https://github.com/shaka-project/shaka-player/issues/3710
  - Dedupe DRM init data
    - https://github.com/shaka-project/shaka-player/pull/3695
  - Failover in geo-redundant streams
    - https://github.com/shaka-project/shaka-player/pull/3587

Demo App:
  - Fix 'Tears of Steel (live, DASH, Server Side ads)'
    - https://github.com/shaka-project/shaka-player/pull/3758

Docs:
  - Fix typo in Fairplay tutorial
    - https://github.com/shaka-project/shaka-player/pull/3714


## 3.2.1 (2021-10-13)

Bugfixes:
  - Work around override of MediaCapabilities polyfill in Apple browsers
    - https://github.com/shaka-project/shaka-player/issues/3530
    - https://github.com/shaka-project/shaka-player/pull/3668
  - Fix video poster when autoplay is disabled
    - https://github.com/shaka-project/shaka-player/pull/3645
  - Fix tracking of active variant track in live streams
  - Fixes updating of nested cues
    - https://github.com/shaka-project/shaka-player/issues/3524
    - https://github.com/shaka-project/shaka-player/issues/3643
  - Fix ttml erroneously dismissing cues
    - https://github.com/shaka-project/shaka-player/issues/3643
  - Fix control panel alignment in UI
    - https://github.com/shaka-project/shaka-player/pull/3650
  - Export missing polyfill install methods
    - https://github.com/shaka-project/shaka-player/pull/3660
  - Dispose of ad manager on player detach
    - https://github.com/shaka-project/shaka-player/pull/3665
  - Add ResizeObserver to CS ad manager
    - https://github.com/shaka-project/shaka-player/pull/3652
  - Avoid seeking on src when start time is 0
    - https://github.com/shaka-project/shaka-player/issues/3518
    - https://github.com/shaka-project/shaka-player/pull/3644
  - Tolerate misaligned TS files
    - https://github.com/shaka-project/shaka-player/issues/3580
  - Account for server-side ad cue points in external text tracks
    - https://github.com/shaka-project/shaka-player/pull/3617
  - Fix stopping of Server Side Ad manager
    - https://github.com/shaka-project/shaka-player/pull/3611
  - Fix DRM workaround for Tizen and Xbox with ac-3 boxes
    - https://github.com/shaka-project/shaka-player/issues/3589
    - https://github.com/shaka-project/shaka-player/pull/3631
  - Fix DRM workaround for Tizen and Xbox with avc3 boxes
    - https://github.com/shaka-project/shaka-player/pull/3625
  - Fix `BUFFER_READ_OUT_OF_BOUNDS` error when CEA caption packets are empty
    - https://github.com/shaka-project/shaka-player/issues/3608
    - https://github.com/shaka-project/shaka-player/pull/3609
  - Fix error when un-storing DRM asset
    - https://github.com/shaka-project/shaka-player/issues/3534
  - Fix CC parsing of EPB and v1 TKHD boxes
    - https://github.com/shaka-project/shaka-player/issues/3502
    - https://github.com/shaka-project/shaka-player/pull/3610
  - Always polyfill MediaCapabilities for Apple browsers
    - https://github.com/shaka-project/shaka-player/pull/3588
  - Add Support to iOS 12 in MediaCapabilities polyfill
    - https://github.com/shaka-project/shaka-player/pull/3573
  - Add support to file type in MediaCapabilities implementation
    - https://github.com/shaka-project/shaka-player/pull/3570
  - Display captions with forward slashes
    - https://github.com/shaka-project/shaka-player/issues/3555
    - https://github.com/shaka-project/shaka-player/pull/3556
  - Add support to file type in MediaCapabilities polyfill
    - https://github.com/shaka-project/shaka-player/pull/3569
  - Use "undetermined" for missing CC language
  - Fix FairPlay playback
    - https://github.com/shaka-project/shaka-player/pull/3531
  - Exit PiP when destroying UI
    - https://github.com/shaka-project/shaka-player/issues/3553

Docs:
  - Add FAQ entry for common Vue problem
    - https://github.com/shaka-project/shaka-player/issues/3155


## 3.1.3 (2021-10-13)

Bugfixes:
  - Work around override of MediaCapabilities polyfill in Apple browsers
    - https://github.com/shaka-project/shaka-player/issues/3530
    - https://github.com/shaka-project/shaka-player/pull/3668
  - Add support to file type in MediaCapabilities implementation
    - https://github.com/shaka-project/shaka-player/pull/3570
  - Fix video poster when autoplay is disabled
    - https://github.com/shaka-project/shaka-player/pull/3645
  - Fix tracking of active variant track in live streams
  - Fixes updating of nested cues
    - https://github.com/shaka-project/shaka-player/issues/3524
    - https://github.com/shaka-project/shaka-player/issues/3643
  - Fix ttml erroneously dismissing cues
    - https://github.com/shaka-project/shaka-player/issues/3643
  - Fix control panel alignment in UI
    - https://github.com/shaka-project/shaka-player/pull/3650
  - Export missing polyfill install methods
    - https://github.com/shaka-project/shaka-player/pull/3660
  - Dispose of ad manager on player detach
    - https://github.com/shaka-project/shaka-player/pull/3665
  - Add ResizeObserver to CS ad manager
    - https://github.com/shaka-project/shaka-player/pull/3652
  - Avoid seeking on src when start time is 0
    - https://github.com/shaka-project/shaka-player/issues/3518
    - https://github.com/shaka-project/shaka-player/pull/3644
  - Tolerate misaligned TS files
    - https://github.com/shaka-project/shaka-player/issues/3580
  - Fix stopping of Server Side Ad manager
    - https://github.com/shaka-project/shaka-player/pull/3611
  - Fix DRM workaround for Tizen and Xbox with ac-3 boxes
    - https://github.com/shaka-project/shaka-player/issues/3589
    - https://github.com/shaka-project/shaka-player/pull/3631
  - Fix DRM workaround for Tizen and Xbox with avc3 boxes
    - https://github.com/shaka-project/shaka-player/pull/3625
  - Fix `BUFFER_READ_OUT_OF_BOUNDS` error when CEA caption packets are empty
    - https://github.com/shaka-project/shaka-player/issues/3608
    - https://github.com/shaka-project/shaka-player/pull/3609
  - Fix error when un-storing DRM asset
    - https://github.com/shaka-project/shaka-player/issues/3534
  - Fix CC parsing of EPB and v1 TKHD boxes
    - https://github.com/shaka-project/shaka-player/issues/3502
    - https://github.com/shaka-project/shaka-player/pull/3610
  - Always polyfill MediaCapabilities for Apple browsers
    - https://github.com/shaka-project/shaka-player/pull/3588
  - Add Support to iOS 12 in MediaCapabilities polyfill
    - https://github.com/shaka-project/shaka-player/pull/3573
  - Display captions with forward slashes
    - https://github.com/shaka-project/shaka-player/issues/3555
    - https://github.com/shaka-project/shaka-player/pull/3556
  - Add support to file type in MediaCapabilities polyfill
    - https://github.com/shaka-project/shaka-player/pull/3569
  - Use "undetermined" for missing CC language
  - Exit PiP when destroying UI
    - https://github.com/shaka-project/shaka-player/issues/3553

Docs:
  - Add FAQ entry for common Vue problem
    - https://github.com/shaka-project/shaka-player/issues/3155


## 3.0.14 (2021-10-13)

Bugfixes:
  - Fix video poster when autoplay is disabled
    - https://github.com/shaka-project/shaka-player/pull/3645
  - Fix tracking of active variant track in live streams
  - Fix control panel alignment in UI
    - https://github.com/shaka-project/shaka-player/pull/3650
  - Export missing polyfill install methods
    - https://github.com/shaka-project/shaka-player/pull/3660
  - Dispose of ad manager on player detach
    - https://github.com/shaka-project/shaka-player/pull/3665
  - Add ResizeObserver to CS ad manager
    - https://github.com/shaka-project/shaka-player/pull/3652
  - Avoid seeking on src when start time is 0
    - https://github.com/shaka-project/shaka-player/issues/3518
    - https://github.com/shaka-project/shaka-player/pull/3644
  - Tolerate misaligned TS files
    - https://github.com/shaka-project/shaka-player/issues/3580
  - Fix stopping of Server Side Ad manager
    - https://github.com/shaka-project/shaka-player/pull/3611
  - Fix DRM workaround for Tizen and Xbox with ac-3 boxes
    - https://github.com/shaka-project/shaka-player/issues/3589
    - https://github.com/shaka-project/shaka-player/pull/3631
  - Fix DRM workaround for Tizen and Xbox with avc3 boxes
    - https://github.com/shaka-project/shaka-player/pull/3625
  - Fix error when un-storing DRM asset
    - https://github.com/shaka-project/shaka-player/issues/3534
  - Exit PiP when destroying UI
    - https://github.com/shaka-project/shaka-player/issues/3553

Docs:
  - Add FAQ entry for common Vue problem
    - https://github.com/shaka-project/shaka-player/issues/3155


## 3.2.0 (2021-07-14)

New Features:
  - MediaCapabilities support: configs for preferred codecs, decoding
    attributes, and key systems
    - https://github.com/shaka-project/shaka-player/pull/3424
    - https://github.com/shaka-project/shaka-player/issues/1391
    - https://github.com/shaka-project/shaka-player/issues/3002
  - Support more frequent segment updates during streaming
    - https://github.com/shaka-project/shaka-player/pull/3483
  - Add callback for apps to pre-process DASH manifests
    - https://github.com/shaka-project/shaka-player/issues/3339
    - https://github.com/shaka-project/shaka-player/pull/3480
  - Add chapters support
    - https://github.com/shaka-project/shaka-player/pull/2972
  - Add support for HLS Image Media Playlists
    - https://github.com/shaka-project/shaka-player/pull/3365
  - Add align and vertical settings to WebVttGenerator
    - https://github.com/shaka-project/shaka-player/pull/3413
  - Add a buffer fullness method
    - https://github.com/shaka-project/shaka-player/issues/3389
    - https://github.com/shaka-project/shaka-player/pull/3392
  - Progress toward FairPlay DRM w/ MSE
    - https://github.com/shaka-project/shaka-player/pull/3347
  - Add serverCertificateUri in DRM advanced config
    - https://github.com/shaka-project/shaka-player/issues/1906
    - https://github.com/shaka-project/shaka-player/pull/3358
  - Add goToLive method
    - https://github.com/shaka-project/shaka-player/pull/3527


## 3.1.2 (2021-07-14)

Bugfixes:
  - Fix choosing tracks from streaming event
    - https://github.com/shaka-project/shaka-player/issues/3448
    - https://github.com/shaka-project/shaka-player/pull/3459
  - Fix multiperiod without consistent thumbnails
    - https://github.com/shaka-project/shaka-player/issues/3383
  - Fix failure with multiple thumbnails per period
    - https://github.com/shaka-project/shaka-player/issues/3383
  - Update Play icon after seeking from end
    - https://github.com/shaka-project/shaka-player/pull/3515
  - Reset forced subs between loads
  - Fix thumbnail position calculation
    - https://github.com/shaka-project/shaka-player/issues/3511
    - https://github.com/shaka-project/shaka-player/pull/3516
  - Fix thumbnail duration, expose start time and duration
    - https://github.com/shaka-project/shaka-player/pull/3517
  - Fix enforcement of cue alignment styles
    - https://github.com/shaka-project/shaka-player/issues/3379
  - Fix DASH transition from dynamic to static
    - https://github.com/shaka-project/shaka-player/pull/3497
  - Fix ARIA label on replay button
    - https://github.com/shaka-project/shaka-player/pull/3513
  - Fix audio language switching while using AirPlay
    - https://github.com/shaka-project/shaka-player/issues/3125
    - https://github.com/shaka-project/shaka-player/pull/3472
  - Show captions with rapid seek when ignoreTextStreamFailures is true
    - https://github.com/shaka-project/shaka-player/pull/3476
  - Fix clearing buffer when requested for already-selected variant
    - https://github.com/shaka-project/shaka-player/pull/3477
  - Fix hung playback on rapid seek
    - https://github.com/shaka-project/shaka-player/pull/3479
  - Don't show AirPlay button if unavailable
    - https://github.com/shaka-project/shaka-player/issues/3471
  - Fix bogus debug logs

Docs:
  - Update upgrade guides
    - https://github.com/shaka-project/shaka-player/issues/3487


## 3.0.13 (2021-07-14)

Bugfixes:
  - Fix choosing tracks from streaming event
    - https://github.com/shaka-project/shaka-player/issues/3448
    - https://github.com/shaka-project/shaka-player/pull/3459
  - Update Play icon after seeking from end
    - https://github.com/shaka-project/shaka-player/pull/3515
  - Fix DASH transition from dynamic to static
    - https://github.com/shaka-project/shaka-player/pull/3497
  - Fix ARIA label on replay button
    - https://github.com/shaka-project/shaka-player/pull/3513
  - Fix audio language switching while using AirPlay
    - https://github.com/shaka-project/shaka-player/issues/3125
    - https://github.com/shaka-project/shaka-player/pull/3472
  - Show captions with rapid seek when ignoreTextStreamFailures is true
    - https://github.com/shaka-project/shaka-player/pull/3476
  - Fix clearing buffer when requested for already-selected variant
    - https://github.com/shaka-project/shaka-player/pull/3477
  - Fix hung playback on rapid seek
    - https://github.com/shaka-project/shaka-player/pull/3479


## 3.1.1 (2021-06-17)

Bugfixes:
  - Fix buffering due to re-fetch in multi-period DASH
    - https://github.com/shaka-project/shaka-player/pull/3419
    - https://github.com/shaka-project/shaka-player/issues/3354
  - Prioritize AVERAGE-BANDWIDTH over BANDWIDTH in HLS
    - https://github.com/shaka-project/shaka-player/pull/3428
  - Fix EC-3 box support in DRM workaround on smart TVs
    - https://github.com/shaka-project/shaka-player/pull/3427
  - Fix exception in UI on devices that do not support fullscreen
    - https://github.com/shaka-project/shaka-player/issues/3441
  - Fix caption positioning and sizing when the container resizes
    - https://github.com/shaka-project/shaka-player/pull/3426
    - https://github.com/shaka-project/shaka-player/pull/3425
    - https://github.com/shaka-project/shaka-player/pull/3414
  - Fix exceptions thrown in content with trick-mode tracks
    - https://github.com/shaka-project/shaka-player/issues/3423
  - Filter unsupported H.264 streams in Xbox
    - https://github.com/shaka-project/shaka-player/pull/3411
  - Fix out-of-bounds exception in LL-DASH
    - https://github.com/shaka-project/shaka-player/issues/3402
    - https://github.com/shaka-project/shaka-player/pull/3403
  - Fix failures and gaps in LL-DASH
    - https://github.com/shaka-project/shaka-player/issues/3404
    - https://github.com/shaka-project/shaka-player/pull/3405
  - Allow muxjs to be loaded after Shaka
    - https://github.com/shaka-project/shaka-player/issues/3407
  - Choose the configured preferred text role at start
    - https://github.com/shaka-project/shaka-player/pull/3399
  - Fix STORAGE_LIMIT_REACHED error masked by DOWNLOAD_SIZE_CALLBACK_ERROR
    - https://github.com/shaka-project/shaka-player/pull/3396
  - Fix "details" field in shaka-ui-load-failed event
    - https://github.com/shaka-project/shaka-player/issues/3388
  - Ignore network changes if ABR is disabled
    - https://github.com/shaka-project/shaka-player/pull/3387
  - Fix ClearKey+WebM+src= playback failure
    - https://github.com/shaka-project/shaka-player/issues/3366

Docs:
  - Document disabling Range header requests in HLS
    - https://github.com/shaka-project/shaka-player/pull/3442
  - Add Angular integration link
    - https://github.com/shaka-project/shaka-player/pull/3409

Demo App:
  - Add MIME type and extra config to custom assets


## 3.0.12 (2021-06-17)

Bugfixes:
  - Fix buffering due to re-fetch in multi-period DASH
    - https://github.com/shaka-project/shaka-player/pull/3419
    - https://github.com/shaka-project/shaka-player/issues/3354
  - Prioritize AVERAGE-BANDWIDTH over BANDWIDTH in HLS
    - https://github.com/shaka-project/shaka-player/pull/3428
  - Fix EC-3 box support in DRM workaround on smart TVs
    - https://github.com/shaka-project/shaka-player/pull/3427
  - Fix exception in UI on devices that do not support fullscreen
    - https://github.com/shaka-project/shaka-player/issues/3441
  - Fix caption positioning and sizing when the container resizes
    - https://github.com/shaka-project/shaka-player/pull/3426
    - https://github.com/shaka-project/shaka-player/pull/3425
    - https://github.com/shaka-project/shaka-player/pull/3414
  - Fix exceptions thrown in content with trick-mode tracks
    - https://github.com/shaka-project/shaka-player/issues/3423
  - Filter unsupported H.264 streams in Xbox
    - https://github.com/shaka-project/shaka-player/pull/3411
  - Choose the configured preferred text role at start
    - https://github.com/shaka-project/shaka-player/pull/3399
  - Fix ClearKey+WebM+src= playback failure
    - https://github.com/shaka-project/shaka-player/issues/3366
  - Fix double-display of embedded and non-embedded captions
    - https://github.com/shaka-project/shaka-player/issues/3199

Docs:
  - Document disabling Range header requests in HLS
    - https://github.com/shaka-project/shaka-player/pull/3442
  - Add Angular integration link
    - https://github.com/shaka-project/shaka-player/pull/3409


## 2.5.23 (2021-06-17)

Bugfixes:
  - Prioritize AVERAGE-BANDWIDTH over BANDWIDTH in HLS
    - https://github.com/shaka-project/shaka-player/pull/3428
  - Fix exception in UI on devices that do not support fullscreen
    - https://github.com/shaka-project/shaka-player/issues/3441
  - Fix caption positioning and sizing when the container resizes
    - https://github.com/shaka-project/shaka-player/pull/3426
    - https://github.com/shaka-project/shaka-player/pull/3425
    - https://github.com/shaka-project/shaka-player/pull/3414
  - Filter unsupported H.264 streams in Xbox
    - https://github.com/shaka-project/shaka-player/pull/3411
  - Choose the configured preferred text role at start
    - https://github.com/shaka-project/shaka-player/pull/3399
  - Fix ClearKey+WebM+src= playback failure
    - https://github.com/shaka-project/shaka-player/issues/3366

Docs:
  - Add Angular integration link
    - https://github.com/shaka-project/shaka-player/pull/3409


## 3.1.0 (2021-04-29)

New Features:
  - Ads APIs are now STABLE (no longer BETA)
  - MediaCapabilities support (BETA)
    - https://github.com/shaka-project/shaka-player/issues/1391
  - Remove support for IE11
    - https://github.com/shaka-project/shaka-player/issues/2339
  - Low-latency HLS (LL-HLS) and DASH (LL-DASH) support
    - https://github.com/shaka-project/shaka-player/issues/1525
  - Make DASH keySystems configurable
    - https://github.com/shaka-project/shaka-player/pull/3276
  - Make DRM sessionType configurable in advanced DRM config
    - https://github.com/shaka-project/shaka-player/pull/3301
  - Add Loop, PIP, Cast, AirPlay buttons to control panel
    - https://github.com/shaka-project/shaka-player/issues/2676
    - https://github.com/shaka-project/shaka-player/pull/3255
  - Network stall detection
    - https://github.com/shaka-project/shaka-player/pull/3227
  - Store thumbnails for offline playback
    - https://github.com/shaka-project/shaka-player/pull/3280
  - Extract HDR metadata from DASH manifests
    - https://github.com/shaka-project/shaka-player/pull/3226
  - Make gap detection threshold configurable
    - https://github.com/shaka-project/shaka-player/pull/3166
  - Support WebVTT default text color and default text background color
    - https://github.com/shaka-project/shaka-player/issues/3182
    - https://github.com/shaka-project/shaka-player/pull/3182
  - Add support for thumbnail tracks
    - https://github.com/shaka-project/shaka-player/pull/3145
  - Add getKeyStatuses to Player
  - Parse spatial audio from manifest
    - https://github.com/shaka-project/shaka-player/pull/3148
  - Add support for WebVTT style blocks
    - https://github.com/shaka-project/shaka-player/pull/3071
  - Add SubViewer (SBV) support
    - https://github.com/shaka-project/shaka-player/pull/3063
    - https://github.com/shaka-project/shaka-player/pull/3266
  - Add SubStation Alpha (SSA) support
    - https://github.com/shaka-project/shaka-player/pull/3060
  - Add downloadSizeCallback before storing offline
    - https://github.com/shaka-project/shaka-player/issues/3049
    - https://github.com/shaka-project/shaka-player/pull/3049
  - Extract HDR metadata from HLS manifests
    - https://github.com/shaka-project/shaka-player/issues/3116
    - https://github.com/shaka-project/shaka-player/pull/3116
  - add ignoreMaxSegmentDuration config for DASH manifest
    - https://github.com/shaka-project/shaka-player/pull/3115
  - Add navigator.storage.estimate polyfill
    - https://github.com/shaka-project/shaka-player/issues/2900
    - https://github.com/shaka-project/shaka-player/pull/3050
  - Prefer unprefixed EME for Safari
    - https://github.com/shaka-project/shaka-player/pull/3021
  - Add config to prefer native HLS playback
    - https://github.com/shaka-project/shaka-player/issues/3077
  - Add LyRiCs (LRC) support
    - https://github.com/shaka-project/shaka-player/pull/3036
  - Add support for SMPTE namespace 2013
    - https://github.com/shaka-project/shaka-player/issues/3061
    - https://github.com/shaka-project/shaka-player/pull/3062
  - Add support for mpegB:cicp:ChannelConfiguration
    - https://github.com/shaka-project/shaka-player/pull/3057
  - Config to prefer forced subtitles
    - https://github.com/shaka-project/shaka-player/pull/3022
  - Change default network request timeout
    - https://github.com/shaka-project/shaka-player/pull/3024
  - Optionally force HTTPS content URIs
    - https://github.com/shaka-project/shaka-player/pull/3025
  - Add parameter to probeSupport to skip DRM tests
    - https://github.com/shaka-project/shaka-player/pull/3047
  - Add autoLowLatencyMode config
    - https://github.com/shaka-project/shaka-player/issues/1525
    - https://github.com/shaka-project/shaka-player/pull/2861
  - Allow apps to register a custom seek bar UI implementation
    - https://github.com/shaka-project/shaka-player/issues/2924
    - https://github.com/shaka-project/shaka-player/pull/2966
  - Parse forced subtitles from manifest
    - https://github.com/shaka-project/shaka-player/issues/2122
    - https://github.com/shaka-project/shaka-player/issues/2916
    - https://github.com/shaka-project/shaka-player/pull/2938
  - Add addTextTrackAsync
    - https://github.com/shaka-project/shaka-player/pull/2932
  - Allow showing track labels in UI
    - https://github.com/shaka-project/shaka-player/issues/2927
  - Allow switching between mono and stereo tracks
    - https://github.com/shaka-project/shaka-player/pull/2911
  - Add support to side-load subtitles in src mode
    - https://github.com/shaka-project/shaka-player/pull/2874
  - Add SubRip (SRT) subtitle support
    - https://github.com/shaka-project/shaka-player/pull/2872
  - CEA-708 Decoder
    - https://github.com/shaka-project/shaka-player/pull/2807
  - Added completionPercent to playback stats
  - Render bold/italics/underline on SimpleTextDisplayer
    - https://github.com/shaka-project/shaka-player/pull/2779
  - Adds VTT tag rendering for bold, italic, and underline
    - https://github.com/shaka-project/shaka-player/issues/2348
    - https://github.com/shaka-project/shaka-player/pull/2776
  - CEA-608 Decoder
    - https://github.com/shaka-project/shaka-player/issues/2648
    - https://github.com/shaka-project/shaka-player/pull/2731
    - https://github.com/shaka-project/shaka-player/pull/2649
    - https://github.com/shaka-project/shaka-player/pull/2660
  - Add dependencies module to allow custom dependency injection
    - https://github.com/shaka-project/shaka-player/issues/2562
    - https://github.com/shaka-project/shaka-player/pull/2683
  - Add HLS PlayReady support
    - https://github.com/shaka-project/shaka-player/pull/2719
  - Add AirPlay button to overflow menu
    - https://github.com/shaka-project/shaka-player/pull/2701
  - Use Network Information API to react to network changes
    - https://github.com/shaka-project/shaka-player/pull/2663
  - Added polyfill for screen.orientation
  - Add support for EXT-X-SESSION-DATA in HLS
    - https://github.com/shaka-project/shaka-player/pull/2642
  - Add forceLandscapeOnFullscreen UI config
    - https://github.com/shaka-project/shaka-player/issues/883
    - https://github.com/shaka-project/shaka-player/issues/2653


## 3.0.11 (2021-04-28)

Bugfixes:
  - Assume MP4 in HLS if MIME type can't be deduced
    - https://github.com/shaka-project/shaka-player/issues/3142
    - https://github.com/shaka-project/shaka-player/pull/3325
  - Fix resolution changes with lang change
    - https://github.com/shaka-project/shaka-player/issues/3262
    - https://github.com/shaka-project/shaka-player/issues/3288
  - Resume previous playback speed after pause
    - https://github.com/shaka-project/shaka-player/issues/3261
  - Fix updating of the mute icon
    - https://github.com/shaka-project/shaka-player/pull/3307
  - Fix text writing-mode support in old versions of Tizen and WebOS
    - https://github.com/shaka-project/shaka-player/pull/3330
  - Show replay icon instead of play when video ends
    - https://github.com/shaka-project/shaka-player/issues/3247
    - https://github.com/shaka-project/shaka-player/pull/3253
  - Fix cross-browser focus outline
    - https://github.com/shaka-project/shaka-player/issues/2863
  - Fix rapid keyboard-based seeking
    - https://github.com/shaka-project/shaka-player/issues/3234
    - https://github.com/shaka-project/shaka-player/pull/3259
  - Fix holding keyboard controls
    - https://github.com/shaka-project/shaka-player/pull/3267
  - Display cursors as pointers on overflow menu buttons
    - https://github.com/shaka-project/shaka-player/pull/3218
  - Fix failed assertion for eviction logic
    - https://github.com/shaka-project/shaka-player/issues/3169
  - Fix stalls on a live dash stream
    - https://github.com/shaka-project/shaka-player/issues/3139
    - https://github.com/shaka-project/shaka-player/issues/3169
  - Fix HLS content type detection with text codecs
    - https://github.com/shaka-project/shaka-player/issues/3184

Ad Features (BETA):
  - Fix the skip ad button not being clickable
    - https://github.com/shaka-project/shaka-player/issues/3284
    - https://github.com/shaka-project/shaka-player/pull/3326
  - Add the original IMA event to the Shaka `AD_CLICKED` event
    - https://github.com/shaka-project/shaka-player/issues/3304
  - Add more info on serving limited ads to the tutorial

Demo App:
  - Fix centering of icons, add hover effect on settings
    - https://github.com/shaka-project/shaka-player/pull/3352

Docs:
  - Update event docs and event links
    - https://github.com/shaka-project/shaka-player/pull/3256
  - Add the UI Theme Gallery link to the docs
    - https://github.com/shaka-project/shaka-player/issues/3246
  - Fixed various grammatical errors and typos
    - https://github.com/shaka-project/shaka-player/pull/3342
    - https://github.com/shaka-project/shaka-player/pull/3340
  - Fix offline tutorial to use the correct config
    - https://github.com/shaka-project/shaka-player/pull/3337

Misc:
  - Allow testing with Chromium-based Edge in Karma
    - https://github.com/shaka-project/shaka-player/pull/3265
  - Official Xbox One support
    - https://github.com/shaka-project/shaka-player/issues/1705


## 2.5.22 (2021-04-28)

Bugfixes:
  - Assume MP4 in HLS if MIME type can't be deduced
    - https://github.com/shaka-project/shaka-player/issues/3142
    - https://github.com/shaka-project/shaka-player/pull/3325
  - Fix resolution changes with lang change
    - https://github.com/shaka-project/shaka-player/issues/3262
    - https://github.com/shaka-project/shaka-player/issues/3288
  - Resume previous playback speed after pause
    - https://github.com/shaka-project/shaka-player/issues/3261
  - Fix updating of the mute icon
    - https://github.com/shaka-project/shaka-player/pull/3307
  - Fix text writing-mode support in old versions of Tizen and WebOS
    - https://github.com/shaka-project/shaka-player/pull/3330
  - Show replay icon instead of play when video ends
    - https://github.com/shaka-project/shaka-player/issues/3247
    - https://github.com/shaka-project/shaka-player/pull/3253
  - Fix cross-browser focus outline
    - https://github.com/shaka-project/shaka-player/issues/2863
  - Fix rapid keyboard-based seeking
    - https://github.com/shaka-project/shaka-player/issues/3234
    - https://github.com/shaka-project/shaka-player/pull/3259
  - Fix holding keyboard controls
    - https://github.com/shaka-project/shaka-player/pull/3267
  - Fix stylelint on Windows
    - https://github.com/shaka-project/shaka-player/issues/2985
    - https://github.com/shaka-project/shaka-player/pull/3214
  - Display cursors as pointers on overflow menu buttons
    - https://github.com/shaka-project/shaka-player/pull/3218

Demo App:
  - Fix centering of icons, add hover effect on settings
    - https://github.com/shaka-project/shaka-player/pull/3352

Docs:
  - Update event docs and event links
  - Add the UI Theme Gallery link to the docs
    - https://github.com/shaka-project/shaka-player/issues/3246
  - Fixed various grammatical errors and typos
    - https://github.com/shaka-project/shaka-player/pull/3342
    - https://github.com/shaka-project/shaka-player/pull/3340

Misc:
  - Allow testing with Chromium-based Edge in Karma
    - https://github.com/shaka-project/shaka-player/pull/3265
  - Official Xbox One support
    - https://github.com/shaka-project/shaka-player/issues/1705


## 3.0.10 (2021-03-18)

Bugfixes:
  - Fix stalls in some multi-Period DASH content
    - https://github.com/shaka-project/shaka-player/issues/3230
  - Fix stylelint errors on Windows
    - https://github.com/shaka-project/shaka-player/issues/2985
    - https://github.com/shaka-project/shaka-player/pull/3214


## 3.0.9 (2021-03-15)

Bugfixes:
  - Fixed build error on Windows
    - https://github.com/shaka-project/shaka-player/issues/3208
    - https://github.com/shaka-project/shaka-player/issues/3204
    - https://github.com/shaka-project/shaka-player/pull/3211
  - Exported SegmentReference.getUris
    - https://github.com/shaka-project/shaka-player/issues/3096
  - Fix giant gaps in SSAI content
    - https://github.com/shaka-project/shaka-player/issues/3191
  - Fix TTML background image attribute case
    - https://github.com/shaka-project/shaka-player/issues/3196
  - Avoid setting global Cast hook
    - https://github.com/shaka-project/shaka-player/issues/3167
  - Fix codec choice when resolutions differ
    - https://github.com/shaka-project/shaka-player/issues/3056
    - https://github.com/shaka-project/shaka-player/pull/3072
  - Fix autoplay for non-zero-start VOD
    - https://github.com/shaka-project/shaka-player/issues/2987
  - Allow playing Periods with missing text
    - https://github.com/shaka-project/shaka-player/issues/2957
  - Support localized whitespace preservation in TTML
    - https://github.com/shaka-project/shaka-player/issues/3011
    - https://github.com/shaka-project/shaka-player/pull/3043
  - Fix offline storage after a failure
    - https://github.com/shaka-project/shaka-player/issues/2781
  - Fix repeated seek on start for some content
    - https://github.com/shaka-project/shaka-player/issues/2831
  - Fix subtitle display in timing edge case
    - https://github.com/shaka-project/shaka-player/issues/3151
    - https://github.com/shaka-project/shaka-player/pull/3152
  - Support version 1 emsg boxes
    - https://github.com/shaka-project/shaka-player/issues/1539
    - https://github.com/shaka-project/shaka-player/pull/3147
    - https://github.com/shaka-project/shaka-player/pull/3198

Ads (BETA):
  - Change the value of the 'mpt' param we set for tracking
  - Expose native IMA stream manager for SS DAI
  - Hide the ad container when ads aren't playing
    - https://github.com/shaka-project/shaka-player/issues/3121
  - Add "limited ads" section to the ads tutorial
  - Expand the IMA integration tutorial
    - https://github.com/shaka-project/shaka-player/issues/3168

Docs:
  - Fixed various typos
    - https://github.com/shaka-project/shaka-player/pull/3222
  - Fixed outdated info and typos
    - https://github.com/shaka-project/shaka-player/pull/3206
  - Document programmatic UI setup
    - https://github.com/shaka-project/shaka-player/issues/2655
  - Update doc for manifest and segment ALR
  - Add vue.js, nuxt.js and video.js integration examples
    - https://github.com/shaka-project/shaka-player/pull/3160

Demo App:
  - Make it possible to add custom ad assets with no manifest uri.
    - https://github.com/shaka-project/shaka-player/issues/3136
  - Add an ADS tab to the custom content page
    - https://github.com/shaka-project/shaka-player/issues/3136
  - Add DAI live DASH example to DEMO app
    - https://github.com/shaka-project/shaka-player/pull/3170


## 2.5.21 (2021-03-12)

Bugfixes:
  - Fix giant gaps in SSAI content
    - https://github.com/shaka-project/shaka-player/issues/3191
  - Fix TTML background image attribute case
    - https://github.com/shaka-project/shaka-player/issues/3196
  - Avoid setting global Cast hook
    - https://github.com/shaka-project/shaka-player/issues/3167
  - Fix codec choice when resolutions differ
    - https://github.com/shaka-project/shaka-player/pull/3072
  - Fix autoplay for non-zero-start VOD
    - https://github.com/shaka-project/shaka-player/issues/2987
  - Support localized whitespace preservation in TTML
    - https://github.com/shaka-project/shaka-player/issues/3011
    - https://github.com/shaka-project/shaka-player/pull/3043
  - Fix repeated seek on start for some content
    - https://github.com/shaka-project/shaka-player/issues/2831
  - Fix subtitle display in timing edge case
    - https://github.com/shaka-project/shaka-player/issues/3151
    - https://github.com/shaka-project/shaka-player/pull/3152
  - Fixed build error on Windows
    - https://github.com/shaka-project/shaka-player/pull/3211
    - https://github.com/shaka-project/shaka-player/issues/3208
    - https://github.com/shaka-project/shaka-player/issues/3204

Docs:
  - Fixed outdated info and typos
    - https://github.com/shaka-project/shaka-player/pull/3206
  - Fixed various typos
    - https://github.com/shaka-project/shaka-player/pull/3222
  - Document programmatic UI setup
    - https://github.com/shaka-project/shaka-player/issues/2655
  - Update doc for manifest and segment ALR


## 3.0.8 (2021-02-08)

Bugfixes:
  - Fix memory leak in Webpack-bundled version
    - https://github.com/shaka-project/shaka-player/issues/3092
    - https://github.com/shaka-project/shaka-player/pull/3098
  - Fix build in Python 3
    - https://github.com/shaka-project/shaka-player/issues/3102
  - Fix broken build in directories with spaces
    - https://github.com/shaka-project/shaka-player/issues/3102
  - Fix mixed clear/encrypted content on Xbox & Tizen
    - https://github.com/shaka-project/shaka-player/issues/2759
  - Fix trick mode tracks in DASH (work around compiler bug)
    - https://github.com/shaka-project/shaka-player/issues/3085
    - https://github.com/shaka-project/shaka-player/pull/3087
  - Fix DRM initialization on WebOS 3.0
    - https://github.com/shaka-project/shaka-player/pull/3109
  - Fix segment refs for "future" DASH periods
  - Recognize "m4f" extension in HLS
    - https://github.com/shaka-project/shaka-player/issues/3099
    - https://github.com/shaka-project/shaka-player/pull/3111
  - Catch unhandled rejection while destroying StreamingEngine
  - Fix header sizes for MP4 boxes with 64-bit size fields
  - Fix load-time exception in nodejs

Ads (BETA):
  - Use the correct AdsLoader `AD_ERROR` event
    - https://github.com/shaka-project/shaka-player/issues/3095
    - https://github.com/shaka-project/shaka-player/pull/3105
  - Expose getMinSuggestedDuration
  - Add setVpaidMode to the IMA externs
    - https://github.com/shaka-project/shaka-player/pull/3135


## 2.5.20 (2021-02-08)

Bugfixes:
  - Fix build in Python 3
    - https://github.com/shaka-project/shaka-player/issues/3102
  - Fix broken build in directories with spaces
    - https://github.com/shaka-project/shaka-player/issues/3102
  - Fix trick mode tracks in DASH (work around compiler bug)
    - https://github.com/shaka-project/shaka-player/issues/3085
    - https://github.com/shaka-project/shaka-player/pull/3087
  - Fix DRM initialization on WebOS 3.0
    - https://github.com/shaka-project/shaka-player/pull/3109
  - Recognize "m4f" extension in HLS
    - https://github.com/shaka-project/shaka-player/issues/3099
    - https://github.com/shaka-project/shaka-player/pull/3111
  - Fix header sizes for MP4 boxes with 64-bit size fields


## 3.0.7 (2021-01-06)

Bugfixes:
  - Fix text failures triggered by rapid stream switches
  - Remove legacy Edge workarounds on new Edge
  - Fix viewport anchor calculations in TTML
    - https://github.com/shaka-project/shaka-player/pull/3065
  - Fix slow memory leak related to MediaSource object URLs
    - https://github.com/shaka-project/shaka-player/issues/2953
  - Fix clicking in interactive client-side ads
    - https://github.com/shaka-project/shaka-player/issues/3053
  - Improve cue comparison performance
    - https://github.com/shaka-project/shaka-player/issues/3018
  - Fix race condition in text stream scheduling
    - https://github.com/shaka-project/shaka-player/issues/2764
  - Fix multiple stream-merging issues with DASH multi-period content
    - https://github.com/shaka-project/shaka-player/issues/2785
    - https://github.com/shaka-project/shaka-player/issues/2884
  - Fix exception when removing content from buffer
    - https://github.com/shaka-project/shaka-player/issues/2982
    - https://github.com/shaka-project/shaka-player/pull/3042
  - Fix memory leak in DASH with SegmentTimeline
    - https://github.com/shaka-project/shaka-player/issues/3038
    - https://github.com/shaka-project/shaka-player/pull/3039
  - Fix trick-mode tracks associated with multiple regular tracks
    - https://github.com/shaka-project/shaka-player/pull/2992
  - Fix TS DRM failures
    - https://github.com/shaka-project/shaka-player/issues/2981
  - Work around misreported AC-3 support on Tizen
    - https://github.com/shaka-project/shaka-player/issues/2989
  - Ignore incompatible TrickMode streams
    - https://github.com/shaka-project/shaka-player/pull/2984
  - Fix rare exception thrown when switching streams
    - https://github.com/shaka-project/shaka-player/issues/2956
    - https://github.com/shaka-project/shaka-player/issues/2970
  - Fix rendering of line breaks in text cues
    - https://github.com/shaka-project/shaka-player/issues/2828

Ads (BETA):
  - Fix ad disappearance when reconfiguring UI during an ad
    - https://github.com/shaka-project/shaka-player/issues/2869
    - https://github.com/shaka-project/shaka-player/issues/2943
  - Fix stopping ad manager after adblock

Build:
  - Fix build issues with Python 3
    - https://github.com/shaka-project/shaka-player/issues/3003
    - https://github.com/shaka-project/shaka-player/issues/3004
  - Fix running build scripts on Windows
    - https://github.com/shaka-project/shaka-player/issues/2988
  - Fix build error about stylelint paths
  - Fix build failure in context of node module

Demo App:
  - Fix keyboard navigation in settings
    - https://github.com/shaka-project/shaka-player/issues/2986

Docs:
  - Clean up doc generation
  - Fix docs generation for enums in ui
    - https://github.com/shaka-project/shaka-player/issues/2698


## 2.5.19 (2021-01-06)

Bugfixes:
  - Remove legacy Edge workarounds on new Edge
  - Fix viewport anchor calculations in TTML
    - https://github.com/shaka-project/shaka-player/pull/3065
  - Fix slow memory leak related to MediaSource object URLs
    - https://github.com/shaka-project/shaka-player/issues/2953
  - Improve cue comparison performance
    - https://github.com/shaka-project/shaka-player/issues/3018
  - Fix race condition in text stream scheduling
    - https://github.com/shaka-project/shaka-player/issues/2764
  - Fix exception when removing content from buffer
    - https://github.com/shaka-project/shaka-player/issues/2982
    - https://github.com/shaka-project/shaka-player/pull/3042
  - Work around misreported AC-3 support on Tizen
    - https://github.com/shaka-project/shaka-player/issues/2989
  - Fix trick-mode tracks associated with multiple regular tracks
    - https://github.com/shaka-project/shaka-player/pull/2992
  - Fix TS DRM failures
    - https://github.com/shaka-project/shaka-player/issues/2981
  - Ignore incompatible TrickMode streams
    - https://github.com/shaka-project/shaka-player/pull/2984

Build:
  - Fix build issues with Python 3
    - https://github.com/shaka-project/shaka-player/issues/3004
  - Fix running build scripts on Windows
    - https://github.com/shaka-project/shaka-player/issues/2988
  - Fix build error about stylelint paths
  - Fix build failure in context of node module

Demo App:
  - Fix keyboard navigation in settings
    - https://github.com/shaka-project/shaka-player/issues/2986

Docs:
  - Clean up doc generation
  - Fix docs generation for enums in ui
    - https://github.com/shaka-project/shaka-player/issues/2698


## 3.0.6 (2020-11-12)

Bugfixes:
  - Fix handling of metadata tracks for src= playback
    - https://github.com/shaka-project/shaka-player/pull/2971
  - Fix handling of role-less audio tracks
    - https://github.com/shaka-project/shaka-player/issues/2906
    - https://github.com/shaka-project/shaka-player/issues/2909
  - Fix support for multi-period encrypted live
    - https://github.com/shaka-project/shaka-player/issues/2979
    - https://github.com/shaka-project/shaka-player/issues/2645
  - Export UI externs
    - https://github.com/shaka-project/shaka-player/issues/2948
  - Fix duplicate init segment requests on manifest updates
    - https://github.com/shaka-project/shaka-player/issues/2856
    - https://github.com/shaka-project/shaka-player/pull/2942
  - Fix hard-coded TTML namespaces
    - https://github.com/shaka-project/shaka-player/issues/2756
  - Fix test failure on IE11
  - Filter out "chapters" tracks during src= playback
    - https://github.com/shaka-project/shaka-player/pull/2960
  - Fix compatibility for plugin factories
    - https://github.com/shaka-project/shaka-player/issues/2958
  - Be more permissive in vtt files
    - https://github.com/shaka-project/shaka-player/pull/2941
  - Fix renaming of UI base class protected members
    - https://github.com/shaka-project/shaka-player/issues/2923
  - Make submenu CSS apply to all submenus
    - https://github.com/shaka-project/shaka-player/issues/2925
  - Export FakeEvent for use by UI plugins
    - https://github.com/shaka-project/shaka-player/issues/2923
  - Recognize mp4a and mp4v extensions in HLS
  - Support multiple CHARACTERISTICS values in HLS
    - https://github.com/shaka-project/shaka-player/pull/2905
  - Don't auto-play after seeking while paused in the UI
    - https://github.com/shaka-project/shaka-player/pull/2898

Ad changes (BETA):
  - Allow apps to supply adsResponse property for IMA
    - https://github.com/shaka-project/shaka-player/issues/2892
    - https://github.com/shaka-project/shaka-player/pull/2946

Docs:
  - Add link to complete list of build categories
    - https://github.com/shaka-project/shaka-player/pull/2934
  - Correct receiver IDs in the UI tutorial
    - https://github.com/shaka-project/shaka-player/issues/2926
  - Update required Node version
    - https://github.com/shaka-project/shaka-player/issues/2913

Demo App:
  - Add test streams for CEA-608
    - https://github.com/shaka-project/shaka-player/pull/2939
  - Add new low latency DASH manifest
    - https://github.com/shaka-project/shaka-player/pull/2963
  - Remove redundant switch for manifest.dash.ignoreDrmInfo

Misc:
  - Add mkdir to make all build commands self-contained
    - https://github.com/shaka-project/shaka-player/issues/2973
    - https://github.com/shaka-project/shaka-player/pull/2977
  - Generate TypeScript defs with Clutz
    - https://github.com/shaka-project/shaka-player/issues/1030


## 2.5.18 (2020-11-12)

Bugfixes:
  - Fix handling of role-less audio tracks
    - https://github.com/shaka-project/shaka-player/issues/2906
    - https://github.com/shaka-project/shaka-player/issues/2909
  - Export UI externs
    - https://github.com/shaka-project/shaka-player/issues/2948
  - Fix hard-coded TTML namespaces
    - https://github.com/shaka-project/shaka-player/issues/2756
  - Filter out "chapters" tracks during src= playback
    - https://github.com/shaka-project/shaka-player/pull/2960
  - Fix renaming of UI base class protected members
    - https://github.com/shaka-project/shaka-player/issues/2923
  - Export FakeEvent for use by UI plugins
    - https://github.com/shaka-project/shaka-player/issues/2923
  - Recognize mp4a and mp4v extensions in HLS
  - Support multiple CHARACTERISTICS values in HLS
    - https://github.com/shaka-project/shaka-player/pull/2905
  - Don't auto-play after seeking while paused in the UI
    - https://github.com/shaka-project/shaka-player/pull/2898

Docs:
  - Add link to complete list of build categories
    - https://github.com/shaka-project/shaka-player/pull/2934
  - Update required Node version
    - https://github.com/shaka-project/shaka-player/issues/2913
  - Correct receiver app IDs in the UI tutorial
    - https://github.com/shaka-project/shaka-player/issues/2926

Demo App:
  - Remove redundant switch for manifest.dash.ignoreDrmInfo

Misc:
  - Add mkdir to make all build commands self-contained
    - https://github.com/shaka-project/shaka-player/issues/2973
    - https://github.com/shaka-project/shaka-player/pull/2977


## 3.0.5 (2020-10-07)

Bugfixes:
  - Fix hiding controls on mobile after touch
    - https://github.com/shaka-project/shaka-player/issues/2886
  - Ignore seek touch events on hidden controls
    - https://github.com/shaka-project/shaka-player/issues/2888
  - Fix interpretation of DEFAULT and AUTOSELECT in HLS
    - https://github.com/shaka-project/shaka-player/issues/2880
  - Avoid a race when clearing buffered content
  - Allow playback of video-only HLS via configuration
    - https://github.com/shaka-project/shaka-player/issues/2868
  - Make UITextDisplayer CSS-independent
    - https://github.com/shaka-project/shaka-player/issues/2817
    - https://github.com/shaka-project/shaka-player/pull/2819
  - Remove hard-coded tts:extent namespace in TTML parser
    - https://github.com/shaka-project/shaka-player/issues/2860
  - Don't apply seek range while content is still loading
    - https://github.com/shaka-project/shaka-player/issues/2848
    - https://github.com/shaka-project/shaka-player/issues/2748
    - https://github.com/shaka-project/shaka-player/pull/2849
  - Fix Shaka+Cast apps using IndexedDB
    - https://github.com/shaka-project/shaka-player/issues/2850
  - Permit applications to monkey-patch Date.now
    - https://github.com/shaka-project/shaka-player/pull/2857
  - Fix detection of Edge Chromium as Edge
    - https://github.com/shaka-project/shaka-player/pull/2855
  - Fix loading with global "define" set to null
    - https://github.com/shaka-project/shaka-player/issues/2847
  - Fix missing cues in UITextDisplayer
  - Fix storing modified init data for offline sessions
  - Fix duplicate text streams in multi-period DASH
    - https://github.com/shaka-project/shaka-player/pull/2885
  - Fix rapid seeking leading to infinite buffering
    - https://github.com/shaka-project/shaka-player/issues/2670
  - Fix non-deterministic exception in StreamingEngine
    - https://github.com/shaka-project/shaka-player/issues/2768
  - Fix bug where cue comparison throws
  - Fix exception on multi-period DASH
    - https://github.com/shaka-project/shaka-player/issues/2811
  - Fix embedded captions vanishing
    - https://github.com/shaka-project/shaka-player/issues/2811
  - Fix application of DRM server certificate
    - https://github.com/shaka-project/shaka-player/issues/2644
  - Fix multi-period DASH with period-specific codecs
    - https://github.com/shaka-project/shaka-player/issues/2883

Demo App:
  - Change the menu icon to a settings icon
  - Suppress bogus errors displayed during download

Docs:
  - Fix references to built-in CEA 608 support, not available in this branch
  - Add links to the roadmap
    - https://github.com/shaka-project/shaka-player/pull/2825


## 2.5.17 (2020-10-06)

Bugfixes:
  - Fix hiding controls on mobile after touch
    - https://github.com/shaka-project/shaka-player/issues/2886
  - Ignore seek touch events on hidden controls
    - https://github.com/shaka-project/shaka-player/issues/2888
  - Fix interpretation of DEFAULT and AUTOSELECT in HLS
    - https://github.com/shaka-project/shaka-player/issues/2880
  - Avoid a race when clearing buffered content
  - Allow playback of video-only HLS via configuration
    - https://github.com/shaka-project/shaka-player/issues/2868
  - Make UITextDisplayer CSS-independent
    - https://github.com/shaka-project/shaka-player/issues/2817
    - https://github.com/shaka-project/shaka-player/pull/2819
  - Remove hard-coded tts:extent namespace in TTML parser
    - https://github.com/shaka-project/shaka-player/issues/2860
  - Don't apply seek range while content is still loading
    - https://github.com/shaka-project/shaka-player/issues/2848
    - https://github.com/shaka-project/shaka-player/issues/2748
    - https://github.com/shaka-project/shaka-player/pull/2849
  - Fix Shaka+Cast apps using IndexedDB
    - https://github.com/shaka-project/shaka-player/issues/2850
  - Permit applications to monkey-patch Date.now
    - https://github.com/shaka-project/shaka-player/pull/2857
  - Fix detection of Edge Chromium as Edge
    - https://github.com/shaka-project/shaka-player/pull/2855
  - Fix loading with global "define" set to null
    - https://github.com/shaka-project/shaka-player/issues/2847
  - Fix missing cues in UITextDisplayer
  - Fix storing modified init data for offline sessions

Demo App:
  - Change the menu icon to a settings icon

Docs:
  - Fix references to built-in CEA 608 support, not available in this branch


## 3.0.4 (2020-08-25)

Bugfixes:
  - Fix case sensitivity in KEYID format check in HLS
    - https://github.com/shaka-project/shaka-player/issues/2789
    - https://github.com/shaka-project/shaka-player/pull/2790
  - Do not assume HDR for HEVC1.2 on Chromecast
    - https://github.com/shaka-project/shaka-player/issues/2813
  - Recognize "wvtt" codec in HLS WebVTT tracks
    - https://github.com/shaka-project/shaka-player/pull/2778
  - Fix case sensitivity for DRM content types
    - https://github.com/shaka-project/shaka-player/issues/2799
    - https://github.com/shaka-project/shaka-player/pull/2800
  - PlayReady only has little-endian key IDs on Edge & IE
    - https://github.com/shaka-project/shaka-player/pull/2801
  - Fix UI translation of "live" in Chinese
    - https://github.com/shaka-project/shaka-player/issues/2804

Docs:
  - Improve docs on platform support
    - https://github.com/shaka-project/shaka-player/issues/2783
    - https://github.com/shaka-project/shaka-player/pull/2787
    - https://github.com/shaka-project/shaka-player/pull/2794
    - https://github.com/shaka-project/shaka-player/pull/2795
  - Add doc on Application-Level Redirects


## 2.5.16 (2020-08-25)

Bugfixes:
  - Fix case sensitivity in KEYID format check in HLS
    - https://github.com/shaka-project/shaka-player/issues/2789
    - https://github.com/shaka-project/shaka-player/pull/2790
  - Do not assume HDR for HEVC1.2 on Chromecast
    - https://github.com/shaka-project/shaka-player/issues/2813
  - Recognize "wvtt" codec in HLS WebVTT tracks
    - https://github.com/shaka-project/shaka-player/pull/2778
  - Fix case sensitivity for DRM content types
    - https://github.com/shaka-project/shaka-player/issues/2799
    - https://github.com/shaka-project/shaka-player/pull/2800
  - PlayReady only has little-endian key IDs on Edge & IE
    - https://github.com/shaka-project/shaka-player/pull/2801
  - Fix UI translation of "live" in Chinese
    - https://github.com/shaka-project/shaka-player/issues/2804

Docs:
  - Improve docs on platform support
    - https://github.com/shaka-project/shaka-player/issues/2783
    - https://github.com/shaka-project/shaka-player/pull/2787
    - https://github.com/shaka-project/shaka-player/pull/2794
    - https://github.com/shaka-project/shaka-player/pull/2795
  - Add doc on Application-Level Redirects


## 3.0.3 (2020-08-12)

Bugfixes:
  - Fix timing of VTT in HLS without map header
    - https://github.com/shaka-project/shaka-player/issues/2714
  - Fix TTML style inheritance
  - Fix ordering of cues on IE and Edge
  - Fix VTTCue polyfill in uncompiled mode on Edge
  - Ensure the number of variants stays stable when new periods are added
    - https://github.com/shaka-project/shaka-player/issues/2716
    - https://github.com/shaka-project/shaka-player/issues/2736
  - Fix src= playback on WebOS
    - https://github.com/shaka-project/shaka-player/pull/2777
  - Filter timeline regions by seek range
    - https://github.com/shaka-project/shaka-player/issues/2716
  - Don't send duplicate license requests
    - https://github.com/shaka-project/shaka-player/issues/2754
  - Don't limit segment count for VOD
    - https://github.com/shaka-project/shaka-player/issues/2677
    - https://github.com/shaka-project/shaka-player/issues/2709
    - https://github.com/shaka-project/shaka-player/issues/2745
  - Fix data URI parsing when charset present
  - Fix rendering of TTML nested cues and spacers
    - https://github.com/shaka-project/shaka-player/issues/2760

Ad changes (BETA):
  - Add an extra log when replacing ad tag params for tracking adoption
  - Properly set tracking info for SS IMA streams

Demo App:
  - License header field for custom assets
    - https://github.com/shaka-project/shaka-player/issues/2758

Docs:
  - Correct very outdated docs on test.py


## 2.5.15 (2020-08-12)

Bugfixes:
  - Fix TTML style inheritance
  - Fix ordering of cues on IE and Edge
  - Fix src= playback on WebOS
    - https://github.com/shaka-project/shaka-player/pull/2777
  - Filter timeline regions by seek range
    - https://github.com/shaka-project/shaka-player/issues/2716
  - Don't send duplicate license requests
    - https://github.com/shaka-project/shaka-player/issues/2754
  - Fix data URI parsing when charset present
  - Fix rendering of TTML nested cues and spacers
    - https://github.com/shaka-project/shaka-player/issues/2760

Docs:
  - Correct very outdated docs on test.py


## 3.0.2 (2020-07-28)

Bugfixes:
  - Fix missing build/types/core in npm packages
    - https://github.com/shaka-project/shaka-player/issues/2752
  - Work around stalling playback on Tizen 3
    - https://github.com/shaka-project/shaka-player/issues/2620
  - Fix hang while shutting down Widevine DRM sessions
    - https://github.com/shaka-project/shaka-player/issues/2741
  - Fix initial bandwidth estimate on Tizen
  - Fix src= playback on Tizen 3
  - Work around less 3.12.0 bug
  - Improve logging of buffered ranges on WebOS
  - Fix use of --test-custom-license-server in test.py
  - Fix HLS discontinuity bug, broken playback with ads
    - https://github.com/shaka-project/shaka-player/issues/2687
  - Fix disappearing captions with certain input patterns
    - https://github.com/shaka-project/shaka-player/issues/2671
    - https://github.com/shaka-project/shaka-player/pull/2674
  - Fix missing captions when switching streams
    - https://github.com/shaka-project/shaka-player/issues/2648
    - https://github.com/shaka-project/shaka-player/pull/2672
  - Append license for language-mapping-list to output

Ad changes (BETA):
  - Proxy all client-side IMA events through the ad manager
  - Fire a shaka.Player.Metadata event on detecting ID3 metadata
    - https://github.com/shaka-project/shaka-player/issues/2592

Docs:
  - Update tutorial for seek bar color changes
    - https://github.com/shaka-project/shaka-player/issues/2708
  - Add FAQ entry for native HLS playback in Safari
  - Update tutorials and docs to async/await syntax
    - https://github.com/shaka-project/shaka-player/issues/2544
    - https://github.com/shaka-project/shaka-player/pull/2693
  - Update tutorials and docs to use modern variable syntax (const/let)
    - https://github.com/shaka-project/shaka-player/issues/2544
    - https://github.com/shaka-project/shaka-player/pull/2692

Demo App:
  - Fix demo behavior when UI fails to load (due to ad blocker)
    - https://github.com/shaka-project/shaka-player/issues/2669


## 3.0.1 (2020-06-18)

Bugfixes:
  - Fix failure with identical text streams
    - https://github.com/shaka-project/shaka-player/issues/2646
  - Fix offline progress callbacks in release mode
    - https://github.com/shaka-project/shaka-player/issues/2652
  - Fix bad segment URLs in DASH SegmentTimeline
    - https://github.com/shaka-project/shaka-player/issues/2650
  - Correct license headers in compiled output
    - https://github.com/shaka-project/shaka-player/issues/2638
  - Set an explicit font size for icons in UI
    - https://github.com/shaka-project/shaka-player/issues/2633
  - Apply upstream styles for icons font in UI
    - https://github.com/shaka-project/shaka-player/issues/2633
  - Export shaka.util.FairPlayUtils and shaka.util.BufferUtils
    - https://github.com/shaka-project/shaka-player/issues/2626
    - https://github.com/shaka-project/shaka-player/pull/2628

Ad changes (BETA):
  - Correct IMA SDK URLs in service worker and docs
  - Fix UI not showing up for server side ad streams
    - https://github.com/shaka-project/shaka-player/issues/2592
  - Expose more client side IMA info to apps

Demo App:
  - Fix centering of MDL icons
  - Fix error text overflow
  - Fix missing icon for demo app menu

Docs:
  - Update Manifest Parser tutorial
    - https://github.com/shaka-project/shaka-player/issues/2634


## 2.5.13 (2020-06-11)

Bugfixes:
  - Fix background color of nested cues
    - https://github.com/shaka-project/shaka-player/issues/2623
    - https://github.com/shaka-project/shaka-player/pull/2624
  - Fix seeking from Google Home app while casting
    - https://github.com/shaka-project/shaka-player/issues/2606
  - Fix cancelation of pending network requests on load() and destroy()
    - https://github.com/shaka-project/shaka-player/issues/2619
  - Fix pixelAspectRatio extraction from DASH
    - https://github.com/shaka-project/shaka-player/pull/2614
  - Fix nested TTML captions with time offset
    - https://github.com/shaka-project/shaka-player/issues/2601
    - https://github.com/shaka-project/shaka-player/pull/2602
  - Set explicit default font size for UI icons
    - https://github.com/shaka-project/shaka-player/issues/2633
  - Correct license headers in compiled output and generated externs
    - https://github.com/shaka-project/shaka-player/issues/2638


## 3.0.0 (2020-06-09)

Ad Features (BETA):
  - Integration with Google IMA Ads SDK
    - https://github.com/shaka-project/shaka-player/issues/2222
  - Ad-related UI elements

Offline Features:
  - Allow offline downloads to be aborted
    - https://github.com/shaka-project/shaka-player/issues/2417
    - https://github.com/shaka-project/shaka-player/issues/1362
    - https://github.com/shaka-project/shaka-player/issues/1301
  - Store creation time with offline assets
    - https://github.com/shaka-project/shaka-player/pull/2406
  - Allow multiple concurrent storage operations on one Storage instance
    - https://github.com/shaka-project/shaka-player/issues/1432
    - https://github.com/shaka-project/shaka-player/issues/2432
  - Make trackSelectionCallback async
    - https://github.com/shaka-project/shaka-player/pull/2387
  - Allow storage of manifests that are missing inline init data
    - https://github.com/shaka-project/shaka-player/pull/2042

HLS Features:
  - Add support for HLS Discontinuity
    - https://github.com/shaka-project/shaka-player/issues/2397
    - https://github.com/shaka-project/shaka-player/issues/1335
  - Add support for multiple EXT-X-MAP tags
    - https://github.com/shaka-project/shaka-player/issues/1335
    - https://github.com/shaka-project/shaka-player/issues/2397
  - Improve HLS startup latency
    - https://github.com/shaka-project/shaka-player/issues/1558
  - Add variable substitution support to HLS parser
    - https://github.com/shaka-project/shaka-player/pull/2509
  - Add a presentationDelay config for HLS live
    - https://github.com/shaka-project/shaka-player/issues/2373

UI Features:
  - Expand translations: now available in 45 languages (18 built-in by default)
  - Support setting source through HTML src attribute or source tag
    - https://github.com/shaka-project/shaka-player/issues/2088
  - Large play button is configurable, and only shows on mobile UI by default
  - Add playback speed selection to UI
    - https://github.com/shaka-project/shaka-player/issues/2362
    - https://github.com/shaka-project/shaka-player/issues/1676
  - Add loop control element to UI
    - https://github.com/shaka-project/shaka-player/issues/2362
  - Improve buffering spinner visibility
    - https://github.com/shaka-project/shaka-player/issues/2110

Subtitle/Caption Features:
  - Add support for ebutts:linePadding in TTML
    - https://github.com/shaka-project/shaka-player/pull/2443
  - Add support for cell resolution units and font percentage in TTML
    - https://github.com/shaka-project/shaka-player/issues/2403
    - https://github.com/shaka-project/shaka-player/pull/2442
  - Add support for tts:border, tts:letterSpacing and tts:opacity in TTML
    - https://github.com/shaka-project/shaka-player/pull/2408

Other Features:
  - Add API to set Cast content metadata in CastReceiver
    - https://github.com/shaka-project/shaka-player/issues/2606
  - Add liveLatency to stats
    - https://github.com/shaka-project/shaka-player/pull/2508
  - Allow configuration of presumed manifest accuracy, reduces extra fetches
    - https://github.com/shaka-project/shaka-player/issues/2291
  - Take into account the playbackRate in bandwidth calculations
    - https://github.com/shaka-project/shaka-player/pull/2329
  - Add check for E-AC3 JOC in DASH
    - https://github.com/shaka-project/shaka-player/issues/2296
  - Improve startup performance by lazily creating segment indexes
  - Support pre-standard DASH MIME type
  - Allow running tests without Babel

Bugfixes:
  - Fix background color of nested cues
    - https://github.com/shaka-project/shaka-player/issues/2623
    - https://github.com/shaka-project/shaka-player/pull/2624
  - Fix seeking from Google Home app while casting
    - https://github.com/shaka-project/shaka-player/issues/2606
  - Fix cancelation of pending network requests on load() and destroy()
    - https://github.com/shaka-project/shaka-player/issues/2619

Broken compatibility:
  - Remove support for custom DASH ContentProtection schemas
    - https://github.com/shaka-project/shaka-player/issues/2356
  - Signature for config callback "drm.initDataTransform" changed

Deprecated (with backward compatibility until v4.0):
  - Uint8ArrayUtils.equal() moved to BufferUtils
  - Factory methods are no longer called with "new"
    - https://github.com/shaka-project/shaka-player/issues/1521
  - Config "manifest.dash.defaultPresentationDelay" moved to
    "manifest.defaultPresentationDelay"
  - Storage.getStoreInProgress() deprecated (not needed with concurrent storage
    operations)

Removed after deprecation in v2.5:
  - Player.selectEmbeddedTextTrack
  - Player.usingEmbeddedTextTrack
  - Player.getManifestUri (renamed to getAssetUri)
  - load() factory parameter (replaced with MIME type parameter)
  - Storage configuration fields (moved into Player config under "offline")
  - UI getPlayer() moved to getControls().getPlayer()

Demo App Features:
  - Added trick play controls option
  - Add 'audio only' to the search terms


## 2.5.12 (2020-05-29)

Bugfixes:
  - Don't preload data on iOS
    - https://github.com/shaka-project/shaka-player/issues/2483
  - Make the controls background gradient proportional
  - Work around IE 11 bug in text region positioning
    - https://github.com/shaka-project/shaka-player/issues/2584
  - Fix PlayReady key ID endianness for TiVo
    - https://github.com/shaka-project/shaka-player/pull/2582
  - Fix shaka.log in debug builds
    - https://github.com/shaka-project/shaka-player/issues/2565
  - Add support for null TS packets in HLS
    - https://github.com/shaka-project/shaka-player/issues/2546
  - Fix live seek bar on touch screens
    - https://github.com/shaka-project/shaka-player/issues/2558
  - Fix text track change after enabling text display
    - https://github.com/shaka-project/shaka-player/issues/2553
  - Fix SegmentTimeline with t attribute missing.
    - https://github.com/shaka-project/shaka-player/issues/2590
  - Fix various text positioning bugs
    - https://github.com/shaka-project/shaka-player/issues/2524
  - Allow OPUS on Tizen 5 or higher
    - https://github.com/shaka-project/shaka-player/pull/2564
  - Fix CEA caption extraction for b-frame content
    - https://github.com/shaka-project/shaka-player/issues/2395
  - Fix module wrapper to prevent conflicting exports
    - https://github.com/shaka-project/shaka-player/issues/2549

New Features:
  - Add option to customize the polling of expiration time
    - https://github.com/shaka-project/shaka-player/issues/2252
    - https://github.com/shaka-project/shaka-player/pull/2579
  - Add new option manifest.hls.useFullSegmentsForStartTime
    - https://github.com/shaka-project/shaka-player/issues/2556
    - https://github.com/shaka-project/shaka-player/pull/2575


## 2.5.11 (2020-05-05)

New Features:
  - Add role information to text and audio tracks in src= mode
    - https://github.com/shaka-project/shaka-player/pull/2543
  - Parse HLS CHARACTERISTICS attribute and populate track roles
    - https://github.com/shaka-project/shaka-player/pull/2534
  - Recognize new CMAF file extensions cmfv, cmfa, cmft in HLS
    - https://github.com/shaka-project/shaka-player/pull/2473
  - Add configuration to enable/disable fullscreen-on-rotate
    - https://github.com/shaka-project/shaka-player/issues/2494
  - Add configuration to enable keyboard playback controls
    - https://github.com/shaka-project/shaka-player/issues/2489
  - Dismiss UI overflow menus on window click
  - Add non-standard DASH PlayReady UUID
    - https://github.com/shaka-project/shaka-player/pull/2474

Bugfixes:
  - Fix FairPlay event handling
    - https://github.com/shaka-project/shaka-player/issues/2214
  - Fix load() Promise hang on iOS
    - https://github.com/shaka-project/shaka-player/issues/2483
  - Fix language normalization with native HLS
    - https://github.com/shaka-project/shaka-player/issues/2480
  - Fix display of duplicate cues
    - https://github.com/shaka-project/shaka-player/issues/2497
  - Fix TTML position parsing
    - https://github.com/shaka-project/shaka-player/issues/2477
    - https://github.com/shaka-project/shaka-player/pull/2493
  - Fix display of line-positioned subtitles
    - https://github.com/shaka-project/shaka-player/issues/2524
  - Update to mux.js 5.5.4 to fix closed caption parsing bug
    - https://github.com/videojs/mux.js/pull/330
    - https://github.com/videojs/mux.js/pull/333
  - Fix language and role preferences in src= mode
    - https://github.com/shaka-project/shaka-player/pull/2535
    - https://github.com/shaka-project/shaka-player/pull/2506
  - Fix extra text track in src= mode
    - https://github.com/shaka-project/shaka-player/issues/2516
  - Fix Safari-prefixed fullscreen APIs
    - https://github.com/shaka-project/shaka-player/issues/2528
  - Fix display of nested cues with native text display
    - https://github.com/shaka-project/shaka-player/issues/2263
  - Fix getPlayheadTimeAsDate while loading/buffering
  - Recover from timed-out Cast connection
    - https://github.com/shaka-project/shaka-player/issues/2446
  - Fix DRM exceptions on WebOS TVs
    - https://github.com/shaka-project/shaka-player/issues/2512
    - https://github.com/shaka-project/shaka-player/pull/2513
  - Fix frameRate restrictions
  - Filter out metadata text tracks in Player tracks API
    - https://github.com/shaka-project/shaka-player/pull/2519
  - Fix PlayRateController leak
  - Fix buffer check in StallDetector
    - https://github.com/shaka-project/shaka-player/issues/1809
  - Fix offline storage picking high-bandwidth codecs
    - https://github.com/shaka-project/shaka-player/issues/2390
  - Fix nested TTML cues with non-ASCII characters
    - https://github.com/shaka-project/shaka-player/issues/2478
  - Fix UI updates when enabling captions
    - https://github.com/shaka-project/shaka-player/issues/2484
  - Fix ratechange events w/ src= playback
    - https://github.com/shaka-project/shaka-player/issues/2488
  - Fix serialization of Error objects over Cast
  - Fix missing EME polyfill in Cast receiver
  - Use the module wrapper in debug builds
    - https://github.com/shaka-project/shaka-player/issues/2465

Docs:
  - Fix broken docs for UI control events
    - https://github.com/shaka-project/shaka-player/issues/2385
  - Add FAQ entry about minBufferTime
    - https://github.com/shaka-project/shaka-player/issues/2000

Demo App:
  - Push demo app footer to the bottom of the page


## 2.5.10 (2020-03-24)

New Features:
  - Added 'doubleClickForFullscreen' config to UI
    - https://github.com/shaka-project/shaka-player/issues/2459
  - Add 'loaded' event
    - https://github.com/shaka-project/shaka-player/pull/2441
  - Update prerequisites script w/ new nodejs versions
  - Export default text parser plugins
    - https://github.com/shaka-project/shaka-player/issues/2428
  - Add config to show/hide unbuffered range at seek bar start
    - https://github.com/shaka-project/shaka-player/issues/2424
  - Approximate segment size based on bandwidth when deciding to abort a request
    - https://github.com/shaka-project/shaka-player/pull/2288
  - Always log config errors
  - Make 'offline.trackSelectionCallback' async to allow the app to prompt the
    user or do other async checks
    - https://github.com/shaka-project/shaka-player/pull/2387
  - Disable video when the media element is AUDIO
    - https://github.com/shaka-project/shaka-player/issues/2246
    - https://github.com/shaka-project/shaka-player/pull/2371

Bugfixes:
  - Fix DRM-related issues on Tizen
    - https://github.com/shaka-project/shaka-player/issues/813
    - https://github.com/shaka-project/shaka-player/issues/2447
    - https://github.com/shaka-project/shaka-player/issues/2448
    - https://github.com/shaka-project/shaka-player/pull/2449
  - Fix exceptions with very large manifests on XBox One and possibly other
    consumer electronics platforms
    - https://github.com/shaka-project/shaka-player/issues/2433
  - Fix UI exception joining existing Cast session
    - https://github.com/shaka-project/shaka-player/issues/2451
  - Fix UTCTiming when autoCorrectDrift is off
    - https://github.com/shaka-project/shaka-player/issues/2411
    - https://github.com/shaka-project/shaka-player/pull/2412
  - Fix EME polyfill exceptions on Edge
    - https://github.com/shaka-project/shaka-player/issues/2413
  - Fix offline storage with some Widevine and PlayReady content
    - https://github.com/shaka-project/shaka-player/pull/2400
  - Don't fire 'adaptation' event when not switching
    - https://github.com/shaka-project/shaka-player/issues/2392
  - Fix rare exception in isTextTrackVisible()
    - https://github.com/shaka-project/shaka-player/issues/2399
  - Fix bogus warnings about argument count in configs
  - Fix duplicate DB objects when storing offline content
    - https://github.com/shaka-project/shaka-player/issues/2389
  - Fix MIME type case sensitivity in HLS parser
  - Fix changing UI Cast app ID to empty string
  - Fix case sensitivity in TTML MIME types
    - https://github.com/shaka-project/shaka-player/issues/2378
    - https://github.com/shaka-project/shaka-player/pull/2381
  - Fix exceptions for Video Futur platform
    - https://github.com/shaka-project/shaka-player/issues/2189
    - https://github.com/shaka-project/shaka-player/pull/2368
  - Fix captions display alignment
    - https://github.com/shaka-project/shaka-player/issues/2334
    - https://github.com/shaka-project/shaka-player/issues/2157
  - Fix Cast errors in compiled mode
    - https://github.com/shaka-project/shaka-player/issues/2130

Docs:
  - Improve ClearKey examples
    - https://github.com/shaka-project/shaka-player/issues/2434
    - https://github.com/shaka-project/shaka-player/pull/2439
  - Fix truncated UI tutorial
    - https://github.com/shaka-project/shaka-player/issues/2410
  - Update offline.md
    - https://github.com/shaka-project/shaka-player/pull/2404
  - Add additional links in error code reference

Demo App:
  - Several service worker improvements and fixes
  - Load pwacompat through npm
  - Replace Live search boolean with a drop-down
  - Renamed the "search" tab to "all content"
  - Add search filters to the URL
  - Work around Material Icons font bug
  - Work around MDL button bug in iOS 13
    - https://github.com/shaka-project/shaka-player/issues/2376


## 2.5.9 (2020-02-04)

Bugfixes:
  - Fix PiP polyfill for iOS
    - https://github.com/shaka-project/shaka-player/issues/2199
  - Ban iOS < 12
    - https://github.com/shaka-project/shaka-player/issues/1920
  - Work around service worker registration hang on iOS
  - Fix display of selected language in UI
    - https://github.com/shaka-project/shaka-player/issues/2353
  - Fix race condition on HLS parser shutdown
    - https://github.com/shaka-project/shaka-player/issues/2138
  - Fix StringUtils on Xbox One
    - https://github.com/shaka-project/shaka-player/issues/2186
  - Fix selecting audio track by role when video tracks contain the same role
    - https://github.com/shaka-project/shaka-player/issues/2346
  - Fix skipping of raw format streams in HLS
  - Fix iPad 13+ detection
    - https://github.com/shaka-project/shaka-player/issues/2360
  - Fix exception thrown for Chrome & Firefox on iOS

Docs:
  - Fix typo in fairplay tutorial
    - https://github.com/shaka-project/shaka-player/issues/2344


## 2.5.8 (2020-01-16)

Bugfixes:
  - Recognize and reject raw AAC in HLS
    - https://github.com/shaka-project/shaka-player/issues/1083
    - https://github.com/shaka-project/shaka-player/issues/2337
  - Fix fullscreen on Android
    - https://github.com/shaka-project/shaka-player/issues/2324
    - https://github.com/shaka-project/shaka-player/pull/2325
  - Fix start time support in src= mode
    - https://github.com/shaka-project/shaka-player/issues/2267
    - https://github.com/shaka-project/shaka-player/pull/2271
  - Add missing events to CastProxy Player
    - https://github.com/shaka-project/shaka-player/issues/2318
  - Fix cast receiver UI update
    - https://github.com/shaka-project/shaka-player/issues/2314

New Features:
  - Add corruptedFrames to stats
    - https://github.com/shaka-project/shaka-player/pull/2328
  - Add framerate restriction to the config
    - https://github.com/shaka-project/shaka-player/issues/2068
    - https://github.com/shaka-project/shaka-player/pull/2332
  - Add option to ignore empty AdaptationSets in DASH
    - https://github.com/shaka-project/shaka-player/issues/2023
    - https://github.com/shaka-project/shaka-player/pull/2330
  - Add licenseTime to stats
    - https://github.com/shaka-project/shaka-player/pull/2297
  - Add pixelAspectRatio property from DASH
    - https://github.com/shaka-project/shaka-player/pull/2294
  - Add AirPlay support with native HLS and FairPlay
    - https://github.com/shaka-project/shaka-player/issues/2177
    - https://github.com/shaka-project/shaka-player/pull/2257
  - Add option to show text/audio roles in UI
    - https://github.com/shaka-project/shaka-player/issues/2307
  - Add "fadeDelay" option to delay fading UI controls

Demo App:
  - Update asset list and metadata


## 2.5.7 (2019-12-18)

New Features:
  - Add audioSamplingRate property
    - https://github.com/shaka-project/shaka-player/pull/2290
  - Ignore DASH image tracks
    - https://github.com/shaka-project/shaka-player/pull/2276
  - Add AV1 check and more file extensions for src mode
    - https://github.com/shaka-project/shaka-player/pull/2280
  - Allow removing text from manifests
    - https://github.com/shaka-project/shaka-player/pull/2278
  - Allow ignoreSuggestedPresentationDelay in DASH
    - https://github.com/shaka-project/shaka-player/pull/2260
  - Allow removing video from manifests
    - https://github.com/shaka-project/shaka-player/pull/2259
  - Add a polyfill for EME encryption scheme queries
  - Add support for ttml regions
    - https://github.com/shaka-project/shaka-player/issues/2191
  - Add a method to select variants by label
    - https://github.com/shaka-project/shaka-player/issues/924

Bugfixes:
  - Fix shaka.polyfill missing in externs
  - Fix width of overflow menu with wide content
    - https://github.com/shaka-project/shaka-player/issues/2249
  - Disable indexedDB support if an error is thrown
    - https://github.com/shaka-project/shaka-player/pull/2236
  - Fix setting robustness settings in DRM config
    - https://github.com/shaka-project/shaka-player/issues/2211


## 2.5.6 (2019-11-06)

Bugfixes:
  - Fix storing content with delayLicenseRequestUntilPlayed
    - https://github.com/shaka-project/shaka-player/issues/2218
  - Fix check for captions in appendBuffer
    - https://github.com/shaka-project/shaka-player/issues/2187
  - Allow 'rebufferingGoal' to change after startup
    - https://github.com/shaka-project/shaka-player/issues/2217
  - Fix default encoding when reading files
    - https://github.com/shaka-project/shaka-player/issues/2206
  - Throw for invalid TTML
    - https://github.com/shaka-project/shaka-player/issues/2157
  - Fix FairPlay default initDataTransform
    - https://github.com/shaka-project/shaka-player/issues/2136
  - Fix live seekbar on Android
    - https://github.com/shaka-project/shaka-player/issues/2169
  - Fix undefined value in HLS request filters
    - https://github.com/shaka-project/shaka-player/issues/2156
  - Fix Period transitions with embedded captions
    - https://github.com/shaka-project/shaka-player/issues/2076
  - Throw error for clear-key content with src=
    - https://github.com/shaka-project/shaka-player/issues/2139
  - Fix support for empty TTML data
    - https://github.com/shaka-project/shaka-player/pull/1960
  - Fix multi-Period handling of key statuses
    - https://github.com/shaka-project/shaka-player/issues/2135
  - Fix stall at end with src=
    - https://github.com/shaka-project/shaka-player/issues/2117
  - Fix ttml background image support
    - https://github.com/shaka-project/shaka-player/pull/2034

New Features:
  - Add config to use MSE playback on Safari
    - https://github.com/shaka-project/shaka-player/issues/2116
  - Support storing protected content without init data in manifest
    - https://github.com/shaka-project/shaka-player/issues/1531
    - https://github.com/shaka-project/shaka-player/pull/2164
  - Allow disable audio/video in manifest parsers
    - https://github.com/shaka-project/shaka-player/pull/2196
  - Enhance ttml rendering
    - https://github.com/shaka-project/shaka-player/pull/1962
  - Include event ID in DASH Event checks
    - https://github.com/shaka-project/shaka-player/issues/2077
    - https://github.com/shaka-project/shaka-player/pull/2175
  - Add support for Label element in DASH
    - https://github.com/shaka-project/shaka-player/issues/2178
    - https://github.com/shaka-project/shaka-player/pull/2197
  - Treat URL schemes as case-insensitive
    - https://github.com/shaka-project/shaka-player/issues/2173
  - Forward change event from src= playback
    - https://github.com/shaka-project/shaka-player/pull/2134
  - Export getMaxSegmentDuration() on presentationTimeline
    - https://github.com/shaka-project/shaka-player/issues/2124
  - Ignore MIME parameters in Content-Type check
    - https://github.com/shaka-project/shaka-player/issues/1946
    - https://github.com/shaka-project/shaka-player/pull/2215
  - Make seek & volume bar colors configurable
    - https://github.com/shaka-project/shaka-player/issues/2203

Demo App:
  - Improve mobile Safari PWA support in demo
    - https://github.com/shaka-project/shaka-player/issues/2143
  - Added tooltips to the search filters on the demo
  - Added "report bug" button to demo



## 2.5.5 (2019-08-23)

New Features:
  - Conditionally remove FairPlay formatting
    - https://github.com/shaka-project/shaka-player/issues/1951
  - Add sessionId field to network request
  - Make it easier to add custom overflow menu items
    - https://github.com/shaka-project/shaka-player/issues/2091
  - Add clearBufferOnQualityChange field to UI config
    - https://github.com/shaka-project/shaka-player/issues/1733
  - Allow filtering out failed HLS text tracks
    - https://github.com/shaka-project/shaka-player/issues/2065
  - Parse Accessibility tag into text "kind"
    - https://github.com/shaka-project/shaka-player/issues/2060
  - Re-add MediaSession API
    - https://github.com/shaka-project/shaka-player/issues/1934
  - Skip WebM streams in HLS instead of throwing
    - https://github.com/shaka-project/shaka-player/issues/2108
  - Convert `<mspr:pro>` elements to `pssh` init data
    - https://github.com/shaka-project/shaka-player/pull/2106
    - https://github.com/shaka-project/shaka-player/issues/2058

Bugfixes:
  - Fix duplicate resolution entries in UI menu
    - https://github.com/shaka-project/shaka-player/issues/2085
  - Fix missing tracks, race on time during startup
    - https://github.com/shaka-project/shaka-player/issues/2045
  - Fix spinner position on IE11
    - https://github.com/shaka-project/shaka-player/issues/2084
  - Fix seek bar coloring when nothing buffered
  - Fix scroll behavior on page load
    - https://github.com/shaka-project/shaka-player/issues/2063
  - Don't create a UI if the app already has one
    - https://github.com/shaka-project/shaka-player/issues/2073
  - Fix text display styling when fullscreen
    - https://github.com/shaka-project/shaka-player/issues/2051
  - Don't enter fullscreen on double click on bottom bar
    - https://github.com/shaka-project/shaka-player/issues/2053
  - Avoid errors when video ends
    - https://github.com/shaka-project/shaka-player/issues/2050
  - Fix fullscreen behavior on double click and rotate
    - https://github.com/shaka-project/shaka-player/issues/2043
  - Fix bug when clicking PIP button while casting
    - https://github.com/shaka-project/shaka-player/issues/2044
  - Fix CEA captions with multi-Period content
    - https://github.com/shaka-project/shaka-player/issues/2075
    - https://github.com/shaka-project/shaka-player/issues/2094

Demo App:
  - Added more HLS demo assets
    - https://github.com/shaka-project/shaka-player/issues/2035
  - Exit PIP on unload in the demo
    - https://github.com/shaka-project/shaka-player/issues/2055
  - Re-added hidden 'noinput' param to demo


## 2.5.4 (2019-07-19)

Bugfixes:
  - Default to transparent SMPTE-TT subtitle background
    - https://github.com/shaka-project/shaka-player/pull/2033
  - Fix seek bar on iOS
    - https://github.com/shaka-project/shaka-player/issues/1918
    - https://github.com/shaka-project/shaka-player/pull/2036
  - Allow whitespace in TTML subtitles
    - https://github.com/shaka-project/shaka-player/issues/2028
    - https://github.com/shaka-project/shaka-player/pull/2030
  - Fix play button positioning on IE 11
    - https://github.com/shaka-project/shaka-player/issues/2026
  - Match UI style with Chrome's native controls
  - Stop constant spurious time updates in UI
  - Fix volume slider jumping around while casting
    - https://github.com/shaka-project/shaka-player/issues/1913
  - Fix missing seek bar in short VOD clips
    - https://github.com/shaka-project/shaka-player/issues/2018
  - Fix demo app in Firefox private mode
    - https://github.com/shaka-project/shaka-player/issues/1926
  - Ignore case in MIME type checks
    - https://github.com/shaka-project/shaka-player/issues/1991
  - Fix problems with casting
    - https://github.com/shaka-project/shaka-player/issues/1948

New Features:
  - Add command-line arg to change the test timeout.


## 2.5.3 (2019-07-03)

Bugfixes:
  - Fix DASH bug when ignoring minBufferTime
    - https://github.com/shaka-project/shaka-player/issues/2015
  - Avoid changing variant when switching text lang
    - https://github.com/shaka-project/shaka-player/issues/2010
  - Work around platform bug when seeking to end
    - https://github.com/shaka-project/shaka-player/issues/1967
  - Allow apps to extend shaka.ui.Element
    - https://github.com/shaka-project/shaka-player/issues/2011
  - Fix bug when adding text streams while not streaming text
    - https://github.com/shaka-project/shaka-player/issues/1938
  - Fix edge case when switching text in multi-Period content
    - https://github.com/shaka-project/shaka-player/issues/1774
  - Fix playback rate bug on IE11
  - Make fast forwarding work when video is paused
    - https://github.com/shaka-project/shaka-player/issues/1801
  - Fix stack overflow in StringUtils on some platforms
    - https://github.com/shaka-project/shaka-player/issues/1985
    - https://github.com/shaka-project/shaka-player/issues/1994
  - Fix reading customData from standard Cast LOAD message
    - https://github.com/shaka-project/shaka-player/issues/1989

Docs:
  - Fix constant name in UI tutorials
    - https://github.com/shaka-project/shaka-player/issues/2005
  - Update build output name in docs
    - https://github.com/shaka-project/shaka-player/issues/1929

New Features:
  - Use trick play for fast forward when browser doesn't support high
    playbackRate
    - https://github.com/shaka-project/shaka-player/issues/1957


## 2.5.2 (2019-06-10)

Bugfixes:
  - Avoid event listener leaks in the UI
    - https://github.com/shaka-project/shaka-player/issues/1924
  - Fix style errors in TextDisplayer
    - https://github.com/shaka-project/shaka-player/issues/1852
    - https://github.com/shaka-project/shaka-player/issues/1955
  - Show spinner when buffering even if other controls are hidden
    - https://github.com/shaka-project/shaka-player/issues/1921
  - Don't recreate controls object on configure() calls
    - https://github.com/shaka-project/shaka-player/issues/1948
  - Fix UI compilation on Windows
    - https://github.com/shaka-project/shaka-player/issues/1965

New Features:
  - Add originalUri as a property on shaka.extern.Response
    - https://github.com/shaka-project/shaka-player/issues/1971
    - https://github.com/shaka-project/shaka-player/pull/1972

Demo App:
  - Fix close button styling in compiled mode
  - Fix config settings applied before playback begins
    - https://github.com/shaka-project/shaka-player/issues/1976
  - Change the style of the download/delete button
  - Fix demo error display for large errors
  - Improve cvox error check
  - Switch to using tippy.js for tooltips

Docs:
  - Add a public roadmap document
    - https://github.com/shaka-project/shaka-player/blob/main/roadmap.md


## 2.5.1 (2019-05-20)

New Features:
  - Inline external CSS for quicker load
    - You no longer need to include Material Design Icons font in your app
  - Use clean-css plugin in less.js to minify CSS

Bugfixes:
  - Deprecate ui.getPlayer for controls.getPlayer
    - https://github.com/shaka-project/shaka-player/issues/1941
  - Fix switching text displayer mid-playback
  - Improve french translations
    - https://github.com/shaka-project/shaka-player/pull/1944
  - Improve logic for aborting network requests
  - Fix initial bandwidth estimate on Chrome
  - Upgrade mux.js and use minified version
  - Fix exception on network retry
    - https://github.com/shaka-project/shaka-player/issues/1930
  - Fix API-based UI setup with default config
  - Allow two-argument configure() calls for UI and offline
  - Add missing export on ui.Overlay.getConfiguration
  - Various improvements in test reliability
  - Various fixes for compatibility with newer compiler versions

Demo App:
  - Fix asset card highlight on reload
  - Fix reconnection to cast sessions on reload
    - https://github.com/shaka-project/shaka-player/issues/1948
  - Fix handling of error events
  - Fix centering of asset card titles
  - Move download button to the corner of asset cards
  - Add WebP variants for asset icons to reduce size by 88%
  - Optimize app load time by pre-connecting to external origins
  - Defer creating tab contents until shown
  - Make name field in custom assets more permissive
  - Add link to support page in footer
  - Allow demo to load custom assets from hash
  - Do not disable controls on startup
  - Added missing config values
  - Catch certificate errors in demo
    - https://github.com/shaka-project/shaka-player/issues/1914
  - Let demo load even if storage fails to load
    - https://github.com/shaka-project/shaka-player/issues/1925
  - Re-load current asset if page reloads
  - Fix unsupported button tooltips


## 2.5.0 (2019-05-08)

**The UI is now out of beta!  Use shaka-player.ui.js and see the UI tutorials.**

Core Bugfixes:
  - Fix missing variants in HLS
    - https://github.com/shaka-project/shaka-player/issues/1908
  - Ignore manifest-provided license servers if application-provided servers
    are configured
    - https://github.com/shaka-project/shaka-player/issues/1905
  - Fix range header regression that broke IIS compatibility
  - Fix initial display of captions based on language preferences
    - https://github.com/shaka-project/shaka-player/issues/1879
  - Ignore duplicate codecs in HLS
    - https://github.com/shaka-project/shaka-player/issues/1817
  - Reject AES-128 HLS content with meaningful error
    - https://github.com/shaka-project/shaka-player/issues/1838
  - Fix React Native createObjectURL polyfill incompatibility
    - https://github.com/shaka-project/shaka-player/issues/1842
    - https://github.com/shaka-project/shaka-player/pull/1845
  - Dolby Vision fixes for Chromecast
    - https://github.com/shaka-project/shaka-player/pull/1844
  - Fix redundant initialization of MediaSource
    - https://github.com/shaka-project/shaka-player/issues/1570
  - Fix stalls on WebOS
    - https://github.com/shaka-project/shaka-player/issues/1704
    - https://github.com/shaka-project/shaka-player/pull/1820
  - Fix missing require for SimpleTextDisplayer
    - https://github.com/shaka-project/shaka-player/issues/1819
  - Fix broken version definition in compiled build
    - https://github.com/shaka-project/shaka-player/issues/1816
  - Fix video reloading on audio language change
    - https://github.com/shaka-project/shaka-player/issues/1714

UI Bugfixes:
  - Fix missing resolution menu in UI after playing audio-only content
  - Fix pointer cursor on UI spacer
  - Do not show PIP button if not allowed
  - Fix hiding captions in UI text displayer
    - https://github.com/shaka-project/shaka-player/issues/1893
  - Fix UI text displayer positioning on IE
  - Make live stream timecode accessible to screen readers in the UI
    - https://github.com/shaka-project/shaka-player/issues/1861
  - Fix ARIA pressed state for button in text selection menu
  - Show picture-in-picture btn only when the content has video
    - https://github.com/shaka-project/shaka-player/issues/1849
  - Fix multiline captions in UI text displayer
  - Fix display of cast button in UI
    - https://github.com/shaka-project/shaka-player/issues/1803
  - Fix conflict between PiP and fullscreen
  - Fix cast receiver styling

New Core Features:
  - Abort requests when network downgrading
    - https://github.com/shaka-project/shaka-player/issues/1051
  - Add FairPlay support
    - https://github.com/shaka-project/shaka-player/issues/382
  - Add native HLS support on iOS and Safari
    - https://github.com/shaka-project/shaka-player/issues/997
  - Support src= for single-file playback
    - https://github.com/shaka-project/shaka-player/issues/816
    - https://github.com/shaka-project/shaka-player/pull/1888
    - https://github.com/shaka-project/shaka-player/pull/1898
  - Add 'manifestparsed' event for early access to manifest contents
  - Add 'abrstatuschanged' event to help manage UI state
  - Make manifest redirections sticky for updates
    - https://github.com/shaka-project/shaka-player/issues/1367
    - https://github.com/shaka-project/shaka-player/pull/1880
  - Track time in "pause" state in stats
    - https://github.com/shaka-project/shaka-player/pull/1855
  - Make Stall Detector Configurable
    - https://github.com/shaka-project/shaka-player/issues/1839

New UI Features:
  - Add support for UI reconfiguration and layout changes
    - https://github.com/shaka-project/shaka-player/issues/1674
  - Add support for custom UI buttons
    - https://github.com/shaka-project/shaka-player/issues/1673
  - Add partial support for SMPTE-TT subtitles in UI text displayer
    - https://github.com/shaka-project/shaka-player/issues/840
    - https://github.com/shaka-project/shaka-player/pull/1859
  - Add PiP support in Safari
    - https://github.com/shaka-project/shaka-player/pull/1902


Demo App:
  - Complete redesign of the demo app!
  - Load non-built-in localizations from the server at runtime
    - https://github.com/shaka-project/shaka-player/issues/1688
  - Ignore spurious errors from ChromeVox
    - https://github.com/shaka-project/shaka-player/issues/1862
  - Don't handle non-app resources in service worker
    - https://github.com/shaka-project/shaka-player/issues/1256
    - https://github.com/shaka-project/shaka-player/issues/1392

Docs:
  - Document UI events
    - https://github.com/shaka-project/shaka-player/issues/1870
  - Update Manifest Parser documentation
  - Clarify track selection callback in offline tutorial
  - Fix jsdoc and markdown formatting of links
  - Add link for Shaka Player Embedded
    - https://github.com/shaka-project/shaka-player/issues/1846


## 2.5.0-beta3 (2019-02-20)

New Features:
  - Introduction of Shaka Player UI library! (beta)
    - Load dist/shaka-player.ui.js
    - See tutorial in docs/tutorials/ui.md
  - Add option to disable drift-tolerance feature for certain live streams
    - https://github.com/shaka-project/shaka-player/issues/1729
  - Upgrade mux.js to the latest (5.1.0)
  - Support HLS playlists without URI in EXT-X-MEDIA
    - https://github.com/shaka-project/shaka-player/pull/1732
  - Add safeSeekOffset to StreamingConfiguration
    - https://github.com/shaka-project/shaka-player/issues/1723
    - https://github.com/shaka-project/shaka-player/pull/1726
  - Add PlayReady license URL parsing (ms:laurl)
    - https://github.com/shaka-project/shaka-player/issues/484
    - https://github.com/shaka-project/shaka-player/pull/1644
  - Add support for HLS tags with both value and attributes
    - https://github.com/shaka-project/shaka-player/issues/1808
    - https://github.com/shaka-project/shaka-player/pull/1810

Bugfixes:
  - Fixed various typos in comments and docs
    - https://github.com/shaka-project/shaka-player/pull/1797
    - https://github.com/shaka-project/shaka-player/pull/1805
  - Fix CEA timestamps with presentationTimeOffset
  - Fix config-based clock sync for IPR content
  - Fix cast serialization of Uint8Array types
    - https://github.com/shaka-project/shaka-player/issues/1716
  - Fix event dispatch when text tracks change
  - Don't include video roles in audio-language-role pairs
    - https://github.com/shaka-project/shaka-player/issues/1731
  - Fix MediaSource failures with certain language settings
    - https://github.com/shaka-project/shaka-player/issues/1696
  - Fix build paths on Windows
    - https://github.com/shaka-project/shaka-player/issues/1700

Docs:
  - Update docs to mention ignoreMinBufferTime
    - https://github.com/shaka-project/shaka-player/issues/1547
    - https://github.com/shaka-project/shaka-player/issues/1666
  - Document restrictions on large timescales
    - https://github.com/shaka-project/shaka-player/issues/1667
  - Various small docs improvements


## 2.4.7 (2019-02-19)

Bugfixes:
  - Reject opus content on Tizen
    - https://github.com/shaka-project/shaka-player/issues/1751
  - Fix seekable range on HLS content with non-zero start time
    - https://github.com/shaka-project/shaka-player/issues/1602


## 2.4.6 (2019-01-22)

Bugfixes:
  - Fix HLS without URI attribute
    - https://github.com/shaka-project/shaka-player/issues/1086
    - https://github.com/shaka-project/shaka-player/issues/1730
    - https://github.com/shaka-project/shaka-player/pull/1732
  - Handle prereleases of npm and node in build scripts
    - https://github.com/shaka-project/shaka-player/issues/1758
  - Fix windows path handling in build scripts
    - https://github.com/shaka-project/shaka-player/issues/1759
  - Fix cast receiver errors in getStats
    - https://github.com/shaka-project/shaka-player/issues/1760
  - Fix spurious teardown exception on smart TVs
    - https://github.com/shaka-project/shaka-player/issues/1728
  - Loosen gap thresholds on Chromecast
    - https://github.com/shaka-project/shaka-player/issues/1720
  - Fix support for Safari 12
  - Fix support for relative Location URLs in DASH
    - https://github.com/shaka-project/shaka-player/issues/1668
  - Fix compliance issues in IE11 EME polyfill
    - https://github.com/shaka-project/shaka-player/issues/1689
  - Fix PlayReady playback on Tizen
    - https://github.com/shaka-project/shaka-player/issues/1712
  - Fix chopped playback in MS Edge
    - https://github.com/shaka-project/shaka-player/issues/1597
  - Fix assertions when EME sessions expire
    - https://github.com/shaka-project/shaka-player/issues/1599
  - Fix relative URIs in HLS
    - https://github.com/shaka-project/shaka-player/issues/1664
  - Fix compilation error
    - https://github.com/shaka-project/shaka-player/issues/1658
    - https://github.com/shaka-project/shaka-player/pull/1660

New Features:
  - Add extended error code for failed license request
    - https://github.com/shaka-project/shaka-player/issues/1689

Demo App:
  - Disable offline storage on some assets
    - https://github.com/shaka-project/shaka-player/issues/1768
  - Update DASH-IF livesim URLs
    - https://github.com/shaka-project/shaka-player/pull/1736


## 2.5.0-beta2 (2018-11-09)

Contains everything in v2.4.5, plus...

Bugfixes:
  - Fix Chromecast receiver id in the demo, broken since v2.5.0-beta
    - https://github.com/shaka-project/shaka-player/issues/1656
  - Fix multi-period playback issues introduced in v2.5.0-beta
    - https://github.com/shaka-project/shaka-player/issues/1601
  - Fix seekable range with non-zero start
    - https://github.com/shaka-project/shaka-player/issues/1602
  - Misc Storage and demo fixes
  - Fix support for restriction changes after playback
    - https://github.com/shaka-project/shaka-player/issues/1533
  - Fix TextEngine buffered range calculations
    - https://github.com/shaka-project/shaka-player/issues/1562

New Features:
  - Add support for CEA captions in DASH
    - https://github.com/shaka-project/shaka-player/issues/1404
  - Set server certificate before Store and Delete
    - https://github.com/shaka-project/shaka-player/issues/1623
    - https://github.com/shaka-project/shaka-player/pull/1639
  - Allow deferring deleting offline sessions.
    - https://github.com/shaka-project/shaka-player/issues/1326
  - Added progress events for Fetch plugin.
    - https://github.com/shaka-project/shaka-player/issues/1504
  - Add config field to ignore manifest minBufferTime #1547
    - https://github.com/shaka-project/shaka-player/issues/1547
    - https://github.com/shaka-project/shaka-player/pull/1581
  - Add support for 'individualization-request' messages in EME
    - https://github.com/shaka-project/shaka-player/issues/1565

Docs:
  - Update Language Normalization Documentation


## 2.4.5 (2018-11-09)

Bugfixes:
  - Fix erasure of the database with storage.deleteAll()
  - Fix MediaSource tear down race
  - Fix exception when destroying MediaSourceEngine twice
  - Fix gap jumping test failures on IE/Edge/Tizen
  - Fix stalls on Tizen TV
  - Fix display of external subtitles
    - https://github.com/shaka-project/shaka-player/issues/1596
  - Fix test failures on Safari
  - Fix filtering of HLS audio-only content
  - Preserve bandwidth estimate between loads
    - https://github.com/shaka-project/shaka-player/issues/1366
  - Retry streaming when we get back online
    - https://github.com/shaka-project/shaka-player/issues/1427
  - Fix Storage test contamination
  - Fix advanced DRM settings pollution across key systems
    - https://github.com/shaka-project/shaka-player/issues/1524
  - Fix TextEngine buffered range calculations
    - https://github.com/shaka-project/shaka-player/issues/1562

New Features:
  - Optimize processXlinks
    - https://github.com/shaka-project/shaka-player/issues/1640
  - Add support for Python3 in build scripts
  - Allow new Periods to add EME init data
    - https://github.com/shaka-project/shaka-player/issues/1360
  - Add namespace-aware parsing to TTML parser
    - https://github.com/shaka-project/shaka-player/issues/1585
  - An external Promise polyfill is no longer required!

Demo App:
  - Show logs prominently in noinput mode
    - https://github.com/shaka-project/shaka-player/issues/1610
  - Disable uncompiled mode on browsers without async
  - Restore using Enter key to load asset

Docs:
  - Fix tracks sorting in Offline tutorial sample code
    - https://github.com/shaka-project/shaka-player/issues/1608
    - https://github.com/shaka-project/shaka-player/pull/1609
  - Add a note about blank receiver IDs
  - Rename 'video' to 'mediaElem' to make it clear that audio elements work, too
    - https://github.com/shaka-project/shaka-player/issues/1555

Un-Features:
  - Un-ship VTTRegion support, which is currently broken in Chrome and does more
    harm than good
    - https://github.com/shaka-project/shaka-player/issues/1584


## 2.5.0-beta (2018-08-24)

New Features:
  - Drift is now tolerated in DASH live streams
    - https://github.com/shaka-project/shaka-player/issues/999
  - Storage can be initialized without Player
    - https://github.com/shaka-project/shaka-player/issues/1297
  - DASH Representation IDs are now exposed in a new field in Track
  - A safe margin parameter was added for clearing the buffer
    - https://github.com/shaka-project/shaka-player/pull/1154
  - Added 'retry' event to networking engine
    - https://github.com/shaka-project/shaka-player/issues/1529
  - Emsg not referenced in MPD will now be ignored
    - https://github.com/shaka-project/shaka-player/issues/1548
  - Extra data given for RESTRICTIONS_CANNOT_BE_MET
    - https://github.com/shaka-project/shaka-player/issues/1368
  - A mime type option was added to Player.load
  - Added Widevine SAMPLE-AES support in HLS
    - https://github.com/shaka-project/shaka-player/issues/1515
  - The |manifestUri| method on Player was changed to |assetUri|
  - Added new request type TIMING for clock sync requests
    - https://github.com/shaka-project/shaka-player/issues/1488
    - https://github.com/shaka-project/shaka-player/pull/1489

Deprecated:
  - Passing a ManifestParser factory to Player.load is deprecated and support
    will be removed in v3.0. Instead, please register any custom parsers with a
    MIME type, and pass a MIME type instead.  MIME types can also be used to
    force the selection of any built-in manifest parsers.
  - The |manifestUri| method on Player was changed to |assetUri|. The old method
    is deprecated and will be removed in v3.0.


## 2.4.4 (2018-08-23)

Bugfixes:
  - Fix spurious restrictions errors
    - https://github.com/shaka-project/shaka-player/issues/1541
  - Don't error when skipping mp4 boxes with bad size
    - https://github.com/shaka-project/shaka-player/issues/1535
  - Refactor HttpFetchPlugin to clarify error outcomes
    - https://github.com/shaka-project/shaka-player/issues/1519
    - https://github.com/shaka-project/shaka-player/pull/1532
  - Avoid assertions about $Time$ when it is not used
  - Stop proxying drmInfo() to reduce cast message sizes
  - Fix compiler renaming in ParsedBox
    - https://github.com/shaka-project/shaka-player/issues/1522

Docs:
  - Fixed docs for availabilityWindowOverride
    - https://github.com/shaka-project/shaka-player/issues/1530


## 2.4.3 (2018-08-06)

New Features:
  - Add availabilityWindowOverride configuration
    - https://github.com/shaka-project/shaka-player/issues/1177
    - https://github.com/shaka-project/shaka-player/issues/1307

Bugfixes:
  - Fix repeated download of the same segment in live DASH
    - https://github.com/shaka-project/shaka-player/issues/1464
    - https://github.com/shaka-project/shaka-player/issues/1486
  - Don't clear buffer with a small gap between playhead and buffer start
    - https://github.com/shaka-project/shaka-player/issues/1459
  - Allow CDATA in text nodes.
    - https://github.com/shaka-project/shaka-player/issues/1508
  - Skip text AdaptationSets with no segment info
    - https://github.com/shaka-project/shaka-player/issues/1484
  - Add error code for side-loaded text with live streams

Demo app:
  - Clarify persistent license error messages

Docs:
  - Update docs for RESTRICTIONS_CANNOT_BE_MET


## 2.3.10 and 2.4.2 (2018-06-29)

Bugfixes:
  - Fix ignored configuration when input is partially invalid (v2.4.2 only)
    - https://github.com/shaka-project/shaka-player/issues/1470
  - Silence DRM engine errors for unencrypted assets
    - https://github.com/shaka-project/shaka-player/issues/1479
  - Fix infinite seeking with HLS on V1 Chromecasts
    - https://github.com/shaka-project/shaka-player/issues/1411
  - Fix module wrapper to work with CommonJS, AMD, ES modules, as well as
    Closure and Electron
    - https://github.com/shaka-project/shaka-player/issues/1463
  - Fix TextEngine buffered range calculations

Demo App:
  - Fix custom encrypted assets in the demo app

Docs:
  - Fix generated documentation problems (v2.4.2 only)
  - Move CEA-608/708 to list of supported HLS features (v2.4.2 only)
    - https://github.com/shaka-project/shaka-player/pull/1465


## 2.3.9 and 2.4.1 (2018-06-13)

Bugfixes:
  - Default to a maximum of 360p for ABR when saveData == true
    - https://github.com/shaka-project/shaka-player/issues/855
  - Make AbrManager restrictions "soft" so they do not fail playback
  - Patch Closure Compiler to fix polyfill+wrapper
    - https://github.com/shaka-project/shaka-player/issues/1455
  - Fix assertion spam when merging a period into itself
    - https://github.com/shaka-project/shaka-player/issues/1448
  - Upgrade WebDriver module to new W3C protocol, fixes WD tests on Firefox & IE
  - Work around potential hang in transmuxer with multiplexed TS content.
    - https://github.com/shaka-project/shaka-player/issues/1449

Demo app:
  - Support clearkey license-servers in the demo UI

Misc:
  - Fix nodejs import (still not a supported environment, but does not throw)
    - https://github.com/shaka-project/shaka-player/issues/1445
    - https://github.com/shaka-project/shaka-player/pull/1446


## 2.4.0 (2018-05-24)

New features:
  - Support for TTML and VTT regions
    - https://github.com/shaka-project/shaka-player/issues/1188
  - Support for CEA captions in TS content
    - https://github.com/shaka-project/shaka-player/issues/276
  - A video element is no longer required when `Player` is constructed
    - https://github.com/shaka-project/shaka-player/issues/1087
  - New `attach()` and `detach()` methods have been added to `Player` to manage
    attachment to video elements
    - https://github.com/shaka-project/shaka-player/issues/1087
  - Allow apps to specify a preferred audio channel count
    - https://github.com/shaka-project/shaka-player/issues/1013
  - Live stream playback can begin at a negative offset from the live edge
    - https://github.com/shaka-project/shaka-player/issues/1178
  - Add new configure() syntax for easily setting single fields
    - https://github.com/shaka-project/shaka-player/issues/763
  - player.configure() returns false if player configuration is invalid
  - Fetch is now preferred over XHR when available
    - https://github.com/shaka-project/shaka-player/issues/829
  - Request type now appears in shaka.util.Error data for HTTP errors
    - https://github.com/shaka-project/shaka-player/issues/1253

Broken compatibility:
  - A third-party Promise polyfill is now required for IE 11 support
    - https://github.com/lahmatiy/es6-promise-polyfill
    - https://github.com/shaka-project/shaka-player/issues/1260
  - Text parser plugins now take a nullable segmentStart in TextContext.  All
    application-specific text-parsing plugins MUST be updated.
  - Text-parsing plugins that produce region information must do so with the new
    CueRegion class.  Any application-specific text-parsing plugins that produce
    region information MUST be updated.
  - TextDisplayer plugins that handle region information must do so with the new
    CueRegion interface.  Any application-specific TextDisplayer plugins that
    handle region information MUST be updated.
  - The API for PresentationTimeline has changed.  Manifest parser plugins that
    use certain PresentationTimeline methods MUST be updated:
    - `setAvailabilityStart()` was renamed to `setUserSeekStart()`.
    - `notifySegments()` now takes a reference array and a boolean called
      `isFirstPeriod`, instead of a period start time and a reference array.

Deprecated:
  - NetworkingEngine.request() now returns an instance of IAbortableOperation
    instead of Promise.  Applications which make application-level requests
    SHOULD update to use the new interface.
    - The old interface will be removed in v2.5.
  - Network scheme plugins now return an instance of IAbortableOperation instead
    of Promise.  Application-specific network scheme plugins SHOULD update to
    the new interface.
    - The old interface will be removed in v2.5.

Demo app:
  - Improve support for custom assets and license servers in demo app URI

Misc:
  - We have started transitioning the code to ES6 and the new JS style guide
    - https://google.github.io/styleguide/jsguide.html


## 2.3.8 (2018-05-23)

Bugfixes:
  - Fix non-default namespace names in DASH
    - https://github.com/shaka-project/shaka-player/issues/1438
  - Fix use after destroy() in CastProxy
    - https://github.com/shaka-project/shaka-player/issues/1423
  - Fix text track visibility state
    - https://github.com/shaka-project/shaka-player/issues/1412
  - Remove licenses when wiping offline storage
    - https://github.com/shaka-project/shaka-player/issues/1277
  - Restore backward compatibility for v2.2.x offline storage
    - https://github.com/shaka-project/shaka-player/issues/1248

Demo app:
  - Update DASH-IF Big Buck Bunny asset

Docs:
  - Fix typos and formatting
  - Build docs as part of build/all.py
    - https://github.com/shaka-project/shaka-player/issues/1421


## 2.3.7 (2018-04-24)

Bugfixes:
  - Fixed manifest update frequency calculations
    - https://github.com/shaka-project/shaka-player/issues/1399
  - Fixed repeated seeking during HLS live streaming on Chromecast
    - https://github.com/shaka-project/shaka-player/issues/1411

Demo app:
  - Fixed updating of the app URL on Android when pasting into the custom asset
    field
    - https://github.com/shaka-project/shaka-player/issues/1079
  - Added Axinom live test assets
    - https://github.com/shaka-project/shaka-player/pull/1409


## 2.3.6 (2018-04-11)

Bugfixes:
  - Handle HLS segments tags that occur before playlist tags
    - https://github.com/shaka-project/shaka-player/issues/1382
  - Avoid telling AbrManager about key-system-restricted streams, to simplify
    building AbrManager plugins.
  - Fixed exported enum definition for network plugin priorities
  - Fixed ES5 strict mode compatibility in our module wrapper
    - https://github.com/shaka-project/shaka-player/pull/1398

Demo app:
  - Fixed playback of VDMS assets by updating the license request details
    - https://github.com/shaka-project/shaka-player/pull/1388


## 2.3.5 (2018-03-29)

New features:
  - Do not buffer audio far ahead of video
    - https://github.com/shaka-project/shaka-player/issues/964

Bugfixes:
  - Fixed early seeking (immediately upon load)
    - https://github.com/shaka-project/shaka-player/issues/1298
  - Fixed repeated seeking in HLS live (also affects DASH with
    timeShiftBufferDepth of zero)
    - https://github.com/shaka-project/shaka-player/issues/1331
  - Fixed VTT+MP4 parsing with respect to TRUN box
    - https://github.com/shaka-project/shaka-player/issues/1266
  - Fixed hang in StreamingEngine when playing at the left edge of the seek
    range on slow embedded devices
  - Work around slow DASH parsing on embedded devices

Demo app:
  - Fixed CSS for display on Chromecast and other TV devices
  - Added "startTime" URL parameter for debugging purposes


## 2.3.4 (2018-03-22)

New features:
  - Support for non-standard DASH SegmentTemplate strings using formats other
    than "d" (such as "x" and "o").
    - https://github.com/Dash-Industry-Forum/DASH-IF-IOP/issues/177

Bugfixes:
  - Fixed rapid seeking in zero-width seek ranges, such as in HLS live
    - https://github.com/shaka-project/shaka-player/issues/1331
  - Fixed use of native controls for text display
    - https://github.com/shaka-project/shaka-player/issues/1332
  - Fixed parsing of multiple 'emsg' boxes
    - https://github.com/shaka-project/shaka-player/issues/1340

Demo app:
  - Added an "unload" button to the demo app
  - Fixed enabling of TS assets in the demo app
    - https://github.com/shaka-project/shaka-player/issues/1214

Docs:
  - Added a doc describing DASH manifests
    - https://github.com/shaka-project/shaka-player/issues/1233
  - Fixed documentation of CONTENT_UNSUPPORTED_BY_BROWSER error
    - https://github.com/shaka-project/shaka-player/issues/1349
  - Updated architecture diagrams
    - https://github.com/shaka-project/shaka-player/issues/1197


## 2.3.3 (2018-03-01)

New features:
  - Warn if parsing the date from UTCTiming fails
    - https://github.com/shaka-project/shaka-player/issues/1317
    - https://github.com/shaka-project/shaka-player/pull/1318
  - Backpropagate language selections on track change
    - https://github.com/shaka-project/shaka-player/issues/1299

Bugfixes:
  - Fix MP4+VTT in HLS
    - https://github.com/shaka-project/shaka-player/issues/1270
  - Fix track selection during "streaming" event
    - https://github.com/shaka-project/shaka-player/issues/1119
  - Work around MSE rounding errors in Edge
    - https://github.com/shaka-project/shaka-player/issues/1281
    - Edge bug: https://bit.ly/2ttKiBU
  - Fix IE stuck buffering at the end after replay
    - https://github.com/shaka-project/shaka-player/issues/979
  - Fix catastrophic backtracking in TTML text parser
    - https://github.com/shaka-project/shaka-player/issues/1312
  - Fix infinite loop when jumping very small gaps
    - https://github.com/shaka-project/shaka-player/issues/1309
  - Fix seek range for live content with less than a full availability window
    - https://github.com/shaka-project/shaka-player/issues/1224
  - Remove misleading logging in DrmEngine#fillInDrmInfoDefaults
    - https://github.com/shaka-project/shaka-player/pull/1288
    - https://github.com/shaka-project/shaka-player/issues/1284
  - Fix old text cues displayed after loading new text stream
    - https://github.com/shaka-project/shaka-player/issues/1293
  - Fix truncated HLS duration with short text streams
    - https://github.com/shaka-project/shaka-player/issues/1271
  - Fix DASH SegmentTemplate w/ duration
    - https://github.com/shaka-project/shaka-player/issues/1232

Docs:
  - Fix out-of-date docs for error 6014 EXPIRED
    - https://github.com/shaka-project/shaka-player/issues/1319
  - Simplify prerequisite installation on Linux
    - https://github.com/shaka-project/shaka-player/issues/1175
  - Simplify the debugging tutorial
  - Fix various typos
    - https://github.com/shaka-project/shaka-player/pull/1272
    - https://github.com/shaka-project/shaka-player/pull/1274


## 2.3.2 (2018-02-01)

New features:
  - Add Storage.deleteAll() to clear storage when database upgrades fail
    - https://github.com/shaka-project/shaka-player/issues/1230
    - https://github.com/shaka-project/shaka-player/issues/1248
  - Make DASH default presentation delay configurable
    - https://github.com/shaka-project/shaka-player/issues/1234
    - https://github.com/shaka-project/shaka-player/pull/1235

Bugfixes:
  - Fix stall during eviction with small bufferBehind values
    - https://github.com/shaka-project/shaka-player/issues/1123
  - Fix deletion of offline licenses for demo content
    - https://github.com/shaka-project/shaka-player/issues/1229
  - Fix compiler renaming in Player language APIs
    - https://github.com/shaka-project/shaka-player/issues/1258
  - Rename Timeline events to include the "Event" suffix
    - https://github.com/shaka-project/shaka-player/pull/1267

Docs:
  - Fix incorrect year in the change log
    - https://github.com/shaka-project/shaka-player/pull/1263
  - Fix some bad annotations found while upgrading jsdoc
    - https://github.com/shaka-project/shaka-player/issues/1259


## 2.3.1 (2018-01-22)

New features:
  - All features released in 2.2.10, plus...
  - DRM content is now implied by DRM config, fixes some ad insertion cases
    - https://github.com/shaka-project/shaka-player/pull/1217
    - https://github.com/shaka-project/shaka-player/issues/1094
  - Add support for mp4a.40.34 mp3 in HLS
    - https://github.com/shaka-project/shaka-player/issues/1210
  - Allow ES6 syntax
  - Replaced deprecated gjslint with eslint

Bugfixes:
  - All fixes released in 2.2.10, plus...
  - Handle MPEGTS timestamp rollover issues, including WebVTT HLS
    - https://github.com/shaka-project/shaka-player/issues/1191
  - Fix MP4 timescale assumptions in HLS
    - https://github.com/shaka-project/shaka-player/issues/1191
  - Update muxjs to use new keepOriginalTimestamps option
    - https://github.com/shaka-project/shaka-player/issues/1194
  - Avoids line-length limits when building on Windows
    - https://github.com/shaka-project/shaka-player/issues/1228
  - Force JS files to use unix newlines on Windows
    - https://github.com/shaka-project/shaka-player/issues/1228
  - Fix selection of text streams with no role
    - https://github.com/shaka-project/shaka-player/issues/1212

Docs:
  - All fixes released in 2.2.10, plus...
  - Fix upgrade guide links


## 2.2.10 (2018-01-22)

New features:
  - Update Widevine HLS parsing support for SAMPLE-AES-CTR
    - https://github.com/shaka-project/shaka-player/issues/1227

Bugfixes:
  - Fix display of duration in Chrome cast dialog
    - https://github.com/shaka-project/shaka-player/issues/1174
  - Compensate for rounding errors in multi-period manifests
  - Delay gap-jumping until after seeking is complete
    - https://github.com/shaka-project/shaka-player/issues/1061
  - Fix SegmentTemplate w/ duration for live
    - https://github.com/shaka-project/shaka-player/issues/1204

Docs:
  - Add FAQ entry for file:// requests in Electron
    - https://github.com/shaka-project/shaka-player/issues/1222
  - Fixed typos and extraneous tags
  - Added missing @exportDoc annotations
    - https://github.com/shaka-project/shaka-player/pull/1208


## 2.3.0 (2017-12-22)

New features:
  - Support for HLS live streams
    - https://github.com/shaka-project/shaka-player/issues/740
  - Support for HLS VOD streams that do not start at t=0
    - https://github.com/shaka-project/shaka-player/issues/1011
    - Previously supported through configuration, now automatic
  - MPEG-2 TS content can be transmuxed to MP4 for playback on all browsers
    - https://github.com/shaka-project/shaka-player/issues/887
    - Requires apps to load https://github.com/videojs/mux.js/
  - Do not stream captions until they are shown
    - https://github.com/shaka-project/shaka-player/issues/1058
  - Use NetworkInformation API to get initial bandwidth estimate
    - https://github.com/shaka-project/shaka-player/issues/994
    - https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation
  - Added a method to list language/role combinations
    - https://github.com/shaka-project/shaka-player/issues/967

Demo app:
  - The demo app is now a Progressive Web App (PWA) and can be used offline
    - https://github.com/shaka-project/shaka-player/issues/876
    - https://developers.google.com/web/progressive-web-apps/
  - Lighthouse: improved page load latency, text contrast ratio, UI performance
    - https://github.com/shaka-project/shaka-player/issues/905
    - https://developers.google.com/web/tools/lighthouse/
  - Roles can now be selected in the demo app
    - https://github.com/shaka-project/shaka-player/issues/967
  - Added quick links to change between compiled, debug, and uncompiled builds

Bugfixes:
  - Fixed interpretation of EXT-X-START in HLS
    - https://github.com/shaka-project/shaka-player/issues/1011
  - Fixed URI extension parsing in HLS
    - https://github.com/shaka-project/shaka-player/issues/1085
  - Offline storage API can now download multiple items in parallel
    - https://github.com/shaka-project/shaka-player/issues/1047

Docs:
  - FAQ, architecture diagrams, and tutorials have all been updated.
    - https://github.com/shaka-project/shaka-player/issues/1183

Broken compatibility:
  - Text parser plugins now take a Uint8Array, not an ArrayBuffer.  All
    application-specific text-parsing plugins MUST be updated.
    - https://github.com/shaka-project/shaka-player/issues/1022

Deprecated:
  - The AbrManager configuration interfaces and plugin APIs which were
    deprecated in v2.2 have now been removed.  Applications with custom
    AbrManager implementations MUST be upgraded to the v2.2 API now.
  - The plugin interface for text parsers which was deprecated in v2.1 has now
    been removed.
  - The `remove()` method on `shaka.offline.Storage` now takes a URI instead of
    a `StoredContent` instance.  Applications which use offline storage SHOULD
    update to the new API.  Support for the old argument will be removed in
    v2.4.
  - The `streaming.infiniteRetriesForLiveStreams` config was removed.
    Applications using this feature MUST use the `streaming.failureCallback`
    config and the method `player.retryStreaming()` instead.


## 2.2.9 (2017-12-22)

Bugfixes:
  - Fix excessive memory usage during storage
    - https://github.com/shaka-project/shaka-player/issues/1167
  - Fix offline storage with temporary license
    - https://github.com/shaka-project/shaka-player/issues/1159
  - Fix exception while casting
    - https://github.com/shaka-project/shaka-player/issues/1128
  - Reduced bandwidth of cast messaging
    - https://github.com/shaka-project/shaka-player/issues/1128
  - Fix exception when destroying TextDisplayer
    - https://github.com/shaka-project/shaka-player/issues/1187
  - Fix presentationTimeOffset in SegmentTemplate
    - https://github.com/shaka-project/shaka-player/issues/1164
  - Fix inconsistencies in text visibility across playbacks
    - https://github.com/shaka-project/shaka-player/issues/1185
  - Work around bad header formatting in IE 11
    - https://github.com/shaka-project/shaka-player/issues/1172
  - Fix Chromecast PlayReady playback
    - https://github.com/shaka-project/shaka-player/issues/1070
  - Fix subtitle display with VTTRegion enabled in Chrome
    - https://github.com/shaka-project/shaka-player/issues/1188


## 2.2.8 (2017-12-06)

Bugfixes:
  - Do not allow seeking/startup at duration (bump back by 1s)
    - https://github.com/shaka-project/shaka-player/issues/1014
  - Don't wait for sessions to close on DrmEngine.destroy
    - https://github.com/shaka-project/shaka-player/issues/1093
    - https://github.com/shaka-project/shaka-player/pull/1168
  - Do not clear buffers on configuration changes unless required
    - https://github.com/shaka-project/shaka-player/issues/1138
  - Ignore unsupported STYLE blocks in WebVTT
    - https://github.com/shaka-project/shaka-player/issues/1104
  - Fix a null exception in CastReceiver.destroy


Demo app:
  - Fix "ended" video control state on IE
    - https://github.com/shaka-project/shaka-player/issues/979
  - Fix updates to demo app URL hash on Edge & IE 11
    - https://github.com/shaka-project/shaka-player/issues/1111
  - Fix demo app page-load race on IE 11


## 2.2.7 (2017-11-28)

Bugfixes:
  - Allow playhead to recover from drift
    - https://github.com/shaka-project/shaka-player/issues/1105
  - Fix exception and race which prevented cast status updates
    - https://github.com/shaka-project/shaka-player/issues/1128
  - Fix live broadcast startup issues
    - https://github.com/shaka-project/shaka-player/issues/1150
  - Fix mis-detection of live streams as IPR
    - https://github.com/shaka-project/shaka-player/issues/1148
  - Fix buffering of live streams while paused
    - https://github.com/shaka-project/shaka-player/issues/1121

Demo app:
  - Add multi-DRM assets from VDMS
    - https://github.com/shaka-project/shaka-player/issues/780
    - https://github.com/shaka-project/shaka-player/pull/781
  - Add certificate URI field in the custom asset section
    - https://github.com/shaka-project/shaka-player/issues/1135
    - https://github.com/shaka-project/shaka-player/pull/1136
  - Fix broken HLS asset
    - https://github.com/shaka-project/shaka-player/issues/1137
  - Update Widevine proxy URI

Docs:
  - Refactor main README.md
  - Fix build/README.md typo
    - https://github.com/shaka-project/shaka-player/pull/1139
  - Fix typo in config tutorial
    - https://github.com/shaka-project/shaka-player/pull/1124


## 2.2.6 (2017-11-14)

Bugfixes:
  - Cancel network retries when the Player is destroyed
    - https://github.com/shaka-project/shaka-player/issues/1084
  - Do not overwrite media from an earlier period when new period is shifted
    - https://github.com/shaka-project/shaka-player/issues/1098
  - Do not assume same timescale in manifest and media
    - https://github.com/shaka-project/shaka-player/issues/1098
  - Do not fail assertions when media references are shifted outside the period
    - https://github.com/shaka-project/shaka-player/issues/1098
  - Fix custom builds which exclude text parsing plugins
    - https://github.com/shaka-project/shaka-player/issues/1115

Demo app:
  - Rename demo "Autoplay" in demo UI to "Auto-load on page refresh"
    - https://github.com/shaka-project/shaka-player/issues/1114


## 2.2.5 (2017-11-02)

New features:
  - Add streaming event to allow reconfiguration before streaming starts
    - https://github.com/shaka-project/shaka-player/issues/1043
  - Add method to get the parsed manifest structure
    - https://github.com/shaka-project/shaka-player/issues/1074
  - Log about deprecated APIs, even in a compiled build with other logs disabled

Bugfixes:
  - Fix interpretation of DASH presentationTimeOffset in SegmentBase
    - https://github.com/shaka-project/shaka-player/issues/1099


## 2.1.9 (2017-11-02)

Bugfixes:
  - Fix interpretation of DASH presentationTimeOffset in SegmentBase
    - https://github.com/shaka-project/shaka-player/issues/1099


## 2.2.4 (2017-10-23)

Bugfixes:
  - Don't enforce seek range while paused in live streams (stays paused)
    - https://github.com/shaka-project/shaka-player/issues/982
  - Fix start time in live streams
    - https://github.com/shaka-project/shaka-player/issues/1069
  - Fix handling & transmission of errors from cast receiver to sender
    - https://github.com/shaka-project/shaka-player/issues/1065

Docs:
  - Added a tutorial for the offline storage and playback APIs
    - https://github.com/shaka-project/shaka-player/issues/1037


## 2.2.3 (2017-10-17)

New features:
  - Publish an event when the CDM accepts a license
    - https://github.com/shaka-project/shaka-player/issues/1035
    - https://github.com/shaka-project/shaka-player/pull/1049
  - Added assertions and logging to the debug build
  - Added a debugging method on Player to get buffered ranges

Bugfixes:
  - Fixed race between gap-jumping and seeking
    - https://github.com/shaka-project/shaka-player/issues/1061
  - Fixed startTime == 0 in player.load()
    - https://github.com/shaka-project/shaka-player/issues/1069
  - Avoid clearing buffer on configure unless restrictions change
    - https://github.com/shaka-project/shaka-player/issues/1009
  - Fixed exceptions in the cast receiver demo
    - https://github.com/shaka-project/shaka-player/issues/1064
  - Various fixes for concurrent use of CastProxy and related APIs
    - https://github.com/shaka-project/shaka-player/issues/768
  - Polyfilled various MediaSource issues on Safari 11
    - https://github.com/shaka-project/shaka-player/issues/1048
  - Reject TS content on Safari due to MediaSource bugs
    - https://github.com/shaka-project/shaka-player/issues/743
  - Fixed stuck progress bar on cast receiver demo
    - https://github.com/shaka-project/shaka-player/issues/1064

Demo app:
  - Rotating mobile devices triggers fullscreen mode
    - https://github.com/shaka-project/shaka-player/issues/883
  - Added robustness suggestions for Widevine
    - https://github.com/shaka-project/shaka-player/pull/1008

Docs:
  - Fixed docs with regard to shaka.text namespace
    - https://github.com/shaka-project/shaka-player/issues/1046


## 2.2.2 (2017-09-27)

New features:
  - Support for MP4+TTML text streams with multiple MDAT boxes
    - https://github.com/shaka-project/shaka-player/issues/1028

Bugfixes:
  - Fixed playback hangs in certain content due to rounding error
    - https://github.com/shaka-project/shaka-player/issues/979
  - Fixed exception when TextTrack mode is set to "disabled"
    - https://github.com/shaka-project/shaka-player/issues/990
  - Fixed subtitle failures in Safari
    - https://github.com/shaka-project/shaka-player/issues/991
    - https://github.com/shaka-project/shaka-player/issues/1012
  - Fixed renaming issues in compiled builds
  - Fixed exceptions on Tizen 2016
    - https://github.com/shaka-project/shaka-player/issues/1022
    - https://github.com/shaka-project/shaka-player/issues/935
  - Fixed TTML region parsing
    - https://github.com/shaka-project/shaka-player/issues/1020

Demo app:
  - Auto-select offline copy of an asset after storing it offline
    - https://github.com/shaka-project/shaka-player/issues/996
    - https://github.com/shaka-project/shaka-player/pull/1001
  - Removed YouTube-sourced assets, which were very outdated
    - https://github.com/shaka-project/shaka-player/issues/1015
  - Added "Shaka Player History" live stream

Docs:
  - Added CORS explanation to the docs
    - https://github.com/shaka-project/shaka-player/issues/1018


## 2.2.1 (2017-09-01)

New features:
  - Support MP4+TTML in HLS
    - https://github.com/shaka-project/shaka-player/issues/986

Bugfixes:
  - Fixed display of old text cues after loading new content
    - https://github.com/shaka-project/shaka-player/issues/984
  - Fixed text cue alignment in compiled mode
    - https://github.com/shaka-project/shaka-player/issues/987
  - Fixed exception triggered when storing offline content
    - https://github.com/shaka-project/shaka-player/issues/988
  - Fixed cast state when multiple cast senders exist at once
    - https://github.com/shaka-project/shaka-player/issues/768
  - Fixed several Cast UI issues
  - Fixed (harmless) assertion failures on Cast receivers

Demo app:
  - Demo UI on mobile now shows help text on store/delete button
    - https://github.com/shaka-project/shaka-player/pull/995

Docs:
  - Document lack of IE support on Windows 7
    - https://github.com/shaka-project/shaka-player/pull/993


## 2.2.0 (2017-08-23)

New features:
  - Add support for EVENT type playlists in HLS
    - https://github.com/shaka-project/shaka-player/issues/740
  - Add new option for offline protected content without persistent licensing
    - https://github.com/shaka-project/shaka-player/issues/873
  - Allow applications to render their own text tracks
    - https://github.com/shaka-project/shaka-player/issues/796
  - Allow applications to control streaming retry behavior
    - https://github.com/shaka-project/shaka-player/issues/960
  - Add support for additional TTML styles
    - https://github.com/shaka-project/shaka-player/issues/923
    - https://github.com/shaka-project/shaka-player/issues/927
  - Add channel count information for both DASH & HLS
    - https://github.com/shaka-project/shaka-player/issues/424
    - https://github.com/shaka-project/shaka-player/issues/826
  - Add basic xlink support in DASH (actuate=onLoad only)
    - https://github.com/shaka-project/shaka-player/issues/587
    - https://github.com/shaka-project/shaka-player/issues/788
  - Add API to limit playable/seekable range for VOD content.
    - https://github.com/shaka-project/shaka-player/issues/246
  - Add new error code for container/codec support issues
    - https://github.com/shaka-project/shaka-player/issues/868
  - The default ABR manager is much more configurable
    - https://github.com/shaka-project/shaka-player/issues/744
  - Add stream bandwidth info to variant tracks
    - https://github.com/shaka-project/shaka-player/issues/834
  - Add player.isAudioOnly()
    - https://github.com/shaka-project/shaka-player/issues/942
  - Expose presentation start time through player
    - https://github.com/shaka-project/shaka-player/issues/957
  - Add bandwidth info to switch history
  - Improved Chromecast media queries
  - Stricter runtime type-checking of EME cert configuration
    - https://github.com/shaka-project/shaka-player/issues/784

Bugfixes:
  - Fix flakiness in offline-related tests
    - https://github.com/shaka-project/shaka-player/issues/903

Demo app:
  - Added robustness fields to the UI
    - https://github.com/shaka-project/shaka-player/issues/889

Docs:
  - Updated upgrade guide for v2.2
    - https://github.com/shaka-project/shaka-player/issues/930

Broken compatibility:
  - The text-parsing plugin API has changed.  Plugins now return shaka.text.Cue
    objects instead of VTTCue or TextTrackCue objects.  All application-specific
    text-parsing plugins MUST be updated.
    - https://github.com/shaka-project/shaka-player/issues/796

Deprecated:
  - The configuration for a custom ABR manager has changed.  Applications with
    custom AbrManager implementations SHOULD now configure abrFactory instead of
    abr.manager.
    - https://github.com/shaka-project/shaka-player/issues/744
    - The old interface will be removed in v2.3.
  - The config API for AbrManager has changed.  setDefaultEstimate() and
    setRestrictions() have been replaced with configure().  Applications with
    custom AbrManager implementations SHOULD implement the new configure()
    method.
    - https://github.com/shaka-project/shaka-player/issues/744
    - The old interface will be removed in v2.3.
  - The choice API for AbrManager has changed.  chooseStreams() has been
    replaced with chooseVariants(), and the switch callback now takes a variant.
    - https://github.com/shaka-project/shaka-player/issues/954
    - The old interface will be removed in v2.3.
  - The getTracks() and selectTrack() methods which were deprecated in v2.1 have
    now been removed.


## 2.1.8 (2017-08-23)

Bugfixes:
  - Add player.isAudioOnly() to fix flash of audio-only icon when casting
    - https://github.com/shaka-project/shaka-player/issues/969
  - Fix cast proxying of isAudioOnly and getMediaElement


## 2.1.7 (2017-08-14)

Bugfixes:
  - Fixed "Invalid argument" exceptions for subtitles in IE & Edge
  - Fixed buffering at the end of the stream for some content in IE & Edge
    - https://github.com/shaka-project/shaka-player/issues/913
  - Fixed seeking with native controls in Edge
    - https://github.com/shaka-project/shaka-player/issues/951
  - Fixed role selection to clear audio buffer right away
    - https://github.com/shaka-project/shaka-player/issues/948

Docs:
  - Fixed a bug in the upgrade guide for selecting tracks and disabling ABR
    - https://github.com/shaka-project/shaka-player/issues/962


## 2.1.6 (2017-08-09)

New features:
  - Add vp9, opus, and flac mp4 to probeSupport
    - https://github.com/shaka-project/shaka-player/issues/944

Bugfixes:
  - Never adapt across roles or languages
    - https://github.com/shaka-project/shaka-player/issues/918
    - https://github.com/shaka-project/shaka-player/issues/947
  - Fix parsing byterange attribute in HlsParser
    - https://github.com/shaka-project/shaka-player/issues/925
  - Fix incorrect segment position after update in some DASH live streams
    - https://github.com/shaka-project/shaka-player/pull/838
  - Fix support for live streams with no seek range
    - https://github.com/shaka-project/shaka-player/issues/916
  - Fix display order of cues with identical ranges
    - https://github.com/shaka-project/shaka-player/issues/848
  - Fix missing cues in WVTT MP4s using default sample duration
    - https://github.com/shaka-project/shaka-player/issues/919
  - Accept non-integer settings in VTT
    - https://github.com/shaka-project/shaka-player/issues/919
  - Tolerate bandwidth of 0 or missing bandwidth
    - https://github.com/shaka-project/shaka-player/issues/938
    - https://github.com/shaka-project/shaka-player/issues/940
  - Fix multiple pipeline flushes on some platforms
  - Make it safe to install polyfills twice
    - https://github.com/shaka-project/shaka-player/issues/941

Demo app:
  - Fix compiled mode in the demo app.  Does not affect the library.
    Removed defaultConfig_ reference in demo.
    - https://github.com/shaka-project/shaka-player/issues/929
  - Update license URI for PlayReady test asset
    - https://github.com/shaka-project/shaka-player/pull/953
    - https://github.com/shaka-project/shaka-player/issues/945


## 2.1.5 (2017-07-17)

New features:
  - Add more information to video errors in Chrome

Bugfixes:
  - Fix key status problems on IE11 and Tizen TVs
    - https://github.com/shaka-project/shaka-player/issues/884
    - https://github.com/shaka-project/shaka-player/issues/890
  - Fix period switching when streams are not yet available
    - https://github.com/shaka-project/shaka-player/issues/839
  - Filter out audio-only HLS variants that can't be switched to
    - https://github.com/shaka-project/shaka-player/issues/824
    - https://github.com/shaka-project/shaka-player/issues/861
  - Fix parsing of Microsoft-packaged HLS content
  - Fix rounding issues with multi-Period content
    - https://github.com/shaka-project/shaka-player/issues/882
    - https://github.com/shaka-project/shaka-player/issues/909
    - https://github.com/shaka-project/shaka-player/issues/911
  - Fix exceptions thrown in some cases when switching text tracks
    - https://github.com/shaka-project/shaka-player/issues/910
  - Fix DASH date parsing when timezone is missing
    - https://github.com/shaka-project/shaka-player/issues/901
  - Fix persistent storage detection on IE11 and Tizen TVs
  - Fix test issues on Tizen
    - https://github.com/shaka-project/shaka-player/issues/893
  - Fix version detection when compiling from the NPM package
    - https://github.com/shaka-project/shaka-player/issues/871
  - Work around lack of key statuses on Tizen
    - https://github.com/shaka-project/shaka-player/issues/891
    - https://github.com/shaka-project/shaka-player/issues/894

Demo app:
  - Fix missing fullscreen button on IE11
    - https://github.com/shaka-project/shaka-player/issues/787
  - Added configuration for gap jumping

Docs:
  - Document HTTPS requirement for EME
    - https://github.com/shaka-project/shaka-player/issues/867
    - https://github.com/shaka-project/shaka-player/issues/928
  - Update tutorials
    - https://github.com/shaka-project/shaka-player/issues/862
  - Add FAQ entry on EME robustness
    - https://github.com/shaka-project/shaka-player/issues/866
  - Update HLS FAQ
  - Document that we test on Tizen TV now


## 2.1.4 (2017-06-16)

New features:
  - Allow role to be specified in selectAudioLanguage and selectTextLanguage
    - https://github.com/shaka-project/shaka-player/issues/767

Bugfixes:
  - Fix changing languages close to a period boundary
    - https://github.com/shaka-project/shaka-player/issues/797
  - Fix hang in load() when there are pending failures
    - https://github.com/shaka-project/shaka-player/issues/782
  - Fix DASH parser ignoring certain text streams
    - https://github.com/shaka-project/shaka-player/issues/875
  - Fix exceptions when side-loading text tracks
    - https://github.com/shaka-project/shaka-player/issues/821
  - Fix PlayReady support on Chromecast
    - https://github.com/shaka-project/shaka-player/issues/852
  - Fix version number issues during publication on NPM
    - https://github.com/shaka-project/shaka-player/issues/869
  - Fix pollution from npm on Windows
    - https://github.com/shaka-project/shaka-player/issues/776
  - Fix support for npm v5
    - https://github.com/shaka-project/shaka-player/issues/854

Demo app:
  - Fix control visibility in fullscreen mode on mobile phones
    - https://github.com/shaka-project/shaka-player/issues/663

Docs:
  - Updated welcome docs
  - Updated list of supported platforms
    - https://github.com/shaka-project/shaka-player/issues/863
  - Updated FAQ
    - https://github.com/shaka-project/shaka-player/issues/864
    - https://github.com/shaka-project/shaka-player/issues/865


## 2.1.3 (2017-06-06)

New features:
  - Limit network retries for VOD, only retry forever on live
    - https://github.com/shaka-project/shaka-player/issues/762
    - https://github.com/shaka-project/shaka-player/issues/830
    - https://github.com/shaka-project/shaka-player/pull/842
  - Add stream IDs in getStats().switchHistory
    - https://github.com/shaka-project/shaka-player/issues/785
    - https://github.com/shaka-project/shaka-player/issues/823
    - https://github.com/shaka-project/shaka-player/pull/846
  - Add label attribute to tracks
    - https://github.com/shaka-project/shaka-player/issues/825
    - https://github.com/shaka-project/shaka-player/pull/811
    - https://github.com/shaka-project/shaka-player/pull/831
  - Expose role attributes on tracks
    - https://github.com/shaka-project/shaka-player/issues/767
  - Silence confusing browser-generated errors related to play()
    - https://github.com/shaka-project/shaka-player/issues/836

Bugfixes:
  - Fix offline storage in compiled mode
  - Choose lowest-bandwidth codecs when multiple are possible
    - https://github.com/shaka-project/shaka-player/issues/841
  - Fix PlayReady on IE and Edge
    - https://github.com/shaka-project/shaka-player/issues/837
  - Fix rounding errors on IE11
    - https://github.com/shaka-project/shaka-player/pull/832
  - Clean up demo app loader
  - Fix PlayReady test failures


## 2.1.2 (2017-05-23)

New features:
  - Make educated guesses about missing HLS info (CODECS no longer required)
    - https://github.com/shaka-project/shaka-player/issues/805
  - Add support for PlayReady on Chromecast and Tizen
    - https://github.com/shaka-project/shaka-player/issues/814
    - https://github.com/shaka-project/shaka-player/pull/815

Bugfixes:
  - Fix flakiness in RESTRICTIONS\_CANNOT\_BE\_MET errors
  - Make isBrowserSupported more strict about MediaSource
  - Fix detection of audio-only assets in the demo
    - https://github.com/shaka-project/shaka-player/issues/794
  - Fix exports and generated externs that were broken in v2.1.0 and v2.1.1
  - Speed up deletion of offline content
    - https://github.com/shaka-project/shaka-player/issues/756

Docs:
  - Fix docs on subtitles and captions
    - https://github.com/shaka-project/shaka-player/issues/808
  - Add notes on adaptation to upgrade guide


## 2.0.9 (2017-05-10)

Backported bugfixes from v2.1.x:
  - Fix offline download stalls on Android
    - https://github.com/shaka-project/shaka-player/issues/747
  - Fix track restriction based on key status
    - https://github.com/shaka-project/shaka-player/issues/761
  - Fix exception in fullscreen polyfill on IE 11
    - https://github.com/shaka-project/shaka-player/pull/777
  - Fix exception when reconfiguring serverCertificate
    - https://github.com/shaka-project/shaka-player/issues/784


## 2.1.1 (2017-05-10)

New features:
  - Separate audio and video codec in Track
    - https://github.com/shaka-project/shaka-player/issues/758
  - Make segment request to establish HLS media MIME type
    - https://github.com/shaka-project/shaka-player/issues/769

Bugfixes:
  - Fix exception in fullscreen polyfill on IE 11
    - https://github.com/shaka-project/shaka-player/pull/777
  - Fix exception when reconfiguring serverCertificate
    - https://github.com/shaka-project/shaka-player/issues/784
  - Don't fire 'trackschanged' event twice
    - https://github.com/shaka-project/shaka-player/issues/783
  - Fix track restriction based on key status
    - https://github.com/shaka-project/shaka-player/issues/761
  - Fix offline download stalls on Android
    - https://github.com/shaka-project/shaka-player/issues/747
  - Fix race condition in gap-jumping code
  - Fix poster visibility in fullscreen mode
    - https://github.com/shaka-project/shaka-player/issues/778


## 2.1.0 (2017-04-25)

New features:
  - Add basic HLS support
    - VOD only
    - Widevine & clear content only
    - No support for CEA-708
    - https://github.com/shaka-project/shaka-player/issues/279
  - Tolerate gaps in the presentation timeline and jump over them
    - https://github.com/shaka-project/shaka-player/issues/555
  - Add an indicator for critical errors
    - https://github.com/shaka-project/shaka-player/issues/564
  - Do not retry on HTTP 401/403 errors
    - https://github.com/shaka-project/shaka-player/issues/620
  - Expand player stats and track metadata
    - Add loadLatency stat
    - Add mimeType to tracks
    - Track state changes (buffering, playing, paused, ended)
  - DASH trick mode support
    - https://github.com/shaka-project/shaka-player/issues/538
  - Expose license expiration times through Player
    - https://github.com/shaka-project/shaka-player/issues/727
  - Add support for EventStream elements in DASH
    - https://github.com/shaka-project/shaka-player/issues/462
  - Add support for Chromecast Media Playback messages from generic senders
    - https://github.com/shaka-project/shaka-player/issues/722
  - Add config to ignore key system and init data in DASH manifest
    - https://github.com/shaka-project/shaka-player/issues/750
  - Add support for asynchronous response filters
    - https://github.com/shaka-project/shaka-player/issues/610
  - Filter duplicate initData from manifest by key ID
    - https://github.com/shaka-project/shaka-player/issues/580
  - Optionally adjust start time to segment boundary
    - https://github.com/shaka-project/shaka-player/issues/683
  - StringUtils and Uint8ArrayUtils are now exported, to make filters easier
    - https://github.com/shaka-project/shaka-player/issues/667
  - Add audio adaptation to default AbrManager
  - Add an API to force the Chromecast to disconnect
    - https://github.com/shaka-project/shaka-player/issues/523
  - Add possibility to delay license request until playback is started
    - https://github.com/shaka-project/shaka-player/issues/262
  - Add API to get live stream position as Date
    - https://github.com/shaka-project/shaka-player/issues/356
  - Don't clear buffer if switching to the same stream
    - https://github.com/shaka-project/shaka-player/issues/693
  - Demo app permalink support through URL hash parameters
    - https://github.com/shaka-project/shaka-player/issues/709
  - Add a flag so scheme plugins can ask us to ignore cache hits for ABR
  - Allow passing durations from scheme plugins to compute throughput
    - https://github.com/shaka-project/shaka-player/issues/621
  - Make ES6 imports easier
    - https://github.com/shaka-project/shaka-player/issues/466
  - Add separate restrictions to AbrManager
    - https://github.com/shaka-project/shaka-player/issues/565
  - Allow network plugins to see the request type
    - https://github.com/shaka-project/shaka-player/issues/602

Bugfixes:
  - Make language selection explicit
    - https://github.com/shaka-project/shaka-player/issues/412
  - Make text track visibility explicit
    - https://github.com/shaka-project/shaka-player/issues/626
  - Fix firing of 'trackschanged' event for multi-Period content
    - https://github.com/shaka-project/shaka-player/issues/680
  - Correct time parsing for MP4 VTT subtitles
    - https://github.com/shaka-project/shaka-player/issues/699
  - Fix playback of live when segments do not extend to the end of the Period
    - https://github.com/shaka-project/shaka-player/issues/694
  - Allow seeking to 0 in live streams
    - https://github.com/shaka-project/shaka-player/issues/692
  - Add explicit timestamps to 'emsg' events
    - https://github.com/shaka-project/shaka-player/issues/698
  - Fix playback of YouTube demo assets
    - https://github.com/shaka-project/shaka-player/issues/682
  - Allow text parsers to change during playback
    - https://github.com/shaka-project/shaka-player/issues/571

Docs:
  - Add offline storage to v2 upgrade guide
  - Add additional docs for AbrManager
    - https://github.com/shaka-project/shaka-player/issues/629
  - Add manifest parser plugin tutorial

Broken Compatibility:
  - Track types 'video' and 'audio' have been combined into 'variant'.
    - Any application looking at track.type will need to be updated.
  - Removed useRelativeCueTimestamps option
    - All segmented WebVTT cue timestamps are now segment-relative
    - https://github.com/shaka-project/shaka-player/issues/726
  - Plugin interface for text parsers has changed
    - Both old & new interfaces still supported
    - Support for old interface will be removed in v2.2
  - Plugin interface for ManifestParser.start has changed
    - Now takes an object with named parameters instead of positional params
    - Both old & new interfaces still supported
    - Support for old interface will be removed in v2.2
  - Retired the INVALID\_TTML error code
    - Folded into the INVALID\_XML error code


## 2.0.8 (2017-04-07)

Bugfixes:
  - Suppress controls UI updates when hidden
    - https://github.com/shaka-project/shaka-player/issues/749
  - Revert keyboard navigation changes in demo, failing on Firefox


## 2.0.7 (2017-03-29)

New Features:
  - Improved keyboard navigation in demo page for accessibility
  - Play through small gaps at the start of the timeline
  - Add a method for accessing the HTMLMediaElement from the Player
    - https://github.com/shaka-project/shaka-player/pull/723
  - Improved error reporting for HTTP errors

Bugfixes:
  - Fixed a DASH compliance bug in SegmentList w/ presentationTimeOffset
  - Fixed compiler renaming in emsg events.
    - https://github.com/shaka-project/shaka-player/issues/717
  - Fix period transitions where text streams may be absent
    - https://github.com/shaka-project/shaka-player/issues/715
  - Fix Firefox DRM detection
  - Fix cleanup of expired EME sessions for offline
  - Fix demo app error thrown when offline is not supported
  - Fix infinite loop in offline storage of SegmentTemplate-based DASH
    - https://github.com/shaka-project/shaka-player/issues/739
  - Fix contamination between tests


## 2.0.6 (2017-02-24)

New Features:
  - Add Media Session info to demo
    - https://github.com/shaka-project/shaka-player/pull/689
  - Add support for xml:space in TTML parser
    - https://github.com/shaka-project/shaka-player/issues/665
  - Add fullscreenEnabled property to fullscreen polyfill
    - https://github.com/shaka-project/shaka-player/issues/669
  - Allow InbandEventStream elements at Representation level
    - https://github.com/shaka-project/shaka-player/pull/687
    - https://github.com/shaka-project/shaka-player/issues/686
  - Warning for unsupported indexRange attribute
  - Warning for duplicate Representation IDs

Bugfixes:
  - Fix cast support broken since 2.0.3
    - https://github.com/shaka-project/shaka-player/issues/675
  - Fix timeout errors in cast demo
    - https://github.com/shaka-project/shaka-player/issues/684
  - Fix infinite buffering caused by a race
    - https://github.com/shaka-project/shaka-player/issues/600
  - Fix race in StreamingEngine for multi-Period content
    - https://github.com/shaka-project/shaka-player/issues/655
  - Hide the controls when going fullscreen on phones
    - https://github.com/shaka-project/shaka-player/issues/663
  - Improve calculation of $TIME$ in SegmentTemplate
    - https://github.com/shaka-project/shaka-player/issues/690
    - https://github.com/shaka-project/shaka-player/pull/706
  - Fix YouTube asset on demo app
    - https://github.com/shaka-project/shaka-player/issues/682


## 2.0.5 (2017-01-30)

Bugfixes:
  - Fix several bugs with multi-Period content
    - Possible hang when seeking
    - Fix race between buffering and Period transition
    - Fix race between rapid Period transitions
    - https://github.com/shaka-project/shaka-player/issues/655
  - Fix hang in destroy() when EME sessions are in a bad state
    - https://github.com/shaka-project/shaka-player/issues/664
  - Fix doubling of time offset for segment-relative cues
    - https://github.com/shaka-project/shaka-player/issues/595
    - https://github.com/shaka-project/shaka-player/pull/599


## 2.0.4 (2017-01-24)

New features:
  - Support for 4k on Chromecast Ultra
  - Support for text tracks on Toshiba dTV
    - https://github.com/shaka-project/shaka-player/issues/635
    - https://github.com/shaka-project/shaka-player/pull/643

Bugfixes:
  - Fixed buffering issues at the end of streams in IE/Edge
    - https://github.com/shaka-project/shaka-player/issues/658
  - Fixed parsing of empty divs in TTML
    - https://github.com/shaka-project/shaka-player/issues/646
    - https://github.com/shaka-project/shaka-player/pull/650
  - Fixed subtle bug in Promise.resolve polyfill on IE
  - Fixed test failures on Chromecast

Docs:
  - Added additional docs for offline storage
  - Updated and clarified debugging tutorial
    - https://github.com/shaka-project/shaka-player/issues/653


## 2.0.3 (2017-01-09)

New features:
  - Treat HTTP 202 status codes as failures
    - https://github.com/shaka-project/shaka-player/issues/645

Bugfixes:
  - Fix race condition in StreamingEngine
  - Fix race in load/unload in Player
    - https://github.com/shaka-project/shaka-player/pull/613
    - https://github.com/shaka-project/shaka-player/issues/612
  - Update workarounds for Edge EME bugs
    - https://github.com/shaka-project/shaka-player/issues/634
  - Add missing events and methods to cast proxy
  - Fix exclusion of standard features in custom builds
  - Be more permissive of text failures
    - Permit text parsing errors as well as streaming errors with the
      ignoreTextStreamFailures config option.
    - Do not fail StreamingEngine startup because of text streams,
      regardless of config.
    - https://github.com/shaka-project/shaka-player/issues/635
  - Fix selectTrack() call with no text tracks
    - https://github.com/shaka-project/shaka-player/issues/640
  - Fix buffering state for live streams (stop at live edge)
    - https://github.com/shaka-project/shaka-player/issues/636


## 2.0.2 (2016-12-15)

New features:
  - Add support for Toshiba dTV
    - https://github.com/shaka-project/shaka-player/pull/605
  - TTML subtitles: Support for \<br\> inside a paragraph
    - https://github.com/shaka-project/shaka-player/pull/572
    - https://github.com/shaka-project/shaka-player/pull/584
  - Parse TTML textAlign settings into align property of a VTTCue
    - https://github.com/shaka-project/shaka-player/pull/573
  - Improved test stability and coverage reports

Bugfixes:
  - Fix DASH content type parsing
    - https://github.com/shaka-project/shaka-player/issues/631
  - Tolerate larger gaps at the start
    - https://github.com/shaka-project/shaka-player/issues/579
  - Fixes for TTML alignment, positioning and cue externs
    - https://github.com/shaka-project/shaka-player/pull/588
    - https://github.com/shaka-project/shaka-player/pull/594
  - Keep ewma sampling from failing on 0 duration segments
    - https://github.com/shaka-project/shaka-player/issues/582
    - https://github.com/shaka-project/shaka-player/pull/583
   - Allow text parsers to change during playback
    - https://github.com/shaka-project/shaka-player/issues/571
  - Fix playback when IE11 modifies the XML DOM
    - https://github.com/shaka-project/shaka-player/issues/608
    - https://github.com/shaka-project/shaka-player/pull/611
  - Update MediaSource polyfills for Safari 10
    - https://github.com/shaka-project/shaka-player/issues/615
  - Throw explicit error on empty manifests
    - https://github.com/shaka-project/shaka-player/issues/618

Docs:
  - Link to error docs from the demo app


## 2.0.1 (2016-10-26)

New features:
  - Faster ABR decisions
  - Add config option for using segment relative timestamps for VTT
    - https://github.com/shaka-project/shaka-player/issues/480
    - https://github.com/shaka-project/shaka-player/pull/542
  - Log and ignore non-standard WebVTT settings instead of failing
    - https://github.com/shaka-project/shaka-player/issues/509
  - Make key IDs from the manifest available through DrmInfo
    - https://github.com/shaka-project/shaka-player/pull/529
  - Provide framerate and codecs information on video tracks
    - https://github.com/shaka-project/shaka-player/issues/516
    - https://github.com/shaka-project/shaka-player/pull/533
  - Dispatch more useful network error when HEAD request fails

Bugfixes:
  - Fix ABR quality issues when switching tracks (stutters, glitches, etc.)
    - https://github.com/shaka-project/shaka-player/issues/520
  - Keep user selected text track when switching audio
    - https://github.com/shaka-project/shaka-player/issues/514
  - Fix vtt with one digit hour
    - https://github.com/shaka-project/shaka-player/pull/522
  - Fix build scripts for Windows
    - https://github.com/shaka-project/shaka-player/issues/526
  - Fix buffering event delay
    - https://github.com/shaka-project/shaka-player/issues/511
  - Workaround bug in Edge buffered ranges
    - https://github.com/shaka-project/shaka-player/issues/530
  - Fix handling of internal-error key status
    - https://github.com/shaka-project/shaka-player/issues/539
  - Ignore trick mode tracks
    - https://github.com/shaka-project/shaka-player/issues/538
  - Fix AdaptationSetSwitching support
  - Fix buffering logic when switching periods
    - https://github.com/shaka-project/shaka-player/issues/537
    - https://github.com/shaka-project/shaka-player/issues/545
  - Use data URI content-type for manifest type detection
    - https://github.com/shaka-project/shaka-player/pull/550
  - Fix audio language changes on Chromecast
    - https://github.com/shaka-project/shaka-player/issues/544
  - Fix Chromecast receiver idle behavior when looping or replaying
    - https://github.com/shaka-project/shaka-player/issues/558
  - Fix exception-causing race when TextEngine is destroyed

Demo app improvements:
  - Hide volume & mute buttons on mobile-sized screens
  - Probe both MP4 and WebM support in DrmEngine
    - https://github.com/shaka-project/shaka-player/issues/540
  - Update Axinom test assets to v7
  - Fix accessibility issues in the demo app
    - https://github.com/shaka-project/shaka-player/issues/552

Docs:
  - Rewrote the debugging tutorial
  - Misc docs cleanup
    - https://github.com/shaka-project/shaka-player/pull/536


## 2.0.0 (2016-09-07)

The first full release of v2!

New features:
  - Improved Chromecast support
    - Cast from the built-in Chrome dialog as well as the video controls
    - Use the built-in Chrome dialog to disconnect
  - Support for in-progress recordings (IPR)
    - https://github.com/shaka-project/shaka-player/issues/477
  - Can be configured to tolerate text stream failures
    - https://github.com/shaka-project/shaka-player/issues/474
  - Ignore small gaps in the timeline
    - https://github.com/shaka-project/shaka-player/issues/472
  - Added EMSG box support
    - https://github.com/shaka-project/shaka-player/issues/259
  - Reduced test flakiness and improved test speed
  - Improved VTT parsing
    - https://github.com/shaka-project/shaka-player/issues/469
  - Improved EME error reporting
    - https://github.com/shaka-project/shaka-player/issues/468
  - Improved demo app UI for touch screens
  - Smaller demo app UI (video element above the fold on Nexus 5X)

Bugfixes:
  - Fixed text-related issues in IE11
    - https://github.com/shaka-project/shaka-player/issues/501
    - https://github.com/shaka-project/shaka-player/issues/502
  - Fixed a few live edge corner cases
    - https://github.com/shaka-project/shaka-player/issues/490
    - https://github.com/shaka-project/shaka-player/issues/504
  - Fixed TTML parsing exceptions
    - https://github.com/shaka-project/shaka-player/issues/473
    - https://github.com/shaka-project/shaka-player/issues/506
  - Fixed text encoding issues with subs
  - Fixed issues with multi-period eviction
    - https://github.com/shaka-project/shaka-player/pull/483
  - Defined order of AdaptationSet preference (prefer high quality, low bw)
    - https://github.com/shaka-project/shaka-player/issues/476
  - Fixed support for manifests with multiple text formats
  - Fixed support for DASH Representations with multiple Roles
    - https://github.com/shaka-project/shaka-player/issues/500
  - Fixed CSP compliance for Chrome apps
    - https://github.com/shaka-project/shaka-player/issues/487

Planned features we cut:
  - Cache-detecting bandwidth estimation
    - https://github.com/shaka-project/shaka-player/issues/324


## 2.0.0-beta3 (2016-07-29)

Restored Features from v1 Missing in v2.0.0-beta2:
  - Offline storage and playback
    - https://github.com/shaka-project/shaka-player/issues/343
  - Clearkey license server support
    - https://github.com/shaka-project/shaka-player/issues/403

New features:
  - Built-in Chromecast support
    - https://github.com/shaka-project/shaka-player/issues/261
  - TTML text support
    - https://github.com/shaka-project/shaka-player/issues/111
  - TTML in MP4
    - https://github.com/shaka-project/shaka-player/issues/278
  - VTT in MP4
    - https://github.com/shaka-project/shaka-player/issues/277
  - Handle QuotaExceededError, automatically reduce buffering goals
    - https://github.com/shaka-project/shaka-player/issues/258
  - Faster template processing in DASH
    - https://github.com/shaka-project/shaka-player/issues/405
  - Bitrate upgrades take effect faster
  - Add a specific error for missing license server URI
    - https://github.com/shaka-project/shaka-player/issues/371
  - Add adaptation events for language changes
  - Don't treat network errors as fatal in StreamingEngine
    - https://github.com/shaka-project/shaka-player/issues/390
  - Provide the application access to DrmInfo structure
    - https://github.com/shaka-project/shaka-player/issues/272
  - Restructure test/ folder to mimic lib/ folder structure
    - https://github.com/shaka-project/shaka-player/pull/434
  - Upgrade closure compiler
    - https://github.com/shaka-project/shaka-player/pull/421
  - New logo!

Bugfixes:
  - Revert ABR changes that caused bandwidth samples to be ignored
    - https://github.com/shaka-project/shaka-player/issues/367
  - Fix buffering of multi-period text
    - https://github.com/shaka-project/shaka-player/issues/411
  - Fix various ABR issues
    - https://github.com/shaka-project/shaka-player/issues/435
  - Fix stuck playback on seek
    - https://github.com/shaka-project/shaka-player/issues/366
  - Stop refreshing live manifests when unloaded
    - https://github.com/shaka-project/shaka-player/issues/369
  - Don't adapt between incompatible codecs (mp4a & ec-3)
    - https://github.com/shaka-project/shaka-player/issues/391
  - Fix race in player WRT external text tracks
    - https://github.com/shaka-project/shaka-player/issues/418
  - Fix Edge EME workarounds on IE11
    - https://github.com/shaka-project/shaka-player/issues/393
  - Work around Safari MSE bugs
  - Fix relative paths in UTCTiming
    - https://github.com/shaka-project/shaka-player/issues/376
  - Fix source map paths on windows
    - https://github.com/shaka-project/shaka-player/issues/413
  - Improve demo app CSS on mobile
  - Fix buffering state on unload
  - Fix load/unload/destroy race conditions
  - Reduce test flake (async tests still flakey on Safari)
  - Fix context menu display in demo app
    - https://github.com/shaka-project/shaka-player/issues/422
  - Fix key status, session expiration, and DRM error dispatch
  - Fix demo app play controls on Android
    - https://github.com/shaka-project/shaka-player/issues/432
  - Fix corner cases when seeking to the live edge

Docs:
  - Add a license-wrapping tutorial
  - Add track restriction docs
    - https://github.com/shaka-project/shaka-player/issues/387
  - Update track and adaptation docs
    - https://github.com/shaka-project/shaka-player/issues/447

Broken Compatibility compared to v2.0.0-beta2:
  - The asynchronous Player.support() has been replaced with the synchronous
    Player.isBrowserSupported() call
    - https://github.com/shaka-project/shaka-player/issues/388
  - AbrManager implementations must now handle a partial StreamSet map in
    chooseStreams()
  - The wrong keys error has been dropped due to false positives


## 2.0.0-beta2 (2016-05-04)

Restored Features from v1 Missing in v2.0.0-beta:
  - Track restrictions API
    - https://github.com/shaka-project/shaka-player/issues/326
    - https://github.com/shaka-project/shaka-player/issues/327
  - Custom controls demo for live
    - https://github.com/shaka-project/shaka-player/issues/322
  - Trick play demo
    - https://github.com/shaka-project/shaka-player/issues/328

New features:
  - Reduced startup latency
  - Added player.resetConfiguration()
  - Added response text to HTTP errors
    - https://github.com/shaka-project/shaka-player/issues/319
  - Demo controls redesigned with material design icons
  - Emit an error if the wrong keys are retrieved
    - https://github.com/shaka-project/shaka-player/issues/301
  - Human-readable errors shown in demo app
  - Cache-friendly bandwidth estimation
    - https://github.com/shaka-project/shaka-player/issues/324
  - Improved trick play and playbackRate support
    - https://github.com/shaka-project/shaka-player/issues/344
  - Allow apps to reset ABR manager estimates
    - https://github.com/shaka-project/shaka-player/issues/355
  - Support non-zero start times for VOD
    - https://github.com/shaka-project/shaka-player/issues/341
    - https://github.com/shaka-project/shaka-player/issues/348
    - https://github.com/shaka-project/shaka-player/issues/357

Bugfixes:
  - Fix playback of DASH with unaligned Representations
  - Fixed race conditions on seek
    - https://github.com/shaka-project/shaka-player/issues/334
  - Improved drift handling
    - https://github.com/shaka-project/shaka-player/issues/330
  - Fixed stack overflow in StringUtils
    - https://github.com/shaka-project/shaka-player/issues/335
  - Improved live support
    - https://github.com/shaka-project/shaka-player/issues/331
    - https://github.com/shaka-project/shaka-player/issues/339
    - https://github.com/shaka-project/shaka-player/issues/340
    - https://github.com/shaka-project/shaka-player/issues/351
  - Fixed player.addTextTrack
  - Handle CDMs which don't support the same types MSE does
    - https://github.com/shaka-project/shaka-player/issues/342
  - Fix audio-only encrypted playback
    - https://github.com/shaka-project/shaka-player/issues/360
  - Fix renaming of event properties
    - https://github.com/shaka-project/shaka-player/issues/361
  - Warn about missing clock sync elements in live manfiests
    - https://github.com/shaka-project/shaka-player/issues/290
  - Add option for default clock sync URI
    - https://github.com/shaka-project/shaka-player/issues/290
  - Fix crash in TextEngine when subs are turned off

Docs:
  - Shaka v2 upgrade guide
    - http://shaka-player-demo.appspot.com/docs/api/tutorial-upgrade.html
  - Added enum values (not just names) to generated docs
    - https://github.com/shaka-project/shaka-player/issues/337

Broken Compatibility compared to v2.0.0-beta:
  - None!


## 1.6.5 (2016-04-08)

Bugfixes:
  - Always build the same input files to a stable output
    - https://github.com/shaka-project/shaka-player/pull/299
  - Properly extern the 'xhr' property of HTTP errors
    - https://github.com/shaka-project/shaka-player/pull/319


## 2.0.0-beta (2016-04-07)

New Features:
  - DASH support for:
    - Multi-Period content
      - https://github.com/shaka-project/shaka-player/issues/186
    - Location elements
      - https://github.com/shaka-project/shaka-player/issues/298
    - UTCTiming elements (for clock synchronization)
      - https://github.com/shaka-project/shaka-player/issues/241
  - Better browser compatibility
    - Testing on Safari 9, IE 11, Edge, Firefox 45+, Opera, Chrome
    - https://github.com/shaka-project/shaka-player/issues/101
  - New plugin and build system to extend Shaka
    - Networking plugins
      - https://github.com/shaka-project/shaka-player/issues/228
      - https://github.com/shaka-project/shaka-player/issues/198
  - Cache-friendly networking
    - https://github.com/shaka-project/shaka-player/issues/76
    - https://github.com/shaka-project/shaka-player/issues/191
    - https://github.com/shaka-project/shaka-player/issues/235
  - Limit memory usage by clearing old data from buffer
    - https://github.com/shaka-project/shaka-player/issues/247
  - Simpler, more mobile-friendly demo app
  - New test assets
    - https://github.com/shaka-project/shaka-player/issues/224
  - Made play()/pause() independent of buffering
    - https://github.com/shaka-project/shaka-player/issues/233
  - Numerical error code system
    - https://github.com/shaka-project/shaka-player/issues/201
  - Distinguish between subtitle and caption tracks
    - https://github.com/shaka-project/shaka-player/issues/206
  - Separate audio & text language preferences
    - https://github.com/shaka-project/shaka-player/issues/207
  - Update timeShiftBufferDepth when updating the manifest
    - https://github.com/shaka-project/shaka-player/issues/295
  - Simplified clearkey setup using configure()
  - Initial bandwidth is now configurable:
    - https://github.com/shaka-project/shaka-player/issues/268

Bugfixes:
  - Stopped using Date headers for clock sync
    - https://github.com/shaka-project/shaka-player/issues/205
    - https://github.com/shaka-project/shaka-player/issues/241

Docs:
  - New tutorials!

Missing Features from v1 (to be added later):
  - Custom controls demo for live streams
    - https://github.com/shaka-project/shaka-player/issues/322
  - Chromecast demo
  - Trick play demo
  - Track restrictions based on key status
  - Offline support

Broken Compatibility:
  - Almost everything! (v2 upgrade guide coming soon)


## 1.6.4 (2016-03-03)

Bugfixes:
  - Updated Promise polyfill with fixes backported from v2
  - Fixed Edge EME compatibility & InvalidStateErrors
    - https://github.com/shaka-project/shaka-player/issues/282
  - Fixed HttpVideoSource use with clear content (Thanks, Sanborn!)
    - https://github.com/shaka-project/shaka-player/pull/292
  - Fixed uncompiled-mode performance regression introduced in v1.6.3
    - https://github.com/shaka-project/shaka-player/issues/288


## 1.6.3 (2016-02-08)

Features:
  - Added opt\_clearBufferOffset for audio  (Thanks, Itay)
    - https://github.com/shaka-project/shaka-player/pull/254
  - Fetch segments from new location after manifest redirect  (Thanks, Rob)
    - https://github.com/shaka-project/shaka-player/pull/266

Bugfixes:
  - Several IE11 stability issues and race conditions fixed
    - Fixed incompatibilities when clearing the SourceBuffer
    - Ignore spurious 'updateend' events
    - Added stack-based messages to all assertions
    - Fixed some unit test compatibility issues
    - Fixed race conditions caused by Promise polyfill
    - https://github.com/shaka-project/shaka-player/issues/251

Docs:
  - Update browser support docs with regard to IE & Firefox

Test app fixes:
  - Fixed slider controls for IE11
  - Turned off seek bar tooltips for IE11


## 1.6.2 (2015-12-14)

Features:
  - Added a new configure parameter to allow a user to completely disable
    the cache-buster.  This is necessary for certain CDNs, but please note
    the tradeoffs before using.  Bandwidth estimation can be adversely
    affected, particularly for low-bandwidth users.
    - https://github.com/shaka-project/shaka-player/issues/235
    - https://github.com/shaka-project/shaka-player/issues/238
    - https://github.com/shaka-project/shaka-player/issues/76

Bugfixes:
  - Fixed interpretation of startNumber for SegmentTemplate w/ duration.
    - https://github.com/shaka-project/shaka-player/issues/237


## 1.6.1 (2015-12-07)

Bugfixes:
  - Fixed handling when all streams are removed in a manifest update.
  - Fixed annotation mistakes in preparation for a new compiler release.
  - Fixed Promise polyfill errors in compiled mode.
    - https://github.com/shaka-project/shaka-player/issues/236


## 1.6.0 (2015-11-17)

Features:
  - Partial IE11 & PlayReady support.  (Thanks, Jono!)
    - https://github.com/shaka-project/shaka-player/pull/176
    - *live and offline content not working*
    - *non-zero start times not working*
    - *IE11 fails to decode some test assets*
      - https://github.com/shaka-project/shaka-player/issues/224
  - Added support for setPlaybackStartTime on live streams.
    - https://github.com/shaka-project/shaka-player/pull/231
  - Improved support for live streaming corner cases.
    - https://github.com/shaka-project/shaka-player/issues/139
    - https://github.com/shaka-project/shaka-player/issues/140
    - https://github.com/shaka-project/shaka-player/issues/141
    - https://github.com/shaka-project/shaka-player/issues/145
    - https://github.com/shaka-project/shaka-player/issues/185
  - Now builds with three different configs by default.
    - Full build (all features enabled).
    - DASH MP4 VOD. (Only DASH w/ SegmentBase, no WebM.)
    - DASH MP4 live. (Only DASH w/o SegmentBase, no WebM.)
    - https://github.com/shaka-project/shaka-player/issues/116
  - Changed startNumber implementation to be more consistent.
    - https://github.com/shaka-project/shaka-player/issues/192
  - Added a new Promise polyfill for IE11.
  - Added support for WebM w/ unknown size in the Segment element.

Bugfixes:
  - Expired sessions (for example, when using key rotation) are now cleaned up.
    - https://github.com/shaka-project/shaka-player/issues/210
  - Manifests can now be reprocessed without an update when
    availabilityStartTime passes.
    - https://github.com/shaka-project/shaka-player/issues/172

Test app features:
  - Added Chromecast support to the demo app.
    (No changes to the library for this.)
    - https://github.com/shaka-project/shaka-player/issues/117
  - Removed force-prefixed feature for improved IE11 support.
    - https://github.com/shaka-project/shaka-player/issues/222
  - Added links to the project and the docs.

Broken Compatibility:
  - Removed Player methods deprecated since v1.5.0.
    - enableAdaptation
    - getAdaptationEnabled
    - setStreamBufferSize
    - getStreamBufferSize
    - setLicenseRequestTimeout
    - setMpdRequestTimeout
    - setRangeRequestTimeout
    - setPreferredLanguage
    - setRestrictions
    - getRestrictions
    - https://github.com/shaka-project/shaka-player/issues/203
    - https://github.com/shaka-project/shaka-player/issues/93
  - Removed support for the old-style ContentProtection callback, deprecated
    since v1.5.0.
    - https://github.com/shaka-project/shaka-player/issues/203
    - https://github.com/shaka-project/shaka-player/issues/71


## 1.5.2 (2015-11-12)

A roll-up of recent bugfixes.

Bugfixes:
  - Fixed timestamp correction for some live streams from Elemental.
    - https://github.com/shaka-project/shaka-player/issues/200
  - Fixed support for manifests with different PSSHs per Representation.
    - https://github.com/shaka-project/shaka-player/issues/229
  - Fixed support for ContentProtection elements at both AdaptationSet and
    Representation level in the same manifest.
    - https://github.com/shaka-project/shaka-player/issues/230
  - Fixed support for bound DrmInfo callbacks.
    - https://github.com/shaka-project/shaka-player/issues/227
  - Fixed the 'enabled' flag of text tracks when manipulated directly by the
    video element.
    - https://github.com/shaka-project/shaka-player/issues/214
  - Fixed buffering to use the correct goal (minBufferTime) when re-buffering.
    - https://github.com/shaka-project/shaka-player/issues/190
  - Fixed a broken link in the documentation.  (Thanks, Leandro.)
    - https://github.com/shaka-project/shaka-player/issues/217
    - https://github.com/shaka-project/shaka-player/pull/218

Test app features:
  - Added a Widevine-encrypted version of the Sintel 4k test asset.


## 1.5.1 (2015-10-07)

A roll-up of recent bugfixes.

Bugfixes:
  - Fixed a major memory leak introduced in 1.5.0.
    - https://github.com/shaka-project/shaka-player/issues/184
  - Deleting encrypted offline content now deletes persistent sessions.
    - https://github.com/shaka-project/shaka-player/issues/171
  - Static content using SegmentTemplate is now truncated at the Period's
    duration.
    - https://github.com/shaka-project/shaka-player/issues/187
    - https://github.com/shaka-project/shaka-player/issues/173
  - Key status error reporting is now more consistent and provides more
    information.
  - Reduced flakiness in some tests.
  - Requests used for clock sync no longer allow caching.
    - https://github.com/shaka-project/shaka-player/issues/191


## 1.5.0 (2015-09-17)

Features:
  - Added method to set playback start time.
    - https://github.com/shaka-project/shaka-player/issues/122
    - https://github.com/shaka-project/shaka-player/pull/123
  - Added a text-styling API.
    - https://github.com/shaka-project/shaka-player/issues/115
  - Added support for AdaptationSet groups.
    - https://github.com/shaka-project/shaka-player/issues/67
  - Added a new configuration API.
    - https://github.com/shaka-project/shaka-player/issues/93
  - License preprocessing can now modify HTTP method and server URL.
    - https://github.com/shaka-project/shaka-player/issues/134
    - https://github.com/shaka-project/shaka-player/issues/135
  - Added an API to load captions not specified in the manifest.
    - https://github.com/shaka-project/shaka-player/issues/133
  - Added support for live streams using SegmentList.
    - https://github.com/shaka-project/shaka-player/issues/88
  - Added support for multiple BaseURL elements for failover.
    - https://github.com/shaka-project/shaka-player/issues/68
  - Gave IAbrManager implementation the ability to clear the buffer when
    switching streams.
    - https://github.com/shaka-project/shaka-player/pull/144
  - Added setNetworkCallback API to DashVideoSource to modify network requests.
    - https://github.com/shaka-project/shaka-player/issues/148
  - Improved error reporting for unplayable content.
  - Added support for multiple DRM schemes per ContentProtection and simplified
    DRM scheme configuration.
    - https://github.com/shaka-project/shaka-player/issues/71
  - Improved documentation for license pre- and post-processing.
    - https://github.com/shaka-project/shaka-player/issues/137

Bugfixes:
  - Restricting all video tracks now fires an error event.
    - https://github.com/shaka-project/shaka-player/issues/179
    - https://github.com/shaka-project/shaka-player/issues/170
  - Changing text tracks now fires an adaptation event.
    - https://github.com/shaka-project/shaka-player/issues/147
  - Fixed bad interactions between pausing and negative playback rates.
    - https://github.com/shaka-project/shaka-player/issues/130
  - Fixed support for negative r values in SegmentTimeline.
    - https://github.com/shaka-project/shaka-player/issues/162
  - Fixed bugs that could cause infinite buffering for certain configurations.
    - https://github.com/shaka-project/shaka-player/issues/166
  - Fixed exceptions fired during rapid Player destroy().
    - https://github.com/shaka-project/shaka-player/issues/151
  - Fixed linting with conflicting globally-installed copy of linter library.
    - https://github.com/shaka-project/shaka-player/issues/153
  - Fixed support for SegmentTimelines with presentationTimeOffset.
    - https://github.com/shaka-project/shaka-player/issues/143
  - Fixed support for apps/content which specify multiple DRM scheme configs.
    - https://github.com/shaka-project/shaka-player/issues/177

Broken Compatibility:
  - Removed Player methods deprecated since v1.3.0.
    - getCurrentResolution
    - getCurrentTime
    - getDuration
    - getMuted
    - getVolume
    - play
    - pause
    - requestFullscreen
    - seek
    - setMuted
    - setVolume
    - https://github.com/shaka-project/shaka-player/issues/118

Deprecated:
  - The following methods on Player are deprecated in favor of
    configure()/getConfiguration() and will be removed in v1.6.0:
    - enableAdaptation
    - getAdaptationEnabled
    - setStreamBufferSize
    - getStreamBufferSize
    - setLicenseRequestTimeout
    - setMpdRequestTimeout
    - setRangeRequestTimeout
    - setPreferredLanguage
    - setRestrictions
    - getRestrictions
    - https://github.com/shaka-project/shaka-player/issues/93
  - A new two-argument ContentProtectionCallback has been added to
    DashVideoSource, and the old style is deprecated and will be removed
    in v1.6.0.
    - https://github.com/shaka-project/shaka-player/issues/71


## 1.4.2 (2015-09-04)

A roll-up of recent bugfixes.

Bugfixes:
  - Fix storage of duplicate session IDs for encrypted offline content.
  - Specify EME sessionTypes, required in newer EME draft.
    - https://github.com/shaka-project/shaka-player/issues/128
  - Fix regression in rewind support, once more working outside buffered range.
    - https://github.com/shaka-project/shaka-player/issues/165
  - Support renamed output protection errors from newer EME draft.
  - Fix seeking in custom controls on Android.
    - https://github.com/shaka-project/shaka-player/issues/164
  - Fix missing final chunk when storing certain videos for offline playback.
    - https://github.com/shaka-project/shaka-player/issues/157
  - Prevent crashing of module loaders which use 'define' but are not full AMD
    loaders.
    - https://github.com/shaka-project/shaka-player/issues/163

Test app features:
  - Added 'offline' URL param.


## 1.4.1 (2015-08-18)

A roll-up of recent bugfixes and small improvements.

Bugfixes:
  - An exception is no longer thrown from StreamVideoSource in uncompiled mode
    when the stream limits cannot be computed.
  - Fixed support for multiple encrypted audio tracks.
    - https://github.com/shaka-project/shaka-player/issues/112
  - Fixed support for manifests that use SegmentList with a single URL.
  - Fixed support for audio and video robustness settings in compiled mode.
  - The MPD 'main' property is now defined in the correct class.
  - The same initialization segment is no longer inserted multiple times into
    the SourceBuffer.
  - Removed a race in Stream that could stop AdaptationEvents from firing.
  - Stopped the compiler from renaming PersistentState and DistinctiveIdentifier
    enum values.
  - Removed a race in Player.getStats() that could cause NaN stats.
  - Fixed support to recover from failed segment requests.
    - https://github.com/shaka-project/shaka-player/issues/131
  - Made rewind, pause, play, and fast-forward consistent with normal video
    element behavior, the UI, and Player.setPlaybackRate().
    - https://github.com/shaka-project/shaka-player/issues/130
    - https://github.com/shaka-project/shaka-player/issues/138
  - Improved seek handling during stream startup.
    - https://github.com/shaka-project/shaka-player/issues/136
  - Unnecessary seeking events during stream startup are no longer fired.
    - https://github.com/shaka-project/shaka-player/issues/132
  - Segment fetches are no longer retried if the Stream has been destroyed.
    - https://github.com/shaka-project/shaka-player/issues/156
  - Fixed support for offline in compiled mode.

Features:
  - The version indicator on the demo page now displays the NPM version (if
    available) when the git version is unavailable.
  - Added support to clear the audio buffer when switching tracks.
    - https://github.com/shaka-project/shaka-player/issues/119
  - Added the ability to detect and recover from multiple buffered ranges.
    - https://github.com/shaka-project/shaka-player/issues/121
  - Improved error messages when persistent licenses are not supported.
    - https://github.com/shaka-project/shaka-player/issues/85

Testing:
  - Reduced test flakiness overall.
  - Certain (unavoidable) decode errors are now suppressed on Chrome Linux.
  - Added waitUntilBuffered() function to help reduce test flakiness.


## 1.4.0 (2015-07-06)

Code health release.  Major refactoring of streaming logic.

Bugfixes:
  - Overriding a license server URL in the test app no longer causes a PSSH
    from the MPD to be ignored.
  - Fixed possible event listener leak.
    - https://github.com/shaka-project/shaka-player/issues/109

Features:
  - Player.destroy() now returns a Promise.
  - DrmSchemeInfo now has distinctiveIdentifier, persistentState, and
    robustness parameters.
  - Clarified buffering event policies.
    - https://github.com/shaka-project/shaka-player/issues/77
  - Added a license pre-processor.
    - https://github.com/shaka-project/shaka-player/issues/62
  - Added support for the MPD Location element.
    - https://github.com/shaka-project/shaka-player/issues/65
  - Custom BandwidthEstimators can now allow XHR caching.
    - https://github.com/shaka-project/shaka-player/issues/76
  - Added support for startNumber of 0, per the recent DASH spec corrigendum.
    - https://github.com/shaka-project/shaka-player/issues/10
  - Added support for server certificate APIs through DrmSchemeInfo.
    - https://github.com/shaka-project/shaka-player/issues/84
  - Major refactor of streaming.  Switching representations is now faster and
    more flexible.  Live stream seek ranges are more accurate.
    - https://github.com/shaka-project/shaka-player/issues/51
  - XHR timeout is now runtime-configurable.
    - https://github.com/shaka-project/shaka-player/issues/50
  - Buffering goals are now runtime-configurable.
    - https://github.com/shaka-project/shaka-player/issues/49
  - Alternative IAbrManager implementations can now be injected at runtime.
    - https://github.com/shaka-project/shaka-player/issues/48

Test app features:
  - Added "buffered ahead" and "buffered behind" indicators.
    - https://github.com/shaka-project/shaka-player/issues/47
  - Converted cycle buttons into checkboxes so cycling can be stopped during
    playback.
    - https://github.com/shaka-project/shaka-player/issues/46
  - Test app now jumps to live when the user clicks on the time code in a live
    stream.
  - Added an example of a trick-play UI built on the Player API.
    - https://github.com/shaka-project/shaka-player/issues/54

Testing:
  - Disabled code coverage stats in unit tests by default.
    - https://github.com/shaka-project/shaka-player/issues/105
  - Split unit tests and integration tests into separate test runners.
    - https://github.com/shaka-project/shaka-player/issues/104
  - Added a Karma config file to make automated testing easier.
  - Added checks for offline features to the support-testing page.

Documentation:
  - Documented the fact that autoplay does not work on mobile, and why.
  - Documented error events and how to handle them.
    - https://github.com/shaka-project/shaka-player/issues/106
  - Documented browser support and porting.
    - https://github.com/shaka-project/shaka-player/issues/66
  - Documented Player APIs for trick play interface.
    - https://github.com/shaka-project/shaka-player/issues/54


## 1.3.2 (2015-07-06)

A roll-up of recent bugfixes.

Bugfixes:
  - Fixed case-sensitive scheme URI check in the test app.
  - Fixed support-testing page for very old browsers.
  - Fixed multi-lingual encrypted content.
    - https://github.com/shaka-project/shaka-player/issues/112
  - Fixed load-time exceptions in IE 9.
    - https://github.com/shaka-project/shaka-player/issues/87
    - https://github.com/shaka-project/shaka-player/pull/110


## 1.3.1 (2015-05-22)

A roll-up of recent bugfixes and small improvements.

Bugfixes:
  - Fixed some broken tests.
  - Fixed buffering states.
    - https://github.com/shaka-project/shaka-player/issues/61
  - Fixed fullscreen polyfill installation.
    - https://github.com/shaka-project/shaka-player/issues/81
  - Fixed handling of live content with minimumUpdatePeriod of 0.
    - https://github.com/shaka-project/shaka-player/pull/64
  - Fixed selection of live content (type=dynamic).
    - https://github.com/shaka-project/shaka-player/issues/69
    - https://github.com/shaka-project/shaka-player/issues/70
  - Fixed AJAX request timeouts.
    - https://github.com/shaka-project/shaka-player/issues/78
    - https://github.com/shaka-project/shaka-player/pull/79
  - Fixed spec compliance for polyfilled session expiration.
  - Fixed buffer time for offline playback.
  - Fixed offline API consistency.
    - https://github.com/shaka-project/shaka-player/issues/72

Features:
  - Refactored and updated support test page.
    - http://shaka-player-demo.appspot.com/support.html
  - Simplified polyfill installation. (shaka.polyfill.installAll)
  - New polyfill for CustomEvent.
  - Small improvements to browser compatibility.
    - (node.childNodes, node.textContent, currentScript, CSS fixes, etc.)
  - Documented clock sync and CORS issues with live content.
    - https://github.com/shaka-project/shaka-player/issues/53
  - Documented JRE requirements.
  - Test app now accepts a URL parameter to make ChromeCast testing easier.
    - https://github.com/shaka-project/shaka-player/issues/56
  - Stopped using deprecated methods in tests and tutorials.
    - https://github.com/shaka-project/shaka-player/issues/73
  - Added progress events for storing offline content.
  - Documented offline APIs.
    - https://github.com/shaka-project/shaka-player/issues/60


## 1.3.0 (2015-04-16)

Feature release, introducing live streaming and offline playback.

Bugfixes:
  - Fixed playback and buffering of streams whose index is inaccurate.
  - Fixed EME spec compliance.
    - https://github.com/shaka-project/shaka-player/issues/45
  - Fixed FakeEventTarget exception handling.
  - Fixed aggressive dead code stripping by the compiler.
  - Fixed a bug in which subtitles were enabled by default without a subtitle
    language match.

Features:
  - Added offline playback support.
    - https://github.com/shaka-project/shaka-player/issues/22
  - Added offline support for encrypted content (on platforms which support
    persistent licenses).
    - https://github.com/shaka-project/shaka-player/issues/23
  - Added live stream support.
    - https://github.com/shaka-project/shaka-player/issues/21
  - Added support for header-based clock synchronization.
  - Added support for inheriting Segment{Base,List,Template} across levels in
    MPDs.
  - Add polyfill support for fullscreen events.
  - Updated EME usage to the March 12 draft.
  - Added Player.getAdaptationEnabled().
    - https://github.com/shaka-project/shaka-player/pull/31
  - Added support for bandwidth restrictions and restrictions not based on
    license responses.
    - https://github.com/shaka-project/shaka-player/pull/36
  - Added support for requireJS and improved support for commonJS.
  - Sped up integration tests and improved test robustness.
  - Bandwidth estimates can now be persisted across playbacks.
  - Custom bandwidth estimator objects can now be injected into the Player.
  - Improved EME v0.1b polyfill consistency with native EME in Chrome.
  - Improved buffering and underflow mechanisms.
  - Improved error reporting if DRM info is missing.
  - Improved robustness in the face of HTTP 404 and 410 errors during segment
    fetch.
  - Improved documentation for Role tags and multilingual assets.

Test app features:
  - Example player controls in the test app.

Deprecated:
  - The following methods on Player are deprecated.  They will be removed in
    v1.4.0:
    - getCurrentResolution() (replace with video.videoWidth & video.videoHeight)
    - getCurrentTime()/seek() (replace with video.currentTime)
    - getDuration() (replace with video.duration)
    - getMuted()/setMuted() (replace with video.muted)
    - getVolume()/setVolume() (replace with video.volume)
    - play() (replace with video.play)
    - pause() (replace with video.pause)
    - requestFullscreen() (replace with video.requestFullscreen())

Broken compatibility:
  - The license postprocessor callback is no longer given a Restrictions
    argument.  See Player.getRestrictions()/setRestrictions().
  - The suppressMultipleEvents flag has been dropped from DrmSchemeInfo, which
    changes the constructor signature.  This flag interfered with key rotation.


## 1.2.3 (2015-04-07)

A roll-up of recent bugfixes.

Bugfixes:
  - Fixed consistency of setPlaybackRate(0).
  - Fixed support for mp4a.40.5 audio content.
  - Improved rewind accuracy.
  - Fixed decode of query parameters in content URLs.
    - https://github.com/shaka-project/shaka-player/pull/40
  - Fixed FakeEventTarget for Chrome 43+.
  - Removed flaky assertion in EME polyfill.
  - Made AbrManager less aggressive.
  - Fixed EME spec compatibility and encrypted playback in Chrome 43+.
    - https://github.com/shaka-project/shaka-player/issues/45

Features:
  - Added support for module.exports.
    - https://github.com/shaka-project/shaka-player/pull/35

Test app features:
  - Added a new 4k test asset.


## 1.2.2 (2015-03-11)

Bugfixes:
  - Version 1.2.1 had multiple issues with its version numbering.  These
    are now corrected, but npm requires unique version numbers to publish.
    Version 1.2.1 has been pulled from npm.
    - https://github.com/shaka-project/shaka-player/issues/30

Features:
  - Added getAdaptationEnabled() to Player.
    - https://github.com/shaka-project/shaka-player/issues/29


## 1.2.1 (2015-03-10)

A roll-up of recent bugfixes, plus a few minor additions to the test app.
Branched from v1.2.0.

Bugfixes:
  - Try to recover from a streaming failure.
    - https://github.com/shaka-project/shaka-player/issues/28
  - Ignore spurious error events from the video tag.
  - Update docs WRT content restrictions and folder organization.
  - Fix clearkey errors in Chrome 42+.
  - Fix computation of the number of segments in MpdProcessor.
    - Only affects assets which use SegmentTemplate with a duration attribute.

Test app features:
  - Rename a confusing asset.
  - Add a button to cycle video tracks.
  - Support MPD init data overrides for all DRM schemes.


## 1.2.0 (2015-02-24)

Lots of internal refactoring and bugfixes, and a few new features.

Bugfixes:
  - Buffer eviction no longer causes hangs on seek.
    - https://github.com/shaka-project/shaka-player/issues/15
  - Adaptation no longer causes hangs on looping and seeking backward.
    - https://github.com/shaka-project/shaka-player/issues/26
  - StreamStats no longer shows null for width and height before adaptation.
    - https://github.com/shaka-project/shaka-player/issues/16
  - Content with differing start times for the audio & video streams no longer
    exhibits A/V sync issues.
    - https://github.com/shaka-project/shaka-player/issues/17
  - DrmSchemeInfo's suppressMultipleEncryptedEvents flag is now correctly
    honored regardless of the timing of events.
  - Calculations for the $Time$ placeholder in MPD SegmentTemplates has been
    corrected.
  - The test app no longer causes mixed-content errors when served over HTTPS.
  - Small mistakes in URLs and asset names in the test app have been corrected.
  - Windows checkouts now have consistent newline style.
    - https://github.com/shaka-project/shaka-player/issues/12
  - Windows build steps documented.
    - https://github.com/shaka-project/shaka-player/issues/13

Features:
  - The isTypeSupported polyfill has been removed and all EME APIs have been
    updated to the [Feb 9 2015 EME spec].
    - https://github.com/shaka-project/shaka-player/issues/2
  - Gaps and overlaps in SegmentTimeline are no longer treated as an error.
    Large gaps/overlaps will still generate a warning.
    - https://github.com/shaka-project/shaka-player/issues/24
  - HDCP-related failures are now translated into error events in Chrome 42+.
    - https://github.com/shaka-project/shaka-player/issues/14
  - The MPD Role tag is now supported as a way of indicating the main
    AdaptationSet for the purposes of language matching.
    - https://github.com/shaka-project/shaka-player/issues/20
  - More detail added to AJAX error events.
    - https://github.com/shaka-project/shaka-player/issues/18
  - The Player now dispatches buffering events.
    - https://github.com/shaka-project/shaka-player/issues/25
  - Parser support for the new v1 PSSH layout, including parsing of key IDs.
    - https://github.com/shaka-project/shaka-player/issues/19
  - The fullscreen polyfill has been updated and expanded.
  - DashVideoSource refactored to split DASH-independent functionality into the
    generic StreamVideoSource.  This should simplify the implementation of new
    video sources for non-DASH manifest formats.  (Contributions welcome.)
  - Automatic build numbering has been added, with version numbers appearing in
    the test app UI.
  - The library has been published on [npm] and [cdnjs].
  - Release version numbering follows the [semantic versioning spec].

Broken Compatibility:
  - System IDs in PSSH objects are now hex strings instead of raw strings.

[Feb 9 2015 EME spec]: https://bit.ly/EmeFeb15
[npm]: https://www.npmjs.com/package/shaka-player
[cdnjs]: https://cdnjs.com/libraries/shaka-player
[semantic versioning spec]: http://semver.org/


## 1.1 (2015-01-14)

Maintenance release.

Bugfixes:
  - The enabled flag for text tracks is now preserved when switching tracks.
    Player.enableTextTrack() is no longer required after selectTextTrack().
    - https://github.com/shaka-project/shaka-player/issues/1
  - The documentation for Player methods enableTextTrack, setPreferredLanguage,
    and getCurrentResolution has been corrected.
    - https://github.com/shaka-project/shaka-player/issues/3
    - https://github.com/shaka-project/shaka-player/issues/4
    - https://github.com/shaka-project/shaka-player/issues/6
  - The AbrManager class is now correctly destroyed.
    - https://github.com/shaka-project/shaka-player/issues/5
  - Clearkey support for Chrome 41+ has been fixed.
    - https://github.com/shaka-project/shaka-player/issues/8
  - A new polyfill has been added to compensate for Chrome 41+'s removal of
    MediaKeys.isTypeSupported.
    - https://github.com/shaka-project/shaka-player/issues/7
  - Several unused internal methods have been removed from the codebase.
  - Fixed a failing assertion in one of the MediaKeys polyfills.
  - Fixed failing code coverage analysis and related parse errors in several
    tests.
  - Fixed support for MPDs with SegmentTemplate@duration and
    MPD@mediaPresentationDuration, but no Period@duration attribute.
    - https://github.com/shaka-project/shaka-player/issues/9

Features:
  - Tests are now checked for style.
  - Tests have been expanded to increase coverage and exercise more Player
    features:
    - playback rate
    - stats
    - language preference
    - license restrictions
    - WebM/VP9
    - error events
  - Integration tests now run much faster.
  - MediaKeys polyfills have received minor updates to improve compatibility
    with Chrome 41.
  - New sample assets and code in app.js to demonstrate how to use a PSSH from
    an MPD to override what's in the content itself.

Broken Compatibility:
  - None!


## 1.0 (2014-12-19)

First public release.

Bugfixes:
  - Text tracks are no longer ignored in MPD manifests.
  - Adaptation decisions are now quicker and more reliable.
    - (This bug was more noticeable on faster internet connections.)
  - Playback no longer gets "stuck" on certain content.
  - Playback no longer gets "stuck" after certain seek patterns.
  - Player get/select/enable methods can now be called without a video source.
  - A \<video\> tag's "videoWidth"/"videoHeight" attributes now update
    correctly on Chrome >= 40.
  - Manual adaptation while paused no longer unpauses the video.
  - Credentials can now be used on cross-domain license requests.
  - Range headers are no longer sent for all segment requests.
    - (This fixes issues with IIS.)
  - A missing declaration of getVideoPlaybackQuality() has been added.
  - The compiled code no longer pollutes the global namespace.
  - DASH manifests using \<SegmentList\> are now parsed correctly.
  - Formatting has been fixed in the "Shaka Player Development" tutorial.

Features:
  - The Player is now reusable.  You can call load() multiple times without
    calling destroy().
  - The JS linter is now included in sources, fixing compatibility issues
    between versions.
  - The test suite now includes playback integration tests.
  - The Player has been updated to support the 01 Dec 2014 draft of the EME
    specification.
  - The loader in load.js no longer makes assumptions about app.js.  You can
    now use load.js to bootstrap other applications.
  - The test app now uses less screen real estate.
  - All custom events have been documented, and a new tutorial has been added
    to demonstrate how they can be used.
  - The Player now has a support-check API to determine if the browser has all
    necessary features for playback.
  - Sample code in the tutorials is now marked up to highlight changes from the
    previous sample.
  - Code coverage in unit tests has been increased.
  - Flakiness in unit tests has been reduced.
  - DASH manifests using \<SegmentTemplate\> without a segment index or segment
    timeline are now supported.
  - The DASH "presentationTimeOffset" attribute is now supported.

Broken Compatibility:
  - ContentProtectionCallback no longer takes a "mimeType" argument.
  - DrmSchemeInfo constructor no longer takes a "mimeType" argument.
  - DrmSchemeInfo constructor's "initData" argument is now an object with
    fields instead of a Uint8Array.
  - DrmSchemeInfo now takes a "withCredentials" argument.
  - lib.js has been renamed to shaka-player.compiled.js.


## 0.1b (2014-11-21)

Private beta release.
