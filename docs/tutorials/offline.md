# Offline Storage and Playback

## Overview

This tutorial walks you through the main methods for Shaka Player’s offline
support. After this tutorial you will know how to:

 - Download content.
 - List downloaded content.
 - Play downloaded content.
 - Remove downloaded content.

This tutorial assumes that you only need to download content one at a time.
Concurrent downloads can be done with multiple instances of
`shaka.offline.Storage`.

## Offline API

This tutorial uses the `shaka.offline.Storage` API. The methods we will use
are:
 - configure
 - store
 - list
 - remove

More information on these methods can be found in the
{@link shaka.offline.Storage} API.

## Starting Code

There are two files you need for this tutorial. These files provide the HTML UI
and UI logic. We will resolve all the TODOs in the code during the tutorial
using the {@link shaka.offline.Storage} API. The complete code is available at
the end of the tutorial.

```html
<!DOCTYPE html>
<html>
  <head>
    <!-- Shaka Player compiled library: -->
    <script src="dist/shaka-player.compiled.js"></script>
    <!-- Your application source: -->
    <script src="myapp.js"></script>

    <style>
      table, th, td {
        border: 1px solid black;
      }
    </style>
  </head>
  <body>
    <div id='online-signal' style='width:640px;text-align:center'></div>
    <div>
      <div>
        <span style="width:120px;display:inline-block">Asset Name</span>
        <input id="asset-title-input" type="text" style="width:500px" value="Star Trek: Angel One">
      </div>
      <div>
        <span style="width:120px;display:inline-block">Asset Manifest</span>
        <input id="asset-uri-input" type="text" style="width:500px" value="//storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd">
      </div>
    </div>

    <div>
      <span><progress id="progress-bar" value="0" max="100"></span>
      <span><button id="download-button">Download</button></span>
    </div>

    <video id="video"
           width="640"
           poster="//shaka-player-demo.appspot.com/assets/poster.jpg"
           controls autoplay></video>

    <table id="content-table" style="width:640px"></table>
  </body>
</html>
```

