"""Shaping check: every word is drawn by the browser (canvas fillText, which shapes with
HarfBuzz) and from our own shaping + glyph outlines; the two pictures must agree."""
import asyncio, sys, base64, json, pathlib
sys.path.insert(0, 'tests')
from harness import *

BN = ('বাংলাদেশ গণপ্রজাতন্ত্রী সরকার মন্ত্রণালয় স্মারক নং তারিখ বিষয় প্রেরক প্রাপক অনুগ্রহপূর্বক কার্যালয় জেলা উপজেলা '
      'নির্বাহী কর্মকর্তা সংযুক্তি সদয় অবগতি জ্ঞাতার্থে ধন্যবাদ শুভেচ্ছা স্বাক্ষর দপ্তর অধিদপ্তর ক্ষমতা সম্মানিত উল্লেখ্য '
      'পরিপ্রেক্ষিতে অর্থবছর বাস্তবায়ন র‍্যাব কৃষ্ণ হৃদয় অঙ্ক ঞ্জ চন্দ্র রাষ্ট্র লক্ষ্মী বিজ্ঞান তত্ত্ব শ্রী কোথায় বৌদ্ধ রং দুঃখ '
      'চাঁদ সৎ উৎসব ১২৩৪৫৬৭৮৯০ ৳৫০০ । কর্মচারী প্রশাসনিক ব্যবস্থা গ্রহণ আবেদন পত্র সূত্র প্রতিবেদন নির্দেশক্রমে মহোদয় '
      'বরাবর জনাব সচিব উপসচিব যুগ্মসচিব অতিরিক্ত পরিচালক মহাপরিচালক প্রকল্প বাজেট অনুমোদন সভা কার্যবিবরণী সিদ্ধান্ত '
      'বাস্তবায়নের অগ্রগতি কর্তৃক প্রদত্ত দায়িত্ব পালন ত্রৈমাসিক ঐতিহ্য ঔষধ কৌশল স্ত্রী দ্ব্যর্থ ক্ত ক্র ক্ল ক্ষ্ণ ঙ্গ চ্ছ জ্জ ঞ্চ '
      'ট্ট ড্ড ণ্ড ত্থ ত্ন দ্দ দ্ধ ন্ত ন্থ ন্দ ন্ধ প্প ব্দ ভ্র ম্প ম্ব ল্ক ল্গ শ্চ ষ্ক ষ্ট ষ্ঠ ষ্প স্ক স্খ স্ট স্ত স্থ স্প স্ফ হ্ন হ্ম হ্ল '
      'আর্দ্র কার্য্য সূর্য সূর্য্য ধৈর্য আর্য পর্ব শর্ত প্রকৃতি ক্রম গ্রাম উৎপাদন ভবিষ্যৎ ড় ঢ় য় য়া কে কৈ কো কৌ কু কূ কৃ রু রূ শু হৃ গু '
      'ক্তু হাঁস অ আ ই ঈ উ ঊ ঋ এ ঐ ও ঔ কিছু আমি তুমি শিক্ষা পরীক্ষা ছাত্র-ছাত্রী ই-মেইল পিডিএফ (বাংলা) “উদ্ধৃতি” '
      'ক্‌ষ পশ্‌চিম ক্‍ষ র্‍য ত্‍ শৃঙ্খলা স্বাস্থ্য প্রাথমিক মাধ্যমিক উচ্চমাধ্যমিক বিশ্ববিদ্যালয় ষষ্ঠ ঙ্ক্ষ '
      'হয়েছে। আমি। a। ।। ২০২৬ 2026। PDF-এ ই-মেইলে ১০:৩০ ৳১,০০০/- (ক) [খ] ক্ষ্ম্য র্ক্ষ্ম কর্ণ র্থ্য র্ত্ম্য দ্ব্য শ্ৰ ৰ ৱ ৺ '
      'কিং রাঁধুনী সাঁতার দুঃসাহস ক্ষুদ্র শুক্রবার বৃহস্পতিবার রবিবার ফেব্রুয়ারি সেপ্টেম্বর অক্টোবর ডিসেম্বর জানুয়ারি').split()
LATIN = ('Office fluffy AVATAR Wave To Ty Yo fi fl ffi ffl Ŧest naïve café café Œuvre ½ — “quotes” '
         '(parens) T.V. 1,234.56 AT&T LTA Kerning: WA Va P. F. r, y. Dear Sir/Madam, Regards, Sincerely '
         'Bangladesh Dhaka-1000 Ref: No. 25.00.0000.000.00.000.26-123 www.example.gov.bd info@example.com').split()

