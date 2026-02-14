const SVG_NS = 'http://www.w3.org/2000/svg';
const HTML_NS = 'http://www.w3.org/1999/xhtml';
const STORAGE_KEY = 'svg_ppt_like_state_v1';
const SVG_IMPORT_PADDING_RATIO = 0;
const TEXT_EDIT_DRAG_THRESHOLD = 4;
const SNAP_THRESHOLD_DEFAULT = 10;
const SNAP_GUIDE_FADE_DURATION = 220;
const SNAP_RESIZE_MIN_SIZE = 20;
const textCommands = typeof window !== 'undefined'
  && window.EditorElementCommands
  && typeof window.EditorElementCommands === 'object'
    ? window.EditorElementCommands
    : null;
const DEFAULT_TEXT_FONT_FAMILY = textCommands && textCommands.DEFAULT_TEXT_FONT_FAMILY
  ? textCommands.DEFAULT_TEXT_FONT_FAMILY
  : 'Arial, sans-serif';
const TEXT_LINE_HEIGHT_RATIO = textCommands && textCommands.TEXT_LINE_HEIGHT_RATIO
  ? textCommands.TEXT_LINE_HEIGHT_RATIO
  : 1.3;
const TEXT_LINE_SPACING_DEFAULT = TEXT_LINE_HEIGHT_RATIO;
const TEXT_LETTER_SPACING_DEFAULT = 0;
const TEXT_INDENT_DEFAULT = 0;
const TEXT_BULLET_DEFAULT = 'none';
const TEXT_BULLET_TYPES = new Set(['none', 'bullet', 'number']);
const TEXT_STYLE_FONT_SIZE_DEFAULT = 32;
const normalizeFontFamilyValue = textCommands && typeof textCommands.normalizeFontFamilyValue === 'function'
  ? textCommands.normalizeFontFamilyValue
  : (value) => String(value || DEFAULT_TEXT_FONT_FAMILY).trim() || DEFAULT_TEXT_FONT_FAMILY;
const buildTextDisplayLine = textCommands && typeof textCommands.buildTextDisplayLine === 'function'
  ? textCommands.buildTextDisplayLine
  : (line = '', lineIndex = 0, options = {}) => {
    const bulletType = options.bulletType || TEXT_BULLET_DEFAULT;
    const normalizedBullet = TEXT_BULLET_TYPES.has(bulletType) ? bulletType : TEXT_BULLET_DEFAULT;
    const prefix = normalizedBullet === 'bullet'
      ? '• '
      : normalizedBullet === 'number'
        ? `${lineIndex + 1}. `
        : '';

    return {
      text: `${prefix}${line || ''}`,
      prefix,
      prefixLength: prefix.length,
    };
  };
function normalizeFontFamilyInputValue(fontFamily = '') {
  const normalized = normalizeFontFamilyValue(String(fontFamily || '').trim());
  const parts = normalized
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/^"(.+)"$/g, '$1').replace(/^'(.+)'$/g, '$1'))
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) return DEFAULT_TEXT_FONT_FAMILY;
  return parts.join(', ');
}
const estimateTextBoxMetrics = textCommands && typeof textCommands.estimateTextBoxMetrics === 'function'
  ? textCommands.estimateTextBoxMetrics
  : (text, fontSize = 32, options = {}) => {
    const lines = (text || '').split('\n');
    const lineFontSize = Number(fontSize) || 32;
    const textElement = {
      fontFamily: options.fontFamily || DEFAULT_TEXT_FONT_FAMILY,
      fontWeight: options.fontWeight || 'normal',
      fontStyle: options.fontStyle || 'normal',
      fontSize: lineFontSize,
    };
    const lineWidths = lines.map((line) => getTextLineWidth(line, lineFontSize, textElement));
    const width = Math.max(40, Math.round(Math.max(...lineWidths)));
    const height = Math.max(
      16,
      Math.round(
        getTextLineHeight(lineFontSize, Number(options.lineSpacing || TEXT_LINE_SPACING_DEFAULT))
          * Math.max(1, lines.length),
      ),
    );

    return {
      width,
      height,
    };
  };

const state = {
  slides: [createEmptySlide('スライド 1')],
  currentSlideIndex: 0,
  selectedElementId: null,
  selectedElementIds: [],
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
  && window.EditorAlignSnap
  && typeof window.EditorAlignSnap.createSnapEngine === 'function'
    ? window.EditorAlignSnap.createSnapEngine
    : typeof window !== 'undefined'
      && window.EditorSnap
      && typeof window.EditorSnap.createSnapEngine === 'function'
        ? window.EditorSnap.createSnapEngine
        : null;
const snapEngine = snapEngineFactory
  ? snapEngineFactory({
    snapThreshold: SNAP_THRESHOLD_DEFAULT,
  })
  : null;

let activeTextEditor = null;
let textMeasureContext = null;
let activeSnapGuide = null;
let snapGuideFadeTimer = null;
let clipboardElements = [];
let clipboardPasteOffset = 20;

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
  propFontSizeRow: document.getElementById('prop-font-size-row'),
  propTextAlign: document.getElementById('prop-text-align'),
  propTextAlignRow: document.getElementById('prop-text-align-row'),
  propFontFamily: document.getElementById('prop-font-family'),
  propFontFamilyRow: document.getElementById('prop-font-family-row'),
  propFontBold: document.getElementById('prop-font-bold'),
  propFontBoldRow: document.getElementById('prop-font-bold-row'),
  propFontItalic: document.getElementById('prop-font-italic'),
  propFontItalicRow: document.getElementById('prop-font-italic-row'),
  propTextLineSpacing: document.getElementById('prop-text-line-spacing'),
  propTextLineSpacingRow: document.getElementById('prop-text-line-spacing-row'),
  propTextLetterSpacing: document.getElementById('prop-text-letter-spacing'),
  propTextLetterSpacingRow: document.getElementById('prop-text-letter-spacing-row'),
  propTextIndent: document.getElementById('prop-text-indent'),
  propTextIndentRow: document.getElementById('prop-text-indent-row'),
  propTextBullet: document.getElementById('prop-text-bullet'),
  propTextBulletRow: document.getElementById('prop-text-bullet-row'),
  propText: document.getElementById('prop-text'),
  propTextRow: document.getElementById('prop-text-row'),
  bringFront: document.getElementById('bring-front'),
  sendBack: document.getElementById('send-back'),
  alignLeft: document.getElementById('align-left'),
  alignCenter: document.getElementById('align-center'),
  alignRight: document.getElementById('align-right'),
  alignTop: document.getElementById('align-top'),
  alignMiddle: document.getElementById('align-middle'),
  alignBottom: document.getElementById('align-bottom'),
  alignDistributeH: document.getElementById('align-distribute-h'),
  alignDistributeV: document.getElementById('align-distribute-v'),
  alignEqualWidth: document.getElementById('align-equal-width'),
  alignEqualHeight: document.getElementById('align-equal-height'),
  instructions: document.getElementById('instructions'),
  undoAction: document.getElementById('undo-action'),
  redoAction: document.getElementById('redo-action'),
};

