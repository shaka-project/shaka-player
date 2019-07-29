# FairPlay Support

When using native `src=` playback, we support using FairPlay on Safari.
Adding FairPlay support involves a bit more work than other key systems.


## Server certificate

All FairPlay content requires setting a server certificate.  This is set in the
Player configuration:

```js
const req = await fetch('https://example.com/cert.der');
const cert = await req.arrayBuffer();

player.configure('drm.advanced.com\\.apple\\.fps\\.1_0.serverCertificate',
                 new Uint8Array(cert));
```


## License wrapping

Many FairPlay servers require wrapping the license request/response.  Check out
the general {@tutorial license-wrapping} tutorial for more info.

The request object contains the `sessionId` of the session that made the
request.  The `body` contains the init data as an `Uint8Array`.  The init data
format is:

```
[4 bytes] initDataLen
[initDataLen bytes] initData
[4 bytes] contentIdLen
[contentIdLen bytes] contentId
[4 bytes] certLen
[certLen bytes] serverCertificate
```

The content ID is extracted from the init data.  The init data is provided by
the browser.  This data can be further altered using a request filter before it
is sent to your license server.

Similarly, if the response isn't what the browser expects, you may need to write
a response filter to alter the data from the server.


## Example filters

```js
player.getNetworkingEngine().registerRequestFilter((type, request) => {
  if (type != shaka.net.NetworkingEngine.RequestType.LICENSE) {
    return;
  }

  const originalPayload = new Uint8Array(request.body);
  const base64Payload =
      shaka.util.Uint8ArrayUtils.toStandardBase64(originalPayload);
  const params = 'spc=' + base64Payload;
  request.headers['Content-Type'] = 'application/x-www-form-urlencoded';
  request.body = shaka.util.StringUtils.toUTF8(encodeURIComponent(params));
});

player.getNetworkingEngine().registerResponseFilter((type, request) => {
  if (type != shaka.net.NetworkingEngine.RequestType.LICENSE) {
    return;
  }

  let responseText = shaka.util.StringUtils.fromUTF8(response.data);
  // Trim whitespace.
  responseText = responseText.trim();

  // Look for <ckc> wrapper and remove it.
  if (responseText.substr(0, 5) === '<ckc>' &&
      responseText.substr(-6) === '</ckc>') {
    responseText = responseText.slice(5, -6);
  }

  // Decode the base64-encoded data into the format the browser expects.
  response.data = shaka.util.Uint8ArrayUtils.fromBase64(responseText).buffer;
});
```
