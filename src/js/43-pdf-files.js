/* ===================== PDF export =====================
   Pages are painted from the live layout (44-paint.js) and written by buildPdf (45-pdf.js). */
const yieldTask = () => new Promise(r => setTimeout(r, 0));
async function renderPagesForPdf(opts = {}, onProgress) {
  Images.deselect();
  const view = S.view === 'web' ? 'web' : null;
  if (view) setView('print');
  if (document.activeElement && S.editor.contains(document.activeElement)) document.activeElement.blur();
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    await Promise.all(Array.from(S.editor.querySelectorAll('img')).map(im => (im.decode ? im.decode().catch(() => { }) : null)));
    Layout.full();
    await yieldTask();
    const P = await collectPaint();
    const scale = opts.scale || 2, q = opts.quality || 0.92;
    const from = Math.max(1, opts.from || 1), to = Math.min(S.pages, opts.to || S.pages);
    // a range, or the pages Print asked for (each once; Print puts them in order)
    const list = Array.isArray(opts.pages) ? Array.from(new Set(opts.pages.filter(i => i >= 0 && i < S.pages))) : Array.from({ length: Math.max(0, to - from + 1) }, (_, k) => from - 1 + k);
    const pages = [];
    for (let n = 0; n < list.length; n++) {
      const i = list[n];
      const cv = paintPage(P, i, scale);
      const img = await encodeCanvas(cv, q);
      cv.width = cv.height = 0;
      const pg = Pages.g(i);
      pages.push({ index: i, img, wPt: pg.w * 0.75, hPt: pg.h * 0.75, words: pageWords(P, i), links: pageLinks(P, i) });
      if (onProgress) onProgress((n + 1) / list.length);
      await yieldTask();
    }
    return pages;
  } finally {
    if (view) setView(view);
  }
}

