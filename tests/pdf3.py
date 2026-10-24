"""Vector PDF: real text in embedded fonts. Checks the fonts in the file, the text a PDF
reader extracts, and how closely poppler's rendering matches the page on screen."""
import asyncio, sys, base64, io, math, subprocess, json
sys.path.insert(0, 'tests')
from harness import *
from PIL import Image, ImageChops

DOC = r"""
<h1>Office Letter Test</h1>
<p>Dear Sir/Madam, this paragraph is set in <b>Calibri</b> with <i>italic</i>, <u>underlined words</u>, <s>struck text</s>, x<sup>2</sup>, H<sub>2</sub>O and <span style="color:#c00000">red text</span> with <span style="background-color:#fde047">a highlight</span> and <a href="https://example.com/doc">a link</a>. Office efficiency fluffy waffle AVATAR.</p>
<p style="text-align:justify">Justified text runs the full width of the line so both edges line up neatly, which is common in formal letters and reports; this sentence keeps going so that it wraps onto a second and third line of the paragraph.</p>
<p>বাংলা লেখা: গণপ্রজাতন্ত্রী বাংলাদেশ সরকার, মন্ত্রণালয়ের স্মারক নং ২৫.০০.০০০০.০০০.০০.০০০.২৬-১২৩, তারিখ: ১৭ অক্টোবর ২০২৬। বিষয়: কার্যালয়ের বার্ষিক প্রতিবেদন প্রেরণ।</p>
<p style="font-family:'Hind Siliguri', 'Noto Sans Bengali', sans-serif">হিন্দ শিলিগুড়ি: উপর্যুক্ত বিষয়ের প্রেক্ষিতে জানানো যাচ্ছে যে, অর্থবছরের কর্মপরিকল্পনা বাস্তবায়নের অগ্রগতি সংযুক্ত করা হলো।</p>
<p style="font-family:'Tiro Bangla', serif">টিরো বাংলা: শ্রদ্ধেয় মহোদয়, অনুগ্রহপূর্বক র‍্যাব ও কৃষ্ণচূড়া বিষয়ক সিদ্ধান্ত গ্রহণের জন্য নির্দেশক্রমে অনুরোধ করা হলো।</p>
<ul><li>First bullet point</li><li>Second bullet with <b>bold</b></li></ul>
<ol><li>Numbered one</li><li>Numbered two</li></ol>
<table class="tbl-bd" style="width:100%;--bt:1.5pt solid #1d6a50;--bb:1.5pt solid #1d6a50;--bl:0.5pt solid #000000;--br:0.5pt solid #000000;--bh:0.5pt solid #000000;--bv:0.5pt dotted #2f5597"><colgroup><col style="width:30%"><col style="width:40%"><col style="width:30%"></colgroup><tbody>
<tr><td style="background-color:#e2efda"><p><b>Item</b></p></td><td style="background-color:#e2efda"><p><b>বিবরণ</b></p></td><td style="background-color:#e2efda"><p><b>Amount</b></p></td></tr>
<tr><td><p>Paper</p></td><td><p>কাগজ (এ৪)</p></td><td><p style="text-align:right">৳১,২০০</p></td></tr>
<tr><td data-shd="pct20" data-shdc="#000000" data-shdf="auto" style="background-color:#cccccc"><p>Toner</p></td><td><p>টোনার কার্তুজ</p></td><td style="border-bottom:2.25pt double #c00000"><p style="text-align:right">৳৩,৫০০</p></td></tr>
</tbody></table>
<p style="font-family:'Times New Roman', Tinos, serif;font-size:14pt">Times New Roman at 14 points: The quick brown fox jumps over the lazy dog.</p>
<p style="font-family:Arial, Arimo, sans-serif">Arial: Sincerely, <b>The Administration</b> — Dhaka-1000, info@example.gov.bd</p>
"""

