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

describe('CancelableChain', function() {
  /** @type {!shaka.util.CancelableChain} */
  let chain;

  beforeEach(function() {
    chain = new shaka.util.CancelableChain();
  });

  it('functions like a simple Promise chain', function(done) {
    let delayStart;

    chain.then(function(data) {
      expect(data).toBe(undefined);
      return 1;
    }).then(function(data) {
      expect(data).toEqual(1);
      return 'abc';
    }).then(function(data) {
      expect(data).toEqual('abc');
      return true;
    }).then(function(data) {
      expect(data).toBe(true);
      return {'testing': 'complex'};
    }).then(function(data) {
      expect(data).toEqual({'testing': 'complex'});
      return ['a', 5, false];
    }).then(function(data) {
      expect(data).toEqual(['a', 5, false]);
      return Promise.resolve(73);
    }).then(function(data) {
      expect(data).toEqual(73);

      delayStart = Date.now();
      let p = new shaka.util.PublicPromise();
      setTimeout(p.resolve.bind(p, 'delayed'), 200);
      return p;
    }).then(function(data) {
      let delay = Date.now() - delayStart;
      expect(data).toEqual('delayed');
      expect(delay).toBeGreaterThan(198);
    }).finalize().catch(fail).then(done);
  });

  it('must be finalized to catch failures', function() {
    // compiler workaround
    let catchMethod = /** @type {Object} */(chain)['catch'];

    // no chain.catch
    expect(catchMethod).toBe(undefined);
    // no second argument on chain.then
    expect(chain.then.length).toBe(1);
    // finalize returns the final Promise, where errors are received.
    expect(chain.finalize().catch).toEqual(jasmine.any(Function));
  });

  it('stops accepting new stages after being finalized', function(done) {
    chain.then(function() {
      return shaka.test.Util.delay(0.5);
    });

    let p = chain.finalize();
    expect(chain.then).toThrow(jasmine.any(TypeError));
    p.catch(fail).then(done);
  });

  it('returns the same promise after being finalized', function() {
    let p = chain.then(function() { return 1; }).finalize();
    expect(chain.finalize()).toBe(p);
  });

  describe('cancel', function() {
    let cannedError;

    beforeAll(function() {
      cannedError = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.PLAYER,
          shaka.util.Error.Code.LOAD_INTERRUPTED);
    });

    it('stops executing subsequent stages', function(done) {
      let block = new shaka.util.PublicPromise();

      let firstStageComplete = false;
      let secondStageComplete = false;
      let p = chain.then(function() {
        firstStageComplete = true;
        // Now block the chain.
        return block;
      }).then(function() {
        secondStageComplete = true;
      }).finalize();

      // The following "then(fail)" won't execute because we cancel the chain.
      p.then(fail).catch(function(reason) {
        expect(firstStageComplete).toBe(true);
        expect(secondStageComplete).toBe(false);
        expect(reason).toBe(cannedError);
      }).then(done);

      // Now cancel the chain.
      chain.cancel(cannedError);
      // The cancelation won't be processed until the chain is unblocked.
      block.resolve();
    });

    it('multiple calls result in the same Promise', function(done) {
      let block = new shaka.util.PublicPromise();
      let p = chain.then(function() {
        return block;
      }).finalize();

      let ownerDone = p.then(fail).catch(function(reason) {
        expect(reason).toBe(cannedError);
      });

      let chainDone1 = chain.cancel(cannedError);
      let chainDone2 = chain.cancel(cannedError);
      // These are the same Promise.
      expect(chainDone1).toBe(chainDone2);

      // The cancelation won't be processed until the chain is unblocked.
      block.resolve();

      Promise.all([ownerDone, chainDone1, chainDone2]).catch(fail).then(done);
    });

    it('works even during the final stage', function(done) {
      let block = new shaka.util.PublicPromise();
      let stageComplete = false;
      let p = chain.then(function() {
        stageComplete = true;
        return block;
      }).finalize();

      p.then(fail).catch(function(reason) {
        expect(stageComplete).toBe(true);
        expect(reason).toBe(cannedError);
      }).then(done);

      chain.cancel(cannedError);
      // The cancelation won't be processed until the chain is unblocked.
      block.resolve();
    });

    it('works even if stage is rejected after being canceled', function(done) {
      let p = new shaka.util.PublicPromise();
      let finalComplete = false;
      chain.then(function() {
        return p;
      }).finalize().then(fail).catch(function(err) {
        finalComplete = true;
        shaka.test.Util.expectToEqualError(err, cannedError);
      });

      chain.cancel(cannedError).catch(fail).then(function() {
        // Delay so the catch block above can run.
        return shaka.test.Util.delay(0.1);
      }).then(function() {
        expect(finalComplete).toBe(true);
        done();
      });
      p.reject(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.UNABLE_TO_GUESS_MANIFEST_TYPE));
    });

    it('resolves even after the finalized chain is resolved', function(done) {
      let stageComplete = false;
      let finalComplete = false;
      chain.then(function() {
        stageComplete = true;
      }).finalize().then(function() {
        finalComplete = true;
      }).catch(fail);

      shaka.test.Util.delay(0.5).then(function() {
        // The whole chain is done before we cancel.
        expect(stageComplete).toBe(true);
        expect(finalComplete).toBe(true);
        // Cancel should still resolve.
        return chain.cancel(cannedError);
      }).catch(fail).then(done);
    });

    it('resolves even after the finalized chain is rejected', function(done) {
      let stageComplete = false;
      let finalComplete = false;
      chain.then(function() {
        stageComplete = true;
        return Promise.reject(null);
      }).finalize().then(fail).catch(function() {
        finalComplete = true;
      });

      shaka.test.Util.delay(0.5).then(function() {
        // The whole chain is done before we cancel.
        expect(stageComplete).toBe(true);
        expect(finalComplete).toBe(true);
        // Cancel should still resolve.
        return chain.cancel(cannedError);
      }).catch(fail).then(done);
    });
  });

  describe('events', function() {
    it('can register onComplete event', function(done) {
      /** @type {boolean} */
      let completed = false;

      /** @type {!shaka.util.CancelableChain} */
      let chain = new shaka.util.CancelableChain();
      chain.onComplete(function() {
        completed = true;
      });

      // Completed callbacks should be called before the promise
      // completes.
      chain.finalize().catch(fail).then(function() {
        if (completed) {
          done();
        } else {
          fail();
        }
      });
    });

    it('can register onCancel event', function(done) {
      /** @const */
      let cannedError = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.PLAYER,
          shaka.util.Error.Code.LOAD_INTERRUPTED);

      /** @type {!shaka.util.CancelableChain} */
      let chain = new shaka.util.CancelableChain();
      chain.onCancel(done);

      chain.then(function() {
        let wait = shaka.test.Util.delay(1.0);
        chain.cancel(cannedError);
        return wait;
      }).finalize().then(fail).catch(() => {});
    });
  });
});
