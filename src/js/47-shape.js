/* ===================== Text shaping =====================
   Turns text into positioned glyphs the way the browser does (Chromium shapes with
   HarfBuzz, and this follows HarfBuzz's rules), so text in a PDF matches the page:
   OpenType substitutions and positioning for every script it handles, plus the Indic
   model Bangla needs (conjuncts, reph, ya- and ra-phala, vowel signs placed before
   their consonant). Scripts it does not handle are reported so the caller can fall back. */
const GP = { BASE: 2, LIG: 4, MARK: 8, SUBST: 0x10, LIGATED: 0x20, MULT: 0x40, PRESERVE: 0x70 };
const FF = { GLOBAL: 1, FALLBACK: 2, MANUAL_ZWNJ: 4, MANUAL_ZWJ: 8, PER_SYL: 64 };
FF.MANUAL_JOINERS = FF.MANUAL_ZWNJ | FF.MANUAL_ZWJ;
const MASK_GLOBAL = 1;

const _ucCache = new Map();
const SCX_TESTS = [['complex', /\p{scx=Arab}/u], ['beng', /\p{scx=Beng}/u], ['cyrl', /\p{scx=Cyrl}/u], ['complex', /\p{scx=Deva}/u], ['grek', /\p{scx=Grek}/u], ['latn', /\p{scx=Latn}/u]];
/* per code point: general-category facts and script, cached */
function ucProps(u) {
  let p = _ucCache.get(u);
  if (p) return p;
  const s = String.fromCodePoint(u);
  const mn = /\p{Mn}/u.test(s), mark = mn || /\p{M}/u.test(s);
  let script = 'com';
  if (u >= 0x0980 && u <= 0x09FF) script = 'beng';
  else if (/\p{Script=Inherited}/u.test(s)) script = 'inh';
  else if (/\p{Script=Common}/u.test(s)) script = 'com';
  else if (/\p{Script=Latin}/u.test(s)) script = 'latn';
  else if (/\p{Script=Greek}/u.test(s)) script = 'grek';
  else if (/\p{Script=Cyrillic}/u.test(s)) script = 'cyrl';
  else if (/[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Devanagari}\p{Script=Gurmukhi}\p{Script=Gujarati}\p{Script=Oriya}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Kannada}\p{Script=Malayalam}\p{Script=Sinhala}\p{Script=Thai}\p{Script=Lao}\p{Script=Tibetan}\p{Script=Myanmar}\p{Script=Khmer}\p{Script=Hangul}\p{Script=Mongolian}\p{Script=Javanese}\p{Script=Balinese}]/u.test(s)) script = 'complex';
  else script = 'other';
  p = {
    mn, mark,
    // HarfBuzz FLAG_RANGE (FORMAT .. NON_SPACING_MARK): letters, marks and format characters
    letterish: /[\p{L}\p{M}\p{Cf}\p{Co}\p{Cn}]/u.test(s),
    ign: u === 0xAD || u === 0x34F || u === 0x61C || (u >= 0x115F && u <= 0x1160) || (u >= 0x17B4 && u <= 0x17B5) || (u >= 0x180B && u <= 0x180F) || (u >= 0x200B && u <= 0x200F) || (u >= 0x202A && u <= 0x202E) || (u >= 0x2060 && u <= 0x206F) || u === 0x3164 || (u >= 0xFE00 && u <= 0xFE0F) || u === 0xFEFF || u === 0xFFA0 || (u >= 0xFFF0 && u <= 0xFFF8) || (u >= 0x1BCA0 && u <= 0x1BCA3) || (u >= 0x1D173 && u <= 0x1D17A) || (u >= 0xE0000 && u <= 0xE0FFF),
    hidden: u === 0x34F || (u >= 0x180B && u <= 0x180F),
    space: /\p{Zs}/u.test(s),
    script,
    // common characters used by particular scripts (Script_Extensions), in the order the
    // browser prefers them: lowest ICU script code first, Latin last
    scx: script === 'com' ? SCX_TESTS.filter(([, re]) => re.test(s)).map(([t]) => t) : null,
  };
  _ucCache.set(u, p);
  return p;
}

/* ---------- Indic (Bangla) character classes ---------- */
const IC = { X: 0, C: 1, V: 2, N: 3, H: 4, ZWNJ: 5, ZWJ: 6, M: 7, SM: 8, A: 9, PH: 10, DC: 11, RS: 12, MPst: 13, Repha: 14, Ra: 15, CM: 16, Sym: 17, CS: 18 };
const IP = { START: 0, RA_REPH: 1, PRE_M: 2, PRE_C: 3, BASE_C: 4, AFTER_MAIN: 5, ABOVE_C: 6, BEFORE_SUB: 7, BELOW_C: 8, AFTER_SUB: 9, BEFORE_POST: 10, POST_C: 11, AFTER_POST: 12, FINAL_C: 13, SMVD: 14, END: 15 };
const IC_CONS = new Set([IC.C, IC.CS, IC.Ra, IC.CM, IC.V, IC.PH, IC.DC]);
function bengaliProps(u) {
  if (u === 0x200C) return [IC.ZWNJ, IP.END];
  if (u === 0x200D) return [IC.ZWJ, IP.END];
  if (u === 0x25CC) return [IC.DC, IP.BASE_C];
  if (u === 0x00A0 || u === 0x00D7 || (u >= 0x2010 && u <= 0x2014) || u === 0x2022 || (u >= 0x25FB && u <= 0x25FE)) return [IC.PH, IP.BASE_C];
  if (u === 0x0951 || u === 0x0952 || (u >= 0x1CD0 && u <= 0x1CFF)) return [IC.A, IP.SMVD];
  if (u < 0x0980 || u > 0x09FF) return [IC.X, IP.END];
  if (u === 0x0981 || u === 0x0982 || u === 0x0983 || u === 0x09FC || u === 0x09FE) return [IC.SM, IP.SMVD];
  if (u === 0x09BD) return [IC.Sym, IP.SMVD];
  if (u === 0x09BC) return [IC.N, IP.BELOW_C];
  if (u === 0x09CD) return [IC.H, IP.BELOW_C];
  if (u === 0x09B0 || u === 0x09F0) return [IC.Ra, IP.BASE_C];
  if ((u >= 0x0995 && u <= 0x09B9) || u === 0x09CE || u === 0x09DC || u === 0x09DD || u === 0x09DF || u === 0x09F1) return [IC.C, IP.BASE_C];
  if ((u >= 0x0985 && u <= 0x0994) || u === 0x09E0 || u === 0x09E1) return [IC.V, IP.BASE_C];
  if (u === 0x09BF || u === 0x09C7 || u === 0x09C8) return [IC.M, IP.PRE_M];
  if (u === 0x09BE || u === 0x09C0 || u === 0x09CB || u === 0x09CC || u === 0x09D7) return [IC.M, IP.AFTER_POST];
  if ((u >= 0x09C1 && u <= 0x09C4) || u === 0x09E2 || u === 0x09E3) return [IC.M, IP.AFTER_SUB];
  if (u >= 0x09E6 && u <= 0x09EF) return [IC.PH, IP.BASE_C];
  return [IC.X, IP.END];
}
/* the syllable grammar of HarfBuzz's Indic machine, over one letter per class */
const IC_LETTER = 'xcvnhwjmsapdrqeRkyS';
const INDIC_SYL = (() => {
  const c = '[cR]', n = '(?:(?:w?r)?(?:nn?)?)', z = '[jw]', reph = '(?:Rh|e)';
  const cn = `${c}j?${n}`, symbol = 'yn?';
  const matra = `${z}*(?:m|s?q)n?h?`;
  const tail = '(?:z?ss?w?)?a*'.replace('z', z);
  const halant = `${z}?h(?:jn?)?`;
  const finalHalant = `(?:hw|${halant})`;
  const hm = `(?:${finalHalant}|(?:${matra})*)`;
  const cst = `(?:${halant}${cn})*k?${hm}${tail}`;
  const mk = s => new RegExp(s, 'y');
  return [
    [0, mk(`[eS]?${cn}${cst}`)],                              // consonant syllable
    [1, mk(`${reph}?v${n}j`)],                                // vowel syllable (each branch alone, so the longest wins)
    [1, mk(`${reph}?v${n}${cst}`)],
    [2, mk(`(?:[eS]?p|${reph}?d)${n}${cst}`)],                // standalone cluster
    [3, mk(`${symbol}${tail}`)],                              // symbol cluster
    [4, mk(`${reph}?${n}${cst}`)],                            // broken cluster
  ];
})();

