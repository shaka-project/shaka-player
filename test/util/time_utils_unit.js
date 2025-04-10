/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('TimeUtils', () => {
  const TimeUtils = shaka.util.TimeUtils;

  it('should convert NTP timestamp to UTC time', () => {
    const ntpStart = Date.UTC(1900);
    expect(TimeUtils.convertNtp(0)).toBe(ntpStart);
    expect(TimeUtils.convertNtp(1000)).toBe(ntpStart + 1000);
  });
});
