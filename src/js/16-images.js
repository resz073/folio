/* ===================== Pictures ===================== */
const Images = {
  async prepare(file) {
    const url = await readFileAs(file, 'url');
    if (/^image\/(svg\+xml|gif)$/i.test(file.type) && file.size < 3e6) return { url, w: 0, h: 0 };
    const img = await loadImg(url);
    const max = 1800;
    let w = img.naturalWidth, hh = img.naturalHeight;
    const big = Math.max(w, hh) > max || file.size > 1.2e6 || !/^image\/(png|jpeg)$/i.test(file.type);
    if (!big) return { url, w, h: hh };
    const k = Math.min(1, max / Math.max(w, hh));
    w = Math.round(w * k); hh = Math.round(hh * k);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = hh;
    const ctx = cv.getContext('2d');
    const png = /png|webp|gif/i.test(file.type) && hasAlpha(img);
    if (!png) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, hh); }
    ctx.drawImage(img, 0, 0, w, hh);
    return { url: png ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.88), w, h: hh };
  },
  async insertFiles(files) {
    if (S.readOnly) return;
    const list = Array.from(files).filter(f => /^image\//.test(f.type));
    if (!list.length) return;
    const b = list.length > 1 ? busy('Adding pictures…') : null;
    try {
      const prepared = [];
      for (let i = 0; i < list.length; i++) { prepared.push(await this.prepare(list[i])); if (b) b.set((i + 1) / list.length); }
      focusEditor();
      change(() => {
        // as wide as the column at most (the section's)
        const g = geomAt();
        let lastImg = null;
        for (const p of prepared) {
          const img = h('img', { src: p.url, alt: '' });
          const natural = p.w || 400;
          img.style.width = Math.round(Math.min(natural, g.cw)) + 'px';
          const r = getRange();
          if (r) {
            const leaf = blockOf(r.startContainer);
            if (leaf && leaf.childNodes.length === 1 && leaf.firstChild.nodeName === 'BR') { leaf.innerHTML = ''; leaf.appendChild(img); }
            else { r.deleteContents(); r.insertNode(img); }
          } else S.editor.appendChild(h('p', null, img));
          caretAfter(img);
          lastImg = img;
        }
        if (lastImg) setTimeout(() => this.select(lastImg), 0);
      }, { full: true });
    } catch (e) { toast('That picture could not be added.', { error: true }); console.error(e); }
    finally { if (b) b.close(); }
  },
  select(img) {
    if (S.selImg === img) { this.refreshFrame(); return; }
    this.deselect(true);
    S.selImg = img;
    const r = document.createRange();
    r.selectNode(img);
    S.editor.focus({ preventScroll: true });
    setRange(r);
    const ov = $('#overlay');
    const fr = h('div', { class: 'img-frame' });
    // a shape: its own handles (a line: one at each end); it turns as it is drawn, not baked
    const shape = Shapes.is(img), line = Shapes.isLine(img);
    for (const k of line ? ['p1', 'p2'] : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
      const hd = h('div', { class: 'hd ' + k, 'data-h': k });
      hd.addEventListener('pointerdown', e => (shape ? Shapes.startResize(e, k) : this.startResize(e, k)));
      fr.appendChild(hd);
    }
    if (!line) {
      const rot = h('div', { class: 'hd rot', title: 'Rotate (Shift: 15° steps)' });
      rot.addEventListener('pointerdown', e => (shape ? Shapes.startRotate(e) : PicEdit.startRotate(e)));
      fr.appendChild(rot);
    }
    fr.appendChild(h('div', { class: 'sz' }));
    ov.appendChild(fr);
    this.frame = fr;
    this.refreshFrame();
    UI.showContext(shape ? 'shape' : 'picture', true);
    UI.refresh();
  },
  deselect(silent) {
    if (Crop.img) Crop.finish();
    if (this.frame) { this.frame.remove(); this.frame = null; }
    if (!S.selImg) return;
    S.selImg = null;
    if (!silent) { UI.showContext('picture', false); if (!Shapes.cur()) UI.showContext('shape', false); UI.refresh(); }
  },
  refreshFrame() {
    const img = S.selImg;
    if (!img || !this.frame) return;
    if (!img.isConnected) { this.deselect(); return; }
    if (Shapes.is(img)) {
      Shapes.placeFrame(img, this.frame);
      this.frame.classList.toggle('float', PicEdit.floating(img));
      this.frame.classList.toggle('ro', !!S.readOnly);
      return;
    }
    const pr = $('#paper').getBoundingClientRect();
    const r = Grid.place(img, img.getBoundingClientRect());
    Object.assign(this.frame.style, { left: (r.left - pr.left) / S.zoom + 'px', top: (r.top - pr.top) / S.zoom + 'px', width: r.width / S.zoom + 'px', height: r.height / S.zoom + 'px' });
    this.frame.classList.toggle('float', PicEdit.floating(img));
    this.frame.classList.toggle('ro', !!S.readOnly);
    this.frame.querySelector('.sz').textContent = `${fmtLen(img.offsetWidth)} × ${fmtLen(img.offsetHeight)}`;
  },
  startResize(e, k) {
    e.preventDefault(); e.stopPropagation();
    const img = S.selImg;
    if (!img || S.readOnly) return;
    const w0 = img.offsetWidth, h0 = img.offsetHeight, ratio = w0 / Math.max(1, h0);
    const fl = PicEdit.floating(img), l0 = parseFloat(img.style.left) || 0, t0 = parseFloat(img.style.top) || 0;
    const x0 = e.clientX, y0 = e.clientY;
    const maxW = (geomAt(img) || geom()).cw * 1.5;
    beginChange();
    if (Hist.timer) histRecord();
    const corner = k.length === 2;
    const move = ev => {
      const dx = (ev.clientX - x0) / S.zoom * (k.includes('w') ? -1 : 1);
      const dy = (ev.clientY - y0) / S.zoom * (k.includes('n') ? -1 : 1);
      let w = w0, hh = h0;
      if (corner) { w = clamp(w0 + Math.max(dx, dy * ratio), 16, maxW); hh = w / ratio; img.style.width = Math.round(w) + 'px'; img.style.height = ''; }
      else if (k === 'e' || k === 'w') { w = clamp(w0 + dx, 16, maxW); img.style.width = Math.round(w) + 'px'; img.style.height = Math.round(h0) + 'px'; }
      else { hh = clamp(h0 + dy, 16, 3000); img.style.height = Math.round(hh) + 'px'; img.style.width = Math.round(w0) + 'px'; }
      if (fl) {
        if (k.includes('w')) img.style.left = Math.round((l0 + w0 - img.offsetWidth) * 10) / 10 + 'px';
        if (k.includes('n')) img.style.top = Math.round((t0 + h0 - img.offsetHeight) * 10) / 10 + 'px';
      }
      this.refreshFrame();
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      histRecord();
      afterChange(img, { full: true });
      this.refreshFrame();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  },
  /* true while the live selection is exactly the selected picture */
  wrapped(r) {
    const img = S.selImg;
    r = r || getRange();
    if (!img || !r || !img.isConnected) return false;
    const par = img.parentNode, i = Array.prototype.indexOf.call(par.childNodes, img);
    return r.startContainer === par && r.endContainer === par && r.startOffset === i && r.endOffset === i + 1;
  },
  key(e) {
    const img = S.selImg;
    if (!img) return false;
    if (!this.wrapped()) { this.deselect(); return false; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.remove(); return true; }
    // a shape: Enter or F2 opens its text; a letter typed goes into it (as in Word)
    if (Shapes.is(img) && !Shapes.isLine(img) && !S.readOnly && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); Shapes.edit(img); return true; }
      if (e.key.length === 1) { Shapes.edit(img); return true; }
    }
    // (Esc with a menu open closes the menu only)
    if (e.key === 'Escape' && Menu.el) return false;
    if (e.key === 'Escape') { e.preventDefault(); const p = img; this.deselect(); caretAfter(p); return true; }
    if (/^Arrow/.test(e.key) && PicEdit.floating(img) && !S.readOnly) { e.preventDefault(); PicEdit.nudge(img, e.key, e.shiftKey); return true; }
    if (/^Arrow/.test(e.key)) { const p = img; this.deselect(); if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') caretBefore(p); else caretAfter(p); e.preventDefault(); return true; }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { const p = img; this.deselect(); caretAfter(p); return false; }
    return false;
  },
  remove() {
    const img = S.selImg;
    if (!img) return;
    change(() => {
      const b = blockOf(img);
      const after = document.createRange(); after.setStartAfter(img); after.collapse(true);
      this.deselect();
      img.remove();
      if (b && isBlank(b)) b.innerHTML = '<br>';
      if (b) { try { setRange(after); } catch { caretAtStart(b); } }
    }, { full: true });
  },
  setWrap(mode) {
    const img = S.selImg;
    if (!img) return;
    const r0 = img.getBoundingClientRect();
    change(() => {
      const was = PicEdit.wrapOf(img);
      img.classList.remove('img-left', 'img-right', 'img-center', 'img-front', 'img-behind');
      if (mode === 'front' || mode === 'behind') { img.classList.add('img-' + mode); PicEdit.anchor(img, r0); }
      else {
        if (was) { img.style.removeProperty('left'); img.style.removeProperty('top'); }
        if (mode === 'left') img.classList.add('img-left');
        else if (mode === 'right') img.classList.add('img-right');
        else if (mode === 'center') img.classList.add('img-center');
      }
      if (!img.classList.length) img.removeAttribute('class');
    }, { full: true });
    setTimeout(() => { this.refreshFrame(); UI.refresh(); }, 0);
  },
  wrapMode(img) { img = img || S.selImg; if (!img) return 'inline'; return img.classList.contains('img-left') ? 'left' : img.classList.contains('img-right') ? 'right' : img.classList.contains('img-center') ? 'center' : img.classList.contains('img-front') ? 'front' : img.classList.contains('img-behind') ? 'behind' : 'inline'; },
  setSize(wPx, hPx, lock) {
    const img = S.selImg;
    if (!img) return;
    change(() => {
      if (lock || !hPx) { img.style.width = Math.round(wPx) + 'px'; img.style.height = ''; }
      else { img.style.width = Math.round(wPx) + 'px'; img.style.height = Math.round(hPx) + 'px'; }
    }, { full: true });
    setTimeout(() => this.refreshFrame(), 0);
  },
  resetSize() {
    const img = S.selImg;
    if (!img) return;
    this.setSize(Math.min(img.naturalWidth || img.offsetWidth, (geomAt(img) || geom()).cw), 0, true);
  },
  toggleBorder() { const img = S.selImg; if (!img) return; change(() => img.classList.toggle('img-border')); setTimeout(() => this.refreshFrame(), 0); },
  replace() {
    const img = S.selImg;
    if (!img) return;
    pickFile('image/*', false, async files => {
      const p = await this.prepare(files[0]);
      change(() => { img.src = p.url; }, { full: true });
      setTimeout(() => this.refreshFrame(), 50);
    });
  },
};
function loadImg(url) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; }); }
function hasAlpha(img) {
  try {
    const c = document.createElement('canvas');
    const w = c.width = Math.min(64, img.naturalWidth), hh = c.height = Math.min(64, img.naturalHeight);
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0, w, hh);
    const d = x.getImageData(0, 0, w, hh).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
  } catch { }
  return false;
}
function caretAfter(node) { const r = document.createRange(); r.setStartAfter(node); r.collapse(true); setRange(r); }
function caretBefore(node) { const r = document.createRange(); r.setStartBefore(node); r.collapse(true); setRange(r); }
function pickFile(accept, multiple, cb) {
  const inp = h('input', { type: 'file', accept, style: { display: 'none' } });
  if (multiple) inp.multiple = true;
  inp.addEventListener('change', () => { if (inp.files && inp.files.length) cb(Array.from(inp.files)); inp.remove(); });
  document.body.appendChild(inp);
  inp.click();
}
