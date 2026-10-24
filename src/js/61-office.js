/* ===================== Government letters and the office profile =====================
   The office profile: the office's names in Bangla and English (government, ministry or division,
   office, section, address), who signs (name, designation), the memo number's fixed first part and
   the next number, website, phone, email, a logo, and the addresses letters go to; saved once with
   the person's account (data/users/<id>/profile/office, private to them; or in this browser).
   File › New › সরকারি পত্র (or Insert › Office Letter) makes a letter from it, as Bangladesh's
   offices write them: the office's name centred at the top; স্মারক নম্বর on the left and তারিখ on the
   right (the Bangla date over the English one); বিষয় and সূত্র; the text with its paragraphs
   numbered ২।, ৩।; the signature block; the addressee; then the copies: the memo number again with
   /১(n), "সদয় জ্ঞাতার্থে … (জ্যেষ্ঠতার ক্রমানুসারে নয়)" and the বিতরণ list numbered ১), ২) ending
   with সংরক্ষণ নথি. Also অফিস আদেশ, প্রজ্ঞাপন and নোটিশ, and English letters and office orders. Page
   numbers from page 2 at the top (- ২ -). What is not known yet is a [field] for Fill Fields. */
const OFFICE_FIELDS = [
  // key, Bangla label, English label, Bangla default, English default (the names in each language)
  ['gov', 'সরকার', 'Government', 'গণপ্রজাতন্ত্রী বাংলাদেশ সরকার', 'Government of the People’s Republic of Bangladesh'],
  ['org', 'মন্ত্রণালয় / বিভাগ', 'Ministry / Division', '', ''],
  ['office', 'দপ্তর / কার্যালয়', 'Office / Directorate', '', ''],
  ['branch', 'শাখা / অধিশাখা', 'Section / Wing', '', ''],
  ['address', 'ঠিকানা', 'Address', '', ''],
  ['name', 'নাম (যিনি স্বাক্ষর করবেন)', 'Name (who signs)', '', ''],
  ['title', 'পদবি', 'Designation', '', ''],
];
const LETTER_TYPES = [
  { id: 'patra', name: 'সরকারি পত্র', lang: 'bn', to: true },
  { id: 'adesh', name: 'অফিস আদেশ', lang: 'bn', title: 'অফিস আদেশ' },
  { id: 'proggapon', name: 'প্রজ্ঞাপন', lang: 'bn', title: 'প্রজ্ঞাপন', byOrder: true },
  { id: 'notice', name: 'নোটিশ', lang: 'bn', title: 'নোটিশ' },
  { id: 'en-letter', name: 'Government letter (English)', lang: 'en', to: true },
  { id: 'en-order', name: 'Office order (English)', lang: 'en', title: 'OFFICE ORDER' },
];
const Office = {
  prof: null, loading: null, _mem: null,
  LOGO_MAX: 160000,   // characters of a logo's data URL (stored documents are capped at 256 KiB)
  blank() {
    const o = { v: 1, bn: {}, en: {}, memo: '', next: '', web: '', phone: '', email: '', logo: '', addrs: [], saved: false };
    for (const [k, , , dbn, den] of OFFICE_FIELDS) { o.bn[k] = dbn; o.en[k] = den; }
    return o;
  },
  norm(p) {
    const b = this.blank();
    if (!p || typeof p !== 'object') return b;
    for (const L of ['bn', 'en']) for (const [k] of OFFICE_FIELDS) if (p[L] && typeof p[L][k] === 'string') b[L][k] = p[L][k].slice(0, 300);
    for (const k of ['memo', 'next', 'web', 'phone', 'email']) if (p[k] != null) b[k] = String(p[k]).slice(0, 300);
    if (/^data:image\/(png|jpeg|webp|gif);base64,/.test(p.logo || '') && p.logo.length <= this.LOGO_MAX) b.logo = p.logo;
    if (Array.isArray(p.addrs)) b.addrs = [...new Set(p.addrs.filter(x => typeof x === 'string').map(x => x.trim()).filter(Boolean))].slice(0, 200);
    b.saved = !!p.saved;
    return b;
  },
  async store() {
    await capsReady;
    if (Store.cloud) {
      const doc = CloudStore.base().collection('office').doc('profile');
      return { async get() { const s = await doc.get(); return s.exists ? s.data() : null; }, async set(v) { await withRetry(() => doc.set(v)); } };
    }
    const kv = (mode, fn) => LocalStore._tx('kv', mode, fn);
    return {
      async get() { try { return (await kv('readonly', os => os.get('office'))) || null; } catch { return Office._mem; } },
      async set(v) { try { await kv('readwrite', os => os.put(v, 'office')); } catch { Office._mem = v; } },
    };
  },
  async load(force) {
    if (this.prof && !force) return this.prof;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try { const raw = await (await this.store()).get(); this.prof = this.norm(raw && raw.json ? JSON.parse(raw.json) : null); }
      catch (e) { console.warn('office profile unavailable', e); this.prof = this.prof || this.blank(); }
      finally { this.loading = null; }
      return this.prof;
    })();
    return this.loading;
  },
  async save(p) {
    p = this.norm(Object.assign({}, p, { saved: true }));
    this.prof = p;
    try { await (await this.store()).set({ v: 1, json: JSON.stringify(p), at: Date.now() }); return true; }
    catch (e) { console.warn('office profile not saved', e); toast('The office profile could not be saved to your account. Folio keeps it until it closes.'); return false; }
  },
  /* a logo picture, made small (it goes on every letter) */
  async logoFrom(file) {
    const url = await readFileAs(file, 'url');
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('not a picture')); i.src = url; });
    for (const max of [220, 160, 120, 90]) {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const out = c.toDataURL('image/png');
      if (out.length <= this.LOGO_MAX) return out;
    }
    throw new Error('The picture is too large.');
  },
  /* Insert › Office Letter › Office Profile (and the first government letter): the profile */
  async edit(then, opts = {}) {
    const p = JSON.parse(JSON.stringify(await this.load()));
    let lang = 'bn';
    const ins = {};
    const seg = h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Language' });
    const grid = h('div', { class: 'of-grid' });
    const tab = (L, label) => { const b = h('button', { type: 'button', role: 'tab', 'aria-selected': L === lang ? 'true' : 'false', 'data-l': L }, label); b.addEventListener('click', () => { keep(); lang = L; seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-selected', x.dataset.l === L ? 'true' : 'false')); fill(); }); return b; };
    seg.append(tab('bn', 'বাংলা'), tab('en', 'English'));
    const keep = () => { for (const [k] of OFFICE_FIELDS) p[lang][k] = ins[k].value.trim(); };
    for (const [k, lbn, len] of OFFICE_FIELDS) {
      const i = input('', { id: 'of-' + k, 'data-avro': '' });
      ins[k] = i;
      grid.appendChild(h('div', { class: 'field' }, h('label', { for: 'of-' + k, 'data-bn': lbn, 'data-en': len }, lbn), i));
    }
    const fill = () => { for (const [k] of OFFICE_FIELDS) { ins[k].value = p[lang][k] || ''; ins[k].placeholder = lang === 'en' ? (p.bn[k] ? '(in English)' : '') : ''; } grid.querySelectorAll('label[data-bn]').forEach(l => { l.textContent = lang === 'en' ? l.dataset.en : l.dataset.bn; }); };
    const memo = input(p.memo, { id: 'of-memo', placeholder: '০৫.৪৩.০০০০.০১২.১৯.০০১.২৬' });
    const next = input(p.next, { id: 'of-next', inputmode: 'numeric', placeholder: 'blank: write it in each letter' });
    const web = input(p.web, { id: 'of-web', placeholder: 'www.example.gov.bd', spellcheck: 'false' });
    const phone = input(p.phone, { id: 'of-phone', inputmode: 'tel' });
    const email = input(p.email, { id: 'of-email', inputmode: 'email', spellcheck: 'false' });
    const addrs = h('textarea', { class: 'input of-addrs', id: 'of-addrs', rows: '5', 'data-avro': '', placeholder: 'সচিব, জনপ্রশাসন মন্ত্রণালয়, বাংলাদেশ সচিবালয়, ঢাকা।' });
    addrs.value = p.addrs.join('\n');
    const logoBox = h('div', { class: 'of-logo' });
    const drawLogo = () => {
      logoBox.innerHTML = '';
      if (p.logo) logoBox.appendChild(h('img', { src: p.logo, alt: 'Logo' }));
      const add = h('button', { class: 'btn', type: 'button' }, p.logo ? 'Change…' : 'Add picture…');
      add.addEventListener('click', () => pickFile('image/*', false, async files => { try { p.logo = await this.logoFrom(files[0]); drawLogo(); } catch (e) { toast('That picture could not be used: ' + e.message); } }));
      logoBox.appendChild(add);
      if (p.logo) { const rm = h('button', { class: 'btn', type: 'button' }, 'Remove'); rm.addEventListener('click', () => { p.logo = ''; drawLogo(); }); logoBox.appendChild(rm); }
    };
    drawLogo(); fill();
    const body = h('div', { class: 'of-dlg' },
      h('p', { class: 'note', style: { marginTop: 0 } }, (opts.first ? 'Fill this in once: every government letter takes the office’s name, the memo number and who signs from it. ' : 'Every new government letter takes these. ') + (Store.cloud ? 'It is saved with your account' : 'It is saved in this browser') + (opts.first ? ', and you can change it any time from Insert › Office Letter.' : '.')),
      seg, grid,
      h('div', { class: 'flabel of-sub' }, 'In both languages'),
      h('div', { class: 'of-grid' },
        field('Memo number, first part (স্মারক নং)', memo), field('Next number (ক্রমিক নম্বর)', next),
        field('Website', web), field('Phone', phone), field('Email', email),
        h('div', { class: 'field' }, h('div', { class: 'flabel' }, 'Logo (left of the office’s name)'), logoBox)),
      h('div', { class: 'field' }, h('label', { for: 'of-addrs' }, 'Addresses letters go to (one per line: designation, office, place)'), addrs));
    openDialog({ title: 'Office Profile', width: 640, body, buttons: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: () => {
      keep();
      Object.assign(p, { memo: memo.value.trim(), next: next.value.trim(), web: web.value.trim(), phone: phone.value.trim(), email: email.value.trim(), addrs: addrs.value.split('\n') });
      if (p.next && !/^[0-9০-৯]+$/.test(p.next)) { toast('The next number is a number, like 123 (or blank).'); next.focus(); return false; }
      this.save(p).then(() => { toast('Office profile saved.'); if (then) setTimeout(then, 0); });
    } }] });
  },
};

