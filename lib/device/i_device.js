/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.device.IDevice');


/**
 * @interface
 */
shaka.device.IDevice = class {
  /**
   * Check if the current platform supports media source. We assume that if
   * the current platform supports media source, then we can use media source
   * as per its design.
   *
   * @return {boolean}
   */
  supportsMediaSource() {}

  /**
   * Returns true if the media type is supported natively by the platform.
   *
   * @param {string} mimeType
   * @return {boolean}
   */
  supportsMediaType(mimeType) {}

  /**
   * @return {boolean}
   */
  supportsMediaCapabilities() {}

  /**
   * Version of device or null if unknown.
   * @return {?number}
   */
  getVersion() {}

  /**
   * Friendly device name.
   * @return {string}
   */
  getDeviceName() {}

  /**
   * @return {!shaka.device.IDevice.DeviceType}
   */
  getDeviceType() {}

  /**
   * Returns true if the platform requires encryption information in all init
   * segments.  For such platforms, MediaSourceEngine will attempt to work
   * around a lack of such info by inserting fake encryption information into
   * initialization segments.
   *
   * @param {?string} keySystem
   * @return {boolean}
   * @see https://github.com/shaka-project/shaka-player/issues/2759
   */
  requiresEncryptionInfoInAllInitSegments(keySystem) {}

  /**
   * Returns true if the platform requires AC-3 signalling in init
   * segments to be replaced with EC-3 signalling.
   * For such platforms, MediaSourceEngine will attempt to work
   * around it by inserting fake EC-3 signalling into
   * initialization segments.
   *
   * @return {boolean}
   */
  requiresEC3InitSegments() {}

  /**
   * Returns true if the platform supports SourceBuffer "sequence mode".
   *
   * @return {boolean}
   */
  supportsSequenceMode() {}

  /**
   * Returns if codec switching SMOOTH is known reliable device support.
   *
   * Some devices are known not to support <code>SourceBuffer.changeType</code>
   * well. These devices should use the reload strategy. If a device
   * reports that it supports <code<changeType</code> but supports it unreliably
   * it should be disallowed in this method.
   *
   * @return {boolean}
   */
  supportsSmoothCodecSwitching() {}

  /**
   * On some platforms, the act of seeking can take a significant amount
   * of time.
   * @return {boolean}
   */
  isSeekingSlow() {}

  /**
   * Detect the maximum resolution that the platform's hardware can handle.
   *
   * @return {!Promise<shaka.extern.Resolution>}
   */
  detectMaxHardwareResolution() {}

  /**
   * @return {boolean}
   */
  supportsServerCertificate() {}

  /**
   * Adjusts player configuration with device specific tweaks. Changes are done
   * in-place and the same object is returned.
   * @param {shaka.extern.PlayerConfiguration} config
   * @return {shaka.extern.PlayerConfiguration}
   */
  adjustConfig(config) {}

  /**
   * Checks should Dolby Vision codecs be overridden to their H.264 and H.265
   * equivalents.
   * @return {boolean}
   */
  shouldOverrideDolbyVisionCodecs() {}
};

/**
 * @enum {string}
 */
shaka.device.IDevice.DeviceType = {
  'DESKTOP': 'DESKTOP',
  'MOBILE': 'MOBILE',
  'TV': 'TV',
  'VR': 'VR',
  'CONSOLE': 'CONSOLE',
  'CAST': 'CAST',
};
