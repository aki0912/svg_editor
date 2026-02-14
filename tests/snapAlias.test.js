import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import alignSnapModule from '../src/commands/alignSnap.js';
import snapModule from '../src/commands/snap.js';

describe('snap command alias', () => {
  it('legacy snap module exports the same behavior as alignSnap', () => {
    const alignSnap = alignSnapModule;
    const legacySnap = snapModule;

    assert.equal(typeof alignSnap.createSnapEngine, 'function');
    assert.equal(typeof legacySnap.createSnapEngine, 'function');

    const alignEngine = alignSnap.createSnapEngine({ snapThreshold: 10 });
    const legacyEngine = legacySnap.createSnapEngine({ snapThreshold: 10 });

    const payload = {
      x: 98,
      y: 344,
      width: 50,
      height: 40,
      elements: [
        { id: 'a', x: 100, y: 344, width: 40, height: 40 },
      ],
      slideWidth: 960,
      slideHeight: 720,
      activeElementId: 'target',
    };

    assert.deepEqual(alignEngine.snapMove(payload), legacyEngine.snapMove(payload));
  });
});
