/* ===================== Markdown & text conversion ===================== */
function mdInline(s) {
  let t = esc(s);
  const codes = [];
  t = t.replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
  t = t.replace(/!\[([^\]]*)\]\((data:image\/[^)\s]+)\)/g, '<img alt="$1" src="$2">');
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, txt, href) => { const u = cleanHref(href.replace(/&amp;/g, '&')); return u ? `<a href="${esc(u)}">${txt}</a>` : txt; });
  t = t.replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, '<b><i>$1</i></b>');
  t = t.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<b>$1</b>').replace(/(^|[^\w])__(?=\S)([\s\S]*?\S)__(?!\w)/g, '$1<b>$2</b>');
  t = t.replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?!\*)/g, '$1<i>$2</i>').replace(/(^|[^_\w])_(?=\S)([^_]*?\S)_(?!\w)/g, '$1<i>$2</i>');
  t = t.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<s>$1</s>');
  t = t.replace(/\u0000(\d+)\u0000/g, (m, i) => `<span style="font-family:Consolas, Cousine, monospace">${codes[+i]}</span>`);
  return t;
}
function mdToHtml(md) {
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  const stack = [];
  let para = [];
  const flush = () => { if (para.length) { out.push('<p>' + para.map(mdInline).join('<br>') + '</p>'); para = []; } };
  const closeAll = () => { while (stack.length) out.push('</li></' + stack.pop().type + '>'); };
  const cells = row => row.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    let m;
    if (/^\s*```/.test(line)) { flush(); closeAll(); i++; const code = []; while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]); i++; for (const c of code) out.push('<p class="code">' + (esc(c) || '<br>') + '</p>'); continue; }
    if (!line.trim()) { flush(); i++; continue; }
    if ((m = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))) { flush(); closeAll(); const lv = m[1].length; out.push(`<h${lv}>${mdInline(m[2])}</h${lv}>`); i++; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); closeAll(); out.push('<hr>'); i++; continue; }
    if ((m = line.match(/^\s*>\s?(.*)$/))) { flush(); closeAll(); out.push('<p class="quote">' + mdInline(m[1]) + '</p>'); i++; continue; }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      flush(); closeAll();
      const head = cells(line);
      i += 2;
      const body = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) body.push(cells(lines[i++]));
      const n = head.length;
      let html = '<table class="tbl-grid hdr" style="width:100%"><tbody><tr>' + head.map(c => `<td><p>${mdInline(c) || '<br>'}</p></td>`).join('') + '</tr>';
      for (const r of body) { const row = r.slice(0, n); while (row.length < n) row.push(''); html += '<tr>' + row.map(c => `<td><p>${mdInline(c) || '<br>'}</p></td>`).join('') + '</tr>'; }
      out.push(html + '</tbody></table>');
      continue;
    }
    if ((m = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/))) {
      flush();
      const indent = m[1].replace(/\t/g, '    ').length;
      const type = /\d/.test(m[2]) ? 'ol' : 'ul';
      let text = m[3], check = null;
      const cm = type === 'ul' && text.match(/^\[( |x|X)\]\s+(.*)$/);
      if (cm) { check = cm[1] !== ' '; text = cm[2]; }
      let top = stack[stack.length - 1];
      if (!top || indent > top.indent) { out.push(`<${type}${check !== null ? ' class="checklist"' : ''}>`); stack.push({ type, indent }); }
      else {
        while (stack.length && stack[stack.length - 1].indent > indent) out.push('</li></' + stack.pop().type + '>');
        top = stack[stack.length - 1];
        if (!top) { out.push(`<${type}>`); stack.push({ type, indent }); }
        else if (top.type !== type) { out.push('</li></' + stack.pop().type + '>'); out.push(`<${type}>`); stack.push({ type, indent }); }
        else out.push('</li>');
      }
      out.push(`<li${check !== null ? ` data-checked="${check}"` : ''}>` + mdInline(text));
      i++;
      continue;
    }
    if (stack.length && /^\s{2,}\S/.test(line)) { out.push('<br>' + mdInline(line.trim())); i++; continue; }
    closeAll();
    para.push(line.replace(/\s+$/, ''));
    i++;
  }
  flush(); closeAll();
  return out.join('');
}

function mdEscape(s) { return s.replace(/([\\`*_[\]#|])/g, '\\$1'); }
let MD_NOTES = null;   // while exporting: note id -> its label ([^fn1], [^en1])
function inlineToMd(node) {
  let s = '';
  for (let n = node.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 3) { s += mdEscape(n.data.replace(/\u200B/g, '')); continue; }
    if (n.nodeType !== 1) continue;
    const t = n.tagName;
    if (n.matches('del.tc, .pg-line, .qm, tr.pg-spacer')) continue;
    if (t === 'SUP' && n.classList.contains('fn') && MD_NOTES && MD_NOTES.has(n.dataset.fn)) { s += `[^${MD_NOTES.get(n.dataset.fn)}]`; continue; }
    if (t === 'BR') { s += '  \n'; continue; }
    if (t === 'IMG') { s += `![${(n.getAttribute('alt') || '').replace(/[[\]]/g, '')}](${n.getAttribute('src')})`; continue; }
    let inner = inlineToMd(n);
    if (!inner.trim()) { s += inner; continue; }
    const cs = n.style;
    const bold = t === 'B' || t === 'STRONG' || (cs && parseInt(cs.fontWeight, 10) >= 600);
    const ital = t === 'I' || t === 'EM' || (cs && cs.fontStyle === 'italic');
    const strike = t === 'S' || t === 'STRIKE' || (t === 'DEL' && !n.classList.contains('tc')) || (cs && /line-through/.test(cs.textDecorationLine || ''));
    const lead = inner.match(/^\s*/)[0], trail = inner.match(/\s*$/)[0];
    let core = inner.trim();
    if (strike) core = `~~${core}~~`;
    if (ital) core = `*${core}*`;
    if (bold) core = `**${core}**`;
    if (t === 'A' && n.getAttribute('href')) core = `[${core}](${n.getAttribute('href')})`;
    s += lead + core + trail;
  }
  return s;
}
function cellMd(c) {
  const kids = Array.from(c.children).filter(k => isBlockEl(k));
  const parts = kids.length ? kids.map(k => inlineToMd(k)) : [inlineToMd(c)];
  return parts.map(x => x.replace(/\n+/g, ' ').replace(/\|/g, '\\|').trim()).filter(Boolean).join('<br>');
}
function toMarkdown(root) {
  // the document's notes as Markdown footnotes: marks [^fn1], the notes' text at the end
  if (!root && !MD_NOTES) {
    const body = docBody(), ids = new Map(), n = { foot: 0, end: 0 };
    for (const r of Notes.refs(body)) if (!ids.has(r.dataset.fn) && Notes.all()[r.dataset.fn]) { const k = Notes.kindOf(r); ids.set(r.dataset.fn, (k === 'end' ? 'en' : 'fn') + ++n[k]); }
    if (ids.size) {
      MD_NOTES = ids;
      try {
        let md = toMarkdown(body);
        md += '\n' + [...ids].map(([id, label]) => { const t = document.createElement('div'); t.innerHTML = Notes.all()[id].html || ''; return `[^${label}]: ` + Array.from(t.children).map(b => inlineToMd(b).trim()).filter(Boolean).join(' ').trim(); }).join('\n') + '\n';
        return md;
      } finally { MD_NOTES = null; }
    }
  }
  root = root || docBody();
  const out = [];
  const listMd = (list, depth) => {
    let i = parseInt(list.getAttribute('start') || '1', 10);
    for (const li of list.children) {
      if (li.tagName === 'UL' || li.tagName === 'OL') { listMd(li, depth + 1); continue; }
      if (li.tagName !== 'LI') continue;
      const clone = li.cloneNode(true);
      clone.querySelectorAll(':scope > ul, :scope > ol').forEach(x => x.remove());
      const pre = '  '.repeat(depth) + (list.tagName === 'OL' ? `${i++}. ` : (list.classList.contains('checklist') ? (li.getAttribute('data-checked') === 'true' ? '- [x] ' : '- [ ] ') : '- '));
      out.push(pre + inlineToMd(clone).replace(/\n/g, ' ').trim());
      li.querySelectorAll(':scope > ul, :scope > ol').forEach(x => listMd(x, depth + 1));
    }
  };
  let inCode = false;
  const blocks = Array.from(root.children);
  blocks.forEach((b, idx) => {
    const t = b.tagName;
    const isCode = t === 'P' && b.classList.contains('code');
    if (isCode && !inCode) { out.push('```'); inCode = true; }
    if (!isCode && inCode) { out.push('```', ''); inCode = false; }
    if (isCode) { out.push(b.textContent.replace(/\u200B/g, '')); return; }
    if (/^H[1-6]$/.test(t)) out.push('#'.repeat(+t[1]) + ' ' + inlineToMd(b).trim(), '');
    else if (t === 'P' && b.classList.contains('title')) out.push('# ' + inlineToMd(b).trim(), '');
    else if (t === 'P' && b.classList.contains('quote')) out.push('> ' + inlineToMd(b).trim(), '');
    else if (t === 'P') { const s = inlineToMd(b).trim(); out.push(s, ''); }
    else if (t === 'UL' || t === 'OL') { listMd(b, 0); out.push(''); }
    else if (t === 'HR' && b.classList.contains('sb')) out.push('');
    else if (t === 'HR') out.push('---', '');
    else if (t === 'TABLE') {
      const rows = Array.from(b.rows).filter(r => !r.classList.contains('pg-spacer'));
      rows.forEach((r, ri) => {
        out.push('| ' + Array.from(r.cells).map(c => cellMd(c)).join(' | ') + ' |');
        if (ri === 0) out.push('|' + Array.from(r.cells).map(() => ' --- ').join('|') + '|');
      });
      out.push('');
    } else if (b.classList.contains('toc')) {
      out.push('**Contents**', '');
      b.querySelectorAll('.te').forEach(te => out.push('  '.repeat(+(te.className.match(/l(\d)/) || [0, 1])[1] - 1) + '- ' + te.querySelector('.tt').textContent));
      out.push('');
    } else if (b.classList.contains('cols')) { out.push(toMarkdown(b)); }
    else out.push(inlineToMd(b).trim(), '');
    // the text of shapes and text boxes in it, after it
    for (const html of shapeHtmls(b)) { const d = document.createElement('div'); d.innerHTML = html; out.push(toMarkdown(d).trim(), ''); }
    if (idx === blocks.length - 1 && inCode) out.push('```');
  });
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
function toPlainText(root) {
  const top = !root;
  root = root || docBody();
  const out = [];
  const txt = el => { const c = el.cloneNode(true); c.querySelectorAll('del.tc, .pg-line, .qm, ul, ol').forEach(x => x.remove()); c.querySelectorAll('br').forEach(b => b.replaceWith('\n')); c.querySelectorAll('sup.fn').forEach(s => s.replaceWith('[' + s.textContent + ']')); return c.textContent.replace(/\u200B/g, ''); };
  const listTxt = (list, depth) => {
    let i = parseInt(list.getAttribute('start') || '1', 10);
    for (const li of list.children) {
      if (li.tagName === 'UL' || li.tagName === 'OL') { listTxt(li, depth + 1); continue; }
      if (li.tagName !== 'LI') continue;
      const mark = list.tagName === 'OL' ? `${i++}. ` : (list.classList.contains('checklist') ? (li.getAttribute('data-checked') === 'true' ? '[x] ' : '[ ] ') : '• ');
      out.push('    '.repeat(depth) + mark + txt(li).trim());
      li.querySelectorAll(':scope > ul, :scope > ol').forEach(x => listTxt(x, depth + 1));
    }
  };
  for (const b of root.children) {
    const t = b.tagName;
    if (t === 'UL' || t === 'OL') listTxt(b, 0);
    else if (t === 'TABLE') { for (const r of b.rows) if (!r.classList.contains('pg-spacer')) out.push(Array.from(r.cells).map(c => { const kids = Array.from(c.children).filter(k => isBlockEl(k)); return (kids.length ? kids.map(k => txt(k)) : [txt(c)]).map(x => x.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean).join(' / '); }).join('\t')); }
    else if (t === 'HR') out.push(b.classList.contains('pb') || (b.classList.contains('sb') && b.dataset.sb !== 'cont') ? '\f' : '');
    else if (b.classList.contains('cols')) out.push(toPlainText(b));
    else if (b.classList.contains('toc')) {
      const tt = b.querySelector('.toc-title');
      if (tt) out.push(tt.textContent.trim());
      b.querySelectorAll('.te').forEach(te => { const lvl = te.classList.contains('l3') ? 2 : te.classList.contains('l2') ? 1 : 0; const t2 = te.querySelector('.tt'), pg = te.querySelector('.tp'); out.push('    '.repeat(lvl) + (t2 ? t2.textContent.trim() : te.textContent.trim()) + (pg ? '\t' + pg.textContent.trim() : '')); });
      out.push('');
    }
    else out.push(txt(b));
    for (const html of shapeHtmls(b)) { const d = document.createElement('div'); d.innerHTML = html; out.push(toPlainText(d)); }
  }
  // the notes, after the text
  if (top) {
    const refs = Notes.refs(root).filter(r => Notes.all()[r.dataset.fn]);
    if (refs.length) out.push('', '____________', ...refs.map(r => `[${r.textContent}] ${Notes.text(r.dataset.fn)}`));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '');
}
/* the text (HTML) of the shapes and text boxes in a block */
function shapeHtmls(b) {
  if (!b.querySelectorAll) return [];
  return Array.from(b.querySelectorAll('span.shp')).map(sh => { const t = Array.from(sh.children).find(k => k.tagName === 'TEMPLATE'); return t ? t.innerHTML.trim() : ''; }).filter(Boolean);
}
function textToHtml(text) {
  return String(text).replace(/\r\n?/g, '\n').split('\n').map(l => l ? `<p>${esc(l).replace(/\t/g, '\t')}</p>` : '<p><br></p>').join('');
}

/* A standalone page that prints like the document */
function toStandaloneHtml() {
  if (Story.cur) Story.close();
  const d = S.doc, g = geom();
  const docCss = ($('#docCss') && $('#docCss').textContent) || '';
  const fonts = new Set([d.font, d.headFont].filter(Boolean));
  S.editor.querySelectorAll('[style*="font-family"]').forEach(el => { const f = firstFamily(el.style.fontFamily); if (f) fonts.add(f); });
  const links = [];
  for (const f of fonts) { const e = FONT_MAP[f.toLowerCase()]; let spec = e && e.g; if (!spec && e && e.alt) { const a = e.alt.map(x => FONT_MAP[x.toLowerCase()]).find(x => x && x.g); spec = a && a.g; } if (spec) links.push(`<link rel="stylesheet" href="${googleHref(spec)}">`); }
  links.push(`<link rel="stylesheet" href="${googleHref(FONT_MAP['noto sans bengali'].g)}">`);
  const mm = px => fmtNum(px / PX.mm, 2) + 'mm';
  const page = `@page{size:${mm(g.w)} ${mm(g.h)};margin:${mm(g.mt)} ${mm(g.mr)} ${mm(g.mb)} ${mm(g.ml)}}`;
  // the first page's header and footer, at the top and bottom of the page (fields filled in)
  const hfPart = kind => {
    const html = HF.html(kind, 0);
    if (HF.empty(html)) return '';
    const t = document.createElement('div');
    t.innerHTML = html;
    HF.fill(t, 0, S.pages);
    t.querySelectorAll('[contenteditable]').forEach(n => n.removeAttribute('contenteditable'));
    Shapes.declarative(t);
    return `<${kind} class="hfx doc ${kind === 'header' ? 'hdr' : 'ftr'}">${t.innerHTML}</${kind}>`;
  };
  const hdr = hfPart('header'), ftr = hfPart('footer');
  const padTop = HF.top(0, g), padBot = HF.bot(0, g);
  const vars = docVarsCss();
  let body = cleanHTML(null, { lineMarks: true }).replace(/<div class="toc" contenteditable="false">/g, '<div class="toc">');
  // sections: printed on pages of their own size and margins (CSS named pages), each starting a
  // new page unless it is continuous
  let sectCss = '';
  if (/class="sb"/.test(body)) {
    const t = document.createElement('div');
    t.innerHTML = body;
    const secs = Sections.list();
    let k = 0;
    for (const b of Array.from(t.children)) {
      if (b.tagName === 'HR' && b.classList.contains('sb')) { k++; continue; }
      const sg = secs[Math.min(k, secs.length - 1)].g;
      if (k && ['w', 'h', 'mt', 'mr', 'mb', 'ml'].some(x => Math.abs(sg[x] - g[x]) > 0.5)) b.setAttribute('data-sect', String(k));
    }
    secs.forEach((sc, i) => { if (i && t.querySelector(`[data-sect="${i}"]`)) sectCss += `@page s${i}{size:${mm(sc.g.w)} ${mm(sc.g.h)};margin:${mm(sc.g.mt)} ${mm(sc.g.mr)} ${mm(sc.g.mb)} ${mm(sc.g.ml)}}\n@media print{.page>[data-sect="${i}"]{page:s${i}}}\n`; });
    body = t.innerHTML;
  }
  // shapes and text boxes: drawn in a shadow root the browser makes from the page itself
  if (/class="shp/.test(body)) { const t = document.createElement('div'); t.innerHTML = body; Shapes.declarative(t); body = t.innerHTML; }
  // footnotes and endnotes: each mark links to its note, the notes after the text
  let notesHtml = '';
  if (/class="fn/.test(body)) {
    const t = document.createElement('div');
    t.innerHTML = body;
    const items = { foot: [], end: [] };
    t.querySelectorAll('sup.fn[data-fn]').forEach((s, i) => {
      const id = s.dataset.fn, n = Notes.all()[id];
      if (!n) return;
      const k = 'n' + (i + 1);
      s.removeAttribute('contenteditable');
      s.innerHTML = `<a href="#${k}" id="r-${k}">${esc(s.textContent)}</a>`;
      const nt = document.createElement('div');
      nt.innerHTML = n.html || '<p><br></p>';
      const first = nt.querySelector('p, li, h1, h2, h3, h4, h5, h6') || nt;
      first.insertAdjacentHTML('afterbegin', `<sup class="fnn"><a href="#r-${k}">${esc(s.textContent)}</a></sup>`);
      items[n.kind === 'end' ? 'end' : 'foot'].push(`<div class="${n.kind === 'end' ? 'enote' : 'fnote'}" id="${k}">${nt.innerHTML}</div>`);
    });
    body = t.innerHTML;
    for (const kind of ['foot', 'end']) if (items[kind].length) notesHtml += `<section class="${kind === 'end' ? 'en-area' : 'fn-area'} doc" aria-label="${kind === 'end' ? 'Endnotes' : 'Footnotes'}"><div class="fn-sep"><div class="fn-rule"></div></div>${items[kind].join('')}</section>`;
  }
  const wm = d.watermark && d.watermark.text ? `<div class="wm" aria-hidden="true">${esc(d.watermark.text)}</div>` : '';
  const wmCss = wm ? `.wm{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-45deg);font:700 96px Calibri,Carlito,sans-serif;color:${d.watermark.color || '#c0c0c0'};opacity:${d.watermark.opacity != null ? d.watermark.opacity : 0.45};z-index:-1;white-space:nowrap}` : '';
  return `<!doctype html>
<html lang="${esc(d.lang || 'en')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(d.title || 'Document')}</title>
${links.join('\n')}
<style>
${page}
html{background:#e9ecea}
body{margin:0}
.page{position:relative;z-index:0;box-sizing:border-box;width:${g.w}px;min-height:${g.h}px;margin:24px auto;padding:${padTop}px ${g.mr}px ${padBot}px ${g.ml}px;background:${d.page.color || '#fff'};box-shadow:0 2px 12px rgba(0,0,0,.15);${vars}}
.page>.hfx{position:absolute;z-index:0;left:${g.ml}px;width:${g.w - g.ml - g.mr}px}
.page>.hfx.hdr{top:${g.hd}px}
.page>.hfx.ftr{bottom:${g.fd}px}
.doc table.tbl-plain td,.doc table.tbl-plain th{border-color:transparent}
.page>.fn-area,.page>.en-area{margin-top:12pt}
.doc sup.fn a,.doc sup.fnn a{color:inherit;text-decoration:none}
@media print{html{background:none}.page{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}.page>.hfx{position:static;width:auto}.page>.hfx.hdr{margin-bottom:12pt}.page>.hfx.ftr{margin-top:12pt}hr.pb,hr.sb:not([data-sb="cont"]){break-after:page;border:0;height:0;margin:0}}
${sectCss}
${docCss}
${Styles.css()}
${LineH.cssText()}.doc .cmt{background:none;border:0}
.doc .toc .te{cursor:default}
${wmCss}
</style>
</head>
<body>
${wm}<article class="page doc">${hdr}${body}${notesHtml}${ftr}</article>
</body>
</html>
`;
}
