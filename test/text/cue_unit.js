/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Cue', () => {
  describe('clone', () => {
    /** @type {shaka.text.Cue} */
    let cue;

    /** @type {shaka.text.Cue} */
    let cue2;

    beforeEach(() => {
      cue = new shaka.text.Cue(10, 20, 'Hello world');

      cue.direction = shaka.text.Cue.direction.HORIZONTAL_LEFT_TO_RIGHT;
      cue.writingMode = shaka.text.Cue.writingMode.HORIZONTAL_TOP_TO_BOTTOM;
      cue.lineAlign = shaka.text.Cue.lineAlign.CENTER;
      cue.positionAlign = shaka.text.Cue.positionAlign.CENTER;
      cue.textAlign = shaka.text.Cue.textAlign.CENTER;
      cue.size = 80;
      cue.line = 5;
      cue.position = 50;
      cue.fontSize = '16px';
      cue.fontWeight = shaka.text.Cue.fontWeight.BOLD;
      cue.color = 'white';
      cue.backgroundColor = 'black';
      cue.region = new shaka.text.CueRegion();
      cue.region.id = 'region-1';
      cue.region.width = 80;
      cue.region.height = 40;
      cue.region.viewportAnchorX = 10;
      cue.region.viewportAnchorY = 20;

      cue2 = new shaka.text.Cue(0, 5, 'Main cue');
      cue2.fontStyle = shaka.text.Cue.fontStyle.ITALIC;
      cue2.textDecoration = [shaka.text.Cue.textDecoration.UNDERLINE];
      cue2.rubyTag = 'ruby';
      cue2.nestedCues = [
        new shaka.text.Cue(0, 2, 'Nested 1'),
        new shaka.text.Cue(2, 5, 'Nested 2'),
      ];
      cue2.isContainer = true;
    });

    it('should return a new Cue instance', () => {
      const clone = cue.clone();

      expect(clone).toBeDefined();
      expect(clone instanceof shaka.text.Cue).toBe(true);
      expect(clone).not.toBe(cue);
    });

    it('should clone basic cue timing and payload', () => {
      const clone = cue.clone();

      expect(clone.startTime).toBe(10);
      expect(clone.endTime).toBe(20);
      expect(clone.payload).toBe('Hello world');
    });

    it('should copy primitive Cue properties correctly', () => {
      const clone = cue.clone();

      expect(clone.direction).toBe(cue.direction);
      expect(clone.writingMode).toBe(cue.writingMode);
      expect(clone.lineAlign).toBe(cue.lineAlign);
      expect(clone.positionAlign).toBe(cue.positionAlign);
      expect(clone.textAlign).toBe(cue.textAlign);
      expect(clone.size).toBe(cue.size);
      expect(clone.line).toBe(cue.line);
      expect(clone.position).toBe(cue.position);
    });

    it('should copy style-related properties correctly', () => {
      const clone = cue.clone();

      expect(clone.fontSize).toBe(cue.fontSize);
      expect(clone.fontWeight).toBe(cue.fontWeight);
      expect(clone.color).toBe(cue.color);
      expect(clone.backgroundColor).toBe(cue.backgroundColor);
    });

    it('should deep clone the region object', () => {
      const clone = cue.clone();

      expect(clone.region).toBeDefined();
      expect(clone.region instanceof shaka.text.CueRegion).toBe(true);
      expect(clone.region).not.toBe(cue.region);
      expect(clone.region.id).toBe(cue.region.id);
      expect(clone.region.width).toBe(cue.region.width);
      expect(clone.region.height).toBe(cue.region.height);
      expect(clone.region.viewportAnchorX).toBe(cue.region.viewportAnchorX);
      expect(clone.region.viewportAnchorY).toBe(cue.region.viewportAnchorY);
    });

    // eslint-disable-next-line @stylistic/max-len
    it('should not share references for region between original and clone', () => {
      const clone = cue.clone();

      clone.region.width = 100;
      clone.region.viewportAnchorX = 999;

      expect(cue.region.width).toBe(80);
      expect(cue.region.viewportAnchorX).toBe(10);
    });

    it('should correctly clone null region', () => {
      cue.region = null;

      const clone = cue.clone();

      expect(clone.region).toBeNull();
    });

    it('should deep clone nested cues', () => {
      const clone = cue2.clone();

      expect(clone.nestedCues.length).toBe(2);
      expect(clone.nestedCues[0] instanceof shaka.text.Cue).toBe(true);
      expect(clone.nestedCues[0]).not.toBe(cue2.nestedCues[0]);
      expect(clone.nestedCues[0].payload).toBe('Nested 1');
      expect(clone.nestedCues[1].payload).toBe('Nested 2');
    });

    it('should preserve lineBreak cues', () => {
      const breakCue = shaka.text.Cue.lineBreak(1, 2);
      cue2.nestedCues.push(breakCue);

      const clone = cue2.clone();
      const clonedBreakCue = clone.nestedCues.find((c) => c.lineBreak);

      expect(clonedBreakCue).toBeDefined();
      expect(clonedBreakCue).not.toBe(breakCue);
      expect(clonedBreakCue.lineBreak).toBe(true);
    });

    it('should clone optional rubyTag correctly', () => {
      const clone = cue2.clone();

      expect(clone.rubyTag).toBe('ruby');

      clone.rubyTag = 'rt';
      expect(cue2.rubyTag).toBe('ruby');
    });

    it('should clone isContainer flag', () => {
      const clone = cue2.clone();
      expect(clone.isContainer).toBe(true);

      clone.isContainer = false;
      expect(cue2.isContainer).toBe(true);
    });
  });
});
