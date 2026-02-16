import { test, expect } from '@playwright/test';

async function getCanvasMetrics(page) {
  const canvas = page.locator('#canvas');
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error('canvas bounding box is not available');
  }
  const viewBox = await canvas.evaluate((svg) => {
    const vb = svg.viewBox.baseVal;
    return { x: vb.x, y: vb.y, width: vb.width, height: vb.height };
  });
  return { box, viewBox };
}

function svgPointToPage(metrics, point) {
  return {
    x: metrics.box.x + (((point.x - metrics.viewBox.x) / metrics.viewBox.width) * metrics.box.width),
    y: metrics.box.y + (((point.y - metrics.viewBox.y) / metrics.viewBox.height) * metrics.box.height),
  };
}

async function clickSvgPoint(page, point) {
  const metrics = await getCanvasMetrics(page);
  const target = svgPointToPage(metrics, point);
  await page.mouse.click(target.x, target.y);
}

async function dragSvgPoint(page, fromPoint, delta) {
  const metrics = await getCanvasMetrics(page);
  const from = svgPointToPage(metrics, fromPoint);
  const to = svgPointToPage(metrics, {
    x: fromPoint.x + delta.x,
    y: fromPoint.y + delta.y,
  });

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

async function getElementIds(page) {
  return page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('#canvas [data-element-id]'));
    const ids = nodes
      .map((node) => node.getAttribute('data-element-id'))
      .filter((id) => typeof id === 'string' && id.trim().length > 0);
    return Array.from(new Set(ids));
  });
}

async function getCanvasElementIds(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('#canvas .canvas-element[data-element-id]'))
    .map((node) => node.getAttribute('data-element-id'))
    .filter((id) => typeof id === 'string' && id.trim().length > 0));
}

async function getLastElementId(page) {
  const ids = await getElementIds(page);
  if (!ids.length) {
    throw new Error('no drawable elements found');
  }
  return ids[ids.length - 1];
}

async function getElementGeometry(page, elementId) {
  return page.evaluate((id) => {
    const isOverlay = (node) => {
      const className = String(node.getAttribute('class') || '').toLowerCase();
      const dataRole = String(node.getAttribute('data-role') || '').toLowerCase();
      return (
        className.includes('handle')
        || className.includes('selection')
        || className.includes('rotate')
        || className.includes('snap')
        || dataRole.includes('handle')
        || dataRole.includes('selection')
        || dataRole.includes('rotate')
        || node.hasAttribute('data-handle')
        || node.hasAttribute('data-resize-handle')
      );
    };

    const group = document.querySelector(`#canvas [data-element-id="${id}"]`);
    if (!group) return null;

    const drawableTags = new Set(['rect', 'ellipse', 'circle', 'image', 'line', 'polygon', 'polyline', 'path', 'text']);
    const nodes = Array.from(group.querySelectorAll('*'));
    const drawable = nodes.find((node) => drawableTags.has(node.tagName.toLowerCase()) && !isOverlay(node));
    const target = drawable || group;

    const tag = target.tagName.toLowerCase();
    if (tag === 'rect' || tag === 'image') {
      return {
        x: Number(target.getAttribute('x') || 0),
        y: Number(target.getAttribute('y') || 0),
        width: Number(target.getAttribute('width') || 0),
        height: Number(target.getAttribute('height') || 0),
      };
    }
    if (tag === 'circle') {
      const cx = Number(target.getAttribute('cx') || 0);
      const cy = Number(target.getAttribute('cy') || 0);
      const r = Number(target.getAttribute('r') || 0);
      return {
        x: cx - r,
        y: cy - r,
        width: r * 2,
        height: r * 2,
      };
    }
    if (tag === 'ellipse') {
      const cx = Number(target.getAttribute('cx') || 0);
      const cy = Number(target.getAttribute('cy') || 0);
      const rx = Number(target.getAttribute('rx') || 0);
      const ry = Number(target.getAttribute('ry') || 0);
      return {
        x: cx - rx,
        y: cy - ry,
        width: rx * 2,
        height: ry * 2,
      };
    }
    if (tag === 'line') {
      const x1 = Number(target.getAttribute('x1') || 0);
      const y1 = Number(target.getAttribute('y1') || 0);
      const x2 = Number(target.getAttribute('x2') || 0);
      const y2 = Number(target.getAttribute('y2') || 0);
      return {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
      };
    }

    const bbox = target.getBBox();
    return {
      x: bbox.x,
      y: bbox.y,
      width: bbox.width,
      height: bbox.height,
    };
  }, elementId);
}

