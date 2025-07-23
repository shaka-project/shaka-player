# Monetization with Ads

Shaka Player provides an API for serving ads to make monetization easier
for apps. Our current API is tailored for our integration with the
[Interactive Media Ads][] SDKs, but we plan to extend our support to
other ad providers in v3.1+.
Please note that the current API is likely to undergo significant
changes as our support extends.

#### AWS Elemental MediaTailor Integration

Shaka Player provides an integration with the [AWS Elemental MediaTailor][].
We support Client Side, Server Side and overlays ad insertion.

[AWS Elemental MediaTailor]: https://aws.amazon.com/mediatailor/

All ad insertion experiences are available through the
{@linksource shaka.extern.IAdManager} object on the Player.

If you're not using Shaka's UI library, you will
also need to create a `<div>` over your video element to serve as an ad
container.

Start by initializing the server side logic.
With Shaka UI:

```js
const video = document.getElementById('video');
const ui = video['ui'];
const controls = video.ui.getControls();
// If you're using a non-UI build, this is the div you'll need to create
// for your layout.
const container = controls.getServerSideAdContainer();
const player = controls.getPlayer();
const netEngine = player.getNetworkingEngine();
const adManager = player.getAdManager();
adManager.initMediaTailor(container, netEngine, video);
```

Requesting a Client Side stream:

```js
const mediaTailorUrl = 'https://d305rncpy6ne2q.cloudfront.net/v1/session/94063eadf7d8c56e9e2edd84fdf897826a70d0df/SFP-MediaTailor-VOD-HLS-DASH/out/v1/b94f3611978f419985a18335bac9d9cb/ddb73bf548a44551a0059c346226445a/eaa5485198bf497284559efb8172425e/index.mpd';
const mediaTailorAdsParams = {
  adsParams: {
    assetid: 'test2',
    podduration: '15',
  },
};
const uri = await adManager.requestMediaTailorStream(mediaTailorUrl, mediaTailorAdsParams);
player.load(uri);
```

Requesting a Server Side stream:

```js
const mediaTailorUrl = 'https://ad391cc0d55b44c6a86d232548adc225.mediatailor.us-east-1.amazonaws.com/v1/session/d02fedbbc5a68596164208dd24e9b48aa60dadc7/singssai/master.m3u8';
const uri = await adManager.requestMediaTailorStream(mediaTailorUrl);
player.load(uri);
```

Note: overlays ad insertions is the same as server side.

#### Interstitial Integration

Shaka Player supports different types of interstitials:
 - HLS Interstitials
 - DASH Media Presentation Insertion
 - Custom Interstitials
 - VAST (playback without tracking)
 - VMAP (playback without tracking)


##### HLS Interstitials

It is not necessary to do anything, Shaka Player supports it natively without
any type of intervention.


##### DASH Media Presentation Insertion (MPD alternate)

It is not necessary to do anything, Shaka Player supports it natively without
any type of intervention.


##### Custom Interstitials

Example:

```js
const adManager = player.getAdManager();
const video = document.getElementById('video');
const ui = video['ui'];
// If you're using a non-UI build, this is the div you'll need to create
// for your layout.  The ad manager will clear this div, when it unloads, so
// don't pass in a div that contains non-ad elements.
const container = video.ui.getControls().getClientSideAdContainer();
adManager.initInterstitial(container, player, video);
adManager.addCustomInterstitial({
  id: null,
  groupId: null,
  startTime: 10,
  endTime: null,
  uri: 'YOUR_URL',
  mimeType: null,
  isSkippable: true,
  skipOffset: 10,
  skipFor: null,
  canJump: false,
  resumeOffset: null,
  playoutLimit: null,
  once: true,
  pre: false,
  post: false,
  timelineRange: false,
  loop: false,
  overlay: null,
  displayOnBackground: false,
  currentVideo: null,
  background: null,
  clickThroughUrl: null,
});
```

You can also use this with SCTE-35:

