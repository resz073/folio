/* ===================== Undo / redo (snapshot based) ===================== */
const Hist = { stack: [], idx: -1, timer: 0, max: 160, before: null };

function cleanHTML(root, opts = {}) {
  root = root || S.editor;
  const c = root.cloneNode(true);
  if (!opts.lineMarks) c.querySelectorAll('[data-lh]').forEach(n => n.removeAttribute('data-lh'));
  c.querySelectorAll('[data-gp], [data-gs]').forEach(n => { n.removeAttribute('data-gp'); n.removeAttribute('data-gs'); });
  c.querySelectorAll('tr.pg-spacer, span.qm, span.pg-line, .no-save').forEach(n => n.remove());
  c.querySelectorAll('[data-pgp]').forEach(n => { n.removeAttribute('data-pgp'); n.style.removeProperty('--pgp'); if (!n.getAttribute('style')) n.removeAttribute('style'); });
  c.querySelectorAll('[data-sx]').forEach(n => { n.removeAttribute('data-sx'); n.style.removeProperty('--sxl'); n.style.removeProperty('--sxr'); n.style.removeProperty('--sxw'); if (!n.getAttribute('style')) n.removeAttribute('style'); });
  c.querySelectorAll('[data-edge]').forEach(n => n.removeAttribute('data-edge'));
  c.querySelectorAll('[data-align="decimal"]').forEach(n => { n.style.removeProperty('--decpad'); if (!n.getAttribute('style')) n.removeAttribute('style'); });
  c.querySelectorAll('[data-bj]').forEach(n => { n.removeAttribute('data-bj'); n.style.removeProperty('--bjg'); n.style.removeProperty('--pb0'); n.style.removeProperty('--bjsh'); if (!n.getAttribute('style')) n.removeAttribute('style'); });
  c.querySelectorAll('.cmt.on').forEach(n => n.classList.remove('on'));
  c.querySelectorAll('span.zw').forEach(n => { if (n.textContent.replace(/\u200B/g, '') === '' && !n.querySelector('img')) n.remove(); else n.classList.remove('zw'); });
  c.querySelectorAll('[class=""]').forEach(n => n.removeAttribute('class'));
  c.querySelectorAll('[contenteditable="true"]').forEach(n => n.removeAttribute('contenteditable'));
  return c.innerHTML.replace(/\u200B/g, '');
}
function metaSnapshot() {
  const d = S.doc;
  return JSON.stringify({ page: d.page, hf: d.hf, firstDiff: d.firstDiff, evenDiff: !!d.evenDiff, pn: d.pn || null, watermark: d.watermark, comments: d.comments, footnotes: d.footnotes, notePr: d.notePr || null, styles: d.styles || null, font: d.font, size: d.size, line: d.line, after: d.after, headFont: d.headFont, bnFont: d.bnFont || '' });
}
function beginChange() { if (!Hist.before) Hist.before = saveSel(); }
function histRecord() {
  clearTimeout(Hist.timer); Hist.timer = 0;
  if (!S.doc) return false;
  Notes.renumber();
  const html = cleanHTML(), meta = metaSnapshot(), sel = saveSel();
  const top = Hist.stack[Hist.idx];
  const before = Hist.before; Hist.before = null;
  if (top && top.html === html && top.meta === meta) { if (sel) top.sel = sel; return false; }
  Hist.stack.length = Hist.idx + 1;
  Hist.stack.push({ html, meta, sel, before });
  if (Hist.stack.length > Hist.max) Hist.stack.shift();
  Hist.idx = Hist.stack.length - 1;
  updateUndoButtons();
  return true;
}
function histSoon() { clearTimeout(Hist.timer); Hist.timer = setTimeout(histRecord, 450); }
function histReset() { Hist.stack = []; Hist.idx = -1; Hist.before = null; clearTimeout(Hist.timer); Hist.timer = 0; histRecord(); }
function undo() {
  if (Hist.timer) histRecord();
  if (Hist.idx <= 0) { toast('Nothing to undo'); return; }
  const from = Hist.stack[Hist.idx];
  Hist.idx--;
  histApply(Hist.stack[Hist.idx], from.before || Hist.stack[Hist.idx].sel);
}
function redo() {
  if (Hist.timer) histRecord();
  if (Hist.idx >= Hist.stack.length - 1) return;
  Hist.idx++;
  const st = Hist.stack[Hist.idx];
  histApply(st, st.sel);
}
function histApply(st, sel) {
  const curMeta = metaSnapshot();
  S.editor.innerHTML = st.html;
  if (st.meta !== curMeta) Object.assign(S.doc, JSON.parse(st.meta));
  afterContentReplaced(st.meta !== curMeta);
  if (!restoreSel(sel)) focusEditor();
  Saver.mark();
  updateUndoButtons();
  scrollCaretIntoView();
}
function updateUndoButtons() {
  const u = $('#qatUndo'), r = $('#qatRedo');
  if (u) u.disabled = Hist.idx <= 0 && !Hist.timer;
  if (r) r.disabled = Hist.idx >= Hist.stack.length - 1;
}
/* several changes as one step to undo (a command made of others that each record one) */
function histGroup(fn) {
  if (Hist.timer) histRecord();
  const base = Hist.stack[Hist.idx];
  try { return fn(); }
  finally {
    if (Hist.timer) histRecord();
    const i = Hist.stack.indexOf(base);
    if (i >= 0 && Hist.idx > i + 1) {
      const last = Hist.stack[Hist.idx];
      last.before = Hist.stack[i + 1].before || last.before;
      Hist.stack.splice(i + 1, Hist.idx - i - 1);
      Hist.idx = i + 1;
      updateUndoButtons();
    }
  }
}
/* Wrap a document mutation: snapshot before and after, then refresh layout */
function change(fn, opts = {}) {
  if (S.readOnly && !opts.allowRO) { toast('This document is read-only. Turn off Restrict Editing to make changes.'); return; }
  if (Hist.timer) histRecord();
  Hist.before = saveSel() || Hist.before;
  let out;
  try { out = fn(); }
  finally {
    histRecord();
    afterChange(opts.full ? null : (opts.node || null), opts);
  }
  return out;
}