/* ---------- plans: which lookups run, in which stages ---------- */
class MapBuilder {
  constructor() { this.feats = []; this.stage = [0, 0]; this.pauses = [[], []]; this.seq = 0; }
  add(tag, flags = 0, value = 1) { this.feats.push({ tag, flags, value, stage: this.stage.slice(), seq: this.seq++ }); }
  enable(tag, flags = 0) { this.add(tag, FF.GLOBAL | flags, 1); }
  disable(tag) { this.add(tag, FF.GLOBAL, 0); }
  pause(table, fn) { this.pauses[table].push({ stage: this.stage[table], fn }); this.stage[table]++; }
  compile(font, gsubSel, gposSel) {
    const fs = this.feats.slice().sort((a, b) => a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : a.seq - b.seq);
    const merged = [];
    for (const f of fs) {
      const j = merged[merged.length - 1];
      if (!j || j.tag !== f.tag) { merged.push(Object.assign({}, f, { stage: f.stage.slice() })); continue; }
      if (f.flags & FF.GLOBAL) { j.flags |= FF.GLOBAL; j.value = f.value; }
      else { if (j.flags & FF.GLOBAL) j.flags ^= FF.GLOBAL; j.value = Math.max(j.value, f.value); }
      j.flags |= f.flags & FF.FALLBACK;
      j.stage[0] = Math.min(j.stage[0], f.stage[0]); j.stage[1] = Math.min(j.stage[1], f.stage[1]);
    }
    const sels = [gsubSel, gposSel];
    const masks = {};
    let bit = 1;
    const out = { masks, global: MASK_GLOBAL, stages: [[], []], found: new Set() };
    const featLookups = (sel, tag) => {
      if (!sel) return null;
      for (const fi of sel.feats) { const ft = sel.L.features[fi]; if (ft && ft.tag === tag) return ft.lookups; }
      return null;
    };
    const entries = [];
    for (const f of merged) {
      if (!f.value) continue;
      const lk = [featLookups(sels[0], f.tag), featLookups(sels[1], f.tag)];
      if (!lk[0] && !lk[1] && !(f.flags & FF.FALLBACK)) continue;
      let mask;
      if ((f.flags & FF.GLOBAL) && f.value === 1) mask = MASK_GLOBAL;
      else { if (bit >= 30) continue; mask = 1 << bit++; }
      masks[f.tag] = mask;
      if (lk[0] || lk[1]) out.found.add(f.tag);
      entries.push({ f, mask, lk });
    }
    for (let t = 0; t < 2; t++) {
      const sel = sels[t];
      const nStages = this.stage[t] + 1;
      for (let s = 0; s < nStages; s++) {
        const lookups = [];
        if (s === 0 && sel && sel.req >= 0 && sel.L.features[sel.req]) for (const li of sel.L.features[sel.req].lookups) lookups.push({ idx: li, mask: MASK_GLOBAL, autoZwj: true, autoZwnj: true, perSyl: false });
        for (const e of entries) {
          if (e.f.stage[t] !== s || !e.lk[t]) continue;
          for (const li of e.lk[t]) lookups.push({ idx: li, mask: e.mask, autoZwj: !(e.f.flags & FF.MANUAL_ZWJ), autoZwnj: !(e.f.flags & FF.MANUAL_ZWNJ), perSyl: !!(e.f.flags & FF.PER_SYL) });
        }
        lookups.sort((a, b) => a.idx - b.idx);
        const m = [];
        for (const l of lookups) {
          const p = m[m.length - 1];
          if (p && p.idx === l.idx) { p.mask |= l.mask; p.autoZwj = p.autoZwj && l.autoZwj; p.autoZwnj = p.autoZwnj && l.autoZwnj; p.perSyl = p.perSyl || l.perSyl; }
          else m.push(Object.assign({}, l));
        }
        const pause = this.pauses[t].find(p => p.stage === s);
        out.stages[t].push({ lookups: m.filter(l => sel && sel.L.lookups[l.idx]), pause: pause ? pause.fn : null });
      }
    }
    return out;
  }
}
/* pick the script and language system, as HarfBuzz does */
function otSelect(L, tags, lang) {
  if (!L) return null;
  let tag = tags.find(t => L.scripts[t]);
  if (!tag) tag = ['DFLT', 'dflt', 'latn'].find(t => L.scripts[t]);
  if (!tag) return null;
  const sc = L.scripts[tag];
  const ls = (lang && sc.langs[lang]) || sc.dflt;
  if (!ls) return null;
  return { L, tag, feats: ls.feats, req: ls.req };
}
const SCRIPT_TAGS = { beng: ['bng2', 'beng'], latn: ['latn'], grek: ['grek'], cyrl: ['cyrl'], com: [], inh: [], other: [] };

