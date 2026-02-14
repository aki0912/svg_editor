import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import elementCommandsModule from '../src/commands/elementCommands.js';

const {
  getTextAlignCssValue,
  getTextLineHeight,
  estimateTextBoxMetrics,
  getTextCaretOffsetFromPoint,
  buildTextFontDescription,
  normalizeFontFamilyValue,
} = elementCommandsModule;

describe('elementCommands text helpers', () => {
  it('maps text-anchor to CSS text-align values', () => {
    assert.equal(getTextAlignCssValue('start'), 'left');
    assert.equal(getTextAlignCssValue('middle'), 'center');
    assert.equal(getTextAlignCssValue('end'), 'right');
    assert.equal(getTextAlignCssValue('unknown'), 'left');
  });

  it('calculates text line height by ratio', () => {
    assert.equal(getTextLineHeight(20), 26);
    assert.equal(getTextLineHeight(1), 16);
  });

  it('builds font description string for canvas measure', () => {
    const text = buildTextFontDescription({
      fontStyle: 'italic',
      fontWeight: '700',
      fontSize: 28,
      fontFamily: 'Times, serif',
    });
    assert.equal(text, 'italic 700 28px Times, serif');
  });

  it('normalizes font family with spaces for safe rendering', () => {
    const normalized = normalizeFontFamilyValue('Yu Gothic, sans-serif');
    assert.equal(normalized, '"Yu Gothic", sans-serif');
  });

  it('keeps quoted font family list valid for rendering', () => {
    const normalized = normalizeFontFamilyValue('"Yu Gothic", sans-serif');
    assert.equal(normalized, '"Yu Gothic", sans-serif');
  });

  it('normalizes quoted whole-value font family', () => {
    const normalized = normalizeFontFamilyValue('"Yu Gothic, sans-serif"');
    assert.equal(normalized, '"Yu Gothic, sans-serif"');
  });

  it('estimates multiline text box size', () => {
    const metrics = estimateTextBoxMetrics('hello\nworld', 24);
    assert.equal(metrics.width >= 40, true);
    assert.equal(metrics.height, 62);
  });

  it('calculates caret offset for multi-line text', () => {
    const element = {
      text: 'abc\ndef',
      x: 0,
      y: 0,
      fontSize: 10,
      fontFamily: 'Arial, sans-serif',
      fontWeight: 'normal',
      fontStyle: 'normal',
      textAnchor: 'start',
    };
    const firstLineOffset = getTextCaretOffsetFromPoint(element, { x: 0, y: 4 });
    const secondLineOffset = getTextCaretOffsetFromPoint(element, { x: 0, y: 30 });
    const farRightOffset = getTextCaretOffsetFromPoint(element, { x: 1000, y: 30 });

    assert.equal(firstLineOffset, 0);
    assert.equal(secondLineOffset, 4);
    assert.equal(farRightOffset, 7);
  });
});
