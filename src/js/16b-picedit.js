/* ===================== Picture edits =====================
   Crop, rotate, flip and a transparent background (for signatures and stamps) never lose the
   picture: the first edit keeps the original in data-orig, and data-xf says what was done to
   it: { c: [l, t, r, b] crop as fractions of the original, r: degrees clockwise, fh / fv:
   flipped, bg: background removal strength 0–1 (0 = off), ink: a colour for the ink or '' }.
   The src is always made again from the original (bake), so edits don't pile up loss, and
   Reset Picture brings the original back. Layout, PDF, print and .docx just see a picture.
   Order, as in Word: crop (in the picture's own coordinates) → background → flip → turn.
   In Front of Text / Behind Text: the picture (img-front / img-behind) leaves the line and sits
   at the start of its paragraph (its anchor), placed with left/top relative to it; it moves
   with the paragraph, and dragging it moves it (and its anchor, to the paragraph at its top). */
const PIC_MAX = 2400;
const round1 = n => Math.round(n * 10) / 10;
function canvasOf(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
const PicEdit = {
  /* ---------- what was done to a picture ---------- */
  blank() { return { c: [0, 0, 0, 0], r: 0, fh: 0, fv: 0, bg: 0, ink: '' }; },
  xf(img) {
    let v = null;
    try { v = JSON.parse((img && img.getAttribute('data-xf')) || 'null'); } catch { }
    return this.clean(v);
  },
  clean(v) {
    const x = this.blank();
    if (!v || typeof v !== 'object') return x;
    if (Array.isArray(v.c) && v.c.length === 4) x.c = v.c.map(n => clamp(+n || 0, 0, 0.98));
    for (const [a, b] of [[0, 2], [1, 3]]) { const s = x.c[a] + x.c[b]; if (s > 0.98) { x.c[a] *= 0.98 / s; x.c[b] *= 0.98 / s; } }
    x.c = x.c.map(n => Math.round(n * 1e5) / 1e5);
    x.r = this.angle(+v.r || 0);
    x.fh = v.fh ? 1 : 0; x.fv = v.fv ? 1 : 0;
    x.bg = Math.round(clamp(+v.bg || 0, 0, 1) * 100) / 100;
    x.ink = x.bg && /^#[0-9a-f]{6}$/i.test(v.ink || '') ? v.ink.toLowerCase() : '';
    return x;
  },
  isBlank(x) { return !x.c.some(n => n > 0) && !x.r && !x.fh && !x.fv && !x.bg; },
  angle(r) { r = ((r % 360) + 360) % 360; r = Math.round(r * 100) / 100; return r >= 360 ? 0 : r; },
  /* 0–3 for a whole number of quarter turns, -1 for any other angle */
  quarter(r) { const q = r / 90; return Math.abs(q - Math.round(q)) < 1e-6 ? ((Math.round(q) % 4) + 4) % 4 : -1; },
  orig(img) { return img.getAttribute('data-orig') || img.getAttribute('src') || ''; },
  edited(img) { return !!(img && img.hasAttribute('data-xf')); },
  floating(img) { return !!img && (img.classList.contains('img-front') || img.classList.contains('img-behind')); },
  wrapOf(img) { return !img ? null : img.classList.contains('img-front') ? 'front' : img.classList.contains('img-behind') ? 'behind' : null; },
  /* ---------- sizes ---------- */
  /* in original pixels: the cropped picture (wc × hc) and the box it takes once turned (bw × bh) */
  box(o, x) {
    const W = o.naturalWidth || o.width, H = o.naturalHeight || o.height;
    const wc = W * (1 - x.c[0] - x.c[2]), hc = H * (1 - x.c[1] - x.c[3]);
    const q = this.quarter(x.r);
    if (q === 1 || q === 3) return { wc, hc, bw: hc, bh: wc, swap: true };
    if (q === 0 || q === 2) return { wc, hc, bw: wc, bh: hc };
    const a = x.r * Math.PI / 180, cs = Math.abs(Math.cos(a)), sn = Math.abs(Math.sin(a));
    return { wc, hc, bw: wc * cs + hc * sn, bh: wc * sn + hc * cs, free: true };
  },
  /* how big the picture is shown, per original pixel, along its own width and height */
  scales(img, o, x) {
    const cs = getComputedStyle(img);
    const dw = parseFloat(cs.width) || img.offsetWidth || 1, dh = parseFloat(cs.height) || img.offsetHeight || 1;
    const b = this.box(o, x);
    if (b.free) { const s = Math.sqrt((dw * dh) / Math.max(1, b.bw * b.bh)); return { sx: s, sy: s }; }
    if (b.swap) return { sx: dh / Math.max(1, b.wc), sy: dw / Math.max(1, b.hc) };
    return { sx: dw / Math.max(1, b.wc), sy: dh / Math.max(1, b.hc) };
  },
  /* the size to show a transform at, at the same scale */
  sizeFor(o, x, sc) {
    const b = this.box(o, x);
    if (b.free) { const s = Math.sqrt(sc.sx * sc.sy); return { w: b.bw * s, h: b.bh * s }; }
    if (b.swap) return { w: b.hc * sc.sy, h: b.wc * sc.sx };
    return { w: b.wc * sc.sx, h: b.hc * sc.sy };
  },
  /* ---------- making the picture ---------- */
  /* the picture for a transform: { url, w, h, canvas } */
  async bake(o, x, opts = {}) {
    const W = o.naturalWidth || o.width, H = o.naturalHeight || o.height;
    const sx = W * x.c[0], sy = H * x.c[1];
    const sw = Math.max(1, W * (1 - x.c[0] - x.c[2])), sh = Math.max(1, H * (1 - x.c[1] - x.c[3]));
    const k = Math.min(1, (opts.max || PIC_MAX) / Math.max(sw, sh));
    const cw = Math.max(1, Math.round(sw * k)), ch = Math.max(1, Math.round(sh * k));
    let cv = canvasOf(cw, ch);
    const g = cv.getContext('2d', { willReadFrequently: x.bg > 0 });
    g.imageSmoothingQuality = 'high';
    g.drawImage(o, sx, sy, sw, sh, 0, 0, cw, ch);
    let alpha = opts.alpha != null ? opts.alpha : hasAlpha(o);
    if (x.bg > 0) { this.clearBg(cv, x.bg, x.ink); alpha = true; }
    if (x.fh || x.fv) {
      const f = canvasOf(cw, ch), fg = f.getContext('2d');
      fg.setTransform(x.fh ? -1 : 1, 0, 0, x.fv ? -1 : 1, x.fh ? cw : 0, x.fv ? ch : 0);
      fg.drawImage(cv, 0, 0);
      cv = f;
    }
    const q = this.quarter(x.r);
    if (q !== 0) {
      let ow = cw, oh = ch;
      if (q === 1 || q === 3) { ow = ch; oh = cw; }
      else if (q < 0) { const a = x.r * Math.PI / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a)); ow = Math.ceil(cw * c + ch * s); oh = Math.ceil(cw * s + ch * c); alpha = true; }
      const out = canvasOf(ow, oh), og = out.getContext('2d');
      og.imageSmoothingQuality = 'high';
      // whole quarter turns move pixels exactly; other angles turn about the centre
      if (q === 1) og.setTransform(0, 1, -1, 0, ch, 0);
      else if (q === 2) og.setTransform(-1, 0, 0, -1, cw, ch);
      else if (q === 3) og.setTransform(0, -1, 1, 0, 0, cw);
      else { og.translate(ow / 2, oh / 2); og.rotate(x.r * Math.PI / 180); og.translate(-cw / 2, -ch / 2); }
      og.drawImage(cv, 0, 0);
      cv = out;
    }
    if (opts.trim) cv = this.trim(cv);
    const jpeg = !alpha && /^data:image\/jpe?g/i.test(o.src || '');
    return { url: jpeg ? cv.toDataURL('image/jpeg', 0.92) : cv.toDataURL('image/png'), w: cv.width, h: cv.height, canvas: cv };
  },
  /* the paper → transparent. Each pixel's opacity comes from how far its colour is from the
     paper around it (estimated per block from its lightest pixels, so shadows and uneven light
     in a phone photo go too); the ink keeps its colour, unmixed from the paper, or takes `ink`. */
  clearBg(cv, strength, ink) {
    const w = cv.width, h = cv.height, g = cv.getContext('2d', { willReadFrequently: true });
    const im = g.getImageData(0, 0, w, h), d = im.data;
    const B = Math.max(6, Math.round(Math.max(w, h) / 24));
    const nx = Math.ceil(w / B), ny = Math.ceil(h / B), n = nx * ny;
    const pr = new Float32Array(n), pg = new Float32Array(n), pb = new Float32Array(n), pl = new Float32Array(n).fill(-1);
    const hist = new Uint32Array(256);
    const lum = i => (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
    for (let by = 0; by < ny; by++) for (let bx = 0; bx < nx; bx++) {
      hist.fill(0);
      const x0 = bx * B, y0 = by * B, x1 = Math.min(w, x0 + B), y1 = Math.min(h, y0 + B);
      let cnt = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * w + x) * 4; if (d[i + 3] < 128) continue; hist[lum(i)]++; cnt++; }
      if (!cnt) continue;
      let need = Math.max(1, Math.round(cnt * 0.2)), t = 255;
      for (; t > 0; t--) { need -= hist[t]; if (need <= 0) break; }
      let r = 0, gg = 0, b = 0, m = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * w + x) * 4; if (d[i + 3] < 128 || lum(i) < t) continue; r += d[i]; gg += d[i + 1]; b += d[i + 2]; m++; }
      const k = by * nx + bx;
      pr[k] = r / m; pg[k] = gg / m; pb[k] = b / m; pl[k] = (pr[k] * 77 + pg[k] * 150 + pb[k] * 29) / 256;
    }
    // a block that is mostly ink (or empty) takes the paper of its lightest neighbour
    for (let pass = 0; pass < 3; pass++) {
      const qr = pr.slice(), qg = pg.slice(), qb = pb.slice(), ql = pl.slice();
      let changed = false;
      for (let by = 0; by < ny; by++) for (let bx = 0; bx < nx; bx++) {
        const k = by * nx + bx;
        let best = -1, bl = ql[k] + 24;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const X = bx + dx, Y = by + dy;
          if ((!dx && !dy) || X < 0 || Y < 0 || X >= nx || Y >= ny) continue;
          const j = Y * nx + X;
          if (ql[j] > bl) { bl = ql[j]; best = j; }
        }
        if (best >= 0) { pr[k] = qr[best]; pg[k] = qg[best]; pb[k] = qb[best]; pl[k] = ql[best]; changed = true; }
      }
      if (!changed) break;
    }
    if (!pl.some(v => v >= 0)) return;
    for (let k = 0; k < n; k++) if (pl[k] < 0) { pr[k] = pg[k] = pb[k] = 255; pl[k] = 255; }
    const s = clamp(strength || 0.5, 0.01, 1);
    const lo = 0.04 + 0.22 * s, hi = lo + 0.1 + 0.08 * (1 - s);
    const inkC = ink ? [parseInt(ink.slice(1, 3), 16), parseInt(ink.slice(3, 5), 16), parseInt(ink.slice(5, 7), 16)] : null;
    for (let y = 0; y < h; y++) {
      const fy = clamp((y + 0.5) / B - 0.5, 0, ny - 1), y0 = Math.floor(fy), y1 = Math.min(ny - 1, y0 + 1), ty = fy - y0;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (!d[i + 3]) continue;
        const fx = clamp((x + 0.5) / B - 0.5, 0, nx - 1), x0 = Math.floor(fx), x1 = Math.min(nx - 1, x0 + 1), tx = fx - x0;
        const k00 = y0 * nx + x0, k01 = y0 * nx + x1, k10 = y1 * nx + x0, k11 = y1 * nx + x1;
        const mixv = a => (a[k00] * (1 - tx) + a[k01] * tx) * (1 - ty) + (a[k10] * (1 - tx) + a[k11] * tx) * ty;
        const R = mixv(pr), G = mixv(pg), Bc = mixv(pb), Lb = mixv(pl);
        const dr = d[i] - R, dg = d[i + 1] - G, db = d[i + 2] - Bc;
        let t = Math.sqrt(dr * dr + dg * dg + db * db) / 441.7;
        if ((d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) / 256 > Lb + 4) t *= 0.25;   // lighter than the paper: glare, not ink
        const a = t <= lo ? 0 : t >= hi ? 1 : (u => u * u * (3 - 2 * u))((t - lo) / (hi - lo));
        if (a > 0) {
          if (inkC) { d[i] = inkC[0]; d[i + 1] = inkC[1]; d[i + 2] = inkC[2]; }
          else {
            const ia = Math.max(a, 0.25);
            d[i] = clamp((d[i] - (1 - ia) * R) / ia, 0, 255);
            d[i + 1] = clamp((d[i + 1] - (1 - ia) * G) / ia, 0, 255);
            d[i + 2] = clamp((d[i + 2] - (1 - ia) * Bc) / ia, 0, 255);
          }
        }
        d[i + 3] = Math.round(a * d[i + 3]);
      }
    }
    g.putImageData(im, 0, 0);
  },
  /* the canvas cut to what isn't transparent, with a little room */
  trim(cv) {
    const w = cv.width, h = cv.height, d = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return cv;
    const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.04) + 2;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
    const out = canvasOf(x1 - x0 + 1, y1 - y0 + 1);
    out.getContext('2d').drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return out;
  },
  /* ---------- applying ---------- */
  /* the picture made again from its original with a new transform, at the same scale; a
     floating picture keeps its centre (or moves it to opts.center, in screen pixels) */
  async apply(img, x, opts = {}) {
    if (!img || !img.isConnected) return false;
    if (S.readOnly) { toast('This document is read-only. Turn off Restrict Editing to change it.'); return false; }
    x = this.clean(x);
    const old = this.xf(img), origUrl = this.orig(img);
    let o;
    try { o = await loadImg(origUrl); } catch { toast('This picture can’t be edited.', { error: true }); return false; }
    const sc = opts.scales || this.scales(img, o, old);
    const res = this.isBlank(x) ? null : await this.bake(o, x);
    if (!img.isConnected) return false;
    const size = this.sizeFor(o, x, sc);
    const r0 = img.getBoundingClientRect(), z = S.zoom;
    const nat = res ? res.w / res.h : (o.naturalWidth || 1) / (o.naturalHeight || 1);
    change(() => {
      if (res) { if (!img.hasAttribute('data-orig')) img.setAttribute('data-orig', origUrl); img.setAttribute('data-xf', JSON.stringify(x)); img.src = res.url; }
      else { img.src = origUrl; img.removeAttribute('data-orig'); img.removeAttribute('data-xf'); }
      img.style.width = Math.max(4, round1(size.w)) + 'px';
      if (Math.abs(size.w / Math.max(1e-6, size.h) - nat) < 0.01 * nat) img.style.removeProperty('height');
      else img.style.height = Math.max(4, round1(size.h)) + 'px';
      if (this.floating(img)) {
        const c = opts.center || { x: (r0.left + r0.right) / 2, y: (r0.top + r0.bottom) / 2 };
        const bl = parseFloat(getComputedStyle(img).borderLeftWidth) || 0;
        img.style.left = round1((parseFloat(img.style.left) || 0) + (c.x - (r0.left + r0.right) / 2) / z + (r0.width / z - size.w - 2 * bl) / 2) + 'px';
        img.style.top = round1((parseFloat(img.style.top) || 0) + (c.y - (r0.top + r0.bottom) / 2) / z + (r0.height / z - size.h - 2 * bl) / 2) + 'px';
      }
    }, { node: img });
    if (img.decode) await img.decode().catch(() => { });
    Images.refreshFrame();
    UI.refresh();
    return true;
  },
  sel() { const img = S.selImg; if (!img) toast('Select a picture first.'); return img; },
  rotate(deg) { const img = this.sel(); if (!img) return; const x = this.xf(img); x.r = this.angle(x.r + deg); return this.apply(img, x); },
  /* a flip of the picture as shown: the turn reverses */
  flip(dir) {
    const img = this.sel(); if (!img) return;
    const x = this.xf(img);
    x.r = this.angle(-x.r);
    if (dir === 'h') x.fh ^= 1; else x.fv ^= 1;
    if (x.fh && x.fv) { x.fh = 0; x.fv = 0; x.r = this.angle(x.r + 180); }
    return this.apply(img, x);
  },
  setAngle(deg) { const img = this.sel(); if (!img) return; const x = this.xf(img); x.r = this.angle(deg); return this.apply(img, x); },
  reset() {
    const img = this.sel(); if (!img) return;
    if (!this.edited(img)) { toast('This picture hasn’t been cropped, turned or cleaned up.'); return; }
    return this.apply(img, this.blank());
  },
  rotateDialog() {
    const img = this.sel(); if (!img) return;
    const x = this.xf(img);
    const a = input(String(Math.round(x.r * 10) / 10), { type: 'number', min: '-360', max: '360', step: '1', inputmode: 'decimal' });
    openDialog({ title: 'Rotation', width: 360, body: h('div', null, field('Rotation (degrees, clockwise)', a, 'rotDeg'), h('p', { class: 'note' }, 'Use a small angle, such as 2 or −3, to straighten a photographed signature or stamp.')), buttons: [{ label: 'Cancel' }, { label: 'OK', primary: true, onClick: () => { const v = parseFloat(String(a.value).replace('−', '-')); if (isFinite(v)) this.setAngle(v); } }] });
  },
  /* ---------- in front of / behind the text ---------- */
  /* a floating picture sits at the start of its paragraph, placed relative to it at `rect`
     (screen pixels), so it stays where it was */
  anchor(img, rect, block) {
    const b = block || blockOf(img);
    if (!b) return;
    if (b.firstChild !== img) b.insertBefore(img, b.firstChild);
    this.keepLine(b);
    this.place(img, b, rect);
  },
  /* a paragraph keeps its line when only floating pictures are left in it */
  keepLine(b) {
    const has = Array.from(b.childNodes).some(n => (n.nodeType === 3 ? n.data.replace(/\u200B/g, '') !== '' : n.nodeType === 1 && !this.floating(n)));
    if (!has) b.appendChild(document.createElement('br'));
  },
  place(img, b, rect) {
    const br = b.getBoundingClientRect(), z = S.zoom;
    img.style.left = round1((rect.left - br.left) / z - b.clientLeft) + 'px';
    img.style.top = round1((rect.top - br.top) / z - b.clientTop) + 'px';
  },
  /* the innermost paragraph nearest a picture's top edge */
  blockFor(r) {
    const mid = (r.left + r.right) / 2;
    let best = null, bd = Infinity;
    for (const el of S.editor.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, td, th, dd, dt, blockquote, div, pre')) {
      if (!LEAF_BLOCKS.has(el.tagName) || el.closest('.toc, [contenteditable="false"]')) continue;
      if (Array.from(el.children).some(k => BLOCK_TAGS.has(k.tagName))) continue;
      const b = el.getBoundingClientRect();
      if (!b.height) continue;
      const dy = r.top < b.top ? b.top - r.top : r.top > b.bottom ? r.top - b.bottom : 0;
      const dx = mid < b.left ? b.left - mid : mid > b.right ? mid - b.right : 0;
      const dd = dy * 4 + dx;
      if (dd < bd) { bd = dd; best = el; }
    }
    return best;
  },
  /* after a move: the paragraph at the picture's top becomes its anchor */
  reanchor(img) {
    const r = img.getBoundingClientRect(), cur = img.parentElement;
    const b = this.blockFor(r);
    if (!b || b === cur) return;
    b.insertBefore(img, b.firstChild);
    this.keepLine(b);
    if (cur && S.editor.contains(cur) && cur !== S.editor) this.keepLine(cur);
    this.place(img, b, r);
  },
  startMove(e, img) {
    if (S.readOnly || e.button !== 0) return;
    e.preventDefault();
    const x0 = e.clientX, y0 = e.clientY, l0 = parseFloat(img.style.left) || 0, t0 = parseFloat(img.style.top) || 0, z = S.zoom;
    let moved = false;
    const move = ev => {
      const dx = (ev.clientX - x0) / z, dy = (ev.clientY - y0) / z;
      if (!moved) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 3) return;
        moved = true;
        beginChange();
        if (Hist.timer) histRecord();
        Images.frame && Images.frame.classList.add('moving');
      }
      img.style.left = round1(l0 + dx) + 'px';
      img.style.top = round1(t0 + dy) + 'px';
      Images.refreshFrame();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!moved) return;
      Images.frame && Images.frame.classList.remove('moving');
      this.reanchor(img);
      histRecord();
      afterChange(img, { full: true });
      // moved to another paragraph: selected again where it now is
      if (S.selImg === img) { Images.deselect(true); Images.select(img); }
      Images.refreshFrame();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  },
  /* arrow keys move a floating picture */
  nudge(img, key, big) {
    const st = big ? 10 : 2;
    const dx = key === 'ArrowLeft' ? -st : key === 'ArrowRight' ? st : 0, dy = key === 'ArrowUp' ? -st : key === 'ArrowDown' ? st : 0;
    beginChange();
    img.style.left = round1((parseFloat(img.style.left) || 0) + dx) + 'px';
    img.style.top = round1((parseFloat(img.style.top) || 0) + dy) + 'px';
    histSoon();
    Saver.mark();
    Images.refreshFrame();
  },
  /* Align Left / Center / Right for a floating picture: within the column */
  align(img, how) {
    const b = img.parentElement;
    if (!b) return;
    let bx = b.clientLeft, el = b;
    while (el && el !== S.editor) { bx += el.offsetLeft; el = el.offsetParent; }
    // the column: a header's box, or the section's text column
    const hf = S.editor && S.editor.classList.contains('hfx');
    const si = hf ? 0 : Sections.indexOf(b), cw = hf ? S.editor.clientWidth : Pages.ready().secs[Math.min(si, Pages.secs.length - 1)].g.cw;
    const x0 = hf ? 0 : Pages.colX(Math.min(si, Pages.secs.length - 1)), w = img.offsetWidth;
    const X = how === 'center' ? x0 + (cw - w) / 2 : how === 'right' ? x0 + cw - w : x0;
    change(() => { img.style.left = round1(X - bx) + 'px'; }, { node: img });
    Images.refreshFrame();
  },
  /* where a floating picture is from the column's left and its paragraph's top (for .docx) */
  floatPos(img) {
    const b = img.parentElement;
    let x = (parseFloat(img.style.left) || 0) + (b ? b.clientLeft : 0), el = b;
    while (el && el !== S.editor) { x += el.offsetLeft; el = el.offsetParent; }
    // the text's column starts at the section's left margin; a header's or footer's box is its column
    const hf = S.editor && S.editor.classList.contains('hfx');
    const si = hf || !b ? 0 : Math.min(Sections.indexOf(b), Pages.ready().secs.length - 1);
    return { x: x - (hf ? 0 : Pages.colX(si)), y: (parseFloat(img.style.top) || 0) + (b ? b.clientTop : 0) };
  },
  /* pictures from Word in front of / behind the text: their place from Word's reference
     (page, margin, column, paragraph) once the pages are laid out */
  async settle() {
    const list = Array.from(S.editor.querySelectorAll('img[data-fx], img[data-fy], span.shp[data-fx], span.shp[data-fy]'));
    if (!list.length) return false;
    await Promise.all(Array.from(S.editor.querySelectorAll('img')).map(im => (im.decode ? im.decode().catch(() => { }) : null)));
    for (const img of list) { const b = blockOf(img); if (b && b.firstChild !== img) b.insertBefore(img, b.firstChild); if (b) this.keepLine(b); }
    Layout.full();
    for (const img of list) {
      const b = img.parentElement;
      const [hr, ho, ha] = (img.getAttribute('data-fx') || 'column||').split('|');
      const [vr, vo, va] = (img.getAttribute('data-fy') || 'paragraph||').split('|');
      img.removeAttribute('data-fx'); img.removeAttribute('data-fy');
      if (!b || b === S.editor) continue;
      let bx = b.clientLeft, el = b;
      while (el && el !== S.editor) { bx += el.offsetLeft; el = el.offsetParent; }
      const by = topOf(b) + b.clientTop;
      // the page it is on: its size, and where its sheet is
      const pg = Pages.at(by), g = Pages.g(pg), pageTop = Pages.top(pg), px = Pages.x(pg);
      const w = img.offsetWidth, hh = img.offsetHeight;
      const areaH = { page: [0, g.w], leftMargin: [0, g.ml], rightMargin: [g.w - g.mr, g.w], insideMargin: [0, g.ml], outsideMargin: [g.w - g.mr, g.w] }[hr] || [g.ml, g.w - g.mr];
      const X = ho !== '' ? areaH[0] + +ho : ha === 'center' ? (areaH[0] + areaH[1] - w) / 2 : (ha === 'right' || ha === 'outside') ? areaH[1] - w : areaH[0];
      img.style.left = round1(px + X - bx) + 'px';
      if (vr === 'paragraph' || vr === 'line' || !vr) img.style.top = round1(vo !== '' ? +vo : 0) + 'px';
      else {
        const areaV = { page: [0, g.h], topMargin: [0, g.mt], bottomMargin: [g.h - g.mb, g.h], insideMargin: [0, g.mt], outsideMargin: [g.h - g.mb, g.h] }[vr] || [g.mt, g.h - g.mb];
        const Y = vo !== '' ? areaV[0] + +vo : va === 'center' ? (areaV[0] + areaV[1] - hh) / 2 : (va === 'bottom' || va === 'outside') ? areaV[1] - hh : areaV[0];
        img.style.top = round1(pageTop + Y - by) + 'px';
      }
    }
    Layout.full();
    return true;
  },
  /* pictures from Word that were cropped, turned or flipped there: made the same way here */
  async importBake(img) {
    const x = this.xf(img);
    const ext = (img.getAttribute('data-ext') || '').split(',').map(Number);
    img.removeAttribute('data-ext');
    if (this.isBlank(x)) { img.removeAttribute('data-xf'); return; }
    try {
      const o = await loadImg(img.src);
      const b = this.box(o, x);
      const sc = { sx: ext[0] ? ext[0] / Math.max(1, b.wc) : 1, sy: ext[1] ? ext[1] / Math.max(1, b.hc) : 1 };
      const res = await this.bake(o, x);
      const size = this.sizeFor(o, x, sc);
      img.setAttribute('data-orig', img.src);
      img.setAttribute('data-xf', JSON.stringify(x));
      img.src = res.url;
      img.style.width = round1(size.w) + 'px';
      if (Math.abs(size.w / size.h - res.w / res.h) > 0.01 * (res.w / res.h)) img.style.height = round1(size.h) + 'px';
    } catch (e) { console.warn('picture not re-made', e); img.removeAttribute('data-xf'); }
  },
  /* ---------- turning with the handle ---------- */
  startRotate(e) {
    const img = S.selImg;
    if (!img || S.readOnly || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const r = img.getBoundingClientRect(), cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
    const a0 = Math.atan2(e.clientY - cy, e.clientX - cx), x = this.xf(img);
    const fr = Images.frame, lab = fr && fr.querySelector('.sz');
    let deg = 0;
    if (fr) fr.classList.add('turning');
    const move = ev => {
      let d = (Math.atan2(ev.clientY - cy, ev.clientX - cx) - a0) * 180 / Math.PI;
      d = ((d + 540) % 360) - 180;
      if (ev.shiftKey) d = Math.round(d / 15) * 15;
      deg = Math.round(d * 10) / 10;
      img.style.transform = `rotate(${deg}deg)`;
      if (lab) lab.textContent = `${fmtNum(this.angle(x.r + deg), 1)}°`;
    };
    const up = async () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      img.style.removeProperty('transform');
      if (!img.getAttribute('style')) img.removeAttribute('style');
      if (fr) fr.classList.remove('turning');
      if (Math.abs(deg) < 0.5) { Images.refreshFrame(); return; }
      x.r = this.angle(x.r + deg);
      await this.apply(img, x);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  },
  /* ---------- Remove Background ---------- */
  /* a preview of the picture with its paper made transparent: strength and ink colour */
  bgControls(o, x0, onChange, opts = {}) {
    const alpha = hasAlpha(o);
    const st = { on: true, s: x0.bg || 0.5, ink: x0.ink || '' };
    const cv = h('canvas', { class: 'bg-prev', 'aria-label': 'Preview' });
    const stage = h('div', { class: 'bg-stage' }, cv);
    const on = checkbox('Make the paper transparent', st.on, 'bgOn');
    const rng = h('input', { type: 'range', min: '1', max: '100', value: String(Math.round(st.s * 100)), id: 'bgStr', 'aria-label': 'How much to remove' });
    const inks = [['', 'Keep its colours'], ['#111111', 'Black ink'], ['#1b3a8c', 'Blue ink']];
    const chips = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Ink' }, inks.map(([v, l]) => h('button', { class: 'chip', type: 'button', role: 'radio', 'data-ink': v, 'aria-checked': st.ink === v ? 'true' : 'false' }, v ? h('i', { class: 'ink-dot', style: { background: v } }) : null, l)));
    let seq = 0;
    const cur = () => Object.assign({}, x0, { bg: on.input.checked ? +rng.value / 100 : 0, ink: on.input.checked ? st.ink : '' });
    const redraw = debounce(async () => {
      const my = ++seq;
      const res = await this.bake(o, cur(), { max: 720, alpha, trim: !!opts.trim });
      if (my !== seq) return;
      const W = stage.clientWidth - 24 || 480, H = 260;
      const k = Math.min(1, W / res.w, H / res.h);
      cv.width = Math.max(1, Math.round(res.w * k * (window.devicePixelRatio || 1)));
      cv.height = Math.max(1, Math.round(res.h * k * (window.devicePixelRatio || 1)));
      cv.style.width = Math.round(res.w * k) + 'px'; cv.style.height = Math.round(res.h * k) + 'px';
      const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high';
      g.drawImage(res.canvas, 0, 0, cv.width, cv.height);
      if (onChange) onChange(cur(), res);
    }, 50);
    const sync = () => { rng.disabled = !on.input.checked; chips.querySelectorAll('button').forEach(b => { b.disabled = !on.input.checked; }); redraw(); };
    on.input.addEventListener('change', sync);
    rng.addEventListener('input', redraw);
    chips.addEventListener('click', e => { const b = e.target.closest('button[data-ink]'); if (!b) return; st.ink = b.dataset.ink; chips.querySelectorAll('button').forEach(c => c.setAttribute('aria-checked', c === b ? 'true' : 'false')); redraw(); });
    const el = h('div', { class: 'bg-ctl' }, stage, on.el,
      h('div', { class: 'field' }, h('label', { for: 'bgStr' }, 'How much to remove'), h('div', { class: 'bg-range' }, h('span', { class: 'note' }, 'Less'), rng, h('span', { class: 'note' }, 'More'))),
      h('div', { class: 'field' }, h('label', null, 'Ink'), chips));
    setTimeout(sync, 0);
    return { el, cur };
  },
  async background() {
    const img = this.sel();
    if (!img) return;
    if (S.readOnly) { toast('This document is read-only. Turn off Restrict Editing to change it.'); return; }
    let o;
    try { o = await loadImg(this.orig(img)); } catch { return; }
    const x0 = this.xf(img);
    const c = this.bgControls(o, x0);
    openDialog({ title: 'Remove Background', width: 560,
      body: h('div', null, c.el, h('p', { class: 'note', style: { marginTop: '10px' } }, 'For a signed or stamped sheet of paper: the paper goes, the ink stays. Put the picture In Front of Text (Wrap Text) to place it over a line or a name. Reset Picture brings the original back.')),
      buttons: [{ label: 'Cancel' }, { label: 'Apply', primary: true, onClick: () => { this.apply(img, c.cur()); } }] });
  },
};