```js
const adManager = player.getAdManager();
const video = document.getElementById('video');
const ui = video['ui'];
// If you're using a non-UI build, this is the div you'll need to create
// for your layout.  The ad manager will clear this div, when it unloads, so
// don't pass in a div that contains non-ad elements.
const container = video.ui.getControls().getClientSideAdContainer();
adManager.initInterstitial(container, player, video);
player.addEventListener('timelineregionadded', (e) => {
  const event = e.detail;
  if (event.schemeIdUri != 'urn:scte:scte35:2014:xml+bin') {
    return;
  }
  adManager.addCustomInterstitial({
    id: event.id,
    groupId: null,
    startTime: event.startTime,
    endTime: event.endTime,
    uri: 'YOUR_URL',
    mimeType: null,
    isSkippable: false,
    skipOffset: null,
    skipFor: null,
    canJump: true,
    resumeOffset: player.isLive() ? null : 0,
    playoutLimit: null,
    once: false,
    pre: false,
    post: false,
    timelineRange: player.isLive(), // If true, the ad will appear as a range on the timeline.
    loop: false,
    overlay: null,
    displayOnBackground: false,
    currentVideo: null,
    background: null,
    clickThroughUrl: null,
  });
});
```


##### Custom Overlay Interstitials

Image, video (progressive or manifest) or website overlays are supported.


Example:

```js
const adManager = player.getAdManager();
const video = document.getElementById('video');
const ui = video['ui'];
// If you're using a non-UI build, this is the div you'll need to create
// for your layout.  The ad manager will clear this div, when it unloads, so
// don't pass in a div that contains non-ad elements.
const container = video.ui.getControls().getClientSideAdContainer();
adManager.initInterstitial(container, player, video);
adManager.addCustomInterstitial({
  id: null,
  groupId: null,
  startTime: 10,
  endTime: null,
  uri: 'YOUR_URL',
  mimeType: null,
  isSkippable: true,
  skipOffset: 10,
  skipFor: null,
  canJump: false,
  resumeOffset: null,
  playoutLimit: null,
  once: true,
  pre: false,
  post: false,
  timelineRange: false,
  loop: false,
  overlay: { // Show interstitial in upper right quadrant
    viewport: {
      x: 1920, // Pixels
      y: 1080, // Pixels
    },
    topLeft: {
      x: 960, // Pixels
      y: 0, // Pixels
    },
    size: {
      x: 960, // Pixels
      y: 540, // Pixels
    },
  },
  displayOnBackground: false,
  currentVideo: null,
  background: null,
  clickThroughUrl: null,
});
```

Example of L-Shape format ad experience:
```js
const adManager = player.getAdManager();
const video = document.getElementById('video');
const ui = video['ui'];
// If you're using a non-UI build, this is the div you'll need to create
// for your layout.  The ad manager will clear this div, when it unloads, so
// don't pass in a div that contains non-ad elements.
const container = video.ui.getControls().getClientSideAdContainer();
adManager.initInterstitial(container, player, video);
adManager.addCustomInterstitial({
  id: null,
  groupId: null,
  startTime: 10,
  endTime: null,
  uri: 'YOUR_URL',
  mimeType: null,
  isSkippable: true,
  skipOffset: 10,
  skipFor: null,
  canJump: false,
  resumeOffset: null,
  playoutLimit: null,
  once: true,
  pre: false,
  post: false,
  timelineRange: false,
  loop: false,
  overlay: {
    viewport: {
      x: 1920,
      y: 1080,
    },
    topLeft: {
      x: 0,
      y: 0,
    },
    size: {
      x: 1920,
      y: 1080,
    },
  },
  displayOnBackground: true,
  currentVideo: {
    viewport: {
      x: 1920,
      y: 1080,
    },
    topLeft: {
      x: 0,
      y: 0,
    },
    size: {
      x: 960,
      y: 540,
    },
  },
  background: null,
  clickThroughUrl: null,
});
```

