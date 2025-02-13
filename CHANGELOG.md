# Changelog

## [4.2.14](https://github.com/shaka-project/shaka-player/compare/v4.2.13...v4.2.14) (2023-08-30)


### Bug Fixes

* **Ads:** Initialize correctly the IMA ads manager ([#5541](https://github.com/shaka-project/shaka-player/issues/5541)) ([fa82928](https://github.com/shaka-project/shaka-player/commit/fa82928a6d15ef0327ea561a2f7c4dbb9e4de0dc))
* **Demo:** Show correctly external text in the Demo ([#5521](https://github.com/shaka-project/shaka-player/issues/5521)) ([7408151](https://github.com/shaka-project/shaka-player/commit/7408151f40440d87894453b2e5f745e4888a7495))
* **HLS:** Fix external subtitles out of sync in HLS ([#5491](https://github.com/shaka-project/shaka-player/issues/5491)) ([ff2edc1](https://github.com/shaka-project/shaka-player/commit/ff2edc18cd6401f1058ea176e52c5da4104a8e5f))
* Orange set top box is incorrectly categorized as Apple ([#5545](https://github.com/shaka-project/shaka-player/issues/5545)) ([31f7a18](https://github.com/shaka-project/shaka-player/commit/31f7a18bacb51d176f1d7def5e1965b9e3a0e5fa))
* **UI:** Fix playback restarts in safari when click on seekbar end ([#5527](https://github.com/shaka-project/shaka-player/issues/5527)) ([7824cc9](https://github.com/shaka-project/shaka-player/commit/7824cc9ce8549d3127ffdd97a020587bd75a7995))

## [4.2.13](https://github.com/shaka-project/shaka-player/compare/v4.2.12...v4.2.13) (2023-08-20)


### Bug Fixes

* add MIME type for HTML5 tracks ([#5452](https://github.com/shaka-project/shaka-player/issues/5452)) ([e540ac1](https://github.com/shaka-project/shaka-player/commit/e540ac17caf1b2200edd31b3d13a0e9934db6a69))
* Default language to 'und' for native tracks ([#5464](https://github.com/shaka-project/shaka-player/issues/5464)) ([aeda19d](https://github.com/shaka-project/shaka-player/commit/aeda19df0b7431f5823ca8b88960ec3b0bf4cbc7))
* Fix exiting fullscreen on Safari ([#5439](https://github.com/shaka-project/shaka-player/issues/5439)) ([9121a52](https://github.com/shaka-project/shaka-player/commit/9121a5231949caf9010d582825581c30ae77d649)), closes [#5437](https://github.com/shaka-project/shaka-player/issues/5437)
* Fix memory leak on SimpleAbrManager ([#5478](https://github.com/shaka-project/shaka-player/issues/5478)) ([5c352c8](https://github.com/shaka-project/shaka-player/commit/5c352c86c830f121d55e47f705cd1dd384e6d4a8))
* gettting maxWidth and maxHeight for restrictToElementSize option ([#5481](https://github.com/shaka-project/shaka-player/issues/5481)) ([eca8436](https://github.com/shaka-project/shaka-player/commit/eca8436f436a758dbca89b4b96c80b369aba713f))
* Remove duplicate adaptation event before init ([#5492](https://github.com/shaka-project/shaka-player/issues/5492)) ([08708f0](https://github.com/shaka-project/shaka-player/commit/08708f004213ad370e323c2b09bd4553293ffef4))
* Support fLaC and Opus codec strings in HLS ([#5454](https://github.com/shaka-project/shaka-player/issues/5454)) ([18d5971](https://github.com/shaka-project/shaka-player/commit/18d597195bdc1b28aae83d16c10322fde3d8c140)), closes [#5453](https://github.com/shaka-project/shaka-player/issues/5453)
* **UI:** Disable right click on range elements ([#5497](https://github.com/shaka-project/shaka-player/issues/5497)) ([c508446](https://github.com/shaka-project/shaka-player/commit/c508446ab2e61278aa1855e3fd96cce59b995afb))
* Update karma-local-wd-launcher to fix Chromedriver &gt;= 115, fix M1 mac ([#5489](https://github.com/shaka-project/shaka-player/issues/5489)) ([1789977](https://github.com/shaka-project/shaka-player/commit/17899774c0eecd38a46febbe848d978e71aa43e7))
* Update karma-local-wd-launcher to fix Edge &gt;= 115 ([#5506](https://github.com/shaka-project/shaka-player/issues/5506)) ([d7d9efe](https://github.com/shaka-project/shaka-player/commit/d7d9efebbc154bf7635870d694d9ab0321cd26b3))
* **WebVTT:** Fix text-shadow in WebVTT not working ([#5499](https://github.com/shaka-project/shaka-player/issues/5499)) ([853ccd8](https://github.com/shaka-project/shaka-player/commit/853ccd83a66972ca316a1c6223e743fde4bfb5e9))

## [4.2.12](https://github.com/shaka-project/shaka-player/compare/v4.2.11...v4.2.12) (2023-07-21)


### Bug Fixes

* **DASH:** Avoid "Possible encoding problem detected!" when appending chunked data ([#5376](https://github.com/shaka-project/shaka-player/issues/5376)) ([ad9de15](https://github.com/shaka-project/shaka-player/commit/ad9de15043491d5969f44d7d864041c19af3b108))
* **demo:** Fix deployment of v4.2.x on appspot ([d8b2378](https://github.com/shaka-project/shaka-player/commit/d8b2378ff565a6aec2de2689219001a1c2a16308))
* **Demo:** Trim custom manifestUri to avoid copy-paste errors ([#5378](https://github.com/shaka-project/shaka-player/issues/5378)) ([d7d2bcb](https://github.com/shaka-project/shaka-player/commit/d7d2bcb6aab0cb4b670889e380f4705444b2848e))
* **docs:** fix player configuration code in drm config tutorial ([#5359](https://github.com/shaka-project/shaka-player/issues/5359)) ([c5e0f8b](https://github.com/shaka-project/shaka-player/commit/c5e0f8b967d0327eb1d9ab50b4db77990d84a1ed))
* **DRM:** broken keySystemsMapping due to multiple references of drmInfo ([#5388](https://github.com/shaka-project/shaka-player/issues/5388)) ([8906548](https://github.com/shaka-project/shaka-player/commit/8906548b6c40b0ac3023c80f1bad02496aff0014))
* Fix captions from MP4s with multiple trun boxes ([#5422](https://github.com/shaka-project/shaka-player/issues/5422)) ([b41186e](https://github.com/shaka-project/shaka-player/commit/b41186e3cfe7e3e2f633a24d5c9c88e8eb025fef)), closes [#5328](https://github.com/shaka-project/shaka-player/issues/5328)
* Fix DASH rejection of streams with ColourPrimaries and MatrixCoefficients ([#5345](https://github.com/shaka-project/shaka-player/issues/5345)) ([e2968ca](https://github.com/shaka-project/shaka-player/commit/e2968ca7ad5ae5a3b3dea56029d2815214564a52))
* Fix exception on Tizen due to unsupported Array method ([#5429](https://github.com/shaka-project/shaka-player/issues/5429)) ([0fe4d5c](https://github.com/shaka-project/shaka-player/commit/0fe4d5c6f7dbe5e6254b8173cec5ce796c14f5bf))
* Fix failure when drivers lag behind browser ([#5423](https://github.com/shaka-project/shaka-player/issues/5423)) ([30f464f](https://github.com/shaka-project/shaka-player/commit/30f464f5f06b0f5e7779e7c4a6dedca6ae90277c))
* Gap jump at start when first jump lands in a new gap ([#5408](https://github.com/shaka-project/shaka-player/issues/5408)) ([1ead685](https://github.com/shaka-project/shaka-player/commit/1ead685075de79591a5909e4e06ac5dd380e3e92))
* gap jumping when gap exists at start position ([#5384](https://github.com/shaka-project/shaka-player/issues/5384)) ([bd5bade](https://github.com/shaka-project/shaka-player/commit/bd5badef95428ae515262d104770e88b71493469))
* **HLS:** Add subtitle role when there are no roles ([#5357](https://github.com/shaka-project/shaka-player/issues/5357)) ([c5a5ddb](https://github.com/shaka-project/shaka-player/commit/c5a5ddbfd0bfca21b686f2ec99c5dedb0da71fba))
* **HLS:** Fix dvh1 and dvhe detection as video codec ([#5364](https://github.com/shaka-project/shaka-player/issues/5364)) ([3373a41](https://github.com/shaka-project/shaka-player/commit/3373a41f483a8807d4de7effe7310fdf488999a5))
* **HLS:** Ignore segments with zero duration ([#5371](https://github.com/shaka-project/shaka-player/issues/5371)) ([29b81ea](https://github.com/shaka-project/shaka-player/commit/29b81ea3c12638feb210e79a5ee28a9ece34656f))
* **media:** Fix region checking in livestreams ([#5361](https://github.com/shaka-project/shaka-player/issues/5361)) ([007a259](https://github.com/shaka-project/shaka-player/commit/007a2593096fae079c068a89dcfea338ec6d677e)), closes [#5213](https://github.com/shaka-project/shaka-player/issues/5213)
* Populate HDR correctly ([#5369](https://github.com/shaka-project/shaka-player/issues/5369)) ([db67d8d](https://github.com/shaka-project/shaka-player/commit/db67d8d4c257a53b43456f63a68b19bd0ae9f08f))
* prevent access to null config_ in SimpleAbrManager ([#5362](https://github.com/shaka-project/shaka-player/issues/5362)) ([80973d7](https://github.com/shaka-project/shaka-player/commit/80973d7d033d4a876af1a3376877e3c36a55ecc9))
* **UI:** Fix resolution selection on src= ([#5367](https://github.com/shaka-project/shaka-player/issues/5367)) ([b570e92](https://github.com/shaka-project/shaka-player/commit/b570e92a3d0d49fe47d9051f48fb55196cc8b38e))
* **WebVTT:** Add support to middle position ([#5366](https://github.com/shaka-project/shaka-player/issues/5366)) ([6481e29](https://github.com/shaka-project/shaka-player/commit/6481e2902de33aa0b5cd7c2373c764bd3143a866))

## [4.2.11](https://github.com/shaka-project/shaka-player/compare/v4.2.10...v4.2.11) (2023-06-20)


### Bug Fixes

* **Demo:** Fix deployment of codem-isoboxer in the Demo ([#5257](https://github.com/shaka-project/shaka-player/issues/5257)) ([23d48d4](https://github.com/shaka-project/shaka-player/commit/23d48d4da40362ace5bf2b653ffc35d8a33df21a))
* **Demo:** Fix error link width to avoid overlap with close button ([#5309](https://github.com/shaka-project/shaka-player/issues/5309)) ([a6f980d](https://github.com/shaka-project/shaka-player/commit/a6f980d382669bf14fb91b63ab4f727f23f9064f))
* Fix error when network status changes on src= playbacks ([#5305](https://github.com/shaka-project/shaka-player/issues/5305)) ([ce354ba](https://github.com/shaka-project/shaka-player/commit/ce354bab773c9fcac906d666c43a14c0e6f86d2d))
* **HLS:** Avoid "Possible encoding problem detected!" when is a preload reference ([#5332](https://github.com/shaka-project/shaka-player/issues/5332)) ([763ae6a](https://github.com/shaka-project/shaka-player/commit/763ae6ad53934e12ac76a43138d15df7a20cd9d2))
* **HLS:** Avoid HLS resync when there is a gap in the stream ([#5284](https://github.com/shaka-project/shaka-player/issues/5284)) ([256cf20](https://github.com/shaka-project/shaka-player/commit/256cf2071e23b315254b083a52aaa24649bd3b3e))
* **HLS:** Avoid variable substitution if no variables ([#5269](https://github.com/shaka-project/shaka-player/issues/5269)) ([b549b60](https://github.com/shaka-project/shaka-player/commit/b549b6036c4baa2b987f4c0276cc2b0edf623dc0))
* **HLS:** Parse EXT-X-PART-INF as media playlist tag ([#5311](https://github.com/shaka-project/shaka-player/issues/5311)) ([d78c080](https://github.com/shaka-project/shaka-player/commit/d78c08065c8728dbd9f849b44668e4ca8147785c))
* **HLS:** Skip EXT-X-PRELOAD-HINT without full byterange info ([#5294](https://github.com/shaka-project/shaka-player/issues/5294)) ([e462711](https://github.com/shaka-project/shaka-player/commit/e462711d2366b89e2b60d42bab2b1da15ca80556))
* media source object URL revocation ([#5214](https://github.com/shaka-project/shaka-player/issues/5214)) ([80ce378](https://github.com/shaka-project/shaka-player/commit/80ce378a115eaa5c8ddee84de57ed7a503942b50))
* Ship to NPM without node version restrictions ([#5253](https://github.com/shaka-project/shaka-player/issues/5253)) ([41c1ace](https://github.com/shaka-project/shaka-player/commit/41c1ace953c898232040143b469fcf7971572450)), closes [#5243](https://github.com/shaka-project/shaka-player/issues/5243)
* unnecessary parsing of in-band pssh when pssh is in the manifest ([#5198](https://github.com/shaka-project/shaka-player/issues/5198)) ([889cc68](https://github.com/shaka-project/shaka-player/commit/889cc68093099e1976dea0b72ee3943fa6f992d5))

## [4.2.10](https://github.com/shaka-project/shaka-player/compare/v4.2.9...v4.2.10) (2023-04-27)


### Bug Fixes

* `config.streaming.preferNativeHls` only applies to HLS streams ([#5167](https://github.com/shaka-project/shaka-player/issues/5167)) ([0cf7014](https://github.com/shaka-project/shaka-player/commit/0cf70143aaedd3ec3cc31c7497f432b3f594ed2c)), closes [#5166](https://github.com/shaka-project/shaka-player/issues/5166)
* **ads:** Fix ads starting muted behavior ([#5153](https://github.com/shaka-project/shaka-player/issues/5153)) ([17e8bf6](https://github.com/shaka-project/shaka-player/commit/17e8bf6b086afe17a927048e7d4ea17649c3f827)), closes [#5125](https://github.com/shaka-project/shaka-player/issues/5125)
* **Ads:** Fix usage of EventManager on CS ([#5084](https://github.com/shaka-project/shaka-player/issues/5084)) ([f1b3ceb](https://github.com/shaka-project/shaka-player/commit/f1b3ceb3ae769b5d254851dcaba2b961058a4856))
* **DASH:** Fix seeking on multiperiod content after variant change ([#5110](https://github.com/shaka-project/shaka-player/issues/5110)) ([860b975](https://github.com/shaka-project/shaka-player/commit/860b97545bb01e93aa0c5ed7ecae06d3d9d554af))
* don't use navigator.connection event listener if it isn't implemented ([#5157](https://github.com/shaka-project/shaka-player/issues/5157)) ([7d8b867](https://github.com/shaka-project/shaka-player/commit/7d8b8678dbd7febe73d049b5744145c534f52e42)), closes [#4542](https://github.com/shaka-project/shaka-player/issues/4542)
* Fix fetch plugin with old implementations ([#5091](https://github.com/shaka-project/shaka-player/issues/5091)) ([6333d49](https://github.com/shaka-project/shaka-player/commit/6333d49ee785fde20e88917d251937d0f3abff5b))
* Fix handling of CC when switching between codecs ([#5160](https://github.com/shaka-project/shaka-player/issues/5160)) ([9c3353c](https://github.com/shaka-project/shaka-player/commit/9c3353cc7bf78d22addfeb20a07bda41b61ac3ab))
* Fix HEAD request exception ([#5194](https://github.com/shaka-project/shaka-player/issues/5194)) ([326137a](https://github.com/shaka-project/shaka-player/commit/326137a936a7fe24ab3ecf0c38569cbfa7d631dd)), closes [#5164](https://github.com/shaka-project/shaka-player/issues/5164)
* Fix missing originalUri in response filters ([#5114](https://github.com/shaka-project/shaka-player/issues/5114)) ([f9c72fe](https://github.com/shaka-project/shaka-player/commit/f9c72fe45ddc6933f7599dd611b5f4434ad7fc39))
* Fix race that allows multiple text streams to be loaded ([#5129](https://github.com/shaka-project/shaka-player/issues/5129)) ([6f695d2](https://github.com/shaka-project/shaka-player/commit/6f695d2ef97f6cea05b222c25c73b01fccefd941))
* Fix selectVariantsByLabel using src= ([#5154](https://github.com/shaka-project/shaka-player/issues/5154)) ([537591d](https://github.com/shaka-project/shaka-player/commit/537591d262476be03c2ae091004a4bb7e005608b))
* Handle empty media segments for Mp4VttParser ([#5131](https://github.com/shaka-project/shaka-player/issues/5131)) ([123d476](https://github.com/shaka-project/shaka-player/commit/123d476346a045da75d9527d2cbab4b882d57283)), closes [#4429](https://github.com/shaka-project/shaka-player/issues/4429)
* **HLS:** Adding support for DTS Express in HLS fMP4 ([#5112](https://github.com/shaka-project/shaka-player/issues/5112)) ([#5117](https://github.com/shaka-project/shaka-player/issues/5117)) ([1e577d4](https://github.com/shaka-project/shaka-player/commit/1e577d42cebe86100c3be94b478c341c83ece63a))
* **HLS:** preserve discontinuitySequence in SegmentIndex#fit ([#5066](https://github.com/shaka-project/shaka-player/issues/5066)) ([ad484a3](https://github.com/shaka-project/shaka-player/commit/ad484a308258869abf7436cb5f8168a5e28dd649))
* **logging:** Simplify log code. ([#5050](https://github.com/shaka-project/shaka-player/issues/5050)) ([7f9f26c](https://github.com/shaka-project/shaka-player/commit/7f9f26c00f2c997d63cd8399fb75c289040d8d00)), closes [#5032](https://github.com/shaka-project/shaka-player/issues/5032)
* **net:** Fix HEAD requests in new Chromium ([#5180](https://github.com/shaka-project/shaka-player/issues/5180)) ([1383d6f](https://github.com/shaka-project/shaka-player/commit/1383d6fc5bd2ac6d9f31952f6fb9e0ce9d740179)), closes [#5164](https://github.com/shaka-project/shaka-player/issues/5164)
* PERIOD_FLATTENING_FAILED error with shaka 4.2.x that did not occur with shaka 3.1.2 ([#5188](https://github.com/shaka-project/shaka-player/issues/5188)) ([e26d19e](https://github.com/shaka-project/shaka-player/commit/e26d19e8ad1110f4251983e6d54585df886a1f38)), closes [#5183](https://github.com/shaka-project/shaka-player/issues/5183)
* Prevent bad calls to MediaSource.endOfStream ([#5071](https://github.com/shaka-project/shaka-player/issues/5071)) ([bae961b](https://github.com/shaka-project/shaka-player/commit/bae961baf97d3db713c45d3488d50a6d6ca52de6)), closes [#5070](https://github.com/shaka-project/shaka-player/issues/5070)
* prevent memory leak in SimpleAbrManager while destroying ([#5149](https://github.com/shaka-project/shaka-player/issues/5149)) ([3f85d0c](https://github.com/shaka-project/shaka-player/commit/3f85d0ce7a18bb1df6e70d24183f392dbac1d9eb))
* Tizen video error fixed by checking the extended MIME type ([#4973](https://github.com/shaka-project/shaka-player/issues/4973)) ([f53e9e9](https://github.com/shaka-project/shaka-player/commit/f53e9e9aff8f4b8c5ca2bd8157ad325d5e415e80)), closes [#4634](https://github.com/shaka-project/shaka-player/issues/4634)
* **Tizen:** Fix exceptions thrown from logging methods ([#5063](https://github.com/shaka-project/shaka-player/issues/5063)) ([3109994](https://github.com/shaka-project/shaka-player/commit/310999423dd3553b08756c58e83256faf55be837))

## [4.2.9](https://github.com/shaka-project/shaka-player/compare/v4.2.8...v4.2.9) (2023-03-01)


### Bug Fixes

* **Ads:** Fix CS volume ad ([#5016](https://github.com/shaka-project/shaka-player/issues/5016)) ([70406d0](https://github.com/shaka-project/shaka-player/commit/70406d01f74ef213d1cbd396d9389f91374988af))
* **Ads:** Fix usage of EventManager on CS ([#5017](https://github.com/shaka-project/shaka-player/issues/5017)) ([4aa25c6](https://github.com/shaka-project/shaka-player/commit/4aa25c6cefa8ebc9f9253873efdfa5eff87475cd))
* **ads:** Fix VMAP ads stay muted on muted autoplay ([#4995](https://github.com/shaka-project/shaka-player/issues/4995)) ([c80c0bc](https://github.com/shaka-project/shaka-player/commit/c80c0bc9cc89cca1742e9820089b985b0aa1b2f0))
* Allow the playback of TS without mux.js ([#5041](https://github.com/shaka-project/shaka-player/issues/5041)) ([8a55a25](https://github.com/shaka-project/shaka-player/commit/8a55a252f5b6e29e4e6278772c6591116d43fdd3))
* Caption can not turn off at iOS Safari ([#4978](https://github.com/shaka-project/shaka-player/issues/4978)) ([0408c91](https://github.com/shaka-project/shaka-player/commit/0408c9166487ee444d48234846f527a60cf23a7b))
* **Demo:** Allow manifest type for DAI custom assets ([#4977](https://github.com/shaka-project/shaka-player/issues/4977)) ([ea1ab66](https://github.com/shaka-project/shaka-player/commit/ea1ab66f484878cc97c70aeabbf6b22562204ed5))
* DrmEngine exception thrown when using FairPlay ([#4971](https://github.com/shaka-project/shaka-player/issues/4971)) ([36aab19](https://github.com/shaka-project/shaka-player/commit/36aab19c416d58aae05c5daf8ff229e80184e14f))
* Failed to set 'currentTime' property on 'HTMLMediaElement' on a Hisense TV ([#4962](https://github.com/shaka-project/shaka-player/issues/4962)) ([b753933](https://github.com/shaka-project/shaka-player/commit/b753933c76d6796cc734984d4a75c207aee71316))
* Fallback to isTypeSupported when cast namespace is undefined ([#5012](https://github.com/shaka-project/shaka-player/issues/5012)) ([eff0b41](https://github.com/shaka-project/shaka-player/commit/eff0b411b11ed70717e5c9aac526afd9e8a0535f))
* Fix video/mp2t mimetype conversion. ([#5039](https://github.com/shaka-project/shaka-player/issues/5039)) ([d41602e](https://github.com/shaka-project/shaka-player/commit/d41602e278ef91216bf0d7b1424d057292d2d861))
* **HLS:** Add `.tsa` and .`tsv` file extensions as valid MPEG2-TS. ([#5034](https://github.com/shaka-project/shaka-player/issues/5034)) ([c72c5f6](https://github.com/shaka-project/shaka-player/commit/c72c5f65d6cc686520eda786ded2bf587ba68c6d))
* Increase IndexedDB timeout ([#4984](https://github.com/shaka-project/shaka-player/issues/4984)) ([f2d681e](https://github.com/shaka-project/shaka-player/commit/f2d681e0957b86ca341895dbcf1bdcb7cc3ecfbd))
* **MCap:** Remove robustness when robustness value is default ([#4953](https://github.com/shaka-project/shaka-player/issues/4953)) ([59bbb56](https://github.com/shaka-project/shaka-player/commit/59bbb5662dacca93b7b8becb50d1d4c4140ba516))
* Prevent content from being restarted after Postroll ads ([#4979](https://github.com/shaka-project/shaka-player/issues/4979)) ([a907a4f](https://github.com/shaka-project/shaka-player/commit/a907a4f98c0d2a5d59c71efb77b228bff5689763)), closes [#4445](https://github.com/shaka-project/shaka-player/issues/4445)
* Reject TS content on Edge ([#5043](https://github.com/shaka-project/shaka-player/issues/5043)) ([99fb4bb](https://github.com/shaka-project/shaka-player/commit/99fb4bb13c89f38dc43df0833e32a78705d42361))
* **VTT:** Fix spacing between text lines ([#4961](https://github.com/shaka-project/shaka-player/issues/4961)) ([2bf8526](https://github.com/shaka-project/shaka-player/commit/2bf8526d6f626d7c002f97475e7ff23c2519e014))
* **WebVTT:** Tags in the WebVTT subtitle are not parsed ([#4960](https://github.com/shaka-project/shaka-player/issues/4960)) ([933ee78](https://github.com/shaka-project/shaka-player/commit/933ee7801d921d8ea2430ba3919ffb9ac2dd8ca2))

## [4.2.8](https://github.com/shaka-project/shaka-player/compare/v4.2.7...v4.2.8) (2023-01-31)


### Bug Fixes

* Add mux.js to support.html ([#4923](https://github.com/shaka-project/shaka-player/issues/4923)) ([4c46595](https://github.com/shaka-project/shaka-player/commit/4c46595ed6dd087cae22a8f26efcb77f125f3ec5))
* **DASH:** Fix dynamic manifests from edgeware ([#4914](https://github.com/shaka-project/shaka-player/issues/4914)) ([247229b](https://github.com/shaka-project/shaka-player/commit/247229b7ea996b4eb43dc09d68fe212f4705045b))
* Fix MediaCapabilities polyfill on Hisense ([#4927](https://github.com/shaka-project/shaka-player/issues/4927)) ([8b694f0](https://github.com/shaka-project/shaka-player/commit/8b694f051a2119a6dc4d27cf9fbe3b51a1a12e41))
* Fix WebVTT parser failure on REGION blocks ([#4915](https://github.com/shaka-project/shaka-player/issues/4915)) ([39ba2e8](https://github.com/shaka-project/shaka-player/commit/39ba2e83a291f115972f9e0348621535bafdb794))
* **HLS:** Fix detection of WebVTT subtitles in HLS by extension ([#4928](https://github.com/shaka-project/shaka-player/issues/4928)) ([b0eb356](https://github.com/shaka-project/shaka-player/commit/b0eb356c6e528171a6134ed16ad223c86238267f)), closes [#4929](https://github.com/shaka-project/shaka-player/issues/4929)
* **VTT:** Fix combining style selectors ([#4934](https://github.com/shaka-project/shaka-player/issues/4934)) ([c036c53](https://github.com/shaka-project/shaka-player/commit/c036c53b2e86e99adeb8c9f583e8952e47a2a680))
* **WebVTT:** Add support to &nbsp;, &lrm; and &rlm; ([#4920](https://github.com/shaka-project/shaka-player/issues/4920)) ([3fa6ff0](https://github.com/shaka-project/shaka-player/commit/3fa6ff0cb36c24b98f5f40fecc52be197ffc1410))
* **WebVTT:** Add support to voice tag styles ([#4845](https://github.com/shaka-project/shaka-player/issues/4845)) ([e8465a2](https://github.com/shaka-project/shaka-player/commit/e8465a2e1c1999d1b2bae3cc2819f8a2666bf7c6))
* **WebVTT:** Fix horizontal positioning with cue box size ([#4949](https://github.com/shaka-project/shaka-player/issues/4949)) ([74d399d](https://github.com/shaka-project/shaka-player/commit/74d399d6bf5fe3029fc37f8f3a783a16606fe8db))
* **WebVTT:** Fix voices with styles and support to multiple styles ([#4922](https://github.com/shaka-project/shaka-player/issues/4922)) ([355a59f](https://github.com/shaka-project/shaka-player/commit/355a59f76da96c78e0aef4eef5e6de2f5e0ff2b6))

## [4.2.7](https://github.com/shaka-project/shaka-player/compare/v4.2.6...v4.2.7) (2023-01-13)


### Bug Fixes

* Fix exception enabling captions on HLS ([#4894](https://github.com/shaka-project/shaka-player/issues/4894)) ([45b3705](https://github.com/shaka-project/shaka-player/commit/45b37053e0a28ba0f4ee3ca09f8e35e1734caec4)), closes [#4889](https://github.com/shaka-project/shaka-player/issues/4889)
* Fix flattenedCues in WebVttGenerator ([#4867](https://github.com/shaka-project/shaka-player/issues/4867)) ([2b37820](https://github.com/shaka-project/shaka-player/commit/2b37820fecf23ba8876200cb80626d5454d90b3d))
* Fix legacy codec support by rewriting codec metadata ([#4858](https://github.com/shaka-project/shaka-player/issues/4858)) ([102c3d9](https://github.com/shaka-project/shaka-player/commit/102c3d902fba987c66c94f1d698ba28bcc0d9203))
* Fix media source duration when using sequence mode ([#4848](https://github.com/shaka-project/shaka-player/issues/4848)) ([177638c](https://github.com/shaka-project/shaka-player/commit/177638c0e47fb4e6461beefbc3164055f6a47e4b))
* Fix parsing error on Chromecast when resyncing HLS ([#4869](https://github.com/shaka-project/shaka-player/issues/4869)) ([13e7481](https://github.com/shaka-project/shaka-player/commit/13e7481915fb81430c3566ca91dffa9c13f32412)), closes [#4589](https://github.com/shaka-project/shaka-player/issues/4589)
* Fix potential AV sync issues after seek or adaptation ([#4886](https://github.com/shaka-project/shaka-player/issues/4886)) ([ac3afb4](https://github.com/shaka-project/shaka-player/commit/ac3afb45c4727abae9ca075597c82bc2a5f24754)), closes [#4589](https://github.com/shaka-project/shaka-player/issues/4589)
* Fix potential duplicate segments, AV sync issues ([#4884](https://github.com/shaka-project/shaka-player/issues/4884)) ([45b6ccb](https://github.com/shaka-project/shaka-player/commit/45b6ccb96d56ca9338ec7cd458abed0f1702f673)), closes [#4589](https://github.com/shaka-project/shaka-player/issues/4589)
* **HLS:** Fix discontinuity tracking ([#4881](https://github.com/shaka-project/shaka-player/issues/4881)) ([13d29fd](https://github.com/shaka-project/shaka-player/commit/13d29fd06d7cbf14241ea2507114ff34daeb760e)), closes [#4589](https://github.com/shaka-project/shaka-player/issues/4589)
* **HLS:** Fix support for mixed AES-128/NONE decryption ([#4847](https://github.com/shaka-project/shaka-player/issues/4847)) ([e866903](https://github.com/shaka-project/shaka-player/commit/e866903a845f375cc0a00ee2d2dd1419faaa6e4b))
* Make encoding problem detection more robust ([#4885](https://github.com/shaka-project/shaka-player/issues/4885)) ([208c2e2](https://github.com/shaka-project/shaka-player/commit/208c2e298fc53a83fa6842c0a754b6a82c817fdb)), closes [#4589](https://github.com/shaka-project/shaka-player/issues/4589)
* Release region timeline when unloading ([#4871](https://github.com/shaka-project/shaka-player/issues/4871)) ([af1ee47](https://github.com/shaka-project/shaka-player/commit/af1ee4719016f4bfbaa56e3d1ebfea88b90057bc)), closes [#4850](https://github.com/shaka-project/shaka-player/issues/4850)
* Sync each segment against EXT-X-PROGRAM-DATE-TIME ([#4870](https://github.com/shaka-project/shaka-player/issues/4870)) ([fadbeb6](https://github.com/shaka-project/shaka-player/commit/fadbeb64f5d31bcacc4872a2dad412bb1b776f73))
* Treat regions uniquely ([#4841](https://github.com/shaka-project/shaka-player/issues/4841)) ([7952af9](https://github.com/shaka-project/shaka-player/commit/7952af90bf0482a4fcb43520f42cc21bcca79081)), closes [#4839](https://github.com/shaka-project/shaka-player/issues/4839)
* **ui:** Avoid submitting form if player is inside form ([#4866](https://github.com/shaka-project/shaka-player/issues/4866)) ([c7db48a](https://github.com/shaka-project/shaka-player/commit/c7db48a3070a7bfe69623752ac90a290b75e2b05)), closes [#4861](https://github.com/shaka-project/shaka-player/issues/4861)

## [4.2.6](https://github.com/shaka-project/shaka-player/compare/v4.2.5...v4.2.6) (2022-12-14)


### Bug Fixes

* **chapters:** removed duplicate chapters by id ([#4810](https://github.com/shaka-project/shaka-player/issues/4810)) ([50b7c91](https://github.com/shaka-project/shaka-player/commit/50b7c910f8381c035c061c0c58667b6c4be557b8))
* Fix duplicate updates in StreamingEngine ([#4840](https://github.com/shaka-project/shaka-player/issues/4840)) ([bb25ff8](https://github.com/shaka-project/shaka-player/commit/bb25ff876b4cb48df98d8f7d033a79a9026b2cdf)), closes [#4831](https://github.com/shaka-project/shaka-player/issues/4831)
* Fix rare exception after StreamingEngine teardown ([#4830](https://github.com/shaka-project/shaka-player/issues/4830)) ([e0f513e](https://github.com/shaka-project/shaka-player/commit/e0f513e7fec1c497ad1ef0135f700488dd9a6473)), closes [#4813](https://github.com/shaka-project/shaka-player/issues/4813)
* **HLS:** Fix AV sync over ad boundaries ([#4824](https://github.com/shaka-project/shaka-player/issues/4824)) ([12cbf96](https://github.com/shaka-project/shaka-player/commit/12cbf96734ba421adb00a5875e96d3a442363cf3)), closes [#4589](https://github.com/shaka-project/shaka-player/issues/4589)
* **UI:** Suppress error log from fullscreen button on desktop ([#4823](https://github.com/shaka-project/shaka-player/issues/4823)) ([6d5f112](https://github.com/shaka-project/shaka-player/commit/6d5f1124ad56e74f61aacb68bb9161bfd5bc192a)), closes [#4822](https://github.com/shaka-project/shaka-player/issues/4822)

## [4.2.5](https://github.com/shaka-project/shaka-player/compare/v4.2.4...v4.2.5) (2022-12-08)


### Bug Fixes

* 4676 - Virgin Media set top box is incorrectly categorized as Apple/Safari ([#4678](https://github.com/shaka-project/shaka-player/issues/4678)) ([fe1c3d8](https://github.com/shaka-project/shaka-player/commit/fe1c3d821bc38abfe945ac7afb7278a564174b12)), closes [#4676](https://github.com/shaka-project/shaka-player/issues/4676)
* **cast:** Use cast platform APIs in MediaCapabilties polyfill ([#4727](https://github.com/shaka-project/shaka-player/issues/4727)) ([6f3b2da](https://github.com/shaka-project/shaka-player/commit/6f3b2dab5f8e488305c30cb644ca44ad835d593b))
* **cea:** Fix MAX_ROWS in CEA-708 window ([#4757](https://github.com/shaka-project/shaka-player/issues/4757)) ([05d959b](https://github.com/shaka-project/shaka-player/commit/05d959b0ef36cfa4c4a512143ffde506a20de914))
* Correct default initDataTransform for legacy Apple Media Keys ([#4797](https://github.com/shaka-project/shaka-player/issues/4797)) ([6eed72f](https://github.com/shaka-project/shaka-player/commit/6eed72fd84ca0f7971b01db39a411c544d022c8f))
* Fix bufferBehind setting broken by image segments ([#4718](https://github.com/shaka-project/shaka-player/issues/4718)) ([2987451](https://github.com/shaka-project/shaka-player/commit/298745149efc9608938aa133a354c7f2133609e0)), closes [#4717](https://github.com/shaka-project/shaka-player/issues/4717)
* Fix DRM workaround for Tizen and Xbox with hvc1/hev1 boxes ([#4743](https://github.com/shaka-project/shaka-player/issues/4743)) ([6e6a15f](https://github.com/shaka-project/shaka-player/commit/6e6a15f42aa0bfeb71b2fc426824280712d29360)), closes [#4742](https://github.com/shaka-project/shaka-player/issues/4742)
* Fix subtitles not added to DOM region ([#4733](https://github.com/shaka-project/shaka-player/issues/4733)) ([c7cb175](https://github.com/shaka-project/shaka-player/commit/c7cb17501d71c1d2ea7e50897b07cb57a87e60b6)), closes [#4680](https://github.com/shaka-project/shaka-player/issues/4680)
* Fix usage of WebCrypto in old browsers ([#4711](https://github.com/shaka-project/shaka-player/issues/4711)) ([9934cd7](https://github.com/shaka-project/shaka-player/commit/9934cd7be4e5f00e7da58ee667a10236ada8af25))
* **HLS:** Fix lowLatencyPresentationDelay when using autoLowLatencyMode ([#4712](https://github.com/shaka-project/shaka-player/issues/4712)) ([c4ef744](https://github.com/shaka-project/shaka-player/commit/c4ef7441ecda7b68d0dede2fd4782d8d25116518))
* **HLS:** Fix support legacy AVC1 codec used in HLS ([#4716](https://github.com/shaka-project/shaka-player/issues/4716)) ([e34e380](https://github.com/shaka-project/shaka-player/commit/e34e3809d2eb34ccc5e5c940fb5cd0137619fb5a))
* **HLS:** Single alternative video renditions not working ([#4785](https://github.com/shaka-project/shaka-player/issues/4785)) ([655d080](https://github.com/shaka-project/shaka-player/commit/655d08016231a2aa9b8860f6e963ab586aec023a))
* Polyfill missing AbortController on Tizen ([#4707](https://github.com/shaka-project/shaka-player/issues/4707)) ([eae487d](https://github.com/shaka-project/shaka-player/commit/eae487dd11c188ef740c8e36bc55462c86cc173a))
* **TTML:** Add font-family mapping ([#4801](https://github.com/shaka-project/shaka-player/issues/4801)) ([9262f92](https://github.com/shaka-project/shaka-player/commit/9262f921b7601f230bfd2ec854c80dd25fc2a36e))
* **TTML:** Fix duplicate cues overlapping segment boundaries ([#4798](https://github.com/shaka-project/shaka-player/issues/4798)) ([7aa3e5d](https://github.com/shaka-project/shaka-player/commit/7aa3e5d656d4dec1cace286cc54009dd4d79eff7)), closes [#4631](https://github.com/shaka-project/shaka-player/issues/4631)
* **ui:** Check event cancelable before event.preventDefault ([#4690](https://github.com/shaka-project/shaka-player/issues/4690)) ([9d90919](https://github.com/shaka-project/shaka-player/commit/9d90919dd29d0d0b8299d416b1039dabcc91608c))
* **ui:** Fix iOS fullscreen on rotation ([#4679](https://github.com/shaka-project/shaka-player/issues/4679)) ([04051fd](https://github.com/shaka-project/shaka-player/commit/04051fdcd5faaf1303e2875b4de7225e2534938e))
* Update v4.2 receiver app ID ([56466dc](https://github.com/shaka-project/shaka-player/commit/56466dce484e5ced69eddeb0c62c68615f4ed8d3))
* WebVTT line not correctly positioned in UITextDisplayer ([#4567](https://github.com/shaka-project/shaka-player/issues/4567)) ([#4682](https://github.com/shaka-project/shaka-player/issues/4682)) ([e9e6c94](https://github.com/shaka-project/shaka-player/commit/e9e6c945a31c9dfa84e4890606c606fa9346ef9e))

## [4.2.4](https://github.com/shaka-project/shaka-player/compare/v4.2.3...v4.2.4) (2022-11-09)


### Bug Fixes

* Allow overriding special handling of 404s ([#4635](https://github.com/shaka-project/shaka-player/issues/4635)) ([bf3e4e8](https://github.com/shaka-project/shaka-player/commit/bf3e4e8967ab938c95861d3f02eb1bcf76722a5c)), closes [#4548](https://github.com/shaka-project/shaka-player/issues/4548)
* **cast:** Reduce size of Cast update messages ([#4644](https://github.com/shaka-project/shaka-player/issues/4644)) ([2ee9803](https://github.com/shaka-project/shaka-player/commit/2ee9803f295bbdf7911740c4b5f35b81e8a7488c))
* Content reload starttime with HLS on iOS ([#4575](https://github.com/shaka-project/shaka-player/issues/4575)) ([f02e25a](https://github.com/shaka-project/shaka-player/commit/f02e25af91eeb18939f16460702b8f9ec226b54c)), closes [#4244](https://github.com/shaka-project/shaka-player/issues/4244)
* embed cc not shown when seeking back ([#4643](https://github.com/shaka-project/shaka-player/issues/4643)) ([3743fe8](https://github.com/shaka-project/shaka-player/commit/3743fe8ab70ce8bebd46ff4a667ddce188ec49c6)), closes [#4641](https://github.com/shaka-project/shaka-player/issues/4641)
* Fix detection of ac4, dts, and dolby h265 ([#4657](https://github.com/shaka-project/shaka-player/issues/4657)) ([9da2b47](https://github.com/shaka-project/shaka-player/commit/9da2b47deba36f4c50fed10c859f46a432e20576))
* focus on first element when back to the settings menu ([#4653](https://github.com/shaka-project/shaka-player/issues/4653)) ([f507c89](https://github.com/shaka-project/shaka-player/commit/f507c89bf63b0ec5b7802cd31ac3f3cca05ff237)), closes [#4652](https://github.com/shaka-project/shaka-player/issues/4652)
* **HLS:** Fix detection of WebVTT subtitles in HLS by extension ([#4663](https://github.com/shaka-project/shaka-player/issues/4663)) ([731bd96](https://github.com/shaka-project/shaka-player/commit/731bd96644cbbd3fa39992fd62a4ae6de8389e74))
* **HLS:** Infer missing codecs from config ([#4656](https://github.com/shaka-project/shaka-player/issues/4656)) ([507d96e](https://github.com/shaka-project/shaka-player/commit/507d96e74239973fb904d6ade4615ac8888a9d57))
* **ui:** Fix exception on screen rotation if fullscreen is not supported ([#4669](https://github.com/shaka-project/shaka-player/issues/4669)) ([6c54db9](https://github.com/shaka-project/shaka-player/commit/6c54db91e03c4ff4a2c073b45dcb05e8591295d0))

## [4.2.3](https://github.com/shaka-project/shaka-player/compare/v4.2.2...v4.2.3) (2022-10-29)


### Bug Fixes

* **ads:** Fix IMA crash when autoplay is rejected ([#4518](https://github.com/shaka-project/shaka-player/issues/4518)) ([871a3c0](https://github.com/shaka-project/shaka-player/commit/871a3c0315a2965c91ebdde9815c7f6c5e0a59de)), closes [#4179](https://github.com/shaka-project/shaka-player/issues/4179)
* Fix HLS live stream subtitle offsets ([#4586](https://github.com/shaka-project/shaka-player/issues/4586)) ([ec0b4dc](https://github.com/shaka-project/shaka-player/commit/ec0b4dcb0e288ceb1a01874db99063ef54fb3e47))
* Fix multi-period DASH with descriptive audio ([#4629](https://github.com/shaka-project/shaka-player/issues/4629)) ([0e70b87](https://github.com/shaka-project/shaka-player/commit/0e70b874cf8558207b0620516c5608c6a201018d)), closes [#4500](https://github.com/shaka-project/shaka-player/issues/4500)
* fix support clear and encrypted periods ([#4606](https://github.com/shaka-project/shaka-player/issues/4606)) ([8ece8ea](https://github.com/shaka-project/shaka-player/commit/8ece8ea225fb8b9ec9027dacef0865cceb3fd93b))
* Force using mcap polyfill on EOS browsers ([#4630](https://github.com/shaka-project/shaka-player/issues/4630)) ([6b9f806](https://github.com/shaka-project/shaka-player/commit/6b9f806df54cc7b8761ef1683cefe5ed8d576a03))
* **hls:** Fix raw format detection when the main playlist hasn't type ([#4583](https://github.com/shaka-project/shaka-player/issues/4583)) ([4053088](https://github.com/shaka-project/shaka-player/commit/4053088847eff6d7ddb7a969701fa881f6e90e8a))
* Limit key ids to 32 characters ([#4614](https://github.com/shaka-project/shaka-player/issues/4614)) ([6fc1455](https://github.com/shaka-project/shaka-player/commit/6fc145584ffc0798a6e97c5672409b1e1613f164))
* Make XML parsing secure ([#4598](https://github.com/shaka-project/shaka-player/issues/4598)) ([2e45696](https://github.com/shaka-project/shaka-player/commit/2e45696c10f3c2199a372a7a5f311579e627cd8e))
* **offline:** Add storage muxer init timeout ([#4566](https://github.com/shaka-project/shaka-player/issues/4566)) ([6022907](https://github.com/shaka-project/shaka-player/commit/6022907df5e3a18b552a49e537d2c1daeebbc2c6))
* **playhead:** Safeguard getStallsDetected as stallDetector can be null ([#4581](https://github.com/shaka-project/shaka-player/issues/4581)) ([c4ee14f](https://github.com/shaka-project/shaka-player/commit/c4ee14f2abcdd83b21e64230b67ab121c1db037e))
* Resolve load failures for TS-based content on Android-based Cast devices ([#4569](https://github.com/shaka-project/shaka-player/issues/4569)). ([#4570](https://github.com/shaka-project/shaka-player/issues/4570)) ([4a4f48d](https://github.com/shaka-project/shaka-player/commit/4a4f48d2cac726e2a5a1d4e51e89f0b854e281ef))

## [4.2.2](https://github.com/shaka-project/shaka-player/compare/v4.2.1...v4.2.2) (2022-10-07)


### Bug Fixes

* allow build without text ([#4506](https://github.com/shaka-project/shaka-player/issues/4506)) ([7e93720](https://github.com/shaka-project/shaka-player/commit/7e9372097567d8d0f93c04e241fb917945da05bf))
* allow the playback on platforms when low latency APIs are not supported ([#4485](https://github.com/shaka-project/shaka-player/issues/4485)) ([cf8c857](https://github.com/shaka-project/shaka-player/commit/cf8c857e58f041e24373e8b4f7d560287197cf13))
* check for negative rows before moving ([#4510](https://github.com/shaka-project/shaka-player/issues/4510)) ([23f39d7](https://github.com/shaka-project/shaka-player/commit/23f39d7393c771440fc76ac9016b166d658710b2)), closes [#4508](https://github.com/shaka-project/shaka-player/issues/4508)
* Filter unsupported H.264 streams in Xbox ([#4493](https://github.com/shaka-project/shaka-player/issues/4493)) ([914a08a](https://github.com/shaka-project/shaka-player/commit/914a08a4d08bed284a072aed52b0bf8fcbdc6986))
* Fix choppy HLS startup ([#4553](https://github.com/shaka-project/shaka-player/issues/4553)) ([950ce69](https://github.com/shaka-project/shaka-player/commit/950ce699a06bb9e7668b431f4f08052c005f2e8a)), closes [#4516](https://github.com/shaka-project/shaka-player/issues/4516)
* Fix errors with TS segments on Chromecast ([#4543](https://github.com/shaka-project/shaka-player/issues/4543)) ([8204db6](https://github.com/shaka-project/shaka-player/commit/8204db6ebc152cb01c36db941ca60bc82ccbe443))
* Fix hang when seeking to the last segment ([#4537](https://github.com/shaka-project/shaka-player/issues/4537)) ([3d6c768](https://github.com/shaka-project/shaka-player/commit/3d6c768cb302de42138aec8fdf51dff8317c5607))
* Fix HLS dynamic to static transition ([d9ecbf3](https://github.com/shaka-project/shaka-player/commit/d9ecbf3fccb886e10a491c43e05e681fe2103a2d))
* Fix HLS dynamic to static transition ([#4483](https://github.com/shaka-project/shaka-player/issues/4483)) ([d9ecbf3](https://github.com/shaka-project/shaka-player/commit/d9ecbf3fccb886e10a491c43e05e681fe2103a2d)), closes [#4431](https://github.com/shaka-project/shaka-player/issues/4431)
* Fix in-band key rotation on Xbox One ([#4478](https://github.com/shaka-project/shaka-player/issues/4478)) ([bc0a588](https://github.com/shaka-project/shaka-player/commit/bc0a588676828eb68bdca62efe52cb503feb947d)), closes [#4401](https://github.com/shaka-project/shaka-player/issues/4401)
* Missing AES-128 key of last HLS segment ([#4519](https://github.com/shaka-project/shaka-player/issues/4519)) ([2c2677f](https://github.com/shaka-project/shaka-player/commit/2c2677fe7af10e1280ea8253b90ef6527bdcbbc0)), closes [#4517](https://github.com/shaka-project/shaka-player/issues/4517)
* Respect existing app usage of Cast SDK ([#4523](https://github.com/shaka-project/shaka-player/issues/4523)) ([3db2568](https://github.com/shaka-project/shaka-player/commit/3db2568508cfc827fd9efc644096a45220eb617b)), closes [#4521](https://github.com/shaka-project/shaka-player/issues/4521)
* **ttml:** Default TTML background color to transparent if unspecified ([#4496](https://github.com/shaka-project/shaka-player/issues/4496)) ([0b5c985](https://github.com/shaka-project/shaka-player/commit/0b5c9853a6a39cb24ab1270598bf34d2ac1eacf0)), closes [#4468](https://github.com/shaka-project/shaka-player/issues/4468)

## [4.2.1](https://github.com/shaka-project/shaka-player/compare/v4.2.0...v4.2.1) (2022-08-31)


### Bug Fixes

* Fix bitmap-based cue size ([#4453](https://github.com/shaka-project/shaka-player/issues/4453)) ([6329cf2](https://github.com/shaka-project/shaka-player/commit/6329cf25b1a3265361e50386d48b0438e294536e))
* Fix drm.keySystemsMapping config ([#4425](https://github.com/shaka-project/shaka-player/issues/4425)) ([40235ef](https://github.com/shaka-project/shaka-player/commit/40235ef4f7675a853daf315d4c089ad7be7b2188)), closes [#4422](https://github.com/shaka-project/shaka-player/issues/4422)
* Fix vanishing tracks while offline ([#4426](https://github.com/shaka-project/shaka-player/issues/4426)) ([d668790](https://github.com/shaka-project/shaka-player/commit/d668790f5b9eef990a190128bd11972204e98480)), closes [#4408](https://github.com/shaka-project/shaka-player/issues/4408)
* return width and height in the stats when we are using src= ([#4435](https://github.com/shaka-project/shaka-player/issues/4435)) ([aad8769](https://github.com/shaka-project/shaka-player/commit/aad8769807bcf58b2bc5c6298e9a10f428c73806))
* **UI:** Ad position and ad counter are too close to each other ([#4416](https://github.com/shaka-project/shaka-player/issues/4416)) ([a7333a5](https://github.com/shaka-project/shaka-player/commit/a7333a560aae4c8f915b3546ecc4e34dc501c5f2))

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


## Older changelogs:
 - [v3.3.x](https://github.com/shaka-project/shaka-player/blob/v3.3.x/CHANGELOG.md)
 - [v3.2.x](https://github.com/shaka-project/shaka-player/blob/v3.2.x/CHANGELOG.md)
 - [v3.1.x](https://github.com/shaka-project/shaka-player/blob/v3.1.x/CHANGELOG.md)
 - [v3.0.x](https://github.com/shaka-project/shaka-player/blob/v3.0.x/CHANGELOG.md)
 - [ancient](https://github.com/shaka-project/shaka-player/blob/v2.5.x/CHANGELOG.md)
