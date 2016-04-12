# Debugging the Uncompiled Library

#### Create an error

Let's say that we have some kind of error, and we want to debug it.
To simulate this, we'll start with the code from {@tutorial basic-usage}
and make a bad change.

First, let's make `manifestUri` blank.

```js
var manifestUri = '';
```

This causes an error in the console that says "Error code 4000".  What now?


#### Use the JS console

Open the JavaScript console and look at the shaka.util.Error object we logged.
It has `category: 4`, `code: 4000`, and `data: [""]`.  To find out what that
means, let's open lib/util/error.js and search for the error code:

```js
  /**
   * The Player was unable to guess the manifest type based on file extension
   * or MIME type.  To fix, try one of the following:
   * <br><ul>
   *   <li>Rename the manifest so that the URI ends in a well-known extension.
   *   <li>Configure the server to send a recognizable Content-Type header.
   *   <li>Configure the server to accept a HEAD request for the manifest.
   * </ul>
   * <br> error.data[0] is the manifest URI.
   */
  'UNABLE_TO_GUESS_MANIFEST_TYPE': 4000,
```

So the player could not determine what type of manifest that is, and `data[0]`
is the manifest URI.  Looking at `data[0]`, we see a blank string, which is
what we told the player to load.

But it's still not clear *why* that error code is being sent.  To find out more,
we should look at the logs.  Logging is turned off during compilation, so we
need to load the uncompiled library.


#### Loading the uncompiled library

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
and line numbers for errors.  It is difficult to debug without this.

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
Unable to guess manifest type by file extension or by MIME type.
    undefined text/html    player.js:297

Error {category: 4, code: 4000, data: Array[1],
    message: "Shaka Error MANIFEST.UNABLE_TO_GUESS_MANIFEST_TYPE ()",
    stack: "Error: Shaka Error…   at http://localhost/shaka/lib/player.js:300:35"}
```

So much more information!  The uncompiled library includes a log from Player
(player.js, line 297) right before the error was dispatched, and the error
includes a message that gives the full human-readable name of the error:
`MANIFEST.UNABLE_TO_GUESS_MANIFEST_TYPE`.  The `MANIFEST` part is the textual
name for category: 4, and `UNABLE_TO_GUESS_MANIFEST_TYPE` is the textual name
for code: 4000.  (A full list can be found in the docs for
{@link shaka.util.Error}).

There's also a `stack` field showing the context in which it was generated:

```
Error: Shaka Error MANIFEST.UNABLE_TO_GUESS_MANIFEST_TYPE ()
  at new shaka.util.Error (http://localhost/shaka/lib/util/error.js:77:13)
  at http://localhost/shaka/lib/player.js:300:35
```

So now we know player.js line 300 is the source of the error.


#### Setting the log level

Sometimes the error and stack trace isn't enough.  Sometimes you need to see a
long sequence of events leading up to an error.  For this, you want to set the
log level.  The log level lets you control what logs are shown by the uncompiled
library.  To set the log level:

```js
// Debug logs, when the default of INFO isn't enough:
shaka.log.setLevel(shaka.log.Level.DEBUG);

// Verbose logs, which can generate a lot of output:
shaka.log.setLevel(shaka.log.Level.V1);

// Verbose 2, which is extremely noisy:
shaka.log.setLevel(shaka.log.Level.V2);
```

Please note that this method is not available from the compiled library.


#### Okay, but why *that* error?

To keep the API simple, Shaka tries to guess what type of manifest you want to
load.  It does this first based on extension, and if that fails, it makes a HEAD
request and checks the MIME type.

A request for "" is interpreted as a relative URL.  What we actually requested
was the index page for the folder the HTML is in.

Since the file extension of "" was `undefined`, and the MIME type was
`text/html`, neither of those matched a registered manifest parser.


#### Continue the Tutorials

Next, check out {@tutorial config}.
