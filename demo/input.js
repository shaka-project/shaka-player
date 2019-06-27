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

goog.provide('shakaDemo.BoolInput');
goog.provide('shakaDemo.DatalistInput');
goog.provide('shakaDemo.Input');
goog.provide('shakaDemo.NumberInput');
goog.provide('shakaDemo.SelectInput');
goog.provide('shakaDemo.TextInput');

/**
 * Creates and contains the MDL elements of a type of input.
 */
shakaDemo.Input = class {
  /**
   * @param {!shakaDemo.InputContainer} parentContainer
   * @param {string} inputType The element type for the input object.
   * @param {string} containerType The element type for the container containing
   *   the input object.
   * @param {string} extraType The element type for the "sibling element" to the
   *   input object. If null, it adds no such element.
   * @param {function(!Element)} onChange
   */
  constructor(parentContainer, inputType, containerType, extraType, onChange) {
    /** @private {!Element} */
    this.container_ = document.createElement(containerType);
    parentContainer.latestElementContainer.appendChild(this.container_);

    /** @private {!Element} */
    this.input_ = document.createElement(inputType);
    this.input_.onchange = () => { onChange(this.input_); };
    this.input_.id = shakaDemo.Input.generateNewId_('input');
    this.container_.appendChild(this.input_);

    if (parentContainer.latestTooltip) {
      // Since the row isn't focusable, add the tooltip information into the
      // accessibility data of the input, so it can be accessed by users using
      // screen readers.
      const extraInfo = document.createElement('span');
      extraInfo.textContent = parentContainer.latestTooltip;
      extraInfo.classList.add('hidden');
      extraInfo.id = shakaDemo.Input.generateNewId_('extra-info');
      this.container_.appendChild(extraInfo);
      this.input_.setAttribute('aria-describedby', extraInfo.id);
    }

    /**
     * Most MDL inputs require some sort of "sibling element" that exists at
     * the same level as the input itself. These other elements are used to
     * create various visual effects, such as the ripple effect.
     * @private {?Element}
     */
    this.extra_ = null;
    if (extraType) {
      this.extra_ = document.createElement(extraType);
      this.container_.appendChild(this.extra_);
    }
  }

  /** @return {!Element} */
  input() {
    return this.input_;
  }

  /** @return {!Element} */
  container() {
    return this.container_;
  }

  /** @return {?Element} */
  extra() {
    return this.extra_;
  }

 /**
  * @param {string} prefix
  * @return {string}
  * @private
  */
 static generateNewId_(prefix) {
   const idNumber = shakaDemo.Input.lastId_;
   shakaDemo.Input.lastId_ += 1;
   return prefix + '-labeled-' + idNumber;
 }
};


/** @private {number} */
shakaDemo.Input.lastId_ = 0;


/**
 * Creates and contains the MDL elements of a select input.
 */
shakaDemo.SelectInput = class extends shakaDemo.Input {
  /**
   * @param {!shakaDemo.InputContainer} parentContainer
   * @param {string} name
   * @param {function(!Element)} onChange
   * @param {!Object.<string, string>} values
   */
  constructor(parentContainer, name, onChange, values) {
    super(parentContainer, 'select', 'div', 'label', onChange);
    this.container_.classList.add('mdl-textfield');
    this.container_.classList.add('mdl-js-textfield');
    this.container_.classList.add('mdl-textfield--floating-label');
    this.input_.classList.add('mdl-textfield__input');
    this.extra_.classList.add('mdl-textfield__label');
    this.extra_.setAttribute('for', this.input_.id);
    for (let value of Object.keys(values)) {
      const option = document.createElement('option');
      option.textContent = values[value];
      option.value = value;
      this.input_.appendChild(option);
    }
  }
};


/**
 * Creates and contains the MDL elements of a bool input.
 */
shakaDemo.BoolInput = class extends shakaDemo.Input {
  /**
   * @param {!shakaDemo.InputContainer} parentContainer
   * @param {string} name
   * @param {function(!Element)} onChange
   */
  constructor(parentContainer, name, onChange) {
    super(parentContainer, 'input', 'label', 'span', onChange);
    this.input_.type = 'checkbox';
    this.container_.classList.add('mdl-switch');
    this.container_.classList.add('mdl-js-switch');
    this.container_.classList.add('mdl-js-ripple-effect');
    this.container_.setAttribute('for', this.input_.id);
    this.input_.classList.add('mdl-switch__input');
    this.extra_.classList.add('mdl-switch__label');
  }
};


/**
 * Creates and contains the MDL elements of a text input.
 */
shakaDemo.TextInput = class extends shakaDemo.Input {
  /**
   * @param {!shakaDemo.InputContainer} parentContainer
   * @param {string} name
   * @param {function(!Element)} onChange
   */
  constructor(parentContainer, name, onChange) {
    super(parentContainer, 'input', 'div', 'label', onChange);
    this.container_.classList.add('mdl-textfield');
    this.container_.classList.add('mdl-js-textfield');
    this.container_.classList.add('mdl-textfield--floating-label');
    this.input_.classList.add('mdl-textfield__input');
    this.extra_.classList.add('mdl-textfield__label');
    this.extra_.setAttribute('for', this.input_.id);
  }
};


/**
 * Creates and contains the MDL elements of a datalist input.
 */
shakaDemo.DatalistInput = class extends shakaDemo.TextInput {
  /**
   * @param {!shakaDemo.InputContainer} parentContainer
   * @param {string} name
   * @param {function(!Element)} onChange
   * @param {!Array.<string>} values
   */
  constructor(parentContainer, name, onChange, values) {
    super(parentContainer, name, onChange);
    // This element is not literally a datalist, as those are not supported on
    // all platforms (and they also have no MDL style support).
    // Instead, this is using the third-party "awesomplete" module, which acts
    // as a text field with autocomplete selection.
    const awesomplete = new Awesomplete(this.input_);
    awesomplete.list = values.slice(); // Make a local copy of the values list.
    awesomplete.minChars = 0;
    this.input_.addEventListener('focus', () => {
      // By default, awesomplete does not show suggestions on focusing on the
      // input, only on typing something.
      // This manually updates the suggestions, so that they will show up.
      awesomplete.evaluate();
    });
  }
};


/**
 * Creates and contains the MDL elements of a number input.
 */
shakaDemo.NumberInput = class extends shakaDemo.TextInput {
  /**
   * @param {!shakaDemo.InputContainer} parentContainer
   * @param {string} name
   * @param {function(!Element)} onChange
   * @param {boolean} canBeDecimal
   * @param {boolean} canBeZero
   * @param {boolean} canBeUnset
   */
  constructor(
      parentContainer, name, onChange, canBeDecimal, canBeZero, canBeUnset) {
    super(parentContainer, name, onChange);
    const error = document.createElement('span');
    error.classList.add('mdl-textfield__error');
    this.container_.appendChild(error);

    error.textContent = 'Must be a positive';
    this.input_.pattern = '(Infinity|';
    if (canBeZero) {
      this.input_.pattern += '[0-9]*';
    } else {
      this.input_.pattern += '[0-9]*[1-9][0-9]*';
      error.textContent += ', nonzero';
    }
    if (canBeDecimal) {
      // TODO: Handle commas as decimal delimeters, for appropriate regions?
      this.input_.pattern += '(.[0-9]+)?';
      error.textContent += ' number.';
    } else {
      error.textContent += ' integer.';
    }
    this.input_.pattern += ')';
    if (canBeUnset) {
      this.input_.pattern += '?';
    }
  }
};