async function getElementCenter(page, elementId) {
  const geometry = await getElementGeometry(page, elementId);
  if (!geometry) throw new Error(`geometry not found for ${elementId}`);
  return {
    x: geometry.x + (geometry.width / 2),
    y: geometry.y + (geometry.height / 2),
  };
}

async function clickElementCenter(page, elementId) {
  const center = await getElementCenter(page, elementId);
  await clickSvgPoint(page, center);
}

async function dragElementBy(page, elementId, delta) {
  const center = await getElementCenter(page, elementId);
  await dragSvgPoint(page, center, delta);
}

async function getNorthWestHandle(page, elementId) {
  return page.evaluate((id) => {
    const handleNodes = Array.from(
      document.querySelectorAll(`#canvas .selection-handle[data-element-id="${id}"]`),
    ).filter((node) => String(node.getAttribute('data-handle') || '').toLowerCase() !== 'rotate');
    if (!handleNodes.length) return null;

    const exact = handleNodes.find(
      (node) => String(node.getAttribute('data-handle') || '').toLowerCase() === 'nw',
    );
    if (exact) {
      const box = exact.getBBox();
      return {
        x: box.x + (box.width / 2),
        y: box.y + (box.height / 2),
      };
    }

    const points = handleNodes.map((node) => {
      const bbox = node.getBBox();
      return {
        x: bbox.x + (bbox.width / 2),
        y: bbox.y + (bbox.height / 2),
      };
    });
    const minY = Math.min(...points.map((point) => point.y));
    const topBand = points
      .filter((point) => Math.abs(point.y - minY) <= 2)
      .sort((a, b) => a.x - b.x);
    if (topBand.length) return topBand[0];
    return points.sort((a, b) => (a.x + a.y) - (b.x + b.y))[0];
  }, elementId);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      if (!sessionStorage.getItem('__e2e_storage_initialized')) {
        localStorage.clear();
        sessionStorage.setItem('__e2e_storage_initialized', '1');
      }
    } catch (_error) {
      // noop
    }
  });
  await page.goto('/index.html');
});

async function getElementText(page, elementId) {
  return page.evaluate((id) => {
    const group = document.querySelector(`#canvas [data-element-id="${id}"]`);
    if (!group) return null;
    const textNode = group.querySelector('text');
    if (!textNode) return null;
    const tspans = Array.from(textNode.querySelectorAll('tspan'));
    if (tspans.length) {
      return tspans.map((node) => node.textContent || '').join('\n');
    }
    return textNode.textContent || '';
  }, elementId);
}

async function getElementFill(page, elementId) {
  return page.evaluate((id) => {
    const group = document.querySelector(`#canvas [data-element-id="${id}"]`);
    if (!group) return null;
    const target = group.querySelector('rect,ellipse,circle,polygon,path');
    if (!target) return null;
    return String(target.getAttribute('fill') || '').toLowerCase();
  }, elementId);
}

async function getElementFontFamily(page, elementId) {
  return page.evaluate((id) => {
    const group = document.querySelector(`#canvas [data-element-id="${id}"]`);
    if (!group) return null;
    const textNode = group.querySelector('text');
    if (!textNode) return null;
    return String(textNode.getAttribute('font-family') || '');
  }, elementId);
}

test('最小1: オブジェクト選択/解除（空白クリック含む）', async ({ page }) => {
  await page.locator('#add-rect').click();
  const id = await getLastElementId(page);

  await expect(page.locator('#selected-label')).not.toHaveValue('');
  await clickSvgPoint(page, { x: 1350, y: 760 });
  await expect(page.locator('#selected-label')).toHaveValue('');

  await clickElementCenter(page, id);
  await expect(page.locator('#selected-label')).not.toHaveValue('');
});

