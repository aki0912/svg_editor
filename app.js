const SVG_NS = 'http://www.w3.org/2000/svg';
const HTML_NS = 'http://www.w3.org/1999/xhtml';
const STORAGE_KEY = 'svg_ppt_like_state_v1';
const SVG_IMPORT_PADDING_RATIO = 0;
const TEXT_EDIT_DRAG_THRESHOLD = 4;
const SNAP_THRESHOLD = 10;

const state = {
  slides: [createEmptySlide('スライド 1')],
  currentSlideIndex: 0,
  selectedElementId: null,
  pointerState: null,
};

const historyFactory = typeof window !== 'undefined'
  && window.EditorHistory
  && typeof window.EditorHistory.createHistoryManager === 'function'
    ? window.EditorHistory.createHistoryManager
    : null;
const history = historyFactory
  ? historyFactory(state, { maxEntries: 200 })
  : createFallbackHistoryManager(state, { maxEntries: 200 });

const snapEngineFactory = typeof window !== 'undefined'
  && window.EditorSnap
  && typeof window.EditorSnap.createSnapEngine === 'function'
    ? window.EditorSnap.createSnapEngine
    : null;
const snapEngine = snapEngineFactory
  ? snapEngineFactory({
    snapThreshold: SNAP_THRESHOLD,
  })
  : null;

let activeTextEditor = null;
let textMeasureContext = null;
let activeSnapGuide = null;

const dom = {
  slideList: document.getElementById('slide-list'),
  slideTitle: document.getElementById('slide-title'),
  canvas: document.getElementById('canvas'),
  addText: document.getElementById('add-text'),
  addRect: document.getElementById('add-rect'),
  addCircle: document.getElementById('add-circle'),
  addImage: document.getElementById('add-image'),
  newSlide: document.getElementById('new-slide'),
  duplicateSlide: document.getElementById('duplicate-slide'),
  deleteSlide: document.getElementById('delete-slide'),
  duplicateElement: document.getElementById('duplicate-element'),
  deleteElement: document.getElementById('delete-element'),
  resetState: document.getElementById('reset-state'),
  exportJSON: document.getElementById('export-json'),
  importJSON: document.getElementById('import-json'),
  importJSONButton: document.getElementById('import-json-button'),
  importSVG: document.getElementById('import-svg'),
  exportSVG: document.getElementById('export-svg'),
  importSVGButton: document.getElementById('import-svg-button'),
  selectedLabel: document.getElementById('selected-label'),
  propFill: document.getElementById('prop-fill'),
  propFillLabel: document.getElementById('prop-fill-label'),
  propStroke: document.getElementById('prop-stroke'),
  propStrokeLabel: document.getElementById('prop-stroke-label'),
  propFontSize: document.getElementById('prop-font-size'),
  propText: document.getElementById('prop-text'),
  bringFront: document.getElementById('bring-front'),
  sendBack: document.getElementById('send-back'),
  instructions: document.getElementById('instructions'),
  undoAction: document.getElementById('undo-action'),
  redoAction: document.getElementById('redo-action'),
};

