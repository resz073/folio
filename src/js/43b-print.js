/* ===================== Print =====================
   A page inside Claude's viewer can't open the browser's print dialog. So File › Print
   (Ctrl+P) is Word's print screen, a preview with the settings, and its Print button saves a
   PDF made for printing (PrintJob.make):
   - the chosen pages, copies as pages in the file (collated or not), so they print anywhere;
     two-sided, each copy starts on a new sheet (an odd copy gets a blank back)
   - actual size and the sides as the PDF's print preferences
   - when asked, a script that opens the print dialog as soon as the file is opened. */
const PrintJob = {
  P: null,          // the painted pages for the preview
  /* Word's page box: "1-3, 5, 8-" → document page indices, each once, in the order typed */
  parse(text, n) {
    const parts = String(text || '').split(/[,;]+/).map(s => s.trim()).filter(Boolean);
    if (!parts.length) return { pages: [], error: 'Type the pages to print, such as 1-3, 5.' };
    const out = [];
    for (const part of parts) {
      const m = part.match(/^(\d+)?\s*([-–—]\s*(\d+)?)?$/);
      if (!m || (!m[1] && !m[3])) return { pages: [], error: `“${part}” isn’t a page number or a range such as 2-4.` };
      let a = m[1] ? +m[1] : 1, b = m[2] ? (m[3] ? +m[3] : n) : a;
      if (a > b) [a, b] = [b, a];
      if (b < 1 || a > n) return { pages: [], error: n === 1 ? 'This document has 1 page.' : `This document has ${n} pages.` };
      for (let k = Math.max(1, a); k <= Math.min(b, n); k++) out.push(k - 1);
    }
    const seen = new Set();
    return { pages: out.filter(i => !seen.has(i) && seen.add(i)) };
  },
  /* the pages of the file: each sheet once per copy, collated (1 2 3, 1 2 3) or not
     (1 1, 2 2, 3 3); two-sided, sheets are pairs of pages and a lone last page gets a blank
     back (-1) so the next copy starts on its own sheet */
  sequence(pages, copies, collate, twoSided) {
    copies = clamp(Math.round(copies) || 1, 1, 99);
    const unit = twoSided ? 2 : 1;
    const sheets = [];
    for (let k = 0; k < pages.length; k += unit) {
      const s = pages.slice(k, k + unit);
      if (s.length < unit) s.push(-1);
      sheets.push(s);
    }
    const out = [];
    if (collate) { for (let c = 0; c < copies; c++) for (const s of sheets) out.push(...s); }
    else for (const s of sheets) for (let c = 0; c < copies; c++) out.push(...s);
    while (out.length && out[out.length - 1] === -1) out.pop();
    return out;
  },
  /* which pages the settings choose */
  chosen(o) {
    const n = S.pages;
    if (o.range === 'current') return { pages: [clamp((S.curPage || 1) - 1, 0, n - 1)] };
    if (o.range === 'custom') return this.parse(o.custom, n);
    return { pages: Array.from({ length: n }, (_, i) => i) };
  },
  /* the PDF for printing */
  async make(o, onProgress) {
    const seq = this.sequence(o.pages, o.copies, o.collate, o.duplex !== 'none');
    const meta = { title: S.doc.title, author: S.doc.props.author || Prefs.author, subject: S.doc.props.subject, keywords: S.doc.props.keywords, lang: S.doc.lang, print: { duplex: o.duplex, autoPrint: !!o.autoPrint } };
    let blob = null;
    try { blob = await buildVectorPdf(Object.assign({ pages: seq, bookmarks: false }, meta), onProgress); }
    catch (e) { console.error('vector PDF failed', e); }
    if (!blob) {
      const imgs = await renderPagesForPdf({ pages: seq, scale: 3, quality: 0.92 }, onProgress);
      const at = new Map(imgs.map(p => [p.index, p]));
      // a blank back is the size of the page it is behind
      let last = Pages.g(0);
      blob = await buildPdf(seq.map(i => { if (i >= 0) { last = Pages.g(i); return at.get(i); } return { blank: true, wPt: last.w * 0.75, hPt: last.h * 0.75 }; }), meta);
    }
    blob.sheets = seq.length;
    return blob;
  },
  /* paint the pages for the preview (the same painter as the PDF) */
  async prepare() {
    Images.deselect();
    if (S.view === 'web') setView('print');
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    await Promise.all(Array.from(S.editor.querySelectorAll('img')).map(im => (im.decode ? im.decode().catch(() => { }) : null)));
    Layout.full();
    await yieldTask();
    this.P = await collectPaint();
    return this.P;
  },
  release() { this.P = null; },
};
