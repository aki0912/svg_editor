(function (global) {
  const createFallbackClone = (value) => JSON.parse(JSON.stringify(value));

  function cloneState(value) {
    if (typeof structuredClone === 'function') {
      return structuredClone(value);
    }
    return createFallbackClone(value);
  }

  function normalizeMaxEntries(maxEntries) {
    const parsed = Number.parseInt(maxEntries, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return 200;
    return parsed;
  }

  function createHistoryManager(initialState, options = {}) {
    const maxEntries = normalizeMaxEntries(options.maxEntries);
    const records = [];
    let index = -1;

    function record(state) {
      const snapshot = cloneState(state);

      if (index < records.length - 1) {
        records.splice(index + 1);
      }

      records.push(snapshot);
      if (records.length > maxEntries) {
        records.shift();
        index = Math.max(0, index - 1);
      }

      index = records.length - 1;
      return snapshot;
    }

    function replace(state) {
      records.length = 0;
      index = -1;
      record(state);
    }

    function canUndo() {
      return index > 0;
    }

    function canRedo() {
      return index < records.length - 1;
    }

    function undo() {
      if (!canUndo()) return null;
      index -= 1;
      return cloneState(records[index]);
    }

    function redo() {
      if (!canRedo()) return null;
      index += 1;
      return cloneState(records[index]);
    }

    function current() {
      if (index < 0) return null;
      return cloneState(records[index]);
    }

    replace(initialState);

    return {
      record,
      replace,
      canUndo,
      canRedo,
      undo,
      redo,
      current,
    };
  }

  const api = {
    createHistoryManager,
    __internals: {
      cloneState,
    },
  };

  if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = api;
  }

  global.EditorHistory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