```js
// myapp.js

function initApp() {
  // Install built-in polyfills to patch browser incompatibilities.
  shaka.polyfill.installAll();

  // Check to see if the browser supports the basic APIs Shaka needs.
  if (shaka.Player.isBrowserSupported()) {
    // Everything looks good!
    initPlayer();
  } else {
    // This browser does not have the minimum set of APIs we need.
    console.error('Browser not supported!');
  }

  // Update the online status and add listeners so that we can visualize
  // our network state to the user.
  updateOnlineStatus();
  window.addEventListener('online',  updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
}

function initPlayer() {
  // Create a Player instance.
  var video = document.getElementById('video');
  var player = new shaka.Player(video);

  // Attach player and storage to the window to make it easy to access
  // in the JS console and so we can access it in other methods.
  window.player = player;

  // Listen for error events.
  player.addEventListener('error', onErrorEvent);

  initStorage(player);

  var downloadButton = document.getElementById('download-button');
  downloadButton.onclick = onDownloadClick;

  // Update the content list to show what items we initially have
  // stored offline.
  refreshContentList();
}

function onErrorEvent(event) {
  // Extract the shaka.util.Error object from the event.
  onError(event.detail);
}

function onError(error) {
  // Log the error.
  console.error('Error code', error.code, 'object', error);
}

function selectTracks(tracks) {
  // This example stores the highest bandwidth variant.
  //
  // Note that this is just an example of an arbitrary algorithm, and not a best
  // practice for storing content offline.  Decide what your app needs, or keep
  // the default (user-pref-matching audio, best SD video, all text).
  var found = tracks
      .filter(function(track) { return track.type == 'variant'; })
      .sort(function(a, b) { return a.bandwidth - b.bandwidth; })
      .pop();
  console.log('Offline Track bandwidth: ' + found.bandwidth);
  return [ found ];
}

function initStorage(player) {
  // TODO : Initialize storage.
}

function listContent() {
  // TODO : return all downloaded content.
}

function playContent(content) {
  // TODO : play offline content.
}

function removeContent(content) {
  // TODO : remove content from storage.
}

function downloadContent(manifestUri, title) {
  // TODO : save content with storage.
}

/*
 * UI callback for when the download button is clicked. This will
 * disable the button while the download is in progress, start the
 * download, and refresh the content list once the download is
 * complete.
 */
function onDownloadClick() {
  var downloadButton = document.getElementById('download-button');
  var manifestUri = document.getElementById('asset-uri-input').value;
  var title = document.getElementById('asset-title-input').value;

  // Disable the download button to prevent user from requesting
  // another download until this download is complete.
  downloadButton.disabled = true;

  setDownloadProgress(null, 0);

  // Download the content and then re-enable the download button so
  // that more content can be downloaded.
  downloadContent(manifestUri, title)
    .then(function() {
      return refreshContentList();
    })
    .then(function(content) {
      setDownloadProgress(null, 1);
      downloadButton.disabled = false;
    })
    .catch(function(error) {
      // In the case of an error, re-enable the download button so
      // that the user can try to download another item.
      downloadButton.disabled = false;
      onError(error);
    });
}

/*
 * Update the online status box at the top of the page to tell the
 * user whether or not they have an internet connection.
 */
function updateOnlineStatus() {
  var signal = document.getElementById('online-signal');
  if (navigator.onLine) {
    signal.innerHTML = 'ONLINE';
    signal.style.background = 'green';
  } else {
    signal.innerHTML = 'OFFLINE';
    signal.style.background = 'grey';
  }
}

/*
 * Find our progress bar and set the value to show the progress we
 * have made.
 */
function setDownloadProgress(content, progress) {
  var progressBar = document.getElementById('progress-bar');
  progressBar.value = progress * progressBar.max;
}

/*
 * Clear our content table and repopulate it table with the current
 * list of downloaded content.
 */
function refreshContentList() {
  var contentTable = document.getElementById('content-table');

  // Clear old rows from the table.
  while (contentTable.rows.length) {
    contentTable.deleteRow(0);
  }

  var addRow = function(content) {
    var append = -1;

    var row = contentTable.insertRow(append);
    row.insertCell(append).innerHTML = content.offlineUri;
    Object.keys(content.appMetadata)
        .map(function(key) {
          return content.appMetadata[key];
        })
        .forEach(function(value) {
          row.insertCell(append).innerHTML = value;
        });

    row.insertCell(append).appendChild(createButton(
        'PLAY',
        function() { playContent(content); }));

    row.insertCell(append).appendChild(createButton(
        'REMOVE',
        function() {
          removeContent(content)
              .then(function() { refreshContentList() });
        }));
  };

  return listContent()
      .then(function(content) { content.forEach(addRow); });
};

/*
 * Create a new button but do not add it to the DOM. The caller
 * will need to do that.
 */
function createButton(text, action) {
  var button = document.createElement('button');
  button.innerHTML = text;
  button.onclick = action;
  return button;
}

document.addEventListener('DOMContentLoaded', initApp);
```

## Initializing Storage

The first step is to initialize our storage instance. Since we are downloading
content one at a time, we will use a single instance of `shaka.offline.Storage`.

Resolve the TODO in “initStorage” labeled “Initialize storage” with the
following code:

```js
  // Create a storage instance and configure it with optional
  // callbacks. Set the progress callback so that we visualize
  // download progress and override the track selection callback.
  window.storage = new shaka.offline.Storage(player);
  window.storage.configure({
    progressCallback: setDownloadProgress,
    trackSelectionCallback: selectTracks
  });
```

We assign `window.storage` to our storage instance so that it can be accessed
elsewhere in our tutorial. Calling `storage.configure` is optional. We are
using it to set a custom progress callback and track selection function. The
progress callback allows us to visualize the storage component’s progress
when downloading and removing content. The track selection callback lets us
limit which tracks to download.

Now that we have initialized our storage instance, we are ready to download
content.

## Downloading Content

Now that we have initialized storage we can download content. Resolve the TODO
in “downloadContent” labeled “save content with storage” with the following
code:

```js
  // Construct a metadata object to be stored alongside the content.
  // This can hold any information the app wants to be stored with
  // the content.
  var metadata = {
    'title': title,
    'downloaded': new Date()
  };

  return window.storage.store(manifestUri, metadata);
```

Storage allows us to store metadata alongside our content. We are going to save
the title of the content and the time we downloaded it, but the metadata can
contain anything you want. The metadata is optional, so you can ignore it if
you want.

`storage.store` returns a Promise that resolves to a
`shaka.externs.StoredContent` instance (a summary of the stored content).

At this point, the content is now stored offline and it's ready to be played.
Next we will add functionality to play offline content.

## Playing Offline Content

