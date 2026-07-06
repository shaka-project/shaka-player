/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.VRManager');

goog.require('shaka.log');
goog.require('shaka.ui.VRWebgl');
goog.require('shaka.util.Dom');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.IReleasable');

goog.requireType('shaka.Player');
goog.requireType('shaka.ui.Controls');


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
   * @param {!shaka.ui.Controls} controls
   */
  constructor(container, canvas, video, player, config, controls) {
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

    /** @private {!shaka.ui.Controls} */
    this.controls_ = controls;

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

    /** @private {?number} */
    this.pinchDistance_ = null;

    /** @private {number} */
    this.prevAlpha_ = 0;

    /** @private {number} */
    this.prevBeta_ = 0;

    /** @private {number} */
    this.prevGamma_ = 0;

    /** @private {?string} */
    this.vrAsset_ = null;

    /** @private {?number} */
    this.vrHfov_ = null;

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
      this.vrHfov_ = spatialInfo.hfov;
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
        case 'prim':
        case 'aiv':
          // Apple Immersive Video ('aiv') uses the parametric immersive
          // projection ('prim'), which is fisheye-based, so all of these
          // are rendered as fisheye content.
          this.vrAsset_ = 'fisheye';
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

    this.loadEventManager_.listenMulti(
        player, ['nospatialvideoinfo', 'unloading'], () => {
          this.vrAsset_ = null;
          this.vrHfov_ = null;
          this.checkVrStatus_();
        });

    this.loadEventManager_.listen(this.controls_, 'caststatuschanged', () => {
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
    const isCasting = this.controls_.getCastProxy().isCasting();
    if ((this.config_.displayInVrMode || this.vrAsset_) && !isCasting) {
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
      const newHfov = this.vrHfov_ || 180;
      if (!this.vrWebgl_) {
        this.canvas_.style.display = '';
        this.init_(newProjectionMode, newHfov);
        this.dispatchEvent(new shaka.util.FakeEvent(
            'vrstatuschanged',
            (new Map()).set('newStatus', this.isPlayingVR())));
      } else {
        const currentProjectionMode = this.vrWebgl_.getProjectionMode();
        const hfovChanged = newProjectionMode == 'fisheye' &&
            this.vrWebgl_.getHfov() != newHfov;
        if (currentProjectionMode != newProjectionMode || hfovChanged) {
          this.eventManager_.removeAll();
          this.vrWebgl_.release();
          this.init_(newProjectionMode, newHfov);
          // Re-initialization the status does not change.
        }
      }
    } else if (this.canvas_ && this.vrWebgl_) {
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
   * @param {number} hfov
   * @private
   */
  init_(projectionMode, hfov) {
    if (this.gl_ && this.canvas_) {
      this.vrWebgl_ = new shaka.ui.VRWebgl(
          this.video_, this.player_, this.canvas_, this.gl_, projectionMode,
          hfov);
      this.setupVRListeners_();
    }
  }

  /**
   * @param {?HTMLCanvasElement} canvas
   * @return {?WebGLRenderingContext}
   * @private
   */
  getGL_(canvas) {
    if (!canvas || !window.WebGLRenderingContext) {
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
      if (!this.onGesture_ && event.button == 0 &&
          this.canStartGesture_(event.target)) {
        this.gestureStart_(event.clientX, event.clientY);
      }
    });
    if (navigator.maxTouchPoints > 0) {
      this.eventManager_.listen(this.container_, 'touchstart', (e) => {
        const event = /** @type {!TouchEvent} */(e);
        if (event.touches.length == 2) {
          // Stop panning and start a pinch zoom gesture.
          this.onGesture_ = false;
          this.pinchDistance_ = this.getPinchDistance_(event);
        } else if (!this.onGesture_ &&
            this.canStartGesture_(event.target)) {
          this.gestureStart_(
              event.touches[0].clientX, event.touches[0].clientY);
        }
      });
    }

    // Zoom
    this.eventManager_.listen(this.container_, 'wheel', (e) => {
      if (!this.onGesture_ && this.config_.enableVrWheelZoom &&
          this.canStartGesture_(e.target)) {
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
        const event = /** @type {!TouchEvent} */(e);
        if (this.pinchDistance_ != null && event.touches.length == 2) {
          const newPinchDistance = this.getPinchDistance_(event);
          this.vrWebgl_.zoom(
              (this.pinchDistance_ - newPinchDistance) *
              shaka.ui.VRManager.PINCH_ZOOM_FACTOR_);
          this.pinchDistance_ = newPinchDistance;
          e.preventDefault();
        } else if (this.onGesture_) {
          this.gestureMove_(
              event.touches[0].clientX, event.touches[0].clientY);
          e.preventDefault();
        }
      });
    }

    // End
    this.eventManager_.listenMulti(
        this.container_, ['mouseleave', 'mouseup'], () => {
          this.onGesture_ = false;
        });
    if (navigator.maxTouchPoints > 0) {
      this.eventManager_.listen(this.container_, 'touchend', (e) => {
        const event = /** @type {!TouchEvent} */(e);
        this.onGesture_ = false;
        if (event.touches.length == 2) {
          this.pinchDistance_ = this.getPinchDistance_(event);
        } else {
          this.pinchDistance_ = null;
        }
        if (event.touches.length == 1) {
          // Continue panning with the remaining finger.
          this.gestureStart_(
              event.touches[0].clientX, event.touches[0].clientY);
        }
      });
    }

    // Detect device movement
    if (this.config_.enableVrDeviceMotion && window.DeviceOrientationEvent) {
      let deviceOrientationListener = false;
      // See: https://dev.to/li/how-to-requestpermission-for-devicemotion-and-deviceorientation-events-in-ios-13-46g2
      if (typeof DeviceMotionEvent.requestPermission == 'function') {
        const userGestureEvents = ['click', 'mouseup'];
        if (navigator.maxTouchPoints > 0) {
          userGestureEvents.push('touchend');
        }
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
        const listenToUserGesturesAgain = () => {
          for (const eventName of userGestureEvents) {
            this.eventManager_.unlisten(
                this.container_, eventName, userGestureListener);
            this.eventManager_.listenOnce(
                this.container_, eventName, userGestureListener);
          }
        };
        DeviceMotionEvent.requestPermission().then((permissionState) => {
          if (permissionState !== 'granted') {
            listenToUserGesturesAgain();
            return;
          }
          for (const eventName of userGestureEvents) {
            this.eventManager_.unlisten(
                this.container_, eventName, userGestureListener);
          }
          deviceOrientationListener = true;
          this.setupDeviceOrientationListener_();
        }).catch(listenToUserGesturesAgain);
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
   * Returns true if a VR gesture can start on this element. Gestures that
   * start on the controls (buttons, menus, seek bar) should not move the
   * view.
   *
   * @param {?EventTarget} target
   * @return {boolean}
   * @private
   */
  canStartGesture_(target) {
    if (target instanceof Element) {
      return !target.closest('.shaka-no-propagation');
    }
    return true;
  }

  /**
   * @param {!TouchEvent} event
   * @return {number}
   * @private
   */
  getPinchDistance_(event) {
    return Math.hypot(
        event.touches[0].clientX - event.touches[1].clientX,
        event.touches[0].clientY - event.touches[1].clientY);
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

/**
 * Amount of field of view change per pixel of pinch distance change.
 * The value is scaled down by 50 in shaka.ui.VRWebgl.zoom, so this results
 * in 0.1 degrees of field of view per pixel.
 *
 * @const {number}
 * @private
 */
shaka.ui.VRManager.PINCH_ZOOM_FACTOR_ = 5;
