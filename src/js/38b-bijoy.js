/* ===================== Bijoy =====================
   Bijoy is the keyboard most of Bangladesh types Bangla with (UniJoy, its free Unicode twin, puts
   the letters on the same keys). Here it types Unicode: the vowel signs ি ে ৈ are typed before their
   letter and the reph (A) after it, as in Bijoy, or everything in reading order (Options › Bangla).
   g joins letters (j g N = ক্ষ) and, before a vowel sign, makes the vowel itself (g f = আ).

   Documents made with Bijoy are in SutonnyMJ and the other "MJ" fonts: ASCII and Latin-1 codes that
   those fonts draw as Bangla glyphs, kept in the order they are seen (ি before its letter, the reph
   after it). bijoyToUnicode reads such text into Unicode; bijoyFromUnicode writes it back for people
   who still use Bijoy. Pasted text and Word files in those fonts are converted as they come in. */
const BN_ZWJ = '\u200D', BN_ZWNJ = '\u200C', BN_HAS = '্', BN_NUK = '়';
const BN_CONS = 'কখগঘঙচছজঝঞটঠডঢণতথদধনপফবভমযরলশষসহ';
const bnCons = c => !!c && c.length === 1 && BN_CONS.indexOf(c) >= 0;
/* the text ends in a letter a vowel sign can go on (a consonant, or one with its nukta: ড় ঢ় য়) */
const bnEndsLetter = t => { const c = t[t.length - 1]; return bnCons(c) || (c === BN_NUK && bnCons(t[t.length - 2])); };
const BN_FULL_VOWEL = { 'া': 'আ', 'ি': 'ই', 'ী': 'ঈ', 'ু': 'উ', 'ূ': 'ঊ', 'ৃ': 'ঋ', 'ে': 'এ', 'ৈ': 'ঐ', 'ৌ': 'ঔ' };

/* ---------- typing ---------- */
// the keys of the Bijoy layout on a US keyboard; g (join) and A (reph) are handled by bijoyParse
const BJ_KEYS = {
  1: '১', 2: '২', 3: '৩', 4: '৪', 5: '৫', 6: '৬', 7: '৭', 8: '৮', 9: '৯', 0: '০',
  q: 'ঙ', w: 'য', e: 'ড', r: 'প', t: 'ট', y: 'চ', u: 'জ', i: 'হ', o: 'গ', p: 'ড়', '\\': 'ৎ',
  a: 'ৃ', s: 'ু', d: 'ি', f: 'া', h: 'ব', j: 'ক', k: 'ত', l: 'দ',
  z: '্র', x: 'ও', c: 'ে', v: 'র', b: 'ন', n: 'স', m: 'ম',
  Q: 'ং', W: 'য়', E: 'ঢ', R: 'ফ', T: 'ঠ', Y: 'ছ', U: 'ঝ', I: 'ঞ', O: 'ঘ', P: 'ঢ়', '|': 'ঃ',
  S: 'ূ', D: 'ী', F: 'অ', G: '।', H: 'ভ', J: 'খ', K: 'থ', L: 'ধ',
  Z: '্য', X: 'ৌ', C: 'ৈ', V: 'ল', B: 'ণ', N: 'ষ', M: 'শ',
  $: '৳', '&': 'ঁ', '`': '‘', "'": '’', '~': '“', '"': '”',
};
/* The Unicode text for the keys typed since the word began. `before` is the text just before the
   word (a vowel sign typed first goes on its letter); order 'unicode' types everything in reading
   order (UniJoy), otherwise ি ে ৈ come before their letter and the reph after it (Bijoy). */
function bijoyParse(keys, before = '', order = 'bijoy') {
  const old = order !== 'unicode';
  let out = '';
  let cs = -1;          // where the letters being joined start (-1: none)
  let link = false;     // g was pressed: a hasanta waits for a letter (or a vowel sign: the vowel)
  let fk = '', wait = false;  // a vowel sign typed before its letter: still waiting (wait) or riding on it
  let rs = -1;          // the letters a vowel sign just closed (a reph typed after the sign goes before them)
  const flush = () => { if (fk) out += fk; fk = ''; wait = false; };
  for (const key of keys) {
    const was = rs; rs = -1;
    if (key === 'g') {
      if (link) { out += BN_ZWNJ; link = false; cs = -1; flush(); }   // gg: a hasanta that shows
      else { out += BN_HAS; link = true; }
      continue;
    }
    if (key === 'A') {
      if (link) { out = out.slice(0, -1); link = false; }
      if (old && cs >= 0) out = out.slice(0, cs) + 'র্' + out.slice(cs);
      else if (old && was >= 0) { out = out.slice(0, was) + 'র্' + out.slice(was); rs = was; }
      else out += 'র্';   // nothing to go on yet: it joins the next letter
      continue;
    }
    const v = BJ_KEYS[key] != null ? BJ_KEYS[key] : key;
    const full = BN_FULL_VOWEL[v];
    if (link && (full || v === 'ও' || v === 'অ' || v === '।')) {
      // g and a vowel sign: the vowel itself (g f = আ), g G = ॥
      out = out.slice(0, -1); link = false; flush();
      out += full || (v === '।' ? '॥' : v); cs = -1;
      continue;
    }
    if (bnCons(v[0])) {
      if (link) { link = false; wait = false; if (cs < 0) cs = out.length; out += v; }
      else if (fk && wait) { wait = false; cs = out.length; out += v; }
      else { flush(); cs = out.length; out += v; }
      continue;
    }
    if (old && (v === 'ি' || v === 'ে' || v === 'ৈ')) { flush(); fk = v; wait = true; cs = -1; continue; }
    if (full) {
      if (fk) {
        // a sign typed before: ে … া is ো, ে … ৌ is ৌ
        const two = fk === 'ে' && v === 'া' ? 'ো' : fk === 'ে' && v === 'ৌ' ? 'ৌ' : null;
        out += two || fk + v; fk = ''; wait = false;
      } else {
        const t = out || before, last = t[t.length - 1] || '';
        if (v === 'া' && last === 'অ' && out) out = out.slice(0, -1) + 'আ';
        else if ((v === 'া' || v === 'ৌ') && last === 'ে' && out.length > 1) out = out.slice(0, -1) + (v === 'া' ? 'ো' : 'ৌ');
        else if (last === 'ঁ' && out.length > 1 && bnEndsLetter(out.slice(0, -1))) out = out.slice(0, -1) + v + 'ঁ';   // ঁ goes after the sign
        else if (bnEndsLetter(t)) out += v;
        else out += full;   // no letter before it: the vowel
      }
      if (cs >= 0) rs = cs;
      cs = -1;
      continue;
    }
    if (v === '্র' || v === '্য') {
      if (link) { out = out.slice(0, -1); link = false; }
      out += v === '্য' && cs >= 0 && out.slice(cs) === 'র' ? BN_ZWJ + v : v;   // য-ফলা on র takes a joiner, or it would read as a reph
      continue;
    }
    link = false;   // a hasanta before anything else stays (it shows)
    flush();
    out += v; cs = -1;
  }
  return out + fk;
}

