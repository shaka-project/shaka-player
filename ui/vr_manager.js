/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.VRManager');

goog.require('shaka.device.DeviceFactory');
goog.require('shaka.device.IDevice');
goog.require('shaka.log');
goog.require('shaka.ui.VRWebgl');
goog.require('shaka.util.Dom');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.IReleasable');

goog.requireType('shaka.Player');


/**
 * @implements {shaka.util.IReleasable}
 */
shaka.ui.VRManager = class extends shaka.util.FakeEventTarget {
  /**
   * @param {!HTMLElement} container
   * @param {?HTMLCanvasElement} canvas
   * @param {!HTMLMediaElement} video
   * @param {!shaka.Player} player
   * @param {shaka.extern.UIConfiguration} config
   */
  constructor(container, canvas, video, player, config) {
    super();

    /** @private {!HTMLElement} */
    this.container_ = container;

    /** @private {?HTMLCanvasElement} */
    this.canvas_ = canvas;

    /** @private {!HTMLMediaElement} */
    this.video_ = video;

    /** @private {!shaka.Player} */
    this.player_ = player;

    /** @private {shaka.extern.UIConfiguration} */
    this.config_ = config;

    /** @private {shaka.util.EventManager} */
    this.loadEventManager_ = new shaka.util.EventManager();

    /** @private {shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();

    /** @private {?WebGLRenderingContext} */
    this.gl_ = this.getGL_(this.canvas_);

    /** @private {?shaka.ui.VRWebgl} */
    this.vrWebgl_ = null;

    /** @private {boolean} */
    this.onGesture_ = false;

    /** @private {number} */
    this.prevX_ = 0;

    /** @private {number} */
    this.prevY_ = 0;

    /** @private {number} */
    this.prevAlpha_ = 0;

    /** @private {number} */
    this.prevBeta_ = 0;

    /** @private {number} */
    this.prevGamma_ = 0;

    /** @private {?string} */
    this.vrAsset_ = null;

    this.loadEventManager_.listen(player, 'loading', () => {
      if (this.vrWebgl_) {
        this.vrWebgl_.reset();
      }
      this.checkVrStatus_();
    });

    this.loadEventManager_.listen(player, 'spatialvideoinfo', (event) => {
      /** @type {shaka.extern.SpatialVideoInfo} */
      const spatialInfo = event['detail'];
      let unsupported = false;
      switch (spatialInfo.projection) {
        case 'rect':
          // Rectilinear content is the flat rectangular media.
          this.vrAsset_ = null;
          break;
        case 'equi':
          this.vrAsset_ = 'equirectangular';
          break;
        case 'hequ':
          switch (spatialInfo.hfov) {
            case 360:
              this.vrAsset_ = 'equirectangular';
              break;
            case 180:
              this.vrAsset_ = 'halfequirectangular';
              break;
            default:
              if (spatialInfo.hfov == null) {
                this.vrAsset_ = 'halfequirectangular';
              } else {
                this.vrAsset_ = null;
                unsupported = true;
              }
              break;
          }
          break;
        case 'fish':
          // It's not really the same thing, but the difference is very subtle
          // and allows us to tolerate it.
          this.vrAsset_ = 'halfequirectangular';
          break;
        default:
          this.vrAsset_ = null;
          unsupported = true;
          break;
      }
      if (unsupported) {
        shaka.log.warning('Unsupported VR projection or hfov', spatialInfo);
      }
      this.checkVrStatus_();
    });

    this.loadEventManager_.listen(player, 'nospatialvideoinfo', () => {
      this.vrAsset_ = null;
      this.checkVrStatus_();
    });

    this.loadEventManager_.listen(player, 'unloading', () => {
      this.vrAsset_ = null;
      this.checkVrStatus_();
    });

    this.checkVrStatus_();
  }

  /**
   * @override
   */
  release() {
    if (this.loadEventManager_) {
      this.loadEventManager_.release();
      this.loadEventManager_ = null;
    }
    if (this.eventManager_) {
      this.eventManager_.release();
      this.eventManager_ = null;
    }
    if (this.vrWebgl_) {
      this.vrWebgl_.release();
      this.vrWebgl_ = null;
    }

    // FakeEventTarget implements IReleasable
    super.release();
  }

  /**
   * @param {!shaka.extern.UIConfiguration} config
   */
  configure(config) {
    this.config_ = config;
    this.checkVrStatus_();
  }

  /**
   * Returns if a VR is capable.
   *
   * @return {boolean}
   */
  canPlayVR() {
    if (this.canvas_) {
      return !!this.gl_;
    }
    const canvas =
        shaka.util.Dom.asHTMLCanvasElement(document.createElement('canvas'));
    return !!this.getGL_(canvas);
  }

  /**
   * Returns if a VR is supported.
   *
   * @return {boolean}
   */
  isPlayingVR() {
    return !!this.vrWebgl_;
  }

  /**
   * Reset VR view.
   */
  reset() {
    if (!this.vrWebgl_) {
      shaka.log.alwaysWarn('Not playing VR content');
      return;
    }
    this.vrWebgl_.reset();
  }

  /**
   * Get the angle of the north.
   *
   * @return {?number}
   */
  getNorth() {
    if (!this.vrWebgl_) {
      shaka.log.alwaysWarn('Not playing VR content');
      return null;
    }
    return this.vrWebgl_.getNorth();
  }

  /**
   * Returns the field of view.
   *
   * @return {?number}
   */
  getFieldOfView() {
    if (!this.vrWebgl_) {
      shaka.log.alwaysWarn('Not playing VR content');
      return null;
    }
    return this.vrWebgl_.getFieldOfView();
  }

  /**
   * Set the field of view.
   *
   * @param {number} fieldOfView
   */
  setFieldOfView(fieldOfView) {
    if (!this.vrWebgl_) {
      shaka.log.alwaysWarn('Not playing VR content');
      return;
    }
    if (fieldOfView < 0) {
      shaka.log.alwaysWarn('Field of view should be greater than 0');
      fieldOfView = 0;
    } else if (fieldOfView > 100) {
      shaka.log.alwaysWarn('Field of view should be less than 100');
      fieldOfView = 100;
    }
    this.vrWebgl_.setFieldOfView(fieldOfView);
  }

  /**
   * Toggle stereoscopic mode.
   */
  toggleStereoscopicMode() {
    if (!this.vrWebgl_) {
      shaka.log.alwaysWarn('Not playing VR content');
      return;
    }
    this.vrWebgl_.toggleStereoscopicMode();
  }

  /**
   * Returns true if stereoscopic mode is enabled.
   *
   * @return {boolean}
   */
  isStereoscopicModeEnabled() {
    if (!this.vrWebgl_) {
      shaka.log.alwaysWarn('Not playing VR content');
      return false;
    }
    return this.vrWebgl_.isStereoscopicModeEnabled();
  }

  /**
   * Increment the yaw in X angle in degrees.
   *
   * @param {number} angle
   */
  incrementYaw(angle) {
    if (!this.vrWebgl_) {
      shaka.log.alwaysWarn('Not playing VR content');
      return;
    }
    this.vrWebgl_.rotateViewGlobal(
        angle * shaka.ui.VRManager.TO_RADIANS_, 0, 0);
  }

  /**
   * Increment the pitch in X angle in degrees.
   *
   * @param {number} angle
   */
  incrementPitch(angle) {
    if (!this.vrWebgl_) {
      shaka.log.alwaysWarn('Not playing VR content');
      return;
    }
    this.vrWebgl_.rotateViewGlobal(
        0, angle * shaka.ui.VRManager.TO_RADIANS_, 0);
  }

  /**
   * Increment the roll in X angle in degrees.
   *
   * @param {number} angle
   */
  incrementRoll(angle) {
    if (!this.vrWebgl_) {
      shaka.log.alwaysWarn('Not playing VR content');
      return;
    }
    this.vrWebgl_.rotateViewGlobal(
        0, 0, angle * shaka.ui.VRManager.TO_RADIANS_);
  }

  /**
   * @private
   */
  checkVrStatus_() {
    if ((this.config_.displayInVrMode || this.vrAsset_)) {
      if (!this.canvas_) {
        this.canvas_ = shaka.util.Dom.asHTMLCanvasElement(
            document.createElement('canvas'));
        this.canvas_.classList.add('shaka-vr-canvas-container');
        this.video_.parentElement.insertBefore(
            this.canvas_, this.video_.nextElementSibling);
        this.gl_ = this.getGL_(this.canvas_);
      }
      const newProjectionMode =
          this.vrAsset_ || this.config_.defaultVrProjectionMode;
      if (!this.vrWebgl_) {
        this.canvas_.style.display = '';
        this.init_(newProjectionMode);
        this.dispatchEvent(new shaka.util.FakeEvent(
            'vrstatuschanged',
            (new Map()).set('newStatus', this.isPlayingVR())));
      } else {
        const currentProjectionMode = this.vrWebgl_.getProjectionMode();
        if (currentProjectionMode != newProjectionMode) {
          this.eventManager_.removeAll();
          this.vrWebgl_.release();
          this.init_(newProjectionMode);
          // Re-initialization the status does not change.
        }
      }
    } else if (!this.config_.displayInVrMode && !this.vrAsset_ &&
        this.canvas_ && this.vrWebgl_) {
      this.canvas_.style.display = 'none';
      this.eventManager_.removeAll();
      this.vrWebgl_.release();
      this.vrWebgl_ = null;
      this.dispatchEvent(new shaka.util.FakeEvent(
          'vrstatuschanged',
          (new Map()).set('newStatus', this.isPlayingVR())));
    }
  }

  /**
   * @param {string} projectionMode
   * @private
   */
  init_(projectionMode) {
    if (this.gl_ && this.canvas_) {
      this.vrWebgl_ = new shaka.ui.VRWebgl(
          this.video_, this.player_, this.canvas_, this.gl_, projectionMode);
      this.setupVRListeners_();
    }
  }

  /**
   * @param {?HTMLCanvasElement} canvas
   * @return {?WebGLRenderingContext}
   * @private
   */
  getGL_(canvas) {
    if (!canvas) {
      return null;
    }
    // The user interface is not intended for devices that are controlled with
    // a remote control, and WebGL may run slowly on these devices.
    const device = shaka.device.DeviceFactory.getDevice();
    const deviceType = device.getDeviceType();
    if (deviceType == shaka.device.IDevice.DeviceType.TV ||
        deviceType == shaka.device.IDevice.DeviceType.CONSOLE ||
        deviceType == shaka.device.IDevice.DeviceType.CAST) {
      return null;
    }
    const webglContexts = [
      'webgl2',
      'webgl',
    ];
    for (const webgl of webglContexts) {
      const gl = canvas.getContext(webgl);
      if (gl) {
        return /** @type {!WebGLRenderingContext} */(gl);
      }
    }
    return null;
  }

  /**
   * @private
   */
  setupVRListeners_() {
    // Start
    this.eventManager_.listen(this.container_, 'mousedown', (event) => {
      if (!this.onGesture_) {
        this.gestureStart_(event.clientX, event.clientY);
      }
    });
    if (navigator.maxTouchPoints > 0) {
      this.eventManager_.listen(this.container_, 'touchstart', (e) => {
        if (!this.onGesture_) {
          const event = /** @type {!TouchEvent} */(e);
          this.gestureStart_(
              event.touches[0].clientX, event.touches[0].clientY);
        }
      });
    }

    // Zoom
    this.eventManager_.listen(this.container_, 'wheel', (e) => {
      if (!this.onGesture_) {
        const event = /** @type {!WheelEvent} */(e);
        this.vrWebgl_.zoom(event.deltaY);
        event.preventDefault();
        event.stopPropagation();
      }
    });

    // Move
    this.eventManager_.listen(this.container_, 'mousemove', (event) => {
      if (this.onGesture_) {
        this.gestureMove_(event.clientX, event.clientY);
      }
    });
    if (navigator.maxTouchPoints > 0) {
      this.eventManager_.listen(this.container_, 'touchmove', (e) => {
        if (this.onGesture_) {
          const event = /** @type {!TouchEvent} */(e);
          this.gestureMove_(
              event.touches[0].clientX, event.touches[0].clientY);
        }
        e.preventDefault();
      });
    }

    // End
    this.eventManager_.listen(this.container_, 'mouseleave', () => {
      this.onGesture_ = false;
    });
    this.eventManager_.listen(this.container_, 'mouseup', () => {
      this.onGesture_ = false;
    });
    if (navigator.maxTouchPoints > 0) {
      this.eventManager_.listen(this.container_, 'touchend', () => {
        this.onGesture_ = false;
      });
    }

    // Detect device movement
    let deviceOrientationListener = false;
    if (window.DeviceOrientationEvent) {
      // See: https://dev.to/li/how-to-requestpermission-for-devicemotion-and-deviceorientation-events-in-ios-13-46g2
      if (typeof DeviceMotionEvent.requestPermission == 'function') {
        const userGestureListener = () => {
          DeviceMotionEvent.requestPermission().then((newPermissionState) => {
            if (newPermissionState !== 'granted' ||
                deviceOrientationListener) {
              return;
            }
            deviceOrientationListener = true;
            this.setupDeviceOrientationListener_();
          });
        };
        DeviceMotionEvent.requestPermission().then((permissionState) => {
          this.eventManager_.unlisten(
              this.container_, 'click', userGestureListener);
          this.eventManager_.unlisten(
              this.container_, 'mouseup', userGestureListener);
          if (navigator.maxTouchPoints > 0) {
            this.eventManager_.unlisten(
                this.container_, 'touchend', userGestureListener);
          }
          if (permissionState !== 'granted') {
            this.eventManager_.listenOnce(
                this.container_, 'click', userGestureListener);
            this.eventManager_.listenOnce(
                this.container_, 'mouseup', userGestureListener);
            if (navigator.maxTouchPoints > 0) {
              this.eventManager_.listenOnce(
                  this.container_, 'touchend', userGestureListener);
            }
            return;
          }
          deviceOrientationListener = true;
          this.setupDeviceOrientationListener_();
        }).catch(() => {
          this.eventManager_.unlisten(
              this.container_, 'click', userGestureListener);
          this.eventManager_.unlisten(
              this.container_, 'mouseup', userGestureListener);
          if (navigator.maxTouchPoints > 0) {
            this.eventManager_.unlisten(
                this.container_, 'touchend', userGestureListener);
          }
          this.eventManager_.listenOnce(
              this.container_, 'click', userGestureListener);
          this.eventManager_.listenOnce(
              this.container_, 'mouseup', userGestureListener);
          if (navigator.maxTouchPoints > 0) {
            this.eventManager_.listenOnce(
                this.container_, 'touchend', userGestureListener);
          }
        });
      } else {
        deviceOrientationListener = true;
        this.setupDeviceOrientationListener_();
      }
    }
  }

  /**
   * @private
   */
  setupDeviceOrientationListener_() {
    this.eventManager_.listen(window, 'deviceorientation', (e) => {
      if (!this.vrWebgl_) {
        return;
      }
      const event = /** @type {!DeviceOrientationEvent} */(e);
      let alphaDif = (event.alpha || 0) - this.prevAlpha_;
      let betaDif = (event.beta || 0) - this.prevBeta_;
      let gammaDif = (event.gamma || 0) - this.prevGamma_;

      if (Math.abs(alphaDif) > 10 || Math.abs(betaDif) > 10 ||
          Math.abs(gammaDif) > 5) {
        alphaDif = 0;
        gammaDif = 0;
        betaDif = 0;
      }

      this.prevAlpha_ = event.alpha || 0;
      this.prevBeta_ = event.beta || 0;
      this.prevGamma_ = event.gamma || 0;

      const toRadians = shaka.ui.VRManager.TO_RADIANS_;

      const orientation = screen.orientation.angle;
      if (orientation == 90 || orientation == -90) {
        this.vrWebgl_.rotateViewGlobal(
            alphaDif * toRadians * -1, gammaDif * toRadians * -1, 0);
      } else {
        this.vrWebgl_.rotateViewGlobal(
            alphaDif * toRadians * -1, betaDif * toRadians, 0);
      }
    });
  }

  /**
   * @param {number} x
   * @param {number} y
   * @private
   */
  gestureStart_(x, y) {
    this.onGesture_ = true;
    this.prevX_ = x;
    this.prevY_ = y;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @private
   */
  gestureMove_(x, y) {
    const touchScaleFactor = -0.60 * Math.PI / 180;
    this.vrWebgl_.rotateViewGlobal((x - this.prevX_) * touchScaleFactor,
        (y - this.prevY_) * -1 * touchScaleFactor, 0);

    this.prevX_ = x;
    this.prevY_ = y;
  }
};

/**
 * @const {number}
 * @private
 */
shaka.ui.VRManager.TO_RADIANS_ = Math.PI / 180;
