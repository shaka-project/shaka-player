/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @externs
 * @suppress {duplicate}
 */

/**
 * @typedef {{
 *   playerName: string,
 *   controlPanelElements: !Array<string>,
 *   addSeekBar: boolean,
 *   overflowMenuButtons: !Array<string>,
 *   confirmBeforeAutoResume: boolean,
 *   enableAirPlay: boolean,
 *   enableAutoResumeLocal: boolean,
 *   enableChromecast: boolean,
 *   enableChapters: boolean,
 *   addBigPlayButton: boolean,
 *   enableDoubleTapSkip: boolean,
 *   enableKeyboardShortcuts: boolean,
 *   enableLockControls: boolean,
 *   enablePiP: boolean,
 *   enableReportBug: boolean,
 *   enableSaveOffline: boolean,
 *   hideControlsOnPause: boolean,
 *   playbackRates: !Array<string>,
 *   primaryColor: string,
 *   showCaptionsControl: boolean,
 *   showFullScreen: boolean,
 *   showPlayPauseBtn: boolean,
 *   showProgressBar: boolean,
 *   showQualityControl: boolean,
 *   showReplayAtEnd: boolean,
 *   showScrubbingPreview: boolean,
 *   showSpeedControl: boolean,
 *   showTimeText: boolean,
 *   skipDuration: number,
 *   conserveVolumeAcrossSession: boolean,
 *   conserveSpeedAcrossSession: boolean,
 *   conserveQualityAcrossSession: boolean,
 *   conserveSelectedCaptionLanguage: boolean,
 *   initialPlayButtonShape: string,
 *   initialDurationPosition: string,
 *   buttonShape: string,
 *   seekBarColors: {
 *     base: string,
 *     buffered: string,
 *     played: string,
 *     adBreaks: string
 *   },
 *   enableTooltips: boolean,
 *   collapseInSettings: !Array<string>,
 *   bigPlayButtonColor: string
 * }}
 *
 * @description
 * Configuration options for the LayoutManager.
 *
 * @property {string} playerName
 *   The name of the player instance.
 * @property {!Array<string>} controlPanelElements
 *   List of UI elements to display in the control panel.
 * @property {boolean} addSeekBar
 *   Whether to add a seek bar to the control panel.
 * @property {!Array<string>} overflowMenuButtons
 *   List of buttons to display in the overflow menu.
 * @property {boolean} confirmBeforeAutoResume
 *   Whether to confirm before auto-resuming playback.
 * @property {boolean} enableAirPlay
 *   Whether to enable AirPlay support.
 * @property {boolean} enableAutoResumeLocal
 *   Whether to enable local auto-resume.
 * @property {!Array<string>} playbackRates
 *   List of available playback rates.
 * @property {string} primaryColor
 *   Primary color for UI elements.
 * @property {string} initialPlayButtonShape
 *   Shape of the initial play button ('Circle' or 'Square').
 * @property {string} initialDurationPosition
 *   Position of the duration display.
 * @property {string} buttonShape
 *   Shape of the play button ('Circle' or 'Square').
 * @property {{
 *   base: string,
 *   buffered: string,
 *   played: string,
 *   adBreaks: string
 * }} seekBarColors Colors for the seek bar.
 * @property {boolean} enableTooltips
 *   Whether to enable tooltips.
 * @property {!Array<string>} collapseInSettings
 *   List of settings to collapse in the settings menu.
 * @property {string} bigPlayButtonColor
 *   Color of the big play button.
 * @exportDoc
 */
shaka.ui.LayoutManager.Options;
