/**
 * @license
 * Copyright 2015 Google Inc.
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

// Status values for the report entries.
var kGood = 0;
var kInfo = 1;
var kBad = 2;

var vp8Type = 'video/webm; codecs="vp8"';
var vp9Type = 'video/webm; codecs="vp9"';
var mp4Type = 'video/mp4; codecs="avc1.42E01E"';
var tsType = 'video/mp2t; codecs="avc1.42E01E"';

var clearKeyId = 'org.w3.clearkey';
var widevineId = 'com.widevine.alpha';
var playReadyId = 'com.microsoft.playready';
var adobeAccessId = 'com.adobe.access';
var fairPlayId = 'com.apple.fairplay';

var classPrefixes = [
  'WebKit',
  'MS',
  'Moz'
];

var propertyPrefixes = [
  'webkit',
  'ms',
  'moz'
];

var keySystemPrefixes = [
  'webkit-'
];

var video = document.createElement('video');

// The entries in the report.  Each item is an array of name, status, and value.
var report = [];

// A map of unprefixed names to the found things themselves.  Properties are
// represented as true if found.
var found = {};

// An array of Promises representing asynchronous operations.
var async = [];

// Find an entry in the report by name, then change its status to "bad".
function markAsBad(name, opt_newValue) {
  for (var i = 0; i < report.length; ++i) {
    if (report[i][0] == name) {
      report[i][1] = kBad;
      if (opt_newValue !== undefined) {
        report[i][2] = opt_newValue;
      }
      return;
    }
  }
}

// A helper used by the other testFor* methods.  Look for a property named
// |name| in |parent|.  |required| is a true if it is a required property.
// |boolValue| is true if the actual property value should be replaced with
// true when found.  |prefixes| is the list of prefixes to test if an unprefixed
// version is not found.  |prefixFn| is a function that combines a prefix and
// name in the correct way for whatever is being tested.
function testFor(parent, name, required, boolValue, prefixes, prefixFn) {
  if (parent && (name in parent)) {
    report.push([name, kGood, '(unprefixed)']);
    found[name] = boolValue ? true : parent[name];
  } else {
    for (var i = 0; i < prefixes.length; ++i) {
      var name2 = prefixFn(prefixes[i], name);
      if (parent && (name2 in parent)) {
        report.push([name, kInfo, prefixes[i]]);
        found[name] = boolValue ? true : parent[name2];
        break;
      }
    }
    if (i == prefixes.length) {
      report.push([name, required ? kBad : kInfo, '(not found)']);
    }
  }
}

function testForClass(parent, name, required) {
  testFor(parent, name, required, false, classPrefixes,
          function(prefix, name) {
            return prefix + name;
          });
}

function testForClassUsable(parent, name, required, args) {
  testForClass(parent, name, required);
  var ctor = found[name];
  if (ctor) {
    try {
      // Some native DOM object constructors cannot be called without new.
      // So in order to apply args, they must be bound.
      var bindArgs = [ null ].concat(args);
      var boundCtor = ctor.bind.apply(ctor, bindArgs);
      new boundCtor();
    } catch (exception) {
      found[name] = false;
      markAsBad(name, '(not usable)');
    }
  }
}

function testForMethod(parent, name, required) {
  testFor(parent, name, required, false, propertyPrefixes,
          function(prefix, name) {
            return prefix + name.charAt(0).toUpperCase() + name.slice(1);
          });
}

function testForProperty(parent, name, required) {
  testFor(parent, name, required, true, propertyPrefixes,
          function(prefix, name) {
            return prefix + name.charAt(0).toUpperCase() + name.slice(1);
          });
}

function testForMimeType(type) {
  var mse = found['MediaSource'];
  if (mse && mse.isTypeSupported && mse.isTypeSupported(type)) {
    report.push([type, kGood, '(supported)']);
    found[type] = true;
  } else {
    report.push([type, kInfo, '(not found)']);
  }
}

function canPlayType2(ks) {
  // Check if the video can play any of the well-known types with this key
  // system, using the 2-argument version of canPlayType.
  return video.canPlayType(vp8Type, ks) ||
         video.canPlayType(vp9Type, ks) ||
         video.canPlayType(mp4Type, ks) ||
         video.canPlayType(tsType, ks);
}

function isKeySystemSupported(ks) {
  console.assert(!navigator.requestMediaKeySystemAccess,
      'isKeySystemSupported() should only be used when async testing is not ' +
      'available!');

  var mk = found['MediaKeys'];
  if (mk && mk.isTypeSupported) {
    return mk.isTypeSupported(ks);
  } else {
    if (canPlayType2('com.bogus.keysystem')) {
      // The browser doesn't understand the 2-argument canPlayType.
      // Don't give it any legitimate queries using this method.
      return false;
    }
    return canPlayType2(ks);
  }
}

function testForKeySystemAsync(ks) {
  // Check unprefixed first.
  var p = navigator.requestMediaKeySystemAccess(ks, [{}]).then(function() {
    return '(unprefixed)';
  });
  for (var i = 0; i < keySystemPrefixes.length; ++i) {
    // Chain a check for a prefixed version if the previous one failed.
    var prefix = keySystemPrefixes[i];
    p = p.catch(function(prefix) {
      var ks2 = prefix + ks;
      return navigator.requestMediaKeySystemAccess(ks2, [{}]).then(function() {
        return prefix;
      });
    }.bind(prefix));
  }
  return p;
}

function testForKeySystemSync(ks, required) {
  if (isKeySystemSupported(ks)) {
    report.push([ks, kGood, '(supported)']);
    found[ks] = true;
  } else {
    for (var i = 0; i < keySystemPrefixes.length; ++i) {
      var prefix = keySystemPrefixes[i];
      var ks2 = prefix + ks;
      if (isKeySystemSupported(ks2)) {
        report.push([ks, kGood, prefix]);
        found[ks] = true;
        break;
      }
    }
    if (i == keySystemPrefixes.length) {
      report.push([ks, required ? kBad : kInfo, '(not found)']);
    }
  }
}

function testForKeySystem(ks, required) {
  var Promise = found['Promise'];
  var mk = found['MediaKeys'];

  if (Promise && mk && navigator.requestMediaKeySystemAccess) {
    var p = testForKeySystemAsync(ks).then(function(prefix) {
      report.push([ks, kGood, prefix]);
      found[ks] = true;
    }).catch(function() {
      report.push([ks, required ? kBad : kInfo, '(not found)']);
    });
    async.push(p);
  } else {
    testForKeySystemSync(ks, required);
  }
}

// Required, no polyfill provided:
testForClass(window, 'HTMLMediaElement', true);
testForClass(window, 'MediaSource', true);
testForClass(window, 'Promise', true);
testForClass(window, 'Uint8Array', true);

// Optional:
testForClass(window, 'VTTCue', false);
testForProperty(document, 'fullscreenElement', false);
testForProperty(document, 'fullScreenElement', false);
testForClassUsable(window, 'CustomEvent', true, ['']);
testForProperty(window, 'indexedDB', false);

// Codecs:
testForMimeType(vp8Type);
testForMimeType(vp9Type);
testForMimeType(mp4Type);
testForMimeType(tsType);

// At least one of these should be supported:
if (!found[vp8Type] && !found[vp9Type] && !found[mp4Type] && !found[tsType]) {
  markAsBad(vp8Type);
  markAsBad(vp9Type);
  markAsBad(mp4Type);
  markAsBad(tsType);
}

// QoE stats:
testForMethod(video, 'getVideoPlaybackQuality', false);
testForProperty(video, 'droppedFrameCount', false);
testForProperty(video, 'decodedFrameCount', false);

// MediaKeys:
testForMethod(video, 'generateKeyRequest', false);
testForClass(window, 'MediaKeys', false);
testForMethod(found['MediaKeys'], 'create', false);
testForMethod(found['MediaKeys'], 'isTypeSupported', false);
testForMethod(navigator, 'requestMediaKeySystemAccess', false);
testForMethod(window, 'MediaKeySystemAccess', false);
testForMethod(found['MediaKeySystemAccess'] ?
              found['MediaKeySystemAccess'].prototype : null,
              'getConfiguration', false);
testForClass(window, 'MediaKeySession');

// Specific CDMs:
testForKeySystem(clearKeyId, found['MediaKeys'] || found['generateKeyRequest']);
testForKeySystem(widevineId, false);
testForKeySystem(playReadyId, false);
testForKeySystem(adobeAccessId, false);
testForKeySystem(fairPlayId, false);

// If EME is available, at least one key system other than ClearKey should be
// available.
if ((found['MediaKeys'] || found['generateKeyRequest']) &&
    (!found[clearKeyId] && !found[widevineId] && !found[playReadyId] &&
     !found[adobeAccessId] && !found[fairPlayId])) {
  markAsBad(clearKeyId);
  markAsBad(widevineId);
  markAsBad(playReadyId);
  markAsBad(adobeAccessId);
  markAsBad(fairPlayId);
}

if (async.length) {
  // The browser supports Promises and we have async tests going.
  // Create a Promise for DOMContentLoaded and add it to the list.
  var loaded = new Promise(function(resolve, reject) {
    onLoaded(resolve);
  });
  async.push(loaded);
  Promise.all(async).then(onAsyncComplete);
} else {
  // The browser does not support Promises or there are no async tests.
  // Listen for DOMContentLoaded.
  onLoaded(onAsyncComplete);
}

function onLoaded(fn) {
  // IE 9 fires DOMContentLoaded, and enters the "interactive"
  // readyState, before document.body has been initialized, so wait
  // for window.load
  if (document.readyState == 'loading' ||
      document.readyState == 'interactive') {
    window.addEventListener('load', fn);
  } else {
    fn();
  }
}

function onAsyncComplete() {
  // Synthesize a summary at the top from other properties.
  // Must be done after all async tasks are complete.
  var requiredFeatures = found['HTMLMediaElement'] && found['MediaSource'] &&
                         found['Promise'];
  var qoe = found['getVideoPlaybackQuality'] || found['droppedFrameCount'];
  var subtitles = found['VTTCue'];
  var emeApi = found['MediaKeys'] || found['generateKeyRequest'];
  var emeV01b = found['generateKeyRequest'];
  var latestEme = found['requestMediaKeySystemAccess'] &&
                  found['getConfiguration'];
  var anyKeySystems = found[clearKeyId] || found[widevineId] ||
                      found[playReadyId] || found[adobeAccessId] ||
                      found[fairPlayId];
  var offline = found['indexedDB'];
  var fullscreenApi = found['fullscreenElement'] || found['fullScreenElement'];
  var requiresPolyfills = !latestEme || !found['getVideoPlaybackQuality'] ||
                          !document.fullscreenElement || !found['CustomEvent'];

  var emeStatus, emeValue;
  if (emeApi && anyKeySystems) {
    emeStatus = kGood;
    if (latestEme) {
      emeValue = 'latest EME';
    } else if (emeV01b) {
      emeValue = 'EME v0.1b';
    } else {
      emeValue = 'unknown';
    }
  } else if (emeApi) {
    emeStatus = kBad;
    emeValue = 'no known key systems!';
  } else {
    emeStatus = kInfo;
    emeValue = 'not supported';
  }

  var summary = [];
  summary.push(["userAgent", kInfo, navigator.userAgent]);
  summary.push(reportEntry('Required Features', requiredFeatures, true));
  summary.push(reportEntry('QoE Stats', qoe, false));
  summary.push(reportEntry('Subtitles', subtitles, false));
  summary.push(['Encrypted Content', emeStatus, emeValue]);
  summary.push(reportEntry('Offline Content', offline, false));
  summary.push(['Requires Polyfills', requiresPolyfills ? kInfo : kGood,
                'yes', 'natively supported!']);
  summary.push(reportDivider());

  // Prepend the summary.
  report.unshift.apply(report, summary);

  // Render the final report.
  renderReport();
}

function reportDivider() {
  return ['=====', kInfo, '====='];
}

function reportEntry(name, ok, important) {
  var status = ok ? kGood : (important ? kBad : kInfo);
  var text = ok ? 'OK' : (important ? 'FAIL' : 'missing');
  return [name, status, text];
}

function renderReport() {
  var table = document.createElement('table');
  for (var i = 0; i < report.length; ++i) {
    var tr = document.createElement('tr');
    var td0 = document.createElement('td');
    var td1 = document.createElement('td');
    td0.textContent = report[i][0];
    if (report[i][1] == kGood) td1.style.color = '#070';
    else if (report[i][1] == kBad) td1.style.color = '#700';
    td1.textContent = report[i][2];
    tr.appendChild(td0);
    tr.appendChild(td1);
    table.appendChild(tr);
  }
  document.body.appendChild(table);
}