/* ---------- SutonnyMJ (Bijoy's ANSI text) → Unicode ---------- */
const BJ_REPH = '\uE0A9';   // the reph glyph while it is moved to its letter
const BJ_ANSI = {
  A: 'অ', B: 'ই', C: 'ঈ', D: 'উ', E: 'ঊ', F: 'ঋ', G: 'এ', H: 'ঐ', I: 'ও', J: 'ঔ',
  K: 'ক', L: 'খ', M: 'গ', N: 'ঘ', O: 'ঙ', P: 'চ', Q: 'ছ', R: 'জ', S: 'ঝ', T: 'ঞ', U: 'ট', V: 'ঠ', W: 'ড', X: 'ঢ', Y: 'ণ', Z: 'ত', _: 'থ', '`': 'দ',
  a: 'ধ', b: 'ন', c: 'প', d: 'ফ', e: 'ব', f: 'ভ', g: 'ম', h: 'য', i: 'র', j: 'ল', k: 'শ', l: 'ষ', m: 'স', n: 'হ', o: 'ড়', p: 'ঢ়', q: 'য়', r: 'ৎ', s: 'ং', t: 'ঃ', u: 'ঁ',
  v: 'া', w: 'ি', x: 'ী', y: 'ু', z: 'ু', '~': 'ূ', '‚': 'ূ', 'ƒ': 'ূ', '„': 'ৃ', '‡': 'ে', '†': 'ে', '‰': 'ৈ', 'ˆ': 'ৈ', 'Š': 'ৗ',
  0: '০', 1: '১', 2: '২', 3: '৩', 4: '৪', 5: '৫', 6: '৬', 7: '৭', 8: '৮', 9: '৯',
  '|': '।', '\\': '॥', $: '৳', 'Ò': '“', 'Ó': '”', 'Ô': '‘', 'Õ': '’', 'Ñ': '—',
  // a letter joined to the next (half forms)
  '¯': 'স্', '®': 'ষ্', '¤': 'ম্', '˜': 'দ্', '™': 'দ্', 'š': 'ন্', '›': 'ন্',
  // a letter joined to the one before (second halves)
  '^': '্ব', '¡': '্ব', '¦': '্ব', 'Ÿ': '্ব', '¢': '্ভ', '£': '্ভ্র', '¥': '্ম', '§': '্ম', '¨': '্য', 'ª': '্র', '«': '্র', 'Ö': '্র',
  '¬': '্ল', '\u00AD': '্ল', '\u2212': '্ল', 'œ': '্ন', 'è': '্ণ', 'ú': '্প', '‹': '্ক', 'Œ': '্ক্র', '¿': '্ত্র',
  // whole conjuncts
  '¶': 'ক্ষ', 'ÿ': 'ক্ষ', '´': 'ক্ম', 'µ': 'ক্র', '¸': 'গু', '¹': 'গ্গ', 'º': 'গ্দ', '»': 'গ্ধ', '¼': 'ঙ্ক', '½': 'ঙ্গ', '¾': 'জ্জ',
  'À': 'জ্ঝ', 'Á': 'জ্ঞ', 'Â': 'ঞ্চ', 'Ã': 'ঞ্ছ', 'Ä': 'ঞ্জ', 'Å': 'ঞ্ঝ', 'Æ': 'ট্ট', 'Ç': 'ড্ড', 'È': 'ণ্ট', 'É': 'ণ্ঠ', 'Ê': 'ণ্ড',
  'Ë': 'ত্ত', 'Ì': 'ত্থ', 'Î': 'ত্র', 'Ï': 'দ্দ', '×': 'দ্ধ', 'Ø': 'দ্ব', 'Ù': 'দ্ম', 'Ú': 'ন্ঠ', 'Û': 'ন্ড', 'Ü': 'ন্ধ', 'Ý': 'ন্স',
  'Þ': 'প্ট', 'ß': 'প্ত', 'à': 'প্প', 'á': 'প্স', 'â': 'ব্জ', 'ã': 'ব্দ', 'ä': 'ব্ধ', 'å': 'ভ্র', 'ç': 'ম্ফ', 'é': 'ল্ক', 'ê': 'ল্গ',
  'ë': 'ল্ট', 'ì': 'ল্ড', 'í': 'ল্প', 'î': 'ল্ফ', 'ï': 'শু', 'ð': 'শ্চ', 'ñ': 'শ্ছ', 'ò': 'ষ্ণ', 'ó': 'ষ্ট', 'ô': 'ষ্ঠ', 'õ': 'ষ্ফ',
  'ö': 'স্খ', '÷': 'স্ট', 'ù': 'স্ফ', 'û': 'হু', 'ü': 'হৃ', 'ý': 'হ্ন', 'þ': 'হ্ম',
};
// codes that are also ordinary typography: what they are depends on the glyph beside them
const BJ_AFTER_LETTER = { '“': 'ু', '–': 'ু', '…': 'ৃ', '©': BJ_REPH, '—': '্ত', '‘': '্তু', '’': '্থ' };
const BJ_BEFORE_LETTER = { '”': 'চ্', '•': 'ঙ্' };
const BJ_NOT_AFTER_DIGIT = { '°': 'ক্ক', '±': 'ক্ট', '²': 'ক্ষ্ম', '³': 'ক্ত', '·': 'ক্স' };
/* is ch a code SutonnyMJ draws as (part of) a letter? */
function bjLetterCode(ch) {
  if (!ch) return false;
  if (/[A-Za-z`_]/.test(ch)) return true;
  const u = BJ_ANSI[ch] || BJ_AFTER_LETTER[ch] || BJ_BEFORE_LETTER[ch] || BJ_NOT_AFTER_DIGIT[ch] || (/[æøÐÍ&]/.test(ch) ? 'ক' : '');
  return !!u && /[ঁ-ৗ\uE0A9]/.test(u) && !/^[০-৯।॥৳]$/.test(u);
}
function bijoyToUnicode(s) {
  // Bangla already in Unicode stays as it is
  return String(s || '').split(/([\u0980-\u09FF\u200C\u200D]+)/).map((part, i) => i % 2 || !part ? part : bjAnsiToUnicode(part)).join('');
}
function bjAnsiToUnicode(s) {
  const a = [];   // the Unicode text, one code unit per entry
  const push = u => { for (const c of u) a.push(c); };
  const tail = () => a[a.length - 1] || '';
  const joinable = () => { const c = tail(); return bnCons(c) || c === BN_NUK || c === BN_HAS; };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i], prev = s[i - 1] || '', next = s[i + 1] || '';
    let u;
    if (ch === 'æ') u = tail() === 'র' ? 'ু' : 'ম্ন';          // ু beside র (রু, প্রু); ম্ন in older fonts
    else if (ch === 'ø') u = joinable() ? '্ল' : 'স্ন';        // ্ল after a letter (উল্লাহ); স্ন in older fonts
    else if (ch === 'Ð') u = bjLetterCode(prev) ? 'ণ্ড' : '–';
    else if (ch === 'Í') u = joinable() ? '্ত' : 'ত্ম';
    else if (ch === '&') u = BN_HAS + (bjLetterCode(next) && next !== '&' ? BN_ZWNJ : '');   // a hasanta that shows
    else if (ch === '¨' && tail() === 'র' && a[a.length - 2] !== BN_HAS) u = BN_ZWJ + '্য';   // য-ফলা on র (with a joiner, so it isn't a reph)
    else if (BJ_AFTER_LETTER[ch]) u = bjLetterCode(prev) ? BJ_AFTER_LETTER[ch] : ch;
    else if (BJ_BEFORE_LETTER[ch]) u = bjLetterCode(next) ? BJ_BEFORE_LETTER[ch] : ch;
    else if (BJ_NOT_AFTER_DIGIT[ch]) u = /\d/.test(prev) ? ch : BJ_NOT_AFTER_DIGIT[ch];
    else u = BJ_ANSI[ch] != null ? BJ_ANSI[ch] : ch;
    push(u);
  }
  let t = a.join('').replace(/্্+/g, BN_HAS).replace(/অা/g, 'আ');
  return bnReorder(t);
}
/* Bijoy keeps glyphs in the order they are seen; Unicode wants the order they are read: the reph
   before its letters, ি ে ৈ after them (ে … া is ো, ে … ৗ is ৌ), ঁ after the vowel sign. */
function bnReorder(t) {
  const a = Array.from(t);
  const isC = i => bnCons(a[i]);
  // the letters ending at i (a consonant, its nukta, consonants joined by hasantas): their start
  const clusterStart = i => {
    let j = i;
    if (a[j] === BN_NUK) j--;
    if (!isC(j)) return -1;
    while (a[j - 1] === BN_HAS) {
      if (isC(j - 2)) j -= 2;
      else if (a[j - 2] === BN_NUK && isC(j - 3)) j -= 3;
      else if (a[j - 2] === BN_ZWJ && a[j - 3] === 'র') j -= 3;   // র + joiner + ্য
      else break;
    }
    return j;
  };
  // the letters starting at i: the index after them
  const clusterEnd = i => {
    if (!isC(i)) return -1;
    let j = i + 1;
    for (;;) {
      if (a[j] === BN_NUK) j++;
      if (a[j] === BN_HAS && isC(j + 1)) { j += 2; continue; }
      if ((a[j] === BN_ZWJ && a[j + 1] === BN_HAS || a[j] === BN_HAS && a[j + 1] === BN_ZWJ) && isC(j + 2)) { j += 3; continue; }
      break;
    }
    return j;
  };
  // 1. the reph goes before the letters it sits on (past one vowel sign typed before it)
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== BJ_REPH) continue;
    let k = i - 1;
    if (/[ািীুূৃৗ]/.test(a[k] || '')) k--;
    let st = k >= 0 ? clusterStart(k) : -1;
    if (st < 0 && k === i - 1 && /[অ-ঔ]/.test(a[k] || '')) st = k;   // over a vowel: নৈর্ঋত
    a.splice(i, 1);
    if (st < 0) { a.splice(i, 0, 'র', BN_HAS); i++; continue; }
    a.splice(st, 0, 'র', BN_HAS);
    i++;
  }
  // 2. ি ে ৈ go after the letters that follow them
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k !== 'ি' && k !== 'ে' && k !== 'ৈ') continue;
    const end = clusterEnd(i + 1);
    if (end < 0) continue;
    a.splice(i, 1);
    let at = end - 1;   // where the sign goes now
    if (k === 'ে' && (a[at] === 'া' || a[at] === 'ৗ')) { a[at] = a[at] === 'া' ? 'ো' : 'ৌ'; }
    else a.splice(at, 0, k);
    i = at;
  }
  // 3. ঁ after the vowel sign
  for (let i = 0; i < a.length - 1; i++) if (a[i] === 'ঁ' && /[ািীুূৃেৈোৌৗ]/.test(a[i + 1])) { a[i] = a[i + 1]; a[i + 1] = 'ঁ'; }
  return a.join('');
}

/* ---------- Unicode → SutonnyMJ ---------- */
const BJ_LETTER_OUT = {};
for (const [k, v] of Object.entries(BJ_ANSI)) if (v.length <= 2 && /^[অ-হ]়?$/.test(v) && !BJ_LETTER_OUT[v]) BJ_LETTER_OUT[v] = k;
Object.assign(BJ_LETTER_OUT, { 'আ': 'Av', 'ৎ': 'r', 'ং': 's', 'ঃ': 't', 'ঁ': 'u', '।': '|', '॥': '\\', '৳': '$', '“': 'Ò', '”': 'Ó', '‘': 'Ô', '’': 'Õ' });
for (let d = 0; d < 10; d++) BJ_LETTER_OUT[String.fromCharCode(0x09E6 + d)] = String(d);
// whole-conjunct glyphs (checked longest first)
const BJ_CONJ_OUT = {};
for (const [k, v] of Object.entries(BJ_ANSI)) if (k.length === 1 && /^[ক-হ]়?(্[ক-হ]়?)+$/.test(v) && !/[¯®¤˜™š›]/.test(k) && !BJ_CONJ_OUT[v]) BJ_CONJ_OUT[v] = k;
Object.assign(BJ_CONJ_OUT, { 'ক্ষ্ম': '²', 'ক্ক': '°', 'ক্ট': '±', 'ক্ত': '³', 'ক্স': '·', 'ক্ষ': '¶', 'ঙ্ক্ষ': '•¶', 'ক্ষ্ণ': '¶è', 'শ্ত': 'kÍ', 'ত্ম': 'Z¥' });
// a letter that joins the next one: its half form, and the letters it does that before
const BJ_HALF_OUT = { 'স': ['¯', 'কতথনপবমল'], 'ষ': ['®', 'কপমব'], 'ম': ['¤', 'নপবভমল'], 'ঙ': ['•', 'খঘম'], 'চ': ['”', 'চছঞব'], 'দ': [null, 'গঘভ'], 'ন': [null, 'তথবটদ'] };
// a letter joined to the one before: the second half after a half form, and after a whole letter
const BJ_SECOND = { 'ক': '‹', 'ত': 'Í', 'থ': '’', 'ন': 'œ', 'প': 'ú', 'ব': '^', 'ভ': '¢', 'ম': '§', 'ল': 'ø', 'ণ': 'è', 'য': '¨' };
const BJ_BLR = 'খগঘণথদধনপবমযরলশষসহ';   // letters with their stem at the right: ু ূ ৃ hang there
function bjSecondAfterFull(prevU, c) {
  switch (c) {
    case 'ন': return 'œ';
    case 'ণ': return 'è';
    case 'ম': return '¥';
    case 'য': return '¨';
    case 'ব': return 'ধবহ'.includes(prevU) ? 'Ÿ' : 'শগণলষপ'.includes(prevU) ? '¦' : '¡';
    case 'ল': return 'কফহ'.includes(prevU) ? '¬' : 'ø';
  }
  return null;
}
/* the glyphs for one cluster: letters joined by hasantas, as an array of letters ('য়' with its nukta) */
function bjCluster(L) {
  let out = '', i = 0, prevKind = '', prevU = '';
  const n = L.length;
  while (i < n) {
    // a whole-conjunct glyph
    let hit = 0;
    for (let k = Math.min(3, n - i); k >= 2; k--) {
      const key = L.slice(i, i + k).join(BN_HAS);
      // after a half form only these whole glyphs follow (ন্দ্ব ›Ø); others take second halves (ন্ত্র š¿)
      if (BJ_CONJ_OUT[key] && (prevKind !== 'half' || key === 'দ্ব' || key === 'ক্ষ')) { out += BJ_CONJ_OUT[key]; hit = k; break; }
    }
    if (hit) { prevU = L[i + hit - 1]; prevKind = 'full'; i += hit; continue; }
    const c = L[i];
    if (i === 0 || prevKind === '') {
      // the first letter: a half form when one is made before the next letter
      const hf = BJ_HALF_OUT[c], nx = L[i + 1];
      if (hf && nx && hf[1].includes(nx) && !(c === 'ম' && nx === 'ফ')) {
        out += hf[0] || (c === 'দ' ? ('গঘ'.includes(nx) ? '˜' : '™') : ('তথব'.includes(nx) ? 'š' : '›'));
        prevKind = 'half'; prevU = c; i++; continue;
      }
      out += BJ_LETTER_OUT[c] || c; prevKind = 'full'; prevU = c; i++; continue;
    }
    // a letter joined to the one before
    if (c === 'র') {
      // ্র: Ö under প গ শ, « under ফ ছ হ and some conjuncts, ª elsewhere
      const g = out[out.length - 1];
      out += 'cMk'.includes(g) && prevKind === 'full' ? 'Ö' : 'dQn³¼ÜîË'.includes(g) ? '«' : 'ª';
      prevU = c; prevKind = 'second'; i++; continue;
    }
    if (prevKind === 'half') {
      const nx = L[i + 1];
      if (c === 'ত' && nx === 'র') { out += '¿'; prevU = 'র'; prevKind = 'second'; i += 2; continue; }
      if (c === 'ক' && nx === 'র') { out += 'Œ'; prevU = 'র'; prevKind = 'second'; i += 2; continue; }
      if (c === 'ভ' && nx === 'র') { out += '£'; prevU = 'র'; prevKind = 'second'; i += 2; continue; }
      if (c === 'প' && nx === 'র') { out += 'c'; prevU = c; prevKind = 'full'; i++; continue; }   // স্প্র: ¯cÖ
      if (BJ_SECOND[c] && !(c === 'ম' && prevU === 'ঙ')) { out += c === 'ম' && 'মষসচদন'.includes(prevU) ? '§' : BJ_SECOND[c]; prevU = c; prevKind = 'second'; i++; continue; }
      out += BJ_LETTER_OUT[c] || c; prevU = c; prevKind = 'full'; i++; continue;
    }
    const sec = bjSecondAfterFull(prevU, c) || (c === 'ত' && prevU === 'শ' ? 'Í' : prevKind === 'second' && BJ_SECOND[c] && c !== 'য' ? BJ_SECOND[c] : null);
    if (sec) { out += sec; prevU = c; prevKind = 'second'; i++; continue; }
    // no glyph joins these two: the hasanta shows
    out += '&' + (BJ_LETTER_OUT[c] || c); prevU = c; prevKind = 'full'; i++;
  }
  return out;
}
function bijoyFromUnicode(u) {
  // one form for each letter: ড় ঢ় য় as letter + nukta, ো ৌ as ে + া / ে + ৗ (ে goes before its letter)
  const s = String(u || '').replace(/\u09DC/g, '\u09A1\u09BC').replace(/\u09DD/g, '\u09A2\u09BC').replace(/\u09DF/g, '\u09AF\u09BC').replace(/\u09CB/g, '\u09C7\u09BE').replace(/\u09CC/g, '\u09C7\u09D7');
  const A = Array.from(s);
  let out = '', i = 0;
  const isC = j => bnCons(A[j]);
  while (i < A.length) {
    const ch = A[i];
    let reph = false, j = i;
    if (ch === 'র' && A[i + 1] === BN_HAS && isC(i + 2)) { reph = true; j = i + 2; }
    else if (ch === 'র' && A[i + 1] === BN_HAS && /[অ-ঔ]/.test(A[i + 2] || '')) { out += (BJ_LETTER_OUT[A[i + 2]] || A[i + 2]) + '©'; i += 3; continue; }   // নৈর্ঋত
    if (!isC(j)) {
      // not a letter: a vowel, a sign, a digit, punctuation
      if (ch === BN_HAS) { out += '&'; i += A[i + 1] === BN_ZWNJ ? 2 : 1; continue; }
      if (ch === BN_ZWJ || ch === BN_ZWNJ) { i++; continue; }
      if (/[অ-ঔ]/.test(ch) && A[i + 1] === BN_HAS && A[i + 2] === 'য') { out += (BJ_LETTER_OUT[ch] || ch) + '¨'; i += 3; continue; }   // অ্যা: A¨v
      if (ch === 'ে' || ch === 'ৈ') { out += ch === 'ে' ? '‡' : '‰'; i++; continue; }
      if (ch === 'ি') { out += 'w'; i++; continue; }
      if (ch === 'া' || ch === 'ী' || ch === 'ৗ') { out += { 'া': 'v', 'ী': 'x', 'ৗ': 'Š' }[ch]; i++; continue; }
      if (ch === 'ু' || ch === 'ূ' || ch === 'ৃ') { out += { 'ু': 'y', 'ূ': '~', 'ৃ': '„' }[ch]; i++; continue; }
      out += BJ_LETTER_OUT[ch] != null ? BJ_LETTER_OUT[ch] : ch;
      i++;
      continue;
    }
    // the letters of one cluster
    const L = [];
    let raZwj = false;
    for (;;) {
      let c = A[j];
      if (A[j + 1] === BN_NUK) { c += BN_NUK; j++; }
      L.push(c); j++;
      if (A[j] === BN_HAS && isC(j + 1)) { j++; continue; }
      if ((A[j] === BN_ZWJ || A[j] === BN_ZWNJ) && A[j + 1] === BN_HAS && A[j + 2] === 'য' && c === 'র') { raZwj = true; j += 3; break; }   // য-ফলা on র, with a joiner (or the older non-joiner)
      if (A[j] === BN_HAS && A[j + 1] === BN_ZWJ && isC(j + 2)) { j += 2; continue; }
      break;
    }
    // its vowel signs and ঁ
    let pre = '', post = [];
    while (/[ািীুূৃেৈৗ]/.test(A[j] || '')) { if (/[িেৈ]/.test(A[j]) && !pre && !post.length) pre = A[j]; else post.push(A[j]); j++; }
    let chandra = '';
    if (A[j] === 'ঁ') { chandra = 'u'; j++; }
    let body = bjCluster(L) + (raZwj ? '¨' : '');
    if (raZwj && L.length === 1) body = 'i¨';
    const last = L[L.length - 1].replace(BN_NUK, ''), only = L.length === 1 && !raZwj ? L[0] : '';
    const ra = last === 'র' && !raZwj;
    // ু ূ ৃ take the shape that fits the letter they hang from
    const kars = post.map(k => {
      if (k === 'া') return 'v';
      if (k === 'ী') return 'x';
      if (k === 'ৗ') return 'Š';
      if (k === 'ু') {
        if (only === 'গ') { body = '¸'; return ''; }
        if (only === 'শ') { body = 'ï'; return ''; }
        if (only === 'হ') { body = 'û'; return ''; }
        if (/[¯š]Í$/.test(body)) { body = body.slice(0, -1) + '‘'; return ''; }
        if (body.endsWith('µ')) return 'z';
        if (ra) return 'æ';   // রু, প্রু (Bijoy's own; older fonts drew it with “)
        if (/^[\u09A1\u09A2]\u09BC$/.test(L[L.length - 1])) return '–';   // ড়ু ঢ়ু
        return BJ_BLR.includes(last) || last === 'জ' ? 'y' : 'z';
      }
      if (k === 'ূ') return ra ? 'ƒ' : BJ_BLR.includes(last) || last === 'জ' ? '~' : '‚';
      if (k === 'ৃ') { if (only === 'হ') { body = 'ü'; return ''; } return BJ_BLR.includes(last) ? '„' : '…'; }
      return k;
    }).join('');
    const preG = pre === 'ি' ? 'w' : pre === 'ে' ? '‡' : pre === 'ৈ' ? '‰' : '';
    out += preG + body + (reph ? '©' : '') + kars + chandra;
    i = j;
  }
  return out;
}

/* ---------- telling Bijoy text from English ---------- */
const BJ_FONT_RE = /(?:^|[^o])mj$|ansi$|^nikosh.*ban$/i;
/* a font that draws Bijoy's ANSI codes as Bangla (SutonnyMJ, SulekhaMJ, NikoshBAN, Kalpurush ANSI…);
   SutonnyOMJ is Unicode */
function isBijoyFont(name) { const n = String(name || '').trim().replace(/^["']|["']$/g, '').replace(/\s+/g, ''); return !!n && BJ_FONT_RE.test(n); }
const BJ_EN_WORDS = new Set('a an the and or of for to in on at by with from as is are was were be been it its this that these those not no yes we you he she they i my our your his her their me us them all any some can will would should may must have has had do does did if then than so but about into over under after before more most new one two three per via page date name total no sl dear sir madam sincerely yours regards subject ref office government ministry department bangladesh dhaka'.split(' '));
/* does a text look like Bijoy codes rather than English? { bijoy, words, score } */
const BJ_STRONG = /[‡†‰ˆ¯®¤š›œŸ¡¢£¥¦§¨ª«¬ÖÿŠ‹Œ„‚ƒ]/;
function bijoyScore(text) {
  const s = String(text || '');
  if (/[\u0980-\u09FF]/.test(s)) return { bijoy: false, words: 0, score: 0, unicode: true };
  const words = s.split(/[\s,.;:!?()[\]{}"<>/|-]+/).filter(w => /[A-Za-z]/.test(w) || /[^\x00-\x7F]/.test(w));
  const n = words.length;
  if (!n) return { bijoy: false, words: 0, score: 0 };
  let strong = 0, weak = 0, camel = 0, wfirst = 0, en = 0, letters = 0, v = 0;
  for (const w of words) {
    if (BJ_EN_WORDS.has(w.toLowerCase()) && !/[a-z][A-Z]/.test(w)) en++;
    const lat1 = /[A-Za-z`]/.test(w) && /[\u00C0-\u00FF©“”‘’–…]/.test(w.slice(1));
    // a Latin-1 letter is Bijoy too when the word has Bijoy's other marks (Avãyj, Rvwm©i)
    if (/[A-Za-z`]/.test(w) && (BJ_STRONG.test(w) || lat1 && /v[A-Za-z`]|[A-Za-z`]v|[a-z][A-Z]|^w/.test(w))) strong++;
    else if (lat1) weak++;
    if (/[a-z][A-Z]/.test(w)) camel++;
    if (/^w[A-Za-z`]/.test(w)) wfirst++;
    for (const c of w) { if (/[A-Za-z]/.test(c)) letters++; if (c === 'v') v++; }
  }
  const vRate = letters ? v / letters : 0;
  // codes no English text has, next to letters; or, in a longer text, Bijoy's commonest codes:
  // v (া) everywhere, w (ি) starting words, capitals inside words (MvB)
  const score = (strong + weak * 0.5) / n;
  const bijoy = en / n < 0.5 && ((strong >= 1 && score >= 0.25) || (n >= 3 && vRate >= 0.05 && (camel + wfirst + strong + weak) / n >= 0.15 && en / n < 0.15));
  return { bijoy, words: n, score, vRate, en };
}

