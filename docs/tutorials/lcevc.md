# LCEVC Quick Start 
 
#### Requirements 
 
 - Only supported on browsers with Media Source Extensions SourceBuffer support 
 
 - MPEG-5 Part2 LCEVC decoding support (decoding provided by [lcevc_dec.js][], 
 must be separately included) 
 
##### Integration documentation : [docs](../design/lcevc-integration.md) 
 
##### More on [MPEG-5 Part2 LCEVC][] 
 
[lcevc_dec.js]: https://www.npmjs.com/package/lcevc_dec.js?activeTab=readme
[MPEG-5 Part2 LCEVC]: https://www.lcevc.org 
 
#### Configure LCEVC 
 
LCEVC Decoder library needs to be included in the HTML page: 
 
- Local `npm install lcevc_dec.js` 
```html 
<script src="../node_modules/lcevc_dec.js/dist/lcevc_dec.min.js"></script> 
``` 
- Or use `unpkg.com` for latest LCEVC Decoder libraries.
```html 
<script src="https://unpkg.com/lcevc_dec.js@1.0.0/dist/lcevc_dec.min.js"></script> 
``` 
 
Configuration to enable LCEVC enhancement: 
```js 
player.configure('lcevc.enabled', true); 
``` 
 
#### LCEVC setup via UI library 
 
Sample setup using the Shaka Player UI library:  
 
```html 
<!DOCTYPE html> 
<html> 
  <head> 
    <!-- Shaka Player UI compiled library and default CSS for player controls: --> 
    <script src="dist/shaka-player.ui.js"></script> 
    <link rel="stylesheet" href="dist/controls.css" /> 
 
    <!-- LCEVC decoder compiled library --> 
    <script src="https://unpkg.com/lcevc_dec.js@1.0.0/dist/lcevc_dec.min.js"></script> 
 
    <!-- Application source: --> 
    <script src="app.js"></script> 
  </head> 
 
  <body> 
    <!-- The data-shaka-player-container tag will make the UI library place the controls in this div. --> 
    <div data-shaka-player-container style="max-width:40em"> 
      <!-- The data-shaka-player tag will make the UI library use this video element. --> 
      <video data-shaka-player id="video" style="width:100%;height:100%"></video> 
    </div> 
  </body> 
</html> 
``` 
 
```js 
// app.js 
 
const manifestUri = 'https://dyctis843rxh5.cloudfront.net/vnIAZIaowG1K7qOt/master.m3u8'; 
 
// Initialise Shaka Player with LCEVC enhancement. 
async function init() { 
  // When using the UI, the player is made automatically by the UI object. 
  const video = document.getElementById('video'); 
  const ui = video['ui']; 
  const controls = ui.getControls(); 
  const player = controls.getPlayer(); 
 
  // Enable the LCEVC enhancement. 
  player.configure('lcevc.enabled', true); 
 
  // Listen for error events. 
  player.addEventListener('error', onError); 
  controls.addEventListener('error', onError); 
 
  // Try to load a manifest. 
  // This is an asynchronous process. 
  try { 
    await player.load(manifestUri); 
    // This runs if the asynchronous load is successful. 
    console.log('The video has now been loaded!'); 
  } catch (error) { 
    onError(error); 
  } 
} 
 
// Handle errors. 
function onError(error) { 
  console.error('Error', error); 
} 
 
// Listen to the custom shaka-ui-loaded event, to wait until the UI is loaded. 
document.addEventListener('shaka-ui-loaded', init); 
// Listen to the custom shaka-ui-load-failed event, in case Shaka Player fails 
// to load (e.g. due to lack of browser support). 
document.addEventListener('shaka-ui-load-failed', onError); 
 
``` 
 
#### User provided canvas 
 
User can also provide a canvas to the player though `attachCanvas` function: 
 
```js 
player.attachCanvas(canvas); 
``` 
 
Note: If external canvas is used, user is responsible for managing 
the canvas. If no canvas is provided for Shaka UI library, the player 
will generate and manage the canvas. 
