/* ===================== Dialog framework ===================== */
function openDialog({ title, body, buttons = [], width = 520, onClose, focus }) {
  const savedRange = lastRange ? lastRange.cloneRange() : null;
  const close = (restore = true) => {
    back.remove();
    document.removeEventListener('keydown', onKey, true);
    if (onClose) onClose();
    if (restore && savedRange && S.editor.contains(savedRange.startContainer) && !S.readOnly) { S.editor.focus({ preventScroll: true }); try { setRange(savedRange); } catch { } }
  };
  const x = h('button', { class: 'tb-btn', type: 'button', 'aria-label': 'Close', title: 'Close (Esc)', html: icon('close') });
  x.addEventListener('click', () => close());
  const foot = h('footer');
  let primary = null;
  for (const b of buttons) {
    const el = h('button', { class: 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : '') + (b.left ? '' : ''), type: 'button', style: b.left ? { marginRight: 'auto' } : null }, b.label);
    el.addEventListener('click', () => { const r = b.onClick ? b.onClick() : null; if (r !== false) close(b.restore !== false); });
    if (b.primary) primary = el;
    foot.appendChild(el);
  }
  const dlg = h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, style: { width: `min(${width}px, 100%)` } },
    h('header', null, h('h2', null, title), x), h('div', { class: 'dbody' }, body), buttons.length ? foot : null);
  const back = h('div', { class: 'backdrop' }, dlg);
  back.addEventListener('mousedown', e => { if (e.target === back) close(); });
  const onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (Menu.el) Menu.close(); else close(); }
    // (a field with its own Enter, like “Add”, says so with data-own-enter)
    else if (e.key === 'Enter' && primary && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON' && !(e.target.closest && e.target.closest('[data-own-enter]')) && dlg.contains(e.target)) { e.preventDefault(); primary.click(); }
    else if (e.key === 'Tab') {
      const f = $$('button, input, select, textarea, [tabindex]:not([tabindex="-1"])', dlg).filter(n => !n.disabled && n.offsetParent);
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  };
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(back);
  setTimeout(() => { const f = focus ? (typeof focus === 'string' ? dlg.querySelector(focus) : focus) : dlg.querySelector('input, select, textarea, button.primary'); if (f) { f.focus(); if (f.select) f.select(); } }, 20);
  return { el: dlg, close };
}
const field = (label, control, id) => { if (id) control.id = id; return h('div', { class: 'field' }, h('label', { for: id || null }, label), control); };
const input = (value, attrs = {}) => { const i = h('input', Object.assign({ class: 'input', autocomplete: 'off' }, attrs)); i.value = value == null ? '' : value; return i; };
const select = (opts, value, attrs = {}) => { const s = h('select', Object.assign({ class: 'select' }, attrs), opts.map(([v, l]) => h('option', { value: v }, l))); s.value = value; return s; };
const checkbox = (label, checked, id) => { const c = h('input', { type: 'checkbox', id }); c.checked = !!checked; return { el: h('label', { class: 'check' }, c, label), input: c }; };
function confirmDialog(msg, okLabel = 'OK', danger) {
  return new Promise(res => {
    let done = false;
    openDialog({ title: 'Please confirm', width: 420, body: h('p', { style: { margin: '4px 0 6px', lineHeight: 1.5 } }, msg), onClose: () => { if (!done) res(false); }, buttons: [{ label: 'Cancel', onClick: () => { done = true; res(false); } }, { label: okLabel, primary: !danger, danger, onClick: () => { done = true; res(true); } }] });
  });
}

