# License Wrapping

Applications sometimes need to communicate extra information to or from its
license server.  EME, the API that browsers provide for DRM, does not offer a
direct way to include extra information in a license request or extract extra
information from a license response.  To pass extra information, applications
must "wrap" requests and "unwrap" responses as they pass through JavaScript.

*Please note that the license server we are using in this tutorial is a
Widevine license server, so you will need to use Chrome to follow along.
Because EME requires a secure URL, you will also need to use localhost or
https for this tutorial.  See the note at the top of {@tutorial drm-config}
for more information.*


#### Wrapping License Requests

If your application needs to communicate complex information to the license
server along with the request, the solution is to "wrap" the platform's license
request and "unwrap" it at the license server.  In Shaka Player, this is
accomplished with a network request filter.

In practice, you may wrap the request in any format that can be constructed on
the client and parsed on the server.  For simplicity, the server used in this
tutorial expects a JSON format that looks like this:

```json
{
  "rawLicenseRequestBase64":
      "VGhlIHJhdyBsaWNlbnNlIHJlcXVlc3QgZ2VuZXJhdGVkIGJ5IHRoZSBDRE0=",
  ...
}
```

To start, we're going to use the code from {@tutorial basic-usage}, but use this
manifest and license server:

```js
const manifestUri =
    'https://storage.googleapis.com/shaka-demo-assets/sintel-widevine/dash.mpd';
const licenseServer = 'https://cwip-shaka-proxy.appspot.com/wrapped_request';
```

We'll also need to configure the player to use this license server before it
loads the manifest:

```js
  player.configure({
    drm: {
      servers: { 'com.widevine.alpha': licenseServer }
    }
  });

  // Try to load a manifest.
  try {
    await player.load(manifestUri);
    // The video should now be playing!
  } catch(e) {
    onError(e);
  }
```

This license server is expecting a wrapped request, so if we try to play now, we
will see `Error code 6007`, which means `LICENSE_REQUEST_FAILED`.  To wrap the
license request, we must register a request filter:

```js
  player.getNetworkingEngine().registerRequestFilter(function(type, request) {
    // Alias some utilities provided by the library.
    const StringUtils = shaka.util.StringUtils;
    const Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;

    // Only manipulate license requests:
    if (type == shaka.net.NetworkingEngine.RequestType.LICENSE) {
      // Create the wrapped request structure.
      const wrapped = {};

      // Encode the raw license request in base64.
      // The server we are using in this tutorial expects this field and this
      // encoding for the raw request.
      wrapped.rawLicenseRequestBase64 =
          Uint8ArrayUtils.toBase64(new Uint8Array(request.body));

      // Add whatever else we want to communicate to the server.
      // None of these values are read by the server we are using in this
      // tutorial.
      // In practice, you would send what the server needs and the server would
      // react to it.
      wrapped.favoriteColor = 'blue';
      wrapped.Beatles = ['John', 'Paul', 'George', 'Ringo'];
      wrapped.bestBeatleIndex = 1;  // Paul, of course.
      wrapped.pEqualsNP = false;  // maybe?

      // Encode the wrapped request as JSON.
      const wrappedJson = JSON.stringify(wrapped);
      // Convert the JSON string back into an ArrayBuffer to replace the request
      // body.
      request.body = StringUtils.toUTF8(wrappedJson);
    }
  });
```

Load the page again, and the license request will succeed.


#### Wrapping License Responses

If your license server needs to communicate complex information back to the
application, the solution is very similar to what we just did above.  We can
"wrap" the license itself in the server and "unwrap" it in the client.  In Shaka
Player, this is accomplished with a network response filter.

Similar to the guideline for license requests, you may wrap the response in any
format that can be constructed on the server and parsed by the client.  We will
again use JSON for simplicity.  The server will send a response with a format
that looks like this:

```json
{
  "rawLicenseBase64":
      "VGhlIHJhdyBsaWNlbnNlIGZyb20gdGhlIGxpY2Vuc2Ugc2VydmVyIGJhY2tlbmQ=",
  ...
}
```

Change the license server to:

```js
const licenseServer =
    'https://cwip-shaka-proxy.appspot.com/wrapped_request_and_response';
```

This license server is sending a wrapped response, so if we try to play now, we
will see `Error code 6008`, which means `LICENSE_RESPONSE_REJECTED`.  The
Widevine CDM does not understand this wrapped format, so we must unwrap it first
using a request filter:

```js
  player.getNetworkingEngine().registerResponseFilter(function(type, response) {
    // Alias some utilities provided by the library.
    const StringUtils = shaka.util.StringUtils;
    const Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;

    // Only manipulate license responses:
    if (type == shaka.net.NetworkingEngine.RequestType.LICENSE) {
      // This is the wrapped license, which is a JSON string.
      const wrappedString = StringUtils.fromUTF8(response.data);
      // Parse the JSON string into an object.
      const wrapped = JSON.parse(wrappedString);

      // This is a base64-encoded version of the raw license.
      const rawLicenseBase64 = wrapped.rawLicenseBase64;
      // Decode that base64 string into a Uint8Array and replace the response
      // data.  The raw license will be fed to the Widevine CDM.
      response.data = Uint8ArrayUtils.fromBase64(rawLicenseBase64);

      // Read additional fields from the server.
      // The server we are using in this tutorial does not send anything useful.
      // In practice, you could send any license metadata the client might need.
      // Here we log what the server sent to the JavaScript console for
      // inspection.
      console.log(wrapped);
    }
  });
```

Load the page again, and the license response will be accepted by the Widevine
CDM.  Open the JavaScript console to see what the server sent back.


#### Continue the Tutorials

Next, check out {@tutorial ui}.
