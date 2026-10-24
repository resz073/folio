/* ===================== Styles =====================
   Word's styles. The built-in ones (Normal, No Spacing, Title, Subtitle, Heading 1–6, Quote, Code)
   can be modified, and a document has its own paragraph styles too (Create a Style from a
   paragraph, apply, modify, update to match a paragraph, delete). S.doc.styles = { key: def }:
   for a built-in style, only what was changed; for one of the document's own (key 's-' + id),
   { name, ...properties, next }. Properties: font, size (pt), bold, italic, underline, color,
   align, line (Word's multiple), before, after (pt), indent (left, pt), first (pt; less than 0 is
   a hanging indent), next (the style of the paragraph Enter starts after this one).
   Normal's font, size, line spacing and space after are the document's own settings (S.doc.font
   …); its other properties go on plain paragraphs, and the document's styles start from it.
   Everything becomes CSS rules (#docStyleRules), so the page, the PDF and the Word file (which
   measures the page) follow; a paragraph's own formatting still wins, as in Word. */
const STYLE_PROPS = ['font', 'size', 'bold', 'italic', 'underline', 'color', 'align', 'line', 'before', 'after', 'indent', 'first'];
const STYLE_SEL = { normal: 'p:not([class])', nospacing: 'p.nospacing', title: 'p.title', subtitle: 'p.subtitle', h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', h5: 'h5', h6: 'h6', quote: 'p.quote', code: 'p.code' };
const STYLE_ORDER = ['normal', 'nospacing', 'title', 'subtitle', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'quote', 'code'];
const STYLE_NEXT = { title: 'normal', subtitle: 'normal', h1: 'normal', h2: 'normal', h3: 'normal', h4: 'normal', h5: 'normal', h6: 'normal', quote: 'normal' };
const Styles = {
  all() { const d = S.doc; if (!d.styles || typeof d.styles !== 'object' || Array.isArray(d.styles)) d.styles = {}; return d.styles; },
  isCustom(k) { return /^s-[\w-]{1,40}$/.test(k || ''); },
  custom() { const a = this.all(); return Object.keys(a).filter(k => this.isCustom(k) && a[k] && a[k].name).sort((x, y) => a[x].name.localeCompare(a[y].name)); },
  /* every style, built-in first (as the gallery shows them) */
  keys() { return STYLE_ORDER.concat(this.custom()); },
  exists(k) { return !!BSTYLES[k] || STYLE_ORDER.includes(k) || (this.isCustom(k) && !!this.all()[k]); },
  name(k) { if (BSTYLES[k]) return BSTYLES[k].name; if (/^h[56]$/.test(k)) return 'Heading ' + k[1]; const d = this.all()[k]; return d && d.name ? d.name : k; },
  next(k) { const d = this.all()[k]; return (d && d.next && this.exists(d.next)) ? d.next : (STYLE_NEXT[k] || k); },
  /* a style's own properties: what was set on it (for Normal: also the document's font…) */
  props(k) {
    const d = this.all()[k] || {};
    const o = {};
    for (const p of STYLE_PROPS) if (d[p] != null && d[p] !== '') o[p] = d[p];
    if (k === 'normal') { const doc = S.doc; o.font = doc.font; o.size = doc.size; o.line = doc.line; o.after = doc.after != null ? doc.after : 8; }
    return o;
  },
  /* Word style ids for the document's own styles: from their names, unique, never a built-in one */
  wordIds() {
    // (Word matches style ids in any case)
    const out = {}, used = new Set(['Normal', 'NoSpacing', 'Title', 'Subtitle', 'Quote', 'Code', 'Heading1', 'Heading2', 'Heading3', 'Heading4', 'Heading5', 'Heading6', 'Header', 'Footer', 'FootnoteText', 'FootnoteReference', 'EndnoteText', 'EndnoteReference', 'ListParagraph', 'TOC1', 'TOC2', 'TOC3', 'TOCHeading', 'CommentText', 'CommentReference', 'Hyperlink', 'DefaultParagraphFont', 'TableNormal', 'TableGrid'].map(x => x.toLowerCase()));
    for (const k of this.custom()) {
      let base = this.name(k).replace(/[^A-Za-z0-9]/g, '') || 'Style';
      if (/^\d/.test(base)) base = 'S' + base;
      let id = base, i = 2;
      while (used.has(id.toLowerCase())) id = base + i++;
      used.add(id.toLowerCase());
      out[k] = id;
    }
    return out;
  },
  /* ---------- CSS ---------- */
  decl(p) {
    const o = [];
    if (p.font) o.push(`font-family:${fontStack(p.font)}`, `--lhr:${LineH.stack(fontStack(p.font))}`);
    if (p.size) o.push(`font-size:${fmtNum(+p.size, 2)}pt`);
    if (p.bold != null) o.push(`font-weight:${p.bold ? 700 : 400}`);
    if (p.italic != null) o.push(`font-style:${p.italic ? 'italic' : 'normal'}`);
    if (p.underline != null) o.push(`text-decoration-line:${p.underline ? 'underline' : 'none'}`);
    if (p.color) o.push(`color:${p.color}`);
    if (p.align) o.push(`text-align:${p.align}`);
    if (p.line) o.push(`--lhm:${+p.line}`);
    if (p.before != null) o.push(`margin-top:${fmtNum(+p.before, 2)}pt`);
    if (p.after != null) o.push(`margin-bottom:${fmtNum(+p.after, 2)}pt`);
    if (p.indent != null) o.push(`margin-left:${fmtNum(+p.indent, 2)}pt`);
    if (p.first != null) o.push(`text-indent:${fmtNum(+p.first, 2)}pt`);
    return o.join(';');
  },
  css(scope = '.doc') {
    const a = this.all(), out = [];
    // a style's spacing and indents leave paragraphs in table cells alone (they keep none, as the
    // Word file says for them); its font, colour and alignment reach them, as in Word
    const BOX = ['before', 'after', 'indent', 'first'];
    const split = p => { const t = {}, b = {}; for (const q of Object.keys(p)) (BOX.includes(q) ? b : t)[q] = p[q]; return [this.decl(t), this.decl(b)]; };
    const NOCELL = ':not(td > p, th > p)';
    // Normal: the document's own font, size, spacing are variables already; the rest here (list
    // items too, for their text)
    const n = Object.assign({}, a.normal || {});
    delete n.font; delete n.size; delete n.line; delete n.after; delete n.next;
    const [nt, nb] = split(n);
    if (nt) out.push(`${scope} :is(p:not([class]), li){${nt}}`);
    if (nb) out.push(`${scope} p:not([class])${NOCELL}{${nb}}`);
    for (const k of STYLE_ORDER) {
      if (k === 'normal' || !a[k]) continue;
      const dd = this.decl(a[k]);
      if (dd) out.push(`${scope} ${STYLE_SEL[k]}{${dd}}`);
    }
    // the document's styles start from Normal (its other properties) and add their own
    for (const k of this.custom()) {
      const [t, b] = split(Object.assign({}, n, a[k]));
      out.push(`${scope} p.${k}{${t}}`);
      if (b) out.push(`${scope} p.${k}${NOCELL}{${b}}`);
    }
    return out.join('\n');
  },
  /* two values of a property the same (sizes and spacing to a little, names in any case) */
  same(q, x, y) {
    if (typeof x === 'number' || typeof y === 'number') return Math.abs((+x || 0) - (+y || 0)) < (q === 'line' ? 0.015 : 0.3);
    if (typeof x === 'string' && typeof y === 'string') return x.toLowerCase() === y.toLowerCase();
    return !!x === !!y;
  },
  apply() {
    let el = document.getElementById('docStyleRules');
    if (!el) {
      el = document.createElement('style');
      el.id = 'docStyleRules';
      // after the document's own sheet, so a changed style wins over Folio's look
      const ref = document.getElementById('docCss');
      if (ref) ref.after(el); else document.head.appendChild(el);
    }
    const css = S.doc ? this.css() : '';
    if (el.textContent !== css) el.textContent = css;
    // shapes' text uses the same rules
    Shapes.restyle();
    this.fillGallery();
    this.paneSoon();
  },
  /* ---------- a paragraph's look, read from the page (for Create a Style / Update to Match) ---------- */
  read(b) {
    const cs = getComputedStyle(b);
    const fs = parseFloat(cs.fontSize) || 14.67;
    // the text's own look: where the cursor is in it, else its first letters
    let t = curTextNode();
    if (!t || !b.contains(t)) { const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) if (n.data.replace(/[\s\u200B]/g, '')) { t = n; break; } }
    const run = t && b.contains(t) ? getComputedStyle(t.nodeType === 1 ? t : t.parentElement) : cs;
    const pt = px => Math.round((parseFloat(px) || 0) * 0.75 * 10) / 10;
    const lh = parseFloat(b.style.lineHeight);
    return {
      font: firstFamily(run.fontFamily) === 'Carlito' ? 'Calibri' : firstFamily(run.fontFamily),
      size: Math.round(parseFloat(run.fontSize) * 0.75 * 2) / 2,
      bold: parseInt(run.fontWeight, 10) >= 600,
      italic: run.fontStyle === 'italic',
      underline: /underline/.test(run.textDecorationLine || ''),
      color: cssColorToHex(run.color) || '#000000',
      align: cs.textAlign === 'start' ? 'left' : cs.textAlign === 'end' ? 'right' : cs.textAlign,
      line: lh > 0 && !/px|pt/.test(b.style.lineHeight) ? lh : (Math.round((parseFloat(cs.getPropertyValue('--lhm')) || 1.08) * 100) / 100),
      before: pt(cs.marginTop), after: pt(cs.marginBottom),
      indent: b.hasAttribute && b.hasAttribute('data-sx') ? Math.round(ownMargins(b).ml * 0.75 * 10) / 10 : pt(cs.marginLeft), first: pt(cs.textIndent),
      _fs: fs,
    };
  },
  /* the paragraph's own formatting that the style now carries: taken off it */
  absorb(b) {
    for (const p of ['text-align', 'margin-top', 'margin-bottom', 'margin-left', 'text-indent', 'line-height', 'font-family', 'font-size', 'color', 'font-weight', 'font-style']) b.style.removeProperty(p);
    if (!b.getAttribute('style')) b.removeAttribute('style');
    // runs that only repeat the style's font, size or colour
    b.querySelectorAll('span[style]').forEach(sp => {
      for (const p of ['font-family', 'font-size', 'color', 'font-weight', 'font-style']) sp.style.removeProperty(p);
      if (!sp.getAttribute('style')) sp.removeAttribute('style');
      if (!sp.attributes.length) unwrap(sp);
    });
    b.querySelectorAll('b, strong, i, em').forEach(x => unwrap(x));
  },
  /* ---------- commands ---------- */
  /* Create a Style: a new style that looks like the paragraph at the cursor, applied to it */
  create(name, props) {
    const nm = String(name || '').trim().slice(0, 60);
    if (!nm) return null;
    if (this.keys().some(k => this.name(k).toLowerCase() === nm.toLowerCase())) { toast(`There is already a style called “${nm}”.`); return null; }
    const k = 's-' + uid('').slice(-8).replace(/[^\w]/g, 'x');
    const b = blockOf(curTextNode());
    change(() => {
      const p = props || (b ? this.read(b) : {});
      delete p._fs;
      // what Normal already gives is left to Normal
      const base = this.props('normal'), def = { name: nm };
      for (const q of STYLE_PROPS) if (p[q] != null && !this.same(q, p[q], base[q] != null ? base[q] : this.defaults()[q])) def[q] = p[q];
      def.next = k;
      this.all()[k] = def;
      this.apply();
      if (b && !props) { setBlockStyleOn(b, k); this.absorb(b); }
    }, { full: true });
    return k;
  },
  /* what a property is when nobody set it (Folio's Normal) */
  defaults() { return { bold: false, italic: false, underline: false, color: '#000000', align: 'left', before: 0, indent: 0, first: 0 }; },
  /* Modify: new properties for a style (a built-in one keeps only what differs from Folio's look).
     extra: name, next (the style for the following paragraph), absorb (a paragraph that takes the
     style, its own formatting going into it: Update to Match Selection) */
  modify(k, props, extra = {}) {
    if (!this.exists(k)) return;
    change(() => {
      const a = this.all();
      if (k === 'normal') {
        const d = S.doc;
        if (props.font) d.font = props.font;
        if (props.size) d.size = +props.size;
        if (props.line) d.line = +props.line;
        if (props.after != null) d.after = +props.after;
        const rest = {};
        for (const q of STYLE_PROPS) if (!['font', 'size', 'line', 'after'].includes(q) && props[q] != null && !this.same(q, props[q], this.defaults()[q])) rest[q] = props[q];
        if (Object.keys(rest).length) a.normal = rest; else delete a.normal;
        applyDocSettings();
      } else if (this.isCustom(k)) {
        const def = { name: extra.name ? String(extra.name).trim().slice(0, 60) : a[k].name, next: extra.next || a[k].next || k };
        const base = this.props('normal');
        for (const q of STYLE_PROPS) if (props[q] != null && !this.same(q, props[q], base[q] != null ? base[q] : this.defaults()[q])) def[q] = props[q];
        a[k] = def;
      } else {
        const builtin = this.builtinLook(k), def = {};
        for (const q of STYLE_PROPS) if (props[q] != null && !this.same(q, props[q], builtin[q])) def[q] = props[q];
        // the following paragraph's style: kept only where it isn't the usual one
        const nx = extra.next || (a[k] && a[k].next);
        if (nx && nx !== (STYLE_NEXT[k] || k)) def.next = nx;
        if (Object.keys(def).length) a[k] = def; else delete a[k];
      }
      this.apply();
      if (extra.absorb && extra.absorb.isConnected) {
        const b = blockStyleKey(extra.absorb) === k ? extra.absorb : setBlockStyleOn(extra.absorb, k);
        this.absorb(b);
      }
    }, { full: true });
    Layout.full();
  },
  /* a Word file's own look for the built-in styles (its Heading 1, a justified Normal…): changed
     styles, as far as they differ from Folio's look (when the file opens) */
  adopt(looks) {
    if (!looks || typeof looks !== 'object' || !S.doc) return false;
    const a = this.all();
    let any = false;
    for (const k of STYLE_ORDER) {
      const v = looks[k];
      if (!v || typeof v !== 'object' || a[k]) continue;
      const def = {};
      if (k === 'normal') { for (const q of ['align', 'before', 'color', 'bold', 'italic', 'indent', 'first']) if (v[q] != null && !this.same(q, v[q], this.defaults()[q])) def[q] = v[q]; }
      else { const base = this.builtinLook(k); for (const q of STYLE_PROPS) if (v[q] != null && !this.same(q, v[q], base[q])) def[q] = v[q]; }
      if (Object.keys(def).length) { a[k] = def; any = true; }
    }
    if (any) this.apply();
    return any;
  },
  /* a built-in style as Folio draws it, with nothing changed */
  builtinLook(k) {
    const keep = this.all()[k];
    const el = document.getElementById('docStyleRules');
    if (keep) delete this.all()[k];
    if (el) el.textContent = this.css();
    const v = this.look(k);
    if (keep) this.all()[k] = keep;
    if (el) el.textContent = this.css();
    return v;
  },
  /* a style as the page draws it now: a sample paragraph laid out off the page */
  look(k) {
    const box = h('div', { class: 'doc', style: `position:absolute;left:-20000px;top:0;width:${geom().cw}px;${docVarsCss()}` });
    const tag = /^h\d$/.test(k) ? k.toUpperCase() : 'P';
    const el = document.createElement(tag);
    if (tag === 'P' && k !== 'normal') el.className = k;
    el.textContent = 'Sample';
    box.appendChild(el);
    $('#renderHost').appendChild(box);
    const v = this.read(el);
    box.remove();
    delete v._fs;
    return v;
  },
  reset(k) { if (k === 'normal' || !this.all()[k] || this.isCustom(k)) return; change(() => { delete this.all()[k]; this.apply(); }, { full: true }); Layout.full(); },
  /* Update to Match Selection: the style takes the look of the paragraph at the cursor (and the
     paragraph the style, its own formatting gone into it) — one step to undo */
  update(k) {
    const b = blockOf(curTextNode());
    if (!b || !/^(P|H[1-6])$/.test(b.tagName)) return;
    const p = this.read(b);
    delete p._fs;
    this.modify(k, p, { absorb: b });
  },
  remove(k) {
    if (!this.isCustom(k) || !this.all()[k]) return;
    const nm = this.name(k);
    change(() => {
      docBody().querySelectorAll('p.' + k).forEach(p => { p.classList.remove(k); if (!p.classList.length) p.removeAttribute('class'); });
      delete this.all()[k];
      for (const d of Object.values(this.all())) if (d && d.next === k) d.next = 'normal';
      this.apply();
    }, { full: true });
    Layout.full();
    toast(`Style “${nm}” deleted; its paragraphs are Normal now.`);
  },
  rename(k, name) {
    const nm = String(name || '').trim().slice(0, 60);
    if (!nm || !this.isCustom(k)) return;
    change(() => { this.all()[k].name = nm; this.apply(); });
  },
  /* Select All n Instances */
  blocksOf(k) {
    const root = docBody();
    if (k === 'normal') return Array.from(root.querySelectorAll('p:not([class])')).filter(p => !p.closest('.toc'));
    return Array.from(root.querySelectorAll(STYLE_SEL[k] || ('p.' + k)));
  },
  selectAll(k) {
    const list = this.blocksOf(k);
    if (!list.length) { toast('No paragraph has this style.'); return; }
    selectNodesRange(list[0], list[list.length - 1]);
    toast(list.length === 1 ? '1 paragraph has this style.' : `${list.length} paragraphs have this style; the selection runs from the first to the last.`);
  },
  /* Enter at the end of a paragraph: the next one takes the style's "next" style */
  afterEnter() {
    const r = getRange();
    if (!r) return;
    const b = blockOf(r.startContainer), prev = b && b.previousElementSibling;
    if (!b || !prev || !/^(P|H[1-6])$/.test(b.tagName) || b.textContent.replace(/​/g, '')) return;
    const pk = blockStyleKey(prev), nk = this.next(pk);
    if (nk === blockStyleKey(b)) return;
    setBlockStyleOn(b, nk);
    caretAtStart(b.tagName === (BSTYLES[nk] || { tag: 'P' }).tag ? b : (blockOf(getRange().startContainer) || b));
  },
  /* ---------- the gallery on the Home tab ---------- */
  fillGallery() {
    const items = document.getElementById('styleGalleryItems');
    if (!items || !S.doc) return;
    const sig = JSON.stringify([this.all(), S.doc.font, S.doc.size]);
    if (items._sig === sig) return;
    items._sig = sig;
    const shown = ['normal', 'nospacing', 'title', 'subtitle', 'h1', 'h2', 'h3'].concat(this.custom(), ['quote', 'code']);
    items.innerHTML = '';
    for (const k of shown) {
      const s = this.look(k);
      const pv = h('span', { class: 'pv', style: { fontFamily: fontStack(s.font), fontWeight: s.bold ? 700 : 400, fontStyle: s.italic ? 'italic' : 'normal', color: s.color, fontSize: Math.min(19, Math.max(12, s.size * 1.33 * 0.78)) + 'px' } }, k === 'code' ? 'a = b;' : 'AaBbCc');
      if (k === 'quote') pv.style.borderLeft = '2px solid #c8c8c8', pv.style.paddingLeft = '4px';
      const tip = this.name(k) + (/^h[1-3]$/.test(k) ? ` (${MOD}+Alt+${k[1]})` : k === 'normal' ? ` (${MOD}+Shift+N)` : '');
      const b = h('button', { class: 'gal-item', type: 'button', 'data-style': k, title: tip }, pv, h('span', { class: 'nm' }, this.name(k)));
      b.addEventListener('click', () => setBlockStyle(k));
      b.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); this.menu(b, k); });
      items.appendChild(b);
    }
  },
  /* a style's own menu (right-click in the gallery, ⋯ in the Styles pane) */
  menu(anchor, k) {
    const n = this.blocksOf(k).length;
    const items = [
      { label: `Update ${this.name(k)} to Match Selection`, icon: 'refresh', onClick: () => this.update(k) },
      { label: 'Modify…', icon: 'edit', onClick: () => this.dialog(k) },
      { label: n === 1 ? 'Select the paragraph with this style' : `Select All ${n} Instances`, icon: 'select', disabled: !n, onClick: () => this.selectAll(k) },
    ];
    if (this.isCustom(k)) items.push('-', { label: 'Rename…', icon: 'edit', onClick: () => this.renameDialog(k) }, { label: `Delete “${this.name(k)}”`, icon: 'trash', onClick: () => this.remove(k) });
    else if (k !== 'normal' && this.all()[k]) items.push('-', { label: 'Reset to Folio’s Look', icon: 'resetSize', onClick: () => this.reset(k) });
    Menu.open(anchor, items);
  },
};
/* a paragraph (or heading) given a style: the right tag and class, its own text kept */
function setBlockStyleOn(b, key) {
  const st = BSTYLES[key] || (Styles.isCustom(key) ? { tag: 'P', cls: key } : /^h[56]$/.test(key) ? { tag: key.toUpperCase(), cls: '' } : null);
  if (!st) return b;
  if (b.tagName !== st.tag) b = renameEl(b, st.tag);
  STYLE_CLASSES.forEach(c => b.classList.remove(c));
  Array.from(b.classList).filter(c => Styles.isCustom(c)).forEach(c => b.classList.remove(c));
  if (st.cls) b.classList.add(st.cls);
  if (!b.classList.length) b.removeAttribute('class');
  if (!b.firstChild) b.appendChild(document.createElement('br'));
  return b;
}
/* ---------- the Modify Style dialog (also Create a Style), the Styles pane ---------- */
Object.assign(Styles, {
  /* k: a style to modify, or null to create one from the paragraph at the cursor */
  dialog(k) {
    const creating = !k;
    const b = blockOf(curTextNode());
    const p0 = creating ? (b ? this.read(b) : this.look('normal')) : this.look(k);
    delete p0._fs;
    const name = input(creating ? this.freeName() : this.name(k), { maxlength: '60', 'data-avro': '' });
    if (!creating && !this.isCustom(k)) name.disabled = true;
    const nextSel = h('select', { class: 'select' });
    for (const s of this.keys()) nextSel.appendChild(h('option', { value: s }, this.name(s)));
    if (creating) nextSel.insertBefore(h('option', { value: '' }, '(this new style)'), nextSel.firstChild);
    nextSel.value = creating ? '' : this.next(k);
    const fontSel = h('select', { class: 'select' });
    const fams = [...new Set([p0.font, ...FONTS.map(f => f.n)])].filter(Boolean);
    for (const f of fams) fontSel.appendChild(h('option', { value: f, style: `font-family:${fontStack(f)}` }, f));
    fontSel.value = p0.font;
    const size = input(String(p0.size), { type: 'number', min: '1', max: '400', step: '0.5', style: { width: '70px' } });
    const tog = (label, on, title) => { const t = h('button', { type: 'button', class: 'btn tog', 'aria-pressed': on ? 'true' : 'false', title }, label); t.addEventListener('click', () => { t.setAttribute('aria-pressed', t.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); prev(); }); return t; };
    const bold = tog('B', p0.bold, 'Bold'), ital = tog('I', p0.italic, 'Italic'), und = tog('U', p0.underline, 'Underline');
    bold.style.fontWeight = '700'; ital.style.fontStyle = 'italic'; und.style.textDecoration = 'underline';
    const color = h('input', { type: 'color', value: p0.color || '#000000', title: 'Font color', style: { width: '44px', height: '30px', padding: '1px', border: '1px solid var(--line)', borderRadius: '6px' } });
    const alignSel = h('select', { class: 'select' }, ...[['left', 'Left'], ['center', 'Centered'], ['right', 'Right'], ['justify', 'Justified']].map(([v, l]) => h('option', { value: v }, l)));
    alignSel.value = /^(left|center|right|justify)$/.test(p0.align) ? p0.align : 'left';
    const lines = [[1, 'Single (1)'], [1.08, '1.08'], [1.15, '1.15'], [1.5, '1.5 lines'], [2, 'Double (2)'], [2.5, '2.5'], [3, '3']];
    // the style's own spacing is one of the choices, whatever it is (so OK alone changes nothing)
    if (!lines.some(([v]) => Math.abs(v - p0.line) < 0.005)) lines.push([p0.line, fmtNum(p0.line, 2)]);
    const lineSel = h('select', { class: 'select' }, ...lines.sort((a, b) => a[0] - b[0]).map(([v, l]) => h('option', { value: String(v) }, l)));
    lineSel.value = String(lines.find(([v]) => Math.abs(v - p0.line) < 0.005)[0]);
    const before = input(fmtNum(p0.before, 1), { type: 'number', min: '0', max: '200', step: '1', style: { width: '70px' } });
    const after = input(fmtNum(p0.after, 1), { type: 'number', min: '0', max: '200', step: '1', style: { width: '70px' } });
    const indent = input(fmtLen(p0.indent / 0.75), { style: { width: '80px' } });
    const firstSel = h('select', { class: 'select' }, h('option', { value: 'none' }, '(none)'), h('option', { value: 'first' }, 'First line'), h('option', { value: 'hang' }, 'Hanging'));
    firstSel.value = p0.first > 0.05 ? 'first' : p0.first < -0.05 ? 'hang' : 'none';
    const by = input(fmtLen(Math.abs(p0.first) / 0.75 || 0), { style: { width: '80px' } });
    const sample = h('div', { class: 'doc st-sample' });
    const props = () => {
      const len = v => { const px = parseLen(v); return isNaN(px) ? 0 : Math.round(px * 0.75 * 10) / 10; };
      const f = firstSel.value === 'none' ? 0 : len(by.value) * (firstSel.value === 'hang' ? -1 : 1);
      return { font: fontSel.value, size: clamp(parseFloat(size.value) || p0.size, 1, 400), bold: bold.getAttribute('aria-pressed') === 'true', italic: ital.getAttribute('aria-pressed') === 'true', underline: und.getAttribute('aria-pressed') === 'true', color: color.value, align: alignSel.value, line: parseFloat(lineSel.value), before: Math.max(0, parseFloat(before.value) || 0), after: Math.max(0, parseFloat(after.value) || 0), indent: len(indent.value), first: f };
    };
    const prev = () => {
      const p = props();
      sample.innerHTML = '';
      const para = h('p', { style: this.decl(p) + ';margin:0' }, (S.doc.lang || '').startsWith('bn') ? 'অফিস আগামী রবিবার জাতীয় ছুটির জন্য বন্ধ থাকবে। The office will remain closed on Sunday for the national holiday.' : 'The office will remain closed on Sunday for the national holiday. All staff are requested to note this and plan their work accordingly.');
      sample.appendChild(para);
    };
    [fontSel, size, color, alignSel, lineSel, before, after, indent, firstSel, by].forEach(x => { x.addEventListener('input', prev); x.addEventListener('change', prev); });
    const row = (...k2) => h('div', { class: 'st-row' }, ...k2);
    const lab = (t, c) => h('label', { class: 'st-l' }, h('span', null, t), c);
    const body = h('div', { class: 'st-dialog' },
      row(lab('Name', name), lab('Style for the following paragraph', nextSel)),
      h('div', { class: 'dsection' }, 'Formatting'),
      row(lab('Font', fontSel), lab('Size (pt)', size), h('div', { class: 'st-tg' }, bold, ital, und, color)),
      row(lab('Alignment', alignSel), lab('Line spacing', lineSel), lab('Before (pt)', before), lab('After (pt)', after)),
      row(lab('Indent left', indent), lab('Special', firstSel), lab('By', by)),
      h('div', { class: 'dsection' }, 'Preview'), sample);
    prev();
    const buttons = [{ label: 'Cancel' }, { label: creating ? 'Create' : 'OK', primary: true, onClick: () => {
      const p = props();
      if (creating) {
        // made and given to the paragraph: one step to undo
        const key = histGroup(() => {
          const kk = this.create(name.value, p);
          if (!kk) return null;
          const nx = nextSel.value;
          const bb = blockOf(curTextNode());
          change(() => {
            if (nx) this.all()[kk].next = nx;
            if (bb && /^(P|H[1-6])$/.test(bb.tagName)) this.absorb(setBlockStyleOn(bb, kk));
            this.apply();
          }, { full: true });
          return kk;
        });
        return key ? undefined : false;
      }
      this.modify(k, p, { name: this.isCustom(k) ? name.value : null, next: nextSel.value });
      if (UI && S.pane === 'styles') this.renderPane();
    } }];
    if (!creating && !this.isCustom(k) && k !== 'normal' && this.all()[k]) buttons.unshift({ label: 'Reset', left: true, onClick: () => this.reset(k) });
    openDialog({ title: creating ? 'Create a Style' : `Modify Style: ${this.name(k)}`, width: 600, body, focus: creating ? 'input' : 'select', buttons });
  },
  freeName() { let i = 1; const names = new Set(this.keys().map(k => this.name(k).toLowerCase())); while (names.has(('Style' + i).toLowerCase())) i++; return 'Style' + i; },
  renameDialog(k) {
    const name = input(this.name(k), { maxlength: '60', 'data-avro': '' });
    openDialog({ title: 'Rename Style', width: 380, body: field('Name', name, 'stRename'), focus: '#stRename', buttons: [{ label: 'Cancel' }, { label: 'Rename', primary: true, onClick: () => { const v = name.value.trim(); if (!v) return false; if (this.keys().some(x => x !== k && this.name(x).toLowerCase() === v.toLowerCase())) { toast(`There is already a style called “${v}”.`); return false; } this.rename(k, v); if (S.pane === 'styles') this.renderPane(); } }] });
  },
  /* ---------- the Styles pane ---------- */
  renderPane() {
    const sec = $('#sidePane .pane-section[data-section="styles"]');
    if (!sec || !S.doc) return;
    const cur = blockStyleKey(blockOf(curTextNode()));
    // the styles' looks, measured once while they stay the same
    const sig = JSON.stringify([this.all(), S.doc.font, S.doc.size, S.doc.headFont || '', S.doc.line]);
    if (!this._looks || this._looks.sig !== sig) this._looks = { sig, map: {} };
    const looks = this._looks.map;
    const keep = sec.querySelector('.st-list') ? sec.querySelector('.st-list').scrollTop : 0;
    const ae = document.activeElement, focusK = ae && sec.contains(ae) && ae.closest('.st-item') ? ae.closest('.st-item').dataset.style : null;
    sec.innerHTML = '';
    const list = h('div', { class: 'st-list', role: 'list' });
    for (const k of this.keys()) {
      const s = looks[k] || (looks[k] = this.look(k));
      const n = this.blocksOf(k).length;
      // the name in the style's font (the pane's own colour, so it reads in a dark theme too)
      const nm = h('span', { class: 'st-nm', style: { fontFamily: fontStack(s.font), fontWeight: s.bold ? 700 : 400, fontStyle: s.italic ? 'italic' : 'normal', fontSize: Math.min(17, Math.max(12, s.size * 1.333 * 0.85)) + 'px' } }, this.name(k));
      const more = h('button', { type: 'button', class: 'tb-btn st-more', title: this.name(k) + ' options', 'aria-label': this.name(k) + ' options', html: icon('more') });
      more.addEventListener('click', e => { e.stopPropagation(); this.menu(more, k); });
      const row = h('div', { class: 'st-item' + (k === cur ? ' on' : ''), role: 'listitem', tabindex: '0', 'data-style': k, title: `${this.name(k)}: ${n === 1 ? '1 paragraph' : n + ' paragraphs'}${this.isCustom(k) ? ' · your style' : this.all()[k] ? ' · modified' : ''}` }, nm, h('span', { class: 'st-n' }, n ? String(n) : ''), more);
      row.addEventListener('click', () => { setBlockStyle(k); this.renderPane(); });
      row.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); setBlockStyle(k); this.renderPane(); } });
      row.addEventListener('contextmenu', e => { e.preventDefault(); this.menu(row, k); });
      list.appendChild(row);
    }
    const newBtn = h('button', { type: 'button', class: 'btn' }, 'New Style…');
    newBtn.addEventListener('click', () => this.dialog(null));
    const clr = h('button', { type: 'button', class: 'btn' }, 'Clear Formatting');
    clr.addEventListener('click', () => clearFormatting());
    sec.append(h('p', { class: 'note', style: { margin: '0 0 8px' } }, 'Click a style to use it on the paragraphs you have selected. Change a style and every paragraph with it changes.'), list, h('div', { class: 'asst-row', style: { marginTop: '10px', gap: '8px' } }, newBtn, clr));
    list.scrollTop = keep;
    if (focusK) { const r = list.querySelector(`.st-item[data-style="${focusK}"]`); if (r) r.focus({ preventScroll: true }); }
  },
  paneSoon: debounce(() => { if (S.pane === 'styles') Styles.renderPane(); }, 250),
});
