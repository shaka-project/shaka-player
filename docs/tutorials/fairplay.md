# FairPlay Support

We support FairPlay with EME on compatible environments or native `src=`.

By default Shaka Player supports Modern EME, if your provider doesn't support
Modern EME yet, you can use legacy Apple Media Keys with:
```js
shaka.polyfill.PatchedMediaKeysApple.install();
```

If you need to use both legacy and Modern EME, for example if you have to support
multiple DRM providers, it is possible to enable uninstalling the polyfill:
```js
shaka.polyfill.PatchedMediaKeysApple.install(/* enableUninstall= */ true);
shaka.polyfill.PatchedMediaKeysApple.uninstall();
```

The support in each case would be the following:

|            |Modern EME |legacy Apple Media Keys|
|:----------:|:---------:|:---------------------:|
|src= (CMAF) |**Y**      |**Y**                  |
|src= (TS)   |**Y**      |**Y**                  |
|MSE (CMAF)  |**Y**      | -                     |
|MSE (TS)    | -         | -                     |


Adding FairPlay support involves a bit more work than other key systems.

Note: If you are using an older version of Safari that doesn't support
Modern EME, legacy Apple Media Keys is used by default.

## Keysystem used in EME

Depending on the EME implementation that is being used, the Fairplay keysystem
varies.

For Modern EME:
```
com.apple.fps
```

For legacy Apple Media Keys:
```
com.apple.fps.1_0
```

## Server certificate

All FairPlay content requires setting a server certificate. You can either
provide it directly or set a serverCertificateUri for Shaka to fetch it for
you.

```js
const req = await fetch('https://example.com/cert.der');
const cert = await req.arrayBuffer();

player.configure('drm.advanced.com\\.apple\\.fps.serverCertificate',
                 new Uint8Array(cert));
```

```js
player.configure('drm.advanced.com\\.apple\\.fps.serverCertificateUri',
                 'https://example.com/cert.der');
```

## Content ID

Note: Normally only applies to legacy Apple Media Keys but some providers also
need it in Modern EME.

Some FairPlay content use custom signaling for the content ID.  The content ID
is used by the browser to generate the license request.  If you don't use the
default content ID derivation, you need to specify a custom init data transform:

```js
player.configure('drm.initDataTransform', (initData, initDataType, drmInfo) => {
  if (initDataType != 'skd') {
    // it is possible to get the skd urls from drmInfo, if necessary
    const skdUriSet = drmInfo.keySystemUris;
    // now you can handle it especially if necessary
    // handleSkdUris(skdUriSet);
    return initData;
  }
  // 'initData' is a buffer containing an 'skd://' URL as a UTF-8 string.
  const skdUri = shaka.util.StringUtils.fromBytesAutoDetect(initData);
  const contentId = getMyContentId(skdUri);
  const cert = drmInfo.serverCertificate;
  return shaka.drm.FairPlay.initDataTransform(initData, contentId, cert);
});
```

## License wrapping

Some FairPlay servers need to accept the license request in a different format
or give the response in a different format.  For more info, see the general
{@tutorial license-wrapping} tutorial:

```js
player.getNetworkingEngine().registerRequestFilter((type, request, context) => {
  if (type != shaka.net.NetworkingEngine.RequestType.LICENSE) {
    return;
  }

  const originalPayload = new Uint8Array(request.body);
  const base64Payload =
      shaka.util.Uint8ArrayUtils.toStandardBase64(originalPayload);
  const params = 'spc=' + encodeURIComponent(base64Payload);
  request.headers['Content-Type'] = 'application/x-www-form-urlencoded';
  request.body = shaka.util.StringUtils.toUTF8(params);
});

player.getNetworkingEngine().registerResponseFilter((type, response, context) => {
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

### Integration with some DRMs providers

Note: Some providers support both Modern EME and legacy Apple Media Keys.

#### EZDRM (Modern EME)

For integration with EZDRM the following can be used:

```js
player.getNetworkingEngine()
    .registerRequestFilter(shaka.drm.FairPlay.ezdrmFairPlayRequest);
