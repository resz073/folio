"""Vector PDF speed and size on a long document, and the Bangla leave-application template."""
import asyncio, sys, base64, subprocess
sys.path.insert(0, 'tests')
from harness import *
async def main():
    async with async_playwright() as p:
        b, page, errors = await new_page(p, width=1400, height=1000, gfonts=True)
        await load(page)
        for tpl in ['letter', 'leave-bn']:
            await page.evaluate("(t) => __Q.newFromTemplate(t)", tpl)
            await page.wait_for_timeout(800)
            r = await page.evaluate("""async () => { await document.fonts.ready; const t0 = performance.now(); const blob = await __Q.buildVectorPdf({ title: 'T' });
              const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
              return { b64: btoa(s), kb: Math.round(u.length / 1024), ms: Math.round(performance.now() - t0), stats: blob.stats }; }""")
            open(f'shots/vt-{tpl}.pdf', 'wb').write(base64.b64decode(r['b64']))
            print(tpl, r['kb'], 'KB', r['ms'], 'ms', r['stats']['words'], 'words', r['stats']['pictureWords'], 'pictures')
            print(subprocess.run(['pdffonts', f'shots/vt-{tpl}.pdf'], capture_output=True, text=True).stdout)
        await page.evaluate("""() => { __Q.newFromTemplate('blank'); const ed = document.getElementById('editor'); let h = '';
          for (let i = 0; i < 160; i++) h += '<p>Paragraph ' + (i + 1) + '. ' + 'The quick brown fox jumps over the lazy dog while the committee reviews the quarterly budget and the procurement plan for next year. '.repeat(3) + '</p>';
          for (let i = 0; i < 40; i++) h += '<p>অনুচ্ছেদ ' + (i + 1) + '। ' + 'গণপ্রজাতন্ত্রী বাংলাদেশ সরকারের মন্ত্রণালয় কর্তৃক প্রেরিত স্মারকের প্রেক্ষিতে কার্যালয়ের বার্ষিক প্রতিবেদন সংযুক্ত করা হলো। '.repeat(3) + '</p>';
          ed.innerHTML = h; __Q.Layout.full(); }""")
        await page.wait_for_timeout(1500)
        t = await page.evaluate("""async () => { await document.fonts.ready; const t0 = performance.now(); const blob = await __Q.buildVectorPdf({ title: 'Long' }); return { pages: __Q.S.pages, ms: Math.round(performance.now() - t0), kb: Math.round(blob.size / 1024), stats: { words: blob.stats.words, pictures: blob.stats.pictureWords } }; }""")
        print('long doc vector', t)
        for e in errors: print('ERR', e)
        await b.close()
asyncio.run(main())
