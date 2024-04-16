/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.VRUtils');


shaka.ui.VRUtils = class {
  /**
   * @param {number} resolution
   * @param {boolean=} semisphere
   * @return {{vertices: !Array.<number>, texCoords: !Array.<number>,
   *          indices: !Array.<number>}}
   */
  static generateSphere(resolution, semisphere = false) {
    /** @type {!Array.<number>} */
    const vertices = [];
    /** @type {!Array.<number>} */
    const texCoords = [];
    /** @type {!Array.<number>} */
    const indices = [];

    let phiMax = Math.PI;
    if (semisphere) {
      phiMax = Math.PI / 2;
    }

    for (let i = 0; i <= resolution; i++) {
      const v = i / resolution;
      const phi = v * phiMax;
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);

      for (let j = 0; j <= resolution; j++) {
        const u = j / resolution;
        const theta = u * Math.PI * 2;

        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        const x = -1 * cosTheta * sinPhi;
        const y = cosPhi;
        const z = sinTheta * sinPhi;

        vertices.push(x, y, z);

        texCoords.push(u);
        texCoords.push(v);
      }
    }

    for (let i = 0; i < resolution; i++) {
      for (let j = 0; j < resolution; j++) {
        const a = i * (resolution + 1) + j;
        const b = a + 1;
        const c = (i + 1) * (resolution + 1) + j;
        const d = c + 1;

        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    return {vertices, texCoords, indices};
  }
};

/**
 * Sphere vertex shader.
 *
 * @constant {string}
 */
shaka.ui.VRUtils.VERTEX_SPHERE_SHADER =
`attribute vec4 a_vPosition;
// Per-vertex texture coordinate info
attribute vec2 a_TexCoordinate;
uniform mat4 u_VPMatrix;
// Passed into the fragment shader.
varying vec2 v_TexCoordinate;
varying vec3 pass_position;
void main()
{
 gl_Position = u_VPMatrix * a_vPosition;
 // Pass through texture coord
 v_TexCoordinate = a_TexCoordinate;
 pass_position = a_vPosition.xyz;
}`;

/**
 * Sphere fragment shader.
 *
 * @constant {string}
 */
shaka.ui.VRUtils.FRAGMENT_SPHERE_SHADER =
`precision highp float;
#define PI 3.141592653589793238462643383279
varying vec2 v_TexCoordinate;
varying vec3 pass_position;
uniform sampler2D uSampler;
void main(void) {
highp float xValue =
      (PI + atan(pass_position.z, pass_position.x)) / (2.0 * PI);
 vec2 tc = vec2(xValue, v_TexCoordinate.t);
 tc = vec2(tc.x , tc.y);
highp vec4 texelColor =
      texture2D(uSampler, tc);
  gl_FragColor = vec4(texelColor.rgb, texelColor.a);
}`;


shaka.ui.VRUtils.TO_RADIANS = Math.PI / 180;