player.getNetworkingEngine()
    .registerResponseFilter(shaka.drm.FairPlay.commonFairPlayResponse);
```

Note: If the url of the license server has to undergo any transformation
(eg: add the contentId), you would have to create your filter manually.

```js
player.getNetworkingEngine().registerRequestFilter((type, request, context) => {
  if (type != shaka.net.NetworkingEngine.RequestType.LICENSE) {
    return;
  }
  const uri = request.uris[0];
  const contentId = shaka.drm.FairPlay.defaultGetContentId(request.initData);
  const newUri = uri.replace('^assetId^', contentId);
  request.uris = [newUri];
  request.headers['Content-Type'] = 'application/octet-stream'
});
```

#### EZDRM (legacy Apple Media Keys)

For integration with EZDRM the following can be used:

```js
shaka.polyfill.PatchedMediaKeysApple.install();
player.getNetworkingEngine()
    .registerRequestFilter(shaka.drm.FairPlay.ezdrmFairPlayRequest);
player.getNetworkingEngine()
    .registerResponseFilter(shaka.drm.FairPlay.commonFairPlayResponse);
player.configure('drm.initDataTransform',
                 shaka.drm.FairPlay.ezdrmInitDataTransform);
```

Note: If the url of the license server has to undergo any transformation
(eg: add the contentId), you would have to create your filter manually.

```js
player.getNetworkingEngine().registerRequestFilter((type, request, context) => {
  if (type != shaka.net.NetworkingEngine.RequestType.LICENSE) {
    return;
  }
  const uri = request.uris[0];
  const contentId = shaka.drm.FairPlay.defaultGetContentId(request.initData);
  const newUri = uri.replace('^assetId^', contentId);
  request.uris = [newUri];
  request.headers['Content-Type'] = 'application/octet-stream'
});
```

#### Verimatrix (legacy Apple Media Keys)

For integration with Verimatrix the following can be used:

```js
shaka.polyfill.PatchedMediaKeysApple.install();
player.getNetworkingEngine()
    .registerRequestFilter(shaka.drm.FairPlay.verimatrixFairPlayRequest);
player.getNetworkingEngine()
    .registerResponseFilter(shaka.drm.FairPlay.commonFairPlayResponse);
player.configure('drm.initDataTransform',
                 shaka.drm.FairPlay.verimatrixInitDataTransform);
```

#### Conax (legacy Apple Media Keys)

For integration with Conax the following can be used:

```js
shaka.polyfill.PatchedMediaKeysApple.install();
player.getNetworkingEngine()
    .registerRequestFilter(shaka.drm.FairPlay.conaxFairPlayRequest);
player.getNetworkingEngine()
    .registerResponseFilter(shaka.drm.FairPlay.commonFairPlayResponse);
player.configure('drm.initDataTransform',
                 shaka.drm.FairPlay.conaxInitDataTransform);
```

#### ExpressPlay (legacy Apple Media Keys)

For integration with ExpressPlay the following can be used:

```js
shaka.polyfill.PatchedMediaKeysApple.install();
player.getNetworkingEngine()
    .registerRequestFilter(shaka.drm.FairPlay.expressplayFairPlayRequest);
player.getNetworkingEngine()
    .registerResponseFilter(shaka.drm.FairPlay.commonFairPlayResponse);
player.configure('drm.initDataTransform',
                 shaka.drm.FairPlay.expressplayInitDataTransform);
```

#### Nagra (legacy Apple Media Keys)

For integration with Nagra the following can be used:

```js
shaka.polyfill.PatchedMediaKeysApple.install();
```

#### Mux (legacy Apple Media Keys)

For integration with Mux the following can be used:

```js
shaka.polyfill.PatchedMediaKeysApple.install();
player.getNetworkingEngine()
    .registerRequestFilter(shaka.drm.FairPlay.muxFairPlayRequest);
player.getNetworkingEngine()
    .registerResponseFilter(shaka.drm.FairPlay.commonFairPlayResponse);
player.configure('drm.initDataTransform',
                 shaka.drm.FairPlay.muxInitDataTransform);
```

