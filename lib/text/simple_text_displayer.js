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

goog.provide('shaka.text.SimpleTextDisplayer');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.text.Cue');
goog.require('shaka.text.CueRegion');
goog.require('shaka.util.Functional');



/**
 * <p>
 * This defines the default text displayer plugin. An instance of this
 * class is used when no custom displayer is given.
 * </p>
 * <p>
 * This class simply converts shaka.text.Cue objects to
 * TextTrackCues and feeds them to the browser.
 * </p>
 *
 * @param {HTMLMediaElement} video
 * @constructor
 * @struct
 * @implements {shakaExtern.TextDisplayer}
 * @export
 */
shaka.text.SimpleTextDisplayer = function(video) {
  /** @private {TextTrack} */
  this.textTrack_ = null;

  /** @private {HTMLMediaElement} */
  this.video_ = video;

  // TODO: Test that in all cases, the built-in CC controls in the video element
  // are toggling our TextTrack.

  // If the video element has TextTracks, disable them.  If we see one that
  // was created by a previous instance of Shaka Player, reuse it.
  for (let i = 0; i < video.textTracks.length; ++i) {
    let track = video.textTracks[i];
    track.mode = 'disabled';

    if (track.label == shaka.text.SimpleTextDisplayer.TextTrackLabel_) {
      this.textTrack_ = track;
    }
  }

  if (!this.textTrack_) {
    // As far as I can tell, there is no observable difference between setting
    // kind to 'subtitles' or 'captions' when creating the TextTrack object.
    // The individual text tracks from the manifest will still have their own
    // kinds which can be displayed in the app's UI.
    this.textTrack_ = video.addTextTrack(
        'subtitles', shaka.text.SimpleTextDisplayer.TextTrackLabel_);
  }
  this.textTrack_.mode = 'hidden';

  // Since |textTrack_.cues| can be null if the track is disabled, cache a
  // reference to the list so that we can always read it.
  /** @private {TextTrackCueList} */
  this.textTrackCues_ = this.textTrack_.cues;
  goog.asserts.assert(
      this.textTrackCues_,
      'Cues should be accessible when mode is set to "hidden".');
};


/**
 * @override
 * @export
 */
shaka.text.SimpleTextDisplayer.prototype.remove = function(start, end) {
  // Check that the displayer hasn't been destroyed.
  if (!this.textTrack_) return false;

  this.removeWhere_(function(cue) {
    if (cue.startTime >= end || cue.endTime <= start) {
      // Outside the remove range.  Hang on to it.
      return false;
    }
    return true;
  });

  return true;
};


/**
 * @override
 * @export
 */
shaka.text.SimpleTextDisplayer.prototype.append = function(cues) {
  // Convert regions.
  let vttRegions = [];
  if (window.VTTRegion) {
    let regions = cues.map((cue) => cue.region);
    regions = regions.filter(shaka.util.Functional.isNotDuplicate);

    for (let i = 0; i < regions.length; i++) {
      let region = this.convertToVttRegion_(regions[i]);
      vttRegions.push(region);
    }
  }

  // Convert cues.
  let textTrackCues = [];
  for (let i = 0; i < cues.length; i++) {
    let cue = this.convertToTextTrackCue_(cues[i], vttRegions);
    if (cue) {
      textTrackCues.push(cue);
    }
  }

  // Sort the cues based on start/end times.  Make a copy of the array so
  // we can get the index in the original ordering.  Out of order cues are
  // rejected by IE/Edge.  See https://goo.gl/BirBy9
  let sortedCues = textTrackCues.slice().sort(function(a, b) {
    if (a.startTime != b.startTime) {
      return a.startTime - b.startTime;
    } else if (a.endTime != b.endTime) {
      return a.endTime - b.startTime;
    } else {
      // The browser will display cues with identical time ranges from the
      // bottom up.  Reversing the order of equal cues means the first one
      // parsed will be at the top, as you would expect.
      // See https://github.com/google/shaka-player/issues/848 for more info.
      return textTrackCues.indexOf(b) - textTrackCues.indexOf(a);
    }
  });

  sortedCues.forEach(function(cue) {
    this.textTrack_.addCue(cue);
  }.bind(this));
};


/**
 * @override
 * @export
 */
shaka.text.SimpleTextDisplayer.prototype.destroy = function() {
  if (this.textTrack_) {
    this.removeWhere_(function(cue) { return true; });
  }

  this.textTrack_ = null;
  this.video_ = null;
  return Promise.resolve();
};


/**
 * @override
 * @export
 */
shaka.text.SimpleTextDisplayer.prototype.isTextVisible = function() {
  return this.textTrack_.mode == 'showing';
};


/**
 * @override
 * @export
 */
shaka.text.SimpleTextDisplayer.prototype.setTextVisibility = function(on) {
  this.textTrack_.mode = on ? 'showing' : 'hidden';
};


/**
 * @param {!shakaExtern.Cue} shakaCue
 * @param {!Array.<!VTTRegion>} regions
 * @return {TextTrackCue}
 * @private
 */