CASES = [
    ('notosansbengali-r.ttf', BN), ('notosansbengali-b.ttf', BN[:60]), ('notoserifbengali-r.ttf', BN),
    ('hindsiliguri-r.ttf', BN + LATIN), ('tirobangla-r.ttf', BN + LATIN[:20]), ('anekbangla-r.ttf', BN[:80]),
    ('balooda2-r.ttf', BN[:80]), ('galada-r.ttf', BN[:80]),
    ('carlito-r.ttf', LATIN), ('carlito-b.ttf', LATIN), ('carlito-i.ttf', LATIN), ('tinos-r.ttf', LATIN), ('arimo-r.ttf', LATIN),
    ('caladea-r.ttf', LATIN), ('gelasio-r.ttf', LATIN), ('ebgaramond-r.ttf', LATIN), ('lato-r.ttf', LATIN),
    ('roboto-r.ttf', LATIN), ('opensans-r.ttf', LATIN), ('montserrat-r.ttf', LATIN), ('merriweather-r.ttf', LATIN),
    ('lora-r.ttf', LATIN), ('ptserif-r.ttf', LATIN), ('sourceserif4-r.ttf', LATIN), ('playfairdisplay-r.ttf', LATIN),
    ('librebaskerville-r.ttf', LATIN), ('inconsolata-r.ttf', LATIN), ('dancingscript-r.ttf', LATIN), ('notosans-r.ttf', LATIN),
    ('questrial-r.ttf', LATIN), ('dejavusans-r.ttf', LATIN), ('cousine-r.ttf', LATIN),
]
LOCAL = [('/usr/share/fonts/truetype/freefont/FreeSerif.ttf', BN), ('/usr/share/fonts/truetype/freefont/FreeSans.ttf', BN)]

JS = r"""
async ({ file, b64, words, family }) => {
  let bytes;
  if (b64) { const bin = atob(b64); bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); }
  else bytes = new Uint8Array(await (await fetch('fonts/' + file)).arrayBuffer());
  const ff = new FontFace(family, bytes.slice().buffer);
  await ff.load(); document.fonts.add(ff);
  const font = new __Q.OTFont(bytes);
  const S = 60, out = [];
  for (const w of words) {
    const m = document.createElement('canvas').getContext('2d');
    m.font = `${S}px "${family}"`;
    const ref = m.measureText(w).width;
    const W = Math.ceil(ref + S * 1.5), H = Math.ceil(S * 2.2), base = Math.round(S * 1.45), ox = Math.round(S * 0.5);
    const a = document.createElement('canvas'); a.width = W; a.height = H;
    const ca = a.getContext('2d'); ca.font = m.font; ca.fillStyle = '#000'; ca.fontKerning = 'normal';
    ca.fillText(w, ox, base);
    const b = document.createElement('canvas'); b.width = W; b.height = H;
    const cb = b.getContext('2d'); cb.fillStyle = '#000';
    const k = S / font.upem;
    let pen = 0, ok = true, glyphs = [];
    for (const r of __Q.scriptRuns(w)) {
      const res = __Q.shapeRun(font, r.text, r.script, {});
      for (const g of res.glyphs) {
        glyphs.push(g.g);
        const p = new Path2D();
        for (const c of font.outline(g.g)) {
          const X = v => ox + (pen + g.xo + v) * k, Y = v => base - (g.yo + v) * k;
          if (c[0] === 'M') p.moveTo(X(c[1]), Y(c[2]));
          else if (c[0] === 'L') p.lineTo(X(c[1]), Y(c[2]));
          else if (c[0] === 'Q') p.quadraticCurveTo(X(c[1]), Y(c[2]), X(c[3]), Y(c[4]));
          else p.closePath();
        }
        cb.fill(p, 'nonzero');
        pen += g.xa;
      }
    }
    const da = ca.getImageData(0, 0, W, H).data, db = cb.getImageData(0, 0, W, H).data;
    let sa = 0, sb = 0, diff = 0;
    for (let i = 3; i < da.length; i += 4) { sa += da[i]; sb += db[i]; diff += Math.abs(da[i] - db[i]); }
    out.push({ w, ref, ours: pen * k, diff: diff / Math.max(1, sa, sb), glyphs: glyphs.join(' ') });
  }
  return out;
}
"""

async def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    async with async_playwright() as p:
        b, page, errors = await new_page(p, width=1200, height=800)
        await load(page)
        total = bad = 0
        report = []
        cases = [(f, w, None) for f, w in CASES] + [(pathlib.Path(f).name, w, base64.b64encode(open(f, 'rb').read()).decode()) for f, w in LOCAL]
        for i, (f, words, b64) in enumerate(cases):
            if only and only not in f: continue
            res = await page.evaluate(JS, {'file': f, 'b64': b64, 'words': words, 'family': f'T{i}'})
            fails = [r for r in res if r['diff'] > 0.05 or abs(r['ref'] - r['ours']) > 0.6]
            total += len(res); bad += len(fails)
            print(f"{f}: {len(res)} words, {len(fails)} differ" + (': ' + ', '.join(f"{r['w']}({r['diff']:.3f},{r['ref']-r['ours']:+.1f})" for r in fails[:12]) if fails else ''))
            report.append({'font': f, 'fails': fails})
        print(f'TOTAL {total} words, {bad} differ')
        json.dump(report, open('shots/shape1.json', 'w'), ensure_ascii=False, indent=1)
        for e in errors: print('ERR', e)
        await b.close()
asyncio.run(main())