Now that we have stored some content, we want to play it. To do this, resolve
the TODO in “playContent” labeled “play offline content” with:

```js
window.player.load(content.offlineUri);
```

Yes, that is really all there is to play offline content. The player actually
does not know that the content is offline. Behind the scenes, Shaka Player’s
networking layer is redirecting the networking requests to offline storage.
So all you need to do is pass the offline uri from any stored content instance
to `player.load` and it will start playing.

Next, we need to list the content that has already been stored.

## Listing Offline Content

Next we are going to resolve the TODO in “listContent” labeled “return all
downloaded content” with:

```js
return window.storage.list();
```

Once again Shaka Player makes it easy for you. All you need is to call
`storage.list` and you will get a Promise that resolves to a
`shaka.extern.StoredContent` Array reflecting all content you have stored
offline.

Now you should be able to download content and play content.

## Removing Offline Content

Next, we need to be able to remove content from storage. After all, there is
limited space and so much great content out there. Resolve the TODO in
“removeContent” labeled “remove content from storage” with:

```js
return window.storage.remove(content.offlineUri);
```

All you need to do is pass `storage.remove` the URI of the offline content and
that content will be removed from storage. If you remember the progress callback
we set earlier, that will get called during the removal so that you can
visualize the removal progress.

## Final Code

That’s it! For your convenience, here is the completed code:

```html
<!DOCTYPE html>
<html>
  <head>
    <!-- Shaka Player compiled library: -->
    <script src="dist/shaka-player.compiled.js"></script>
    <!-- Your application source: -->
    <script src="myapp.js"></script>

    <style>
      table, th, td {
        border: 1px solid black;
      }
    </style>
  </head>
  <body>
    <div id='online-signal' style='width:640px;text-align:center'></div>
    <div>
      <div>
        <span style="width:120px;display:inline-block">Asset Name</span>
        <input id="asset-title-input" type="text" style="width:500px" value="Star Trek: Angel One">
      </div>
      <div>
        <span style="width:120px;display:inline-block">Asset Manifest</span>
        <input id="asset-uri-input" type="text" style="width:500px" value="//storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd">
      </div>
    </div>

    <div>
      <span><progress id="progress-bar" value="0" max="100"></span>
      <span><button id="download-button">Download</button></span>
    </div>

    <video id="video"
           width="640"
           poster="//shaka-player-demo.appspot.com/assets/poster.jpg"
           controls autoplay></video>

    <table id="content-table" style="width:640px"></table>
  </body>
</html>
```