function shapePlan(font, script, lang, opts) {
  const key = script + '|' + (lang || '') + '|' + (opts.noLiga ? 1 : 0) + (opts.noKern ? 1 : 0) + (opts.smcp ? 1 : 0);
  const cache = font._plans || (font._plans = new Map());
  let plan = cache.get(key);
  if (plan) return plan;
  const tags = SCRIPT_TAGS[script] || [];
  const gsub = otSelect(font.layout('GSUB'), tags, lang), gpos = otSelect(font.layout('GPOS'), tags, lang);
  const indic = script === 'beng';
  const mb = new MapBuilder();
  mb.enable('rvrn'); mb.pause(0, null);
  mb.enable('ltra'); mb.enable('ltrm');
  if (indic) {
    mb.pause(0, 'syllables');
    mb.enable('locl', FF.PER_SYL); mb.enable('ccmp', FF.PER_SYL);
    mb.pause(0, 'initial');
    for (const [t, fl] of [['nukt', FF.GLOBAL | FF.MANUAL_JOINERS | FF.PER_SYL], ['akhn', FF.GLOBAL | FF.MANUAL_JOINERS | FF.PER_SYL], ['rphf', FF.MANUAL_JOINERS | FF.PER_SYL], ['rkrf', FF.GLOBAL | FF.MANUAL_JOINERS | FF.PER_SYL], ['pref', FF.MANUAL_JOINERS | FF.PER_SYL], ['blwf', FF.MANUAL_JOINERS | FF.PER_SYL], ['abvf', FF.MANUAL_JOINERS | FF.PER_SYL], ['half', FF.MANUAL_JOINERS | FF.PER_SYL], ['pstf', FF.MANUAL_JOINERS | FF.PER_SYL], ['vatu', FF.GLOBAL | FF.MANUAL_JOINERS | FF.PER_SYL], ['cjct', FF.GLOBAL | FF.MANUAL_JOINERS | FF.PER_SYL]]) { mb.add(t, fl); mb.pause(0, null); }
    mb.pause(0, 'final');
    for (const [t, fl] of [['init', FF.MANUAL_JOINERS | FF.PER_SYL], ['pres', FF.GLOBAL | FF.MANUAL_JOINERS | FF.PER_SYL], ['abvs', FF.GLOBAL | FF.MANUAL_JOINERS | FF.PER_SYL], ['blws', FF.GLOBAL | FF.MANUAL_JOINERS | FF.PER_SYL], ['psts', FF.GLOBAL | FF.MANUAL_JOINERS | FF.PER_SYL], ['haln', FF.GLOBAL | FF.MANUAL_JOINERS | FF.PER_SYL]]) mb.add(t, fl);
  }
  for (const [t, fl] of [['abvm', 0], ['blwm', 0], ['ccmp', 0], ['locl', 0], ['mark', FF.MANUAL_JOINERS], ['mkmk', FF.MANUAL_JOINERS], ['rlig', 0]]) mb.enable(t, fl);
  for (const [t, fl] of [['calt', 0], ['clig', 0], ['curs', 0], ['dist', 0], ['kern', FF.FALLBACK], ['liga', 0], ['rclt', 0]]) mb.enable(t, fl);
  if (opts.smcp) mb.enable('smcp');
  if (indic) { mb.disable('liga'); mb.pause(0, 'clear'); }
  if (opts.noLiga) { mb.disable('liga'); mb.disable('clig'); mb.disable('dlig'); mb.disable('hlig'); mb.disable('calt'); }
  if (opts.noKern) mb.disable('kern');
  const map = mb.compile(font, gsub, gpos);
  plan = { script, gsub, gpos, map, indic, kernFallback: !!map.masks.kern && !(gpos && map.found.has('kern') && gposHasFeature(gpos, 'kern')) };
  if (indic) {
    // the old 'beng' tag (or none) keeps the halant after the last consonant, Uniscribe-style
    plan.oldSpec = !(gsub && /2$/.test(gsub.tag));
    plan.virama = font.glyph(0x09CD);
    const wsub = tag => { const lk = gsub && featureLookupList(gsub, tag); return lk ? lk.map(i => gsub.L.lookups[i]).filter(Boolean) : []; };
    plan.would = { rphf: wsub('rphf'), pref: wsub('pref'), blwf: wsub('blwf'), pstf: wsub('pstf'), vatu: wsub('vatu') };
    plan.zeroContext = !plan.oldSpec;
    plan.m = t => map.masks[t] && map.masks[t] !== MASK_GLOBAL ? map.masks[t] : 0;
  }
  cache.set(key, plan);
  return plan;
}
function featureLookupList(sel, tag) { for (const fi of sel.feats) { const f = sel.L.features[fi]; if (f && f.tag === tag) return f.lookups; } return null; }
function gposHasFeature(sel, tag) { return !!featureLookupList(sel, tag); }

/* ---------- the buffer ---------- */
function mkInfo(font, cp, g, cl, chars) {
  const p = ucProps(cp);
  return { g, cp, cl, chars, mask: MASK_GLOBAL, props: 0, ligId: 0, ligComp: 0, ligBase: false, ligNum: 0, syl: 0, ic: 0, ip: 0,
    ign: p.ign, hidden: p.hidden, zwj: cp === 0x200D, zwnj: cp === 0x200C, mn: p.mn, letterish: p.letterish,
    xa: 0, ya: 0, xo: 0, yo: 0, chain: 0, atype: 0 };
}
function cloneInfo(src, g) { const o = Object.assign({}, src); o.g = g; return o; }
function glyphPropsOf(font, info) {
  const cls = font.gdef.classes;
  if (cls) {
    const c = cls.get(info.g) || 0;
    if (c === 1) return GP.BASE;
    if (c === 2) return GP.LIG;
    if (c === 3) return GP.MARK | (((font.gdef.markAttach && font.gdef.markAttach.get(info.g)) || 0) << 8);
    return 0;
  }
  return info.mn && !info.ign ? GP.MARK : GP.BASE;
}
const ligNumComps = i => (i.props & GP.LIG) && i.ligBase ? i.ligNum : 1;
const ligCompOf = i => i.ligBase ? 0 : i.ligComp;
const isMark = i => !!(i.props & GP.MARK);

/* normalization: compose where the font has the composed letter, decompose where it doesn't
   (Indic text is decomposed first, as HarfBuzz does, keeping split vowel signs apart) */
function normalizeChars(font, text, indic) {
  const out = [];
  let ci = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    let parts = [cp];
    if (indic) {
      if (cp !== 0x09DC && cp !== 0x09DD) {
        const d = ch.normalize('NFD');
        if (d !== ch) { const dc = Array.from(d).map(x => x.codePointAt(0)); if (dc.every(c => font.has(c))) parts = dc; }
      }
    } else if (!font.has(cp)) {
      const d = ch.normalize('NFD');
      if (d !== ch) { const dc = Array.from(d).map(x => x.codePointAt(0)); if (dc.every(c => font.has(c))) parts = dc; }
    }
    parts.forEach((c, k) => out.push({ cp: c, cl: ci, chars: String.fromCodePoint(c), orig: k === 0 ? ch : '' }));
    ci += ch.length;
  }
  // recompose base + mark where the font has the composed form (Bangla: only YA + NUKTA)
  for (let i = 1; i < out.length; i++) {
    const a = out[i - 1], b = out[i];
    if (!ucProps(b.cp).mark || ucProps(a.cp).mark) continue;
    let comp = null;
    if (indic) { if (a.cp === 0x09AF && b.cp === 0x09BC) comp = 0x09DF; }
    else { const s = String.fromCodePoint(a.cp, b.cp).normalize('NFC'); if (Array.from(s).length === 1) comp = s.codePointAt(0); }
    if (comp && font.has(comp)) { a.cp = comp; a.chars = String.fromCodePoint(comp); out.splice(i, 1); i--; }
  }
  return out;
}

