# Changelog

## [4.1.7](https://github.com/shaka-project/shaka-player/compare/v4.1.6...v4.1.7) (2022-11-09)


### Bug Fixes

* Allow overriding special handling of 404s ([#4635](https://github.com/shaka-project/shaka-player/issues/4635)) ([ad2bffc](https://github.com/shaka-project/shaka-player/commit/ad2bffc798946f4ebe97154a53e74582a71bc886)), closes [#4548](https://github.com/shaka-project/shaka-player/issues/4548)
* **cast:** Reduce size of Cast update messages ([#4644](https://github.com/shaka-project/shaka-player/issues/4644)) ([687f92c](https://github.com/shaka-project/shaka-player/commit/687f92c50c4cd913d3fc556ec1468a15b27ec257))
* Content reload starttime with HLS on iOS ([#4575](https://github.com/shaka-project/shaka-player/issues/4575)) ([fe28e26](https://github.com/shaka-project/shaka-player/commit/fe28e26e7cca7cf53d8159e3a82cab344471968d)), closes [#4244](https://github.com/shaka-project/shaka-player/issues/4244)
* embed cc not shown when seeking back ([#4643](https://github.com/shaka-project/shaka-player/issues/4643)) ([c514d15](https://github.com/shaka-project/shaka-player/commit/c514d15ddfe4892443b99491b3f932ba94c6609d)), closes [#4641](https://github.com/shaka-project/shaka-player/issues/4641)
* Fix detection of ac4, dts, and dolby h265 ([#4657](https://github.com/shaka-project/shaka-player/issues/4657)) ([4018805](https://github.com/shaka-project/shaka-player/commit/40188056c9b45d41aec7ce3ac7aee82d207cc76e))
* focus on first element when back to the settings menu ([#4653](https://github.com/shaka-project/shaka-player/issues/4653)) ([fa920d8](https://github.com/shaka-project/shaka-player/commit/fa920d8154cf1254a67989d473d4ff4cc9cc006c)), closes [#4652](https://github.com/shaka-project/shaka-player/issues/4652)
* **HLS:** Fix detection of WebVTT subtitles in HLS by extension ([#4663](https://github.com/shaka-project/shaka-player/issues/4663)) ([2b02e23](https://github.com/shaka-project/shaka-player/commit/2b02e231390f90325bb7ffce88c499512b3bc541))
* **HLS:** Infer missing codecs from config ([#4656](https://github.com/shaka-project/shaka-player/issues/4656)) ([1104d80](https://github.com/shaka-project/shaka-player/commit/1104d80100bb243e1a47bd093a5cf78dd8a3aadd))
* **ui:** Fix exception on screen rotation if fullscreen is not supported ([#4669](https://github.com/shaka-project/shaka-player/issues/4669)) ([d803363](https://github.com/shaka-project/shaka-player/commit/d803363e0f949c90c8fe1b3258723847c1ddb22d))

## [4.1.6](https://github.com/shaka-project/shaka-player/compare/v4.1.5...v4.1.6) (2022-10-29)


### Bug Fixes

* **ads:** Fix IMA crash when autoplay is rejected ([#4518](https://github.com/shaka-project/shaka-player/issues/4518)) ([0bc2001](https://github.com/shaka-project/shaka-player/commit/0bc2001a5fb8e4ee657f52a2926c91c223058331)), closes [#4179](https://github.com/shaka-project/shaka-player/issues/4179)
* Fix HLS live stream subtitle offsets ([#4586](https://github.com/shaka-project/shaka-player/issues/4586)) ([cf5b978](https://github.com/shaka-project/shaka-player/commit/cf5b9787104b445dbd5e478da60e7f2b4e3e069e))
* Fix multi-period DASH with descriptive audio ([#4629](https://github.com/shaka-project/shaka-player/issues/4629)) ([8cc3704](https://github.com/shaka-project/shaka-player/commit/8cc37045a32fa1884c64ce371f1d0c4c767e3f0e)), closes [#4500](https://github.com/shaka-project/shaka-player/issues/4500)
* fix support clear and encrypted periods ([#4606](https://github.com/shaka-project/shaka-player/issues/4606)) ([4c4b799](https://github.com/shaka-project/shaka-player/commit/4c4b799d45884fd0165e5c45084f2dfe1254562f))
* Force using mcap polyfill on EOS browsers ([#4630](https://github.com/shaka-project/shaka-player/issues/4630)) ([ab865a4](https://github.com/shaka-project/shaka-player/commit/ab865a4e52ffc4b7c98a3dba84c748c259006843))
* **hls:** Fix raw format detection when the main playlist hasn't type ([#4583](https://github.com/shaka-project/shaka-player/issues/4583)) ([c9a835d](https://github.com/shaka-project/shaka-player/commit/c9a835d3e7c3a2512958f887b2bde54dc35c8e05))
* Limit key ids to 32 characters ([#4614](https://github.com/shaka-project/shaka-player/issues/4614)) ([27e996e](https://github.com/shaka-project/shaka-player/commit/27e996ea3f27d3ed8df550859a6a3715d8cb74b8))
* Make XML parsing secure ([#4598](https://github.com/shaka-project/shaka-player/issues/4598)) ([265d56d](https://github.com/shaka-project/shaka-player/commit/265d56d65d51f2b29cafe7e04a630e896a35a168))
* **offline:** Add storage muxer init timeout ([#4566](https://github.com/shaka-project/shaka-player/issues/4566)) ([ac719be](https://github.com/shaka-project/shaka-player/commit/ac719be1ecf5c9694eabb4c33680ee3c04a6be4f))
* **playhead:** Safeguard getStallsDetected as stallDetector can be null ([#4581](https://github.com/shaka-project/shaka-player/issues/4581)) ([5d12efd](https://github.com/shaka-project/shaka-player/commit/5d12efd5105989948f99f8d449a8d0854b18af91))
* Resolve load failures for TS-based content on Android-based Cast devices ([#4569](https://github.com/shaka-project/shaka-player/issues/4569)). ([#4570](https://github.com/shaka-project/shaka-player/issues/4570)) ([d4ea4e7](https://github.com/shaka-project/shaka-player/commit/d4ea4e70eac0a25261d88975e4a1ad27817ebff3))

## [4.1.5](https://github.com/shaka-project/shaka-player/compare/v4.1.4...v4.1.5) (2022-10-07)


### Bug Fixes

* allow build without text ([#4506](https://github.com/shaka-project/shaka-player/issues/4506)) ([1db6265](https://github.com/shaka-project/shaka-player/commit/1db62655276e8d2d5991f732704b7b37bb6994a3))
* allow the playback on platforms when low latency APIs are not supported ([#4485](https://github.com/shaka-project/shaka-player/issues/4485)) ([55d1390](https://github.com/shaka-project/shaka-player/commit/55d1390c82a2dcc7965d582c33417937944f86b7))
* check for negative rows before moving ([#4510](https://github.com/shaka-project/shaka-player/issues/4510)) ([31abae3](https://github.com/shaka-project/shaka-player/commit/31abae3201f4904e63a786015634e47a873ec789)), closes [#4508](https://github.com/shaka-project/shaka-player/issues/4508)
* Filter unsupported H.264 streams in Xbox ([#4493](https://github.com/shaka-project/shaka-player/issues/4493)) ([1ecede6](https://github.com/shaka-project/shaka-player/commit/1ecede6cf55ff1904542bfcad548e8dc4e4b4834))
* Fix choppy HLS startup ([#4553](https://github.com/shaka-project/shaka-player/issues/4553)) ([1675bff](https://github.com/shaka-project/shaka-player/commit/1675bffa9f410327fb53c34202daa1d75620233a)), closes [#4516](https://github.com/shaka-project/shaka-player/issues/4516)
* Fix errors with TS segments on Chromecast ([#4543](https://github.com/shaka-project/shaka-player/issues/4543)) ([15a1c60](https://github.com/shaka-project/shaka-player/commit/15a1c60c3f4dcb5e7bc7e915ec81ca3cb17d6625))
* Fix hang when seeking to the last segment ([#4537](https://github.com/shaka-project/shaka-player/issues/4537)) ([72a119d](https://github.com/shaka-project/shaka-player/commit/72a119d4fb3820fa97416ecedf23f96bbd5ca269))
* Fix HLS dynamic to static transition ([932d37c](https://github.com/shaka-project/shaka-player/commit/932d37c29cadbbc54f2f9a7b3ce3b510f86384cb))
* Fix HLS dynamic to static transition ([#4483](https://github.com/shaka-project/shaka-player/issues/4483)) ([932d37c](https://github.com/shaka-project/shaka-player/commit/932d37c29cadbbc54f2f9a7b3ce3b510f86384cb)), closes [#4431](https://github.com/shaka-project/shaka-player/issues/4431)
* Fix in-band key rotation on Xbox One ([#4478](https://github.com/shaka-project/shaka-player/issues/4478)) ([5a8f09c](https://github.com/shaka-project/shaka-player/commit/5a8f09c03d5ca84a90985d68be6079d2f508d87f)), closes [#4401](https://github.com/shaka-project/shaka-player/issues/4401)
* Respect existing app usage of Cast SDK ([#4523](https://github.com/shaka-project/shaka-player/issues/4523)) ([9c3a494](https://github.com/shaka-project/shaka-player/commit/9c3a494a2826e24a60898ae47766a7a41c4cce2d)), closes [#4521](https://github.com/shaka-project/shaka-player/issues/4521)
* **ttml:** Default TTML background color to transparent if unspecified ([#4496](https://github.com/shaka-project/shaka-player/issues/4496)) ([16da1e7](https://github.com/shaka-project/shaka-player/commit/16da1e7416353584c36b29f4028352349617fe45)), closes [#4468](https://github.com/shaka-project/shaka-player/issues/4468)

## [4.1.4](https://github.com/shaka-project/shaka-player/compare/v4.1.3...v4.1.4) (2022-08-31)


### Bug Fixes

* Fix bitmap-based cue size ([#4453](https://github.com/shaka-project/shaka-player/issues/4453)) ([3c5a07f](https://github.com/shaka-project/shaka-player/commit/3c5a07f0259145bdce0c94f90b842de28026d6fa))
* Fix drm.keySystemsMapping config ([#4425](https://github.com/shaka-project/shaka-player/issues/4425)) ([1aab613](https://github.com/shaka-project/shaka-player/commit/1aab6130690eab0cc148ba8f05e483e4fc8db716)), closes [#4422](https://github.com/shaka-project/shaka-player/issues/4422)
* Fix vanishing tracks while offline ([#4426](https://github.com/shaka-project/shaka-player/issues/4426)) ([186d298](https://github.com/shaka-project/shaka-player/commit/186d298b00475818f744925cb3828bfa11c43c0b)), closes [#4408](https://github.com/shaka-project/shaka-player/issues/4408)
* return width and height in the stats when we are using src= ([#4435](https://github.com/shaka-project/shaka-player/issues/4435)) ([1eff9ed](https://github.com/shaka-project/shaka-player/commit/1eff9ed022950a2ef8722768da02ad96ef1ff821))
* **UI:** Ad position and ad counter are too close to each other ([#4416](https://github.com/shaka-project/shaka-player/issues/4416)) ([5f5c7c3](https://github.com/shaka-project/shaka-player/commit/5f5c7c35853e27b088af2840ab986f90c8d3bbb5))

## [4.1.3](https://github.com/shaka-project/shaka-player/compare/v4.1.2...v4.1.3) (2022-08-16)


### Bug Fixes

* add strictMissingProperties suppressions to unblock strict missing properties on union types. ([#4371](https://github.com/shaka-project/shaka-player/issues/4371)) ([e055893](https://github.com/shaka-project/shaka-player/commit/e055893eca165eb9c01493ea89de4da3fcf7737e))
* exception if on early adError ([#4362](https://github.com/shaka-project/shaka-player/issues/4362)) ([36023e8](https://github.com/shaka-project/shaka-player/commit/36023e89d44463bf9949b53e7f24f7d6c5fc4d73)), closes [#4004](https://github.com/shaka-project/shaka-player/issues/4004)
* Fix key ID byteswapping for PlayReady on PS4 ([#4377](https://github.com/shaka-project/shaka-player/issues/4377)) ([b8eb590](https://github.com/shaka-project/shaka-player/commit/b8eb590084a9871d95b3f1fccc1921d1da649e6a))
* Fix MediaCapabilities polyfill on Tizen and WebOS ([#4396](https://github.com/shaka-project/shaka-player/issues/4396)) ([259cd84](https://github.com/shaka-project/shaka-player/commit/259cd844863ffc754c3e130ee673014f7913670d)), closes [#4383](https://github.com/shaka-project/shaka-player/issues/4383) [#4357](https://github.com/shaka-project/shaka-player/issues/4357)
* Fix TextDecoder fallback and browser support check ([#4403](https://github.com/shaka-project/shaka-player/issues/4403)) ([45cae27](https://github.com/shaka-project/shaka-player/commit/45cae273efd1070a7bb266e7cca84b9905756a4a))
* Fix UI captions icon state ([#4384](https://github.com/shaka-project/shaka-player/issues/4384)) ([c31a57f](https://github.com/shaka-project/shaka-player/commit/c31a57fa19225e4a081f261958b678d389a9490b)), closes [#4358](https://github.com/shaka-project/shaka-player/issues/4358)
* Fix VP9 codec checks on Mac Firefox ([#4391](https://github.com/shaka-project/shaka-player/issues/4391)) ([227dfef](https://github.com/shaka-project/shaka-player/commit/227dfefa39befe5bc184e05a3f6a916b4cf04147))
* **text:** Fix cue region rendering in UI ([#4412](https://github.com/shaka-project/shaka-player/issues/4412)) ([4706572](https://github.com/shaka-project/shaka-player/commit/4706572b4582d56a51be1aa3295751c436cf6c07)), closes [#4381](https://github.com/shaka-project/shaka-player/issues/4381)
* **text:** Fix TTML render timing and line break issues ([#4407](https://github.com/shaka-project/shaka-player/issues/4407)) ([1c6deb4](https://github.com/shaka-project/shaka-player/commit/1c6deb42a013cc36cf37497ac9b22606a286fd20)), closes [#4381](https://github.com/shaka-project/shaka-player/issues/4381)
* Update v4.1.x branch Cast receiver ID ([582058b](https://github.com/shaka-project/shaka-player/commit/582058b2a22337ea2259c200949d51e594cba22a))

## [4.1.2](https://github.com/shaka-project/shaka-player/compare/v4.1.1...v4.1.2) (2022-07-14)


### Bug Fixes

* Add fallback to TextDecoder and TextEncoder ([#4324](https://github.com/shaka-project/shaka-player/issues/4324)) ([dc26ed2](https://github.com/shaka-project/shaka-player/commit/dc26ed2e0e4c994684712c38b3cde4fcdbe5a974))
* Debug buffer placement ([f554d5d](https://github.com/shaka-project/shaka-player/commit/f554d5d642c695ae28f1e5724fa025231323022a))
* Fix EOS set-top box being identified as Apple. ([#4310](https://github.com/shaka-project/shaka-player/issues/4310)) ([3f24916](https://github.com/shaka-project/shaka-player/commit/3f24916b108ebdd833b626ea6cdfbdb20b244767))
* Fix getVideoPlaybackQuality in WebOS 3 ([#4316](https://github.com/shaka-project/shaka-player/issues/4316)) ([0e741d9](https://github.com/shaka-project/shaka-player/commit/0e741d95282487a699b77a521e1acf31ada732a6))
* Fix MediaCapabilities polyfill on Playstation 4 ([#4320](https://github.com/shaka-project/shaka-player/issues/4320)) ([afa2a4b](https://github.com/shaka-project/shaka-player/commit/afa2a4b3f3358dc538cc164f6eb1969100c1d491))
* Fix segment index assertions with DAI ([2ef9270](https://github.com/shaka-project/shaka-player/commit/2ef9270a95dd0de5119dc5c6fe6cc18a59202c24))
* VTT Cue Parsing On PlayStation 4 ([#4340](https://github.com/shaka-project/shaka-player/issues/4340)) ([6784d88](https://github.com/shaka-project/shaka-player/commit/6784d88d2a5ee0f3763a50e6b0b74418c2f6af41)), closes [#4321](https://github.com/shaka-project/shaka-player/issues/4321)

## [4.1.1](https://github.com/shaka-project/shaka-player/compare/v4.1.0...v4.1.1) (2022-06-14)


### Bug Fixes

* **demo:** allow switch between UITextDisplayer and SimpleTextDisplayer ([#4275](https://github.com/shaka-project/shaka-player/issues/4275)) ([f6cb4e2](https://github.com/shaka-project/shaka-player/commit/f6cb4e212c586e5bb8e16de445f9e9a2d49648bd))
* **demo:** erroneous FairPlay keysystem in demo ([#4276](https://github.com/shaka-project/shaka-player/issues/4276)) ([8ff9fdf](https://github.com/shaka-project/shaka-player/commit/8ff9fdffadb284b13511b4d39fb9f1ba57e2dae1))
* **hls:** Fix AV sync issues, fallback to sequence numbers if PROGRAM-DATE-TIME ignored ([#4289](https://github.com/shaka-project/shaka-player/issues/4289)) ([e5bfb8b](https://github.com/shaka-project/shaka-player/commit/e5bfb8bfa5720830da939880ad4e502369cdd160)), closes [#4287](https://github.com/shaka-project/shaka-player/issues/4287)
* New EME polyfill fixes EME/MCap issues on some smart TVs ([#4279](https://github.com/shaka-project/shaka-player/issues/4279)) ([2168937](https://github.com/shaka-project/shaka-player/commit/21689375e081567328d704450145d6489e3e5d23))
* Populate track's spatialAudio property ([#4291](https://github.com/shaka-project/shaka-player/issues/4291)) ([636f232](https://github.com/shaka-project/shaka-player/commit/636f232adf26ba47296fd6a624f4606c78a98ab6))
* Remove IE 11 from default browsers for Windows ([#4272](https://github.com/shaka-project/shaka-player/issues/4272)) ([bc96abd](https://github.com/shaka-project/shaka-player/commit/bc96abdb9d567c56321d8489c51e12493776f7de)), closes [#4271](https://github.com/shaka-project/shaka-player/issues/4271)
* Use middle segment when guessing MIME type on HLS ([#4269](https://github.com/shaka-project/shaka-player/issues/4269)) ([#4270](https://github.com/shaka-project/shaka-player/issues/4270)) ([7879424](https://github.com/shaka-project/shaka-player/commit/78794246a369151473bfbb4cbfee0a9de16628b3))

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
