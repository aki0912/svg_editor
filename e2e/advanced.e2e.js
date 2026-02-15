import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

function svgPointToPage(metrics, point) {
  return {
    x: metrics.box.x + (((point.x - metrics.viewBox.x) / metrics.viewBox.width) * metrics.box.width),
    y: metrics.box.y + (((point.y - metrics.viewBox.y) / metrics.viewBox.height) * metrics.box.height),
  };
}

async function getCanvasMetrics(page) {
  const canvas = page.locator('#canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas bounding box not found');
  const viewBox = await canvas.evaluate((svg) => {
    const vb = svg.viewBox.baseVal;
    return { x: vb.x, y: vb.y, width: vb.width, height: vb.height };
  });
  return { box, viewBox };
}

async function clickSvgPoint(page, point) {
  const metrics = await getCanvasMetrics(page);
  const target = svgPointToPage(metrics, point);
  await page.mouse.click(target.x, target.y);
}

async function dragSvgPoint(page, fromPoint, delta) {
  const metrics = await getCanvasMetrics(page);
  const from = svgPointToPage(metrics, fromPoint);
  const to = svgPointToPage(metrics, { x: fromPoint.x + delta.x, y: fromPoint.y + delta.y });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

async function getElementIds(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('#canvas .canvas-element[data-element-id]'))
    .map((node) => node.getAttribute('data-element-id'))
    .filter((id) => typeof id === 'string' && id.trim().length > 0));
}

async function getLastElementId(page) {
  const ids = await getElementIds(page);
  if (!ids.length) throw new Error('no canvas elements');
  return ids[ids.length - 1];
}

async function getElementGeometry(page, elementId) {
  return page.evaluate((id) => {
    const group = document.querySelector(`#canvas .canvas-element[data-element-id="${id}"]`);
    if (!group) return null;
    const tags = new Set(['rect', 'ellipse', 'circle', 'image', 'line', 'polygon', 'polyline', 'path', 'text']);
    const target = Array.from(group.querySelectorAll('*')).find((node) => tags.has(node.tagName.toLowerCase())) || group;
    const box = target.getBBox();
    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    };
  }, elementId);
}

async function getElementCenter(page, elementId) {
  const geometry = await getElementGeometry(page, elementId);
  if (!geometry) throw new Error(`geometry not found: ${elementId}`);
  return {
    x: geometry.x + (geometry.width / 2),
    y: geometry.y + (geometry.height / 2),
  };
}

async function clickElementCenter(page, elementId) {
  const center = await getElementCenter(page, elementId);
  await clickSvgPoint(page, center);
}

async function getNorthWestHandle(page, elementId) {
  return page.evaluate((id) => {
    const handle = document.querySelector(`#canvas .selection-handle[data-element-id="${id}"][data-handle="nw"]`);
    if (!handle) return null;
    const box = handle.getBBox();
    return { x: box.x + (box.width / 2), y: box.y + (box.height / 2) };
  }, elementId);
}

async function getDownloadedText(download) {
  const path = await download.path();
  if (!path) throw new Error('download path not available');
  return readFile(path, 'utf8');
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (_error) {
      // noop
    }
  });
  await page.goto('/index.html');
});

test('A-101: JSONエクスポートで有効なデータ構造がダウンロードされる', async ({ page }) => {
  await page.locator('#add-rect').click();
  await page.locator('#file-menu-trigger').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export-json').click(),
  ]);
  const jsonText = await getDownloadedText(download);
  const parsed = JSON.parse(jsonText);
  expect(Array.isArray(parsed.slides)).toBe(true);
  expect(parsed.slides.length).toBeGreaterThan(0);
  expect(Array.isArray(parsed.slides[0].elements)).toBe(true);
  expect(parsed.slides[0].elements.length).toBeGreaterThan(0);
});

