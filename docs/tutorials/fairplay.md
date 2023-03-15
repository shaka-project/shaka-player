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
player.configure('drm.initDataTransform', (initData, initDataType) => {
  if (initDataType != 'skd')
    return initData;
  // 'initData' is a buffer containing an 'skd://' URL as a UTF-8 string.
  const skdUri = shaka.util.StringUtils.fromBytesAutoDetect(initData);
  const contentId = getMyContentId(skdUri);
  const cert = player.drmInfo().serverCertificate;
  return shaka.util.FairPlayUtils.initDataTransform(initData, contentId, cert);
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
  const params = 'spc=' + base64Payload;
  request.headers['Content-Type'] = 'application/x-www-form-urlencoded';
  request.body = shaka.util.StringUtils.toUTF8(encodeURIComponent(params));
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
const FairPlayUtils = shaka.util.FairPlayUtils;
player.getNetworkingEngine()
    .registerRequestFilter(FairPlayUtils.ezdrmFairPlayRequest);
player.getNetworkingEngine()
    .registerResponseFilter(FairPlayUtils.commonFairPlayResponse);
```

Note: If the url of the license server has to undergo any transformation
(eg: add the contentId), you would have to create your filter manually.

```js
player.getNetworkingEngine().registerRequestFilter((type, request, context) => {
  if (type != shaka.net.NetworkingEngine.RequestType.LICENSE) {
    return;
  }
  const uri = request.uris[0];
  const FairPlayUtils = shaka.util.FairPlayUtils;
  const contentId = FairPlayUtils.defaultGetContentId(request.initData);
  const newUri = uri.replace('^assetId^', contentId);
  request.uris = [newUri];
  request.headers['Content-Type'] = 'application/octet-stream'
});
```

#### EZDRM (legacy Apple Media Keys)

For integration with EZDRM the following can be used:

```js
shaka.polyfill.PatchedMediaKeysApple.install();
const FairPlayUtils = shaka.util.FairPlayUtils;
player.getNetworkingEngine()
    .registerRequestFilter(FairPlayUtils.ezdrmFairPlayRequest);
player.getNetworkingEngine()
    .registerResponseFilter(FairPlayUtils.commonFairPlayResponse);
player.configure('drm.initDataTransform',
                 FairPlayUtils.ezdrmInitDataTransform);
```

Note: If the url of the license server has to undergo any transformation
(eg: add the contentId), you would have to create your filter manually.

```js
player.getNetworkingEngine().registerRequestFilter((type, request, context) => {
  if (type != shaka.net.NetworkingEngine.RequestType.LICENSE) {
    return;
  }
  const uri = request.uris[0];
  const FairPlayUtils = shaka.util.FairPlayUtils;
  const contentId = FairPlayUtils.defaultGetContentId(request.initData);
  const newUri = uri.replace('^assetId^', contentId);
  request.uris = [newUri];
  request.headers['Content-Type'] = 'application/octet-stream'
});
```

#### Verimatrix (legacy Apple Media Keys)

For integration with Verimatrix the following can be used:

```js
shaka.polyfill.PatchedMediaKeysApple.install();
const FairPlayUtils = shaka.util.FairPlayUtils;
player.getNetworkingEngine()
    .registerRequestFilter(FairPlayUtils.verimatrixFairPlayRequest);
player.getNetworkingEngine()
    .registerResponseFilter(FairPlayUtils.commonFairPlayResponse);
player.configure('drm.initDataTransform',
                 FairPlayUtils.verimatrixInitDataTransform);
```

#### Conax (legacy Apple Media Keys)

For integration with Conax the following can be used:

```js
shaka.polyfill.PatchedMediaKeysApple.install();
const FairPlayUtils = shaka.util.FairPlayUtils;
player.getNetworkingEngine()
    .registerRequestFilter(FairPlayUtils.conaxFairPlayRequest);
player.getNetworkingEngine()
    .registerResponseFilter(FairPlayUtils.commonFairPlayResponse);
player.configure('drm.initDataTransform',
                 FairPlayUtils.conaxInitDataTransform);
```

#### ExpressPlay (legacy Apple Media Keys)

For integration with ExpressPlay the following can be used:

```js
shaka.polyfill.PatchedMediaKeysApple.install();
const FairPlayUtils = shaka.util.FairPlayUtils;
player.getNetworkingEngine()
    .registerRequestFilter(FairPlayUtils.expressplayFairPlayRequest);
player.getNetworkingEngine()
    .registerResponseFilter(FairPlayUtils.commonFairPlayResponse);
player.configure('drm.initDataTransform',
                 FairPlayUtils.expressplayInitDataTransform);
```
