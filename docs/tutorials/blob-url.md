# Blob URL

In case you need shaka-player to load a blob url mpd:

`player.load(computedMpdBlobURL, startTime, 'application/dash+xml');`


In case you need shaka-player to load a blob url m3u8 :

`player.load(computedMpdBlobURL, startTime, 'application/x-mpegurl');`


Note: relative URIs in the manifest are broken because the original manifest URI is lost. This can be worked around with either absolute URIs or the use of BaseURL element in DASH.

Note: this tutorial only applies to v3.3 or higher
