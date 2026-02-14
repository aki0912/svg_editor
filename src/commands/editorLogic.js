import {
  convertSvgTextYToTop,
  convertTopToSvgTextY,
  parseSvgTextElements,
} from './textLayout.js';

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function deepClone(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function normalizeArray(values) {
  return Array.isArray(values) ? values : [];
}

function normalizeSet(values) {
  return new Set(normalizeArray(values));
}

function createIncrementalIdFactory(prefix = 'id') {
  let sequence = 1;
  return () => `${prefix}-${sequence++}`;
}

function createUniqueId(existingIds, idFactory, prefix = 'id') {
  const existing = existingIds instanceof Set ? existingIds : new Set();
  const factory = typeof idFactory === 'function' ? idFactory : createIncrementalIdFactory(prefix);
  let base = String(factory() || '').trim();
  if (!base) {
    base = `${prefix}-${existing.size + 1}`;
  }
  let candidate = base;
  let suffix = 1;
  while (existing.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  existing.add(candidate);
  return candidate;
}

function toggleSelection(selectedElementIds, elementId, shiftKey = false) {
  const selected = normalizeArray(selectedElementIds).slice();
  if (!elementId) return selected;
  if (!shiftKey) return [elementId];
  const index = selected.indexOf(elementId);
  if (index >= 0) {
    selected.splice(index, 1);
    return selected;
  }
  selected.push(elementId);
  return selected;
}

function normalizeRect(rect = {}) {
  const x1 = toNumber(rect.x1 ?? rect.x ?? 0, 0);
  const y1 = toNumber(rect.y1 ?? rect.y ?? 0, 0);
  const x2 = toNumber(rect.x2 ?? ((rect.x ?? 0) + (rect.width ?? 0)), 0);
  const y2 = toNumber(rect.y2 ?? ((rect.y ?? 0) + (rect.height ?? 0)), 0);
  return {
    left: Math.min(x1, x2),
    right: Math.max(x1, x2),
    top: Math.min(y1, y2),
    bottom: Math.max(y1, y2),
  };
}

function isElementIntersectingRect(element, rect) {
  if (!element) return false;
  const x = toNumber(element.x, 0);
  const y = toNumber(element.y, 0);
  const width = Math.max(0, toNumber(element.width, 0));
  const height = Math.max(0, toNumber(element.height, 0));
  const left = x;
  const right = x + width;
  const top = y;
  const bottom = y + height;
  return !(right < rect.left || left > rect.right || bottom < rect.top || top > rect.bottom);
}

function marqueeSelect(elements, rect) {
  const normalized = normalizeRect(rect);
  return normalizeArray(elements)
    .filter((element) => isElementIntersectingRect(element, normalized))
    .map((element) => element.id);
}

function moveSelectedElements(elements, selectedElementIds, deltaX = 0, deltaY = 0) {
  const selected = normalizeSet(selectedElementIds);
  const dx = toNumber(deltaX, 0);
  const dy = toNumber(deltaY, 0);
  return normalizeArray(elements).map((element) => {
    if (!element || !selected.has(element.id)) return { ...element };
    return {
      ...element,
      x: toNumber(element.x, 0) + dx,
      y: toNumber(element.y, 0) + dy,
    };
  });
}

function duplicateSelectedElements(elements, selectedElementIds, options = {}) {
  const selected = normalizeSet(selectedElementIds);
  const offsetX = toNumber(options.offsetX, 16);
  const offsetY = toNumber(options.offsetY, 16);
  const idFactory = options.idFactory;
  const existingIds = new Set(normalizeArray(elements).map((element) => element.id));
  const duplicated = [];
  const duplicatedIds = [];

  for (const element of normalizeArray(elements)) {
    if (!element || !selected.has(element.id)) continue;
    const clone = deepClone(element);
    clone.id = createUniqueId(existingIds, idFactory, 'element');
    clone.x = toNumber(clone.x, 0) + offsetX;
    clone.y = toNumber(clone.y, 0) + offsetY;
    duplicated.push(clone);
    duplicatedIds.push(clone.id);
  }

  return {
    elements: [...normalizeArray(elements).map((element) => deepClone(element)), ...duplicated],
    selectedElementIds: duplicatedIds,
  };
}

function deleteSelectedElements(elements, selectedElementIds) {
  const selected = normalizeSet(selectedElementIds);
  return {
    elements: normalizeArray(elements)
      .filter((element) => !selected.has(element?.id))
      .map((element) => deepClone(element)),
    selectedElementIds: [],
  };
}

function getSelectedElements(elements, selectedElementIds) {
  const selected = normalizeSet(selectedElementIds);
  return normalizeArray(elements).filter((element) => element && selected.has(element.id));
}

function getSelectionBounds(elements) {
  const selected = normalizeArray(elements);
  if (!selected.length) return null;
  const left = Math.min(...selected.map((element) => toNumber(element.x, 0)));
  const right = Math.max(...selected.map((element) => toNumber(element.x, 0) + toNumber(element.width, 0)));
  const top = Math.min(...selected.map((element) => toNumber(element.y, 0)));
  const bottom = Math.max(...selected.map((element) => toNumber(element.y, 0) + toNumber(element.height, 0)));
  return {
    left,
    right,
    top,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

function alignSelectedElements(elements, selectedElementIds, mode) {
  const selected = normalizeSet(selectedElementIds);
  const selectedElements = getSelectedElements(elements, selectedElementIds);
  const bounds = getSelectionBounds(selectedElements);
  if (!bounds || !selectedElements.length) return normalizeArray(elements).map((element) => ({ ...element }));

  return normalizeArray(elements).map((element) => {
    if (!selected.has(element?.id)) return { ...element };
    const width = toNumber(element.width, 0);
    const height = toNumber(element.height, 0);
    if (mode === 'left') return { ...element, x: bounds.left };
    if (mode === 'center') return { ...element, x: bounds.left + ((bounds.width - width) / 2) };
    if (mode === 'right') return { ...element, x: bounds.right - width };
    if (mode === 'top') return { ...element, y: bounds.top };
    if (mode === 'middle') return { ...element, y: bounds.top + ((bounds.height - height) / 2) };
    if (mode === 'bottom') return { ...element, y: bounds.bottom - height };
    return { ...element };
  });
}

function distributeSelectedElements(elements, selectedElementIds, axis = 'horizontal') {
  const selected = getSelectedElements(elements, selectedElementIds);
  if (selected.length < 3) return normalizeArray(elements).map((element) => ({ ...element }));
  const isHorizontal = axis !== 'vertical';

  const sorted = selected.slice().sort((a, b) => {
    if (isHorizontal) return toNumber(a.x, 0) - toNumber(b.x, 0);
    return toNumber(a.y, 0) - toNumber(b.y, 0);
  });

  if (isHorizontal) {
    const start = toNumber(sorted[0].x, 0);
    const end = toNumber(sorted[sorted.length - 1].x, 0) + toNumber(sorted[sorted.length - 1].width, 0);
    const totalSize = sorted.reduce((sum, element) => sum + toNumber(element.width, 0), 0);
    const gap = (end - start - totalSize) / (sorted.length - 1);
    const xMap = new Map();
    let cursor = start;
    for (const element of sorted) {
      xMap.set(element.id, cursor);
      cursor += toNumber(element.width, 0) + gap;
    }
    return normalizeArray(elements).map((element) => {
      if (!xMap.has(element?.id)) return { ...element };
      return { ...element, x: xMap.get(element.id) };
    });
  }

  const start = toNumber(sorted[0].y, 0);
  const end = toNumber(sorted[sorted.length - 1].y, 0) + toNumber(sorted[sorted.length - 1].height, 0);
  const totalSize = sorted.reduce((sum, element) => sum + toNumber(element.height, 0), 0);
  const gap = (end - start - totalSize) / (sorted.length - 1);
  const yMap = new Map();
  let cursor = start;
  for (const element of sorted) {
    yMap.set(element.id, cursor);
    cursor += toNumber(element.height, 0) + gap;
  }
  return normalizeArray(elements).map((element) => {
    if (!yMap.has(element?.id)) return { ...element };
    return { ...element, y: yMap.get(element.id) };
  });
}

function matchSelectedElementSize(elements, selectedElementIds, mode = 'width') {
  const selected = getSelectedElements(elements, selectedElementIds);
  if (!selected.length) return normalizeArray(elements).map((element) => ({ ...element }));
  const selectedSet = normalizeSet(selectedElementIds);
  const targetSize = mode === 'height'
    ? toNumber(selected[0].height, 0)
    : toNumber(selected[0].width, 0);

  return normalizeArray(elements).map((element) => {
    if (!selectedSet.has(element?.id)) return { ...element };
    if (mode === 'height') return { ...element, height: targetSize };
    return { ...element, width: targetSize };
  });
}

function resizeElementWithHandle(element, handle, deltaX = 0, deltaY = 0, options = {}) {
  const safeHandle = String(handle ?? '').toLowerCase();
  const minWidth = Math.max(1, toNumber(options.minWidth, 10));
  const minHeight = Math.max(1, toNumber(options.minHeight, 10));
  const snapGrid = Math.max(0, toNumber(options.snapGrid, 0));

  let left = toNumber(element?.x, 0);
  let right = left + Math.max(minWidth, toNumber(element?.width, minWidth));
  let top = toNumber(element?.y, 0);
  let bottom = top + Math.max(minHeight, toNumber(element?.height, minHeight));

  const moveLeft = safeHandle.includes('w');
  const moveRight = safeHandle.includes('e');
  const moveTop = safeHandle.includes('n');
  const moveBottom = safeHandle.includes('s');

  if (moveLeft) left += toNumber(deltaX, 0);
  if (moveRight) right += toNumber(deltaX, 0);
  if (moveTop) top += toNumber(deltaY, 0);
  if (moveBottom) bottom += toNumber(deltaY, 0);

  if (snapGrid > 0) {
    if (moveLeft) left = Math.round(left / snapGrid) * snapGrid;
    if (moveRight) right = Math.round(right / snapGrid) * snapGrid;
    if (moveTop) top = Math.round(top / snapGrid) * snapGrid;
    if (moveBottom) bottom = Math.round(bottom / snapGrid) * snapGrid;
  }

  if ((right - left) < minWidth) {
    if (moveLeft && !moveRight) {
      left = right - minWidth;
    } else {
      right = left + minWidth;
    }
  }

  if ((bottom - top) < minHeight) {
    if (moveTop && !moveBottom) {
      top = bottom - minHeight;
    } else {
      bottom = top + minHeight;
    }
  }

  return {
    ...element,
    x: left,
    y: top,
    width: Math.max(minWidth, right - left),
    height: Math.max(minHeight, bottom - top),
  };
}

function degToRad(angle) {
  return (toNumber(angle, 0) * Math.PI) / 180;
}

function normalizeAngle(angle) {
  const raw = toNumber(angle, 0) % 360;
  return raw < 0 ? raw + 360 : raw;
}

function getArrowCenter(arrow) {
  const x = toNumber(arrow?.x, 0);
  const y = toNumber(arrow?.y, 0);
  const width = Math.max(1, toNumber(arrow?.width, 1));
  const height = toNumber(arrow?.height, 0);
  return {
    x: x + (width / 2),
    y: y + (height / 2),
    width,
    height,
  };
}

function getArrowDirection(arrow) {
  const rad = degToRad(arrow?.rotation ?? 0);
  return {
    x: Math.cos(rad),
    y: Math.sin(rad),
  };
}

function computeArrowEndpoints(arrow) {
  const center = getArrowCenter(arrow);
  const direction = getArrowDirection(arrow);
  const halfLength = Math.max(0.5, center.width / 2);
  return {
    start: {
      x: center.x - (direction.x * halfLength),
      y: center.y - (direction.y * halfLength),
    },
    end: {
      x: center.x + (direction.x * halfLength),
      y: center.y + (direction.y * halfLength),
    },
  };
}

function rotateArrowTowardPoint(arrow, point) {
  const center = getArrowCenter(arrow);
  const dx = toNumber(point?.x, center.x) - center.x;
  const dy = toNumber(point?.y, center.y) - center.y;
  const angle = normalizeAngle((Math.atan2(dy, dx) * 180) / Math.PI);
  return {
    ...arrow,
    rotation: angle,
  };
}

function getArrowRotationHandlePosition(arrow, distance = 24) {
  const endpoints = computeArrowEndpoints(arrow);
  const direction = getArrowDirection(arrow);
  const safeDistance = Math.max(0, toNumber(distance, 24));
  return {
    x: endpoints.end.x + (direction.x * safeDistance),
    y: endpoints.end.y + (direction.y * safeDistance),
  };
}

function handleEscapeForEditing(state = {}) {
  if (state.editingTextId == null) return { ...deepClone(state), action: 'noop' };
  return {
    ...deepClone(state),
    editingTextId: null,
    textDraft: null,
    action: 'cancel-text-edit',
  };
}

function handleDeleteBackspace(state = {}, key = 'Delete') {
  const safeState = deepClone(state);
  const normalizedKey = String(key ?? '').toLowerCase();
  if (safeState.editingTextId != null) {
    return {
      ...safeState,
      action: 'delete-character',
    };
  }

  if (normalizedKey !== 'delete' && normalizedKey !== 'backspace') {
    return {
      ...safeState,
      action: 'noop',
    };
  }

  const selected = normalizeSet(safeState.selectedElementIds);
  return {
    ...safeState,
    elements: normalizeArray(safeState.elements).filter((element) => !selected.has(element?.id)),
    selectedElementIds: [],
    action: 'delete-elements',
  };
}

function copySelectedElements(elements, selectedElementIds) {
  const selected = normalizeSet(selectedElementIds);
  return normalizeArray(elements)
    .filter((element) => selected.has(element?.id))
    .map((element) => deepClone(element));
}

function cutSelectedElements(elements, selectedElementIds) {
  const clipboard = copySelectedElements(elements, selectedElementIds);
  const deleted = deleteSelectedElements(elements, selectedElementIds);
  return {
    elements: deleted.elements,
    selectedElementIds: [],
    clipboard,
  };
}

function pasteClipboardElements(elements, clipboard, options = {}) {
  const offsetX = toNumber(options.offsetX, 16);
  const offsetY = toNumber(options.offsetY, 16);
  const idFactory = options.idFactory;
  const existingIds = new Set(normalizeArray(elements).map((element) => element.id));
  const pastedIds = [];
  const pasted = normalizeArray(clipboard).map((item) => {
    const clone = deepClone(item);
    clone.id = createUniqueId(existingIds, idFactory, 'element');
    clone.x = toNumber(clone.x, 0) + offsetX;
    clone.y = toNumber(clone.y, 0) + offsetY;
    pastedIds.push(clone.id);
    return clone;
  });
  return {
    elements: [...normalizeArray(elements).map((element) => deepClone(element)), ...pasted],
    selectedElementIds: pastedIds,
  };
}

function areElementIdsUnique(elements) {
  const ids = normalizeArray(elements).map((element) => element?.id).filter(Boolean);
  return new Set(ids).size === ids.length;
}

function createSlideFromTemplate(template = 'blank', options = {}) {
  const idFactory = typeof options.idFactory === 'function'
    ? options.idFactory
    : createIncrementalIdFactory('id');
  const existingIds = new Set();
  const slideId = createUniqueId(existingIds, idFactory, 'slide');
  const name = String(options.name || '').trim() || `スライド ${slideId}`;

  const createText = (text, x, y, fontSize) => ({
    id: createUniqueId(existingIds, idFactory, 'element'),
    type: 'text',
    x,
    y,
    width: 600,
    height: Math.round(fontSize * 1.4),
    text,
    fontSize,
    fontFamily: 'Arial, sans-serif',
    fontWeight: 'normal',
    fontStyle: 'normal',
    textAnchor: 'start',
    dominantBaseline: 'alphabetic',
    alignmentBaseline: 'baseline',
  });

  const slide = {
    id: slideId,
    name,
    template,
    elements: [],
  };

  if (template === 'title') {
    slide.elements.push(createText('タイトルを入力', 120, 120, 54));
    slide.elements.push(createText('サブタイトルを入力', 120, 220, 30));
  } else if (template === 'title-body') {
    slide.elements.push(createText('タイトルを入力', 100, 90, 48));
    slide.elements.push(createText('本文を入力', 100, 200, 30));
  } else if (template === 'section') {
    slide.elements.push(createText('セクションタイトル', 110, 150, 60));
  }

  return slide;
}

function duplicateSlide(slides, index, options = {}) {
  const list = normalizeArray(slides).map((slide) => deepClone(slide));
  if (!list.length || index < 0 || index >= list.length) {
    return {
      slides: list,
      currentSlideIndex: clamp(index, 0, Math.max(0, list.length - 1)),
    };
  }

  const idFactory = typeof options.idFactory === 'function'
    ? options.idFactory
    : createIncrementalIdFactory('id');
  const existingSlideIds = new Set(list.map((slide) => slide.id));
  const existingElementIds = new Set(
    list.flatMap((slide) => normalizeArray(slide?.elements).map((element) => element.id)),
  );

  const baseSlide = deepClone(list[index]);
  baseSlide.id = createUniqueId(existingSlideIds, idFactory, 'slide');
  baseSlide.name = `${String(baseSlide.name || 'スライド')} (copy)`;
  baseSlide.elements = normalizeArray(baseSlide.elements).map((element) => {
    const clone = deepClone(element);
    clone.id = createUniqueId(existingElementIds, idFactory, 'element');
    return clone;
  });

  const nextSlides = list.slice();
  nextSlides.splice(index + 1, 0, baseSlide);
  return {
    slides: nextSlides,
    currentSlideIndex: index + 1,
  };
}

function deleteSlide(slides, currentSlideIndex, deleteIndex, options = {}) {
  const list = normalizeArray(slides).map((slide) => deepClone(slide));
  const idFactory = typeof options.idFactory === 'function'
    ? options.idFactory
    : createIncrementalIdFactory('id');

  if (!list.length) {
    return {
      slides: [createSlideFromTemplate('blank', { idFactory })],
      currentSlideIndex: 0,
    };
  }

  if (list.length === 1) {
    return {
      slides: list,
      currentSlideIndex: 0,
    };
  }

  const safeDeleteIndex = clamp(toNumber(deleteIndex, 0), 0, list.length - 1);
  list.splice(safeDeleteIndex, 1);

  const safeCurrent = clamp(toNumber(currentSlideIndex, 0), 0, list.length);
  let nextIndex = safeCurrent;
  if (safeDeleteIndex < safeCurrent) nextIndex -= 1;
  if (nextIndex >= list.length) nextIndex = list.length - 1;
  return {
    slides: list,
    currentSlideIndex: clamp(nextIndex, 0, list.length - 1),
  };
}

function resolveSlideNavigation(currentSlideIndex, totalSlides, action = {}) {
  const total = Math.max(1, toNumber(totalSlides, 1));
  const current = clamp(toNumber(currentSlideIndex, 0), 0, total - 1);
  const type = String(action.type || '').toLowerCase();

  if (type === 'prev') return clamp(current - 1, 0, total - 1);
  if (type === 'next') return clamp(current + 1, 0, total - 1);
  if (type === 'select') return clamp(toNumber(action.index, current), 0, total - 1);
  return current;
}

function buildSlideControlState(currentSlideIndex, totalSlides) {
  const total = Math.max(1, toNumber(totalSlides, 1));
  const current = clamp(toNumber(currentSlideIndex, 0), 0, total - 1);
  return {
    currentSlideIndex: current,
    totalSlides: total,
    canGoPrev: current > 0,
    canGoNext: current < total - 1,
    displayLabel: `${current + 1} / ${total}`,
  };
}

function exportStateToJson(state) {
  return JSON.stringify(deepClone(state));
}

function importStateFromJson(jsonString) {
  return deepClone(JSON.parse(String(jsonString ?? '{}')));
}

function parseTagAttributes(rawAttributes = '') {
  const attrs = {};
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let match = pattern.exec(rawAttributes);
  while (match) {
    attrs[match[1].toLowerCase()] = match[3] ?? match[4] ?? '';
    match = pattern.exec(rawAttributes);
  }
  return attrs;
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatNumber(value) {
  const safe = toNumber(value, 0);
  const rounded = Math.round(safe * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function exportElementsToSvg(elements = [], options = {}) {
  const width = Math.max(1, toNumber(options.width, 1366));
  const height = Math.max(1, toNumber(options.height, 768));
  const nodes = [];

  for (const element of normalizeArray(elements)) {
    if (!element || !element.type) continue;
    const idAttr = `data-id="${escapeXml(element.id || '')}"`;

    if (element.type === 'rect') {
      nodes.push(
        `<rect ${idAttr} x="${formatNumber(element.x)}" y="${formatNumber(element.y)}" width="${formatNumber(element.width)}" height="${formatNumber(element.height)}" fill="${escapeXml(element.fill || '#ffffff')}" stroke="${escapeXml(element.stroke || '#000000')}" stroke-width="${formatNumber(toNumber(element.strokeWidth, 1))}" />`,
      );
      continue;
    }

    if (element.type === 'ellipse') {
      const cx = toNumber(element.x, 0) + (toNumber(element.width, 0) / 2);
      const cy = toNumber(element.y, 0) + (toNumber(element.height, 0) / 2);
      const rx = Math.max(0, toNumber(element.width, 0) / 2);
      const ry = Math.max(0, toNumber(element.height, 0) / 2);
      nodes.push(
        `<ellipse ${idAttr} cx="${formatNumber(cx)}" cy="${formatNumber(cy)}" rx="${formatNumber(rx)}" ry="${formatNumber(ry)}" fill="${escapeXml(element.fill || '#ffffff')}" stroke="${escapeXml(element.stroke || '#000000')}" stroke-width="${formatNumber(toNumber(element.strokeWidth, 1))}" />`,
      );
      continue;
    }

    if (element.type === 'image') {
      nodes.push(
        `<image ${idAttr} x="${formatNumber(element.x)}" y="${formatNumber(element.y)}" width="${formatNumber(element.width)}" height="${formatNumber(element.height)}" href="${escapeXml(element.href || element.src || '')}" />`,
      );
      continue;
    }

    if (element.type === 'arrow' || element.type === 'line') {
      const endpoints = computeArrowEndpoints(element);
      nodes.push(
        `<line ${idAttr} data-type="${element.type}" x1="${formatNumber(endpoints.start.x)}" y1="${formatNumber(endpoints.start.y)}" x2="${formatNumber(endpoints.end.x)}" y2="${formatNumber(endpoints.end.y)}" stroke="${escapeXml(element.stroke || '#000000')}" stroke-width="${formatNumber(toNumber(element.strokeWidth, 2))}" data-rotation="${formatNumber(toNumber(element.rotation, 0))}" />`,
      );
      continue;
    }

    if (element.type === 'text') {
      const fontSize = Math.max(1, toNumber(element.fontSize, 32));
      const baselineY = convertTopToSvgTextY(
        toNumber(element.y, 0),
        fontSize,
        element.dominantBaseline || 'alphabetic',
        element.alignmentBaseline || 'baseline',
      );
      nodes.push(
        `<text ${idAttr} x="${formatNumber(element.x)}" y="${formatNumber(baselineY)}" font-size="${formatNumber(fontSize)}" font-family="${escapeXml(element.fontFamily || 'Arial, sans-serif')}" font-weight="${escapeXml(element.fontWeight || 'normal')}" text-anchor="${escapeXml(element.textAnchor || 'start')}" dominant-baseline="${escapeXml(element.dominantBaseline || 'alphabetic')}">${escapeXml(element.text || '')}</text>`,
      );
      continue;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${formatNumber(width)} ${formatNumber(height)}">${nodes.join('')}</svg>`;
}

function importElementsFromSvg(svgString = '') {
  const source = String(svgString ?? '');
  const imported = [];

  const rectRegex = /<rect\b([^>]*)\/?>/gi;
  let rectMatch = rectRegex.exec(source);
  while (rectMatch) {
    const attrs = parseTagAttributes(rectMatch[1]);
    imported.push({
      id: attrs['data-id'] || attrs.id || `rect-${imported.length + 1}`,
      type: 'rect',
      x: toNumber(attrs.x, 0),
      y: toNumber(attrs.y, 0),
      width: toNumber(attrs.width, 0),
      height: toNumber(attrs.height, 0),
      fill: attrs.fill || '#ffffff',
      stroke: attrs.stroke || '#000000',
      strokeWidth: toNumber(attrs['stroke-width'], 1),
    });
    rectMatch = rectRegex.exec(source);
  }

  const ellipseRegex = /<ellipse\b([^>]*)\/?>/gi;
  let ellipseMatch = ellipseRegex.exec(source);
  while (ellipseMatch) {
    const attrs = parseTagAttributes(ellipseMatch[1]);
    const rx = toNumber(attrs.rx, 0);
    const ry = toNumber(attrs.ry, 0);
    const cx = toNumber(attrs.cx, 0);
    const cy = toNumber(attrs.cy, 0);
    imported.push({
      id: attrs['data-id'] || attrs.id || `ellipse-${imported.length + 1}`,
      type: 'ellipse',
      x: cx - rx,
      y: cy - ry,
      width: rx * 2,
      height: ry * 2,
      fill: attrs.fill || '#ffffff',
      stroke: attrs.stroke || '#000000',
      strokeWidth: toNumber(attrs['stroke-width'], 1),
    });
    ellipseMatch = ellipseRegex.exec(source);
  }

  const imageRegex = /<image\b([^>]*)\/?>/gi;
  let imageMatch = imageRegex.exec(source);
  while (imageMatch) {
    const attrs = parseTagAttributes(imageMatch[1]);
    imported.push({
      id: attrs['data-id'] || attrs.id || `image-${imported.length + 1}`,
      type: 'image',
      x: toNumber(attrs.x, 0),
      y: toNumber(attrs.y, 0),
      width: toNumber(attrs.width, 0),
      height: toNumber(attrs.height, 0),
      href: attrs.href || attrs['xlink:href'] || '',
    });
    imageMatch = imageRegex.exec(source);
  }

  const lineRegex = /<line\b([^>]*)\/?>/gi;
  let lineMatch = lineRegex.exec(source);
  while (lineMatch) {
    const attrs = parseTagAttributes(lineMatch[1]);
    const type = attrs['data-type'] || 'line';
    const x1 = toNumber(attrs.x1, 0);
    const y1 = toNumber(attrs.y1, 0);
    const x2 = toNumber(attrs.x2, 0);
    const y2 = toNumber(attrs.y2, 0);
    const width = Math.max(1, Math.hypot(x2 - x1, y2 - y1));
    const rotation = toNumber(attrs['data-rotation'], (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI);
    imported.push({
      id: attrs['data-id'] || attrs.id || `${type}-${imported.length + 1}`,
      type,
      x: Math.min(x1, x2),
      y: (y1 + y2) / 2,
      width,
      height: 0,
      rotation,
      stroke: attrs.stroke || '#000000',
      strokeWidth: toNumber(attrs['stroke-width'], 2),
    });
    lineMatch = lineRegex.exec(source);
  }

  const textElements = parseSvgTextElements(source).map((element) => ({
    ...element,
    id: element.id || `text-${imported.length + 1}`,
  }));
  imported.push(...textElements);

  return imported;
}

function roundtripImageElement(imageElement) {
  const svg = exportElementsToSvg([imageElement], { width: 960, height: 540 });
  const imported = importElementsFromSvg(svg).find((element) => element.type === 'image');
  return imported || null;
}

function restoreStateFromStorage(storedValue, fallback = { slides: [], currentSlideIndex: 0 }) {
  let parsed;
  try {
    parsed = typeof storedValue === 'string'
      ? JSON.parse(storedValue)
      : deepClone(storedValue);
  } catch (_error) {
    parsed = deepClone(fallback);
  }

  const slides = normalizeArray(parsed?.slides).map((slide) => deepClone(slide));
  const safeSlides = slides.length ? slides : normalizeArray(fallback?.slides).map((slide) => deepClone(slide));
  const total = Math.max(1, safeSlides.length);
  const currentSlideIndex = clamp(toNumber(parsed?.currentSlideIndex, 0), 0, total - 1);

  return {
    ...deepClone(parsed || {}),
    slides: safeSlides,
    currentSlideIndex,
    selectedElementIds: [],
    selectedElementId: null,
    editingTextId: null,
  };
}

function updateSelectionOnPointerDown(state = {}, event = {}) {
  const current = deepClone(state);
  const targetType = String(event.targetType || '').toLowerCase();

  if (targetType === 'property-panel' || targetType === 'property-input' || targetType === 'property-control') {
    return current;
  }

  if (targetType === 'object' && event.elementId) {
    return {
      ...current,
      selectedElementIds: toggleSelection(
        current.selectedElementIds,
        event.elementId,
        Boolean(event.shiftKey),
      ),
    };
  }

  if (targetType === 'canvas-empty' || targetType === 'canvas') {
    return {
      ...current,
      selectedElementIds: [],
    };
  }

  return current;
}

export {
  createIncrementalIdFactory,
  toggleSelection,
  marqueeSelect,
  moveSelectedElements,
  duplicateSelectedElements,
  deleteSelectedElements,
  alignSelectedElements,
  distributeSelectedElements,
  matchSelectedElementSize,
  resizeElementWithHandle,
  computeArrowEndpoints,
  rotateArrowTowardPoint,
  getArrowRotationHandlePosition,
  handleEscapeForEditing,
  handleDeleteBackspace,
  copySelectedElements,
  cutSelectedElements,
  pasteClipboardElements,
  areElementIdsUnique,
  createSlideFromTemplate,
  duplicateSlide,
  deleteSlide,
  resolveSlideNavigation,
  buildSlideControlState,
  exportStateToJson,
  importStateFromJson,
  exportElementsToSvg,
  importElementsFromSvg,
  roundtripImageElement,
  restoreStateFromStorage,
  updateSelectionOnPointerDown,
  __internals,
};

const __internals = {
  toNumber,
  clamp,
  deepClone,
  createUniqueId,
  parseTagAttributes,
};

export default {
  createIncrementalIdFactory,
  toggleSelection,
  marqueeSelect,
  moveSelectedElements,
  duplicateSelectedElements,
  deleteSelectedElements,
  alignSelectedElements,
  distributeSelectedElements,
  matchSelectedElementSize,
  resizeElementWithHandle,
  computeArrowEndpoints,
  rotateArrowTowardPoint,
  getArrowRotationHandlePosition,
  handleEscapeForEditing,
  handleDeleteBackspace,
  copySelectedElements,
  cutSelectedElements,
  pasteClipboardElements,
  areElementIdsUnique,
  createSlideFromTemplate,
  duplicateSlide,
  deleteSlide,
  resolveSlideNavigation,
  buildSlideControlState,
  exportStateToJson,
  importStateFromJson,
  exportElementsToSvg,
  importElementsFromSvg,
  roundtripImageElement,
  restoreStateFromStorage,
  updateSelectionOnPointerDown,
  __internals,
};