test('A-102: JSONインポートでスライド数・要素数が復元される', async ({ page }) => {
  const payload = {
    slides: [
      {
        id: 's-1',
        title: 'スライド 1',
        width: 960,
        height: 720,
        background: '#ffffff',
        elements: [
          {
            id: 't-1',
            type: 'text',
            x: 120,
            y: 140,
            width: 320,
            height: 60,
            text: 'JSONインポート検証',
            fontSize: 36,
            fontFamily: 'Arial, sans-serif',
            fill: '#111111',
            stroke: 'none',
            strokeWidth: 0,
            textAnchor: 'start',
          },
        ],
      },
      {
        id: 's-2',
        title: 'スライド 2',
        width: 960,
        height: 720,
        background: '#ffffff',
        elements: [],
      },
    ],
    currentSlideIndex: 0,
    selectedElementIds: [],
  };
  await page.setInputFiles('#import-json', {
    name: 'state.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)),
  });

  const jump = page.locator('#canvas-slide-jump');
  await expect.poll(async () => jump.locator('option').count()).toBe(2);
  await expect.poll(async () => (await getElementIds(page)).length).toBeGreaterThan(0);
});

test('A-103: SVGインポートでテキスト要素が反映される', async ({ page }) => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 720">
      <rect x="10" y="10" width="200" height="120" fill="#cfe8ff" stroke="#2b5d9b" />
      <text x="120" y="180" font-size="42" font-family="Yu Gothic, sans-serif">SVG読込テスト</text>
    </svg>
  `;
  await page.setInputFiles('#import-svg', {
    name: 'sample.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(svg),
  });

  await expect.poll(async () => (await getElementIds(page)).length).toBeGreaterThan(0);
  await expect.poll(async () => page.evaluate(() => {
    const texts = Array.from(document.querySelectorAll('#canvas text'));
    return texts.some((node) => (node.textContent || '').includes('SVG読込テスト'));
  })).toBe(true);
});

test('A-104: SVGエクスポートでtext要素を含む', async ({ page }) => {
  await page.locator('#add-text').click();
  await page.locator('#file-menu-trigger').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export-svg').click(),
  ]);
  const svgText = await getDownloadedText(download);
  expect(svgText.includes('<svg')).toBe(true);
  expect(svgText.includes('<text')).toBe(true);
});

test('A-105: Cmd/Ctrl+X -> Cmd/Ctrl+V で件数が整合する', async ({ page }) => {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.locator('#add-rect').click();
  const id = await getLastElementId(page);
  await clickElementCenter(page, id);

  const beforeCount = (await getElementIds(page)).length;
  await page.keyboard.press(`${modifier}+x`);
  await expect.poll(async () => (await getElementIds(page)).length).toBe(beforeCount - 1);
  await page.keyboard.press(`${modifier}+v`);
  await expect.poll(async () => (await getElementIds(page)).length).toBe(beforeCount);
});

test('A-106: リサイズ後のUndo/Redoでサイズが巻き戻る', async ({ page }) => {
  await page.locator('#add-rect').click();
  const id = await getLastElementId(page);
  await clickElementCenter(page, id);
  const before = await getElementGeometry(page, id);

  await expect.poll(async () => {
    const handle = await getNorthWestHandle(page, id);
    return handle ? 1 : 0;
  }).toBe(1);

  const handle = await getNorthWestHandle(page, id);
  await dragSvgPoint(page, handle, { x: -80, y: -60 });
  const resized = await getElementGeometry(page, id);
  expect(resized.width).toBeGreaterThan(before.width + 10);
  expect(resized.height).toBeGreaterThan(before.height + 10);

  await page.locator('#undo-action').click();
  await expect.poll(async () => {
    const geo = await getElementGeometry(page, id);
    return Math.round(geo.width);
  }).toBe(Math.round(before.width));

  await page.locator('#redo-action').click();
  await expect.poll(async () => {
    const geo = await getElementGeometry(page, id);
    return Math.round(geo.width);
  }).toBe(Math.round(resized.width));
});

test.describe('A-107: 低解像度でも主要操作が可能', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test('Undoとスライド切替が操作できる', async ({ page }) => {
    await page.locator('#add-rect').click();
    const countAfterAdd = (await getElementIds(page)).length;
    expect(countAfterAdd).toBeGreaterThan(0);

    await page.locator('#undo-action').click();
    await expect.poll(async () => (await getElementIds(page)).length).toBe(countAfterAdd - 1);

    await page.locator('#new-slide').click();
    const jump = page.locator('#canvas-slide-jump');
    await expect.poll(async () => jump.evaluate((el) => el.selectedIndex)).toBe(1);
    await page.locator('#canvas-prev-slide').click();
    await expect.poll(async () => jump.evaluate((el) => el.selectedIndex)).toBe(0);
  });
});
