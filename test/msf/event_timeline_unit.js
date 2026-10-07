/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

filterDescribe('shaka.msf.EventTimeline', isMSFSupported, () => {
  /** @type {!shaka.msf.EventTimeline} */
  let eventTimeline;
  /** @type {!jasmine.Spy} */
  let onRecordSpy;
  /**
   * The times the placer answers, by record ID prefix ('m:1000'); records
   * with no entry cannot be placed.
   * @type {!Map<string, number>}
   */
  let placeable;

  beforeEach(() => {
    placeable = new Map();
    onRecordSpy = jasmine.createSpy('onRecord');
    eventTimeline = new shaka.msf.EventTimeline((record) => {
      const reference = indexReference(record.id);
      return placeable.has(reference) ? placeable.get(reference) : null;
    }, shaka.test.Util.spyFunc(onRecordSpy));
  });

  /**
   * @param {string} id A record ID.
   * @return {string} Its index reference, without the hash of its data.
   */
  function indexReference(id) {
    return id.split(':').slice(0, 2).join(':');
  }

  /**
   * @param {*} document
   * @param {boolean=} independent
   */
  function addObject(document, independent = true) {
    eventTimeline.addObject(shaka.util.BufferUtils.toUint8(
        shaka.util.StringUtils.toUTF8(JSON.stringify(document))),
    independent);
  }

  /** @return {!Array<string>} The index references reported, in order. */
  function reported() {
    return onRecordSpy.calls.allArgs().map(
        (args) => indexReference(/** @type {string} */ (args[0].id)));
  }

  it('reports a record with where it was placed', () => {
    placeable.set('m:1000', 1);

    addObject([{m: 1000, data: {value: 'a'}}]);

    expect(onRecordSpy).toHaveBeenCalledTimes(1);
    const [record, time] = onRecordSpy.calls.argsFor(0);
    expect(time).toBe(1);
    expect(record).toEqual(jasmine.objectContaining({
      index: 'm',
      time: 1000,
      location: null,
      data: {value: 'a'},
    }));
  });

  it('reads each kind of index reference', () => {
    placeable.set('m:1000', 1).set('t:1759924158381', 2).set('l:4,2', 3);

    addObject([
      {m: 1000, data: 1},
      {t: 1759924158381, data: 2},
      {l: [4, 2], data: 3},
    ]);

    expect(reported()).toEqual(['m:1000', 't:1759924158381', 'l:4,2']);
    const location = onRecordSpy.calls.argsFor(2)[0].location;
    expect(location).toEqual(
        {group: BigInt(4), object: BigInt(2), subgroup: null});
  });

  it('accepts the index references in either case', () => {
    placeable.set('m:1000', 1).set('t:2000', 2).set('l:1,0', 3);

    addObject([{M: 1000, data: 1}, {T: 2000, data: 2}, {L: [1, 0], data: 3}]);

    expect(reported()).toEqual(['m:1000', 't:2000', 'l:1,0']);
  });

  it('holds a record until it can be placed', () => {
    addObject([{l: [1, 0], data: 1}]);
    expect(onRecordSpy).not.toHaveBeenCalled();

    placeable.set('l:1,0', 2.002);
    eventTimeline.resolve();

    expect(onRecordSpy).toHaveBeenCalledTimes(1);
    expect(onRecordSpy.calls.argsFor(0)[1]).toBe(2.002);
  });

  it('reports each record once, however often it is repeated', () => {
    placeable.set('m:1000', 1).set('m:3000', 3);

    addObject([{m: 1000, data: 1}]);
    addObject([{m: 3000, data: 3}], /* independent= */ false);
    addObject([{m: 1000, data: 1}, {m: 3000, data: 3}]);
    eventTimeline.resolve();

    expect(reported()).toEqual(['m:1000', 'm:3000']);
  });

  it('tells apart records that share an index reference', () => {
    placeable.set('m:1000', 1);

    addObject([{m: 1000, data: 'splice'}, {m: 1000, data: 'cancel'}]);

    expect(onRecordSpy).toHaveBeenCalledTimes(2);
    const ids = onRecordSpy.calls.allArgs().map((args) => args[0].id);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('forgets the records a complete document no longer lists',
      /** @suppress {visibility} */
      () => {
        placeable.set('m:1000', 1);

        addObject([{m: 1000, data: 1}, {l: [9, 0], data: 2}]);
        expect(eventTimeline.reported_.size).toBe(1);
        expect(eventTimeline.pending_.size).toBe(1);

        addObject([{m: 5000, data: 3}]);

        expect(eventTimeline.reported_.size).toBe(0);
        // Aged out before it could be placed, so it is never reported.
        placeable.set('l:9,0', 18);
        eventTimeline.resolve();
        expect(reported()).toEqual(['m:1000']);
      });

  it('forgets nothing for an incremental document',
      /** @suppress {visibility} */
      () => {
        placeable.set('m:1000', 1);

        addObject([{m: 1000, data: 1}]);
        addObject([{m: 5000, data: 3}], /* independent= */ false);

        expect(eventTimeline.reported_.size).toBe(1);
      });

  it('forgets nothing for a complete document with nothing readable',
      /** @suppress {visibility} */
      () => {
        placeable.set('m:1000', 1);

        addObject([{m: 1000, data: 1}]);
        addObject([{data: 1}]);

        expect(eventTimeline.reported_.size).toBe(1);
      });

  it('discards malformed records but keeps the rest', () => {
    placeable.set('m:5000', 5);

    addObject([
      // No index reference.
      {data: 1},
      // Two of them.
      {m: 1000, t: 1000, data: 1},
      // No data.
      {m: 1000},
      // Locations that are not ones.
      {l: [1], data: 1},
      {l: [1, -1], data: 1},
      {l: [1.5, 0], data: 1},
      // Times that are not ones.
      {m: -1, data: 1},
      {m: '1000', data: 1},
      // Not an object.
      [1000, 1],
      null,
      {m: 5000, data: 1},
    ]);

    expect(reported()).toEqual(['m:5000']);
  });

  it('discards a document that is not a JSON array', () => {
    eventTimeline.addObject(new Uint8Array([0x7b]), true);
    addObject({m: 1000, data: 1});

    expect(onRecordSpy).not.toHaveBeenCalled();
  });

  it('bounds how many records wait to be placed',
      /** @suppress {visibility} */
      () => {
        const records = [];
        for (let i = 0; i < 150; i++) {
          records.push({l: [i, 0], data: i});
        }
        addObject(records);

        expect(eventTimeline.pending_.size)
            .toBe(shaka.msf.EventTimeline.MAX_PENDING_);
        // The oldest were the ones let go.
        placeable.set('l:0,0', 0).set('l:149,0', 149);
        eventTimeline.resolve();
        expect(reported()).toEqual(['l:149,0']);
      });
});