/* ---------- applying lookups ---------- */
class LayoutRun {
  constructor(font, plan, buf) { this.font = font; this.plan = plan; this.buf = buf; this.ligSerial = 0; this.gpos = false; }
  setLookup(lk, look, gpos) {
    this.gpos = gpos;
    this.mask = look.mask; this.autoZwj = look.autoZwj; this.autoZwnj = look.autoZwnj; this.perSyl = look.perSyl && !gpos;
    this.props = lk.flag | (lk.flag & 0x10 ? lk.markSet << 16 : 0);
    this.L = gpos ? this.plan.gpos.L : this.plan.gsub.L;
  }
  checkProps(info, props) {
    const gp = info.props;
    if (gp & props & 0x0E) return false;
    if (gp & GP.MARK) {
      if (props & 0x10) { const set = this.font.gdef.markSets[props >>> 16]; return !!(set && set.has(info.g)); }
      if (props & 0xFF00) return (props & 0xFF00) === (gp & 0xFF00);
    }
    return true;
  }
  /* 0 skip, 1 match, 2 not-match (HarfBuzz skippy-iterator semantics) */
  test(info, ctxMatch, fn, data, syl) {
    let skip = 0;
    if (!this.checkProps(info, this.props)) return 0;
    const igZwnj = this.gpos || (ctxMatch && this.autoZwnj), igZwj = ctxMatch || this.autoZwj, igHidden = this.gpos;
    if (info.ign && (igZwnj || !info.zwnj) && (igZwj || !info.zwj) && (igHidden || !info.hidden)) skip = 2;
    let m;
    if ((!ctxMatch && !(info.mask & this.mask)) || (syl && syl !== info.syl)) m = 0;
    else if (fn) m = fn(info, data) ? 1 : 0;
    else m = 2;
    if (m === 1 || (m === 2 && skip === 0)) return 1;
    if (skip === 0) return 2;
    return 0;
  }
  next(from, ctxMatch, fn, data, syl) {
    const b = this.buf;
    for (let i = from + 1; i < b.length; i++) { const r = this.test(b[i], ctxMatch, fn, data, syl); if (r === 1) return i; if (r === 2) return -1; }
    return -1;
  }
  prev(from, ctxMatch, fn, data, syl) {
    const b = this.buf;
    for (let i = from - 1; i >= 0; i--) { const r = this.test(b[i], ctxMatch, fn, data, syl); if (r === 1) return i; if (r === 2) return -1; }
    return -1;
  }
  sylAt(i) { return this.perSyl ? this.buf[i].syl : 0; }
  matchInput(i, inputs, fn) {
    const b = this.buf, pos = [i];
    const syl = this.sylAt(i);
    const first = b[i], firstId = first.ligId, firstComp = ligCompOf(first);
    let total = ligNumComps(first), at = i;
    for (let k = 0; k < inputs.length; k++) {
      at = this.next(at, false, fn, inputs[k], syl);
      if (at < 0) return null;
      const x = b[at], id = x.ligId, comp = ligCompOf(x);
      if (firstId && firstComp) {
        if (firstId !== id || firstComp !== comp) {
          // allowed only when attached to an ignorable base ligature
          let j = i, found = -1;
          while (j > 0 && b[j - 1].ligId === firstId) { if (ligCompOf(b[j - 1]) === 0) { found = j - 1; break; } j--; }
          if (!(found >= 0 && !this.checkProps(b[found], this.props))) return null;
        }
      } else if (id && comp && id !== firstId) return null;
      total += ligNumComps(x);
      pos.push(at);
    }
    return { pos, end: at + 1, total };
  }
  matchBack(i, list, fn) {
    let at = i;
    const syl = this.sylAt(i);
    for (let k = 0; k < list.length; k++) { at = this.prev(at, true, fn, list[k], syl); if (at < 0) return false; }
    return true;
  }
  matchAhead(end, list, fn) {
    let at = end - 1;
    const syl = this.sylAt(this.cur);
    for (let k = 0; k < list.length; k++) { at = this.next(at, true, fn, list[k], syl); if (at < 0) return false; }
    return true;
  }
  /* glyph replacement bookkeeping */
  setClass(info, g, guess = 0, lig = false, comp = false) {
    info.g = g;
    let p = info.props | GP.SUBST;
    if (lig) { p |= GP.LIGATED; p &= ~GP.MULT; }
    if (comp) p |= GP.MULT;
    if (this.font.gdef.classes) { p &= GP.PRESERVE; info.props = p | glyphPropsOf(this.font, info); }
    else if (guess) { p &= GP.PRESERVE; info.props = p | guess; }
    else info.props = p;
  }
  /* GSUB at position i: returns the index to continue from, or -1 */
  applySubst(st, i) {
    const b = this.buf, info = b[i];
    this.cur = i;
    switch (st.k) {
      case 'single': {
        const ci = st.cov.get(info.g); if (ci === undefined) return -1;
        this.setClass(info, st.delta !== undefined ? (info.g + st.delta) & 0xFFFF : st.subst[ci]);
        return i + 1;
      }
      case 'multiple': {
        const ci = st.cov.get(info.g); if (ci === undefined) return -1;
        const seq = st.seqs[ci];
        if (seq.length === 1) { this.setClass(info, seq[0]); return i + 1; }
        if (!seq.length) { b.splice(i, 1); return i; }
        const guess = info.props & GP.LIG ? GP.BASE : 0;
        const outs = seq.map((g, k) => {
          const o = cloneInfo(info, g);
          if (k) o.chars = '';
          if (!info.ligId) { o.ligId = 0; o.ligBase = false; o.ligComp = k; }
          this.setClass(o, g, guess, false, true);
          return o;
        });
        b.splice(i, 1, ...outs);
        return i + outs.length;
      }
      case 'alternate': {
        const ci = st.cov.get(info.g); if (ci === undefined) return -1;
        const alts = st.seqs[ci]; if (!alts.length) return -1;
        this.setClass(info, alts[0]);
        return i + 1;
      }
      case 'ligature': {
        const ci = st.cov.get(info.g); if (ci === undefined) return -1;
        for (const lig of st.sets[ci]) {
          if (!lig.comps.length) { this.setClass(info, lig.g); return i + 1; }
          const m = this.matchInput(i, lig.comps, (x, d) => x.g === d);
          if (!m) continue;
          return this.ligate(m, lig.g);
        }
        return -1;
      }
      case 'ctx': return this.applyContext(st, i, false);
      case 'reverse': return -1; // applied by the backward pass
    }
    return -1;
  }
  ligate(m, ligG) {
    const b = this.buf, pos = m.pos, i = pos[0];
    let isBaseLig = !!(b[i].props & GP.BASE), isMarkLig = isMark(b[i]);
    for (let k = 1; k < pos.length; k++) if (!isMark(b[pos[k]])) { isBaseLig = false; isMarkLig = false; break; }
    const isLig = !isBaseLig && !isMarkLig;
    const klass = isLig ? GP.LIG : 0;
    const ligId = isLig ? (this.ligSerial = (this.ligSerial % 7) + 1) : 0;
    const first = b[i];
    let lastId = first.ligId, lastNum = ligNumComps(first), soFar = lastNum;
    const chars = pos.map(p => b[p].chars).join('');
    if (isLig) { first.ligId = ligId; first.ligBase = true; first.ligNum = m.total; if (first.mn) first.mn = false; }
    this.setClass(first, ligG, klass, true);
    first.chars = chars;
    // marks between the components stay, attached to the right component; components go
    const keep = [first];
    for (let k = 1; k < pos.length; k++) {
      for (let j = pos[k - 1] + 1; j < pos[k]; j++) {
        const x = b[j];
        if (isLig) {
          let thisComp = ligCompOf(x);
          if (!thisComp) thisComp = lastNum;
          x.ligId = ligId; x.ligBase = false; x.ligComp = soFar - lastNum + Math.min(thisComp, lastNum);
        }
        keep.push(x);
      }
      const comp = b[pos[k]];
      lastId = comp.ligId; lastNum = ligNumComps(comp); soFar += lastNum;
    }
    const last = pos[pos.length - 1];
    b.splice(i, last - i + 1, ...keep);
    let next = i + keep.length;
    if (!isMarkLig && lastId) {
      for (let j = next; j < b.length; j++) {
        if (b[j].ligId !== lastId) break;
        const thisComp = ligCompOf(b[j]);
        if (!thisComp) break;
        b[j].ligId = ligId; b[j].ligBase = false; b[j].ligComp = soFar - lastNum + Math.min(thisComp, lastNum);
      }
    }
    return next;
  }
  /* Context / ChainContext, for both tables */
  applyContext(st, i, gpos) {
    const b = this.buf, g = b[i].g;
    const ci = st.cov.get(g);
    if (ci === undefined) return -1;
    const tryRule = (r, fnB, fnI, fnA) => {
      const m = this.matchInput(i, r.input, fnI);
      if (!m) return -1;
      if (r.ahead.length && !this.matchAhead(m.end, r.ahead, fnA)) return -1;
      if (r.back.length && !this.matchBack(i, r.back, fnB)) return -1;
      return this.applyRecords(m, r.recs, gpos);
    };
    if (st.fmt === 1) {
      const eq = (x, d) => x.g === d;
      for (const r of st.sets[ci] || []) { const res = tryRule(r, eq, eq, eq); if (res >= 0) return res; }
      return -1;
    }
    if (st.fmt === 2) {
      const cls = st.cd.get(g) || 0;
      const fb = (x, d) => (st.bcd.get(x.g) || 0) === d, fi = (x, d) => (st.cd.get(x.g) || 0) === d, fa = (x, d) => (st.acd.get(x.g) || 0) === d;
      for (const r of st.sets[cls] || []) { const res = tryRule(r, fb, fi, fa); if (res >= 0) return res; }
      return -1;
    }
    const cov = (x, d) => d.has(x.g);
    return tryRule(st, cov, cov, cov);
  }
  applyRecords(m, recs, gpos) {
    const b = this.buf;
    const pos = m.pos.slice();
    let count = pos.length, end = m.end;
    for (const [seqIdx, lookupIdx] of recs) {
      if (seqIdx >= count) continue;
      const before = b.length;
      if (pos[seqIdx] >= b.length) continue;
      this.recurse(lookupIdx, pos[seqIdx], gpos);
      const delta = b.length - before;
      if (!delta) continue;
      let d = delta;
      end += d;
      if (end < pos[seqIdx]) { d += pos[seqIdx] - end; end = pos[seqIdx]; }
      let next = seqIdx + 1;
      if (d > 0) {
        pos.splice(next, 0, ...new Array(d).fill(0));
        for (let j = next; j < next + d; j++) pos[j] = pos[j - 1] + 1;
        next += d; count += d;
      } else if (d < 0) {
        d = Math.max(d, next - count);
        pos.splice(next, -d);
        count += d;
      }
      for (let j = next; j < count; j++) pos[j] += d;
    }
    return Math.max(end, m.pos[0] + 1);
  }
  recurse(lookupIdx, at, gpos) {
    if ((this.depth || 0) > 6) return;
    const L = gpos ? this.plan.gpos.L : this.plan.gsub.L;
    const lk = L.lookups[lookupIdx];
    if (!lk) return;
    const save = this.props;
    this.props = lk.flag | (lk.flag & 0x10 ? lk.markSet << 16 : 0);
    this.depth = (this.depth || 0) + 1;
    for (const st of this.font.subtables(L, lk)) {
      const r = gpos ? this.applyPos(st, at) : (st.k === 'reverse' ? -1 : this.applySubst(st, at));
      if (r >= 0) break;
    }
    this.depth--;
    this.props = save;
  }
  applyReverse(st, i) {
    const b = this.buf, ci = st.cov.get(b[i].g);
    if (ci === undefined) return false;
    this.cur = i;
    const cov = (x, d) => d.has(x.g);
    if (st.back.length && !this.matchBack(i, st.back, cov)) return false;
    if (st.ahead.length && !this.matchAhead(i + 1, st.ahead, cov)) return false;
    b[i].g = st.subst[ci];
    b[i].props |= GP.SUBST;
    if (this.font.gdef.classes) b[i].props = (b[i].props & GP.PRESERVE) | glyphPropsOf(this.font, b[i]);
    return true;
  }
  runGSUB(look) {
    const L = this.plan.gsub.L, lk = L.lookups[look.idx];
    this.setLookup(lk, look, false);
    const subs = this.font.subtables(L, lk);
    if (!subs.length) return;
    const b = this.buf;
    if (subs[0].k === 'reverse') {
      for (let i = b.length - 1; i >= 0; i--) {
        if (!(b[i].mask & this.mask) || !this.checkProps(b[i], this.props)) continue;
        for (const st of subs) if (this.applyReverse(st, i)) break;
      }
      return;
    }
    for (let i = 0; i < b.length;) {
      const info = b[i];
      let r = -1;
      if ((info.mask & this.mask) && this.checkProps(info, this.props)) for (const st of subs) { r = this.applySubst(st, i); if (r >= 0) break; }
      i = r >= 0 ? r : i + 1;
    }
  }
  /* GPOS */
  value(info, v) { if (!v) return; info.xo += v.xp; info.yo += v.yp; info.xa += v.xa; info.ya += v.ya; }
  applyPos(st, i) {
    const b = this.buf, info = b[i];
    this.cur = i;
    switch (st.k) {
      case 'single': { const ci = st.cov.get(info.g); if (ci === undefined) return -1; this.value(info, st.v || st.vs[ci]); return i + 1; }
      case 'pair': {
        const ci = st.cov.get(info.g); if (ci === undefined) return -1;
        const j = this.next(i, false, null, null, 0);
        if (j < 0) return -1;
        let rec;
        if (st.fmt === 1) rec = st.sets[ci].get(b[j].g);
        else rec = this.font.pairClassValue(st, st.cd1.get(info.g) || 0, st.cd2.get(b[j].g) || 0);
        if (!rec) return -1;
        this.value(info, rec[0]); this.value(b[j], rec[1]);
        return st.vf2 ? j + 1 : j;
      }
      case 'cursive': {
        const ci = st.cov.get(info.g); if (ci === undefined) return -1;
        const me = st.recs[ci]; if (!me[0]) return -1;
        const j = this.prev(i, false, null, null, 0);
        if (j < 0) return -1;
        const pc = st.cov.get(b[j].g); if (pc === undefined) return -1;
        const pr = st.recs[pc]; if (!pr[1]) return -1;
        const [ex, ey] = pr[1], [nx, ny] = me[0];
        b[j].xa = ex + b[j].xo;
        const d = nx + info.xo;
        info.xa -= d; info.xo -= d;
        if (this.props & 1) { b[j].atype = 2; b[j].chain = i - j; b[j].yo = ny - ey; }
        else { info.atype = 2; info.chain = j - i; info.yo = ey - ny; }
        return i + 1;
      }
      case 'markBase': {
        const mi = st.mcov.get(info.g); if (mi === undefined) return -1;
        let j = i - 1;
        for (; j >= 0; j--) {
          const x = b[j];
          if (isMark(x) || x.ign) continue;
          if (!(x.mask & this.mask)) continue;
          // attach to the first of a multiple-substitution sequence only
          const accept = !(x.props & GP.MULT) || ligCompOf(x) === 0 || j === 0 || isMark(b[j - 1]) || !(b[j - 1].props & GP.MULT) || x.ligId !== b[j - 1].ligId || ligCompOf(x) !== ligCompOf(b[j - 1]) + 1;
          if (!accept && st.bcov.get(x.g) === undefined) continue;
          break;
        }
        if (j < 0) return -1;
        const bi = st.bcov.get(b[j].g); if (bi === undefined) return -1;
        return this.attachMark(st, mi, st.bases[bi], i, j);
      }
      case 'markLig': {
        const mi = st.mcov.get(info.g); if (mi === undefined) return -1;
        let j = i - 1;
        for (; j >= 0; j--) { if (!isMark(b[j]) && !b[j].ign && (b[j].mask & this.mask)) break; }
        if (j < 0) return -1;
        const li = st.lcov.get(b[j].g); if (li === undefined) return -1;
        const comps = st.ligs[li];
        if (!comps.length) return -1;
        const markId = info.ligId, markComp = ligCompOf(info), ligId = b[j].ligId;
        const idx = ligId && ligId === markId && markComp > 0 ? Math.min(comps.length, markComp) - 1 : comps.length - 1;
        return this.attachMark(st, mi, comps[idx], i, j);
      }
      case 'markMark': {
        const mi = st.mcov.get(info.g); if (mi === undefined) return -1;
        const save = this.props;
        this.props = save & ~0x0E;
        const j = this.prev(i, false, null, null, 0);
        this.props = save;
        if (j < 0 || !isMark(b[j])) return -1;
        const id1 = info.ligId, id2 = b[j].ligId, c1 = ligCompOf(info), c2 = ligCompOf(b[j]);
        let good = false;
        if (id1 === id2) good = id1 === 0 || c1 === c2;
        else good = (id1 > 0 && !c1) || (id2 > 0 && !c2);
        if (!good) return -1;
        const m2 = st.bcov.get(b[j].g); if (m2 === undefined) return -1;
        return this.attachMark(st, mi, st.bases[m2], i, j);
      }
      case 'ctx': return this.applyContext(st, i, true);
    }
    return -1;
  }
  attachMark(st, mi, row, i, j) {
    const mk = st.marks[mi];
    if (!mk || !mk.a) return -1;
    const ba = row && row[mk.cls];
    if (!ba) return -1;
    const info = this.buf[i];
    info.xo = ba[0] - mk.a[0];
    info.yo = ba[1] - mk.a[1];
    info.atype = 1;
    info.chain = j - i;
    return i + 1;
  }
  runGPOS(look) {
    const L = this.plan.gpos.L, lk = L.lookups[look.idx];
    this.setLookup(lk, look, true);
    const subs = this.font.subtables(L, lk);
    if (!subs.length) return;
    const b = this.buf;
    for (let i = 0; i < b.length;) {
      const info = b[i];
      let r = -1;
      if ((info.mask & this.mask) && this.checkProps(info, this.props)) for (const st of subs) { r = this.applyPos(st, i); if (r >= 0) break; }
      i = r >= 0 ? Math.max(r, i + 1) : i + 1;
    }
  }
}

