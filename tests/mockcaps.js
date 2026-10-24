/* In-memory stand-ins for window.claude capabilities, shaped like the 0.2.x typings. */
(() => {
  const store = new Map(); // path -> body
  const log = window.__capLog = [];
  const saved = window.__saved = [];
  const LIMIT = 256 * 1024;
  const err = (code, message) => Object.assign(new Error(message || code), { code });
  const clone = v => JSON.parse(JSON.stringify(v));
  const snap = (path) => {
    const body = store.get(path);
    return Object.freeze({ id: path.split('/').pop(), exists: body !== undefined, data: () => (body === undefined ? undefined : clone(body)), metadata: { fromCache: false, hasPendingWrites: false } });
  };
  const delay = () => new Promise(r => setTimeout(r, 2));
  function docRef(path) {
    return {
      id: path.split('/').pop(), path,
      async get() { await delay(); log.push(['get', path]); return snap(path); },
      async set(data) {
        await delay();
        const size = new TextEncoder().encode(JSON.stringify(data)).length;
        if (size > LIMIT) throw err('invalid_argument', 'document over 256 KiB');
        if (window.__failNextWrite) { window.__failNextWrite = false; throw err('unavailable', 'flaky'); }
        log.push(['set', path, size]); store.set(path, clone(data));
      },
      async update(data) { await delay(); const cur = store.get(path); if (!cur) throw err('invalid_argument', 'missing'); store.set(path, Object.assign(clone(cur), clone(data))); },
      async delete() { await delay(); log.push(['delete', path]); store.delete(path); },
      collection(sub) { return collRef(path + '/' + sub); },
    };
  }
  function query(path, opts) {
    return {
      where(f, op, v) { return query(path, Object.assign({}, opts, { where: (opts.where || []).concat([[f, op, v]]) })); },
      orderBy(f, dir = 'asc') { return query(path, Object.assign({}, opts, { order: [f, dir] })); },
      limit(n) { return query(path, Object.assign({}, opts, { limit: n })); },
      async get() {
        await delay();
        const depth = path.split('/').length + 1;
        let docs = Array.from(store.keys()).filter(k => k.startsWith(path + '/') && k.split('/').length === depth).map(snap);
        for (const [f, op, v] of opts.where || []) docs = docs.filter(d => { const x = d.data()[f]; return op === '==' ? x === v : op === '>' ? x > v : op === '<' ? x < v : true; });
        if (opts.order) { const [f, dir] = opts.order; docs.sort((a, b) => ((a.data()[f] > b.data()[f]) ? 1 : -1) * (dir === 'desc' ? -1 : 1)); }
        if (opts.limit) docs = docs.slice(0, opts.limit);
        return { docs, size: docs.length, empty: !docs.length, docChanges: () => docs.map((d, i) => ({ type: 'added', doc: d, oldIndex: -1, newIndex: i })) };
      },
    };
  }
  function collRef(path) {
    return Object.assign(query(path, {}), {
      doc(id) { return docRef(path + '/' + (id || Math.random().toString(36).slice(2))); },
      async add(data) { const r = docRef(path + '/' + Math.random().toString(36).slice(2)); await r.set(data); return r; },
    });
  }
  const db = { doc: docRef, collection: collRef };
  const user = {
    async me() { return { id: 'user-1', name: 'Test Person', email: null, isMe: true }; },
    async id() { return 'user-1'; },
    isOwner() { return true; }, canEdit() { return true; }, can() { return true; },
    async profiles(ids) { const o = {}; for (const i of ids) o[i] = { id: i, name: i === 'user-1' ? 'Test Person' : 'Someone', isMe: i === 'user-1' }; return o; },
  };
  const downloads = {
    async save({ filename, data }) {
      if (window.__declineNextSave) { window.__declineNextSave = false; throw err('declined', 'viewer said no'); }
      const ext = (filename.split('.').pop() || '').toLowerCase();
      if (!['txt', 'json', 'md', 'docx', 'html', 'pdf', 'csv', 'zip', 'png', 'jpg', 'svg', 'xlsx', 'pptx'].includes(ext)) throw err('rejected_extension');
      const blob = data instanceof Blob ? data : new Blob([data]);
      const buf = new Uint8Array(await blob.arrayBuffer());
      let b64 = ''; for (let i = 0; i < buf.length; i += 0x8000) b64 += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      saved.push({ filename, size: buf.length, b64: btoa(b64) });
      return { status: 'saved' };
    },
  };
  const sample = async (input, opts = {}) => {
    const prompt = typeof input === 'string' ? input : input.map(m => m.content).join('\n');
    window.__lastPrompt = prompt;
    (window.__prompts = window.__prompts || []).push(prompt);
    window.__sampleCalls = (window.__sampleCalls || 0) + 1;
    if (opts.signal && opts.signal.aborted) throw err('cancelled');
    if (window.__sampleErrors && window.__sampleErrors.length) { const c = window.__sampleErrors.shift(); if (c) throw err(c); }
    if (window.__sampleWait) await window.__sampleWait;
    const reply = typeof window.__sampleFn === 'function' ? await window.__sampleFn(prompt, opts) : (window.__sampleReply || 'Here is the improved text.');
    let text = '';
    for (const w of reply.split(/(\s+)/)) {
      text += w; await delay();
      if (opts.signal && opts.signal.aborted) throw Object.assign(err('cancelled'), { text });
      if (opts.onText) opts.onText({ text, delta: w });
    }
    return { text, truncated: false };
  };
  sample.json = async (input, opts) => {
    const t = (await sample(input, opts)).text;
    try { return JSON.parse(t); } catch { throw Object.assign(err('invalid_json'), { text: t }); }
  };
  sample.limits = async () => ({ images: false });
  const caps = { db, user, downloads, sample };
  window.claude = { use: name => new Promise(res => setTimeout(() => res(caps[name] || null), 5)) };
  window.__mockStore = store;
})();
