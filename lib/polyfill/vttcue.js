/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

goog.provide('shaka.polyfill.VTTCue');

goog.require('shaka.log');
goog.require('shaka.polyfill.register');

/**
 * @namespace shaka.polyfill.VTTCue
 *
 * @summary A polyfill to provide VTTRegion interface in VTTCue.
 */


/**
 * Add the VTTRegion polyfill to VTTCue if needed
 */
shaka.polyfill.VTTCue.install = function() {
  if (!window.VTTCue && !window.TextTrackCue) {
    // Avoid errors on very old browsers.
    return;
  }

  if (window.VTTCue) {
    var proto = VTTCue.prototype;
    if (proto.hasOwnProperty('region')) {
      // No polyfill needed.
      shaka.log.info('Using native VTTCue.region');
      return;
    }
  }

  if (!window.VTTRegion) {
    window.VTTRegion = shaka.polyfill.VTTCue.VTTRegion;
  }
};



/**
 * @constructor
 */
shaka.polyfill.VTTCue.VTTRegion = function() {
  var _width = 100;
  var _lines = 3;
  var _regionAnchorX = 0;
  var _regionAnchorY = 100;
  var _viewportAnchorX = 0;
  var _viewportAnchorY = 100;
  var _scroll = '';

  Object.defineProperty(this, 'width', {
    enumerable: true,
    get: function() {
      return _width;
    },
    set: function(value) {
      _width = value;
    }
  });

  Object.defineProperty(this, 'lines', {
    enumerable: true,
    get: function() {
      return _lines;
    },
    set: function(value) {
      _lines = value;
    }
  });

  Object.defineProperty(this, 'regionAnchorY', {
    enumerable: true,
    get: function() {
      return _regionAnchorY;
    },
    set: function(value) {
      _regionAnchorY = value;
    }
  });

  Object.defineProperty(this, 'regionAnchorX', {
    enumerable: true,
    get: function() {
      return _regionAnchorX;
    },
    set: function(value) {
      _regionAnchorX = value;
    }
  });
  Object.defineProperty(this, 'viewportAnchorY', {
    enumerable: true,
    get: function() {
      return _viewportAnchorY;
    },
    set: function(value) {
      _viewportAnchorY = value;
    }
  });
  Object.defineProperty(this, 'viewportAnchorX', {
    enumerable: true,
    get: function() {
      return _viewportAnchorX;
    },
    set: function(value) {
      _viewportAnchorX = value;
    }
  });
  Object.defineProperty(this, 'scroll', {
    enumerable: true,
    get: function() {
      return _scroll;
    },
    set: function(value) {
      var scrollValues = {
        '': true,
        'up': true
      };
      if (typeof value === 'string' && scrollValues[value.toLowerCase()]) {
        _scroll = value.toLowerCase();
      } else {
        throw new SyntaxError('Invalid scroll setting provided');
      }
    }
  });
};


shaka.polyfill.register(shaka.polyfill.VTTCue.install);
