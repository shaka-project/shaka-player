# Monetization with Ads

Shaka Player provides an API for serving ads to make monetization easier
for apps. Our current API is tailored for our integration with the
[Interactive Media Ads][] SDKs, but we plan to extend our support to
other ad providers in v3.1+.
Please note that the current API is likely to undergo significant
changes as our support extends.

#### IMA SDK Integration

Shaka Player provides an integration with the [Interactive Media Ads][] SDKs.
We support both Client Side and Server Side ad insertion.


[Interactive Media Ads]: https://developers.google.com/interactive-media-ads

Both the Client Side and the Server Side ad insertion experiences are available
through the {@linksource shaka.extern.IAdManager} object on the Player.


```js
const adManager = player.getAdManager();
```

First, you'll need to include the IMA SDK(s) on your HTML page:

```html
<!DOCTYPE html>
<html>
  <head>
    <!-- Shaka Player ui compiled library: -->
    <script src="dist/shaka-player.ui.js"></script>
    <!-- Shaka Player ui compiled library default CSS: -->
    <link rel="stylesheet" type="text/css" href="dist/controls.css">
    <!-- IMA HTML5 SDK (for serving Client Side ads): -->
    <script type="text/javascript" src="https://imasdk.googleapis.com/js/sdkloader/ima3.js"></script>
    <!-- IMA DAI SDK (for serving Server Side ads): -->
    <script type="text/javascript" src="https://imasdk.googleapis.com/js/sdkloader/ima3_dai.js"></script>
    <!-- Your application source: -->
    <script src="myapp.js"></script>
  </head>
</html>
```

#### Streaming with Client Side Ads Insertion

To integrate Client Side ads into a presentation, you need to have your ad tag
URIs. If you're not using Shaka's UI library, you will also need to create a
`<div>` over your video element to serve as an ad container.

Start by initializing the client side logic.
With Shaka UI:

```js
const adManager = player.getAdManager();
const video = document.getElementById('video');
const ui = video['ui'];
// If you're using a non-UI build, this is the div you'll need to create
// for your layout.  The ad manager will clear this div, when it unloads, so
// don't pass in a div that contains non-ad elements.
const container = video.ui.getControls().getClientSideAdContainer();
adManager.initClientSide(container, video);
```

With the client side logic initialized, you can request ads at any time during
the presentation.

```js
const adsRequest = new google.ima.AdsRequest();
// Your ad tag url should go here. We are using a sample ad tag from the
// IMA HTML5 SDK implementation guide for this tutorial.
adsRequest.adTagUrl = 'https://pubads.g.doubleclick.net/gampad/ads?' +
    'sz=640x480&iu=/124319096/external/single_ad_samples&ciu_szs=300x250&' +
    'impl=s&gdfp_req=1&env=vp&output=vast&unviewed_position_start=1&' +
    'cust_params=deployment%3Ddevsite%26sample_ct%3Dlinear&correlator=';
adManager.requestClientSideAds(adsRequest);
```

See: [google.ima.AdsRequest][] for details on the request object.

[google.ima.AdsRequest]: https://developers.google.com/interactive-media-ads/docs/sdks/html5/v3/reference/js/ima.AdsRequest

#### Streaming with Server Side Ads Insertion

To integrate Server Side ads into a presentation, you need to have a Google Ad
Manager account and host your streams on Google Ad Manager's servers. To find
out more about the Google Ad Manager service or sign up for an account, visit
https://admanager.google.com/

If you're not using Shaka's UI library, you will
also need to create a `<div>` over your video element to serve as an ad
container.

Start by initializing the server side logic.
With Shaka UI:

```js
const adManager = player.getAdManager();
const video = document.getElementById('video');
const ui = video['ui'];
// If you're using a non-UI build, this is the div you'll need to create
// for your layout.
const container = video.ui.getControls().getServerSideAdContainer();
adManager.initServerSide(container, video);
```

With server side logic initialized, you can request and load streams with
dynamically inserted ads.

Requesting a VOD stream:

```js
const streamRequest = new google.ima.dai.api.VODStreamRequest();
// Your stream information will go here. We are using IMA's sample stream info
// in this tutorial.
streamRequest.contentSourceId = '2528370';
streamRequest.videoId = 'tears-of-steel';
const uri = await adManager.requestServerSideStream(streamRequest);
player.load(uri);
```

`shaka.extern.IAdManager.requestServerSideStream()` returns a Promise with a
manifest URI that points to a stream with ads inserted.