test('追加: 空白ドラッグで範囲選択して複数オブジェクトを選べる', async ({ page }) => {
  await page.locator('#add-rect').click();
  const rectId = await getLastElementId(page);
  await page.locator('#add-circle').click();
  const circleId = await getLastElementId(page);

  await dragElementBy(page, circleId, { x: 380, y: 220 });
  await clickSvgPoint(page, { x: 1350, y: 760 });
  await expect(page.locator('#selected-label')).toHaveValue('');

  await dragSvgPoint(page, { x: 20, y: 20 }, { x: 820, y: 560 });
  await expect.poll(async () => (await page.locator('#selected-label').inputValue()).trim()).toBe('2個選択');
  await expect.poll(async () => page.locator('#canvas .selection-box').count()).toBe(2);
  await expect.poll(async () => page.evaluate((ids) => ids.every(
    (id) => document.querySelectorAll(`#canvas .selection-handle[data-element-id="${id}"]`).length > 0,
  ), [rectId, circleId])).toBe(true);

  const rectBefore = await getElementGeometry(page, rectId);
  const circleBefore = await getElementGeometry(page, circleId);
  await dragElementBy(page, rectId, { x: 90, y: 60 });
  const rectAfter = await getElementGeometry(page, rectId);
  const circleAfter = await getElementGeometry(page, circleId);

  expect(rectAfter.x).toBeGreaterThan(rectBefore.x + 30);
  expect(rectAfter.y).toBeGreaterThan(rectBefore.y + 20);
  expect(circleAfter.x).toBeGreaterThan(circleBefore.x + 30);
  expect(circleAfter.y).toBeGreaterThan(circleBefore.y + 20);
});

test('追加: 複数選択時のリサイズで全オブジェクトのサイズが変わる', async ({ page }) => {
  await page.locator('#add-rect').click();
  const rectId = await getLastElementId(page);
  await page.locator('#add-circle').click();
  const circleId = await getLastElementId(page);

  await dragElementBy(page, circleId, { x: 320, y: 180 });
  await dragSvgPoint(page, { x: 20, y: 20 }, { x: 760, y: 520 });
  await expect.poll(async () => (await page.locator('#selected-label').inputValue()).trim()).toBe('2個選択');

  await expect.poll(async () => {
    const point = await getNorthWestHandle(page, rectId);
    return point ? 1 : 0;
  }).toBe(1);
  const nwHandle = await getNorthWestHandle(page, rectId);
  expect(nwHandle).toBeTruthy();

  const rectBefore = await getElementGeometry(page, rectId);
  const circleBefore = await getElementGeometry(page, circleId);
  await dragSvgPoint(page, nwHandle, { x: -45, y: -35 });
  const rectAfter = await getElementGeometry(page, rectId);
  const circleAfter = await getElementGeometry(page, circleId);

  expect(rectAfter.width).toBeGreaterThan(rectBefore.width + 10);
  expect(rectAfter.height).toBeGreaterThan(rectBefore.height + 10);
  expect(circleAfter.width).toBeGreaterThan(circleBefore.width + 10);
  expect(circleAfter.height).toBeGreaterThan(circleBefore.height + 10);
});

test('最小2: ドラッグ移動と左上ハンドルリサイズ', async ({ page }) => {
  await page.locator('#add-rect').click();
  const id = await getLastElementId(page);

  const beforeMove = await getElementGeometry(page, id);
  await dragElementBy(page, id, { x: 120, y: 80 });
  const afterMove = await getElementGeometry(page, id);

  expect(afterMove.x).toBeGreaterThan(beforeMove.x + 40);
  expect(afterMove.y).toBeGreaterThan(beforeMove.y + 20);

  await clickElementCenter(page, id);
  await expect.poll(async () => {
    const point = await getNorthWestHandle(page, id);
    return point ? 1 : 0;
  }).toBe(1);
  const nwHandle = await getNorthWestHandle(page, id);
  expect(nwHandle).toBeTruthy();

  await dragSvgPoint(page, nwHandle, { x: -50, y: -40 });
  const afterResize = await getElementGeometry(page, id);

  expect(afterResize.x).toBeLessThan(afterMove.x - 5);
  expect(afterResize.y).toBeLessThan(afterMove.y - 5);
  expect(afterResize.width).toBeGreaterThan(afterMove.width + 5);
  expect(afterResize.height).toBeGreaterThan(afterMove.height + 5);
});

