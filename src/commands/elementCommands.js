(function (global) {
  const DEFAULT_TEXT_FONT_FAMILY = 'Arial, sans-serif';
  const TEXT_LINE_HEIGHT_RATIO = 1.3;
  const DEFAULT_TEXT_BULLET_TYPE = 'none';
  const TEXT_BULLET_TYPES = new Set(['none', 'bullet', 'number']);
  let textMeasureContext = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function toNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function getTextMeasureContext() {
    if (typeof document === 'undefined' || !document?.createElement) return null;

    if (!textMeasureContext) {
      const canvas = document.createElement('canvas');
      textMeasureContext = canvas.getContext('2d');
    }

    return textMeasureContext;
  }

  function normalizeTextLineSpacing(value, fallback = TEXT_LINE_HEIGHT_RATIO) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
  }

  function normalizeTextLetterSpacing(value, fallback = 0) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return parsed;
  }

  function normalizeTextIndent(value, fallback = 0) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return parsed;
  }

  function normalizeTextBulletType(value, fallback = DEFAULT_TEXT_BULLET_TYPE) {
    if (typeof value === 'string' && TEXT_BULLET_TYPES.has(value)) return value;
    return fallback;
  }

  function resolveTextLineOptions(element = {}) {
    return {
      lineSpacing: normalizeTextLineSpacing(element.lineSpacing, TEXT_LINE_HEIGHT_RATIO),
      letterSpacing: normalizeTextLetterSpacing(element.letterSpacing, 0),
      textIndent: normalizeTextIndent(element.textIndent, 0),
      bulletType: normalizeTextBulletType(element.bulletType, DEFAULT_TEXT_BULLET_TYPE),
    };
  }

  function getTextLinePrefix(lineIndex = 0, bulletType = DEFAULT_TEXT_BULLET_TYPE) {
    if (bulletType === 'bullet') return '• ';
    if (bulletType === 'number') return `${lineIndex + 1}. `;
    return '';
  }

  function buildTextDisplayLine(line = '', lineIndex = 0, element = {}) {
    const { bulletType } = resolveTextLineOptions(element);
    const prefix = getTextLinePrefix(lineIndex, bulletType);
    return {
      text: `${prefix}${line || ''}`,
      prefix,
      prefixLength: prefix.length,
    };
  }

  function getTextLineHeight(fontSize, lineSpacing = TEXT_LINE_HEIGHT_RATIO) {
    const baseSize = Number(fontSize) || 32;
    const spacing = normalizeTextLineSpacing(lineSpacing, TEXT_LINE_HEIGHT_RATIO);
    return Math.max(16, Math.round(baseSize * spacing));
  }

  function getTextAlignCssValue(textAnchor) {
    if (textAnchor === 'middle') return 'center';
    if (textAnchor === 'end') return 'right';
    return 'left';
  }

  function normalizeFontFamilyValue(fontFamily = '') {
    const rawFontFamily = String(fontFamily || '').trim();
    if (!rawFontFamily) return DEFAULT_TEXT_FONT_FAMILY;

    const normalizedTokens = splitFontFamilyTokens(rawFontFamily)
      .map((family) => family.trim())
      .filter(Boolean)
      .map((family) => {
        if (!family) return '';

        const unwrapped = unwrapFontFamilyToken(family);
        if (!unwrapped) return '';
        if (/\s/.test(unwrapped)) {
          const escaped = unwrapped.replace(/"/g, '\\"');
          return `"${escaped}"`;
        }

        return unwrapped;
      })
      .filter(Boolean)
      .join(', ');

    return normalizedTokens || DEFAULT_TEXT_FONT_FAMILY;
  }

  function splitFontFamilyTokens(fontFamily) {
    const items = [];
    let current = '';
    let quote = null;
    let escaped = false;

    for (let i = 0; i < fontFamily.length; i += 1) {
      const ch = fontFamily[i];

      if (escaped) {
        current += ch;
        escaped = false;
        continue;
      }

      if (ch === '\\') {
        current += ch;
        escaped = true;
        continue;
      }

      if (quote) {
        if (ch === quote) {
          current += ch;
          quote = null;
          continue;
        }
      } else if (ch === '"' || ch === '\'') {
        quote = ch;
        current += ch;
        continue;
      }

      if (!quote && ch === ',') {
        items.push(current);
        current = '';
        continue;
      }

      current += ch;
    }

    items.push(current);
    return items;
  }

  function unwrapFontFamilyToken(token) {
    const target = String(token || '').trim();
    if (!target) return '';

    const wrappedInDoubleQuotes = target.startsWith('"') && target.endsWith('"') && target.length >= 2;
    const wrappedInSingleQuotes = target.startsWith("'") && target.endsWith("'") && target.length >= 2;

    if (target.length >= 2 && (wrappedInDoubleQuotes || wrappedInSingleQuotes)) {
      return target.slice(1, -1).trim();
    }
    return target;
  }

  function buildTextFontDescription(element = {}) {
    const size = Number(element.fontSize) || 32;
    const fontFamily = normalizeFontFamilyValue(element.fontFamily || DEFAULT_TEXT_FONT_FAMILY);
    return [
      element.fontStyle || 'normal',
      element.fontWeight || 'normal',
      `${size}px`,
      fontFamily,
    ].join(' ');
  }

  function getTextLineWidth(line, fontSize = 32, element = {}) {
    const lineOptions = resolveTextLineOptions(element);
    const lineIndex = Number.isInteger(element.__lineIndex) ? element.__lineIndex : 0;
    const { text } = buildTextDisplayLine(line, lineIndex, lineOptions);
    const lineLetterSpacing = lineOptions.letterSpacing;
    const ctx = getTextMeasureContext();
    const safeLine = String(text);
    const normalizedSize = Number(fontSize) || Number(element.fontSize) || 32;
    const letterSpacingWidth = Math.max(0, safeLine.length - 1) * lineLetterSpacing;

    if (ctx) {
      ctx.font = buildTextFontDescription({
        ...element,
        fontSize: normalizedSize,
      });
      return Math.max(1, ctx.measureText(safeLine).width + letterSpacingWidth);
    }

    const avg = /[^\x00-\x7F]/.test(safeLine) ? 1 : 0.62;
    const baseWidth = Math.max(1, safeLine.length * Math.max(6, normalizedSize * avg));
    return Math.max(1, baseWidth + letterSpacingWidth);
  }

  function getTextOffsetForLine(line, targetX, ctx, element = {}) {
    const safeLine = line || '';
    if (!safeLine || targetX <= 0) return 0;
    const lineOptions = resolveTextLineOptions(element);
    const letterSpacing = lineOptions.letterSpacing;
    const fallbackFontSize = Number(element.fontSize) || 32;
    const measure = (value) => {
      if (!ctx) return getTextLineWidth(value, fallbackFontSize, {
        ...element,
        ...lineOptions,
      });

      ctx.font = buildTextFontDescription({
        ...element,
        ...lineOptions,
      });
      return ctx.measureText(value).width + Math.max(0, value.length - 1) * letterSpacing;
    };

    if (!ctx) {
      const approxCharWidth = measure(safeLine) / safeLine.length;
      const estimate = Math.round(targetX / Math.max(1, approxCharWidth));
      return clamp(estimate, 0, safeLine.length);
    }

    let left = 0;
    let right = safeLine.length;
    while (left < right) {
      const mid = (left + right) >> 1;
      const measured = measure(safeLine.slice(0, mid));
      if (measured < targetX) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }
    if (left > 0 && left < safeLine.length) {
      const widthBefore = measure(safeLine.slice(0, left - 1));
      const widthAt = measure(safeLine.slice(0, left));
      if (Math.abs(targetX - widthBefore) > Math.abs(widthAt - targetX)) {
        return left;
      }
      return left - 1;
    }
    return clamp(left, 0, safeLine.length);
  }

  function getTextCaretOffsetFromPoint(element, point) {
    if (!element || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return (element?.text || '').length;
    }

    const lines = (element.text || '').split('\n');
    if (!lines.length) return 0;

    const fontSize = Number(element.fontSize) || 32;
    const lineOptions = resolveTextLineOptions(element);
    const lineHeight = getTextLineHeight(fontSize, lineOptions.lineSpacing);
    const textAnchor = element.textAnchor || 'start';
    const textIndent = lineOptions.textIndent;
    const elementX = Number(element.x) || 0;
    const elementWidth = Number(element.width);
    const anchorX = (textAnchor === 'middle'
      ? elementX + (Number.isFinite(elementWidth) ? elementWidth / 2 : 0)
      : textAnchor === 'end'
        ? elementX + (Number.isFinite(elementWidth) ? elementWidth : 0)
        : elementX) + textIndent;
    const cursorLine = clamp(
      Math.floor((point.y - Number(element.y) - fontSize * 0.25) / lineHeight),
      0,
      lines.length - 1,
    );

    const measuredLineWidths = lines.map((line, index) => getTextLineWidth(line, fontSize, {
      ...element,
      ...lineOptions,
      __lineIndex: index,
    }));
    const currentLine = lines[cursorLine] || '';
    const currentLineWidth = Math.max(1, measuredLineWidths[cursorLine] || getTextLineWidth(currentLine, fontSize, element));

    let x = point.x - anchorX;
    if (textAnchor === 'middle') {
      x -= (currentLineWidth + 1) / 2;
    } else if (textAnchor === 'end') {
      x -= currentLineWidth;
    }

    const ctx = getTextMeasureContext();
    const clampedX = Math.max(0, x);
    const currentLineDisplay = buildTextDisplayLine(currentLine, cursorLine, lineOptions);
    const localOffset = getTextOffsetForLine(currentLine, clampedX, ctx, {
      ...element,
      ...lineOptions,
      __lineIndex: cursorLine,
      fontSize,
    });
    const displayOffset = Math.max(0, localOffset - currentLineDisplay.prefixLength);

    let offset = 0;
    for (let i = 0; i < cursorLine; i += 1) {
      offset += (lines[i] || '').length + 1;
    }

    const baseOffset = Math.max(0, Math.min(displayOffset, currentLine.length));
    return clamp(offset + baseOffset, 0, (element.text || '').length);
  }

  function estimateTextBoxMetrics(text, fontSize = 32, options = {}) {
    const lineOptions = resolveTextLineOptions(options);
    const lines = (text || '').split('\n');
    const lineFontSize = Number(fontSize) || 32;
    const textElement = {
      fontFamily: options.fontFamily || DEFAULT_TEXT_FONT_FAMILY,
      fontWeight: options.fontWeight || 'normal',
      fontStyle: options.fontStyle || 'normal',
      ...lineOptions,
      fontSize: lineFontSize,
    };
    const lineWidths = lines.map((line, index) => {
      const measuredWidth = getTextLineWidth(line, lineFontSize, {
        ...textElement,
        __lineIndex: index,
      });
      return measuredWidth + Math.max(0, lineOptions.textIndent);
    });
    const width = Math.max(40, Math.round(Math.max(...lineWidths)));
    const height = Math.max(16, Math.round(getTextLineHeight(lineFontSize, lineOptions.lineSpacing) * Math.max(1, lines.length)));

    return {
      width,
      height,
    };
  }

  const api = {
    DEFAULT_TEXT_FONT_FAMILY,
    TEXT_LINE_HEIGHT_RATIO,
    getTextLineHeight,
    getTextAlignCssValue,
    buildTextFontDescription,
    buildTextDisplayLine,
    getTextLineWidth,
    getTextOffsetForLine,
    getTextCaretOffsetFromPoint,
    estimateTextBoxMetrics,
    normalizeFontFamilyValue,
    __internals: {
      getTextMeasureContext,
      clamp,
      toNumber,
    },
  };

  if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = api;
  }

  global.EditorElementCommands = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
