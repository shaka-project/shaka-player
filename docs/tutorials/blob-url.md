# Blob URL

In case you need shaka-player to load a blob url mpd:

#### For version v2.x

- Register blob scheme to network engine (note: you don't have to do this in v3.x)
  `shaka.net.NetworkingEngine.registerScheme('blob', shaka.net.HttpFetchPlugin);`
- With blobs, neither extension nor MIME type can be used to deduce which manifest parser to use.
  But there is an easy fix is register manifestParserFactory when load player
  `player.load: player.load(uri, null, shaka.dash.DashParser);`
- Relative URIs in the manifest are broken because the original manifest URI is lost.
  This can be worked around with either absolute URIs or the use of BaseURL element in DASH.

#### For version v3.x (v3.2 and up)

- In v3.x, blob scheme is added to shaka.net.HttpFetchPlugin,
  However, if you are using v3.0 or v3.1 you need to manually register it
  ```
  shaka.net.NetworkingEngine.registerScheme(
      'blob', shaka.net.HttpFetchPlugin.parse,
      shaka.net.NetworkingEngine.PluginPriority.PREFERRED, true
  );
  ```
- In v3.x, we change our player load api, to use player load with blob url
  `player.load(computedMpdBlobURL, null, 'application/dash+xml');`
- Relative URIs in the manifest are broken because the original manifest URI is lost.
  This can be worked around with either absolute URIs or the use of BaseURL element in DASH.