test('最小3: テキスト編集開始時の位置ズレなし', async ({ page }) => {
  await page.locator('#add-text').click();
  const id = await getLastElementId(page);

  const geometry = await getElementGeometry(page, id);
  const metrics = await getCanvasMetrics(page);
  const originPage = svgPointToPage(metrics, { x: geometry.x, y: geometry.y });

  await clickElementCenter(page, id);
  const center = await getElementCenter(page, id);
  const centerPage = svgPointToPage(metrics, center);
  await page.mouse.dblclick(centerPage.x, centerPage.y);

  const editor = page.locator('#canvas textarea, #canvas [contenteditable="true"], #canvas input[type="text"]');
  await expect(editor.first()).toBeVisible();
  const editorBox = await editor.first().boundingBox();
  expect(editorBox).toBeTruthy();

  const deltaX = Math.abs(editorBox.x - originPage.x);
  const deltaY = Math.abs(editorBox.y - originPage.y);
  expect(deltaX).toBeLessThan(20);
  expect(deltaY).toBeLessThan(20);
});

test('追加: 図形をダブルクリックしてテキスト入力できる', async ({ page }) => {
  await page.locator('#add-rect').click();
  const id = await getLastElementId(page);
  await clickElementCenter(page, id);

  const center = await getElementCenter(page, id);
  const metrics = await getCanvasMetrics(page);
  const centerPage = svgPointToPage(metrics, center);
  await page.mouse.dblclick(centerPage.x, centerPage.y);

  const editorSelector = '#canvas textarea.inline-textarea, #canvas textarea, #canvas [contenteditable="true"], #canvas input[type="text"]';
  const editor = page.locator(editorSelector).first();
  await expect(editor).toBeVisible();
  await editor.fill('図形ダブルクリック編集');

  await clickSvgPoint(page, { x: 20, y: 20 });
  await expect.poll(async () => page.locator(editorSelector).count()).toBe(0);
  await expect.poll(async () => await getElementText(page, id)).toContain('図形ダブルクリック編集');
});

test('最小4: Undo/Redoで移動を巻き戻し・再適用できる', async ({ page }) => {
  await page.locator('#add-rect').click();
  const id = await getLastElementId(page);

  const before = await getElementGeometry(page, id);
  await dragElementBy(page, id, { x: 140, y: 0 });
  const moved = await getElementGeometry(page, id);
  expect(moved.x).toBeGreaterThan(before.x + 60);

  await page.locator('#undo-action').click();
  await expect.poll(async () => (await getElementGeometry(page, id)).x).toBeLessThanOrEqual(before.x + 5);

  await page.locator('#redo-action').click();
  await expect.poll(async () => (await getElementGeometry(page, id)).x).toBeGreaterThan(before.x + 60);
});

test('最小5: スライド切替UIと一覧の同期', async ({ page }) => {
  await page.locator('#new-slide').click();

  const select = page.locator('#canvas-slide-jump');
  const optionCount = await select.locator('option').count();
  const selectedAfterCreate = await select.evaluate((el) => el.selectedIndex);
  expect(optionCount).toBeGreaterThanOrEqual(2);
  expect(selectedAfterCreate).toBe(1);

  const overviewCount = await page.locator('#slide-overview > *').count();
  expect(overviewCount).toBe(optionCount);

  await page.locator('#canvas-prev-slide').click();
  await expect.poll(async () => select.evaluate((el) => el.selectedIndex)).toBe(0);

  await page.locator('#slide-overview > *').nth(1).click();
  await expect.poll(async () => select.evaluate((el) => el.selectedIndex)).toBe(1);
});

