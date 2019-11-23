/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @externs
 */


/**
 * A representation of an abortable operation.  Note that these are not
 * cancelable.  Cancelation implies undoing what has been done so far,
 * whereas aborting only means that futher work is stopped.
 *
 * @interface
 * @template T
 * @exportDoc
 */
shaka.extern.IAbortableOperation = function() {};


/**
 * A Promise which represents the underlying operation.  It is resolved when
 * the operation is complete, and rejected if the operation fails or is
 * aborted.  Aborted operations should be rejected with a shaka.util.Error
 * object using the error code OPERATION_ABORTED.
 *
 * @const {!Promise.<T>}
 * @exportDoc
 */
shaka.extern.IAbortableOperation.prototype.promise;


/**
 * Can be called by anyone holding this object to abort the underlying
 * operation.  This is not cancelation, and will not necessarily result in
 * any work being undone.  abort() should return a Promise which is resolved
 * when the underlying operation has been aborted.  The returned Promise
 * should never be rejected.
 *
 * @return {!Promise}
 * @exportDoc
 */
shaka.extern.IAbortableOperation.prototype.abort = function() {};


/**
 * @param {function(boolean)} onFinal A callback to be invoked after the
 *   operation succeeds or fails.  The boolean argument is true if the operation
 *   succeeded and false if it failed.
 * @return {!shaka.extern.IAbortableOperation.<T>} Returns this.
 * @exportDoc
 */
shaka.extern.IAbortableOperation.prototype.finally = function(onFinal) {};
