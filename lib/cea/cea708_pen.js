
goog.provide('shaka.cea.Cea708Pen');
shaka.cea.Cea708Pen = class {
  constructor() {
    /**
       * The row that the pen is currently pointing at.
       * @private {!number}
       */
    this.rowLocation_ = 0;

    /**
       * The column that the pen is currently pointing at.
       * @private {!number}
       */
    this.colLocation_ = 0;

    /**
       * @private {!boolean}
       */
    this.italics_ = false;

    /**
       * @private {!boolean}
       */
    this.underline_ = false;

    /**
     * @private {!string}
     */
    this.textColor_ = 'white'; // Default text color todo

    /**
     * @private {!string}
     */
    this.backgroundColor_ = 'black'; // Default bg color todo
  }

  /**
   * @return {!boolean}
   */
  getItalics() {
    return this.italics_;
  }

  /**
   * @param {!boolean} italics
   */
  setItalics(italics) {
    this.italics_ = italics;
  }

  /**
   * @return {!boolean}
   */
  getUnderline() {
    return this.underline_;
  }

  /**
   * @param {!boolean} underline
   */
  setUnderline(underline) {
    this.underline_ = underline;
  }

  /**
   * @return {!string}
   */
  getTextColor() {
    return this.textColor_;
  }

  /**
   * @param {!string} textColor CSS hex color.
   */
  setTextColor(textColor) {
    this.textColor_ = textColor;
  }

  /**
   * @return {!string}
   */
  getBackgroundColor() {
    return this.backgroundColor_;
  }

  /**
   * @param {!string} backgroundColor CSS hex color.
   */
  setBackgroundColor(backgroundColor) {
    this.backgroundColor_ = backgroundColor;
  }

  /**
   * @return {!number}
   */
  getRowLocation() {
    return this.rowLocation_;
  }

  /**
   * @param {!number} rowLocation
   */
  setRowLocation(rowLocation) {
    this.rowLocation_ = rowLocation;
  }

  /**
   * @return {!number}
   */
  getColLocation() {
    return this.colLocation_;
  }

  /**
   * @param {!number} colLocation
   */
  setColLocation(colLocation) {
    this.colLocation_ = colLocation;
  }
};

