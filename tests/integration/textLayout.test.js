import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import textLayoutModule from '../../src/commands/textLayout.js';

const {
  convertTopToSvgTextY,
  parseSvgTextElements,
  roundtripTextElements,
  createTextEditSession,
  computeTextEditLines,
  getTextLineHeight,
  finalizeTextEdit,
  hasFontLayoutChanged,
  getAnchorAlignedTextStartX,
  buildDecoratedTextLines,
} = textLayoutModule;

function assertNear(actual, expected, epsilon = 0.001) {
  assert.equal(Math.abs(actual - expected) <= epsilon, true);
}

describe('text layout integration (T-001 ~ T-010)', () => {
  it('T-001 SVGインポート時にテキストY座標が元ファイルと一致する', () => {
    // 失敗理由(旧): SVGのy値をbaselineではなくtopとして扱い、再計算時にズレていた。
    const svg = '<svg><text x="100" y="200" font-size="50">title</text></svg>';
    const [text] = parseSvgTextElements(svg);
    const restoredY = convertTopToSvgTextY(text.y, text.fontSize, text.dominantBaseline, text.alignmentBaseline);
    assertNear(restoredY, 200);
  });

  it('T-002 dominant-baseline差異があっても表示位置が崩れない', () => {
    // 失敗理由(旧): baseline種別ごとの補正量が統一されず、同じ見た目位置が一致しなかった。
    const svg = `
      <svg>
        <text id="a" x="10" y="100" font-size="40" dominant-baseline="hanging">A</text>
        <text id="b" x="10" y="132" font-size="40" dominant-baseline="alphabetic">B</text>
      </svg>
    `;
    const [a, b] = parseSvgTextElements(svg);
    assertNear(a.y, 100);
    assertNear(b.y, 100);
  });

  it('T-003 SVGエクスポート再インポートでテキスト位置がドリフトしない', () => {
    // 失敗理由(旧): import/exportでbaseline設定が揃わず、往復でy座標が累積変化した。
    const svg = `
      <svg>
        <text id="t1" x="50" y="240" font-size="36">sample</text>
        <text id="t2" x="60" y="300" font-size="28" dominant-baseline="middle">middle baseline</text>
      </svg>
    `;
    const { imported, reparsed } = roundtripTextElements(svg, { width: 960, height: 540 });
    assert.equal(imported.length, reparsed.length);
    for (let i = 0; i < imported.length; i += 1) {
      assertNear(imported[i].x, reparsed[i].x);
      assertNear(imported[i].y, reparsed[i].y);
      assert.equal(imported[i].text, reparsed[i].text);
    }
  });

  it('T-004 20260213154623.svgの主要テキスト位置差が許容範囲内', () => {
    // 失敗理由(旧): 実案件SVGで基準ベースラインが混在した際に主要テキストが上下に崩れた。
    const fixturePath = new URL('../fixtures/svg/20260213154623.svg', import.meta.url);
    const fixtureSvg = readFileSync(fixturePath, 'utf8');
    const texts = parseSvgTextElements(fixtureSvg);
    const byId = new Map(texts.map((item) => [item.sourceId, item]));
    const expectedTop = {
      title: 44.8,
      subtitle: 160,
      section: 234,
      outlook: 302,
    };

    for (const [id, expected] of Object.entries(expectedTop)) {
      assert.equal(byId.has(id), true);
      assertNear(byId.get(id).y, expected, 0.01);
    }
  });

  it('T-005 単一行テキスト編集開始時に表示位置がジャンプしない', () => {
    // 失敗理由(旧): 編集用オーバーレイの起点が描画起点と異なり、編集開始で位置が跳ねた。
    const element = {
      type: 'text',
      x: 120,
      y: 210,
      width: 340,
      height: 70,
      text: 'テキストを入力',
      fontSize: 48,
    };
    const session = createTextEditSession(element);
    assertNear(session.overlay.x, 120);
    assertNear(session.overlay.y, 210);
    assertNear(session.textOrigin.x, 120);
    assertNear(session.textOrigin.y, 210);
  });

  it('T-006 複数行テキスト編集開始時に行頭と行間が維持される', () => {
    // 失敗理由(旧): 複数行編集時の行高さが描画と不一致で、行頭位置がずれた。
    const element = {
      type: 'text',
      x: 80,
      y: 100,
      text: '1行目\n2行目\n3行目',
      fontSize: 24,
      lineSpacing: 1.5,
      textIndent: 12,
    };
    const lines = computeTextEditLines(element);
    const lineHeight = getTextLineHeight(24, 1.5);
    assert.equal(lines.length, 3);
    assertNear(lines[0].x, 92);
    assertNear(lines[1].y - lines[0].y, lineHeight);
    assertNear(lines[2].y - lines[1].y, lineHeight);
  });

  it('T-007 テキスト編集確定後に高さ再計算されても上端基準が維持される', () => {
    // 失敗理由(旧): 編集確定後の高さ再計算でy座標まで更新され、上端が移動していた。
    const base = {
      type: 'text',
      x: 100,
      y: 180,
      width: 220,
      height: 40,
      text: '短文',
      fontSize: 32,
      lineSpacing: 1.3,
    };
    const updated = finalizeTextEdit(base, '長い文章です\n2行目');
    assertNear(updated.y, 180);
    assert.equal(updated.height > base.height, true);
  });

  it('T-008 日本語フォント変更時にもレイアウト差分が反映される', () => {
    // 失敗理由(旧): 日本語フォント変更を差分判定できず、再描画トリガーが発火しなかった。
    const previous = { fontFamily: '"Yu Gothic", sans-serif', fontSize: 42, fontWeight: 'normal' };
    const next = { fontFamily: '"MS PGothic", sans-serif', fontSize: 42, fontWeight: 'normal' };
    assert.equal(hasFontLayoutChanged(previous, next), true);
  });

  it('T-009 textAnchor start/middle/end の描画位置とキャレット起点が整合する', () => {
    // 失敗理由(旧): middle/endの編集時にx起点計算がstart固定で、キャレットがずれていた。
    const lineWidth = 120;
    assertNear(getAnchorAlignedTextStartX({ x: 20, width: 300, textAnchor: 'start' }, lineWidth), 20);
    assertNear(getAnchorAlignedTextStartX({ x: 20, width: 300, textAnchor: 'middle' }, lineWidth), 110);
    assertNear(getAnchorAlignedTextStartX({ x: 20, width: 300, textAnchor: 'end' }, lineWidth), 200);
  });

  it('T-010 箇条書き・番号付き・インデント適用時に表示と内部値が一致する', () => {
    // 失敗理由(旧): 箇条書き表示文字列と内部テキストの対応が崩れ、編集時に内容不整合が起きた。
    const bullet = buildDecoratedTextLines('項目A\n項目B', { bulletType: 'bullet', textIndent: 24 });
    const number = buildDecoratedTextLines('項目A\n項目B', { bulletType: 'number', textIndent: 24 });
    assert.equal(bullet[0].rawText, '項目A');
    assert.equal(bullet[0].displayText, '• 項目A');
    assert.equal(number[1].displayText, '2. 項目B');
    assert.equal(number[1].textIndent, 24);
  });
});
