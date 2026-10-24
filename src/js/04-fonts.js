/* ===================== Fonts ===================== */
// n: display name, alt: metric-compatible / fallback faces, g: Google Fonts css2 family spec, gen: generic family
const FONTS = [
  { n: 'Calibri', alt: ['Carlito'], g: 'Carlito:ital,wght@0,400;0,700;1,400;1,700', gen: 'sans-serif', cat: 'Office' },
  { n: 'Calibri Light', alt: ['Carlito'], g: null, gen: 'sans-serif', cat: 'Office' },
  { n: 'Cambria', alt: ['Caladea'], g: 'Caladea:ital,wght@0,400;0,700;1,400;1,700', gen: 'serif', cat: 'Office' },
  { n: 'Arial', alt: ['Arimo', 'Helvetica'], g: 'Arimo:ital,wght@0,400;0,700;1,400;1,700', gen: 'sans-serif', cat: 'Office' },
  { n: 'Times New Roman', alt: ['Tinos', 'Times'], g: 'Tinos:ital,wght@0,400;0,700;1,400;1,700', gen: 'serif', cat: 'Office' },
  { n: 'Courier New', alt: ['Cousine', 'Courier'], g: 'Cousine:ital,wght@0,400;0,700;1,400;1,700', gen: 'monospace', cat: 'Office' },
  { n: 'Georgia', alt: ['Gelasio'], g: 'Gelasio:ital,wght@0,400;0,700;1,400;1,700', gen: 'serif', cat: 'Office' },
  { n: 'Garamond', alt: ['EB Garamond'], g: 'EB Garamond:ital,wght@0,400;0,700;1,400;1,700', gen: 'serif', cat: 'Office' },
  { n: 'Book Antiqua', alt: ['Palatino Linotype', 'Palatino', 'Gelasio'], g: null, gen: 'serif', cat: 'Office' },
  { n: 'Verdana', alt: ['DejaVu Sans'], g: null, gen: 'sans-serif', cat: 'Office' },
  { n: 'Tahoma', alt: ['DejaVu Sans'], g: null, gen: 'sans-serif', cat: 'Office' },
  { n: 'Segoe UI', alt: ['Noto Sans'], g: 'Noto Sans:ital,wght@0,400;0,700;1,400;1,700', gen: 'sans-serif', cat: 'Office' },
  { n: 'Century Gothic', alt: ['Questrial'], g: 'Questrial', gen: 'sans-serif', cat: 'Office' },
  { n: 'Consolas', alt: ['Cousine', 'Courier New'], g: null, gen: 'monospace', cat: 'Office' },
  { n: 'Roboto', g: 'Roboto:ital,wght@0,400;0,700;1,400;1,700', gen: 'sans-serif', cat: 'Web' },
  { n: 'Open Sans', g: 'Open Sans:ital,wght@0,400;0,700;1,400;1,700', gen: 'sans-serif', cat: 'Web' },
  { n: 'Lato', g: 'Lato:ital,wght@0,400;0,700;1,400;1,700', gen: 'sans-serif', cat: 'Web' },
  { n: 'Montserrat', g: 'Montserrat:ital,wght@0,400;0,700;1,400;1,700', gen: 'sans-serif', cat: 'Web' },
  { n: 'Merriweather', g: 'Merriweather:ital,wght@0,400;0,700;1,400;1,700', gen: 'serif', cat: 'Web' },
  { n: 'Lora', g: 'Lora:ital,wght@0,400;0,700;1,400;1,700', gen: 'serif', cat: 'Web' },
  { n: 'PT Serif', g: 'PT Serif:ital,wght@0,400;0,700;1,400;1,700', gen: 'serif', cat: 'Web' },
  { n: 'Source Serif 4', g: 'Source Serif 4:ital,wght@0,400;0,700;1,400;1,700', gen: 'serif', cat: 'Web' },
  { n: 'Playfair Display', g: 'Playfair Display:ital,wght@0,400;0,700;1,400;1,700', gen: 'serif', cat: 'Web' },
  { n: 'Libre Baskerville', g: 'Libre Baskerville:ital,wght@0,400;0,700;1,400', gen: 'serif', cat: 'Web' },
  { n: 'Inconsolata', g: 'Inconsolata:wght@400;700', gen: 'monospace', cat: 'Web' },
  { n: 'Dancing Script', g: 'Dancing Script:wght@400;700', gen: 'cursive', cat: 'Web' },
  { n: 'Noto Sans Bengali', g: 'Noto Sans Bengali:wght@400;700', gen: 'sans-serif', cat: 'Bangla' },
  { n: 'Noto Serif Bengali', g: 'Noto Serif Bengali:wght@400;700', gen: 'serif', cat: 'Bangla' },
  { n: 'Hind Siliguri', g: 'Hind Siliguri:wght@400;700', gen: 'sans-serif', cat: 'Bangla' },
  { n: 'Tiro Bangla', g: 'Tiro Bangla:ital@0;1', gen: 'serif', cat: 'Bangla' },
  { n: 'Anek Bangla', g: 'Anek Bangla:wght@400;700', gen: 'sans-serif', cat: 'Bangla' },
  { n: 'Baloo Da 2', g: 'Baloo Da 2:wght@400;700', gen: 'sans-serif', cat: 'Bangla' },
  { n: 'Galada', g: 'Galada', gen: 'cursive', cat: 'Bangla' },
  // installed with Avro Keyboard or Windows, or added from a file (Font › Add a font from a file)
  { n: 'SutonnyOMJ', alt: ['Tiro Bangla'], g: null, gen: 'serif', cat: 'Bangla', local: true },
  { n: 'Nikosh', alt: ['Noto Sans Bengali'], g: null, gen: 'sans-serif', cat: 'Bangla', local: true },
  { n: 'SolaimanLipi', alt: ['Noto Sans Bengali'], g: null, gen: 'sans-serif', cat: 'Bangla', local: true },
  { n: 'Kalpurush', alt: ['Noto Sans Bengali'], g: null, gen: 'sans-serif', cat: 'Bangla', local: true },
  { n: 'Siyam Rupali', alt: ['Noto Sans Bengali'], g: null, gen: 'sans-serif', cat: 'Bangla', local: true },
  { n: 'AdorshoLipi', alt: ['Noto Sans Bengali'], g: null, gen: 'sans-serif', cat: 'Bangla', local: true },
  { n: 'Vrinda', alt: ['Noto Sans Bengali'], g: null, gen: 'sans-serif', cat: 'Bangla', local: true },
  { n: 'Shonar Bangla', alt: ['Noto Serif Bengali'], g: null, gen: 'serif', cat: 'Bangla', local: true },
  { n: 'Nirmala UI', alt: ['Noto Sans Bengali'], g: null, gen: 'sans-serif', cat: 'Bangla', local: true },
];
const FONT_MAP = {};
for (const f of FONTS) FONT_MAP[f.n.toLowerCase()] = f;
const FONT_SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
const _fontLinks = new Set();
const BENGALI_FALLBACK = '"Noto Sans Bengali"';
// Latin fonts have no Bangla letters, so Bangla text inside them falls through to the
// document's Bangla font (like Word's complex-script font), set as --doc-bn on the page
const BN_VAR = 'var(--doc-bn, "Noto Sans Bengali")';
const isBanglaFontName = n => { const f = FONT_MAP[String(n || '').toLowerCase()]; return !!(f && f.cat === 'Bangla'); };

