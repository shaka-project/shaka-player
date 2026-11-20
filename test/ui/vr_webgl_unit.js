/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Headless browsers have no WebGL, so these tests use a fake context.  Every
// method of the fake context is a spy, and every constant is its own name.
describe('VR', () => {
  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {!HTMLCanvasElement} */
  let canvas;
  /** @type {?} */
  let gl;
  /** @type {?} */
  let player;
  /** @type {boolean} */
  let contextLost;

  /**
   * @return {?}
   */
  function createFakeGl() {
    const values = {
      drawingBufferWidth: 100,
      drawingBufferHeight: 100,
    };
    const implementations = {
      createProgram: () => ({}),
      createShader: () => ({}),
      createBuffer: () => ({}),
      createTexture: () => ({}),
      getShaderParameter: () => true,
      getProgramParameter: () => true,
      getAttribLocation: () => 0,
      getUniformLocation: (program, name) => name,
      isContextLost: () => contextLost,
    };
    const spies = new Map();
    return new Proxy({}, {
      get: (target, prop) => {
        if (typeof prop != 'string') {
          return undefined;
        }
        if (prop in values) {
          return values[prop];
        }
        if (/^[A-Z0-9_]+$/.test(prop)) {
          return prop;
        }
        return spies.getOrInsertComputed(prop, () => {
          return jasmine.createSpy(prop).and.callFake(
              implementations[prop] || (() => {}));
        });
      },
    });
  }

  /**
   * @param {string} uniform
   * @return {!Float32Array} The last value of the uniform.
   */
  function lastUniform(uniform) {
    const calls = gl.uniformMatrix4fv.calls.allArgs()
        .filter((args) => args[0] == uniform);
    expect(calls.length).toBeGreaterThan(0);
    return calls[calls.length - 1][2];
  }

  /**
   * @param {!Float32Array} matrix
   * @param {!Float32Array} expected
   */
  function expectMatrixCloseTo(matrix, expected) {
    expect(matrix.length).toBe(expected.length);
    for (let i = 0; i < expected.length; i++) {
      expect(matrix[i]).toBeCloseTo(expected[i], 5);
    }
  }

  beforeEach(() => {
    contextLost = false;
    video = shaka.test.UiUtils.createVideoElement();
    // Pretend that a frame is available, so that the view is rendered.
    Object.defineProperty(video, 'readyState', {value: 4});
    canvas = shaka.util.Dom.asHTMLCanvasElement(
        document.createElement('canvas'));
    gl = createFakeGl();
    player = /** @type {?} */ (new shaka.util.FakeEventTarget());
    player.getLoadMode = () => shaka.Player.LoadMode.MEDIA_SOURCE;
    player.getVariantTracks = () => [];
  });

  describe('VRWebgl', () => {
    /** @type {shaka.ui.VRWebgl} */
    let vrWebgl;

    /**
     * @param {string} projectionMode
     * @return {!shaka.ui.VRWebgl}
     */
    function createVRWebgl(projectionMode) {
      vrWebgl = new shaka.ui.VRWebgl(video, /** @type {?} */ (player),
          canvas, /** @type {!WebGLRenderingContext} */ (gl), projectionMode);
      return vrWebgl;
    }

    beforeEach(() => {
      jasmine.clock().install();
    });

    afterEach(() => {
      vrWebgl?.release();
      vrWebgl = null;
      jasmine.clock().uninstall();
    });

    it('resets the cubemap view', () => {
      createVRWebgl('cubemap');
      const identity = shaka.ui.Matrix4x4.create();

      vrWebgl.rotateViewGlobal(1, 0.3, 0);
      const rotated = lastUniform('uModelViewMatrix');
      expect(Array.from(rotated)).not.toEqual(Array.from(identity));

      vrWebgl.reset();
      jasmine.clock().tick(1000);
      vrWebgl.rotateViewGlobal(0, 0, 0);
      expectMatrixCloseTo(lastUniform('uModelViewMatrix'), identity);
    });

    it('resets the view the shortest way', () => {
      // The cube uses the view matrix as is, so its rotation angle is the
      // angle to the initial view.
      createVRWebgl('cubemap');
      /** @return {number} In degrees. */
      const viewAngle = () => {
        const m = lastUniform('uModelViewMatrix');
        const cos = (m[0] + m[5] + m[10] - 1) / 2;
        return Math.acos(Math.min(Math.max(cos, -1), 1)) * 180 / Math.PI;
      };
      const toRadians = Math.PI / 180;
      // 200 degrees to one side are 160 degrees to the other side.
      for (let i = 0; i < 20; i++) {
        vrWebgl.rotateViewGlobal(10 * toRadians, 0, 0);
      }
      expect(viewAngle()).toBeCloseTo(160, 3);

      vrWebgl.reset();
      // The long way would go through 180 degrees.  The shortest way gets
      // closer to the initial view at every step of the animation.
      let previousAngle = viewAngle();
      expect(previousAngle).toBeLessThan(160);
      for (let i = 0; i < 20; i++) {
        jasmine.clock().tick(25);
        const angle = viewAngle();
        expect(angle).toBeLessThanOrEqual(previousAngle + 1e-3);
        previousAngle = angle;
      }

      jasmine.clock().tick(1000);
      expect(viewAngle()).toBeCloseTo(0, 3);
    });

    it('keeps the field of view in its range', () => {
      createVRWebgl('equirectangular');

      vrWebgl.setFieldOfView(0);
      expect(vrWebgl.getFieldOfView()).toBe(shaka.ui.VRWebgl.MIN_FIELD_OF_VIEW);

      vrWebgl.zoom(1e6);
      expect(vrWebgl.getFieldOfView()).toBe(shaka.ui.VRWebgl.MAX_FIELD_OF_VIEW);

      vrWebgl.setFieldOfView(50);
      expect(vrWebgl.getFieldOfView()).toBe(50);
    });

    it('deletes its WebGL resources on release', () => {
      createVRWebgl('equirectangular');
      vrWebgl.release();
      vrWebgl = null;

      expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
      expect(gl.deleteShader).toHaveBeenCalledTimes(2);
      expect(gl.deleteBuffer).toHaveBeenCalledTimes(3);
      expect(gl.deleteTexture).toHaveBeenCalledTimes(1);
    });

    it('does not draw while the context is lost', () => {
      createVRWebgl('equirectangular');
      gl.drawElements.calls.reset();

      contextLost = true;
      vrWebgl.rotateViewGlobal(0.1, 0, 0);
      expect(gl.drawElements).not.toHaveBeenCalled();
    });

    it('recreates its resources and keeps the view on restore', () => {
      createVRWebgl('equirectangular');
      vrWebgl.setFieldOfView(42);
      vrWebgl.toggleStereoscopicMode();
      expect(gl.createProgram).toHaveBeenCalledTimes(1);

      gl.drawElements.calls.reset();
      vrWebgl.restoreContext();

      expect(gl.createProgram).toHaveBeenCalledTimes(2);
      expect(gl.createTexture).toHaveBeenCalledTimes(2);
      expect(gl.drawElements).toHaveBeenCalled();
      expect(vrWebgl.getFieldOfView()).toBe(42);
      expect(vrWebgl.isStereoscopicModeEnabled()).toBe(true);
    });

    it('stops a fast drag at the pitch boundary', () => {
      // The cube uses the view matrix as is.
      createVRWebgl('cubemap');
      // More than 90 degrees in a single move.
      vrWebgl.rotateViewGlobal(0, 2, 0);
      const m = lastUniform('uModelViewMatrix');
      // The view looks straight up or down, instead of not moving.
      const forwardY = -m[6];
      expect(Math.abs(forwardY)).toBeCloseTo(1, 5);
    });

    it('measures the north as the view turns', () => {
      createVRWebgl('equirectangular');
      const toRadians = Math.PI / 180;
      expect(vrWebgl.getNorth()).toBeCloseTo(0, 3);

      vrWebgl.rotateViewGlobal(30 * toRadians, 0, 0);
      expect(vrWebgl.getNorth()).toBeCloseTo(30, 3);

      // Turning to the other side does not give the same angle.
      vrWebgl.rotateViewGlobal(-60 * toRadians, 0, 0);
      expect(vrWebgl.getNorth()).toBeCloseTo(330, 3);

      // Looking up does not change the north.
      vrWebgl.rotateViewGlobal(0, 40 * toRadians, 0);
      expect(vrWebgl.getNorth()).toBeCloseTo(330, 3);
    });

    it('renders on animation frames without video frame callbacks', () => {
      // eslint-disable-next-line no-restricted-syntax
      spyOn(shaka.util.VideoFrameCallbackHandler.prototype, 'start')
          .and.returnValue(false);
      /** @type {!Array<function(number)>} */
      const frames = [];
      const requestSpy = spyOn(window, 'requestAnimationFrame')
          .and.callFake((callback) => frames.push(callback));
      const cancelSpy = spyOn(window, 'cancelAnimationFrame');
      let currentTime = 0;
      Object.defineProperty(video, 'currentTime', {get: () => currentTime});

      createVRWebgl('equirectangular');
      video.dispatchEvent(new Event('playing'));
      expect(requestSpy).toHaveBeenCalled();

      gl.texImage2D.calls.reset();
      frames.shift()(0);
      expect(gl.texImage2D).toHaveBeenCalledTimes(1);

      // Without a new video frame, the texture is not uploaded again.
      frames.shift()(0);
      expect(gl.texImage2D).toHaveBeenCalledTimes(1);

      currentTime = 0.04;
      frames.shift()(0);
      expect(gl.texImage2D).toHaveBeenCalledTimes(2);

      video.dispatchEvent(new Event('pause'));
      expect(cancelSpy).toHaveBeenCalled();
    });
  });
});
