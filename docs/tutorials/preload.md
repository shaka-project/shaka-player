# Preload API

In some situations, you may wish to begin loading an asset before Shaka Player
has been attached to a video, or before you have fully committed to playing it.
Perhaps you have a menu in which users select multiple assets, and you want to
preload the assets they mouse over to reduce load latency when those assets are
selected.
In situations like that, the Shaka Player preload API can be useful.


#### Basic Usage

To preload an asset, call the preload method on a player instance.

```js
async function initPlayer() {
  const player = new shaka.Player();
  const preloadManager = await player.preload(
      'https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd');
  if (preloadManager) {
    // The asset is something that can be preloaded. Once you have this manager,
    // you can load it later by passing it to the load method:
    await player.load(preloadManager);
    // If you decide to not play the preloaded asset, you can instead destroy
    // the preload manager:
    await preloadManager.destroy();
  } else {
    // This asset is something that cannot be preloaded (for instance, a raw
    // media file, or browser-based HLS on Safari), so the promise of the
    // preload method yielded null.
  }
}
```
You need a player instance to preload an asset, and you must use the returned
preloadManager on the same player instance.
The preloading process loads the manifest and first segments of the asset. It
will not load the whole asset ahead of time.
If you need to define any response or request filters for your assets to be
downloaded, remember to do it before calling `player.preload`.

The preload method can be provided an optional startTime and mimeType parameter,
much the same as the load method.
```js
const preloadManager = await player.preload(
    'https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd',
    15, 'application/dash+xml');
```


#### Saving Preloaders

The preload API can also be used to unload the player while saving some data
from the playback session, to allow for playback to resume in the future
without having to download as much.
To do this, instead of calling unload on the player, call the
unloadAndSavePreload method:

```js
// This both unloads the player, and creates a preload manager for the currently
// playing asset.
const preloadManager = await player.unloadAndSavePreload();
```

The resulting preload manager can be used just like one created via the preload
method. Much like a normal preload manager, it must be used on the same player
instance that created it. It contains the loaded manifest, and stores the time of the video and last abr estimates.