test('追加1: Escapeでテキスト編集キャンセル時に未確定変更を保存しない', async ({ page }) => {
  await page.locator('#add-text').click();
  const id = await getLastElementId(page);
  const beforeText = await getElementText(page, id);

  await clickElementCenter(page, id);
  const center = await getElementCenter(page, id);
  const metrics = await getCanvasMetrics(page);
  const centerPage = svgPointToPage(metrics, center);
  await page.mouse.dblclick(centerPage.x, centerPage.y);

  const editorSelector = '#canvas textarea.inline-textarea, #canvas textarea, #canvas [contenteditable="true"], #canvas input[type="text"]';
  const editor = page.locator(editorSelector).first();
  await expect(editor).toBeVisible();
  await editor.fill('キャンセルで破棄されるテキスト');
  await page.keyboard.press('Escape');

  await expect.poll(async () => page.locator(editorSelector).count()).toBe(0);
  const afterText = await getElementText(page, id);
  expect(afterText).toBe(beforeText);
});

test('追加2: テキストのフォント変更が描画へ反映される', async ({ page }) => {
  await page.locator('#add-text').click();
  const id = await getLastElementId(page);
  await clickElementCenter(page, id);

  await expect(page.locator('#prop-font-family')).toBeEnabled();
  await page.locator('#prop-font-family').selectOption('Meiryo, sans-serif');

  await expect.poll(async () => await getElementFontFamily(page, id)).toContain('Meiryo');
  await expect.poll(async () => (await page.locator('#selected-label').inputValue()).trim().length).toBeGreaterThan(0);
});

test('追加2b: 図形内テキストも本文とフォントを編集できる', async ({ page }) => {
  await page.locator('#add-rect').click();
  const id = await getLastElementId(page);
  await clickElementCenter(page, id);

  await expect(page.locator('#prop-font-family')).toBeEnabled();
  await expect(page.locator('#prop-text')).toBeEnabled();
  await page.locator('#prop-text').fill('図形の本文');
  await page.locator('#prop-font-size').fill('44');
  await page.locator('#prop-font-family').selectOption('Meiryo, sans-serif');

  await expect.poll(async () => await getElementText(page, id)).toContain('図形の本文');
  await expect.poll(async () => await getElementFontFamily(page, id)).toContain('Meiryo');
  await expect.poll(async () => page.evaluate((targetId) => {
    const group = document.querySelector(`#canvas [data-element-id="${targetId}"]`);
    const textNode = group?.querySelector('text');
    return String(textNode?.getAttribute('font-size') || '');
  }, id)).toBe('44');
});

test('追加2c: 揃え変更で改行が消えない', async ({ page }) => {
  await page.locator('#add-text').click();
  const id = await getLastElementId(page);

  await clickElementCenter(page, id);
  const center = await getElementCenter(page, id);
  const metrics = await getCanvasMetrics(page);
  const centerPage = svgPointToPage(metrics, center);
  await page.mouse.dblclick(centerPage.x, centerPage.y);

  const editorSelector = '#canvas textarea.inline-textarea, #canvas textarea, #canvas [contenteditable="true"], #canvas input[type="text"]';
  const editor = page.locator(editorSelector).first();
  await expect(editor).toBeVisible();
  await editor.fill('1行目\n2行目');
  await clickSvgPoint(page, { x: 20, y: 20 });

  await clickElementCenter(page, id);
  await expect.poll(async () => await getElementText(page, id)).toBe('1行目\n2行目');

  await page.locator('#prop-text-align').selectOption('middle');
  await expect.poll(async () => await getElementText(page, id)).toBe('1行目\n2行目');
});

