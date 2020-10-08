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
 * @externs
 */


/**
 * A representation of an abortable operation.  Note that these are not
 * cancelable.  Cancelation implies undoing what has been done so far,
 * whereas aborting only means that further work is stopped.
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
