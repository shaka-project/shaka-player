# Service Worker Caching

[Service workers][1] provide a way to have a script run in the background even
when the page is not loaded.  It can respond to push events from other sites and
can act as a transparent cache for the page.

We strongly recommend against using service workers to cache content for offline
playback.  There are many subtle issues introduced when you try to cache content
manifests and segments, and we have built an offline storage system that manages
all of these issues for you.  See {@tutorial offline} and
{@link shaka.offline.Storage} for more information.

For other use cases, this doc will show a basic example of how to create a cache
that will not interfere with Shaka Player's bandwidth estimation. This is NOT a
tutorial of service workers in general.

[1]: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API


## Cache Header

Shaka looks for a special header `X-Shaka-From-Cache` to indicate that a
response was from a cache.  This tells us to ignore the response for bandwidth
estimation purposes.  If we used these cached responses to estimate bandwidth,
our estimate would too high, and we would make the wrong adaptation decisions.
Simply adding this header to the response object will ensure that cached
segments will not interfere with bandwidth estimates.


## Example Caching Service Worker

Registering code in the app:

```js
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service_worker.js').then(function() {
    console.log('Service worker registered successfully');
  }).catch(function(err) {
    console.error('Error registering service worker', err);
  });
} else {
  console.error('Browser doesn\'t support service workers');
}
```

Service worker code (`/service_worker.js`):

```js
var CACHE_NAME = 'segment-cache-v1';

function shouldCache(url) {
  return url.endsWith('.mp4') || url.endsWith('.m4s');
}

function loadFromCacheOrFetch(request) {
  return caches.open(CACHE_NAME).then(function(cache) {
    return cache.match(request).then(function(response) {
      if (response) {
        // The custom header was added before putting it in the cache.
        console.log('Handling cached request', request.url);
        return response;
      }

      // Request not cached, make a real request for the file.
      return fetch(request).then(function(response) {
        // Cache any successfully request for an MP4 segment.  Service
        // workers cannot cache 206 (Partial Content).  This means that
        // content that uses range requests (e.g. SegmentBase) will require
        // more work.
        if (response.ok && response.status != 206 && shouldCache(request.url)) {
          console.log('Caching MP4 segment', request.url);
          cacheResponse(cache, request, response);
        }

        return response;
      });
    });
  })
}

function cacheResponse(cache, request, response) {
  // Response objects are read-only, so to add our custom header, we need to
  // recreate the object.
  var init = {
    status: response.status,
    statusText: response.statusText,
    headers: {'X-Shaka-From-Cache': true}
  };

  response.headers.forEach(function(value, key) {
    init.headers[key] = value;
  });

  // Response objects are single use.  This means we need to call clone() so
  // we can both store the ArrayBuffer and give the response to the page.
  return response.clone().arrayBuffer().then(function(ab) {
    cache.put(request, new Response(ab, init));
  });
}


self.addEventListener('fetch', function(event) {
  event.respondWith(loadFromCacheOrFetch(event.request));
});
```
