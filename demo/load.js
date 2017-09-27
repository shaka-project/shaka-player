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

  function loadRelativeScript(src) {
    importScript(baseUrl + src);
  }

  function importScript(src) {
    var script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = src;
    script.defer = true;
    // Setting async = false is important to make sure the script is imported
    // before the 'load' event fires.
    script.async = false;
    document.head.appendChild(script);
  }
  window.CLOSURE_IMPORT_SCRIPT = importScript;

  var fields = location.search.substr(1);
  fields = fields ? fields.split(';') : [];
  var fragments = location.hash.substr(1);
  fragments = fragments ? fragments.split(';') : [];
  var combined = fields.concat(fragments);

  // Very old browsers do not have Array.prototype.indexOf.
  var compiledScript = null;
  for (var i = 0; i < combined.length; ++i) {
    if (combined[i] == 'compiled') {
      compiledScript = '../dist/shaka-player.compiled.js';
      break;
    }
    if (combined[i] == 'debug_compiled') {
      compiledScript = '../dist/shaka-player.compiled.debug.js';
      break;
    }
  }

  if (compiledScript) {
    // This contains the entire library.
    loadRelativeScript(compiledScript);
  } else {
    // In non-compiled mode, we load the closure library and the generated deps
    // file to bootstrap the system.  goog.require will load the rest.
    loadRelativeScript('../third_party/closure/goog/base.js');
    loadRelativeScript('../dist/deps.js');
    // This file contains goog.require calls for all exported classes.
    loadRelativeScript('../shaka-player.uncompiled.js');
  }
})();  // anonymous namespace
