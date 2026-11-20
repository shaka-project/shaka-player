/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('VRManager', () => {
  /** @type {!HTMLElement} */
  let container;
  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {!HTMLCanvasElement} */
  let canvas;
  /** @type {?} */
  let player;
  /** @type {?} */
  let controls;
  /** @type {shaka.ui.VRManager} */
  let vrManager;
  /** @type {!jasmine.Spy} */
  let rotateSpy;
  /** @type {!jasmine.Spy} */
  let zoomSpy;

  /**
   * Headless browsers have no WebGL, so the view gets a fake context.  Every
   * method of the fake context does nothing, and every constant is its own
   * name.
   *
   * @return {?}
   */
  function createFakeGl() {
    const implementations = {
      getShaderParameter: () => true,
      getProgramParameter: () => true,
      getAttribLocation: () => 0,
    };
    return new Proxy({}, {
      get: (target, prop) => {
        if (typeof prop != 'string') {
          return undefined;
        }
        if (/^[A-Z0-9_]+$/.test(prop)) {
          return prop;
        }
        return implementations[prop] || (() => ({}));
      },
    });
  }

  /**
   * @param {string} projectionMode
   * @param {boolean=} displayInVrMode
   * @return {shaka.extern.UIConfiguration}
   */
  function vrConfig(projectionMode, displayInVrMode = true) {
    return /** @type {shaka.extern.UIConfiguration} */ ({
      displayInVrMode,
      defaultVrProjectionMode: projectionMode,
      enableVrDeviceMotion: true,
      enableVrWheelZoom: false,
    });
  }

  /** @return {!shaka.ui.VRManager} */
  function createVRManager() {
    vrManager = new shaka.ui.VRManager(container, canvas, video,
        /** @type {?} */ (player), vrConfig('equirectangular'),
        /** @type {?} */ (controls));
    return vrManager;
  }

  /**
   * @param {number} beta
   * @param {number} gamma
   */
  function dispatchOrientation(beta, gamma) {
    // Safari does not allow constructing a DeviceOrientationEvent.
    const event = new Event('deviceorientation');
    Object.defineProperties(event, {
      alpha: {value: 0},
      beta: {value: beta},
      gamma: {value: gamma},
    });
    window.dispatchEvent(event);
  }

  /**
   * @param {string} type
   * @param {number} pointerId
   * @param {number} x
   * @param {number} y
   */
  function dispatchPointer(type, pointerId, x, y) {
    container.dispatchEvent(new PointerEvent(type, {
      pointerId,
      clientX: x,
      clientY: y,
      button: type == 'pointermove' ? -1 : 0,
      bubbles: true,
      cancelable: true,
    }));
  }

  beforeEach(() => {
    // The VR manager only looks for a WebGL context where the browser
    // supports WebGL.  The context itself is fake.
    if (!window.WebGLRenderingContext) {
      pending('WebGL is not available');
    }
    container = shaka.util.Dom.createHTMLElement('div');
    document.body.appendChild(container);
    video = shaka.test.UiUtils.createVideoElement();
    container.appendChild(video);
    canvas = shaka.util.Dom.asHTMLCanvasElement(
        document.createElement('canvas'));
    const gl = createFakeGl();
    /** @type {?} */ (canvas).getContext = () => gl;
    player = /** @type {?} */ (new shaka.util.FakeEventTarget());
    player.getLoadMode = () => shaka.Player.LoadMode.MEDIA_SOURCE;
    player.getVariantTracks = () => [];
    controls = /** @type {?} */ (new shaka.util.FakeEventTarget());
    controls.getCastProxy = () => ({isCasting: () => false});
    // The VR manager creates its own view, so spy on all instances.
    // eslint-disable-next-line no-restricted-syntax
    rotateSpy = spyOn(shaka.ui.VRWebgl.prototype, 'rotateViewGlobal');
    // eslint-disable-next-line no-restricted-syntax
    zoomSpy = spyOn(shaka.ui.VRWebgl.prototype, 'zoom');
  });

  afterEach(() => {
    vrManager?.release();
    vrManager = null;
    container?.remove();
  });

  describe('device orientation', () => {
    /** @type {number} */
    let angle;

    beforeEach(() => {
      angle = 0;
      if (!window.DeviceOrientationEvent) {
        pending('Device orientation events are not available');
      }
      // Some browsers do not have screen.orientation without the polyfill.
      if (!screen.orientation) {
        pending('screen.orientation is not available');
      }
      if (typeof DeviceMotionEvent.requestPermission == 'function') {
        spyOn(DeviceMotionEvent, 'requestPermission')
            .and.returnValue(Promise.resolve('granted'));
      }
      Object.defineProperty(screen.orientation, 'angle', {
        get: () => angle,
        configurable: true,
      });
    });

    afterEach(() => {
      if (screen.orientation) {
        delete /** @type {?} */ (screen.orientation).angle;
      }
    });

    /** @return {!Promise<number>} The pitch of the rotation, in degrees. */
    async function tiltDevice() {
      createVRManager();
      // Wait for the permission, where it is needed.
      await shaka.test.Util.shortDelay();
      dispatchOrientation(0, 0);
      rotateSpy.calls.reset();

      // beta tilts portrait screens, and gamma landscape screens.
      dispatchOrientation(2, 3);
      expect(rotateSpy).toHaveBeenCalledTimes(1);
      return rotateSpy.calls.argsFor(0)[1] * 180 / Math.PI;
    }

    const cases = [
      {angle: 0, expectedPitch: 2},
      {angle: 90, expectedPitch: -3},
      {angle: 180, expectedPitch: -2},
      {angle: 270, expectedPitch: 3},
      // Some browsers report the landscape secondary rotation as -90.
      {angle: -90, expectedPitch: 3},
    ];
    for (const {angle: testAngle, expectedPitch} of cases) {
      it('tilts the view with the screen at ' + testAngle, async () => {
        angle = testAngle;
        expect(await tiltDevice()).toBeCloseTo(expectedPitch, 5);
      });
    }

    it('tilts the view without screen.orientation', async () => {
      // As on iOS before 16.4.
      Object.defineProperty(screen, 'orientation', {
        value: null,
        configurable: true,
      });
      try {
        expect(await tiltDevice()).toBeCloseTo(2, 5);
      } finally {
        delete /** @type {?} */ (screen).orientation;
      }
    });
  });

  describe('device motion permission', () => {
    /** @type {!Array<function(string)>} */
    let resolvePermissions;
    /** @type {?} */
    let originalRequestPermission;

    beforeEach(() => {
      if (!window.DeviceOrientationEvent || !window.DeviceMotionEvent) {
        pending('Device motion events are not available');
      }
      resolvePermissions = [];
      // Only some browsers ask for the permission, so add it where it is
      // missing.
      originalRequestPermission = DeviceMotionEvent.requestPermission;
      DeviceMotionEvent.requestPermission = () => new Promise((resolve) => {
        resolvePermissions.push(resolve);
      });
    });

    afterEach(() => {
      if (originalRequestPermission) {
        DeviceMotionEvent.requestPermission = originalRequestPermission;
      } else {
        delete DeviceMotionEvent.requestPermission;
      }
    });

    it('ignores a permission granted after the release', async () => {
      createVRManager();
      vrManager.release();
      vrManager = null;

      for (const resolve of resolvePermissions) {
        resolve('granted');
      }
      // This would fail the test with an unhandled rejection.
      await shaka.test.Util.shortDelay();
    });

    it('listens once when the view is replaced', async () => {
      createVRManager();
      // A different projection replaces the view, which asks again.
      vrManager.configure(vrConfig('cubemap'));
      expect(resolvePermissions.length).toBe(2);

      for (const resolve of resolvePermissions) {
        resolve('granted');
      }
      await shaka.test.Util.shortDelay();
      dispatchOrientation(0, 0);
      rotateSpy.calls.reset();

      dispatchOrientation(2, 3);
      expect(rotateSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('keyboard look', () => {
    /** @type {!Array<function(number)>} */
    let frames;
    /** @type {!jasmine.Spy} */
    let cancelSpy;
    /** @type {number} */
    const start = 1000;

    beforeEach(() => {
      frames = [];
      spyOn(window, 'requestAnimationFrame').and.callFake((callback) => {
        frames.push(callback);
        return frames.length;
      });
      cancelSpy = spyOn(window, 'cancelAnimationFrame');
      spyOn(performance, 'now').and.returnValue(start);
    });

    /**
     * @param {number} time
     */
    function runFrame(time) {
      expect(frames.length).toBe(1);
      rotateSpy.calls.reset();
      frames.shift()(time);
    }

    /** @param {string} key */
    function releaseKey(key) {
      const event = new KeyboardEvent('keyup', {key});
      if (event.key != key) {
        // Tizen 3 ignores the key of the init dictionary.
        Object.defineProperty(event, 'key', {value: key});
      }
      window.dispatchEvent(event);
    }

    /**
     * @param {number} yaw
     * @param {number} pitch
     */
    function expectRotation(yaw, pitch) {
      expect(rotateSpy).toHaveBeenCalledTimes(1);
      const args = rotateSpy.calls.argsFor(0);
      expect(args[0]).toBeCloseTo(yaw, 10);
      expect(args[1]).toBeCloseTo(pitch, 10);
      expect(args[2]).toBe(0);
    }

    // 50 ms at one field of view of 75 degrees per second.
    const angle = 75 * 0.05 * Math.PI / 180;

    it('turns the view while a key is held', () => {
      createVRManager();
      vrManager.startLooking('d', 1, 0);
      runFrame(start + 50);
      expectRotation(angle, 0);

      // Two keys turn the view diagonally.
      vrManager.startLooking('w', 0, 1);
      runFrame(start + 100);
      expectRotation(angle, angle);

      // Shift changes the key of the release.
      releaseKey('D');
      runFrame(start + 150);
      expectRotation(0, angle);

      releaseKey('w');
      expect(cancelSpy).toHaveBeenCalled();
    });

    it('turns slower when zoomed in', () => {
      createVRManager();
      vrManager.setFieldOfView(30);
      vrManager.startLooking('a', -1, 0);
      runFrame(start + 50);
      expectRotation(-30 * 0.05 * Math.PI / 180, 0);
    });

    it('stops turning when the window loses the focus', () => {
      createVRManager();
      vrManager.startLooking('s', 0, -1);
      window.dispatchEvent(new Event('blur'));
      expect(cancelSpy).toHaveBeenCalled();

      // The key that was held does not turn the view any more.
      frames = [];
      vrManager.startLooking('a', -1, 0);
      runFrame(start + 50);
      expectRotation(-angle, 0);
    });

    it('stops turning when VR is disabled', () => {
      createVRManager();
      vrManager.startLooking('d', 1, 0);
      vrManager.configure(vrConfig('equirectangular', false));
      expect(cancelSpy).toHaveBeenCalled();
    });

    it('zooms by steps', () => {
      createVRManager();
      vrManager.zoomStep(1);
      expect(vrManager.getFieldOfView()).toBe(70);
      vrManager.zoomStep(-1);
      vrManager.zoomStep(-1);
      expect(vrManager.getFieldOfView()).toBe(80);
    });
  });

  describe('pointer gestures', () => {
    beforeEach(() => {
      if (!window.PointerEvent) {
        pending('Pointer Events are not available');
      }
    });

    it('pans the view while a pointer is down', () => {
      createVRManager();
      expect(container.classList.contains('shaka-vr-gestures')).toBe(true);

      dispatchPointer('pointermove', 1, 10, 10);
      expect(rotateSpy).not.toHaveBeenCalled();

      dispatchPointer('pointerdown', 1, 10, 10);
      dispatchPointer('pointermove', 1, 20, 10);
      expect(rotateSpy).toHaveBeenCalledTimes(1);

      dispatchPointer('pointerup', 1, 20, 10);
      dispatchPointer('pointermove', 1, 30, 10);
      expect(rotateSpy).toHaveBeenCalledTimes(1);
    });

    it('stops panning when the pointer is cancelled', () => {
      createVRManager();
      dispatchPointer('pointerdown', 1, 10, 10);
      dispatchPointer('pointercancel', 1, 10, 10);

      // A new touch starts from its own position.
      dispatchPointer('pointerdown', 2, 100, 100);
      dispatchPointer('pointermove', 2, 101, 100);
      expect(rotateSpy).toHaveBeenCalledTimes(1);
      const yaw = rotateSpy.calls.argsFor(0)[0];
      expect(yaw).toBeCloseTo(-0.6 * Math.PI / 180, 5);
    });

    it('zooms with two pointers', () => {
      createVRManager();
      dispatchPointer('pointerdown', 1, 0, 0);
      dispatchPointer('pointerdown', 2, 100, 0);
      dispatchPointer('pointermove', 2, 50, 0);
      expect(rotateSpy).not.toHaveBeenCalled();
      expect(zoomSpy).toHaveBeenCalledOnceWith(50 * 5);

      // The remaining pointer pans again.
      dispatchPointer('pointerup', 2, 50, 0);
      dispatchPointer('pointermove', 1, 10, 0);
      expect(rotateSpy).toHaveBeenCalledTimes(1);
    });

    it('ignores gestures that start on the controls', () => {
      createVRManager();
      const button = shaka.util.Dom.createHTMLElement('button');
      button.classList.add('shaka-no-propagation');
      container.appendChild(button);
      button.dispatchEvent(new PointerEvent('pointerdown', {
        pointerId: 1,
        button: 0,
        bubbles: true,
      }));
      dispatchPointer('pointermove', 1, 50, 50);
      expect(rotateSpy).not.toHaveBeenCalled();
    });

    it('stops the gestures when VR is disabled', () => {
      createVRManager();
      vrManager.configure(vrConfig('equirectangular', false));
      expect(vrManager.isPlayingVR()).toBe(false);
      expect(container.classList.contains('shaka-vr-gestures')).toBe(false);
    });
  });

  it('does not change the status without WebGL', () => {
    /** @type {?} */ (canvas).getContext = () => null;
    const onStatusChanged = jasmine.createSpy('onStatusChanged');
    createVRManager();
    vrManager.addEventListener(
        'vrstatuschanged', shaka.test.Util.spyFunc(onStatusChanged));
    vrManager.configure(vrConfig('cubemap'));
    expect(vrManager.isPlayingVR()).toBe(false);
    expect(onStatusChanged).not.toHaveBeenCalled();
    expect(canvas.style.display).toBe('none');
    expect(video.classList.contains('shaka-vr-video')).toBe(false);
  });

  it('marks the video while VR is displayed', () => {
    // The aspect ratio of the frames is not the one of the view.
    createVRManager();
    expect(video.classList.contains('shaka-vr-video')).toBe(true);

    vrManager.configure(vrConfig('equirectangular', false));
    expect(video.classList.contains('shaka-vr-video')).toBe(false);

    vrManager.configure(vrConfig('equirectangular'));
    expect(video.classList.contains('shaka-vr-video')).toBe(true);
    vrManager.release();
    vrManager = null;
    expect(video.classList.contains('shaka-vr-video')).toBe(false);
  });

  it('restores the view when the context is restored', () => {
    // eslint-disable-next-line no-restricted-syntax
    const restoreSpy = spyOn(shaka.ui.VRWebgl.prototype, 'restoreContext');
    createVRManager();

    const lost = new Event('webglcontextlost', {cancelable: true});
    canvas.dispatchEvent(lost);
    // Otherwise the browser does not restore the context.
    expect(lost.defaultPrevented).toBe(true);

    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(restoreSpy).toHaveBeenCalledTimes(1);
  });
});
