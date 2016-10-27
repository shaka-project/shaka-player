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


/** @suppress {duplicate} */
var shakaDemo = shakaDemo || {};


/** @private {!Object.<string, Function>} */
shakaDemo.originalConsoleMethods_ = {
  'error': function() {},
  'warn': function() {},
  'info': function() {},
  'log': function() {},
  'debug': function() {}
};


/** @private {!Object.<string, Function>} */
shakaDemo.patchedConsoleMethods_ = {
  'error': function() {},
  'warn': function() {},
  'info': function() {},
  'log': function() {},
  'debug': function() {}
};


/** @private */
shakaDemo.setupLogging_ = function() {
  var logToScreen = document.getElementById('logToScreen');
  var log = document.getElementById('log');

  if (!shaka.log) {
    // This may be the compiled library, which has no logging by default.
    logToScreen.parentElement.style.display = 'none';
    return;
  }

  if (!Object.keys || !window.console || !console.log || !console.log.bind) {
    // This may be a very old browser that we can't support anyway.
    return;
  }

  // Store the original and to-screen versions of logging methods.
  Object.keys(shakaDemo.originalConsoleMethods_).forEach(function(k) {
    var original = console[k].bind(console);
    var className = k + 'Log';
    shakaDemo.originalConsoleMethods_[k] = original;
    shakaDemo.patchedConsoleMethods_[k] = function() {
      // Pass the call on to the original:
      original.apply(console, arguments);
      shakaDemo.formatLog_(log, className, arguments);
    };
  });

  logToScreen.addEventListener('change', shakaDemo.onLogChange_);
  // Set the initial state.
  shakaDemo.onLogChange_();
};


/** @private */
shakaDemo.onLogChange_ = function() {
  var logToScreen = document.getElementById('logToScreen');
  var logSection = document.getElementById('logSection');
  if (logToScreen.checked) {
    logSection.style.display = 'block';
    for (var k in shakaDemo.patchedConsoleMethods_) {
      console[k] = shakaDemo.patchedConsoleMethods_[k];
    }
  } else {
    logSection.style.display = 'none';
    for (var k in shakaDemo.originalConsoleMethods_) {
      console[k] = shakaDemo.originalConsoleMethods_[k];
    }
  }
  // Re-initialize Shaka library logging to the freshly-patched console methods.
  shaka.log.setLevel(shaka.log.currentLevel);
};


/**
 * @param {Element} log
 * @param {string} className
 * @param {Arguments} logArguments
 * @private
 */
shakaDemo.formatLog_ = function(log, className, logArguments) {
  // Format the log and append it to the HTML:
  var div = document.createElement('div');
  div.className = className;
  for (var i = 0; i < logArguments.length; ++i) {
    var span = document.createElement('span');
    var arg = logArguments[i];
    var text;
    if (arg === null) {
      text = 'null';
    } else if (arg === undefined) {
      text = 'undefined';
    } else {
      text = arg.toString();
    }
    if (Array.isArray(arg) || text == '[object Object]') {
      text = JSON.stringify(arg);
    }
    span.textContent = text;
    div.appendChild(span);
  }
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
};
