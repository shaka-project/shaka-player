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


#### Loading an M3U Playlist

`loadFromM3uPlaylist()` lets you populate the queue from a remote M3U or M3U8
playlist in one call. The method fetches the file using the player's own
networking engine (so request filters, credentials, and retry parameters all
apply), parses every stream entry, and inserts the resulting items into the
queue.

```js
// Load a playlist and start playing the first channel immediately.
await queueManager.loadFromM3uPlaylist(
  'https://example.com/channels.m3u',
  /* playOnLoad= */ true,
);
```

The second argument, `playOnLoad`, is optional and defaults to `false`. When
`true`, `playItem(0)` is called automatically once the items have been
inserted.

```js
// Load a playlist without starting playback — useful when you want to
// inspect or filter the items before choosing which one to play.
await queueManager.loadFromM3uPlaylist('https://example.com/channels.m3u');

const items = queueManager.getItems();
const newsIndex = items.findIndex(
  (item) => item.metadata?.groupTitle === 'News',
);
if (newsIndex >= 0) {
  await queueManager.playItem(newsIndex);
}
```

##### EXTINF attributes and item metadata

The parser supports the Extended M3U format (`#EXTM3U` / `#EXTINF`) with the
`tvg-*` and `group-title` attributes commonly found in IPTV playlists. All
attributes are copied into the item's `metadata` object **using their original
hyphenated names** (e.g. `tvg-id`, `tvg-name`, `group-title`). Two standard
`QueueItemMetadata` aliases are also set on top:

| Playlist attribute | `metadata` property | Notes                                      |
|--------------------|---------------------|--------------------------------------------|
| `tvg-name`         | `tvg-name` + `title`| `title` falls back to the display name.    |
| `tvg-logo`         | `tvg-logo` + `poster`|                                           |
| `tvg-id`           | `tvg-id`            | Also used for deduplication (see below).   |
| `tvg-language`     | `tvg-language`      |                                            |
| `tvg-country`      | `tvg-country`       |                                            |
| `tvg-url`          | `tvg-url`           | EPG (Electronic Programme Guide) feed URL. |
| `group-title`      | `group-title`       |                                            |
| Display name       | `displayTitle`      | The text after the last comma in `#EXTINF`.|
| *(any other)*      | *(original name)*   | Unknown attributes are preserved as-is.    |

A typical IPTV entry and the metadata it produces:

```
#EXTINF:-1 tvg-id="bbc1" tvg-name="BBC One" tvg-logo="https://example.com/bbc1.png" tvg-language="English" tvg-country="GB" group-title="Entertainment",BBC One HD
https://example.com/bbc1/stream.m3u8
```

```js
{
  manifestUri: 'https://example.com/bbc1/stream.m3u8',
  metadata: {
    // Standard QueueItemMetadata aliases
    title: 'BBC One',                        // from tvg-name
    poster: 'https://example.com/bbc1.png',  // from tvg-logo
    // Raw attribute names, exactly as in the playlist
    'tvg-id': 'bbc1',
    'tvg-name': 'BBC One',
    'tvg-logo': 'https://example.com/bbc1.png',
    'tvg-language': 'English',
    'tvg-country': 'GB',
    'group-title': 'Entertainment',
    // Extra helper added by the parser
    displayTitle: 'BBC One HD',              // raw text after the last comma
  },
}
```

You can use `metadata['group-title']` to build a channel-group UI, or
`metadata['tvg-url']` to load EPG schedule data for the currently playing
channel:

```js
queueManager.addEventListener('currentitemchanged', () => {
  const item = queueManager.getCurrentItem();
  if (item?.metadata) {
    titleEl.textContent = item.metadata.title ?? '';
    posterEl.src = item.metadata.poster ?? '';
    groupEl.textContent = item.metadata['group-title'] ?? '';
  }
});
```

##### Duplicate channel handling

Channels that share the same `tvg-id` value are automatically deduplicated:
only the first occurrence is kept, and subsequent entries with the same id are
silently dropped. Channels without a `tvg-id` are always included regardless
of whether their stream URL appears more than once.

Note: `loadFromM3uPlaylist()` uses `RequestType.PLAYLIST` and the
`manifest.retryParameters` from the current player configuration. If the
playlist URL requires custom headers or credentials, configure them via a
request filter before calling this method.


#### Clearing the Queue

To stop playback and remove all items from the queue:

```js
await queueManager.removeAllItems();
```

This unloads the player, destroys any active or pending `PreloadManager`
instances, and resets the current index to `-1`.