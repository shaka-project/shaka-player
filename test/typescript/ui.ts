import * as shaka from "../../dist/shaka-player.ui";

const manifestUri =
  "https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd";

class SkipButton extends shaka.ui.Element {
  static create(rootElement: HTMLElement, controls: shaka.ui.Controls) {
    return new SkipButton(rootElement, controls);
  }

  button = document.createElement("button");

  constructor(parent: HTMLElement, controls: shaka.ui.Controls) {
    super(parent, controls);

    this.button.textContent = "Skip current video";
    this.button.setAttribute("aria-label", "Skip");
    this.parent.appendChild(this.button);
    this.eventManager.listen(this.button, "click", this.onClick);
  }

  onClick = () => {
    this.player.load(manifestUri);
  };
}

shaka.ui.Controls.registerElement("skip", SkipButton);

async function init() {
  // When using the UI, the player is made automatically by the UI object.
  const video = document.getElementById("video") as shaka.ui.VideoElement;
  const ui = video.ui;
  const controls = ui.getControls();
  const player = controls.getPlayer();

  ui.configure({
    addSeekBar: false,
    controlPanelElements: ["rewind", "fast_forward", "skip"]
  });

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

function onCastStatusChanged(event: shaka.ui.Controls.CastStatusChangedEvent) {
  // Handle cast status change
  console.log("The new cast status is:", event.newStatus);
}

function onPlayerErrorEvent(errorEvent: shaka.Player.ErrorEvent) {
  // Extract the shaka.util.Error object from the event.
  onPlayerError(errorEvent.detail);
}

function onPlayerError(error: shaka.extern.Error) {
  // Handle player error
  console.error("Error code", error.code, "object", error);
}

function onUIErrorEvent(errorEvent: shaka.ui.Controls.ErrorEvent) {
  // Extract the shaka.util.Error object from the event.
  onPlayerError(errorEvent.detail);
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
