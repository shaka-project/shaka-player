# Debugging

#### Create an error

Let's say that we have some kind of error, and we want to debug it.
To simulate this, we'll start with the code from {@tutorial basic-usage}
and make a bad change.

First, let's change `manifestUri` by removing the last letter.

```js
var manifestUri = '//storage.googleapis.com/shaka-demo-assets/sintel-widevine/dash.mp';
```

Now reload the page.  This causes an error in the JS console that says "Error
code 1001".


#### Looking up error codes

Look at the Error we just logged.  It has `category: 1`, `code: 1001`.  To find
out what that means, check the docs for {@link shaka.util.Error}.  There we find
that `1001` means `BAD_HTTP_STATUS`:

> An HTTP network request returned an HTTP status that indicated a failure.
> error.data[0] is the URI.
> ...

So some HTTP request failed, and we can see the failed URI in `data[0]`.


#### Loading the uncompiled library

The compiled library has no usable stack traces and no logging.  So to get more
information, we need to switch to the uncompiled library.

Instead of the single-file compiled library, we need to load three scripts in
our HTML file:

1. Closure's base library.  (This is a small JavaScript library related to the
   Closure compiler used when we build Shaka.)  This is what loads Shaka without
   requiring you to list all 50+ source files.
2. A dependency file which maps Shaka's class names to source files.  This is
   how Closure's base library can locate all of Shaka's individual source files.
3. The uncompiled Shaka library's bootstrap file, "shaka-player.uncompiled.js".
   This uses Closure to load the top-level parts of the library.  Each of those
   files in turn load their internal dependencies.

Once we're using the uncompiled library, we will be able to see detailed logs
and line numbers for errors.

```html
  <head>
    <!-- Closure base: -->
    <script src="third_party/closure/goog/base.js"></script>
    <!-- Deps file: -->
    <script src="dist/deps.js"></script>
    <!-- Shaka Player uncompiled library: -->
    <script src="shaka-player.uncompiled.js"></script>

    <!-- Your application source: -->
    <script src="myapp.js"></script>
  </head>
```

Reload the page and look in the JavaScript console.  Now we see:

```js
Failed to load resource: the server responded with a status of 404 (Not Found)
  http://storage.googleapis.com/shaka-demo-assets/sintel-widevine/dash.mp

Unable to find byte-order-mark, making an educated guess.  string_utils.js:130

HTTP error text:  http_plugin.js:67

Failed to load resource: the server responded with a status of 404 (Not Found)
  http://storage.googleapis.com/shaka-demo-assets/sintel-widevine/dash.mp

Unable to find byte-order-mark, making an educated guess.  string_utils.js:130

HTTP error text:  http_plugin.js:67

HEAD request to guess manifest type failed! shaka.util.Error  manifest_parser.js:179

load() failed: shaka.util.Error  player.js:448

Error code 1001 object shaka.util.Error  myapp.js:55
```

So much more information!  We have several logs from the library now.  We can
see the player tried to use a HEAD request to guess the manifest type, but that
failed, which caused load() to fail.


We can also expand the Error object and see a human-readable message and a stack
trace:

```js
shaka.util.Error
  category: 1
  code: 1001
  data: Array[3]
    0: "http://storage.googleapis.com/shaka-demo-assets/sintel-widevine/dash.mp"
    1: 404
    2: ""
    length: 3
  message:
    "Shaka Error NETWORK.BAD_HTTP_STATUS (...)"
  stack: "Error: Shaka Error NETWORK.BAD_HTTP_STATUS (http://storage.googleapis.com/shaka-demo-assets/sintel-widevine/dash.mp,404,)
    at new shaka.util.Error (http://horcrux.kir.corp.google.com/shaka/lib/util/error.js:77:13)
    at XMLHttpRequest.xhr.onload (http://horcrux.kir.corp.google.com/shaka/lib/net/http_plugin.js:68:16)"
```

With the information from the uncompiled library, we have the error name as well
as the code.  So we could avoid looking up the number in the documentation.  The
stack trace gives us clues about where the error was generated, so we can look
more closely at the source code if we need to.


#### Setting the log level

Sometimes the error and stack trace isn't enough.  Sometimes you need to see a
long sequence of events leading up to an error.  You may also be asked to attach
logs as part of a bug report to help the Shaka Player team understand your bug.

For this, you want to set the log level.  The log level lets you control what
logs are shown by the uncompiled library.  To set the log level:

```js
// Debug logs, when the default of INFO isn't enough:
shaka.log.setLevel(shaka.log.Level.DEBUG);

// Verbose logs, which can generate a lot of output:
shaka.log.setLevel(shaka.log.Level.V1);

// Verbose 2, which is extremely noisy:
shaka.log.setLevel(shaka.log.Level.V2);
```

Please note that this method is not available from the compiled library.


#### Continue the Tutorials

Next, check out {@tutorial config}.
