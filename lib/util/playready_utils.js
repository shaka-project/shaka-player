/**
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
 *
 * @fileoverview PlayReady utility functions.
 */

goog.provide('shaka.util.PlayReadyUtils');


/**
 * @namespace shaka.util.PlayReadyUtils
 * @summary A set of playready licensing utilities
 */


/**
 * Standard pre-processor for PlayReady license requests.
 *
 * @param {!shaka.player.DrmSchemeInfo.LicenseRequestInfo}
 *    info The license request info.
 *
 */
shaka.util.PlayReadyUtils.playReadyLicensePreProcessor = function(info) {
  var licenseBodyXml =
    String.fromCharCode.apply(null, new Uint16Array(info.body['buffer']));
  var licenseBodyXmlDom =
    new DOMParser().parseFromString(licenseBodyXml, "application/xml");

  var headerNames = licenseBodyXmlDom.getElementsByTagName("name");
  var headerValues = licenseBodyXmlDom.getElementsByTagName("value");

  for (var i = 0; i < headerNames.length; i++) {
    info.headers[headerNames[i].childNodes[0].nodeValue] =
      headerValues[i].childNodes[0].nodeValue;
  }

  var decodedChallenge = window.atob(licenseBodyXmlDom
    .getElementsByTagName("Challenge")[0].childNodes[0].nodeValue);

  info.body = decodedChallenge;

};


/**
 * Extension for standard pre-processor, can add custom data to the XML
 * @param info
 * @param customData
 */
shaka.util.PlayReadyUtils.playReadyCustomDataPreProcessor =
  function(info, customData) {
    try {
      var insertionPoint = info.body.indexOf('</Challenge>');
      var isInsertable = (insertionPoint !== -1);
      var customData = '' +
        '<CustomData>' +
        window.btoa(JSON.stringify(customData)) +
        '</CustomData>';
      if (isInsertable) {
        info.body = info.body.slice(0, insertionPoint) +
          customData + info.body.slice(insertionPoint);
      }

      console.debug('Added </CustomData>', info.body);

    } catch(e) {
      console.log(e);
    }
  };