# Widevine Service Certificates

With Widevine, you can eliminate one round-trip to your license server or proxy
per session by preloading a Widevine service certificate. You can either provide
it directly or set a URI and let Shaka fetch it for you. Do this before calling
`player.load()`. The values will persist across multiple calls to `load()` on
the same `shaka.Player` instance.

```js
// This is an example of loading the certificate from your site at runtime.
// You could also choose to bundle it into your JavaScript as a Uint8Array.
const req = await fetch('https://example.com/service.cert');
const cert = new Uint8Array(await req.arrayBuffer());

// This is the short form for configuration of a certificate:
player.configure('drm.advanced.com\\.widevine\\.alpha.serverCertificate',
                 cert);

// This is the long form:
player.configure({
  drm: {
    advanced: {
      'com.widevine.alpha': {
        'serverCertificate': cert,
      },
    },
  },
});


// This is the short form for configuration of a certificate URI:
player.configure('drm.advanced.com\\.widevine\\.alpha.serverCertificateUri',
                 'https://example.com/service.cert');

// This is the long form:
player.configure({
  drm: {
    advanced: {
      'com.widevine.alpha': {
        'serverCertificateUri': 'https://example.com/service.cert',
      },
    },
  },
});
```
