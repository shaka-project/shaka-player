(function() {
  // This is "window" in browsers and "global" in nodejs.
  // See https://github.com/google/shaka-player/issues/1445
  var innerGlobal = typeof window != 'undefined' ? window : global;

  // This is where our library exports things to.  It is "this" in the wrapped
  // code.  With this, we can decide later what module loader we are in, if any,
  // and put these exports in the appropriate place for that loader.
  var exportTo = {};

  // According to the Closure team, their polyfills will be written to
  // $jscomp.global, which will be "window", or "global", or "this", depending
  // on circumstances.
  // See https://github.com/google/closure-compiler/issues/2957 and
  // https://github.com/google/shaka-player/issues/1455#issuecomment-393250035

  // We provide "global" for use by Closure, and "window" for use by the Shaka
  // library itself.  Both point to "innerGlobal" above.
  (function(window, global) {

%output%

  }).call(exportTo, innerGlobal, innerGlobal);

  if (typeof exports != 'undefined') {
    // CommonJS module loader.  Use "exports" instead of "module.exports" to
    // avoid triggering inappropriately in Electron.
    for (var k in exportTo.shaka) {
      exports[k] = exportTo.shaka[k];
    }
  } else if (typeof define != 'undefined' && define.amd) {
    // AMD module loader.
    define(function(){
      return exportTo.shaka;
    });
  } else {
    // Loaded as an ES module or directly in a <script> tag.
    // Export directly to the global scope.
    innerGlobal.shaka = exportTo.shaka;
  }
})();
