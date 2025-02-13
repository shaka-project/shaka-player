# Changelog

## [4.3.16](https://github.com/shaka-project/shaka-player/compare/v4.3.15...v4.3.16) (2024-05-07)


### Bug Fixes

* call to load in MediaElement using src= in HLS Safari ([#6478](https://github.com/shaka-project/shaka-player/issues/6478)) ([bf7ac86](https://github.com/shaka-project/shaka-player/commit/bf7ac86a883c6f31642ffca6785915e5868ce0d6))
* **Cast:** Don't pause local video until the cast connection is established ([#6359](https://github.com/shaka-project/shaka-player/issues/6359)) ([c81c853](https://github.com/shaka-project/shaka-player/commit/c81c853167696a5bad08550102489da615e3c7ba))
* **DASH:** Fix get partial current position for LL when using SegmentTemplate@duration ([#6516](https://github.com/shaka-project/shaka-player/issues/6516)) ([8d913a7](https://github.com/shaka-project/shaka-player/commit/8d913a7b24bfcae0818ade267270a3aef1c8bed9))
* **DASH:** Set delay to 0 for LL streams ([#6406](https://github.com/shaka-project/shaka-player/issues/6406)) ([9c49645](https://github.com/shaka-project/shaka-player/commit/9c496458d2c2bcd3ee2e3070cea7e267f17abbbc))
* **demo:** Remove max height of demo config tabs ([#6324](https://github.com/shaka-project/shaka-player/issues/6324)) ([6b5098b](https://github.com/shaka-project/shaka-player/commit/6b5098bd780a8337a130f3fc3501887cb0bf0756))
* Do not make LICENSE_REQUEST_FAILED fatal if other keys are successful ([#6457](https://github.com/shaka-project/shaka-player/issues/6457)) ([688cceb](https://github.com/shaka-project/shaka-player/commit/688cceb2d5a08faa30a93af7cb31834a8a84d879))
* Don't update captions when video is paused ([#6474](https://github.com/shaka-project/shaka-player/issues/6474)) ([2e62152](https://github.com/shaka-project/shaka-player/commit/2e621527a3b350182327b96ca0fab54bd183f056))
* Fix cea608 whitespace rendering ([#6329](https://github.com/shaka-project/shaka-player/issues/6329)) ([f7c978e](https://github.com/shaka-project/shaka-player/commit/f7c978e6584aa063910d7c34384b5a3f6431b5c8)), closes [#6328](https://github.com/shaka-project/shaka-player/issues/6328)
* Fix flac detection in Safari ([#6497](https://github.com/shaka-project/shaka-player/issues/6497)) ([5e68fba](https://github.com/shaka-project/shaka-player/commit/5e68fbacff5ae32faf15ee8089cb7e05256ccc33))
* Fix reusing region elements in UITextDisplayer ([#6476](https://github.com/shaka-project/shaka-player/issues/6476)) ([2c60a94](https://github.com/shaka-project/shaka-player/commit/2c60a94d2d2e8261ab49b37d985475488e2d11ed))
* Fix support of getAllThumbnails when using DASH multi-period ([#6464](https://github.com/shaka-project/shaka-player/issues/6464)) ([59e1f10](https://github.com/shaka-project/shaka-player/commit/59e1f10d8defe1ae426471604d09d407a95400a0))
* **HLS:** Fix IAMF codec selection in HLS ([#6389](https://github.com/shaka-project/shaka-player/issues/6389)) ([9b02fe3](https://github.com/shaka-project/shaka-player/commit/9b02fe31ca6ebb60564f8f25d46b8ab50a61ae23))
* **HLS:** Fix labelling of captions in Safari ([#6426](https://github.com/shaka-project/shaka-player/issues/6426)) ([9282a1b](https://github.com/shaka-project/shaka-player/commit/9282a1b8014d9ad3d174b90c6999edd4d7b57ca8))
* **HLS:** getPlayheadTimeAsDate() differs from X-EXT-PROGRAM-DATE-TIME ([#6371](https://github.com/shaka-project/shaka-player/issues/6371)) ([a8aaabb](https://github.com/shaka-project/shaka-player/commit/a8aaabb0780580ddf4cc7f0d749b51cb3b7c33c6))
* **HLS:** Only offset segment ref times when needed w/ EXT-X-MEDIA-SEQUENCE ([#6378](https://github.com/shaka-project/shaka-player/issues/6378)) ([543f081](https://github.com/shaka-project/shaka-player/commit/543f08173536c1f4fc53514c2ad5cc6dcbe35056))
* Looser tolerance for ending trick play at edge of seek range. ([#6422](https://github.com/shaka-project/shaka-player/issues/6422)) ([ce1a86e](https://github.com/shaka-project/shaka-player/commit/ce1a86e952033d829b0fb89894f6cdd2b618fc0f)), closes [#6421](https://github.com/shaka-project/shaka-player/issues/6421)


### Reverts

* Fix potential AV sync issues after seek or adaptation ([#6435](https://github.com/shaka-project/shaka-player/issues/6435)) ([c3ce673](https://github.com/shaka-project/shaka-player/commit/c3ce6733c748dc9681950d5e14dfdd43b17cdd75)), closes [#5785](https://github.com/shaka-project/shaka-player/issues/5785) [#4589](https://github.com/shaka-project/shaka-player/issues/4589)
* getPlayheadTimeAsDate() differs from X-EXT-PROGRAM-DATE-TIME ([#6330](https://github.com/shaka-project/shaka-player/issues/6330)) ([4050614](https://github.com/shaka-project/shaka-player/commit/4050614513deb832883ef4a44f4014a9d83eab55))

## [4.3.15](https://github.com/shaka-project/shaka-player/compare/v4.3.14...v4.3.15) (2024-02-27)


### Bug Fixes

* **Cast:** Force TS content to be transmuxed on Chromecast ([#6262](https://github.com/shaka-project/shaka-player/issues/6262)) ([d007f6f](https://github.com/shaka-project/shaka-player/commit/d007f6fe76fc8fcf04745d848f4d4b9a72ccf59b)), closes [#5278](https://github.com/shaka-project/shaka-player/issues/5278)
* **HLS:** Ban unsupported combinations of SAMPLE-AES encryption ([#6295](https://github.com/shaka-project/shaka-player/issues/6295)) ([3b60303](https://github.com/shaka-project/shaka-player/commit/3b60303449956f775696ca1e9096c9adb9af4a17))
* **VTT:** fix setting textShadow when multiple CSS classes provided ([#6287](https://github.com/shaka-project/shaka-player/issues/6287)) ([f96895b](https://github.com/shaka-project/shaka-player/commit/f96895b123b5aa6fcd2e7d43974609b65cce04e0))

## [4.3.14](https://github.com/shaka-project/shaka-player/compare/v4.3.13...v4.3.14) (2024-02-20)


### Bug Fixes

* **ABR:** Fix HLS playback after internet connection is restored ([#5879](https://github.com/shaka-project/shaka-player/issues/5879)) ([65d1157](https://github.com/shaka-project/shaka-player/commit/65d115768f36b4cbfc6c9851518f33ea25d66008))
* AC-3 audio codec support on Tizen ([#6166](https://github.com/shaka-project/shaka-player/issues/6166)) ([83c57ee](https://github.com/shaka-project/shaka-player/commit/83c57ee4505fd1dc2f2ee9e70acee5f8522a0006))
* add missing properties to PlayButton type ([#6130](https://github.com/shaka-project/shaka-player/issues/6130)) ([b3ef659](https://github.com/shaka-project/shaka-player/commit/b3ef659d7acf3ac864a3d2ab2258a8f8aa679393))
* Add Orange platform to requiresEncryptionInfoInAllInitSegments ([#5895](https://github.com/shaka-project/shaka-player/issues/5895)) ([013c54b](https://github.com/shaka-project/shaka-player/commit/013c54b01cf1576ec0dcd38221efb7845ba62e39))
* **Ads:** Fix VMAP won't play in muted autoplay ([#6046](https://github.com/shaka-project/shaka-player/issues/6046)) ([5201950](https://github.com/shaka-project/shaka-player/commit/520195042860f43e2c2cfc2e4456b41d990c9ba0))
* Allow by default variants without pssh in the manifest ([#6144](https://github.com/shaka-project/shaka-player/issues/6144)) ([db788a0](https://github.com/shaka-project/shaka-player/commit/db788a0dc14a22cb50d525f3b195f65e0f74d177))
* Allow parseXmlString when createNodeIterator is not available ([#5805](https://github.com/shaka-project/shaka-player/issues/5805)) ([dd4b36f](https://github.com/shaka-project/shaka-player/commit/dd4b36fa1fc6557a8a2da3437f80ab72172caf7c))
* APL set-top box wrongly identifies as an Apple device. ([#6026](https://github.com/shaka-project/shaka-player/issues/6026)) ([2e8e2a4](https://github.com/shaka-project/shaka-player/commit/2e8e2a47c537c0e498f959fd56d0ebf4f2878e48))
* auto cancel trickPlay on live as specified ([#6100](https://github.com/shaka-project/shaka-player/issues/6100)) ([1b08e12](https://github.com/shaka-project/shaka-player/commit/1b08e129b0cfd94add274f287bd0e47709fc175c))
* avoid uiTextDisplayer.destroy crashing if called more than once ([#6022](https://github.com/shaka-project/shaka-player/issues/6022)) ([8f9fbb2](https://github.com/shaka-project/shaka-player/commit/8f9fbb2aede48b5c6a7243eee1c5c9f6b192a0a2))
* ban new Uint16Array(buffer) ([#5838](https://github.com/shaka-project/shaka-player/issues/5838)) ([4e314db](https://github.com/shaka-project/shaka-player/commit/4e314db29dd91f05a4536d0e289ca73cf3238d04))
* CEA decoder should return early if packet is not large enough ([#5893](https://github.com/shaka-project/shaka-player/issues/5893)) ([b866b3c](https://github.com/shaka-project/shaka-player/commit/b866b3ce69e8b2c323b3f45ebea4e3b16a345e98))
* **CMCD:** Fix CMCD for some mimetypes in src= ([#6178](https://github.com/shaka-project/shaka-player/issues/6178)) ([b6adc09](https://github.com/shaka-project/shaka-player/commit/b6adc0903367ff5c1074d51e3d1f5f868213f42c))
* **DASH:** Fix false redirect detection ([#5910](https://github.com/shaka-project/shaka-player/issues/5910)) ([92d41dd](https://github.com/shaka-project/shaka-player/commit/92d41dd0feb2a4d80a57460f80461d0c4a8baa40))
* **DASH:** Fix manifest update time for Live manifests ([#5763](https://github.com/shaka-project/shaka-player/issues/5763)) ([da38819](https://github.com/shaka-project/shaka-player/commit/da38819f422f6d72141e5a2b2599d43e2d5cda3d))
* **DASH:** Fix manifest update time for LL-DASH ([#5736](https://github.com/shaka-project/shaka-player/issues/5736)) ([ff6a72d](https://github.com/shaka-project/shaka-player/commit/ff6a72d07a48dd08412c70dfe7dd4d498174c3a7))
* **DASH:** Handle minimumUpdatePeriod=0 with urn:mpeg:dash:event:2012 (EMSG) ([#5823](https://github.com/shaka-project/shaka-player/issues/5823)) ([ad78d09](https://github.com/shaka-project/shaka-player/commit/ad78d09038d2eee3a933e02e189126e25f6f3a75))
* **DASH:** Update dash manifest when minimumUpdatePeriod = 0 ([#6187](https://github.com/shaka-project/shaka-player/issues/6187)) ([2e2767e](https://github.com/shaka-project/shaka-player/commit/2e2767e6637cb884ef5b01c90182ecaeb50df95b))
* **DASH:** Use labels to stitch streams across periods ([#6121](https://github.com/shaka-project/shaka-player/issues/6121)) ([76bf5e7](https://github.com/shaka-project/shaka-player/commit/76bf5e707d5f64b4dc7d1d54f80bc6582e89c8bc))
* **Demo:** Pressing "Edit" button unstores custom asset, but does not update "stored" button ([#5936](https://github.com/shaka-project/shaka-player/issues/5936)) ([30a71f2](https://github.com/shaka-project/shaka-player/commit/30a71f2b0057759effa89cf998adb2af3ed6ad89))
* do not remove sub-second amounts from source buffer ([267169c](https://github.com/shaka-project/shaka-player/commit/267169c5bcc2bcab7dff54f2a9528ae5f0d6ab2a)), closes [#6240](https://github.com/shaka-project/shaka-player/issues/6240)
* ENCRYPTED CONTENT WITHOUT DRM INFO on comcast X1 due to safari blocklist ([#6034](https://github.com/shaka-project/shaka-player/issues/6034)) ([daa224d](https://github.com/shaka-project/shaka-player/commit/daa224dd8530b7582d86af2e8b0a0cd2ed2b9797))
* Fix crash while playing HLS AES 128 streams ([#5830](https://github.com/shaka-project/shaka-player/issues/5830)) ([43b6d48](https://github.com/shaka-project/shaka-player/commit/43b6d48606e713e808d94325d934956864745287))
* Fix detection of flac support on Safari ([#6250](https://github.com/shaka-project/shaka-player/issues/6250)) ([74fcf51](https://github.com/shaka-project/shaka-player/commit/74fcf516139f52b5e2bf398ba8905dc2ab1bef99))
* Fix detection of spatial rendering support in Cast ([#6138](https://github.com/shaka-project/shaka-player/issues/6138)) ([579fb9a](https://github.com/shaka-project/shaka-player/commit/579fb9a582d2f53da57afa57965a7eaeb1852390))
* Fix DRM workaround for Tizen and Xbox with ac-4 boxes ([#5812](https://github.com/shaka-project/shaka-player/issues/5812)) ([4c3c3e2](https://github.com/shaka-project/shaka-player/commit/4c3c3e2a37fff296966a8bc2bd738d026db9a42c))
* Fix DRM workaround for Xbox with Dolby Vision boxes ([#6201](https://github.com/shaka-project/shaka-player/issues/6201)) ([c068a50](https://github.com/shaka-project/shaka-player/commit/c068a501e61f34b521065adf216faba959efe984))
* Fix gitpkg.now.sh dependencies ([#6211](https://github.com/shaka-project/shaka-player/issues/6211)) ([d749614](https://github.com/shaka-project/shaka-player/commit/d749614425f3fe29dda0d1ebbe28b0977d866463))
* fix handling of multiple CC tracks ([#6076](https://github.com/shaka-project/shaka-player/issues/6076)) ([081362d](https://github.com/shaka-project/shaka-player/commit/081362dfddc1ab7dbad96f698e4a3d5cd15f0c39))
* Fix init segment comparison ([#5920](https://github.com/shaka-project/shaka-player/issues/5920)) ([42d38d5](https://github.com/shaka-project/shaka-player/commit/42d38d5d7792f3e7e1e81d2dbe7a5c5106dfc5cb))
* Fix language comparison in addTextTrackAsync ([#5904](https://github.com/shaka-project/shaka-player/issues/5904)) ([4438ca1](https://github.com/shaka-project/shaka-player/commit/4438ca122a0e5a78a659a2378672e8bf93f3336f))
* Fix liveLatency in stats ([#5982](https://github.com/shaka-project/shaka-player/issues/5982)) ([ba45266](https://github.com/shaka-project/shaka-player/commit/ba4526685f346e18c90cebff8561357f01b0dbc8))
* Fix trackschanged event not fired after a license request is denied for some tracks ([#5962](https://github.com/shaka-project/shaka-player/issues/5962)) ([554f9ed](https://github.com/shaka-project/shaka-player/commit/554f9edf115dcb7be552b4a94027484cd28d2916))
* **hisense:** set stallSkip to 0 for HiSense devices ([#5833](https://github.com/shaka-project/shaka-player/issues/5833)) ([f78cab4](https://github.com/shaka-project/shaka-player/commit/f78cab4a2ce74bbd1a7571f37087922e9d41d564))
* **HLS:** Avoid duplicate AES request when using the same info ([#6118](https://github.com/shaka-project/shaka-player/issues/6118)) ([a1084f5](https://github.com/shaka-project/shaka-player/commit/a1084f578268da59a006df2b6021e561d6a16ac3))
* **HLS:** Fix init segment when EXT-X-MAP is preceded by EXT-X-BYTERANGE ([#5732](https://github.com/shaka-project/shaka-player/issues/5732)) ([931b2f8](https://github.com/shaka-project/shaka-player/commit/931b2f80c4578ea8d2bd32232d8c602f800e81ea))
* **HLS:** Fix kind detection for 'captions' text tracks ([#5819](https://github.com/shaka-project/shaka-player/issues/5819)) ([a4fa63b](https://github.com/shaka-project/shaka-player/commit/a4fa63b9043e37b77e66fe5ce69b0c707b5b18bb))
* **HLS:** Fix VVC codec selection in HLS ([#6156](https://github.com/shaka-project/shaka-player/issues/6156)) ([1e73bb2](https://github.com/shaka-project/shaka-player/commit/1e73bb205b5c10851024e9719efaa56fcaad4dd4))
* **HLS:** getPlayheadTimeAsDate() differs from X-EXT-PROGRAM-DATE-TIME ([#6059](https://github.com/shaka-project/shaka-player/issues/6059)) ([cb17e24](https://github.com/shaka-project/shaka-player/commit/cb17e2478767aa4e5ea55ab675519c399db19e50))
* **HLS:** Live recovery after disconnects ([#6048](https://github.com/shaka-project/shaka-player/issues/6048)) ([468425a](https://github.com/shaka-project/shaka-player/commit/468425a65122475d3d8048800d042db8c72762c1))
* **HLS:** Recognize CEA subtitles when CLOSED-CAPTIONS attribute is missing ([#5916](https://github.com/shaka-project/shaka-player/issues/5916)) ([440d4ab](https://github.com/shaka-project/shaka-player/commit/440d4ab1d87644d0e89b0b7718e627c7ed6c55dc))
* Install by default shaka.polyfill.PatchedMediaKeysApple when there is no unprefixed EME support ([#6053](https://github.com/shaka-project/shaka-player/issues/6053)) ([caf7a7c](https://github.com/shaka-project/shaka-player/commit/caf7a7c118bc06a1b86d174be4f647c164c1f905))
* **offline:** Fix server certificate error when trying to delete stored content ([#6080](https://github.com/shaka-project/shaka-player/issues/6080)) ([2bc0c25](https://github.com/shaka-project/shaka-player/commit/2bc0c259e88fc440b30fb8d33870e9e42f3c3e25))
* **offline:** Fix server certificate error when trying to store content ([#5848](https://github.com/shaka-project/shaka-player/issues/5848)) ([1e907db](https://github.com/shaka-project/shaka-player/commit/1e907db9f959095105ca63891984ee3c4a22e3b9))
* **offline:** Fix store persistent licenses with drm info in the pssh ([#6143](https://github.com/shaka-project/shaka-player/issues/6143)) ([438e098](https://github.com/shaka-project/shaka-player/commit/438e0980fea4afb1e55e4aeba3d3eb78a3e572b8))
* Prevent license requests for unplayable variants ([#6204](https://github.com/shaka-project/shaka-player/issues/6204)) ([725391a](https://github.com/shaka-project/shaka-player/commit/725391a1a40d9ee0fdf36671bcd63314ffeac68e))
* Properly size region anchor from LINE units ([#5941](https://github.com/shaka-project/shaka-player/issues/5941)) ([f0a07bc](https://github.com/shaka-project/shaka-player/commit/f0a07bc3c00a8c446ac1f331dc9efbd34aa54885))
* Reject Opus encrypted on Firefox Android ([#6115](https://github.com/shaka-project/shaka-player/issues/6115)) ([95cba57](https://github.com/shaka-project/shaka-player/commit/95cba570340159e26d303c8ae983834aa7134899))
* Reset to default playback rate on release playback rate controller ([#6089](https://github.com/shaka-project/shaka-player/issues/6089)) ([2e390ed](https://github.com/shaka-project/shaka-player/commit/2e390ed674b2095fa250bfec5fce4355dfca9ef7))
* text roles being combined incorrectly in some multiperiod cases ([#6055](https://github.com/shaka-project/shaka-player/issues/6055)) ([f6fea75](https://github.com/shaka-project/shaka-player/commit/f6fea75827aca70f439f67dc0fa9079c34faea6e))
* **TTML:** Clip to video when extent is not present ([#6086](https://github.com/shaka-project/shaka-player/issues/6086)) ([44cac01](https://github.com/shaka-project/shaka-player/commit/44cac017708b770570e565898e29dda2f543e72b))
* **TTML:** Fix support of urls in smpte:backgroundImage ([#5851](https://github.com/shaka-project/shaka-player/issues/5851)) ([b1510ca](https://github.com/shaka-project/shaka-player/commit/b1510caba1c428508198bf8e08cb3ed59ce71c43))
* **UI:** Correctly display video time and duration for VOD ([#5929](https://github.com/shaka-project/shaka-player/issues/5929)) ([3775daa](https://github.com/shaka-project/shaka-player/commit/3775daaa5e5b49664425b556c19a9b9b5d65a43f))
* **UI:** Fix keyboard navigation of volume bar on Firefox ([#5981](https://github.com/shaka-project/shaka-player/issues/5981)) ([6ea473f](https://github.com/shaka-project/shaka-player/commit/6ea473fdaee87d3731a27502141a48c4161123ff))
* **UI:** Fix replay button when the post-roll is running using CS ([#6072](https://github.com/shaka-project/shaka-player/issues/6072)) ([1282575](https://github.com/shaka-project/shaka-player/commit/1282575bb603765de8fd271854e31e9a6d76db90))
* **UI:** Fix text selector when the trackLabelFormat is set to LABEL ([#5751](https://github.com/shaka-project/shaka-player/issues/5751)) ([da2033e](https://github.com/shaka-project/shaka-player/commit/da2033edff908c687536b4d723bf8e359944034f))
* UITextDisplayer font-family is overridden by UI's Roboto font ([#5829](https://github.com/shaka-project/shaka-player/issues/5829)) ([d55137b](https://github.com/shaka-project/shaka-player/commit/d55137b2bfe4d42794ebfc651b1544ef9a03d729))
* **UI:** Update the playbackrate on loaded event ([#6090](https://github.com/shaka-project/shaka-player/issues/6090)) ([2bac3b9](https://github.com/shaka-project/shaka-player/commit/2bac3b9215135b8fd52f53d035a3360a9c1ae673))
* Unmask errors on LL ([#5908](https://github.com/shaka-project/shaka-player/issues/5908)) ([78564b9](https://github.com/shaka-project/shaka-player/commit/78564b999385b17c9351aa43a59358af39d01f9b))
* **WebVTT:** Fix support for line vertical alignment ([#5945](https://github.com/shaka-project/shaka-player/issues/5945)) ([1a7d4da](https://github.com/shaka-project/shaka-player/commit/1a7d4da38370684242d7dfa7033a85097d6fb665))
* **WebVTT:** Fix wrong writing-mode in nested cues ([#5807](https://github.com/shaka-project/shaka-player/issues/5807)) ([f0c2c2d](https://github.com/shaka-project/shaka-player/commit/f0c2c2d5727495f55687d956978ffa16ec3c254c))
* When disconnecting from chromecast, subtitles are turned off ([#6103](https://github.com/shaka-project/shaka-player/issues/6103)) ([5550836](https://github.com/shaka-project/shaka-player/commit/5550836230d02d9d90f980839b01fff69797bf5b))


### Performance Improvements

* **dash:** improve readability and reduce number of loops in dash parser ([#5768](https://github.com/shaka-project/shaka-player/issues/5768)) ([2767bc9](https://github.com/shaka-project/shaka-player/commit/2767bc9722f98cc323ee0a03c6c869f35e79afb9))
* **DASH:** reduce looping and remove chaining awaits in period ([#5774](https://github.com/shaka-project/shaka-player/issues/5774)) ([af79ca4](https://github.com/shaka-project/shaka-player/commit/af79ca4531eb6e54ee12323877cc248db9c9dcc3))
* **HLS:** do not filter all tags to get the first tag ([#6088](https://github.com/shaka-project/shaka-player/issues/6088)) ([c6794d6](https://github.com/shaka-project/shaka-player/commit/c6794d635e0591b48b1dcead21cd723ea6b2703f))
* Improve performance of addThumbnailsTrack ([#6067](https://github.com/shaka-project/shaka-player/issues/6067)) ([d8e46ba](https://github.com/shaka-project/shaka-player/commit/d8e46baebed416870be8fded3a49470e4a21ae9d))
* **manifest:** avoid unnecessary looping in uri resolver ([#5773](https://github.com/shaka-project/shaka-player/issues/5773)) ([b887978](https://github.com/shaka-project/shaka-player/commit/b887978457f82e2b9cf39475a0ba1929a2a2c28d))
* Optimize init segment reference comparison for common case ([#6014](https://github.com/shaka-project/shaka-player/issues/6014)) ([fb1d167](https://github.com/shaka-project/shaka-player/commit/fb1d167053f87fb1be742a0310ef9db4893ceafb))
* simplify and improve performance of parsing initData when deduping ([#5775](https://github.com/shaka-project/shaka-player/issues/5775)) ([0350f9d](https://github.com/shaka-project/shaka-player/commit/0350f9da76f12a2cfe4b66ef1a1ca0d9147f23e5))
* **utils:** use WeakSet to track object references ([#5791](https://github.com/shaka-project/shaka-player/issues/5791)) ([2cab9a2](https://github.com/shaka-project/shaka-player/commit/2cab9a2f518717422402b6de5cf4069a83cbbb58))
* **WebVTT:** Improve parsing time for unstyled payloads ([#6066](https://github.com/shaka-project/shaka-player/issues/6066)) ([80b66bd](https://github.com/shaka-project/shaka-player/commit/80b66bd2a43c0e034f6055e3e50560c0ea9d9f3a))
* **Xbox:** drop incompatible variants for XBOX early ([#5777](https://github.com/shaka-project/shaka-player/issues/5777)) ([e471bfc](https://github.com/shaka-project/shaka-player/commit/e471bfc699dc8b9a83cd1037ea7ce9eeac1c9d32))


### Reverts

* Install by default shaka.polyfill.PatchedMediaKeysApple when there is no unprefixed EME support ([#6068](https://github.com/shaka-project/shaka-player/issues/6068)) ([e62103f](https://github.com/shaka-project/shaka-player/commit/e62103f8722f7d927fe3a9e942b8ac2ee5a05204))

## [4.3.13](https://github.com/shaka-project/shaka-player/compare/v4.3.12...v4.3.13) (2023-10-04)


### Bug Fixes

* Allow PID change in TsParser ([#5681](https://github.com/shaka-project/shaka-player/issues/5681)) ([2fcc812](https://github.com/shaka-project/shaka-player/commit/2fcc8129db517ac41745785c70af3406a725c0b4))
* **CMCD:** Fix CMCD for some mimetypes in src= ([#5699](https://github.com/shaka-project/shaka-player/issues/5699)) ([28bb5d1](https://github.com/shaka-project/shaka-player/commit/28bb5d139d2bbcfe5bb58b7691d9543868cce0be))
* **Demo:** Fix url of "Low Latency HLS Live" asset ([#5708](https://github.com/shaka-project/shaka-player/issues/5708)) ([728cbfc](https://github.com/shaka-project/shaka-player/commit/728cbfc7b3b028cd5f9ba958e959c9a40234091b))
* Fix creation of new Stream object for each manifest request in DASH Live when using CEA ([#5674](https://github.com/shaka-project/shaka-player/issues/5674)) ([d9223ee](https://github.com/shaka-project/shaka-player/commit/d9223eef8255e8ac698f23cd7115ef6a388e613c))
* **HLS:** Fix audio and video out of sync ([#5658](https://github.com/shaka-project/shaka-player/issues/5658)) ([cb9789e](https://github.com/shaka-project/shaka-player/commit/cb9789e6ab084dd7ba77a232bb90f0fdb1c9bc53))
* **HLS:** Fix display CEA-708 in HLS ([#5694](https://github.com/shaka-project/shaka-player/issues/5694)) ([b639b55](https://github.com/shaka-project/shaka-player/commit/b639b550b692e466c8513f2801d5a7c36b125643))
* **HLS:** Fix presentation delay for small live playlists (eg: 3-4 segments) ([#5687](https://github.com/shaka-project/shaka-player/issues/5687)) ([ef827a0](https://github.com/shaka-project/shaka-player/commit/ef827a07abe5c0b6514a89d121294fc562d8c17f))
* **HLS:** Skip segments without duration and without partial segments ([#5705](https://github.com/shaka-project/shaka-player/issues/5705)) ([96dfcc6](https://github.com/shaka-project/shaka-player/commit/96dfcc609ae40b64d79c27a4f75b34c212fc714d))
* **HLS:** Support AES-128 in init segment according the RFC ([#5677](https://github.com/shaka-project/shaka-player/issues/5677)) ([d30c571](https://github.com/shaka-project/shaka-player/commit/d30c5719ba3e8ee5d53e02100178fdb8ab34df10))
* **WebVTT:** Fix text displayed out of picture and with overlapping lines ([#5662](https://github.com/shaka-project/shaka-player/issues/5662)) ([ee898e9](https://github.com/shaka-project/shaka-player/commit/ee898e9eceb5fe6bbc27e72d11318962f7a574eb)), closes [#5661](https://github.com/shaka-project/shaka-player/issues/5661)


### Performance Improvements

* Optimization to resolve uris ([#5657](https://github.com/shaka-project/shaka-player/issues/5657)) ([0ad925b](https://github.com/shaka-project/shaka-player/commit/0ad925b9eadfe844ce65b341cab5403889786309))

## [4.3.12](https://github.com/shaka-project/shaka-player/compare/v4.3.11...v4.3.12) (2023-09-13)


### Bug Fixes

* com.apple.fps should work with the default initDataTransform when using legacy Apple Media Keys ([#5603](https://github.com/shaka-project/shaka-player/issues/5603)) ([8017636](https://github.com/shaka-project/shaka-player/commit/8017636821c030822cf426bb8d494246c372cb93))
* Compute correctly the positionAlign in UITextDisplayer ([#5630](https://github.com/shaka-project/shaka-player/issues/5630)) ([154131a](https://github.com/shaka-project/shaka-player/commit/154131a81c57d8866499676c7c68683f807dfac5))
* **Demo:** Allow com.apple.fps.1_0 in the custom DRM System field ([#5600](https://github.com/shaka-project/shaka-player/issues/5600)) ([4853af8](https://github.com/shaka-project/shaka-player/commit/4853af8f39a92a57c3e2f5f899a01e76e130c4df))
* fix preferred track selection on Safari ([#5601](https://github.com/shaka-project/shaka-player/issues/5601)) ([a85174a](https://github.com/shaka-project/shaka-player/commit/a85174a667ee20451742e1acd8d9e89262a4c51e))
* **TTML:** Fix wrong writing-mode in nested cues ([#5646](https://github.com/shaka-project/shaka-player/issues/5646)) ([e125e53](https://github.com/shaka-project/shaka-player/commit/e125e539cda726cd9c2674211246673008d3fda0))
* **WebVTT:** Fix support for line:0 vertical alignment ([#5632](https://github.com/shaka-project/shaka-player/issues/5632)) ([5074de7](https://github.com/shaka-project/shaka-player/commit/5074de721f2669c70054a970526cffea295567c5))
* **WebVTT:** Fix wrong writing-mode in nested cues ([#5641](https://github.com/shaka-project/shaka-player/issues/5641)) ([ba9a852](https://github.com/shaka-project/shaka-player/commit/ba9a852fc68adf0081e5c9d921bd374404113e34))

## [4.3.11](https://github.com/shaka-project/shaka-player/compare/v4.3.10...v4.3.11) (2023-09-02)


### Bug Fixes

* **HLS:** Allow audio groups on audio-only content ([#5578](https://github.com/shaka-project/shaka-player/issues/5578)) ([9028495](https://github.com/shaka-project/shaka-player/commit/90284959bda3c0cadcacbd7acbe0425d3028d9d5))

## [4.3.10](https://github.com/shaka-project/shaka-player/compare/v4.3.9...v4.3.10) (2023-08-30)


### Bug Fixes

* **Ads:** Initialize correctly the IMA ads manager ([#5541](https://github.com/shaka-project/shaka-player/issues/5541)) ([f15ba16](https://github.com/shaka-project/shaka-player/commit/f15ba16f7742790fad7ed5212c0605b418f37db5))
* **Demo:** Show correctly external text in the Demo ([#5521](https://github.com/shaka-project/shaka-player/issues/5521)) ([01403c4](https://github.com/shaka-project/shaka-player/commit/01403c43441fe8a2dd305f63fa1394127dfdd89b))
* Orange set top box is incorrectly categorized as Apple ([#5545](https://github.com/shaka-project/shaka-player/issues/5545)) ([f0f1281](https://github.com/shaka-project/shaka-player/commit/f0f12813772560a0063ad4de521b31391c52d932))
* **UI:** Fix playback restarts in safari when click on seekbar end ([#5527](https://github.com/shaka-project/shaka-player/issues/5527)) ([8263c73](https://github.com/shaka-project/shaka-player/commit/8263c736b6309afda3add0174a9508b74b3ed379))

## [4.3.9](https://github.com/shaka-project/shaka-player/compare/v4.3.8...v4.3.9) (2023-08-21)


### Bug Fixes

* add MIME type for HTML5 tracks ([#5452](https://github.com/shaka-project/shaka-player/issues/5452)) ([5fb44db](https://github.com/shaka-project/shaka-player/commit/5fb44dba6d7670e24e8df90fe96588ce2a48c92b))
* Default language to 'und' for native tracks ([#5464](https://github.com/shaka-project/shaka-player/issues/5464)) ([c31f3db](https://github.com/shaka-project/shaka-player/commit/c31f3db9c3efe44dfd28e03db64628827fdf9b5f))
* Fix exiting fullscreen on Safari ([#5439](https://github.com/shaka-project/shaka-player/issues/5439)) ([81626b2](https://github.com/shaka-project/shaka-player/commit/81626b20ada137305cbaae808315244eaa84906d)), closes [#5437](https://github.com/shaka-project/shaka-player/issues/5437)
* Fix memory leak on SimpleAbrManager ([#5478](https://github.com/shaka-project/shaka-player/issues/5478)) ([f8cb6ef](https://github.com/shaka-project/shaka-player/commit/f8cb6ef50a5501a92a94e13099a80690fb7b046d))
* Fix playRangeEnd does not work with HLS streams ([#5494](https://github.com/shaka-project/shaka-player/issues/5494)) ([899eb07](https://github.com/shaka-project/shaka-player/commit/899eb0725f842df21f927a8c63a02e40986bd7fc))
* gettting maxWidth and maxHeight for restrictToElementSize option ([#5481](https://github.com/shaka-project/shaka-player/issues/5481)) ([053da3b](https://github.com/shaka-project/shaka-player/commit/053da3b7ad60abb2848ad8848cd017d83a4316c6))
* **HLS:** Fix external subtitles out of sync in HLS ([#5491](https://github.com/shaka-project/shaka-player/issues/5491)) ([38c8a88](https://github.com/shaka-project/shaka-player/commit/38c8a88a9c04e25b02784c00117f6a3ff11e007d))
* Remove duplicate adaptation event before init ([#5492](https://github.com/shaka-project/shaka-player/issues/5492)) ([75a55b5](https://github.com/shaka-project/shaka-player/commit/75a55b580baebf35a1e26e8cd7920025bc3e1b8a))
* Support fLaC and Opus codec strings in HLS ([#5454](https://github.com/shaka-project/shaka-player/issues/5454)) ([09bdd61](https://github.com/shaka-project/shaka-player/commit/09bdd61f6e47f4239bf5fbc3d60754f61ec5be94)), closes [#5453](https://github.com/shaka-project/shaka-player/issues/5453)
* **UI:** Disable right click on range elements ([#5497](https://github.com/shaka-project/shaka-player/issues/5497)) ([1c55e89](https://github.com/shaka-project/shaka-player/commit/1c55e89586e1eb6be620af86061d981349643a28))
* Update karma-local-wd-launcher to fix Chromedriver &gt;= 115, fix M1 mac ([#5489](https://github.com/shaka-project/shaka-player/issues/5489)) ([1ce673b](https://github.com/shaka-project/shaka-player/commit/1ce673b0442ea401037fc084342a3cd3ff801f21))
* Update karma-local-wd-launcher to fix Edge &gt;= 115 ([#5506](https://github.com/shaka-project/shaka-player/issues/5506)) ([4a9bc9b](https://github.com/shaka-project/shaka-player/commit/4a9bc9b2cef1f5c352eeebf6998162260a2973db))
* **WebVTT:** Fix text-shadow in WebVTT not working ([#5499](https://github.com/shaka-project/shaka-player/issues/5499)) ([d78547a](https://github.com/shaka-project/shaka-player/commit/d78547a79b8356b6040dbc73d922b1b87822b541))

## [4.3.8](https://github.com/shaka-project/shaka-player/compare/v4.3.7...v4.3.8) (2023-07-21)


### Bug Fixes

* **DASH:** Avoid "Possible encoding problem detected!" when appending chunked data ([#5376](https://github.com/shaka-project/shaka-player/issues/5376)) ([6ea1b0f](https://github.com/shaka-project/shaka-player/commit/6ea1b0f69fd946ee3011e3f5c60afb7a4bc787f2))
* **Demo:** Trim custom manifestUri to avoid copy-paste errors ([#5378](https://github.com/shaka-project/shaka-player/issues/5378)) ([8cc4ad9](https://github.com/shaka-project/shaka-player/commit/8cc4ad9bc75ab35906963108677b7e8ddd102408))
* Dispatch all emsg boxes, even if they are ID3 ([#5428](https://github.com/shaka-project/shaka-player/issues/5428)) ([dd649b9](https://github.com/shaka-project/shaka-player/commit/dd649b94683de06aa7e5c9d47dd90bdc63085c68))
* **docs:** fix player configuration code in drm config tutorial ([#5359](https://github.com/shaka-project/shaka-player/issues/5359)) ([89e319f](https://github.com/shaka-project/shaka-player/commit/89e319fcd1bca115f909e29206288c5e52eee3f0))
* **DRM:** broken keySystemsMapping due to multiple references of drmInfo ([#5388](https://github.com/shaka-project/shaka-player/issues/5388)) ([38b36fa](https://github.com/shaka-project/shaka-player/commit/38b36fa107b3f727babc04b161338333c6a10fbb))
* Fix captions from MP4s with multiple trun boxes ([#5422](https://github.com/shaka-project/shaka-player/issues/5422)) ([64fa19f](https://github.com/shaka-project/shaka-player/commit/64fa19f956e0f5486be253c8c7f5965fe8022d6c)), closes [#5328](https://github.com/shaka-project/shaka-player/issues/5328)
* Fix DASH rejection of streams with ColourPrimaries and MatrixCoefficients ([#5345](https://github.com/shaka-project/shaka-player/issues/5345)) ([78f6408](https://github.com/shaka-project/shaka-player/commit/78f6408c5b784e210d0add1a399d9c220af503eb))
* Fix exception on Tizen due to unsupported Array method ([#5429](https://github.com/shaka-project/shaka-player/issues/5429)) ([527af7f](https://github.com/shaka-project/shaka-player/commit/527af7f38c3cf9ecd1355706203c8c075523e0e2))
* Fix failure when drivers lag behind browser ([#5423](https://github.com/shaka-project/shaka-player/issues/5423)) ([98e2c3e](https://github.com/shaka-project/shaka-player/commit/98e2c3e857ed2da3e0b6139b9da64244b67db788))
* Gap jump at start when first jump lands in a new gap ([#5408](https://github.com/shaka-project/shaka-player/issues/5408)) ([9cb92eb](https://github.com/shaka-project/shaka-player/commit/9cb92eb96ec38a7eec7604210fcff74d6ec5dff5))
* gap jumping when gap exists at start position ([#5384](https://github.com/shaka-project/shaka-player/issues/5384)) ([c1a94ba](https://github.com/shaka-project/shaka-player/commit/c1a94baae7505c362be26062923a8fa938e47095))
* **HLS:** Add subtitle role when there are no roles ([#5357](https://github.com/shaka-project/shaka-player/issues/5357)) ([49e3734](https://github.com/shaka-project/shaka-player/commit/49e3734870122ca633e6089e7ef4fab0e28e1a0a))
* **HLS:** Fix dvh1 and dvhe detection as video codec ([#5364](https://github.com/shaka-project/shaka-player/issues/5364)) ([1181a35](https://github.com/shaka-project/shaka-player/commit/1181a35c01a02d5a3985a29c987dc6a0573bf91b))
* **HLS:** Ignore segments with zero duration ([#5371](https://github.com/shaka-project/shaka-player/issues/5371)) ([7b46edd](https://github.com/shaka-project/shaka-player/commit/7b46eddc9df497964fb66fef600d296fc6b80bbd))
* **media:** Fix region checking in livestreams ([#5361](https://github.com/shaka-project/shaka-player/issues/5361)) ([b77a947](https://github.com/shaka-project/shaka-player/commit/b77a94773dc4675b21e6c9c8ab937d5347d70411)), closes [#5213](https://github.com/shaka-project/shaka-player/issues/5213)
* Populate HDR correctly ([#5369](https://github.com/shaka-project/shaka-player/issues/5369)) ([be65280](https://github.com/shaka-project/shaka-player/commit/be652801cc3b94345d2676820c178a8716ad04e5))
* prevent access to null config_ in SimpleAbrManager ([#5362](https://github.com/shaka-project/shaka-player/issues/5362)) ([e6f69fb](https://github.com/shaka-project/shaka-player/commit/e6f69fb61be123ac7306580558000ae8c40ef564))
* **UI:** Fix resolution selection on src= ([#5367](https://github.com/shaka-project/shaka-player/issues/5367)) ([5118b24](https://github.com/shaka-project/shaka-player/commit/5118b2444cfa061f7ec275fc0cd3ac8cd493bc90))
* **WebVTT:** Add support to middle position ([#5366](https://github.com/shaka-project/shaka-player/issues/5366)) ([5fc095c](https://github.com/shaka-project/shaka-player/commit/5fc095cd72e7f4a710a6eec9b92723872283afdf))

## [4.3.7](https://github.com/shaka-project/shaka-player/compare/v4.3.6...v4.3.7) (2023-06-21)


### Bug Fixes

* CEA 608 captions not work with H.265 video streams ([#5252](https://github.com/shaka-project/shaka-player/issues/5252)) ([b08bb41](https://github.com/shaka-project/shaka-player/commit/b08bb419bf8e3183c980b59dbe4f627bd29961ae)), closes [#5251](https://github.com/shaka-project/shaka-player/issues/5251)
* **Demo:** Fix deployment of codem-isoboxer in the Demo ([#5257](https://github.com/shaka-project/shaka-player/issues/5257)) ([7e2903a](https://github.com/shaka-project/shaka-player/commit/7e2903ad0024fe704f6466d804a305159d549dc4))
* **demo:** Fix deployment of v4.3.x on appspot ([ccf5e2e](https://github.com/shaka-project/shaka-player/commit/ccf5e2e0e4babad3675565ac5c61fc9bf9bb970e))
* **Demo:** Fix error link width to avoid overlap with close button ([#5309](https://github.com/shaka-project/shaka-player/issues/5309)) ([f575dab](https://github.com/shaka-project/shaka-player/commit/f575dab1fc1809f8dca65d5b0579a1a9d97c8acb))
* Fix error when network status changes on src= playbacks ([#5305](https://github.com/shaka-project/shaka-player/issues/5305)) ([cf683f5](https://github.com/shaka-project/shaka-player/commit/cf683f59ea4b7837ec765e6d8c76115c5128426b))
* **HLS:** Avoid "Possible encoding problem detected!" when is a preload reference ([#5332](https://github.com/shaka-project/shaka-player/issues/5332)) ([9ce8cc0](https://github.com/shaka-project/shaka-player/commit/9ce8cc091b550f1c97f826f90ad73350248339b6))
* **HLS:** Avoid HLS resync when there is a gap in the stream ([#5284](https://github.com/shaka-project/shaka-player/issues/5284)) ([679dbae](https://github.com/shaka-project/shaka-player/commit/679dbaef4bcc9afa6e3e0310eb1570f16f6ed4c6))
* **HLS:** Avoid variable substitution if no variables ([#5269](https://github.com/shaka-project/shaka-player/issues/5269)) ([49afa92](https://github.com/shaka-project/shaka-player/commit/49afa92e362ab92ff4f9e286bf30b7e7948b90f6))
* **HLS:** Fix HLS seekRange for live streams ([#5263](https://github.com/shaka-project/shaka-player/issues/5263)) ([03df9cb](https://github.com/shaka-project/shaka-player/commit/03df9cba14a2fcf5c30741e1613d4570eb6f1a78))
* **HLS:** Fix seekRange for EVENT playlist not using EXT-X-PLAYLIST-TYPE ([#5220](https://github.com/shaka-project/shaka-player/issues/5220)) ([562831b](https://github.com/shaka-project/shaka-player/commit/562831bbc65c66e1eb68715afed0c07874aeb81d))
* **HLS:** Parse EXT-X-PART-INF as media playlist tag ([#5311](https://github.com/shaka-project/shaka-player/issues/5311)) ([f6210ee](https://github.com/shaka-project/shaka-player/commit/f6210ee6ee0acead33593be932a968120f5efa17))
* **HLS:** Skip EXT-X-PRELOAD-HINT without full byterange info ([#5294](https://github.com/shaka-project/shaka-player/issues/5294)) ([9e193e2](https://github.com/shaka-project/shaka-player/commit/9e193e291fdc4fe195ad480e846c0c26cae1fe3e))
* media source object URL revocation ([#5214](https://github.com/shaka-project/shaka-player/issues/5214)) ([1a89daa](https://github.com/shaka-project/shaka-player/commit/1a89daabfd284e541a3ae0a9b3c92d81dc692a3b))
* Ship to NPM without node version restrictions ([#5253](https://github.com/shaka-project/shaka-player/issues/5253)) ([ca096a8](https://github.com/shaka-project/shaka-player/commit/ca096a88e459148aab0cd14a4ca90043c7b761de)), closes [#5243](https://github.com/shaka-project/shaka-player/issues/5243)
* unnecessary parsing of in-band pssh when pssh is in the manifest ([#5198](https://github.com/shaka-project/shaka-player/issues/5198)) ([8d6494d](https://github.com/shaka-project/shaka-player/commit/8d6494d9a4eb7b29f9578e3d4ef36c3f9aff0b0c))

## [4.3.6](https://github.com/shaka-project/shaka-player/compare/v4.3.5...v4.3.6) (2023-04-27)


### Bug Fixes

* `config.streaming.preferNativeHls` only applies to HLS streams ([#5167](https://github.com/shaka-project/shaka-player/issues/5167)) ([dd7a2dc](https://github.com/shaka-project/shaka-player/commit/dd7a2dc5773fe23829b858cbc7b643652c24b1fe)), closes [#5166](https://github.com/shaka-project/shaka-player/issues/5166)
* **ads:** Fix ads starting muted behavior ([#5153](https://github.com/shaka-project/shaka-player/issues/5153)) ([d55479c](https://github.com/shaka-project/shaka-player/commit/d55479ccc5c66c4bafc942f10ea2a0cea0f9f1ad)), closes [#5125](https://github.com/shaka-project/shaka-player/issues/5125)
* **Ads:** Fix usage of EventManager on CS ([#5084](https://github.com/shaka-project/shaka-player/issues/5084)) ([259f0f7](https://github.com/shaka-project/shaka-player/commit/259f0f70b12c420d968571457bb2fb2462e98a60))
* **DASH:** Fix seeking on multiperiod content after variant change ([#5110](https://github.com/shaka-project/shaka-player/issues/5110)) ([579b5e2](https://github.com/shaka-project/shaka-player/commit/579b5e2fbbff07475c229f607db916eddb9e9fc2))
* **demo:** Fix native controls pointer events stolen by LCEVC canvas ([#5065](https://github.com/shaka-project/shaka-player/issues/5065)) ([eb6f792](https://github.com/shaka-project/shaka-player/commit/eb6f7923de22de6093d6fb8b18ccd94e45ba5ae6))
* don't use navigator.connection event listener if it isn't implemented ([#5157](https://github.com/shaka-project/shaka-player/issues/5157)) ([bfdfc7d](https://github.com/shaka-project/shaka-player/commit/bfdfc7d3e7cd35867b7da64b43167e0876d9311d)), closes [#4542](https://github.com/shaka-project/shaka-player/issues/4542)
* exclude "future" segments from presentation timeline auto correct drift calculations ([#4945](https://github.com/shaka-project/shaka-player/issues/4945)) ([0578084](https://github.com/shaka-project/shaka-player/commit/0578084fe8e7d85b18107688262a62996fa3fc9c)), closes [#4944](https://github.com/shaka-project/shaka-player/issues/4944)
* Fix fetch plugin with old implementations ([#5091](https://github.com/shaka-project/shaka-player/issues/5091)) ([18e3c51](https://github.com/shaka-project/shaka-player/commit/18e3c51825b91ba70b3e79046fcaf4a7e0f6cd05))
* Fix handling of CC when switching between codecs ([#5160](https://github.com/shaka-project/shaka-player/issues/5160)) ([c5cbdf8](https://github.com/shaka-project/shaka-player/commit/c5cbdf82fca9d7eb1d3b4ca03bef7cf1f0b4e793))
* Fix HEAD request exception ([#5194](https://github.com/shaka-project/shaka-player/issues/5194)) ([8835996](https://github.com/shaka-project/shaka-player/commit/8835996b2b22f6f4d81d7ffe0c46f48c6405c720)), closes [#5164](https://github.com/shaka-project/shaka-player/issues/5164)
* Fix missing originalUri in response filters ([#5114](https://github.com/shaka-project/shaka-player/issues/5114)) ([ed398b8](https://github.com/shaka-project/shaka-player/commit/ed398b81084c8037c7b0f5371ec43852a2031405))
* Fix race that allows multiple text streams to be loaded ([#5129](https://github.com/shaka-project/shaka-player/issues/5129)) ([2d6af2c](https://github.com/shaka-project/shaka-player/commit/2d6af2c6b7267118d9976f8a787dd5ce176eb0ea))
* Fix selectVariantsByLabel using src= ([#5154](https://github.com/shaka-project/shaka-player/issues/5154)) ([9200e43](https://github.com/shaka-project/shaka-player/commit/9200e437904b18df5a5da02c7cbff858d24dd4e4))
* Handle empty media segments for Mp4VttParser ([#5131](https://github.com/shaka-project/shaka-player/issues/5131)) ([30fd63a](https://github.com/shaka-project/shaka-player/commit/30fd63abf2d40b4fd9975515008f07b37508fb5a)), closes [#4429](https://github.com/shaka-project/shaka-player/issues/4429)
* **HLS:** Adding support for DTS Express in HLS fMP4 ([#5112](https://github.com/shaka-project/shaka-player/issues/5112)) ([#5117](https://github.com/shaka-project/shaka-player/issues/5117)) ([834c329](https://github.com/shaka-project/shaka-player/commit/834c3299bdb186dd8332eedec834e60f652283ae))
* **HLS:** Fix support of fragmented WebVTT ([#5156](https://github.com/shaka-project/shaka-player/issues/5156)) ([e54a52b](https://github.com/shaka-project/shaka-player/commit/e54a52b0bf42b453c38ba9ec1582d6809f33579a))
* **HLS:** preserve discontinuitySequence in SegmentIndex#fit ([#5066](https://github.com/shaka-project/shaka-player/issues/5066)) ([a5a4d3e](https://github.com/shaka-project/shaka-player/commit/a5a4d3e47c14f2b52c3d43dd21640a5992d20641))
* **HLS:** support discontinuities in segments mode ([#5102](https://github.com/shaka-project/shaka-player/issues/5102)) ([cfcca8e](https://github.com/shaka-project/shaka-player/commit/cfcca8e383d2255dcd22a6f6a2463c9feeb0cd57))
* **logging:** Simplify log code. ([#5050](https://github.com/shaka-project/shaka-player/issues/5050)) ([203ceca](https://github.com/shaka-project/shaka-player/commit/203cecafc3ed910d58d96f2318557ea7001ff6c3)), closes [#5032](https://github.com/shaka-project/shaka-player/issues/5032)
* mitigate uncaught type error in media_source_engine ([#5069](https://github.com/shaka-project/shaka-player/issues/5069)) ([29a27cd](https://github.com/shaka-project/shaka-player/commit/29a27cdb87bb3c36b3ddb917fadfaa473ddfe83a)), closes [#4903](https://github.com/shaka-project/shaka-player/issues/4903)
* **net:** Fix HEAD requests in new Chromium ([#5180](https://github.com/shaka-project/shaka-player/issues/5180)) ([08bd825](https://github.com/shaka-project/shaka-player/commit/08bd825cd208f2254c3549914d1bf0c267ce1e6a)), closes [#5164](https://github.com/shaka-project/shaka-player/issues/5164)
* PERIOD_FLATTENING_FAILED error with shaka 4.3.x that did not occur with shaka 3.1.2 ([#5188](https://github.com/shaka-project/shaka-player/issues/5188)) ([a180b28](https://github.com/shaka-project/shaka-player/commit/a180b282688470c451d1b4156027bad43abaeb95)), closes [#5183](https://github.com/shaka-project/shaka-player/issues/5183)
* Prevent bad calls to MediaSource.endOfStream ([#5071](https://github.com/shaka-project/shaka-player/issues/5071)) ([ba6988f](https://github.com/shaka-project/shaka-player/commit/ba6988f38bfc7ff12180982ad63a64b57e4c103a)), closes [#5070](https://github.com/shaka-project/shaka-player/issues/5070)
* prevent memory leak in SimpleAbrManager while destroying ([#5149](https://github.com/shaka-project/shaka-player/issues/5149)) ([f32b11f](https://github.com/shaka-project/shaka-player/commit/f32b11f0a5376ee79144aa66293477de4fe6947f))
* Tizen video error fixed by checking the extended MIME type ([#4973](https://github.com/shaka-project/shaka-player/issues/4973)) ([5a19240](https://github.com/shaka-project/shaka-player/commit/5a192405ecf85df56795011ec59b39372234a9a5)), closes [#4634](https://github.com/shaka-project/shaka-player/issues/4634)
* **Tizen:** Fix exceptions thrown from logging methods ([#5063](https://github.com/shaka-project/shaka-player/issues/5063)) ([8f69008](https://github.com/shaka-project/shaka-player/commit/8f69008343bd9b18304952d018af65a90ba1a73b))

## [4.3.5](https://github.com/shaka-project/shaka-player/compare/v4.3.4...v4.3.5) (2023-03-01)


### Bug Fixes

* **Ads:** Fix CS volume ad ([#5016](https://github.com/shaka-project/shaka-player/issues/5016)) ([c6e1315](https://github.com/shaka-project/shaka-player/commit/c6e1315afb9f72ab599b938e6fef564de2054e4c))
* **Ads:** Fix usage of EventManager on CS ([#5017](https://github.com/shaka-project/shaka-player/issues/5017)) ([7c408ed](https://github.com/shaka-project/shaka-player/commit/7c408ed36838dc85b6afb3e83e4fd11d475b67e9))
* **ads:** Fix VMAP ads stay muted on muted autoplay ([#4995](https://github.com/shaka-project/shaka-player/issues/4995)) ([2b9ead2](https://github.com/shaka-project/shaka-player/commit/2b9ead2c08787220f56ca4eaacba92c4e42d5cd6))
* Allow the playback of TS without mux.js ([#5041](https://github.com/shaka-project/shaka-player/issues/5041)) ([a347d25](https://github.com/shaka-project/shaka-player/commit/a347d250cfddd7ee6c645f3bba151ed1b1be9409))
* Caption can not turn off at iOS Safari ([#4978](https://github.com/shaka-project/shaka-player/issues/4978)) ([07c6cdb](https://github.com/shaka-project/shaka-player/commit/07c6cdb0959fd9af16c74c3a8b54525bd3afa267))
* **Demo:** Allow manifest type for DAI custom assets ([#4977](https://github.com/shaka-project/shaka-player/issues/4977)) ([d67ca2b](https://github.com/shaka-project/shaka-player/commit/d67ca2b3d190e7f0671f23f480fce8921efc0345))
* DrmEngine exception thrown when using FairPlay ([#4971](https://github.com/shaka-project/shaka-player/issues/4971)) ([ddc7f50](https://github.com/shaka-project/shaka-player/commit/ddc7f5043a2e0ad2807456c3387a2703cd0c2c02))
* Failed to set 'currentTime' property on 'HTMLMediaElement' on a Hisense TV ([#4962](https://github.com/shaka-project/shaka-player/issues/4962)) ([0559cf2](https://github.com/shaka-project/shaka-player/commit/0559cf2f99488eccda1d05d501d542f54df15699))
* Fallback to isTypeSupported when cast namespace is undefined ([#5012](https://github.com/shaka-project/shaka-player/issues/5012)) ([e95f8a6](https://github.com/shaka-project/shaka-player/commit/e95f8a6592e94da9a4d0b1735d7ec46427171e36))
* Fix duration error when HLS goes from LIVE to VOD ([#5001](https://github.com/shaka-project/shaka-player/issues/5001)) ([4f4f6e2](https://github.com/shaka-project/shaka-player/commit/4f4f6e2a7d2f093f1c47f22a4817acf6599677a0))
* Fix video/mp2t mimetype conversion. ([#5039](https://github.com/shaka-project/shaka-player/issues/5039)) ([09a81a7](https://github.com/shaka-project/shaka-player/commit/09a81a70381a5e0569d70616359d0c433e70bae9))
* **HLS:** Add `.tsa` and .`tsv` file extensions as valid MPEG2-TS. ([#5034](https://github.com/shaka-project/shaka-player/issues/5034)) ([938e6c1](https://github.com/shaka-project/shaka-player/commit/938e6c1846d37b4ed9116d9021adec64fdd3a449))
* Increase IndexedDB timeout ([#4984](https://github.com/shaka-project/shaka-player/issues/4984)) ([4bbcf6a](https://github.com/shaka-project/shaka-player/commit/4bbcf6ae93a201ca045bce6ea86e2f1cd1e90b2f))
* **MCap:** Remove robustness when robustness value is default ([#4953](https://github.com/shaka-project/shaka-player/issues/4953)) ([61c8a06](https://github.com/shaka-project/shaka-player/commit/61c8a067e461a7843395157e1effb75bf1c52665))
* Prevent content from being restarted after Postroll ads ([#4979](https://github.com/shaka-project/shaka-player/issues/4979)) ([68dae24](https://github.com/shaka-project/shaka-player/commit/68dae2401ad8e19463c5ce7415f522b7df4d16df)), closes [#4445](https://github.com/shaka-project/shaka-player/issues/4445)
* Reject TS content on Edge ([#5043](https://github.com/shaka-project/shaka-player/issues/5043)) ([2d6e8ee](https://github.com/shaka-project/shaka-player/commit/2d6e8ee4fa8d45ee7578c9541da6f22bd74030e4))
* **VTT:** Fix spacing between text lines ([#4961](https://github.com/shaka-project/shaka-player/issues/4961)) ([1194d74](https://github.com/shaka-project/shaka-player/commit/1194d74fa1861fe0335671800bd1980da9d57a0f))
* **WebVTT:** Tags in the WebVTT subtitle are not parsed ([#4960](https://github.com/shaka-project/shaka-player/issues/4960)) ([7f23b09](https://github.com/shaka-project/shaka-player/commit/7f23b09e83512a34966693a04947d20b8867f80d))

## [4.3.4](https://github.com/shaka-project/shaka-player/compare/v4.3.3...v4.3.4) (2023-01-31)


### Bug Fixes

* Add mux.js to support.html ([#4923](https://github.com/shaka-project/shaka-player/issues/4923)) ([fde895e](https://github.com/shaka-project/shaka-player/commit/fde895e13c4a935b39aa9bf2bc0c5dce77add0b0))
* **DASH:** Fix dynamic manifests from edgeware ([#4914](https://github.com/shaka-project/shaka-player/issues/4914)) ([983dea3](https://github.com/shaka-project/shaka-player/commit/983dea3c87796384d9b7f876e73c47545d97e980))
* Fix MediaCapabilities polyfill on Hisense ([#4927](https://github.com/shaka-project/shaka-player/issues/4927)) ([d36677f](https://github.com/shaka-project/shaka-player/commit/d36677f0db52bff2fef967e787954e8f25889d2f))
* Fix WebVTT parser failure on REGION blocks ([#4915](https://github.com/shaka-project/shaka-player/issues/4915)) ([f57a954](https://github.com/shaka-project/shaka-player/commit/f57a9541cdff50de63f41247e258673fbed0cf78))
* **HLS:** Fix detection of WebVTT subtitles in HLS by extension ([#4928](https://github.com/shaka-project/shaka-player/issues/4928)) ([86c58ee](https://github.com/shaka-project/shaka-player/commit/86c58ee1d4f6e0fe56a5aaebf9771024193a9efe)), closes [#4929](https://github.com/shaka-project/shaka-player/issues/4929)
* **HLS:** IMSC1 subtitles not working in a HLS stream ([#4942](https://github.com/shaka-project/shaka-player/issues/4942)) ([8a9156f](https://github.com/shaka-project/shaka-player/commit/8a9156fa14cd6646900bdf534714ead775fccb15))
* **VTT:** Fix combining style selectors ([#4934](https://github.com/shaka-project/shaka-player/issues/4934)) ([bd04cf1](https://github.com/shaka-project/shaka-player/commit/bd04cf15223d026bb880ab0cca2a3e6332e8f485))
* **WebVTT:** Add support to &nbsp;, &lrm; and &rlm; ([#4920](https://github.com/shaka-project/shaka-player/issues/4920)) ([d2e2d49](https://github.com/shaka-project/shaka-player/commit/d2e2d49da0593d2ee2e0e4da7e2ce9acae0798af))
* **WebVTT:** Add support to voice tag styles ([#4845](https://github.com/shaka-project/shaka-player/issues/4845)) ([4fb19fb](https://github.com/shaka-project/shaka-player/commit/4fb19fb075a89ae6a401c236b65c82d899a069d8))
* **WebVTT:** Fix horizontal positioning with cue box size ([#4949](https://github.com/shaka-project/shaka-player/issues/4949)) ([cefbe08](https://github.com/shaka-project/shaka-player/commit/cefbe083b684fc1295483e938a8576d9de81a359))
* **WebVTT:** Fix voices with styles and support to multiple styles ([#4922](https://github.com/shaka-project/shaka-player/issues/4922)) ([981bceb](https://github.com/shaka-project/shaka-player/commit/981bceb233b029b6e77499439627455913a1784d))

## [4.3.3](https://github.com/shaka-project/shaka-player/compare/v4.3.2...v4.3.3) (2023-01-13)


### Bug Fixes

* Fix exception enabling captions on HLS ([#4894](https://github.com/shaka-project/shaka-player/issues/4894)) ([1d0ad52](https://github.com/shaka-project/shaka-player/commit/1d0ad529e7e38be07df2ed08fb14a2b88098b7fc)), closes [#4889](https://github.com/shaka-project/shaka-player/issues/4889)
* Fix flattenedCues in WebVttGenerator ([#4867](https://github.com/shaka-project/shaka-player/issues/4867)) ([e062175](https://github.com/shaka-project/shaka-player/commit/e0621753a5b1342df34a87db462cc4dd18657c3b))
* Fix legacy codec support by rewriting codec metadata ([#4858](https://github.com/shaka-project/shaka-player/issues/4858)) ([92abfbc](https://github.com/shaka-project/shaka-player/commit/92abfbcca3e0288c4d2a31ef0771a4c0ed2d4405))
* Fix media source duration when using sequence mode ([#4848](https://github.com/shaka-project/shaka-player/issues/4848)) ([c9db2a0](https://github.com/shaka-project/shaka-player/commit/c9db2a073c096a7a97afc99fb10301aedbc96a87))
* Fix parsing error on Chromecast when resyncing HLS ([#4869](https://github.com/shaka-project/shaka-player/issues/4869)) ([6dfa6d7](https://github.com/shaka-project/shaka-player/commit/6dfa6d7abbc98c1d1bc18cf70cb6cf1ad80a83f4)), closes [#4589](https://github.com/shaka-project/shaka-player/issues/4589)
* Fix potential AV sync issues after seek or adaptation ([#4886](https://github.com/shaka-project/shaka-player/issues/4886)) ([72396b0](https://github.com/shaka-project/shaka-player/commit/72396b019dfe69a50526361be7bc5273786424c0)), closes [#4589](https://github.com/shaka-project/shaka-player/issues/4589)
* Fix potential duplicate segments, AV sync issues ([#4884](https://github.com/shaka-project/shaka-player/issues/4884)) ([0ac5d7e](https://github.com/shaka-project/shaka-player/commit/0ac5d7ef2ad50bbd61d183566888227e4a1dca78)), closes [#4589](https://github.com/shaka-project/shaka-player/issues/4589)
* **HLS:** Fix discontinuity tracking ([#4881](https://github.com/shaka-project/shaka-player/issues/4881)) ([2a0ab01](https://github.com/shaka-project/shaka-player/commit/2a0ab012ee11778b9e666014afd92dda2343a780)), closes [#4589](https://github.com/shaka-project/shaka-player/issues/4589)
* **HLS:** Fix support for mixed AES-128/NONE decryption ([#4847](https://github.com/shaka-project/shaka-player/issues/4847)) ([d495255](https://github.com/shaka-project/shaka-player/commit/d495255523aef39b3f6abd1aa3e5196e976c338f))
* Make encoding problem detection more robust ([#4885](https://github.com/shaka-project/shaka-player/issues/4885)) ([b1f5c9a](https://github.com/shaka-project/shaka-player/commit/b1f5c9af69dba7ba7eac352e444bd75a0d4f2ae6)), closes [#4589](https://github.com/shaka-project/shaka-player/issues/4589)
* Release region timeline when unloading ([#4871](https://github.com/shaka-project/shaka-player/issues/4871)) ([8795a66](https://github.com/shaka-project/shaka-player/commit/8795a66edaa5b9c26b687cb28dc194db56e63a9f)), closes [#4850](https://github.com/shaka-project/shaka-player/issues/4850)
* Sync each segment against EXT-X-PROGRAM-DATE-TIME ([#4870](https://github.com/shaka-project/shaka-player/issues/4870)) ([8f9162f](https://github.com/shaka-project/shaka-player/commit/8f9162f154cd63404bbe95667396a9b12fe73ca6)), closes [#4589](https://github.com/shaka-project/shaka-player/issues/4589)
* Treat regions uniquely ([#4841](https://github.com/shaka-project/shaka-player/issues/4841)) ([36a3a44](https://github.com/shaka-project/shaka-player/commit/36a3a442cffd2067a48759ad03d05d76efc5accf)), closes [#4839](https://github.com/shaka-project/shaka-player/issues/4839)
* **ui:** Avoid submitting form if player is inside form ([#4866](https://github.com/shaka-project/shaka-player/issues/4866)) ([fc98e1d](https://github.com/shaka-project/shaka-player/commit/fc98e1d90643ead45632e8a0fb43e5c18aa0a267)), closes [#4861](https://github.com/shaka-project/shaka-player/issues/4861)

## [4.3.2](https://github.com/shaka-project/shaka-player/compare/v4.3.1...v4.3.2) (2022-12-14)


### Bug Fixes

* **chapters:** removed duplicate chapters by id ([#4810](https://github.com/shaka-project/shaka-player/issues/4810)) ([3588d37](https://github.com/shaka-project/shaka-player/commit/3588d3749d1fc3fe65a4428c774b1b5ed8f51652))
* Fix duplicate updates in StreamingEngine ([#4840](https://github.com/shaka-project/shaka-player/issues/4840)) ([65e188a](https://github.com/shaka-project/shaka-player/commit/65e188aef1f9edc642b563d343aca5de4ddc5caf)), closes [#4831](https://github.com/shaka-project/shaka-player/issues/4831)
* Fix rare exception after StreamingEngine teardown ([#4830](https://github.com/shaka-project/shaka-player/issues/4830)) ([a0fcb2e](https://github.com/shaka-project/shaka-player/commit/a0fcb2ec671ddc8f7ba5380312898068456d9b1c)), closes [#4813](https://github.com/shaka-project/shaka-player/issues/4813)
* **HLS:** Fix AV sync over ad boundaries ([#4824](https://github.com/shaka-project/shaka-player/issues/4824)) ([dab9ece](https://github.com/shaka-project/shaka-player/commit/dab9ece2be19e7674b56180413ec00f36500d1dc)), closes [#4589](https://github.com/shaka-project/shaka-player/issues/4589)
* **UI:** Suppress error log from fullscreen button on desktop ([#4823](https://github.com/shaka-project/shaka-player/issues/4823)) ([656d938](https://github.com/shaka-project/shaka-player/commit/656d938d190699511c3bd600749ce4e6167059d2)), closes [#4822](https://github.com/shaka-project/shaka-player/issues/4822)

## [4.3.1](https://github.com/shaka-project/shaka-player/compare/v4.3.0...v4.3.1) (2022-12-08)


### Bug Fixes

* **cast:** Use cast platform APIs in MediaCapabilties polyfill ([#4727](https://github.com/shaka-project/shaka-player/issues/4727)) ([fb1f0dc](https://github.com/shaka-project/shaka-player/commit/fb1f0dc019be0a5ac7f6ab4e51634cee203a666f))
* **cea:** Fix MAX_ROWS in CEA-708 window ([#4757](https://github.com/shaka-project/shaka-player/issues/4757)) ([3a501c6](https://github.com/shaka-project/shaka-player/commit/3a501c6ea63cf8ed5016c53c079364fec516cfe3))
* **cea:** Fix not rendering CEA-608 on encrypted mp4 segments ([#4756](https://github.com/shaka-project/shaka-player/issues/4756)) ([501d4ca](https://github.com/shaka-project/shaka-player/commit/501d4cacc19ae6503773a47c9d5b9da2a1488b52))
* Correct default initDataTransform for legacy Apple Media Keys ([#4797](https://github.com/shaka-project/shaka-player/issues/4797)) ([ac6c4ed](https://github.com/shaka-project/shaka-player/commit/ac6c4edd0d7b91e14930da0a1901ecda333b5d47))
* Fix bufferBehind setting broken by image segments ([#4718](https://github.com/shaka-project/shaka-player/issues/4718)) ([0e813a1](https://github.com/shaka-project/shaka-player/commit/0e813a176ed725933a9c96ecccc1617d99eb8c9a)), closes [#4717](https://github.com/shaka-project/shaka-player/issues/4717)
* Fix compiler error on static use of "this" ([#4699](https://github.com/shaka-project/shaka-player/issues/4699)) ([0e2a12a](https://github.com/shaka-project/shaka-player/commit/0e2a12a0c37c0d92a6f8f1f4a264f8e2f3b47bbd))
* Fix DRM workaround for Tizen and Xbox with hvc1/hev1 boxes ([#4743](https://github.com/shaka-project/shaka-player/issues/4743)) ([c6b6cff](https://github.com/shaka-project/shaka-player/commit/c6b6cffff973163a5c34784e11286e0540c66f03)), closes [#4742](https://github.com/shaka-project/shaka-player/issues/4742)
* Fix subtitles not added to DOM region ([#4733](https://github.com/shaka-project/shaka-player/issues/4733)) ([eea7858](https://github.com/shaka-project/shaka-player/commit/eea78580f45a708bd79d582253aea137b22b9ad5)), closes [#4680](https://github.com/shaka-project/shaka-player/issues/4680)
* Fix timestamp offset for ID3 on DAI-HLS ([#4696](https://github.com/shaka-project/shaka-player/issues/4696)) ([52aa102](https://github.com/shaka-project/shaka-player/commit/52aa102a70af82adafc5bb8ceaba2d5b5be0a84e))
* Fix usage of WebCrypto in old browsers ([#4711](https://github.com/shaka-project/shaka-player/issues/4711)) ([2fec68b](https://github.com/shaka-project/shaka-player/commit/2fec68b83070f265b88cb6871ecd3351f9873b26))
* **HLS:** Fix detection of Media Playlist for audio and video only in MP4 ([#4803](https://github.com/shaka-project/shaka-player/issues/4803)) ([f814d26](https://github.com/shaka-project/shaka-player/commit/f814d26039aa143c991008788a856285e9c34d84))
* **HLS:** fix lazy load with multiple raw audio tracks ([#4715](https://github.com/shaka-project/shaka-player/issues/4715)) ([ec2a3d6](https://github.com/shaka-project/shaka-player/commit/ec2a3d6f5b67fd8c98df3928b3101b8985aebd71))
* **HLS:** Fix lowLatencyPresentationDelay when using autoLowLatencyMode ([#4712](https://github.com/shaka-project/shaka-player/issues/4712)) ([824886d](https://github.com/shaka-project/shaka-player/commit/824886d759058ee25260da5fd3d0ad107ea9f6a1))
* **HLS:** Fix missing roles ([#4760](https://github.com/shaka-project/shaka-player/issues/4760)) ([d27f023](https://github.com/shaka-project/shaka-player/commit/d27f0230cf96d3c396156ce7f748e7f5b5f0d719)), closes [#4759](https://github.com/shaka-project/shaka-player/issues/4759)
* **HLS:** Fix support legacy AVC1 codec used in HLS ([#4716](https://github.com/shaka-project/shaka-player/issues/4716)) ([c7e83c4](https://github.com/shaka-project/shaka-player/commit/c7e83c4f46ff0db8db90f0746dda03758338c64f))
* **hls:** Fix type error in lazy-loading ([#4687](https://github.com/shaka-project/shaka-player/issues/4687)) ([ad41cf4](https://github.com/shaka-project/shaka-player/commit/ad41cf4f4a9bfd30637b121908b5daac108d823f))
* **HLS:** Single alternative video renditions not working ([#4785](https://github.com/shaka-project/shaka-player/issues/4785)) ([f0024fc](https://github.com/shaka-project/shaka-player/commit/f0024fc21ba774cc13fa7441dc28c53b5afe310b))
* Polyfill missing AbortController on Tizen ([#4707](https://github.com/shaka-project/shaka-player/issues/4707)) ([76fae10](https://github.com/shaka-project/shaka-player/commit/76fae10e44072d2561ca1a424311a7c10b9d4cf3))
* **TTML:** Add font-family mapping ([#4801](https://github.com/shaka-project/shaka-player/issues/4801)) ([57780dd](https://github.com/shaka-project/shaka-player/commit/57780dd449e31da83c37badb65b0d3e71cf8524c))
* **TTML:** Fix duplicate cues overlapping segment boundaries ([#4798](https://github.com/shaka-project/shaka-player/issues/4798)) ([9faf848](https://github.com/shaka-project/shaka-player/commit/9faf84801a1cf8da5b2261def2b24985f8d07366)), closes [#4631](https://github.com/shaka-project/shaka-player/issues/4631)
* **ui:** Check event cancelable before event.preventDefault ([#4690](https://github.com/shaka-project/shaka-player/issues/4690)) ([7a3e66d](https://github.com/shaka-project/shaka-player/commit/7a3e66dce32e78b16de02e070d41949626f736d8))
* **ui:** Fix iOS fullscreen on rotation ([#4679](https://github.com/shaka-project/shaka-player/issues/4679)) ([8504c17](https://github.com/shaka-project/shaka-player/commit/8504c17ee618f7a1d24302d0e219d6b605339151))


### Performance Improvements

* Caching mediaSource support for browser engine ([#4778](https://github.com/shaka-project/shaka-player/issues/4778)) ([7d2d485](https://github.com/shaka-project/shaka-player/commit/7d2d48596f1fb8f164dd4a861227a2863b4eb68f))

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


## Older changelogs:
 - [v3.3.x](https://github.com/shaka-project/shaka-player/blob/v3.3.x/CHANGELOG.md)
 - [v3.2.x](https://github.com/shaka-project/shaka-player/blob/v3.2.x/CHANGELOG.md)
 - [v3.1.x](https://github.com/shaka-project/shaka-player/blob/v3.1.x/CHANGELOG.md)
 - [v3.0.x](https://github.com/shaka-project/shaka-player/blob/v3.0.x/CHANGELOG.md)
 - [ancient](https://github.com/shaka-project/shaka-player/blob/v2.5.x/CHANGELOG.md)
