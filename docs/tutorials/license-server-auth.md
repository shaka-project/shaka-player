# License Server Authentication

Your application's license server may require some form of authentication so
that it only delivers licenses to paying users.  In this tutorial, we're going
to use various license server endpoints that require various forms of
authentication.

*Please note that the license server we are using in this tutorial is a
Widevine license server, so you will need to use Chrome to follow along.
Because EME requires a secure URL, you will also need to use localhost or
https for this tutorial.  See the note at the top of {@tutorial drm-config}
for more information.*

To start, we're going to use the code from {@tutorial basic-usage}, but use this
manifest and license server:

```js
const manifestUri =
    'https://storage.googleapis.com/shaka-demo-assets/sintel-widevine/dash.mpd';
const licenseServer = 'https://cwip-shaka-proxy.appspot.com/no_auth';
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
  } catch (e) {
    onError(e);
  }
```

Since the endpoint is `/no_auth`, this should play without authentication.


#### Header authentication

First, we'll try authentication using headers.  Change the license server to:

```js
const licenseServer = 'https://cwip-shaka-proxy.appspot.com/header_auth';
```

This endpoint requires a specific header value to deliver a license.  If you
try to use it without setting the authentication header, you will see `Error
code 6007`, which means `LICENSE_REQUEST_FAILED`.  The JavaScript console will
show you a failed HTTP request with HTTP status code `401 (Unauthorized)`, and
playback will hang when you get to the encrypted part of the stream (10 seconds
in).

To authenticate to this endpoint, we must send a special header.  You can add
arbitrary headers to Shaka's requests through a request filter callback.
Register the filter before calling `player.load()`:

```js
  player.getNetworkingEngine().registerRequestFilter(function(type, request) {
    // Only add headers to license requests:
    if (type == shaka.net.NetworkingEngine.RequestType.LICENSE) {
      // This is the specific header name and value the server wants:
      request.headers['CWIP-Auth-Header'] = 'VGhpc0lzQVRlc3QK';
    }
  });
```

Load the page again, and the license request will succeed.  Although we are
using a fixed value for the purposes of this tutorial, your application can
derive appropriate authentication header(s) before or during the callback.


#### Parameter Authentication

Next, we'll try authentication using URL parameters.  Change the license server
to:

```js
const licenseServer = 'https://cwip-shaka-proxy.appspot.com/param_auth';
```

This endpoint requires a specific URL parameter to deliver a license.  If you
try to use it without setting the parameter, you will see `Error code 6007`
(`LICENSE_REQUEST_FAILED`) just as before with header authentication.

We can use a request filter to modify the URL and add the required parameter:

```js
  player.getNetworkingEngine().registerRequestFilter(function(type, request) {
    // Only add headers to license requests:
    if (type == shaka.net.NetworkingEngine.RequestType.LICENSE) {
      // This is the specific parameter name and value the server wants:
      // Note that all network requests can have multiple URIs (for fallback),
      // and therefore this is an array. But there should only be one license
      // server URI in this tutorial.
      request.uris[0] += '?CWIP-Auth-Param=VGhpc0lzQVRlc3QK';
    }
  });
```

Load the page again, and the license request will succeed.


#### Cookie Authentication

Finally, let's try using cookies for authentication.  Change the license server
to:

```js
const licenseServer = 'https://cwip-shaka-proxy.appspot.com/cookie_auth';
```

This endpoint requires a specific cookie to deliver a license.  If you try to
use it without setting the parameter, you will see `Error code 6007`
(`LICENSE_REQUEST_FAILED`) just as with the other endpoints.

Cookies are set by a server to be returned to that server, and are not sent by
the JavaScript application.  So to set the required cookie value, point your
browser to the server's [set\_cookie][] page.

Open the JavaScript console and check the value of `document.cookie` to confirm
that you have the cookie. You should see `"CWIP-Auth-Cookie=VGhpc0lzQVRlc3QK"`.

Now load the Shaka page again, and ... we still get error code 6007.  What
happened?

