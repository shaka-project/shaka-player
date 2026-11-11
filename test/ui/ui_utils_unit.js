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

  describe('buildAccessibleTimeString', () => {
    const Utils = shaka.ui.Utils;

    /**
     * @param {!Object<string, number>} duration
     * @param {string=} secondsDisplay
     * @return {string}
     */
    function format(duration, secondsDisplay) {
      return new Intl.DurationFormat('en', {style: 'long', secondsDisplay})
          .format(duration);
    }

    beforeEach(() => {
      if (!window.Intl || !('DurationFormat' in Intl)) {
        pending('Intl.DurationFormat is not supported.');
      }
    });

    it('breaks seconds down into larger units', () => {
      expect(Utils.buildAccessibleTimeString(3723, ['en']))
          .toBe(format({hours: 1, minutes: 2, seconds: 3}));
      expect(Utils.buildAccessibleTimeString(129695, ['en']))
          .toBe(format({days: 1, hours: 12, minutes: 1, seconds: 35}));
    });

    it('leaves out the units that are zero', () => {
      expect(Utils.buildAccessibleTimeString(2700, ['en']))
          .toBe(format({minutes: 45}));
    });

    it('rounds fractions of a second down', () => {
      expect(Utils.buildAccessibleTimeString(1234.9, ['en']))
          .toBe(format({minutes: 20, seconds: 34}));
    });

    it('says zero seconds for a zero duration', () => {
      const text = Utils.buildAccessibleTimeString(0, ['en']);
      expect(text).toBe(format({seconds: 0}, 'always'));
      expect(text).not.toBe('');
    });

    it('uses the given locales', () => {
      expect(Utils.buildAccessibleTimeString(1234, ['es']))
          .toBe(new Intl.DurationFormat('es', {style: 'long'})
              .format({minutes: 20, seconds: 34}));
    });

    it('returns null for a malformed locale', () => {
      expect(Utils.buildAccessibleTimeString(1234, ['!!'])).toBe(null);
    });
  });

  describe('buildAccessibleTimeString without Intl.DurationFormat', () => {
    /** @type {*} */
    let originalDurationFormat;

    beforeEach(() => {
      if (!window.Intl || !('DurationFormat' in Intl)) {
        return;
      }
      originalDurationFormat = Intl.DurationFormat;
      delete Intl['DurationFormat'];
    });

    afterEach(() => {
      if (originalDurationFormat) {
        Intl['DurationFormat'] = originalDurationFormat;
        originalDurationFormat = undefined;
      }
    });

    it('returns null', () => {
      expect(shaka.ui.Utils.buildAccessibleTimeString(1234, ['en']))
          .toBe(null);
    });
  });

  describe('buildPercentString', () => {
    it('rounds to a whole percentage', () => {
      expect(shaka.ui.Utils.buildPercentString(0.333333, ['en']))
          .toBe('33%');
      expect(shaka.ui.Utils.buildPercentString(1, ['en'])).toBe('100%');
    });

    it('uses the given locales', () => {
      expect(shaka.ui.Utils.buildPercentString(0.5, ['es']))
          .toBe(new Intl.NumberFormat('es', {style: 'percent'}).format(0.5));
    });
  });
});