const OfficeLetter = {
  T: {
    bn: { memo: 'স্মারক নং', date: 'তারিখ', subject: 'বিষয়', ref: 'সূত্র', att: 'সংযুক্তি', phone: 'ফোন', email: 'ইমেইল', copy: 'সংরক্ষণ নথি।', byOrder: 'রাষ্ট্রপতির আদেশক্রমে,',
      ccHead: 'সদয় জ্ঞাতার্থে/জ্ঞাতার্থে ও প্রয়োজনীয় ব্যবস্থা গ্রহণের জন্য (জ্যেষ্ঠতার ক্রমানুসারে নয়):', distHead: 'বিতরণ (জ্যেষ্ঠতার ক্রমানুসারে নয়):',
      ph: { org: '[মন্ত্রণালয় / দপ্তরের নাম]', name: '[নাম]', title: '[পদবি]', num: '[নম্বর]', memo: '[স্মারক নম্বর]', subject: '[পত্রের বিষয়]', to: ['[প্রাপকের পদবি]', '[দপ্তরের নাম]', '[ঠিকানা]'] } },
    en: { memo: 'Memo No', date: 'Date', subject: 'Subject', ref: 'Ref', att: 'Enclosure', phone: 'Phone', email: 'Email', copy: 'Office copy.', byOrder: 'By order of the President,',
      ccHead: 'Copy for kind information and necessary action (not in order of seniority):', distHead: 'Distribution (not in order of seniority):',
      ph: { org: '[Ministry / Office]', name: '[Name]', title: '[Designation]', num: '[Number]', memo: '[Memo No.]', subject: '[Subject of the letter]', to: ['[Designation of the addressee]', '[Office]', '[Address]'] } },
  },
  type(id) { return LETTER_TYPES.find(t => t.id === id) || LETTER_TYPES[0]; },
  digits(s, L) { return L === 'bn' ? bengaliNum(String(s)) : enDigits(String(s)); },
  /* the memo number: the profile's first part and the number (a [field] when there is none) */
  memo(p, L, num) {
    const T = this.T[L], pre = this.digits((p.memo || '').trim(), L);
    const n = num != null && String(num).trim() ? this.digits(String(num).trim(), L) : (p.next ? this.digits(p.next, L) : T.ph.num);
    if (!pre) return p.next || num ? n : T.ph.memo;
    return pre + (/[.\-/\s]$/.test(pre) ? '' : '.') + n;
  },
  /* ---------- the letter's parts (HTML) ---------- */
  header(p, L) {
    const f = p[L], T = this.T[L], out = [];
    const line = (v, bold) => `<p style="text-align:center;margin:0">${bold ? '<b>' : ''}${esc(v)}${bold ? '</b>' : ''}</p>`;
    if (f.gov) out.push(line(f.gov, true));
    if (f.org) out.push(line(f.org, true));
    if (f.office) out.push(line(f.office, !f.org));
    if (!f.org && !f.office) out.push(line(T.ph.org, true));
    if (f.branch) out.push(line(f.branch));
    if (f.address) out.push(line(f.address));
    if (p.web) out.push(line(p.web));
    if (!p.logo) return out.join('') + '<p style="margin:0"><br></p>';
    // the logo on the left, the names centred on the page
    return `<table class="tbl-bd" data-fit="window" style="width:100%"><colgroup><col style="width:18%"><col style="width:64%"><col style="width:18%"></colgroup><tbody><tr>`
      + `<td style="vertical-align:middle;padding-left:0"><p style="margin:0"><img src="${p.logo}" alt="Logo" style="width:${L === 'bn' ? 64 : 60}px"></p></td><td style="vertical-align:middle">${out.join('')}</td><td><p style="margin:0"><br></p></td></tr></tbody></table><p style="margin:0"><br></p>`;
  },
  /* স্মারক নম্বর on the left; তারিখ on the right, the Bangla date over the English one (English letters: the date) */
  memoRow(L, memoText, date) {
    const T = this.T[L];
    if (L === 'en') return `<table class="tbl-bd" data-fit="window" style="width:100%"><colgroup><col style="width:62%"><col style="width:38%"></colgroup><tbody><tr><td style="padding-left:0"><p>${T.memo}: ${esc(memoText)}</p></td><td style="padding-right:0"><p style="text-align:right">${T.date}: ${esc(BnDate.fmt(date, 'en-dmy', { pad: !!Prefs.datePad }))}</p></td></tr></tbody></table>`;
    const [a, b] = BnDate.lines(date, { pad: !!Prefs.datePad });
    return `<table class="tbl-bd" data-fit="window" style="width:100%"><colgroup><col style="width:56%"><col style="width:10%"><col style="width:34%"></colgroup><tbody>`
      + `<tr><td rowspan="2" style="vertical-align:middle;padding-left:0;padding-right:0"><p>${T.memo}: ${esc(memoText)}</p></td><td rowspan="2" style="vertical-align:middle;padding-right:2pt"><p style="text-align:right">${T.date}:</p></td><td style="border-bottom:0.75pt solid #000000"><p style="text-align:center">${esc(a)}</p></td></tr>`
      + `<tr><td><p style="text-align:center">${esc(b)}</p></td></tr></tbody></table>`;
  },
  /* বিষয় and সূত্র: their text lined up after the labels */
  subjectRef(L, o) {
    const T = this.T[L], w = L === 'en' ? 13 : 9;
    let rows = `<tr><td style="padding-left:0"><p>${T.subject}:</p></td><td><p><b>${esc(o.subject || '') || T.ph.subject}</b></p></td></tr>`;
    if (o.ref) rows += `<tr><td style="padding-left:0"><p>${T.ref}:</p></td><td><p>${esc(o.ref)}</p></td></tr>`;
    return `<table class="tbl-bd" data-fit="window" style="width:100%;margin-top:6pt"><colgroup><col style="width:${w}%"><col style="width:${100 - w}%"></colgroup><tbody>${rows}</tbody></table>`;
  },
  body(type, L, hasRef) {
    const P = (t, first) => `<p style="text-align:justify;text-indent:36pt${first ? ';margin-top:8pt' : ''}">${t}</p>`;
    if (L === 'en') {
      if (type === 'en-order') return P('[The order: who takes which duty, from when].', true) + P('2. This order will take effect immediately.');
      return P(`With reference to the above ${hasRef ? 'subject and reference' : 'subject'}, I am directed to inform you that [the main point of the letter].`, true) + P('2. [Next paragraph].') + P('3. You are requested to take necessary action accordingly.');
    }
    if (type === 'adesh') return P('[আদেশের বিষয়বস্তু: কাকে, কী দায়িত্ব, কবে থেকে]।', true) + P('২। এ আদেশ অবিলম্বে কার্যকর হবে।');
    if (type === 'proggapon') return P('[প্রজ্ঞাপনের বিষয়বস্তু]।', true) + P('২। জনস্বার্থে জারীকৃত এ আদেশ অবিলম্বে কার্যকর হবে।');
    if (type === 'notice') return P('[নোটিশের বিষয়বস্তু]।', true) + P('২। [পরবর্তী অনুচ্ছেদ]।');
    return P(`উপর্যুক্ত ${hasRef ? 'বিষয় ও সূত্রের' : 'বিষয়ের'} পরিপ্রেক্ষিতে জানানো যাচ্ছে যে, [পত্রের মূল বক্তব্য]।`, true) + P('২। [পরবর্তী অনুচ্ছেদ]।') + P('৩। এমতাবস্থায়, বিষয়টি বিবেচনাপূর্বক প্রয়োজনীয় ব্যবস্থা গ্রহণের জন্য নির্দেশক্রমে অনুরোধ করা হলো।');
  },
  /* the signature block on the right: room to sign, (name), designation, phone, email */
  signature(p, L, o = {}) {
    const f = p[L], T = this.T[L], st = 'text-align:center;margin:0 0 0 230pt';
    const out = [];
    if (o.byOrder) out.push(`<p style="${st};margin-top:10pt">${T.byOrder}</p>`);
    out.push(`<p style="${st}${o.byOrder ? '' : ';margin-top:10pt'}"><br></p>`, `<p style="${st}"><br></p>`);
    out.push(`<p style="${st}">(${esc(f.name) || T.ph.name})</p>`, `<p style="${st}">${esc(f.title) || T.ph.title}</p>`);
    if (!o.short && p.phone) out.push(`<p style="${st}">${T.phone}: ${esc(this.digits(p.phone, L))}</p>`);
    if (!o.short && p.email) out.push(`<p style="${st}">${T.email}: ${esc(p.email)}</p>`);
    return out.join('');
  },
  /* the addressee: its parts on lines, the place kept with the last one ("বাংলাদেশ সচিবালয়, ঢাকা।") */
  toBlock(list, L) {
    const T = this.T[L];
    const blocks = (list.length ? list : [null]).map(a => {
      if (!a) return T.ph.to;
      const ps = a.split(/\s*,\s*/).filter(Boolean);
      return ps.length > 2 ? ps.slice(0, -2).concat(ps.slice(-2).join(', ')) : [ps.join(', ')];
    });
    return '<p style="margin:10pt 0 0"><br></p>' + blocks.map((ls, i) => (i ? '<p style="margin:0"><br></p>' : '') + ls.map(x => `<p style="margin:0">${esc(x)}</p>`).join('')).join('');
  },
  /* the copies: the memo number again with /১(n), the date, a heading and the list ১), ২) … */
  copies(p, L, type, memoText, date, list, officeCopy) {
    const T = this.T[L], items = list.map(esc).concat(officeCopy ? [T.copy] : []);
    if (!items.length) return '';
    const n = items.length, memo2 = memoText + (L === 'en' ? `/1(${n})` : `/১(${bengaliNum(n)})`);
    const head = this.type(type).to ? T.ccHead : T.distHead;
    return '<p style="margin:10pt 0 0"><br></p>' + this.memoRow(L, memo2, date)
      + `<p style="margin-top:6pt">${head}</p><ol style="list-style-type:${L === 'en' ? 'decimal-paren' : 'bn-close'}">${items.map(t => `<li>${t}</li>`).join('')}</ol>`
      + this.signature(p, L, { short: true });
  },
  /* the whole letter */
  html(o, p) {
    const t = this.type(o.type), L = t.lang;
    const memoText = o.memo || this.memo(p, L);
    let x = this.header(p, L) + this.memoRow(L, memoText, o.date);
    if (t.title) x += `<p style="text-align:center;margin-top:12pt"><b><u>${t.title}</u></b></p>`;
    if (o.subject || o.ref || t.to) x += this.subjectRef(L, o);
    x += this.body(t.id, L, !!o.ref);
    if (o.att) x += `<p style="margin-top:8pt">${this.T[L].att}: ${esc(o.att)}</p>`;
    x += this.signature(p, L, { byOrder: t.byOrder });
    if (t.to) x += this.toBlock(o.to || [], L);
    x += this.copies(p, L, t.id, memoText, o.date, o.cc || [], o.officeCopy !== false);
    return x;
  },
  /* the new document: A4, office margins, the letter's language and font; page numbers at the
     top from page 2 (- ২ -) */
  model(o, p) {
    const t = this.type(o.type), L = t.lang;
    const over = {
      title: (o.subject ? `${t.name}: ${o.subject}` : t.name).slice(0, 120), html: this.html(o, p),
      font: 'Times New Roman', size: L === 'bn' ? 13 : 12, line: 1.15, after: 6, lang: L === 'bn' ? 'bn-BD' : 'en-GB',
      page: { mt: 96, mb: 72, ml: 120, mr: 72 },
    };
    if (L === 'bn') over.pn = { start: null, fmt: 'bn' };
    if (o.pages !== false) {
      over.firstDiff = true;
      over.hf = { header: { def: `<p style="text-align:center;margin:0" data-pn=""><span style="font-size:10pt">- <span class="hff" data-f="PAGE"${L === 'bn' ? ' data-num="bn"' : ''} contenteditable="false">${L === 'bn' ? '২' : '2'}</span> -</span></p>`, first: '', even: '' }, footer: { def: '', first: '', even: '' } };
    }
    return newDocModel(over);
  },
  /* File › New's picture of it */
  sample() {
    const p = Office.prof && Office.prof.saved ? Office.prof : Office.blank();
    return { title: 'সরকারি পত্র', html: this.html({ type: 'patra', date: new Date(), cc: [], subject: '' }, p), over: { font: 'Times New Roman', size: 13 } };
  },
  /* File › New › সরকারি পত্র: the letter's details (the office profile first, the first time) */
  async start(type) {
    const p = await Office.load();
    if (!p.saved) { Office.edit(() => this.start(type), { first: true }); return; }
    let t = this.type(type || Prefs.letterType || 'patra');
    const tsel = select(LETTER_TYPES.map(x => [x.id, x.name]), t.id, { id: 'olType' });
    const memo = input('', { id: 'olMemo', spellcheck: 'false' });
    let memoTouched = false;
    memo.addEventListener('input', () => { memoTouched = true; });
    const iso = d => `${d.getFullYear()}-${BnDate.en(d.getMonth() + 1, true)}-${BnDate.en(d.getDate(), true)}`;
    let day = new Date();
    const dIn = input(iso(day), { type: 'date', id: 'olDate' });
    const dNote = h('span', { class: 'note ol-dnote' });
    const subject = input('', { id: 'olSubject', 'data-avro': '' });
    const ref = input('', { id: 'olRef', 'data-avro': '' });
    const att = input('', { id: 'olAtt', 'data-avro': '' });
    const addrs = p.addrs.slice();
    const pick = { to: new Set(), cc: new Set() };
    const list = h('div', { class: 'ol-addrs' });
    const newAddr = input('', { id: 'olNewAddr', 'data-avro': '', 'data-own-enter': '', placeholder: 'Another address: designation, office, place' });
    const addBtn = h('button', { class: 'btn', type: 'button' }, 'Add');
    const ck = id => { const c = h('input', { type: 'checkbox', id }); c.checked = true; const t2 = h('span'); return { el: h('label', { class: 'check' }, c, t2), input: c, text: t2 }; };
    const office = ck('olOffice'), pages = ck('olPages');
    const labels = {};
    const lab = (id, text) => (labels[id] = h('label', { for: id }, text));
    const drawAddrs = () => {
      list.innerHTML = '';
      if (!addrs.length) list.appendChild(h('p', { class: 'note', style: { margin: '4px 0' } }, t.lang === 'en' ? 'No saved addresses yet: add one below (it is kept in the office profile).' : 'কোনো ঠিকানা নেই: নিচে যোগ করুন (অফিস প্রোফাইলে থেকে যাবে)।'));
      addrs.forEach((a, i) => {
        const row = h('div', { class: 'ol-addr' }, h('span', { class: 'ol-at' }, a));
        for (const k of t.to ? ['to', 'cc'] : ['cc']) {
          const c = h('input', { type: 'checkbox', 'aria-label': (k === 'to' ? 'To: ' : 'Copy: ') + a });
          c.checked = pick[k].has(a);
          c.addEventListener('change', () => { if (c.checked) pick[k].add(a); else pick[k].delete(a); });
          row.appendChild(h('label', { class: 'ol-ck' }, c, k === 'to' ? (t.lang === 'en' ? 'To' : 'প্রাপক') : (t.lang === 'en' ? 'Copy' : 'অনুলিপি')));
        }
        const rm = h('button', { class: 'tb-btn ol-rm', type: 'button', 'aria-label': 'Remove ' + a, title: 'Remove from the saved addresses', html: icon('close') });
        rm.addEventListener('click', () => { addrs.splice(i, 1); pick.to.delete(a); pick.cc.delete(a); drawAddrs(); });
        row.appendChild(rm);
        list.appendChild(row);
      });
    };
    const add = () => { const v = newAddr.value.trim(); if (!v) return; if (!addrs.includes(v)) addrs.push(v); (t.to && !pick.to.size ? pick.to : pick.cc).add(v); newAddr.value = ''; drawAddrs(); };
    addBtn.addEventListener('click', add);
    newAddr.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); add(); } });
    const sync = () => {
      const L = t.lang, T = this.T[L];
      if (!memoTouched) memo.value = this.memo(p, L);
      labels.olMemo.textContent = T.memo; labels.olDate.textContent = T.date; labels.olSubject.textContent = T.subject;
      labels.olRef.textContent = T.ref + (L === 'en' ? ' (if any)' : ' (থাকলে)'); labels.olAtt.textContent = T.att + (L === 'en' ? ' (if any)' : ' (থাকলে)');
      office.text.textContent = L === 'en' ? 'Office copy at the end of the list' : 'তালিকার শেষে সংরক্ষণ নথি';
      pages.text.textContent = L === 'en' ? 'Page numbers from page 2 (- 2 -)' : 'পৃষ্ঠা নম্বর দ্বিতীয় পৃষ্ঠা থেকে (- ২ -)';
      dNote.textContent = L === 'en' ? BnDate.fmt(day, 'en-dmy') : BnDate.lines(day, { pad: !!Prefs.datePad }).join(' / ');
      drawAddrs();
    };
    tsel.addEventListener('change', () => { const was = t.lang; t = this.type(tsel.value); if (was !== t.lang && memoTouched) memo.value = this.digits(memo.value, t.lang); sync(); });
    dIn.addEventListener('change', () => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dIn.value); if (m) { day = new Date(+m[1], +m[2] - 1, +m[3]); sync(); } });
    const prof = h('button', { class: 'link-btn', type: 'button' }, 'Office profile…');
    let dlg = null;
    prof.addEventListener('click', () => { if (dlg) dlg.close(false); Office.edit(() => this.start(t.id)); });
    const who = [p.bn.org || p.bn.office || p.en.org || p.en.office, p.bn.name || p.en.name].filter(Boolean).join(' · ');
    const body = h('div', { class: 'ol-dlg' },
      h('div', { class: 'ol-office' }, h('span', { class: 'note' }, who || 'Office profile'), prof),
      h('div', { class: 'field' }, h('label', { for: 'olType' }, 'Type'), tsel),
      h('div', { class: 'of-grid' }, h('div', { class: 'field' }, lab('olMemo', ''), memo), h('div', { class: 'field' }, lab('olDate', ''), h('div', { class: 'ol-date' }, dIn, dNote))),
      h('div', { class: 'field' }, lab('olSubject', ''), subject),
      h('div', { class: 'of-grid' }, h('div', { class: 'field' }, lab('olRef', ''), ref), h('div', { class: 'field' }, lab('olAtt', ''), att)),
      h('div', { class: 'flabel' }, 'Addresses (প্রাপক, অনুলিপি / বিতরণ)'), list,
      h('div', { class: 'ol-new' }, newAddr, addBtn),
      office.el, pages.el);
    sync();
    dlg = openDialog({ title: 'Government Letter', width: 640, body, focus: '#olSubject', buttons: [{ label: 'Cancel' }, { label: 'Create', primary: true, onClick: () => {
      add();
      const o = { type: t.id, date: day, memo: memo.value.trim(), subject: subject.value.trim(), ref: ref.value.trim(), att: att.value.trim(),
        to: addrs.filter(a => pick.to.has(a)), cc: addrs.filter(a => pick.cc.has(a)), officeCopy: office.input.checked, pages: pages.input.checked };
      // the next letter's number: one after this one's
      const np = Object.assign({}, p, { addrs });
      if (p.next) { const m = /(\d+)\D*$/.exec(enDigits(o.memo)); np.next = String((m ? parseInt(m[1], 10) : parseInt(enDigits(p.next), 10)) + 1); }
      Prefs.letterType = t.id; savePrefs();
      Office.save(np);
      this.create(o, np);
    } }] });
  },
  create(o, p) {
    Saver.flush();
    openDoc(this.model(o, p), { fresh: true });
    Saver.mark();
    // the first thing to write: the subject when there was none, else the letter's text
    setTimeout(() => { if (Fields.matches().length) Fields.next(); }, 120);
  },
  /* Insert › Office Letter: its parts at the cursor, in the document's language */
  lang() { return /^bn/.test(S.doc.lang || '') || /[ঀ-৿]/.test((docBody().textContent || '').slice(0, 3000)) ? 'bn' : 'en'; },
  async insertPart(part) {
    if (S.readOnly) return;
    const p = await Office.load(), L = this.lang(), d = new Date();
    const html = part === 'header' ? this.header(p, L)
      : part === 'memo' ? this.memoRow(L, this.memo(p, L), d)
      : part === 'subject' ? this.subjectRef(L, { ref: L === 'en' ? '[Reference]' : '[সূত্র]' })
      : part === 'signature' ? this.signature(p, L)
      : this.copies(p, L, 'patra', this.memo(p, L), d, [L === 'en' ? '[Addressee]' : '[প্রাপক]'], true).replace(/^<p style="margin:10pt 0 0"><br><\/p>/, '');
    focusEditor();
    change(() => {
      const box = document.createElement('div');
      box.innerHTML = html;
      const frag = document.createDocumentFragment();
      while (box.firstChild) frag.appendChild(box.firstChild);
      if (S.track) Track.markFragment(frag);
      insertFragment(frag);
    }, { full: true });
    if (!p.saved && part !== 'subject') toast('Fill in Insert › Office Letter › Office Profile to have your office’s details here.', { ms: 6000 });
  },
  menuItems() {
    return [
      { label: 'New Government Letter…', icon: 'govLetter', onClick: () => this.start() },
      { head: 'At the cursor' },
      { label: 'Office Name (header)', onClick: () => this.insertPart('header') },
      { label: 'Memo Number and Date (স্মারক নং, তারিখ)', onClick: () => this.insertPart('memo') },
      { label: 'Subject and Reference (বিষয়, সূত্র)', onClick: () => this.insertPart('subject') },
      { label: 'Signature Block', onClick: () => this.insertPart('signature') },
      { label: 'Copies and Distribution (বিতরণ)', onClick: () => this.insertPart('copies') },
      '-', { label: 'Office Profile…', icon: 'gear', onClick: () => Office.edit() },
    ];
  },
};