```js
// myapp.js

function initApp() {
  // Install built-in polyfills to patch browser incompatibilities.
  shaka.polyfill.installAll();

  // Check to see if the browser supports the basic APIs Shaka needs.
  if (shaka.Player.isBrowserSupported()) {
    // Everything looks good!
    initPlayer();
  } else {
    // This browser does not have the minimum set of APIs we need.
    console.error('Browser not supported!');
  }

  // Update the online status and add listeners so that we can visualize
  // our network state to the user.
  updateOnlineStatus();
  window.addEventListener('online',  updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
}

function initPlayer() {
  // Create a Player instance.
  var video = document.getElementById('video');
  var player = new shaka.Player(video);

  // Attach player and storage to the window to make it easy to access
  // in the JS console and so we can access it in other methods.
  window.player = player;

  // Listen for error events.
  player.addEventListener('error', onErrorEvent);

  initStorage(player);

  var downloadButton = document.getElementById('download-button');
  downloadButton.onclick = onDownloadClick;

  // Update the content list to show what items we initially have
  // stored offline.
  refreshContentList();
}

function onErrorEvent(event) {
  // Extract the shaka.util.Error object from the event.
  onError(event.detail);
}

function onError(error) {
  // Log the error.
  console.error('Error code', error.code, 'object', error);
}

function selectTracks(tracks) {
  // This example stores the highest bandwidth variant.
  //
  // Note that this is just an example of an arbitrary algorithm, and not a best
  // practice for storing content offline.  Decide what your app needs, or keep
  // the default (user-pref-matching audio, best SD video, all text).
  var found = tracks
      .filter(function(track) { return track.type == 'variant'; })
      .sort(function(a, b) { return a.bandwidth - b.bandwidth; })
      .pop();
  console.log('Offline Track bandwidth: ' + found.bandwidth);
  return [ found ];
}

function initStorage(player) {
  // Create a storage instance and configure it with optional
  // callbacks. Set the progress callback so that we visualize
  // download progress and override the track selection callback.
  window.storage = new shaka.offline.Storage(player);
  window.storage.configure({
    progressCallback: setDownloadProgress,
    trackSelectionCallback: selectTracks
  });
}

function listContent() {
  return window.storage.list();
}

function playContent(content) {
  window.player.load(content.offlineUri);
}

function removeContent(content) {
  return window.storage.remove(content.offlineUri);
}

function downloadContent(manifestUri, title) {
  // Construct a metadata object to be stored along side the content.
  // This can hold any information the app wants to be stored with the
  // content.
  var metadata = {
    'title': title,
    'downloaded': Date()
  };

  return window.storage.store(manifestUri, metadata);
}

/*
 * UI callback for when the download button is clicked. This will
 * disable the button while the download is in progress, start the
 * download, and refresh the content list once the download is
 * complete.
 */
function onDownloadClick() {
  var downloadButton = document.getElementById('download-button');
  var manifestUri = document.getElementById('asset-uri-input').value;
  var title = document.getElementById('asset-title-input').value;

  // Disable the download button to prevent user from requesting
  // another download until this download is complete.
  downloadButton.disabled = true;

  setDownloadProgress(null, 0);

  // Download the content and then re-enable the download button so
  // that more content can be downloaded.
  downloadContent(manifestUri, title)
    .then(function() {
      return refreshContentList();
    })
    .then(function(content) {
      setDownloadProgress(null, 1);
      downloadButton.disabled = false;
    })
    .catch(function(error) {
      // In the case of an error, re-enable the download button so
      // that the user can try to download another item.
      downloadButton.disabled = false;
      onError(error);
    });
}

/*
 * Update the online status box at the top of the page to tell the
 * user whether or not they have an internet connection.
 */
function updateOnlineStatus() {
  var signal = document.getElementById('online-signal');
  if (navigator.onLine) {
    signal.innerHTML = 'ONLINE';
    signal.style.background = 'green';
  } else {
    signal.innerHTML = 'OFFLINE';
    signal.style.background = 'grey';
  }
}

/*
 * Find our progress bar and set the value to show the progress we
 * have made.
 */
function setDownloadProgress(content, progress) {
  var progressBar = document.getElementById('progress-bar');
  progressBar.value = progress * progressBar.max;
}

/*
 * Clear our content table and repopulate it table with the current
 * list of downloaded content.
 */
function refreshContentList() {
  var contentTable = document.getElementById('content-table');

  // Clear old rows from the table.
  while (contentTable.rows.length) {
    contentTable.deleteRow(0);
  }

  var addRow = function(content) {
    var append = -1;

    var row = contentTable.insertRow(append);
    row.insertCell(append).innerHTML = content.offlineUri;
    Object.keys(content.appMetadata)
        .map(function(key) {
          return content.appMetadata[key];
        })
        .forEach(function(value) {
          row.insertCell(append).innerHTML = value;
        });

    row.insertCell(append).appendChild(createButton(
        'PLAY',
        function() { playContent(content); }));

    row.insertCell(append).appendChild(createButton(
        'REMOVE',
        function() {
          removeContent(content)
              .then(function() { refreshContentList() });
        }));
  };

  return listContent()
      .then(function(content) { content.forEach(addRow); });
};

/*
 * Create a new button but do not add it to the DOM. The caller
 * will need to do that.
 */
function createButton(text, action) {
  var button = document.createElement('button');
  button.innerHTML = text;
  button.onclick = action;
  return button;
}

document.addEventListener('DOMContentLoaded', initApp);
```

## Protected Content

When storing protected content offline, there are some limitations based on
browsers. Right now Chrome only supports persistent licenses on Android (M62+)
and Chromebooks.

For other platforms, we offer the ability to disable the use of persistent
licenses. If you choose to disable persistent licenses, you will get offline
storage of protected content on all DRM-enabled browsers, at the cost of needing
a network connection at playback time to retrieve licenses. Therefore, you
should avoid this setting on browsers that support persistent licenses.

If you want to download content but not persistent licenses, when you configure
storage, set:

```js
usePersistentLicense: false
```

By default, shaka.offline.Storage stores persistent licenses. If you want this
behaviour and you know you are on a supported platform, you can omit the
setting or set it explicitly with:

```js
usePersistentLicense: true
```
