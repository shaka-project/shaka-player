
# Shaka Player LCEVC integration

# Introduction

This article describes the V-Nova LCEVC Shaka Player integration.

# LCEVC Integration

## Adding V-Nova required files

The Shaka Player project uses a custom tool from Google called Closure Compiler that is a powerful, low-level JavaScript library designed for building complex and scalable web applications. It is used by many Google web applications, such as Google Search, Gmail, Google Docs, Google+, Google Maps, and others.

It parses the JavaScript code, analyzes it, removes dead code and rewrites and minimizes what's left. It also checks syntax, variable references, and types, and warns about common JavaScript pitfalls.

### Importing Dil.js

In order to import the necessary V-Nova libraries we followed the approach that other external libraries are using. The necessary V-Nova files need to be imported in the HTML page that is going to be used by Shaka Player to decode LCEVC.

Npm package : <https://www.npmjs.com/package/lcevc_dil.js>

```javascript
  <!-- MPEG-5 Part2 LCEVC support is enabled by including this: -->
  <script defer src="../node_modules/lcevc_dil.js/dist/lcevc_dil.min.js"></script>
```

To allow the Closure compiler to use the objects and methods that are exported by the DIL.js we created an `extern`.

### Defining an Extern for LCEVC

We have created the file `externs/lcevc.js` file that exposes the following methods:

`constructor(media, canvas, dilConfig):` It receives the video element (media), the canvas, and the Dil configuration as a JSON string and creates the LcevcDil object.

`appendBuffer(data, type, level):` Appends the MP4 fragments before they are appended to the Media Source Extensions SourceBuffer.

`setCurrentLevel(level):` Sets the current level of the fragment.

`setLevelSwitching(level, autoBufferSwitch):` Sets the next level on variant change for the to be rendered buffer.

`setContainerFormat(containerFormat):` Set the container format of the stream.

`close():` Close LCEVC DIL Object.

## Integration point

### The shaka.lcevc.Dil class - (Dil : Decoder Integration Layer)

The main logic of the LCEVC integration is located in the `lib/lcevc_dil.min.js` file. In this file the shaka.lcevc.Dil is exported to be used in the project. This class is in charge of creating the Dil object using the already mentioned extern, creating the canvas object and resizing it to be coordinated with the video element, checking if Dil is available, etc.

### Modifications in the player

The shaka.Player class, defined in the `lib/player.js` file, is the main player object for Shaka Player. We modified the constructor of this class by adding two new parameters, which are the canvas element and the Dil configuration.

Both LcevcConfig and canvas parameters can be left blank. In that case, default settings are used to create the Dil, and a new canvas element is created to match the video element.

```javascript
  constructor(mediaElement, dependencyInjector, canvas, lcevcDilConfig={})
```

On the other hand, if a canvas element is provided to the constructor, this canvas it is used to draw the LCEVC enhanced video and no styles are applied. The user is responsible for placing the canvas element in the desired position.

The Dil object is created in the `onLoad_()` event that is triggered when a new video is loaded in Shaka Player. Attaching to a media element is defined as:

-   Registering error listeners to the media element.
-   Catching the video element for use outside of the load graph.

The Dil object is created only if LCEVC is supported (LCEVC libs are loaded on the page) and also when it was not already created in another `onLoad_()` event execution.


### Feeding the Dil

The logic that Shaka Player uses to communicate with the Media Source Extensions (MSE) is located in the `media/media_source_engine.js` file.

![image.png](lcevc-architecture.png)

In order to feed the Dil with the video segments we needed to intercept where the Source buffer of MSE is being fed and this is done in the `append_()` method. We modified this method and now before feeding the MSE source buffer we are appending the data to the Dil object.

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
new ShakaDemoAssetInfo(
      /* name= */ 'Big Buck Bunny (LCEVC H264)',
      /* iconUri= */ 'https://storage.googleapis.com/shaka-asset-icons/big_buck_bunny.png',
      /* manifestUri= */ 'https://dyctis843rxh5.cloudfront.net/vnIAZIaowG1K7qOt/master.m3u8',
      /* source= */ shakaAssets.Source.SHAKA)
      .addFeature(shakaAssets.Feature.HLS)
      .addFeature(shakaAssets.Feature.HIGH_DEFINITION)
      .addFeature(shakaAssets.Feature.MP4)
      .addFeature(shakaAssets.Feature.WEBM)
      .addFeature(shakaAssets.Feature.OFFLINE)
      .addDescription('H264 HLS stream with LCEVC enhancement')
      .markAsFeatured('Big Buck Bunny (LCEVC H264)')
      .setExtraConfig({
        streaming: {
          useNativeHlsOnSafari: false,
          forceTransmuxTS: true,
        },
      })
```

And after these changes this is the result

![image.png](lcevc-demo.png)

          