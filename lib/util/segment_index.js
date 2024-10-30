goog.provide('shaka.util.CloseSegmentIndexRegister');

/**
 * @summary a register which provides an interface
 * to close shaka.media.SegmentIndex
 * @export
 */
shaka.util.CloseSegmentIndexRegister = class {
  /** */
  constructor() {
    /** @private {!Array.<Function>} */
    this.register_ = [];
  }

  /**
     * add function which closes shaka.media.SegmentIndex
     * from the stream
     * @param {Function} closeSegmentIndexFunction
     */
  add(closeSegmentIndexFunction) {
    if (closeSegmentIndexFunction) {
      this.register_.push(closeSegmentIndexFunction);
    }
  }

  /**
     * close shaka.media.SegmentIndex from register
     */
  closeSegmentIndexes() {
    for (const closeSegmentIndexFunction of this.register_) {
      if (closeSegmentIndexFunction) {
        closeSegmentIndexFunction();
      }
    }
  }
};
