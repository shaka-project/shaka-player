# DRM Configuration

#### NOTE: EME and http URLs

EME requires a secure URL to use.  This means you have to use `https` or be on
`localhost`.  Currently only Chrome enforces it, but other browsers will in the
future.  Also, because of mixed content requirements, if your site is using
`https`, then your manifest and every segment will also need to use `https` too.

See: Chrome's [announcement][], Firefox's [intent to remove][firefox_bug], and
how to [disable for testing][allow_http].

[allow_http]: https://www.chromium.org/Home/chromium-security/deprecating-powerful-features-on-insecure-origins
[announcement]: https://groups.google.com/a/chromium.org/forum/#!msg/blink-dev/tXmKPlXsnCQ/ptOETCUvBwAJ
[firefox_bug]: https://bugzilla.mozilla.org/show_bug.cgi?id=1322517


#### License Servers

Without DRM configuration, Shaka only plays clear content.  To play protected
content, the application only needs to tell Shaka one basic thing: the URL(s)
of its license server(s).

We've made this simple through `player.configure()`.  The field `drm.servers` is
an object mapping key system IDs to server URLs.  For example, to set license
servers for both Widevine and Playready:

```js
player.configure({
  drm: {
    servers: {
      'com.widevine.alpha': 'https://foo.bar/drm/widevine',
      'com.microsoft.playready': 'https://foo.bar/drm/playready'
    }
  }
});
```

Assuming your manifest uses the standard UUIDs for those key systems, that's
all you need to do.


#### Choosing a Key System

Shaka Player is key-system-agnostic, meaning we don't prefer any key systems
over any others.  We use EME to ask the browser what it supports, and make no
assumptions.  If your browser supports multiple key systems, the first supported
key system in the manifest is used.

The interoperable encryption standard that DRM vendors are implementing is
called Common Encryption (CENC).  Some DASH manifests don't specify any
particular key system at all, but instead state that any CENC system will do:

```xml
<ContentProtection schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc"/>
```

If this is the only `<ContentProtection>` element in the manifest, Shaka will
try all key systems it knows.  (Based on
{@linksource shaka.dash.ContentProtection.defaultKeySystems_}.)
If the browser supports it and you configured a license server URL for it, we'll
use it.


#### Clear Key

The EME spec requires browsers to support a common key system called "Clear
Key".  *(At the time of this writing (April 2016), only Chrome and Firefox
have implemented "Clear Key".)*
Clear Key uses unencrypted keys to decrypt CENC content, and can be useful
for diagnosing problems and testing integrations.  To configure Clear Key,
use the configuration field `drm.clearKeys` and provide a map of key IDs to
content keys (both in hex):

```js
player.configure({
  drm: {
    clearKeys: {
      'deadbeefdeadbeefdeadbeefdeadbeef': '18675309186753091867530918675309',
      '02030507011013017019023029031037': '03050701302303204201080425098033'
    }
  }
});
```

This will force the use of Clear Key for decryption, regardless of what is in
your manifest.  Use this when you need to confirm that your keys are correct.


#### Clear Key Licenses

If your manifest actually specifies Clear Key, you can also use the normal
license request mechanism to retrieve keys based on key IDs.  The EME spec
defines a JSON-based [license request format] and [license format] for the
Clear Key CDM.  If you have a server that understands these, just configure
a license server as normal:

```js
player.configure({
  drm: {
    servers: {
      'org.w3.clearkey': 'http://foo.bar/drm/clearkey'
    }
  }
});
```

[license request format]: https://w3c.github.io/encrypted-media/#clear-key-request-format
[license format]: https://w3c.github.io/encrypted-media/#clear-key-license-format


#### Advanced DRM Configuration

We have several {@link shaka.extern.AdvancedDrmConfiguration advanced options}
available to give you access to the full EME configuration.  The config field
`drm.advanced` is an object mapping key system IDs to their advanced settings.
For example, to require hardware security in Widevine:

```js
player.configure({
  drm: {
    servers: {
      'com.widevine.alpha': 'https://foo.bar/drm/widevine'
    },
    advanced: {
      'com.widevine.alpha': {
        'videoRobustness': 'HW_SECURE_ALL',
        'audioRobustness': 'HW_SECURE_ALL'
      }
    }
  }
});
```

If you don't need them, you can leave these at their default settings.


#### Robustness

Robustness refers to how securely the content is handled by the key system. This
is a key-system-specific string that specifies the requirements for successful
playback.  Passing in a higher security level than can be supported will cause
`player.load()` to fail with `REQUESTED_KEY_SYSTEM_CONFIG_UNAVAILABLE`.  The
default is the empty string, which is the lowest security level supported by the
key system.

Each key system has their own values for robustness.  The values for Widevine
are well-known (see the [Chromium sources][]) and listed below, but
values for other key systems are not known to us at this time.

[Chromium sources]: https://cs.chromium.org/chromium/src/components/cdm/renderer/widevine_key_system_properties.h?q=SW_SECURE_CRYPTO&l=22

- `SW_SECURE_CRYPTO`
- `SW_SECURE_DECODE`
- `HW_SECURE_CRYPTO`
- `HW_SECURE_DECODE`
- `HW_SECURE_ALL`


#### Continue the Tutorials

Next, check out {@tutorial license-server-auth}.
