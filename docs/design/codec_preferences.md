# Shaka Player Codec Preferences Upgrade Design

last update: 2021-03-04

by: [michellezhuo@google.com](mailto:michellezhuo@google.com)


## Objective

Allow the applications to make smarter, dynamic and configurable decisions to
choose codecs and DRM key systems in Shaka Player.


## Overview

By adopting the [MediaCapabilities API][] in Shaka Player, we can leverage the
decoding information, and select the most appropriate codec and resolution of
the media content dynamically for the user’s device to play.

This project allows us to:
- Determine not only whether media assets are playable, but also whether they
  are playable in an efficient and performant manner
- Simplify the logic of determining the DRM key system compatibility

Besides leveraging the decoding information from MediaCapabilities, we are
offering a few new configurations for the applications to specify their codec
preferences. The new configurations include:
- `drm.preferredKeySystems`
- `preferredDecodingAttributes`
- `preferredCodecs`

[MediaCapabilities API]: https://developer.mozilla.org/en-US/docs/Web/API/Media_Capabilities_API


## API changes

### Asynchronous `StreamUtils.filterManifest`

Previously, all of the manifest filtering happens within the
`StreamUtils.filterManifest`. Now `StreamUtils.filterManifest` will call
`MediaCapabilities.decodingInfo` to get the decoding information for manifest
filtering and then codec choosing.

Since the `MediaCapabilities.decodingInfo` happens asynchronously, the
`StreamUtils.filterManifest` will be changed to asynchronous.


## New Configurations

### Configurable codec preferences

The MediaCapabilities API provides the Player with whether decoding the media
is:
- supported
- smooth
- power efficient

We want to allow applications to choose the ideal codec based on the decoding
information of the codecs dynamically. The application can specify by
the following attributes:
- smooth
- power efficient
- lowest bandwidth

The `preferredDecodingAttributes` configuration allows the application to
specify choosing the ideal codec based on which attributes. It takes an array
of enum strings as its value. The order of the values in the array specifies
the priorities of the attributes.

For example, the application can set the configuration as:

```js
player.configure('preferredDecodingAttributes', [
  'smooth',
  'bandwidth',
]);
```

Based on the configuration, Shaka Player will:
1. Choose the codec with the smooth variants (unless there are none)
2. If more than one codecs have smooth variants, choose the codec with the
   lowest bandwidth.

### Configurable codec priorities

If more than one codec are supported and available for choosing, and
`preferredDecodingAttributes` is not configured, an application can specify
which codecs it prefers via the `preferredCodecs` config.

```js
player.configure('preferredCodecs', ['avc1', 'vp09']);
```

### Configurable key system priorities

A platform may support multiple DRM key systems, (for example, Widevine and
PlayReady). The `drm.preferredKeySystems` configuration allows the application
to specify which key systems it wants to choose.

[Github issue](https://github.com/google/shaka-player/issues/3002)

Previously, Shaka Player chose a DRM key system based on:
1. Only use the key systems supported by the platform.
2. Only use the key systems with configured license server urls.
3. Choose based on the order of the key systems in the manifest. We try the
first one, then the second one, until we get a valid keySystemAccess.

Now the application can set the configuration as:

```js
player.configure('drm.preferredKeySystems', [
  'com.widevine.alpha',
  'com.microsoft.playready',
]);
```

With `drm.preferredKeySystems` configured, Shaka Player would:
1. Based on the preference order specified with the `drm.preferredKeySystems`,
   try to find the matching key systems. In the example above, the Player looks
   for the codec with 'com.widevine.alpha' key system first. If none is
   available, the Player looks for a codec with 'com.microsoft.playready'.
2. If no preferred key system in the config is available in the manifest, we
   fall back to the old behavior.
3. If no such configuration is given, we fall back to the old behavior.


## Codec Preferences Algorithm

With the new configurations, the Player takes the following steps to choose a
codec:
1. Choose the supported variants
2. If the content is encrypted:
   1. If `drm.preferredKeySystems` is configured, choose the key system based on
      the order of the preferred key systems.
   2. Otherwise, fall back to the default behavior:
      1. Use the key systems that we have a license server for.
      2. Choose the first key system with the order in the manifest.
4. If `preferredDecodingAttributes` is configured, sort the codecs by the
   `preferredDecodingAttributes` in order.
5. If `preferredDecodingAttributes` is not configured and more than one codecs
   are available for choosing:
   1. If `preferredAudioChannelCount` is configured, choose the variants with
      the audio channel count equal to `preferredAudioChannelCount`.
   2. If the `preferredCodecs` is configured, choose the codecs equal to the
      preferred codec.
   3. If the `preferredCodecs` is not configured, choose the codec with the
      lowest bandwidth by default.

If the new configurations are not specified, the codec preferences algorithm is
consistent with the current Player behavior.


## Challenges

Currently the filtering, sorting and choosing algorithms are in various places
in our code base, including `StreamUtils.filterManifest`, `DrmEngine`, and
`StreamUtils.chooseCodecsAndFilterManifest`.  To simplify the code and improve
readability, we’ll conduct the new codec preferences algorithm in one place.