/* ---------- runs of text in different formatting ---------- */
// a glyph of one syllable that sits at the edge of a run goes with the rest of its syllable,
// so each run converts whole: ‡|K → |‡K, K|©v → K©v|
const BJ_TAIL_NEXT = /[w‡†‰ˆ¯®¤•”˜™š›&]+$/;
const BJ_HEAD_PREV = /^[©vxyz“–~‚ƒ„…ŠuÖª«¨¬\u00AD\u2212œèú‹Œ¿^¡¦Ÿ¢£¥§’‘—Íæø]+/;
function bjFixRuns(texts) {
  for (let i = 0; i < texts.length - 1; i++) { const m = texts[i].match(BJ_TAIL_NEXT); if (m) { texts[i] = texts[i].slice(0, -m[0].length); texts[i + 1] = m[0] + texts[i + 1]; } }
  for (let i = texts.length - 1; i > 0; i--) { const m = texts[i].match(BJ_HEAD_PREV); if (m && /\S$/.test(texts[i - 1])) { texts[i] = texts[i].slice(m[0].length); texts[i - 1] += m[0]; } }
  return texts;
}
// the same for Unicode: vowel signs, hasanta, nukta and joiners go with the letter before them
function bnFixRuns(texts) {
  for (let i = 1; i < texts.length; i++) {
    for (let guard = 0; guard < 8; guard++) {
      const a = texts[i - 1], b = texts[i];
      if (!a || !b) break;
      let m = b.match(/^[ঁ-ঃ়-ৗ\u200C\u200D]+/);
      if (!m && /[\u09CD\u200D]$/.test(a)) m = b.match(/^[\u0995-\u09B9\u09DC-\u09DF]\u09BC?/);
      if (!m) break;
      texts[i - 1] = a + m[0]; texts[i] = b.slice(m[0].length);
    }
  }
  return texts;
}
const BJ_BLOCK = /^(P|H[1-6]|LI|TD|TH|DIV|BLOCKQUOTE|PRE|DT|DD|CAPTION|FIGCAPTION|BODY|SECTION|ARTICLE|HEADER|FOOTER|UL|OL|TABLE|TR|TBODY)$/;
function bjBlockOf(n) { let e = n.parentNode; while (e && e.nodeType === 1 && !BJ_BLOCK.test(e.tagName)) e = e.parentNode; return e || n.parentNode; }
/* the nodes of `set` as runs: text next to each other in one paragraph (a line break or a picture ends a run) */
function bjRuns(set) {
  const blocks = [];
  for (const t of set) { const b = bjBlockOf(t); if (b && !blocks.includes(b)) blocks.push(b); }
  const runs = [];
  for (const b of blocks) {
    const doc = b.ownerDocument || document;
    const w = doc.createTreeWalker(b, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let cur = null, n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 1) { if (/^(BR|IMG|HR)$/.test(n.tagName) || BJ_BLOCK.test(n.tagName) || n.classList.contains('shp')) cur = null; continue; }
      if (bjBlockOf(n) !== b) { cur = null; continue; }
      if (set.has(n)) { if (!cur) runs.push(cur = []); cur.push(n); }
      else if (/\S/.test(n.data)) cur = null;
    }
  }
  return runs;
}
/* Bijoy text in these runs → Unicode; returns how many runs changed. A run left empty (its glyph
   went to the next one) goes, with the formatting around it. */
