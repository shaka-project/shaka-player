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

describe('AbortableOperation', function() {
  describe('promise', function() {
    it('is resolved by the constructor argument', function(done) {
      let promise = new shaka.util.PublicPromise();
      let abort = () => Promise.resolve();

      let operation = new shaka.util.AbortableOperation(promise, abort);
      promise.resolve(100);

      operation.promise.catch(fail).then((value) => {
        expect(value).toEqual(100);
        done();
      });
    });
  });

  describe('abort', function() {
    it('calls the abort argument from the constructor', function() {
      let promise = Promise.resolve();
      let abort = jasmine.createSpy('abort').and.returnValue(Promise.resolve());

      let operation = new shaka.util.AbortableOperation(
          promise, shaka.test.Util.spyFunc(abort));
      operation.abort();
      expect(abort).toHaveBeenCalled();
    });

    it('is resolved when the underlying abort() is resolved', function(done) {
      let p = new shaka.util.PublicPromise();
      let abort = jasmine.createSpy('abort').and.returnValue(p);

      let operation = new shaka.util.AbortableOperation(
          new shaka.util.PublicPromise(), shaka.test.Util.spyFunc(abort));

      let abortComplete = jasmine.createSpy('abort complete');
      operation.abort()
          .catch(fail).then(shaka.test.Util.spyFunc(abortComplete));

      expect(abortComplete).not.toHaveBeenCalled();
      shaka.test.Util.delay(0.1).then(() => {
        // Nothing has happened yet, so abort is not complete.
        expect(abortComplete).not.toHaveBeenCalled();
        // Resolve the underlying Promise.
        p.resolve();
        return shaka.test.Util.delay(0.1);
      }).then(() => {
        // The abort is now complete.
        expect(abortComplete).toHaveBeenCalled();
      }).catch(fail).then(done);
    });
  });

  describe('failed', function() {
    it('creates a failed operation with the given error', function(done) {
      let error = new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.MALFORMED_DATA_URI);

      let operation = shaka.util.AbortableOperation.failed(error);
      operation.promise.then(fail).catch((e) => {
        shaka.test.Util.expectToEqualError(e, error);
      }).then(done);
    });
  });

  describe('aborted', function() {
    it('creates a failed operation with OPERATION_ABORTED', function(done) {
      let error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.PLAYER,
          shaka.util.Error.Code.OPERATION_ABORTED);

      let operation = shaka.util.AbortableOperation.aborted();
      operation.promise.then(fail).catch((e) => {
        shaka.test.Util.expectToEqualError(e, error);
      }).then(done);
    });
  });

  describe('completed', function() {
    it('creates a completed operation with the given value', function(done) {
      let operation = shaka.util.AbortableOperation.completed(100);
      operation.promise.catch(fail).then((value) => {
        expect(value).toEqual(100);
        done();
      });
    });
  });

  describe('notAbortable', function() {
    it('creates an operation from the given promise', function(done) {
      let promise = new shaka.util.PublicPromise();
      let operation = shaka.util.AbortableOperation.notAbortable(promise);

      let isAborted = false;
      operation.abort().then(() => {
        isAborted = true;
      });

      let isComplete = false;
      operation.promise.catch(fail).then((value) => {
        isComplete = true;
        expect(value).toEqual(100);
      });

      shaka.test.Util.delay(0.1).then(() => {
        // Even though we called abort(), the operation hasn't completed
        // because it isn't abortable.  The abort() Promise hasn't been
        // resolved yet, either.
        expect(isComplete).toBe(false);
        expect(isAborted).toBe(false);

        promise.resolve(100);
        return shaka.test.Util.delay(0.1);
      }).then(() => {
        // Now that we resolved the underlying promise, the operation is
        // complete, and so is the abort() Promise.
        expect(isComplete).toBe(true);
        expect(isAborted).toBe(true);
      }).catch(fail).then(done);
    });
  });  // describe('notAbortable')

  describe('all', function() {
    it('creates a successful operation when all succeed', function(done) {
      let p1 = new shaka.util.PublicPromise();
      let op1 = shaka.util.AbortableOperation.notAbortable(p1);

      let p2 = new shaka.util.PublicPromise();
      let op2 = shaka.util.AbortableOperation.notAbortable(p2);

      let p3 = new shaka.util.PublicPromise();
      let op3 = shaka.util.AbortableOperation.notAbortable(p3);

      let all = shaka.util.AbortableOperation.all([op1, op2, op3]);

      let onSuccessSpy = jasmine.createSpy('onSuccess');
      let onSuccess = shaka.test.Util.spyFunc(onSuccessSpy);
      let onErrorSpy = jasmine.createSpy('onError');
      let onError = shaka.test.Util.spyFunc(onErrorSpy);

      all.promise.then(onSuccess, onError).catch(fail);

      shaka.test.Util.delay(0.1).then(() => {
        expect(onSuccessSpy).not.toHaveBeenCalled();
        expect(onErrorSpy).not.toHaveBeenCalled();
        p1.resolve();
        return shaka.test.Util.delay(0.1);
      }).then(() => {
        expect(onSuccessSpy).not.toHaveBeenCalled();
        expect(onErrorSpy).not.toHaveBeenCalled();
        p2.resolve();
        return shaka.test.Util.delay(0.1);
      }).then(() => {
        expect(onSuccessSpy).not.toHaveBeenCalled();
        expect(onErrorSpy).not.toHaveBeenCalled();
        p3.resolve();
        return shaka.test.Util.delay(0.1);
      }).then(() => {
        expect(onSuccessSpy).toHaveBeenCalled();
        expect(onErrorSpy).not.toHaveBeenCalled();
      }).catch(fail).then(done);
    });

    it('creates a failed operation when any fail', function(done) {
      let p1 = new shaka.util.PublicPromise();
      let op1 = shaka.util.AbortableOperation.notAbortable(p1);

      let p2 = new shaka.util.PublicPromise();
      let op2 = shaka.util.AbortableOperation.notAbortable(p2);

      let p3 = new shaka.util.PublicPromise();
      let op3 = shaka.util.AbortableOperation.notAbortable(p3);

      let all = shaka.util.AbortableOperation.all([op1, op2, op3]);

      let onSuccessSpy = jasmine.createSpy('onSuccess');
      let onSuccess = shaka.test.Util.spyFunc(onSuccessSpy);
      let onErrorSpy = jasmine.createSpy('onError');
      let onError = shaka.test.Util.spyFunc(onErrorSpy);

      all.promise.then(onSuccess, onError).catch(fail);

      shaka.test.Util.delay(0.1).then(() => {
        expect(onSuccessSpy).not.toHaveBeenCalled();
        expect(onErrorSpy).not.toHaveBeenCalled();
        p1.resolve();
        return shaka.test.Util.delay(0.1);
      }).then(() => {
        expect(onSuccessSpy).not.toHaveBeenCalled();
        expect(onErrorSpy).not.toHaveBeenCalled();
        p2.reject('error');
        return shaka.test.Util.delay(0.1);
      }).then(() => {
        expect(onSuccessSpy).not.toHaveBeenCalled();
        expect(onErrorSpy).toHaveBeenCalledWith('error');
      }).catch(fail).then(done);
    });

    it('aborts all operations on abort', function(done) {
      let p1 = new shaka.util.PublicPromise();
      let abort1Spy = jasmine.createSpy('abort1')
          .and.callFake(() => p1.reject());
      let abort1 = shaka.test.Util.spyFunc(abort1Spy);
      let op1 = new shaka.util.AbortableOperation(p1, abort1);

      let p2 = new shaka.util.PublicPromise();
      let abort2Spy = jasmine.createSpy('abort2')
          .and.callFake(() => p2.reject());
      let abort2 = shaka.test.Util.spyFunc(abort2Spy);
      let op2 = new shaka.util.AbortableOperation(p2, abort2);

      let p3 = new shaka.util.PublicPromise();
      let abort3Spy = jasmine.createSpy('abort3')
          .and.callFake(() => p3.reject());
      let abort3 = shaka.test.Util.spyFunc(abort3Spy);
      let op3 = new shaka.util.AbortableOperation(p3, abort3);

      let all = shaka.util.AbortableOperation.all([op1, op2, op3]);

      let onSuccessSpy = jasmine.createSpy('onSuccess');
      let onSuccess = shaka.test.Util.spyFunc(onSuccessSpy);
      let onErrorSpy = jasmine.createSpy('onError');
      let onError = shaka.test.Util.spyFunc(onErrorSpy);

      all.promise.then(onSuccess, onError).catch(fail);

      shaka.test.Util.delay(0.1).then(() => {
        expect(onSuccessSpy).not.toHaveBeenCalled();
        expect(onErrorSpy).not.toHaveBeenCalled();

        expect(abort1Spy).not.toHaveBeenCalled();
        expect(abort2Spy).not.toHaveBeenCalled();
        expect(abort3Spy).not.toHaveBeenCalled();

        all.abort();
        return shaka.test.Util.delay(0.1);
      }).then(() => {
        expect(onSuccessSpy).not.toHaveBeenCalled();
        expect(onErrorSpy).toHaveBeenCalled();

        expect(abort1Spy).toHaveBeenCalled();
        expect(abort2Spy).toHaveBeenCalled();
        expect(abort3Spy).toHaveBeenCalled();
      }).catch(fail).then(done);
    });
  });  // describe('all')

  describe('finally', function() {
    it('executes after the operation is successful', function(done) {
      let isDone = false;
      let promise = new shaka.util.PublicPromise();

      shaka.util.AbortableOperation.notAbortable(promise).finally((ok) => {
        expect(ok).toBe(true);
        isDone = true;
      });

      shaka.test.Util.delay(0.1).then(() => {
        expect(isDone).toBe(false);
        promise.resolve(100);
        return shaka.test.Util.delay(0.1);
      }).then(() => {
        expect(isDone).toBe(true);
        done();
      });
    });

    it('executes after the operation fails', function(done) {
      let isDone = false;
      let promise = new shaka.util.PublicPromise();

      shaka.util.AbortableOperation.notAbortable(promise).finally((ok) => {
        expect(ok).toBe(false);
        isDone = true;
      });

      shaka.test.Util.delay(0.1).then(() => {
        expect(isDone).toBe(false);
        promise.reject(0);
        return shaka.test.Util.delay(0.1);
      }).then(() => {
        expect(isDone).toBe(true);
        done();
      });
    });

    it('executes after the chain is successful', function(done) {
      let isDone = false;
      let promise1 = new shaka.util.PublicPromise();
      let promise2 = new shaka.util.PublicPromise();

      shaka.util.AbortableOperation.notAbortable(promise1).chain(() => {
        return shaka.util.AbortableOperation.notAbortable(promise2);
      }).finally((ok) => {
        expect(ok).toBe(true);
        isDone = true;
      });

      shaka.test.Util.delay(0.1).then(() => {
        expect(isDone).toBe(false);
        promise1.resolve();
        return shaka.test.Util.delay(0.1);
      }).then(() => {
        expect(isDone).toBe(false);
        promise2.resolve();
        return shaka.test.Util.delay(0.1);
      }).then(() => {
        expect(isDone).toBe(true);
        done();
      });
    });

    it('executes after the chain fails', function(done) {
      let isDone = false;
      let promise1 = new shaka.util.PublicPromise();
      let promise2 = new shaka.util.PublicPromise();

      shaka.util.AbortableOperation.notAbortable(promise1).chain(() => {
        return shaka.util.AbortableOperation.notAbortable(promise2);
      }).finally((ok) => {
        expect(ok).toBe(false);
        isDone = true;
      });

      shaka.test.Util.delay(0.1).then(() => {
        expect(isDone).toBe(false);
        promise1.reject(0);
        return shaka.test.Util.delay(0.1);
      }).then(() => {
        expect(isDone).toBe(true);
        done();
      });
    });

    it('executes after a complex chain', function(done) {
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

      shaka.test.Util.delay(0.1).then(() => {
        expect(isDone).toBe(true);
        done();
      });
    });
  });  // describe('finally')

  describe('chain', function() {
    it('passes the value to the next operation on success', function(done) {
      let values = [];

      shaka.util.AbortableOperation.completed(100).chain((value) => {
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
        return shaka.test.Util.delay(0.1).then(() => 400);
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
        done();
      });
    });

    it('skips the onSuccess callbacks on error', function(done) {
      let error = new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.MALFORMED_DATA_URI);

      shaka.util.AbortableOperation.failed(error).chain(fail, (e) => {
        shaka.test.Util.expectToEqualError(e, error);
        throw error;  // rethrow
      }).chain(fail, (e) => {
        shaka.test.Util.expectToEqualError(e, error);
        throw error;  // rethrow
      }).chain(fail, (e) => {
        shaka.test.Util.expectToEqualError(e, error);
      }).finally((ok) => {
        expect(ok).toBe(true);  // Last stage did not rethrow
        done();
      });
    });

    it('can fall back to other operations in onError callback', function(done) {
      let error1 = new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.MALFORMED_DATA_URI);
      let error2 = new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_XML);
      let error3 = new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.EBML_BAD_FLOATING_POINT_SIZE);

      shaka.util.AbortableOperation.failed(error1).chain(fail, (e) => {
        shaka.test.Util.expectToEqualError(e, error1);
        return shaka.util.AbortableOperation.failed(error2);
      }).chain(fail, (e) => {
        shaka.test.Util.expectToEqualError(e, error2);
        return shaka.util.AbortableOperation.failed(error3);
      }).chain(fail, (e) => {
        shaka.test.Util.expectToEqualError(e, error3);
        return shaka.util.AbortableOperation.completed(400);
      }).chain((value) => {
        expect(value).toEqual(400);
      }).finally((ok) => {
        expect(ok).toBe(true);
        done();
      });
    });

    it('fails when an error is thrown', function(done) {
      let error1 = new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.MALFORMED_DATA_URI);
      let error2 = new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_XML);

      shaka.util.AbortableOperation.completed(100).chain((value) => {
        throw error1;
      }).chain(fail, (e) => {
        shaka.test.Util.expectToEqualError(e, error1);
        throw error2;
      }).chain(fail, (e) => {
        shaka.test.Util.expectToEqualError(e, error2);
      }).finally((ok) => {
        expect(ok).toBe(true);  // Last stage did not rethrow
        done();
      });
    });

    it('goes to success state when onError returns undefined', function(done) {
      let error = new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.MALFORMED_DATA_URI);

      shaka.util.AbortableOperation.failed(error).chain(fail, (e) => {
        shaka.test.Util.expectToEqualError(e, error);
        // no return value
      }).chain((value) => {
        expect(value).toBe(undefined);
      }, fail).finally((ok) => {
        expect(ok).toBe(true);
        done();
      });
    });

    it('does not need return when onSuccess omitted', function(done) {
      let operation = shaka.util.AbortableOperation.completed(100);
      operation.chain(undefined, fail).chain(undefined, fail).chain((value) => {
        expect(value).toEqual(100);
      }).finally((ok) => {
        expect(ok).toBe(true);
        done();
      });
    });

    it('does not need rethrow when onError omitted', function(done) {
      let error = new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.MALFORMED_DATA_URI);

      let operation = shaka.util.AbortableOperation.failed(error);
      operation.chain(fail).chain(fail).chain(fail).chain(fail, (e) => {
        shaka.test.Util.expectToEqualError(e, error);
      }).finally((ok) => {
        expect(ok).toBe(true);  // Last stage did not rethrow
        done();
      });
    });

    it('ensures abort is called with the correct "this"', function(done) {
      // During testing and development, an early version of chain() would
      // sometimes unbind an abort method from an earlier stage of the chain.
      // Make sure this doesn't happen.
      let innerOperation;
      let p = new shaka.util.PublicPromise();
      let abortCalled = false;

      /**
       * @this {shaka.util.AbortableOperation}
       * @return {!Promise}
       *
       * NOTE: This is a subtle thing, but this must be an ES5 anonymous
       * function for the test to work.  ES6 arrow functions would always be
       * called with the "this" of the test itself, regardless of what the
       * library is doing.
       */
      let abort = function() {
        expect(this).toBe(innerOperation);
        abortCalled = true;
        return Promise.resolve();
      };

      // Since the issue was with the calling of operation.abort, rather than
      // the onAbort_ callback, we make an operation-like thing instead of using
      // the AbortableOperation constructor.
      innerOperation = {promise: p, abort: abort};

      // The second stage of the chain returns innerOperation.  A brief moment
      // later, the outer chain is aborted.
      let operation = shaka.util.AbortableOperation.completed(100).chain(() => {
        shaka.test.Util.delay(0.1).then(() => {
          operation.abort();
          p.resolve();
        });
        return innerOperation;
      }).finally((ok) => {
        expect(ok).toBe(true);  // We resolved the non-abortable inner operation
        expect(abortCalled).toBe(true);
        done();
      });
    });
  });  // describe('chain')
});  // describe('AbortableOperation')
