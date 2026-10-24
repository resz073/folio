/* ===================== App state & document model ===================== */
const S = {
  doc: null,
  editor: null,
  zoom: 1,
  zoomMode: 'custom',   // custom | width | page | multi (pages side by side)
  view: 'print',        // print | web | read | focus
  marks: false,
  ruler: true,
  nav: false,
  pane: null,           // null | 'comments' | 'assistant'
  readOnly: false,
  track: false,
  tcView: 'all',        // all | final | original
  dirty: false,
  painter: null,
  selImg: null,
  tab: 'home',
  pages: 1,
  curPage: 1,
  sessionId: uid('s'),
};
const Prefs = {
  units: 'in', author: '', theme: 'system', autocomplete: true, autocorrect: true, miniToolbar: true,
  spell: true, lang: 'en-US', defaultFont: 'Calibri', defaultSize: 11, quickparts: [], lastDoc: null,
  highlight: '#ffff00', fontColor: '#c00000', shade: '#d9e2f3', recentColors: [],
  bnFont: '', avro: false, bijoy: false, bnKbd: '', bijoyOrder: '', bijoyAuto: true, dateFmt: '', datePad: false, letterType: '',
  pen: { style: 'solid', width: 0.5, color: '#000000' }, gridlines: true, lastBorder: 'bottom',
};

const PAGE_SIZES = [
  { id: 'A4', label: 'A4', w: 210, h: 297, u: 'mm' },
  { id: 'Letter', label: 'Letter', w: 8.5, h: 11, u: 'in' },
  { id: 'Legal', label: 'Legal', w: 8.5, h: 14, u: 'in' },
  { id: 'F4', label: 'F4 / Folio', w: 210, h: 330, u: 'mm' },
  { id: 'Foolscap', label: 'Foolscap', w: 8.5, h: 13.5, u: 'in' },
  { id: 'A5', label: 'A5', w: 148, h: 210, u: 'mm' },
  { id: 'A3', label: 'A3', w: 297, h: 420, u: 'mm' },
  { id: 'B5', label: 'B5', w: 176, h: 250, u: 'mm' },
  { id: 'Executive', label: 'Executive', w: 7.25, h: 10.5, u: 'in' },
];
function pageSizePx(id) { const s = PAGE_SIZES.find(p => p.id === id); return s ? { w: s.w * PX[s.u], h: s.h * PX[s.u] } : null; }
const MARGIN_PRESETS = [
  { id: 'normal', label: 'Normal', t: 96, b: 96, l: 96, r: 96 },
  { id: 'narrow', label: 'Narrow', t: 48, b: 48, l: 48, r: 48 },
  { id: 'moderate', label: 'Moderate', t: 96, b: 96, l: 72, r: 72 },
  { id: 'wide', label: 'Wide', t: 96, b: 96, l: 192, r: 192 },
  { id: 'office', label: 'Office letter', t: 96, b: 72, l: 120, r: 72 },
];

/* Bangla font for new documents: the one chosen in Options, else SutonnyOMJ when this device has it */
function defaultBnFont() {
  if (Prefs.bnFont) return Prefs.bnFont;
  try { if (typeof fontAvailable === 'function' && fontAvailable('SutonnyOMJ')) return 'SutonnyOMJ'; } catch { }
  return 'Noto Sans Bengali';
}
function newDocModel(over) {
  const a4 = pageSizePx('A4');
  const d = {
    id: uid('d'), title: 'Untitled document', created: Date.now(), modified: Date.now(),
    html: '<p><br></p>',
    page: { size: 'A4', w: a4.w, h: a4.h, orient: 'portrait', mt: 96, mr: 96, mb: 96, ml: 96, hd: 48, fd: 48, color: '#ffffff', border: false },
    font: Prefs.defaultFont || 'Calibri', size: Prefs.defaultSize || 11, line: 1.08, after: 8, headFont: '',
    bnFont: defaultBnFont(),
    header: { l: '', c: '', r: '' }, footer: { l: '', c: '', r: '' }, firstDiff: false,
    watermark: null,
    comments: [],
    footnotes: {},
    props: { author: '', subject: '', keywords: '' },
    lang: Prefs.lang || 'en-US',
    sample: false,
  };
  if (over) {
    for (const k in over) {
      if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && d[k] && typeof d[k] === 'object') d[k] = Object.assign({}, d[k], over[k]);
      else d[k] = over[k];
    }
  }
  return HF.ensure(d);
}
/* Page geometry in px (orientation applied): the first section's (the document's own) */
function geom() { return pageGeom(S.doc.page); }
const GAP = 22; // space between sheets on screen