/* ---------- Indic reordering ---------- */
function indicWould(run, lookups, glyphs) {
  const font = run.font, L = run.plan.gsub && run.plan.gsub.L;
  if (!L) return false;
  for (const lk of lookups) {
    for (const st of font.subtables(L, lk)) {
      const g0 = glyphs[0];
      switch (st.k) {
        case 'single': case 'multiple': case 'alternate': if (glyphs.length === 1 && st.cov.has(g0)) return true; break;
        case 'reverse': if (glyphs.length === 1 && st.cov.has(g0)) return true; break;
        case 'ligature': {
          const ci = st.cov.get(g0); if (ci === undefined) break;
          for (const lig of st.sets[ci]) if (lig.comps.length + 1 === glyphs.length && lig.comps.every((c, k) => c === glyphs[k + 1])) return true;
          break;
        }
        case 'ctx': {
          const ci = st.cov.get(g0); if (ci === undefined) break;
          const ok = r => (!run.plan.zeroContext || (!r.back.length && !r.ahead.length)) && r.input.length + 1 === glyphs.length;
          if (st.fmt === 1) { for (const r of st.sets[ci] || []) if (ok(r) && r.input.every((c, k) => c === glyphs[k + 1])) return true; }
          else if (st.fmt === 2) { const cls = st.cd.get(g0) || 0; for (const r of st.sets[cls] || []) if (ok(r) && r.input.every((c, k) => (st.cd.get(glyphs[k + 1]) || 0) === c)) return true; }
          else if (ok(st) && st.input.every((c, k) => c.has(glyphs[k + 1]))) return true;
          break;
        }
      }
    }
  }
  return false;
}
function indicFindSyllables(buf) {
  const s = buf.map(x => IC_LETTER[x.ic] || 'x').join('');
  let i = 0, serial = 1, broken = false;
  while (i < s.length) {
    let best = 0, type = 5;
    for (const [t, re] of INDIC_SYL) { re.lastIndex = i; const m = re.exec(s); if (m && m[0].length > best) { best = m[0].length; type = t; } }
    if (best === 0) { best = 1; type = 5; }
    if (type === 4) broken = true;
    for (let k = i; k < i + best; k++) buf[k].syl = (serial << 4) | type;
    serial = serial === 15 ? 1 : serial + 1;
    i += best;
  }
  return broken;
}
function forEachSyllable(buf, fn) {
  let start = 0;
  while (start < buf.length) {
    let end = start + 1;
    while (end < buf.length && buf[end].syl === buf[start].syl) end++;
    const r = fn(start, end);
    start = typeof r === 'number' ? r : end;
  }
}
function indicInitial(run) {
  const { plan, font } = run, buf = run.buf;
  // consonants that have below- or post-base forms in this font
  if (plan.virama) for (const x of buf) {
    if (x.ip !== IP.BASE_C) continue;
    const gl = [plan.virama, x.g, plan.virama];
    if (indicWould(run, plan.would.blwf, gl.slice(0, 2)) || indicWould(run, plan.would.blwf, gl.slice(1)) || indicWould(run, plan.would.vatu, gl.slice(0, 2)) || indicWould(run, plan.would.vatu, gl.slice(1))) x.ip = IP.BELOW_C;
    else if (indicWould(run, plan.would.pstf, gl.slice(0, 2)) || indicWould(run, plan.would.pstf, gl.slice(1))) x.ip = IP.POST_C;
    else if (indicWould(run, plan.would.pref, gl.slice(0, 2)) || indicWould(run, plan.would.pref, gl.slice(1))) x.ip = IP.POST_C;
    else x.ip = IP.BASE_C;
  }
  // broken clusters get a dotted circle, as the browser shows
  if (run.broken) {
    const dc = font.glyph(0x25CC);
    if (dc) {
      let last = 0;
      for (let i = 0; i < buf.length; i++) {
        const x = buf[i];
        if (x.syl !== last && (x.syl & 15) === 4) {
          last = x.syl;
          const d = mkInfo(font, 0x25CC, dc, x.cl, '');
          d.ic = IC.DC; d.ip = IP.END; d.syl = x.syl; d.mask = x.mask; d.props = 0;
          buf.splice(i, 0, d);
          i++;
        }
      }
    }
  }
  forEachSyllable(buf, (start, end) => {
    const type = buf[start].syl & 15;
    if (type === 0 || type === 1 || type === 2 || type === 4) indicReorderSyllable(run, start, end);
  });
}
function indicReorderSyllable(run, start, end) {
  const { plan } = run, info = run.buf;
  const isCons = x => IC_CONS.has(x.ic), isJoiner = x => x.ic === IC.ZWJ || x.ic === IC.ZWNJ;
  let base = end, hasReph = false;
  let limit = start;
  const mRphf = plan.m('rphf');
  if (mRphf && start + 3 <= end && !isJoiner(info[start + 2])) {
    if (indicWould(run, plan.would.rphf, [info[start].g, info[start + 1].g])) {
      limit += 2;
      while (limit < end && isJoiner(info[limit])) limit++;
      base = start; hasReph = true;
    }
  }
  {
    let i = end, seenBelow = false;
    do {
      i--;
      if (isCons(info[i])) {
        if (info[i].ip !== IP.BELOW_C && (info[i].ip !== IP.POST_C || seenBelow)) { base = i; break; }
        if (info[i].ip === IP.BELOW_C) seenBelow = true;
        base = i;
      } else if (start < i && info[i].ic === IC.ZWJ && info[i - 1].ic === IC.H) break;
    } while (i > limit);
  }
  if (hasReph && base === start && limit - base <= 2) hasReph = false;
  for (let i = start; i < base; i++) info[i].ip = Math.min(IP.PRE_C, info[i].ip);
  if (base < end) info[base].ip = IP.BASE_C;
  for (let i = base + 1; i < end; i++) if (info[i].ic === IC.M) { for (let j = i + 1; j < end; j++) if (isCons(info[j])) { info[j].ip = IP.FINAL_C; break; } break; }
  if (hasReph) info[start].ip = IP.RA_REPH;
  if (plan.oldSpec) {
    for (let i = base + 1; i < end; i++) if (info[i].ic === IC.H) {
      let j;
      for (j = end - 1; j > i; j--) if (isCons(info[j])) break;
      if (info[j].ic !== IC.H && j > i) { const t = info[i]; info.splice(i, 1); info.splice(j, 0, t); }
      break;
    }
  }
  {
    let last = IP.START;
    for (let i = start; i < end; i++) {
      const c = info[i].ic;
      if (c === IC.ZWJ || c === IC.ZWNJ || c === IC.N || c === IC.RS || c === IC.CM || c === IC.H) {
        info[i].ip = last;
        if (c === IC.H && info[i].ip === IP.PRE_M) {
          for (let j = i; j > start; j--) if (info[j - 1].ip !== IP.PRE_M) { info[i].ip = info[j - 1].ip; break; }
        }
      } else if (info[i].ip !== IP.SMVD) {
        if (c === IC.MPst && i > start && info[i - 1].ic === IC.SM) info[i - 1].ip = info[i].ip;
        last = info[i].ip;
      }
    }
  }
  {
    let last = base;
    for (let i = base + 1; i < end; i++) {
      if (isCons(info[i])) { for (let j = last + 1; j < i; j++) if (info[j].ip < IP.SMVD) info[j].ip = info[i].ip; last = i; }
      else if (info[i].ic === IC.M || info[i].ic === IC.MPst) last = i;
    }
  }
  // stable sort by position, then flip a run of left matras back into typed order
  const part = info.slice(start, end).map((x, k) => [x, k]);
  part.sort((a, b) => a[0].ip - b[0].ip || a[1] - b[1]);
  for (let k = 0; k < part.length; k++) info[start + k] = part[k][0];
  base = end;
  let firstL = end, lastL = end;
  for (let i = start; i < end; i++) {
    if (info[i].ip === IP.BASE_C) { base = i; break; }
    if (info[i].ip === IP.PRE_M) { if (firstL === end) firstL = i; lastL = i; }
  }
  if (firstL < lastL) {
    const rev = (a, b) => { const s = info.slice(a, b).reverse(); for (let k = 0; k < s.length; k++) info[a + k] = s[k]; };
    rev(firstL, lastL + 1);
    let i = firstL;
    for (let j = i; j <= lastL; j++) if (info[j].ic === IC.M || info[j].ic === IC.MPst) { rev(i, j + 1); i = j + 1; }
  }
  // masks
  for (let i = start; i < end && info[i].ip === IP.RA_REPH; i++) info[i].mask |= plan.m('rphf');
  let mask = plan.m('half');
  if (!plan.oldSpec) mask |= plan.m('blwf');
  for (let i = start; i < base; i++) info[i].mask |= mask;
  mask = plan.m('blwf') | plan.m('abvf') | plan.m('pstf');
  for (let i = base + 1; i < end; i++) info[i].mask |= mask;
  const mPref = plan.m('pref');
  if (mPref && base + 2 < end) {
    for (let i = base + 1; i + 1 < end; i++) if (indicWould(run, plan.would.pref, [info[i].g, info[i + 1].g])) { info[i].mask |= mPref; info[i + 1].mask |= mPref; break; }
  }
  for (let i = start + 1; i < end; i++) if (isJoiner(info[i])) {
    const nonJoiner = info[i].ic === IC.ZWNJ;
    let j = i;
    do { j--; if (nonJoiner) info[j].mask &= ~plan.m('half'); } while (j > start && !isCons(info[j]));
  }
}
function indicFinal(run) {
  const { plan } = run, buf = run.buf;
  if (plan.virama) for (const x of buf) if (x.g === plan.virama && (x.props & GP.LIGATED) && (x.props & GP.MULT)) { x.ic = IC.H; x.props &= ~(GP.LIGATED | GP.MULT); }
  forEachSyllable(buf, (start, end) => { indicFinalSyllable(run, start, end); });
}
function indicFinalSyllable(run, start, end) {
  const { plan } = run, info = run.buf;
  const isJoiner = x => x.ic === IC.ZWJ || x.ic === IC.ZWNJ, isHalant = x => x.ic === IC.H;
  const ligatedOnly = x => (x.props & GP.LIGATED) && !(x.props & GP.MULT);
  const mPref = plan.m('pref');
  let tryPref = !!mPref;
  let base;
  for (base = start; base < end; base++) {
    if (info[base].ip >= IP.BASE_C) {
      if (tryPref && base + 1 < end) {
        for (let i = base + 1; i < end; i++) if (info[i].mask & mPref) {
          if (!((info[i].props & GP.SUBST) && ligatedOnly(info[i]))) {
            base = i;
            while (base < end && isHalant(info[base])) base++;
            if (base < end) info[base].ip = IP.BASE_C;
            tryPref = false;
          }
          break;
        }
        if (base === end) break;
      }
      if (start < base && info[base].ip > IP.BASE_C) base--;
      break;
    }
  }
  if (base === end && start < base && info[base - 1].ic === IC.ZWJ) base--;
  if (base < end) while (start < base && (info[base].ic === IC.N || info[base].ic === IC.H)) base--;
  // pre-base matra moves after the last half form
  if (start + 1 < end && start < base) {
    let newPos = base === end ? base - 2 : base - 1;
    for (;;) {
      while (newPos > start && !(info[newPos].ic === IC.M || info[newPos].ic === IC.MPst || info[newPos].ic === IC.H)) newPos--;
      if (isHalant(info[newPos]) && info[newPos].ip !== IP.PRE_M) {
        if (newPos + 1 < end && info[newPos + 1].ic === IC.ZWJ && newPos > start) { newPos--; continue; }
      } else newPos = start;
      break;
    }
    if (start < newPos && info[newPos].ip !== IP.PRE_M) {
      for (let i = newPos; i > start; i--) if (info[i - 1].ip === IP.PRE_M) {
        const old = i - 1;
        if (old < base && base <= newPos) base--;
        const t = info[old]; info.splice(old, 1); info.splice(newPos, 0, t);
        newPos--;
      }
    }
  }
  // reph moves to its place after the base
  if (start + 1 < end && info[start].ip === IP.RA_REPH && ((info[start].ic === IC.Repha) !== !!ligatedOnly(info[start]))) {
    let newPos;
    const move = () => { const t = info[start]; info.splice(start, 1); info.splice(newPos, 0, t); if (start < base && base <= newPos) base--; };
    newPos = start + 1;
    while (newPos < base && !isHalant(info[newPos])) newPos++;
    if (newPos < base && isHalant(info[newPos])) { if (newPos + 1 < base && isJoiner(info[newPos + 1])) newPos++; move(); }
    else {
      // Bangla: reph after sub-base forms (before post-base consonants, matras and modifiers)
      newPos = base;
      while (newPos + 1 < end && !(info[newPos + 1].ip === IP.POST_C || info[newPos + 1].ip === IP.AFTER_POST || info[newPos + 1].ip === IP.SMVD)) newPos++;
      if (newPos < end) move();
      else {
        newPos = end - 1;
        while (newPos > start && info[newPos].ip === IP.SMVD) newPos--;
        if (isHalant(info[newPos])) for (let i = base + 1; i < newPos; i++) if (info[i].ic === IC.M || info[i].ic === IC.MPst) newPos--;
        move();
      }
    }
  }
  // pre-base reordering consonants
  if (tryPref && base + 1 < end) {
    for (let i = base + 1; i < end; i++) if (info[i].mask & mPref) {
      if (ligatedOnly(info[i])) {
        let newPos = base;
        while (newPos > start && !(info[newPos - 1].ic === IC.M || info[newPos - 1].ic === IC.MPst || info[newPos - 1].ic === IC.H)) newPos--;
        if (newPos > start && isHalant(info[newPos - 1]) && newPos < end && isJoiner(info[newPos])) newPos++;
        const t = info[i]; info.splice(i, 1); info.splice(newPos, 0, t);
        if (newPos <= base && base < i) base++;
      }
      break;
    }
  }
  // 'init' for a left matra at the start of a word
  if (info[start].ip === IP.PRE_M && (!start || !info[start - 1].letterish)) info[start].mask |= plan.m('init');
}

