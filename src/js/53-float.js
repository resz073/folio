/* ===================== Floating editor UI ===================== */
const MiniBar = {
  el: null,
  build() {
    const btn = (ic, tip, fn, extra) => { const b = h('button', { class: 'rb', type: 'button', title: tip, 'aria-label': tip, html: icon(ic) }); b.addEventListener('mousedown', e => e.preventDefault()); b.addEventListener('click', () => { fn(b); if (!extra) this.hide(); }); return b; };
    const sz = h('button', { class: 'rb', type: 'button', title: 'Font size', style: { minWidth: '38px', fontSize: '12px', fontVariantNumeric: 'tabular-nums' } }, '11');
    sz.addEventListener('mousedown', e => e.preventDefault());
    sz.addEventListener('click', () => Menu.open(sz, FONT_SIZES.map(s => ({ label: String(s), onClick: () => setFontSize(s) }))));
    this.sz = sz;
    const hl = btn('highlight', 'Highlight', () => CMD.highlight(), true);
    hl.classList.add('has-bar'); hl.appendChild(h('span', { class: 'cbar', style: { background: Prefs.highlight } }));
    const fc = btn('fontcolor', 'Font color', () => CMD.fontColor(), true);
    fc.classList.add('has-bar'); fc.appendChild(h('span', { class: 'cbar', style: { background: Prefs.fontColor } }));
    this.el = h('div', { class: 'float mini-tb', role: 'toolbar', 'aria-label': 'Formatting' },
      sz, btn('grow', 'Increase font size', () => growFont(1), true), btn('shrink', 'Decrease font size', () => growFont(-1), true), h('span', { class: 'rsep' }),
      btn('bold', 'Bold', () => CMD.bold(), true), btn('italic', 'Italic', () => CMD.italic(), true), btn('underline', 'Underline', () => CMD.underline(), true), hl, fc, h('span', { class: 'rsep' }),
      btn('bullets', 'Bullets', () => CMD.bullets()), btn('link', 'Link', () => Dialogs.link()), btn('commentAdd', 'New comment', () => Comments.add()),
      Cap.sample ? btn('sparkle', 'Improve with Claude', () => runAssistant('improve')) : null);
    this.el.addEventListener('mousedown', e => e.preventDefault());
    $('#floatRoot').appendChild(this.el);
  },
  show(r) {
    if (!this.el || (Cap.sample && !this.el.querySelector('[title="Improve with Claude"]'))) { if (this.el) this.el.remove(); this.build(); }
    const rects = r.getClientRects();
    const first = rects[0] || r.getBoundingClientRect();
    this.sz.textContent = fmtNum(parseFloat(curComputed().fontSize) * 0.75, 1);
    this.el.style.display = 'flex';
    const w = this.el.offsetWidth, hh = this.el.offsetHeight;
    let x = first.left, y = first.top - hh - 10;
    if (y < 60) { const last = rects[rects.length - 1] || first; y = last.bottom + 10; }
    x = clamp(x, 8, window.innerWidth - w - 8);
    this.el.style.left = x + 'px';
    this.el.style.top = y + 'px';
    this.el.querySelectorAll('.cbar')[0].style.background = Prefs.highlight;
    this.el.querySelectorAll('.cbar')[1].style.background = Prefs.fontColor;
  },
  hide() { if (this.el) this.el.style.display = 'none'; },
};
const LinkBubble = {
  el: null, a: null,
  check(r) {
    if (!r || !r.collapsed) { this.hide(); return; }
    const n = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
    const a = n && n.closest && n.closest('a[href]');
    if (!a || !S.editor.contains(a)) { this.hide(); return; }
    this.show(a);
  },
  show(a) {
    this.a = a;
    if (!this.el) { this.el = h('div', { class: 'float bubble', role: 'dialog', 'aria-label': 'Link' }); $('#floatRoot').appendChild(this.el); this.el.addEventListener('mousedown', e => { if (!e.target.closest('a')) e.preventDefault(); }); }
    const href = a.getAttribute('href') || '';
    const internal = href.startsWith('#');
    this.el.innerHTML = '';
    const link = internal ? h('button', { class: 'link-btn', type: 'button', style: { color: 'var(--accent-text)' } }, 'Go to heading') : h('a', { href, target: '_blank', rel: 'noopener noreferrer', title: href }, href);
    if (internal) link.addEventListener('click', () => openLink(href));
    const edit = h('button', { class: 'link-btn', type: 'button' }, 'Edit');
    edit.addEventListener('click', () => { this.hide(); Dialogs.link(); });
    const rm = h('button', { class: 'link-btn', type: 'button' }, 'Remove');
    rm.addEventListener('click', () => { const el = this.a; this.hide(); change(() => unwrap(el)); });
    this.el.append(h('span', { html: icon('link') }), link, edit, rm);
    const rect = a.getBoundingClientRect();
    this.el.style.display = 'flex';
    this.el.style.left = clamp(rect.left, 8, window.innerWidth - this.el.offsetWidth - 8) + 'px';
    this.el.style.top = (rect.bottom + 6) + 'px';
  },
  hide() { if (this.el) this.el.style.display = 'none'; this.a = null; },
};
const PasteChip = {
  el: null, timer: 0,
  show() {
    clearTimeout(this.timer);
    if (!this.el) { this.el = h('div', { class: 'float bubble paste-chip', role: 'toolbar', 'aria-label': 'Paste options' }); $('#floatRoot').appendChild(this.el); this.el.addEventListener('mousedown', e => e.preventDefault()); }
    this.el.innerHTML = '';
    const mk = (mode, label) => { const b = h('button', { class: 'chip', type: 'button', 'aria-pressed': Paste.mode === mode ? 'true' : 'false', style: Paste.lastUsed === mode ? { borderColor: 'var(--accent)', color: 'var(--accent-text)' } : null }, label); b.addEventListener('click', () => this.redo(mode)); return b; };
    this.el.append(h('span', { class: 'k', style: { color: 'var(--ink-3)' } }, 'Paste:'), mk('keep', 'Keep formatting'), mk('merge', 'Match this document'), mk('text', 'Text only'));
    const rect = caretRect();
    this.el.style.display = 'flex';
    if (rect) { this.el.style.left = clamp(rect.left, 8, window.innerWidth - this.el.offsetWidth - 8) + 'px'; this.el.style.top = Math.min(window.innerHeight - 50, rect.bottom + 8) + 'px'; }
    this.timer = setTimeout(() => this.hide(), 7000);
    const off = () => { this.hide(); S.editor.removeEventListener('keydown', off); };
    S.editor.addEventListener('keydown', off);
  },
  redo(mode, opts = {}) {
    this.hide();
    const last = Paste.last;
    if (!last || Paste.beforeIdx == null || Paste.beforeIdx < 0) return;
    Hist.idx = Paste.beforeIdx;
    histApply(Hist.stack[Hist.idx], Hist.stack[Hist.idx + 1] ? Hist.stack[Hist.idx + 1].before : Hist.stack[Hist.idx].sel);
    Hist.stack.length = Hist.idx + 1;
    Paste.lastUsed = mode;
    // Keep Bijoy: the same paste again, its Bijoy text left as it was (and so for this paste's other choices)
    if (opts.noBijoy != null) Paste.noBijoy = opts.noBijoy;
    doPaste(mode, last.html, last.text, false, { noBijoy: !!Paste.noBijoy });
    if (opts.noBijoy) toast('Pasted as it was, in its Bijoy font.');
    else toast(mode === 'text' ? 'Pasted as plain text.' : mode === 'merge' ? 'Pasted with this document’s formatting.' : 'Pasted with source formatting.');
  },
  hide() { if (this.el) this.el.style.display = 'none'; },
};
