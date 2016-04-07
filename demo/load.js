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


/**
 * Loads the library.  Chooses compiled or debug version of the library based
 * on the presence or absence of the URL parameter "compiled".
 *
 * This dynamic loading process is not necessary in a production environment,
 * but greatly simplifies the process of switching between compiled and
 * uncompiled mode during development.
 *
 * This is used in the provided demo app, but can also be used to load the
 * uncompiled version of the library into your own application environment.
 */
(function() {  // anonymous namespace
  // The sources may be in a different folder from the app.
  // Compute the base URL for all library sources.
  var currentScript = document.currentScript ||
                      document.scripts[document.scripts.length - 1];
  var loaderSrc = currentScript.src;
  var baseUrl = loaderSrc.split('/').slice(0, -1).join('/') + '/';

  function loadScript(src) {
    // This does not seem like it would be the best way to do this, but the
    // timing is different than creating a new script element and appending
    // it to the head element.  This way, all script loading happens before
    // DOMContentLoaded.  This is also compatible with goog.require's loading
    // mechanism, whereas appending an element to head isn't.
    document.write('<script src="' + baseUrl + src + '"></script>');
  }

  var fields = location.search.split('?').slice(1).join('?');
  fields = fields ? fields.split(';') : [];

  // Very old browsers do not have Array.prototype.indexOf.
  var compiledMode = false;
  for (var i = 0; i < fields.length; ++i) {
    if (fields[i] == 'compiled') {
      compiledMode = true;
      break;
    }
  }

  if (compiledMode) {
    // This contains the entire library, compiled in debug mode.
    loadScript('../dist/shaka-player.compiled.debug.js');
  } else {
    // In non-compiled mode, we load the closure library and the generated deps
    // file to bootstrap the system.  goog.require will load the rest.
    loadScript('../third_party/closure/goog/base.js');
    loadScript('../dist/deps.js');
    // This file contains goog.require calls for all exported classes.
    loadScript('../shaka-player.uncompiled.js');
  }
})();  // anonymous namespace
