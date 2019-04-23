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
 * Creates and contains the MDL elements of a tooltip.
 */
class ShakaDemoTooltips {
  /**
   * @param {!Element} parentDiv
   * @param {!Element} labeledElement
   * @param {string} message
   */
  static make(parentDiv, labeledElement, message) {
    labeledElement.id = ShakaDemoTooltips.generateNewId_();
    const tooltip = document.createElement('div');
    tooltip.classList.add('mdl-tooltip');
    tooltip.classList.add('mdl-tooltip--large');
    tooltip.setAttribute('for', labeledElement.id);
    tooltip.textContent = message;
    parentDiv.appendChild(tooltip);
  }

  /**
   * @return {string}
   * @private
   */
  static generateNewId_() {
    const idNumber = ShakaDemoTooltips.lastId_;
    ShakaDemoTooltips.lastId_ += 1;
    return 'tooltip-labeled-' + idNumber;
  }
}

/** @private {number} */
ShakaDemoTooltips.lastId_ = 0;
