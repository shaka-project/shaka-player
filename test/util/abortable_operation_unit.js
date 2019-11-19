/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('AbortableOperation', () => {
  const Util = shaka.test.Util;

  describe('promise', () => {
    it('is resolved by the constructor argument', async () => {
      const promise = new shaka.util.PublicPromise();
      const abort = () => Promise.resolve();

      const operation = new shaka.util.AbortableOperation(promise, abort);
      promise.resolve(100);

      const value = await operation.promise;
      expect(value).toBe(100);
    });
  });

  describe('abort', () => {
    it('calls the abort argument from the constructor', () => {
      const promise = Promise.resolve();
      const abort =
          jasmine.createSpy('abort').and.returnValue(Promise.resolve());

      const operation = new shaka.util.AbortableOperation(
          promise, shaka.test.Util.spyFunc(abort));
      operation.abort();
      expect(abort).toHaveBeenCalled();
    });

    it('is resolved when the underlying abort() is resolved', async () => {
      /** @type {!shaka.util.PublicPromise} */
      const p = new shaka.util.PublicPromise();
      const abort = jasmine.createSpy('abort').and.returnValue(p);

      const operation = new shaka.util.AbortableOperation(
          new shaka.util.PublicPromise(), shaka.test.Util.spyFunc(abort));

      const abortComplete = jasmine.createSpy('abort complete');
      operation.abort().then(shaka.test.Util.spyFunc(abortComplete), fail);

      expect(abortComplete).not.toHaveBeenCalled();
      await shaka.test.Util.shortDelay();
      // Nothing has happened yet, so abort is not complete.
      expect(abortComplete).not.toHaveBeenCalled();
      // Resolve the underlying Promise.
      p.resolve();

      await shaka.test.Util.shortDelay();
      // The abort is now complete.
      expect(abortComplete).toHaveBeenCalled();
    });
  });

  describe('failed', () => {
    it('creates a failed operation with the given error', async () => {
      const error = new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.MALFORMED_DATA_URI);

      const operation = shaka.util.AbortableOperation.failed(error);
      await expectAsync(operation.promise)
          .toBeRejectedWith(Util.jasmineError(error));
    });
  });

  describe('aborted', () => {
    it('creates a failed operation with OPERATION_ABORTED', async () => {
      const error = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.PLAYER,
          shaka.util.Error.Code.OPERATION_ABORTED));

      const operation = shaka.util.AbortableOperation.aborted();
      await expectAsync(operation.promise).toBeRejectedWith(error);
    });
  });

  describe('completed', () => {
    it('creates a completed operation with the given value', async () => {
      const operation = shaka.util.AbortableOperation.completed(100);
      const value = await operation.promise;
      expect(value).toBe(100);
    });
  });

  describe('notAbortable', () => {
    it('creates an operation from the given promise', async () => {
      /** @type {!shaka.util.PublicPromise} */
      const promise = new shaka.util.PublicPromise();
      const operation = shaka.util.AbortableOperation.notAbortable(promise);

      let isAborted = false;
      operation.abort().then(() => {
        isAborted = true;
      });

      let isComplete = false;
      operation.promise.catch(fail).then((value) => {
        isComplete = true;
        expect(value).toBe(100);
      });

      await shaka.test.Util.shortDelay();
      // Even though we called abort(), the operation hasn't completed
      // because it isn't abortable.  The abort() Promise hasn't been
      // resolved yet, either.
      expect(isComplete).toBe(false);
      expect(isAborted).toBe(false);

      promise.resolve(100);
      await shaka.test.Util.shortDelay();

      // Now that we resolved the underlying promise, the operation is
      // complete, and so is the abort() Promise.
      expect(isComplete).toBe(true);
      expect(isAborted).toBe(true);
    });
  });  // describe('notAbortable')

  describe('all', () => {
    it('creates a successful operation when all succeed', async () => {
      /** @type {!shaka.util.PublicPromise} */
      const p1 = new shaka.util.PublicPromise();
      const op1 = shaka.util.AbortableOperation.notAbortable(p1);

      /** @type {!shaka.util.PublicPromise} */
      const p2 = new shaka.util.PublicPromise();
      const op2 = shaka.util.AbortableOperation.notAbortable(p2);

      /** @type {!shaka.util.PublicPromise} */
      const p3 = new shaka.util.PublicPromise();
      const op3 = shaka.util.AbortableOperation.notAbortable(p3);

      const all = shaka.util.AbortableOperation.all([op1, op2, op3]);

      const onSuccessSpy = jasmine.createSpy('onSuccess');
      const onSuccess = shaka.test.Util.spyFunc(onSuccessSpy);
      const onErrorSpy = jasmine.createSpy('onError');
      const onError = shaka.test.Util.spyFunc(onErrorSpy);

      all.promise.then(onSuccess, onError);

      await shaka.test.Util.shortDelay();
      expect(onSuccessSpy).not.toHaveBeenCalled();
      expect(onErrorSpy).not.toHaveBeenCalled();
      p1.resolve();
      await shaka.test.Util.shortDelay();

      expect(onSuccessSpy).not.toHaveBeenCalled();
      expect(onErrorSpy).not.toHaveBeenCalled();
      p2.resolve();
      await shaka.test.Util.shortDelay();

      expect(onSuccessSpy).not.toHaveBeenCalled();
      expect(onErrorSpy).not.toHaveBeenCalled();
      p3.resolve();
      await shaka.test.Util.shortDelay();

      expect(onSuccessSpy).toHaveBeenCalled();
      expect(onErrorSpy).not.toHaveBeenCalled();
    });

    it('creates a failed operation when any fail', async () => {
      /** @type {!shaka.util.PublicPromise} */
      const p1 = new shaka.util.PublicPromise();
      const op1 = shaka.util.AbortableOperation.notAbortable(p1);

      /** @type {!shaka.util.PublicPromise} */
      const p2 = new shaka.util.PublicPromise();
      const op2 = shaka.util.AbortableOperation.notAbortable(p2);

      const p3 = new shaka.util.PublicPromise();
      const op3 = shaka.util.AbortableOperation.notAbortable(p3);

      const all = shaka.util.AbortableOperation.all([op1, op2, op3]);

      const onSuccessSpy = jasmine.createSpy('onSuccess');
      const onSuccess = shaka.test.Util.spyFunc(onSuccessSpy);
      const onErrorSpy = jasmine.createSpy('onError');
      const onError = shaka.test.Util.spyFunc(onErrorSpy);

      all.promise.then(onSuccess, onError);

      await shaka.test.Util.shortDelay();
      expect(onSuccessSpy).not.toHaveBeenCalled();
      expect(onErrorSpy).not.toHaveBeenCalled();
      p1.resolve();
      await shaka.test.Util.shortDelay();

      expect(onSuccessSpy).not.toHaveBeenCalled();
      expect(onErrorSpy).not.toHaveBeenCalled();
      p2.reject('error');
      await shaka.test.Util.shortDelay();

      expect(onSuccessSpy).not.toHaveBeenCalled();
      expect(onErrorSpy).toHaveBeenCalledWith('error');
    });

    it('aborts all operations on abort', async () => {
      /** @type {!shaka.util.PublicPromise} */
      const p1 = new shaka.util.PublicPromise();
      const abort1Spy = jasmine.createSpy('abort1')
          .and.callFake(() => p1.reject());
      const abort1 = shaka.test.Util.spyFunc(abort1Spy);
      const op1 = new shaka.util.AbortableOperation(p1, abort1);

      /** @type {!shaka.util.PublicPromise} */
      const p2 = new shaka.util.PublicPromise();
      const abort2Spy = jasmine.createSpy('abort2')
          .and.callFake(() => p2.reject());
      const abort2 = shaka.test.Util.spyFunc(abort2Spy);
      const op2 = new shaka.util.AbortableOperation(p2, abort2);

      /** @type {!shaka.util.PublicPromise} */
      const p3 = new shaka.util.PublicPromise();
      const abort3Spy = jasmine.createSpy('abort3')
          .and.callFake(() => p3.reject());
      const abort3 = shaka.test.Util.spyFunc(abort3Spy);
      const op3 = new shaka.util.AbortableOperation(p3, abort3);

      /** @type {!shaka.util.AbortableOperation} */
      const all = shaka.util.AbortableOperation.all([op1, op2, op3]);

      const onSuccessSpy = jasmine.createSpy('onSuccess');
      const onSuccess = shaka.test.Util.spyFunc(onSuccessSpy);
      const onErrorSpy = jasmine.createSpy('onError');
      const onError = shaka.test.Util.spyFunc(onErrorSpy);

      all.promise.then(onSuccess, onError);

      await shaka.test.Util.shortDelay();
      expect(onSuccessSpy).not.toHaveBeenCalled();
      expect(onErrorSpy).not.toHaveBeenCalled();

      expect(abort1Spy).not.toHaveBeenCalled();
      expect(abort2Spy).not.toHaveBeenCalled();
      expect(abort3Spy).not.toHaveBeenCalled();

      all.abort();
      await shaka.test.Util.shortDelay();

      expect(onSuccessSpy).not.toHaveBeenCalled();
      expect(onErrorSpy).toHaveBeenCalled();

      expect(abort1Spy).toHaveBeenCalled();
      expect(abort2Spy).toHaveBeenCalled();
      expect(abort3Spy).toHaveBeenCalled();
    });
  });  // describe('all')

  describe('finally', () => {
    it('executes after the operation is successful', async () => {
      let isDone = false;
      /** @type {!shaka.util.PublicPromise} */
      const promise = new shaka.util.PublicPromise();

      shaka.util.AbortableOperation.notAbortable(promise).finally((ok) => {
        expect(ok).toBe(true);
        isDone = true;
      });

      await shaka.test.Util.shortDelay();
      expect(isDone).toBe(false);
      promise.resolve(100);

      await shaka.test.Util.shortDelay();
      expect(isDone).toBe(true);
    });

    it('executes after the operation fails', async () => {
      let isDone = false;
      /** @type {!shaka.util.PublicPromise} */
      const promise = new shaka.util.PublicPromise();

      shaka.util.AbortableOperation.notAbortable(promise).finally((ok) => {
        expect(ok).toBe(false);
        isDone = true;
      });

      await shaka.test.Util.shortDelay();
      expect(isDone).toBe(false);
      promise.reject(0);

      await shaka.test.Util.shortDelay();
      expect(isDone).toBe(true);
    });

    it('executes after the chain is successful', async () => {
      let isDone = false;
      /** @type {!shaka.util.PublicPromise} */
      const promise1 = new shaka.util.PublicPromise();
      /** @type {!shaka.util.PublicPromise} */
      const promise2 = new shaka.util.PublicPromise();

      shaka.util.AbortableOperation.notAbortable(promise1).chain(() => {
        return shaka.util.AbortableOperation.notAbortable(promise2);
      }).finally((ok) => {
        expect(ok).toBe(true);
        isDone = true;
      });

      await shaka.test.Util.shortDelay();
      expect(isDone).toBe(false);
      promise1.resolve();
      await shaka.test.Util.shortDelay();

      expect(isDone).toBe(false);
      promise2.resolve();
      await shaka.test.Util.shortDelay();

      expect(isDone).toBe(true);
    });

    it('executes after the chain fails', async () => {
      let isDone = false;
      /** @type {!shaka.util.PublicPromise} */
      const promise1 = new shaka.util.PublicPromise();
      const promise2 = new shaka.util.PublicPromise();

      shaka.util.AbortableOperation.notAbortable(promise1).chain(() => {
        return shaka.util.AbortableOperation.notAbortable(promise2);
      }).finally((ok) => {
        expect(ok).toBe(false);
        isDone = true;
      });

      await shaka.test.Util.shortDelay();
      expect(isDone).toBe(false);
      promise1.reject(0);
      await shaka.test.Util.shortDelay();

      expect(isDone).toBe(true);
    });

    it('executes after a complex chain', async () => {
      let isDone = false;

      shaka.util.AbortableOperation.completed(0).chain(() => {
        return shaka.util.AbortableOperation.aborted();
      }).chain(() => {
        fail('Should not be reachable');
      }, (e) => {
        return shaka.util.AbortableOperation.completed(100);
      }).finally((ok) => {
        expect(ok).toBe(true);
        isDone = true;
      });

      await shaka.test.Util.shortDelay();
      expect(isDone).toBe(true);
    });
  });  // describe('finally')

  describe('chain', () => {
    it('passes the value to the next operation on success', async () => {
      /** @type {!Array.<number>} */
      const values = [];

      const op = shaka.util.AbortableOperation.completed(100).chain((value) => {
        values.push(value);
        expect(value).toBe(100);
        // Plain value
        return 200;
      }).chain((value) => {
        values.push(value);
        expect(value).toBe(200);
        // Resolved Promise
        return Promise.resolve(300);
      }).chain((value) => {
        values.push(value);
        expect(value).toBe(300);
        // Delayed Promise
        return shaka.test.Util.shortDelay().then(() => 400);
      }).chain((value) => {
        values.push(value);
        expect(value).toBe(400);
        // Abortable operation
        return shaka.util.AbortableOperation.completed(500);
      }).chain((value) => {
        values.push(value);
        expect(value).toBe(500);
      }).finally((ok) => {
        expect(ok).toBe(true);
        // The bug https://github.com/google/shaka-player/issues/1260 makes this
        // expectation fail because some stages were skipped.  Without this
        // check, the test would pass, even though the bug shows up first in the
        // basic functionality of 'chain'.
        expect(values).toEqual([100, 200, 300, 400, 500]);
      });
      await op.promise;
    });

    it('skips the onSuccess callbacks on error', async () => {
      const error = new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.MALFORMED_DATA_URI);

      const op = shaka.util.AbortableOperation.failed(error)
          .chain(fail, (e) => {
            shaka.test.Util.expectToEqualError(e, error);
            throw error;  // rethrow
          }).chain(fail, (e) => {
            shaka.test.Util.expectToEqualError(e, error);
            throw error;  // rethrow
          }).chain(fail, (e) => {
            shaka.test.Util.expectToEqualError(e, error);
          }).finally((ok) => {
            expect(ok).toBe(true);  // Last stage did not rethrow
          });
      await op.promise;
    });

    it('can fall back to other operations in onError callback', async () => {
      const error1 = new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.MALFORMED_DATA_URI);
      const error2 = new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_XML);
      const error3 = new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.EBML_BAD_FLOATING_POINT_SIZE);

      const op = shaka.util.AbortableOperation.failed(error1)
          .chain(fail, (e) => {
            shaka.test.Util.expectToEqualError(e, error1);
            return shaka.util.AbortableOperation.failed(error2);
          }).chain(fail, (e) => {
            shaka.test.Util.expectToEqualError(e, error2);
            return shaka.util.AbortableOperation.failed(error3);
          }).chain(fail, (e) => {
            shaka.test.Util.expectToEqualError(e, error3);
            return shaka.util.AbortableOperation.completed(400);
          }).chain((value) => {
            expect(value).toBe(400);
          }).finally((ok) => {
            expect(ok).toBe(true);
          });
      await op.promise;
    });

    it('fails when an error is thrown', async () => {
      const error1 = new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.MALFORMED_DATA_URI);
      const error2 = new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_XML);

      const op = shaka.util.AbortableOperation.completed(100).chain((value) => {
        throw error1;
      }).chain(fail, (e) => {
        shaka.test.Util.expectToEqualError(e, error1);
        throw error2;
      }).chain(fail, (e) => {
        shaka.test.Util.expectToEqualError(e, error2);
      }).finally((ok) => {
        expect(ok).toBe(true);  // Last stage did not rethrow
      });
      await op.promise;
    });

    it('goes to success state when onError returns undefined', async () => {
      const error = new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.MALFORMED_DATA_URI);

      const op = shaka.util.AbortableOperation.failed(error)
          .chain(fail, (e) => {
            shaka.test.Util.expectToEqualError(e, error);
            // no return value
          }).chain((value) => {
            expect(value).toBe(undefined);
          }, fail).finally((ok) => {
            expect(ok).toBe(true);
          });
      await op.promise;
    });

    it('does not need return when onSuccess omitted', async () => {
      const operation = shaka.util.AbortableOperation.completed(100)
          .chain(undefined, fail).chain(undefined, fail).chain((value) => {
            expect(value).toBe(100);
          }).finally((ok) => {
            expect(ok).toBe(true);
          });
      await operation.promise;
    });

    it('does not need rethrow when onError omitted', async () => {
      const error = new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.MALFORMED_DATA_URI);

      const operation = shaka.util.AbortableOperation.failed(error)
          .chain(fail).chain(fail).chain(fail).chain(fail, (e) => {
            shaka.test.Util.expectToEqualError(e, error);
          }).finally((ok) => {
            expect(ok).toBe(true);  // Last stage did not rethrow
          });
      await operation.promise;
    });

    it('ensures abort is called with the correct "this"', async () => {
      // During testing and development, an early version of chain() would
      // sometimes unbind an abort method from an earlier stage of the chain.
      // Make sure this doesn't happen.
      let innerOperation;
      /** @type {!shaka.util.PublicPromise} */
      const p = new shaka.util.PublicPromise();
      let abortCalled = false;

      /**
       * NOTE: This is a subtle thing, but this must be an ES5 anonymous
       * function for the test to work.  ES6 arrow functions would always be
       * called with the "this" of the test itself, regardless of what the
       * library is doing.
       *
       * @this {shaka.util.AbortableOperation}
       * @return {!Promise}
       */
      function abort() {
        expect(this).toBe(innerOperation);
        abortCalled = true;
        return Promise.resolve();
      }

      // Since the issue was with the calling of operation.abort, rather than
      // the onAbort_ callback, we make an operation-like thing instead of using
      // the AbortableOperation constructor.
      innerOperation = {promise: p, abort: abort};

      // The second stage of the chain returns innerOperation.  A brief moment
      // later, the outer chain is aborted.
      const operation =
          shaka.util.AbortableOperation.completed(100)
              .chain(() => {
                shaka.test.Util.shortDelay().then(() => {
                  operation.abort();
                  p.resolve();
                });
                return innerOperation;
              })
              .finally((ok) => {
                // We resolved the non-abortable inner operation
                expect(ok).toBe(true);
                expect(abortCalled).toBe(true);
              });
      await operation.promise;
    });
  });  // describe('chain')
});  // describe('AbortableOperation')
