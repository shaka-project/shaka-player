/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shakaDemo.BoolInput');
goog.provide('shakaDemo.DatalistInput');
goog.provide('shakaDemo.Input');
goog.provide('shakaDemo.NumberInput');
goog.provide('shakaDemo.SelectInput');
goog.provide('shakaDemo.TextInput');

goog.require('shakaDemo.MessageIds');
goog.requireType('shakaDemo.InputContainer');

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
   * @param {function(!HTMLInputElement, !shakaDemo.Input)} onChange
   */
  constructor(parentContainer, inputType, containerType, extraType, onChange) {
    /** @private {!Element} */
    this.container_ = document.createElement(containerType);
    parentContainer.latestElementContainer.appendChild(this.container_);

    /** @private {!HTMLInputElement} */
    this.input_ =
      /** @type {!HTMLInputElement} */(document.createElement(inputType));
    this.input_.onchange = () => {
      onChange(this.input_, this);
    };
    // <textarea> elements need to also react to 'input' events.
    if (inputType == 'textarea') {
      this.input_.oninput = () => {
        onChange(this.input_, this);
      };
    }
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

  /** @return {!HTMLInputElement} */
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

  /** @param {boolean} valid */
  setValid(valid) {
    if (valid) {
      this.input_.setCustomValidity('');  // valid
      this.container_.classList.remove('is-invalid');
    } else {
      this.input_.setCustomValidity('invalid');  // any message will do
      this.container_.parentElement.classList.add('is-invalid');
    }
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
   * @param {?shakaDemo.MessageIds} name
   * @param {function(!HTMLInputElement, !shakaDemo.Input)} onChange
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
    if (name) {
      this.extra_.textContent = shakaDemoMain.getLocalizedString(name);
    }
    for (const value of Object.keys(values)) {
      const option =
        /** @type {!HTMLOptionElement} */(document.createElement('option'));
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
   * @param {function(!HTMLInputElement, !shakaDemo.Input)} onChange
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
   * @param {function(!HTMLInputElement, !shakaDemo.Input)} onChange
   * @param {boolean=} isTextArea
   */
  constructor(parentContainer, name, onChange, isTextArea) {
    super(parentContainer, isTextArea ? 'textarea' : 'input', 'div', 'label',
        onChange);
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
   * @param {function(!HTMLInputElement, !shakaDemo.Input)} onChange
   * @param {!Array.<string>} values
   */
  constructor(parentContainer, name, onChange, values) {
    super(parentContainer, name, onChange, /* isTextArea= */ false);
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
    this.input_.addEventListener('awesomplete-selectcomplete', () => {
      onChange(this.input_, this);
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
   * @param {function(!HTMLInputElement, !shakaDemo.Input)} onChange
   * @param {boolean} canBeDecimal
   * @param {boolean} canBeZero
   * @param {boolean} canBeUnset
   */
  constructor(
      parentContainer, name, onChange, canBeDecimal, canBeZero, canBeUnset) {
    super(parentContainer, name, onChange, /* isTextArea= */ false);
    const error = document.createElement('span');
    error.classList.add('mdl-textfield__error');
    this.container_.appendChild(error);

    const MessageIds = shakaDemo.MessageIds;
    const localize = (name) => shakaDemoMain.getLocalizedString(name);
    if (canBeZero && canBeDecimal) {
      error.textContent = localize(MessageIds.NUMBER_DECIMAL_WARNING);
    } else if (canBeZero) {
      error.textContent = localize(MessageIds.NUMBER_INTEGER_WARNING);
    } else if (canBeDecimal) {
      error.textContent =
          localize(MessageIds.NUMBER_NONZERO_DECIMAL_WARNING);
    } else {
      error.textContent =
          localize(MessageIds.NUMBER_NONZERO_INTEGER_WARNING);
    }

    this.input_.pattern = '(Infinity|';
    if (canBeZero) {
      this.input_.pattern += '[0-9]*';
    } else {
      this.input_.pattern += '[0-9]*[1-9][0-9]*';
    }
    if (canBeDecimal) {
      // TODO: Handle commas as decimal delimeters, for appropriate regions?
      this.input_.pattern += '(.[0-9]+)?';
    }
    this.input_.pattern += ')';
    if (canBeUnset) {
      this.input_.pattern += '?';
    }
  }
};