/* ===================== Crop =====================
   Word's crop: the whole picture is shown dimmed around the part that is kept, with black
   handles on the kept part's edges. Drag a handle to cut in or out, drag inside to choose
   another part; Enter, Esc, a click elsewhere or Crop again finishes. Works on turned and
   flipped pictures (the frame turns with the picture). */
const Crop = {
  img: null, el: null, st: null,
  active() { return !!this.img; },
  async toggle() { if (this.img) await this.finish(); else await this.start(S.selImg); },
  async start(img) {
    if (!img) { toast('Select a picture first.'); return; }
    if (S.readOnly) { toast('This document is read-only. Turn off Restrict Editing to change it.'); return; }
    if (this.img) await this.finish();
    const x = PicEdit.xf(img);
    let o;
    try { o = await loadImg(PicEdit.orig(img)); } catch { toast('This picture can’t be cropped.', { error: true }); return; }
    const full = await PicEdit.bake(o, Object.assign({}, x, { c: [0, 0, 0, 0], r: 0 }), { max: 1600 });
    if (!img.isConnected || S.selImg !== img) return;
    const sc = PicEdit.scales(img, o, x);
    const W = o.naturalWidth, H = o.naturalHeight, fw = W * sc.sx, fh = H * sc.sy;
    // the part kept, as shown (flips applied): fractions of the whole picture
    let [L, T, R, B] = x.c;
    if (x.fh) [L, R] = [R, L];
    if (x.fv) [T, B] = [B, T];
    const pr = $('#paper').getBoundingClientRect(), z = S.zoom;
    const ir = Grid.place(img, img.getBoundingClientRect());
    const bl = parseFloat(getComputedStyle(img).borderLeftWidth) || 0;
    const cx = ((ir.left + ir.right) / 2 - pr.left) / z, cy = ((ir.top + ir.bottom) / 2 - pr.top) / z;
    const ox = (L + (1 - L - R) / 2) * fw, oy = (T + (1 - T - B) / 2) * fh;
    const root = h('div', { class: 'crop-ui', role: 'group', 'aria-label': 'Crop: drag the black handles; Enter to finish', style: { left: round1(cx - ox) + 'px', top: round1(cy - oy) + 'px', width: round1(fw) + 'px', height: round1(fh) + 'px', transformOrigin: `${round1(ox)}px ${round1(oy)}px`, transform: x.r ? `rotate(${x.r}deg)` : '' } });
    const box = h('div', { class: 'crop-box' });
    for (const k of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) box.appendChild(h('div', { class: 'ch ' + k, 'data-k': k }));
    root.append(h('img', { class: 'crop-pic', src: full.url, alt: '', draggable: 'false' }), box);
    $('#overlay').appendChild(root);
    this.img = img; this.el = root;
    this.st = { x, sc, fw, fh, L, T, R, B, box, ox, oy, bl };
    this.draw();
    root.addEventListener('pointerdown', e => this.down(e));
    document.addEventListener('keydown', this._key = e => {
      if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.finish(); }
      else if (!/^(Shift|Control|Alt|Meta)$/.test(e.key)) { e.preventDefault(); e.stopPropagation(); }
    }, true);
    document.addEventListener('pointerdown', this._out = e => { if (this.el && !this.el.contains(e.target) && !e.target.closest('[data-crop]')) this.finish(); }, true);
    if (Images.frame) Images.frame.classList.add('cropping');
    UI.refresh();
  },
  draw() {
    const s = this.st;
    Object.assign(s.box.style, { left: round1(s.L * s.fw) + 'px', top: round1(s.T * s.fh) + 'px', width: round1((1 - s.L - s.R) * s.fw) + 'px', height: round1((1 - s.T - s.B) * s.fh) + 'px' });
  },
  down(e) {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const s = this.st;
    const k = e.target.dataset.k || (s.box.contains(e.target) ? 'move' : null);
    if (!k) return;
    const x0 = e.clientX, y0 = e.clientY, b0 = { L: s.L, T: s.T, R: s.R, B: s.B };
    const a = -s.x.r * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a), z = S.zoom;
    const minW = 8 / s.fw, minH = 8 / s.fh;
    const move = ev => {
      const dx = (ev.clientX - x0) / z, dy = (ev.clientY - y0) / z;
      const u = (dx * cs - dy * sn) / s.fw, v = (dx * sn + dy * cs) / s.fh;   // in the picture's own frame
      let { L, T, R, B } = b0;
      if (k === 'move') { const du = clamp(u, -L, R), dv = clamp(v, -T, B); L += du; R -= du; T += dv; B -= dv; }
      else {
        if (k.includes('w')) L = clamp(L + u, 0, 1 - R - minW);
        if (k.includes('e')) R = clamp(R - u, 0, 1 - L - minW);
        if (k.includes('n')) T = clamp(T + v, 0, 1 - B - minH);
        if (k.includes('s')) B = clamp(B - v, 0, 1 - T - minH);
      }
      Object.assign(s, { L, T, R, B });
      this.draw();
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  },
  /* set the kept part directly (fractions of the picture as shown): for tests and the keyboard */
  set(L, T, R, B) { if (!this.st) return; Object.assign(this.st, { L, T, R, B }); this.draw(); },
  cancel() { this.close(); if (S.selImg) Images.refreshFrame(); UI.refresh(); },
  close() {
    document.removeEventListener('keydown', this._key, true);
    document.removeEventListener('pointerdown', this._out, true);
    if (this.el) this.el.remove();
    this.el = null; this.img = null;
    if (Images.frame) Images.frame.classList.remove('cropping');
  },
  async finish() {
    if (!this.img) return;
    const img = this.img, s = this.st;
    this.close();
    let [l, t, r, b] = [s.L, s.T, s.R, s.B];
    if (s.x.fh) [l, r] = [r, l];
    if (s.x.fv) [t, b] = [b, t];
    const x = Object.assign({}, s.x, { c: [l, t, r, b] });
    if (!img.isConnected || x.c.every((v, i) => Math.abs(v - s.x.c[i]) < 1e-4)) { Images.refreshFrame(); UI.refresh(); return; }
    // the kept part's centre, moved from the old one, on the page
    const ncx = (s.L + (1 - s.L - s.R) / 2) * s.fw - s.ox, ncy = (s.T + (1 - s.T - s.B) / 2) * s.fh - s.oy;
    const a = s.x.r * Math.PI / 180, z = S.zoom;
    const dx = ncx * Math.cos(a) - ncy * Math.sin(a), dy = ncx * Math.sin(a) + ncy * Math.cos(a);
    const ir = img.getBoundingClientRect();
    await PicEdit.apply(img, x, { scales: s.sc, center: { x: (ir.left + ir.right) / 2 + dx * z, y: (ir.top + ir.bottom) / 2 + dy * z } });
    UI.refresh();
  },
};
