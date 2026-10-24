/* ===================== Avro Phonetic =====================
   Type Bangla with English letters, the way the Avro Keyboard phonetic layout does
   (ami banglay likhi → আমি বাংলায় লিখি). The rule set follows Avro's open phonetic
   scheme: patterns are matched longest first, and vowels change form depending on
   whether a consonant comes before them. F12 switches it on and off.
   The same word-at-a-time typing serves the Bijoy keyboard (38b-bijoy.js): the keys of the word are
   kept and its Bangla is worked out again from them on every key (bijoyParse instead of avroParse). */
const AVRO_ZWJ = String.fromCharCode(0x200D), AVRO_ZWNJ = String.fromCharCode(0x200C);
const AVRO_VOWEL = 'aeiou', AVRO_CONSONANT = 'bcdfghjklmnpqrstvwxyz', AVRO_CASED = 'oiudgjnrstyz';
const AVRO_RULES = (() => {
  const P = [];
  const add = (find, replace, rules) => P.push(rules ? { find, replace, rules } : { find, replace });
  const m = (type, scope, value) => (value != null ? { type, scope, value } : { type, scope });
  // vowel signs: full letter at the start of a word or after another vowel, a kar after a consonant
  const vowel = (find, kar, full, tick = true) => {
    const tail = tick ? [m('suffix', '!exact', '`')] : [];
    add(find, kar, [{ matches: [m('prefix', '!consonant'), ...tail], replace: full }, { matches: [m('prefix', 'punctuation'), ...tail], replace: full }]);
  };
  const rafar = [m('prefix', 'consonant'), m('prefix', '!exact', 'r'), m('prefix', '!exact', 'y'), m('prefix', '!exact', 'w'), m('prefix', '!exact', 'x')];
  const simple = s => s.trim().split(/\s+/).forEach(pair => { const i = pair.indexOf('='); add(pair.slice(0, i), pair.slice(i + 1)); });

  simple('bhl=ভ্ল psh=পশ bdh=ব্ধ bj=ব্জ bd=ব্দ bb=ব্ব bl=ব্ল bh=ভ vl=ভ্ল b=ব v=ভ');
  simple('cNG=চ্ঞ cch=চ্ছ cc=চ্চ ch=ছ c=চ');
  simple('dhn=ধ্ন dhm=ধ্ম dgh=দ্ঘ ddh=দ্ধ dbh=দ্ভ dv=দ্ভ dm=দ্ম DD=ড্ড Dh=ঢ dh=ধ dg=দ্গ dd=দ্দ D=ড d=দ');
  add('...', '...'); add('.`', '.'); add('.', '।');
  simple('ghn=ঘ্ন Gh=ঘ gh=ঘ gN=গ্ণ GN=গ্ণ gn=গ্ন Gn=গ্ন gm=গ্ম Gm=গ্ম gl=গ্ল Gl=গ্ল gg=জ্ঞ GG=জ্ঞ Gg=জ্ঞ gG=জ্ঞ g=গ G=গ');
  simple('hN=হ্ণ hn=হ্ন hm=হ্ম hl=হ্ল h=হ');
  simple('jjh=জ্ঝ jNG=জ্ঞ jh=ঝ jj=জ্জ j=জ J=জ');
  simple('kkhN=ক্ষ্ণ kShN=ক্ষ্ণ kkhm=ক্ষ্ম kShm=ক্ষ্ম kxN=ক্ষ্ণ kxm=ক্ষ্ম kkh=ক্ষ kSh=ক্ষ ksh=কশ kx=ক্ষ kk=ক্ক kT=ক্ট kt=ক্ত kl=ক্ল ks=ক্স kh=খ k=ক');
  simple('lbh=ল্ভ ldh=ল্ধ lkh=লখ lgh=লঘ lph=লফ lk=ল্ক lg=ল্গ lT=ল্ট lD=ল্ড lp=ল্প lv=ল্ভ lm=ল্ম ll=ল্ল lb=ল্ব l=ল');
  simple('mth=ম্থ mph=ম্ফ mbh=ম্ভ mpl=মপ্ল mn=ম্ন mp=ম্প mv=ম্ভ mm=ম্ম ml=ম্ল mb=ম্ব mf=ম্ফ m=ম');
  '০১২৩৪৫৬৭৮৯'.split('').forEach((d, i) => add(String(i), d));
  simple('NgkSh=ঙ্ক্ষ Ngkkh=ঙ্ক্ষ NGch=ঞ্ছ Nggh=ঙ্ঘ Ngkh=ঙ্খ NGjh=ঞ্ঝ ngOU=ঙ্গৌ ngOI=ঙ্গৈ Ngkx=ঙ্ক্ষ NGc=ঞ্চ nch=ঞ্ছ njh=ঞ্ঝ ngh=ঙ্ঘ Ngk=ঙ্ক Ngx=ঙ্ষ Ngg=ঙ্গ Ngm=ঙ্ম NGj=ঞ্জ');
  simple('ndh=ন্ধ nTh=ন্ঠ NTh=ণ্ঠ nth=ন্থ nkh=ঙ্খ ngo=ঙ্গ nga=ঙ্গা ngi=ঙ্গি ngI=ঙ্গী ngu=ঙ্গু ngU=ঙ্গূ nge=ঙ্গে ngO=ঙ্গো NDh=ণ্ঢ nsh=নশ Ngr=ঙর NGr=ঞর ngr=ংর');
  simple('nj=ঞ্জ Ng=ঙ NG=ঞ nk=ঙ্ক ng=ং nn=ন্ন NN=ণ্ণ Nn=ণ্ন nm=ন্ম Nm=ণ্ম nd=ন্দ nT=ন্ট NT=ণ্ট nD=ন্ড ND=ণ্ড nt=ন্ত ns=ন্স nc=ঞ্চ n=ন N=ণ');
  add('OI`', 'ৈ'); add('OU`', 'ৌ'); add('O`', 'ো');
  vowel('OI', 'ৈ', 'ঐ', false); vowel('OU', 'ৌ', 'ঔ', false); vowel('O', 'ো', 'ও', false);
  simple('phl=ফ্ল pT=প্ট pt=প্ত pn=প্ন pp=প্প pl=প্ল ps=প্স ph=ফ fl=ফ্ল f=ফ p=প');
  add('rri`', 'ৃ');
  vowel('rri', 'ৃ', 'ঋ', false);
  add('rrZ', 'রর' + AVRO_ZWJ + '্য'); add('rry', 'রর' + AVRO_ZWJ + '্য');
  add('rZ', 'র' + AVRO_ZWJ + '্য', [{ matches: rafar, replace: '্র্য' }]);
  add('ry', 'র' + AVRO_ZWJ + '্য', [{ matches: rafar, replace: '্র্য' }]);
  // "rr" before a consonant is the reph (র্), as in korrmo → কর্ম
  add('rr', 'রর', [{ matches: [m('prefix', '!vowel'), m('suffix', '!vowel')], replace: 'র্' }, { matches: [m('suffix', '!vowel')], replace: 'র্' }, { matches: [m('prefix', 'consonant'), m('suffix', 'vowel')], replace: '্রর' }]);
  simple('Rg=ড়্গ Rh=ঢ় R=ড়');
  add('r', 'র', [{ matches: rafar.concat([m('prefix', '!exact', 'Z')]), replace: '্র' }]);
  simple('shch=শ্ছ ShTh=ষ্ঠ Shph=ষ্ফ Sch=শ্ছ skl=স্ক্ল skh=স্খ sth=স্থ sph=স্ফ shc=শ্চ sht=শ্ত shn=শ্ন shm=শ্ম shl=শ্ল Shk=ষ্ক ShT=ষ্ট ShN=ষ্ণ Shp=ষ্প Shf=ষ্ফ Shm=ষ্ম spl=স্প্ল');
  simple('sk=স্ক Sc=শ্চ sT=স্ট st=স্ত sn=স্ন sp=স্প sf=স্ফ sm=স্ম sl=স্ল sh=শ St=শ্ত Sn=শ্ন Sm=শ্ম Sl=শ্ল Sh=ষ s=স S=শ');
  add('oo`', 'ু');
  vowel('oo', 'ু', 'উ');
  add('o`', ''); add('oZ', 'অ্য');
  add('o', '', [{ matches: [m('prefix', 'vowel'), m('prefix', '!exact', 'o')], replace: 'ও' }, { matches: [m('prefix', 'vowel'), m('prefix', 'exact', 'o')], replace: 'অ' }, { matches: [m('prefix', 'punctuation')], replace: 'অ' }]);
  simple('tth=ত্থ t``=ৎ TT=ট্ট Tm=ট্ম Th=ঠ tn=ত্ন tm=ত্ম th=থ tt=ত্ত T=ট t=ত');
  add('aZ', 'অ্যা'); add('a`', 'া');
  add('a', 'া', [{ matches: [m('prefix', 'punctuation'), m('suffix', '!exact', '`')], replace: 'আ' }, { matches: [m('prefix', '!consonant'), m('prefix', '!exact', 'a'), m('suffix', '!exact', '`')], replace: 'য়া' }, { matches: [m('prefix', 'exact', 'a'), m('suffix', '!exact', '`')], replace: 'আ' }]);
  add('i`', 'ি'); vowel('i', 'ি', 'ই');
  add('I`', 'ী'); vowel('I', 'ী', 'ঈ');
  add('u`', 'ু'); vowel('u', 'ু', 'উ');
  add('U`', 'ূ'); vowel('U', 'ূ', 'ঊ');
  add('ee`', 'ী'); vowel('ee', 'ী', 'ঈ');
  add('e`', 'ে'); vowel('e', 'ে', 'এ');
  add('z', 'য'); add('Z', '্য');
  add('y', '্য', [{ matches: [m('prefix', '!consonant'), m('prefix', '!punctuation')], replace: 'য়' }, { matches: [m('prefix', 'punctuation')], replace: 'ইয়' }]);
  add('Y', 'য়'); add('q', 'ক');
  add('w', 'ও', [{ matches: [m('prefix', 'punctuation'), m('suffix', 'vowel')], replace: 'ওয়' }, { matches: [m('prefix', 'consonant')], replace: '্ব' }]);
  add('x', 'ক্স', [{ matches: [m('prefix', 'punctuation')], replace: 'এক্স' }]);
  add(':`', ':'); add(':', 'ঃ'); add('^`', '^'); add('^', 'ঁ');
  add(',,', '্' + AVRO_ZWNJ); add('$', '৳'); add('`', '');
  // index by first character, longest pattern first
  const byFirst = {};
  for (const p of P) (byFirst[p.find[0]] || (byFirst[p.find[0]] = [])).push(p);
  for (const k in byFirst) byFirst[k].sort((a, b) => b.find.length - a.find.length);
  return byFirst;
})();
function avroFix(s) { let o = ''; for (const c of s) o += AVRO_CASED.includes(c.toLowerCase()) ? c : c.toLowerCase(); return o; }
const avroIsVowel = c => !!c && AVRO_VOWEL.includes(c.toLowerCase());
const avroIsConsonant = c => !!c && AVRO_CONSONANT.includes(c.toLowerCase());
function avroScope(match, fixed, chk) {
  const neg = match.scope[0] === '!';
  const scope = neg ? match.scope.slice(1) : match.scope;
  const pre = match.type === 'prefix';
  const inside = pre ? chk >= 0 : chk < fixed.length;
  const c = inside ? fixed[chk] : '';
  let ok;
  if (scope === 'punctuation') ok = !inside || !(avroIsVowel(c) || avroIsConsonant(c));
  else if (scope === 'vowel') ok = inside && avroIsVowel(c);
  else if (scope === 'consonant') ok = inside && avroIsConsonant(c);
  else return true;
  return ok !== neg;
}
function avroParse(input) {
  const fixed = avroFix(input);
  let out = '';
  for (let cur = 0; cur < fixed.length; cur++) {
    const list = AVRO_RULES[fixed[cur]];
    let done = false;
    if (list) {
      for (const p of list) {
        const end = cur + p.find.length;
        if (end > fixed.length || fixed.slice(cur, end) !== p.find) continue;
        let rep = p.replace;
        if (p.rules) {
          for (const rule of p.rules) {
            let ok = true;
            for (const mt of rule.matches) {
              if (/exact$/.test(mt.scope)) {
                const neg = mt.scope[0] === '!';
                const s = mt.type === 'suffix' ? end : cur - mt.value.length;
                const e = mt.type === 'suffix' ? end + mt.value.length : cur;
                const hit = s >= 0 && e <= fixed.length && fixed.slice(s, e) === mt.value;
                if (hit === neg) { ok = false; break; }
              } else if (!avroScope(mt, fixed, mt.type === 'suffix' ? end : cur - 1)) { ok = false; break; }
            }
            if (ok) { rep = rule.replace; break; }
          }
        }
        out += rep;
        cur = end - 1;
        done = true;
        break;
      }
    }
    if (!done) out += fixed[cur];
  }
  return out;
}

