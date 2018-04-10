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
  let trackList = document.getElementById('variantTracks');
  let langList = document.getElementById('audioLanguages');
  let languageAndRole = langList.selectedIndex >= 0 ?
      langList.options[langList.selectedIndex].value :
      '';

  let tracks = shakaDemo.player_.getVariantTracks();

  tracks.sort(function(t1, t2) {
    // Sort by bandwidth.
    return t1.bandwidth - t2.bandwidth;
  });

  shakaDemo.updateTrackOptions_(trackList, tracks, languageAndRole);
};


/**
 * @private
 */
shakaDemo.updateTextTracks_ = function() {
  let trackList = document.getElementById('textTracks');

  let langList = document.getElementById('textLanguages');
  let languageAndRole = langList.selectedIndex >= 0 ?
      langList.options[langList.selectedIndex].value :
      '';

  let tracks = shakaDemo.player_.getTextTracks();

  shakaDemo.updateTrackOptions_(trackList, tracks, languageAndRole);

  // CEA 608/708 captions data is embedded inside the video stream.
  // Showing a 'Default Text' option in the Text Track list.
  // Use Default Text Track if there's no external text tracks available.
  if (tracks.length == 0) {
    shakaDemo.player_.selectEmbeddedTextTrack();
  }
  if (ShakaDemoUtils.isTsContent(shakaDemo.player_)) {
    let option = document.createElement('option');
    option.textContent = 'Default Text';
    option.selected = shakaDemo.player_.usingEmbeddedTextTrack();
    trackList.appendChild(option);
  }
};


/**
 * @param {Element} list
 * @param {!Array.<!shakaExtern.Track>} tracks
 * @param {string} languageAndRole
 * @private
 */
