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
 * @fileoverview Shaka Player demo, main section.
 *
 * @suppress {visibility} to work around compiler errors until we can
 *   refactor the demo into classes that talk via public method.  TODO
 */


/** @suppress {duplicate} */
var shakaDemo = shakaDemo || {};  // eslint-disable-line no-var


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
  let logToScreen = document.getElementById('logToScreen');
  let log = document.getElementById('log');

  if (!shaka['log']) {
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
    let original = console[k].bind(console);
    let className = k + 'Log';
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
  if (!shaka['log']) return;

  let logToScreen = document.getElementById('logToScreen');
  let logSection = document.getElementById('logSection');
  if (logToScreen.checked) {
    logSection.style.display = 'block';
    logSection.open = true;  // Open the details to show the logs.
    for (let k in shakaDemo.patchedConsoleMethods_) {
      console[k] = shakaDemo.patchedConsoleMethods_[k];
    }
  } else {
    logSection.style.display = 'none';
    for (let k in shakaDemo.originalConsoleMethods_) {
      console[k] = shakaDemo.originalConsoleMethods_[k];
    }
  }
  // Re-initialize Shaka library logging to the freshly-patched console methods.
  shaka['log']['setLevel'](shaka['log']['currentLevel']);
  // Change the hash, to mirror this.
  shakaDemo.hashShouldChange_();
};


/**
 * @param {Element} log
 * @param {string} className
 * @param {Arguments} logArguments
 * @private
 */
shakaDemo.formatLog_ = function(log, className, logArguments) {
  // Format the log and append it to the HTML:
  let div = document.createElement('div');
  div.className = className;
  for (let i = 0; i < logArguments.length; ++i) {
    let span = document.createElement('span');
    let arg = logArguments[i];
    let text;
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
