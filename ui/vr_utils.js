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
   * Generates a semi-sphere mesh with fisheye texture coordinates. The
   * texture is expected to be a circular fisheye image centered on the
   * frame, covering <code>fov</code> degrees with an equidistant mapping
   * (the distance to the image center is proportional to the angle from
   * the lens axis). This is the projection used by Apple Immersive Video
   * (parametric immersive) and by regular fisheye content.
   *
   * @param {number} resolution
   * @param {number} fov Field of view covered by the image, in degrees.
   * @return {{vertices: !Array<number>, textureCoords: !Array<number>,
   *          indices: !Array<number>}}
   */
  static generateFisheye(resolution, fov) {
    // Use the same geometry as the semi-sphere, and only remap the texture
    // coordinates, so the winding order and the view boundaries keep
    // working the same way.
    const mesh = shaka.ui.VRUtils.generateSphere(
        resolution, /* isSemiSphere= */ true);

    const fovRadians = fov * Math.PI / 180;

    /** @type {!Array<number>} */
    const textureCoords = [];
    for (let i = 0; i < mesh.vertices.length; i += 3) {
      // In the vertex attribute layout the view direction is +X, up is +Y
      // and right is +Z.
      const forward = mesh.vertices[i];
      const up = mesh.vertices[i + 1];
      const right = mesh.vertices[i + 2];
      // Angle between the vertex direction and the lens axis.
      const alpha = Math.acos(Math.min(Math.max(forward, -1), 1));
      const radial = Math.hypot(right, up);
      let u = 0.5;
      let v = 0.5;
      if (radial > 1e-6) {
        const r = alpha / fovRadians;
        u = 0.5 + r * (right / radial);
        v = 0.5 - r * (up / radial);
      }
      textureCoords.push(u, v);
    }

    return {vertices: mesh.vertices, textureCoords, indices: mesh.indices};
  }

  /**
   * @param {number=} uInset Horizontal inset, in texture coordinates,
   *   applied to every face so that filtering at the shared edges does not
   *   sample the adjacent face of the atlas. Typically half a texel.
   * @param {number=} vInset Vertical inset, see uInset.
   * @return {{vertices: !Array<number>, textureCoords: !Array<number>,
   *          indices: !Array<number>}}
   */
  static generateCube(uInset = 0, vInset = 0) {
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
    if (uInset > 0 || vInset > 0) {
      // Pull the coordinates of each face (4 (u, v) pairs) towards the
      // center of the face.
      for (let face = 0; face < textureCoords.length; face += 8) {
        let minU = 1;
        let minV = 1;
        for (let corner = 0; corner < 8; corner += 2) {
          minU = Math.min(minU, textureCoords[face + corner]);
          minV = Math.min(minV, textureCoords[face + corner + 1]);
        }
        for (let corner = 0; corner < 8; corner += 2) {
          textureCoords[face + corner] +=
              textureCoords[face + corner] == minU ? uInset : -uInset;
          textureCoords[face + corner + 1] +=
              textureCoords[face + corner + 1] == minV ? vInset : -vInset;
        }
      }
    }
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
 // Compute the longitude per fragment, instead of using the interpolated
 // texture coordinate, to avoid needing texture wrapping at the seam.
 // (REPEAT is not available for non-power-of-two video textures in WebGL1.)
 highp float xValue =
      (PI + atan(pass_position.z, pass_position.x)) / (2.0 * PI);
 highp vec4 texelColor =
      texture2D(uSampler, vec2(xValue, v_TexCoordinate.t));
 gl_FragColor = vec4(texelColor.rgb, texelColor.a);
}`;

/**
 * Semi-sphere (half equirectangular) fragment shader.
 *
 * @const {string}
 */
shaka.ui.VRUtils.FRAGMENT_SEMI_SPHERE_SHADER =
`precision highp float;
#define PI 3.141592653589793238462643383279
#define HALF_PI 1.570796326794896619231321691639
varying vec2 v_TexCoordinate;
varying vec3 pass_position;
uniform sampler2D uSampler;
void main(void) {
 // The semi-sphere only spans 180 degrees of longitude, so the whole
 // texture width maps to half a turn of atan().
 highp float xValue =
      (HALF_PI + atan(pass_position.z, pass_position.x)) / PI;
 highp vec4 texelColor =
      texture2D(uSampler, vec2(xValue, v_TexCoordinate.t));
 gl_FragColor = vec4(texelColor.rgb, texelColor.a);
}`;

/**
 * Fisheye fragment shader.
 *
 * @const {string}
 */
shaka.ui.VRUtils.FRAGMENT_FISHEYE_SHADER =
`precision highp float;
varying vec2 v_TexCoordinate;
varying vec3 pass_position;
uniform sampler2D uSampler;
void main(void) {
 if (distance(v_TexCoordinate, vec2(0.5, 0.5)) > 0.5001) {
  // There is no content outside of the image circle.
  gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
 } else {
  highp vec4 texelColor = texture2D(uSampler, v_TexCoordinate);
  gl_FragColor = vec4(texelColor.rgb, texelColor.a);
 }
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
