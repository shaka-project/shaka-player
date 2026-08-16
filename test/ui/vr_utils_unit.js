/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('VRUtils', () => {
  const VRUtils = shaka.ui.VRUtils;

  describe('generateFisheye', () => {
    const RESOLUTION = 100;

    /**
     * Returns the texture coordinates of the mesh vertex closest to the
     * given direction, expressed as (forward, up, right) components.
     *
     * @param {{vertices: !Array<number>, textureCoords: !Array<number>,
     *         indices: !Array<number>}} mesh
     * @param {number} forward
     * @param {number} up
     * @param {number} right
     * @return {!Array<number>}
     */
    function uvAtDirection(mesh, forward, up, right) {
      let best = 0;
      let bestDistance = Infinity;
      for (let i = 0; i < mesh.vertices.length; i += 3) {
        const distance = Math.pow(mesh.vertices[i] - forward, 2) +
            Math.pow(mesh.vertices[i + 1] - up, 2) +
            Math.pow(mesh.vertices[i + 2] - right, 2);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = i / 3;
        }
      }
      return [mesh.textureCoords[2 * best], mesh.textureCoords[2 * best + 1]];
    }

    it('uses the same geometry as the semi-sphere', () => {
      const fisheye = VRUtils.generateFisheye(RESOLUTION, /* fov= */ 180);
      const semiSphere = VRUtils.generateSphere(
          RESOLUTION, /* isSemiSphere= */ true);
      expect(fisheye.vertices).toEqual(semiSphere.vertices);
      expect(fisheye.indices).toEqual(semiSphere.indices);
      expect(fisheye.textureCoords.length)
          .toBe(semiSphere.textureCoords.length);
    });

    it('maps directions to the image circle for a 180 degree lens', () => {
      const mesh = VRUtils.generateFisheye(RESOLUTION, /* fov= */ 180);
      // The view direction samples the center of the image.
      expect(uvAtDirection(mesh, 1, 0, 0)[0]).toBeCloseTo(0.5, 5);
      expect(uvAtDirection(mesh, 1, 0, 0)[1]).toBeCloseTo(0.5, 5);
      // 90 degrees to the right samples the right edge of the circle.
      expect(uvAtDirection(mesh, 0, 0, 1)[0]).toBeCloseTo(1, 5);
      expect(uvAtDirection(mesh, 0, 0, 1)[1]).toBeCloseTo(0.5, 5);
      // 90 degrees to the left samples the left edge of the circle.
      expect(uvAtDirection(mesh, 0, 0, -1)[0]).toBeCloseTo(0, 5);
      expect(uvAtDirection(mesh, 0, 0, -1)[1]).toBeCloseTo(0.5, 5);
      // 90 degrees up samples the top edge of the circle. (v=0 is the top
      // row of the video.)
      expect(uvAtDirection(mesh, 0, 1, 0)[0]).toBeCloseTo(0.5, 5);
      expect(uvAtDirection(mesh, 0, 1, 0)[1]).toBeCloseTo(0, 5);
      // 90 degrees down samples the bottom edge of the circle.
      expect(uvAtDirection(mesh, 0, -1, 0)[0]).toBeCloseTo(0.5, 5);
      expect(uvAtDirection(mesh, 0, -1, 0)[1]).toBeCloseTo(1, 5);
      // The mapping is equidistant: 45 degrees off-axis lands halfway to
      // the edge.
      const sqrt = Math.SQRT1_2;
      expect(uvAtDirection(mesh, sqrt, 0, sqrt)[0]).toBeCloseTo(0.75, 5);
      expect(uvAtDirection(mesh, sqrt, 0, sqrt)[1]).toBeCloseTo(0.5, 5);
    });

    it('never samples outside the image circle for a 180 degree lens', () => {
      const mesh = VRUtils.generateFisheye(RESOLUTION, /* fov= */ 180);
      for (let i = 0; i < mesh.textureCoords.length; i += 2) {
        const radial = Math.hypot(mesh.textureCoords[i] - 0.5,
            mesh.textureCoords[i + 1] - 0.5);
        expect(radial).toBeLessThanOrEqual(0.5001);
      }
    });

    it('scales the image circle with the field of view', () => {
      const mesh = VRUtils.generateFisheye(RESOLUTION, /* fov= */ 140);
      // With a 140 degree lens, a direction 70 degrees off-axis samples the
      // edge of the image.
      const angle = 70 * Math.PI / 180;
      const uv = uvAtDirection(mesh, Math.cos(angle), 0, Math.sin(angle));
      expect(uv[0]).toBeCloseTo(1, 2);
      expect(uv[1]).toBeCloseTo(0.5, 2);
    });
  });

  describe('generateCube', () => {
    it('insets every face by the given amount', () => {
      const plain = VRUtils.generateCube();
      const uInset = 0.01;
      const vInset = 0.02;
      const inset = VRUtils.generateCube(uInset, vInset);
      expect(inset.vertices).toEqual(plain.vertices);
      expect(inset.indices).toEqual(plain.indices);
      expect(inset.textureCoords.length).toBe(plain.textureCoords.length);
      // 6 faces with 4 (u, v) pairs each.
      for (let face = 0; face < plain.textureCoords.length; face += 8) {
        let minU = 1;
        let maxU = 0;
        let minV = 1;
        let maxV = 0;
        for (let corner = 0; corner < 8; corner += 2) {
          minU = Math.min(minU, plain.textureCoords[face + corner]);
          maxU = Math.max(maxU, plain.textureCoords[face + corner]);
          minV = Math.min(minV, plain.textureCoords[face + corner + 1]);
          maxV = Math.max(maxV, plain.textureCoords[face + corner + 1]);
        }
        for (let corner = 0; corner < 8; corner += 2) {
          const u = inset.textureCoords[face + corner];
          const v = inset.textureCoords[face + corner + 1];
          // Each coordinate moves towards the center of the face by exactly
          // the inset, so it no longer touches the edge shared with the
          // adjacent face of the atlas.
          expect(Math.abs(u - plain.textureCoords[face + corner]))
              .toBeCloseTo(uInset, 10);
          expect(u).toBeGreaterThan(minU);
          expect(u).toBeLessThan(maxU);
          expect(Math.abs(v - plain.textureCoords[face + corner + 1]))
              .toBeCloseTo(vInset, 10);
          expect(v).toBeGreaterThan(minV);
          expect(v).toBeLessThan(maxV);
        }
      }
    });

    it('does not modify the coordinates without an inset', () => {
      const mesh = VRUtils.generateCube();
      // The faces of a 3x2 atlas touch the edges of the grid.
      expect(mesh.textureCoords).toContain(0);
      expect(mesh.textureCoords).toContain(1 / 3);
      expect(mesh.textureCoords).toContain(2 / 3);
      expect(mesh.textureCoords).toContain(0.5);
      expect(mesh.textureCoords).toContain(1);
    });
  });

  describe('shaders', () => {
    /** @type {?WebGLRenderingContext} */
    let gl;

    beforeAll(() => {
      const canvas = /** @type {!HTMLCanvasElement} */(
        document.createElement('canvas'));
      gl = /** @type {?WebGLRenderingContext} */(
        canvas.getContext('webgl') || canvas.getContext('webgl2'));
    });

    /**
     * @param {string} vertexSource
     * @param {string} fragmentSource
     */
    function expectShadersToLink(vertexSource, fragmentSource) {
      if (!gl) {
        pending('WebGL is not available.');
      }
      const vertexShader = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vertexShader, vertexSource);
      gl.compileShader(vertexShader);
      expect(gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS))
          .withContext(gl.getShaderInfoLog(vertexShader) || '')
          .toBe(true);

      const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fragmentShader, fragmentSource);
      gl.compileShader(fragmentShader);
      expect(gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS))
          .withContext(gl.getShaderInfoLog(fragmentShader) || '')
          .toBe(true);

      const program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      expect(gl.getProgramParameter(program, gl.LINK_STATUS))
          .withContext(gl.getProgramInfoLog(program) || '')
          .toBe(true);
    }

    it('compiles the sphere shaders', () => {
      expectShadersToLink(VRUtils.VERTEX_SPHERE_SHADER,
          VRUtils.FRAGMENT_SPHERE_SHADER);
    });

    it('compiles the semi-sphere shaders', () => {
      expectShadersToLink(VRUtils.VERTEX_SPHERE_SHADER,
          VRUtils.FRAGMENT_SEMI_SPHERE_SHADER);
    });

    it('compiles the fisheye shaders', () => {
      expectShadersToLink(VRUtils.VERTEX_SPHERE_SHADER,
          VRUtils.FRAGMENT_FISHEYE_SHADER);
    });

    it('compiles the cube shaders', () => {
      expectShadersToLink(VRUtils.VERTEX_CUBE_SHADER,
          VRUtils.FRAGMENT_CUBE_SHADER);
    });
  });
});
