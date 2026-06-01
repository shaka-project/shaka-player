/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shakaDemo.Icons');

/* The SVG path-data constants below are long single lines. */
/* eslint @stylistic/max-len: ["error", { "code": 1000 }] */


/**
 * SVG path data for the icons used by the demo, plus a helper to render them as
 * inline SVG elements.  This mirrors the approach used by the player UI (see
 * shaka.ui.Enums and shaka.ui.Icon), but is kept self-contained so the demo
 * does not depend on UI-internal classes.
 *
 * The path data is from the Material Symbols Rounded (filled) set, on the same
 * "0 -960 960 960" viewBox the player UI uses, fetched from:
 * https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsrounded/<icon>/fill1/24px.svg
 */
shakaDemo.Icons = class {
  /**
   * Builds an inline SVG icon element from one of the path-data constants
   * below.
   *
   * @param {string} path
   * @return {!Element}
   */
  static makeSvgIcon(path) {
    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.classList.add('demo-icon');
    svg.setAttribute('viewBox', '0 -960 960 960');
    // Screen readers should ignore decorative icons.
    svg.setAttribute('aria-hidden', 'true');
    const pathElement = document.createElementNS(svgNs, 'path');
    pathElement.setAttribute('d', path);
    svg.appendChild(pathElement);
    return svg;
  }
};


/** @const {string} */
shakaDemo.Icons.CLOSE = 'M480-424 284-228q-11 11-28 11t-28-11q-11-11-11-28t11-28l196-196-196-196q-11-11-11-28t11-28q11-11 28-11t28 11l196 196 196-196q11-11 28-11t28 11q11 11 11 28t-11 28L536-480l196 196q11 11 11 28t-11 28q-11 11-28 11t-28-11L480-424Z';


/** @const {string} */
shakaDemo.Icons.HELP = 'M513.5-254.5Q528-269 528-290t-14.5-35.5Q499-340 478-340t-35.5 14.5Q428-311 428-290t14.5 35.5Q457-240 478-240t35.5-14.5ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm4-572q25 0 43.5 16t18.5 40q0 22-13.5 39T502-525q-23 20-40.5 44T444-427q0 14 10.5 23.5T479-394q15 0 25.5-10t13.5-25q4-21 18-37.5t30-31.5q23-22 39.5-48t16.5-58q0-51-41.5-83.5T484-720q-38 0-72.5 16T359-655q-7 12-4.5 25.5T368-609q14 8 29 5t25-17q11-15 27.5-23t34.5-8Z';


/** @const {string} */
shakaDemo.Icons.DOWNLOAD = 'M480-337q-8 0-15-2.5t-13-8.5L308-492q-12-12-11.5-28t11.5-28q12-12 28.5-12.5T365-549l75 75v-286q0-17 11.5-28.5T480-800q17 0 28.5 11.5T520-760v286l75-75q12-12 28.5-11.5T652-548q11 12 11.5 28T652-492L508-348q-6 6-13 8.5t-15 2.5ZM240-160q-33 0-56.5-23.5T160-240v-80q0-17 11.5-28.5T200-360q17 0 28.5 11.5T240-320v80h480v-80q0-17 11.5-28.5T760-360q17 0 28.5 11.5T800-320v80q0 33-23.5 56.5T720-160H240Z';


/** @const {string} */
shakaDemo.Icons.OFFLINE_PIN = 'M360-280h240q17 0 28.5-11.5T640-320q0-17-11.5-28.5T600-360H360q-17 0-28.5 11.5T320-320q0 17 11.5 28.5T360-280Zm78-232-58-58q-11-11-28-11t-28 11q-11 11-11 28t11 28l86 86q12 12 28 12t28-12l170-170q12-12 11.5-28.5T635-654q-12-11-28.5-10.5T579-653L438-512Zm42 432q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z';


/** @const {string} */
shakaDemo.Icons.ADD = 'M440-440H240q-17 0-28.5-11.5T200-480q0-17 11.5-28.5T240-520h200v-200q0-17 11.5-28.5T480-760q17 0 28.5 11.5T520-720v200h200q17 0 28.5 11.5T760-480q0 17-11.5 28.5T720-440H520v200q0 17-11.5 28.5T480-200q-17 0-28.5-11.5T440-240v-200Z';


/** @const {string} */
shakaDemo.Icons.SETTINGS = 'M433-80q-27 0-46.5-18T363-142l-9-66q-13-5-24.5-12T307-235l-62 26q-25 11-50 2t-39-32l-47-82q-14-23-8-49t27-43l53-40q-1-7-1-13.5v-27q0-6.5 1-13.5l-53-40q-21-17-27-43t8-49l47-82q14-23 39-32t50 2l62 26q11-8 23-15t24-12l9-66q4-26 23.5-44t46.5-18h94q27 0 46.5 18t23.5 44l9 66q13 5 24.5 12t22.5 15l62-26q25-11 50-2t39 32l47 82q14 23 8 49t-27 43l-53 40q1 7 1 13.5v27q0 6.5-2 13.5l53 40q21 17 27 43t-8 49l-48 82q-14 23-39 32t-50-2l-60-26q-11 8-23 15t-24 12l-9 66q-4 26-23.5 44T527-80h-94Zm49-260q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Z';
