/* ===================== Bangla and English dates =====================
   The Bangla calendar (বঙ্গাব্দ) as Bangladesh keeps it, revised by the Bangla Academy from 1426
   (14 April 2019) so the national days keep their dates: Pahela Baishakh is 14 April; Baishakh to
   Ashwin have 31 days; Kartik, Agrahayan, Poush, Magh and Chaitra 30; Falgun 29, or 30 when that
   February has 29 days. Before 1426, the 1987 rule: Baishakh to Bhadra 31 days, the rest 30,
   Falgun 31 in a leap year.
   Insert › Date & Time puts a date in as Bangladeshi letters write it (the letter date block:
   ৪ কার্তিক ১৪৩৩ বঙ্গাব্দ over ২০ অক্টোবর ২০২৬ খ্রিস্টাব্দ), in either calendar, in English or in
   Bangla; More Formats picks another day (by either calendar, so it converts between them), and a
   date selected in the text comes up in it, to be written again in another calendar or format.
   Spelling as the Bangla Academy has it (জানুয়ারি, খ্রিস্টাব্দ). */
const BS_MONTHS = ['বৈশাখ', 'জ্যৈষ্ঠ', 'আষাঢ়', 'শ্রাবণ', 'ভাদ্র', 'আশ্বিন', 'কার্তিক', 'অগ্রহায়ণ', 'পৌষ', 'মাঘ', 'ফাল্গুন', 'চৈত্র'];
const BS_MONTHS_EN = ['Baishakh', 'Jaishtha', 'Asharh', 'Shraban', 'Bhadra', 'Ashwin', 'Kartik', 'Agrahayan', 'Poush', 'Magh', 'Falgun', 'Chaitra'];
const BN_GMONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
const BN_WEEKDAYS = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];
const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const EN_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function gLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
/* the days in month m (0: Baishakh) of Bangla year y; its Falgun is in February of year y + 594 */
function bsMonthLen(y, m) {
  const leap = gLeap(y + 594);
  if (y >= 1426) return m < 6 ? 31 : m === 10 ? (leap ? 30 : 29) : 30;
  return m < 5 ? 31 : m === 10 && leap ? 31 : 30;
}
/* a day's Bangla date: { y, m (0–11), d, wd (0: Sunday) } */
function toBs(date) {
  const gy = date.getFullYear(), t = Date.UTC(gy, date.getMonth(), date.getDate());
  const y0 = t < Date.UTC(gy, 3, 14) ? gy - 1 : gy, y = y0 - 593;
  let days = Math.round((t - Date.UTC(y0, 3, 14)) / 864e5), m = 0;
  while (m < 11 && days >= bsMonthLen(y, m)) { days -= bsMonthLen(y, m); m++; }
  return { y, m, d: days + 1, wd: date.getDay() };
}
/* the day of a Bangla date (null: no such day) */
function fromBs(y, m, d) {
  if (!(y >= 1) || !(m >= 0 && m < 12) || !(d >= 1 && d <= bsMonthLen(y, m))) return null;
  let days = d - 1;
  for (let k = 0; k < m; k++) days += bsMonthLen(y, k);
  return new Date(y + 593, 3, 14 + days);
}
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
function enDigits(s) { return String(s).replace(/[০-৯]/g, d => BN_DIGITS.indexOf(d)); }
const BnDate = {
  num(n, pad) { let s = String(n); if (pad && s.length < 2) s = '0' + s; return s.replace(/\d/g, x => BN_DIGITS[x]); },
  en(n, pad) { const s = String(n); return pad && s.length < 2 ? '0' + s : s; },
  /* the formats, by group: [id, group] */
  FORMATS: [
    ['block', 'both'], ['dual', 'both'], ['en-block', 'both'], ['en-dual', 'both'],
    ['bs', 'bs'], ['bs-plain', 'bs'], ['bs-wd', 'bs'], ['bs-my', 'bs'],
    ['g-bn', 'g'], ['g-bn-plain', 'g'], ['g-bn-wd', 'g'], ['g-bn-num', 'g'], ['g-bn-dash', 'g'],
    ['en-dmy', 'en'], ['en-mdy', 'en'], ['en-wd', 'en'], ['en-short', 'en'], ['en-num', 'en'], ['en-iso', 'en'], ['bs-en', 'en'],
    ['t-en', 'time'], ['t-bn', 'time'],
  ],
  GROUPS: { both: 'Both calendars (letters)', bs: 'বঙ্গাব্দ · Bangla calendar', g: 'খ্রিস্টাব্দ · in Bangla', en: 'English', time: 'Time' },
  /* the two lines of a letter's date: [Bangla calendar, Gregorian] */
  lines(date, o = {}) {
    const p = !!o.pad, b = toBs(date), D = date.getDate(), M = date.getMonth(), Y = date.getFullYear();
    if (o.lang === 'en') return [`${this.en(b.d, p)} ${BS_MONTHS_EN[b.m]} ${b.y} BS`, `${this.en(D, p)} ${EN_MONTHS[M]} ${Y}`];
    return [`${this.num(b.d, p)} ${BS_MONTHS[b.m]} ${this.num(b.y)} বঙ্গাব্দ`, `${this.num(D, p)} ${BN_GMONTHS[M]} ${this.num(Y)} খ্রিস্টাব্দ`];
  },
  fmt(date, id, o = {}) {
    const p = !!o.pad, b = toBs(date), D = date.getDate(), M = date.getMonth(), Y = date.getFullYear(), wd = date.getDay();
    const bs = `${this.num(b.d, p)} ${BS_MONTHS[b.m]} ${this.num(b.y)}`, gb = `${this.num(D, p)} ${BN_GMONTHS[M]} ${this.num(Y)}`;
    const ge = `${this.en(D, p)} ${EN_MONTHS[M]} ${Y}`, be = `${this.en(b.d, p)} ${BS_MONTHS_EN[b.m]} ${b.y} BS`;
    switch (id) {
      case 'block': case 'dual': return `${bs} বঙ্গাব্দ / ${gb} খ্রিস্টাব্দ`;
      case 'en-block': return `${be} / ${ge}`;
      case 'en-dual': return `${ge} (${be})`;
      case 'bs': return bs + ' বঙ্গাব্দ';
      case 'bs-plain': return bs;
      case 'bs-wd': return `${BN_WEEKDAYS[wd]}, ${bs} বঙ্গাব্দ`;
      case 'bs-my': return `${BS_MONTHS[b.m]} ${this.num(b.y)} বঙ্গাব্দ`;
      case 'g-bn': return gb + ' খ্রিস্টাব্দ';
      case 'g-bn-plain': return gb;
      case 'g-bn-wd': return `${BN_WEEKDAYS[wd]}, ${gb}`;
      case 'g-bn-num': return `${this.num(D, true)}/${this.num(M + 1, true)}/${this.num(Y)}`;
      case 'g-bn-dash': return `${this.num(D, true)}-${this.num(M + 1, true)}-${this.num(Y)}`;
      case 'en-dmy': return ge;
      case 'en-mdy': return `${EN_MONTHS[M]} ${this.en(D, p)}, ${Y}`;
      case 'en-wd': return `${EN_WEEKDAYS[wd]}, ${ge}`;
      case 'en-short': return `${this.en(D, p)} ${EN_MONTHS[M].slice(0, 3)} ${Y}`;
      case 'en-num': return `${this.en(D, true)}/${this.en(M + 1, true)}/${Y}`;
      case 'en-iso': return `${Y}-${this.en(M + 1, true)}-${this.en(D, true)}`;
      case 'bs-en': return be;
      case 't-en': { const hh = date.getHours(); return `${hh % 12 || 12}:${this.en(date.getMinutes(), true)} ${hh < 12 ? 'AM' : 'PM'}`; }
      case 't-bn': { const hh = date.getHours(); return `${this.dayPart(hh)} ${this.num(hh % 12 || 12)}:${this.num(date.getMinutes(), true)}`; }
    }
    return '';
  },
  /* ভোর, সকাল, দুপুর, বিকাল, সন্ধ্যা, রাত */
  dayPart(hh) { return hh >= 4 && hh < 6 ? 'ভোর' : hh >= 6 && hh < 12 ? 'সকাল' : hh >= 12 && hh < 15 ? 'দুপুর' : hh >= 15 && hh < 18 ? 'বিকাল' : hh >= 18 && hh < 20 ? 'সন্ধ্যা' : 'রাত'; },
  isBlock(id) { return id === 'block' || id === 'en-block'; },
  /* the letter date block: তারিখ: beside the Bangla date over the Gregorian one, a line between
     (a small table without borders, on the right; Word gets the same) */
  blockHtml(date, o = {}) {
    const [a, b] = this.lines(date, o), lab = o.lang === 'en' ? 'Date:' : 'তারিখ:';
    return `<table class="tbl-bd" data-fit="contents" style="table-layout:auto;margin-left:auto;margin-right:0"><tbody>`
      + `<tr><td rowspan="2" style="vertical-align:middle;padding-right:2pt"><p>${esc(lab)}</p></td><td style="border-bottom:0.75pt solid #000000"><p style="text-align:center">${esc(a)}</p></td></tr>`
      + `<tr><td><p style="text-align:center">${esc(b)}</p></td></tr></tbody></table>`;
  },
  insert(id, date = new Date(), o = {}) {
    if (S.readOnly) return;
    if (!this.isBlock(id)) { insertTextAtCaret(this.fmt(date, id, o)); return; }
    // in a text box or a note the two lines go in one ("… বঙ্গাব্দ / … খ্রিস্টাব্দ")
    if (Story.cur && Story.cur.type !== 'hf') { insertTextAtCaret(this.fmt(date, id, o)); return; }
    focusEditor();
    change(() => {
      const box = document.createElement('div');
      box.innerHTML = this.blockHtml(date, { pad: o.pad, lang: id === 'en-block' ? 'en' : 'bn' });
      const frag = document.createDocumentFragment();
      while (box.firstChild) frag.appendChild(box.firstChild);
      if (S.track) Track.markFragment(frag);
      insertFragment(frag);
    }, { full: true });
  },
  /* a date written in either calendar, in Bangla or English (null: not a date) */
  parse(s) {
    s = enDigits(String(s || '')).normalize('NFC').replace(/\s+/g, ' ').trim();
    s = s.replace(/^(তারিখ|date)\s*[:ঃ]\s*/i, '').split(/\s+\/\s+|\s*\(/)[0];
    s = s.replace(/[,।.\s]+$/, '').replace(/\s*(বঙ্গাব্দ|খ্রিস্টাব্দ|খ্রিষ্টাব্দ|খ্রিঃ|খ্রি\.?|ইং|সাল)$/, '').replace(/(\d)\s*(b\.?s|a\.?d)\.?$/i, '$1').trim();
    s = s.replace(new RegExp('^(' + BN_WEEKDAYS.concat(EN_WEEKDAYS, EN_WEEKDAYS.map(w => w.slice(0, 3))).join('|') + ')\\s*,?\\s*', 'i'), '');
    const ok = (y, m, d) => { const t = new Date(y, m, d); return t.getFullYear() === y && t.getMonth() === m && t.getDate() === d ? t : null; };
    let m;
    if ((m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(s))) return ok(+m[3], +m[2] - 1, +m[1]);
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) return ok(+m[1], +m[2] - 1, +m[3]);
    if ((m = /^(\d{1,2})(?:st|nd|rd|th)?\s*(?:-\s*)?([^\d\s,]+)\s*,?\s*(\d{4})$/i.exec(s)) || (m = /^([^\d\s,]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s*(\d{4})$/i.exec(s))) {
      const day = /^\d/.test(m[1]) ? +m[1] : +m[2], word = (/^\d/.test(m[1]) ? m[2] : m[1]).replace(/[-.]+$/, ''), y = +m[3];
      const mo = this.month(word);
      if (!mo) return null;
      return mo.bs ? fromBs(y, mo.m, day) : ok(y, mo.m, day);
    }
    return null;
  },
  /* a month's name: { m, bs } (bs: a Bangla calendar month) */
  month(w) {
    const lw = w.toLocaleLowerCase().replace(/\.$/, '');
    const alt = { 'জানুয়ারী': 0, 'ফেব্রুয়ারী': 1, 'আগষ্ট': 7, 'সেপ্টেম্বার': 8, 'অক্টোবার': 9 };
    const bsAlt = { 'জৈষ্ঠ': 1, 'জৈষ্ঠ্য': 1, 'আষাড়': 2, 'শ্রাবন': 3, 'অগ্রহায়ন': 7, 'অঘ্রান': 7, 'অঘ্রাণ': 7, 'ফালগুন': 10 };
    const bsEn = { boishakh: 0, baishakh: 0, boisakh: 0, jaishtha: 1, joishtho: 1, jyoishtho: 1, jaistha: 1, ashar: 2, asharh: 2, asadh: 2, ashadh: 2, shraban: 3, srabon: 3, shrabon: 3, sraban: 3, bhadra: 4, bhadro: 4, ashwin: 5, ashshin: 5, ashin: 5, kartik: 6, karthik: 6, agrahayan: 7, ogrohayon: 7, agrahayon: 7, poush: 8, paush: 8, push: 8, magh: 9, falgun: 10, phalgun: 10, chaitra: 11, choitro: 11, chaitro: 11 };
    let i = BS_MONTHS.indexOf(w);
    if (i >= 0) return { m: i, bs: true };
    if (bsAlt[w] != null) return { m: bsAlt[w], bs: true };
    if (bsEn[lw] != null) return { m: bsEn[lw], bs: true };
    i = BN_GMONTHS.indexOf(w);
    if (i >= 0) return { m: i };
    if (alt[w] != null) return { m: alt[w] };
    if (/^[a-z]{3,}$/.test(lw)) { i = EN_MONTHS.findIndex(x => x.toLowerCase().startsWith(lw.slice(0, 3)) && x.toLowerCase().startsWith(lw.slice(0, Math.min(lw.length, x.length)))); if (i >= 0) return { m: i }; }
    return null;
  },
  /* the quick list (Insert › Date & Time) */
  menuItems() {
    const d = new Date(), o = { pad: !!Prefs.datePad };
    const item = id => ({ label: this.isBlock(id) ? (id === 'block' ? 'Letter date: তারিখ: ' : 'Letter date: Date: ') + this.fmt(d, id, o) : this.fmt(d, id, o), onClick: () => { this.insert(id, new Date(), o); } });
    return [
      { head: 'English' }, ...['en-dmy', 'en-mdy', 'en-num', 'en-iso', 'en-wd'].map(item),
      { head: 'বাংলা' }, ...['block', 'bs', 'g-bn', 'dual'].map(item),
      { head: 'Time' }, ...['t-en', 't-bn'].map(item),
      '-', { label: 'More Formats and Other Dates…', icon: 'date', onClick: () => this.dialog() },
    ];
  },
  /* today's dates for a [Date] or [তারিখ] field */
  fieldChoices(name) {
    const d = new Date(), o = { pad: !!Prefs.datePad };
    const bn = /[ঀ-৿]/.test(name);
    return (bn ? ['dual', 'bs', 'g-bn', 'g-bn-plain', 'g-bn-num'] : ['en-dmy', 'en-mdy', 'en-num', 'en-dual', 'bs-en']).map(id => this.fmt(d, id, o));
  },
  /* AutoComplete: the start of this month's name (either calendar) brings today's date */
  complete(prefix) {
    const out = [];
    if (prefix.length < 3 || !/^[ঀ-৿]+$/.test(prefix)) return out;
    const p = prefix.normalize('NFC'), d = new Date(), b = toBs(d), o = { pad: !!Prefs.datePad };
    if (BS_MONTHS[b.m].startsWith(p) && BS_MONTHS[b.m] !== p) out.push({ label: this.fmt(d, 'bs', o), text: this.fmt(d, 'bs', o), kind: 'Today' });
    if (BN_GMONTHS[d.getMonth()].startsWith(p) && BN_GMONTHS[d.getMonth()] !== p) out.push({ label: this.fmt(d, 'g-bn', o), text: this.fmt(d, 'g-bn', o), kind: 'Today' });
    for (const w of BS_MONTHS.concat(BN_GMONTHS, BN_WEEKDAYS)) if (w.startsWith(p) && w.length > p.length && !out.some(x => x.text === w)) out.push({ label: w, text: w, kind: '' });
    return out;
  },
  /* Insert › Date & Time › More Formats: any day, by either calendar; a date selected in the
     text is read and written again in the format picked */
  dialog() {
    if (S.readOnly) return;
    const r0 = getRange() || lastRange;
    const inText = r0 && !r0.collapsed && S.editor.contains(r0.startContainer);
    const selText = inText ? r0.toString().trim() : '';
    const parsed = selText && selText.length <= 80 ? this.parse(selText) : null;
    let day = parsed || new Date();
    let cur = this.FORMATS.some(f => f[0] === Prefs.dateFmt) ? Prefs.dateFmt : 'block';
    const iso = t => `${t.getFullYear()}-${this.en(t.getMonth() + 1, true)}-${this.en(t.getDate(), true)}`;
    const gIn = input(iso(day), { type: 'date', id: 'dtG' });
    const today = h('button', { class: 'btn', type: 'button', id: 'dtToday' }, 'Today');
    const bD = input('', { inputmode: 'numeric', id: 'dtBd', 'aria-label': 'Day (বঙ্গাব্দ)', class: 'input dt-n' });
    const bM = select(BS_MONTHS.map((m, i) => [String(i), m]), '0', { id: 'dtBm', 'aria-label': 'Month (বঙ্গাব্দ)' });
    const bY = input('', { inputmode: 'numeric', id: 'dtBy', 'aria-label': 'Year (বঙ্গাব্দ)', class: 'input dt-y' });
    const pad = checkbox('Two-digit day (০৪, 04)', !!Prefs.datePad, 'dtPad');
    const note = h('p', { class: 'note dt-note' });
    const list = h('div', { class: 'lstyles dt-list', role: 'listbox', 'aria-label': 'Formats', tabindex: '0' });
    const ids = this.FORMATS.map(f => f[0]);
    const syncBs = () => { const b = toBs(day); bD.value = this.num(b.d); bM.value = String(b.m); bY.value = this.num(b.y); };
    const render = () => {
      const o = { pad: pad.input.checked };
      list.innerHTML = '';
      let g = '';
      for (const [id, grp] of this.FORMATS) {
        if (grp !== g) { g = grp; list.appendChild(h('div', { class: 'dt-head', role: 'presentation' }, this.GROUPS[grp])); }
        // the letter date block as it looks: the label beside the two dates, a line between
        const two = this.isBlock(id) ? this.lines(day, Object.assign({ lang: id === 'block' ? 'bn' : 'en' }, o)) : null;
        const opt = two
          ? h('div', { class: 'lopt dt-opt', role: 'option', 'data-id': id, 'aria-selected': id === cur ? 'true' : 'false', 'aria-label': (id === 'block' ? 'তারিখ: ' : 'Date: ') + two.join(' / ') }, h('span', null, id === 'block' ? 'তারিখ:' : 'Date:'), h('span', { class: 'dt-two' }, h('span', null, two[0]), h('span', null, two[1])), h('span', { class: 'dt-tag' }, 'letter'))
          : h('div', { class: 'lopt dt-opt', role: 'option', 'data-id': id, 'aria-selected': id === cur ? 'true' : 'false' }, this.fmt(day, id, o));
        opt.addEventListener('click', () => { cur = id; render(); });
        opt.addEventListener('dblclick', () => { cur = id; const b = $('.dialog footer .btn.primary'); if (b) b.click(); });
        list.appendChild(opt);
      }
      const b = toBs(day);
      note.textContent = `${this.num(b.d)} ${BS_MONTHS[b.m]} ${this.num(b.y)} বঙ্গাব্দ = ${this.num(day.getDate())} ${BN_GMONTHS[day.getMonth()]} ${this.num(day.getFullYear())} (${BN_WEEKDAYS[day.getDay()]}) · ${EN_WEEKDAYS[day.getDay()]}, ${this.fmt(day, 'en-dmy')}`;
      const sel = list.querySelector('[aria-selected="true"]');
      if (sel && list.isConnected) { const lr = list.getBoundingClientRect(), sr = sel.getBoundingClientRect(); if (sr.top < lr.top || sr.bottom > lr.bottom) sel.scrollIntoView({ block: 'nearest' }); }
    };
    gIn.addEventListener('change', () => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(gIn.value); if (m) { day = new Date(+m[1], +m[2] - 1, +m[3]); syncBs(); render(); } });
    const fromBsIn = () => { const t = fromBs(parseInt(enDigits(bY.value), 10), +bM.value, parseInt(enDigits(bD.value), 10)); bD.classList.toggle('bad', !t); if (t) { day = t; gIn.value = iso(t); render(); } };
    bD.addEventListener('input', fromBsIn); bY.addEventListener('input', fromBsIn); bM.addEventListener('change', fromBsIn);
    today.addEventListener('click', () => { day = new Date(); gIn.value = iso(day); syncBs(); render(); });
    pad.input.addEventListener('change', render);
    list.addEventListener('keydown', e => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      cur = ids[clamp(ids.indexOf(cur) + (e.key === 'ArrowDown' ? 1 : -1), 0, ids.length - 1)];
      render();
    });
    syncBs(); render();
    const head = parsed ? h('p', { class: 'note' }, `The selected date (${selText.length > 40 ? selText.slice(0, 40) + '…' : selText}) is written again in the format you pick.`) : null;
    const body = h('div', { class: 'dt-dlg' }, head,
      h('div', { class: 'dt-row' }, h('label', { for: 'dtG', class: 'flabel' }, 'Date (খ্রিস্টাব্দ)'), h('div', { class: 'dt-ctl' }, gIn, today)),
      h('div', { class: 'dt-row' }, h('label', { for: 'dtBd', class: 'flabel' }, 'বঙ্গাব্দ'), h('div', { class: 'dt-ctl' }, bD, bM, bY)),
      note, h('div', { class: 'flabel' }, 'Format'), list, pad.el);
    openDialog({ title: 'Date and Time', width: 560, body, focus: list, buttons: [{ label: 'Cancel' }, { label: parsed ? 'Replace' : 'Insert', primary: true, onClick: () => {
      Prefs.dateFmt = cur; Prefs.datePad = pad.input.checked; savePrefs();
      const id = cur, at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), new Date().getHours(), new Date().getMinutes()), o = { pad: pad.input.checked };
      setTimeout(() => { if (lastRange) setRange(lastRange); this.insert(id, at, o); }, 0);
    } }] });
    setTimeout(render, 0);
  },
};
