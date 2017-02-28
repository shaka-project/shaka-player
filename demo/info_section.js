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
var shakaDemo = shakaDemo || {};


/** @private */
shakaDemo.setupInfo_ = function() {
  window.setInterval(shakaDemo.updateDebugInfo_, 125);
  shakaDemo.player_.addEventListener(
      'trackschanged', shakaDemo.onTracksChanged_);
  shakaDemo.player_.addEventListener(
      'adaptation', shakaDemo.onAdaptation_);
  document.getElementById('variantTracks').addEventListener(
      'change', shakaDemo.onTrackSelected_);
  document.getElementById('textTracks').addEventListener(
      'change', shakaDemo.onTrackSelected_);
  document.getElementById('audioLanguages').addEventListener(
      'change', shakaDemo.onAudioLanguageSelected_);
  document.getElementById('textLanguages').addEventListener(
      'change', shakaDemo.onTextLanguageSelected_);
};


/**
 * @param {!Event} event
 * @private
 */
shakaDemo.onTracksChanged_ = function(event) {
  // Update language options first and then populate new tracks with
  // respect to the chosen languages.
  shakaDemo.updateLanguages_();
  shakaDemo.updateVariantTracks_();
  shakaDemo.updateTextTracks_();
};


/**
 * @private
 */
shakaDemo.updateVariantTracks_ = function() {
  var trackList = document.getElementById('variantTracks');
  var langList = document.getElementById('audioLanguages');
  var language = langList.selectedIndex >= 0 ?
      langList.options[langList.selectedIndex].value :
      '';

  var tracks = shakaDemo.player_.getVariantTracks();

  tracks.sort(function(t1, t2) {
    // Sort by bandwidth.
    return t1.bandwidth - t2.bandwidth;
  });

  shakaDemo.updateTrackOptions_(trackList, tracks, language);
};


/**
 * @private
 */
shakaDemo.updateTextTracks_ = function() {
  var trackList = document.getElementById('textTracks');

  var langList = document.getElementById('textLanguages');
  var language = langList.selectedIndex >= 0 ?
      langList.options[langList.selectedIndex].value :
      '';

  var tracks = shakaDemo.player_.getTextTracks();

  shakaDemo.updateTrackOptions_(trackList, tracks, language);
};


/**
 * @param {Element} list
 * @param {!Array.<!shakaExtern.Track>} tracks
 * @param {!string} language
 * @private
 */
shakaDemo.updateTrackOptions_ = function(list, tracks, language) {
  var formatters = {
    variant: function(track) {
      var trackInfo = '';
      if (track.language) trackInfo += 'language: ' + track.language + ', ';
      if (track.width && track.height)
        trackInfo += track.width + 'x' + track.height + ', ';
      trackInfo += track.bandwidth + ' bits/s';
      return trackInfo;
    },
    text: function(track) {
      return 'language: ' + track.language + ' ' +
             '(' + track.kind + ')';
    }
  };

  // Remove old tracks
  while (list.firstChild) {
    list.removeChild(list.firstChild);
  }

  tracks = tracks.filter(function(track) {
    return track.language == language;
  });

  tracks.forEach(function(track) {
    var option = document.createElement('option');
    option.textContent = formatters[track.type](track);
    option.track = track;
    option.value = track.id;
    option.selected = track.active;
    list.appendChild(option);
  });
};


/**
 * @private
 */
shakaDemo.updateLanguages_ = function() {
  shakaDemo.updateTextLanguages_();
  shakaDemo.updateAudioLanguages_();
};


/**
 * Updates options for text language selection.
 * @private
 */
shakaDemo.updateTextLanguages_ = function() {
  var player = shakaDemo.player_;
  var list = document.getElementById('textLanguages');
  var languages = player.getTextLanguages();
  var tracks = player.getTextTracks();

  shakaDemo.updateLanguageOptions_(list, languages, tracks);
};


/**
 * Updates options for audio language selection.
 * @private
 */
shakaDemo.updateAudioLanguages_ = function() {
  var player = shakaDemo.player_;
  var list = document.getElementById('audioLanguages');
  var languages = player.getAudioLanguages();
  var tracks = player.getVariantTracks();

  shakaDemo.updateLanguageOptions_(list, languages, tracks);
};


/**
 * @param {Element} list
 * @param {!Array.<!string>} languages
 * @param {!Array.<shakaExtern.Track>} tracks
 * @private
 */
shakaDemo.updateLanguageOptions_ =
    function(list, languages, tracks) {
  // Remove old options
  while (list.firstChild) {
    list.removeChild(list.firstChild);
  }

  // Using array.filter(f)[0] as an alternative to array.find(f) which is
  // not supported in IE11.
  var activeTracks = tracks.filter(function(track) {
    return track.active == true;
  });
  var selectedTrack = activeTracks[0];

  // Populate list with new options.
  languages.forEach(function(lang) {
    var option = document.createElement('option');
    option.textContent = lang;
    option.value = lang;
    option.selected = lang == selectedTrack.language;
    list.appendChild(option);
  });
};


/**
 * @param {!Event} event
 * @private
 */
shakaDemo.onAdaptation_ = function(event) {
  var list = document.getElementById('variantTracks');

  // Find the row for the active track and select it.
  var tracks = shakaDemo.player_.getVariantTracks();

  tracks.forEach(function(track) {
    if (!track.active) return;

    for (var i = 0; i < list.options.length; ++i) {
      var option = list.options[i];
      if (option.value == track.id) {
        option.selected = true;
        break;
      }
    }
  });
};


/**
 * @param {!Event} event
 * @private
 */
shakaDemo.onTrackSelected_ = function(event) {
  var list = event.target;
  var option = list.options[list.selectedIndex];
  var track = option.track;
  var player = shakaDemo.player_;

  if (list.id == 'variantTracks') {
    // Disable abr manager before changing tracks
    var config = {abr: {enabled: false}};
    player.configure(config);

    player.selectVariantTrack(track, /* clearBuffer */ true);
  } else {
    player.selectTextTrack(track);
  }

  // Adaptation might have been changed by calling selectTrack().
  // Update the adaptation checkbox.
  var enableAdaptation = player.getConfiguration().abr.enabled;
  document.getElementById('enableAdaptation').checked = enableAdaptation;
};


/**
 * @param {!Event} event
 * @private
 */
shakaDemo.onAudioLanguageSelected_ = function(event) {
  var list = event.target;
  var language = list.options[list.selectedIndex].value;
  var player = shakaDemo.player_;

  player.selectAudioLanguage(language);
  shakaDemo.updateVariantTracks_();
};


/**
 * @param {!Event} event
 * @private
 */
shakaDemo.onTextLanguageSelected_ = function(event) {
  var list = event.target;
  var language = list.options[list.selectedIndex].value;
  var player = shakaDemo.player_;

  player.selectTextLanguage(language);
  shakaDemo.updateTextTracks_();
};


/** @private */
shakaDemo.updateDebugInfo_ = function() {
  var video = shakaDemo.video_;

  document.getElementById('videoResDebug').textContent =
      video.videoWidth + ' x ' + video.videoHeight;

  var behind = 0;
  var ahead = 0;

  var currentTime = video.currentTime;
  var buffered = video.buffered;
  for (var i = 0; i < buffered.length; ++i) {
    if (buffered.start(i) <= currentTime && buffered.end(i) >= currentTime) {
      ahead = buffered.end(i) - currentTime;
      behind = currentTime - buffered.start(i);
      break;
    }
  }

  document.getElementById('bufferedDebug').textContent =
      '- ' + behind.toFixed(0) + 's / ' + '+ ' + ahead.toFixed(0) + 's';
};
