/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.device.DeviceFactory');

goog.require('goog.asserts');
goog.require('shaka.log');
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
   * @param {?function(): shaka.device.IDevice} deviceFactory
   */
  static registerDefaultDeviceFactory(deviceFactory) {
    goog.asserts.assert(!shaka.device.DeviceFactory.defaultFactory_,
        'Default device Factory should NOT be defined');
    shaka.device.DeviceFactory.defaultFactory_ = deviceFactory;
  }

  /**
   * @return {shaka.device.IDevice}
   */
  static getDevice() {
    goog.asserts.assert(shaka.device.DeviceFactory.factory_ ||
        shaka.device.DeviceFactory.defaultFactory_,
    'Device Factory should be defined');
    return shaka.device.DeviceFactory.device_.value();
  }
};

/** @private {?function(): shaka.device.IDevice} */
shaka.device.DeviceFactory.factory_ = null;

/** @private {?function(): shaka.device.IDevice} */
shaka.device.DeviceFactory.defaultFactory_ = null;

/** @private {!shaka.util.Lazy<shaka.device.IDevice>} */
shaka.device.DeviceFactory.device_ = new shaka.util.Lazy(() => {
  let device = undefined;
  if (shaka.device.DeviceFactory.factory_) {
    device = shaka.device.DeviceFactory.factory_();
  }
  if (!device && shaka.device.DeviceFactory.defaultFactory_) {
    device = shaka.device.DeviceFactory.defaultFactory_();
  }
  if (device) {
    shaka.log.info(device.toString());
  }
  return device;
});