async def main():
    async with async_playwright() as p:
        b, page, errors = await new_page(p, width=1400, height=1500, gfonts=True)
        await load(page)
        await page.evaluate("(html) => __Q.openDoc(__Q.newDocModel({ title: 'Vector test', html }))", DOC)
        await page.wait_for_timeout(800)
        await page.evaluate("""async () => {
          document.getElementById('editor').spellcheck = false;
          document.querySelectorAll('#editor [data-shd]').forEach(el => __Q.decoSync(el));
          const cv = document.createElement('canvas'); cv.width = 240; cv.height = 120; const x = cv.getContext('2d');
          const gr = x.createLinearGradient(0, 0, 240, 120); gr.addColorStop(0, '#2f5597'); gr.addColorStop(1, '#f2c14e'); x.fillStyle = gr; x.fillRect(0, 0, 240, 120);
          const p = document.createElement('p'); p.innerHTML = `<img src="${cv.toDataURL('image/png')}" style="width:160px"> A picture in line.`;
          document.getElementById('editor').appendChild(p);
          const d = __Q.S.doc; d.header = { l: 'Folio', c: '', r: 'Page {PAGE}' }; d.footer = { l: '{TITLE}', c: '', r: '' };
          __Q.setWatermark({ text: 'DRAFT', color: '#c0c0c0', opacity: 0.4 });
          __Q.setZoom(1); __Q.renderSheets(); __Q.Layout.full();
          getSelection().removeAllRanges(); document.activeElement && document.activeElement.blur();
          __Q.Prefs.gridlines = false; __Q.applyGridlines();
          await document.fonts.ready;
        }""")
        await page.wait_for_timeout(800)
        fams = await page.evaluate("() => Array.from(document.fonts).filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight + ' ' + f.style)")
        print('loaded faces:', sorted(set(fams)))
        r = await page.evaluate("""async () => { const t0 = performance.now(); const blob = await __Q.buildVectorPdf({ title: 'Vector test', author: 'Tester', lang: 'en-US' });
          const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
          return { b64: btoa(s), size: u.length, ms: performance.now() - t0, stats: blob.stats, pages: __Q.S.pages }; }""")
        open('shots/v1.pdf', 'wb').write(base64.b64decode(r['b64']))
        print(f"PDF {r['size']/1024:.0f} KB, {r['ms']:.0f} ms, pages {r['pages']}, stats {r['stats']}")
        print(subprocess.run(['pdffonts', 'shots/v1.pdf'], capture_output=True, text=True).stdout)
        q = subprocess.run(['qpdf', '--check', 'shots/v1.pdf'], capture_output=True, text=True)
        print('qpdf:', q.stdout.strip().splitlines()[-1] if q.stdout else q.stderr[:300])
        txt = subprocess.run(['pdftotext', '-layout', 'shots/v1.pdf', '-'], capture_output=True, text=True).stdout
        for want in ['Dear Sir/Madam', 'Office efficiency fluffy', 'গণপ্রজাতন্ত্রী বাংলাদেশ সরকার', 'স্মারক', 'র‍্যাব', 'কৃষ্ণচূড়া', 'বিবরণ', '৳৩,৫০০', 'Times New Roman at 14 points', 'info@example.gov.bd']:
            print(('OK  ' if want in txt else 'MISS'), want)
        open('shots/v1.txt', 'w').write(txt)
        # pixel comparison of page 1 against the screen
        info = await page.evaluate("() => { const sh = document.querySelectorAll('#sheets .sheet')[0]; sh.scrollIntoView({block: 'start'}); const r = sh.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }")
        await page.wait_for_timeout(200)
        info = await page.evaluate("() => { const r = document.querySelectorAll('#sheets .sheet')[0].getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }")
        x0, y0 = round(info['x']), round(info['y'])
        W, H = round(info['w']), min(round(info['h']), 1500 - y0)
        await page.screenshot(path='shots/v1-dom.png', clip={'x': x0, 'y': y0, 'width': W, 'height': H})
        subprocess.run(['pdftoppm', '-r', '96', '-f', '1', '-l', '1', '-png', '-aa', 'yes', '-aaVector', 'yes', 'shots/v1.pdf', 'shots/v1-pdf'], check=True)
        pdf = Image.open('shots/v1-pdf-1.png').convert('RGB').crop((0, 0, W, H))
        dom = Image.open('shots/v1-dom.png').convert('RGB')
        diff = ImageChops.difference(dom, pdf).convert('L')
        px = diff.load(); big = 0; ov = dom.copy(); op = ov.load()
        for y in range(H):
            for x in range(W):
                if px[x, y] > 96: big += 1; op[x, y] = (255, 0, 0)
        ov.save('shots/v1-diff.png')
        print('page 1 differing pixels: %d (%.3f%%)' % (big, 100 * big / (W * H)))
        subprocess.run(['pdftoppm', '-r', '300', '-f', '1', '-l', '1', '-png', 'shots/v1.pdf', 'shots/v1-300'], check=True)
        for e in errors: print('ERR', e)
        await b.close()
asyncio.run(main())
