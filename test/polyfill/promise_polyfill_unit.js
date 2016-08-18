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

// Based on: https://github.com/promises-aplus/promises-tests
describe('Promise polyfill', function() {
  var Promise;
  var dummy = { 'FOO': 'BAR' };

  beforeAll(function() {
    Promise = shaka.polyfill.Promise;
  });

  describe('resolve', function() {
    it('Promise.resolve returns a resolved promise', function(done) {
      var p = Promise.resolve(1);
      expect(p).toBeTruthy();
      expect(typeof p).toBe('object');
      expect(typeof p.then).toBe('function');

      p.then(function(i) {
        expect(i).toBe(1);
        done();
      }, fail);
    });

    it('Promise constructor arguments correctly resolve Promise',
       function(done) {
         var resolved = false;
         new Promise(function(resolve, reject) {
           expect(resolved).toBe(false);
           resolve();
         }).then(function() {
           expect(resolved).toBe(false);
           resolved = true;
         }, fail);

         setTimeout(function() {
           expect(resolved).toBe(true);
           done();
         }, 50);
       });

    it('Promise constructor ignores reject after resolve', function(done) {
      new Promise(function(resolve, reject) {
        resolve();
        reject();
      }).catch(fail).then(done);
    });

    it('Promise constructor ignores resolve after reject', function(done) {
      new Promise(function(resolve, reject) {
        reject();
        resolve();
      }).then(fail, function() {}).then(done);
    });
  });

  describe('reject', function() {
    it('Promise.reject returns a rejected promise', function(done) {
      var p = Promise.reject(1);
      expect(p).toBeTruthy();
      expect(typeof p).toBe('object');
      expect(typeof p.then).toBe('function');

      p.then(fail, function(i) {
        expect(i).toBe(1);
        done();
      });
    });

    it('Promise constructor arguments correctly reject Promise',
       function(done) {
         var rejected = false;
         new Promise(function(resolve, reject) {
           expect(rejected).toBe(false);
           reject();
         }).then(fail, function() {
           expect(rejected).toBe(false);
           rejected = true;
         });

         setTimeout(function() {
           expect(rejected).toBe(true);
           done();
         }, 50);
       });
  });

  describe('then', function() {
    // 2.2.2: If `onFulfilled` is a function,
    // 2.2.2.2: it must not be called before `promise` is fulfilled
    it('onFulfilled not called before resolved', function(done) {
      var p = deferred();
      var resolved = false;
      setTimeout(function() {
        resolved = true;
        p.resolve(dummy);
      }, 50);

      p.then(function() {
        expect(resolved).toBe(true);
        done();
      });
    });

    // 2.2.2.3: it must not be called more than once.
    it('onFulfilled only called once', function(done) {
      var p = deferred();
      var fulfilled = jasmine.createSpy('onFulfilled');
      var rejected = jasmine.createSpy('onRejected');
      p.then(fulfilled, rejected);

      p.resolve(dummy);
      p.resolve(dummy);
      p.reject(dummy);
      setTimeout(function() {
        p.resolve(dummy);
      }, 50);
      setTimeout(function() {
        expect(fulfilled.calls.count()).toBe(1);
        expect(rejected).not.toHaveBeenCalled();
        done();
      }, 100);
    });

    // 2.2.3: If `onRejected` is a function,
    // 2.2.3.2: it must not be called before `promise` is rejected
    it('onRejected not called before rejected', function(done) {
      var p = deferred();
      var rejected = false;
      setTimeout(function() {
        rejected = true;
        p.reject(dummy);
      }, 50);

      p.then(fail, function() {
        expect(rejected).toBe(true);
        done();
      });
    });

    // 2.2.3.3: it must not be called more than once.
    it('onRejected only called once', function(done) {
      var p = deferred();
      var fulfilled = jasmine.createSpy('onFulfilled');
      var rejected = jasmine.createSpy('onRejected');
      p.then(fulfilled, rejected);

      p.reject(dummy);
      p.reject(dummy);
      p.resolve(dummy);
      setTimeout(function() {
        p.reject(dummy);
      }, 50);
      setTimeout(function() {
        expect(rejected.calls.count()).toBe(1);
        expect(fulfilled).not.toHaveBeenCalled();
        done();
      }, 100);
    });

    // 2.2.4: `onFulfilled` or `onRejected` must not be called until the
    // execution context stack contains only platform code.
    it('not called synchronously', function(done) {
      var p = Promise.resolve(dummy);

      var finished = false;
      p.then(function() {
        expect(finished).toBe(true);
        done();
      });

      finished = true;
    });

    // 2.2.5: `onFulfilled` and `onRejected` must be called as functions (i.e
    // with no `this` value).
    it('not called with `this`', function(done) {
      Promise.resolve(dummy)
          .then(function() {
            expect(this).toBe(window);
            throw new Error();
          })
          .then(fail, function() { expect(this).toBe(window); })
          .then(function() {
            'use strict';
            expect(this).toBe(undefined);
            throw new Error();
          })
          .then(fail, function() {
            'use strict';
            expect(this).toBe(undefined);
          })
          .catch(fail)
          .then(done);
    });

    // 2.2.7: `then` must return a promise:
    // `promise2 = promise1.then(onFulfilled, onRejected)`
    it('must return a promise', function() {
      var p = deferred();
      var p2 = p.then();

      expect(p2).toBeTruthy();
      expect(typeof p2).toBe('object');
      expect(typeof p2.then).toBe('function');
    });

    // 2.2.7.1: If either `onFulfilled` or `onRejected` returns a value `x`,
    // run the Promise Resolution Procedure `[[Resolve]](promise2, x)`
    it('when callback returns Promise, handle correctly', function(done) {
      var p = Promise.resolve(dummy);

      var p2 = deferred();
      p2.resolved = false;
      var p3 = deferred();
      p3.resolved = false;
      var p4 = deferred();
      p4.resolved = false;

      p.then(function() {
        return p2;
      }, fail).then(function(i) {
        expect(i).toBe(2);
        expect(p2.resolved).toBe(true);
        return p3;
      }).then(fail, function(i) {
        expect(i).toBe(3);
        expect(p3.resolved).toBe(true);
        return p4;
      }).then(function(i) {
        expect(i).toBe(4);
        expect(p4.resolved).toBe(true);
      }).catch(fail).then(done);

      setTimeout(function() {
        p2.resolve(2);
        p2.resolved = true;
      }, 50);
      setTimeout(function() {
        p3.reject(3);
        p3.resolved = true;
      }, 100);
      setTimeout(function() {
        p4.resolve(4);
        p4.resolved = true;
      }, 150);
    });

    // 2.2.7.2: If either `onFulfilled` or `onRejected` throws an exception
    // `e`, `promise2` must be rejected with `e` as the reason.
    it('if callbacks throw, invoke onRejected of child', function(done) {
      var p = Promise.resolve(dummy);
      var e = new Error();
      p.then(function() { throw e; })
          .then(fail, function(caught) { expect(caught).toBe(e); })
          .then(done);
    });

    it('chains correctly', function(done) {
      var p = Promise.resolve(dummy);

      p.then(function() { return 1; })
          .then(function(i) { expect(i).toBe(1); })
          .catch(fail)
          .then(function() { throw new Error(); })
          .then(fail)
          .catch(function(e) {
            expect(e instanceof Error).toBe(true);
            return 2;
          })
          .catch(fail)
          .then(function(i) { expect(i).toBe(2); throw new Error(); })
          .then(fail)
          .catch(function() { throw new Error(); })
          .then(fail)
          .catch()
          .then(fail)
          .catch(function() {})
          .then(done);
    });
  });

  describe('all', function() {
    it('returns a Promise', function() {
      var p = Promise.all([]);
      expect(p).toBeTruthy();
      expect(typeof p).toBe('object');
      expect(typeof p.then).toBe('function');
    });

    it('resolves when all resolved', function(done) {
      var p1 = deferred();
      var p2 = deferred();
      var p3 = deferred();

      var all = Promise.all([p1, p2, p3]);
      all.then(function() {
        expect(p1.resolved).toBe(true);
        expect(p2.resolved).toBe(true);
        expect(p3.resolved).toBe(true);
      }).catch(fail).then(done);

      p3.resolve();
      p3.resolved = true;
      setTimeout(function() {
        p2.resolve();
        p2.resolved = true;
      }, 50);
      setTimeout(function() {
        p1.resolve();
        p1.resolved = true;
      }, 100);
    });

    it('resolves with an array of values from each Promise', function(done) {
      var p1 = Promise.resolve(1);
      var p2 = Promise.resolve(2);
      var p3 = Promise.resolve(3);

      var all = Promise.all([p1, p2, p3]);
      all.then(function(args) {
        expect(args).toBeTruthy();
        expect(args.length).toBe(3);
        expect(args[0]).toBe(1);
        expect(args[1]).toBe(2);
        expect(args[2]).toBe(3);
      }).catch(fail).then(done);
    });

    it('rejects if one rejects', function(done) {
      var p1 = Promise.resolve(1);
      var p2 = Promise.reject(2);

      var all = Promise.all([p1, p2]);
      all.then(fail, function(e) {
        expect(e).toBe(2);
      }).then(done);
    });

    it('rejects with the first value if two reject', function(done) {
      var p1 = deferred();
      var p2 = deferred();

      var all = Promise.all([p1, p2]);
      all.then(fail, function(e) {
        expect(e).toBe(1);
      }).then(done);

      p1.reject(1);
      p2.reject(2);
    });

    it('is not resolved until all Promise chains are resolved', function(done) {
      var p = deferred();
      var p1 = Promise.resolve(0);
      var p2 = Promise.resolve().then(function() { return p; });

      var all = Promise.all([p1, p2]);
      var spy = jasmine.createSpy('resolve').and.callFake(done);
      all.then(spy, fail);

      setTimeout(function() {
        expect(spy).not.toHaveBeenCalled();
        p.resolve(0);
      }, 50);
    });

    it('resolves with values in the order given', function(done) {
      var p1 = deferred();
      var p2 = deferred();
      var p3 = deferred();

      Promise.all([p1, p2, p3]).then(function(data) {
        expect(data.length).toBe(3);
        expect(data[0]).toBe(1);
        expect(data[1]).toBe(2);
        expect(data[2]).toBe(3);
      }).catch(fail).then(done);

      // Ensure the order of resolving does not change the order of the results.
      p3.resolve(3);
      setTimeout(function() { p1.resolve(1); }, 50);
      setTimeout(function() { p2.resolve(2); }, 100);
    });

    describe('resolves with plain values', function() {
      function runTest(value, name) {
        it(name, function(done) {
          Promise.all([value])
              .then(function(given) { expect(given).toEqual([value]); })
              .catch(fail)
              .then(done);
        });
      }

      runTest(null, 'null');
      runTest(false, 'false');
      runTest(5, 'a number');
      runTest({}, 'an object');
    });
  });

  describe('race', function() {
    it('returns a Promise', function() {
      var p = Promise.race([]);
      expect(p).toBeTruthy();
      expect(typeof p).toBe('object');
      expect(typeof p.then).toBe('function');
    });

    it('resolves when one resolves', function(done) {
      var p1 = deferred();
      var p2 = deferred();
      var p3 = deferred();

      var anyDone = false;
      var race = Promise.race([p1, p2, p3]);
      race.then(function() { expect(anyDone).toBe(true); })
          .catch(fail).then(done);

      setTimeout(function() {
        p2.resolve();
        anyDone = true;
      }, 50);
    });

    it('resolves with the first resolved Promise', function(done) {
      var p1 = deferred();
      var p2 = Promise.resolve(2);
      var p3 = deferred();

      var race = Promise.race([p1, p2, p3]);
      race.then(function(arg) { expect(arg).toBe(2); })
          .catch(fail).then(done);
    });

    it('only gives the first value resolved', function(done) {
      var p1 = deferred();
      var p2 = deferred();
      var p3 = deferred();

      var race = Promise.race([p1, p2, p3]);
      race.then(function(arg) { expect(arg).toBe(2); })
          .catch(fail).then(done);

      p1.resolve(2);
      p2.resolve(1);
    });

    it('rejects if one rejects before resolving', function(done) {
      var p1 = deferred();
      var p2 = Promise.reject(2);

      var race = Promise.race([p1, p2]);
      race.then(fail, function(e) {
        expect(e).toBe(2);
      }).then(done);

      p1.resolve();
    });

    it('rejects with first value if two reject', function(done) {
      var p1 = deferred();
      var p2 = deferred();

      var race = Promise.race([p1, p2]);
      race.then(fail, function(e) {
        expect(e).toBe(2);
      }).then(done);

      p1.reject(2);
      p2.reject(1);
    });

    it('resolved even if one rejects after resolving', function(done) {
      var p1 = deferred();
      var p2 = deferred();

      var race = Promise.race([p1, p2]);
      race.then(function(e) { expect(e).toBe(2); }, fail).then(done);

      p1.resolve(2);
      p2.reject(0);
    });

    it('if a function returns a Promise, wait for it to resolve/reject',
       function(done) {
         var p = deferred();
         var p1 = Promise.resolve().then(function() { return p; });

         var race = Promise.race([p1]);
         var spy = jasmine.createSpy('resolve').and.callFake(done);
         race.then(spy, fail);

         setTimeout(function() {
           expect(spy).not.toHaveBeenCalled();
           p.resolve(0);
         }, 50);
       });

    describe('resolves with plain values', function() {
      function runTest(value, name) {
        it(name, function(done) {
          Promise.race([value])
              .then(function(given) { expect(given).toBe(value); })
              .catch(fail)
              .then(done);
        });
      }

      runTest(null, 'null');
      runTest(false, 'false');
      runTest(5, 'a number');
      runTest({}, 'an object');
    });

    it('supports null in array', function(done) {
      var p1 = deferred();
      var p2 = null;

      Promise.race([p1, p2]).then(function(arg) {
        expect(arg).toBe(null);
      }).catch(fail).then(done);
    });
  });

  describe('conformance', function() {
    it('if constructor throws, reject with thrown value', function(done) {
      var thrown = new Error();
      new Promise(function(a, b) { throw thrown; })
          .then(fail)
          .catch(function(e) { expect(e).toBe(thrown); })
          .then(done);
    });

    // 2.1.2.1: When fulfilled, a promise: must not transition to any other
    // state.
    it('once fulfilled must not change state', function(done) {
      var p = deferred();
      var called = false;
      p.then(function() {
        expect(called).toBe(false);
        called = true;
      }, function() {
        fail('Promise rejected when should resolve');
        done();
      });

      p.resolve(dummy);
      p.reject(dummy);
      setTimeout(done, 100);
    });

    // 2.1.3.1: When rejected, a promise: must not transition to any other
    // state.
    it('once rejected must not change state', function(done) {
      var p = deferred();
      var called = false;
      p.then(function() {
        fail('Promise resolved when should reject');
        done();
      }, function() {
        expect(called).toBe(false);
        called = true;
      });

      p.reject(dummy);
      p.resolve(dummy);
      setTimeout(done, 100);
    });

    // 2.2.1.1: If `onFulfilled` is not a function, it must be ignored.
    describe('if onFulfilled is not a function, ignore', function() {
      function runTest(nonFunction, name) {
        it(name, function(done) {
          expect(true).toBe(true);
          Promise.reject(dummy).then(nonFunction, function() {}).then(done);
        });
      }

      runTest(undefined, 'undefined');
      runTest(null, 'null');
      runTest(false, 'false');
      runTest(5, 'a number');
      runTest({}, 'an object');
    });

    // 2.2.1.2: If `onRejected` is not a function, it must be ignored.
    describe('if onRejected is not a function, ignore', function() {
      function runTest(nonFunction, name) {
        it(name, function(done) {
          expect(true).toBe(true);
          Promise.resolve(dummy).then(function() {}, nonFunction).then(done);
        });
      }

      runTest(undefined, 'undefined');
      runTest(null, 'null');
      runTest(false, 'false');
      runTest(5, 'a number');
      runTest({}, 'an object');
    });

    // 2.2.6.1: If/when `promise` is fulfilled, all respective `onFulfilled`
    // callbacks must execute in the order of their originating calls to `then`.
    it('onFulfilled called in the order then was called', function(done) {
      var p = deferred();
      var calls = 0;

      p.then(function() {
        expect(++calls).toBe(1);
      });
      p.then(function() {
        expect(++calls).toBe(2);
        // Ensure that it handles exceptions correctly.
        throw new Error();
      });
      p.then(function() {
        expect(++calls).toBe(3);
      });

      p.resolve(dummy);
      setTimeout(function() {
        expect(calls).toBe(3);
        done();
      }, 50);
    });

    // 2.2.6.2: If/when `promise` is rejected, all respective `onRejected`
    // callbacks must execute in the order of their originating calls to `then`.
    it('onRejected called in the order then was called', function(done) {
      var p = deferred();
      var calls = 0;

      p.then(undefined, function() {
        expect(++calls).toBe(1);
      });
      p.then(undefined, function() {
        expect(++calls).toBe(2);
        // Ensure that it handles exceptions correctly.
        throw new Error();
      });
      p.then(undefined, function() {
        expect(++calls).toBe(3);
      });

      p.reject(dummy);
      setTimeout(function() {
        expect(calls).toBe(3);
        done();
      }, 50);
    });

    // 2.2.7.3: If `onFulfilled` is not a function and `promise1` is fulfilled,
    // `promise2` must be fulfilled with the same value.
    describe('if onFulfilled is not a function, forward to child', function() {
      function runTest(nonFunction, name) {
        it(name, function(done) {
          Promise.resolve(dummy).then(nonFunction)
              .then(function(value) { expect(value).toBe(dummy); })
              .catch(fail)
              .then(done);
        });
      }

      runTest(undefined, 'undefined');
      runTest(null, 'null');
      runTest(false, 'false');
      runTest(5, 'a number');
      runTest({}, 'an object');
    });

    // 2.2.7.4: If `onRejected` is not a function and `promise1` is rejected,
    // `promise2` must be rejected with the same reason.
    describe('if onRejected is not a function, forward to child', function() {
      function runTest(nonFunction, name) {
        it(name, function(done) {
          Promise.reject(dummy).then(undefined, nonFunction)
              .then(fail)
              .catch(function(value) { expect(value).toBe(dummy); })
              .then(done);
        });
      }

      runTest(undefined, 'undefined');
      runTest(null, 'null');
      runTest(false, 'false');
      runTest(5, 'a number');
      runTest({}, 'an object');
    });

    // 2.3.1: If `promise` and `x` refer to the same object, reject `promise`
    // with a `TypeError' as the reason.
    it('if then returns the same Promise, reject', function(done) {
      var p = Promise.resolve(dummy);
      var next = p.then(function() { return next; });

      next.then(fail, function(reason) {
        expect(reason instanceof TypeError).toBe(true);
      }).then(done);
    });
  });

  function deferred() {
    var resolveLocal;
    var rejectLocal;
    var p = new Promise(function(resolve, reject) {
      resolveLocal = resolve;
      rejectLocal = reject;
    });

    p.resolve = resolveLocal;
    p.reject = rejectLocal;
    return p;
  }
});
