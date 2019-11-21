const manifestUri =
  "https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd";
const licenseServer = "https://cwip-shaka-proxy.appspot.com/header_auth";
const authTokenServer = "https://cwip-shaka-proxy.appspot.com/get_auth_token";
let authToken: string | null = null;

function initApp() {
  shaka.polyfill.installAll();
  if (shaka.Player.isBrowserSupported()) {
    initPlayer();
  } else {
    console.error("Browser not supported!");
  }
}

async function initPlayer() {
  const video = document.getElementById("video");
  if (!(video instanceof HTMLMediaElement)) {
    throw new Error("video must be a media element");
  }
  const player = new shaka.Player(video);
  configure(player);
  player.addEventListener("error", onErrorEvent);
  try {
    await player.load(manifestUri);
    console.log("The video has now been loaded!");
  } catch (error) {
    onError(error);
  }
}

function configure(player: shaka.Player) {
  player.configure({
    streaming: {
      bufferingGoal: 120
    }
  });
  player.configure("streaming.bufferingGoal", 120);

  player.getConfiguration();
  player.configure("preferredAudioLanguage", "fr-CA");
  player.getConfiguration().preferredAudioLanguage;
  player.getConfiguration().streaming.bufferingGoal;
  player.getConfiguration().streaming.rebufferingGoal;
  player.configure({
    streaming: {
      bufferingGoal: undefined,
      rebufferingGoal: 15
    }
  });

  player.configure({
    drm: {
      servers: { "com.widevine.alpha": licenseServer }
    }
  });

  player
    .getNetworkingEngine()
    .registerRequestFilter(async function(type, request) {
      // Only add headers to license requests:
      if (type !== shaka.net.NetworkingEngine.RequestType.LICENSE) {
        return;
      }
      // If we already know the token, attach it right away:
      if (authToken) {
        console.log("Have auth token, attaching to license request.");
        request.headers["CWIP-Auth-Header"] = authToken;
        return;
      }

      console.log("Need auth token.");
      // Start an asynchronous request, and return a Promise chain based on that.
      const authRequest = {
        uris: [authTokenServer],
        method: "POST"
      };
      const requestType = shaka.net.NetworkingEngine.RequestType.APP;
      const response = await player
        .getNetworkingEngine()
        .request(requestType, authRequest).promise;

      // This endpoint responds with the value we should use in the header.
      authToken = shaka.util.StringUtils.fromUTF8(response.data);
      console.log("Received auth token", authToken);
      request.headers["CWIP-Auth-Header"] = authToken;
      console.log("License request can now continue.");
    });

  player
    .getNetworkingEngine()
    .registerRequestFilter(async function(type, request) {
      // Alias some utilities provided by the library.
      const { StringUtils, Uint8ArrayUtils } = shaka.util;

      // Only manipulate license requests:
      if (type == shaka.net.NetworkingEngine.RequestType.LICENSE) {
        // Create the wrapped request structure.
        const wrapped = {
          // Encode the raw license request in base64.
          // The server we are using in this tutorial expects this field and this
          // encoding for the raw request.
          rawLicenseRequestBase64: Uint8ArrayUtils.toBase64(
            new Uint8Array(request.body)
          ),
          // Add whatever else we want to communicate to the server.
          // None of these values are read by the server we are using in this
          // tutorial.
          // In practice, you would send what the server needs and the server would
          // react to it.
          favoriteColor: "blue",
          Beatles: ["John", "Paul", "George", "Ringo"],
          bestBeatleIndex: 1, // Paul, of course.
          pEqualsNP: false // maybe?
        };
        // Encode the wrapped request as JSON.
        const wrappedJson = JSON.stringify(wrapped);
        // Convert the JSON string back into an ArrayBuffer to replace the request
        // body.
        request.body = StringUtils.toUTF8(wrappedJson);
      }
    });

  player
    .getNetworkingEngine()
    .registerResponseFilter(async function(type, response) {
      // Alias some utilities provided by the library.
      const { StringUtils, Uint8ArrayUtils } = shaka.util;

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
}

function onErrorEvent(event) {
  onErrorEvent(event.detail);
}

function onError(error: shaka.extern.Error) {
  console.error("Error code", error.code, "object", error);
}