Cookies are considered "credentials" by the browser's XmlHttpRequest API, and
credentials may not be sent cross-origin unless:

1. [explicitly requested by the application](https://developer.mozilla.org/en-US/docs/Web/HTTP/Access_control_CORS#Requests_with_credentials) AND
2. [explicitly allowed by the destination server](https://developer.mozilla.org/en-US/docs/Web/HTTP/Access_control_CORS#Access-Control-Allow-Credentials)

Our `cookie_auth` endpoint sends back headers that allow credentialed requests,
so we set a flag in our request filter to send credentials cross-site:

```js
  player.getNetworkingEngine().registerRequestFilter(function(type, request) {
    if (type == shaka.net.NetworkingEngine.RequestType.LICENSE) {
      request.allowCrossSiteCredentials = true;
    }
  });
```

Load the page again, and the license request will succeed.

[set\_cookie]: http://cwip-shaka-proxy.appspot.com/set_cookie


#### Always Sending Credentials

Now, you may be asking yourself: "Why not just make `true` the default and
always send credentials when we have them?"

If a server does not explicitly allow credentials to be sent cross-origin,
setting this flag would cause the request to fail *even if the client has no
cookies to send*.  If you'd like to try this out, clear your cookies by
pointing your browser to the server's [delete\_cookie][] page.  Then set your
license server back to:

```js
const licenseServer = 'https://cwip-shaka-proxy.appspot.com/no_auth';
```

Since `allowCrossSiteCredentials` is `true` and that endpoint doesn't
explicitly allow credentials, you'll get a failure.  The JavaScript console
will show a message from the browser that says something like:

```html
Credentials flag is 'true', but the 'Access-Control-Allow-Credentials' header
is ''. It must be 'true' to allow credentials. Origin 'http://localhost' is
therefore not allowed access.
```

[delete\_cookie]: http://cwip-shaka-proxy.appspot.com/delete_cookie


#### Asynchronous Credentials

In some scenarios, you may not know the credentials right away.  You would like
to make an additional request to get those credentials before you attach them to
the request Shaka Player wants to make.

Since v2.1.0, we support asynchronous filters.  This allows you to pause a
license request, make an additional request for an authorization token, then use
that token to complete the license request.

Any filter that returns a Promise is an asynchronous filter.  NetworkingEngine
uses Promises for requests, so it is easy to make an additional request as part
of an asynchronous filter.

To start, change the license server and add two additional variables:

```js
const licenseServer = 'https://cwip-shaka-proxy.appspot.com/header_auth';
const authTokenServer = 'https://cwip-shaka-proxy.appspot.com/get_auth_token';
const authToken = null;
```

Now change the request filter:

```js
  player.getNetworkingEngine().registerRequestFilter(function(type, request) {
    // Only add headers to license requests:
    if (type != shaka.net.NetworkingEngine.RequestType.LICENSE) return;

    // If we already know the token, attach it right away:
    if (authToken) {
      console.log('Have auth token, attaching to license request.');
      request.headers['CWIP-Auth-Header'] = authToken;
      return;
    }

    console.log('Need auth token.');
    // Start an asynchronous request, and return a Promise chain based on that.
    const authRequest = {
      uris: [authTokenServer],
      method: 'POST',
    };
    const requestType = shaka.net.NetworkingEngine.RequestType.APP;
    return player.getNetworkingEngine().request(requestType, authRequest)
        .promise.then(function(response) {
          // This endpoint responds with the value we should use in the header.
          authToken = shaka.util.StringUtils.fromUTF8(response.data);
          console.log('Received auth token', authToken);
          request.headers['CWIP-Auth-Header'] = authToken;
          console.log('License request can now continue.');
        });
  });
```

Load the page again.  The license request will be delayed, an additional request
will be made for the auth token, and then the license request will continue.
You should see these messages in the JavaScript console:

```html
Need auth token.
Received auth token VGhpc0lzQVRlc3QK
License request can now continue.
```

If you need them, you can also create asynchronous response filters in the same
way.


#### Continue the Tutorials

Next, check out {@tutorial license-wrapping}.