const Dialogs = {
  font() {
    const cs = curComputed();
    const fam = firstFamily(cs.fontFamily);
    const fName = input(fam === 'Carlito' ? 'Calibri' : fam, { list: 'fontList' });
    const dl = h('datalist', { id: 'fontList' }, FONTS.map(f => h('option', { value: f.n })));
    const weight = parseInt(cs.fontWeight, 10) >= 600, ital = cs.fontStyle === 'italic';
    const fStyle = select([['regular', 'Regular'], ['italic', 'Italic'], ['bold', 'Bold'], ['bolditalic', 'Bold Italic']], weight && ital ? 'bolditalic' : weight ? 'bold' : ital ? 'italic' : 'regular');
    const fSize = input(fmtNum(parseFloat(cs.fontSize) * 0.75, 1), { inputmode: 'decimal' });
    const col = cssColorToHex(cs.color) || '#000000';
    const fColor = h('input', { type: 'color', value: col, style: { width: '100%', height: '32px', border: '1px solid var(--line)', borderRadius: '7px', padding: '2px' } });
    const fUnder = select([['keep', '(keep as is)'], ['none', '(none)'], ['single', 'Single'], ['double', 'Double'], ['thick', 'Thick'], ['dotted', 'Dotted'], ['dashed', 'Dashed'], ['wavy', 'Wave']], 'keep');
    const strike = checkbox('Strikethrough', qstate('strikeThrough')), supC = checkbox('Superscript', qstate('superscript')), subC = checkbox('Subscript', qstate('subscript'));
    const smallC = checkbox('Small caps', /small-caps/.test(cs.fontVariant)), allC = checkbox('All caps', cs.textTransform === 'uppercase');
    const ls = parseFloat(cs.letterSpacing) || 0;
    const fSpacing = input(fmtNum(ls * 0.75, 2), { inputmode: 'decimal' });
    const prev = h('div', { class: 'preview-box' }, h('span', null, selectionText().slice(0, 40) || 'The quick brown fox · কুইক ব্রাউন'));
    const upd = () => {
      const sp = prev.firstChild;
      const st = fStyle.value;
      ensureFont(fName.value);
      Object.assign(sp.style, { fontFamily: fontStack(fName.value), fontSize: Math.min(40, parseFloat(fSize.value) || 11) + 'pt', fontWeight: /bold/.test(st) ? 700 : 400, fontStyle: /italic/.test(st) ? 'italic' : 'normal', color: fColor.value, textDecorationLine: [fUnder.value !== 'none' && fUnder.value !== 'keep' ? 'underline' : '', strike.input.checked ? 'line-through' : ''].filter(Boolean).join(' ') || 'none', textDecorationStyle: ['double', 'dotted', 'dashed', 'wavy'].includes(fUnder.value) ? fUnder.value : 'solid', fontVariant: smallC.input.checked ? 'small-caps' : 'normal', textTransform: allC.input.checked ? 'uppercase' : 'none', letterSpacing: (parseFloat(fSpacing.value) || 0) + 'pt', verticalAlign: supC.input.checked ? 'super' : subC.input.checked ? 'sub' : 'baseline' });
    };
    [fName, fStyle, fSize, fColor, fUnder, fSpacing].forEach(c => c.addEventListener('input', upd));
    [strike, supC, subC, smallC, allC].forEach(c => c.input.addEventListener('change', () => { if (c === supC && supC.input.checked) subC.input.checked = false; if (c === subC && subC.input.checked) supC.input.checked = false; upd(); }));
    setTimeout(upd, 0);
    const body = h('div', null, dl,
      h('div', { class: 'grid3' }, field('Font', fName, 'dlgFontName'), field('Font style', fStyle, 'dlgFontStyle'), field('Size (pt)', fSize, 'dlgFontSize')),
      h('div', { class: 'grid2' }, field('Font color', fColor, 'dlgFontColor'), field('Underline style', fUnder, 'dlgUnder')),
      h('div', { class: 'dsection' }, 'Effects'),
      h('div', { class: 'grid2' }, h('div', null, strike.el, supC.el, subC.el), h('div', null, smallC.el, allC.el)),
      h('div', { class: 'grid2' }, field('Character spacing (pt, negative condenses)', fSpacing, 'dlgSpacing'), h('div')),
      h('div', { class: 'flabel' }, 'Preview'), prev);
    const init = { name: fName.value, style: fStyle.value, size: fSize.value, color: fColor.value, strike: strike.input.checked, sup: supC.input.checked, sub: subC.input.checked, small: smallC.input.checked, all: allC.input.checked, spacing: fSpacing.value };
    const apply = () => {
      const st = fStyle.value;
      const props = {};
      if (fName.value.trim() && fName.value !== init.name) { props.fontFamily = fontStack(fName.value.trim()); ensureFont(fName.value.trim()); addRecentFont(fName.value.trim()); }
      if (st !== init.style) { props.fontWeight = /bold/.test(st) ? '700' : '400'; props.fontStyle = /italic/.test(st) ? 'italic' : 'normal'; }
      if (fColor.value !== init.color) props.color = fColor.value;
      const pt = parseFloat(fSize.value);
      if (fSize.value !== init.size && pt >= 1 && pt <= 1638) props.fontSize = fmtNum(pt, 1) + 'pt';
      if (fUnder.value === 'none') props.underline = null; else if (fUnder.value !== 'keep') props.underline = fUnder.value;
      if (strike.input.checked !== init.strike) props.strike = strike.input.checked ? true : null;
      if (supC.input.checked !== init.sup || subC.input.checked !== init.sub) props.verticalAlign = supC.input.checked ? 'super' : subC.input.checked ? 'sub' : null;
      if (smallC.input.checked !== init.small) props.fontVariant = smallC.input.checked ? 'small-caps' : null;
      if (allC.input.checked !== init.all) props.textTransform = allC.input.checked ? 'uppercase' : null;
      if (fSpacing.value !== init.spacing) { const lsv = parseFloat(fSpacing.value); props.letterSpacing = lsv ? fmtNum(lsv, 2) + 'pt' : null; }
      if (Object.keys(props).length) applyInline(props);
    };
    openDialog({ title: 'Font', width: 560, body, buttons: [
      { label: 'Set As Default', left: true, onClick: () => { const pt = parseFloat(fSize.value); change(() => { S.doc.font = fName.value.trim() || S.doc.font; if (pt >= 1) S.doc.size = pt; applyDocSettings(); }, { full: true }); Prefs.defaultFont = S.doc.font; Prefs.defaultSize = S.doc.size; savePrefs(); toast(`Default font set to ${S.doc.font}, ${S.doc.size} pt for this and new documents.`); } },
      { label: 'Cancel' }, { label: 'OK', primary: true, onClick: apply }] });
  },
  paragraph() {
    const p = paraInfo();
    if (!p) { toast('Click inside a paragraph first.'); return; }
    const u = Prefs.units;
    const align = select([['left', 'Left'], ['center', 'Centered'], ['right', 'Right'], ['justify', 'Justified'], ['decimal', 'Decimal point (numbers)']], p.align);
    const left = input(fmtLen(p.left + Math.min(0, p.first) * 0), {}), right = input(fmtLen(p.right));
    const special = select([['none', '(none)'], ['first', 'First line'], ['hanging', 'Hanging']], p.first > 0.5 ? 'first' : p.first < -0.5 ? 'hanging' : 'none');
    const by = input(Math.abs(p.first) > 0.5 ? fmtLen(Math.abs(p.first)) : fmtLen(PX.in / 2));
    const before = input(fmtNum(p.before, 1)), after = input(fmtNum(p.after, 1));
    const lineMode = select([['1', 'Single'], ['1.08', '1.08 (default)'], ['1.15', '1.15'], ['1.5', '1.5 lines'], ['2', 'Double'], ['multiple', 'Multiple']], [1, 1.08, 1.15, 1.5, 2].find(v => Math.abs(v - p.line) < 0.01) ? String([1, 1.08, 1.15, 1.5, 2].find(v => Math.abs(v - p.line) < 0.01)) : 'multiple');
    const lineAt = input(fmtNum(p.line, 2));
    const sync = () => { lineAt.disabled = lineMode.value !== 'multiple'; by.disabled = special.value === 'none'; };
    lineMode.addEventListener('change', () => { if (lineMode.value !== 'multiple') lineAt.value = lineMode.value; sync(); });
    special.addEventListener('change', sync);
    sync();
    const body = h('div', null,
      h('div', { class: 'dsection' }, 'General'), h('div', { class: 'grid2' }, field('Alignment', align, 'dpAlign'), h('div')),
      h('div', { class: 'dsection' }, 'Indentation'),
      h('div', { class: 'grid2' }, field(`Left (${u})`, left, 'dpLeft'), field(`Right (${u})`, right, 'dpRight')),
      h('div', { class: 'grid2' }, field('Special', special, 'dpSpecial'), field(`By (${u})`, by, 'dpBy')),
      h('div', { class: 'dsection' }, 'Spacing'),
      h('div', { class: 'grid2' }, field('Before (pt)', before, 'dpBefore'), field('After (pt)', after, 'dpAfter')),
      h('div', { class: 'grid2' }, field('Line spacing', lineMode, 'dpLine'), field('At', lineAt, 'dpLineAt')));
    openDialog({ title: 'Paragraph', width: 520, body, buttons: [{ label: 'Cancel' }, { label: 'OK', primary: true, onClick: () => {
      const L = parseLen(left.value), R = parseLen(right.value), B = parseLen(by.value);
      const first = special.value === 'first' ? B : special.value === 'hanging' ? -B : 0;
      const line = lineMode.value === 'multiple' ? parseFloat(lineAt.value) : parseFloat(lineMode.value);
      applyParagraph({ align: align.value, left: isNaN(L) ? null : L, right: isNaN(R) ? null : R, first: isNaN(first) ? null : first, before: parseFloat(before.value) || 0, after: parseFloat(after.value) || 0, line: line > 0 ? line : null });
    } }] });
  },
  /* Page Setup: the section the caret is in (or the whole document, or from here on), as Word's */
  pageSetup(focusTab) {
    const secs0 = Sections.list(), cur = Sections.selected(), sec = cur[0] || secs0[0];
    const d = sec.pg, u = Prefs.units, multi = secs0.length > 1;
    const mt = input(fmtLen(d.mt)), mb = input(fmtLen(d.mb)), ml = input(fmtLen(d.ml)), mr = input(fmtLen(d.mr)), hd = input(fmtLen(d.hd)), fd = input(fmtLen(d.fd));
    const orient = select([['portrait', 'Portrait'], ['landscape', 'Landscape']], d.orient);
    const size = select([...PAGE_SIZES.map(p => [p.id, `${p.label} (${p.w} × ${p.h} ${p.u})`]), ['Custom', 'Custom size']], PAGE_SIZES.some(p => p.id === d.size) ? d.size : 'Custom');
    const pw = input(fmtLen(Math.min(d.w, d.h))), ph = input(fmtLen(Math.max(d.w, d.h)));
    size.addEventListener('change', () => { const s = pageSizePx(size.value); if (s) { pw.value = fmtLen(s.w); ph.value = fmtLen(s.h); } });
    [pw, ph].forEach(i => i.addEventListener('input', () => { size.value = 'Custom'; }));
    const firstDiff = checkbox('Different first page header and footer', HF.firstOn(sec));
    // where the settings go; a section's start (its break) for a section after the first
    const applyOpts = multi ? [['sect', cur.length > 1 ? 'Selected sections' : 'This section'], ['fwd', 'This point forward'], ['all', 'Whole document']] : [['all', 'Whole document'], ['fwd', 'This point forward']];
    const applyTo = select(applyOpts, applyOpts[0][0]);
    const start = select([['next', 'New page'], ['cont', 'Continuous'], ['even', 'Even page'], ['odd', 'Odd page']], sec.i > 0 ? sec.type : 'next');
    const syncStart = () => { start.disabled = !(applyTo.value === 'fwd' || (applyTo.value === 'sect' && sec.i > 0)); };
    applyTo.addEventListener('change', syncStart);
    syncStart();
    const body = h('div', null,
      h('div', { class: 'dsection' }, `Margins (${u})`),
      h('div', { class: 'grid2' }, field('Top', mt, 'psTop'), field('Bottom', mb, 'psBottom')),
      h('div', { class: 'grid2' }, field('Left', ml, 'psLeft'), field('Right', mr, 'psRight')),
      h('div', { class: 'grid2' }, field('Orientation', orient, 'psOrient'), h('div')),
      h('div', { class: 'dsection' }, 'Paper'),
      field('Paper size', size, 'psSize'),
      h('div', { class: 'grid2' }, field(`Width (${u})`, pw, 'psW'), field(`Height (${u})`, ph, 'psH')),
      h('div', { class: 'dsection' }, 'Layout'),
      h('div', { class: 'grid2' }, field(`Header from edge (${u})`, hd, 'psHd'), field(`Footer from edge (${u})`, fd, 'psFd')),
      firstDiff.el,
      h('div', { class: 'grid2' }, field('Section start', start, 'psStart'), field('Apply to', applyTo, 'psApply')));
    openDialog({ title: 'Page Setup', width: 520, body, focus: focusTab === 'paper' ? '#psSize' : '#psTop', buttons: [{ label: 'Cancel' }, { label: 'OK', primary: true, onClick: () => {
      // what was there stays exact when it wasn't changed (the boxes show it rounded)
      const keep = (inp, px) => (inp.value === fmtLen(px) ? px : parseLen(inp.value));
      const v = { mt: keep(mt, d.mt), mb: keep(mb, d.mb), ml: keep(ml, d.ml), mr: keep(mr, d.mr), hd: keep(hd, d.hd), fd: keep(fd, d.fd) };
      const preset = size.value !== 'Custom' ? pageSizePx(size.value) : null;
      let W = parseLen(pw.value), H = parseLen(ph.value);
      if (preset) { W = preset.w; H = preset.h; } else { W = keep(pw, Math.min(d.w, d.h)); H = keep(ph, Math.max(d.w, d.h)); }
      if (Object.values(v).some(x => isNaN(x) || x < 0) || isNaN(W) || isNaN(H)) { toast('Check the measurements. Use numbers like 1, 2.5 cm or 0.75".', { error: true }); return false; }
      if (W < 144 || H < 144 || W > 2200 || H > 3200) { toast('Paper must be between 1.5 and 22 inches on each side.', { error: true }); return false; }
      if (v.ml + v.mr > Math.min(W, H) - 72 || v.mt + v.mb > Math.max(W, H) - 72) { toast('Those margins leave no room for text. Make them smaller.', { error: true }); return false; }
      if (Story.cur) Story.close();
      const pg = Object.assign(v, { size: size.value, w: Math.min(W, H), h: Math.max(W, H), orient: orient.value });
      const mode = applyTo.value, at = cur.map(x => x.i), first = firstDiff.input.checked, st = start.value;
      change(() => {
        let list = Sections.list(), idx;
        if (mode === 'all') idx = list.map(x => x.i);
        else if (mode === 'fwd') {
          // a new section from the caret (Word puts a Next Page break there), unless one starts there
          if (Sections.startsHere()) idx = list.filter(x => x.i >= at[0]).map(x => x.i);
          else {
            insertBlockAfterCaret(Sections.make(st, list[at[0]]), { split: true });
            list = Sections.list();
            idx = list.filter(x => x.i > at[0]).map(x => x.i);
          }
        } else idx = at;
        for (const i of idx) { const s2 = list[i]; if (!s2) continue; Sections.setPg(s2, pg); Sections.setFirst(s2, first); }
        const s0 = list[idx[0]];
        if (mode !== 'all' && s0 && s0.i > 0 && !start.disabled) Sections.setType(s0, st);
        applyDocSettings();
      }, { full: true });
      HF.refresh();
      if (S.zoomMode !== 'custom') fitZoom();
    } }] });
  },
  /* Page Number Format: the numbers of the section the caret (or the header being edited) is in */
  pageNumberFormat() {
    const sec = HF.curSec(), pn = sec.pn || { start: null, fmt: '1' };
    const fmt = select(Object.entries(PN_FMTS).map(([k, v]) => [k, v]), pn.fmt || '1');
    const mode = select([['cont', sec.i === 0 ? 'Start at 1' : 'Continue from previous section'], ['start', 'Start at']], pn.start != null ? 'start' : 'cont');
    // (a Bangla number goes too: ৫)
    const at = input(String(pn.start != null ? pn.start : 1), { inputmode: 'numeric', 'aria-label': 'Start at' });
    const sync = () => { at.disabled = mode.value !== 'start'; };
    mode.addEventListener('change', () => { sync(); if (!at.disabled) at.focus(); });
    sync();
    const where = Pages.multi() ? `Section ${sec.i + 1}` : 'The document';
    openDialog({ title: 'Page Number Format', width: 420, body: h('div', null,
      field('Number format', fmt, 'pnFmt'),
      h('div', { class: 'dsection' }, 'Page numbering'),
      h('div', { class: 'grid2' }, field('Numbering', mode, 'pnMode'), field('Start at', at, 'pnStart')),
      h('p', { class: 'note' }, `${where}: page numbers in the header and footer use this format.`)),
      focus: '#pnFmt', buttons: [{ label: 'Cancel' }, { label: 'OK', primary: true, onClick: () => {
        const n = parseInt(enDigits(at.value.trim()), 10);
        if (mode.value === 'start' && !(/^[0-9০-৯]+$/.test(at.value.trim()) && n >= 0 && n <= 9999)) { toast('Start at a number from 0 to 9999.', { error: true }); return false; }
        const out = { start: mode.value === 'start' ? n : null, fmt: fmt.value };
        HF.reopen(() => { const s2 = Sections.list()[sec.i]; if (s2) Sections.setPn(s2, out); });
      } }] });
  },
  insertTable() {
    const r = input('3', { type: 'number', min: '1', max: '200' }), c = input('3', { type: 'number', min: '1', max: '40' });
    const st = select(TABLE_PRESETS.map(p => [p.id, p.label]), 'grid');
    openDialog({ title: 'Insert Table', width: 400, body: h('div', null, h('div', { class: 'grid2' }, field('Columns', c, 'itCols'), field('Rows', r, 'itRows')), field('Style', st, 'itStyle')), focus: '#itCols', buttons: [{ label: 'Cancel' }, { label: 'Insert', primary: true, restore: true, onClick: () => { setTimeout(() => Tables.insert(parseInt(r.value, 10) || 3, parseInt(c.value, 10) || 3, st.value), 0); } }] });
  },
  insertField() {
    if (S.readOnly) return;
    const r = getRange() || lastRange;
    const sel = r && !r.collapsed ? r.toString().replace(/[\[\]\n]/g, '').trim().slice(0, 60) : '';
    const name = input(sel, { placeholder: 'For example: Recipient Name', maxlength: '60', 'data-avro': '' });
    openDialog({ title: 'Insert Field', width: 420, focus: name, body: h('div', null,
      h('div', { class: 'field' }, h('label', null, 'Field name'), name),
      h('p', { class: 'note' }, 'The field goes in as [Field name]. Use the same name again to fill several places at once from the Fields pane.')),
      buttons: [{ label: 'Cancel' }, { label: 'Insert', primary: true, onClick: () => {
        const v = name.value.replace(/[\[\]\n]/g, '').trim();
        if (!v || !/\p{L}/u.test(v)) { toast('Give the field a name with at least one letter.'); return false; }
        setTimeout(() => {
          if (lastRange) setRange(lastRange);
          insertTextAtCaret('[' + v + ']');
          const rr = getRange();
          if (rr && rr.startContainer.nodeType === 3) { const n = rr.startContainer, end = rr.startOffset; const x = document.createRange(); x.setStart(n, Math.max(0, end - v.length - 2)); x.setEnd(n, end); setRange(x); }
        }, 0);
      } }] });
  },
  link() {
    if (S.readOnly) return;
    const r = getRange() || lastRange;
    const n = r && (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode);
    const a = n && n.closest && n.closest('a[href]');
    const text = input(a ? a.textContent : (r ? r.toString() : ''), { 'data-avro': '' });
    const url = input(a ? a.getAttribute('href') : '', { placeholder: 'https://example.com or name@example.com', spellcheck: 'false' });
    const headings = Array.from(S.editor.querySelectorAll('h1, h2, h3')).slice(0, 40);
    const place = select([['', 'A web address'], ...headings.map((hd, i) => ['#' + (hd.id || ''), 'Heading: ' + (hd.textContent.trim().slice(0, 50) || 'Untitled')])], '');
    place.addEventListener('change', () => { if (place.value) { url.value = place.value; } });
    const buttons = [{ label: 'Cancel' }, { label: a ? 'Update' : 'Insert', primary: true, onClick: () => {
      let href = url.value.trim();
      if (place.value && place.selectedIndex > 0) { const hd = headings[place.selectedIndex - 1]; if (hd && !hd.id) { hd.id = 'h-' + uid().slice(-7); } href = '#' + hd.id; }
      if (!href) { toast('Enter a web address.'); return false; }
      if (!/^(https?:|mailto:|tel:|#)/i.test(href)) href = /@/.test(href) && !/\//.test(href) ? 'mailto:' + href : 'https://' + href;
      const label = text.value;
      setTimeout(() => {
        if (lastRange) setRange(lastRange);
        change(() => {
          if (a) { a.setAttribute('href', href); if (label && label !== a.textContent) a.textContent = label; return; }
          const rr = getRange();
          if (!rr) return;
          if (rr.collapsed || (label && label !== rr.toString())) {
            if (!rr.collapsed) rr.deleteContents();
            const el = h('a', { href }, label || href);
            rr.insertNode(el);
            caretAfter(el);
          } else { exec('createLink', href); }
        });
      }, 0);
    } }];
    if (a) buttons.unshift({ label: 'Remove Link', left: true, danger: true, onClick: () => { setTimeout(() => change(() => unwrap(a)), 0); } });
    openDialog({ title: a ? 'Edit Link' : 'Insert Link', width: 480, body: h('div', null, field('Text to display', text, 'lkText'), field('Link to', place, 'lkPlace'), field('Address', url, 'lkUrl')), focus: '#lkUrl', buttons });
  },
  /* headers and footers are edited on the page (HF); this opens the one asked for */
  headerFooter(which) { HF.edit(which === 'footer' ? 'footer' : 'header'); },
  watermark() {
    const w = S.doc.watermark || { text: 'DRAFT', color: '#c0c0c0', opacity: 0.45 };
    const t = input(w.text, { maxlength: '60', 'data-avro': '' });
    const c = h('input', { type: 'color', value: w.color || '#c0c0c0', style: { width: '100%', height: '32px', border: '1px solid var(--line)', borderRadius: '7px', padding: '2px' } });
    const o = h('input', { type: 'range', min: '10', max: '90', value: String(Math.round((w.opacity != null ? w.opacity : 0.45) * 100)), style: { width: '100%', accentColor: 'var(--accent)' } });
    const prev = h('div', { class: 'preview-box', style: { height: '120px', position: 'relative' } }, h('span', { style: { transform: 'rotate(-30deg)', fontWeight: 700, fontSize: '34px', fontFamily: 'Calibri, Carlito, sans-serif' } }));
    const upd = () => { const s = prev.firstChild; s.textContent = t.value || ' '; s.style.color = c.value; s.style.opacity = o.value / 100; };
    [t, c, o].forEach(x => x.addEventListener('input', upd));
    upd();
    openDialog({ title: 'Custom Watermark', width: 440, body: h('div', null, field('Text', t, 'wmText'), h('div', { class: 'grid2' }, field('Color', c, 'wmColor'), field('Transparency', o, 'wmOp')), prev), buttons: [{ label: 'Cancel' }, { label: 'Apply', primary: true, onClick: () => setWatermark(t.value.trim() ? { text: t.value.trim(), color: c.value, opacity: o.value / 100 } : null) }] });
  },
  wordCount() {
    const st = docStats();
    const r = getRange() || lastRange;
    const sel = r && !r.collapsed ? r.toString().replace(/\u200B/g, '') : '';
    const rows = [['Pages', S.view === 'web' ? '—' : S.pages], ['Words', st.words], ['Characters (no spaces)', st.charsNoSpace], ['Characters (with spaces)', st.chars], ['Paragraphs', st.paras]];
    if (sel) rows.splice(1, 0, ['Words in selection', countWords(sel)]);
    const tbl = h('table', { class: 'stat-table' }, rows.map(([k, v]) => h('tr', null, h('td', null, k), h('td', null, typeof v === 'number' ? fmtInt(v) : v))));
    const readMin = Math.max(1, Math.round(st.words / 230));
    openDialog({ title: 'Word Count', width: 380, body: h('div', null, tbl, h('p', { class: 'note' }, `About ${readMin} min to read · ${Math.max(1, Math.round(st.words / 130))} min to speak.`)), buttons: [{ label: 'Close', primary: true }] });
  },
  listStart() {
    const i = input('1', { type: 'number', min: '1', max: '9999' });
    openDialog({ title: 'Set Numbering Value', width: 360, body: field('Start at', i, 'lsStart'), buttons: [{ label: 'Cancel' }, { label: 'OK', primary: true, onClick: () => { const n = parseInt(i.value, 10); if (n >= 1) setTimeout(() => setListStart(n), 0); } }] });
  },
  saveQuickPart() {
    const r = getRange() || lastRange;
    if (!r || r.collapsed) { toast('Select the text you want to save first.'); return; }
    const txt = r.toString().trim();
    const name = input(txt.split(/\s+/).slice(0, 4).join(' ').slice(0, 40), { 'data-avro': '' });
    openDialog({ title: 'Save as Quick Part', width: 440, body: h('div', null, field('Name', name, 'qpName'), h('p', { class: 'note' }, 'Type the first two letters of the name (or of the text) anywhere in a document and press Enter to insert it.'), h('div', { class: 'preview-box', style: { height: 'auto', minHeight: '50px', justifyContent: 'flex-start', fontSize: '13px' } }, txt.slice(0, 220) + (txt.length > 220 ? '…' : ''))), buttons: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: () => { setRange(r); QuickParts.saveSelection(name.value); } }] });
  },
  manageQuickParts() {
    const list = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
    const render = () => {
      list.innerHTML = '';
      const items = QuickParts.list();
      if (!items.length) { list.appendChild(h('p', { class: 'empty-note' }, 'No Quick Parts yet. Select text and choose Save Selection as Quick Part.')); return; }
      for (const q of items) {
        const nm = input(q.name, { 'data-avro': '' });
        nm.addEventListener('change', () => QuickParts.rename(q.id, nm.value));
        const ins = h('button', { class: 'btn', type: 'button' }, 'Insert');
        ins.addEventListener('click', () => { dlg.close(); setTimeout(() => QuickParts.insert(q), 0); });
        const del = h('button', { class: 'btn danger', type: 'button' }, 'Delete');
        del.addEventListener('click', () => { QuickParts.remove(q.id); render(); });
        list.appendChild(h('div', { style: { display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '6px', alignItems: 'center' } }, nm, ins, del));
        list.appendChild(h('div', { class: 'note', style: { marginTop: '-4px' } }, q.text.slice(0, 120) + (q.text.length > 120 ? '…' : '')));
      }
    };
    render();
    const dlg = openDialog({ title: 'Quick Parts', width: 520, body: list, buttons: [{ label: 'Done', primary: true }] });
  },
  altText() {
    const img = S.selImg;
    if (!img) { toast('Select a picture first.'); return; }
    const t = h('textarea', { class: 'textarea', rows: '4', placeholder: 'Describe the picture for people who use screen readers.' });
    t.value = img.getAttribute('alt') || '';
    openDialog({ title: 'Alt Text', width: 440, body: field('Description', t, 'altT'), buttons: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: () => change(() => img.setAttribute('alt', t.value.trim())) }] });
  },
  goTo() {
    // (a Bangla number goes too: ২ is page 2)
    const i = input(String(S.curPage || 1), { inputmode: 'numeric', autocomplete: 'off', 'data-avro': '' });
    openDialog({ title: 'Go To Page', width: 340, body: field(`Page number (1–${S.pages})`, i, 'gtPage'), buttons: [{ label: 'Cancel' }, { label: 'Go To', primary: true, onClick: () => goToPage(parseInt(i.value.replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d)), 10) || 1) }] });
  },
  zoom() {
    const pct = input(String(Math.round(S.zoom * 100)), { type: 'number', min: '25', max: '300' });
    const choices = h('div', { class: 'chips', style: { marginBottom: '12px' } }, [['200%', () => setZoom(2)], ['150%', () => setZoom(1.5)], ['100%', () => setZoom(1)], ['75%', () => setZoom(0.75)], ['Page width', () => CMD.pageWidth()], ['Whole page', () => CMD.onePage()], ['Many pages', () => CMD.multiPage()]].map(([l, f]) => { const b = h('button', { class: 'chip', type: 'button' }, l); b.addEventListener('click', () => { f(); dlg.close(); }); return b; }));
    const dlg = openDialog({ title: 'Zoom', width: 400, body: h('div', null, choices, field('Percent', pct, 'zmPct')), buttons: [{ label: 'Cancel' }, { label: 'OK', primary: true, onClick: () => setZoom((parseInt(pct.value, 10) || 100) / 100) }] });
  },
  shortcuts() {
    const rows = [
      ['Bold, italic, underline', `${MOD}+B · ${MOD}+I · ${MOD}+U`], ['Undo · redo', `${MOD}+Z · ${MOD}+Y`], ['Save now', `${MOD}+S`], ['Print', `${MOD}+P`], ['Find · replace', `${MOD}+F · ${MOD}+H`],
      ['Align left, center, right, justify', `${MOD}+L · E · R · J`], ['Heading 1, 2, 3', `${MOD}+Alt+1 · 2 · 3`], ['Normal style', `${MOD}+Shift+N`], ['Bullets', `${MOD}+Shift+L`],
      ['Bigger · smaller text', `${MOD}+Shift+> · <`], ['Subscript · superscript', `${MOD}+= · ${MOD}+Shift++`], ['Line spacing 1 · 1.5 · 2', `${MOD}+1 · 5 · 2`], ['Indent · outdent', `${MOD}+M · ${MOD}+Shift+M`],
      ['Insert link', `${MOD}+K`], ['Page break', `${MOD}+Enter`], ['Line break in a paragraph', 'Shift+Enter'], ['New comment', `${MOD}+Alt+M`], ['Insert footnote', `${MOD}+Alt+F`], ['Insert endnote', `${MOD}+Alt+D`], ['Track changes', `${MOD}+Shift+E`],
      ['Word count', `${MOD}+Shift+G`], ['Font dialog', `${MOD}+D`], ['Change case', 'Shift+F3'], ['Copy · paste formatting', `${MOD}+Shift+C · ${MOD}+Shift+V`], ['Remove character formatting', `${MOD}+Space`],
      ['Paste as plain text', `${MOD}+Shift+V`], ['Show formatting marks', `${MOD}+Shift+8`], ['Bangla keyboard (Avro or Bijoy) on · off', 'F12'], ['Bijoy keyboard on · off', 'Ctrl+Alt+B'], ['Next field · previous field', 'F11 · Shift+F11'], ['Go to page', `${MOD}+G`], ['Export (instead of print)', `${MOD}+P`], ['Open a file', `${MOD}+O`], ['Hide the ribbon', `${MOD}+F1`],
      ['Next table cell · add a row at the end', 'Tab'], ['Accept a Quick Part suggestion', 'Enter or Tab'],
    ];
    openDialog({ title: 'Keyboard Shortcuts', width: 560, body: h('table', { class: 'kbd-table' }, rows.map(([a, b]) => h('tr', null, h('td', null, a), h('td', null, h('kbd', null, b))))), buttons: [{ label: 'Close', primary: true }] });
  },
};
