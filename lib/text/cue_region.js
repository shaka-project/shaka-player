/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.text.CueRegion');


/**
 * @export
 */
shaka.text.CueRegion = class {
  constructor() {
    const CueRegion = shaka.text.CueRegion;

    /**
     * Region identifier.
     * @type {string}
     * @export
     */
    this.id = '';

    /**
     * The X offset to start the rendering area in viewportAnchorUnits of the
     * video width.
     * @type {number}
     * @export
     */
    this.viewportAnchorX = 0;

    /**
     * The X offset to start the rendering area in viewportAnchorUnits of the
     * video height.
     * @type {number}
     * @export
     */
    this.viewportAnchorY = 0;

    /**
     * The X offset to start the rendering area in percentage (0-100) of this
     * region width.
     * @type {number}
     * @export
     */
    this.regionAnchorX = 0;

    /**
     * The Y offset to start the rendering area in percentage (0-100) of the
     * region height.
     * @type {number}
     * @export
     */
    this.regionAnchorY = 0;

    /**
     * The width of the rendering area in widthUnits.
     * @type {number}
     * @export
     */
    this.width = 100;

    /**
     * The width of the rendering area in heightUnits.
     * @type {number}
     * @export
     */
    this.height = 100;

    /**
     * The units (percentage, pixels or lines) the region height is in.
     * @type {shaka.text.CueRegion.units}
     * @export
     */
    this.heightUnits = CueRegion.units.PERCENTAGE;

    /**
     * The units (percentage or pixels) the region width is in.
     * @type {shaka.text.CueRegion.units}
     * @export
     */
    this.widthUnits = CueRegion.units.PERCENTAGE;

    /**
     * The units (percentage or pixels) the region viewportAnchors are in.
     * @type {shaka.text.CueRegion.units}
     * @export
     */
    this.viewportAnchorUnits = CueRegion.units.PERCENTAGE;

    /**
     * If scroll=UP, it means that cues in the region will be added to the
     * bottom of the region and will push any already displayed cues in the
     * region up.  Otherwise (scroll=NONE) cues will stay fixed at the location
     * they were first painted in.
     * @type {shaka.text.CueRegion.scrollMode}
     * @export
     */
    this.scroll = CueRegion.scrollMode.NONE;
  }
};


/**
 * @enum {number}
 * @export
 */
shaka.text.CueRegion.units = {
  'PX': 0,
  'PERCENTAGE': 1,
  'LINES': 2,
};


/**
 * @enum {string}
 * @export
 */
shaka.text.CueRegion.scrollMode = {
  'NONE': '',
  'UP': 'up',
};