test('追加3: プロパティ操作中に選択状態が維持される', async ({ page }) => {
  await page.locator('#add-rect').click();
  const id = await getLastElementId(page);
  await clickElementCenter(page, id);

  const beforeLabel = await page.locator('#selected-label').inputValue();
  await expect(page.locator('#prop-fill')).toBeEnabled();
  await page.locator('#prop-fill').evaluate((input) => {
    input.value = '#ff0000';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await expect.poll(async () => (await page.locator('#selected-label').inputValue()).trim().length).toBeGreaterThan(0);
  const afterLabel = await page.locator('#selected-label').inputValue();
  expect(afterLabel).toBe(beforeLabel);
  await expect.poll(async () => await getElementFill(page, id)).toBe('#ff0000');
});

test('追加4: スライド削除の境界ケースでインデックスが安定する', async ({ page }) => {
  const select = page.locator('#canvas-slide-jump');

  await expect.poll(async () => select.locator('option').count()).toBe(1);
  await expect.poll(async () => select.evaluate((el) => el.selectedIndex)).toBe(0);

  await page.locator('#new-slide').click();
  await page.locator('#new-slide').click();
  await expect.poll(async () => select.locator('option').count()).toBe(3);
  await expect.poll(async () => select.evaluate((el) => el.selectedIndex)).toBe(2);

  await page.locator('#delete-slide').click();
  await expect.poll(async () => select.locator('option').count()).toBe(2);
  await expect.poll(async () => select.evaluate((el) => el.selectedIndex)).toBe(1);

  await page.locator('#canvas-prev-slide').click();
  await expect.poll(async () => select.evaluate((el) => el.selectedIndex)).toBe(0);
  await page.locator('#delete-slide').click();
  await expect.poll(async () => select.locator('option').count()).toBe(1);
  await expect.poll(async () => select.evaluate((el) => el.selectedIndex)).toBe(0);
  await page.locator('#delete-slide').click();
  await expect.poll(async () => select.locator('option').count()).toBe(1);
  await expect.poll(async () => select.evaluate((el) => el.selectedIndex)).toBe(0);
});

test('追加5: キーボードショートカットでUndo/Redo/Deleteが動作する', async ({ page }) => {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  const redoCombo = `${modifier}+y`;

  await page.locator('#add-rect').click();
  const beforeCount = (await getElementIds(page)).length;
  expect(beforeCount).toBeGreaterThan(0);

  await page.keyboard.press(`${modifier}+z`);
  await expect.poll(async () => (await getElementIds(page)).length).toBe(beforeCount - 1);

  await page.keyboard.press(redoCombo);
  await expect.poll(async () => (await getElementIds(page)).length).toBe(beforeCount);

  const lastId = await getLastElementId(page);
  await clickElementCenter(page, lastId);
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await getElementIds(page)).length).toBe(beforeCount - 1);
});

test('追加6: Undo後に新規操作するとRedoが無効化される', async ({ page }) => {
  await page.locator('#add-rect').click();
  const afterAddCount = (await getElementIds(page)).length;

  await page.locator('#undo-action').click();
  await expect.poll(async () => (await getElementIds(page)).length).toBe(afterAddCount - 1);

  await page.locator('#add-circle').click();
  await expect(page.locator('#redo-action')).toBeDisabled();
});

test('追加7: Cmd/Ctrl+C/Vで要素複製されID重複が発生しない', async ({ page }) => {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.locator('#add-rect').click();
  const targetId = await getLastElementId(page);
  await clickElementCenter(page, targetId);

  const beforeRawIds = await getCanvasElementIds(page);
  await page.keyboard.press(`${modifier}+c`);
  await page.keyboard.press(`${modifier}+v`);

  const afterRawIds = await getCanvasElementIds(page);
  expect(afterRawIds.length).toBeGreaterThan(beforeRawIds.length);
  expect(new Set(afterRawIds).size).toBe(afterRawIds.length);
});

