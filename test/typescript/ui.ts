import * as shaka from "../../dist/shaka-player.ui";

interface ShakaVideoElement extends HTMLVideoElement {
  ui: shaka.ui.Overlay;
}

const manifestUri =
  "https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd";

async function init() {
  // When using the UI, the player is made automatically by the UI object.
  const video = document.getElementById("video") as ShakaVideoElement;
  const ui = video.ui;
  const controls = ui.getControls();
  const player = controls.getPlayer();

  // Listen for error events.
  player.addEventListener("error", onPlayerErrorEvent);
  controls.addEventListener("error", onUIErrorEvent);
  controls.addEventListener("caststatuschanged", onCastStatusChanged);

  // Try to load a manifest.
  // This is an asynchronous process.
  try {
    await player.load(manifestUri);
    // This runs if the asynchronous load is successful.
    console.log("The video has now been loaded!");
  } catch (error) {
    onPlayerError(error);
  }
}

function onCastStatusChanged(event) {
  const newCastStatus = event["newStatus"];
  // Handle cast status change
  console.log("The new cast status is: " + newCastStatus);
}

function onPlayerErrorEvent(errorEvent) {
  // Extract the shaka.util.Error object from the event.
  onPlayerError(event.detail);
}

function onPlayerError(error: shaka.extern.Error) {
  // Handle player error
  console.error("Error code", error.code, "object", error);
}

function onUIErrorEvent(errorEvent) {
  // Extract the shaka.util.Error object from the event.
  onPlayerError(event.detail);
}

function initFailed() {
  // Handle the failure to load
  console.error("Unable to load the UI library!");
}

// Listen to the custom shaka-ui-loaded event, to wait until the UI is loaded.
document.addEventListener("shaka-ui-loaded", init);
// Listen to the custom shaka-ui-load-failed event, in case Shaka Player fails
// to load (e.g. due to lack of browser support).
document.addEventListener("shaka-ui-load-failed", initFailed);
