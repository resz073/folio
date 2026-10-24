'use strict';
/* ===================== Utilities ===================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
function debounce(fn, ms) {
  let t = 0;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.cancel = () => clearTimeout(t);
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  return d;
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
function hash53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507); h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507); h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/* Units: everything is stored in CSS px at 96 dpi */
const PX = { in: 96, cm: 96 / 2.54, mm: 96 / 25.4, pt: 96 / 72 };
const UNIT_LABEL = { in: '"', cm: ' cm', mm: ' mm', pt: ' pt' };
function fmtNum(v, d = 2) { const f = 10 ** d; return String(Math.round(v * f) / f); }
function fmtLen(px, unit) { unit = unit || Prefs.units; return fmtNum(px / PX[unit], unit === 'in' ? 2 : 1) + UNIT_LABEL[unit]; }
function parseLen(str, unit) {
  unit = unit || Prefs.units;
  const m = String(str).trim().replace(',', '.').match(/^(-?\d*\.?\d+)\s*(in|"|cm|mm|pt|px)?$/i);
  if (!m) return NaN;
  const v = parseFloat(m[1]);
  let u = (m[2] || unit).toLowerCase();
  if (u === '"') u = 'in';
  return u === 'px' ? v : v * PX[u];
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const escXml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');

function cssColorToHex(c) {
  if (!c) return null;
  c = String(c).trim();
  if (!c || c === 'transparent' || c === 'inherit' || c === 'initial' || c === 'currentcolor') return null;
  let m = c.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i);
  if (m) {
    const a = m[4] == null ? 1 : (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
    if (a < 0.05) return null;
    return '#' + [m[1], m[2], m[3]].map(x => Math.round(+x).toString(16).padStart(2, '0')).join('');
  }
  m = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) { let x = m[1]; if (x.length === 3) x = x.split('').map(ch => ch + ch).join(''); return '#' + x.toLowerCase(); }
  const ctx = cssColorToHex.ctx || (cssColorToHex.ctx = document.createElement('canvas').getContext('2d'));
  ctx.fillStyle = '#010203';
  ctx.fillStyle = c;
  const v = ctx.fillStyle;
  if (v === '#010203' && !/^#?010203$/i.test(c)) return null;
  return v.startsWith('#') ? v.toLowerCase() : (/^rgba?\(/.test(v) ? cssColorToHex(v) : null);
}

function fmtWhen(ts) {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const y = new Date(now); y.setDate(now.getDate() - 1);
  const t = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return 'Today, ' + t;
  if (d.toDateString() === y.toDateString()) return 'Yesterday, ' + t;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}
const fmtInt = n => Number(n || 0).toLocaleString();

/* Toasts */
function toast(msg, opts = {}) {
  const root = $('#toastRoot');
  if (!root) return;
  const t = h('div', { class: 'toast' + (opts.error ? ' err' : ''), role: 'status' }, h('span', null, msg));
  if (opts.action) t.append(h('button', { type: 'button', onclick: () => { t.remove(); opts.action.fn(); } }, opts.action.label));
  root.append(t);
  while (root.children.length > 3) root.firstChild.remove();
  setTimeout(() => t.remove(), opts.ms || (opts.error ? 5200 : 3000));
}

/* Lazy script loading from the CDN allowlist */
const LIB = {
  jszip: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
};
const _scripts = {};
function loadScript(src) {
  if (_scripts[src]) return _scripts[src];
  return (_scripts[src] = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => res();
    s.onerror = () => { delete _scripts[src]; rej(new Error('Could not load ' + src)); };
    document.head.append(s);
  }));
}
async function needJSZip() { if (!window.JSZip) await loadScript(LIB.jszip); return window.JSZip; }

/* Busy overlay with progress */
function busy(label) {
  const lbl = h('div', { style: { fontWeight: 600 } }, label);
  const bar = h('i');
  const el = h('div', { class: 'busy', role: 'alertdialog', 'aria-label': label }, h('div', { class: 'busy-card' }, lbl, h('div', { class: 'bar' }, bar)));
  document.body.append(el);
  return {
    set(p, l) { bar.style.width = Math.round(clamp(p, 0, 1) * 100) + '%'; if (l) lbl.textContent = l; },
    close() { el.remove(); },
  };
}

function readFileAs(file, how) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(fr.error);
    if (how === 'text') fr.readAsText(file); else if (how === 'url') fr.readAsDataURL(file); else fr.readAsArrayBuffer(file);
  });
}
function b64ToBytes(b64) { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
function bytesToB64(bytes) { let s = ''; const CH = 0x8000; for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH)); return btoa(s); }
function dataUrlToBytes(url) { const i = url.indexOf(','); const meta = url.slice(5, i); const isB64 = /;base64/i.test(meta); const mime = meta.split(';')[0] || 'application/octet-stream'; const bytes = isB64 ? b64ToBytes(url.slice(i + 1)) : new TextEncoder().encode(decodeURIComponent(url.slice(i + 1))); return { mime, bytes }; }
function safeFileName(s) { return (String(s || 'Document').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Document').slice(0, 120); }
function isMac() { return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent); }
const MOD = isMac() ? '⌘' : 'Ctrl';
function lsGet(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } }
