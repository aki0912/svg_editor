(function (global) {
  const DEFAULT_TEXT_FONT_FAMILY = 'Arial, sans-serif';
  const TEXT_LINE_HEIGHT_RATIO = 1.3;
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

  function getTextLineHeight(fontSize) {
    const baseSize = Number(fontSize) || 32;
    return Math.max(16, Math.round(baseSize * TEXT_LINE_HEIGHT_RATIO));
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
    const ctx = getTextMeasureContext();
    const safeLine = line || '';
    const normalizedSize = Number(fontSize) || Number(element.fontSize) || 32;

    if (ctx) {
      ctx.font = buildTextFontDescription({
        ...element,
        fontSize: normalizedSize,
      });
      return Math.max(1, ctx.measureText(safeLine).width);
    }

    const avg = /[^\x00-\x7F]/.test(safeLine) ? 1 : 0.62;
    return Math.max(1, safeLine.length * Math.max(6, normalizedSize * avg));
  }

  function getTextOffsetForLine(line, targetX, ctx, element = {}) {
    const safeLine = line || '';
    if (!safeLine || targetX <= 0) return 0;
    if (!ctx) {
      const approxCharWidth = getTextLineWidth(safeLine, element.fontSize, element) / safeLine.length;
      const estimate = Math.round(targetX / Math.max(1, approxCharWidth));
      return clamp(estimate, 0, safeLine.length);
    }

    let left = 0;
    let right = safeLine.length;
    while (left < right) {
      const mid = (left + right) >> 1;
      const measured = ctx.measureText(safeLine.slice(0, mid)).width;
      if (measured < targetX) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }
    if (left > 0 && left < safeLine.length) {
      const widthBefore = ctx.measureText(safeLine.slice(0, left - 1)).width;
      const widthAt = ctx.measureText(safeLine.slice(0, left)).width;
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
    const lineHeight = getTextLineHeight(fontSize);
    const textAnchor = element.textAnchor || 'start';
    const elementX = Number(element.x) || 0;
    const elementWidth = Number(element.width);
    const anchorX = textAnchor === 'middle'
      ? elementX + (Number.isFinite(elementWidth) ? elementWidth / 2 : 0)
      : textAnchor === 'end'
        ? elementX + (Number.isFinite(elementWidth) ? elementWidth : 0)
        : elementX;
    const cursorLine = clamp(
      Math.floor((point.y - Number(element.y) - fontSize * 0.25) / lineHeight),
      0,
      lines.length - 1,
    );

    const measuredLineWidths = lines.map((line) => getTextLineWidth(line, fontSize, element));
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
    const localOffset = getTextOffsetForLine(currentLine, clampedX, ctx, {
      ...element,
      fontSize,
    });

    let offset = 0;
    for (let i = 0; i < cursorLine; i += 1) {
      offset += (lines[i] || '').length + 1;
    }

    return clamp(offset + localOffset, 0, (element.text || '').length);
  }

  function estimateTextBoxMetrics(text, fontSize = 32, options = {}) {
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
    const height = Math.max(16, Math.round(getTextLineHeight(lineFontSize) * Math.max(1, lines.length)));

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
