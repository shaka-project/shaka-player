#!/usr/bin/env node
// Tests Shaka's Promises polyfill using the A+ conformance tests.
// Requires node.js, the 'promises-aplus-tests' module, and the compiled Shaka
// Player library.

// Load the compiled library.
var shaka = require('./shaka-player.compiled');
shaka.polyfill.Promise.install();

// Build an adapter for the test suite.
var adapter = {
  resolved: Promise.resolve,
  rejected: Promise.reject,
  deferred: function() {
    var resolveFn, rejectFn;
    var p = new Promise(function(resolve, reject) {
      resolveFn = resolve;
      rejectFn = reject;
    });
    return { promise: p, resolve: resolveFn, reject: rejectFn };
  }
};

// Load the test suite and run conformance tests.
// This implementation does not support thenables, which are not used by Shaka
// Player.  Tests related to thenables (2.3.3.*) are therefore ignored.
var opts = { 'grep': /^2.3.3/, 'invert': true };
var promisesAplusTests = require('promises-aplus-tests');
promisesAplusTests(adapter, opts, function(err) {
  var failures = err ? err.failures : 0;
  console.log('FAILURES:', failures);
  process.exit(failures ? 1 : 0);
});