function createId() {
  return (crypto.randomUUID && crypto.randomUUID()) || `id-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function createFallbackHistoryManager(initialState, options = {}) {
  const maxEntries = Math.max(1, Number.parseInt(options.maxEntries, 10) || 200);
  const records = [];
  let index = -1;

  const clone = (value) => {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  };

  function record(state) {
    const snapshot = clone(state);
    if (index < records.length - 1) {
      records.splice(index + 1);
    }

    records.push(snapshot);
    if (records.length > maxEntries) {
      records.shift();
      index = Math.max(0, index - 1);
    }

    index = records.length - 1;
    return snapshot;
  }

  function replace(state) {
    records.length = 0;
    index = -1;
    record(state);
  }

  function canUndo() {
    return index > 0;
  }

  function canRedo() {
    return index < records.length - 1;
  }

  function undo() {
    if (!canUndo()) return null;
    index -= 1;
    return clone(records[index]);
  }

  function redo() {
    if (!canRedo()) return null;
    index += 1;
    return clone(records[index]);
  }

  function current() {
    if (index < 0) return null;
    return clone(records[index]);
  }

  replace(initialState);

  return {
    record,
    replace,
    canUndo,
    canRedo,
    undo,
    redo,
    current,
  };
}

function createEmptySlide(title = '新規スライド') {
  return {
    id: createId(),
    title,
    width: 960,
    height: 720,
    background: '#ffffff',
    elements: [],
  };
}

function currentSlide() {
  return state.slides[state.currentSlideIndex] || state.slides[0];
}

function recordHistorySnapshot() {
  if (!history || typeof history.record !== 'function') return;
  history.record(state);
}

function restoreHistorySnapshot(snapshot) {
  if (!snapshot) return;

  const slides = Array.isArray(snapshot.slides) && snapshot.slides.length > 0
    ? snapshot.slides
    : [createEmptySlide('スライド 1')];

  const safeIndex = Number.isInteger(snapshot.currentSlideIndex)
    ? snapshot.currentSlideIndex
    : 0;
  const currentIndex = Math.min(Math.max(0, safeIndex), slides.length - 1);
  const current = slides[currentIndex];

  const selectedValid = !!(
    current
    && Array.isArray(current.elements)
    && snapshot.selectedElementId
    && current.elements.some((item) => item.id === snapshot.selectedElementId)
  );

  if (activeTextEditor) {
    closeActiveTextEditor({ commit: false, rerender: false });
  }

  state.slides = slides;
  state.currentSlideIndex = currentIndex;
  state.selectedElementId = selectedValid ? snapshot.selectedElementId : null;
  state.pointerState = null;

  render();
  saveLocal();
}

function updateHistoryControls() {
  if (!history || !dom.undoAction || !dom.redoAction) return;
  dom.undoAction.disabled = !history.canUndo();
  dom.redoAction.disabled = !history.canRedo();
}

function clearSnapGuideState() {
  activeSnapGuide = null;
}

function applyMoveSnap(element, x, y) {
  if (!snapEngine) return { x, y };

  const slide = currentSlide();
  const bounds = getElementBounds(element);
  const result = snapEngine.snapMove({
    x,
    y,
    width: Number.isFinite(bounds.width) ? bounds.width : Number.isFinite(element.width) ? element.width : 0,
    height: Number.isFinite(bounds.height) ? bounds.height : Number.isFinite(element.height) ? element.height : 0,
    elements: slide.elements,
    activeElementId: element.id,
    slideWidth: slide.width,
    slideHeight: slide.height,
    snapThreshold: SNAP_THRESHOLD,
  });

  activeSnapGuide = {
    guideX: Number.isFinite(result.guideX) ? result.guideX : null,
    guideY: Number.isFinite(result.guideY) ? result.guideY : null,
    hasSnapX: !!result.hasSnapX,
    hasSnapY: !!result.hasSnapY,
  };

  return {
    x: result.x,
    y: result.y,
  };
}

function applyResizeSnap(next, handle, baseBounds) {
  if (!snapEngine) return next;

  const slide = currentSlide();
  const hasMoveLeft = handle.includes('w');
  const hasMoveRight = handle.includes('e');
  const hasMoveTop = handle.includes('n');
  const hasMoveBottom = handle.includes('s');

  const rightEdge = next.x + next.width;
  const bottomEdge = next.y + next.height;
  const fixedLeft = baseBounds.x;
  const fixedRight = baseBounds.x + baseBounds.width;
  const fixedTop = baseBounds.y;
  const fixedBottom = baseBounds.y + baseBounds.height;

  const snapped = {
    x: next.x,
    y: next.y,
    width: next.width,
    height: next.height,
  };

  let guideX = null;
  let guideY = null;
  let hasSnapX = false;
  let hasSnapY = false;

  if (hasMoveLeft) {
    const leftSnap = snapEngine.snapMove({
      x: next.x,
      y: next.y,
      width: 0,
      height: next.height,
      elements: slide.elements,
      activeElementId: state.pointerState.elementId,
      slideWidth: slide.width,
      slideHeight: slide.height,
      snapThreshold: SNAP_THRESHOLD,
    });

    if (leftSnap.hasSnapX) {
      const alignedLeft = Number.isFinite(leftSnap.x) ? leftSnap.x : next.x;
      const alignedGuide = Number.isFinite(leftSnap.guideX) ? leftSnap.guideX : alignedLeft;
      snapped.x = alignedLeft;
      snapped.width = Math.max(20, fixedRight - alignedLeft);
      guideX = alignedGuide;
      hasSnapX = true;
    }
  }

  if (hasMoveRight) {
    const rightSnap = snapEngine.snapMove({
      x: rightEdge,
      y: next.y,
      width: 0,
      height: next.height,
      elements: slide.elements,
      activeElementId: state.pointerState.elementId,
      slideWidth: slide.width,
      slideHeight: slide.height,
      snapThreshold: SNAP_THRESHOLD,
    });

    const alignedRight = Number.isFinite(rightSnap.guideX) ? rightSnap.guideX : rightEdge;
    if (rightSnap.hasSnapX) {
      snapped.width = Math.max(20, alignedRight - fixedLeft);
      snapped.x = fixedLeft;
      guideX = alignedRight;
      hasSnapX = true;
    }
  }

  if (hasMoveTop) {
    const topSnap = snapEngine.snapMove({
      x: next.x,
      y: next.y,
      width: next.width,
      height: 0,
      elements: slide.elements,
      activeElementId: state.pointerState.elementId,
      slideWidth: slide.width,
      slideHeight: slide.height,
      snapThreshold: SNAP_THRESHOLD,
    });

    if (topSnap.hasSnapY) {
      const alignedTop = Number.isFinite(topSnap.y) ? topSnap.y : next.y;
      const alignedGuide = Number.isFinite(topSnap.guideY) ? topSnap.guideY : alignedTop;
      snapped.y = alignedTop;
      snapped.height = Math.max(20, fixedBottom - alignedTop);
      guideY = alignedGuide;
      hasSnapY = true;
    }
  }

  if (hasMoveBottom) {
    const bottomSnap = snapEngine.snapMove({
      x: next.x,
      y: bottomEdge,
      width: next.width,
      height: 0,
      elements: slide.elements,
      activeElementId: state.pointerState.elementId,
      slideWidth: slide.width,
      slideHeight: slide.height,
      snapThreshold: SNAP_THRESHOLD,
    });

    const alignedBottom = Number.isFinite(bottomSnap.guideY) ? bottomSnap.guideY : bottomEdge;
    if (bottomSnap.hasSnapY) {
      snapped.height = Math.max(20, alignedBottom - fixedTop);
      snapped.y = fixedTop;
      guideY = alignedBottom;
      hasSnapY = true;
    }
  }

  if (!hasMoveLeft && !hasMoveRight) {
    snapped.x = fixedLeft;
    snapped.width = baseBounds.width;
  }

  if (!hasMoveTop && !hasMoveBottom) {
    snapped.y = fixedTop;
    snapped.height = baseBounds.height;
  }

  activeSnapGuide = {
    guideX: Number.isFinite(guideX) ? guideX : null,
    guideY: Number.isFinite(guideY) ? guideY : null,
    hasSnapX,
    hasSnapY,
  };

  return snapped;
}

function undoHistory() {
  if (!history || typeof history.undo !== 'function') return;
  const snapshot = history.undo();
  if (!snapshot) return;
  restoreHistorySnapshot(snapshot);
}

function redoHistory() {
  if (!history || typeof history.redo !== 'function') return;
  const snapshot = history.redo();
  if (!snapshot) return;
  restoreHistorySnapshot(snapshot);
}

function parseStyleMap(node) {
  const styleText = node.getAttribute('style');
  if (!styleText) return {};

  const style = {};
  styleText.split(';').forEach((pair) => {
    const [key, value] = pair.split(':');
    if (!key || !value) return;
    style[key.trim()] = value.trim();
  });

  return style;
}

const svgStyleCache = new WeakMap();

function parseStyleTextBlock(text) {
  const style = {};
  if (!text) return style;

  text.split(';').forEach((pair) => {
    const [key, value] = pair.split(':');
    if (!key || !value) return;
    style[key.trim()] = value.trim();
  });

  return style;
}

function isSimpleSvgSelector(selector) {
  return /^([.#]?[\w-]+|[a-zA-Z][\w-]*)$/.test(selector);
}

function matchesStyleSelector(selector, node) {
  if (!selector || !node || node.nodeType !== 1) return false;

  if (selector.startsWith('.')) {
    const className = selector.slice(1);
    const classes = (node.getAttribute('class') || '').split(/\s+/);
    return classes.includes(className);
  }

  if (selector.startsWith('#')) {
    return node.getAttribute('id') === selector.slice(1);
  }

  return node.tagName.toLowerCase() === selector.toLowerCase();
}

function parseSimpleSVGStyleRules(svgRoot) {
const rules = [];
  const styleElements = svgRoot.querySelectorAll('style');

  styleElements.forEach((styleEl) => {
    const text = styleEl.textContent || '';
    const cleaned = text.replace(/\/\*[\s\S]*?\*\//g, '');
    const rulePattern = /([^{}]+)\{([^}]*)\}/g;
    let match;

    while ((match = rulePattern.exec(cleaned)) !== null) {
      const selectorText = match[1].trim();
      const declarations = parseStyleTextBlock(match[2]);
      const selectors = selectorText.split(',').map((item) => item.trim()).filter(isSimpleSvgSelector);

      for (const selector of selectors) {
        rules.push({ selector, declarations });
      }
    }
  });

  return rules;
}

function normalizePaintColor(value) {
  if (typeof value !== 'string') return null;
  const color = value.trim();
  if (!color) return null;

  const lower = color.toLowerCase();
  if (['none', 'transparent', 'inherit', 'initial', 'currentcolor'].includes(lower)) return null;

  return color;
}

function parseLengthOrCanvas(value, canvasSize, fallback = null) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : fallback;
  if (typeof value !== 'string') return fallback;

  const normalized = value.trim();
  if (!normalized) return fallback;

  if (canvasSize && normalized.endsWith('%')) {
    const ratio = Number.parseFloat(normalized);
    return Number.isFinite(ratio) ? (canvasSize * ratio) / 100 : fallback;
  }

  const num = Number.parseFloat(normalized);
  return Number.isFinite(num) ? num : fallback;
}

function detectCanvasBackground(svgRoot, source) {
  if (!svgRoot || !source) return { color: null, node: null };

  const rootStyle = parseStyleMap(svgRoot);
  const rootBg =
    normalizePaintColor(rootStyle.background)
    || normalizePaintColor(rootStyle['background-color'])
    || normalizePaintColor(svgRoot.getAttribute('background'));

  if (rootBg) return { color: rootBg, node: null };

  const rootFill = normalizePaintColor(svgRoot.getAttribute('fill'));
  if (rootFill) return { color: rootFill, node: null };

  const rects = Array.from(svgRoot.querySelectorAll('rect')).filter((rect) => !isInNonRenderableContainer(rect));
  const canvasWidth = Math.max(1, source.width);
  const canvasHeight = Math.max(1, source.height);

  for (const rect of rects) {
    const fill = normalizePaintColor(getNodeStyleValue(rect, 'fill', null, svgRoot));
    if (!fill) continue;

    const stroke = normalizePaintColor(getNodeStyleValue(rect, 'stroke', 'none', svgRoot));
    const strokeWidth = parseNumber(getNodeStyleValue(rect, 'stroke-width', 0, svgRoot), 0);
    if (stroke && stroke.toLowerCase() !== 'none' && strokeWidth > 0) continue;

    const offset = parseCumulativeTranslate(rect, svgRoot);
    if (!offset) continue;

    const width = parseLengthOrCanvas(rect.getAttribute('width'), canvasWidth, 0);
    const height = parseLengthOrCanvas(rect.getAttribute('height'), canvasHeight, 0);
    const x = parseNumber(rect.getAttribute('x'), 0) + offset.x;
    const y = parseNumber(rect.getAttribute('y'), 0) + offset.y;

    if (width <= 0 || height <= 0) continue;

    const isCanvasWidth = width >= canvasWidth * 0.95;
    const isCanvasHeight = height >= canvasHeight * 0.95;
    const startsAtCanvasLeft = x <= source.minX + canvasWidth * 0.05;
    const startsAtCanvasTop = y <= source.minY + canvasHeight * 0.05;

    if (isCanvasWidth && isCanvasHeight && startsAtCanvasLeft && startsAtCanvasTop) {
      return { color: fill, node: rect };
    }
  }

  return { color: null, node: null };
}

function getSVGStyleRules(svgRoot) {
  if (!svgRoot) return [];
  if (svgStyleCache.has(svgRoot)) return svgStyleCache.get(svgRoot);

  const rules = parseSimpleSVGStyleRules(svgRoot);
  svgStyleCache.set(svgRoot, rules);
  return rules;
}

function getStyleFromRules(node, key, rules) {
  for (let i = rules.length - 1; i >= 0; i -= 1) {
    const rule = rules[i];
    if (!rule || !rule.declarations) continue;
    if (!matchesStyleSelector(rule.selector, node)) continue;
    if (Object.prototype.hasOwnProperty.call(rule.declarations, key)) {
      return rule.declarations[key];
    }
  }
  return null;
}

function getNodeStyleValue(node, key, fallback = null, root = null) {
  let current = node;
  const rules = root ? getSVGStyleRules(root) : [];

  while (current && current.nodeType === 1) {
    const direct = current.getAttribute(key);
    if (direct !== null) return direct;

    const style = parseStyleMap(current);
    if (Object.prototype.hasOwnProperty.call(style, key)) return style[key];

    if (rules.length) {
      const declared = getStyleFromRules(current, key, rules);
      if (declared !== null) return declared;
    }

    if (root && current === root) break;
    current = current.parentElement;
  }
  return fallback;
}

const SVG_FRAGMENT_STYLE_KEYS = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'fill-opacity',
  'font-size',
  'font-family',
  'font-weight',
  'font-style',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-dashoffset',
  'letter-spacing',
  'word-spacing',
  'text-anchor',
  'dominant-baseline',
  'alignment-baseline',
  'marker-start',
  'marker-mid',
  'marker-end',
];

const NON_RENDERABLE_CONTAINER_TAGS = new Set([
  'defs',
  'clippath',
  'mask',
  'filter',
  'pattern',
  'marker',
  'lineargradient',
  'radialgradient',
  'symbol',
  'metadata',
]);


function applyComputedStylesToElementTree(node, svgRoot, keys = SVG_FRAGMENT_STYLE_KEYS) {
  if (!node || node.nodeType !== 1) return;

  keys.forEach((key) => {
    if (node.hasAttribute(key)) return;
    const value = getNodeStyleValue(node, key, null, svgRoot);
    if (typeof value === 'string' && value.trim() !== '') {
      node.setAttribute(key, value.trim());
    }
  });

  for (const child of Array.from(node.children)) {
    applyComputedStylesToElementTree(child, svgRoot, keys);
  }
}

function createSVGFragmentFromNode(node, svgRoot) {
  const serializer = new XMLSerializer();
  const cloned = node.cloneNode(true);
  applyComputedStylesToElementTree(cloned, svgRoot);

  const referencedDefinitions = collectReferencedDefinitions(svgRoot, cloned);
  const defsSource = referencedDefinitions.length
    ? `<defs>${referencedDefinitions.map((item) => serializer.serializeToString(item)).join('')}</defs>`
    : '';
  return `${defsSource}${serializer.serializeToString(cloned)}`;
}

function collectReferencedDefinitions(svgRoot, rootNode) {
  if (!svgRoot || !rootNode) return [];

  const visitedIds = new Set();
  const queue = [];
  const defs = [];

  collectReferenceIds(rootNode, queue);

  while (queue.length) {
    const id = queue.shift();
    if (!id || visitedIds.has(id)) continue;
    visitedIds.add(id);

    const element = svgRoot.getElementById(id);
    if (!element || element.nodeType !== 1) continue;

    const clone = element.cloneNode(true);
    defs.push(clone);
    collectReferenceIds(clone, queue);
  }

  return defs;
}

function collectReferenceIds(node, queue) {
  if (!node || node.nodeType !== 1) return;

  const stack = [node];
  while (stack.length) {
    const current = stack.pop();
    for (const attr of Array.from(current.attributes || [])) {
      const value = attr.value;
      if (!value) continue;
      const matches = value.matchAll(/url\(\s*#([^)]+)\)/gi);
      for (const match of matches) {
        const id = cleanIdReference(match[1]);
        if (id) queue.push(id);
      }
    }

    for (const child of Array.from(current.children || [])) {
      stack.push(child);
    }
  }
}

function cleanIdReference(value) {
  return String(value || '')
    .replace(/^['"]|['"]$/g, '')
    .trim()
    .replace(/^#/, '')
    .trim();
}

function isInNonRenderableContainer(node) {
  let current = node;
  while (current && current.nodeType === 1) {
    const tag = current.tagName.toLowerCase();
    if (NON_RENDERABLE_CONTAINER_TAGS.has(tag)) return true;
    current = current.parentElement;
  }
  return false;
}

function hasElementChildren(node) {
  return !!(node && node.children && node.children.length > 0);
}

function parseNumber(value, fallback = 0) {
  const num = Number.parseFloat(value);
  return Number.isFinite(num) ? num : fallback;
}

function parseLengthOrDefault(value, fallback = null) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : fallback;
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim();
  if (!normalized || normalized.endsWith('%')) return fallback;

  const num = Number.parseFloat(normalized);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function getNodeAttributeOrStyleNumber(node, key, fallback = 0) {
  const inline = node.getAttribute(key);
  const fromStyle = parseStyleMap(node)[key];
  return parseLengthOrDefault(inline || fromStyle, fallback);
}

function parseSVGSourceSize(svgRoot) {
  const viewBox = svgRoot.getAttribute('viewBox');
  let viewBoxText = '';
  let minX = 0;
  let minY = 0;

  if (viewBox) {
    viewBoxText = viewBox;
    const values = viewBox
      .split(/[\s,]+/)
      .map((item) => Number.parseFloat(item))
      .filter((item) => Number.isFinite(item));
    if (values.length >= 4 && values[2] > 0 && values[3] > 0) {
      minX = values[0];
      minY = values[1];
      return {
        minX,
        minY,
        width: values[2],
        height: values[3],
        viewBox: viewBoxText,
        preserveAspectRatio: svgRoot.getAttribute('preserveAspectRatio') || 'xMidYMid meet',
      };
    }
  }

  const width = parseLengthOrDefault(getNodeAttributeOrStyleNumber(svgRoot, 'width'), 960) || parseLengthOrDefault(svgRoot.getAttribute('width'), 960) || 960;
  const height = parseLengthOrDefault(getNodeAttributeOrStyleNumber(svgRoot, 'height'), 720) || parseLengthOrDefault(svgRoot.getAttribute('height'), 720) || 720;

  return {
    minX,
    minY,
    width,
    height,
    viewBox: `${0} ${0} ${width} ${height}`,
    preserveAspectRatio: svgRoot.getAttribute('preserveAspectRatio') || 'xMidYMid meet',
  };
}

function calculateImportFitTransform(source, slide) {
  const sourceWidth = Math.max(1, source.width);
  const sourceHeight = Math.max(1, source.height);
  const widthPadding = Math.max(0, 1 - SVG_IMPORT_PADDING_RATIO * 2);
  const heightPadding = Math.max(0, 1 - SVG_IMPORT_PADDING_RATIO * 2);
  const availableWidth = Math.max(1, slide.width * widthPadding);
  const availableHeight = Math.max(1, slide.height * heightPadding);
  const scale = Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight);

  return {
    scale,
    offsetX: (slide.width - sourceWidth * scale) / 2 - source.minX * scale,
    offsetY: (slide.height - sourceHeight * scale) / 2 - source.minY * scale,
  };
}

function parseTranslateTransform(node) {
  const transform = node.getAttribute('transform');
  if (!transform) return { x: 0, y: 0 };

  const operations = transform.match(/[a-zA-Z]+\([^)]+\)/g);
  if (!operations || operations.length === 0) return { x: 0, y: 0 };

  let x = 0;
  let y = 0;

  for (const op of operations) {
    const matched = op.match(/^([a-zA-Z]+)\(([^)]*)\)$/);
    if (!matched) continue;

    const opName = matched[1].toLowerCase();
    const values = matched[2]
      .split(/[,\s]+/)
      .map((item) => Number.parseFloat(item))
      .filter((item) => Number.isFinite(item));

    if (opName === 'translate') {
      if (values.length === 0) continue;
      x += values[0];
      y += values.length > 1 ? values[1] : 0;
    }

    if (opName === 'matrix') {
      if (values.length !== 6) continue;
      x += values[4];
      y += values[5];
    }
  }

  return {
    x,
    y,
  };
}

function parseCumulativeTranslate(node, svgRoot, includeSelf = true) {
  let current = includeSelf ? node : node?.parentElement || null;
  let x = 0;
  let y = 0;

  while (current) {
    const transformOffset = parseTranslateTransform(current);
    if (!transformOffset) return null;
    x += transformOffset.x;
    y += transformOffset.y;
    if (current === svgRoot) break;
    current = current.parentElement;
  }

  return { x, y };
}

function getNodeBBox(node) {
  try {
    if (typeof node.getBBox !== 'function') return null;
    const box = node.getBBox();
    if (!box || Number.isNaN(box.x) || Number.isNaN(box.y) || Number.isNaN(box.width) || Number.isNaN(box.height)) {
      return null;
    }
    return box;
  } catch {
    return null;
  }
}

function getLineBounds(node) {
  const x1 = parseNumber(node.getAttribute('x1'), 0);
  const x2 = parseNumber(node.getAttribute('x2'), x1);
  const y1 = parseNumber(node.getAttribute('y1'), 0);
  const y2 = parseNumber(node.getAttribute('y2'), y1);

  const minX = Math.min(x1, x2);
  const minY = Math.min(y1, y2);
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);

  if (width === 0 && height === 0) return null;

  return {
    x: minX,
    y: minY,
    width,
    height,
  };
}

function getPointsBounds(node) {
  const points = (node.getAttribute('points') || '').trim();
  if (!points) return null;

  const nums = points
    .split(/[\s,]+/)
    .map((item) => Number.parseFloat(item))
    .filter((item) => Number.isFinite(item));

  if (nums.length < 4) return null;

  let minX = nums[0];
  let maxX = nums[0];
  let minY = nums[1];
  let maxY = nums[1];

  for (let i = 0; i < nums.length; i += 2) {
    const x = nums[i];
    const y = nums[i + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  const width = maxX - minX;
  const height = maxY - minY;

  if (width === 0 && height === 0) return null;

  return {
    x: minX,
    y: minY,
    width,
    height,
  };
}

function getRenderableBounds(node, tag) {
  if (tag === 'line') return getLineBounds(node);
  if (tag === 'path') {
    const pathBounds = getPathBoundsFromPathData(node.getAttribute('d'));
    if (pathBounds) return pathBounds;
    return getNodeBBox(node);
  }
  if (tag === 'polyline' || tag === 'polygon') return getPointsBounds(node);
  return getNodeBBox(node);
}

function getPathBoundsFromPathData(pathData) {
  if (!pathData || typeof pathData !== 'string') return null;

  const values = pathData
    .match(/-?\d*\.?\d+(?:[eE][-+]?\d+)?/g)
    ?.map((item) => Number.parseFloat(item))
    ?.filter((item) => Number.isFinite(item));

  if (!values || values.length < 2) return null;

  let minX = values[0];
  let maxX = values[0];
  let minY = values[1];
  let maxY = values[1];

  for (let i = 0; i < values.length - 1; i += 2) {
    const x = values[i];
    const y = values[i + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  const width = maxX - minX;
  const height = maxY - minY;

  if (width === 0 && height === 0) return null;

  return {
    x: minX,
    y: minY,
    width,
    height,
  };
}

function isWideText(text) {
  return /[^\x00-\x7F]/.test(text);
}

function measureTSpanWidth(text, span, spanFontSize) {
  try {
    if (span && typeof span.getComputedTextLength === 'function') {
      const length = span.getComputedTextLength();
      if (Number.isFinite(length) && length > 0) return length;
    }
  } catch {
    // no-op
  }

  try {
    const box = getNodeBBox(span);
    if (box && Number.isFinite(box.width) && box.width > 0) return box.width;
  } catch {
    // no-op
  }

  const ratio = isWideText(text) ? 1 : 0.62;
  return Math.max(24, text.length * spanFontSize * ratio);
}

function isReferencePaint(value) {
  return typeof value === 'string' && /url\(\s*#[^)]+\)/i.test(value);
}

function parseTSpanAsTextLines(node, svgRoot, transformOffset) {
  const allChildren = Array.from(node.children || []);
  if (!allChildren.length || !allChildren.every((item) => item.tagName && item.tagName.toLowerCase() === 'tspan')) {
    return null;
  }

  const baseX = parseNumber(getNodeStyleValue(node, 'x', 0, svgRoot), 0);
  const baseY = parseNumber(getNodeStyleValue(node, 'y', 0, svgRoot), 0);
  const baseFontSize = parseNumber(getNodeStyleValue(node, 'font-size', 18, svgRoot), 18);
  const baseFontFamily = getNodeStyleValue(node, 'font-family', 'Arial, sans-serif', svgRoot);
  const baseFill = getNodeStyleValue(node, 'fill', '#111827', svgRoot);
  const baseTextAnchor = getNodeStyleValue(node, 'text-anchor', 'start', svgRoot);
  const baseDominantBaseline = getNodeStyleValue(node, 'dominant-baseline', 'auto', svgRoot);
  const baseAlignmentBaseline = getNodeStyleValue(node, 'alignment-baseline', 'auto', svgRoot);
  const baseFontWeight = getNodeStyleValue(node, 'font-weight', 'normal', svgRoot);
  const baseFontStyle = getNodeStyleValue(node, 'font-style', 'normal', svgRoot);

  const elements = [];
  let cursorY = baseY;
  let cursorX = baseX;
  let lineIndex = 0;

  for (const span of allChildren) {
    const text = span.textContent || '';
    if (!text.trim()) continue;

    const spanYAttr = span.getAttribute('y');
    const spanXAttr = span.getAttribute('x');
    const spanDY = parseNumber(span.getAttribute('dy'), 0);
    const spanDX = parseNumber(span.getAttribute('dx'), 0);
    const spanFontSize = parseNumber(getNodeStyleValue(span, 'font-size', baseFontSize, svgRoot), baseFontSize);
    const fontFamily = getNodeStyleValue(span, 'font-family', baseFontFamily, svgRoot);
    const fill = getNodeStyleValue(span, 'fill', baseFill, svgRoot);
    const stroke = getNodeStyleValue(span, 'stroke', 'none', svgRoot);
    const strokeWidth = parseNumber(getNodeStyleValue(span, 'stroke-width', 0, svgRoot), 0);
    const fontWeight = getNodeStyleValue(span, 'font-weight', baseFontWeight, svgRoot);
    const fontStyle = getNodeStyleValue(span, 'font-style', baseFontStyle, svgRoot);

    const hasLineBreak = spanYAttr !== null || (lineIndex > 0 && spanDY !== 0);
    const hasAbsoluteX = spanXAttr !== null;

    if (hasLineBreak) {
      if (spanYAttr !== null) {
        cursorY = parseNumber(spanYAttr, cursorY);
      } else {
        cursorY += spanDY;
      }
      cursorX = baseX;
    } else if (lineIndex === 0 && spanYAttr === null && spanDY !== 0) {
      cursorY = baseY + spanDY;
    }

    let x = hasAbsoluteX ? parseNumber(spanXAttr, cursorX) : cursorX;
    if (spanDX !== 0) x += spanDX;

    const estimatedWidth = measureTSpanWidth(text, span, spanFontSize);
    const estimatedHeight = Math.max(16, spanFontSize + 14);

    elements.push({
      type: 'text',
      x,
      y: cursorY + transformOffset.y - spanFontSize,
      width: estimatedWidth,
      height: estimatedHeight,
      text,
      fontSize: spanFontSize,
      fontFamily,
      fontWeight,
      fontStyle,
      fill,
      textAnchor: getNodeStyleValue(span, 'text-anchor', baseTextAnchor, svgRoot),
          dominantBaseline: getNodeStyleValue(span, 'dominant-baseline', baseDominantBaseline, svgRoot),
      alignmentBaseline: getNodeStyleValue(span, 'alignment-baseline', baseAlignmentBaseline, svgRoot),
      stroke,
      strokeWidth,
    });

    cursorX = x + estimatedWidth;
    lineIndex += 1;
  }

  return elements.length ? elements : null;
}

function hasUnsupportedVisualEffect(node, svgRoot) {
  const style = parseStyleMap(node);
  const unsupportedAttrKeys = ['filter', 'clip-path', 'mask'];

  for (const key of unsupportedAttrKeys) {
    const attr = node.getAttribute(key);
    const styleValue = style[key];

    if (attr && attr !== 'none') return true;
    if (styleValue && styleValue !== 'none') return true;
  }

  const opacity = parseNumber(getNodeStyleValue(node, 'opacity', 1, svgRoot), 1);
  const fillOpacity = parseNumber(getNodeStyleValue(node, 'fill-opacity', 1, svgRoot), 1);
  const strokeOpacity = parseNumber(getNodeStyleValue(node, 'stroke-opacity', 1, svgRoot), 1);
  if (opacity < 1 || fillOpacity < 1 || strokeOpacity < 1) return true;

  const fill = getNodeStyleValue(node, 'fill', null, svgRoot);
  const stroke = getNodeStyleValue(node, 'stroke', null, svgRoot);
  if (isReferencePaint(fill) || isReferencePaint(stroke)) return true;

  return false;
}

function isSVGImportSupportedByParser(svgRoot) {
  const allowed = new Set(['rect', 'circle', 'ellipse', 'text', 'image', 'g']);
  const rootTransform = parseTranslateTransform(svgRoot);
  if (!rootTransform) return false;
  const nodes = Array.from(svgRoot.querySelectorAll('*')).filter((node) => !isInNonRenderableContainer(node));
  for (const node of nodes) {
    const tag = node.tagName.toLowerCase();
    if (!allowed.has(tag)) return false;
    if (!parseTranslateTransform(node)) return false;
    if (hasUnsupportedVisualEffect(node, svgRoot)) return false;
  }

  return true;
}

function parseSVGElements(svgRoot) {
  const source = parseSVGSourceSize(svgRoot);
  const parsed = [];
  const backgroundInfo = detectCanvasBackground(svgRoot, source);
  const nodes = Array.from(svgRoot.querySelectorAll('rect,circle,ellipse,path,line,polygon,polyline,text,image'))
    .filter((node) => !isInNonRenderableContainer(node));

  for (const node of nodes) {
    const tag = node.tagName.toLowerCase();
    const transformOffset = parseCumulativeTranslate(node, svgRoot);
    const fragmentTransformOffset = parseCumulativeTranslate(node, svgRoot, false);
    if (!transformOffset) continue;

    if (tag === 'rect') {
      if (node === backgroundInfo.node) continue;

      parsed.push({
        type: 'rect',
        x: parseNumber(node.getAttribute('x'), 0) + transformOffset.x,
        y: parseNumber(node.getAttribute('y'), 0) + transformOffset.y,
        width: Math.max(10, parseNumber(node.getAttribute('width'), 100)),
        height: Math.max(10, parseNumber(node.getAttribute('height'), 100)),
        rx: parseNumber(node.getAttribute('rx'), 0),
        ry: parseNumber(node.getAttribute('ry'), 0),
        fill: getNodeStyleValue(node, 'fill', '#4ea5ff', svgRoot),
        stroke: getNodeStyleValue(node, 'stroke', 'none', svgRoot),
        strokeWidth: parseNumber(getNodeStyleValue(node, 'stroke-width', 0, svgRoot), 0),
      });
    }

    if (tag === 'circle') {
      const cx = parseNumber(node.getAttribute('cx'), 50);
      const cy = parseNumber(node.getAttribute('cy'), 50);
      const r = parseNumber(node.getAttribute('r'), 30);
      parsed.push({
        type: 'circle',
        x: cx - r + transformOffset.x,
        y: cy - r + transformOffset.y,
        width: Math.max(12, r * 2),
        height: Math.max(12, r * 2),
        fill: getNodeStyleValue(node, 'fill', '#64d2ff', svgRoot),
        stroke: getNodeStyleValue(node, 'stroke', 'none', svgRoot),
        strokeWidth: parseNumber(getNodeStyleValue(node, 'stroke-width', 0, svgRoot), 0),
      });
    }

    if (tag === 'ellipse') {
      const cx = parseNumber(node.getAttribute('cx'), 50);
      const cy = parseNumber(node.getAttribute('cy'), 50);
      const rx = parseNumber(node.getAttribute('rx'), 40);
      const ry = parseNumber(node.getAttribute('ry'), 30);
      parsed.push({
        type: 'ellipse',
        x: cx - rx + transformOffset.x,
        y: cy - ry + transformOffset.y,
        width: Math.max(12, rx * 2),
        height: Math.max(12, ry * 2),
        fill: getNodeStyleValue(node, 'fill', '#64d2ff', svgRoot),
        stroke: getNodeStyleValue(node, 'stroke', 'none', svgRoot),
        strokeWidth: parseNumber(getNodeStyleValue(node, 'stroke-width', 0, svgRoot), 0),
      });
    }

    if (tag === 'path' || tag === 'line' || tag === 'polygon' || tag === 'polyline') {
      const box = getRenderableBounds(node, tag);
      if (!box || (box.width === 0 && box.height === 0)) continue;
      const nodeText = createSVGFragmentFromNode(node, svgRoot);
      const widthPadding = tag === 'line' ? 1 : 12;
      const heightPadding = tag === 'line' ? 1 : 12;
      const sourceWidth = Math.max(1, box.width);
      const sourceHeight = Math.max(1, box.height);

      parsed.push({
        type: 'svg-fragment',
        isLine: tag === 'line',
        x: box.x + fragmentTransformOffset.x,
        y: box.y + fragmentTransformOffset.y,
        width: Math.max(widthPadding, box.width),
        height: Math.max(heightPadding, box.height),
        sourceWidth,
        sourceHeight,
        sourceMinX: box.x,
        sourceMinY: box.y,
        sourceViewBox: `${box.x} ${box.y} ${sourceWidth} ${sourceHeight}`,
        sourcePreserveAspectRatio: 'xMidYMid meet',
        sourceText: `<svg xmlns="http://www.w3.org/2000/svg">${nodeText}</svg>`,
        fill: getNodeStyleValue(node, 'fill', '#4ea5ff', svgRoot),
        stroke: getNodeStyleValue(node, 'stroke', 'none', svgRoot),
        strokeWidth: parseNumber(getNodeStyleValue(node, 'stroke-width', 0, svgRoot), 0),
      });
    }

    if (tag === 'text') {
      if (hasElementChildren(node) && node.children.length > 0) {
        const textLines = parseTSpanAsTextLines(node, svgRoot, transformOffset);
        if (textLines) {
          parsed.push(...textLines);
          continue;
        }

        const box = getNodeBBox(node);
        const baseX = box ? box.x : parseNumber(node.getAttribute('x'), 0);
        const fontSize = parseNumber(getNodeStyleValue(node, 'font-size', 18, svgRoot), 18);
        const estimatedText = (node.textContent || '').trim() || 'text';
        const baseY = (box ? box.y : parseNumber(node.getAttribute('y'), 0) - fontSize);
        const width = Math.max(12, box ? box.width : Math.max(40, estimatedText.length * fontSize * 0.65));
        const height = Math.max(12, box ? box.height : fontSize + 16);
        const nodeText = createSVGFragmentFromNode(node, svgRoot);
        const sourceWidth = Math.max(1, box ? box.width : width);
        const sourceHeight = Math.max(1, box ? box.height : height);
        const sourceMinX = box ? box.x : baseX;
        const sourceMinY = box ? box.y : baseY;

        parsed.push({
          type: 'svg-fragment',
          x: sourceMinX + fragmentTransformOffset.x,
          y: sourceMinY + fragmentTransformOffset.y,
          width,
          height,
          sourceWidth,
          sourceHeight,
          sourceMinX,
          sourceMinY,
          sourceViewBox: `${sourceMinX} ${sourceMinY} ${sourceWidth} ${sourceHeight}`,
          sourcePreserveAspectRatio: 'xMidYMid meet',
          sourceText: `<svg xmlns="http://www.w3.org/2000/svg">${nodeText}</svg>`,
          fill: getNodeStyleValue(node, 'fill', '#111827', svgRoot),
          textAnchor: getNodeStyleValue(node, 'text-anchor', 'start', svgRoot),
          dominantBaseline: getNodeStyleValue(node, 'dominant-baseline', 'auto', svgRoot),
          alignmentBaseline: getNodeStyleValue(node, 'alignment-baseline', 'auto', svgRoot),
          fontWeight: getNodeStyleValue(node, 'font-weight', 'normal', svgRoot),
          fontStyle: getNodeStyleValue(node, 'font-style', 'normal', svgRoot),
          stroke: getNodeStyleValue(node, 'stroke', 'none', svgRoot),
          strokeWidth: parseNumber(getNodeStyleValue(node, 'stroke-width', 0, svgRoot), 0),
        });
        continue;
      }

      const text = (node.textContent || '').trim() || 'text';
      const fontSize = parseNumber(getNodeStyleValue(node, 'font-size', 32, svgRoot), 32);
      const x = parseNumber(getNodeStyleValue(node, 'x', 0, svgRoot), 0) + transformOffset.x;
      const y = parseNumber(getNodeStyleValue(node, 'y', 0, svgRoot), 0) + transformOffset.y;
      parsed.push({
        type: 'text',
        x,
        y: y - fontSize,
        width: Math.max(40, text.length * fontSize * 0.65),
        height: fontSize + 16,
        text,
        fontSize,
        fontFamily: getNodeStyleValue(node, 'font-family', 'Arial, sans-serif', svgRoot),
        textAnchor: getNodeStyleValue(node, 'text-anchor', 'start', svgRoot),
        dominantBaseline: getNodeStyleValue(node, 'dominant-baseline', 'auto', svgRoot),
        alignmentBaseline: getNodeStyleValue(node, 'alignment-baseline', 'auto', svgRoot),
        fontWeight: getNodeStyleValue(node, 'font-weight', 'normal', svgRoot),
        fontStyle: getNodeStyleValue(node, 'font-style', 'normal', svgRoot),
        fill: getNodeStyleValue(node, 'fill', '#111827', svgRoot),
        stroke: getNodeStyleValue(node, 'stroke', 'none', svgRoot),
        strokeWidth: parseNumber(getNodeStyleValue(node, 'stroke-width', 0, svgRoot), 0),
      });
    }

    if (tag === 'image') {
      const href = node.getAttribute('href') || node.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
      if (!href) continue;
      parsed.push({
        type: 'image',
        x: parseNumber(node.getAttribute('x'), 0) + transformOffset.x,
        y: parseNumber(node.getAttribute('y'), 0) + transformOffset.y,
        width: Math.max(10, parseNumber(node.getAttribute('width'), 120)),
        height: Math.max(10, parseNumber(node.getAttribute('height'), 80)),
        url: href,
      });
    }
  }

  return {
    source,
    backgroundColor: backgroundInfo.color,
    elements: parsed,
  };
}

function scaleAndPositionImportedElements(elements, source) {
  const slide = currentSlide();
  if (!elements.length) return [];

  const { scale, offsetX, offsetY } = calculateImportFitTransform(source, slide);

  return elements.map((item) => {
    const minSize = item.type === 'svg-fragment' && item.isLine ? 1 : 8;

    return {
    ...item,
    x: item.x * scale + offsetX,
    y: item.y * scale + offsetY,
    width: Math.max(minSize, item.width * scale),
    height: Math.max(minSize, item.height * scale),
    rx: Number.isFinite(item.rx) ? Math.max(0, item.rx * scale) : item.rx,
    ry: Number.isFinite(item.ry) ? Math.max(0, item.ry * scale) : item.ry,
    strokeWidth: Number.isFinite(item.strokeWidth) ? Math.max(0, item.strokeWidth * scale) : item.strokeWidth,
    fontSize: item.fontSize ? Math.max(10, Math.round(item.fontSize * scale)) : undefined,
    };
  });
}

function addSVGFragmentElement(slide, source, text) {
  const { scale, offsetX, offsetY } = calculateImportFitTransform(source, slide);

  slide.elements.push({
    id: createId(),
    type: 'svg-fragment',
    x: offsetX,
    y: offsetY,
    width: Math.max(12, source.width * scale),
    height: Math.max(12, source.height * scale),
    sourceWidth: source.width,
    sourceHeight: source.height,
    sourceMinX: source.minX,
    sourceMinY: source.minY,
    sourceViewBox: source.viewBox,
    sourcePreserveAspectRatio: source.preserveAspectRatio,
    sourceText: text,
  });
}

function shouldUseSvgFragmentImport(svgRoot, parsedElements) {
  return !parsedElements.length;
}

function getPointerPosition(event) {
  const rect = dom.canvas.getBoundingClientRect();
  const slide = currentSlide();
  return {
    x: ((event.clientX - rect.left) * slide.width) / rect.width,
    y: ((event.clientY - rect.top) * slide.height) / rect.height,
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getTextMeasureContext() {
  if (!textMeasureContext) {
    const canvas = document.createElement('canvas');
    textMeasureContext = canvas.getContext('2d');
  }
  return textMeasureContext;
}

function buildTextFontDescription(element) {
  return [
    element?.fontStyle || 'normal',
    element?.fontWeight || 'normal',
    `${element?.fontSize || 32}px`,
    element?.fontFamily || 'Arial, sans-serif',
  ].join(' ');
}

function getTextOffsetForLine(line, targetX, ctx) {
  const width = targetX <= 0 ? 0 : targetX;
  if (!line) return 0;
  if (width === 0) return 0;

  let left = 0;
  let right = line.length;
  while (left < right) {
    const mid = (left + right) >> 1;
    const measured = ctx.measureText(line.slice(0, mid)).width;
    if (measured < width) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }
  if (left > 0 && ctx.measureText(line.slice(0, left)).width > width) {
    const before = ctx.measureText(line.slice(0, left - 1)).width;
    return (width - before) < (ctx.measureText(line.slice(0, left)).width - width) ? left - 1 : left;
  }
  if (left > 0 && left < line.length) {
    const at = ctx.measureText(line.slice(0, left)).width;
    const prev = ctx.measureText(line.slice(0, left - 1)).width;
    return (width - prev) <= (at - width) ? left : left - 1;
  }
  return left;
}

function getTextCaretOffsetFromPoint(element, point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return (element.text || '').length;
  }

  const fontSize = Number(element.fontSize || 32);
  const lineHeight = Math.max(16, Math.round(fontSize * 1.2));
  const lines = (element.text || '').split('\n');
  const textAnchor = element.textAnchor || 'start';
  const width = Math.max(1, element.width || estimateTextBoxMetrics(element.text, fontSize).width);

  let x = point.x - element.x;
  const y = point.y - (element.y + fontSize * 0.25);
  const rawLine = Math.floor(y / lineHeight);
  const lineIndex = clamp(rawLine, 0, lines.length - 1);

  if (textAnchor === 'middle') {
    x -= width / 2;
  } else if (textAnchor === 'end') {
    x -= width;
  }

  const lineText = lines[lineIndex] || '';
  const ctx = getTextMeasureContext();
  if (!ctx) return element.text.length;
  ctx.font = buildTextFontDescription(element);

  const clampedX = Math.max(0, x);
  const localOffset = getTextOffsetForLine(lineText, clampedX, ctx);

  let offset = 0;
  for (let i = 0; i < lineIndex; i += 1) {
    const line = lines[i] || '';
    offset += line.length + 1;
  }
  return clamp(offset + localOffset, 0, element.text.length);
}

function render() {
  closeActiveTextEditor({ commit: true, rerender: false });
  renderSlideList();
  renderCanvas();
  renderProperties();
  dom.slideTitle.textContent = `${currentSlide().title} (${state.currentSlideIndex + 1}/${state.slides.length})`;
  updateHistoryControls();
  saveLocal();
}

function renderSlideList() {
  dom.slideList.innerHTML = '';

  state.slides.forEach((slide, index) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    li.className = index === state.currentSlideIndex ? 'active' : '';
    btn.textContent = `${index + 1}. ${slide.title}`;
    btn.addEventListener('click', () => {
      state.currentSlideIndex = index;
      state.selectedElementId = null;
      render();
    });
    li.appendChild(btn);
    dom.slideList.appendChild(li);
  });
}

function renderCanvas() {
  const slide = currentSlide();
  dom.canvas.setAttribute('viewBox', `0 0 ${slide.width} ${slide.height}`);

  while (dom.canvas.firstChild) {
    dom.canvas.removeChild(dom.canvas.firstChild);
  }

  const bg = document.createElementNS(SVG_NS, 'rect');
  bg.setAttribute('width', slide.width);
  bg.setAttribute('height', slide.height);
  bg.setAttribute('fill', slide.background);
  bg.addEventListener('pointerdown', () => {
    state.selectedElementId = null;
    render();
  });
  dom.canvas.appendChild(bg);

  slide.elements.forEach((el) => {
    renderElement(el);
  });

  if (state.selectedElementId) {
    const target = slide.elements.find((el) => el.id === state.selectedElementId);
    if (target) {
      renderSelection(target);
    }
  }

  renderSnapGuides(slide);
}

function renderSnapGuides(slide) {
  if (!activeSnapGuide) return;
  if (!state.pointerState || !['move', 'resize'].includes(state.pointerState.mode)) return;

  if (activeSnapGuide.hasSnapX) {
    const guide = document.createElementNS(SVG_NS, 'line');
    guide.setAttribute('x1', activeSnapGuide.guideX);
    guide.setAttribute('y1', 0);
    guide.setAttribute('x2', activeSnapGuide.guideX);
    guide.setAttribute('y2', slide.height);
    guide.classList.add('snap-guide-line');
    dom.canvas.appendChild(guide);
  }

  if (activeSnapGuide.hasSnapY) {
    const guide = document.createElementNS(SVG_NS, 'line');
    guide.setAttribute('x1', 0);
    guide.setAttribute('y1', activeSnapGuide.guideY);
    guide.setAttribute('x2', slide.width);
    guide.setAttribute('y2', activeSnapGuide.guideY);
    guide.classList.add('snap-guide-line');
    dom.canvas.appendChild(guide);
  }
}

function renderElement(el) {
  const g = document.createElementNS(SVG_NS, 'g');
  g.dataset.elementId = el.id;
  g.classList.add('canvas-element');

  if (el.type === 'text') {
    const text = document.createElementNS(SVG_NS, 'text');
    text.textContent = el.text || '';
    text.setAttribute('x', el.x);
    text.setAttribute('y', el.y + el.fontSize);
    text.setAttribute('fill', el.fill || '#111827');
    text.setAttribute('font-size', String(el.fontSize || 32));
    text.setAttribute('font-family', el.fontFamily || 'Arial, sans-serif');
    text.setAttribute('font-weight', el.fontWeight || 'normal');
    text.setAttribute('font-style', el.fontStyle || 'normal');
    text.setAttribute('text-anchor', el.textAnchor || 'start');
    text.setAttribute('dominant-baseline', el.dominantBaseline || 'hanging');
    text.setAttribute('alignment-baseline', el.alignmentBaseline || 'auto');
    text.setAttribute('stroke', el.stroke || 'none');
    text.setAttribute('stroke-width', Number.isFinite(el.strokeWidth) ? el.strokeWidth : 0);
    g.appendChild(text);
  }

  if (el.type === 'rect') {
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', el.x);
    rect.setAttribute('y', el.y);
    rect.setAttribute('width', el.width);
    rect.setAttribute('height', el.height);
    if (Number.isFinite(el.rx) && el.rx > 0) rect.setAttribute('rx', el.rx);
    if (Number.isFinite(el.ry) && el.ry > 0) rect.setAttribute('ry', el.ry);
    rect.setAttribute('fill', el.fill || '#4ea5ff');
    rect.setAttribute('stroke', el.stroke || '#003f7a');
    rect.setAttribute('stroke-width', Number.isFinite(el.strokeWidth) ? el.strokeWidth : 2);
    g.appendChild(rect);
  }

  if (el.type === 'circle') {
    const cX = el.x + el.width / 2;
    const cY = el.y + el.height / 2;
    const r = Math.min(el.width, el.height) / 2;
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', cX);
    circle.setAttribute('cy', cY);
    circle.setAttribute('r', r);
    circle.setAttribute('fill', el.fill || '#64d2ff');
    circle.setAttribute('stroke', el.stroke || '#0f3f66');
    circle.setAttribute('stroke-width', Number.isFinite(el.strokeWidth) ? el.strokeWidth : 2);
    g.appendChild(circle);
  }

  if (el.type === 'ellipse') {
    const ellipse = document.createElementNS(SVG_NS, 'ellipse');
    ellipse.setAttribute('cx', el.x + el.width / 2);
    ellipse.setAttribute('cy', el.y + el.height / 2);
    ellipse.setAttribute('rx', el.width / 2);
    ellipse.setAttribute('ry', el.height / 2);
    ellipse.setAttribute('fill', el.fill || '#64d2ff');
    ellipse.setAttribute('stroke', el.stroke || '#0f3f66');
    ellipse.setAttribute('stroke-width', Number.isFinite(el.strokeWidth) ? el.strokeWidth : 2);
    g.appendChild(ellipse);
  }

  if (el.type === 'image') {
    const image = document.createElementNS(SVG_NS, 'image');
    image.setAttributeNS('http://www.w3.org/1999/xlink', 'href', el.url);
    image.setAttribute('x', el.x);
    image.setAttribute('y', el.y);
    image.setAttribute('width', el.width);
    image.setAttribute('height', el.height);
    image.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    g.appendChild(image);
  }

  if (el.type === 'svg-fragment') {
    const sourceWidth = Math.max(1, Number.parseFloat(el.sourceWidth) || 1);
    const sourceHeight = Math.max(1, Number.parseFloat(el.sourceHeight) || 1);
    const inlineSvg = document.createElementNS(SVG_NS, 'svg');
    inlineSvg.setAttribute('x', el.x);
    inlineSvg.setAttribute('y', el.y);
    inlineSvg.setAttribute('width', el.width);
    inlineSvg.setAttribute('height', el.height);
    inlineSvg.setAttribute('viewBox', el.sourceViewBox || `0 0 ${sourceWidth} ${sourceHeight}`);
    inlineSvg.setAttribute('preserveAspectRatio', el.sourcePreserveAspectRatio || 'xMidYMid meet');
    inlineSvg.setAttribute('overflow', 'visible');

    const parsed = new DOMParser().parseFromString(el.sourceText || '<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'image/svg+xml');
    const sourceNode = parsed.documentElement;

    if (sourceNode && sourceNode.tagName.toLowerCase() === 'svg') {
      Array.from(sourceNode.childNodes).forEach((node) => {
        if (node.nodeType === 1 || (node.nodeType === 3 && node.textContent.trim())) {
          inlineSvg.appendChild(document.importNode(node, true));
        }
      });
    }

    g.appendChild(inlineSvg);
  }

  g.addEventListener('pointerdown', (event) => onElementPointerDown(event, el.id));
  g.addEventListener('dblclick', (event) => {
    event.stopPropagation();
    onElementDoubleClick(el.id);
  });
  dom.canvas.appendChild(g);
}

function renderSelection(el) {
  const bounds = getElementBounds(el);
  const selectBox = document.createElementNS(SVG_NS, 'rect');
  selectBox.classList.add('selection-box');
  selectBox.setAttribute('x', bounds.x - 2);
  selectBox.setAttribute('y', bounds.y - 2);
  selectBox.setAttribute('width', bounds.width + 4);
  selectBox.setAttribute('height', bounds.height + 4);
  dom.canvas.appendChild(selectBox);

  const size = 8;
  const half = size / 2;
  const positions = [
    ['nw', bounds.x - half, bounds.y - half],
    ['n', bounds.x + bounds.width / 2 - half, bounds.y - half],
    ['ne', bounds.x + bounds.width - half, bounds.y - half],
    ['w', bounds.x - half, bounds.y + bounds.height / 2 - half],
    ['e', bounds.x + bounds.width - half, bounds.y + bounds.height / 2 - half],
    ['sw', bounds.x - half, bounds.y + bounds.height - half],
    ['s', bounds.x + bounds.width / 2 - half, bounds.y + bounds.height - half],
    ['se', bounds.x + bounds.width - half, bounds.y + bounds.height - half],
  ];

  for (const [key, x, y] of positions) {
    const handle = document.createElementNS(SVG_NS, 'rect');
    handle.classList.add('selection-handle');
    handle.dataset.elementId = el.id;
    handle.dataset.handle = key;
    handle.setAttribute('x', x);
    handle.setAttribute('y', y);
    handle.setAttribute('width', size);
    handle.setAttribute('height', size);
    if (key === 'nw' || key === 'se') {
      handle.style.cursor = 'nwse-resize';
    } else if (key === 'ne' || key === 'sw') {
      handle.style.cursor = 'nesw-resize';
    } else if (key === 'n' || key === 's') {
      handle.style.cursor = 'ns-resize';
    } else if (key === 'e' || key === 'w') {
      handle.style.cursor = 'ew-resize';
    } else {
      handle.style.cursor = 'nwse-resize';
    }
    handle.addEventListener('pointerdown', (event) => onHandlePointerDown(event, el.id, key));
    dom.canvas.appendChild(handle);
  }
}

function getElementBounds(el) {
  if (el.type === 'text') {
    const approximateWidth = Math.max(120, (el.text || '').length * ((el.fontSize || 32) * 0.6));
    return {
      x: el.x,
      y: el.y,
      width: el.width || approximateWidth,
      height: el.height || ((el.fontSize || 32) + 12),
    };
  }

  return {
    x: el.x,
    y: el.y,
    width: el.width,
    height: el.height,
  };
}

function estimateTextBoxMetrics(text, fontSize = 32) {
  const content = (text || '').replace(/\n/g, ' ');
  const length = Math.max(1, content.length);
  return {
    width: Math.max(40, Math.round(length * Math.max(6, fontSize * 0.62))),
    height: Math.max(16, Math.round(fontSize + 12)),
  };
}

function closeActiveTextEditor({ commit = true, rerender = true } = {}) {
  if (!activeTextEditor) return;

  const editor = activeTextEditor;
  activeTextEditor = null;
  let textCommitted = false;

  const slide = currentSlide();
  const target = slide.elements.find((item) => item.id === editor.elementId);
  if (editor.textElement) {
    editor.textElement.setAttribute('visibility', 'visible');
  }

  if (editor.foreignObject && editor.foreignObject.parentElement) {
    editor.foreignObject.parentElement.removeChild(editor.foreignObject);
  }

  if (commit && target && target.type === 'text' && editor.textarea) {
    const nextText = editor.textarea.value;
    textCommitted = target.text !== nextText;
    target.text = nextText;
  }

  if (textCommitted) {
    recordHistorySnapshot();
  }

  if (rerender) render();
}

function openTextEditorForElement(elementId, point = null) {
  const slide = currentSlide();
  const element = slide.elements.find((item) => item.id === elementId);
  if (!element || element.type !== 'text') return;

  if (activeTextEditor && activeTextEditor.elementId === elementId) {
    if (activeTextEditor.textarea) activeTextEditor.textarea.focus();
    return;
  }

  if (activeTextEditor) {
    closeActiveTextEditor({ commit: true, rerender: false });
  }

  const group = dom.canvas.querySelector(`[data-element-id="${elementId}"]`);
  if (!group) return;
  const textElement = group.querySelector('text');
  if (textElement) textElement.setAttribute('visibility', 'hidden');

  const width = Math.max(1, Number(element.width) || 1);
  const initialHeight = Math.max(1, Number(element.height) || 1);

  const foreignObject = document.createElementNS(SVG_NS, 'foreignObject');
  foreignObject.setAttribute('x', element.x);
  foreignObject.setAttribute('y', element.y);
  foreignObject.setAttribute('width', width);
  foreignObject.setAttribute('height', initialHeight);
  foreignObject.setAttribute('data-inline-text-editor', '1');

  const host = document.createElementNS(HTML_NS, 'div');
  host.style.width = '100%';
  host.style.height = '100%';

  const textarea = document.createElementNS(HTML_NS, 'textarea');
  textarea.value = element.text || '';
  textarea.rows = 1;
  textarea.setAttribute('aria-label', 'テキストを直接編集');
  textarea.className = 'inline-textarea';
  textarea.style.cssText = [
    'width:100%;',
    'height:100%;',
    'margin:0;',
    'padding:6px 8px;',
    'border:2px solid var(--accent-primary);',
    'border-radius:6px;',
    'box-sizing:border-box;',
    'background:rgba(255,255,255,0.98);',
    `color:${element.fill || '#111827'};`,
    `font-size:${element.fontSize || 32}px;`,
    `font-family:${element.fontFamily || 'Arial, sans-serif'};`,
    `font-weight:${element.fontWeight || 'normal'};`,
    `font-style:${element.fontStyle || 'normal'};`,
    'line-height:1.2;',
    'white-space:pre-wrap;',
    'resize:none;',
    'outline:none;',
    'overflow:auto;',
    'pointer-events:auto;',
  ].join('');

  textarea.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
  });

  textarea.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      closeActiveTextEditor({ commit: false, rerender: false });
      render();
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      closeActiveTextEditor({ commit: true, rerender: true });
    }
  });

  textarea.addEventListener('blur', () => {
    closeActiveTextEditor({ commit: true, rerender: true });
  });

  host.appendChild(textarea);
  foreignObject.appendChild(host);
  dom.canvas.appendChild(foreignObject);

  activeTextEditor = {
    elementId,
    element,
    foreignObject,
    textElement,
    textarea,
    initialHeight,
  };
  state.selectedElementId = elementId;
  renderProperties();

  textarea.focus();
  const caret = getTextCaretOffsetFromPoint(element, point);
  textarea.setSelectionRange(caret, caret);
}

function onElementPointerDown(event, elementId) {
  if (event.button === 2) return;
  event.preventDefault();
  clearSnapGuideState();

  if (activeTextEditor) {
    closeActiveTextEditor({ commit: true, rerender: false });
  }

  const slide = currentSlide();
  const element = slide.elements.find((item) => item.id === elementId);
  if (!element) return;

  state.selectedElementId = elementId;

  if (element.type === 'text') {
    const start = getPointerPosition(event);
    state.pointerState = {
      mode: 'edit-intent',
      elementId,
      pointerId: event.pointerId,
      start,
      x: element.x,
      y: element.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    render();
    return;
  }

  state.pointerState = {
    mode: 'move',
    elementId,
    pointerId: event.pointerId,
    start: getPointerPosition(event),
    x: element.x,
    y: element.y,
  };

  event.currentTarget.setPointerCapture(event.pointerId);
  render();
}

function onHandlePointerDown(event, elementId, handle) {
  event.preventDefault();
  event.stopPropagation();
  clearSnapGuideState();
  if (activeTextEditor) {
    closeActiveTextEditor({ commit: true, rerender: false });
  }

  const slide = currentSlide();
  const element = slide.elements.find((item) => item.id === elementId);
  if (!element) return;

  const bounds = getElementBounds(element);
  state.selectedElementId = elementId;
  state.pointerState = {
    mode: 'resize',
    elementId,
    pointerId: event.pointerId,
    handle,
    start: getPointerPosition(event),
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  };

  event.currentTarget.setPointerCapture(event.pointerId);
  render();
}

function onElementDoubleClick(elementId) {
  openTextEditorForElement(elementId);
}

function onPointerMove(event) {
  if (!state.pointerState) return;

  const slide = currentSlide();
  const element = slide.elements.find((item) => item.id === state.pointerState.elementId);
  if (!element) return;

  const p = getPointerPosition(event);
  if (state.pointerState.mode === 'edit-intent') {
    const movedX = Math.abs(p.x - state.pointerState.start.x);
    const movedY = Math.abs(p.y - state.pointerState.start.y);
    clearSnapGuideState();
    if (movedX > TEXT_EDIT_DRAG_THRESHOLD || movedY > TEXT_EDIT_DRAG_THRESHOLD) {
      state.pointerState = {
        mode: 'move',
        elementId: state.pointerState.elementId,
        pointerId: state.pointerState.pointerId,
        start: p,
        x: element.x,
        y: element.y,
      };
      render();
      return;
    }
    return;
  }

  const dx = p.x - state.pointerState.start.x;
  const dy = p.y - state.pointerState.start.y;

  if (state.pointerState.mode === 'move') {
    const snapped = applyMoveSnap(element, state.pointerState.x + dx, state.pointerState.y + dy);
    element.x = snapped.x;
    element.y = snapped.y;
    render();
    return;
  }

  if (state.pointerState.mode === 'resize') {
    clearSnapGuideState();
    const h = state.pointerState.handle;
    const b = {
      x: state.pointerState.x,
      y: state.pointerState.y,
      width: state.pointerState.width,
      height: state.pointerState.height,
    };

    const next = { ...b };

    if (h.includes('w')) next.x = Math.min(b.x + b.width - 20, p.x);
    if (h.includes('e')) next.width = Math.max(20, b.width + dx);
    if (h.includes('n')) next.y = Math.min(b.y + b.height - 20, p.y);
    if (h.includes('s')) next.height = Math.max(20, b.height + dy);

    const snapped = applyResizeSnap(next, h, b);
    next.x = snapped.x;
    next.y = snapped.y;
    next.width = snapped.width;
    next.height = snapped.height;

    if (element.type === 'text') {
      element.width = next.width;
      element.height = next.height;
    } else {
      element.x = next.x;
      element.y = next.y;
      element.width = next.width;
      element.height = next.height;
    }

    if (h.includes('w') || h.includes('e') || element.type === 'text') {
      if (element.type !== 'text') element.x = next.x;
    }
    if (h.includes('n') || h.includes('s')) {
      if (element.type !== 'text') element.y = next.y;
    }

    render();
  }
}

function onPointerUp(event) {
  if (!state.pointerState) return;
  clearSnapGuideState();
  const shouldRecord = ['move', 'resize'].includes(state.pointerState.mode);

  if (state.pointerState.mode === 'edit-intent') {
    const { elementId } = state.pointerState;
    state.pointerState = null;
    openTextEditorForElement(elementId, event ? getPointerPosition(event) : null);
    return;
  }

  state.pointerState = null;
  if (shouldRecord) {
    recordHistorySnapshot();
  }
  saveLocal();
}

function addElement(type) {
  const slide = currentSlide();
  const cx = 60;
  const cy = 60;
  const id = createId();

  if (type === 'text') {
    slide.elements.push({
      id,
      type,
      x: cx,
      y: cy,
      width: 260,
      height: 58,
      text: 'テキストを入力',
      fontSize: 32,
      fill: '#111827',
    });
  }

  if (type === 'rect') {
    slide.elements.push({
      id,
      type,
      x: cx,
      y: cy,
      width: 260,
      height: 160,
      fill: '#4ea5ff',
      stroke: '#0b2f5a',
    });
  }

  if (type === 'circle') {
    slide.elements.push({
      id,
      type,
      x: cx,
      y: cy,
      width: 160,
      height: 160,
      fill: '#64d2ff',
      stroke: '#0c4a79',
    });
  }

  if (type === 'image') {
    const url = prompt('画像のURLを入力してください', 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Logo_TV_2015.png');
    if (!url) return;
    slide.elements.push({
      id,
      type,
      x: cx,
      y: cy,
      width: 240,
      height: 170,
      url,
    });
  }

  state.selectedElementId = id;
  recordHistorySnapshot();
  render();
}

function newSlide() {
  state.slides.push(createEmptySlide(`スライド ${state.slides.length + 1}`));
  state.currentSlideIndex = state.slides.length - 1;
  state.selectedElementId = null;
  recordHistorySnapshot();
  render();
}

function duplicateSlide() {
  const slide = currentSlide();
  const copy = JSON.parse(JSON.stringify(slide));
  copy.id = createId();
  copy.title = `${slide.title} (コピー)`;
  copy.elements = copy.elements.map((el) => ({
    ...el,
    id: createId(),
  }));
  state.slides.splice(state.currentSlideIndex + 1, 0, copy);
  state.currentSlideIndex += 1;
  recordHistorySnapshot();
  render();
}

function removeCurrentSlide() {
  if (state.slides.length <= 1) return;
  const isCurrentSelected = state.currentSlideIndex;
  state.slides = state.slides.filter((_, index) => index !== state.currentSlideIndex);
  state.currentSlideIndex = Math.min(isCurrentSelected, state.slides.length - 1);
  state.selectedElementId = null;
  recordHistorySnapshot();
  render();
}

function duplicateElement() {
  if (!state.selectedElementId) return;
  const slide = currentSlide();
  const source = slide.elements.find((item) => item.id === state.selectedElementId);
  if (!source) return;
  const copy = JSON.parse(JSON.stringify(source));
  copy.id = createId();
  copy.x += 20;
  copy.y += 20;
  slide.elements.push(copy);
  state.selectedElementId = copy.id;
  recordHistorySnapshot();
  render();
}

function deleteElement() {
  if (!state.selectedElementId) return;
  const slide = currentSlide();
  slide.elements = slide.elements.filter((item) => item.id !== state.selectedElementId);
  state.selectedElementId = null;
  recordHistorySnapshot();
  render();
}

function setZOrder(direction) {
  if (!state.selectedElementId) return;
  const slide = currentSlide();
  const index = slide.elements.findIndex((item) => item.id === state.selectedElementId);
  if (index < 0) return;

  const target = index + direction;
  if (target < 0 || target >= slide.elements.length) return;

  const [item] = slide.elements.splice(index, 1);
  slide.elements.splice(target, 0, item);
  recordHistorySnapshot();
  render();
}

function renderProperties() {
  const slide = currentSlide();
  const item = slide.elements.find((item) => item.id === state.selectedElementId);
  const editing = activeTextEditor ? slide.elements.find((e) => e.id === activeTextEditor.elementId) : null;

  dom.selectedLabel.value = item ? `${item.type.toUpperCase()}` : '';

  const hasSelection = Boolean(item);
  const supportsFill = item && !['svg-fragment'].includes(item.type);
  const isText = item?.type === 'text';
  dom.propFillLabel.textContent = isText ? '文字色' : '塗りつぶし';
  dom.propStrokeLabel.textContent = '枠色';
  dom.propFill.disabled = !supportsFill || !hasSelection;
  dom.propStroke.disabled = !supportsFill || !hasSelection;
  dom.propFontSize.disabled = !hasSelection || item?.type !== 'text';
  dom.propText.disabled = !hasSelection || item?.type !== 'text';
  dom.bringFront.disabled = !hasSelection;
  dom.sendBack.disabled = !hasSelection;
  dom.duplicateElement.disabled = !hasSelection;
  dom.deleteElement.disabled = !hasSelection;

  if (!item) {
    dom.propFillLabel.textContent = '塗りつぶし';
    dom.propStrokeLabel.textContent = '枠色';
    dom.propFill.value = '#000000';
    dom.propStroke.value = '#000000';
    dom.propFontSize.value = '32';
    dom.propText.value = '';
    return;
  }

  if (item.type === 'text') {
    dom.selectedLabel.value = 'テキスト';
  } else if (item.type === 'rect') {
    dom.selectedLabel.value = '四角形';
  } else if (item.type === 'circle') {
    dom.selectedLabel.value = '円';
  } else if (item.type === 'svg-fragment') {
    dom.selectedLabel.value = 'SVG(高精度取り込み)';
  } else {
    dom.selectedLabel.value = '画像';
  }

  dom.propFill.value = item.fill || '#111827';
  dom.propStroke.value = item.stroke || '#0f2f56';
  dom.propFontSize.value = String(item.fontSize || 32);
  if (editing && editing.id === item.id) {
    dom.propText.value = activeTextEditor?.textarea?.value || '';
    dom.propText.disabled = true;
    return;
  }
  dom.propText.value = item.text || '';
}

function applyPropertyFromInputs(event) {
  const slide = currentSlide();
  const item = slide.elements.find((item) => item.id === state.selectedElementId);
  if (!item) return;
  const isStrokeInput = event?.target === dom.propStroke;

  if (item.type !== 'svg-fragment') {
    item.fill = dom.propFill.value;
    item.stroke = dom.propStroke.value;
    if (item.type === 'text' && isStrokeInput) {
      item.strokeWidth = Math.max(1, Number.isFinite(item.strokeWidth) ? item.strokeWidth : 1);
    }
  }
  item.fontSize = Number(dom.propFontSize.value || 32);
  if (item.type === 'text') item.text = dom.propText.value;
  recordHistorySnapshot();
  render();
}

function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadLocal() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const loaded = JSON.parse(raw);
    if (!loaded || !Array.isArray(loaded.slides) || loaded.slides.length === 0) return;

    state.slides = loaded.slides;
    state.currentSlideIndex = Math.min(Math.max(0, loaded.currentSlideIndex || 0), state.slides.length - 1);
    state.selectedElementId = null;
  } catch (error) {
    console.error('保存データの読み込み失敗', error);
  }
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  downloadBlob(blob, 'svg-slide-editor-data.json');
}

function importJSONFromInput(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const loaded = JSON.parse(reader.result);
      if (!loaded || !Array.isArray(loaded.slides) || loaded.slides.length === 0) {
        alert('不正なJSON形式です');
        return;
      }
      state.slides = loaded.slides;
      state.currentSlideIndex = 0;
      state.selectedElementId = null;
      recordHistorySnapshot();
      render();
    } catch {
      alert('JSONの読み込みに失敗しました');
    }
  };
  reader.readAsText(file);
}

function importSVGFromInput(file) {
  if (!file) return;
  const accepted = /svg|xml/i;
  if (!accepted.test(file.type) && !file.name.toLowerCase().endsWith('.svg')) {
    alert('SVGファイル(.svg)を選択してください');
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const text = typeof reader.result === 'string' ? reader.result : '';
    if (!text) {
      alert('SVGの読み込み内容が空です');
      return;
    }

    const parser = new DOMParser();
    const svgDocument = parser.parseFromString(text, 'image/svg+xml');
    const parseError = svgDocument.getElementsByTagName('parsererror')[0];
    if (parseError) {
      alert('SVGの解析に失敗しました');
      return;
    }

    const root = svgDocument.documentElement;
    if (!root || root.tagName.toLowerCase() !== 'svg') {
      alert('有効なSVGではありません');
      return;
    }

    const slide = currentSlide();
    const { source, elements, backgroundColor } = parseSVGElements(root);
    if (backgroundColor) {
      slide.background = backgroundColor;
    }

    const shouldUseRaw = shouldUseSvgFragmentImport(root, elements);
    if (shouldUseRaw) {
      addSVGFragmentElement(slide, source, text);
      state.selectedElementId = slide.elements.at(-1).id;
      recordHistorySnapshot();
      render();
      return;
    }

    const parsed = scaleAndPositionImportedElements(elements, source);
    for (const item of parsed) {
      const element = { ...item, id: createId() };
      slide.elements.push(element);
      state.selectedElementId = element.id;
    }
    recordHistorySnapshot();
    render();
  };

  reader.onerror = () => {
    alert('SVGの読み込みに失敗しました');
  };

  reader.readAsText(file);
}

function exportSVG() {
  const slide = currentSlide();
  const svg = dom.canvas.cloneNode(true);
  svg.setAttribute('xmlns', SVG_NS);
  svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  svg.setAttribute('width', slide.width);
  svg.setAttribute('height', slide.height);
  svg.setAttribute('viewBox', `0 0 ${slide.width} ${slide.height}`);

  const serialized = new XMLSerializer().serializeToString(svg);
  const header = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  const fullSvg = `${header}${serialized}`;
  const blob = new Blob([fullSvg], { type: 'image/svg+xml' });
  downloadBlob(blob, `slide-${state.currentSlideIndex + 1}.svg`);
}

function downloadBlob(blob, name) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.appendChild(link);
  link.click();
  URL.revokeObjectURL(link.href);
  document.body.removeChild(link);
}

function resetState() {
  const ok = window.confirm('編集内容をすべて削除して初期状態に戻しますか？');
  if (!ok) return;

  localStorage.removeItem(STORAGE_KEY);
  state.slides = [createEmptySlide('スライド 1')];
  state.currentSlideIndex = 0;
  state.selectedElementId = null;
  state.pointerState = null;
  recordHistorySnapshot();
  render();
}

function setupEvents() {
  dom.newSlide.addEventListener('click', newSlide);
  dom.duplicateSlide.addEventListener('click', duplicateSlide);
  dom.deleteSlide.addEventListener('click', removeCurrentSlide);

  dom.addText.addEventListener('click', () => addElement('text'));
  dom.addRect.addEventListener('click', () => addElement('rect'));
  dom.addCircle.addEventListener('click', () => addElement('circle'));
  dom.addImage.addEventListener('click', () => addElement('image'));

  dom.duplicateElement.addEventListener('click', duplicateElement);
  dom.deleteElement.addEventListener('click', deleteElement);
  dom.bringFront.addEventListener('click', () => setZOrder(1));
  dom.sendBack.addEventListener('click', () => setZOrder(-1));

  dom.resetState.addEventListener('click', resetState);
  dom.exportJSON.addEventListener('click', () => {
    if (activeTextEditor) {
      closeActiveTextEditor({ commit: true, rerender: false });
    }
    exportJSON();
  });
  dom.importJSONButton.addEventListener('click', () => {
    if (activeTextEditor) {
      closeActiveTextEditor({ commit: true, rerender: false });
    }
    dom.importJSON.click();
  });
  dom.importSVG.addEventListener('change', (event) => {
    if (activeTextEditor) {
      closeActiveTextEditor({ commit: true, rerender: false });
    }
    const file = event.target.files?.[0];
    if (!file) return;
    importSVGFromInput(file);
    event.target.value = '';
  });
  dom.importSVGButton.addEventListener('click', () => {
    if (activeTextEditor) {
      closeActiveTextEditor({ commit: true, rerender: false });
    }
    dom.importSVG.click();
  });
  dom.exportSVG.addEventListener('click', () => {
    if (activeTextEditor) {
      closeActiveTextEditor({ commit: true, rerender: false });
    }
    exportSVG();
  });
  dom.importJSON.addEventListener('change', (event) => {
    if (activeTextEditor) {
      closeActiveTextEditor({ commit: true, rerender: false });
    }
    const file = event.target.files?.[0];
    if (!file) return;
    importJSONFromInput(file);
    event.target.value = '';
  });

  dom.propFill.addEventListener('input', applyPropertyFromInputs);
  dom.propStroke.addEventListener('input', applyPropertyFromInputs);
  dom.propFontSize.addEventListener('input', applyPropertyFromInputs);
  dom.propText.addEventListener('input', applyPropertyFromInputs);

  dom.undoAction.addEventListener('click', () => {
    undoHistory();
  });

  dom.redoAction.addEventListener('click', () => {
    redoHistory();
  });

  dom.canvas.addEventListener('pointermove', onPointerMove);
  dom.canvas.addEventListener('pointerup', onPointerUp);
  dom.canvas.addEventListener('pointercancel', onPointerUp);

  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointermove', onPointerMove);

  window.addEventListener('keydown', (event) => {
    const targetTag = document.activeElement?.tagName?.toLowerCase();
    const isTextControl = targetTag === 'input' || targetTag === 'textarea';
    const key = event.key?.toLowerCase();
    const isUndoShortcut = (event.metaKey || event.ctrlKey) && !event.altKey && !isTextControl && key === 'z';
    const isRedoShortcut = (event.metaKey || event.ctrlKey) && !isTextControl && (key === 'y' || (event.shiftKey && key === 'z'));

    if (isUndoShortcut) {
      event.preventDefault();
      undoHistory();
      return;
    }

    if (isRedoShortcut) {
      event.preventDefault();
      redoHistory();
      return;
    }

    if (activeTextEditor && event.key === 'Enter') {
      if (isTextControl) return;
      closeActiveTextEditor({ commit: true, rerender: false });
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (isTextControl) return;
      if (activeTextEditor) {
        closeActiveTextEditor({ commit: true, rerender: false });
        return;
      }

      deleteElement();
    }
  });
}

function bootstrap() {
  loadLocal();
  if (history && typeof history.replace === 'function') {
    history.replace(state);
  } else {
    recordHistorySnapshot();
  }
  setupEvents();
  render();
}

bootstrap();