shaka.text.SimpleTextDisplayer.prototype.convertToTextTrackCue_ =
    function(shakaCue, regions) {
  if (shakaCue.startTime >= shakaCue.endTime) {
    // IE/Edge will throw in this case.
    // See issue #501
    shaka.log.warning('Invalid cue times: ' + shakaCue.startTime +
                      ' - ' + shakaCue.endTime);
    return null;
  }

  const Cue = shaka.text.Cue;
  /** @type {VTTCue} */
  let vttCue = new VTTCue(shakaCue.startTime,
                          shakaCue.endTime,
                          shakaCue.payload);

  // NOTE: positionAlign and lineAlign settings are not supported by Chrome
  // at the moment, so setting them will have no effect.
  // The bug on chromium to implement them:
  // https://bugs.chromium.org/p/chromium/issues/detail?id=633690

  vttCue.lineAlign = shakaCue.lineAlign;
  vttCue.positionAlign = shakaCue.positionAlign;
  vttCue.size = shakaCue.size;
  try {
    // Safari 10 seems to throw on align='center'.
    vttCue.align = shakaCue.textAlign;
  } catch (exception) {}

  if (shakaCue.textAlign == 'center' && vttCue.align != 'center') {
    // We want vttCue.position = 'auto'. By default, |position| is set to
    // "auto". If we set it to "auto" safari will throw an exception, so we
    // must rely on the default value.
    vttCue.align = 'middle';
  }

  if (shakaCue.writingDirection ==
          Cue.writingDirection.VERTICAL_LEFT_TO_RIGHT) {
    vttCue.vertical = 'lr';
  } else if (shakaCue.writingDirection ==
           Cue.writingDirection.VERTICAL_RIGHT_TO_LEFT) {
    vttCue.vertical = 'rl';
  }

  // snapToLines flag is true by default
  if (shakaCue.lineInterpretation == Cue.lineInterpretation.PERCENTAGE) {
    vttCue.snapToLines = false;
  }

  if (shakaCue.line != null) {
    vttCue.line = shakaCue.line;
  }

  if (shakaCue.position != null) {
    vttCue.position = shakaCue.position;
  }

  if (shakaCue.region.id.length) {
    let regionsWithId =
      regions.filter((reg) => reg.id == shakaCue.region.id);

    if (regionsWithId.length) {
      vttCue.region = regionsWithId[0];
    }
  }

  return vttCue;
};


/**
 * @param {!shakaExtern.CueRegion} shakaRegion
 * @return {VTTRegion}
 * @private
 */
shaka.text.SimpleTextDisplayer.prototype.convertToVttRegion_ =
    function(shakaRegion) {
  goog.asserts.assert(window.VTTRegion != null,
                      'VTTRegions should be supported!');

  let region = new VTTRegion();
  const CueRegion = shaka.text.CueRegion;
  let videoWidth = this.video_.offsetWidth;
  let videoHeight = this.video_.offsetHeight;

  region.id = shakaRegion.id;
  region.regionAnchorX = shakaRegion.regionAnchorX;
  region.regionAnchorY = shakaRegion.regionAnchorY;
  region.scroll = shakaRegion.scroll;
  if (shakaRegion.heightUnits == CueRegion.units.LINES) {
    // VTTRegion only supports height in lines via the 'lines' property.
    region.lines = shakaRegion.height;
  }

  goog.asserts.assert(shakaRegion.widthUnits != CueRegion.units.LINES,
                      'Width should be set either in percentage or pixels!');

  if (shakaRegion.widthUnits == CueRegion.units.PX) {
    // VTTRegion expects the values to be given in percentage of the video
    // height and width.
    region.width = shakaRegion.width * 100 / videoWidth;
  } else {
    region.width = shakaRegion.width;
  }

  goog.asserts.assert(shakaRegion.viewportAnchorUnits != CueRegion.units.LINES,
                      'Anchors should be set either in percentage or pixels!');
  if (shakaRegion.viewportAnchorUnits == CueRegion.units.PX) {
    // VTTRegion expects the values to be given in percentage of the video
    // height and width.
    region.viewportAnchorX =
              shakaRegion.viewportAnchorX * 100 / videoWidth;
    region.viewportAnchorY =
              shakaRegion.viewportAnchorY * 100 / videoHeight;
  } else {
    region.viewportAnchorX = shakaRegion.viewportAnchorX;
    region.viewportAnchorY = shakaRegion.viewportAnchorY;
  }

  return region;
};
/**
 * Remove all cues for which the matching function returns true.
 *
 * @param {function(!TextTrackCue):boolean} predicate
 * @private
 */
shaka.text.SimpleTextDisplayer.prototype.removeWhere_ = function(predicate) {
  let cues = this.textTrackCues_;
  let removeMe = [];

  // Remove these in another loop to avoid mutating the TextTrackCueList
  // while iterating over it.  This allows us to avoid making assumptions
  // about whether or not this.textTrack_.remove() will alter that list.
  for (let i = 0; i < cues.length; ++i) {
    if (predicate(cues[i])) {
      removeMe.push(cues[i]);
    }
  }

  for (let i = 0; i < removeMe.length; ++i) {
    this.textTrack_.removeCue(removeMe[i]);
  }
};


/**
 * @const {string}
 * @private
 */
shaka.text.SimpleTextDisplayer.TextTrackLabel_ = 'Shaka Player TextTrack';
