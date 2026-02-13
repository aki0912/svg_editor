const SVG_NS = 'http://www.w3.org/2000/svg';
const STORAGE_KEY = 'svg_ppt_like_state_v1';
const SVG_IMPORT_PADDING_RATIO = 0;

const state = {
  slides: [createEmptySlide('スライド 1')],
  currentSlideIndex: 0,
  selectedElementId: null,
  pointerState: null,
};

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
  saveState: document.getElementById('save-state'),
  loadState: document.getElementById('load-state'),
  resetState: document.getElementById('reset-state'),
  exportJSON: document.getElementById('export-json'),
  importJSON: document.getElementById('import-json'),
  importJSONButton: document.getElementById('import-json-button'),
  importSVG: document.getElementById('import-svg'),
  exportSVG: document.getElementById('export-svg'),
  importSVGButton: document.getElementById('import-svg-button'),
  selectedLabel: document.getElementById('selected-label'),
  propFill: document.getElementById('prop-fill'),
  propStroke: document.getElementById('prop-stroke'),
  propFontSize: document.getElementById('prop-font-size'),
  propText: document.getElementById('prop-text'),
  bringFront: document.getElementById('bring-front'),
  sendBack: document.getElementById('send-back'),
  instructions: document.getElementById('instructions'),
};