/* up to n characters just before a place in the text, within its paragraph */
function textBefore(node, off, n) {
  let out = node.nodeType === 3 ? node.data.slice(Math.max(0, off - n), off) : '';
  if (out.length >= n) return out;
  const b = blockOf(node);
  if (!b) return out;
  const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
  let t, prev = '';
  w.currentNode = node;
  while (out.length < n && (t = w.previousNode())) { if (t.nodeType === 3) { prev = t.data; out = prev.slice(Math.max(0, prev.length - (n - out.length))) + out; } }
  return out.replace(/\u200B/g, '');
}
const Avro = {
  st: null,   // the word being typed: { node, start, len, roman, out }
  pv: null,
  on() { return !!(S.avro || S.bijoy); },
  toggle(force) {
    S.avro = force != null ? !!force : !S.avro;
    if (S.avro) { S.bijoy = false; Prefs.bijoy = false; Prefs.bnKbd = 'avro'; }
    Prefs.avro = S.avro; savePrefs();
    this.commit();
    UI.refresh();
    toast(S.avro ? 'Avro Phonetic is on. Type Bangla in English letters: ami → আমি. F12 switches back.' : 'Avro Phonetic is off. Typing English.');
  },
  commit() { this.st = null; this.hidePreview(); },
  /* the Bangla for the keys typed in this word */
  parse(keys, before) { return S.bijoy ? bijoyParse(keys, before || '', Bijoy.order()) : avroParse(keys); },
  valid(r) {
    const s = this.st;
    if (!s || !r || !r.collapsed || r.startContainer !== s.node || !s.node.isConnected) return false;
    return r.startOffset === s.start + s.len && s.node.data.slice(s.start, s.start + s.len) === s.out;
  },
  /* put `out` where the word's previous output was, keeping track-changes marks */
  render(roman) {
    const s = this.st;
    const out = this.parse(roman, s.before);
    if (s.len) s.node.deleteData(s.start, s.len);
    if (!out) { caretAt(s.node, s.start); s.len = 0; s.out = ''; s.roman = roman; return; }
    if (S.track) {
      caretAt(s.node, s.start);
      Track.insertText(out);
      const r = getRange();
      s.node = r.startContainer; s.start = r.startOffset - out.length;
    } else {
      s.node.insertData(s.start, out);
      caretAt(s.node, s.start + out.length);
    }
    s.len = out.length; s.out = out; s.roman = roman;
  },
  begin() {
    let r = getRange();
    if (!r) return false;
    if (!r.collapsed) { exec('delete'); r = getRange(); if (!r) return false; }
    let node = r.startContainer, off = r.startOffset;
    if (node.nodeType !== 3) {
      // empty paragraph or element boundary: make a text node to type into
      const t = document.createTextNode('');
      const before = node.childNodes[off] || null;
      if (before && before.nodeName === 'BR' && !before.nextSibling && !(before.previousSibling && before.previousSibling.nodeType === 3 && before.previousSibling.data)) before.remove(), node.appendChild(t);
      else node.insertBefore(t, before);
      node = t; off = 0;
    }
    this.st = { node, start: off, len: 0, roman: '', out: '', before: textBefore(node, off, 2) };
    return true;
  },
  beforeInput(e) {
    if (!this.on() || S.composing) return false;
    const t = e.inputType;
    if (t === 'insertText') {
      const d = e.data;
      if (!d || !/^[\x21-\x7E]+$/.test(d)) { this.commit(); return false; }
      e.preventDefault();
      beginChange();
      if (!this.valid(getRange()) && !this.begin()) return true;
      this.render(this.st.roman + d);
      this.after();
      return true;
    }
    if (t === 'deleteContentBackward' && this.st && this.valid(getRange()) && this.st.roman) {
      e.preventDefault();
      beginChange();
      const roman = this.st.roman.slice(0, -1);
      this.render(roman);
      if (!roman) this.commit();
      this.after();
      return true;
    }
    this.commit();
    return false;
  },
  after() {
    const node = this.st && this.st.node;
    histSoon(); Saver.mark();
    fixupAfterInput('insertText', getRange());
    Layout.soon(node); Stats.soon(); Nav.soon();
    AutoComplete.check();
    this.showPreview();
  },
  showPreview() {
    const s = this.st;
    if (!s || !s.roman || S.bijoy) { this.hidePreview(); return; }   // Bijoy's keys are the letters themselves
    if (!this.pv) { this.pv = h('div', { class: 'float avro-pv', 'aria-hidden': 'true' }); $('#floatRoot').appendChild(this.pv); }
    this.pv.textContent = s.roman;
    const rc = caretRect();
    if (rc) { this.pv.style.left = Math.max(8, Math.min(window.innerWidth - 200, rc.left - 4)) + 'px'; this.pv.style.top = (rc.bottom + 6) + 'px'; }
  },
  hidePreview() { if (this.pv) { this.pv.remove(); this.pv = null; } },
  /* text boxes outside the page (Fields pane, comments, find, title, dialogs) */
  fields: new WeakMap(),
  fieldBeforeInput(e) {
    const el = e.target;
    if (!this.on() || S.composing || !el || !el.matches || !el.matches('input[data-avro], textarea:not([data-noavro])')) return;
    const t = e.inputType;
    let st = this.fields.get(el);
    const caret = el.selectionStart;
    const valid = st && caret === el.selectionEnd && caret === st.start + st.len && el.value.slice(st.start, st.start + st.len) === st.out;
    const put = roman => {
      const out = this.parse(roman, el.value.slice(Math.max(0, st.start - 2), st.start));
      el.setRangeText(out, st.start, st.start + st.len, 'end');
      st.len = out.length; st.out = out; st.roman = roman;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    if (t === 'insertText' && e.data && /^[\x21-\x7E]+$/.test(e.data)) {
      e.preventDefault();
      if (!valid) {
        const a = Math.min(el.selectionStart, el.selectionEnd), b = Math.max(el.selectionStart, el.selectionEnd);
        if (b > a) el.setRangeText('', a, b, 'start');
        st = { start: a, len: 0, roman: '', out: '' };
        this.fields.set(el, st);
      }
      put(st.roman + e.data);
      return;
    }
    if (t === 'deleteContentBackward' && valid && st.roman) {
      e.preventDefault();
      put(st.roman.slice(0, -1));
      if (!st.roman) this.fields.delete(el);
      return;
    }
    this.fields.delete(el);
  },
};
document.addEventListener('beforeinput', e => { if (e.target && e.target !== S.editor && !(S.editor && S.editor.contains(e.target))) Avro.fieldBeforeInput(e); }, true);