/* ---------- the entry point ---------- */
/* Shape one run of text (one script, one font). Returns glyphs with advances and offsets in
   font units, and for each glyph the characters it stands for. */
function shapeRun(font, text, script, opts = {}) {
  const indic = script === 'beng';
  const plan = shapePlan(font, script, opts.lang || null, opts);
  const norm = normalizeChars(font, text, indic);
  const buf = norm.map(n => {
    let g = font.glyph(n.cp);
    if (!g && n.cp === 0x2011) g = font.glyph(0x2010) || font.glyph(0x2D);
    if (!g && n.cp === 0xA0) g = font.glyph(0x20);
    return mkInfo(font, n.cp, g, n.cl, n.chars);
  });
  for (const x of buf) x.props = glyphPropsOf(font, x);
  const run = new LayoutRun(font, plan, buf);
  if (indic) for (const x of buf) { const [c, p] = bengaliProps(x.cp); x.ic = c; x.ip = p; }
  const pauseFn = name => {
    if (name === 'syllables') run.broken = indicFindSyllables(run.buf);
    else if (name === 'initial') indicInitial(run);
    else if (name === 'final') indicFinal(run);
  };
  if (plan.gsub) for (const stage of plan.map.stages[0]) {
    for (const look of stage.lookups) run.runGSUB(look);
    if (stage.pause) pauseFn(stage.pause);
  } else if (indic) { pauseFn('syllables'); pauseFn('initial'); pauseFn('final'); }
  const b = run.buf;
  for (const x of b) { x.xa = font.advance(x.g); x.ya = 0; x.xo = 0; x.yo = 0; x.chain = 0; x.atype = 0; }
  if (plan.gpos) for (const stage of plan.map.stages[1]) for (const look of stage.lookups) run.runGPOS(look);
  // legacy kerning table when GPOS has none
  if (plan.kernFallback && !opts.noKern) {
    const kt = font.kernTable();
    if (kt && kt.size) for (let i = 0; i < b.length; i++) {
      if (isMark(b[i])) continue;
      let j = i + 1; while (j < b.length && isMark(b[j])) j++;
      if (j >= b.length) break;
      const k = kt.get(b[i].g * 65536 + b[j].g);
      if (k) b[i].xa += k;
    }
  }
  // Latin-style shaping zeroes the advance of marks, after GPOS (without GPOS the mark
  // keeps hanging over the letter before it)
  if (!indic) for (const x of b) if (isMark(x)) { if (!plan.gpos) x.xo -= x.xa; x.xa = 0; }
  for (const x of b) if (x.ign) x.xa = 0;
  // marks and cursive pieces take the offset of what they attach to
  const done = new Set();
  const prop = (i, depth = 0) => {
    const x = b[i];
    if (!x.chain || done.has(i) || depth > 16) return;
    done.add(i);
    const j = i + x.chain;
    if (j < 0 || j >= b.length) return;
    prop(j, depth + 1);
    if (x.atype === 2) { x.yo += b[j].yo; }
    else {
      x.xo += b[j].xo; x.yo += b[j].yo;
      for (let k = j; k < i; k++) { x.xo -= b[k].xa; x.yo -= b[k].ya; }
    }
  };
  for (let i = 0; i < b.length; i++) prop(i);
  const glyphs = [];
  let width = 0;
  for (const x of b) {
    if (x.ign && !(x.props & GP.SUBST) && (x.g === 0 || !x.xa)) continue;
    glyphs.push({ g: x.g, xa: x.xa, xo: x.xo, yo: x.yo, chars: x.chars, cl: x.cl });
    width += x.xa;
  }
  return { glyphs, width, missing: glyphs.some(g => g.g === 0) };
}

