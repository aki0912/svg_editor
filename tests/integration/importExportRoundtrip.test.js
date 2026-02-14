import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import editorLogicModule from '../../src/commands/editorLogic.js';

const {
  exportStateToJson,
  importStateFromJson,
  exportElementsToSvg,
  importElementsFromSvg,
  roundtripImageElement,
  restoreStateFromStorage,
  updateSelectionOnPointerDown,
} = editorLogicModule;

describe('import/export and UI state integration (T-031 ~ T-036)', () => {
  it('T-031 JSONエクスポート/インポートで全プロパティが保持される', () => {
    // 失敗理由(旧): JSON復元時に任意プロパティが欠落し、再編集で情報が失われた。
    const state = {
      slides: [{
        id: 's1',
        name: 'slide',
        elements: [{
          id: 't1',
          type: 'text',
          x: 100,
          y: 200,
          width: 320,
          height: 70,
          text: 'テキスト',
          fontFamily: '"Yu Gothic", sans-serif',
          fontSize: 40,
          textAnchor: 'middle',
          lineSpacing: 1.4,
          customProp: 'keep',
        }],
      }],
      currentSlideIndex: 0,
      selectedElementIds: ['t1'],
      metadata: { version: 3 },
    };

    const json = exportStateToJson(state);
    const restored = importStateFromJson(json);
    assert.deepEqual(restored, state);
  });

  it('T-032 SVGエクスポートで主要図形とテキスト属性が保持される', () => {
    // 失敗理由(旧): SVG出力で図形属性の一部が欠落し、再利用時に見た目が崩れた。
    const elements = [
      {
        id: 'r1',
        type: 'rect',
        x: 10,
        y: 20,
        width: 180,
        height: 90,
        fill: '#ffeeee',
        stroke: '#112233',
        strokeWidth: 3,
      },
      {
        id: 'e1',
        type: 'ellipse',
        x: 240,
        y: 40,
        width: 120,
        height: 80,
        fill: '#ddeeff',
        stroke: '#224466',
        strokeWidth: 2,
      },
      {
        id: 't1',
        type: 'text',
        x: 400,
        y: 160,
        width: 280,
        height: 50,
        text: '見出し',
        fontSize: 42,
        fontFamily: '"Yu Gothic", sans-serif',
        fontWeight: '700',
        textAnchor: 'start',
        dominantBaseline: 'alphabetic',
      },
    ];
    const svg = exportElementsToSvg(elements, { width: 960, height: 540 });
    assert.equal(svg.includes('<rect'), true);
    assert.equal(svg.includes('fill="#ffeeee"'), true);
    assert.equal(svg.includes('<ellipse'), true);
    assert.equal(svg.includes('<text'), true);
    assert.equal(svg.includes('font-size="42"'), true);
    assert.equal(svg.includes('text-anchor="start"'), true);

    const imported = importElementsFromSvg(svg);
    const importedTypes = new Set(imported.map((item) => item.type));
    assert.equal(importedTypes.has('rect'), true);
    assert.equal(importedTypes.has('ellipse'), true);
    assert.equal(importedTypes.has('text'), true);
  });

  it('T-033 画像要素のサイズ・位置が往復で維持される', () => {
    // 失敗理由(旧): image要素のx/y/size復元漏れで往復時に画像が移動・拡縮された。
    const image = {
      id: 'img-1',
      type: 'image',
      x: 120,
      y: 90,
      width: 400,
      height: 220,
      href: 'data:image/png;base64,abcd',
    };
    const imported = roundtripImageElement(image);
    assert.equal(imported.type, 'image');
    assert.equal(imported.href, image.href);
    assert.equal(imported.x, image.x);
    assert.equal(imported.y, image.y);
    assert.equal(imported.width, image.width);
    assert.equal(imported.height, image.height);
  });

  it('T-034 localStorage復元時に選択状態が安全に初期化される', () => {
    // 失敗理由(旧): 復元後に古い選択IDが残留し、存在しない要素参照で例外が出た。
    const raw = JSON.stringify({
      slides: [{ id: 's1', elements: [{ id: 'a' }] }],
      currentSlideIndex: 99,
      selectedElementIds: ['ghost'],
      selectedElementId: 'ghost',
      editingTextId: 'ghost',
    });
    const restored = restoreStateFromStorage(raw);
    assert.equal(restored.currentSlideIndex, 0);
    assert.deepEqual(restored.selectedElementIds, []);
    assert.equal(restored.selectedElementId, null);
    assert.equal(restored.editingTextId, null);
  });

  it('T-035 プロパティパネル操作中に選択解除が起きない', () => {
    // 失敗理由(旧): プロパティ操作もキャンバスクリック扱いになり、選択が外れて調整不能だった。
    const state = {
      selectedElementIds: ['obj-1'],
      slides: [],
      currentSlideIndex: 0,
    };
    const next = updateSelectionOnPointerDown(state, { targetType: 'property-panel' });
    assert.deepEqual(next.selectedElementIds, ['obj-1']);
  });

  it('T-036 キャンバス空白クリックで解除し、オブジェクトクリックで選択維持する', () => {
    // 失敗理由(旧): 空白クリックとオブジェクトクリックが同一分岐で、選択遷移が不正だった。
    const selected = {
      selectedElementIds: ['obj-1'],
      slides: [],
      currentSlideIndex: 0,
    };
    const afterCanvas = updateSelectionOnPointerDown(selected, { targetType: 'canvas-empty' });
    assert.deepEqual(afterCanvas.selectedElementIds, []);

    const afterObject = updateSelectionOnPointerDown(afterCanvas, {
      targetType: 'object',
      elementId: 'obj-2',
      shiftKey: false,
    });
    assert.deepEqual(afterObject.selectedElementIds, ['obj-2']);
  });
});
