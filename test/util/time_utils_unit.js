/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('TimeUtils', () => {
  const TimeUtils = shaka.util.TimeUtils;

  it('should convert NTP timestamp to UTC time', () => {
    // NTP time starts at 1900-01-01T00:00:00Z
    const ntpStart = -2208988800000;
    expect(TimeUtils.convertNtp(0)).toBe(ntpStart);
    expect(TimeUtils.convertNtp(1000)).toBe(ntpStart + 1000);
  });
});
