import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import historyModule from '../src/commands/history.js';

const { createHistoryManager } = historyModule;

describe('createHistoryManager', () => {
  it('initial state should be available as first snapshot and not undoable', () => {
    const history = createHistoryManager({ value: 1 });

    assert.equal(history.canUndo(), false);
    assert.equal(history.canRedo(), false);
    assert.deepEqual(history.current(), { value: 1 });
  });

  it('records state and can undo/redo', () => {
    const history = createHistoryManager({ value: 1 });

    history.record({ value: 2 });
    history.record({ value: 3 });

    assert.equal(history.canUndo(), true);
    assert.equal(history.canRedo(), false);
    assert.deepEqual(history.current(), { value: 3 });

    const undone = history.undo();
    assert.deepEqual(undone, { value: 2 });
    assert.equal(history.canUndo(), true);
    assert.equal(history.canRedo(), true);

    const redone = history.redo();
    assert.deepEqual(redone, { value: 3 });
    assert.equal(history.canUndo(), true);
    assert.equal(history.canRedo(), false);
  });

  it('clears redo entries when a new record is added after undo', () => {
    const history = createHistoryManager({ step: 1 }, { maxEntries: 8 });

    history.record({ step: 2 });
    history.record({ step: 3 });
    const middle = history.undo();
    assert.deepEqual(middle, { step: 2 });

    history.record({ step: 20 });

    assert.equal(history.canRedo(), false);
    assert.deepEqual(history.current(), { step: 20 });
    assert.equal(history.canUndo(), true);

    const redoResult = history.redo();
    assert.equal(redoResult, null);
  });

  it('replaces history root state', () => {
    const history = createHistoryManager({ count: 1 });
    history.record({ count: 2 });
    history.replace({ count: 99 });

    assert.equal(history.canUndo(), false);
    assert.equal(history.canRedo(), false);
    assert.deepEqual(history.current(), { count: 99 });
  });
});