See [google.ima.dai.api.VODStreamRequest][] for details on the request object.

[google.ima.dai.api.VODStreamRequest]: https://developers.google.com/interactive-media-ads/docs/sdks/html5/dai/reference/js/VODStreamRequest

Requesting a LIVE stream:

```js
const streamRequest = new google.ima.dai.api.LiveStreamRequest();
// Your stream information will go here. We are using IMA's sample stream info
// in this tutorial.
streamRequest.assetKey = 'sN_IYUG8STe1ZzhIIE_ksA';
const uri = await adManager.requestServerSideStream(streamRequest);
player.load(uri);
```

See: [google.ima.dai.api.LiveStreamRequest][] for details on the request object.

[google.ima.dai.api.LiveStreamRequest]: https://developers.google.com/interactive-media-ads/docs/sdks/html5/dai/reference/js/LiveStreamRequest

If you are using Shaka's UI library, we will automatically hook up our ad UI.

#### Listening To Ad Events
We unify Server Side and Client Side ad events into our own Shaka ad events and
objects. which your application can listen to and interact with.
Check out the {@link shaka.ads.AdManager#event:AdBreakReadyEvent|full list of 
ad events} for details.

Let's register a simple listener to Shaka's AD_STARTED event. It will log the
start of the ad in the console.

```js
adManager.addEventListener(shaka.ads.AdManager.AD_STARTED, () => {
  console.log('An ad has started');
});
```

Every shaka ad event contains an original SDK event and an ad object if those
are available. Most apps are unlikely to need them, but if you have a use case
that requires access to those, here is how to get them:

```js
// Note that unlike in the previous example, we are capturing the AD_STARTED
// event object here (the "e" parameter of the lambda function) so we can access
// its properties.
adManager.addEventListener(shaka.ads.AdManager.AD_STARTED, (e) => {
  const sdkAdObject = e['sdkAdObject'];
  const originalEvent = e['originalEvent'];
});
```

#### Accommodating IMA Power Users
If you have an existing IMA integration you want to plug into Shaka, or you want
to use more intricate SDK capabilities not exposed through our API, we provide a
way to do that.
Listen to the {@link shaka.ads.AdManager#event:ImaAdManagerLoadedEvent} for
Client Side or the {@link shaka.ads.AdManager#event:ImaStreamManagerLoadedEvent}
for Server Side to get the IMA [AdManager][] or [StreamManager][] objects.

```js
adManager.addEventListener(shaka.ads.AdManager.IMA_AD_MANAGER_LOADED, (e) => {
  const imaAdManager = e['imaAdManager'];
});

adManager.addEventListener(shaka.ads.AdManager.IMA_STREAM_MANAGER_LOADED, (e) => {
  const imaStreamManager = e['imaStreamManager'];
});
```
[AdManager]: https://developers.google.com/interactive-media-ads/docs/sdks/html5/client-side/reference/js/google.ima.AdsManager
[StreamManager]: https://developers.google.com/interactive-media-ads/docs/sdks/html5/dai/reference/js/StreamManager

#### Disabling Cookies For Serving Limited Ads
The server side IMA SDK allows limited ads to be served when the user does not
give or denies consent to cookies. To allow this, set the `ltd` parameter using
`StreamRequest.adTagParameters` as described in the [IMA limited ads guide][].
To set up cookie-less manifest and segment requests, use an appropriate
`requestFilter`. Please note that `request.withCredentials` flag is `false` by
default, so you should only need to set this if you've enabled it in other parts of
your code.

```js
  player.getNetworkingEngine().registerRequestFilter(function(type, request, advType) {
    if (type == shaka.net.NetworkingEngine.RequestType.MANIFEST ||
        type == shaka.net.NetworkingEngine.RequestType.SEGMENT) {
      request.withCredentials = false;
    }
  });
```
[IMA limited ads guide]: https://developers.devsite.corp.google.com/interactive-media-ads/docs/sdks/html5/dai/limited-ads

#### Custom Ad Manager Implementations
Our architecture supports custom ad manager implementations. Every ad manager
should implement the {@linksource shaka.extern.IAdManager} interface. To make
the player use a custom ad manager implementation, invoke the code to set it
before instantiating the player.

```js
// myapp.CustomAdManager is a placeholder name for your ad manager implementation.
shaka.Player.setAdManagerFactory(() => new myapp.CustomAdManager());
```

#### Continue the Tutorials

Next, check out {@tutorial plugins}.
