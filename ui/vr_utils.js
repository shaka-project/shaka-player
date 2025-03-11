/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.VRUtils');


shaka.ui.VRUtils = class {
  /**
   * @param {number} resolution
   * @param {boolean=} isSemiSphere
   * @return {{vertices: !Array<number>, textureCoords: !Array<number>,
   *          indices: !Array<number>}}
   */
  static generateSphere(resolution, isSemiSphere = false) {
    /** @type {!Array<number>} */
    const vertices = [];
    /** @type {!Array<number>} */
    const textureCoords = [];
    /** @type {!Array<number>} */
    const indices = [];

    const PI = Math.PI;
    const HALF_PI = PI / 2;
    const maxPhi = isSemiSphere ? HALF_PI : PI;

    for (let latNumber = 0; latNumber <= resolution; latNumber++) {
      const theta = latNumber * PI / resolution;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      for (let longNumber = 0; longNumber <= resolution; longNumber++) {
        const phi = longNumber * 2 * maxPhi / resolution;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);

        const x = cosPhi * sinTheta;
        const y = cosTheta;
        const z = sinPhi * sinTheta;

        vertices.push(z, y, x);
        textureCoords.push(longNumber / resolution, latNumber / resolution);
      }
    }

    for (let latNumber = 0; latNumber < resolution; latNumber++) {
      for (let longNumber = 0; longNumber < resolution; longNumber++) {
        const firstRow = (latNumber * (resolution + 1)) + longNumber;
        const secondRow = firstRow + resolution + 1;

        indices.push(firstRow, secondRow, firstRow + 1);
        indices.push(secondRow, secondRow + 1, firstRow + 1);
      }
    }

    return {vertices, textureCoords, indices};
  }

  /**
   * @return {{vertices: !Array<number>, textureCoords: !Array<number>,
   *          indices: !Array<number>}}
   */
  static generateCube() {
    /** @type {!Array<number>} */
    const vertices = [
      //  order : left top back right bottom front
      // Front face 3
      -1.0, -1.0, -1.0,
      -1.0, -1.0, 1.0,
      -1.0, 1.0, 1.0,
      -1.0, 1.0, -1.0,
      // Back face 2
      -1.0, 1.0, -1.0,
      -1.0, 1.0, 1.0,
      1.0, 1.0, 1.0,
      1.0, 1.0, -1.0,
      // Top face 6
      -1.0, -1.0, 1.0,
      1.0, -1.0, 1.0,
      1.0, 1.0, 1.0,
      -1.0, 1.0, 1.0,
      // Bottom face 1
      1.0, -1.0, -1.0,
      1.0, 1.0, -1.0,
      1.0, 1.0, 1.0,
      1.0, -1.0, 1.0,
      // Right face 4
      -1.0, -1.0, -1.0,
      1.0, -1.0, -1.0,
      1.0, -1.0, 1.0,
      -1.0, -1.0, 1.0,
      // Left face 5
      -1.0, -1.0, -1.0,
      -1.0, 1.0, -1.0,
      1.0, 1.0, -1.0,
      1.0, -1.0, -1.0,
    ];
    /** @type {!Array<number>} */
    const textureCoords = [
      // Left Face
      2 / 3, 0.5,
      1 / 3, 0.5,
      1 / 3, 0.0,
      2 / 3, 0.0,
      // Top Face
      2 / 3, 0.5,
      2 / 3, 0.0,
      1.0, 0.0,
      1.0, 0.5,
      // Back Face
      1.0, 1.0,
      2 / 3, 1.0,
      2 / 3, 0.5,
      1.0, 0.5,
      // Right Face
      0.0, 0.5,
      0.0, 0.0,
      1 / 3, 0.0,
      1 / 3, 0.5,
      // Bottom Face
      0.0, 0.5,
      1 / 3, 0.5,
      1 / 3, 1.0,
      0.0, 1.0,
      // Front Face
      1 / 3, 1.0,
      1 / 3, 0.5,
      2 / 3, 0.5,
      2 / 3, 1.0,
    ];
    /** @type {!Array<number>} */
    const indices = [
      // Front face
      0, 1, 2,
      0, 2, 3,
      // Back face
      4, 5, 6,
      4, 6, 7,
      // Top face
      8, 9, 10,
      8, 10, 11,
      // Bottom face
      12, 13, 14,
      12, 14, 15,
      // Right face
      16, 17, 18,
      16, 18, 19,
      // Left face
      20, 21, 22,
      20, 22, 23,
    ];

    return {vertices, textureCoords, indices};
  }
};

/**
 * Sphere vertex shader.
 *
 * @const {string}
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
 * @const {string}
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

/**
 * Cube vertex shader.
 *
 * @const {string}
 */
shaka.ui.VRUtils.VERTEX_CUBE_SHADER =
`attribute vec4 aVertexPosition;
attribute vec2 aTextureCoord;
uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
varying highp vec2 vTextureCoord;
varying highp vec3 vLighting;
void main(void) {
  gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
  vTextureCoord = aTextureCoord;
}`;

/**
 * Cube fragment shader.
 *
 * @const {string}
 */
shaka.ui.VRUtils.FRAGMENT_CUBE_SHADER =
`varying highp vec2 vTextureCoord;
uniform sampler2D uSampler;
void main(void) {
  highp vec4 texelColor = texture2D(uSampler, vTextureCoord);
  gl_FragColor = vec4(texelColor.rgb , texelColor.a);
}`;