function createId() {
  return (crypto.randomUUID && crypto.randomUUID()) || `id-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function normalizeTextLineSpacing(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return TEXT_LINE_SPACING_DEFAULT;
  return parsed;
}

function normalizeTextLetterSpacing(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return TEXT_LETTER_SPACING_DEFAULT;
  return parsed;
}

function normalizeTextIndent(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return TEXT_INDENT_DEFAULT;
  return parsed;
}

function normalizeTextBulletType(value) {
  return TEXT_BULLET_TYPES.has(value) ? value : TEXT_BULLET_DEFAULT;
}

function normalizeTextFontSize(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return TEXT_STYLE_FONT_SIZE_DEFAULT;
  return parsed;
}

function normalizeTextFontWeight(value) {
  const normalized = String(value || 'normal').toLowerCase().trim();
  if (normalized === 'bold' || normalized === 'bolder' || (/^\d+$/.test(normalized) && Number(normalized) >= 600)) {
    return 'bold';
  }
  return 'normal';
}

function normalizeTextFontStyle(value) {
  const normalized = String(value || 'normal').toLowerCase().trim();
  return normalized === 'italic' || normalized === 'oblique' ? 'italic' : 'normal';
}

function normalizeTextAlign(value) {
  if (value === 'middle' || value === 'center') return 'middle';
  if (value === 'end' || value === 'right') return 'end';
  if (value === 'start' || value === 'left') return 'start';
  return 'start';
}

function normalizeFontFamilyPrimaryToken(fontFamily) {
  const normalized = normalizeFontFamilyInputValue(fontFamily || DEFAULT_TEXT_FONT_FAMILY);
  return normalized.split(',')[0]?.trim() || DEFAULT_TEXT_FONT_FAMILY;
}

function ensureFontFamilySelectOption(fontFamily) {
  if (!dom || !dom.propFontFamily) return normalizeFontFamilyInputValue(fontFamily || DEFAULT_TEXT_FONT_FAMILY);

  const normalized = normalizeFontFamilyInputValue(fontFamily || DEFAULT_TEXT_FONT_FAMILY);
  const exists = Array.from(dom.propFontFamily.options).some((option) => option.value === normalized);
  if (!exists) {
    const option = document.createElement('option');
    option.value = normalized;
    option.textContent = normalizeFontFamilyPrimaryToken(normalized);
    dom.propFontFamily.appendChild(option);
  }
  return normalized;
}

function normalizeTextElementProperties(item) {
  if (!item || item.type !== 'text') return;
  item.fontSize = normalizeTextFontSize(item.fontSize);
  item.fontFamily = normalizeFontFamilyInputValue(item.fontFamily || DEFAULT_TEXT_FONT_FAMILY);
  item.fontWeight = normalizeTextFontWeight(item.fontWeight);
  item.fontStyle = normalizeTextFontStyle(item.fontStyle);
  item.textAnchor = normalizeTextAlign(item.textAnchor || 'start');
  item.lineSpacing = normalizeTextLineSpacing(item.lineSpacing || TEXT_LINE_SPACING_DEFAULT);
  item.letterSpacing = normalizeTextLetterSpacing(item.letterSpacing || TEXT_LETTER_SPACING_DEFAULT);
  item.textIndent = normalizeTextIndent(item.textIndent || TEXT_INDENT_DEFAULT);
  item.bulletType = normalizeTextBulletType(item.bulletType || TEXT_BULLET_DEFAULT);
}

function normalizeTextElementsInSlides(slides) {
  if (!Array.isArray(slides)) return;
  for (const slide of slides) {
    if (!slide || !Array.isArray(slide.elements)) continue;
    slide.elements.forEach(normalizeTextElementProperties);
  }
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

function getSelectedElementIds(ids) {
  const source = Array.isArray(ids) ? ids : state.selectedElementIds;
  const unique = [...new Set(Array.isArray(source) ? source : [])];
  return unique
    .map(normalizeSelectionId)
    .filter((id) => id !== null && id !== '');
}

function setSelectedElementIds(ids) {
  const unique = getSelectedElementIds(ids || []);
  const slide = currentSlide();
  const valid = Array.isArray(slide?.elements)
    ? unique.filter((id) => slide.elements.some((item) => normalizeSelectionId(item.id) === id))
    : [];
  state.selectedElementIds = valid;
  state.selectedElementId = valid[0] || null;
}

function normalizeSelectionId(id) {
  return id === null || id === undefined ? null : String(id);
}

function getPrimarySelectedElementId() {
  return state.selectedElementIds && state.selectedElementIds.length > 0 ? state.selectedElementIds[0] : state.selectedElementId;
}

function getPrimarySelectedElement() {
  const slide = currentSlide();
  const id = getPrimarySelectedElementId();
  if (!id) return null;
  return slide.elements.find((item) => normalizeSelectionId(item.id) === normalizeSelectionId(id)) || null;
}

function getSelectedElementElements() {
  const slide = currentSlide();
  const ids = new Set(getSelectedElementIds().map(normalizeSelectionId));
  return slide.elements.filter((item) => ids.has(normalizeSelectionId(item.id)));
}

function hasSingleSelection() {
  return getSelectedElementIds().length === 1;
}

function isSingleSelectionText() {
  if (!hasSingleSelection()) return false;
  const selected = getPrimarySelectedElement();
  return selected?.type === 'text';
}

function hasSelection() {
  return getSelectedElementIds().length > 0;
}

function isElementIdSelected(elementId) {
  return getSelectedElementIds().map(normalizeSelectionId).includes(normalizeSelectionId(elementId));
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

  const historySelectedIds = Array.isArray(snapshot.selectedElementIds)
    ? snapshot.selectedElementIds
    : snapshot.selectedElementId
      ? [snapshot.selectedElementId]
      : [];
  const selectedElementIds = historySelectedIds.filter((id) => current && Array.isArray(current.elements)
    && current.elements.some((item) => normalizeSelectionId(item.id) === normalizeSelectionId(id)));

  const selectedValid = !!(
    current
    && Array.isArray(current.elements)
    && selectedElementIds.length > 0
  );

  if (activeTextEditor) {
    closeActiveTextEditor({ commit: false, rerender: false });
  }

  state.slides = slides;
  normalizeTextElementsInSlides(state.slides);
  state.currentSlideIndex = currentIndex;
  setSelectedElementIds(selectedValid ? selectedElementIds : []);
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
  if (snapGuideFadeTimer) {
    clearTimeout(snapGuideFadeTimer);
    snapGuideFadeTimer = null;
  }
  activeSnapGuide = null;
}

function startSnapGuideFadeOut() {
  if (!activeSnapGuide || activeSnapGuide.isFading) return;

  if (snapGuideFadeTimer) {
    clearTimeout(snapGuideFadeTimer);
  }

  activeSnapGuide = {
    ...activeSnapGuide,
    isFading: true,
  };

  const snapGuides = dom.canvas
    ? Array.from(dom.canvas.querySelectorAll('.snap-guide-line, .snap-guide-marker'))
    : [];
  if (!snapGuides.length) {
    clearSnapGuideState();
    return;
  }

  snapGuides.forEach((guide) => {
    if (guide.classList.contains('snap-guide-line')) {
      guide.classList.add('snap-guide-line--fade');
    }
    if (guide.classList.contains('snap-guide-marker')) {
      guide.classList.add('snap-guide-marker--fade');
    }
  });

  snapGuideFadeTimer = setTimeout(() => {
    if (dom.canvas) {
      dom.canvas
        .querySelectorAll('.snap-guide-line, .snap-guide-marker')
        .forEach((guide) => guide.remove());
    }
    clearSnapGuideState();
  }, SNAP_GUIDE_FADE_DURATION);
}

function getSnapThreshold() {
  return SNAP_THRESHOLD_DEFAULT;
}

function applyMoveSnap(element, x, y, activeElementIds = [element?.id]) {
  if (!snapEngine) return { x, y };

  const slide = currentSlide();
  const excludedIds = new Set(Array.isArray(activeElementIds) ? activeElementIds : [activeElementIds]);
  const bounds = getElementBounds(element);
  const result = snapEngine.snapMove({
    x,
    y,
    width: Number.isFinite(bounds.width) ? bounds.width : Number.isFinite(element.width) ? element.width : 0,
    height: Number.isFinite(bounds.height) ? bounds.height : Number.isFinite(element.height) ? element.height : 0,
    elements: slide.elements.filter((item) => !excludedIds.has(item.id)),
    activeElementId: element.id,
    slideWidth: slide.width,
    slideHeight: slide.height,
    snapThreshold: getSnapThreshold(),
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
  const fixedLeft = Number.isFinite(baseBounds.x) ? baseBounds.x : next.x;
  const fixedTop = Number.isFinite(baseBounds.y) ? baseBounds.y : next.y;
  const baseWidth = Number.isFinite(baseBounds.width) ? baseBounds.width : Number.isFinite(next.width) ? next.width : 0;
  const baseHeight = Number.isFinite(baseBounds.height) ? baseBounds.height : Number.isFinite(next.height) ? next.height : 0;
  const fixedRight = fixedLeft + Math.max(SNAP_RESIZE_MIN_SIZE, baseWidth);
  const fixedBottom = fixedTop + Math.max(SNAP_RESIZE_MIN_SIZE, baseHeight);

  const moveHorizontal = hasMoveLeft && hasMoveRight
    ? 'left'
    : hasMoveLeft
      ? 'left'
      : hasMoveRight
        ? 'right'
        : 'none';
  const moveVertical = hasMoveTop && hasMoveBottom
    ? 'top'
    : hasMoveTop
      ? 'top'
      : hasMoveBottom
        ? 'bottom'
        : 'none';

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

  if (moveHorizontal === 'left') {
    const leftSnap = snapEngine.snapMove({
      x: next.x,
      y: next.y,
      width: 0,
      height: next.height,
      elements: slide.elements,
      activeElementId: state.pointerState.elementId,
      slideWidth: slide.width,
      slideHeight: slide.height,
      snapThreshold: getSnapThreshold(),
    });

    const alignedLeft = Number.isFinite(leftSnap.x) ? leftSnap.x : next.x;
    const alignedGuide = Number.isFinite(leftSnap.guideX) ? leftSnap.guideX : alignedLeft;
    const clampedLeft = Math.min(alignedLeft, fixedRight - SNAP_RESIZE_MIN_SIZE);
    snapped.x = clampedLeft;
    snapped.width = Math.max(SNAP_RESIZE_MIN_SIZE, fixedRight - clampedLeft);
    if (leftSnap.hasSnapX) {
      guideX = alignedGuide;
      hasSnapX = true;
    }
  }

  if (moveHorizontal === 'right') {
    const rightSnap = snapEngine.snapMove({
      x: rightEdge,
      y: next.y,
      width: 0,
      height: next.height,
      elements: slide.elements,
      activeElementId: state.pointerState.elementId,
      slideWidth: slide.width,
      slideHeight: slide.height,
      snapThreshold: getSnapThreshold(),
    });

    const alignedRight = Number.isFinite(rightSnap.guideX) ? rightSnap.guideX : rightEdge;
    const clampedRight = Math.max(alignedRight, fixedLeft + SNAP_RESIZE_MIN_SIZE);
    snapped.x = fixedLeft;
    snapped.width = Math.max(SNAP_RESIZE_MIN_SIZE, clampedRight - fixedLeft);
    if (rightSnap.hasSnapX) {
      guideX = alignedRight;
      hasSnapX = true;
    }
  }

  if (moveVertical === 'top') {
    const topSnap = snapEngine.snapMove({
      x: next.x,
      y: next.y,
      width: next.width,
      height: 0,
      elements: slide.elements,
      activeElementId: state.pointerState.elementId,
      slideWidth: slide.width,
      slideHeight: slide.height,
      snapThreshold: getSnapThreshold(),
    });

    const alignedTop = Number.isFinite(topSnap.y) ? topSnap.y : next.y;
    const alignedGuide = Number.isFinite(topSnap.guideY) ? topSnap.guideY : alignedTop;
    const clampedTop = Math.min(alignedTop, fixedBottom - SNAP_RESIZE_MIN_SIZE);
    snapped.y = clampedTop;
    snapped.height = Math.max(SNAP_RESIZE_MIN_SIZE, fixedBottom - clampedTop);
    if (topSnap.hasSnapY) {
      guideY = alignedGuide;
      hasSnapY = true;
    }
  }

  if (moveVertical === 'bottom') {
    const bottomSnap = snapEngine.snapMove({
      x: next.x,
      y: bottomEdge,
      width: next.width,
      height: 0,
      elements: slide.elements,
      activeElementId: state.pointerState.elementId,
      slideWidth: slide.width,
      slideHeight: slide.height,
      snapThreshold: getSnapThreshold(),
    });

    const alignedBottom = Number.isFinite(bottomSnap.guideY) ? bottomSnap.guideY : bottomEdge;
    const clampedBottom = Math.max(alignedBottom, fixedTop + SNAP_RESIZE_MIN_SIZE);
    snapped.y = fixedTop;
    snapped.height = Math.max(SNAP_RESIZE_MIN_SIZE, clampedBottom - fixedTop);
    if (bottomSnap.hasSnapY) {
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
  const baseFontFamily = normalizeFontFamilyInputValue(getNodeStyleValue(node, 'font-family', 'Arial, sans-serif', svgRoot));
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
    const fontFamily = normalizeFontFamilyInputValue(getNodeStyleValue(span, 'font-family', baseFontFamily, svgRoot));
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
        const fontFamily = normalizeFontFamilyInputValue(getNodeStyleValue(node, 'font-family', 'Arial, sans-serif', svgRoot));
        const fontWeight = getNodeStyleValue(node, 'font-weight', 'normal', svgRoot);
        const fontStyle = getNodeStyleValue(node, 'font-style', 'normal', svgRoot);
        const estimatedText = (node.textContent || '').trim() || 'text';
        const baseY = (box ? box.y : parseNumber(node.getAttribute('y'), 0) - fontSize);
        const estimatedMetrics = estimateTextBoxMetrics(estimatedText, fontSize, {
          fontFamily,
          fontWeight,
          fontStyle,
        });
        const width = Math.max(12, box ? box.width : estimatedMetrics.width);
        const height = Math.max(12, box ? box.height : estimatedMetrics.height);
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
          fontWeight,
          fontStyle,
          stroke: getNodeStyleValue(node, 'stroke', 'none', svgRoot),
          strokeWidth: parseNumber(getNodeStyleValue(node, 'stroke-width', 0, svgRoot), 0),
        });
        continue;
      }

      const text = (node.textContent || '').trim() || 'text';
      const fontSize = parseNumber(getNodeStyleValue(node, 'font-size', 32, svgRoot), 32);
      const fontFamily = normalizeFontFamilyInputValue(getNodeStyleValue(node, 'font-family', 'Arial, sans-serif', svgRoot));
      const fontWeight = getNodeStyleValue(node, 'font-weight', 'normal', svgRoot);
      const fontStyle = getNodeStyleValue(node, 'font-style', 'normal', svgRoot);
      const estimatedMetrics = estimateTextBoxMetrics(text, fontSize, {
        fontFamily,
        fontWeight,
        fontStyle,
      });
      const x = parseNumber(getNodeStyleValue(node, 'x', 0, svgRoot), 0) + transformOffset.x;
      const y = parseNumber(getNodeStyleValue(node, 'y', 0, svgRoot), 0) + transformOffset.y;
      parsed.push({
        type: 'text',
        x,
        y: y - fontSize,
        width: Math.max(40, estimatedMetrics.width),
        height: Math.max(12, estimatedMetrics.height),
        text,
        fontSize,
        fontFamily,
        textAnchor: getNodeStyleValue(node, 'text-anchor', 'start', svgRoot),
        dominantBaseline: getNodeStyleValue(node, 'dominant-baseline', 'auto', svgRoot),
        alignmentBaseline: getNodeStyleValue(node, 'alignment-baseline', 'auto', svgRoot),
        fontWeight,
        fontStyle,
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
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  if (!textMeasureContext) {
    const canvas = document.createElement('canvas');
    textMeasureContext = canvas.getContext('2d');
  }
  return textMeasureContext;
}

function getTextLineHeight(fontSize, lineSpacing = TEXT_LINE_SPACING_DEFAULT) {
  if (textCommands && typeof textCommands.getTextLineHeight === 'function') {
    return textCommands.getTextLineHeight(fontSize, lineSpacing);
  }
  const baseSize = Number(fontSize) || 32;
  const safeSpacing = normalizeTextLineSpacing(lineSpacing);
  return Math.max(16, Math.round(baseSize * safeSpacing));
}

function getTextAlignCssValue(textAnchor) {
  if (textCommands && typeof textCommands.getTextAlignCssValue === 'function') {
    return textCommands.getTextAlignCssValue(textAnchor);
  }
  if (textAnchor === 'start' || textAnchor === 'left') return 'left';
  if (textAnchor === 'middle') return 'center';
  if (textAnchor === 'end') return 'right';
  if (textAnchor === 'center') return 'center';
  if (textAnchor === 'right') return 'right';
  return 'left';
}

function getTextLineWidth(line, fontSize, element) {
  if (textCommands && typeof textCommands.getTextLineWidth === 'function') {
    return textCommands.getTextLineWidth(line, fontSize, element);
  }
  const normalizedFontSize = Number(fontSize) || Number(element?.fontSize) || 32;
  return Math.max(1, (line || '').length * Math.max(6, normalizedFontSize * 0.62));
}

function buildTextFontDescription(element) {
  if (textCommands && typeof textCommands.buildTextFontDescription === 'function') {
    return textCommands.buildTextFontDescription(element);
  }
  return [
    normalizeTextFontStyle(element?.fontStyle || 'normal'),
    normalizeTextFontWeight(element?.fontWeight || 'normal'),
    `${element?.fontSize || 32}px`,
    element?.fontFamily || DEFAULT_TEXT_FONT_FAMILY,
  ].join(' ');
}

function getTextOffsetForLine(line, targetX, ctx, element) {
  if (textCommands && typeof textCommands.getTextOffsetForLine === 'function') {
    return textCommands.getTextOffsetForLine(line, targetX, ctx, element);
  }
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
  if (textCommands && typeof textCommands.getTextCaretOffsetFromPoint === 'function') {
    return textCommands.getTextCaretOffsetFromPoint(element, point);
  }
  normalizeTextElementProperties(element);

  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return (element.text || '').length;
  }

  const fontSize = normalizeTextFontSize(element.fontSize);
  const lineHeight = getTextLineHeight(fontSize, normalizeTextLineSpacing(element.lineSpacing || TEXT_LINE_SPACING_DEFAULT));
  const bulletType = normalizeTextBulletType(element.bulletType || TEXT_BULLET_DEFAULT);
  const textIndent = normalizeTextIndent(element.textIndent || TEXT_INDENT_DEFAULT);
  const letterSpacing = normalizeTextLetterSpacing(element.letterSpacing || TEXT_LETTER_SPACING_DEFAULT);
  const lines = (element.text || '').split('\n');
  const textAlign = normalizeTextAlign(element.textAnchor || 'start');
  if (!lines.length) return 0;

  const measuredLineWidths = lines.map((line, index) => {
    return getTextLineWidth(line, fontSize, {
      ...element,
      letterSpacing,
      __lineIndex: index,
      bulletType,
    });
  });
  const elementWidth = Number(element.width);
  const baseX = textAlign === 'middle'
    ? Number(element.x || 0) + (Number.isFinite(elementWidth) ? elementWidth / 2 : 0)
    : textAlign === 'end'
      ? Number(element.x || 0) + (Number.isFinite(elementWidth) ? elementWidth : 0)
      : Number(element.x || 0);
  const cursorLine = clamp(Math.floor((point.y - element.y - fontSize * 0.25) / lineHeight), 0, lines.length - 1);
  const currentLine = lines[cursorLine] || '';
  const currentLineWidth = Math.max(1, measuredLineWidths[cursorLine] || getTextLineWidth(currentLine, fontSize, element));

  let x = point.x - (baseX + textIndent);

  if (textAlign === 'middle') {
    x -= (currentLineWidth + 1) / 2;
  } else if (textAlign === 'end') {
    x -= currentLineWidth;
  }

  const ctx = getTextMeasureContext();
  if (!ctx) return element.text.length;
  ctx.font = buildTextFontDescription(element);

  const clampedX = Math.max(0, x);
  const currentLineDisplay = buildTextDisplayLine(currentLine, cursorLine, { bulletType });
  const localOffset = getTextOffsetForLine(currentLineDisplay.text, clampedX, ctx, {
    ...element,
    fontSize,
    fontWeight: normalizeTextFontWeight(element.fontWeight),
    fontStyle: normalizeTextFontStyle(element.fontStyle),
    letterSpacing,
  });
  const contentOffset = Math.max(0, localOffset - currentLineDisplay.prefixLength);

  let offset = 0;
  for (let i = 0; i < cursorLine; i += 1) {
    const line = lines[i] || '';
    offset += line.length + 1;
  }
  const currentLineLength = (currentLine || '').length;
  return clamp(offset + Math.min(contentOffset, currentLineLength), 0, element.text.length);
}

function syncTextElementHeightFromContent(element) {
  if (!element || element.type !== 'text') return;
  normalizeTextElementProperties(element);

  const metrics = estimateTextBoxMetrics((element.text || ''), Number(element.fontSize) || 32, {
    fontFamily: element.fontFamily || DEFAULT_TEXT_FONT_FAMILY,
    fontWeight: normalizeTextFontWeight(element.fontWeight),
    fontStyle: normalizeTextFontStyle(element.fontStyle),
    lineSpacing: element.lineSpacing || TEXT_LINE_SPACING_DEFAULT,
    letterSpacing: element.letterSpacing || TEXT_LETTER_SPACING_DEFAULT,
    textIndent: element.textIndent || TEXT_INDENT_DEFAULT,
    bulletType: element.bulletType || TEXT_BULLET_DEFAULT,
  });

  const nextHeight = Math.max(12, metrics.height);
  if (!Number.isFinite(element.height) || element.height < nextHeight) {
    element.height = nextHeight;
  }
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
      setSelectedElementIds([]);
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
  bg.addEventListener('pointerdown', onCanvasPointerDownForDeselect);
  dom.canvas.appendChild(bg);

  slide.elements.forEach((el) => {
    renderElement(el);
  });

  const selectedIds = getSelectedElementIds();
  selectedIds.forEach((elementId, index) => {
    const target = slide.elements.find((el) => normalizeSelectionId(el.id) === normalizeSelectionId(elementId));
    if (target) {
      renderSelection(target, index === 0);
    }
  });
  if (state.pointerState?.mode === 'marquee' && state.pointerState.width > 0 && state.pointerState.height > 0) {
    renderMarqueeSelection(state.pointerState);
  }

  renderSnapGuides(slide);
}

function renderSnapGuides(slide) {
  if (!activeSnapGuide) return;

  const isInteractiveGuide = Boolean(
    state.pointerState
    && ['move', 'resize'].includes(state.pointerState.mode),
  );
  if (!isInteractiveGuide && !activeSnapGuide.isFading) return;

  const guideClass = ['snap-guide-line'];
  if (activeSnapGuide.hasSnapX && activeSnapGuide.hasSnapY) {
    guideClass.push('snap-guide-line--dual');
  }
  if (activeSnapGuide.isFading) {
    guideClass.push('snap-guide-line--fade');
  }

  if (activeSnapGuide.hasSnapX) {
    const guide = document.createElementNS(SVG_NS, 'line');
    guide.setAttribute('x1', activeSnapGuide.guideX);
    guide.setAttribute('y1', 0);
    guide.setAttribute('x2', activeSnapGuide.guideX);
    guide.setAttribute('y2', slide.height);
    guide.setAttribute('vector-effect', 'non-scaling-stroke');
    guide.classList.add(...guideClass);
    dom.canvas.appendChild(guide);
  }

  if (activeSnapGuide.hasSnapY) {
    const guide = document.createElementNS(SVG_NS, 'line');
    guide.setAttribute('x1', 0);
    guide.setAttribute('y1', activeSnapGuide.guideY);
    guide.setAttribute('x2', slide.width);
    guide.setAttribute('y2', activeSnapGuide.guideY);
    guide.setAttribute('vector-effect', 'non-scaling-stroke');
    guide.classList.add(...guideClass);
    dom.canvas.appendChild(guide);
  }

  if (activeSnapGuide.hasSnapX && activeSnapGuide.hasSnapY) {
    const marker = document.createElementNS(SVG_NS, 'circle');
    marker.setAttribute('cx', activeSnapGuide.guideX);
    marker.setAttribute('cy', activeSnapGuide.guideY);
    marker.setAttribute('r', 5);
    marker.setAttribute('vector-effect', 'non-scaling-stroke');
    marker.classList.add('snap-guide-marker', ...(activeSnapGuide.isFading ? ['snap-guide-marker--fade'] : []));
    dom.canvas.appendChild(marker);
  }
}

function renderElement(el) {
  const g = document.createElementNS(SVG_NS, 'g');
  g.dataset.elementId = el.id;
  g.classList.add('canvas-element');

  if (el.type === 'text') {
    normalizeTextElementProperties(el);
    const textAnchor = normalizeTextAlign(el.textAnchor || 'start');
    const fontSize = normalizeTextFontSize(el.fontSize);
    const baseX = Number(el.x) || 0;
    const elementWidth = Number(el.width);
    const lineSpacing = normalizeTextLineSpacing(el.lineSpacing || TEXT_LINE_SPACING_DEFAULT);
    const letterSpacing = normalizeTextLetterSpacing(el.letterSpacing || TEXT_LETTER_SPACING_DEFAULT);
    const textIndent = normalizeTextIndent(el.textIndent || TEXT_INDENT_DEFAULT);
    const bulletType = normalizeTextBulletType(el.bulletType || TEXT_BULLET_DEFAULT);
    const fontWeight = normalizeTextFontWeight(el.fontWeight);
    const fontStyle = normalizeTextFontStyle(el.fontStyle);
    const anchorX = textAnchor === 'middle'
      ? baseX + (Number.isFinite(elementWidth) ? elementWidth / 2 : 0)
      : textAnchor === 'end'
        ? baseX + (Number.isFinite(elementWidth) ? elementWidth : 0)
        : baseX;
    const anchorOffsetX = anchorX + textIndent;
    const text = document.createElementNS(SVG_NS, 'text');
    const fontFamily = normalizeFontFamilyValue(el.fontFamily || DEFAULT_TEXT_FONT_FAMILY);
    const textLines = (el.text || '').split('\n');
    const lineHeight = getTextLineHeight(fontSize, lineSpacing);
    const lineX = anchorOffsetX;

    textLines.forEach((line, index) => {
      const tspan = document.createElementNS(SVG_NS, 'tspan');
      const displayLine = buildTextDisplayLine(line, index, { bulletType });
      if (index > 0) {
        tspan.setAttribute('x', lineX);
        tspan.setAttribute('dy', String(lineHeight));
      }
      tspan.textContent = displayLine.text;
      text.appendChild(tspan);
    });

    text.setAttribute('x', lineX);
    text.setAttribute('y', (Number(el.y) || 0) + fontSize);
    text.setAttribute('fill', el.fill || '#111827');
    text.setAttribute('font-size', String(fontSize));
    text.setAttribute('font-family', fontFamily);
    text.setAttribute('font-weight', fontWeight);
    text.setAttribute('font-style', fontStyle);
    text.setAttribute('text-anchor', textAnchor);
    text.setAttribute('letter-spacing', String(letterSpacing));
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

function renderSelection(el, showHandles = true) {
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
  if (!showHandles) return;

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

function isCanvasObjectInteractiveTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest('.canvas-element')
    || target.closest('.selection-box')
    || target.closest('.selection-handle')
    || target.closest('[data-inline-text-editor]')
    || target.closest('[data-element-id]'),
  );
}

function isSelectionProtectedTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('.properties') || target.closest('.object-actions'));
}

function onCanvasPointerDownForDeselect(event) {
  if (!event) return;
  if (event.button !== undefined && event.button !== 0) return;

  const target = event.target;
  if (!target || !(target instanceof Element) || !dom.canvas) return;
  if (isSelectionProtectedTarget(target)) return;
  if (!dom.canvas.contains(target)) {
    const hadSelection = hasSelection();
    const hadMarqueeState = state.pointerState?.mode === 'marquee';
    if (hadSelection) {
      setSelectedElementIds([]);
    }
    if (hadMarqueeState) {
      state.pointerState = null;
    }
    if (activeTextEditor) {
      closeActiveTextEditor({ commit: true, rerender: false });
      if (state.pointerState) state.pointerState = null;
    }
    if (hadSelection || hadMarqueeState) {
      queueMicrotask(() => {
        render();
      });
    }
    return;
  }
  if (isCanvasObjectInteractiveTarget(target)) return;
  
  if (activeTextEditor) {
    closeActiveTextEditor({ commit: true, rerender: false });
    if (state.pointerState) state.pointerState = null;
  }

  setSelectedElementIds([]);
  const start = getPointerPosition(event);
  state.pointerState = {
    mode: 'marquee',
    pointerId: event.pointerId,
    start,
    x: start.x,
    y: start.y,
    width: 0,
    height: 0,
  };
  render();
}

function getElementBounds(el) {
  if (el.type === 'text') {
    normalizeTextElementProperties(el);
    const fontSize = Number(el.fontSize) || TEXT_STYLE_FONT_SIZE_DEFAULT;
    const metrics = estimateTextBoxMetrics(el.text || '', fontSize, {
      fontFamily: el.fontFamily || DEFAULT_TEXT_FONT_FAMILY,
      fontWeight: normalizeTextFontWeight(el.fontWeight),
      fontStyle: normalizeTextFontStyle(el.fontStyle),
      lineSpacing: el.lineSpacing || TEXT_LINE_SPACING_DEFAULT,
      letterSpacing: el.letterSpacing || TEXT_LETTER_SPACING_DEFAULT,
      textIndent: el.textIndent || TEXT_INDENT_DEFAULT,
      bulletType: el.bulletType || TEXT_BULLET_DEFAULT,
    });

    return {
      x: el.x,
      y: el.y,
      width: Math.max(el.width || 120, metrics.width),
      height: Math.max(el.height || metrics.height, metrics.height),
    };
  }

  return {
    x: el.x,
    y: el.y,
    width: el.width,
    height: el.height,
  };
}

function renderMarqueeSelection(pointerState) {
  if (!pointerState || pointerState.mode !== 'marquee') return;
  const x = pointerState.x;
  const y = pointerState.y;
  const width = pointerState.width;
  const height = pointerState.height;

  const marquee = document.createElementNS(SVG_NS, 'rect');
  marquee.classList.add('marquee-selection');
  marquee.setAttribute('x', x);
  marquee.setAttribute('y', y);
  marquee.setAttribute('width', width);
  marquee.setAttribute('height', height);
  dom.canvas.appendChild(marquee);
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
    if (target.type === 'text') {
      syncTextElementHeightFromContent(target);
    }
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
  normalizeTextElementProperties(element);

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
  const textLines = (element.text || '').split('\n');

  const foreignObject = document.createElementNS(SVG_NS, 'foreignObject');
  foreignObject.setAttribute('x', element.x);
  foreignObject.setAttribute('y', element.y);
  foreignObject.setAttribute('width', width);
  foreignObject.setAttribute('height', initialHeight);
  foreignObject.setAttribute('data-inline-text-editor', '1');

  const host = document.createElementNS(HTML_NS, 'div');
  host.style.width = '100%';
  host.style.height = '100%';
  const editorLineSpacing = normalizeTextLineSpacing(element.lineSpacing);
  const editorLetterSpacing = normalizeTextLetterSpacing(element.letterSpacing);
  const editorTextIndent = normalizeTextIndent(element.textIndent);

  const textarea = document.createElementNS(HTML_NS, 'textarea');
  textarea.value = element.text || '';
  textarea.rows = Math.max(1, textLines.length);
  textarea.setAttribute('aria-label', 'テキストを直接編集');
  textarea.className = 'inline-textarea';
  const fontFamily = normalizeFontFamilyValue(element.fontFamily || DEFAULT_TEXT_FONT_FAMILY);
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
    `font-size:${element.fontSize || TEXT_STYLE_FONT_SIZE_DEFAULT}px;`,
    `font-family:${fontFamily};`,
    `font-weight:${normalizeTextFontWeight(element.fontWeight)};`,
    `font-style:${normalizeTextFontStyle(element.fontStyle)};`,
    `text-align:${getTextAlignCssValue(normalizeTextAlign(element.textAnchor || 'start'))};`,
    `line-height:${editorLineSpacing};`,
    `letter-spacing:${editorLetterSpacing}px;`,
    `text-indent:${editorTextIndent}px;`,
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
  setSelectedElementIds([elementId]);
  renderProperties();

  textarea.focus();
  const caret = getTextCaretOffsetFromPoint(element, point);
  textarea.setSelectionRange(caret, caret);
}

function onElementPointerDown(event, elementId) {
  if (event.button === 2) return;
  event.preventDefault();
  event.stopPropagation();
  clearSnapGuideState();

  if (activeTextEditor) {
    closeActiveTextEditor({ commit: true, rerender: false });
  }

  const slide = currentSlide();
  const element = slide.elements.find((item) => item.id === elementId);
  if (!element) return;

  const isShiftSelecting = event.shiftKey;
  const selectedIds = getSelectedElementIds();
  const currentlySelected = selectedIds.some((id) => normalizeSelectionId(id) === normalizeSelectionId(elementId));
  const nextSelectedIds = isShiftSelecting
    ? (currentlySelected
      ? selectedIds.filter((id) => normalizeSelectionId(id) !== normalizeSelectionId(elementId))
      : [...selectedIds, elementId])
    : (currentlySelected
      ? selectedIds
      : [elementId]);
  setSelectedElementIds(nextSelectedIds);
  render();

  if (isShiftSelecting) return;

  const canEditText = isSingleSelectionText() && normalizeSelectionId(state.selectedElementId) === normalizeSelectionId(elementId);
  if (element.type === 'text' && canEditText && !isShiftSelecting) {
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

  const selectedElements = getSelectedElementElements();
  const moveTargets = selectedElements
    .map((item) => ({
      id: item.id,
      x: Number(item.x) || 0,
      y: Number(item.y) || 0,
    }));

  state.pointerState = {
    mode: 'move',
    elementId,
    pointerId: event.pointerId,
    start: getPointerPosition(event),
    activeIds: moveTargets.map((item) => item.id),
    x: Number(element.x) || 0,
    y: Number(element.y) || 0,
    moveTargets,
  };

  event.currentTarget.setPointerCapture(event.pointerId);
  render();
}

function onHandlePointerDown(event, elementId, handle) {
  event.preventDefault();
  event.stopPropagation();
  if (getSelectedElementIds().length > 1) return;
  
  clearSnapGuideState();
  if (activeTextEditor) {
    closeActiveTextEditor({ commit: true, rerender: false });
  }

  const slide = currentSlide();
  const element = slide.elements.find((item) => item.id === elementId);
  if (!element) return;

  const bounds = getElementBounds(element);
  setSelectedElementIds([elementId]);
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

  const p = getPointerPosition(event);

  if (state.pointerState.mode === 'marquee') {
    const startX = state.pointerState.start?.x;
    const startY = state.pointerState.start?.y;
    if (!Number.isFinite(startX) || !Number.isFinite(startY)) return;

    const x = Math.min(startX, p.x);
    const y = Math.min(startY, p.y);
    state.pointerState.x = x;
    state.pointerState.y = y;
    state.pointerState.width = Math.max(0, p.x - startX < 0 ? startX - p.x : p.x - startX);
    state.pointerState.height = Math.max(0, p.y - startY < 0 ? startY - p.y : p.y - startY);
    render();
    return;
  }

  const slide = currentSlide();
  const element = slide.elements.find((item) => item.id === state.pointerState.elementId);
  if (!element) return;

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
    const moveTargets = Array.isArray(state.pointerState.moveTargets) ? state.pointerState.moveTargets : [];
    if (!moveTargets.length) {
      const snapped = applyMoveSnap(element, state.pointerState.x + dx, state.pointerState.y + dy, [state.pointerState.elementId]);
      element.x = snapped.x;
      element.y = snapped.y;
      render();
      return;
    }

    const activeIds = state.pointerState.activeIds || moveTargets.map((item) => item.id);
    const primaryTarget = moveTargets.find((item) => item.id === state.pointerState.elementId) || moveTargets[0];
    const primaryElement = slide.elements.find((item) => item.id === primaryTarget.id);
    if (!primaryElement) return;

    const snapped = applyMoveSnap(primaryElement, primaryTarget.x + dx, primaryTarget.y + dy, activeIds);
    const nextDx = snapped.x - primaryTarget.x;
    const nextDy = snapped.y - primaryTarget.y;

    moveTargets.forEach(({ id, x, y }) => {
      const target = slide.elements.find((item) => item.id === id);
      if (!target) return;
      target.x = x + nextDx;
      target.y = y + nextDy;
    });

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

    if (h.includes('w') || h.includes('e')) {
      element.x = next.x;
    }
    if (h.includes('n') || h.includes('s')) {
      element.y = next.y;
    }

    render();
  }
}

function onPointerUp(event) {
  if (!state.pointerState) return;
  const shouldRecord = ['move', 'resize'].includes(state.pointerState.mode);

  if (state.pointerState.mode === 'edit-intent') {
    const { elementId } = state.pointerState;
    state.pointerState = null;
    openTextEditorForElement(elementId, event ? getPointerPosition(event) : null);
    return;
  }

  if (state.pointerState.mode === 'marquee') {
    const selectionRect = {
      x: state.pointerState.x,
      y: state.pointerState.y,
      width: state.pointerState.width,
      height: state.pointerState.height,
    };

    if (Number.isFinite(selectionRect.width) && Number.isFinite(selectionRect.height)
      && (selectionRect.width > 1 || selectionRect.height > 1)
    ) {
      const slide = currentSlide();
      const selected = slide.elements
        .filter((element) => {
          const bounds = getElementBounds(element);
          if (!bounds) return false;
          const hit = !(
            bounds.x + bounds.width < selectionRect.x ||
            bounds.x > selectionRect.x + selectionRect.width ||
            bounds.y + bounds.height < selectionRect.y ||
            bounds.y > selectionRect.y + selectionRect.height
          );
          return hit;
        })
        .map((element) => element.id);
      setSelectedElementIds(selected);
    } else {
      setSelectedElementIds([]);
    }

    state.pointerState = null;
    render();
    return;
  }

  state.pointerState = null;
  if (shouldRecord) {
    recordHistorySnapshot();
    saveLocal();
  }

  if (shouldRecord && (activeSnapGuide?.hasSnapX || activeSnapGuide?.hasSnapY)) {
    startSnapGuideFadeOut();
  }
}

function addElement(type) {
  const slide = currentSlide();
  const cx = 60;
  const cy = 60;
  const id = createId();

  if (type === 'text') {
    const textElement = {
      id,
      type,
      x: cx,
      y: cy,
      width: 260,
      height: 58,
      text: 'テキストを入力',
      fontSize: 32,
      fontFamily: DEFAULT_TEXT_FONT_FAMILY,
      fontWeight: 'normal',
      fontStyle: 'normal',
      lineSpacing: TEXT_LINE_SPACING_DEFAULT,
      letterSpacing: TEXT_LETTER_SPACING_DEFAULT,
      textIndent: TEXT_INDENT_DEFAULT,
      bulletType: TEXT_BULLET_DEFAULT,
      textAnchor: 'start',
      fill: '#111827',
    };
    normalizeTextElementProperties(textElement);
    syncTextElementHeightFromContent(textElement);
    slide.elements.push(textElement);
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

  setSelectedElementIds([id]);
  recordHistorySnapshot();
  render();
}

function newSlide() {
  state.slides.push(createEmptySlide(`スライド ${state.slides.length + 1}`));
  state.currentSlideIndex = state.slides.length - 1;
  setSelectedElementIds([]);
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
  setSelectedElementIds([]);
  recordHistorySnapshot();
  render();
}

function duplicateElement() {
  const selectedElements = getSelectedElementElements();
  if (!selectedElements.length) return;
  const slide = currentSlide();
  const copiedIds = [];
  selectedElements.forEach((source) => {
    const copy = JSON.parse(JSON.stringify(source));
    copy.id = createId();
    copy.x += 20;
    copy.y += 20;
    slide.elements.push(copy);
    copiedIds.push(copy.id);
  });
  setSelectedElementIds(copiedIds);
  recordHistorySnapshot();
  render();
}

function deleteElement() {
  const selectedIds = getSelectedElementIds();
  if (!selectedIds.length) return;
  const slide = currentSlide();
  slide.elements = slide.elements.filter((item) => !selectedIds.includes(item.id));
  setSelectedElementIds([]);
  recordHistorySnapshot();
  render();
}

function copySelectedElement() {
  const selectedElements = getSelectedElementElements();
  if (!selectedElements.length) return false;

  clipboardElements = JSON.parse(JSON.stringify(selectedElements));
  clipboardPasteOffset = 20;
  return true;
}

function cutSelectedElement() {
  const copied = copySelectedElement();
  if (!copied) return false;
  deleteElement();
  return true;
}

function pasteElementFromClipboard() {
  if (!clipboardElements.length) return false;
  const slide = currentSlide();
  const pastedIds = [];
  const offset = clipboardPasteOffset;
  const copies = JSON.parse(JSON.stringify(clipboardElements))
    .map((copy) => {
      copy.id = createId();
      const baseX = Number(copy.x);
      const baseY = Number(copy.y);
      copy.x = (Number.isFinite(baseX) ? baseX : 0) + offset;
      copy.y = (Number.isFinite(baseY) ? baseY : 0) + offset;
      normalizeTextElementProperties(copy);
      if (copy.type === 'text') {
        syncTextElementHeightFromContent(copy);
      }
      return copy;
    });

  for (const copy of copies) {
    slide.elements.push(copy);
    pastedIds.push(copy.id);
  }
  setSelectedElementIds(pastedIds);
  clipboardPasteOffset = offset + 20;
  recordHistorySnapshot();
  render();
  return true;
}

function closeTextEditorForGlobalShortcut() {
  if (!activeTextEditor) return;
  closeActiveTextEditor({ commit: true, rerender: false });
  if (state.pointerState) {
    state.pointerState = null;
  }
}

function setZOrder(direction) {
  const primaryId = getPrimarySelectedElementId();
  if (!primaryId) return;
  const slide = currentSlide();
  const index = slide.elements.findIndex((item) => item.id === primaryId);
  if (index < 0) return;

  const target = index + direction;
  if (target < 0 || target >= slide.elements.length) return;

  const [item] = slide.elements.splice(index, 1);
  slide.elements.splice(target, 0, item);
  recordHistorySnapshot();
  render();
}

function alignSelectedElements(mode) {
  const selectedElements = getSelectedElementElements();
  if (selectedElements.length < 2) return;

  const targets = selectedElements
    .map((item) => ({
      item,
      bounds: getElementBounds(item),
    }))
    .filter((entry) => Number.isFinite(entry.bounds.x)
      && Number.isFinite(entry.bounds.y)
      && Number.isFinite(entry.bounds.width)
      && Number.isFinite(entry.bounds.height));

  if (targets.length < 2) return;

  const reference = targets[0];
  const minX = Math.min(...targets.map((entry) => entry.bounds.x));
  const minY = Math.min(...targets.map((entry) => entry.bounds.y));
  const maxX = Math.max(...targets.map((entry) => entry.bounds.x + entry.bounds.width));
  const maxY = Math.max(...targets.map((entry) => entry.bounds.y + entry.bounds.height));
  const groupCenterX = (minX + maxX) / 2;
  const groupCenterY = (minY + maxY) / 2;

  if (mode === 'left') {
    targets.forEach(({ item }) => {
      item.x = minX;
    });
  } else if (mode === 'center') {
    targets.forEach(({ item, bounds }) => {
      item.x = groupCenterX - (bounds.width / 2);
    });
  } else if (mode === 'right') {
    targets.forEach(({ item, bounds }) => {
      item.x = maxX - bounds.width;
    });
  } else if (mode === 'top') {
    targets.forEach(({ item }) => {
      item.y = minY;
    });
  } else if (mode === 'middle') {
    targets.forEach(({ item, bounds }) => {
      item.y = groupCenterY - (bounds.height / 2);
    });
  } else if (mode === 'bottom') {
    targets.forEach(({ item, bounds }) => {
      item.y = maxY - bounds.height;
    });
  } else if (mode === 'distribute-h') {
    if (targets.length < 2) return;
    const sorted = [...targets].sort((a, b) => a.bounds.x - b.bounds.x);
    const totalWidth = sorted.reduce((sum, entry) => sum + entry.bounds.width, 0);
    const gap = (maxX - minX - totalWidth) / (sorted.length - 1);
    if (!Number.isFinite(gap)) return;

    let currentX = minX;
    for (const entry of sorted) {
      entry.item.x = currentX;
      currentX += entry.bounds.width + gap;
    }
  } else if (mode === 'distribute-v') {
    if (targets.length < 2) return;
    const sorted = [...targets].sort((a, b) => a.bounds.y - b.bounds.y);
    const totalHeight = sorted.reduce((sum, entry) => sum + entry.bounds.height, 0);
    const gap = (maxY - minY - totalHeight) / (sorted.length - 1);
    if (!Number.isFinite(gap)) return;

    let currentY = minY;
    for (const entry of sorted) {
      entry.item.y = currentY;
      currentY += entry.bounds.height + gap;
    }
  } else if (mode === 'equal-width') {
    const width = reference.bounds.width;
    targets.forEach(({ item }) => {
      item.width = width;
    });
  } else if (mode === 'equal-height') {
    const height = reference.bounds.height;
    targets.forEach(({ item }) => {
      item.height = height;
    });
  } else {
    return;
  }

  recordHistorySnapshot();
  render();
}

function renderProperties() {
  const slide = currentSlide();
  const selectedElements = getSelectedElementElements();
  const item = selectedElements[0] || null;
  if (item?.type === 'text') {
    normalizeTextElementProperties(item);
    ensureFontFamilySelectOption(item.fontFamily);
  }
  const editing = activeTextEditor ? slide.elements.find((e) => e.id === activeTextEditor.elementId) : null;
  const textPropertyControls = [
    dom.propFontSizeRow,
    dom.propTextAlignRow,
    dom.propFontFamilyRow,
    dom.propFontBoldRow,
    dom.propFontItalicRow,
    dom.propTextLineSpacingRow,
    dom.propTextLetterSpacingRow,
    dom.propTextIndentRow,
    dom.propTextBulletRow,
    dom.propTextRow,
  ];
  const setTextPropertyVisibility = (visible) => {
    textPropertyControls.forEach((node) => {
      if (node) {
        node.style.display = visible ? '' : 'none';
      }
    });
  };

  const hasSelection = selectedElements.length > 0;
  const canAlign = selectedElements.length >= 2;
  const isTextSelection = hasSelection && selectedElements.length === 1 && item?.type === 'text';
  const supportsFill = hasSelection && selectedElements.every((selected) => selected.type !== 'svg-fragment');
  const typeLabel = item ? (
    item.type === 'text'
      ? 'テキスト'
      : item.type === 'rect'
        ? '四角形'
        : item.type === 'circle'
          ? '円'
          : item.type === 'svg-fragment'
          ? 'SVG(高精度取り込み)'
          : '画像'
  ) : '';

  dom.selectedLabel.value = selectedElements.length > 1 ? `${selectedElements.length}個選択` : typeLabel;

  setTextPropertyVisibility(isTextSelection);
  dom.propFillLabel.textContent = isTextSelection ? '文字色' : '塗りつぶし';
  dom.propStrokeLabel.textContent = '枠色';
  dom.propFill.disabled = !supportsFill || !hasSelection;
  dom.propStroke.disabled = !supportsFill || !hasSelection;
  dom.propFontSize.disabled = !isTextSelection;
  dom.propTextAlign.disabled = !isTextSelection;
  dom.propFontFamily.disabled = !isTextSelection;
  dom.propFontBold.disabled = !isTextSelection;
  dom.propFontItalic.disabled = !isTextSelection;
  dom.propTextLineSpacing.disabled = !isTextSelection;
  dom.propTextLetterSpacing.disabled = !isTextSelection;
  dom.propTextIndent.disabled = !isTextSelection;
  dom.propTextBullet.disabled = !isTextSelection;
  dom.propText.disabled = !isTextSelection;
  dom.bringFront.disabled = !hasSelection;
  dom.sendBack.disabled = !hasSelection;
  dom.alignLeft.disabled = !canAlign;
  dom.alignCenter.disabled = !canAlign;
  dom.alignRight.disabled = !canAlign;
  dom.alignTop.disabled = !canAlign;
  dom.alignMiddle.disabled = !canAlign;
  dom.alignBottom.disabled = !canAlign;
  dom.alignDistributeH.disabled = !canAlign;
  dom.alignDistributeV.disabled = !canAlign;
  dom.alignEqualWidth.disabled = !canAlign;
  dom.alignEqualHeight.disabled = !canAlign;
  dom.duplicateElement.disabled = !hasSelection;
  dom.deleteElement.disabled = !hasSelection;

  if (!item) {
    dom.propFillLabel.textContent = '塗りつぶし';
    dom.propStrokeLabel.textContent = '枠色';
    dom.propFill.value = '#000000';
    dom.propStroke.value = '#000000';
    dom.propFontSize.value = '32';
    dom.propTextAlign.value = 'start';
    dom.propFontFamily.value = DEFAULT_TEXT_FONT_FAMILY;
    dom.propFontBold.checked = false;
    dom.propFontItalic.checked = false;
    dom.propTextLineSpacing.value = String(TEXT_LINE_SPACING_DEFAULT);
    dom.propTextLetterSpacing.value = String(TEXT_LETTER_SPACING_DEFAULT);
    dom.propTextIndent.value = String(TEXT_INDENT_DEFAULT);
    dom.propTextBullet.value = TEXT_BULLET_DEFAULT;
    dom.propText.value = '';
    return;
  }

  dom.propFill.value = item.fill || '#111827';
  dom.propStroke.value = item.stroke || '#0f2f56';
  if (selectedElements.length !== 1) {
    return;
  }
  dom.propFontSize.value = String(item.type === 'text' ? item.fontSize : 32);
  dom.propTextAlign.value = item.type === 'text' ? item.textAnchor : 'start';
  dom.propFontFamily.value = item.type === 'text'
    ? ensureFontFamilySelectOption(item.fontFamily)
    : ensureFontFamilySelectOption(DEFAULT_TEXT_FONT_FAMILY);
  dom.propFontBold.checked = item.type === 'text' ? item.fontWeight === 'bold' : false;
  dom.propFontItalic.checked = item.type === 'text' ? item.fontStyle === 'italic' : false;
  dom.propTextLineSpacing.value = String(normalizeTextLineSpacing(item.lineSpacing || TEXT_LINE_SPACING_DEFAULT));
  dom.propTextLetterSpacing.value = String(normalizeTextLetterSpacing(item.letterSpacing || TEXT_LETTER_SPACING_DEFAULT));
  dom.propTextIndent.value = String(normalizeTextIndent(item.textIndent || TEXT_INDENT_DEFAULT));
  dom.propTextBullet.value = normalizeTextBulletType(item.bulletType || TEXT_BULLET_DEFAULT);
  if (editing && editing.id === item.id) {
    dom.propText.value = activeTextEditor?.textarea?.value || '';
    dom.propText.disabled = true;
    return;
  }
  dom.propText.value = item.text || '';
}

function applyPropertyFromInputs(event) {
  const selectedElements = getSelectedElementElements();
  if (!selectedElements.length) return;
  const isTextSelection = selectedElements.length === 1 && selectedElements[0].type === 'text';
  const isStrokeInput = event?.target === dom.propStroke;

  for (const item of selectedElements) {
    if (item.type !== 'svg-fragment') {
      item.fill = dom.propFill.value;
      item.stroke = dom.propStroke.value;
      if (item.type === 'text' && isStrokeInput) {
        item.strokeWidth = Math.max(1, Number.isFinite(item.strokeWidth) ? item.strokeWidth : 1);
      }
    }
  }
  if (!isTextSelection) {
    recordHistorySnapshot();
    render();
    return;
  }

  const item = selectedElements[0];
  if (item.type === 'text') {
    item.fontSize = normalizeTextFontSize(dom.propFontSize.value);
    item.textAnchor = normalizeTextAlign(dom.propTextAlign.value || 'start');
    item.fontFamily = normalizeFontFamilyInputValue(dom.propFontFamily.value || DEFAULT_TEXT_FONT_FAMILY);
    item.fontWeight = normalizeTextFontWeight(dom.propFontBold.checked ? 'bold' : 'normal');
    item.fontStyle = normalizeTextFontStyle(dom.propFontItalic.checked ? 'italic' : 'normal');
    item.lineSpacing = normalizeTextLineSpacing(dom.propTextLineSpacing.value);
    item.letterSpacing = normalizeTextLetterSpacing(dom.propTextLetterSpacing.value);
    item.textIndent = normalizeTextIndent(dom.propTextIndent.value);
    item.bulletType = normalizeTextBulletType(dom.propTextBullet.value);
    ensureFontFamilySelectOption(item.fontFamily);
    syncTextElementHeightFromContent(item);
  }
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
    const nextSelectedIds = Array.isArray(loaded.selectedElementIds)
      ? loaded.selectedElementIds
      : loaded.selectedElementId
        ? [loaded.selectedElementId]
        : [];
    normalizeTextElementsInSlides(state.slides);
    setSelectedElementIds(nextSelectedIds);
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
      normalizeTextElementsInSlides(state.slides);
      state.currentSlideIndex = 0;
      setSelectedElementIds([]);
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
      setSelectedElementIds([slide.elements.at(-1)?.id].filter(Boolean));
      recordHistorySnapshot();
      render();
      return;
    }

    const parsed = scaleAndPositionImportedElements(elements, source);
    normalizeTextElementsInSlides([{ elements: parsed }]);
    const pastedIds = [];
    for (const item of parsed) {
      const element = { ...item, id: createId() };
      slide.elements.push(element);
      pastedIds.push(element.id);
    }
    setSelectedElementIds(pastedIds);
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
  setSelectedElementIds([]);
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
  dom.alignLeft?.addEventListener('click', () => alignSelectedElements('left'));
  dom.alignCenter?.addEventListener('click', () => alignSelectedElements('center'));
  dom.alignRight?.addEventListener('click', () => alignSelectedElements('right'));
  dom.alignTop?.addEventListener('click', () => alignSelectedElements('top'));
  dom.alignMiddle?.addEventListener('click', () => alignSelectedElements('middle'));
  dom.alignBottom?.addEventListener('click', () => alignSelectedElements('bottom'));
  dom.alignDistributeH?.addEventListener('click', () => alignSelectedElements('distribute-h'));
  dom.alignDistributeV?.addEventListener('click', () => alignSelectedElements('distribute-v'));
  dom.alignEqualWidth?.addEventListener('click', () => alignSelectedElements('equal-width'));
  dom.alignEqualHeight?.addEventListener('click', () => alignSelectedElements('equal-height'));

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
  dom.propTextAlign?.addEventListener('change', applyPropertyFromInputs);
  dom.propFontFamily?.addEventListener('change', applyPropertyFromInputs);
  dom.propFontBold?.addEventListener('change', applyPropertyFromInputs);
  dom.propFontItalic?.addEventListener('change', applyPropertyFromInputs);
  dom.propTextLineSpacing?.addEventListener('change', applyPropertyFromInputs);
  dom.propTextLetterSpacing?.addEventListener('change', applyPropertyFromInputs);
  dom.propTextIndent?.addEventListener('change', applyPropertyFromInputs);
  dom.propTextBullet?.addEventListener('change', applyPropertyFromInputs);
  dom.propText.addEventListener('input', applyPropertyFromInputs);

  dom.undoAction.addEventListener('click', () => {
    undoHistory();
  });

  dom.redoAction.addEventListener('click', () => {
    redoHistory();
  });

  dom.canvas.addEventListener('pointermove', onPointerMove);
  dom.canvas.addEventListener('pointerdown', onCanvasPointerDownForDeselect);
  dom.canvas.addEventListener('pointerup', onPointerUp);
  dom.canvas.addEventListener('pointercancel', onPointerUp);

  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointerdown', onCanvasPointerDownForDeselect);
  window.addEventListener('pointermove', onPointerMove);

  window.addEventListener('keydown', (event) => {
    const targetTag = document.activeElement?.tagName?.toLowerCase();
    const isTextControl = targetTag === 'input' || targetTag === 'textarea';
    const key = event.key?.toLowerCase();
    const isShortcut = event.metaKey || event.ctrlKey;
    const isUndoShortcut = (event.metaKey || event.ctrlKey) && !event.altKey && !isTextControl && key === 'z';
    const isRedoShortcut = (event.metaKey || event.ctrlKey) && !isTextControl && (key === 'y' || (event.shiftKey && key === 'z'));
    const isCopyShortcut = isShortcut && !isTextControl && key === 'c' && !event.altKey;
    const isCutShortcut = isShortcut && !isTextControl && key === 'x' && !event.altKey;
    const isPasteShortcut = isShortcut && !isTextControl && key === 'v' && !event.altKey;
    const isDeleteShortcut = !isTextControl && (event.key === 'Delete' || event.key === 'Backspace');

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

    if (isCopyShortcut) {
      event.preventDefault();
      closeTextEditorForGlobalShortcut();
      copySelectedElement();
      return;
    }

    if (isCutShortcut) {
      event.preventDefault();
      closeTextEditorForGlobalShortcut();
      cutSelectedElement();
      return;
    }

    if (isPasteShortcut) {
      event.preventDefault();
      closeTextEditorForGlobalShortcut();
      pasteElementFromClipboard();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      if (activeTextEditor) {
        closeActiveTextEditor({ commit: false, rerender: false });
        render();
        return;
      }

      if (hasSelection() || state.pointerState) {
        setSelectedElementIds([]);
        state.pointerState = null;
        render();
      }
      return;
    }

    if (activeTextEditor && event.key === 'Enter') {
      if (!isTextControl || (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) {
        closeActiveTextEditor({ commit: true, rerender: false });
      }
      return;
    }

    if (isDeleteShortcut) {
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