/* split a string into script runs the way Chromium's ScriptRunIterator does: common and
   inherited characters join the run they are in; a common character that belongs to
   particular scripts (the danda, say) only continues a run of one of those scripts */
function scriptRuns(text) {
  const runs = [];
  let cur = null, set = null, pref = 'com';
  const flush = () => { if (cur) { cur.script = set[0] === 'com' ? pref : set[0]; runs.push(cur); } };
  for (const ch of text) {
    const p = ucProps(ch.codePointAt(0));
    const next = p.script === 'inh' ? ['inh'] : p.script === 'com' ? (p.scx.length > 1 ? Array.from(new Set(p.scx)) : p.scx.length === 1 ? ['com', p.scx[0]] : ['com']) : [p.script];
    if (!cur) { cur = { text: ch }; set = next[0] === 'inh' ? ['com'] : next; pref = 'com'; if (set[0] === 'com' && set.length === 2) pref = set[1]; continue; }
    let merge;
    if (next[0] === 'inh' || next[0] === 'com') { merge = true; if (next.length === 2 && set[0] === 'com' && pref === 'com') pref = next[1]; }
    else if (set[0] === 'com') { set = next; merge = true; }
    else if (set.length === 1) merge = next.includes(set[0]);
    else { const both = set.filter(x => next.includes(x)); merge = both.length > 0; if (merge) set = both; }
    if (merge) { cur.text += ch; continue; }
    flush();
    cur = { text: ch }; set = next; pref = 'com';
  }
  flush();
  return runs;
}