function quoteFont(n) { n = String(n).trim().replace(/^["']|["']$/g, ''); return /^[a-z-]+$/i.test(n) && !/^(serif|sans-serif|monospace|cursive|fantasy|system-ui)$/i.test(n) ? n : `"${n.replace(/"/g, '')}"`; }
function fontStack(name) {
  name = String(name || 'Calibri').trim().replace(/^["']|["']$/g, '');
  const f = FONT_MAP[name.toLowerCase()];
  if (f) return [quoteFont(f.n), ...(f.alt || []).map(quoteFont), f.cat === 'Bangla' ? BENGALI_FALLBACK : BN_VAR, f.gen].join(', ');
  return `${quoteFont(name)}, Carlito, ${BN_VAR}, sans-serif`;
}
/* the value of --doc-bn: the chosen Bangla font, its look-alike, then Noto */
function bnStack(name) {
  const f = FONT_MAP[String(name || '').toLowerCase()];
  const list = f ? [f.n, ...(f.alt || [])] : [name || 'Noto Sans Bengali'];
  if (!list.some(x => x.toLowerCase() === 'noto sans bengali')) list.push('Noto Sans Bengali');
  return list.map(quoteFont).join(', ');
}
/* Is a font usable here? Web fonts always are; fonts that must be installed are measured. */
const _availCache = new Map();
function fontAvailable(name) {
  const f = FONT_MAP[String(name || '').toLowerCase()];
  if (!f) return true;
  if (f.user) return true;
  if (!f.local) return true;
  if (_availCache.has(f.n)) return _availCache.get(f.n);
  let ok = false;
  try {
    const c = document.createElement('canvas').getContext('2d');
    const sample = 'আমি বাংলায় গান গাই কখগঘঙ অআইঈ Abc 123';
    for (const base of ['monospace', 'serif']) {
      c.font = `40px ${base}`; const w0 = c.measureText(sample).width;
      c.font = `40px ${quoteFont(f.n)}, ${base}`; const w1 = c.measureText(sample).width;
      if (Math.abs(w1 - w0) > 0.5) { ok = true; break; }
    }
  } catch { ok = false; }
  _availCache.set(f.n, ok);
  return ok;
}
/* First family named in a CSS font-family value */
function firstFamily(stack) {
  if (!stack) return '';
  const m = String(stack).match(/^\s*(?:"([^"]+)"|'([^']+)'|([^,]+))/);
  return m ? (m[1] || m[2] || m[3]).trim() : '';
}
function googleHref(spec) { return 'https://fonts.googleapis.com/css2?family=' + spec.replace(/ /g, '+') + '&display=swap'; }
function ensureFont(name) {
  const f = FONT_MAP[String(name || '').toLowerCase()];
  if (!f) return;
  let spec = f.g;
  if (!spec && f.alt) { const a = f.alt.map(x => FONT_MAP[x.toLowerCase()]).find(x => x && x.g); if (a) spec = a.g; }
  if (!spec && f.n === 'Calibri Light') spec = FONT_MAP.calibri.g;
  if (!spec || _fontLinks.has(spec)) return;
  _fontLinks.add(spec);
  const l = h('link', { rel: 'stylesheet', href: googleHref(spec) });
  l.onload = () => { if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => Layout.soon()); };
  document.head.append(l);
}
function ensureAllFonts() { for (const f of FONTS) ensureFont(f.n); }
/* Scan the document for font families in use and load them */
function ensureDocFonts(root) {
  ensureFont(S.doc.font);
  if (S.doc.headFont) ensureFont(S.doc.headFont);
  const seen = new Set();
  (root || S.editor).querySelectorAll('[style*="font-family"]').forEach(el => { const f = firstFamily(el.style.fontFamily); if (f && !seen.has(f)) { seen.add(f); ensureFont(f); } });
}
/* Inline font stacks written by older versions carry a fixed Bangla fallback; bring them up to date */
function normalizeFontStacks(root) {
  root.querySelectorAll('[style*="font-family"]').forEach(el => {
    const ff = el.style.fontFamily;
    if (!ff || ff.includes('--doc-bn')) return;
    const first = firstFamily(ff);
    if (first && !isBanglaFontName(first)) el.style.fontFamily = fontStack(first);
  });
}
