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

goog.provide('shaka.test.FakeAbrManager');
goog.provide('shaka.test.FakeDrmEngine');
goog.provide('shaka.test.FakeManifestParser');
goog.provide('shaka.test.FakeStreamingEngine');



/**
 * A fake AbrManager.
 *
 * @constructor
 * @struct
 * @implements {shakaExtern.AbrManager}
 */
shaka.test.FakeAbrManager = function() {
  /** @type {number} */
  this.chooseIndex = 0;

  spyOn(this, 'chooseStreams').and.callThrough();
  spyOn(this, 'stop');
  spyOn(this, 'init');
  spyOn(this, 'enable');
  spyOn(this, 'disable');
  spyOn(this, 'segmentDownloaded');
  spyOn(this, 'getBandwidthEstimate');
  spyOn(this, 'setDefaultEstimate');
};


/** @override */
shaka.test.FakeAbrManager.prototype.stop = function() {};


/** @override */
shaka.test.FakeAbrManager.prototype.init = function() {};


/** @override */
shaka.test.FakeAbrManager.prototype.enable = function() {};


/** @override */
shaka.test.FakeAbrManager.prototype.disable = function() {};


/** @override */
shaka.test.FakeAbrManager.prototype.segmentDownloaded = function() {};


/** @override */
shaka.test.FakeAbrManager.prototype.getBandwidthEstimate = function() {};


/** @override */
shaka.test.FakeAbrManager.prototype.setDefaultEstimate = function() {};


/** @override */
shaka.test.FakeAbrManager.prototype.chooseStreams = function(
    streamSetsByType) {
  var ret = {};
  Object.keys(streamSetsByType).forEach(function(type) {
    ret[type] = streamSetsByType[type].streams[this.chooseIndex];
  }.bind(this));
  return ret;
};



/**
 * A fake DrmEngine.
 *
 * @constructor
 * @struct
 * @extends {shaka.media.DrmEngine}
 */
shaka.test.FakeDrmEngine = function() {
  var resolve = Promise.resolve.bind(Promise);

  var ret = jasmine.createSpyObj('FakeDrmEngine', [
    'destroy', 'configure', 'init', 'attach', 'initialized', 'keySystem',
    'getSupportedTypes'
  ]);
  ret.destroy.and.callFake(resolve);
  ret.init.and.callFake(resolve);
  ret.attach.and.callFake(resolve);
  ret.initialized.and.returnValue(true);
  ret.keySystem.and.returnValue('com.example.fake');
  // See shaka.test.ManifestGenerator.protototype.createStream.
  ret.getSupportedTypes.and.returnValue(
      ['video/mp4; codecs="avc1.4d401f"']);
  return ret;
};



/**
 * A fake StreamingEngine.
 *
 * @constructor
 * @param {shakaExtern.Period} period
 * @struct
 * @extends {shaka.media.StreamingEngine}
 */
shaka.test.FakeStreamingEngine = function(period) {
  var resolve = Promise.resolve.bind(Promise);
  var activeStreams = {};
  period.streamSets.forEach(function(streamSet) {
    if (activeStreams[streamSet.type]) return;
    activeStreams[streamSet.type] = streamSet.streams[0];
  });

  var ret = jasmine.createSpyObj('fakeStreamingEngine', [
    'destroy', 'configure', 'init', 'getCurrentPeriod', 'getActiveStreams',
    'notifyNewStream', 'switch', 'seeked'
  ]);
  ret.destroy.and.callFake(resolve);
  ret.getCurrentPeriod.and.returnValue(period);
  ret.getActiveStreams.and.returnValue(activeStreams);
  ret.notifyNewStream.and.callFake(resolve);
  ret.switch.and.callFake(function(type, stream) {
    activeStreams[type] = stream;
  });
  return ret;
};



/**
 * Creates a fake manifest parser.
 *
 * @constructor
 * @param {shakaExtern.Manifest} manifest
 * @struct
 * @implements {shakaExtern.ManifestParser}
 */
shaka.test.FakeManifestParser = function(manifest) {
  /** @private {shakaExtern.Manifest} */
  this.manifest_ = manifest;

  spyOn(this, 'start').and.callThrough();
  spyOn(this, 'stop').and.callThrough();
  spyOn(this, 'configure');
};


/**
 * Creates a factory function that creates a fake manifest parser.
 *
 * @param {shakaExtern.Manifest} manifest
 * @return {shakaExtern.ManifestParser.Factory}
 */
shaka.test.FakeManifestParser.createFactory = function(manifest) {
  return function() { return new shaka.test.FakeManifestParser(manifest); };
};


/** @override */
shaka.test.FakeManifestParser.prototype.start = function() {
  return Promise.resolve(this.manifest_);
};


/** @override */
shaka.test.FakeManifestParser.prototype.stop = function() {
  return Promise.resolve();
};


/** @override */
shaka.test.FakeManifestParser.prototype.configure = function() {};
