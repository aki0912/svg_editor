const SVG_NS = 'http://www.w3.org/2000/svg';
const STORAGE_KEY = 'svg_ppt_like_state_v1';

const state = {
  slides: [createEmptySlide('スライド 1')],
  currentSlideIndex: 0,
  selectedElementId: null,
  pointerState: null,
};

const dom = {
  slideList: document.getElementById('slide-list'),
  slideTitle: document.getElementById('slide-title'),
  canvas: document.getElementById('canvas'),
  addText: document.getElementById('add-text'),
  addRect: document.getElementById('add-rect'),
  addCircle: document.getElementById('add-circle'),
  addImage: document.getElementById('add-image'),
  newSlide: document.getElementById('new-slide'),
  duplicateSlide: document.getElementById('duplicate-slide'),
  deleteSlide: document.getElementById('delete-slide'),
  duplicateElement: document.getElementById('duplicate-element'),
  deleteElement: document.getElementById('delete-element'),
  saveState: document.getElementById('save-state'),
  loadState: document.getElementById('load-state'),
  exportJSON: document.getElementById('export-json'),
  importJSON: document.getElementById('import-json'),
  exportSVG: document.getElementById('export-svg'),
  selectedLabel: document.getElementById('selected-label'),
  propFill: document.getElementById('prop-fill'),
  propStroke: document.getElementById('prop-stroke'),
  propFontSize: document.getElementById('prop-font-size'),
  propText: document.getElementById('prop-text'),
  bringFront: document.getElementById('bring-front'),
  sendBack: document.getElementById('send-back'),
  instructions: document.getElementById('instructions'),
};