function createId() {
  return (crypto.randomUUID && crypto.randomUUID()) || `id-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
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

  const rects = Array.from(svgRoot.querySelectorAll('rect'));
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
];

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
  return serializer.serializeToString(cloned);
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
  const translateOnly = transform.match(/^\s*translate\([^)]*\)\s*$/i);
  if (!translateOnly) return null;

  const match = transform.match(/translate\(([^)]+)\)/i);
  if (!match || !match[1]) return null;

  const numbers = match[1]
    .split(/[,\s]+/)
    .map((item) => Number.parseFloat(item))
    .filter((item) => Number.isFinite(item));

  return {
    x: numbers[0] || 0,
    y: numbers.length > 1 ? numbers[1] : 0,
  };
}

function parseCumulativeTranslate(node, svgRoot) {
  let current = node;
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
  if (tag === 'polyline' || tag === 'polygon') return getPointsBounds(node);
  return getNodeBBox(node);
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

  const elements = [];
  let cursorY = baseY;
  let lineIndex = 0;

  for (const span of allChildren) {
    const text = (span.textContent || '').trim();
    if (!text) continue;

    const spanX = parseNumber(span.getAttribute('x'), baseX);
    const spanYAttr = span.getAttribute('y');
    const spanDY = parseNumber(span.getAttribute('dy'), 0);
    const spanFontSize = parseNumber(getNodeStyleValue(span, 'font-size', baseFontSize, svgRoot), baseFontSize);
    const fontFamily = getNodeStyleValue(span, 'font-family', baseFontFamily, svgRoot);
    const fill = getNodeStyleValue(span, 'fill', baseFill, svgRoot);
    const stroke = getNodeStyleValue(span, 'stroke', 'none', svgRoot);
    const strokeWidth = parseNumber(getNodeStyleValue(span, 'stroke-width', 0, svgRoot), 0);

    if (lineIndex > 0) cursorY += spanDY;
    if (lineIndex === 0 && spanYAttr === null && spanDY !== 0) cursorY = baseY + spanDY;
    if (spanYAttr !== null) cursorY = parseNumber(spanYAttr, cursorY);

    elements.push({
      type: 'text',
      x: spanX + transformOffset.x,
      y: cursorY + transformOffset.y - spanFontSize,
      width: Math.max(24, text.length * spanFontSize * 0.65),
      height: spanFontSize + 14,
      text,
      fontSize: spanFontSize,
      fontFamily,
      fill,
      textAnchor: getNodeStyleValue(span, 'text-anchor', baseTextAnchor, svgRoot),
          dominantBaseline: getNodeStyleValue(span, 'dominant-baseline', baseDominantBaseline, svgRoot),
      alignmentBaseline: getNodeStyleValue(span, 'alignment-baseline', baseAlignmentBaseline, svgRoot),
      stroke,
      strokeWidth,
    });

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
  const nodes = Array.from(svgRoot.querySelectorAll('*'));
  for (const node of nodes) {
    const tag = node.tagName.toLowerCase();
    if (!allowed.has(tag)) return false;
    const transform = node.getAttribute('transform');
    if (transform && !/^\s*translate\([^)]*\)\s*$/i.test(transform.trim())) return false;
    if (!parseTranslateTransform(node)) return false;
    if (hasUnsupportedVisualEffect(node, svgRoot)) return false;
  }

  return true;
}

function parseSVGElements(svgRoot) {
  const source = parseSVGSourceSize(svgRoot);
  const parsed = [];
  const backgroundInfo = detectCanvasBackground(svgRoot, source);
  const nodes = Array.from(svgRoot.querySelectorAll('rect,circle,ellipse,path,line,polygon,polyline,text,image'));

  for (const node of nodes) {
    const tag = node.tagName.toLowerCase();
    const transformOffset = parseCumulativeTranslate(node, svgRoot);
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
        x: box.x + transformOffset.x,
        y: box.y + transformOffset.y,
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
        const x = box ? box.x + transformOffset.x : parseNumber(node.getAttribute('x'), 0) + transformOffset.x;
        const fontSize = parseNumber(getNodeStyleValue(node, 'font-size', 18, svgRoot), 18);
        const estimatedText = (node.textContent || '').trim() || 'text';
        const y = box
          ? box.y + transformOffset.y
          : parseNumber(node.getAttribute('y'), 0) + transformOffset.y - fontSize;
        const width = Math.max(12, box ? box.width : Math.max(40, estimatedText.length * fontSize * 0.65));
        const height = Math.max(12, box ? box.height : fontSize + 16);
        const nodeText = createSVGFragmentFromNode(node, svgRoot);
        const sourceWidth = Math.max(1, box ? box.width : width);
        const sourceHeight = Math.max(1, box ? box.height : height);
        const sourceMinX = box ? box.x : x;
        const sourceMinY = box ? box.y : y;

        parsed.push({
          type: 'svg-fragment',
          x,
          y,
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

function render() {
  renderSlideList();
  renderCanvas();
  renderProperties();
  dom.slideTitle.textContent = `${currentSlide().title} (${state.currentSlideIndex + 1}/${state.slides.length})`;
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
  g.addEventListener('dblclick', () => onElementDoubleClick(el.id));
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
    handle.style.cursor = key.includes('n') || key.includes('s') ? 'ns-resize' : key.includes('e') || key.includes('w') ? 'ew-resize' : 'nwse-resize';
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

function onElementPointerDown(event, elementId) {
  if (event.button === 2) return;
  event.preventDefault();

  const slide = currentSlide();
  const element = slide.elements.find((item) => item.id === elementId);
  if (!element) return;

  state.selectedElementId = elementId;
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
  const slide = currentSlide();
  const element = slide.elements.find((item) => item.id === elementId);
  if (!element || element.type !== 'text') return;

  const value = prompt('テキストを編集してください', element.text || '');
  if (value === null) return;
  element.text = value;
  render();
}

function onPointerMove(event) {
  if (!state.pointerState) return;

  const slide = currentSlide();
  const element = slide.elements.find((item) => item.id === state.pointerState.elementId);
  if (!element) return;

  const p = getPointerPosition(event);
  const dx = p.x - state.pointerState.start.x;
  const dy = p.y - state.pointerState.start.y;

  if (state.pointerState.mode === 'move') {
    element.x = state.pointerState.x + dx;
    element.y = state.pointerState.y + dy;
    render();
    return;
  }

  if (state.pointerState.mode === 'resize') {
    const h = state.pointerState.handle;
    const b = {
      x: state.pointerState.x,
      y: state.pointerState.y,
      width: state.pointerState.width,
      height: state.pointerState.height,
    };

    const next = { ...b };

    if (h.includes('w')) {
      next.x = Math.min(b.x + b.width - 20, p.x);
      next.width = Math.max(20, b.width - (next.x - b.x));
    }
    if (h.includes('e')) {
      next.width = Math.max(20, b.width + dx);
    }
    if (h.includes('n')) {
      next.y = Math.min(b.y + b.height - 20, p.y);
      next.height = Math.max(20, b.height - (next.y - b.y));
    }
    if (h.includes('s')) {
      next.height = Math.max(20, b.height + dy);
    }

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

function onPointerUp() {
  if (!state.pointerState) return;
  state.pointerState = null;
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
  render();
}

function newSlide() {
  state.slides.push(createEmptySlide(`スライド ${state.slides.length + 1}`));
  state.currentSlideIndex = state.slides.length - 1;
  state.selectedElementId = null;
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
  render();
}

function removeCurrentSlide() {
  if (state.slides.length <= 1) return;
  const isCurrentSelected = state.currentSlideIndex;
  state.slides = state.slides.filter((_, index) => index !== state.currentSlideIndex);
  state.currentSlideIndex = Math.min(isCurrentSelected, state.slides.length - 1);
  state.selectedElementId = null;
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
  render();
}

function deleteElement() {
  if (!state.selectedElementId) return;
  const slide = currentSlide();
  slide.elements = slide.elements.filter((item) => item.id !== state.selectedElementId);
  state.selectedElementId = null;
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
  render();
}

function renderProperties() {
  const slide = currentSlide();
  const item = slide.elements.find((item) => item.id === state.selectedElementId);

  dom.selectedLabel.value = item ? `${item.type.toUpperCase()}` : '';

  const hasSelection = Boolean(item);
  const supportsFill = item && !['svg-fragment'].includes(item.type);
  dom.propFill.disabled = !supportsFill || !hasSelection;
  dom.propStroke.disabled = !supportsFill || !hasSelection;
  dom.propFontSize.disabled = !hasSelection || item?.type !== 'text';
  dom.propText.disabled = !hasSelection || item?.type !== 'text';
  dom.bringFront.disabled = !hasSelection;
  dom.sendBack.disabled = !hasSelection;
  dom.duplicateElement.disabled = !hasSelection;
  dom.deleteElement.disabled = !hasSelection;

  if (!item) {
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
  dom.propText.value = item.text || '';
}

function applyPropertyFromInputs() {
  const slide = currentSlide();
  const item = slide.elements.find((item) => item.id === state.selectedElementId);
  if (!item) return;

  if (item.type !== 'svg-fragment') {
    item.fill = dom.propFill.value;
    item.stroke = dom.propStroke.value;
  }
  item.fontSize = Number(dom.propFontSize.value || 32);
  if (item.type === 'text') item.text = dom.propText.value;
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
      render();
      return;
    }

    const parsed = scaleAndPositionImportedElements(elements, source);
    for (const item of parsed) {
      const element = { ...item, id: createId() };
      slide.elements.push(element);
      state.selectedElementId = element.id;
    }
    render();
  };

  reader.onerror = () => {
    alert('SVGの読み込みに失敗しました');
  };

  reader.readAsText(file);
}

function exportSVG() {
  const serialized = new XMLSerializer().serializeToString(dom.canvas);
  const slide = currentSlide();
  const header = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  const fullSvg = `${header}<svg xmlns="${SVG_NS}" width="${slide.width}" height="${slide.height}" viewBox="0 0 ${slide.width} ${slide.height}">${serialized.split('>')[1]}`;
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

  dom.saveState.addEventListener('click', () => {
    saveLocal();
    alert('保存しました');
  });
  dom.loadState.addEventListener('click', () => {
    loadLocal();
    render();
  });
  dom.resetState.addEventListener('click', resetState);
  dom.exportJSON.addEventListener('click', exportJSON);
  dom.importJSONButton.addEventListener('click', () => {
    dom.importJSON.click();
  });
  dom.importSVG.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    importSVGFromInput(file);
    event.target.value = '';
  });
  dom.importSVGButton.addEventListener('click', () => {
    dom.importSVG.click();
  });
  dom.exportSVG.addEventListener('click', exportSVG);
  dom.importJSON.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    importJSONFromInput(file);
    event.target.value = '';
  });

  dom.propFill.addEventListener('input', applyPropertyFromInputs);
  dom.propStroke.addEventListener('input', applyPropertyFromInputs);
  dom.propFontSize.addEventListener('input', applyPropertyFromInputs);
  dom.propText.addEventListener('input', applyPropertyFromInputs);

  dom.canvas.addEventListener('pointermove', onPointerMove);
  dom.canvas.addEventListener('pointerup', onPointerUp);
  dom.canvas.addEventListener('pointercancel', onPointerUp);

  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointermove', onPointerMove);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      const targetTag = document.activeElement?.tagName?.toLowerCase();
      if (targetTag === 'input' || targetTag === 'textarea') return;
      deleteElement();
    }
  });
}

function bootstrap() {
  loadLocal();
  setupEvents();
  render();
}

bootstrap();
