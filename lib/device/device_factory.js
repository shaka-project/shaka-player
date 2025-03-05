/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.device.DeviceFactory');

goog.require('goog.asserts');
goog.require('shaka.util.Lazy');
goog.requireType('shaka.device.IDevice');


shaka.device.DeviceFactory = class {
  /**
   * @param {?function(): shaka.device.IDevice} deviceFactory
   */
  static registerDeviceFactory(deviceFactory) {
    goog.asserts.assert(!shaka.device.DeviceFactory.factory_,
        'Device Factory should NOT be defined');
    shaka.device.DeviceFactory.factory_ = deviceFactory;
  }

  /**
   * @return {shaka.device.IDevice}
   */
  static getDevice() {
    goog.asserts.assert(shaka.device.DeviceFactory.factory_,
        'Device Factory should be defined');
    return shaka.device.DeviceFactory.device_.value();
  }
};

/** @private {?function(): shaka.device.IDevice} */
shaka.device.DeviceFactory.factory_ = null;

/** @private {!shaka.util.Lazy<shaka.device.IDevice>} */
shaka.device.DeviceFactory.device_ = new shaka.util.Lazy(() => {
  if (shaka.device.DeviceFactory.factory_) {
    return shaka.device.DeviceFactory.factory_();
  }
  return undefined;
});
