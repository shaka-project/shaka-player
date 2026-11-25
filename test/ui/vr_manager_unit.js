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
   * method of the fake context does nothing.
   *
   * @return {?}
   */
  function createFakeGl() {
    const implementations = {
      getShaderParameter: () => true,
      getProgramParameter: () => true,
      getAttribLocation: () => 0,
    };
    return shaka.test.UiUtils.createFakeWebGl(
        (name) => implementations[name] || (() => ({})));
  }

  /**
   * @param {string} projectionMode
   * @param {boolean=} displayInVrMode
   * @param {string=} stereoLayout
   * @return {shaka.extern.UIConfiguration}
   */
  function vrConfig(projectionMode, displayInVrMode = true,
      stereoLayout = 'mono') {
    return /** @type {shaka.extern.UIConfiguration} */ ({
      displayInVrMode,
      defaultVrProjectionMode: projectionMode,
      defaultVrStereoLayout: stereoLayout,
      enableVrDeviceMotion: true,
      enableVrWheelZoom: false,
    });
  }

  /**
   * @param {string=} stereoLayout
   * @return {!shaka.ui.VRManager}
   */
  function createVRManager(stereoLayout = 'mono') {
    vrManager = new shaka.ui.VRManager(container, canvas, video,
        /** @type {?} */ (player),
        vrConfig('equirectangular', true, stereoLayout),
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

    it('stops the directions of buttons one by one', () => {
      createVRManager();
      vrManager.startLooking('vr-pad-left', -1, 0);
      vrManager.startLooking('vr-pad-up', 0, 1);
      // Releasing a key does not stop a button.
      releaseKey('a');
      runFrame(start + 50);
      expectRotation(-angle, angle);

      vrManager.stopLooking('vr-pad-up');
      expect(cancelSpy).not.toHaveBeenCalled();
      runFrame(start + 100);
      expectRotation(-angle, 0);

      // A direction that is not held changes nothing.
      vrManager.stopLooking('vr-pad-down');
      expect(cancelSpy).not.toHaveBeenCalled();
    });

    it('lets the view slow down after the last button', () => {
      // One field of view of 75 degrees per second, in radians per ms.
      const speed = 75 / 1000 * Math.PI / 180;
      createVRManager();
      vrManager.startLooking('vr-pad-right', 1, 0);
      runFrame(start + 50);

      // The frame of the look was canceled, and the inertia asks for another.
      frames = [];
      vrManager.stopLooking('vr-pad-right');
      expect(cancelSpy).toHaveBeenCalled();
      runFrame(start + 16);
      expectRotation(speed * 16, 0);
      runFrame(start + 32);
      const slower = rotateSpy.calls.argsFor(0)[0];
      expect(slower).toBeGreaterThan(0);
      expect(slower).toBeLessThan(speed * 16);

      // Holding a button again stops it.
      cancelSpy.calls.reset();
      vrManager.startLooking('vr-pad-up', 0, 1);
      expect(cancelSpy).toHaveBeenCalled();
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

    it('pans slower when zoomed in', () => {
      createVRManager();
      vrManager.setFieldOfView(30);
      dispatchPointer('pointerdown', 1, 100, 100);
      dispatchPointer('pointermove', 1, 101, 100);
      const yaw = rotateSpy.calls.argsFor(0)[0];
      expect(yaw).toBeCloseTo(-0.6 * 30 / 75 * Math.PI / 180, 5);
    });

    describe('inertia', () => {
      /** @type {number} */
      let now;
      /** @type {!Array<function(number)>} */
      let frames;
      /** @type {!jasmine.Spy} */
      let cancelSpy;

      // 0.6 degrees per pixel, 10 pixels every 10 ms.
      const speed = -0.6 * Math.PI / 180;

      beforeEach(() => {
        now = 0;
        frames = [];
        spyOn(performance, 'now').and.callFake(() => now);
        spyOn(window, 'requestAnimationFrame').and.callFake((callback) => {
          frames.push(callback);
          return frames.length;
        });
        cancelSpy = spyOn(window, 'cancelAnimationFrame');
      });

      /** @param {number} endTime */
      function drag(endTime) {
        createVRManager();
        dispatchPointer('pointerdown', 1, 0, 0);
        for (let x = 10; x <= 30; x += 10) {
          now = x;
          dispatchPointer('pointermove', 1, x, 0);
        }
        now = endTime;
        rotateSpy.calls.reset();
      }

      /**
       * @param {number} time
       * @return {number} The yaw of the frame.
       */
      function runFrame(time) {
        expect(frames.length).toBe(1);
        rotateSpy.calls.reset();
        frames.shift()(time);
        expect(rotateSpy).toHaveBeenCalledTimes(1);
        return rotateSpy.calls.argsFor(0)[0];
      }

      it('keeps the view moving after a drag and slows it down', () => {
        drag(30);
        dispatchPointer('pointerup', 1, 30, 0);

        // The view keeps the speed of the drag.
        expect(runFrame(46)).toBeCloseTo(speed * 16, 5);
        let previous = Infinity;
        for (let time = 62; frames.length; time += 16) {
          const yaw = Math.abs(runFrame(time));
          expect(yaw).toBeLessThan(previous);
          previous = yaw;
        }
        // The view stops.
        expect(previous).toBeLessThan(0.001);
      });

      it('does not move after the pointer stopped', () => {
        drag(200);
        dispatchPointer('pointerup', 1, 30, 0);
        expect(frames.length).toBe(0);
      });

      it('does not move after a cancelled pointer', () => {
        drag(30);
        dispatchPointer('pointercancel', 1, 30, 0);
        expect(frames.length).toBe(0);
      });

      it('stops when the view is touched again', () => {
        drag(30);
        dispatchPointer('pointerup', 1, 30, 0);
        expect(frames.length).toBe(1);

        dispatchPointer('pointerdown', 2, 50, 50);
        expect(cancelSpy).toHaveBeenCalledWith(1);
      });

      it('stops when VR is disabled', () => {
        drag(30);
        dispatchPointer('pointerup', 1, 30, 0);
        vrManager.configure(vrConfig('equirectangular', false));
        expect(cancelSpy).toHaveBeenCalledWith(1);
      });
    });

    describe('clicks', () => {
      /** @type {number} */
      let now;

      beforeEach(() => {
        now = 1000;
        spyOn(performance, 'now').and.callFake(() => now);
        // The inertia only runs when a test asks for its frame.
        spyOn(window, 'requestAnimationFrame').and.returnValue(1);
        spyOn(window, 'cancelAnimationFrame');
      });

      /**
       * @param {number} x The position of the release.
       */
      function click(x) {
        dispatchPointer('pointerdown', 1, 0, 0);
        dispatchPointer('pointermove', 1, x, 0);
        dispatchPointer('pointerup', 1, x, 0);
      }

      it('are clicks on the video if the pointer barely moves', () => {
        createVRManager();
        click(3);
        expect(vrManager.isClickFromGesture()).toBe(false);
        expect(vrManager.isDoubleClickFromGesture()).toBe(false);
      });

      it('come from a gesture after a drag', () => {
        createVRManager();
        click(20);
        expect(vrManager.isClickFromGesture()).toBe(true);
        expect(vrManager.isDoubleClickFromGesture()).toBe(true);

        // The next click is a click on the video, but not a double click with
        // the drag.
        now += 300;
        click(0);
        expect(vrManager.isClickFromGesture()).toBe(false);
        expect(vrManager.isDoubleClickFromGesture()).toBe(true);

        now += 300;
        expect(vrManager.isDoubleClickFromGesture()).toBe(false);
      });

      it('come from a gesture after a pinch', () => {
        createVRManager();
        dispatchPointer('pointerdown', 1, 0, 0);
        dispatchPointer('pointerdown', 2, 100, 0);
        dispatchPointer('pointerup', 2, 100, 0);
        dispatchPointer('pointerup', 1, 0, 0);
        expect(vrManager.isClickFromGesture()).toBe(true);
      });

      it('come from a gesture when they stop a moving view', () => {
        createVRManager();
        // A fast drag lets the view keep moving.
        dispatchPointer('pointerdown', 1, 0, 0);
        for (let x = 10; x <= 30; x += 10) {
          now += 10;
          dispatchPointer('pointermove', 1, x, 0);
        }
        dispatchPointer('pointerup', 1, 30, 0);
        expect(window.requestAnimationFrame).toHaveBeenCalled();

        click(0);
        expect(vrManager.isClickFromGesture()).toBe(true);
      });
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

  it('prefers the stereo layout of the content', () => {
    const StereoLayout = shaka.ui.VRWebgl.StereoLayout;
    // eslint-disable-next-line no-restricted-syntax
    const layoutSpy = spyOn(shaka.ui.VRWebgl.prototype, 'setStereoLayout')
        .and.callThrough();
    /** @param {?string} stereoLayout */
    const dispatchInfo = (stereoLayout) => {
      player.dispatchEvent(new shaka.util.FakeEvent('spatialvideoinfo',
          (new Map()).set('detail', {
            projection: 'equi',
            hfov: null,
            stereoLayout,
          })));
    };
    /** @return {shaka.ui.VRWebgl.StereoLayout} */
    const lastLayout = () => layoutSpy.calls.mostRecent().args[0];

    createVRManager('top-bottom');
    expect(lastLayout()).toBe(StereoLayout.TOP_BOTTOM);

    // MV-HEVC frames hold a single view.
    dispatchInfo('multiview');
    expect(lastLayout()).toBe(StereoLayout.MONO);

    dispatchInfo('left-right');
    expect(lastLayout()).toBe(StereoLayout.LEFT_RIGHT);

    // Without a signaled layout, the configuration applies.
    dispatchInfo(null);
    expect(lastLayout()).toBe(StereoLayout.TOP_BOTTOM);

    player.dispatchEvent(new shaka.util.FakeEvent('nospatialvideoinfo'));
    vrManager.configure(vrConfig('equirectangular', true, 'left-right'));
    expect(lastLayout()).toBe(StereoLayout.LEFT_RIGHT);
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
