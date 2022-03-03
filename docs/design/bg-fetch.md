# Shaka Player Background Fetch Support

last update: 2021-7-12

by: [theodab@google.com](mailto:theodab@google.com)


## Overview

The feature of background fetch has been in Shaka Player’s backlog [since 2017].
At the time it was added to the backlog, the feature was not quite ready for
use. Since then, it has matured, and now is something we could feasibly use, but
it has still been a low-priority feature.

[since 2017]: https://github.com/shaka-project/shaka-player/issues/879

## Design Concept

This design attempts to reuse existing code whenever possible, in order to
minimize the amount of new code that has to be tested. The code will be made in
two main stages:
1. Refactor the offline download process to change the order that the asset is
downloaded. The manifest should be downloaded and stored first, and then every
segment should be downloaded. As a segment is downloaded, it should be stored.
The code for storing a segment, in particular, should be broken out into an
exported static (e.g. stateless) function.
1. Modify the Shaka Player wrapper to add the appropriate background fetch event
listeners if the environment is detected to be a service worker, so that a
compiled Shaka Player bundle can be used as a service worker. If background
fetch is used, the segment downloading step should be passed to this service
worker. When each segment is downloaded, it should be passed to the static
storage functions added in stage 1.

By restructuring the offline storage code in this way, switching between
foreground and background fetch will just be a matter of calling a different
segment-downloading function. In addition, it is possible that, in the future, a
plugin interface could be made for this. That probably won’t be necessary unless
another browser makes a competing API for downloading in the background (which
is admittedly a possibility, as background fetch [is not yet a W3C standard]).

[is not yet a W3C standard]: https://wicg.github.io/background-fetch/

### Storage System Process: Before

![Shaka storage system flow before](bg-fetch-before.gv.png)


### Storage System Process: After

![Shaka storage system flow after](bg-fetch-after.gv.png)


## Implementation

### Changes to shaka.offline.Storage

1. Change createOfflineManifest_ to leave the storage indexes on the segments
null at first. With this change, downloadManifest_ will now only be downloading
the encryption keys (which cannot be downloaded via background fetch, as they
require request bodies).
1. Create a new step within store_, after the manifest is stored, called
“downloadSegments_” that makes a Set of SegmentReference objects that need to be
downloaded.
   1. We use SegmentReference objects in order to contain the URI, startByte,
   and endByte.
   1. This change also means we will no longer need an internal cache for
   downloaded segments, as they will be deduplicated by the use of a Set.
1. If background fetch is not available, downloadSegments_ will simply download
the segments from this set as before, and then once they are all downloaded,
pass them all to assignStreamsToManifest.
1. If background fetch is available, this set will be turned into an array,
Request objects should be made for the individual uris (with appropriate headers
applied), and then that array will be passed to the service worker with a
background fetch call. The service worker will then, after everything is
downloaded and stored, call assignStreamsToManifest.  An estimate of the total
download size will need to be computed here, and padded to avoid premature
cancellation for inaccurate manifests.
1. Create a new public static method, assignStreamToManifest. This is a static
method that requires no internal state, so that the service worker can call it.
It stores the data provided, loads the manifest from storage, applies the
storage id of the data to the appropriate segments (based on uri), and then
stores the modified manifest. It should have a mutex over the part that loads
and changes the manifest, to keep one invocation from overriding the manifest
changes of another. It should have the following parameters:
   1. manifestStorageId
   1. uri
   1. data
   1. throwIfAbortedFn
1. Create a second public static method, cleanStoredManifest. This method is
meant to be called by the service worker in the instance of the fetch operation
being aborted, and will simply clear the manifest away. It will also clear any
segments that have been stored already. This also means we will no longer need
the segmentsFromStore_ array, which we had previously been using to un-store
after canceled or failed downloads. It should have the following parameters:
   1. manifestStorageId
1. When filling out shaka.extern.StoredContent entries for the list() method,
the storage system should be sure to set the offlineUri field to null if the
manifest is still “isIncomplete”, to mark that the asset has not yet finished
downloading. This will help developers detect that an asset is mid-download on
page load, so that they can set up progress indicators if they so wish.


### Service Worker Design

1. This code should go in, or at least be loaded in, the wrapper code. This will
let us access Shaka Player methods inside the service worker, without having to
coordinate how to load a compiled Shaka Player bundle from a service worker;
the user can simply load a Shaka Player bundle as a service worker.
1. When the background fetch message is called (see [the documentation]), the
“id” field should be set to the storage id of the manifest, with an added prefix
of “Shaka-”. The API does not provide any field for custom data, but this value
still needs to be provided to the service worker somehow. Luckily, this is the
only extra data the service worker needs, so it can just be the id of the fetch
operation.
   1. When handling background fetch-related events, we can simply ignore any
   event that does not start with the prefix. This will help prevent any
   contamination with other service worker code from the developer.
1. As each segment is downloaded, the assignStreamToManifest method should be
called to store that data in the manifest.
1. If the download is canceled, call the cleanStoredManifest method, so that the
player doesn’t pollute indexedDb with unused segment data.
1. As a service worker is essentially just a collection of event listeners, one
can theoretically listen to the same event multiple times. This is relevant
because [a given scope] can only have a single service worker, so our service
worker code will have to be something that other people can load into their
existing service workers, if they have any.
1. Our system should use the message event to pass a specific identifying
message to the service worker, and the service worker will be expected to
respond with a specific response message. This way, we won’t mistake an
unrelated service worker for our own.
   1. This message can also be used to make sure the versions are the same.

[the documentation]: https://developers.google.com/web/updates/2018/12/background-fetch#starting_a_background_fetch
[a given scope]: https://developers.google.com/web/fundamentals/primers/service-workers#register_a_service_worker
