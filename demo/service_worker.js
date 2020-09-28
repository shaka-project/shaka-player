/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview Shaka Player demo, service worker.
 */


/**
 * The name of the cache for this version of the application.
 * This should be updated when old, unneeded application resources could be
 * cleaned up by a newer version of the application.
 *
 * @const {string}
 */
const CACHE_NAME = 'shaka-player-v2.5+';


/**
 * The prefix of all cache versions that belong to this application.
 * This is used to identify old caches to clean up.  Must match CACHE_NAME
 * above.
 *
 * @const {string}
 */
const CACHE_NAME_PREFIX = 'shaka-player';

console.assert(CACHE_NAME.startsWith(CACHE_NAME_PREFIX),
               'Cache name does not match prefix!');


/**
 * The maximum number of seconds to wait for an updated version of something
 * if we have a cached version we could use instead.
 *
 * @const {number}
 */
const NETWORK_TIMEOUT = 2;


/**
 * An array of resources that MUST be cached to make the application
 * available offline.
 *
 * @const {!Array.<string>}
 */
const CRITICAL_RESOURCES = [
  '.',  // This resolves to the page.
  'index.html',  // Another way to access the page.
  'app_manifest.json',
  'shaka_logo_trans.png',

  'load.js',
  '../dist/shaka-player.ui.js',
  '../dist/demo.compiled.js',
  '../dist/controls.css',
  '../dist/demo.css',

  // These files are required for the demo to include MDL.
  '../node_modules/material-design-lite/dist/material.min.js',

  // MDL modal dialogs are enabled by including these:
  '../node_modules/dialog-polyfill/dist/dialog-polyfill.js',

  // Datalist-like fields are enabled by including these:
  '../node_modules/awesomplete/awesomplete.min.js',

  // Tooltips are enabled by including these:
  '../node_modules/tippy.js/umd/index.min.js',
  '../node_modules/popper.js/dist/umd/popper.min.js',

  // PWA compatibility for iOS:
  '../node_modules/pwacompat/pwacompat.min.js',
].map(resolveRelativeUrl);


/**
 * An array of resources that SHOULD be cached, but which are not critical.
 *
 * The application does not need to read these, so these can use the no-cors
 * flag and be cached as "opaque" resources.  This is critical for the cast
 * sender SDK below.
 *
 * @const {!Array.<string>}
 */
const OPTIONAL_RESOURCES = [
  // Optional graphics.  Without these, the site won't be broken.
  'favicon.ico',
  'https://shaka-player-demo.appspot.com/assets/poster.jpg',
  'https://shaka-player-demo.appspot.com/assets/audioOnly.gif',

  // The mux.js transmuxing library for MPEG-2 TS and CEA support.
  '../node_modules/mux.js/dist/mux.min.js',

  // The cast sender SDK.
  'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js',
].map(resolveRelativeUrl);


/**
 * An array of URI prefixes.  Matching resources SHOULD be cached whenever seen
 * and SHOULD be served from cache first without waiting for updated versions
 * from the network.
 *
 * @const {!Array.<string>}
 */
const CACHEABLE_URL_PREFIXES = [
  // Translations should be cached.  We don't know which ones the user will
  // want, so use this prefix.
  'locales/',
  '../ui/locales/',

  // The various app logos should be cached, too.  We don't know which ones the
  // browser will load, so use this prefix.
  'app_logo_',

  // Google Web Fonts should be cached when first seen, without being explicitly
  // listed, and should be preferred from cache for speed.
  'https://fonts.gstatic.com/',
  // Same goes for asset icons.
  'https://storage.googleapis.com/shaka-asset-icons/',
].map(resolveRelativeUrl);


/**
 * This constant is used to catch local resources which may be missing from the
 * set of cacheable URLs and prefixes above.
 *
 * @const {string}
 */
const LOCAL_BASE = resolveRelativeUrl('../');


/**
 * This event fires when the service worker is installed.
 *
 * @param {!InstallEvent} event
 */
function onInstall(event) {
  // Activate as soon as installation is complete.
  self.skipWaiting();

  const preCacheApplication = async () => {
    const cache = await caches.open(CACHE_NAME);
    // Fetching these with addAll fails for CORS-restricted content, so we use
    // fetchAndCache with no-cors mode to work around it.

    // Optional resources: failure on these will NOT fail the Promise chain.
    // We will also not wait for them to be installed.
    for (const url of OPTIONAL_RESOURCES) {
      const request = new Request(url, {mode: 'no-cors'});
      fetchAndCache(cache, request).catch(() => {});
    }

    // Critical resources: failure on these will fail the Promise chain.
    // The installation will not be complete until these are all cached.
    const criticalFetches = [];
    for (const url of CRITICAL_RESOURCES) {
      const request = new Request(url, {mode: 'no-cors'});
      criticalFetches.push(fetchAndCache(cache, request));
    }
    return Promise.all(criticalFetches);
  };

  event.waitUntil(preCacheApplication());
}

/**
 * This event fires when the service worker is activated.
 * This can be after installation or upgrade.
 *
 * @param {!ExtendableEvent} event
 */
