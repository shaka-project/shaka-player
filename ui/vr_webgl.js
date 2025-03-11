/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.VRWebgl');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.Player');
goog.require('shaka.ui.Matrix4x4');
goog.require('shaka.ui.MatrixQuaternion');
goog.require('shaka.ui.VRUtils');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.IReleasable');
goog.require('shaka.util.MediaReadyState');
goog.require('shaka.util.Timer');


/**
 * @implements {shaka.util.IReleasable}
 */
shaka.ui.VRWebgl = class {
  /**
   * @param {!HTMLMediaElement} video
   * @param {!shaka.Player} player
   * @param {!HTMLCanvasElement} canvas
   * @param {WebGLRenderingContext} gl
   * @param {string} projectionMode
   */
  constructor(video, player, canvas, gl, projectionMode) {
    /** @private {!HTMLVideoElement} */
    this.video_ = /** @type {!HTMLVideoElement} */ (video);

    /** @private {shaka.Player} */
    this.player_ = player;

    /** @private {HTMLCanvasElement} */
    this.canvas_ = canvas;

    /** @private {WebGLRenderingContext} */
    this.gl_ = gl;

    /** @private {shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();

    /** @private {!Float32Array} */
    this.originalQuaternion_ = shaka.ui.MatrixQuaternion.create();

    /** @private {!Float32Array} */
    this.currentQuaternion_ = shaka.ui.MatrixQuaternion.create();

    /** @private {?WebGLProgram} */
    this.shaderProgram_ = null;

    /** @private {?WebGLBuffer} */
    this.verticesBuffer_ = null;

    /** @private {?WebGLBuffer} */
    this.verticesTextureCoordBuffer_ = null;

    /** @private {?WebGLBuffer} */
    this.verticesIndexBuffer_ = null;

    /** @private {!Float32Array} */
    this.viewMatrix_ = shaka.ui.Matrix4x4.create();

    /** @private {!Float32Array} */
    this.projectionMatrix_ = shaka.ui.Matrix4x4.create();

    /** @private {!Float32Array} */
    this.viewProjectionMatrix_ = shaka.ui.Matrix4x4.create();

    /** @private {!Float32Array} */
    this.identityMatrix_ = shaka.ui.Matrix4x4.create();

    /** @private {?Float32Array} */
    this.diff_ = null;

    /** @private {boolean} */
    this.stereoscopicMode_ = false;

    /** @private {?shaka.util.Timer} */
    this.activeTimer_ = null;

    /** @private {?shaka.util.Timer} */
    this.resetTimer_ = null;

    /** @private {number} */
    this.previousCanvasWidth_ = 0;

    /** @private {number} */
    this.previousCanvasHeight_ = 0;

    /**
     * @private {?{vertices: !Array<number>, textureCoords: !Array<number>,
     *           indices: !Array<number>}}
     */
    this.geometry_ = null;

    /** @private {?number} */
    this.vertexPositionAttribute_ = null;

    /** @private {?number} */
    this.textureCoordAttribute_ = null;

    /** @private {?WebGLTexture} */
    this.texture_ = null;

    /** @private {number} */
    this.positionX_ = 0;

    /** @private {number} */
    this.positionY_ = 0;

    /** @private {number} */
    this.fieldOfView_ = 75;

    /** @private {number} */
    this.cont_ = 0;

    /** @private {string} */
    this.projectionMode_ = projectionMode;

    /** @private {number} */
    this.videoCallbackId_ = -1;

    this.init_();
  }

  /**
   * @override
   */
  release() {
    if (this.videoCallbackId_ != -1) {
      this.video_.cancelVideoFrameCallback(this.videoCallbackId_);
      this.videoCallbackId_ = -1;
    }
    if (this.eventManager_) {
      this.eventManager_.release();
      this.eventManager_ = null;
    }
    if (this.activeTimer_) {
      this.activeTimer_.stop();
      this.activeTimer_ = null;
    }
    if (this.resetTimer_) {
      this.resetTimer_.stop();
      this.resetTimer_ = null;
    }
  }

  /**
   * @return {string}
   */
  getProjectionMode() {
    return this.projectionMode_;
  }

  /**
   * @param {!Float32Array} quat
   * @return {{pitch: number, yaw: number, roll: number}} as radians
   * @private
   */
  toEulerAngles_(quat) {
    const angles = {
      pitch: 0,
      yaw: 0,
      roll: 0,
    };
    const x = quat[0];
    const y = quat[1];
    const z = quat[2];
    const w = quat[3];
    const x2 = x * x;
    const y2 = y * y;
    const z2 = z * z;
    const w2 = w * w;
    const unit = x2 + y2 + z2 + w2;
    const test = x * w - y * z;
    if (test > 0.499995 * unit) {
      // singularity at the north pole
      angles.pitch = Math.PI / 2;
      angles.yaw = 2 * Math.atan2(y, x);
      angles.roll = 0;
    } else if (test < -0.499995 * unit) {
      // singularity at the south pole
      angles.pitch = -Math.PI / 2;
      angles.yaw = 2 * Math.atan2(y, x);
      angles.roll = 0;
    } else {
      angles.pitch = Math.asin(2 * (x * z - w * y));
      angles.yaw = Math.atan2(2 * (x * w + y * z), 1 - 2 * (z2 + w2));
      angles.roll = Math.atan2(2 * (x * y + z * w), 1 - 2 * (y2 + z2));
    }
    return angles;
  }

  /**
   * Toggle stereoscopic mode
   */
  toggleStereoscopicMode() {
    this.stereoscopicMode_ = !this.stereoscopicMode_;
    if (!this.stereoscopicMode_) {
      this.gl_.viewport(0, 0, this.canvas_.width, this.canvas_.height);
    }
    this.renderGL_(false);
  }

  /**
   * Returns true if stereoscopic mode is enabled.
   *
   * @return {boolean}
   */
  isStereoscopicModeEnabled() {
    return this.stereoscopicMode_;
  }

  /**
   * @private
   */
  init_() {
    this.initMatrices_();
    this.initGL_();
    this.initGLShaders_();
    this.initGLBuffers_();
    this.initGLTexture_();

    const setupListeners = () => {
      if (this.video_.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
        this.renderGL_();
      }

      if ('requestVideoFrameCallback' in this.video_) {
        const videoFrameCallback = (now, metadata) => {
          if (this.videoCallbackId_ == -1) {
            return;
          }
          this.renderGL_();
          // It is necessary to check this again because this callback can be
          // executed in another thread by the browser and we have to be sure
          // again here that we have not cancelled it in the middle of an
          // execution.
          if (this.videoCallbackId_ == -1) {
            return;
          }
          this.videoCallbackId_ =
              this.video_.requestVideoFrameCallback(videoFrameCallback);
        };
        this.videoCallbackId_ =
            this.video_.requestVideoFrameCallback(videoFrameCallback);
      } else {
        let frameRate;
        this.eventManager_.listen(this.video_, 'canplaythrough', () => {
          this.renderGL_();
        });
        this.eventManager_.listen(this.video_, 'playing', () => {
          if (this.activeTimer_) {
            this.activeTimer_.stop();
          }
          if (!frameRate) {
            const variants = this.player_.getVariantTracks();
            for (const variant of variants) {
              const variantFrameRate = variant.frameRate;
              if (variantFrameRate &&
                  (!frameRate || frameRate < variantFrameRate)) {
                frameRate = variantFrameRate;
              }
            }
          }
          if (!frameRate) {
            frameRate = 60;
          }
          this.renderGL_();
          this.activeTimer_ = new shaka.util.Timer(() => {
            this.renderGL_();
          }).tickNow().tickEvery(1 / frameRate);
        });
        this.eventManager_.listen(this.video_, 'pause', () => {
          if (this.activeTimer_) {
            this.activeTimer_.stop();
          }
          this.activeTimer_ = null;
          this.renderGL_();
        });
        this.eventManager_.listen(this.video_, 'seeked', () => {
          this.renderGL_();
        });

        this.eventManager_.listen(document, 'visibilitychange', () => {
          this.renderGL_();
        });
      }
    };

    shaka.util.MediaReadyState.waitForReadyState(this.video_,
        HTMLMediaElement.HAVE_CURRENT_DATA,
        this.eventManager_,
        setupListeners);
  }

  /**
   * @private
   */
  initMatrices_() {
    shaka.ui.Matrix4x4.lookAt(
        this.viewMatrix_, [0, 0, 0], [1, 0, 0], [0, 1, 0]);
    shaka.ui.Matrix4x4.getRotation(
        this.originalQuaternion_, this.viewMatrix_);
    shaka.ui.Matrix4x4.scale(
        this.identityMatrix_, this.identityMatrix_, [4.0, 4.0, 4.0]);
  }

  /**
   * @private
   */
  initGL_() {
    this.updateViewPort_();
    this.gl_.viewport(
        0, 0, this.gl_.drawingBufferWidth, this.gl_.drawingBufferHeight);
    this.gl_.clearColor(0.0, 0.0, 0.0, 1.0);
    this.gl_.enable(this.gl_.CULL_FACE);
    this.gl_.cullFace(this.gl_.FRONT);
    // Clear the context with the newly set color. This is
    // the function call that actually does the drawing.
    this.gl_.clear(this.gl_.COLOR_BUFFER_BIT);
  }

  /**
   * @private
   */
  initGLShaders_() {
    const vertexShader = this.getGLShader_(this.gl_.VERTEX_SHADER);
    const fragmentShader = this.getGLShader_(this.gl_.FRAGMENT_SHADER);

    // Create program
    this.shaderProgram_ = this.gl_.createProgram();
    this.gl_.attachShader(this.shaderProgram_, vertexShader);
    this.gl_.attachShader(this.shaderProgram_, fragmentShader);
    this.gl_.linkProgram(this.shaderProgram_);

    // If creating the shader program failed, alert
    if (!this.gl_.getProgramParameter(
        this.shaderProgram_, this.gl_.LINK_STATUS)) {
      shaka.log.error('Unable to initialize the shader program: ',
          this.gl_.getProgramInfoLog(this.shaderProgram_));
    }

    // Bind data
    if (this.projectionMode_ == 'cubemap') {
      this.vertexPositionAttribute_ = this.gl_.getAttribLocation(
          this.shaderProgram_, 'aVertexPosition');
      this.textureCoordAttribute_ = this.gl_.getAttribLocation(
          this.shaderProgram_, 'aTextureCoord');
    } else {
      this.vertexPositionAttribute_ = this.gl_.getAttribLocation(
          this.shaderProgram_, 'a_vPosition');
      this.gl_.enableVertexAttribArray(this.vertexPositionAttribute_);
      this.textureCoordAttribute_ = this.gl_.getAttribLocation(
          this.shaderProgram_, 'a_TexCoordinate');
      this.gl_.enableVertexAttribArray(this.textureCoordAttribute_);
    }
  }

  /**
   * Read and generate WebGL shader
   *
   * @param {number} glType Type of shader requested.
   * @return {?WebGLShader}
   * @private
   */
  getGLShader_(glType) {
    let source;

    switch (glType) {
      case this.gl_.VERTEX_SHADER:
        if (this.projectionMode_ == 'cubemap') {
          source = shaka.ui.VRUtils.VERTEX_CUBE_SHADER;
        } else {
          source = shaka.ui.VRUtils.VERTEX_SPHERE_SHADER;
        }
        break;
      case this.gl_.FRAGMENT_SHADER:
        if (this.projectionMode_ == 'cubemap') {
          source = shaka.ui.VRUtils.FRAGMENT_CUBE_SHADER;
        } else {
          source = shaka.ui.VRUtils.FRAGMENT_SPHERE_SHADER;
        }
        break;
      default:
        return null;
    }

    const shader = this.gl_.createShader(glType);

    this.gl_.shaderSource(shader, source);

    this.gl_.compileShader(shader);

    if (!this.gl_.getShaderParameter(shader, this.gl_.COMPILE_STATUS)) {
      shaka.log.warning('Error in ' + glType + ' shader: ' +
          this.gl_.getShaderInfoLog(shader));
    }

    goog.asserts.assert(shader, 'Should have a shader!');

    return shader;
  }

  /**
   * @private
   */
  initGLBuffers_() {
    if (this.projectionMode_ == 'cubemap') {
      this.geometry_ = shaka.ui.VRUtils.generateCube();
    } else if (this.projectionMode_ == 'halfequirectangular') {
      this.geometry_ = shaka.ui.VRUtils.generateSphere(100, true);
    } else {
      this.geometry_ = shaka.ui.VRUtils.generateSphere(100);
    }
    this.verticesBuffer_ = this.gl_.createBuffer();
    this.gl_.bindBuffer(this.gl_.ARRAY_BUFFER, this.verticesBuffer_);
    this.gl_.bufferData(this.gl_.ARRAY_BUFFER,
        new Float32Array(this.geometry_.vertices), this.gl_.STATIC_DRAW);
    this.verticesTextureCoordBuffer_ = this.gl_.createBuffer();
    this.gl_.bindBuffer(
        this.gl_.ARRAY_BUFFER, this.verticesTextureCoordBuffer_);
    this.gl_.bufferData(this.gl_.ARRAY_BUFFER,
        new Float32Array(this.geometry_.textureCoords), this.gl_.STATIC_DRAW);
    this.verticesIndexBuffer_ = this.gl_.createBuffer();
    this.gl_.bindBuffer(
        this.gl_.ELEMENT_ARRAY_BUFFER, this.verticesIndexBuffer_);
    this.gl_.bufferData(this.gl_.ELEMENT_ARRAY_BUFFER,
        new Uint16Array(this.geometry_.indices), this.gl_.STATIC_DRAW);
  }

  /**
   * @private
   */
  initGLTexture_() {
    this.texture_ = this.gl_.createTexture();
    this.gl_.bindTexture(this.gl_.TEXTURE_2D, this.texture_);

    this.gl_.texParameteri(this.gl_.TEXTURE_2D,
        this.gl_.TEXTURE_WRAP_S, this.gl_.CLAMP_TO_EDGE);
    this.gl_.texParameteri(this.gl_.TEXTURE_2D,
        this.gl_.TEXTURE_WRAP_T, this.gl_.CLAMP_TO_EDGE);
    this.gl_.texParameteri(this.gl_.TEXTURE_2D,
        this.gl_.TEXTURE_MIN_FILTER, this.gl_.NEAREST);
    this.gl_.texParameteri(this.gl_.TEXTURE_2D,
        this.gl_.TEXTURE_MAG_FILTER, this.gl_.NEAREST);
  }

  /**
   * @param {boolean=} textureUpdate
   * @private
   */
  renderGL_(textureUpdate = true) {
    const loadMode = this.player_.getLoadMode();
    const isMSE = loadMode == shaka.Player.LoadMode.MEDIA_SOURCE;
    if (!this.video_ || this.video_.readyState < 2 ||
        (!isMSE && this.video_.playbackRate == 0)) {
      return;
    }
    shaka.ui.Matrix4x4.perspective(this.projectionMatrix_,
        this.fieldOfView_ * Math.PI / 180, 5 / 3.2, 0.1, 100.0);

    if (this.projectionMode_ == 'cubemap') {
      shaka.ui.Matrix4x4.perspective(this.projectionMatrix_,
          this.fieldOfView_ * Math.PI / 180, 5 / 2, 0.1, 100.0);
    } else {
      shaka.ui.Matrix4x4.perspective(this.projectionMatrix_,
          this.fieldOfView_ * Math.PI / 180, 5 / 3.2, 0.1, 100.0);
    }

    this.gl_.useProgram(this.shaderProgram_);

    this.gl_.clear(this.gl_.COLOR_BUFFER_BIT);
    this.updateViewPort_();

    if (textureUpdate) {
      this.gl_.activeTexture(this.gl_.TEXTURE0);
      this.gl_.bindTexture(this.gl_.TEXTURE_2D, this.texture_);
      this.gl_.pixelStorei(this.gl_.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
      this.gl_.texImage2D(this.gl_.TEXTURE_2D, 0, this.gl_.RGBA,
          this.gl_.RGBA, this.gl_.UNSIGNED_BYTE, this.video_);
    }

    // Update matrix
    if (this.projectionMode_ == 'equirectangular' ||
        this.projectionMode_ == 'halfequirectangular') {
      shaka.ui.Matrix4x4.multiply(this.viewProjectionMatrix_,
          this.viewMatrix_, this.identityMatrix_);
      shaka.ui.Matrix4x4.multiply(this.viewProjectionMatrix_,
          this.projectionMatrix_, this.viewProjectionMatrix_);
    }

    // Plumbing
    // Vertices
    this.gl_.bindBuffer(this.gl_.ARRAY_BUFFER, this.verticesBuffer_);
    goog.asserts.assert(this.vertexPositionAttribute_ != null,
        'Should have a texture attribute!');
    this.gl_.vertexAttribPointer(
        this.vertexPositionAttribute_, 3, this.gl_.FLOAT, false, 0, 0);
    this.gl_.enableVertexAttribArray(this.vertexPositionAttribute_);

    // UVs
    this.gl_.bindBuffer(
        this.gl_.ARRAY_BUFFER, this.verticesTextureCoordBuffer_);
    goog.asserts.assert(this.textureCoordAttribute_ != null,
        'Should have a texture attribute!');
    this.gl_.vertexAttribPointer(
        this.textureCoordAttribute_, 2, this.gl_.FLOAT, false, 0, 0);
    this.gl_.enableVertexAttribArray(this.textureCoordAttribute_);

    this.gl_.bindBuffer(
        this.gl_.ELEMENT_ARRAY_BUFFER, this.verticesIndexBuffer_);

    this.setMatrixUniforms_();

    this.gl_.uniform1i(
        this.gl_.getUniformLocation(this.shaderProgram_, 'uSampler'), 0);

    if (this.stereoscopicMode_) {
      this.gl_.viewport(0, 0, this.canvas_.width / 2, this.canvas_.height);
    }

    // Draw
    this.gl_.drawElements(this.gl_.TRIANGLES,
        this.geometry_.indices.length, this.gl_.UNSIGNED_SHORT, 0);

    if (this.stereoscopicMode_) {
      this.gl_.viewport(this.canvas_.width / 2, 0,
          this.canvas_.width / 2, this.canvas_.height);
      this.gl_.drawElements(this.gl_.TRIANGLES,
          this.geometry_.indices.length, this.gl_.UNSIGNED_SHORT, 0);
    }
  }

  /**
   * @private
   */
  setMatrixUniforms_() {
    if (this.projectionMode_ == 'cubemap') {
      this.gl_.uniformMatrix4fv(
          this.gl_.getUniformLocation(this.shaderProgram_, 'uProjectionMatrix'),
          false, this.projectionMatrix_);
      this.gl_.uniformMatrix4fv(
          this.gl_.getUniformLocation(this.shaderProgram_, 'uModelViewMatrix'),
          false, this.viewProjectionMatrix_);
    } else {
      this.gl_.uniformMatrix4fv(
          this.gl_.getUniformLocation(this.shaderProgram_, 'u_VPMatrix'),
          false, this.viewProjectionMatrix_);
    }
  }

  /**
   * @private
   */
  updateViewPort_() {
    let currentWidth = this.video_.videoWidth;
    if (!currentWidth) {
      currentWidth = this.canvas_.scrollWidth;
    }
    let currentHeight = this.video_.videoHeight;
    if (!currentHeight) {
      currentHeight = this.canvas_.scrollHeight;
    }

    if (this.previousCanvasWidth_ !== currentWidth ||
        this.previousCanvasHeight_ !== currentHeight) {
      this.canvas_.width = currentWidth;
      this.canvas_.height = currentHeight;

      this.previousCanvasWidth_ = currentWidth;
      this.previousCanvasHeight_ = currentHeight;

      const ratio = currentWidth / currentHeight;

      this.projectionMatrix_ = shaka.ui.Matrix4x4.frustum(
          this.projectionMatrix_, -ratio, ratio, -1, 1, 0, 1);

      this.gl_.viewport(0, 0, currentWidth, currentHeight);
    }
  }

  /**
   * Rotate the view matrix global
   *
   * @param {!number} yaw Yaw.
   * @param {!number} pitch Pitch.
   * @param {!number} roll Roll.
   */
  rotateViewGlobal(yaw, pitch, roll) {
    let yawBoundary = Infinity;
    let pitchBoundary = 90.0 * Math.PI / 180;

    if (this.projectionMode_ == 'halfequirectangular') {
      yawBoundary = 90.0 * Math.PI / 180;
      pitchBoundary /= 2;
    }

    let matrix;
    if (this.projectionMode_ == 'cubemap') {
      matrix = this.viewProjectionMatrix_;
    } else {
      matrix = this.viewMatrix_;
    }

    // Variable to limit the movement
    this.positionX_ += yaw;
    this.positionY_ += pitch;

    if (this.positionX_ < yawBoundary &&
      this.positionX_ > -yawBoundary) {
      // Rotate global axis
      shaka.ui.Matrix4x4.rotateY(matrix, matrix, yaw);
    } else {
      this.positionX_ -= yaw;
    }

    if (this.positionY_ < pitchBoundary &&
      this.positionY_ > -pitchBoundary) {
      const out = shaka.ui.Matrix4x4.create();
      shaka.ui.Matrix4x4.rotateX(out, shaka.ui.Matrix4x4.create(), -1 * pitch);
      // Rotate local axis
      shaka.ui.Matrix4x4.multiply(matrix, out, matrix);
    } else {
      // Doing this we restart the value to the previous position,
      // to not maintain a value over 90º or under -90º.
      this.positionY_ -= pitch;
    }

    const out2 = shaka.ui.Matrix4x4.create();
    shaka.ui.Matrix4x4.rotateZ(out2, shaka.ui.Matrix4x4.create(), roll);

    // Rotate local axis
    shaka.ui.Matrix4x4.multiply(matrix, out2, matrix);

    this.renderGL_(false);
  }

  /**
   * @param {number} amount
   */
  zoom(amount) {
    const zoomMin = 20;
    const zoomMax = 100;
    amount /= 50;
    if (this.fieldOfView_ >= zoomMin && this.fieldOfView_ <= zoomMax) {
      this.fieldOfView_ += amount;
    }
    if (this.fieldOfView_ < zoomMin) {
      this.fieldOfView_ = zoomMin;
    } else if (this.fieldOfView_ > zoomMax) {
      this.fieldOfView_ = zoomMax;
    }
    this.renderGL_(false);
  }

  /**
   * @return {number}
   */
  getFieldOfView() {
    return this.fieldOfView_;
  }

  /**
   * @param {number} fieldOfView
   */
  setFieldOfView(fieldOfView) {
    this.fieldOfView_ = fieldOfView;
    this.renderGL_(false);
  }

  /**
   * @return {number}
   */
  getNorth() {
    shaka.ui.Matrix4x4.getRotation(this.currentQuaternion_, this.viewMatrix_);

    const angles = this.toEulerAngles_(this.currentQuaternion_);

    const normalizedDir = {
      x: Math.cos(angles.yaw) * Math.cos(angles.pitch),
      y: Math.sin(angles.yaw) * Math.cos(angles.pitch),
      z: Math.sin(angles.pitch),
    };

    const northYaw = Math.acos(normalizedDir.x);

    return ((northYaw * 180) / Math.PI);
  }

  /**
   * @param {boolean=} firstTime
   */
  reset(firstTime = true) {
    const steps = 20;

    if (firstTime) {
      shaka.ui.Matrix4x4.getRotation(
          this.currentQuaternion_, this.viewMatrix_);
      this.cont_ = 0;
      this.diff_ = shaka.ui.MatrixQuaternion.create();
      this.diff_[0] =
          (this.currentQuaternion_[0] - this.originalQuaternion_[0]) / steps;
      this.diff_[1] =
          (this.currentQuaternion_[1] - this.originalQuaternion_[1]) / steps;
      this.diff_[2] =
          (this.currentQuaternion_[2] - this.originalQuaternion_[2]) / steps;
      this.diff_[3] =
          (this.currentQuaternion_[3] - this.originalQuaternion_[3]) / steps;
    }

    this.currentQuaternion_[0] -= this.diff_[0];
    this.currentQuaternion_[1] -= this.diff_[1];
    this.currentQuaternion_[2] -= this.diff_[2];
    this.currentQuaternion_[3] -= this.diff_[3];

    // Set the view to the original matrix
    const out = shaka.ui.Matrix4x4.create();

    shaka.ui.MatrixQuaternion.normalize(
        this.currentQuaternion_, this.currentQuaternion_);

    shaka.ui.Matrix4x4.fromQuat(out, this.currentQuaternion_);

    this.viewMatrix_ = out;

    if (this.resetTimer_) {
      this.resetTimer_.stop();
      this.resetTimer_ = null;
    }
    if (this.cont_ < steps) {
      this.resetTimer_ = new shaka.util.Timer(() => {
        this.reset(false);
        this.positionX_ = 0;
        this.positionY_ = 0;
        this.cont_++;
        this.renderGL_(false);
      }).tickAfter(shaka.ui.VRWebgl.ANIMATION_DURATION_ / steps);
    } else {
      shaka.ui.Matrix4x4.fromQuat(out, this.originalQuaternion_);
      this.viewMatrix_ = out;
    }
  }
};

/**
 * @const {number}
 */
shaka.ui.VRWebgl.ANIMATION_DURATION_ = 0.5;