function bjConvertRuns(runs, fn = bijoyToUnicode, fix = bjFixRuns) {
  let n = 0;
  for (const run of runs) {
    const texts = fix(run.map(t => t.data));
    let ch = false;
    run.forEach((t, k) => { const u = fn(texts[k]); if (u !== t.data) { t.data = u; ch = true; } });
    for (const t of run) {
      if (t.data || !t.parentNode) continue;
      let p = t.parentNode;
      t.remove();
      while (p && p.nodeType === 1 && /^(SPAN|B|I|U|S|STRONG|EM|FONT|SUB|SUP)$/.test(p.tagName) && !p.firstChild && !p.classList.contains('cmt')) { const up = p.parentNode; p.remove(); p = up; }
    }
    if (ch) n++;
  }
  return n;
}
/* the fonts a Word copy or a web page gives by class (p.MsoNormal { font-family: SutonnyMJ }) */
function bjClassFonts(doc) {
  const out = {};
  for (const st of doc.querySelectorAll('style')) {
    const css = st.textContent.replace(/<!--|-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const ff = (m[2].match(/(?:^|;)\s*font-family\s*:\s*([^;]+)/i) || [])[1];
      if (!ff) continue;
      for (const sel of m[1].split(',')) { const k = sel.trim().match(/^(?:[a-z0-9]+)?\.([\w-]+)$/i) || sel.trim().match(/^(body|p|span|div|td)$/i); if (k) out[k[1].toLowerCase()] = firstFamily(ff); }
    }
  }
  return out;
}