function onActivate(event) {
  // Delete old caches to save space.
  const dropOldCaches = async () => {
    const cacheNames = await caches.keys();

    // Return true on all the caches we want to clean up.
    // Note that caches are shared across the origin, so only remove
    // caches we are sure we created.
    const cleanTheseUp = cacheNames.filter((cacheName) =>
        cacheName.startsWith(CACHE_NAME_PREFIX) && cacheName != CACHE_NAME);

    const cleanUpPromises =
        cleanTheseUp.map((cacheName) => caches.delete(cacheName));

    await Promise.all(cleanUpPromises);
  };

  event.waitUntil(Promise.all([
    dropOldCaches(),

    // makes this the active service worker for all open tabs
    clients.claim(),
  ]));
}

/**
 * This event fires when any resource is fetched.
 * This is where we can use the cache to respond offline.
 *
 * @param {!FetchEvent} event
 */
function onFetch(event) {
  // For some reason, on a page load, we get hash parameters in the URL for this
  // event.  The hash should not be used when we do any of the lookups below.
  const url = event.request.url.split('#')[0];

  // Make sure this is a request we should be handling in the first place.
  // If it's not, it's important to leave it alone and not call respondWith.
  let useCache = false;
  for (const prefix of CACHEABLE_URL_PREFIXES) {
    if (url.startsWith(prefix)) {
      useCache = true;
      break;
    }
  }

  // Now we need to check our resource lists.  The list of prefixes above won't
  // cover everything that was installed initially, and those things still need
  // to be read from cache.  So we check if this request URL matches one of
  // those lists.
  if (!useCache) {
    if (CRITICAL_RESOURCES.includes(url) ||
        OPTIONAL_RESOURCES.includes(url)) {
      useCache = true;
    }
  }

  if (!useCache && url.startsWith(LOCAL_BASE)) {
    // If we have the correct resource lists above, then all local resources
    // should have useCache set to true by now.

    // Check to see if this request is coming from a compiled build of the demo,
    // and only log an error if this missing request is from a compiled build.

    // The check is async, and that's fine because we aren't handling this fetch
    // event anyway.
    (async () => {
      // This client represents the tab that made the request.
      const client = await clients.get(event.clientId);
      // This is the URL of that tab's main document.
      const urlHash = client.url.split('#')[1] || '';
      const hashParameters = urlHash.split(';');
      if (hashParameters.includes('build=compiled')) {
        console.error('Local resource missing!', url);
      }
    })();
  }

  if (useCache) {
    event.respondWith(fetchCacheableResource(event.request));
  }
}

/**
 * Fetch a cacheable resource.  Decide whether to request from the network,
 * the cache, or both, and return the appropriate version of the resource.
 *
 * @param {!Request} request
 * @return {!Promise.<!Response>}
 */
async function fetchCacheableResource(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  if (!navigator.onLine) {
    // We are offline, and we know it.  Just return the cached response, to
    // avoid a bunch of pointless errors in the JS console that will confuse
    // us developers.  If there is no cached response, this will just be a
    // failed request.
    return cachedResponse;
  }

  if (cachedResponse) {
    // We have it in cache.  Try to fetch a live version and update the cache,
    // but limit how long we will wait for the updated version.
    try {
      return await timeout(NETWORK_TIMEOUT, fetchAndCache(cache, request));
    } catch (error) {
      // We tried to fetch a live version, but it either failed or took too
      // long.  If it took too long, the fetch and cache operation will continue
      // in the background.  In both cases, we should go ahead with a cached
      // version.
      return cachedResponse;
    }
  } else {
    // We should have this in cache, but we don't.  Fetch and cache a fresh
    // copy and then return it.
    return fetchAndCache(cache, request);
  }
}

/**
 * Fetch the resource from the network, then store this new version in the
 * cache.
 *
 * @param {!Cache} cache
 * @param {!Request} request
 * @return {!Promise.<!Response>}
 */
async function fetchAndCache(cache, request) {
  const response = await fetch(request);
  cache.put(request, response.clone());
  return response;
}

/**
 * Returns a Promise which is resolved only if |asyncProcess| is resolved, and
 * only if it is resolved in less than |seconds| seconds.
 *
 * If the returned Promise is resolved, it returns the same value as
 * |asyncProcess|.
 *
 * If |asyncProcess| fails, the returned Promise is rejected.
 * If |asyncProcess| takes too long, the returned Promise is rejected, but
 * |asyncProcess| is still allowed to complete.
 *
 * @param {number} seconds
 * @param {!Promise.<T>} asyncProcess
 * @return {!Promise.<T>}
 * @template T
 */
function timeout(seconds, asyncProcess) {
  return Promise.race([
    asyncProcess,
    new Promise(function(_, reject) {
      setTimeout(reject, seconds * 1000);
    }),
  ]);
}


/**
 * @param {string} relativeUrl A URL which may be relative to this service
 *   worker.
 * @return {string} The same URL converted to an absolute URL.
 */
function resolveRelativeUrl(relativeUrl) {
  // NOTE: This is the URL of the service worker, not the main HTML document.
  const baseUrl = location.href;
  return (new URL(relativeUrl, baseUrl)).href;
}

self.addEventListener('install', /** @type {function(!Event)} */(onInstall));
self.addEventListener('activate', /** @type {function(!Event)} */(onActivate));
self.addEventListener('fetch', /** @type {function(!Event)} */(onFetch));
