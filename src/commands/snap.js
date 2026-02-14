(function (global) {
  if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = require('./alignSnap.js');
    return;
  }

  if (!global) return;
  if (global.EditorAlignSnap && !global.EditorSnap) {
    global.EditorSnap = global.EditorAlignSnap;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
