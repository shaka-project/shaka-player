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

    /**
     * The last moves of the drag, to measure the speed of the view when the
     * pointer is released.
     * @private {!Array<{time: number, yaw: number, pitch: number}>}
     */
    this.recentMoves_ = [];

    /**
     * The speed of the view after a drag, in radians per millisecond, as
     * [yaw, pitch].
     * @private {!Array<number>}
     */
    this.inertia_ = [0, 0];

    /** @private {?number} */
    this.inertiaFrameId_ = null;

    /** @private {number} */
    this.lastInertiaTime_ = 0;

    /** @private {?number} */
    this.pinchDistance_ = null;

    /**
     * The position of the active pointers, and where they went down, by
     * pointer id.
     * @private {!Map<number,
     *     {x: number, y: number, startX: number, startY: number}>}
     */
    this.pointers_ = new Map();

    /**
     * True if the last gesture moved the view, so that the click that ends it
     * does not play or pause the video.
     * @private {boolean}
     */
    this.gestureMovedView_ = false;

    /**
     * When the last gesture that moved the view ended, in milliseconds.
     * @private {number}
     */
    this.lastMovingGestureTime_ = -Infinity;

    /**
     * The direction of each key that turns the view while it is held, as
     * [yaw, pitch].
     * @private {!Map<string, !Array<number>>}
     */
    this.lookDirections_ = new Map();

    /** @private {?number} */
    this.lookFrameId_ = null;

    /** @private {number} */
    this.lastLookTime_ = 0;

    /**
     * Listens to the release of the keys anywhere, so that the view does not
     * keep turning when the focus moves while a key is held.
     * @private {shaka.util.EventManager}
     */
    this.lookEventManager_ = new shaka.util.EventManager();

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

    /**
     * The stereo layout signaled in the content, if any.
     * @private {?shaka.ui.VRWebgl.StereoLayout}
     */
    this.vrStereoLayout_ = null;

    this.listenToContextLoss_();

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
      this.vrStereoLayout_ =
          shaka.ui.VRManager.toStereoLayout_(spatialInfo.stereoLayout);
      switch (spatialInfo.projection) {
        case null:
          // Only the stereo layout is signaled.
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
          this.vrStereoLayout_ = null;
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
      this.stopGestures_();
      this.eventManager_.release();
      this.eventManager_ = null;
    }
    this.stopLooking_();
    this.lookEventManager_?.release();
    this.lookEventManager_ = null;
    if (this.vrWebgl_) {
      this.vrWebgl_.release();
      this.vrWebgl_ = null;
    }
    this.video_.classList.remove('shaka-vr-video');

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
   * Get the angle of the north, which is the direction of the initial view.
   *
   * @return {?number} In degrees, from 0 to 360, increasing as the view turns
   *   to the right.
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
    const min = shaka.ui.VRWebgl.MIN_FIELD_OF_VIEW;
    const max = shaka.ui.VRWebgl.MAX_FIELD_OF_VIEW;
    if (fieldOfView < min) {
      shaka.log.alwaysWarn('Field of view should be at least ' + min);
    } else if (fieldOfView > max) {
      shaka.log.alwaysWarn('Field of view should be at most ' + max);
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
    this.dispatchStereoscopicModeChanged_();
  }

  /**
   * @private
   */
  dispatchStereoscopicModeChanged_() {
    this.dispatchEvent(new shaka.util.FakeEvent('stereoscopicmodechanged'));
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
   * Starts turning the view while a key is held.  Several keys can be held at
   * the same time, for example to look up and to the right.
   *
   * @param {string} key
   * @param {number} yaw 1 to look to the right, -1 to the left.
   * @param {number} pitch 1 to look up, -1 down.
   */
  startLooking(key, yaw, pitch) {
    if (!this.vrWebgl_ || !this.lookEventManager_) {
      return;
    }
    const wasLooking = this.lookDirections_.size > 0;
    this.lookDirections_.set(key.toLowerCase(), [yaw, pitch]);
    if (wasLooking) {
      return;
    }
    this.lookEventManager_.listen(window, 'keyup', (e) => {
      const event = /** @type {!KeyboardEvent} */ (e);
      this.lookDirections_.delete(event.key.toLowerCase());
      if (!this.lookDirections_.size) {
        this.stopLooking_();
      }
    });
    // The page does not get the release of the keys without the focus.
    this.lookEventManager_.listen(window, 'blur', () => this.stopLooking_());
    this.lastLookTime_ = shaka.ui.VRManager.now_();
    this.lookFrameId_ = requestAnimationFrame((time) => this.look_(time));
  }

  /**
   * @param {number} time
   * @private
   */
  look_(time) {
    if (!this.vrWebgl_) {
      this.stopLooking_();
      return;
    }
    // A long frame, as when the page was hidden, would make the view jump.
    const elapsed = Math.min(Math.max(time - this.lastLookTime_, 0), 100);
    this.lastLookTime_ = time;
    let yaw = 0;
    let pitch = 0;
    for (const direction of this.lookDirections_.values()) {
      yaw += direction[0];
      pitch += direction[1];
    }
    // The view turns slower when it is zoomed in, so that the image moves at
    // the same speed on the screen.
    const angle = this.vrWebgl_.getFieldOfView() *
        shaka.ui.VRManager.KEYBOARD_LOOK_SPEED_ * elapsed / 1000 *
        shaka.ui.VRManager.TO_RADIANS_;
    this.vrWebgl_.rotateViewGlobal(
        Math.sign(yaw) * angle, Math.sign(pitch) * angle, 0);
    this.lookFrameId_ = requestAnimationFrame((t) => this.look_(t));
  }

  /**
   * @private
   */
  stopLooking_() {
    this.lookDirections_.clear();
    this.lookEventManager_?.removeAll();
    if (this.lookFrameId_ != null) {
      cancelAnimationFrame(this.lookFrameId_);
      this.lookFrameId_ = null;
    }
  }

  /**
   * Zooms in or out by a step.
   *
   * @param {number} direction 1 to zoom in, -1 to zoom out.
   */
  zoomStep(direction) {
    if (!this.vrWebgl_) {
      return;
    }
    // The field of view stays in its range.
    this.vrWebgl_.setFieldOfView(this.vrWebgl_.getFieldOfView() -
        direction * shaka.ui.VRManager.KEYBOARD_ZOOM_STEP_);
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
        this.listenToContextLoss_();
      }
      const newProjectionMode =
          this.vrAsset_ || this.config_.defaultVrProjectionMode;
      const newHfov = this.vrHfov_ || 180;
      if (!this.vrWebgl_) {
        this.init_(newProjectionMode, newHfov);
        if (this.vrWebgl_) {
          this.canvas_.style.display = '';
          this.video_.classList.add('shaka-vr-video');
          this.dispatchEvent(new shaka.util.FakeEvent(
              'vrstatuschanged',
              (new Map()).set('newStatus', this.isPlayingVR())));
        } else {
          // Without WebGL there is nothing to display, and the status does
          // not change.
          this.canvas_.style.display = 'none';
        }
      } else {
        const currentProjectionMode = this.vrWebgl_.getProjectionMode();
        const hfovChanged = newProjectionMode == 'fisheye' &&
            this.vrWebgl_.getHfov() != newHfov;
        if (currentProjectionMode != newProjectionMode || hfovChanged) {
          const wasStereoscopic = this.vrWebgl_.isStereoscopicModeEnabled();
          this.stopGestures_();
          this.vrWebgl_.release();
          this.vrWebgl_ = null;
          this.init_(newProjectionMode, newHfov);
          // Re-initialization the status does not change, but the new view
          // starts without the stereoscopic mode.
          if (wasStereoscopic) {
            this.dispatchStereoscopicModeChanged_();
          }
        }
      }
      if (this.vrWebgl_) {
        this.vrWebgl_.setStereoLayout(this.getStereoLayout_());
      }
    } else if (this.canvas_ && this.vrWebgl_) {
      this.canvas_.style.display = 'none';
      this.video_.classList.remove('shaka-vr-video');
      this.stopGestures_();
      this.vrWebgl_.release();
      this.vrWebgl_ = null;
      this.dispatchEvent(new shaka.util.FakeEvent(
          'vrstatuschanged',
          (new Map()).set('newStatus', this.isPlayingVR())));
    }
  }

  /**
   * The browser can lose the WebGL context at any time, for example when the
   * GPU is reset or when a mobile browser reclaims its resources.  Prevent
   * the default action of the event, so that the context can be restored,
   * and recreate the WebGL resources when it is.
   *
   * @private
   */
  listenToContextLoss_() {
    if (!this.canvas_) {
      return;
    }
    this.loadEventManager_.listen(this.canvas_, 'webglcontextlost', (e) => {
      shaka.log.warning('VR WebGL context lost');
      e.preventDefault();
    });
    this.loadEventManager_.listen(this.canvas_, 'webglcontextrestored', () => {
      shaka.log.info('VR WebGL context restored');
      if (this.vrWebgl_) {
        this.vrWebgl_.restoreContext();
      }
    });
  }

  /**
   * The layout signaled in the content takes precedence over the one in the
   * configuration.
   *
   * @return {shaka.ui.VRWebgl.StereoLayout}
   * @private
   */
  getStereoLayout_() {
    return this.vrStereoLayout_ ||
        shaka.ui.VRManager.toStereoLayout_(
            this.config_.defaultVrStereoLayout) ||
        shaka.ui.VRWebgl.StereoLayout.MONO;
  }

  /**
   * @param {?string} stereoLayout As signaled in the content or the
   *   configuration.
   * @return {?shaka.ui.VRWebgl.StereoLayout} How to display it, or null if
   *   it is unknown.
   * @private
   */
  static toStereoLayout_(stereoLayout) {
    const StereoLayout = shaka.ui.VRWebgl.StereoLayout;
    switch (stereoLayout) {
      case 'mono':
        return StereoLayout.MONO;
      case 'multiview':
        // Each eye is a separate view of the bitstream, as in MV-HEVC.  The
        // browser decodes a single view, so the frames are mono.
        return StereoLayout.MONO;
      case 'top-bottom':
        return StereoLayout.TOP_BOTTOM;
      case 'left-right':
        return StereoLayout.LEFT_RIGHT;
      default:
        return null;
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
    this.setupGestureListeners_();

    // Detect device movement
    if (this.config_.enableVrDeviceMotion && window.DeviceOrientationEvent) {
      let deviceOrientationListener = false;
      // The permission is resolved asynchronously.  Ignore the result if this
      // view was released or replaced in the meantime.
      const vrWebgl = this.vrWebgl_;
      const isCurrentView = () => this.vrWebgl_ == vrWebgl;
      // See: https://dev.to/li/how-to-requestpermission-for-devicemotion-and-deviceorientation-events-in-ios-13-46g2
      if (typeof DeviceMotionEvent.requestPermission == 'function') {
        const userGestureEvents = ['click', 'mouseup'];
        if (navigator.maxTouchPoints > 0) {
          userGestureEvents.push('touchend');
        }
        const userGestureListener = () => {
          DeviceMotionEvent.requestPermission().then((newPermissionState) => {
            if (newPermissionState !== 'granted' ||
                deviceOrientationListener || !isCurrentView()) {
              return;
            }
            deviceOrientationListener = true;
            this.setupDeviceOrientationListener_();
          }).catch(() => {
            // The permission was not granted.
          });
        };
        const listenToUserGesturesAgain = () => {
          if (!isCurrentView()) {
            return;
          }
          this.eventManager_.unlistenMulti(
              this.container_, userGestureEvents, userGestureListener);
          this.eventManager_.listenOnceMulti(
              this.container_, userGestureEvents, userGestureListener);
        };
        DeviceMotionEvent.requestPermission().then((permissionState) => {
          if (!isCurrentView()) {
            return;
          }
          if (permissionState !== 'granted') {
            listenToUserGesturesAgain();
            return;
          }
          this.eventManager_.unlistenMulti(
              this.container_, userGestureEvents, userGestureListener);
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

      // The beta and gamma axes are relative to the device, so the one that
      // tilts the view up and down, and its sign, depend on how the screen
      // is rotated.
      let pitchDif;
      switch (shaka.ui.VRManager.getScreenOrientationAngle_()) {
        case 90:
          pitchDif = -gammaDif;
          break;
        case 180:
          pitchDif = -betaDif;
          break;
        case 270:
          pitchDif = gammaDif;
          break;
        default:
          pitchDif = betaDif;
          break;
      }
      this.vrWebgl_.rotateViewGlobal(
          alphaDif * toRadians * -1, pitchDif * toRadians, 0);
    });
  }

  /**
   * Returns the rotation of the screen, normalized to 0, 90, 180 or 270
   * degrees.
   *
   * @return {number}
   * @private
   */
  static getScreenOrientationAngle_() {
    // screen.orientation is missing on iOS before 16.4, unless the
    // orientation polyfill is installed.
    if (!screen.orientation) {
      return 0;
    }
    const angle = screen.orientation.angle % 360;
    return angle < 0 ? angle + 360 : angle;
  }

  /**
   * Pointer Events handle the mouse, touch and pen in the same way.  The
   * pointer is captured by the container, so a drag keeps moving the view
   * after the pointer leaves it.
   *
   * @private
   */
  setupGestureListeners_() {
    // Zoom
    this.eventManager_.listen(this.container_, 'wheel', (e) => {
      if (!this.pointers_.size && this.config_.enableVrWheelZoom &&
          this.canStartGesture_(e.target)) {
        const event = /** @type {!WheelEvent} */(e);
        this.vrWebgl_.zoom(event.deltaY);
        event.preventDefault();
        event.stopPropagation();
      }
    });

    if (!window.PointerEvent) {
      // Only old devices without a pointing device, such as Tizen 3 TVs,
      // lack Pointer Events.
      return;
    }

    // The browser must not pan or zoom the page while the view is dragged
    // or pinched.  Scrollable menus inside the container keep scrolling.
    this.container_.classList.add('shaka-vr-gestures');

    // Start
    this.eventManager_.listen(this.container_, 'pointerdown', (e) => {
      const event = /** @type {!PointerEvent} */(e);
      // Only the primary button of a mouse or pen, and any touch.
      if (event.button != 0 || !this.canStartGesture_(event.target)) {
        return;
      }
      if (!this.pointers_.size) {
        // Stopping a view that is still moving is not a click either.
        this.gestureMovedView_ = this.inertiaFrameId_ != null;
      } else {
        // A pinch.
        this.gestureMovedView_ = true;
      }
      this.pointers_.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
        startX: event.clientX,
        startY: event.clientY,
      });
      try {
        this.container_.setPointerCapture(event.pointerId);
      } catch (error) {
        // The pointer is no longer active.
      }
      this.updateGesture_();
    });

    // Move
    this.eventManager_.listen(this.container_, 'pointermove', (e) => {
      const event = /** @type {!PointerEvent} */(e);
      const pointer = this.pointers_.get(event.pointerId);
      if (!pointer) {
        return;
      }
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      // A click may move the pointer a little.
      if (Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY) >
          shaka.ui.VRManager.CLICK_MAX_DISTANCE_) {
        this.gestureMovedView_ = true;
      }
      if (this.pinchDistance_ != null) {
        const newPinchDistance = this.getPinchDistance_();
        this.vrWebgl_.zoom(
            (this.pinchDistance_ - newPinchDistance) *
            shaka.ui.VRManager.PINCH_ZOOM_FACTOR_);
        this.pinchDistance_ = newPinchDistance;
      } else if (this.onGesture_) {
        this.gestureMove_(pointer.x, pointer.y);
      }
    });

    // End.  The browser can also cancel a pointer, for example for a system
    // gesture, or release its capture.
    this.eventManager_.listenMulti(this.container_,
        ['pointerup', 'pointercancel', 'lostpointercapture'], (e) => {
          const event = /** @type {!PointerEvent} */(e);
          if (this.pointers_.delete(event.pointerId)) {
            if (!this.pointers_.size && this.gestureMovedView_) {
              this.lastMovingGestureTime_ = shaka.ui.VRManager.now_();
            }
            const wasPanning = this.onGesture_ && !this.pointers_.size;
            this.updateGesture_();
            // A cancelled pointer did not release the view.
            if (wasPanning && event.type == 'pointerup') {
              this.startInertia_();
            }
          }
        });
  }

  /**
   * Starts the gesture that matches the active pointers: one pointer pans the
   * view, and two pointers pinch to zoom.
   *
   * @private
   */
  updateGesture_() {
    this.stopInertia_();
    this.onGesture_ = false;
    this.pinchDistance_ = null;
    if (this.pointers_.size == 1) {
      // Start panning, or continue with the remaining finger after a pinch.
      const pointer = this.pointers_.values().next().value;
      this.gestureStart_(pointer.x, pointer.y);
    } else if (this.pointers_.size == 2) {
      this.pinchDistance_ = this.getPinchDistance_();
    }
  }

  /**
   * Stops listening to the gestures and to the device motion.
   *
   * @private
   */
  stopGestures_() {
    this.stopLooking_();
    this.eventManager_.removeAll();
    this.container_.classList.remove('shaka-vr-gestures');
    this.pointers_.clear();
    this.onGesture_ = false;
    this.pinchDistance_ = null;
    this.gestureMovedView_ = false;
    this.lastMovingGestureTime_ = -Infinity;
    this.stopInertia_();
  }

  /**
   * Tells if the click that ends the last gesture comes from moving the view,
   * by dragging, pinching or stopping it, instead of a click on the video.
   *
   * @return {boolean}
   */
  isClickFromGesture() {
    return this.gestureMovedView_;
  }

  /**
   * Tells if any of the clicks of a double click comes from moving the view.
   *
   * @return {boolean}
   */
  isDoubleClickFromGesture() {
    return this.gestureMovedView_ || shaka.ui.VRManager.now_() -
        this.lastMovingGestureTime_ < shaka.ui.VRManager.DOUBLE_CLICK_TIME_;
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
   * @return {number} The distance between the first two active pointers.
   * @private
   */
  getPinchDistance_() {
    const [first, second] = this.pointers_.values();
    return Math.hypot(first.x - second.x, first.y - second.y);
  }

  /**
   * @param {number} x
   * @param {number} y
   * @private
   */
  gestureStart_(x, y) {
    this.onGesture_ = true;
    this.recentMoves_ = [];
    this.prevX_ = x;
    this.prevY_ = y;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @private
   */
  gestureMove_(x, y) {
    // The view moves slower when it is zoomed in, so that the image follows
    // the pointer in the same way.
    const scale = -this.vrWebgl_.getFieldOfView() *
        shaka.ui.VRManager.DRAG_SPEED_ * shaka.ui.VRManager.TO_RADIANS_;
    const yaw = (x - this.prevX_) * scale;
    const pitch = (y - this.prevY_) * -scale;
    this.vrWebgl_.rotateViewGlobal(yaw, pitch, 0);

    this.prevX_ = x;
    this.prevY_ = y;

    const now = shaka.ui.VRManager.now_();
    this.recentMoves_.push({time: now, yaw, pitch});
    while (now - this.recentMoves_[0].time >
        shaka.ui.VRManager.INERTIA_SAMPLE_TIME_) {
      this.recentMoves_.shift();
    }
  }

  /**
   * Keeps the view moving after a drag, at the speed of its last moves, and
   * slows it down until it stops.
   *
   * @private
   */
  startInertia_() {
    const moves = this.recentMoves_;
    this.recentMoves_ = [];
    const now = shaka.ui.VRManager.now_();
    // The pointer did not move just before it was released.
    if (moves.length < 2 || now - moves[moves.length - 1].time >
        shaka.ui.VRManager.INERTIA_SAMPLE_TIME_ / 2) {
      return;
    }
    // The first move happened before the time of the samples.
    const duration = moves[moves.length - 1].time - moves[0].time;
    if (duration <= 0) {
      return;
    }
    let yaw = 0;
    let pitch = 0;
    for (const move of moves.slice(1)) {
      yaw += move.yaw;
      pitch += move.pitch;
    }
    this.inertia_ = [yaw / duration, pitch / duration];
    this.lastInertiaTime_ = now;
    this.inertiaFrameId_ =
        requestAnimationFrame((time) => this.inertiaStep_(time));
  }

  /**
   * @param {number} time
   * @private
   */
  inertiaStep_(time) {
    if (!this.vrWebgl_) {
      this.stopInertia_();
      return;
    }
    // A long frame, as when the page was hidden, would make the view jump.
    const elapsed = Math.min(Math.max(time - this.lastInertiaTime_, 0), 100);
    this.lastInertiaTime_ = time;
    this.vrWebgl_.rotateViewGlobal(
        this.inertia_[0] * elapsed, this.inertia_[1] * elapsed, 0);
    const decay =
        Math.exp(-elapsed / shaka.ui.VRManager.INERTIA_TIME_CONSTANT_);
    this.inertia_[0] *= decay;
    this.inertia_[1] *= decay;
    const speed = Math.hypot(this.inertia_[0], this.inertia_[1]);
    if (speed < shaka.ui.VRManager.INERTIA_MIN_SPEED_) {
      this.stopInertia_();
    } else {
      this.inertiaFrameId_ =
          requestAnimationFrame((t) => this.inertiaStep_(t));
    }
  }

  /**
   * @private
   */
  stopInertia_() {
    if (this.inertiaFrameId_ != null) {
      cancelAnimationFrame(this.inertiaFrameId_);
      this.inertiaFrameId_ = null;
    }
    this.inertia_ = [0, 0];
  }

  /**
   * @return {number} The current time, in milliseconds.
   * @private
   */
  static now_() {
    // Some old devices, such as some smart TVs, lack performance.now().
    return window.performance && window.performance.now ?
        window.performance.now() : Date.now();
  }
};

/**
 * How far a drag turns the view, in fields of view per pixel: 0.6 degrees
 * per pixel at the default field of view of 75 degrees.
 *
 * @const {number}
 * @private
 */
shaka.ui.VRManager.DRAG_SPEED_ = 0.6 / 75;

/**
 * The time before the release of a drag that gives the speed of the view,
 * in milliseconds.
 *
 * @const {number}
 * @private
 */
shaka.ui.VRManager.INERTIA_SAMPLE_TIME_ = 100;

/**
 * How fast the view slows down after a drag: its speed is divided by e every
 * this many milliseconds.
 *
 * @const {number}
 * @private
 */
shaka.ui.VRManager.INERTIA_TIME_CONSTANT_ = 300;

/**
 * The speed at which the view stops after a drag, in radians per
 * millisecond (about 1 degree per second).
 *
 * @const {number}
 * @private
 */
shaka.ui.VRManager.INERTIA_MIN_SPEED_ = Math.PI / 180 / 1000;

/**
 * How far a pointer can move during a click on the video, in pixels.  Past
 * that, the gesture moves the view instead.
 *
 * @const {number}
 * @private
 */
shaka.ui.VRManager.CLICK_MAX_DISTANCE_ = 4;

/**
 * How long after moving the view a double click is still ignored, in ms.  It
 * covers the time between the two clicks of most double clicks.
 *
 * @const {number}
 * @private
 */
shaka.ui.VRManager.DOUBLE_CLICK_TIME_ = 500;

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

/**
 * How fast the keyboard turns the view, in fields of view per second.
 *
 * @const {number}
 * @private
 */
shaka.ui.VRManager.KEYBOARD_LOOK_SPEED_ = 1;

/**
 * How much a key press zooms, in degrees of field of view.
 *
 * @const {number}
 * @private
 */
shaka.ui.VRManager.KEYBOARD_ZOOM_STEP_ = 5;
