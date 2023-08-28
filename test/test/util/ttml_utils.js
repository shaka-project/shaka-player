/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

shaka.test.TtmlUtils = class {
  /**
   * @param {!Array} expectedCues
   * @param {!Array} actualCues
   * @param {!Object} bodyProperties
   * @param {Object=} divProperties
   */
  static verifyHelper(expectedCues, actualCues, bodyProperties, divProperties) {
    const mapExpected = (cue) => {
      if (cue.region) {
        cue.region = jasmine.objectContaining(cue.region);
      }

      if (cue.nestedCues && (cue.nestedCues instanceof Array)) {
        cue.nestedCues = cue.nestedCues.map(mapExpected);
      }

      if (cue.isContainer == undefined) {
        // If not specified to be true, check for isContainer to be false.
        cue.isContainer = false;
      }

      return jasmine.objectContaining(cue);
    };

    /**
     * @param {!Object} properties
     * @return {!shaka.text.Cue}
     */
    const makeContainer = (properties) => {
      const region = {
        id: '',
        viewportAnchorX: 0,
        viewportAnchorY: 0,
        regionAnchorX: 0,
        regionAnchorY: 0,
        width: 100,
        height: 100,
        widthUnits: shaka.text.CueRegion.units.PERCENTAGE,
        heightUnits: shaka.text.CueRegion.units.PERCENTAGE,
        viewportAnchorUnits: shaka.text.CueRegion.units.PERCENTAGE,
        scroll: '',
      };
      const containerCue = /** @type {!shaka.text.Cue} */ ({
        region,
        nestedCues: jasmine.any(Object),
        payload: '',
        isContainer: true,
      });
      Object.assign(containerCue, properties);
      return mapExpected(containerCue);
    };

    if (expectedCues.length == 0 && !divProperties) {
      expect(actualCues.length).toBe(0);
    } else {
      // Body.
      expect(actualCues.length).toBe(1);
      const body = actualCues[0];
      expect(body).toEqual(makeContainer(bodyProperties));

      // Div.
      expect(body.nestedCues.length).toBe(1);
      const div = body.nestedCues[0];
      expect(div).toEqual(makeContainer(divProperties || bodyProperties));

      // Cues.
      expect(div.nestedCues).toEqual(expectedCues.map(mapExpected));
    }
  }
};
