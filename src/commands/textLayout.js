const DEFAULT_FONT_SIZE = 32;
const DEFAULT_FONT_FAMILY = 'Arial, sans-serif';
const DEFAULT_LINE_SPACING = 1.3;
const DEFAULT_BASELINE = 'alphabetic';

const BASELINE_ALIAS = {
  auto: 'alphabetic',
  baseline: 'alphabetic',
  'text-before-edge': 'hanging',
  'text-top': 'hanging',
  top: 'hanging',
  center: 'middle',
  central: 'middle',
  'text-after-edge': 'text-bottom',
  'text-bottom': 'text-bottom',
  ideographic: 'text-bottom',
  bottom: 'text-bottom',
};

const BASELINE_ASCENT_RATIO = {
  hanging: 0,
  middle: 0.5,
  'text-bottom': 1,
  alphabetic: 0.8,
};

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNonEmptyString(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function decodeXml(value) {
  return String(value ?? '')
    .replace(/&apos;/g, '\'')
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
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

function normalizeBaseline(value, fallback = DEFAULT_BASELINE) {
  const raw = toNonEmptyString(value, '').toLowerCase();
  if (!raw) return fallback;
  const normalized = BASELINE_ALIAS[raw] || raw;
  if (BASELINE_ASCENT_RATIO[normalized] != null) return normalized;
  return fallback;
}

function normalizeFontFamily(value, fallback = DEFAULT_FONT_FAMILY) {
  const raw = toNonEmptyString(value, '');
  if (!raw) return fallback;
  return raw;
}

function normalizeTextAnchor(value) {
  const raw = toNonEmptyString(value, 'start').toLowerCase();
  if (raw === 'middle' || raw === 'end' || raw === 'start') return raw;
  return 'start';
}

function resolveBaseline(dominantBaseline, alignmentBaseline) {
  const dominant = normalizeBaseline(dominantBaseline, '');
  if (dominant) return dominant;
  const alignment = normalizeBaseline(alignmentBaseline, '');
  if (alignment) return alignment;
  return DEFAULT_BASELINE;
}

function estimateTextBaselineAscent(fontSize = DEFAULT_FONT_SIZE, baseline = DEFAULT_BASELINE) {
  const safeFontSize = Math.max(1, toNumber(fontSize, DEFAULT_FONT_SIZE));
  const normalizedBaseline = normalizeBaseline(baseline, DEFAULT_BASELINE);
  const ratio = BASELINE_ASCENT_RATIO[normalizedBaseline] ?? BASELINE_ASCENT_RATIO.alphabetic;
  return safeFontSize * ratio;
}

function convertSvgTextYToTop(y, fontSize, dominantBaseline, alignmentBaseline) {
  const safeY = toNumber(y, 0);
  const baseline = resolveBaseline(dominantBaseline, alignmentBaseline);
  const ascent = estimateTextBaselineAscent(fontSize, baseline);
  return safeY - ascent;
}

function convertTopToSvgTextY(top, fontSize, dominantBaseline, alignmentBaseline) {
  const safeTop = toNumber(top, 0);
  const baseline = resolveBaseline(dominantBaseline, alignmentBaseline);
  const ascent = estimateTextBaselineAscent(fontSize, baseline);
  return safeTop + ascent;
}

function getTextLineHeight(fontSize = DEFAULT_FONT_SIZE, lineSpacing = DEFAULT_LINE_SPACING) {
  const safeFontSize = Math.max(1, toNumber(fontSize, DEFAULT_FONT_SIZE));
  const safeLineSpacing = toNumber(lineSpacing, DEFAULT_LINE_SPACING);
  return Math.max(16, Math.round(safeFontSize * (safeLineSpacing > 0 ? safeLineSpacing : DEFAULT_LINE_SPACING)));
}

function estimateTextWidth(text, fontSize = DEFAULT_FONT_SIZE) {
  const safeText = String(text ?? '');
  if (!safeText) return 40;
  const safeFontSize = Math.max(1, toNumber(fontSize, DEFAULT_FONT_SIZE));
  const lines = safeText.split('\n');
  let maxWidth = 0;
  for (const line of lines) {
    const nonAsciiCount = Array.from(line).filter((char) => char.charCodeAt(0) > 127).length;
    const asciiCount = Math.max(0, line.length - nonAsciiCount);
    const width = (nonAsciiCount * safeFontSize) + (asciiCount * safeFontSize * 0.62);
    maxWidth = Math.max(maxWidth, width);
  }
  return Math.max(40, Math.round(maxWidth));
}

function estimateTextHeight(text, fontSize = DEFAULT_FONT_SIZE, lineSpacing = DEFAULT_LINE_SPACING) {
  const lines = String(text ?? '').split('\n');
  const lineCount = Math.max(1, lines.length);
  return Math.max(16, getTextLineHeight(fontSize, lineSpacing) * lineCount);
}

function extractTextNodeText(rawBody = '') {
  return decodeXml(rawBody.replace(/<[^>]*>/g, '')).trim();
}

function extractTextNodeLines(rawBody = '') {
  const tspanRegex = /<tspan\b([^>]*)>([\s\S]*?)<\/tspan>/gi;
  const lines = [];
  let match = tspanRegex.exec(rawBody);
  while (match) {
    const attrs = parseTagAttributes(match[1]);
    const lineText = extractTextNodeText(match[2]);
    lines.push({
      x: attrs.x,
      y: attrs.y,
      dy: attrs.dy,
      text: lineText,
    });
    match = tspanRegex.exec(rawBody);
  }
  return lines;
}

function parseSvgTextElements(svgString = '') {
  const textRegex = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
  const elements = [];
  let index = 0;
  let match = textRegex.exec(String(svgString ?? ''));

  while (match) {
    const attrs = parseTagAttributes(match[1]);
    const rawBody = match[2] || '';
    const tspanLines = extractTextNodeLines(rawBody);

    const fontSize = Math.max(1, toNumber(attrs['font-size'], DEFAULT_FONT_SIZE));
    const lineSpacing = toNumber(attrs['data-line-spacing'], DEFAULT_LINE_SPACING) || DEFAULT_LINE_SPACING;
    const dominantBaseline = attrs['dominant-baseline'] ?? '';
    const alignmentBaseline = attrs['alignment-baseline'] ?? '';
    const textAnchor = normalizeTextAnchor(attrs['text-anchor']);

    const firstTspan = tspanLines[0] || null;
    const textX = toNumber(firstTspan?.x ?? attrs.x, 0);
    const textY = toNumber(firstTspan?.y ?? attrs.y, 0);
    const textTop = convertSvgTextYToTop(textY, fontSize, dominantBaseline, alignmentBaseline);
    const text = tspanLines.length > 0
      ? tspanLines.map((line) => line.text).join('\n')
      : extractTextNodeText(rawBody);

    const width = toNumber(attrs.width, estimateTextWidth(text, fontSize));
    const height = toNumber(attrs.height, estimateTextHeight(text, fontSize, lineSpacing));

    index += 1;
    elements.push({
      id: toNonEmptyString(attrs['data-id'] || attrs.id, `text-${index}`),
      sourceId: toNonEmptyString(attrs.id, ''),
      type: 'text',
      x: textX,
      y: textTop,
      width,
      height,
      text,
      fontSize,
      fontFamily: normalizeFontFamily(attrs['font-family']),
      fontWeight: toNonEmptyString(attrs['font-weight'], 'normal'),
      fontStyle: toNonEmptyString(attrs['font-style'], 'normal'),
      textAnchor,
      dominantBaseline: normalizeBaseline(dominantBaseline, DEFAULT_BASELINE),
      alignmentBaseline: normalizeBaseline(alignmentBaseline, DEFAULT_BASELINE),
      lineSpacing,
      letterSpacing: toNumber(attrs['letter-spacing'], 0),
      textIndent: toNumber(attrs['text-indent'], 0),
      bulletType: toNonEmptyString(attrs['data-bullet-type'], 'none'),
    });

    match = textRegex.exec(String(svgString ?? ''));
  }

  return elements;
}

function formatNumber(value) {
  const safe = toNumber(value, 0);
  const rounded = Math.round(safe * 1000) / 1000;
  if (Number.isInteger(rounded)) return String(rounded);
  return String(rounded);
}

function normalizedToSvgBaseline(normalizedBaseline) {
  if (normalizedBaseline === 'hanging') return 'hanging';
  if (normalizedBaseline === 'middle') return 'middle';
  if (normalizedBaseline === 'text-bottom') return 'text-after-edge';
  return 'alphabetic';
}

function buildDecoratedTextLines(text = '', options = {}) {
  const bulletType = toNonEmptyString(options.bulletType, 'none');
  const textIndent = toNumber(options.textIndent, 0);
  const lines = String(text ?? '').split('\n');
  return lines.map((rawText, index) => {
    const prefix = bulletType === 'bullet'
      ? '• '
      : bulletType === 'number'
        ? `${index + 1}. `
        : '';
    return {
      index,
      rawText,
      displayText: `${prefix}${rawText}`,
      prefix,
      textIndent,
    };
  });
}

function exportTextElementsToSvg(elements = [], options = {}) {
  const width = Math.max(1, toNumber(options.width, 1366));
  const height = Math.max(1, toNumber(options.height, 768));
  const nodes = [];

  for (const element of elements) {
    if (!element || element.type !== 'text') continue;
    const fontSize = Math.max(1, toNumber(element.fontSize, DEFAULT_FONT_SIZE));
    const baseline = normalizeBaseline(element.dominantBaseline, DEFAULT_BASELINE);
    const baselineY = convertTopToSvgTextY(element.y, fontSize, baseline, element.alignmentBaseline);
    const textAnchor = normalizeTextAnchor(element.textAnchor);
    const lineSpacing = toNumber(element.lineSpacing, DEFAULT_LINE_SPACING) || DEFAULT_LINE_SPACING;
    const lineHeight = getTextLineHeight(fontSize, lineSpacing);
    const lines = String(element.text ?? '').split('\n');
    const textId = toNonEmptyString(element.sourceId || element.id, '');

    const attrs = [
      `x="${formatNumber(element.x)}"`,
      `y="${formatNumber(baselineY)}"`,
      `font-size="${formatNumber(fontSize)}"`,
      `font-family="${escapeXml(normalizeFontFamily(element.fontFamily))}"`,
      `font-weight="${escapeXml(toNonEmptyString(element.fontWeight, 'normal'))}"`,
      `font-style="${escapeXml(toNonEmptyString(element.fontStyle, 'normal'))}"`,
      `text-anchor="${textAnchor}"`,
      `dominant-baseline="${normalizedToSvgBaseline(baseline)}"`,
      `alignment-baseline="${baseline === 'text-bottom' ? 'text-after-edge' : baseline}"`,
      `data-bullet-type="${escapeXml(toNonEmptyString(element.bulletType, 'none'))}"`,
      `data-line-spacing="${formatNumber(lineSpacing)}"`,
      `letter-spacing="${formatNumber(toNumber(element.letterSpacing, 0))}"`,
      `text-indent="${formatNumber(toNumber(element.textIndent, 0))}"`,
      `width="${formatNumber(toNumber(element.width, estimateTextWidth(element.text, fontSize)))}"`,
      `height="${formatNumber(toNumber(element.height, estimateTextHeight(element.text, fontSize, lineSpacing)))}"`,
    ];
    if (textId) attrs.push(`id="${escapeXml(textId)}"`);
    attrs.push(`data-id="${escapeXml(toNonEmptyString(element.id, textId || 'text'))}"`);

    if (lines.length <= 1) {
      nodes.push(`<text ${attrs.join(' ')}>${escapeXml(lines[0] ?? '')}</text>`);
      continue;
    }

    const tspans = lines.map((line, index) => {
      if (index === 0) {
        return `<tspan x="${formatNumber(element.x)}">${escapeXml(line)}</tspan>`;
      }
      return `<tspan x="${formatNumber(element.x)}" dy="${formatNumber(lineHeight)}">${escapeXml(line)}</tspan>`;
    }).join('');
    nodes.push(`<text ${attrs.join(' ')}>${tspans}</text>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${formatNumber(width)} ${formatNumber(height)}">${nodes.join('')}</svg>`;
}

function roundtripTextElements(svgString = '', options = {}) {
  const imported = parseSvgTextElements(svgString);
  const exported = exportTextElementsToSvg(imported, options);
  const reparsed = parseSvgTextElements(exported);
  return { imported, exported, reparsed };
}

function createTextEditSession(element = {}) {
  const lineSpacing = toNumber(element.lineSpacing, DEFAULT_LINE_SPACING) || DEFAULT_LINE_SPACING;
  const fontSize = Math.max(1, toNumber(element.fontSize, DEFAULT_FONT_SIZE));
  const text = String(element.text ?? '');
  const width = toNumber(element.width, estimateTextWidth(text, fontSize));
  const height = toNumber(element.height, estimateTextHeight(text, fontSize, lineSpacing));
  const lineHeight = getTextLineHeight(fontSize, lineSpacing);
  const lines = buildDecoratedTextLines(text, {
    bulletType: element.bulletType,
    textIndent: element.textIndent,
  });

  return {
    overlay: {
      x: toNumber(element.x, 0),
      y: toNumber(element.y, 0),
      width,
      height,
    },
    textOrigin: {
      x: toNumber(element.x, 0),
      y: toNumber(element.y, 0),
    },
    lineHeight,
    lines,
  };
}

function computeTextEditLines(element = {}) {
  const session = createTextEditSession(element);
  return session.lines.map((line) => ({
    ...line,
    x: session.textOrigin.x + line.textIndent,
    y: session.textOrigin.y + (session.lineHeight * line.index),
    lineHeight: session.lineHeight,
  }));
}

function finalizeTextEdit(element = {}, nextText = '') {
  const lineSpacing = toNumber(element.lineSpacing, DEFAULT_LINE_SPACING) || DEFAULT_LINE_SPACING;
  const fontSize = Math.max(1, toNumber(element.fontSize, DEFAULT_FONT_SIZE));
  const width = estimateTextWidth(nextText, fontSize);
  const height = estimateTextHeight(nextText, fontSize, lineSpacing);
  return {
    ...element,
    text: String(nextText ?? ''),
    width: Math.max(toNumber(element.width, 0), width),
    height,
    y: toNumber(element.y, 0),
  };
}

function normalizeFontKey(fontFamily) {
  return normalizeFontFamily(fontFamily)
    .replace(/["']/g, '')
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
    .join(',');
}

function hasFontLayoutChanged(previousElement = {}, nextElement = {}) {
  return (
    normalizeFontKey(previousElement.fontFamily) !== normalizeFontKey(nextElement.fontFamily)
    || toNumber(previousElement.fontSize, DEFAULT_FONT_SIZE) !== toNumber(nextElement.fontSize, DEFAULT_FONT_SIZE)
    || toNonEmptyString(previousElement.fontWeight, 'normal') !== toNonEmptyString(nextElement.fontWeight, 'normal')
    || toNonEmptyString(previousElement.fontStyle, 'normal') !== toNonEmptyString(nextElement.fontStyle, 'normal')
    || toNumber(previousElement.letterSpacing, 0) !== toNumber(nextElement.letterSpacing, 0)
  );
}

function getAnchorAlignedTextStartX(element = {}, lineWidth = 0) {
  const x = toNumber(element.x, 0);
  const width = toNumber(element.width, lineWidth);
  const indent = toNumber(element.textIndent, 0);
  const safeLineWidth = Math.max(0, toNumber(lineWidth, 0));
  const textAnchor = normalizeTextAnchor(element.textAnchor);

  if (textAnchor === 'middle') {
    return x + ((width - safeLineWidth) / 2) + indent;
  }
  if (textAnchor === 'end') {
    return x + width - safeLineWidth + indent;
  }
  return x + indent;
}

export {
  DEFAULT_FONT_SIZE,
  DEFAULT_FONT_FAMILY,
  DEFAULT_LINE_SPACING,
  DEFAULT_BASELINE,
  normalizeBaseline,
  resolveBaseline,
  estimateTextBaselineAscent,
  convertSvgTextYToTop,
  convertTopToSvgTextY,
  getTextLineHeight,
  parseSvgTextElements,
  exportTextElementsToSvg,
  roundtripTextElements,
  createTextEditSession,
  computeTextEditLines,
  finalizeTextEdit,
  hasFontLayoutChanged,
  getAnchorAlignedTextStartX,
  buildDecoratedTextLines,
};

export default {
  DEFAULT_FONT_SIZE,
  DEFAULT_FONT_FAMILY,
  DEFAULT_LINE_SPACING,
  DEFAULT_BASELINE,
  normalizeBaseline,
  resolveBaseline,
  estimateTextBaselineAscent,
  convertSvgTextYToTop,
  convertTopToSvgTextY,
  getTextLineHeight,
  parseSvgTextElements,
  exportTextElementsToSvg,
  roundtripTextElements,
  createTextEditSession,
  computeTextEditLines,
  finalizeTextEdit,
  hasFontLayoutChanged,
  getAnchorAlignedTextStartX,
  buildDecoratedTextLines,
};
