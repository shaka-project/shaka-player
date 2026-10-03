/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('TextUtils', () => {
  describe('mapNativeCueToShakaCue', () => {
    beforeEach(() => {
      if (!window.VTTCue) {
        pending('VTTCue not available');
      }
    });

    it('should map VTTCue to shaka cue', () => {
      const vttCue = new VTTCue(10, 20, 'foo');
      vttCue.line = 8;
      vttCue.lineAlign = 'center';
      vttCue.snapToLines = false;
      vttCue.position = 'auto';
      vttCue.positionAlign = 'line-right';
      vttCue.size = 2;
      vttCue.align = 'left';
      vttCue.vertical = 'rl';

      const cue = shaka.text.Utils.mapNativeCueToShakaCue(vttCue);
      expect(cue.startTime).toBe(10);
      expect(cue.endTime).toBe(20);
      expect(cue.payload).toBe('foo');
      expect(cue.line).toBe(8);
      expect(cue.lineAlign).toBe(shaka.text.Cue.lineAlign.CENTER);
      expect(cue.lineInterpretation)
          .toBe(shaka.text.Cue.lineInterpretation.PERCENTAGE);
      expect(cue.position).toBe(null);
      expect(cue.positionAlign).toBe(shaka.text.Cue.positionAlign.RIGHT);
      expect(cue.size).toBe(2);
      expect(cue.textAlign).toBe('left');
      expect(cue.writingMode)
          .toBe(shaka.text.Cue.writingMode.VERTICAL_RIGHT_TO_LEFT);
    });

    it('returns null if cue has invalid timing', () => {
      let vttCue = new VTTCue(20, 10, '');
      expect(shaka.text.Utils.mapNativeCueToShakaCue(vttCue)).toBe(null);

      // VTTCue constructor does not allow for creating a cue with
      // non-finite time. However, Safari adds such cues to text tracks,
      // so hack creation of object with such properties via cloning.
      vttCue = shaka.util.ObjectUtils.shallowCloneObject(vttCue);
      vttCue.endTime = Infinity;
      expect(shaka.text.Utils.mapNativeCueToShakaCue(vttCue)).toBe(null);
    });

    it('should map VTTRegion to shaka region', () => {
      if (!window.VTTRegion) {
        pending('VTTRegion not available');
      }
      const vttRegion = new VTTRegion();
      vttRegion.id = 'bar';
      vttRegion.lines = 3;
      vttRegion.regionAnchorX = 0;
      vttRegion.regionAnchorY = 100;
      vttRegion.scroll = 'up';
      vttRegion.viewportAnchorX = 50;
      vttRegion.viewportAnchorY = 0;
      vttRegion.width = 100;

      const vttCue = new VTTCue(10, 20, 'foo');
      vttCue.region = vttRegion;

      const region = shaka.text.Utils.mapNativeCueToShakaCue(vttCue).region;
      expect(region.id).toBe('bar');
      expect(region.width).toBe(100);
      expect(region.widthUnits).toBe(shaka.text.CueRegion.units.PERCENTAGE);
      expect(region.height).toBe(3);
      expect(region.heightUnits).toBe(shaka.text.CueRegion.units.LINES);
      expect(region.scroll).toBe(shaka.text.CueRegion.scrollMode.UP);
      expect(region.regionAnchorX).toBe(0);
      expect(region.regionAnchorY).toBe(100);
      expect(region.viewportAnchorX).toBe(50);
      expect(region.viewportAnchorY).toBe(0);
      expect(region.viewportAnchorUnits)
          .toBe(shaka.text.CueRegion.units.PERCENTAGE);
    });
  });

  describe('mapShakaCueToNativeCue regions', () => {
    const regionsSupported = () => !!window.VTTCue && !!window.VTTRegion &&
        // eslint-disable-next-line no-restricted-syntax
        'region' in VTTCue.prototype;

    beforeEach(() => {
      if (!window.VTTCue) {
        pending('VTTCue not available');
      }
    });

    /**
     * @return {!shaka.text.CueRegion}
     */
    function createVttRegion() {
      const region = new shaka.text.CueRegion();
      region.id = 'fred';
      region.width = 40;
      region.height = 2;
      region.heightUnits = shaka.text.CueRegion.units.LINES;
      region.regionAnchorX = 0;
      region.regionAnchorY = 100;
      region.viewportAnchorX = 10;
      region.viewportAnchorY = 90;
      region.scroll = shaka.text.CueRegion.scrollMode.UP;
      return region;
    }

    /**
     * @param {!shaka.text.CueRegion} region
     * @param {Map<string, !VTTRegion>=} nativeRegions
     * @return {!VTTCue}
     */
    function mapCue(region, nativeRegions) {
      const cue = new shaka.text.Cue(10, 20, 'foo');
      cue.region = region;
      return /** @type {!VTTCue} */ (
        shaka.text.Utils.mapShakaCueToNativeCue(cue, nativeRegions));
    }

    it('does not set a region where VTTRegion is not supported', () => {
      if (regionsSupported()) {
        pending('VTTRegion is supported');
      }
      const nativeRegions = new Map();
      expect(mapCue(createVttRegion(), nativeRegions).region).toBeFalsy();
      expect(nativeRegions.size).toBe(0);
    });

    filterDescribe('with VTTRegion support', regionsSupported, () => {
      it('maps WebVTT regions to VTTRegions', () => {
        const region = mapCue(createVttRegion(), new Map()).region;
        expect(region).toEqual(jasmine.any(VTTRegion));
        expect(region.id).toBe('fred');
        expect(region.width).toBe(40);
        expect(region.lines).toBe(2);
        expect(region.regionAnchorX).toBe(0);
        expect(region.regionAnchorY).toBe(100);
        expect(region.viewportAnchorX).toBe(10);
        expect(region.viewportAnchorY).toBe(90);
        expect(region.scroll).toBe('up');
      });

      it('shares the VTTRegion of equal regions', () => {
        const nativeRegions = new Map();
        // Equal regions, as parsed from different segments.
        const region1 = mapCue(createVttRegion(), nativeRegions).region;
        const region2 = mapCue(createVttRegion(), nativeRegions).region;
        const otherRegion = mapCue(createVttRegion(), new Map()).region;
        const differentRegion = createVttRegion();
        differentRegion.width = 50;
        const region3 = mapCue(differentRegion, nativeRegions).region;

        expect(region1).toBeTruthy();
        expect(region2).toBe(region1);
        expect(otherRegion).not.toBe(region1);
        expect(region3).not.toBe(region1);
        expect(region3.width).toBe(50);
        expect(nativeRegions.size).toBe(2);
      });

      it('does not map regions that are not WebVTT regions', () => {
        const nativeRegions = new Map();

        // TTML-like region, sized as a percentage.
        const ttmlRegion = createVttRegion();
        ttmlRegion.height = 20;
        ttmlRegion.heightUnits = shaka.text.CueRegion.units.PERCENTAGE;
        expect(mapCue(ttmlRegion, nativeRegions).region).toBeFalsy();

        // CEA-708-like region, sized in lines and columns.
        const ceaRegion = createVttRegion();
        ceaRegion.widthUnits = shaka.text.CueRegion.units.LINES;
        expect(mapCue(ceaRegion, nativeRegions).region).toBeFalsy();

        // Default region of a cue without a region.
        expect(mapCue(new shaka.text.CueRegion(), nativeRegions).region)
            .toBeFalsy();
        expect(nativeRegions.size).toBe(0);
      });

      it('does not set a region without native regions', () => {
        expect(mapCue(createVttRegion()).region).toBeFalsy();
      });
    });
  });

  describe('shaka.text.Cue.resetCuePositioning', () => {
    /** @type {shaka.text.Cue} */
    let defaultCue;

    beforeEach(() => {
      defaultCue = new shaka.text.Cue(0, 0, '');
    });

    /**
     * @return {!shaka.text.Cue}
     */
    const createPositionedCue = () => {
      const cue = new shaka.text.Cue(5, 10, 'text');

      cue.line = 5;
      cue.lineAlign = shaka.text.Cue.lineAlign.END;
      cue.position = 75;
      cue.positionAlign = shaka.text.Cue.positionAlign.RIGHT;
      cue.size = 50;
      cue.displayAlign = shaka.text.Cue.displayAlign.AFTER;

      cue.region = new shaka.text.CueRegion();
      cue.region.id = 'region';

      return cue;
    };

    it('resets positioning properties to default values', () => {
      const cue = createPositionedCue();

      shaka.text.Utils.resetCuePositioning(cue);

      expect(cue.line).toBe(defaultCue.line);
      expect(cue.lineAlign).toBe(defaultCue.lineAlign);
      expect(cue.position).toBe(defaultCue.position);
      expect(cue.positionAlign).toBe(defaultCue.positionAlign);
      expect(cue.size).toBe(defaultCue.size);
      expect(cue.displayAlign).toBe(defaultCue.displayAlign);
      expect(cue.region).toEqual(defaultCue.region);
    });

    it('does not modify non-positioning properties', () => {
      const cue = createPositionedCue();

      cue.startTime = 123;
      cue.endTime = 456;
      cue.payload = 'original text';

      shaka.text.Utils.resetCuePositioning(cue);

      expect(cue.startTime).toBe(123);
      expect(cue.endTime).toBe(456);
      expect(cue.payload).toBe('original text');
    });

    it('resets positioning recursively for nested cues', () => {
      const parent = createPositionedCue();
      const child1 = createPositionedCue();
      const child2 = createPositionedCue();

      parent.nestedCues.push(child1);
      child1.nestedCues.push(child2);

      shaka.text.Utils.resetCuePositioning(parent);

      // Parent
      expect(parent.line).toBe(defaultCue.line);
      expect(parent.position).toBe(defaultCue.position);

      // First level
      expect(child1.line).toBe(defaultCue.line);
      expect(child1.position).toBe(defaultCue.position);

      // Second level
      expect(child2.line).toBe(defaultCue.line);
      expect(child2.position).toBe(defaultCue.position);
    });

    it('resets region to the default cue region', () => {
      const cue = createPositionedCue();

      shaka.text.Utils.resetCuePositioning(cue);

      expect(cue.region).toEqual(defaultCue.region);
    });

    it('handles cues without nested cues', () => {
      const cue = createPositionedCue();

      expect(cue.nestedCues.length).toBe(0);

      shaka.text.Utils.resetCuePositioning(cue);

      expect(cue.line).toBe(defaultCue.line);
      expect(cue.positionAlign).toBe(defaultCue.positionAlign);
    });
  });
});
