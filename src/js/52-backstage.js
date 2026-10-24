/* ===================== File backstage ===================== */
const Backstage = {
  page: 'home',
  open(page = 'home') {
    if (Story.cur) Story.close();
    Menu.close();
    if (Find.open_) Find.close();
    const bs = $('#backstage');
    bs.hidden = false;
    this.show(page);
    document.addEventListener('keydown', this._esc = e => { if (e.key === 'Escape' && !document.querySelector('.backdrop')) { e.preventDefault(); this.close(); } }, true);
  },
  close() {
    $('#backstage').hidden = true;
    document.removeEventListener('keydown', this._esc, true);
    this.leave();
    focusEditor();
  },
  /* what a page keeps while it is open (the print preview's painted pages) */
  leave() {
    if (this._prOff) { this._prOff(); this._prOff = null; }
    PrintJob.release();
  },
  nav() {
    const items = [['home', 'Home', 'home'], ['new', 'New', 'newdoc'], ['open', 'Open', 'folder'], ['info', 'Info', 'info'], ['history', 'Version History', 'history'], ['copy', 'Save a Copy', 'duplicate'], ['print', 'Print', 'print'], ['export', 'Export', 'download'], ['options', 'Options', 'gear']];
    const nav = h('nav', { class: 'bs-nav', 'aria-label': 'File' });
    const back = h('button', { class: 'back', type: 'button', title: 'Back to document (Esc)' }, h('span', { html: icon('back') }), h('span', { class: 't' }, 'Back'));
    back.addEventListener('click', () => this.close());
    nav.append(back, h('div', { class: 'brand-sm' }, 'Folio'));
    for (const [id, label, ic] of items) {
      const b = h('button', { type: 'button', 'aria-current': this.page === id ? 'page' : null }, h('span', { html: icon(ic) }), h('span', { class: 't' }, label));
      b.addEventListener('click', () => this.show(id));
      nav.appendChild(b);
    }
    return nav;
  },
  async show(page) {
    this.leave();
    this.page = page;
    const bs = $('#backstage');
    bs.innerHTML = '';
    const main = h('main', { class: 'bs-main' });
    bs.append(this.nav(), main);
    try { await this['p_' + page](main); } catch (e) { console.error(e); main.appendChild(h('p', { class: 'note' }, 'Something went wrong loading this page.')); }
  },
  greeting() { const hr = new Date().getHours(); return hr < 5 ? 'Good evening' : hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening'; },
  tplGrid(list) {
    const grid = h('div', { class: 'tpl-grid' });
    for (const t of list) {
      const thumb = h('div', { class: 'thumb' });
      const b = h('button', { class: 'tpl', type: 'button', title: t.desc || t.name }, thumb, h('span', { class: 'tname' }, t.name));
      b.addEventListener('click', () => { this.close(); newFromTemplate(t.id); });
      grid.appendChild(b);
      requestAnimationFrame(() => {
        const w = thumb.clientWidth || 150;
        const built = t.build();
        const mini = h('div', { class: 'mini doc', html: built.html });
        stripBlockWhitespace(mini);
        mini.style.setProperty('--doc-font', fontStack(built.over && built.over.font || 'Calibri'));
        mini.style.setProperty('--doc-size', (built.over && built.over.size || 11) + 'pt');
        mini.style.transform = `scale(${w / 794})`;
        mini.querySelectorAll('img').forEach(i => i.remove());
        thumb.appendChild(mini);
      });
    }
    return grid;
  },
  async docTable(filter) {
    const wrap = h('div');
    let list = [];
    try { list = await Store.impl.list(); } catch (e) { wrap.appendChild(h('p', { class: 'note' }, 'Your documents could not be loaded. Try again in a moment.')); return wrap; }
    list.sort((a, b) => (b.modified || 0) - (a.modified || 0));
    const q = (filter || '').toLowerCase();
    if (q) list = list.filter(d => (d.title || '').toLowerCase().includes(q) || (d.preview || '').toLowerCase().includes(q));
    if (!list.length) { wrap.appendChild(h('p', { class: 'empty-note' }, q ? 'No documents match.' : 'No saved documents yet. Anything you write is saved automatically.')); return wrap; }
    const tbl = h('table', { class: 'doc-list' }, h('thead', null, h('tr', null, h('th', null, 'Name'), h('th', { class: 'hide-sm' }, 'Words'), h('th', null, 'Modified'), h('th', null, ''))));
    const tb = h('tbody');
    for (const d of list) {
      const isCur = S.doc && S.doc.id === d.id;
      const row = h('tr', { class: 'row' },
        h('td', null, h('div', { class: 'dname' }, h('span', { html: icon('doc') }), h('span', null, d.title || 'Untitled document', isCur ? h('span', { class: 'note' }, '  · open now') : null)), h('div', { class: 'note', style: { marginTop: '2px', maxWidth: '520px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, d.preview || '')),
        h('td', { class: 'muted hide-sm' }, fmtInt(d.words || 0)),
        h('td', { class: 'muted' }, fmtWhen(d.modified)),
        h('td', { class: 'acts' }));
      const acts = row.lastChild;
      const mk = (ic, title, fn) => { const b = h('button', { type: 'button', title, 'aria-label': title, html: icon(ic) }); b.addEventListener('click', e => { e.stopPropagation(); fn(); }); return b; };
      acts.append(
        mk('edit', 'Rename', async () => { const nm = await promptName('Rename document', d.title || ''); if (nm == null) return; if (isCur) { S.doc.title = nm; $('#docTitle').value = nm; Saver.mark(); await Saver.flush(); } else { const full = await Store.impl.load(d.id); if (full) { full.title = nm; await Store.impl.save(full); } } this.show(this.page); }),
        mk('duplicate', 'Make a copy', async () => { const full = isCur ? snapshotDoc() : await Store.impl.load(d.id); if (!full) return; const copy = Object.assign({}, full, { id: uid('d'), title: (full.title || 'Document') + ' (copy)', created: Date.now(), modified: Date.now() }); await Store.impl.save(copy); toast('Copy saved.'); this.show(this.page); }),
        mk('trash', 'Delete', async () => { if (!(await confirmDialog(`Delete “${d.title || 'Untitled document'}”? This can’t be undone.`, 'Delete', true))) return; await Store.impl.remove(d.id); if (isCur) { const nd = newDocModel(); openDoc(nd, { fresh: true }); } toast('Deleted.'); this.show(this.page); }));
      row.addEventListener('click', async () => { if (isCur) { this.close(); return; } await openStored(d.id); this.close(); });
      tb.appendChild(row);
    }
    tbl.appendChild(tb);
    wrap.appendChild(tbl);
    return wrap;
  },
  async p_home(m) {
    m.appendChild(h('h1', null, this.greeting()));
    m.appendChild(h('h2', null, 'New'));
    m.appendChild(this.tplGrid(TEMPLATES.slice(0, 6)));
    const more = h('button', { class: 'link-btn', type: 'button', style: { marginTop: '8px', color: 'var(--accent-text)', fontWeight: 600 } }, 'More templates →');
    more.addEventListener('click', () => this.show('new'));
    m.appendChild(more);
    m.appendChild(h('h2', null, 'Recent'));
    m.appendChild(await this.docTable());
    m.appendChild(h('p', { class: 'note', style: { marginTop: '18px' } }, Store.cloud ? 'Documents are saved to your Claude account automatically and follow you to other devices.' : 'Documents are saved in this browser. Open Folio inside Claude while signed in to keep them in your account.'));
  },
  async p_new(m) {
    m.appendChild(h('h1', null, 'New'));
    m.appendChild(this.tplGrid(TEMPLATES));
  },
  async p_open(m) {
    m.appendChild(h('h1', null, 'Open'));
    const dz = h('div', { class: 'dropzone' },
      h('div', { style: { fontWeight: 600, fontSize: '15px', marginBottom: '6px' } }, 'Open a file from this device'),
      h('div', { class: 'note', style: { marginBottom: '12px' } }, 'Word documents (.docx), web pages (.html), Markdown (.md) and plain text (.txt). Drop files here or browse.'));
    const browse = h('button', { class: 'btn primary', type: 'button' }, h('span', { html: icon('upload') }), 'Browse…');
    browse.addEventListener('click', () => pickFile('.docx,.dotx,.html,.htm,.md,.markdown,.txt', true, async files => { this.close(); await Files.openFiles(files); }));
    dz.appendChild(browse);
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('over'));
    dz.addEventListener('drop', async e => { e.preventDefault(); dz.classList.remove('over'); const f = Array.from(e.dataTransfer.files || []); if (f.length) { this.close(); await Files.openFiles(f); } });
    m.appendChild(dz);
    m.appendChild(h('h2', null, 'Your documents'));
    const search = h('input', { class: 'input', 'data-avro': '', placeholder: 'Search documents', style: { maxWidth: '360px', marginBottom: '12px' }, autocomplete: 'off', id: 'bsSearch' });
    const holder = h('div');
    m.append(search, holder);
    const run = async () => { holder.innerHTML = ''; holder.appendChild(await this.docTable(search.value)); };
    search.addEventListener('input', debounce(run, 200));
    await run();
  },
  async p_info(m) {
    const d = S.doc;
    const st = docStats();
    m.appendChild(h('h1', null, d.title || 'Untitled document'));
    const prop = (label, key, sub) => {
      const inp = h('input', { 'aria-label': label, 'data-avro': '' });
      inp.value = sub ? (d.props[key] || '') : (d[key] || '');
      inp.addEventListener('change', () => { if (sub) d.props[key] = inp.value; else { d[key] = inp.value; if (key === 'title') $('#docTitle').value = inp.value; } Saver.mark(); });
      return h('tr', null, h('td', null, label), h('td', null, inp));
    };
    const props = h('table', { class: 'prop-table' }, prop('Title', 'title'), prop('Author', 'author', true), prop('Subject', 'subject', true), prop('Tags', 'keywords', true),
      h('tr', null, h('td', null, 'Created'), h('td', null, new Date(d.created).toLocaleString())), h('tr', null, h('td', null, 'Modified'), h('td', null, new Date(d.modified || Date.now()).toLocaleString())),
      h('tr', null, h('td', null, 'Saved'), h('td', null, Store.cloud ? 'In your Claude account' : 'In this browser')));
    const stats = h('table', { class: 'stat-table' }, [['Pages', S.pages], ['Words', st.words], ['Characters', st.chars], ['Paragraphs', st.paras], ['Comments', d.comments.length], ['Pictures', S.editor.querySelectorAll('img').length]].map(([k, v]) => h('tr', null, h('td', null, k), h('td', null, fmtInt(v)))));
    const hist = h('button', { class: 'btn', type: 'button' }, h('span', { html: icon('history') }), 'Version History');
    hist.addEventListener('click', () => this.show('history'));
    const protect = h('button', { class: 'btn', type: 'button' }, h('span', { html: icon('lock') }), S.readOnly ? 'Allow editing' : 'Make read-only');
    protect.addEventListener('click', () => { setReadOnly(!S.readOnly); this.show('info'); });
    m.appendChild(h('div', { class: 'info-grid' }, h('div', null, h('h2', { style: { marginTop: 0 } }, 'Properties'), props, h('h2', null, 'Versions'), h('p', { class: 'note' }, 'Folio keeps earlier versions as you work. Look at one, see what changed since, or go back to it.'), hist, h('h2', null, 'Protect document'), h('p', { class: 'note' }, 'Read-only mode stops accidental edits on this device. Anyone with the document can still turn it off.'), protect), h('div', null, h('h2', { style: { marginTop: 0 } }, 'Statistics'), stats)));
  },
  async p_history(m) { await Versions.page(m); },
  async p_copy(m) {
    m.appendChild(h('h1', null, 'Save a Copy'));
    const dup = h('button', { class: 'export-item', type: 'button' }, h('span', { class: 'ext', style: { background: 'var(--accent)' } }, 'COPY'), h('span', null, h('div', { class: 'et' }, 'Duplicate this document'), h('div', { class: 'ed' }, 'Saves a separate copy next to the original and opens it.')));
    dup.addEventListener('click', async () => { await Saver.flush(); const cur = snapshotDoc(); const copy = Object.assign({}, cur, { id: uid('d'), title: (cur.title || 'Document') + ' (copy)', created: Date.now(), modified: Date.now() }); await Store.impl.save(copy); openDoc(copy, { fresh: true }); this.close(); toast('Copy opened. The original is unchanged.'); });
    const tpl = h('button', { class: 'export-item', type: 'button' }, h('span', { class: 'ext', style: { background: '#7a3e9d' } }, 'PART'), h('span', null, h('div', { class: 'et' }, 'Save selection as a Quick Part'), h('div', { class: 'ed' }, 'Reuse an address, signature or clause by typing its first letters.')));
    tpl.addEventListener('click', () => { this.close(); setTimeout(() => Dialogs.saveQuickPart(), 50); });
    m.appendChild(h('div', { class: 'export-list' }, dup, tpl));
    m.appendChild(h('p', { class: 'note', style: { marginTop: '16px' } }, 'To download the document as a Word or PDF file, use Export.'));
  },
  async p_export(m) {
    m.appendChild(h('h1', null, 'Export'));
    const quality = select([['vector', 'Sharp text (best)'], ['image3', 'Page pictures, print quality'], ['image2', 'Page pictures, smaller file']], 'vector', { id: 'pdfQuality', style: { maxWidth: '100%' } });
    const marks = h('input', { type: 'checkbox', id: 'pdfMarks', checked: true });
    const pdfOpts = () => quality.value === 'vector' ? { mode: 'vector', bookmarks: marks.checked } : { mode: 'image', scale: quality.value === 'image3' ? 3 : 2, quality: 0.9 };
    const item = (ext, color, title, desc, fn, extra) => { const b = h('button', { class: 'export-item', type: 'button' }, h('span', { class: 'ext', style: { background: color } }, ext), h('span', null, h('div', { class: 'et' }, title), h('div', { class: 'ed' }, desc))); b.addEventListener('click', fn); return extra ? h('div', null, b, extra) : b; };
    m.appendChild(h('div', { class: 'export-list' },
      item('DOCX', '#2f5597', 'Word document', 'Opens in Microsoft Word, Google Docs and LibreOffice with styles, lists, tables, pictures, headers and comments.', () => { this.close(); Files.export('docx'); }),
      item('PDF', '#b42318', 'PDF', 'Exactly what you see on the pages, ready to print or send. Text is real text in the document’s fonts: sharp at any zoom, searchable and copyable, and links work.', () => { const o = pdfOpts(); this.close(); Files.export('pdf', o); },
        h('div', { style: { margin: '6px 0 0 60px', display: 'flex', flexWrap: 'wrap', gap: '8px 16px', alignItems: 'center' } }, quality, h('label', { class: 'chk', for: 'pdfMarks' }, marks, ' Bookmarks from headings'))),
      item('HTML', '#c2410c', 'Web page', 'A single page you can open in any browser or paste into an email.', () => { this.close(); Files.export('html'); }),
      item('MD', '#3f3f46', 'Markdown', 'Plain text with headings, lists and tables marked up. Good for notes and code repositories.', () => { this.close(); Files.export('md'); }),
      item('TXT', '#6b7280', 'Plain text', 'Just the words, no formatting.', () => { this.close(); Files.export('txt'); })));
    m.appendChild(h('p', { class: 'note', style: { marginTop: '18px', maxWidth: '640px' } }, 'To print, use Print (' + MOD + '+P): it shows the pages and makes a PDF that opens ready to print.'));
  },
  /* Word's print screen: settings on the left, the pages on the right */
  async p_print(m) {
    m.classList.add('bs-print');
    m.appendChild(h('h1', null, 'Print'));
    const o = this._pr = Object.assign({ copies: 1, collate: true, duplex: 'none', range: 'all', custom: '' }, this._pr ? { collate: this._pr.collate, duplex: this._pr.duplex } : null, { copies: 1, range: 'all', custom: '' });
    o.autoPrint = Prefs.printOpen !== false;
    const g0 = geom();
    // the Print button and copies
    const go = h('button', { class: 'btn primary pr-btn', type: 'button' }, h('span', { html: icon('print') }), 'Print');
    const copies = input('1', { type: 'number', min: '1', max: '99', inputmode: 'numeric', id: 'prCopies', 'aria-label': 'Copies' });
    // settings
    const range = select([['all', 'Print All Pages'], ['current', 'Print Current Page'], ['custom', 'Custom Print']], 'all', { id: 'prRange', 'aria-label': 'Pages to print' });
    const pages = input('', { id: 'prPages', placeholder: 'For example 1-3, 5', 'aria-label': 'Pages', 'aria-describedby': 'prErr' });
    const err = h('div', { class: 'pr-err', id: 'prErr', role: 'status' });
    const sides = select([['none', 'Print One Sided'], ['long', 'Print on Both Sides, flip on long edge'], ['short', 'Print on Both Sides, flip on short edge']], o.duplex, { id: 'prSides', 'aria-label': 'Sides' });
    const collate = select([['1', 'Collated: 1,2,3 1,2,3 1,2,3'], ['0', 'Uncollated: 1,1,1 2,2,2 3,3,3']], o.collate ? '1' : '0', { id: 'prCollate', 'aria-label': 'Collation' });
    const orient = select([['portrait', 'Portrait Orientation'], ['landscape', 'Landscape Orientation']], S.doc.page.orient === 'landscape' ? 'landscape' : 'portrait', { id: 'prOrient', 'aria-label': 'Orientation' });
    const sizeOpts = PAGE_SIZES.map(p => [p.id, `${p.label}: ${p.w} × ${p.h} ${p.u === 'in' ? 'in' : 'mm'}`]);
    if (!PAGE_SIZES.some(p => p.id === S.doc.page.size)) sizeOpts.push(['_custom', `Custom size: ${fmtLen(g0.w)} × ${fmtLen(g0.h)}`]);
    const paper = select(sizeOpts, PAGE_SIZES.some(p => p.id === S.doc.page.size) ? S.doc.page.size : '_custom', { id: 'prPaper', 'aria-label': 'Paper size' });
    const pg = S.doc.page;
    const mPre = MARGIN_PRESETS.find(x => pg.mt === x.t && pg.mb === x.b && pg.ml === x.l && pg.mr === x.r);
    const mOpts = MARGIN_PRESETS.map(x => [x.id, `${x.label} Margins: ${x.t === x.b && x.l === x.r && x.t === x.l ? fmtLen(x.t) + ' all round' : `top ${fmtLen(x.t)}, left ${fmtLen(x.l)}`}`]);
    if (!mPre) mOpts.push(['_custom', `Custom Margins: top ${fmtLen(pg.mt)}, left ${fmtLen(pg.ml)}`]);
    const margins = select(mOpts, mPre ? mPre.id : '_custom', { id: 'prMargins', 'aria-label': 'Margins' });
    const openChk = checkbox('Open the print dialog when the PDF opens', o.autoPrint, 'prOpen');
    const note = h('div', { class: 'pr-note' }, h('span', { html: icon('info') }), h('span', null, 'Folio can’t reach your printer from inside Claude. Print saves a PDF made for printing, at actual size; open it and choose your printer.'));
    const set = h('div', { class: 'pr-set' },
      h('div', { class: 'pr-top' }, go, h('label', { class: 'pr-copies', for: 'prCopies' }, 'Copies', copies)),
      note,
      h('h2', null, 'Settings'),
      range, h('div', { class: 'pr-pages' }, h('label', { for: 'prPages' }, 'Pages'), pages), err,
      sides, collate, orient, paper, margins,
      openChk.el);
    // preview
    const stage = h('div', { class: 'pr-stage', tabindex: '0', 'aria-label': 'Print preview' }, h('div', { class: 'pr-wait' }, 'Preparing the preview…'));
    const prevB = h('button', { class: 'tb-btn', type: 'button', title: 'Previous page', 'aria-label': 'Previous page', html: icon('prev') });
    const nextB = h('button', { class: 'tb-btn', type: 'button', title: 'Next page', 'aria-label': 'Next page', html: icon('next') });
    const where = h('span', { class: 'pr-where', 'aria-live': 'polite' });
    const view = h('div', { class: 'pr-view' }, stage, h('div', { class: 'pr-nav' }, prevB, where, nextB));
    m.appendChild(h('div', { class: 'pr-grid' }, set, view));

    let list = [], at = 0, ready = false;
    const pick = () => {
      const r = PrintJob.chosen({ range: range.value, custom: pages.value });
      err.textContent = r.error || '';
      pages.classList.toggle('bad', !!r.error);
      go.disabled = !!r.error || !ready;
      return r.pages;
    };
    const draw = () => {
      const P = PrintJob.P;
      if (!P) return;
      list = pick();
      at = clamp(at, 0, Math.max(0, list.length - 1));
      prevB.disabled = at <= 0; nextB.disabled = at >= list.length - 1;
      if (!list.length) { stage.replaceChildren(h('div', { class: 'pr-wait' }, 'No pages to show.')); where.textContent = ''; return; }
      const i = list[at], g = Pages.g(i);
      where.textContent = `${at + 1} of ${list.length}` + (list.length !== S.pages || i !== at ? `  ·  page ${i + 1} of the document` : '');
      const sw = Math.max(120, stage.clientWidth - 40), sh = Math.max(160, stage.clientHeight - 40);
      const fit = Math.min(sw / g.w, sh / g.h);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cv = paintPage(P, i, fit * dpr);
      cv.style.width = Math.round(g.w * fit) + 'px';
      cv.style.height = Math.round(g.h * fit) + 'px';
      cv.setAttribute('role', 'img');
      cv.setAttribute('aria-label', `Page ${i + 1}`);
      stage.replaceChildren(cv);
    };
    const refresh = async () => {
      ready = false; go.disabled = true;
      stage.replaceChildren(h('div', { class: 'pr-wait' }, 'Preparing the preview…'));
      await PrintJob.prepare();
      if (this.page !== 'print') return;
      ready = true;
      range.options[1].textContent = `Print Current Page (page ${S.curPage || 1})`;
      draw();
    };
    // a setting that changes the document (as in Word): lay it out again
    const page = async over => { setPage(over); Layout.full(); await refresh(); };
    range.addEventListener('change', () => { if (range.value === 'custom') pages.focus(); else pages.value = ''; at = 0; draw(); });
    pages.addEventListener('input', () => { if (pages.value.trim() && range.value !== 'custom') range.value = 'custom'; at = 0; draw(); });
    copies.addEventListener('change', () => { copies.value = String(clamp(parseInt(copies.value, 10) || 1, 1, 99)); });
    sides.addEventListener('change', () => { o.duplex = sides.value; });
    collate.addEventListener('change', () => { o.collate = collate.value === '1'; });
    openChk.input.addEventListener('change', () => { Prefs.printOpen = openChk.input.checked; savePrefs(); });
    orient.addEventListener('change', () => page({ orient: orient.value }));
    paper.addEventListener('change', () => { if (paper.value === '_custom') return; const s = pageSizePx(paper.value); page({ size: paper.value, w: s.w, h: s.h }); });
    margins.addEventListener('change', () => { const x = MARGIN_PRESETS.find(p => p.id === margins.value); if (x) page({ mt: x.t, mb: x.b, ml: x.l, mr: x.r }); });
    prevB.addEventListener('click', () => { at--; draw(); });
    nextB.addEventListener('click', () => { at++; draw(); });
    stage.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'ArrowUp') { e.preventDefault(); if (at > 0) { at--; draw(); } }
      else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === 'ArrowDown') { e.preventDefault(); if (at < list.length - 1) { at++; draw(); } }
      else if (e.key === 'Home') { e.preventDefault(); at = 0; draw(); }
      else if (e.key === 'End') { e.preventDefault(); at = list.length - 1; draw(); }
    });
    stage.addEventListener('wheel', e => { if (e.ctrlKey || Math.abs(e.deltaY) < 30) return; const k = at + (e.deltaY > 0 ? 1 : -1); if (k >= 0 && k < list.length) { e.preventDefault(); at = k; draw(); } }, { passive: false });
    const onResize = debounce(() => { if (this.page === 'print') draw(); }, 120);
    window.addEventListener('resize', onResize);
    this._prOff = () => window.removeEventListener('resize', onResize);
    go.addEventListener('click', async () => {
      const chosen = pick();
      if (!chosen.length) return;
      const job = { pages: chosen, copies: clamp(parseInt(copies.value, 10) || 1, 1, 99), collate: o.collate, duplex: o.duplex, autoPrint: openChk.input.checked };
      const b = busy('Preparing the pages to print…');
      try {
        const blob = await PrintJob.make(job, p => b.set(p, 'Preparing the pages to print…'));
        b.close();
        const name = safeFileName(S.doc.title) + ' - print.pdf';
        // saved: back to the document, as Word does after printing
        if (await saveFile(name, blob)) { this.close(); toast(job.autoPrint ? `Open “${name}”: it shows the print dialog. Choose your printer there.` : `Open “${name}” and print it with ${MOD}+P.`, { ms: 9000 }); }
      } catch (e) {
        b.close();
        console.error(e);
        toast('The pages couldn’t be prepared: ' + (e && e.message ? e.message : 'unknown error'), { error: true, ms: 7000 });
      }
    });
    if (S.readOnly) [orient, paper, margins].forEach(x => { x.disabled = true; x.title = 'The document is read-only'; });
    await refresh();
    setTimeout(() => go.focus(), 0);
  },
  async p_options(m) {
    m.appendChild(h('h1', null, 'Options'));
    const box = h('div', { class: 'opt-block' });
    const author = input(Prefs.author, { placeholder: Cap.name || 'Your name', id: 'optAuthor' });
    author.addEventListener('change', () => { Prefs.author = author.value.trim(); savePrefs(); });
    const units = select([['in', 'Inches'], ['cm', 'Centimeters'], ['mm', 'Millimeters'], ['pt', 'Points']], Prefs.units, { id: 'optUnits' });
    units.addEventListener('change', () => { Prefs.units = units.value; savePrefs(); Ruler.drawSoon(); UI.refresh(); });
    const theme = select([['system', 'Match system'], ['light', 'Light'], ['dark', 'Dark']], Prefs.theme, { id: 'optTheme' });
    theme.addEventListener('change', () => { Prefs.theme = theme.value; applyTheme(); savePrefs(); });
    const dfont = input(Prefs.defaultFont, { list: 'optFontList', id: 'optFont' });
    const dsize = input(String(Prefs.defaultSize), { inputmode: 'decimal', id: 'optSize' });
    dfont.addEventListener('change', () => { Prefs.defaultFont = dfont.value.trim() || 'Calibri'; savePrefs(); });
    dsize.addEventListener('change', () => { const v = parseFloat(dsize.value); if (v >= 6 && v <= 72) { Prefs.defaultSize = v; savePrefs(); } });
    const tog = (label, key, after) => { const c = checkbox(label, Prefs[key], 'opt-' + key); c.input.addEventListener('change', () => { Prefs[key] = c.input.checked; savePrefs(); if (after) after(); }); return c.el; };
    box.append(
      h('h2', { style: { marginTop: 0 } }, 'You'), field('Your name (shown on comments and tracked changes)', author),
      h('h2', null, 'Display'), h('div', { class: 'grid2' }, field('Measurement units', units), field('Theme', theme)),
      h('h2', null, 'New documents'), h('datalist', { id: 'optFontList' }, FONTS.map(f => h('option', { value: f.n }))), h('div', { class: 'grid2' }, field('Default font', dfont), field('Default size (pt)', dsize)),
      h('h2', null, 'Bangla'),
      bnBlock(),
      h('h2', null, 'Typing'),
      tog('AutoComplete: suggest Quick Parts, months and today’s date as you type', 'autocomplete'),
      tog('AutoCorrect: fix common typos, capitalize sentences, (c) → ©, -- → –', 'autocorrect'),
      tog('Show the mini toolbar when you select text', 'miniToolbar'),
      tog('Check spelling as you type', 'spell', () => { S.editor.spellcheck = Prefs.spell; UI.refresh(); }),
      h('h2', null, 'Storage'),
      h('p', { class: 'note' }, Store.cloud ? 'Your documents and settings are kept in your Claude account, private to you. They stay when Folio is updated.' : (LocalStore.volatile ? 'This browser isn’t keeping data (private window or blocked storage). Export your work before closing.' : 'Your documents are kept in this browser only. Clearing site data removes them.')));
    m.appendChild(box);
  },
};
/* Options › Bangla: Avro, the Bangla font and fonts added from files */
function bnBlock() {
  const wrap = h('div', { class: 'opt-bn' });
  const av = checkbox('Avro Phonetic typing: type Bangla in English letters (ami → আমি). F12 switches it on and off.', !!S.avro, 'opt-avro');
  const bj = checkbox('Bijoy keyboard: Bangla on Bijoy’s keys (j = ক, d j = কি). Ctrl+Alt+B switches it on and off.', !!S.bijoy, 'opt-bijoy');
  const sync = () => { av.input.checked = !!S.avro; bj.input.checked = !!S.bijoy; f12.value = Prefs.bnKbd === 'bijoy' ? 'bijoy' : 'avro'; };
  av.input.addEventListener('change', () => { if (!!S.avro !== av.input.checked) Avro.toggle(av.input.checked); sync(); });
  bj.input.addEventListener('change', () => { if (!!S.bijoy !== bj.input.checked) Bijoy.toggle(bj.input.checked); sync(); });
  const f12 = select([['avro', 'Avro Phonetic'], ['bijoy', 'Bijoy']], Prefs.bnKbd === 'bijoy' ? 'bijoy' : 'avro');
  f12.addEventListener('change', () => { Prefs.bnKbd = f12.value; savePrefs(); UI.refresh(); });
  const ord = select([['bijoy', 'ি ে ৈ before the letter, reph after it (as in Bijoy)'], ['unicode', 'Everything in reading order (as in UniJoy)']], Bijoy.order());
  ord.addEventListener('change', () => Bijoy.setOrder(ord.value));
  const auto = checkbox('Convert Bijoy text (SutonnyMJ and other Bijoy fonts) to Unicode when pasting or opening files', Bijoy.auto(), 'opt-bijoy-auto');
  auto.input.addEventListener('change', () => Bijoy.setAuto(auto.input.checked));
  const lay = h('button', { class: 'btn', type: 'button', id: 'optBjLayout' }, h('span', { html: icon('keyboard') }), 'Bijoy Keyboard Layout…');
  lay.addEventListener('click', () => Bijoy.showLayout());
  const bn = select(FONTS.filter(f => f.cat === 'Bangla').map(f => [f.n, f.n + (fontAvailable(f.n) ? '' : ' (not on this device)')]), Prefs.bnFont || docBnFont(), { id: 'optBnFont' });
  bn.addEventListener('change', () => setDocBnFont(bn.value, true));
  const mine = h('div', { class: 'opt-fonts' });
  const draw = () => {
    mine.innerHTML = '';
    if (!UserFonts.list.length) { mine.appendChild(h('p', { class: 'note' }, 'Fonts you add from a file are saved with your documents and load on every device. On Windows, fonts such as SutonnyOMJ and Nikosh are in C:\\Windows\\Fonts.')); return; }
    for (const f of UserFonts.list) {
      const rm = h('button', { class: 'link-btn', type: 'button' }, 'Remove');
      rm.addEventListener('click', async () => { await UserFonts.remove(f.id); draw(); });
      mine.appendChild(h('div', { class: 'opt-font-row' }, h('span', { style: { fontFamily: quoteFont(f.family) + ', sans-serif', fontSize: '15px' } }, f.family + (f.weight >= 600 ? ' Bold' : '') + (f.italic ? ' Italic' : '')), h('span', { class: 'note' }, Math.round(f.size / 1024) + ' KB'), rm));
    }
  };
  draw();
  const add = h('button', { class: 'btn', type: 'button' }, h('span', { html: icon('plus') }), 'Add a font from a file…');
  add.addEventListener('click', () => UserFonts.pick());
  wrap.append(av.el, bj.el, h('div', { class: 'opt-row' }, field('F12 and the status bar turn on', f12, 'optF12'), field('Bijoy typing order', ord, 'optBjOrder')), auto.el, h('div', { style: { margin: '2px 0 12px' } }, lay), field('Font for Bangla text (used inside English fonts too)', bn), h('div', { class: 'flabel', style: { margin: '10px 0 4px' } }, 'Your fonts'), mine, add);
  return wrap;
}
function promptName(title, value) {
  return new Promise(res => {
    const i = input(value);
    let done = false;
    openDialog({ title, width: 420, body: field('Name', i, 'pnName'), onClose: () => { if (!done) res(null); }, buttons: [{ label: 'Cancel', onClick: () => { done = true; res(null); } }, { label: 'Save', primary: true, onClick: () => { done = true; res(i.value.trim() || value); } }] });
  });
}