/* ===================== Files: save & open ===================== */
const MIME = { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pdf: 'application/pdf', html: 'text/html', md: 'text/markdown', txt: 'text/plain' };
async function saveFile(filename, data) {
  if (Cap.downloads) {
    try {
      const res = await Cap.downloads.save({ filename, data });
      if (res && res.status === 'saved') toast('Saved ' + filename);
      return true;
    } catch (e) {
      const code = e && e.code;
      if (code === 'declined') { toast('Download cancelled.'); return false; }
      if (code === 'rate_limited') { toast('Another download is waiting for your answer. Try again in a moment.'); return false; }
      if (code === 'too_large') { toast('That file is too large to save here.', { error: true }); return false; }
      if (code === 'rejected_extension' || code === 'extension_not_enabled') { toast('This file type can’t be saved here.', { error: true }); return false; }
      console.warn('downloads.save failed', e);
    }
  }
  try {
    const blob = data instanceof Blob ? data : new Blob([data], { type: MIME[filename.split('.').pop()] || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    toast('If nothing downloaded, this view doesn’t allow saving files. Open Folio in Claude to download.');
    return true;
  } catch { toast('Saving files isn’t available in this view.', { error: true }); return false; }
}
const Files = {
  async export(kind, opts = {}) {
    if (Story.cur) Story.close();
    const name = safeFileName(S.doc.title) + '.' + kind;
    let b;
    try {
      if (kind === 'docx') { b = busy('Creating Word document…'); b.set(0.3); const blob = await buildDocx(); b.close(); b = null; await saveFile(name, blob); }
      else if (kind === 'pdf') {
        b = busy('Preparing PDF…');
        const meta = { title: S.doc.title, author: S.doc.props.author || Prefs.author, subject: S.doc.props.subject, keywords: S.doc.props.keywords, lang: S.doc.lang };
        let blob = null;
        if (opts.mode !== 'image') {
          // text, borders and shading as real PDF content, the way Word saves a PDF
          try {
            blob = await buildVectorPdf(Object.assign({}, opts, meta), p => b.set(p, `Writing page ${Math.min(S.pages, Math.max(1, Math.round(p * S.pages)))} of ${S.pages}…`));
          } catch (e) {
            console.error('vector PDF failed', e);
            toast('Saved the PDF with each page as a picture instead.', { ms: 6000 });
          }
        }
        if (!blob) {
          const pages = await renderPagesForPdf(Object.assign({ scale: 3 }, opts), p => b.set(p, `Rendering page ${Math.min(S.pages, Math.round(p * S.pages))} of ${S.pages}…`));
          blob = await buildPdf(pages, meta);
        }
        b.close(); b = null;
        await saveFile(name, blob);
        const st = blob.stats || {};
        if (st.fontErrors && st.fontErrors.length && st.pictureWords) toast('Some of Folio’s font files couldn’t be loaded just now, so part of the text is in the PDF as fine pictures. Check the connection and export again.', { ms: 10000 });
        else if (st.localOnly && st.localOnly.length) {
          const lo = st.localOnly;
          toast(`Text in ${lo.join(', ')} is in the PDF as fine pictures, because ${lo.length > 1 ? 'those fonts are' : 'that font is'} only installed on this computer. Add the font once and later PDFs have it as real text.`, { ms: 14000, action: { label: 'Add font', fn: () => UserFonts.addInstalled(lo) } });
        }
      }
      else if (kind === 'html') await saveFile(name, new Blob([toStandaloneHtml()], { type: 'text/html' }));
      else if (kind === 'md') await saveFile(name, new Blob([toMarkdown()], { type: 'text/markdown' }));
      else if (kind === 'txt') await saveFile(name, new Blob([toPlainText()], { type: 'text/plain' }));
    } catch (e) {
      console.error(e);
      toast('Export failed: ' + (e && e.message ? e.message : 'unknown error'), { error: true, ms: 7000 });
    } finally { if (b) b.close(); }
  },
  async importFile(file) {
    const name = file.name || 'Document';
    const base = name.replace(/\.[^.]+$/, '');
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (ext === 'doc') throw new Error('Older .doc files can’t be opened. In Word, use File › Save As › Word Document (.docx), then open that file.');
    if (ext === 'docx' || ext === 'dotx' || /officedocument\.wordprocessingml/.test(file.type)) {
      const res = await readDocxFile(await file.arrayBuffer());
      return { title: res.settings.title && res.settings.title.length < 120 ? res.settings.title : base, html: res.html, settings: res.settings };
    }
    if (ext === 'html' || ext === 'htm') {
      const txt = await readFileAs(file, 'text');
      const box = document.createElement('div');
      Bijoy.pasted = 0;
      box.appendChild(sanitizeHtml(txt, { keepClasses: /class="[^"]*(title|tbl-|checklist|pb)/.test(txt) }));
      const t = (txt.match(/<title>([^<]*)<\/title>/i) || [])[1];
      return { title: (t && t.trim()) || base, html: box.innerHTML, settings: Bijoy.pasted ? { bijoy: Bijoy.pasted } : {} };
    }
    if (ext === 'md' || ext === 'markdown') {
      const txt = await readFileAs(file, 'text');
      const box = document.createElement('div');
      box.appendChild(sanitizeHtml(mdToHtml(txt), { keepClasses: true }));
      return { title: base, html: box.innerHTML, settings: {} };
    }
    if (ext === 'txt' || ext === 'csv' || /^text\//.test(file.type)) {
      let txt = await readFileAs(file, 'text');
      // text saved from a Bijoy document: its codes read as Bangla
      const bj = Bijoy.auto() && bijoyScore(txt.slice(0, 20000)).bijoy;
      if (bj) txt = bijoyToUnicode(txt);
      return { title: base, html: textToHtml(txt), settings: bj ? { bijoy: 1 } : {} };
    }
    throw new Error('Folio can open .docx, .html, .md and .txt files.');
  },
  async openFiles(files) {
    for (const f of Array.from(files)) {
      const b = busy('Opening ' + f.name + '…');
      try {
        b.set(0.3);
        const r = await this.importFile(f);
        b.set(0.8);
        await openImported(r);
        const bj = r.settings && r.settings.bijoy;
        toast('Opened ' + f.name + (bj ? '. Its Bijoy text (SutonnyMJ) is now Unicode; Review › Convert turns it back.' : ''), { ms: bj ? 7000 : 3000 });
      } catch (e) { console.error(e); toast(e && e.message ? e.message : 'That file could not be opened.', { error: true, ms: 8000 }); }
      finally { b.close(); }
    }
  },
  async insertFile(file) {
    try {
      const r = await this.importFile(file);
      focusEditor();
      change(() => insertFragment(sanitizeHtml(r.html, { keepClasses: true })), { full: true });
      ensureDocFonts();
    } catch (e) { toast(e && e.message ? e.message : 'That file could not be inserted.', { error: true }); }
  },
};
async function openImported(r) {
  const s = r.settings || {};
  const over = { title: r.title, html: r.html };
  if (s.w && s.h) {
    const match = PAGE_SIZES.find(p => { const px = pageSizePx(p.id); return (Math.abs(px.w - Math.min(s.w, s.h)) < 4 && Math.abs(px.h - Math.max(s.w, s.h)) < 4); });
    over.page = { size: match ? match.id : 'Custom', w: Math.min(s.w, s.h), h: Math.max(s.w, s.h), orient: s.orient || 'portrait' };
  }
  if (s.margins) over.page = Object.assign(over.page || {}, s.margins);
  if (s.pageColor) over.page = Object.assign(over.page || {}, { color: s.pageColor });
  if (s.border) over.page = Object.assign(over.page || {}, { border: s.border });
  if (s.font) over.font = s.font;
  if (s.size) over.size = s.size;
  if (s.line) over.line = s.line;
  if (s.after != null) over.after = s.after;
  if (s.hf) over.hf = s.hf;
  if (s.firstDiff) over.firstDiff = true;
  if (s.pn) over.pn = s.pn;
  if (s.evenDiff) over.evenDiff = true;
  if (s.notes) over.footnotes = s.notes;
  if (s.styles) over.styles = s.styles;
  if (s.notePr) over.notePr = s.notePr;
  if (s.watermark) over.watermark = s.watermark;
  if (s.comments) over.comments = s.comments;
  if (s.props) over.props = Object.assign({ author: '', subject: '', keywords: '' }, s.props);
  await Saver.flush();
  const model = newDocModel(over);
  openDoc(model, { fresh: true });
  // Word's look for Normal, Heading 1–6, Title and Subtitle: the document's styles
  const styled = Styles.adopt(s.builtin);
  if (styled) Layout.full();
  // pictures in front of / behind the text take their place from Word's page and margins
  const moved = await PicEdit.settle();
  if (await HF.settle() || moved || styled) histReset();
  Saver.mark();
}
