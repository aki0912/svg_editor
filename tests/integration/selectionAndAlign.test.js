import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import historyModule from '../../src/commands/history.js';
import editorLogicModule from '../../src/commands/editorLogic.js';

const { createHistoryManager } = historyModule;
const {
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
} = editorLogicModule;

function assertNear(actual, expected, epsilon = 0.001) {
  assert.equal(Math.abs(actual - expected) <= epsilon, true);
}

describe('selection and align integration (T-011 ~ T-026)', () => {
  it('T-011 Shift+クリックの多選択トグルが期待どおりに動作する', () => {
    // 失敗理由(旧): Shift+クリック時にトグルされず常に単一選択へ上書きされていた。
    const step1 = toggleSelection(['a'], 'b', true);
    const step2 = toggleSelection(step1, 'a', true);
    assert.deepEqual(step1, ['a', 'b']);
    assert.deepEqual(step2, ['b']);
  });

  it('T-012 マーキー選択で複数要素が安定して選択できる', () => {
    // 失敗理由(旧): マーキー座標の正規化がなく、ドラッグ方向で選択結果が変化していた。
    const elements = [
      { id: 'a', x: 40, y: 40, width: 100, height: 80 },
      { id: 'b', x: 200, y: 60, width: 100, height: 80 },
      { id: 'c', x: 460, y: 60, width: 100, height: 80 },
    ];
    const selected = marqueeSelect(elements, { x1: 320, y1: 200, x2: 20, y2: 20 });
    assert.deepEqual(selected, ['a', 'b']);
  });

  it('T-013 複数選択移動時に全要素が同じΔで移動する', () => {
    // 失敗理由(旧): 複数移動時に先頭要素のみ更新され、他要素が追従しなかった。
    const elements = [
      { id: 'a', x: 10, y: 20, width: 30, height: 30 },
      { id: 'b', x: 50, y: 60, width: 30, height: 30 },
      { id: 'c', x: 90, y: 100, width: 30, height: 30 },
    ];
    const moved = moveSelectedElements(elements, ['a', 'c'], 15, -8);
    assert.deepEqual(moved.map((item) => ({ id: item.id, x: item.x, y: item.y })), [
      { id: 'a', x: 25, y: 12 },
      { id: 'b', x: 50, y: 60 },
      { id: 'c', x: 105, y: 92 },
    ]);
  });

  it('T-014 複数選択削除/複製が選択状態を壊さない', () => {
    // 失敗理由(旧): 複製後の選択集合が元IDのまま残り、削除で意図しない要素が消えていた。
    const idFactory = (() => {
      let seq = 1;
      return () => `n${seq++}`;
    })();
    const base = [
      { id: 'a', x: 10, y: 10, width: 20, height: 20 },
      { id: 'b', x: 40, y: 10, width: 20, height: 20 },
    ];
    const duplicated = duplicateSelectedElements(base, ['a', 'b'], { idFactory });
    assert.deepEqual(duplicated.selectedElementIds, ['n1', 'n2']);
    const deleted = deleteSelectedElements(duplicated.elements, duplicated.selectedElementIds);
    assert.equal(deleted.elements.length, 2);
    assert.deepEqual(deleted.selectedElementIds, []);
  });

  it('T-015 左/中央/右/上/下揃えの結果が幾何的に正しい', () => {
    // 失敗理由(旧): 整列基準が選択範囲ではなく個別要素基準で計算されていた。
    const elements = [
      { id: 'a', x: 10, y: 20, width: 50, height: 20 },
      { id: 'b', x: 90, y: 40, width: 30, height: 30 },
      { id: 'c', x: 160, y: 10, width: 20, height: 10 },
    ];
    const ids = ['a', 'b', 'c'];

    const left = alignSelectedElements(elements, ids, 'left');
    assert.deepEqual(left.map((item) => item.x), [10, 10, 10]);

    const center = alignSelectedElements(elements, ids, 'center');
    assertNear(center[0].x, 70);
    assertNear(center[1].x, 80);
    assertNear(center[2].x, 85);

    const right = alignSelectedElements(elements, ids, 'right');
    assert.deepEqual(right.map((item) => item.x), [130, 150, 160]);

    const top = alignSelectedElements(elements, ids, 'top');
    assert.deepEqual(top.map((item) => item.y), [10, 10, 10]);

    const bottom = alignSelectedElements(elements, ids, 'bottom');
    assert.deepEqual(bottom.map((item) => item.y), [50, 40, 60]);
  });

  it('T-016 均等配置（横/縦）の間隔が等間隔になる', () => {
    // 失敗理由(旧): 中央要素の間隔計算で要素サイズ分を考慮せず、見かけの余白が不均等だった。
    const horizontal = [
      { id: 'a', x: 20, y: 0, width: 20, height: 20 },
      { id: 'b', x: 80, y: 0, width: 20, height: 20 },
      { id: 'c', x: 180, y: 0, width: 20, height: 20 },
    ];
    const distributedH = distributeSelectedElements(horizontal, ['a', 'b', 'c'], 'horizontal');
    const gapH1 = distributedH[1].x - (distributedH[0].x + distributedH[0].width);
    const gapH2 = distributedH[2].x - (distributedH[1].x + distributedH[1].width);
    assertNear(gapH1, gapH2);

    const vertical = [
      { id: 'a', x: 0, y: 20, width: 20, height: 20 },
      { id: 'b', x: 0, y: 90, width: 20, height: 20 },
      { id: 'c', x: 0, y: 200, width: 20, height: 20 },
    ];
    const distributedV = distributeSelectedElements(vertical, ['a', 'b', 'c'], 'vertical');
    const gapV1 = distributedV[1].y - (distributedV[0].y + distributedV[0].height);
    const gapV2 = distributedV[2].y - (distributedV[1].y + distributedV[1].height);
    assertNear(gapV1, gapV2);
  });

  it('T-017 同幅/同高の整列結果が全要素で一致する', () => {
    // 失敗理由(旧): 参照サイズの固定化がなく、後続要素に前要素の変更値が連鎖していた。
    const elements = [
      { id: 'a', x: 0, y: 0, width: 120, height: 40 },
      { id: 'b', x: 0, y: 0, width: 80, height: 60 },
      { id: 'c', x: 0, y: 0, width: 60, height: 90 },
    ];
    const ids = ['a', 'b', 'c'];
    const matchedWidth = matchSelectedElementSize(elements, ids, 'width');
    assert.deepEqual(matchedWidth.map((item) => item.width), [120, 120, 120]);
    const matchedHeight = matchSelectedElementSize(elements, ids, 'height');
    assert.deepEqual(matchedHeight.map((item) => item.height), [40, 40, 40]);
  });

  it('T-018 リサイズ時スナップで固定辺が勝手に移動しない', () => {
    // 失敗理由(旧): 左辺リサイズ時のスナップ適用で右辺座標まで変化していた。
    const element = { id: 'a', x: 101, y: 100, width: 79, height: 40 };
    const fixedRight = element.x + element.width;
    const resized = resizeElementWithHandle(element, 'w', 13, 0, { snapGrid: 10, minWidth: 10 });
    const rightAfter = resized.x + resized.width;
    assertNear(rightAfter, fixedRight);
  });

  it('T-019 左上ハンドルリサイズ時の原点安定性を保証する', () => {
    // 失敗理由(旧): 左上ハンドル操作時に右下固定点が揺れて、リサイズ挙動が不安定だった。
    const element = { id: 'a', x: 100, y: 100, width: 80, height: 60 };
    const fixedRight = element.x + element.width;
    const fixedBottom = element.y + element.height;
    const resized = resizeElementWithHandle(element, 'nw', 22, 18, { snapGrid: 10, minWidth: 10, minHeight: 10 });
    assertNear(resized.x + resized.width, fixedRight);
    assertNear(resized.y + resized.height, fixedBottom);
  });

  it('T-020 線/矢印の回転時に端点計算が破綻しない', () => {
    // 失敗理由(旧): 回転角の正規化不足で端点がNaNとなり描画不能になった。
    const arrow = { id: 'arrow-1', type: 'arrow', x: 200, y: 200, width: 140, height: 0, rotation: 0 };
    const rotated = rotateArrowTowardPoint(arrow, { x: 260, y: 330 });
    const endpoints = computeArrowEndpoints(rotated);
    assert.equal(Number.isFinite(endpoints.start.x), true);
    assert.equal(Number.isFinite(endpoints.start.y), true);
    assert.equal(Number.isFinite(endpoints.end.x), true);
    assert.equal(Number.isFinite(endpoints.end.y), true);
  });

  it('T-021 矢印先端と回転ハンドル位置が常に向きと一致する', () => {
    // 失敗理由(旧): 回転ハンドルを固定方向に描画しており、矢印向きと一致しなかった。
    const arrowRight = { id: 'r', type: 'arrow', x: 100, y: 100, width: 120, height: 0, rotation: 0 };
    const rightEnd = computeArrowEndpoints(arrowRight).end;
    const rightHandle = getArrowRotationHandlePosition(arrowRight, 30);
    assert.equal(rightHandle.x > rightEnd.x, true);
    assertNear(rightHandle.y, rightEnd.y);

    const arrowDown = { id: 'd', type: 'arrow', x: 100, y: 100, width: 120, height: 0, rotation: 90 };
    const downEnd = computeArrowEndpoints(arrowDown).end;
    const downHandle = getArrowRotationHandlePosition(arrowDown, 30);
    assert.equal(downHandle.y > downEnd.y, true);
  });

  it('T-022 Undo/Redoで移動・リサイズ・回転・編集が正しく巻き戻る', () => {
    // 失敗理由(旧): 複合操作の履歴順が崩れ、Undo/Redoで別状態へ戻っていた。
    const history = createHistoryManager({
      elements: [{ id: 't1', type: 'text', x: 10, y: 10, width: 100, height: 30, text: 'A', rotation: 0 }],
    });

    history.record({
      elements: [{ id: 't1', type: 'text', x: 30, y: 25, width: 100, height: 30, text: 'A', rotation: 0 }],
    });
    history.record({
      elements: [{ id: 't1', type: 'text', x: 30, y: 25, width: 180, height: 40, text: 'A', rotation: 0 }],
    });
    history.record({
      elements: [{ id: 't1', type: 'text', x: 30, y: 25, width: 180, height: 40, text: 'A', rotation: 30 }],
    });
    history.record({
      elements: [{ id: 't1', type: 'text', x: 30, y: 25, width: 180, height: 40, text: 'B', rotation: 30 }],
    });

    const undo1 = history.undo();
    const undo2 = history.undo();
    assert.equal(undo1.elements[0].text, 'A');
    assert.equal(undo2.elements[0].rotation, 0);

    const redo = history.redo();
    assert.equal(redo.elements[0].rotation, 30);
  });

  it('T-023 Undo後の新規操作でRedoスタックが破棄される', () => {
    // 失敗理由(旧): Undo後に新規操作しても古いRedoが残り、状態分岐が混在していた。
    const history = createHistoryManager({ step: 0 });
    history.record({ step: 1 });
    history.record({ step: 2 });
    history.undo();
    history.record({ step: 99 });
    assert.equal(history.redo(), null);
  });

  it('T-024 Escapeで編集キャンセル時に未確定変更が保存されない', () => {
    // 失敗理由(旧): Escape時にドラフトが確定され、キャンセル操作が機能していなかった。
    const state = {
      elements: [{ id: 't1', type: 'text', text: '確定済み' }],
      editingTextId: 't1',
      textDraft: '未確定',
    };
    const canceled = handleEscapeForEditing(state);
    assert.equal(canceled.editingTextId, null);
    assert.equal(canceled.textDraft, null);
    assert.equal(canceled.elements[0].text, '確定済み');
  });

  it('T-025 Delete/Backspaceが編集モードと非編集モードで正しく分岐する', () => {
    // 失敗理由(旧): キー操作が常に要素削除へ流れ、テキスト編集中の文字削除ができなかった。
    const editing = handleDeleteBackspace({
      elements: [{ id: 'a' }],
      selectedElementIds: ['a'],
      editingTextId: 'a',
    }, 'Backspace');
    assert.equal(editing.action, 'delete-character');
    assert.equal(editing.elements.length, 1);

    const notEditing = handleDeleteBackspace({
      elements: [{ id: 'a' }, { id: 'b' }],
      selectedElementIds: ['a'],
      editingTextId: null,
    }, 'Delete');
    assert.equal(notEditing.action, 'delete-elements');
    assert.deepEqual(notEditing.elements.map((item) => item.id), ['b']);
  });

  it('T-026 Ctrl/Cmd系コピーでID重複が発生しない', () => {
    // 失敗理由(旧): ペースト時に元IDを再利用しており、同一ID要素が複数生成されていた。
    const elements = [
      { id: 'e1', x: 10, y: 10, width: 20, height: 20 },
      { id: 'e2', x: 40, y: 10, width: 20, height: 20 },
    ];
    const clipboard = copySelectedElements(elements, ['e1', 'e2']);
    const cut = cutSelectedElements(elements, ['e1']);
    assert.equal(cut.elements.length, 1);
    assert.equal(cut.clipboard.length, 1);

    const idFactory = (() => {
      let count = 0;
      return () => {
        count += 1;
        return count <= 3 ? 'dup' : `dup-${count}`;
      };
    })();

    const pastedOnce = pasteClipboardElements(elements, clipboard, { idFactory });
    const pastedTwice = pasteClipboardElements(pastedOnce.elements, clipboard, { idFactory });
    assert.equal(areElementIdsUnique(pastedTwice.elements), true);
  });
});
