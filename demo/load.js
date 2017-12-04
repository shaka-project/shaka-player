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
 * Loads both library and application sources.  Chooses compiled or debug
 * version of the sources based on the presence or absence of the URL parameter
 * "compiled".  Uses the global arrays COMPILED_JS, COMPILED_DEBUG_JS, and
 * UNCOMPILED_JS, defined by the application in advance.
 *
 * This dynamic loading process is not necessary in a production environment,
 * but simplifies the process of switching between compiled and uncompiled
 * mode during development.
 */
(function() {  // anonymous namespace
  // The URL of the page itself, without URL fragments.
  var pageUrl = location.href.split('#')[0];
  // The URL of the page, up to and including the final '/'.
  var baseUrl = pageUrl.split('/').slice(0, -1).join('/') + '/';

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

  var scripts = window['UNCOMPILED_JS'];
  if (!navigator.onLine) {
    // If we're offline, default to the compiled version, which may have been
    // cached by the service worker.
    scripts = window['COMPILED_JS'];
  }

  // Very old browsers do not have Array.prototype.indexOf.
  for (var i = 0; i < combined.length; ++i) {
    if (combined[i] == 'compiled' || combined[i] == 'build=compiled') {
      scripts = window['COMPILED_JS'];
      break;
    }
    if (combined[i] == 'build=debug_compiled') {
      scripts = window['COMPILED_DEBUG_JS'];
      break;
    }
  }

  // The application must define its list of compiled and uncompiled sources
  // before including this loader.  The URLs should be relative to the page.
  for (var i = 0; i < scripts.length; ++i) {
    loadRelativeScript(scripts[i]);
  }
})();  // anonymous namespace
