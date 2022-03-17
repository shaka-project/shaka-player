
# Shaka Player LCEVC integration

# Introduction

This article describes the V-Nova LCEVC Shaka Player integration.

Shaka Player is an open-source JavaScript library for adaptive media. It plays adaptive media formats (such as [DASH](http://dashif.org/) and [HLS](https://developer.apple.com/streaming/)) in a browser, without using plugins or Flash. Instead, Shaka Player uses the open web standards [MediaSource Extensions](https://www.w3.org/TR/media-source/) and [Encrypted Media Extensions](https://www.w3.org/TR/encrypted-media/).

The official project GitHub repository is <https://github.com/google/shaka-player>. This integration is a fork from the Shaka Player open source project from version 3.3.0-pre with commit hash: 73b430248ba76038b466da902b776ecc920b2a35.

# LCEVC integration

## Adding V-Nova required files

The Shaka Player project uses a custom tool from Google called Closure Compiler that is a powerful, low-level JavaScript library designed for building complex and scalable web applications. It is used by many Google web applications, such as Google Search, Gmail, Google Docs, Google+, Google Maps, and others.

It parses the JavaScript code, analyzes it, removes dead code and rewrites and minimizes what's left. It also checks syntax, variable references, and types, and warns about common JavaScript pitfalls.

### Importing Dil.js

In order to import the necessary V-Nova libraries we followed the approach that other externals libraries are using. The necessary V-Nova files need to be imported in the HTML page that is going to use the Shaka Player library.

We have at as an npm package : <https://www.npmjs.com/package/lcevc_dil.js>

```javascript
  <!-- MPEG-5 Part2 LCEVC support is enabled by including this: -->
  <script defer src="../node_modules/lcevc_dil.js/dist/lcevc_dil.min.js"></script>
```

To allow the Closure compiler to use the objects and methods that are exported by the DIL.js we created an `extern`.

### Defining an Extern for LCEVC

Externs are declarations that tell Closure Compiler the names of symbols that should not be renamed during advanced compilation. They are called externs because these symbols are most often defined by code outside the compilation, such a native code, or third-party libraries. For this reason, externs often also have type annotations, so that Closure Compiler can type check your use of those symbols.

In general, it is best to think of externs as an API contract between the implementor and the consumers of some piece of compiled code. The externs define what the implementor promises to supply, and what the consumers can depend on using. Both sides need a copy of the contract. Externs are similar to header files in other languages.

We created the file `externs/lcevc.js` file that exposes the following methods:

`constructor(media, canvas, dilConfig):` It receives the video element (media), the canvas, and the Dil configuration as a JSON string and creates the LcevcDil object.

`appendBuffer(data, type, level):` Appends the MP4 fragments before the they are appended to the Media Source Extensions SourceBuffer.

`setCurrentLevel(level):` Sets the current level of the fragment.

`setLevelSwitching(level, autoBufferSwitch):` Sets the next level on variant change for the to be rendered buffer.

`setContainerFormat(containerFormat):` Set the container format of the stream.

`close():` Close LCEVC DIL Object.

We have also created a config option for enabling LCEVC in `externs/shaka/player.js`.

```javascript
  /**
  * @typedef {{
  *   enabled: boolean
  * }}
  *
  * @description
  *   Decoding for MPEG-5 Part2 LCEVC.
  *
  * @property {boolean} enabled
  *   If <code>true</code>, enable LCEVC data to be passed to LCEVC Dil and
  *   decode frames on a canvas element.
  *   Defaults to <code>false</code>.
  * @exportDoc
  */
  shaka.extern.LcevcConfiguration;

```

## Integration point

### The shaka.lcevc.Dil class

The main logic of the LCEVC integration is located in the `lib/lcevc_dil.min.js` file. In this file the shaka.lcevc.Dil is exported to be used in the project. This class is in charge of creating the Dil object using the already mentioned extern, creating the canvas object and resizing it to be coordinated with the video element, checking if Dil is available, etc.

### Modifications in the player

The shaka.Player class, defined in the `lib/player.js` file, is the main player object for Shaka Player. We modified the constructor of this class by adding two new parameters, which are the canvas element and the Dil configuration.

Both LcevcConfig and canvas parameters can be left blank. In that case, default settings are used to create the Dil, and a new canvas element is created to match the video element.

```javascript
  /**
   * @param {HTMLMediaElement=} mediaElement
   *    When provided, the player will attach to <code>mediaElement</code>,
   *    similar to calling <code>attach</code>. When not provided, the player
   *    will remain detached.
   * @param {function(shaka.Player)=} dependencyInjector Optional callback
   *   which is called to inject mocks into the Player.  Used for testing.
   * @param {?HTMLCanvasElement} [canvas] Optional canvas where LCEVC
   *    video will be drawn.
   * @param {?Object} [lcevcDilConfig] Optional canvas where LCEVC
   *    video will be drawn.
   */
  constructor(mediaElement, dependencyInjector, canvas, lcevcDilConfig={}) {
    super();

    /** @private {?HTMLCanvasElement} */
    this.canvas_ = null;

    /** @private {?shaka.lcevc.Dil} */
    this.lcevcDil_ = null;

    /** @private {?Object} */
    this.lcevcDilConfig_ = lcevcDilConfig;
```

The config option to enable LCEVC comes from the `shaka.config_.lcevc` where we decide to enable the lcevc workflow only if the flag is enabled.

On the other hand, if a canvas element is provided to the constructor, this canvas it is used to draw the LCEVC enhanced video and no styles are applied. The user is responsible for placing the canvas element in the desired position.

The Dil object is created in the `onLoad_()` event that is triggered when a new video is loaded in Shaka Player. Attaching to a media element is defined as:

-   Registering error listeners to the media element.
-   Catching the video element for use outside of the load graph.

The LCEVC workflow is only enabled when the config option for LCEVC is enabled.
The Dil object is created only if LCEVC is supported (LCEVC libs are loaded) and the config object for lcevc is enabled also if it was not already created in another `onLoad_()` event execution.

```javascript
  this.setupLcevc_(this.config_.lcevc.enabled);
```

```javascript
 
  /**
   * Create a shaka.lcevc.Dil object
   * @private
   */
  createDIL_() {
    if (this.lcevcDil_ == null) {
      this.lcevcDil_ = new shaka.lcevc.Dil(
          this.video_,
          this.canvas_,
          this.lcevcDilConfig_,
      );
      this.canvas_ = this.lcevcDil_.canvas_;
      this.lcevcDil_.media_.style.display = 'none';
      this.mediaSourceEngine_.updateLcevcDil(this.lcevcDil_);
    }
  }

  /**
   * Close a shaka.lcevc.Dil object
   * @private
   */
  closeDIL_() {
    if (this.lcevcDil_ != null) {
      if (this.lcevcDil_.media_) {
        this.lcevcDil_.media_.style.display = 'block';
        this.lcevcDil_.canvas_.style.display = 'none';
      }
      this.lcevcDil_.close();
      delete this.lcevcDil_;
      this.lcevcDil_ = null;
    }
  }

  /**
   * Setup shaka.lcevc.Dil object
   * @private
   */
  setupLcevc_(enabled) {
    if (enabled) {
      if (this.lcevcDil_) {
        this.lcevcDil_.reset();
      } else {
        this.createDIL_();
      }
    } else {
      if (this.lcevcDil_) {
        this.closeDIL_();
      }
    }
  }

```

### Feeding the Dil

The logic that Shaka Player uses to communicate with the Media Source Extensions (MSE) is located in the `media/media_source_engine.js` file.

![image.png](lcevc-architecture.png)

In order to feed the Dil with the video segments we needed to intercept where the Source buffer of MSE is being fed and this is done in the `append_()` method. We modified this method and now before feeding the MSE source buffer we are appending the data to the Dil object.

```javascript
  /**
   * Append data to the SourceBuffer.
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @param {BufferSource} data
   * @private
   */
  append_(contentType, data) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    if (contentType == ContentType.VIDEO && this.lcevcDil_) {
      this.lcevcDil_.appendBuffer(data);
    }

    // This will trigger an 'updateend' event.
    this.sourceBuffers_[contentType].appendBuffer(data);
  }
```

## Demo page

In order to test the integration, we modified the default demo page of Shaka Player. As the integration is almost transparent for who uses the Shaka Player library, we only need to make a few changes.

We need to import the Dil and Dpi libraries in the `index.html` file.

We have at as an npm package : <https://www.npmjs.com/package/lcevc_dil.js>

```javascript
  <!-- MPEG-5 Part2 LCEVC support is enabled by including this: -->
  <script defer src="../node_modules/lcevc_dil.js/dist/lcevc_dil.min.js"></script>
```

And we added a new video sample with enhancement data the `demo/common/assets.js` file.

```javascript
shakaAssets.testAssets = [
  // Shaka assets {{{
  new ShakaDemoAssetInfo(
      /* name= */ 'Big Buck Bunny (LCEVC H264)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/big_buck_bunny.png',
      /* manifestUri= */ 'https://d3mfda3gpj3dw1.cloudfront.net/vnt7topK63ddrPqk/master.m3u8',
      /* source= */ shakaAssets.Source.SHAKA)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.WEBM)
      .addFeature(shakaAssets.Feature.OFFLINE)
      .addDescription('H264 HLS stream with LCEVC enhancement')
      .markAsFeatured('Big Buck Bunny (LCEVC H264)')
      .setExtraConfig({
        lcevc: {
          enabled: true,
        },
      }),
```

And after these changes this is the result

![image.png](lcevc-demo.png)

          