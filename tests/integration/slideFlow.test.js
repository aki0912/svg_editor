import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import editorLogicModule from '../../src/commands/editorLogic.js';

const {
  createSlideFromTemplate,
  duplicateSlide,
  deleteSlide,
  resolveSlideNavigation,
  buildSlideControlState,
} = editorLogicModule;

describe('slide flow integration (T-027 ~ T-030)', () => {
  it('T-027 新規スライド作成時にテンプレート内容が正しく生成される', () => {
    // 失敗理由(旧): テンプレート指定が無視され、常に空スライドが生成されていた。
    const idFactory = (() => {
      let seq = 1;
      return () => `id-${seq++}`;
    })();
    const slide = createSlideFromTemplate('title-body', { idFactory, name: '提案用' });
    assert.equal(slide.template, 'title-body');
    assert.equal(slide.name, '提案用');
    assert.equal(slide.elements.length >= 2, true);
    assert.equal(slide.elements.every((element) => element.type === 'text'), true);
  });

  it('T-028 スライド複製時に要素の深いコピーがされる', () => {
    // 失敗理由(旧): 浅いコピーで元スライドと複製先が同一参照となり、編集が相互汚染した。
    const idFactory = (() => {
      let seq = 1;
      return () => `copy-${seq++}`;
    })();
    const slides = [{
      id: 'slide-1',
      name: 'スライド1',
      elements: [{ id: 'e1', type: 'rect', x: 10, y: 10, width: 100, height: 40 }],
    }];
    const duplicated = duplicateSlide(slides, 0, { idFactory });
    assert.equal(duplicated.slides.length, 2);
    assert.equal(duplicated.currentSlideIndex, 1);
    assert.equal(duplicated.slides[0].id !== duplicated.slides[1].id, true);
    assert.equal(duplicated.slides[0].elements[0].id !== duplicated.slides[1].elements[0].id, true);
    assert.equal(duplicated.slides[0].elements[0] === duplicated.slides[1].elements[0], false);
  });

  it('T-029 スライド削除時にcurrentSlideIndexが不正値にならない', () => {
    // 失敗理由(旧): 末尾削除時にindex更新が漏れ、配列範囲外参照になっていた。
    const slides = [
      { id: 's1', elements: [] },
      { id: 's2', elements: [] },
      { id: 's3', elements: [] },
    ];
    const deletedTail = deleteSlide(slides, 2, 2);
    assert.equal(deletedTail.slides.length, 2);
    assert.equal(deletedTail.currentSlideIndex, 1);

    const deletedSingle = deleteSlide([{ id: 'only', elements: [] }], 0, 0);
    assert.equal(deletedSingle.slides.length, 1);
    assert.equal(deletedSingle.currentSlideIndex, 0);
  });

  it('T-030 前後/直接選択UIでスライド切替状態が常に同期される', () => {
    // 失敗理由(旧): 前後ボタンと直接選択で別々にindex管理し、表示状態が同期しなかった。
    const total = 5;
    const afterNext = resolveSlideNavigation(1, total, { type: 'next' });
    const afterPrev = resolveSlideNavigation(afterNext, total, { type: 'prev' });
    const afterSelect = resolveSlideNavigation(afterPrev, total, { type: 'select', index: 4 });
    const clamped = resolveSlideNavigation(afterSelect, total, { type: 'next' });
    const controls = buildSlideControlState(clamped, total);

    assert.equal(afterNext, 2);
    assert.equal(afterPrev, 1);
    assert.equal(afterSelect, 4);
    assert.equal(clamped, 4);
    assert.equal(controls.canGoPrev, true);
    assert.equal(controls.canGoNext, false);
    assert.equal(controls.displayLabel, '5 / 5');
  });
});
