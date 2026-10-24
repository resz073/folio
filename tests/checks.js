// Pagination checker: every line of text must sit inside a page's text area
window.__checkPages = function () {
  const Q = window.__Q, g = Q.geom(), pitch = g.h + Q.GAP, z = Q.S.zoom;
  const ed = document.getElementById('editor');
  const er = ed.getBoundingClientRect();
  const bad = [];
  const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
  const rr = document.createRange();
  let n, lines = 0;
  while ((n = w.nextNode())) {
    if (!n.data.trim()) continue;
    if (n.parentNode.closest('del.tc, .pg-line')) continue;
    rr.selectNodeContents(n);
    for (const r of rr.getClientRects()) {
      if (r.height < 1) continue;
      lines++;
      const top = (r.top - er.top) / z, bot = (r.bottom - er.top) / z;
      const p = Math.floor((top + 1) / pitch);
      const cTop = p * pitch + g.mt - 3, cBot = p * pitch + g.h - g.mb + 2; // text boxes may poke 2px above the line box (negative half-leading is floored)
      if (top < cTop || bot > cBot) bad.push({ text: n.data.slice(0, 30), top: Math.round(top), bot: Math.round(bot), page: p + 1, cTop: Math.round(cTop), cBot: Math.round(cBot) });
    }
  }
  return { pages: Q.S.pages, lines, bad: bad.slice(0, 12), nbad: bad.length };
};
