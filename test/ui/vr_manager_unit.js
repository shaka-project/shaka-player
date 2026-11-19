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
   * @return {shaka.extern.UIConfiguration}
   */
  function vrConfig(projectionMode) {
    return /** @type {shaka.extern.UIConfiguration} */ ({
      displayInVrMode: true,
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

  beforeEach(() => {
    // The VR manager only looks for a WebGL context where the browser
    // supports WebGL.  The context itself is fake.
    if (!window.WebGLRenderingContext || !window.DeviceOrientationEvent) {
      pending('WebGL or device orientation events are not available');
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
});