Example of double box format ad experience:
```js
const adManager = player.getAdManager();
const video = document.getElementById('video');
const ui = video['ui'];
// If you're using a non-UI build, this is the div you'll need to create
// for your layout.  The ad manager will clear this div, when it unloads, so
// don't pass in a div that contains non-ad elements.
const container = video.ui.getControls().getClientSideAdContainer();
adManager.initInterstitial(container, player, video);
adManager.addCustomInterstitial({
  id: null,
  groupId: null,
  startTime: 10,
  endTime: null,
  uri: 'YOUR_URL',
  mimeType: null,
  isSkippable: true,
  skipOffset: 10,
  skipFor: null,
  canJump: false,
  resumeOffset: null,
  playoutLimit: null,
  once: true,
  pre: false,
  post: false,
  timelineRange: false,
  loop: false,
  overlay: {
    viewport: {
      x: 1920, // Pixels
      y: 1080, // Pixels
    },
    topLeft: {
      x: 960, // Pixels
      y: 270, // Pixels
    },
    size: {
      x: 960, // Pixels
      y: 540, // Pixels
    },
  },
  displayOnBackground: true,
  currentVideo: {
    viewport: {
      x: 1920, // Pixels
      y: 1080, // Pixels
    },
    topLeft: {
      x: 160, // Pixels
      y: 360, // Pixels
    },
    size: {
      x: 640, // Pixels
      y: 360, // Pixels
    },
  },
  background: 'content-box radial-gradient(crimson, skyblue)',
  clickThroughUrl: null,
});
```


##### VAST/VMAP (playback without tracking)

Example:

```js
const adManager = player.getAdManager();
const video = document.getElementById('video');
const ui = video['ui'];
// If you're using a non-UI build, this is the div you'll need to create
// for your layout.  The ad manager will clear this div, when it unloads, so
// don't pass in a div that contains non-ad elements.
const container = video.ui.getControls().getClientSideAdContainer();
adManager.initInterstitial(container, player, video);
const url = 'https://pubads.g.doubleclick.net/gampad/ads?sz=640x480&iu=/124319096/external/single_ad_samples&ciu_szs=300x250&impl=s&gdfp_req=1&env=vp&output=vast&unviewed_position_start=1&cust_params=deployment%3Ddevsite%26sample_ct%3Dlinear&correlator=';
adManager.addAdUrlInterstitial(url);
```


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
adsRequest.adTagUrl = 'https://pubads.g.doubleclick.net/gampad/ads?sz=640x480&iu=/124319096/external/single_ad_samples&ciu_szs=300x250&impl=s&gdfp_req=1&env=vp&output=vast&unviewed_position_start=1&cust_params=deployment%3Ddevsite%26sample_ct%3Dlinear&correlator=';
adManager.requestClientSideAds(adsRequest);
```

See: [google.ima.AdsRequest][] for details on the request object.

[google.ima.AdsRequest]: https://developers.google.com/interactive-media-ads/docs/sdks/html5/v3/reference/js/ima.AdsRequest

Control the rendering of ads:

```js
const adsRenderingSettings = new google.ima.AdsRenderingSettings();
adsRenderingSettings.restoreCustomPlaybackStateOnAdBreakComplete = true;
adManager.initClientSide(container, video, adsRenderingSettings);
// Updates the ads rendering settings.
adManager.updateClientSideAdsRenderingSettings(adsRenderingSettings);
```

See: [google.ima.AdsRenderingSettings][] for details on the request object.

[google.ima.AdsRenderingSettings]: https://developers.google.com/interactive-media-ads/docs/sdks/html5/client-side/reference/js/google.ima.AdsRenderingSettings

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

<!--cSpell:disable -->
```js
const streamRequest = new google.ima.dai.api.LiveStreamRequest();
// Your stream information will go here. We are using IMA's sample stream info
// in this tutorial.
streamRequest.assetKey = 'sN_IYUG8STe1ZzhIIE_ksA';
const uri = await adManager.requestServerSideStream(streamRequest);
player.load(uri);
```
<!--cSpell:enable -->

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
adManager.addEventListener(shaka.ads.Utils.AD_STARTED, () => {
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
adManager.addEventListener(shaka.ads.Utils.AD_STARTED, (e) => {
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
adManager.addEventListener(shaka.ads.Utils.IMA_AD_MANAGER_LOADED, (e) => {
  const imaAdManager = e['imaAdManager'];
});

adManager.addEventListener(shaka.ads.Utils.IMA_STREAM_MANAGER_LOADED, (e) => {
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
  player.getNetworkingEngine().registerRequestFilter(function(type, request, context) {
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