test('追加8: スライド複製後に編集しても元スライドへ影響しない', async ({ page }) => {
  await page.locator('#add-rect').click();
  const originalId = await getLastElementId(page);
  const originalGeometry = await getElementGeometry(page, originalId);

  await page.locator('#duplicate-slide').click();
  const duplicatedId = await getLastElementId(page);
  await dragElementBy(page, duplicatedId, { x: 140, y: 80 });
  const duplicatedGeometry = await getElementGeometry(page, duplicatedId);
  expect(duplicatedGeometry.x).toBeGreaterThan(originalGeometry.x + 40);

  await page.locator('#canvas-prev-slide').click();
  const backGeometry = await getElementGeometry(page, originalId);
  expect(Math.abs(backGeometry.x - originalGeometry.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(backGeometry.y - originalGeometry.y)).toBeLessThanOrEqual(2);
});

test('追加9: テキスト編集中のBackspaceで要素は削除されない', async ({ page }) => {
  await page.locator('#add-text').click();
  const textId = await getLastElementId(page);
  const beforeCount = (await getElementIds(page)).length;

  await clickElementCenter(page, textId);
  const center = await getElementCenter(page, textId);
  const metrics = await getCanvasMetrics(page);
  const centerPage = svgPointToPage(metrics, center);
  await page.mouse.dblclick(centerPage.x, centerPage.y);

  const editorSelector = '#canvas textarea.inline-textarea, #canvas textarea, #canvas [contenteditable="true"], #canvas input[type="text"]';
  const editor = page.locator(editorSelector).first();
  await expect(editor).toBeVisible();
  await editor.fill('ABCDE');
  await page.keyboard.press('Backspace');

  await expect(editor).toBeVisible();
  await expect.poll(async () => (await getElementIds(page)).length).toBe(beforeCount);
});

test('追加10: 要素複製ボタンと要素削除ボタンで件数が整合する', async ({ page }) => {
  await page.locator('#add-rect').click();
  const targetId = await getLastElementId(page);
  await clickElementCenter(page, targetId);

  await expect(page.locator('#duplicate-element')).toBeEnabled();
  const beforeCount = (await getElementIds(page)).length;
  await page.locator('#duplicate-element').click();
  const afterDuplicateCount = (await getElementIds(page)).length;
  expect(afterDuplicateCount).toBeGreaterThan(beforeCount);

  await page.locator('#delete-element').click();
  await expect.poll(async () => (await getElementIds(page)).length).toBe(beforeCount);
});

test('追加11: Control+Arrow左右でスライドを切り替えできる', async ({ page }) => {
  const jump = page.locator('#canvas-slide-jump');
  await page.locator('#new-slide').click();
  await page.locator('#new-slide').click();
  await expect.poll(async () => jump.evaluate((el) => el.selectedIndex)).toBe(2);

  await page.keyboard.press('Control+ArrowLeft');
  await expect.poll(async () => jump.evaluate((el) => el.selectedIndex)).toBe(1);

  await page.keyboard.press('Control+ArrowLeft');
  await expect.poll(async () => jump.evaluate((el) => el.selectedIndex)).toBe(0);

  await page.keyboard.press('Control+ArrowRight');
  await expect.poll(async () => jump.evaluate((el) => el.selectedIndex)).toBe(1);
});

test('追加12: 全部リセットで初期状態（1スライド、要素なし）に戻る', async ({ page }) => {
  await page.locator('#add-rect').click();
  await page.locator('#new-slide').click();

  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
  await page.locator('#file-menu-trigger').click();
  await page.locator('#reset-state').click();

  const jump = page.locator('#canvas-slide-jump');
  await expect.poll(async () => jump.locator('option').count()).toBe(1);
  await expect.poll(async () => jump.evaluate((el) => el.selectedIndex)).toBe(0);
  await expect.poll(async () => (await getElementIds(page)).length).toBe(0);
});

test('追加13: ページ再読み込み後にlocalStorageから状態復元される', async ({ page }) => {
  await page.locator('#add-rect').click();
  const beforeCount = (await getElementIds(page)).length;
  expect(beforeCount).toBeGreaterThan(0);

  await page.reload();
  await expect.poll(async () => (await getElementIds(page)).length).toBe(beforeCount);
});

test('追加14: 図形選択時もテキスト系プロパティを操作できる', async ({ page }) => {
  await page.locator('#add-rect').click();
  await expect(page.locator('#prop-font-family')).toBeEnabled();
  await expect(page.locator('#prop-font-size')).toBeEnabled();
  await expect(page.locator('#prop-text')).toBeEnabled();

  await page.locator('#add-text').click();
  await expect(page.locator('#prop-font-family')).toBeEnabled();
  await expect(page.locator('#prop-font-size')).toBeEnabled();
});

test('追加15: Undo/Redoボタンの有効状態が履歴に追従する', async ({ page }) => {
  await expect(page.locator('#undo-action')).toBeDisabled();
  await expect(page.locator('#redo-action')).toBeDisabled();

  await page.locator('#add-rect').click();
  await expect(page.locator('#undo-action')).toBeEnabled();
  await expect(page.locator('#redo-action')).toBeDisabled();

  await page.locator('#undo-action').click();
  await expect(page.locator('#undo-action')).toBeDisabled();
  await expect(page.locator('#redo-action')).toBeEnabled();

  await page.locator('#redo-action').click();
  await expect(page.locator('#undo-action')).toBeEnabled();
  await expect(page.locator('#redo-action')).toBeDisabled();
});