/* ---------- in Folio ---------- */
const Bijoy = {
  pasted: 0,    // runs the last paste converted
  order() { return Prefs.bijoyOrder === 'unicode' ? 'unicode' : 'bijoy'; },
  auto() { return Prefs.bijoyAuto !== false; },
  /* the Bijoy keyboard on or off (Avro goes off when it comes on) */
  toggle(force) {
    const on = force != null ? !!force : !S.bijoy;
    Avro.commit();
    S.bijoy = on;
    if (on) { S.avro = false; Prefs.avro = false; Prefs.bnKbd = 'bijoy'; }
    Prefs.bijoy = on; savePrefs();
    UI.refresh();
    toast(on ? 'Bijoy keyboard is on' + (this.order() === 'unicode' ? ', in reading order' : '') + '. Ctrl+Alt+B or F12 goes back to English.' : 'Bijoy keyboard is off. Typing English.', { ms: 4000 });
  },
  setOrder(o) {
    Prefs.bijoyOrder = o === 'unicode' ? 'unicode' : 'bijoy'; savePrefs();
    Avro.commit(); UI.refresh();
    toast(o === 'unicode' ? 'Bijoy keys in reading order (as in UniJoy): ক then ি for কি; A then ম for র্ম.' : 'Bijoy keys in Bijoy’s order: ি then ক for কি; ম then A for র্ম.');
  },
  setAuto(on) { Prefs.bijoyAuto = !!on; savePrefs(); toast(on ? 'Bijoy text you paste or open from Word becomes Unicode.' : 'Pasted and opened Bijoy text stays as it is.'); },
  /* F12 and the status bar: the chosen Bangla keyboard on or off */
  key() {
    if (S.bijoy) return this.toggle(false);
    if (S.avro) return Avro.toggle(false);
    if (Prefs.bnKbd === 'bijoy') this.toggle(true); else Avro.toggle(true);
  },
  /* English, Avro Phonetic or Bijoy */
  use(kind) { if (kind === 'bijoy') { if (!S.bijoy) this.toggle(true); } else if (kind === 'avro') { if (!S.avro) Avro.toggle(true); } else if (S.bijoy) this.toggle(false); else if (S.avro) Avro.toggle(false); },
  menuItems() {
    return [
      { label: 'English', checked: !S.avro && !S.bijoy, onClick: () => this.use('en') },
      { label: 'Avro Phonetic', sc: 'F12', checked: !!S.avro, onClick: () => this.use('avro') },
      { label: 'Bijoy', sc: 'Ctrl+Alt+B', checked: !!S.bijoy, onClick: () => this.use('bijoy') },
      '-', { head: 'Bijoy typing' },
      { label: 'ি ে ৈ before the letter (Bijoy)', checked: this.order() === 'bijoy', onClick: () => this.setOrder('bijoy') },
      { label: 'Reading order (UniJoy)', checked: this.order() === 'unicode', onClick: () => this.setOrder('unicode') },
      '-', { label: 'Bijoy Keyboard Layout…', icon: 'keyboard', onClick: () => this.showLayout() },
    ];
  },

  /* Bijoy text in a pasted page or Word copy (by its font): converted where it is; the number of runs */
  fromHtmlDoc(doc) {
    const body = doc.body;
    if (!body) return 0;
    const cls = bjClassFonts(doc);
    const fontOf = el => {
      for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
        const ff = e.style && e.style.fontFamily;
        if (ff) return firstFamily(ff);
        if (e.tagName === 'FONT' && e.getAttribute('face')) return firstFamily(e.getAttribute('face'));
        for (const c of e.classList || []) if (cls[c.toLowerCase()]) return cls[c.toLowerCase()];
        if (cls[e.tagName.toLowerCase()]) return cls[e.tagName.toLowerCase()];
      }
      return '';
    };
    const set = new Set();
    const w = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    let t;
    while ((t = w.nextNode())) { const p = t.parentElement; if (p && !/^(STYLE|SCRIPT)$/.test(p.tagName) && isBijoyFont(fontOf(p))) set.add(t); }
    if (!set.size) return 0;
    const n = bjConvertRuns(bjRuns(set));
    // the converted text no longer asks for those fonts
    for (const x of set) for (let e = x.parentElement; e && e !== body.parentElement; e = e.parentElement) {
      if (e.style && isBijoyFont(firstFamily(e.style.fontFamily))) { e.style.fontFamily = ''; e.style.removeProperty('mso-ascii-font-family'); e.style.removeProperty('mso-hansi-font-family'); }
      if (e.tagName === 'FONT' && isBijoyFont(e.getAttribute('face'))) e.removeAttribute('face');
      if (e.classList) for (const c of [...e.classList]) if (isBijoyFont(cls[c.toLowerCase()])) e.classList.remove(c);
    }
    return n;
  },
  /* pasted HTML read as plain text, with its Bijoy runs converted (Paste › Text only) */
  textFromHtml(html) {
    if (!html || !/MJ|ANSI|BAN/i.test(html)) return null;
    const doc = new DOMParser().parseFromString(String(html).replace(/<!--\s*(Start|End)Fragment\s*-->/gi, ''), 'text/html');
    if (!this.fromHtmlDoc(doc)) return null;
    doc.querySelectorAll('style, script').forEach(x => x.remove());
    const out = [];
    for (const b of doc.body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, div:not(:has(p, div, li)), td')) out.push(b.textContent.replace(/\s+/g, ' ').trim());
    return out.length ? out.join('\n') : doc.body.textContent;
  },
  /* the text marked as Bijoy while a Word file was read (span[data-bj]): converted; the number of runs */
  convertMarked(root) {
    const spans = [...root.querySelectorAll('span[data-bj]')];
    for (const tp of root.querySelectorAll('template')) spans.push(...tp.content.querySelectorAll('span[data-bj]'));
    if (!spans.length) return 0;
    const set = new Set();
    for (const sp of spans) { const w = (sp.ownerDocument || document).createTreeWalker(sp, NodeFilter.SHOW_TEXT); let t; while ((t = w.nextNode())) set.add(t); }
    const n = bjConvertRuns(bjRuns(set));
    for (const sp of spans) { if (!sp.parentNode) continue; sp.removeAttribute('data-bj'); if (!sp.attributes.length) { while (sp.firstChild) sp.parentNode.insertBefore(sp.firstChild, sp); sp.remove(); } }
    return n;
  },
  convertMarkedHtml(html) {
    if (!html || html.indexOf('data-bj') < 0) return [html, 0];
    const box = document.createElement('div'); box.innerHTML = html;
    const n = this.convertMarked(box);
    return [box.innerHTML, n];
  },

  /* Review › Convert: the selection (or the whole text when nothing is selected) to Unicode or to Bijoy */
  convert(to) {
    if (S.readOnly) return;
    focusEditor();
    const cells = Tables.active();
    const r = getRange();
    const whole = !cells && (!r || r.collapsed || !S.editor.contains(r.startContainer));
    const pick = () => {
      if (cells) return Tables.cellTexts();
      if (!whole) return textNodesIn(r);
      const out = [], w = document.createTreeWalker(S.editor, NodeFilter.SHOW_TEXT);
      let t; while ((t = w.nextNode())) if (t.length && !insideNonEditable(t) && !t.parentNode.closest('del.tc, .hff, sup.fn')) out.push(t);
      return out;
    };
    const fam = t => firstFamily(getComputedStyle(t.parentNode).fontFamily);
    let done = 0, first = null, last = null;
    if (to === 'unicode') {
      change(() => {
        const nodes = pick();
        let set = nodes.filter(t => isBijoyFont(fam(t)));
        if (!set.length && !whole) set = nodes.filter(t => /[!-~\u00A0-\u2212]/.test(t.data));   // (Bangla in Unicode stays as it is)
        if (!set.length) return;
        done = bjConvertRuns(bjRuns(new Set(set)));
        const plain = isBijoyFont(S.doc.font) ? 'Times New Roman' : (S.doc.font || 'Calibri');
        // the whole document in a Bijoy font: its English goes to Times New Roman
        if (whole && isBijoyFont(S.doc.font)) { S.doc.font = plain; applyDocSettings(); }
        for (const t of set) {
          if (!t.isConnected) continue;
          if (isBijoyFont(fam(t))) removeInlineProp(t, 'fontFamily');
          // a paragraph in that font: this text takes the document's own
          if (isBijoyFont(fam(t))) styleTextNode(t, { fontFamily: fontStack(plain) });
          first = first || t; last = t;
        }
        if (cells) Tables.park();
        else if (!whole && first) selectNodesRange(first, last);
      }, { full: true });
      if (!done) { toast(whole ? 'Nothing here is in a Bijoy font such as SutonnyMJ. To convert other text, select it first.' : 'The selection has no Bijoy text to convert.', { ms: 5000 }); return; }
      toast(`Converted ${whole ? 'the Bijoy text' : 'the selection'} to Unicode.`);
    } else {
      change(() => {
        const nodes = pick().filter(t => /[ঀ-৿]/.test(t.data) && !isBijoyFont(fam(t)));
        if (!nodes.length) return;
        // syllables split between runs go together first
        bjConvertRuns(bjRuns(new Set(nodes)), x => x, bnFixRuns);
        const re = /[ঀ-৿\u200C\u200D]+(?:[\s,.;:!?'"“”‘’()[\]\-–—/%]+[ঀ-৿\u200C\u200D]+)*/g;
        const sm = fontStack('SutonnyMJ');
        for (const t of nodes) {
          if (!t.isConnected || !t.length) continue;
          const ms = [...t.data.matchAll(re)];
          for (let k = ms.length - 1; k >= 0; k--) {
            const m = ms[k];
            if (m.index + m[0].length < t.length) t.splitText(m.index + m[0].length);
            const mid = m.index > 0 ? t.splitText(m.index) : t;
            mid.data = bijoyFromUnicode(mid.data);
            styleTextNode(mid, { fontFamily: sm });
            first = first && first.compareDocumentPosition(mid) & Node.DOCUMENT_POSITION_PRECEDING ? mid : first || mid;
            if (!last || last.compareDocumentPosition(mid) & Node.DOCUMENT_POSITION_FOLLOWING) last = mid;
            done++;
          }
        }
        if (cells) Tables.park();
        else if (!whole && first) selectNodesRange(first, last);
      }, { full: true });
      if (!done) { toast(whole ? 'There is no Bangla text here to convert.' : 'Select Bangla text to convert it to Bijoy.'); return; }
      toast(this.hasMJ() ? 'Converted to Bijoy text in SutonnyMJ.' : 'Converted to Bijoy text in SutonnyMJ. It shows as Bangla where SutonnyMJ is installed (as with Bijoy); here it looks like Latin letters.', { ms: this.hasMJ() ? 3000 : 7000 });
    }
  },
  /* is SutonnyMJ on this device? (it draws Latin codes as Bangla, so they measure differently) */
  hasMJ() {
    if (this._mj != null) return this._mj;
    try {
      const c = document.createElement('canvas').getContext('2d'), s = 'Avwg evsjvq Mvb MvB ‡K©¯Í';
      c.font = '40px monospace'; const a = c.measureText(s).width;
      c.font = '40px SutonnyMJ, monospace'; const b = c.measureText(s).width;
      this._mj = Math.abs(a - b) > 1;
    } catch { this._mj = false; }
    return this._mj;
  },
  /* a toast after a paste that converted Bijoy text, with a way to keep it as it was */
  afterPaste(mode) {
    if (!this.pasted) return;
    const can = Paste.last && Paste.beforeIdx != null && Paste.beforeIdx >= 0;
    toast('Bijoy text (SutonnyMJ) was converted to Unicode.', can ? { ms: 7000, action: { label: 'Keep Bijoy', fn: () => PasteChip.redo(mode, { noBijoy: true }) } } : { ms: 4000 });
  },

  /* the layout: each key's letters, normal and with Shift */
  showLayout() {
    const rows = [
      ['`1234567890-=', '~!@#$%^&*()_+'],
      ['qwertyuiop[]\\', 'QWERTYUIOP{}|'],
      ['asdfghjkl;\'', 'ASDFGHJKL:"'],
      ['zxcvbnm,./', 'ZXCVBNM<>?'],
    ];
    const show = k => k === 'g' ? '্' : k === 'A' ? 'র্' : (BJ_KEYS[k] != null ? BJ_KEYS[k] : '');
    const vs = c => /^[ঁ-ঃ়-ৗ]/.test(c) ? '\u25CC' + c : c;
    const kb = h('div', { class: 'bj-kb', role: 'img', 'aria-label': 'The Bijoy keyboard layout' });
    rows.forEach(([lo, up], ri) => {
      const row = h('div', { class: 'bj-row r' + ri });
      for (let i = 0; i < lo.length; i++) {
        const a = show(lo[i]), b = show(up[i]);
        const cap = h('div', { class: 'bj-key' + (lo[i] === 'g' ? ' link' : '') + (a || b ? '' : ' none') },
          h('span', { class: 'up' }, b && b !== up[i] ? vs(b) : ''),
          h('span', { class: 'lo' }, a ? vs(a) : ''),
          h('span', { class: 'k' }, lo[i] === lo[i].toLowerCase() && /[a-z]/.test(lo[i]) ? lo[i].toUpperCase() : lo[i]));
        row.appendChild(cap);
      }
      kb.appendChild(row);
    });
    const ord = select([['bijoy', 'ি ে ৈ before the letter, reph after it (Bijoy)'], ['unicode', 'Everything in reading order (UniJoy)']], this.order(), { id: 'bjOrder' });
    ord.addEventListener('change', () => this.setOrder(ord.value));
    const tips = h('ul', { class: 'bj-tips' },
      h('li', null, h('b', null, 'g'), ' joins letters: ', h('kbd', null, 'j g N'), ' = ক্ষ, ', h('kbd', null, 'n g k'), ' = স্ত; ', h('kbd', null, 'z'), ' adds র-ফলা (', h('kbd', null, 'r z'), ' = প্র), ', h('kbd', null, 'Z'), ' য-ফলা.'),
      h('li', null, h('b', null, 'g'), ' and a vowel sign make the vowel: ', h('kbd', null, 'g f'), ' = আ, ', h('kbd', null, 'g d'), ' = ই, ', h('kbd', null, 'g c'), ' = এ; ', h('kbd', null, 'F'), ' = অ, ', h('kbd', null, 'x'), ' = ও.'),
      h('li', null, 'Bijoy order: ', h('kbd', null, 'd j'), ' = কি, ', h('kbd', null, 'c j f'), ' = কো; reph after its letter: ', h('kbd', null, 'j m A'), ' = কর্ম.'),
      h('li', null, h('kbd', null, 'Ctrl+Alt+B'), ' (or ', h('kbd', null, 'F12'), ') switches between Bijoy and English.'));
    openDialog({ title: 'Bijoy Keyboard', width: 760, body: h('div', { class: 'bj-layout' }, kb, field('Typing order', ord), tips), buttons: [{ label: S.bijoy ? 'Close' : 'Type with Bijoy', primary: true, onClick: () => { if (!S.bijoy) this.toggle(true); } }] });
  },
};
