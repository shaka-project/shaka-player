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
   * @return {!shaka.device.IDevice.BrowserEngine}
   */
  getBrowserEngine() {}

  /**
   * Returns true if the platform requires encryption information in all init
   * segments.  For such platforms, MediaSourceEngine will attempt to work
   * around a lack of such info by inserting fake encryption information into
   * initialization segments.
   *
   * @param {?string} keySystem
   * @param {?string} contentType
   * @return {boolean}
   * @see https://github.com/shaka-project/shaka-player/issues/2759
   */
  requiresEncryptionInfoInAllInitSegments(keySystem, contentType) {}

  /**
   * Returns true if the platform requires both clear & encryption information
   * in clear init segments.  For such platforms, MediaSourceEngine will attempt
   * to work around a lack of such info by inserting fake information into
   * initialization segments. It is called only when
   * <code>requiresEncryptionInfoInAllInitSegments()</code> is also true
   * and works as the extension of it.
   *
   * @return {boolean}
   * @see https://github.com/shaka-project/shaka-player/pull/6719
   */
  requiresClearAndEncryptedInitSegments() {}

  /**
   * Indicates should the encryption data be inserted before  or after
   * the clear data in the init segment.
   * @return {boolean}
   */
  insertEncryptionDataBeforeClear() {}

  /**
   * @param {string} contentType
   * @return {boolean}
   */
  requiresTfhdFix(contentType) {}

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
   * of time, so we need to delay a seek.
   * @return {number}
   */
  seekDelay() {}

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

  /**
   * Indicates whether or not to use window.TextDecoder and window.TextEncoder
   * even if they are available
   * @return {boolean}
   */
  shouldAvoidUseTextDecoderEncoder() {}

  /**
   * Checks does the platform supports offline storage by IDB.
   * @return {boolean}
   */
  supportsOfflineStorage() {}

  /**
   * Lists all codecs that should be rejected by MediaSource.
   * @return {!Array<string>}
   */
  rejectCodecs() {}

  /**
   * Check the current HDR level supported by the screen.
   *
   * @param {boolean} preferHLG
   * @return {string}
   */
  getHdrLevel(preferHLG) {}

  /**
   * @return {boolean}
   */
  supportsAirPlay() {}

  /**
   * @return {boolean}
   */
  misreportAC3UsingDrm() {}

  /**
   * @return {boolean}
   */
  returnLittleEndianUsingPlayReady() {}

  /**
   * @return {boolean}
   */
  supportsEncryptionSchemePolyfill() {}

  /**
   * @return {boolean}
   */
  misreportsSupportForPersistentLicenses() {}

  /**
   * @return {boolean}
   */
  supportStandardVP9Checking() {}

  /**
   * @return {boolean}
   */
  createMediaKeysWhenCheckingSupport() {}

  /**
   * @return {boolean}
   */
  disableHEVCSupport() {}

  /**
   * @return {boolean}
   */
  supportsCbcsWithoutEncryptionSchemeSupport() {}

  /**
   * @return {boolean}
   */
  supportsContainerChangeType() {}

  /**
   * Returns true if the platform needs to wait for the encrypted event in order
   * to initialize CDM correctly.
   * @param {string} keySystem
   * @return {boolean}
   */
  needWaitForEncryptedEvent(keySystem) {}
};

/**
 * @enum {string}
 */
shaka.device.IDevice.DeviceType = {
  'DESKTOP': 'DESKTOP',
  'MOBILE': 'MOBILE',
  'TV': 'TV',
  'VR': 'VR',
  'APPLE_VR': 'APPLE_VR',
  'CONSOLE': 'CONSOLE',
  'CAST': 'CAST',
};

/**
 * @enum {string}
 */
shaka.device.IDevice.BrowserEngine = {
  'CHROMIUM': 'CHROMIUM',
  'EDGE': 'EDGE',
  'GECKO': 'GECKO',
  'WEBKIT': 'WEBKIT',
  'UNKNOWN': 'UNKNOWN',
};
