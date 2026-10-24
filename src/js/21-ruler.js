/* ===================== Horizontal ruler ===================== */
const Ruler = {
  raf: 0,
  drag: null,
  init() {
    const wrap = $('#rulerWrap');
    const marks = $('#rulerMarks');
    const tri = (down) => `<svg viewBox="0 0 11 9"><path d="${down ? 'M0.6 0.6h9.8L5.5 8.4z' : 'M5.5 0.6l4.9 7.8H0.6z'}"/></svg>`;
    marks.append(
      h('div', { class: 'rmark first', title: 'First Line Indent', 'data-k': 'first', html: tri(true) }),
      h('div', { class: 'rmark hang', title: 'Hanging Indent', 'data-k': 'hang', html: tri(false) }),
      h('div', { class: 'rmark left', title: 'Left Indent', 'data-k': 'left', html: '<svg viewBox="0 0 11 5"><rect x="0.6" y="0.6" width="9.8" height="3.8"/></svg>' }),
      h('div', { class: 'rmark right', title: 'Right Indent', 'data-k': 'right', html: tri(false) }),
      h('div', { class: 'rmargin', title: 'Left Margin', 'data-k': 'ml' }),
      h('div', { class: 'rmargin', title: 'Right Margin', 'data-k': 'mr' }),
    );
    marks.addEventListener('pointerdown', e => this.down(e));
    wrap.addEventListener('dblclick', () => Dialogs.pageSetup());
    $('#canvas').addEventListener('scroll', () => this.drawSoon(), { passive: true });
    window.addEventListener('resize', () => this.drawSoon());
  },
  drawSoon() { if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw(); }); },
  geomPx() {
    const wrap = $('#rulerWrap');
    const box = $('#zoomBox');
    const wr = wrap.getBoundingClientRect();
    const br = box.getBoundingClientRect();
    // the page with the caret (pages side by side, or a wider page of another section) and the
    // margins of the caret's section
    const px = Grid.pos(Math.max(0, (S.curPage || 1) - 1)).x;
    const sec = S.doc && Sections.selected()[0];
    return { left: br.left - wr.left + px * S.zoom, width: wr.width, z: S.zoom, g: sec ? sec.g : geom(), px };
  },
  draw() {
    const wrap = $('#rulerWrap');
    if (!S.doc || !wrap || wrap.classList.contains('off') || S.view !== 'print' || !wrap.offsetWidth) return;
    const cv = $('#ruler');
    const dpr = window.devicePixelRatio || 1;
    const W = wrap.clientWidth, H = 24;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(document.documentElement);
    const col = n => css.getPropertyValue(n).trim();
    ctx.clearRect(0, 0, W, H);
    const { left, z, g } = this.geomPx();
    const x0 = left, pw = g.w * z;
    ctx.fillStyle = col('--line-2') || '#ddd';
    ctx.fillRect(x0, 4, pw, 16);
    ctx.fillStyle = col('--surface') || '#fff';
    ctx.fillRect(x0 + g.ml * z, 4, (g.w - g.ml - g.mr) * z, 16);
    ctx.strokeStyle = col('--line') || '#ccc';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(x0) + 0.5, 4.5, Math.round(pw) - 1, 15);
    const unit = Prefs.units === 'in' ? 'in' : 'cm';
    const step = unit === 'in' ? PX.in / 8 : PX.cm / 4;
    const per = unit === 'in' ? 8 : 4;
    const origin = x0 + g.ml * z;
    ctx.fillStyle = col('--ink-3') || '#777';
    ctx.strokeStyle = col('--ink-3') || '#777';
    ctx.font = '10px ' + (getComputedStyle(document.body).fontFamily || 'sans-serif');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const from = -Math.floor(g.ml / step), to = Math.floor((g.w - g.ml) / step);
    ctx.beginPath();
    for (let i = from; i <= to; i++) {
      const x = Math.round(origin + i * step * z) + 0.5;
      if (i === 0) continue;
      if (i % per === 0) { ctx.fillText(String(Math.abs(i / per)), x, 12); continue; }
      const len = (i % (per / 2) === 0) ? 5 : 2.5;
      if (step * z < 4 && len < 5) continue;
      ctx.moveTo(x, 12 - len / 2); ctx.lineTo(x, 12 + len / 2);
    }
    ctx.stroke();
    // markers
    const info = paraInfo();
    const marks = $('#rulerMarks');
    const place = (k, x) => { const el = marks.querySelector(`[data-k="${k}"]`); if (el) el.style.left = x + 'px'; };
    const li = info ? info.left : 0, fi = info ? info.first : 0, ri = info ? info.right : 0;
    place('first', origin + (li + fi) * z);
    place('hang', origin + li * z);
    place('left', origin + li * z);
    place('right', x0 + (g.w - g.mr - ri) * z);
    place('ml', origin);
    place('mr', x0 + (g.w - g.mr) * z);
    marks.querySelectorAll('.rmark').forEach(m => m.style.display = info ? '' : 'none');
  },
  down(e) {
    const el = e.target.closest('[data-k]');
    if (!el || S.readOnly) return;
    e.preventDefault();
    const k = el.dataset.k;
    const info = paraInfo();
    if (!info && /first|hang|left|right/.test(k)) return;
    const gp = this.geomPx(), g = gp.g;
    const start = { x: e.clientX, info, g: { ...g }, px: gp.px };
    const guide = h('div', { class: 'col-guide', style: { top: '0', height: '100%' } });
    this._px = start.px;
    $('#canvas').appendChild(guide);
    const tip = h('div', { class: 'ruler-tip' });
    $('#rulerWrap').appendChild(tip);
    const snap = v => { if (e.altKey) return v; const s = Prefs.units === 'in' ? PX.in / 16 : PX.cm / 10; return Math.round(v / s) * s; };
    let val = null;
    const move = ev => {
      const dx = (ev.clientX - start.x) / S.zoom;
      let shown = '';
      const sg = start.g;
      if (k === 'ml') { val = clamp(snap(sg.ml + dx), 0, sg.w - sg.mr - 72); shown = 'Left margin ' + fmtLen(val); this.guideAt(guide, val); }
      else if (k === 'mr') { val = clamp(snap(sg.mr - dx), 0, sg.w - sg.ml - 72); shown = 'Right margin ' + fmtLen(val); this.guideAt(guide, sg.w - val); }
      else if (k === 'first') { val = snap(start.info.first + dx); shown = 'First line ' + fmtLen(val); this.guideAt(guide, sg.ml + start.info.left + val); }
      else if (k === 'hang') { val = snap(start.info.left + dx); shown = 'Hanging ' + fmtLen(Math.max(0, val - (start.info.left + start.info.first))); this.guideAt(guide, sg.ml + val); }
      else if (k === 'left') { val = snap(start.info.left + dx); shown = 'Left indent ' + fmtLen(val); this.guideAt(guide, sg.ml + val); }
      else if (k === 'right') { val = snap(start.info.right - dx); shown = 'Right indent ' + fmtLen(val); this.guideAt(guide, sg.w - sg.mr - val); }
      tip.textContent = shown;
      tip.style.left = (ev.clientX - $('#rulerWrap').getBoundingClientRect().left) + 'px';
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      guide.remove(); tip.remove();
      if (val == null) return;
      const inf = start.info;
      if (k === 'ml' || k === 'mr') { setPage({ [k]: val }); return; }
      if (inf) setRange(lastRange || getRange());
      if (k === 'first') applyParagraph({ first: val });
      else if (k === 'hang') { const firstAbs = inf.left + inf.first; applyParagraph({ left: Math.max(-start.g.ml, val), first: firstAbs - val }); }
      else if (k === 'left') applyParagraph({ left: val, first: inf.first });
      else if (k === 'right') applyParagraph({ right: val });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  },
  guideAt(guide, pagePx) {
    const box = $('#zoomBox');
    guide.style.left = (box.offsetLeft + (pagePx + (this._px || 0)) * S.zoom) + 'px';
    guide.style.top = $('#canvas').scrollTop + 'px';
    guide.style.height = $('#canvas').clientHeight + 'px';
  },
};