shakaDemo.updateTrackOptions_ = function(list, tracks, languageAndRole) {
  let formatters = {
    variant: function(track) {
      let trackInfo = '';
      if (track.language) trackInfo += 'language: ' + track.language + ', ';
      if (track.label) trackInfo += 'label: ' + track.label + ', ';
      if (track.roles.length) {
        trackInfo += 'roles: [' + track.roles.join() + '], ';
      }
      if (track.width && track.height) {
        trackInfo += track.width + 'x' + track.height + ', ';
      }
      if (track.channelsCount) {
        trackInfo += 'channels: ' + track.channelsCount + ', ';
      }
      trackInfo += track.bandwidth + ' bits/s';
      return trackInfo;
    } ,
    text: function(track) {
      let trackInfo = 'language: ' + track.language + ', ';
      if (track.label) trackInfo += 'label: ' + track.label + ', ';
      if (track.roles.length) {
        trackInfo += 'roles: [' + track.roles.join() + '], ';
      }
      trackInfo += 'kind: ' + track.kind;
      return trackInfo;
    }
  };
  // Remove old tracks.
  while (list.firstChild) {
    list.removeChild(list.firstChild);
  }

  // Split language and role.
  let res = languageAndRole.split(':');
  let language = res[0];
  let role = res[1] || '';

  tracks = tracks.filter(function(track) {
    let langMatch = track.language == language;
    let roleMatch = role == '' || track.roles.indexOf(role) > -1;
    return langMatch && roleMatch;
  });

  tracks.forEach(function(track) {
    let option = document.createElement('option');
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
  let player = shakaDemo.player_;
  let list = document.getElementById('textLanguages');
  let languagesAndRoles = player.getTextLanguagesAndRoles();
  let tracks = player.getTextTracks();

  shakaDemo.updateLanguageOptions_(list, languagesAndRoles, tracks);
};


/**
 * Updates options for audio language selection.
 * @private
 */
shakaDemo.updateAudioLanguages_ = function() {
  let player = shakaDemo.player_;
  let list = document.getElementById('audioLanguages');
  let languagesAndRoles = player.getAudioLanguagesAndRoles();
  let tracks = player.getVariantTracks();

  shakaDemo.updateLanguageOptions_(list, languagesAndRoles, tracks);
};


/**
 * @param {Element} list
 * @param {!Array.<{language: string, role: string}>} languagesAndRoles
 * @param {!Array.<shakaExtern.Track>} tracks
 * @private
 */
shakaDemo.updateLanguageOptions_ =
    function(list, languagesAndRoles, tracks) {
  // Remove old options
  while (list.firstChild) {
    list.removeChild(list.firstChild);
  }

  // Using array.filter(f)[0] as an alternative to array.find(f) which is
  // not supported in IE11.
  let activeTracks = tracks.filter(function(track) {
    return track.active == true;
  });
  let selectedTrack = activeTracks[0];

  // Populate list with new options.
  languagesAndRoles.forEach(function(langAndRole) {
    let language = langAndRole.language;
    let role = langAndRole.role;

    let label = language;
    if (role) {
      label += ' (role: ' + role + ')';
    }

    let option = document.createElement('option');
    option.textContent = label;
    option.value = language + ':' + role;
    let isSelected = false;

    if (selectedTrack.language == language) {
      if (selectedTrack.roles.length) {
        selectedTrack.roles.forEach(function(selectedRole) {
          if (selectedRole == role) {
            isSelected = true;
          }
        });
      } else {
        isSelected = true;
      }
    }

    option.selected = isSelected;
    list.appendChild(option);
  });
};


/**
 * @param {!Event} event
 * @private
 */
shakaDemo.onAdaptation_ = function(event) {
  let list = document.getElementById('variantTracks');

  // Find the row for the active track and select it.
  let tracks = shakaDemo.player_.getVariantTracks();

  tracks.forEach(function(track) {
    if (!track.active) return;

    for (let i = 0; i < list.options.length; ++i) {
      let option = list.options[i];
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
  let list = event.target;
  let option = list.options[list.selectedIndex];
  let track = option.track;
  let player = shakaDemo.player_;

  if (list.id == 'variantTracks') {
    // Disable abr manager before changing tracks.
    let config = {abr: {enabled: false}};
    player.configure(config);

    player.selectVariantTrack(track, /* clearBuffer */ true);
  } else {
    // CEA 608/708 captions data is embedded inside the video stream.
    if (option.textContent == 'Default Text') {
      player.selectEmbeddedTextTrack();
    } else {
      player.selectTextTrack(track);
    }
  }

  // Adaptation might have been changed by calling selectTrack().
  // Update the adaptation checkbox.
  let enableAdaptation = player.getConfiguration().abr.enabled;
  document.getElementById('enableAdaptation').checked = enableAdaptation;
};


/**
 * @param {!Event} event
 * @private
 */
shakaDemo.onAudioLanguageSelected_ = function(event) {
  let list = event.target;
  let option = list.options[list.selectedIndex].value;
  let player = shakaDemo.player_;
  let res = option.split(':');
  let language = res[0];
  let role = res[1] || '';
  player.selectAudioLanguage(language, role);
  shakaDemo.updateVariantTracks_();
};


/**
 * @param {!Event} event
 * @private
 */
shakaDemo.onTextLanguageSelected_ = function(event) {
  let list = event.target;
  let option = list.options[list.selectedIndex].value;
  let player = shakaDemo.player_;
  let res = option.split(':');
  let language = res[0];
  let role = res[1] || '';

  player.selectTextLanguage(language, role);
  shakaDemo.updateTextTracks_();
};


/** @private */
shakaDemo.updateDebugInfo_ = function() {
  let video = shakaDemo.video_;

  document.getElementById('videoResDebug').textContent =
      video.videoWidth + ' x ' + video.videoHeight;

  let behind = 0;
  let ahead = 0;

  let currentTime = video.currentTime;
  let buffered = video.buffered;
  for (let i = 0; i < buffered.length; ++i) {
    if (buffered.start(i) <= currentTime && buffered.end(i) >= currentTime) {
      ahead = buffered.end(i) - currentTime;
      behind = currentTime - buffered.start(i);
      break;
    }
  }

  document.getElementById('bufferedDebug').textContent =
      '- ' + behind.toFixed(0) + 's / + ' + ahead.toFixed(0) + 's';
};
