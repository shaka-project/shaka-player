# Debugging

#### Create an error

Let's say that we have some kind of error, and we want to debug it.
To simulate this, we'll start with the code from {@tutorial basic-usage}
and make a bad change.

First, let's change `manifestUri` by removing the last letter.

```js
var manifestUri =
    'https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mp';
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


#### Loading the debug library

The compiled library has no usable stack traces and no logging.  So to get more
information, we need to switch to the debug library.  The debug library is still
compiled into a single bundle, but logging and other debug features are enabled.

To load the debug version of the library instead of the compiled version, just
change "compiled.js" to "compiled.debug.js" in our HTML file:

```html
  <head>
    <!-- Shaka Player debug library: -->
    <script src="shaka-player.compiled.debug.js"></script>

    <!-- Your application source: -->
    <script src="myapp.js"></script>
  </head>
```

Once we're using the debug library, we will be able to see detailed logs and
line numbers for errors.


Reload the page and look in the JavaScript console.  Now we see something
similar to this (formatted a bit differently in the console):

```js
HEAD http://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mp 404 (Not Found)  http_plugin.js:94

HEAD http://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mp 404 (Not Found)  http_plugin.js:94

HEAD request to guess manifest type failed! shaka.util.Error  manifest_parser.js:179

Error code 1001 object shaka.util.Error  myapp.js:45
```

We have a little more information from the library now, and we can expand the
Error object and see a human-readable message and a stack trace:

```js
shaka.util.Error
  category: 1
  code: 1001
  data: Array[3]
    0: "http://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mp"
    1: 404
    2: ""
    length: 3
  message:
    "Shaka Error NETWORK.BAD_HTTP_STATUS (...)"
  stack: "Error: Shaka Error NETWORK.BAD_HTTP_STATUS (http://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mp,404,)
    at new shaka.util.Error (http://localhost/shaka/lib/util/error.js:77:13)
    at XMLHttpRequest.xhr.onload (http://localhost/shaka/lib/net/http_plugin.js:70:16)"
```

With the information from the debug library, we have the error name as well as
the code.  So we could avoid looking up the number in the documentation.  The
stack trace gives us clues about where the error was generated, so we can look
more closely at the source code if we need to.


#### Setting the log level

Sometimes the error and stack trace isn't enough.  Sometimes you need to see a
long sequence of events leading up to an error.  You may also be asked to attach
logs as part of a bug report to help the Shaka Player team understand your bug.

For this, you want to set the log level.  The log level lets you control what
logs are shown by the debug library.  To set the log level, add one of these to
the top of `initApp()` in myapp.js:

```js
// Debug logs, when the default of INFO isn't enough:
shaka.log.setLevel(shaka.log.Level.DEBUG);

// Verbose logs, which can generate a lot of output:
shaka.log.setLevel(shaka.log.Level.V1);

// Verbose 2, which is extremely noisy:
shaka.log.setLevel(shaka.log.Level.V2);
```

Please note that this method is not available from the compiled library.

If we set the level to `V1` and reload, we get something like this in the
JavaScript console:

```js
HEAD http://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mp 404 (Not Found)  http_plugin.js:94

Unable to find byte-order-mark, making an educated guess.  string_utils.js:130

HTTP error text:  http_plugin.js:69

HEAD http://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mp 404 (Not Found)  http_plugin.js:94

Unable to find byte-order-mark, making an educated guess.  string_utils.js:130

HTTP error text:  http_plugin.js:69

HEAD request to guess manifest type failed! shaka.util.Error  manifest_parser.js:179

load() failed: shaka.util.Error  player.js:498

Error code 1001 object shaka.util.Error  myapp.js:48
```

So much more information!  We can now see that the failed HEAD request caused
load() to fail.


#### Advanced: Loading the uncompiled library

To do rapid testing and development, you can also load the uncompiled library.
This allows you to edit files and just hit the "reload" button in the browser
to see changes immediately.  This approach is trickier than using the debug
library, because the entire source tree needs to be available to your web
server, and because the individual sources can't be moved relative to the files
in `dist/`.

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

Once we're using the uncompiled library, we will be able to reload quickly
without rebuilding.

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


#### Wrap up

To sum up, remember these points when debugging your application:

 - Use the debug version of Shaka Player for debugging and integration work
 - Refer to the docs for error codes
 - Increase the log level when you need more detail


#### Continue the Tutorials

Next, check out {@tutorial config}.
