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

    /**
     * The background color of the region, painted on its whole area.  An empty
     * string means no background.
     * @type {string}
     * @export
     */
    this.backgroundColor = '';

    /**
     * The opacity of the region and of its content, from 0 to 1.
     * @type {number}
     * @export
     */
    this.opacity = 1;

    /**
     * The padding of the region, as its top, right, bottom and left lengths,
     * in pixels or in percentage of the height or width of the region, for
     * example "10% 5px 0% 5px".  An empty string means no padding.
     * @type {string}
     * @export
     */
    this.padding = '';

    /**
     * The CSS overflow of the region, for example "hidden" to hide the content
     * which overflows the region.  An empty string means the default overflow.
     * @type {string}
     * @export
     */
    this.overflow = '';

    /**
     * The stacking order of the region relative to the other regions, or null
     * for the default order.
     * @type {?number}
     * @export
     */
    this.zIndex = null;
  }

  /**
   * Create a copy of the CueRegion with the same properties.
   * @return {!shaka.text.CueRegion}
   * @export
   */
  clone() {
    const copy = new shaka.text.CueRegion();

    copy.id = this.id;
    copy.viewportAnchorX = this.viewportAnchorX;
    copy.viewportAnchorY = this.viewportAnchorY;
    copy.regionAnchorX = this.regionAnchorX;
    copy.regionAnchorY = this.regionAnchorY;
    copy.width = this.width;
    copy.height = this.height;
    copy.heightUnits = this.heightUnits;
    copy.widthUnits = this.widthUnits;
    copy.viewportAnchorUnits = this.viewportAnchorUnits;
    copy.scroll = this.scroll;
    copy.backgroundColor = this.backgroundColor;
    copy.opacity = this.opacity;
    copy.padding = this.padding;
    copy.overflow = this.overflow;
    copy.zIndex = this.zIndex;

    return copy;
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
