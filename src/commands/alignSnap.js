(function (global) {
  function clampNumber(value, fallback) {
    if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
      return fallback;
    }
    return value;
  }

  function toFiniteNumber(value, fallback = 0) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return value;
  }

  function normalizeTargetEdge(value) {
    if (value === 'start' || value === 'end' || value === 'center') return value;
    return null;
  }

  function normalizeTargetSource(value) {
    if (value === 'element' || value === 'canvas') return value;
    return null;
  }

  function normalizeTargetEntry(target) {
    if (typeof target === 'number' && Number.isFinite(target)) {
      return {
        value: target,
        edge: null,
        source: null,
        elementId: null,
      };
    }

    if (!target || typeof target !== 'object') return null;

    const value = Number(target.value);
    if (!Number.isFinite(value)) return null;

    return {
      value,
      edge: normalizeTargetEdge(target.edge),
      source: normalizeTargetSource(target.source),
      elementId: target.elementId === undefined || target.elementId === null
        ? null
        : target.elementId,
    };
  }

  function collectTargetEntries(elements, activeElementId) {
    const vertical = [];
    const horizontal = [];

    for (const element of elements || []) {
      if (!element || element.id === activeElementId) continue;
      if (!Number.isFinite(element.x) || !Number.isFinite(element.y)) continue;

      const x = Number(element.x);
      const y = Number(element.y);
      const width = Number(element.width);
      const height = Number(element.height);
      const elementId = element.id === undefined || element.id === null
        ? null
        : element.id;

      if (Number.isFinite(width) && width >= 0) {
        vertical.push({
          value: x,
          edge: 'start',
          source: 'element',
          elementId,
        });
        vertical.push({
          value: x + width,
          edge: 'end',
          source: 'element',
          elementId,
        });
        if (width > 0) {
          vertical.push({
            value: x + width / 2,
            edge: 'center',
            source: 'element',
            elementId,
          });
        }
      }

      if (Number.isFinite(height) && height >= 0) {
        horizontal.push({
          value: y,
          edge: 'start',
          source: 'element',
          elementId,
        });
        horizontal.push({
          value: y + height,
          edge: 'end',
          source: 'element',
          elementId,
        });
        if (height > 0) {
          horizontal.push({
            value: y + height / 2,
            edge: 'center',
            source: 'element',
            elementId,
          });
        }
      }
    }

    return {
      vertical,
      horizontal,
    };
  }

  function collectTargetLines(elements, activeElementId) {
    const entries = collectTargetEntries(elements, activeElementId);

    return {
      vertical: entries.vertical.map((entry) => entry.value),
      horizontal: entries.horizontal.map((entry) => entry.value),
    };
  }

  function normalizeLineValue(value, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return num;
  }

  function pickSnapValue(candidate, size, targets, tolerance) {
    const safeSize = Math.max(0, size || 0);
    let best = {
      delta: Infinity,
      value: candidate,
      guide: null,
      candidateEdge: null,
      targetEdge: null,
      targetSource: null,
      targetElementId: null,
    };

    if (!Array.isArray(targets) || targets.length === 0) {
      return {
        value: candidate,
        guide: null,
      };
    }

    const numericCandidate = Number.isFinite(candidate) ? candidate : 0;

    for (const rawTarget of targets) {
      const entry = normalizeTargetEntry(rawTarget);
      if (!entry) continue;
      const target = entry.value;

      const leftDelta = Math.abs(numericCandidate - target);
      if (leftDelta < best.delta && leftDelta <= tolerance) {
        best = {
          delta: leftDelta,
          value: target,
          guide: target,
          candidateEdge: 'start',
          targetEdge: entry.edge,
          targetSource: entry.source,
          targetElementId: entry.elementId,
        };
      }

      const rightDelta = Math.abs((numericCandidate + safeSize) - target);
      if (rightDelta < best.delta && rightDelta <= tolerance) {
        best = {
          delta: rightDelta,
          value: target - safeSize,
          guide: target,
          candidateEdge: 'end',
          targetEdge: entry.edge,
          targetSource: entry.source,
          targetElementId: entry.elementId,
        };
      }

      const centerDelta = Math.abs((numericCandidate + safeSize / 2) - target);
      if (centerDelta < best.delta && centerDelta <= tolerance) {
        best = {
          delta: centerDelta,
          value: target - safeSize / 2,
          guide: target,
          candidateEdge: 'center',
          targetEdge: entry.edge,
          targetSource: entry.source,
          targetElementId: entry.elementId,
        };
      }
    }

    const hasMatch = best.delta <= tolerance && Number.isFinite(best.guide);

    return {
      value: best.value,
      guide: hasMatch ? best.guide : null,
      delta: best.delta,
      match: hasMatch
        ? {
          candidateEdge: best.candidateEdge,
          targetEdge: best.targetEdge,
          targetSource: best.targetSource,
          targetElementId: best.targetElementId,
          guide: best.guide,
        }
        : null,
    };
  }

  function createSnapEngine(options = {}) {
    const rawThreshold = clampNumber(options.snapThreshold, 10);
    const tolerance = Math.max(0, Number.isFinite(rawThreshold) ? rawThreshold : 10);

    function snapMove(payload = {}) {
      const x = toFiniteNumber(payload.x, 0);
      const y = toFiniteNumber(payload.y, 0);
      const width = toFiniteNumber(payload.width, 0);
      const height = toFiniteNumber(payload.height, 0);
      const elements = Array.isArray(payload.elements) ? payload.elements : [];
      const activeElementId = payload.activeElementId || null;
      const slideWidth = toFiniteNumber(payload.slideWidth, null);
      const slideHeight = toFiniteNumber(payload.slideHeight, null);
      const localTolerance = Number.isFinite(payload.snapThreshold) ? payload.snapThreshold : tolerance;

      const { vertical, horizontal } = collectTargetEntries(elements, activeElementId);

      const canvasVerticalTargets = [
        {
          value: 0,
          edge: 'start',
          source: 'canvas',
          elementId: null,
        },
        {
          value: slideWidth,
          edge: 'end',
          source: 'canvas',
          elementId: null,
        },
        {
          value: slideWidth / 2,
          edge: 'center',
          source: 'canvas',
          elementId: null,
        },
      ].filter((target) => Number.isFinite(target.value));

      const canvasHorizontalTargets = [
        {
          value: 0,
          edge: 'start',
          source: 'canvas',
          elementId: null,
        },
        {
          value: slideHeight,
          edge: 'end',
          source: 'canvas',
          elementId: null,
        },
        {
          value: slideHeight / 2,
          edge: 'center',
          source: 'canvas',
          elementId: null,
        },
      ].filter((target) => Number.isFinite(target.value));

      const vTargets = [...vertical, ...canvasVerticalTargets];
      const hTargets = [...horizontal, ...canvasHorizontalTargets];

      const snappedX = pickSnapValue(x, width, vTargets, localTolerance);
      const snappedY = pickSnapValue(y, height, hTargets, localTolerance);

      return {
        x: normalizeLineValue(snappedX.value, x),
        y: normalizeLineValue(snappedY.value, y),
        guideX: Number.isFinite(snappedX.guide) ? snappedX.guide : null,
        guideY: Number.isFinite(snappedY.guide) ? snappedY.guide : null,
        hasSnapX: Number.isFinite(snappedX.guide),
        hasSnapY: Number.isFinite(snappedY.guide),
        snapXMatch: snappedX.match,
        snapYMatch: snappedY.match,
      };
    }

    return {
      snapMove,
      collectTargetLines,
    };
  }

  const api = {
    createSnapEngine,
    __internals: {
      pickSnapValue,
      collectTargetLines,
      collectTargetEntries,
    },
  };

  if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = api;
  }

  global.EditorAlignSnap = api;
  if (!global.EditorSnap) {
    global.EditorSnap = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
