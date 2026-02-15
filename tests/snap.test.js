import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import snapModule from '../src/commands/alignSnap.js';

const { createSnapEngine } = snapModule;

describe('snap engine', () => {
  it('keeps position when no nearby targets', () => {
    const snap = createSnapEngine({ snapThreshold: 6 });
    const result = snap.snapMove({
      x: 100,
      y: 100,
      width: 50,
      height: 40,
      elements: [
        { id: 'a', x: 0, y: 0, width: 40, height: 30 },
      ],
      slideWidth: 960,
      slideHeight: 720,
      activeElementId: 'target',
    });

    assert.equal(result.x, 100);
    assert.equal(result.y, 100);
    assert.equal(result.hasSnapX, false);
    assert.equal(result.hasSnapY, false);
    assert.equal(result.guideX, null);
    assert.equal(result.guideY, null);
  });

  it('snaps x coordinate to a nearby edge', () => {
    const snap = createSnapEngine({ snapThreshold: 10 });
    const result = snap.snapMove({
      x: 98,
      y: 20,
      width: 50,
      height: 40,
      elements: [
        { id: 'a', x: 50, y: 0, width: 80, height: 60 },
      ],
      slideWidth: 960,
      slideHeight: 720,
      activeElementId: 'target',
    });

    assert.equal(result.hasSnapX, true);
    assert.equal(result.x, 105);
    assert.equal(result.guideX, 130);
  });

  it('snaps y coordinate to canvas middle line', () => {
    const snap = createSnapEngine({ snapThreshold: 10 });
    const result = snap.snapMove({
      x: 100,
      y: 344,
      width: 40,
      height: 20,
      elements: [],
      slideWidth: 960,
      slideHeight: 720,
      activeElementId: 'target',
    });

    assert.equal(result.hasSnapY, true);
    assert.equal(result.y, 340);
    assert.equal(result.guideY, 360);
  });

  it('includes edge metadata for element-to-element snap', () => {
    const snap = createSnapEngine({ snapThreshold: 10 });
    const result = snap.snapMove({
      x: 100,
      y: 104,
      width: 50,
      height: 40,
      elements: [
        { id: 'a', x: 30, y: 100, width: 80, height: 40 },
      ],
      slideWidth: 960,
      slideHeight: 720,
      activeElementId: 'target',
    });

    assert.equal(result.hasSnapY, true);
    assert.equal(result.guideY, 100);
    assert.deepEqual(result.snapYMatch, {
      candidateEdge: 'start',
      targetEdge: 'start',
      targetSource: 'element',
      targetElementId: 'a',
      guide: 100,
    });
  });

  it('does not snap when threshold is 0', () => {
    const snap = createSnapEngine({ snapThreshold: 0 });
    const result = snap.snapMove({
      x: 98,
      y: 346,
      width: 50,
      height: 40,
      elements: [
        { id: 'a', x: 100, y: 344, width: 40, height: 40 },
      ],
      slideWidth: 960,
      slideHeight: 720,
      activeElementId: 'target',
    });

    assert.equal(result.hasSnapX, false);
    assert.equal(result.hasSnapY, false);
    assert.equal(result.x, 98);
    assert.equal(result.y, 346);
  });
});