function createId() {
  return (crypto.randomUUID && crypto.randomUUID()) || `id-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function createEmptySlide(title = '新規スライド') {
  return {
    id: createId(),
    title,
    width: 960,
    height: 540,
    background: '#ffffff',
    elements: [],
  };
}

function currentSlide() {
  return state.slides[state.currentSlideIndex] || state.slides[0];
}

function getPointerPosition(event) {
  const rect = dom.canvas.getBoundingClientRect();
  const slide = currentSlide();
  return {
    x: ((event.clientX - rect.left) * slide.width) / rect.width,
    y: ((event.clientY - rect.top) * slide.height) / rect.height,
  };
}

function render() {
  renderSlideList();
  renderCanvas();
  renderProperties();
  dom.slideTitle.textContent = `${currentSlide().title} (${state.currentSlideIndex + 1}/${state.slides.length})`;
  saveLocal();
}

function renderSlideList() {
  dom.slideList.innerHTML = '';

  state.slides.forEach((slide, index) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    li.className = index === state.currentSlideIndex ? 'active' : '';
    btn.textContent = `${index + 1}. ${slide.title}`;
    btn.addEventListener('click', () => {
      state.currentSlideIndex = index;
      state.selectedElementId = null;
      render();
    });
    li.appendChild(btn);
    dom.slideList.appendChild(li);
  });
}

function renderCanvas() {
  const slide = currentSlide();
  dom.canvas.setAttribute('viewBox', `0 0 ${slide.width} ${slide.height}`);

  while (dom.canvas.firstChild) {
    dom.canvas.removeChild(dom.canvas.firstChild);
  }

  const bg = document.createElementNS(SVG_NS, 'rect');
  bg.setAttribute('width', slide.width);
  bg.setAttribute('height', slide.height);
  bg.setAttribute('fill', slide.background);
  bg.addEventListener('pointerdown', () => {
    state.selectedElementId = null;
    render();
  });
  dom.canvas.appendChild(bg);

  slide.elements.forEach((el) => {
    renderElement(el);
  });

  if (state.selectedElementId) {
    const target = slide.elements.find((el) => el.id === state.selectedElementId);
    if (target) {
      renderSelection(target);
    }
  }
}

function renderElement(el) {
  const g = document.createElementNS(SVG_NS, 'g');
  g.dataset.elementId = el.id;
  g.classList.add('canvas-element');

  if (el.type === 'text') {
    const text = document.createElementNS(SVG_NS, 'text');
    text.textContent = el.text || '';
    text.setAttribute('x', el.x);
    text.setAttribute('y', el.y + el.fontSize);
    text.setAttribute('fill', el.fill || '#111827');
    text.setAttribute('font-size', String(el.fontSize || 32));
    text.setAttribute('font-family', 'Arial, sans-serif');
    text.setAttribute('dominant-baseline', 'hanging');
    g.appendChild(text);
  }

  if (el.type === 'rect') {
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', el.x);
    rect.setAttribute('y', el.y);
    rect.setAttribute('width', el.width);
    rect.setAttribute('height', el.height);
    rect.setAttribute('fill', el.fill || '#4ea5ff');
    rect.setAttribute('stroke', el.stroke || '#003f7a');
    rect.setAttribute('stroke-width', 2);
    g.appendChild(rect);
  }

  if (el.type === 'circle') {
    const cX = el.x + el.width / 2;
    const cY = el.y + el.height / 2;
    const r = Math.min(el.width, el.height) / 2;
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', cX);
    circle.setAttribute('cy', cY);
    circle.setAttribute('r', r);
    circle.setAttribute('fill', el.fill || '#64d2ff');
    circle.setAttribute('stroke', el.stroke || '#0f3f66');
    circle.setAttribute('stroke-width', 2);
    g.appendChild(circle);
  }

  if (el.type === 'image') {
    const image = document.createElementNS(SVG_NS, 'image');
    image.setAttributeNS('http://www.w3.org/1999/xlink', 'href', el.url);
    image.setAttribute('x', el.x);
    image.setAttribute('y', el.y);
    image.setAttribute('width', el.width);
    image.setAttribute('height', el.height);
    image.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    g.appendChild(image);
  }

  g.addEventListener('pointerdown', (event) => onElementPointerDown(event, el.id));
  g.addEventListener('dblclick', () => onElementDoubleClick(el.id));
  dom.canvas.appendChild(g);
}

function renderSelection(el) {
  const bounds = getElementBounds(el);
  const selectBox = document.createElementNS(SVG_NS, 'rect');
  selectBox.classList.add('selection-box');
  selectBox.setAttribute('x', bounds.x - 2);
  selectBox.setAttribute('y', bounds.y - 2);
  selectBox.setAttribute('width', bounds.width + 4);
  selectBox.setAttribute('height', bounds.height + 4);
  dom.canvas.appendChild(selectBox);

  const size = 8;
  const half = size / 2;
  const positions = [
    ['nw', bounds.x - half, bounds.y - half],
    ['n', bounds.x + bounds.width / 2 - half, bounds.y - half],
    ['ne', bounds.x + bounds.width - half, bounds.y - half],
    ['w', bounds.x - half, bounds.y + bounds.height / 2 - half],
    ['e', bounds.x + bounds.width - half, bounds.y + bounds.height / 2 - half],
    ['sw', bounds.x - half, bounds.y + bounds.height - half],
    ['s', bounds.x + bounds.width / 2 - half, bounds.y + bounds.height - half],
    ['se', bounds.x + bounds.width - half, bounds.y + bounds.height - half],
  ];

  for (const [key, x, y] of positions) {
    const handle = document.createElementNS(SVG_NS, 'rect');
    handle.classList.add('selection-handle');
    handle.dataset.elementId = el.id;
    handle.dataset.handle = key;
    handle.setAttribute('x', x);
    handle.setAttribute('y', y);
    handle.setAttribute('width', size);
    handle.setAttribute('height', size);
    handle.style.cursor = key.includes('n') || key.includes('s') ? 'ns-resize' : key.includes('e') || key.includes('w') ? 'ew-resize' : 'nwse-resize';
    handle.addEventListener('pointerdown', (event) => onHandlePointerDown(event, el.id, key));
    dom.canvas.appendChild(handle);
  }
}

function getElementBounds(el) {
  if (el.type === 'text') {
    const approximateWidth = Math.max(120, (el.text || '').length * ((el.fontSize || 32) * 0.6));
    return {
      x: el.x,
      y: el.y,
      width: el.width || approximateWidth,
      height: el.height || ((el.fontSize || 32) + 12),
    };
  }

  return {
    x: el.x,
    y: el.y,
    width: el.width,
    height: el.height,
  };
}

function onElementPointerDown(event, elementId) {
  if (event.button === 2) return;
  event.preventDefault();

  const slide = currentSlide();
  const element = slide.elements.find((item) => item.id === elementId);
  if (!element) return;

  state.selectedElementId = elementId;
  state.pointerState = {
    mode: 'move',
    elementId,
    pointerId: event.pointerId,
    start: getPointerPosition(event),
    x: element.x,
    y: element.y,
  };

  event.currentTarget.setPointerCapture(event.pointerId);
  render();
}

function onHandlePointerDown(event, elementId, handle) {
  event.preventDefault();
  event.stopPropagation();

  const slide = currentSlide();
  const element = slide.elements.find((item) => item.id === elementId);
  if (!element) return;

  const bounds = getElementBounds(element);
  state.selectedElementId = elementId;
  state.pointerState = {
    mode: 'resize',
    elementId,
    pointerId: event.pointerId,
    handle,
    start: getPointerPosition(event),
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  };

  event.currentTarget.setPointerCapture(event.pointerId);
  render();
}

function onElementDoubleClick(elementId) {
  const slide = currentSlide();
  const element = slide.elements.find((item) => item.id === elementId);
  if (!element || element.type !== 'text') return;

  const value = prompt('テキストを編集してください', element.text || '');
  if (value === null) return;
  element.text = value;
  render();
}

function onPointerMove(event) {
  if (!state.pointerState) return;

  const slide = currentSlide();
  const element = slide.elements.find((item) => item.id === state.pointerState.elementId);
  if (!element) return;

  const p = getPointerPosition(event);
  const dx = p.x - state.pointerState.start.x;
  const dy = p.y - state.pointerState.start.y;

  if (state.pointerState.mode === 'move') {
    element.x = state.pointerState.x + dx;
    element.y = state.pointerState.y + dy;
    render();
    return;
  }

  if (state.pointerState.mode === 'resize') {
    const h = state.pointerState.handle;
    const b = {
      x: state.pointerState.x,
      y: state.pointerState.y,
      width: state.pointerState.width,
      height: state.pointerState.height,
    };

    const next = { ...b };

    if (h.includes('w')) {
      next.x = Math.min(b.x + b.width - 20, p.x);
      next.width = Math.max(20, b.width - (next.x - b.x));
    }
    if (h.includes('e')) {
      next.width = Math.max(20, b.width + dx);
    }
    if (h.includes('n')) {
      next.y = Math.min(b.y + b.height - 20, p.y);
      next.height = Math.max(20, b.height - (next.y - b.y));
    }
    if (h.includes('s')) {
      next.height = Math.max(20, b.height + dy);
    }

    if (element.type === 'text') {
      element.width = next.width;
      element.height = next.height;
    } else {
      element.x = next.x;
      element.y = next.y;
      element.width = next.width;
      element.height = next.height;
    }

    if (h.includes('w') || h.includes('e') || element.type === 'text') {
      if (element.type !== 'text') element.x = next.x;
    }
    if (h.includes('n') || h.includes('s')) {
      if (element.type !== 'text') element.y = next.y;
    }

    render();
  }
}

function onPointerUp() {
  if (!state.pointerState) return;
  state.pointerState = null;
  saveLocal();
}

function addElement(type) {
  const slide = currentSlide();
  const cx = 60;
  const cy = 60;
  const id = createId();

  if (type === 'text') {
    slide.elements.push({
      id,
      type,
      x: cx,
      y: cy,
      width: 260,
      height: 58,
      text: 'テキストを入力',
      fontSize: 32,
      fill: '#111827',
    });
  }

  if (type === 'rect') {
    slide.elements.push({
      id,
      type,
      x: cx,
      y: cy,
      width: 260,
      height: 160,
      fill: '#4ea5ff',
      stroke: '#0b2f5a',
    });
  }

  if (type === 'circle') {
    slide.elements.push({
      id,
      type,
      x: cx,
      y: cy,
      width: 160,
      height: 160,
      fill: '#64d2ff',
      stroke: '#0c4a79',
    });
  }

  if (type === 'image') {
    const url = prompt('画像のURLを入力してください', 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Logo_TV_2015.png');
    if (!url) return;
    slide.elements.push({
      id,
      type,
      x: cx,
      y: cy,
      width: 240,
      height: 170,
      url,
    });
  }

  state.selectedElementId = id;
  render();
}

function newSlide() {
  state.slides.push(createEmptySlide(`スライド ${state.slides.length + 1}`));
  state.currentSlideIndex = state.slides.length - 1;
  state.selectedElementId = null;
  render();
}

function duplicateSlide() {
  const slide = currentSlide();
  const copy = JSON.parse(JSON.stringify(slide));
  copy.id = createId();
  copy.title = `${slide.title} (コピー)`;
  copy.elements = copy.elements.map((el) => ({
    ...el,
    id: createId(),
  }));
  state.slides.splice(state.currentSlideIndex + 1, 0, copy);
  state.currentSlideIndex += 1;
  render();
}

function removeCurrentSlide() {
  if (state.slides.length <= 1) return;
  const isCurrentSelected = state.currentSlideIndex;
  state.slides = state.slides.filter((_, index) => index !== state.currentSlideIndex);
  state.currentSlideIndex = Math.min(isCurrentSelected, state.slides.length - 1);
  state.selectedElementId = null;
  render();
}

function duplicateElement() {
  if (!state.selectedElementId) return;
  const slide = currentSlide();
  const source = slide.elements.find((item) => item.id === state.selectedElementId);
  if (!source) return;
  const copy = JSON.parse(JSON.stringify(source));
  copy.id = createId();
  copy.x += 20;
  copy.y += 20;
  slide.elements.push(copy);
  state.selectedElementId = copy.id;
  render();
}

function deleteElement() {
  if (!state.selectedElementId) return;
  const slide = currentSlide();
  slide.elements = slide.elements.filter((item) => item.id !== state.selectedElementId);
  state.selectedElementId = null;
  render();
}

function setZOrder(direction) {
  if (!state.selectedElementId) return;
  const slide = currentSlide();
  const index = slide.elements.findIndex((item) => item.id === state.selectedElementId);
  if (index < 0) return;

  const target = index + direction;
  if (target < 0 || target >= slide.elements.length) return;

  const [item] = slide.elements.splice(index, 1);
  slide.elements.splice(target, 0, item);
  render();
}

function renderProperties() {
  const slide = currentSlide();
  const item = slide.elements.find((item) => item.id === state.selectedElementId);

  dom.selectedLabel.value = item ? `${item.type.toUpperCase()}` : '';

  const hasSelection = Boolean(item);
  dom.propFill.disabled = !hasSelection;
  dom.propStroke.disabled = !hasSelection;
  dom.propFontSize.disabled = !hasSelection;
  dom.propText.disabled = !hasSelection || item?.type !== 'text';
  dom.bringFront.disabled = !hasSelection;
  dom.sendBack.disabled = !hasSelection;
  dom.duplicateElement.disabled = !hasSelection;
  dom.deleteElement.disabled = !hasSelection;

  if (!item) {
    dom.propFill.value = '#000000';
    dom.propStroke.value = '#000000';
    dom.propFontSize.value = '32';
    dom.propText.value = '';
    return;
  }

  dom.selectedLabel.value = item.type === 'text' ? 'テキスト' : item.type === 'rect' ? '四角形' : item.type === 'circle' ? '円' : '画像';
  dom.propFill.value = item.fill || '#111827';
  dom.propStroke.value = item.stroke || '#0f2f56';
  dom.propFontSize.value = String(item.fontSize || 32);
  dom.propText.value = item.text || '';
}

function applyPropertyFromInputs() {
  const slide = currentSlide();
  const item = slide.elements.find((item) => item.id === state.selectedElementId);
  if (!item) return;

  item.fill = dom.propFill.value;
  item.stroke = dom.propStroke.value;
  item.fontSize = Number(dom.propFontSize.value || 32);
  if (item.type === 'text') item.text = dom.propText.value;
  render();
}

function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadLocal() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const loaded = JSON.parse(raw);
    if (!loaded || !Array.isArray(loaded.slides) || loaded.slides.length === 0) return;

    state.slides = loaded.slides;
    state.currentSlideIndex = Math.min(Math.max(0, loaded.currentSlideIndex || 0), state.slides.length - 1);
    state.selectedElementId = null;
  } catch (error) {
    console.error('保存データの読み込み失敗', error);
  }
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  downloadBlob(blob, 'svg-slide-editor-data.json');
}

function importJSONFromInput(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const loaded = JSON.parse(reader.result);
      if (!loaded || !Array.isArray(loaded.slides) || loaded.slides.length === 0) {
        alert('不正なJSON形式です');
        return;
      }
      state.slides = loaded.slides;
      state.currentSlideIndex = 0;
      state.selectedElementId = null;
      render();
    } catch {
      alert('JSONの読み込みに失敗しました');
    }
  };
  reader.readAsText(file);
}

function exportSVG() {
  const serialized = new XMLSerializer().serializeToString(dom.canvas);
  const slide = currentSlide();
  const header = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  const fullSvg = `${header}<svg xmlns="${SVG_NS}" width="${slide.width}" height="${slide.height}" viewBox="0 0 ${slide.width} ${slide.height}">${serialized.split('>')[1]}`;
  const blob = new Blob([fullSvg], { type: 'image/svg+xml' });
  downloadBlob(blob, `slide-${state.currentSlideIndex + 1}.svg`);
}

function downloadBlob(blob, name) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.appendChild(link);
  link.click();
  URL.revokeObjectURL(link.href);
  document.body.removeChild(link);
}

function setupEvents() {
  dom.newSlide.addEventListener('click', newSlide);
  dom.duplicateSlide.addEventListener('click', duplicateSlide);
  dom.deleteSlide.addEventListener('click', removeCurrentSlide);

  dom.addText.addEventListener('click', () => addElement('text'));
  dom.addRect.addEventListener('click', () => addElement('rect'));
  dom.addCircle.addEventListener('click', () => addElement('circle'));
  dom.addImage.addEventListener('click', () => addElement('image'));

  dom.duplicateElement.addEventListener('click', duplicateElement);
  dom.deleteElement.addEventListener('click', deleteElement);
  dom.bringFront.addEventListener('click', () => setZOrder(1));
  dom.sendBack.addEventListener('click', () => setZOrder(-1));

  dom.saveState.addEventListener('click', () => {
    saveLocal();
    alert('保存しました');
  });
  dom.loadState.addEventListener('click', () => {
    loadLocal();
    render();
  });
  dom.exportJSON.addEventListener('click', exportJSON);
  dom.exportSVG.addEventListener('click', exportSVG);
  dom.importJSON.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    importJSONFromInput(file);
    event.target.value = '';
  });

  dom.propFill.addEventListener('input', applyPropertyFromInputs);
  dom.propStroke.addEventListener('input', applyPropertyFromInputs);
  dom.propFontSize.addEventListener('input', applyPropertyFromInputs);
  dom.propText.addEventListener('input', applyPropertyFromInputs);

  dom.canvas.addEventListener('pointermove', onPointerMove);
  dom.canvas.addEventListener('pointerup', onPointerUp);
  dom.canvas.addEventListener('pointercancel', onPointerUp);

  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointermove', onPointerMove);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      const targetTag = document.activeElement?.tagName?.toLowerCase();
      if (targetTag === 'input' || targetTag === 'textarea') return;
      deleteElement();
    }
  });
}

function bootstrap() {
  loadLocal();
  setupEvents();
  render();
}

bootstrap();
