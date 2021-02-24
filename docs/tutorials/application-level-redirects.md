# Application-Level Redirects

Not all browsers will follow an HTTP redirect on a preflighted cross-origin
request.  For more detailed background on Cross-Origin Resource Sharing (CORS),
see [MDN's CORS article](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
and in particular, the section titled "Preflighted requests and redirects".

Some services have decided to work around this limitation by not using HTTP
redirects at all, but rather using a technique called Application-Level
Redirects or ALRs.  In this setup, the server will return an HTTP 200 response
instead of an HTTP 302 redirect, and the new URL will be placed in the response
body where the client can access it.

With Shaka Player, it is possible to support this scheme through response
filters.  The ALR response filter examines the response, determines if the
response is an ALR, and if so, starts a new request.  The response to the new
request replaces the original response.

There are many potential reasons for these redirects, such as authentication or
load-balancing.  There are also many possible schemes for a server to signal an
Application-Level Redirect to a client.  Because it is "application-level", it
is completely up to the application to define how it works.  Therefore we do not
offer built-in ALR functionality in Shaka Player.  Instead, we give a full
example here of how a particular ALR scheme might work.

In this example, the ALR's full response body is the new URL.  It can be
detected by looking for "http" in the beginning of the response body.  These
ALRs are done on manifest requests, for the specific purpose of cookie-based
authentication.  So the filter below checks for `RequestType.MANIFEST` and sets
`allowCrossSiteCredentials`.  Please customize these details for your own
purposes and ALR schemes.

```js
// The UTF-8 characters "h", "t", "t", and "p".
const HTTP_IN_HEX = 0x68747470;

const RequestType = shaka.net.NetworkingEngine.RequestType;

player.getNetworkingEngine().registerResponseFilter(async (type, response) => {
  // NOTE: If the system requires an ALR for both manifests and segments,
  // remove this RequestType check.
  if (type != RequestType.MANIFEST) {
    return;
  }

  const dataView = new DataView(response.data);
  if (response.data.byteLength < 4 ||
      dataView.getUint32(0) != HTTP_IN_HEX) {
    // Our ALRs are detected by a response body which is a URL.
    // This doesn't start with "http", so it is not an ALR.
    return;
  }

  // It's an Application-Level Redirect (ALR).  That requires us to get the new
  // URL and follow it.

  // Interpret the response data as a URL string.
  const responseAsString = shaka.util.StringUtils.fromUTF8(response.data);

  // For maximum flexibility for those who will copy and paste this whole code
  // snippet, check the type of the request to determine what retry parameters
  // to use.  Those who are reading and customizing this code can hard-code the
  // parameters instead.
  let retryParameters;
  if (type == RequestType.MANIFEST) {
    retryParameters = player.getConfiguration().manifest.retryParameters;
  } else if (type == RequestType.SEGMENT) {
    retryParameters = player.getConfiguration().streaming.retryParameters;
  } else if (type == RequestType.LICENSE) {
    retryParameters = player.getConfiguration().drm.retryParameters;
  } else {
    retryParameters = shaka.net.NetworkingEngine.defaultRetryParameters();
  }

  // Make another request for the redirect URL.
  const uris = [responseAsString];
  const redirectRequest =
      shaka.net.NetworkingEngine.makeRequest(uris, retryParameters);

  // NOTE: Only do this if the purpose of the redirect is authentication.  If
  // the ALR is meant for something like load-balancing, remove the next line.
  redirectRequest.allowCrossSiteCredentials = true;

  const requestOperation =
      player.getNetworkingEngine().request(type, redirectRequest);
  const redirectResponse = await requestOperation.promise;

  // Modify the original response to contain the results of the redirect
  // response.
  response.data = redirectResponse.data;
  response.headers = redirectResponse.headers;
  response.uri = redirectResponse.uri;
});
```
