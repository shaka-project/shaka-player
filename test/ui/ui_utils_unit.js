/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('UI Utils', () => {
  describe('buildTimeString', () => {
    it('supports seconds without hour', () => {
      const time = shaka.ui.Utils.buildTimeString(
          /* displayTime= */ 2, /* showHour= */ false);
      expect(time).toBe('0:02');
    });

    it('supports seconds with hour', () => {
      const time = shaka.ui.Utils.buildTimeString(
          /* displayTime= */ 2, /* showHour= */ true);
      expect(time).toBe('0:00:02');
    });

    it('supports minutes without hour', () => {
      const time = shaka.ui.Utils.buildTimeString(
          /* displayTime= */ 1830, /* showHour= */ false);
      expect(time).toBe('30:30');
    });

    it('supports minutes with hour', () => {
      const time = shaka.ui.Utils.buildTimeString(
          /* displayTime= */ 1830, /* showHour= */ true);
      expect(time).toBe('0:30:30');
    });

    it('supports hours without hour', () => {
      const time = shaka.ui.Utils.buildTimeString(
          /* displayTime= */ 3700, /* showHour= */ false);
      expect(time).toBe('1:40');
    });

    it('supports hours with hour', () => {
      const time = shaka.ui.Utils.buildTimeString(
          /* displayTime= */ 3700, /* showHour= */ true);
      expect(time).toBe('1:01:40');
    });

    it('supports days without hour', () => {
      const time = shaka.ui.Utils.buildTimeString(
          /* displayTime= */ 129695, /* showHour= */ false);
      expect(time).toBe('1:35');
    });

    it('supports days with hour', () => {
      const time = shaka.ui.Utils.buildTimeString(
          /* displayTime= */ 129695, /* showHour= */ true);
      expect(time).toBe('1:12:01:35');
    });
  });
});
