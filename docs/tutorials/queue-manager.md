# Queue Manager

The `QueueManager` allows you to manage a playlist of media items in Shaka Player,
handling automatic progression, repeat modes, and preloading of adjacent items to
minimize transition latency.

It is automatically created and associated with a `shaka.Player` instance — you
do not need to instantiate it directly.


#### Basic Usage

Retrieve the `QueueManager` from a player instance and insert items to play:

```js
async function initPlayer() {
  const video = document.getElementById('video');
  const player = new shaka.Player();
  await player.attach(video);

  const queueManager = player.getQueueManager();

  // Insert one or more items into the queue
  queueManager.insertItems([
    { manifestUri: 'https://example.com/video1/dash.mpd' },
    { manifestUri: 'https://example.com/video2/dash.mpd' },
    { manifestUri: 'https://example.com/video3/dash.mpd' },
  ]);

  // Start playback from the first item
  await queueManager.playItem(0);
}
```

Each item in the queue is a `QueueItem` object. At minimum it requires a
`manifestUri`, but it also accepts optional fields:

```js
{
  manifestUri: 'https://example.com/video.mpd',  // Required
  startTime: 30,                                  // Optional: start offset in seconds
  mimeType: 'application/dash+xml',              // Optional: hint for the player
  config: { /* shaka.extern.PlayerConfiguration */ }, // Optional: per-item config
  preloadManager: null,                           // Optional: pre-built PreloadManager
  extraText: [...],                               // Optional: additional text tracks
  extraThumbnail: [...],                          // Optional: additional thumbnail tracks
  extraChapter: [...],                            // Optional: additional chapter tracks
  metadata: { /* shaka.extern.QueueItemMetadata */ }, // Optional: display metadata
}
```


#### Navigating the Queue

You can jump to any item by index, and inspect the current state of the queue
at any time:

```js
// Play the third item (zero-based index)
await queueManager.playItem(2);

// Get the currently playing item
const currentItem = queueManager.getCurrentItem();
console.log('Now playing:', currentItem.manifestUri);

// Get the current index
const index = queueManager.getCurrentItemIndex();

// Get a snapshot of all items in the queue
const allItems = queueManager.getItems();
console.log(`Queue has ${allItems.length} items`);
```

`playItem` throws a `shaka.util.Error` with code `QUEUE_INDEX_OUT_OF_BOUNDS`
if the provided index is out of range.


#### Repeat Modes

The `QueueManager` supports three repeat modes, configured via
`queueManager.configure()`:

```js
queueManager.configure({
  repeatMode: shaka.config.RepeatMode.ALL, // Repeat the whole queue
});
```

| Mode | Behaviour |
|---|---|
| `shaka.config.RepeatMode.OFF` | Playback stops after the last item. |
| `shaka.config.RepeatMode.SINGLE` | The current item loops indefinitely. |
| `shaka.config.RepeatMode.ALL` | The queue loops back to the first item after the last. |

The default mode is `OFF`.


#### Preloading Adjacent Items

To reduce the transition delay between items, the `QueueManager` can
automatically preload the next item as the current one approaches its end, and
optionally preserve a preload of the previous item in case the user seeks back.

```js
queueManager.configure({
  repeatMode: shaka.config.RepeatMode.ALL,

  // Start preloading the next item when this many seconds remain in the current one
  preloadNextUrlWindow: 30,

  // Save a preload of the previous item when advancing forward
  preloadPrevItem: true,
});
```

When `preloadNextUrlWindow` is set to a positive value, the manager listens to
the playback position and triggers a `player.preload()` call automatically.
You do not need to manage this yourself.

If `preloadPrevItem` is `true`, navigating to the next item will internally
call `player.unloadAndSavePreload()` on the current one, so going back is
faster. This only works when the player is in `MEDIA_SOURCE` load mode.


#### Listening to Queue Events

The `QueueManager` extends `FakeEventTarget` and dispatches events you can
subscribe to:

```js
queueManager.addEventListener('currentitemchanged', () => {
  const item = queueManager.getCurrentItem();
  console.log('Now playing:', item.manifestUri);
});

queueManager.addEventListener('itemsinserted', () => {
  console.log('Items added. Queue length:', queueManager.getItems().length);
});

queueManager.addEventListener('itemsremoved', () => {
  console.log('Queue cleared.');
});
```

| Event | Fired when |
|---|---|
| `currentitemchanged` | `playItem()` is called with a different index than the current one. |
| `itemsinserted` | `insertItems()` is called. |
| `itemsremoved` | `removeAllItems()` is called. |


#### Adding Extra Tracks per Item

Each `QueueItem` can carry additional text, thumbnail, or chapter tracks that
are added to the player automatically once streaming begins:

```js
queueManager.insertItems([
  {
    manifestUri: 'https://example.com/video.mpd',
    extraText: [
      {
        uri: 'https://example.com/subtitles-en.vtt',
        language: 'en',
        kind: 'subtitle',
        mime: 'text/vtt',
      },
    ],
    extraThumbnail: [
      'https://example.com/thumbnails.vtt',
    ],
    extraChapter: [
      {
        uri: 'https://example.com/chapters-en.vtt',
        language: 'en',
        mime: 'text/vtt',
      },
    ],
  },
]);
```

All extra tracks for a given item are added in parallel after the `streaming`
event fires, so they do not block initial playback.


#### Item Metadata

Each `QueueItem` accepts an optional `metadata` field of type
`shaka.extern.QueueItemMetadata`. It has two well-known properties —
`title` and `poster` — and supports any additional arbitrary properties
your application needs (they are not type-checked by Shaka).

```js
queueManager.insertItems([
  {
    manifestUri: 'https://example.com/video.mpd',
    metadata: {
      title: 'My Awesome Video',
      poster: 'https://example.com/poster.jpg',
      // Any extra application-level data is allowed:
      description: 'An optional description for your UI',
      durationSeconds: 3600,
    },
  },
]);
```

You can read the metadata back from `getCurrentItem()` to drive your own UI
(e.g. update a title bar or thumbnail while the item changes):

```js
queueManager.addEventListener('currentitemchanged', () => {
  const item = queueManager.getCurrentItem();
  if (item?.metadata) {
    document.getElementById('title').textContent = item.metadata.title ?? '';
    document.getElementById('poster').src = item.metadata.poster ?? '';
  }
});
```

Note: `metadata` is purely application-side data. Shaka Player does not read
or use it internally.


#### Per-item Player Configuration

If different items in your queue require different player settings (e.g.
different DRM configurations or ABR constraints), you can attach a `config`
object to each `QueueItem`. The manager will call `player.resetConfiguration()`
followed by `player.configure(item.config)` before loading that item:

```js
queueManager.insertItems([
  {
    manifestUri: 'https://example.com/clear.mpd',
  },
  {
    manifestUri: 'https://example.com/protected.mpd',
    config: {
      drm: {
        servers: {
          'com.widevine.alpha': 'https://example.com/license',
        },
      },
    },
  },
]);
```


#### Clearing the Queue

To stop playback and remove all items from the queue:

```js
await queueManager.removeAllItems();
```

This unloads the player, destroys any active or pending `PreloadManager`
instances, and resets the current index to `-1`.
