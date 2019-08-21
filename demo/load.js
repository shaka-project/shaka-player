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


function shakaUncompiledModeSupported() {
  // Check if ES6 arrow function syntax and ES7 async are usable.  Both are
  // needed for uncompiled builds to work.
  try {
    eval('async ()=>{}');
    return true;
  } catch (e) {
    return false;
  }
}

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
  // The URL of the page itself, without URL fragments or search strings.
  var pageUrl = location.href.split('#')[0].split('?')[0];
  // The URL of the page, up to and including the final '/'.
  var baseUrl = pageUrl.split('/').slice(0, -1).join('/') + '/';

  function loadRelativeScript(src) {
    importScript(baseUrl + src);
  }

  // NOTE: This is a quick-and-easy hack based on assumption that the old
  // demo page will be replaced in the near future.
  function loadSpecificCss(href, linkRel) {
    var link = document.createElement('link');
    link.type = 'text/css';
    link.href = baseUrl + href;
    link.rel = linkRel;

    document.head.appendChild(link);
  }
  function loadCss(buildType) {
    // These should override the compiled versions, which have already been
    // hard-coded into the HTML.  This get us the best balance between avoiding
    // a flash of unstyled content and allowing the developer to quickly reload
    // uncompiled LESS in uncompiled mode.
    if (buildType == 'uncompiled') {
      loadSpecificCss('../ui/controls.less', 'stylesheet/less');
      loadSpecificCss('../demo/demo.less', 'stylesheet/less');
    }
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

  var buildType = 'uncompiled';
  var buildSpecified = false;

  if (!shakaUncompiledModeSupported()) {
    // If uncompiled mode is not supported, default to the compiled debug
    // version, which should still work.
    buildType = 'debug_compiled';
  }

  if (!navigator.onLine) {
    // If we're offline, default to the compiled version, which may have been
    // cached by the service worker.
    buildType = 'compiled';
  }

  // Very old browsers do not have Array.prototype.indexOf, so we loop.
  for (var i = 0; i < combined.length; ++i) {
    if (combined[i] == 'build=compiled') {
      buildType = 'compiled';
      buildSpecified = true;
      break;
    }
    if (combined[i] == 'build=debug_compiled') {
      buildType = 'debug_compiled';
      buildSpecified = true;
      break;
    }
    if (combined[i] == 'build=uncompiled') {
      buildType = 'uncompiled';
      buildSpecified = true;
      break;
    }
  }

  if (!shakaUncompiledModeSupported() && buildType == 'uncompiled') {
    // The URL says uncompiled, but we know it won't work.  This URL was
    // probably copied from some other browser, but it won't work in this one.
    // Force the use of the compiled debug build and update the hash.
    buildType = 'debug_compiled';

    // Replace the build type in either the hash or the URL parameters.
    // At this point, we don't know precisely which contained the build type.
    location.hash = location.hash.replace(
        'build=uncompiled', 'build=debug_compiled');
    location.href = location.href.replace(
        'build=uncompiled', 'build=debug_compiled');
    // Changing location.href will trigger a refresh of the page.  If the
    // build type was in the URL parameters, the page will now be refreshed.
    // If the build type was in the hash, the page will continue to load with
    // an updated hash and the correct library type.
  }

  // If no build was specified in the URL, update the fragment with the default
  // we chose.
  if (!buildSpecified) {
    if (location.hash.length) {
      location.hash += ';';
    }
    location.hash += 'build=' + buildType;
  }

  loadCss(buildType);

  // The application must define its list of compiled and uncompiled sources
  // before including this loader.  The URLs should be relative to the page.
  var scripts = {
    'compiled': window['COMPILED_JS'],
    'debug_compiled': window['COMPILED_DEBUG_JS'],
    'uncompiled': window['UNCOMPILED_JS'],
  }[buildType];
  for (var j = 0; j < scripts.length; ++j) {
    loadRelativeScript(scripts[j]);
  }
})();  // anonymous namespace
