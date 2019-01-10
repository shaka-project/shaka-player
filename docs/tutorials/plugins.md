# Plugins and Customizing the Build

Shaka has a plugin system to make it easier to extend and customize the
library. The plugin interfaces are here to allow you extend or customize Shaka
Player in one of these areas: manifest parsing, subtitle and caption parsing,
networking, ABR, and polyfills.  Each of these parts of the system has its own
plugin interface. Even our "built-in" parsers, such as DASH and WebVTT, are
actually just plugins we build by default.

Plugins can be written outside the library (in your application), or
they can be built into the library to take advantage of the [Closure compiler].

[Closure compiler]: https://github.com/google/closure-compiler


#### Plugins

We will only cover plugin concepts at a high level here and will not go into
detailed examples of plugin development.  If you are interested in customizing
or extending Shaka in one of these areas, please see the links below.

A plugin registers itself with a "core" component.  These are the various
plugin interfaces and the default plugins that Shaka provides:

__Manifest parsers__
  - Selected by file extension, with a fall back to manifest MIME type
  - Register with {@link shaka.media.ManifestParser.registerParserByExtension}
    and {@link shaka.media.ManifestParser.registerParserByMime}
  - Default manifest parser plugins:
    - DASH: {@linksource shaka.dash.DashParser}
    - HLS: {@linksource shaka.hls.HlsParser}

__Subtitle/caption parsers__
  - Selected by MIME type
  - Register with {@link shaka.text.TextEngine.registerParser}
  - Default text parser plugins:
    - WebVTT: {@linksource shaka.text.VttTextParser} and
      {@linksource shaka.text.Mp4VttParser}
    - TTML: {@linksource shaka.text.TtmlTextParser} and
      {@linksource shaka.text.Mp4TtmlParser}

__Subtitle/caption displayers__
  - Configured at runtime on a Player instance
  - Use {@link player.configure} and set the `textDisplayFactory` field
  - Must implement the {@link shaka.extern.TextDisplayer} interface
  - Default TextDisplayer implementation:
    {@linksource shaka.text.SimpleTextDisplayer}

__Networking plugins__
  - Selected by URI scheme (http, https, etc.)
  - Register with {@link shaka.net.NetworkingEngine.registerScheme}
  - Default networking plugins:
    - HTTP(S) XHR: {@linksource shaka.net.HttpXHRPlugin}
    - HTTP(S) Fetch: {@linksource shaka.net.HttpFetchPlugin}
    - data URIs: {@linksource shaka.net.DataUriPlugin}

__ABR plugins__
  - Configured at runtime on a Player instance
  - Use {@link player.configure} and set the `abrFactory` field
  - Must implement the {@link shaka.extern.AbrManager} interface
  - Default AbrManager implementation: {@linksource shaka.abr.SimpleAbrManager}

__Polyfills__
  - All polyfills are installed by {@link shaka.polyfill.installAll}
  - Register with {@link shaka.polyfill.register}
  - Default polyfills:
    - prefixed fullscreen implementations:
      {@linksource shaka.polyfill.Fullscreen}
    - prefixed video QoE metrics:
      {@linksource shaka.polyfill.VideoPlaybackQuality}
    - prefixed EME implementations for IE 11 and very old versions of embedded
      Chrome/Chromium:
      - {@linksource shaka.polyfill.PatchedMediaKeysMs}
      - {@linksource shaka.polyfill.PatchedMediaKeysWebkit}
      - {@linksource shaka.polyfill.PatchedMediaKeysNop}
    - variants of VTTCue and TextTrackCue constructors:
      {@linksource shaka.polyfill.VTTCue}


#### Excluding Default Plugins

Core components cannot be removed from the build, but everything else is
technically optional.  For example, if you don't need WebVTT, you can exclude
our VTT parser from the build to save space.  Any VTT text streams found in a
manifest would then be ignored.

*(At the time of this writing, our default plugins account for 54% of the size
of our compiled library.)*

Because each plugin's source file ends with a call to register itself with the
core system, a plugin can simply be excluded from the build without changing
any of the source code.

You can start with the complete library (`+@complete`) and exclude any
individual source file with a minus sign and a path:

```sh
python build/build.py +@complete -lib/text/mp4_ttml_parser.js
```

You can also exclude an entire category of plugins:

```sh
# Build without polyfills:
python build/build.py +@complete -@polyfill
# Build without polyfills or text parsers:
python build/build.py +@complete -@polyfill -@text
```


#### Build Configs

Each of these arguments that starts with an '@' sign is a build config file in
`build/types/` containing a list sources or other configs to include.  Each
line in these files is treated as an argument to `build.py`.  For example,
this is what `build/types/networking` looks like:

```sh
# All standard networking scheme plugins.
+../../lib/net/http_plugin.js
+../../lib/net/data_uri_plugin.js
```


#### Adding Your Own Plugins

If you want to take advantage of the [Closure compiler], you can add your own
sources to the build.  Your plugins, like ours, should register themselves at
the bottom of the source file.

To add a single source file, prefix it with a plus sign:

```sh
python build/build.py +@complete +my_plugin.js
```

You can add multiple sources as well:

```sh
python build/build.py +@complete +my_plugin.js +/path/to/my_other_plugin.js
```


#### Custom Build Configs

If you have a long list of customizations, you may want to create your own
group file.  For example:

```sh
# Start with a complete library
+@complete
# Drop subtitle support
-@text
# Remove default networking plugins
-@networking
# Add my custom HTTP implementation
+/path/to/my_http_plugin.js
# Add an additional polyfill for some odd platform I'm targetting
+/path/to/my_platform_polyfill.js
```


#### Plugins in Your Application

Every plugin interface is exported from the compiled library so that you don't
have to customize the build to create a plugin.  Just register your plugins
with the appropriate interfaces after the library is loaded.


#### Giving Back

If you have a great plugin that you'd like to contribute back to the community,
we'd love to hear from you.  You can get in touch via our [issue tracker][] to
discuss it, and once it's ready, you can send a [pull request][] on github.

[issue tracker]: https://github.com/google/shaka-player/issues/new/choose
[pull request]: https://github.com/google/shaka-player/pull/new/master
