import alignSnap from './alignSnap.js';

const api = alignSnap && typeof alignSnap === 'object' ? alignSnap : {};

if (typeof globalThis !== 'undefined' && globalThis) {
  if (!globalThis.EditorAlignSnap && api && typeof api === 'object') {
    globalThis.EditorAlignSnap = api;
  }
  if (!globalThis.EditorSnap && api && typeof api === 'object') {
    globalThis.EditorSnap = api;
  }
}

export default api;
export const createSnapEngine = api?.createSnapEngine;
export const __internals = api?.__internals;
