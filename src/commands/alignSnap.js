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

  function collectTargetLines(elements, activeElementId) {
    const vertical = [];
    const horizontal = [];

    for (const element of elements || []) {
      if (!element || element.id === activeElementId) continue;
      if (!Number.isFinite(element.x) || !Number.isFinite(element.y)) continue;

      const x = Number(element.x);
      const y = Number(element.y);
      const width = Number(element.width);
      const height = Number(element.height);

      if (Number.isFinite(width) && width >= 0) {
        vertical.push(x);
        vertical.push(x + width);
        if (width > 0) vertical.push(x + width / 2);
      }

      if (Number.isFinite(height) && height >= 0) {
        horizontal.push(y);
        horizontal.push(y + height);
        if (height > 0) horizontal.push(y + height / 2);
      }
    }

    return {
      vertical,
      horizontal,
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
    };

    if (!Array.isArray(targets) || targets.length === 0) {
      return {
        value: candidate,
        guide: null,
      };
    }

    const numericCandidate = Number.isFinite(candidate) ? candidate : 0;

    for (const t of targets) {
      const target = Number(t);
      if (!Number.isFinite(target)) continue;

      const leftDelta = Math.abs(numericCandidate - target);
      if (leftDelta < best.delta && leftDelta <= tolerance) {
        best = { delta: leftDelta, value: target, guide: target };
      }

      const rightDelta = Math.abs((numericCandidate + safeSize) - target);
      if (rightDelta < best.delta && rightDelta <= tolerance) {
        best = { delta: rightDelta, value: target - safeSize, guide: target };
      }

      const centerDelta = Math.abs((numericCandidate + safeSize / 2) - target);
      if (centerDelta < best.delta && centerDelta <= tolerance) {
        best = { delta: centerDelta, value: target - safeSize / 2, guide: target };
      }
    }

    return {
      value: best.value,
      guide: best.delta <= tolerance ? best.guide : null,
      delta: best.delta,
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

      const { vertical, horizontal } = collectTargetLines(elements, activeElementId);

      const canvasVerticalTargets = [
        0,
        slideWidth,
        slideWidth / 2,
      ].filter((value) => Number.isFinite(value));

      const canvasHorizontalTargets = [
        0,
        slideHeight,
        slideHeight / 2,
      ].filter((value) => Number.isFinite(value));

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
